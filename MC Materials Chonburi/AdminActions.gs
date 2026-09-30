function adminClean_(value, label, maxLength) {
  var text = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  var max = maxLength || 300;
  if (!text) throw new AdminError(400, 'VALIDATION', 'กรุณาระบุ' + label);
  if (text.length > max) throw new AdminError(400, 'VALIDATION', label + 'ยาวเกินไป');
  return text;
}

function adminRequiredNumber_(value, label, minimum) {
  var result = Number(value);
  var min = minimum == null ? 0 : Number(minimum);
  if (!Number.isFinite(result) || result < min) throw new AdminError(400, 'VALIDATION', label + 'ไม่ถูกต้อง');
  return adminNumber_(result);
}

function adminInteger_(value, label, minimum) {
  var result = Number(value);
  if (!Number.isSafeInteger(result) || result < Number(minimum || 0)) throw new AdminError(400, 'VALIDATION', label + 'ต้องเป็นจำนวนเต็ม');
  return result;
}

function adminLocateRow_(key, id, idColumn) {
  var sheet = adminSheet_(key);
  var columns = MATERIAL_SCHEMA[key].length;
  var column = Number(idColumn || 1);
  if (sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, columns).getValues();
  for (var index = 0; index < rows.length; index += 1) {
    if (String(rows[index][column - 1]) === String(id)) return { sheet: sheet, rowNumber: index + 2, values: rows[index] };
  }
  return null;
}

function adminRequireRow_(key, id, code, message) {
  var found = adminLocateRow_(key, id);
  if (!found) throw new AdminError(404, code || 'NOT_FOUND', message || 'ไม่พบข้อมูล');
  return found;
}

function adminSaveRow_(key, located) {
  located.sheet.getRange(located.rowNumber, 1, 1, MATERIAL_SCHEMA[key].length).setValues([located.values]);
}

function adminAppendRow_(key, row) {
  var sheet = adminSheet_(key);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, MATERIAL_SCHEMA[key].length).setValues([row]);
  return sheet.getLastRow();
}

function adminReplaceRows_(key, rows) {
  var sheet = adminSheet_(key);
  var columns = MATERIAL_SCHEMA[key].length;
  var oldCount = Math.max(0, sheet.getLastRow() - 1);
  if (oldCount) sheet.getRange(2, 1, oldCount, columns).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, columns).setValues(rows);
  if (oldCount > rows.length) sheet.deleteRows(rows.length + 2, oldCount - rows.length);
}

function adminNextSequence_(key) {
  var system = adminSystem_();
  var next = adminInteger_(system[key] || 0, key, 0) + 1;
  materialUpsertSystem_(adminSheet_('system'), key, String(next));
  return next;
}

function adminAudit_(actor, action, entityType, entityId, beforeValue, afterValue, operationId) {
  adminAppendRow_('audit', [
    'AUD-' + Utilities.getUuid(), new Date(), actor, action, entityType, entityId,
    beforeValue ? JSON.stringify(beforeValue) : '', afterValue ? JSON.stringify(afterValue) : '', operationId || ''
  ]);
}

function adminRunMutation_(action, input, callback) {
  var actor = adminAuthorize_();
  var payload = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  var operationId = adminClean_(payload.operationId, 'รหัสการบันทึก', 120);
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(operationId)) throw new AdminError(400, 'INVALID_OPERATION_ID', 'รหัสการบันทึกไม่ถูกต้อง');
  var requestHash = materialSha256_(action + '|' + JSON.stringify(payload));
  return materialWithLock_(function () {
    var previous = adminLocateRow_('operations', operationId);
    if (previous) {
      if (adminText_(previous.values[1]) !== action || adminText_(previous.values[2]) !== requestHash) {
        throw new AdminError(409, 'OPERATION_REUSED', 'คำขอบันทึกนี้ถูกใช้กับข้อมูลอื่นแล้ว');
      }
      return JSON.parse(adminText_(previous.values[3]) || '{}');
    }
    var result = callback(actor, operationId);
    adminAppendRow_('operations', [operationId, action, requestHash, JSON.stringify(result || {}), new Date(), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]);
    SpreadsheetApp.flush();
    return result || {};
  });
}

function adminImageMeta_(url) {
  var text = adminText_(url);
  if (!text) return { fileId: '', url: '', mime: '', sha256: '' };
  var match = text.match(/[?&]id=([A-Za-z0-9_-]+)/) || text.match(/\/d\/([A-Za-z0-9_-]+)/);
  var fileId = match ? match[1] : '';
  var mime = '';
  var sha256 = '';
  if (fileId) {
    try {
      var file = DriveApp.getFileById(fileId);
      mime = file.getMimeType();
      sha256 = materialSha256_(Utilities.base64Encode(file.getBlob().getBytes()));
    } catch (error) {}
  }
  return { fileId: fileId, url: text, mime: mime, sha256: sha256 };
}

function adminUploadImage_(input) {
  adminAuthorize_();
  var dataUrl = adminClean_(input.image, 'รูปภาพ', 30000000);
  var match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new AdminError(400, 'INVALID_IMAGE', 'รองรับเฉพาะ PNG, JPG และ WebP');
  var bytes = Utilities.base64Decode(match[2]);
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new AdminError(413, 'IMAGE_TOO_LARGE', 'รูปภาพต้องมีขนาดไม่เกิน 20 MB');
  var system = adminSystem_();
  if (!system.MEDIA_FOLDER_ID) throw new AdminError(500, 'MEDIA_FOLDER_MISSING', 'ยังไม่ได้ตั้งค่าโฟลเดอร์รูปภาพ');
  var extension = match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1];
  var digest = materialSha256_(Utilities.base64Encode(bytes));
  var blob = Utilities.newBlob(bytes, match[1], digest + '.' + extension);
  var file = DriveApp.getFolderById(system.MEDIA_FOLDER_ID).createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (error) {}
  var url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w800';
  return { url: url, fileId: file.getId(), mime: match[1], sha256: digest };
}

function adminCategory_(categoryId) {
  var categories = adminCategories_();
  for (var index = 0; index < categories.length; index += 1) if (categories[index].id === categoryId) return categories[index];
  throw new AdminError(400, 'CATEGORY_NOT_FOUND', 'ไม่พบประเภทวัสดุ');
}

function adminEnsureUniqueMaterial_(name, exceptId) {
  var normalized = String(name).toLocaleLowerCase().replace(/\s+/g, '');
  var duplicate = adminMaterials_().some(function (item) {
    return item.id !== exceptId && item.name.toLocaleLowerCase().replace(/\s+/g, '') === normalized;
  });
  if (duplicate) throw new AdminError(409, 'DUPLICATE_MATERIAL', 'ชื่อวัสดุนี้มีอยู่แล้ว');
}

function adminCreateFiscalPeriodRow_(material, year, values, actor, source, reference) {
  var id = 'PER-' + year + '-' + material.id;
  var now = new Date();
  var cutover = adminNumber_(values.cutoverBalance || 0);
  var received = adminNumber_(values.receivedBeforeSystem || 0);
  var issued = adminNumber_(values.issuedBeforeSystem || 0);
  return [
    id, material.id, material.code, material.name, year,
    adminNumber_(values.openingBalance || 0), received, issued, cutover,
    adminNumber_(cutover - (adminNumber_(values.openingBalance || 0) + received - issued)),
    adminNumber_(values.reportedTotalReceived == null ? adminNumber_(values.openingBalance || 0) + received : values.reportedTotalReceived),
    adminNumber_(values.latestPrice || 0), adminNumber_(values.reportedValue == null ? cutover * adminNumber_(values.latestPrice || 0) : values.reportedValue),
    adminText_(values.note), false, '', '', 0, 0, 0, 0, cutover, source, reference, now, 1
  ];
}

function adminLocateFiscalPeriod_(materialId, fiscalYear) {
  var sheet = adminSheet_('fiscalPeriods');
  var rows = adminRows_('fiscalPeriods');
  for (var index = 0; index < rows.length; index += 1) {
    if (adminText_(rows[index][1]) === String(materialId) && adminNumber_(rows[index][4]) === Number(fiscalYear)) {
      return { sheet: sheet, rowNumber: index + 2, values: rows[index] };
    }
  }
  return null;
}

function adminRequireFiscalPeriod_(materialId, fiscalYear) {
  var found = adminLocateFiscalPeriod_(materialId, fiscalYear);
  if (!found) throw new AdminError(404, 'FISCAL_PERIOD_NOT_FOUND', 'ไม่พบรายการปีงบประมาณ');
  return found;
}

function adminAppendMovement_(materialLocated, type, quantity, referenceType, referenceNo, note, operationId, fiscalYear, actor) {
  var amount = adminNumber_(quantity);
  var change = type === 'ISSUE' || type === 'ADJUST_OUT' ? -amount : (type === 'VOID' || type === 'CARRY_FORWARD' ? 0 : amount);
  materialLocated.values[6] = adminNumber_(adminNumber_(materialLocated.values[6]) + change);
  materialLocated.values[12] = new Date();
  materialLocated.values[13] = actor;
  materialLocated.values[14] = adminNumber_(materialLocated.values[14]) + 1;
  adminSaveRow_('materials', materialLocated);
  var sequence = adminNextSequence_('LEDGER_SEQUENCE');
  var movementId = 'STK-' + String(sequence).padStart(8, '0');
  adminAppendRow_('ledger', [
    movementId, materialLocated.values[0], type, change, materialLocated.values[6], referenceType, referenceNo,
    note || '', new Date(), actor, operationId, fiscalYear, materialLocated.values[1], materialLocated.values[3]
  ]);
  return movementId;
}

function adminCreateMaterialRecords_(input, actor, operationId, annualMode) {
  var name = adminClean_(input.name, 'ชื่อวัสดุ');
  var unit = adminClean_(input.unit, 'หน่วยนับ', 60);
  var categoryId = adminClean_(input.categoryId || 'CAT-OFFICE', 'ประเภทวัสดุ', 80);
  var category = adminCategory_(categoryId);
  adminEnsureUniqueMaterial_(name, '');
  var fiscal = adminActiveFiscalYear_(adminFiscalYears_());
  if (input.fiscalYear && Number(input.fiscalYear) !== fiscal.year) throw new AdminError(409, 'FISCAL_YEAR_CLOSED', 'เพิ่มข้อมูลได้เฉพาะปีงบประมาณที่เปิดอยู่');
  var sequence = adminNextSequence_('MATERIAL_SEQUENCE');
  var categoryCount = adminMaterials_().filter(function (item) { return item.categoryId === categoryId; }).length + 1;
  var id = 'MAT-' + String(sequence).padStart(6, '0');
  var code = category.code + '-' + String(categoryCount).padStart(4, '0');
  var opening = adminRequiredNumber_(input.openingBalance || 0, 'คงเหลือยกมา', 0);
  var received = adminRequiredNumber_(input.receivedBeforeSystem || 0, 'รับระหว่างปี', 0);
  var issued = adminRequiredNumber_(input.issuedBeforeSystem || 0, 'รวมจำนวนจ่าย', 0);
  var cutover = adminRequiredNumber_(input.cutoverBalance == null ? opening + received - issued : input.cutoverBalance, 'คงเหลือสิ้นปี', 0);
  var latestPrice = adminRequiredNumber_(input.latestPrice || 0, 'ราคา/หน่วยล่าสุด', 0);
  var image = adminImageMeta_(input.imageUrl);
  var now = new Date();
  var materialRow = [
    id, code, categoryId, name, unit, adminText_(input.packDetail), 0, 0,
    adminRequiredNumber_(input.reorderPoint || 0, 'จุดแจ้งเตือน', 0), input.active === undefined ? true : adminBool_(input.active),
    now, actor, now, actor, 1, latestPrice, adminText_(input.note), image.fileId, image.url, image.mime, image.sha256
  ];
  var rowNumber = adminAppendRow_('materials', materialRow);
  var located = { sheet: adminSheet_('materials'), rowNumber: rowNumber, values: materialRow };
  var material = { id: id, code: code, name: name };
  adminAppendRow_('fiscalPeriods', adminCreateFiscalPeriodRow_(material, fiscal.year, {
    openingBalance: opening, receivedBeforeSystem: received, issuedBeforeSystem: issued, cutoverBalance: cutover,
    reportedTotalReceived: input.reportedTotalReceived, latestPrice: latestPrice, reportedValue: input.reportedValue, note: input.note
  }, actor, input.source || (annualMode ? 'MANUAL_ANNUAL' : 'MANUAL'), input.sourceReference || code));
  if (cutover > 0) adminAppendMovement_(located, annualMode || input.source === 'IMPORTED_EXCEL' ? 'CUTOVER' : 'OPENING', cutover, input.source === 'IMPORTED_EXCEL' ? 'IMPORT' : annualMode ? 'ANNUAL_REPORT' : 'MANUAL', input.sourceReference || code, input.source === 'IMPORTED_EXCEL' ? 'ยอดคงเหลือ ณ วันนำเข้า' : annualMode ? 'เพิ่มจากตารางรายงานประจำปี' : 'ยอดยกมา', operationId, fiscal.year, actor);
  return { id: id, code: code, rowNumber: rowNumber };
}

function adminCreateMaterial_(input) {
  return adminRunMutation_('MATERIAL_CREATE', input, function (actor, operationId) {
    var created = adminCreateMaterialRecords_(input, actor, operationId, false);
    adminAudit_(actor, 'CREATE', 'MATERIAL', created.id, null, created, operationId);
    return { material: { id: created.id, code: created.code } };
  });
}

function adminUpdateMaterial_(input) {
  return adminRunMutation_('MATERIAL_UPDATE', input, function (actor, operationId) {
    var target = adminRequireRow_('materials', input.materialId, 'MATERIAL_NOT_FOUND', 'ไม่พบวัสดุ');
    if (Number(input.version) !== adminNumber_(target.values[14])) throw new AdminError(409, 'VERSION_CONFLICT', 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่');
    var before = adminClone_(target.values);
    var name = adminClean_(input.name, 'ชื่อวัสดุ');
    adminEnsureUniqueMaterial_(name, adminText_(target.values[0]));
    adminCategory_(adminClean_(input.categoryId, 'ประเภทวัสดุ', 80));
    target.values[2] = input.categoryId;
    target.values[3] = name;
    target.values[4] = adminClean_(input.unit, 'หน่วยนับ', 60);
    target.values[5] = adminText_(input.packDetail);
    target.values[8] = adminRequiredNumber_(input.reorderPoint || 0, 'จุดแจ้งเตือน', 0);
    target.values[9] = adminBool_(input.active);
    target.values[12] = new Date(); target.values[13] = actor; target.values[14] = adminNumber_(target.values[14]) + 1;
    if (input.imageUrl !== undefined) {
      var image = adminImageMeta_(input.imageUrl);
      target.values[17] = image.fileId; target.values[18] = image.url; target.values[19] = image.mime; target.values[20] = image.sha256;
    }
    adminSaveRow_('materials', target);
    ['fiscalPeriods', 'ledger'].forEach(function (key) {
      var sheet = adminSheet_(key);
      var rows = adminRows_(key);
      var changed = false;
      rows.forEach(function (row) {
        if (adminText_(row[1]) !== adminText_(target.values[0])) return;
        if (key === 'fiscalPeriods') { row[3] = name; row[24] = new Date(); row[25] = adminNumber_(row[25]) + 1; }
        else row[13] = name;
        changed = true;
      });
      if (changed) sheet.getRange(2, 1, rows.length, MATERIAL_SCHEMA[key].length).setValues(rows);
    });
    adminAudit_(actor, 'UPDATE', 'MATERIAL', target.values[0], before, target.values, operationId);
    return { material: { id: target.values[0] } };
  });
}

function adminRecordStock_(input) {
  return adminRunMutation_('STOCK_RECORD', input, function (actor, operationId) {
    var target = adminRequireRow_('materials', input.materialId, 'MATERIAL_NOT_FOUND', 'ไม่พบวัสดุ');
    if (!adminBool_(target.values[9])) throw new AdminError(409, 'MATERIAL_INACTIVE', 'วัสดุนี้ปิดใช้งานแล้ว');
    var fiscal = adminActiveFiscalYear_(adminFiscalYears_());
    var type = adminClean_(input.type, 'ประเภทรายการ', 30);
    if (['RECEIPT', 'ADJUST_IN', 'ADJUST_OUT'].indexOf(type) === -1) throw new AdminError(400, 'INVALID_MOVEMENT', 'ประเภทรายการไม่ถูกต้อง');
    var quantity = adminRequiredNumber_(input.quantity, 'จำนวน', 0.001);
    var nextBalance = adminNumber_(target.values[6]) + (type === 'ADJUST_OUT' ? -quantity : quantity);
    if (nextBalance < adminNumber_(target.values[7])) throw new AdminError(409, 'INSUFFICIENT_STOCK', 'ยอดหลังปรับต่ำกว่ายอดรอจ่าย');
    var period = adminLocateFiscalPeriod_(target.values[0], fiscal.year);
    if (!period) {
      var material = { id: target.values[0], code: target.values[1], name: target.values[3] };
      adminAppendRow_('fiscalPeriods', adminCreateFiscalPeriodRow_(material, fiscal.year, { openingBalance: target.values[6], cutoverBalance: target.values[6], latestPrice: target.values[15] }, actor, 'CARRY_FORWARD', 'FY-' + (fiscal.year - 1)));
      period = adminRequireFiscalPeriod_(target.values[0], fiscal.year);
    }
    adminAppendMovement_(target, type, quantity, adminText_(input.referenceType) || 'MANUAL', adminText_(input.referenceNo) || '-', adminText_(input.note), operationId, fiscal.year, actor);
    if (type === 'RECEIPT') period.values[17] = adminNumber_(period.values[17]) + quantity;
    if (type === 'ADJUST_IN') period.values[19] = adminNumber_(period.values[19]) + quantity;
    if (type === 'ADJUST_OUT') period.values[20] = adminNumber_(period.values[20]) + quantity;
    period.values[21] = target.values[6]; period.values[24] = new Date(); period.values[25] = adminNumber_(period.values[25]) + 1;
    adminSaveRow_('fiscalPeriods', period);
    adminAudit_(actor, 'STOCK_' + type, 'MATERIAL', target.values[0], null, { quantity: quantity, balance: target.values[6] }, operationId);
    return { material: { id: target.values[0] } };
  });
}

function adminCreateAnnualMaterial_(input) {
  return adminRunMutation_('ANNUAL_CREATE', input, function (actor, operationId) {
    var created = adminCreateMaterialRecords_(input, actor, operationId, true);
    adminAudit_(actor, 'ANNUAL_CREATE', 'MATERIAL', created.id, null, created, operationId);
    return { material: { id: created.id, code: created.code } };
  });
}

function adminUpdateAnnualMaterial_(input) {
  return adminRunMutation_('ANNUAL_UPDATE', input, function (actor, operationId) {
    var material = adminRequireRow_('materials', input.materialId, 'MATERIAL_NOT_FOUND', 'ไม่พบวัสดุ');
    var fiscal = adminActiveFiscalYear_(adminFiscalYears_());
    var period = adminRequireFiscalPeriod_(input.materialId, fiscal.year);
    if (Number(input.version) !== adminNumber_(period.values[25]) || Number(input.materialVersion) !== adminNumber_(material.values[14])) throw new AdminError(409, 'VERSION_CONFLICT', 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่');
    var name = adminClean_(input.name, 'รายการวัสดุ');
    adminEnsureUniqueMaterial_(name, input.materialId);
    adminCategory_(input.categoryId || material.values[2]);
    var opening = adminRequiredNumber_(input.openingBalance || 0, 'คงเหลือยกมา', 0);
    var received = adminRequiredNumber_(input.receivedBeforeSystem || 0, 'รับระหว่างปี', 0);
    var issued = adminRequiredNumber_(input.issuedBeforeSystem || 0, 'รวมจำนวนจ่าย', 0);
    var cutover = adminRequiredNumber_(input.cutoverBalance == null ? opening + received - issued : input.cutoverBalance, 'คงเหลือสิ้นปี', 0);
    var latestPrice = adminRequiredNumber_(input.latestPrice || 0, 'ราคา/หน่วยล่าสุด', 0);
    var expected = adminNumber_(cutover + adminNumber_(period.values[17]) - adminNumber_(period.values[18]) + adminNumber_(period.values[19]) - adminNumber_(period.values[20]));
    var delta = adminNumber_(expected - adminNumber_(material.values[6]));
    if (expected < adminNumber_(material.values[7])) throw new AdminError(409, 'INSUFFICIENT_STOCK', 'ยอดคงเหลือใหม่ต่ำกว่ายอดรอจ่าย');
    material.values[2] = input.categoryId || material.values[2]; material.values[3] = name; material.values[4] = adminClean_(input.unit, 'หน่วยนับ', 60);
    material.values[15] = latestPrice; material.values[16] = adminText_(input.note); material.values[12] = new Date(); material.values[13] = actor; material.values[14] = adminNumber_(material.values[14]) + 1;
    if (input.imageUrl !== undefined) { var image = adminImageMeta_(input.imageUrl); material.values[17] = image.fileId; material.values[18] = image.url; material.values[19] = image.mime; material.values[20] = image.sha256; }
    adminSaveRow_('materials', material);
    period.values[3] = name; period.values[5] = opening; period.values[6] = received; period.values[7] = issued; period.values[8] = cutover;
    period.values[9] = adminNumber_(cutover - (opening + received - issued)); period.values[10] = adminRequiredNumber_(input.reportedTotalReceived == null ? opening + received : input.reportedTotalReceived, 'รวมจำนวนรับ', 0);
    period.values[11] = latestPrice; period.values[12] = adminNumber_(cutover * latestPrice); period.values[13] = adminText_(input.note); period.values[21] = expected;
    period.values[24] = new Date(); period.values[25] = adminNumber_(period.values[25]) + 1; adminSaveRow_('fiscalPeriods', period);
    if (delta !== 0) adminAppendMovement_(material, delta > 0 ? 'ADJUST_IN' : 'ADJUST_OUT', Math.abs(delta), 'ANNUAL_REPORT', material.values[1], 'แก้ไขข้อมูลตารางรายงานประจำปี', operationId, fiscal.year, actor);
    adminAudit_(actor, 'ANNUAL_UPDATE', 'MATERIAL', material.values[0], null, { balance: expected }, operationId);
    return { material: { id: material.values[0] } };
  });
}

function adminDeleteAnnualMaterial_(input) {
  return adminRunMutation_('ANNUAL_DELETE', input, function (actor, operationId) {
    var material = adminRequireRow_('materials', input.materialId, 'MATERIAL_NOT_FOUND', 'ไม่พบวัสดุ');
    var fiscal = adminActiveFiscalYear_(adminFiscalYears_());
    var period = adminRequireFiscalPeriod_(input.materialId, fiscal.year);
    if (Number(input.version) !== adminNumber_(period.values[25]) || Number(input.materialVersion) !== adminNumber_(material.values[14])) throw new AdminError(409, 'VERSION_CONFLICT', 'ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดใหม่');
    period.values[14] = true; period.values[15] = new Date(); period.values[16] = actor; period.values[24] = new Date(); period.values[25] = adminNumber_(period.values[25]) + 1; adminSaveRow_('fiscalPeriods', period);
    material.values[9] = false; material.values[12] = new Date(); material.values[13] = actor; material.values[14] = adminNumber_(material.values[14]) + 1; adminSaveRow_('materials', material);
    adminAppendMovement_(material, 'VOID', 0, 'ANNUAL_REPORT', material.values[1], 'ลบรายการออกจากตารางรายงานประจำปี', operationId, fiscal.year, actor);
    adminAudit_(actor, 'ANNUAL_DELETE', 'MATERIAL', material.values[0], null, null, operationId);
    return { material: { id: material.values[0] } };
  });
}

function adminDepartmentId_(name) {
  var departments = adminDepartments_();
  for (var index = 0; index < departments.length; index += 1) if (departments[index].nameTh === name) return departments[index].id;
  throw new AdminError(400, 'INVALID_REQUISITION_DEPARTMENT', 'กรุณาเลือกฝ่ายที่ขอเบิกจากรายการ');
}

function adminValidateRequestDate_(value, fiscal) {
  var text = adminClean_(value, 'วันที่ขอเบิก', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text < fiscal.startDate || text > fiscal.endDate) throw new AdminError(400, 'INVALID_REQUISITION_DATE', 'วันที่ขอเบิกอยู่นอกปีงบประมาณ');
  var date = new Date(text + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new AdminError(400, 'INVALID_REQUISITION_DATE', 'วันที่ขอเบิกไม่ถูกต้อง');
  return text;
}

function adminBuildRequestLines_(inputLines, fiscalYear, ignoreReservationForRequisitionId) {
  if (!Array.isArray(inputLines) || inputLines.length < 1 || inputLines.length > 20) throw new AdminError(400, 'INVALID_REQUISITION_LINES', 'คำขอเบิกต้องมี 1 ถึง 20 รายการ');
  var materials = adminMaterials_();
  var materialMap = {}; materials.forEach(function (item) { materialMap[item.id] = item; });
  var periods = {}; adminFiscalPeriods_().filter(function (item) { return item.fiscalYear === fiscalYear && !item.deleted; }).forEach(function (item) { periods[item.materialId] = true; });
  var ignored = {};
  if (ignoreReservationForRequisitionId) {
    var existing = adminRequisitions_().filter(function (item) { return item.id === ignoreReservationForRequisitionId; })[0];
    if (existing && existing.status === 'APPROVED') existing.lines.forEach(function (line) { ignored[line.materialId] = adminNumber_(line.issueQuantity || line.quantity); });
  }
  var seen = {};
  return inputLines.map(function (line, index) {
    var materialId = adminClean_(line.materialId, 'วัสดุ', 80);
    if (seen[materialId]) throw new AdminError(409, 'DUPLICATE_REQUISITION_LINE', 'มีวัสดุซ้ำในคำขอเบิก');
    seen[materialId] = true;
    var material = materialMap[materialId];
    if (!material || !material.active || !periods[materialId]) throw new AdminError(404, 'MATERIAL_NOT_AVAILABLE', 'ไม่พบวัสดุที่เลือกในปีงบประมาณนี้');
    var quantity = adminInteger_(line.quantity, 'จำนวนที่ขอเบิก', 1);
    var available = Math.max(0, material.onHand - material.reserved + (ignored[materialId] || 0));
    var maximum = Math.max(0, Math.floor(available - 1));
    if (quantity > maximum) throw new AdminError(409, 'MINIMUM_STOCK_REQUIRED', material.name + ' เบิกได้สูงสุด ' + maximum + ' ' + material.unit);
    return { order: index + 1, materialId: material.id, materialCode: material.code, materialName: material.name, unit: material.unit, quantity: quantity };
  });
}

function adminWriteRequisitionLines_(requisitionId, requestNo, lines, existingLines) {
  var all = adminRows_('requisitionLines').filter(function (row) { return adminText_(row[1]) !== requisitionId; });
  var now = new Date();
  lines.forEach(function (line, index) {
    var existing = (existingLines || []).filter(function (item) { return item.materialId === line.materialId; })[0];
    all.push([
      requisitionId + '-L' + String(index + 1).padStart(2, '0'), requisitionId, requestNo, index + 1,
      line.materialId, line.materialCode, line.materialName, line.unit, line.quantity,
      line.issueQuantity == null ? '' : line.issueQuantity, line.note || '', existing ? existing.createdAt || now : now, now
    ]);
  });
  adminReplaceRows_('requisitionLines', all);
}

function adminCreateRequisition_(input) {
  return adminRunMutation_('REQUISITION_CREATE', input, function (actor, operationId) {
    var fiscal = adminActiveFiscalYear_(adminFiscalYears_());
    var department = adminClean_(input.department, 'ฝ่ายที่ขอเบิก', 160);
    var departmentId = adminDepartmentId_(department);
    var lines = adminBuildRequestLines_(input.lines, fiscal.year, '');
    var sequence = adminNextSequence_('REQUISITION_SEQUENCE');
    var id = 'REQ-' + fiscal.year + '-' + String(sequence).padStart(4, '0');
    var now = new Date();
    adminAppendRow_('requisitions', [
      id, id, fiscal.year, materialDate_(adminValidateRequestDate_(input.requestDate, fiscal)), adminClean_(input.requesterName, 'ชื่อผู้ขอเบิก', 160),
      departmentId, department, adminText_(input.note).slice(0, 500), 'PENDING', now, actor, now, actor,
      '', '', '', '', '', '', '', '', 1
    ]);
    adminWriteRequisitionLines_(id, id, lines, []);
    adminAudit_(actor, 'REQUISITION_CREATE', 'REQUISITION', id, null, { lines: lines.length }, operationId);
    return { requisition: { id: id, requestNo: id, status: 'PENDING' } };
  });
}

function adminUpdateRequisition_(input) {
  return adminRunMutation_('REQUISITION_UPDATE', input, function (actor, operationId) {
    var target = adminRequireRow_('requisitions', input.requisitionId, 'REQUISITION_NOT_FOUND', 'ไม่พบคำขอเบิก');
    if (adminText_(target.values[8]) !== 'PENDING') throw new AdminError(409, 'REQUISITION_NOT_EDITABLE', 'แก้ไขได้เฉพาะคำขอที่รออนุมัติ');
    if (Number(input.version) !== adminNumber_(target.values[21])) throw new AdminError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
    var fiscal = adminFiscalYears_().filter(function (item) { return item.year === adminNumber_(target.values[2]); })[0];
    var department = adminClean_(input.department, 'ฝ่ายที่ขอเบิก', 160);
    var lines = adminBuildRequestLines_(input.lines, fiscal.year, target.values[0]);
    target.values[3] = materialDate_(adminValidateRequestDate_(input.requestDate, fiscal)); target.values[4] = adminClean_(input.requesterName, 'ชื่อผู้ขอเบิก', 160);
    target.values[5] = adminDepartmentId_(department); target.values[6] = department; target.values[7] = adminText_(input.note).slice(0, 500);
    target.values[11] = new Date(); target.values[12] = actor; target.values[21] = adminNumber_(target.values[21]) + 1; adminSaveRow_('requisitions', target);
    adminWriteRequisitionLines_(target.values[0], target.values[1], lines, []);
    adminAudit_(actor, 'REQUISITION_UPDATE', 'REQUISITION', target.values[0], null, { lines: lines.length }, operationId);
    return { requisition: { id: target.values[0] } };
  });
}

function adminChangeReserved_(materialId, delta, actor) {
  var material = adminRequireRow_('materials', materialId, 'MATERIAL_NOT_FOUND', 'ไม่พบวัสดุ');
  var next = adminNumber_(material.values[7]) + adminNumber_(delta);
  if (next < 0 || next > adminNumber_(material.values[6])) throw new AdminError(409, 'INVALID_RESERVED_STOCK', 'ยอดรอจ่ายไม่ถูกต้อง');
  material.values[7] = next; material.values[12] = new Date(); material.values[13] = actor; material.values[14] = adminNumber_(material.values[14]) + 1;
  adminSaveRow_('materials', material);
  return material;
}

function adminApproveRequisition_(input) {
  return adminRunMutation_('REQUISITION_APPROVE', input, function (actor, operationId) {
    var target = adminRequireRow_('requisitions', input.requisitionId, 'REQUISITION_NOT_FOUND', 'ไม่พบคำขอเบิก');
    if (adminText_(target.values[8]) !== 'PENDING') throw new AdminError(409, 'REQUISITION_NOT_PENDING', 'คำขอไม่ได้อยู่ระหว่างรออนุมัติ');
    if (Number(input.version) !== adminNumber_(target.values[21])) throw new AdminError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
    var request = adminRequisitions_().filter(function (item) { return item.id === input.requisitionId; })[0];
    if (!request || !Array.isArray(input.lines) || input.lines.length !== request.lines.length) throw new AdminError(400, 'INVALID_APPROVAL_LINES', 'กรุณาระบุจำนวนจ่ายให้ครบทุกรายการ');
    var inputMap = {}; input.lines.forEach(function (line) { if (inputMap[line.materialId]) throw new AdminError(400, 'INVALID_APPROVAL_LINES', 'รายการอนุมัติซ้ำ'); inputMap[line.materialId] = line; });
    var materialMap = {};
    adminMaterials_().forEach(function (material) { materialMap[material.id] = material; });
    var approved = request.lines.map(function (line) {
      var entered = inputMap[line.materialId];
      if (!entered) throw new AdminError(400, 'INVALID_APPROVAL_LINES', 'รายการอนุมัติไม่ตรงกับคำขอ');
      var issue = adminInteger_(entered.issueQuantity, 'จำนวนจ่าย', 1);
      if (issue > line.quantity) throw new AdminError(400, 'ISSUE_QUANTITY_EXCEEDS_REQUEST', 'จำนวนจ่ายมากกว่าจำนวนที่ขอ');
      var material = materialMap[line.materialId];
      if (!material) throw new AdminError(404, 'MATERIAL_NOT_FOUND', 'ไม่พบวัสดุ');
      if (issue > Math.max(0, Math.floor(material.available - 1))) throw new AdminError(409, 'MINIMUM_STOCK_REQUIRED', material.name + ' มีสต็อกไม่เพียงพอ');
      return { order: line.order, materialId: line.materialId, materialCode: line.materialCode, materialName: line.materialName, unit: line.unit, quantity: line.quantity, issueQuantity: issue, note: adminText_(entered.note).slice(0, 300) };
    });
    approved.forEach(function (line) { adminChangeReserved_(line.materialId, line.issueQuantity, actor); });
    adminWriteRequisitionLines_(request.id, request.requestNo, approved, request.lines);
    var now = new Date(); target.values[8] = 'APPROVED'; target.values[11] = now; target.values[12] = actor; target.values[13] = now; target.values[14] = actor; target.values[21] = adminNumber_(target.values[21]) + 1; adminSaveRow_('requisitions', target);
    adminAudit_(actor, 'REQUISITION_APPROVE', 'REQUISITION', request.id, null, { lines: approved.length }, operationId);
    return { requisition: { id: request.id, status: 'APPROVED' } };
  });
}

function adminUpdateRequisitionNotes_(input) {
  return adminRunMutation_('REQUISITION_NOTES', input, function (actor, operationId) {
    var target = adminRequireRow_('requisitions', input.requisitionId, 'REQUISITION_NOT_FOUND', 'ไม่พบคำขอเบิก');
    if (Number(input.version) !== adminNumber_(target.values[21])) throw new AdminError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
    var request = adminRequisitions_().filter(function (item) { return item.id === input.requisitionId; })[0];
    if (!request || !Array.isArray(input.lines) || input.lines.length !== request.lines.length) throw new AdminError(400, 'INVALID_REQUISITION_NOTE_LINES', 'รายการหมายเหตุไม่ตรงกับคำขอเบิก');
    var notes = {}; input.lines.forEach(function (line) { notes[line.materialId] = adminText_(line.note).slice(0, 300); });
    request.lines.forEach(function (line) { line.note = notes[line.materialId] || ''; });
    adminWriteRequisitionLines_(request.id, request.requestNo, request.lines, request.lines);
    target.values[7] = adminText_(input.note).slice(0, 500); target.values[11] = new Date(); target.values[12] = actor; target.values[21] = adminNumber_(target.values[21]) + 1; adminSaveRow_('requisitions', target);
    adminAudit_(actor, 'REQUISITION_NOTES', 'REQUISITION', request.id, null, { note: target.values[7] }, operationId);
    return { requisition: { id: request.id } };
  });
}

function adminUpdateRequisitionAllocation_(input) {
  return adminRunMutation_('REQUISITION_ALLOCATION_UPDATE', input, function (actor, operationId) {
    var target = adminRequireRow_('requisitions', input.requisitionId, 'REQUISITION_NOT_FOUND', 'ไม่พบคำขอเบิก');
    if (Number(input.version) !== adminNumber_(target.values[21])) throw new AdminError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
    var request = adminRequisitions_().filter(function (item) { return item.id === input.requisitionId; })[0];
    if (!request || !Array.isArray(input.lines) || input.lines.length !== request.lines.length) throw new AdminError(400, 'INVALID_ALLOCATION_LINES', 'รายการจำนวนจ่ายไม่ตรงกับคำขอเบิก');
    var status = adminText_(target.values[8]);
    var quantityEditable = status === 'PENDING' || status === 'APPROVED';
    var inputMap = {};
    input.lines.forEach(function (line) {
      var materialId = adminClean_(line.materialId, 'วัสดุ', 80);
      if (inputMap[materialId]) throw new AdminError(400, 'INVALID_ALLOCATION_LINES', 'รายการจำนวนจ่ายซ้ำ');
      inputMap[materialId] = line;
    });
    var materialMap = {};
    adminMaterials_().forEach(function (material) { materialMap[material.id] = material; });
    var nextLines = request.lines.map(function (line) {
      var entered = inputMap[line.materialId];
      if (!entered) throw new AdminError(400, 'INVALID_ALLOCATION_LINES', 'รายการจำนวนจ่ายไม่ตรงกับคำขอเบิก');
      var issue = line.issueQuantity;
      if (quantityEditable) {
        issue = adminInteger_(entered.issueQuantity, 'จำนวนจ่าย', 1);
        if (issue > line.quantity) throw new AdminError(400, 'ISSUE_QUANTITY_EXCEEDS_REQUEST', line.materialName + ' จ่ายได้ไม่เกินจำนวนที่ขอ ' + line.quantity + ' ' + line.unit);
        var material = materialMap[line.materialId];
        if (!material) throw new AdminError(404, 'MATERIAL_NOT_FOUND', 'ไม่พบวัสดุ');
        var previous = status === 'APPROVED' ? adminNumber_(line.issueQuantity || line.quantity) : 0;
        var availableForRequest = adminNumber_(material.onHand) - adminNumber_(material.reserved) + previous;
        var maximum = Math.max(0, Math.floor(availableForRequest - 1));
        if (issue > maximum) throw new AdminError(409, 'MINIMUM_STOCK_REQUIRED', material.name + ' จ่ายได้สูงสุด ' + maximum + ' ' + material.unit + ' เพื่อให้เหลืออย่างน้อย 1 ' + material.unit);
      } else if (entered.issueQuantity !== '' && entered.issueQuantity != null && Number(entered.issueQuantity) !== Number(line.issueQuantity)) {
        throw new AdminError(409, 'REQUISITION_ALLOCATION_LOCKED', 'จำนวนจ่ายแก้ไขไม่ได้หลังจ่ายหรือปิดคำขอแล้ว');
      }
      return {
        order: line.order, materialId: line.materialId, materialCode: line.materialCode, materialName: line.materialName,
        unit: line.unit, quantity: line.quantity, issueQuantity: issue, note: adminText_(entered.note).slice(0, 300)
      };
    });
    if (status === 'APPROVED') nextLines.forEach(function (line, index) {
      var previous = adminNumber_(request.lines[index].issueQuantity || request.lines[index].quantity);
      var delta = adminNumber_(line.issueQuantity) - previous;
      if (delta) adminChangeReserved_(line.materialId, delta, actor);
    });
    adminWriteRequisitionLines_(request.id, request.requestNo, nextLines, request.lines);
    target.values[11] = new Date(); target.values[12] = actor; target.values[21] = adminNumber_(target.values[21]) + 1; adminSaveRow_('requisitions', target);
    adminAudit_(actor, 'REQUISITION_ALLOCATION_UPDATE', 'REQUISITION', request.id, null, { status: status, lines: nextLines.length }, operationId);
    return { requisition: { id: request.id, status: status } };
  });
}

function adminRejectRequisition_(input) {
  return adminRunMutation_('REQUISITION_REJECT', input, function (actor, operationId) {
    var target = adminRequireRow_('requisitions', input.requisitionId, 'REQUISITION_NOT_FOUND', 'ไม่พบคำขอเบิก');
    if (adminText_(target.values[8]) !== 'PENDING') throw new AdminError(409, 'REQUISITION_NOT_PENDING', 'ไม่สามารถไม่อนุมัติคำขอนี้ได้');
    if (Number(input.version) !== adminNumber_(target.values[21])) throw new AdminError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
    var now = new Date(); target.values[8] = 'REJECTED'; target.values[11] = now; target.values[12] = actor; target.values[17] = now; target.values[18] = actor; target.values[21] = adminNumber_(target.values[21]) + 1; adminSaveRow_('requisitions', target);
    adminAudit_(actor, 'REQUISITION_REJECT', 'REQUISITION', target.values[0], null, null, operationId);
    return { requisition: { id: target.values[0], status: 'REJECTED' } };
  });
}

function adminCancelRequisition_(input) {
  return adminRunMutation_('REQUISITION_CANCEL', input, function (actor, operationId) {
    var target = adminRequireRow_('requisitions', input.requisitionId, 'REQUISITION_NOT_FOUND', 'ไม่พบคำขอเบิก');
    var status = adminText_(target.values[8]);
    if (['PENDING', 'APPROVED'].indexOf(status) === -1) throw new AdminError(409, 'REQUISITION_NOT_CANCELLABLE', 'ไม่สามารถยกเลิกคำขอนี้ได้');
    if (Number(input.version) !== adminNumber_(target.values[21])) throw new AdminError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
    var request = adminRequisitions_().filter(function (item) { return item.id === input.requisitionId; })[0];
    if (status === 'APPROVED') request.lines.forEach(function (line) { adminChangeReserved_(line.materialId, -adminNumber_(line.issueQuantity || line.quantity), actor); });
    var now = new Date(); target.values[8] = 'CANCELLED'; target.values[11] = now; target.values[12] = actor; target.values[19] = now; target.values[20] = actor; target.values[21] = adminNumber_(target.values[21]) + 1; adminSaveRow_('requisitions', target);
    adminAudit_(actor, 'REQUISITION_CANCEL', 'REQUISITION', target.values[0], null, null, operationId);
    return { requisition: { id: target.values[0], status: 'CANCELLED' } };
  });
}

function adminIssueRequisition_(input) {
  return adminRunMutation_('REQUISITION_ISSUE', input, function (actor, operationId) {
    var target = adminRequireRow_('requisitions', input.requisitionId, 'REQUISITION_NOT_FOUND', 'ไม่พบคำขอเบิก');
    if (adminText_(target.values[8]) !== 'APPROVED') throw new AdminError(409, 'REQUISITION_NOT_APPROVED', 'คำขอนี้ยังไม่พร้อมจ่าย');
    if (Number(input.version) !== adminNumber_(target.values[21])) throw new AdminError(409, 'VERSION_CONFLICT', 'คำขอถูกแก้ไขแล้ว กรุณาโหลดใหม่');
    var fiscal = adminActiveFiscalYear_(adminFiscalYears_());
    if (fiscal.year !== adminNumber_(target.values[2])) throw new AdminError(409, 'FISCAL_YEAR_CLOSED', 'จ่ายได้เฉพาะปีงบประมาณที่เปิดอยู่');
    var request = adminRequisitions_().filter(function (item) { return item.id === input.requisitionId; })[0];
    var prepared = request.lines.map(function (line) {
      var issue = adminInteger_(line.issueQuantity || line.quantity, 'จำนวนจ่าย', 1);
      var material = adminRequireRow_('materials', line.materialId, 'MATERIAL_NOT_FOUND', 'ไม่พบวัสดุ');
      if (adminNumber_(material.values[7]) < issue || adminNumber_(material.values[6]) - issue < 1) throw new AdminError(409, 'INSUFFICIENT_RESERVED_STOCK', line.materialName + ' มียอดไม่เพียงพอ');
      var period = adminRequireFiscalPeriod_(line.materialId, fiscal.year);
      return { line: line, issue: issue, material: material, period: period };
    });
    prepared.forEach(function (entry) {
      var line = entry.line;
      var issue = entry.issue;
      var material = entry.material;
      material.values[7] = adminNumber_(material.values[7]) - issue;
      adminAppendMovement_(material, 'ISSUE', issue, 'REQUISITION', request.requestNo, 'จ่ายตามคำขอเบิก ' + request.requestNo, operationId + ':' + line.materialId, fiscal.year, actor);
      var period = entry.period;
      period.values[18] = adminNumber_(period.values[18]) + issue; period.values[21] = material.values[6]; period.values[24] = new Date(); period.values[25] = adminNumber_(period.values[25]) + 1; adminSaveRow_('fiscalPeriods', period);
    });
    var now = new Date(); target.values[8] = 'ISSUED'; target.values[11] = now; target.values[12] = actor; target.values[15] = now; target.values[16] = actor; target.values[21] = adminNumber_(target.values[21]) + 1; adminSaveRow_('requisitions', target);
    adminAudit_(actor, 'REQUISITION_ISSUE', 'REQUISITION', target.values[0], null, { lines: request.lines.length }, operationId);
    return { requisition: { id: target.values[0], status: 'ISSUED' } };
  });
}

function adminCloseFiscalYear_(input) {
  return adminRunMutation_('FISCAL_CLOSE', input, function (actor, operationId) {
    var target = adminRequireRow_('fiscalYears', 'FY-' + input.fiscalYear, 'FISCAL_YEAR_NOT_FOUND', 'ไม่พบปีงบประมาณ');
    var year = adminNumber_(target.values[1]);
    if (adminText_(target.values[4]) !== 'OPEN') throw new AdminError(409, 'FISCAL_YEAR_CLOSED', 'ปีงบประมาณนี้ปิดแล้ว');
    if (Number(input.version) !== adminNumber_(target.values[9]) || Number(input.confirmYear) !== year) throw new AdminError(409, 'CONFIRMATION_MISMATCH', 'กรุณายืนยันปีงบประมาณให้ถูกต้อง');
    if (adminRequisitions_().some(function (item) { return item.fiscalYear === year && ['PENDING', 'APPROVED'].indexOf(item.status) !== -1; })) throw new AdminError(409, 'OPEN_REQUISITIONS', 'ยังมีคำขอเบิกที่ต้องดำเนินการ');
    var nextYear = year + 1;
    if (adminLocateRow_('fiscalYears', 'FY-' + nextYear)) throw new AdminError(409, 'NEXT_FISCAL_YEAR_EXISTS', 'ปีงบประมาณถัดไปมีอยู่แล้ว');
    var now = new Date(); target.values[4] = 'CLOSED'; target.values[7] = now; target.values[8] = actor; target.values[9] = adminNumber_(target.values[9]) + 1; adminSaveRow_('fiscalYears', target);
    adminAppendRow_('fiscalYears', ['FY-' + nextYear, nextYear, materialDate_((nextYear - 544) + '-10-01'), materialDate_((nextYear - 543) + '-09-30'), 'OPEN', now, actor, '', '', 1]);
    var materials = {}; adminMaterials_().forEach(function (item) { materials[item.id] = item; });
    adminFiscalPeriods_().filter(function (period) { return period.fiscalYear === year && !period.deleted && materials[period.materialId] && materials[period.materialId].active; }).forEach(function (period) {
      var item = materials[period.materialId];
      adminAppendRow_('fiscalPeriods', adminCreateFiscalPeriodRow_({ id: item.id, code: item.code, name: item.name }, nextYear, { openingBalance: item.onHand, cutoverBalance: item.onHand, latestPrice: item.latestPrice }, actor, 'CARRY_FORWARD', 'FY-' + year));
      var located = adminRequireRow_('materials', item.id);
      adminAppendMovement_(located, 'CARRY_FORWARD', 0, 'FISCAL_YEAR', 'FY-' + year, 'ยกยอดจากปีงบประมาณ ' + year, operationId + ':' + item.id, nextYear, actor);
    });
    materialUpsertSystem_(adminSheet_('system'), 'ACTIVE_FISCAL_YEAR', String(nextYear));
    adminAudit_(actor, 'FISCAL_CLOSE', 'FISCAL_YEAR', 'FY-' + year, null, { opened: nextYear }, operationId);
    return { closedFiscalYear: { year: year }, openedFiscalYear: { year: nextYear } };
  });
}
