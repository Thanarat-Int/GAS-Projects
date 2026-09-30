import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const REQUISITION_DEPARTMENTS = ['บริหาร', 'วิชาการ'];

export function loadMaterialSeed(seedPath) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(seedPath, 'utf8'), context, { filename: seedPath });
  return {
    meta: JSON.parse(JSON.stringify(context.MATERIAL_SEED_META)),
    categories: JSON.parse(JSON.stringify(context.MATERIAL_CATEGORY_SEED)),
    reviews: JSON.parse(JSON.stringify(context.MATERIAL_IMPORT_SEED)),
  };
}

const now = () => new Date().toISOString();
const clean = (value, label, max = 300) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) throw new AppError(400, 'VALIDATION', `กรุณาระบุ${label}`);
  if (text.length > max) throw new AppError(400, 'VALIDATION', `${label}ยาวเกินไป`);
  return text;
};
const number = (value, label, min = 0) => {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min) throw new AppError(400, 'VALIDATION', `${label}ไม่ถูกต้อง`);
  return Math.round(result * 1000) / 1000;
};
const bool = value => value === true || value === 'true';
const clone = value => JSON.parse(JSON.stringify(value));

function mapCategory(row) {
  return { id: row[0], code: row[1], nameTh: row[2], nameEn: row[3], order: row[4], active: true };
}

function mapReview(row) {
  return {
    id: row[0], fiscalYear: 2569, sourceKey: row[1], sourceSheet: row[2], sourceRow: row[3], categoryId: row[4],
    originalName: row[5], originalUnit: row[6], proposedName: row[7], proposedUnit: row[8],
    opening: row[9], received: row[10], sourceTotal: row[11], issued: row[12], proposedBalance: row[13],
    latestPrice: row[14], sourceValue: row[15], issues: row[16] ? row[16].split('|') : [],
    status: row[17], reviewNote: row[18], materialId: row[19], importedAt: row[20], reviewedAt: row[21],
    reviewedBy: row[22], version: row[23],
  };
}

export function createMaterialStore(seed, options = {}) {
  const actor = options.actor || 'admin@local.test';
  const role = options.role || 'admin';
  const initialCategories = seed.categories.map(mapCategory);
  const initialReviews = seed.reviews.map(mapReview);
  let categories;
  let reviews;
  let materials;
  let movements;
  let fiscalYears;
  let fiscalPeriods;
  let requisitions;
  let materialSequence;
  let movementSequence;
  let requisitionSequence;
  const operations = new Map();

  function checkpoint() {
    return clone({ schemaVersion: 2, categories, reviews, materials, movements, fiscalYears, fiscalPeriods, requisitions, materialSequence, movementSequence, requisitionSequence, operations: [...operations] });
  }

  function restore(saved) {
    if (![1, 2].includes(saved?.schemaVersion) || !['categories', 'reviews', 'materials', 'movements', 'fiscalYears', 'fiscalPeriods', 'operations'].every(key => Array.isArray(saved[key])) || !Number.isSafeInteger(saved.materialSequence) || !Number.isSafeInteger(saved.movementSequence) || saved.fiscalYears.filter(item => item.status === 'OPEN').length !== 1) throw new Error('Invalid material checkpoint; restore a verified backup.');
    ({ categories, reviews, materials, movements, fiscalYears, fiscalPeriods, materialSequence, movementSequence } = clone(saved));
    requisitions = saved.schemaVersion === 2 && Array.isArray(saved.requisitions) ? clone(saved.requisitions) : [];
    requisitionSequence = saved.schemaVersion === 2 && Number.isSafeInteger(saved.requisitionSequence) ? saved.requisitionSequence : 0;
    operations.clear();
    saved.operations.forEach(([key, value]) => operations.set(key, clone(value)));
  }

  function persist() {
    if (!options.file) return;
    fs.mkdirSync(path.dirname(options.file), { recursive: true });
    if (fs.existsSync(options.file)) fs.copyFileSync(options.file, `${options.file}.bak`);
    const fd = fs.openSync(`${options.file}.tmp`, 'w');
    try { fs.writeFileSync(fd, JSON.stringify(checkpoint(), null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(`${options.file}.tmp`, options.file);
  }

  function fiscalYearRange(year) {
    return {
      startDate: `${year - 544}-10-01`,
      endDate: `${year - 543}-09-30`,
    };
  }

  function buildFiscalYear(year, status = 'OPEN') {
    const timestamp = now();
    return {
      id: `FY-${year}`,
      year,
      ...fiscalYearRange(year),
      status,
      createdAt: timestamp,
      createdBy: actor,
      closedAt: '',
      closedBy: '',
      version: 1,
    };
  }

  function reset() {
    categories = clone(initialCategories);
    reviews = clone(initialReviews);
    materials = [];
    movements = [];
    fiscalYears = [buildFiscalYear(2569)];
    fiscalPeriods = [];
    requisitions = [];
    materialSequence = 0;
    movementSequence = 0;
    requisitionSequence = 0;
    operations.clear();
    bootstrapImportedData();
    return snapshot();
  }

  function category(id) {
    const found = categories.find(item => item.id === id && item.active);
    if (!found) throw new AppError(400, 'CATEGORY_NOT_FOUND', 'ไม่พบประเภทวัสดุ');
    return found;
  }

  function material(id) {
    const found = materials.find(item => item.id === id);
    if (!found) throw new AppError(404, 'MATERIAL_NOT_FOUND', 'ไม่พบวัสดุ');
    return found;
  }

  function review(id) {
    const found = reviews.find(item => item.id === id);
    if (!found) throw new AppError(404, 'REVIEW_NOT_FOUND', 'ไม่พบรายการตรวจนำเข้า');
    return found;
  }

  function fiscalYear(year) {
    const found = fiscalYears.find(item => item.year === Number(year));
    if (!found) throw new AppError(404, 'FISCAL_YEAR_NOT_FOUND', 'ไม่พบปีงบประมาณ');
    return found;
  }

  function activeFiscalYear() {
    const found = fiscalYears.find(item => item.status === 'OPEN');
    if (!found) throw new AppError(409, 'NO_OPEN_FISCAL_YEAR', 'ไม่มีปีงบประมาณที่เปิดใช้งาน');
    return found;
  }

  function fiscalPeriod(materialId, year) {
    return fiscalPeriods.find(item => item.materialId === materialId && item.fiscalYear === Number(year));
  }

  function requisition(id) {
    const found = requisitions.find(item => item.id === id);
    if (!found) throw new AppError(404, 'REQUISITION_NOT_FOUND', 'ไม่พบคำขอเบิก');
    return found;
  }

  function requireAdmin() {
    if (role !== 'admin') throw new AppError(403, 'ADMIN_REQUIRED', 'เฉพาะผู้ดูแลระบบเท่านั้น');
  }

  function createFiscalPeriod(input) {
    const existing = fiscalPeriod(input.materialId, input.fiscalYear);
    if (existing) throw new AppError(409, 'DUPLICATE_FISCAL_PERIOD', 'วัสดุนี้มีข้อมูลปีงบประมาณแล้ว');
    const openingBalance = number(input.openingBalance ?? 0, 'ยอดยกมา');
    const receivedBeforeSystem = number(input.receivedBeforeSystem ?? 0, 'ยอดรับก่อนเข้าระบบ');
    const issuedBeforeSystem = number(input.issuedBeforeSystem ?? 0, 'ยอดจ่ายก่อนเข้าระบบ');
    const cutoverBalance = number(input.cutoverBalance ?? 0, 'คงเหลือ ณ วันนำเข้า');
    const reconciliationAdjustment = Math.round((cutoverBalance - (openingBalance + receivedBeforeSystem - issuedBeforeSystem)) * 1000) / 1000;
    const period = {
      id: `PER-${input.fiscalYear}-${input.materialId}`,
      materialId: input.materialId,
      materialCode: input.materialCode,
      materialName: input.materialName,
      fiscalYear: input.fiscalYear,
      openingBalance,
      receivedBeforeSystem,
      issuedBeforeSystem,
      cutoverBalance,
      reconciliationAdjustment,
      reportedTotalReceived: number(input.reportedTotalReceived ?? (openingBalance + receivedBeforeSystem), 'รวมจำนวนรับ'),
      latestPrice: number(input.latestPrice ?? 0, 'ราคาหน่วยล่าสุด'),
      reportedValue: number(input.reportedValue ?? (cutoverBalance * Number(input.latestPrice || 0)), 'ราคารวม'),
      note: String(input.note || '').trim(),
      deleted: false,
      deletedAt: '',
      deletedBy: '',
      receivedInSystem: 0,
      issuedInSystem: 0,
      adjustmentIn: 0,
      adjustmentOut: 0,
      closingBalance: cutoverBalance,
      source: input.source,
      sourceReference: input.sourceReference || '',
      updatedAt: now(),
      version: 1,
    };
    fiscalPeriods.push(period);
    return period;
  }

  function bootstrapImportedData() {
    const timestamp = now();
    const importedCategories = options.bootstrapCategoryIds || ['CAT-OFFICE', 'CAT-MEDICAL', 'CAT-HOUSEKEEPING', 'CAT-PRINTED', 'CAT-IT', 'CAT-MEDSUP-5', 'CAT-MEDSUP'];
    reviews.filter(item => importedCategories.includes(item.categoryId)).forEach(target => {
      const identity = nextMaterial(target.categoryId);
      const created = {
        ...identity,
        categoryId: target.categoryId,
        name: target.proposedName,
        unit: target.proposedUnit,
        packDetail: '',
        latestPrice: target.latestPrice,
        note: '',
        onHand: 0,
        reserved: 0,
        reorderPoint: 0,
        active: true,
        createdAt: timestamp,
        createdBy: actor,
        updatedAt: timestamp,
        updatedBy: actor,
        version: 1,
      };
      materials.push(created);
      createFiscalPeriod({
        materialId: created.id,
        materialCode: created.code,
        materialName: created.name,
        fiscalYear: target.fiscalYear,
        openingBalance: target.opening,
        receivedBeforeSystem: target.received,
        issuedBeforeSystem: target.issued,
        cutoverBalance: target.proposedBalance,
        reportedTotalReceived: target.sourceTotal,
        latestPrice: target.latestPrice,
        reportedValue: target.sourceValue,
        source: 'IMPORTED_EXCEL',
        sourceReference: target.id,
      });
      if (target.proposedBalance > 0) addMovement(created, 'CUTOVER', target.proposedBalance, 'IMPORT', target.id, 'ยอดคงเหลือ ณ จุดเริ่มใช้ระบบ', `SEED:${target.id}`, target.fiscalYear);
      target.status = 'APPROVED';
      target.materialId = created.id;
      target.importedAt = timestamp;
      target.reviewedAt = timestamp;
      target.reviewedBy = actor;
      target.version += 1;
    });
  }

  function operation(opId, payload, action) {
    const id = clean(opId, 'รหัสรายการ', 100);
    const signature = JSON.stringify(payload);
    if (operations.has(id)) {
      const previous = operations.get(id);
      if (previous.signature !== signature) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'รายการนี้ถูกใช้กับข้อมูลอื่นแล้ว');
      return clone(previous.result);
    }
    const before = checkpoint();
    try {
      const result = action();
      operations.set(id, { signature, result: clone(result) });
      persist();
      return result;
    } catch (error) { restore(before); throw error; }
  }

  function ensureUniqueName(name, exceptId = '') {
    const key = name.toLocaleLowerCase('th-TH');
    if (materials.some(item => item.active && item.id !== exceptId && item.name.toLocaleLowerCase('th-TH') === key)) {
      throw new AppError(409, 'DUPLICATE_MATERIAL', 'ชื่อวัสดุนี้มีอยู่แล้ว');
    }
  }

  function nextMaterial(categoryId) {
    materialSequence += 1;
    const cat = category(categoryId);
    const categoryIndex = materials.filter(item => item.categoryId === categoryId).length + 1;
    return {
      id: `MAT-${String(materialSequence).padStart(6, '0')}`,
      code: `${cat.code}-${String(categoryIndex).padStart(4, '0')}`,
    };
  }

  function addMovement(target, type, quantity, referenceType, referenceNo, note, operationId, year) {
    movementSequence += 1;
    const change = ['CARRY_FORWARD', 'VOID'].includes(type) ? 0 : type === 'ADJUST_OUT' || type === 'ISSUE' ? -quantity : quantity;
    target.onHand = Math.round((target.onHand + change) * 1000) / 1000;
    const entry = {
      id: `STK-${String(movementSequence).padStart(8, '0')}`,
      materialId: target.id,
      materialCode: target.code,
      materialName: target.name,
      type,
      change,
      balanceAfter: target.onHand,
      referenceType,
      referenceNo,
      note,
      fiscalYear: Number(year),
      occurredAt: now(),
      actor,
      operationId,
    };
    movements.unshift(entry);
    return entry;
  }

  function stats(year = activeFiscalYear().year) {
    const activeMaterials = materials.filter(item => item.active).length;
    const balances = new Map(fiscalPeriods.filter(item => item.fiscalYear === Number(year) && !item.deleted).map(item => [item.materialId, item.closingBalance]));
    const lowStock = materials.filter(item => item.active && balances.has(item.id) && balances.get(item.id) <= item.reorderPoint).length;
    const inStockMaterials = [...balances.values()].filter(value => value > 0).length;
    const pendingRequisitions = requisitions.filter(item => item.fiscalYear === Number(year) && item.status === 'PENDING').length;
    const readyToIssue = requisitions.filter(item => item.fiscalYear === Number(year) && item.status === 'APPROVED').length;
    return { activeMaterials, lowStock, inStockMaterials, pendingRequisitions, readyToIssue };
  }

  function snapshot() {
    return clone({
      app: { name: 'วัสดุศูนย์แพทย์', mode: 'LOCAL', actor, role },
      stats: stats(),
      activeFiscalYear: activeFiscalYear().year,
      fiscalYears,
      fiscalPeriods,
      categories,
      materials: materials.map(item => ({ ...item, available: Math.max(0, item.onHand - item.reserved) })),
      movements,
      requisitions,
      requisitionDepartments: REQUISITION_DEPARTMENTS,
    });
  }

  function updateFiscalPeriodFromMovement(period, type, quantity, closingBalance) {
    if (type === 'RECEIPT') period.receivedInSystem += quantity;
    if (type === 'ISSUE') period.issuedInSystem += quantity;
    if (type === 'ADJUST_IN') period.adjustmentIn += quantity;
    if (type === 'ADJUST_OUT') period.adjustmentOut += quantity;
    period.closingBalance = closingBalance;
    period.updatedAt = now();
    period.version += 1;
  }

  function approveReview(input) {
    const target = review(input.reviewId);
    return operation(input.operationId, input, () => {
      if (target.status !== 'PENDING') throw new AppError(409, 'ALREADY_REVIEWED', 'รายการนี้ตรวจแล้ว');
      if (Number(input.version) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      const name = clean(input.name, 'ชื่อวัสดุ');
      const unit = clean(input.unit, 'หน่วยนับ', 60);
      const categoryId = clean(input.categoryId, 'ประเภทวัสดุ', 80);
      const openingBalance = number(input.openingBalance, 'คงเหลือยกมา');
      const reorderPoint = number(input.reorderPoint ?? 0, 'จุดแจ้งเตือน');
      const year = fiscalYear(target.fiscalYear);
      if (year.status !== 'OPEN') throw new AppError(409, 'FISCAL_YEAR_CLOSED', 'ปีงบประมาณนี้ปิดแล้ว');
      ensureUniqueName(name);
      const identity = nextMaterial(categoryId);
      const timestamp = now();
      const created = {
        ...identity, categoryId, name, unit, packDetail: String(input.packDetail || '').trim(),
        latestPrice: target.latestPrice, note: '',
        onHand: 0, reserved: 0, reorderPoint, active: input.active === undefined ? true : bool(input.active),
        createdAt: timestamp, createdBy: actor, updatedAt: timestamp, updatedBy: actor, version: 1,
      };
      materials.push(created);
      const period = createFiscalPeriod({
        materialId: created.id,
        materialCode: created.code,
        materialName: created.name,
        fiscalYear: target.fiscalYear,
        openingBalance: target.opening,
        receivedBeforeSystem: target.received,
        issuedBeforeSystem: target.issued,
        cutoverBalance: openingBalance,
        reportedTotalReceived: target.sourceTotal,
        latestPrice: target.latestPrice,
        reportedValue: target.sourceValue,
        source: 'IMPORTED_EXCEL',
        sourceReference: target.id,
      });
      if (openingBalance > 0) addMovement(created, 'CUTOVER', openingBalance, 'IMPORT', target.id, 'ยอดคงเหลือ ณ วันนำเข้า', input.operationId, target.fiscalYear);
      target.status = 'APPROVED';
      target.reviewNote = String(input.note || '').trim();
      target.materialId = created.id;
      target.importedAt = timestamp;
      target.reviewedAt = timestamp;
      target.reviewedBy = actor;
      target.version += 1;
      return { material: clone(created), review: clone(target), fiscalPeriod: clone(period) };
    });
  }

  function rejectReview(input) {
    const target = review(input.reviewId);
    return operation(input.operationId, input, () => {
      if (target.status !== 'PENDING') throw new AppError(409, 'ALREADY_REVIEWED', 'รายการนี้ตรวจแล้ว');
      if (Number(input.version) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      const reviewNote = clean(input.note, 'เหตุผลที่ไม่รับรายการ');
      target.status = 'REJECTED';
      target.reviewNote = reviewNote;
      target.reviewedAt = now();
      target.reviewedBy = actor;
      target.version += 1;
      return { review: clone(target) };
    });
  }

  function createMaterial(input) {
    return operation(input.operationId, input, () => {
      const name = clean(input.name, 'ชื่อวัสดุ');
      const unit = clean(input.unit, 'หน่วยนับ', 60);
      const categoryId = clean(input.categoryId, 'ประเภทวัสดุ', 80);
      const openingBalance = number(input.openingBalance ?? 0, 'คงเหลือยกมา');
      const reorderPoint = number(input.reorderPoint ?? 0, 'จุดแจ้งเตือน');
      const year = activeFiscalYear();
      ensureUniqueName(name);
      const identity = nextMaterial(categoryId);
      const timestamp = now();
      const created = {
        ...identity, categoryId, name, unit, packDetail: String(input.packDetail || '').trim(),
        latestPrice: 0, note: '',
        onHand: 0, reserved: 0, reorderPoint,
        active: input.active === undefined ? true : bool(input.active), createdAt: timestamp, createdBy: actor,
        updatedAt: timestamp, updatedBy: actor, version: 1,
      };
      materials.push(created);
      const period = createFiscalPeriod({
        materialId: created.id,
        materialCode: created.code,
        materialName: created.name,
        fiscalYear: year.year,
        openingBalance,
        cutoverBalance: openingBalance,
        source: 'MANUAL',
        sourceReference: created.code,
      });
      if (openingBalance > 0) addMovement(created, 'OPENING', openingBalance, 'MANUAL', created.code, 'ยอดยกมา', input.operationId, year.year);
      return { material: clone(created), fiscalPeriod: clone(period) };
    });
  }

  function updateMaterial(input) {
    const target = material(input.materialId);
    return operation(input.operationId, input, () => {
      if (Number(input.version) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      const name = clean(input.name, 'ชื่อวัสดุ');
      ensureUniqueName(name, target.id);
      const unit = clean(input.unit, 'หน่วยนับ', 60);
      const categoryId = clean(input.categoryId, 'ประเภทวัสดุ', 80);
      const reorderPoint = number(input.reorderPoint ?? 0, 'จุดแจ้งเตือน');
      category(categoryId);
      target.name = name;
      target.unit = unit;
      target.categoryId = categoryId;
      target.packDetail = String(input.packDetail || '').trim();
      target.reorderPoint = reorderPoint;
      target.active = bool(input.active);
      target.updatedAt = now();
      target.updatedBy = actor;
      target.version += 1;
      movements.forEach(entry => {
        if (entry.materialId === target.id) entry.materialName = target.name;
      });
      fiscalPeriods.forEach(entry => {
        if (entry.materialId === target.id) entry.materialName = target.name;
      });
      return { material: clone(target) };
    });
  }

  function recordStock(input) {
    const target = material(input.materialId);
    return operation(input.operationId, input, () => {
      if (!target.active) throw new AppError(409, 'MATERIAL_INACTIVE', 'วัสดุนี้ถูกปิดใช้งานแล้ว');
      const year = activeFiscalYear();
      if (input.fiscalYear && Number(input.fiscalYear) !== year.year) throw new AppError(409, 'FISCAL_YEAR_CLOSED', 'บันทึกได้เฉพาะปีงบประมาณที่เปิดอยู่');
      const type = clean(input.type, 'ประเภทรายการ', 30);
      if (!['RECEIPT', 'ADJUST_IN', 'ADJUST_OUT'].includes(type)) throw new AppError(400, 'INVALID_MOVEMENT', 'ประเภทรายการไม่ถูกต้อง');
      const quantity = number(input.quantity, 'จำนวน', 0.001);
      const nextBalance = target.onHand + (type === 'ADJUST_OUT' ? -quantity : quantity);
      if (nextBalance < target.reserved) throw new AppError(409, 'INSUFFICIENT_STOCK', 'ปรับออกไม่ได้ เพราะคงเหลือจะต่ำกว่ายอดรอจ่าย');
      let period = fiscalPeriod(target.id, year.year);
      if (!period) {
        period = createFiscalPeriod({
          materialId: target.id,
          materialCode: target.code,
          materialName: target.name,
          fiscalYear: year.year,
          openingBalance: target.onHand,
          cutoverBalance: target.onHand,
          source: 'CARRY_FORWARD',
          sourceReference: `FY-${year.year - 1}`,
        });
      }
      const entry = addMovement(
        target, type, quantity, clean(input.referenceType || 'MANUAL', 'ประเภทอ้างอิง', 60),
        clean(input.referenceNo || '-', 'เลขอ้างอิง', 100), String(input.note || '').trim(), input.operationId, year.year,
      );
      updateFiscalPeriodFromMovement(period, type, quantity, target.onHand);
      target.updatedAt = now();
      target.updatedBy = actor;
      target.version += 1;
      return { material: clone(target), movement: clone(entry) };
    });
  }

  function requisitionDate(value, year) {
    const text = clean(value, 'วันที่ขอเบิก', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00.000Z`))) throw new AppError(400, 'INVALID_REQUISITION_DATE', 'วันที่ขอเบิกไม่ถูกต้อง');
    const targetYear = fiscalYear(year);
    if (text < targetYear.startDate || text > targetYear.endDate) throw new AppError(400, 'REQUISITION_DATE_OUTSIDE_FISCAL_YEAR', 'วันที่ขอเบิกอยู่นอกปีงบประมาณที่เปิดใช้งาน');
    return text;
  }

  function buildRequisitionLines(inputLines, year) {
    if (!Array.isArray(inputLines) || inputLines.length < 1 || inputLines.length > 20) throw new AppError(400, 'INVALID_REQUISITION_LINES', 'คำขอเบิกต้องมี 1–20 รายการ');
    const seen = new Set();
    return inputLines.map(inputLine => {
      const materialId = clean(inputLine.materialId, 'วัสดุ', 80);
      if (seen.has(materialId)) throw new AppError(409, 'DUPLICATE_REQUISITION_LINE', 'มีวัสดุซ้ำในคำขอเบิก');
      seen.add(materialId);
      const target = material(materialId);
      if (!target.active) throw new AppError(409, 'MATERIAL_INACTIVE', `วัสดุ ${target.name} ปิดใช้งานแล้ว`);
      const period = fiscalPeriod(materialId, year);
      if (!period || period.deleted) throw new AppError(404, 'FISCAL_PERIOD_NOT_FOUND', `ไม่พบ ${target.name} ในปีงบประมาณนี้`);
      const quantity = Number(inputLine.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new AppError(400, 'INVALID_REQUISITION_QUANTITY', 'จำนวนที่ขอเบิกต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป');
      const available = Math.max(0, target.onHand - target.reserved);
      const maximumIssue = Math.max(0, Math.floor(available - 1));
      if (maximumIssue < 1) throw new AppError(409, 'STOCK_NOT_ISSUABLE', `${target.name} เหลือ ${available} ${target.unit} จึงยังไม่สามารถเบิกได้`);
      if (quantity > maximumIssue) throw new AppError(409, 'MINIMUM_STOCK_REQUIRED', `${target.name} เบิกได้สูงสุด ${maximumIssue} ${target.unit} เพื่อให้เหลืออย่างน้อย 1 ${target.unit}`);
      return { materialId: target.id, materialCode: target.code, materialName: target.name, unit: target.unit, quantity };
    });
  }

  function buildApprovedRequisitionLines(requestedLines, inputLines) {
    if (!Array.isArray(inputLines) || inputLines.length !== requestedLines.length) throw new AppError(400, 'INVALID_APPROVAL_LINES', 'กรุณาระบุจำนวนจ่ายให้ครบทุกรายการ');
    const requestedByMaterial = new Map(requestedLines.map(line => [line.materialId, line]));
    const seen = new Set();
    return inputLines.map(inputLine => {
      const materialId = clean(inputLine.materialId, 'วัสดุ', 80);
      const requested = requestedByMaterial.get(materialId);
      if (!requested || seen.has(materialId)) throw new AppError(400, 'INVALID_APPROVAL_LINES', 'รายการอนุมัติไม่ตรงกับคำขอเบิก');
      seen.add(materialId);
      const issueQuantity = Number(inputLine.issueQuantity);
      if (!Number.isSafeInteger(issueQuantity) || issueQuantity < 1) throw new AppError(400, 'INVALID_ISSUE_QUANTITY', 'จำนวนจ่ายต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป');
      if (issueQuantity > requested.quantity) throw new AppError(400, 'ISSUE_QUANTITY_EXCEEDS_REQUEST', `${requested.materialName} จ่ายได้ไม่เกินจำนวนที่ขอ ${requested.quantity} ${requested.unit}`);
      const stock = material(materialId);
      const available = Math.max(0, stock.onHand - stock.reserved);
      const maximumIssue = Math.max(0, Math.floor(available - 1));
      if (issueQuantity > maximumIssue) throw new AppError(409, 'MINIMUM_STOCK_REQUIRED', `${stock.name} จ่ายได้สูงสุด ${maximumIssue} ${stock.unit} เพื่อให้เหลืออย่างน้อย 1 ${stock.unit}`);
      return { ...requested, issueQuantity, note: String(inputLine.note || '').trim().slice(0, 300) };
    });
  }

  function effectiveIssueQuantity(line) {
    const value = Number(line.issueQuantity);
    return Number.isSafeInteger(value) && value >= 1 ? value : Number(line.quantity);
  }

  function requisitionValues(input, year) {
    const department = clean(input.department, 'ฝ่ายที่ขอเบิก', 160);
    if (!REQUISITION_DEPARTMENTS.includes(department)) throw new AppError(400, 'INVALID_REQUISITION_DEPARTMENT', 'กรุณาเลือกฝ่ายที่ขอเบิกจากรายการ');
    return {
      requestDate: requisitionDate(input.requestDate, year),
      requesterName: clean(input.requesterName, 'ชื่อผู้ขอเบิก', 160),
      department,
      note: String(input.note || '').trim().slice(0, 500),
      lines: buildRequisitionLines(input.lines, year),
    };
  }

  function touchReserved(target, quantity) {
    target.reserved = Math.round((target.reserved + quantity) * 1000) / 1000;
    if (target.reserved < 0 || target.reserved > target.onHand) throw new AppError(409, 'INVALID_RESERVED_STOCK', `ยอดรอจ่ายของ ${target.name} ไม่ถูกต้อง`);
    target.updatedAt = now();
    target.updatedBy = actor;
    target.version += 1;
  }

  function createRequisition(input) {
    const year = activeFiscalYear();
    return operation(input.operationId, input, () => {
      const values = requisitionValues(input, year.year);
      requisitionSequence += 1;
      const requestNo = `REQ-${year.year}-${String(requisitionSequence).padStart(4, '0')}`;
      const timestamp = now();
      const created = {
        id: requestNo,
        requestNo,
        fiscalYear: year.year,
        ...values,
        status: 'PENDING',
        createdAt: timestamp,
        createdBy: actor,
        updatedAt: timestamp,
        updatedBy: actor,
        approvedAt: '',
        approvedBy: '',
        issuedAt: '',
        issuedBy: '',
        rejectedAt: '',
        rejectedBy: '',
        cancelledAt: '',
        cancelledBy: '',
        version: 1,
      };
      requisitions.unshift(created);
      return { requisition: clone(created) };
    });
  }

  function updateRequisition(input) {
    const target = requisition(input.requisitionId);
    return operation(input.operationId, input, () => {
      if (target.status !== 'PENDING') throw new AppError(409, 'REQUISITION_NOT_EDITABLE', 'แก้ไขได้เฉพาะคำขอที่รออนุมัติ');
      if (role !== 'admin' && target.createdBy !== actor) throw new AppError(403, 'REQUISITION_OWNER_REQUIRED', 'แก้ไขได้เฉพาะคำขอของตนเอง');
      if (Number(input.version) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      Object.assign(target, requisitionValues(input, target.fiscalYear), { updatedAt: now(), updatedBy: actor, version: target.version + 1 });
      return { requisition: clone(target) };
    });
  }

  function updateRequisitionNotes(input) {
    requireAdmin();
    const target = requisition(input.requisitionId);
    return operation(input.operationId, input, () => {
      if (Number(input.version) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      if (!Array.isArray(input.lines) || input.lines.length !== target.lines.length) throw new AppError(400, 'INVALID_REQUISITION_NOTE_LINES', 'รายการหมายเหตุไม่ตรงกับคำขอเบิก');
      const notes = new Map();
      for (const inputLine of input.lines) {
        const materialId = clean(inputLine.materialId, 'วัสดุ', 80);
        if (notes.has(materialId) || !target.lines.some(line => line.materialId === materialId)) throw new AppError(400, 'INVALID_REQUISITION_NOTE_LINES', 'รายการหมายเหตุไม่ตรงกับคำขอเบิก');
        notes.set(materialId, String(inputLine.note || '').trim().slice(0, 300));
      }
      target.note = String(input.note || '').trim().slice(0, 500);
      target.lines = target.lines.map(line => ({ ...line, note: notes.get(line.materialId) || '' }));
      target.updatedAt = now();
      target.updatedBy = actor;
      target.version += 1;
      return { requisition: clone(target) };
    });
  }

  function updateRequisitionAllocation(input) {
    requireAdmin();
    const target = requisition(input.requisitionId);
    return operation(input.operationId, input, () => {
      if (Number(input.version) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      if (!Array.isArray(input.lines) || input.lines.length !== target.lines.length) throw new AppError(400, 'INVALID_ALLOCATION_LINES', 'รายการจำนวนจ่ายไม่ตรงกับคำขอเบิก');
      const quantityEditable = ['PENDING', 'APPROVED'].includes(target.status);
      const inputByMaterial = new Map();
      for (const inputLine of input.lines) {
        const materialId = clean(inputLine.materialId, 'วัสดุ', 80);
        if (inputByMaterial.has(materialId) || !target.lines.some(line => line.materialId === materialId)) throw new AppError(400, 'INVALID_ALLOCATION_LINES', 'รายการจำนวนจ่ายไม่ตรงกับคำขอเบิก');
        inputByMaterial.set(materialId, inputLine);
      }
      const nextLines = target.lines.map(line => {
        const inputLine = inputByMaterial.get(line.materialId);
        let issueQuantity = line.issueQuantity;
        if (quantityEditable) {
          issueQuantity = Number(inputLine.issueQuantity);
          if (!Number.isSafeInteger(issueQuantity) || issueQuantity < 1) throw new AppError(400, 'INVALID_ISSUE_QUANTITY', 'จำนวนจ่ายต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป');
          if (issueQuantity > line.quantity) throw new AppError(400, 'ISSUE_QUANTITY_EXCEEDS_REQUEST', `${line.materialName} จ่ายได้ไม่เกินจำนวนที่ขอ ${line.quantity} ${line.unit}`);
          const stock = material(line.materialId);
          const previous = target.status === 'APPROVED' ? effectiveIssueQuantity(line) : 0;
          const availableForRequest = Math.max(0, stock.onHand - stock.reserved + previous);
          const maximumIssue = Math.max(0, Math.floor(availableForRequest - 1));
          if (issueQuantity > maximumIssue) throw new AppError(409, 'MINIMUM_STOCK_REQUIRED', `${stock.name} จ่ายได้สูงสุด ${maximumIssue} ${stock.unit} เพื่อให้เหลืออย่างน้อย 1 ${stock.unit}`);
        } else if (inputLine.issueQuantity !== '' && inputLine.issueQuantity != null && Number(inputLine.issueQuantity) !== Number(line.issueQuantity)) {
          throw new AppError(409, 'REQUISITION_ALLOCATION_LOCKED', 'จำนวนจ่ายแก้ไขไม่ได้หลังจ่ายหรือปิดคำขอแล้ว');
        }
        return { ...line, issueQuantity, note: String(inputLine.note || '').trim().slice(0, 300) };
      });
      if (target.status === 'APPROVED') nextLines.forEach((line, index) => {
        const delta = line.issueQuantity - effectiveIssueQuantity(target.lines[index]);
        if (delta) touchReserved(material(line.materialId), delta);
      });
      target.lines = nextLines;
      target.updatedAt = now();
      target.updatedBy = actor;
      target.version += 1;
      return { requisition: clone(target) };
    });
  }

  function approveRequisition(input) {
    requireAdmin();
    const target = requisition(input.requisitionId);
    return operation(input.operationId, input, () => {
      if (target.status !== 'PENDING') throw new AppError(409, 'REQUISITION_NOT_PENDING', 'คำขอนี้ไม่ได้อยู่ระหว่างรออนุมัติ');
      if (Number(input.version) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      const lines = buildApprovedRequisitionLines(target.lines, input.lines);
      lines.forEach(line => touchReserved(material(line.materialId), line.issueQuantity));
      target.lines = lines;
      target.status = 'APPROVED';
      target.approvedAt = now();
      target.approvedBy = actor;
      target.updatedAt = target.approvedAt;
      target.updatedBy = actor;
      target.version += 1;
      return { requisition: clone(target) };
    });
  }

  function rejectRequisition(input) {
    requireAdmin();
    const target = requisition(input.requisitionId);
    return operation(input.operationId, input, () => {
      if (target.status !== 'PENDING') throw new AppError(409, 'REQUISITION_NOT_PENDING', 'ไม่สามารถไม่อนุมัติคำขอนี้ได้');
      if (Number(input.version) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      target.status = 'REJECTED';
      target.rejectedAt = now();
      target.rejectedBy = actor;
      target.updatedAt = target.rejectedAt;
      target.updatedBy = actor;
      target.version += 1;
      return { requisition: clone(target) };
    });
  }

  function issueRequisition(input) {
    requireAdmin();
    const target = requisition(input.requisitionId);
    return operation(input.operationId, input, () => {
      if (target.status !== 'APPROVED') throw new AppError(409, 'REQUISITION_NOT_APPROVED', 'คำขอนี้ยังไม่พร้อมจ่าย');
      if (Number(input.version) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      if (target.fiscalYear !== activeFiscalYear().year) throw new AppError(409, 'FISCAL_YEAR_CLOSED', 'จ่ายวัสดุได้เฉพาะปีงบประมาณที่เปิดอยู่');
      const timestamp = now();
      const issuedMovements = target.lines.map(line => {
        const stock = material(line.materialId);
        const issueQuantity = effectiveIssueQuantity(line);
        if (stock.reserved < issueQuantity || stock.onHand < issueQuantity) throw new AppError(409, 'INSUFFICIENT_RESERVED_STOCK', `${stock.name} มียอดรอจ่ายหรือคงเหลือไม่เพียงพอ`);
        if (stock.onHand - issueQuantity < 1) throw new AppError(409, 'MINIMUM_STOCK_REQUIRED', `${stock.name} ต้องมีคงเหลืออย่างน้อย 1 ${stock.unit} หลังจ่าย`);
        touchReserved(stock, -issueQuantity);
        const entry = addMovement(stock, 'ISSUE', issueQuantity, 'REQUISITION', target.requestNo, `จ่ายตามคำขอเบิก ${target.requestNo}`, `${input.operationId}:${line.materialId}`, target.fiscalYear);
        const period = fiscalPeriod(stock.id, target.fiscalYear);
        updateFiscalPeriodFromMovement(period, 'ISSUE', issueQuantity, stock.onHand);
        return clone(entry);
      });
      target.status = 'ISSUED';
      target.issuedAt = timestamp;
      target.issuedBy = actor;
      target.updatedAt = timestamp;
      target.updatedBy = actor;
      target.version += 1;
      return { requisition: clone(target), movements: issuedMovements };
    });
  }

  function cancelRequisition(input) {
    const target = requisition(input.requisitionId);
    return operation(input.operationId, input, () => {
      if (!['PENDING', 'APPROVED'].includes(target.status)) throw new AppError(409, 'REQUISITION_NOT_CANCELLABLE', 'ไม่สามารถยกเลิกคำขอนี้ได้');
      if (role !== 'admin' && target.createdBy !== actor) throw new AppError(403, 'REQUISITION_OWNER_REQUIRED', 'ยกเลิกได้เฉพาะคำขอของตนเอง');
      if (Number(input.version) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      if (target.status === 'APPROVED') target.lines.forEach(line => touchReserved(material(line.materialId), -effectiveIssueQuantity(line)));
      target.status = 'CANCELLED';
      target.cancelledAt = now();
      target.cancelledBy = actor;
      target.updatedAt = target.cancelledAt;
      target.updatedBy = actor;
      target.version += 1;
      return { requisition: clone(target) };
    });
  }

  function annualValues(input) {
    const openingBalance = number(input.openingBalance ?? 0, 'คงเหลือยกมา');
    const receivedBeforeSystem = number(input.receivedBeforeSystem ?? 0, 'รับระหว่างปี');
    const issuedBeforeSystem = number(input.issuedBeforeSystem ?? 0, 'รวมจำนวนจ่าย');
    const cutoverBalance = number(input.cutoverBalance ?? (openingBalance + receivedBeforeSystem - issuedBeforeSystem), 'คงเหลือสิ้นปีงบประมาณ');
    const latestPrice = number(input.latestPrice ?? 0, 'ราคา/หน่วยล่าสุด');
    return {
      openingBalance,
      receivedBeforeSystem,
      issuedBeforeSystem,
      cutoverBalance,
      reportedTotalReceived: number(input.reportedTotalReceived ?? (openingBalance + receivedBeforeSystem), 'รวมจำนวนรับ'),
      latestPrice,
      reportedValue: number(Math.round((cutoverBalance * latestPrice + Number.EPSILON) * 100) / 100, 'ราคารวม'),
      note: String(input.note || '').trim(),
    };
  }

  function createAnnualMaterial(input) {
    return operation(input.operationId, input, () => {
      const year = activeFiscalYear();
      if (input.fiscalYear && Number(input.fiscalYear) !== year.year) throw new AppError(409, 'FISCAL_YEAR_CLOSED', 'เพิ่มข้อมูลได้เฉพาะปีงบประมาณที่เปิดอยู่');
      const name = clean(input.name, 'รายการวัสดุ');
      const unit = clean(input.unit, 'หน่วยนับ', 60);
      const categoryId = clean(input.categoryId || 'CAT-OFFICE', 'ประเภทวัสดุ', 80);
      const values = annualValues(input);
      category(categoryId);
      ensureUniqueName(name);
      const identity = nextMaterial(categoryId);
      const timestamp = now();
      const created = {
        ...identity,
        categoryId,
        name,
        unit,
        packDetail: '',
        latestPrice: values.latestPrice,
        note: values.note,
        onHand: 0,
        reserved: 0,
        reorderPoint: 0,
        active: true,
        createdAt: timestamp,
        createdBy: actor,
        updatedAt: timestamp,
        updatedBy: actor,
        version: 1,
      };
      materials.push(created);
      const period = createFiscalPeriod({
        materialId: created.id,
        materialCode: created.code,
        materialName: created.name,
        fiscalYear: year.year,
        ...values,
        source: 'MANUAL_ANNUAL',
        sourceReference: created.code,
      });
      if (values.cutoverBalance > 0) addMovement(created, 'CUTOVER', values.cutoverBalance, 'ANNUAL_REPORT', created.code, 'เพิ่มจากตารางรายงานประจำปี', input.operationId, year.year);
      return { material: clone(created), fiscalPeriod: clone(period) };
    });
  }

  function updateAnnualMaterial(input) {
    const target = material(input.materialId);
    return operation(input.operationId, input, () => {
      const year = activeFiscalYear();
      const period = fiscalPeriod(target.id, year.year);
      if (!period || period.deleted) throw new AppError(404, 'FISCAL_PERIOD_NOT_FOUND', 'ไม่พบรายการในปีงบประมาณนี้');
      if (Number(input.version) !== period.version || Number(input.materialVersion) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      const name = clean(input.name, 'รายการวัสดุ');
      const unit = clean(input.unit, 'หน่วยนับ', 60);
      const categoryId = clean(input.categoryId || target.categoryId, 'ประเภทวัสดุ', 80);
      const values = annualValues(input);
      category(categoryId);
      ensureUniqueName(name, target.id);
      const expectedBalance = Math.round((values.cutoverBalance + period.receivedInSystem - period.issuedInSystem + period.adjustmentIn - period.adjustmentOut) * 1000) / 1000;
      const delta = Math.round((expectedBalance - target.onHand) * 1000) / 1000;
      target.name = name;
      target.unit = unit;
      target.categoryId = categoryId;
      target.latestPrice = values.latestPrice;
      target.note = values.note;
      target.updatedAt = now();
      target.updatedBy = actor;
      target.version += 1;
      Object.assign(period, values, {
        materialCode: target.code,
        materialName: name,
        reconciliationAdjustment: Math.round((values.cutoverBalance - (values.openingBalance + values.receivedBeforeSystem - values.issuedBeforeSystem)) * 1000) / 1000,
        closingBalance: expectedBalance,
        updatedAt: now(),
        version: period.version + 1,
      });
      movements.forEach(entry => {
        if (entry.materialId === target.id) entry.materialName = name;
      });
      if (delta !== 0) addMovement(target, 'SOURCE_CORRECTION', delta, 'ANNUAL_REPORT', target.code, 'แก้ไขข้อมูลตารางรายงานประจำปี', input.operationId, year.year);
      return { material: clone(target), fiscalPeriod: clone(period) };
    });
  }

  function deleteAnnualMaterial(input) {
    const target = material(input.materialId);
    return operation(input.operationId, input, () => {
      const year = activeFiscalYear();
      const period = fiscalPeriod(target.id, year.year);
      if (!period || period.deleted) throw new AppError(404, 'FISCAL_PERIOD_NOT_FOUND', 'ไม่พบรายการในปีงบประมาณนี้');
      if (Number(input.version) !== period.version || Number(input.materialVersion) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      const timestamp = now();
      period.deleted = true;
      period.deletedAt = timestamp;
      period.deletedBy = actor;
      period.updatedAt = timestamp;
      period.version += 1;
      target.active = false;
      target.updatedAt = timestamp;
      target.updatedBy = actor;
      target.version += 1;
      addMovement(target, 'VOID', 0, 'ANNUAL_REPORT', target.code, 'ลบรายการออกจากตารางรายงานประจำปี', input.operationId, year.year);
      return { material: clone(target), fiscalPeriod: clone(period) };
    });
  }

  function closeFiscalYear(input) {
    return operation(input.operationId, input, () => {
      const target = fiscalYear(input.fiscalYear);
      if (target.status !== 'OPEN') throw new AppError(409, 'FISCAL_YEAR_CLOSED', 'ปีงบประมาณนี้ปิดแล้ว');
      if (Number(input.version) !== target.version) throw new AppError(409, 'VERSION_CONFLICT', 'ข้อมูลปีงบประมาณถูกแก้ไขแล้ว กรุณาโหลดใหม่');
      if (Number(input.confirmYear) !== target.year) throw new AppError(400, 'CONFIRMATION_MISMATCH', 'กรุณายืนยันปีงบประมาณให้ถูกต้อง');
      const openRequisitions = requisitions.filter(item => item.fiscalYear === target.year && ['PENDING', 'APPROVED'].includes(item.status)).length;
      if (openRequisitions) throw new AppError(409, 'OPEN_REQUISITIONS', `ยังมีคำขอเบิกที่ต้องดำเนินการ ${openRequisitions} รายการ`);
      const nextYearValue = target.year + 1;
      if (fiscalYears.some(item => item.year === nextYearValue)) throw new AppError(409, 'NEXT_FISCAL_YEAR_EXISTS', 'ปีงบประมาณถัดไปมีอยู่แล้ว');
      const timestamp = now();
      target.status = 'CLOSED';
      target.closedAt = timestamp;
      target.closedBy = actor;
      target.version += 1;
      const nextYear = buildFiscalYear(nextYearValue);
      fiscalYears.push(nextYear);
      const periodsToCarry = fiscalPeriods.filter(period => period.fiscalYear === target.year && !period.deleted);
      periodsToCarry.forEach(previousPeriod => {
        const item = material(previousPeriod.materialId);
        if (!item.active) return;
        previousPeriod.closingBalance = item.onHand;
        createFiscalPeriod({
          materialId: item.id,
          materialCode: item.code,
          materialName: item.name,
          fiscalYear: nextYearValue,
          openingBalance: item.onHand,
          cutoverBalance: item.onHand,
          latestPrice: item.latestPrice,
          source: 'CARRY_FORWARD',
          sourceReference: target.id,
        });
        addMovement(item, 'CARRY_FORWARD', 0, 'FISCAL_YEAR', target.id, `ยกยอดจากปีงบประมาณ ${target.year}`, `${input.operationId}:${item.id}`, nextYearValue);
      });
      return { closedFiscalYear: clone(target), openedFiscalYear: clone(nextYear) };
    });
  }

  reset();
  if (options.file && fs.existsSync(options.file)) restore(JSON.parse(fs.readFileSync(options.file, 'utf8')));
  return { snapshot, approveReview, rejectReview, createMaterial, updateMaterial, createAnnualMaterial, updateAnnualMaterial, deleteAnnualMaterial, recordStock, createRequisition, updateRequisition, updateRequisitionAllocation, updateRequisitionNotes, approveRequisition, rejectRequisition, issueRequisition, cancelRequisition, closeFiscalYear, reset: () => { const before = checkpoint(); try { const result = reset(); persist(); return result; } catch (error) { restore(before); throw error; } } };
}
