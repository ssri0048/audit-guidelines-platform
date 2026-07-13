#!/usr/bin/env node
/**
 * validate.js — Quality Gates เป็นโค้ดจริง (บังคับใน CI ทุก Pull Request)
 * ─────────────────────────────────────────────────────────────────────
 * นโยบาย: ความรู้ที่ verify แล้ว (L0/L1 + APPROVED) ต้องผ่านทุก gate แบบ HARD
 *          ความรู้เก่า (LEGACY_UNVERIFIED) ผ่าน schema/dedup แบบ HARD
 *          ส่วน gate เนื้อหาเป็น WARNING จนกว่าจะ re-verify เสร็จ
 * Usage:  node scripts/validate.js [path/to/knowledge_store.json]
 * Exit:   0 = ผ่าน (warnings ได้), 1 = มี error → CI block merge
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const STORE = process.argv[2] || path.join(__dirname, '..', 'data', 'knowledge_store.json');
const CURRENT_YEAR = new Date().getFullYear();
const BUDDHIST_OFFSET = 543;

// ── ตารางเวอร์ชันมาตรฐานที่ "มีจริง" (SKL002 Standards Validator — enforcement จริง) ──
// รูปแบบ: regex จับชื่อตระกูลมาตรฐาน → ปี/เวอร์ชันที่ถูกต้อง
const STANDARD_VERSIONS = [
  { family: /IIA\s+GIAS|Global Internal Audit Standards/i, valid: ['2024'] },
  { family: /COSO\s+ERM/i, valid: ['2017'] },
  { family: /COSO(?!\s+ERM)/i, valid: ['2013', '2017'] },
  { family: /ISO\s*31000/i, valid: ['2018'] },
  { family: /ISO\/?IEC?\s*27001/i, valid: ['2022'] },
  { family: /ISO\s*19011/i, valid: ['2018'] },
  { family: /ISO\/?IEC?\s*42001/i, valid: ['2023'] },
  { family: /NIST\s+CSF/i, valid: ['2.0'] },
  { family: /NIST\s+AI\s+RMF/i, valid: ['1.0'] },
];

// ── เกณฑ์นโยบาย (ตาม requirement ที่ user กำหนด) ──
const POLICY = {
  MIN_RISKS_PER_TOPIC: 5,
  MIN_EVIDENCE_PER_PROCEDURE: 4,
  MIN_SOURCE_CREDIBILITY_L1: 90,
  MIN_SOURCES_L1: 2, // consensus: ≥2 แหล่งอิสระ
};

const errors = [];
const warnings = [];
function report(isLegacy, topicId, gate, msg) {
  // legacy topic → gate เนื้อหาเป็น warning; verified topic → error
  (isLegacy ? warnings : errors).push(`[${gate}] ${topicId}: ${msg}`);
}
function hard(topicId, gate, msg) { errors.push(`[${gate}] ${topicId}: ${msg}`); }

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}
function sha256Of(topic) {
  const content = { id: topic.id, name_th: topic.name_th, category: topic.category || '', risks: topic.risks || [] };
  return 'sha256:' + crypto.createHash('sha256').update(stableStringify(content), 'utf8').digest('hex');
}
function extractYears(s) {
  // แยก "ปี" ออกจาก "หมายเลขมาตรฐาน/clause" — IEEE 2030, IEC 61850, IIA Standard 2130
  // ล้วนเป็นหมายเลข ไม่ใช่ปี จึงไม่นับ
  const years = [];
  const str = String(s);
  const re = /\b(19|20|25)\d{2}\b/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    const before = str.slice(Math.max(0, m.index - 16), m.index);
    // ข้ามถ้าเลขตามหลังชื่อองค์กร/ตระกูลมาตรฐานที่ใช้เลขเป็น "หมายเลข" (ไม่ใช่ปี)
    if (/(IEEE|IEC|ISO(?!\s*\d+:)|Std\.?|Standard|IIA(?!\s+GIAS)|NIST\s+SP|C)\s*$/i.test(before)) continue;
    let n = parseInt(m[0], 10);
    if (n > 2400) n -= BUDDHIST_OFFSET; // พ.ศ. → ค.ศ.
    years.push(n);
  }
  return years;
}

// ── โหลดไฟล์ ──
let store;
try {
  store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
} catch (e) {
  console.error('❌ อ่าน/parse ไฟล์ไม่ได้: ' + e.message);
  process.exit(1);
}
if (!store.metadata || !Array.isArray(store.topics)) {
  console.error('❌ โครงสร้างไฟล์ผิด: ต้องมี metadata และ topics[]');
  process.exit(1);
}

const seenIds = new Set();
const seenNames = new Set();

for (const t of store.topics) {
  const id = t.id || '(no-id)';
  const isLegacy = t.approval_status === 'LEGACY_UNVERIFIED' || t.approval_status === 'DRAFT';

  // ── G1: SCHEMA (HARD เสมอ) ──
  const required = ['id', 'name_th', 'name_en', 'category', 'priority', 'applicable_standards',
    'knowledge_id', 'version', 'knowledge_layer', 'approval_status', 'hash_signature',
    'changelog', 'created_at', 'updated_at', 'risks'];
  for (const f of required) {
    if (t[f] === undefined) hard(id, 'G1_SCHEMA', `ขาด field "${f}"`);
  }
  if (t.id && !/^T\d{3,}$/.test(t.id)) hard(id, 'G1_SCHEMA', 'รูปแบบ id ต้องเป็น Tnnn');
  if (t.version && !/^\d+\.\d+\.\d+$/.test(t.version)) hard(id, 'G1_SCHEMA', 'version ต้องเป็น semver');
  if (t.knowledge_layer && !['L0', 'L1', 'L2', 'L3'].includes(t.knowledge_layer)) hard(id, 'G1_SCHEMA', 'knowledge_layer ไม่ถูกต้อง');
  if (!Array.isArray(t.risks) || t.risks.length === 0) { hard(id, 'G1_SCHEMA', 'ต้องมี risks อย่างน้อย 1'); continue; }
  for (const r of t.risks) {
    for (const f of ['id', 'name_th', 'level', 'likelihood', 'impact', 'control_failures']) {
      if (r[f] === undefined) hard(id, 'G1_SCHEMA', `risk ${r.id || '?'} ขาด field "${f}"`);
    }
    for (const cf of r.control_failures || []) {
      if (!cf.name_th) hard(id, 'G1_SCHEMA', `CF ${cf.id || '?'} ขาด name_th`);
      if (!Array.isArray(cf.audit_procedures) || cf.audit_procedures.length === 0)
        report(isLegacy, id, 'G1_SCHEMA', `CF ${cf.id || '?'} ไม่มี audit_procedures`);
      for (const ap of cf.audit_procedures || []) {
        if (!ap.method) report(isLegacy, id, 'G1_SCHEMA', `AP ${ap.id || '?'} ขาด method`);
        if (!Array.isArray(ap.evidence_types) || ap.evidence_types.length === 0)
          report(isLegacy, id, 'G1_SCHEMA', `AP ${ap.id || '?'} ไม่มี evidence_types`);
        else if (ap.evidence_types.length < POLICY.MIN_EVIDENCE_PER_PROCEDURE)
          report(isLegacy, id, 'P_EVIDENCE', `AP ${ap.id || '?'} มีหลักฐาน ${ap.evidence_types.length} < ${POLICY.MIN_EVIDENCE_PER_PROCEDURE}`);
      }
    }
  }

  // ── G2: DEDUP (HARD เสมอ) ──
  if (seenIds.has(t.id)) hard(id, 'G2_DEDUP', 'id ซ้ำ');
  seenIds.add(t.id);
  const nameKey = (t.name_th || '').trim();
  if (seenNames.has(nameKey)) hard(id, 'G2_DEDUP', 'name_th ซ้ำ');
  seenNames.add(nameKey);

  // ── G3: AUTHORITY + CONSENSUS (HARD สำหรับ L0/L1) ──
  if (['L0', 'L1'].includes(t.knowledge_layer)) {
    const chain = t.source_chain || [];
    const strong = chain.filter(s => (s.credibility_score || 0) >= POLICY.MIN_SOURCE_CREDIBILITY_L1);
    if (strong.length === 0) hard(id, 'G3_AUTHORITY', `L0/L1 ต้องมี source credibility ≥${POLICY.MIN_SOURCE_CREDIBILITY_L1} อย่างน้อย 1`);
    if (chain.length < POLICY.MIN_SOURCES_L1) hard(id, 'G3_CONSENSUS', `L1 ต้องมี ≥${POLICY.MIN_SOURCES_L1} แหล่งอิสระ (มี ${chain.length})`);
    const noUrl = chain.filter(s => !s.url);
    if (noUrl.length > 0) hard(id, 'G3_PROVENANCE', `${noUrl.length} source ไม่มี URL — ตรวจย้อนไม่ได้`);
    const noExcerpt = chain.filter(s => !s.excerpt);
    if (noExcerpt.length > 0) report(false, id, 'G3_PROVENANCE', `${noExcerpt.length} source ไม่มี excerpt (หลักฐานว่าอ่านไส้ในจริง)`);
  }

  // ── G4: HALLUCINATION — ปีอนาคต (HARD เสมอ) ──
  for (const std of t.applicable_standards || []) {
    for (const y of extractYears(std)) {
      if (y > CURRENT_YEAR) hard(id, 'G4_HALLUCINATION', `มาตรฐาน "${std}" มีปีอนาคต ${y}`);
    }
  }

  // ── G5: STANDARD VERSION REGISTRY ──
  for (const std of t.applicable_standards || []) {
    for (const rule of STANDARD_VERSIONS) {
      if (rule.family.test(std)) {
        const ok = rule.valid.some(v => std.includes(v));
        const hasVersionToken = /\d/.test(std);
        if (hasVersionToken && !ok)
          report(isLegacy, id, 'G5_VERSION', `"${std}" เวอร์ชันไม่ตรงทะเบียน (ที่ถูกต้อง: ${rule.valid.join('/')})`);
      }
    }
  }

  // ── G6: THAILAND APPLICABILITY ──
  if (t.thailand_applicable === true && (!t.thai_law_refs || t.thai_law_refs.length === 0))
    report(isLegacy, id, 'G6_THAILAND', 'thailand_applicable=true แต่ไม่มี thai_law_refs');

  // ── P: POLICY — risks ≥5 ต่อหัวข้อ (requirement ของ user) ──
  if ((t.risks || []).length < POLICY.MIN_RISKS_PER_TOPIC)
    report(isLegacy, id, 'P_RISKS', `มี ${t.risks.length} risks < ${POLICY.MIN_RISKS_PER_TOPIC} (ต้องเติมตอน re-verify)`);

  // ── P: HASH INTEGRITY (HARD เสมอ) ──
  const expect = sha256Of(t);
  if (t.hash_signature !== expect)
    hard(id, 'P_HASH', `hash ไม่ตรงเนื้อหา (คาด ${expect.slice(0, 20)}... พบ ${String(t.hash_signature).slice(0, 20)}...)`);
}

// ── สรุปผล ──
const legacy = store.topics.filter(t => t.approval_status === 'LEGACY_UNVERIFIED').length;
const verified = store.topics.filter(t => ['L0', 'L1'].includes(t.knowledge_layer) && t.approval_status === 'APPROVED').length;
console.log('══════════════════════════════════════════════');
console.log(' Quality Gates Report — knowledge_store.json');
console.log('══════════════════════════════════════════════');
console.log(` Topics ทั้งหมด: ${store.topics.length} | Verified (L0/L1): ${verified} | Legacy รอ re-verify: ${legacy}`);
console.log(` ❌ Errors:   ${errors.length}`);
console.log(` ⚠️  Warnings: ${warnings.length}`);
if (errors.length) { console.log('\n── ERRORS (block merge) ──'); errors.forEach(e => console.log('  ❌ ' + e)); }
if (warnings.length) { console.log('\n── WARNINGS (ต้องเคลียร์ตอน re-verify) ──'); warnings.slice(0, 40).forEach(w => console.log('  ⚠️  ' + w)); if (warnings.length > 40) console.log(`  ... และอีก ${warnings.length - 40} รายการ`); }
console.log('\n' + (errors.length ? '❌ FAILED — แก้ errors ก่อน merge' : '✅ PASSED — merge ได้ (warnings คืองานค้างของ re-verify)'));
process.exit(errors.length ? 1 : 0);
