"use client";

import type { EmployeeInput, UserProfile } from "./types";

export async function fetchEmployees(
  storeId: string,
  userId: string
): Promise<UserProfile[]> {
  const res = await fetch(
    `/api/employees?store_id=${storeId}&user_id=${userId}`,
    { cache: "no-store" }
  );
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "โหลดรายชื่อพนักงานไม่สำเร็จ");
  return json.employees as UserProfile[];
}

export async function createEmployee(input: EmployeeInput): Promise<UserProfile> {
  return mutate("/api/employees/create", input);
}

export async function updateEmployee(input: EmployeeInput): Promise<UserProfile> {
  return mutate("/api/employees/update", input);
}

async function mutate(url: string, input: EmployeeInput): Promise<UserProfile> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "บันทึกไม่สำเร็จ");
  return json.employee as UserProfile;
}
