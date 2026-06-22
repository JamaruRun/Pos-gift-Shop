# LINE Notification Worker — Implementation Plan

> เวอร์ชัน 1.0 · Phase 9 · คู่กับ [line-worker.md](line-worker.md)
> เอกสารแผน + design เท่านั้น — **ยังไม่เขียน production code** (โค้ดในไฟล์นี้เป็น pseudo/sketch ประกอบการออกแบบ)

---

## 1. Required Schema Changes — ✅ ทำแล้วใน Phase 9A

ย้ายไปไฟล์ [line-worker-schema.sql](line-worker-schema.sql) (idempotent) และอัปเดต RPC ให้เขียน `payload` แล้ว
สรุป ALTER (รายละเอียดเต็มในไฟล์นั้น):

```sql
-- 1) สถานะ processing (idempotency lock) + ขยาย check
alter table notification_logs
  drop constraint if exists notification_logs_status_check;
alter table notification_logs
  add constraint notification_logs_status_check
  check (status in ('pending','processing','sent','failed'));

-- 2) คอลัมน์สำหรับ lock + backoff
alter table notification_logs add column if not exists processing_at timestamptz;
alter table notification_logs add column if not exists next_retry_at  timestamptz;
alter table notification_logs add column if not exists sent_at        timestamptz;

-- 3) payload เก็บ snapshot ข้อมูลสำหรับสร้างข้อความ
--    จำเป็นมากสำหรับ cash_close (ไม่มี sale_id เชื่อม)
alter table notification_logs add column if not exists payload jsonb;

-- index ช่วย worker เลือกงาน
create index if not exists idx_notif_due
  on notification_logs (store_id, status, next_retry_at);
```

> ⚠️ ข้อ 3 ต้องให้ RPC `close_cash_session` (และเผื่อ sale/void) **เขียน payload** ตอนสร้างแถว
> = การแก้ RPC เล็กน้อยใน phase ถัดไป (flag ไว้ — อยู่นอก Phase 9 ที่เป็น docs-only)
> ทางเลือกถ้าไม่อยากแก้ RPC: worker fetch cash session ล่าสุดที่ปิดของ store ตาม created_at (เปราะกว่า — ไม่แนะนำ)

---

## 2. API Design — /api/notifications/process

```
POST /api/notifications/process
Auth: Authorization: Bearer ${CRON_SECRET}   (system/cron)
      หรือ owner session (กดส่งซ้ำเอง)
Body (optional): { store_id?, limit? }
```

**พฤติกรรม:**
1. ตรวจสิทธิ์ (cron secret หรือ owner) — ไม่ผ่าน → 401
2. reclaim แถวค้าง: `processing` ที่ `processing_at < now()-5min` → `pending`
3. claim batch: `pending` ที่ถึงกำหนด → `processing` (atomic, SKIP LOCKED, limit N)
4. วนแต่ละแถว: ประกอบข้อความตาม event_type → ส่ง LINE → อัปเดต sent/failed
5. คืนสรุป: `{ ok, processed, sent, failed }` (ไม่คืนเนื้อหาบิล)

**Response ตัวอย่าง:**
```json
{ "ok": true, "processed": 8, "sent": 7, "failed": 1 }
```

### Sketch (pseudo — ไม่ใช่ production code)
```ts
// app/api/notifications/process/route.ts  (ออกแบบ; ยังไม่สร้างจริง)
export async function POST(req) {
  if (!authorized(req)) return json(401, { ok:false })
  const supabase = createServiceClient()           // server-only

  await reclaimStuck(supabase)                      // processing เก่า -> pending
  const batch = await claimPending(supabase, limit) // pending -> processing (SKIP LOCKED)

  let sent = 0, failed = 0
  for (const n of batch) {
    try {
      const msg = await buildMessage(supabase, n)   // ตาม event_type
      await sendLinePush(LINE_OWNER_USER_ID, msg)   // LINE Messaging API
      await markSent(supabase, n.id); sent++
    } catch (e) {
      await markFailed(supabase, n, e)              // retry_count++ , next_retry_at
      failed++
    }
  }
  return json(200, { ok:true, processed: batch.length, sent, failed })
}
```

### buildMessage ตาม event_type
- `sale`  → join sales+sale_items+users by `sale_id` → template §5.1
- `void`  → sales (void_reason, voided_by) by `sale_id` → template §5.2
- `cash_close` → ใช้ `payload` (expected/actual/difference) → template §5.3

### markFailed (retry + backoff)
```ts
retry_count = n.retry_count + 1
if (retry_count >= 5) status = 'failed', next_retry_at = null   // dead-letter
else status = 'failed', next_retry_at = now() + 60s * 2^n.retry_count
```

### LINE Messaging API (push)
```
POST https://api.line.me/v2/bot/message/push
Headers: Authorization: Bearer ${LINE_CHANNEL_ACCESS_TOKEN}
Body: { "to": LINE_OWNER_USER_ID, "messages":[{ "type":"text", "text": msg }] }
```

---

## 3. Trigger Options (เลือกใน 9D)

| ทางเลือก | ข้อดี | ข้อเสีย | แนะนำ |
|---|---|---|---|
| **Vercel Cron** → POST /api/notifications/process ทุก 1 นาที | ง่าย อยู่ใน repo เดียว | ดีเลย์สูงสุด ~1 นาที | ✅ MVP |
| Supabase Edge Function + pg_cron | ใกล้ DB | คนละ runtime ต้องดูแลแยก | ภายหลัง |
| Fire-and-forget หลังขาย (เรียก process ทันที) | เกือบ real-time | ถ้า request ตาย งานค้าง (cron มาเก็บ) | เสริมกับ cron |

แนะนำ: **Vercel Cron เป็นหลัก** + (option) เรียก process แบบ fire-and-forget หลังขายเพื่อความไว โดย cron เป็น safety net

`vercel.json`:
```json
{ "crons": [{ "path": "/api/notifications/process", "schedule": "* * * * *" }] }
```
(Vercel Cron แนบ header ให้ตรวจ; หรือใช้ CRON_SECRET ของเราเอง)

---

## 4. Implementation Phases

### Phase 9A — Worker Schema + RPC Payload ✅ เสร็จ
- ✅ apply schema changes (line-worker-schema.sql): processing/next_retry_at/processing_at/sent_at/payload + index
- ✅ แก้ RPC create_sale / void_sale / close_cash_session ให้เขียน `payload` (business logic ไม่เปลี่ยน)
- ยังไม่ส่ง LINE / ยังไม่สร้าง /api/notifications/process (อยู่ 9B+)

### Phase 9B — LINE API Integration ✅ เสร็จ
- ✅ `lib/line/messages.ts` (buildLineMessage 3 แบบ) + `lib/line/client.ts` (sendLinePushMessage)
- ✅ `app/api/notifications/process/route.ts` (CRON_SECRET, claim, send, retry/backoff, stuck recovery)
- ✅ dev ไม่มี env LINE → log แทนการยิง (mock) แล้ว mark sent
- ตั้งค่า LINE Official Account + Messaging API + ดึง LINE_OWNER_USER_ID (ทำตอน deploy 9D)

#### ทดสอบ local
```bash
# 1) ตั้ง CRON_SECRET ใน .env.local (LINE_* เว้นว่างได้ -> โหมด mock log)
# 2) รัน dev: npm run dev
# 3) เรียก worker:
curl -X POST http://localhost:3000/api/notifications/process \
  -H "Authorization: Bearer ${CRON_SECRET}"
# ไม่มี secret / ผิด -> 401
# mock mode (ไม่มี Supabase) -> { ok:true, processed:0, note:"mock mode..." }
# มี Supabase + แถว pending -> ส่ง (หรือ log ถ้า LINE ยังไม่ตั้ง) แล้วคืน { processed, sent, failed }
```

#### Vercel Cron (9D)
`vercel.json`:
```json
{ "crons": [{ "path": "/api/notifications/process", "schedule": "* * * * *" }] }
```
ตั้ง env บน Vercel: `CRON_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_OWNER_USER_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`
(Vercel Cron จะแนบ Authorization header ตาม CRON_SECRET ที่ตั้งไว้)

#### Env ที่ต้องใช้
`CRON_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_OWNER_USER_ID`, `LINE_NOTIFY_BATCH_SIZE`(optional), `SUPABASE_SERVICE_ROLE_KEY`

### Phase 9C — Retry Handling
- markFailed + exponential backoff + dead-letter (retry_count=5)
- stuck recovery (processing timeout)
- UI ฝั่ง owner: ดู notification_logs failed + ปุ่ม "ส่งซ้ำ" (reset เป็น pending)

### Phase 9D — Production Deployment
- ตั้ง Vercel Cron + env vars บน Vercel
- monitoring: alert เมื่อ pending/failed ค้างเกิน threshold
- load test batch + ปรับ LINE_NOTIFY_BATCH_SIZE

---

## 5. Deployment Checklist

- [ ] apply schema changes (§1) บน Supabase
- [ ] (flag) แก้ RPC close ให้เขียน payload สรุปกะ
- [ ] สร้าง LINE Official Account + เปิด Messaging API
- [ ] ออก `LINE_CHANNEL_ACCESS_TOKEN`, หา `LINE_OWNER_USER_ID`
- [ ] ตั้ง env บน Vercel: LINE_*, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET (server, ไม่มี NEXT_PUBLIC_)
- [ ] สร้าง /api/notifications/process + auth guard
- [ ] เพิ่ม vercel.json cron (ทุก 1 นาที)
- [ ] ทดสอบ: ขาย 1 บิล → ภายใน ~1 นาที ได้ LINE
- [ ] ทดสอบ retry: ปิด token ชั่วคราว → failed → backoff → ส่งสำเร็จเมื่อเปิด
- [ ] ทดสอบ dead-letter: retry_count ถึง 5 → หยุด + ยังเห็นในระบบ
- [ ] ทดสอบ idempotency: ยิง process ซ้อน → ไม่ส่ง LINE ซ้ำ
- [ ] ยืนยัน token/secret ไม่หลุดใน client bundle (ตรวจ network/source)

---

## 6. Known Risks (สรุป)

| ความเสี่ยง | แนวทาง |
|---|---|
| cash_close ไม่มีตัวเชื่อมข้อมูล | เพิ่ม `payload jsonb` + แก้ RPC close (9A) |
| ส่งซ้ำ | claim atomic + SKIP LOCKED + processing status |
| crash → แถวค้าง | stuck recovery (processing_at timeout 5 นาที) |
| LINE ล่ม/rate limit | backoff + batch + dead-letter |
| cron ไม่ยิง | owner ปุ่มส่งซ้ำ + alert pending ค้าง |
| token หลุด | server-only env, ไม่มี NEXT_PUBLIC_, เรียก LINE จาก server |
| ขยาย status เดิม | ALTER idempotent (drop+recreate check) |

---

## 7. ยืนยันขอบเขต Phase 9

✅ ไม่มี barcode · ✅ ไม่มี offline · ✅ ไม่มี stock_adjustment · ✅ ไม่แตะ auth architecture
✅ ใช้ `notification_logs` เดิม · ✅ LINE/​service_role อยู่ server เท่านั้น
✅ **ยังไม่เขียน production code** — เอกสาร architecture + implementation plan เท่านั้น
⚠️ มี schema change + RPC payload ที่ "เสนอ" ไว้ (ยังไม่ apply) สำหรับทำจริงใน 9A
