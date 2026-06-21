import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ตรวจว่า user เป็นเจ้าของร้านนี้จริง (อ่าน role_id จากตาราง users)
 * ใช้ฝั่ง server ก่อนทำ mutation ที่เป็น owner-only
 *
 * หมายเหตุ Phase A/B: เรียกด้วย service_role จึงต้อง guard เองตรงนี้
 *   Phase C/D เมื่อมี auth.uid() แล้ว RLS/RPC จะ enforce ซ้ำอีกชั้น (defense-in-depth)
 */
export async function isOwnerInDb(
  supabase: SupabaseClient,
  storeId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("users")
    .select("role_id, store_id, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.store_id === storeId && data.is_active === true && data.role_id === 1;
}

/**
 * คืน NextResponse 403 ถ้าไม่ใช่ owner, หรือ null ถ้าผ่าน
 * ใช้ใน route owner-only: `const denied = await requireOwner(...); if (denied) return denied;`
 */
export async function requireOwner(
  supabase: SupabaseClient,
  storeId: string,
  userId: string
): Promise<NextResponse | null> {
  const ok = await isOwnerInDb(supabase, storeId, userId);
  return ok
    ? null
    : NextResponse.json({ ok: false, error: "เฉพาะเจ้าของร้านเท่านั้น" }, { status: 403 });
}
