import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, createMaterialStore, loadMaterialSeed } from '../local/store.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const seed = loadMaterialSeed(path.join(root, 'SeedData.gs'));
const importedState = createMaterialStore(seed).snapshot();
const persistenceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'material-checkpoint-'));
try {
  const file = path.join(persistenceDirectory, 'materials.json');
  const persistent = createMaterialStore(seed, { file });
  const original = persistent.snapshot().materials[0];
  const payload = { ...original, materialId: original.id, operationId: 'persistence-update-001', packDetail: 'Keep user changes across server upgrades' };
  const result = persistent.updateMaterial(payload);
  const restarted = createMaterialStore(seed, { file });
  assert.deepEqual(restarted.snapshot(), persistent.snapshot());
  assert.deepEqual(restarted.updateMaterial(payload), result, 'idempotency survives restart');
  const before = restarted.snapshot();
  assert.throws(() => restarted.updateMaterial({ ...payload, operationId: 'persistence-invalid-001', name: '' }));
  assert.deepEqual(restarted.snapshot(), before);
  assert.deepEqual(createMaterialStore(seed, { file }).snapshot(), before);
} finally { fs.rmSync(persistenceDirectory, { recursive: true, force: true }); }
assert.equal(importedState.materials.length, 134);
assert.equal(Object.hasOwn(importedState.stats, 'pendingReviews'), false);
assert.equal(Object.hasOwn(importedState, 'reviews'), false);
const expectedCounts = { 'CAT-OFFICE': 62, 'CAT-MEDICAL': 28, 'CAT-HOUSEKEEPING': 28, 'CAT-PRINTED': 4, 'CAT-IT': 1, 'CAT-MEDSUP-5': 6, 'CAT-MEDSUP': 5 };
for (const [categoryId, count] of Object.entries(expectedCounts)) {
  assert.equal(importedState.materials.filter(item => item.categoryId === categoryId).length, count);
}
for (const material of importedState.materials) assert.ok(importedState.fiscalPeriods.some(item => item.materialId === material.id && item.fiscalYear === 2569));
const store = createMaterialStore(seed);

let state = store.snapshot();
assert.equal(state.categories.length, 8);
assert.deepEqual(
  state.categories.find(item => item.id === 'CAT-CHULA'),
  { id: 'CAT-CHULA', code: 'CHU', nameTh: 'วัสดุจุฬา', nameEn: 'Chula supplies', order: 80, active: true },
);
assert.equal(Object.hasOwn(state, 'reviews'), false);
assert.equal(state.materials.length, 134);
assert.equal(state.fiscalPeriods.filter(item => item.fiscalYear === 2569 && !item.deleted).length, 134);
assert.equal(state.activeFiscalYear, 2569);
assert.deepEqual(state.fiscalYears.map(item => [item.year, item.startDate, item.endDate, item.status]), [[2569, '2025-10-01', '2026-09-30', 'OPEN']]);

const medical = state.materials.filter(item => item.categoryId === 'CAT-MEDICAL');
assert.deepEqual(medical.map(item => item.code), Array.from({ length: 28 }, (_, i) => `MED-${String(i + 1).padStart(4, '0')}`));
const medicalPeriods = state.fiscalPeriods.filter(item => medical.some(material => material.id === item.materialId));
assert.equal(Math.round(medicalPeriods.reduce((sum, item) => sum + item.reportedValue, 0) * 100), 905210);
assert.equal(medical.filter(item => item.onHand > 0).length, 4);
assert.equal(medical.find(item => item.name === 'MASK (KN-95)').latestPrice, 0, 'preserve source zero price');

const a4 = state.materials.find(item => item.name === 'กระดาษถ่ายเอกสาร A4');
const a4Period = state.fiscalPeriods.find(item => item.materialId === a4.id && item.fiscalYear === 2569);
assert.deepEqual(
  Object.fromEntries(['openingBalance', 'receivedBeforeSystem', 'reportedTotalReceived', 'issuedBeforeSystem', 'cutoverBalance', 'closingBalance', 'latestPrice', 'reportedValue'].map(key => [key, a4Period[key]])),
  { openingBalance: 15, receivedBeforeSystem: 365, reportedTotalReceived: 380, issuedBeforeSystem: 300, cutoverBalance: 80, closingBalance: 80, latestPrice: 71.69, reportedValue: 5735.2 },
);

const annualInput = {
  fiscalYear: 2569, categoryId: 'CAT-OFFICE', name: 'วัสดุทดสอบงานประจำปี', unit: 'อัน', openingBalance: 2,
  receivedBeforeSystem: 3, reportedTotalReceived: 5, issuedBeforeSystem: 1, cutoverBalance: 4,
  latestPrice: 10, reportedValue: 9999, note: 'ทดสอบ', operationId: 'annual-create',
};
const annualCreated = store.createAnnualMaterial(annualInput);
assert.equal(annualCreated.material.onHand, 4);
assert.equal(annualCreated.fiscalPeriod.reportedValue, 40, 'server must calculate total instead of trusting submitted value');
assert.equal(store.createAnnualMaterial(annualInput).material.id, annualCreated.material.id, 'annual create must be idempotent');

const annualUpdated = store.updateAnnualMaterial({
  materialId: annualCreated.material.id, fiscalYear: 2569, version: annualCreated.fiscalPeriod.version,
  materialVersion: annualCreated.material.version, categoryId: 'CAT-OFFICE', name: 'วัสดุทดสอบงานประจำปี แก้ไข', unit: 'กล่อง',
  openingBalance: 2, receivedBeforeSystem: 4, reportedTotalReceived: 6, issuedBeforeSystem: 1, cutoverBalance: 5,
  latestPrice: 12.345, reportedValue: 9999, note: 'แก้ไขแล้ว', operationId: 'annual-update',
});
assert.equal(annualUpdated.material.onHand, 5);
assert.equal(annualUpdated.fiscalPeriod.reportedTotalReceived, 6);
assert.equal(annualUpdated.fiscalPeriod.reportedValue, 61.73, 'edited totals must be calculated and rounded to two decimals');

const annualDeleted = store.deleteAnnualMaterial({
  materialId: annualCreated.material.id, fiscalYear: 2569, version: annualUpdated.fiscalPeriod.version,
  materialVersion: annualUpdated.material.version, operationId: 'annual-delete',
});
assert.equal(annualDeleted.material.active, false);
assert.equal(annualDeleted.fiscalPeriod.deleted, true);
assert.ok(store.snapshot().movements.some(item => item.materialId === annualCreated.material.id && item.type === 'VOID'));

const receipt = store.recordStock({
  materialId: a4.id, type: 'RECEIPT', quantity: 10, referenceType: 'PURCHASE', referenceNo: 'PO-001', note: '', operationId: 'stock-1',
});
assert.equal(receipt.material.onHand, 90);
state = store.snapshot();
assert.equal(state.fiscalPeriods.find(item => item.materialId === a4.id && item.fiscalYear === 2569).receivedInSystem, 10);
assert.equal(state.fiscalPeriods.find(item => item.materialId === a4.id && item.fiscalYear === 2569).closingBalance, 90);

assert.throws(
  () => store.recordStock({ materialId: a4.id, type: 'ADJUST_OUT', quantity: 91, referenceType: 'COUNT', referenceNo: 'COUNT-1', operationId: 'stock-2' }),
  error => error instanceof AppError && error.code === 'INSUFFICIENT_STOCK',
);

const beforeInvalidEdit = store.snapshot().materials.find(item => item.id === a4.id);
assert.throws(
  () => store.updateMaterial({ ...beforeInvalidEdit, materialId: beforeInvalidEdit.id, categoryId: 'UNKNOWN', active: true, version: beforeInvalidEdit.version, operationId: 'edit-invalid-category' }),
  error => error instanceof AppError && error.code === 'CATEGORY_NOT_FOUND',
);
assert.deepEqual(store.snapshot().materials.find(item => item.id === a4.id), beforeInvalidEdit, 'failed edits must not partially mutate data');

state = store.snapshot();
const conflictPeriod = state.fiscalPeriods.find(item => item.reconciliationAdjustment !== 0);
assert.equal(
  conflictPeriod.openingBalance + conflictPeriod.receivedBeforeSystem - conflictPeriod.issuedBeforeSystem + conflictPeriod.reconciliationAdjustment,
  conflictPeriod.closingBalance,
  'source conflicts must reconcile explicitly without changing the reported closing balance',
);

assert.throws(
  () => store.closeFiscalYear({ fiscalYear: 2569, version: 1, confirmYear: 2570, operationId: 'close-wrong-confirmation' }),
  error => error instanceof AppError && error.code === 'CONFIRMATION_MISMATCH',
);
const closed = store.closeFiscalYear({ fiscalYear: 2569, version: 1, confirmYear: 2569, operationId: 'close-2569' });
assert.equal(closed.closedFiscalYear.status, 'CLOSED');
assert.equal(closed.openedFiscalYear.year, 2570);
state = store.snapshot();
assert.equal(state.activeFiscalYear, 2570);
const carriedA4 = state.fiscalPeriods.find(item => item.materialId === a4.id && item.fiscalYear === 2570);
assert.deepEqual(
  [carriedA4.openingBalance, carriedA4.receivedBeforeSystem, carriedA4.issuedBeforeSystem, carriedA4.closingBalance, carriedA4.latestPrice, carriedA4.reportedValue, carriedA4.source],
  [90, 0, 0, 90, 71.69, 6452.1, 'CARRY_FORWARD'],
  'next-year opening must equal the actual closing stock without counting it as a new receipt',
);
assert.equal(state.fiscalPeriods.filter(item => item.fiscalYear === 2570).length, state.fiscalPeriods.filter(item => item.fiscalYear === 2569 && !item.deleted && state.materials.find(material => material.id === item.materialId)?.active).length);
assert.equal(state.materials.find(item => item.id === a4.id).onHand, 90, 'carrying stock forward must not change physical stock');
assert.equal(state.movements[0].type, 'CARRY_FORWARD');
assert.equal(state.movements[0].fiscalYear, 2570);
assert.equal(state.movements[0].change, 0, 'carry-forward must not be recorded as a receipt');
assert.throws(
  () => store.recordStock({ materialId: a4.id, fiscalYear: 2569, type: 'RECEIPT', quantity: 1, referenceType: 'PURCHASE', referenceNo: 'PO-CLOSED', operationId: 'stock-closed-year' }),
  error => error instanceof AppError && error.code === 'FISCAL_YEAR_CLOSED',
);
store.recordStock({ materialId: a4.id, fiscalYear: 2570, type: 'RECEIPT', quantity: 5, referenceType: 'PURCHASE', referenceNo: 'PO-2570', operationId: 'receipt-2570' });
const closedAgain = store.closeFiscalYear({ fiscalYear: 2570, version: 1, confirmYear: 2570, operationId: 'close-2570' });
assert.equal(closedAgain.openedFiscalYear.year, 2571);
state = store.snapshot();
const carriedAgain = state.fiscalPeriods.find(item => item.materialId === a4.id && item.fiscalYear === 2571);
assert.equal(carriedAgain.openingBalance, 95, 'each new year starts from the prior year closing stock');
assert.equal(carriedAgain.receivedBeforeSystem, 0, 'prior-year receipts must not be counted again');
assert.equal(state.fiscalPeriods.find(item => item.materialId === a4.id && item.fiscalYear === 2570).receivedInSystem, 5);
assert.equal(state.materials.find(item => item.id === a4.id).onHand, 95);

store.reset();
state = store.snapshot();
assert.equal(Object.hasOwn(state.stats, 'pendingReviews'), false);
assert.equal(state.materials.length, 134);
assert.equal(state.fiscalPeriods.filter(item => !item.deleted).length, 134);
assert.ok(state.movements.length > 0);

console.log('PASS local admin store: all migrated materials, annual CRUD, fiscal ledger and guards are consistent.');
