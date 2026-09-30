import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { inkPage, newestInkGroups } from '../web/ink.js';
import { inkData } from '../web/ink-data.js';
import { isLowStock, imageMarkup, imageField, pastedImage, edgeBackgroundColor, clearConnectedLightBackground } from '../web/material-images.js';

assert.equal(isLowStock(10), true);
assert.equal(isLowStock(0), true);
assert.equal(isLowStock(11), false);
assert.equal(isLowStock(undefined), false);
assert.equal(isLowStock(null), false);
assert.match(imageMarkup('', 'CAT-MEDICAL'), /data:image\/svg\+xml/);
assert.doesNotMatch(imageMarkup('javascript:alert(1)'), /javascript:/);
assert.match(imageMarkup('https://drive.google.com/thumbnail?id=abc_123&sz=w800'), /drive\.google\.com\/thumbnail/);
assert.doesNotMatch(imageMarkup('https://attacker.example/thumbnail?id=abc_123&sz=w800'), /attacker\.example/);
const clipboardPng = { type: 'image/png' };
assert.equal(pastedImage({ items: [{ kind: 'file', type: 'image/png', getAsFile: () => clipboardPng }] }), clipboardPng);
assert.equal(pastedImage({ files: [clipboardPng] }), clipboardPng);
assert.equal(pastedImage({ items: [{ kind: 'string', type: 'text/plain' }] }), null);
assert.equal(pastedImage(null), null);
assert.match(imageField(), /Ctrl \+ V/);
assert.match(imageField(), /type="file"/);
assert.match(imageField(), /ตัดพื้นหลังอัตโนมัติ \(No BG\)/);
assert.doesNotMatch(imageField(), /ต่อรูป/);
const paleMint = new Uint8ClampedArray([
  229, 245, 240, 255, 229, 245, 240, 255, 229, 245, 240, 255,
  229, 245, 240, 255, 30, 35, 40, 255, 229, 245, 240, 255,
  229, 245, 240, 255, 229, 245, 240, 255, 229, 245, 240, 255,
]);
assert.deepEqual(edgeBackgroundColor(paleMint, 3, 3), [229, 245, 240]);
assert.equal(clearConnectedLightBackground(paleMint, 3, 3), 8);
assert.deepEqual([...paleMint.filter((_, index) => index % 4 === 3)], [0, 0, 0, 0, 255, 0, 0, 0, 0]);
const enclosedWhite = new Uint8ClampedArray(Array.from({ length: 25 }, (_, index) => {
  const x = index % 5, y = Math.floor(index / 5);
  if (x === 0 || x === 4 || y === 0 || y === 4) return [245, 245, 245, 255];
  if (x === 2 && y === 2) return [255, 255, 255, 255];
  return [25, 30, 35, 255];
}).flat());
assert.equal(clearConnectedLightBackground(enclosedWhite, 5, 5), 16);
assert.equal(enclosedWhite[(2 * 5 + 2) * 4 + 3], 255, 'enclosed white product detail must remain opaque');
const darkBlue = new Uint8ClampedArray([
  15, 42, 105, 255, 15, 42, 105, 255, 15, 42, 105, 255,
  15, 42, 105, 255, 238, 183, 40, 255, 15, 42, 105, 255,
  15, 42, 105, 255, 15, 42, 105, 255, 15, 42, 105, 255,
]);
assert.deepEqual(edgeBackgroundColor(darkBlue, 3, 3), [15, 42, 105]);
assert.equal(clearConnectedLightBackground(darkBlue, 3, 3), 8, 'dark coloured backgrounds must be removed');
assert.equal(darkBlue[(1 * 3 + 1) * 4 + 3], 255, 'the product must remain opaque on a dark background');
assert.deepEqual(newestInkGroups(inkData.groups).map(group => group.total), [114900, 91000, 48760]);
assert.equal(newestInkGroups([...inkData.groups, { year: 2570, date: '2026-10-01', id: 'future' }])[0].id, 'future');
assert.equal(inkPage(Array.from({ length: 12 }, (_, i) => i), 2).items.length, 2);
assert.equal(inkPage([], 10).page, 1);
assert.equal(inkPage(Array(27), 100, 5).page, 6);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'material-images-check-'));
process.env.INK_DATA_PATH = path.join(temporary, 'ink.json');
process.env.IMAGE_DATA_PATH = path.join(temporary, 'images');
const { server } = await import('../local/server.mjs');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const post = async (url, input) => {
  const response = await fetch(origin + url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return { status: response.status, ...(await response.json()) };
};
try {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=';
  const upload = await post('/api/images', { image: png });
  assert.equal(upload.status, 200);
  assert.match(upload.data.url, /^\/media\/[a-f0-9]{64}\.png$/);
  assert.equal((await fetch(origin + upload.data.url)).headers.get('content-type'), 'image/png');
  assert.equal((await post('/api/images', { image: 'data:image/png;base64,YWJjZA==' })).status, 400);
  assert.equal((await fetch(origin + '/api/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const data = (await (await fetch(origin + '/api/state')).json()).data;
  const original = data.materials[0];
  const updated = await post('/api/materials/update', { ...original, materialId: original.id, operationId: randomUUID(), imageUrl: upload.data.url });
  assert.equal(updated.status, 200);
  const snapshot = (await (await fetch(origin + '/api/state')).json()).data;
  assert.equal(snapshot.materials[0].imageUrl, upload.data.url);
  assert.equal(snapshot.materials[0].onHand, original.onHand);
  const { createImageStore } = await import('../local/images.mjs');
  assert.equal(createImageStore(process.env.IMAGE_DATA_PATH).get(`material:${original.id}`), upload.data.url);
  const ink = await post('/api/ink/products', { name: 'Test image product', imageUrl: upload.data.url, operationId: randomUUID(), revision: 0 });
  assert.equal(ink.status, 200);
  assert.equal(ink.data.state.products.find(product => product.id === ink.data.id).imageUrl, upload.data.url);
  const oldPurchase = ink.data.state.groups.find(group => group.year === 2568).rows[0];
  const balancesBefore = ink.data.state.products.map(product => [product.id, product.onHand]);
  const photoEdit = await post('/api/ink/changes', { key: oldPurchase.editKey, action: 'UPDATE', name: oldPurchase.cells[1], quantity: oldPurchase.cells[2], unitPrice: oldPurchase.cells[3], reason: 'เปลี่ยนรูปภาพ', imageUrl: upload.data.url, operationId: randomUUID(), revision: ink.data.state.revision });
  assert.equal(photoEdit.status, 200);
  assert.deepEqual(photoEdit.data.state.products.map(product => [product.id, product.onHand]), balancesBefore);
  assert.equal(photoEdit.data.state.groups.find(group => group.year === 2568).rows[0].imageUrl, upload.data.url);
  assert.equal(photoEdit.data.state.products.find(product => product.id === oldPurchase.productId).imageUrl, upload.data.url);
  console.log('PASS image storage, validation, origin, material/ink image linkage, unchanged stock, newest years and pagination.');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  // Disposable test directory only; never touches the user's local-data directory.
  fs.rmSync(temporary, { recursive: true, force: true });
}
