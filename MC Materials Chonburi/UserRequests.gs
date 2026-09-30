function userHash_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map(function (byte) { return ('0' + (byte & 255).toString(16)).slice(-2); }).join('');
}

function userFindRow_(rows, id) {
  for (var index = 0; index < rows.length; index += 1) {
    if (userText_(rows[index][0]) === id) return rows[index];
  }
  return null;
}

function userCreateRequisition_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new UserError(400, 'INVALID_REQUEST', 'ข้อมูลคำขอไม่ถูกต้อง');
  var operationId = userClean_(input.operationId, 'รหัสการส่งคำขอ', 100);
  if (!/^[A-Za-z0-9-]{10,100}$/.test(operationId)) throw new UserError(400, 'INVALID_OPERATION_ID', 'รหัสการส่งคำขอไม่ถูกต้อง');
  var requestHash = userHash_('PUBLIC_REQUISITION_CREATE|' + JSON.stringify(input));
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(USER_CONFIG.LOCK_TIMEOUT_MS)) throw new UserError(503, 'BUSY', 'ระบบกำลังบันทึก กรุณาลองอีกครั้ง');
  try {
    var previous = userFindRow_(userRows_('operations', 6), operationId);
    if (previous) {
      if (userText_(previous[1]) !== 'PUBLIC_REQUISITION_CREATE' || userText_(previous[2]) !== requestHash) throw new UserError(409, 'OPERATION_REUSED', 'คำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว');
      return JSON.parse(userText_(previous[3]));
    }
    var catalog = userCatalog_();
    var fiscal = catalog.fiscalYear;
    var date = userClean_(input.requestDate, 'วันที่ขอเบิก', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError(400, 'INVALID_DATE', 'วันที่ขอเบิกไม่ถูกต้อง');
    var parts = date.split('-').map(Number);
    if (new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).toISOString().slice(0, 10) !== date || date < fiscal.startDate || date > fiscal.endDate) {
      throw new UserError(400, 'INVALID_DATE', 'วันที่ขอเบิกอยู่นอกปีงบประมาณที่เปิดใช้งาน');
    }
    var requester = userClean_(input.requesterName, 'ชื่อผู้ขอเบิก', 160);
    var department = userClean_(input.department, 'ฝ่ายที่ขอเบิก', 100);
    if (catalog.requisitionDepartments.indexOf(department) === -1) throw new UserError(400, 'INVALID_DEPARTMENT', 'กรุณาเลือกฝ่ายจากรายการ');
    var note = userText_(input.note);
    if (note.length > 500 || /^[=+\-@]/.test(note) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(note)) throw new UserError(400, 'INVALID_NOTE', 'วัตถุประสงค์การเบิกไม่ถูกต้อง');
    if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 20) throw new UserError(400, 'INVALID_LINES', 'ต้องเลือกวัสดุ 1 ถึง 20 รายการ');
    var materialMap = {};
    catalog.materials.forEach(function (material) { materialMap[material.id] = material; });
    var seen = {};
    var lines = input.lines.map(function (line, index) {
      var id = userClean_(line && line.materialId, 'วัสดุ', 80);
      var material = materialMap[id];
      if (!material || seen[id]) throw new UserError(400, 'INVALID_MATERIAL', 'วัสดุไม่ถูกต้องหรือมีรายการซ้ำ');
      seen[id] = true;
      var quantity = Number(line.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new UserError(400, 'INVALID_QUANTITY', 'จำนวนเบิกต้องเป็นเลขจำนวนเต็มอย่างน้อย 1');
      var maximum = Math.max(0, Math.floor(material.available - 1));
      if (quantity > maximum) throw new UserError(409, 'MINIMUM_STOCK_REQUIRED', material.name + ' เบิกได้สูงสุด ' + maximum + ' ' + material.unit);
      return { order: index + 1, material: material, quantity: quantity };
    });
    var suffix = userHash_(operationId).slice(0, 16).toUpperCase();
    var requestNo = 'REQ-' + fiscal.year + '-U' + suffix;
    var departmentRows = userRows_('departments', 12);
    var departmentRow = departmentRows.filter(function (row) { return userText_(row[1]) === department; })[0];
    var now = new Date();
    var actor = 'USER_PORTAL';
    var lineSheet = userSheet_('requisitionLines');
    var existingLines = userRows_('requisitionLines', 13);
    lines.forEach(function (line) {
      var lineId = requestNo + '-L' + String(line.order).padStart(2, '0');
      if (userFindRow_(existingLines, lineId)) return;
      lineSheet.appendRow([
        lineId, requestNo, requestNo, line.order, line.material.id, line.material.code,
        line.material.name, line.material.unit, line.quantity, '', '', now, now
      ]);
    });
    var existingRequest = userFindRow_(userRows_('requisitions', 22), requestNo);
    if (!existingRequest) userSheet_('requisitions').appendRow([
      requestNo, requestNo, fiscal.year, new Date(date + 'T00:00:00+07:00'), requester,
      userText_(departmentRow[0]), department, note, 'PENDING', now, actor, now, actor,
      '', '', '', '', '', '', '', '', 1
    ]);
    var result = { requisition: { requestNo: requestNo, requestDate: date, status: 'PENDING' } };
    var auditId = 'AUD-USER-' + requestNo;
    if (!userFindRow_(userRows_('audit', 9), auditId)) userSheet_('audit').appendRow([
      auditId, now, actor, 'REQUISITION_CREATE', 'REQUISITION', requestNo,
      '', JSON.stringify({ lines: lines.length }), operationId
    ]);
    userSheet_('operations').appendRow([
      operationId, 'PUBLIC_REQUISITION_CREATE', requestHash, JSON.stringify(result),
      now, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    ]);
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}
