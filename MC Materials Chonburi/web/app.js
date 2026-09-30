import { imageMarkup, imageField, bindImageField, imagePayload, isLowStock } from './material-images.js';
import { bindDateFields, dateField, displayDate } from './dates.js';
import { bindInk, renderInk, inkYearRange, setInkData } from './ink.js';
import { buildDashboardModel, dashboardMarkup } from './dashboard.js';
import { buildCombinedFiscalReportDocument, buildFiscalReportDocument, buildMonthlyFiscalReportDocument, getMonthlyReportAvailability, printableMonthlyKeys } from './fiscal-report.js';
import { buildRequisitionReportDocument } from './requisition-report.js';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const chevronIcon = direction => `<svg class="pagination-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="${direction === 'left' ? 'm12 5-5 5 5 5' : 'm8 5 5 5-5 5'}"/></svg>`;
const REQUISITION_PAGE_SIZE = 10;

const copy = {
  th: {
    brand: 'วัสดุศูนย์แพทย์', overview: 'ภาพรวม', materials: 'ทะเบียนวัสดุ', fiscalYears: 'ปีงบประมาณ', requisitions: 'ขอเบิกวัสดุ', movements: 'การเคลื่อนไหว',
    adminConsole: 'ADMIN CONSOLE', workQueue: 'WORK QUEUE', nextActions: 'งานที่ควรทำต่อ', stockHealth: 'STOCK HEALTH', inventoryStatus: 'สถานะวัสดุ',
    masterData: 'MASTER DATA', materialRegistry: 'ทะเบียนวัสดุ', addMaterial: 'เพิ่มวัสดุ', auditTrail: 'AUDIT TRAIL', stockMovements: 'รายการเคลื่อนไหว', cancel: 'ยกเลิก',
    searchMaterial: 'ค้นหาวัสดุ', searchRegistry: 'ค้นหารหัสหรือชื่อวัสดุ', searchMovement: 'ค้นหาวัสดุหรือประเภทวัสดุ',
    fiscalPeriod: 'FISCAL PERIOD', annualBalances: 'ANNUAL BALANCES', annualMaterialSummary: 'สรุปวัสดุรายปีงบประมาณ',
  },
  en: {
    brand: 'Medical Center Materials', overview: 'Overview', materials: 'Material registry', fiscalYears: 'Fiscal years', requisitions: 'Requisitions', movements: 'Movements',
    adminConsole: 'ADMIN CONSOLE', workQueue: 'WORK QUEUE', nextActions: 'Next actions', stockHealth: 'STOCK HEALTH', inventoryStatus: 'Inventory status',
    masterData: 'MASTER DATA', materialRegistry: 'Material registry', addMaterial: 'Add material', auditTrail: 'AUDIT TRAIL', stockMovements: 'Stock movements', cancel: 'Cancel',
    searchMaterial: 'Search materials', searchRegistry: 'Search code or material', searchMovement: 'Search material or category',
    fiscalPeriod: 'FISCAL PERIOD', annualBalances: 'ANNUAL BALANCES', annualMaterialSummary: 'Annual material summary',
  },
};

const titles = {
  th: { overview: 'ภาพรวม', materials: 'จัดการทะเบียนวัสดุ', fiscal: 'จัดการปีงบประมาณ', requisitions: 'จัดการคำขอเบิกวัสดุ', movements: 'ประวัติการเคลื่อนไหว' },
  en: { overview: 'Dashboard', materials: 'Manage material registry', fiscal: 'Manage fiscal years', requisitions: 'Manage requisitions', movements: 'Stock movement history' },
};

const state = {
  data: null,
  inkData: null,
  view: 'overview',
  dashboardTab: 'materials',
  lang: localStorage.getItem('material-lang') || 'th',
  theme: localStorage.getItem('material-theme') || 'light',
  materialPage: 1,
  movementPage: 1,
  requisitionPage: 1,
  fiscalPage: 1,
  selectedFiscalYear: null,
  selectedInkFiscalYear: null,
  selectedFiscalCategory: 'CAT-OFFICE',
  selectedReportPeriod: 'year',
  selectedReportMonth: '',
  pageSize: 10,
  dialog: null,
};

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const formatNumber = value => new Intl.NumberFormat(state.lang === 'th' ? 'th-TH' : 'en-US', { maximumFractionDigits: 3 }).format(Number(value || 0));
const formatReportNumber = value => Number(value || 0) === 0 ? '—' : formatNumber(value);
const formatMoney = value => Number(value || 0) === 0 ? '—' : new Intl.NumberFormat(state.lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
const formatDate = value => displayDate(value, state.lang);
const formatFiscalDate = value => displayDate(value, state.lang);
const opId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const categoryName = id => state.data.categories.find(item => item.id === id)?.[state.lang === 'th' ? 'nameTh' : 'nameEn'] || id;
const t = (th, en) => state.lang === 'th' ? th : en;

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.message || t('เกิดข้อผิดพลาด', 'Something went wrong'));
  return result.data;
}

async function api(path, options = {}) {
  $('#loading').classList.add('show');
  try { return await request(path, options); }
  finally { $('#loading').classList.remove('show'); }
}

async function refresh() {
  $('#loading').classList.add('show');
  try {
    [state.data, state.inkData] = await Promise.all([request('/api/state', { cache: 'no-store' }), request('/api/ink/state', { cache: 'no-store' })]);
    setInkData(state.inkData);
    if (!state.data.fiscalYears.some(item => item.year === Number(state.selectedFiscalYear))) state.selectedFiscalYear = state.data.activeFiscalYear;
    const inkYears = [...new Set([...state.inkData.groups, ...state.inkData.withdrawals].map(item => Number(item.year)).filter(year => Number.isFinite(year) && year > 0))];
    if (!inkYears.includes(Number(state.selectedInkFiscalYear))) state.selectedInkFiscalYear = inkYears.length ? Math.max(...inkYears) : state.data.activeFiscalYear;
    render();
  } finally { $('#loading').classList.remove('show'); }
}

function toast(message, isError = false) {
  const item = document.createElement('div');
  item.className = `toast${isError ? ' error' : ''}`;
  item.innerHTML = `<strong>${isError ? '!' : '✓'}</strong><span>${escapeHtml(message)}</span>`;
  $('#toastRegion').append(item);
  setTimeout(() => item.remove(), 3300);
}

function applyLocale() {
  document.documentElement.lang = state.lang;
  $$('[data-i18n]').forEach(node => { node.textContent = copy[state.lang][node.dataset.i18n] || node.textContent; });
  $$('[data-placeholder]').forEach(node => { node.placeholder = copy[state.lang][node.dataset.placeholder] || node.placeholder; });
  $('#languageButton').textContent = state.lang === 'th' ? 'EN' : 'TH';
  $('#refreshButton').setAttribute('aria-label', t('รีเฟรชข้อมูล', 'Refresh data'));
  $('#refreshButton').title = t('รีเฟรชข้อมูล', 'Refresh data');
  $('#pageTitle').textContent = state.view === 'ink' ? t(`สรุปการซื้อหมึกของปีงบ ${inkYearRange()}`, `Ink purchases ${inkYearRange()}`) : state.view === 'overview' && state.dashboardTab === 'ink' ? t('รายงานหมึก', 'Ink report') : titles[state.lang][state.view];
  $('#fiscalYearSelect').hidden = state.view === 'ink' || (state.view === 'overview' && state.dashboardTab === 'ink');
}

function setView(view) {
  state.view = view;
  $$('.view').forEach(node => { node.hidden = node.id !== `view-${view}`; });
  $$('.nav-item').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  applyLocale();
  if (state.data) renderView();
}

function options(items, selected, allLabel) {
  return `<option value="">${escapeHtml(allLabel)}</option>${items.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(item[state.lang === 'th' ? 'nameTh' : 'nameEn'])}</option>`).join('')}`;
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  $('#themeButton').setAttribute('aria-checked', String(state.theme === 'dark'));
  $('#themeButton').setAttribute('aria-label', t('โหมดมืด', 'Dark mode'));
  $('#themeButton').title = state.theme === 'light' ? t('เปลี่ยนเป็นโหมดมืด', 'Switch to dark mode') : t('เปลี่ยนเป็นโหมดสว่าง', 'Switch to light mode');
  const openRequisitions = state.data.requisitions.filter(item => item.fiscalYear === Number(state.selectedFiscalYear) && ['PENDING', 'APPROVED'].includes(item.status)).length;
  $('#navRequisitions').textContent = openRequisitions;
  applyLocale();
  fillFiscalYearSelect();
  fillFilters();
  renderView();
}

function fillFiscalYearSelect() {
  $('#fiscalYearSelect').innerHTML = state.data.fiscalYears
    .slice()
    .sort((a, b) => b.year - a.year)
    .map(item => `<option value="${item.year}" ${item.year === Number(state.selectedFiscalYear) ? 'selected' : ''}>${t('ปีงบประมาณ', 'FY')} ${item.year}${item.status === 'OPEN' ? ` ${t('เปิด', 'Open')}` : ''}</option>`)
    .join('');
}

function fillFilters() {
  const allCategories = t('ทุกประเภท', 'All categories');
  const materialCategory = $('#materialCategory');
  const currentMaterialCategory = materialCategory.value;
  materialCategory.innerHTML = options(state.data.categories, currentMaterialCategory, allCategories);
  const fiscalCategory = $('#fiscalCategory');
  fiscalCategory.innerHTML = state.data.categories.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === state.selectedFiscalCategory ? 'selected' : ''}>${escapeHtml(item[state.lang === 'th' ? 'nameTh' : 'nameEn'])}</option>`).join('');
  const requisitionStatus = $('#requisitionStatus');
  const selectedRequisitionStatus = requisitionStatus.value;
  requisitionStatus.innerHTML = [
    ['', t('ทุกสถานะ', 'All statuses')], ['PENDING', t('รออนุมัติ', 'Pending approval')], ['APPROVED', t('รอจ่าย', 'Awaiting issue')], ['ISSUED', t('จ่ายแล้ว', 'Issued')], ['REJECTED', t('ไม่อนุมัติ', 'Rejected')], ['CANCELLED', t('ยกเลิก', 'Cancelled')],
  ].map(([value, label]) => `<option value="${value}" ${value === selectedRequisitionStatus ? 'selected' : ''}>${label}</option>`).join('');
}

function renderView() {
  if (state.view === 'ink') renderInk();
  if (state.view === 'overview') renderOverview();
  if (state.view === 'materials') renderMaterials();
  if (state.view === 'fiscal') renderFiscal();
  if (state.view === 'requisitions') renderRequisitions();
  if (state.view === 'movements') renderMovements();
}

function renderOverview() {
  if (!state.inkData) return;
  document.querySelectorAll('[data-dashboard-tab]').forEach(button => {
    const active = button.dataset.dashboardTab === state.dashboardTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const inkYearSelect = $('#inkDashboardYearSelect');
  inkYearSelect.hidden = state.dashboardTab !== 'ink';
  if (state.dashboardTab === 'ink') {
    const years = [...new Set([...state.inkData.groups, ...state.inkData.withdrawals].map(item => Number(item.year)).filter(year => Number.isFinite(year) && year > 0))].sort((a, b) => b - a);
    if (!years.length) years.push(Number(state.selectedInkFiscalYear));
    inkYearSelect.innerHTML = years.map(year => `<option value="${year}" ${year === Number(state.selectedInkFiscalYear) ? 'selected' : ''}>${t('ปีงบประมาณ', 'FY')} ${year}</option>`).join('');
  }
  const year = state.dashboardTab === 'ink' ? state.selectedInkFiscalYear : state.selectedFiscalYear;
  $('#dashboardContent').innerHTML = dashboardMarkup(buildDashboardModel(state.data, state.inkData, year), state.dashboardTab, state.lang);
}

function materialRows() {
  const q = $('#materialSearch').value.trim().toLocaleLowerCase('th-TH');
  const categoryId = $('#materialCategory').value;
  const periodIds = new Set(state.data.fiscalPeriods.filter(item => item.fiscalYear === Number(state.selectedFiscalYear) && !item.deleted).map(item => item.materialId));
  return state.data.materials.filter(item => periodIds.has(item.id) && (!q || `${item.code} ${item.name}`.toLocaleLowerCase('th-TH').includes(q)) && (!categoryId || item.categoryId === categoryId));
}

function renderMaterials() {
  const rows = materialRows();
  const isOpen = Number(state.selectedFiscalYear) === state.data.activeFiscalYear;
  $('#addMaterialButton').disabled = !isOpen;
  $('#addMaterialButton').title = isOpen ? '' : t('ปีงบประมาณนี้ปิดแล้ว', 'This fiscal year is closed');
  $('#materialCount').textContent = `${formatNumber(rows.length)} ${t('รายการ', 'items')}`;
  $('#materialHead').innerHTML = `<tr><th>${t('รหัส', 'Code')}</th><th>${t('วัสดุ', 'Material')}</th><th>${t('ประเภท', 'Category')}</th><th class="number-cell">${t('คงเหลือ', 'On hand')}</th><th class="number-cell">${t('รอจ่าย', 'Awaiting issue')}</th><th class="number-cell">${t('พร้อมเบิก', 'Available')}</th><th>${t('สถานะ', 'Status')}</th><th></th></tr>`;
  const { page, items } = paginate(rows, state.materialPage);
  state.materialPage = page;
  $('#materialBody').innerHTML = items.length ? items.map(item => {
    const period = state.data.fiscalPeriods.find(row => row.materialId === item.id && row.fiscalYear === Number(state.selectedFiscalYear));
    const onHand = period?.closingBalance ?? 0;
    const isOpen = Number(state.selectedFiscalYear) === state.data.activeFiscalYear;
    const reserved = isOpen ? item.reserved : 0;
    const available = Math.max(0, onHand - reserved);
    const low = isLowStock(onHand);
    return `<tr><td><strong>${escapeHtml(item.code)}</strong></td><td>${imageMarkup(item.imageUrl, item.categoryId, item.name)}<span class="cell-main" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><span class="cell-sub ${low ? 'stock-low' : ''}">${formatNumber(onHand)} ${escapeHtml(item.unit)}${item.packDetail ? ` ${escapeHtml(item.packDetail)}` : ''}</span></td><td>${escapeHtml(categoryName(item.categoryId))}</td><td class="number-cell ${low ? 'stock-low' : ''}"><strong>${formatNumber(onHand)}</strong> ${escapeHtml(item.unit)}</td><td class="number-cell">${formatNumber(reserved)}</td><td class="number-cell"><span class="stock-quantity ${isLowStock(available) ? 'stock-low' : 'stock-ok'}">${formatNumber(available)}</span></td><td><span class="material-status ${item.active ? 'is-active' : 'is-inactive'}">${item.active ? t('ใช้งาน', 'Active') : t('ปิดใช้', 'Inactive')}</span></td><td><div class="row-actions">${isOpen ? `<button class="action-button" data-stock="${item.id}">${t('ยอด', 'Stock')}</button><button class="action-button" data-edit="${item.id}">${t('แก้ไข', 'Edit')}</button>` : `<span class="badge neutral">${t('ปิดงวดแล้ว', 'Closed')}</span>`}</div></td></tr>`;
  }).join('') : emptyRow(8, t('ยังไม่มีวัสดุในทะเบียน กรุณาเพิ่มวัสดุใหม่', 'No registered materials. Add a material to begin.'));
  renderPagination('#materialPagination', rows.length, page, 'materialPage');
}

function requisitionStatusBadge(status) {
  const labels = {
    PENDING: [t('รออนุมัติ', 'Pending approval'), 'pending'],
    APPROVED: [t('รอจ่าย', 'Awaiting issue'), 'approved'],
    ISSUED: [t('จ่ายแล้ว', 'Issued'), 'active'],
    REJECTED: [t('ไม่อนุมัติ', 'Rejected'), 'rejected'],
    CANCELLED: [t('ยกเลิก', 'Cancelled'), 'neutral'],
  };
  const [label, cls] = labels[status] || [status, 'neutral'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function requisitionRows() {
  const q = $('#requisitionSearch').value.trim().toLocaleLowerCase('th-TH');
  const status = $('#requisitionStatus').value;
  return state.data.requisitions
    .filter(item => item.fiscalYear === Number(state.selectedFiscalYear))
    .filter(item => !status || item.status === status)
    .filter(item => !q || `${item.requestNo} ${item.requesterName} ${item.department} ${item.lines.map(line => `${line.materialCode} ${line.materialName}`).join(' ')}`.toLocaleLowerCase('th-TH').includes(q))
    .sort((a, b) => `${b.requestDate}|${b.createdAt}`.localeCompare(`${a.requestDate}|${a.createdAt}`));
}

function requisitionActions(item) {
  const isAdmin = state.data.app.role === 'admin';
  const isOwner = item.createdBy === state.data.app.actor;
  const view = `<button class="action-button view-icon-button" data-requisition-view="${item.id}" aria-label="${t('ดูรายละเอียด', 'View details')}" title="${t('ดูรายละเอียด', 'View details')}"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button>`;
  const notes = isAdmin ? `<button class="action-button" data-requisition-notes="${item.id}">${t('แก้ไขหมายเหตุ', 'Edit notes')}</button>` : '';
  const print = isAdmin && ['APPROVED', 'ISSUED'].includes(item.status)
    ? `<button class="action-button view-icon-button" data-requisition-print="${item.id}" aria-label="${t('พิมพ์ใบเบิก', 'Print requisition')}" title="${t('พิมพ์ใบเบิก', 'Print requisition')}"><svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/><path d="M17 11h.01"/></svg></button>`
    : '';
  if (item.status === 'PENDING') return `${view}${print}${notes}${!isAdmin && isOwner ? `<button class="action-button" data-requisition-edit="${item.id}">${t('แก้ไข', 'Edit')}</button>` : ''}${isAdmin ? `<button class="action-button strong" data-requisition-approve="${item.id}">${t('อนุมัติ', 'Approve')}</button><button class="action-button danger" data-requisition-reject="${item.id}">${t('ไม่อนุมัติ', 'Reject')}</button>` : ''}${!isAdmin && isOwner ? `<button class="action-button danger" data-requisition-cancel="${item.id}">${t('ยกเลิก', 'Cancel')}</button>` : ''}`;
  if (item.status === 'APPROVED') return `${view}${print}${notes}${isAdmin ? `<button class="action-button strong" data-requisition-issue="${item.id}">${t('จ่ายวัสดุ', 'Issue')}</button><button class="action-button danger" data-requisition-cancel="${item.id}">${t('ยกเลิก', 'Cancel')}</button>` : isOwner ? `<button class="action-button danger" data-requisition-cancel="${item.id}">${t('ยกเลิก', 'Cancel')}</button>` : ''}`;
  return `${view}${print}${notes}`;
}

function renderRequisitions() {
  const yearRows = state.data.requisitions.filter(item => item.fiscalYear === Number(state.selectedFiscalYear));
  const rows = requisitionRows();
  $('#requisitionPendingSummary').textContent = formatNumber(yearRows.filter(item => item.status === 'PENDING').length);
  $('#requisitionApprovedSummary').textContent = formatNumber(yearRows.filter(item => item.status === 'APPROVED').length);
  $('#requisitionIssuedSummary').textContent = formatNumber(yearRows.filter(item => item.status === 'ISSUED').length);
  $('#requisitionCount').textContent = `${formatNumber(rows.length)} ${t('รายการ', 'items')}`;
  const isOpen = Number(state.selectedFiscalYear) === state.data.activeFiscalYear;
  $('#addRequisitionButton').disabled = !isOpen;
  $('#addRequisitionButton').title = isOpen ? '' : t('สร้างคำขอได้เฉพาะปีงบประมาณที่เปิดอยู่', 'Requests can only be created in the open fiscal year');
  $('#requisitionHead').innerHTML = `<tr><th>${t('เลขที่คำขอ', 'Request no.')}</th><th>${t('วันที่ขอ', 'Request date')}</th><th>${t('ผู้ขอเบิก', 'Requester')}</th><th>${t('ฝ่ายที่ขอเบิก', 'Department')}</th><th>${t('รายการ', 'Items')}</th><th>${t('สถานะ', 'Status')}</th><th></th></tr>`;
  const { page, items } = paginate(rows, state.requisitionPage, REQUISITION_PAGE_SIZE);
  state.requisitionPage = page;
  $('#requisitionBody').innerHTML = items.length ? items.map(item => {
    const totalQuantity = item.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const first = item.lines[0];
    const more = item.lines.length > 1 ? t(` และอีก ${item.lines.length - 1} รายการ`, ` and ${item.lines.length - 1} more`) : '';
    return `<tr><td><strong>${escapeHtml(item.requestNo)}</strong></td><td>${formatDate(item.requestDate)}</td><td><span class="cell-main">${escapeHtml(item.requesterName)}</span></td><td>${escapeHtml(item.department)}</td><td><span class="cell-main" title="${escapeHtml(item.lines.map(line => line.materialName).join(', '))}">${escapeHtml(first?.materialName || '—')}${more}</span><span class="cell-sub">${formatNumber(totalQuantity)} ${t('หน่วยรวม', 'total units')}</span></td><td>${requisitionStatusBadge(item.status)}</td><td><div class="row-actions">${requisitionActions(item)}</div></td></tr>`;
  }).join('') : emptyRow(7, t('ยังไม่มีคำขอเบิกในปีงบประมาณนี้', 'No requisitions in this fiscal year'));
  renderPagination('#requisitionPagination', rows.length, page, 'requisitionPage', REQUISITION_PAGE_SIZE);
}

function renderFiscal() {
  const selected = state.data.fiscalYears.find(item => item.year === Number(state.selectedFiscalYear));
  const periods = state.data.fiscalPeriods
    .filter(item => item.fiscalYear === Number(state.selectedFiscalYear) && !item.deleted)
    .map(item => ({ ...item, material: state.data.materials.find(row => row.id === item.materialId) }))
    .filter(item => item.material?.categoryId === state.selectedFiscalCategory)
    .sort((a, b) => a.materialCode.localeCompare(b.materialCode, 'th'));
  const openRequisitions = state.data.requisitions.filter(item => item.fiscalYear === Number(state.selectedFiscalYear) && ['PENDING', 'APPROVED'].includes(item.status)).length;
  const hasBlockingWork = openRequisitions > 0;
  const isOpen = selected.status === 'OPEN';
  const selectedCategory = state.data.categories.find(item => item.id === state.selectedFiscalCategory);
  $('#fiscalReportPeriodLabel').textContent = t('ช่วงรายงาน', 'Report period');
  $('#fiscalReportMonthLabel').textContent = t('เลือกเดือน', 'Select month');
  const availability = getMonthlyReportAvailability({
    fiscalYear: selected.year, startDate: selected.startDate, endDate: selected.endDate,
    fiscalPeriods: state.data.fiscalPeriods, materials: state.data.materials, movements: state.data.movements,
  });
  const months = printableMonthlyKeys(availability, selected.endDate);
  if (!months.length && state.selectedReportPeriod === 'month') state.selectedReportPeriod = 'year';
  $('#fiscalReportPeriod').innerHTML = `<option value="year">${t('ทั้งปีงบประมาณ', 'Full fiscal year')}</option><option value="month"${months.length ? '' : ' disabled'}>${t('รายเดือน', 'Monthly')}</option>`;
  $('#fiscalReportPeriod').value = state.selectedReportPeriod;
  if (!months.includes(state.selectedReportMonth)) state.selectedReportMonth = months.at(-1) || '';
  $('#fiscalReportMonth').innerHTML = months.map(key => {
    const date = new Date(`${key}-01T00:00:00.000Z`);
    const label = new Intl.DateTimeFormat(state.lang === 'th' ? 'th-TH' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
    const partial = key === availability?.partialMonth ? t(' (ช่วงเริ่มใช้ระบบ)', ' (system start period)') : '';
    return `<option value="${key}">${escapeHtml(label + partial)}</option>`;
  }).join('');
  $('#fiscalReportMonth').value = state.selectedReportMonth;
  $('#fiscalReportMonthLabel').hidden = state.selectedReportPeriod !== 'month';
  $('#fiscalReportMonth').hidden = state.selectedReportPeriod !== 'month';
  $('#fiscalReportHint').textContent = state.selectedReportPeriod === 'month'
    ? t('รายเดือนแสดงยอดจากวันที่เริ่มบันทึกจริง', 'Monthly reports use actual dated records from the start of tracking.')
    : !months.length
      ? t('ยังไม่มีเดือนที่พิมพ์รายงานได้ในปีงบประมาณนี้', 'No printable month is available in this fiscal year yet.')
    : t('รายปีแสดงยอดจากตารางปีงบประมาณตามที่บันทึกไว้', 'Annual reports use the recorded fiscal-year balances.');
  $('#fiscalCategoryTitle').textContent = `${t('ประเภท', 'Category')} ${selectedCategory?.[state.lang === 'th' ? 'nameTh' : 'nameEn'] || '—'}`;
  $('#fiscalPrintAllButtonText').textContent = t('พิมพ์รวมทุกประเภท', 'Print all categories');
  $('#fiscalPrintButtonText').textContent = t('พิมพ์ประเภทนี้', 'Print this category');
  $('#fiscalPrintAllButton').disabled = !selected || !state.data.categories.length || state.selectedReportPeriod === 'month' && !months.length;
  $('#fiscalPrintButton').disabled = !selected || !selectedCategory || state.selectedReportPeriod === 'month' && !months.length;
  $('#addAnnualButton').disabled = !isOpen;
  $('#fiscalTitle').textContent = `${t('ปีงบประมาณ', 'Fiscal year')} ${selected.year}`;
  $('#fiscalRange').textContent = `${formatFiscalDate(selected.startDate)} – ${formatFiscalDate(selected.endDate)}`;
  $('#fiscalStatus').className = `badge ${isOpen ? 'active' : 'neutral'}`;
  $('#fiscalStatus').textContent = isOpen ? t('เปิดใช้งาน', 'Open') : t('ปิดงวดแล้ว', 'Closed');
  $('#closeFiscalButton').textContent = isOpen ? t(`ปิดปีและเปิดปี ${selected.year + 1}`, `Close and open FY ${selected.year + 1}`) : t('ปิดปีแล้ว', 'Closed');
  $('#closeFiscalButton').disabled = !isOpen || hasBlockingWork;
  $('#closeFiscalButton').title = hasBlockingWork ? t(`ยังมีคำขอเบิกที่ยังไม่จบ ${openRequisitions} รายการ`, `${openRequisitions} requisitions remain`) : '';
  const metrics = [
    [t('วัสดุในงวด', 'Materials in period'), periods.length],
    [t('มีการรับเข้า', 'With receipts'), periods.filter(item => item.receivedBeforeSystem + item.receivedInSystem > 0).length],
    [t('มีการจ่ายออก', 'With issues'), periods.filter(item => item.issuedBeforeSystem + item.issuedInSystem > 0).length],
    [t('มีคงเหลือ', 'With closing stock'), periods.filter(item => item.closingBalance > 0).length],
  ];
  $('#fiscalMetrics').innerHTML = metrics.map(([label, value]) => `<div><span>${label}</span><strong>${formatNumber(value)}</strong><small>${t('รายการวัสดุ', 'materials')}</small></div>`).join('');
  $('#fiscalReadiness').className = `fiscal-readiness ${hasBlockingWork ? 'warning' : 'ready'}`;
  $('#fiscalReadiness').innerHTML = isOpen
    ? hasBlockingWork
      ? `<strong>${t('ยังปิดปีไม่ได้', 'Not ready to close')}</strong><span>${t(`มีคำขอเบิกที่ยังไม่จบ ${openRequisitions} รายการ`, `${openRequisitions} open requisitions`)}</span>`
      : `<strong>${t('พร้อมปิดปีงบประมาณ', 'Ready to close')}</strong><span>${t('ระบบจะล็อกปีนี้ แล้วยกรายการวัสดุและยอดคงเหลือเป็นต้นงวดปีถัดไปโดยไม่บันทึกรับซ้ำ', 'Closing this year carries materials and closing stock into the next opening balance without a duplicate receipt.')}</span>`
    : `<strong>${t('ปีงบประมาณนี้ปิดแล้ว', 'Fiscal year closed')}</strong><span>${t(`ยอดคงเหลือถูกยกไปปี ${selected.year + 1} แล้ว`, `Balances were carried to FY ${selected.year + 1}`)}</span>`;
  $('#fiscalMaterialCount').textContent = `${formatNumber(periods.length)} ${t('รายการ', 'items')}`;
  $('#fiscalHead').innerHTML = `<tr><th rowspan="2" class="number-cell">${t('ลำดับ', 'No.')}</th><th rowspan="2">${t('รายการวัสดุ', 'Material')}</th><th>${t('บรรจุ', 'Package')}</th><th>${t(`ปีงบประมาณ ณ ${selected.year - 1}`, `Fiscal year ${selected.year - 1}`)}</th><th>${t(`ปีงบประมาณ ณ ${selected.year}`, `Fiscal year ${selected.year}`)}</th><th rowspan="2" class="number-cell">${t('รวมจำนวนรับ', 'Total received')}</th><th rowspan="2" class="number-cell">${t('รวมจำนวนจ่าย', 'Total issued')}</th><th colspan="3">${t(`คงเหลือสิ้นปีงบประมาณ ${selected.year}`, `Closing balance FY ${selected.year}`)}</th><th rowspan="2">${t('หมายเหตุ', 'Note')}</th><th rowspan="2"></th></tr><tr><th>${t('หน่วยนับ', 'Unit')}</th><th class="number-cell">${t('คงเหลือยกมา', 'Opening balance')}</th><th class="number-cell">${t('รับระหว่างปี', 'Received during year')}</th><th class="number-cell">${t('จำนวน (หน่วย)', 'Quantity')}</th><th class="number-cell">${t('ราคา/หน่วยล่าสุด', 'Latest unit price')}</th><th class="number-cell">${t('ราคารวม', 'Total value')}</th></tr>`;
  const { page, items } = paginate(periods, state.fiscalPage);
  state.fiscalPage = page;
  $('#fiscalBody').innerHTML = items.length ? items.map(item => {
    const received = item.receivedBeforeSystem + item.receivedInSystem;
    const issued = item.issuedBeforeSystem + item.issuedInSystem;
    const totalReceived = item.reportedTotalReceived + item.receivedInSystem;
    const rowNo = (page - 1) * state.pageSize + items.indexOf(item) + 1;
    return `<tr><td class="number-cell">${formatNumber(rowNo)}</td><td>${imageMarkup(item.material?.imageUrl, item.material?.categoryId, item.materialName)}<span class="cell-main" title="${escapeHtml(item.materialName)}">${escapeHtml(item.materialName)}</span><span class="cell-sub">${escapeHtml(item.materialCode)}</span></td><td>${escapeHtml(item.material?.unit || '—')}</td><td class="number-cell">${formatReportNumber(item.openingBalance)}</td><td class="number-cell">${formatReportNumber(received)}</td><td class="number-cell">${formatReportNumber(totalReceived)}</td><td class="number-cell">${formatReportNumber(issued)}</td><td class="number-cell ${isLowStock(item.closingBalance) ? 'stock-low' : ''}"><strong>${formatReportNumber(item.closingBalance)}</strong></td><td class="number-cell">${formatMoney(item.latestPrice)}</td><td class="number-cell">${formatMoney(item.reportedValue)}</td><td><span class="cell-main note-cell" title="${escapeHtml(item.note)}">${escapeHtml(item.note || '—')}</span></td><td><div class="row-actions">${isOpen ? `<button class="action-button" data-annual-edit="${item.id}">${t('แก้ไข', 'Edit')}</button><button class="action-button danger" data-annual-delete="${item.id}">${t('ลบ', 'Delete')}</button>` : `<span class="badge neutral">${t('ปิดงวดแล้ว', 'Closed')}</span>`}</div></td></tr>`;
  }).join('') : emptyRow(12, t('ยังไม่มีวัสดุในประเภทนี้', 'No materials in this category'));
  renderPagination('#fiscalPagination', periods.length, page, 'fiscalPage');
}

function fiscalReportRows(categoryId) {
  return state.data.fiscalPeriods
    .filter(item => item.fiscalYear === Number(state.selectedFiscalYear) && !item.deleted)
    .map(item => ({ ...item, material: state.data.materials.find(row => row.id === item.materialId) }))
    .filter(item => item.material?.categoryId === categoryId)
    .sort((a, b) => a.materialCode.localeCompare(b.materialCode, 'th'));
}

function openReportWindow(markup) {
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) {
    toast(t('เบราว์เซอร์ปิดกั้นหน้ารายงาน กรุณาอนุญาต Pop-up สำหรับเว็บไซต์นี้', 'The report window was blocked. Allow pop-ups for this site.'), true);
    return;
  }
  reportWindow.opener = null;
  reportWindow.document.open();
  reportWindow.document.write(markup);
  reportWindow.document.close();
}

function openRequisitionReport(item) {
  if (!item) {
    toast(t('ไม่พบคำขอเบิกสำหรับจัดทำเอกสาร', 'Requisition not found'), true);
    return;
  }
  openReportWindow(buildRequisitionReportDocument({ requisition: item }));
}

function openFiscalReport() {
  const selected = state.data.fiscalYears.find(item => item.year === Number(state.selectedFiscalYear));
  const category = state.data.categories.find(item => item.id === state.selectedFiscalCategory);
  if (!selected || !category) {
    toast(t('ไม่มีข้อมูลสำหรับจัดทำรายงาน', 'No data available for this report'), true);
    return;
  }
  if (state.selectedReportPeriod === 'month') {
    openReportWindow(buildMonthlyFiscalReportDocument({
      fiscalYear: selected.year, startDate: selected.startDate, endDate: selected.endDate,
      month: state.selectedReportMonth, categories: state.data.categories, materials: state.data.materials,
      fiscalPeriods: state.data.fiscalPeriods,
      movements: state.data.movements, categoryId: category.id, lang: state.lang,
    }));
    return;
  }
  openReportWindow(buildFiscalReportDocument({
    fiscalYear: selected.year,
    startDate: selected.startDate,
    endDate: selected.endDate,
    categoryName: category[state.lang === 'th' ? 'nameTh' : 'nameEn'],
    rows: fiscalReportRows(category.id),
    lang: state.lang,
  }));
}

function openCombinedFiscalReport() {
  const selected = state.data.fiscalYears.find(item => item.year === Number(state.selectedFiscalYear));
  if (!selected || !state.data.categories.length) {
    toast(t('ไม่มีข้อมูลสำหรับจัดทำรายงาน', 'No data available for this report'), true);
    return;
  }
  if (state.selectedReportPeriod === 'month') {
    openReportWindow(buildMonthlyFiscalReportDocument({
      fiscalYear: selected.year, startDate: selected.startDate, endDate: selected.endDate,
      month: state.selectedReportMonth, categories: state.data.categories, materials: state.data.materials,
      fiscalPeriods: state.data.fiscalPeriods,
      movements: state.data.movements, lang: state.lang,
    }));
    return;
  }
  const categories = [...state.data.categories]
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map(category => ({
      categoryName: category[state.lang === 'th' ? 'nameTh' : 'nameEn'],
      rows: fiscalReportRows(category.id),
    }));
  openReportWindow(buildCombinedFiscalReportDocument({
    fiscalYear: selected.year,
    startDate: selected.startDate,
    endDate: selected.endDate,
    categories,
    lang: state.lang,
  }));
}

function movementLabel(type) {
  return ({ OPENING: t('ยอดยกมา', 'Opening'), CUTOVER: t('ยอดคงเหลือนำเข้า', 'Imported balance'), CARRY_FORWARD: t('ยกยอดข้ามปี', 'Carry forward'), RECEIPT: t('รับเข้า', 'Receipt'), ADJUST_IN: t('ปรับเพิ่ม', 'Adjust in'), ADJUST_OUT: t('ปรับลด', 'Adjust out'), ISSUE: t('เบิก', 'Issue'), SOURCE_CORRECTION: t('แก้ไขรายงาน', 'Report correction'), VOID: t('ลบรายการ', 'Deleted') })[type] || type;
}

function renderMovements() {
  const q = $('#movementSearch').value.trim().toLocaleLowerCase('th-TH');
  const materialsById = new Map(state.data.materials.map(item => [item.id, item]));
  const rows = state.data.movements
    .map(item => ({ ...item, materialCategory: categoryName(materialsById.get(item.materialId)?.categoryId) || '—' }))
    .filter(item => item.fiscalYear === Number(state.selectedFiscalYear) && (!q || `${item.materialCode} ${item.materialName} ${item.materialCategory}`.toLocaleLowerCase('th-TH').includes(q)));
  $('#movementHead').innerHTML = `<tr><th>${t('วันที่', 'Date')}</th><th>${t('วัสดุ', 'Material')}</th><th>${t('ประเภทวัสดุ', 'Material category')}</th><th>${t('ประเภทรายการ', 'Movement type')}</th><th class="number-cell">${t('เปลี่ยนแปลง', 'Change')}</th><th class="number-cell">${t('คงเหลือหลังรายการ', 'Balance')}</th><th>${t('ผู้ทำรายการ', 'Actor')}</th></tr>`;
  const { page, items } = paginate(rows, state.movementPage);
  state.movementPage = page;
  $('#movementBody').innerHTML = items.length ? items.map(item => `<tr><td>${formatDate(item.occurredAt)}</td><td>${imageMarkup(materialsById.get(item.materialId)?.imageUrl, materialsById.get(item.materialId)?.categoryId, item.materialName)}<span class="cell-main">${escapeHtml(item.materialName)}</span><span class="cell-sub">${escapeHtml(item.materialCode)}</span></td><td>${escapeHtml(item.materialCategory)}</td><td><span class="badge ${item.change < 0 ? 'out' : 'in'}">${movementLabel(item.type)}</span></td><td class="number-cell"><strong class="movement-change ${item.change > 0 ? 'movement-positive' : item.change < 0 ? 'movement-negative' : 'movement-neutral'}">${item.change > 0 ? '+' : ''}${formatNumber(item.change)}</strong></td><td class="number-cell ${isLowStock(item.balanceAfter) ? 'stock-low' : ''}">${formatNumber(item.balanceAfter)}</td><td>${escapeHtml(item.actor)}</td></tr>`).join('') : emptyRow(7, t('ยังไม่มีรายการเคลื่อนไหว', 'No stock movements'));
  renderPagination('#movementPagination', rows.length, page, 'movementPage');
}

function paginate(items, requestedPage, pageSize = state.pageSize) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pages);
  return { page, items: items.slice((page - 1) * pageSize, page * pageSize), pages };
}

function emptyRow(span, message = t('ไม่พบข้อมูล', 'No data found')) {
  return `<tr><td colspan="${span}" class="empty-table">${message}</td></tr>`;
}

function renderPagination(selector, total, page, key, pageSize = state.pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const visible = [...new Set([1, page - 1, page, page + 1, pages].filter(value => value >= 1 && value <= pages))];
  $(selector).innerHTML = `<span>${total ? `${formatNumber((page - 1) * pageSize + 1)}–${formatNumber(Math.min(page * pageSize, total))} / ${formatNumber(total)}` : `0 / 0`}</span><span class="page-buttons"><button class="page-button" aria-label="${t('หน้าก่อนหน้า', 'Previous page')}" data-page-key="${key}" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>${chevronIcon('left')}</button>${visible.map((value, index) => `${index && value - visible[index - 1] > 1 ? '<span>…</span>' : ''}<button class="page-button ${value === page ? 'active' : ''}" data-page-key="${key}" data-page="${value}" ${value === page ? 'aria-current="page"' : ''}>${value}</button>`).join('')}<button class="page-button" aria-label="${t('หน้าถัดไป', 'Next page')}" data-page-key="${key}" data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>${chevronIcon('right')}</button></span>`;
}

function field(name, label, value = '', type = 'text', extra = '') {
  return `<div class="field"><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra}></div>`;
}

function categoryField(selected) {
  return `<div class="field"><label for="field-categoryId">${t('ประเภทวัสดุ', 'Category')}</label><select id="field-categoryId" name="categoryId" required>${state.data.categories.map(item => `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(item[state.lang === 'th' ? 'nameTh' : 'nameEn'])}</option>`).join('')}</select></div>`;
}

function openDialog(config) {
  state.dialog = config;
  $('#actionDialog').classList.toggle('requisition-dialog', String(config.type).startsWith('requisition'));
  $('#dialogEyebrow').textContent = config.eyebrow || '';
  $('#dialogEyebrow').hidden = !config.eyebrow;
  $('#dialogTitle').textContent = config.title;
  $('#dialogBody').innerHTML = config.body;
  bindImageField($('#dialogBody'));
  $('#dialogSubmit').textContent = config.submit;
  $('#dialogSubmit').style.background = config.danger ? 'var(--danger)' : '';
  $('#dialogSubmit').style.borderColor = config.danger ? 'var(--danger)' : '';
  $('#actionDialog').showModal();
}

function materialForm(item = {}) {
  return `<div class="form-grid">${imageField(item.imageUrl, item.categoryId)}${field('name', t('ชื่อวัสดุ', 'Material name'), item.name, 'text', 'required maxlength="300"')}${categoryField(item.categoryId || state.data.categories[0].id)}${field('unit', t('หน่วยนับ', 'Unit'), item.unit, 'text', 'required maxlength="60"')}${field('reorderPoint', t('จุดแจ้งเตือน', 'Reorder point'), item.reorderPoint || 0, 'number', 'required min="0" step="0.001"')}${field('packDetail', t('รายละเอียดบรรจุ', 'Pack detail'), item.packDetail || '', 'text', 'maxlength="300"')}${item.id ? `<div class="field"><label>${t('สถานะ', 'Status')}</label><label class="switch-line"><input name="active" type="checkbox" ${item.active ? 'checked' : ''}> ${t('เปิดใช้งาน', 'Active')}</label></div>` : field('openingBalance', t('คงเหลือยกมา', 'Opening balance'), 0, 'number', 'required min="0" step="0.001"')}</div>`;
}

function annualMaterialForm(item = {}) {
  const material = item.material || {};
  const categoryId = material.categoryId || state.selectedFiscalCategory;
  return `<div class="form-grid">
    ${imageField(material.imageUrl, categoryId)}
    <input type="hidden" name="categoryId" value="${escapeHtml(categoryId)}">
    ${field('name', t('รายการวัสดุ', 'Material'), item.materialName || material.name || '', 'text', 'required maxlength="300"')}
    ${field('unit', t('หน่วยนับ', 'Unit'), material.unit || '', 'text', 'required maxlength="60"')}
    ${field('openingBalance', t(`ปีงบประมาณ ณ ${Number(state.selectedFiscalYear) - 1} คงเหลือยกมา`, 'Opening balance'), item.openingBalance ?? 0, 'number', 'required min="0" step="0.001"')}
    ${field('receivedBeforeSystem', t(`ปีงบประมาณ ณ ${state.selectedFiscalYear} รับระหว่างปี`, 'Received during year'), item.receivedBeforeSystem ?? 0, 'number', 'required min="0" step="0.001"')}
    ${field('reportedTotalReceived', t('รวมจำนวนรับ', 'Total received'), item.reportedTotalReceived ?? 0, 'number', 'required min="0" step="0.001"')}
    ${field('issuedBeforeSystem', t('รวมจำนวนจ่าย', 'Total issued'), item.issuedBeforeSystem ?? 0, 'number', 'required min="0" step="0.001"')}
    ${field('cutoverBalance', t(`คงเหลือสิ้นปีงบประมาณ ${state.selectedFiscalYear} จำนวน (หน่วย)`, 'Closing quantity'), item.cutoverBalance ?? 0, 'number', 'required min="0" step="0.001"')}
    ${field('latestPrice', t('ราคา/หน่วยล่าสุด', 'Latest unit price'), item.latestPrice ?? 0, 'number', 'required min="0" step="0.01"')}
    ${field('reportedValue', t('ราคารวม', 'Total value'), item.reportedValue ?? 0, 'number', 'readonly min="0" step="0.01" aria-live="polite"')}
    <div class="field full"><label for="field-note">${t('หมายเหตุ', 'Note')}</label><textarea id="field-note" name="note" maxlength="500">${escapeHtml(item.note || material.note || '')}</textarea></div>
  </div>`;
}

function openMaterial(item = null) {
  openDialog({ type: item ? 'edit' : 'create', target: item, eyebrow: item?.code || '', title: item ? t('แก้ไขข้อมูลวัสดุ', 'Edit material') : t('เพิ่มวัสดุใหม่', 'Add material'), submit: item ? t('บันทึกการแก้ไข', 'Save changes') : t('สร้างวัสดุ', 'Create material'), body: materialForm(item || {}) });
}

function openAnnualMaterial(period = null) {
  if (period && !period.material) period = { ...period, material: state.data.materials.find(item => item.id === period.materialId) };
  openDialog({
    type: period ? 'annualEdit' : 'annualCreate',
    target: period,
    eyebrow: `${t('ประเภท', 'Category')} ${categoryName(state.selectedFiscalCategory)}`,
    title: period ? t('แก้ไขรายการวัสดุ', 'Edit annual material') : t('เพิ่มรายการวัสดุ', 'Add annual material'),
    submit: period ? t('บันทึกการแก้ไข', 'Save changes') : t('เพิ่มรายการ', 'Add item'),
    body: annualMaterialForm(period || {}),
  });
  updateAnnualTotal();
}

function updateAnnualTotal() {
  if (!['annualCreate', 'annualEdit'].includes(state.dialog?.type)) return;
  const quantity = Number($('#field-cutoverBalance').value);
  const price = Number($('#field-latestPrice').value);
  const total = quantity * price;
  $('#field-reportedValue').value = Number.isFinite(total) && quantity >= 0 && price >= 0
    ? (Math.round((total + Number.EPSILON) * 100) / 100).toFixed(2)
    : '';
}

function openDeleteAnnual(period) {
  openDialog({
    type: 'annualDelete',
    target: period,
    eyebrow: period.materialCode,
    title: t('ลบรายการวัสดุ', 'Delete annual material'),
    submit: t('ยืนยันลบรายการ', 'Confirm delete'),
    danger: true,
    body: `<div class="source-card"><p><strong>${escapeHtml(period.materialName)}</strong></p><small>${t('รายการจะถูกนำออกจากตาราง แต่ยังเก็บประวัติการเปลี่ยนแปลงไว้', 'The row will be removed while its audit history is retained.')}</small></div>`,
  });
}

function openStock(id) {
  const item = state.data.materials.find(row => row.id === id);
  openDialog({ type: 'stock', target: item, eyebrow: item.code, title: t('บันทึกยอดคงเหลือ', 'Record stock movement'), submit: t('บันทึกรายการ', 'Record movement'), body: `<div class="source-card"><p>${escapeHtml(item.name)}</p><small>${t('คงเหลือ', 'On hand')} ${formatNumber(item.onHand)} ${escapeHtml(item.unit)} ${t('พร้อมเบิก', 'Available')} ${formatNumber(item.available)}</small></div><div class="form-grid" style="margin-top:16px"><div class="field"><label>${t('ประเภทรายการ', 'Movement type')}</label><select name="type"><option value="RECEIPT">${t('รับเข้า', 'Receipt')}</option><option value="ADJUST_IN">${t('ปรับยอดเพิ่ม', 'Adjust in')}</option><option value="ADJUST_OUT">${t('ปรับยอดลด', 'Adjust out')}</option></select></div>${field('quantity', t('จำนวน', 'Quantity'), 1, 'number', 'required min="0.001" step="0.001"')}${field('referenceNo', t('เลขอ้างอิง', 'Reference no.'), '', 'text', 'required maxlength="100"')}<div class="field"><label>${t('ประเภทอ้างอิง', 'Reference type')}</label><select name="referenceType"><option value="PURCHASE">${t('จัดซื้อ', 'Purchase')}</option><option value="COUNT">${t('ตรวจนับ', 'Stock count')}</option><option value="MANUAL">${t('ปรับปรุง', 'Manual')}</option></select></div><div class="field full"><label>${t('หมายเหตุ', 'Note')}</label><textarea name="note" maxlength="300"></textarea></div></div>` });
}

function openCloseFiscal() {
  const item = state.data.fiscalYears.find(row => row.year === Number(state.selectedFiscalYear));
  if (!item || item.status !== 'OPEN') return;
  openDialog({
    type: 'closeFiscal',
    target: item,
    eyebrow: t(`ปีงบประมาณ ${item.year}`, `Fiscal year ${item.year}`),
    title: t(`ปิดปีงบประมาณ ${item.year}`, `Close fiscal year ${item.year}`),
    submit: t(`ปิดปีและเปิดปี ${item.year + 1}`, `Close and open FY ${item.year + 1}`),
    danger: true,
    body: `<div class="source-card"><p><strong>${t('ผลหลังยืนยัน', 'After confirmation')}</strong></p><small>${t(`ระบบจะล็อกรายการปี ${item.year} และยกคงเหลือของวัสดุแต่ละรายการเป็นยอดยกมาปี ${item.year + 1}`, `FY ${item.year} will be locked and each closing balance carried to FY ${item.year + 1}`)}</small></div><div class="field" style="margin-top:16px"><label>${t(`พิมพ์ ${item.year} เพื่อยืนยัน`, `Type ${item.year} to confirm`)}</label><input name="confirmYear" type="number" required inputmode="numeric" autocomplete="off"></div>`,
  });
}

function defaultRequisitionDate() {
  const fiscal = state.data.fiscalYears.find(item => item.year === state.data.activeFiscalYear);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).filter(item => item.type !== 'literal').map(item => [item.type, item.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  return today >= fiscal.startDate && today <= fiscal.endDate ? today : fiscal.startDate;
}

function requisitionMaterials() {
  const periodIds = new Set(state.data.fiscalPeriods.filter(item => item.fiscalYear === state.data.activeFiscalYear && !item.deleted).map(item => item.materialId));
  return state.data.materials
    .filter(item => item.active && periodIds.has(item.id))
    .sort((a, b) => Number(maximumRequisitionQuantity(b) > 0) - Number(maximumRequisitionQuantity(a) > 0) || a.name.localeCompare(b.name, 'th'));
}

const maximumRequisitionQuantity = material => Math.max(0, Math.floor(Number(material?.available || 0) - 1));

function departmentField(selected = '') {
  const departments = state.data.requisitionDepartments || ['บริหาร', 'วิชาการ'];
  return `<div class="field"><label for="field-department">${t('ฝ่ายที่ขอเบิก', 'Requesting department')}</label><select id="field-department" name="department" required><option value="">${t('เลือกฝ่าย', 'Select department')}</option>${departments.map(item => `<option value="${escapeHtml(item)}" ${item === selected ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}</select></div>`;
}

function requisitionMaterialSummary(material) {
  if (!material) return `<span data-stock-hint>${t('ค้นหาและเลือกวัสดุจากทุกรายการในคลัง', 'Search all materials in stock')}</span>`;
  const unavailable = maximumRequisitionQuantity(material) < 1;
  return `<span data-stock-hint class="${unavailable ? 'stock-low' : ''}">${t('พร้อมเบิก', 'Available')} <strong>${formatNumber(material.available)} ${escapeHtml(material.unit)}</strong>${unavailable ? ` — ${t('ไม่สามารถเบิกได้', 'Unavailable')}` : ` — ${escapeHtml(categoryName(material.categoryId))}`}</span>`;
}

function renderRequisitionPickerResults(line, query = '') {
  const selectedHere = line.querySelector('[data-requisition-material]').value;
  const selectedElsewhere = new Set([...$('#requisitionLines').querySelectorAll('[data-requisition-line]')].filter(item => item !== line).map(item => item.querySelector('[data-requisition-material]').value).filter(Boolean));
  const normalized = query.trim().toLocaleLowerCase('th-TH');
  const all = requisitionMaterials();
  const matches = all.filter(item => !normalized || `${item.code} ${item.name} ${item.unit} ${categoryName(item.categoryId)}`.toLocaleLowerCase('th-TH').includes(normalized));
  const results = line.querySelector('[data-requisition-results]');
  results.innerHTML = `<div class="requisition-picker-meta">${t(`พบ ${formatNumber(matches.length)} จาก ${formatNumber(all.length)} รายการ`, `${formatNumber(matches.length)} of ${formatNumber(all.length)} items`)}</div>${matches.length ? matches.map(item => {
    const unavailable = maximumRequisitionQuantity(item) < 1;
    const duplicate = selectedElsewhere.has(item.id) && item.id !== selectedHere;
    const disabled = unavailable || duplicate;
    return `<button type="button" class="requisition-material-option${unavailable ? ' is-unavailable' : ''}${item.id === selectedHere ? ' is-selected' : ''}" data-select-requisition-material="${escapeHtml(item.id)}" role="option" aria-selected="${item.id === selectedHere}" ${disabled ? 'disabled' : ''}>${imageMarkup(item.imageUrl, item.categoryId, item.name)}<span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.code)} — ${escapeHtml(categoryName(item.categoryId))}</small></span><b class="${unavailable ? 'stock-low' : ''}">${formatNumber(item.available)} ${escapeHtml(item.unit)}${unavailable ? ` — ${t('ไม่พร้อมเบิก', 'Unavailable')}` : ''}${duplicate ? ` — ${t('เลือกแล้ว', 'Selected')}` : ''}</b></button>`;
  }).join('') : `<div class="requisition-picker-empty">${t('ไม่พบวัสดุที่ค้นหา', 'No matching materials')}</div>`}`;
  results.hidden = false;
  line.querySelector('[data-requisition-search]').setAttribute('aria-expanded', 'true');
}

function closeRequisitionPickers(except = null) {
  $$('.requisition-picker-results').forEach(results => {
    if (results !== except) {
      results.hidden = true;
      results.closest('[data-requisition-picker]')?.querySelector('[data-requisition-search]')?.setAttribute('aria-expanded', 'false');
    }
  });
}

function requisitionLineMarkup(line = {}) {
  const material = state.data.materials.find(item => item.id === line.materialId);
  const maximum = material ? maximumRequisitionQuantity(material) : '';
  return `<div class="requisition-line" data-requisition-line>
    <span class="requisition-line-number" aria-hidden="true"></span>
    <div class="field requisition-material-field"><label>${t('วัสดุ', 'Material')}</label><div class="requisition-picker" data-requisition-picker><input type="hidden" data-requisition-material value="${escapeHtml(line.materialId || '')}"><div class="requisition-picker-control"><span data-requisition-image>${imageMarkup(material?.imageUrl, material?.categoryId, material?.name || '')}</span><input data-requisition-search type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" placeholder="${t('พิมพ์ชื่อหรือรหัสวัสดุ', 'Search name or code')}" value="${escapeHtml(material?.name || '')}" required><button type="button" data-toggle-requisition-picker aria-label="${t('เปิดรายการวัสดุ', 'Open material list')}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></button></div><div class="requisition-picker-results" data-requisition-results role="listbox" hidden></div></div>${requisitionMaterialSummary(material)}</div>
    <div class="field requisition-quantity-field"><label>${t('จำนวนเบิก', 'Issue quantity')}</label><div class="requisition-quantity-control"><input data-requisition-quantity class="${maximum !== '' && maximum < 1 ? 'is-stock-low' : ''}" type="number" inputmode="numeric" value="${escapeHtml(line.quantity ?? 1)}" required min="1" step="1" ${maximum !== '' ? `max="${maximum}"` : ''} ${!material || maximum < 1 ? 'disabled' : ''}><span data-requisition-unit class="${maximum !== '' && maximum < 1 ? 'stock-low' : ''}">${escapeHtml(material?.unit || t('หน่วย', 'Unit'))}</span></div><small data-quantity-limit>${material ? maximum < 1 ? t('ยอดคงเหลือไม่พอเบิก', 'Not enough stock to issue') : t(`เบิกได้สูงสุด ${formatNumber(maximum)} ${material.unit}`, `Maximum ${formatNumber(maximum)} ${material.unit}`) : t('เลือกวัสดุก่อนระบุจำนวน', 'Select a material first')}</small></div>
    <button type="button" class="action-button danger requisition-remove" data-remove-requisition-line aria-label="${t('ลบรายการ', 'Remove item')}" title="${t('ลบรายการ', 'Remove item')}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg></button>
  </div>`;
}

function requisitionForm(item = {}) {
  const lines = item.lines?.length ? item.lines : [{}];
  return `<div class="requisition-form">
    <div class="requisition-request-meta">${dateField('requestDate', t('วันที่ขอเบิก', 'Request date'), item.requestDate || defaultRequisitionDate(), 'required', 'field', state.lang)}${field('requesterName', t('ชื่อผู้ขอเบิก', 'Requester name'), item.requesterName || '', 'text', 'required maxlength="160" autocomplete="name"')}${departmentField(item.department || '')}</div>
    <div class="field full"><label>${t('รายการวัสดุ', 'Requested items')}</label><div id="requisitionLines" class="requisition-lines">${lines.map(requisitionLineMarkup).join('')}</div><button type="button" class="secondary-button requisition-add-line" data-add-requisition-line><svg class="button-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>${t('เพิ่มรายการ', 'Add item')}</button><small class="form-guidance">${t('เพิ่มได้สูงสุด 20 รายการต่อคำขอ', 'Up to 20 items per request')}</small></div>
    <div class="field full"><label for="field-note">${t('วัตถุประสงค์การเบิก', 'Requisition purpose')}</label><textarea id="field-note" name="note" maxlength="500" placeholder="${t('ระบุวัตถุประสงค์หรือรายละเอียดการใช้งาน', 'Describe the purpose or intended use')}">${escapeHtml(item.note || '')}</textarea></div>
  </div>`;
}

function openRequisition(item = null) {
  openDialog({
    type: item ? 'requisitionEdit' : 'requisitionCreate',
    target: item,
    eyebrow: item?.requestNo || t(`ปีงบประมาณ ${state.data.activeFiscalYear}`, `Fiscal year ${state.data.activeFiscalYear}`),
    title: item ? t('แก้ไขคำขอเบิก', 'Edit requisition') : t('สร้างคำขอเบิก', 'Create requisition'),
    submit: item ? t('บันทึกการแก้ไข', 'Save changes') : t('ส่งคำขอเบิก', 'Submit request'),
    body: requisitionForm(item || {}),
  });
  bindDateFields($('#dialogBody'), state.lang);
  updateRequisitionLineNumbers();
  $$('#requisitionLines [data-requisition-line]').forEach(syncRequisitionLine);
}

function requisitionDetail(item) {
  const isAdmin = state.data.app.role === 'admin';
  const quantityEditable = isAdmin && ['PENDING', 'APPROVED'].includes(item.status);
  const showLegacyIssuedQuantity = ['APPROVED', 'ISSUED'].includes(item.status);
  const rows = item.lines.map((line, index) => {
    const issuedQuantity = line.issueQuantity ?? (showLegacyIssuedQuantity ? line.quantity : null);
    const allocationValue = line.issueQuantity ?? line.quantity;
    const allocation = quantityEditable
      ? `<label class="requisition-detail-quantity"><span class="sr-only">${t('จำนวนจ่าย', 'Issue quantity')} ${escapeHtml(line.materialName)}</span><span class="requisition-approval-quantity"><input data-detail-issue-quantity type="number" inputmode="numeric" min="1" max="${escapeHtml(line.quantity)}" step="1" value="${escapeHtml(allocationValue)}" required><span>${escapeHtml(line.unit)}</span></span><small>${t(`ไม่เกิน ${formatNumber(line.quantity)} ${line.unit}`, `Maximum ${formatNumber(line.quantity)} ${line.unit}`)}</small></label>`
      : issuedQuantity == null ? '—' : `<strong>${formatNumber(issuedQuantity)}</strong> ${escapeHtml(line.unit)}`;
    const itemNote = isAdmin
      ? `<label class="requisition-detail-note"><span class="sr-only">${t('หมายเหตุต่อรายการ', 'Item note')} ${escapeHtml(line.materialName)}</span><input data-detail-note type="text" maxlength="300" value="${escapeHtml(line.note || '')}" placeholder="${t('ระบุเมื่อจ่ายไม่ครบหรือมีเงื่อนไข', 'Add a note for partial issue or special conditions')}"></label>`
      : escapeHtml(line.note || '—');
    return `<tr data-detail-line data-material-id="${escapeHtml(line.materialId)}"><td class="number-cell">${index + 1}</td><td>${requisitionMaterialIdentity(line)}</td><td class="number-cell"><strong>${formatNumber(line.quantity)}</strong> ${escapeHtml(line.unit)}</td><td class="number-cell">${allocation}</td><td>${itemNote}</td></tr>`;
  }).join('');
  const event = item.status === 'ISSUED' ? [t('วันที่จ่าย', 'Issued date'), item.issuedAt, item.issuedBy] : item.status === 'APPROVED' ? [t('วันที่อนุมัติ', 'Approved date'), item.approvedAt, item.approvedBy] : item.status === 'REJECTED' ? [t('วันที่ไม่อนุมัติ', 'Rejected date'), item.rejectedAt, item.rejectedBy] : item.status === 'CANCELLED' ? [t('วันที่ยกเลิก', 'Cancelled date'), item.cancelledAt, item.cancelledBy] : null;
  const guidance = isAdmin ? quantityEditable
    ? t('กำหนดจำนวนจ่ายได้ตั้งแต่ 1 ถึงจำนวนที่ผู้ใช้ขอ และระบุหมายเหตุแยกแต่ละรายการได้', 'Set an issue quantity from 1 up to the requested quantity and add a note for each item.')
    : t('คำขอนี้ปิดการแก้จำนวนแล้ว แต่ยังแก้หมายเหตุต่อรายการได้', 'Issue quantities are locked, but item notes can still be edited.')
    : '';
  openDialog({ type: isAdmin ? 'requisitionAllocation' : 'requisitionInspect', target: item, eyebrow: item.requestNo, title: t('รายละเอียดคำขอเบิก', 'Requisition details'), submit: isAdmin ? t('บันทึกจำนวนจ่ายและหมายเหตุ', 'Save quantities and notes') : t('ปิด', 'Close'), body: `<div class="requisition-detail-meta"><div><span>${t('วันที่ขอเบิก', 'Request date')}</span><strong>${formatDate(item.requestDate)}</strong></div><div><span>${t('สถานะ', 'Status')}</span>${requisitionStatusBadge(item.status)}</div><div><span>${t('ผู้ขอเบิก', 'Requester')}</span><strong>${escapeHtml(item.requesterName)}</strong></div><div><span>${t('ฝ่ายที่ขอเบิก', 'Department')}</span><strong>${escapeHtml(item.department)}</strong></div>${event ? `<div><span>${event[0]}</span><strong>${formatDate(event[1])}</strong></div><div><span>${t('ผู้ดำเนินการ', 'Processed by')}</span><strong>${escapeHtml(event[2] || '—')}</strong></div>` : ''}</div>${guidance ? `<p class="requisition-detail-guidance">${guidance}</p>` : ''}<div class="table-wrap requisition-detail-table"><table><thead><tr><th>${t('ลำดับ', 'No.')}</th><th>${t('วัสดุ', 'Material')}</th><th>${t('จำนวนเบิก', 'Requested')}</th><th>${t('จำนวนจ่าย', 'Issued')}</th><th>${t('หมายเหตุต่อรายการ', 'Item note')}</th></tr></thead><tbody>${rows}</tbody></table></div>${item.note ? `<div class="requisition-note"><span>${t('วัตถุประสงค์การเบิก', 'Requisition purpose')}</span><p>${escapeHtml(item.note)}</p></div>` : ''}` });
  if (!isAdmin) {
    $('#dialogSubmit').type = 'button';
    $('#dialogSubmit').onclick = () => $('#actionDialog').close();
  }
}

function requisitionMaterialIdentity(line) {
  const material = state.data.materials.find(item => item.id === line.materialId);
  return `<div class="requisition-material-identity">${imageMarkup(material?.imageUrl, material?.categoryId, line.materialName)}<span><strong>${escapeHtml(line.materialName)}</strong><small>${escapeHtml(line.materialCode)}</small></span></div>`;
}

function openRequisitionNotes(item) {
  const lines = item.lines.map(line => `<div class="requisition-note-line" data-note-line data-material-id="${escapeHtml(line.materialId)}">${requisitionMaterialIdentity(line)}<label><span>${t('หมายเหตุต่อรายการ', 'Item note')}</span><input data-note-value type="text" maxlength="300" value="${escapeHtml(line.note || '')}" placeholder="${t('ระบุรายละเอียดของรายการนี้', 'Add a note for this item')}"></label></div>`).join('');
  openDialog({
    type: 'requisitionNotes',
    target: item,
    eyebrow: item.requestNo,
    title: t('แก้ไขหมายเหตุคำขอเบิก', 'Edit requisition notes'),
    submit: t('บันทึกหมายเหตุ', 'Save notes'),
    body: `<div class="source-card"><p><strong>${escapeHtml(item.requesterName)}</strong> — ${escapeHtml(item.department)}</p><small>${t('แก้ไขได้เฉพาะวัตถุประสงค์และหมายเหตุต่อรายการ โดยไม่เปลี่ยนสถานะหรือยอดวัสดุ', 'Only the purpose and item notes can be changed. Status and stock remain unchanged.')}</small></div><div class="field requisition-purpose-editor"><label>${t('วัตถุประสงค์การเบิก', 'Requisition purpose')}</label><textarea name="note" maxlength="500" placeholder="${t('ระบุวัตถุประสงค์การเบิก', 'Describe the purpose')}">${escapeHtml(item.note || '')}</textarea></div><div class="requisition-note-lines">${lines}</div>`,
  });
}

function confirmRequisitionAction(item, action) {
  const config = {
    approve: [t('อนุมัติคำขอเบิก', 'Approve requisition'), t('อนุมัติ', 'Approve'), t('เมื่ออนุมัติ จำนวนวัสดุจะย้ายไปอยู่ในยอดรอจ่าย', 'Approval moves quantities into awaiting issue stock'), false],
    reject: [t('ไม่อนุมัติคำขอเบิก', 'Reject requisition'), t('ยืนยันไม่อนุมัติ', 'Confirm rejection'), t('คำขอนี้จะถูกปิดโดยไม่กระทบยอดวัสดุ', 'The request will close without changing stock'), true],
    issue: [t('ยืนยันการจ่ายวัสดุ', 'Confirm issue'), t('จ่ายวัสดุ', 'Issue materials'), t('ระบบจะตัดยอดคงเหลือตามรายการนี้ทันที', 'On-hand stock will be deducted immediately'), false],
    cancel: [t('ยกเลิกคำขอเบิก', 'Cancel requisition'), t('ยืนยันยกเลิก', 'Confirm cancellation'), item.status === 'APPROVED' ? t('ยอดรอจ่ายของรายการนี้จะถูกคืนเป็นยอดพร้อมเบิก', 'Reserved quantities will return to available stock') : t('คำขอนี้จะถูกยกเลิกโดยไม่กระทบยอดวัสดุ', 'The request will be cancelled without changing stock'), true],
  }[action];
  if (!config) return;
  const purpose = item.note ? `<p class="requisition-approval-purpose"><span>${t('วัตถุประสงค์การเบิก', 'Requisition purpose')}</span><strong>${escapeHtml(item.note)}</strong></p>` : '';
  const approvalLines = action === 'approve' ? `<div class="requisition-approval-lines" aria-label="${t('รายการอนุมัติจ่าย', 'Approval lines')}">
    <div class="requisition-approval-head"><span>${t('รายการวัสดุ', 'Material')}</span><span>${t('จำนวนเบิก', 'Requested')}</span><span>${t('จำนวนจ่าย', 'Issue quantity')}</span><span>${t('หมายเหตุต่อรายการ', 'Item note')}</span></div>
    ${item.lines.map(line => `<div class="requisition-approval-line" data-approval-line data-material-id="${escapeHtml(line.materialId)}">${requisitionMaterialIdentity(line)}<span class="requisition-requested-quantity">${formatNumber(line.quantity)} ${escapeHtml(line.unit)}</span><label><span class="sr-only">${t('จำนวนจ่าย', 'Issue quantity')} ${escapeHtml(line.materialName)}</span><div class="requisition-approval-quantity"><input data-approval-quantity type="number" inputmode="numeric" min="1" max="${escapeHtml(line.quantity)}" step="1" value="${escapeHtml(line.issueQuantity ?? line.quantity)}" required><span>${escapeHtml(line.unit)}</span></div></label><label><span class="sr-only">${t('หมายเหตุต่อรายการ', 'Item note')} ${escapeHtml(line.materialName)}</span><input data-approval-note type="text" maxlength="300" value="${escapeHtml(line.note || '')}" placeholder="${t('ระบุเมื่อจ่ายไม่ครบหรือมีเงื่อนไข', 'Add a note for partial issue or special conditions')}"></label></div>`).join('')}
  </div>` : '';
  openDialog({ type: `requisition${action[0].toUpperCase()}${action.slice(1)}`, target: item, eyebrow: item.requestNo, title: config[0], submit: config[1], danger: config[3], body: `<div class="source-card"><p><strong>${escapeHtml(item.requesterName)}</strong> — ${escapeHtml(item.department)}</p><small>${config[2]}</small>${purpose}</div>${approvalLines}` });
}

function syncRequisitionLine(line) {
  const material = state.data.materials.find(item => item.id === line.querySelector('[data-requisition-material]').value);
  line.querySelector('[data-stock-hint]').outerHTML = requisitionMaterialSummary(material);
  const quantity = line.querySelector('[data-requisition-quantity]');
  const maximum = material ? maximumRequisitionQuantity(material) : 0;
  quantity.max = material ? String(maximum) : '';
  quantity.disabled = !material || maximum < 1;
  quantity.classList.toggle('is-stock-low', Boolean(material && maximum < 1));
  line.querySelector('[data-requisition-unit]').textContent = material?.unit || t('หน่วย', 'Unit');
  line.querySelector('[data-requisition-unit]').classList.toggle('stock-low', Boolean(material && maximum < 1));
  line.querySelector('[data-quantity-limit]').textContent = material ? maximum < 1 ? t('ยอดคงเหลือไม่พอเบิก', 'Not enough stock to issue') : t(`เบิกได้สูงสุด ${formatNumber(maximum)} ${material.unit}`, `Maximum ${formatNumber(maximum)} ${material.unit}`) : t('เลือกวัสดุก่อนระบุจำนวน', 'Select a material first');
  line.querySelector('[data-quantity-limit]').classList.toggle('stock-low', Boolean(material && maximum < 1));
  const image = line.querySelector('[data-requisition-image]');
  image.innerHTML = imageMarkup(material?.imageUrl, material?.categoryId, material?.name || '');
}

function selectRequisitionMaterial(line, materialId) {
  const material = state.data.materials.find(item => item.id === materialId);
  if (!material || maximumRequisitionQuantity(material) < 1) return;
  line.querySelector('[data-requisition-material]').value = material.id;
  const search = line.querySelector('[data-requisition-search]');
  search.value = material.name;
  search.dataset.selectedName = material.name;
  search.setCustomValidity('');
  syncRequisitionLine(line);
  const quantity = line.querySelector('[data-requisition-quantity]');
  const maximum = maximumRequisitionQuantity(material);
  if (!Number.isSafeInteger(Number(quantity.value)) || Number(quantity.value) <= 0 || Number(quantity.value) > maximum) {
    quantity.value = String(Math.min(1, maximum));
  }
  closeRequisitionPickers();
}

function updateRequisitionLineNumbers() {
  $$('#requisitionLines [data-requisition-line]').forEach((line, index) => { line.querySelector('.requisition-line-number').textContent = index + 1; });
}

async function submitDialog(event) {
  event.preventDefault();
  if (!state.dialog || state.dialog.type === 'inspect' || state.dialog.saving) return;
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const action = state.dialog;
  let endpoint;
  let payload;
  if (action.type === 'create') {
    endpoint = '/api/materials/create'; payload = { ...values, active: true, operationId: opId() };
  } else if (action.type === 'edit') {
    endpoint = '/api/materials/update'; payload = { ...values, active: values.active === 'on', materialId: action.target.id, version: action.target.version, operationId: opId() };
  } else if (action.type === 'annualCreate') {
    endpoint = '/api/annual-materials/create'; payload = { ...values, fiscalYear: state.data.activeFiscalYear, operationId: opId() };
  } else if (action.type === 'annualEdit') {
    const material = state.data.materials.find(item => item.id === action.target.materialId);
    endpoint = '/api/annual-materials/update'; payload = { ...values, materialId: action.target.materialId, fiscalYear: state.data.activeFiscalYear, version: action.target.version, materialVersion: material.version, operationId: opId() };
  } else if (action.type === 'annualDelete') {
    const material = state.data.materials.find(item => item.id === action.target.materialId);
    endpoint = '/api/annual-materials/delete'; payload = { materialId: action.target.materialId, fiscalYear: state.data.activeFiscalYear, version: action.target.version, materialVersion: material.version, operationId: opId() };
  } else if (action.type === 'stock') {
    endpoint = '/api/stock'; payload = { ...values, materialId: action.target.id, fiscalYear: state.data.activeFiscalYear, operationId: opId() };
  } else if (action.type === 'closeFiscal') {
    endpoint = '/api/fiscal-years/close'; payload = { ...values, fiscalYear: action.target.year, version: action.target.version, operationId: opId() };
  } else if (['requisitionCreate', 'requisitionEdit'].includes(action.type)) {
    const lineElements = [...$('#requisitionLines').querySelectorAll('[data-requisition-line]')];
    const missing = lineElements.find(line => !line.querySelector('[data-requisition-material]').value);
    if (missing) {
      const search = missing.querySelector('[data-requisition-search]');
      search.setCustomValidity(t('กรุณาเลือกวัสดุจากรายการค้นหา', 'Select a material from the search results'));
      search.reportValidity();
      return;
    }
    const lines = lineElements.map(line => ({ materialId: line.querySelector('[data-requisition-material]').value, quantity: line.querySelector('[data-requisition-quantity]').value }));
    endpoint = action.type === 'requisitionCreate' ? '/api/requisitions/create' : '/api/requisitions/update';
    payload = { ...values, lines, operationId: opId(), ...(action.target ? { requisitionId: action.target.id, version: action.target.version } : {}) };
  } else if (action.type === 'requisitionApprove') {
    const lines = [...$('#dialogBody').querySelectorAll('[data-approval-line]')].map(line => ({
      materialId: line.dataset.materialId,
      issueQuantity: line.querySelector('[data-approval-quantity]').value,
      note: line.querySelector('[data-approval-note]').value,
    }));
    endpoint = '/api/requisitions/approve';
    payload = { requisitionId: action.target.id, version: action.target.version, lines, operationId: opId() };
  } else if (action.type === 'requisitionAllocation') {
    const lines = [...$('#dialogBody').querySelectorAll('[data-detail-line]')].map(line => ({
      materialId: line.dataset.materialId,
      issueQuantity: line.querySelector('[data-detail-issue-quantity]')?.value ?? '',
      note: line.querySelector('[data-detail-note]').value,
    }));
    endpoint = '/api/requisitions/update-allocation';
    payload = { requisitionId: action.target.id, version: action.target.version, lines, operationId: opId() };
  } else if (action.type === 'requisitionNotes') {
    const lines = [...$('#dialogBody').querySelectorAll('[data-note-line]')].map(line => ({
      materialId: line.dataset.materialId,
      note: line.querySelector('[data-note-value]').value,
    }));
    endpoint = '/api/requisitions/update-notes';
    payload = { requisitionId: action.target.id, version: action.target.version, note: values.note || '', lines, operationId: opId() };
  } else if (action.type.startsWith('requisition')) {
    const actionName = action.type.slice('requisition'.length).toLowerCase();
    endpoint = `/api/requisitions/${actionName}`;
    payload = { requisitionId: action.target.id, version: action.target.version, operationId: opId() };
  }
  try {
    action.saving = true;
    $('#dialogSubmit').disabled = true;
    Object.assign(payload, await imagePayload($('#dialogBody')));
    await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    if (action.type === 'closeFiscal') state.selectedFiscalYear = action.target.year + 1;
    $('#actionDialog').close();
    state.dialog = null;
    await refresh();
    const success = action.type === 'annualDelete' ? t('ลบรายการสำเร็จ', 'Deleted successfully') : action.type === 'annualCreate' ? t('เพิ่มรายการสำเร็จ', 'Added successfully') : action.type === 'annualEdit' ? t('แก้ไขรายการสำเร็จ', 'Updated successfully') : action.type === 'requisitionCreate' ? t('ส่งคำขอเบิกแล้ว', 'Requisition submitted') : action.type === 'requisitionEdit' ? t('แก้ไขคำขอเบิกแล้ว', 'Requisition updated') : action.type === 'requisitionAllocation' ? t('บันทึกจำนวนจ่ายและหมายเหตุแล้ว', 'Issue quantities and notes saved') : action.type === 'requisitionNotes' ? t('บันทึกหมายเหตุแล้ว', 'Notes saved') : action.type === 'requisitionApprove' ? t('อนุมัติแล้ว ยอดอยู่ในรอจ่าย', 'Approved and awaiting issue') : action.type === 'requisitionIssue' ? t('จ่ายวัสดุและตัดยอดแล้ว', 'Materials issued and stock deducted') : action.type === 'requisitionReject' ? t('ไม่อนุมัติคำขอแล้ว', 'Requisition rejected') : action.type === 'requisitionCancel' ? t('ยกเลิกคำขอแล้ว', 'Requisition cancelled') : t('บันทึกสำเร็จ', 'Saved successfully');
    toast(success);
  } catch (error) { toast(error.message, true); }
  finally { action.saving = false; $('#dialogSubmit').disabled = false; }
}

function bind() {
  $$('.nav-item').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  $('#refreshButton').addEventListener('click', async () => {
    if ($('#actionDialog').open && !window.confirm(t('ข้อมูลในหน้าต่างที่ยังไม่บันทึกจะหายไป ต้องการรีเฟรชหรือไม่', 'Unsaved dialog changes will be lost. Refresh anyway?'))) return;
    if ($('#actionDialog').open) $('#actionDialog').close();
    const button = $('#refreshButton');
    if (button.disabled) return;
    button.disabled = true;
    button.classList.add('is-refreshing');
    button.setAttribute('aria-busy', 'true');
    try {
      await refresh();
      toast(t('อัปเดตข้อมูลแล้ว', 'Data refreshed'));
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.classList.remove('is-refreshing');
      button.removeAttribute('aria-busy');
    }
  });
  $('#languageButton').addEventListener('click', () => { state.lang = state.lang === 'th' ? 'en' : 'th'; localStorage.setItem('material-lang', state.lang); render(); });
  $('#themeButton').addEventListener('click', () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; localStorage.setItem('material-theme', state.theme); render(); });
  $('#fiscalYearSelect').addEventListener('change', event => {
    state.selectedFiscalYear = Number(event.target.value);
    state.materialPage = state.movementPage = state.fiscalPage = state.requisitionPage = 1;
    render();
  });
  $('#inkDashboardYearSelect').addEventListener('change', event => {
    state.selectedInkFiscalYear = Number(event.target.value);
    renderOverview();
  });
  ['materialSearch', 'materialCategory'].forEach(id => $(`#${id}`).addEventListener(id.includes('Search') ? 'input' : 'change', () => { state.materialPage = 1; renderMaterials(); }));
  ['requisitionSearch', 'requisitionStatus'].forEach(id => $(`#${id}`).addEventListener(id.includes('Search') ? 'input' : 'change', () => { state.requisitionPage = 1; renderRequisitions(); }));
  $('#movementSearch').addEventListener('input', () => { state.movementPage = 1; renderMovements(); });
  $('#addMaterialButton').addEventListener('click', () => openMaterial());
  $('#addRequisitionButton').addEventListener('click', () => openRequisition());
  $('#fiscalCategory').addEventListener('change', event => { state.selectedFiscalCategory = event.target.value; state.fiscalPage = 1; renderFiscal(); });
  $('#fiscalReportPeriod').addEventListener('change', event => { state.selectedReportPeriod = event.target.value; renderFiscal(); });
  $('#fiscalReportMonth').addEventListener('change', event => { state.selectedReportMonth = event.target.value; });
  $('#addAnnualButton').addEventListener('click', () => openAnnualMaterial());
  $('#fiscalPrintAllButton').addEventListener('click', openCombinedFiscalReport);
  $('#fiscalPrintButton').addEventListener('click', openFiscalReport);
  $('#closeFiscalButton').addEventListener('click', openCloseFiscal);
  $('#actionForm').addEventListener('submit', submitDialog);
  $('#actionForm').addEventListener('input', event => {
    if (['cutoverBalance', 'latestPrice'].includes(event.target.name)) updateAnnualTotal();
    if (event.target.matches('[data-requisition-search]')) {
      const line = event.target.closest('[data-requisition-line]');
      const selected = state.data.materials.find(item => item.id === line.querySelector('[data-requisition-material]').value);
      if (!selected || event.target.value !== selected.name) {
        line.querySelector('[data-requisition-material]').value = '';
        event.target.setCustomValidity(t('กรุณาเลือกวัสดุจากรายการค้นหา', 'Select a material from the search results'));
        syncRequisitionLine(line);
      }
      renderRequisitionPickerResults(line, event.target.value);
    }
  });
  $('#actionForm').addEventListener('focusin', event => {
    if (event.target.matches('[data-requisition-search]')) renderRequisitionPickerResults(event.target.closest('[data-requisition-line]'), event.target.value);
  });
  $('#actionForm').addEventListener('keydown', event => {
    if (!event.target.matches('[data-requisition-search]')) return;
    const line = event.target.closest('[data-requisition-line]');
    if (event.key === 'Escape') {
      line.querySelector('[data-requisition-results]').hidden = true;
      event.target.setAttribute('aria-expanded', 'false');
    }
    if (event.key === 'Enter') {
      const first = line.querySelector('[data-select-requisition-material]:not(:disabled)');
      if (first && !line.querySelector('[data-requisition-results]').hidden) {
        event.preventDefault();
        selectRequisitionMaterial(line, first.dataset.selectRequisitionMaterial);
      }
    }
  });
  $('#actionDialog').addEventListener('close', () => { state.dialog = null; $('#dialogSubmit').onclick = null; $('#dialogSubmit').type = 'submit'; });
  $('#actionDialog').addEventListener('cancel', event => { if (state.dialog?.saving) event.preventDefault(); });
  document.addEventListener('click', event => {
    const node = event.target.closest('button');
    if (!node) return;
    if (node.dataset.go) setView(node.dataset.go);
    if (node.dataset.dashboardTab) { state.dashboardTab = node.dataset.dashboardTab; applyLocale(); renderOverview(); }
    if (node.dataset.edit) openMaterial(state.data.materials.find(item => item.id === node.dataset.edit));
    if (node.dataset.stock) openStock(node.dataset.stock);
    if (node.dataset.annualEdit) openAnnualMaterial(state.data.fiscalPeriods.find(item => item.id === node.dataset.annualEdit));
    if (node.dataset.annualDelete) openDeleteAnnual(state.data.fiscalPeriods.find(item => item.id === node.dataset.annualDelete));
    if (node.dataset.requisitionView) requisitionDetail(state.data.requisitions.find(item => item.id === node.dataset.requisitionView));
    if (node.dataset.requisitionPrint) openRequisitionReport(state.data.requisitions.find(item => item.id === node.dataset.requisitionPrint));
    if (node.dataset.requisitionEdit) openRequisition(state.data.requisitions.find(item => item.id === node.dataset.requisitionEdit));
    if (node.dataset.requisitionNotes) openRequisitionNotes(state.data.requisitions.find(item => item.id === node.dataset.requisitionNotes));
    if (node.dataset.requisitionApprove) confirmRequisitionAction(state.data.requisitions.find(item => item.id === node.dataset.requisitionApprove), 'approve');
    if (node.dataset.requisitionReject) confirmRequisitionAction(state.data.requisitions.find(item => item.id === node.dataset.requisitionReject), 'reject');
    if (node.dataset.requisitionIssue) confirmRequisitionAction(state.data.requisitions.find(item => item.id === node.dataset.requisitionIssue), 'issue');
    if (node.dataset.requisitionCancel) confirmRequisitionAction(state.data.requisitions.find(item => item.id === node.dataset.requisitionCancel), 'cancel');
    if (node.dataset.selectRequisitionMaterial) selectRequisitionMaterial(node.closest('[data-requisition-line]'), node.dataset.selectRequisitionMaterial);
    if (node.hasAttribute('data-toggle-requisition-picker')) {
      const line = node.closest('[data-requisition-line]');
      const results = line.querySelector('[data-requisition-results]');
      if (results.hidden) renderRequisitionPickerResults(line, line.querySelector('[data-requisition-search]').value);
      else closeRequisitionPickers();
    }
    if (node.hasAttribute('data-add-requisition-line')) {
      const lines = $('#requisitionLines');
      if (lines.children.length < 20) {
        lines.insertAdjacentHTML('beforeend', requisitionLineMarkup());
        updateRequisitionLineNumbers();
      }
    }
    if (node.hasAttribute('data-remove-requisition-line')) {
      const lines = $('#requisitionLines');
      if (lines.children.length > 1) {
        node.closest('[data-requisition-line]').remove();
        updateRequisitionLineNumbers();
      }
    }
    if (node.dataset.pageKey) { state[node.dataset.pageKey] = Number(node.dataset.page); renderView(); }
    if (node.hasAttribute('data-close-dialog') && !state.dialog?.saving) $('#actionDialog').close();
  });
  document.addEventListener('change', event => {
    if (event.target.matches('[data-requisition-quantity]')) event.target.setCustomValidity('');
  });
  document.addEventListener('click', event => { if (!event.target.closest('[data-requisition-picker]')) closeRequisitionPickers(); });
}

bindInk();
bind();
setView(state.view);
refresh().catch(error => toast(error.message, true));
