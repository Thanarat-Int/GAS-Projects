import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, createMaterialStore, loadMaterialSeed } from '../local/store.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const seed = loadMaterialSeed(path.join(root, 'SeedData.gs'));
const store = createMaterialStore(seed);
const a4 = store.snapshot().materials.find(item => item.name === 'กระดาษถ่ายเอกสาร A4');
const base = {
  requestDate: '2026-09-13',
  requesterName: 'ผู้ขอทดสอบ',
  department: 'บริหาร',
  note: '',
  lines: [{ materialId: a4.id, quantity: 12 }],
};

const created = store.createRequisition({ ...base, operationId: 'req-create-1' });
assert.match(created.requisition.requestNo, /^REQ-2569-\d{4}$/);
assert.equal(created.requisition.status, 'PENDING');
assert.deepEqual(store.snapshot().requisitionDepartments, ['บริหาร', 'วิชาการ']);
assert.equal(store.snapshot().materials.find(item => item.id === a4.id).reserved, 0, 'pending requests must not reserve stock');
assert.deepEqual(store.createRequisition({ ...base, operationId: 'req-create-1' }), created, 'request creation must be idempotent');

const updated = store.updateRequisition({ ...base, requisitionId: created.requisition.id, version: created.requisition.version, lines: [{ materialId: a4.id, quantity: 10 }], operationId: 'req-update-1' });
assert.equal(updated.requisition.lines[0].quantity, 10);
assert.equal(updated.requisition.version, 2);

const approved = store.approveRequisition({
  requisitionId: created.requisition.id,
  version: updated.requisition.version,
  lines: [{ materialId: a4.id, issueQuantity: 8, note: 'จ่ายตามยอดคงเหลือที่ตรวจสอบแล้ว' }],
  operationId: 'req-approve-1',
});
assert.equal(approved.requisition.status, 'APPROVED');
assert.equal(approved.requisition.lines[0].quantity, 10);
assert.equal(approved.requisition.lines[0].issueQuantity, 8);
assert.equal(approved.requisition.lines[0].note, 'จ่ายตามยอดคงเหลือที่ตรวจสอบแล้ว');
let state = store.snapshot();
assert.equal(state.materials.find(item => item.id === a4.id).reserved, 8);
assert.equal(state.materials.find(item => item.id === a4.id).available, 72);
assert.throws(
  () => store.createRequisition({ ...base, lines: [{ materialId: a4.id, quantity: 72 }], operationId: 'req-over-stock' }),
  error => error instanceof AppError && error.code === 'MINIMUM_STOCK_REQUIRED',
);
for (const quantity of [0, 0.5, 1.5, -1, '1.5']) {
  assert.throws(
    () => store.createRequisition({ ...base, lines: [{ materialId: a4.id, quantity }], operationId: `req-invalid-quantity-${quantity}` }),
    error => error instanceof AppError && error.code === 'INVALID_REQUISITION_QUANTITY',
    `quantity ${quantity} must be rejected`,
  );
}
for (const department of ['น้องนสพ.', 'ฝ่ายอื่น']) {
  assert.throws(
    () => store.createRequisition({ ...base, department, lines: [{ materialId: a4.id, quantity: 1 }], operationId: `req-invalid-department-${department}` }),
    error => error instanceof AppError && error.code === 'INVALID_REQUISITION_DEPARTMENT',
    `department ${department} must be rejected`,
  );
}
const emptyMaterial = store.snapshot().materials.find(item => item.onHand <= 1);
assert.throws(
  () => store.createRequisition({ ...base, lines: [{ materialId: emptyMaterial.id, quantity: 1 }], operationId: 'req-empty-stock' }),
  error => error instanceof AppError && error.code === 'STOCK_NOT_ISSUABLE',
);

const floorStore = createMaterialStore(seed);
const floorMaterial = floorStore.snapshot().materials.find(item => item.name === 'กระดาษถ่ายเอกสาร A4');
const maximumIssue = floorMaterial.available - 1;
const floorRequest = floorStore.createRequisition({ ...base, lines: [{ materialId: floorMaterial.id, quantity: maximumIssue }], operationId: 'req-floor-create' }).requisition;
const floorApproved = floorStore.approveRequisition({ requisitionId: floorRequest.id, version: floorRequest.version, lines: [{ materialId: floorMaterial.id, issueQuantity: maximumIssue, note: '' }], operationId: 'req-floor-approve' }).requisition;
floorStore.issueRequisition({ requisitionId: floorRequest.id, version: floorApproved.version, operationId: 'req-floor-issue' });
assert.equal(floorStore.snapshot().materials.find(item => item.id === floorMaterial.id).onHand, 1, 'issuing the maximum quantity must preserve one unit');
assert.throws(
  () => floorStore.createRequisition({ ...base, lines: [{ materialId: floorMaterial.id, quantity: 1 }], operationId: 'req-after-floor' }),
  error => error instanceof AppError && error.code === 'STOCK_NOT_ISSUABLE',
);

const issued = store.issueRequisition({ requisitionId: created.requisition.id, version: approved.requisition.version, operationId: 'req-issue-1' });
assert.equal(issued.requisition.status, 'ISSUED');
assert.equal(issued.movements.length, 1);
assert.equal(issued.movements[0].type, 'ISSUE');
assert.equal(issued.movements[0].referenceNo, created.requisition.requestNo);
state = store.snapshot();
assert.equal(state.materials.find(item => item.id === a4.id).onHand, 72);
assert.equal(state.materials.find(item => item.id === a4.id).reserved, 0);
assert.equal(state.fiscalPeriods.find(item => item.materialId === a4.id && item.fiscalYear === 2569).issuedInSystem, 8);
const issuedStockBeforeNotes = state.materials.find(item => item.id === a4.id);
const issuedWithNotes = store.updateRequisitionNotes({
  requisitionId: issued.requisition.id,
  version: issued.requisition.version,
  note: 'ใช้สำหรับงานเอกสารส่วนกลาง',
  lines: [{ materialId: a4.id, note: 'จัดส่งครบแล้ว' }],
  operationId: 'req-issued-notes',
}).requisition;
assert.equal(issuedWithNotes.status, 'ISSUED');
assert.equal(issuedWithNotes.note, 'ใช้สำหรับงานเอกสารส่วนกลาง');
assert.equal(issuedWithNotes.lines[0].note, 'จัดส่งครบแล้ว');
assert.equal(issuedWithNotes.lines[0].quantity, 10);
assert.equal(issuedWithNotes.lines[0].issueQuantity, 8);
assert.deepEqual(store.snapshot().materials.find(item => item.id === a4.id), issuedStockBeforeNotes, 'editing notes must not mutate stock');

const approvalStore = createMaterialStore(seed);
const approvalMaterial = approvalStore.snapshot().materials.find(item => item.name === 'กระดาษถ่ายเอกสาร A4');
const approvalRequest = approvalStore.createRequisition({ ...base, lines: [{ materialId: approvalMaterial.id, quantity: 5 }], operationId: 'approval-validation-create' }).requisition;
for (const issueQuantity of [0, 1.5, 6]) {
  assert.throws(
    () => approvalStore.approveRequisition({ requisitionId: approvalRequest.id, version: approvalRequest.version, lines: [{ materialId: approvalMaterial.id, issueQuantity, note: '' }], operationId: `approval-invalid-${issueQuantity}` }),
    error => error instanceof AppError && ['INVALID_ISSUE_QUANTITY', 'ISSUE_QUANTITY_EXCEEDS_REQUEST'].includes(error.code),
    `approved issue quantity ${issueQuantity} must be rejected`,
  );
}
assert.throws(
  () => approvalStore.approveRequisition({ requisitionId: approvalRequest.id, version: approvalRequest.version, lines: [], operationId: 'approval-missing-lines' }),
  error => error instanceof AppError && error.code === 'INVALID_APPROVAL_LINES',
);

const allocationStore = createMaterialStore(seed);
const allocationMaterial = allocationStore.snapshot().materials.find(item => item.name === 'กระดาษถ่ายเอกสาร A4');
const allocationRequest = allocationStore.createRequisition({ ...base, lines: [{ materialId: allocationMaterial.id, quantity: 20 }], operationId: 'allocation-create' }).requisition;
const pendingAllocation = allocationStore.updateRequisitionAllocation({
  requisitionId: allocationRequest.id,
  version: allocationRequest.version,
  lines: [{ materialId: allocationMaterial.id, issueQuantity: 10, note: 'อนุมัติให้บางส่วน' }],
  operationId: 'allocation-pending-save',
}).requisition;
assert.equal(pendingAllocation.lines[0].quantity, 20);
assert.equal(pendingAllocation.lines[0].issueQuantity, 10);
assert.equal(pendingAllocation.lines[0].note, 'อนุมัติให้บางส่วน');
assert.equal(allocationStore.snapshot().materials.find(item => item.id === allocationMaterial.id).reserved, 0, 'saving a pending allocation must not reserve stock');
const allocationApproved = allocationStore.approveRequisition({
  requisitionId: allocationRequest.id,
  version: pendingAllocation.version,
  lines: [{ materialId: allocationMaterial.id, issueQuantity: pendingAllocation.lines[0].issueQuantity, note: pendingAllocation.lines[0].note }],
  operationId: 'allocation-approve',
}).requisition;
assert.equal(allocationStore.snapshot().materials.find(item => item.id === allocationMaterial.id).reserved, 10);
const allocationReduced = allocationStore.updateRequisitionAllocation({
  requisitionId: allocationRequest.id,
  version: allocationApproved.version,
  lines: [{ materialId: allocationMaterial.id, issueQuantity: 6, note: 'ปรับลดตามของที่มี' }],
  operationId: 'allocation-reduce',
}).requisition;
assert.equal(allocationReduced.lines[0].issueQuantity, 6);
assert.equal(allocationStore.snapshot().materials.find(item => item.id === allocationMaterial.id).reserved, 6, 'reducing an approved allocation must release reserved stock');
const allocationIncreased = allocationStore.updateRequisitionAllocation({
  requisitionId: allocationRequest.id,
  version: allocationReduced.version,
  lines: [{ materialId: allocationMaterial.id, issueQuantity: 9, note: 'เพิ่มจำนวนหลังตรวจสต็อก' }],
  operationId: 'allocation-increase',
}).requisition;
assert.equal(allocationIncreased.lines[0].issueQuantity, 9);
assert.equal(allocationStore.snapshot().materials.find(item => item.id === allocationMaterial.id).reserved, 9, 'increasing an approved allocation must reserve only the delta');
assert.throws(
  () => allocationStore.updateRequisitionAllocation({ requisitionId: allocationRequest.id, version: allocationIncreased.version, lines: [{ materialId: allocationMaterial.id, issueQuantity: 21, note: '' }], operationId: 'allocation-over-request' }),
  error => error instanceof AppError && error.code === 'ISSUE_QUANTITY_EXCEEDS_REQUEST',
);
const allocationIssued = allocationStore.issueRequisition({ requisitionId: allocationRequest.id, version: allocationIncreased.version, operationId: 'allocation-issue' }).requisition;
assert.throws(
  () => allocationStore.updateRequisitionAllocation({ requisitionId: allocationRequest.id, version: allocationIssued.version, lines: [{ materialId: allocationMaterial.id, issueQuantity: 8, note: '' }], operationId: 'allocation-issued-change' }),
  error => error instanceof AppError && error.code === 'REQUISITION_ALLOCATION_LOCKED',
);
const issuedAllocationNote = allocationStore.updateRequisitionAllocation({
  requisitionId: allocationRequest.id,
  version: allocationIssued.version,
  lines: [{ materialId: allocationMaterial.id, issueQuantity: '', note: 'บันทึกหลังจ่าย' }],
  operationId: 'allocation-issued-note',
}).requisition;
assert.equal(issuedAllocationNote.lines[0].issueQuantity, 9);
assert.equal(issuedAllocationNote.lines[0].note, 'บันทึกหลังจ่าย');

const rejected = store.createRequisition({ ...base, lines: [{ materialId: a4.id, quantity: 1 }], operationId: 'req-create-reject' }).requisition;
const rejectedResult = store.rejectRequisition({ requisitionId: rejected.id, version: rejected.version, operationId: 'req-reject' }).requisition;
assert.equal(rejectedResult.status, 'REJECTED');
assert.equal(store.updateRequisitionNotes({ requisitionId: rejectedResult.id, version: rejectedResult.version, note: 'บันทึกหลังไม่อนุมัติ', lines: [{ materialId: a4.id, note: 'ข้อมูลประกอบ' }], operationId: 'req-rejected-notes' }).requisition.status, 'REJECTED');
assert.throws(
  () => store.updateRequisitionNotes({ requisitionId: rejectedResult.id, version: rejectedResult.version + 1, note: '', lines: [], operationId: 'req-invalid-note-lines' }),
  error => error instanceof AppError && error.code === 'INVALID_REQUISITION_NOTE_LINES',
);

const cancellable = store.createRequisition({ ...base, lines: [{ materialId: a4.id, quantity: 2 }], operationId: 'req-create-cancel' }).requisition;
const reserved = store.approveRequisition({ requisitionId: cancellable.id, version: cancellable.version, lines: [{ materialId: a4.id, issueQuantity: 1, note: 'จ่ายบางส่วน' }], operationId: 'req-approve-cancel' }).requisition;
assert.equal(store.snapshot().materials.find(item => item.id === a4.id).reserved, 1);
assert.equal(store.cancelRequisition({ requisitionId: reserved.id, version: reserved.version, operationId: 'req-cancel' }).requisition.status, 'CANCELLED');
assert.equal(store.snapshot().materials.find(item => item.id === a4.id).reserved, 0, 'cancelling an approved request must release stock');

const duplicatePayload = { ...base, lines: [{ materialId: a4.id, quantity: 1 }, { materialId: a4.id, quantity: 1 }], operationId: 'req-duplicate-line' };
assert.throws(() => store.createRequisition(duplicatePayload), error => error instanceof AppError && error.code === 'DUPLICATE_REQUISITION_LINE');
assert.throws(() => store.createRequisition({ ...base, requestDate: '2025-09-30', operationId: 'req-wrong-year' }), error => error instanceof AppError && error.code === 'REQUISITION_DATE_OUTSIDE_FISCAL_YEAR');

const blocking = store.createRequisition({ ...base, lines: [{ materialId: a4.id, quantity: 1 }], operationId: 'req-create-block' }).requisition;
assert.throws(
  () => store.closeFiscalYear({ fiscalYear: 2569, version: 1, confirmYear: 2569, operationId: 'close-with-request' }),
  error => error instanceof AppError && error.code === 'OPEN_REQUISITIONS',
);
store.cancelRequisition({ requisitionId: blocking.id, version: blocking.version, operationId: 'req-cancel-block' });

const userStore = createMaterialStore(seed, { role: 'user', actor: 'user@local.test' });
const userMaterial = userStore.snapshot().materials.find(item => item.name === 'กระดาษถ่ายเอกสาร A4');
const userRequest = userStore.createRequisition({ ...base, lines: [{ materialId: userMaterial.id, quantity: 1 }], operationId: 'user-request' }).requisition;
assert.throws(() => userStore.approveRequisition({ requisitionId: userRequest.id, version: userRequest.version, operationId: 'user-approve' }), error => error instanceof AppError && error.code === 'ADMIN_REQUIRED');
assert.throws(() => userStore.updateRequisitionNotes({ requisitionId: userRequest.id, version: userRequest.version, note: '', lines: [{ materialId: userMaterial.id, note: '' }], operationId: 'user-notes' }), error => error instanceof AppError && error.code === 'ADMIN_REQUIRED');
assert.throws(() => userStore.updateRequisitionAllocation({ requisitionId: userRequest.id, version: userRequest.version, lines: [{ materialId: userMaterial.id, issueQuantity: 1, note: '' }], operationId: 'user-allocation' }), error => error instanceof AppError && error.code === 'ADMIN_REQUIRED');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'requisition-store-'));
try {
  const file = path.join(directory, 'materials.json');
  const persistent = createMaterialStore(seed, { file });
  const material = persistent.snapshot().materials.find(item => item.name === 'กระดาษถ่ายเอกสาร A4');
  persistent.createRequisition({ ...base, lines: [{ materialId: material.id, quantity: 1 }], operationId: 'persistent-request' });
  const restarted = createMaterialStore(seed, { file });
  assert.equal(restarted.snapshot().requisitions.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).schemaVersion, 2);

  const legacy = JSON.parse(fs.readFileSync(file, 'utf8'));
  legacy.schemaVersion = 1;
  delete legacy.requisitions;
  delete legacy.requisitionSequence;
  fs.writeFileSync(file, JSON.stringify(legacy));
  assert.deepEqual(createMaterialStore(seed, { file }).snapshot().requisitions, [], 'version 1 checkpoints must migrate without data loss in existing collections');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('PASS requisitions: departments, stock rules, admin allocations, reservation deltas, approval, issue, notes, permissions, persistence and fiscal guards are consistent.');
