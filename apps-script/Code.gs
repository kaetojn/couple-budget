// Paste into the Google Sheet under Extensions > Apps Script, then deploy as a Web app
// (Execute as: Me, Who has access: Anyone). TOKEN must match the Worker's SHEET_TOKEN secret.
const TOKEN = 'REPLACE_WITH_YOUR_TOKEN';

function doPost(e) {
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.token !== TOKEN) return out({ ok: false, error: 'Token does not match' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let name = data.tabName, n = 1;
    while (ss.getSheetByName(name)) { n++; name = data.tabName + ' (' + n + ')'; }
    const sheet = ss.insertSheet(name, ss.getNumSheets());
    const width = Math.max.apply(null, data.rows.map(r => r.length));
    const rows = data.rows.map(r => r.concat(Array(width - r.length).fill('')));
    sheet.getRange(1, 1, rows.length, width).setValues(rows);
    (data.boldRows || []).forEach(i => sheet.getRange(i + 1, 1, 1, width).setFontWeight('bold'));
    sheet.autoResizeColumns(1, width);
    return out({ ok: true, tab: name });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
