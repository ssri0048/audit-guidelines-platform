#!/usr/bin/env node
/**
 * sim_end_to_end.js — จำลองการใช้งานจริงตั้งแต่ "ผู้ดูแลพิมพ์ชื่อหัวข้อ" จนถึง "ขึ้นเว็บ"
 *
 * ทำงานบนสำเนาข้อมูล (temp) เท่านั้น — ไม่แตะ data/ ของจริงแม้แต่ไฟล์เดียว
 * ไม่ต่อเน็ต ไม่ใช้โทเคน: ส่วนที่เป็น LLM ถูก inject ด้วย mock ผ่าน fetchFn ที่โค้ดจริงรองรับอยู่แล้ว
 *
 * จำลอง 4 สถานการณ์ที่ต้องเจอจริง:
 *   A) หัวข้อสะอาด                → ใบงาน 1 ใบ · กลุ่ม "ถึงคิวคุณตัดสินใจ" · กดอนุมัติได้
 *   B) อ้างฉบับที่ถูกยกเลิก        → ระบบแก้ให้เองเป็นฉบับปัจจุบัน แล้วผ่าน (auto-heal)
 *   C) อ้างปีอนาคตที่ไม่มีจริง     → ตกเกต · ใบงาน 1 ใบ ติดป้าย "ต้องแก้ก่อน" · งานไม่หาย
 *   D) อ้างของที่ไม่มีในทะเบียน   → ratchet หยุดไว้ · ไม่เขียนอะไรลงคลัง · เก็บร่างไว้ตรวจต่อ
 *
 * ทุกสถานการณ์ต้องได้ "ใบงานใบเดียว" เสมอ — ไม่ซ้ำ ไม่หาย
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { main: research } = require('./research_draft.js');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('     ✔ ' + m); } else { fail++; console.log('     ✘ ' + m); } };
const step = m => console.log('\n  ▸ ' + m);

// ── mock คำตอบ LLM (โครงเดียวกับ API จริง: มี thinking block เสมอ) ──
const resp = text => ({ ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text }] }) });

function mockLLM(stds) {
  const cf = JSON.stringify({ control_failures: [1, 2].map(i => ({
    id: 'CF' + i, name_th: 'จุดควบคุมบกพร่องที่ ' + i,
    audit_procedures: [{
      id: 'AP' + i, name_th: 'ขั้นตอนการตรวจสอบที่ ' + i, method: 'Document Review',
      std_refs: [{ std: stds[0], clause: '-', title: '-' }],
      evidence_types: ['รายงาน', 'บันทึกการประชุม', 'ทะเบียนคุม', 'ผลทดสอบ'],
      derivation: 'PROFESSIONAL_SYNTHESIS'
    }]
  })) });
  const skeleton = JSON.stringify({
    name_th: 'การบริหารความต่อเนื่องทางธุรกิจของระบบไฟฟ้า', name_en: 'Power System Business Continuity',
    category: 'Operations', category_th: 'ปฏิบัติการ', priority: 'HIGH', org_applicability: ['UNIVERSAL'],
    applicable_standards: stds, thailand_applicable: true, thai_law_refs: [],
    risks: [1, 2, 3, 4, 5, 6].map(i => ({ id: 'R00' + i, name_th: 'ความเสี่ยงด้านความต่อเนื่องที่ ' + i, name_en: 'Continuity risk ' + i, level: 'HIGH', likelihood: 'สูง', impact: 'สูง' }))
  });
  let seq = 0;
  return async () => {
    seq++;
    if (seq === 1) return resp('```json\n' + JSON.stringify(stds) + '\n```');
    if (seq === 2) return resp('```json\n' + skeleton + '\n```');
    return resp('```json\n' + cf + '\n```');
  };
}

// ── ประเมินเงื่อนไข if: จาก YAML จริง (ไม่ hardcode — อ่านจากไฟล์ที่ deploy จริง) ──
const YML = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'research-pipeline.yml'), 'utf8');
function ifOf(frag) {
  const L = YML.split('\n');
  for (let i = 0; i < L.length; i++) if (L[i].includes('- name:') && L[i].includes(frag))
    for (let j = i + 1; j < i + 8; j++) { const m = (L[j] || '').match(/^\s+if:\s*(.+)$/); if (m) return m[1].trim(); }
  return null;
}
function evalIf(expr, code, has, chain) {
  const js = expr.replace(/steps\.chainverify\.outputs\.code/g, 'CODE')
    .replace(/steps\.run\.outputs\.has_draft/g, 'HAS').replace(/inputs\.chain/g, 'CHAIN')
    .replace(/!=(?!=)/g, '!==').replace(/([^!=<>])==(?!=)/g, '$1===');
  return Function('CODE', 'HAS', 'CHAIN', 'return (' + js + ')')(code, has, chain);
}

async function scenario(label, stds, expect) {
  console.log('\n' + '═'.repeat(66));
  console.log('สถานการณ์ ' + label);
  console.log('═'.repeat(66));

  // ── 0) เตรียมสำเนาข้อมูล (ไม่แตะของจริง) ──
  const simRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-'));
  fs.cpSync(path.join(ROOT, 'data'), path.join(simRoot, 'data'), { recursive: true });
  // ต้องคัด scripts/ ไปด้วย — verify_draft เรียกเกตที่ <root>/scripts/validate.js
  // (ตอนแรกผมลืมจุดนี้ ทำให้เกตรันไม่ได้แล้วรายงานว่า "ตกเกต" ซึ่งทำให้อ่านผลผิด)
  fs.cpSync(path.join(ROOT, 'scripts'), path.join(simRoot, 'scripts'), { recursive: true });
  const before = JSON.parse(fs.readFileSync(path.join(simRoot, 'data', 'knowledge_store.json'), 'utf8'));

  step('ผู้ดูแลพิมพ์ชื่อหัวข้อแล้วกด "เริ่มจัดทำ" (ติ๊ก chain)');
  console.log('     หัวข้อ: "การบริหารความต่อเนื่องทางธุรกิจของระบบไฟฟ้า"');
  console.log('     มาตรฐานที่ระบบจะอ้าง: ' + stds.join(' · '));

  // ── 1) ค้นคว้า → ร่าง ──
  step('ระบบค้นคว้าและสร้างร่าง (research_draft.js)');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'out-'));
  const draft = await research('การบริหารความต่อเนื่องทางธุรกิจของระบบไฟฟ้า', outDir, 'mock-key', mockLLM(stds));
  const draftPath = path.join(outDir, 'draft_topic.json');
  ok(fs.existsSync(draftPath), 'ได้ไฟล์ร่างออกมา');
  ok((draft.risks || []).length >= 5, 'ร่างมีความเสี่ยง ' + (draft.risks || []).length + ' รายการ (เกณฑ์ ≥5)');
  const hasDraft = fs.existsSync(draftPath) ? 'true' : 'false';

  // ── 2) ตรวจพิสูจน์ + เกต (chain mode) ──
  step('ระบบเปิดอ่านลิงก์อ้างอิงและตรวจ 9 ด่าน (verify_draft.js — chain mode)');
  let code = 0, verifyOut = '';
  try {
    verifyOut = execFileSync('node', ['-e',
      `require(${JSON.stringify(path.join(__dirname, 'verify_draft.js'))}).main(${JSON.stringify(draftPath)}, ${JSON.stringify(simRoot)})`],
      { encoding: 'utf8', env: { ...process.env, VERIFY_SUMMARY_OUT: path.join(simRoot, 'summary.md') }, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { code = e.status; verifyOut = (e.stdout || '') + (e.stderr || ''); }
  console.log('     exit code = ' + code + (code === 0 ? ' (ผ่านหมด)' : code === 1 ? ' (ตกเกต — งานยังใช้ได้)' : ' (escalate — งานใช้ไม่ได้)'));
  ok(code === expect.code, 'exit code ตรงกับที่ควรเป็น (' + expect.code + ')');

  // ── 3) งานที่ทำไปแล้วหายไหม ──
  step('ตรวจว่างานที่ทำไปแล้วยังอยู่ครบ');
  const after = JSON.parse(fs.readFileSync(path.join(simRoot, 'data', 'knowledge_store.json'), 'utf8'));
  const added = after.topics.filter(t => !before.topics.some(b => b.id === t.id));
  if (expect.code === 2) {
    // escalate = ผลงานใช้เป็นความรู้ไม่ได้ → ต้องไม่เขียนอะไรลงคลังเลย (กันความรู้ครึ่งๆ กลางๆ)
    ok(added.length === 0, 'ไม่เขียนอะไรลงคลังเลย — ไม่มีความรู้ครึ่งๆ กลางๆ ค้างไว้');
    ok(fs.existsSync(draftPath), 'ไฟล์ร่างยังอยู่ ไม่ถูกลบทิ้ง — เอาไปตรวจต่อได้');
  } else {
    ok(added.length === 1, 'มีหัวข้อใหม่ถูกเขียนลงคลัง 1 หัวข้อ (' + (added[0] ? added[0].id : '—') + ')');
    if (added[0]) {
      ok((added[0].risks || []).length >= 5, 'ความเสี่ยงครบ ' + added[0].risks.length + ' รายการ');
      ok((added[0].source_chain || []).length >= 2, 'มีแหล่งอ้างอิง ' + (added[0].source_chain || []).length + ' แหล่ง');
      ok((added[0].source_chain || []).every(s => s.excerpt), 'ทุกแหล่งมีข้อความที่อ่านได้จริงแนบมา (excerpt)');
      if (expect.healedTo) {
        const healed = (added[0].applicable_standards || []).some(s => s.includes(expect.healedTo));
        ok(healed, 'ระบบแก้การอ้างอิงให้เป็น ' + expect.healedTo + ' เองอัตโนมัติ');
        ok(!(added[0].applicable_standards || []).some(s => s.includes(expect.healedFrom)),
           'ไม่เหลือการอ้างฉบับที่ถูกยกเลิก (' + expect.healedFrom + ') แล้ว');
      }
    }
  }
  const sum = fs.existsSync(path.join(simRoot, 'summary.md')) ? fs.readFileSync(path.join(simRoot, 'summary.md'), 'utf8') : '';
  if (expect.code !== 2) ok(sum.length > 0, 'มีรายงานสรุปให้คนอ่าน');
  if (code === 1) {
    ok(/โปรดตรวจสอบก่อนยืนยัน/.test(sum), 'รายงานใช้ถ้อยคำที่ไม่กล่าวหา ("โปรดตรวจสอบก่อนยืนยัน")');
    ok(/G4_HALLUCINATION|G5_|G\d/.test(sum), 'รายงานบอกชัดว่าติดด่านไหน');
  }

  // ── 4) workflow จะเปิดใบงานกี่ใบ ──
  step('workflow ตัดสินใจเปิดใบงาน (อ่านเงื่อนไข if: จาก YAML จริง)');
  const t = evalIf(ifOf('Open ticket'), String(code), hasDraft, true) && hasDraft === 'true';
  const d = evalIf(ifOf('Open draft PR'), String(code), hasDraft, true);
  const route = t && d ? 'ซ้ำ 2 ใบ ✗' : t ? 'ใบงานตรวจแล้ว (ticket)' : d ? 'ใบร่าง (draft)' : 'ไม่เปิดเลย';
  console.log('     → ' + route);
  ok(!(t && d), 'ไม่เกิดใบงานซ้ำ');
  ok(t || d, 'มีใบงานเปิดแน่นอน — งานไม่หายเงียบ');
  ok(route === expect.route, 'เปิดใบงานถูกช่องทาง (' + expect.route + ')');

  // ── 5) เกตคุณภาพชี้ขาด merge ──
  step('เกตคุณภาพบน PR (validate.js) — ตัวชี้ขาดว่าปุ่มอนุมัติจะปลดล็อกไหม');
  let gate = 0, gateOut = '';
  try { gateOut = execFileSync('node', [path.join(__dirname, 'validate.js'), path.join(simRoot, 'data', 'knowledge_store.json')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { gate = e.status; gateOut = (e.stdout || '') + (e.stderr || ''); }
  const ci = gate === 0 ? '✅' : '❌';
  console.log('     เกต = ' + ci + (gate ? '  เหตุ: ' + (gateOut.split('── ERRORS')[1] || '').split('\n')[1].trim().slice(0, 90) : ''));
  ok(ci === expect.ci, 'สถานะเกตตรงกับที่ควรเป็น (' + expect.ci + ')');

  // ── 6) หน้าคิวงานจะแสดงยังไง ──
  step('หน้าคิวงานของผู้ดูแลจะแสดงงานนี้ในกลุ่มไหน');
  const pr = { number: 101, title: (code === 1 ? '🔴 ต้องแก้ก่อน — ' : '') + 'ตรวจแล้ว: การบริหารความต่อเนื่องทางธุรกิจของระบบไฟฟ้า', _ci: ci };
  const isDraftPr = route === 'ใบร่าง (draft)';
  if (isDraftPr) pr.title = '🤖 ร่างรอตรวจ: ' + pr.title;
  const group = pr._ci === '✅' ? 'ถึงคิวคุณตัดสินใจ' : pr._ci === '❌' ? 'ต้องแก้ก่อนถึงจะอนุมัติได้' : 'ระบบกำลังทำให้';
  const btn = group.startsWith('ต้องแก้') ? 'ดูว่าติดตรงไหน'
            : group === 'ระบบกำลังทำให้' ? 'ดูว่าทำถึงขั้นไหน'
            : isDraftPr ? 'รับร่างเข้าคลังพัก' : 'อ่านสรุป แล้วอนุมัติขึ้นเว็บ';
  console.log('     กลุ่ม: "' + group + '"   ปุ่ม: "' + btn + '"');
  ok(group === expect.group, 'จัดกลุ่มถูกต้อง');
  ok(btn === expect.btn, 'ปุ่มใช้คำที่ตรงกับผลลัพธ์จริง ("' + expect.btn + '")');

  // ── 7) ปุ่มอนุมัติปลดล็อกไหม (ตรรกะเดียวกับ apCheck) ──
  step('เงื่อนไขปลดล็อกปุ่มอนุมัติ (ตรรกะเดียวกับ apCheck ในหน้าเว็บ)');
  const boxes = 3, checked = 3, key = 'x'.repeat(20);
  const ready = boxes > 0 && checked === boxes && key.length > 10 && pr._ci === '✅';
  console.log('     ติ๊กครบ ' + checked + '/' + boxes + ' · มีรหัส · เกต ' + pr._ci + ' → ปุ่ม' + (ready ? 'ปลดล็อก ✅' : 'ยังล็อก 🔒'));
  ok(ready === expect.canApprove, 'สถานะปุ่มอนุมัติถูกต้อง');

  fs.rmSync(simRoot, { recursive: true, force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
}

(async () => {
  console.log('╔' + '═'.repeat(64) + '╗');
  console.log('║  จำลองการใช้งานจริง — ผู้ดูแลสั่งหาหัวข้อใหม่ จนถึงพร้อมขึ้นเว็บ      ║');
  console.log('╚' + '═'.repeat(64) + '╝');
  console.log('ทำงานบนสำเนาข้อมูลชั่วคราว — data/ ของจริงไม่ถูกแตะ');

  await scenario('A · หัวข้อสะอาด — อ้างมาตรฐานฉบับปัจจุบันทั้งหมด',
    ['IIA GIAS 2024', 'ISO 19011:2026', 'NIST Cybersecurity Framework 2.0'],
    { code: 0, route: 'ใบงานตรวจแล้ว (ticket)', ci: '✅', group: 'ถึงคิวคุณตัดสินใจ', canApprove: true, btn: 'อ่านสรุป แล้วอนุมัติขึ้นเว็บ' });

  await scenario('B · อ้างฉบับที่ถูกยกเลิก (ISO 14001:2015) — ระบบต้องแก้ให้เอง',
    ['IIA GIAS 2024', 'ISO 19011:2026', 'ISO 14001:2015'],
    { code: 0, route: 'ใบงานตรวจแล้ว (ticket)', ci: '✅', group: 'ถึงคิวคุณตัดสินใจ', canApprove: true,
      healedFrom: '14001:2015', healedTo: '14001:2026', btn: 'อ่านสรุป แล้วอนุมัติขึ้นเว็บ' });

  await scenario('C · อ้างปีอนาคตที่ไม่มีจริง (ISO 9001:2099) — ต้องตกเกต',
    ['IIA GIAS 2024', 'ISO 9001:2099'],
    { code: 1, route: 'ใบงานตรวจแล้ว (ticket)', ci: '❌', group: 'ต้องแก้ก่อนถึงจะอนุมัติได้', canApprove: false, btn: 'ดูว่าติดตรงไหน' });

  await scenario('D · อ้างมาตรฐานที่ไม่มีในทะเบียน — ratchet ต้องหยุดไว้',
    ['IIA GIAS 2024', 'มาตรฐานสมมติที่ไม่มีจริง XYZ-999'],
    { code: 2, route: 'ใบร่าง (draft)', ci: '✅', group: 'ถึงคิวคุณตัดสินใจ', canApprove: true, btn: 'รับร่างเข้าคลังพัก' });

  console.log('\n' + '═'.repeat(66));
  console.log(fail ? `❌ ผล: ผ่าน ${pass} / ตก ${fail}` : `✅ ผล: ผ่านทั้งหมด ${pass} ข้อ`);
  process.exit(fail ? 1 : 0);
})();
