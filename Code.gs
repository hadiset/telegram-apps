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

    if (body.update_id !== undefined) {
      return handleTelegramUpdate_(body);
    }
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
  if (!payload.resi || !payload.resi.data) {
    throw new Error('File RESI (PDF) wajib diunggah.');
  }

  // VALIDASI BACKEND: Minimal 1 produk harus diisi
  var products = payload.products || {};
  var hasProduct = false;
  for (var key in products) {
    if (Number(products[key]) > 0) {
      hasProduct = true;
      break;
    }
  }
  if (!hasProduct) {
    throw new Error('Minimal harus mengisi 1 produk dengan jumlah > 0.');
  }

  var orderId = generateOrderId_();
  var userInfo = getUserInfoFromInitData_(payload.initData);
  var pic = userInfo.pic;
  var picId = userInfo.id;
  
  var now = new Date();
  var tz = Session.getScriptTimeZone();
  var tanggal = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var waktu = Utilities.formatDate(now, tz, 'HH:mm:ss');

  var baseData = {
    'ID': orderId,
    'TANGGAL': tanggal,
    'WAKTU': waktu,
    'PIC': pic,
    'NAMA': payload.nama,
    'TOTAL': payload.total,
    'GUDANG': payload.gudang,
    'RINGKASAN': '',
    'LABEL': '',
    'KETERANGAN': payload.keterangan || ''
  };

  // 1. Input ke sheet order SK (Ozza + SK)
  var skSheet = getSheetByName_('order SK', getSkHeaders_());
  var skRow = buildSkRow_(baseData, products);
  if (skRow) skSheet.appendRow(skRow);

  // 2. Input ke sheet order SR12
  var sr12Sheet = getSheetByName_('order SR12', getSr12Headers_());
  var sr12Row = buildSr12Row_(baseData, products);
  if (sr12Row) sr12Sheet.appendRow(sr12Row);

  // 3. Input ke sheet order paranet (Tanpa ID)
  var paranetSheet = getSheetByName_('order paranet', getParanetHeaders_());
  var paranetRow = buildParanetRow_(baseData, products);
  if (paranetRow) paranetSheet.appendRow(paranetRow);

  // Kirim konfirmasi + lampiran balik ke grup asal
  if (payload.startParam) {
    try {
      var chatId = base64UrlDecode_(payload.startParam);
      
      // Susun list produk yang diisi
      var productText = '';
      for (var p in products) {
        if (Number(products[p]) > 0) {
          productText += ' • `' + products[p] + '`  ' + p + '\n';
        }
      }
      
      // Format mention CS: [Nama CS](tg://user?id=ID_CS)
      var picMention = picId ? `[${escapeMarkdown_(pic)}](tg://user?id=${picId})` : escapeMarkdown_(pic);
      
      var text = '✅ *Order berhasil disimpan*\n' +
        '*ID:* `' + orderId + '`\n' +
        '*TANGGAL:* ' + tanggal + '\n' +
        '*PIC:* ' + picMention + '\n' +        
        '*NAMA:* ' + escapeMarkdown_(payload.nama) + '\n' +
        '*TOTAL:* Rp ' + formatRupiah_(payload.total) + '\n' +
        '*GUDANG:* ' + payload.gudang + '\n' +
        '*KETERANGAN:* ' + escapeMarkdown_(payload.keterangan || '-') + '\n' +
        '*PRODUK:*\n' + productText;
        
      callTelegramApi_('sendMessage', { 
        chat_id: chatId, 
        text: text,
        parse_mode: 'Markdown' 
      });

      if (payload.resi && payload.resi.data) {
        sendTelegramDocument_(chatId, payload.resi.data, payload.resi.filename || 'resi.pdf', payload.resi.mimeType, 'Resi Order - ' + orderId);
      }
      if (payload.bukti && payload.bukti.data) {
        sendTelegramPhoto_(chatId, payload.bukti.data, payload.bukti.filename || 'bukti.jpg', payload.bukti.mimeType, 'Bukti Transfer - ' + orderId);
      }
    } catch (notifyErr) {
      // Abaikan error notifikasi
    }
  }

  return jsonOutput_({ ok: true, id: orderId });
}

/** ===== Helper Sheets & Rows ===== */

function getSheetByName_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function getSkHeaders_() {
  return ['ID','TANGGAL','WAKTU','PIC','NAMA','TOTAL','GUDANG','RINGKASAN','LABEL','KETERANGAN',
  'PAKET ULTIMATE OZZA','PAKET BASIC OZZA','DAY CREAM OZZA','NIGHT CREAM OZZA','SUNSCREEN OZZA','FACIAL WASH OZZA','DARKSPOT SERUM OZZA','PEELING SERUM OZZA 3in1','TONER OZZA','EYE CARE OZZA','LEVEL UP SUNSCREEN OZZA','HYPERPIGMENTATION OZZA',
  'IXORA 01','GUAVA 02','CHAESA 03','CHERRY BLOSSOM 04','PLUM 05','MAHATIC OMBRE','MAHATIC BOX','DS SATUAN','DS BOX','VLORIN SKIN SATUAN','VLORIN SKIN BOX','MADU MAGANZA','HARUMU NEW ELEGANT','HARUMU LOVABLE','HARUMU MAXIMA','HARUMU FREANKY','HARUMU PAKET','KRIM PARAMA','JCC OIL','PARFUM MEISIE','HIJAB SELLORA','NAKDE SNACK'];
}

function getSr12Headers_() {
  return ['ID','TANGGAL','WAKTU','PIC','NAMA','TOTAL','GUDANG','RINGKASAN','LABEL','KETERANGAN',
  'GOMILKU 600G ORIGINAL','GOMILKU 600G COKLAT','GOMILKU 600G STRAWBERI','GOMILKU 600G GOLD','MANJA SR12 KAPSUL 60 KAPSUL','MANJA SR12 PIL 60 PIL','MISS MANJA WASH AND SPRAY','DEODORANT SPRAY 60 ML','DEO SPRAY PREMIUM 60 ML','DAILY COVER 10G NATURAL','DAILY COVER 10G SHEER PINK','DAILY COVER 10G BEIGE','MATTE COVER LOOSE POWDER 15G','BB CREAM NATURAL BEIGE 30ML','LIP CARE CHERRY 5G','LIP CARE NATURAL 5G','LIP BALM CHERRY MOISTURIZER & LIP COLOUR SR12'];
}

function getParanetHeaders_() {
  return ['ID','TANGGAL','WAKTU','PIC','NAMA','TOTAL','GUDANG','RINGKASAN','LABEL','KETERANGAN',
  'PARANET 2M x 2M','PARANET 2M x 3M','PARANET 2M x 4M','PARANET 2M x 5M','PARANET 2M x 6M','PARANET 2M x 7M','PARANET 2M x 8M','PARANET 2M x 9M','PARANET 2M x 10M',
  'PARANET 3M x 2M','PARANET 3M x 3M','PARANET 3M x 4M','PARANET 3M x 5M','PARANET 3M x 6M','PARANET 3M x 7M','PARANET 3M x 8M','PARANET 3M x 9M','PARANET 3M x 10M',
  'PARANET 4M x 2M','PARANET 4M x 3M','PARANET 4M x 4M','PARANET 4M x 5M','PARANET 4M x 6M','PARANET 4M x 7M','PARANET 4M x 8M','PARANET 4M x 9M','PARANET 4M x 10M'];
}

function buildSkRow_(base, products) {
  var hasData = false;
  var row = [base.ID, base.TANGGAL, base.WAKTU, base.PIC, base.NAMA, base.TOTAL, base.GUDANG, base.RINGKASAN, base.LABEL, base.KETERANGAN];
  var ozza = ['PAKET ULTIMATE OZZA','PAKET BASIC OZZA','DAY CREAM OZZA','NIGHT CREAM OZZA','SUNSCREEN OZZA','FACIAL WASH OZZA','DARKSPOT SERUM OZZA','PEELING SERUM OZZA 3in1','TONER OZZA','EYE CARE OZZA','LEVEL UP SUNSCREEN OZZA','HYPERPIGMENTATION OZZA'];
  var sk = ['IXORA 01','GUAVA 02','CHAESA 03','CHERRY BLOSSOM 04','PLUM 05','MAHATIC OMBRE','MAHATIC BOX','DS SATUAN','DS BOX','VLORIN SKIN SATUAN','VLORIN SKIN BOX','MADU MAGANZA','HARUMU NEW ELEGANT','HARUMU LOVABLE','HARUMU MAXIMA','HARUMU FREANKY','HARUMU PAKET','KRIM PARAMA','JCC OIL','PARFUM MEISIE','HIJAB SELLORA','NAKDE SNACK'];
  
  ozza.concat(sk).forEach(function(p) {
    var val = Number(products[p] || 0);
    if (val > 0) hasData = true;
    row.push(val > 0 ? val : ''); 
  });
  return hasData ? row : null;
}

function buildSr12Row_(base, products) {
  var hasData = false;
  var row = [base.ID, base.TANGGAL, base.WAKTU, base.PIC, base.NAMA, base.TOTAL, base.GUDANG, base.RINGKASAN, base.LABEL, base.KETERANGAN];
  var sr12 = ['GOMILKU 600G ORIGINAL','GOMILKU 600G COKLAT','GOMILKU 600G STRAWBERI','GOMILKU 600G GOLD','MANJA SR12 KAPSUL 60 KAPSUL','MANJA SR12 PIL 60 PIL','MISS MANJA WASH AND SPRAY','DEODORANT SPRAY 60 ML','DEO SPRAY PREMIUM 60 ML','DAILY COVER 10G NATURAL','DAILY COVER 10G SHEER PINK','DAILY COVER 10G BEIGE','MATTE COVER LOOSE POWDER 15G','BB CREAM NATURAL BEIGE 30ML','LIP CARE CHERRY 5G','LIP CARE NATURAL 5G','LIP BALM CHERRY MOISTURIZER & LIP COLOUR SR12'];
  
  sr12.forEach(function(p) {
    var val = Number(products[p] || 0);
    if (val > 0) hasData = true;
    row.push(val > 0 ? val : ''); 
  });
  return hasData ? row : null;
}

function buildParanetRow_(base, products) {
  var hasData = false;
  var row = [base.ID, base.TANGGAL, base.WAKTU, base.PIC, base.NAMA, base.TOTAL, base.GUDANG, base.RINGKASAN, base.LABEL, base.KETERANGAN];
  var paranet = ['PARANET 2M x 2M','PARANET 2M x 3M','PARANET 2M x 4M','PARANET 2M x 5M','PARANET 2M x 6M','PARANET 2M x 7M','PARANET 2M x 8M','PARANET 2M x 9M','PARANET 2M x 10M','PARANET 3M x 2M','PARANET 3M x 3M','PARANET 3M x 4M','PARANET 3M x 5M','PARANET 3M x 6M','PARANET 3M x 7M','PARANET 3M x 8M','PARANET 3M x 9M','PARANET 3M x 10M','PARANET 4M x 2M','PARANET 4M x 3M','PARANET 4M x 4M','PARANET 4M x 5M','PARANET 4M x 6M','PARANET 4M x 7M','PARANET 4M x 8M','PARANET 4M x 9M','PARANET 4M x 10M'];
  
  paranet.forEach(function(p) {
    var val = Number(products[p] || 0);
    if (val > 0) hasData = true;
    row.push(val > 0 ? val : ''); 
  });
  return hasData ? row : null;
}

/** ===== Fungsi Utilitas Asli (Tidak Diubah) ===== */

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

function setWebhookFn() {
  var url = ScriptApp.getService().getUrl(); 
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
  var hmacBytes = Utilities.computeHmacSha256Signature(Utilities.newBlob(dataCheckString).getBytes(), secretKeyBytes);
  var computedHash = bytesToHex_(hmacBytes);
  return computedHash === hash;
}

function getUserInfoFromInitData_(initDataRaw) {
  var result = { pic: '', id: '' };
  try {
    var params = initDataRaw.split('&');
    for (var i = 0; i < params.length; i++) {
      var idx = params[i].indexOf('=');
      var key = params[i].substring(0, idx);
      var value = decodeURIComponent(params[i].substring(idx + 1));
      if (key === 'user') {
        var userObj = JSON.parse(value);
        var firstName = userObj.first_name || '';
        var lastName = userObj.last_name || '';
        result.pic = (firstName + ' ' + lastName).trim();
        result.id = userObj.id || '';
        break;
      }
    }
  } catch (e) {}
  return result;
}

/** Escaping karakter biar gak rusak format Markdown Telegram */
function escapeMarkdown_(text) {
  if (!text) return '';
  return String(text).replace(/([_*`[])/g, '\\$1');
}

/** Helper Format Rupiah */
function formatRupiah_(angka) {
  if (!angka) return '0';
  var number = Number(angka);
  // Menggunakan regex untuk menambahkan titik setiap 3 digit angka
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    var v = (b < 0) ? b + 256 : b;
    var hex = v.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}
