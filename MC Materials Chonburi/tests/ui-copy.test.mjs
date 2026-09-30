import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceFolders = ['web', 'local'];
const sourceExtensions = new Set(['.html', '.css', '.js', '.mjs']);
const forbiddenSeparators = /[\u2022\u00b7]/u;
const files = [];

function collect(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) collect(target);
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(target);
  }
}

sourceFolders.forEach(folder => collect(path.join(root, folder)));
const violations = files.filter(file => forbiddenSeparators.test(fs.readFileSync(file, 'utf8')));
assert.deepEqual(violations, [], `forbidden separator found in: ${violations.map(file => path.relative(root, file)).join(', ')}`);

console.log('PASS UI copy: forbidden bullet-style separators are absent from application source.');
