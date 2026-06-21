"use client";

import type { ReceiveStockPayload } from "./types";

export interface ReceiveStockResult {
  received_count: number;
  message: string;
}

/** รับของเข้า — ส่งไป /api/stock/receive (server เรียก RPC receive_stock) */
export async function receiveStock(
  payload: ReceiveStockPayload
): Promise<ReceiveStockResult> {
  const res = await fetch("/api/stock/receive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error ?? "รับของเข้าไม่สำเร็จ");
  }
  return json as ReceiveStockResult;
}
