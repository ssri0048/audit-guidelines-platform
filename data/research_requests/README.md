# คิวคำขอ Research

คำขอความรู้ใหม่จากผู้ใช้/admin เก็บเป็นไฟล์ JSON ต่อคำขอ: `REQ-YYYYMMDD-nnn.json`

```json
{
  "request_id": "REQ-20260713-001",
  "topic": "ความเสี่ยงการใช้โดรนตรวจสายส่ง",
  "requested_by": "ชื่อผู้ขอ",
  "requested_at": "2026-07-13T00:00:00Z",
  "target": "new_topic | existing_topic:T00x",
  "preferred_sources": ["IIA", "NIST", "กกพ."],
  "context": "หน่วยงาน/วัตถุประสงค์ที่จะใช้",
  "status": "pending | researching | in_review | merged | rejected"
}
```

Flow: ไฟล์เข้าโฟลเดอร์นี้ → Claude ทำ deep research → ผลเข้า staging → PR → คนอนุมัติ
