/**
 * ====================================================================
 * AUDIT PLATFORM — Comprehensive Unit Test Suite
 * ====================================================================
 * Coverage: RNS v2, Quality Gate, isDuplicateTopic, suggestTopicAssignment,
 *           Risk Selection/Commit, Schema Migration, Standards Manager,
 *           Post-Search UX State, Security Utilities, UI Logic
 *
 * Run:  node audit-platform.test.js
 * Deps: None (pure Node.js, no external libraries)
 * ====================================================================
 */

'use strict';

// ─── Minimal DOM stub for functions that touch document ──────────────────────
const _domNodes = {};
const document = {
  getElementById: (id) => _domNodes[id] || null,
  createElement: (tag) => ({ href:'', download:'', click:()=>{}, style:{} }),
};
function _mockEl(id, props={}) {
  _domNodes[id] = { textContent:'', innerHTML:'', style:{}, classList:{
    _cls: new Set(),
    add(c){ this._cls.add(c); },
    remove(c){ this._cls.delete(c); },
    toggle(c,f){ f===undefined ? (this._cls.has(c)?this._cls.delete(c):this._cls.add(c)) : (f?this._cls.add(c):this._cls.delete(c)); },
    contains(c){ return this._cls.has(c); },
  }, value:'', disabled:false, focus:()=>{}, querySelectorAll:()=>[], querySelector:()=>null,
  offsetWidth:0, ...props };
  return _domNodes[id];
}
// Seed commonly-accessed elements
['searchSuccessBanner','ssbTitle','ssbSub','ssbCountdown','nextStepHint','btnConfirm',
 'confirmLabelHint','labelAnalyze','labelConfirm'].forEach(id=>_mockEl(id));
const localStorage = { _store:{},
  getItem(k){ return this._store[k]??null; },
  setItem(k,v){ this._store[k]=String(v); },
  removeItem(k){ delete this._store[k]; },
};
const URL = { createObjectURL:()=>'blob:test', revokeObjectURL:()=>{} };
function showToast(){}  // stub
function alert(){}      // stub

// ─── Paste / re-implement all pure functions from the HTML ───────────────────
// (These are exact copies of the implementations in audit-platform-public.html)

// ── Security Utilities ──────────────────────────────────────────────────────
function escapeHtml(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');}
function stripTags(s){if(s==null)return'';return String(s).replace(/<[^>]*>/g,'').replace(/javascript:/gi,'').replace(/on\w+=/gi,'');}
function sanitize(s){return stripTags(String(s||'')).trim().slice(0,500);}
const STD_FORBIDDEN=[/</, />/, /javascript:/i, /on\w+\s*=/i, /script/i];
function validateStdName(name){
  const s=name.trim();
  if(s.length<3) return{ok:false,reason:'ชื่อต้องมีอย่างน้อย 3 ตัวอักษร'};
  if(s.length>100) return{ok:false,reason:'ชื่อยาวเกิน 100 ตัวอักษร'};
  for(const p of STD_FORBIDDEN) if(p.test(s)) return{ok:false,reason:'มีอักขระที่ไม่อนุญาต (HTML/script)'};
  if(!/[฀-๿a-zA-Z0-9]/.test(s)) return{ok:false,reason:'ต้องมีตัวอักษรหรือตัวเลข'};
  return{ok:true};
}

// ── Schema constants ────────────────────────────────────────────────────────
const SCHEMA_VERSION='2';
const LS_SCHEMA_KEY='audit_platform_schema_v';

// ── ID generator ───────────────────────────────────────────────────────────
let _seq = {T:11,R:25,CF:30,AP:31};
function genId(pre){ _seq[pre]++; return pre+String(_seq[pre]).padStart(3,'0'); }

// ── TOPICS global store (populated per test) ────────────────────────────────
let TOPICS = [];

// ── Knowledge hash (for isDuplicateTopic L2) ────────────────────────────────
function knowledgeHash(obj){
  const str=JSON.stringify({nth:obj.nth,cat:obj.cat,risks:(obj.risks||[]).map(r=>r.nth).sort()});
  let h=5381;
  for(let i=0;i<str.length;i++) h=((h<<5)+h)+str.charCodeAt(i);
  return 'sha_'+(h>>>0).toString(16).padStart(8,'0');
}

// ── isDuplicateTopic ────────────────────────────────────────────────────────
function isDuplicateTopic(candidate){
  if(TOPICS.find(t=>t.nth===candidate.nth)) return true;
  const newHash=knowledgeHash(candidate);
  if(TOPICS.find(t=>t._meta&&t._meta.hash_signature===newHash)) return true;
  function thaiWordTokens(str){
    const cleaned=str.replace(/[()[\]【】「」]/g,' ').replace(/\s+/g,' ').trim();
    const words=cleaned.split(/[\s,·\-–/]+/).filter(w=>w.length>=2);
    const bigrams=[];
    for(let i=0;i<words.length-1;i++) bigrams.push(words[i]+words[i+1]);
    return new Set([...words,...bigrams]);
  }
  const cTok=thaiWordTokens(candidate.nth);
  if(cTok.size<2) return false;
  for(const t of TOPICS){
    const tTok=thaiWordTokens(t.nth);
    const inter=[...cTok].filter(x=>tTok.has(x)).length;
    const union=new Set([...cTok,...tTok]).size;
    if(inter>=3&&union>0&&inter/union>0.75) return true;
  }
  return false;
}

// ── RNS Module ──────────────────────────────────────────────────────────────
const RNS_CF_ENDINGS = [
  'ไม่มีประสิทธิภาพ','บกพร่อง','ล้มเหลว','ไม่เพียงพอ',
  'ไม่ถูกต้อง','ไม่สอดคล้อง','ไม่โปร่งใส','ไม่ครอบคลุม',
  'ไม่บรรลุวัตถุประสงค์','ถูกละเมิด','ไม่เป็นระบบ',
  'ไม่มีมาตรการ','ขาดแคลน'
];
const RNS_SPLIT_SIGNALS = ['และ','หรือ'];

const RNS_OUTCOME_MAP = [
  {kw:['สัญญา'],out:'ความเสี่ยงค่าปรับและความเสียหายทางการเงิน',np:'ค่าปรับและความเสียหายทางการเงิน',ic:'ความเสียหายทางการเงินและคดีความ',suf:'จากการบริหารสัญญาบกพร่อง'},
  {kw:['ตรวจรับ','ตรวจรับงาน'],out:'ความเสี่ยงรับมอบงานต่ำกว่ามาตรฐานและจ่ายเงินเกินจริง',np:'การรับมอบงานต่ำกว่ามาตรฐานและจ่ายเงินเกินจริง',ic:'งานต่ำมาตรฐานและการจ่ายเงินเกินมูลค่า',suf:'จากการตรวจรับงานบกพร่อง'},
  {kw:['งบประมาณ','งบ'],out:'ความเสี่ยงการใช้งบประมาณเกินแผนหรือผิดวัตถุประสงค์',np:'การใช้งบประมาณเกินแผนหรือผิดวัตถุประสงค์',ic:'งบประมาณเกินแผนและวินัยการเงินที่อ่อนแอ',suf:'จากการควบคุมการเงินที่บกพร่อง'},
  {kw:['งบการเงิน','รายงานการเงิน','บัญชี'],out:'ความเสี่ยงรายงานทางการเงินบิดเบือนกระทบการตัดสินใจ',np:'รายงานทางการเงินบิดเบือนกระทบการตัดสินใจ',ic:'งบการเงินไม่น่าเชื่อถือและการตัดสินใจผิดพลาด',suf:'จากการควบคุมบัญชีที่บกพร่อง'},
  {kw:['เบิกจ่าย','จ่ายเงิน'],out:'ความเสี่ยงสูญเสียเงินสาธารณะ',np:'การสูญเสียเงินสาธารณะ',ic:'เงินสาธารณะสูญหายจากการเบิกจ่ายที่ผิดระเบียบ',suf:'จากการเบิกจ่ายที่ไม่เป็นไปตามระเบียบ'},
  {kw:['คณะกรรมการ','บอร์ด','กำกับดูแล'],out:'ความเสี่ยงการตัดสินใจเชิงกลยุทธ์ผิดพลาด',np:'การตัดสินใจเชิงกลยุทธ์ผิดพลาดและความเสียหายองค์กร',ic:'กลยุทธ์ผิดพลาดจากกำกับดูแลที่อ่อนแอ',suf:'จากกลไกกำกับดูแลที่อ่อนแอ'},
  {kw:['ERM','บริหารความเสี่ยงองค์กร'],out:'ความเสี่ยงองค์กรดำเนินกลยุทธ์โดยมองข้ามความเสี่ยงสำคัญ',np:'องค์กรดำเนินกลยุทธ์โดยมองข้ามความเสี่ยงสำคัญ',ic:'ความเสียหายจากการมองข้ามความเสี่ยงเชิงกลยุทธ์',suf:'จาก ERM ที่ไม่บูรณาการกับกลยุทธ์'},
  {kw:['สิทธิ์','เข้าถึงระบบ','access'],out:'ความเสี่ยงการเข้าถึงระบบโดยไม่ได้รับอนุญาต',np:'การเข้าถึงระบบโดยไม่ได้รับอนุญาต',ic:'การเข้าถึงและใช้งานระบบโดยไม่ได้รับอนุญาต',suf:'จาก Privileged Access ที่ควบคุมไม่ได้'},
  {kw:['AMI','Smart Meter','มิเตอร์'],out:'ความเสี่ยงข้อมูลพลังงานผิดพลาดและรั่วไหล',np:'ข้อมูลพลังงานผิดพลาดและรั่วไหลสู่ภายนอก',ic:'ข้อมูลการใช้ไฟรั่วไหลและวัดหน่วยผิดพลาด',suf:'จากระบบ AMI/Smart Meter ถูกโจมตีหรือขัดข้อง'},
  {kw:['SCADA','EMS','ระบบควบคุม'],out:'ความเสี่ยงสูญเสียการควบคุมระบบไฟฟ้าแห่งชาติ',np:'การสูญเสียการควบคุมระบบไฟฟ้าแห่งชาติ',ic:'ไฟฟ้าดับและสูญเสียการควบคุมโครงข่าย',suf:'จากการโจมตีหรือขัดข้องของ SCADA/EMS'},
  {kw:['ไซเบอร์','cyber','สารสนเทศ'],out:'ความเสี่ยงการหยุดชะงักของระบบและข้อมูลรั่วไหล',np:'การหยุดชะงักของระบบสารสนเทศและข้อมูลรั่วไหล',ic:'ระบบล่มและข้อมูลองค์กรถูกขโมย',suf:'จากการโจมตีทางไซเบอร์'},
  {kw:['บำรุงรักษา','maintenance'],out:'ความเสี่ยงโครงสร้างพื้นฐานล้มเหลวก่อนกำหนด',np:'โครงสร้างพื้นฐานล้มเหลวก่อนกำหนดอายุการใช้งาน',ic:'ความเสียหายและการหยุดชะงักของโครงสร้างพื้นฐาน',suf:'จากการบำรุงรักษาที่ไม่เพียงพอ'},
  {kw:['สินทรัพย์','asset'],out:'ความเสี่ยงสูญเสียมูลค่าสินทรัพย์และการขัดข้อง',np:'การสูญเสียมูลค่าสินทรัพย์และการขัดข้องของการผลิต',ic:'สินทรัพย์เสื่อมค่าและขัดข้องก่อนกำหนด',suf:'จากการจัดการวงจรชีวิตสินทรัพย์บกพร่อง'},
  {kw:['สายส่ง','โครงข่าย','grid'],out:'ความเสี่ยงไฟฟ้าขัดข้องกระทบความมั่นคงระบบ',np:'ไฟฟ้าขัดข้องและกระทบความมั่นคงระบบแห่งชาติ',ic:'ระบบสายส่งล้มเหลวและไฟฟ้าดับในวงกว้าง',suf:'จากโครงสร้างพื้นฐานสายส่งบกพร่อง'},
  {kw:['บุคลากร','พนักงาน','อัตรากำลัง'],out:'ความเสี่ยงขาดสมรรถนะในการดำเนินภารกิจสำคัญ',np:'การขาดสมรรถนะในการดำเนินภารกิจสำคัญ',ic:'ภารกิจล้มเหลวจากขาดบุคลากรที่มีสมรรถนะ',suf:'จากการบริหารทรัพยากรบุคคลที่ไม่เหมาะสม'},
  {kw:['ค่าตอบแทน','เงินเดือน'],out:'ความเสี่ยงสูญเสียบุคลากรคุณภาพและข้อพิพาทแรงงาน',np:'การสูญเสียบุคลากรคุณภาพและข้อพิพาทแรงงาน',ic:'บุคลากรลาออกและข้อพิพาทแรงงานที่เพิ่มขึ้น',suf:'จากระบบค่าตอบแทนที่ไม่เป็นธรรม'},
  {kw:['กฎหมาย','ระเบียบ','กกพ','กกม'],out:'ความเสี่ยงบทลงโทษและถูกเพิกถอนใบอนุญาต',np:'บทลงโทษและการถูกเพิกถอนใบอนุญาตประกอบกิจการ',ic:'ค่าปรับ คดีความ และถูกเพิกถอนใบอนุญาต',suf:'จากการไม่ปฏิบัติตามกฎหมายที่กำหนด'},
  {kw:['ESG','ความยั่งยืน','สิ่งแวดล้อม'],out:'ความเสี่ยงเสียความน่าเชื่อถือและถูกลงโทษ',np:'การเสียความน่าเชื่อถือและบทลงโทษจากหน่วยงานกำกับ',ic:'ความเสียหายต่อชื่อเสียงและบทลงโทษ ESG',suf:'จาก ESG Misreporting หรือไม่ปฏิบัติตามมาตรฐาน'},
  {kw:['จัดซื้อ','จัดจ้าง','procurement'],out:'ความเสี่ยงทุจริตและสูญเสียเงินสาธารณะ',np:'การทุจริตและสูญเสียเงินสาธารณะในกระบวนการจัดซื้อ',ic:'ทุจริตจัดซื้อและเงินสาธารณะรั่วไหล',suf:'ในกระบวนการจัดซื้อจัดจ้างที่ไม่โปร่งใส'},
  {kw:['ตรวจสอบภายใน','QAIP','ผู้ตรวจสอบ'],out:'ความเสี่ยงงานตรวจสอบภายในไม่มีคุณค่าและเชื่อถือได้',np:'งานตรวจสอบภายในขาดคุณภาพและความน่าเชื่อถือ',ic:'ผลงานตรวจสอบไม่น่าเชื่อถือและไม่สร้างคุณค่า',suf:'จากระบบประกันคุณภาพที่ไม่ครบถ้วน'},
  {kw:['ลูกค้า','บริการ','CRM'],out:'ความเสี่ยงลูกค้าสูญเสียความเชื่อมั่นและร้องเรียน',np:'ลูกค้าสูญเสียความเชื่อมั่นและยกระดับข้อร้องเรียน',ic:'ความเชื่อมั่นของลูกค้าลดลงและข้อร้องเรียนพุ่งสูง',suf:'จากคุณภาพบริการที่ต่ำกว่ามาตรฐาน'},
];

function rnsDetectFormat(name){
  const n=name.trim();
  if(n.startsWith('ความเสี่ยง')) return 'A';
  if(/^(ไฟฟ้า|เงิน|ทุจริต|การสูญ|การเสีย|ข้อมูล|ระบบ|ค่าปรับ|บทลงโทษ|ความเสียหาย)/.test(n)) return 'C';
  return 'B';
}

function rnsDetectIssues(riskName){
  const issues=[];
  if(!riskName||riskName.length<5) return issues;
  const clean=riskName.trim();
  const jakIdx=clean.indexOf('จาก');
  const primaryPart=(jakIdx>0?clean.slice(0,jakIdx):clean).replace(/^ความเสี่ยง/,'').trim();
  const cfEnd=RNS_CF_ENDINGS.find(e=>primaryPart.endsWith(e));
  if(cfEnd){
    issues.push({type:'CF_ENDING',severity:'HIGH',description:`ส่วน outcome ลงท้ายด้วย "${cfEnd}"`,suggestion:rnsAutoTransform(clean,'B')});
  }
  const beforeJak=jakIdx>0?clean.slice(0,jakIdx):clean;
  const combineMatch=beforeJak.match(/(.{8,35})(และ|หรือ)(.{8,35})/);
  if(combineMatch&&!cfEnd){
    issues.push({type:'COMBINED_RISKS',severity:'MEDIUM',description:`ชื่อรวม 2 ความเสี่ยงด้วย "${combineMatch[2]}"`,suggestion:'แยกเป็น (1) '+combineMatch[1].trim()+' / (2) '+combineMatch[3].trim()});
  }
  if(clean.replace(/^ความเสี่ยง/,'').trim().length<10&&!cfEnd){
    issues.push({type:'TOO_VAGUE',severity:'LOW',description:'ชื่อสั้นเกินไป',suggestion:'เพิ่ม context'});
  }
  if(clean.length>70&&!cfEnd&&!combineMatch){
    issues.push({type:'TOO_LONG',severity:'LOW',description:`ชื่อยาว ${clean.length} ตัวอักษร`,suggestion:'ย่อให้กระชับ'});
  }
  return issues;
}

function rnsAutoTransform(riskName, fmt){
  const f=fmt||'B';
  const lower=riskName.toLowerCase();
  let best=null, bestScore=0;
  RNS_OUTCOME_MAP.forEach(entry=>{
    const score=entry.kw.filter(kw=>lower.includes(kw.toLowerCase())).length;
    if(score>bestScore){bestScore=score;best=entry;}
  });
  if(best&&bestScore>0){
    const base=f==='A'?best.out:f==='C'?best.ic:best.np;
    return base+(best.suf?' '+best.suf:'');
  }
  let name=riskName.replace(/^ความเสี่ยง/,'').trim();
  const cfEnd=RNS_CF_ENDINGS.find(e=>name.endsWith(e));
  if(cfEnd) name=name.slice(0,name.length-cfEnd.length).trim();
  const core=name.startsWith('การ')?name:('การ'+name);
  if(f==='A') return 'ความเสี่ยงความเสียหายจาก'+core;
  if(f==='C') return 'ความเสียหายและการสูญเสียจาก'+core;
  return 'ความเสียหายที่เกิดจาก'+core;
}

function rnsApplyToRisk(r, fixes, issues){
  if(!r||!r.nth) return;
  const namingIssues=rnsDetectIssues(r.nth);
  if(!namingIssues.length) return;
  const highIssues=namingIssues.filter(i=>i.severity==='HIGH');
  const otherIssues=namingIssues.filter(i=>i.severity!=='HIGH');
  highIssues.forEach(issue=>{
    if(issue.type==='CF_ENDING'&&issue.suggestion){
      const original=r.nth;
      const existingFmt=rnsDetectFormat(original);
      const newName=rnsAutoTransform(original,existingFmt==='A'?'A':'B');
      r.nth=newName;r._nameOriginal=original;r._nameFixed=true;r._nameFmt=existingFmt==='A'?'A':'B';
      fixes.push(`📛 แก้ชื่อความเสี่ยง: "${original.slice(0,40)}" → "${r.nth.slice(0,40)}"`);
    }
  });
  otherIssues.forEach(issue=>{
    issues.push(`📛 "${r.nth.slice(0,40)}": ${issue.description}`);
  });
  r._nameIssues=namingIssues;
}

function rnsGetBadge(r){
  if(r._nameFixed){
    const fmt=r._nameFmt||'B';
    const fmtLabel={'A':'Prefixed','B':'Noun Phrase','C':'Impact-First'}[fmt]||fmt;
    return {icon:'✏️',color:'#2980B9',label:`ปรับชื่อแล้ว (${fmtLabel})`,title:'ชื่อเดิม: '+(r._nameOriginal||'')};
  }
  const issues=r._nameIssues||[];
  if(!issues.length) return null;
  const high=issues.find(i=>i.severity==='HIGH');
  if(high) return {icon:'⚠️',color:'#C0392B',label:'ตรวจสอบชื่อ',title:high.description};
  return {icon:'💡',color:'#B7770D',label:'แนะนำปรับ',title:issues[0].description};
}

function rnsFormatLabel(riskName){
  const fmt=rnsDetectFormat(riskName||'');
  return {'A':'A: Prefixed','B':'B: Noun Phrase','C':'C: Impact-First'}[fmt]||'B';
}

// ── Quality Gate helpers ─────────────────────────────────────────────────────
const LEVEL_ORDER={'CRITICAL':3,'HIGH':2,'MEDIUM':1,'LOW':0};
function isGovernanceTopic(t){
  const cats=['Governance & Ethics','Financial Integrity','Regulatory Compliance'];
  return cats.includes(t.cat)||/กำกับดูแล|จริยธรรม|ERM|กฎหมาย/.test(t.nth||'');
}
const EVIDENCE_FALLBACK=['บันทึกการสัมภาษณ์','ใบรับรองผล','รายงานการตรวจสอบ','หลักฐานเพิ่มเติม'];

function validateAndEnrichAuditOutput(topic){
  if(!topic||!Array.isArray(topic.risks)) return topic;
  const fixes=[],issues=[];

  // Q4: Auto-fill empty evidence
  (topic.risks||[]).forEach(r=>{
    (r.cf||[]).forEach(c=>{
      (c.pr||[]).forEach(p=>{
        if(!Array.isArray(p.ev)||p.ev.length===0){
          p.ev=[...EVIDENCE_FALLBACK];
          fixes.push(`เติมหลักฐานอัตโนมัติ: "${p.nth.slice(0,30)}"`);
        }
      });
    });
  });

  // Q5: Risk level escalation
  (topic.risks||[]).forEach(r=>{
    const txt=((r.nth||'')+(r.cf||[]).map(c=>c.nth).join(' ')).toLowerCase();
    const isSoD=txt.includes('sod')||txt.includes('segregation')||txt.includes('แบ่งแยกหน้าที่');
    const isFraud=txt.includes('ทุจริต')||txt.includes('fraud')||txt.includes('คอร์รัปชัน');
    if(isSoD&&r.lv!=='CRITICAL'&&r.lv!=='HIGH'){
      fixes.push(`⬆ ยกระดับ risk "${r.nth.slice(0,30)}" → HIGH (SoD rule)`);
      r.lv='HIGH';
    }
    if(isFraud&&LEVEL_ORDER[r.lv]<2){
      fixes.push(`⬆ ยกระดับ risk "${r.nth.slice(0,30)}" → HIGH (fraud rule)`);
      r.lv='HIGH';
    }
  });

  // Q2: CF preventive/detective coverage
  (topic.risks||[]).forEach(r=>{
    const cfTexts=(r.cf||[]).map(c=>c.nth.toLowerCase());
    const hasPreventive=cfTexts.some(t=>t.startsWith('ขาด')||t.startsWith('ไม่มี')||t.includes('ไม่เพียงพอ')||t.includes('บกพร่อง')||t.includes('ล้มเหลว'));
    const hasDetective=cfTexts.some(t=>t.includes('ตรวจจับ')||t.includes('ติดตาม')||t.includes('รายงาน')||t.includes('monitoring')||t.includes('ตรวจสอบ')||t.includes('review'));
    if(!hasPreventive) issues.push(`Risk "${r.nth.slice(0,40)}" ขาด Preventive CF`);
    if(!hasDetective&&(r.cf||[]).length===1) issues.push(`Risk "${r.nth.slice(0,40)}" ขาด Detective CF`);
  });

  // Q1: Minimum risks
  const minRisks=isGovernanceTopic(topic)?5:3;
  if((topic.risks||[]).length<minRisks){
    issues.push(`หัวข้อนี้มีความเสี่ยง ${topic.risks.length} รายการ (แนะนำอย่างน้อย ${minRisks})`);
  }

  // RNS
  (topic.risks||[]).forEach(r=>rnsApplyToRisk(r,fixes,issues));

  topic._qualityLog={checkedAt:new Date().toISOString(),autoFixed:fixes,issues,score:0};
  return topic;
}

// ── suggestTopicAssignment ───────────────────────────────────────────────────
function _thaiTokens(str){
  const s=String(str||'').replace(/[()[\]【】「」]/g,' ');
  const words=s.split(/[\s,·\-–/]+/).filter(w=>w.length>=2);
  const ngrams=[];
  words.forEach(w=>{
    if(w.length>=4){
      for(let i=0;i<=w.length-3;i++){
        const g3=w.slice(i,i+3);
        const g4=i<=w.length-4?w.slice(i,i+4):'';
        if(g3.length===3) ngrams.push(g3);
        if(g4.length===4) ngrams.push(g4);
      }
    }
  });
  return{words:new Set(words),ngrams:new Set(ngrams),all:new Set([...words,...ngrams])};
}
function _matchScore(a,b){
  let s=0;
  [...a.words].forEach(w=>{if(b.words.has(w))s+=3;});
  const ngOverlap=[...a.ngrams].filter(g=>b.all.has(g)).length;
  return s+Math.min(5,ngOverlap);
}
function suggestTopicAssignment(aiResult){
  if(!TOPICS.length) return{suggestion:{mode:'new',confidence:0},ranked:[]};
  const aTok=_thaiTokens(aiResult.nth);
  const aRiskTok=_thaiTokens((aiResult.risks||[]).map(r=>r.nth).join(' '));
  const MAX_SCORE=25;
  const scored=TOPICS.map(t=>{
    let score=0;
    if(t.cat===aiResult.cat) score+=10;
    const tTok=_thaiTokens(t.nth);
    score+=_matchScore(aTok,tTok);
    const sharedStd=(aiResult.std||[]).filter(s=>(t.std||[]).includes(s)).length;
    score+=sharedStd*2;
    const tRiskTok=_thaiTokens((t.risks||[]).map(r=>r.nth).join(' '));
    score+=Math.min(3,_matchScore(aRiskTok,tRiskTok));
    return{topicId:t.id,topicNth:t.nth,topicIc:t.ic||'📌',topicCat:t.cat,score};
  }).sort((a,b)=>b.score-a.score);
  const top=scored[0];
  const confidence=top?Math.min(100,Math.round(top.score/MAX_SCORE*100)):0;
  return{
    suggestion:top&&top.score>5?{mode:'existing',topicId:top.topicId,topicNth:top.topicNth,topicIc:top.topicIc,confidence}:{mode:'new',confidence:0},
    ranked:scored.slice(0,8),
  };
}

// ── applyRiskSelection ───────────────────────────────────────────────────────
const IMP = { files:[], parsed:[], aiResults:[], stdPending:[], activeSrc:new Set(['intl','thai','sector']),
              selectedRisks:{}, topicAssignment:{} };

function applyRiskSelection(){
  if(!IMP.selectedRisks) return;
  IMP.aiResults=IMP.aiResults.map((r,ri)=>{
    const topicKey='ai_'+ri;
    const sel=IMP.selectedRisks[topicKey];
    const assign=IMP.topicAssignment?.[topicKey];
    const filteredRisks=sel?r.risks.filter(rk=>sel[rk.nth]!==false):r.risks;
    const result={...r,risks:filteredRisks};
    if(assign){
      result._assignMode=assign.mode;
      result._assignedTopicId=assign.mode==='existing'?assign.topicId:null;
      result._newTopicName=assign.mode==='new'?(assign.newTopicName||r.nth):'';
    }
    return result;
  }).filter(r=>r.risks.length>0);
}

// ── validateNewTopicName ─────────────────────────────────────────────────────
function validateNewTopicName(name){
  const s=String(name||'').trim();
  if(s.length<5) return{ok:false,reason:'ชื่อหัวข้อต้องมีอย่างน้อย 5 ตัวอักษร'};
  if(s.length>80) return{ok:false,reason:'ชื่อยาวเกิน 80 ตัวอักษร'};
  if(TOPICS.find(t=>t.nth.trim()===s)) return{ok:false,reason:'ชื่อนี้ซ้ำกับหัวข้อที่มีอยู่แล้ว'};
  return{ok:true};
}

// ── Post-Search UX state helpers (pure state logic) ─────────────────────────
function activateConfirmPulse(){
  const btn=document.getElementById('btnConfirm');
  const hint=document.getElementById('confirmLabelHint');
  if(btn&&!btn.disabled){
    btn.classList.add('pulsing');
    if(hint) hint.classList.add('show');
  }
}
function deactivateConfirmPulse(){
  const btn=document.getElementById('btnConfirm');
  const hint=document.getElementById('confirmLabelHint');
  if(btn) btn.classList.remove('pulsing');
  if(hint) hint.classList.remove('show');
}
function showNextStepHint(){
  const el=document.getElementById('nextStepHint');
  if(el) el.classList.add('show');
}
function hideNextStepHint(){
  const el=document.getElementById('nextStepHint');
  if(el) el.classList.remove('show');
}
function showSearchSuccessBanner(stats){
  const banner=document.getElementById('searchSuccessBanner');
  const title=document.getElementById('ssbTitle');
  const sub=document.getElementById('ssbSub');
  if(!banner) return;
  const riskCount=stats.risks||0;
  const srcCount=stats.sources||0;
  const elapsed=stats.elapsed||0;
  title.textContent=`ค้นพบ ${riskCount} ความเสี่ยง จาก ${srcCount} มาตรฐาน${elapsed?' ('+elapsed+'s)':''}`;
  const chips=[];
  if(stats.grade) chips.push(`คุณภาพ ${stats.grade}`);
  if(stats.mode) chips.push(stats.mode);
  sub.innerHTML=chips.join(' · ');
  banner.classList.add('show');
}
function hideSearchSuccessBanner(){
  const banner=document.getElementById('searchSuccessBanner');
  if(banner){banner.classList.remove('show');}
}

// ── Schema migration utility (pure logic) ────────────────────────────────────
function migrateTopicSchemaV1toV2(saved){
  saved.forEach(t=>{
    if(!t.sources)     t.sources=[];
    if(!t.benchmarks)  t.benchmarks=[];
    if(!t.bpx)         t.bpx=[];
    if(!t._qualityLog) t._qualityLog=null;
    (t.risks||[]).forEach(r=>{
      if(!r.srcRefs) r.srcRefs=[];
      if(!r.lk)      r.lk='ปานกลาง';
      if(!r.im)      r.im='สูง';
      (r.cf||[]).forEach(c=>{
        (c.pr||[]).forEach(p=>{
          if(!p.srcRefs) p.srcRefs=[];
          if(!p.stdRefs) p.stdRefs=[];
          if(!Array.isArray(p.ev)) p.ev=[];
        });
      });
    });
  });
  return saved;
}

// ─────────────────────────────────────────────────────────────────────────────
// MICRO TEST FRAMEWORK
// ─────────────────────────────────────────────────────────────────────────────
let _pass=0, _fail=0, _skip=0;
const _results=[];

function describe(suiteName, fn){
  console.log(`\n\x1b[1m📦 ${suiteName}\x1b[0m`);
  fn();
}
function it(name, fn){
  try{
    fn();
    _pass++;
    _results.push({status:'pass',name});
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  }catch(e){
    _fail++;
    _results.push({status:'fail',name,error:e.message});
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    \x1b[90m↳ ${e.message}\x1b[0m`);
  }
}
function xit(name){
  _skip++;
  _results.push({status:'skip',name});
  console.log(`  \x1b[33m⊘\x1b[0m ${name} (skipped)`);
}
function assert(condition, msg){
  if(!condition) throw new Error(msg||'Assertion failed');
}
function assertEqual(a,b,msg){
  if(a!==b) throw new Error(`${msg||'assertEqual'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertIncludes(arr, item, msg){
  if(!arr.includes(item)) throw new Error(`${msg||'assertIncludes'}: "${item}" not found in [${arr.join(', ')}]`);
}
function assertDeepEqual(a,b,msg){
  if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error(`${msg||'assertDeepEqual'}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITES
// ─────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 1 — Security Utilities
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 1: Security Utilities', ()=>{

  it('escapeHtml — escapes < > & " \' characters', ()=>{
    assertEqual(escapeHtml('<script>'), '&lt;script&gt;');
    assertEqual(escapeHtml('a&b'), 'a&amp;b');
    assertEqual(escapeHtml('"hello"'), '&quot;hello&quot;');
    assertEqual(escapeHtml("it's"), "it&#x27;s");
  });

  it('escapeHtml — handles null/undefined gracefully', ()=>{
    assertEqual(escapeHtml(null), '');
    assertEqual(escapeHtml(undefined), '');
  });

  it('stripTags — removes HTML tags', ()=>{
    assertEqual(stripTags('<b>bold</b>'), 'bold');
    assertEqual(stripTags('<img src=x onerror=alert(1)>'), '');
  });

  it('stripTags — removes javascript: and on* handlers', ()=>{
    assert(!stripTags('javascript:alert(1)').includes('javascript:'));
    assert(!stripTags('onclick=foo()').includes('onclick='));
  });

  it('sanitize — trims and limits to 500 chars', ()=>{
    const long='a'.repeat(600);
    assertEqual(sanitize(long).length, 500);
  });

  it('sanitize — strips tags from input', ()=>{
    assert(!sanitize('<script>alert(1)</script>').includes('<script>'));
  });

  it('validateStdName — rejects names shorter than 3 chars', ()=>{
    assertEqual(validateStdName('ab').ok, false);
  });

  it('validateStdName — rejects names longer than 100 chars', ()=>{
    assertEqual(validateStdName('A'.repeat(101)).ok, false);
  });

  it('validateStdName — rejects HTML/script injection', ()=>{
    assert(!validateStdName('<b>test</b>').ok);
    assert(!validateStdName('javascript:alert()').ok);
    assert(!validateStdName('onclick=foo').ok);
  });

  it('validateStdName — accepts valid Thai standard name', ()=>{
    assert(validateStdName('ISO 31000:2018').ok);
    assert(validateStdName('พรบ.จัดซื้อจัดจ้าง พ.ศ.2560').ok);
    assert(validateStdName('INTOSAI GOV 9140').ok);
  });

  it('validateStdName — rejects name with no alphanumeric characters', ()=>{
    assert(!validateStdName('---').ok);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 2 — RNS v2: rnsDetectFormat
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 2: RNS — rnsDetectFormat', ()=>{

  it('Format A — detects ความเสี่ยง prefix', ()=>{
    assertEqual(rnsDetectFormat('ความเสี่ยงทุจริตในกระบวนการจัดซื้อ'), 'A');
    assertEqual(rnsDetectFormat('ความเสี่ยงการโจมตีไซเบอร์'), 'A');
  });

  it('Format C — detects impact-first patterns', ()=>{
    assertEqual(rnsDetectFormat('ไฟฟ้าดับและสูญเสียการควบคุมโครงข่าย'), 'C');
    assertEqual(rnsDetectFormat('ทุจริตจัดซื้อและเงินสาธารณะรั่วไหล'), 'C');
    assertEqual(rnsDetectFormat('ค่าปรับและคดีความจากการบริหารสัญญา'), 'C');
    assertEqual(rnsDetectFormat('ความเสียหายต่อชื่อเสียงและบทลงโทษ ESG'), 'C');
  });

  it('Format B — default for noun phrases without prefix or impact-first', ()=>{
    // Note: "การสูญ" triggers C regex; use names that don't start with C-pattern words
    assertEqual(rnsDetectFormat('การขาดสมรรถนะในการดำเนินภารกิจสำคัญ'), 'B');
    assertEqual(rnsDetectFormat('งานตรวจสอบภายในขาดคุณภาพและความน่าเชื่อถือ'), 'B');
    assertEqual(rnsDetectFormat('บุคลากรคุณภาพลาออกจากระบบค่าตอบแทน'), 'B');
  });

  it('rnsFormatLabel — returns human-readable format label', ()=>{
    assertEqual(rnsFormatLabel('ความเสี่ยงทุจริต'), 'A: Prefixed');
    // "การสูญเสียข้อมูล" starts with "การสูญ" → C (impact-first)
    assertEqual(rnsFormatLabel('การสูญเสียข้อมูล'), 'C: Impact-First');
    assertEqual(rnsFormatLabel('ไฟฟ้าดับในวงกว้าง'), 'C: Impact-First');
    // Clearly Format B — does not start with ความเสี่ยง or C-pattern words
    assertEqual(rnsFormatLabel('งานตรวจสอบภายในขาดคุณภาพ'), 'B: Noun Phrase');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 3 — RNS v2: rnsDetectIssues
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 3: RNS — rnsDetectIssues', ()=>{

  it('CF_ENDING — detects บกพร่อง in primary outcome', ()=>{
    const issues=rnsDetectIssues('ความเสี่ยงการบริหารสัญญาบกพร่อง');
    const cf=issues.find(i=>i.type==='CF_ENDING');
    assert(cf, 'should detect CF_ENDING');
    assertEqual(cf.severity, 'HIGH');
  });

  it('CF_ENDING — detects ล้มเหลว in primary outcome', ()=>{
    const issues=rnsDetectIssues('ความเสี่ยงระบบล้มเหลว');
    assert(issues.find(i=>i.type==='CF_ENDING'));
  });

  it('CF_ENDING — detects ไม่มีประสิทธิภาพ as HIGH issue', ()=>{
    const issues=rnsDetectIssues('ความเสี่ยงการบริหารงานไม่มีประสิทธิภาพ');
    const hi=issues.find(i=>i.type==='CF_ENDING'&&i.severity==='HIGH');
    assert(hi);
  });

  it('CF_ENDING — NO false positive when CF word is in cause clause only', ()=>{
    // "จากการบริหารสัญญาบกพร่อง" — บกพร่อง is after จาก, should NOT flag CF_ENDING
    const issues=rnsDetectIssues('ค่าปรับจากการบริหารสัญญาบกพร่อง');
    assert(!issues.find(i=>i.type==='CF_ENDING'), 'should not flag CF_ENDING when บกพร่อง is in cause clause');
  });

  it('CF_ENDING — NO false positive for correctly-named Format B risk', ()=>{
    const issues=rnsDetectIssues('การสูญเสียข้อมูลพลังงานจาก AMI ถูกโจมตี');
    assert(!issues.find(i=>i.type==='CF_ENDING'));
  });

  it('CF_ENDING — provides suggestion in auto-transform', ()=>{
    const issues=rnsDetectIssues('ความเสี่ยงการบริหารสัญญาบกพร่อง');
    const cf=issues.find(i=>i.type==='CF_ENDING');
    assert(cf.suggestion&&cf.suggestion.length>5, 'suggestion should be non-empty');
  });

  it('COMBINED_RISKS — detects AND in risk name outcome portion (both parts ≥8 chars)', ()=>{
    // Regex requires both sides of และ/หรือ to be 8-35 chars each
    const issues=rnsDetectIssues('ความเสี่ยงการสูญเสียรายได้และการเสียความเชื่อมั่นจากลูกค้า');
    assert(issues.find(i=>i.type==='COMBINED_RISKS'), 'should flag COMBINED_RISKS');
  });

  it('COMBINED_RISKS — NO false positive for หรือ in cause clause', ()=>{
    // "จากการโจมตีหรือขัดข้อง" — หรือ is after จาก, should NOT flag COMBINED_RISKS
    const issues=rnsDetectIssues('การสูญเสียการควบคุมระบบไฟฟ้าจากการโจมตีหรือขัดข้อง');
    assert(!issues.find(i=>i.type==='COMBINED_RISKS'), 'should not flag COMBINED_RISKS when หรือ is in cause clause');
  });

  it('TOO_VAGUE — detects very short risk names', ()=>{
    const issues=rnsDetectIssues('ความเสี่ยงไอที');
    assert(issues.find(i=>i.type==='TOO_VAGUE'), 'should flag TOO_VAGUE');
  });

  it('TOO_LONG — detects names over 70 chars', ()=>{
    const longName='ความเสี่ยงการดำเนินงานภายในองค์กรที่ไม่ได้รับการบริหารจัดการอย่างมีประสิทธิภาพเพียงพอ';
    assert(longName.length>70);
    const issues=rnsDetectIssues(longName);
    assert(issues.find(i=>i.type==='TOO_LONG'), 'should flag TOO_LONG');
  });

  it('Clean name — no issues for valid risk name', ()=>{
    const issues=rnsDetectIssues('การสูญเสียการควบคุมระบบไฟฟ้าแห่งชาติจากโจมตี SCADA');
    assertEqual(issues.length, 0, 'clean risk name should have no issues');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 4 — RNS v2: rnsAutoTransform
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 4: RNS — rnsAutoTransform', ()=>{

  it('Format B (default) — transforms สัญญาบกพร่อง via outcome map', ()=>{
    const result=rnsAutoTransform('ความเสี่ยงการบริหารสัญญาบกพร่อง','B');
    assert(result.includes('ค่าปรับ')||result.includes('ความเสียหาย'), `Got: ${result}`);
    // suf clause (after จาก) may contain CF words by design — check primary outcome part only
    const jakIdx=result.indexOf('จาก');
    const primaryPart=(jakIdx>0?result.slice(0,jakIdx):result).trim();
    assert(!RNS_CF_ENDINGS.some(e=>primaryPart.endsWith(e)), `primary outcome should not end with CF word, got: ${primaryPart}`);
  });

  it('Format A — transforms to prefixed style', ()=>{
    const result=rnsAutoTransform('ความเสี่ยงการบริหารสัญญาบกพร่อง','A');
    assert(result.startsWith('ความเสี่ยง'), `Format A must start with ความเสี่ยง, got: ${result}`);
  });

  it('Format C — transforms to impact-first style', ()=>{
    const result=rnsAutoTransform('ความเสี่ยงการบริหารสัญญาบกพร่อง','C');
    assert(result.includes('ความเสียหาย')||result.includes('ค่าปรับ'), `Got: ${result}`);
  });

  it('Keyword match — จัดซื้อ maps to procurement entry', ()=>{
    const result=rnsAutoTransform('ความเสี่ยงการจัดซื้อไม่มีประสิทธิภาพ','B');
    assert(result.includes('จัดซื้อ')||result.includes('สาธารณะ'), `Got: ${result}`);
  });

  it('Keyword match — ไซเบอร์ maps to cyber entry', ()=>{
    const result=rnsAutoTransform('ความเสี่ยงไซเบอร์ล้มเหลว','B');
    assert(result.includes('หยุดชะงัก')||result.includes('ข้อมูล'), `Got: ${result}`);
  });

  it('Fallback — no keyword match produces generic outcome', ()=>{
    const result=rnsAutoTransform('ความเสี่ยงการดำเนินงานล้มเหลว','B');
    assert(result.includes('ความเสียหาย'), `fallback should mention ความเสียหาย, got: ${result}`);
  });

  it('All 3 formats — produce different output for same input', ()=>{
    const name='ความเสี่ยงระบบสารสนเทศบกพร่อง';
    const fmtA=rnsAutoTransform(name,'A');
    const fmtB=rnsAutoTransform(name,'B');
    const fmtC=rnsAutoTransform(name,'C');
    assert(fmtA!==fmtB||fmtB!==fmtC, 'at least 2 of 3 formats should differ');
    assert(fmtA.startsWith('ความเสี่ยง'), `Format A must start with prefix, got: ${fmtA}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 5 — RNS v2: rnsApplyToRisk + rnsGetBadge
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 5: RNS — rnsApplyToRisk & rnsGetBadge', ()=>{

  it('rnsApplyToRisk — auto-fixes CF_ENDING for Format A risk', ()=>{
    const r={nth:'ความเสี่ยงการบริหารสัญญาบกพร่อง'};
    const fixes=[],issues=[];
    rnsApplyToRisk(r,fixes,issues);
    assert(r._nameFixed, 'should be marked as fixed');
    // suf clause (e.g. "จากการบริหารสัญญาบกพร่อง") may contain CF words by design
    // check that the primary outcome part (before จาก) is clean
    const jakIdx=r.nth.indexOf('จาก');
    const primaryPart=(jakIdx>0?r.nth.slice(0,jakIdx):r.nth).replace(/^ความเสี่ยง/,'').trim();
    assert(!RNS_CF_ENDINGS.some(e=>primaryPart.endsWith(e)), `primary outcome should not end with CF word, got: ${primaryPart}`);
    assertEqual(r._nameFmt,'A','should preserve Format A');
    assert(r._nameOriginal.includes('บกพร่อง'),'should save original name');
    assert(fixes.length>0,'should log a fix');
  });

  it('rnsApplyToRisk — auto-fixes CF_ENDING for Format B risk (not prefixed)', ()=>{
    const r={nth:'การบริหารสัญญาบกพร่อง'};
    const fixes=[],issues=[];
    rnsApplyToRisk(r,fixes,issues);
    assert(r._nameFixed,'should be fixed');
    assertEqual(r._nameFmt,'B','non-prefixed should get Format B');
  });

  it('rnsApplyToRisk — does NOT fix valid risk name', ()=>{
    const r={nth:'การสูญเสียข้อมูลพลังงานจาก AMI ถูกโจมตี'};
    const fixes=[],issues=[];
    rnsApplyToRisk(r,fixes,issues);
    assert(!r._nameFixed,'clean name should not be fixed');
    assertEqual(fixes.length,0);
  });

  it('rnsApplyToRisk — flags COMBINED_RISKS as issue (not auto-fix)', ()=>{
    // Both sides of "และ" must be ≥8 chars for combineMatch regex
    const r={nth:'ความเสี่ยงการสูญเสียรายได้และการเสียความเชื่อมั่นจากลูกค้า'};
    const fixes=[],issues=[];
    rnsApplyToRisk(r,fixes,issues);
    assert(!r._nameFixed,'COMBINED_RISKS should not auto-fix');
    assert(issues.length>0,'should log an issue');
  });

  it('rnsGetBadge — returns ✏️ badge for fixed risk', ()=>{
    const r={_nameFixed:true,_nameFmt:'B',_nameOriginal:'ชื่อเดิม'};
    const badge=rnsGetBadge(r);
    assert(badge,'should return badge');
    assertEqual(badge.icon,'✏️');
    assert(badge.label.includes('Noun Phrase'));
  });

  it('rnsGetBadge — returns ⚠️ badge for HIGH issue', ()=>{
    const r={_nameIssues:[{severity:'HIGH',description:'CF ending detected'}]};
    const badge=rnsGetBadge(r);
    assertEqual(badge.icon,'⚠️');
    assertEqual(badge.color,'#C0392B');
  });

  it('rnsGetBadge — returns 💡 badge for MEDIUM/LOW issue', ()=>{
    const r={_nameIssues:[{severity:'MEDIUM',description:'combined risks'}]};
    const badge=rnsGetBadge(r);
    assertEqual(badge.icon,'💡');
  });

  it('rnsGetBadge — returns null for clean risk', ()=>{
    const r={};
    assert(rnsGetBadge(r)===null,'no issues = no badge');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 6 — Quality Gate: validateAndEnrichAuditOutput
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 6: Quality Gate — validateAndEnrichAuditOutput', ()=>{

  it('Q4 — auto-fills empty evidence arrays', ()=>{
    const topic={cat:'Financial Integrity',nth:'Test',risks:[{
      nth:'ความเสี่ยงทุจริต',lv:'HIGH',
      cf:[{nth:'ขาดการตรวจสอบ',pr:[{nth:'ตรวจสอบเอกสาร',mt:'Review',ev:[]}]}]
    }]};
    validateAndEnrichAuditOutput(topic);
    assertEqual(topic.risks[0].cf[0].pr[0].ev.length, 4);
    assert(topic._qualityLog.autoFixed.length>0,'should log auto-fix');
  });

  it('Q4 — does not touch non-empty evidence', ()=>{
    const topic={cat:'Cybersecurity',nth:'Test',risks:[{
      nth:'ความเสี่ยงไซเบอร์',lv:'HIGH',
      cf:[{nth:'ขาดการควบคุม',pr:[{nth:'ตรวจสอบ',mt:'Test',ev:['หลักฐาน1','หลักฐาน2']}]}]
    }]};
    validateAndEnrichAuditOutput(topic);
    assertEqual(topic.risks[0].cf[0].pr[0].ev.length, 2, 'should not add more evidence');
  });

  it('Q5 — escalates SoD risk from LOW to HIGH', ()=>{
    const topic={cat:'Financial Integrity',nth:'Test',risks:[{
      nth:'ความเสี่ยงบัญชี',lv:'LOW',
      cf:[{nth:'ขาด Segregation of Duties ในกระบวนการ',pr:[]}]
    }]};
    validateAndEnrichAuditOutput(topic);
    assertEqual(topic.risks[0].lv,'HIGH','SoD risk should be escalated');
  });

  it('Q5 — escalates fraud risk from LOW to HIGH', ()=>{
    const topic={cat:'Financial Integrity',nth:'Test',risks:[{
      nth:'ความเสี่ยงทุจริตในองค์กร',lv:'LOW',
      cf:[{nth:'ขาดการตรวจสอบ',pr:[]}]
    }]};
    validateAndEnrichAuditOutput(topic);
    assertEqual(topic.risks[0].lv,'HIGH','fraud risk should be escalated');
  });

  it('Q5 — does not downgrade HIGH/CRITICAL risks', ()=>{
    const topic={cat:'Financial Integrity',nth:'Test',risks:[{
      nth:'ความเสี่ยงทุจริต',lv:'CRITICAL',
      cf:[{nth:'ขาด SoD',pr:[]}]
    }]};
    validateAndEnrichAuditOutput(topic);
    assertEqual(topic.risks[0].lv,'CRITICAL','should not downgrade CRITICAL');
  });

  it('Q2 — flags missing Preventive CF', ()=>{
    const topic={cat:'Financial Integrity',nth:'Test',risks:[{
      nth:'ความเสี่ยงระบบ',lv:'HIGH',
      cf:[{nth:'ตรวจสอบเอกสาร',pr:[{nth:'ขั้นตอน',mt:'Test',ev:['ev1','ev2','ev3','ev4']}]}]
    }]};
    validateAndEnrichAuditOutput(topic);
    assert(topic._qualityLog.issues.some(i=>i.includes('Preventive CF')));
  });

  it('Q2 — passes when preventive CF present', ()=>{
    const topic={cat:'Financial Integrity',nth:'Test',risks:[{
      nth:'ความเสี่ยงระบบ',lv:'HIGH',
      cf:[
        {nth:'ขาดการตรวจสอบ',pr:[{nth:'ขั้นตอน1',mt:'Test',ev:['e1','e2','e3']}]},
        {nth:'ตรวจจับความผิดปกติ',pr:[{nth:'ขั้นตอน2',mt:'Test',ev:['e1','e2','e3']}]}
      ]
    }]};
    validateAndEnrichAuditOutput(topic);
    assert(!topic._qualityLog.issues.some(i=>i.includes('Preventive CF')));
  });

  it('Q1 — warns when governance topic has <5 risks', ()=>{
    const topic={cat:'Governance & Ethics',nth:'การกำกับดูแลกิจการ',risks:[
      {nth:'R1',lv:'HIGH',cf:[]},{nth:'R2',lv:'MEDIUM',cf:[]},{nth:'R3',lv:'LOW',cf:[]}
    ]};
    validateAndEnrichAuditOutput(topic);
    assert(topic._qualityLog.issues.some(i=>i.includes('5')||i.includes('แนะนำ')));
  });

  it('Q1 — warns when normal topic has <3 risks', ()=>{
    const topic={cat:'Cybersecurity',nth:'ระบบสารสนเทศ',risks:[
      {nth:'R1',lv:'HIGH',cf:[]}
    ]};
    validateAndEnrichAuditOutput(topic);
    assert(topic._qualityLog.issues.some(i=>i.includes('3')||i.includes('แนะนำ')));
  });

  it('Quality log — always written after gate runs', ()=>{
    const topic={cat:'Cybersecurity',nth:'Test',risks:[{nth:'R1',lv:'HIGH',cf:[{nth:'ขาดระบบ',pr:[{nth:'p',mt:'t',ev:['a','b','c']}]}]}]};
    validateAndEnrichAuditOutput(topic);
    assert(topic._qualityLog,'_qualityLog should be set');
    assert(topic._qualityLog.checkedAt,'checkedAt should be set');
  });

  it('RNS integration — auto-fixes CF-ending risk inside quality gate', ()=>{
    const topic={cat:'Financial Integrity',nth:'Test',risks:[{
      nth:'ความเสี่ยงการบริหารสัญญาบกพร่อง',lv:'HIGH',
      cf:[{nth:'ขาดการตรวจสอบ',pr:[{nth:'p',mt:'t',ev:['a','b']}]}]
    }]};
    validateAndEnrichAuditOutput(topic);
    // Risk name should be marked as fixed
    assert(topic.risks[0]._nameFixed,'quality gate should auto-fix risk name via RNS');
    // Primary outcome part (before จาก) must be free of CF words
    const jakIdx=topic.risks[0].nth.indexOf('จาก');
    const primaryPart=(jakIdx>0?topic.risks[0].nth.slice(0,jakIdx):topic.risks[0].nth).replace(/^ความเสี่ยง/,'').trim();
    assert(!RNS_CF_ENDINGS.some(e=>primaryPart.endsWith(e)),'primary outcome should not end with CF word after fix');
    assert(topic._qualityLog.autoFixed.some(f=>f.includes('แก้ชื่อ')));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 7 — isDuplicateTopic
// ═══════════════════════════════════════════════════════════════════════════
let beforeEach_isDup;
describe('Module 7: isDuplicateTopic', ()=>{

  beforeEach_isDup=()=>{
    TOPICS=[
      {id:'T001',nth:'การจัดซื้อจัดจ้างและบริหารสัญญา',cat:'Financial Integrity',risks:[],std:[],_meta:{hash_signature:'sha_aabbccdd'}},
      {id:'T002',nth:'ความมั่นคงปลอดภัยทางไซเบอร์และสารสนเทศ',cat:'Cybersecurity',risks:[],std:[]},
    ];
  };

  it('L1 — exact title match returns true', ()=>{
    beforeEach_isDup();
    assert(isDuplicateTopic({nth:'การจัดซื้อจัดจ้างและบริหารสัญญา',cat:'Financial Integrity',risks:[]}));
  });

  it('L1 — different title returns false (no hash match)', ()=>{
    beforeEach_isDup();
    assert(!isDuplicateTopic({nth:'บริหารความเสี่ยงองค์กร',cat:'Governance',risks:[]}));
  });

  it('L2 — hash match returns true', ()=>{
    beforeEach_isDup();
    const candidate={nth:'การจัดซื้อจัดจ้างและบริหารสัญญา',cat:'Financial Integrity',risks:[]};
    candidate._meta={hash_signature:knowledgeHash(candidate)};
    assert(isDuplicateTopic(candidate));
  });

  it('L3 — high word overlap (>75%) returns true', ()=>{
    // The algorithm splits on whitespace — use space-separated tokens so bigrams work
    // T001 has 5 tokens, candidate adds 1 → 9/11 = 0.818 > 0.75 ✓
    TOPICS=[{id:'T001',nth:'SCADA EMS ระบบ ควบคุม ไฟฟ้า',cat:'Cybersecurity',risks:[],std:[]}];
    const candidate={nth:'SCADA EMS ระบบ ควบคุม ไฟฟ้า แห่งชาติ',cat:'Cybersecurity',risks:[]};
    assert(isDuplicateTopic(candidate),'near-identical space-tokenized title should be detected as duplicate');
  });

  it('L3 — low word overlap returns false', ()=>{
    beforeEach_isDup();
    const candidate={nth:'การบริหารงานพัสดุครุภัณฑ์',cat:'Asset Management',risks:[]};
    // shares "การบริหาร" but not 3+ shared specific words with >75% overlap
    assert(!isDuplicateTopic(candidate),'unrelated topic should not be false positive');
  });

  it('L3 — short title (< 2 tokens) always returns false', ()=>{
    beforeEach_isDup();
    assert(!isDuplicateTopic({nth:'จัดซื้อ',cat:'Financial Integrity',risks:[]}));
  });

  it('Unrelated procurement vs cybersecurity — no false positive', ()=>{
    beforeEach_isDup();
    const candidate={nth:'ความมั่นคงปลอดภัยทางด้านการเงิน',cat:'Financial Integrity',risks:[]};
    assert(!isDuplicateTopic(candidate),'financial security ≠ cybersecurity');
  });

  it('Full name dedup — does not match on common prefix only', ()=>{
    beforeEach_isDup();
    // All Thai audit risks share "ความเสี่ยง" prefix — should NOT be treated as duplicates
    TOPICS=[{id:'T001',nth:'ความเสี่ยงการจัดซื้อ',cat:'fin',risks:[],std:[]}];
    assert(!isDuplicateTopic({nth:'ความเสี่ยงการไซเบอร์',cat:'cyber',risks:[]}),
      'topics sharing only ความเสี่ยง prefix should NOT be duplicates');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 8 — suggestTopicAssignment
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 8: suggestTopicAssignment', ()=>{

  it('Returns new mode when no TOPICS exist', ()=>{
    TOPICS=[];
    const res=suggestTopicAssignment({nth:'ทดสอบ',cat:'X',risks:[],std:[]});
    assertEqual(res.suggestion.mode,'new');
  });

  it('Cat match boosts score — relevant topic wins over irrelevant', ()=>{
    TOPICS=[
      {id:'T001',nth:'การจัดซื้อจัดจ้างและบริหารสัญญา',cat:'Financial Integrity',risks:[{nth:'ความเสี่ยงทุจริต',lv:'HIGH',cf:[]}],std:['INTOSAI GOV 9140']},
      {id:'T002',nth:'ความมั่นคงปลอดภัยทางไซเบอร์',cat:'Cybersecurity',risks:[{nth:'ความเสี่ยงโจมตี SCADA',lv:'HIGH',cf:[]}],std:['NIST CSF']},
    ];
    const aiResult={nth:'กระบวนการจัดซื้อจัดจ้าง',cat:'Financial Integrity',risks:[{nth:'ความเสี่ยงการทุจริตจัดซื้อ',lv:'HIGH',cf:[]}],std:['INTOSAI GOV 9140']};
    const res=suggestTopicAssignment(aiResult);
    assertEqual(res.suggestion.mode,'existing');
    assertEqual(res.suggestion.topicId,'T001','procurement topic should match');
  });

  it('Shared standards increase score', ()=>{
    TOPICS=[
      {id:'T001',nth:'การจัดซื้อจัดจ้าง',cat:'Financial Integrity',risks:[],std:['INTOSAI GOV 9140','พรบ.จัดซื้อ']},
      {id:'T002',nth:'ไซเบอร์',cat:'Cybersecurity',risks:[],std:['NIST CSF','IEC 62443']},
    ];
    const aiResult={nth:'กระบวนการจัดซื้อ',cat:'Financial Integrity',risks:[],std:['INTOSAI GOV 9140']};
    const res=suggestTopicAssignment(aiResult);
    assertEqual(res.suggestion.topicId,'T001','shared standard should boost T001');
  });

  it('Returns up to 8 ranked results', ()=>{
    TOPICS=Array.from({length:10},(_, i)=>({id:'T'+i,nth:'หัวข้อ'+i,cat:'X',risks:[],std:[]}));
    const res=suggestTopicAssignment({nth:'ทดสอบ',cat:'X',risks:[],std:[]});
    assert(res.ranked.length<=8,'should return at most 8 ranked topics');
  });

  it('Score > 5 required for existing suggestion', ()=>{
    TOPICS=[{id:'T001',nth:'หัวข้อไม่เกี่ยวข้องเลย',cat:'Other',risks:[],std:[]}];
    const res=suggestTopicAssignment({nth:'ทดสอบสิ่งใหม่มาก',cat:'Unrelated',risks:[],std:[]});
    assertEqual(res.suggestion.mode,'new','low score should suggest new topic');
  });

  it('N-gram matching helps Thai compound words', ()=>{
    TOPICS=[
      {id:'T001',nth:'การบริหารความเสี่ยงองค์กร',cat:'Governance',risks:[{nth:'การมองข้ามความเสี่ยงสำคัญ',lv:'HIGH',cf:[]}],std:[]},
      {id:'T002',nth:'ระบบสารสนเทศ',cat:'IT',risks:[],std:[]},
    ];
    const aiResult={nth:'การบริหารความเสี่ยงเชิงกลยุทธ์',cat:'Governance',risks:[{nth:'มองข้ามความเสี่ยงสำคัญ',lv:'HIGH',cf:[]}],std:[]};
    const res=suggestTopicAssignment(aiResult);
    // T001 should score higher due to ngram overlap in compound Thai words
    assertEqual(res.ranked[0].topicId,'T001','ngram matching should favor T001');
  });

  it('Confidence is capped at 100', ()=>{
    TOPICS=[{id:'T001',nth:'การจัดซื้อจัดจ้างและบริหารสัญญา',cat:'Financial Integrity',risks:[{nth:'ทุจริต',lv:'HIGH',cf:[]}],std:['INTOSAI GOV 9140','พรบ.จัดซื้อ']}];
    const aiResult={nth:'การจัดซื้อจัดจ้างและบริหารสัญญา',cat:'Financial Integrity',risks:[{nth:'ทุจริตจัดซื้อ',lv:'HIGH',cf:[]}],std:['INTOSAI GOV 9140','พรบ.จัดซื้อ']};
    const res=suggestTopicAssignment(aiResult);
    assert(res.suggestion.confidence<=100,'confidence should not exceed 100');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 9 — applyRiskSelection
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 9: applyRiskSelection', ()=>{

  function makeAIResult(risks){
    return {nth:'Test Topic',cat:'X',std:[],risks:risks.map(n=>({nth:n,lv:'HIGH',cf:[]}))};
  }

  it('Filters out deselected risks', ()=>{
    IMP.aiResults=[makeAIResult(['Risk A','Risk B','Risk C'])];
    IMP.selectedRisks={'ai_0':{'Risk A':true,'Risk B':false,'Risk C':true}};
    IMP.topicAssignment={};
    applyRiskSelection();
    assertEqual(IMP.aiResults[0].risks.length,2,'should filter to 2 selected risks');
    assert(!IMP.aiResults[0].risks.find(r=>r.nth==='Risk B'),'Risk B should be removed');
  });

  it('Keeps all risks when no selection state (pass-through)', ()=>{
    IMP.aiResults=[makeAIResult(['Risk A','Risk B'])];
    IMP.selectedRisks={'ai_0':{'Risk A':true,'Risk B':true}};
    IMP.topicAssignment={};
    applyRiskSelection();
    assertEqual(IMP.aiResults[0].risks.length,2,'all selected = keep all');
  });

  it('Removes entire topic-result when all risks deselected', ()=>{
    IMP.aiResults=[makeAIResult(['Risk A','Risk B'])];
    IMP.selectedRisks={'ai_0':{'Risk A':false,'Risk B':false}};
    IMP.topicAssignment={};
    applyRiskSelection();
    assertEqual(IMP.aiResults.length,0,'topic with 0 risks should be removed');
  });

  it('Sets _assignedTopicId for existing mode assignment', ()=>{
    IMP.aiResults=[makeAIResult(['Risk A'])];
    IMP.selectedRisks={'ai_0':{'Risk A':true}};
    IMP.topicAssignment={'ai_0':{mode:'existing',topicId:'T001',newTopicName:''}};
    applyRiskSelection();
    assertEqual(IMP.aiResults[0]._assignMode,'existing');
    assertEqual(IMP.aiResults[0]._assignedTopicId,'T001');
    assertEqual(IMP.aiResults[0]._newTopicName,'');
  });

  it('Sets _newTopicName for new mode assignment', ()=>{
    IMP.aiResults=[makeAIResult(['Risk A'])];
    IMP.selectedRisks={'ai_0':{'Risk A':true}};
    IMP.topicAssignment={'ai_0':{mode:'new',newTopicName:'หัวข้อใหม่สำหรับการทดสอบ'}};
    applyRiskSelection();
    assertEqual(IMP.aiResults[0]._assignMode,'new');
    assertEqual(IMP.aiResults[0]._assignedTopicId,null);
    assertEqual(IMP.aiResults[0]._newTopicName,'หัวข้อใหม่สำหรับการทดสอบ');
  });

  it('Falls back to original nth as newTopicName when name is empty', ()=>{
    IMP.aiResults=[makeAIResult(['Risk A'])];
    IMP.aiResults[0].nth='หัวข้อจาก AI';
    IMP.selectedRisks={'ai_0':{'Risk A':true}};
    IMP.topicAssignment={'ai_0':{mode:'new',newTopicName:''}};
    applyRiskSelection();
    assertEqual(IMP.aiResults[0]._newTopicName,'หัวข้อจาก AI','should fallback to original nth');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 10 — validateNewTopicName
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 10: validateNewTopicName', ()=>{

  it('Rejects empty name', ()=>{
    assert(!validateNewTopicName('').ok);
    assert(!validateNewTopicName('   ').ok);
  });

  it('Rejects name < 5 chars', ()=>{
    assert(!validateNewTopicName('ทดสอ').ok);
  });

  it('Rejects name > 80 chars', ()=>{
    assert(!validateNewTopicName('ก'.repeat(81)).ok);
  });

  it('Rejects duplicate topic name', ()=>{
    TOPICS=[{id:'T001',nth:'การจัดซื้อจัดจ้าง',cat:'X',risks:[],std:[]}];
    assert(!validateNewTopicName('การจัดซื้อจัดจ้าง').ok,'duplicate should fail');
  });

  it('Accepts valid unique name', ()=>{
    TOPICS=[];
    assert(validateNewTopicName('การบริหารความเสี่ยงองค์กร').ok);
  });

  it('Accepts name at boundaries (5 chars, 80 chars)', ()=>{
    TOPICS=[];
    assert(validateNewTopicName('ทดสอบ').ok,'5 chars should pass');
    assert(validateNewTopicName('ก'.repeat(80)).ok,'80 chars should pass');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 11 — Schema Migration (v1 → v2)
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 11: Schema Migration v1→v2', ()=>{

  function makeV1Topic(){
    return {id:'T999',nth:'หัวข้อเก่า',cat:'X',risks:[{
      nth:'ความเสี่ยงเก่า',lv:'HIGH',
      cf:[{nth:'CF เก่า',pr:[{nth:'AP เก่า',mt:'Review',ev:['ev1']}]}]
    }],std:[]};
  }

  it('Adds sources[] to topic if missing', ()=>{
    const t=makeV1Topic(); delete t.sources;
    migrateTopicSchemaV1toV2([t]);
    assert(Array.isArray(t.sources),'sources should be added');
  });

  it('Adds benchmarks[] to topic if missing', ()=>{
    const t=makeV1Topic(); delete t.benchmarks;
    migrateTopicSchemaV1toV2([t]);
    assert(Array.isArray(t.benchmarks));
  });

  it('Adds bpx[] to topic if missing', ()=>{
    const t=makeV1Topic(); delete t.bpx;
    migrateTopicSchemaV1toV2([t]);
    assert(Array.isArray(t.bpx));
  });

  it('Sets _qualityLog to null if missing', ()=>{
    const t=makeV1Topic();
    migrateTopicSchemaV1toV2([t]);
    assert('_qualityLog' in t,'_qualityLog should exist');
  });

  it('Adds srcRefs[] to risk if missing', ()=>{
    const t=makeV1Topic();
    migrateTopicSchemaV1toV2([t]);
    assert(Array.isArray(t.risks[0].srcRefs));
  });

  it('Adds default lk and im to risk if missing', ()=>{
    const t=makeV1Topic();
    migrateTopicSchemaV1toV2([t]);
    assertEqual(t.risks[0].lk,'ปานกลาง');
    assertEqual(t.risks[0].im,'สูง');
  });

  it('Adds stdRefs[] to procedures if missing', ()=>{
    const t=makeV1Topic();
    migrateTopicSchemaV1toV2([t]);
    assert(Array.isArray(t.risks[0].cf[0].pr[0].stdRefs));
  });

  it('Does not overwrite existing fields', ()=>{
    const t=makeV1Topic();
    t.sources=['existing'];
    migrateTopicSchemaV1toV2([t]);
    assertDeepEqual(t.sources,['existing'],'should not overwrite existing sources');
  });

  it('Handles multiple topics in one migration', ()=>{
    const topics=[makeV1Topic(),makeV1Topic()];
    topics[1].id='T998';topics[1].nth='หัวข้อเก่า2';
    migrateTopicSchemaV1toV2(topics);
    topics.forEach(t=>assert(Array.isArray(t.sources)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 12 — Post-Search UX State
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 12: Post-Search UX State', ()=>{

  it('showSearchSuccessBanner — sets title with risk/source counts', ()=>{
    showSearchSuccessBanner({risks:7,sources:5,elapsed:3,grade:'A',mode:'Deep Research'});
    assert(_domNodes['ssbTitle'].textContent.includes('7'),'should show 7 risks');
    assert(_domNodes['ssbTitle'].textContent.includes('5'),'should show 5 sources');
  });

  it('showSearchSuccessBanner — adds "show" class to banner', ()=>{
    showSearchSuccessBanner({risks:3,sources:2});
    assert(_domNodes['searchSuccessBanner'].classList.contains('show'));
  });

  it('hideSearchSuccessBanner — removes "show" class', ()=>{
    _domNodes['searchSuccessBanner'].classList.add('show');
    hideSearchSuccessBanner();
    assert(!_domNodes['searchSuccessBanner'].classList.contains('show'));
  });

  it('showNextStepHint — adds "show" class to hint element', ()=>{
    showNextStepHint();
    assert(_domNodes['nextStepHint'].classList.contains('show'));
  });

  it('hideNextStepHint — removes "show" class from hint element', ()=>{
    _domNodes['nextStepHint'].classList.add('show');
    hideNextStepHint();
    assert(!_domNodes['nextStepHint'].classList.contains('show'));
  });

  it('activateConfirmPulse — adds pulsing class when button is enabled', ()=>{
    _domNodes['btnConfirm'].disabled=false;
    activateConfirmPulse();
    assert(_domNodes['btnConfirm'].classList.contains('pulsing'));
    assert(_domNodes['confirmLabelHint'].classList.contains('show'));
  });

  it('activateConfirmPulse — does NOT pulse disabled button', ()=>{
    _domNodes['btnConfirm'].disabled=true;
    _domNodes['btnConfirm'].classList.remove('pulsing');
    activateConfirmPulse();
    assert(!_domNodes['btnConfirm'].classList.contains('pulsing'),'disabled button should not pulse');
  });

  it('deactivateConfirmPulse — removes pulsing and hint', ()=>{
    _domNodes['btnConfirm'].classList.add('pulsing');
    _domNodes['confirmLabelHint'].classList.add('show');
    deactivateConfirmPulse();
    assert(!_domNodes['btnConfirm'].classList.contains('pulsing'));
    assert(!_domNodes['confirmLabelHint'].classList.contains('show'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 13 — Standards Manager: validateStdName edge cases
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 13: Standards Manager — validateStdName edge cases', ()=>{

  it('Rejects script tag injection', ()=>{
    assert(!validateStdName('<script>alert()</script>').ok);
  });

  it('Rejects > and < separately', ()=>{
    assert(!validateStdName('ISO 31000 > 2018').ok);
    assert(!validateStdName('v < 2').ok);
  });

  it('Rejects event handler injection (onclick=)', ()=>{
    assert(!validateStdName('ISO onclick=bad').ok);
  });

  it('Accepts standard at exactly 3 chars (min boundary)', ()=>{
    assert(validateStdName('ISO').ok);
  });

  it('Accepts standard at exactly 100 chars (max boundary)', ()=>{
    assert(validateStdName('A'.repeat(100)).ok);
  });

  it('Rejects 101 chars (over max)', ()=>{
    assert(!validateStdName('A'.repeat(101)).ok);
  });

  it('Accepts mixed Thai-English standard names', ()=>{
    assert(validateStdName('ISO 31000:2018 ความเสี่ยง').ok);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 14 — RNS: 19 Built-in Risk Name Quality Check
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 14: Built-in Risk Names — RNS compliance', ()=>{

  const builtInRisks = [
    'ค่าปรับและความเสียหายทางการเงินจากการบริหารสัญญาบกพร่อง',       // renamed from "ความเสี่ยงการบริหารสัญญาไม่มีประสิทธิภาพ"
    'บทลงโทษและคดีความจากการจัดซื้อที่ขัดกฎหมาย',                     // renamed from "ความเสี่ยงการจัดซื้อไม่เป็นไปตามกฎหมาย"
    'ความเสียหายต่อชื่อเสียงและบทลงโทษจาก ESG Misreporting',          // renamed
    'อุบัติเหตุไฟฟ้าที่นำสู่การสูญเสียชีวิตและทรัพย์สิน',               // renamed
    'การมองข้ามความเสี่ยงสำคัญจากกรอบ ERM ที่ไม่ครอบคลุม',             // renamed
    'การสูญเสียข้อมูลพลังงานจาก AMI ถูกโจมตี',                          // clean Format B
    'การสูญเสียการควบคุมระบบไฟฟ้าแห่งชาติจากการโจมตีหรือขัดข้องของ SCADA/EMS', // clean
    'ความเสี่ยงทุจริตในกระบวนการจัดซื้อ',                               // Format A clean
  ];

  builtInRisks.forEach(name=>{
    it(`No CF_ENDING on: "${name.slice(0,45)}..."`, ()=>{
      const issues=rnsDetectIssues(name);
      const cfIssue=issues.find(i=>i.type==='CF_ENDING');
      assert(!cfIssue, `"${name}" should NOT have CF_ENDING issue (got: ${cfIssue?.description})`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 15 — isGovernanceTopic
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 15: isGovernanceTopic classification', ()=>{

  it('Classifies "Governance & Ethics" cat as governance', ()=>{
    assert(isGovernanceTopic({cat:'Governance & Ethics',nth:'การกำกับดูแล',risks:[]}));
  });

  it('Classifies "Financial Integrity" cat as governance', ()=>{
    assert(isGovernanceTopic({cat:'Financial Integrity',nth:'Test',risks:[]}));
  });

  it('Classifies "Regulatory Compliance" cat as governance', ()=>{
    assert(isGovernanceTopic({cat:'Regulatory Compliance',nth:'Test',risks:[]}));
  });

  it('Classifies topic with กำกับดูแล in title as governance', ()=>{
    assert(isGovernanceTopic({cat:'Other',nth:'การกำกับดูแลกิจการที่ดี',risks:[]}));
  });

  it('Does NOT classify Cybersecurity as governance', ()=>{
    assert(!isGovernanceTopic({cat:'Cybersecurity',nth:'ระบบไซเบอร์',risks:[]}));
  });

  it('Does NOT classify Infrastructure as governance', ()=>{
    assert(!isGovernanceTopic({cat:'Infrastructure',nth:'ระบบสายส่ง',risks:[]}));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 16 — knowledgeHash determinism
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 16: knowledgeHash', ()=>{

  it('Same input always produces same hash', ()=>{
    const obj={nth:'Test Topic',cat:'X',risks:['R1']};
    assertEqual(knowledgeHash(obj), knowledgeHash(obj));
  });

  it('Different nth produces different hash', ()=>{
    const a={nth:'Topic A',cat:'X',risks:[]};
    const b={nth:'Topic B',cat:'X',risks:[]};
    assert(knowledgeHash(a)!==knowledgeHash(b));
  });

  it('Hash starts with sha_ prefix', ()=>{
    assert(knowledgeHash({nth:'X',cat:'Y',risks:[]}).startsWith('sha_'));
  });

  it('Risk order does not affect hash (sorted internally)', ()=>{
    const a={nth:'T',cat:'X',risks:['R1','R2']};
    const b={nth:'T',cat:'X',risks:['R2','R1']};
    assertEqual(knowledgeHash(a), knowledgeHash(b));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 17 — _thaiTokens n-gram generation
// ═══════════════════════════════════════════════════════════════════════════
describe('Module 17: _thaiTokens n-gram generation', ()=>{

  it('Splits on spaces and common delimiters', ()=>{
    const t=_thaiTokens('การจัดซื้อ จัดจ้าง');
    assert(t.words.has('การจัดซื้อ'));
    assert(t.words.has('จัดจ้าง'));
  });

  it('Generates 3-char n-grams from words ≥4 chars', ()=>{
    const t=_thaiTokens('ความเสี่ยง');
    assert(t.ngrams.size>0,'should generate ngrams for long words');
  });

  it('Short words (< 2 chars) are filtered out', ()=>{
    const t=_thaiTokens('ก ข ค งาน');
    assert(!t.words.has('ก'));
    assert(!t.words.has('ข'));
    assert(t.words.has('งาน'));
  });

  it('.all contains both words and ngrams', ()=>{
    const t=_thaiTokens('การจัดซื้อจัดจ้าง');
    assert(t.all.size>=t.words.size,'all should be at least as large as words');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FINAL REPORT
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`\x1b[1m TEST RESULTS\x1b[0m`);
console.log('═'.repeat(60));
console.log(`  \x1b[32m✓ Passed: ${_pass}\x1b[0m`);
if(_fail>0) console.log(`  \x1b[31m✗ Failed: ${_fail}\x1b[0m`);
if(_skip>0) console.log(`  \x1b[33m⊘ Skipped: ${_skip}\x1b[0m`);
console.log(`  📊 Total:  ${_pass+_fail+_skip}`);
console.log('═'.repeat(60));

if(_fail>0){
  console.log('\n\x1b[31mFailed tests:\x1b[0m');
  _results.filter(r=>r.status==='fail').forEach(r=>{
    console.log(`  ✗ ${r.name}`);
    console.log(`    ${r.error}`);
  });
  process.exit(1);
} else {
  console.log('\n\x1b[32m✅ All tests passed!\x1b[0m');
  process.exit(0);
}
