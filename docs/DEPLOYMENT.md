# Deployment Guide — Grocery POS (ร้าน Gift)

> เวอร์ชัน 1.0 · Phase 9D · Stack: Next.js 14 (Vercel) + Supabase + LINE Messaging API
> ⚠️ Auth ยังเป็น **demo mode** (username+PIN mock/localStorage) — เหมาะ demo ที่ควบคุมได้ ยังไม่ปลอดภัยสำหรับร้านจริง 24/7 (ต้องทำ Auth Phase B/C ก่อน — ดู [auth-migration-plan.md](auth-migration-plan.md))

---

## 1. Supabase Setup

1. สร้างโปรเจกต์ที่ https://supabase.com → จดค่า:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY` (**ลับ — server เท่านั้น**)
2. เปิด SQL Editor แล้วรัน migration **ตามลำดับ** (ข้อ 2)
3. ตรวจ seed: ตาราง `stores`, `roles`, `categories`, `products` มีข้อมูลตัวอย่าง
4. ผูกผู้ใช้: (เมื่อทำ Auth Phase C) เติม `users.auth_user_id` ให้ตรง `auth.uid()`

---

## 2. SQL Migration Order (รันใน Supabase SQL Editor)

รันทีละไฟล์ **ตามลำดับนี้** (ทุกไฟล์ idempotent — รันซ้ำปลอดภัย):

```
1) docs/schema.sql              -- ตาราง + RLS + pg_trgm + seed (store/roles/categories/products)
2) docs/rpc-functions.sql       -- create_sale, void_sale (+ payload)
3) docs/rpc-cash-and-stock.sql  -- open/close_cash_session, receive_stock (+ payload)
4) docs/reporting.sql           -- views + reporting RPC + stores select policy
5) docs/line-worker-schema.sql  -- notification_logs: processing/payload/retry/index
6) docs/seed-demo-users.sql     -- ⚠️ จำเป็นสำหรับ demo: user gift/somchai ตรง UUID กับ lib/auth.ts
```

> **⚠️ ข้อ 6 ห้ามข้าม** — ถ้าไม่ seed users, owner action จะ 403 และ create_sale จะ USER_NOT_FOUND
> ตรวจหลังรัน:
> - `select id, role_id from roles;` (owner=1, employee=2)
> - `select count(*) from products;`
> - `select username, role_id from users where store_id='00000000-0000-0000-0000-000000000001';` (ต้องได้ gift, somchai)

---

## 3. Environment Variables

| ตัวแปร | ที่มา | ฝั่ง | ลับ |
|---|---|---|:--:|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API | client+server | - |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase API | client+server | - |
| `NEXT_PUBLIC_STORE_ID` | seed store id | client+server | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase API | **server** | 🔒 |
| `CRON_SECRET` | สุ่มเอง (เช่น `openssl rand -hex 32`) | **server** | 🔒 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Console | **server** | 🔒 |
| `LINE_OWNER_USER_ID` | LINE (userId เจ้าของ) | **server** | 🔒 |
| `LINE_NOTIFY_BATCH_SIZE` | optional (default 20) | server | - |

> 🔒 ห้ามใส่ prefix `NEXT_PUBLIC_` กับค่าลับ — จะหลุดขึ้น client bundle

---

## 4. LINE Official Account + Messaging API Setup

1. สร้าง LINE Official Account: https://www.linebiz.com/th/ (หรือ LINE Developers)
2. LINE Developers Console → สร้าง **Provider** → **Messaging API channel**
3. แท็บ Messaging API:
   - ออก **Channel access token (long-lived)** → `LINE_CHANNEL_ACCESS_TOKEN`
   - ปิด auto-reply ได้ตามต้องการ
4. หา **LINE_OWNER_USER_ID** (userId ของเจ้าของ):
   - เจ้าของแอดเป็นเพื่อนกับ OA → ใช้ webhook ชั่วคราว/เครื่องมือดู userId จาก event
   - หรือใช้ Messaging API ดึงจาก event `source.userId`
5. ทดสอบ push ด้วย curl:
   ```bash
   curl -X POST https://api.line.me/v2/bot/message/push \
     -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"to":"'$LINE_OWNER_USER_ID'","messages":[{"type":"text","text":"ทดสอบจากร้าน Gift"}]}'
   ```

---

## 5. Vercel Setup

1. Import repo เข้า Vercel (Framework: Next.js — auto)
2. Project Settings → Environment Variables: ใส่ทุกตัวจากข้อ 3
   - เลือก scope: Production (+ Preview ถ้าต้องการ)
3. Deploy

### Vercel Cron (worker LINE)
- `vercel.json` (มีในรูট) ตั้ง cron ยิง `/api/notifications/process` ทุก 1 นาที:
  ```json
  { "crons": [{ "path": "/api/notifications/process", "schedule": "* * * * *" }] }
  ```
- **สำคัญ:** เมื่อมี env `CRON_SECRET` Vercel จะแนบ `Authorization: Bearer ${CRON_SECRET}` ให้กับ request ของ cron อัตโนมัติ → ตรงกับที่ route ตรวจ
- Cron ทำงานเฉพาะบน **Production deployment**

---

## 6. Smoke Test (หลัง deploy)

```bash
BASE=https://<your-app>.vercel.app
# worker auth: ไม่มี secret -> 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/api/notifications/process
# products (employee ไม่มี cost)
curl -s "$BASE/api/products?role=employee" | grep -c cost_price   # ควรเป็น 0
```
แล้วทดสอบผ่าน UI ตาม [PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md)

LINE end-to-end: เปิดกะ → ขาย 1 บิล → รอ ≤ 1 นาที → เจ้าของได้ LINE 🛒

---

## 7. Rollback Notes

- **โค้ด (Vercel):** Deployments → เลือก deployment เดิม → "Promote to Production" (instant rollback)
- **SQL:** migration เป็น additive/idempotent เป็นหลัก; การย้อน `line-worker-schema.sql` ดู rollback notes ในไฟล์นั้น (ระวังข้อมูล payload/สถานะหาย)
- **Cron:** ลบ block `crons` ใน `vercel.json` แล้ว redeploy เพื่อหยุด worker
- **LINE:** เพิกถอน/ออก channel access token ใหม่ได้ใน LINE Console

---

## 8. Known Production Limitations

| เรื่อง | สถานะ | หมายเหตุ |
|---|---|---|
| **Auth ยัง demo (PIN ฝั่ง client)** | ⚠️ บล็อกการใช้ร้านจริง | ต้องทำ Phase B/C ก่อน live |
| user_id spoofing (ไม่มี auth.uid binding) | ⚠️ | แก้ที่ Phase C |
| RLS ยังไม่บังคับเต็ม (เรียก RPC ผ่าน service_role) | ⚠️ | Phase D |
| worker claim ไม่ใช่ SKIP LOCKED แท้ | 🟡 | พอสำหรับ cron เดี่ยว; hardening = Phase 9C |
| ไม่มี offline | ตามดีไซน์ | เน็ตล่ม = ขายไม่ได้ (แนะนำ 4G สำรอง) |
| LINE เป็น text ล้วน | 🟢 | Flex message ภายหลัง |
| last_login ไม่ติดตาม | 🟢 | ทำตอน Auth จริง |

✅ เหมาะสำหรับ **demo ที่ควบคุมได้** ให้คุณ Gift ลองใช้ — ยังไม่ควรเปิดใช้จริงเชิงพาณิชย์จนกว่า Auth Phase B/C เสร็จ
