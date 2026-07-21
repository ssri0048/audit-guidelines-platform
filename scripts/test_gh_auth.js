#!/usr/bin/env node
/**
 * test_gh_auth.js — ตรวจการเรียก GitHub API ของหน้าเว็บ
 *
 * ที่มา: ผู้ใช้เจอ "GitHub API 403" ตอนกดดูรายละเอียดใบงาน ทั้งที่รหัสถูกต้อง
 * สาเหตุ: gh() ไม่แนบรหัส → ใช้โควตาสาธารณะ 60 ครั้ง/ชม. แต่เปิดคิวงานทีเดียวยิงหลายสิบครั้ง
 *
 * เทสต์นี้รัน gh() ตัวจริงที่ดึงจากไฟล์ ด้วย fetch จำลอง — ไม่ต่อเน็ต ไม่ใช้รหัสจริง
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✔ ' + m); } else { fail++; console.log('  ✘ ' + m); } };

// ดึงฟังก์ชัน gh() ตัวจริงออกมา
function grab(name) {
  const i = src.indexOf('async function ' + name + '(');
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; started = true; }
    else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const code = grab('gh');
ok(!!code, 'ดึงฟังก์ชัน gh() ออกมาได้');

function makeGh(key) {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: 1 }) };
  };
  const fn = new Function('fetch', 'getAdminKey', code + '\nreturn gh;')(fakeFetch, () => key);
  return { fn, calls };
}
function makeGhErr(status, headers, key) {
  const fakeFetch = async () => ({ ok: false, status, headers: { get: k => headers[k] || null } });
  return new Function('fetch', 'getAdminKey', code + '\nreturn gh;')(fakeFetch, () => key);
}

(async () => {
  console.log('\n── 1) เข้าสู่ระบบแล้ว ต้องแนบรหัสไปด้วย ──');
  {
    const { fn, calls } = makeGh('ghp_TESTKEY123456789');
    await fn('/repos/x/y/pulls');
    const h = calls[0].opts.headers || {};
    ok(h.Authorization === 'Bearer ghp_TESTKEY123456789', 'แนบ Authorization header');
    ok(calls[0].url.startsWith('https://api.github.com'), 'ส่งไปที่ api.github.com เท่านั้น');
  }

  console.log('\n── 2) ยังไม่เข้าสู่ระบบ ต้องยังอ่านได้ (ผู้ใช้ทั่วไป) ──');
  {
    const { fn, calls } = makeGh('');
    const r = await fn('/repos/x/y/pulls');
    ok(r && r.ok === 1, 'เรียกสำเร็จโดยไม่มีรหัส');
    ok(!(calls[0].opts.headers || {}).Authorization, 'ไม่แนบ Authorization เปล่าๆ');
  }

  console.log('\n── 3) รหัสห้ามรั่วไปปลายทางอื่น ──');
  {
    const { fn, calls } = makeGh('ghp_SECRET');
    await fn('/repos/x/y/contents/data/drafts');
    ok(calls.every(c => c.url.startsWith('https://api.github.com/')), 'ทุกคำขอไปที่ api.github.com');
  }

  console.log('\n── 4) ข้อความผิดพลาดต้องบอกได้ว่าต้องทำอะไรต่อ ──');
  const reset = Math.floor((Date.now() + 20 * 60000) / 1000);
  const cases = [
    { st: 403, hd: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }, key: '',
      want: ['บ่อยเกินโควตา', 'ยังไม่ได้เข้าสู่ระบบ', 'นาที'], name: 'เกินโควตา + ยังไม่ล็อกอิน' },
    { st: 403, hd: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }, key: 'k',
      want: ['บ่อยเกินโควตา', 'นาที'], name: 'เกินโควตา ทั้งที่ล็อกอินแล้ว' },
    { st: 403, hd: { 'x-ratelimit-remaining': '4999' }, key: 'k',
      want: ['ไม่มีสิทธิ์'], name: '403 จากสิทธิ์ ไม่ใช่โควตา' },
    { st: 401, hd: {}, key: 'k', want: ['รหัสไม่ถูกต้อง'], name: '401 รหัสหมดอายุ' },
    { st: 404, hd: {}, key: 'k', want: ['ไม่พบข้อมูล'], name: '404 ไม่พบ' }
  ];
  for (const c of cases) {
    const fn = makeGhErr(c.st, c.hd, c.key);
    let msg = '';
    try { await fn('/x'); } catch (e) { msg = e.message; }
    ok(c.want.every(w => msg.includes(w)), c.name + ' → "' + msg.slice(0, 72) + '…"');
    ok(!/^GitHub API \d+$/.test(msg), '  ไม่ใช่ข้อความดิบที่อ่านไม่รู้เรื่อง');
  }

  console.log('\n── 5) ลดจำนวนการเรียกที่ซ้ำซ้อน ──');
  ok(/if\(n===2\)\{loadWork\(\)\}/.test(src), 'เปิดแท็บคิวงานเรียก loadWork() อย่างเดียว ไม่เรียก loadDrafts ซ้ำ');
  ok(/function loadDrafts/.test(src), 'ฟังก์ชัน loadDrafts() ยังอยู่ ไม่ถูกลบ');
  ok(/เดิม: const r=await fetch\('https:\/\/api\.github\.com'/.test(src), 'โค้ดเดิมเก็บเป็นคอมเมนต์ กู้คืนได้');

  console.log(`\n${fail ? '❌' : '✅'} ผล: ผ่าน ${pass} / ตก ${fail}`);
  process.exit(fail ? 1 : 0);
})();
