import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMaterialStore, loadMaterialSeed } from '../local/store.mjs';
import { buildCombinedFiscalReportDocument, buildFiscalReportDocument, buildMonthlyFiscalReportDocument, getMonthlyReportAvailability, printableMonthlyKeys } from '../web/fiscal-report.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = createMaterialStore(loadMaterialSeed(path.join(root, 'SeedData.gs'))).snapshot();
const fiscalYear = data.fiscalYears.find(item => item.year === 2569);
const reportCategoryIds = [
  'CAT-OFFICE',
  'CAT-MEDICAL',
  'CAT-HOUSEKEEPING',
  'CAT-PRINTED',
  'CAT-IT',
  'CAT-MEDSUP-5',
  'CAT-MEDSUP',
  'CAT-CHULA',
];

const buildCategoryReport = categoryId => {
  const category = data.categories.find(item => item.id === categoryId);
  const rows = data.fiscalPeriods
    .filter(item => item.fiscalYear === 2569 && !item.deleted)
    .map(item => ({ ...item, material: data.materials.find(material => material.id === item.materialId) }))
    .filter(item => item.material?.categoryId === category.id)
    .sort((a, b) => a.materialCode.localeCompare(b.materialCode, 'th'));

  return {
    category,
    rows,
    markup: buildFiscalReportDocument({
      fiscalYear: fiscalYear.year,
      startDate: fiscalYear.startDate,
      endDate: fiscalYear.endDate,
      categoryName: category.nameTh,
      rows,
      lang: 'th',
    }),
  };
};

const { rows, markup } = buildCategoryReport('CAT-OFFICE');
const renderedRowCount = reportMarkup => (reportMarkup.match(/<tbody>[\s\S]*?<\/tbody>/g) || [])
  .reduce((total, body) => total + (body.match(/<tr>/g) || []).length, 0);
const categoryReports = reportCategoryIds.map(buildCategoryReport);
const combinedMarkup = buildCombinedFiscalReportDocument({
  fiscalYear: fiscalYear.year,
  startDate: fiscalYear.startDate,
  endDate: fiscalYear.endDate,
  categories: categoryReports.map(report => ({ categoryName: report.category.nameTh, rows: report.rows })),
  lang: 'th',
});

for (const categoryId of reportCategoryIds) {
  const report = buildCategoryReport(categoryId);
  assert.ok(report.markup.includes(`ประเภท ${report.category.nameTh}`));
  if (report.rows.length) {
    assert.equal(renderedRowCount(report.markup), report.rows.length);
  } else {
    assert.match(report.markup, /ไม่มีรายการวัสดุในประเภทนี้/);
    assert.equal(renderedRowCount(report.markup), 1);
  }
}

assert.match(markup, /รายงานตรวจสอบพัสดุประจำปีงบประมาณ 2569/);
assert.match(markup, /1 ตุลาคม 2568 ถึงวันที่ 30 กันยายน 2569/);
assert.match(markup, /ประเภท วัสดุสำนักงาน/);
assert.match(markup, /ผศ\.พิเศษ นายแพทย์อาทิตย์ ต่อพงษ์พันธุ์/);
assert.match(markup, /ผู้อำนวยการศูนย์แพทยศาสตรศึกษาชั้นคลินิก/);
assert.match(markup, /@page \{ size: A4 landscape/);
assert.match(markup, /thead \{ display: table-header-group/);
assert.match(markup, /tfoot \{ display: table-row-group/);
assert.match(markup, /document\.fonts\.ready\.then\(\(\) => window\.print\(\)\)/);
assert.match(markup, /font-family: "TH Sarabun PSK"/);
assert.match(markup, /THSarabunPSK%20Regular\.ttf/);
assert.match(markup, /THSarabunPSK%20Bold\.ttf/);
assert.doesNotMatch(markup, /Noto Sans Thai/);
assert.equal(renderedRowCount(markup), rows.length);
assert.equal((markup.match(/data-report-page=/g) || []).length, 5);
assert.doesNotMatch(markup, /data-annual-edit|data-annual-delete/);
assert.doesNotMatch(markup, /[\u2022\u00b7]/u);

assert.match(combinedMarkup, /รวมทุกประเภทวัสดุ/);
assert.equal((combinedMarkup.match(/aria-label="ส่วนลงนาม"/g) || []).length, 1);
assert.equal(renderedRowCount(combinedMarkup), categoryReports.reduce((total, report) => total + report.rows.length, 0));
for (const report of categoryReports.filter(item => item.rows.length)) {
  assert.ok(combinedMarkup.includes(`data-category="${report.category.nameTh}"`));
}
assert.doesNotMatch(combinedMarkup, /[\u2022\u00b7]/u);

const officeMaterial = data.materials.find(item => item.categoryId === 'CAT-OFFICE');
const secondOfficeMaterial = data.materials.find(item => item.categoryId === 'CAT-OFFICE' && item.id !== officeMaterial.id);
const medicalMaterial = data.materials.find(item => item.categoryId === 'CAT-MEDICAL');
const trackedMaterials = [officeMaterial, secondOfficeMaterial, medicalMaterial].map(item => ({ ...item, createdAt: '2026-08-19T02:00:00.000Z' }));
const monthlyPeriods = trackedMaterials.map((item, index) => ({
  id: `PER-2569-${item.id}`, fiscalYear: 2569, materialId: item.id,
  materialCode: item.code, materialName: item.name, source: 'IMPORTED_EXCEL',
  cutoverBalance: [80, 0, 14][index], deleted: false,
}));
const monthlyMovements = [
  { id: 'M-00', fiscalYear: 2569, materialId: officeMaterial.id, type: 'OPENING', change: 5, balanceAfter: 5, occurredAt: '2026-08-01T02:00:00.000Z' },
  { id: 'M-01', fiscalYear: 2569, materialId: officeMaterial.id, type: 'RECEIPT', change: 7, occurredAt: '2026-08-15T02:00:00.000Z' },
  { id: 'M-02', fiscalYear: 2569, materialId: officeMaterial.id, type: 'CUTOVER', change: 80, balanceAfter: 80, occurredAt: '2026-08-19T02:00:00.000Z' },
  { id: 'M-03', fiscalYear: 2569, materialId: medicalMaterial.id, type: 'CUTOVER', change: 14, balanceAfter: 14, occurredAt: '2026-08-19T02:00:00.000Z' },
  { id: 'M-04', fiscalYear: 2569, materialId: officeMaterial.id, type: 'RECEIPT', change: 5, balanceAfter: 85, occurredAt: '2026-08-20T02:00:00.000Z' },
  { id: 'M-05', fiscalYear: 2569, materialId: officeMaterial.id, type: 'ISSUE', change: -2, balanceAfter: 83, occurredAt: '2026-08-21T02:00:00.000Z' },
  { id: 'M-06', fiscalYear: 2569, materialId: officeMaterial.id, type: 'RECEIPT', change: 1, balanceAfter: 84, occurredAt: '2026-08-31T17:30:00.000Z' },
  { id: 'M-07', fiscalYear: 2569, materialId: officeMaterial.id, type: 'ISSUE', change: -10, balanceAfter: 74, occurredAt: '2026-09-10T02:00:00.000Z' },
  { id: 'M-08', fiscalYear: 2569, materialId: officeMaterial.id, type: 'ADJUST_IN', change: 3, balanceAfter: 77, occurredAt: '2026-09-11T02:00:00.000Z' },
  { id: 'M-09', fiscalYear: 2569, materialId: officeMaterial.id, type: 'ADJUST_OUT', change: -1, balanceAfter: 76, occurredAt: '2026-09-12T02:00:00.000Z' },
  { id: 'M-10', fiscalYear: 2569, materialId: officeMaterial.id, type: 'SOURCE_CORRECTION', change: -4, balanceAfter: 72, occurredAt: '2026-09-13T02:00:00.000Z' },
  { id: 'M-11', fiscalYear: 2569, materialId: officeMaterial.id, type: 'VOID', change: 0, balanceAfter: 72, occurredAt: '2026-09-14T02:00:00.000Z' },
];
const monthlyInput = { fiscalYear: 2569, startDate: fiscalYear.startDate, endDate: fiscalYear.endDate, month: '2026-09', categories: data.categories, materials: trackedMaterials, fiscalPeriods: monthlyPeriods, movements: monthlyMovements, lang: 'th' };
assert.deepEqual(getMonthlyReportAvailability(monthlyInput), {
  firstMonth: '2026-08', partialMonth: '2026-08', trackingStartDate: '2026-08-19',
});
assert.deepEqual(printableMonthlyKeys(getMonthlyReportAvailability(monthlyInput), fiscalYear.endDate, new Date('2026-09-20T02:00:00.000Z')), ['2026-08', '2026-09']);
assert.deepEqual(printableMonthlyKeys(getMonthlyReportAvailability(monthlyInput), fiscalYear.endDate, new Date('2026-07-20T02:00:00.000Z')), []);
const materialRow = (html, code) => (html.match(/<tr>[\s\S]*?<\/tr>/g) || []).find(row => row.includes(`<small>${code}</small>`)) || '';
const monthlyMarkup = buildMonthlyFiscalReportDocument({ ...monthlyInput, categoryId: 'CAT-OFFICE' });
const combinedMonthlyMarkup = buildMonthlyFiscalReportDocument(monthlyInput);
assert.match(monthlyMarkup, /รายงานสรุปยอดวัสดุประจำเดือนกันยายน 2569/);
assert.match(monthlyMarkup, /วันที่ 1 กันยายน 2569 ถึงวันที่ 30 กันยายน 2569/);
assert.match(monthlyMarkup, /ยอดต้นเดือน \/ เริ่มใช้/);
assert.equal(renderedRowCount(monthlyMarkup), 2, 'one row per material, not per movement');
assert.equal(renderedRowCount(combinedMonthlyMarkup), 3);
assert.equal((combinedMonthlyMarkup.match(/aria-label="ส่วนลงนาม"/g) || []).length, 1);
assert.match(materialRow(monthlyMarkup, officeMaterial.code), /<td class="number">83<\/td>\s*<td class="number">1<\/td>\s*<td class="number">10<\/td>\s*<td class="number">-2<\/td>\s*<td class="number">72<\/td>/);
assert.match(materialRow(monthlyMarkup, secondOfficeMaterial.code), /<td class="number">0<\/td>\s*<td class="number">0<\/td>\s*<td class="number">0<\/td>\s*<td class="number">0<\/td>\s*<td class="number">0<\/td>/);
assert.match(materialRow(combinedMonthlyMarkup, medicalMaterial.code), /<td class="number">14<\/td>\s*<td class="number">0<\/td>\s*<td class="number">0<\/td>\s*<td class="number">0<\/td>\s*<td class="number">14<\/td>/);
assert.doesNotMatch(monthlyMarkup, /รวมจำนวนเงิน/);
assert.doesNotMatch(monthlyMarkup, /report-data-note|ยอดรายเดือนคำนวณจากยอดตั้งต้น/);
assert.throws(() => buildMonthlyFiscalReportDocument({ ...monthlyInput, month: '2026-10' }), RangeError);
assert.throws(() => buildMonthlyFiscalReportDocument({ ...monthlyInput, month: '2026-07', categoryId: 'CAT-OFFICE' }), /unavailable before tracking begins/);
assert.doesNotMatch(monthlyMarkup, /[\u2022\u00b7]/u);

const augustOfficeReport = buildMonthlyFiscalReportDocument({ ...monthlyInput, month: '2026-08', categoryId: 'CAT-OFFICE' });
assert.match(augustOfficeReport, /รายงานช่วงเริ่มใช้ระบบ เดือนสิงหาคม 2569/);
assert.match(augustOfficeReport, /วันที่ 19 สิงหาคม 2569 ถึงวันที่ 31 สิงหาคม 2569/);
assert.equal(renderedRowCount(augustOfficeReport), 2);
assert.match(materialRow(augustOfficeReport, officeMaterial.code), /<td class="number">80<\/td>\s*<td class="number">5<\/td>\s*<td class="number">2<\/td>\s*<td class="number">0<\/td>\s*<td class="number">83<\/td>/);
assert.match(materialRow(augustOfficeReport, officeMaterial.code), /เริ่มบันทึก 19 สิงหาคม 2569/);
assert.doesNotMatch(materialRow(augustOfficeReport, officeMaterial.code), />7<\/td>/, 'pre-cutover receipts are not counted again');

const carriedReport = buildMonthlyFiscalReportDocument({
  ...monthlyInput, fiscalYear: 2570, startDate: '2026-10-01', endDate: '2027-09-30', month: '2026-10',
  fiscalPeriods: [{ ...monthlyPeriods[0], fiscalYear: 2570, source: 'CARRY_FORWARD', openingBalance: 72 }],
  movements: [{ id: 'M-12', fiscalYear: 2570, materialId: officeMaterial.id, type: 'CARRY_FORWARD', change: 0, balanceAfter: 72, occurredAt: '2026-10-01T02:00:00.000Z' }],
  categoryId: 'CAT-OFFICE',
});
assert.deepEqual(getMonthlyReportAvailability({
  ...monthlyInput, fiscalYear: 2570, startDate: '2026-10-01', endDate: '2027-09-30',
  fiscalPeriods: [{ ...monthlyPeriods[0], fiscalYear: 2570, source: 'CARRY_FORWARD', openingBalance: 72 }],
}), { firstMonth: '2026-10', partialMonth: '', trackingStartDate: '2026-10-01' });
assert.deepEqual(printableMonthlyKeys(getMonthlyReportAvailability({
  ...monthlyInput, fiscalYear: 2570, startDate: '2026-10-01', endDate: '2027-09-30',
  fiscalPeriods: [{ ...monthlyPeriods[0], fiscalYear: 2570, source: 'CARRY_FORWARD', openingBalance: 72 }],
}), '2027-09-30', new Date('2026-09-20T02:00:00.000Z')), []);
assert.match(carriedReport, /รายงานสรุปยอดวัสดุประจำเดือนตุลาคม 2569/);
assert.match(carriedReport, /ปีงบประมาณ 2570/);
assert.match(materialRow(carriedReport, officeMaterial.code), /<td class="number">72<\/td>\s*<td class="number">0<\/td>\s*<td class="number">0<\/td>\s*<td class="number">0<\/td>\s*<td class="number">72<\/td>/);

console.log('PASS fiscal report: annual and monthly reports, category/combined scope, dated activity, print layout and signature are consistent.');
