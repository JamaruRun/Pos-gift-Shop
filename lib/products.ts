"use client";

import type { Product, ProductInput, Role } from "./types";

/**
 * Client helpers สำหรับสินค้า — เรียกผ่าน server routes ทั้งหมด
 * (mutation ไม่แตะ Supabase ตรงจาก client; service_role อยู่ฝั่ง server เท่านั้น)
 */

/** โหลดรายการสินค้า active — พนักงานจะไม่ได้รับ cost_price */
export async function fetchProducts(role: Role = "owner"): Promise<Product[]> {
  const res = await fetch(`/api/products?role=${role}`, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error ?? "โหลดรายการสินค้าไม่สำเร็จ");
  }
  return json.products as Product[];
}

export async function createProduct(input: ProductInput): Promise<Product> {
  return mutate("/api/products/create", input);
}

export async function updateProduct(input: ProductInput): Promise<Product> {
  return mutate("/api/products/update", input);
}

/** ปิดการขายสินค้า (soft delete) */
export async function deactivateProduct(input: ProductInput): Promise<Product> {
  return mutate("/api/products/update", { ...input, is_active: false });
}

async function mutate(url: string, input: ProductInput): Promise<Product> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error ?? "บันทึกไม่สำเร็จ");
  }
  return json.product as Product;
}
