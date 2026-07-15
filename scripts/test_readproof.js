#!/usr/bin/env node
/**
 * test_readproof.js — เทสต์ readproof.js แบบออฟไลน์ (mock fetch ไม่ต่อเน็ตจริง)
 * ครอบทุก state ที่ผูกกับ Exception Catalog + normalize URL ไทย + จับ truncation
 */
'use strict';
const { normalizeUrl, structuralCheck, excerptPresent, readproof } = require('./readproof.js');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } }

// mock response แบบ fetch จริง
function mkRes(status, contentType, body) {
  return {
    status,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body || '',
    arrayBuffer: async () => Buffer.from(body || ''),
  };
}
const now = () => '2026-07-15';

(async () => {
  console.log('── ชุด 1: normalizeUrl (encode อักษรไทย/ช่องว่าง กันบั๊กตัด URL) ──');
  ok('encode path ไทย + ช่องว่าง', normalizeUrl('https://x.go.th/a/พรบ ข.pdf').includes('%E0%B8%9E') && !/\s/.test(normalizeUrl('https://x.go.th/a/พรบ ข.pdf')));
  ok('ของที่ encode แล้วไม่ทับซ้ำ', normalizeUrl('https://x.go.th/a%20b.pdf') === 'https://x.go.th/a%20b.pdf');
  ok('host/scheme คงเดิม', normalizeUrl('https://www.pea.co.th/x/ก.pdf').startsWith('https://www.pea.co.th/'));

  console.log('── ชุด 2: structuralCheck (offline gate) ──');
  ok('pea.co.th /documents/ เปล่า = ตัด (ไม่ผ่าน)', structuralCheck('https://www.pea.co.th/sites/default/files/documents/').ok === false);
  ok('URL PDF เต็ม = ผ่าน', structuralCheck('https://www.pea.co.th/sites/default/files/documents/พรบ%20ก.pdf').ok === true);
  ok('http:// (ไม่ใช่ https) = ไม่ผ่าน', structuralCheck('http://x.go.th/a.pdf').ok === false);
  ok('ช่องว่างดิบ = ไม่ผ่าน', structuralCheck('https://x.go.th/a b.pdf').ok === false);
  ok('หน้า landing จริงลงท้าย / (ไม่ใช่คอนเทนเนอร์ไฟล์) = ผ่าน (ไม่ over-flag)', structuralCheck('https://www.theiia.org/en/standards/').ok === true);

  console.log('── ชุด 3: excerptPresent ──');
  ok('substring ตรงเป๊ะ', excerptPresent('ประกาศ 7 เม.ย. 2543 ยกเลิกฉบับเดิม', 'ยกเลิกฉบับเดิม').matched === true);
  ok('ไม่พบ = ไม่ match', excerptPresent('เนื้อหาอื่น', 'ข้อความที่ไม่มี').matched === false);
  ok('overlap คำอังกฤษ ≥0.6', excerptPresent('the internal audit standards effective date', 'internal audit standards effective').matched === true);

  console.log('── ชุด 4: readproof — ทุก state ──');
  const rv = await readproof('https://x.go.th/doc.html', 'มาตรา ๓ ยกเลิก', { now, fetchFn: async () => mkRes(200, 'text/html', '<html><body><p>พระราชบัญญัติ มาตรา ๓ ยกเลิก พ.ร.บ.เดิม ทั้งฉบับ</p></body></html>') });
  ok('READ_VERIFIED เมื่อ excerpt อยู่ในเนื้อ', rv.state === 'READ_VERIFIED' && rv.matched_ratio === 1);

  const nm = await readproof('https://x.go.th/doc.html', 'ข้อความที่ไม่มีในหน้า', { now, fetchFn: async () => mkRes(200, 'text/html', '<html><body>' + 'เนื้อหาที่ไม่เกี่ยวข้องเลยยาวพอสมควรเกินสี่สิบตัวอักษรแน่นอน '.repeat(2) + '</body></html>') });
  ok('ALIVE_NO_MATCH เมื่อเปิดได้แต่ไม่พบ excerpt', nm.state === 'ALIVE_NO_MATCH');

  const dead = await readproof('https://x.go.th/gone.html', 'อะไรก็ได้', { now, fetchFn: async () => mkRes(404, 'text/html', 'Not Found') });
  ok('DEAD เมื่อ 404', dead.state === 'DEAD' && dead.http === 404);

  const inc = await readproof('https://x.go.th/blocked.html', 'อะไรก็ได้', { now, fetchFn: async () => mkRes(403, 'text/html', 'Forbidden') });
  ok('INCONCLUSIVE เมื่อ 403 (anti-bot)', inc.state === 'INCONCLUSIVE');

  const pdf = await readproof('https://x.go.th/scan.pdf', 'อะไรก็ได้', { now, fetchFn: async () => mkRes(200, 'application/pdf', '%PDF-1.4 binary') });
  ok('EXISTENCE_ONLY เมื่อ PDF ไม่มี extractor (สแกน)', pdf.state === 'EXISTENCE_ONLY' && pdf.method === 'pdf');

  const pdfOk = await readproof('https://x.go.th/text.pdf', 'มาตรา ๕', { now, fetchFn: async () => mkRes(200, 'application/pdf', 'ignored'), extractors: { pdf: async () => 'เอกสารนี้ มาตรา ๕ ว่าด้วยเรื่องสำคัญ' } });
  ok('READ_VERIFIED เมื่อ PDF extractor ดึงเนื้อแล้ว match', pdfOk.state === 'READ_VERIFIED');

  const shell = await readproof('https://x.go.th/spa.html', 'อะไรก็ได้', { now, fetchFn: async () => mkRes(200, 'text/html', '<html><body><div id="app"></div></body></html>') });
  ok('INCONCLUSIVE เมื่อ JS-shell (เนื้อว่าง)', shell.state === 'INCONCLUSIVE');

  const trunc = await readproof('https://www.pea.co.th/sites/default/files/documents/', 'อะไรก็ได้', { now, fetchFn: async () => { throw new Error('ไม่ควรถูกเรียก'); } });
  ok('DEAD จาก structural (ตัด URL) โดยไม่ต้อง fetch', trunc.state === 'DEAD' && trunc.method === 'structural');

  const noVb = await readproof('https://x.go.th/doc.html', '', { now, fetchFn: async () => mkRes(200, 'text/html', '<html><body>เนื้อหายาวพอเกินสี่สิบตัวอักษรแน่ๆ เพื่อไม่ให้เป็น shell</body></html>') });
  ok('EXISTENCE_ONLY เมื่อไม่มี verbatim ให้พิสูจน์', noVb.state === 'EXISTENCE_ONLY');

  console.log(`\n${fail === 0 ? '✅' : '❌'} ผล: ผ่าน ${pass} / ตก ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
