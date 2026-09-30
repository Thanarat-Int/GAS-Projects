var MATERIAL_CONFIG = Object.freeze({
  APP_NAME: 'วัสดุศูนย์แพทย์',
  SPREADSHEET_ID: 'PASTE_SPREADSHEET_ID_HERE',
  TIME_ZONE: 'Asia/Bangkok',
  SCHEMA_VERSION: '3',
  INITIAL_FISCAL_YEAR: 2569,
  INITIAL_USER_ACCESS_CODE: 'CHANGE_ME',
  ADMIN_EMAILS: Object.freeze(['admin@example.com']),
  LOCK_TIMEOUT_MS: 30000
});

function materialNormalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function materialSetupActor_() {
  var active = materialNormalizeEmail_(Session.getActiveUser().getEmail());
  var effective = materialNormalizeEmail_(Session.getEffectiveUser().getEmail());
  var email = active || effective;
  if (!email || MATERIAL_CONFIG.ADMIN_EMAILS.indexOf(email) === -1) {
    throw new Error('FORBIDDEN: บัญชีนี้ไม่มีสิทธิ์ตั้งค่าระบบ');
  }
  return email;
}

function materialWithLock_(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(MATERIAL_CONFIG.LOCK_TIMEOUT_MS)) {
    throw new Error('BUSY: ระบบกำลังประมวลผล กรุณาลองใหม่');
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}
