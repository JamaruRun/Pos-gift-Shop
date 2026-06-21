import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { isOwnerInDb } from "@/lib/server/guards";
import { mockProducts } from "@/lib/mock";
import { mapRpcError } from "@/lib/errors";
import type { ReceiveStockPayload } from "@/lib/types";

/**
 * POST /api/stock/receive — รับของเข้า (เพิ่มสต็อก) ผ่าน RPC receive_stock
 * owner เท่านั้น (default) — RPC enforce ซ้ำในโหมดจริง
 */
export async function POST(req: Request) {
  let body: ReceiveStockPayload;
  try {
    body = await req.json();
  } catch {
    return fail("รูปแบบคำขอไม่ถูกต้อง");
  }

  const { store_id, user_id, items } = body;
  if (!store_id || !user_id) return fail("ข้อมูลผู้ใช้ไม่ครบ");
  if (!Array.isArray(items) || items.length === 0) return fail("ไม่มีรายการรับของ");
  if (items.some((i) => !i.product_id || !(i.qty > 0))) return fail("จำนวนรับเข้าไม่ถูกต้อง");

  if (!isSupabaseConfigured()) {
    // โหมดทดลอง: ตรวจว่าสินค้ามีจริง แล้วตอบสำเร็จ (client อัปเดตสต็อกในจอ)
    for (const it of items) {
      if (!mockProducts.find((p) => p.id === it.product_id)) return fail("ไม่พบสินค้า");
    }
    return NextResponse.json({
      ok: true,
      received_count: items.length,
      message: `รับของเข้าสำเร็จ ${items.length} รายการ (โหมดทดลอง)`,
    });
  }

  const supabase = createServiceClient();
  if (!(await isOwnerInDb(supabase, store_id, user_id))) {
    return fail("เฉพาะเจ้าของร้านเท่านั้น", 403);
  }

  const { data, error } = await supabase.rpc("receive_stock", {
    p_store_id: store_id,
    p_user_id: user_id,
    p_items: items, // [{ product_id, qty, cost_price? }]
  });

  if (error) {
    return NextResponse.json({ ok: false, error: mapRpcError(error.message) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...(data as object) });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
