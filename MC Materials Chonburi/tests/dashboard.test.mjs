import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMaterialStore, loadMaterialSeed } from '../local/store.mjs';
import { inkData } from '../web/ink-data.js';
import { buildDashboardModel, dashboardMarkup } from '../web/dashboard.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = createMaterialStore(loadMaterialSeed(path.join(root, 'SeedData.gs'))).snapshot();
const model = buildDashboardModel(data, inkData, 2569, new Date('2026-09-19T05:00:00.000Z'));

assert.equal(model.fiscalYear, 2569);
assert.equal(model.materials.registered, data.fiscalPeriods.filter(item => item.fiscalYear === 2569 && !item.deleted).length);
assert.equal(Object.hasOwn(model.materials, 'pendingReviews'), false);
assert.equal(model.materials.categoryStats.reduce((total, item) => total + item.items, 0), model.materials.registered);
assert.equal(model.ink.purchaseValue, 254660);
assert.equal(model.ink.stockValue, 137160);
assert.deepEqual(model.ink.rounds.map(item => item.label), ['2568/1', '2569/1', '2569/2']);
assert.equal(model.ink.purchaseQuantity, inkData.groups.flatMap(group => group.rows).reduce((total, row) => total + row.cells[2], 0));
assert.equal(model.ink.withdrawalQuantity, 35);
assert.equal(model.ink.fiscalPurchaseValue, 205900);
assert.equal(model.ink.fiscalPurchaseQuantity, 48);
assert.equal(model.ink.fiscalWithdrawalQuantity, 25);
assert.equal(model.ink.fiscalWithdrawalCount, 26);
assert.deepEqual(model.ink.fiscalRounds.map(item => item.label), ['2569/1', '2569/2']);
assert.equal(model.ink.monthlyIssues.length, 12);
assert.equal(model.ink.calendarYear, 2026);
assert.equal(model.ink.monthlyIssues[0].key, '2026-01');
assert.equal(model.ink.monthlyIssues[11].key, '2026-12');
assert.equal(model.ink.monthlyIssues.reduce((total, item) => total + item.issued, 0), 16);
assert.equal(model.ink.outOfStock.length, 1);
assert.equal(model.ink.oneLeft.length, 4);
assert.deepEqual(model.ink.issuesByDepartment.map(item => [item.department, item.quantity]), [['วิชาการ', 22], ['บริหาร', 3]]);
assert.deepEqual(model.ink.issuesByYear.map(item => [item.year, item.quantity]), [[2568, 10], [2569, 25]]);
assert.deepEqual(model.ink.purchasesByYear.map(item => [item.year, item.quantity]), [[2568, 14], [2569, 48]]);

const materialsMarkup = dashboardMarkup(model, 'materials', 'th');
assert.match(materialsMarkup, /ภาพรวมวัสดุ/);
assert.match(materialsMarkup, /การรับและจ่ายวัสดุรายเดือน/);
assert.match(materialsMarkup, /ยังไม่มีรายการรับหรือจ่ายรายเดือน/);
assert.match(materialsMarkup, /จำนวนคงเหลือแต่ละประเภท/);
const inkMarkup = dashboardMarkup(model, 'ink', 'th');
assert.equal((inkMarkup.match(/ink-chart-panel/g) || []).length, 9);
assert.match(inkMarkup, /แนวโน้มการเบิกหมึกรายเดือน/);
assert.match(inkMarkup, /ยอดซื้อหมึกแต่ละรอบ/);
assert.match(inkMarkup, /จำนวนหมึกที่ซื้อแต่ละรอบ/);
assert.match(inkMarkup, /ฝ่ายที่เบิกหมึก/);
assert.match(inkMarkup, /รุ่นหมึกตามยอดคงเหลือ/);
assert.match(inkMarkup, /รุ่นหมึกที่เหลือน้อยที่สุด/);
assert.match(inkMarkup, /รุ่นหมึกที่มีมูลค่าคงเหลือสูงสุด/);
assert.match(inkMarkup, /สัดส่วนยอดซื้อตามปีงบประมาณ/);
assert.match(inkMarkup, /จำนวนซื้อและเบิกตามปีงบประมาณ/);
assert.match(inkMarkup, /BROTHER TN-451 \(C\)/);
assert.match(inkMarkup, /ปีปฏิทิน 2569 แสดงมกราคมถึงธันวาคม/);
assert.match(inkMarkup, /ม.ค./);
assert.match(inkMarkup, /ธ.ค./);
assert.match(inkMarkup, /chart-line/);
assert.match(inkMarkup, /chart-bars/);
assert.match(inkMarkup, /donut-chart/);
assert.match(inkMarkup, /horizontal-bars/);
assert.ok(inkMarkup.indexOf('ink-monthly-panel') < inkMarkup.indexOf('ink-year-bars-panel'));
assert.ok(inkMarkup.indexOf('ink-year-bars-panel') < inkMarkup.indexOf('ink-round-panel'));
assert.ok(inkMarkup.indexOf('ink-department-panel') < inkMarkup.indexOf('ink-ranked-panel'));
assert.doesNotMatch(inkMarkup, /dashboard-kpi|metric-list|ink-report-alert/);
assert.doesNotMatch(inkMarkup, /ink-momentum|ink-dot-plot/);
assert.doesNotMatch(inkMarkup, /[\u2022\u00b7]/u);
assert.doesNotMatch(inkMarkup, /undefined|NaN/);

const priorYearInk = buildDashboardModel(data, inkData, 2568, new Date('2026-09-19T05:00:00.000Z')).ink;
assert.equal(priorYearInk.fiscalPurchaseValue, 48760);
assert.equal(priorYearInk.fiscalWithdrawalQuantity, 10);
assert.deepEqual(priorYearInk.fiscalRounds.map(item => item.label), ['2568/1']);
assert.deepEqual(priorYearInk.monthlyIssues, model.ink.monthlyIssues, 'calendar trend must not follow the selected fiscal year');
const newYearInk = buildDashboardModel(data, inkData, 2569, new Date('2026-12-31T18:00:00.000Z')).ink;
assert.equal(newYearInk.calendarYear, 2027, 'calendar year must roll over in Bangkok timezone');
assert.equal(newYearInk.monthlyIssues[0].key, '2027-01');
const emptyYearMarkup = dashboardMarkup(buildDashboardModel(data, inkData, 2570, new Date('2026-09-19T05:00:00.000Z')), 'ink', 'th');
assert.match(emptyYearMarkup, /ยังไม่มีรายการซื้อในปีงบประมาณนี้/);
assert.match(emptyYearMarkup, /ยังไม่มีรายการเบิกในปีงบประมาณนี้/);

const dataWithDatedMovements = structuredClone(data);
dataWithDatedMovements.movements.push(
  { fiscalYear: 2569, type: 'RECEIPT', change: 12, occurredAt: '2025-10-15T02:00:00.000Z' },
  { fiscalYear: 2569, type: 'ADJUST_IN', change: 3, occurredAt: '2025-10-20T02:00:00.000Z' },
  { fiscalYear: 2569, type: 'ISSUE', change: -5, occurredAt: '2026-01-10T02:00:00.000Z' },
  { fiscalYear: 2569, type: 'CUTOVER', change: 999, occurredAt: '2026-01-10T02:00:00.000Z' },
);
const trendModel = buildDashboardModel(dataWithDatedMovements, inkData, 2569);
assert.equal(trendModel.materials.monthlyFlow.length, 12);
assert.equal(trendModel.materials.monthlyFlow[0].key, '2025-10');
assert.equal(trendModel.materials.monthlyFlow[0].received, 15);
assert.equal(trendModel.materials.monthlyFlow[3].issued, 5);
assert.equal(trendModel.materials.monthlyActivity, true);
const trendMarkup = dashboardMarkup(trendModel, 'materials', 'th');
assert.match(trendMarkup, /chart-line/);
assert.match(trendMarkup, /ต.ค. 68/);
assert.doesNotMatch(trendMarkup, /999/);

console.log('PASS dashboard: live material and ink metrics, fiscal filtering, chart labels and report markup are consistent.');
