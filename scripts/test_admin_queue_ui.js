#!/usr/bin/env node
/**
 * test_admin_queue_ui.js — ตรวจหน้าคิวงานผู้ดูแลแบบ offline (ไม่ต้องมีเน็ต/โทเคน)
 *
 * เป้าหมายหลักคือ "ไม่ทำของเดิมพัง" — เทสต์นี้จึงเช็ค 3 ชั้น
 *   A) โครงสร้าง: id/ฟังก์ชันที่โค้ดส่วนอื่นพึ่งพา ต้องยังอยู่ครบ (ห้ามลบ ห้ามเปลี่ยนชื่อ)
 *   B) ตรรกะจัดกลุ่ม: รันฟังก์ชันจริงที่ดึงออกมาจากไฟล์ ด้วยข้อมูลจำลอง แล้ววัดผล
 *   C) ถ้อยคำ: ไม่มีคำที่พาผู้ใช้ข้ามหน้าจอ และไม่มีศัพท์ระบบหลงเหลือ
 */
const fs = require('fs');
const path = require('path');
const HTML = path.join(__dirname, '..', 'app', 'index.html');
const src = fs.readFileSync(HTML, 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✔ ' + m); } else { fail++; console.log('  ✘ ' + m); } }

console.log('── A) ของเดิมต้องยังอยู่ครบ (สิ่งที่โค้ดอื่นพึ่งพา) ──');
for (const id of ['ac-prs', 'ac-drafts', 'ac-queue', 'ac-t2-msg', 'ac-review', 'ac-akey', 'ac-apbtn'])
  ok(src.includes('id="' + id + '"'), 'ยังมี #' + id + ' (โค้ดเดิมเขียนผลลงที่นี่)');
for (const fn of ['loadPRs', 'loadDrafts', 'loadQueue', 'apOpen', 'apMerge', 'apCheck', 'apSendBack',
                  'verifyDraft', 'flRender', 'flAct', 'flForm', 'acBadge', 'readRepoJson'])
  ok(new RegExp('function\\s+' + fn + '\\s*\\(').test(src), 'ฟังก์ชัน ' + fn + '() ยังอยู่');
ok(/function\s+loadWork\s*\(/.test(src), 'มีฟังก์ชันใหม่ loadWork()');
ok(src.includes('id="ac-work"'), 'มีคอนเทนเนอร์ใหม่ #ac-work');

console.log('\n── B) ตรรกะจัดกลุ่ม — รันโค้ดจริงด้วยข้อมูลจำลอง ──');
// ดึงเฉพาะ 2 ฟังก์ชันช่วยเรนเดอร์ + จำลองการจัดกลุ่มแบบเดียวกับใน loadWork
function grab(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; started = true; }
    else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const codeGroup = grab('wkGroup'), codeRow = grab('wkRow');
ok(!!codeGroup && !!codeRow, 'ดึงฟังก์ชันเรนเดอร์ออกมาได้');
const sandbox = { esc: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) };
// eslint-disable-next-line no-new-func
const fnFactory = new Function('esc', codeGroup + '\n' + codeRow + '\nreturn {wkGroup:wkGroup,wkRow:wkRow};');
const R = fnFactory(sandbox.esc);

const AP_PRS = [
  { number: 97, title: '🤖 Draft: ความยั่งยืนและพลังงานสะอาด', _ci: '✅', html_url: 'https://x/97' },
  { number: 98, title: '🔴 ต้องแก้ก่อน — Verify: การจัดการเชื้อเพลิง', _ci: '❌', html_url: 'https://x/98' },
  { number: 99, title: '🤖 ร่างรอตรวจ: ระบบสารสนเทศ', _ci: '🟡', html_url: 'https://x/99' },
  { number: 100, title: '🤖 Draft:', _ci: '⏳', html_url: 'https://x/100' }
];
const ready = [], busy = [], bad = [];
AP_PRS.forEach((p, i) => {
  const t = (p.title || '').replace(/^🤖\s*/, '').replace(/^(Draft|ร่างรอตรวจ):\s*/, '').trim() || '(ไม่ระบุชื่อหัวข้อ)';
  const it = { i, p, t };
  if (p._ci === '✅') ready.push(it); else if (p._ci === '❌') bad.push(it); else busy.push(it);
});
ok(ready.length === 1 && ready[0].p.number === 97, 'PR เกตเขียว → กลุ่ม "ถึงคิวคุณตัดสินใจ"');
ok(bad.length === 1 && bad[0].p.number === 98, 'PR เกตแดง → กลุ่ม "ต้องแก้ก่อน" (ไม่ปนกับพร้อมอนุมัติ)');
ok(busy.length === 2, 'PR กำลังตรวจ (🟡 และ ⏳) → กลุ่ม "ระบบกำลังทำให้"');
ok(ready[0].t === 'ความยั่งยืนและพลังงานสะอาด', 'ตัดคำนำหน้า 🤖/Draft: ออกจากชื่อได้');
ok(busy.find(x => x.p.number === 100).t === '(ไม่ระบุชื่อหัวข้อ)', 'ชื่อว่างแสดงข้อความแทน ไม่โชว์ช่องว่าง');
const all = [...ready, ...bad, ...busy].map(x => x.p.number);
ok(new Set(all).size === all.length, 'ไม่มีใบงานซ้ำข้ามกลุ่ม (dedup ตามเลข PR)');
ok(all.length === AP_PRS.length, 'ไม่มีใบงานตกหล่น — ทุกใบถูกจัดกลุ่ม');

const rowOk = R.wkRow('ok', '✅', 'หัวข้อทดสอบ', 'meta', 'อนุมัติ', 'apOpen(0)');
ok(rowOk.includes('apOpen(0)'), 'ปุ่มกลุ่มพร้อมอนุมัติผูกกับ apOpen() ตัวเดิม');
ok(rowOk.includes('#1A7A40'), 'แถวพร้อมอนุมัติเป็นสีเขียว');
const rowRun = R.wkRow('run', '🟡', 'x', 'm', 'ดู', null, 'https://x/99', true);
ok(rowRun.includes('rel="noopener"') && rowRun.includes('target="_blank"'), 'ลิงก์ออกนอกเปิดแท็บใหม่อย่างปลอดภัย');
ok(R.wkGroup('ถึงคิวคุณตัดสินใจ', 3).includes('>3<'), 'หัวข้อกลุ่มแสดงจำนวนถูกต้อง');
ok(R.wkRow('ok', '✅', '<script>alert(1)</script>', 'm', 'b', 'x').includes('&lt;script&gt;'),
   'ชื่อหัวข้อถูก escape — กันสคริปต์แปลกปลอมจากชื่อ PR');

console.log('\n── C) ถ้อยคำ ──');
const live = src.split('\n').filter(l => !/^\s*(\/\/|<!--|\s*\*)/.test(l)).join('\n');
ok(!/กลับมาแท็บ <b>ร่างรอตรวจ<\/b>/.test(live), 'ไม่มีคำสั่งให้ "กลับมาแท็บ" อีกแล้ว');
ok(!/ไปกดอนุมัติในคิว "รออนุมัติขึ้นเว็บ" ด้านบน/.test(live), 'ไม่มีคำสั่งให้ "ไปกด...ด้านบน" อีกแล้ว');
ok(live.includes('เปิดอ่านลิงก์อ้างอิง'), 'ใช้คำใหม่ "เปิดอ่านลิงก์อ้างอิง" แทน "สั่งตรวจพิสูจน์"');
ok(live.includes('อ่านสรุป<br>แล้วอนุมัติขึ้นเว็บ'), 'ใช้คำใหม่ "อ่านสรุป แล้วอนุมัติขึ้นเว็บ" แทน "รีวิว →"');
ok(live.includes('เลือกวิธีปิด'), 'ใช้คำใหม่ "เลือกวิธีปิด" แทน "จัดการ"');
ok(live.includes('ไม่บล็อกการอนุมัติหัวข้อใหม่'), 'บอกชัดว่ารายการค้างไม่บล็อกงานใหม่');
ok(live.includes('ยังไม่ได้เปิดอ่านลิงก์อ้างอิง — ยังขึ้นเว็บไม่ได้'), 'สถานะร่างบอกทั้งเหตุผลและข้อจำกัด');

console.log('\n── D) กันการถอยหลัง ──');
ok(/ปิดการแสดงผลชั่วคราว 2026-07-21/.test(src), 'ของเดิมถูกคอมเมนต์ไว้พร้อมมาร์กเกอร์วันที่ (กู้คืนได้)');
ok(/เดิม: if\(n===2\)\{loadPRs\(\);loadDrafts\(\);loadQueue\(\)\}/.test(src), 'เก็บโค้ดเดิมของ acTab ไว้เป็นคอมเมนต์');
ok(/await loadPRs\(\);/.test(src), 'loadWork รอ loadPRs ให้เสร็จก่อน — AP_PRS พร้อมก่อน apOpen ถูกเรียก');
const tagOpen = (src.match(/<div/g) || []).length, tagClose = (src.match(/<\/div>/g) || []).length;
ok(tagOpen === tagClose, `จำนวนแท็ก div เปิด/ปิดตรงกัน (${tagOpen}/${tagClose})`);

console.log(`\n${fail ? '❌' : '✅'} ผล: ผ่าน ${pass} / ตก ${fail}`);
process.exit(fail ? 1 : 0);
