"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LoadingBlock } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { OwnerOnly } from "@/components/OwnerOnly";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { formatTHB, formatTime, todayISO } from "@/lib/format";
import { getSalesHistory } from "@/lib/reports";
import type { SaleRow } from "@/lib/types";

export default function SalesHistoryPage() {
  return (
    <OwnerOnly>
      <SalesHistoryContent />
    </OwnerOnly>
  );
}

function SalesHistoryContent() {
  const { user } = useAuth();
  const [date, setDate] = useState(todayISO());
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    getSalesHistory(user.store_id, user.id, date, date)
      .then(setSales)
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [date, user]);

  const dayTotal = sales
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + s.total_amount, 0);

  return (
    <div>
      <PageHeader title="ประวัติการขาย" description="ดูบิลขายย้อนหลังตามวัน" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">เลือกวันที่:</span>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto"
          />
        </div>
        <div className="text-right">
          <span className="text-sm text-muted-foreground">รวมยอดขายวันนี้: </span>
          <span className="text-xl font-bold text-primary">{formatTHB(dayTotal)}</span>
        </div>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <EmptyState title="โหลดข้อมูลไม่สำเร็จ" description={error} />
      ) : sales.length === 0 ? (
        <EmptyState title="ไม่มีรายการขายในวันนี้" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {sales.map((s) => {
                const open = expanded === s.sale_id;
                const voided = s.status === "void";
                return (
                  <li key={s.sale_id}>
                    <button
                      className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-accent/50"
                      onClick={() => setExpanded(open ? null : s.sale_id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          {formatTime(s.sale_datetime)}
                        </span>
                        <span className="font-medium">{s.employee_name}</span>
                        <Badge variant="muted">
                          {s.payment_method === "cash" ? "เงินสด" : "พร้อมเพย์"}
                        </Badge>
                        {voided && <Badge variant="destructive">ยกเลิก</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            voided
                              ? "font-semibold text-muted-foreground line-through"
                              : "font-semibold"
                          }
                        >
                          {formatTHB(s.total_amount)}
                        </span>
                        {open ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                    {open && (
                      <div className="bg-muted/40 px-4 pb-4">
                        <table className="w-full text-sm">
                          <tbody>
                            {s.items.map((it, i) => (
                              <tr key={i}>
                                <td className="py-1">{it.product_name}</td>
                                <td className="py-1 text-center text-muted-foreground">
                                  x{it.qty}
                                </td>
                                <td className="py-1 text-right">{formatTHB(it.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
