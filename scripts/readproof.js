#!/usr/bin/env node
/**
 * readproof.js — ทำ "ขั้นอ่านจริง" ของ deep-research-protocol ให้เป็นฟังก์ชัน
 * ─────────────────────────────────────────────────────────────────────────
 * หลักการ (SKILL ขั้น 2 + ขั้น 6 + Exception Catalog):
 *   ไม่ใช่แค่ "เปิดได้ 200" แต่ต้อง "ดึงเนื้อหาออกมา + ยืนยันว่า excerpt ที่อ้างมีจริง"
 *   ถ้าอ่านไส้ในไม่ได้ (สแกน/JS/paywall) → ห้ามอ้างว่าอ่าน ให้ลดเหลือ EXISTENCE_ONLY
 *
 * สถานะ (ผูก 1:1 กับ Exception Catalog):
 *   READ_VERIFIED   — 200 + ดึงเนื้อ + excerpt_verbatim อยู่ในเนื้อจริง  → อ้าง L1 ได้เต็ม
 *   ALIVE_NO_MATCH  — 200 + ดึงเนื้อได้ แต่ไม่พบ verbatim               → ธง (อาจผิดฝาผิดตัว/ถูกแก้)
 *   EXISTENCE_ONLY  — 200 แต่อ่านตัวบทไม่ได้ (PDF สแกน/paywall/ไม่มี verbatim) → ลดคำอ้าง ไม่นับ L1
 *   DEAD            — 404/410                                          → RETIRE + แก้ทุกที่ที่อ้าง
 *   INCONCLUSIVE    — 403/429/5xx/timeout/JS-shell                     → ธงเหลืองให้คนตรวจ
 *
 * ออกแบบให้ "เทสต์ออฟไลน์ได้" ด้วย dependency injection (fetchFn, extractors, now)
 * โหมด live รันใน GitHub Actions (มีเครือข่าย) — CLI ด้านล่าง
 */
'use strict';

/* ── normalize: percent-encode ส่วน path ที่มีอักษรไทย/ช่องว่าง (กันบั๊กแบบ pea.co.th) ── */
function normalizeUrl(raw) {
  if (typeof raw !== 'string') return raw;
  let u;
  try { u = new URL(raw.trim()); } catch (e) { return raw.trim(); }
  // encode เฉพาะ path/segment ที่ยังมีอักขระ non-ASCII หรือช่องว่าง (ไม่ทับของที่ encode แล้ว)
  u.pathname = u.pathname.split('/').map(seg => {
    try { return /%[0-9A-Fa-f]{2}/.test(seg) ? seg : encodeURIComponent(decodeURIComponent(seg)); }
    catch (e) { return encodeURIComponent(seg); }
  }).join('/');
  return u.toString();
}

/* ── structural check (offline, deterministic) — ใช้เป็น HARD/WARN gate ใน validate.js ──
   จับ "โครง URL พัง" โดยไม่ต้องต่อเน็ต: ไม่ใช่ https, มีช่องว่างดิบ, หรือโฟลเดอร์เปล่าใน
   คอนเทนเนอร์ไฟล์ (/documents/ /files/ /uploads/ /download/) = น่าจะถูกตัดชื่อไฟล์ทิ้ง */
const FILE_CONTAINERS = /\/(documents|files|uploads|download|attachment|media)s?\/$/i;
function structuralCheck(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'ว่าง/ไม่ใช่สตริง' };
  const s = raw.trim();
  if (!/^https:\/\//i.test(s)) return { ok: false, reason: 'ไม่ใช่ https สมบูรณ์' };
  if (/\s/.test(s)) return { ok: false, reason: 'มีช่องว่างดิบ (ต้อง percent-encode)' };
  let u; try { u = new URL(s); } catch (e) { return { ok: false, reason: 'parse URL ไม่ได้' }; }
  if (FILE_CONTAINERS.test(u.pathname))
    return { ok: false, reason: 'ลงท้ายโฟลเดอร์ไฟล์เปล่า — น่าจะถูกตัดชื่อไฟล์ (เคส pea.co.th)' };
  return { ok: true };
}

/* ── ดึงข้อความจากเนื้อ response ตามชนิด ── */
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
function norm(s) { return String(s || '').normalize('NFC').replace(/​/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }

/* ── ยืนยันว่า excerpt อยู่ในเนื้อจริง (verbatim หรือ overlap ≥ threshold) ── */
function excerptPresent(text, verbatim, threshold = 0.6) {
  const T = norm(text), V = norm(verbatim);
  if (!V) return { matched: false, ratio: 0, note: 'ไม่มี verbatim ให้เทียบ' };
  if (T.includes(V)) return { matched: true, ratio: 1 };
  const words = V.split(' ').filter(w => w.length >= 3);
  if (words.length === 0) return { matched: false, ratio: 0 }; // ไทยไม่มีช่องว่าง → พึ่ง substring อย่างเดียว
  const hit = words.filter(w => T.includes(w)).length;
  const ratio = hit / words.length;
  return { matched: ratio >= threshold, ratio: Math.round(ratio * 100) / 100 };
}

/* ── ฟังก์ชันหลัก: อ่าน + พิสูจน์ ──
   deps: { fetchFn, extractors:{pdf?, html?, text?}, now } */
async function readproof(url, verbatim, deps = {}) {
  const fetchFn = deps.fetchFn;
  const extractors = deps.extractors || {};
  const checked_at = (deps.now || (() => new Date().toISOString().slice(0, 10)))();
  const base = { url, checked_at, matched_ratio: 0 };

  const struct = structuralCheck(url);
  if (!struct.ok) return { ...base, state: 'DEAD', http: 0, method: 'structural', note: struct.reason };

  let res;
  try { res = await fetchFn(normalizeUrl(url)); }
  catch (e) { return { ...base, state: 'INCONCLUSIVE', http: 0, method: 'fetch', note: 'ต่อไม่ได้/timeout: ' + e.message }; }

  const http = res.status || 0;
  if (http === 404 || http === 410) return { ...base, state: 'DEAD', http, method: 'http', note: 'ลิงก์ตาย' };
  if (http === 401 || http === 403 || http === 429 || http >= 500)
    return { ...base, state: 'INCONCLUSIVE', http, method: 'http', note: 'anti-bot/ชั่วคราว — ให้คนตรวจ' };
  if (http < 200 || http >= 400) return { ...base, state: 'INCONCLUSIVE', http, method: 'http', note: 'สถานะไม่คาดคิด' };

  const ct = (res.headers && res.headers.get && res.headers.get('content-type') || '').toLowerCase();
  let text = '', kind = 'html';
  if (/pdf/.test(ct)) {
    kind = 'pdf';
    if (extractors.pdf) { try { text = await extractors.pdf(res); } catch (e) { text = ''; } }
    if (!text) return { ...base, state: 'EXISTENCE_ONLY', http, method: 'pdf', note: 'PDF อ่านตัวบทไม่ได้ (สแกน/ไม่มี extractor) — ยืนยันได้แค่การมีอยู่' };
  } else {
    const raw = extractors.html ? await extractors.html(res) : stripHtml(await res.text());
    text = raw;
    if (norm(text).length < 40) return { ...base, state: 'INCONCLUSIVE', http, method: 'html', note: 'เนื้อว่าง/JS-shell — ต้องเปิดด้วย browser จริง' };
  }

  if (!verbatim) return { ...base, state: 'EXISTENCE_ONLY', http, method: kind, note: 'ไม่มี excerpt_verbatim ให้พิสูจน์การอ่าน' };
  const m = excerptPresent(text, verbatim);
  return {
    ...base, http, method: kind, matched_ratio: m.ratio,
    state: m.matched ? 'READ_VERIFIED' : 'ALIVE_NO_MATCH',
    note: m.matched ? 'excerpt ตรงกับเนื้อจริง' : 'เปิดได้แต่ไม่พบ excerpt (' + (m.note || 'overlap ' + m.ratio) + ')'
  };
}

module.exports = { normalizeUrl, structuralCheck, stripHtml, excerptPresent, readproof };

/* ── CLI (live) : node scripts/readproof.js [registry.json] — advisory, exit 0 เสมอ ── */
if (require.main === module) {
  const fs = require('fs'), path = require('path');
  const regPath = process.argv[2] || path.join(__dirname, '..', 'data', 'standards_registry.json');
  let pdfExtract = null;
  try { const pp = require('pdf-parse'); pdfExtract = async res => (await pp(Buffer.from(await res.arrayBuffer()))).text; } catch (e) {}
  (async () => {
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    const rows = [];
    for (const fam of reg.families || []) for (const ed of fam.editions || []) {
      if (!ed.evidence_url) continue;
      const verbatim = ed.excerpt_verbatim || ed.evidence_excerpt || '';
      const r = await readproof(ed.evidence_url, verbatim, { fetchFn: (u) => fetch(u, { redirect: 'follow', headers: { 'user-agent': 'audit-guidelines-readproof/1.0' } }), extractors: pdfExtract ? { pdf: pdfExtract } : {} });
      rows.push({ family: fam.family_id, version: ed.version, ...r });
      console.log(`${r.state.padEnd(14)} http=${r.http} ${fam.family_id}@${ed.version} — ${r.note}`);
    }
    const bad = rows.filter(r => r.state === 'DEAD' || r.state === 'ALIVE_NO_MATCH');
    console.log(`\nสรุป: ${rows.length} ลิงก์ | READ_VERIFIED=${rows.filter(r => r.state === 'READ_VERIFIED').length} | ต้องแก้(DEAD/NO_MATCH)=${bad.length} | EXISTENCE_ONLY=${rows.filter(r => r.state === 'EXISTENCE_ONLY').length} | INCONCLUSIVE=${rows.filter(r => r.state === 'INCONCLUSIVE').length}`);
    try { fs.writeFileSync(process.env.READPROOF_OUT || path.join(require('os').tmpdir(), 'readproof_report.json'), JSON.stringify(rows, null, 2)); } catch (e) {}
    process.exit(0); // advisory เสมอ — ไม่บล็อก
  })();
}
