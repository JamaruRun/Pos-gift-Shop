import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getOpenSession } from "@/lib/server/mock-cash";
import type { CashSession } from "@/lib/types";

/**
 * GET /api/cash-session/current?store_id
 * คืนกะที่เปิดอยู่ของร้าน (หรือ null)
 * เปิดให้ทุก role อ่านได้ — POS (พนักงาน) ต้องเช็คก่อนขายเงินสด
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("store_id");
  if (!storeId) return fail("ข้อมูลร้านไม่ครบ");

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, session: getOpenSession(storeId) });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("store_id", storeId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return fail("โหลดข้อมูลกะไม่สำเร็จ");
  return NextResponse.json({ ok: true, session: (data as CashSession) ?? null });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
