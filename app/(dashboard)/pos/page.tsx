"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Minus, Trash2, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/spinner";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { formatTHB } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { fetchProducts } from "@/lib/products";
import { submitSale } from "@/lib/sales";
import { getCurrentSession } from "@/lib/cash";
import type {
  CartItem,
  CashSession,
  CreateSaleResult,
  PaymentMethod,
  Product,
} from "@/lib/types";

export default function PosPage() {
  const { user } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);

  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [paid, setPaid] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CreateSaleResult | null>(null);

  // โหลดสินค้าครั้งเดียว แล้วกรองด้วยชื่อฝั่ง client
  useEffect(() => {
    let active = true;
    fetchProducts()
      .then((p) => active && setProducts(p))
      .catch(() => active && setError("โหลดรายการสินค้าไม่สำเร็จ"))
      .finally(() => active && setLoadingProducts(false));
    return () => {
      active = false;
    };
  }, []);

  // เช็คกะเงินสดที่เปิดอยู่ (ใช้กันการขายเงินสดเมื่อยังไม่เปิดกะ)
  useEffect(() => {
    if (!user) return;
    getCurrentSession(user.store_id)
      .then(setCashSession)
      .catch(() => {
        /* เงียบไว้ — POS ยังขายพร้อมเพย์ได้ */
      });
  }, [user]);

  const cashLocked = payment === "cash" && !cashSession;

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return products.filter((p) => p.is_popular); // ไม่พิมพ์ -> โชว์ขายดี
    return products.filter((p) => p.name.includes(q)); // ค้นด้วยชื่อเท่านั้น
  }, [query, products]);

  const total = cart.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const paidNum = payment === "cash" ? Number(paid || 0) : total;
  const change = Math.max(paidNum - total, 0);

  function addToCart(p: Product) {
    setError(null);
    setSummary(null);
    setCart((prev) => {
      const found = prev.find((i) => i.product_id === p.id);
      if (found) {
        if (found.qty >= p.stock_qty) return prev; // กันเกินสต็อก
        return prev.map((i) =>
          i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          unit: p.unit,
          unit_price: p.sell_price,
          qty: 1,
          stock: p.stock_qty,
        },
      ];
    });
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product_id === id
            ? { ...i, qty: Math.min(i.qty + delta, i.stock) } // กันเกินสต็อก
            : i
        )
        .filter((i) => i.qty > 0)
    );
  }

  function removeItem(id: string) {
    setCart((prev) => prev.filter((i) => i.product_id !== id));
  }

  async function handlePay() {
    if (cart.length === 0 || !user) return;
    // ขายเงินสดต้องมีกะเปิดอยู่ (พร้อมเพย์ไม่ต้อง)
    if (payment === "cash" && !cashSession) {
      setError("ยังไม่ได้เปิดกะเงินสด กรุณาให้เจ้าของร้านเปิดกะก่อน");
      return;
    }
    if (payment === "cash" && paidNum < total) {
      setError("เงินที่รับมาไม่พอ");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSummary(null);
    try {
      const result = await submitSale({
        store_id: user.store_id,
        user_id: user.id,
        payment_method: payment,
        paid_amount: paidNum,
        items: cart.map((i) => ({ product_id: i.product_id, qty: i.qty })),
      });

      // หมายเหตุ: ไม่ส่ง LINE จาก frontend — RPC สร้าง notification_logs (pending)
      // ให้ worker ฝั่ง backend ส่งเอง

      setSummary(result);
      // อัปเดตสต็อกในจอ (โหมดทดลอง: ลดในเครื่อง / โหมดจริงควร refetch)
      // TODO (real): await fetchProducts() เพื่อดึงสต็อกล่าสุดจาก DB
      setProducts((prev) =>
        prev.map((p) => {
          const sold = cart.find((c) => c.product_id === p.id);
          return sold ? { ...p, stock_qty: p.stock_qty - sold.qty } : p;
        })
      );
      setCart([]);
      setPaid("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="ขายสินค้า" description="ค้นหาด้วยชื่อสินค้า แล้วแตะเพื่อใส่ตะกร้า" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ซ้าย: ค้นหา + สินค้า */}
        <div className="lg:col-span-2">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="พิมพ์ชื่อสินค้า เช่น มาม่า, โค้ก..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-14 pl-11 text-lg"
              autoFocus
            />
          </div>

          {loadingProducts ? (
            <LoadingBlock label="กำลังโหลดสินค้า..." />
          ) : filtered.length === 0 ? (
            <EmptyState title="ไม่พบสินค้า" description="ลองพิมพ์ชื่ออื่น" />
          ) : (
            <ProductGrid products={filtered} onAdd={addToCart} />
          )}
        </div>

        {/* ขวา: ตะกร้า */}
        <div>
          <Card className="sticky top-4">
            <CardContent className="pt-5">
              <h2 className="mb-3 text-lg font-bold">ตะกร้า</h2>

              {cart.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  ยังไม่มีสินค้าในตะกร้า
                </p>
              ) : (
                <ul className="mb-4 divide-y">
                  {cart.map((i) => {
                    const atMax = i.qty >= i.stock;
                    return (
                      <li key={i.product_id} className="py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{i.name}</span>
                          <button
                            onClick={() => removeItem(i.product_id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => changeQty(i.product_id, -1)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-semibold">{i.qty}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => changeQty(i.product_id, 1)}
                              disabled={atMax}
                              title={atMax ? "ครบจำนวนสต็อกแล้ว" : undefined}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <span className="font-semibold">
                            {formatTHB(i.unit_price * i.qty)}
                          </span>
                        </div>
                        {atMax && (
                          <p className="mt-1 text-xs text-destructive">
                            มีสต็อกสูงสุด {i.stock} {i.unit}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* รวม */}
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-lg">รวม</span>
                <span className="text-2xl font-bold text-primary">{formatTHB(total)}</span>
              </div>

              {/* วิธีจ่าย */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["cash", "promptpay"] as PaymentMethod[]).map((m) => (
                  <Button
                    key={m}
                    variant={payment === m ? "default" : "outline"}
                    onClick={() => setPayment(m)}
                  >
                    {m === "cash" ? "เงินสด" : "พร้อมเพย์"}
                  </Button>
                ))}
              </div>

              {payment === "cash" && (
                <div className="mt-3">
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="รับเงินมา (บาท)"
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                    className="h-12 text-center text-lg"
                    disabled={cashLocked}
                  />
                  {paidNum > total && (
                    <p className="mt-2 text-center text-sm text-muted-foreground">
                      เงินทอน {formatTHB(change)}
                    </p>
                  )}
                </div>
              )}

              {/* เตือนเมื่อยังไม่เปิดกะ (เฉพาะเงินสด) */}
              {cashLocked && (
                <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                  ยังไม่ได้เปิดกะเงินสด กรุณาให้เจ้าของร้านเปิดกะก่อน
                  <br />
                  (ยังขายผ่านพร้อมเพย์ได้)
                </p>
              )}

              <Button
                size="lg"
                className="mt-4 w-full"
                disabled={cart.length === 0 || submitting || cashLocked}
                onClick={handlePay}
              >
                {submitting ? "กำลังบันทึก..." : "รับเงิน"}
              </Button>

              {/* error */}
              {error && (
                <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                  {error}
                </p>
              )}

              {/* สรุปการขายสำเร็จ */}
              {summary && (
                <div className="mt-3 rounded-lg bg-primary/10 p-3 text-sm text-primary">
                  <p className="flex items-center justify-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    {summary.message}
                  </p>
                  <div className="mt-2 flex justify-between">
                    <span>ยอดรวม</span>
                    <span className="font-semibold">{formatTHB(summary.total_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>เงินทอน</span>
                    <span className="font-semibold">{formatTHB(summary.change_amount)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
