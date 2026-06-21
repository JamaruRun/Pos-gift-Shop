import type { CashSession } from "@/lib/types";

/**
 * เก็บสถานะกะเงินสดในหน่วยความจำสำหรับโหมดทดลอง (dev เท่านั้น)
 * หมายเหตุ: state อยู่ใน process เดียว — ใช้ได้กับ next dev; ไม่เหมาะ production/serverless
 * โหมดจริงใช้ตาราง cash_sessions + RPC แทน
 *
 * mock ไม่ได้ติดตามยอดขายเงินสด -> expected_cash = opening_cash
 */
const sessions = new Map<string, CashSession>(); // key = store_id (เฉพาะกะที่เปิดอยู่)

export function getOpenSession(storeId: string): CashSession | null {
  return sessions.get(storeId) ?? null;
}

export function openSession(storeId: string, openingCash: number): CashSession {
  const s: CashSession = {
    id: `cs_${Date.now()}`,
    opening_cash: openingCash,
    expected_cash: openingCash,
    actual_cash: null,
    difference: null,
    status: "open",
    opened_at: new Date().toISOString(),
    closed_at: null,
  };
  sessions.set(storeId, s);
  return s;
}

export function closeSession(
  storeId: string,
  actualCash: number
): CashSession | null {
  const s = sessions.get(storeId);
  if (!s) return null;
  const expected = s.expected_cash ?? s.opening_cash;
  const closed: CashSession = {
    ...s,
    actual_cash: actualCash,
    difference: actualCash - expected,
    status: "closed",
    closed_at: new Date().toISOString(),
  };
  sessions.delete(storeId);
  return closed;
}
