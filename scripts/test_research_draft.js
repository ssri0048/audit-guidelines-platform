#!/usr/bin/env node
/**
 * test_research_draft.js — mock test ของ pipeline โดยไม่ใช้ API key จริง
 * จำลองพฤติกรรม API ที่ "เจอจริง" จาก run บน GitHub Actions:
 *   - คำตอบมี thinking block นำหน้า text เสมอ (blocks=[thinking,text])
 *   - call ใหญ่โดนตัด stop=max_tokens → ต้อง retry แล้วรอด
 *   - คำตอบห่อ ```json fence + มีข้อความแถมหน้า-หลัง
 * ผ่านทุกข้อ = logic ฝั่งเรา ชัวร์ ก่อนขึ้นระบบจริง
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { jsonSlice, callSafe, parseArr, parseObj, main } = require('./research_draft.js');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } }
async function throws(name, fn, msgPart) {
  try { await fn(); fail++; console.log('  ✗ FAIL (ควร throw):', name); }
  catch (e) { const hit = !msgPart || e.message.includes(msgPart); hit ? pass++ : fail++; console.log(hit ? '  ✓' : '  ✗ FAIL(ข้อความผิด: ' + e.message + '):', name); }
}
// สร้าง mock response แบบเดียวกับ API จริง (มี thinking block เสมอ — ตามที่เจอจริง)
function apiResp(text, stop) {
  return {
    ok: true,
    json: async () => ({ stop_reason: stop || 'end_turn', content: [{ type: 'thinking', thinking: 'คิดๆๆ' }, { type: 'text', text }] })
  };
}

(async () => {
  console.log('── ชุด 1: jsonSlice ทนคำตอบสกปรก ──');
  ok('fence+ครบ', JSON.parse(jsonSlice('```json\n["A","B"]\n```', '[', ']')).length === 2);
  ok('ข้อความแถมหน้าหลัง', JSON.parse(jsonSlice('นี่คือร่าง {"a":1} จบครับ', '{', '}')).a === 1);
  await throws('array โดนตัดกลาง', async () => jsonSlice('```json\n["A","B', '[', ']'), 'ไม่พบ');

  console.log('── ชุด 2: callSafe auto-retry เมื่อโดนตัด (เคสจริง run #3) ──');
  let calls = 0;
  const fetchTruncThenOk = async () => { calls++; return calls === 1 ? apiResp('{"บาง', 'max_tokens') : apiResp('{"a":1}', 'end_turn'); };
  const r1 = await callSafe('k', 's', 'u', 6000, fetchTruncThenOk);
  ok('retry แล้วได้คำตอบเต็ม', JSON.parse(jsonSlice(r1.text, '{', '}')).a === 1 && calls === 2);
  calls = 0;
  const fetchAlwaysTrunc = async () => { calls++; return apiResp('{"บาง', 'max_tokens'); };
  await throws('โดนตัดซ้ำหลัง retry → แจ้งชัด', () => callSafe('k', 's', 'u', 6000, fetchAlwaysTrunc), 'ยังโดนตัดหลัง retry');
  ok('retry แค่ 1 ครั้ง (ไม่วนไม่รู้จบ)', calls === 2);

  console.log('── ชุด 3: parse แจ้ง diagnostics ──');
  await throws('parseObj บอก stop/blocks/head', async () => parseObj({ text: 'ไม่มีเจสัน', stop: 'end_turn', types: 'thinking,text' }, 'ทดสอบ'), 'stop=end_turn');

  console.log('── ชุด 4: main ครบวงจร (mock ทุก call — thinking block ทุกคำตอบ) ──');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdtest-'));
  let seq = 0;
  const cfBlock = JSON.stringify({ control_failures: [
    { id: 'CF1', name_th: 'จุดบกพร่อง ก', audit_procedures: [{ id: 'AP1', name_th: 'ตรวจ ก', method: 'Document Review', std_refs: [{ std: 'IIA GIAS 2024', clause: '-', title: '-' }], evidence_types: ['ก', 'ข', 'ค', 'ง'], derivation: 'PROFESSIONAL_SYNTHESIS' }] },
    { id: 'CF2', name_th: 'จุดบกพร่อง ข', audit_procedures: [{ id: 'AP2', name_th: 'ตรวจ ข', method: 'Sampling', std_refs: [{ std: 'IIA GIAS 2024', clause: '-', title: '-' }], evidence_types: ['ก', 'ข', 'ค', 'ง'], derivation: 'PROFESSIONAL_SYNTHESIS' }] }
  ] });
  const skeleton = JSON.stringify({ name_th: 'ทดสอบ', name_en: 'Test', category: 'IT', category_th: 'ไอที', priority: 'HIGH',
    org_applicability: ['UNIVERSAL'], applicable_standards: ['IIA GIAS 2024'], thailand_applicable: true, thai_law_refs: ['กฎ ก'],
    risks: [1, 2, 3, 4, 5].map(i => ({ id: 'R00' + i, name_th: 'เสี่ยง ' + i, name_en: 'Risk ' + i, level: 'HIGH', likelihood: 'สูง', impact: 'สูง' })) });
  const mockFetch = async () => {
    seq++;
    if (seq === 1) return apiResp('```json\n["IIA GIAS 2024","มาตรฐานที่ไม่มีในทะเบียนแน่ๆ XYZ-999"]\n```');
    if (seq === 2) return apiResp('นี่คือโครง ' + skeleton);                 // ข้อความแถม
    if (seq === 3) return apiResp(cfBlock.slice(0, 40), 'max_tokens');       // R001 โดนตัดครั้งแรก → retry
    return apiResp(cfBlock);
  };
  const draft = await main('หัวข้อทดสอบ', outDir, 'mock-key', mockFetch);
  ok('manifest แยกมี/ขาดทะเบียนถูก', fs.readFileSync(path.join(outDir, 'READING_MANIFEST.md'), 'utf8').includes('XYZ-999'));
  ok('draft ไฟล์เกิดจริง', fs.existsSync(path.join(outDir, 'draft_topic.json')));
  ok('5 risks × 2 CF ประกอบครบ', draft.risks.length === 5 && draft.risks.every(r => r.control_failures.length === 2));
  ok('สถานะ L3/DRAFT/0.1.0 ถูกบังคับ', draft.knowledge_layer === 'L3' && draft.approval_status === 'DRAFT' && draft.version === '0.1.0');
  ok('เคสโดนตัดกลางทางถูก retry อัตโนมัติ (R001)', draft.risks[0].control_failures.length === 2);

  console.log(`\n${fail === 0 ? '✅' : '❌'} ผล: ผ่าน ${pass} / ตก ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
