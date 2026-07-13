# Schema Examples — DOC_KNOWLEDGE_LIBRARY Entries

These are simplified examples showing correct structure. Use these as reference when generating new entries.

## Minimal valid entry

```javascript
newtype: {
  ic: '🔒',
  nth: 'การตรวจสอบความปลอดภัยทางกายภาพ',
  nen: 'Physical Security Audit',
  cat: 'Technology & Infrastructure',
  col: '#2C3E50',
  pri: 'HIGH',
  std: [
    'ISO/IEC 27001:2022 Annex A.7',
    'NIST SP 800-116',
    'พรบ.ความมั่นคงปลอดภัยไซเบอร์ พ.ศ.2562'
  ],
  risks: [
    {
      nth: 'ความเสี่ยงการควบคุมการเข้าถึงพื้นที่สำคัญไม่มีประสิทธิภาพ',
      lv: 'HIGH',
      lk: 'สูง',
      im: 'สูง',
      cf: [
        {
          nth: 'ขาดระบบ Access Control และ CCTV Monitoring ที่ครอบคลุมพื้นที่สำคัญ',
          pr: [
            {
              nth: 'ตรวจสอบระบบ Access Control รวมถึง Log การเข้าถึงและ CCTV Coverage',
              mt: 'Physical Inspection + Log Review',
              ev: [
                'Access Control System Log (90-day)',
                'CCTV Coverage Map and Footage Retention Policy',
                'Visitor Management Register',
                'Unauthorized Access Incident Report',
                'Physical Security Policy Document',
                'Annual Physical Security Assessment Report'
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Risk level decision matrix

| Likelihood → | น้อย | ปานกลาง | สูง | สูงมาก |
|---|---|---|---|---|
| **Impact: สูงมาก** | HIGH | HIGH | CRITICAL | CRITICAL |
| **Impact: สูง** | MEDIUM | HIGH | HIGH | CRITICAL |
| **Impact: ปานกลาง** | LOW | MEDIUM | HIGH | HIGH |
| **Impact: น้อย** | LOW | LOW | MEDIUM | MEDIUM |

## Audit method vocabulary

- `Document Review` — ทบทวนเอกสาร
- `Interview` — สัมภาษณ์
- `Data Analytics` — วิเคราะห์ข้อมูล
- `Transaction Testing` — ทดสอบรายการ
- `Physical Inspection` — ตรวจสอบทางกายภาพ
- `Technical Review` — ทบทวนทางเทคนิค
- `Compliance Testing` — ทดสอบการปฏิบัติตาม
- `Benchmarking` — เปรียบเทียบกับมาตรฐาน
- `Observation` — สังเกตการณ์
- `Recalculation` — คำนวณใหม่
- `Confirmation` — ขอยืนยันจากบุคคลที่สาม

Combine methods with `+`: e.g., `Document Review + Interview`, `Data Analytics + Transaction Testing`

## Common Thai regulation references

- `พรบ.การจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ.2560`
- `พรบ.วินัยการเงินการคลังภาครัฐ พ.ศ.2561`
- `พรบ.การรักษาความมั่นคงปลอดภัยไซเบอร์ พ.ศ.2562`
- `พรบ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ.2562 (PDPA)`
- `พรบ.คณะกรรมการกำกับกิจการพลังงาน พ.ศ.2550`
- `พรบ.ระเบียบข้าราชการพลเรือน พ.ศ.2551`
- `ระเบียบกระทรวงการคลังว่าด้วยการตรวจสอบภายใน พ.ศ.2551`
- `ระเบียบกระทรวงการคลังว่าด้วยการบริหารความเสี่ยง พ.ศ.2562`
- `มาตรฐานการตรวจสอบภายในและจริยธรรม สตง. พ.ศ.2562`
