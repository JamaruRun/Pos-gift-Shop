-- ============================================================
-- Seed Demo Users — สำหรับ demo ที่ควบคุมได้ (Supabase จริง)
-- Version: 1.0  |  idempotent
--
-- ทำไมต้องมี: auth ยังเป็น demo (client ส่ง user_id ตาม lib/auth.ts MOCK_USERS)
--   ถ้า users เหล่านี้ไม่อยู่ใน DB -> RPC raise USER_NOT_FOUND และ owner check = 403
--   ไฟล์นี้ใส่ user 2 คนด้วย UUID ตรงกับ lib/auth.ts เพื่อให้ demo ทำงานได้
--
-- ⚠️ ไม่ใช่การเปลี่ยน auth architecture — login ยังตรวจ PIN ฝั่ง client (mock)
-- ⚠️ pin_hash เป็น placeholder (ยังไม่ใช้ใน login จริงจนกว่า Auth Phase B)
-- ⚠️ auth_user_id = null (ยังไม่ผูก Supabase Auth จนกว่า Phase C)
--
-- ขึ้นกับ: schema.sql (ต้องรันก่อน — ตาราง users + seed store + roles)
-- store id ต้องตรงกับ NEXT_PUBLIC_STORE_ID = 00000000-0000-0000-0000-000000000001
-- ============================================================

insert into users (id, store_id, username, full_name, role_id, is_active, pin_hash)
values
  ('11111111-1111-1111-1111-111111111111',
     '00000000-0000-0000-0000-000000000001',
        'gift', 'Gift (เจ้าของ)', 1, true, '1111'),
          ('22222222-2222-2222-2222-222222222222',
             '00000000-0000-0000-0000-000000000001',
                'somchai', 'สมชาย', 2, true, '2222')
                on conflict (id) do update set
                  store_id  = excluded.store_id,
                    username  = excluded.username,
                      full_name = excluded.full_name,
                        role_id   = excluded.role_id,
                          is_active = excluded.is_active;

                          -- verify:
                          --   select id, username, role_id, is_active from users
                          --   where store_id = '00000000-0000-0000-0000-000000000001';
                          