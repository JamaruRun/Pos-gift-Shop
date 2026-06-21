"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Wallet, AlertTriangle, Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { OwnerOnly } from "@/components/OwnerOnly";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { formatTHB, formatTime, actionLabel } from "@/lib/format";
import {
  getDashboardToday,
  getTopProducts,
  getRecentActivities,
} from "@/lib/reports";
import type { DashboardToday, RecentActivity, TopProduct } from "@/lib/types";

export default function DashboardPage() {
  return (
    <OwnerOnly>
      <DashboardContent />
    </OwnerOnly>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardToday | null>(null);
  const [top, setTop] = useState<TopProduct[]>([]);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getDashboardToday(user.store_id, user.id),
      getTopProducts(user.store_id, user.id, 5),
      getRecentActivities(user.store_id, user.id, 10),
    ])
      .then(([d, t, a]) => {
        setData(d);
        setTop(t);
        setActivities(a);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <LoadingBlock />;
  if (error || !data)
    return <EmptyState title="โหลดแดชบอร์ดไม่สำเร็จ" description={error ?? undefined} />;

  const cards = [
    { label: "รายได้วันนี้", value: formatTHB(data.total_revenue_today), icon: TrendingUp, accent: "text-primary" },
    { label: "กำไรวันนี้", value: formatTHB(data.total_profit_today), icon: Coins, accent: "text-primary" },
    { label: "เงินสดในลิ้นชัก", value: formatTHB(data.current_expected_cash), icon: Wallet, accent: "text-foreground" },
    { label: "สินค้าใกล้หมด", value: `${data.low_stock_count} รายการ`, icon: AlertTriangle, accent: data.low_stock_count > 0 ? "text-destructive" : "text-foreground" },
  ];

  return (
    <div>
      <PageHeader title="แดชบอร์ด" description="ภาพรวมร้านวันนี้" />

      {/* การ์ด 4 ใบ — รายได้วันนี้ เด่นสุด */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className={i === 0 ? "ring-2 ring-primary/40" : ""}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                  <Icon className={`h-5 w-5 ${c.accent}`} />
                </div>
                <p className={`mt-2 ${i === 0 ? "text-3xl" : "text-2xl"} font-bold ${c.accent}`}>
                  {c.value}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* สินค้าขายดี */}
        <Card>
          <CardHeader>
            <CardTitle>สินค้าขายดี</CardTitle>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <EmptyState title="ยังไม่มีข้อมูลการขาย" />
            ) : (
              <ul className="divide-y">
                {top.map((p, i) => (
                  <li key={p.product_name} className="flex items-center justify-between py-3">
                    <span className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                        {i + 1}
                      </span>
                      {p.product_name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {p.total_qty_sold} ชิ้น · {formatTHB(p.total_revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* กิจกรรมล่าสุด */}
        <Card>
          <CardHeader>
            <CardTitle>กิจกรรมล่าสุด</CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <EmptyState title="ยังไม่มีกิจกรรม" />
            ) : (
              <ul className="divide-y">
                {activities.map((a, i) => (
                  <li key={i} className="flex items-center justify-between py-3">
                    <span>
                      <b>{a.user_name}</b> — {actionLabel(a.action)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatTime(a.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
