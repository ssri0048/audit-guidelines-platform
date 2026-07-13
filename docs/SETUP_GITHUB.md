# คู่มือสร้าง Repo + เปิด GitHub Pages (ทำครั้งเดียว ~10 นาที)

> ทำตามทีละข้อ ไม่ต้องรู้ git มาก่อน — ทุกอย่างทำผ่าน browser ยกเว้นขั้น push ที่ใช้ Terminal 4 บรรทัด

## ส่วนที่ 1 — สร้าง Repository (บน browser)

1. เข้า **github.com** แล้ว login
2. มุมขวาบน กดปุ่ม **+** → เลือก **New repository**
3. กรอก:
   - Repository name: `audit-guidelines-platform`
   - เลือก **Public** (จำเป็นสำหรับ GitHub Pages ฟรี)
   - **ไม่ต้อง**ติ๊ก Add a README (เรามีของเราแล้ว)
4. กด **Create repository** — จะได้หน้าว่างๆ พร้อม URL เช่น
   `https://github.com/<username>/audit-guidelines-platform`

## ส่วนที่ 2 — Push โค้ดขึ้นไป (Terminal บน Mac)

เปิดแอป **Terminal** แล้ววางทีละบรรทัด (แทน `<username>` ด้วยชื่อ GitHub ของคุณ):

```bash
cd ~/Desktop/skills-claude/audit-platform-v3
git init -b main && git add -A && git commit -m "feat: v3 initial — canonical store + quality gates CI"
git remote add origin https://github.com/<username>/audit-guidelines-platform.git
git push -u origin main
```

ตอน push ครั้งแรก GitHub จะให้ login — เลือก login ผ่าน browser ได้เลย

## ส่วนที่ 3 — เปิด GitHub Pages (บน browser)

1. ในหน้า repo → แท็บ **Settings** → เมนูซ้าย **Pages**
2. Source: เลือก **Deploy from a branch**
3. Branch: เลือก `main` / โฟลเดอร์ `/ (root)` → กด **Save**
4. รอ ~2 นาที เว็บจะขึ้นที่:
   `https://<username>.github.io/audit-guidelines-platform/app/`

## ส่วนที่ 4 — ตั้ง Branch Protection (หัวใจของ "คนอนุมัติทุกรายการ")

1. Settings → **Branches** → **Add branch ruleset** (หรือ Add rule)
2. Branch name pattern: `main`
3. ติ๊ก:
   - ✅ **Require a pull request before merging** (ห้ามเขียน main ตรง)
   - ✅ **Require status checks to pass** → ค้นหาแล้วเลือก **quality-gates**
4. Save — ตั้งแต่นี้ไป ไม่มีความรู้ใดเข้า master ได้โดยไม่ผ่าน CI + การกด merge ของคุณ

## ส่วนที่ 5 — เพิ่ม admin คนอื่น (เมื่อพร้อม)

Settings → **Collaborators** → Add people → ใส่ GitHub username ของเขา
(คนที่ถูกเพิ่มจะ review/merge PR ได้ตามสิทธิ์ที่ให้)

---

### เช็คว่าสำเร็จ

- [ ] เปิด `https://github.com/<username>/audit-guidelines-platform` เห็นไฟล์ครบ
- [ ] แท็บ Actions มี workflow "Quality Gates" (จะรันเมื่อมี PR แรก)
- [ ] เว็บเปิดได้ที่ github.io URL
- [ ] ทดลองแก้ไฟล์ data/ ตรงบน main → ระบบไม่ให้ทำ (ต้องเปิด PR)

ติดขั้นไหน บอกผมได้เลย — ทำต่อจากจุดนั้นให้

---
## Step 5 — Pipeline อัตโนมัติ (เพิ่ม 2026-07-14)

### A) queue-watchdog (ทำงานทันที ไม่ต้องตั้งอะไร)
รันทุกวันจันทร์เช้า (+สั่งมือได้ที่แท็บ Actions) → อัพเดท issue "🏳️ Verification Queue" รายงานธงค้าง + รายการเกิน SLA

### B) research-pipeline (ตั้งไว้รอ — เปิดใช้เมื่อพร้อม)
1. เปิดใช้: **Settings → Secrets and variables → Actions → New repository secret** ชื่อ `ANTHROPIC_API_KEY` ค่า = API key จาก console.anthropic.com
2. วิธีสั่งร่างหัวข้อใหม่: ติด label `research-request` ให้ issue คำขอ หรือกด Run workflow ในแท็บ Actions พร้อมพิมพ์หัวข้อ
3. สิ่งที่ได้: PR draft (L3) + Reading Manifest แยกชัดว่ามาตรฐานไหนอ้างได้/ไหนต้องอ่านเข้าทะเบียนก่อน (ratchet)
4. กติกาถาวร: pipeline ผลิตได้แค่ draft — verification (อ่านแหล่งจริง+excerpt) ทำใน Cowork แล้วยกเป็น L1 โดยคุณ merge เอง | ไม่มี key = workflow จบเขียวเฉยๆ ไม่พัง
