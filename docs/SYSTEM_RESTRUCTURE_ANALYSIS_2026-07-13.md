# รายงานวิเคราะห์โครงสร้างระบบ + ข้อเสนอปรับโครงสร้าง (Before → After)
**Intelligent AI Audit Guidelines Platform — Professional Architecture Review**
วันที่: 2026-07-13 | สถานะ: ข้อเสนอเท่านั้น — **ยังไม่มีการแก้ไขโค้ดใดๆ** | Logic ของ 10 Skills คงเดิมทั้งหมด

---

## 0. สรุปผู้บริหาร (Executive Summary)

ระบบปัจจุบันมีแนวคิดที่ดีมาก (10 SKL modules, Knowledge Trust Framework L0–L3, 6-gate quality pipeline, canonical schema) **แต่การบังคับใช้ (enforcement) ส่วนใหญ่อยู่ในรูปแบบ "เอกสารและ prompt" ไม่ใช่ "โค้ดที่บังคับจริง"** จุดที่ร้ายแรงที่สุดสำหรับการ go-live public คือ (1) GitHub PAT และ API key อยู่ใน browser ของผู้ใช้ (2) โหมด ISKE สร้างความรู้ที่ดูเหมือน research จริงแต่ไม่มีแหล่งอ้างอิงจริง (3) quality gates ข้ามได้และ AI ให้คะแนนตัวเอง (4) ข้อมูลจริงใน store ไม่ผ่านเกณฑ์ที่ตัวเองประกาศไว้ (มี 2–3 risks/topic ทั้งที่กำหนด ≥5)

ข่าวดีคือ **การตัดสินใจของคุณ (คนอนุมัติทุกรายการ + GitHub เป็น database) แก้ปัญหาเหล่านี้ได้เกือบหมดในคราวเดียว** ถ้าเปลี่ยน write path เป็น **Pull Request-based workflow**: การอนุมัติของคน = การ merge PR, audit trail = git history, rollback = git revert, version control = ของฟรีจาก git ทั้งหมด

---

## 1. โครงสร้างปัจจุบัน (BEFORE) — ตามที่อ่านจากโค้ดจริง

### 1.1 ไฟล์และขนาด
| ไฟล์ | ขนาด | บทบาท |
|---|---|---|
| `audit_platform/audit-platform-public.html` | **7,094 บรรทัด** | ทุกอย่างรวมไฟล์เดียว: UI + logic + TOPICS 10 หัวข้อ + DOC_KNOWLEDGE_LIBRARY + AI_KB + ISKE + prompts + GitHub sync |
| `audit_platform/knowledge_store.json` | 16 topics (schema 3.0.0) | Master knowledge — แต่ **ทุก topic มีแค่ 2–3 risks** |
| `knowledge_store.json` (root) | สำเนา identical ของไฟล์ข้างบน | ซ้ำซ้อน ไม่มีกลไก sync |
| `knowledge_store_new.json` (root) | 16 topics | ไฟล์ค้าง ไม่รู้สถานะ |
| `knowledge_staging.json` | คิวว่างทั้งหมด | ออกแบบ 6-gate ไว้ดี **แต่ไม่มีอะไรวิ่งผ่านจริง** |
| `knowledge-base.js` | มี 2 สำเนา (root + audit_platform) | 4-tier mode logic |
| `knowledge_store_manager.js` | 931 บรรทัด | 6-gate engine |
| `audit-platform.test.js` | 1,395 บรรทัด | มี test แต่**ไม่มี CI รัน** |
| skills/ 2 ชุด (root + audit_platform) | SKILL.md ×2 | knowledge-store-manager, audit-doc-intelligence |
| ขยะ: `.Rhistory`, `.DS_Store`, `~$introduction.docx` | — | หลุดเข้า repo |

### 1.2 Data flow ปัจจุบัน
```
ผู้ใช้ค้นหา
  ├─ มี API key → browser ยิงตรง api.anthropic.com (key อยู่ sessionStorage)
  ├─ ไม่มี key  → ISKE แต่งความรู้จาก template ในไฟล์ HTML (ไม่มี source จริง)
  └─ ผลลัพธ์ → commitChanges() → TOPICS[] + localStorage
                └─ ถ้ามี GitHub PAT (ใน sessionStorage) → PUT ตรงเข้า
                   knowledge_store.json บน GitHub โดยไม่ผ่าน staging/คนอนุมัติ
```

---

## 2. ผลการ Grill — จุดอ่อนเรียงตามความรุนแรง

### 🔴 CRITICAL

**C1 — GitHub PAT ในเบราว์เซอร์ (`commitTopicToGitHub`, ~line 6899)**
PAT ที่มีสิทธิ์เขียน repo ถูกเก็บใน sessionStorage และใช้ PUT ตรงจาก browser ผู้ใช้ ถ้าโดน XSS หรือใช้เครื่องสาธารณะ = คนร้ายเขียน/ลบ repo ได้ทั้งหมด และ concurrent users เขียนพร้อมกัน = last-write-wins ทับกัน (merge ทำฝั่ง client) **ห้ามใช้แบบนี้กับ public go-live เด็ดขาด**

**C2 — Anthropic API key ในเบราว์เซอร์ (lines 3499/3558/6051)**
ผู้ใช้ทั่วไปไม่มี key และ key ที่วางไว้เสี่ยงหลุด — ขัดกับเป้าหมาย public

**C3 — ISKE = Hallucination by design**
เมื่อไม่มี API key ระบบ "สังเคราะห์" ความเสี่ยง/แนวการตรวจจาก template โดย UI ไม่แยกให้ชัดว่านี่ไม่ใช่ผล research จริง ขัดหลักการที่คุณวางไว้เองว่า *"การกลั่นกรองความรู้ควรมาจากการอ่านไส้ใน ไม่ใช่อ้างลอยๆ"*

**C4 — Quality gates ข้ามได้ + AI ตรวจการบ้านตัวเอง**
6-gate อยู่ใน SKILL.md (บังคับได้เฉพาะตอน Claude ทำ) ส่วนเส้นทางเว็บ commit ตรงเข้า TOPICS/GitHub ได้เลย และ `confidence_score` ที่ใช้ตัดสิน AUTO_APPROVE ≥85 มาจาก AI ประเมินตัวเอง (circular trust) — คุณเลือกแล้วว่า "คนอนุมัติทุกรายการ" แต่ระบบปัจจุบันไม่มีกลไกบังคับเรื่องนี้เลย

### 🟠 HIGH

**H1 — ข้อมูลจริงไม่ผ่านเกณฑ์ตัวเอง:** ทั้ง 16 topics มี 2–3 risks ต่อ topic ขณะที่ requirement คุณกำหนด **≥5 risks/topic** และ gate ประกาศ "CF ≥4 per risk" — แปลว่า gates ไม่เคยถูก enforce กับข้อมูลจริง

**H2 — Schema แตกเป็น 2 มาตรฐาน:** HTML ใช้ `nth/nen/cat/pri`, store ใช้ `name_th/name_en/category/priority` โดย mapping ฝังซ้ำใน HTML 3 จุด (export / import / auto-load) — แก้ schema ทีต้องแก้ 3 ที่ เสี่ยง drift สูง

**H3 — Hash ปลอม:** store ระบุ `"hash_signature": "sha256:T001-v1.0.0-2026-06-16"` ซึ่ง**ไม่ใช่ hash จริง** เป็นแค่ string ต่อกัน ส่วน HTML ใช้ djb2 คนละสูตร — integrity check ทั้งระบบจึงเชื่อถือไม่ได้

**H4 — Hallucination Firewall ตื้นเกินจริง:** Q6/Q7 เช็คแค่ "มีเลขปีอนาคตใน string หรือไม่" ไม่มี citation verification จริง (T3 Provenance, T4 Citation Enforcement, T5 Consensus ยังเป็น Planned ทั้งหมด) — มาตรฐานที่กุขึ้นด้วยปีปัจจุบันจะผ่าน firewall สบาย

**H5 — ไม่มี single source of truth:** store 3 ไฟล์, knowledge-base.js 2 สำเนา, skills 2 ชุด — ไม่รู้ว่าไฟล์ไหนคือของจริง

### 🟡 MEDIUM

**M1 — Monolith 7,094 บรรทัด:** v2.5/v2.6 (แยก data ออกจาก HTML) ค้างใน roadmap มานาน ทุก domain ใหม่บวม ~1,000 บรรทัด
**M2 — Versioning อ่อน:** bump patch อย่างเดียว ไม่มี diff/rollback, change_log เป็น free text
**M3 — มี test 1,395 บรรทัดแต่ไม่มี CI:** ของดีที่ไม่ถูกใช้
**M4 — เอกสาร drift:** ARCHITECTURE.md มี footer 2 อัน (v3.0.0 / v2.0.0), file structure ไม่ตรงของจริง

### ✅ สิ่งที่ทำถูกแล้ว (ต้องคงไว้)
แนวคิด L0–L3 knowledge hierarchy, 6-gate design, canonical `_meta` schema, dedup 3 ชั้น, staging queue design, การมี test file, การแยก skills เป็นโมดูล — **ทั้งหมดนี้ logic ถูกต้อง ปัญหาคือ "ที่อยู่" และ "การบังคับใช้" เท่านั้น**

---

## 3. โครงสร้างเป้าหมาย (AFTER) — ตามการตัดสินใจของคุณ

> ยึด 4 ข้อที่คุณเลือก: ① GitHub เป็น database ② คนอนุมัติทุกรายการ ③ หัวข้อใหม่มี 2 เส้นทาง (gen จากความรู้เดิม→อนุมัติ / ไม่มี→ส่งคำขอ research พร้อมถาม resource) ④ รองรับทั้ง Claude-workspace และ proxy

### 3.1 หลักการใหญ่: เปลี่ยน "GitHub เป็น database" ให้ปลอดภัยด้วย PR Workflow

```
                    ┌──────────── READ (public, ไม่ต้องมี key) ────────────┐
ผู้ใช้เปิดเว็บ ──► GitHub Pages / Netlify CDN ──► fetch knowledge_store.json
                                                    (read-only เสมอ)

                    ┌──────────── WRITE (ควบคุม 100%) ────────────────────┐
คำขอความรู้ใหม่ ──► research_requests/ (คิวในรีโป)
        │
        ▼
Claude (workspace นี้) รัน 10 Skills:
  SKL001 Harvest (อ่านไส้ในจากเว็บ official จริง)
  SKL002–009 Validate → Thailand → Classify → ... → Thai
        │
        ▼
เขียนผลลง knowledge_staging.json + สร้าง branch + เปิด Pull Request
        │
        ▼
GitHub Actions (CI) รันอัตโนมัติ:
  ✓ JSON Schema validation   ✓ 6 gates เป็นโค้ดจริง
  ✓ sha256 จริง              ✓ risks ≥5/topic
  ✓ ทุก URL อ้างอิง fetch ได้จริง (link check)
  ✗ ไม่ผ่านข้อใดข้อหนึ่ง = merge ไม่ได้ (branch protection)
        │
        ▼
👤 คุณ review PR → เห็น diff รายบรรทัด + รายงาน CI → กด Merge = อนุมัติ
        │
        ▼
Merge → auto-deploy → เว็บอัพเดตทันที | ย้อนกลับ = git revert 1 คำสั่ง
```

**สิ่งที่ได้ฟรีจาก git:** audit trail สมบูรณ์ (ใคร/เมื่อไหร่/อะไร), version history ทุก topic, rollback, diff review, ไม่มี race condition, **ไม่มี PAT หรือ API key ใดๆ ใน browser ผู้ใช้อีกต่อไป**

### 3.2 เส้นทางค้นหาของผู้ใช้ (ตามที่คุณกำหนด)

| กรณี | พฤติกรรมระบบ |
|---|---|
| **มีใน master** | แสดงตารางตาม schema Topic→Risk→CF→Procedure→Evidence พร้อม badge L0/L1 + คลิกดู source ได้ทุกรายการ |
| **เกี่ยวข้องกับความรู้เดิม** | gen ความเสี่ยงใหม่จากความรู้ใน store ได้ แต่ติดป้าย `L3 — DRAFT ยังไม่ผ่านอนุมัติ` ชัดเจน + ปุ่ม "ส่งเข้าคิวอนุมัติ" → เข้า staging → PR → คุณอนุมัติก่อนจึงเข้า master |
| **ไม่มีเลย** | แสดง "ยังไม่มีหัวข้อนี้" + ฟอร์มส่งคำขอ research ซึ่ง**ถามผู้ใช้ก่อนว่า** ต้องการเน้นมาตรฐาน/แหล่งอ้างอิงใด (เช่น IIA, NIST, กฎ กกพ.) ใช้กับหน่วยงานส่วนไหน → คำขอเข้า `research_requests/` → Claude ทำ deep research → PR → อนุมัติ |

### 3.3 โครงสร้างรีโปใหม่ (ย้ายไฟล์ ไม่แตะ logic)

```
skills-claude/
├── app/
│   ├── index.html              ← UI shell (~1,500 บรรทัด)
│   ├── js/                     ← logic เดิมแยกเป็นโมดูล (โค้ดเดิม ย้ายที่)
│   │   ├── pipeline.js         (runAISearch, validateAndEnrich — logic เดิม)
│   │   ├── store-adapter.js    ← mapping schema จุดเดียว (ยุบ 3 จุดซ้ำ)
│   │   ├── iske.js             (draft-generator + บังคับ L3 label)
│   │   └── render.js
│   └── data/
│       ├── doc-knowledge.js    ← ย้าย DOC_KNOWLEDGE_LIBRARY ออก (v2.5 ที่ค้าง)
│       └── ai-kb.js            ← ย้าย AI_KB ออก (v2.6 ที่ค้าง)
├── data/
│   ├── knowledge_store.json    ← canonical เพียงไฟล์เดียว (ลบสำเนา root)
│   ├── knowledge_staging.json
│   ├── research_requests/      ← คิวคำขอจากผู้ใช้
│   └── schema/knowledge.schema.json  ← JSON Schema บังคับใน CI
├── skills/                     ← ชุดเดียว (ยุบ 2 ชุดที่ซ้ำ)
├── tests/  +  .github/workflows/validate.yml  ← CI รัน gates + tests ทุก PR
└── docs/ARCHITECTURE.md
```

---

## 4. กรอบป้องกัน Hallucination (ทำ T3/T4/T5 ให้เป็นจริง)

หลักคิด: **"ไม่เชื่อ AI — เชื่อหลักฐานที่ตรวจซ้ำได้"** ทุกชั้นต้องเป็นโค้ด/กระบวนการที่บังคับจริง ไม่ใช่ prompt

| ชั้น | Before (ปัจจุบัน) | After (เสนอ) |
|---|---|---|
| **Provenance (T3)** | ไม่มี — อ้างชื่อมาตรฐานลอยๆ | ทุก Risk/Procedure ต้องมี `source: {url, publisher, retrieved_at, excerpt}` — excerpt คือข้อความจริงที่คัดจากแหล่ง เพื่อพิสูจน์ว่า "อ่านไส้ใน" แล้วจริง |
| **Citation Enforcement (T4)** | ไม่มี | ก่อนเปิด PR Claude ต้อง fetch URL จริงทุกอัน + ยืนยันว่า clause/เนื้อหาปรากฏจริง; CI รัน link-check ซ้ำอีกชั้น — URL ตาย/ไม่ตรง = merge ไม่ได้ |
| **Consensus (T5)** | single-source | ความรู้ระดับ L1 ต้องมี ≥2–3 แหล่งอิสระยืนยันตรงกัน บันทึกใน `source_chain[]` |
| **Source whitelist** | DOMAIN_SOURCE_REGISTRY มีแล้วแต่ไม่บังคับ | CI ตรวจ domain ของทุก URL ต้องอยู่ใน registry (theiia.org, intosai.org, nist.gov, iso.org, ratchakitcha.soc.go.th, erc.or.th, audit.go.th ฯลฯ) |
| **Firewall version** | เช็คแค่ปีอนาคต | เพิ่ม: เทียบชื่อ+เวอร์ชันมาตรฐานกับตารางเวอร์ชันจริงใน registry (เช่น GIAS = 2024, COSO ERM = 2017, NIST CSF = 2.0) — ชื่อ/เวอร์ชันนอกตาราง = flag ทันที |
| **AI ตรวจตัวเอง** | confidence_score จาก AI ใช้ auto-approve | คะแนน AI ใช้เป็น **ข้อมูลประกอบ** เท่านั้น — การอนุมัติจริงคือมนุษย์กด merge PR ทุกรายการ (ตามที่คุณเลือก) |
| **Knowledge drift** | เอกสารเตือนไว้ แต่ไม่มีตัวกัน | CI ห้าม node ที่ `knowledge_layer: L2/L3` ปรากฏใน `source_chain` ของ node อื่น |
| **ISKE** | ปนกับผล research แยกไม่ออก | ผลจาก ISKE/gen-จากความรู้เดิม ติด `L3 DRAFT` banner เสมอ + เข้า master ไม่ได้จนกว่าผ่าน research + อนุมัติ |
| **หน้าเว็บ** | ไม่แสดงที่มา | Badge L0–L3 ทุกแถว + คลิกดู source/excerpt ได้ — auditor ตรวจย้อนได้เอง |

---

## 5. ตาราง Before → After รวม

| ด้าน | BEFORE | AFTER |
|---|---|---|
| Write path | Browser + PAT เขียน GitHub ตรง | ผู้ใช้ read-only; เขียนผ่าน Claude → PR → คนอนุมัติ เท่านั้น |
| API key | ใน browser ผู้ใช้ | ไม่มี key ใน browser; deep research ทำใน workspace / proxy ฝั่ง server |
| การอนุมัติ | AUTO_APPROVE ≥85 (AI ให้คะแนนตัวเอง) | มนุษย์ merge PR ทุกรายการ + CI report ประกอบ |
| Quality gates | อยู่ใน SKILL.md ข้ามได้ | เป็นโค้ดใน CI — ไม่ผ่าน merge ไม่ได้ |
| Hallucination | เช็คปีอนาคตอย่างเดียว | Provenance + fetch จริง + consensus + whitelist + version table |
| Schema | 2 มาตรฐาน mapping ซ้ำ 3 จุด | 1 canonical + JSON Schema + adapter จุดเดียว |
| Hash | djb2 / string ปลอม | sha256 จริง คำนวณจาก content |
| Store | 3 ไฟล์ + localStorage ต่อคน | canonical 1 ไฟล์บน GitHub, localStorage เป็นแค่ cache |
| Versioning | patch bump, ไม่มี rollback | git history + PR diff + revert ได้ |
| ISKE | ปนกับความรู้จริง | draft-only, L3 label, ห้ามเข้า master |
| ≥5 risks/topic | จริงมี 2–3 | CI บังคับ + งาน backfill 16 topics เดิม |
| HTML 7,094 บรรทัด | ทุกอย่างรวมไฟล์เดียว | shell ~1,500 + โมดูล js + data แยก (logic เดิม) |
| Test | มีแต่ไม่รัน | รันอัตโนมัติทุก PR |

---

## 6. Roadmap ที่เสนอ (ยังไม่ทำจนกว่าคุณสั่ง)

| Phase | งาน | ผลลัพธ์ | ความเสี่ยงต่อ logic เดิม |
|---|---|---|---|
| **P0 — Housekeeping** (ครึ่งวัน) | ลบไฟล์ซ้ำ/ขยะ, ประกาศ canonical store เดียว, เพิ่ม .gitignore, แก้ ARCHITECTURE.md ให้ตรงจริง | Single source of truth | ศูนย์ — ไม่แตะโค้ด |
| **P1 — Data integrity** (1–2 วัน) | JSON Schema + CI validate + sha256 จริง + link-check | Gates บังคับจริงครั้งแรก | ต่ำ — เพิ่มของใหม่รอบข้อมูลเดิม |
| **P2 — Backfill content** (งาน research) | เพิ่ม risks ให้ครบ ≥5 ทุก topic ผ่าน pipeline ใหม่ (Claude research + คุณอนุมัติทีละ PR) | 16 topics ผ่านเกณฑ์ที่ประกาศ | ศูนย์ |
| **P3 — Write path** (2–3 วัน) | ตัด PAT ออกจาก browser, เว็บ read-only, เปิดใช้ staging→PR workflow | ปิดช่องโหว่ CRITICAL ทั้งหมด | กลาง — เปลี่ยนจุด commit (logic pipeline คงเดิม) |
| **P4 — แยกไฟล์** (1–2 วัน) | v2.5/v2.6 ที่ค้าง + ISKE L3 banner + badge L0–L3 บน UI | HTML ไม่บวมอีก, ผู้ใช้แยกความรู้จริง/draft ได้ | ต่ำ — ย้ายที่ ไม่แก้ function |
| **P5 — Real-time proxy** (ภายหลัง) | Netlify Function ถือ key สำหรับ ad-hoc query (ผล = L3 เสมอ) | ผู้ใช้ค้นสดได้โดยไม่มี key | แยกส่วน ไม่กระทบ master |

**เกณฑ์ย้ายออกจาก GitHub-as-database ในอนาคต** (บันทึกไว้ล่วงหน้า): ถ้า topics > ~500 หรือไฟล์ store > ~5 MB หรือมีผู้ review หลายคนพร้อม role ต่างกัน → ค่อยย้ายไป Supabase ตาม Option A ใน ARCHITECTURE.md โดย PR workflow ที่วางไว้ย้ายตามได้ทั้งชุด

---

## 7. คำถามที่ปิดแล้ว (บันทึกการตัดสินใจ)

1. Hosting: **GitHub เป็น database** (เหมาะ internal pilot; มี exit criteria ใน §6)
2. อนุมัติ: **คนอนุมัติทุกรายการ** ผ่าน PR review
3. หัวข้อที่ไม่มีใน master: **gen จากความรู้เดิมได้แบบ draft + ต้องอนุมัติก่อนเข้า master / ไม่มีเลย → ส่งคำขอ research พร้อมถาม resource ที่ผู้ใช้ต้องการ**
4. Deep research: **รองรับทั้ง Claude-ใน-workspace (เส้นทางหลักของ master) และ proxy (ad-hoc)**

---

## 8. Auth Model + หน้า Input Sources + หน้าตั้งค่า (เพิ่มเติม 2026-07-13)

### 8.1 หลักการสิทธิ์ใหม่: "ล็อกตามการกระทำ ไม่ล็อกตามหน้า"

| การกระทำ | Before | After |
|---|---|---|
| เปิดดู / ค้นหา / ดูตาราง / ดู source | ต้องใส่รหัสผ่านก่อนเข้าเว็บ (KB_AUTH คุมทั้งหน้า) | **เปิดเสรี ไม่ต้อง login** — เป็น read-only ไม่กระทบระบบ |
| ส่งคำขอ research หัวข้อใหม่ | — (ไม่มีฟีเจอร์) | กรอกชื่อ/หน่วยงานพอ ไม่ต้องรหัสผ่าน (เข้าคิว ไม่แตะ master) + rate limit กันสแปม |
| อนุมัติความรู้เข้า master | รหัสผ่านเดียวกับดูหน้าเว็บ + PAT ส่วนตัว | **GitHub account + สิทธิ์ collaborator** — merge PR คือจุดอนุมัติเดียว เว็บไม่เก็บรหัสอะไรเลย |
| แก้โค้ด/โครงสร้าง | PAT ใน browser | GitHub permission + branch protection |

ผลคือ `KB_AUTH` (login ทั้งหน้า) **ถอดออก**, และการยืนยันตัวตนที่เหลืออยู่ที่เดียวคือ GitHub ซึ่งแข็งแรงกว่ารหัสผ่านฝังไฟล์มาก

### 8.2 หน้า 📤 Input Sources — ปรับให้ตรง flow ใหม่

| ส่วนประกอบปัจจุบัน | ปัญหา | After |
|---|---|---|
| Upload ไฟล์ (PDF/CSV/JSON/MD) | วิเคราะห์เสร็จ commit เข้า TOPICS ได้เลยโดยไม่ผ่านอนุมัติ | คงไว้ แต่ผลวิเคราะห์ = **L3 draft เสมอ** + ปุ่ม "ส่งเข้าคิวอนุมัติ" (เข้า staging → PR) |
| Toggle "ให้ AI ค้นหาอัตโนมัติ" + ช่อง Claude API key | ผู้ใช้ทั่วไปไม่มี key / key เสี่ยงหลุด | ตัดช่อง key ออก → เปลี่ยนเป็นฟอร์ม **"ส่งคำขอ research"** (ระบุหัวข้อ + มาตรฐานที่อยากเน้น) วิ่งเข้า GitHub Actions ฝั่งเซิร์ฟเวอร์ |
| ISKE fallback (ไม่มี key ก็สังเคราะห์ได้) | ผลดูเหมือนความรู้จริง | แสดงได้แบบ draft พร้อม banner "⚠️ ยังไม่ verify จากแหล่งจริง" เท่านั้น |
| Streaming status "ห้ามออกจากหน้านี้" | งานผูกกับ browser tab เปิดค้าง | งานวิ่งบนเซิร์ฟเวอร์ → ปิดหน้าได้ กลับมาดูสถานะที่ "คิวคำขอ" ได้ |

### 8.3 หน้า ⚙️ ตั้งค่า — ปรับให้ตรง flow ใหม่

| ส่วนประกอบปัจจุบัน | After |
|---|---|
| ช่องกรอก GitHub PAT + วิธีสร้าง token | **ตัดออกทั้งหมด** — ไม่มี secret ฝั่ง browser; สิทธิ์เขียนอยู่ที่ GitHub collaborator ของแต่ละ admin |
| Netlify Deploy Hook URL | ตัดออก — merge PR แล้ว CI trigger deploy เองอัตโนมัติ |
| Flow diagram "AI→Gates→Commit→Live" | อัพเดตเป็น flow ใหม่: Request → Research (server) → PR → คนอนุมัติ → Live |
| (ใหม่) | หน้าตั้งค่าเปลี่ยนเป็น **แดชบอร์ด Admin แบบ read-only**: คิวคำขอ, PR ที่รออนุมัติ (ลิงก์ไป GitHub), ประวัติ merge, สถานะ deploy |

*หมายเหตุ: ข้อความในหน้า Settings ปัจจุบันอ้างว่า "ผ่าน 6 Quality Gates แล้ว commit อัตโนมัติ" — ตามโค้ดจริง gates ไม่ได้ถูกบังคับบนเส้นทางนี้ และ auto-commit ขัดกับมติ "คนอนุมัติทุกรายการ" จึงต้องแก้ทั้งข้อความและกลไก*

---

*ยังไม่มีการแก้ไขไฟล์ใดในระบบ — รอคำสั่งให้เริ่ม Phase ใด Phase หนึ่งจากคุณ*
