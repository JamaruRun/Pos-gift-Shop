import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/server/guards";
import { mapRpcError } from "@/lib/errors";
import { mockTodaySummary } from "@/lib/mock";

/** GET /api/reports/today-summary?store_id&user_id  (owner only) */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("store_id");
  const userId = searchParams.get("user_id");
  if (!storeId || !userId) return fail("ข้อมูลผู้ใช้ไม่ครบ");

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, summary: mockTodaySummary });
  }

  const supabase = createServiceClient();
  const denied = await requireOwner(supabase, storeId, userId);
  if (denied) return denied;

  const { data, error } = await supabase.rpc("rpc_get_today_summary", {
    p_store_id: storeId,
  });
  if (error) return fail(mapRpcError(error.message));
  return NextResponse.json({ ok: true, summary: data });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
