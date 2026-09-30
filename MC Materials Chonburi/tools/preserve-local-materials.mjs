// One-time upgrade from the in-memory preview. Never overwrite an existing database.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createMaterialStore, loadMaterialSeed } from '../local/store.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const response = await fetch('http://127.0.0.1:4176/api/state');
const result = await response.json();
assert.ok(response.ok && result.ok, 'Live material snapshot unavailable');
const live = result.data;
const saved = { schemaVersion: 1 };
for (const key of ['categories', 'reviews', 'materials', 'movements', 'fiscalYears', 'fiscalPeriods']) saved[key] = live[key];
saved.materialSequence = Math.max(0, ...live.materials.map(item => Number(item.id.replace('MAT-', ''))));
saved.movementSequence = Math.max(0, ...live.movements.map(item => Number(item.id.replace('STK-', ''))));
saved.operations = [];
const file = path.join(root, 'local-data', 'materials.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
const fd = fs.openSync(file, 'wx');
try { fs.writeFileSync(fd, JSON.stringify(saved, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
const restored = createMaterialStore(loadMaterialSeed(path.join(root, 'SeedData.gs')), { file }).snapshot();
assert.deepEqual(restored, live, 'Checkpoint must preserve all fields, versions and timestamps');
console.log('PASS: live materials preserved and reload verified. No user data changed.');
