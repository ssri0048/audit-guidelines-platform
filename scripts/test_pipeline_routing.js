#!/usr/bin/env node
/**
 * test_pipeline_routing.js — พิสูจน์ว่า research-pipeline เปิด "ใบงานเดียวเสมอ"
 *
 * ทำไมต้องมี: เดิมเมื่อ chain ตกเกต ระบบจะเปิดทั้งใบร่างและใบตรวจ ทำให้ผู้ดูแลเห็นงานเดียวโผล่ 2 ที่
 * และต้อง merge 2 ครั้ง เทสต์นี้อ่านเงื่อนไข if: จาก YAML จริง แล้วประเมินทุกเคสที่เป็นไปได้
 * เพื่อกันการแก้ในอนาคตทำให้เกิดใบซ้ำ หรือแย่กว่านั้นคือไม่เปิดใบเลย (งานหายเงียบ)
 */
const fs = require('fs');
const path = require('path');

const YML = path.join(__dirname, '..', '.github', 'workflows', 'research-pipeline.yml');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✔ ' + msg); } else { fail++; console.log('  ✘ ' + msg); } }

// ── ดึงเงื่อนไข if: ของ 2 step ที่ตัดสินใจเปิดใบงาน ──
const src = fs.readFileSync(YML, 'utf8');
function ifOf(nameFragment) {
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('- name:') && lines[i].includes(nameFragment)) {
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const m = lines[j].match(/^\s+if:\s*(.+)$/);
        if (m) return m[1].trim();
        if (lines[j].includes('- name:')) break;
      }
    }
  }
  return null;
}
const IF_TICKET = ifOf('Open ticket');
const IF_DRAFT  = ifOf('Open draft PR');

console.log('── เงื่อนไขที่อ่านได้จาก YAML จริง ──');
console.log('  ticket:', IF_TICKET);
console.log('  draft :', IF_DRAFT);

ok(!!IF_TICKET, 'พบ step เปิดใบงาน (Open ticket)');
ok(!!IF_DRAFT, 'พบ step เปิดใบร่าง (Open draft PR)');

// ── แปลง expression ของ GitHub Actions เป็น JS แล้วประเมิน ──
function evalIf(expr, ctx) {
  if (!expr) return false;
  let js = expr
    .replace(/steps\.chainverify\.outputs\.code/g, 'CODE')
    .replace(/steps\.run\.outputs\.has_draft/g, 'HAS')
    .replace(/inputs\.chain/g, 'CHAIN')
    .replace(/==/g, '===').replace(/!==/g, '!==').replace(/!=(?!=)/g, '!==');
  // eslint-disable-next-line no-new-func
  return Function('CODE', 'HAS', 'CHAIN', 'return (' + js + ')')(ctx.code, ctx.has, ctx.chain);
}

const CASES = [
  { n: 'chain + ผ่านหมด (code 0)',              chain: true,  has: 'true',  code: '0',  want: 'ticket' },
  { n: 'chain + ตกเกต (code 1) — งานยังใช้ได้',  chain: true,  has: 'true',  code: '1',  want: 'ticket' },
  { n: 'chain + escalate (code 2) — งานใช้ไม่ได้', chain: true,  has: 'true',  code: '2',  want: 'draft'  },
  { n: 'ไม่ติ๊ก chain',                          chain: false, has: 'true',  code: '',   want: 'draft'  },
  { n: 'chain + step ตายก่อนเขียน code (ว่าง)',  chain: true,  has: 'true',  code: '',   want: 'draft'  },
  { n: 'chain + code แปลก (127 command not found)', chain: true, has: 'true', code: '127', want: 'draft' },
  { n: 'ร่างไม่ออก (has_draft=false)',           chain: true,  has: 'false', code: '',   want: 'none'   },
];

console.log('\n── ไล่ทุกเคส: ต้องได้ใบงาน "ใบเดียว" เสมอ ──');
for (const c of CASES) {
  const ctx = { code: c.code, has: c.has, chain: c.chain };
  const t = evalIf(IF_TICKET, ctx) && c.has === 'true';
  const d = evalIf(IF_DRAFT, ctx);
  const got = t && d ? 'ซ้ำ2ใบ' : t ? 'ticket' : d ? 'draft' : 'none';
  ok(got === c.want, `${c.n} → ${got} (คาดหวัง ${c.want})`);
}

console.log('\n── กันการถอยหลัง (regression guards) ──');
// ตัดบรรทัดคอมเมนต์ออกก่อน เพราะโปรเจคนี้เก็บโค้ดเดิมไว้เป็นคอมเมนต์โดยตั้งใจ (ห้ามลบ)
const live = src.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
ok(!/--title "🤖 Draft: \$\{\{ steps\.topic\.outputs\.topic \}\}"/.test(live),
   'ไม่มีชื่อใบงานที่ว่างได้อีกแล้ว (มี fallback เมื่อ topic ว่าง)');
ok(/เดิม: --title "🤖 Draft:/.test(src),
   'ของเดิมยังถูกเก็บไว้เป็นคอมเมนต์ กู้คืนได้');
ok(/DTOPIC="\(ไม่ระบุชื่อหัวข้อ/.test(src),
   'มี fallback ชื่อหัวข้อจริงในโค้ด');
ok(/steps\.chainverify\.outputs\.code/.test(src),
   'ตัดสินใจด้วย exit code ไม่ใช่ outcome (แยก ตกเกต ออกจาก escalate ได้)');
ok(/echo "code=\$CODE" >> "\$GITHUB_OUTPUT"/.test(src),
   'มีการเขียน exit code ออกมาเป็น output');
ok(/if git diff --quiet -- data\//.test(src),
   'มีกันงานสูญ: ถ้า data/ ไม่เปลี่ยน จะเก็บไฟล์ร่างไว้แทน commit เปล่า');
ok(/🔴 ต้องแก้ก่อน/.test(src),
   'ใบงานที่ตกเกตติดป้ายชัดเจนว่าต้องแก้ก่อน');

console.log(`\n${fail ? '❌' : '✅'} ผล: ผ่าน ${pass} / ตก ${fail}`);
process.exit(fail ? 1 : 0);
