# CSMA — Customer Service Management Audit Knowledge

Source: Analysis of "Customer Service Management Audit: Opportunities and Challenges" (IJRISS, July 2025)
Analyzed as: Global IIA-level Internal Auditor
Standards basis: IIA 2024, ISO 9001:2015, ISO 10002:2018, ISO/IEC 27701, COBIT DSS01, PDPA, INTOSAI ISSAI 100

---

## 7 Risk Domains

### Domain 1: SLA/KPI Management — HIGH
**Risk:** ความเสี่ยง SLA/KPI การบริการลูกค้าไม่ได้ตามมาตรฐานที่กำหนด

**Control Failures:**
1. ขาดระบบติดตามและรายงาน SLA แบบ Real-time และกระบวนการ Escalation เมื่อ SLA ใกล้หมดอายุ
2. ตัวชี้วัด KPI ไม่สอดคล้องกับความต้องการลูกค้าและกลยุทธ์องค์กร

**Key Evidence:** SLA Performance Dashboard, Escalation Log, CSAT/NPS Results, SLA Breach Register, KPI Framework, Customer Journey Mapping

---

### Domain 2: Customer Data Privacy — CRITICAL
**Risk:** ความเสี่ยงการรั่วไหลและละเมิดความเป็นส่วนตัวของข้อมูลลูกค้า

**Control Failures:**
1. ขาดการควบคุม Data Access, Data Retention และ Consent Management ตาม PDPA/GDPR
2. CRM System ไม่มีการเข้ารหัสและป้องกันข้อมูลลูกค้าอย่างเพียงพอตาม ISO/IEC 27701

**Standards:** PDPA Thailand, GDPR, ISO/IEC 27701:2019
**Key Evidence:** Data Privacy Policy, Consent Register, Data Retention Schedule, PDPA DPO Reports, Privacy Impact Assessment, CRM Security Assessment

---

### Domain 3: CRM Technology Effectiveness — HIGH
**Risk:** ความเสี่ยงระบบ CRM และเทคโนโลยีบริการลูกค้าไม่มีประสิทธิภาพ

**Control Failures:**
1. ขาดการบูรณาการระบบ CRM กับ Omnichannel และการบำรุงรักษาเชิงป้องกัน
2. ขาดแผน Business Continuity สำหรับระบบ CRM และช่องทางการบริการดิจิทัล

**Standards:** COBIT 2019 DSS01, ISO 20000-1
**Key Evidence:** CRM Availability Report, Integration Architecture, Change Management Log, BCP/DRP for CRM, RTO/RPO Documentation

---

### Domain 4: Staff Competency — HIGH
**Risk:** ความเสี่ยงสมรรถนะและความสามารถบุคลากรงานบริการลูกค้าไม่เพียงพอ

**Control Failures:**
1. ขาดแผนพัฒนาสมรรถนะ การฝึกอบรม และระบบประเมินผลบุคลากรบริการลูกค้า
2. ขาดระบบ Knowledge Management สำหรับบุคลากรบริการลูกค้า

**Standards:** IIA Standard 2130, ISO 30414:2018
**Key Evidence:** Competency Framework, Training Records, Performance Appraisal (Agent), Quality Monitoring Score, Staff Turnover Analysis, Knowledge Base Audit

---

### Domain 5: Complaint Management — HIGH
**Risk:** ความเสี่ยงระบบจัดการข้อร้องเรียนลูกค้าไม่มีประสิทธิภาพตาม ISO 10002

**Control Failures:**
1. ขาดกระบวนการรับ ติดตาม และแก้ไขข้อร้องเรียนที่เป็นมาตรฐานตาม ISO 10002:2018
2. ไม่มีการวิเคราะห์แนวโน้มข้อร้องเรียนเพื่อปรับปรุงกระบวนการ (Systemic Improvement)

**Standards:** ISO 10002:2018, ISO 9001:2015 Clause 9.1.2
**Key Evidence:** Complaint Register, Resolution Rate & Time, Root Cause Analysis, Complaint Trend Dashboard, Pareto Analysis, Regulatory Complaint Records (กกพ./สคบ.)

---

### Domain 6: Meta-Audit Quality & Independence — HIGH
**Risk:** ความเสี่ยงคุณภาพและความเป็นอิสระของกระบวนการตรวจสอบงานบริการลูกค้า

**Control Failures:**
1. ขาดกระบวนการ Quality Assurance ที่เป็นอิสระสำหรับงานบริการลูกค้า และการรายงานต่อผู้บริหาร
2. การตรวจสอบภายในงานบริการลูกค้าไม่ครอบคลุมความเสี่ยงดิจิทัลและ AI ใหม่

**Standards:** IIA Standards 2024 (2120, 2024), INTOSAI ISSAI 100
**Key Evidence:** QA Framework, Sample Methodology, Score Calibration, Management Reporting, External QA Assessment, AI/Chatbot Risk Assessment, Audit Committee Minutes

---

### Domain 7: Omnichannel Experience — MEDIUM-HIGH
**Risk:** ความเสี่ยงประสบการณ์ลูกค้าหลายช่องทาง (Omnichannel) ไม่สอดคล้องกัน

**Control Failures:**
1. ขาดการบูรณาการข้อมูลและกระบวนการระหว่างช่องทางบริการ (Phone/App/Web/Walk-in)
2. ขาดการวัดและติดตาม Customer Experience (CX) ตลอด Customer Lifecycle

**Standards:** ISO 9001:2015, Digital Service Standards
**Key Evidence:** Omnichannel Blueprint, Channel Integration Architecture, Cross-Channel Data Consistency Test, Customer Journey Map, FCR by Channel, NPS/CSAT/CES Trends, VOC Program Reports

---

## Detection Keywords for `detectDocType()`

```javascript
kw:['customer service','crm','csat','nps','fcr','ces','sla','csma',
    'complaint management','customer satisfaction','service management',
    'helpdesk','customer experience','omnichannel','service quality',
    'iso 10002','บริการลูกค้า','ข้อร้องเรียน','contact center',
    'call center','voice of customer','voc','cx metric','service desk',
    'customer journey','customer lifecycle','first contact resolution']
```
