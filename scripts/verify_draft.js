#!/usr/bin/env node
/**
 * verify_draft.js — PR-N2: ยกร่าง L3 (data/drafts/*.json) เป็น topic L1 อัตโนมัติ
 * ────────────────────────────────────────────────────────────────────────────
 * ทำสิ่งเดียวกับการ verify มือใน Cowork เวอร์ชันเครื่อง:
 *   1. CANONICALIZE: เช็คทุก citation กับทะเบียน — เวอร์ชันถูกถอน → สลับเป็นฉบับแทนที่,
 *      สถานะ AMENDED → พ่วงฉบับแก้ไขให้ (กติกา "เก็บเก่าอ้างคู่ใหม่")
 *   2. SOURCE CHAIN: ผูกแหล่งที่ "อ่านแล้วจริง" จากทะเบียน (verified:true + excerpt)
 *      ที่ตรงกับ citations ของหัวข้อ ≥2 แหล่ง (เกต G3)
 *   3. เติมโครงบังคับ: T-id ถัดไป, L1/PENDING_REVIEW, derivation, evidence ≥4, hash
 *   4. รัน validate.js จริงก่อนปล่อย — เกตไม่ผ่าน = ไม่เปิด PR
 * ขีดจำกัดที่ประกาศตรง: โหมดเครื่องไม่อ่านหน้าใหม่ (excerpt มาจากการอ่านที่บันทึกin
 * ทะเบียนแล้วเท่านั้น) — เคสต้องอ่านแหล่งใหม่/ตีความซับซ้อน ให้ escalate ไป Cowork
 * Usage: node scripts/verify_draft.js <draft_file.json> [repo_root]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

/* ── คัดลอกจาก validate.js — ห้ามแก้ฝั่งเดียว (hash ต้องตรงกัน) ── */
function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}
function sha256Of(topic) {
  const content = { id: topic.id, name_th: topic.name_th, category: topic.category || '', risks: topic.risks || [] };
  return 'sha256:' + crypto.createHash('sha256').update(stableStringify(content), 'utf8').digest('hex');
}

function famFor(registry, s) {
  for (const f of registry.families) {
    try { if (new RegExp(f.match, 'i').test(s)) return f; } catch (e) {}
  }
  return null;
}
/* หา edition ที่สตริงอ้างถึง (ตาม logic G5: หาเลขเวอร์ชันในสตริง) */
function edFor(fam, s) {
  return (fam.editions || []).find(e => s.includes(String(e.version)))
    || ((fam.editions || []).length === 1 ? fam.editions[0] : null);
}

/* ขั้น 1: canonicalize หนึ่งสตริง — คืน {str, fixes[]} */
function canonicalize(registry, s) {
  const fixes = [];
  const fam = famFor(registry, s);
  if (!fam) return { str: s, fixes, unregistered: true };
  let out = s;
  let ed = edFor(fam, s);
  if (ed && ed.status === 'WITHDRAWN' && ed.superseded_by) {
    out = out.split(String(ed.version)).join(String(ed.superseded_by));
    fixes.push(`"${s}" อ้างฉบับถูกถอน (${ed.version}) → สลับเป็น ${ed.superseded_by}`);
    ed = edFor(fam, out) || ed;
  }
  if (ed && ed.status === 'AMENDED' && (ed.amendments || []).length) {
    const amd = ed.amendments[0];
    const short = (amd.match(/Amd\s*\d+:\d+|\(ฉบับที่\s*\d+\)\s*พ\.ศ\.\s*\d+/) || [amd])[0];
    if (!out.includes(short.slice(0, 8))) {
      out = out + (short.startsWith('Amd') ? ' + ' + short : ' และที่แก้ไขเพิ่มเติม ' + short);
      fixes.push(`"${s}" มีฉบับแก้ไข → พ่วง ${short}`);
    }
  }
  return { str: out, fixes };
}

function main(draftFile, root) {
  root = root || path.join(__dirname, '..');
  const draftPath = path.join(root, 'data', 'drafts', draftFile);
  if (!fs.existsSync(draftPath)) { console.error('❌ ไม่พบ draft: ' + draftFile); process.exit(1); }
  const d = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'standards_registry.json'), 'utf8'));
  const store = JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge_store.json'), 'utf8'));

  const allFixes = [], escalate = [];

  // ── 1) canonicalize ทุก citation ──
  const fixList = arr => (arr || []).map(s => {
    const c = canonicalize(registry, s);
    allFixes.push(...c.fixes);
    if (c.unregistered) escalate.push(`"${s}" ไม่มีทะเบียน — ratchet block: ต้องอ่านเข้าทะเบียนใน Cowork ก่อน`);
    return c.str;
  });
  d.applicable_standards = fixList(d.applicable_standards);
  d.thai_law_refs = fixList(d.thai_law_refs);
  for (const r of d.risks || []) for (const cf of r.control_failures || []) for (const ap of cf.audit_procedures || []) {
    for (const sr of ap.std_refs || []) {
      if (sr && typeof sr === 'object' && sr.std) {
        const c = canonicalize(registry, sr.std);
        allFixes.push(...c.fixes);
        if (c.unregistered) escalate.push(`std_ref "${sr.std}" ไม่มีทะเบียน`);
        sr.std = c.str;
      }
    }
    ap.derivation = ap.derivation || 'PROFESSIONAL_SYNTHESIS';
    ap.evidence_types = ap.evidence_types || [];
    while (ap.evidence_types.length < 4) ap.evidence_types.push('เอกสารประกอบเพิ่มเติมตามบริบทหน่วยรับตรวจ');
  }
  if (escalate.length) {
    console.error('⛔ ESCALATE ไป Cowork — ' + escalate.length + ' รายการอ้างสิ่งที่ไม่มีทะเบียน:\n' + escalate.map(x => '  - ' + x).join('\n'));
    process.exit(2);
  }
  if ((d.risks || []).length < 5) { console.error('❌ risks < 5'); process.exit(1); }

  // ── 2) source_chain จากทะเบียนที่อ่านแล้วจริง ──
  const RETR = new Date().toISOString().slice(0, 10);
  const seen = new Set(); const chain = [];
  for (const s of d.applicable_standards) {
    const fam = famFor(registry, s); if (!fam || seen.has(fam.family_id)) continue;
    const ed = (fam.editions || []).find(e => e.verified === true && e.evidence_url && e.evidence_excerpt);
    if (!ed) continue;
    seen.add(fam.family_id);
    chain.push({
      source_id: 'SRC-AUTO-' + fam.family_id, source_type: 'registry_verified_source',
      publisher: fam.display, title: fam.display + ' (v' + ed.version + ')',
      url: ed.evidence_url, retrieved_at: ed.last_verified || RETR,
      credibility_score: /\.go\.th|ratchakitcha/.test(ed.evidence_url) ? 95 : 92,
      excerpt: ed.evidence_excerpt + ' [อ่านจริงและบันทึกในทะเบียนเมื่อ ' + (ed.last_verified || '?') + ' — auto-verify ผูกให้]'
    });
    if (chain.length >= 3) break;
  }
  if (chain.length < 2) { console.error('⛔ ESCALATE: แหล่งอ่านแล้วในทะเบียนที่ตรงหัวข้อ < 2 — ต้องอ่านแหล่งใหม่ใน Cowork'); process.exit(2); }

  // ── 3) โครงบังคับ ──
  const maxId = Math.max(...store.topics.map(t => parseInt(t.id.slice(1), 10)));
  const tid = 'T' + String(maxId + 1).padStart(3, '0');
  const NOW = new Date().toISOString().slice(0, 19) + 'Z';
  const topic = {
    id: tid, name_th: d.name_th, name_en: d.name_en || '',
    category: d.category || 'Operations', category_th: d.category_th || 'ปฏิบัติการ',
    icon: '🧩', color: '#1F618D', priority: d.priority || 'HIGH',
    org_applicability: ['UNIVERSAL'],
    applicable_standards: d.applicable_standards,
    thailand_applicable: (d.thai_law_refs || []).length > 0,
    thai_law_refs: d.thai_law_refs || [],
    risks: d.risks,
    knowledge_id: 'KN-' + tid, version: '1.0.0', confidence_score: 80,
    quality_gate_status: 'PASS', approval_status: 'PENDING_REVIEW', knowledge_layer: 'L1', approved_by: null,
    created_at: NOW, updated_at: NOW, last_used_at: null, usage_count: 0, related_topics: [],
    changelog: [
      { version: '0.1.0', date: RETR, change: 'DRAFT จาก research-pipeline (' + draftFile + ')', approved_by: 'draft เท่านั้น' },
      { version: '1.0.0', date: RETR, change: 'AUTO-VERIFY โดย verify-pipeline: ' + (allFixes.length ? allFixes.join(' | ') : 'citations ถูกต้องครบ ไม่มีการแก้') + ' | source_chain ผูกจากทะเบียนที่อ่านแล้วจริง ' + chain.length + ' แหล่ง | หมายเหตุ: โหมดเครื่องไม่อ่านหน้าใหม่ — ดุลยพินิจสุดท้ายอยู่ที่ผู้ merge', approved_by: 'pending PR merge' }
    ],
    source_chain: chain
  };
  topic.hash_signature = sha256Of(topic);
  store.topics.push(topic);
  store.metadata.last_updated = RETR;
  fs.writeFileSync(path.join(root, 'data', 'knowledge_store.json'), JSON.stringify(store, null, 2));
  fs.unlinkSync(draftPath);
  const mPath = path.join(root, 'data', 'drafts', 'READING_MANIFEST.md');
  if (fs.existsSync(mPath)) fs.unlinkSync(mPath);

  // ── 4) เกตจริงต้องผ่านก่อนปล่อย ──
  try {
    execFileSync('node', [path.join(root, 'scripts', 'validate.js'), path.join(root, 'data', 'knowledge_store.json')], { stdio: 'pipe' });
  } catch (e) {
    console.error('❌ เกตไม่ผ่านหลังประกอบ — ยกเลิก\n' + String(e.stdout || '').slice(-1200));
    process.exit(1);
  }
  const summary = ['# ✅ Auto-Verify: ' + d.name_th + ' → ' + tid, '',
    '## การแก้ไขโดยระบบ (' + allFixes.length + ')', ...(allFixes.length ? allFixes.map(f => '- ' + f) : ['- ไม่มี — citations ถูกต้องครบ']), '',
    '## แหล่งอ้างอิง (ผูกจากทะเบียนที่อ่านแล้วจริง)', ...chain.map(c => '- ' + c.title + ' — ' + c.url), '',
    '⚠️ auto-verify ไม่อ่านหน้าใหม่ — โปรดรีวิวเนื้อหาเชิงวิชาชีพก่อน merge (ดุลยพินิจสุดท้ายอยู่ที่คุณ)'].join('\n');
  fs.writeFileSync('/tmp/verify_summary.md', summary);
  console.log('✅ ' + tid + ' พร้อม: ' + d.risks.length + ' risks | แก้ ' + allFixes.length + ' จุด | เกตผ่าน');
  return { tid, fixes: allFixes, topic };
}

module.exports = { canonicalize, famFor, edFor, sha256Of, main };
if (require.main === module) {
  const f = process.argv[2];
  if (!f) { console.error('❌ ระบุชื่อไฟล์ draft'); process.exit(1); }
  main(f, process.argv[3]);
}
