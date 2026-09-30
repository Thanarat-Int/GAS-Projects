// Copy this file only to the separate MC Materials User Apps Script project.
// Replace the spreadsheet ID with the value from the live Admin project's Config.gs.
var USER_CONFIG = Object.freeze({
  SPREADSHEET_ID: 'PASTE_SPREADSHEET_ID_FROM_ADMIN_CONFIG',
  ACCESS_CODE: 'CHANGE_ME',
  TIME_ZONE: 'Asia/Bangkok',
  // Shared access-code session expires after 1 hour without user activity.
  SESSION_SECONDS: 3600,
  LOCK_TIMEOUT_MS: 30000
});

var USER_SHEETS = Object.freeze({
  categories: 'ประเภทวัสดุ',
  departments: 'ฝ่ายขอเบิก',
  materials: 'วัสดุ',
  fiscalYears: 'ปีงบประมาณ',
  fiscalPeriods: 'รายการวัสดุรายปี',
  requisitions: 'คำขอเบิก',
  requisitionLines: 'รายการคำขอเบิก',
  operations: 'รหัสกันบันทึกซ้ำ',
  audit: 'ประวัติระบบ'
});

var USER_HEADERS = Object.freeze({
  categories: 'รหัสประเภท', departments: 'รหัสฝ่าย', materials: 'รหัสวัสดุ',
  fiscalYears: 'รหัสปีงบประมาณ', fiscalPeriods: 'รหัสงวดวัสดุ',
  requisitions: 'รหัสคำขอ', requisitionLines: 'รหัสบรรทัด',
  operations: 'รหัสกันทำซ้ำ', audit: 'รหัสประวัติ'
});
