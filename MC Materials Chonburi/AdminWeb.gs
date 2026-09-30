function doGet() {
  adminAuthorize_();
  return HtmlService.createTemplateFromFile('AdminIndex').evaluate()
    .setTitle(MATERIAL_CONFIG.APP_NAME + ' - ผู้ดูแลระบบ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function adminApi(request) {
  try {
    adminAuthorize_();
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new AdminError(400, 'INVALID_REQUEST', 'รูปแบบคำขอไม่ถูกต้อง');
    var method = String(request.method || 'GET').toUpperCase();
    var path = String(request.path || '').split('?')[0];
    var payload = request.body && typeof request.body === 'string' ? JSON.parse(request.body) : (request.body || {});
    var data;
    if (method === 'GET' && path === '/api/state') data = adminMaterialSnapshot_();
    else if (method === 'GET' && path === '/api/ink/state') data = adminInkSnapshot_();
    else if (method === 'POST' && path === '/api/images') data = adminUploadImage_(payload);
    else if (method === 'POST' && path === '/api/materials/create') data = adminCreateMaterial_(payload);
    else if (method === 'POST' && path === '/api/materials/update') data = adminUpdateMaterial_(payload);
    else if (method === 'POST' && path === '/api/annual-materials/create') data = adminCreateAnnualMaterial_(payload);
    else if (method === 'POST' && path === '/api/annual-materials/update') data = adminUpdateAnnualMaterial_(payload);
    else if (method === 'POST' && path === '/api/annual-materials/delete') data = adminDeleteAnnualMaterial_(payload);
    else if (method === 'POST' && path === '/api/stock') data = adminRecordStock_(payload);
    else if (method === 'POST' && path === '/api/requisitions/create') data = adminCreateRequisition_(payload);
    else if (method === 'POST' && path === '/api/requisitions/update') data = adminUpdateRequisition_(payload);
    else if (method === 'POST' && path === '/api/requisitions/update-allocation') data = adminUpdateRequisitionAllocation_(payload);
    else if (method === 'POST' && path === '/api/requisitions/update-notes') data = adminUpdateRequisitionNotes_(payload);
    else if (method === 'POST' && path === '/api/requisitions/approve') data = adminApproveRequisition_(payload);
    else if (method === 'POST' && path === '/api/requisitions/reject') data = adminRejectRequisition_(payload);
    else if (method === 'POST' && path === '/api/requisitions/issue') data = adminIssueRequisition_(payload);
    else if (method === 'POST' && path === '/api/requisitions/cancel') data = adminCancelRequisition_(payload);
    else if (method === 'POST' && path === '/api/fiscal-years/close') data = adminCloseFiscalYear_(payload);
    else if (method === 'POST' && path === '/api/ink/changes') data = adminInkCommit_(payload, 'CHANGE');
    else if (method === 'POST' && path === '/api/ink/products') data = adminInkCommit_(payload, 'PRODUCT');
    else if (method === 'POST' && path === '/api/ink/notes') data = adminInkCommit_(payload, 'NOTES');
    else if (method === 'POST' && path === '/api/ink/purchases') data = adminInkCommit_(payload, 'PURCHASE');
    else if (method === 'POST' && path === '/api/ink/withdrawals') data = adminInkCommit_(payload, 'WITHDRAWAL');
    else throw new AdminError(404, 'NOT_FOUND', 'ไม่พบคำสั่งที่ต้องการ');
    return { ok: true, status: 200, data: data };
  } catch (error) {
    console.error(JSON.stringify({
      event: 'admin_api_error', path: request && request.path, code: error.code || 'INTERNAL_ERROR',
      message: error.message, stack: error.stack || ''
    }));
    return {
      ok: false,
      status: error instanceof AdminError ? error.status : 500,
      code: error.code || 'INTERNAL_ERROR',
      message: error instanceof AdminError ? error.message : 'ระบบขัดข้อง กรุณาลองใหม่'
    };
  }
}
