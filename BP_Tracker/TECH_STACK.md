# Tech Stack Summary: BP Tracker

โปรเจกต์นี้เป็น Web Application (PWA Style) ที่รันบน **Google Apps Script (GAS)** โดยเน้นการใช้งานผ่านมือถือเพื่อบันทึกและติดตามค่าความดันโลหิต พัฒนาด้วยเทคโนโลยีดังนี้:

## 1. Frontend (User Interface)
ส่วนหน้าบ้านที่ผู้ใช้โต้ตอบ ทำงานแบบ Single Page Application (SPA) อย่างง่ายภายในไฟล์ `index.html`

*   **Core**: HTML5, Vanilla JavaScript (ES6+)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/) (โหลดผ่าน CDN) - ใช้สำหรับจัด Layout และตกแต่ง UI ทั้งหมด
*   **Charting**: [Chart.js](https://www.chartjs.org/) - ใช้แสดงกราฟแนวโน้มความดันโลหิต
*   **Icons**: [Phosphor Icons](https://phosphoricons.com/) - ชุดไอคอนที่ดูทันสมัยและสะอาดตา
*   **Fonts**: [Google Fonts](https://fonts.google.com/)
    *   **Kanit**: ใช้สำหรับข้อความทั่วไป (UI ภาษาไทย)
    *   **Inter**: ใช้สำหรับแสดงตัวเลข (Digital/Mono style)

## 2. Backend (Server Logic)
รันบน Google Apps Script (`Code.js`) ทำหน้าที่รับคำขอจาก Frontend และจัดการข้อมูล

*   **Runtime**: Google Apps Script (V8 Engine) - **เขียนด้วย JavaScript ทั้งหมด (ไม่ใช่ Python)**
*   **API Services**:
    *   **SpreadsheetApp**: ใช้ Google Sheets เป็นฐานข้อมูล (`BP_Tracker_Database`) ในการบันทึกประวัติ
    *   **HtmlService**: ใช้ Render หน้าเว็บ (`index.html`) ส่งไปยังผู้ใช้
    *   **DriveApp (Drive API)**: ใช้จัดการไฟล์รูปภาพชั่วคราวเพื่อส่งเข้ากระบวนการ OCR
    *   **DocumentApp**: ใช้ดึงข้อความที่ได้จากการแปลง OCR

## 3. Key Features & Algorithms
ฟีเจอร์หลักในการทำงานของระบบ

*   **Camera Integration**: ใช้ `navigator.mediaDevices.getUserMedia` เพื่อเปิดกล้องผ่าน Browser โดยตรง
*   **Image Pre-processing**: ใช้ HTML5 Canvas ในการ Crop ภาพ, ปรับ Contrast, และทำ Grayscale ก่อนส่งไป Server เพื่อเพิ่มความแม่นยำให้ OCR
*   **OCR (Optical Character Recognition)**:
    *   **ไม่ได้ใช้ Python/Tesseract**: โปรเจกต์นี้ใช้ **Google Drive API** (Built-in Feature) ในการแปลงภาพเป็นข้อความ
    *   **วิธีการทำงาน**: อัปโหลดรูปภาพขึ้น Drive และสั่งเปิดด้วย Google Docs (Convert to text) แล้วใช้ Apps Script อ่าน Text ออกมา
*   **Data Extraction Algorithm**: อัลกอริทึม Custom ในฟังก์ชัน `extractBPData` เพื่อ:
    *   กรอง Noise จากการอ่านค่า OCR
    *   แก้ไขตัวเลขที่ผิดเพี้ยนบ่อย (เช่น B->8, O->0, I->1)
    *   **Physiological Verify**: ตรวจสอบความสมเหตุสมผลของค่าความดัน (Sys > Dia, Pulse Pressure อยู่ในเกณฑ์) เพื่อเลือกคู่ตัวเลขที่น่าจะเป็นค่าความดันจริงที่สุด

## 4. Deployment
*   **Type**: Google Apps Script Web App
*   **Access**: Execute as User accessing the web app (หรือ Me ขึ้นอยู่กับการตั้งค่า)
*   **Permissions Required**: Camera (Frontend), Drive & Sheets (Backend)

---
## สรุป Tech Stack (อย่างย่อ)
*   **HTML5 / JavaScript**: โครงสร้างและตรรกะการทำงานหลักของ Web App
*   **Tailwind CSS**: จัดความสวยงามและ Layout (UI Design)
*   **Chart.js**: สร้างกราฟแสดงแนวโน้มความดันโลหิต
*   **Google Apps Script**: เป็น Server Backend ประมวลผลข้อมูล (JavaScript Language)
*   **Google Sheets**: เป็น Database เก็บข้อมูลประวัติการวัด
*   **Google Drive API**: ใช้ทำ OCR (Built-in Service) **ไม่ต้องใช้ Python หรือ Server แยก**
