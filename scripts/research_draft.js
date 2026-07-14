#!/usr/bin/env node
/**
 * research_draft.js — Step 5: ผู้ช่วยร่าง research ใน GitHub Actions
 * ─────────────────────────────────────────────────────────────────
 * หลักการ (ตรงกับ SKILL ขั้น 1.5 Reading Manifest — sources-first):
 *   1) รับหัวข้อจาก issue (label: research-request) หรือ workflow_dispatch
 *   2) เฟส MANIFEST: ให้ Claude list มาตรฐาน/กฎหมายทุกตัวที่หัวข้อนี้ต้องอ้าง
 *      → เช็คกับ standards_registry.json
 *      → ตัวที่ไม่มีทะเบียน = รายการ "ต้องอ่านเข้าทะเบียนก่อน" (ratchet: ห้ามอ้าง)
 *   3) เฟส DRAFT: ร่างหัวข้อโดยอ้างได้เฉพาะมาตรฐานที่มีทะเบียนแล้วเท่านั้น
 *      → สถานะ DRAFT/L3 เสมอ — มนุษย์+Cowork ทำ verification ต่อ แล้วจึงยกเป็น L1
 *   4) ผลลัพธ์: ไฟล์ draft + manifest → workflow เปิด PR (ไม่มีทาง merge เอง)
 *
 * ต้องมี env: ANTHROPIC_API_KEY (GitHub Secret) — ไม่มี = จบพร้อมคำอธิบาย ไม่ error
 * Usage: node scripts/research_draft.js "<หัวข้อ>" [out_dir]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TOPIC_INPUT = process.argv[2] || '';
const OUT_DIR = process.argv[3] || '/tmp/research_out';
const KEY = process.env.ANTHROPIC_API_KEY;

if (!TOPIC_INPUT.trim()) { console.error('❌ ไม่มีหัวข้อ — ใส่หัวข้อเป็น argument แรก'); process.exit(1); }
if (!KEY) {
  console.log('⏸️ ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ใน repo Secrets — pipeline นี้ตั้งไว้รอ');
  console.log('   วิธีเปิดใช้: Settings → Secrets and variables → Actions → New repository secret → ANTHROPIC_API_KEY');
  process.exit(0); // จบแบบสุภาพ ไม่ทำ workflow แดง
}

const ROOT = path.join(__dirname, '..');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'standards_registry.json'), 'utf8'));
const famList = registry.families.map(f => `- ${f.display} [match: ${f.match}] สถานะ: ${(f.editions || []).map(e => `${e.version}=${e.status}${e.verified ? '' : '(ยังไม่ verify)'}`).join(', ')}`).join('\n');
const skill = fs.readFileSync(path.join(ROOT, 'skills', 'deep-research-protocol', 'SKILL.md'), 'utf8').slice(0, 12000);

function famFor(str) {
  for (const f of registry.families) {
    try { if (new RegExp(f.match, 'i').test(str)) return f; } catch (e) {}
  }
  return null;
}

// ดึง JSON ออกจากคำตอบแบบทนทาน: ตัดหน้า-หลังหา [...] หรือ {...} คู่นอกสุด (กัน code fence/ข้อความแถม)
function jsonSlice(s, open, close) {
  const a = s.indexOf(open), b = s.lastIndexOf(close);
  if (a < 0 || b <= a) throw new Error('ไม่พบ ' + open + '...' + close + ' ในคำตอบ (อาจถูกตัดกลางทาง — เช็ค max_tokens)');
  return s.slice(a, b + 1);
}

async function callClaude(system, user, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  // เอาเฉพาะ text blocks (กันเคสมี block ชนิดอื่นเช่น thinking) + คืน diagnostics ครบ
  return {
    text: data.content.filter(c => c.type === 'text').map(c => c.text).join(''),
    stop: data.stop_reason,
    types: data.content.map(c => c.type).join(','),
  };
}
function diag(r) { return `stop=${r.stop} blocks=[${r.types}] len=${r.text.length}`; }

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── เฟส 1: READING MANIFEST ──
  const manifestRaw = await callClaude(
    'คุณเป็นผู้เชี่ยวชาญตรวจสอบภายในองค์กรด้านไฟฟ้าไทย ตอบเป็น JSON array ของ string เท่านั้น ไม่มีข้อความอื่น ไม่มี code fence',
    `หัวข้อตรวจสอบ: "${TOPIC_INPUT}"\n\nจงระบุมาตรฐาน/กฎหมาย/กรอบสากลและไทยที่หัวข้อนี้ควรอ้างอิง เป็น JSON array ของชื่อสั้นทางการ+ปี (ไม่ใส่คำอธิบายต่อท้าย) ไม่เกิน 18 รายการ เช่น ["IIA GIAS 2024","ISO/IEC 27001:2022","พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562"]`,
    3000
  );
  let wanted;
  try {
    if (manifestRaw.stop === 'max_tokens') throw new Error('คำตอบถูกตัดที่เพดาน max_tokens');
    wanted = JSON.parse(jsonSlice(manifestRaw.text, '[', ']'));
  }
  catch (e) { console.error('parse manifest ไม่ได้ (' + e.message + ') ' + diag(manifestRaw) + ' head:', manifestRaw.text.slice(0, 600)); process.exit(1); }

  const inRegistry = [], missing = [];
  for (const s of wanted) (famFor(s) ? inRegistry : missing).push(s);

  const manifestMd = [
    `# Reading Manifest — ${TOPIC_INPUT}`, '',
    `สร้างอัตโนมัติโดย research-pipeline (${new Date().toISOString().slice(0, 10)}) ตาม SKILL ขั้น 1.5 sources-first`, '',
    `## ✅ มีทะเบียนแล้ว อ้างได้ (${inRegistry.length})`,
    ...inRegistry.map(s => `- ${s}`), '',
    `## 🚫 ยังไม่มีทะเบียน — RATCHET ห้ามอ้างจนกว่าจะอ่านเข้าทะเบียน (${missing.length})`,
    ...missing.map(s => `- [ ] ${s} → อ่านหน้า official → เพิ่ม family เข้า standards_registry.json ก่อน`), '',
    missing.length ? '> ร่างด้านล่างอ้างเฉพาะกลุ่ม ✅ — ความเสี่ยงที่ต้องพึ่งกลุ่ม 🚫 ถูกทำเป็น placeholder รอปิด checklist' : '> ทุกตัวมีทะเบียนแล้ว — ร่างอ้างครบ'
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'READING_MANIFEST.md'), manifestMd);

  // ── เฟส 2: DRAFT (อ้างเฉพาะที่มีทะเบียน) ──
  const draft = await callClaude(
    `คุณเป็นผู้เชี่ยวชาญตรวจสอบภายในองค์กรด้านไฟฟ้าไทย ปฏิบัติตามโปรโตคอลนี้อย่างเคร่งครัด:\n${skill}\n\nกติกาเหล็ก:\n1. อ้างอิงได้เฉพาะมาตรฐานในรายการ "มีทะเบียนแล้ว" เท่านั้น — ห้ามอ้างชื่ออื่นเด็ดขาด (CI จะ block)\n2. ทุก procedure ใส่ derivation: "PROFESSIONAL_SYNTHESIS" (คุณไม่ได้อ่านแหล่งจริงในโหมดนี้)\n3. approval_status: "DRAFT", knowledge_layer: "L3", version: "0.1.0" — มนุษย์จะ verify ต่อ\n4. ภาษาไทยทั้งหมด ตอบเป็น JSON object เดียว ไม่มีข้อความอื่น\n5. จำนวนจุดควบคุมบกพร่อง (control_failures) ต่อความเสี่ยง = ตามเหตุผลเชิงวิชาชีพ ไม่ใช่โควตา — โดยธรรมชาติความเสี่ยงหนึ่งมักมีจุดที่การควบคุมล้มเหลวได้มากกว่าหนึ่งจุด (สอง สาม หรือมากกว่า) ให้ระบุครบเท่าที่มีจริง แต่ห้ามยัดเพิ่มเพื่อให้ครบจำนวน — หนึ่งข้อก็ถูกต้องถ้าความจริงมีเท่านั้น\n6. วิธีการตรวจและหลักฐานต้องล้อรายจุดควบคุมบกพร่องของมันเอง — ห้ามใช้ชุดเดียวหว่านทุก CF`,
    `หัวข้อ: "${TOPIC_INPUT}"\n\nมาตรฐานที่มีทะเบียนแล้ว (อ้างได้เฉพาะนี้):\n${inRegistry.join('\n')}\n\nสร้าง draft topic JSON: {name_th,name_en,category,category_th,priority,org_applicability,applicable_standards,thailand_applicable,thai_law_refs,risks:[{id,name_th,name_en,level,likelihood,impact,control_failures:[{id,name_th,audit_procedures:[{id,name_th,method,std_refs:[{std,clause,title}],evidence_types(≥4),derivation}]}]}(≥5 risks)]}`,
    20000
  );
  let draftObj;
  try {
    if (draft.stop === 'max_tokens') throw new Error('คำตอบถูกตัดที่เพดาน max_tokens — ต้องเพิ่มเพดานหรือลดขนาดร่าง');
    draftObj = JSON.parse(jsonSlice(draft.text, '{', '}'));
  }
  catch (e) {
    fs.writeFileSync(path.join(OUT_DIR, 'draft_raw.txt'), draft.text || '(ว่าง)');
    console.error('draft ไม่ใช่ JSON (' + e.message + ') ' + diag(draft) + ' head:', (draft.text || '(ว่าง)').slice(0, 300));
    process.exit(1);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'draft_topic.json'), JSON.stringify(draftObj, null, 2));

  console.log(`✅ manifest: มีทะเบียน ${inRegistry.length} / ขาด ${missing.length} | draft: ${(draftObj.risks || []).length} risks → ${OUT_DIR}`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
