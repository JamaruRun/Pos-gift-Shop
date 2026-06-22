// LINE Messaging API client (server-side เท่านั้น — ห้าม import ในไฟล์ client)
// token/userId อ่านจาก env ฝั่ง server, ไม่มี NEXT_PUBLIC_ -> ไม่หลุดขึ้น browser

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export interface SendResult {
  mock: boolean; // true เมื่อ dev + ยังไม่ตั้งค่า LINE -> log แทนการยิงจริง
}

/**
 * ส่ง push message ไปยังเจ้าของร้าน
 * - dev + ไม่มี env -> console.log แล้วถือว่าสำเร็จ (mock)
 * - prod + ไม่มี env -> throw (ให้ระบบ retry/แจ้งเตือน)
 * - ส่งจริงล้มเหลว -> throw พร้อมรหัสสถานะ
 */
export async function sendLinePushMessage(
  userId: string | null | undefined,
  message: string
): Promise<SendResult> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = userId || process.env.LINE_OWNER_USER_ID;

  if (!token || !to) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[LINE mock] →", to ?? "(no userId)", "\n" + message);
      return { mock: true };
    }
    throw new Error("LINE credentials not configured");
  }

  const res = await fetch(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text: message }] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LINE API ${res.status}: ${body.slice(0, 200)}`);
  }
  return { mock: false };
}
