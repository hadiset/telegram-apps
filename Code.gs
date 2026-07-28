// Ganti dengan Token Bot Telegram Anda
const BOT_TOKEN = '8800611742:AAHL1e38FHdFUCMRK-lXkaX4EPX9p85cdi8'; 
const WEB_APP_URL = 'https://hadiset.github.io/telegram-apps/';

function doGet(e) {
  return ContentService.createTextOutput('Backend OK. Use POST to submit an order.');
}

// Fungsi ini untuk menerima Webhook dari Telegram (Command /start atau /order)
function doPost(e) {
  try {
    // Cek apakah request datang dari Telegram Webhook
    if (e.postData.type === 'application/json') {
      let update = JSON.parse(e.postData.contents);
      
      if (update.message && update.message.text) {
        let chatId = update.message.chat.id;
        let text = update.message.text.toLowerCase();
        
        if (text === '/start' || text === '/order') {
          sendInlineButton(chatId);
        }
      }
      return ContentService.createTextOutput('OK');
    }
    
    // Jika request datang dari Mini Apps (Form Submit)
    let payload = JSON.parse(e.postData.contents);

    if (!payload.id || !payload.nama || !payload.tanggal || !payload.chatId) {
      throw new Error('Field id, nama, tanggal, atau chatId kosong.');
    }

    let sheet = getOrdersSheet_();
    let telegramUsername = payload.telegramUser ? payload.telegramUser.username : '';

    sheet.appendRow([
      new Date(),        // waktu submit
      payload.id,
      payload.nama,
      payload.tanggal,
      telegramUsername,
      payload.chatId
    ]);

    // Kirim notifikasi ke grup
    sendOrderNotificationToGroup(payload);

    return ContentService.createTextOutput(JSON.stringify({ ok: true, id: payload.id }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Fungsi untuk mengirim tombol Mini Apps ke grup
function sendInlineButton(chatId) {
  // Kita tambahkan chatId ke parameter URL (startapp) agar Mini Apps tahu kemana harus kirim data
  let miniAppUrl = WEB_APP_URL + '?startapp=' + chatId;
  
  let payload = {
    chat_id: chatId,
    text: 'Silakan klik tombol di bawah ini untuk membuka form input order:',
    reply_markup: {
      inline_keyboard: [[
        { text: '📝 Buka Form Order', web_app: { url: miniAppUrl } }
      ]]
    }
  };
  
  UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
}

// Fungsi untuk mengirim hasil input ke grup
function sendOrderNotificationToGroup(payload) {
  let text = `✅ *Order Baru Berhasil Diinput*\n\n` +
             `*ID Order:* ${payload.id}\n` +
             `*Nama:* ${payload.nama}\n` +
             `*Tanggal:* ${payload.tanggal}\n` +
             `*Diinput oleh:* @${payload.telegramUser ? payload.telegramUser.username : 'Unknown'}`;
             
  // Tambahkan detail item/total di sini sesuai kebutuhan
  
  let payloadTelegram = {
    chat_id: payload.chatId,
    text: text,
    parse_mode: 'Markdown'
  };
  
  UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payloadTelegram)
  });
}

function getOrdersSheet_() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Orders');
  if (!sheet) {
    sheet = ss.insertSheet('Orders');
    sheet.appendRow(['Waktu Submit', 'ID Order', 'Nama', 'Tanggal', 'Telegram Username', 'Chat ID Grup']);
  }
  return sheet;
}
