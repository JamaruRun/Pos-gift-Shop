import type { LineSettings } from "@/lib/types";

// LINE settings ในหน่วยความจำสำหรับโหมดทดลอง (dev เท่านั้น)
const store = new Map<string, LineSettings>();

export function defaultLineSettings(): LineSettings {
  return {
    line_owner_user_id: "",
    line_notify_sale_enabled: true,
    line_notify_void_enabled: true,
    line_notify_cash_close_enabled: true,
  };
}

export function getMockLineSettings(storeId: string): LineSettings {
  return store.get(storeId) ?? defaultLineSettings();
}

export function setMockLineSettings(storeId: string, s: LineSettings): LineSettings {
  store.set(storeId, s);
  return s;
}
