"use client";

import { AuthProvider } from "@/lib/auth-context";

/** รวม client providers ทั้งหมดไว้ที่เดียว (ครอบใน root layout) */
export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
