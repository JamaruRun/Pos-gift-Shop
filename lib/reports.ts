"use client";

import type {
  DashboardToday,
  LowStockProduct,
  ProfitReport,
  RecentActivity,
  SaleRow,
  TodaySummary,
  TopProduct,
} from "./types";

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error ?? "โหลดข้อมูลไม่สำเร็จ");
  }
  return json;
}

const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();

export async function getDashboardToday(
  storeId: string,
  userId: string
): Promise<DashboardToday> {
  return (await getJson(`/api/dashboard/today?${qs({ store_id: storeId, user_id: userId })}`)).data;
}

export async function getTopProducts(
  storeId: string,
  userId: string,
  limit = 5
): Promise<TopProduct[]> {
  return (
    await getJson(
      `/api/reports/top-products?${qs({ store_id: storeId, user_id: userId, limit: String(limit) })}`
    )
  ).products;
}

export async function getRecentActivities(
  storeId: string,
  userId: string,
  limit = 10
): Promise<RecentActivity[]> {
  return (
    await getJson(
      `/api/reports/recent-activities?${qs({ store_id: storeId, user_id: userId, limit: String(limit) })}`
    )
  ).activities;
}

export async function getTodaySummary(
  storeId: string,
  userId: string
): Promise<TodaySummary> {
  return (await getJson(`/api/reports/today-summary?${qs({ store_id: storeId, user_id: userId })}`))
    .summary;
}

export async function getProfitReport(
  storeId: string,
  userId: string,
  start: string,
  end: string
): Promise<ProfitReport> {
  return (
    await getJson(
      `/api/reports/profit?${qs({ store_id: storeId, user_id: userId, start, end })}`
    )
  ).report;
}

export async function getSalesHistory(
  storeId: string,
  userId: string,
  start: string,
  end: string
): Promise<SaleRow[]> {
  return (
    await getJson(`/api/sales/history?${qs({ store_id: storeId, user_id: userId, start, end })}`)
  ).sales;
}

export async function getLowStock(storeId: string): Promise<LowStockProduct[]> {
  return (await getJson(`/api/low-stock?${qs({ store_id: storeId })}`)).products;
}
