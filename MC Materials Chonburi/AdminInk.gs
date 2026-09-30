function adminInkRevision_() {
  return adminNumber_(adminSystem_().INK_REVISION || 0);
}

function adminInkRequireRevision_(input) {
  if (Number(input.revision) !== adminInkRevision_()) throw new AdminError(409, 'INK_CONFLICT', 'ข้อมูลเปลี่ยนแล้ว กรุณาปิดฟอร์มและโหลดข้อมูลใหม่');
}

function adminInkAdvanceRevision_() {
  var next = adminInkRevision_() + 1;
  materialUpsertSystem_(adminSheet_('system'), 'INK_REVISION', String(next));
  return next;
}

function adminInkDate_(value) {
  var text = adminClean_(value, 'วันที่', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AdminError(400, 'INVALID_DATE', 'วันที่ไม่ถูกต้อง');
  var parts = text.split('-').map(Number);
  if (new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).toISOString().slice(0, 10) !== text) throw new AdminError(400, 'INVALID_DATE', 'วันที่ไม่ถูกต้อง');
  var fiscalYear = parts[0] + 543 + (parts[1] >= 10 ? 1 : 0);
  return { text: text, date: materialDate_(text), fiscalYear: fiscalYear };
}

function adminInkProductMap_() {
  var result = {};
  adminRows_('inkProducts').forEach(function (row, index) {
    if (!adminText_(row[0])) return;
    result[adminText_(row[0])] = { index: index, rowNumber: index + 2, values: row };
  });
  return result;
}

function adminInkDocumentMap_() {
  var result = {};
  adminRows_('inkDocuments').forEach(function (row, index) {
    if (!adminText_(row[0])) return;
    result[adminText_(row[0])] = { index: index, rowNumber: index + 2, values: row };
  });
  return result;
}

function adminInkResolveLine_(line, productMap, allowNew, actor) {
  if (!line || typeof line !== 'object') throw new AdminError(400, 'INVALID_INK_LINE', 'รายการหมึกไม่ถูกต้อง');
  if (line.newProductName !== undefined) {
    if (!allowNew || line.productId) throw new AdminError(400, 'INVALID_INK_PRODUCT', 'เพิ่มรุ่นหมึกใหม่ได้ในรายการซื้อเท่านั้น');
    var name = adminClean_(line.newProductName, 'ชื่อรุ่นหมึกใหม่');
    var normalized = name.toLocaleLowerCase().replace(/\s+/g, '');
    Object.keys(productMap).forEach(function (id) {
      if (!adminBool_(productMap[id].values[8]) && adminText_(productMap[id].values[1]).toLocaleLowerCase().replace(/\s+/g, '') === normalized) {
        throw new AdminError(409, 'DUPLICATE_INK_PRODUCT', 'มีชื่อหมึกนี้แล้ว กรุณาเลือกจากรายการเดิม');
      }
    });
    var sequence = adminNextSequence_('INK_PRODUCT_SEQUENCE');
    var id = 'INK-' + String(sequence).padStart(4, '0');
    var now = new Date();
    var row = [id, name, 0, 0, 0, 0, '', '', false, '', now, actor, now, actor, 1];
    var rowNumber = adminAppendRow_('inkProducts', row);
    productMap[id] = { rowNumber: rowNumber, values: row };
    return productMap[id];
  }
  var product = productMap[adminClean_(line.productId, 'รุ่นหมึก', 80)];
  if (!product || adminBool_(product.values[8])) throw new AdminError(404, 'INK_PRODUCT_NOT_FOUND', 'ไม่พบหมึกที่เลือก');
  return product;
}

function adminInkPreflightLines_(lines, productMap, type, checkAvailable) {
  var seen = {};
  lines.forEach(function (line) {
    if (!line || typeof line !== 'object') throw new AdminError(400, 'INVALID_INK_LINE', 'รายการหมึกไม่ถูกต้อง');
    var key;
    var product = null;
    if (line.newProductName !== undefined) {
      if (type !== 'PURCHASE' || line.productId) throw new AdminError(400, 'INVALID_INK_PRODUCT', 'เพิ่มรุ่นหมึกใหม่ได้ในรายการซื้อเท่านั้น');
      key = adminClean_(line.newProductName, 'ชื่อรุ่นหมึกใหม่').toLocaleLowerCase().replace(/\s+/g, '');
      Object.keys(productMap).forEach(function (id) {
        if (!adminBool_(productMap[id].values[8]) && adminText_(productMap[id].values[1]).toLocaleLowerCase().replace(/\s+/g, '') === key) throw new AdminError(409, 'DUPLICATE_INK_PRODUCT', 'มีชื่อหมึกนี้แล้ว');
      });
      key = 'new:' + key;
    } else {
      key = adminClean_(line.productId, 'รุ่นหมึก', 80);
      product = productMap[key];
      if (!product || adminBool_(product.values[8])) throw new AdminError(404, 'INK_PRODUCT_NOT_FOUND', 'ไม่พบหมึกที่เลือก');
    }
    if (seen[key]) throw new AdminError(409, 'DUPLICATE_INK_LINE', 'หมึกซ้ำในเอกสาร กรุณารวมจำนวนเป็นบรรทัดเดียว');
    seen[key] = true;
    var quantity = adminInkQuantity_(line.quantity);
    if (type === 'PURCHASE') adminInkPrice_(line.unitPrice);
    if (checkAvailable && product && quantity > adminNumber_(product.values[4])) throw new AdminError(409, 'INK_INSUFFICIENT_STOCK', product.values[1] + ' คงเหลือไม่เพียงพอ');
  });
}

function adminInkQuantity_(value) {
  return adminInteger_(value, 'จำนวน', 1);
}

function adminInkPrice_(value) {
  var result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 100000000) throw new AdminError(400, 'INVALID_INK_PRICE', 'ราคาต่อหน่วยไม่ถูกต้อง');
  return Math.round(result * 100) / 100;
}

function adminInkSetImage_(product, imageUrl) {
  if (imageUrl === undefined) return;
  var image = adminImageMeta_(imageUrl);
  product.values[6] = image.fileId;
  product.values[7] = image.url;
}

function adminInkSaveProduct_(product, actor) {
  product.values[12] = new Date();
  product.values[13] = actor;
  product.values[14] = adminNumber_(product.values[14]) + 1;
  adminSheet_('inkProducts').getRange(product.rowNumber, 1, 1, MATERIAL_SCHEMA.inkProducts.length).setValues([product.values]);
}

function adminInkRecalculateStock_(actor) {
  var productRows = adminRows_('inkProducts');
  var documentRows = adminRows_('inkDocuments');
  var activeDocs = {};
  documentRows.forEach(function (row) {
    if (!adminBool_(row[10]) && adminText_(row[8]) !== 'IMPORTED_HISTORY') activeDocs[adminText_(row[0])] = adminText_(row[1]);
  });
  var totals = {};
  productRows.forEach(function (row) { totals[adminText_(row[0])] = adminNumber_(row[2]); });
  adminRows_('inkDocumentLines').forEach(function (row) {
    var type = activeDocs[adminText_(row[1])];
    var productId = adminText_(row[3]);
    if (!type || !Object.prototype.hasOwnProperty.call(totals, productId)) return;
    totals[productId] = adminNumber_(totals[productId] + (type === 'PURCHASE' ? adminNumber_(row[5]) : -adminNumber_(row[5])));
  });
  productRows.forEach(function (row) {
    if (totals[adminText_(row[0])] < 0) throw new AdminError(409, 'INK_NEGATIVE_STOCK', 'การแก้ไขทำให้สต็อกหมึกติดลบ');
  });
  productRows.forEach(function (row) {
    row[4] = totals[adminText_(row[0])];
    row[12] = new Date(); row[13] = actor; row[14] = adminNumber_(row[14]) + 1;
  });
  if (productRows.length) adminSheet_('inkProducts').getRange(2, 1, productRows.length, MATERIAL_SCHEMA.inkProducts.length).setValues(productRows);
}

function adminInkReplaceDocumentLines_(documentId, lines) {
  var all = adminRows_('inkDocumentLines').filter(function (row) { return adminText_(row[1]) !== documentId; });
  lines.forEach(function (line, index) {
    all.push([
      'INK-LINE-' + documentId + '-' + String(index + 1).padStart(3, '0'), documentId, index + 1,
      line.productId, line.name, line.quantity, line.unitPrice, adminNumber_(line.quantity * line.unitPrice)
    ]);
  });
  adminReplaceRows_('inkDocumentLines', all);
}

function adminInkCreateDocument_(input, type, actor) {
  var date = adminInkDate_(input.date);
  var today = Utilities.formatDate(new Date(), MATERIAL_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  if (date.text > today) throw new AdminError(400, 'INK_FUTURE_DATE', 'ไม่สามารถบันทึกรับหรือจ่ายล่วงหน้าได้');
  var system = adminSystem_();
  var baseline = '';
  if (!system.INK_BASELINE_DATE) {
    if (input.confirmBaseline !== true) throw new AdminError(400, 'INK_BASELINE_REQUIRED', 'กรุณายืนยันยอดคงเหลือเริ่มต้นก่อนบันทึกครั้งแรก');
    baseline = adminInkDate_(input.baselineDate).text;
    if (baseline > today || date.text < baseline) throw new AdminError(400, 'INK_BASELINE_INVALID', 'วันที่เริ่มใช้ยอดคงเหลือไม่ถูกต้อง');
  } else if (date.text < system.INK_BASELINE_DATE) {
    throw new AdminError(400, 'INK_DATE_BEFORE_BASELINE', 'วันที่ต้องไม่ก่อนวันเริ่มใช้ยอดคงเหลือ');
  }
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) throw new AdminError(400, 'INVALID_INK_LINES', 'ต้องมีรายการ 1 ถึง 100 รายการ');
  var productMap = adminInkProductMap_();
  adminInkPreflightLines_(input.lines, productMap, type, type === 'WITHDRAWAL');
  var seen = {};
  var normalizedLines = input.lines.map(function (line) {
    var product = adminInkResolveLine_(line, productMap, type === 'PURCHASE', actor);
    var id = adminText_(product.values[0]);
    if (seen[id]) throw new AdminError(409, 'DUPLICATE_INK_LINE', 'หมึกซ้ำในเอกสาร กรุณารวมจำนวนเป็นบรรทัดเดียว');
    seen[id] = true;
    var quantity = adminInkQuantity_(line.quantity);
    if (type === 'WITHDRAWAL' && quantity > adminNumber_(product.values[4])) throw new AdminError(409, 'INK_INSUFFICIENT_STOCK', product.values[1] + ' คงเหลือไม่เพียงพอ');
    return { productId: id, name: adminText_(product.values[1]), quantity: quantity, unitPrice: type === 'PURCHASE' ? adminInkPrice_(line.unitPrice) : adminNumber_(product.values[5]) };
  });
  var department = type === 'WITHDRAWAL' ? adminClean_(input.department, 'ฝ่าย', 100) : '';
  var sequence = adminNextSequence_('INK_DOCUMENT_SEQUENCE');
  var prefix = type === 'PURCHASE' ? 'INK-PUR' : 'INK-ISS';
  var id = prefix + '-' + date.fiscalYear + '-' + String(sequence).padStart(5, '0');
  var now = new Date();
  if (baseline) materialUpsertSystem_(adminSheet_('system'), 'INK_BASELINE_DATE', baseline);
  adminAppendRow_('inkDocuments', [
    id, type, sequence, date.fiscalYear, date.date, type === 'WITHDRAWAL' ? adminDepartmentId_(department) : '', department,
    adminText_(input.note).slice(0, 1000), 'SYSTEM', id, false, now, actor, now, actor, 1
  ]);
  adminInkReplaceDocumentLines_(id, normalizedLines);
  normalizedLines.forEach(function (line) {
    var product = productMap[line.productId];
    product.values[4] = adminNumber_(product.values[4]) + (type === 'PURCHASE' ? line.quantity : -line.quantity);
    if (type === 'PURCHASE') product.values[5] = line.unitPrice;
    adminInkSaveProduct_(product, actor);
  });
  return id;
}

function adminInkUpdateNotes_(input, actor) {
  if (!Array.isArray(input.sections) || input.sections.length > 20) throw new AdminError(400, 'INVALID_INK_NOTES', 'หัวข้อต้องมีไม่เกิน 20 หัวข้อ');
  var now = new Date();
  var rows = [];
  input.sections.forEach(function (section, sectionIndex) {
    if (!section || !Array.isArray(section.reasons) || section.reasons.length < 1 || section.reasons.length > 20) throw new AdminError(400, 'INVALID_INK_NOTES', 'แต่ละหัวข้อต้องมีเหตุผล 1 ถึง 20 รายการ');
    var sectionId = /^INK-NOTE-[A-Za-z0-9-]{1,80}$/.test(adminText_(section.id)) ? adminText_(section.id) : 'INK-NOTE-' + String(sectionIndex + 1).padStart(4, '0');
    var title = adminClean_(section.title, 'หัวข้อ', 160);
    section.reasons.forEach(function (reason, reasonIndex) {
      rows.push(['INK-REASON-' + String(rows.length + 1).padStart(4, '0'), sectionId, title, sectionIndex + 1, reasonIndex + 1, adminClean_(reason, 'เหตุผล', 1000), true, now, actor, now, actor, 1]);
    });
  });
  adminReplaceRows_('inkReasons', rows);
  return 'INK-NOTES';
}

function adminInkCreateProduct_(input, actor) {
  var productMap = adminInkProductMap_();
  var name = adminClean_(input.name, 'รายการหมึก');
  var normalized = name.toLocaleLowerCase().replace(/\s+/g, '');
  Object.keys(productMap).forEach(function (id) {
    if (!adminBool_(productMap[id].values[8]) && adminText_(productMap[id].values[1]).toLocaleLowerCase().replace(/\s+/g, '') === normalized) throw new AdminError(409, 'DUPLICATE_INK_PRODUCT', 'มีชื่อหมึกนี้แล้ว');
  });
  var sequence = adminNextSequence_('INK_PRODUCT_SEQUENCE');
  var id = 'INK-' + String(sequence).padStart(4, '0');
  var now = new Date();
  var image = adminImageMeta_(input.imageUrl);
  adminAppendRow_('inkProducts', [id, name, 0, 0, 0, 0, image.fileId, image.url, false, '', now, actor, now, actor, 1]);
  return id;
}

function adminInkChange_(input, actor) {
  var key = adminClean_(input.key, 'รายการที่แก้ไข');
  var deleting = input.action === 'DELETE';
  if (!deleting && input.action !== 'UPDATE') throw new AdminError(400, 'INVALID_INK_ACTION', 'คำสั่งไม่ถูกต้อง');
  if (!deleting) adminClean_(input.reason, 'เหตุผลการแก้ไข', 1000);
  if (key.indexOf('stock:') === 0) {
    var product = adminInkProductMap_()[key.slice(6)];
    if (!product || adminBool_(product.values[8])) throw new AdminError(404, 'INK_PRODUCT_NOT_FOUND', 'ไม่พบรายการหมึก');
    if (deleting) {
      if (adminNumber_(product.values[4]) !== 0) throw new AdminError(409, 'INK_DELETE_NONZERO', 'ต้องปรับคงเหลือเป็น 0 ก่อนลบรายการหมึก');
      product.values[8] = true;
    } else {
      product.values[1] = adminClean_(input.name, 'รายการ');
      var nextQuantity = adminInteger_(input.quantity, 'คงเหลือ', 0);
      product.values[2] = adminNumber_(product.values[2]) + nextQuantity - adminNumber_(product.values[4]);
      product.values[4] = nextQuantity;
      product.values[5] = adminInkPrice_(input.unitPrice);
      adminInkSetImage_(product, input.imageUrl);
    }
    adminInkSaveProduct_(product, actor);
    return key;
  }
  if (key.indexOf('source-purchase:') === 0 || key.indexOf('source-withdrawal:') === 0) {
    var purchase = key.indexOf('source-purchase:') === 0;
    var match = purchase ? key.match(/^source-purchase:([A-Za-z0-9_-]+):(\d+)$/) : key.match(/^source-withdrawal:(\d+)$/);
    if (!match) throw new AdminError(400, 'INVALID_INK_KEY', 'รหัสรายการย้อนหลังไม่ถูกต้อง');
    var sourceRow = Number(purchase ? match[2] : match[1]);
    var lineId = purchase ? 'INK-LINE-P-' + match[1] + '-' + sourceRow : 'INK-LINE-W-' + sourceRow;
    var sourceLine = adminLocateRow_('inkDocumentLines', lineId);
    if (!sourceLine) throw new AdminError(404, 'INK_SOURCE_NOT_FOUND', 'ไม่พบรายการย้อนหลัง');
    var sourceDocument = adminInkDocumentMap_()[adminText_(sourceLine.values[1])];
    if (!sourceDocument || adminText_(sourceDocument.values[8]) !== 'IMPORTED_HISTORY' || adminBool_(sourceDocument.values[10])) throw new AdminError(404, 'INK_SOURCE_NOT_FOUND', 'ไม่พบรายการย้อนหลัง');
    if (deleting) {
      var remaining = adminRows_('inkDocumentLines').filter(function (row) { return adminText_(row[1]) === adminText_(sourceDocument.values[0]) && adminText_(row[0]) !== lineId; });
      if (!remaining.length) {
        sourceDocument.values[10] = true;
        sourceDocument.values[13] = new Date(); sourceDocument.values[14] = actor;
        sourceDocument.values[15] = adminNumber_(sourceDocument.values[15]) + 1;
        adminSheet_('inkDocuments').getRange(sourceDocument.rowNumber, 1, 1, MATERIAL_SCHEMA.inkDocuments.length).setValues([sourceDocument.values]);
      }
      adminReplaceRows_('inkDocumentLines', adminRows_('inkDocumentLines').filter(function (row) { return adminText_(row[0]) !== lineId; }));
      return key;
    }
    sourceLine.values[4] = adminClean_(input.name, 'รายการ');
    sourceLine.values[5] = adminInteger_(input.quantity, purchase ? 'จำนวน' : 'จำนวนเบิก', 0);
    if (purchase) {
      sourceLine.values[6] = adminInkPrice_(input.unitPrice);
      sourceLine.values[7] = adminNumber_(sourceLine.values[5] * sourceLine.values[6]);
    } else {
      var sourceDate = adminInkDate_(input.date);
      var sourceDepartment = adminClean_(input.department, 'ฝ่าย', 100);
      var docId = adminText_(sourceDocument.values[0]);
      var siblingCount = adminRows_('inkDocumentLines').filter(function (row) { return adminText_(row[1]) === docId; }).length;
      if (siblingCount > 1 && (adminDateOnly_(sourceDocument.values[4]) !== sourceDate.text || adminText_(sourceDocument.values[6]) !== sourceDepartment)) {
        var splitId = 'INK-SRC-ISS-ROW-' + sourceRow;
        if (adminInkDocumentMap_()[splitId]) throw new AdminError(409, 'INK_SOURCE_CONFLICT', 'รายการย้อนหลังนี้ถูกแก้ไขแล้ว กรุณาโหลดใหม่');
        var sequence = adminNextSequence_('INK_DOCUMENT_SEQUENCE');
        var now = new Date();
        adminAppendRow_('inkDocuments', [splitId, 'WITHDRAWAL', sequence, sourceDate.fiscalYear, sourceDate.date, adminDepartmentId_(sourceDepartment), sourceDepartment, '', 'IMPORTED_HISTORY', 'WITHDRAWAL_ROW_' + sourceRow, false, now, actor, now, actor, 1]);
        sourceLine.values[1] = splitId;
      } else {
        sourceDocument.values[3] = sourceDate.fiscalYear;
        sourceDocument.values[4] = sourceDate.date;
        sourceDocument.values[5] = adminDepartmentId_(sourceDepartment);
        sourceDocument.values[6] = sourceDepartment;
        sourceDocument.values[13] = new Date(); sourceDocument.values[14] = actor;
        sourceDocument.values[15] = adminNumber_(sourceDocument.values[15]) + 1;
        adminSheet_('inkDocuments').getRange(sourceDocument.rowNumber, 1, 1, MATERIAL_SCHEMA.inkDocuments.length).setValues([sourceDocument.values]);
      }
    }
    adminSheet_('inkDocumentLines').getRange(sourceLine.rowNumber, 1, 1, MATERIAL_SCHEMA.inkDocumentLines.length).setValues([sourceLine.values]);
    if (input.imageUrl !== undefined && adminText_(sourceLine.values[3])) {
      var sourceProduct = adminInkProductMap_()[adminText_(sourceLine.values[3])];
      if (sourceProduct) { adminInkSetImage_(sourceProduct, input.imageUrl); adminInkSaveProduct_(sourceProduct, actor); }
    }
    return key;
  }
  if (key.indexOf('transaction:') === 0) {
    var documentId = key.slice(12);
    var document = adminInkDocumentMap_()[documentId];
    if (!document || adminBool_(document.values[10])) throw new AdminError(404, 'INK_DOCUMENT_NOT_FOUND', 'ไม่พบเอกสารหมึก');
    if (adminText_(document.values[8]) === 'IMPORTED_HISTORY') throw new AdminError(400, 'INK_SOURCE_KEY_REQUIRED', 'กรุณาแก้ไขประวัติรายบรรทัด');
    var type = adminText_(document.values[1]);
    var oldLines = adminRows_('inkDocumentLines').filter(function (row) { return adminText_(row[1]) === documentId; });
    var lines = [];
    var date;
    if (!deleting) {
      date = adminInkDate_(input.date);
      if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) throw new AdminError(400, 'INVALID_INK_LINES', 'ต้องมีรายการ 1 ถึง 100 รายการ');
      var productMap = adminInkProductMap_();
      adminInkPreflightLines_(input.lines, productMap, type, false);
      var seen = {};
      lines = input.lines.map(function (line) {
        var resolved = adminInkResolveLine_(line, productMap, type === 'PURCHASE', actor);
        var id = adminText_(resolved.values[0]);
        if (seen[id]) throw new AdminError(409, 'DUPLICATE_INK_LINE', 'หมึกซ้ำในเอกสาร');
        seen[id] = true;
        return { productId: id, name: adminText_(resolved.values[1]), quantity: adminInkQuantity_(line.quantity), unitPrice: type === 'PURCHASE' ? adminInkPrice_(line.unitPrice) : adminNumber_(resolved.values[5]) };
      });
    }
    var nextBalances = {};
    var currentProducts = adminInkProductMap_();
    Object.keys(currentProducts).forEach(function (id) { nextBalances[id] = adminNumber_(currentProducts[id].values[4]); });
    var direction = type === 'PURCHASE' ? 1 : -1;
    oldLines.forEach(function (line) {
      var id = adminText_(line[3]);
      if (Object.prototype.hasOwnProperty.call(nextBalances, id)) nextBalances[id] = adminNumber_(nextBalances[id] - direction * adminNumber_(line[5]));
    });
    lines.forEach(function (line) {
      if (Object.prototype.hasOwnProperty.call(nextBalances, line.productId)) nextBalances[line.productId] = adminNumber_(nextBalances[line.productId] + direction * line.quantity);
    });
    Object.keys(nextBalances).forEach(function (id) {
      if (nextBalances[id] < 0) throw new AdminError(409, 'INK_NEGATIVE_STOCK', 'การแก้ไขทำให้สต็อกหมึกติดลบ');
    });
    if (deleting) {
      document.values[10] = true;
    } else {
      document.values[3] = date.fiscalYear; document.values[4] = date.date;
      document.values[5] = type === 'WITHDRAWAL' ? adminDepartmentId_(adminClean_(input.department, 'ฝ่าย', 100)) : '';
      document.values[6] = type === 'WITHDRAWAL' ? input.department : ''; document.values[7] = adminText_(input.note).slice(0, 1000);
      adminInkReplaceDocumentLines_(documentId, lines);
    }
    document.values[13] = new Date(); document.values[14] = actor; document.values[15] = adminNumber_(document.values[15]) + 1;
    adminSheet_('inkDocuments').getRange(document.rowNumber, 1, 1, MATERIAL_SCHEMA.inkDocuments.length).setValues([document.values]);
    adminInkRecalculateStock_(actor);
    return key;
  }
  throw new AdminError(400, 'INVALID_INK_KEY', 'ไม่พบรายการที่แก้ไข');
}

function adminInkCommit_(input, type) {
  var action = 'INK_' + type;
  var result = adminRunMutation_(action, input, function (actor, operationId) {
    adminInkRequireRevision_(input);
    var id;
    if (type === 'PURCHASE' || type === 'WITHDRAWAL') id = adminInkCreateDocument_(input, type, actor);
    else if (type === 'PRODUCT') id = adminInkCreateProduct_(input, actor);
    else if (type === 'NOTES') id = adminInkUpdateNotes_(input, actor);
    else if (type === 'CHANGE') id = adminInkChange_(input, actor);
    else throw new AdminError(404, 'INK_ACTION_NOT_FOUND', 'ไม่พบคำสั่งหมึก');
    var revision = adminInkAdvanceRevision_();
    adminAudit_(actor, action, 'INK', id, null, { revision: revision, reason: input.reason || '' }, operationId);
    return { id: id };
  });
  result.state = adminInkSnapshot_();
  return result;
}
