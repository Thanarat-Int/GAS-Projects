import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { server } from '../local/server.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const privateAccessFile = path.join(projectRoot, 'local-data', 'user-access.json');
const exampleAccessFile = path.join(projectRoot, 'local-data', 'user-access.example.json');
const accessCode = process.env.MATERIAL_USER_ACCESS_CODE || JSON.parse(fs.readFileSync(fs.existsSync(privateAccessFile) ? privateAccessFile : exampleAccessFile, 'utf8')).code;

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const lockedPage = await fetch(`${baseUrl}/user`, { redirect: 'manual' });
  assert.equal(lockedPage.status, 303);
  assert.equal(lockedPage.headers.get('location'), '/user/access');
  const directPage = await fetch(`${baseUrl}/user.html`, { redirect: 'manual' });
  assert.equal(directPage.status, 303);
  const lockedState = await fetch(`${baseUrl}/api/public/state`);
  assert.equal(lockedState.status, 401);
  const lockedCreate = await fetch(`${baseUrl}/api/public/requisitions/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: '{}' });
  assert.equal(lockedCreate.status, 401);
  const accessResponse = await fetch(`${baseUrl}/user/access`);
  const accessPage = await accessResponse.text();
  assert.equal(accessResponse.status, 200);
  assert.match(accessPage, /id="accessCode"/);
  assert.match(accessPage, /medical-center-logo\.png/);
  assert.equal(accessPage.includes(accessCode), false);
  const secretFile = await fetch(`${baseUrl}/local-data/user-access.json`);
  assert.equal(secretFile.status, 404);
  const invalidAccess = await fetch(`${baseUrl}/api/public/access`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ code: '00000' }) });
  assert.equal(invalidAccess.status, 401);
  const access = await fetch(`${baseUrl}/api/public/access`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ code: accessCode }) });
  assert.equal(access.status, 200);
  const session = access.headers.get('set-cookie')?.split(';')[0];
  assert.match(session || '', /^material_user_session=[a-f0-9]{64}$/);
  assert.match(access.headers.get('set-cookie') || '', /HttpOnly; SameSite=Strict/);
  assert.match(access.headers.get('set-cookie') || '', /Max-Age=3600/);
  const pageResponse = await fetch(`${baseUrl}/user`, { headers: { Cookie: session } });
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(page, /ระบบขอเบิกวัสดุ/);
  assert.match(page, /medical-center-logo\.png/);
  assert.match(page, /id="userPagination"/);
  assert.doesNotMatch(page, /userLoadMore/);
  assert.match(page, /id="userLanguageSwitch"/);
  assert.match(page, /id="userRefreshButton"/);
  assert.match(page, /data-language="th"/);
  assert.match(page, /data-language="en"/);
  assert.match(page, /id="userCartPagination"/);
  assert.match(page, /id="userRequestForm" novalidate/);
  assert.match(page, /id="userRequestDateDisplay"/);
  assert.match(page, /data-date-display="userRequestDate"/);
  assert.match(page, /data-i18n="purpose">วัตถุประสงค์การเบิก/);

  const scriptResponse = await fetch(`${baseUrl}/user.js`);
  const script = await scriptResponse.text();
  assert.equal(scriptResponse.status, 200);
  assert.match(script, /const PAGE_SIZE = 12;/);
  assert.match(script, /const CART_PAGE_SIZE = 5;/);
  assert.match(script, /rows\.slice\(pageStart, pageStart \+ PAGE_SIZE\)/);
  assert.match(script, /state\.cart\.set\(materialId, 0\)/);
  assert.match(script, /quantityRequired: 'กรุณาระบุจำนวน'/);
  assert.match(script, /Number\.isSafeInteger\(value\)/);
  assert.match(script, /step="1"/);
  assert.match(script, /state\.cartPage = Math\.floor\(firstIndex \/ CART_PAGE_SIZE\) \+ 1/);
  assert.match(script, /purpose: 'วัตถุประสงค์การเบิก'/);
  assert.match(script, /userRefreshButton/);
  assert.match(script, /async function refreshUserData\(\)/);
  assert.match(script, /const USER_IDLE_TIMEOUT_MS = 60 \* 60 \* 1000;/);
  assert.match(script, /\/api\/public\/session\/touch/);
  assert.match(script, /request\('\/api\/public\/state', \{ cache: 'no-store' \}\)/);
  assert.doesNotMatch(script, /window\.location\.reload\(\)/);
  assert.doesNotMatch(script, /reloadDraftKey/);
  const adminPage = await (await fetch(`${baseUrl}/`)).text();
  assert.match(adminPage, /id="refreshButton"/);
  const adminScript = await (await fetch(`${baseUrl}/app.js`)).text();
  assert.match(adminScript, /refreshButton.*addEventListener\('click'/);
  assert.match(adminScript, /await refresh\(\)/);
  assert.doesNotMatch(adminScript, /window\.location\.reload\(\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(projectRoot, 'UserBridge.html'), 'utf8'), /window\.location\.reload\(\)/);
  assert.match(adminPage, /id="fiscalReportPeriod"/);
  assert.match(adminPage, /id="fiscalReportMonth"/);
  assert.doesNotMatch(adminPage, /id="reviewCarryHint"/);

  const stateResponse = await fetch(`${baseUrl}/api/public/state`, { headers: { Cookie: session } });
  const stateResult = await stateResponse.json();
  assert.equal(stateResponse.status, 200);
  assert.equal(stateResult.ok, true);
  assert.equal(stateResult.data.materials.length, 134);
  assert.deepEqual(stateResult.data.requisitionDepartments, ['บริหาร', 'วิชาการ']);
  assert.equal('reviews' in stateResult.data, false, 'public state must not expose import reviews');
  assert.equal('requisitions' in stateResult.data, false, 'public state must not expose other requests');
  assert.equal('latestPrice' in stateResult.data.materials[0], false, 'public materials must not expose prices');

  const touchResponse = await fetch(`${baseUrl}/api/public/session/touch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl, Cookie: session },
    body: '{}',
  });
  assert.equal(touchResponse.status, 200);
  assert.match(touchResponse.headers.get('set-cookie') || '', /Max-Age=3600/);

  const material = stateResult.data.materials.find(item => Number(item.available) > 1);
  assert.ok(material, 'public catalog needs at least one issuable material');
  const requestResponse = await fetch(`${baseUrl}/api/public/requisitions/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl, Cookie: session },
    body: JSON.stringify({
      requestDate: stateResult.data.fiscalYear.endDate,
      requesterName: 'ผู้ใช้ทดสอบหน้าเว็บ',
      department: stateResult.data.requisitionDepartments[0],
      note: '',
      lines: [{ materialId: material.id, quantity: 1 }],
      operationId: 'public-user-portal-test',
    }),
  });
  const requestResult = await requestResponse.json();
  assert.equal(requestResponse.status, 200);
  assert.match(requestResult.data.requisition.requestNo, /^REQ-\d{4}-\d{4}$/);
  assert.equal(requestResult.data.requisition.status, 'PENDING');
  assert.deepEqual(Object.keys(requestResult.data.requisition).sort(), ['requestDate', 'requestNo', 'status']);
  const fractionalResponse = await fetch(`${baseUrl}/api/public/requisitions/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl, Cookie: session },
    body: JSON.stringify({ requestDate: stateResult.data.fiscalYear.endDate, requesterName: 'ผู้ใช้ทดสอบหน้าเว็บ', department: stateResult.data.requisitionDepartments[0], lines: [{ materialId: material.id, quantity: 1.5 }], operationId: 'public-fractional-request-test' }),
  });
  const fractionalResult = await fractionalResponse.json();
  assert.equal(fractionalResponse.status, 400);
  assert.equal(fractionalResult.code, 'INVALID_REQUISITION_QUANTITY');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const wrong = await fetch(`${baseUrl}/api/public/access`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ code: 'wrong' }) });
    assert.equal(wrong.status, 401);
  }
  const limited = await fetch(`${baseUrl}/api/public/access`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseUrl }, body: JSON.stringify({ code: 'wrong' }) });
  assert.equal(limited.status, 429);
} finally {
  await new Promise(resolve => server.close(resolve));
}

console.log('PASS user portal: themed page, public catalog privacy and request submission work end to end.');
