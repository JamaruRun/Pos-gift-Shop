import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { buildLineMessage, type NotificationRow } from "@/lib/line/messages";
import { sendLinePushMessage } from "@/lib/line/client";

/**
 * POST /api/notifications/process
 * Worker ดึง notification_logs ที่ค้าง -> ส่ง LINE -> อัปเดตสถานะ
 * เรียกโดย Vercel Cron (แนบ Authorization: Bearer ${CRON_SECRET})
 *
 * ความปลอดภัย: service_role + LINE token อยู่ server เท่านั้น (ดู docs/line-worker.md §7)
 */

const MAX_RETRY = 5;
const STUCK_MINUTES = 5;
const BACKOFF_BASE_MS = 60_000; // 60s * 2^retry_count

export async function POST(req: Request) {
  // ---- auth: CRON_SECRET ----
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ---- โหมดทดลอง: ไม่มี DB queue ----
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      sent: 0,
      failed: 0,
      note: "mock mode: ไม่มีฐานข้อมูล queue",
    });
  }

  const batchSize = Number(process.env.LINE_NOTIFY_BATCH_SIZE ?? 20);
  const supabase = createServiceClient();
  const ownerUserId = process.env.LINE_OWNER_USER_ID ?? null;

  // ---- 1) กู้แถวค้าง processing > STUCK_MINUTES ----
  await recoverStuck(supabase);

  // ---- 2) ดึงงานที่ถึงกำหนด ----
  const nowIso = new Date().toISOString();
  const { data: due, error: dueErr } = await supabase
    .from("notification_logs")
    .select("id, store_id, event_type, payload, retry_count, status, next_retry_at")
    .in("status", ["pending", "failed"])
    .lt("retry_count", MAX_RETRY)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (dueErr) {
    return NextResponse.json({ ok: false, error: "โหลดคิวไม่สำเร็จ" }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const settingsCache = new Map<string, StoreLineSettings>();

  for (const row of due ?? []) {
    // ---- 3) claim: pending/failed -> processing (กันแย่งกันทำ) ----
    const { data: claimed } = await supabase
      .from("notification_logs")
      .update({ status: "processing", processing_at: new Date().toISOString() })
      .eq("id", row.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();

    if (!claimed) continue; // instance อื่นจองไปแล้ว

    // ---- 3.5) อ่าน settings ของ store + เช็ค flag เปิด/ปิด ----
    const st = await getStoreLineSettings(supabase, row.store_id, settingsCache);
    const enabled =
      row.event_type === "sale"
        ? st.sale
        : row.event_type === "void"
          ? st.void_
          : row.event_type === "cash_close"
            ? st.cash_close
            : true;
    if (!enabled) {
      // ปิดการแจ้งเตือนชนิดนี้ -> ถือว่าจัดการแล้ว ไม่ส่ง ไม่ retry
      await supabase
        .from("notification_logs")
        .update({ status: "sent", sent_at: new Date().toISOString(), error: "skipped (disabled)" })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    // ปลายทาง: settings.line_owner_user_id > env LINE_OWNER_USER_ID
    const to = st.owner_user_id || ownerUserId;

    // ---- 4) build + send ----
    try {
      const message = buildLineMessage(row as NotificationRow);
      await sendLinePushMessage(to, message);
      await supabase
        .from("notification_logs")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", row.id);
      sent++;
    } catch (e) {
      await markFailed(supabase, row.id, row.retry_count, e);
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: (due ?? []).length,
    sent,
    skipped,
    failed,
  });
}

interface StoreLineSettings {
  owner_user_id: string | null;
  sale: boolean;
  void_: boolean;
  cash_close: boolean;
}

// อ่าน LINE settings ต่อ store (มี cache ภายในรอบ) — fallback enabled=true ถ้าไม่มีค่า
async function getStoreLineSettings(
  supabase: ReturnType<typeof createServiceClient>,
  storeId: string,
  cache: Map<string, StoreLineSettings>
): Promise<StoreLineSettings> {
  const cached = cache.get(storeId);
  if (cached) return cached;
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .eq("store_id", storeId)
    .in("key", [
      "line_owner_user_id",
      "line_notify_sale_enabled",
      "line_notify_void_enabled",
      "line_notify_cash_close_enabled",
    ]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const s: StoreLineSettings = {
    owner_user_id: (map.get("line_owner_user_id") || "").trim() || null,
    sale: map.get("line_notify_sale_enabled") !== "false",
    void_: map.get("line_notify_void_enabled") !== "false",
    cash_close: map.get("line_notify_cash_close_enabled") !== "false",
  };
  cache.set(storeId, s);
  return s;
}

// คืนแถว processing ที่ค้างเกิน STUCK_MINUTES -> pending/failed + retry_count++
async function recoverStuck(supabase: ReturnType<typeof createServiceClient>) {
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString();
  const { data: stuck } = await supabase
    .from("notification_logs")
    .select("id, retry_count")
    .eq("status", "processing")
    .lt("processing_at", cutoff);

  for (const r of stuck ?? []) {
    const nextRetry = (r.retry_count ?? 0) + 1;
    await supabase
      .from("notification_logs")
      .update({
        status: nextRetry >= MAX_RETRY ? "failed" : "pending",
        retry_count: nextRetry,
        processing_at: null,
        next_retry_at: null,
        error: "Recovered stuck processing notification",
      })
      .eq("id", r.id);
  }
}

async function markFailed(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  currentRetry: number,
  err: unknown
) {
  const nextRetry = (currentRetry ?? 0) + 1;
  // backoff อิง retry_count ปัจจุบัน: 60s, 120s, 240s, 480s, 960s
  const delay = BACKOFF_BASE_MS * Math.pow(2, currentRetry ?? 0);
  await supabase
    .from("notification_logs")
    .update({
      status: "failed",
      retry_count: nextRetry,
      next_retry_at:
        nextRetry >= MAX_RETRY ? null : new Date(Date.now() + delay).toISOString(),
      processing_at: null,
      error: err instanceof Error ? err.message.slice(0, 300) : "unknown error",
    })
    .eq("id", id);
}
