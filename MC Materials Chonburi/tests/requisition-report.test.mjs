import assert from 'node:assert/strict';
import {
  buildRequisitionReportDocument,
  requisitionRequesterSigner,
  REQUISITION_FIXED_SIGNERS,
} from '../web/requisition-report.js';

const lines = Array.from({ length: 20 }, (_, index) => ({
  materialName: `วัสดุทดสอบ ${index + 1}`,
  materialCode: `TEST-${String(index + 1).padStart(3, '0')}`,
  unit: 'ชิ้น',
  quantity: index + 1,
  issueQuantity: Math.max(1, index),
  note: index === 1 ? 'จ่ายตามยอดที่อนุมัติ' : '',
}));

const requisition = {
  requestNo: 'REQ-2569-0001',
  requestDate: '2026-09-19',
  requesterName: 'ชื่อจากแบบคำขอ',
  department: 'บริหาร',
  note: 'ใช้สำหรับงานประจำฝ่าย',
  lines,
};

assert.deepEqual(requisitionRequesterSigner(requisition), {
  name: 'นางสาวอุไร คูณค้ำ',
  position: 'นักวิชาการศึกษา',
});
assert.deepEqual(requisitionRequesterSigner({ ...requisition, department: 'วิชาการ' }), {
  name: 'นางอำภา สมการ',
  position: 'นักวิชาการศึกษา',
});
assert.deepEqual(requisitionRequesterSigner({ ...requisition, department: 'ฝ่ายอื่น' }), {
  name: 'ชื่อจากแบบคำขอ',
  position: 'ผู้ขอเบิกวัสดุ',
});
assert.equal(REQUISITION_FIXED_SIGNERS.issuer.name, 'นางสาวธัญธรัตน์ สมบูรณ์เงิน');
assert.equal(REQUISITION_FIXED_SIGNERS.approver.name, 'ผศ.พิเศษ นายแพทย์อาทิตย์ ต่อพงษ์พันธุ์');

const document = buildRequisitionReportDocument({ requisition });
assert.match(document, /<title>ใบเบิกวัสดุ_REQ-2569-0001<\/title>/);
assert.match(document, /19 กันยายน 2569/);
assert.match(document, /ฝ่ายบริหาร/);
assert.match(document, /นางสาวอุไร คูณค้ำ/);
assert.match(document, /นางสาวธัญธรัตน์ สมบูรณ์เงิน/);
assert.match(document, /ผศ\.พิเศษ นายแพทย์อาทิตย์ ต่อพงษ์พันธุ์/);
assert.match(document, /เจ้าพนักงานธุรการ/);
assert.match(document, /ผู้อำนวยการศูนย์แพทยศาสตรศึกษาชั้นคลินิก/);
assert.match(document, /โรงพยาบาลชลบุรี/);
assert.match(document, /THSarabunPSK%20Regular\.ttf/);
assert.match(document, /@page \{ size: A4 portrait; margin: 0; \}/);
assert.match(document, /<th colspan="2">วัตถุประสงค์การเบิก<\/th><td colspan="4">ใช้สำหรับงานประจำฝ่าย<\/td>/);
assert.match(document, /จ่ายตามยอดที่อนุมัติ/);
assert.match(document, /วัสดุทดสอบ 2<\/td>[\s\S]*?<td class="number">2<\/td>[\s\S]*?<td class="number">1<\/td>/);
assert.doesNotMatch(document, /class="request-note"/);
assert.equal((document.match(/data-report-page=/g) || []).length, 2, '20 lines should fit on two A4 pages with signatures reserved on the final page');
assert.equal((document.match(/ผู้เบิก/g) || []).length, 1);
assert.equal((document.match(/ผู้สั่งจ่าย/g) || []).length, 1);
assert.equal((document.match(/ผู้อนุมัติจ่าย/g) || []).length, 1);
assert.match(document, /พิมพ์ \/ บันทึก PDF/);

console.log('PASS requisition report: department signers, fixed issuer and director, full Thai date, pagination and TH Sarabun PSK print layout are consistent.');
