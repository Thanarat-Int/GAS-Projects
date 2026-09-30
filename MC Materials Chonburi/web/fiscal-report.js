import { displayDate } from './dates.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

const numberFormatter = lang => new Intl.NumberFormat(lang === 'th' ? 'th-TH' : 'en-US', { maximumFractionDigits: 3 });
const moneyFormatter = lang => new Intl.NumberFormat(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const reportNumber = (value, lang) => Number(value || 0) === 0 ? '-' : numberFormatter(lang).format(Number(value));
const reportMoney = (value, lang) => Number(value || 0) === 0 ? '-' : moneyFormatter(lang).format(Number(value));

function reportDate(value, lang) {
  return value ? displayDate(value, lang) : '-';
}

function reportRows(rows, lang, startIndex = 0) {
  return rows.map((item, index) => {
    const received = Number(item.receivedBeforeSystem || 0) + Number(item.receivedInSystem || 0);
    const issued = Number(item.issuedBeforeSystem || 0) + Number(item.issuedInSystem || 0);
    const totalReceived = Number(item.reportedTotalReceived || 0) + Number(item.receivedInSystem || 0);
    return `<tr>
      <td class="center">${numberFormatter(lang).format(startIndex + index + 1)}</td>
      <td class="material-name">${escapeHtml(item.materialName)}</td>
      <td class="center">${escapeHtml(item.material?.unit || '-')}</td>
      <td class="number">${reportNumber(item.openingBalance, lang)}</td>
      <td class="number">${reportNumber(received, lang)}</td>
      <td class="number">${reportNumber(totalReceived, lang)}</td>
      <td class="number">${reportNumber(issued, lang)}</td>
      <td class="number">${reportNumber(item.closingBalance, lang)}</td>
      <td class="number">${reportMoney(item.latestPrice, lang)}</td>
      <td class="number">${reportMoney(item.reportedValue, lang)}</td>
      <td>${escapeHtml(item.note || '')}</td>
    </tr>`;
  }).join('');
}

function monthlyRows(rows, lang, startIndex = 0) {
  const th = lang === 'th';
  return rows.map((item, index) => {
    const unavailable = item.opening === null;
    const quantity = value => unavailable ? '-' : numberFormatter(lang).format(value);
    const adjustment = unavailable ? '-' : `${item.adjusted > 0 ? '+' : ''}${numberFormatter(lang).format(item.adjusted)}`;
    const note = unavailable
      ? th ? 'ก่อนเริ่มบันทึกข้อมูลรายเดือน' : 'Before monthly tracking began'
      : item.partial
        ? th ? `เริ่มบันทึก ${reportDate(item.trackingStartedAt, lang)}` : `Tracking began ${reportDate(item.trackingStartedAt, lang)}`
        : '';
    return `<tr>
      <td class="center">${numberFormatter(lang).format(startIndex + index + 1)}</td>
      <td class="material-name">${escapeHtml(item.materialName)}<small>${escapeHtml(item.materialCode || '')}</small></td>
      <td class="center">${escapeHtml(item.material?.unit || '-')}</td>
      <td class="number">${quantity(item.opening)}</td>
      <td class="number">${quantity(item.received)}</td>
      <td class="number">${quantity(item.issued)}</td>
      <td class="number">${adjustment}</td>
      <td class="number">${quantity(item.closing)}</td>
      <td>${escapeHtml(note)}</td>
    </tr>`;
  }).join('');
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

function paginateReportRows(rows, { hasDocumentHeader, reserveSignature, monthly = false }) {
  const firstPageCapacity = monthly ? hasDocumentHeader ? 9 : 12 : hasDocumentHeader ? 13 : 17;
  const singlePageCapacity = reserveSignature
    ? monthly ? hasDocumentHeader ? 6 : 9 : hasDocumentHeader ? 8 : 12
    : firstPageCapacity;
  if (rows.length <= singlePageCapacity) return [rows];

  const pages = [rows.slice(0, firstPageCapacity)];
  const remaining = rows.slice(firstPageCapacity);
  if (!reserveSignature) return [...pages, ...balancedChunks(remaining, monthly ? 12 : 17)];

  const signatureRows = remaining.slice(Math.max(0, remaining.length - (monthly ? 9 : 12)));
  const regularRows = remaining.slice(0, remaining.length - signatureRows.length);
  return [...pages, ...balancedChunks(regularRows, monthly ? 12 : 17), signatureRows].filter(page => page.length);
}

function tableHead(fiscalYear, th) {
  return `<colgroup><col class="no"><col class="name"><col class="unit"><col class="small"><col class="small"><col class="small"><col class="small"><col class="small"><col class="money"><col class="money"><col class="note"></colgroup>
      <thead>
        <tr><th rowspan="2">${th ? 'ลำดับ' : 'No.'}</th><th rowspan="2">${th ? 'รายการวัสดุ' : 'Material'}</th><th>${th ? 'บรรจุ' : 'Package'}</th><th>${th ? `ปีงบประมาณ ณ ${fiscalYear - 1}` : `Fiscal year ${fiscalYear - 1}`}</th><th>${th ? `ปีงบประมาณ ณ ${fiscalYear}` : `Fiscal year ${fiscalYear}`}</th><th rowspan="2">${th ? 'รวมจำนวนรับ' : 'Total received'}</th><th rowspan="2">${th ? 'รวมจำนวนจ่าย' : 'Total issued'}</th><th colspan="3">${th ? `คงเหลือสิ้นปีงบประมาณ ${fiscalYear}` : `Closing balance FY ${fiscalYear}`}</th><th rowspan="2">${th ? 'หมายเหตุ' : 'Note'}</th></tr>
        <tr><th>${th ? 'หน่วยนับ' : 'Unit'}</th><th>${th ? 'คงเหลือยกมา' : 'Opening balance'}</th><th>${th ? 'รับระหว่างปี' : 'Received during year'}</th><th>${th ? 'จำนวน (หน่วย)' : 'Quantity'}</th><th>${th ? 'ราคา/หน่วยล่าสุด' : 'Latest unit price'}</th><th>${th ? 'ราคารวม' : 'Total value'}</th></tr>
      </thead>`;
}

function monthlyTableHead(th) {
  return `<colgroup><col style="width:4%"><col style="width:31%"><col style="width:7%"><col style="width:10%"><col style="width:8%"><col style="width:8%"><col style="width:9%"><col style="width:10%"><col style="width:13%"></colgroup>
    <thead><tr><th>${th ? 'ลำดับ' : 'No.'}</th><th>${th ? 'รายการวัสดุ' : 'Material'}</th><th>${th ? 'หน่วยนับ' : 'Unit'}</th><th>${th ? 'ยอดต้นเดือน / เริ่มใช้' : 'Opening / starting balance'}</th><th>${th ? 'รับ' : 'In'}</th><th>${th ? 'จ่าย' : 'Out'}</th><th>${th ? 'ปรับปรุง' : 'Adjusted'}</th><th>${th ? 'ยอดปลายเดือน' : 'Closing balance'}</th><th>${th ? 'หมายเหตุ' : 'Note'}</th></tr></thead>`;
}

function buildReportDocument({ fiscalYear, startDate, endDate, sections, lang, combined, month = '', partialMonth = false }) {
  const th = lang === 'th';
  const monthly = Boolean(month);
  const monthTitle = monthly ? new Intl.DateTimeFormat(th ? 'th-TH' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00.000Z`)) : '';
  const title = monthly
    ? partialMonth
      ? th ? `รายงานช่วงเริ่มใช้ระบบ เดือน${monthTitle}` : `System start period - ${monthTitle}`
      : th ? `รายงานสรุปยอดวัสดุประจำเดือน${monthTitle}` : `Monthly material stock report - ${monthTitle}`
    : th ? `รายงานตรวจสอบพัสดุประจำปีงบประมาณ ${fiscalYear}` : `Annual inventory inspection report - Fiscal year ${fiscalYear}`;
  const safeTitle = escapeHtml(title);
  const printableSections = combined ? sections.filter(section => section.rows.length) : sections;
  const finalSections = printableSections.length ? printableSections : monthly && combined ? [{ categoryName: th ? 'ทุกประเภทวัสดุ' : 'All material categories', rows: [] }] : sections.slice(0, 1);
  const documentSuffix = combined
    ? th ? 'รวมทุกประเภทวัสดุ' : 'All material categories'
    : finalSections[0]?.categoryName || '';
  const signature = th
    ? `<strong>ผศ.พิเศษ นายแพทย์อาทิตย์ ต่อพงษ์พันธุ์</strong><span>ผู้อำนวยการศูนย์แพทยศาสตรศึกษาชั้นคลินิก</span><span>โรงพยาบาลชลบุรี</span>`
    : `<strong>Asst. Prof. Atit Torpongpan</strong><span>Director, Clinical Medical Education Center</span><span>Chonburi Hospital</span>`;
  const pages = [];

  finalSections.forEach((section, sectionIndex) => {
    const sectionRows = section.rows || [];
    const chunks = paginateReportRows(sectionRows, {
      hasDocumentHeader: sectionIndex === 0,
      reserveSignature: sectionIndex === finalSections.length - 1,
      monthly,
    });
    let rowStart = 0;
    chunks.forEach((pageRows, categoryPageIndex) => {
      pages.push({
        section,
        pageRows,
        rowStart,
        showDocumentHeader: sectionIndex === 0 && categoryPageIndex === 0,
        isCategoryLastPage: categoryPageIndex === chunks.length - 1,
      });
      rowStart += pageRows.length;
    });
  });

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeTitle} - ${escapeHtml(documentSuffix)}</title>
  <style>
    @font-face { font-family: "TH Sarabun PSK"; src: url('/assets/fonts/THSarabunPSK%20Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; font-display: block; }
    @font-face { font-family: "TH Sarabun PSK"; src: url('/assets/fonts/THSarabunPSK%20Bold.ttf') format('truetype'); font-weight: 700; font-style: normal; font-display: block; }
    @font-face { font-family: "TH Sarabun PSK"; src: url('/assets/fonts/THSarabunPSK%20Italic.ttf') format('truetype'); font-weight: 400; font-style: italic; font-display: block; }
    @font-face { font-family: "TH Sarabun PSK"; src: url('/assets/fonts/THSarabunPSK%20BoldItalic.ttf') format('truetype'); font-weight: 700; font-style: italic; font-display: block; }
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; background: #eef1ef; font-family: "TH Sarabun PSK", sans-serif; font-size: 12pt; }
    .report-toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 18px; color: #fff; background: #07543e; box-shadow: 0 2px 12px #10251d24; }
    .report-toolbar p { margin: 0; font-size: 12pt; font-weight: 700; }
    .report-toolbar div { display: flex; gap: 8px; }
    .report-toolbar button { min-height: 38px; padding: 0 16px; border: 1px solid #ffffff70; border-radius: 7px; color: inherit; background: transparent; font: 700 12pt "TH Sarabun PSK", sans-serif; cursor: pointer; }
    .report-toolbar button.primary { border-color: #fff; color: #07543e; background: #fff; }
    .report-page { width: 279mm; min-height: 190mm; margin: 18px auto; padding: 11mm 9mm 13mm; background: #fff; box-shadow: 0 10px 36px #25332b20; }
    .page-break { display: none; }
    .report-header { margin-bottom: 5mm; text-align: center; line-height: 1.45; }
    .report-header h1 { margin: 0 0 1.2mm; font-size: 16pt; font-weight: 700; }
    .report-header p { margin: .5mm 0; font-size: 12pt; font-weight: 700; }
    .report-scope { font-weight: 700; }
    .category { margin: 0 0 2.5mm; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    col.no { width: 4%; } col.name { width: 25%; } col.unit { width: 6%; } col.small { width: 7%; } col.money { width: 8%; } col.note { width: 12%; }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { padding: 1.6mm 1.2mm; border: .25mm solid #111; vertical-align: middle; line-height: 1.35; }
    th { background: #f3f5f4; font-size: 10.5pt; font-weight: 700; text-align: center; }
    td { font-size: 11pt; }
    td.material-name small { display: block; font-size: 9pt; color: #555; }
    td.center { text-align: center; } td.number { text-align: right; font-variant-numeric: tabular-nums; } td.material-name { font-weight: 500; }
    tfoot td { font-weight: 700; background: #f8f9f8; }
    .signature { width: 88mm; margin: 18mm 12mm 0 auto; break-inside: avoid; page-break-inside: avoid; text-align: center; line-height: 1.65; }
    .signature::before { content: ""; display: block; width: 68mm; margin: 0 auto 2mm; border-top: .25mm dotted #111; }
    .signature strong, .signature span { display: block; }
    .signature strong { font-weight: 700; }
    @media print {
      body { background: #fff; }
      .report-toolbar { display: none; }
      .report-page { width: auto; min-height: 0; margin: 0; padding: 11mm 9mm 13mm; box-shadow: none; }
      .page-break { display: block; height: 0; break-after: page; page-break-after: always; }
      .report-page--last { break-before: page; page-break-before: always; }
      .report-page--combined-last { padding-bottom: 13mm; }
      .monthly-report .signature { margin-top: 5mm; line-height: 1.35; }
      .monthly-report .report-page--last { padding-bottom: 7mm; }
    }
    @media screen and (max-width: 900px) {
      .report-page { width: 279mm; margin: 10px; }
      .report-toolbar { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body class="${monthly ? 'monthly-report' : ''}">
  <div class="report-toolbar">
    <p>${th ? 'ตรวจสอบเอกสารก่อนพิมพ์หรือบันทึกเป็น PDF' : 'Review before printing or saving as PDF'}</p>
    <div><button type="button" onclick="window.close()">${th ? 'ปิด' : 'Close'}</button><button class="primary" type="button" onclick="document.fonts.ready.then(() => window.print())">${th ? 'พิมพ์ / บันทึก PDF' : 'Print / Save PDF'}</button></div>
  </div>
  <main class="report-document">
    ${pages.map((page, pageIndex) => {
      const isDocumentLastPage = pageIndex === pages.length - 1;
      const categoryTotal = (page.section.rows || []).reduce((total, item) => total + Number(item.reportedValue || 0), 0);
      const pageHeader = page.showDocumentHeader ? `<header class="report-header">
      <h1>${safeTitle}</h1>
      ${combined ? `<p class="report-scope">${th ? 'รวมทุกประเภทวัสดุ' : 'All material categories'}</p>` : ''}
      ${monthly ? `<p>${th ? `ปีงบประมาณ ${fiscalYear}` : `Fiscal year ${fiscalYear}`}</p>` : ''}
      <p>${th ? 'ตามพระราชบัญญัติการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560' : 'In accordance with the Public Procurement and Supplies Administration Act B.E. 2560'}</p>
      <p>${th ? 'หน่วยงาน ศูนย์แพทยศาสตรศึกษาชั้นคลินิก โรงพยาบาลชลบุรี' : 'Clinical Medical Education Center, Chonburi Hospital'}</p>
      <p>${th ? `วันที่ ${reportDate(startDate, lang)} ถึงวันที่ ${reportDate(endDate, lang)}` : `${reportDate(startDate, lang)} to ${reportDate(endDate, lang)}`}</p>
    </header>` : '';
      const bodyRows = page.section.rows.length
        ? monthly ? monthlyRows(page.pageRows, lang, page.rowStart) : reportRows(page.pageRows, lang, page.rowStart)
        : `<tr><td colspan="${monthly ? 9 : 11}" class="center">${th ? 'ไม่มีรายการวัสดุในประเภทนี้' : 'No materials in this category'}</td></tr>`;
      const tableFooter = page.isCategoryLastPage && !monthly ? `<tfoot><tr><td colspan="9" class="number">${th ? 'รวมจำนวนเงิน' : 'Grand total'}</td><td class="number">${reportMoney(categoryTotal, lang)}</td><td></td></tr></tfoot>` : '';
      const pageSignature = isDocumentLastPage ? `<section class="signature" aria-label="${th ? 'ส่วนลงนาม' : 'Signature'}">${signature}</section>` : '';
      const pageBreak = pageIndex > 0 && !isDocumentLastPage ? '<div class="page-break" aria-hidden="true"></div>' : '';
      return `${pageBreak}<section class="report-page${isDocumentLastPage ? ' report-page--last' : ''}${isDocumentLastPage && combined ? ' report-page--combined-last' : ''}" data-report-page="${pageIndex + 1}" data-category="${escapeHtml(page.section.categoryName)}">
    ${pageHeader}
    <p class="category">${th ? 'ประเภท' : 'Category'} ${escapeHtml(page.section.categoryName)}</p>
    <table>${monthly ? monthlyTableHead(th) : tableHead(fiscalYear, th)}<tbody>${bodyRows}</tbody>${tableFooter}</table>
    ${pageSignature}
  </section>`;
    }).join('')}
  </main>
</body>
</html>`;
}

export function buildFiscalReportDocument({ fiscalYear, startDate, endDate, categoryName, rows, lang = 'th' }) {
  return buildReportDocument({
    fiscalYear,
    startDate,
    endDate,
    sections: [{ categoryName, rows }],
    lang,
    combined: false,
  });
}

export function buildCombinedFiscalReportDocument({ fiscalYear, startDate, endDate, categories, lang = 'th' }) {
  return buildReportDocument({
    fiscalYear,
    startDate,
    endDate,
    sections: categories,
    lang,
    combined: true,
  });
}

const stockAnchorTypes = new Set(['CUTOVER', 'OPENING']);
const nonMovementTypes = new Set(['CUTOVER', 'OPENING', 'CARRY_FORWARD', 'VOID']);
const roundStock = value => Math.round(Number(value) * 1000) / 1000;

function bangkokDateKey(time) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(time));
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)?.value).join('-');
}

export function getMonthlyReportAvailability({ fiscalYear, startDate, endDate, fiscalPeriods = [], materials = [], movements = [] }) {
  const materialsById = new Map(materials.map(item => [item.id, item]));
  const periods = fiscalPeriods.filter(item => Number(item.fiscalYear) === Number(fiscalYear) && !item.deleted && materialsById.has(item.materialId));
  if (!periods.length) return null;
  const carried = periods.filter(item => item.source === 'CARRY_FORWARD');
  const imported = periods.filter(item => item.source === 'IMPORTED_EXCEL');
  const startingPeriods = carried.length ? carried : imported.length ? imported : periods;
  const anchorTimes = new Map();
  for (const item of movements) {
    if (Number(item.fiscalYear) !== Number(fiscalYear) || !stockAnchorTypes.has(item.type)) continue;
    const time = Date.parse(item.occurredAt || '');
    const key = `${item.materialId}:${item.type}`;
    if (Number.isFinite(time) && time < (anchorTimes.get(key) ?? Infinity)) anchorTimes.set(key, time);
  }
  const fiscalStart = Date.parse(`${startDate}T00:00:00+07:00`);
  const times = startingPeriods.map(item => {
    if (item.source === 'CARRY_FORWARD') return fiscalStart;
    const cutover = anchorTimes.get(`${item.materialId}:CUTOVER`);
    const opening = anchorTimes.get(`${item.materialId}:OPENING`);
    const anchor = item.source === 'IMPORTED_EXCEL' ? cutover : Math.min(cutover ?? Infinity, opening ?? Infinity);
    return Number.isFinite(anchor) ? anchor : Date.parse(materialsById.get(item.materialId)?.createdAt || '');
  });
  const trackingStart = Math.min(...times.filter(Number.isFinite));
  if (!Number.isFinite(trackingStart)) return null;
  const trackingStartDate = bangkokDateKey(trackingStart);
  if (trackingStartDate > endDate) return null;
  const firstMonth = trackingStartDate < startDate ? startDate.slice(0, 7) : trackingStartDate.slice(0, 7);
  const monthStart = Date.parse(`${firstMonth}-01T00:00:00+07:00`);
  return {
    firstMonth,
    partialMonth: trackingStart > monthStart ? firstMonth : '',
    trackingStartDate,
  };
}

export function printableMonthlyKeys(availability, endDate, now = new Date()) {
  if (!availability) return [];
  const currentMonth = bangkokDateKey(new Date(now).getTime()).slice(0, 7);
  const months = [];
  let cursor = availability.firstMonth;
  while (cursor <= endDate.slice(0, 7) && cursor <= currentMonth) {
    months.push(cursor);
    const [year, month] = cursor.split('-').map(Number);
    cursor = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  }
  return months;
}

function monthlyStockRow(period, material, entries, monthStart, monthEnd, fiscalStart) {
  const sorted = [...entries].sort((a, b) => a.time - b.time || String(a.id).localeCompare(String(b.id)));
  const anchorIndex = period.source === 'CARRY_FORWARD' ? -1 : sorted.findIndex(item =>
    period.source === 'IMPORTED_EXCEL' ? item.type === 'CUTOVER' : stockAnchorTypes.has(item.type));
  const anchor = anchorIndex < 0 ? null : sorted[anchorIndex];
  const fallbackTime = Date.parse(material.createdAt || '');
  const anchorTime = period.source === 'CARRY_FORWARD' ? fiscalStart : anchor?.time ?? fallbackTime;
  const anchorBalance = period.source === 'CARRY_FORWARD'
    ? Number(period.openingBalance)
    : Number(anchor ? anchor.balanceAfter : period.cutoverBalance);
  const base = {
    materialId: period.materialId, materialCode: period.materialCode,
    materialName: period.materialName, material, trackingStartedAt: Number.isFinite(anchorTime) ? new Date(anchorTime).toISOString() : '',
  };
  if (!Number.isFinite(anchorTime) || !Number.isFinite(anchorBalance) || anchorTime >= monthEnd) {
    return { ...base, opening: null, received: null, issued: null, adjusted: null, closing: null, partial: false };
  }

  const dated = sorted.filter((item, index) =>
    !nonMovementTypes.has(item.type) && Number(item.change) !== 0 &&
    (anchorIndex >= 0 ? index > anchorIndex : item.time >= anchorTime));
  const opening = roundStock(anchorBalance + dated
    .filter(item => item.time < monthStart)
    .reduce((total, item) => total + Number(item.change), 0));
  const duringMonth = dated.filter(item => item.time >= monthStart && item.time < monthEnd);
  const received = roundStock(duringMonth.filter(item => item.type === 'RECEIPT').reduce((total, item) => total + Number(item.change), 0));
  const issued = roundStock(duringMonth.filter(item => item.type === 'ISSUE').reduce((total, item) => total - Number(item.change), 0));
  const adjusted = roundStock(duringMonth.filter(item => item.type !== 'RECEIPT' && item.type !== 'ISSUE').reduce((total, item) => total + Number(item.change), 0));
  return {
    ...base, opening, received, issued, adjusted,
    closing: roundStock(opening + received - issued + adjusted),
    partial: anchorTime > monthStart,
  };
}

export function buildMonthlyFiscalReportDocument({ fiscalYear, startDate, endDate, month, categories, materials, fiscalPeriods = [], movements, categoryId = '', lang = 'th' }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < startDate.slice(0, 7) || month > endDate.slice(0, 7)) {
    throw new RangeError('Month must belong to the selected fiscal year');
  }
  const availability = getMonthlyReportAvailability({ fiscalYear, startDate, endDate, fiscalPeriods, materials, movements });
  if (!availability || month < availability.firstMonth) throw new RangeError('Monthly report is unavailable before tracking begins');
  const materialsById = new Map(materials.map(item => [item.id, item]));
  const selectedCategories = categoryId ? categories.filter(item => item.id === categoryId) : categories;
  if (!selectedCategories.length) throw new RangeError('Category not found');
  const [yearText, monthText] = month.split('-');
  const nextMonth = new Date(Date.UTC(Number(yearText), Number(monthText), 1)).toISOString().slice(0, 7);
  const partialMonth = month === availability.partialMonth;
  const monthStart = Date.parse(`${partialMonth ? availability.trackingStartDate : `${month}-01`}T00:00:00+07:00`);
  const monthEnd = Date.parse(`${nextMonth}-01T00:00:00+07:00`);
  const fiscalStart = Date.parse(`${startDate}T00:00:00+07:00`);
  const movementsByMaterial = new Map();
  for (const item of movements || []) {
    const time = Date.parse(item.occurredAt || '');
    if (Number(item.fiscalYear) !== Number(fiscalYear) || !Number.isFinite(time)) continue;
    if (!movementsByMaterial.has(item.materialId)) movementsByMaterial.set(item.materialId, []);
    movementsByMaterial.get(item.materialId).push({ ...item, time });
  }
  const rows = fiscalPeriods
    .filter(item => Number(item.fiscalYear) === Number(fiscalYear) && !item.deleted)
    .map(item => ({ period: item, material: materialsById.get(item.materialId) }))
    .filter(item => item.material)
    .map(({ period, material }) => monthlyStockRow(period, material, movementsByMaterial.get(period.materialId) || [], monthStart, monthEnd, fiscalStart))
    .sort((a, b) => String(a.materialCode).localeCompare(String(b.materialCode), 'th'));
  const sections = selectedCategories.map(category => ({
    categoryName: category[lang === 'th' ? 'nameTh' : 'nameEn'] || category.nameTh,
    rows: rows.filter(item => item.material.categoryId === category.id),
  }));
  const lastDay = new Date(Date.UTC(Number(yearText), Number(monthText), 0)).getUTCDate();
  return buildReportDocument({
    fiscalYear, startDate: partialMonth ? availability.trackingStartDate : `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
    sections, lang, combined: !categoryId, month, partialMonth,
  });
}
