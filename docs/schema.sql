-- ============================================================
-- Stock Manager (POS + Inventory) — Supabase PostgreSQL Schema
-- Version: 1.0 (MVP)  |  Store: Gift Store (single store, SaaS-ready)
-- NOTE: ไม่มีคอลัมน์ barcode โดยเจตนา (ลูกค้ายืนยันไม่ใช้บาร์โค้ด)
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- ค้นหาชื่อสินค้าภาษาไทยแบบ partial

-- ---------- updated_at trigger function ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- CORE TABLES
-- ============================================================

-- ---------- stores ----------
create table stores (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_stores_updated before update on stores
  for each row execute function set_updated_at();

-- ---------- roles ----------
create table roles (
  id    smallint primary key,
  name  text not null unique           -- 'owner' | 'employee'
);

-- ---------- users (profiles) ----------
-- เชื่อมกับ Supabase auth.users ผ่าน auth_user_id (ถ้าใช้ Supabase Auth)
-- รองรับ custom username + PIN ผ่าน pin_hash
create table users (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  auth_user_id  uuid unique,                       -- nullable: ใช้ตอนผูก Supabase Auth
  username      text not null,
  full_name     text not null,
  pin_hash      text,                              -- bcrypt/argon2 (custom PIN auth)
  role_id       smallint not null references roles(id),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (store_id, username)
);
create index idx_users_store on users(store_id);
create index idx_users_role on users(role_id);
create trigger trg_users_updated before update on users
  for each row execute function set_updated_at();

-- ---------- categories ----------
create table categories (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (store_id, name)
);
create index idx_categories_store on categories(store_id);
create trigger trg_categories_updated before update on categories
  for each row execute function set_updated_at();

-- ---------- products ----------
-- ไม่มี barcode โดยเจตนา; ค้นหาด้วย name (ภาษาไทย) ผ่าน GIN trigram
create table products (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  category_id   uuid references categories(id) on delete set null,
  name          text not null,
  unit          text not null default 'ชิ้น',
  cost_price    numeric(12,2) not null default 0 check (cost_price >= 0),
  sell_price    numeric(12,2) not null default 0 check (sell_price >= 0),
  stock_qty     numeric(12,3) not null default 0,
  min_stock     numeric(12,3) not null default 0 check (min_stock >= 0),  -- low stock alert
  expiry_date   date,
  is_active     boolean not null default true,
  is_popular    boolean not null default false,   -- ปุ่มสินค้าขายดีบนหน้า POS
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_products_store on products(store_id);
create index idx_products_category on products(category_id);
-- ค้นหาชื่อสินค้าภาษาไทยแบบ partial (เช่น "มาม่า" -> "มาม่าต้มยำกุ้ง")
create index idx_products_name_trgm on products using gin (name gin_trgm_ops);
-- low stock alert query
create index idx_products_low_stock on products(store_id) where is_active;
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

-- ---------- cash_sessions ----------
create table cash_sessions (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id) on delete cascade,
  user_id        uuid not null references users(id),
  opening_cash   numeric(12,2) not null default 0 check (opening_cash >= 0),
  expected_cash  numeric(12,2),     -- คำนวณตอนปิด = opening + ยอดขายเงินสด
  actual_cash    numeric(12,2),     -- เงินที่นับจริงตอนปิด
  difference     numeric(12,2),     -- actual - expected
  status         text not null default 'open' check (status in ('open','closed')),
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_cash_sessions_store on cash_sessions(store_id);
create index idx_cash_sessions_user on cash_sessions(user_id);
-- พนักงาน 1 คนเปิดได้ครั้งละ 1 กะ
create unique index idx_cash_sessions_one_open
  on cash_sessions(user_id) where status = 'open';
create trigger trg_cash_sessions_updated before update on cash_sessions
  for each row execute function set_updated_at();

-- ---------- sales ----------
-- ห้ามลบจริง; ยกเลิกด้วย status='void' + void_reason
create table sales (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  user_id         uuid not null references users(id),
  cash_session_id uuid references cash_sessions(id),
  total           numeric(12,2) not null default 0 check (total >= 0),
  paid            numeric(12,2) not null default 0 check (paid >= 0),
  change          numeric(12,2) not null default 0 check (change >= 0),
  payment_method  text not null default 'cash' check (payment_method in ('cash','promptpay')),
  status          text not null default 'completed' check (status in ('completed','void')),
  void_reason     text,
  voided_by       uuid references users(id),
  voided_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- ถ้า void ต้องมีเหตุผล
  constraint chk_void_reason check (status <> 'void' or void_reason is not null)
);
create index idx_sales_store_created on sales(store_id, created_at desc);
create index idx_sales_user on sales(user_id);
create index idx_sales_session on sales(cash_session_id);
create index idx_sales_status on sales(status);
create trigger trg_sales_updated before update on sales
  for each row execute function set_updated_at();

-- ---------- sale_items ----------
-- เก็บ unit_price และ unit_cost ณ เวลาขาย เพื่อคำนวณกำไรย้อนหลังได้ถูกต้อง
create table sale_items (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  sale_id     uuid not null references sales(id) on delete cascade,
  product_id  uuid not null references products(id),
  product_name text not null,        -- snapshot ชื่อ ณ เวลาขาย
  qty         numeric(12,3) not null check (qty > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  unit_cost   numeric(12,2) not null default 0 check (unit_cost >= 0),
  line_total  numeric(12,2) not null check (line_total >= 0),
  created_at  timestamptz not null default now()
);
create index idx_sale_items_sale on sale_items(sale_id);
create index idx_sale_items_product on sale_items(product_id);
create index idx_sale_items_store on sale_items(store_id);

-- ---------- inventory_movements ----------
-- บันทึกการเปลี่ยนแปลงสต็อกทุกครั้ง (บัญชีเดินสะพัดของสต็อก)
create table inventory_movements (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  product_id  uuid not null references products(id),
  type        text not null check (type in ('sale','receive','adjust','waste','return','void_restock')),
  qty_change  numeric(12,3) not null,           -- + เพิ่ม / - ลด
  ref_table   text,                             -- เช่น 'sales','stock_adjustments'
  ref_id      uuid,
  user_id     uuid not null references users(id),
  note        text,
  created_at  timestamptz not null default now()
);
create index idx_inv_mov_product_created on inventory_movements(product_id, created_at desc);
create index idx_inv_mov_store on inventory_movements(store_id);
create index idx_inv_mov_type on inventory_movements(type);

-- ---------- stock_adjustments ----------
-- การปรับสต็อกด้วยมือ / ตรวจนับ (ต้องมีเหตุผล)
create table stock_adjustments (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  product_id  uuid not null references products(id),
  system_qty  numeric(12,3) not null,
  counted_qty numeric(12,3) not null,
  diff        numeric(12,3) not null,           -- counted - system
  reason      text not null,
  user_id     uuid not null references users(id),
  created_at  timestamptz not null default now()
);
create index idx_stock_adj_product on stock_adjustments(product_id);
create index idx_stock_adj_store on stock_adjustments(store_id);

-- ---------- activity_logs ----------
-- append-only; ห้ามแก้/ลบ
create table activity_logs (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  user_id     uuid references users(id),
  action      text not null,                    -- 'login','product.update','sale.void',...
  entity      text,                             -- 'product','sale','cash_session',...
  entity_id   uuid,
  detail      jsonb,                            -- before/after
  created_at  timestamptz not null default now()
);
create index idx_activity_store_created on activity_logs(store_id, created_at desc);
create index idx_activity_user on activity_logs(user_id);

-- ---------- notification_logs ----------
-- สถานะการส่ง LINE ต่อบิล
create table notification_logs (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  sale_id     uuid references sales(id) on delete cascade,
  channel     text not null default 'line' check (channel in ('line')),
  status      text not null default 'pending' check (status in ('pending','sent','failed')),
  error       text,
  retry_count int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_notif_sale on notification_logs(sale_id);
create index idx_notif_store_status on notification_logs(store_id, status);
create trigger trg_notif_updated before update on notification_logs
  for each row execute function set_updated_at();

-- ---------- settings ----------
-- key/value ต่อ store (เก็บ LINE channel token, owner user id ฯลฯ)
create table settings (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  key         text not null,
  value       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (store_id, key)
);
create index idx_settings_store on settings(store_id);
create trigger trg_settings_updated before update on settings
  for each row execute function set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- helper: store_id ของผู้ใช้ปัจจุบัน
create or replace function current_store_id()
returns uuid language sql stable as $$
  select store_id from users where auth_user_id = auth.uid()
$$;

-- helper: เป็น owner หรือไม่
create or replace function is_owner()
returns boolean language sql stable as $$
  select exists (
    select 1 from users u join roles r on r.id = u.role_id
    where u.auth_user_id = auth.uid() and r.name = 'owner'
  )
$$;

alter table stores              enable row level security;
alter table users               enable row level security;
alter table categories          enable row level security;
alter table products            enable row level security;
alter table cash_sessions       enable row level security;
alter table sales               enable row level security;
alter table sale_items          enable row level security;
alter table inventory_movements enable row level security;
alter table stock_adjustments   enable row level security;
alter table activity_logs       enable row level security;
alter table notification_logs   enable row level security;
alter table settings            enable row level security;
-- roles เป็นตารางอ้างอิงสาธารณะ (อ่านได้)
alter table roles enable row level security;
create policy roles_read on roles for select using (true);

-- นโยบายพื้นฐาน: เห็นได้เฉพาะ store ของตัวเอง
-- (ตารางทั่วไป: อ่าน/เขียนภายใน store เดียวกัน)
create policy store_isolation_sel on categories          for select using (store_id = current_store_id());
create policy store_isolation_mod on categories          for all    using (store_id = current_store_id() and is_owner()) with check (store_id = current_store_id());

create policy products_sel on products                   for select using (store_id = current_store_id());
create policy products_mod on products                   for all    using (store_id = current_store_id() and is_owner()) with check (store_id = current_store_id());

create policy users_sel on users                         for select using (store_id = current_store_id());
create policy users_mod on users                         for all    using (store_id = current_store_id() and is_owner()) with check (store_id = current_store_id());

create policy cash_sel on cash_sessions                  for select using (store_id = current_store_id());
create policy cash_ins on cash_sessions                  for insert with check (store_id = current_store_id());
create policy cash_upd on cash_sessions                  for update using (store_id = current_store_id());

-- sales: ทุกคนในร้านสร้าง/อ่านได้; ห้าม DELETE (ไม่มี policy delete = ลบไม่ได้)
create policy sales_sel on sales                         for select using (store_id = current_store_id());
create policy sales_ins on sales                         for insert with check (store_id = current_store_id());
create policy sales_upd on sales                         for update using (store_id = current_store_id());

create policy sale_items_sel on sale_items               for select using (store_id = current_store_id());
create policy sale_items_ins on sale_items               for insert with check (store_id = current_store_id());

create policy inv_sel on inventory_movements             for select using (store_id = current_store_id());
create policy inv_ins on inventory_movements             for insert with check (store_id = current_store_id());

create policy adj_sel on stock_adjustments               for select using (store_id = current_store_id());
create policy adj_ins on stock_adjustments               for insert with check (store_id = current_store_id());

-- activity_logs: append-only (insert + select ภายในร้าน; ไม่มี update/delete policy)
create policy act_sel on activity_logs                   for select using (store_id = current_store_id() and is_owner());
create policy act_ins on activity_logs                   for insert with check (store_id = current_store_id());

create policy notif_sel on notification_logs             for select using (store_id = current_store_id() and is_owner());
create policy notif_all on notification_logs             for all    using (store_id = current_store_id()) with check (store_id = current_store_id());

-- settings: owner เท่านั้น
create policy settings_sel on settings                   for select using (store_id = current_store_id() and is_owner());
create policy settings_mod on settings                   for all    using (store_id = current_store_id() and is_owner()) with check (store_id = current_store_id());

-- NOTE (cost/profit): พนักงานไม่เห็นต้นทุน/กำไร
--   วิธี MVP: บังคับที่ระดับแอป — สร้าง VIEW สำหรับพนักงานที่ไม่ดึงคอลัมน์ cost_price,
--   หรือ API ไม่ส่ง cost ออกเมื่อ role=employee. (column-level RLS ทำใน Postgres ตรงๆ ไม่ได้)
--   ตัวอย่าง view สำหรับพนักงาน:
create or replace view products_employee as
  select id, store_id, category_id, name, unit, sell_price,
         stock_qty, min_stock, expiry_date, is_active, is_popular
  from products;

-- ============================================================
-- SEED DATA
-- ============================================================
insert into roles (id, name) values (1,'owner'), (2,'employee')
  on conflict do nothing;

-- ร้านตัวอย่าง
insert into stores (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Gift Store')
  on conflict do nothing;

-- หมวดสินค้าตัวอย่าง
insert into categories (store_id, name, sort_order) values
  ('00000000-0000-0000-0000-000000000001', 'ขนม', 1),
  ('00000000-0000-0000-0000-000000000001', 'เครื่องดื่ม', 2),
  ('00000000-0000-0000-0000-000000000001', 'เบียร์', 3),
  ('00000000-0000-0000-0000-000000000001', 'บุหรี่', 4),
  ('00000000-0000-0000-0000-000000000001', 'ของใช้ในบ้าน', 5)
  on conflict do nothing;

-- สินค้าตัวอย่าง (อ้างหมวดจากชื่อ)
insert into products (store_id, category_id, name, unit, cost_price, sell_price, stock_qty, min_stock, is_popular)
select '00000000-0000-0000-0000-000000000001', c.id, v.name, v.unit,
       v.cost, v.sell, v.qty, v.minq, v.popular
from (values
  ('โค้ก',           'เครื่องดื่ม', 'ขวด', 12.00, 15.00, 48, 12, true),
  ('มาม่าต้มยำกุ้ง', 'ขนม',        'ซอง',  5.00,  7.00, 60, 20, true),
  ('ช้างเย็น',       'เบียร์',      'ขวด', 45.00, 55.00, 24,  6, true),
  ('น้ำดื่ม',         'เครื่องดื่ม', 'ขวด',  4.00,  7.00, 72, 24, false),
  ('สบู่',           'ของใช้ในบ้าน','ก้อน', 18.00, 25.00, 30,  6, false)
) as v(name, cat, unit, cost, sell, qty, minq, popular)
join categories c
  on c.name = v.cat and c.store_id = '00000000-0000-0000-0000-000000000001'
on conflict do nothing;
