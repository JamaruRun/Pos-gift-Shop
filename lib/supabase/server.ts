import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Supabase client ฝั่ง server (Route Handler / Server Action / Server Component)
 * ใช้ session ของผู้ใช้ผ่าน cookie -> RLS + auth.uid() ทำงานถูกต้อง
 * TODO: ตั้งค่า env ก่อนใช้งานจริง
 */
/** true เมื่อ env Supabase ถูกตั้งค่าจริง (ใช้ฝั่ง server เพื่อสลับ mock/real) */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && !url.includes("YOUR-PROJECT");
}

export function createClient() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // เรียกจาก Server Component — ข้ามได้ (middleware จะ refresh session)
        }
      },
    },
  });
}

/**
 * Service-role client — สำหรับ worker / งานที่ต้องข้าม RLS (เช่น ส่ง LINE)
 * ใช้ฝั่ง server เท่านั้น ห้าม import ในไฟล์ที่ส่งขึ้น client
 * TODO: ตั้งค่า SUPABASE_SERVICE_ROLE_KEY
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServerClient(url, serviceKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
