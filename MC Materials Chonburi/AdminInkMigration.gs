/**
 * One-time production migration for every ink product, purchase, withdrawal,
 * current balance and purchase reason contained in InkSeedData.gs.
 * Existing operational rows are never overwritten.
 */
function previewInkMigration() {
  adminAuthorize_();
  var plan = adminInkMigrationPlan_();
  var result = adminInkMigrationSummary_(plan);
  Logger.log(JSON.stringify(result));
  return result;
}

function migrateAllInkData() {
  var actor = adminAuthorize_();
  return materialWithLock_(function () {
    var plan = adminInkMigrationPlan_();
    if (plan.blockers.length) throw new Error('INK_MIGRATION_BLOCKED: ' + plan.blockers.slice(0, 8).join('; '));

    var changed = plan.missingProducts.length + plan.missingDocuments.length +
      plan.missingLines.length + plan.missingReasons.length;
    if (!changed && plan.system.INK_MIGRATION_STATUS === 'COMPLETED') {
      var unchanged = adminInkMigrationSummary_(plan);
      unchanged.migrated = true;
      unchanged.rowsAdded = 0;
      unchanged.backupUrl = plan.system.INK_MIGRATION_BACKUP_ID ?
        'https://docs.google.com/spreadsheets/d/' + plan.system.INK_MIGRATION_BACKUP_ID + '/edit' : '';
      Logger.log(JSON.stringify(unchanged));
      return unchanged;
    }
    var backupId = plan.system.INK_MIGRATION_BACKUP_ID || '';
    if (changed && !backupId) {
      var spreadsheet = materialSpreadsheet_();
      var copyName = spreadsheet.getName() + ' - สำรองก่อนย้ายข้อมูลหมึก ' +
        Utilities.formatDate(new Date(), MATERIAL_CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
      backupId = DriveApp.getFileById(spreadsheet.getId()).makeCopy(copyName).getId();
      materialUpsertSystem_(adminSheet_('system'), 'INK_MIGRATION_BACKUP_ID', backupId);
    }

    materialAppendRows_(adminSheet_('inkProducts'), plan.missingProducts, MATERIAL_SCHEMA.inkProducts.length);
    materialAppendRows_(adminSheet_('inkDocuments'), plan.missingDocuments, MATERIAL_SCHEMA.inkDocuments.length);
    materialAppendRows_(adminSheet_('inkDocumentLines'), plan.missingLines, MATERIAL_SCHEMA.inkDocumentLines.length);
    materialAppendRows_(adminSheet_('inkReasons'), plan.missingReasons, MATERIAL_SCHEMA.inkReasons.length);
    materialRaiseSequence_(adminSheet_('system'), 'INK_PRODUCT_SEQUENCE', plan.expected.products.length);
    materialRaiseSequence_(adminSheet_('system'), 'INK_DOCUMENT_SEQUENCE', plan.expected.documents.length);
    materialUpsertSystem_(adminSheet_('system'), 'INK_MIGRATION_STATUS', 'COMPLETED');
    materialUpsertSystem_(adminSheet_('system'), 'INK_MIGRATION_PRODUCT_COUNT', String(plan.expected.products.length));
    materialUpsertSystem_(adminSheet_('system'), 'INK_MIGRATION_DOCUMENT_COUNT', String(plan.expected.documents.length));
    materialUpsertSystem_(adminSheet_('system'), 'INK_MIGRATION_LINE_COUNT', String(plan.expected.lines.length));
    materialUpsertSystem_(adminSheet_('system'), 'INK_MIGRATION_REASON_COUNT', String(plan.expected.reasons.length));
    materialUpsertSystem_(adminSheet_('system'), 'INK_SOURCE_SHA256', MATERIAL_INK_SEED.sourceSha256);
    adminAudit_(actor, 'INK_MIGRATION_COMPLETE', 'INK', 'ALL', null, {
      productsAdded: plan.missingProducts.length,
      documentsAdded: plan.missingDocuments.length,
      linesAdded: plan.missingLines.length,
      reasonsAdded: plan.missingReasons.length,
      backupId: backupId
    }, 'INK-MIGRATION-' + MATERIAL_INK_SEED.sourceSha256.slice(0, 16));
    SpreadsheetApp.flush();

    var verified = adminInkMigrationPlan_();
    if (verified.blockers.length || verified.missingProducts.length || verified.missingDocuments.length ||
        verified.missingLines.length || verified.missingReasons.length) {
      throw new Error('INK_MIGRATION_VERIFY_FAILED: ข้อมูลหมึกยังไม่ครบหลังการย้าย');
    }
    var result = adminInkMigrationSummary_(verified);
    result.migrated = true;
    result.rowsAdded = changed;
    result.backupUrl = backupId ? 'https://docs.google.com/spreadsheets/d/' + backupId + '/edit' : '';
    Logger.log(JSON.stringify(result));
    return result;
  });
}

function adminInkMigrationPlan_() {
  var actor = adminAuthorize_();
  var now = new Date();
  var expected = adminExpectedInkRows_(now, actor);
  var system = adminSystem_();
  var blockers = [];

  function indexRows(key, label) {
    var index = {};
    adminRows_(key).forEach(function (row) {
      var id = adminText_(row[0]);
      if (!id) return;
      if (index[id]) blockers.push(label + 'ซ้ำ: ' + id);
      index[id] = row;
    });
    return index;
  }

  var productIndex = indexRows('inkProducts', 'รหัสหมึก');
  var documentIndex = indexRows('inkDocuments', 'รหัสเอกสารหมึก');
  var lineIndex = indexRows('inkDocumentLines', 'รหัสรายการเอกสารหมึก');
  var reasonIndex = indexRows('inkReasons', 'รหัสเหตุผล');
  var missingProducts = [];
  var missingDocuments = [];
  var missingLines = [];
  var missingReasons = [];

  expected.products.forEach(function (row) {
    var current = productIndex[row[0]];
    if (!current) { missingProducts.push(row); return; }
    if (materialNormalizeInkName_(current[1]) !== materialNormalizeInkName_(row[1])) blockers.push('ข้อมูลรุ่นหมึกไม่ตรงกัน: ' + row[0]);
  });
  expected.documents.forEach(function (row) {
    var current = documentIndex[row[0]];
    if (!current) { missingDocuments.push(row); return; }
    if (adminText_(current[1]) !== adminText_(row[1])) blockers.push('ประเภทเอกสารหมึกไม่ตรงกัน: ' + row[0]);
  });
  expected.lines.forEach(function (row) {
    var current = lineIndex[row[0]];
    if (!current) { missingLines.push(row); return; }
    if (adminText_(current[1]) !== adminText_(row[1]) || adminText_(current[3]) !== adminText_(row[3])) blockers.push('รายการเอกสารหมึกไม่ตรงกัน: ' + row[0]);
  });
  expected.reasons.forEach(function (row) {
    var current = reasonIndex[row[0]];
    if (!current) { missingReasons.push(row); return; }
    if (adminText_(current[5]) !== adminText_(row[5])) blockers.push('เหตุผลการซื้อหมึกไม่ตรงกัน: ' + row[0]);
  });

  return {
    system: system,
    expected: expected,
    blockers: blockers,
    missingProducts: missingProducts,
    missingDocuments: missingDocuments,
    missingLines: missingLines,
    missingReasons: missingReasons
  };
}

function adminExpectedInkRows_(now, actor) {
  var productRows = [];
  var productMap = {};
  MATERIAL_INK_SEED.balances.forEach(function (source, index) {
    var id = 'INK-' + materialPad_(index + 1, 4);
    productMap[materialNormalizeInkName_(source.cells[1])] = id;
    productRows.push([
      id, source.cells[1], Number(source.cells[2] || 0), Number(source.cells[3] || 0),
      Number(source.cells[2] || 0), Number(source.cells[3] || 0), '', '', false,
      source.sourceRow, now, actor, now, actor, 1
    ]);
  });

  var documentRows = [];
  var lineRows = [];
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

  var reasonRows = [];
  var title = MATERIAL_INK_SEED.purchaseNotes[0];
  MATERIAL_INK_SEED.purchaseNotes.slice(1).forEach(function (reason, index) {
    reasonRows.push([
      'INK-REASON-' + materialPad_(index + 1, 4), 'INK-NOTE-0001', title, 1, index + 1,
      String(reason).replace(/^\s*\d+\.\s*/, '').trim(), true, now, actor, now, actor, 1
    ]);
  });
  return { products: productRows, documents: documentRows, lines: lineRows, reasons: reasonRows };
}

function adminInkMigrationSummary_(plan) {
  return {
    ok: plan.blockers.length === 0,
    products: plan.expected.products.length,
    purchaseDocuments: MATERIAL_INK_SEED.groups.length,
    withdrawalDocuments: plan.expected.documents.length - MATERIAL_INK_SEED.groups.length,
    documents: plan.expected.documents.length,
    documentLines: plan.expected.lines.length,
    purchaseLines: MATERIAL_INK_SEED.groups.reduce(function (sum, group) { return sum + group.rows.length; }, 0),
    withdrawalLines: MATERIAL_INK_SEED.withdrawals.length,
    reasons: plan.expected.reasons.length,
    stockValue: Number(MATERIAL_INK_SEED.stockTotal || 0),
    missingProducts: plan.missingProducts.length,
    missingDocuments: plan.missingDocuments.length,
    missingLines: plan.missingLines.length,
    missingReasons: plan.missingReasons.length,
    completed: plan.system.INK_MIGRATION_STATUS === 'COMPLETED',
    blockers: plan.blockers
  };
}
