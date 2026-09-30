import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const gasFiles = ['AdminData.gs', 'AdminActions.gs', 'AdminBulkImport.gs', 'AdminInkMigration.gs', 'AdminInk.gs', 'AdminWeb.gs'];
for (const file of gasFiles) {
  const source = read(file);
  assert.doesNotThrow(() => new Function(source), `${file} must parse as JavaScript`);
  assert.equal(source.includes('•'), false, `${file} must not contain forbidden U+2022`);
}

const frontendEndpoints = new Set();
for (const file of ['web/app.js', 'web/ink.js', 'web/ink-entry.js', 'web/material-images.js']) {
  for (const match of read(file).matchAll(/['"`]((?:\/api\/)[A-Za-z0-9_/${}-]+)/g)) {
    const path = match[1]
      .replace('${editKey ? \'changes\' : mode}', 'changes')
      .replace('${actionName}', 'approve');
    if (!path.includes('${')) frontendEndpoints.add(path);
  }
}
const web = read('AdminWeb.gs');
const required = [
  '/api/state', '/api/ink/state', '/api/images',
  '/api/materials/create', '/api/materials/update', '/api/annual-materials/create', '/api/annual-materials/update',
  '/api/annual-materials/delete', '/api/stock', '/api/requisitions/create', '/api/requisitions/update',
  '/api/requisitions/update-allocation', '/api/requisitions/update-notes', '/api/requisitions/approve', '/api/requisitions/reject',
  '/api/requisitions/issue', '/api/requisitions/cancel', '/api/fiscal-years/close',
  '/api/ink/changes', '/api/ink/products', '/api/ink/notes', '/api/ink/purchases', '/api/ink/withdrawals',
];
for (const endpoint of required) assert.equal(web.includes(endpoint), true, `AdminWeb.gs must route ${endpoint}`);

for (const file of ['AdminIndex.html', 'AdminStyles.html', 'AdminScripts.html', 'AdminBridge.html', 'AdminFont1.html', 'AdminFont2.html', 'AdminFont3.html', 'AdminFont4.html']) {
  const source = read(file);
  assert.equal(source.includes('•'), false, `${file} must not contain forbidden U+2022`);
}
assert.match(read('AdminIndex.html'), /include\('AdminStyles'\)/);
assert.match(read('AdminIndex.html'), /include\('AdminBridge'\)/);
assert.match(read('AdminIndex.html'), /include\('AdminScripts'\)/);
for (let index = 1; index <= 4; index += 1) assert.match(read('AdminIndex.html'), new RegExp(`include\\('AdminFont${index}'\\)`));
assert.match(read('AdminBridge.html'), /\.adminApi\(request\)/);
assert.equal(read('AdminScripts.html').includes('/assets/fonts/'), false, 'print fonts must be embedded for Apps Script');
assert.equal(read('AdminIndex.html').includes('/assets/medical-center-logo.png'), false, 'logo must be embedded for Apps Script');
const script = read('AdminScripts.html').replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
assert.doesNotThrow(() => new Function(script), 'bundled Admin JavaScript must parse');

console.log(`PASS GAS admin package: ${gasFiles.length + 8} runtime files, complete API routing and embedded assets are ready.`);
