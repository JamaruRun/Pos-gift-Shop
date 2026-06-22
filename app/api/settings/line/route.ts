import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/server/guards";
import { getMockLineSettings, setMockLineSettings } from "@/lib/server/mock-settings";
import type { LineSettings } from "@/lib/types";

const KEYS = [
  "line_owner_user_id",
  "line_notify_sale_enabled",
  "line_notify_void_enabled",
  "line_notify_cash_close_enabled",
] as const;

// GET /api/settings/line?store_id&user_id  (owner only)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("store_id");
  const userId = searchParams.get("user_id");
  if (!storeId || !userId) return fail("ข้อมูลผู้ใช้ไม่ครบ");

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, settings: getMockLineSettings(storeId) });
  }

  const supabase = createServiceClient();
  const denied = await requireOwner(supabase, storeId, userId);
  if (denied) return denied;

  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .eq("store_id", storeId)
    .in("key", KEYS as unknown as string[]);
  if (error) return fail("โหลดการตั้งค่าไม่สำเร็จ");

  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const settings: LineSettings = {
    line_owner_user_id: map.get("line_owner_user_id") ?? "",
    line_notify_sale_enabled: map.get("line_notify_sale_enabled") !== "false",
    line_notify_void_enabled: map.get("line_notify_void_enabled") !== "false",
    line_notify_cash_close_enabled: map.get("line_notify_cash_close_enabled") !== "false",
  };
  return NextResponse.json({ ok: true, settings });
}

// POST /api/settings/line  (owner only)
export async function POST(req: Request) {
  let body: LineSettings & { store_id?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return fail("รูปแบบคำขอไม่ถูกต้อง");
  }
  const { store_id, user_id } = body;
  if (!store_id || !user_id) return fail("ข้อมูลผู้ใช้ไม่ครบ");

  const settings: LineSettings = {
    line_owner_user_id: (body.line_owner_user_id ?? "").trim(),
    line_notify_sale_enabled: !!body.line_notify_sale_enabled,
    line_notify_void_enabled: !!body.line_notify_void_enabled,
    line_notify_cash_close_enabled: !!body.line_notify_cash_close_enabled,
  };

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: true,
      settings: setMockLineSettings(store_id, settings),
      message: "บันทึกการตั้งค่าสำเร็จ (โหมดทดลอง)",
    });
  }

  const supabase = createServiceClient();
  const denied = await requireOwner(supabase, store_id, user_id);
  if (denied) return denied;

  const rows = [
    { store_id, key: "line_owner_user_id", value: settings.line_owner_user_id },
    { store_id, key: "line_notify_sale_enabled", value: String(settings.line_notify_sale_enabled) },
    { store_id, key: "line_notify_void_enabled", value: String(settings.line_notify_void_enabled) },
    { store_id, key: "line_notify_cash_close_enabled", value: String(settings.line_notify_cash_close_enabled) },
  ];
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "store_id,key" });
  if (error) return fail("บันทึกการตั้งค่าไม่สำเร็จ");

  return NextResponse.json({ ok: true, settings, message: "บันทึกการตั้งค่าสำเร็จ" });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
