"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, LogOut, MoreHorizontal } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth-context";
import { canAccessPath, visibleNavItems } from "@/lib/nav";
import { isMockMode } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const allowed = !!user && canAccessPath(user.role, pathname);

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

  if (loading || !user || !allowed) {
    return <LoadingBlock label="กำลังตรวจสอบสิทธิ์..." />;
  }

  const navItems = visibleNavItems(user.role);
  // bottom nav: 4 อันแรก + ปุ่ม "เมนู" (ถ้ามีมากกว่า)
  const bottomItems = navItems.slice(0, 4);
  const hasMore = navItems.length > 4;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 border-r bg-card md:block">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <Sidebar user={user} />
        </div>
      </aside>

      {/* Drawer — mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 border-r bg-card shadow-xl">
            <Sidebar user={user} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card/80 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-bold md:hidden">🏪 ร้าน Gift</span>
            {isMockMode() && (
              <span className="hidden rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-[hsl(var(--warning))] sm:inline">
                โหมดทดลอง
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold leading-tight">{user.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {user.role === "owner" ? "เจ้าของร้าน" : "พนักงาน"}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {user.full_name.charAt(0)}
            </div>
            <Button variant="outline" size="icon" onClick={handleLogout} title="ออกจากระบบ">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Content (เผื่อที่ให้ bottom nav บนมือถือ) */}
        <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>
      </div>

      {/* Bottom nav — mobile only */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 flex border-t bg-card/95 backdrop-blur md:hidden">
        {bottomItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "scale-110")} />
              {item.label}
            </Link>
          );
        })}
        {hasMore && (
          <button
            onClick={() => setMobileOpen(true)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted-foreground"
          >
            <MoreHorizontal className="h-5 w-5" />
            เมนู
          </button>
        )}
      </nav>
    </div>
  );
}
