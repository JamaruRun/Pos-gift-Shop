"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client ฝั่ง browser
 * คืน null ถ้ายังไม่ตั้งค่า env -> แอปจะ fallback เป็นโหมด MOCK
 * TODO: ตั้งค่า NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ใน .env.local
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR-PROJECT")) {
    return null;
  }
  return createBrowserClient(url, key);
}

/** true เมื่อยังไม่ได้ต่อ Supabase จริง (ใช้ข้อมูล mock) */
export function isMockMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !url || url.includes("YOUR-PROJECT");
}
