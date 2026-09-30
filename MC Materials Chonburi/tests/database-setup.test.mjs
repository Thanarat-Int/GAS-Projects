import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class MockRange {
  constructor(sheet, row, column, rows = 1, columns = 1) {
    this.sheet = sheet; this.row = row; this.column = column; this.rows = rows; this.columns = columns;
  }
  setValues(values) {
    for (let r = 0; r < this.rows; r += 1) {
      const target = this.sheet.values[this.row - 1 + r] ||= [];
      for (let c = 0; c < this.columns; c += 1) target[this.column - 1 + c] = values[r][c];
    }
    return this;
  }
  setValue(value) { return this.setValues([[value]]); }
  getValues() {
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) =>
      this.sheet.values[this.row - 1 + r]?.[this.column - 1 + c] ?? ''
    ));
  }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValues() { return this.getValues().map(row => row.map(value => value instanceof Date ? value.toISOString() : String(value))); }
  clearContent() {
    for (let r = 0; r < this.rows; r += 1) for (let c = 0; c < this.columns; c += 1) {
      const target = this.sheet.values[this.row - 1 + r] ||= [];
      target[this.column - 1 + c] = '';
    }
    return this;
  }
  setBackground() { return this; } setFontColor() { return this; } setFontWeight() { return this; }
  setHorizontalAlignment() { return this; } setVerticalAlignment() { return this; }
  setNumberFormat() { return this; } setWrap() { return this; }
  createFilter() { this.sheet.filter = { remove: () => { this.sheet.filter = null; } }; return this.sheet.filter; }
}
class MockSheet {
  constructor(name) { this.name = name; this.values = []; this.hidden = false; this.filter = null; }
  getName() { return this.name; } setName(name) { this.name = name; return this; }
  getLastRow() {
    let last = 0;
    this.values.forEach((row, index) => { if (row.some(value => value !== '' && value != null)) last = index + 1; });
    return last;
  }
  getLastColumn() { return this.values.reduce((max, row) => Math.max(max, row.length), 0); }
  getRange(row, column, rows = 1, columns = 1) { return new MockRange(this, row, column, rows, columns); }
  appendRow(row) { this.values.push(row); return this; }
  deleteRows(row, count) { this.values.splice(row - 1, count); }
  setFrozenRows() {} setFrozenColumns() {} setHiddenGridlines() {} setTabColor() {} setRowHeight() {} setColumnWidth() {}
  getFilter() { return this.filter; } isSheetHidden() { return this.hidden; } hideSheet() { this.hidden = true; }
}
class MockSpreadsheet {
  constructor() { this.sheets = [new MockSheet('ชีต1')]; }
  getSheetByName(name) { return this.sheets.find(sheet => sheet.name === name) || null; }
  getSheets() { return this.sheets; }
  insertSheet(name) { const sheet = new MockSheet(name); this.sheets.push(sheet); return sheet; }
  setActiveSheet(sheet) { this.active = sheet; } getName() { return 'Project-Material (ศูนย์แพทย์)'; } getId() { return 'test-sheet-id'; }
}
const spreadsheet = new MockSpreadsheet();
const lock = { tryLock: () => true, releaseLock: () => {} };
const scriptProperties = new Map();
const userCache = new Map();
const context = {
  Object, JSON, Math, Date, String, Number, Error, console,
  SpreadsheetApp: { openById: () => spreadsheet, flush: () => {} },
  Session: {
    getActiveUser: () => ({ getEmail: () => 'admin@example.com' }),
    getEffectiveUser: () => ({ getEmail: () => 'admin@example.com' }),
  },
  LockService: { getScriptLock: () => lock },
  CacheService: { getScriptCache: () => ({
    get: key => userCache.get(key) || null,
    put: (key, value) => { userCache.set(key, value); },
    remove: key => { userCache.delete(key); },
  }) },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: key => scriptProperties.get(key) || null,
    setProperty: (key, value) => { scriptProperties.set(key, value); },
  }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    getUuid: () => '00000000-0000-4000-8000-000000000001',
    formatDate: (value, _timezone, pattern) => pattern === 'yyyy-MM-dd' ? value.toISOString().slice(0, 10) : value.toISOString(),
    computeDigest: (_algorithm, value) => [...Buffer.from(String(value).padEnd(32, '0').slice(0, 32))].map(value => value > 127 ? value - 256 : value),
  },
  Logger: { log: () => {} },
};
vm.createContext(context);
for (const file of ['Config.gs', 'Schema.gs', 'SeedData.gs', 'InkSeedData.gs', 'Setup.gs', 'AdminData.gs', 'AdminActions.gs', 'AdminBulkImport.gs', 'AdminInkMigration.gs', 'AdminInk.gs']) {
  vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
}

assert.equal(context.MATERIAL_CONFIG.SPREADSHEET_ID, 'PASTE_SPREADSHEET_ID_HERE');
assert.equal(context.MATERIAL_CATEGORY_SEED.length, 8);
assert.deepEqual(
  Array.from(context.MATERIAL_CATEGORY_SEED.find(row => row[0] === 'CAT-CHULA')),
  ['CAT-CHULA', 'CHU', 'วัสดุจุฬา', 'Chula supplies', 80],
);
assert.equal(context.MATERIAL_IMPORT_SEED.length, 134);
assert.equal(new Set(context.MATERIAL_IMPORT_SEED.map(row => row[1])).size, 134);
assert.equal(context.MATERIAL_IMPORT_SEED.every(row => row.length === context.MATERIAL_SCHEMA.importReview.length - 1), true);
assert.equal(context.MATERIAL_IMPORT_SEED.every(row => row[5] && row[8] && row[13] >= 0 && row[17] === 'PENDING'), true);
assert.equal(context.MATERIAL_SCHEMA.materials.includes('คงเหลือจริง'), true);
assert.equal(context.MATERIAL_SCHEMA.materials.includes('จำนวนรอจ่าย'), true);
assert.equal(context.MATERIAL_SCHEMA.materials.includes('URL รูปภาพ'), true);
assert.equal(context.MATERIAL_SCHEMA.requisitions.includes('วัตถุประสงค์การเบิก'), true);
assert.equal(context.MATERIAL_SCHEMA.requisitionLines.includes('หมายเหตุต่อรายการ'), true);
assert.equal(context.MATERIAL_SCHEMA.inkDocuments.includes('ประเภทเอกสาร'), true);
assert.equal(context.MATERIAL_SCHEMA.fiscalPeriods.includes('คงเหลือปลายงวด'), true);

const issueCount = code => context.MATERIAL_IMPORT_SEED.filter(row => String(row[16]).split('|').includes(code)).length;
assert.equal(issueCount('SOURCE_TOTAL_CONFLICT'), 16);
assert.equal(issueCount('SOURCE_BALANCE_CONFLICT'), 2);
assert.equal(issueCount('SOURCE_VALUE_CONFLICT'), 1);
assert.equal(issueCount('OPENING_TEXT'), 4);
assert.equal(issueCount('MISSING_PRICE'), 7);

assert.equal(context.MATERIAL_TRANSACTION_TYPES.includes('OPENING'), true);
assert.equal(context.MATERIAL_TRANSACTION_TYPES.includes('ISSUE'), true);
assert.equal(new Set(context.MATERIAL_SHEET_DEFINITIONS.map(item => item.name)).size, 19);

const first = context.setupMaterialDatabase();
assert.equal(first.categories, 8);
assert.equal(first.added.categories, 8);
assert.equal(first.importRows, 134);
assert.equal(first.counts.materials, 134);
assert.equal(first.counts.fiscalPeriods, 134);
assert.equal(first.counts.ledger, 60);
assert.equal(first.counts.inkProducts, 14);
assert.equal(first.counts.inkDocuments > 3, true);
assert.equal(first.counts.inkDocumentLines, 68);
assert.equal(first.reviewStatus.PENDING, 0);
assert.equal(first.reviewStatus.APPROVED, 134);
assert.equal(spreadsheet.sheets.length, 19);
assert.equal(spreadsheet.getSheetByName('_System').hidden, true);
assert.equal(spreadsheet.getSheetByName('ประวัติระบบ').hidden, true);
assert.equal(spreadsheet.getSheetByName('รหัสกันบันทึกซ้ำ').hidden, true);
assert.equal(spreadsheet.getSheetByName('ตรวจนำเข้า').hidden, true);
assert.equal(scriptProperties.has('USER_ACCESS_CODE_SHA256'), true);

const systemSheet = spreadsheet.getSheetByName('_System');
const sequenceRow = systemSheet.values.findIndex(row => row[0] === 'MATERIAL_SEQUENCE');
systemSheet.values[sequenceRow][1] = '191';
const second = context.setupMaterialDatabase();
assert.equal(second.importRows, 134);
assert.equal(second.categories, 8);
assert.equal(second.added.categories, 0, 'setup rerun must not duplicate categories');
assert.equal(systemSheet.values[sequenceRow][1], '191');
assert.equal(second.counts.materials, 134);
assert.equal(second.counts.inkDocumentLines, 68);
assert.equal(spreadsheet.getSheetByName('ประวัติระบบ').getLastRow(), 2);
assert.equal(context.validateMaterialDatabase().sourceSha256, context.MATERIAL_SEED_META.sourceSha256);

const adminState = context.adminMaterialSnapshot_();
assert.equal(adminState.app.mode, 'GOOGLE_APPS_SCRIPT');
context.Session.getActiveUser = () => ({ getEmail: () => 'visitor@example.com' });
assert.throws(() => context.adminMaterialSnapshot_(), /ไม่มีสิทธิ์/, 'effective deployer identity must not authorize a visitor');
context.Session.getActiveUser = () => ({ getEmail: () => 'admin@example.com' });
assert.equal(adminState.activeFiscalYear, 2569);
assert.equal(adminState.materials.length, 134);
assert.equal(adminState.fiscalPeriods.length, 134);
assert.equal(Object.hasOwn(adminState, 'reviews'), false);
assert.equal(adminState.requisitionDepartments.join(','), 'บริหาร,วิชาการ');
const adminInkState = context.adminInkSnapshot_();
assert.equal(adminInkState.products.length, 14);
assert.equal(adminInkState.groups.length > 1, true);
assert.equal(adminInkState.balances.length, 14);
const inkMigrationPreview = context.previewInkMigration();
assert.deepEqual(
  [inkMigrationPreview.products, inkMigrationPreview.documents, inkMigrationPreview.documentLines, inkMigrationPreview.reasons],
  [14, 13, 68, 2],
);
assert.deepEqual(
  [inkMigrationPreview.missingProducts, inkMigrationPreview.missingDocuments, inkMigrationPreview.missingLines, inkMigrationPreview.missingReasons],
  [0, 0, 0, 0],
);
const inkMigration = context.migrateAllInkData();
assert.equal(inkMigration.migrated, true);
assert.equal(inkMigration.rowsAdded, 0);
assert.equal(context.migrateAllInkData().rowsAdded, 0, 'ink migration rerun must be idempotent');

const issuable = adminState.materials.find(item => item.onHand >= 3 && item.active);
assert.ok(issuable, 'seed must include one issuable material');
const beforeIssue = issuable.onHand;
const createdRequisition = context.adminCreateRequisition_({
  operationId: 'test-req-create-0001', requestDate: '2025-10-01', requesterName: 'ผู้ทดสอบ', department: 'บริหาร', note: 'ทดสอบ',
  lines: [{ materialId: issuable.id, quantity: 1 }],
});
assert.equal(createdRequisition.requisition.status, 'PENDING');
const requestId = createdRequisition.requisition.id;
context.adminApproveRequisition_({
  operationId: 'test-req-approve-0001', requisitionId: requestId, version: 1,
  lines: [{ materialId: issuable.id, issueQuantity: 1, note: 'อนุมัติทดสอบ' }],
});
let approvedState = context.adminMaterialSnapshot_();
assert.equal(approvedState.requisitions.find(item => item.id === requestId).status, 'APPROVED');
assert.equal(approvedState.materials.find(item => item.id === issuable.id).reserved, 1);
context.adminIssueRequisition_({ operationId: 'test-req-issue-0001', requisitionId: requestId, version: 2 });
const issuedState = context.adminMaterialSnapshot_();
assert.equal(issuedState.requisitions.find(item => item.id === requestId).status, 'ISSUED');
assert.equal(issuedState.materials.find(item => item.id === issuable.id).reserved, 0);
assert.equal(issuedState.materials.find(item => item.id === issuable.id).onHand, beforeIssue - 1);

const multiMaterials = issuedState.materials.filter(item => item.active && item.available >= 3).slice(0, 2);
assert.equal(multiMaterials.length, 2);
const twoLineRequest = context.adminCreateRequisition_({
  operationId: 'test-req-create-two-0001', requestDate: '2025-10-01', requesterName: 'ผู้ทดสอบ', department: 'บริหาร',
  lines: multiMaterials.map(item => ({ materialId: item.id, quantity: 1 })),
});
const reservedBeforeFailure = multiMaterials.map(item => context.adminMaterialSnapshot_().materials.find(row => row.id === item.id).reserved);
assert.throws(() => context.adminApproveRequisition_({
  operationId: 'test-req-approve-invalid-0001', requisitionId: twoLineRequest.requisition.id, version: 1,
  lines: [{ materialId: multiMaterials[0].id, issueQuantity: 1 }, { materialId: multiMaterials[1].id, issueQuantity: 2 }],
}), /จำนวนจ่ายมากกว่าจำนวนที่ขอ/);
assert.deepEqual(multiMaterials.map(item => context.adminMaterialSnapshot_().materials.find(row => row.id === item.id).reserved), reservedBeforeFailure);

const inkBefore = context.adminInkSnapshot_();
const inkTarget = inkBefore.products[0];
const inkQuantityBefore = inkTarget.onHand;
const inkPurchase = context.adminInkCommit_({
  operationId: 'test-ink-purchase-0001', revision: inkBefore.revision,
  date: '2025-10-02', baselineDate: '2025-10-01', confirmBaseline: true, note: 'ทดสอบรับหมึก',
  lines: [{ productId: inkTarget.id, quantity: 1, unitPrice: inkTarget.unitPrice || 100 }],
}, 'PURCHASE');
assert.match(inkPurchase.id, /^INK-PUR-/);
assert.equal(inkPurchase.state.products.find(item => item.id === inkTarget.id).onHand, inkQuantityBefore + 1);
assert.equal(inkPurchase.state.revision, inkBefore.revision + 1);
const productsBeforeInvalidInk = context.adminInkSnapshot_().products.length;
assert.throws(() => context.adminInkCommit_({
  operationId: 'test-ink-invalid-lines-0001', revision: inkPurchase.state.revision,
  date: '2025-10-03', lines: [
    { newProductName: 'รุ่นทดสอบไม่ควรถูกสร้าง', quantity: 1, unitPrice: 100 },
    { productId: inkTarget.id, quantity: 0, unitPrice: 100 },
  ],
}, 'PURCHASE'), /จำนวนต้องเป็นจำนวนเต็ม/);
assert.equal(context.adminInkSnapshot_().products.length, productsBeforeInvalidInk);
assert.equal(context.adminInkSnapshot_().revision, inkPurchase.state.revision);

const importedPurchase = inkPurchase.state.groups.find(group => group.rows.some(row => row.editKey?.startsWith('source-purchase:')));
assert.ok(importedPurchase);
const sourcePurchaseRow = importedPurchase.rows.find(row => row.editKey?.startsWith('source-purchase:'));
const sourcePurchaseBefore = sourcePurchaseRow.cells[2];
const sourcePurchaseUpdate = context.adminInkCommit_({
  operationId: 'test-ink-source-purchase-0001', revision: inkPurchase.state.revision,
  key: sourcePurchaseRow.editKey, action: 'UPDATE', reason: 'ตรวจแก้ประวัติ',
  name: sourcePurchaseRow.cells[1], quantity: sourcePurchaseBefore + 1, unitPrice: sourcePurchaseRow.cells[3],
}, 'CHANGE');
assert.equal(sourcePurchaseUpdate.state.groups.flatMap(group => group.rows).find(row => row.editKey === sourcePurchaseRow.editKey).cells[2], sourcePurchaseBefore + 1);
assert.equal(sourcePurchaseUpdate.state.products.find(item => item.id === inkTarget.id).onHand, inkQuantityBefore + 1);

const stockCorrection = context.adminInkCommit_({
  operationId: 'test-ink-stock-correct-0001', revision: sourcePurchaseUpdate.state.revision,
  key: 'stock:' + inkTarget.id, action: 'UPDATE', reason: 'ตรวจนับของจริง',
  name: inkTarget.name, quantity: inkQuantityBefore + 3, unitPrice: inkTarget.unitPrice || 100,
}, 'CHANGE');
assert.equal(stockCorrection.state.products.find(item => item.id === inkTarget.id).onHand, inkQuantityBefore + 3);
const recalculateAfterCorrection = context.adminInkCommit_({
  operationId: 'test-ink-edit-document-0001', revision: stockCorrection.state.revision,
  key: 'transaction:' + inkPurchase.id, action: 'UPDATE', reason: 'แก้หมายเหตุ',
  date: '2025-10-02', note: 'แก้หมายเหตุทดสอบ',
  lines: [{ productId: inkTarget.id, quantity: 1, unitPrice: inkTarget.unitPrice || 100 }],
}, 'CHANGE');
assert.equal(recalculateAfterCorrection.state.products.find(item => item.id === inkTarget.id).onHand, inkQuantityBefore + 3);

const importedWithdrawal = recalculateAfterCorrection.state.withdrawals.find(row => row.editKey?.startsWith('source-withdrawal:'));
assert.ok(importedWithdrawal);
const otherImportedWithdrawal = recalculateAfterCorrection.state.withdrawals.find(row => row.id === importedWithdrawal.id && row.editKey !== importedWithdrawal.editKey);
const originalOtherDepartment = otherImportedWithdrawal?.cells[1];
const sourceWithdrawalUpdate = context.adminInkCommit_({
  operationId: 'test-ink-source-withdraw-0001', revision: recalculateAfterCorrection.state.revision,
  key: importedWithdrawal.editKey, action: 'UPDATE', reason: 'แก้ฝ่ายในประวัติ',
  name: importedWithdrawal.cells[2], quantity: importedWithdrawal.cells[3],
  date: importedWithdrawal.dateISO, department: 'วิชาการ',
}, 'CHANGE');
assert.equal(sourceWithdrawalUpdate.state.withdrawals.find(row => row.editKey === importedWithdrawal.editKey).cells[1], 'วิชาการ');
if (otherImportedWithdrawal) assert.equal(sourceWithdrawalUpdate.state.withdrawals.find(row => row.editKey === otherImportedWithdrawal.editKey).cells[1], originalOtherDepartment);

for (const file of ['UserConfig.gs', 'UserData.gs', 'UserRequests.gs', 'UserWeb.gs']) {
  vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
}
context.USER_CONFIG = { ...context.USER_CONFIG, SPREADSHEET_ID: 'test-sheet-id' };
assert.equal(context.userApi({ method: 'GET', path: '/api/public/state' }).status, 401);
assert.equal(context.userApi({ method: 'POST', path: '/api/public/access', body: JSON.stringify({ code: 'wrong' }) }).status, 401);
const unlock = context.userApi({ method: 'POST', path: '/api/public/access', body: JSON.stringify({ code: 'CHANGE_ME' }) });
assert.equal(unlock.ok, true);
const token = unlock.data.token;
const userState = context.userApi({ method: 'GET', path: '/api/public/state', token });
assert.equal(userState.ok, true);
assert.equal(userState.data.activeFiscalYear, 2569);
assert.deepEqual([...userState.data.requisitionDepartments], ['บริหาร', 'วิชาการ']);
assert.equal(userState.data.materials.every(item => item.available >= 0), true);
const publicMaterial = userState.data.materials.find(item => item.available >= 3);
assert.ok(publicMaterial);
const userPayload = {
  operationId: 'user-test-operation-0001', requestDate: '2025-10-02', requesterName: 'ผู้เบิกทดสอบ',
  department: 'วิชาการ', note: 'ใช้ในการเรียนการสอน', lines: [{ materialId: publicMaterial.id, quantity: 1 }],
};
const userCreate = context.userApi({ method: 'POST', path: '/api/public/requisitions/create', token, body: JSON.stringify(userPayload) });
assert.equal(userCreate.ok, true);
assert.match(userCreate.data.requisition.requestNo, /^REQ-2569-U[A-F0-9]{16}$/);
assert.equal(context.adminMaterialSnapshot_().requisitions.find(item => item.id === userCreate.data.requisition.requestNo).status, 'PENDING');
const userRetry = context.userApi({ method: 'POST', path: '/api/public/requisitions/create', token, body: JSON.stringify(userPayload) });
assert.equal(userRetry.data.requisition.requestNo, userCreate.data.requisition.requestNo);
assert.equal(context.adminMaterialSnapshot_().requisitions.filter(item => item.id === userCreate.data.requisition.requestNo).length, 1);
assert.equal(context.userApi({ method: 'POST', path: '/api/public/requisitions/create', token, body: JSON.stringify({ ...userPayload, operationId: 'user-test-operation-0002', lines: [{ materialId: publicMaterial.id, quantity: 0 }] }) }).status, 400);
assert.equal(context.userApi({ method: 'POST', path: '/api/public/requisitions/create', token, body: JSON.stringify({ ...userPayload, operationId: 'user-test-operation-0003', requesterName: '=IMPORTXML("x")' }) }).status, 400);
assert.equal(context.userApi({ method: 'POST', path: '/api/requisitions/approve', token, body: '{}' }).status, 404);
context.adminApproveRequisition_({
  operationId: 'test-approve-user-request-0001', requisitionId: userCreate.data.requisition.requestNo,
  version: 1, lines: [{ materialId: publicMaterial.id, issueQuantity: 1 }],
});
assert.equal(context.adminMaterialSnapshot_().requisitions.find(item => item.id === userCreate.data.requisition.requestNo).status, 'APPROVED');
const afterUserApproval = context.userApi({ method: 'GET', path: '/api/public/state', token });
assert.equal(afterUserApproval.data.materials.find(item => item.id === publicMaterial.id).available, publicMaterial.available - 1);

const legacyMaterials = new MockSheet('วัสดุเดิม');
legacyMaterials.values = [[
  'รหัสวัสดุ', 'รหัสแสดง', 'รหัสประเภท', 'ชื่อวัสดุ', 'หน่วยนับ',
  'รายละเอียดบรรจุ', 'คงเหลือจริง', 'จำนวนจอง', 'จุดแจ้งเตือน',
  'ใช้งาน', 'สร้างเมื่อ', 'สร้างโดย', 'แก้ไขเมื่อ', 'แก้ไขโดย', 'เวอร์ชัน'
], ['MAT-LEGACY', 'OFF-9999', 'CAT-OFFICE', 'รายการเดิม', 'อัน', '', 2, 0, 0, true, '', '', '', '', 1]];
context.materialAssertOrCreateHeader_(legacyMaterials, context.MATERIAL_SCHEMA.materials);
context.materialFillBlankColumn_(legacyMaterials, 16, 0);
assert.equal(legacyMaterials.values[0][7], 'จำนวนรอจ่าย');
assert.equal(legacyMaterials.values[0].length, context.MATERIAL_SCHEMA.materials.length);
assert.equal(legacyMaterials.values[1][0], 'MAT-LEGACY', 'schema upgrade must preserve existing rows');
assert.equal(legacyMaterials.values[1][15], 0, 'new numeric columns receive a safe default');

let backupCopies = 0;
context.DriveApp = { getFileById: () => ({ makeCopy: () => ({ getId: () => `backup-${++backupCopies}` }) }) };
context.Logger = { log: () => {} };
const partialPreview = context.previewMaterialBulkImport();
assert.equal(partialPreview.ok, true);
assert.equal(partialPreview.pending, 0);
assert.equal(partialPreview.materialsToCreate, 0);
const partialImport = context.importPendingMaterialReviews();
assert.equal(partialImport.pending, 0);
assert.equal(partialImport.materialsToCreate, 0);
assert.equal(context.adminMaterialSnapshot_().materials.length, 134);
assert.equal(context.importPendingMaterialReviews().pending, 0, 'rerun must not import rows twice');
assert.equal(context.finishMaterialMigration().migrationSheetHidden, true);
assert.equal(backupCopies, 0, 'completed setup needs no additional migration backup');

for (const name of [context.MATERIAL_SHEETS.MATERIALS, context.MATERIAL_SHEETS.FISCAL_PERIODS, context.MATERIAL_SHEETS.LEDGER]) {
  const sheet = spreadsheet.getSheetByName(name);
  sheet.values = sheet.values.slice(0, 1);
}
const reviewSheet = spreadsheet.getSheetByName(context.MATERIAL_SHEETS.IMPORT_REVIEW);
reviewSheet.values.slice(1).forEach(row => {
  row[17] = 'PENDING'; row[18] = ''; row[19] = ''; row[20] = ''; row[21] = ''; row[22] = ''; row[23] = 1;
});
systemSheet.values.find(row => row[0] === 'MATERIAL_SEQUENCE')[1] = '0';
systemSheet.values.find(row => row[0] === 'LEDGER_SEQUENCE')[1] = '0';
systemSheet.values = systemSheet.values.filter(row => row[0] !== 'BULK_IMPORT_BACKUP_ID');
const materialSheet = spreadsheet.getSheetByName(context.MATERIAL_SHEETS.MATERIALS);
const placeholderMaterialRow = Array(context.MATERIAL_SCHEMA.materials.length).fill('');
placeholderMaterialRow[9] = false;
placeholderMaterialRow[14] = 1;
materialSheet.appendRow(placeholderMaterialRow);
const fullPreview = context.previewMaterialBulkImport();
assert.equal(fullPreview.ok, true);
assert.equal(fullPreview.pending, 134);
assert.equal(fullPreview.materialsToCreate, 134);
assert.equal(fullPreview.ignoredPlaceholderRows, 1);
const periodSheet = spreadsheet.getSheetByName(context.MATERIAL_SHEETS.FISCAL_PERIODS);
const originalPeriodRange = periodSheet.getRange.bind(periodSheet);
periodSheet.getRange = (...args) => {
  const range = originalPeriodRange(...args);
  if (args[0] > 1) range.setValues = () => { throw new Error('simulated period write failure'); };
  return range;
};
assert.throws(() => context.importPendingMaterialReviews(), /simulated period write failure/);
periodSheet.getRange = originalPeriodRange;
const retryPreview = context.previewMaterialBulkImport();
assert.equal(retryPreview.ok, true);
assert.equal(retryPreview.pending, 134);
assert.equal(retryPreview.materialsToCreate, 0, 'retry must recognize material rows from partial write');
assert.equal(retryPreview.existingMaterialsToResume, 134);
const fullImport = context.importPendingMaterialReviews();
assert.equal(fullImport.approved, 134);
assert.equal(fullImport.materialsCreated, 0);
assert.equal(fullImport.resumed, 134);
assert.equal(fullImport.pendingAfter, 0);
assert.equal(backupCopies, 1);
assert.equal(context.adminMaterialSnapshot_().materials.length, 134);
assert.equal(context.adminMaterialSnapshot_().fiscalPeriods.length, 134);
assert.equal(reviewSheet.values.slice(1).filter(row => row[17] === 'PENDING').length, 0);
assert.equal(new Set(context.adminMaterialSnapshot_().materials.map(item => item.code)).size, 134);
const incompleteMaterialRow = Array(context.MATERIAL_SCHEMA.materials.length).fill('');
incompleteMaterialRow[3] = 'วัสดุไม่มีรหัส';
materialSheet.appendRow(incompleteMaterialRow);
const incompletePreview = context.previewMaterialBulkImport();
assert.equal(incompletePreview.ok, false);
assert.match(incompletePreview.blockers.join(' '), /ชีทวัสดุแถว \d+ มีข้อมูลแต่รหัสวัสดุว่าง/);
assert.equal(incompletePreview.materialRowsWithoutIds[0].name, 'วัสดุไม่มีรหัส');
assert.throws(() => context.importPendingMaterialReviews(), /BULK_IMPORT_BLOCKED/);
assert.equal(backupCopies, 1, 'invalid rows must stop before another backup or write');

console.log('PASS database setup: complete schema, production seeds, safe legacy upgrade, audit flags and idempotent rerun are consistent.');
