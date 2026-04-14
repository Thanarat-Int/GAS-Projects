/**
 * Smart Bill Dashboard — Database Setup
 * ─────────────────────────────────────────────────────────────
 * วิธีใช้:
 *   1. เปิด Google Sheets ใหม่ (หรือที่มีอยู่)
 *   2. Extensions > Apps Script → วางไฟล์นี้ทั้งไฟล์
 *   3. Save แล้วรันฟังก์ชัน `setupDatabase` ครั้งแรก (ต้องอนุญาตสิทธิ์)
 *   4. หลัง setup เสร็จ รีเฟรช Sheets จะเห็นเมนู "🏝️ Smart Bill" โผล่ขึ้นมา
 *
 * สคริปต์จะสร้างชีทต่อไปนี้:
 *   • Menus       — รายการเมนูทั้งหมด (seed 43 รายการ ตรงกับ UI)
 *   • Categories  — หมวดสินค้า (9 หมวด)
 *   • Channels    — ช่องทางขาย (4 ช่องทาง)
 *   • Bills       — หัวบิล (ว่าง พร้อมรับข้อมูล)
 *   • BillItems   — รายการในบิล (ว่าง พร้อมรับข้อมูล)
 *   • Settings    — ค่าตั้งต้นของระบบ
 * ─────────────────────────────────────────────────────────────
 */

// ============ SCHEMA ============
const SHEET_CONFIG = {
  Menus: {
    headers: ['id', 'name', 'cat', 'variant', 'price', 'active', 'createdAt', 'updatedAt', 'emoji'],
    widths:  [ 80,   220,    120,   130,       100,     80,       160,         160,         70     ],
    aligns:  ['center','left','center','center','right','center','center','center','center'],
  },
  Categories: {
    headers: ['id', 'name', 'icon', 'color', 'order'],
    widths:  [ 80,   160,    70,     140,      80   ],
    aligns:  ['center','left','center','center','center'],
  },
  Channels: {
    headers: ['id', 'name', 'icon', 'order', 'active'],
    widths:  [ 80,   180,    70,     80,      80     ],
    aligns:  ['center','left','center','center','center'],
  },
  Bills: {
    headers: ['billId', 'date', 'channel', 'itemCount', 'total', 'note', 'createdAt'],
    widths:  [ 140,      110,    150,       100,         120,     240,    170        ],
    aligns:  ['center','center','center','center','right','left','center'],
  },
  BillItems: {
    headers: ['billId', 'lineNo', 'menuId', 'name', 'variant', 'cat', 'price', 'qty', 'subtotal'],
    widths:  [ 140,      80,       90,       220,    130,       120,   100,     70,    120        ],
    aligns:  ['center','center','center','left','center','center','right','center','right'],
  },
  Settings: {
    headers: ['key', 'value', 'description'],
    widths:  [ 180,   260,     360          ],
    aligns:  ['left','left','left'],
  },
};

// ลำดับในการสร้าง (สำคัญเพราะ Categories/Channels ถูกอ้างใน validation ของ Menus/Bills)
const SHEET_ORDER = ['Categories', 'Channels', 'Menus', 'Bills', 'BillItems', 'Settings'];

// ============ SEED DATA ============
const SEED_CATEGORIES = [
  ['CAT01', 'Food',         '🍽️', '#fecdd3', 1],
  ['CAT02', 'Drinks',       '🥤', '#bfdbfe', 2],
  ['CAT03', 'Coffees',      '☕', '#fde68a', 3],
  ['CAT04', 'Cocktails',    '🍹', '#e9d5ff', 4],
  ['CAT05', 'Sunbeds',      '🏖️', '#a7f3d0', 5],
  ['CAT06', 'Jet-Banana',   '🚤', '#a5f3fc', 6],
  ['CAT07', 'Waters',       '💧', '#bae6fd', 7],
  ['CAT08', 'Services',     '🛎️', '#e2e8f0', 8],
  ['CAT09', 'Snorkling+LJ', '🤿', '#fed7aa', 9],
];

const SEED_CHANNELS = [
  ['CH01', 'Walk-In',          '🚶', 1, true],
  ['CH02', 'By Boats',         '🚤', 2, true],
  ['CH03', 'Korean Tour',      '🇰🇷', 3, true],
  ['CH04', 'Korean Speedboat', '⚡', 4, true],
];

// 43 รายการ ตรงกับ SAMPLE_MENU ใน mockup/index.html
// [id, name, cat, variant, price, active, emoji]
const SEED_MENUS = [
  // ─── Food (28) ───
  ['M001', 'ตัมยำกุ้ง',            'Food', 'เล็ก',  180, true, '🦐'],
  ['M002', 'ตัมยำกุ้ง',            'Food', 'กลาง',  280, true, '🦐'],
  ['M003', 'ตัมยำกุ้ง',            'Food', 'ใหญ่',  380, true, '🦐'],
  ['M004', 'ผัดไทยกุ้ง',           'Food', '',      250, true, '🍝'],
  ['M005', 'ข้าวผัดปู',            'Food', '',      220, true, '🦀'],
  ['M006', 'ต้มข่าไก่',            'Food', 'เล็ก',  150, true, '🍲'],
  ['M007', 'ต้มข่าไก่',            'Food', 'ใหญ่',  250, true, '🍲'],
  ['M008', 'ส้มตำ',                'Food', '',      120, true, '🥗'],
  ['M101', 'ผัดกะเพราหมูสับ',      'Food', '',      120, true, '🌶️'],
  ['M102', 'ผัดกะเพราไก่ไข่ดาว',   'Food', '',      130, true, '🍳'],
  ['M103', 'ข้าวผัดหมู',           'Food', '',      120, true, '🍚'],
  ['M104', 'ข้าวผัดกุ้ง',          'Food', '',      180, true, '🍤'],
  ['M105', 'ข้าวผัดสับปะรด',       'Food', '',      200, true, '🍍'],
  ['M106', 'ผัดซีอิ๊วหมู',         'Food', '',      130, true, '🍜'],
  ['M107', 'ราดหน้าหมู',           'Food', '',      130, true, '🍜'],
  ['M108', 'ก๋วยเตี๋ยวต้มยำ',      'Food', '',      140, true, '🍜'],
  ['M109', 'แกงเขียวหวานไก่',      'Food', '',      180, true, '🍛'],
  ['M110', 'แกงมัสมั่นเนื้อ',      'Food', '',      220, true, '🍛'],
  ['M111', 'ปลาทอดน้ำปลา',         'Food', '',      280, true, '🐟'],
  ['M112', 'ปลานึ่งมะนาว',         'Food', 'เล็ก',  350, true, '🐟'],
  ['M113', 'ปลานึ่งมะนาว',         'Food', 'ใหญ่',  550, true, '🐟'],
  ['M114', 'กุ้งเผา',              'Food', '',      450, true, '🔥'],
  ['M115', 'หอยแมลงภู่อบ',         'Food', '',      220, true, '🦪'],
  ['M116', 'ปูผัดผงกะหรี่',        'Food', '',      480, true, '🦀'],
  ['M117', 'ยำวุ้นเส้นทะเล',       'Food', '',      200, true, '🦑'],
  ['M118', 'ลาบหมู',               'Food', '',      150, true, '🐷'],
  ['M119', 'น้ำตกหมู',             'Food', '',      150, true, '🐷'],
  ['M120', 'ไก่ทอดกระเทียม',       'Food', '',      180, true, '🍗'],

  // ─── Drinks (4) ───
  ['M009', 'น้ำส้ม',               'Drinks', '',    60, true, '🍊'],
  ['M010', 'น้ำมะนาว',             'Drinks', '',    60, true, '🍋'],
  ['M011', 'เบียร์สิงห์',          'Drinks', '',    60, true, '🍺'],
  ['M012', 'เบียร์ลีโอ',           'Drinks', '',    60, true, '🍺'],

  // ─── Coffees (4) ───
  ['M013', 'ลาเต้',                'Coffees', 'ร้อน', 80,  true, '☕'],
  ['M014', 'ลาเต้',                'Coffees', 'เย็น', 100, true, '🧋'],
  ['M015', 'อเมริกาโน่',           'Coffees', 'ร้อน', 60,  true, '☕'],
  ['M016', 'อเมริกาโน่',           'Coffees', 'เย็น', 80,  true, '🧋'],

  // ─── Cocktails (2) ───
  ['M017', 'Mojito',               'Cocktails', '', 180, true, '🍹'],
  ['M018', 'Margarita',            'Cocktails', '', 200, true, '🍸'],

  // ─── Sunbeds (2) ───
  ['M019', 'Sunbed',               'Sunbeds', 'ครึ่งวัน', 200, true, '🏖️'],
  ['M020', 'Sunbed',               'Sunbeds', 'เต็มวัน',  300, true, '🏖️'],

  // ─── Jet-Banana (3) ───
  ['M021', 'Jet Ski',              'Jet-Banana', '15 นาที', 800,  true, '🏍️'],
  ['M022', 'Jet Ski',              'Jet-Banana', '30 นาที', 1500, true, '🏍️'],
  ['M023', 'Banana Boat',          'Jet-Banana', '',        500,  true, '🍌'],
];

const SEED_SETTINGS = [
  ['shopName',  'Smart Bill Dashboard',  'ชื่อร้านที่จะแสดงในหัวแอป'],
  ['currency',  '฿',                     'สัญลักษณ์สกุลเงิน'],
  ['timezone',  'Asia/Bangkok',          'เขตเวลา'],
  ['locale',    'th-TH',                 'ภาษา/รูปแบบตัวเลข'],
  ['version',   '1.0.0',                 'เวอร์ชัน database schema'],
  ['createdAt', new Date().toISOString(),'วันที่ setup'],
];

// ============ MAIN ============
/**
 * รันฟังก์ชันนี้เพื่อสร้าง database ทั้งหมด
 * (ถ้ามีชีทเดิมอยู่แล้ว จะถามยืนยันก่อนเขียนทับ)
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  // เช็คว่ามีชีทเดิมหรือไม่
  const existing = SHEET_ORDER.filter(name => ss.getSheetByName(name));
  if (existing.length > 0) {
    const res = ui.alert(
      '⚠️ พบชีทเดิม',
      'พบชีท: ' + existing.join(', ') + '\n\nต้องการเขียนทับและ seed ข้อมูลใหม่ทั้งหมดหรือไม่?\n(ข้อมูลเดิมจะหายไป)',
      ui.ButtonSet.YES_NO
    );
    if (res !== ui.Button.YES) {
      ui.alert('ยกเลิกการ setup');
      return;
    }
  }

  // สร้างทุกชีท
  SHEET_ORDER.forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (sheet) sheet.clear();
    else sheet = ss.insertSheet(name);
    setupSheet_(sheet, SHEET_CONFIG[name]);
  });

  // Seed data
  writeRows_('Categories', SEED_CATEGORIES);
  writeRows_('Channels',   SEED_CHANNELS);
  const now = new Date();
  writeRows_('Menus', SEED_MENUS.map(([id, name, cat, variant, price, active, emoji]) => [id, name, cat, variant, price, active, now, now, emoji]));
  writeRows_('Settings', SEED_SETTINGS);

  // Formatting + validation
  formatMenus_();
  formatBills_();
  formatBillItems_();
  addValidations_();

  // ลบ Sheet1 เริ่มต้นถ้ามี
  const sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);

  // จัดเรียง tab ตามลำดับ
  SHEET_ORDER.forEach((name, idx) => {
    const sh = ss.getSheetByName(name);
    if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(idx + 1); }
  });
  ss.setActiveSheet(ss.getSheetByName('Menus'));

  ui.alert(
    '✅ สร้าง Database เรียบร้อย',
    'สร้างชีท ' + SHEET_ORDER.length + ' ชีท\n' +
    '• Menus: ' + SEED_MENUS.length + ' รายการ\n' +
    '• Categories: ' + SEED_CATEGORIES.length + ' หมวด\n' +
    '• Channels: ' + SEED_CHANNELS.length + ' ช่องทาง\n' +
    '• Bills / BillItems: ว่าง พร้อมใช้งาน\n\n' +
    'รีเฟรชหน้าเพื่อเห็นเมนู 🏝️ Smart Bill',
    ui.ButtonSet.OK
  );
}

// ============ HELPERS ============
function setupSheet_(sheet, config) {
  const { headers, widths, aligns } = config;
  const n = headers.length;

  sheet.getRange(1, 1, 1, n)
    .setValues([headers])
    .setBackground('#0f172a')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 38);

  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // Default alignment ของทั้งคอลัมน์ (ยกเว้น header)
  aligns.forEach((a, i) => {
    sheet.getRange(2, i + 1, sheet.getMaxRows() - 1, 1).setHorizontalAlignment(a);
  });

  // ลบคอลัมน์เกิน
  const maxCols = sheet.getMaxColumns();
  if (maxCols > n) sheet.deleteColumns(n + 1, maxCols - n);
}

function writeRows_(sheetName, rows) {
  if (!rows || !rows.length) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function formatMenus_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Menus');
  const last = sh.getLastRow();
  if (last < 2) return;
  sh.getRange(2, 5, last - 1, 1).setNumberFormat('฿#,##0');      // price
  sh.getRange(2, 7, last - 1, 2).setNumberFormat('yyyy-mm-dd hh:mm'); // createdAt/updatedAt

  // Alternating row colors (banding)
  try {
    sh.getRange(1, 1, last, 9).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY)
      .setHeaderRowColor('#0f172a').setFirstRowColor('#ffffff').setSecondRowColor('#f8fafc');
  } catch (e) {}
}

function formatBills_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bills');
  sh.getRange('B:B').setNumberFormat('yyyy-mm-dd');
  sh.getRange('E:E').setNumberFormat('฿#,##0');
  sh.getRange('G:G').setNumberFormat('yyyy-mm-dd hh:mm:ss');
}

function formatBillItems_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('BillItems');
  sh.getRange('G:G').setNumberFormat('฿#,##0');
  sh.getRange('I:I').setNumberFormat('฿#,##0');
}

function addValidations_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Menus.cat → dropdown จาก Categories.name (apply เฉพาะแถวที่มีข้อมูลจริง)
  const menus = ss.getSheetByName('Menus');
  const menuRows = SEED_MENUS.length;
  const catRange = ss.getSheetByName('Categories').getRange('B2:B' + (SEED_CATEGORIES.length + 1));
  menus.getRange(2, 3, menuRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(catRange, true).setAllowInvalid(false).build()
  );

  // Menus.active → checkbox (เฉพาะแถวที่มีข้อมูล — กันแถวว่างที่ไม่ใช่ข้อมูลจริง)
  menus.getRange(2, 6, menuRows, 1).insertCheckboxes();

  // Channels.active → checkbox
  const chRows = SEED_CHANNELS.length;
  ss.getSheetByName('Channels').getRange(2, 5, chRows, 1).insertCheckboxes();

  // Bills.channel → dropdown จาก Channels.name (ใช้ validation ผ่าน column เปล่า ไม่สร้างค่า)
  const chRange = ss.getSheetByName('Channels').getRange('B2:B' + (SEED_CHANNELS.length + 1));
  ss.getSheetByName('Bills').getRange('C2:C10000').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(chRange, true).setAllowInvalid(false).build()
  );
}

// ============ CUSTOM MENU ============
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏝️ Smart Bill')
    .addItem('🛠️ Setup Database (ครั้งแรก)', 'setupDatabase')
    .addSeparator()
    .addItem('🔄 Reset Menus (ใส่ seed ใหม่)', 'resetMenus')
    .addItem('🗑️ Clear Menus (ลบเมนูทั้งหมด)', 'clearMenus')
    .addItem('🧹 Clear Bills (ลบบิลทั้งหมด)', 'clearBills')
    .addSeparator()
    .addItem('🧽 Cleanup Empty Rows (ลบแถวว่าง)', 'cleanupEmptyRows')
    .addSeparator()
    .addItem('😀 Add Emoji Column (เพิ่มคอลัมน์ emoji)', 'addEmojiColumn')
    .addItem('ℹ️ ตรวจสอบโครงสร้าง', 'verifySchema')
    .addToUi();
}

/**
 * Migration: เพิ่มคอลัมน์ emoji ให้ชีท Menus ที่มีอยู่แล้ว (ไม่ลบข้อมูล)
 * ใช้สำหรับคนที่รัน setupDatabase ไปก่อนที่จะมี emoji ใน schema
 */
function addEmojiColumn() {
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Menus');
  if (!sh) { ui.alert('ไม่พบชีท Menus — รัน Setup Database ก่อน'); return; }

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (headers.includes('emoji')) {
    ui.alert('มีคอลัมน์ emoji อยู่แล้ว', 'ไม่ต้อง migrate อีก ✓', ui.ButtonSet.OK);
    return;
  }

  const res = ui.alert(
    'เพิ่มคอลัมน์ emoji',
    'จะเพิ่มคอลัมน์ "emoji" ที่ท้ายตาราง Menus และใส่ค่าเริ่มต้นให้เมนูที่ตรงกับ seed (43 รายการ)\n\nข้อมูลเดิมจะไม่ถูกลบ ดำเนินการต่อ?',
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  // Add new column header at position 9
  const col = 9;
  sh.getRange(1, col).setValue('emoji')
    .setBackground('#0f172a').setFontColor('#ffffff').setFontWeight('bold')
    .setFontSize(11).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setColumnWidth(col, 70);

  // Build emoji lookup from seed
  const emojiById = {};
  SEED_MENUS.forEach(([id, , , , , , emoji]) => { emojiById[id] = emoji || ''; });

  // Populate emoji for existing rows (match by id)
  const last = sh.getLastRow();
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat();
    const emojis = ids.map(id => [emojiById[id] || '']);
    sh.getRange(2, col, emojis.length, 1).setValues(emojis).setHorizontalAlignment('center');
  }

  ui.alert('✓ เพิ่มคอลัมน์ emoji เรียบร้อย', 'Deploy Web App version ใหม่เพื่อให้ frontend แสดง emoji', ui.ButtonSet.OK);
}

/**
 * ลบแถวว่างที่เกิดจาก checkbox/validation ในทุกชีท
 * ใช้แก้ปัญหากรณี getLastRow คืนค่าเกินจำนวนข้อมูลจริง
 */
function cleanupEmptyRows() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const report = [];
  SHEET_ORDER.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const last = sh.getLastRow();
    if (last < 2) return;
    const ids = sh.getRange(2, 1, last - 1, 1).getValues().flat();
    // หาแถวสุดท้ายที่มี id จริง
    let lastRealRow = 1;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] !== '' && ids[i] !== null) lastRealRow = i + 2;
    }
    // ลบแถวที่อยู่หลัง lastRealRow
    const emptyRows = last - lastRealRow;
    if (emptyRows > 0) {
      sh.deleteRows(lastRealRow + 1, emptyRows);
      report.push(`• ${name}: ลบ ${emptyRows} แถวว่าง`);
    } else {
      report.push(`• ${name}: ไม่มีแถวว่าง`);
    }
  });
  ui.alert('✓ ล้างแถวว่างเรียบร้อย', report.join('\n'), ui.ButtonSet.OK);
}

function clearMenus() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert('ลบเมนูทั้งหมด', 'ลบเมนูทุกรายการในชีท Menus?\n(ชีทจะว่างเปล่า, การกระทำนี้ย้อนกลับไม่ได้)', ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Menus');
  if (!sh) { ui.alert('ยังไม่มีชีท Menus — รัน Setup Database ก่อน'); return; }
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  ui.alert('✓ ลบเมนูทั้งหมดเรียบร้อย');
}

function resetMenus() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert('รีเซ็ตเมนู', 'ลบเมนูทั้งหมดและใส่ข้อมูลเริ่มต้น 43 รายการใหม่?', ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Menus');
  if (!sh) { ui.alert('ยังไม่มีชีท Menus — รัน Setup Database ก่อน'); return; }
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  const now = new Date();
  writeRows_('Menus', SEED_MENUS.map(([id, name, cat, variant, price, active, emoji]) => [id, name, cat, variant, price, active, now, now, emoji]));
  formatMenus_();
  ui.alert('✓ รีเซ็ตเมนูเรียบร้อย (' + SEED_MENUS.length + ' รายการ)');
}

function clearBills() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert('ลบบิลทั้งหมด', 'ลบข้อมูลใน Bills + BillItems?\n(การกระทำนี้ย้อนกลับไม่ได้)', ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;
  ['Bills', 'BillItems'].forEach(name => {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  });
  ui.alert('✓ ลบบิลเรียบร้อย');
}

function verifySchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lines = [];
  SHEET_ORDER.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) { lines.push('❌ ' + name + ' — ไม่พบ'); return; }
    const headers = sh.getRange(1, 1, 1, SHEET_CONFIG[name].headers.length).getValues()[0];
    const ok = JSON.stringify(headers) === JSON.stringify(SHEET_CONFIG[name].headers);
    const rowCount = Math.max(0, sh.getLastRow() - 1);
    lines.push((ok ? '✓' : '⚠️') + ' ' + name + ' — ' + rowCount + ' แถว');
  });
  SpreadsheetApp.getUi().alert('ตรวจสอบโครงสร้าง', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}
