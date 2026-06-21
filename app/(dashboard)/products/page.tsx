"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Pencil, X, PackagePlus, EyeOff, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/spinner";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReceiveStockDialog } from "@/components/products/ReceiveStockDialog";
import { useAuth } from "@/lib/auth-context";
import { formatTHB } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deactivateProduct,
} from "@/lib/products";
import { receiveStock } from "@/lib/stock";
import type { Product, ProductInput, ReceiveStockItemInput } from "@/lib/types";

export default function ProductsPage() {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchProducts(user.role)
      .then(setProducts)
      .catch((e) => setToast({ ok: false, msg: e.message }))
      .finally(() => setLoading(false));
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? products.filter((p) => p.name.includes(q)) : products;
  }, [query, products]);

  function notify(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave(input: ProductInput) {
    if (!user) return;
    setBusy(true);
    try {
      const payload = { ...input, store_id: user.store_id, user_id: user.id };
      const saved = input.id
        ? await updateProduct(payload)
        : await createProduct(payload);
      setProducts((prev) => {
        const exists = prev.some((p) => p.id === saved.id);
        return exists
          ? prev.map((p) => (p.id === saved.id ? { ...p, ...saved } : p))
          : [...prev, saved];
      });
      setShowForm(false);
      notify(true, "บันทึกสินค้าสำเร็จ");
    } catch (e) {
      notify(false, e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(p: Product) {
    if (!user) return;
    setBusy(true);
    try {
      const base: ProductInput = {
        id: p.id,
        store_id: user.store_id,
        user_id: user.id,
        name: p.name,
        unit: p.unit,
        category_id: p.category_id,
        cost_price: p.cost_price ?? 0,
        sell_price: p.sell_price,
        stock_qty: p.stock_qty,
        min_stock: p.min_stock,
      };
      const saved = p.is_active
        ? await deactivateProduct(base)
        : await updateProduct({ ...base, is_active: true });
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...saved } : x)));
      notify(true, p.is_active ? "ปิดการขายแล้ว" : "เปิดการขายแล้ว");
    } catch (e) {
      notify(false, e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleReceive(items: ReceiveStockItemInput[]) {
    if (!user) return;
    setBusy(true);
    try {
      const result = await receiveStock({
        store_id: user.store_id,
        user_id: user.id,
        items,
      });
      // อัปเดตสต็อก/ต้นทุนในจอ (โหมดจริงควร refetch — TODO)
      setProducts((prev) =>
        prev.map((p) => {
          const r = items.find((i) => i.product_id === p.id);
          if (!r) return p;
          return {
            ...p,
            stock_qty: p.stock_qty + r.qty,
            cost_price: r.cost_price ?? p.cost_price,
          };
        })
      );
      setShowReceive(false);
      notify(true, result.message);
    } catch (e) {
      notify(false, e instanceof Error ? e.message : "รับของเข้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="สินค้า"
        description="จัดการรายการสินค้าและสต็อก"
        action={
          isOwner && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowReceive(true)}>
                <PackagePlus className="h-5 w-5" /> รับของเข้า
              </Button>
              <Button
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
              >
                <Plus className="h-5 w-5" /> เพิ่มสินค้า
              </Button>
            </div>
          )
        }
      />

      {toast && (
        <p
          className={cn(
            "mb-4 rounded-lg px-3 py-2 text-sm",
            toast.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
          )}
        >
          {toast.msg}
        </p>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ค้นหาชื่อสินค้า..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-11"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="ไม่พบสินค้า" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="p-3">ชื่อสินค้า</th>
                    <th className="p-3">หมวด</th>
                    <th className="p-3 text-right">ราคาขาย</th>
                    {isOwner && <th className="p-3 text-right">ต้นทุน</th>}
                    <th className="p-3 text-right">คงเหลือ</th>
                    {isOwner && <th className="p-3"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const low = p.stock_qty <= p.min_stock;
                    return (
                      <tr
                        key={p.id}
                        className={cn("border-b last:border-0", !p.is_active && "opacity-50")}
                      >
                        <td className="p-3 font-medium">
                          {p.name}
                          {!p.is_active && (
                            <Badge variant="muted" className="ml-2">ปิดการขาย</Badge>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">{p.category_name ?? "-"}</td>
                        <td className="p-3 text-right">{formatTHB(p.sell_price)}</td>
                        {isOwner && (
                          <td className="p-3 text-right text-muted-foreground">
                            {p.cost_price != null ? formatTHB(p.cost_price) : "-"}
                          </td>
                        )}
                        <td className="p-3 text-right">
                          <span className={cn(low && "font-semibold text-destructive")}>
                            {p.stock_qty} {p.unit}
                          </span>
                          {low && (
                            <Badge variant="destructive" className="ml-2">ใกล้หมด</Badge>
                          )}
                        </td>
                        {isOwner && (
                          <td className="p-3">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditing(p);
                                  setShowForm(true);
                                }}
                                title="แก้ไข"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleToggleActive(p)}
                                disabled={busy}
                                title={p.is_active ? "ปิดการขาย" : "เปิดการขาย"}
                              >
                                {p.is_active ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && isOwner && (
        <ProductForm
          product={editing}
          busy={busy}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
        />
      )}

      {showReceive && isOwner && (
        <ReceiveStockDialog
          products={products.filter((p) => p.is_active)}
          submitting={busy}
          onClose={() => setShowReceive(false)}
          onSubmit={handleReceive}
        />
      )}
    </div>
  );
}

function ProductForm({
  product,
  busy,
  onClose,
  onSave,
}: {
  product: Product | null;
  busy: boolean;
  onClose: () => void;
  onSave: (p: ProductInput) => void;
}) {
  const isEdit = !!product;
  const [name, setName] = useState(product?.name ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "ชิ้น");
  const [sell, setSell] = useState(String(product?.sell_price ?? ""));
  const [cost, setCost] = useState(String(product?.cost_price ?? ""));
  const [stock, setStock] = useState(String(product?.stock_qty ?? ""));
  const [minStock, setMinStock] = useState(String(product?.min_stock ?? ""));

  function submit() {
    if (!name.trim()) return;
    onSave({
      id: product?.id,
      store_id: product?.store_id ?? "",
      user_id: "", // เติมโดย handleSave
      category_id: product?.category_id ?? null,
      name: name.trim(),
      unit: unit.trim() || "ชิ้น",
      sell_price: Number(sell || 0),
      cost_price: Number(cost || 0),
      stock_qty: Number(stock || 0),
      min_stock: Number(minStock || 0),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{isEdit ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="space-y-3">
            <Field label="ชื่อสินค้า">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="หน่วย">
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
              </Field>
              <Field label="ราคาขาย (บาท)">
                <Input type="number" value={sell} onChange={(e) => setSell(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ต้นทุน (บาท)">
                <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
              </Field>
              <Field label={isEdit ? "สต็อก (ปรับผ่านรับของเข้า)" : "สต็อกเริ่มต้น"}>
                <Input
                  type="number"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  disabled={isEdit}
                />
              </Field>
            </div>
            <Field label="แจ้งเตือนเมื่อเหลือต่ำกว่า (min_stock)">
              <Input
                type="number"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button className="flex-1" onClick={submit} disabled={busy}>
              {busy ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
