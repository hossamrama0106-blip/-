/**
 * Khiam Ops — تسجيل المخالفات تلقائياً في Google Sheet.
 *
 * خطوات الإعداد (مرة واحدة، 3 دقائق):
 * 1) افتح https://sheets.new (شيت جديد).
 * 2) من القائمة: Extensions ▸ Apps Script، واحذف أي كود موجود والصق هذا الملف كاملاً.
 * 3) اضغط Deploy ▸ New deployment ▸ (اختر النوع) Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4) انسخ رابط الـ Web app (ينتهي بـ /exec) وضعه في الداشبورد: ⚙️ الإعدادات ▸ رابط Google Sheet.
 * تمام — كل مخالفة جديدة ستُسجَّل سطراً في الشيت تلقائياً.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Violations') || ss.insertSheet('Violations');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['الوقت', 'الموظف', 'الكود', 'النوع', 'الخطورة', 'السبب', 'الرابط']);
    }
    sheet.appendRow([
      data.at || new Date().toISOString(),
      data.employee || '',
      data.code || '',
      data.type || '',
      data.severity || '',
      data.reason || '',
      data.link || '',
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('Khiam Ops violations webhook is live.');
}
