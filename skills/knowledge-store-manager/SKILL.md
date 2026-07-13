# Knowledge Store Manager Skill

## Skill Identity
- **Name**: knowledge-store-manager
- **Version**: 1.0.0
- **Platform**: Intelligent AI Audit Guidelines Platform
- **Organization**: Thai Electricity Authority
- **Language**: Thai / English (bilingual)
- **Schema**: 3.0.0

## Description
Manages the full lifecycle of audit knowledge: from staging through 6-gate quality review to merge into `knowledge_store.json`. Provides real-time knowledge sufficiency evaluation, 4-tier operating mode selection, and structured staging workflows.

## Trigger Conditions
Invoke this skill when the user:
- Asks to "add new audit knowledge" / "เพิ่มความรู้ตรวจสอบ"
- Wants to "validate knowledge quality" / "ตรวจสอบคุณภาพความรู้"
- Requests "run quality gates" / "รัน quality gates"
- Needs to "stage new topic" / "บันทึกหัวข้อใหม่ใน staging"
- Asks about "knowledge sufficiency" / "ความเพียงพอของความรู้"
- Wants to "approve staged knowledge" / "อนุมัติความรู้จาก staging"
- Needs to "merge knowledge" / "รวมความรู้เข้า knowledge store"
- Asks "which mode should I use" / "ควรใช้โหมดไหน"

## Skill Architecture

### 4-Tier Knowledge Mode System
```
Tier 1: MASTER_KNOWLEDGE  → Local knowledge_store.json (L0/L1, score ≥ 70)
Tier 2: EXTERNAL_RESEARCH → Claude API deep research (API key required)
Tier 3: LOCAL_FALLBACK    → Best-effort local match (no API)
Tier 4: LEARNING          → Stage new knowledge to knowledge_staging.json
```

### 6-Gate Quality Pipeline
```
G1_SCHEMA        → All required fields present and correctly typed
G2_DEDUP         → No duplicate IDs or names vs knowledge_store.json
G3_AUTHORITY     → At least one L0 source with credibility ≥ 90%
G4_HALLUCINATION → No fabricated standards, laws, or procedures
G5_CERTIFICATION → Standard version numbers are current and accurate
G6_THAILAND      → Content applies to Thai electricity authority context
```

### Gate Decision Thresholds
| Score Range | Decision       | Action                              |
|-------------|----------------|-------------------------------------|
| ≥ 85%       | AUTO_APPROVE   | Merge directly into knowledge store |
| 70–84%      | MANUAL_REVIEW  | Human review required before merge  |
| < 70%       | REJECT         | Return to requester with feedback   |

## Files Used
| File | Location | Purpose |
|------|----------|---------|
| `knowledge_store.json` | `audit_platform/` | Authoritative knowledge store (schema 3.0.0) |
| `knowledge_staging.json` | `audit_platform/` | Pending review queue |
| `knowledge-base.js` | `audit_platform/` | 4-tier mode logic + sufficiency evaluator |
| `knowledge_store_manager.js` | `audit_platform/` | 6-gate quality engine |

## Workflow Instructions

### Step 1 — Evaluate Knowledge Sufficiency
When the user asks about a topic, call `window.KnowledgeStoreManager` or use `window.evaluateKnowledgeSufficiency()`:

```javascript
var result = G.evaluateKnowledgeSufficiency(userQuery, allTopics);
// Returns: { mode, score, topic, reason }
```

Report the mode and reason to the user in Thai.

### Step 2 — Stage New Knowledge (if LEARNING mode)
When external research yields new knowledge, build a staging entry:

```javascript
var entry = G.buildStagingEntry(topicData, 'EXTERNAL_RESEARCH', 'user:researcher');
// Add to knowledge_staging.json → pending_review[]
```

### Step 3 — Run Quality Gates
Process the staged entry through all 6 gates:

```javascript
var processed = G.KnowledgeStoreManager.processStagingEntry(stagingEntry, existingTopics);
// Returns updated entry with gate_results and review_decision
```

**Report results to user in Thai:**
- ✅ PASS: แต่ละ gate ผ่านการตรวจสอบ (score, notes)
- ⚠️ MANUAL_REVIEW: ต้องการการตรวจสอบจากผู้ตรวจสอบ
- ❌ FAIL: แสดงรายการข้อผิดพลาดและคำแนะนำการแก้ไข

### Step 4 — Approve and Merge
For AUTO_APPROVE or after human approval:

```javascript
var approved = G.KnowledgeStoreManager.approveAndPrepare(stagingEntry, 'system:auto');
var updatedStore = await G.KnowledgeStoreManager.mergeIntoStore(knowledgeStore, approved);
```

Confirm to user: "ความรู้ถูกรวมเข้าสู่ฐานข้อมูลหลักแล้ว (ID: T0XX, version: X.X.X)"

## Response Format (Thai)

### Sufficiency Evaluation Response
```
📊 ผลการประเมินความเพียงพอของความรู้
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 คำค้น: [query]
📚 โหมด: [mode_icon] [mode_label_th]
📈 คะแนน: [score]%
💡 เหตุผล: [reason]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Quality Gate Report
```
🔬 ผลการตรวจสอบ Quality Gates
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
G1 โครงสร้างข้อมูล    : [✅ PASS / ❌ FAIL] (score)%
G2 ตรวจสอบซ้ำ         : [✅ PASS / ❌ FAIL] (score)%
G3 ความน่าเชื่อถือ     : [✅ PASS / ❌ FAIL] (score)%
G4 ตรวจสอบข้อมูลปลอม  : [✅ PASS / ❌ FAIL] (score)%
G5 มาตรฐานอ้างอิง     : [✅ PASS / ❌ FAIL] (score)%
G6 ความเหมาะสมไทย     : [✅ PASS / ❌ FAIL] (score)%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 คะแนนรวม: [overall_score]%
🏷️ ผลการตัดสิน: [AUTO_APPROVE / MANUAL_REVIEW / REJECT]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Schema Reference (3.0.0)

### Topic Entry Required Fields
```json
{
  "id": "T001",
  "name_th": "ชื่อภาษาไทย",
  "name_en": "English Name",
  "category": "Category",
  "priority": "CRITICAL|HIGH|MEDIUM|LOW",
  "knowledge_id": "KN-T001",
  "version": "1.0.0",
  "confidence_score": 85,
  "quality_gate_status": "PASS",
  "approval_status": "APPROVED",
  "knowledge_layer": "L0|L1|L2|L3",
  "thai_law_refs": ["พ.ร.บ...."],
  "source_chain": [{"source_id": "SRC001", "credibility_score": 95}],
  "risks": [...]
}
```

### Knowledge Layers
| Layer | Criteria | Score Range |
|-------|----------|-------------|
| L0 | Golden Source (IIA, ISO, INTOSAI official) | ≥ 95% |
| L1 | Verified knowledge | ≥ 90% |
| L2 | AI-generated, validated | 75–89% |
| L3 | Experimental / unverified | < 75% |

## Error Handling
- If `knowledge_store.json` cannot be read → use LOCAL_FALLBACK mode
- If all gates fail → return detailed FAIL report with fix recommendations in Thai
- If merge fails → restore from last IDB snapshot before retrying
- If staging.json is full (> 100 entries) → warn user to process queue

## Notes for Claude
- Always report gate results in Thai first, then English if requested
- Never auto-merge MANUAL_REVIEW entries without explicit human confirmation
- Preserve existing knowledge: merge = upsert (update existing or insert new)
- After every merge, confirm new knowledge_base_version to the user
- Gate scores are advisory — a single FAIL in G1_SCHEMA or G2_DEDUP is always a hard REJECT
