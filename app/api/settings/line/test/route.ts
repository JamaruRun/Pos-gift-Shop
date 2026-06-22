import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/server/guards";
import { sendLinePushMessage } from "@/lib/line/client";

/**
 * POST /api/settings/line/test  (owner only)
 * ส่งข้อความทดสอบ LINE ฝั่ง server
 * ปลายทาง: line_owner_user_id จาก body (ที่กำลังตั้งค่า) > settings > env LINE_OWNER_USER_ID
 */
export async function POST(req: Request) {
  let body: { store_id?: string; user_id?: string; line_owner_user_id?: string };
  try {
    body = await req.json();
  } catch {
    return fail("รูปแบบคำขอไม่ถูกต้อง");
  }
  const { store_id, user_id } = body;
  if (!store_id || !user_id) return fail("ข้อมูลผู้ใช้ไม่ครบ");

  const testMessage =
    "✅ ทดสอบการแจ้งเตือนจากร้าน\nระบบเชื่อมต่อ LINE สำเร็จ";

  // โหมดทดลอง (ไม่มี Supabase) — ยังทดสอบ sender ได้ (dev จะ log แทน)
  let to = (body.line_owner_user_id ?? "").trim() || null;

  if (isSupabaseConfigured()) {
    const supabase = createServiceClient();
    const denied = await requireOwner(supabase, store_id, user_id);
    if (denied) return denied;

    // ถ้า body ไม่ส่ง userId มา ลองอ่านจาก settings
    if (!to) {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("store_id", store_id)
        .eq("key", "line_owner_user_id")
        .maybeSingle();
      to = (data?.value ?? "").trim() || null;
    }
  }
  // fallback env (sendLinePushMessage จะ fallback ให้อยู่แล้วถ้า to ว่าง)

  try {
    const result = await sendLinePushMessage(to, testMessage);
    return NextResponse.json({
      ok: true,
      message: result.mock
        ? "ส่งข้อความทดสอบแล้ว (โหมดทดลอง — ยังไม่ได้ตั้งค่า LINE จริง ดู log ฝั่ง server)"
        : "ส่งข้อความทดสอบสำเร็จ ตรวจ LINE ของเจ้าของ",
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "ส่งข้อความทดสอบไม่สำเร็จ");
  }
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
