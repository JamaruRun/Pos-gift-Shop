"use client";

import { useAuth } from "./auth-context";

/** ทางลัดอ่านผู้ใช้ปัจจุบัน + ธง isOwner (อิง AuthProvider) */
export function useUser() {
  const { user, loading } = useAuth();
  return { user, loading, isOwner: user?.role === "owner" };
}
