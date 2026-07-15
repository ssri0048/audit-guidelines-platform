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
const { jsonSlice, isFatalApiError, callSafe, parseArr, parseObj, main } = require('./research_draft.js');

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
// จำลอง error response แบบ API จริง (ok:false + status + body ให้ .text() อ่านได้)
function apiErr(status, body) { return { ok: false, status, text: async () => body }; }
const CREDIT_BODY = '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}';

(async () => {
  console.log('── ชุด 1: jsonSlice ทนคำตอบสกปรก ──');
  ok('fence+ครบ', JSON.parse(jsonSlice('```json\n["A","B"]\n```', '[', ']')).length === 2);
  ok('ข้อความแถมหน้าหลัง', JSON.parse(jsonSlice('นี่คือร่าง {"a":1} จบครับ', '{', '}')).a === 1);
  await throws('array โดนตัดกลาง', async () => jsonSlice('```json\n["A","B', '[', ']'), 'ไม่พบ');

  console.log('── ชุด 2: บันได retry 3 ขั้น (เคสจริง: 12000 ไม่พอ + thinking กินหมด) ──');
  let calls = 0, budgets = [], users = [];
  const mkFetch = plan => async (url, opts) => {
    const body = JSON.parse(opts.body); calls++; budgets.push(body.max_tokens); users.push(body.messages[0].content);
    const p = plan[Math.min(calls - 1, plan.length - 1)];
    return apiResp(p.text, p.stop);
  };
  calls = 0; budgets = [];
  const r1 = await callSafe('k', 's', 'u', 6000, mkFetch([{ text: '{"บาง', stop: 'max_tokens' }, { text: '{"a":1}', stop: 'end_turn' }]));
  ok('ขั้น 2 กระโดดเต็มเพดาน 20000 (ไม่ใช่ ×2=12000)', budgets[1] === 20000 && JSON.parse(jsonSlice(r1.text, '{', '}')).a === 1);
  calls = 0; budgets = []; users = [];
  const r2 = await callSafe('k', 's', 'u', 6000, mkFetch([{ text: '', stop: 'max_tokens' }, { text: '{"บาง', stop: 'max_tokens' }, { text: '{"b":2}', stop: 'end_turn' }]), 'สั้นสุด');
  ok('ขั้น 3 คงเพดาน + เติมคำสั่งกระชับใน prompt', budgets[2] === 20000 && users[2].includes('กระชับ') && users[2].includes('สั้นสุด') && JSON.parse(jsonSlice(r2.text, '{', '}')).b === 2);
  calls = 0;
  await throws('พังครบ 3 ขั้น → แจ้งชัด ไม่วนไม่รู้จบ', () => callSafe('k', 's', 'u', 6000, mkFetch([{ text: '{"บาง', stop: 'max_tokens' }])), 'ครบ 3 ขั้น');
  ok('เรียกพอดี 3 ครั้ง', calls === 3);

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
    risks: [1, 2, 3, 4, 5, 6].map(i => ({ id: 'R00' + i, name_th: 'เสี่ยง ' + i, name_en: 'Risk ' + i, level: 'HIGH', likelihood: 'สูง', impact: 'สูง' })) });
  let r3Fails = 0; const firstBudget = {};
  const mockFetch = async (url, opts) => {
    seq++;
    const mt = JSON.parse(opts.body).max_tokens;
    if (seq === 1) { firstBudget.manifest = mt; return apiResp('```json\n["IIA GIAS 2024","มาตรฐานที่ไม่มีในทะเบียนแน่ๆ XYZ-999"]\n```'); }
    if (seq === 2) { firstBudget.skeleton = mt; return apiResp('นี่คือโครง ' + skeleton); } // ข้อความแถม
    if (seq === 3) { firstBudget.cf = mt; return apiResp(cfBlock.slice(0, 40), 'max_tokens'); } // R001 โดนตัดครั้งแรก → บันได retry
    const u = JSON.parse(opts.body).messages[0].content;
    if (u.includes('เสี่ยง 3')) { r3Fails++; return apiResp('{"พัง', 'max_tokens'); } // R003 พังครบทุกขั้น → ต้องถูกตัดทิ้ง
    return apiResp(cfBlock);
  };
  const draft = await main('หัวข้อทดสอบ', outDir, 'mock-key', mockFetch);
  ok('manifest แยกมี/ขาดทะเบียนถูก', fs.readFileSync(path.join(outDir, 'READING_MANIFEST.md'), 'utf8').includes('XYZ-999'));
  ok('draft ไฟล์เกิดจริง', fs.existsSync(path.join(outDir, 'draft_topic.json')));
  ok('skeleton 6 risks → R003 พังครบ 3 ขั้นถูกตัด เหลือ 5 (≥ floor) งานจบ', draft.risks.length === 5 && r3Fails === 3 && !draft.risks.some(r => r.name_th === 'เสี่ยง 3'));
  ok('manifest บันทึกความเสี่ยงที่ถูกตัด', fs.readFileSync(path.join(outDir, 'READING_MANIFEST.md'), 'utf8').includes('ความเสี่ยงที่ถูกตัดออก'));
  ok('สถานะ L3/DRAFT/0.1.0 ถูกบังคับ', draft.knowledge_layer === 'L3' && draft.approval_status === 'DRAFT' && draft.version === '0.1.0');
  ok('เคสโดนตัดกลางทางถูก retry อัตโนมัติ (R001)', draft.risks[0].control_failures.length === 2);
  ok('ROOT-CAUSE FIX: เพดานตั้งต้นกว้างพอ (manifest≥8000, skeleton/CF≥16000) ไม่ใช่ 3000/6000 ที่ทำให้ thinking ตัดคำตอบ',
    firstBudget.manifest === 8000 && firstBudget.skeleton === 16000 && firstBudget.cf === 16000);

  console.log('── ชุด 5: fail-fast เมื่อเจอ error ร้ายแรง (เครดิตหมด/คีย์ผิด — เคสจริง run #8) ──');
  ok('classify: 400 เครดิตหมด = fatal', isFatalApiError(400, CREDIT_BODY) === true);
  ok('classify: 401 คีย์ผิด = fatal', isFatalApiError(401, '') === true);
  ok('classify: 403 หมดสิทธิ์ = fatal', isFatalApiError(403, 'forbidden') === true);
  ok('classify: 500/429 ไม่ใช่ fatal (ปล่อยให้ retry/drop ตามปกติ)', isFatalApiError(500, 'server error') === false && isFatalApiError(429, 'rate limit') === false);

  let s5 = 0;
  const outDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'rdtest2-'));
  const fetchCredit = async (url, opts) => {
    s5++;
    if (s5 === 1) return apiResp('["IIA GIAS 2024"]');                    // manifest ok
    if (s5 === 2) return apiResp('โครง ' + skeleton);                     // skeleton ok (6 risks)
    return apiErr(400, CREDIT_BODY);                                      // R001 CF: เครดิตหมด → ต้องหยุดทันที
  };
  await throws('เครดิตหมดที่ R001 → หยุดทั้ง run ทันที (ไม่ตัดทีละตัวจนเหลือ <5)',
    () => main('หัวข้อทดสอบ2', outDir2, 'mock-key', fetchCredit), 'หยุดทันที');
  ok('หยุดที่ call แรกที่พัง (ไม่ยิงซ้ำเปลืองเครดิตทุก risk)', s5 === 3);

  console.log(`\n${fail === 0 ? '✅' : '❌'} ผล: ผ่าน ${pass} / ตก ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
