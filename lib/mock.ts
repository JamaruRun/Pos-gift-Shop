// ข้อมูลตัวอย่างสำหรับโหมด MOCK (ยังไม่ต่อ Supabase)
// TODO: เมื่อต่อ backend แล้ว ให้แทนการ import จากไฟล์นี้ด้วยการเรียก views/RPC ใน docs/reporting.sql

import type {
  DashboardToday,
  LowStockProduct,
  Product,
  ProfitReport,
  RecentActivity,
  SaleRow,
  TodaySummary,
  TopProduct,
  UserProfile,
} from "./types";

export const mockDashboard: DashboardToday = {
  total_revenue_today: 4250,
  total_profit_today: 980,
  current_expected_cash: 3100,
  low_stock_count: 3,
};

export const mockTodaySummary: TodaySummary = {
  total_revenue: 4250,
  total_profit: 980,
  total_sales_count: 37,
  average_sale_amount: 114.86,
  cash_sales_total: 3100,
  promptpay_sales_total: 1150,
};

export const mockProfitReport: ProfitReport = {
  total_revenue: 125000,
  total_cost: 98000,
  total_profit: 27000,
  profit_margin_percent: 21.6,
};

export const mockTopProducts: TopProduct[] = [
  { product_name: "โค้ก", total_qty_sold: 48, total_revenue: 720 },
  { product_name: "มาม่าต้มยำกุ้ง", total_qty_sold: 40, total_revenue: 280 },
  { product_name: "ช้างเย็น", total_qty_sold: 24, total_revenue: 1320 },
  { product_name: "น้ำดื่ม", total_qty_sold: 20, total_revenue: 140 },
];

export const mockActivities: RecentActivity[] = [
  { user_name: "สมชาย", action: "sale.create", entity: "sale", created_at: new Date(Date.now() - 5 * 60000).toISOString() },
  { user_name: "Gift (เจ้าของ)", action: "stock.receive", entity: "product", created_at: new Date(Date.now() - 60 * 60000).toISOString() },
  { user_name: "Gift (เจ้าของ)", action: "cash_session.open", entity: "cash_session", created_at: new Date(Date.now() - 3 * 3600000).toISOString() },
];

export const mockProducts: Product[] = [
  { id: "p1", store_id: "s1", category_id: "c2", category_name: "เครื่องดื่ม", name: "โค้ก", unit: "ขวด", sell_price: 15, cost_price: 12, stock_qty: 48, min_stock: 12, is_active: true, is_popular: true },
  { id: "p2", store_id: "s1", category_id: "c1", category_name: "ขนม", name: "มาม่าต้มยำกุ้ง", unit: "ซอง", sell_price: 7, cost_price: 5, stock_qty: 60, min_stock: 20, is_active: true, is_popular: true },
  { id: "p3", store_id: "s1", category_id: "c3", category_name: "เบียร์", name: "ช้างเย็น", unit: "ขวด", sell_price: 55, cost_price: 45, stock_qty: 5, min_stock: 6, is_active: true, is_popular: true },
  { id: "p4", store_id: "s1", category_id: "c2", category_name: "เครื่องดื่ม", name: "น้ำดื่ม", unit: "ขวด", sell_price: 7, cost_price: 4, stock_qty: 72, min_stock: 24, is_active: true, is_popular: false },
  { id: "p5", store_id: "s1", category_id: "c5", category_name: "ของใช้ในบ้าน", name: "สบู่", unit: "ก้อน", sell_price: 25, cost_price: 18, stock_qty: 3, min_stock: 6, is_active: true, is_popular: false },
  { id: "p6", store_id: "s1", category_id: "c4", category_name: "บุหรี่", name: "บุหรี่ (ซอง)", unit: "ซอง", sell_price: 72, cost_price: 66, stock_qty: 4, min_stock: 10, is_active: true, is_popular: true },
];

export const mockLowStock: LowStockProduct[] = mockProducts
  .filter((p) => p.stock_qty <= p.min_stock)
  .map((p) => ({
    product_id: p.id,
    product_name: p.name,
    stock_qty: p.stock_qty,
    min_stock: p.min_stock,
    shortage_amount: p.min_stock - p.stock_qty,
  }))
  .sort((a, b) => a.stock_qty - b.stock_qty);

export const mockSalesHistory: SaleRow[] = [
  {
    sale_id: "sale-1",
    sale_datetime: new Date().toISOString(),
    employee_name: "สมชาย",
    total_amount: 65,
    payment_method: "cash",
    status: "completed",
    items: [
      { product_name: "โค้ก", qty: 2, unit_price: 15, subtotal: 30 },
      { product_name: "มาม่าต้มยำกุ้ง", qty: 5, unit_price: 7, subtotal: 35 },
    ],
  },
  {
    sale_id: "sale-2",
    sale_datetime: new Date(Date.now() - 2 * 3600000).toISOString(),
    employee_name: "สมชาย",
    total_amount: 110,
    payment_method: "promptpay",
    status: "completed",
    items: [{ product_name: "ช้างเย็น", qty: 2, unit_price: 55, subtotal: 110 }],
  },
  {
    sale_id: "sale-3",
    sale_datetime: new Date(Date.now() - 4 * 3600000).toISOString(),
    employee_name: "สมชาย",
    total_amount: 25,
    payment_method: "cash",
    status: "void",
    items: [{ product_name: "สบู่", qty: 1, unit_price: 25, subtotal: 25 }],
  },
];

export const mockEmployees: UserProfile[] = [
  { id: "u1", store_id: "s1", username: "gift", full_name: "Gift (เจ้าของ)", role: "owner", role_id: 1, is_active: true },
  { id: "u2", store_id: "s1", username: "somchai", full_name: "สมชาย", role: "employee", role_id: 2, is_active: true },
  { id: "u3", store_id: "s1", username: "somsri", full_name: "สมศรี", role: "employee", role_id: 2, is_active: false },
];
