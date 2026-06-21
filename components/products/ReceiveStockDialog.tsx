"use client";

import { useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Product, ReceiveStockItemInput } from "@/lib/types";

/**
 * กล่องรับของเข้า — กรอกจำนวนที่รับต่อสินค้า (+ต้นทุนใหม่ถ้ามี)
 * ส่งเฉพาะรายการที่ qty > 0
 */
export function ReceiveStockDialog({
  products,
  submitting,
  onClose,
  onSubmit,
}: {
  products: Product[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (items: ReceiveStockItemInput[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? products.filter((p) => p.name.includes(q)) : products;
  }, [query, products]);

  const items: ReceiveStockItemInput[] = Object.entries(qty)
    .filter(([, v]) => Number(v) > 0)
    .map(([product_id, v]) => {
      const c = cost[product_id];
      return {
        product_id,
        qty: Number(v),
        ...(c !== undefined && c !== "" ? { cost_price: Number(c) } : {}),
      };
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="flex max-h-[85vh] w-full max-w-lg flex-col">
        <CardContent className="flex min-h-0 flex-1 flex-col pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">รับของเข้า</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ค้นหาสินค้า..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-11"
            />
          </div>

          {/* รายการสินค้า */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                <tr>
                  <th className="py-2">สินค้า (เหลือ)</th>
                  <th className="py-2 text-center">รับเข้า</th>
                  <th className="py-2 text-center">ต้นทุนใหม่</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="py-2">
                      {p.name}{" "}
                      <span className="text-muted-foreground">({p.stock_qty})</span>
                    </td>
                    <td className="py-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        value={qty[p.id] ?? ""}
                        onChange={(e) => setQty((s) => ({ ...s, [p.id]: e.target.value }))}
                        className="h-9 w-20 text-center"
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="-"
                        value={cost[p.id] ?? ""}
                        onChange={(e) => setCost((s) => ({ ...s, [p.id]: e.target.value }))}
                        className="h-9 w-24 text-center"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-sm text-muted-foreground">
              เลือกแล้ว {items.length} รายการ
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                ยกเลิก
              </Button>
              <Button
                onClick={() => onSubmit(items)}
                disabled={items.length === 0 || submitting}
              >
                {submitting ? "กำลังบันทึก..." : "ยืนยันรับของ"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
