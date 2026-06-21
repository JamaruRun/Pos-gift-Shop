-- ============================================================
-- Stock Manager — Reporting Layer (Views + RPC)
-- Version: 1.0 (MVP)
-- ขึ้นกับ: schema.sql + rpc-functions.sql + rpc-cash-and-stock.sql
--
-- ครอบคลุม: Dashboard, Daily Sales History, Low Stock, Profit, Top Products, Activity feed
-- หลักการ: คำนวณรายงานใน DB ทั้งหมด (frontend ไม่คำนวณ)
--
-- โซนเวลา: ใช้ 'Asia/Bangkok' ในการตัดวัน ("วันนี้" = วันตามเวลาไทย)
--   created_at เป็น timestamptz -> แปลงเป็นเวลาไทยก่อนตัดเป็น ::date
-- ============================================================


-- ============================================================
-- 1) SCHEMA CHANGES (จำเป็น, idempotent)
-- ============================================================

-- 1.1 stores ขาด SELECT policy (schema.sql เปิด RLS แต่ไม่มี policy)
--     -> view_dashboard_today อ่าน stores ไม่ได้ถ้าไม่เพิ่ม policy นี้
drop policy if exists stores_sel on stores;
create policy stores_sel on stores
  for select using (id = current_store_id());

-- 1.2 index ช่วย query รายงาน (ดูเหตุผลในหัวข้อ INDEXES ท้ายไฟล์)
create index if not exists idx_sales_store_status_created
  on sales (store_id, status, created_at desc);


-- ============================================================
-- 2) SECURITY HELPER
-- ============================================================
-- ใช้ตรวจสิทธิ์ใน RPC ทุกตัว (functions เป็น SECURITY DEFINER -> bypass RLS
-- จึงต้องตรวจ store/role เองในนี้)
--
-- สมมติฐานความปลอดภัย:
--   * เรียกผ่าน JWT ผู้ใช้ (auth.uid() != null):
--       - ผู้ใช้ต้องมี profile, store ต้องตรง p_store_id (กัน cross-store)
--       - ถ้า require_owner -> role ต้องเป็น owner
--   * เรียกด้วย service_role (auth.uid() = null, จาก Next.js server):
--       - เชื่อว่า backend ตรวจตัวตน/สิทธิ์มาแล้ว -> ข้าม (แต่ query ยังกรองด้วย p_store_id)
-- ------------------------------------------------------------
create or replace function report_assert_access(
  p_store_id      uuid,
  p_require_owner boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user users%rowtype;
begin
  if auth.uid() is null then
    return;  -- service_role: trusted backend
  end if;

  select * into v_user from users where auth_user_id = auth.uid();
  if not found then
    raise exception 'NO_PROFILE';
  end if;
  if v_user.store_id <> p_store_id then
    raise exception 'CROSS_STORE_DENIED';
  end if;
  if p_require_owner and v_user.role_id <> 1 then
    raise exception 'OWNER_ONLY';
  end if;
end;
$$;


-- ============================================================
-- 3) VIEWS
-- ============================================================
-- ใช้ security_invoker = on -> RLS ของผู้เรียกมีผล (กรอง store อัตโนมัติ, กัน cross-store)

-- ---------- 3.1 view_dashboard_today ----------
-- การ์ด Dashboard 4 ใบ. เป็นหน้า owner เท่านั้น (มีกำไร) -> ใส่ where is_owner()
-- ถ้าไม่ใช่ owner view คืน 0 แถว (พนักงานเห็นกำไรไม่ได้แม้ query ตรง)
create or replace view view_dashboard_today
with (security_invoker = on) as
select
  s.id as store_id,
  -- รายได้วันนี้ (เฉพาะบิล completed ตามเวลาไทย)
  coalesce((
    select sum(sl.total)
    from sales sl
    where sl.store_id = s.id and sl.status = 'completed'
      and (sl.created_at at time zone 'Asia/Bangkok')::date
          = (now() at time zone 'Asia/Bangkok')::date
  ), 0)::numeric(12,2) as total_revenue_today,
  -- กำไรวันนี้ = ยอดขาย - ต้นทุน (ใช้ unit_cost snapshot ตอนขาย)
  coalesce((
    select sum(si.line_total - si.qty * si.unit_cost)
    from sale_items si
    join sales sl on sl.id = si.sale_id
    where sl.store_id = s.id and sl.status = 'completed'
      and (sl.created_at at time zone 'Asia/Bangkok')::date
          = (now() at time zone 'Asia/Bangkok')::date
  ), 0)::numeric(12,2) as total_profit_today,
  -- เงินสดในลิ้นชัก = expected_cash ของกะที่เปิดอยู่ (ถ้าไม่มีกะเปิด = 0)
  coalesce((
    select cs.expected_cash
    from cash_sessions cs
    where cs.store_id = s.id and cs.status = 'open'
    order by cs.opened_at desc limit 1
  ), 0)::numeric(12,2) as current_expected_cash,
  -- จำนวนสินค้าใกล้หมด
  coalesce((
    select count(*)
    from products p
    where p.store_id = s.id and p.is_active and p.stock_qty <= p.min_stock
  ), 0)::int as low_stock_count
from stores s
where is_owner();   -- Dashboard = owner-only

-- ---------- 3.2 view_low_stock_products ----------
-- ใช้ได้ทั้ง Dashboard (owner) และหน้าเช็คสต็อก (พนักงานเห็นจำนวนได้ ไม่ sensitive)
create or replace view view_low_stock_products
with (security_invoker = on) as
select
  p.store_id,
  p.id as product_id,
  p.name as product_name,
  p.stock_qty,
  p.min_stock,
  (p.min_stock - p.stock_qty)::numeric(12,3) as shortage_amount
from products p
where p.is_active and p.stock_qty <= p.min_stock
order by p.stock_qty asc;


-- ============================================================
-- 4) RPC FUNCTIONS
-- ============================================================

-- ---------- 4.1 rpc_get_daily_sales_history ----------
-- ประวัติการขายตามช่วงวัน + รายการสินค้าซ้อน (nested) สำหรับหน้า owner
-- Input : p_store_id, p_start_date, p_end_date  (วันที่แบบเวลาไทย, รวมปลายทั้งสอง)
-- Return: jsonb array (เรียงล่าสุดก่อน)
create or replace function rpc_get_daily_sales_history(
  p_store_id   uuid,
  p_start_date date,
  p_end_date   date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform report_assert_access(p_store_id, true);  -- owner only

  select coalesce(jsonb_agg(row_to_jsonb(t) order by t.sale_datetime desc), '[]'::jsonb)
  into v_result
  from (
    select
      s.id            as sale_id,
      s.created_at    as sale_datetime,
      u.full_name     as employee_name,
      s.total         as total_amount,
      s.payment_method,
      s.status,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'product_name', si.product_name,
                 'qty',          si.qty,
                 'unit_price',   si.unit_price,
                 'subtotal',     si.line_total))
        from sale_items si where si.sale_id = s.id
      ), '[]'::jsonb) as items
    from sales s
    join users u on u.id = s.user_id
    where s.store_id = p_store_id
      and (s.created_at at time zone 'Asia/Bangkok')::date between p_start_date and p_end_date
  ) t;

  return v_result;
end;
$$;

-- ---------- 4.2 rpc_get_today_summary ----------
-- สรุปยอดวันนี้ (owner only)
create or replace function rpc_get_today_summary(
  p_store_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today  date := (now() at time zone 'Asia/Bangkok')::date;
  v_rev    numeric(12,2);
  v_profit numeric(12,2);
  v_count  int;
  v_cash   numeric(12,2);
  v_pp     numeric(12,2);
begin
  perform report_assert_access(p_store_id, true);  -- owner only

  select coalesce(sum(s.total),0), count(*),
         coalesce(sum(s.total) filter (where s.payment_method='cash'),0),
         coalesce(sum(s.total) filter (where s.payment_method='promptpay'),0)
    into v_rev, v_count, v_cash, v_pp
  from sales s
  where s.store_id = p_store_id and s.status='completed'
    and (s.created_at at time zone 'Asia/Bangkok')::date = v_today;

  select coalesce(sum(si.line_total - si.qty * si.unit_cost),0)
    into v_profit
  from sale_items si
  join sales s on s.id = si.sale_id
  where s.store_id = p_store_id and s.status='completed'
    and (s.created_at at time zone 'Asia/Bangkok')::date = v_today;

  return jsonb_build_object(
    'total_revenue',        v_rev,
    'total_profit',         v_profit,
    'total_sales_count',    v_count,
    'average_sale_amount',  case when v_count > 0 then round(v_rev / v_count, 2) else 0 end,
    'cash_sales_total',     v_cash,
    'promptpay_sales_total',v_pp
  );
end;
$$;

-- ---------- 4.3 rpc_get_top_products ----------
-- สินค้าขายดี (ทุกช่วงเวลา, เฉพาะบิล completed) — ไม่ sensitive ไม่บังคับ owner
create or replace function rpc_get_top_products(
  p_store_id   uuid,
  p_limit_count int default 5
)
returns table (
  product_name   text,
  total_qty_sold numeric,
  total_revenue  numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform report_assert_access(p_store_id, false);

  return query
  select si.product_name,
         sum(si.qty)::numeric        as total_qty_sold,
         sum(si.line_total)::numeric as total_revenue
  from sale_items si
  join sales s on s.id = si.sale_id
  where s.store_id = p_store_id and s.status='completed'
  group by si.product_name
  order by total_qty_sold desc
  limit greatest(p_limit_count, 1);
end;
$$;

-- ---------- 4.4 rpc_get_profit_report ----------
-- รายงานกำไรตามช่วงวัน (owner only). ใช้ unit_cost snapshot เท่านั้น
create or replace function rpc_get_profit_report(
  p_store_id   uuid,
  p_start_date date,
  p_end_date   date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev  numeric(12,2);
  v_cost numeric(12,2);
  v_prof numeric(12,2);
begin
  perform report_assert_access(p_store_id, true);  -- owner only

  select coalesce(sum(si.line_total),0),
         coalesce(sum(si.qty * si.unit_cost),0)   -- snapshot ต้นทุน ณ เวลาขาย
    into v_rev, v_cost
  from sale_items si
  join sales s on s.id = si.sale_id
  where s.store_id = p_store_id and s.status='completed'
    and (s.created_at at time zone 'Asia/Bangkok')::date between p_start_date and p_end_date;

  v_prof := v_rev - v_cost;

  return jsonb_build_object(
    'total_revenue',        v_rev,
    'total_cost',           v_cost,
    'total_profit',         v_prof,
    'profit_margin_percent',case when v_rev > 0 then round(v_prof / v_rev * 100, 2) else 0 end
  );
end;
$$;

-- ---------- 4.5 rpc_get_recent_activities ----------
-- ฟีดกิจกรรมล่าสุดสำหรับ Dashboard (owner only — activity log เป็น sensitive)
create or replace function rpc_get_recent_activities(
  p_store_id    uuid,
  p_limit_count int default 10
)
returns table (
  user_name  text,
  action     text,
  entity     text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform report_assert_access(p_store_id, true);  -- owner only

  return query
  select coalesce(u.full_name, 'ระบบ') as user_name,
         a.action, a.entity, a.created_at
  from activity_logs a
  left join users u on u.id = a.user_id
  where a.store_id = p_store_id
  order by a.created_at desc
  limit greatest(p_limit_count, 1);
end;
$$;


-- ============================================================
-- 5) GRANTS
-- ============================================================
grant select on view_dashboard_today    to authenticated;
grant select on view_low_stock_products  to authenticated;

revoke all on function rpc_get_daily_sales_history(uuid,date,date) from public, anon;
revoke all on function rpc_get_today_summary(uuid)                 from public, anon;
revoke all on function rpc_get_top_products(uuid,int)              from public, anon;
revoke all on function rpc_get_profit_report(uuid,date,date)       from public, anon;
revoke all on function rpc_get_recent_activities(uuid,int)         from public, anon;

grant execute on function rpc_get_daily_sales_history(uuid,date,date) to authenticated, service_role;
grant execute on function rpc_get_today_summary(uuid)                 to authenticated, service_role;
grant execute on function rpc_get_top_products(uuid,int)              to authenticated, service_role;
grant execute on function rpc_get_profit_report(uuid,date,date)       to authenticated, service_role;
grant execute on function rpc_get_recent_activities(uuid,int)         to authenticated, service_role;


-- ============================================================
-- 6) INDEXES — เหตุผล & query pattern
-- ============================================================
-- idx_sales_store_status_created (store_id, status, created_at desc)  [เพิ่มในไฟล์นี้]
--   ใช้กับเกือบทุกรายงาน: กรอง store + status='completed' + ช่วงวัน/วันนี้
--   ครอบคลุม: view_dashboard_today, today_summary, profit_report, daily_sales_history
--   pattern: WHERE store_id=? AND status='completed' AND created_at::date ... ORDER BY created_at DESC
--
-- idx_sale_items_sale (sale_id)            [มีใน schema.sql]
--   nested loop join sales -> sale_items ตอนดึงรายการในบิล / รวมกำไร
--
-- idx_sale_items_product (product_id)      [มีใน schema.sql]
--   ไม่ได้ใช้ตรงๆ ใน top_products (group by product_name) แต่ช่วย query รายสินค้าอื่น
--
-- idx_products_low_stock (store_id) where is_active  [มีใน schema.sql]
--   ช่วยกรอง active products ของร้านก่อนเทียบ stock_qty <= min_stock
--   (เงื่อนไขเทียบ 2 คอลัมน์ทำ index ตรงๆ ไม่ได้ -> กรอง active ด้วย index แล้ว filter ที่เหลือ)
--
-- idx_activity_store_created (store_id, created_at desc)  [มีใน schema.sql]
--   recent_activities: WHERE store_id=? ORDER BY created_at DESC LIMIT n  (ใช้ index ตรงๆ)
--
-- หมายเหตุประสิทธิภาพ: ร้านเล็กข้อมูลไม่มาก index ชุดนี้เพียงพอ ไม่ต้อง materialized view
--   ไม่ต้อง pre-aggregate (จะ over-engineer) — query ตรงเร็วพออยู่แล้ว


-- ============================================================
-- 7) SECURITY NOTES (สรุป)
-- ============================================================
-- * Views: security_invoker=on -> RLS ของผู้เรียกมีผล กรอง store อัตโนมัติ (กัน cross-store)
-- * view_dashboard_today: where is_owner() -> พนักงาน query ได้ 0 แถว (กันเห็นกำไร)
-- * RPC: SECURITY DEFINER + report_assert_access() ตรวจ store + owner ทุกตัว
--     - sensitive (กำไร/ประวัติ/activity) = owner only
--     - ไม่ sensitive (top products) = ทุก role ในร้าน
-- * ทุก RPC กรอง store_id ใน query ซ้ำอีกชั้น แม้ assert ผ่านแล้ว
-- * GRANT เฉพาะ authenticated/service_role, ตัด anon/public ออก
-- * กำไรใช้ sale_items.unit_cost (snapshot) เท่านั้น — ไม่ใช้ products.cost_price ปัจจุบัน
--     (ราคาทุนเปลี่ยนภายหลังไม่ทำให้กำไรย้อนหลังเพี้ยน)


-- ============================================================
-- 8) ตัวอย่างการเรียกจาก Supabase client (Next.js, server-side)
-- ============================================================
-- Dashboard การ์ด (อ่าน view):
--   const { data } = await supabase
--     .from('view_dashboard_today').select('*').eq('store_id', storeId).single()
--   // { total_revenue_today, total_profit_today, current_expected_cash, low_stock_count }
--
-- สินค้าใกล้หมด:
--   const { data } = await supabase
--     .from('view_low_stock_products').select('*').eq('store_id', storeId)
--
-- ประวัติการขายรายวัน:
--   const { data } = await supabase.rpc('rpc_get_daily_sales_history', {
--     p_store_id: storeId, p_start_date: '2026-06-21', p_end_date: '2026-06-21' })
--
-- สรุปวันนี้:
--   const { data } = await supabase.rpc('rpc_get_today_summary', { p_store_id: storeId })
--
-- สินค้าขายดี:
--   const { data } = await supabase.rpc('rpc_get_top_products', { p_store_id: storeId, p_limit_count: 5 })
--
-- รายงานกำไร:
--   const { data } = await supabase.rpc('rpc_get_profit_report', {
--     p_store_id: storeId, p_start_date: '2026-06-01', p_end_date: '2026-06-30' })
--
-- กิจกรรมล่าสุด:
--   const { data } = await supabase.rpc('rpc_get_recent_activities', { p_store_id: storeId, p_limit_count: 10 })


-- ============================================================
-- 9) ตัวอย่าง JSON response
-- ============================================================
-- view_dashboard_today:
-- { "store_id":"...", "total_revenue_today":4250.00, "total_profit_today":980.00,
--   "current_expected_cash":3100.00, "low_stock_count":6 }
--
-- view_low_stock_products:
-- [ { "store_id":"...", "product_id":"...", "product_name":"น้ำดื่ม",
--     "stock_qty":5, "min_stock":24, "shortage_amount":19 } ]
--
-- rpc_get_daily_sales_history:
-- [ { "sale_id":"...", "sale_datetime":"2026-06-21T14:32:00+07:00",
--     "employee_name":"สมชาย", "total_amount":245.00,
--     "payment_method":"cash", "status":"completed",
--     "items":[ {"product_name":"โค้ก","qty":2,"unit_price":15.00,"subtotal":30.00},
--               {"product_name":"มาม่าต้มยำกุ้ง","qty":5,"unit_price":7.00,"subtotal":35.00} ] } ]
--
-- rpc_get_today_summary:
-- { "total_revenue":4250.00, "total_profit":980.00, "total_sales_count":37,
--   "average_sale_amount":114.86, "cash_sales_total":3100.00, "promptpay_sales_total":1150.00 }
--
-- rpc_get_top_products:
-- [ { "product_name":"โค้ก", "total_qty_sold":48, "total_revenue":720.00 } ]
--
-- rpc_get_profit_report:
-- { "total_revenue":125000.00, "total_cost":98000.00, "total_profit":27000.00, "profit_margin_percent":21.60 }
--
-- rpc_get_recent_activities:
-- [ { "user_name":"สมชาย", "action":"sale.create", "entity":"sale", "created_at":"2026-06-21T14:32:00+07:00" } ]
