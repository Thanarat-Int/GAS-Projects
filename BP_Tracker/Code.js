function doGet() {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('BP Tracker - Smart Health')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename)
      .getContent();
}

/**
 * RUN THIS FUNCTION ONCE TO AUTHORIZE ALL SCOPES
 * กดรันฟังก์ชันนี้หนึ่งครั้งใน Editor เพื่อขอสิทธิ์ (Authorize) ให้ครบ
 */
function forceAuthorize() {
  Drive.Files.list(); // Forces Drive Scope
  SpreadsheetApp.getActiveSpreadsheet(); // Forces Spreadsheet Scope
  
  // Forces Document Scope (Needed for OCR)
  const doc = DocumentApp.create('TempForAuth');
  Drive.Files.remove(doc.getId());
  
  Logger.log("Authorization Successful. You can now use the Web App.");
}

/**
 * OCR Processing using Drive API.
 */
function processImage(base64Data) {
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg', 'ocr-temp.jpg');
    
    // Check Drive API
    if (typeof Drive === 'undefined') {
       throw new Error("Drive API Service is not enabled using the + button in Apps Script.");
    }

    // Insert for OCR
    var resource = { title: blob.getName(), mimeType: blob.getContentType() };
    var file = Drive.Files.insert(resource, blob, {ocr: true});
    var docId = file.id;
    
    // Get Text
    var doc = DocumentApp.openById(docId);
    var text = doc.getBody().getText();
    
    // Cleanup
    Drive.Files.remove(docId);

    // Extract
    var extractedData = extractBPData(text);
    
    // Analyze Health
    var advice = getHealthAdvice(extractedData.sys, extractedData.dia);

    return {
      success: true,
      data: {
        systolic: extractedData.sys,
        diastolic: extractedData.dia,
        pulse: extractedData.pul,
        rawText: text, // Debug
        advice: advice
      }
    };

  } catch (e) {
    Logger.log("processImage Error: " + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Advanced Parsing Logic to handle various BP Monitor layouts
 */
function extractBPData(text) {
  // 1. Aggressive Cleanup & Character Mapping
  var cleanText = text.toUpperCase()
    // Remove likely noise characters first
    .replace(/['"\.,:;\-\|\(\)\[\]\{\}\\\/]/g, '') 
    
    // Fix: Trailing '1', 'I', 'l' from vertical bars near numbers (e.g. 133| -> 1331)
    // We replace specific patterns like "82I" -> "82" before global digit-only cleanup
    .replace(/(\d{2,3})[I1l]/g, '$1') 

    // Map confusing 7-segment letters to numbers
    .replace(/B/g, '8')
    .replace(/D/g, '0')
    .replace(/O/g, '0')
    .replace(/Q/g, '0')
    .replace(/S/g, '5')
    .replace(/Z/g, '2')
    .replace(/A/g, '4') 
    .replace(/G/g, '6') 
    .replace(/E/g, '8')
    .replace(/T/g, '7') 
    .replace(/[^\d\s]/g, ' ');

  // 2. Extract potential numbers
  var numbers = cleanText.match(/\d+/g);
  if (!numbers) return { sys: 0, dia: 0, pul: 0 };
  
  // 3. Filter candidates: 30 - 300
  var candidates = numbers.map(Number).filter(n => n >= 30 && n <= 300);
  
  if (candidates.length === 0) return { sys: 0, dia: 0, pul: 0 };
  
  // 4. Physiological Pair Verification Strategy with "Omron Insight"
  
  let bestScore = -999;
  let bestPair = null;

  for (let i = 0; i < candidates.length - 1; i++) {
    const s = candidates[i];
    const d = candidates[i+1];
    
    // Basic rules
    if (s <= d) continue; // Sys must be > Dia
    
    let score = 0;
    const pp = s - d;
    
    // 1. Pulse Pressure Check
    if (pp >= 20 && pp <= 100) score += 20;
    else if (pp > 10 && pp < 120) score += 5; 
    else score -= 10; 
    
    // 2. Range Check (Expanded for Severe Hypertension)
    // Previous bias (90-180) caused rejection of 200+ readings.
    // We now allow bonus points for a wider range to catch medical emergencies.
    if (s >= 80 && s <= 240) score += 10;
    if (d >= 40 && d <= 140) score += 10;
    
    // 3. Omron Scale Marker Anti-Bias
    // Common scale markers on Omron are 135 and 85. 
    // If we pick these, we are likely picking the static text, not the reading.
    // Penalty is applied but not absolute (in case real BP IS 135/85)
    if (s === 135) score -= 5;
    if (d === 85) score -= 5;
    
    // 4. Position Penalty (Prefer earlier numbers)
    // Reduced penalty to ensure we don't skip the top number if it's clearly better
    score -= (i * 1.5); 

    if (score > bestScore) {
      bestScore = score;
      bestPair = { sys: s, dia: d, index: i };
    }
  }

  // Fallback: Max method if verification fails
  if (!bestPair || bestScore < 0) {
    // If we failed, use the old Max method as a last resort
    var maxVal = Math.max(...candidates);
    var s = maxVal;
    
    // Find index
    var idx = candidates.indexOf(s);
    var d = (idx + 1 < candidates.length) ? candidates[idx+1] : 0;
    var p = (idx + 2 < candidates.length) ? candidates[idx+2] : 0;
    
    return { sys: s, dia: d, pul: p };
  }

  // 5. Find Pulse
  let sys = bestPair.sys;
  let dia = bestPair.dia;
  let pul = 0;
  
  const pIdx = bestPair.index + 2;
  if (pIdx < candidates.length) {
    let pCandidate = candidates[pIdx];
    if (pCandidate >= 40 && pCandidate <= 200) {
      pul = pCandidate;
    }
  }

  return { sys: sys, dia: dia, pul: pul };
}

function getHealthAdvice(sys, dia) {
  if (sys === 0 || dia === 0) return { status: 'Unknown', message: 'ไม่พบค่าความดัน', color: 'gray' };

  // 1. Crisis (วิกฤต) — SYS >= 171 หรือ DIA >= 106
  if (sys >= 171 || dia >= 106) {
    return { status: 'Crisis', message: 'ความดันสูงระดับวิกฤต', color: 'red' };
  }

  // 2. High (ความดันสูง) — SYS 140-170 หรือ DIA 90-105
  if (sys >= 140 || dia >= 90) {
    return { status: 'High', message: 'ความดันสูงกว่าเกณฑ์', color: 'orange' };
  }

  // 3. Low (ความดันต่ำ) — SYS <= 110 หรือ DIA <= 70
  if (sys <= 110 || dia <= 70) {
    return { status: 'Low', message: 'ความดันต่ำกว่าเกณฑ์', color: 'blue' };
  }

  // 4. Normal (ปกติ) — SYS 111-139 และ DIA 71-89
  return { status: 'Normal', message: 'ความดันปกติ', color: 'green' };
}

const SHEET_NAME = 'BP_Tracker_Database';

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Timestamp', 'Systolic', 'Diastolic', 'Pulse', 'Status', 'ImageURL']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Log data to Sheet
 */
function logBPData(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = setupDatabase();
    }
    
    // Status calc again to be safe
    const advice = getHealthAdvice(data.systolic, data.diastolic);
    
    sheet.appendRow([
      new Date(),
      data.systolic,
      data.diastolic,
      data.pulse,
      advice.status,
      data.imageUrl || '' // Future: Save image to Drive and put URL here
    ]);
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Fetch history for Chart
 */
function getHistoryData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return []; // Return empty if sheet doesn't exist yet
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return []; // Only header
    
    // Get last 10 records
    const startRow = Math.max(2, lastRow - 9);
    const numRows = lastRow - startRow + 1;
    
    // Columns: A(Time), B(Sys), C(Dia), D(Pul)
    const values = sheet.getRange(startRow, 1, numRows, 4).getValues();
    
    // Format for frontend
    return values.map(row => ({
      date: Utilities.formatDate(new Date(row[0]), ss.getSpreadsheetTimeZone(), "dd/MM HH:mm"),
      sys: row[1],
      dia: row[2],
      pul: row[3]
    }));
  } catch (e) {
    Logger.log("getHistory Error: " + e.toString());
    return [];
  }
}
