# Smart Bill Dashboard — Deployment Guide

## 📦 ไฟล์ในโฟลเดอร์นี้

| ไฟล์ | หน้าที่ |
|---|---|
| `setup.gs` | สร้าง database schema + seed ข้อมูลเริ่มต้น + custom menu |
| `code.gs` | Web App backend — serve HTML + API endpoints |
| `../mockup/index.html` | Frontend (ต้อง copy เข้าไปเป็น `Index.html` ใน Apps Script) |

## 🎯 โหมดการใช้งาน 2 แบบ

**Production (แนะนำ)** — Apps Script host ทุกอย่างเอง
- Apps Script serve HTML + API ผ่าน URL เดียว
- คนอื่นเข้าได้จากทุกที่ ผ่าน URL
- Frontend ใช้ `google.script.run` (ไม่ต้องตั้ง `WEB_APP_URL`)

**Local dev** — แก้โค้ดในเครื่อง
- เปิด `mockup/index.html` จาก disk
- ต้องใส่ `WEB_APP_URL` ใน HTML เพื่อ fetch ไป API

---

## 🚀 Production Setup — Apps Script host ทั้งหมด

### 1. สร้าง Google Sheet
[sheets.new](https://sheets.new) → ตั้งชื่อ `Smart Bill Dashboard`

### 2. เปิด Apps Script Editor
**Extensions → Apps Script**

### 3. วางไฟล์ทั้งหมด (3 ไฟล์)

**ไฟล์ 1: `setup.gs`** (มีอยู่แล้วถ้าคุณรันไปก่อน)
- ถ้ายังไม่มี: แทนที่ไฟล์ `Code.gs` เดิมด้วยเนื้อหาของ `setup.gs`

**ไฟล์ 2: `code.gs`**
- กดปุ่ม **+** ข้าง Files → **Script** → ตั้งชื่อ `code`
- วางเนื้อหา `apps-script/code.gs` ทั้งไฟล์

**ไฟล์ 3: `Index.html`** ⭐ สำคัญ
- กดปุ่ม **+** ข้าง Files → **HTML** → ตั้งชื่อ `Index` (พิมพ์ I ใหญ่)
- เปิด `mockup/index.html` ในเครื่อง copy ทั้งไฟล์ → วางลงไปแทนที่เนื้อหาเดิม
- **Save ทั้งหมด** (Ctrl+S)

> ⚠️ ชื่อต้องเป็น `Index` ตรงกับที่ `code.gs` เรียก (`createHtmlOutputFromFile('Index')`)

### 4. รัน Setup Database (ถ้ายังไม่ได้ทำ)
เลือกฟังก์ชัน **`setupDatabase`** → **▶ Run** → อนุญาตสิทธิ์

### 5. Deploy Web App
- **Deploy → New deployment**
- ไอคอนเฟือง ⚙️ → **Web app**
- กรอก:
  - Description: `Smart Bill Dashboard v1`
  - Execute as: **Me**
  - Who has access: **Anyone** (ถ้าอยากให้พนักงาน/ลูกค้าเข้าได้โดยไม่ต้อง login) หรือ **Anyone with Google account**
- กด **Deploy** → อนุญาตสิทธิ์
- **Copy Web app URL** — เช่น `https://script.google.com/macros/s/AKfycbx.../exec`

### 6. เปิดใช้งาน
- เปิด URL ที่ copy มาในเบราว์เซอร์
- เห็นหน้า Smart Bill Dashboard → toast "โหลดข้อมูลเรียบร้อย · 43 เมนู"
- **ส่ง URL นี้ให้พนักงาน/ทีมงานใช้ได้เลย** — ใช้ได้ทั้งมือถือ/tablet/คอม
- ไม่ต้องตั้ง `WEB_APP_URL` ใน HTML (google.script.run ใช้ได้เลยอัตโนมัติ)

---

## ✅ ฟีเจอร์ที่ทำงานได้

### หน้ากรอกบิล
- โหลดเมนูจาก Sheet `Menus` (ที่ `active = TRUE`)
- กดปุ่ม **💾 บันทึกบิล** → สร้างแถวใน `Bills` และ `BillItems` อัตโนมัติ
- Bill ID auto-generate รูปแบบ `BYYYYMMDD###` เช่น `B20260414001`

### หน้าจัดการเมนู
- เพิ่ม/แก้/ลบเมนู → เข้าสู่ Sheet `Menus` ทันที
- Toggle เปิด/ปิดการใช้งาน → อัปเดต `Menus.active`
- Bulk actions (เลือกหลายรายการแล้วเปิด/ปิด/ลบ)
- Export CSV ยังทำงาน (download ฝั่ง client)

### Dashboard
- **Overview / Daily / Matrix** คำนวณจาก `Bills` + `BillItems` จริงทั้งหมด
- Dropdown เดือนจะโชว์เฉพาะเดือนที่มีบิล (+ เดือนปัจจุบัน)
- ปุ่ม **🔄 รีเฟรช** reload ข้อมูลจาก Sheet
- KPIs, Channel cards, Category breakdown, Top 10, Matrix table, กราฟรายวัน — ทุกตัว compute จาก bills
- Insights auto-generate จากแนวโน้มจริง

---

## 🔧 Custom Menu (ใน Sheets)

หลัง setup แล้วจะมีเมนู **🏝️ Smart Bill** โผล่บนแถบเมนูของ Sheet:

| เมนู | หน้าที่ |
|---|---|
| 🛠️ Setup Database | สร้าง schema ใหม่ทั้งหมด (ใช้ครั้งแรก หรือ reset ทั้งระบบ) |
| 🔄 Reset Menus | ลบเมนูปัจจุบันแล้วใส่ seed 43 รายการ |
| 🗑️ Clear Menus | ลบเมนูทั้งหมดให้ว่าง |
| 🧹 Clear Bills | ลบ Bills + BillItems ทั้งหมด |
| ℹ️ ตรวจสอบโครงสร้าง | เช็คว่า schema ครบและ row count เท่าไหร่ |

---

## 🔄 อัปเดตโค้ดภายหลัง

ถ้าแก้ `setup.gs` หรือ `code.gs`:
1. แก้ใน Apps Script editor
2. Save
3. **สำหรับ `code.gs`** — ต้อง **Deploy → Manage deployments → Edit → New version → Deploy** ทุกครั้งที่เปลี่ยน API
4. URL ยังเหมือนเดิม ไม่ต้องแก้ frontend

**ถ้าเปลี่ยน URL** (สร้าง deployment ใหม่) → ต้องแก้ `WEB_APP_URL` ใน index.html ด้วย

---

## ❓ Troubleshooting

### "โหลดข้อมูลไม่สำเร็จ"
- เช็ค `WEB_APP_URL` ถูกต้องไหม (ต้องลงท้ายด้วย `/exec`)
- เช็ค Deploy setting "Who has access" = Anyone
- เปิด Console (F12) ดู error จริง

### CORS error
Apps Script web app รองรับ CORS อยู่แล้ว แต่ต้องใช้ `Content-Type: text/plain` (โค้ดทำไว้แล้ว) ถ้ายังเจอ — ลอง redeploy ใหม่เป็น New version

### ข้อมูลไม่อัปเดตหลังกดบันทึก
Dashboard จะ reload bills หลัง save bill อัตโนมัติ แต่ถ้ายังไม่เห็น กดปุ่ม **🔄 รีเฟรช** ที่ Dashboard

### รันสคริปต์แล้วเจอ "Cannot find method getSheet..."
ยังไม่รัน `setupDatabase` — ต้อง setup ก่อนใช้งาน API
