import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { isOwnerInDb } from "@/lib/server/guards";
import type { ProductInput } from "@/lib/types";

/** POST /api/products/create — เพิ่มสินค้าใหม่ (owner เท่านั้น) */
export async function POST(req: Request) {
  let body: ProductInput;
  try {
    body = await req.json();
  } catch {
    return fail("รูปแบบคำขอไม่ถูกต้อง");
  }

  const err = validate(body);
  if (err) return fail(err);

  if (!isSupabaseConfigured()) {
    // โหมดทดลอง: คืนสินค้าใหม่ให้ client เก็บใน state
    return NextResponse.json({
      ok: true,
      product: { ...body, id: `p_${Date.now()}`, is_active: true, is_popular: body.is_popular ?? false },
      message: "เพิ่มสินค้าสำเร็จ (โหมดทดลอง)",
    });
  }

  const supabase = createServiceClient();
  if (!(await isOwnerInDb(supabase, body.store_id, body.user_id))) {
    return fail("เฉพาะเจ้าของร้านเท่านั้น", 403);
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      store_id: body.store_id,
      category_id: body.category_id ?? null,
      name: body.name.trim(),
      unit: body.unit?.trim() || "ชิ้น",
      cost_price: body.cost_price,
      sell_price: body.sell_price,
      stock_qty: body.stock_qty,
      min_stock: body.min_stock,
      is_popular: body.is_popular ?? false,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) return fail("เพิ่มสินค้าไม่สำเร็จ");
  return NextResponse.json({ ok: true, product: data, message: "เพิ่มสินค้าสำเร็จ" });
}

function validate(b: ProductInput): string | null {
  if (!b?.store_id || !b?.user_id) return "ข้อมูลผู้ใช้ไม่ครบ";
  if (!b.name?.trim()) return "กรุณากรอกชื่อสินค้า";
  if (!(b.sell_price >= 0) || !(b.cost_price >= 0)) return "ราคาหรือต้นทุนไม่ถูกต้อง";
  if (!(b.stock_qty >= 0) || !(b.min_stock >= 0)) return "จำนวนสต็อกไม่ถูกต้อง";
  return null;
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
