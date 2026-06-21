import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { mockProducts } from "@/lib/mock";
import type { Product } from "@/lib/types";

/**
 * GET /api/products?role=owner|employee
 * คืนรายการสินค้า active — พนักงานจะไม่ได้รับ cost_price
 *
 * โหมดจริง:
 *   - owner    -> select จากตาราง products (มี cost_price)
 *   - employee -> select จาก view products_employee (ไม่มี cost_price)
 *   (สอดคล้องกับ docs/schema.sql + reporting.sql)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role") ?? "owner";
  const isEmployee = role === "employee";

  if (!isSupabaseConfigured()) {
    const list = mockProducts
      .filter((p) => p.is_active)
      .map((p) => (isEmployee ? stripCost(p) : p));
    return NextResponse.json({ ok: true, products: list });
  }

  const supabase = createServiceClient();
  const from = isEmployee ? "products_employee" : "products";
  const { data, error } = await supabase
    .from(from)
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ ok: false, error: "โหลดรายการสินค้าไม่สำเร็จ" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, products: data ?? [] });
}

function stripCost(p: Product): Product {
  const { cost_price: _omit, ...rest } = p;
  return rest as Product;
}
