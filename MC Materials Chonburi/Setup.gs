var MATERIAL_AUTO_IMPORT_CATEGORIES = Object.freeze([
  'CAT-OFFICE', 'CAT-MEDICAL', 'CAT-HOUSEKEEPING', 'CAT-PRINTED', 'CAT-IT',
  'CAT-MEDSUP-5', 'CAT-MEDSUP'
]);

var MATERIAL_DEPARTMENT_SEED = Object.freeze([
  Object.freeze(['DEP-ADMIN', 'บริหาร', 'Administration', 'นางสาวอุไร คูณค้ำ', 'นักวิชาการศึกษา', 10]),
  Object.freeze(['DEP-ACADEMIC', 'วิชาการ', 'Academic', 'นางอำภา สมการ', 'นักวิชาการศึกษา', 20])
]);

var MATERIAL_SIGNATORY_SEED = Object.freeze([
  Object.freeze(['SIG-REQ-ISSUER', 'REQUISITION', '', 'ผู้สั่งจ่าย', 'นางสาวธัญธรัตน์ สมบูรณ์เงิน', 'เจ้าพนักงานธุรการ', '', 10]),
  Object.freeze(['SIG-REQ-APPROVER', 'REQUISITION', '', 'ผู้อนุมัติจ่าย', 'ผศ.พิเศษ นายแพทย์อาทิตย์ ต่อพงษ์พันธุ์', 'ผู้อำนวยการศูนย์แพทยศาสตรศึกษาชั้นคลินิก', 'โรงพยาบาลชลบุรี', 20]),
  Object.freeze(['SIG-FISCAL-APPROVER', 'FISCAL_REPORT', '', 'ผู้รับรองรายงาน', 'ผศ.พิเศษ นายแพทย์อาทิตย์ ต่อพงษ์พันธุ์', 'ผู้อำนวยการศูนย์แพทยศาสตรศึกษาชั้นคลินิก', 'โรงพยาบาลชลบุรี', 10])
]);

/** Select this function in Google Apps Script and press Run once. */
function createMaterialDatabase() {
  return setupMaterialDatabase();
}

function setupMaterialDatabase() {
  var actor = materialSetupActor_();
  return materialWithLock_(function () {
    var spreadsheet = materialSpreadsheet_();
    var sheets = {};
    MATERIAL_SHEET_DEFINITIONS.forEach(function (definition, index) {
      sheets[definition.key] = materialEnsureSheet_(spreadsheet, definition, index === 0);
    });

    var now = new Date();
    materialMigrateLegacyRows_(sheets);
    var added = {
      categories: materialSeedCategories_(sheets.categories, now, actor),
      departments: materialSeedDepartments_(sheets.departments, now, actor),
      importRows: materialSeedImportReview_(sheets.importReview, now),
      fiscalYears: materialSeedFiscalYear_(sheets.fiscalYears, now, actor),
      users: materialSeedUsers_(sheets.users, now, actor),
      signatories: materialSeedSignatories_(sheets.signatories, now, actor)
    };

    var stockSeed = materialBootstrapImportedMaterials_(sheets, now, actor);
    added.materials = stockSeed.materials;
    added.fiscalPeriods = stockSeed.fiscalPeriods;
    added.ledgerRows = stockSeed.ledgerRows;

    var inkSeed = materialSeedInkDatabase_(sheets, now, actor);
    added.inkProducts = inkSeed.products;
    added.inkDocuments = inkSeed.documents;
    added.inkDocumentLines = inkSeed.lines;
    added.inkReasons = inkSeed.reasons;

    materialUpsertSystem_(sheets.system, 'SCHEMA_VERSION', MATERIAL_CONFIG.SCHEMA_VERSION);
    materialUpsertSystem_(sheets.system, 'SOURCE_FILE', MATERIAL_SEED_META.sourceName);
    materialUpsertSystem_(sheets.system, 'SOURCE_SHA256', MATERIAL_SEED_META.sourceSha256);
    materialUpsertSystem_(sheets.system, 'SOURCE_RECORD_COUNT', String(MATERIAL_SEED_META.recordCount));
    materialUpsertSystem_(sheets.system, 'INK_SOURCE_FILE', MATERIAL_INK_SEED.sourceName);
    materialUpsertSystem_(sheets.system, 'INK_SOURCE_SHA256', MATERIAL_INK_SEED.sourceSha256);
    materialEnsureSystem_(sheets.system, 'ACTIVE_FISCAL_YEAR', String(MATERIAL_CONFIG.INITIAL_FISCAL_YEAR));
    materialRaiseSequence_(sheets.system, 'MATERIAL_SEQUENCE', stockSeed.materialSequence);
    materialRaiseSequence_(sheets.system, 'LEDGER_SEQUENCE', stockSeed.ledgerSequence);
    materialRaiseSequence_(sheets.system, 'REQUISITION_SEQUENCE', 0);
    materialRaiseSequence_(sheets.system, 'INK_PRODUCT_SEQUENCE', MATERIAL_INK_SEED.balances.length);
    materialRaiseSequence_(sheets.system, 'INK_DOCUMENT_SEQUENCE', inkSeed.documents);
    materialRaiseSequence_(sheets.system, 'MEDIA_SEQUENCE', 0);
    materialEnsureSystem_(sheets.system, 'SETUP_COMPLETED_AT', now.toISOString());
    materialUpsertSystem_(sheets.system, 'LAST_SETUP_AT', now.toISOString());
    materialEnsureAccessCode_();
    materialEnsureMediaFolder_(sheets.system);

    var addedCount = Object.keys(added).reduce(function (sum, key) { return sum + Number(added[key] || 0); }, 0);
    if (addedCount > 0) {
      materialAppendRows_(sheets.audit, [[
        'AUD-' + Utilities.getUuid(), now, actor, 'SETUP_DATABASE', 'SYSTEM',
        MATERIAL_CONFIG.SCHEMA_VERSION, '', JSON.stringify(added), 'SETUP-' + MATERIAL_CONFIG.SCHEMA_VERSION + '-' + now.getTime()
      ]], MATERIAL_SCHEMA.audit.length);
    }

    MATERIAL_SHEET_DEFINITIONS.forEach(function (definition) {
      var sheet = sheets[definition.key];
      materialFormatSheet_(sheet, MATERIAL_SCHEMA[definition.key].length, definition.color);
      materialApplySheetLayout_(sheet, definition);
      materialApplyValidations_(sheet, definition.key);
      if (definition.hidden && !sheet.isSheetHidden()) sheet.hideSheet();
    });
    spreadsheet.setActiveSheet(sheets.materials);
    SpreadsheetApp.flush();
    return materialDatabaseSummary_(sheets, added);
  });
}

function validateMaterialDatabase() {
  materialSetupActor_();
  var spreadsheet = materialSpreadsheet_();
  var sheets = {};
  MATERIAL_SHEET_DEFINITIONS.forEach(function (definition) {
    var sheet = spreadsheet.getSheetByName(definition.name);
    if (!sheet) throw new Error('SCHEMA: ไม่พบชีท ' + definition.name);
    materialAssertOrCreateHeader_(sheet, MATERIAL_SCHEMA[definition.key]);
    sheets[definition.key] = sheet;
  });
  var system = materialSystemMap_(sheets.system);
  if (system.SCHEMA_VERSION !== MATERIAL_CONFIG.SCHEMA_VERSION) throw new Error('SCHEMA: เวอร์ชันฐานข้อมูลไม่ตรงกับโค้ด');
  if (system.SOURCE_SHA256 !== MATERIAL_SEED_META.sourceSha256) throw new Error('SOURCE: ไฟล์วัสดุต้นทางไม่ตรงกับชุดข้อมูลในโค้ด');
  if (system.INK_SOURCE_SHA256 !== MATERIAL_INK_SEED.sourceSha256) throw new Error('SOURCE: ไฟล์หมึกต้นทางไม่ตรงกับชุดข้อมูลในโค้ด');
  var openYears = materialColumnValues_(sheets.fiscalYears, 5).filter(function (status) { return status === 'OPEN'; });
  if (openYears.length !== 1) throw new Error('DATA: ต้องมีปีงบประมาณสถานะ OPEN เพียงหนึ่งปี');
  return materialDatabaseSummary_(sheets, {});
}

function materialSeedCategories_(sheet, now, actor) {
  var existing = materialRowMap_(sheet, 1);
  var rows = MATERIAL_CATEGORY_SEED.filter(function (row) { return !existing[row[0]]; }).map(function (row) {
    return [row[0], row[1], row[2], row[3], row[4], true, 1, now, actor, now, actor];
  });
  materialAppendRows_(sheet, rows, MATERIAL_SCHEMA.categories.length);
  return rows.length;
}

function materialSeedDepartments_(sheet, now, actor) {
  var existing = materialRowMap_(sheet, 1);
  var rows = MATERIAL_DEPARTMENT_SEED.filter(function (row) { return !existing[row[0]]; }).map(function (row) {
    return row.slice().concat([true, now, actor, now, actor, 1]);
  });
  materialAppendRows_(sheet, rows, MATERIAL_SCHEMA.departments.length);
  return rows.length;
}

function materialSeedImportReview_(sheet, now) {
  var existing = materialRowMap_(sheet, 2);
  var rows = MATERIAL_IMPORT_SEED.filter(function (row) { return !existing[row[1]]; }).map(function (row) {
    var copy = row.slice();
    copy[20] = now;
    copy.push(MATERIAL_CONFIG.INITIAL_FISCAL_YEAR);
    return copy;
  });
  materialAppendRows_(sheet, rows, MATERIAL_SCHEMA.importReview.length);
  return rows.length;
}

function materialSeedFiscalYear_(sheet, now, actor) {
  var year = MATERIAL_CONFIG.INITIAL_FISCAL_YEAR;
  var id = 'FY-' + year;
  if (materialRowMap_(sheet, 1)[id]) return 0;
  materialAppendRows_(sheet, [[
    id, year, materialDate_((year - 544) + '-10-01'), materialDate_((year - 543) + '-09-30'),
    'OPEN', now, actor, '', '', 1
  ]], MATERIAL_SCHEMA.fiscalYears.length);
  return 1;
}

function materialSeedUsers_(sheet, now, actor) {
  var existing = materialRowMap_(sheet, 1);
  var rows = MATERIAL_CONFIG.ADMIN_EMAILS.filter(function (email) { return !existing[email]; }).map(function (email) {
    return [email, '', 'ADMIN', true, now, actor, now, actor, 1];
  });
  materialAppendRows_(sheet, rows, MATERIAL_SCHEMA.users.length);
  return rows.length;
}

function materialSeedSignatories_(sheet, now, actor) {
  var existing = materialRowMap_(sheet, 1);
  var rows = MATERIAL_SIGNATORY_SEED.filter(function (row) { return !existing[row[0]]; }).map(function (row) {
    return row.slice().concat([true, now, actor, now, actor, 1]);
  });
  materialAppendRows_(sheet, rows, MATERIAL_SCHEMA.signatories.length);
  return rows.length;
}

function materialBootstrapImportedMaterials_(sheets, now, actor) {
  if (sheets.materials.getLastRow() > 1 || sheets.fiscalPeriods.getLastRow() > 1 || sheets.ledger.getLastRow() > 1) {
    return { materials: 0, fiscalPeriods: 0, ledgerRows: 0, materialSequence: Math.max(0, sheets.materials.getLastRow() - 1), ledgerSequence: Math.max(0, sheets.ledger.getLastRow() - 1) };
  }
  var categoryPrefixes = {};
  MATERIAL_CATEGORY_SEED.forEach(function (row) { categoryPrefixes[row[0]] = row[1]; });
  var categoryCounts = {};
  var materialRows = [];
  var periodRows = [];
  var ledgerRows = [];
  var reviewRows = materialRowMap_(sheets.importReview, 2);
  var materialSequence = 0;
  var ledgerSequence = 0;
  MATERIAL_IMPORT_SEED.forEach(function (source) {
    if (MATERIAL_AUTO_IMPORT_CATEGORIES.indexOf(source[4]) < 0) return;
    materialSequence += 1;
    categoryCounts[source[4]] = (categoryCounts[source[4]] || 0) + 1;
    var materialId = 'MAT-' + materialPad_(materialSequence, 6);
    var materialCode = categoryPrefixes[source[4]] + '-' + materialPad_(categoryCounts[source[4]], 4);
    var balance = Number(source[13] || 0);
    var reconciliation = materialRound_(balance - (Number(source[9] || 0) + Number(source[10] || 0) - Number(source[12] || 0)));
    materialRows.push([
      materialId, materialCode, source[4], source[7], source[8], '', balance, 0, 0,
      true, now, actor, now, actor, 1, Number(source[14] || 0), '', '', '', '', ''
    ]);
    periodRows.push([
      'PER-' + MATERIAL_CONFIG.INITIAL_FISCAL_YEAR + '-' + materialId, materialId, materialCode, source[7],
      MATERIAL_CONFIG.INITIAL_FISCAL_YEAR, Number(source[9] || 0), Number(source[10] || 0), Number(source[12] || 0),
      balance, reconciliation, Number(source[11] || 0), Number(source[14] || 0), Number(source[15] || 0), '',
      false, '', '', 0, 0, 0, 0, balance, 'IMPORTED_EXCEL', source[0], now, 1
    ]);
    if (balance > 0) {
      ledgerSequence += 1;
      ledgerRows.push([
        'STK-' + materialPad_(ledgerSequence, 8), materialId, 'CUTOVER', balance, balance,
        'IMPORT', source[0], 'ยอดคงเหลือ ณ จุดเริ่มใช้ระบบ', now, actor,
        'SETUP-CUTOVER-' + materialId, MATERIAL_CONFIG.INITIAL_FISCAL_YEAR, materialCode, source[7]
      ]);
    }
    var rowNumber = reviewRows[source[1]];
    if (rowNumber) {
      sheets.importReview.getRange(rowNumber, 18, 1, 7).setValues([[
        'APPROVED', 'นำเข้าจากไฟล์ต้นฉบับอัตโนมัติ', materialId, now, now, actor, 2
      ]]);
    }
  });
  materialAppendRows_(sheets.materials, materialRows, MATERIAL_SCHEMA.materials.length);
  materialAppendRows_(sheets.fiscalPeriods, periodRows, MATERIAL_SCHEMA.fiscalPeriods.length);
  materialAppendRows_(sheets.ledger, ledgerRows, MATERIAL_SCHEMA.ledger.length);
  return { materials: materialRows.length, fiscalPeriods: periodRows.length, ledgerRows: ledgerRows.length, materialSequence: materialSequence, ledgerSequence: ledgerSequence };
}

function materialSeedInkDatabase_(sheets, now, actor) {
  var productMap = {};
  var productExisting = materialRowMap_(sheets.inkProducts, 1);
  var productRows = [];
  MATERIAL_INK_SEED.balances.forEach(function (source, index) {
    var id = 'INK-' + materialPad_(index + 1, 4);
    productMap[materialNormalizeInkName_(source.cells[1])] = id;
    if (productExisting[id]) return;
    productRows.push([
      id, source.cells[1], Number(source.cells[2] || 0), Number(source.cells[3] || 0),
      Number(source.cells[2] || 0), Number(source.cells[3] || 0), '', '', false,
      source.sourceRow, now, actor, now, actor, 1
    ]);
  });
  materialAppendRows_(sheets.inkProducts, productRows, MATERIAL_SCHEMA.inkProducts.length);

  var documentRows = [];
  var lineRows = [];
  if (sheets.inkDocuments.getLastRow() < 2 && sheets.inkDocumentLines.getLastRow() < 2) {
    var purchaseDates = { '15': '2025-12-08', '31': '2026-06-08' };
    MATERIAL_INK_SEED.groups.forEach(function (group, groupIndex) {
      var documentId = 'INK-SRC-PUR-' + group.id;
      documentRows.push([
        documentId, 'PURCHASE', groupIndex + 1, group.year,
        purchaseDates[group.id] ? materialDate_(purchaseDates[group.id]) : '', '', '', group.note || '',
        'IMPORTED_HISTORY', 'PURCHASE_GROUP_' + group.id, false, now, actor, now, actor, 1
      ]);
      group.rows.forEach(function (source, lineIndex) {
        var name = source.cells[1];
        lineRows.push([
          'INK-LINE-P-' + group.id + '-' + source.sourceRow, documentId, lineIndex + 1,
          productMap[materialNormalizeInkName_(name)] || '', name, Number(source.cells[2] || 0),
          Number(source.cells[3] || 0), Number(source.cells[4] || 0)
        ]);
      });
    });
    var withdrawalGroups = {};
    MATERIAL_INK_SEED.withdrawals.forEach(function (source) {
      var key = source.dateISO + '|' + source.cells[1];
      if (!withdrawalGroups[key]) withdrawalGroups[key] = [];
      withdrawalGroups[key].push(source);
    });
    Object.keys(withdrawalGroups).sort().forEach(function (key, groupIndex) {
      var sources = withdrawalGroups[key];
      var department = sources[0].cells[1];
      var documentId = 'INK-SRC-ISS-' + sources[0].dateISO.replace(/-/g, '') + '-' + materialPad_(groupIndex + 1, 3);
      documentRows.push([
        documentId, 'WITHDRAWAL', MATERIAL_INK_SEED.groups.length + groupIndex + 1, sources[0].year,
        materialDate_(sources[0].dateISO), materialDepartmentId_(department), department, '',
        'IMPORTED_HISTORY', 'WITHDRAWAL_ROWS_' + sources[0].sourceRow + '_' + sources[sources.length - 1].sourceRow,
        false, now, actor, now, actor, 1
      ]);
      sources.forEach(function (source, lineIndex) {
        var name = source.cells[2];
        lineRows.push([
          'INK-LINE-W-' + source.sourceRow, documentId, lineIndex + 1,
          productMap[materialNormalizeInkName_(name)] || '', name, Number(source.cells[3] || 0), 0, 0
        ]);
      });
    });
    materialAppendRows_(sheets.inkDocuments, documentRows, MATERIAL_SCHEMA.inkDocuments.length);
    materialAppendRows_(sheets.inkDocumentLines, lineRows, MATERIAL_SCHEMA.inkDocumentLines.length);
  }

  var reasonExisting = materialRowMap_(sheets.inkReasons, 1);
  var reasonRows = [];
  var title = MATERIAL_INK_SEED.purchaseNotes[0];
  MATERIAL_INK_SEED.purchaseNotes.slice(1).forEach(function (reason, index) {
    var id = 'INK-REASON-' + materialPad_(index + 1, 4);
    if (reasonExisting[id]) return;
    reasonRows.push([
      id, 'INK-NOTE-0001', title, 1, index + 1,
      String(reason).replace(/^\s*\d+\.\s*/, '').trim(), true, now, actor, now, actor, 1
    ]);
  });
  materialAppendRows_(sheets.inkReasons, reasonRows, MATERIAL_SCHEMA.inkReasons.length);
  return { products: productRows.length, documents: documentRows.length, lines: lineRows.length, reasons: reasonRows.length };
}

function materialMigrateLegacyRows_(sheets) {
  materialFillBlankColumn_(sheets.importReview, 25, MATERIAL_CONFIG.INITIAL_FISCAL_YEAR);
  materialFillBlankColumn_(sheets.materials, 16, 0);
  materialFillBlankColumn_(sheets.materials, 17, '');
  materialFillBlankColumn_(sheets.ledger, 12, MATERIAL_CONFIG.INITIAL_FISCAL_YEAR);
}

function materialFillBlankColumn_(sheet, column, fallback) {
  if (sheet.getLastRow() < 2) return;
  var range = sheet.getRange(2, column, sheet.getLastRow() - 1, 1);
  var values = range.getValues();
  var changed = false;
  values.forEach(function (row) {
    if (row[0] === '' || row[0] == null) { row[0] = fallback; changed = true; }
  });
  if (changed) range.setValues(values);
}

function materialUpsertSystem_(sheet, key, value) {
  var rows = materialRowMap_(sheet, 1);
  if (rows[key]) sheet.getRange(rows[key], 2).setValue(value);
  else materialAppendRows_(sheet, [[key, value]], MATERIAL_SCHEMA.system.length);
}

function materialEnsureSystem_(sheet, key, initialValue) {
  if (!materialRowMap_(sheet, 1)[key]) materialAppendRows_(sheet, [[key, initialValue]], MATERIAL_SCHEMA.system.length);
}

function materialRaiseSequence_(sheet, key, minimum) {
  var rows = materialRowMap_(sheet, 1);
  if (!rows[key]) {
    materialAppendRows_(sheet, [[key, String(minimum)]], MATERIAL_SCHEMA.system.length);
    return;
  }
  var current = Number(sheet.getRange(rows[key], 2).getValue() || 0);
  if (!Number.isSafeInteger(current) || current < minimum) sheet.getRange(rows[key], 2).setValue(String(minimum));
}

function materialEnsureAccessCode_() {
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('USER_ACCESS_CODE_SHA256')) {
    properties.setProperty('USER_ACCESS_CODE_SHA256', materialSha256_(MATERIAL_CONFIG.INITIAL_USER_ACCESS_CODE));
  }
}

function materialEnsureMediaFolder_(systemSheet) {
  if (typeof DriveApp === 'undefined') return;
  var system = materialSystemMap_(systemSheet);
  if (system.MEDIA_FOLDER_ID) {
    try { DriveApp.getFolderById(system.MEDIA_FOLDER_ID).getName(); return; } catch (error) {}
  }
  var folder = DriveApp.createFolder(MATERIAL_CONFIG.APP_NAME + ' - รูปวัสดุ');
  materialUpsertSystem_(systemSheet, 'MEDIA_FOLDER_ID', folder.getId());
}

function materialSystemMap_(sheet) {
  var result = {};
  if (sheet.getLastRow() < 2) return result;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues().forEach(function (row) {
    if (!row[0] || Object.prototype.hasOwnProperty.call(result, row[0])) throw new Error('DATA: คีย์ระบบว่างหรือซ้ำ');
    result[row[0]] = row[1];
  });
  return result;
}

function materialDatabaseSummary_(sheets, added) {
  var counts = {};
  MATERIAL_SHEET_DEFINITIONS.forEach(function (definition) {
    counts[definition.key] = Math.max(0, sheets[definition.key].getLastRow() - 1);
  });
  var reviewStatus = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  materialColumnValues_(sheets.importReview, 18).forEach(function (status) {
    reviewStatus[status] = (reviewStatus[status] || 0) + 1;
  });
  return {
    ok: true,
    schemaVersion: MATERIAL_CONFIG.SCHEMA_VERSION,
    spreadsheetId: materialSpreadsheet_().getId ? materialSpreadsheet_().getId() : MATERIAL_CONFIG.SPREADSHEET_ID,
    spreadsheetName: materialSpreadsheet_().getName(),
    sheetCount: MATERIAL_SHEET_DEFINITIONS.length,
    counts: counts,
    categories: counts.categories,
    importRows: counts.importReview,
    materials: counts.materials,
    ledgerRows: counts.ledger,
    added: added || {},
    reviewStatus: reviewStatus,
    sourceSha256: MATERIAL_SEED_META.sourceSha256,
    inkSourceSha256: MATERIAL_INK_SEED.sourceSha256
  };
}

function materialColumnValues_(sheet, column) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getDisplayValues().map(function (row) { return row[0]; });
}

function materialDate_(isoDate) {
  return new Date(isoDate + 'T00:00:00+07:00');
}

function materialDepartmentId_(name) {
  return name === 'บริหาร' ? 'DEP-ADMIN' : name === 'วิชาการ' ? 'DEP-ACADEMIC' : '';
}

function materialNormalizeInkName_(value) {
  return String(value || '').toLocaleLowerCase().replace(/^หมึก\s+/, '').replace(/\s+/g, '').replace(/\(375\)/g, '');
}

function materialRound_(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function materialPad_(value, size) {
  return String(value).padStart(size, '0');
}

function materialSha256_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(function (item) { return ('0' + ((item + 256) % 256).toString(16)).slice(-2); }).join('');
}
