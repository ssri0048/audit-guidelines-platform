# SKL021 — Verification Resolver (ตัวปิดธงของทั้งระบบ)

## Skill Identity
- **Name**: verification-resolver
- **Version**: 1.0.0
- **หน้าที่**: ปิด claim ทุกชิ้นที่อยู่ในสถานะ UNVERIFIED / STALE / UNRESOLVED ให้ไปถึงจุดจบ (VERIFIED / SUPERSEDED / RETIRED) — เป็นแบบแผนเดียวใช้กับข้อมูลทุกชนิด ทุกไฟล์ ปัจจุบันและอนาคต
- **หลักการ**: ธงทุกอันมีเจ้าภาพคือระบบ (Claude รัน skill นี้) ไม่ใช่ผู้ใช้ | ไม่มีธงไหนแก่เกิน SLA โดยไม่ถูกตัดสินใจ

## Trigger
- CI แสดง Verification Queue มีรายการค้าง
- Scheduled run (รายเดือน) หรือก่อนเริ่ม batch re-verify ใดๆ (Boy Scout Rule: ปิดธงเก่า ≥2 รายการต่อ batch)
- ผู้ใช้ถามสถานะของ claim ใดๆ

## ขั้นตอนมาตรฐาน (เหมือนกันทุก claim — ต่างแค่ตารางผู้ออก)

1. อ่าน Verification Queue จาก `node scripts/validate.js` (ส่วน VERIFICATION QUEUE)
2. ระบุชนิด claim และผู้ออก → เปิด **Publisher Lookup Table** (ข้างล่าง) ว่าทะเบียน official อยู่ไหน อ่านยังไง
3. เปิดอ่านหน้า official จริง เก็บ excerpt + URL + วันที่
4. เทียบ **Exception Catalog** (ใน deep-research-protocol) ว่าเป็นเหตุการณ์แบบไหน → เปลี่ยน state ตาม playbook
5. อัพเดทไฟล์ข้อมูล + เปิด PR (คนอนุมัติเหมือนเดิม)
6. ถ้าหาคำตอบไม่ได้: ตั้ง state=UNRESOLVED + open_question ระบุ "ติดอะไร จะหาต่อจากไหน" + sla_deadline — **ห้าม**ปล่อยเป็น UNVERIFIED เงียบๆ

## Publisher Lookup Table (เพิ่มแถวเมื่อเจอผู้ออกใหม่ — ไม่ต้องแก้ logic)

| ผู้ออก | ทะเบียน official | วิธีอ่านสถานะ |
|---|---|---|
| ISO/IEC | iso.org/standard/xxxxx | ส่วน "Life cycle" + stage code (60.60 published, 90.93 confirmed, 90.92 to be revised, 95.99 withdrawn) + ส่วน "Amendments" |
| IIA | theiia.org/en/standards + Press Room | หน้า standards + press release ระบุ release/effective date |
| INTOSAI | issai.org (ทะเบียน IFPP) + psc-intosai.org (มติ/proposal) | เอกสารอยู่ทะเบียนไหน (ISSAI/GUID/INTOSAI-P) + เอกสาร restructure |
| NIST | nist.gov + csrc.nist.gov/pubs | หน้า pub แสดง "Supersedes:" / "Superseded by" / Archive section ตรงๆ |
| OECD | oecd.org/en/publications | หน้า publication ระบุปีฉบับ + คำว่า revised/adopted/endorsed |
| COSO | coso.org | หน้า guidance (IC กับ ERM เป็นคนละชุด ใช้คู่กัน) |
| IEEE | standards.ieee.org/ieee/xxxx | หน้า standard แสดง active/superseded + ปี edition |
| กฎหมายไทย | ratchakitcha.soc.go.th (ต้นฉบับ) + krisdika.go.th (ฉบับ update) | ราชกิจจาฯ = วันประกาศ; กฤษฎีกาฉบับ update = ตัวบทปัจจุบันรวมแก้ไข; ตามหา "(ฉบับที่ n)" เสมอ |
| กกพ. | erc.or.th | หน้าประกาศ/มาตรฐานรายเรื่อง |
| สกมช. | ncsa.or.th/standards/laws | หน้ารวมกฎหมาย/ประกาศ CII |
| สตง./ป.ป.ช./สคร. | audit.go.th / nacc.go.th / sepo.go.th | หน้าเผยแพร่กฎ/เกณฑ์ของหน่วยงาน |
| TFAC (TFRS) | tfac.or.th | ทะเบียน TFRS รายฉบับ + ปีบังคับใช้ |

## Definition of Done ต่อ 1 ธง
- [ ] state เปลี่ยนเป็น VERIFIED / SUPERSEDED / RETIRED หรือ UNRESOLVED-พร้อม-SLA
- [ ] มี evidence url + excerpt + วันที่ (เว้นแต่ RETIRED)
- [ ] ถ้าพบ pattern ใหม่ที่ Exception Catalog ไม่มี → เพิ่มเข้า catalog ใน PR เดียวกัน
- [ ] validate.js ผ่าน และจำนวนธงใน queue ลดลงหรือมี SLA ครบทุกอัน

## เคสพิสูจน์ที่ปิดแล้ว (ตัวอย่างการใช้ skill นี้)
1. **INTOSAI GOV 9100** → state: RENUMBERED/VERIFIED — หลักฐาน: psc-intosai.org proposal "GOVs 9100, 9110, 9120, 9130, 9250 should be relabeled and renumbered to fit into the GUIDs category (9XXX series)" + เอกสารยังเผยแพร่บน issai.org
2. **IIA IPPF 2017** → SUPERSEDED/VERIFIED — หลักฐาน: IIA Press Room "The IIA Celebrates the Effective Date of the Global Internal Audit Standards" — GIAS ออก 9 ม.ค. 2024 มีผล 9 ม.ค. 2025 (รวม mandatory elements ของ 2017 IPPF เข้าไปแล้ว)
