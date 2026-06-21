import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/server/guards";
import { mapRpcError } from "@/lib/errors";
import { mockTopProducts } from "@/lib/mock";

/** GET /api/reports/top-products?store_id&user_id&limit  (owner only — ใช้ใน dashboard) */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("store_id");
  const userId = searchParams.get("user_id");
  const limit = Number(searchParams.get("limit") ?? 5);
  if (!storeId || !userId) return fail("ข้อมูลผู้ใช้ไม่ครบ");

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, products: mockTopProducts.slice(0, limit) });
  }

  const supabase = createServiceClient();
  const denied = await requireOwner(supabase, storeId, userId);
  if (denied) return denied;

  const { data, error } = await supabase.rpc("rpc_get_top_products", {
    p_store_id: storeId,
    p_limit_count: limit,
  });
  if (error) return fail(mapRpcError(error.message));
  return NextResponse.json({ ok: true, products: data ?? [] });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
