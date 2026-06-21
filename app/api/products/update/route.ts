import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { isOwnerInDb } from "@/lib/server/guards";
import type { ProductInput } from "@/lib/types";

/**
 * POST /api/products/update — แก้ไขสินค้า / ปิดการขาย (owner เท่านั้น)
 * ปิดการขาย = ส่ง is_active=false (soft delete — ไม่ลบจริง)
 */
export async function POST(req: Request) {
  let body: ProductInput;
  try {
    body = await req.json();
  } catch {
    return fail("รูปแบบคำขอไม่ถูกต้อง");
  }

  if (!body?.id) return fail("ไม่พบรหัสสินค้า");
  if (!body?.store_id || !body?.user_id) return fail("ข้อมูลผู้ใช้ไม่ครบ");

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: true,
      product: body,
      message: "บันทึกสินค้าสำเร็จ (โหมดทดลอง)",
    });
  }

  const supabase = createServiceClient();
  if (!(await isOwnerInDb(supabase, body.store_id, body.user_id))) {
    return fail("เฉพาะเจ้าของร้านเท่านั้น", 403);
  }

  // อัปเดตเฉพาะฟิลด์ที่ส่งมา (รวม is_active สำหรับปิด/เปิดการขาย)
  const patch: Record<string, unknown> = {
    name: body.name?.trim(),
    unit: body.unit?.trim() || "ชิ้น",
    category_id: body.category_id ?? null,
    cost_price: body.cost_price,
    sell_price: body.sell_price,
    min_stock: body.min_stock,
  };
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.is_popular === "boolean") patch.is_popular = body.is_popular;
  // หมายเหตุ: ไม่แก้ stock_qty ที่นี่ — สต็อกเปลี่ยนผ่าน receive_stock/ขายเท่านั้น

  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", body.id)
    .eq("store_id", body.store_id)
    .select("*")
    .single();

  if (error) return fail("บันทึกสินค้าไม่สำเร็จ");
  return NextResponse.json({ ok: true, product: data, message: "บันทึกสินค้าสำเร็จ" });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
