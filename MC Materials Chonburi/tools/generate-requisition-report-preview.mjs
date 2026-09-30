import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRequisitionReportDocument } from '../web/requisition-report.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputDirectory = path.join(root, 'tmp', 'pdfs');
const outputPath = path.join(outputDirectory, 'requisition-report-qa.html');

const requisition = {
  requestNo: 'REQ-2569-QA01',
  requestDate: '2026-09-19',
  requesterName: 'ผู้ขอเบิกทดสอบ',
  department: 'บริหาร',
  note: 'ใช้สำหรับสนับสนุนงานธุรการและการจัดประชุมประจำเดือน',
  lines: Array.from({ length: 6 }, (_, index) => ({
    materialId: `MAT-${index + 1}`,
    materialCode: `OFF-${String(index + 1).padStart(4, '0')}`,
    materialName: ['กระดาษถ่ายเอกสาร A4', 'ถ่านไฟฉายก้อนกลาง (C)', 'ลวดเย็บกระดาษ เบอร์ 10', 'แฟ้มเสนอเซ็นต์', 'ซองเอกสารสีน้ำตาล', 'ปากกาลูกลื่นสีน้ำเงิน'][index],
    unit: ['รีม', 'ก้อน', 'กล่อง', 'แฟ้ม', 'ซอง', 'แท่ง'][index],
    quantity: [8, 4, 3, 2, 12, 10][index],
    issueQuantity: [8, 3, 3, 2, 10, 10][index],
    note: index === 1 ? 'จ่ายได้ 3 ก้อนตามยอดคงเหลือ' : index === 4 ? 'จ่ายบางส่วน' : '',
  })),
};

fs.mkdirSync(outputDirectory, { recursive: true });
const document = buildRequisitionReportDocument({ requisition })
  .replace('<head>', '<head><base href="http://127.0.0.1:4176/">')
  .replace('<body>', '<body class="qa-print">')
  .replace('</style>', '@media screen { .report-toolbar { display: none; } }</style>');
fs.writeFileSync(outputPath, document, 'utf8');
console.log(outputPath);
