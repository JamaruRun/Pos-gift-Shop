import { mockEmployees } from "@/lib/mock";
import type { EmployeeInput, UserProfile } from "@/lib/types";

/**
 * รายชื่อพนักงานในหน่วยความจำสำหรับโหมดทดลอง (dev เท่านั้น)
 * โหมดจริงใช้ตาราง users
 */
let list: UserProfile[] = mockEmployees.map((e) => ({ ...e }));

export function listEmployees(): UserProfile[] {
  return list;
}

export function createEmployee(input: EmployeeInput): UserProfile | { error: string } {
  const username = input.username.trim().toLowerCase();
  if (list.some((e) => e.username === username)) {
    return { error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว" };
  }
  const u: UserProfile = {
    id: `u_${Date.now()}`,
    store_id: input.store_id,
    username,
    full_name: input.full_name.trim(),
    role: input.role,
    role_id: input.role === "owner" ? 1 : 2,
    is_active: true,
    last_login_at: null,
  };
  list = [...list, u];
  return u;
}

export function updateEmployee(input: EmployeeInput): UserProfile | { error: string } {
  const idx = list.findIndex((e) => e.id === input.id);
  if (idx < 0) return { error: "ไม่พบพนักงาน" };
  const role = input.role ?? list[idx].role;
  const updated: UserProfile = {
    ...list[idx],
    full_name: input.full_name?.trim() ?? list[idx].full_name,
    role,
    role_id: role === "owner" ? 1 : 2,
    is_active:
      typeof input.is_active === "boolean" ? input.is_active : list[idx].is_active,
  };
  list[idx] = updated;
  return updated;
}
