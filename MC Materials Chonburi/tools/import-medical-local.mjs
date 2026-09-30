// Import only pending medical records into the running local server, without reset.
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:4176';
async function request(route, payload) {
  const response = await fetch(`${base}${route}`, payload ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  } : {});
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(JSON.stringify(result));
  return result.data;
}
const before = await request('/api/state');
const rows = before.reviews.filter(row => row.categoryId === 'CAT-MEDICAL');
assert.equal(rows.length, 28);
assert.ok(rows.every(row => ['PENDING', 'APPROVED'].includes(row.status)), 'Resolve previously rejected medical rows first');
const pending = rows.filter(row => row.status === 'PENDING');
assert.ok(pending.every(row => !row.issues.some(issue => ['SOURCE_TOTAL_CONFLICT', 'SOURCE_BALANCE_CONFLICT', 'SOURCE_VALUE_CONFLICT', 'NEGATIVE_BALANCE'].includes(issue))));
for (const row of pending) {
  await request('/api/reviews/approve', {
    reviewId: row.id, version: row.version, name: row.proposedName, unit: row.proposedUnit,
    categoryId: row.categoryId, openingBalance: row.proposedBalance, reorderPoint: 0,
    packDetail: '', note: '', operationId: `medical-excel-2569:${row.id}`,
  });
}
const after = await request('/api/state');
for (const key of ['materials', 'reviews', 'fiscalPeriods', 'movements', 'fiscalYears']) {
  for (const item of before[key]) {
    if (key === 'reviews' && pending.some(row => row.id === item.id)) continue;
    assert.deepEqual(after[key].find(candidate => candidate.id === item.id), item, `Unexpected change in ${key}/${item.id}`);
  }
}
assert.equal(after.reviews.filter(row => row.categoryId === 'CAT-MEDICAL' && row.status === 'APPROVED').length, 28);
for (const row of pending) {
  const imported = after.reviews.find(item => item.id === row.id);
  const material = after.materials.find(item => item.id === imported.materialId);
  const period = after.fiscalPeriods.find(item => item.sourceReference === row.id);
  assert.equal(material.name, row.proposedName);
  assert.equal(material.unit, row.proposedUnit);
  assert.deepEqual([period.openingBalance, period.receivedBeforeSystem, period.reportedTotalReceived,
    period.issuedBeforeSystem, period.closingBalance, period.latestPrice, period.reportedValue],
  [row.opening, row.received, row.sourceTotal, row.issued, row.proposedBalance, row.latestPrice, Math.round(row.sourceValue * 1000) / 1000]);
}
console.log(JSON.stringify({ imported: pending.length, medical: 28, materials: after.materials.length,
  pendingOtherCategories: after.stats.pendingReviews, existingDataPreserved: true }));
