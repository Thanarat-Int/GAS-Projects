/**
 * One-time migration for the 134 source rows already in the ตรวจนำเข้า sheet.
 * Copy only to the Admin Apps Script project. Run previewMaterialBulkImport first.
 */
function previewMaterialBulkImport() {
  adminAuthorize_();
  var plan = adminBulkImportPlan_();
  var result = adminBulkImportSummary_(plan);
  Logger.log(JSON.stringify(result));
  return result;
}

function importPendingMaterialReviews() {
  var actor = adminAuthorize_();
  return materialWithLock_(function () {
    var plan = adminBulkImportPlan_();
    if (plan.blockers.length) throw new Error('BULK_IMPORT_BLOCKED: ' + plan.blockers.slice(0, 8).join('; '));
    if (!plan.pending.length) {
      var unchanged = adminBulkImportSummary_(plan);
      Logger.log(JSON.stringify(unchanged));
      return unchanged;
    }

    // A Drive copy is made before any row is changed. Existing backup is reused on retry.
    var backupId = plan.system.BULK_IMPORT_BACKUP_ID;
    if (!backupId) {
      var spreadsheet = materialSpreadsheet_();
      var copyName = spreadsheet.getName() + ' - สำรองก่อนนำเข้าวัสดุ ' +
        Utilities.formatDate(new Date(), MATERIAL_CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
      backupId = DriveApp.getFileById(spreadsheet.getId()).makeCopy(copyName).getId();
      materialUpsertSystem_(adminSheet_('system'), 'BULK_IMPORT_BACKUP_ID', backupId);
    }

    var now = new Date();
    var materialSequence = plan.materialSequence;
    var ledgerSequence = plan.ledgerSequence;
    var categoryNumbers = plan.categoryNumbers;
    var materialRows = [];
    var periodRows = [];
    var ledgerRows = [];
    var completed = 0;
    var repaired = 0;

    plan.pending.forEach(function (entry) {
      var source = entry.row;
      var reviewId = adminText_(source[0]);
      var categoryId = adminText_(source[4]);
      var name = adminText_(source[7]);
      var unit = adminText_(source[8]);
      var balance = Number(source[13]);
      var material = entry.material;
      var materialId;
      var code;

      if (material) {
        materialId = adminText_(material[0]);
        code = adminText_(material[1]);
        repaired += 1;
      } else {
        materialSequence += 1;
        categoryNumbers[categoryId] = (categoryNumbers[categoryId] || 0) + 1;
        materialId = 'MAT-' + materialPad_(materialSequence, 6);
        code = plan.categoryPrefixes[categoryId] + '-' + materialPad_(categoryNumbers[categoryId], 4);
        materialRows.push([
          materialId, code, categoryId, name, unit, '', balance, 0, 0, true,
          now, actor, now, actor, 1, Number(source[14]), 'IMPORT_REVIEW:' + reviewId,
          '', '', '', ''
        ]);
      }

      if (!entry.period) {
        periodRows.push(adminCreateFiscalPeriodRow_({ id: materialId, code: code, name: name }, plan.year, {
          openingBalance: Number(source[9]), receivedBeforeSystem: Number(source[10]),
          issuedBeforeSystem: Number(source[12]), cutoverBalance: balance,
          reportedTotalReceived: Number(source[11]), latestPrice: Number(source[14]),
          reportedValue: Number(source[15]),
          note: adminText_(source[16]) ? 'ประเด็นจาก Excel: ' + adminText_(source[16]) : ''
        }, actor, 'IMPORTED_EXCEL', reviewId));
      }

      if (balance > 0 && !entry.ledger) {
        ledgerSequence += 1;
        ledgerRows.push([
          'STK-' + materialPad_(ledgerSequence, 8), materialId, 'CUTOVER', balance, balance,
          'IMPORT', reviewId, 'ยอดคงเหลือ ณ วันนำเข้า', now, actor,
          'BULK-IMPORT-' + reviewId, plan.year, code, name
        ]);
      }

      source[17] = 'APPROVED';
      source[18] = adminText_(source[18]) || 'นำเข้าแบบกลุ่มจากข้อมูล Excel';
      source[19] = materialId;
      source[20] = source[20] || now;
      source[21] = now;
      source[22] = actor;
      source[23] = adminNumber_(source[23]) + 1;
      completed += 1;
    });

    // These stages can be retried safely after a partial Apps Script failure.
    materialAppendRows_(adminSheet_('materials'), materialRows, MATERIAL_SCHEMA.materials.length);
    materialAppendRows_(adminSheet_('fiscalPeriods'), periodRows, MATERIAL_SCHEMA.fiscalPeriods.length);
    materialAppendRows_(adminSheet_('ledger'), ledgerRows, MATERIAL_SCHEMA.ledger.length);
    materialRaiseSequence_(adminSheet_('system'), 'MATERIAL_SEQUENCE', materialSequence);
    materialRaiseSequence_(adminSheet_('system'), 'LEDGER_SEQUENCE', ledgerSequence);
    adminSheet_('importReview').getRange(2, 1, plan.reviews.length, MATERIAL_SCHEMA.importReview.length).setValues(plan.reviews);
    adminAudit_(actor, 'BULK_IMPORT_REVIEWS', 'IMPORT_REVIEW', 'FY-' + plan.year, null, {
      approved: completed, materialsCreated: materialRows.length, resumed: repaired,
      fiscalPeriodsCreated: periodRows.length, ledgerCreated: ledgerRows.length,
      issueCounts: plan.issueCounts, backupId: backupId
    }, 'BULK-IMPORT-FY-' + plan.year);
    SpreadsheetApp.flush();
    adminFinalizeMaterialMigration_();

    var result = {
      ok: true, year: plan.year, approved: completed, materialsCreated: materialRows.length,
      resumed: repaired, fiscalPeriodsCreated: periodRows.length, ledgerCreated: ledgerRows.length,
      issueCounts: plan.issueCounts, pendingAfter: 0,
      backupUrl: 'https://docs.google.com/spreadsheets/d/' + backupId + '/edit'
    };
    Logger.log(JSON.stringify(result));
    return result;
  });
}

/**
 * Run once after the 134 rows have been migrated. This verifies that every
 * source row is linked to a real material and fiscal-period row, then removes
 * the migration worksheet from normal use by hiding it.
 */
function finishMaterialMigration() {
  adminAuthorize_();
  return materialWithLock_(function () {
    var result = adminFinalizeMaterialMigration_();
    Logger.log(JSON.stringify(result));
    return result;
  });
}

function adminFinalizeMaterialMigration_() {
  var reviews = adminRows_('importReview');
  var materials = {};
  var periods = {};
  adminRows_('materials').forEach(function (row) { materials[adminText_(row[0])] = true; });
  adminRows_('fiscalPeriods').forEach(function (row) {
    periods[adminText_(row[1]) + ':' + Number(row[4])] = true;
  });
  var failures = [];
  reviews.forEach(function (row) {
    var reviewId = adminText_(row[0]);
    var materialId = adminText_(row[19]);
    var year = Number(row[24]);
    if (adminText_(row[17]) !== 'APPROVED' || !materialId || !materials[materialId] || !periods[materialId + ':' + year]) {
      failures.push(reviewId || 'UNKNOWN');
    }
  });
  if (reviews.length !== MATERIAL_SEED_META.recordCount || failures.length) {
    throw new Error('MIGRATION_NOT_COMPLETE: ต้องมีวัสดุและรายการรายปีครบ ' + MATERIAL_SEED_META.recordCount + ' รายการ');
  }
  var sheet = adminSheet_('importReview');
  if (!sheet.isSheetHidden()) sheet.hideSheet();
  materialUpsertSystem_(adminSheet_('system'), 'MATERIAL_MIGRATION_STATUS', 'COMPLETED');
  materialUpsertSystem_(adminSheet_('system'), 'MATERIAL_MIGRATION_COUNT', String(reviews.length));
  SpreadsheetApp.flush();
  return { ok: true, migrated: reviews.length, migrationSheetHidden: true };
}

function adminBulkImportSummary_(plan) {
  return {
    ok: plan.blockers.length === 0, year: plan.year, sourceRows: plan.reviews.length,
    pending: plan.pending.length, materialsToCreate: plan.pending.filter(function (item) { return !item.material; }).length,
    existingMaterialsToResume: plan.pending.filter(function (item) { return Boolean(item.material); }).length,
    approved: plan.approved, rejected: plan.rejected, issueCounts: plan.issueCounts,
    ignoredPlaceholderRows: plan.ignoredPlaceholderRows,
    materialRowsWithoutIds: plan.materialRowsWithoutIds,
    blockers: plan.blockers
  };
}

function adminBulkImportPlan_() {
  var system = adminSystem_();
  var fiscal = adminActiveFiscalYear_(adminFiscalYears_());
  var reviews = adminRows_('importReview');
  var materialRows = adminRows_('materials');
  var materials = [];
  var periods = adminRows_('fiscalPeriods');
  var ledger = adminRows_('ledger');
  var blockers = [];
  var issueCounts = {};
  var categoryPrefixes = {};
  var categoryNumbers = {};
  var materialById = {};
  var materialByName = {};
  var materialByReview = {};
  var periodByReview = {};
  var ledgerByReview = {};
  var materialSequence = Number(system.MATERIAL_SEQUENCE || 0);
  var ledgerSequence = Number(system.LEDGER_SEQUENCE || 0);
  var sourceIds = {};
  var pending = [];
  var approved = 0;
  var rejected = 0;
  var ignoredPlaceholderRows = 0;
  var materialRowsWithoutIds = [];

  if (reviews.length !== MATERIAL_SEED_META.recordCount) blockers.push('จำนวนแถวตรวจนำเข้าไม่ตรงกับต้นทาง ' + MATERIAL_SEED_META.recordCount);
  if (system.SOURCE_SHA256 !== MATERIAL_SEED_META.sourceSha256) blockers.push('SHA-256 ของไฟล์ต้นทางไม่ตรงกับฐานข้อมูล');
  if (!Number.isSafeInteger(materialSequence) || materialSequence < 0) blockers.push('MATERIAL_SEQUENCE ไม่ถูกต้อง');
  if (!Number.isSafeInteger(ledgerSequence) || ledgerSequence < 0) blockers.push('LEDGER_SEQUENCE ไม่ถูกต้อง');

  adminRows_('categories').forEach(function (row) {
    if (adminBool_(row[5])) categoryPrefixes[adminText_(row[0])] = adminText_(row[1]);
  });
  materialRows.forEach(function (row, index) {
    if (!adminText_(row[0])) {
      if (adminBulkMaterialPlaceholder_(row)) ignoredPlaceholderRows += 1;
      else {
        blockers.push('ชีทวัสดุแถว ' + (index + 2) + ' มีข้อมูลแต่รหัสวัสดุว่าง');
        if (materialRowsWithoutIds.length < 8) materialRowsWithoutIds.push({
          row: index + 2, code: adminText_(row[1]), categoryId: adminText_(row[2]),
          name: adminText_(row[3]), unit: adminText_(row[4]), onHand: row[6],
          reserved: row[7], latestPrice: row[15]
        });
      }
      return;
    }
    materials.push(row);
  });
  materials.forEach(function (row) {
    var id = adminText_(row[0]);
    var nameKey = adminBulkNameKey_(row[3]);
    if (materialById[id]) blockers.push('รหัสวัสดุซ้ำ: ' + id);
    materialById[id] = row;
    if (nameKey && materialByName[nameKey] && materialByName[nameKey] !== id) blockers.push('ชื่อวัสดุซ้ำ: ' + adminText_(row[3]));
    materialByName[nameKey] = id;
    var marker = adminText_(row[16]).match(/^IMPORT_REVIEW:(IMP-\d+)/);
    if (marker) {
      if (materialByReview[marker[1]]) blockers.push('รหัสตรวจนำเข้าซ้ำในวัสดุ: ' + marker[1]);
      materialByReview[marker[1]] = id;
    }
    var materialNumber = id.match(/^MAT-(\d+)$/);
    if (materialNumber) materialSequence = Math.max(materialSequence, Number(materialNumber[1]));
    var code = adminText_(row[1]);
    var codeNumber = code.match(/-(\d+)$/);
    if (codeNumber) categoryNumbers[adminText_(row[2])] = Math.max(categoryNumbers[adminText_(row[2])] || 0, Number(codeNumber[1]));
  });
  periods.forEach(function (row) {
    if (adminText_(row[22]) !== 'IMPORTED_EXCEL') return;
    var reviewId = adminText_(row[23]);
    if (!reviewId) return;
    if (periodByReview[reviewId]) blockers.push('รหัสอ้างอิงซ้ำในรายการรายปี: ' + reviewId);
    periodByReview[reviewId] = row;
  });
  ledger.forEach(function (row) {
    var ledgerNumber = adminText_(row[0]).match(/^STK-(\d+)$/);
    if (ledgerNumber) ledgerSequence = Math.max(ledgerSequence, Number(ledgerNumber[1]));
    if (adminText_(row[2]) !== 'CUTOVER' || adminText_(row[5]) !== 'IMPORT') return;
    var reviewId = adminText_(row[6]);
    if (ledgerByReview[reviewId]) blockers.push('รายการเคลื่อนไหวนำเข้าซ้ำ: ' + reviewId);
    ledgerByReview[reviewId] = row;
  });

  reviews.forEach(function (row) {
    var reviewId = adminText_(row[0]);
    var status = adminText_(row[17]);
    if (!/^IMP-\d+$/.test(reviewId) || sourceIds[reviewId]) blockers.push('รหัสตรวจนำเข้าซ้ำหรือไม่ถูกต้อง: ' + reviewId);
    sourceIds[reviewId] = true;
    if (status === 'APPROVED') { approved += 1; return; }
    if (status === 'REJECTED') { rejected += 1; return; }
    if (status !== 'PENDING') { blockers.push('สถานะตรวจนำเข้าไม่ถูกต้อง: ' + reviewId); return; }

    adminText_(row[16]).split('|').filter(Boolean).forEach(function (issue) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    });
    var categoryId = adminText_(row[4]);
    var name = adminText_(row[7]);
    var unit = adminText_(row[8]);
    var balance = Number(row[13]);
    var year = Number(row[24]);
    if (!categoryPrefixes[categoryId]) blockers.push(reviewId + ': ไม่พบประเภทวัสดุที่ใช้งาน');
    if (!name || !unit || /^[=+@]/.test(name) || /^[=+@]/.test(unit)) blockers.push(reviewId + ': ชื่อหรือหน่วยไม่ถูกต้อง');
    if (year !== fiscal.year) blockers.push(reviewId + ': ปีงบประมาณไม่ตรงกับปีที่เปิด');
    if (!Number.isSafeInteger(balance) || balance < 0) blockers.push(reviewId + ': คงเหลือต้องเป็นจำนวนเต็มไม่ติดลบ');
    [9, 10, 11, 12].forEach(function (column) {
      if (!Number.isSafeInteger(Number(row[column])) || Number(row[column]) < 0) blockers.push(reviewId + ': จำนวนต้นทางไม่ถูกต้อง');
    });
    [14, 15].forEach(function (column) {
      if (!Number.isFinite(Number(row[column])) || Number(row[column]) < 0) blockers.push(reviewId + ': ราคา/มูลค่าไม่ถูกต้อง');
    });

    var period = periodByReview[reviewId];
    var linkedId = adminText_(row[19]) || (period && adminText_(period[1])) || materialByReview[reviewId] || '';
    var material = linkedId ? materialById[linkedId] : null;
    if (linkedId && !material) blockers.push(reviewId + ': อ้างอิงวัสดุที่ไม่พบ ' + linkedId);
    if (period && linkedId !== adminText_(period[1])) blockers.push(reviewId + ': รหัสวัสดุกับรายการรายปีไม่ตรงกัน');
    if (material && (adminText_(material[2]) !== categoryId || adminBulkNameKey_(material[3]) !== adminBulkNameKey_(name))) {
      blockers.push(reviewId + ': ข้อมูลวัสดุเดิมไม่ตรงกับรายการนำเข้า');
    }
    if (material && !period && (Number(material[6]) !== balance || Number(material[7]) !== 0)) {
      blockers.push(reviewId + ': วัสดุที่นำเข้าค้างมียอดเปลี่ยนไปแล้ว');
    }
    var nameOwner = materialByName[adminBulkNameKey_(name)];
    if (nameOwner && nameOwner !== linkedId) blockers.push(reviewId + ': ชื่อวัสดุมีอยู่แล้วในทะเบียน');
    if (!material) materialByName[adminBulkNameKey_(name)] = 'PENDING-' + reviewId;
    var importedLedger = ledgerByReview[reviewId];
    if (importedLedger && (!material || adminText_(importedLedger[1]) !== linkedId)) blockers.push(reviewId + ': รายการเคลื่อนไหวไม่ตรงกับวัสดุ');
    pending.push({ row: row, material: material, period: period, ledger: importedLedger });
  });

  return {
    year: fiscal.year, system: system, reviews: reviews, pending: pending, approved: approved,
    rejected: rejected, issueCounts: issueCounts, blockers: blockers,
    ignoredPlaceholderRows: ignoredPlaceholderRows,
    materialRowsWithoutIds: materialRowsWithoutIds,
    categoryPrefixes: categoryPrefixes, categoryNumbers: categoryNumbers,
    materialSequence: materialSequence, ledgerSequence: ledgerSequence
  };
}

function adminBulkNameKey_(value) {
  return adminText_(value).toLocaleLowerCase().replace(/\s+/g, '');
}

function adminBulkMaterialPlaceholder_(row) {
  // Template rows may contain only category, active flag, timestamps or version.
  // Never ignore a row with a name, stock, price, note, code or image metadata.
  var textColumns = [1, 3, 4, 5, 16, 17, 18, 19, 20];
  if (textColumns.some(function (index) { return adminText_(row[index]) !== ''; })) return false;
  var numberColumns = [6, 7, 8, 15];
  return numberColumns.every(function (index) {
    var value = row[index];
    return value === '' || value == null || (Number.isFinite(Number(value)) && Number(value) === 0);
  });
}
