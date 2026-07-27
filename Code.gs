function doGet(e) {
  return ContentService.createTextOutput('Backend OK. Use POST to submit an order.');
}

/**
 * Appends an order row to the "Orders" sheet.
 * Expects JSON body: { id, nama, tanggal, telegramUser, initData }
 *
 * NOTE: this does not yet validate `initData`'s signature (HMAC with the
 * bot token) — fine for testing, but add that check before going live so
 * random requests can't be posted as if they came from Telegram.
 */
function doPost(e) {
  try {
    let payload = JSON.parse(e.postData.contents);

    if (!payload.id || !payload.nama || !payload.tanggal) {
      throw new Error('Field id, nama, atau tanggal kosong.');
    }

    let sheet = getOrdersSheet_();
    let telegramUsername = payload.telegramUser ? payload.telegramUser.username : '';

    sheet.appendRow([
      new Date(),        // waktu submit (server time)
      payload.id,
      payload.nama,
      payload.tanggal,
      telegramUsername
    ]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true, id: payload.id }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Gets (or creates, with a header row) the "Orders" sheet in the
 * spreadsheet this script is bound to.
 */
function getOrdersSheet_() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Orders');
  if (!sheet) {
    sheet = ss.insertSheet('Orders');
    sheet.appendRow(['Waktu Submit', 'ID Order', 'Nama', 'Tanggal', 'Telegram Username']);
  }
  return sheet;
}
