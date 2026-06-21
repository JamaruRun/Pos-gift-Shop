"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, PackageCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingBlock } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { getLowStock } from "@/lib/reports";
import type { LowStockProduct } from "@/lib/types";

export default function LowStockPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getLowStock(user.store_id)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <LoadingBlock />;
  if (error) return <EmptyState title="โหลดข้อมูลไม่สำเร็จ" description={error} />;

  return (
    <div>
      <PageHeader
        title="สินค้าใกล้หมด"
        description="สินค้าที่คงเหลือต่ำกว่าหรือเท่ากับจุดสั่งซื้อ (min_stock)"
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<PackageCheck className="h-10 w-10 text-primary opacity-60" />}
          title="สต็อกปกติทุกรายการ"
          description="ยังไม่มีสินค้าที่ใกล้หมด"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Card key={p.product_id} className="border-destructive/30">
              <CardContent className="pt-5">
                <div className="flex items-start justify-between">
                  <p className="font-medium">{p.product_name}</p>
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <Badge variant="destructive">เหลือ {p.stock_qty}</Badge>
                  <span className="text-muted-foreground">ขั้นต่ำ {p.min_stock}</span>
                </div>
                <p className="mt-2 text-sm text-destructive">
                  ขาดอีก {p.shortage_amount} ชิ้น
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
