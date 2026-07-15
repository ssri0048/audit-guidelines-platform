#!/usr/bin/env node
/**
 * research_draft.js — Step 5: ผู้ช่วยร่าง research ใน GitHub Actions
 * ─────────────────────────────────────────────────────────────────
 * หลักการ (SKILL ขั้น 1.5 Reading Manifest — sources-first):
 *   เฟส 1 MANIFEST: list มาตรฐานที่ต้องใช้ → เช็คทะเบียน → ตัวขาด = checklist ห้ามอ้าง (ratchet)
 *   เฟส 2 DRAFT แบบแตกชิ้น (บทเรียนจาก run จริง: โมเดลมี thinking block กินโควตา token
 *          → ขอก้อนใหญ่ก้อนเดียวโดนตัดที่ max_tokens เสมอ):
 *     2a) โครงหัวข้อ + รายชื่อความเสี่ยง (call เล็ก)
 *     2b) เติม control_failures + procedures ทีละความเสี่ยง (call เล็ก × N + auto-retry เมื่อโดนตัด)
 *   ผลลัพธ์ L3/DRAFT เสมอ — มนุษย์ verify ต่อ | ทุกคำตอบผ่าน jsonSlice (ทน fence/ข้อความแถม)
 *
 * ต้องมี env: ANTHROPIC_API_KEY — ไม่มี = จบ exit 0 พร้อมคำอธิบาย
 * Usage: node scripts/research_draft.js "<หัวข้อ>" [out_dir]
 * Test:  node scripts/test_research_draft.js (mock ทุกเคสที่เจอจริง ไม่ใช้ key)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODEL = 'claude-sonnet-5';

/* ── helpers (export ให้ test ได้) ── */
function jsonSlice(s, open, close) {
  const a = s.indexOf(open), b = s.lastIndexOf(close);
  if (a < 0 || b <= a) throw new Error('ไม่พบ ' + open + '...' + close + ' ในคำตอบ');
  return s.slice(a, b + 1);
}
function diag(r) { return `stop=${r.stop} blocks=[${r.types}] len=${r.text.length}`; }

/* error ระดับร้ายแรงที่ retry/drop ไปก็ไม่ช่วย — ทุก call ที่เหลือจะพังเหมือนกันหมด
   → ต้อง 'หยุดทันที' ไม่ใช่ตัด risk ทีละตัวจนเหลือ <5 (เจอจริง run #8: เครดิตหมดกลางคัน
   ตัด R004-R007 แล้วค่อย fail งง). ครอบ: เครดิตหมด, คีย์ผิด/หมดสิทธิ์ (401/403) */
function isFatalApiError(status, bodyText) {
  if (status === 401 || status === 403) return true;
  return /credit balance|purchase credits|Plans & Billing|billing|invalid x-api-key|authentication/i.test(bodyText || '');
}

async function apiCall(key, system, user, maxTokens, fetchFn) {
  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const err = new Error(`API ${res.status}: ${body}`);
    if (isFatalApiError(res.status, body)) err.fatal = true; // ให้ตัวเรียกรู้ว่าห้าม drop/retry
    throw err;
  }
  const data = await res.json();
  return {
    text: data.content.filter(c => c.type === 'text').map(c => c.text).join(''),
    stop: data.stop_reason,
    types: data.content.map(c => c.type).join(','),
  };
}

/* ── ROOT CAUSE ของบั๊ก 'stop=max_tokens' (วินิจฉัยจาก run จริง) ──
   claude-sonnet-5 คิดแบบ adaptive thinking เสมอ (คำขอไม่ได้ส่ง thinking แต่คำตอบมี block
   thinking ทุกครั้ง) และโทเคน thinking ถูก "หักจากโควตา max_tokens ก้อนเดียวกัน" กับคำตอบ
   (ยืนยันจากเอกสาร Anthropic) → ถ้า thinking กินจนหมด คำตอบ (text) โดนตัด/ว่าง
   หลักฐานชัดที่สุด: blocks=[thinking] len=0 = โควตาไปที่ความคิดทั้งหมด เหลือ 0 ให้คำตอบ

   ทำไมของเดิมพัง 2 ชั้น:
   (1) ตั้ง max_tokens ต่ำ (3000/6000) ทั้งที่ max_tokens คือ "เพดานการเรียกเก็บ ไม่ใช่การจอง"
       — จ่ายตามโทเคนที่ผลิตจริง การตั้งเพดานสูงจึงฟรี แต่ตั้งต่ำ = การันตีโดนตัดเมื่อ thinking ยาว
   (2) retry เดิม ×2 จากพื้น 6000 = แตะแค่ 12000 ไม่เคยถึง 20000 ที่ API รับจริง

   วิธีแก้ถาวร: ให้เพดานตั้งต้น "กว้างพอสำหรับ thinking + คำตอบ" ตั้งแต่ครั้งแรก (ฟรีเพราะเป็นเพดาน)
   แล้วบันได retry เป็นตาข่ายสำรอง — ขั้น 2 ดันเต็มเพดาน, ขั้น 3 คงเพดาน + บังคับคำตอบกระชับ */
const MANIFEST_CAP = 8000;  // manifest = array ชื่อสั้น ≤18 ตัว แต่เผื่อ thinking
const DRAFT_CAP = 16000;    // skeleton/CF = JSON มีโครงสร้าง เผื่อ thinking หลายพัน + คำตอบสบาย ๆ
const MAX_CAP = 20000;      // เพดานสูงสุดที่พิสูจน์จาก run จริงว่า API รับ (ใช้ตอน retry)
async function callSafe(key, system, user, maxTokens, fetchFn, compactHint) {
  let r = await apiCall(key, system, user, maxTokens, fetchFn);
  if (r.stop !== 'max_tokens') return r;
  console.log(`  ↻ โดนตัด (${diag(r)}) — retry ขั้น 2 เพดานเต็ม ${MAX_CAP}`);
  r = await apiCall(key, system, user, MAX_CAP, fetchFn);
  if (r.stop !== 'max_tokens') return r;
  const compactUser = user + '\n\nสำคัญมาก: คำตอบก่อนหน้าถูกตัดเพราะยาวเกิน — ตอบใหม่แบบกระชับที่สุด' + (compactHint ? ': ' + compactHint : '') + ' ห้ามเกินความจำเป็น';
  console.log(`  ↻ ยังโดนตัด (${diag(r)}) — retry ขั้น 3 เพดาน ${MAX_CAP} + บังคับกระชับ`);
  r = await apiCall(key, system, compactUser, MAX_CAP, fetchFn);
  if (r.stop === 'max_tokens') throw new Error('โดนตัดครบ 3 ขั้น (' + diag(r) + ') — ชิ้นงานใหญ่ผิดปกติ');
  return r;
}
function parseArr(r, label) {
  try { return JSON.parse(jsonSlice(r.text, '[', ']')); }
  catch (e) { throw new Error(`parse ${label} ไม่ได้ (${e.message}) ${diag(r)} head: ${r.text.slice(0, 300)}`); }
}
function parseObj(r, label) {
  try { return JSON.parse(jsonSlice(r.text, '{', '}')); }
  catch (e) { throw new Error(`parse ${label} ไม่ได้ (${e.message}) ${diag(r)} head: ${r.text.slice(0, 300)}`); }
}

/* ── งานหลัก (รับ deps เพื่อ test ได้) ── */
async function main(topicInput, outDir, key, fetchFn) {
  fs.mkdirSync(outDir, { recursive: true });
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'standards_registry.json'), 'utf8'));
  function famFor(str) {
    for (const f of registry.families) {
      try { if (new RegExp(f.match, 'i').test(str)) return f; } catch (e) {}
    }
    return null;
  }

  // ── เฟส 1: READING MANIFEST ──
  const mRes = await callSafe(key,
    'คุณเป็นผู้เชี่ยวชาญตรวจสอบภายในองค์กรด้านไฟฟ้าไทย ตอบเป็น JSON array ของ string เท่านั้น ไม่มีข้อความอื่น ไม่มี code fence',
    `หัวข้อตรวจสอบ: "${topicInput}"\n\nจงระบุมาตรฐาน/กฎหมาย/กรอบสากลและไทยที่หัวข้อนี้ควรอ้างอิง เป็น JSON array ของชื่อสั้นทางการ+ปี (ไม่ใส่คำอธิบายต่อท้าย) ไม่เกิน 18 รายการ`,
    MANIFEST_CAP, fetchFn);
  const wanted = parseArr(mRes, 'manifest');

  const inRegistry = [], missing = [];
  for (const s of wanted) (famFor(s) ? inRegistry : missing).push(s);

  const manifestMd = [
    `# Reading Manifest — ${topicInput}`, '',
    `สร้างอัตโนมัติโดย research-pipeline (${new Date().toISOString().slice(0, 10)}) ตาม SKILL ขั้น 1.5 sources-first`, '',
    `## ✅ มีทะเบียนแล้ว อ้างได้ (${inRegistry.length})`,
    ...inRegistry.map(s => `- ${s}`), '',
    `## 🚫 ยังไม่มีทะเบียน — RATCHET ห้ามอ้างจนกว่าจะอ่านเข้าทะเบียน (${missing.length})`,
    ...missing.map(s => `- [ ] ${s} → อ่านหน้า official → เพิ่ม family เข้า standards_registry.json ก่อน`), '',
    missing.length ? '> ร่างด้านล่างอ้างเฉพาะกลุ่ม ✅' : '> ทุกตัวมีทะเบียนแล้ว — ร่างอ้างครบ'
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'READING_MANIFEST.md'), manifestMd);
  console.log(`✓ manifest: มีทะเบียน ${inRegistry.length} / ขาด ${missing.length}`);

  // ── เฟส 2a: โครงหัวข้อ + รายชื่อความเสี่ยง (call เล็ก) ──
  const CF_RULES = 'กติกาจำนวนจุดควบคุมบกพร่อง: ตามเหตุผลเชิงวิชาชีพ ไม่ใช่โควตา — โดยธรรมชาติความเสี่ยงหนึ่งมักมีหลายจุด (สอง สาม หรือมากกว่า) ระบุครบเท่าที่มีจริง ห้ามยัดเพิ่มเพื่อให้ครบจำนวน หนึ่งข้อก็ถูกต้องถ้าความจริงมีเท่านั้น | วิธีตรวจ+หลักฐานล้อราย CF ห้ามชุดเดียวหว่านทุก CF';
  const SYS = `คุณเป็นผู้เชี่ยวชาญตรวจสอบภายในองค์กรด้านไฟฟ้าไทย\nกติกาเหล็ก: (1) อ้างอิงได้เฉพาะมาตรฐานในรายการที่ให้เท่านั้น (2) ภาษาไทย (3) ตอบเป็น JSON เดียว ไม่มีข้อความอื่น ไม่มี code fence\n${CF_RULES}`;

  const skRes = await callSafe(key, SYS,
    `หัวข้อ: "${topicInput}"\nมาตรฐานที่อ้างได้: ${inRegistry.join(' | ')}\n\nสร้างโครงหัวข้อเป็น JSON object: {name_th,name_en,category,category_th,priority(CRITICAL/HIGH/MEDIUM),org_applicability(array จาก UNIVERSAL/GOV/SOE/LISTED/PRIVATE/SME/LOCAL_GOV/COOP_COMMUNITY),applicable_standards(เลือกจากรายการที่อ้างได้),thailand_applicable(bool),thai_law_refs(array),risks:[{id:"R001"...,name_th,name_en,level(CRITICAL/HIGH/MEDIUM/LOW),likelihood(สูง/ปานกลาง/ต่ำ),impact(สูงมาก/สูง/ปานกลาง)} × 6-7 รายการ]} — ยังไม่ต้องใส่ control_failures`,
    DRAFT_CAP, fetchFn);
  const skeleton = parseObj(skRes, 'skeleton');
  if (!Array.isArray(skeleton.risks) || skeleton.risks.length < 5) throw new Error('โครงหัวข้อมี risks < 5');
  console.log(`✓ skeleton: ${skeleton.risks.length} risks`);

  // ── เฟส 2b: เติม CF + procedures ทีละความเสี่ยง ──
  // ตาข่ายสุดท้าย: ความเสี่ยงตัวไหนพังครบ 3 ขั้น → ตัดทิ้งแล้วไปต่อ (ห้ามแต่งข้อมูล)
  // skeleton ขอ 6-7 ตัวเผื่อ buffer → ตัดได้ 1-2 ตัวยังเหลือ ≥5 ตามเกณฑ์ P_RISKS งานจบ
  // (ถ้าตัดจนต่ำกว่า 5 = ผิดปกติจริง ควร fail ให้คนสั่งใหม่ ไม่ยอมส่งร่างต่ำเกณฑ์)
  const dropped = [];
  for (const r of skeleton.risks) {
    try {
      const cfRes = await callSafe(key, SYS,
        `หัวข้อ: "${topicInput}" | ความเสี่ยง: "${r.name_th}" (ระดับ ${r.level})\nมาตรฐานที่อ้างได้: ${inRegistry.join(' | ')}\n\nสร้าง JSON object: {control_failures:[{id:"CF${String(r.id).replace('R', '')}-1"...,name_th,audit_procedures:[{id,name_th,method,std_refs:[{std(จากรายการที่อ้างได้เท่านั้น),clause,title}],evidence_types(array 4 รายการพอดี),derivation:"PROFESSIONAL_SYNTHESIS"}]}]}\nกติกาความกระชับ: ชื่อ procedure ไม่เกิน 1 ประโยค, ไม่เกิน 2 procedures ต่อ CF, evidence 4 รายการพอดี`,
        DRAFT_CAP, fetchFn, 'เอาเฉพาะ 2 CF ที่สำคัญที่สุด, procedure ละ 1 ต่อ CF, ทุกชื่อสั้นที่สุด');
      const cfObj = parseObj(cfRes, 'CF ของ ' + r.id);
      if (!Array.isArray(cfObj.control_failures) || cfObj.control_failures.length === 0)
        throw new Error(r.id + ' ไม่มี control_failures');
      r.control_failures = cfObj.control_failures;
      console.log(`✓ ${r.id}: ${r.control_failures.length} CF, ${r.control_failures.reduce((n, c) => n + (c.audit_procedures || []).length, 0)} procedures`);
    } catch (e) {
      if (e.fatal) throw new Error(`หยุดทันที: API error ร้ายแรง (เครดิตหมด/คีย์ผิด) ที่ ${r.id} — ${e.message}\n→ เติมเครดิตที่ console.anthropic.com → Plans & Billing (หรือแก้ ANTHROPIC_API_KEY) แล้วสั่ง pipeline ใหม่`);
      console.log(`⚠️ ${r.id} พังครบทุกขั้น (${e.message}) — ตัดออกจากร่างนี้`);
      dropped.push(r.id + ' ' + r.name_th);
    }
  }
  skeleton.risks = skeleton.risks.filter(r => Array.isArray(r.control_failures));
  if (skeleton.risks.length < 5)
    throw new Error(`เหลือ ${skeleton.risks.length} risks (<5) หลังตัดตัวที่พัง — งานนี้ต้องสั่งใหม่`);
  if (dropped.length) {
    fs.appendFileSync(path.join(outDir, 'READING_MANIFEST.md'),
      '\n\n## ⚠️ ความเสี่ยงที่ถูกตัดออก (สร้างไม่สำเร็จหลัง retry 3 ขั้น — สั่งเพิ่มภายหลังได้)\n' + dropped.map(d => '- ' + d).join('\n'));
  }

  skeleton.approval_status = 'DRAFT';
  skeleton.knowledge_layer = 'L3';
  skeleton.version = '0.1.0';
  fs.writeFileSync(path.join(outDir, 'draft_topic.json'), JSON.stringify(skeleton, null, 2));
  const totCF = skeleton.risks.reduce((n, r) => n + r.control_failures.length, 0);
  console.log(`✅ draft สำเร็จ: ${skeleton.risks.length} risks / ${totCF} CF → ${outDir}`);
  return skeleton;
}

module.exports = { jsonSlice, diag, isFatalApiError, apiCall, callSafe, parseArr, parseObj, main };

/* ── CLI ── */
if (require.main === module) {
  const TOPIC_INPUT = process.argv[2] || '';
  const OUT_DIR = process.argv[3] || '/tmp/research_out';
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!TOPIC_INPUT.trim()) { console.error('❌ ไม่มีหัวข้อ — ใส่หัวข้อเป็น argument แรก'); process.exit(1); }
  if (!KEY) {
    console.log('⏸️ ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ใน repo Secrets — pipeline นี้ตั้งไว้รอ');
    console.log('   วิธีเปิดใช้: Settings → Secrets and variables → Actions → New repository secret → ANTHROPIC_API_KEY');
    process.exit(0);
  }
  main(TOPIC_INPUT, OUT_DIR, KEY, fetch).catch(e => { console.error('❌', e.message); process.exit(1); });
}
