import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/server/guards";
import { listEmployees } from "@/lib/server/mock-employees";
import type { UserProfile } from "@/lib/types";

/** GET /api/employees?store_id&user_id  (owner only) */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("store_id");
  const userId = searchParams.get("user_id");
  if (!storeId || !userId) return fail("ข้อมูลผู้ใช้ไม่ครบ");

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, employees: listEmployees() });
  }

  const supabase = createServiceClient();
  const denied = await requireOwner(supabase, storeId, userId);
  if (denied) return denied;

  const { data, error } = await supabase
    .from("users")
    .select("id, store_id, username, full_name, role_id, is_active")
    .eq("store_id", storeId)
    .order("full_name");

  if (error) return fail("โหลดรายชื่อพนักงานไม่สำเร็จ");

  const employees: UserProfile[] = (data ?? []).map((u) => ({
    ...u,
    role: u.role_id === 1 ? "owner" : "employee",
    last_login_at: null, // ยังไม่ติดตามใน MVP
  }));
  return NextResponse.json({ ok: true, employees });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
