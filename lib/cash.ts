"use client";

import type { CashSession } from "./types";

export interface CloseSessionResult {
  expected_cash: number;
  actual_cash: number;
  difference: number;
  message: string;
}

/** กะที่เปิดอยู่ของร้าน (null ถ้าไม่มี) */
export async function getCurrentSession(
  storeId: string
): Promise<CashSession | null> {
  const res = await fetch(`/api/cash-session/current?store_id=${storeId}`, {
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "โหลดข้อมูลกะไม่สำเร็จ");
  return json.session as CashSession | null;
}

export async function openCashSession(
  storeId: string,
  userId: string,
  openingCash: number
): Promise<CashSession> {
  const res = await fetch("/api/cash-session/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ store_id: storeId, user_id: userId, opening_cash: openingCash }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "เปิดกะไม่สำเร็จ");
  return json.session as CashSession;
}

export async function closeCashSession(
  storeId: string,
  userId: string,
  cashSessionId: string,
  actualCash: number
): Promise<CloseSessionResult> {
  const res = await fetch("/api/cash-session/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      store_id: storeId,
      user_id: userId,
      cash_session_id: cashSessionId,
      actual_cash: actualCash,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "ปิดกะไม่สำเร็จ");
  return json as CloseSessionResult;
}
