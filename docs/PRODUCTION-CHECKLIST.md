# Production Checklist — Grocery POS (ร้าน Gift)

> เวอร์ชัน 1.0 · Phase 9D · ใช้ตรวจก่อน/หลัง deploy demo
> คู่กับ [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 🗄️ Database
- [ ] รัน migration ครบ 6 ไฟล์ตามลำดับ (schema → rpc-functions → rpc-cash-and-stock → reporting → line-worker-schema → **seed-demo-users**)
- [ ] `roles` มี owner(1)/employee(2)
- [ ] seed `stores`/`categories`/`products` ครบ
- [ ] **`users` มี gift(owner)/somchai(employee)** ตรง UUID lib/auth.ts (ไม่งั้น 403/USER_NOT_FOUND)
- [ ] `NEXT_PUBLIC_STORE_ID` ตรงกับ store id ใน DB (00000000-…-0001)
- [ ] index ครบ (pg_trgm บน products.name, idx_notif_due ฯลฯ)

## 🔐 Auth (⚠️ demo mode)
- [ ] เข้าใจว่า PIN ตรวจฝั่ง client (mock) — **ยังไม่ปลอดภัยจริง**
- [ ] owner/employee เข้าระบบ + redirect ตาม role ถูกต้อง
- [ ] (เมื่อทำ Phase C) `users.auth_user_id` ถูกเติมครบ

## 🛡️ RLS
- [ ] RLS เปิดทุกตารางธุรกิจ
- [ ] employee ดู cost/profit ไม่ได้ (view `products_employee`)
- [ ] `sales` ไม่มี DELETE policy (ลบบิลไม่ได้)
- [ ] cross-store: ผู้ใช้เห็นเฉพาะ store ตัวเอง (ตรวจเมื่อมี session จริง Phase C)

## 🔌 API Routes (owner-only ตรวจฝั่ง server)
- [ ] `/api/products/*`, `/api/stock/receive` → owner เท่านั้น (create/update/receive)
- [ ] `/api/reports/*`, `/api/sales/history`, `/api/dashboard/today` → owner เท่านั้น → 403 ถ้าไม่ใช่
- [ ] `/api/low-stock`, `/api/cash-session/current` → ทุก role
- [ ] `/api/cash-session/open|close`, `/api/employees/*` → owner เท่านั้น
- [ ] service_role ไม่หลุดใน client bundle

## 🛒 POS
- [ ] ค้นหาด้วยชื่อไทย / ปุ่มขายดี
- [ ] สต็อก 0 ปิดปุ่ม, qty เกินสต็อกไม่ได้
- [ ] เงินสด: ต้องเปิดกะก่อน (ไม่มีกะ → บล็อก + ข้อความไทย)
- [ ] พร้อมเพย์: ขายได้แม้ไม่มีกะ
- [ ] ขายสำเร็จ → ตัดสต็อก + สรุป + เคลียร์ตะกร้า
- [ ] employee POS **ไม่ได้รับ** cost_price (ตรวจ network)

## 📦 Products
- [ ] owner: เพิ่ม/แก้/ปิดการขาย (soft delete) + รับของเข้า
- [ ] employee: อ่านอย่างเดียว ไม่เห็นต้นทุน ไม่มีปุ่ม
- [ ] รับของเข้า → สต็อก/ต้นทุนอัปเดต

## 💵 Cash Session
- [ ] owner เปิด/ปิดกะ; กันเปิดซ้ำ
- [ ] ปิดกะ → ส่วนต่างถูกต้อง (เขียว/แดง)
- [ ] employee เข้าหน้านี้ไม่ได้

## 📊 Reports
- [ ] Dashboard การ์ดแรก "รายได้วันนี้"
- [ ] today summary / profit report ใช้ unit_cost snapshot
- [ ] sales history เลือกวัน + กางบิล
- [ ] low-stock แสดงถูกต้อง

## 👥 Employees
- [ ] owner: เพิ่ม/แก้/เปิด-ปิดใช้งาน; username ซ้ำ → error
- [ ] PIN ≥ 4 หลัก (⚠️ ยังไม่ hash — Phase B)
- [ ] ปิดบัญชีตัวเอง/owner ไม่ได้

## 🔔 LINE Notification
- [ ] migration line-worker-schema รันแล้ว (payload/processing/retry)
- [ ] env LINE_* + CRON_SECRET ตั้งบน Vercel
- [ ] vercel.json cron ทำงาน (Production)
- [ ] ขาย → ได้ LINE 🛒 ≤ 1 นาที
- [ ] ยกเลิกบิล → LINE ⚠️ · ปิดกะ → LINE 📊
- [ ] worker: ไม่มี secret → 401
- [ ] failed retry backoff ทำงาน (ทดสอบด้วย token ผิดชั่วคราว)

## 🔒 Security
- [ ] ค่าลับทั้งหมดไม่มี `NEXT_PUBLIC_`
- [ ] LINE token/service_role เรียกจาก server เท่านั้น
- [ ] worker คืนแค่ตัวเลขสรุป (ไม่ leak บิล)
- [ ] (ทราบ) user_id spoofing แก้ที่ Phase C

## 🎬 Demo Checklist สำหรับ Gift
1. [ ] เปิดเว็บ → login เจ้าของ
2. [ ] เปิดกะเงินสด (เงินทอนตั้งต้น)
3. [ ] ไปหน้าขาย → ค้นหา "มาม่า/โค้ก" → ขาย 1 บิลเงินสด → เห็นเงินทอน
4. [ ] เจ้าของได้ LINE แจ้งเตือนการขาย 🛒
5. [ ] ดู Dashboard → "รายได้วันนี้" ขึ้นยอด
6. [ ] รับของเข้า → สต็อกเพิ่ม
7. [ ] เพิ่มพนักงาน → logout → login พนักงาน (หมายเหตุ: demo auth ยังไม่ผูก DB)
8. [ ] พนักงานเห็นแค่ ขาย/สินค้า/ของใกล้หมด (ไม่เห็นต้นทุน/รายงาน)
9. [ ] เจ้าของปิดกะ → เทียบเงิน → ได้ LINE สรุปกะ 📊
10. [ ] ดูประวัติการขายรายวัน + รายงานกำไร

> หมายเหตุ demo: ระบบยังเป็น online-first, auth เป็น demo — ใช้ในสภาพแวดล้อมที่ควบคุมได้
