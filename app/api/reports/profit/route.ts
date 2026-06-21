import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/server/guards";
import { mapRpcError } from "@/lib/errors";
import { mockProfitReport } from "@/lib/mock";

/** GET /api/reports/profit?store_id&user_id&start&end  (owner only) */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("store_id");
  const userId = searchParams.get("user_id");
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!storeId || !userId) return fail("ข้อมูลผู้ใช้ไม่ครบ");
  if (!start || !end) return fail("กรุณาเลือกช่วงวันที่");

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, report: mockProfitReport });
  }

  const supabase = createServiceClient();
  const denied = await requireOwner(supabase, storeId, userId);
  if (denied) return denied;

  const { data, error } = await supabase.rpc("rpc_get_profit_report", {
    p_store_id: storeId,
    p_start_date: start,
    p_end_date: end,
  });
  if (error) return fail(mapRpcError(error.message));
  return NextResponse.json({ ok: true, report: data });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
