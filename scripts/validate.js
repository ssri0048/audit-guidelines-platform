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
const { structuralCheck } = require('./readproof.js'); // เช็คโครง URL (offline)

const STORE = process.argv[2] || path.join(__dirname, '..', 'data', 'knowledge_store.json');
const CURRENT_YEAR = new Date().getFullYear();
const BUDDHIST_OFFSET = 543;

// ── G5: Standards Lifecycle Registry (data/standards_registry.json) ──
// สถานะ: CURRENT/CONFIRMED/TO_BE_REVISED/TRANSITION/WITHDRAWN/AMENDED/PARTIAL_REPEAL/PINNED_BY_THAI_LAW
const REGISTRY_PATH = path.join(path.dirname(STORE), 'standards_registry.json');
let REGISTRY = { metadata: {}, families: [] };
try {
  REGISTRY = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
} catch (e) {
  console.error('❌ อ่าน standards_registry.json ไม่ได้: ' + e.message);
  process.exit(1);
}
const STALE_DAYS = REGISTRY.metadata.staleness_threshold_days || 183;
const NOW_MS = Date.now();

// ── Platform Flags — ขีดความสามารถของแพลตฟอร์ม (คนละแกนกับสถานะมาตรฐาน) ──
// fail-closed: อ่านไฟล์ไม่ได้/ไม่มีไฟล์ = ทุก flag ปิด (พลาดแล้วปลอดภัย)
const FLAGS_PATH = path.join(path.dirname(STORE), 'platform_flags.json');
let FLAGS = {};
try { FLAGS = JSON.parse(fs.readFileSync(FLAGS_PATH, 'utf8')).flags || {}; } catch (e) { FLAGS = {}; }

// ── Coverage Baseline (ratchet) — รายชื่อ gap เดิมที่ grandfathered ──
// กติกา: การอ้างอิงใหม่ที่ไม่มี family ในทะเบียน = ERROR (ต้องอ่านเข้าทะเบียนก่อน)
//        รายการใน baseline = warning + คิว (กองเก่ามีแต่ลด — ห้ามเพิ่มเข้า baseline โดยไม่มีเหตุผลใน PR)
// fail-strict: ไม่มีไฟล์ baseline = ทุก gap เป็น error
const BASELINE_PATH = path.join(path.dirname(STORE), 'coverage_baseline.json');
let BASELINE = new Set();
try { BASELINE = new Set(JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).grandfathered || []); } catch (e) {}
function famFor(str) {
  for (const fam of REGISTRY.families) {
    try { if (new RegExp(fam.match, 'i').test(str)) return fam; } catch (e) {}
  }
  return null;
}

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
const coverageGaps = new Map(); // std string → [topic ids] ที่อ้างแต่ไม่มี family ในทะเบียน

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

  // ── G8: INTERNAL_DOC LOCK — ตัวเลือกตั้งไว้รอ ห้ามใช้จริงจนกว่า flag เปิดผ่าน PR ──
  const internalSrcs = (t.source_chain || []).filter(s => s.source_type === 'internal_doc');
  if (internalSrcs.length > 0 && FLAGS.internal_doc_enabled !== true)
    hard(id, 'G8_INTERNAL_LOCKED', `ใช้ source_type "internal_doc" ${internalSrcs.length} รายการ แต่ internal_doc_enabled=false — การเปิดใช้ต้องแก้ platform_flags.json ผ่าน PR (human approval) ก่อน`);
  if (internalSrcs.length > 0 && FLAGS.internal_doc_enabled === true) {
    for (const s of internalSrcs) {
      if (!s.owner_org || !s.doc_id) hard(id, 'G8_INTERNAL_SCHEMA', `internal_doc ต้องมี owner_org + doc_id (${s.source_id || '?'})`);
      if (s.excerpt) hard(id, 'G8_INTERNAL_PRIVACY', `internal_doc "${s.source_id || '?'}" มี excerpt — ห้ามใส่ข้อความจากเอกสารภายในลง repo สาธารณะ (ใช้ doc_id+checksum อ้างแทน)`);
    }
  }

  // ── G3: AUTHORITY + CONSENSUS (HARD สำหรับ L0/L1) ──
  // กติกาถาวร: internal_doc ไม่นับเป็นแหล่ง credibility/consensus ของ L1 — ตรวจทานสาธารณะไม่ได้ ให้เป็นบริบทเสริมเท่านั้น
  if (['L0', 'L1'].includes(t.knowledge_layer)) {
    const chain = (t.source_chain || []).filter(s => s.source_type !== 'internal_doc');
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

  // ── G5: STANDARDS LIFECYCLE REGISTRY ──
  const allStdText = (t.applicable_standards || []).join(' | ');
  for (const std of t.applicable_standards || []) {
    let matchedFam = false;
    for (const fam of REGISTRY.families) {
      let famRe;
      try { famRe = new RegExp(fam.match, 'i'); } catch (e) { continue; }
      if (!famRe.test(std)) continue;
      matchedFam = true;

      // INTERNAL visibility: ตัวเลือกที่จงใจพักไว้ — ไม่ประเมิน lifecycle, การใช้เป็นหลักฐานคุมโดย G8
      if (fam.visibility === 'INTERNAL') {
        warnings.push(`[G5_INTERNAL] ${id}: "${std}" — มาตรฐานภายในองค์กร (พักไว้รอเชื่อมต่อฐานข้อมูล; internal_doc_enabled=${FLAGS.internal_doc_enabled === true})`);
        continue;
      }

      // หา edition ที่เวอร์ชันปรากฏใน string ที่อ้าง
      let ed = (fam.editions || []).find(e => std.includes(e.version));
      if (!ed) {
        // มี token ที่ "หน้าตาเป็นเวอร์ชัน" จริงไหม (ปี ค.ศ./พ.ศ. หรือ x.y) — เลขมาตรฐานอย่าง 5280 ไม่นับ
        const hasVersionToken = extractYears(std).length > 0 || /\d+\.\d+/.test(std);
        if (hasVersionToken) {
          report(isLegacy, id, 'G5_VERSION', `โปรดตรวจสอบฉบับของ "${std}" — ฉบับที่ทะเบียนรับรองคือ ${(fam.editions || []).map(e => e.version).join('/')} (${fam.display}) · อาจต้องใช้ฉบับปัจจุบัน หรือระบุว่ากฎหมายไทยกำหนดให้ใช้ฉบับใดไว้`);
          continue;
        }
        // อ้างระดับตระกูลโดยไม่ระบุเวอร์ชัน — ถ้าทะเบียนมี edition เดียว ใช้ตัวนั้นประเมิน
        if ((fam.editions || []).length === 1) ed = fam.editions[0];
        else continue;
      }

      switch (ed.status) {
        case 'CURRENT':
        case 'CONFIRMED':
        case 'PINNED_BY_THAI_LAW':
          break; // ผ่าน
        case 'TO_BE_REVISED':
          warnings.push(`[G5_LIFECYCLE] ${id}: "${std}" — ผู้ออกประกาศว่ากำลังจะมีฉบับใหม่ (TO_BE_REVISED) → เข้าคิวเตรียม re-verify`);
          break;
        case 'TRANSITION': {
          const until = ed.transition_until ? Date.parse(ed.transition_until) : null;
          if (until && NOW_MS > until)
            report(isLegacy, id, 'G5_LIFECYCLE', `"${std}" — ช่วงเปลี่ยนผ่านสิ้นสุดแล้ว (${ed.transition_until}) ต้องย้ายไป ${ed.superseded_by || 'ฉบับใหม่'}`);
          else
            warnings.push(`[G5_LIFECYCLE] ${id}: "${std}" — อยู่ช่วงเปลี่ยนผ่านถึง ${ed.transition_until || '(ไม่ระบุ)'}`);
          break;
        }
        case 'WITHDRAWN':
          report(isLegacy, id, 'G5_LIFECYCLE', `"${std}" — ถูกยกเลิกแล้ว (WITHDRAWN) แทนที่โดย ${ed.superseded_by || '?'} | หลักฐาน: ${ed.evidence_url}`);
          break;
        case 'AMENDED': {
          const cited = (ed.amendments || []).some(a => {
            const m = a.match(/Amd\s*\d+|ฉบับที่\s*\d+/i);
            return m ? allStdText.includes(m[0]) : false;
          });
          if (!cited)
            warnings.push(`[G5_AMENDED] ${id}: "${std}" — มีเอกสารแก้ไขเพิ่มเติมที่ควรอ้างคู่กัน: ${(ed.amendments || []).join(', ')}`);
          break;
        }
        case 'PARTIAL_REPEAL':
          warnings.push(`[G5_PARTIAL] ${id}: "${std}" — มีผลยกเลิก/ถูกยกเลิกบางส่วน: ${(ed.notes || '').slice(0, 120)}...`);
          break;
        default:
          warnings.push(`[G5_LIFECYCLE] ${id}: "${std}" — สถานะทะเบียนไม่รู้จัก: ${ed.status}`);
      }

      if (ed.verified === false)
        warnings.push(`[G5_UNVERIFIED] ${id}: "${std}" — รายการทะเบียนยังไม่ถูก verify จากหน้า official (เชื่อได้ระดับความรู้ทั่วไปเท่านั้น)`);
    }

  }

  // ── G5_COVERAGE ขอบเขตเต็ม: applicable_standards + thai_law_refs + std_refs ทุกระดับ ──
  // ระบบต้องเห็นทุกสตริงที่ถูกอ้าง ไม่ใช่รอคนบังเอิญเจอ
  const cited = new Map();
  for (const s of t.applicable_standards || []) cited.set(s, 'applicable_standards');
  for (const s of t.thai_law_refs || []) cited.set(s, 'thai_law_refs');
  for (const r of t.risks || []) for (const cf of r.control_failures || []) for (const ap of cf.audit_procedures || [])
    for (const sr of ap.std_refs || []) { const s = typeof sr === 'string' ? sr : sr.std; if (s) cited.set(s, 'std_refs'); }
  for (const [s, origin] of cited) {
    if (famFor(s)) continue;
    if (!coverageGaps.has(s)) coverageGaps.set(s, { ids: [], origin });
    coverageGaps.get(s).ids.push(id);
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

// ══ VERIFICATION QUEUE — Claim Lifecycle lens เดียวของทั้งระบบ ══
// ทุก claim ที่ไม่อยู่สถานะจบ ต้องโผล่ในคิวนี้ + มี SLA (UNVERIFIED/UNRESOLVED เกิน 60 วัน = block)
const SLA_DAYS = 60;
const queue = [];
function ageDays(d) { return d ? Math.round((NOW_MS - Date.parse(d)) / 86400000) : null; }

// แหล่งที่ 0: coverage gaps — มาตรฐานที่ความรู้อ้างแต่ทะเบียนไม่รู้จัก (เกต G5_COVERAGE + ratchet)
for (const [std, g] of coverageGaps) {
  const ids = [...new Set(g.ids)].join(',');
  if (BASELINE.has(std)) {
    warnings.push(`[G5_COVERAGE] "${std}" (${g.origin}) อ้างใน ${ids} — grandfathered รอ research เข้าทะเบียน`);
    queue.push({ type: 'coverage', ref: `"${std.slice(0, 48)}" (อ้างใน ${ids})`, state: 'UNREGISTERED', age: null,
      todo: 'อ่านแหล่ง official → เพิ่ม family เข้า standards_registry → ลบออกจาก baseline' });
  } else {
    errors.push(`[G5_COVERAGE_NEW] "${std}" (${g.origin}) อ้างใน ${ids} — RATCHET: การอ้างอิงใหม่ต้องอ่านแหล่ง official เข้าทะเบียนก่อน (no new citation without registry family) — ห้ามแก้ด้วยการเพิ่มลง baseline เว้นแต่เป็นของเก่าตกสำรวจพร้อมเหตุผลใน PR`);
  }
}

// แหล่งที่ 1: ทะเบียนมาตรฐาน (verified:false = UNVERIFIED, verified:true แก่เกิน = STALE)
for (const fam of REGISTRY.families) {
  if (fam.visibility === 'INTERNAL') {
    queue.push({ type: 'parked', ref: fam.display, state: 'PARKED', age: null,
      todo: 'รอเปิดใช้ internal_doc_enabled + ตัดสินใจ private-repo split (ไม่มี SLA — พักโดยเจตนา)' });
    continue;
  }
  for (const ed of fam.editions || []) {
    const age = ageDays(ed.last_verified);
    if (ed.verified === false) {
      queue.push({ type: 'registry', ref: `${fam.display} v${ed.version}`, state: 'UNVERIFIED', age,
        todo: (ed.notes || 'เปิดทะเบียน official ของผู้ออก (ดู Publisher Lookup Table ใน SKL021)').slice(0, 90) });
      if (age !== null && age > SLA_DAYS)
        errors.push(`[SLA] ${fam.display} v${ed.version} — UNVERIFIED ค้าง ${age} วัน (เกิน SLA ${SLA_DAYS}) ต้องปิดธงก่อน merge`);
    } else if (age !== null && age > STALE_DAYS) {
      queue.push({ type: 'registry', ref: `${fam.display} v${ed.version}`, state: 'STALE', age, todo: 're-check ทะเบียนผู้ออก' });
      warnings.push(`[REGISTRY_STALE] ${fam.display} v${ed.version} — ไม่ถูกตรวจซ้ำมา ${age} วัน (เกณฑ์ ${STALE_DAYS})`);
    }
  }
}

// แหล่งที่ 2: topics ที่ยังไม่ verify (LEGACY_UNVERIFIED)
for (const t of store.topics) {
  if (t.approval_status === 'LEGACY_UNVERIFIED') {
    queue.push({ type: 'topic', ref: `${t.id} ${t.name_th.slice(0, 30)}`, state: 'UNVERIFIED',
      age: ageDays(t.updated_at), todo: 're-verify ตาม deep-research-protocol' });
  }
}

// แหล่งที่ 3+4: source_universe.json + glossary.json (claim envelope เดียวกัน)
function loadClaimFile(fname, listKey, refFn, todoFn) {
  const p = path.join(path.dirname(STORE), fname);
  if (!fs.existsSync(p)) return null;
  let data;
  try { data = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { errors.push(`[FILE] ${fname} parse ไม่ได้: ${e.message}`); return null; }
  for (const item of data[listKey] || []) {
    const c = item._claim || {};
    if (c.state === 'UNVERIFIED' || c.state === 'UNRESOLVED') {
      const age = ageDays(c.last_checked);
      queue.push({ type: fname.replace('.json',''), ref: refFn(item), state: c.state, age, todo: todoFn(item) });
      if (c.sla_deadline && NOW_MS > Date.parse(c.sla_deadline))
        errors.push(`[SLA] ${fname}: ${refFn(item)} — เกิน SLA ${c.sla_deadline} ต้องปิดธงก่อน merge`);
    }
  }
  return data;
}
loadClaimFile('source_universe.json', 'publishers',
  p => `${p.name} [${(p.governs||[]).join(',')}] coverage:${p.coverage}`,
  p => (p._claim && p._claim.open_question) || `harvest เอกสารหลักจาก ${p.official_register}`);
loadClaimFile('glossary.json', 'terms',
  t => `ศัพท์ "${t.en}" → "${t.th}"`,
  t => (t._claim && t._claim.open_question) || `ยืนยันที่มาศัพท์จาก ${t.term_source}`);

// ── ORG APPLICABILITY (Provenance & Coverage) ──
// นโยบาย: topic ที่ verify ใหม่ (PENDING_REVIEW/APPROVED v2+) ควรมี org_applicability
// ช่วง transition = warning; หลัง backfill PR-D จะยกเป็น error
for (const t of store.topics) {
  const isNewlyVerified = t.approval_status !== 'LEGACY_UNVERIFIED' && parseInt(t.version) >= 2;
  if (isNewlyVerified && !Array.isArray(t.org_applicability))
    warnings.push(`[P_ORG] ${t.id}: ไม่มี org_applicability (transition: จะเป็น error หลัง backfill PR-D) — ไม่มีป้าย=UNIVERSAL ต้องประกาศชัด`);
  // derivation ต่อ procedure (transition-level warning นับรวม)
  let noDeriv = 0, total = 0;
  for (const r of t.risks || []) for (const cf of r.control_failures || []) for (const ap of cf.audit_procedures || []) {
    total++; if (!ap.derivation) noDeriv++;
  }
  if (isNewlyVerified && noDeriv > 0)
    warnings.push(`[P_DERIVATION] ${t.id}: ${noDeriv}/${total} procedures ไม่มี derivation label (READ_SOURCE/EXEMPLAR_GROUNDED/PROFESSIONAL_SYNTHESIS)`);
}

// ── G3_URL_STRUCT: เช็คโครง URL ทุกจุด (offline, deterministic) ──
// ระยะ transition = WARNING (ไม่บล็อก merge) จับ URL ถูกตัด/encode ผิด เช่นเคส pea.co.th
// เมื่อ backfill ครบ → ยกเป็น diff-based ERROR (เฉพาะ URL ใหม่/ที่แก้) ใน PR ถัดไป
(function scanUrlStructure() {
  const seen = new Set();
  const flag = (where, url, reason) => {
    const key = where + '|' + url; if (seen.has(key)) return; seen.add(key);
    warnings.push(`[G3_URL_STRUCT] ${where}: URL โครงผิด (${reason}) → ${url}`);
  };
  for (const fam of REGISTRY.families || [])
    for (const ed of fam.editions || []) {
      if (!ed.evidence_url) continue;
      const c = structuralCheck(ed.evidence_url);
      if (!c.ok) flag('registry:' + fam.family_id + '@' + ed.version, ed.evidence_url, c.reason);
    }
  for (const t of store.topics || [])
    for (const s of t.source_chain || []) {
      if (!s.url) continue;
      const c = structuralCheck(s.url);
      if (!c.ok) flag(t.id + ':' + (s.source_id || '?'), s.url, c.reason);
    }
})();

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
if (queue.length) {
  console.log(`\n── VERIFICATION QUEUE (${queue.length} claims เปิดอยู่ | SLA ${SLA_DAYS} วันสำหรับ UNVERIFIED) ──`);
  queue.sort((a, b) => (b.age || 0) - (a.age || 0)).slice(0, 25).forEach(q =>
    console.log(`  🏳️  [${q.state}] ${q.ref} (ค้าง ${q.age ?? '?'} วัน) → ${q.todo}`));
  if (queue.length > 25) console.log(`  ... และอีก ${queue.length - 25} รายการ`);
  console.log('  กติกา Boy Scout: batch ถัดไปต้องปิดธงจากคิวนี้ ≥2 รายการ (SKL021)');
}
console.log('\n' + (errors.length ? '❌ FAILED — แก้ errors ก่อน merge' : '✅ PASSED — merge ได้ (warnings คืองานค้างของ re-verify)'));
process.exit(errors.length ? 1 : 0);
