# Intelligent AI Audit Platform — 20 Reusable Claude Skill Modules
**Platform:** Electricity Authority Audit Intelligence System  
**Version:** 3.0.0 | **Language:** TH/EN | **Last Updated:** 2026-06-11

---

## 📦 SKILL MODULE OVERVIEW

```
WORKFLOW PIPELINE v3.0
─────────────────────────────────────────────────────────────────
LAYER 1: KNOWLEDGE TRUST (SKL011–SKL017)
  [SKL011] ──► [SKL012] ──► [SKL013] ──► [SKL014]
   Source       Authority    Provenance   Citation
   Registry     Scoring      Tracker      Validator
       │
       ▼
  [SKL015] ──► [SKL016] ──► [SKL017]
   Consensus    Hallucin.    Knowledge
   Validator    Firewall     Certification

LAYER 2: CORE PIPELINE (SKL001–SKL010)
USER INPUT ──► [SKL001] ──► [SKL002] ──► [SKL003]
               Harvest      Validate     Thailand
               Knowledge    Standards    Check
                   │
                   ▼
             [SKL004] ──► [SKL005] ──► [SKL006]
              Classify      Classify     Map Control
              Topics        Risks        Failures
                   │
                   ▼
             [SKL007] ──► [SKL008] ──► [SKL009] ──► [SKL010]
              Generate      Generate     Translate    Render
              Procedures    Evidence     to Thai      UI

LAYER 3: DISCOVERY & INTELLIGENCE (SKL018–SKL020)
  [SKL018] ──► [SKL019] ──► [SKL020]
   Multilingual  Domain       Source
   Extractor     Discovery    Reputation
─────────────────────────────────────────────────────────────────
```

---

## SKL001 — Knowledge Harvester (ตัวรวบรวมความรู้)

### Purpose
Autonomously searches and collects audit knowledge from authoritative worldwide sources including INTOSAI, IIA, ISACA, IEEE, IEC, NIST, ISO, and Thailand-specific bodies.

### Trigger Conditions
- User submits a new audit topic
- Existing knowledge is older than 90 days  
- Standards version has been updated

### Process Steps
```
1. Parse topic input → extract key domain terms
2. Search INTOSAI ISSAI database for relevant standards
3. Search IIA Standards 2024 framework
4. Search ISO/IEC technical standards (IEEE for power systems)
5. Search Thai regulatory databases (กกพ., สตง., ป.ป.ช., PDPA)
6. Deduplicate and score results by:
   - Source authority (Tier 1: ISO/IEC, Tier 2: IIA, Tier 3: Academic)
   - Recency (penalty for >3 years old)
   - Thailand relevance score
7. Return ranked knowledge items with citations
```

### Input Schema
```json
{
  "topic": "string (EN or TH)",
  "organization_type": "electricity_authority",
  "country": "TH",
  "max_sources": 15,
  "include_thai_law": true
}
```

### Output Schema
```json
{
  "items": [
    {
      "source": "INTOSAI ISSAI 5600",
      "title": "...",
      "relevance_score": 0.92,
      "is_current": true,
      "thai_applicable": true,
      "key_concepts": ["..."]
    }
  ],
  "search_timestamp": "ISO-8601",
  "total_sources_searched": 15
}
```

### Quality Gates
- ✅ Source must be from Tier 1 or Tier 2 authority
- ✅ Standard must not be superseded
- ✅ Content must match topic domain
- ❌ Reject: blog posts, unverified sources, >5 year old non-standards documents

---

## SKL002 — Standards Validator (ตัวตรวจสอบมาตรฐาน)

### Purpose
Validates that referenced audit standards are current, not superseded, and correctly cited. Prevents use of outdated frameworks.

### Critical Standards for Electricity Authorities (TH)
| Standard | Current Version | Previous | Thai Equivalent |
|----------|----------------|----------|-----------------|
| ISO 55000 | 2014 (Rev 2024 pending) | - | มาตรฐานบริหารสินทรัพย์ |
| NIST CSF | 2.0 (2024) | 1.1 (2018) | NIST CSF 2.0 |
| IEC 62443 | Series 2018-2024 | - | มาตรฐาน OT Security |
| COSO ERM | 2017 | 2004 | กรอบ COSO |
| ISO 31000 | 2018 | 2009 | มาตรฐานบริหารความเสี่ยง |
| IIA Standards | 2024 (IPPF) | 2017 | มาตรฐาน IIA |
| INTOSAI ISSAI | 2022 revision | 2019 | มาตรฐาน สตง. |

### Validation Logic
```
FOR each standard_reference IN input:
  1. Look up current version in standards registry
  2. IF version_in_input != current_version:
     → Flag as "Outdated Reference"
     → Provide correct current version
  3. IF standard has been withdrawn:
     → Flag as "Withdrawn"
     → Suggest replacement standard
  4. IF Thailand has local equivalent:
     → Map to Thai regulation/law
  5. Return validation_result with confidence score
```

### Output
```json
{
  "standard": "IIA Standards",
  "version_claimed": "2017",
  "current_version": "2024",
  "status": "OUTDATED",
  "correction": "Use IIA Global Internal Audit Standards 2024",
  "thai_equivalent": "มาตรฐานการตรวจสอบภายใน สมาคม IIA Thailand",
  "confidence": 0.99
}
```

---

## SKL003 — Thailand Applicability Checker (ตัวตรวจสอบความใช้ได้ในประเทศไทย)

### Purpose
Maps every international standard to its Thai legal and regulatory equivalent, and validates that audit procedures comply with Thai law.

### Thailand Regulatory Mapping Table

| International | Thai Equivalent | Applicable Body |
|--------------|-----------------|-----------------|
| INTOSAI ISSAI | มาตรฐาน สตง. | สำนักงานการตรวจเงินแผ่นดิน |
| ISO 37001 (Anti-Bribery) | พรบ.ป.ป.ช. พ.ศ.2561 | ป.ป.ช. |
| Procurement Best Practice | พรบ.จัดซื้อจัดจ้าง พ.ศ.2560 | กรมบัญชีกลาง |
| GDPR / ISO 27701 | PDPA พ.ศ.2562 | สำนักงาน PDPC |
| Energy Regulation | พรบ.พลังงาน พ.ศ.2550 | กกพ. |
| Environmental Standard | พรบ.สิ่งแวดล้อม พ.ศ.2535 | สผ. |
| Labor Standard | พรบ.คุ้มครองแรงงาน พ.ศ.2541 | กระทรวงแรงงาน |
| Cybersecurity Framework | พรบ.ความมั่นคงปลอดภัยไซเบอร์ พ.ศ.2562 | สกมช. |

### Applicability Scoring
```
Score 1.0 = Thai law directly mandates this
Score 0.8 = Thai law partially covers, international standard supplements
Score 0.6 = International best practice, no direct Thai law
Score 0.4 = Foreign jurisdiction, partial applicability
Score 0.2 = Not applicable in Thailand context
```

### Output Schema
```json
{
  "topic": "Procurement Audit",
  "thai_laws": [
    {
      "law": "พรบ.จัดซื้อจัดจ้างและบริหารพัสดุภาครัฐ พ.ศ.2560",
      "sections": ["มาตรา 7", "มาตรา 24"],
      "applicability_score": 1.0,
      "enforcer": "กรมบัญชีกลาง"
    }
  ],
  "international_supplements": ["INTOSAI GUID 5200"],
  "overall_applicability": "FULLY_APPLICABLE"
}
```

---

## SKL004 — Topic Classification Engine (เครื่องจำแนกหัวข้อ)

### Purpose
Classifies any audit topic into the platform's taxonomy, assigns priority level, and identifies related topics for cross-referencing.

### Topic Taxonomy for Electricity Authorities
```
LEVEL 1: DOMAIN
├── Financial Integrity
│   ├── Procurement & Contract
│   ├── Financial Reporting
│   └── Budget Management
├── Technology & Infrastructure
│   ├── Cybersecurity (IT/OT/SCADA)
│   ├── Asset Management
│   └── Digital Transformation
├── Safety & Operations
│   ├── Grid Safety & Reliability
│   ├── Physical Safety
│   └── Emergency Management
├── Governance & Compliance
│   ├── Corporate Governance
│   ├── Regulatory Compliance
│   └── Risk Management (ERM)
├── ESG
│   ├── Environmental
│   ├── Sustainability & Clean Energy
│   └── Social Responsibility
└── People
    ├── Human Resources
    └── Organizational Culture
```

### Classification Logic
```python
def classify_topic(topic_text):
    # 1. Extract keywords using NLP
    keywords = extract_keywords(topic_text)
    
    # 2. Match against taxonomy nodes
    matches = score_taxonomy_nodes(keywords, TAXONOMY)
    
    # 3. Select best match (score > 0.7)
    best_match = max(matches, key=lambda x: x['score'])
    
    # 4. Assign priority based on:
    #    - Financial materiality
    #    - Regulatory requirement
    #    - Previous audit findings
    priority = assign_priority(best_match, context)
    
    return {
        "domain": best_match['level1'],
        "subdomain": best_match['level2'],
        "priority": priority,  # CRITICAL/HIGH/MEDIUM/LOW
        "related_topics": get_related(best_match)
    }
```

---

## SKL005 — Risk Classification Module (โมดูลจำแนกความเสี่ยง)

### Purpose
Classifies risks using a standardized 5×5 risk matrix, assigns risk levels, and generates risk scores consistent with COSO ERM 2017 and ISO 31000:2018.

### Risk Matrix (5×5)
```
IMPACT →    Very Low  Low  Medium  High  Very High
LIKELIHOOD ↓
Very High  │  Med   │High│ High  │Crit │  Crit  │
High       │  Low   │Med │ High  │High │  Crit  │
Medium     │  Low   │Med │ Med   │High │  High  │
Low        │  Low   │Low │ Med   │Med  │  High  │
Very Low   │  Low   │Low │ Low   │Med  │  Med   │
```

### Risk Level Definitions (Thai)
| Level | Thai | Score Range | Action Required |
|-------|------|-------------|-----------------|
| CRITICAL | วิกฤต | 20-25 | ดำเนินการทันที |
| HIGH | สูง | 12-19 | ดำเนินการเร่งด่วน |
| MEDIUM | ปานกลาง | 6-11 | วางแผนดำเนินการ |
| LOW | ต่ำ | 1-5 | ติดตามและยอมรับ |

### Output per Risk
```json
{
  "risk_id": "R001",
  "likelihood_score": 4,
  "impact_score": 5,
  "risk_score": 20,
  "risk_level": "CRITICAL",
  "risk_level_th": "วิกฤต",
  "coso_category": "Operations",
  "residual_risk": "HIGH",
  "action_required": "ดำเนินการทันที"
}
```

---

## SKL006 — Control Failure Mapper (ตัวแมปความบกพร่องของการควบคุม)

### Purpose
For each identified risk, maps the specific internal control failures using COSO's 5 components of internal control as the framework backbone.

### COSO Control Components Mapping
```
RISK
└── CONTROL ENVIRONMENT failure (e.g., ขาด Tone at Top)
└── RISK ASSESSMENT failure (e.g., ไม่มีกระบวนการประเมินความเสี่ยง)
└── CONTROL ACTIVITIES failure (e.g., ขาดการแบ่งแยกหน้าที่)
└── INFORMATION & COMMUNICATION failure (e.g., ไม่มีระบบรายงาน)
└── MONITORING failure (e.g., ขาดการติดตามผล)
```

### Control Failure Classification
```json
{
  "control_failure_id": "CF001",
  "parent_risk": "R001",
  "coso_component": "Control Activities",
  "control_type": "Preventive",
  "severity": "Material Weakness",
  "severity_options": ["Material Weakness", "Significant Deficiency", "Control Deficiency"],
  "root_cause": "Process Design Gap",
  "remediation_priority": "Immediate"
}
```

---

## SKL007 — Audit Procedure Generator (เครื่องสร้างขั้นตอนการตรวจสอบ)

### Purpose
Generates specific, actionable audit procedures for each control failure. Procedures follow IIA Professional Practices Framework and INTOSAI ISSAI methodologies.

### Procedure Generation Rules
```
FOR each control_failure:
  1. Identify control failure TYPE:
     - Design Gap → Test if control was designed
     - Operating Effectiveness → Test if control works in practice
     - Both → Generate procedures for both

  2. Select AUDIT METHOD:
     - Document Review (for policies, procedures)
     - Interview (for process understanding)
     - Observation (for physical controls)
     - Re-performance (for calculations, reconciliations)
     - Data Analytics (for transaction-level testing)
     - Technical Testing (for IT/OT systems)

  3. Define SAMPLING APPROACH:
     - High risk: 100% population or statistical sample (95% CI)
     - Medium risk: Judgmental sample (25-30 items)
     - Low risk: Analytical procedures only

  4. Specify TIMING:
     - Planning phase / Fieldwork phase / Reporting phase
```

### Procedure Output Template
```json
{
  "procedure_id": "AP001",
  "name_th": "ตรวจสอบโครงสร้างคณะกรรมการจัดซื้อ",
  "name_en": "Review procurement committee structure",
  "method": "Document Review + Interview",
  "method_th": "ทบทวนเอกสาร + สัมภาษณ์",
  "timing": "Fieldwork",
  "sample_approach": "Full population",
  "estimated_hours": 8,
  "skill_required": "Procurement Auditor",
  "ippf_reference": "IIA 2320"
}
```

---

## SKL008 — Evidence Type Generator (เครื่องสร้างประเภทหลักฐาน)

### Purpose
For each audit procedure, identifies the exact types of evidence required, their format, source system, and retention requirements under Thai law.

### Evidence Classification Framework
```
EVIDENCE TYPES
├── Documentary Evidence
│   ├── Policies & Procedures
│   ├── Contracts & Agreements
│   ├── Reports & Logs
│   └── Correspondence
├── Physical Evidence
│   ├── Asset Inspection Records
│   └── Site Visit Photographs
├── Electronic/Digital Evidence
│   ├── System Screenshots
│   ├── Audit Trails / Logs
│   ├── Database Exports
│   └── Configuration Files
└── Testimonial Evidence
    ├── Interview Minutes
    └── Management Representations
```

### Thai Evidence Retention Requirements
| Evidence Type | Retention Period | Legal Basis |
|--------------|-----------------|-------------|
| Financial Records | 5 ปี | พรบ.การบัญชี |
| Procurement Records | 10 ปี | พรบ.จัดซื้อจัดจ้าง |
| Audit Working Papers | 5 ปี | มาตรฐาน สตง. |
| Cybersecurity Logs | 90 วัน | พรบ.คอมพิวเตอร์ |
| HR Records | 5 ปี (หลังพ้นสภาพ) | พรบ.คุ้มครองแรงงาน |

### Output Schema
```json
{
  "procedure_id": "AP001",
  "evidence_items": [
    {
      "name_th": "คำสั่งแต่งตั้งคณะกรรมการจัดซื้อ",
      "type": "Documentary",
      "format": "PDF",
      "source": "ฝ่ายพัสดุ",
      "retention_years": 10,
      "legal_basis": "พรบ.จัดซื้อจัดจ้าง พ.ศ.2560",
      "sufficiency_note": "ต้องมีลายมือชื่ออนุมัติและวันที่"
    }
  ]
}
```

---

## SKL009 — Thai Translation Engine (เครื่องแปลภาษาไทย)

### Purpose
Provides accurate Thai translation of all audit content using specialized audit and electricity authority terminology. Maintains a bilingual glossary of technical terms.

### Specialized Audit Terminology Glossary (EN → TH)

| English Term | Thai Term | Context |
|-------------|-----------|---------|
| Internal Audit | การตรวจสอบภายใน | General |
| Risk Assessment | การประเมินความเสี่ยง | General |
| Control Failure | ความบกพร่องของการควบคุม | COSO |
| Material Weakness | จุดอ่อนที่มีนัยสำคัญ | Audit Deficiency |
| Audit Procedure | ขั้นตอนการตรวจสอบ | IIA |
| Evidence | หลักฐาน | Audit |
| Segregation of Duties | การแบ่งแยกหน้าที่ | Internal Control |
| Procurement Fraud | ทุจริตการจัดซื้อ | Compliance |
| Power Grid | โครงข่ายไฟฟ้า | Power Systems |
| SCADA | ระบบควบคุมและดูแลการรับส่งข้อมูล | OT/ICS |
| Contingency Analysis | การวิเคราะห์สถานการณ์ฉุกเฉิน | Grid |
| Asset Register | ทะเบียนสินทรัพย์ | Asset Mgmt |
| Penetration Testing | การทดสอบเจาะระบบ | Cybersecurity |
| Whistleblowing | การแจ้งเบาะแส | Governance |
| Carbon Footprint | รอยเท้าคาร์บอน | ESG |

### Translation Rules
```
1. PRESERVE technical acronyms in English where Thai audience uses English term
   (e.g., SCADA, ERM, PDCA remain as-is)
2. USE Royal Institute Dictionary (ราชบัณฑิตยสภา) approved terms
3. MAINTAIN formal Thai (ภาษาราชการ) for all official content
4. PROVIDE English subtitle for all Thai headings
5. NUMBER all items consistently in Thai (หนึ่ง, สอง... or ๑, ๒...)
```

---

## SKL010 — UX/UI Renderer (ตัวแสดงผล UX/UI)

### Purpose
Transforms normalized audit knowledge into a clean, enterprise-grade, Thai-language interactive web artifact. Follows WCAG 2.1 AA accessibility standards.

### UI Component Library
```
COMPONENTS
├── TopicSelector
│   ├── SearchBar (with Thai/EN support)
│   ├── CategoryFilter (pills)
│   └── TopicCard (with risk level badge)
├── RiskDashboard
│   ├── RiskMatrix (5×5 visual)
│   ├── RiskCard (multi-select)
│   └── RiskSummaryBadge
├── AuditTable
│   ├── HierarchyTree (Topic→Risk→CF→AP→Evidence)
│   ├── FilterBar
│   ├── SortableColumns
│   └── ExportButton (CSV/Print)
└── KnowledgePanel
    ├── StandardsReference
    ├── ThaiLawMapping
    └── LastUpdatedBadge
```

### Rendering Pipeline
```
normalized_knowledge_json
      │
      ▼
  [Template Engine]
      │
      ├── Apply Thai language pack
      ├── Apply enterprise color scheme
      ├── Inject knowledge data
      └── Add interactive controls
      │
      ▼
  [HTML Artifact]
      │
      ├── Desktop (1200px+)
      ├── Tablet (768px+)
      └── Mobile (375px+)
```

### Design Tokens
```css
--color-primary: #1B3A6B;      /* Navy Blue - Enterprise */
--color-accent: #E8B84B;       /* Gold - Authority */
--color-critical: #E74C3C;     /* Red - Critical Risk */
--color-high: #E67E22;         /* Orange - High Risk */
--color-medium: #F39C12;       /* Yellow - Medium Risk */
--color-low: #27AE60;          /* Green - Low Risk */
--font-primary: 'Sarabun', sans-serif;  /* Thai font */
--font-secondary: 'IBM Plex Sans', sans-serif;
```

---

## 🔄 COMPLETE AUTOMATION WORKFLOW

```
INPUT: User types audit topic (EN or TH)
   │
   ├─ SKL001: Harvest knowledge from 15+ authoritative sources
   │      └─ Output: Raw knowledge items + citations
   │
   ├─ SKL002: Validate all referenced standards
   │      └─ Output: Validated / flagged standards
   │
   ├─ SKL003: Check Thailand applicability
   │      └─ Output: Thai law mapping + applicability score
   │
   ├─ SKL004: Classify topic into taxonomy
   │      └─ Output: Domain, subdomain, priority
   │
   ├─ SKL005: Classify all identified risks
   │      └─ Output: Risk levels (CRITICAL/HIGH/MEDIUM/LOW)
   │
   ├─ SKL006: Map control failures per risk
   │      └─ Output: COSO-mapped control failures
   │
   ├─ SKL007: Generate audit procedures per control failure
   │      └─ Output: Specific, actionable procedures
   │
   ├─ SKL008: Generate evidence requirements per procedure
   │      └─ Output: Evidence types + retention + legal basis
   │
   ├─ SKL009: Translate all content to Thai
   │      └─ Output: Full Thai content with EN subtitles
   │
   └─ SKL010: Render interactive artifact UI
          └─ Output: Deployed HTML artifact (Thai)

KNOWLEDGE TRUST LAYER (v3.0 — runs before SKL001):
  ├─ SKL011: Load domain source registry (L0/L1/RegThai per domain)
  │      └─ Output: Approved source list for current topic domain
  │
  ├─ SKL012: Score authority of all cited standards
  │      └─ Output: {score, layer, trusted, flagged} per standard
  │
  ├─ SKL013: Track document provenance (URL+Page+Clause)
  │      └─ Output: Provenance chain per knowledge node
  │
  ├─ SKL014: Validate citation existence before commit
  │      └─ Output: Verified / rejected citations
  │
  ├─ SKL015: Multi-source consensus check (≥3 sources)
  │      └─ Output: Consensus score + divergence flags
  │
  ├─ SKL016: Hallucination Firewall
  │      └─ Output: PASS / BLOCK with pattern flags
  │
  └─ SKL017: Assign knowledge layer L0–L3 + trust score
         └─ Output: _meta.knowledge_layer + _meta.trust_score

DISCOVERY LAYER (v3.3):
  ├─ SKL018: Extract multilingual content (TH/EN/OCR)
  │      └─ Output: Normalized text + language tags
  │
  ├─ SKL019: Discover new domains automatically
  │      └─ Output: Domain candidates + confidence scores
  │
  └─ SKL020: Evaluate source reputation dynamically
         └─ Output: Reputation score + recency flag

STORAGE: Update knowledge_store.json with new topic data
EXPORT: PDF / CSV / Print-ready format
```

---

## SKL011 — Source Registry Manager (ตัวจัดการ Registry แหล่งความรู้)

**Purpose:** โหลดและจัดการรายการแหล่งข้อมูลที่เชื่อถือได้ต่อ domain ก่อนเริ่ม pipeline ทุกครั้ง

**Phase:** v3.0 ✅ Implemented | **Priority:** CRITICAL | **Trust Layer:** T1

**Input:**
```
domain: string (internal_audit | cybersecurity | risk_management | grid_safety | compliance_regulatory | procurement | financial | ai_platform_governance)
```

**Output:**
```json
{
  "l0": ["IIA IPPF 2024", "INTOSAI ISSAI 100", ...],
  "l1": ["COBIT 2019", "ISACA ..."],
  "reg_thai": ["พ.ร.บ.จัดซื้อจัดจ้าง 2560", "ประกาศ กกพ. ..."]
}
```

**Implementation:** `DOMAIN_SOURCE_REGISTRY` constant in `audit-platform-public.html`

**Rules:**
- L0 sources คือ golden sources — ห้ามนำ AI-generated output มา overwrite
- ถ้า domain ไม่พบใน registry ให้ default ไป `internal_audit`
- แสดง badge `[L0]` `[L1]` `[RegThai]` ต่อทุก source ใน source panel

**Integration Points:**
- เรียกก่อน SKL001 ทุกครั้ง
- ผลลัพธ์ส่งต่อให้ SKL012 (Authority Scoring) และ SKL001 (Knowledge Harvester)

---

## SKL012 — Authority Scoring Engine (เครื่องประเมินความน่าเชื่อถือของแหล่งอ้างอิง)

**Purpose:** ให้คะแนน 0–100 แก่ทุก standard ที่อ้างอิง และจัดระดับเป็น L0/L1/L2/L3

**Phase:** v3.0 ✅ Implemented | **Priority:** CRITICAL | **Trust Layer:** T2

**Formula:**
```
Authority Score = Citation(25) + Regulatory(25) + PeerReview(20) + International(20) + Freshness(10)
```

**Scoring Table:**
| Score | Layer | Label | Action |
|-------|-------|-------|--------|
| 90–100 | L0 | Golden Source | ใช้เป็น primary reference ได้ทันที |
| 75–89 | L1 | Verified | ใช้พร้อม citation; แนะนำใช้คู่กับ L0 |
| 40–74 | L2 | Generated | Flag for human review ก่อน commit |
| 0–39 | L3 | Unverified | Block จาก knowledge base; ต้องผ่าน manual verify |

**Implementation:** `calculateAuthorityScore(standardName)` in HTML

**Return:**
```javascript
{ score: 0-100, layer: 'L0'|'L1'|'L2'|'L3', trusted: boolean, flagged: boolean }
```

**Flags:**
- `flagged: true` → standard version อยู่ในอนาคต (year > 2026)
- ถ้า avg authority score < 65 → เพิ่ม Q6 warning ใน quality issues
- ถ้า flagged standards ≥ 1 → เพิ่ม Q6 critical warning

**Integration Points:**
- เรียกใน `validateAndEnrichAuditOutput()` → Q6 gate
- ผลลัพธ์ store ใน `_meta.avg_authority_score` และ `_meta.l0_count`

---

## SKL013 — Document Provenance Tracker (ตัวติดตามที่มาของเอกสาร)

**Purpose:** บันทึก URL + PDF page + clause สำหรับทุก knowledge node เพื่อให้ตรวจสอบย้อนกลับได้

**Phase:** v3.1 🔲 Planned | **Priority:** HIGH | **Trust Layer:** T3

**Target Schema (per Audit Procedure):**
```json
{
  "provenance": {
    "source_url": "https://...",
    "document_title": "IIA Global Internal Audit Standards 2024",
    "page_number": 47,
    "clause": "Standard 9.1",
    "retrieved_at": "2026-06-11T..."
  }
}
```

**Rules:**
- ทุก Audit Procedure ต้องมี provenance ≥1 record
- ถ้าไม่มี URL ให้ระบุ `source_type: 'offline_document'` พร้อม ISBN หรือ edition
- Provenance chain ต้องไม่วนกลับมาที่ AI-generated output (Knowledge Drift prevention)

**Implementation Plan:**
- เพิ่ม `provenance[]` array ใน procedure object
- แสดงใน source panel ด้านล่าง citation chip
- Export ไปยัง knowledge_store.json พร้อม topic

---

## SKL014 — Citation Validator (ตัวตรวจสอบความถูกต้องของการอ้างอิง)

**Purpose:** ยืนยันว่า clause และ version ที่อ้างอิงมีอยู่จริงก่อน commit เข้า knowledge base

**Phase:** v3.1 🔲 Planned | **Priority:** HIGH | **Trust Layer:** T4

**Validation Checks:**
1. Standard name อยู่ใน `DOMAIN_SOURCE_REGISTRY` หรือไม่?
2. Version year ≤ 2026 (ไม่ใช่ future-dated)?
3. Clause format ถูกต้องตาม standard นั้น? (เช่น IIA = "Standard X.Y", NIST = "PR.AA-01")
4. ไม่ใช่ citation ที่ AI fabricated (pattern check)?

**Red Flags (auto-reject):**
```
- "Standard 99.x" or clause numbers > 20 digits
- Version year > current year
- Publisher ไม่ตรงกับ standard name (เช่น "ISO" แต่ publisher = "Unknown Corp")
- Citation ที่ไม่มีใน L0 หรือ L1 registry แต่ claim เป็น "official standard"
```

**Output:**
```javascript
{ valid: boolean, issues: string[], suggestion: string|null }
```

---

## SKL015 — Multi-Source Consensus Validator (ตัวตรวจสอบฉันทามติหลายแหล่ง)

**Purpose:** ตรวจสอบว่าข้อมูลที่สังเคราะห์มาจากแหล่งที่อิสระกัน ≥3 แหล่ง และมีฉันทามติ

**Phase:** v3.2 🔲 Planned | **Priority:** HIGH | **Trust Layer:** T5

**Consensus Rules:**
| Sources | Status | Action |
|---------|--------|--------|
| ≥3 L0 sources agree | ✅ High Consensus | Commit as L1 knowledge |
| 2 L0 + 1 L1 agree | ✅ Medium Consensus | Commit as L1 with flag |
| 1 L0 only | ⚠️ Low Consensus | Commit as L2 with warning |
| 0 L0 sources | ❌ No Consensus | Block; require human review |

**Divergence Detection:**
- ถ้า sources ขัดแย้งกัน (เช่น IIA กำหนด 5 ขั้นตอน แต่ INTOSAI กำหนด 7 ขั้นตอน) → ให้แสดงทั้งสองแนวทางพร้อม source attribution
- ห้าม synthesize หรือ average ออกมาเป็นขั้นตอนเดียวโดยไม่ label divergence

**Output:**
```javascript
{ consensus_score: 0-100, source_count: number, layer_assignment: 'L1'|'L2'|'L3', divergences: string[] }
```

---

## SKL016 — Hallucination Firewall (กำแพงป้องกัน Hallucination)

**Purpose:** ตรวจจับและ block AI output ที่อ้างอิง standard เวอร์ชันอนาคต, citation ที่ไม่มีอยู่จริง, หรือ pattern ที่บ่งชี้ hallucination

**Phase:** v3.0 ✅ Implemented (Q7 gate) | **Priority:** CRITICAL | **Trust Layer:** T6

**Verification Checklist (5 items):**
1. ✅ Standard version year ≤ 2026
2. ✅ Standard name ตรงกับ DOMAIN_SOURCE_REGISTRY
3. ✅ Clause format ถูกต้องตาม standard นั้น
4. ✅ Publisher/issuing body ถูกต้อง
5. ✅ ไม่มี self-referential citation (AI citing its own previous output)

**Pattern Flags (auto-block):**
```
/:20[3-9]\d/          → Future year (2030–2099)
/Standard \d{3,}/     → Clause numbers too long
/ISO\/IEC \d{6}/      → ISO number format invalid (max 5 digits)
/พ\.ร\.บ\. (?!\w)/   → Thai statute reference without name
/unpublished draft/   → Draft documents as primary source
```

**Implementation:** Q7 gate in `validateAndEnrichAuditOutput()` in HTML

**Output on Block:**
```javascript
issues.push("Q7: Hallucination Firewall — พบ year อนาคต: [2031] ใน standard references")
```

**Key Rule:** ห้าม output audit procedures ที่อ้างอิง standards ที่ไม่ผ่าน firewall นี้

---

## SKL017 — Knowledge Certification (การรับรองระดับความรู้)

**Purpose:** กำหนด label L0–L3 และ Trust Score ให้ทุก knowledge topic ก่อน commit

**Phase:** v3.0 ✅ Implemented (Q8 gate) | **Priority:** HIGH | **Trust Layer:** T7

**Certification Formula:**
```
Trust Score = avg(authority_scores of all std[]) 
Knowledge Layer:
  score ≥ 90  → L1 (Verified Knowledge)
  score ≥ 75  → L2 (Generated Knowledge — display only)
  score < 75  → L3 (Experimental — human sign-off required)

Note: L0 is reserved for source documents only, not for AI-generated topics
```

**Metadata Written:**
```javascript
topic._meta.knowledge_layer = 'L1' | 'L2' | 'L3'
topic._meta.trust_score     = 0–100
topic._meta.avg_authority_score = number
topic._meta.l0_count        = number  // how many L0 standards cited
topic._meta.validated_at    = ISO8601 timestamp
```

**UI Rendering:**
- L1 → แสดง badge `✅ L1 Verified` สีเขียว
- L2 → แสดง badge `🔵 L2 Generated` สีน้ำเงิน
- L3 → แสดง badge `⚠️ L3 Experimental` สีเหลือง + ต้องมี human sign-off button

**Implementation:** Q8 gate in `validateAndEnrichAuditOutput()` in HTML

---

## SKL018 — Multilingual Extractor (ตัวดึงข้อมูลหลายภาษา)

**Purpose:** ดึงและ normalize ข้อมูลจากเอกสารที่เป็นภาษาไทย, อังกฤษ, หรือ OCR scan

**Phase:** v3.3 🔲 Planned | **Priority:** MEDIUM

**Supported Input Types:**
| Type | Processing |
|------|-----------|
| Thai PDF (native text) | Direct extraction + terminology normalization |
| English PDF | Extraction + Thai terminology mapping |
| Scanned PDF (OCR) | Tesseract/Google Vision → text → normalize |
| Mixed TH/EN | Language detection → split → process each |
| HTML web page | DOM extraction → clean → normalize |

**Output Schema:**
```json
{
  "original_language": "th" | "en" | "mixed",
  "normalized_text": "...",
  "key_terms": [{"th": "การจัดซื้อ", "en": "Procurement", "standard_ref": "COSO"}],
  "confidence": 0.0–1.0
}
```

**Thai Audit Terminology Mapping (sample):**
| Thai | English | Standard |
|------|---------|----------|
| การควบคุมภายใน | Internal Control | COSO |
| กระบวนการตรวจสอบ | Audit Procedure | IIA IPPF |
| หลักฐานการตรวจสอบ | Audit Evidence | INTOSAI ISSAI |
| ความเสี่ยง | Risk | ISO 31000 |
| ข้อบกพร่องของการควบคุม | Control Failure/Deficiency | COSO ERM |

---

## SKL019 — Domain Discovery Agent (ตัวค้นหา Domain อัตโนมัติ)

**Purpose:** ค้นหา domain ใหม่ที่เกี่ยวข้องกับ electricity authority โดยอัตโนมัติ เพื่อขยาย DOMAIN_SOURCE_REGISTRY

**Phase:** v3.2 🔲 Planned | **Priority:** HIGH

**Discovery Triggers:**
- ผู้ใช้ป้อน topic ที่ไม่อยู่ใน domain ปัจจุบัน
- Keyword ใหม่ปรากฏใน ≥3 topics
- ผู้ตรวจสอบขอ domain เพิ่มเติม

**Discovery Process:**
```
1. รับ topic ที่ไม่มี domain match
2. ค้นหา standards organizations ที่เกี่ยวข้อง (web search)
3. ตรวจสอบว่ามี L0 sources สำหรับ domain นี้หรือไม่
4. สร้าง domain_candidate entry
5. ส่งให้ human review ก่อน add เข้า DOMAIN_SOURCE_REGISTRY
```

**Output:**
```json
{
  "domain_candidate": "asset_management",
  "suggested_l0": ["ISO 55001:2014", "PAS 55-1:2008"],
  "suggested_l1": ["GFMAM Landscape 2019"],
  "confidence": 0.87,
  "trigger_topics": ["การบำรุงรักษาสายไฟ", "การจัดการทรัพย์สิน"],
  "requires_human_review": true
}
```

**Governance Rule:** Domain candidates ต้องผ่าน human approval ก่อน production use เสมอ — ห้าม auto-approve

---

## SKL020 — Source Reputation Agent (ตัวประเมินชื่อเสียงแหล่งข้อมูลแบบ Dynamic)

**Purpose:** ประเมินชื่อเสียงและความน่าเชื่อถือของแหล่งข้อมูลแบบ real-time โดยดูจาก citation count, recency, และ regulatory recognition

**Phase:** v3.3 🔲 Planned | **Priority:** MEDIUM

**Reputation Factors:**
| Factor | Weight | Data Source |
|--------|--------|-------------|
| Citation frequency (cited by other L0/L1 sources) | 30% | CrossRef API / Google Scholar |
| Regulatory recognition (ถูกอ้างอิงในกฎหมาย) | 25% | Thai Government Gazette, IIA Thailand |
| Recency (last updated ≤ 3 years) | 20% | Publisher website |
| Peer review / expert endorsement | 15% | Professional body recognition |
| Geographic relevance (Thailand applicability) | 10% | EGAT/MEA/PEA regulatory filings |

**Output:**
```json
{
  "source_name": "IIA Global Internal Audit Standards 2024",
  "reputation_score": 97,
  "trend": "stable",
  "last_verified": "2026-06-11",
  "flags": [],
  "recommended_layer": "L0"
}
```

**Dynamic Update Rules:**
- Re-evaluate sources ทุก 6 เดือน
- ถ้า reputation score ลดลง > 15 points → flag for human review
- ถ้า standard ถูก superseded (เช่น IIA IPPF 2024 → 2026 edition) → อัพเดท registry อัตโนมัติ แต่ต้องผ่าน human confirm
- ห้ามลด L0 source เป็น L1/L2 โดยไม่ผ่าน audit committee approval

---

## 🔄 COMPLETE AUTOMATION WORKFLOW

```
INPUT: User types audit topic (EN or TH)
   │
   ├─ SKL011: Load domain source registry for topic domain
   │      └─ Output: Approved L0/L1/RegThai source list
   │
   ├─ SKL001: Harvest knowledge from 15+ authoritative sources
   │      └─ Output: Raw knowledge items + citations
   │
   ├─ SKL002: Validate all referenced standards
   │      └─ Output: Validated / flagged standards
   │
   ├─ SKL003: Check Thailand applicability
   │      └─ Output: Thai law mapping + applicability score
   │
   ├─ SKL004: Classify topic into taxonomy
   │      └─ Output: Domain, subdomain, priority
   │
   ├─ SKL005: Classify all identified risks
   │      └─ Output: Risk levels (CRITICAL/HIGH/MEDIUM/LOW)
   │
   ├─ SKL006: Map control failures per risk
   │      └─ Output: COSO-mapped control failures
   │
   ├─ SKL007: Generate audit procedures per control failure
   │      └─ Output: Specific, actionable procedures
   │
   ├─ SKL008: Generate evidence requirements per procedure
   │      └─ Output: Evidence types + retention + legal basis
   │
   ├─ SKL012: Score authority of all cited standards
   │      └─ Output: Authority scores + layer assignments (Q6 gate)
   │
   ├─ SKL016: Run Hallucination Firewall
   │      └─ Output: PASS / BLOCK with pattern flags (Q7 gate)
   │
   ├─ SKL017: Certify knowledge layer (L1/L2/L3)
   │      └─ Output: _meta.knowledge_layer + trust_score (Q8 gate)
   │
   ├─ SKL009: Translate all content to Thai
   │      └─ Output: Full Thai content with EN subtitles
   │
   └─ SKL010: Render interactive artifact UI
          └─ Output: Deployed HTML artifact (Thai)

STORAGE: Update knowledge_store.json with new topic data
EXPORT: PDF / CSV / Print-ready format
```

---

*Generated by: Intelligent AI Audit Platform v3.0 | สงวนลิขสิทธิ์ 2026*
