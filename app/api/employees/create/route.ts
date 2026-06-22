import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/server/guards";
import { createEmployee } from "@/lib/server/mock-employees";
import type { EmployeeInput, UserProfile } from "@/lib/types";

/** POST /api/employees/create  (owner only) */
export async function POST(req: Request) {
  let body: EmployeeInput;
  try {
    body = await req.json();
  } catch {
    return fail("รูปแบบคำขอไม่ถูกต้อง");
  }

  const err = validateCreate(body);
  if (err) return fail(err);

  if (!isSupabaseConfigured()) {
    const result = createEmployee(body);
    if ("error" in result) return fail(result.error);
    return NextResponse.json({ ok: true, employee: result, message: "เพิ่มพนักงานสำเร็จ (โหมดทดลอง)" });
  }

  const supabase = createServiceClient();
  const denied = await requireOwner(supabase, body.store_id, body.user_id);
  if (denied) return denied;

  const { data, error } = await supabase
    .from("users")
    .insert({
      store_id: body.store_id,
      username: body.username.trim().toLowerCase(),
      full_name: body.full_name.trim(),
      role_id: body.role === "owner" ? 1 : 2,
      // TODO (Phase B): hash PIN ด้วย bcrypt/crypt — ตอนนี้เก็บชั่วคราว (login ยังเป็น mock)
      pin_hash: body.pin,
      is_active: true,
    })
    .select("id, store_id, username, full_name, role_id, is_active")
    .single();

  if (error) {
    if (error.code === "23505") return fail("ชื่อผู้ใช้นี้ถูกใช้แล้ว");
    return fail("เพิ่มพนักงานไม่สำเร็จ");
  }

  const employee: UserProfile = {
    ...data,
    role: data.role_id === 1 ? "owner" : "employee",
  };
  return NextResponse.json({ ok: true, employee, message: "เพิ่มพนักงานสำเร็จ" });
}

function validateCreate(b: EmployeeInput): string | null {
  if (!b?.store_id || !b?.user_id) return "ข้อมูลผู้ใช้ไม่ครบ";
  if (!b.full_name?.trim()) return "กรุณากรอกชื่อ-นามสกุล";
  if (!b.username?.trim()) return "กรุณากรอกชื่อผู้ใช้";
  if (!b.pin || !/^\d{4,}$/.test(b.pin)) return "PIN ต้องเป็นตัวเลขอย่างน้อย 4 หลัก";
  if (b.role !== "owner" && b.role !== "employee") return "บทบาทไม่ถูกต้อง";
  return null;
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
