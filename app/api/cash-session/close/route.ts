import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/server/guards";
import { mapRpcError } from "@/lib/errors";
import { closeSession } from "@/lib/server/mock-cash";

/**
 * POST /api/cash-session/close { store_id, user_id, cash_session_id, actual_cash }  (owner only)
 * RPC close_cash_session จะสร้าง notification_logs (event_type='cash_close', pending) ให้เอง
 */
export async function POST(req: Request) {
  let body: {
    store_id?: string;
    user_id?: string;
    cash_session_id?: string;
    actual_cash?: number;
  };
  try {
    body = await req.json();
  } catch {
    return fail("รูปแบบคำขอไม่ถูกต้อง");
  }
  const { store_id, user_id, cash_session_id, actual_cash } = body;
  if (!store_id || !user_id) return fail("ข้อมูลผู้ใช้ไม่ครบ");
  if (!cash_session_id) return fail("ไม่พบกะที่จะปิด");
  if (!(Number(actual_cash) >= 0)) return fail("ยอดเงินที่นับได้ไม่ถูกต้อง");

  if (!isSupabaseConfigured()) {
    const closed = closeSession(store_id, Number(actual_cash));
    if (!closed) return fail("ไม่พบกะที่เปิดอยู่");
    return NextResponse.json({
      ok: true,
      expected_cash: closed.expected_cash,
      actual_cash: closed.actual_cash,
      difference: closed.difference,
      message: "ปิดกะสำเร็จ (โหมดทดลอง)",
    });
  }

  const supabase = createServiceClient();
  const denied = await requireOwner(supabase, store_id, user_id);
  if (denied) return denied;

  const { data, error } = await supabase.rpc("close_cash_session", {
    p_cash_session_id: cash_session_id,
    p_user_id: user_id,
    p_actual_cash: Number(actual_cash),
  });
  if (error) return fail(mapRpcError(error.message));
  return NextResponse.json({ ok: true, ...(data as object) });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
