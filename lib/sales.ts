"use client";

import type { CreateSalePayload, CreateSaleResult } from "./types";

/**
 * ส่งคำขอขาย 1 บิลไปยัง /api/sales/create (ฝั่ง server เรียก RPC create_sale)
 * โยน Error เป็นข้อความไทยถ้าไม่สำเร็จ
 */
export async function submitSale(
  payload: CreateSalePayload
): Promise<CreateSaleResult> {
  const res = await fetch("/api/sales/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
  }
  return json as CreateSaleResult;
}
