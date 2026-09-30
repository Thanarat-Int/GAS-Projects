# Google Apps Script Admin Web App

โปรเจกต์ Apps Script `MC Materials Chonburi` เป็นทั้ง Backend และ Frontend ของผู้ดูแลระบบ โดยใช้ Google Sheet เดิมเป็นฐานข้อมูลกลาง

## ไฟล์เดิมที่ต้องเก็บไว้

1. `appsscript.json`
2. `Config.gs`
3. `Schema.gs`
4. `SeedData.gs`
5. `InkSeedData.gs`
6. `Setup.gs`

## ไฟล์ Admin ที่ต้องเพิ่ม

สร้างไฟล์ Script ผ่านเครื่องหมายบวก > สคริปต์ แล้วคัดลอกเนื้อหาจากไฟล์ชื่อเดียวกัน

1. `AdminData.gs`
2. `AdminActions.gs`
3. `AdminInk.gs`
4. `AdminWeb.gs`

สร้างไฟล์ HTML ผ่านเครื่องหมายบวก > HTML แล้วตั้งชื่อโดยไม่ต้องพิมพ์ `.html`

1. `AdminBridge.html`
2. `AdminIndex.html`
3. `AdminStyles.html`
4. `AdminFont1.html`
5. `AdminFont2.html`
6. `AdminFont3.html`
7. `AdminFont4.html`
8. `AdminScripts.html`

`AdminIndex.html` ฝังโลโก้ไว้แล้ว และ `AdminFont1.html` ถึง `AdminFont4.html` ฝังฟอนต์ THSarabunPSK สำหรับเอกสาร PDF ไว้แล้ว จึงไม่ต้องอัปโหลดโฟลเดอร์ `web/assets`

## ตรวจสอบก่อน Deploy

1. บันทึกทุกไฟล์
2. เลือกฟังก์ชัน `validateMaterialDatabase` แล้วกดเรียกใช้
3. ต้องจบโดยไม่มีข้อผิดพลาด
4. ตรวจว่าอีเมลบัญชีที่ Deploy อยู่ใน `MATERIAL_CONFIG.ADMIN_EMAILS`

## Deploy

1. กด `ทำให้ใช้งานได้` > `การทำให้ใช้งานได้รายการใหม่`
2. เลือกประเภท `เว็บแอป`
3. ตั้งชื่อเวอร์ชัน เช่น `Admin v1`
4. เลือกเรียกใช้งานในชื่อบัญชีผู้ Deploy
5. เลือกผู้มีสิทธิ์เข้าถึงเป็น `เฉพาะฉัน` เท่านั้นสำหรับ Admin รุ่นแรก
6. กด Deploy และเก็บ URL ที่ลงท้ายด้วย `/exec`

ห้ามเปิด Admin Web App เป็นสาธารณะ เนื่องจากมีคำสั่งแก้สต็อก อนุมัติ จ่ายวัสดุ และจัดการข้อมูลหลัก โค้ดตรวจอีเมลผู้ใช้ที่เข้าจริงและปฏิเสธเมื่อ Google ไม่ส่งอีเมลกลับมา

## การแก้ไขในอนาคต

เมื่อแก้ไฟล์ในโฟลเดอร์ `web` ให้รันคำสั่งนี้เพื่อสร้างไฟล์ HTML ใหม่

```powershell
npm run build:gas-admin
```

จากนั้นคัดลอก `AdminIndex.html`, `AdminStyles.html`, `AdminScripts.html` และไฟล์ `AdminFont*.html` ทับไฟล์ใน Apps Script แล้วสร้าง Deployment เวอร์ชันใหม่
