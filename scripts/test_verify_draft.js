#!/usr/bin/env node
/** test_verify_draft.js — mock test ของ auto-verify บนสำเนา repo จริง (ไม่แตะไฟล์จริง ไม่ใช้ API) */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { canonicalize, main } = require('./verify_draft.js');

let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + n); };

// สำเนา data + scripts ไป tmp (validate.js หา registry จาก dir ของ store)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vtest-'));
fs.mkdirSync(path.join(root, 'data', 'drafts'), { recursive: true });
fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
const REAL = path.join(__dirname, '..');
for (const f of fs.readdirSync(path.join(REAL, 'data'))) {
  const p = path.join(REAL, 'data', f);
  if (fs.statSync(p).isFile()) fs.copyFileSync(p, path.join(root, 'data', f));
}
fs.copyFileSync(path.join(REAL, 'scripts', 'validate.js'), path.join(root, 'scripts', 'validate.js'));
fs.copyFileSync(path.join(REAL, 'scripts', 'readproof.js'), path.join(root, 'scripts', 'readproof.js')); // validate.js require ตัวนี้ (เกต G3_URL_STRUCT)
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'standards_registry.json'), 'utf8'));
process.env.VERIFY_SUMMARY_OUT = path.join(root, 'verify_summary.md'); // ไม่ใช้ /tmp ตายตัว (เทสต์ใน sandbox ได้)

console.log('── ชุด 1: canonicalize ──');
const c1 = canonicalize(registry, 'ISO/IEC 27001:2013 Information Security');
ok('เวอร์ชันถูกถอน → สลับเป็นฉบับแทนที่ (2013→2022)', c1.str.includes('2022') && c1.fixes.length >= 1);
const c2 = canonicalize(registry, 'มาตรฐานสมมุติที่ไม่มีจริง XYZ-777');
ok('ไม่มีทะเบียน → ธง unregistered (ratchet)', c2.unregistered === true);
const c3 = canonicalize(registry, 'ISO 22301:2019');
ok('AMENDED → พ่วงฉบับแก้ไข (Amd 1:2024)', c3.str.includes('Amd 1:2024'));
const c4 = canonicalize(registry, 'IIA International Standards 2017');
ok('auto-heal: IIA 2017 (ไม่รู้จัก) → ฉบับปัจจุบัน 2024 + แจ้ง fix', c4.str.includes('2024') && c4.fixes.some(f => f.includes('ปัจจุบัน')));
const c5 = canonicalize(registry, 'NIST Cybersecurity Framework 2018');
ok('auto-heal: NIST 2018 → 2.0', c5.str.includes('2.0') && c5.fixes.length >= 1);
const c6 = canonicalize(registry, 'IEEE 2030 Smart Grid');
ok('ไม่แตะเลขมาตรฐาน/ปีอนาคต (IEEE 2030 คงเดิม)', c6.str.includes('2030') && !c6.fixes.some(f => f.includes('ปัจจุบัน')));
const { famFor } = require('./verify_draft.js');
ok('regression: "IIA International Standards 2017" → iia-gias (ไม่ทับ iippf เก่า)', famFor(registry, 'IIA International Standards 2017').family_id === 'iia-gias');
const c7 = canonicalize(registry, 'พระราชบัญญัติว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์ พ.ศ. 2560 และที่แก้ไขเพิ่มเติม (ฉบับที่ 2) พ.ศ. 2560');
ok('auto-heal ไทย: ปีฐาน 2560→2550 (คงฉบับแก้ไข 2560 ในหาง)', c7.str.includes('พ.ศ. 2550') && c7.str.includes('(ฉบับที่ 2)') && c7.fixes.some(f => f.includes('2550')));
const pinReg = { families: [{ family_id: 'x-pin', display: 'มาตรฐาน X (ตรึง)', match: 'มาตรฐาน X', editions: [{ version: '2013', status: 'PINNED_BY_THAI_LAW', superseded_by: '2022' }, { version: '2022', status: 'CURRENT' }] }] };
const cp = canonicalize(pinReg, 'มาตรฐาน X 2013');
ok('PINNED กฎหมายไทย: คงฉบับ 2013 ไม่อัปเดตเป็น 2022 + แจ้งเหตุ', cp.str.includes('2013') && !cp.str.includes('2022') && cp.fixes.some(f => f.includes('กฎหมายไทย')));

console.log('── ชุด 2: main ครบวงจรบนสำเนา repo (จบด้วย validate.js จริง) ──');
const draft = {
  name_th: 'หัวข้อทดสอบ auto-verify', name_en: 'Auto Verify Test', category: 'Operations', category_th: 'ปฏิบัติการ', priority: 'HIGH',
  applicable_standards: ['IIA GIAS 2024', 'COBIT 2019', 'ISO/IEC 27001:2013 Information Security', 'พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)'],
  thai_law_refs: ['พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)'],
  risks: [1, 2, 3, 4, 5].map(i => ({
    id: 'R00' + i, name_th: 'ความเสี่ยงทดสอบ ' + i, name_en: 'Risk ' + i, level: 'HIGH', likelihood: 'สูง', impact: 'สูง',
    control_failures: [{ id: 'CF' + i, name_th: 'จุดบกพร่อง ' + i, audit_procedures: [{ id: 'AP' + i, name_th: 'ตรวจ ' + i, method: 'Document Review', std_refs: [{ std: 'IIA GIAS 2024', clause: '-', title: '-' }], evidence_types: ['ก', 'ข', 'ค'], derivation: 'PROFESSIONAL_SYNTHESIS' }] }]
  }))
};
fs.writeFileSync(path.join(root, 'data', 'drafts', 'draft_test.json'), JSON.stringify(draft));
const before = JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge_store.json'), 'utf8')).topics.length;
const res = main('draft_test.json', root);
const after = JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge_store.json'), 'utf8'));
ok('topic ใหม่เข้า store (' + res.tid + ')', after.topics.length === before + 1);
const t = after.topics.find(x => x.id === res.tid);
ok('27001:2013 ถูกแก้เป็น 2022 ใน store จริง', t.applicable_standards.some(s => s.includes('27001:2022')));
ok('source_chain ≥2 จากทะเบียนที่อ่านแล้ว', t.source_chain.length >= 2 && t.source_chain.every(s => s.excerpt && s.url));
ok('evidence ถูกเติมครบ ≥4', t.risks.every(r => r.control_failures.every(cf => cf.audit_procedures.every(ap => ap.evidence_types.length >= 4))));
ok('draft ถูกลบหลังประกอบ', !fs.existsSync(path.join(root, 'data', 'drafts', 'draft_test.json')));
ok('changelog บันทึกการแก้', t.changelog.some(c => c.change.includes('AUTO-VERIFY')));

console.log('── ชุด 2.5: โหมด chain — draft เป็น path เต็ม (ไม่ผ่านคลังพัก) ──');
const absDraft = path.join(os.tmpdir(), 'chain_draft_' + Date.now() + '.json');
const d2 = JSON.parse(JSON.stringify(draft)); d2.name_th = 'หัวข้อทดสอบโหมด chain';
fs.writeFileSync(absDraft, JSON.stringify(d2));
const before2 = JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge_store.json'), 'utf8')).topics.length;
const res2 = main(absDraft, root);
const after2 = JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge_store.json'), 'utf8'));
ok('chain: topic เข้า store (' + res2.tid + ')', after2.topics.length === before2 + 1);
ok('chain: ไฟล์ draft path เต็มถูกลบ', !fs.existsSync(absDraft));
ok('chain: changelog ระบุโหมดตรวจต่อทันที', after2.topics.find(x => x.id === res2.tid).changelog[0].change.includes('โหมดตรวจต่อทันที'));

console.log('── ชุด 2.6: หัวข้ออ้างฉบับล้าสมัย (IIA 2017/NIST 2018) → ระบบแก้เอง + ผ่านเกต ──');
const od = JSON.parse(JSON.stringify(draft));
od.name_th = 'หัวข้ออ้างฉบับเก่า auto-heal';
od.applicable_standards = ['IIA International Standards 2017', 'NIST Cybersecurity Framework 2018', 'ISO/IEC 27001:2013 Information Security', 'พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)'];
od.thai_law_refs = ['พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)'];
fs.writeFileSync(path.join(root, 'data', 'drafts', 'draft_old.json'), JSON.stringify(od));
const resO = main('draft_old.json', root);
const tO = JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge_store.json'), 'utf8')).topics.find(x => x.id === resO.tid);
ok('auto-heal: IIA 2017 → 2024 ใน store จริง', tO.applicable_standards.some(s => s.includes('IIA') && s.includes('2024')));
ok('auto-heal: NIST 2018 → 2.0 ใน store จริง', tO.applicable_standards.some(s => s.includes('NIST') && s.includes('2.0')));
ok('changelog ระบุการแก้ฉบับล้าสมัยอัตโนมัติ', tO.changelog.some(c => c.change.includes('ปัจจุบัน')));
ok('ผ่านเกตได้ (ไม่ตก G5 อีก — main return ไม่ exit)', !!resO.tid);

console.log('── ชุด 3: escalate เมื่ออ้างสิ่งไม่มีทะเบียน (ratchet) ──');
const bad = JSON.parse(JSON.stringify(draft)); bad.applicable_standards.push('มาตรฐานปลอม ABC-999');
fs.writeFileSync(path.join(root, 'data', 'drafts', 'draft_bad.json'), JSON.stringify(bad));
try { require('child_process').execFileSync('node', [path.join(REAL, 'scripts', 'verify_draft.js'), 'draft_bad.json', root], { stdio: 'pipe' }); ok('escalate (ควร exit 2)', false); }
catch (e) { ok('escalate exit 2 พร้อมเหตุผล', e.status === 2 && String(e.stderr).includes('ESCALATE')); }

console.log('── ชุด 4: หัวข้อที่ 2 ตกเกต — ต้องลงจอดนุ่ม (ไฟล์ไม่หาย + error จริง + report) ──');
const gd = JSON.parse(JSON.stringify(draft));
gd.name_th = 'หัวข้อตกเกต schema (จำลอง LLM ผิด)';
delete gd.risks[0].control_failures[0].name_th; // → G1_SCHEMA hard error (เกตจับได้)
fs.writeFileSync(path.join(root, 'data', 'drafts', 'draft_gatefail.json'), JSON.stringify(gd));
const reportPath = path.join(root, 'gate_report.md');
try {
  require('child_process').execFileSync('node', [path.join(REAL, 'scripts', 'verify_draft.js'), 'draft_gatefail.json', root],
    { stdio: 'pipe', env: Object.assign({}, process.env, { VERIFY_SUMMARY_OUT: reportPath }) });
  ok('ควรตกเกต (exit 1)', false);
} catch (e) {
  const err = String(e.stderr || '');
  ok('ตกเกต exit 1 (ไม่ใช่ crash อื่น)', e.status === 1);
  ok('stderr โชว์เกตที่ fail จริง [G...] (ไม่ใช่หาง queue)', /\[G[0-9A-Za-z_]+\]/.test(err));
  ok('draft ไม่ถูกลบ → fallback เปิด draft PR ได้ (งานไม่สูญ)', fs.existsSync(path.join(root, 'data', 'drafts', 'draft_gatefail.json')));
  const rep = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '';
  ok('report ใช้ถ้อยคำ "โปรดตรวจสอบ" (รอบคอบ ไม่ใช่หัวเรื่อง "ตกเกต")', rep.includes('โปรดตรวจสอบก่อนยืนยัน') && rep.includes('รายการที่ควรตรวจ') && !rep.includes('ตกเกตคุณภาพ'));
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ผล: ผ่าน ${pass} / ตก ${fail}`);
process.exit(fail === 0 ? 0 : 1);
