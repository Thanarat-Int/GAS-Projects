import { imageField, bindImageField, imagePayload, isLowStock } from './material-images.js';
import { dateField, bindDateFields } from './dates.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const currency = value => Number(value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const field = (name, label, type, value = '', extra = '') => type === 'date' ? dateField(name, label, value, extra) : `<div class="field"><label for="ink-${name}">${label}</label><input id="ink-${name}" name="${name}" type="${type}" value="${escape(value)}" ${extra}></div>`;

export function bindInkEntry({ load, saved }) {
  let data, mode, operationId, busy = false, pendingPayload = null, editKey = null, deleting = false;
  const feedback = message => { $('#inkFeedback').textContent = message; $('#inkFeedback').hidden = !message; };
  async function reload() {
    data = await load();
    feedback('');
    return data;
  }
  function calculate() {
    let total = 0;
    document.querySelectorAll('.ink-entry-row').forEach(row => {
      const product = data.products.find(item => item.id === row.querySelector('[name="productId"]').value);
      const count = Number(row.querySelector('[name="quantity"]').value || 0);
      row.querySelector('.ink-line-stock').textContent = `คงเหลือ ${product?.onHand ?? '—'}`;
      row.querySelector('.ink-line-stock').classList.toggle('stock-low', Boolean(product) && isLowStock(product.onHand));
      if (mode === 'purchases') {
        const value = Math.round(count * Number(row.querySelector('[name="unitPrice"]').value || 0) * 100) / 100;
        row.querySelector('output').textContent = currency(value);
        total += value;
      }
    });
    if ($('#inkDocumentTotal')) $('#inkDocumentTotal').textContent = currency(total);
    if ($('#ink-scalarTotal')) $('#ink-scalarTotal').value = currency(Number($('#ink-quantity').value || 0) * Number($('#ink-unitPrice').value || 0));
    if ($('#ink-date')) {
      const [year, month] = $('#ink-date').value.split('-').map(Number);
      if ($('#ink-fiscal')) $('#ink-fiscal').value = year ? year + 543 + (month >= 10 ? 1 : 0) : '';
    }
  }
  function addLine(existing = null) {
    if (document.querySelectorAll('.ink-entry-row').length >= 100) return;
    const row = document.createElement('div');
    row.className = 'ink-entry-row';
    row.innerHTML = `<div class="field ink-line-product"><label>รายการ<select name="productId" required aria-label="รายการหมึก"><option value="">เลือกรายการหมึก</option>${data.products.map(item => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join('')}</select></label><small class="ink-line-stock">คงเหลือ —</small></div><div class="field"><label>${mode === 'purchases' ? 'จำนวน' : 'จำนวนเบิก'}<input aria-label="จำนวน" name="quantity" type="number" required min="1" max="1000000" step="1" value="1"></label></div>${mode === 'purchases' ? '<div class="field"><label>ราคาต่อหน่วย<input aria-label="ราคาต่อหน่วย" name="unitPrice" type="number" required min="0" max="10000000" step="0.01" value="0"></label></div><div class="field"><label>ราคารวม</label><output>0.00</output></div>' : ''}<button type="button" class="icon-button ink-remove-line" aria-label="ลบรายการนี้"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button>`;
    if (mode === 'purchases') {
      row.querySelector('[name="productId"]').insertAdjacentHTML('afterbegin', '<option value="__new__">＋ เพิ่มรุ่นหมึกใหม่</option>');
      row.querySelector('[name="productId"]').value = '';
      row.querySelector('.ink-line-product').insertAdjacentHTML('beforeend', '<label class="ink-new-product" hidden>ชื่อรุ่นหมึกใหม่<input name="newProductName" aria-label="ชื่อรุ่นหมึกใหม่" maxlength="300" placeholder="เช่น Brother TN-451 สีดำ" disabled></label>');
    }
    row.querySelector('.ink-remove-line').addEventListener('click', () => { row.remove(); calculate(); });
    row.querySelector('[name="productId"]').addEventListener('change', e => {
      const item = data.products.find(product => product.id === e.target.value);
      const newName = row.querySelector('[name="newProductName"]');
      if (newName) {
        const isNew = e.target.value === '__new__';
        newName.closest('label').hidden = !isNew;
        newName.disabled = !isNew;
        newName.required = isNew;
        row.querySelector('.ink-line-stock').hidden = isNew;
        if (isNew) newName.focus();
      }
      if (mode === 'purchases') row.querySelector('[name="unitPrice"]').value = item?.unitPrice ?? 0;
      calculate();
    });
    $('#inkEntryLines').append(row);
    if (existing?.productId) {
      row.querySelector('[name="productId"]').value = existing.productId;
      row.querySelector('[name="quantity"]').value = existing.quantity;
      if (mode === 'purchases') row.querySelector('[name="unitPrice"]').value = existing.unitPrice;
    }
    calculate();
  }
  async function open(kind, key = null, remove = false) {
    if (busy || $('#inkEntryDialog').open) return;
    busy = true;
    try {
      await reload();
      if (!data.canManage) throw new Error('เฉพาะผู้ดูแลระบบเท่านั้น');
      mode = kind; operationId = crypto.randomUUID(); pendingPayload = null;
      editKey = key; deleting = remove;
      const transaction = key?.startsWith('transaction:') ? data.transactions.find(item => `transaction:${item.id}` === key) : null;
      if (transaction) mode = transaction.type === 'PURCHASE' ? 'purchases' : 'withdrawals';
      const sourceRow = key?.startsWith('source-') ? [...data.groups.flatMap(group => group.rows), ...data.withdrawals].find(row => row.editKey === key) : null;
      const product = key?.startsWith('stock:') ? data.products.find(item => `stock:${item.id}` === key) : null;
      if (key && !transaction && !sourceRow && !product) throw new Error('รายการนี้ถูกเปลี่ยนแปลงแล้ว กรุณาเลือกจากตารางอีกครั้ง');
      if (sourceRow) mode = key.startsWith('source-purchase:') ? 'source-purchase' : 'source-withdrawal';
      if (product) mode = 'stock';
      $('#inkEntryBody').inert = false;
      $('#inkEntryDialog').classList.toggle('ink-confirm-dialog', remove);
      $('#inkEntryError').hidden = true;
      $('#inkEntryTitle').textContent = { purchases: 'บันทึกซื้อเข้า', withdrawals: 'บันทึกเบิกหมึก' }[mode];
      $('#inkEntrySubmit').textContent = 'บันทึก';
      if (key) $('#inkEntryTitle').textContent = `${remove ? 'ลบ' : 'แก้ไข'}${transaction ? 'เอกสาร (ทุกรายการในเอกสารเดียวกัน)' : product ? 'หมึกคงเหลือ' : 'รายการย้อนหลัง'}`;
      if (remove) $('#inkEntrySubmit').textContent = 'ยืนยันลบ';
      $('#inkEntryBody').innerHTML = remove
        ? `<p>${escape(transaction?.id || product?.name || sourceRow?.cells[mode === 'source-purchase' ? 1 : 2])}</p><p>ลบออกจากรายการใช้งาน โดยเก็บประวัติไว้ตรวจสอบ${transaction ? ' และคำนวณสต็อกใหม่ทั้งเอกสาร' : ''}</p>`
        : product || sourceRow
        ? `<div class="form-grid">${field('name', 'รายการ', 'text', product?.name || sourceRow.cells[mode === 'source-purchase' ? 1 : 2], 'required maxlength="300"')}${field('quantity', mode === 'source-withdrawal' ? 'จำนวนเบิก' : 'จำนวน', 'number', product?.onHand ?? sourceRow.cells[mode === 'source-purchase' ? 2 : 3], 'required min="0" max="1000000" step="1"')}${mode !== 'source-withdrawal' ? field('unitPrice', 'ราคาต่อหน่วย', 'number', product?.unitPrice ?? sourceRow.cells[3], 'required min="0" max="10000000" step="0.01"') + field('scalarTotal', 'ราคารวม', 'text', '', 'readonly') : field('date', 'วันที่', 'date', sourceRow.dateISO, 'required') + field('department', 'ฝ่าย', 'text', sourceRow.cells[1], 'required maxlength="100"')}</div>${product ? '<p class="ink-source-note">ปรับยอดตามของจริง ระบบจะบันทึกผลต่างเป็นประวัติปรับปรุงสต็อก</p>' : '<p class="ink-source-note">แก้ไขประวัติเท่านั้น ไม่เปลี่ยนยอดคงเหลือ หากต้องการปรับยอดให้แก้ไขในหน้าคงเหลือ</p>'}`
        : `<div class="form-grid">${field('date', 'วันที่', 'date', today(), `required max="${today()}"`)}${field('fiscal', 'ปีงบประมาณ', 'text', '', 'readonly')}${mode === 'withdrawals' ? field('department', 'ฝ่าย', 'text', '', 'required maxlength="100" list="inkDepartments"') : ''}<datalist id="inkDepartments">${[...new Set(data.withdrawals.map(row => row.cells[1]))].map(item => `<option value="${escape(item)}"></option>`).join('')}</datalist></div><div id="inkEntryLines"></div><button class="secondary-button" id="inkEntryAddLine" type="button"><svg class="button-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg><span>เพิ่มรายการ</span></button>${mode === 'purchases' ? '<div class="ink-document-total">รวมทั้งสิ้น <strong id="inkDocumentTotal">0.00</strong></div>' : ''}<div class="field"><label for="ink-note">หมายเหตุ</label><textarea id="ink-note" name="note" maxlength="1000"></textarea></div>${!data.baselineDate ? `<div class="ink-baseline">${field('baselineDate', 'วันที่ยืนยันยอดตั้งต้น', 'date', today(), `required max="${today()}"`)}<label><input type="checkbox" name="confirmBaseline" required> ยืนยันยอดตั้งต้นตรงกับจำนวนที่ตรวจนับ และยังไม่รวมรายการที่กำลังบันทึก</label></div>` : ''}`;
      if (key && !remove) $('#inkEntryBody').insertAdjacentHTML('beforeend', '<div class="field"><label for="ink-reason">เหตุผลการแก้ไข</label><textarea id="ink-reason" name="reason" required maxlength="1000"></textarea></div>');
      if ($('#inkEntryAddLine')) {
        $('#inkEntryAddLine').addEventListener('click', () => addLine());
        if (transaction) {
          $('#ink-date').value = transaction.date;
          if ($('#ink-department')) $('#ink-department').value = transaction.department;
          $('#ink-note').value = transaction.note;
          transaction.lines.forEach(addLine);
        } else addLine();
      }
      if (!remove && (product || sourceRow)) $('#inkEntryBody').insertAdjacentHTML('afterbegin', imageField(product?.imageUrl || sourceRow?.imageUrl, 'ink'));
      bindImageField($('#inkEntryBody'));
      bindDateFields($('#inkEntryBody'));
      calculate();
      $('#inkEntryDialog').showModal();
    } catch (error) { feedback(error.message); } finally { busy = false; }
  }
  $('#inkEntryForm').addEventListener('input', calculate);
  const close = () => { if (!busy && !pendingPayload) $('#inkEntryDialog').close(); };
  $('#inkEntryClose').addEventListener('click', close);
  $('#inkEntryCancel').addEventListener('click', close);
  $('#inkEntryDialog').addEventListener('cancel', event => { if (busy || pendingPayload) event.preventDefault(); });
  window.addEventListener('beforeunload', event => { if (busy || pendingPayload) { event.preventDefault(); event.returnValue = ''; } });
  $('#inkEntryForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const lines = [...document.querySelectorAll('.ink-entry-row')].map(row => ({ ...(row.querySelector('[name="productId"]').value === '__new__' ? { newProductName: row.querySelector('[name="newProductName"]').value.trim() } : { productId: row.querySelector('[name="productId"]').value }), quantity: Number(row.querySelector('[name="quantity"]').value), ...(mode === 'purchases' ? { unitPrice: Number(row.querySelector('[name="unitPrice"]').value) } : {}) }));
    if (!deleting && ['purchases', 'withdrawals'].includes(mode) && !lines.length) { $('#inkEntryError').textContent = 'กรุณาเพิ่มอย่างน้อย 1 รายการ'; $('#inkEntryError').hidden = false; return; }
    let picture = {};
    if (!pendingPayload) {
      busy = true;
      $('#inkEntrySubmit').disabled = true;
      try { picture = await imagePayload($('#inkEntryBody')); }
      catch (error) { $('#inkEntryError').textContent = error.message; $('#inkEntryError').hidden = false; return; }
      finally { busy = false; $('#inkEntrySubmit').disabled = false; }
    }
    // Retain the exact payload after an uncertain network result; retry cannot post a second receipt.
    pendingPayload ??= { ...picture, operationId, revision: data.revision, ...(editKey ? { key: editKey, action: deleting ? 'DELETE' : 'UPDATE', reason: form.get('reason') } : {}), ...(mode === 'products' ? { name: form.get('name') } : ['stock', 'source-purchase', 'source-withdrawal'].includes(mode) ? { name: form.get('name'), quantity: Number(form.get('quantity')), unitPrice: Number(form.get('unitPrice')), date: form.get('date'), department: form.get('department') } : { date: form.get('date'), department: form.get('department'), note: form.get('note'), baselineDate: form.get('baselineDate'), confirmBaseline: form.get('confirmBaseline') === 'on', lines }) };
    busy = true; $('#inkEntrySubmit').disabled = true; $('#inkEntryError').hidden = true;
    $('#inkEntryBody').inert = true;
    try {
      const response = await fetch(`/api/ink/${editKey ? 'changes' : mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingPayload) });
      const result = await response.json();
      if (!response.ok || !result.ok) { if (response.status < 500) pendingPayload = null; throw new Error(result.message || 'บันทึกไม่สำเร็จ'); }
      saved(result.data); data = result.data.state;
      pendingPayload = null;
      $('#inkEntryDialog').close();
      feedback(`บันทึกสำเร็จ ${result.data.id}`);
    } catch (error) {
      $('#inkEntryError').textContent = pendingPayload ? 'ยังยืนยันผลบันทึกไม่ได้ กดบันทึกอีกครั้งเพื่อส่งคำขอเดิม ห้ามสร้างรายการซ้ำ' : error.message;
      $('#inkEntryError').hidden = false;
    } finally { busy = false; $('#inkEntrySubmit').disabled = false; $('#inkEntryBody').inert = Boolean(pendingPayload); }
  });
  $('#inkAddPurchase').addEventListener('click', () => open('purchases'));
  $('#inkAddWithdrawal').addEventListener('click', () => open('withdrawals'));
  reload().catch(error => feedback(error.message));
  return { edit: (key, remove) => open(null, key, remove) };
}
