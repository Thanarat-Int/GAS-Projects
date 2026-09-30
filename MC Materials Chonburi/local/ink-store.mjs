import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AppError } from './store.mjs';
import { inkData } from '../web/ink-data.js';

const clone = value => structuredClone(value);
const fail = message => { throw new AppError(400, 'INK_VALIDATION', message); };
const text = (value, label, max = 300) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`กรุณาระบุ${label}ให้ถูกต้อง`);
  return value.trim();
};
const quantity = value => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 1000000) fail('จำนวนต้องเป็นจำนวนเต็มมากกว่า 0 ไม่เกิน 1,000,000');
  return value;
};
const price = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000000 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) fail('ราคาต่อหน่วยต้องไม่ติดลบ และมีทศนิยมไม่เกิน 2 ตำแหน่ง');
  return value;
};
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
export function inkDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) fail('วันที่ไม่ถูกต้อง');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('วันที่ไม่ถูกต้อง');
  const [year, month, day] = value.split('-').map(Number);
  return { year: year + 543 + (month >= 10 ? 1 : 0), display: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year + 543}` };
}

export function createInkStore(file, seed = inkData, options = {}) {
  const initial = () => ({ schemaVersion: 1, sourceSha256: seed.sourceSha256, revision: 0, baselineDate: null,
    products: seed.balances.map((row, index) => ({ id: `INK-${String(index + 1).padStart(4, '0')}`, name: row.cells[1], openingQuantity: row.cells[2], openingPrice: row.cells[3], sourceRow: row.sourceRow })),
    transactions: [], operations: {} });
  let state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : initial();
  if (state.schemaVersion !== 1 || state.sourceSha256 !== seed.sourceSha256 || !Array.isArray(state.products) || !Array.isArray(state.transactions) || !Number.isSafeInteger(state.revision) || !state.operations) throw new Error('Ink database invalid or source changed; restore verified backup before starting.');
  state.corrections ??= [];
  state.sourceEdits ??= {};
  state.audit ??= [];
  state.purchaseNoteSections ??= [{
    id: 'INK-NOTE-0001',
    title: seed.purchaseNotes[0],
    reasons: seed.purchaseNotes.slice(1).map(item => String(item).replace(/^\s*\d+\.\s*/, '').trim()),
  }];

  function totals(data) {
    const products = data.products.map(item => ({ ...item, onHand: item.openingQuantity, unitPrice: item.openingPrice }));
    const events = [...data.transactions.filter(item => !item.deleted), ...data.corrections].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    for (const transaction of events) for (const line of transaction.lines) {
      const item = products.find(product => product.id === line.productId);
      if (!item) fail('รายการอ้างอิงหมึกไม่ถูกต้อง');
      item.onHand += transaction.type === 'PURCHASE' || transaction.type === 'ADJUSTMENT' ? line.quantity : -line.quantity;
      if (transaction.type !== 'WITHDRAWAL') item.unitPrice = line.unitPrice;
      if (item.onHand < 0) fail(`${item.name}: การเปลี่ยนแปลงนี้ทำให้สต็อกติดลบในประวัติ กรุณาแก้รายการที่เกี่ยวข้องก่อน`);
    }
    if (products.some(item => item.deleted && item.onHand !== 0)) fail('การเปลี่ยนแปลงกระทบหมึกที่ลบแล้ว กรุณาตรวจประวัติก่อน');
    return products;
  }

  function snapshot() {
    const result = clone(seed);
    for (const group of result.groups) {
      group.rows = group.rows.map(row => ({ ...row, editKey: `source-purchase:${group.id}:${row.sourceRow}` })).filter(row => !state.sourceEdits[row.editKey]?.deleted).map(row => ({ ...row, ...state.sourceEdits[row.editKey] }));
      group.total = money(group.rows.reduce((sum, row) => sum + row.cells[4], 0));
    }
    result.withdrawals = result.withdrawals.map(row => ({ ...row, editKey: `source-withdrawal:${row.sourceRow}` })).filter(row => !state.sourceEdits[row.editKey]?.deleted).map(row => ({ ...row, ...state.sourceEdits[row.editKey] }));
    const products = totals(state);
    result.products = products.filter(item => !item.deleted);
    result.transactions = clone(state.transactions.filter(item => !item.deleted));
    result.audit = clone(state.audit).reverse();
    result.purchaseNoteSections = clone(state.purchaseNoteSections);
    result.canManage = (options.role ?? 'admin') === 'admin';
    if (!result.canManage) result.audit = [];
    result.revision = state.revision;
    result.baselineDate = state.baselineDate;
    for (const transaction of state.transactions) {
      if (transaction.deleted) continue;
      const date = inkDate(transaction.date);
      if (transaction.type === 'PURCHASE') {
        const rows = transaction.lines.map((line, index) => ({ productId: line.productId, editKey: `transaction:${transaction.id}`, cells: [index + 1, line.name, line.quantity, line.unitPrice, money(line.quantity * line.unitPrice)] }));
        result.groups.push({ id: transaction.id, date: transaction.date, year: date.year, title: `ปีงบประมาณ ${date.year} ซื้อวันที่ ${date.display} (${transaction.id})`, note: transaction.note, rows, total: money(rows.reduce((sum, row) => sum + row.cells[4], 0)) });
      } else {
        result.withdrawals.push(...transaction.lines.map(line => ({ productId: line.productId, editKey: `transaction:${transaction.id}`, id: transaction.id, year: date.year, dateISO: transaction.date, cells: [date.display, transaction.department, line.name, line.quantity] })));
      }
    }
    result.balances = products.filter(item => !item.deleted).map((item, index) => ({ editKey: `stock:${item.id}`, productId: item.id, cells: [index + 1, item.name, item.onHand, item.unitPrice, money(item.onHand * item.unitPrice)] }));
    result.stockTotal = money(result.balances.reduce((sum, row) => sum + row.cells[4], 0));
    return result;
  }

  function persist(next) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // A previous committed copy is retained. Never reset silently after read/write errors.
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    const temporary = `${file}.tmp`;
    const fd = fs.openSync(temporary, 'w');
    try { fs.writeFileSync(fd, JSON.stringify(next, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
    state = next;
  }

  function commit(input, type) {
    if ((options.role ?? 'admin') !== 'admin') throw new AppError(403, 'INK_ADMIN_ONLY', 'เฉพาะผู้ดูแลระบบเท่านั้น');
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('ข้อมูลไม่ถูกต้อง');
    const operationId = text(input.operationId, 'รหัสการบันทึก', 100);
    if (!/^[a-zA-Z0-9-]{10,100}$/.test(operationId)) fail('รหัสการบันทึกไม่ถูกต้อง');
    const hash = createHash('sha256').update(JSON.stringify({ type, input })).digest('hex');
    const previous = Object.hasOwn(state.operations, operationId) ? state.operations[operationId] : null;
    if (previous) {
      if (previous.hash !== hash) throw new AppError(409, 'INK_DUPLICATE_CHANGED', 'คำขอบันทึกนี้ถูกใช้แล้ว กรุณาเปิดฟอร์มใหม่');
      return { id: previous.id, state: snapshot() };
    }
    if (input.revision !== state.revision) throw new AppError(409, 'INK_CONFLICT', 'ข้อมูลเปลี่ยนแล้ว กรุณาปิดฟอร์มและโหลดข้อมูลใหม่');
    const next = clone(state);
    // New models and the receipt share one validated, atomic commit.
    const resolveProduct = (line, allowNew) => {
      if (!line || typeof line !== 'object') fail('รายการไม่ถูกต้อง');
      if (line.newProductName !== undefined) {
        if (!allowNew || line.productId) fail('เพิ่มรุ่นหมึกใหม่ได้ในรายการซื้อเท่านั้น');
        const name = text(line.newProductName, 'ชื่อรุ่นหมึกใหม่');
        const normalize = value => value.toLocaleLowerCase().replace(/\s+/g, '');
        if (next.products.some(item => normalize(item.name) === normalize(name))) fail('มีชื่อหมึกนี้แล้ว กรุณาเลือกจากรายการเดิม');
        const product = { id: `INK-${String(next.products.length + 1).padStart(4, '0')}`, name, openingQuantity: 0, openingPrice: 0, createdAt: new Date().toISOString() };
        next.products.push(product);
        return product;
      }
      const product = next.products.find(item => item.id === line.productId && !item.deleted);
      if (!product) fail('ไม่พบหมึกที่เลือก');
      return product;
    };
    let id;
    let auditBefore = null, auditAfter = null;
    if (type === 'CHANGE') {
      const key = text(input.key, 'รายการที่แก้ไข');
      if (!['UPDATE', 'DELETE'].includes(input.action)) fail('คำสั่งไม่ถูกต้อง');
      if (input.action === 'UPDATE') text(input.reason, 'เหตุผลการแก้ไข', 1000);
      id = key;
      const deleting = input.action === 'DELETE';
      if (key.startsWith('stock:')) {
        const product = next.products.find(item => item.id === key.slice(6) && !item.deleted);
        if (!product) fail('ไม่พบรายการหมึก');
        const current = totals(next).find(item => item.id === product.id);
        auditBefore = clone(current);
        if (deleting) {
          if (current.onHand !== 0) fail('ต้องปรับคงเหลือเป็น 0 พร้อมเหตุผลก่อนลบรายการหมึก');
          product.deleted = true;
        } else {
          product.name = text(input.name, 'รายการ');
          if (next.products.some(item => item.id !== product.id && !item.deleted && item.name.toLocaleLowerCase().replace(/\s/g, '') === product.name.toLocaleLowerCase().replace(/\s/g, ''))) fail('ชื่อหมึกซ้ำ');
          if (!Number.isSafeInteger(input.quantity) || input.quantity < 0 || input.quantity > 1000000) fail('คงเหลือต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 1,000,000');
          const unitPrice = price(input.unitPrice);
          next.corrections.push({ type: 'ADJUSTMENT', sequence: next.revision + 1, lines: [{ productId: product.id, quantity: input.quantity - current.onHand, unitPrice }] });
        }
        auditAfter = clone(totals(next).find(item => item.id === product.id));
      } else if (key.startsWith('transaction:')) {
        const transaction = next.transactions.find(item => item.id === key.slice(12) && !item.deleted);
        if (!transaction) fail('ไม่พบเอกสาร');
        auditBefore = clone(transaction);
        if (deleting) transaction.deleted = true;
        else {
          const date = inkDate(input.date);
          if (input.date < next.baselineDate || input.date > new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())) fail('วันที่อยู่นอกช่วงที่เปิดใช้งาน');
          if (date.year !== transaction.year) fail('เปลี่ยนข้ามปีงบประมาณไม่ได้ กรุณาลบเอกสารแล้วสร้างใหม่');
          const active = next.transactions.filter(item => !item.deleted);
          const position = active.indexOf(transaction);
          if ((active[position - 1] && input.date < active[position - 1].date) || (active[position + 1] && input.date > active[position + 1].date)) fail('วันที่ต้องเรียงตามเอกสารก่อนหน้าและถัดไป');
          if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 100) fail('ต้องมีรายการ 1–100 รายการ');
          const seen = new Set();
          transaction.lines = input.lines.map(line => {
            const product = resolveProduct(line, transaction.type === 'PURCHASE');
            if (!product || seen.has(product.id)) fail('ไม่พบหมึกหรือมีรายการซ้ำ');
            seen.add(product.id);
            return { productId: product.id, name: product.name, quantity: quantity(line.quantity), unitPrice: transaction.type === 'PURCHASE' ? price(line.unitPrice) : 0 };
          });
          transaction.date = input.date;
          transaction.department = transaction.type === 'WITHDRAWAL' ? text(input.department, 'ฝ่าย', 100) : '';
          transaction.note = input.note ? text(input.note, 'หมายเหตุ', 1000) : '';
        }
        auditAfter = clone(transaction);
      } else {
        const original = snapshot().groups.flatMap(group => group.rows).concat(snapshot().withdrawals).find(row => row.editKey === key);
        if (!original) fail('ไม่พบข้อมูลต้นฉบับ');
        auditBefore = clone(original);
        if (deleting) next.sourceEdits[key] = { ...original, deleted: true };
        else {
          const name = text(input.name, 'รายการ');
          if (!Number.isSafeInteger(input.quantity) || input.quantity < 0 || input.quantity > 1000000) fail('จำนวนไม่ถูกต้อง');
          if (key.startsWith('source-purchase:')) {
            const unitPrice = price(input.unitPrice);
            next.sourceEdits[key] = { ...original, cells: [original.cells[0], name, input.quantity, unitPrice, money(input.quantity * unitPrice)] };
          } else {
            const date = inkDate(input.date);
            next.sourceEdits[key] = { ...original, dateISO: input.date, year: date.year, cells: [date.display, text(input.department, 'ฝ่าย', 100), name, input.quantity] };
          }
        }
        auditAfter = clone(next.sourceEdits[key]);
      }
    } else if (type === 'NOTES') {
      if (!Array.isArray(input.sections) || input.sections.length > 20) fail('หัวข้อต้องมีไม่เกิน 20 หัวข้อ');
      const usedIds = new Set();
      auditBefore = clone(next.purchaseNoteSections);
      next.purchaseNoteSections = input.sections.map((section, index) => {
        if (!section || typeof section !== 'object' || Array.isArray(section)) fail('ข้อมูลหัวข้อไม่ถูกต้อง');
        if (!Array.isArray(section.reasons) || !section.reasons.length || section.reasons.length > 20) fail('แต่ละหัวข้อต้องมีเหตุผล 1–20 รายการ');
        const suppliedId = typeof section.id === 'string' && /^INK-NOTE-[A-Z0-9-]{1,80}$/.test(section.id) ? section.id : '';
        const sectionId = suppliedId || `INK-NOTE-${next.revision + 1}-${index + 1}`;
        if (usedIds.has(sectionId)) fail('รหัสหัวข้อซ้ำ');
        usedIds.add(sectionId);
        return {
          id: sectionId,
          title: text(section.title, 'หัวข้อ', 160),
          reasons: section.reasons.map(reason => text(reason, 'เหตุผล', 1000)),
        };
      });
      id = 'INK-NOTES';
      auditAfter = clone(next.purchaseNoteSections);
    } else if (type === 'PRODUCT') {
      const name = text(input.name, 'รายการหมึก');
      const normalize = value => value.toLocaleLowerCase().replace(/\s+/g, '');
      if (next.products.some(item => normalize(item.name) === normalize(name))) fail('มีชื่อหมึกนี้แล้ว กรุณาเลือกจากรายการเดิม');
      id = `INK-${String(next.products.length + 1).padStart(4, '0')}`;
      next.products.push({ id, name, openingQuantity: 0, openingPrice: 0, createdAt: new Date().toISOString() });
    } else {
      const date = inkDate(input.date);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (input.date > today) fail('ไม่สามารถบันทึกรับหรือจ่ายล่วงหน้าได้');
      if (!next.baselineDate) {
        if (input.confirmBaseline !== true) fail('กรุณายืนยันยอดคงเหลือเริ่มต้นก่อนบันทึกครั้งแรก');
        inkDate(input.baselineDate);
        if (input.baselineDate > today) fail('วันที่เริ่มใช้ยอดคงเหลือต้องไม่เกินวันนี้');
        next.baselineDate = input.baselineDate;
      }
      if (input.date < next.baselineDate) fail(`วันที่ต้องไม่ก่อนวันเริ่มใช้ยอดคงเหลือ ${next.baselineDate}`);
      const lastDate = next.transactions.filter(item => !item.deleted).at(-1)?.date;
      if (lastDate && input.date < lastDate) fail('กรุณาบันทึกตามลำดับวันที่ ไม่ย้อนหลังรายการล่าสุด');
      if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) fail('ต้องมีรายการ 1–100 รายการ');
      const seen = new Set();
      const current = totals(next);
      const lines = input.lines.map(line => {
        if (!line || typeof line !== 'object') fail('รายการไม่ถูกต้อง');
        const resolved = resolveProduct(line, type === 'PURCHASE');
        const product = current.find(item => item.id === resolved.id) || { ...resolved, onHand: 0, unitPrice: 0 };
        if (seen.has(product.id)) fail('หมึกซ้ำในเอกสาร กรุณารวมจำนวนเป็นบรรทัดเดียว');
        seen.add(product.id);
        const count = quantity(line.quantity);
        if (type === 'WITHDRAWAL' && count > product.onHand) fail(`${product.name} คงเหลือ ${product.onHand} ไม่เพียงพอ`);
        return { productId: product.id, name: product.name, quantity: count, unitPrice: type === 'PURCHASE' ? price(line.unitPrice) : product.unitPrice };
      });
      if (lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) > 1e12) fail('มูลค่าเอกสารสูงเกินขอบเขตที่รองรับ');
      const prefix = type === 'PURCHASE' ? 'INK-PUR' : 'INK-ISS';
      const serial = next.transactions.filter(item => item.type === type && item.year === date.year).length + 1;
      id = `${prefix}-${date.year}-${String(serial).padStart(5, '0')}`;
      const note = input.note == null || input.note === '' ? '' : text(input.note, 'หมายเหตุ', 1000);
      next.transactions.push({ id, type, sequence: next.revision + 1, year: date.year, date: input.date, department: type === 'WITHDRAWAL' ? text(input.department, 'ฝ่าย', 100) : '', lines, note, createdAt: new Date().toISOString() });
    }
    if (totals(next).some(item => item.onHand > 1e8 || item.onHand * item.unitPrice > 1e12)) fail('ยอดคงคลังสูงเกินขอบเขตที่รองรับ');
    next.revision++;
    next.audit.push({ revision: next.revision, id, action: type === 'CHANGE' ? input.action : type, reason: input.reason || '', at: new Date().toISOString(), actor: 'LOCAL_ADMIN', before: auditBefore, after: auditAfter || clone(type === 'PRODUCT' ? next.products.at(-1) : next.transactions.at(-1)) });
    next.operations[operationId] = { id, hash };
    persist(next);
    return { id, state: snapshot() };
  }
  return { snapshot, commit, backup: () => clone({ ...state, sourceWorkbook: seed }) };
}
