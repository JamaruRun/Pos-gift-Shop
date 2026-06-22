-- ============================================================
-- LINE Worker — notification_logs schema upgrade (Phase 9A)
-- Version: 1.0  |  idempotent migration (รันซ้ำได้)
--
-- เตรียม notification_logs ให้ worker ทำงานได้อย่างเชื่อถือได้:
--   - คิว: pending -> processing -> sent/failed
--   - retry: retry_count + next_retry_at (backoff)
--   - stuck recovery: processing_at
--   - payload jsonb: ข้อมูลครบสำหรับสร้างข้อความ (สำคัญมากกับ cash_close ที่ sale_id=null)
--
-- ❗ ไฟล์นี้ไม่ส่ง LINE และไม่เรียก LINE Messaging API — เตรียม schema/RPC เท่านั้น
-- ขึ้นกับ: schema.sql, rpc-functions.sql, rpc-cash-and-stock.sql
-- ============================================================

-- ---------- 1) STATUS: เพิ่ม 'processing' ----------
alter table notification_logs
  drop constraint if exists notification_logs_status_check;
alter table notification_logs
  add constraint notification_logs_status_check
  check (status in ('pending','processing','sent','failed'));

-- ---------- 2) EVENT_TYPE: ยืนยัน sale/void/cash_close (idempotent re-assert) ----------
alter table notification_logs
  add column if not exists event_type text not null default 'sale';
alter table notification_logs
  drop constraint if exists notification_logs_event_type_check;
alter table notification_logs
  add constraint notification_logs_event_type_check
  check (event_type in ('sale','void','cash_close'));

-- ---------- 3) คอลัมน์ใหม่สำหรับ worker ----------
-- retry_count / error มีอยู่แล้วใน schema.sql -> add if not exists เพื่อความปลอดภัย
alter table notification_logs add column if not exists retry_count   int not null default 0;
alter table notification_logs add column if not exists error         text;
alter table notification_logs add column if not exists payload       jsonb;        -- snapshot ข้อความ
alter table notification_logs add column if not exists next_retry_at timestamptz;  -- exponential backoff
alter table notification_logs add column if not exists processing_at timestamptz;  -- เวลาเริ่มประมวลผล (stuck recovery)
alter table notification_logs add column if not exists sent_at       timestamptz;  -- เวลาส่งสำเร็จ

-- ---------- 4) INDEXES ----------
-- เลือกงานที่ถึงกำหนด: pending/failed ที่ next_retry_at <= now()
create index if not exists idx_notif_due
  on notification_logs (store_id, status, next_retry_at);

-- กู้แถวค้าง: processing ที่ค้างนาน
create index if not exists idx_notif_processing
  on notification_logs (status, processing_at)
  where status = 'processing';

-- lookup ตาม sale (sale/void)
create index if not exists idx_notif_sale_lookup
  on notification_logs (sale_id);


-- ============================================================
-- 5) จุดที่ RPC เขียน payload (อัปเดตแล้วในไฟล์ RPC จริง)
-- ============================================================
-- ไฟล์ที่แก้: rpc-functions.sql (create_sale, void_sale), rpc-cash-and-stock.sql (close_cash_session)
-- พฤติกรรมธุรกิจไม่เปลี่ยน — เพิ่มเฉพาะคอลัมน์ payload ใน insert notification_logs
--
-- create_sale -> notification_logs:
--   insert into notification_logs (store_id, sale_id, channel, event_type, status, payload)
--   values (p_store_id, v_sale_id, 'line', 'sale', 'pending', jsonb_build_object(
--     'event_type','sale','sale_id',v_sale_id,'store_id',p_store_id,
--     'employee_name',v_user.full_name,'total_amount',v_total,
--     'payment_method',p_payment_method,'created_at',now(),
--     'sale_items', (select jsonb_agg(jsonb_build_object(
--        'product_name',si.product_name,'qty',si.qty,'subtotal',si.line_total))
--        from sale_items si where si.sale_id = v_sale_id)));
--
-- void_sale -> notification_logs:
--   ... 'event_type'='void', sale_id, store_id, employee_name (ผู้ยกเลิก),
--       total_amount, void_reason, created_at
--
-- close_cash_session -> notification_logs (sale_id = null):
--   ... 'event_type'='cash_close', store_id, cash_session_id,
--       expected_cash, actual_cash, difference, closed_at
--   *** payload จำเป็นเพราะ cash_close ไม่มี sale_id เชื่อม ***


-- ============================================================
-- 6) MIGRATION NOTES
-- ============================================================
-- ลำดับรัน (ครั้งเดียว, idempotent):
--   1) schema.sql               (ครั้งแรก)
--   2) rpc-functions.sql        (อัปเดต create_sale/void_sale ให้เขียน payload)
--   3) rpc-cash-and-stock.sql   (อัปเดต close_cash_session ให้เขียน payload)
--   4) reporting.sql            (ไม่กระทบ)
--   5) line-worker-schema.sql   (ไฟล์นี้ — เพิ่มคอลัมน์/สถานะ/index)
-- ทั้งหมด CREATE OR REPLACE / ADD IF NOT EXISTS / DROP IF EXISTS -> รันซ้ำปลอดภัย
--
-- แถวเก่า (ก่อน migration): payload = null, status คงเดิม (pending/sent/failed)
--   worker ควรรองรับ payload null ของแถวเก่า (fallback ไป fetch จาก sale_id ถ้ามี)
--   แถว cash_close เก่าที่ payload null จะส่งไม่ได้ -> ปล่อยเป็น dead-letter หรือ mark sent ด้วยมือ


-- ============================================================
-- 7) ROLLBACK NOTES
-- ============================================================
-- ย้อน schema (ถ้าจำเป็น) — ระวังข้อมูลในคอลัมน์ที่ดรอปจะหาย:
--   drop index if exists idx_notif_due;
--   drop index if exists idx_notif_processing;
--   drop index if exists idx_notif_sale_lookup;
--   alter table notification_logs drop column if exists payload;
--   alter table notification_logs drop column if exists next_retry_at;
--   alter table notification_logs drop column if exists processing_at;
--   alter table notification_logs drop column if exists sent_at;
--   -- คืน status เป็น 3 ค่า (ต้องไม่มีแถว status='processing' ค้างก่อน):
--   update notification_logs set status='pending' where status='processing';
--   alter table notification_logs drop constraint if exists notification_logs_status_check;
--   alter table notification_logs add constraint notification_logs_status_check
--     check (status in ('pending','sent','failed'));
-- RPC: revert การเพิ่ม payload ได้โดย re-run เวอร์ชันเดิมของ insert (ไม่กระทบ business logic)
--
-- หมายเหตุ: retry_count/error เป็นของเดิมใน schema.sql -> ไม่ควร rollback


-- ============================================================
-- 8) TESTING (verify หลัง migrate + อัปเดต RPC)
-- ============================================================
-- ขาย 1 บิล แล้วตรวจ payload:
--   select event_type, status, retry_count, payload
--   from notification_logs where event_type='sale' order by created_at desc limit 1;
--   -- คาดหวัง: status=pending, retry_count=0, payload มี sale_items[]
--
-- ยกเลิกบิล:
--   select payload from notification_logs where event_type='void' order by created_at desc limit 1;
--   -- คาดหวัง: void_reason, employee_name, total_amount
--
-- ปิดกะ:
--   select payload from notification_logs where event_type='cash_close' order by created_at desc limit 1;
--   -- คาดหวัง: expected_cash, actual_cash, difference, cash_session_id (sale_id = null)
--
-- คิวที่ worker จะหยิบ:
--   select id, event_type, retry_count from notification_logs
--   where status in ('pending','failed')
--     and (next_retry_at is null or next_retry_at <= now())
--   order by created_at limit 20;
--
-- กันซ้ำ: ขาย 1 บิล -> ต้องได้ notification_logs เพียง 1 แถวต่อ sale_id+event_type
--   select sale_id, event_type, count(*) from notification_logs
--   group by sale_id, event_type having count(*) > 1;   -- คาดหวัง: 0 แถว
