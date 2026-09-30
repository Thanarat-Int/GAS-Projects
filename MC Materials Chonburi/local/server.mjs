import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AppError, createMaterialStore, loadMaterialSeed } from './store.mjs';
import { createInkStore } from './ink-store.mjs';
import { createImageStore } from './images.mjs';

const localDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(localDir);
const webRoot = path.join(projectRoot, 'web');
const port = Number(process.env.MATERIAL_LOCAL_PORT || 4176);
const privateAccessFile = path.join(projectRoot, 'local-data', 'user-access.json');
const exampleAccessFile = path.join(projectRoot, 'local-data', 'user-access.example.json');
const accessFile = fs.existsSync(privateAccessFile) ? privateAccessFile : exampleAccessFile;
const userAccessCode = process.env.MATERIAL_USER_ACCESS_CODE || JSON.parse(fs.readFileSync(accessFile, 'utf8')).code;
if (typeof userAccessCode !== 'string' || !userAccessCode.trim()) throw new Error('MATERIAL_USER_ACCESS_CODE is required');
const userSessions = new Map();
const failedAccess = new Map();
const sessionDurationMs = 60 * 60 * 1000;
const sessionDurationSeconds = Math.floor(sessionDurationMs / 1000);
const accessWindowMs = 15 * 60 * 1000;
function setUserSessionCookie(request, response, token) {
  response.setHeader('Set-Cookie', `material_user_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionDurationSeconds}${request.socket.encrypted ? '; Secure' : ''}`);
}
function hasUserAccess(request, response) {
  const token = /(?:^|;\s*)material_user_session=([^;]+)/.exec(request.headers.cookie || '')?.[1];
  if (!token) return false;
  const expiresAt = userSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) { userSessions.delete(token); return false; }
  userSessions.set(token, Date.now() + sessionDurationMs);
  if (response) setUserSessionCookie(request, response, token);
  return true;
}
function checkAccessCode(value) {
  const supplied = Buffer.from(String(value ?? ''));
  const expected = Buffer.from(userAccessCode);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
const store = createMaterialStore(loadMaterialSeed(path.join(projectRoot, 'SeedData.gs')), {
  file: process.env.MATERIAL_DATA_PATH || (process.argv[1] === fileURLToPath(import.meta.url) ? path.join(projectRoot, 'local-data', 'materials.json') : undefined),
  role: process.env.MATERIAL_LOCAL_ROLE || 'admin',
});
const inkStore = createInkStore(process.env.INK_DATA_PATH || path.join(projectRoot, 'local-data', 'ink.json'), undefined, { role: process.env.INK_LOCAL_ROLE || 'admin' });
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
const images = createImageStore(process.env.IMAGE_DATA_PATH || path.join(projectRoot, 'local-data', 'images'));
const materialSnapshot = () => {
  const data = store.snapshot();
  data.materials.forEach(item => { item.imageUrl = images.get(`material:${item.id}`); });
  return data;
};
const publicMaterialSnapshot = () => {
  const data = materialSnapshot();
  const fiscalYear = data.fiscalYears.find(item => item.year === data.activeFiscalYear);
  return {
    app: { name: data.app.name },
    activeFiscalYear: data.activeFiscalYear,
    fiscalYear: fiscalYear ? { year: fiscalYear.year, startDate: fiscalYear.startDate, endDate: fiscalYear.endDate, status: fiscalYear.status } : null,
    categories: data.categories.filter(item => item.active).map(item => ({ id: item.id, nameTh: item.nameTh, nameEn: item.nameEn, order: item.order })),
    materials: data.materials.filter(item => item.active).map(item => ({
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      packDetail: item.packDetail,
      categoryId: item.categoryId,
      available: item.available,
      imageUrl: item.imageUrl,
    })),
    requisitionDepartments: data.requisitionDepartments,
  };
};
const inkSnapshot = () => {
  const data = inkStore.snapshot();
  data.products.forEach(item => { item.imageUrl = images.get(`ink:${item.id}`); });
  const normalize = name => String(name).toLowerCase().replace(/\s/g, '');
  const source = inkStore.backup().sourceWorkbook;
  const sourceNames = new Map(source.balances.map(row => [normalize(row.cells[1]), data.products.find(product => product.sourceRow === row.sourceRow)?.id]));
  const originalNames = new Map([
    ...source.groups.flatMap(group => group.rows.map(row => [`source-purchase:${group.id}:${row.sourceRow}`, row.cells[1]])),
    ...source.withdrawals.map(row => [`source-withdrawal:${row.sourceRow}`, row.cells[2]]),
  ]);
  for (const row of [...data.groups.flatMap(group => group.rows), ...data.withdrawals]) {
    const name = row.cells[row.editKey.startsWith('source-withdrawal:') || row.dateISO ? 2 : 1];
    row.productId ||= sourceNames.get(normalize(originalNames.get(row.editKey) || name)) || data.products.find(product => normalize(product.name) === normalize(name))?.id;
    row.imageUrl = images.get(row.productId ? `ink:${row.productId}` : `ink-row:${row.editKey}`);
  }
  return data;
};

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function body(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', chunk => {
      data += chunk;
      if (data.length > (request.url === '/api/images' ? 7_100_000 : 1_000_000)) { reject(new AppError(413, 'PAYLOAD_TOO_LARGE', 'ข้อมูลใหญ่เกินไป')); request.pause(); }
    });
    request.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new AppError(400, 'INVALID_JSON', 'รูปแบบข้อมูลไม่ถูกต้อง')); }
    });
    request.on('error', reject);
  });
}

const routes = new Map([
  ['POST /api/ink/changes', payload => inkStore.commit(payload, 'CHANGE')],
  ['POST /api/ink/products', payload => inkStore.commit(payload, 'PRODUCT')],
  ['POST /api/ink/notes', payload => inkStore.commit(payload, 'NOTES')],
  ['POST /api/ink/purchases', payload => inkStore.commit(payload, 'PURCHASE')],
  ['POST /api/ink/withdrawals', payload => inkStore.commit(payload, 'WITHDRAWAL')],
  ['POST /api/materials/create', payload => store.createMaterial(payload)],
  ['POST /api/materials/update', payload => store.updateMaterial(payload)],
  ['POST /api/annual-materials/create', payload => store.createAnnualMaterial(payload)],
  ['POST /api/annual-materials/update', payload => store.updateAnnualMaterial(payload)],
  ['POST /api/annual-materials/delete', payload => store.deleteAnnualMaterial(payload)],
  ['POST /api/stock', payload => store.recordStock(payload)],
  ['POST /api/requisitions/create', payload => store.createRequisition(payload)],
  ['POST /api/public/requisitions/create', payload => {
    const result = store.createRequisition(payload);
    return { requisition: { requestNo: result.requisition.requestNo, requestDate: result.requisition.requestDate, status: result.requisition.status } };
  }],
  ['POST /api/requisitions/update', payload => store.updateRequisition(payload)],
  ['POST /api/requisitions/update-allocation', payload => store.updateRequisitionAllocation(payload)],
  ['POST /api/requisitions/update-notes', payload => store.updateRequisitionNotes(payload)],
  ['POST /api/requisitions/approve', payload => store.approveRequisition(payload)],
  ['POST /api/requisitions/reject', payload => store.rejectRequisition(payload)],
  ['POST /api/requisitions/issue', payload => store.issueRequisition(payload)],
  ['POST /api/requisitions/cancel', payload => store.cancelRequisition(payload)],
  ['POST /api/fiscal-years/close', payload => store.closeFiscalYear(payload)],
  ['POST /api/reset', () => store.reset()],
]);

function staticFile(request, response) {
  const requested = new URL(request.url, 'http://localhost').pathname;
  const relative = requested === '/' ? 'index.html' : requested === '/user' ? 'user.html' : requested === '/user/access' ? 'user-access.html' : decodeURIComponent(requested).replace(/^\/+/, '');
  const file = path.resolve(webRoot, relative);
  if (!file.startsWith(webRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    json(response, 404, { ok: false, code: 'NOT_FOUND', message: 'ไม่พบหน้าที่ต้องการ' });
    return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
}

export const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (request.url?.startsWith('/api/') && request.method === 'POST') {
      const host = request.headers.host;
      if (!host || !/^127\.0\.0\.1:\d+$/.test(host)) throw new AppError(403, 'INK_ORIGIN', 'ไม่อนุญาต');
      if (request.method === 'POST' && (request.headers.origin !== `http://${host}` || !request.headers['content-type']?.startsWith('application/json'))) throw new AppError(403, 'INK_ORIGIN', 'ไม่อนุญาตให้บันทึกจากเว็บไซต์อื่น');
    }
    if (request.method === 'POST' && pathname === '/api/public/access') {
      const address = request.socket.remoteAddress || 'unknown';
      const attempts = failedAccess.get(address) || [];
      const recent = attempts.filter(time => Date.now() - time < accessWindowMs);
      if (recent.length >= 5) throw new AppError(429, 'ACCESS_LIMIT', 'ลองใหม่อีกครั้งใน 15 นาที');
      const payload = await body(request);
      if (!checkAccessCode(payload.code)) {
        recent.push(Date.now());
        failedAccess.set(address, recent);
        throw new AppError(401, 'INVALID_ACCESS_CODE', 'รหัสไม่ถูกต้อง');
      }
      failedAccess.delete(address);
      for (const [existingToken, expiresAt] of userSessions) if (expiresAt <= Date.now()) userSessions.delete(existingToken);
      const token = randomBytes(32).toString('hex');
      userSessions.set(token, Date.now() + sessionDurationMs);
      setUserSessionCookie(request, response, token);
      return json(response, 200, { ok: true, data: { next: '/user' } });
    }
    if ((pathname === '/user' || pathname === '/user.html') && request.method === 'GET' && !hasUserAccess(request, response)) {
      response.writeHead(303, { Location: '/user/access', 'Cache-Control': 'no-store' });
      return response.end();
    }
    if (pathname === '/user/access' && request.method === 'GET' && hasUserAccess(request, response)) {
      response.writeHead(303, { Location: '/user', 'Cache-Control': 'no-store' });
      return response.end();
    }
    if ((pathname === '/api/public/state' || pathname === '/api/public/requisitions/create' || pathname === '/api/public/session/touch') && !hasUserAccess(request, response)) {
      throw new AppError(401, 'ACCESS_REQUIRED', 'กรุณาใส่รหัสก่อนเข้าใช้งาน');
    }
    if (request.method === 'POST' && pathname === '/api/public/session/touch') return json(response, 200, { ok: true, data: { active: true } });
    if (request.method === 'POST' && request.url === '/api/images') {
      if (process.env.INK_LOCAL_ROLE === 'user') throw new AppError(403, 'IMAGE_ROLE', 'เฉพาะผู้ดูแลระบบเท่านั้น');
      return json(response, 200, { ok: true, data: images.upload((await body(request)).image) });
    }
    if (request.method === 'GET' && request.url?.startsWith('/media/') && images.serve(request.url, response)) return;
    if (request.method === 'GET' && request.url === '/api/ink/state') return json(response, 200, { ok: true, data: inkSnapshot() });
    if (request.method === 'GET' && request.url === '/api/ink/backup') {
      response.setHeader('Content-Disposition', 'attachment; filename="ink-backup.json"');
      return json(response, 200, inkStore.backup());
    }
    if (request.method === 'GET' && request.url === '/api/state') return json(response, 200, { ok: true, data: materialSnapshot() });
    if (request.method === 'GET' && request.url === '/api/public/state') return json(response, 200, { ok: true, data: publicMaterialSnapshot() });
    const route = routes.get(`${request.method} ${request.url}`);
    if (route) {
      const payload = await body(request);
      if (payload.imageUrl !== undefined) images.validate(payload.imageUrl);
      const sourceImageRow = payload.imageUrl !== undefined && payload.key?.startsWith('source-') ? (() => {
        const data = inkSnapshot();
        return [...data.groups.flatMap(group => group.rows), ...data.withdrawals].find(row => row.editKey === payload.key);
      })() : null;
      const result = route(payload);
      if (payload.imageUrl !== undefined) {
        const key = result.material ? `material:${result.material.id}` : request.url === '/api/ink/products' ? `ink:${result.id}` : payload.key?.startsWith('stock:') ? `ink:${payload.key.slice(6)}` : sourceImageRow ? sourceImageRow.productId ? `ink:${sourceImageRow.productId}` : `ink-row:${payload.key}` : null;
        if (key) images.set(key, payload.imageUrl);
      }
      if (result.state && request.url.startsWith('/api/ink/')) result.state = inkSnapshot();
      return json(response, 200, { ok: true, data: result });
    }
    if (request.method === 'GET') return staticFile(request, response);
    return json(response, 404, { ok: false, code: 'NOT_FOUND', message: 'ไม่พบคำสั่งที่ต้องการ' });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    json(response, status, { ok: false, code: error.code || 'INTERNAL_ERROR', message: status === 500 ? 'ระบบขัดข้อง' : error.message });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => console.log(`Material Center local app: http://127.0.0.1:${port}`));
}
