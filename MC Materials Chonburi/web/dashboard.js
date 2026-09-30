const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const sum = (items, selector) => items.reduce((total, item) => total + Number(selector(item) || 0), 0);
const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function fiscalMonths(fiscalYear) {
  const startYear = Number(fiscalYear) - 544;
  return [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8].map(month => {
    const year = month >= 9 ? startYear : startYear + 1;
    return { key: `${year}-${String(month + 1).padStart(2, '0')}`, year, month, received: 0, issued: 0 };
  });
}

function bangkokMonthKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).formatToParts(date);
  const year = parts.find(item => item.type === 'year')?.value;
  const month = parts.find(item => item.type === 'month')?.value;
  return year && month ? `${year}-${month}` : '';
}

function currentCalendarYear(today) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric' }).format(today));
}

export function buildDashboardModel(data, inkData, fiscalYear, today = new Date()) {
  const periods = data.fiscalPeriods.filter(item => item.fiscalYear === Number(fiscalYear) && !item.deleted);
  const materials = new Map(data.materials.map(item => [item.id, item]));
  const monthlyFlow = fiscalMonths(fiscalYear);
  const monthlyFlowByKey = new Map(monthlyFlow.map(item => [item.key, item]));
  data.movements.filter(item => item.fiscalYear === Number(fiscalYear)).forEach(item => {
    const month = monthlyFlowByKey.get(bangkokMonthKey(item.occurredAt));
    if (!month) return;
    if (item.type === 'RECEIPT' || item.type === 'ADJUST_IN') month.received += Math.abs(Number(item.change || 0));
    if (item.type === 'ISSUE' || item.type === 'ADJUST_OUT') month.issued += Math.abs(Number(item.change || 0));
  });
  const categoryStats = data.categories.map(category => {
    const rows = periods.filter(item => materials.get(item.materialId)?.categoryId === category.id);
    return {
      id: category.id,
      nameTh: category.nameTh,
      nameEn: category.nameEn,
      items: rows.length,
      received: sum(rows, row => row.receivedBeforeSystem + row.receivedInSystem + row.adjustmentIn),
      issued: sum(rows, row => row.issuedBeforeSystem + row.issuedInSystem + row.adjustmentOut),
      onHand: sum(rows, row => row.closingBalance),
      value: roundMoney(sum(rows, row => row.closingBalance * row.latestPrice)),
    };
  }).filter(item => item.items > 0);
  const lowStock = periods
    .filter(item => item.closingBalance <= 10)
    .map(item => ({ ...item, categoryId: materials.get(item.materialId)?.categoryId }))
    .sort((a, b) => a.closingBalance - b.closingBalance || a.materialName.localeCompare(b.materialName, 'th'));
  const emptyStock = lowStock.filter(item => item.closingBalance <= 0).length;

  const inkGroups = [...(inkData?.groups || [])].sort((a, b) => a.year - b.year || String(a.date || a.id).localeCompare(String(b.date || b.id)));
  const inkPurchasesByYear = [...new Map(inkGroups.map(group => [Number(group.year), 0]))].map(([year]) => ({
    year,
    value: roundMoney(sum(inkGroups.filter(group => Number(group.year) === year), group => group.total)),
    quantity: sum(inkGroups.filter(group => Number(group.year) === year).flatMap(group => group.rows), row => row.cells[2]),
  }));
  const inkWithdrawalYears = [...new Set((inkData?.withdrawals || []).map(row => Number(row.year)).filter(Number.isFinite))].sort((a, b) => a - b);
  const inkIssuesByYear = inkWithdrawalYears.map(year => ({
    year,
    quantity: sum((inkData?.withdrawals || []).filter(row => Number(row.year) === year), row => row.cells[3]),
  }));
  const inkBalances = (inkData?.balances || []).map(row => ({
    id: row.productId || row.editKey,
    name: row.cells[1],
    quantity: Number(row.cells[2] || 0),
    unitPrice: Number(row.cells[3] || 0),
    value: Number(row.cells[4] || 0),
  }));
  const inkLowStock = inkBalances.filter(item => item.quantity <= 10).sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name, 'th'));
  const inkRoundCounters = new Map();
  const inkRounds = inkGroups.map(group => {
    const year = Number(group.year);
    const sequence = (inkRoundCounters.get(year) || 0) + 1;
    inkRoundCounters.set(year, sequence);
    return {
      label: `${year}/${sequence}`,
      title: group.title,
      year,
      value: Number(group.total || 0),
      quantity: sum(group.rows, row => row.cells[2]),
    };
  });
  const inkFiscalGroups = inkGroups.filter(group => Number(group.year) === Number(fiscalYear));
  const inkFiscalWithdrawals = (inkData?.withdrawals || []).filter(row => Number(row.year) === Number(fiscalYear));
  const inkCalendarYear = currentCalendarYear(today);
  const inkMonthlyIssues = Array.from({ length: 12 }, (_, month) => ({ key: `${inkCalendarYear}-${String(month + 1).padStart(2, '0')}`, year: inkCalendarYear, month, issued: 0 }));
  const inkMonthlyIssuesByKey = new Map(inkMonthlyIssues.map(month => [month.key, month]));
  (inkData?.withdrawals || []).forEach(row => {
    const month = inkMonthlyIssuesByKey.get(String(row.dateISO || '').slice(0, 7));
    if (month) month.issued += Number(row.cells[3] || 0);
  });
  const inkDepartmentTotals = new Map();
  inkFiscalWithdrawals.forEach(row => {
    const department = String(row.cells[1] || '').trim() || 'ไม่ระบุฝ่าย';
    inkDepartmentTotals.set(department, (inkDepartmentTotals.get(department) || 0) + Number(row.cells[3] || 0));
  });
  const inkOutOfStock = inkBalances.filter(item => item.quantity <= 0);
  const inkOneLeft = inkBalances.filter(item => item.quantity === 1);
  return {
    fiscalYear: Number(fiscalYear),
    materials: {
      registered: periods.length,
      inStock: periods.filter(item => item.closingBalance > 0).length,
      lowStock,
      emptyStock,
      stockUnits: sum(periods, item => item.closingBalance),
      stockValue: roundMoney(sum(periods, item => item.closingBalance * item.latestPrice)),
      received: sum(periods, item => item.receivedBeforeSystem + item.receivedInSystem + item.adjustmentIn),
      issued: sum(periods, item => item.issuedBeforeSystem + item.issuedInSystem + item.adjustmentOut),
      categoryStats,
      movementCount: data.movements.filter(item => item.fiscalYear === Number(fiscalYear)).length,
      monthlyFlow,
      monthlyActivity: monthlyFlow.some(item => item.received > 0 || item.issued > 0),
    },
    ink: {
      models: inkBalances.length,
      purchaseQuantity: sum(inkGroups.flatMap(group => group.rows), row => row.cells[2]),
      purchaseValue: roundMoney(sum(inkGroups, group => group.total)),
      withdrawalQuantity: sum(inkData?.withdrawals || [], row => row.cells[3]),
      stockQuantity: sum(inkBalances, item => item.quantity),
      stockValue: roundMoney(sum(inkBalances, item => item.value)),
      lowStock: inkLowStock,
      rounds: inkRounds,
      fiscalRounds: inkRounds.filter(item => item.year === Number(fiscalYear)),
      fiscalPurchaseQuantity: sum(inkFiscalGroups.flatMap(group => group.rows), row => row.cells[2]),
      fiscalPurchaseValue: roundMoney(sum(inkFiscalGroups, group => group.total)),
      fiscalWithdrawalQuantity: sum(inkFiscalWithdrawals, row => row.cells[3]),
      fiscalWithdrawalCount: inkFiscalWithdrawals.length,
      calendarYear: inkCalendarYear,
      monthlyIssues: inkMonthlyIssues,
      issuesByDepartment: [...inkDepartmentTotals].map(([department, quantity]) => ({ department, quantity })).sort((a, b) => b.quantity - a.quantity || a.department.localeCompare(b.department, 'th')),
      outOfStock: inkOutOfStock,
      oneLeft: inkOneLeft,
      purchasesByYear: inkPurchasesByYear,
      issuesByYear: inkIssuesByYear,
      balances: inkBalances.sort((a, b) => b.quantity - a.quantity),
    },
  };
}

const formatNumber = (value, lang = 'th', digits = 0) => new Intl.NumberFormat(lang === 'th' ? 'th-TH' : 'en-US', { maximumFractionDigits: digits }).format(Number(value || 0));
const formatMoney = (value, lang = 'th') => new Intl.NumberFormat(lang === 'th' ? 'th-TH' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
const shortLabel = (value, length = 11) => String(value).length > length ? `${String(value).slice(0, length - 1)}…` : String(value);
const shortInkName = value => String(value || '').replace(/^หมึก\s+/i, '').replace(/^TONER\s+/i, '').replace(/\bORIGINAL\s+/i, '').trim();
const fiscalMonthLabel = (item, lang) => {
  const month = new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(item.year, item.month, 1)));
  const year = lang === 'th' ? String(item.year + 543).slice(-2) : String(item.year).slice(-2);
  return `${month} ${year}`;
};

function lineChart(labels, series, ariaLabel, lang, showAllLabels = false) {
  const width = 680, height = 238, left = 54, right = 22, top = 20, bottom = 46;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const values = series.flatMap(item => item.values).map(Number);
  const maxValue = Math.max(1, ...values);
  const max = maxValue * 1.12;
  const x = index => left + (labels.length <= 1 ? chartWidth / 2 : index * chartWidth / (labels.length - 1));
  const y = value => top + chartHeight - (Number(value) / max) * chartHeight;
  const grid = [0, .25, .5, .75, 1].map(ratio => {
    const yy = top + chartHeight * (1 - ratio);
    return `<line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}" class="chart-grid-line"/><text x="${left - 10}" y="${yy + 4}" text-anchor="end" class="chart-axis-label">${escapeHtml(formatNumber(max * ratio, lang))}</text>`;
  }).join('');
  const paths = series.map(item => {
    const points = item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><g>${item.values.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4" fill="var(--surface)" stroke="${item.color}" stroke-width="3"><title>${escapeHtml(item.name)}: ${escapeHtml(formatNumber(value, lang))}</title></circle>`).join('')}</g>`;
  }).join('');
  const axis = labels.map((label, index) => !showAllLabels && labels.length > 8 && index % 2 === 1 ? '' : `<text x="${x(index)}" y="${height - 18}" text-anchor="middle" class="chart-axis-label">${escapeHtml(shortLabel(label))}</text>`).join('');
  return `<div class="chart-canvas chart-line"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}">${grid}${paths}${axis}</svg></div><div class="chart-legend">${series.map(item => `<span><i style="--legend-color:${item.color}"></i>${escapeHtml(item.name)}</span>`).join('')}</div>`;
}

function verticalBarChart(labels, series, ariaLabel, lang, valueFormatter = value => formatNumber(value, lang)) {
  const width = 620, height = 248, left = 54, right = 20, top = 30, bottom = 52;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const values = series.flatMap(item => item.values).map(Number);
  const maxValue = Math.max(1, ...values);
  const roughStep = maxValue / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = maxValue <= 4 ? 1 : Math.ceil(roughStep / magnitude) * magnitude;
  const max = step * 4;
  const groupWidth = chartWidth / Math.max(1, labels.length);
  const groupBarWidth = Math.min(112, groupWidth * .54);
  const barWidth = groupBarWidth / Math.max(1, series.length);
  const y = value => top + chartHeight - (Number(value) / max) * chartHeight;
  const grid = [0, .25, .5, .75, 1].map(ratio => {
    const yy = top + chartHeight * (1 - ratio);
    return `<line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}" class="chart-grid-line"/><text x="${left - 9}" y="${yy + 4}" text-anchor="end" class="chart-axis-label">${escapeHtml(formatNumber(max * ratio, lang))}</text>`;
  }).join('');
  const bars = series.map((item, seriesIndex) => item.values.map((value, index) => {
    if (Number(value) <= 0) return '';
    const barHeight = Math.max(1, chartHeight - (y(value) - top));
    const groupStart = left + index * groupWidth + (groupWidth - groupBarWidth) / 2;
    const xx = groupStart + seriesIndex * barWidth;
    const markWidth = Math.max(6, barWidth - 8);
    const label = Number(value) > 0 ? `<text x="${xx + markWidth / 2}" y="${Math.max(14, y(value) - 7)}" text-anchor="middle" class="chart-value-label">${escapeHtml(valueFormatter(value))}</text>` : '';
    return `<rect x="${xx}" y="${top + chartHeight - barHeight}" width="${markWidth}" height="${barHeight}" rx="3" fill="${item.color}"><title>${escapeHtml(labels[index])} — ${escapeHtml(item.name)}: ${escapeHtml(valueFormatter(value))}</title></rect>${label}`;
  }).join('')).join('');
  const axis = labels.map((label, index) => `<text x="${left + index * groupWidth + groupWidth / 2}" y="${height - 18}" text-anchor="middle" class="chart-axis-label"><title>${escapeHtml(label)}</title>${escapeHtml(shortLabel(label, 16))}</text>`).join('');
  return `<div class="chart-canvas chart-bars"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}">${grid}${bars}${axis}</svg></div><div class="chart-legend">${series.map(item => `<span><i style="--legend-color:${item.color}"></i>${escapeHtml(item.name)}</span>`).join('')}</div>`;
}

function donutChart(items, lang, centerLabel, legendValueFormatter = (item, total) => `${total ? formatNumber(item.value / total * 100, lang, 1) : 0}%`, colors = ['#075b45', '#0f8b6d', '#e4aa3a', '#256f8f', '#8f6b4d', '#6b7280', '#9f3c4a']) {
  const total = sum(items, item => item.value);
  let cursor = 0;
  const slices = items.map((item, index) => {
    const start = cursor;
    cursor += total ? item.value / total * 100 : 0;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  return `<div class="donut-layout"><div class="donut-chart" style="background:conic-gradient(${slices.join(',') || 'var(--line) 0 100%'})"><span><strong>${formatNumber(total, lang)}</strong><small>${escapeHtml(centerLabel)}</small></span></div><div class="donut-legend">${items.map((item, index) => `<div><i style="--legend-color:${colors[index % colors.length]}"></i><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(legendValueFormatter(item, total))}</strong></div>`).join('')}</div></div>`;
}

function horizontalBars(items, lang, valueFormatter = value => formatNumber(value, lang)) {
  const max = Math.max(1, ...items.map(item => Number(item.value || 0)));
  return `<div class="horizontal-bars">${items.map(item => `<div class="bar-row ${escapeHtml(item.tone || '')}"><div><span title="${escapeHtml(item.fullLabel || item.label)}">${escapeHtml(shortLabel(item.label, 28))}</span><strong>${escapeHtml(valueFormatter(item.value))}</strong></div><div class="bar-track"><i style="width:${Number(item.value || 0) <= 0 ? 0 : Math.max(2, Number(item.value) / max * 100)}%"></i></div></div>`).join('')}</div>`;
}

function kpiCard(label, value, note, icon, tone = '') {
  return `<article class="dashboard-kpi ${tone}"><div class="dashboard-kpi-head"><span>${escapeHtml(label)}</span>${icon ? `<i aria-hidden="true">${icon}</i>` : ''}</div><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function materialDashboard(model, lang) {
  const m = model.materials;
  const name = item => lang === 'th' ? item.nameTh : item.nameEn;
  const monthLabels = m.monthlyFlow.map(item => fiscalMonthLabel(item, lang));
  const monthlyTrend = m.monthlyActivity
    ? lineChart(monthLabels, [
      { name: lang === 'th' ? 'รับและปรับเพิ่ม' : 'Received and adjusted in', values: m.monthlyFlow.map(item => item.received), color: '#08765a' },
      { name: lang === 'th' ? 'จ่ายและปรับลด' : 'Issued and adjusted out', values: m.monthlyFlow.map(item => item.issued), color: '#d04752' },
    ], lang === 'th' ? 'กราฟแนวโน้มการรับและจ่ายวัสดุรายเดือน' : 'Monthly material receipt and issue trend', lang)
    : `<div class="dashboard-empty dashboard-trend-empty"><strong>${lang === 'th' ? 'ยังไม่มีรายการรับหรือจ่ายรายเดือน' : 'No monthly receipts or issues yet'}</strong><span>${lang === 'th' ? 'กราฟจะแสดงอัตโนมัติเมื่อเริ่มบันทึกรายการ' : 'The trend will appear automatically after transactions are recorded'}</span><div>${monthLabels.filter((_, index) => index % 2 === 0).map(label => `<i>${escapeHtml(label)}</i>`).join('')}</div></div>`;
  const stockStates = [
    { label: lang === 'th' ? 'พร้อมใช้งาน' : 'Available', value: Math.max(0, m.registered - m.lowStock.length) },
    { label: lang === 'th' ? 'ใกล้หมด' : 'Low stock', value: Math.max(0, m.lowStock.length - m.emptyStock) },
    { label: lang === 'th' ? 'หมด' : 'Out of stock', value: m.emptyStock },
  ];
  return `<div class="dashboard-kpis">
    ${kpiCard(lang === 'th' ? 'มูลค่าคงคลัง' : 'Inventory value', `${formatMoney(m.stockValue, lang)} ฿`, lang === 'th' ? `ปีงบประมาณ ${model.fiscalYear}` : `Fiscal year ${model.fiscalYear}`, '฿')}
    ${kpiCard(lang === 'th' ? 'วัสดุในทะเบียน' : 'Registered materials', formatNumber(m.registered, lang), lang === 'th' ? `${formatNumber(m.inStock, lang)} รายการมีคงเหลือ` : `${formatNumber(m.inStock, lang)} items in stock`, '▦')}
    ${kpiCard(lang === 'th' ? 'วัสดุใกล้หมด' : 'Low stock', formatNumber(m.lowStock.length, lang), lang === 'th' ? `${formatNumber(m.emptyStock, lang)} รายการหมด` : `${formatNumber(m.emptyStock, lang)} out of stock`, '!', m.lowStock.length ? 'warning' : '')}
    ${kpiCard(lang === 'th' ? 'คงเหลือรวม' : 'Total on hand', formatNumber(m.stockUnits, lang), lang === 'th' ? `${formatNumber(m.movementCount, lang)} รายการเคลื่อนไหว` : `${formatNumber(m.movementCount, lang)} movements`, '↕')}
  </div>
  <div class="dashboard-grid">
    <article class="dashboard-panel dashboard-chart-panel"><header><div><p>${lang === 'th' ? 'แนวโน้มตามปีงบประมาณ' : 'Fiscal-year trend'}</p><h2>${lang === 'th' ? 'การรับและจ่ายวัสดุรายเดือน' : 'Monthly material receipts and issues'}</h2></div><span>${lang === 'th' ? 'หน่วย' : 'Units'}</span></header>${monthlyTrend}</article>
    <article class="dashboard-panel dashboard-chart-panel"><header><div><p>${lang === 'th' ? 'คงคลังตามประเภท' : 'Inventory by category'}</p><h2>${lang === 'th' ? 'จำนวนคงเหลือแต่ละประเภท' : 'On-hand quantity by category'}</h2></div><span>${lang === 'th' ? 'หน่วย' : 'Units'}</span></header>${horizontalBars(m.categoryStats.slice().sort((a, b) => b.onHand - a.onHand).map(item => ({ label: name(item), value: item.onHand })), lang)}</article>
    <article class="dashboard-panel"><header><div><p>${lang === 'th' ? 'สุขภาพคงคลัง' : 'Stock health'}</p><h2>${lang === 'th' ? 'สถานะรายการวัสดุ' : 'Material status'}</h2></div></header>${donutChart(stockStates, lang, lang === 'th' ? 'รายการ' : 'items')}</article>
    <article class="dashboard-panel"><header><div><p>${lang === 'th' ? 'สัดส่วนมูลค่า' : 'Value distribution'}</p><h2>${lang === 'th' ? 'มูลค่าคงคลังตามประเภท' : 'Inventory value by category'}</h2></div></header>${donutChart(m.categoryStats.map(item => ({ label: name(item), value: item.value })), lang, lang === 'th' ? 'บาท' : 'THB')}</article>
    <article class="dashboard-panel"><header><div><p>${lang === 'th' ? 'ต้องติดตาม' : 'Needs attention'}</p><h2>${lang === 'th' ? 'รายการคงเหลือน้อยที่สุด' : 'Lowest-stock materials'}</h2></div><button class="text-button" data-go="materials">${lang === 'th' ? 'ดูทะเบียน' : 'Open registry'} →</button></header>${m.lowStock.length ? horizontalBars(m.lowStock.slice(0, 6).map(item => ({ label: item.materialName, value: item.closingBalance })), lang) : `<div class="dashboard-empty">${lang === 'th' ? 'ไม่มีรายการใกล้หมด' : 'No low-stock items'}</div>`}</article>
    <article class="dashboard-panel"><header><div><p>${lang === 'th' ? 'ภาพรวมปริมาณ' : 'Quantity overview'}</p><h2>${lang === 'th' ? 'ยอดสะสมปีงบประมาณ' : 'Fiscal-year totals'}</h2></div></header><div class="metric-list"><div><span>${lang === 'th' ? 'รับสะสม' : 'Received'}</span><strong class="positive">+${formatNumber(m.received, lang)}</strong></div><div><span>${lang === 'th' ? 'จ่ายสะสม' : 'Issued'}</span><strong class="negative">−${formatNumber(m.issued, lang)}</strong></div><div><span>${lang === 'th' ? 'คงเหลือรวม' : 'On hand'}</span><strong>${formatNumber(m.stockUnits, lang)}</strong></div><div><span>${lang === 'th' ? 'รายการเคลื่อนไหว' : 'Movements'}</span><strong>${formatNumber(m.movementCount, lang)}</strong></div></div></article>
  </div>`;
}

function inkChartPanel(title, context, content, extraClass = '') {
  return `<article class="dashboard-panel ink-chart-panel ${extraClass}"><header><div><h2>${escapeHtml(title)}</h2><p class="ink-chart-context">${escapeHtml(context)}</p></div></header>${content}</article>`;
}

function inkDashboard(model, lang) {
  const ink = model.ink;
  const th = lang === 'th';
  const fiscal = th ? `ปีงบประมาณ ${model.fiscalYear}` : `Fiscal year ${model.fiscalYear}`;
  const emptyPurchase = `<div class="dashboard-empty">${th ? 'ยังไม่มีรายการซื้อในปีงบประมาณนี้' : 'No purchases in this fiscal year'}</div>`;
  const emptyIssue = `<div class="dashboard-empty">${th ? 'ยังไม่มีรายการเบิกในปีงบประมาณนี้' : 'No issues in this fiscal year'}</div>`;
  const rounds = ink.fiscalRounds.map(item => ({ label: `${th ? 'รอบ' : 'Round'} ${item.label.split('/')[1]}`, value: item.value, quantity: item.quantity }));
  const purchaseValue = rounds.length
    ? horizontalBars(rounds, lang, value => `${formatNumber(value, lang)} ${th ? 'บาท' : 'THB'}`)
    : emptyPurchase;
  const purchaseQuantity = rounds.length
    ? horizontalBars(rounds.map(item => ({ label: item.label, value: item.quantity })), lang, value => `${formatNumber(value, lang)} ${th ? 'หน่วย' : 'units'}`)
    : emptyPurchase;
  const monthLabels = ink.monthlyIssues.map(item => new Intl.DateTimeFormat(th ? 'th-TH' : 'en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(item.year, item.month, 1))));
  const monthlyIssues = lineChart(monthLabels, [{ name: th ? 'จำนวนเบิก' : 'Issued', values: ink.monthlyIssues.map(item => item.issued), color: 'var(--button-primary)' }], th ? 'แนวโน้มจำนวนหมึกที่เบิกตั้งแต่มกราคมถึงธันวาคม' : 'Monthly ink issues from January to December', lang, true);
  const departmentIssues = ink.issuesByDepartment.length
    ? horizontalBars(ink.issuesByDepartment.map(item => ({ label: item.department, value: item.quantity })), lang, value => `${formatNumber(value, lang)} ${th ? 'หน่วย' : 'units'}`)
    : emptyIssue;
  const stockBands = [
    { label: th ? 'หมดแล้ว' : 'Out of stock', value: ink.outOfStock.length },
    { label: th ? 'เหลือ 1 หน่วย' : '1 unit left', value: ink.oneLeft.length },
    { label: th ? 'เหลือ 2 หน่วย' : '2 units left', value: ink.balances.filter(item => item.quantity === 2).length },
    { label: th ? 'เหลือ 3 หน่วยขึ้นไป' : '3+ units left', value: ink.balances.filter(item => item.quantity >= 3).length },
  ];
  const stockDistribution = ink.models
    ? donutChart(stockBands, lang, th ? 'รุ่น' : 'models', item => `${formatNumber(item.value, lang)} ${th ? 'รุ่น' : 'models'}`, ['var(--danger)', 'var(--warning)', '#0f8b6d', 'var(--button-primary)'])
    : `<div class="dashboard-empty">${th ? 'ยังไม่มีข้อมูลหมึกคงเหลือ' : 'No current ink stock data'}</div>`;
  const lowestStock = ink.balances.slice().sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name, 'th')).slice(0, 6);
  const lowStockChart = lowestStock.length
    ? horizontalBars(lowestStock.map(item => ({ label: shortInkName(item.name), fullLabel: item.name, value: item.quantity, tone: item.quantity <= 0 ? 'danger' : item.quantity === 1 ? 'caution' : '' })), lang, value => `${formatNumber(value, lang)} ${th ? 'หน่วย' : 'units'}`)
    : `<div class="dashboard-empty">${th ? 'ยังไม่มีข้อมูลคงเหลือ' : 'No stock data'}</div>`;
  const highValue = ink.balances.filter(item => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);
  const stockValueChart = highValue.length
    ? horizontalBars(highValue.map(item => ({ label: shortInkName(item.name), fullLabel: item.name, value: item.value })), lang, value => `${formatNumber(value, lang)} ${th ? 'บาท' : 'THB'}`)
    : `<div class="dashboard-empty">${th ? 'ยังไม่มีมูลค่าคงเหลือ' : 'No inventory value data'}</div>`;
  const purchaseYears = ink.purchasesByYear.filter(item => item.value > 0);
  const purchaseYearsChart = purchaseYears.length
    ? donutChart(purchaseYears.map(item => ({ label: `${th ? 'ปีงบฯ' : 'FY'} ${item.year}`, value: item.value })), lang, th ? 'บาท' : 'THB')
    : emptyPurchase;
  const comparisonYears = [...new Set([
    ...ink.purchasesByYear.map(item => item.year),
    ...ink.issuesByYear.map(item => item.year),
  ])].sort((a, b) => a - b);
  const purchasesByYear = new Map(ink.purchasesByYear.map(item => [item.year, item.quantity]));
  const issuesByYear = new Map(ink.issuesByYear.map(item => [item.year, item.quantity]));
  const yearlyQuantityChart = comparisonYears.length
    ? verticalBarChart(
      comparisonYears.map(year => `${th ? 'ปีงบฯ' : 'FY'} ${year}`),
      [
        { name: th ? 'จำนวนซื้อ' : 'Purchased', values: comparisonYears.map(year => purchasesByYear.get(year) || 0), color: 'var(--button-primary)' },
        { name: th ? 'จำนวนเบิก' : 'Issued', values: comparisonYears.map(year => issuesByYear.get(year) || 0), color: 'var(--warning)' },
      ],
      th ? 'กราฟแท่งเปรียบเทียบจำนวนซื้อและเบิกหมึกตามปีงบประมาณ' : 'Grouped bar chart comparing ink purchases and issues by fiscal year',
      lang,
      value => formatNumber(value, lang),
    )
    : `<div class="dashboard-empty">${th ? 'ยังไม่มีข้อมูลซื้อหรือเบิกหมึก' : 'No ink purchase or issue data'}</div>`;
  return `<div class="ink-report"><div class="dashboard-grid ink-report-grid">
    ${inkChartPanel(th ? 'แนวโน้มการเบิกหมึกรายเดือน' : 'Monthly ink issue trend', th ? `ปีปฏิทิน ${ink.calendarYear + 543} แสดงมกราคมถึงธันวาคม (หน่วย)` : `Calendar year ${ink.calendarYear}, January to December (units)`, monthlyIssues, 'dashboard-wide ink-monthly-panel')}
    ${inkChartPanel(th ? 'จำนวนซื้อและเบิกตามปีงบประมาณ' : 'Purchases and issues by fiscal year', th ? 'เปรียบเทียบจำนวนหน่วยของทุกปีที่มีข้อมูล' : 'Unit comparison across all recorded fiscal years', yearlyQuantityChart, 'ink-years-panel ink-year-bars-panel')}
    ${inkChartPanel(th ? 'ยอดซื้อหมึกแต่ละรอบ' : 'Purchase value by round', `${fiscal} — ${th ? 'บาท' : 'THB'}`, purchaseValue, 'ink-round-panel')}
    ${inkChartPanel(th ? 'จำนวนหมึกที่ซื้อแต่ละรอบ' : 'Quantity purchased by round', `${fiscal} — ${th ? 'หน่วย' : 'units'}`, purchaseQuantity, 'ink-round-panel')}
    ${inkChartPanel(th ? 'ฝ่ายที่เบิกหมึก' : 'Issues by department', `${fiscal} — ${th ? 'จำนวนหน่วยที่เบิก' : 'Units issued'}`, departmentIssues, 'ink-department-panel')}
    ${inkChartPanel(th ? 'รุ่นหมึกตามยอดคงเหลือ' : 'Ink models by stock level', th ? 'ยอดปัจจุบัน แสดงเป็นจำนวนรุ่น' : 'Current stock shown as number of models', stockDistribution, 'ink-distribution-panel')}
    ${inkChartPanel(th ? 'สัดส่วนยอดซื้อตามปีงบประมาณ' : 'Purchase value share by fiscal year', th ? 'ทุกปีที่มีข้อมูล แสดงเป็นบาท' : 'All recorded fiscal years in THB', purchaseYearsChart, 'ink-years-panel ink-purchase-years-panel')}
    ${inkChartPanel(th ? 'รุ่นหมึกที่เหลือน้อยที่สุด' : 'Lowest-stock ink models', th ? 'ยอดปัจจุบัน แสดงเป็นหน่วยต่อรุ่น' : 'Current stock in units per model', lowStockChart, 'ink-ranked-panel')}
    ${inkChartPanel(th ? 'รุ่นหมึกที่มีมูลค่าคงเหลือสูงสุด' : 'Highest-value ink models', th ? 'ยอดปัจจุบัน แสดงเป็นบาทต่อรุ่น' : 'Current stock value in THB per model', stockValueChart, 'ink-ranked-panel')}
  </div><p class="ink-report-note">${th ? 'กราฟแนวโน้มรายเดือนอิงปีปฏิทินปัจจุบันโดยอัตโนมัติ เดือนที่ยังไม่มีรายการแสดงเป็นศูนย์ กราฟตามรอบหรือฝ่ายอิงปีงบประมาณที่เลือก กราฟคงเหลือใช้ยอดปัจจุบัน' : 'The monthly trend follows the current calendar year automatically. Months without transactions show zero. Round and department charts use the selected fiscal year; stock charts use current balances.'}</p></div>`;
}

export function dashboardMarkup(model, tab = 'materials', lang = 'th') {
  if (tab === 'ink') return inkDashboard(model, lang);
  const intro = [lang === 'th' ? 'ภาพรวมวัสดุ' : 'Material overview', lang === 'th' ? `สถานะการดำเนินงานปีงบประมาณ ${model.fiscalYear}` : `Operating status for fiscal year ${model.fiscalYear}`];
  return `<div class="dashboard-intro"><div><p>${escapeHtml(intro[0])}</p><h2>${escapeHtml(intro[1])}</h2></div><span class="dashboard-live"><i></i>${lang === 'th' ? 'ข้อมูลปัจจุบัน' : 'Current data'}</span></div>${materialDashboard(model, lang)}`;
}
