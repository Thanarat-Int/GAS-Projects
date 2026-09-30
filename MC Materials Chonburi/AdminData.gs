var ADMIN_REQUISITION_DEPARTMENTS = Object.freeze(['บริหาร', 'วิชาการ']);

function AdminError(status, code, message) {
  this.name = 'AdminError';
  this.status = status;
  this.code = code;
  this.message = message;
  this.stack = (new Error(message)).stack;
}
AdminError.prototype = Object.create(Error.prototype);
AdminError.prototype.constructor = AdminError;

function adminAuthorize_() {
  var active = materialNormalizeEmail_(Session.getActiveUser().getEmail());
  if (active && MATERIAL_CONFIG.ADMIN_EMAILS.indexOf(active) !== -1) return active;
  throw new AdminError(403, 'FORBIDDEN', 'บัญชีนี้ไม่มีสิทธิ์ใช้งานระบบผู้ดูแล');
}

function adminDefinition_(key) {
  for (var index = 0; index < MATERIAL_SHEET_DEFINITIONS.length; index += 1) {
    if (MATERIAL_SHEET_DEFINITIONS[index].key === key) return MATERIAL_SHEET_DEFINITIONS[index];
  }
  throw new AdminError(500, 'SCHEMA', 'ไม่พบโครงสร้างตาราง ' + key);
}

function adminSheet_(key) {
  var sheet = materialSpreadsheet_().getSheetByName(adminDefinition_(key).name);
  if (!sheet) throw new AdminError(500, 'SCHEMA', 'ไม่พบชีท ' + adminDefinition_(key).name);
  return sheet;
}

function adminRows_(key) {
  var sheet = adminSheet_(key);
  var columns = MATERIAL_SCHEMA[key].length;
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, columns).getValues();
}

function adminDisplayRows_(key) {
  var sheet = adminSheet_(key);
  var columns = MATERIAL_SCHEMA[key].length;
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, columns).getDisplayValues();
}

function adminClone_(value) {
  return JSON.parse(JSON.stringify(value));
}

function adminText_(value) {
  return String(value == null ? '' : value).trim();
}

function adminNumber_(value) {
  var result = Number(value || 0);
  return Number.isFinite(result) ? Math.round(result * 1000) / 1000 : 0;
}

function adminBool_(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function adminIso_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (!Number.isFinite(value.getTime())) return '';
    return value.toISOString();
  }
  return String(value);
}

function adminDateOnly_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (!Number.isFinite(value.getTime())) return '';
    return Utilities.formatDate(value, MATERIAL_CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  }
  var text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function adminSystem_() {
  return materialSystemMap_(adminSheet_('system'));
}

function adminActiveFiscalYear_(fiscalYears) {
  var open = (fiscalYears || adminFiscalYears_()).filter(function (item) { return item.status === 'OPEN'; });
  if (open.length !== 1) throw new AdminError(409, 'NO_OPEN_FISCAL_YEAR', 'ต้องมีปีงบประมาณเปิดใช้งานหนึ่งปี');
  return open[0];
}

function adminCategories_() {
  return adminRows_('categories').map(function (row) {
    return {
      id: adminText_(row[0]), code: adminText_(row[1]), nameTh: adminText_(row[2]),
      nameEn: adminText_(row[3]), order: adminNumber_(row[4]), active: adminBool_(row[5]),
      version: adminNumber_(row[6])
    };
  }).filter(function (item) { return item.id && item.active; }).sort(function (a, b) { return a.order - b.order; });
}

function adminDepartments_() {
  return adminRows_('departments').map(function (row) {
    return {
      id: adminText_(row[0]), nameTh: adminText_(row[1]), nameEn: adminText_(row[2]),
      signerName: adminText_(row[3]), signerPosition: adminText_(row[4]), order: adminNumber_(row[5]),
      active: adminBool_(row[6]), version: adminNumber_(row[11])
    };
  }).filter(function (item) { return item.id && item.active; }).sort(function (a, b) { return a.order - b.order; });
}

function adminMaterials_() {
  return adminRows_('materials').map(function (row) {
    var onHand = adminNumber_(row[6]);
    var reserved = adminNumber_(row[7]);
    return {
      id: adminText_(row[0]), code: adminText_(row[1]), categoryId: adminText_(row[2]), name: adminText_(row[3]),
      unit: adminText_(row[4]), packDetail: adminText_(row[5]), onHand: onHand, reserved: reserved,
      available: Math.max(0, adminNumber_(onHand - reserved)), reorderPoint: adminNumber_(row[8]), active: adminBool_(row[9]),
      createdAt: adminIso_(row[10]), createdBy: adminText_(row[11]), updatedAt: adminIso_(row[12]),
      updatedBy: adminText_(row[13]), version: adminNumber_(row[14]), latestPrice: adminNumber_(row[15]),
      note: adminText_(row[16]), imageFileId: adminText_(row[17]), imageUrl: adminText_(row[18]),
      imageMime: adminText_(row[19]), imageSha256: adminText_(row[20])
    };
  }).filter(function (item) { return item.id; });
}

function adminFiscalYears_() {
  return adminRows_('fiscalYears').map(function (row) {
    return {
      id: adminText_(row[0]), year: adminNumber_(row[1]), startDate: adminDateOnly_(row[2]), endDate: adminDateOnly_(row[3]),
      status: adminText_(row[4]), createdAt: adminIso_(row[5]), createdBy: adminText_(row[6]),
      closedAt: adminIso_(row[7]), closedBy: adminText_(row[8]), version: adminNumber_(row[9])
    };
  }).filter(function (item) { return item.id; }).sort(function (a, b) { return a.year - b.year; });
}

function adminFiscalPeriods_() {
  return adminRows_('fiscalPeriods').map(function (row) {
    return {
      id: adminText_(row[0]), materialId: adminText_(row[1]), materialCode: adminText_(row[2]), materialName: adminText_(row[3]),
      fiscalYear: adminNumber_(row[4]), openingBalance: adminNumber_(row[5]), receivedBeforeSystem: adminNumber_(row[6]),
      issuedBeforeSystem: adminNumber_(row[7]), cutoverBalance: adminNumber_(row[8]), reconciliationAdjustment: adminNumber_(row[9]),
      reportedTotalReceived: adminNumber_(row[10]), latestPrice: adminNumber_(row[11]), reportedValue: adminNumber_(row[12]),
      note: adminText_(row[13]), deleted: adminBool_(row[14]), deletedAt: adminIso_(row[15]), deletedBy: adminText_(row[16]),
      receivedInSystem: adminNumber_(row[17]), issuedInSystem: adminNumber_(row[18]), adjustmentIn: adminNumber_(row[19]),
      adjustmentOut: adminNumber_(row[20]), closingBalance: adminNumber_(row[21]), source: adminText_(row[22]),
      sourceReference: adminText_(row[23]), updatedAt: adminIso_(row[24]), version: adminNumber_(row[25])
    };
  }).filter(function (item) { return item.id; });
}

function adminMovements_(materials, categories) {
  var materialMap = {};
  var categoryMap = {};
  (materials || []).forEach(function (item) { materialMap[item.id] = item; });
  (categories || []).forEach(function (item) { categoryMap[item.id] = item.nameTh; });
  return adminRows_('ledger').map(function (row) {
    var material = materialMap[adminText_(row[1])] || {};
    return {
      id: adminText_(row[0]), materialId: adminText_(row[1]), type: adminText_(row[2]), change: adminNumber_(row[3]),
      balanceAfter: adminNumber_(row[4]), referenceType: adminText_(row[5]), referenceNo: adminText_(row[6]),
      note: adminText_(row[7]), occurredAt: adminIso_(row[8]), actor: adminText_(row[9]), operationId: adminText_(row[10]),
      fiscalYear: adminNumber_(row[11]), materialCode: adminText_(row[12]), materialName: adminText_(row[13]),
      materialCategory: categoryMap[material.categoryId] || ''
    };
  }).filter(function (item) { return item.id; }).sort(function (a, b) { return String(b.occurredAt).localeCompare(String(a.occurredAt)); });
}

function adminRequisitions_() {
  var lineMap = {};
  adminRows_('requisitionLines').forEach(function (row) {
    var requisitionId = adminText_(row[1]);
    if (!requisitionId) return;
    if (!lineMap[requisitionId]) lineMap[requisitionId] = [];
    lineMap[requisitionId].push({
      id: adminText_(row[0]), requisitionId: requisitionId, requestNo: adminText_(row[2]), order: adminNumber_(row[3]),
      materialId: adminText_(row[4]), materialCode: adminText_(row[5]), materialName: adminText_(row[6]), unit: adminText_(row[7]),
      quantity: adminNumber_(row[8]), issueQuantity: row[9] === '' || row[9] == null ? null : adminNumber_(row[9]),
      note: adminText_(row[10]), createdAt: adminIso_(row[11]), updatedAt: adminIso_(row[12])
    });
  });
  Object.keys(lineMap).forEach(function (key) { lineMap[key].sort(function (a, b) { return a.order - b.order; }); });
  return adminRows_('requisitions').map(function (row) {
    var id = adminText_(row[0]);
    return {
      id: id, requestNo: adminText_(row[1]), fiscalYear: adminNumber_(row[2]), requestDate: adminDateOnly_(row[3]),
      requesterName: adminText_(row[4]), departmentId: adminText_(row[5]), department: adminText_(row[6]), note: adminText_(row[7]),
      status: adminText_(row[8]), createdAt: adminIso_(row[9]), createdBy: adminText_(row[10]), updatedAt: adminIso_(row[11]),
      updatedBy: adminText_(row[12]), approvedAt: adminIso_(row[13]), approvedBy: adminText_(row[14]),
      issuedAt: adminIso_(row[15]), issuedBy: adminText_(row[16]), rejectedAt: adminIso_(row[17]),
      rejectedBy: adminText_(row[18]), cancelledAt: adminIso_(row[19]), cancelledBy: adminText_(row[20]),
      version: adminNumber_(row[21]), lines: lineMap[id] || []
    };
  }).filter(function (item) { return item.id; }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
}

function adminStats_(year, materials, periods, requisitions) {
  var balances = {};
  periods.filter(function (item) { return item.fiscalYear === year && !item.deleted; }).forEach(function (item) { balances[item.materialId] = item.closingBalance; });
  return {
    activeMaterials: materials.filter(function (item) { return item.active; }).length,
    lowStock: materials.filter(function (item) { return item.active && Object.prototype.hasOwnProperty.call(balances, item.id) && balances[item.id] <= item.reorderPoint; }).length,
    inStockMaterials: Object.keys(balances).filter(function (id) { return balances[id] > 0; }).length,
    pendingRequisitions: requisitions.filter(function (item) { return item.fiscalYear === year && item.status === 'PENDING'; }).length,
    readyToIssue: requisitions.filter(function (item) { return item.fiscalYear === year && item.status === 'APPROVED'; }).length
  };
}

function adminMaterialSnapshot_() {
  var actor = adminAuthorize_();
  var categories = adminCategories_();
  var materials = adminMaterials_();
  var fiscalYears = adminFiscalYears_();
  var periods = adminFiscalPeriods_();
  var requisitions = adminRequisitions_();
  var activeYear = adminActiveFiscalYear_(fiscalYears).year;
  var departments = adminDepartments_();
  return {
    app: { name: MATERIAL_CONFIG.APP_NAME, mode: 'GOOGLE_APPS_SCRIPT', actor: actor, role: 'admin' },
    stats: adminStats_(activeYear, materials, periods, requisitions),
    activeFiscalYear: activeYear,
    fiscalYears: fiscalYears,
    fiscalPeriods: periods,
    categories: categories,
    materials: materials,
    movements: adminMovements_(materials, categories),
    requisitions: requisitions,
    requisitionDepartments: departments.map(function (item) { return item.nameTh; })
  };
}

function adminInkSnapshot_() {
  adminAuthorize_();
  var system = adminSystem_();
  var products = adminRows_('inkProducts').map(function (row) {
    return {
      id: adminText_(row[0]), name: adminText_(row[1]), openingQuantity: adminNumber_(row[2]), openingPrice: adminNumber_(row[3]),
      onHand: adminNumber_(row[4]), unitPrice: adminNumber_(row[5]), imageFileId: adminText_(row[6]), imageUrl: adminText_(row[7]),
      deleted: adminBool_(row[8]), sourceRow: adminNumber_(row[9]), createdAt: adminIso_(row[10]), createdBy: adminText_(row[11]),
      updatedAt: adminIso_(row[12]), updatedBy: adminText_(row[13]), version: adminNumber_(row[14])
    };
  }).filter(function (item) { return item.id && !item.deleted; });
  var productMap = {};
  products.forEach(function (item) { productMap[item.id] = item; });
  var lineMap = {};
  adminRows_('inkDocumentLines').forEach(function (row) {
    var documentId = adminText_(row[1]);
    if (!lineMap[documentId]) lineMap[documentId] = [];
    lineMap[documentId].push({
      id: adminText_(row[0]), documentId: documentId, order: adminNumber_(row[2]), productId: adminText_(row[3]),
      name: adminText_(row[4]), quantity: adminNumber_(row[5]), unitPrice: adminNumber_(row[6]), total: adminNumber_(row[7])
    });
  });
  Object.keys(lineMap).forEach(function (key) { lineMap[key].sort(function (a, b) { return a.order - b.order; }); });
  var documents = adminRows_('inkDocuments').map(function (row) {
    var id = adminText_(row[0]);
    return {
      id: id, type: adminText_(row[1]), sequence: adminNumber_(row[2]), year: adminNumber_(row[3]), date: adminDateOnly_(row[4]),
      departmentId: adminText_(row[5]), department: adminText_(row[6]), note: adminText_(row[7]), source: adminText_(row[8]),
      sourceReference: adminText_(row[9]), deleted: adminBool_(row[10]), createdAt: adminIso_(row[11]), createdBy: adminText_(row[12]),
      updatedAt: adminIso_(row[13]), updatedBy: adminText_(row[14]), version: adminNumber_(row[15]), lines: lineMap[id] || []
    };
  }).filter(function (item) { return item.id && !item.deleted; }).sort(function (a, b) { return a.sequence - b.sequence; });
  var groups = [];
  var withdrawals = [];
  documents.forEach(function (document) {
    if (document.type === 'PURCHASE') {
      var rows = document.lines.map(function (line, index) {
        var sourceRow = Number((line.id.match(/-(\d+)$/) || [])[1] || 0);
        var sourceGroup = document.source === 'IMPORTED_HISTORY' ? document.id.replace(/^INK-SRC-PUR-/, '') : '';
        return {
          productId: line.productId, sourceRow: sourceRow,
          editKey: sourceGroup ? 'source-purchase:' + sourceGroup + ':' + sourceRow : 'transaction:' + document.id,
          imageUrl: (productMap[line.productId] || {}).imageUrl || '',
          cells: [index + 1, line.name, line.quantity, line.unitPrice, line.total]
        };
      });
      var seedGroup = document.source === 'IMPORTED_HISTORY' ? MATERIAL_INK_SEED.groups.filter(function (item) { return item.id === document.id.replace(/^INK-SRC-PUR-/, ''); })[0] : null;
      groups.push({
        id: seedGroup ? seedGroup.id : document.id, date: document.date, year: document.year,
        title: seedGroup ? seedGroup.title : 'ปีงบประมาณ ' + document.year + (document.date ? ' ซื้อวันที่ ' + document.date + ' (' + document.id + ')' : ''),
        note: document.note, rows: rows, total: adminNumber_(rows.reduce(function (sum, row) { return sum + Number(row.cells[4] || 0); }, 0))
      });
    } else if (document.type === 'WITHDRAWAL') {
      document.lines.forEach(function (line) {
        var sourceRow = Number((line.id.match(/-(\d+)$/) || [])[1] || 0);
        var sourceKey = document.source === 'IMPORTED_HISTORY' && /^INK-LINE-W-/.test(line.id);
        withdrawals.push({
          productId: line.productId, sourceRow: sourceKey ? sourceRow : undefined,
          editKey: sourceKey ? 'source-withdrawal:' + sourceRow : 'transaction:' + document.id,
          id: document.id, year: document.year,
          dateISO: document.date, imageUrl: (productMap[line.productId] || {}).imageUrl || '',
          cells: [document.date, document.department, line.name, line.quantity]
        });
      });
    }
  });
  var reasonRows = adminRows_('inkReasons').filter(function (row) { return adminBool_(row[6]); });
  var sectionMap = {};
  reasonRows.forEach(function (row) {
    var id = adminText_(row[1]);
    if (!sectionMap[id]) sectionMap[id] = { id: id, title: adminText_(row[2]), order: adminNumber_(row[3]), reasons: [] };
    sectionMap[id].reasons.push({ order: adminNumber_(row[4]), text: adminText_(row[5]) });
  });
  var sections = Object.keys(sectionMap).map(function (id) {
    var section = sectionMap[id];
    section.reasons.sort(function (a, b) { return a.order - b.order; });
    return { id: section.id, title: section.title, order: section.order, reasons: section.reasons.map(function (item) { return item.text; }) };
  }).sort(function (a, b) { return a.order - b.order; });
  var balances = products.map(function (item, index) {
    return { editKey: 'stock:' + item.id, productId: item.id, imageUrl: item.imageUrl, cells: [index + 1, item.name, item.onHand, item.unitPrice, adminNumber_(item.onHand * item.unitPrice)] };
  });
  return {
    sourceName: MATERIAL_INK_SEED.sourceName,
    sourceSha256: MATERIAL_INK_SEED.sourceSha256,
    purchaseTitle: MATERIAL_INK_SEED.purchaseTitle,
    purchaseColumns: MATERIAL_INK_SEED.purchaseColumns,
    groups: groups,
    withdrawalTitle: MATERIAL_INK_SEED.withdrawalTitle,
    withdrawalColumns: MATERIAL_INK_SEED.withdrawalColumns,
    withdrawals: withdrawals,
    stockTitle: MATERIAL_INK_SEED.stockTitle,
    stockColumns: MATERIAL_INK_SEED.stockColumns,
    stockTotalLabel: MATERIAL_INK_SEED.stockTotalLabel,
    purchaseNotes: MATERIAL_INK_SEED.purchaseNotes,
    products: products,
    transactions: documents.map(function (document) {
      return {
        id: document.id, type: document.type, sequence: document.sequence, year: document.year,
        date: document.date, department: document.department, note: document.note, lines: document.lines.map(function (line) {
          return { productId: line.productId, name: line.name, quantity: line.quantity, unitPrice: line.unitPrice };
        })
      };
    }),
    balances: balances,
    stockTotal: adminNumber_(balances.reduce(function (sum, row) { return sum + Number(row.cells[4] || 0); }, 0)),
    purchaseNoteSections: sections,
    canManage: true,
    audit: [],
    revision: adminNumber_(system.INK_REVISION || 0),
    baselineDate: system.INK_BASELINE_DATE || null
  };
}
