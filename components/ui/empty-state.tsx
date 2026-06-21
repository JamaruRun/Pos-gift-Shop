import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title = "ยังไม่มีข้อมูล",
  description,
  icon,
  className,
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center text-muted-foreground",
        className
      )}
    >
      {icon ?? <Inbox className="h-10 w-10 opacity-40" />}
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="text-sm">{description}</p>}
    </div>
  );
}
