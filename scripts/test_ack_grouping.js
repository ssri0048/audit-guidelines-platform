#!/usr/bin/env node
/**
 * test_ack_grouping.js — พิสูจน์ว่าการยุบช่องติ๊ก "ลดจำนวน แต่ไม่ลดสาระ"
 *
 * เงื่อนไขที่ห้ามเสีย:
 *   1) ทุกข้อความต้นฉบับต้องยังปรากฏให้ผู้อนุมัติเห็นได้ (อยู่ในช่องหลัก หรือในรายการที่กางดูได้)
 *   2) "สลับฉบับที่ถูกถอน" ต้องแยกช่องรายมาตรฐาน ห้ามรวบ — เป็นการเปลี่ยนว่าอ้างฉบับไหน
 *   3) ยังต้องติ๊กครบทุกช่องถึงจะอนุมัติได้ (apCheck ไม่ถูกแตะ)
 *   4) ใช้ข้อมูลจริงในคลังวัดผล ไม่ใช่ข้อมูลสมมติ
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8');
const store = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'knowledge_store.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✔ ' + m); } else { fail++; console.log('  ✘ ' + m); } };

// ── จำลองตรรกะจัดกลุ่มแบบเดียวกับในหน้าเว็บ ──
function build(topic) {
  const items = [];
  const last = (topic.changelog || []).slice(-1)[0];
  const raw = last ? (last.change || '').split(' | ').filter(x => x.length > 8) : [];
  const uniq = [...new Set(raw)];
  const swaps = [], amds = [], notes = [], others = [];
  uniq.forEach(f => {
    if (/ถูกถอน|สลับเป็น/.test(f)) swaps.push(f);
    else if (/มีฉบับแก้ไข|พ่วง/.test(f)) amds.push(f);
    else if (/source_chain|หมายเหตุ|AUTO-VERIFY/.test(f)) notes.push(f);
    else others.push(f);
  });
  swaps.forEach(f => items.push({ t: '🔁 ' + f }));
  others.forEach(f => items.push({ t: '🔧 ' + f }));
  if (amds.length) items.push({ t: '➕ ระบบพ่วงฉบับแก้ไขเพิ่มเติมให้ ' + amds.length + ' มาตรฐาน', d: amds });
  if (notes.length) items.push({ t: '📎 หมายเหตุการทำงานของระบบ ' + notes.length + ' รายการ', d: notes });
  return { items, raw, uniq, swaps, amds, notes, others };
}

console.log('── 1) วัดผลจากข้อมูลจริงทั้งคลัง ──');
let totalBefore = 0, totalAfter = 0, worstBefore = 0, worstAfter = 0, worstId = '';
for (const t of store.topics) {
  const r = build(t);
  if (!r.raw.length) continue;
  totalBefore += r.raw.length; totalAfter += r.items.length;
  if (r.raw.length > worstBefore) { worstBefore = r.raw.length; worstAfter = r.items.length; worstId = t.id; }
}
console.log('     ทั้งคลัง: ' + totalBefore + ' ช่อง → ' + totalAfter + ' ช่อง');
console.log('     หัวข้อหนักสุด ' + worstId + ': ' + worstBefore + ' → ' + worstAfter + ' ช่อง');
ok(totalAfter < totalBefore * 0.35, 'ลดจำนวนช่องได้เกิน 65% (' + Math.round((1 - totalAfter / totalBefore) * 100) + '%)');
ok(worstAfter <= 6, 'หัวข้อที่หนักที่สุดเหลือไม่เกิน 6 ช่อง (ได้ ' + worstAfter + ')');

console.log('\n── 2) ห้ามมีสาระหาย — ทุกข้อความต้องยังเห็นได้ ──');
let lost = 0, checked = 0;
for (const t of store.topics) {
  const r = build(t);
  if (!r.raw.length) continue;
  const visible = new Set();
  r.items.forEach(it => { visible.add(it.t.replace(/^[^\s]+\s/, '')); (it.d || []).forEach(d => visible.add(d)); });
  for (const f of r.uniq) { checked++; if (!visible.has(f)) lost++; }
}
ok(lost === 0, 'ข้อความต้นฉบับ ' + checked + ' รายการ ยังเห็นได้ครบ ไม่หายสักรายการ');

console.log('\n── 3) รายการที่ต้องใช้ดุลยพินิจ ห้ามรวบ ──');
const t20 = store.topics.find(x => x.id === 'T020');
if (t20) {
  const r = build(t20);
  const swapItems = r.items.filter(i => i.t.startsWith('🔁'));
  console.log('     T020: สลับฉบับ ' + r.swaps.length + ' รายการ → ' + swapItems.length + ' ช่องแยก');
  ok(swapItems.length === r.swaps.length, 'ทุกรายการ "สลับฉบับที่ถูกถอน" ได้ช่องติ๊กของตัวเอง');
  ok(swapItems.every(i => !i.d), 'รายการสลับฉบับไม่ถูกยุบเป็นกลุ่ม');
  ok(r.items.some(i => i.t.startsWith('➕') && i.d && i.d.length > 1), 'รายการเชิงกลไกถูกยุบเป็นกลุ่มพร้อมรายละเอียด');
}

console.log('\n── 4) ตรรกะอนุมัติต้องไม่ถูกแตะ ──');
ok(/const boxes=\[\.\.\.document\.querySelectorAll\('\.ac-ack'\)\]/.test(src), 'apCheck ยังนับจาก .ac-ack เหมือนเดิม');
ok(/const ready=boxes\.length>0&&n===boxes\.length&&key\.length>10&&ciOk/.test(src), 'เงื่อนไขปลดล็อกยังเป็น ติ๊กครบ + มีรหัส + เกตเขียว');
ok(/class="ac-ack" onchange="apCheck\(\)"/.test(src), 'ทุกช่องยังเรียก apCheck() ตอนติ๊ก');

console.log('\n── 5) กันบั๊ก UI ──');
const detailsIdx = src.indexOf('<details style="margin:0 0 7px 23px"');
const labelClose = src.lastIndexOf('</label>', detailsIdx);
ok(detailsIdx > labelClose && labelClose > 0, '<details> อยู่นอก <label> — กางรายการแล้วไม่ไปติ๊กช่องโดยไม่ตั้งใจ');
ok(/เดิม: \(last\.change\|\|''\)\.split/.test(src), 'โค้ดเดิมถูกเก็บเป็นคอมเมนต์ กู้คืนได้');
ok(/x\.d\.map\(v=>'<li>'\+esc\(v\)\+'<\/li>'\)/.test(src), 'รายละเอียดถูก escape กันสคริปต์แปลกปลอม');

console.log(`\n${fail ? '❌' : '✅'} ผล: ผ่าน ${pass} / ตก ${fail}`);
process.exit(fail ? 1 : 0);
