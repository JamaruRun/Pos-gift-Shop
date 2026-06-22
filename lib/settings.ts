"use client";

import type { LineSettings } from "./types";

export async function getLineSettings(
  storeId: string,
  userId: string
): Promise<LineSettings> {
  const res = await fetch(
    `/api/settings/line?store_id=${storeId}&user_id=${userId}`,
    { cache: "no-store" }
  );
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "โหลดการตั้งค่าไม่สำเร็จ");
  return json.settings as LineSettings;
}

export async function saveLineSettings(
  storeId: string,
  userId: string,
  settings: LineSettings
): Promise<LineSettings> {
  const res = await fetch("/api/settings/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ store_id: storeId, user_id: userId, ...settings }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "บันทึกไม่สำเร็จ");
  return json.settings as LineSettings;
}

export async function sendTestLine(
  storeId: string,
  userId: string,
  lineOwnerUserId: string
): Promise<{ message: string }> {
  const res = await fetch("/api/settings/line/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      store_id: storeId,
      user_id: userId,
      line_owner_user_id: lineOwnerUserId,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "ส่งข้อความทดสอบไม่สำเร็จ");
  return json as { message: string };
}
