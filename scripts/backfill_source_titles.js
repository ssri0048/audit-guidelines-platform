#!/usr/bin/env node
/**
 * backfill_source_titles.js — ครั้งเดียว/idempotent: ปรับชื่อแหล่ง (source_chain.title)
 * ของหัวข้อเดิมทั้งหมด ให้ = citation ที่ canonical แล้วใน applicable_standards (family เดียวกัน)
 * แก้เคส title เก่าแบบ "display (vXXXX)" ที่ตกฉบับแก้ไข/ไม่ตรงกับส่วน "มาตรฐานที่ใช้"
 * ปลอดภัย: แตะเฉพาะ title ของ source ที่ระบบผูก (SRC-AUTO-) + hash ไม่เปลี่ยน (คิดจาก id/name/risks)
 * Usage: node scripts/backfill_source_titles.js [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { famFor } = require('./verify_draft.js');

function backfill(store, registry) {
  let fixed = 0;
  for (const t of store.topics || []) {
    for (const sc of t.source_chain || []) {
      if (!sc.source_id || !sc.source_id.startsWith('SRC-AUTO-')) continue;
      const famId = sc.source_id.slice('SRC-AUTO-'.length);
      const match = (t.applicable_standards || []).find(a => { const f = famFor(registry, a); return f && f.family_id === famId; });
      if (match && sc.title !== match) { sc.title = match; fixed++; }
    }
  }
  return fixed;
}
module.exports = { backfill };

if (require.main === module) {
  const ROOT = path.join(__dirname, '..');
  const storePath = path.join(ROOT, 'data', 'knowledge_store.json');
  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'standards_registry.json'), 'utf8'));
  const n = backfill(store, registry);
  if (process.argv.includes('--dry')) { console.log(`(dry) จะปรับชื่อแหล่ง ${n} รายการ`); process.exit(0); }
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  console.log(`✅ ปรับชื่อแหล่ง ${n} รายการให้ตรง citation ในมาตรฐานที่ใช้`);
}
