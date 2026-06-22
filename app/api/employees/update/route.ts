import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/server/guards";
import { updateEmployee } from "@/lib/server/mock-employees";
import type { EmployeeInput, UserProfile } from "@/lib/types";

/** POST /api/employees/update  (owner only) — แก้ไข / เปิด-ปิดใช้งาน (ไม่ลบจริง) */
export async function POST(req: Request) {
  let body: EmployeeInput;
  try {
    body = await req.json();
  } catch {
    return fail("รูปแบบคำขอไม่ถูกต้อง");
  }

  if (!body?.id) return fail("ไม่พบรหัสพนักงาน");
  if (!body?.store_id || !body?.user_id) return fail("ข้อมูลผู้ใช้ไม่ครบ");
  if (body.pin && !/^\d{4,}$/.test(body.pin)) {
    return fail("PIN ต้องเป็นตัวเลขอย่างน้อย 4 หลัก");
  }

  if (!isSupabaseConfigured()) {
    const result = updateEmployee(body);
    if ("error" in result) return fail(result.error);
    return NextResponse.json({ ok: true, employee: result, message: "บันทึกพนักงานสำเร็จ (โหมดทดลอง)" });
  }

  const supabase = createServiceClient();
  const denied = await requireOwner(supabase, body.store_id, body.user_id);
  if (denied) return denied;

  const patch: Record<string, unknown> = {};
  if (body.full_name) patch.full_name = body.full_name.trim();
  if (body.role) patch.role_id = body.role === "owner" ? 1 : 2;
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  // TODO (Phase B): hash PIN ก่อนเก็บ
  if (body.pin) patch.pin_hash = body.pin;

  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", body.id)
    .eq("store_id", body.store_id)
    .select("id, store_id, username, full_name, role_id, is_active")
    .single();

  if (error) return fail("บันทึกพนักงานไม่สำเร็จ");

  const employee: UserProfile = {
    ...data,
    role: data.role_id === 1 ? "owner" : "employee",
  };
  return NextResponse.json({ ok: true, employee, message: "บันทึกพนักงานสำเร็จ" });
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
