# MC Materials Chonburi

> ระบบจัดการวัสดุและหมึกสำหรับงานภายในองค์กร ตั้งแต่ทะเบียนวัสดุจนถึงอนุมัติคำขอเบิกและรายงานปีงบประมาณ

![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-V8-4285F4?style=flat-square&logo=googleappsscript&logoColor=white)
![Google Sheets](https://img.shields.io/badge/database-Google%20Sheets-34A853?style=flat-square&logo=googlesheets&logoColor=white)
![Node.js](https://img.shields.io/badge/local%20tooling-Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Tests](https://img.shields.io/badge/tests-15%20suites-0F766E?style=flat-square)

## ภาพรวม

MC Materials Chonburi เป็นเว็บแอปสองฝั่งที่ใช้ Google Sheet ชุดเดียวเป็นฐานข้อมูลกลาง:

- **Admin Web App** สำหรับทะเบียนวัสดุ รับเข้า ปรับยอด อนุมัติคำขอ จ่ายวัสดุ จัดการหมึก และออกรายงาน
- **User Web App** สำหรับค้นหาวัสดุ ส่งคำขอเบิกหลายรายการ และติดตามสถานะคำขอ
- **Google Sheets Database** สำหรับข้อมูลหลัก สต็อก ปีงบประมาณ รายการเคลื่อนไหว คำขอเบิก และ Audit Trail

```text
User Web App ─────┐
                  ├── Google Sheets Database
Admin Web App ────┘          │
                             └── Google Drive (รูปวัสดุ)
```

## ความสามารถหลัก

| โมดูล | ความสามารถ |
| --- | --- |
| ภาพรวม | สรุปสต็อก คำขอเบิก และกราฟแนวโน้มวัสดุ/หมึก |
| ทะเบียนวัสดุ | เพิ่ม แก้ไข เปิด/ปิดใช้งาน รูปภาพ และประเภทวัสดุ |
| คำขอเบิก | หลายรายการต่อคำขอ ปรับจำนวนอนุมัติ หมายเหตุต่อรายการ กันยอด และจ่ายจริง |
| ปีงบประมาณ | ปิดปี ยกยอดคงเหลือ และรายงาน PDF แบบรายเดือนหรือทั้งปี |
| หมึก | ซื้อ เบิก ปรับยอด เหตุผลการซื้อ และรายงานตามช่วงเวลา |
| ความถูกต้อง | Idempotency, optimistic versioning, stock ledger, validation และ audit log |

## โครงสร้างโปรเจกต์

```text
MC Materials Chonburi/
├── Admin*.gs / Admin*.html   # Admin Apps Script และไฟล์ build
├── User*.gs / User*.html     # User Apps Script และไฟล์ build
├── Config.gs                 # ค่าเชื่อมต่อฝั่ง Admin
├── Schema.gs                 # โครงสร้าง Google Sheets
├── SeedData.gs               # ประเภทและข้อมูลวัสดุตั้งต้น
├── InkSeedData.gs            # ข้อมูลหมึกตั้งต้น
├── Setup.gs                  # สร้าง/อัปเกรดฐานข้อมูล
├── web/                      # Frontend source
├── local/                    # Local development server
├── tools/                    # Build และ migration tools
├── tests/                    # Automated tests
└── docs/                     # คู่มือระบบและ deployment
```

## เริ่มต้นบนเครื่อง

ต้องมี Node.js 20 ขึ้นไปค่ะ

```powershell
npm ci
$env:MATERIAL_USER_ACCESS_CODE = "your-local-access-code"
npm run dev
```

เปิดหน้า Admin ที่ `http://127.0.0.1:4176` และหน้า User ที่ `http://127.0.0.1:4176/user`

## ทดสอบและ Build

```powershell
npm test
npm run build:gas-admin
npm run build:gas-user
```

ชุดทดสอบครอบคลุม schema/setup, local API, คำขอเบิก, รายงาน, หมึก, รูปภาพ, dashboard และ User portal ค่ะ

## ติดตั้งบน Google Apps Script

### 1. ตั้งค่าฐานข้อมูลและ Admin

1. แก้ `SPREADSHEET_ID`, `INITIAL_USER_ACCESS_CODE` และ `ADMIN_EMAILS` ใน `Config.gs`
2. คัดลอกไฟล์ตาม [คู่มือ Admin](./docs/google-apps-script-admin.md)
3. รัน `createMaterialDatabase` หนึ่งครั้ง
4. รัน `validateMaterialDatabase` เพื่อตรวจความครบถ้วน
5. Deploy เป็น Web App สำหรับผู้ดูแลเท่านั้น

### 2. ตั้งค่า User portal

1. ใส่ Spreadsheet ID เดียวกับ Admin และกำหนดรหัสเข้าใช้ใน `UserConfig.gs`
2. คัดลอกไฟล์ตาม [คู่มือ User](./docs/google-apps-script-user.md)
3. Deploy เป็น Web App แยกจาก Admin

> [!IMPORTANT]
> ค่าใน repository เป็น placeholder เท่านั้น ห้าม commit Spreadsheet ID, อีเมลผู้ดูแล, access code หรือข้อมูล runtime จริงค่ะ

## เอกสารเพิ่มเติม

- [โครงสร้างฐานข้อมูล Google Sheets](./docs/google-sheets-database.md)
- [การจัดเก็บรูปวัสดุ](./docs/material-images.md)
- [ขั้นตอนซื้อหมึก](./docs/ink-purchase-flow.md)
- [การนำเข้าข้อมูลจำนวนมาก](./docs/google-apps-script-bulk-import.md)

## Credits

Designed and developed by **Shěn**.
