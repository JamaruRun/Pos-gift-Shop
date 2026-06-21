-- ============================================================
-- Stock Manager — Core POS RPC Functions
-- Version: 1.0 (MVP)
-- ขึ้นกับ: docs/schema.sql (ต้องรัน schema.sql ก่อน)
--
-- ฟังก์ชันในไฟล์นี้:
--   1) create_sale(...)  -> ขาย 1 บิล แบบ atomic
--   2) void_sale(...)    -> ยกเลิกบิล (owner เท่านั้น)
--
-- หลักการความปลอดภัย (อ่านก่อนใช้):
--   * ใช้ SECURITY DEFINER เพื่อให้ฟังก์ชันเขียนข้าม RLS ได้ในธุรกรรมเดียว
--     => ฟังก์ชันเองคือ "ขอบเขตความปลอดภัย" ต้อง validate ทุก input ภายใน
--   * ตั้ง search_path = public กันการโจมตีผ่าน search_path hijack
--   * ถ้าถูกเรียกผ่าน client ที่มี JWT (auth.uid() ไม่ null) จะบังคับว่า
--     p_user_id ต้องตรงกับผู้ล็อกอิน (users.auth_user_id = auth.uid())
--     กันการสวมรอย user อื่น
--   * ถ้าถูกเรียกด้วย service_role (auth.uid() = null เช่นจาก Next.js server)
--     จะถือว่า backend ตรวจตัวตนมาแล้ว -> ข้ามการเช็ค auth.uid()
--   * ไม่ส่ง LINE ใน SQL — สร้างแค่ notification_logs (status='pending')
--     ให้ worker/API ฝั่ง backend ดึงไปส่งภายหลัง
-- ============================================================

-- ---------- REQUIRED SCHEMA CHANGE (idempotent) ----------
-- จำเป็นสำหรับให้ worker แยกข้อความ "ขาย" vs "ยกเลิก"
alter table notification_logs
  add column if not exists event_type text not null default 'sale'
  check (event_type in ('sale','void'));


-- ============================================================
-- FUNCTION 1: create_sale  — ขาย 1 บิล (atomic)
-- ============================================================
-- Input:
--   p_store_id       uuid
--   p_user_id        uuid      (พนักงาน/เจ้าของที่กดขาย)
--   p_payment_method text      ('cash' | 'promptpay')
--   p_paid_amount    numeric   (เงินที่รับมา; ใช้คำนวณเงินทอน)
--   p_items          jsonb     [{ "product_id": "...", "qty": 2 }, ...]
--                              *** อ้างสินค้าด้วย product_id ที่ได้จากผลค้นหาชื่อ ***
--                              *** ไม่มี barcode ***
--
-- ราคา/ต้นทุน: ดึงจาก products ฝั่ง DB (ไม่เชื่อราคาที่ client ส่งมา)
--   -> สร้าง snapshot unit_price/unit_cost/product_name ลง sale_items
--
-- Return (jsonb):
--   { success, sale_id, total_amount, change_amount, message }
--
-- Atomicity: ทั้งฟังก์ชันคือ 1 ธุรกรรม ถ้า RAISE ที่จุดใด -> rollback ทั้งหมด
--   ใช้ SELECT ... FOR UPDATE ล็อกแถวสินค้า/กะ กัน race condition สต็อก
-- ------------------------------------------------------------
create or replace function create_sale(
  p_store_id       uuid,
  p_user_id        uuid,
  p_payment_method text,
  p_paid_amount    numeric,
  p_items          jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        users%rowtype;
  v_session     cash_sessions%rowtype;
  v_sale_id     uuid;
  v_total       numeric(12,2) := 0;
  v_change      numeric(12,2) := 0;
  v_item        jsonb;
  v_product     products%rowtype;
  v_qty         numeric(12,3);
  v_line_total  numeric(12,2);
begin
  -- ---- 1) validate payment method ----
  if p_payment_method not in ('cash','promptpay') then
    raise exception 'INVALID_PAYMENT_METHOD: %', p_payment_method;
  end if;

  -- ---- 2) validate items ----
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'NO_ITEMS: ต้องมีสินค้าอย่างน้อย 1 รายการ';
  end if;

  -- ---- 3) validate user belongs to store + active ----
  select * into v_user from users where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_user.store_id <> p_store_id then
    raise exception 'USER_STORE_MISMATCH';
  end if;
  if not v_user.is_active then
    raise exception 'USER_INACTIVE';
  end if;

  -- ---- 3.1) caller identity guard (กันสวมรอยเมื่อเรียกด้วย JWT) ----
  if auth.uid() is not null and v_user.auth_user_id is distinct from auth.uid() then
    raise exception 'AUTH_MISMATCH: ผู้เรียกไม่ตรงกับ p_user_id';
  end if;

  -- ---- 4) ถ้าเงินสด ต้องมีกะเปิดอยู่ (ล็อกแถวกะ) ----
  if p_payment_method = 'cash' then
    select * into v_session
    from cash_sessions
    where user_id = p_user_id and store_id = p_store_id and status = 'open'
    for update;
    if not found then
      raise exception 'NO_OPEN_CASH_SESSION: กรุณาเปิดกะก่อนขายเงินสด';
    end if;
  end if;

  -- ---- 5) สร้างบิล (total ชั่วคราว = 0 แล้วอัปเดตทีหลัง) ----
  insert into sales (
    store_id, user_id, cash_session_id, total, paid, change, payment_method, status
  ) values (
    p_store_id, p_user_id,
    case when p_payment_method = 'cash' then v_session.id else null end,
    0, p_paid_amount, 0, p_payment_method, 'completed'
  )
  returning id into v_sale_id;

  -- ---- 6) วนแต่ละรายการ: validate + ตัดสต็อก + movement ----
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QTY: %', v_item;
    end if;

    -- ล็อกแถวสินค้ากัน race condition
    select * into v_product
    from products
    where id = (v_item->>'product_id')::uuid
    for update;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND: %', v_item->>'product_id';
    end if;
    if v_product.store_id <> p_store_id then
      raise exception 'PRODUCT_STORE_MISMATCH: %', v_product.name;
    end if;
    if not v_product.is_active then
      raise exception 'PRODUCT_INACTIVE: %', v_product.name;
    end if;
    if v_product.stock_qty < v_qty then
      raise exception 'INSUFFICIENT_STOCK: % (คงเหลือ %, ต้องการ %)',
        v_product.name, v_product.stock_qty, v_qty;
    end if;

    -- ใช้ราคาจาก DB เป็น snapshot (ไม่เชื่อ client)
    v_line_total := round(v_product.sell_price * v_qty, 2);
    v_total := v_total + v_line_total;

    insert into sale_items (
      store_id, sale_id, product_id, product_name, qty, unit_price, unit_cost, line_total
    ) values (
      p_store_id, v_sale_id, v_product.id, v_product.name, v_qty,
      v_product.sell_price, v_product.cost_price, v_line_total
    );

    update products
      set stock_qty = stock_qty - v_qty
      where id = v_product.id;

    insert into inventory_movements (
      store_id, product_id, type, qty_change, ref_table, ref_id, user_id, note
    ) values (
      p_store_id, v_product.id, 'sale', -v_qty, 'sales', v_sale_id, p_user_id, 'ขายสินค้า'
    );
  end loop;

  -- ---- 7) ตรวจเงินรับ (เฉพาะเงินสด) + คำนวณเงินทอน ----
  if p_payment_method = 'cash' and p_paid_amount < v_total then
    raise exception 'INSUFFICIENT_PAYMENT: รับ % ต้องการ %', p_paid_amount, v_total;
  end if;
  v_change := greatest(coalesce(p_paid_amount,0) - v_total, 0);

  update sales
    set total = v_total, change = v_change
    where id = v_sale_id;

  -- ---- 8) อัปเดต expected_cash ของกะ (เฉพาะเงินสด) ----
  -- expected_cash สะสมแบบ incremental = opening_cash + ยอดขายเงินสดสะสม
  if p_payment_method = 'cash' then
    update cash_sessions
      set expected_cash = coalesce(expected_cash, opening_cash) + v_total
      where id = v_session.id;
  end if;

  -- ---- 9) activity log ----
  insert into activity_logs (store_id, user_id, action, entity, entity_id, detail)
  values (
    p_store_id, p_user_id, 'sale.create', 'sale', v_sale_id,
    jsonb_build_object('total', v_total, 'payment_method', p_payment_method, 'items', p_items)
  );

  -- ---- 10) notification (pending) — ไม่ส่ง LINE ที่นี่ ----
  insert into notification_logs (store_id, sale_id, channel, event_type, status)
  values (p_store_id, v_sale_id, 'line', 'sale', 'pending');

  -- ---- 11) return ----
  return jsonb_build_object(
    'success',       true,
    'sale_id',       v_sale_id,
    'total_amount',  v_total,
    'change_amount', v_change,
    'message',       'บันทึกการขายสำเร็จ'
  );
end;
$$;


-- ============================================================
-- FUNCTION 2: void_sale  — ยกเลิกบิล (owner เท่านั้น)
-- ============================================================
-- Input:
--   p_sale_id     uuid
--   p_user_id     uuid     (ต้องเป็น owner)
--   p_void_reason text     (บังคับ)
--
-- การทำงาน:
--   * เปลี่ยน status เป็น 'void' (ไม่ลบบิลจริง)
--   * คืนสต็อก + inventory_movements type='void_restock'
--   * ถ้าเป็นเงินสด -> ลด expected_cash ของกะที่บิลผูกอยู่
--   * activity log + notification_logs (event_type='void', pending)
--
-- Return (jsonb): { success, sale_id, message }
-- ------------------------------------------------------------
create or replace function void_sale(
  p_sale_id     uuid,
  p_user_id     uuid,
  p_void_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    users%rowtype;
  v_sale    sales%rowtype;
  v_item    sale_items%rowtype;
  v_session cash_sessions%rowtype;
begin
  -- ---- 1) validate reason ----
  if p_void_reason is null or length(trim(p_void_reason)) = 0 then
    raise exception 'VOID_REASON_REQUIRED: ต้องระบุเหตุผลการยกเลิก';
  end if;

  -- ---- 2) validate user + owner ----
  select * into v_user from users where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
  if not v_user.is_active then
    raise exception 'USER_INACTIVE';
  end if;
  if auth.uid() is not null and v_user.auth_user_id is distinct from auth.uid() then
    raise exception 'AUTH_MISMATCH';
  end if;
  -- role_id = 1 คือ owner (ดู seed roles ใน schema.sql)
  if v_user.role_id <> 1 then
    raise exception 'ONLY_OWNER_CAN_VOID: เฉพาะเจ้าของเท่านั้นที่ยกเลิกบิลได้';
  end if;

  -- ---- 3) validate sale (ล็อกแถว) ----
  select * into v_sale from sales where id = p_sale_id for update;
  if not found then
    raise exception 'SALE_NOT_FOUND';
  end if;
  if v_sale.store_id <> v_user.store_id then
    raise exception 'SALE_STORE_MISMATCH';
  end if;
  if v_sale.status <> 'completed' then
    raise exception 'SALE_NOT_COMPLETED: บิลนี้สถานะ % ยกเลิกไม่ได้', v_sale.status;
  end if;

  -- ---- 4) คืนสต็อก + movement ----
  for v_item in select * from sale_items where sale_id = p_sale_id
  loop
    update products
      set stock_qty = stock_qty + v_item.qty
      where id = v_item.product_id;

    insert into inventory_movements (
      store_id, product_id, type, qty_change, ref_table, ref_id, user_id, note
    ) values (
      v_sale.store_id, v_item.product_id, 'void_restock', v_item.qty,
      'sales', p_sale_id, p_user_id, 'คืนสต็อกจากการยกเลิกบิล'
    );
  end loop;

  -- ---- 5) เปลี่ยนสถานะบิลเป็น void ----
  update sales
    set status = 'void', void_reason = p_void_reason,
        voided_by = p_user_id, voided_at = now()
    where id = p_sale_id;

  -- ---- 6) ปรับ expected_cash (เฉพาะเงินสด + กะยังเปิด) ----
  if v_sale.payment_method = 'cash' and v_sale.cash_session_id is not null then
    select * into v_session
    from cash_sessions
    where id = v_sale.cash_session_id and status = 'open'
    for update;
    if found then
      update cash_sessions
        set expected_cash = coalesce(expected_cash, opening_cash) - v_sale.total
        where id = v_session.id;
    end if;
    -- ถ้ากะปิดไปแล้ว: ไม่แก้ย้อนหลัง (กะที่ปิดเป็น immutable) — ส่วนต่างจะสะท้อนใน report
  end if;

  -- ---- 7) activity log ----
  insert into activity_logs (store_id, user_id, action, entity, entity_id, detail)
  values (
    v_sale.store_id, p_user_id, 'sale.void', 'sale', p_sale_id,
    jsonb_build_object('reason', p_void_reason, 'total', v_sale.total,
                       'payment_method', v_sale.payment_method)
  );

  -- ---- 8) notification (pending, event_type='void') ----
  insert into notification_logs (store_id, sale_id, channel, event_type, status)
  values (v_sale.store_id, p_sale_id, 'line', 'void', 'pending');

  return jsonb_build_object(
    'success', true,
    'sale_id', p_sale_id,
    'message', 'ยกเลิกบิลสำเร็จ'
  );
end;
$$;


-- ============================================================
-- GRANTS
-- ============================================================
-- ให้ผู้ใช้ที่ล็อกอิน (และ service_role) เรียกได้; ปิดไม่ให้ public/anon เรียก
revoke all on function create_sale(uuid,uuid,text,numeric,jsonb) from public, anon;
revoke all on function void_sale(uuid,uuid,text)               from public, anon;
grant execute on function create_sale(uuid,uuid,text,numeric,jsonb) to authenticated, service_role;
grant execute on function void_sale(uuid,uuid,text)               to authenticated, service_role;


-- ============================================================
-- ตัวอย่างการเรียก (psql / SQL editor)
-- ============================================================
-- ขาย 1 บิล (เงินสด รับ 100 บาท)
--
-- select create_sale(
--   '00000000-0000-0000-0000-000000000001'::uuid,         -- p_store_id
--   '11111111-1111-1111-1111-111111111111'::uuid,         -- p_user_id
--   'cash',                                               -- p_payment_method
--   100,                                                  -- p_paid_amount
--   '[{"product_id":"<โค้ก uuid>","qty":2},
--     {"product_id":"<มาม่า uuid>","qty":5}]'::jsonb      -- p_items
-- );
-- => {"success":true,"sale_id":"...","total_amount":65.00,"change_amount":35.00,"message":"บันทึกการขายสำเร็จ"}
--
-- ยกเลิกบิล (owner)
-- select void_sale(
--   '<sale uuid>'::uuid,
--   '<owner user uuid>'::uuid,
--   'ลูกค้าคืนสินค้า'
-- );
-- => {"success":true,"sale_id":"...","message":"ยกเลิกบิลสำเร็จ"}


-- ============================================================
-- วิธีเรียกจาก Next.js (App Router) — supabase-js
-- ============================================================
-- ใช้ supabase.rpc() ชื่อฟังก์ชันตรงกับชื่อ SQL, key ของ params ตรงกับชื่อพารามิเตอร์
--
-- // app/api/sales/route.ts  (Route Handler ฝั่ง server)
-- import { createClient } from '@/lib/supabase/server'
--
-- export async function POST(req: Request) {
--   const { storeId, userId, paymentMethod, paidAmount, items } = await req.json()
--   const supabase = createClient()            // ใช้ session ของผู้ใช้ (auth.uid() ถูกตั้ง)
--
--   const { data, error } = await supabase.rpc('create_sale', {
--     p_store_id:       storeId,
--     p_user_id:        userId,
--     p_payment_method: paymentMethod,         // 'cash' | 'promptpay'
--     p_paid_amount:    paidAmount,
--     p_items:          items,                 // [{ product_id, qty }]
--   })
--
--   if (error) return Response.json({ ok:false, error: error.message }, { status: 400 })
--   return Response.json({ ok:true, ...data })  // { sale_id, total_amount, change_amount }
-- }
--
-- void:
--   const { data, error } = await supabase.rpc('void_sale', {
--     p_sale_id: saleId, p_user_id: userId, p_void_reason: reason,
--   })
--
-- หมายเหตุการ integrate:
--   1) เรียกจาก server-side (Route Handler / Server Action) ไม่ใช่จาก client ตรงๆ
--      เพื่อไม่ให้ client ปลอม p_user_id (และ guard auth.uid() จะช่วยอีกชั้น)
--   2) error.message จะเป็นรหัสที่ raise ไว้ เช่น 'INSUFFICIENT_STOCK: ...'
--      ฝั่ง UI ควร map รหัสเหล่านี้เป็นข้อความภาษาไทยที่เป็นมิตร
--   3) หลัง create_sale/void_sale สำเร็จ จะมีแถว notification_logs status='pending'
--      -> worker/Cron แยกต่างหาก (เช่น Supabase Edge Function หรือ Vercel Cron)
--         ดึง pending ไปยิง LINE Messaging API แล้วอัปเดตเป็น 'sent'/'failed'
--   4) อย่ายิง LINE จากใน request ของการขาย (กันหน้าขายค้างถ้า LINE ช้า/ล่ม)
