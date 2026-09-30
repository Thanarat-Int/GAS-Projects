import assert from 'node:assert/strict';
import { inkData } from '../web/ink-data.js';
import { filterInkRows, inkFiscalYears, inkGroupKey, inkYearRange, inkTotalFooter } from '../web/ink.js';

assert.deepEqual(inkData.purchaseColumns, ['ลำดับ', 'รายการ', 'จำนวน', 'ราคาต่อหน่วย', 'ราคารวม']);
assert.deepEqual(inkData.withdrawalColumns, ['วันที่', 'ฝ่าย', 'รายการเบิก', 'จำนวนเบิก']);
assert.equal(inkData.groups.reduce((sum, group) => sum + group.rows.length, 0), 32);
assert.deepEqual(inkData.groups.map(group => group.total), [48760, 91000, 114900]);
assert.equal(inkData.withdrawals.length, 36);
assert.equal(inkData.withdrawals.reduce((sum, row) => sum + row.cells[3], 0), 35);
assert.equal(inkData.balances.length, 14);
assert.equal(inkData.stockTotal, 137160);
assert.equal(inkData.balances.reduce((sum, row) => sum + row.cells[4], 0), inkData.stockTotal);
for (const group of inkData.groups) {
  assert.equal(group.rows.reduce((sum, row) => sum + row.cells[4], 0), group.total);
}
const mergedChild = inkData.withdrawals.find(row => row.sourceRow === 4);
assert.deepEqual(mergedChild.cells.slice(0, 2), ['12/02/2568', 'วิชาการ']);
assert.equal(mergedChild.dateISO, '2025-02-12');
assert.equal(inkData.withdrawals.find(row => row.sourceRow === 13).year, 2569);
assert.equal(inkData.withdrawals.find(row => row.sourceRow === 37).cells[3], 0);
assert.equal(filterInkRows(inkData.withdrawals, { year: '2568' }).length, 10);
assert.equal(filterInkRows(inkData.withdrawals, { year: '2569' }).length, 26);
assert.equal(filterInkRows(inkData.withdrawals, { department: 'บริหาร' }).length, 4);
assert.equal(filterInkRows(inkData.balances, { query: 'tn-451' }).length, 4);
assert.equal(filterInkRows(inkData.balances, { query: 'not-a-real-model' }).length, 0);
assert.equal(filterInkRows(inkData.balances, { query: '   ' }).length, 14);
assert.deepEqual(inkFiscalYears(), [2568, 2569]);
assert.equal(inkYearRange(), '2568-2569');
assert.equal(inkTotalFooter(5, 'มูลค่าคงคลัง', 137160, true), '<tfoot><tr><td colspan="3"></td><th scope="row">มูลค่าคงคลัง</th><td>137,160.00</td></tr></tfoot>');
assert.match(inkTotalFooter(5, 'รวมทั้งสิ้น', 48760), /<th colspan="4"/);
assert.equal(inkTotalFooter(4, '', 0), '');
assert.deepEqual(inkFiscalYears({ groups: [...inkData.groups, { year: 2570 }], withdrawals: inkData.withdrawals }), [2568, 2569, 2570]);
assert.notEqual(inkGroupKey({ year: 2569, id: '1' }), inkGroupKey({ year: 2570, id: '1' }));
console.log('PASS ink: source columns, all rows, merged dates, Buddhist years, totals, zero quantities and filters.');
