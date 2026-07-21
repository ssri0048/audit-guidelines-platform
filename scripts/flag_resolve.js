#!/usr/bin/env node
/**
 * flag_resolve.js — Route 🔬 "ให้ระบบตรวจให้": ปิดธงทะเบียนอัตโนมัติด้วย readproof
 * ────────────────────────────────────────────────────────────────────────────
 * ทำสิ่งเดียว: เปิดอ่าน evidence_url ของ edition ที่ยัง UNVERIFIED + พิสูจน์ข้อความ (readproof)
 *   READ_VERIFIED → อัปเดต edition (verified:true + link_status + last_verified) + รันเกตจริง → exit 0
 *   อ่านไม่ได้/ไม่ตรง → "ไม่แตะไฟล์ใดๆ" รายงานเหตุ + แนะนำทาง ✍️ → exit 3 (workflow เปิด issue)
 * ไม่มีทางเขียน main ตรง — workflow เปิดเป็น PR เสมอ (เกต required เดิมคุม)
 * Usage: node scripts/flag_resolve.js <family_id> [repo_root]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readproof } = require('./readproof.js');

async function main(familyId, root, deps) {
  root = root || path.join(__dirname, '..');
  deps = deps || {};
  const fetchFn = deps.fetchFn || ((u) => fetch(u, { redirect: 'follow', headers: { 'user-agent': 'audit-guidelines-flag-resolver/1.0' } }));
  const regPath = path.join(root, 'data', 'standards_registry.json');
  const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
  const fam = (reg.families || []).find(f => f.family_id === familyId);
  if (!fam) { console.error('⛔ ไม่พบ family "' + familyId + '" ในทะเบียน'); process.exit(2); }
  const ed = (fam.editions || []).find(e => e.verified === false);
  if (!ed) { console.error('✅ ' + fam.display + ' ไม่มี edition ที่รอตรวจ — ธงอาจถูกปิดไปแล้ว'); process.exit(0); }
  if (!ed.evidence_url) {
    console.error('🔎 ' + fam.display + ' v' + ed.version + ' ไม่มี URL ให้เปิดอ่าน — โปรดใช้ "✍️ ตรวจเองแล้วบันทึกหลักฐาน" บนเว็บ');
    process.exit(3);
  }
  const verbatim = ed.excerpt_verbatim || ed.evidence_excerpt || fam.display;
  console.log('เปิดอ่าน: ' + ed.evidence_url);
  const r = await readproof(ed.evidence_url, verbatim, { fetchFn: fetchFn, extractors: deps.extractors || {} });
  console.log('ผลพิสูจน์: ' + r.state + ' (http ' + r.http + ') — ' + r.note);
  if (r.state !== 'READ_VERIFIED') {
    console.error('🔎 ปิดอัตโนมัติไม่ได้ (' + r.state + ') — ไม่มีการแก้ไฟล์ใดๆ · แนะนำ: ' +
      (r.state === 'EXISTENCE_ONLY' || r.state === 'INCONCLUSIVE'
        ? 'ใช้ "✍️ ตรวจเองแล้วบันทึกหลักฐาน" (คนที่เข้าถึงเอกสารกรอก 2 ช่อง)'
        : r.state === 'ALIVE_NO_MATCH' ? 'ตรวจว่า excerpt ในทะเบียนยังตรงกับหน้า official แล้วใช้ ✍️ บันทึกใหม่'
        : 'ลิงก์ตาย — หา URL official ใหม่แล้วใช้ ✍️'));
    process.exit(3);
  }
  ed.verified = true;
  ed.last_verified = r.checked_at;
  ed.link_status = { state: 'READ_VERIFIED', http: r.http, checked_at: r.checked_at, method: 'flag-resolver(readproof)' };
  fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
  // เกตจริงต้องผ่านก่อนปล่อย (แบบเดียวกับ verify_draft)
  try {
    execFileSync('node', [path.join(root, 'scripts', 'validate.js'), path.join(root, 'data', 'knowledge_store.json')], { stdio: 'pipe' });
  } catch (e) {
    console.error('❌ เกตไม่ผ่านหลังปิดธง — ยกเลิก (ไม่เปิด PR):\n' + String(e.stdout || '').slice(-800));
    process.exit(1);
  }
  console.log('✅ RESOLVED: ' + fam.display + ' v' + ed.version + ' — verified จากการอ่านจริง (' + r.checked_at + ') | เกตผ่าน');
  return { familyId, version: ed.version };
}
module.exports = { main };
if (require.main === module) {
  const fid = process.argv[2];
  if (!fid) { console.error('❌ ระบุ family_id'); process.exit(1); }
  let pdf = null;
  try { const pp = require('pdf-parse'); pdf = async res => (await pp(Buffer.from(await res.arrayBuffer()))).text; } catch (e) {}
  main(fid, process.argv[3], { extractors: pdf ? { pdf } : {} }).catch(e => { console.error('❌', e.message); process.exit(1); });
}
