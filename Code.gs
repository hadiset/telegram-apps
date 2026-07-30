/**
 * ====== SETUP (satu kali) ======
 * 1. Project Settings (ikon gerigi) → Script Properties → tambahkan:
 *    - BOT_TOKEN            : token dari BotFather
 *    - BOT_USERNAME         : username bot TANPA @ (misal: TokoAbcBot)
 *    - MINI_APP_SHORT_NAME  : short name dari /newapp di BotFather
 * 2. Deploy → New deployment → Web app (Execute as: Me, Anyone access) → copy URL .../exec
 * 3. Set webhook Telegram (buka URL ini SEKALI di browser, ganti <TOKEN> dan <EXEC_URL>):
 *    https://api.telegram.org/bot<TOKEN>/setWebhook?url=<EXEC_URL>
 * 4. Di BotFather: /newapp → pilih bot → isi short name (harus sama dgn MINI_APP_SHORT_NAME)
 *    → title/description/photo → URL Mini App = URL GitHub Pages form kamu.
 */

function doGet(e) {
  return ContentService.createTextOutput('Backend OK.');
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // Update dari Telegram (webhook) selalu punya field update_id
    if (body.update_id !== undefined) {
      return handleTelegramUpdate_(body);
    }

    // Selain itu: submission dari Mini App form
    return handleOrderSubmission_(body);
  } catch (err) {
    return jsonOutput_({ ok: false, error: err.message });
  }
}

function handleTelegramUpdate_(update) {
  var message = update.message;
  if (message && message.text && message.text.indexOf('/order') === 0) {
    sendOrderFormButton_(message.chat.id);
  }
  // Telegram tidak mengikuti redirect 302 yang dihasilkan ContentService,
  // jadi balasan ke webhook harus pakai HtmlService — bukan JSON.
  return HtmlService.createHtmlOutput('OK');
}

function sendOrderFormButton_(chatId) {
  var props = PropertiesService.getScriptProperties();
  var botUsername = props.getProperty('BOT_USERNAME');
  var shortName = props.getProperty('MINI_APP_SHORT_NAME');
  var startParam = base64UrlEncode_(String(chatId));
  var directLink = 'https://t.me/' + botUsername + '/' + shortName + '?startapp=' + startParam;

  callTelegramApi_('sendMessage', {
    chat_id: chatId,
    text: 'Tap tombol di bawah untuk buka form order:',
    reply_markup: {
      inline_keyboard: [[{ text: '📋 Buka Form Order', url: directLink }]]
    }
  });
}

function handleOrderSubmission_(payload) {
  var botToken = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');

  if (!validateInitData_(payload.initData, botToken)) {
    throw new Error('initData tidak valid — request ditolak.');
  }
  if (!payload.nama || !payload.tanggal) {
    throw new Error('Field nama atau tanggal kosong.');
  }

  var orderId = generateOrderId_();

  var sheet = getOrdersSheet_();
  var telegramUsername = payload.telegramUser ? payload.telegramUser.username : '';
  sheet.appendRow([new Date(), orderId, payload.nama, payload.tanggal, telegramUsername]);

  // Kirim konfirmasi + lampiran balik ke grup asal, kalau form dibuka dari direct link grup
  if (payload.startParam) {
    try {
      var chatId = base64UrlDecode_(payload.startParam);
      var text = '✅ Order berhasil disimpan\n' +
        'ID: ' + orderId + '\n' +
        'Nama: ' + payload.nama + '\n' +
        'Tanggal: ' + payload.tanggal;
      callTelegramApi_('sendMessage', { chat_id: chatId, text: text });

      if (payload.resi && payload.resi.data) {
        sendTelegramDocument_(chatId, payload.resi.data, payload.resi.filename || 'resi.pdf', payload.resi.mimeType, 'Resi Order - ' + orderId);
      }
      if (payload.bukti && payload.bukti.data) {
        sendTelegramPhoto_(chatId, payload.bukti.data, payload.bukti.filename || 'bukti.jpg', payload.bukti.mimeType, 'Bukti Transfer - ' + orderId);
      }
    } catch (notifyErr) {
      // Order tetap tersimpan walau notifikasi/lampiran ke grup gagal — jangan gagalkan submission karena ini
    }
  }

  return jsonOutput_({ ok: true, id: orderId });
}

/**
 * ID unik & sekuensial per hari, dijaga LockService supaya submit
 * bersamaan tidak saling tabrakan. Format: ORD-YYYYMMDD-0001
 */
function generateOrderId_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
    var key = 'ORDER_SEQ_' + today;
    var seq = Number(props.getProperty(key) || '0') + 1;
    props.setProperty(key, String(seq));
    var seqStr = ('0000' + seq).slice(-4);
    return 'ORD-' + today + '-' + seqStr;
  } finally {
    lock.releaseLock();
  }
}

/** ===== Kirim file ke Telegram (dipanggil dari handleOrderSubmission_) ===== */

function sendTelegramDocument_(chatId, base64Data, filename, mimeType, caption) {
  var botToken = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType || 'application/pdf', filename);
  UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendDocument', {
    method: 'post',
    payload: { chat_id: String(chatId), document: blob, caption: caption || '' },
    muteHttpExceptions: true
  });
}

function sendTelegramPhoto_(chatId, base64Data, filename, mimeType, caption) {
  var botToken = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType || 'image/jpeg', filename);
  UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendPhoto', {
    method: 'post',
    payload: { chat_id: String(chatId), photo: blob, caption: caption || '' },
    muteHttpExceptions: true
  });
}

function getOrdersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Orders');
  if (!sheet) {
    sheet = ss.insertSheet('Orders');
    sheet.appendRow(['Waktu Submit', 'ID Order', 'Nama', 'Tanggal', 'Telegram Username']);
  }
  return sheet;
}

function callTelegramApi_(method, bodyObj) {
  var botToken = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  var url = 'https://api.telegram.org/bot' + botToken + '/' + method;
  return UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(bodyObj),
    muteHttpExceptions: true
  });
}

/** ===== Utilitas webhook — jalankan manual dari editor (pilih fungsi → Run) ===== */

function setWebhookFn() {
  var url = ScriptApp.getService().getUrl(); // ganti manual dgn URL .../exec kalau ini kosong
  Logger.log(callTelegramApi_('setWebhook', { url: url, drop_pending_updates: true }).getContentText());
}

function getWebhookInfoFn() {
  var botToken = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  Logger.log(UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/getWebhookInfo').getContentText());
}

function deleteWebhookFn() {
  Logger.log(callTelegramApi_('deleteWebhook', { drop_pending_updates: true }).getContentText());
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** ===== base64url helpers (buat encode/decode chat_id di startapp param) ===== */

function base64UrlEncode_(str) {
  var bytes = Utilities.newBlob(str).getBytes();
  var base64 = Utilities.base64EncodeWebSafe(bytes);
  return base64.replace(/=+$/, '');
}

function base64UrlDecode_(str) {
  var padded = str;
  while (padded.length % 4 !== 0) {
    padded += '=';
  }
  var bytes = Utilities.base64DecodeWebSafe(padded);
  return Utilities.newBlob(bytes).getDataAsString();
}

/** ===== Validasi initData (HMAC-SHA256) sesuai algoritma resmi Telegram ===== */

function validateInitData_(initDataRaw, botToken) {
  if (!initDataRaw || !botToken) return false;

  var params = initDataRaw.split('&');
  var pairs = [];
  var hash = null;

  for (var i = 0; i < params.length; i++) {
    var idx = params[i].indexOf('=');
    var key = params[i].substring(0, idx);
    var value = decodeURIComponent(params[i].substring(idx + 1));
    if (key === 'hash') {
      hash = value;
    } else {
      pairs.push(key + '=' + value);
    }
  }
  if (!hash) return false;

  pairs.sort();
  var dataCheckString = pairs.join('\n');

  var secretKeyBytes = Utilities.computeHmacSha256Signature(botToken, 'WebAppData');
  var hmacBytes = Utilities.computeHmacSha256Signature(
    Utilities.newBlob(dataCheckString).getBytes(),
    secretKeyBytes
  );
  var computedHash = bytesToHex_(hmacBytes);

  return computedHash === hash;
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    var v = (b < 0) ? b + 256 : b;
    var hex = v.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}
