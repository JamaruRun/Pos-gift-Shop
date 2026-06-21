import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { mapRpcError } from "@/lib/errors";
import { mockProducts } from "@/lib/mock";
import type { CreateSalePayload } from "@/lib/types";

/**
 * POST /api/sales/create — สะพานฝั่ง server เรียก RPC create_sale อย่างปลอดภัย
 *
 * ทำไมต้องผ่าน server:
 *  - ไม่ให้ client เรียก RPC ตรง (กันปลอม p_user_id / ราคา)
 *  - ราคา/ต้นทุนคำนวณใน DB (RPC) ไม่เชื่อ client
 *
 * Phase ปัจจุบัน (A/B): เรียก RPC ด้วย service_role (auth.uid()=null -> guard ข้าม)
 *   เมื่อถึง Phase C/D ค่อยเปลี่ยนเป็น client ที่ผูก session ผู้ใช้ (ดู docs/auth-migration-plan.md)
 */
export async function POST(req: Request) {
  let body: CreateSalePayload;
  try {
    body = await req.json();
  } catch {
    return fail("รูปแบบคำขอไม่ถูกต้อง");
  }

  const { store_id, user_id, payment_method, paid_amount, items } = body;

  // ---- validate ฝั่ง server ----
  if (!store_id || !user_id) return fail("ข้อมูลผู้ใช้ไม่ครบ");
  if (!Array.isArray(items) || items.length === 0) return fail("ไม่มีสินค้าในตะกร้า");
  if (payment_method !== "cash" && payment_method !== "promptpay") {
    return fail("ข้อมูลการชำระเงินไม่ถูกต้อง");
  }
  if (items.some((i) => !i.product_id || !(i.qty > 0))) {
    return fail("จำนวนสินค้าไม่ถูกต้อง");
  }

  // ---- โหมดทดลอง (ยังไม่ตั้งค่า Supabase) ----
  if (!isSupabaseConfigured()) {
    return simulateSale(body);
  }

  // ---- โหมดจริง: เรียก RPC create_sale ----
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("create_sale", {
    p_store_id: store_id,
    p_user_id: user_id,
    p_payment_method: payment_method,
    p_paid_amount: paid_amount,
    p_items: items, // [{ product_id, qty }]
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: mapRpcError(error.message) },
      { status: 400 }
    );
  }
  // RPC คืน { success, sale_id, total_amount, change_amount, message }
  return NextResponse.json({ ok: true, ...(data as object) });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * จำลองการขายในโหมดทดลอง — คำนวณ total จาก mockProducts (เลียนแบบ RPC ฝั่ง DB)
 * โครงเดียวกับโหมดจริง เพื่อให้สลับไป RPC ได้ทันที
 */
function simulateSale(body: CreateSalePayload) {
  let total = 0;
  for (const it of body.items) {
    const p = mockProducts.find((x) => x.id === it.product_id);
    if (!p) return fail("ไม่พบสินค้า");
    if (p.stock_qty < it.qty) {
      return NextResponse.json(
        { ok: false, error: mapRpcError(`INSUFFICIENT_STOCK: ${p.name}`) },
        { status: 400 }
      );
    }
    total += p.sell_price * it.qty;
  }

  const paid = body.payment_method === "cash" ? Number(body.paid_amount || 0) : total;
  if (body.payment_method === "cash" && paid < total) {
    return NextResponse.json(
      { ok: false, error: mapRpcError("INSUFFICIENT_PAYMENT") },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    success: true,
    sale_id: `mock-${Date.now()}`,
    total_amount: total,
    change_amount: Math.max(paid - total, 0),
    message: "บันทึกการขายสำเร็จ (โหมดทดลอง)",
  });
}
