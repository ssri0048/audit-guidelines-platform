# Intelligent AI Audit Guidelines Platform (v3)

> **สถานะ: 🟢 GO-LIVE (2026-07-14)** — 16 หัวข้อ / 96 ความเสี่ยง / 103 วิธีการตรวจ ทุกรายการ L1 APPROVED
> ทะเบียนมาตรฐาน 70+ families ครอบ 100% ของการอ้างอิง | คู่มือ: [docs/USER_MANUAL_TH.md](docs/USER_MANUAL_TH.md)

ระบบคลังความรู้แนวทางการตรวจสอบภายในสำหรับองค์กรการไฟฟ้า — ภาษาไทย
โครงสร้าง: **หนึ่งคลัง สองฝั่ง** — อ่านเสรี / เขียนผ่านการอนุมัติ (Pull Request) เท่านั้น

```
ฝั่งอ่าน:   ผู้ใช้ค้นหา → ตาราง Topic → Risk → Control_Failure → Procedure → Evidence
ฝั่งเขียน:  คำขอ research → Claude สังเคราะห์จากแหล่ง official → Quality Gates (CI)
            → Pull Request → 👤 คนอนุมัติ (merge) → เว็บอัพเดตอัตโนมัติ
```

## โครงสร้างรีโป

| ที่ | คืออะไร |
|---|---|
| `app/index.html` | เว็บแอป read-only (ค้นหาแยกประเภทองค์กร + ป้ายที่มาความรู้ + ชิปสถานะมาตรฐาน) |
| `data/knowledge_store.json` | **คลังความรู้ canonical ไฟล์เดียว** — แก้ผ่าน PR เท่านั้น |
| `data/knowledge_staging.json` | คิวความรู้รอตรวจ/อนุมัติ |
| `data/research_requests/` | คำขอ research จากผู้ใช้ |
| `data/schema/knowledge.schema.json` | JSON Schema ของคลังความรู้ |
| `scripts/validate.js` | Quality Gates เป็นโค้ด (รันใน CI ทุก PR) |
| `.github/workflows/validate.yml` | CI — gates ไม่ผ่าน merge ไม่ได้ |
| `skills/` | Claude Skills (pipeline สังเคราะห์ความรู้) |
| `docs/` | สถาปัตยกรรม + คู่มือ |

## กติกาสำคัญ (อย่าฝ่าฝืน)

1. **ห้ามแก้ `data/knowledge_store.json` ตรงบน main** — ทุกการเปลี่ยนแปลงต้องมาเป็น PR
2. **ความรู้ 16 หัวข้อแรกมีสถานะ `LEGACY_UNVERIFIED`** — ยังไม่ผ่านการตรวจจากแหล่งจริง ห้ามอ้างเป็นข้อเท็จจริงจนกว่าจะ re-verify และถูกอนุมัติเป็น L1
3. ความรู้ L0/L1 ต้องมี `source_chain` ที่มี URL + excerpt จริง ≥2 แหล่ง
4. ทุก topic ต้องมี risks ≥5 และทุก procedure ต้องมี evidence ≥4 (บังคับใน CI)
5. ห้ามความรู้ L2/L3 ถูกใช้เป็น source ของความรู้อื่น (กัน knowledge drift)

## รัน validation เอง

```bash
node scripts/validate.js data/knowledge_store.json
```

## สถานะ

- [x] Step 1: โครงรีโป + canonical store (legacy stamped)
- [x] Step 2: Schema + Quality Gates + CI
- [ ] Step 3: Re-verify 16 topics + เติม risks ≥5 (ทีละ PR)
- [ ] Step 4: Rewire เว็บแอป (read-only, ค้นหาเดียว, badge L0–L3, ตัด key/PAT/login)
- [ ] Step 5: GitHub Actions research pipeline (admin สั่งผ่าน browser)
- [ ] Step 6: Go-live + คู่มือ
