import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-muted-foreground", className)} />;
}

/** สถานะกำลังโหลดแบบเต็มพื้นที่ */
export function LoadingBlock({ label = "กำลังโหลด..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
