import assert from 'node:assert/strict';
import { displayDate, parseDisplayDate, parseThaiDate, dateField } from '../web/dates.js';

assert.equal(displayDate('2026-01-01'), '1 มกราคม 2569');
assert.equal(displayDate('2026-01-01', 'en'), '1 January 2026');
assert.equal(displayDate('2025-10-01'), '1 ตุลาคม 2568');
assert.equal(parseDisplayDate('1 มกราคม 2569'), '2026-01-01');
assert.equal(parseDisplayDate('1 January 2026', 'en'), '2026-01-01');
assert.equal(parseThaiDate('01/01/2569'), '2026-01-01');
assert.equal(parseDisplayDate('31 กุมภาพันธ์ 2569'), '');
assert.match(dateField('requestDate', 'วันที่ขอเบิก', '2026-01-01', 'required', 'field'), /value="1 มกราคม 2569"/);

console.log('PASS dates: full month names and Buddhist-era dates round-trip through the form.');
