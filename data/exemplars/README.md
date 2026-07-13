# Exemplar Corpus — คลังแบบอย่างงานเขียนจากผู้ตรวจจริงทั่วโลก

## หลักการ
ก่อน gen ขั้นตอนการตรวจ (audit procedure) ของ topic ใด **SKL007 ต้องโหลด exemplars ของ domain นั้น ≥3 ชิ้นก่อน** — เพื่อให้ทุกตารางยึด "แบบแผนที่มีคนเคยเขียนจริง" ไม่ใช่การสังเคราะห์ลอยๆ (practice-grounded, ไม่ copy)

## โครงไฟล์: `EXM-<DOMAIN>-<LANG>-<nnn>.json`

```json
{
  "exemplar_id": "EXM-PROC-TH-001",
  "domain": "procurement",
  "org_scope": ["GOV", "SOE"],
  "lang_original": "th",
  "publisher": "กลุ่มตรวจสอบภายใน กรมสรรพสามิต",
  "title": "แนวการตรวจสอบการจัดซื้อจ้างวิธีคัดเลือก",
  "url": "https://www.excise.go.th/...pdf",
  "page_ref": "หน้า x-y",
  "excerpt_original": "ข้อความจริงภาษาเดิม (คัดสั้น เคารพลิขสิทธิ์)",
  "excerpt_th": "คำแปลไทยตามกติกา glossary (ถ้าต้นฉบับไม่ใช่ไทย)",
  "pattern_notes_th": "โครงที่สังเกตได้: กริยาตรวจ → ขอบเขต/ตัวอย่าง → เกณฑ์เทียบ → หลักฐานที่เรียก",
  "_claim": {"state": "VERIFIED", "evidence": {"url": "...", "read_at": "..."}, "last_checked": "..."}
}
```

## กติกา
1. แหล่งภาษาไหนก็ได้ — เกณฑ์เดียวคือผู้เผยแพร่เชื่อถือได้ (SAI, หน่วยตรวจสอบรัฐ, องค์กรวิชาชีพ, MDB)
2. **ต้นฉบับอยู่คู่คำแปลเสมอ** — ไม่ทิ้ง excerpt_original
3. เคารพลิขสิทธิ์: excerpt สั้น + ลิงก์ + เลขหน้า (กฎหมาย/ระเบียบ/ประกาศไทยไม่มีลิขสิทธิ์ตาม พ.ร.บ.ลิขสิทธิ์ ม.7 แต่คู่มืออาจมี)
4. exemplar ทุกชิ้นห่อ claim envelope — เข้าระบบผ่าน PR + คนอนุมัติ เหมือนความรู้อื่น
5. procedure ที่อ้าง exemplar ใส่ `exemplar_refs: ["EXM-..."]` + `derivation: "EXEMPLAR_GROUNDED"`

## Derivation 3 ระดับ (โชว์เป็นชิปบนตารางเว็บ)
- `READ_SOURCE` 📖 — เนื้อหามาจากเอกสารที่อ่านโดยตรง (มี excerpt ใน source_chain)
- `EXEMPLAR_GROUNDED` 🧭 — ยึดแบบแผนจาก exemplar ที่ระบุชิ้น
- `PROFESSIONAL_SYNTHESIS` ⚗️ — สังเคราะห์วิชาชีพ + ผ่านคนอนุมัติ (ต้องมีเหตุผลว่าทำไมไม่มี exemplar)

## เป้าหมาย coverage (G7 gate)
Topic ใหม่/re-verify หลังจากนี้: procedures ที่มี exemplar_refs ≥70% | คลังเริ่มจาก 5 domains: procurement, finance, cybersecurity, asset, compliance (seed ใน PR-B) แล้วโตคู่ขนานกับ topics ที่เหลือ
