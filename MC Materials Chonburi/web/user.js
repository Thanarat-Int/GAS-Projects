import { imageMarkup } from './material-images.js';
import { bindDateFields, displayDate } from './dates.js';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const PAGE_SIZE = 12;
const CART_PAGE_SIZE = 5;
const USER_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const USER_SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
let localSessionActivityBound = false;
const state = {
  data: null,
  search: '',
  categoryId: '',
  page: 1,
  cartPage: 1,
  cart: new Map(),
  invalidMaterialIds: new Set(),
  submitting: false,
  pendingOperationId: null,
  language: 'th',
};

const translations = {
  th: {
    documentTitle: 'ขอเบิกวัสดุ | ศูนย์แพทย์', brandHome: 'หน้าหลักระบบขอเบิกวัสดุ', brandTitle: 'ระบบขอเบิกวัสดุ', organization: 'ศูนย์แพทยศาสตรศึกษาชั้นคลินิก โรงพยาบาลชลบุรี',
    onlineService: 'บริการเบิกวัสดุออนไลน์', introTitle: 'เลือกวัสดุ แล้วส่งคำขอได้ในหน้าเดียว', introDescription: 'ค้นหาจากชื่อหรือรหัส ตรวจสอบจำนวนที่พร้อมเบิก และระบุจำนวนตามหน่วยนับของวัสดุได้ทันที',
    stepSelect: 'เลือกวัสดุ', stepSelectDescription: 'ค้นหาจากรายการทั้งหมด', stepQuantity: 'ระบุจำนวน', stepQuantityDescription: 'ระบบแสดงหน่วยนับอัตโนมัติ', stepSubmit: 'ส่งคำขอ', stepSubmitDescription: 'รอเจ้าหน้าที่ตรวจสอบ',
    catalogEyebrow: 'รายการวัสดุ', catalogTitle: 'เลือกวัสดุที่ต้องการเบิก', searchPlaceholder: 'ค้นหาชื่อหรือรหัสวัสดุ', searchLabel: 'ค้นหาวัสดุ', allCategories: 'ทุกประเภท', categoryLabel: 'ประเภทวัสดุ',
    requestEyebrow: 'คำขอของคุณ', requestTitle: 'รายการขอเบิก', requestDate: 'วันที่ขอเบิก', requesterName: 'ชื่อผู้ขอเบิก', requesterPlaceholder: 'ชื่อและนามสกุล', department: 'ฝ่ายที่ขอเบิก', selectDepartment: 'เลือกฝ่าย',
    emptyCart: 'ยังไม่ได้เลือกวัสดุ', emptyCartDescription: 'กดปุ่มเพิ่มในคำขอจากรายการด้านซ้าย', purpose: 'วัตถุประสงค์การเบิก', optional: 'ไม่บังคับ', purposePlaceholder: 'ระบุวัตถุประสงค์หรือรายละเอียดการใช้งาน', submitRequest: 'ส่งคำขอเบิก', submitting: 'กำลังส่งคำขอ', privacyNote: 'หลังส่งคำขอ เจ้าหน้าที่จะตรวจสอบและดำเนินการตามลำดับค่ะ',
    successEyebrow: 'ส่งคำขอสำเร็จ', successTitle: 'เจ้าหน้าที่ได้รับคำขอแล้ว', requestNumber: 'เลขที่คำขอ', newRequest: 'สร้างคำขอใหม่',
    notAvailable: 'ไม่พร้อมเบิก', insufficient: 'ยอดคงเหลือไม่เพียงพอ', alreadyAdded: 'เพิ่มในคำขอแล้ว', addToRequest: 'เพิ่มในคำขอ', quantityRequired: 'กรุณาระบุจำนวน', integerQuantity: 'จำนวนเบิกต้องเป็นเลขจำนวนเต็ม', invalidQuantitySummary: 'กรุณาตรวจสอบจำนวนของรายการที่มีกรอบสีแดง',
    noResults: 'ไม่พบวัสดุที่ค้นหา', noResultsHelp: 'ลองใช้ชื่อ รหัส หรือเลือกประเภทวัสดุใหม่', loadFailed: 'โหลดข้อมูลไม่สำเร็จ', requestFailed: 'ระบบขัดข้อง กรุณาลองใหม่',
    darkMode: 'เปลี่ยนเป็นโหมดมืด', lightMode: 'เปลี่ยนเป็นโหมดสว่าง', languageLabel: 'เลือกภาษา', refreshData: 'รีเฟรชข้อมูล', refreshed: 'อัปเดตข้อมูลแล้ว', catalogPagination: 'หน้ารายการวัสดุ', cartPagination: 'หน้ารายการขอเบิก', previousPage: 'หน้าก่อนหน้า', nextPage: 'หน้าถัดไป',
  },
  en: {
    documentTitle: 'Material Requisition | Medical Center', brandHome: 'Material requisition home', brandTitle: 'Material Requisition', organization: 'Clinical Medical Education Center, Chonburi Hospital',
    onlineService: 'Online material requisition', introTitle: 'Select materials and submit in one place', introDescription: 'Search by name or code, check available stock, and enter quantities using the correct unit.',
    stepSelect: 'Select materials', stepSelectDescription: 'Search the complete catalog', stepQuantity: 'Enter quantities', stepQuantityDescription: 'Units appear automatically', stepSubmit: 'Submit request', stepSubmitDescription: 'Wait for staff review',
    catalogEyebrow: 'Material catalog', catalogTitle: 'Select materials to request', searchPlaceholder: 'Search by material name or code', searchLabel: 'Search materials', allCategories: 'All categories', categoryLabel: 'Material category',
    requestEyebrow: 'Your request', requestTitle: 'Requisition items', requestDate: 'Request date', requesterName: 'Requester name', requesterPlaceholder: 'Full name', department: 'Requesting department', selectDepartment: 'Select department',
    emptyCart: 'No materials selected', emptyCartDescription: 'Select Add to request from the material catalog', purpose: 'Requisition purpose', optional: 'Optional', purposePlaceholder: 'Describe the purpose or intended use', submitRequest: 'Submit request', submitting: 'Submitting request', privacyNote: 'Staff will review and process your request in sequence.',
    successEyebrow: 'Request submitted', successTitle: 'Your request has been received', requestNumber: 'Request number', newRequest: 'Create another request',
    notAvailable: 'Unavailable', insufficient: 'Insufficient stock', alreadyAdded: 'Added to request', addToRequest: 'Add to request', quantityRequired: 'Please enter a quantity', integerQuantity: 'Quantity must be a whole number', invalidQuantitySummary: 'Check the quantity of each item outlined in red.',
    noResults: 'No materials found', noResultsHelp: 'Try another name, code, or material category', loadFailed: 'Unable to load data', requestFailed: 'Something went wrong. Please try again.',
    darkMode: 'Switch to dark mode', lightMode: 'Switch to light mode', languageLabel: 'Select language', refreshData: 'Refresh data', refreshed: 'Data refreshed', catalogPagination: 'Material catalog pages', cartPagination: 'Requisition item pages', previousPage: 'Previous page', nextPage: 'Next page',
  },
};

const departmentLabels = {
  th: { 'บริหาร': 'บริหาร', 'วิชาการ': 'วิชาการ' },
  en: { 'บริหาร': 'Administration', 'วิชาการ': 'Academic' },
};

const englishUnits = { 'รีม': 'reams', 'กล่อง': 'boxes', 'ก้อน': 'units', 'ม้วน': 'rolls', 'กก.': 'kg', 'อัน': 'units', 'แฟ้ม': 'files', 'ซอง': 'envelopes', 'ขวด': 'bottles', 'แผ่น': 'sheets', 'แท่ง': 'pieces', 'ชิ้น': 'pieces', 'ชุด': 'sets', 'ห่อ': 'packs', 'แพ็ค': 'packs', 'ใบ': 'units', 'ถุง': 'bags', 'หลอด': 'tubes' };

const t = key => translations[state.language][key] ?? translations.th[key] ?? key;
const formatNumber = value => new Intl.NumberFormat(state.language === 'en' ? 'en-US' : 'th-TH', { maximumFractionDigits: 3 }).format(Number(value || 0));
const unitLabel = unit => state.language === 'en' ? englishUnits[unit] || unit : unit;
const itemsLabel = count => state.language === 'en' ? `${formatNumber(count)} items` : `${formatNumber(count)} รายการ`;
const fiscalYearLabel = year => state.language === 'en' ? `Fiscal year ${year}` : `ปีงบประมาณ ${year}`;
const maximumLabel = (quantity, unit) => state.language === 'en' ? `Maximum ${formatNumber(quantity)} ${unitLabel(unit)}` : `เบิกได้สูงสุด ${formatNumber(quantity)} ${unitLabel(unit)}`;
const availableLabel = (quantity, unit) => state.language === 'en' ? `${formatNumber(quantity)} ${unitLabel(unit)} available` : `${formatNumber(quantity)} ${unitLabel(unit)}`;
const readyLabel = (quantity, unit) => state.language === 'en' ? `${formatNumber(quantity)} ${unitLabel(unit)} available` : `พร้อมเบิก ${formatNumber(quantity)} ${unitLabel(unit)}`;
const pageSummary = (start, end, total) => state.language === 'en' ? `Items ${formatNumber(start)}–${formatNumber(end)} of ${formatNumber(total)}` : `รายการที่ ${formatNumber(start)}–${formatNumber(end)} จาก ${formatNumber(total)} รายการ`;
const cartPageSummary = (start, end, total) => state.language === 'en' ? `${formatNumber(start)}–${formatNumber(end)} of ${formatNumber(total)}` : `${formatNumber(start)}–${formatNumber(end)} จาก ${formatNumber(total)}`;
const pageAria = page => state.language === 'en' ? `Page ${page}` : `หน้าที่ ${page}`;
const quantityAria = name => state.language === 'en' ? `Quantity for ${name}` : `จำนวน ${name}`;
const removeAria = name => state.language === 'en' ? `Remove ${name} from request` : `นำ ${name} ออกจากคำขอ`;
const quantityExceeds = (quantity, unit) => state.language === 'en' ? `Maximum quantity is ${formatNumber(quantity)} ${unitLabel(unit)}` : `ระบุได้สูงสุด ${formatNumber(quantity)} ${unitLabel(unit)}`;

function bindLocalSessionActivity() {
  if (window.materialUserWaitForAccess || localSessionActivityBound) return;
  localSessionActivityBound = true;
  let lastActivityAt = Date.now();
  let lastTouchAt = Date.now();
  let idleTimer = null;
  const leave = () => location.assign('/user/access');
  const arm = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(leave, Math.max(0, USER_IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt)));
  };
  const touch = async () => {
    try {
      const response = await fetch('/api/public/session/touch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) leave();
    } catch { /* A later request will verify the session. */ }
  };
  const record = () => {
    lastActivityAt = Date.now();
    arm();
    if (lastActivityAt - lastTouchAt >= USER_SESSION_TOUCH_INTERVAL_MS) {
      lastTouchAt = lastActivityAt;
      touch();
    }
  };
  ['pointerdown', 'keydown', 'input', 'change', 'touchstart', 'wheel'].forEach(name => {
    document.addEventListener(name, record, { passive: true, capture: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastActivityAt >= USER_IDLE_TIMEOUT_MS) leave();
    else record();
  });
  arm();
}

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (response.status === 401) {
    if (typeof window.materialUserExit === 'function') window.materialUserExit();
    else location.assign('/user/access');
    throw new Error(t('requestFailed'));
  }
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.message || t('requestFailed'));
  return result.data;
}

function categoryName(categoryId) {
  const category = state.data.categories.find(item => item.id === categoryId);
  return (state.language === 'en' ? category?.nameEn : category?.nameTh) || category?.nameTh || categoryId;
}

function maximumIssue(material) {
  return Math.max(0, Math.floor(Number(material.available || 0) - 1));
}

function setRequestDate(value) {
  const input = $('#userRequestDate');
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function todayWithinFiscalYear() {
  const today = new Date();
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const fiscal = state.data.fiscalYear;
  if (!fiscal) return local;
  return local < fiscal.startDate ? fiscal.startDate : local > fiscal.endDate ? fiscal.endDate : local;
}

function filteredMaterials() {
  const query = state.search.trim().toLocaleLowerCase(state.language === 'en' ? 'en-US' : 'th-TH');
  return state.data.materials
    .filter(item => !state.categoryId || item.categoryId === state.categoryId)
    .filter(item => {
      const category = state.data.categories.find(row => row.id === item.categoryId);
      return !query || `${item.code} ${item.name} ${category?.nameTh || ''} ${category?.nameEn || ''}`.toLocaleLowerCase().includes(query);
    })
    .sort((a, b) => Number(maximumIssue(b) > 0) - Number(maximumIssue(a) > 0) || a.code.localeCompare(b.code, state.language === 'en' ? 'en' : 'th'));
}

function materialCard(material) {
  const unavailable = maximumIssue(material) < 1;
  const selected = state.cart.has(material.id);
  return `<article class="user-material-card${unavailable ? ' is-unavailable' : ''}">
    <div class="user-material-card-top">${imageMarkup(material.imageUrl, material.categoryId, material.name)}<div><h3 title="${escapeHtml(material.name)}">${escapeHtml(material.name)}</h3><span class="user-material-code">${escapeHtml(material.code)} | ${escapeHtml(categoryName(material.categoryId))}</span></div></div>
    <div class="user-material-stock"><span>${unavailable ? t('notAvailable') : maximumLabel(maximumIssue(material), material.unit)}</span><strong class="${unavailable ? 'is-low' : ''}">${availableLabel(material.available, material.unit)}</strong></div>
    <button class="primary-button" type="button" data-add-material="${escapeHtml(material.id)}" ${unavailable || selected ? 'disabled' : ''}>${unavailable ? t('insufficient') : selected ? t('alreadyAdded') : t('addToRequest')}</button>
  </article>`;
}

function paginationItems(totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = [...new Set([1, totalPages, state.page - 1, state.page, state.page + 1].filter(page => page >= 1 && page <= totalPages))].sort((a, b) => a - b);
  const items = [];
  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (previous && page - previous === 2) items.push(previous + 1);
    else if (previous && page - previous > 2) items.push(`gap-${previous}`);
    items.push(page);
  });
  return items;
}

function arrow(direction) {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${direction === 'previous' ? 'm12.5 4.5-5 5.5 5 5.5' : 'm7.5 4.5 5 5.5-5 5.5'}"/></svg>`;
}

function renderPagination(totalRows) {
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const start = totalRows ? (state.page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(state.page * PAGE_SIZE, totalRows);
  const pagination = $('#userPagination');
  pagination.hidden = totalRows <= PAGE_SIZE;
  pagination.setAttribute('aria-label', t('catalogPagination'));
  $('#userPageSummary').textContent = pageSummary(start, end, totalRows);
  const pageButtons = paginationItems(totalPages).map(item => typeof item === 'number'
    ? `<button type="button" class="user-page-button${item === state.page ? ' is-active' : ''}" data-user-page="${item}" aria-label="${pageAria(item)}" ${item === state.page ? 'aria-current="page"' : ''}>${formatNumber(item)}</button>`
    : '<span class="user-page-gap" aria-hidden="true">…</span>').join('');
  $('#userPageControls').innerHTML = `<button type="button" class="user-page-button user-page-arrow" data-user-page="previous" aria-label="${t('previousPage')}" ${state.page === 1 ? 'disabled' : ''}>${arrow('previous')}</button>${pageButtons}<button type="button" class="user-page-button user-page-arrow" data-user-page="next" aria-label="${t('nextPage')}" ${state.page === totalPages ? 'disabled' : ''}>${arrow('next')}</button>`;
}

function renderCatalog() {
  const rows = filteredMaterials();
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);
  const pageStart = (state.page - 1) * PAGE_SIZE;
  const visibleRows = rows.slice(pageStart, pageStart + PAGE_SIZE);
  $('#userMaterialCount').textContent = itemsLabel(rows.length);
  $('#userMaterialGrid').innerHTML = visibleRows.length ? visibleRows.map(materialCard).join('') : `<div class="user-catalog-empty"><strong>${t('noResults')}</strong><span>${t('noResultsHelp')}</span></div>`;
  renderPagination(rows.length);
}

function cartRows() {
  return [...state.cart.entries()].map(([id, quantity]) => ({ material: state.data.materials.find(item => item.id === id), quantity })).filter(item => item.material);
}

function quantityError(material, quantity) {
  const value = Number(quantity);
  if (!Number.isFinite(value) || value <= 0) return t('quantityRequired');
  if (!Number.isSafeInteger(value)) return t('integerQuantity');
  if (value > maximumIssue(material)) return quantityExceeds(maximumIssue(material), material.unit);
  return '';
}

function cartItem(material, quantity) {
  const error = state.invalidMaterialIds.has(material.id) ? quantityError(material, quantity) : '';
  return `<div class="user-cart-item${error ? ' has-quantity-error' : ''}" data-cart-material="${escapeHtml(material.id)}">
    ${imageMarkup(material.imageUrl, material.categoryId, material.name)}
    <div class="user-cart-item-name"><strong title="${escapeHtml(material.name)}">${escapeHtml(material.name)}</strong><small>${readyLabel(maximumIssue(material), material.unit)}</small></div>
    <label class="user-cart-quantity"><input type="number" inputmode="numeric" data-cart-quantity value="${escapeHtml(quantity)}" min="0" max="${maximumIssue(material)}" step="1" aria-label="${escapeHtml(quantityAria(material.name))}" aria-invalid="${error ? 'true' : 'false'}" required><span>${escapeHtml(unitLabel(material.unit))}</span></label>
    <button class="user-cart-remove" type="button" data-remove-material="${escapeHtml(material.id)}" aria-label="${escapeHtml(removeAria(material.name))}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg></button>
    ${error ? `<span class="user-cart-validation" role="alert">${escapeHtml(error)}</span>` : ''}
  </div>`;
}

function updateSubmitState(rows = cartRows()) {
  const invalid = rows.some(item => quantityError(item.material, item.quantity));
  const button = $('#userSubmitRequest');
  button.disabled = !rows.length || state.submitting;
  button.classList.toggle('is-disabled', rows.length > 0 && invalid);
  button.setAttribute('aria-disabled', String(!rows.length || state.submitting || invalid));
}

function renderCartPagination(totalRows) {
  const totalPages = Math.max(1, Math.ceil(totalRows / CART_PAGE_SIZE));
  state.cartPage = Math.min(Math.max(1, state.cartPage), totalPages);
  const start = totalRows ? (state.cartPage - 1) * CART_PAGE_SIZE + 1 : 0;
  const end = Math.min(state.cartPage * CART_PAGE_SIZE, totalRows);
  const pagination = $('#userCartPagination');
  pagination.hidden = totalRows <= CART_PAGE_SIZE;
  pagination.setAttribute('aria-label', t('cartPagination'));
  $('#userCartPageSummary').textContent = cartPageSummary(start, end, totalRows);
  $('#userCartPrevious').disabled = state.cartPage === 1;
  $('#userCartNext').disabled = state.cartPage === totalPages;
  $('#userCartPrevious').setAttribute('aria-label', t('previousPage'));
  $('#userCartNext').setAttribute('aria-label', t('nextPage'));
}

function renderCart() {
  const rows = cartRows();
  const totalPages = Math.max(1, Math.ceil(rows.length / CART_PAGE_SIZE));
  state.cartPage = Math.min(state.cartPage, totalPages);
  const pageStart = (state.cartPage - 1) * CART_PAGE_SIZE;
  $('#userCartCount').textContent = formatNumber(rows.length);
  $('#userCartEmpty').hidden = rows.length > 0;
  $('#userCartItems').innerHTML = rows.slice(pageStart, pageStart + CART_PAGE_SIZE).map(item => cartItem(item.material, item.quantity)).join('');
  renderCartPagination(rows.length);
  updateSubmitState(rows);
  renderCatalog();
}

function addMaterial(materialId) {
  const material = state.data.materials.find(item => item.id === materialId);
  if (!material || maximumIssue(material) <= 0 || state.cart.has(materialId)) return;
  state.cart.set(materialId, 0);
  state.pendingOperationId = null;
  state.invalidMaterialIds.delete(materialId);
  state.cartPage = Math.ceil(state.cart.size / CART_PAGE_SIZE);
  renderCart();
}

function showError(message = '') {
  $('#userRequestError').textContent = message;
  $('#userRequestError').hidden = !message;
}

function validateCartQuantities() {
  const rows = cartRows();
  const invalidRows = rows.filter(item => quantityError(item.material, item.quantity));
  state.invalidMaterialIds = new Set(invalidRows.map(item => item.material.id));
  if (!invalidRows.length) return true;
  const firstIndex = rows.findIndex(item => item.material.id === invalidRows[0].material.id);
  state.cartPage = Math.floor(firstIndex / CART_PAGE_SIZE) + 1;
  renderCart();
  showError(t('invalidQuantitySummary'));
  const firstInput = $(`[data-cart-material="${CSS.escape(invalidRows[0].material.id)}"] [data-cart-quantity]`);
  if (firstInput) {
    firstInput.setCustomValidity(quantityError(invalidRows[0].material, invalidRows[0].quantity));
    firstInput.reportValidity();
  }
  return false;
}

async function submitRequest(event) {
  event.preventDefault();
  if (!state.cart.size || state.submitting || !validateCartQuantities()) return;
  showError();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const lines = [...state.cart.entries()].map(([materialId, quantity]) => ({ materialId, quantity: Number(quantity) }));
  const values = Object.fromEntries(new FormData(form));
  try {
    state.submitting = true;
    updateSubmitState();
    $('#userSubmitRequest span').textContent = t('submitting');
    state.pendingOperationId ||= crypto.randomUUID?.() || String(Date.now());
    const result = await request('/api/public/requisitions/create', { method: 'POST', body: JSON.stringify({ ...values, lines, operationId: state.pendingOperationId }) });
    state.pendingOperationId = null;
    $('#userSuccessNumber').textContent = result.requisition.requestNo;
    $('#userSuccessDialog').showModal();
    state.cart.clear();
    state.invalidMaterialIds.clear();
    state.cartPage = 1;
    form.reset();
    setRequestDate(todayWithinFiscalYear());
    state.data = await request('/api/public/state');
    updateSelectOptions();
    renderCart();
  } catch (error) {
    showError(error.message);
  } finally {
    state.submitting = false;
    $('#userSubmitRequest span').textContent = t('submitRequest');
    updateSubmitState();
  }
}

function updateSelectOptions() {
  if (!state.data) return;
  const categoryValue = $('#userMaterialCategory').value;
  const departmentValue = $('#userDepartment').value;
  $('#userMaterialCategory').innerHTML = `<option value="">${t('allCategories')}</option>${state.data.categories.slice().sort((a, b) => a.order - b.order).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(state.language === 'en' ? item.nameEn || item.nameTh : item.nameTh)}</option>`).join('')}`;
  $('#userDepartment').innerHTML = `<option value="">${t('selectDepartment')}</option>${state.data.requisitionDepartments.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(departmentLabels[state.language][item] || item)}</option>`).join('')}`;
  $('#userMaterialCategory').value = categoryValue;
  $('#userDepartment').value = departmentValue;
  $('#userMaterialCategory').setAttribute('aria-label', t('categoryLabel'));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('material-theme', theme);
  $('#userThemeButton').setAttribute('aria-checked', String(theme === 'dark'));
  $('#userThemeButton').setAttribute('aria-label', theme === 'dark' ? t('lightMode') : t('darkMode'));
}

function applyLanguage(language) {
  state.language = language === 'en' ? 'en' : 'th';
  const dateDisplay = $('#userRequestDateDisplay');
  dateDisplay.dataset.dateLanguage = state.language;
  dateDisplay.placeholder = state.language === 'th' ? 'วัน เดือน ปี พ.ศ.' : 'Day Month Year';
  dateDisplay.value = $('#userRequestDate').value ? displayDate($('#userRequestDate').value, state.language) : '';
  document.documentElement.lang = state.language;
  document.title = t('documentTitle');
  localStorage.setItem('material-language', state.language);
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(element => { element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel)); });
  $('#userLanguageSwitch').setAttribute('aria-label', t('languageLabel'));
  $('#userRefreshButton').setAttribute('aria-label', t('refreshData'));
  $('#userRefreshButton').title = t('refreshData');
  document.querySelectorAll('[data-language]').forEach(button => {
    const active = button.dataset.language === state.language;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  applyTheme(document.documentElement.dataset.theme || 'light');
  if (state.data) {
    $('#userFiscalYear').textContent = fiscalYearLabel(state.data.activeFiscalYear);
    updateSelectOptions();
    renderCart();
  }
}

async function refreshUserData() {
  const button = $('#userRefreshButton');
  if (button.disabled) return;
  button.disabled = true;
  button.classList.add('is-refreshing');
  button.setAttribute('aria-busy', 'true');
  $('#userRefreshStatus').textContent = '';
  try {
    const nextData = await request('/api/public/state', { cache: 'no-store' });
    state.data = nextData;
    const validIds = new Set(nextData.materials.map(item => item.id));
    state.cart = new Map([...state.cart].filter(([id]) => validIds.has(id)));
    state.invalidMaterialIds = new Set(cartRows().filter(item => quantityError(item.material, item.quantity)).map(item => item.material.id));
    $('#userFiscalYear').textContent = fiscalYearLabel(nextData.activeFiscalYear);
    updateSelectOptions();
    state.categoryId = $('#userMaterialCategory').value;
    $('#userRequestDate').min = nextData.fiscalYear.startDate;
    $('#userRequestDate').max = nextData.fiscalYear.endDate;
    const selectedDate = $('#userRequestDate').value;
    if (!selectedDate || selectedDate < nextData.fiscalYear.startDate || selectedDate > nextData.fiscalYear.endDate) setRequestDate(todayWithinFiscalYear());
    showError();
    renderCart();
    $('#userRefreshStatus').textContent = t('refreshed');
  } catch (error) {
    showError(error.message);
    $('#userRefreshStatus').textContent = error.message;
  } finally {
    button.disabled = false;
    button.classList.remove('is-refreshing');
    button.removeAttribute('aria-busy');
  }
}
window.materialUserRefreshData = refreshUserData;

function bind() {
  $('#userRefreshButton').addEventListener('click', refreshUserData);
  $('#userMaterialSearch').addEventListener('input', event => { state.search = event.target.value; state.page = 1; renderCatalog(); });
  $('#userMaterialCategory').addEventListener('change', event => { state.categoryId = event.target.value; state.page = 1; renderCatalog(); });
  $('#userPageControls').addEventListener('click', event => {
    const button = event.target.closest('[data-user-page]');
    if (!button || button.disabled) return;
    const totalPages = Math.max(1, Math.ceil(filteredMaterials().length / PAGE_SIZE));
    state.page = button.dataset.userPage === 'previous' ? Math.max(1, state.page - 1) : button.dataset.userPage === 'next' ? Math.min(totalPages, state.page + 1) : Number(button.dataset.userPage);
    renderCatalog();
    $('#materialCatalogTitle').scrollIntoView({ block: 'start' });
  });
  $('#userCartPrevious').addEventListener('click', () => { state.cartPage = Math.max(1, state.cartPage - 1); renderCart(); });
  $('#userCartNext').addEventListener('click', () => { state.cartPage = Math.min(Math.ceil(state.cart.size / CART_PAGE_SIZE), state.cartPage + 1); renderCart(); });
  $('#userRequestForm').addEventListener('submit', submitRequest);
  $('#userRequestForm').addEventListener('change', () => { state.pendingOperationId = null; });
  $('#userCartItems').addEventListener('input', event => {
    if (!event.target.matches('[data-cart-quantity]')) return;
    const row = event.target.closest('[data-cart-material]');
    const id = row.dataset.cartMaterial;
    state.cart.set(id, event.target.value);
    state.pendingOperationId = null;
    state.invalidMaterialIds.delete(id);
    event.target.setCustomValidity('');
    event.target.setAttribute('aria-invalid', 'false');
    row.classList.remove('has-quantity-error');
    row.querySelector('.user-cart-validation')?.remove();
    showError();
    updateSubmitState();
  });
  document.addEventListener('click', event => {
    const add = event.target.closest('[data-add-material]');
    const remove = event.target.closest('[data-remove-material]');
    const language = event.target.closest('[data-language]');
    if (add) addMaterial(add.dataset.addMaterial);
    if (remove) {
      state.cart.delete(remove.dataset.removeMaterial);
      state.pendingOperationId = null;
      state.invalidMaterialIds.delete(remove.dataset.removeMaterial);
      renderCart();
    }
    if (language) applyLanguage(language.dataset.language);
  });
  $('#userThemeButton').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#userSuccessClose').addEventListener('click', () => $('#userSuccessDialog').close());
}

async function init() {
  bindLocalSessionActivity();
  bindDateFields($('#userRequestForm'));
  applyLanguage(localStorage.getItem('material-language') || 'th');
  applyTheme(localStorage.getItem('material-theme') || 'light');
  bind();
  $('#userLoading').classList.add('show');
  try {
    state.data = await request('/api/public/state');
    $('#userFiscalYear').textContent = fiscalYearLabel(state.data.activeFiscalYear);
    updateSelectOptions();
    $('#userRequestDate').max = state.data.fiscalYear.endDate;
    setRequestDate(todayWithinFiscalYear());
    renderCart();
  } catch (error) {
    $('#userMaterialGrid').innerHTML = `<div class="user-catalog-empty"><strong>${t('loadFailed')}</strong><span>${escapeHtml(error.message)}</span></div>`;
    showError(error.message);
  } finally {
    $('#userLoading').classList.remove('show');
    window.materialUserInitialized = true;
  }
}

if (window.materialUserWaitForAccess) {
  if (window.materialUserUnlocked) init();
  else window.addEventListener('material-user-unlocked', init, { once: true });
} else init();
