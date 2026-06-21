import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/server/guards";
import { mapRpcError } from "@/lib/errors";
import { getOpenSession, openSession } from "@/lib/server/mock-cash";
import type { CashSession } from "@/lib/types";

/** POST /api/cash-session/open { store_id, user_id, opening_cash }  (owner only) */
export async function POST(req: Request) {
  let body: { store_id?: string; user_id?: string; opening_cash?: number };
  try {
    body = await req.json();
  } catch {
    return fail("รูปแบบคำขอไม่ถูกต้อง");
  }
  const { store_id, user_id, opening_cash } = body;
  if (!store_id || !user_id) return fail("ข้อมูลผู้ใช้ไม่ครบ");
  if (!(Number(opening_cash) >= 0)) return fail("เงินทอนตั้งต้นไม่ถูกต้อง");

  if (!isSupabaseConfigured()) {
    if (getOpenSession(store_id)) return fail("มีกะเปิดค้างอยู่ กรุณาปิดก่อน");
    return NextResponse.json({
      ok: true,
      session: openSession(store_id, Number(opening_cash)),
    });
  }

  const supabase = createServiceClient();
  const denied = await requireOwner(supabase, store_id, user_id);
  if (denied) return denied;

  const { data: res, error } = await supabase.rpc("open_cash_session", {
    p_store_id: store_id,
    p_user_id: user_id,
    p_opening_cash: Number(opening_cash),
  });
  if (error) return fail(mapRpcError(error.message));

  // ดึงแถวกะเต็มเพื่อส่งกลับ
  const { data: row } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("id", res.cash_session_id)
    .single();

  return NextResponse.json({ ok: true, session: row as CashSession });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
