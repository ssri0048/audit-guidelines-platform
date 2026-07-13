# เส้นทางความรู้ภายในองค์กร (INTERNAL_DOC) — ตั้งไว้รอ ยังไม่เปิดใช้

> มติ 2026-07-13: สร้างโครงรอเป็นตัวเลือก เผื่อเชื่อมต่อฐานข้อมูลภายในองค์กรในอนาคต
> **ยังไม่อนุญาตให้ใช้จริงบนเว็บรอบนี้** — คุมด้วย `data/platform_flags.json → internal_doc_enabled: false` (fail-closed)

## จุดเสียบใน loop (จุดเดียว)

```
รับหัวข้อ → ขั้น 0 Zero-Base → [อ่านแหล่ง+เก็บหลักฐาน] ← เสียบตรงนี้
         → normalize (Topic→Risk→CF→AP→Evidence) → เกต G1-G8 → PR → human merge
         → knowledge_store.json → เว็บ render
```
ทุกขั้นหลังจุดเสียบเหมือนความรู้สาธารณะทุกประการ — claim envelope ออกแบบให้ไม่สนที่มา
(เปลี่ยน `url` → `doc_id + checksum` เท่านั้น)

## ช่องเข้า 3 โหมด (เรียงตามความพร้อม)
1. **Manual upload** — admin อัพโหลดเอกสารภายในเข้า session → อ่านไส้ใน → claim INTERNAL_DOC → PR (ใช้ได้ทันทีที่เปิด flag)
2. **MCP connector** — ต่อระบบจัดเก็บเอกสารองค์กร (DMS/intranet) → ดึง doc_id + checksum อัตโนมัติ
3. **Actions pipeline** — Step 5 query connector ตามรอบ (ไกลสุด)

## ปลายทาง
ตารางไทยหน้าเว็บเดิม แต่ติด badge **L2 + 🏢 + owner_org** และแผงอ้างอิงแสดง doc_id + วันที่ + checksum แทนลิงก์สาธารณะ

## Root path ที่วางแล้ว
| ชิ้น | ที่อยู่ | สถานะ |
|---|---|---|
| ช่องลงจอด L2 = ความรู้ภายใน | layer taxonomy | ✅ จองไว้แต่แรก |
| โครง claim INTERNAL_DOC (owner_org, doc_id, doc_revision, checksum, connector) | claim.schema.json | ✅ PR-F1 |
| flag fail-closed | platform_flags.json | ✅ PR-F1 |
| เกตล็อค G8_INTERNAL_LOCKED / SCHEMA / PRIVACY | validate.js | ✅ PR-F1 |
| family visibility INTERNAL + ชิป 🏢 บนเว็บ | registry + app | ✅ PR-F1 |
| connector จริง | — | ⏳ อนาคต |

## กติกาถาวร (ไม่ขึ้นกับ flag)
1. internal_doc **ไม่นับ**เป็นแหล่ง credibility/consensus ของ L1 — ตรวจทานสาธารณะไม่ได้
2. **ห้าม excerpt เอกสารภายในลง repo สาธารณะ** — G8_INTERNAL_PRIVACY block ทันที (หลักเดียวกับ paywalled exemplar)
3. ความรู้ที่ยืนบนเอกสารภายใน = L2 เสมอ ไม่ใช่ L1

## ความมั่นใจว่าเข้า loop (กลไก ไม่ใช่คำสัญญา)
- ประตูเขียนมีบานเดียว: main protected + CI required — ไม่มีทางกายภาพเข้าระบบโดยไม่ผ่านเกต+มนุษย์
- flag แรกเปิดได้ด้วย PR ที่คุณ merge เท่านั้น
- เข้าแล้ว Verification Queue จับต่อ: เอกสารภายในมี revision → STALE ตาม SLA เหมือน claim สาธารณะ

## Open question (ปักธงรอวันเปิดใช้)
repo นี้ public — ตอนเปิดใช้จริงต้องเลือก: (ก) private repo คู่ขนาน (public เก็บ stub อ้างถึง) หรือ (ข) องค์กร fork ทั้งระบบเป็น private ของตัวเอง
