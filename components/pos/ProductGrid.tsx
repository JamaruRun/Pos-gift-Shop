"use client";

import { formatTHB } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

/** ปุ่มสินค้าแบบกริด (ปุ่มใหญ่) — แตะเพื่อใส่ตะกร้า, ปิดถ้าสต็อกหมด */
export function ProductGrid({
  products,
  onAdd,
}: {
  products: Product[];
  onAdd: (p: Product) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {products.map((p) => {
        const out = p.stock_qty <= 0;
        const low = p.stock_qty <= p.min_stock;
        return (
          <button
            key={p.id}
            onClick={() => !out && onAdd(p)}
            disabled={out}
            className={cn(
              "flex flex-col items-start rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary disabled:opacity-50",
              out && "cursor-not-allowed"
            )}
          >
            <span className="font-medium">{p.name}</span>
            <span className="mt-1 text-lg font-bold text-primary">
              {formatTHB(p.sell_price)}
            </span>
            <span
              className={cn(
                "mt-1 text-xs",
                out
                  ? "font-semibold text-destructive"
                  : low
                    ? "text-destructive"
                    : "text-muted-foreground"
              )}
            >
              {out ? "สินค้าหมด" : `คงเหลือ ${p.stock_qty} ${p.unit}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
