/**
 * Smart Bill Dashboard — Web App API
 * ─────────────────────────────────────────────────────────────
 * วางไฟล์นี้ใน Apps Script ของ Sheet เดียวกับ setup.gs
 *
 * Deploy:
 *   1. Deploy > New deployment > type: Web app
 *   2. Execute as: Me
 *   3. Who has access: Anyone (หรือ Anyone with Google account)
 *   4. Deploy → copy "Web app URL"
 *   5. วาง URL ใน mockup/index.html ที่ตัวแปร WEB_APP_URL
 *
 * Endpoints (ส่งผ่าน ?action=... สำหรับ GET, หรือ JSON body สำหรับ POST):
 *   GET  bootstrap        — โหลดข้อมูลเริ่มต้นทั้งหมด (menus/categories/channels/settings)
 *   GET  getBills         — โหลด bills + items (กรองตาม month ถ้าส่งมา)
 *   POST saveMenu         — เพิ่มเมนูใหม่
 *   POST updateMenu       — แก้ไขเมนู
 *   POST deleteMenu       — ลบเมนูเดียว
 *   POST deleteMenus      — ลบหลายเมนู
 *   POST toggleMenu       — เปิด/ปิดใช้งานเมนู
 *   POST bulkToggleMenu   — เปิด/ปิดหลายเมนู
 *   POST saveBill         — บันทึกบิลพร้อมรายการ
 *   POST deleteBill       — ลบบิล (ลบทั้งหัวและรายการ)
 * ─────────────────────────────────────────────────────────────
 */

function doGet(e) {
  const params = (e && e.parameter) || {};
  // ถ้ามี action → ตอบเป็น JSON (โหมด fetch / dev)
  if (params.action) return handleRequest_(params);
  // ไม่มี action → serve HTML (โหมด production)
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Smart Bill Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  let params = Object.assign({}, (e && e.parameter) || {});
  if (e && e.postData && e.postData.contents) {
    try { Object.assign(params, JSON.parse(e.postData.contents)); } catch (_) {}
  }
  return handleRequest_(params);
}

/**
 * เรียกจาก frontend ผ่าน google.script.run (production mode)
 * Returns { ok: true, data } หรือ { ok: false, error }
 */
function apiCall(action, payload) {
  try {
    return { ok: true, data: dispatch_(action, payload || {}) };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

function handleRequest_(params) {
  const action = params.action;
  try {
    const data = dispatch_(action, params);
    return jsonOut_({ ok: true, data: data });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err), stack: err && err.stack });
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function dispatch_(action, p) {
  switch (action) {
    case 'ping':            return { time: new Date().toISOString() };
    case 'bootstrap':       return getBootstrap_();
    case 'getBills':        return getBills_(p);
    case 'saveMenu':        return saveMenu_(p.menu || p);
    case 'saveMenus':       return saveMenus_(p.menus || []);
    case 'updateMenu':      return updateMenu_(p.menu || p);
    case 'deleteMenu':      return deleteMenu_(p.id);
    case 'deleteMenus':     return deleteMenus_(p.ids || []);
    case 'toggleMenu':      return toggleMenu_(p.id, p.active);
    case 'bulkToggleMenu':  return bulkToggleMenu_(p.ids || [], p.active);
    case 'saveBill':        return saveBill_(p.bill || p);
    case 'deleteBill':      return deleteBill_(p.billId);
    default: throw new Error('Unknown action: ' + action);
  }
}

// ============ READ ============
function getBootstrap_() {
  return {
    menus: readSheet_('Menus'),
    categories: readSheet_('Categories'),
    channels: readSheet_('Channels'),
    settings: readSettings_(),
    serverTime: new Date().toISOString(),
  };
}

function getBills_(p) {
  const bills = readSheet_('Bills');
  const items = readSheet_('BillItems');
  if (p && p.month) { // 'YYYY-MM'
    const [y, m] = p.month.split('-').map(Number);
    const filtered = bills.filter(b => {
      const d = toDate_(b.date);
      return d && d.getFullYear() === y && d.getMonth() === (m - 1);
    });
    const ids = new Set(filtered.map(b => b.billId));
    return { bills: filtered, items: items.filter(it => ids.has(it.billId)) };
  }
  return { bills: bills, items: items };
}

function readSheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  const headers = values[0];
  return values.slice(1)
    .filter(row => {
      // ข้ามแถวที่ id (คอลัมน์แรก) ว่าง — กันแถวว่างที่เกิดจาก checkbox/validation
      const id = row[0];
      return id !== '' && id !== null && id !== undefined;
    })
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let v = row[i];
        if (v instanceof Date) v = v.toISOString();
        obj[h] = v;
      });
      return obj;
    });
}

function readSettings_() {
  const rows = readSheet_('Settings');
  const obj = {};
  rows.forEach(r => obj[r.key] = r.value);
  return obj;
}

// ============ MENU CRUD ============
function saveMenu_(m) {
  validateMenu_(m);
  const sh = getSheet_('Menus');
  const id = nextMenuId_();
  const now = new Date();
  // Schema: id | name | cat | variant | price | active | createdAt | updatedAt | emoji
  sh.appendRow([id, m.name, m.cat, m.variant || '', Number(m.price), m.active !== false, now, now, m.emoji || '']);
  const row = sh.getLastRow();
  sh.getRange(row, 5).setNumberFormat('฿#,##0');
  sh.getRange(row, 7, 1, 2).setNumberFormat('yyyy-mm-dd hh:mm');
  return { id: id, menu: readRowAsObject_(sh, row) };
}

function saveMenus_(menus) {
  if (!menus || !menus.length) throw new Error('Missing menus');
  menus.forEach(validateMenu_);
  const sh = getSheet_('Menus');
  // Compute starting ID once (no race because all in one call)
  let nextNum = 1;
  if (sh.getLastRow() >= 2) {
    const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat();
    const nums = ids.map(id => parseInt(String(id).replace(/\D/g, ''), 10) || 0);
    nextNum = Math.max(0, ...nums) + 1;
  }
  const now = new Date();
  const newIds = [];
  const rows = menus.map((m, i) => {
    const id = 'M' + String(nextNum + i).padStart(3, '0');
    newIds.push(id);
    return [id, m.name, m.cat, m.variant || '', Number(m.price), m.active !== false, now, now, m.emoji || ''];
  });
  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, 9).setValues(rows);
  sh.getRange(startRow, 5, rows.length, 1).setNumberFormat('฿#,##0');
  sh.getRange(startRow, 6, rows.length, 1).insertCheckboxes();
  sh.getRange(startRow, 7, rows.length, 2).setNumberFormat('yyyy-mm-dd hh:mm');
  return { ids: newIds, count: rows.length };
}

function updateMenu_(m) {
  if (!m || !m.id) throw new Error('Missing menu id');
  validateMenu_(m);
  const sh = getSheet_('Menus');
  const row = findRowById_(sh, 'Menus', m.id);
  if (row < 0) throw new Error('Menu not found: ' + m.id);
  sh.getRange(row, 2, 1, 5).setValues([[m.name, m.cat, m.variant || '', Number(m.price), m.active !== false]]);
  sh.getRange(row, 8).setValue(new Date());
  // Update emoji if column exists
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const emojiCol = headers.indexOf('emoji') + 1;
  if (emojiCol > 0) sh.getRange(row, emojiCol).setValue(m.emoji || '');
  return { menu: readRowAsObject_(sh, row) };
}

function deleteMenu_(id) {
  if (!id) throw new Error('Missing id');
  const sh = getSheet_('Menus');
  const row = findRowById_(sh, 'Menus', id);
  if (row < 0) throw new Error('Menu not found: ' + id);
  sh.deleteRow(row);
  return { ok: true };
}

function deleteMenus_(ids) {
  const sh = getSheet_('Menus');
  const rows = ids.map(id => findRowById_(sh, 'Menus', id)).filter(r => r > 0).sort((a, b) => b - a);
  rows.forEach(r => sh.deleteRow(r));
  return { count: rows.length };
}

function toggleMenu_(id, active) {
  const sh = getSheet_('Menus');
  const row = findRowById_(sh, 'Menus', id);
  if (row < 0) throw new Error('Menu not found: ' + id);
  sh.getRange(row, 6).setValue(!!active);
  sh.getRange(row, 8).setValue(new Date());
  return { ok: true };
}

function bulkToggleMenu_(ids, active) {
  const sh = getSheet_('Menus');
  const now = new Date();
  ids.forEach(id => {
    const r = findRowById_(sh, 'Menus', id);
    if (r > 0) { sh.getRange(r, 6).setValue(!!active); sh.getRange(r, 8).setValue(now); }
  });
  return { count: ids.length };
}

function validateMenu_(m) {
  if (!m) throw new Error('Missing menu');
  if (!m.name || !String(m.name).trim()) throw new Error('ต้องกรอกชื่อเมนู');
  if (!m.cat) throw new Error('ต้องเลือกหมวด');
  if (m.price === undefined || m.price === null || isNaN(Number(m.price))) throw new Error('ราคาไม่ถูกต้อง');
  if (Number(m.price) < 0) throw new Error('ราคาต้องไม่ติดลบ');
}

function nextMenuId_() {
  const sh = getSheet_('Menus');
  if (sh.getLastRow() < 2) return 'M001';
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat();
  const nums = ids.map(id => parseInt(String(id).replace(/\D/g, ''), 10) || 0);
  const next = Math.max(0, ...nums) + 1;
  return 'M' + String(next).padStart(3, '0');
}

// ============ BILL CRUD ============
function saveBill_(b) {
  if (!b) throw new Error('Missing bill');
  if (!b.date) throw new Error('ต้องระบุวันที่');
  if (!b.channel) throw new Error('ต้องระบุช่องทาง');
  if (!b.items || !b.items.length) throw new Error('บิลว่าง ไม่สามารถบันทึกได้');

  const billSh = getSheet_('Bills');
  const itemSh = getSheet_('BillItems');
  const billId = nextBillId_(b.date);
  const now = new Date();
  const itemCount = b.items.reduce((s, it) => s + Number(it.qty || 0), 0);
  const total = b.items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0);
  const billDate = toDate_(b.date) || new Date();

  billSh.appendRow([billId, billDate, b.channel, itemCount, total, b.note || '', now]);

  const rows = b.items.map((it, i) => [
    billId,
    i + 1,
    it.menuId || it.id || '',
    it.name || '',
    it.variant || '',
    it.cat || '',
    Number(it.price || 0),
    Number(it.qty || 0),
    Number(it.price || 0) * Number(it.qty || 0),
  ]);
  if (rows.length) {
    itemSh.getRange(itemSh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
  }

  return { billId: billId, itemCount: itemCount, total: total };
}

function deleteBill_(billId) {
  if (!billId) throw new Error('Missing billId');
  const billSh = getSheet_('Bills');
  const itemSh = getSheet_('BillItems');
  // Delete bill header
  const row = findRowById_(billSh, 'Bills', billId);
  if (row > 0) billSh.deleteRow(row);
  // Delete items — bottom up
  const last = itemSh.getLastRow();
  if (last >= 2) {
    const col = itemSh.getRange(2, 1, last - 1, 1).getValues().flat();
    for (let i = col.length - 1; i >= 0; i--) {
      if (col[i] === billId) itemSh.deleteRow(i + 2);
    }
  }
  return { ok: true };
}

function nextBillId_(dateStr) {
  const d = toDate_(dateStr) || new Date();
  const ymd = Utilities.formatDate(d, 'Asia/Bangkok', 'yyyyMMdd');
  const prefix = 'B' + ymd;
  const sh = getSheet_('Bills');
  if (sh.getLastRow() < 2) return prefix + '001';
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat()
    .filter(id => String(id).indexOf(prefix) === 0);
  const nums = ids.map(id => parseInt(String(id).slice(prefix.length), 10) || 0);
  const next = Math.max(0, ...nums) + 1;
  return prefix + String(next).padStart(3, '0');
}

// ============ HELPERS ============
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function getSheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name + ' — รัน Setup Database ก่อน');
  return sh;
}

function findRowById_(sh, sheetName, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat();
  const idx = ids.indexOf(id);
  return idx < 0 ? -1 : idx + 2;
}

function readRowAsObject_(sh, row) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const values = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  const obj = {};
  headers.forEach((h, i) => {
    let v = values[i];
    if (v instanceof Date) v = v.toISOString();
    obj[h] = v;
  });
  return obj;
}

function toDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
