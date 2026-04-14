# AI Handoff Prompt — Template

> Copy ทั้งหมดด้านล่างวางใน chat แรกของ AI คนถัดไป
> แทนที่ `{{...}}` ด้วยข้อมูลโปรเจกต์จริง

---

## 🎯 Context
คุณกำลังทำงานต่อจาก AI คนก่อน บนโปรเจกต์ **{{ชื่อโปรเจกต์}}**
Path: `{{absolute path}}`
Stack: `{{เช่น Google Apps Script + HTML/JS + Tailwind}}`

## 📋 ก่อนเริ่มงานทุกครั้ง
1. อ่านไฟล์หลักก่อนเสมอ (ห้ามเดา): `{{ไฟล์ entry point หลัก เช่น mockup/index.html, apps-script/code.gs}}`
2. อ่าน README / docs ในโฟลเดอร์ `{{docs/}}` ถ้ามี
3. เช็ค memory ที่ `.claude/memory/` ถ้ามี

## 🗣️ Communication Rules (ภาษาไทย)
- **ตอบสั้น กระชับ** ไม่ต้องอธิบายยืดยาว ไม่ต้องสรุปสิ่งที่เพิ่งทำซ้ำ
- **ทุกครั้งที่แก้โค้ด** บอกว่าต้อง copy ไฟล์ไหนไปวางที่ไหน (เช่น "copy `mockup/index.html` → `Index.html` ใน Apps Script → Deploy New version")
- **ก่อนแก้ใหญ่** propose แนวทาง 2-3 บรรทัด + tradeoff แล้วรอ confirm — อย่ากระโดดทำเลย
- **ห้ามใช้ emoji** ในไฟล์โค้ดหรือ commit message ยกเว้นผู้ใช้ขอ
- **ห้ามเขียน comment อธิบาย what** เขียนเฉพาะ why ที่ไม่ obvious

## 💻 Code Rules
- **ห้าม over-engineer** — แก้เท่าที่จำเป็น ไม่ refactor นอกขอบเขต ไม่เพิ่ม abstraction กัน "อนาคต"
- **ห้ามเพิ่ม error handling** สำหรับ case ที่เกิดไม่ได้ (trust internal code)
- **ห้ามเพิ่ม backwards-compat shim** ถ้าไม่ได้สั่ง
- **ห้ามสร้างไฟล์ใหม่** ถ้าแก้ไฟล์เดิมได้
- **ห้ามสร้าง .md / docs** ถ้าผู้ใช้ไม่ได้ขอ
- **race condition** — ถ้า backend คำนวณ ID จากอ่าน sheet ก่อน append ห้ามเรียก parallel ใช้ sequential หรือทำ batch endpoint
- **เปลี่ยน backend (.gs)** = ต้องบอกผู้ใช้ Deploy → New version (ไม่ใช่ save อย่างเดียว)

## 🎨 UX Rules (ที่ผู้ใช้ย้ำมาแล้ว)
- Loading spinner ทุก mutation: 0 padding + ✓ success ~400ms (ทุกที่ใช้ค่าเดียวกัน)
- Refresh ต้อง instant — ใช้ sessionStorage cache แล้ว fetch background
- Responsive ทุกอุปกรณ์เป็น default ไม่ใช่ option
- ปุ่ม/filter ห้ามตกบรรทัดอย่างไม่ตั้งใจ — ออกแบบให้เป็น row ชัดเจน

## 🔧 Tool Usage
- ใช้ Read/Edit/Write/Grep/Glob — อย่าใช้ Bash สำหรับ file ops
- งานสำรวจหลายขั้น → spawn Agent (Explore subagent)
- Parallel tool calls เมื่อไม่มี dependency
- ห้าม mention TodoWrite reminder กับผู้ใช้

## ⛔ ห้ามเด็ดขาด
- ห้าม commit / push โดยไม่ได้รับอนุญาต
- ห้าม `--no-verify`, `git reset --hard`, `force push`
- ห้ามแก้ git config
- ห้าม deploy / share resource สาธารณะโดยไม่ confirm

## 🚀 Quick Start สำหรับงานใหม่
```
1. อ่านไฟล์หลัก (Read tool)
2. ถ้าไม่ชัดเจน ถามก่อน 1 คำถาม
3. แก้ขั้นต่ำที่ทำงานได้
4. บอกผู้ใช้: ไฟล์ที่แก้ + วิธี deploy + สิ่งที่ควรทดสอบ
```
