"use client";

import type { Role, UserProfile } from "./types";

/**
 * Auth ฝั่ง client แบบเบา (MVP scaffold)
 * เก็บโปรไฟล์ผู้ใช้ปัจจุบันใน localStorage
 *
 * TODO (เชื่อม backend จริง):
 *  - แทนที่ login() ด้วยการเรียก Supabase Auth หรือ RPC ตรวจ username + PIN (pin_hash)
 *  - ดึง role/store_id จากตาราง users หลังยืนยันตัวตน
 *  - ใช้ Supabase session cookie แทน localStorage เพื่อให้ RLS ฝั่ง server ทำงาน
 */

const STORAGE_KEY = "gpos.currentUser";

const STORE_ID =
  process.env.NEXT_PUBLIC_STORE_ID ?? "00000000-0000-0000-0000-000000000001";

// ผู้ใช้ตัวอย่างสำหรับโหมด MOCK (PIN = 1111 owner, 2222 employee)
const MOCK_USERS: (UserProfile & { pin: string })[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    store_id: STORE_ID,
    username: "gift",
    full_name: "Gift (เจ้าของ)",
    role: "owner",
    role_id: 1,
    is_active: true,
    pin: "1111",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    store_id: STORE_ID,
    username: "somchai",
    full_name: "สมชาย",
    role: "employee",
    role_id: 2,
    is_active: true,
    pin: "2222",
  },
];

export function getCurrentUser(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function isOwner(user: UserProfile | null): boolean {
  return user?.role === "owner";
}

export function hasRole(user: UserProfile | null, role: Role): boolean {
  return user?.role === role;
}

/**
 * login แบบ mock — คืน user ถ้า username+pin ถูก
 *
 * TODO (backend จริง): แทนด้วยการตรวจ PIN ฝั่ง server เพื่อให้ปลอดภัย + ให้ RLS ทำงาน
 *   เช่น Route Handler POST /api/login ที่:
 *     1) เรียก RPC ตรวจ username + pin_hash (bcrypt) คืน profile
 *     2) สร้าง Supabase session (หรือ signed cookie) เพื่อให้ auth.uid() มีค่า
 *   ห้ามตรวจ PIN ฝั่ง client ในโปรดักชัน (PIN ไม่ควรอยู่ใน bundle)
 */
export async function login(
  username: string,
  pin: string
): Promise<UserProfile> {
  const found = MOCK_USERS.find(
    (u) => u.username === username.trim().toLowerCase() && u.pin === pin
  );
  if (!found) {
    throw new Error("ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง");
  }
  if (!found.is_active) {
    throw new Error("บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อเจ้าของร้าน");
  }
  const { pin: _omit, ...profile } = found;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

export function logout(): void {
  localStorage.removeItem(STORAGE_KEY);
}
