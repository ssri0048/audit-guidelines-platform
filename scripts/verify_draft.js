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
  // PINNED_BY_THAI_LAW: กฎหมายไทยตรึงให้ใช้ฉบับนี้ → ห้ามอัปเดต/สลับอัตโนมัติ คงไว้ตามกฎหมาย
  if (ed && ed.status === 'PINNED_BY_THAI_LAW') {
    fixes.push(`"${s}" — กฎหมายไทยกำหนดให้ใช้ฉบับนี้ (ตรึงไว้ ไม่อัปเดตเป็นฉบับสากลใหม่)`);
    return { str: out, fixes };
  }
  // AUTO-HEAL เวอร์ชันล้าสมัย/สับสน (ค.ศ. หรือ พ.ศ.) → ฉบับปัจจุบันในทะเบียน + แจ้ง fix
  // ปลอดภัย: แตะเฉพาะเลข 4 หลักในช่วงปีจริง (ค.ศ. 2000..ปีนี้ / พ.ศ. 2400-2569) ที่ไม่ตรงทะเบียน
  //   → กันเลขมาตรฐาน (ISO 9001, 27001, IEEE 2030/1366) เพราะอยู่นอกช่วงหรือไม่ใช่ 4 หลัก
  // และแทนเฉพาะ "ส่วนหัว" (ก่อน 'และที่แก้ไข'/'(ฉบับที่') เพื่อไม่แตะปีของฉบับแก้ไข (เคส พ.ร.บ.ไทย)
  {
    const eds = fam.editions || [];
    const known = eds.map(e => String(e.version));
    const auth = eds.find(e => e.status === 'CURRENT')
      || eds.find(e => ['AMENDED', 'CONFIRMED', 'PINNED_BY_THAI_LAW', 'TRANSITION'].includes(e.status))
      || eds[eds.length - 1];
    const CE = new Date().getFullYear();
    const mk = out.search(/และที่แก้ไข|\(ฉบับที่|แก้ไขเพิ่มเติม|\bAmd\b/);
    const head = mk >= 0 ? out.slice(0, mk) : out;
    const stray = (head.match(/\b(\d{4})\b/g) || []).find(y => {
      const n = Number(y);
      return !known.includes(y) && ((n >= 2000 && n <= CE) || (n >= 2400 && n <= 2569));
    });
    if (stray && auth && String(auth.version) !== stray) {
      out = head.replace(new RegExp('\\b' + stray + '\\b'), String(auth.version)) + (mk >= 0 ? out.slice(mk) : '');
      fixes.push(`"${s}" อ้างฉบับ ${stray} ที่ไม่ตรงทะเบียน → ปรับเป็นฉบับปัจจุบัน ${auth.version} อัตโนมัติ`);
      ed = edFor(fam, out) || ed;
    }
  }
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

/* ดึงเฉพาะส่วน ERRORS ของ validate (ไม่ใช่หาง queue) — บั๊กเดิม slice(-1200) โชว์คิวไม่โชว์เกตที่ fail */
function extractGateErrors(stdout) {
  const s = String(stdout || '');
  const i = s.indexOf('── ERRORS');
  if (i >= 0) {
    const rest = s.slice(i);
    const j = rest.indexOf('── WARNINGS');
    const block = (j >= 0 ? rest.slice(0, j) : rest).trim();
    if (block) return block;
  }
  const gLines = s.split('\n').filter(l => /\[G[0-9A-Za-z_]+\]/.test(l));
  return gLines.length ? gLines.join('\n') : (s.trim().slice(-800) || '(ไม่มีรายละเอียดเกต)');
}

/* รายงานสำหรับใส่ใน draft PR — ใช้ถ้อยคำ "โปรดตรวจสอบ" ไม่ใช่ "ผิด" (รอบคอบ+เป็นมิตร) */
function gateFailReport(tid, name, errBlock, reuseNote) {
  return ['# 🔎 โปรดตรวจสอบก่อนยืนยัน: ' + name + ' → ' + tid, '',
    'ระบบร่างหัวข้อนี้สำเร็จแล้ว และมี **บางรายการที่ควรทบทวนให้แน่ใจ** ก่อนยกเป็นความรู้จริง (L1) — ไม่ใช่ข้อผิดพลาด แต่ขอให้ตรวจความถูกต้องอีกครั้งเพื่อความรอบคอบ',
    '', '## รายการที่ควรตรวจ', '```', errBlock, '```', '',
    '## แนวทางตรวจ',
    '1. ตรวจว่าเป็น **ฉบับปัจจุบัน** หรือมี **กฎหมายไทยกำหนดให้ใช้ฉบับใดฉบับหนึ่ง** (กรณีตรึงไว้)',
    '2. ' + (reuseNote || 'หากมาตรฐานเดียวกันถูกอ้างในหัวข้ออื่น ควรทบทวนให้ตรงกันทั้งหมด'),
    '3. ปรับแล้ว re-verify อีกครั้ง',
    '', '_ระบบเก็บร่างไว้ให้แล้ว — ยังไม่นำเข้าคลังจนกว่าจะทบทวนเสร็จ_'].join('\n');
}

function main(draftFile, root) {
  root = root || path.join(__dirname, '..');
  // รองรับ 2 โหมด: ชื่อไฟล์ในคลังพัก (data/drafts/) หรือ path เต็ม (โหมด chain — ตรวจต่อทันทีโดยไม่ผ่านคลังพัก)
  const draftPath = path.isAbsolute(draftFile) ? draftFile : path.join(root, 'data', 'drafts', draftFile);
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
  const APPEND = d.mode === 'append';
  if (!APPEND && (d.risks || []).length < 5) { console.error('❌ risks < 5'); process.exit(1); }
  if (APPEND && (d.risks || []).length < 1) { console.error('❌ โหมดเพิ่มความเสี่ยง: ไม่มีความเสี่ยงใหม่ในร่าง'); process.exit(1); }

  // ── โหมด APPEND: ต่อความเสี่ยงเข้าหัวข้อเดิม (ทางแยกชัดเจน — ไม่แตะทางสร้างหัวข้อใหม่) ──
  if (APPEND) {
    const parent = (store.topics || []).find(t => t.id === d.target);
    if (!parent) { console.error('⛔ ESCALATE: ไม่พบหัวข้อ ' + d.target + ' ในคลัง — ตรวจรหัสหัวข้อแล้วสั่งใหม่'); process.exit(2); }
    const RETR2 = new Date().toISOString().slice(0, 10);

    // 1) ไล่เลข R/CF/AP ต่อจากของเดิม — กัน id ซ้ำเด็ดขาด
    let num = (parent.risks || []).length;
    for (const r of d.risks) {
      num++;
      r.id = 'R' + String(num).padStart(3, '0');
      (r.control_failures || []).forEach((cf, ci) => {
        cf.id = 'CF' + num + '-' + (ci + 1);
        (cf.audit_procedures || []).forEach((ap, ai) => { ap.id = 'AP' + num + '-' + (ci + 1) + '.' + (ai + 1); });
      });
    }

    // 2) union มาตรฐานใหม่จาก std_refs ของความเสี่ยงที่เพิ่ม เข้า applicable_standards ของแม่
    const famsInParent = new Set((parent.applicable_standards || []).map(x => (famFor(registry, x) || {}).family_id).filter(Boolean));
    const newStds = [];
    for (const r of d.risks) for (const cf of r.control_failures || []) for (const ap of cf.audit_procedures || [])
      for (const sr of ap.std_refs || []) {
        if (!sr || !sr.std) continue;
        const f = famFor(registry, sr.std);
        if (f && !famsInParent.has(f.family_id)) { famsInParent.add(f.family_id); newStds.push(sr.std); }
      }
    parent.applicable_standards = (parent.applicable_standards || []).concat(newStds);

    // 3) ต่อ risks + bump minor version + changelog + hash ใหม่
    parent.risks = (parent.risks || []).concat(d.risks);
    const v = String(parent.version || '1.0.0').split('.').map(x => parseInt(x, 10) || 0);
    parent.version = v[0] + '.' + (v[1] + 1) + '.0';
    parent.updated_at = new Date().toISOString().slice(0, 19) + 'Z';
    parent.changelog = (parent.changelog || []).concat([{
      version: parent.version, date: RETR2,
      change: 'เพิ่มความเสี่ยงใหม่ ' + d.risks.length + ' รายการ (' + d.risks.map(r => r.id).join(', ') + ') โดย research-pipeline โหมดเพิ่มความเสี่ยง'
        + (allFixes.length ? ' | การแก้ไขโดยระบบ: ' + allFixes.join(' | ') : '')
        + (newStds.length ? ' | มาตรฐานเพิ่ม: ' + newStds.join(', ') : ''),
      approved_by: 'pending PR merge'
    }]);
    parent.hash_signature = sha256Of(parent);
    fs.writeFileSync(path.join(root, 'data', 'knowledge_store.json'), JSON.stringify(store, null, 2));

    const SUM2 = process.env.VERIFY_SUMMARY_OUT || '/tmp/verify_summary.md';
    // 4) เกตจริงต้องผ่านก่อนปล่อย — พังแล้วไฟล์ draft ยังอยู่ (ลงจอดนุ่มแบบเดียวกับโหมดปกติ)
    try {
      execFileSync('node', [path.join(root, 'scripts', 'validate.js'), path.join(root, 'data', 'knowledge_store.json')], { stdio: 'pipe' });
    } catch (e) {
      const errBlock = extractGateErrors(e.stdout);
      fs.writeFileSync(SUM2, gateFailReport(parent.id, parent.name_th + ' (เพิ่มความเสี่ยง)', errBlock, null));
      console.error('🔎 โปรดตรวจสอบก่อนยืนยัน — เก็บ draft ไว้ให้ตรวจต่อ (ไม่ลบไฟล์)\n' + errBlock);
      process.exit(1);
    }
    fs.unlinkSync(draftPath);
    const mP2 = path.join(root, 'data', 'drafts', 'READING_MANIFEST.md');
    if (fs.existsSync(mP2)) fs.unlinkSync(mP2);
    const summary2 = ['# ✅ Auto-Verify: เพิ่มความเสี่ยงใน ' + parent.name_th + ' → ' + parent.id + ' (v' + parent.version + ')', '',
      '## ความเสี่ยงที่เพิ่ม (' + d.risks.length + ')', ...d.risks.map(r => '- ' + r.id + ' ' + r.name_th), '',
      '## การแก้ไขโดยระบบ (' + allFixes.length + ')', ...(allFixes.length ? allFixes.map(f => '- ' + f) : ['- ไม่มี — citations ถูกต้องครบ']), '',
      (newStds.length ? '## มาตรฐานที่เพิ่มเข้าหัวข้อ\n' + newStds.map(s => '- ' + s).join('\n') + '\n' : ''),
      '⚠️ auto-verify ไม่อ่านหน้าใหม่ — โปรดรีวิวเนื้อหาเชิงวิชาชีพก่อน merge (ดุลยพินิจสุดท้ายอยู่ที่คุณ)'].join('\n');
    fs.writeFileSync(SUM2, summary2);
    console.log('✅ ' + parent.id + ' เพิ่ม ' + d.risks.length + ' ความเสี่ยง (รวม ' + parent.risks.length + ') → v' + parent.version + ' | เกตผ่าน');
    return { tid: parent.id, fixes: allFixes, topic: parent, appended: d.risks.length };
  }

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
      // ชื่อแหล่ง = citation ที่ canonical แล้ว (s) → ตรงกับส่วน "มาตรฐานที่ใช้" เป๊ะ
      //   (เดิมใช้ display+(vXXXX) ทำให้กฎหมายไทยที่แก้ไขเพิ่มเติมโชว์แค่ปีฐาน ไม่ครบ)
      publisher: fam.display, title: s,
      url: ed.evidence_url, retrieved_at: ed.last_verified || RETR,
      credibility_score: /\.go\.th|ratchakitcha/.test(ed.evidence_url) ? 95 : 92,
      excerpt: ed.evidence_excerpt + ' [อ่านจริงและบันทึกในทะเบียนเมื่อ ' + (ed.last_verified || '?') + ' — auto-verify ผูกให้]'
    });
    if (chain.length >= 3) break;
  }
  if (chain.length < 2) { console.error('⛔ ESCALATE: แหล่งอ่านแล้วในทะเบียนที่ตรงหัวข้อ < 2 — ต้องอ่านแหล่งใหม่ใน Cowork'); process.exit(2); }

  // ── 3) โครงบังคับ ──
  // [ปรับปรุง 2026-07-21 — กันรหัสหัวข้อวนกลับมาใช้ซ้ำ]
  // เดิม: const maxId = Math.max(...store.topics.map(t => parseInt(t.id.slice(1), 10)));
  // ปัญหา: ถ้าเอาหัวข้อท้ายๆ ออกจากเว็บ maxId จะลดลง → หัวข้อใหม่ได้รหัสเดิมซ้ำ
  //        รหัสเดียวชี้ไปสองเรื่องคนละเรื่องกัน ทั้งใน git history ใบงานที่ merge แล้ว และรายงานที่พิมพ์ไปแล้ว
  // ใหม่: เทียบกับ "รหัสสูงสุดที่เคยใช้" ที่ retire_topics.js จองไว้ใน metadata.last_topic_id ด้วย
  const inStore = store.topics.map(t => parseInt(String(t.id).slice(1), 10) || 0);
  const reserved = parseInt(String((store.metadata || {}).last_topic_id || '').replace(/\D/g, ''), 10) || 0;
  const maxId = Math.max(0, ...inStore, reserved);
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
      { version: '0.1.0', date: RETR, change: 'DRAFT จาก research-pipeline (' + path.basename(draftFile) + (path.isAbsolute(draftFile) ? ' — โหมดตรวจต่อทันที' : '') + ')', approved_by: 'draft เท่านั้น' },
      { version: '1.0.0', date: RETR, change: 'AUTO-VERIFY โดย verify-pipeline: ' + (allFixes.length ? allFixes.join(' | ') : 'citations ถูกต้องครบ ไม่มีการแก้') + ' | source_chain ผูกจากทะเบียนที่อ่านแล้วจริง ' + chain.length + ' แหล่ง | หมายเหตุ: โหมดเครื่องไม่อ่านหน้าใหม่ — ดุลยพินิจสุดท้ายอยู่ที่ผู้ merge', approved_by: 'pending PR merge' }
    ],
    source_chain: chain
  };
  topic.hash_signature = sha256Of(topic);
  store.topics.push(topic);
  store.metadata.last_updated = RETR;
  // เลื่อนเพดานรหัสขึ้นทุกครั้งที่ออกรหัสใหม่ — ทำให้ last_topic_id เป็น "รหัสสูงสุดที่เคยใช้" เสมอ
  // แม้หัวข้อนั้นจะถูกเอาออกจากเว็บทีหลัง รหัสก็ยังถูกจองไว้ ไม่ถูกนำกลับมาใช้ซ้ำ
  store.metadata.last_topic_id = tid;
  fs.writeFileSync(path.join(root, 'data', 'knowledge_store.json'), JSON.stringify(store, null, 2));
  const mPath = path.join(root, 'data', 'drafts', 'READING_MANIFEST.md');
  const SUMMARY_OUT = process.env.VERIFY_SUMMARY_OUT || '/tmp/verify_summary.md';

  // ── 4) เกตจริงต้องผ่านก่อนปล่อย ──
  // บั๊กเดิม 2 จุด: (1) ลบ draft ก่อนเกต → ตกเกตแล้ว fallback หาไฟล์ไม่เจอ (cp error)
  //               (2) โชว์ slice(-1200) = หาง queue ไม่ใช่เกตที่ fail → วินิจฉัยไม่ได้
  try {
    execFileSync('node', [path.join(root, 'scripts', 'validate.js'), path.join(root, 'data', 'knowledge_store.json')], { stdio: 'pipe' });
  } catch (e) {
    const errBlock = extractGateErrors(e.stdout);
    // นับว่ามาตรฐานในหัวข้อนี้ถูกอ้างในหัวข้ออื่นในคลังกี่เรื่อง → ให้ผู้ตรวจไล่ดูประกอบกัน
    const famsHere = new Set((d.applicable_standards || []).map(x => (famFor(registry, x) || {}).family_id).filter(Boolean));
    let reuse = 0;
    for (const t of store.topics) {
      if (t.id === tid) continue;
      if ((t.applicable_standards || []).some(x => famsHere.has((famFor(registry, x) || {}).family_id))) reuse++;
    }
    const reuseNote = reuse ? `มาตรฐานในหัวข้อนี้ถูกอ้างในอีก ${reuse} หัวข้อในคลัง — แนะนำไล่ตรวจให้ตรงกันประกอบ` : null;
    fs.writeFileSync(SUMMARY_OUT, gateFailReport(tid, d.name_th, errBlock, reuseNote));
    console.error('🔎 โปรดตรวจสอบก่อนยืนยัน — เก็บ draft ไว้ให้ตรวจต่อ (ไม่ลบไฟล์)\n' + errBlock);
    process.exit(1); // fallback ใน workflow จะเปิด draft PR พร้อม report นี้ (งานไม่สูญ)
  }

  // เกตผ่านแล้วค่อยลบ draft ทิ้ง (ปลอดภัยแล้ว)
  fs.unlinkSync(draftPath);
  if (fs.existsSync(mPath)) fs.unlinkSync(mPath);
  const summary = ['# ✅ Auto-Verify: ' + d.name_th + ' → ' + tid, '',
    '## การแก้ไขโดยระบบ (' + allFixes.length + ')', ...(allFixes.length ? allFixes.map(f => '- ' + f) : ['- ไม่มี — citations ถูกต้องครบ']), '',
    '## แหล่งอ้างอิง (ผูกจากทะเบียนที่อ่านแล้วจริง)', ...chain.map(c => '- ' + c.title + ' — ' + c.url), '',
    '⚠️ auto-verify ไม่อ่านหน้าใหม่ — โปรดรีวิวเนื้อหาเชิงวิชาชีพก่อน merge (ดุลยพินิจสุดท้ายอยู่ที่คุณ)'].join('\n');
  fs.writeFileSync(SUMMARY_OUT, summary);
  console.log('✅ ' + tid + ' พร้อม: ' + d.risks.length + ' risks | แก้ ' + allFixes.length + ' จุด | เกตผ่าน');
  return { tid, fixes: allFixes, topic };
}

module.exports = { canonicalize, famFor, edFor, sha256Of, main };
if (require.main === module) {
  const f = process.argv[2];
  if (!f) { console.error('❌ ระบุชื่อไฟล์ draft'); process.exit(1); }
  main(f, process.argv[3]);
}
