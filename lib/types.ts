// ชนิดข้อมูลกลางของระบบ — อิงตาม docs/schema.sql

export type Role = "owner" | "employee";

export type PaymentMethod = "cash" | "promptpay";

export type SaleStatus = "completed" | "void";

export interface UserProfile {
  id: string;
  store_id: string;
  username: string;
  full_name: string;
  role: Role; // role_name แบบอ่านง่าย
  role_id: number; // 1 = owner, 2 = employee (ตรงกับ seed roles ใน schema.sql)
  is_active: boolean;
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  store_id: string;
  category_id: string | null;
  category_name?: string;
  name: string;
  unit: string;
  sell_price: number;
  cost_price?: number; // owner เท่านั้น — employee จะไม่ได้รับค่านี้
  stock_qty: number;
  min_stock: number;
  is_active: boolean;
  is_popular: boolean;
}

export interface CartItem {
  product_id: string;
  name: string;
  unit: string;
  unit_price: number;
  qty: number;
  stock: number; // สต็อกคงเหลือ ณ ตอนหยิบ — ใช้กันไม่ให้ qty เกินสต็อก
}

// ----- create_sale payload/result (ตรงกับ RPC ใน docs/rpc-functions.sql) -----
export interface CreateSaleItemInput {
  product_id: string;
  qty: number;
}

export interface CreateSalePayload {
  store_id: string;
  user_id: string;
  payment_method: PaymentMethod;
  paid_amount: number;
  items: CreateSaleItemInput[];
}

export interface CreateSaleResult {
  success: boolean;
  sale_id: string;
  total_amount: number;
  change_amount: number;
  message: string;
}

// ----- Products CRUD -----
export interface ProductInput {
  id?: string; // มี = แก้ไข, ไม่มี = เพิ่มใหม่
  store_id: string;
  user_id: string; // ผู้ทำรายการ (owner) — ใช้ตรวจสิทธิ์ฝั่ง server
  name: string;
  unit: string;
  category_id?: string | null;
  cost_price: number;
  sell_price: number;
  stock_qty: number;
  min_stock: number;
  is_active?: boolean;
  is_popular?: boolean;
}

// ----- Receive stock (รับของเข้า) — ตรงกับ RPC receive_stock -----
export interface ReceiveStockItemInput {
  product_id: string;
  qty: number;
  cost_price?: number; // optional: อัปเดตต้นทุนล่าสุด
}

export interface ReceiveStockPayload {
  store_id: string;
  user_id: string;
  items: ReceiveStockItemInput[];
}

export interface DashboardToday {
  total_revenue_today: number;
  total_profit_today: number;
  current_expected_cash: number;
  low_stock_count: number;
}

export interface TopProduct {
  product_name: string;
  total_qty_sold: number;
  total_revenue: number;
}

export interface TodaySummary {
  total_revenue: number;
  total_profit: number;
  total_sales_count: number;
  average_sale_amount: number;
  cash_sales_total: number;
  promptpay_sales_total: number;
}

export interface ProfitReport {
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  profit_margin_percent: number;
}

export interface RecentActivity {
  user_name: string;
  action: string;
  entity: string | null;
  created_at: string;
}

export interface SaleItemRow {
  product_name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

export interface SaleRow {
  sale_id: string;
  sale_datetime: string;
  employee_name: string;
  total_amount: number;
  payment_method: PaymentMethod;
  status: SaleStatus;
  items: SaleItemRow[];
}

export interface LowStockProduct {
  product_id: string;
  product_name: string;
  stock_qty: number;
  min_stock: number;
  shortage_amount: number;
}

export interface CashSession {
  id: string;
  opening_cash: number;
  expected_cash: number | null;
  actual_cash: number | null;
  difference: number | null;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
}
