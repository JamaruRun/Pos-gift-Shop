import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/server/guards";
import { mapRpcError } from "@/lib/errors";
import { mockDashboard } from "@/lib/mock";
import type { DashboardToday } from "@/lib/types";

/**
 * GET /api/dashboard/today?store_id&user_id  (owner only)
 *
 * หมายเหตุสถาปัตยกรรม: view_dashboard_today มี where is_owner() ซึ่งใช้ได้เมื่อมี session (Phase C+)
 * แต่ Phase A/B เรียกด้วย service_role (auth.uid()=null -> is_owner()=false -> view ว่าง)
 * จึงประกอบข้อมูลเทียบเท่าจาก rpc_get_today_summary + count low stock + cash session แทน
 * (เมื่อถึง Phase C เปลี่ยนมา select view ตรงๆ ได้)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("store_id");
  const userId = searchParams.get("user_id");
  if (!storeId || !userId) return fail("ข้อมูลผู้ใช้ไม่ครบ");

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, data: mockDashboard });
  }

  const supabase = createServiceClient();
  const denied = await requireOwner(supabase, storeId, userId);
  if (denied) return denied;

  const { data: summary, error } = await supabase.rpc("rpc_get_today_summary", {
    p_store_id: storeId,
  });
  if (error) return fail(mapRpcError(error.message));

  const { count: lowCount } = await supabase
    .from("view_low_stock_products")
    .select("product_id", { count: "exact", head: true })
    .eq("store_id", storeId);

  const { data: cs } = await supabase
    .from("cash_sessions")
    .select("expected_cash, opening_cash")
    .eq("store_id", storeId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const data: DashboardToday = {
    total_revenue_today: summary.total_revenue ?? 0,
    total_profit_today: summary.total_profit ?? 0,
    current_expected_cash: cs ? (cs.expected_cash ?? cs.opening_cash ?? 0) : 0,
    low_stock_count: lowCount ?? 0,
  };
  return NextResponse.json({ ok: true, data });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
