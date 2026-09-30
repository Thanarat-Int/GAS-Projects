import { imageMarkup, isLowStock } from './material-images.js';
import { displayDate } from './dates.js';
import { inkData as sourceInkData } from './ink-data.js';
import { bindInkEntry } from './ink-entry.js';

let inkData = sourceInkData;

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = value => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const qty = value => new Intl.NumberFormat('th-TH').format(value);
const state = { tab: 'purchases', query: '', year: '', department: '' };
const $ = selector => document.querySelector(selector);
const collapseStorageKey = 'material-center.ink.collapsed-groups.v1';
const collapsedGroups = new Set();
const pages = new Map();
const chevronIcon = direction => `<svg class="pagination-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="${direction === 'left' ? 'm12 5-5 5 5 5' : 'm8 5 5 5-5 5'}"/></svg>`;
export function inkPage(rows, requested = 1, size = 10) {
  const count = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(count, Math.max(1, Number(requested) || 1));
  return { page, count, total: rows.length, items: rows.slice((page - 1) * size, page * size) };
}
export function newestInkGroups(groups) {
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const dateKey = group => {
    if (group.date) return group.date;
    const match = /ซื้อวันที่ (\d+) (\S+) (\d{4})/.exec(group.title || '');
    return match && months.includes(match[2]) ? `${Number(match[3]) - 543}-${String(months.indexOf(match[2]) + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
  };
  return groups.map((group, index) => ({ group, index })).sort((a, b) => b.group.year - a.group.year || dateKey(b.group).localeCompare(dateKey(a.group)) || b.index - a.index).map(item => item.group);
}
function pagination(key, total, size = 10, unit = 'รายการ') {
  const { page, count } = inkPage(Array(total), pages.get(key), size);
  pages.set(key, page);
  const visible = [...new Set([1, page - 1, page, page + 1, count].filter(value => value >= 1 && value <= count))];
  const button = (value, label, disabled = false, ariaLabel = '') => `<button type="button" class="page-button ${value === page ? 'active' : ''}" data-ink-page="${value}" data-ink-page-key="${escape(key)}" ${disabled ? 'disabled' : ''} ${ariaLabel ? `aria-label="${ariaLabel}"` : ''} ${value === page ? 'aria-current="page"' : ''}>${label}</button>`;
  return `<nav class="pagination" aria-label="แบ่งหน้า${unit}"><span>${total ? `${(page - 1) * size + 1}–${Math.min(page * size, total)}` : '0'} / ${total} ${unit} (${size} ${unit}/หน้า)</span><span class="page-buttons">${button(page - 1, chevronIcon('left'), page === 1, 'หน้าก่อนหน้า')}${visible.map((value, index) => `${index && value > visible[index - 1] + 1 ? '<span>…</span>' : ''}${button(value, value)}`).join('')}${button(page + 1, chevronIcon('right'), page === count, 'หน้าถัดไป')}</span></nav>`;
}
let entry;

function purchaseNoteSections() {
  if (Array.isArray(inkData.purchaseNoteSections)) return inkData.purchaseNoteSections;
  return inkData.purchaseNotes?.length ? [{
    id: 'INK-NOTE-0001',
    title: inkData.purchaseNotes[0],
    reasons: inkData.purchaseNotes.slice(1).map(item => String(item).replace(/^\s*\d+\.\s*/, '').trim()),
  }] : [];
}

function purchaseNotesMarkup() {
  const sections = purchaseNoteSections();
  const canManageNotes = inkData.canManage && Array.isArray(inkData.purchaseNoteSections);
  if (!sections.length && !inkData.canManage) return '';
  return `<section class="ink-notes-area" aria-label="เหตุผลที่ปริมาณซื้อหมึกเพิ่ม">
    ${canManageNotes ? '<div class="ink-notes-actions"><button type="button" class="secondary-button" data-ink-notes-manage><svg class="button-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 14.5-.5 2 2-.5L15.7 5.8a1.5 1.5 0 0 0 0-2.1l-.4-.4a1.5 1.5 0 0 0-2.1 0Z"/><path d="m11.8 4.7 3.5 3.5"/></svg><span>จัดการหัวข้อ</span></button></div>' : ''}
    ${sections.map((section, index) => `<details class="panel ink-notes"${index === 0 ? ' open' : ''}><summary>${escape(section.title)}</summary><ol>${section.reasons.map(reason => `<li>${escape(reason)}</li>`).join('')}</ol></details>`).join('')}
  </section>`;
}

function bindPurchaseNotesEditor() {
  const dialog = $('#inkNotesDialog');
  const container = $('#inkNotesSections');
  let operationId = '';
  let busy = false;
  const setError = message => { $('#inkNotesError').textContent = message; $('#inkNotesError').hidden = !message; };
  const addSection = (section = {}) => {
    if (container.children.length >= 20) return setError('เพิ่มได้ไม่เกิน 20 หัวข้อ');
    const item = document.createElement('section');
    item.className = 'ink-notes-editor-item';
    item.dataset.noteId = section.id || '';
    item.innerHTML = `<div class="ink-notes-editor-head"><strong>หัวข้อที่ ${container.children.length + 1}</strong><button type="button" class="icon-button ink-notes-remove" aria-label="ลบหัวข้อนี้"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div><div class="field"><label>ชื่อหัวข้อ<input class="ink-note-title" type="text" maxlength="160" required value="${escape(section.title || '')}"></label></div><div class="field"><label>เหตุผล <span class="field-hint">หนึ่งบรรทัดต่อหนึ่งเหตุผล</span><textarea class="ink-note-reasons" maxlength="20000" required>${escape((section.reasons || []).join('\n'))}</textarea></label></div>`;
    item.querySelector('.ink-notes-remove').addEventListener('click', () => {
      if (!window.confirm('ยืนยันลบหัวข้อนี้หรือไม่')) return;
      item.remove();
      [...container.children].forEach((node, index) => { node.querySelector('.ink-notes-editor-head strong').textContent = `หัวข้อที่ ${index + 1}`; });
    });
    container.append(item);
    setError('');
  };
  const close = () => { if (!busy) dialog.close(); };
  const open = () => {
    if (!inkData.canManage || dialog.open) return;
    operationId = crypto.randomUUID();
    container.innerHTML = '';
    purchaseNoteSections().forEach(addSection);
    setError('');
    dialog.showModal();
  };
  $('#inkNotesAdd').addEventListener('click', () => { addSection(); container.lastElementChild?.querySelector('.ink-note-title')?.focus(); });
  $('#inkNotesClose').addEventListener('click', close);
  $('#inkNotesCancel').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('#inkNotesForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const sections = [...container.children].map(item => ({
      ...(item.dataset.noteId ? { id: item.dataset.noteId } : {}),
      title: item.querySelector('.ink-note-title').value.trim(),
      reasons: item.querySelector('.ink-note-reasons').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
    }));
    const invalid = sections.find(section => !section.title || !section.reasons.length || section.reasons.length > 20);
    if (invalid) return setError('กรุณาระบุชื่อหัวข้อและเหตุผล 1–20 รายการ โดยแยกเหตุผลคนละบรรทัด');
    busy = true;
    $('#inkNotesSubmit').disabled = true;
    dialog.querySelector('.dialog-body').inert = true;
    setError('');
    try {
      const response = await fetch('/api/ink/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId, revision: inkData.revision, sections }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || 'บันทึกไม่สำเร็จ');
      inkData = result.data.state;
      refreshOptions();
      renderInk();
      dialog.close();
      $('#inkFeedback').textContent = 'บันทึกหัวข้อและเหตุผลเรียบร้อยแล้ว';
      $('#inkFeedback').hidden = false;
    } catch (error) { setError(error.message); }
    finally { busy = false; $('#inkNotesSubmit').disabled = false; dialog.querySelector('.dialog-body').inert = false; }
  });
  return { open };
}

export function inkGroupKey(group) {
  return `${group.year}:${group.id}`;
}

export function inkFiscalYears(data = inkData) {
  return [...new Set([...data.groups, ...data.withdrawals].map(row => row.year))].sort((a, b) => a - b);
}

export function inkYearRange() {
  const years = inkFiscalYears();
  return years.length > 1 ? `${years[0]}-${years.at(-1)}` : String(years[0] ?? '');
}

export function setInkData(nextData) {
  if (!nextData) return;
  inkData = nextData;
  refreshOptions();
}

export function filterInkRows(rows, { query = '', year = '', department = '' } = {}) {
  const term = query.trim().toLocaleLowerCase();
  return rows.filter(row => (!year || row.year === Number(year))
    && (!department || row.cells[1] === department)
    && (!term || row.cells.join(' ').toLocaleLowerCase().includes(term)));
}

export function inkTotalFooter(columnCount, label, total, alignToPrice = false, actions = false) {
  if (!label) return '';
  const labelCells = alignToPrice
    ? `<td colspan="${columnCount - 2}"></td><th scope="row">${escape(label)}</th>`
    : `<th colspan="${columnCount - 1}" scope="row">${escape(label)}</th>`;
  return `<tfoot><tr>${labelCells}<td>${money(total)}</td>${actions ? '<td></td>' : ''}</tr></tfoot>`;
}

function table(columns, rows, totalLabel, total, withdrawal = false, alignToPrice = true, key = state.tab) {
  const actions = inkData.canManage === true;
  const page = inkPage(rows, pages.get(key));
  pages.set(key, page.page);
  const body = page.items.map(row => `<tr>${row.cells.map((value, i) => {
    const nameColumn = withdrawal ? 2 : 1;
    const normalizedName = String(row.cells[nameColumn]).toLocaleLowerCase().replace(/\s/g, '');
    const product = inkData.products?.find(item => item.id === row.productId || item.name.toLocaleLowerCase().replace(/\s/g, '') === normalizedName);
    const display = withdrawal && i === 0 && row.dateISO ? displayDate(row.dateISO) : value == null ? '—' : typeof value === 'number' ? (!withdrawal && i >= 3 ? money(value) : qty(value)) : escape(value);
    const low = state.tab === 'stock' && i === 2 && isLowStock(value);
    return `<td class="${i === nameColumn ? 'ink-item-name' : ''} ${low ? 'stock-low' : ''}">${i === nameColumn ? imageMarkup(row.imageUrl || product?.imageUrl, 'ink', row.cells[nameColumn]) : ''}${display}</td>`;
  }).join('')}${actions ? `<td><div class="ink-row-actions"><button class="secondary-button" data-ink-edit="${escape(row.editKey)}" type="button">แก้ไข</button><button class="secondary-button ink-delete" data-ink-delete="${escape(row.editKey)}" type="button">ลบ</button></div></td>` : ''}</tr>`).join('');
  return `<div class="table-wrap"><table class="ink-table"><thead><tr>${columns.map(column => `<th scope="col">${escape(column)}</th>`).join('')}${actions ? '<th scope="col">จัดการ</th>' : ''}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length + Number(actions)}" class="empty-cell">ไม่พบรายการ</td></tr>`}</tbody>${inkTotalFooter(columns.length, totalLabel, total, alignToPrice, actions)}</table></div>${pagination(key, rows.length)}`;
}

export function renderInk() {
  if (!$('#inkContent')) return;
  const isStock = state.tab === 'stock';
  const isWithdrawal = state.tab === 'withdrawals';
  $('#inkAddPurchase').hidden = state.tab !== 'purchases' || !inkData.canManage;
  $('#inkAddWithdrawal').hidden = !isWithdrawal || !inkData.canManage;
  if (!$('#view-ink').hidden) $('#pageTitle').textContent = `สรุปการซื้อหมึกของปีงบ ${inkYearRange()}`;
  $('#inkYearLabel').hidden = isStock;
  $('#inkDepartmentLabel').hidden = !isWithdrawal;
  document.querySelectorAll('[data-ink-tab]').forEach(button => {
    const active = button.dataset.inkTab === state.tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const criteria = { query: state.query, year: state.year, department: isWithdrawal ? state.department : '' };
  let html = '';
  if (state.tab === 'purchases') {
    const groups = newestInkGroups(inkData.groups).filter(group => (!state.year || group.year === Number(state.year)) && (!state.query || filterInkRows(group.rows, { query: state.query }).length));
    const groupPage = inkPage(groups, pages.get('groups'), 5);
    pages.set('groups', groupPage.page);
    html = groupPage.items.map(group => {
      const rows = filterInkRows(group.rows, { query: state.query });
      if (!rows.length && state.query) return '';
      const key = inkGroupKey(group);
      return `<details class="panel ink-panel ink-purchase-group" data-ink-group="${escape(key)}"${collapsedGroups.has(key) ? '' : ' open'}><summary class="panel-head ink-group-toggle"><h2>${escape(group.title)}</h2><span class="ink-group-meta"><span class="result-count">${rows.length} รายการ</span><svg class="ink-chevron" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></span></summary><p class="ink-source-note">${escape(group.note)}</p>${table(inkData.purchaseColumns, rows, state.query ? 'รวมผลการค้นหา' : 'รวมทั้งสิ้น', rows.reduce((sum, row) => sum + row.cells[4], 0), false, true, key)}</details>`;
    }).join('');
    if (!html) html = '<p class="ink-empty">ไม่พบรายการ</p>';
    html += pagination('groups', groups.length, 5, 'รอบซื้อ');
    html += purchaseNotesMarkup();
  } else if (isWithdrawal) {
    const rows = filterInkRows(inkData.withdrawals, criteria).sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''));
    html = `<article class="panel ink-panel"><div class="panel-head"><h2>${escape(inkData.withdrawalTitle)}</h2><span class="result-count">${rows.length} รายการ</span></div>${table(inkData.withdrawalColumns, rows, '', 0, true)}</article>`;
  } else {
    const rows = filterInkRows(inkData.balances, { query: state.query });
    html = `<article class="panel ink-panel"><div class="panel-head"><h2>${escape(inkData.stockTitle)}</h2><span class="result-count">${rows.length} รายการ</span></div><p class="ink-source-note">ยอดคงเหลือปัจจุบัน รวมรายการซื้อและเบิกที่บันทึกในระบบ</p>${table(inkData.stockColumns, rows, state.query ? 'มูลค่ารายการที่แสดง' : inkData.stockTotalLabel, rows.reduce((sum, row) => sum + row.cells[4], 0), false, true)}</article>`;
  }
  $('#inkContent').innerHTML = html;
  document.querySelectorAll('[data-ink-group]').forEach(group => {
    group.addEventListener('toggle', () => {
      if (!group.isConnected) return;
      const key = group.dataset.inkGroup;
      if (group.open) collapsedGroups.delete(key);
      else collapsedGroups.add(key);
      try { localStorage.setItem(collapseStorageKey, JSON.stringify([...collapsedGroups])); } catch { /* UI still works when storage is unavailable. */ }
    });
  });
}

function refreshOptions() {
  $('#inkYear').innerHTML = '<option value="">ทุกปีงบประมาณ</option>' + inkFiscalYears().reverse().map(year => `<option value="${year}">${year}</option>`).join('');
  $('#inkYear').value = state.year;
  $('#inkDepartment').innerHTML = '<option value="">ทุกฝ่าย</option>' + [...new Set(inkData.withdrawals.map(row => row.cells[1]))].map(department => `<option value="${escape(department)}">${escape(department)}</option>`).join('');
  $('#inkDepartment').value = state.department;
}

async function loadInk() {
  const response = await fetch('/api/ink/state', { cache: 'no-store' });
  if (!response.ok) throw new Error('โหลดข้อมูลหมึกไม่สำเร็จ กรุณาตรวจว่าเซิร์ฟเวอร์เวอร์ชันใหม่เปิดอยู่');
  const result = await response.json();
  if (!result.ok) throw new Error(result.message);
  inkData = result.data;
  refreshOptions();
  renderInk();
  return inkData;
}

export function bindInk() {
  try {
    const saved = JSON.parse(localStorage.getItem(collapseStorageKey) || '[]');
    if (Array.isArray(saved)) saved.filter(key => typeof key === 'string').forEach(key => collapsedGroups.add(key));
  } catch { /* Ignore invalid or unavailable preferences. */ }
  refreshOptions();
  entry = bindInkEntry({ load: loadInk, saved: result => {
    inkData = result.state;
    if (!result.id.includes(':')) state.tab = result.id.startsWith('INK-PUR-') ? 'purchases' : result.id.startsWith('INK-ISS-') ? 'withdrawals' : 'stock';
    state.year = ''; state.department = ''; state.query = '';
    pages.clear();
    $('#inkSearch').value = '';
    refreshOptions(); renderInk();
  } });
  const notesEditor = bindPurchaseNotesEditor();
  $('#inkContent').addEventListener('click', event => {
    if (event.target.closest('[data-ink-notes-manage]')) { notesEditor.open(); return; }
    const pageButton = event.target.closest('[data-ink-page]');
    if (pageButton) {
      const key = pageButton.dataset.inkPageKey;
      pages.set(key, Number(pageButton.dataset.inkPage));
      renderInk();
      const target = key === 'groups' ? $('#inkContent') : [...document.querySelectorAll('[data-ink-group]')].find(group => group.dataset.inkGroup === key) || $('#inkContent');
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    const button = event.target.closest('[data-ink-edit], [data-ink-delete]');
    if (button) entry.edit(button.dataset.inkEdit || button.dataset.inkDelete, Boolean(button.dataset.inkDelete));
  });
  document.querySelectorAll('[data-ink-tab]').forEach(button => button.addEventListener('click', () => { state.tab = button.dataset.inkTab; renderInk(); }));
  for (const [id, key, event] of [['inkSearch', 'query', 'input'], ['inkYear', 'year', 'change'], ['inkDepartment', 'department', 'change']]) {
    $(`#${id}`).addEventListener(event, e => { state[key] = e.target.value; pages.clear(); renderInk(); });
  }
}
