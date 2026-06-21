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
      <div className="px-2 py-4">
        <p className="text-lg font-bold">🏪 ร้าน Gift</p>
        <p className="text-sm text-muted-foreground">ระบบขาย + สต็อก</p>
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
              "flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-accent"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
