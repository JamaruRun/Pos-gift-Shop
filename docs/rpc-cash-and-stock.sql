-- ============================================================
-- Stock Manager — RPC: Cash Session & Receive Stock
-- Version: 1.0 (MVP)
-- ขึ้นกับ: docs/schema.sql + docs/rpc-functions.sql (รันก่อน)
--
-- ฟังก์ชันในไฟล์นี้:
--   1) open_cash_session(...)   -> เปิดกะเงินสด
--   2) close_cash_session(...)  -> ปิดกะ (owner เท่านั้น) + คำนวณส่วนต่าง
--   3) receive_stock(...)       -> รับของเข้า (เพิ่มสต็อก)
--
-- หลักการความปลอดภัย (เหมือน rpc-functions.sql):
--   * SECURITY DEFINER -> ฟังก์ชันคือขอบเขตความปลอดภัย ต้อง validate เองทั้งหมด
--   * set search_path = public กัน search_path hijack
--   * guard: ถ้า auth.uid() ไม่ null ต้องตรงกับ p_user_id (กันสวมรอย)
--     ถ้า auth.uid() null = ถูกเรียกด้วย service_role จาก backend (เชื่อว่าตรวจแล้ว)
--   * GRANT เฉพาะ authenticated + service_role (ไม่ให้ anon)
--   * atomic: ทุกฟังก์ชันเป็น 1 ธุรกรรม, ใช้ FOR UPDATE ล็อกแถวที่แก้
-- ============================================================

-- ---------- REQUIRED SCHEMA CHANGE (idempotent) ----------
-- เพิ่ม 'cash_close' ให้ notification_logs.event_type
-- (drop+recreate constraint เพราะค่าเดิมมีแค่ 'sale','void')
alter table notification_logs
  add column if not exists event_type text not null default 'sale';
alter table notification_logs
  drop constraint if exists notification_logs_event_type_check;
alter table notification_logs
  add constraint notification_logs_event_type_check
  check (event_type in ('sale','void','cash_close'));


-- ============================================================
-- FUNCTION 1: open_cash_session — เปิดกะเงินสด
-- ============================================================
-- ธุรกิจ: ต้นกะ พนักงาน/เจ้าของกรอก "เงินทอนตั้งต้น" (opening_cash)
--   ระบบเปิดกะใหม่ โดย expected_cash เริ่มต้น = opening_cash
--   ร้านนี้เป็น single register: อนุญาตให้มีกะเปิดได้ครั้งละ 1 กะต่อร้าน
--
-- Input : p_store_id, p_user_id, p_opening_cash
-- Return: { success, cash_session_id, message }
-- ------------------------------------------------------------
create or replace function open_cash_session(
  p_store_id     uuid,
  p_user_id      uuid,
  p_opening_cash numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       users%rowtype;
  v_session_id uuid;
  v_existing   uuid;
begin
  -- 1) validate opening_cash
  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'INVALID_OPENING_CASH';
  end if;

  -- 2) validate user อยู่ในร้าน + active
  select * into v_user from users where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.store_id <> p_store_id then raise exception 'USER_STORE_MISMATCH'; end if;
  if not v_user.is_active then raise exception 'USER_INACTIVE'; end if;

  -- 2.1) caller guard
  if auth.uid() is not null and v_user.auth_user_id is distinct from auth.uid() then
    raise exception 'AUTH_MISMATCH';
  end if;

  -- 2.2) owner เท่านั้น (final MVP: เปิด/ปิดกะเป็นสิทธิ์เจ้าของเด็ดขาด)
  if v_user.role_id <> 1 then  -- 1 = owner
    raise exception 'ONLY_OWNER_CAN_OPEN_CASH_SESSION: เฉพาะเจ้าของเท่านั้นที่เปิดกะได้';
  end if;

  -- 3) กันเปิดซ้ำ: ห้ามมีกะเปิดค้างอยู่ในร้านนี้
  --    ล็อกด้วย advisory lock ระดับ store กัน 2 คนเปิดพร้อมกัน
  perform pg_advisory_xact_lock(hashtext('cash_session:' || p_store_id::text));
  select id into v_existing
  from cash_sessions
  where store_id = p_store_id and status = 'open'
  limit 1;
  if v_existing is not null then
    raise exception 'CASH_SESSION_ALREADY_OPEN: มีกะเปิดค้างอยู่ (%) กรุณาปิดก่อน', v_existing;
  end if;

  -- 4) สร้างกะ; expected_cash เริ่ม = opening_cash
  insert into cash_sessions (
    store_id, user_id, opening_cash, expected_cash, status, opened_at
  ) values (
    p_store_id, p_user_id, p_opening_cash, p_opening_cash, 'open', now()
  )
  returning id into v_session_id;

  -- 5) activity log
  insert into activity_logs (store_id, user_id, action, entity, entity_id, detail)
  values (
    p_store_id, p_user_id, 'cash_session.open', 'cash_session', v_session_id,
    jsonb_build_object('opening_cash', p_opening_cash)
  );

  return jsonb_build_object(
    'success', true,
    'cash_session_id', v_session_id,
    'message', 'เปิดกะสำเร็จ'
  );
end;
$$;


-- ============================================================
-- FUNCTION 2: close_cash_session — ปิดกะ (owner เท่านั้น)
-- ============================================================
-- ธุรกิจ: สิ้นกะ เจ้าของนับเงินจริง (actual_cash) ระบบเทียบกับ expected_cash
--   difference = actual_cash - expected_cash
--     ติดลบ = เงินขาด (อาจรั่ว/ทอนผิด)  /  เกิน = เงินเกิน
--   ปิดแล้วแก้ไม่ได้ (immutable) + แจ้งเตือน owner ผ่าน LINE (pending)
--
-- Input : p_cash_session_id, p_user_id (owner), p_actual_cash
-- Return: { success, expected_cash, actual_cash, difference, message }
-- ------------------------------------------------------------
create or replace function close_cash_session(
  p_cash_session_id uuid,
  p_user_id         uuid,
  p_actual_cash     numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     users%rowtype;
  v_session  cash_sessions%rowtype;
  v_expected numeric(12,2);
  v_diff     numeric(12,2);
begin
  -- 1) validate actual_cash
  if p_actual_cash is null or p_actual_cash < 0 then
    raise exception 'INVALID_ACTUAL_CASH';
  end if;

  -- 2) validate user + owner
  select * into v_user from users where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if not v_user.is_active then raise exception 'USER_INACTIVE'; end if;
  if auth.uid() is not null and v_user.auth_user_id is distinct from auth.uid() then
    raise exception 'AUTH_MISMATCH';
  end if;
  if v_user.role_id <> 1 then  -- 1 = owner
    raise exception 'ONLY_OWNER_CAN_CLOSE: เฉพาะเจ้าของเท่านั้นที่ปิดกะได้';
  end if;

  -- 3) validate session (ล็อกแถว)
  select * into v_session from cash_sessions where id = p_cash_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.store_id <> v_user.store_id then raise exception 'SESSION_STORE_MISMATCH'; end if;
  if v_session.status <> 'open' then raise exception 'SESSION_NOT_OPEN: กะนี้ปิดไปแล้ว'; end if;

  -- 4) คำนวณส่วนต่าง
  v_expected := coalesce(v_session.expected_cash, v_session.opening_cash);
  v_diff := p_actual_cash - v_expected;

  -- 5) ปิดกะ
  update cash_sessions
    set actual_cash = p_actual_cash,
        expected_cash = v_expected,
        difference = v_diff,
        status = 'closed',
        closed_at = now()
    where id = p_cash_session_id;

  -- 6) activity log
  insert into activity_logs (store_id, user_id, action, entity, entity_id, detail)
  values (
    v_session.store_id, p_user_id, 'cash_session.close', 'cash_session', p_cash_session_id,
    jsonb_build_object('expected_cash', v_expected, 'actual_cash', p_actual_cash, 'difference', v_diff)
  );

  -- 7) notification (pending) — สรุปกะส่ง LINE ให้ owner
  insert into notification_logs (store_id, sale_id, channel, event_type, status)
  values (v_session.store_id, null, 'line', 'cash_close', 'pending');

  return jsonb_build_object(
    'success', true,
    'expected_cash', v_expected,
    'actual_cash', p_actual_cash,
    'difference', v_diff,
    'message', 'ปิดกะสำเร็จ'
  );
end;
$$;


-- ============================================================
-- FUNCTION 3: receive_stock — รับของเข้า (เพิ่มสต็อก)
-- ============================================================
-- ธุรกิจ: ของจากซัพพลายเออร์เข้าร้าน -> เพิ่ม stock_qty + บันทึก movement
--   อ้างสินค้าด้วย product_id (จากผลค้นหาชื่อ) -- ไม่มี barcode
--   ถ้า item มี cost_price จะอัปเดตต้นทุนล่าสุดของสินค้า (optional)
--
-- สิทธิ์ (MVP): owner รับของได้เสมอ
--   พนักงานรับของได้ก็ต่อเมื่อ settings key 'allow_employee_receive' = 'true'
--   (ไม่มี permission table ใน MVP -> ใช้ flag ใน settings; ค่าเริ่มต้น = owner-only)
--
-- Input : p_store_id, p_user_id, p_items
--   p_items: [{ "product_id":"...", "qty": 10, "cost_price": 12.00 (optional) }]
-- Return: { success, received_count, message }
-- ------------------------------------------------------------
create or replace function receive_stock(
  p_store_id uuid,
  p_user_id  uuid,
  p_items    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      users%rowtype;
  v_item      jsonb;
  v_product   products%rowtype;
  v_qty       numeric(12,3);
  v_cost      numeric(12,2);
  v_count     int := 0;
  v_allow_emp boolean := false;
begin
  -- 1) validate items
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'NO_ITEMS: ต้องมีสินค้าอย่างน้อย 1 รายการ';
  end if;

  -- 2) validate user อยู่ในร้าน + active
  select * into v_user from users where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.store_id <> p_store_id then raise exception 'USER_STORE_MISMATCH'; end if;
  if not v_user.is_active then raise exception 'USER_INACTIVE'; end if;
  if auth.uid() is not null and v_user.auth_user_id is distinct from auth.uid() then
    raise exception 'AUTH_MISMATCH';
  end if;

  -- 3) สิทธิ์: owner ผ่านเสมอ; พนักงานต้องเปิด flag
  if v_user.role_id <> 1 then  -- ไม่ใช่ owner
    select (value = 'true') into v_allow_emp
    from settings
    where store_id = p_store_id and key = 'allow_employee_receive';
    if not coalesce(v_allow_emp, false) then
      raise exception 'NOT_ALLOWED_RECEIVE: เฉพาะเจ้าของรับของได้ (MVP)';
    end if;
  end if;

  -- 4) วนแต่ละรายการ
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QTY: %', v_item;
    end if;

    -- ล็อกแถวสินค้า
    select * into v_product
    from products
    where id = (v_item->>'product_id')::uuid
    for update;

    if not found then raise exception 'PRODUCT_NOT_FOUND: %', v_item->>'product_id'; end if;
    if v_product.store_id <> p_store_id then raise exception 'PRODUCT_STORE_MISMATCH: %', v_product.name; end if;
    if not v_product.is_active then raise exception 'PRODUCT_INACTIVE: %', v_product.name; end if;

    -- cost_price optional: ถ้าส่งมาให้อัปเดตต้นทุนล่าสุด
    v_cost := nullif(v_item->>'cost_price','')::numeric;
    if v_cost is not null and v_cost < 0 then
      raise exception 'INVALID_COST: %', v_product.name;
    end if;

    update products
      set stock_qty = stock_qty + v_qty,
          cost_price = coalesce(v_cost, cost_price)
      where id = v_product.id;

    insert into inventory_movements (
      store_id, product_id, type, qty_change, ref_table, ref_id, user_id, note
    ) values (
      p_store_id, v_product.id, 'receive', v_qty, null, null, p_user_id, 'รับของเข้า'
    );

    v_count := v_count + 1;
  end loop;

  -- 5) activity log
  insert into activity_logs (store_id, user_id, action, entity, entity_id, detail)
  values (
    p_store_id, p_user_id, 'stock.receive', 'product', null,
    jsonb_build_object('received_count', v_count, 'items', p_items)
  );

  return jsonb_build_object(
    'success', true,
    'received_count', v_count,
    'message', 'รับของเข้าสำเร็จ ' || v_count || ' รายการ'
  );
end;
$$;


-- ============================================================
-- GRANTS
-- ============================================================
revoke all on function open_cash_session(uuid,uuid,numeric)   from public, anon;
revoke all on function close_cash_session(uuid,uuid,numeric)  from public, anon;
revoke all on function receive_stock(uuid,uuid,jsonb)         from public, anon;
grant execute on function open_cash_session(uuid,uuid,numeric)  to authenticated, service_role;
grant execute on function close_cash_session(uuid,uuid,numeric) to authenticated, service_role;
grant execute on function receive_stock(uuid,uuid,jsonb)        to authenticated, service_role;


-- ============================================================
-- ตัวอย่างการเรียก (psql / SQL editor)
-- ============================================================
-- เปิดกะ (เงินทอนตั้งต้น 1000)
-- select open_cash_session(
--   '00000000-0000-0000-0000-000000000001'::uuid,
--   '<user uuid>'::uuid,
--   1000
-- );  -- => { success, cash_session_id, message }
--
-- ปิดกะ (owner นับเงินจริง 5230)
-- select close_cash_session(
--   '<cash_session uuid>'::uuid,
--   '<owner uuid>'::uuid,
--   5230
-- );  -- => { expected_cash, actual_cash, difference, message }
--
-- รับของเข้า
-- select receive_stock(
--   '00000000-0000-0000-0000-000000000001'::uuid,
--   '<owner uuid>'::uuid,
--   '[{"product_id":"<โค้ก uuid>","qty":24,"cost_price":12.00},
--     {"product_id":"<มาม่า uuid>","qty":60}]'::jsonb
-- );  -- => { received_count, message }


-- ============================================================
-- วิธีเรียกจาก Next.js (App Router) — supabase-js
-- ============================================================
-- เรียกจาก server-side (Route Handler / Server Action) เสมอ ไม่ใช่ client ตรงๆ
--
-- // เปิดกะ
-- const { data, error } = await supabase.rpc('open_cash_session', {
--   p_store_id: storeId, p_user_id: userId, p_opening_cash: openingCash,
-- })
--
-- // ปิดกะ (owner)
-- const { data, error } = await supabase.rpc('close_cash_session', {
--   p_cash_session_id: sessionId, p_user_id: ownerId, p_actual_cash: countedCash,
-- })
--
-- // รับของเข้า
-- const { data, error } = await supabase.rpc('receive_stock', {
--   p_store_id: storeId, p_user_id: userId,
--   p_items: [{ product_id, qty, cost_price }],   // cost_price ใส่หรือไม่ก็ได้
-- })
--
-- หมายเหตุ integrate:
--   1) error.message = รหัส error (เช่น 'CASH_SESSION_ALREADY_OPEN: ...') -> map เป็นไทยใน UI
--   2) close_cash_session จะสร้าง notification_logs event_type='cash_close' (sale_id = null)
--      -> worker ส่งสรุปกะให้ owner ทาง LINE (ดึงตัวเลขจาก cash_sessions ที่เพิ่งปิด)
--   3) อนุญาตพนักงานรับของ: set settings key 'allow_employee_receive' = 'true'
--        insert into settings(store_id,key,value) values (storeId,'allow_employee_receive','true')
--        on conflict (store_id,key) do update set value = excluded.value;


-- ============================================================
-- สรุป Business Flow (ภาษาไทย)
-- ============================================================
-- [เปิดกะ] ต้นวัน/ต้นกะ -> open_cash_session(opening_cash)
--   - กันเปิดซ้ำ: 1 ร้านมีกะเปิดได้ครั้งละ 1 กะ (advisory lock กันแข่งกันเปิด)
--   - expected_cash เริ่มเท่ากับเงินทอนตั้งต้น
--
-- [ระหว่างกะ] ทุกการขายเงินสด (create_sale) จะบวก expected_cash ให้อัตโนมัติ
--   -> expected_cash = เงินทอนตั้งต้น + ยอดขายเงินสดสะสม (= เงินที่ควรมีในลิ้นชัก)
--
-- [ปิดกะ] สิ้นวัน เจ้าของนับเงินจริง -> close_cash_session(actual_cash)
--   - difference = actual_cash - expected_cash
--   - ติดลบ = เงินขาด (สัญญาณรั่ว/ทอนผิด), เกิน = เงินเกิน
--   - ปิดแล้ว immutable + ส่งสรุป LINE ให้เจ้าของ
--   - นี่คือกลไกกันโกงเงินสดหลักของระบบ
--
-- [รับของเข้า] receive_stock -> เพิ่ม stock_qty + movement type='receive'
--   - ทุกการเปลี่ยนสต็อกถูกบันทึกใน inventory_movements (ตรวจสอบของหายย้อนหลังได้)
--   - MVP: owner เท่านั้น (เปลี่ยนได้ผ่าน flag allow_employee_receive)
