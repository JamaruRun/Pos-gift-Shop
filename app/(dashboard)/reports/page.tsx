"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { OwnerOnly } from "@/components/OwnerOnly";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { formatTHB, formatNumber, todayISO } from "@/lib/format";
import { getTodaySummary, getProfitReport } from "@/lib/reports";
import type { ProfitReport, TodaySummary } from "@/lib/types";

export default function ReportsPage() {
  return (
    <OwnerOnly>
      <ReportsContent />
    </OwnerOnly>
  );
}

function firstOfMonthISO(): string {
  const today = todayISO(); // YYYY-MM-DD
  return `${today.slice(0, 8)}01`;
}

function ReportsContent() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const [start, setStart] = useState(firstOfMonthISO());
  const [end, setEnd] = useState(todayISO());
  const [profit, setProfit] = useState<ProfitReport | null>(null);
  const [loadingProfit, setLoadingProfit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // สรุปวันนี้
  useEffect(() => {
    if (!user) return;
    getTodaySummary(user.store_id, user.id)
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoadingSummary(false));
  }, [user]);

  async function loadProfit() {
    if (!user) return;
    setLoadingProfit(true);
    setError(null);
    try {
      setProfit(await getProfitReport(user.store_id, user.id, start, end));
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoadingProfit(false);
    }
  }

  // โหลดกำไรครั้งแรก
  useEffect(() => {
    if (user) loadProfit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div>
      <PageHeader title="รายงาน" description="สรุปยอดขายวันนี้ และกำไรตามช่วงเวลา" />

      {/* สรุปวันนี้ */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>สรุปยอดวันนี้</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSummary ? (
            <LoadingBlock />
          ) : !summary ? (
            <EmptyState title="ไม่มีข้อมูล" />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat label="รายได้รวม" value={formatTHB(summary.total_revenue)} highlight />
              <Stat label="กำไรรวม" value={formatTHB(summary.total_profit)} highlight />
              <Stat label="จำนวนบิล" value={`${formatNumber(summary.total_sales_count)} บิล`} />
              <Stat label="เฉลี่ย/บิล" value={formatTHB(summary.average_sale_amount)} />
              <Stat label="เงินสด" value={formatTHB(summary.cash_sales_total)} />
              <Stat label="พร้อมเพย์" value={formatTHB(summary.promptpay_sales_total)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* รายงานกำไรตามช่วง */}
      <Card>
        <CardHeader>
          <CardTitle>รายงานกำไร</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-sm text-muted-foreground">ตั้งแต่</label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-auto" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">ถึง</label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-auto" />
            </div>
            <Button onClick={loadProfit} disabled={loadingProfit}>
              {loadingProfit ? "กำลังคำนวณ..." : "ดูรายงาน"}
            </Button>
          </div>

          {loadingProfit ? (
            <LoadingBlock />
          ) : error ? (
            <EmptyState title="โหลดข้อมูลไม่สำเร็จ" description={error} />
          ) : !profit ? (
            <EmptyState title="เลือกช่วงวันที่แล้วกด ดูรายงาน" />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="รายได้" value={formatTHB(profit.total_revenue)} />
              <Stat label="ต้นทุน" value={formatTHB(profit.total_cost)} />
              <Stat label="กำไร" value={formatTHB(profit.total_profit)} highlight />
              <Stat label="อัตรากำไร" value={`${profit.profit_margin_percent}%`} highlight />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
