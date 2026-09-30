import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

assert.match(source, /const REQUISITION_PAGE_SIZE = 10;/);
assert.match(source, /isAdmin && \['APPROVED', 'ISSUED'\]\.includes\(item\.status\)/);
assert.match(source, /paginate\(rows, state\.requisitionPage, REQUISITION_PAGE_SIZE\)/);
assert.match(source, /renderPagination\('#requisitionPagination', rows\.length, page, 'requisitionPage', REQUISITION_PAGE_SIZE\)/);
assert.doesNotMatch(source, /isAdmin && !\['REJECTED', 'CANCELLED'\]\.includes\(item\.status\)/);
assert.match(source, /วัตถุประสงค์การเบิก/);
assert.match(source, /data-approval-quantity/);
assert.match(source, /data-approval-note/);
assert.match(source, /issueQuantity: line\.querySelector\('\[data-approval-quantity\]'\)\.value/);
assert.match(source, /data-detail-issue-quantity/);
assert.match(source, /data-detail-note/);
assert.match(source, /\/api\/requisitions\/update-allocation/);
assert.match(source, /line\.issueQuantity \?\? line\.quantity/);
assert.match(source, /data-requisition-notes/);
assert.match(source, /\/api\/requisitions\/update-notes/);
assert.match(source, /function requisitionMaterialIdentity\(line\)/);
assert.match(source, /requisitionMaterialIdentity\(line\)/);
assert.match(source, /แก้ไขได้เฉพาะวัตถุประสงค์และหมายเหตุต่อรายการ/);

console.log('PASS requisition UI: printing requires approval, detail editing supports issue quantities and item notes, and approval reuses saved allocations.');
