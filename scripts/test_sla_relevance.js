#!/usr/bin/env node
/**
 * test_sla_relevance.js — พิสูจน์กติกา SLA แบบใหม่ ว่าผ่อนถูกจุดและยังกันของสำคัญไว้ครบ
 *
 * สิ่งที่ต้องเป็นจริงเสมอ:
 *   1) ธงเกินกำหนดที่ "มีหัวข้ออ้างอยู่"   → ยังบล็อก merge เหมือนเดิม (ความรู้บนเว็บห้ามขาดหลักฐาน)
 *   2) ธงเกินกำหนดที่ "ไม่มีใครอ้าง"       → ไม่บล็อก แต่ต้องโผล่ในบันทึกค้างสะสม (ห้ามเงียบหาย)
 *   3) ratchet (G5_COVERAGE_NEW)          → ยังบล็อกเต็มที่ ห้ามผ่อน
 *   4) ปีอนาคต (G4_HALLUCINATION)         → ยังบล็อกเต็มที่ ห้ามผ่อน
 *   5) ข้อมูลจริงของโปรเจค                 → ผลต้องเหมือน baseline (ไม่พังของเดิม)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VALIDATE = path.join(__dirname, 'validate.js');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✔ ' + msg); } else { fail++; console.log('  ✘ ' + msg); } }

function run(dir) {
  try {
    const out = execFileSync('node', [VALIDATE, path.join(dir, 'knowledge_store.json')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

// ── สร้างชุดข้อมูลทดสอบ: ทะเบียนมีมาตรฐานค้างเกิน SLA 1 ตัว ──
// หมายเหตุ: หัวข้อทดสอบต้องมี field ครบตาม G1_SCHEMA และ hash ตรงเนื้อหา ไม่งั้นจะไปตกเกตอื่นแทน
// ทำให้เทสต์วัดผิดเรื่อง — จึงคำนวณ hash ด้วยสูตรเดียวกับ validate.js (ขึ้นกับ id/name_th/category/risks เท่านั้น
// ไม่ขึ้นกับ applicable_standards จึงสลับมาตรฐานที่อ้างได้อิสระ)
const crypto = require('crypto');
function stableStringify(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}';
}
function hashOf(t) {
  const c = { id: t.id, name_th: t.name_th, category: t.category || '', risks: t.risks || [] };
  return 'sha256:' + crypto.createHash('sha256').update(stableStringify(c), 'utf8').digest('hex');
}
const RISKS = [1, 2, 3, 4, 5].map(n => ({
  id: 'R00' + n, name_th: 'ความเสี่ยงทดสอบ ' + n, description_th: 'คำอธิบาย',
  level: 'MEDIUM', likelihood: 3, impact: 3, severity: 'MEDIUM',
  control_failures: [{
    id: 'CF' + n + '-1', name_th: 'จุดควบคุมบกพร่อง',
    audit_procedures: [{
      id: 'AP' + n + '-1.1', name_th: 'วิธีตรวจ', method: 'INSPECTION', derivation: 'READ_SOURCE',
      evidence_types: [1, 2, 3, 4].map(m => ({ id: 'EV' + n + '-' + m, name_th: 'หลักฐานชิ้นที่ ' + m }))
    }]
  }]
}));
const OLD = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10);
function fixture(topicCitesIt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sla-'));
  fs.writeFileSync(path.join(dir, 'standards_registry.json'), JSON.stringify({
    metadata: { staleness_threshold_days: 183 },
    families: [
      { family_id: 'iso-9001', display: 'ISO 9001', match: 'ISO\\s*9001',
        editions: [{ version: '2015', status: 'CURRENT', verified: true, last_verified: '2026-07-01',
          evidence_url: 'https://www.iso.org/standard/62085.html', evidence_excerpt: 'ISO 9001:2015',
          excerpt_verbatim: 'ISO 9001:2015', link_status: { state: 'READ_VERIFIED', checked_at: '2026-07-01' } }] },
      { family_id: 'ghost-std', display: 'มาตรฐานที่ยังไม่ยืนยัน', match: 'GhostStandard',
        editions: [{ version: '2020', status: 'CURRENT', verified: false, last_verified: OLD,
          notes: 'หาหน้าทางการไม่เจอ' }] }
    ]
  }, null, 2));
  const stds = ['ISO 9001:2015'];
  if (topicCitesIt) stds.push('GhostStandard 2020');
  const topic = {
    id: 'T001', name_th: 'หัวข้อทดสอบ', name_en: 'Test Topic', category: 'ทดสอบ', priority: 'MEDIUM',
    knowledge_id: 'KN-T001', version: '1.0.0', knowledge_layer: 'L1', approval_status: 'APPROVED',
    org_applicability: ['UNIVERSAL'], applicable_standards: stds,
    // G3 ต้องการ ≥2 แหล่งอิสระ · มี credibility ≥90 อย่างน้อย 1 · ทุกแหล่งมี url + excerpt
    source_chain: [
      { id: 'S1', title: 'ISO 9001', url: 'https://www.iso.org/standard/62085.html',
        credibility_score: 95, excerpt: 'ISO 9001:2015 Quality management systems — Requirements' },
      { id: 'S2', title: 'ISO Online Browsing Platform', url: 'https://www.iso.org/obp/ui/#iso:std:iso:9001:ed-5:v1:en',
        credibility_score: 95, excerpt: 'Quality management systems — Requirements' }
    ],
    changelog: [{ version: '1.0.0', date: '2026-07-01', change: 'สร้างเพื่อทดสอบ' }],
    created_at: '2026-07-01', updated_at: '2026-07-01', risks: RISKS
  };
  topic.hash_signature = hashOf(topic);
  fs.writeFileSync(path.join(dir, 'knowledge_store.json'),
    JSON.stringify({ metadata: { version: '1.0.0' }, topics: [topic] }, null, 2));
  return dir;
}

console.log('── 1) ธงเกินกำหนด แต่ไม่มีหัวข้อไหนอ้าง → ต้องไม่บล็อก ──');
{
  const d = fixture(false);
  const r = run(d);
  ok(r.code === 0, 'merge ได้ (exit 0) — ธงเก่าไม่ขวางงานใหม่');
  ok(/SLA_BACKLOG/.test(r.out), 'ขึ้นเป็นคำเตือน SLA_BACKLOG ไม่ใช่ error');
  ok(/บันทึกรายการค้างสะสม/.test(r.out), 'มีบล็อกสรุปรายการค้างสะสม — ไม่เงียบหาย');
  ok(/มาตรฐานที่ยังไม่ยืนยัน v2020 — ค้าง \d+ วัน/.test(r.out), 'ระบุอายุที่ค้างชัดเจน');
  ok(!/❌ \[SLA\]/.test(r.out), 'ไม่มี error SLA');
}

console.log('\n── 2) ธงเกินกำหนด และมีหัวข้ออ้างอยู่ → ต้องบล็อกเหมือนเดิม ──');
{
  const d = fixture(true);
  const r = run(d);
  ok(r.code !== 0, 'merge ไม่ได้ (exit ≠ 0) — ความรู้ที่เผยแพร่แล้วห้ามขาดหลักฐาน');
  ok(/\[SLA\].*มีหัวข้ออ้างอยู่ \(T001\)/.test(r.out), 'error ระบุชัดว่าหัวข้อไหนอ้างอยู่');
  ok(!/SLA_BACKLOG/.test(r.out), 'ไม่ถูกลดชั้นไปเป็น backlog');
}

console.log('\n── 3) ratchet ต้องยังบล็อกเต็มที่ (ห้ามผ่อน) ──');
{
  const d = fixture(false);
  const s = JSON.parse(fs.readFileSync(path.join(d, 'knowledge_store.json'), 'utf8'));
  s.topics[0].applicable_standards.push('มาตรฐานที่ไม่มีในทะเบียนเลย 2024');
  fs.writeFileSync(path.join(d, 'knowledge_store.json'), JSON.stringify(s, null, 2));
  const r = run(d);
  ok(r.code !== 0, 'อ้างมาตรฐานนอกทะเบียน → merge ไม่ได้');
  ok(/G5_COVERAGE_NEW/.test(r.out), 'ยิงเกต ratchet ถูกต้อง');
}

console.log('\n── 4) ปีอนาคตต้องยังบล็อกเต็มที่ (ห้ามผ่อน) ──');
{
  const d = fixture(false);
  const s = JSON.parse(fs.readFileSync(path.join(d, 'knowledge_store.json'), 'utf8'));
  s.topics[0].applicable_standards.push('ISO 9001:2099');
  fs.writeFileSync(path.join(d, 'knowledge_store.json'), JSON.stringify(s, null, 2));
  const r = run(d);
  ok(r.code !== 0, 'อ้างมาตรฐานปีอนาคต → merge ไม่ได้');
  ok(/G4_HALLUCINATION/.test(r.out), 'ยิงเกตกันการแต่งข้อมูลถูกต้อง');
}

console.log('\n── 5) ข้อมูลจริงของโปรเจค ต้องยังผ่านเหมือนเดิม ──');
{
  const r = run(path.join(ROOT, 'data'));
  ok(r.code === 0, 'validate ข้อมูลจริง PASSED เหมือน baseline');
  ok(/✅ PASSED/.test(r.out), 'ข้อความสรุปยังเป็น PASSED');
  ok(/VERIFICATION QUEUE/.test(r.out), 'คิวธงยังทำงานเหมือนเดิม');
}

console.log(`\n${fail ? '❌' : '✅'} ผล: ผ่าน ${pass} / ตก ${fail}`);
process.exit(fail ? 1 : 0);
