"use client";

import { useUser } from "@/lib/use-user";
import { LoadingBlock } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ShieldAlert } from "lucide-react";

/** ห่อหน้าที่เฉพาะเจ้าของเข้าได้ — พนักงานจะเห็นข้อความปฏิเสธ */
export function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { loading, isOwner } = useUser();
  if (loading) return <LoadingBlock />;
  if (!isOwner) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-10 w-10 text-destructive opacity-60" />}
        title="เฉพาะเจ้าของร้านเท่านั้น"
        description="คุณไม่มีสิทธิ์เข้าถึงหน้านี้"
      />
    );
  }
  return <>{children}</>;
}
