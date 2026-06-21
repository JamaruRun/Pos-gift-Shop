# Auth Migration Plan — Grocery POS (ร้าน Gift)

> เวอร์ชัน 1.0 · Phase 2.5 · คู่กับ [auth-architecture.md](auth-architecture.md)
> เอกสารแผนเท่านั้น — ยังไม่เขียนโค้ดโปรดักชัน

---

## ภาพรวม 4 เฟส

| Phase | ชื่อ | สถานะ | auth.uid() | RLS |
|---|---|---|---|---|
| A | Demo auth (ปัจจุบัน) | ✅ ทำแล้ว | null | bypass (service_role) |
| B | Server-side validation | ⏳ | null | bypass |
| C | Supabase session | ⏳ | มีค่า | เริ่มทำงาน |
| D | Full RLS enforcement | ⏳ | มีค่า | บังคับเต็ม |

หลักการ migration: **เพิ่มทีละชั้น ไม่ rewrite** — โครง Context/RPC คงเดิมตลอด

---

## Phase A — Demo Auth (ปัจจุบัน)

**มีแล้ว:**
- `lib/auth.ts` (MOCK_USERS + PIN ฝั่ง client)
- `lib/auth-context.tsx` (AuthProvider)
- localStorage session
- client-side route guard (`canAccessPath`)

**ใช้สำหรับ:** demo UI / ทดสอบ flow โดยไม่ต้องมี Supabase
**ข้อจำกัด:** ไม่ปลอดภัย ห้ามใช้กับข้อมูลจริง

---

## Phase B — Server-side Validation

**เป้าหมาย:** ย้ายการตรวจ PIN จาก client → server (ยังไม่ต้องมี Supabase session)

**งาน:**
1. เพิ่มคอลัมน์/ยืนยัน `users.pin_hash` (bcrypt) — schema มี `pin_hash` อยู่แล้ว
2. สร้าง RPC `verify_pin(p_username, p_pin)` (SECURITY DEFINER) คืน profile ถ้า PIN ถูก + active
   - เปรียบเทียบด้วย `crypt()` / extension `pgcrypto` (มีแล้วใน schema)
3. สร้าง Route Handler `POST /api/login` เรียก `verify_pin` ผ่าน **service_role**
4. แก้ `lib/auth.ts → login()` ให้ fetch `/api/login` แทนการเช็ค MOCK_USERS
5. ออก signed httpOnly cookie ของแอปเอง (ชั่วคราว ก่อนมี Supabase session)

**ผลลัพธ์:** PIN ไม่อยู่ใน bundle อีกต่อไป, ปลอม role ฝั่ง client ยากขึ้น
**auth.uid() ยังเป็น null** → RPC ยังวิ่งผ่าน service_role

---

## Phase C — Supabase Session

**เป้าหมาย:** ให้ `auth.uid()` มีค่า เพื่อเปิดทาง RLS

**งาน:**
1. สร้างบัญชี Supabase Auth ให้ผู้ใช้แต่ละคน (1 user = 1 auth identity)
   - วิธีแนะนำ: ใช้ email สังเคราะห์ `username@store-<id>.local` + password ที่ระบบจัดการ
   - **เติม `users.auth_user_id` = id จาก `auth.users`** ← จุดเปิดสวิตช์ทั้งระบบ
2. `POST /api/login`: หลัง `verify_pin` ผ่าน → สร้าง Supabase session ให้ auth identity นั้น
   - เช่น `supabase.auth.admin.generateLink` / signInWithPassword ฝั่ง server แล้ว set session cookie
3. เพิ่ม `lib/supabase/server.ts` + `middleware.ts` ให้ refresh session ทุก request (มีโครง server client แล้ว)
4. แก้ `AuthProvider`: useEffect แรกอ่าน `supabase.auth.getSession()` + ดึง profile จาก `users`, subscribe `onAuthStateChange`
5. แก้ `logout`: `supabase.auth.signOut()`

**ผลลัพธ์:** ทุก RPC ที่เรียกด้วย session ผู้ใช้จะมี `auth.uid()` → guard `AUTH_MISMATCH` และ `report_assert_access` ทำงานจริง

---

## Phase D — Full RLS Enforcement

**เป้าหมาย:** บังคับ RLS เต็ม, ลดการพึ่ง service_role ให้เหลือเฉพาะ worker

**งาน:**
1. เปลี่ยนการเรียก RPC ฝั่งแอปจาก service_role → **client ที่ผูก session ผู้ใช้** (anon key + JWT)
2. คง service_role เฉพาะงานเบื้องหลังที่ต้องข้าม RLS: worker ส่ง LINE, cron
3. ทดสอบทุก policy: cross-store, owner-only, append-only (sales/activity ลบไม่ได้)
4. เพิ่ม session expiry + เพิกถอนเมื่อปิดใช้งานพนักงาน (`is_active=false` → block)
5. Audit: ยืนยันพนักงานอ่าน cost/profit ไม่ได้ทั้งทาง view และ RPC

**ผลลัพธ์:** ความปลอดภัยอยู่ที่ DB เป็นหลัก แม้แอปมีบั๊กก็ยังกันข้อมูลข้าม store/role ได้

---

## รีวิว RPC ทั้งหมด — จะทำงานต่อหลัง migration หรือไม่

ตรวจแล้วทุกตัวใช้รูปแบบเดียวกัน: ผูกตัวตนผ่าน `users.auth_user_id = auth.uid()` และอ่าน role/store จาก DB

| RPC | กลไก auth | ต้องแก้โค้ดไหม | เงื่อนไข |
|---|---|---|---|
| `create_sale` | guard `auth.uid()` ↔ p_user_id | **ไม่ต้อง** | ต้องเติม auth_user_id (Phase C) |
| `void_sale` | guard + `role_id=1` จาก DB | **ไม่ต้อง** | เหมือนกัน |
| `open_cash_session` | guard + owner-only | **ไม่ต้อง** | เหมือนกัน |
| `close_cash_session` | guard + owner-only | **ไม่ต้อง** | เหมือนกัน |
| `receive_stock` | guard + owner/flag | **ไม่ต้อง** | เหมือนกัน |
| `report_assert_access` (ใช้โดย reporting RPC ทุกตัว) | `auth.uid()` null=service_role, ไม่ null=ตรวจ store/owner | **ไม่ต้อง** | เหมือนกัน |
| `view_dashboard_today` / `view_low_stock_products` | `security_invoker=on` + `is_owner()`/RLS | **ไม่ต้อง** | RLS ทำงานเมื่อมี session (Phase C+) |

### สรุป: ✅ ไม่มี RPC ตัวใดต้องแก้โค้ด

**ข้อกำหนดเดียว (ไม่ใช่การแก้ RPC แต่เป็น data/infra):**
1. **เติม `users.auth_user_id`** ให้ตรงกับ `auth.uid()` ทุกบัญชี (Phase C)
2. **ออก Supabase session จริง** ตอน login (Phase C)
3. (ทางเลือก Phase B) เพิ่ม RPC ใหม่ `verify_pin` — เป็นการ "เพิ่ม" ไม่ใช่แก้ของเดิม

### หมายเหตุพฤติกรรมช่วงเปลี่ยนผ่าน
- ตราบใดที่เรียก RPC ด้วย **service_role** (Phase A–B): guard `auth.uid()` = null → ข้าม → ทำงานได้ แต่ความปลอดภัยพึ่ง backend
- เมื่อสลับเป็น **session ผู้ใช้** (Phase C–D): guard เริ่มบังคับ — **ถ้ายังไม่เติม `auth_user_id` จะเกิด `AUTH_MISMATCH`** → ต้องทำข้อ 1 ให้ครบก่อนสลับ

---

## ลำดับแนะนำ & ความเสี่ยง

| ขั้น | ก่อนทำ | ความเสี่ยงถ้าข้าม |
|---|---|---|
| 1 | Phase B (server PIN) | PIN หลุดใน bundle |
| 2 | เติม auth_user_id ครบ **ก่อน** เปิด session | AUTH_MISMATCH ทั้งระบบ |
| 3 | Phase C (session) | RLS ไม่ทำงาน |
| 4 | Phase D (สลับ service_role→user) | ถ้าสลับเร็วไปก่อน policy ครบ อาจล็อกตัวเองออก |

**กฎทอง:** ทำ Phase ตามลำดับ A→B→C→D, ทดสอบ auth_user_id ครบก่อนเปิด session, เก็บ service_role ไว้ทำ worker เท่านั้นในตอนจบ
