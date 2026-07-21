#!/usr/bin/env node
/**
 * test_retire_topics.js — พิสูจน์ว่าการเอาหัวข้อออกจากเว็บ "ปลอดภัยกับรอยตรวจสอบ"
 *
 * ทำงานบนสำเนา repo ชั่วคราว — data/ ของจริงไม่ถูกแตะ
 *
 * ข้อที่ต้องเป็นจริง:
 *   1) เอาออกแล้วรหัสต้องไม่วนกลับมาใช้ซ้ำ (จุดอันตรายที่สุด)
 *   2) เว็บต้องไม่เห็น + เกตต้องไม่วิ่งบนหัวข้อที่เอาออก
 *   3) related_topics ที่ชี้มาต้องถูกตัดและบันทึกไว้
 *   4) ชื่อเดิมสั่งซ้ำได้ ไม่ชน G2_DEDUP
 *   5) ย้ายกลับได้ครบถ้วน
 *   6) กันสั่งพลาด: ไม่มีเหตุผล / เกินโควตา / รหัสไม่มีจริง ต้องหยุด
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✔ ' + m); } else { fail++; console.log('  ✘ ' + m); } };

function sandbox() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'retire-'));
  fs.cpSync(path.join(ROOT, 'data'), path.join(d, 'data'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'scripts'), path.join(d, 'scripts'), { recursive: true });
  // สคริปต์ย้อนไฟล์ด้วย git checkout เมื่อเกตไม่ผ่าน — sandbox ต้องเป็น repo ไม่งั้นทดสอบเส้นทางนั้นไม่ได้
  execFileSync('git', ['init', '-q'], { cwd: d });
  execFileSync('git', ['add', '-A'], { cwd: d });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base'], { cwd: d });
  return d;
}
const run = (d, args) => {
  try { return { code: 0, out: execFileSync('node', [path.join(d, 'scripts', 'retire_topics.js'), ...args], { encoding: 'utf8', cwd: d, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
};
const store = d => JSON.parse(fs.readFileSync(path.join(d, 'data', 'knowledge_store.json'), 'utf8'));
const archive = d => JSON.parse(fs.readFileSync(path.join(d, 'data', 'retired_topics.json'), 'utf8'));

console.log('── 1) เอาออกแล้วรหัสต้องไม่วนกลับ (จุดอันตรายที่สุด) ──');
{
  const d = sandbox();
  const before = store(d);
  const maxBefore = Math.max(...before.topics.map(t => +t.id.slice(1)));
  const top2 = before.topics.slice(-2).map(t => t.id);
  const r = run(d, [top2.join(','), '--reason', 'ทดสอบระบบ ไม่ใช่ความรู้จริง', '--by', 'ผู้ทดสอบ']);
  ok(r.code === 0, 'เอา 2 หัวข้อท้ายสุดออกสำเร็จ (' + top2.join(', ') + ')');
  const after = store(d);
  const maxAfter = Math.max(...after.topics.map(t => +t.id.slice(1)));
  ok(maxAfter < maxBefore, 'รหัสสูงสุดในคลังลดลงจริง (T' + maxBefore + ' → T' + maxAfter + ')');
  ok(after.metadata.last_topic_id === 'T' + String(maxBefore).padStart(3, '0'),
     'แต่เพดานรหัสยังจองไว้ที่ T' + maxBefore + ' — ไม่ถอยตาม');

  // จำลองการออกรหัสด้วยสูตรเดียวกับ verify_draft.js
  const src = fs.readFileSync(path.join(d, 'scripts', 'verify_draft.js'), 'utf8');
  ok(/const reserved = parseInt\(String\(\(store\.metadata \|\| \{\}\)\.last_topic_id/.test(src),
     'verify_draft อ่านเพดานรหัสจาก metadata');
  const inStore = after.topics.map(t => +String(t.id).slice(1) || 0);
  const reserved = parseInt(String(after.metadata.last_topic_id).replace(/\D/g, ''), 10) || 0;
  const nextId = 'T' + String(Math.max(0, ...inStore, reserved) + 1).padStart(3, '0');
  ok(nextId === 'T' + String(maxBefore + 1).padStart(3, '0'),
     'หัวข้อถัดไปจะได้ ' + nextId + ' — ไม่ใช่ ' + top2[0] + ' ที่เพิ่งเอาออก');
  ok(!top2.includes(nextId), 'รหัสที่เอาออกไม่ถูกนำกลับมาใช้ซ้ำ');
}

console.log('\n── 2) เว็บไม่เห็น + เกตไม่วิ่งบนหัวข้อที่เอาออก ──');
{
  const d = sandbox();
  const target = store(d).topics.slice(-1)[0].id;
  run(d, [target, '--reason', 'ทดสอบระบบ ไม่ใช่ความรู้จริง']);
  const after = store(d);
  ok(!after.topics.some(t => t.id === target), target + ' ไม่อยู่ใน knowledge_store แล้ว (เว็บอ่านไฟล์นี้ไฟล์เดียว)');
  ok(archive(d).retired.some(r => r.topic_id === target), 'ย้ายไปอยู่ใน retired_topics.json ครบ');
  const rec = archive(d).retired.find(r => r.topic_id === target);
  ok(!!rec.reason && !!rec.retired_at, 'บันทึกเหตุผลและวันที่ไว้ — ตรวจย้อนได้');
  ok(JSON.stringify(rec.topic).length > 500, 'เก็บเนื้อหาหัวข้อไว้ทั้งก้อน ไม่ได้เก็บแค่ชื่อ');
  let gate = 0;
  try { execFileSync('node', [path.join(d, 'scripts', 'validate.js'), path.join(d, 'data', 'knowledge_store.json')], { stdio: 'pipe' }); }
  catch (e) { gate = e.status; }
  ok(gate === 0, 'เกตคุณภาพยังผ่านหลังเอาหัวข้อออก');
}

console.log('\n── 3) related_topics ที่ชี้มาต้องถูกตัดและบันทึก ──');
{
  const d = sandbox();
  const s0 = store(d);
  // หาหัวข้อที่มีคนอ้างถึงจริง
  const referenced = s0.topics.find(t => s0.topics.some(o => o.id !== t.id && (o.related_topics || []).includes(t.id)));
  const referrers = s0.topics.filter(o => (o.related_topics || []).includes(referenced.id)).map(o => o.id);
  console.log('     ' + referenced.id + ' ถูกอ้างโดย ' + referrers.join(', '));
  const r = run(d, [referenced.id, '--reason', 'ทดสอบการตัดการอ้างถึง ไม่ใช่ความรู้จริง']);
  ok(r.code === 0, 'เอาออกสำเร็จ');
  const s1 = store(d);
  const stillPointing = s1.topics.filter(t => (t.related_topics || []).includes(referenced.id));
  ok(stillPointing.length === 0, 'ไม่เหลือหัวข้อไหนชี้ไปหา ' + referenced.id + ' อีก');
  const first = s1.topics.find(t => t.id === referrers[0]);
  const lastLog = (first.changelog || []).slice(-1)[0];
  ok(/ตัดการอ้างถึงหัวข้อที่ถูกเอาออก/.test(lastLog.change || ''), 'บันทึกใน changelog ของหัวข้อที่ถูกแก้');
  ok((lastLog.change || '').includes(referenced.id), 'บันทึกระบุรหัสที่ถูกตัดออกชัดเจน');
  ok(first.hash_signature === s0.topics.find(t => t.id === referrers[0]).hash_signature,
     'hash ไม่เปลี่ยน (related_topics ไม่อยู่ในสูตร hash) — ไม่ไปตกเกต P_HASH');
  ok(r.out.includes('ตัดการอ้างถึงใน'), 'รายงานผลบอกผู้ใช้ว่าไปแก้หัวข้ออื่นด้วย');
}

console.log('\n── 4) ชื่อเดิมสั่งซ้ำได้ ไม่ชน G2_DEDUP ──');
{
  const d = sandbox();
  const t = store(d).topics.slice(-1)[0];
  run(d, [t.id, '--reason', 'ทดสอบระบบ ไม่ใช่ความรู้จริง']);
  const s1 = store(d);
  ok(!s1.topics.some(x => (x.name_th || '').trim() === (t.name_th || '').trim()),
     'ชื่อ "' + (t.name_th || '').slice(0, 28) + '" ว่างแล้ว — สั่งชื่อเดิมใหม่ได้ ไม่ชนชื่อซ้ำ');
}

console.log('\n── 5) ย้ายกลับได้ครบถ้วน ──');
{
  const d = sandbox();
  const t = store(d).topics.slice(-1)[0];
  const n0 = store(d).topics.length;
  run(d, [t.id, '--reason', 'ทดสอบระบบ ไม่ใช่ความรู้จริง']);
  const r = run(d, ['--restore', t.id]);
  ok(r.code === 0, 'สั่ง --restore สำเร็จ');
  const s2 = store(d);
  ok(s2.topics.length === n0, 'จำนวนหัวข้อกลับมาเท่าเดิม (' + n0 + ')');
  const back = s2.topics.find(x => x.id === t.id);
  ok(!!back && back.hash_signature === t.hash_signature, 'เนื้อหากลับมาเหมือนเดิมทุกประการ (hash ตรง)');
  ok(archive(d).retired.length === 0, 'ถูกเอาออกจากคลังเก็บถาวรแล้ว ไม่ค้างสองที่');
  ok(s2.metadata.last_topic_id === t.id, 'เพดานรหัสยังคงอยู่ ไม่ถูกรีเซ็ต');
}

console.log('\n── 6) กันสั่งพลาด ──');
{
  const d = sandbox();
  const t = store(d).topics.slice(-1)[0].id;
  const many = store(d).topics.slice(0, 16).map(x => x.id).join(',');
  const cases = [
    { a: [t], want: 'เหตุผล', name: 'ไม่ใส่เหตุผล → หยุด' },
    { a: [t, '--reason', 'สั้น'], want: 'เหตุผล', name: 'เหตุผลสั้นเกิน → หยุด' },
    { a: ['T999', '--reason', 'ทดสอบเหตุผลยาวพอสมควร'], want: 'ไม่พบหัวข้อ', name: 'รหัสไม่มีจริง → หยุด' },
    { a: ['XYZ', '--reason', 'ทดสอบเหตุผลยาวพอสมควร'], want: 'รูปแบบรหัส', name: 'รูปแบบรหัสผิด → หยุด' },
    { a: [t + ',' + t, '--reason', 'ทดสอบเหตุผลยาวพอสมควร'], want: 'ซ้ำ', name: 'รหัสซ้ำในคำสั่ง → หยุด' },
    { a: [many, '--reason', 'ทดสอบเหตุผลยาวพอสมควร'], want: 'สูงสุด', name: 'เกิน 15 หัวข้อ → หยุด' }
  ];
  for (const c of cases) {
    const r = run(d, c.a);
    ok(r.code !== 0 && r.out.includes(c.want), c.name);
  }
  ok(store(d).topics.length === 28, 'ไม่มีหัวข้อไหนหายจากการสั่งผิดทั้ง 6 แบบ');
}

console.log('\n── 7) เกตจับรหัสวนกลับได้ถ้ามีคนไปแก้มือ ──');
{
  const d = sandbox();
  const s = store(d);
  s.metadata.last_topic_id = 'T005';   // จำลองเพดานถอยหลัง (แก้มือ/merge ผิด)
  fs.writeFileSync(path.join(d, 'data', 'knowledge_store.json'), JSON.stringify(s, null, 2));
  let out = '', code = 0;
  try { out = execFileSync('node', [path.join(d, 'scripts', 'validate.js'), path.join(d, 'data', 'knowledge_store.json')], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { code = e.status; out = (e.stdout || '') + (e.stderr || ''); }
  ok(code !== 0 && /G2_ID_CAP/.test(out), 'เกต G2_ID_CAP บล็อกเมื่อเพดานรหัสถอยหลัง');
}


/* ── ส่วนหน้าเว็บ: ปุ่มเอาหัวข้อออก ── */
console.log('\n── 8) หน้าเว็บ: ตัวกันพลาด 3 ชั้น ──');
{
  const html = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8');
  const grab = n => { const i = html.indexOf('function ' + n + '('); let d = 0, s = false;
    for (let j = i; j < html.length; j++) { if (html[j] === '{') { d++; s = true } else if (html[j] === '}') { d--; if (s && !d) return html.slice(i, j + 1) } } return null; };
  const code = grab('acRtCheck');
  ok(!!code, 'ดึงฟังก์ชัน acRtCheck() ออกมาได้');

  function sim(nPicked, reason, confirm) {
    const state = {};
    const doc = { querySelectorAll: () => Array.from({ length: nPicked }, () => ({ checked: true, value: 'T001' })),
      getElementById: id => ({ value: id === 'ac-rt-reason' ? reason : confirm,
        set textContent(v) { state.msg = v }, get textContent() { return state.msg },
        style: {}, set disabled(v) { state.disabled = v }, get disabled() { return state.disabled } }) };
    const picked = Array.from({ length: nPicked }, (_, i) => 'T' + String(i + 1).padStart(3, '0'));
    new Function('document', 'acRtPicked', 'AC_RT_MAX', code + '\nacRtCheck();')(doc, () => picked, 15);
    return state;
  }
  ok(sim(0, '', '').disabled === true, 'ยังไม่เลือกหัวข้อ → ปุ่มล็อก');
  ok(sim(2, 'สั้น', '2').disabled === true, 'เหตุผลสั้นเกิน 10 ตัวอักษร → ปุ่มล็อก');
  ok(sim(2, 'ทดสอบระบบ ไม่ใช่ความรู้จริง', '').disabled === true, 'ยังไม่พิมพ์ยืนยันจำนวน → ปุ่มล็อก');
  ok(sim(2, 'ทดสอบระบบ ไม่ใช่ความรู้จริง', '3').disabled === true, 'พิมพ์จำนวนไม่ตรงกับที่ติ๊ก → ปุ่มล็อก');
  ok(sim(16, 'ทดสอบระบบ ไม่ใช่ความรู้จริง', '16').disabled === true, 'เกิน 15 หัวข้อ → ปุ่มล็อก');
  const good = sim(2, 'ทดสอบระบบ ไม่ใช่ความรู้จริง', '2');
  ok(good.disabled === false, 'ครบทุกเงื่อนไข → ปุ่มปลดล็อก');
  ok(/พร้อมส่ง/.test(good.msg), 'ข้อความบอกสถานะพร้อมส่ง');

  ok(html.includes('AC_RT_MAX=15'), 'เพดานหน้าเว็บ (15) ตรงกับ MAX_PER_RUN ในสคริปต์');
  ok(/MAX_PER_RUN = 15/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'retire_topics.js'), 'utf8')), 'เพดานฝั่งสคริปต์คือ 15');
  ok(html.includes('ยังไม่มีอะไรหายจากเว็บจนกว่าคุณจะอนุมัติ'), 'บอกผู้ใช้ชัดว่ากดแล้วยังไม่หาย');
  ok(html.includes('retire-topics.yml/dispatches'), 'ยิงไปที่ workflow retire-topics');
  ok(!/knowledge_store\.json.*PUT|PUT.*knowledge_store/.test(html), 'เว็บไม่เขียนไฟล์ความรู้ตรงๆ — ผ่านใบงานเท่านั้น');
}

console.log(`\n${fail ? '❌' : '✅'} ผล: ผ่าน ${pass} / ตก ${fail}`);
process.exit(fail ? 1 : 0);
