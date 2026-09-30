import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMaterialStore, loadMaterialSeed } from '../local/store.mjs';
import { buildCombinedFiscalReportDocument, buildFiscalReportDocument } from '../web/fiscal-report.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = createMaterialStore(loadMaterialSeed(path.join(root, 'SeedData.gs'))).snapshot();
const year = data.fiscalYears.find(item => item.year === 2569);
const category = data.categories.find(item => item.id === 'CAT-OFFICE');
const periods = data.fiscalPeriods
  .filter(item => item.fiscalYear === year.year && !item.deleted)
  .map(item => ({ ...item, material: data.materials.find(material => material.id === item.materialId) }));
const categoryRows = categoryId => periods
  .filter(item => item.material?.categoryId === categoryId)
  .sort((a, b) => a.materialCode.localeCompare(b.materialCode, 'th'));

const common = { fiscalYear: year.year, startDate: year.startDate, endDate: year.endDate };
const markup = process.argv.includes('--combined')
  ? buildCombinedFiscalReportDocument({ ...common, categories: data.categories.map(item => ({ categoryName: item.nameTh, rows: categoryRows(item.id) })) })
  : buildFiscalReportDocument({ ...common, categoryName: category.nameTh, rows: categoryRows(category.id) });
const output = path.resolve(process.argv[2] || path.join(root, 'web', '__qa_fiscal_report.html'));
fs.writeFileSync(output, markup);
console.log(output);
