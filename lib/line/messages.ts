import { formatTHB, formatDateTime } from "@/lib/format";

// สร้างข้อความ LINE จาก notification_logs.payload (server-side)
// รองรับ event_type: sale | void | cash_close

export type NotifEvent = "sale" | "void" | "cash_close";

export interface NotificationRow {
  id: string;
  event_type: NotifEvent | string;
  payload: Record<string, unknown> | null;
  retry_count: number;
}

interface SalePayload {
  employee_name: string;
  total_amount: number;
  payment_method: string;
  created_at: string;
  sale_items: { product_name: string; qty: number; subtotal: number }[];
}
interface VoidPayload {
  employee_name: string;
  total_amount: number;
  void_reason: string;
  created_at: string;
}
interface CashClosePayload {
  expected_cash: number;
  actual_cash: number;
  difference: number;
  closed_at: string;
}

function paymentLabel(m: string): string {
  return m === "cash" ? "เงินสด" : m === "promptpay" ? "พร้อมเพย์" : m;
}

export function buildLineMessage(log: NotificationRow): string {
  if (!log.payload) throw new Error("payload ว่าง — สร้างข้อความไม่ได้");
  switch (log.event_type) {
    case "sale":
      return buildSale(log.payload as unknown as SalePayload);
    case "void":
      return buildVoid(log.payload as unknown as VoidPayload);
    case "cash_close":
      return buildCashClose(log.payload as unknown as CashClosePayload);
    default:
      return "แจ้งเตือนจากระบบร้าน";
  }
}

function buildSale(p: SalePayload): string {
  const items = (p.sale_items ?? [])
    .map((i) => `- ${i.product_name} x${i.qty} = ${formatTHB(i.subtotal)}`)
    .join("\n");
  return [
    "🛒 มีการขายสินค้าใหม่",
    `พนักงาน: ${p.employee_name}`,
    `ยอดขาย: ${formatTHB(p.total_amount)}`,
    `วิธีจ่าย: ${paymentLabel(p.payment_method)}`,
    "",
    "สินค้า:",
    items || "-",
    "",
    `เวลา: ${formatDateTime(p.created_at)}`,
  ].join("\n");
}

function buildVoid(p: VoidPayload): string {
  return [
    "⚠️ มีการยกเลิกบิล",
    `ผู้ดำเนินการ: ${p.employee_name}`,
    `ยอดบิล: ${formatTHB(p.total_amount)}`,
    `เหตุผล: ${p.void_reason}`,
    "",
    `เวลา: ${formatDateTime(p.created_at)}`,
  ].join("\n");
}

function buildCashClose(p: CashClosePayload): string {
  const diffMark =
    p.difference === 0 ? "🟢 ตรง" : p.difference < 0 ? "🔴 เงินขาด" : "🔴 เงินเกิน";
  return [
    "📊 สรุปปิดกะ",
    `เงินที่ควรมี: ${formatTHB(p.expected_cash)}`,
    `เงินที่นับได้: ${formatTHB(p.actual_cash)}`,
    `ส่วนต่าง: ${formatTHB(p.difference)} ${diffMark}`,
    "",
    `เวลา: ${formatDateTime(p.closed_at)}`,
  ].join("\n");
}
