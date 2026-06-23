"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { visibleNavItems } from "@/lib/nav";
import type { UserProfile } from "@/lib/types";

export function Sidebar({
  user,
  onNavigate,
}: {
  user: UserProfile;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = visibleNavItems(user.role);

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="mb-2 flex items-center gap-3 px-2 py-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-xl text-primary-foreground shadow-sm">
          🏪
        </div>
        <div>
          <p className="text-base font-bold leading-tight">ร้าน Gift</p>
          <p className="text-xs text-muted-foreground">ระบบขาย + สต็อก</p>
        </div>
      </div>

      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground hover:bg-accent"
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                active ? "bg-white/20" : "bg-muted group-hover:bg-background"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
