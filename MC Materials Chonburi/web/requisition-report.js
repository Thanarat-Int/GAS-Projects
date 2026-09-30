import { displayDate } from './dates.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

const REQUESTER_SIGNERS = new Map([
  ['บริหาร', { name: 'นางสาวอุไร คูณค้ำ', position: 'นักวิชาการศึกษา' }],
  ['วิชาการ', { name: 'นางอำภา สมการ', position: 'นักวิชาการศึกษา' }],
]);

export const REQUISITION_FIXED_SIGNERS = Object.freeze({
  issuer: Object.freeze({ name: 'นางสาวธัญธรัตน์ สมบูรณ์เงิน', position: 'เจ้าพนักงานธุรการ' }),
  approver: Object.freeze({ name: 'ผศ.พิเศษ นายแพทย์อาทิตย์ ต่อพงษ์พันธุ์', position: 'ผู้อำนวยการศูนย์แพทยศาสตรศึกษาชั้นคลินิก', organization: 'โรงพยาบาลชลบุรี' }),
});

function normalizedDepartment(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function requisitionRequesterSigner(requisition) {
  const department = normalizedDepartment(requisition?.department);
  return REQUESTER_SIGNERS.get(department) || {
    name: String(requisition?.requesterName || '-').trim() || '-',
    position: 'ผู้ขอเบิกวัสดุ',
  };
}

function balancedChunks(rows, maximumSize) {
  if (!rows.length) return [];
  const count = Math.ceil(rows.length / maximumSize);
  const baseSize = Math.floor(rows.length / count);
  let remainder = rows.length % count;
  let cursor = 0;
  return Array.from({ length: count }, () => {
    const size = baseSize + (remainder-- > 0 ? 1 : 0);
    const chunk = rows.slice(cursor, cursor + size);
    cursor += size;
    return chunk;
  });
}

function paginateLines(lines) {
  const rows = Array.isArray(lines) ? lines : [];
  if (rows.length <= 8) return [rows];
  const signatureRows = rows.slice(-8);
  const regularRows = rows.slice(0, -8);
  return [...balancedChunks(regularRows, 14), signatureRows].filter(page => page.length);
}

function quantity(value) {
  const number = Number(value || 0);
  return Number.isSafeInteger(number) && number > 0
    ? new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(number)
    : '-';
}

function lineRows(lines, startIndex) {
  return lines.map((line, index) => `<tr>
    <td class="center">${startIndex + index + 1}</td>
    <td class="material">${escapeHtml(line.materialName || '-')}</td>
    <td class="center">${escapeHtml(line.unit || '-')}</td>
    <td class="number">${quantity(line.quantity)}</td>
    <td class="number">${quantity(line.issueQuantity ?? line.quantity)}</td>
    <td>${escapeHtml(line.note || '')}</td>
  </tr>`).join('');
}

function signatureBlock(label, signer, extraClass = '') {
  return `<section class="signature ${extraClass}">
    <p>(ลงชื่อ) ................................................ ${label}</p>
    <strong>(${escapeHtml(signer.name)})</strong>
    <span>ตำแหน่ง: ${escapeHtml(signer.position)}</span>
    ${signer.organization ? `<span>${escapeHtml(signer.organization)}</span>` : ''}
    <p>วันที่: ................................................</p>
  </section>`;
}

export function buildRequisitionReportDocument({ requisition }) {
  if (!requisition) throw new TypeError('requisition is required');
  const lines = Array.isArray(requisition.lines) ? requisition.lines : [];
  const pages = paginateLines(lines);
  const requester = requisitionRequesterSigner(requisition);
  const department = normalizedDepartment(requisition.department) || '-';
  const requestNo = String(requisition.requestNo || '-');
  const reportDate = displayDate(requisition.requestDate, 'th');
  const safeTitle = `ใบเบิกวัสดุ_${requestNo}`;
  let rowStart = 0;

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(safeTitle)}</title>
  <style>
    @font-face { font-family: "TH Sarabun PSK"; src: url('/assets/fonts/THSarabunPSK%20Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; font-display: block; }
    @font-face { font-family: "TH Sarabun PSK"; src: url('/assets/fonts/THSarabunPSK%20Bold.ttf') format('truetype'); font-weight: 700; font-style: normal; font-display: block; }
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; background: #edf1ef; font-family: "TH Sarabun PSK", sans-serif; font-size: 15pt; }
    .report-toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 18px; color: #fff; background: #07543e; box-shadow: 0 2px 12px #10251d24; }
    .report-toolbar p { margin: 0; font-size: 16pt; font-weight: 700; }
    .report-toolbar div { display: flex; gap: 8px; }
    .report-toolbar button { min-height: 38px; padding: 0 16px; border: 1px solid #ffffff70; border-radius: 7px; color: inherit; background: transparent; font: 700 15pt "TH Sarabun PSK", sans-serif; cursor: pointer; }
    .report-toolbar button.primary { border-color: #fff; color: #07543e; background: #fff; }
    .report-page { position: relative; width: 210mm; min-height: 297mm; margin: 18px auto; padding: 12mm 14mm 10mm; background: #fff; box-shadow: 0 10px 36px #25332b20; break-inside: avoid; page-break-inside: avoid; }
    .report-header { text-align: center; line-height: 1.35; }
    .report-header h1 { margin: 0 0 1mm; font-size: 21pt; }
    .report-header h2 { margin: 0; font-size: 18pt; }
    .report-header p { margin: 1mm 0 0; font-size: 15pt; }
    .report-meta { display: flex; justify-content: space-between; gap: 12mm; margin: 5mm 0 3mm; font-size: 15pt; }
    .report-meta strong { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    col.no { width: 8%; } col.material { width: 40%; } col.unit { width: 13%; } col.quantity { width: 9%; } col.note { width: 21%; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { padding: 1.3mm 1.5mm; border: .3mm solid #111; vertical-align: middle; line-height: 1.2; }
    th { background: #f4f5f4; font-size: 14pt; font-weight: 700; text-align: center; }
    td { height: 8.5mm; font-size: 14pt; }
    td.center { text-align: center; } td.number { text-align: center; font-variant-numeric: tabular-nums; } td.material { text-align: left; }
    tfoot th, tfoot td { background: #fff; text-align: left; }
    tfoot td { min-height: 12mm; white-space: pre-wrap; }
    .signature-area { margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; font-size: 14pt; }
    .signature-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; }
    .signature { text-align: center; line-height: 1.25; }
    .signature p { margin: 0 0 1mm; }
    .signature strong, .signature span { display: block; }
    .signature.approver { width: 110mm; margin: 3mm auto 0; }
    .page-number { position: absolute; right: 14mm; bottom: 6mm; color: #555; font-size: 12pt; }
    @media print {
      body { background: #fff; }
      .report-toolbar { display: none; }
      .report-page { width: 210mm; min-height: 277mm; margin: 0; padding: 12mm 14mm 10mm; box-shadow: none; }
      .report-page:not(:last-child) { break-after: page; page-break-after: always; }
    }
    @media screen and (max-width: 760px) {
      .report-page { margin: 10px; }
      .report-toolbar { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="report-toolbar">
    <p>ตรวจสอบใบเบิกก่อนพิมพ์หรือบันทึกเป็น PDF</p>
    <div><button type="button" onclick="window.close()">ปิด</button><button class="primary" type="button" onclick="document.fonts.ready.then(() => window.print())">พิมพ์ / บันทึก PDF</button></div>
  </div>
  <main>
    ${pages.map((pageLines, pageIndex) => {
      const isLastPage = pageIndex === pages.length - 1;
      const rows = lineRows(pageLines, rowStart);
      rowStart += pageLines.length;
      return `<section class="report-page${pageIndex ? ' report-page--continued' : ''}" data-report-page="${pageIndex + 1}">
        <header class="report-header">
          <h1>ใบเบิกวัสดุ</h1>
          <h2>ศูนย์แพทยศาสตรศึกษาชั้นคลินิก โรงพยาบาลชลบุรี</h2>
          <p>ข้าพเจ้าขอเบิกวัสดุตามรายการข้างล่างนี้ เพื่อไว้ใช้ในฝ่าย${escapeHtml(department)} ศูนย์แพทย์ฯ</p>
        </header>
        <div class="report-meta"><span><strong>วันที่:</strong> ${escapeHtml(reportDate)}</span><span><strong>เลขที่ใบเบิก:</strong> ${escapeHtml(requestNo)}</span></div>
        <table aria-label="รายการเบิกวัสดุ">
          <colgroup><col class="no"><col class="material"><col class="unit"><col class="quantity"><col class="quantity"><col class="note"></colgroup>
          <thead><tr><th>ลำดับ</th><th>รายการ</th><th>หน่วยนับ</th><th>เบิก</th><th>จ่าย</th><th>หมายเหตุ</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="center">ไม่มีรายการวัสดุ</td></tr>'}</tbody>
          ${isLastPage ? `<tfoot><tr><th colspan="2">วัตถุประสงค์การเบิก</th><td colspan="4">${escapeHtml(requisition.note || '')}</td></tr></tfoot>` : ''}
        </table>
        ${isLastPage ? `<div class="signature-area">
          <div class="signature-row">
            ${signatureBlock('ผู้เบิก', requester)}
            ${signatureBlock('ผู้สั่งจ่าย', REQUISITION_FIXED_SIGNERS.issuer)}
          </div>
          ${signatureBlock('ผู้อนุมัติจ่าย', REQUISITION_FIXED_SIGNERS.approver, 'approver')}
        </div>` : ''}
        <span class="page-number">หน้า ${pageIndex + 1} / ${pages.length}</span>
      </section>`;
    }).join('')}
  </main>
</body>
</html>`;
}
