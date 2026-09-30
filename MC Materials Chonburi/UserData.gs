function UserError(status, code, message) {
  this.name = 'UserError';
  this.status = status;
  this.code = code;
  this.message = message;
  this.stack = (new Error(message)).stack;
}
UserError.prototype = Object.create(Error.prototype);
UserError.prototype.constructor = UserError;

function userSheet_(key) {
  if (!USER_CONFIG.SPREADSHEET_ID || USER_CONFIG.SPREADSHEET_ID.indexOf('PASTE_') === 0) {
    throw new UserError(500, 'USER_CONFIG_MISSING', 'กรุณาใส่ Spreadsheet ID ใน UserConfig.gs');
  }
  var name = USER_SHEETS[key];
  if (!name) throw new UserError(500, 'INVALID_SHEET', 'ไม่พบชนิดชีท');
  var sheet = SpreadsheetApp.openById(USER_CONFIG.SPREADSHEET_ID).getSheetByName(name);
  if (!sheet || sheet.getRange(1, 1).getValue() !== USER_HEADERS[key]) {
    throw new UserError(500, 'DATABASE_MISMATCH', 'ฐานข้อมูลไม่ตรงกับระบบผู้เบิก: ' + name);
  }
  return sheet;
}

function userRows_(key, columns) {
  var sheet = userSheet_(key);
  var count = sheet.getLastRow() - 1;
  return count > 0 ? sheet.getRange(2, 1, count, columns).getValues() : [];
}

function userText_(value) { return String(value == null ? '' : value).trim(); }
function userNumber_(value) { var number = Number(value || 0); return Number.isFinite(number) ? number : 0; }
function userBool_(value) { return value === true || String(value).toLowerCase() === 'true'; }
function userDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Number.isFinite(value.getTime()) ? Utilities.formatDate(value, USER_CONFIG.TIME_ZONE, 'yyyy-MM-dd') : '';
  }
  return userText_(value).slice(0, 10);
}
function userClean_(value, label, limit) {
  var text = userText_(value);
  if (!text || text.length > limit || /^[=+\-@]/.test(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new UserError(400, 'INVALID_INPUT', label + 'ไม่ถูกต้อง');
  return text;
}

function userFiscal_() {
  var open = userRows_('fiscalYears', 10).filter(function (row) { return userText_(row[4]) === 'OPEN'; });
  if (open.length !== 1) throw new UserError(503, 'FISCAL_YEAR_UNAVAILABLE', 'ปีงบประมาณที่เปิดใช้งานไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่');
  return { year: userNumber_(open[0][1]), startDate: userDate_(open[0][2]), endDate: userDate_(open[0][3]), status: 'OPEN' };
}

function userCatalog_() {
  var fiscal = userFiscal_();
  var categories = userRows_('categories', 11).filter(function (row) { return userBool_(row[5]); }).map(function (row) {
    return { id: userText_(row[0]), nameTh: userText_(row[2]), nameEn: userText_(row[3]), order: userNumber_(row[4]) };
  });
  var periods = {};
  userRows_('fiscalPeriods', 26).forEach(function (row) {
    if (userNumber_(row[4]) === fiscal.year && !userBool_(row[14])) periods[userText_(row[1])] = true;
  });
  var materials = userRows_('materials', 21).filter(function (row) {
    return userText_(row[0]) && userBool_(row[9]) && periods[userText_(row[0])];
  }).map(function (row) {
    return {
      id: userText_(row[0]), code: userText_(row[1]), categoryId: userText_(row[2]),
      name: userText_(row[3]), unit: userText_(row[4]), packDetail: userText_(row[5]),
      available: Math.max(0, userNumber_(row[6]) - userNumber_(row[7])), imageUrl: userText_(row[18])
    };
  });
  var allowed = { 'บริหาร': true, 'วิชาการ': true };
  var departments = userRows_('departments', 12).filter(function (row) {
    return userBool_(row[6]) && allowed[userText_(row[1])];
  }).sort(function (a, b) { return userNumber_(a[5]) - userNumber_(b[5]); }).map(function (row) { return userText_(row[1]); });
  return {
    app: { name: 'วัสดุศูนย์แพทย์' }, activeFiscalYear: fiscal.year,
    fiscalYear: fiscal, categories: categories, materials: materials,
    requisitionDepartments: departments
  };
}
