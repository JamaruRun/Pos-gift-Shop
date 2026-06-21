// แปลงรหัส error จาก RPC (เช่น 'INSUFFICIENT_STOCK: ...') เป็นข้อความภาษาไทย
// ใช้ได้ทั้งฝั่ง server (route handler) และ client

const RPC_ERROR_MAP: Record<string, string> = {
  INSUFFICIENT_STOCK: "สินค้าคงเหลือไม่พอ",
  INSUFFICIENT_PAYMENT: "เงินที่รับมาไม่พอ",
  NO_ACTIVE_CASH_SESSION: "ยังไม่ได้เปิดกะเงินสด",
  NO_OPEN_CASH_SESSION: "ยังไม่ได้เปิดกะเงินสด",
  INVALID_PAYMENT: "ข้อมูลการชำระเงินไม่ถูกต้อง",
  INVALID_PAYMENT_METHOD: "ข้อมูลการชำระเงินไม่ถูกต้อง",
  AUTH_MISMATCH: "สิทธิ์ผู้ใช้ไม่ถูกต้อง",
  USER_INACTIVE: "บัญชีผู้ใช้ถูกปิดใช้งาน",
  USER_STORE_MISMATCH: "สิทธิ์ผู้ใช้ไม่ถูกต้อง",
  PRODUCT_NOT_FOUND: "ไม่พบสินค้า",
  PRODUCT_INACTIVE: "สินค้านี้ถูกปิดการขาย",
  PRODUCT_STORE_MISMATCH: "ไม่พบสินค้าในร้านนี้",
  NO_ITEMS: "ไม่มีสินค้าในตะกร้า",
  INVALID_QTY: "จำนวนสินค้าไม่ถูกต้อง",
};

const FALLBACK = "เกิดข้อผิดพลาด กรุณาลองใหม่";

/** รับ message ดิบจาก RPC แล้วคืนข้อความไทย (อิงรหัสก่อน ':') */
export function mapRpcError(raw: string | null | undefined): string {
  if (!raw) return FALLBACK;
  const code = raw.split(":")[0].trim();
  return RPC_ERROR_MAP[code] ?? FALLBACK;
}
