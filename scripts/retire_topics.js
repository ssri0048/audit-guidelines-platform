#!/usr/bin/env node
/**
 * retire_topics.js — เอาหัวข้อออกจากเว็บโดยไม่ทำลายรอยตรวจสอบ
 *
 * ทำไมไม่ "ลบ" ตรงๆ:
 *   1) verify_draft ออกรหัสจาก max(id ที่มีอยู่)+1 → ลบตัวท้ายแล้วรหัสจะวนกลับมาใช้ซ้ำ
 *      รหัสเดียวชี้ไปสองเรื่องคนละเรื่อง = รอยตรวจสอบขาด และไม่มีอะไรเตือน
 *   2) 18/28 หัวข้อมี related_topics อ้างกันไปมา ลบแล้วเหลือรหัสชี้ไปที่ว่างแบบเงียบ
 *   3) ไม่มีบันทึกว่าใครเอาออกเพราะอะไร — ผิดหลักงานตรวจสอบ
 *
 * วิธีนี้จึง "ย้ายเข้าคลังเก็บถาวร" แทน:
 *   - หายจากเว็บทันที (เว็บอ่านเฉพาะ knowledge_store.json)
 *   - เกตคุณภาพไม่วิ่งบนหัวข้อที่เลิกใช้แล้ว
 *   - รหัสถูกจองไว้ถาวรผ่าน metadata.last_topic_id
 *   - ย้ายกลับได้ด้วย --restore
 *
 * ใช้งาน:
 *   node scripts/retire_topics.js T019,T020 --reason "ทดสอบระบบ ไม่ใช่ความรู้จริง" --by "ชื่อผู้สั่ง"
 *   node scripts/retire_topics.js --restore T019
 *   node scripts/retire_topics.js --list
 *
 * exit code: 0 = สำเร็จ · 1 = ข้อมูลนำเข้าไม่ถูกต้อง/เกตไม่ผ่าน · 2 = ไม่พบหัวข้อที่ระบุ
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STORE_PATH = path.join(ROOT, 'data', 'knowledge_store.json');
const ARCHIVE_PATH = path.join(ROOT, 'data', 'retired_topics.json');
const MAX_PER_RUN = 15;   // กันสั่งพลาดครั้งเดียวหายทั้งคลัง

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
const today = () => new Date().toISOString().slice(0, 10);

function loadArchive() {
  if (!fs.existsSync(ARCHIVE_PATH)) {
    return {
      metadata: {
        purpose: 'หัวข้อที่ถูกเอาออกจากเว็บแล้ว — เก็บไว้เพื่อรอยตรวจสอบและกันรหัสถูกใช้ซ้ำ',
        note: 'เว็บไม่อ่านไฟล์นี้ และเกตคุณภาพไม่ตรวจเนื้อหาในนี้ · ย้ายกลับได้ด้วย retire_topics.js --restore',
        schema_version: '1.0.0'
      },
      retired: []
    };
  }
  return readJson(ARCHIVE_PATH);
}

/** รหัสสูงสุดที่ "เคยใช้" — รวมทั้งที่อยู่ในคลัง ที่เก็บถาวร และที่บันทึกไว้ใน metadata */
function highWaterMark(store, archive) {
  const nums = [];
  for (const t of store.topics || []) nums.push(parseInt(String(t.id).slice(1), 10) || 0);
  for (const r of archive.retired || []) nums.push(parseInt(String(r.topic.id).slice(1), 10) || 0);
  nums.push(parseInt(store.metadata && store.metadata.last_topic_id ? String(store.metadata.last_topic_id).replace(/\D/g, '') : 0, 10) || 0);
  return Math.max(0, ...nums);
}

function runGate() {
  try {
    execFileSync('node', [path.join(ROOT, 'scripts', 'validate.js'), STORE_PATH], { stdio: 'pipe' });
    return { ok: true, out: '' };
  } catch (e) {
    return { ok: false, out: (e.stdout || '').toString() + (e.stderr || '').toString() };
  }
}

/** ตัดการอ้างถึงหัวข้อที่ถูกเอาออก ไม่ให้เหลือรหัสชี้ไปที่ว่าง */
function cleanRelated(store, removedIds) {
  const touched = [];
  for (const t of store.topics) {
    const before = t.related_topics || [];
    if (!before.length) continue;
    const after = before.filter(r => !removedIds.includes(r));
    if (after.length === before.length) continue;
    const dropped = before.filter(r => removedIds.includes(r));
    t.related_topics = after;
    t.changelog = t.changelog || [];
    const [a, b, c] = String(t.version || '1.0.0').split('.').map(Number);
    t.version = [a, b, (c || 0) + 1].join('.');
    t.changelog.push({
      version: t.version, date: today(),
      change: 'ตัดการอ้างถึงหัวข้อที่ถูกเอาออกจากเว็บ: ' + dropped.join(', '),
      by: 'retire_topics.js'
    });
    t.updated_at = today();
    touched.push({ id: t.id, dropped });
  }
  return touched;
}

function retire(ids, reason, by) {
  const store = readJson(STORE_PATH);
  const archive = loadArchive();

  const missing = ids.filter(id => !store.topics.some(t => t.id === id));
  if (missing.length) {
    console.error('⛔ ไม่พบหัวข้อในคลัง: ' + missing.join(', ') + ' — ตรวจรหัสแล้วสั่งใหม่');
    process.exit(2);
  }

  // จองรหัสสูงสุดไว้ก่อนย้าย มิฉะนั้นรหัสจะวนกลับมาใช้ซ้ำ
  const hwm = highWaterMark(store, archive);
  store.metadata = store.metadata || {};
  store.metadata.last_topic_id = 'T' + String(hwm).padStart(3, '0');

  const moving = store.topics.filter(t => ids.includes(t.id));
  store.topics = store.topics.filter(t => !ids.includes(t.id));

  const touched = cleanRelated(store, ids);

  for (const t of moving) {
    archive.retired.push({
      retired_at: today(), retired_by: by || 'ไม่ระบุ', reason: reason,
      topic_id: t.id, name_th: t.name_th, topic: t
    });
  }
  archive.metadata.last_updated = today();
  store.metadata.total_topics = store.topics.length;
  store.metadata.last_updated = today();

  writeJson(STORE_PATH, store);
  writeJson(ARCHIVE_PATH, archive);

  const gate = runGate();
  if (!gate.ok) {
    console.error('⛔ เกตคุณภาพไม่ผ่านหลังเอาหัวข้อออก — ย้อนไฟล์กลับแล้ว ไม่มีอะไรเปลี่ยน');
    console.error((gate.out.split('── ERRORS')[1] || gate.out).slice(0, 900));
    execFileSync('git', ['checkout', '--', 'data/knowledge_store.json'], { cwd: ROOT, stdio: 'pipe' });
    if (fs.existsSync(ARCHIVE_PATH)) {
      try { execFileSync('git', ['checkout', '--', 'data/retired_topics.json'], { cwd: ROOT, stdio: 'pipe' }); }
      catch (e) { fs.unlinkSync(ARCHIVE_PATH); }  // ไฟล์เพิ่งสร้างรอบนี้ ยังไม่อยู่ใน git
    }
    process.exit(1);
  }

  console.log('✅ เอาออกจากเว็บแล้ว ' + moving.length + ' หัวข้อ');
  moving.forEach(t => console.log('   • ' + t.id + ' ' + t.name_th));
  console.log('   เหตุผล: ' + reason);
  if (touched.length) {
    console.log('   ตัดการอ้างถึงใน ' + touched.length + ' หัวข้อ:');
    touched.forEach(x => console.log('     - ' + x.id + ' เคยอ้าง ' + x.dropped.join(', ')));
  }
  console.log('   รหัสสูงสุดที่จองไว้: ' + store.metadata.last_topic_id + ' (หัวข้อถัดไปจะได้ T'
    + String(hwm + 1).padStart(3, '0') + ' — ไม่วนกลับมาใช้รหัสเดิม)');
  console.log('   เหลือในคลัง ' + store.topics.length + ' หัวข้อ · เก็บถาวร ' + archive.retired.length + ' หัวข้อ');
}

function restore(ids) {
  const store = readJson(STORE_PATH);
  const archive = loadArchive();
  const back = archive.retired.filter(r => ids.includes(r.topic_id));
  if (!back.length) { console.error('⛔ ไม่พบหัวข้อในคลังเก็บถาวร: ' + ids.join(', ')); process.exit(2); }

  const dupName = back.filter(r => store.topics.some(t => (t.name_th || '').trim() === (r.topic.name_th || '').trim()));
  if (dupName.length) {
    console.error('⛔ ย้ายกลับไม่ได้ — มีหัวข้อชื่อเดียวกันอยู่ในคลังแล้ว: '
      + dupName.map(r => '"' + r.name_th + '"').join(', '));
    console.error('   (เกต G2_DEDUP ห้ามชื่อซ้ำ) — เปลี่ยนชื่อตัวใดตัวหนึ่งก่อน หรือเอาตัวที่ซ้ำออกก่อน');
    process.exit(1);
  }

  back.forEach(r => store.topics.push(r.topic));
  store.topics.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  archive.retired = archive.retired.filter(r => !ids.includes(r.topic_id));
  store.metadata.total_topics = store.topics.length;
  store.metadata.last_updated = today();
  archive.metadata.last_updated = today();
  writeJson(STORE_PATH, store);
  writeJson(ARCHIVE_PATH, archive);

  const gate = runGate();
  if (!gate.ok) {
    console.error('⛔ เกตไม่ผ่านหลังย้ายกลับ — ย้อนไฟล์แล้ว');
    console.error((gate.out.split('── ERRORS')[1] || gate.out).slice(0, 700));
    execFileSync('git', ['checkout', '--', 'data/knowledge_store.json', 'data/retired_topics.json'], { cwd: ROOT, stdio: 'pipe' });
    process.exit(1);
  }
  console.log('✅ ย้ายกลับขึ้นเว็บแล้ว ' + back.length + ' หัวข้อ');
  back.forEach(r => console.log('   • ' + r.topic_id + ' ' + r.name_th));
  console.log('   หมายเหตุ: related_topics ที่เคยถูกตัดตอนเอาออก ไม่ได้ต่อกลับให้อัตโนมัติ — ตรวจเองหากต้องใช้');
}

function list() {
  const store = readJson(STORE_PATH);
  const archive = loadArchive();
  console.log('── อยู่บนเว็บ ' + store.topics.length + ' หัวข้อ ──');
  store.topics.forEach(t => console.log('  ' + t.id + '  ' + (t.name_th || '')));
  console.log('\n── เก็บถาวรแล้ว ' + (archive.retired || []).length + ' หัวข้อ ──');
  (archive.retired || []).forEach(r => console.log('  ' + r.topic_id + '  ' + r.name_th + '  (' + r.retired_at + ' · ' + r.reason + ')'));
  console.log('\nรหัสสูงสุดที่จองไว้: ' + (store.metadata.last_topic_id || '(ยังไม่ได้ตั้ง)'));
}

function main(argv) {
  if (argv.includes('--list')) return list();

  const ri = argv.indexOf('--restore');
  if (ri >= 0) {
    const ids = (argv[ri + 1] || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!ids.length) { console.error('⛔ ระบุรหัสหัวข้อ เช่น --restore T019'); process.exit(1); }
    return restore(ids);
  }

  const ids = (argv[0] || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const gi = k => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] || '') : ''; };
  const reason = gi('--reason').trim();
  const by = gi('--by').trim();

  if (!ids.length) { console.error('⛔ ระบุรหัสหัวข้อ เช่น: node scripts/retire_topics.js T019,T020 --reason "..."'); process.exit(1); }
  if (!ids.every(x => /^T\d{3,}$/.test(x))) { console.error('⛔ รูปแบบรหัสต้องเป็น Tnnn — ได้รับ: ' + ids.join(', ')); process.exit(1); }
  if (new Set(ids).size !== ids.length) { console.error('⛔ มีรหัสซ้ำในคำสั่ง'); process.exit(1); }
  if (!reason || reason.length < 10) { console.error('⛔ ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร (--reason) — เพื่อให้ตรวจย้อนได้ว่าเอาออกเพราะอะไร'); process.exit(1); }
  if (ids.length > MAX_PER_RUN) { console.error('⛔ เอาออกได้สูงสุด ' + MAX_PER_RUN + ' หัวข้อต่อครั้ง (ได้รับ ' + ids.length + ') — กันสั่งพลาดครั้งเดียวหายทั้งคลัง'); process.exit(1); }

  retire(ids, reason, by);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { retire, restore, highWaterMark, cleanRelated, MAX_PER_RUN };
