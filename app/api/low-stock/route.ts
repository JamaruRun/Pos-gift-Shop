import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { mockLowStock } from "@/lib/mock";

/**
 * GET /api/low-stock?store_id
 * เข้าได้ทั้ง owner และพนักงาน (ไม่ใช่ข้อมูล sensitive) — ไม่ต้องเช็ค owner
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("store_id");
  if (!storeId) return fail("ข้อมูลร้านไม่ครบ");

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, products: mockLowStock });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("view_low_stock_products")
    .select("*")
    .eq("store_id", storeId);

  if (error) return fail("โหลดข้อมูลสินค้าใกล้หมดไม่สำเร็จ");
  return NextResponse.json({ ok: true, products: data ?? [] });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
