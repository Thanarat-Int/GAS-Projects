import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMaterialStore, loadMaterialSeed } from '../local/store.mjs';
import { buildCombinedFiscalReportDocument, buildFiscalReportDocument, buildMonthlyFiscalReportDocument } from '../web/fiscal-report.js';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [categoryId = 'CAT-OFFICE', fiscalYearText = '2569', outputArg = 'tmp/pdfs/fiscal-report-preview.html', month = '', startDayText = '1'] = process.argv.slice(2);
const fiscalYearNumber = Number(fiscalYearText);
const outputPath = path.resolve(projectRoot, outputArg);

const data = createMaterialStore(loadMaterialSeed(path.join(projectRoot, 'SeedData.gs'))).snapshot();
const fiscalYear = data.fiscalYears.find(item => item.year === fiscalYearNumber);

if (!fiscalYear) throw new Error(`Unknown fiscal year: ${fiscalYearText}`);

const rowsForCategory = selectedCategoryId => data.fiscalPeriods
  .filter(item => item.fiscalYear === fiscalYearNumber && !item.deleted)
  .map(item => ({ ...item, material: data.materials.find(material => material.id === item.materialId) }))
  .filter(item => item.material?.categoryId === selectedCategoryId)
  .sort((a, b) => a.materialCode.localeCompare(b.materialCode, 'th'));

const combined = categoryId === 'ALL';
const category = combined ? null : data.categories.find(item => item.id === categoryId);
if (!combined && !category) throw new Error(`Unknown category: ${categoryId}`);
const rows = combined ? [] : rowsForCategory(category.id);
// Monthly previews use a synthetic starting balance so the layout is independent of seed import dates.
const startDay = Number(startDayText);
if (month && (!Number.isInteger(startDay) || startDay < 1 || startDay > 28)) throw new RangeError('Preview start day must be 1 through 28');
const previewMaterials = month ? data.materials.map(item => ({ ...item, createdAt: `${month}-${String(startDay).padStart(2, '0')}T00:00:00+07:00` })) : data.materials;
const previewPeriods = month ? data.fiscalPeriods.map(item => ({ ...item, source: 'IMPORTED_EXCEL', cutoverBalance: 30 })) : data.fiscalPeriods;
const previewMovements = month ? Array.from({ length: 18 }, (_, index) => {
  const material = data.materials.find(item => item.categoryId === (combined ? index % 2 ? 'CAT-MEDICAL' : 'CAT-OFFICE' : categoryId));
  return {
    id: `PREVIEW-${index + 1}`, fiscalYear: fiscalYearNumber, materialId: material.id,
    materialName: material.name, materialCode: material.code,
    type: index % 3 === 0 ? 'RECEIPT' : index % 3 === 1 ? 'ISSUE' : 'ADJUST_OUT',
    change: index % 3 === 0 ? 5 : index % 3 === 1 ? -2 : -1,
    balanceAfter: 30 - index, occurredAt: `${month}-${String(index % 28 + 1).padStart(2, '0')}T03:00:00.000Z`,
    referenceNo: `QA-${String(index + 1).padStart(3, '0')}`, note: 'ตัวอย่างสำหรับตรวจรูปแบบเอกสาร',
  };
}) : [];
const markup = month
  ? buildMonthlyFiscalReportDocument({
      fiscalYear: fiscalYear.year, startDate: fiscalYear.startDate, endDate: fiscalYear.endDate,
      month, categories: data.categories, materials: previewMaterials, fiscalPeriods: previewPeriods,
      movements: previewMovements, categoryId: combined ? '' : category.id, lang: 'th',
    })
  : combined
  ? buildCombinedFiscalReportDocument({
      fiscalYear: fiscalYear.year,
      startDate: fiscalYear.startDate,
      endDate: fiscalYear.endDate,
      categories: [...data.categories]
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
        .map(item => ({ categoryName: item.nameTh, rows: rowsForCategory(item.id) })),
      lang: 'th',
    })
  : buildFiscalReportDocument({
      fiscalYear: fiscalYear.year,
      startDate: fiscalYear.startDate,
      endDate: fiscalYear.endDate,
      categoryName: category.nameTh,
      rows,
      lang: 'th',
    });

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const fontBase = pathToFileURL(path.join(projectRoot, 'web', 'assets', 'fonts') + path.sep).href;
fs.writeFileSync(outputPath, markup.replaceAll('/assets/fonts/', fontBase), 'utf8');

const generatedRows = month ? combined ? previewPeriods.filter(item => item.fiscalYear === fiscalYearNumber && !item.deleted).length : rows.length : combined ? data.fiscalPeriods.filter(item => item.fiscalYear === fiscalYearNumber && !item.deleted).length : rows.length;
console.log(`Generated ${generatedRows} rows: ${outputPath}`);
