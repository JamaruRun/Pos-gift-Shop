// ฟังก์ชันจัดรูปแบบตัวเลข/วันที่ (ภาษาไทย, โซนเวลาไทย)

const TZ = "Asia/Bangkok";

export function formatTHB(amount: number | null | undefined): string {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatNumber(n: number | null | undefined): string {
  return new Intl.NumberFormat("th-TH").format(Number(n ?? 0));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

/** วันนี้ในรูปแบบ YYYY-MM-DD ตามเวลาไทย (ใช้กับ input[type=date]) */
export function todayISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA -> YYYY-MM-DD
}

/** แปลงรหัส action เป็นข้อความไทยสำหรับ activity feed */
export function actionLabel(action: string): string {
  const map: Record<string, string> = {
    "login": "เข้าสู่ระบบ",
    "sale.create": "ขายสินค้า",
    "sale.void": "ยกเลิกบิล",
    "cash_session.open": "เปิดกะ",
    "cash_session.close": "ปิดกะ",
    "stock.receive": "รับของเข้า",
    "product.create": "เพิ่มสินค้า",
    "product.update": "แก้ไขสินค้า",
  };
  return map[action] ?? action;
}
