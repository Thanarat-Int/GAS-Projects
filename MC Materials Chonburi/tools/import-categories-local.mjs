// Explicit category allowlist, preserve running data and make reruns safe.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadMaterialSeed } from '../local/store.mjs';
const selected = process.argv.slice(2);
assert.ok(selected.length && selected.every(id => ['CAT-HOUSEKEEPING', 'CAT-PRINTED', 'CAT-IT', 'CAT-MEDSUP-5', 'CAT-MEDSUP'].includes(id)));
const seed = loadMaterialSeed(fileURLToPath(new URL('../SeedData.gs', import.meta.url)));
const expected = seed.reviews.filter(row => selected.includes(row[4]));
async function api(route, payload) {
  const response = await fetch(`http://127.0.0.1:4176${route}`, payload ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  } : {});
  const result = await response.json();
  assert.ok(response.ok && result.ok, JSON.stringify(result));
  return result.data;
}
const before = await api('/api/state');
const rows = before.reviews.filter(row => selected.includes(row.categoryId));
assert.equal(rows.length, expected.length);
assert.ok(rows.every(row => ['PENDING', 'APPROVED'].includes(row.status)), 'Previously rejected record requires review');
const pending = rows.filter(row => row.status === 'PENDING');
for (const row of pending) {
  const original = expected.find(item => item[0] === row.id);
  assert.ok(original);
  assert.deepEqual([row.opening, row.received, row.sourceTotal, row.issued, row.proposedBalance, row.latestPrice, row.sourceValue], original.slice(9, 16));
  assert.equal(row.proposedName, original[7]);
  assert.equal(row.proposedUnit, original[8]);
}
for (const row of pending) {
  await api('/api/reviews/approve', {
    reviewId: row.id, version: row.version, name: row.proposedName, unit: row.proposedUnit,
    categoryId: row.categoryId, openingBalance: row.proposedBalance, reorderPoint: 0,
    note: row.issues.some(issue => issue.includes('CONFLICT')) ? 'คงตัวเลขตาม Excel ต้นฉบับ มีผลรวมไม่สอดคล้องกัน' : '',
    operationId: `category-excel-2569:${row.id}`,
  });
}
const after = await api('/api/state');
for (const key of ['materials', 'reviews', 'fiscalPeriods', 'movements', 'fiscalYears']) {
  for (const item of before[key]) {
    if (key === 'reviews' && pending.some(row => row.id === item.id)) continue;
    assert.deepEqual(after[key].find(other => other.id === item.id), item, `${key}/${item.id} changed`);
  }
}
for (const row of pending) {
  const review = after.reviews.find(item => item.id === row.id);
  const material = after.materials.find(item => item.id === review.materialId);
  const period = after.fiscalPeriods.find(item => item.sourceReference === row.id);
  assert.equal(review.status, 'APPROVED');
  assert.equal(material.name, row.proposedName.replace(/\s+/g, ' '));
  assert.equal(material.unit, row.proposedUnit);
  assert.deepEqual([period.openingBalance, period.receivedBeforeSystem, period.reportedTotalReceived,
    period.issuedBeforeSystem, period.closingBalance, period.latestPrice, period.reportedValue],
  [row.opening, row.received, row.sourceTotal, row.issued, row.proposedBalance, row.latestPrice, Math.round(row.sourceValue * 1000) / 1000]);
}
console.log(JSON.stringify({imported: pending.length, totalMaterials: after.materials.length, pending: after.stats.pendingReviews, existingDataPreserved: true}));
