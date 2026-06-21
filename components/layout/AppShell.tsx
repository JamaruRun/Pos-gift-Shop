"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth-context";
import { canAccessPath } from "@/lib/nav";
import { isMockMode } from "@/lib/supabase/client";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const allowed = !!user && canAccessPath(user.role, pathname);

  // ป้องกัน route: ยังไม่ล็อกอิน -> /login, role ไม่มีสิทธิ์ -> /pos
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canAccessPath(user.role, pathname)) {
      router.replace("/pos");
    }
  }, [loading, user, pathname, router]);

  function handleLogout() {
    signOut();
    router.replace("/login");
  }

  // ระหว่างตรวจสิทธิ์ / กำลัง redirect -> แสดงตัวโหลด (กันจอกระพริบ)
  if (loading || !user || !allowed) {
    return <LoadingBlock label="กำลังตรวจสอบสิทธิ์..." />;
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 border-r bg-card md:block">
        <Sidebar user={user} />
      </aside>

      {/* Sidebar — mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 border-r bg-card">
            <Sidebar user={user} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex items-center justify-between border-b bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            {isMockMode() && (
              <span className="rounded bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                โหมดทดลอง (ยังไม่ต่อฐานข้อมูล)
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium leading-tight">{user.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {user.role === "owner" ? "เจ้าของร้าน" : "พนักงาน"}
              </p>
            </div>
            <Button variant="outline" size="icon" onClick={handleLogout} title="ออกจากระบบ">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
