function doGet() {
  return HtmlService.createTemplateFromFile('UserIndex').evaluate()
    .setTitle('ระบบขอเบิกวัสดุ - ศูนย์แพทย์')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function includeUser_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function userValidSession_(token) {
  var value = userText_(token);
  if (!/^[a-f0-9-]{36}$/.test(value)) return false;
  var cache = CacheService.getScriptCache();
  var key = 'user-session-' + value;
  if (cache.get(key) !== 'valid') return false;
  // Sliding expiry: authenticated activity keeps the shared-code session alive.
  cache.put(key, 'valid', USER_CONFIG.SESSION_SECONDS);
  return true;
}

function userUnlock_(code) {
  var cache = CacheService.getScriptCache();
  var failures = Number(cache.get('user-code-failures') || 0);
  if (failures >= 30) throw new UserError(429, 'ACCESS_RATE_LIMIT', 'ลองรหัสผิดหลายครั้ง กรุณารอ 10 นาที');
  if (userText_(code) !== USER_CONFIG.ACCESS_CODE) {
    cache.put('user-code-failures', String(failures + 1), 600);
    throw new UserError(401, 'INVALID_ACCESS_CODE', 'รหัสเข้าใช้งานไม่ถูกต้อง');
  }
  cache.remove('user-code-failures');
  var token = Utilities.getUuid().toLowerCase();
  cache.put('user-session-' + token, 'valid', USER_CONFIG.SESSION_SECONDS);
  return { token: token };
}

function userApi(request) {
  try {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new UserError(400, 'INVALID_REQUEST', 'คำขอไม่ถูกต้อง');
    var method = userText_(request.method || 'GET').toUpperCase();
    var path = userText_(request.path).split('?')[0];
    var payload = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
    var data;
    if (method === 'POST' && path === '/api/public/access') data = userUnlock_(payload.code);
    else {
      if (!userValidSession_(request.token)) throw new UserError(401, 'ACCESS_REQUIRED', 'กรุณากรอกรหัสเข้าใช้งานอีกครั้ง');
      if (method === 'GET' && path === '/api/public/state') data = userCatalog_();
      else if (method === 'POST' && path === '/api/public/session/touch') data = { active: true };
      else if (method === 'POST' && path === '/api/public/requisitions/create') data = userCreateRequisition_(payload);
      else throw new UserError(404, 'NOT_FOUND', 'ไม่พบคำสั่งที่ต้องการ');
    }
    return { ok: true, status: 200, data: data };
  } catch (error) {
    console.error(JSON.stringify({ event: 'user_api_error', path: request && request.path, code: error.code || 'INTERNAL_ERROR', message: error.message }));
    return { ok: false, status: error instanceof UserError ? error.status : 500, code: error.code || 'INTERNAL_ERROR', message: error instanceof UserError ? error.message : 'ระบบขัดข้อง กรุณาลองใหม่' };
  }
}
