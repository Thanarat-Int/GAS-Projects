function doGet() {
    var template = HtmlService.createTemplateFromFile('index');

    // Server-Side Injection for Instant Load
    try {
        var initialData = getData(); // Fetch data immediately (Returns JSON String)
        template.jsonPayload = initialData; // Pass raw JSON string to be printed as Object
    } catch (e) {
        console.error('Initial data fetch failed', e);
        template.jsonPayload = JSON.stringify({ status: 'error', message: e.toString() });
    }

    return template
        .evaluate()
        .setTitle('PWA Analytics')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename)
        .getContent();
}

// Mock functions for future data handling

// Mock functions for future data handling
// Optimized getData with Cache Service and Data Limiting
function getData() {
    try {
        // REAL-TIME MODE: Fetch fresh data from Sheets every time (No Cache)
        Logger.log('Fetching fresh data from Sheets (Real-time mode)');
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var dataSheet = ss.getSheetByName('Data');
        var targetSheet = ss.getSheetByName('Targets');

        var data = [];
        if (dataSheet) {
            // Fetch ALL data (no limit for real-time accuracy)
            var lastRow = dataSheet.getLastRow();

            if (lastRow > 1) {
                data = dataSheet.getRange(2, 1, lastRow - 1, dataSheet.getLastColumn()).getValues();
            }
        }

        var targets = [];
        if (targetSheet) {
            var rangeT = targetSheet.getDataRange();
            if (rangeT.getNumRows() > 1) {
                targets = targetSheet.getRange(2, 1, rangeT.getNumRows() - 1, rangeT.getNumColumns()).getValues();
            }
        }

        // Fetch Users Data (For Consumers Analysis)
        var usersSheet = ss.getSheetByName('Users');
        var usersData = [];
        if (usersSheet) {
            var rangeU = usersSheet.getDataRange();
            if (rangeU.getNumRows() > 1) {
                usersData = usersSheet.getRange(2, 1, rangeU.getNumRows() - 1, rangeU.getNumColumns()).getValues();
            }
        }

        var result = JSON.stringify({
            status: 'success',
            data: data,
            targets: targets,
            users: usersData
        });

        return result;
    } catch (e) {
        return JSON.stringify({ status: 'error', message: e.toString() });
    }
}

function saveData(data) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('Data');

        if (sheet) {
            // Map data to Columns A - L (12 Columns)
            // A: Date, B: Consumers, C: New, D: Prod, E: Dist, F: Free, G: Loss, H: Rev, I: Exp, J: Elec, K: DebtGov, L: DebtPvt
            sheet.appendRow([
                data.date,                // A: วันที่บันทึก
                data.consumers_total,     // B: ผู้ใช้น้ำ
                data.consumers_new,       // C: ผู้ใช้น้ำเพิ่ม
                data.water_produced,      // D: น้ำผลิต
                data.water_distributed,   // E: น้ำจ่าย
                data.water_free,          // F: น้ำจ่ายฟรี
                data.water_loss_pct,      // G: สูญเสีย
                data.revenue_total,       // H: รายได้
                data.expense_total,       // I: รายจ่าย
                data.expense_electric,    // J: ค่าไฟ
                data.debt_gov,            // K: หนี้ค้าง-ราชการ
                data.debt_private         // L: หนี้ค้าง-เอกชน
            ]);
            return JSON.stringify({ success: true, message: 'Saved to columns A-L' });
        } else {
            return JSON.stringify({ success: false, message: 'Sheet "Data" not found' });
        }
    } catch (e) {
        return JSON.stringify({ success: false, message: e.toString() });
    }
}

function saveTarget(data) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('Targets');

        if (sheet) {
            var allData = sheet.getDataRange().getValues(); // Get all data
            var yearCol = 0; // Fiscal Year is Column A (Index 0)
            var rowIndex = -1;

            // Check if Fiscal Year already exists (Skip header row 0)
            for (var i = 1; i < allData.length; i++) {
                if (String(allData[i][yearCol]) === String(data.fiscal_year)) {
                    rowIndex = i + 1; // 1-based index
                    break;
                }
            }

            if (rowIndex > 0) {
                // UPDATE
                // Col A(1): Year, B(2): Rev, C(3): EBITDA, D(4): Consumers, E(5): Loss%
                // Current order in sheet based on previous appendRow: [Year, EBITDA, Cons, Loss, Rev] ??
                // WAIT! Let's check the previous appendRow structure:
                // data.fiscal_year, data.target_ebitda, data.target_new_consumers, data.target_loss_pct, data.target_revenue
                // So Col B=EBITDA, C=Cons, D=Loss, E=Revenue. 
                // Let's standardise this to match the dashboard logic or keep it?
                // Dashboard logic reads: tRow[1] = Revenue?
                // Let's check js.html line 2104: "if (tRow) monthlyTarget = (parseVal(tRow[1]) / 12);"
                // This means dashboard expects Col B to be REVENUE.
                // BUT previous saveTarget saved EBITDA to Col B!
                // FIX: Let's Re-align the columns to: [Year, Revenue, EBITDA, Consumers, Loss%]
                // Year=A, Rev=B, EBITDA=C, Cons=D, Loss=E

                sheet.getRange(rowIndex, 1, 1, 5).setValues([[
                    data.fiscal_year,
                    data.target_revenue,
                    data.target_ebitda,
                    data.target_new_consumers,
                    data.target_loss_pct
                ]]);
                SpreadsheetApp.flush(); // Force write
                return JSON.stringify({ success: true, message: 'อัปเดตเป้าหมายเรียบร้อย (Target Updated)' });
            } else {
                // INSERT
                sheet.appendRow([
                    data.fiscal_year,
                    data.target_revenue,
                    data.target_ebitda,
                    data.target_new_consumers,
                    data.target_loss_pct
                ]);
                SpreadsheetApp.flush(); // Force write
                return JSON.stringify({ success: true, message: 'บันทึกเป้าหมายใหม่เรียบร้อย (Target Saved)' });
            }
        } else {
            return JSON.stringify({ success: false, message: 'Sheet "Targets" not found' });
        }
    } catch (e) {
        return JSON.stringify({ success: false, message: e.toString() });
    }
}

function deleteTarget(year) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('Targets');
        if (sheet) {
            var data = sheet.getDataRange().getValues();
            for (var i = 1; i < data.length; i++) {
                if (String(data[i][0]) === String(year)) {
                    sheet.deleteRow(i + 1);
                    SpreadsheetApp.flush(); // Force write
                    return JSON.stringify({ success: true, message: 'ลบเป้าหมายปี ' + year + ' เรียบร้อย' });
                }
            }
            return JSON.stringify({ success: false, message: 'Target not found' });
        } else {
            return JSON.stringify({ success: false, message: 'Sheet not found' });
        }
    } catch (e) {
        return JSON.stringify({ success: false, message: e.toString() });
    }
}

function deleteData(index) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('Data');
        if (sheet) {
            sheet.deleteRow(index + 2);
            return JSON.stringify({ success: true, message: 'Deleted row ' + (index + 2) });
        } else {
            return JSON.stringify({ success: false, message: 'Sheet not found' });
        }
    } catch (e) {
        return JSON.stringify({ success: false, message: e.toString() });
    }
}

function updateData(payload) {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('Data');
        if (sheet) {
            var index = payload.index;
            var data = payload.data;
            var row = index + 2;

            var rowData = [
                data.date,
                data.consumers_total,
                data.consumers_new,
                data.water_produced,
                data.water_distributed,
                data.water_free,
                data.water_loss_pct,
                data.revenue_total,
                data.expense_total,
                data.expense_electric,
                data.debt_gov,
                data.debt_private
            ];

            sheet.getRange(row, 1, 1, 12).setValues([rowData]);
            return JSON.stringify({ success: true, message: 'Updated row ' + row });
        } else {
            return JSON.stringify({ success: false, message: 'Sheet not found' });
        }
    } catch (e) {
        return JSON.stringify({ success: false, message: e.toString() });
    }
}

// Reset ALL Data
function resetAllData() {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName('Data');
        if (!sheet) return JSON.stringify({ status: 'error', message: 'Sheet not found' });

        var lastRow = sheet.getLastRow();
        if (lastRow > 1) {
            // Delete all rows from 2 to end
            sheet.deleteRows(2, lastRow - 1);
        }

        return JSON.stringify({ status: 'success' });
    } catch (e) {
        return JSON.stringify({ status: 'error', message: e.toString() });
    }
}
