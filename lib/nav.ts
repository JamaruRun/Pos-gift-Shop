import type { Role } from "./types";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  History,
  Wallet,
  Users,
  AlertTriangle,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  ownerOnly: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/pos", label: "ขายสินค้า", icon: ShoppingCart, ownerOnly: false },
  { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard, ownerOnly: true },
  { href: "/products", label: "สินค้า", icon: Package, ownerOnly: false },
  { href: "/low-stock", label: "สินค้าใกล้หมด", icon: AlertTriangle, ownerOnly: false },
  { href: "/sales-history", label: "ประวัติการขาย", icon: History, ownerOnly: true },
  { href: "/reports", label: "รายงาน", icon: BarChart3, ownerOnly: true },
  { href: "/cash-session", label: "กะเงินสด", icon: Wallet, ownerOnly: true },
  { href: "/employees", label: "พนักงาน", icon: Users, ownerOnly: true },
];

export function visibleNavItems(role: Role | undefined): NavItem[] {
  if (role === "owner") return NAV_ITEMS;
  return NAV_ITEMS.filter((i) => !i.ownerOnly);
}

/**
 * เช็คว่า role เข้าถึง path นี้ได้ไหม (ใช้คุม route ใน AppShell)
 * พนักงานเข้าได้เฉพาะหน้าที่ไม่ใช่ ownerOnly (POS, สินค้า, สินค้าใกล้หมด)
 * path ที่ไม่อยู่ใน NAV_ITEMS -> อนุญาต (กันบล็อกหน้า nested/อนาคต)
 */
export function canAccessPath(role: Role | undefined, pathname: string): boolean {
  const item = NAV_ITEMS.find(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/")
  );
  if (!item) return true;
  return !item.ownerOnly || role === "owner";
}
