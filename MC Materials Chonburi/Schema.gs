var MATERIAL_SHEETS = Object.freeze({
  CATEGORIES: 'ประเภทวัสดุ',
  DEPARTMENTS: 'ฝ่ายขอเบิก',
  IMPORT_REVIEW: 'ตรวจนำเข้า',
  MATERIALS: 'วัสดุ',
  FISCAL_YEARS: 'ปีงบประมาณ',
  FISCAL_PERIODS: 'รายการวัสดุรายปี',
  LEDGER: 'รายการเคลื่อนไหว',
  REQUISITIONS: 'คำขอเบิก',
  REQUISITION_LINES: 'รายการคำขอเบิก',
  INK_PRODUCTS: 'หมึก',
  INK_DOCUMENTS: 'เอกสารหมึก',
  INK_DOCUMENT_LINES: 'รายการเอกสารหมึก',
  INK_REASONS: 'เหตุผลการซื้อหมึก',
  SIGNATORIES: 'ผู้ลงนามเอกสาร',
  MEDIA: 'ไฟล์สื่อ',
  USERS: 'ผู้ใช้งาน',
  OPERATIONS: 'รหัสกันบันทึกซ้ำ',
  AUDIT: 'ประวัติระบบ',
  SYSTEM: '_System'
});

// Schema is append-only. Add future columns at the end so setup can upgrade
// an existing workbook without moving or deleting user data.
var MATERIAL_SCHEMA = Object.freeze({
  categories: Object.freeze([
    'รหัสประเภท', 'รหัสย่อ', 'ชื่อประเภท', 'ชื่อภาษาอังกฤษ', 'ลำดับ',
    'ใช้งาน', 'เวอร์ชัน', 'สร้างเมื่อ', 'สร้างโดย', 'แก้ไขเมื่อ', 'แก้ไขโดย'
  ]),
  departments: Object.freeze([
    'รหัสฝ่าย', 'ชื่อฝ่าย', 'ชื่อภาษาอังกฤษ', 'ชื่อผู้ลงนามฝ่าย', 'ตำแหน่งผู้ลงนามฝ่าย',
    'ลำดับ', 'ใช้งาน', 'สร้างเมื่อ', 'สร้างโดย', 'แก้ไขเมื่อ', 'แก้ไขโดย', 'เวอร์ชัน'
  ]),
  importReview: Object.freeze([
    'รหัสตรวจนำเข้า', 'รหัสต้นทาง', 'ชีทต้นทาง', 'แถวต้นทาง', 'รหัสประเภท',
    'ชื่อเดิม', 'หน่วยเดิม', 'ชื่อที่เสนอ', 'หน่วยที่เสนอ',
    'ยอดยกมา', 'รับระหว่างปี', 'รวมรับตามต้นทาง', 'จ่ายระหว่างปี',
    'คงเหลือที่เสนอ', 'ราคาล่าสุด', 'มูลค่าตามต้นทาง', 'ประเด็นที่พบ',
    'สถานะตรวจ', 'หมายเหตุผู้ตรวจ', 'รหัสวัสดุ', 'นำเข้าเมื่อ',
    'ตรวจเมื่อ', 'ตรวจโดย', 'เวอร์ชัน', 'ปีงบประมาณ'
  ]),
  materials: Object.freeze([
    'รหัสวัสดุ', 'รหัสแสดง', 'รหัสประเภท', 'ชื่อวัสดุ', 'หน่วยนับ',
    'รายละเอียดบรรจุ', 'คงเหลือจริง', 'จำนวนรอจ่าย', 'จุดแจ้งเตือน',
    'ใช้งาน', 'สร้างเมื่อ', 'สร้างโดย', 'แก้ไขเมื่อ', 'แก้ไขโดย', 'เวอร์ชัน',
    'ราคา/หน่วยล่าสุด', 'หมายเหตุ', 'รหัสไฟล์รูปภาพ', 'URL รูปภาพ',
    'MIME รูปภาพ', 'SHA-256 รูปภาพ'
  ]),
  fiscalYears: Object.freeze([
    'รหัสปีงบประมาณ', 'ปีงบประมาณ', 'วันที่เริ่ม', 'วันที่สิ้นสุด', 'สถานะ',
    'สร้างเมื่อ', 'สร้างโดย', 'ปิดเมื่อ', 'ปิดโดย', 'เวอร์ชัน'
  ]),
  fiscalPeriods: Object.freeze([
    'รหัสงวดวัสดุ', 'รหัสวัสดุ', 'รหัสแสดง', 'ชื่อวัสดุ', 'ปีงบประมาณ',
    'คงเหลือยกมา', 'รับก่อนเข้าระบบ', 'จ่ายก่อนเข้าระบบ', 'คงเหลือ ณ วันเริ่มระบบ',
    'ยอดปรับปรุงกระทบยอด', 'รวมรับตามรายงานเดิม', 'ราคา/หน่วยล่าสุด',
    'มูลค่าตามรายงานเดิม', 'หมายเหตุ', 'ลบแล้ว', 'ลบเมื่อ', 'ลบโดย',
    'รับในระบบ', 'จ่ายในระบบ', 'ปรับเพิ่ม', 'ปรับลด', 'คงเหลือปลายงวด',
    'แหล่งข้อมูล', 'รหัสอ้างอิงแหล่งข้อมูล', 'แก้ไขเมื่อ', 'เวอร์ชัน'
  ]),
  ledger: Object.freeze([
    'รหัสรายการ', 'รหัสวัสดุ', 'ประเภทรายการ', 'จำนวนเปลี่ยนแปลง',
    'คงเหลือหลังรายการ', 'ประเภทเอกสารอ้างอิง', 'เลขอ้างอิง',
    'หมายเหตุ', 'เกิดรายการเมื่อ', 'ผู้ทำรายการ', 'รหัสกันทำซ้ำ',
    'ปีงบประมาณ', 'รหัสแสดงวัสดุ', 'ชื่อวัสดุ'
  ]),
  requisitions: Object.freeze([
    'รหัสคำขอ', 'เลขที่คำขอ', 'ปีงบประมาณ', 'วันที่ขอ', 'ชื่อผู้ขอเบิก',
    'รหัสฝ่าย', 'ฝ่ายที่ขอเบิก', 'วัตถุประสงค์การเบิก', 'สถานะ',
    'สร้างเมื่อ', 'สร้างโดย', 'แก้ไขเมื่อ', 'แก้ไขโดย',
    'อนุมัติเมื่อ', 'อนุมัติโดย', 'จ่ายเมื่อ', 'จ่ายโดย',
    'ไม่อนุมัติเมื่อ', 'ไม่อนุมัติโดย', 'ยกเลิกเมื่อ', 'ยกเลิกโดย', 'เวอร์ชัน'
  ]),
  requisitionLines: Object.freeze([
    'รหัสบรรทัด', 'รหัสคำขอ', 'เลขที่คำขอ', 'ลำดับ', 'รหัสวัสดุ',
    'รหัสแสดงวัสดุ', 'ชื่อวัสดุ', 'หน่วยนับ', 'จำนวนเบิก', 'จำนวนจ่าย',
    'หมายเหตุต่อรายการ', 'สร้างเมื่อ', 'แก้ไขเมื่อ'
  ]),
  inkProducts: Object.freeze([
    'รหัสหมึก', 'ชื่อหมึก', 'ยอดตั้งต้น', 'ราคา/หน่วยตั้งต้น', 'คงเหลือจริง',
    'ราคา/หน่วยล่าสุด', 'รหัสไฟล์รูปภาพ', 'URL รูปภาพ', 'ลบแล้ว',
    'แถวต้นทาง', 'สร้างเมื่อ', 'สร้างโดย', 'แก้ไขเมื่อ', 'แก้ไขโดย', 'เวอร์ชัน'
  ]),
  inkDocuments: Object.freeze([
    'รหัสเอกสารหมึก', 'ประเภทเอกสาร', 'ลำดับรายการ', 'ปีงบประมาณ', 'วันที่เอกสาร',
    'รหัสฝ่าย', 'ฝ่าย', 'หมายเหตุ', 'แหล่งข้อมูล', 'รหัสอ้างอิงต้นทาง',
    'ลบแล้ว', 'สร้างเมื่อ', 'สร้างโดย', 'แก้ไขเมื่อ', 'แก้ไขโดย', 'เวอร์ชัน'
  ]),
  inkDocumentLines: Object.freeze([
    'รหัสบรรทัดหมึก', 'รหัสเอกสารหมึก', 'ลำดับ', 'รหัสหมึก', 'ชื่อหมึก',
    'จำนวน', 'ราคา/หน่วย', 'ราคารวม'
  ]),
  inkReasons: Object.freeze([
    'รหัสเหตุผล', 'รหัสหัวข้อ', 'หัวข้อ', 'ลำดับหัวข้อ', 'ลำดับเหตุผล',
    'เหตุผล', 'ใช้งาน', 'สร้างเมื่อ', 'สร้างโดย', 'แก้ไขเมื่อ', 'แก้ไขโดย', 'เวอร์ชัน'
  ]),
  signatories: Object.freeze([
    'รหัสผู้ลงนาม', 'ประเภทเอกสาร', 'รหัสฝ่าย', 'บทบาทลงนาม', 'ชื่อผู้ลงนาม',
    'ตำแหน่ง', 'หน่วยงาน', 'ลำดับ', 'ใช้งาน', 'สร้างเมื่อ', 'สร้างโดย',
    'แก้ไขเมื่อ', 'แก้ไขโดย', 'เวอร์ชัน'
  ]),
  media: Object.freeze([
    'รหัสไฟล์สื่อ', 'ประเภทข้อมูล', 'รหัสข้อมูล', 'ชนิดไฟล์สื่อ', 'รหัสไฟล์ Google Drive',
    'ชื่อไฟล์', 'MIME Type', 'ขนาดไฟล์ (ไบต์)', 'SHA-256', 'ใช้งาน',
    'สร้างเมื่อ', 'สร้างโดย', 'ลบเมื่อ', 'ลบโดย', 'เวอร์ชัน'
  ]),
  users: Object.freeze([
    'อีเมล', 'ชื่อแสดง', 'สิทธิ์', 'ใช้งาน',
    'สร้างเมื่อ', 'สร้างโดย', 'แก้ไขเมื่อ', 'แก้ไขโดย', 'เวอร์ชัน'
  ]),
  operations: Object.freeze([
    'รหัสกันทำซ้ำ', 'ประเภทคำสั่ง', 'SHA-256 คำขอ', 'ผลลัพธ์ JSON',
    'สร้างเมื่อ', 'หมดอายุเมื่อ'
  ]),
  audit: Object.freeze([
    'รหัสประวัติ', 'เกิดรายการเมื่อ', 'ผู้ทำรายการ', 'การกระทำ',
    'ประเภทข้อมูล', 'รหัสข้อมูล', 'ค่าก่อนแก้', 'ค่าหลังแก้', 'รหัสกันทำซ้ำ'
  ]),
  system: Object.freeze(['คีย์', 'ค่า'])
});

var MATERIAL_SHEET_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'categories', name: MATERIAL_SHEETS.CATEGORIES, color: '#24584A', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'departments', name: MATERIAL_SHEETS.DEPARTMENTS, color: '#2F6B5A', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'importReview', name: MATERIAL_SHEETS.IMPORT_REVIEW, color: '#B7791F', hidden: true, frozenColumns: 2 }),
  Object.freeze({ key: 'materials', name: MATERIAL_SHEETS.MATERIALS, color: '#2F6B5A', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'fiscalYears', name: MATERIAL_SHEETS.FISCAL_YEARS, color: '#315F52', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'fiscalPeriods', name: MATERIAL_SHEETS.FISCAL_PERIODS, color: '#397565', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'ledger', name: MATERIAL_SHEETS.LEDGER, color: '#4B6573', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'requisitions', name: MATERIAL_SHEETS.REQUISITIONS, color: '#176B55', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'requisitionLines', name: MATERIAL_SHEETS.REQUISITION_LINES, color: '#2A7A65', hidden: false, frozenColumns: 3 }),
  Object.freeze({ key: 'inkProducts', name: MATERIAL_SHEETS.INK_PRODUCTS, color: '#116B59', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'inkDocuments', name: MATERIAL_SHEETS.INK_DOCUMENTS, color: '#287466', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'inkDocumentLines', name: MATERIAL_SHEETS.INK_DOCUMENT_LINES, color: '#3C8275', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'inkReasons', name: MATERIAL_SHEETS.INK_REASONS, color: '#5B756D', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'signatories', name: MATERIAL_SHEETS.SIGNATORIES, color: '#52665F', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'media', name: MATERIAL_SHEETS.MEDIA, color: '#5B6F78', hidden: false, frozenColumns: 2 }),
  Object.freeze({ key: 'users', name: MATERIAL_SHEETS.USERS, color: '#56616A', hidden: false, frozenColumns: 1 }),
  Object.freeze({ key: 'operations', name: MATERIAL_SHEETS.OPERATIONS, color: '#7A8187', hidden: true, frozenColumns: 1 }),
  Object.freeze({ key: 'audit', name: MATERIAL_SHEETS.AUDIT, color: '#7A8187', hidden: true, frozenColumns: 2 }),
  Object.freeze({ key: 'system', name: MATERIAL_SHEETS.SYSTEM, color: '#7A8187', hidden: true, frozenColumns: 1 })
]);

var MATERIAL_TRANSACTION_TYPES = Object.freeze([
  'OPENING', 'CUTOVER', 'CARRY_FORWARD', 'RECEIPT', 'ADJUST_IN', 'ADJUST_OUT', 'ISSUE', 'VOID'
]);

function materialSpreadsheet_() {
  var properties = PropertiesService.getScriptProperties();
  var propertyId = properties.getProperty('MATERIAL_SPREADSHEET_ID');
  return SpreadsheetApp.openById(propertyId || MATERIAL_CONFIG.SPREADSHEET_ID);
}

function materialIsBlankSheet_(sheet) {
  return sheet.getLastRow() === 0 && sheet.getLastColumn() === 0;
}

function materialEnsureSheet_(spreadsheet, definition, isFirst) {
  var sheet = spreadsheet.getSheetByName(definition.name);
  if (!sheet && isFirst) {
    var sheets = spreadsheet.getSheets();
    if (sheets.length === 1 && materialIsBlankSheet_(sheets[0])) {
      sheet = sheets[0];
      sheet.setName(definition.name);
    }
  }
  if (!sheet) sheet = spreadsheet.insertSheet(definition.name);
  materialAssertOrCreateHeader_(sheet, MATERIAL_SCHEMA[definition.key]);
  materialFormatSheet_(sheet, MATERIAL_SCHEMA[definition.key].length, definition.color);
  materialApplySheetLayout_(sheet, definition);
  materialApplyValidations_(sheet, definition.key);
  return sheet;
}

function materialAssertOrCreateHeader_(sheet, headers) {
  var lastColumn = sheet.getLastColumn();
  if (sheet.getLastRow() === 0 || lastColumn === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers.slice()]);
    return;
  }
  if (lastColumn > headers.length) {
    throw new Error('SCHEMA: จำนวนคอลัมน์ของชีท ' + sheet.getName() + ' มากกว่าที่ระบบรองรับ');
  }
  var actual = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  for (var index = 0; index < actual.length; index += 1) {
    if (actual[index] === 'จำนวนจอง' && headers[index] === 'จำนวนรอจ่าย') {
      sheet.getRange(1, index + 1).setValue(headers[index]);
      actual[index] = headers[index];
    }
    if (actual[index] !== headers[index]) {
      throw new Error('SCHEMA: หัวตาราง ' + sheet.getName() + ' คอลัมน์ ' + (index + 1) + ' ถูกแก้ไข');
    }
  }
  if (lastColumn < headers.length) {
    sheet.getRange(1, lastColumn + 1, 1, headers.length - lastColumn).setValues([headers.slice(lastColumn)]);
  }
}

function materialFormatSheet_(sheet, width, color) {
  sheet.setFrozenRows(1);
  sheet.setHiddenGridlines(true);
  sheet.setTabColor(color);
  var header = sheet.getRange(1, 1, 1, width);
  header.setBackground(color).setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.setRowHeight(1, 42);
  var filter = sheet.getFilter();
  if (filter && typeof filter.getRange === 'function' && filter.getRange().getNumColumns() !== width) {
    filter.remove();
    filter = null;
  }
  if (!filter && sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), width).createFilter();
  }
}

function materialApplySheetLayout_(sheet, definition) {
  var schema = MATERIAL_SCHEMA[definition.key];
  var compact = /^(categories|departments|fiscalYears|users|system)$/.test(definition.key);
  schema.forEach(function (header, index) {
    var width = compact ? 125 : 145;
    if (/ชื่อ|หมายเหตุ|เหตุผล|JSON|URL|หน่วยงาน/.test(header)) width = 240;
    if (/เมื่อ|วันที่/.test(header)) width = 145;
    if (/รหัส/.test(header)) width = 135;
    if (/ลำดับ|ใช้งาน|เวอร์ชัน|ลบแล้ว/.test(header)) width = 85;
    sheet.setColumnWidth(index + 1, width);
  });
  sheet.setFrozenColumns(definition.frozenColumns || 0);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var rows = lastRow - 1;
  schema.forEach(function (header, index) {
    var column = index + 1;
    if (/เมื่อ$|วันที่เริ่ม|วันที่สิ้นสุด|วันที่ขอ|วันที่เอกสาร/.test(header)) {
      sheet.getRange(2, column, rows, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    } else if (/จำนวน|ยอด|ราคา|มูลค่า|คงเหลือ|ปีงบประมาณ|ลำดับ|เวอร์ชัน|ขนาดไฟล์/.test(header)) {
      sheet.getRange(2, column, rows, 1).setNumberFormat('#,##0.###');
    }
  });
  sheet.getRange(2, 1, rows, schema.length).setVerticalAlignment('top');
}

function materialApplyValidations_(sheet, key) {
  if (typeof SpreadsheetApp.newDataValidation !== 'function') return;
  var schema = MATERIAL_SCHEMA[key];
  var maxRows = Math.max(sheet.getMaxRows() - 1, 1);
  var lists = {
    importReview: { 'สถานะตรวจ': ['PENDING', 'APPROVED', 'REJECTED'] },
    fiscalYears: { 'สถานะ': ['OPEN', 'CLOSED'] },
    requisitions: { 'สถานะ': ['PENDING', 'APPROVED', 'ISSUED', 'REJECTED', 'CANCELLED'] },
    inkDocuments: { 'ประเภทเอกสาร': ['PURCHASE', 'WITHDRAWAL', 'ADJUSTMENT'] },
    users: { 'สิทธิ์': ['ADMIN', 'USER'] }
  };
  Object.keys(lists[key] || {}).forEach(function (header) {
    var column = schema.indexOf(header) + 1;
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(lists[key][header], true)
      .setAllowInvalid(false).build();
    sheet.getRange(2, column, maxRows, 1).setDataValidation(rule);
  });
  schema.forEach(function (header, index) {
    var range = sheet.getRange(2, index + 1, maxRows, 1);
    if (['ใช้งาน', 'ลบแล้ว'].indexOf(header) >= 0) {
      range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    }
  });
}

function materialRowMap_(sheet, keyColumn) {
  var result = {};
  if (sheet.getLastRow() < 2) return result;
  var values = sheet.getRange(2, keyColumn, sheet.getLastRow() - 1, 1).getDisplayValues();
  values.forEach(function (row, offset) {
    if (row[0]) {
      if (result[row[0]]) throw new Error('DATA: พบรหัสซ้ำในชีท ' + sheet.getName());
      result[row[0]] = offset + 2;
    }
  });
  return result;
}

function materialAppendRows_(sheet, rows, width) {
  if (!rows.length) return;
  rows.forEach(function (row) {
    if (row.length !== width) throw new Error('SCHEMA: ข้อมูลใหม่ของชีท ' + sheet.getName() + ' ไม่ครบคอลัมน์');
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, width).setValues(rows);
}
