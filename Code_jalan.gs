// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

/**
 * Bot token dari BotFather
 * SECURITY NOTE: Untuk production, gunakan PropertiesService.getScriptProperties()
 * untuk menyimpan token secara aman
 */
const TOKEN = "6005197007:AAFZWulQXPwz3pWDlvYukPpIMtoRGcqgtKc";
const TELEGRAM_API_URL = "https://api.telegram.org/bot" + TOKEN;
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwl08lJ8yZEgtWacGEtCRpyKP2O7IypAPV1-ijZ3goZVNMXAceZwEXDISHNlrP0FFQy/exec";

/**
 * Google Spreadsheet dan Admin ID untuk logging
 */
const SPREADSHEET = SpreadsheetApp.getActiveSpreadsheet();
const ADMIN_ID = "328887266";

/**
 * Daftar gudang yang valid
 */
const VALID_WAREHOUSES = ["BGR", "JKT", "MDN", "MKS", "SMR"];

// ============================================================================
// TELEGRAM API FUNCTIONS
// ============================================================================

/**
 * Mendapatkan informasi bot
 * Digunakan untuk testing awal
 */
function getMe() {
    const response = UrlFetchApp.fetch(TELEGRAM_API_URL + "/getMe");
    Logger.log(response.getContentText());
}

/**
 * Mendapatkan updates dari Telegram
 * Digunakan untuk testing
 */
function getUpdates() {
    const response = UrlFetchApp.fetch(TELEGRAM_API_URL + "/getUpdates");
    Logger.log(response.getContentText());
}

/**
 * Set webhook untuk bot
 */
function setWebhook() {
    const response = UrlFetchApp.fetch(TELEGRAM_API_URL + "/setWebhook?url=" + WEB_APP_URL);
    Logger.log(response.getContentText());
}

/**
 * Mendapatkan informasi webhook
 */
function getWebhookInfo() {
    const response = UrlFetchApp.fetch(TELEGRAM_API_URL + "/getWebhookInfo");
    Logger.log(response.getContentText());
}

/**
 * Menghapus webhook
 */
function deleteWebhook() {
    const response = UrlFetchApp.fetch(TELEGRAM_API_URL + "/deleteWebhook");
    Logger.log(response.getContentText());
}

/**
 * Mengirim pesan ke chat tertentu
 * @param {string} chatId - ID chat tujuan
 * @param {string} text - Teks pesan yang akan dikirim
 */
function sendMessage(chatId, text) {
    try {
        const response = UrlFetchApp.fetch(
            TELEGRAM_API_URL + "/sendMessage?chat_id=" + chatId +
            "&text=" + encodeURIComponent(text) + "&parse_mode=html"
        );
        Logger.log(response.getContentText());
    } catch (error) {
        console.log("Error sending message:", error);
    }
}

/**
 * Mengirim reply ke pesan tertentu
 * @param {string} chatId - ID chat tujuan
 * @param {string} replyToMessageId - ID pesan yang akan di-reply
 * @param {string} text - Teks pesan yang akan dikirim
 */
function replyMessage(chatId, replyToMessageId, text) {
    try {
        const response = UrlFetchApp.fetch(
            TELEGRAM_API_URL + "/sendMessage?chat_id=" + chatId +
            "&reply_to_message_id=" + replyToMessageId +
            "&text=" + encodeURIComponent(text) + "&parse_mode=html"
        );
        Logger.log(response.getContentText());
    } catch (error) {
        console.log("Error sending reply:", error);
    }
}

// ============================================================================
// WEBHOOK HANDLERS
// ============================================================================

/**
 * Handler untuk GET request
 * @param {Object} e - Event object
 * @returns {HtmlOutput} HTML response
 */
function doGet(e) {
    return HtmlService.createHtmlOutput("Hello" + JSON.stringify(e));
}

function doPost(e) {
    try {        
        const contents = JSON.parse(e.postData.contents);
        const message = contents.message;
        const updateId = contents.update_id;
        const chatId = message.chat.id;
        const messageId = message.message_id;

        sendMessage(ADMIN_ID, JSON.stringify(message,2,null));

        const text = message.text || message.caption || "";

        // SILENT BOT OPTIMIZATION
        // Only respond if message starts with or contains certain markers
        const markers = ["/start", "/template_sk", "/template_sr12", "/template_paranet", "/NAMA"];
        const hasMarker = markers.some(marker => text.includes(marker));
        
        if (!hasMarker) {
            console.log("No marker found. Silent mode.");
            return;
        }

        // Handle template selection commands
        if (text.startsWith("/template_sk")) {
            return kirimTemplate(chatId, "SK");
        } else if (text.startsWith("/template_sr12")) {
            return kirimTemplate(chatId, "SR12");
        } else if (text.startsWith("/template_paranet")) {
            return kirimTemplate(chatId, "PARANET");
        }

        // Cek apakah pesan berisi data yang akan di-input
        const hasDataInput = text.includes('/NAMA');

        if (hasDataInput) {
            inputData(message, chatId, messageId, updateId);
        } else if (text.startsWith("/start") ||
            message.hasOwnProperty("new_chat_member") ||
            message.hasOwnProperty("new_chat_members") ||
            message.hasOwnProperty("new_chat_participant")) {
            kirimSemuaTemplate(chatId);
        }

    } catch (error) {
        handleCriticalError(error, e);
    }
}

/**
 * Menangani error kritis dan mengirim notifikasi ke admin
 * @param {Error} error - Error object
 * @param {Object} eventData - Event data untuk debugging
 */
function handleCriticalError(error, eventData) {
    try {
        const errorDetails = {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        };

        // Kirim error details ke admin
        sendMessage(ADMIN_ID, "🚨 CRITICAL ERROR\n\n" + JSON.stringify(errorDetails, null, 2));

        // Kirim event data jika ada
        if (eventData && eventData.postData) {
            const contents = JSON.parse(eventData.postData.contents);
            sendMessage(ADMIN_ID, "📨 Message Data:\n" + JSON.stringify(contents.message, null, 2));

            // Reply ke user jika memungkinkan
            const message = contents.message;
            const chatId = message.chat.id;
            const messageId = message.message_id;
            const pesan = message.hasOwnProperty("text") ? message.text : message.caption;

            if (pesan && pesan.includes("/NAMA")) {
                const pic = message.from.hasOwnProperty("last_name") ?
                    message.from.first_name + " " + message.from.last_name :
                    message.from.first_name;
                const picId = message.from.id;
                const nama = pesan.split("NAMA:")[1].split("\n")[0].trim();

                replyMessage(
                    chatId,
                    messageId,
                    `Hi kak <a href='tg://user?id=${picId}'>${pic}</a>, data atas nama <b>${nama}</b> gagal di input. Mohon di input ulang ya...`
                );
            }
        }
    } catch (e) {
        console.log("Error in error handler:", e);
    }
}

// Redundant functions removed. Using functions from template-config.gs instead.

// ============================================================================
// BUSINESS LOGIC - DATA INPUT
// ============================================================================

/**
 * Memproses input data dari user
 * @param {Object} message - Message object dari Telegram
 * @param {string} chatId - ID chat
 * @param {string} messageId - ID pesan
 * @param {string} updateId - Update ID dari Telegram
 */
function inputData(message, chatId, messageId, updateId) {    
    const pesan = message.hasOwnProperty("text") ? message.text : message.caption;

    // Validasi format awal
    if (!pesan.startsWith("/NAMA") || !pesan.includes('NAMA:')) {
        kirimSemuaTemplate(chatId);
        return;
    }

    // Extract user info
    const pic = message.from.hasOwnProperty("last_name") ?
        message.from.first_name + " " + message.from.last_name :
        message.from.first_name;
    const picId = message.from.id;
    const nama = pesan.split("NAMA:")[1].split("\n")[0].trim();

    // Deteksi template type
    const templateType = detectTemplate(pesan);

    if (!templateType) {
        return replyMessage(
            chatId,
            messageId,
            `Hi kak <a href='tg://user?id=${picId}'>${pic}</a>, template tidak terdeteksi. Silakan gunakan salah satu template yang tersedia.\n\nKirim /start untuk melihat pilihan template.`
        );
    }

    console.log("Template detected:", templateType);

    // Get template config
    const config = getTemplateConfig(templateType);

    // Validasi keberadaan semua field yang required
    const missingField = validateRequiredFields(pesan, config.fields);
    if (missingField) {
        return inputError(chatId, messageId, picId, pic, nama, missingField);
    }

    // Extract semua field data
    const data = extractAllFields(pesan, config.fields);

    // Validasi data
    const validationError = validateInputData(data, picId, pic, nama, config.fields);
    if (validationError) {
        return replyMessage(chatId, messageId, validationError);
    }

    // Prepare data untuk insert
    const tgl = new Date();
    const values = prepareDataArray(updateId, tgl, pic, nama, data, config.fields);

    // Insert ke sheet dengan locking mechanism
    saveDataToSheet(values, chatId, messageId, picId, pic, nama, config.sheetName);
}

/**
 * Menyimpan data ke Google Sheet dengan locking mechanism
 * @param {Array} values - Data yang akan disimpan
 * @param {string} chatId - ID chat
 * @param {string} messageId - ID pesan
 * @param {string} picId - ID user
 * @param {string} pic - Nama user
 * @param {string} nama - Nama dari data
 * @param {string} sheetName - Nama sheet tujuan
 */
function saveDataToSheet(values, chatId, messageId, picId, pic, nama, sheetName) {
    const lock = LockService.getScriptLock();

    try {
        // Coba dapatkan lock dengan timeout 30 detik
        const hasLock = lock.tryLock(30000);

        if (!hasLock) {
            console.log("Failed to acquire lock for user:", pic);
            sendMessage(ADMIN_ID, `⚠️ Lock timeout untuk user: ${pic} (${nama})`);
            return replyMessage(chatId, messageId, "Sistem sedang sibuk, silakan coba lagi dalam beberapa saat.");
        }

        console.log("Lock acquired for user:", pic);

        // Insert data ke sheet
        const success = insertSheet(values, sheetName);

        if (success) {
            console.log("Data inserted successfully for:", nama, "to sheet:", sheetName);
            return replyMessage(
                chatId,
                messageId,
                `Siap kak <a href='tg://user?id=${picId}'>${pic}</a> &#128522; , data atas nama <b>${nama}</b> berhasil di input. \n\nSemangat Closing Ya! &#128522;`
            );
        } else {
            console.log("Data insertion failed for:", nama);
            sendMessage(ADMIN_ID, `❌ Insert gagal untuk: ${pic} (${nama})\nSheet: ${sheetName}\nData: ${JSON.stringify(values)}`);
            return replyMessage(
                chatId,
                messageId,
                `Hi kak <a href='tg://user?id=${picId}'>${pic}</a>, data atas nama <b>${nama}</b> gagal di input. Mohon di input ulang ya kak &#128516;`
            );
        }

    } catch (error) {
        console.log("Error during data insertion:", error);
        sendMessage(ADMIN_ID, `🚨 ERROR saat insert data\nUser: ${pic}\nNama: ${nama}\nSheet: ${sheetName}\nError: ${error.message}\nStack: ${error.stack}`);
        return replyMessage(chatId, messageId, "Terjadi kesalahan sistem. Mohon coba lagi.");

    } finally {
        // Pastikan lock selalu di-release
        try {
            if (lock) {
                lock.releaseLock();
                console.log("Lock released for user:", pic);
            }
        } catch (e) {
            console.log("Error releasing lock:", e);
            sendMessage(ADMIN_ID, `⚠️ Error releasing lock: ${e.message}`);
        }
    }
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validasi keberadaan semua field yang required
 * @param {string} message - Pesan yang akan divalidasi
 * @param {Array} fields - Array field yang required
 * @returns {string|null} Nama field yang hilang atau null jika semua ada
 */
function validateRequiredFields(message, fields) {
    for (const field of fields) {
        // Validasi format harus persis: "FIELD :" (dengan spasi sebelum titik dua)
        const regex = new RegExp(`${field} :`);
        if (!regex.test(message)) {
            return field;
        }
    }
    return null;
}

/**
 * Validasi data input
 * @param {Object} data - Data yang akan divalidasi
 * @param {string} picId - ID user
 * @param {string} pic - Nama user
 * @param {string} nama - Nama dari data
 * @param {Array} fields - Array field untuk validasi
 * @returns {string|null} Error message atau null jika valid
 */
function validateInputData(data, picId, pic, nama, fields) {
    // Validasi nama tidak boleh mengandung Unicode
    if (containsUnicode(nama)) {
        return createErrorMsg(picId, pic, nama, "NAMA", "pake teks biasa saja");
    }

    // Validasi gudang harus terdaftar
    if (!cekGudang(data.gudang)) {
        return createErrorMsg(picId, pic, nama, "GUDANG", "gudang tidak terdaftar");
    }

    // Validasi semua field angka (kecuali GUDANG, KETERANGAN)
    for (const field of fields) {
        if (field === "GUDANG" || field === "KETERANGAN") continue;

        const fieldKey = field.toLowerCase().replace(/\s+/g, '_');
        const value = data[fieldKey];

        if (value !== undefined && !cekAngka(value)) {
            return `Hi kak <a href='tg://user?id=${picId}'>${pic}</a>, data atas nama <b>${nama}</b> gagal di input.\n\nFormat <b>JUMLAH ${field}</b> tidak sesuai &#129300;`;
        }
    }

    return null;
}

/**
 * Validasi apakah string adalah angka (termasuk string kosong)
 * @param {string} angka - String yang akan divalidasi
 * @returns {boolean} True jika valid
 */
function cekAngka(angka) {
    const pattern = /^[0-9]*$/;
    return pattern.test(angka);
}

/**
 * Validasi apakah gudang terdaftar
 * @param {string} gudang - Kode gudang
 * @returns {boolean} True jika gudang valid
 */
function cekGudang(gudang) {
    return VALID_WAREHOUSES.includes(gudang);
}

/**
 * Cek apakah text mengandung karakter Unicode (non-ASCII)
 * @param {string} text - Text yang akan dicek
 * @returns {boolean} True jika mengandung Unicode
 */
function containsUnicode(text) {
    const unicodeRegex = /[^\u0000-\u007F]/;
    return unicodeRegex.test(text);
}

// ============================================================================
// DATA EXTRACTION & PROCESSING
// ============================================================================

/**
 * Mengekstrak nilai field dari pesan
 * @param {string} message - Pesan yang akan di-parse
 * @param {string} fieldName - Nama field yang akan diekstrak
 * @returns {string} Nilai field atau string kosong
 */
function extractField(message, fieldName) {
    return message.split(`${fieldName} :`)[1]?.split("\n")[0]?.trim() || "";
}

/**
 * Mengekstrak semua field dari pesan berdasarkan template config
 * @param {string} pesan - Pesan yang akan di-parse
 * @param {Array} fields - Array field yang akan diekstrak
 * @returns {Object} Object berisi semua field data
 */
function extractAllFields(pesan, fields) {
    const data = {};

    for (const field of fields) {
        const value = extractField(pesan, field);
        const key = field.toLowerCase().replace(/\s+/g, '_');

        if (field === "GUDANG") {
            data[key] = value.toUpperCase();
        } else {
            data[key] = value;
        }
    }

    return data;
}

/**
 * Menyiapkan array data untuk insert ke sheet
 * @param {string} updateId - Update ID
 * @param {Date} tgl - Tanggal
 * @param {string} pic - Nama PIC
 * @param {string} nama - Nama customer
 * @param {Object} data - Data yang sudah di-extract
 * @param {Array} fields - Array field
 * @returns {Array} Array 2D untuk insert
 */
function prepareDataArray(updateId, tgl, pic, nama, data, fields) {
    const row = [updateId, tgl, tgl, pic, nama, data.total, data.gudang, , , data.keterangan];

    // Tambahkan semua field produk
    for (const field of fields) {
        if (field === "GUDANG" || field === "TOTAL" || field === "KETERANGAN") continue;

        const key = field.toLowerCase().replace(/\s+/g, '_');
        row.push(data[key] || "");
    }

    return [row];
}

function columnToLetter(column) {
    let temp, letter = '';
    while (column > 0) {
        temp = (column - 1) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        column = (column - temp - 1) / 26;
    }
    return letter;
}

// ============================================================================
// GOOGLE SHEETS OPERATIONS
// ============================================================================

/**
 * Insert data ke Google Sheet
 * @param {Array} values - Array 2D berisi data yang akan di-insert
 * @param {string} sheetName - Nama sheet tujuan
 * @returns {boolean} True jika berhasil
 */
function insertSheet(values, sheetName) {
    try {
        const sheet = SPREADSHEET.getSheetByName(sheetName);

        if (!sheet) {
            throw new Error(`Sheet ${sheetName} tidak ditemukan`);
        }

        const numRow = sheet.getLastRow();
        const numCols = values[0].length;
        const lastCol = columnToLetter(numCols);

        const range = sheet.getRange(`A${numRow + 1}:${lastCol}${numRow + 1}`);
        range.setValues(values);

        const afterRow = sheet.getLastRow();
        return afterRow > numRow;

    } catch (error) {
        console.log("Error inserting to sheet:", error);
        throw error; // Re-throw untuk ditangani di level atas
    }
}

// ============================================================================
// MESSAGE HELPERS
// ============================================================================

/**
 * Mengirim template pesan ke user
 * @param {string} chatId - ID chat tujuan
 * @param {string} templateType - Type template (SK, SR12, PARANET)
 */
function kirimTemplate(chatId, templateType) {
    const config = getTemplateConfig(templateType);
    if (!config) return;

    sendMessage(chatId, `Template untuk ${config.displayName}:`);
    sendMessage(chatId, config.messageTemplate);
}

/**
 * Mengirim menu pilihan template ke user
 * @param {string} chatId - ID chat tujuan
 */
function kirimSemuaTemplate(chatId) {
    const menuMessage = `Selamat datang! Pilih template yang ingin digunakan:

/template_sk - Produk OZZASKIN, MAHATIC, OTHER
/template_sr12 - Produk SR12
/template_paranet - Produk PARANET

Atau kirim /start untuk melihat menu ini lagi.`;

    sendMessage(chatId, menuMessage);
}

/**
 * Mengirim pesan error untuk field yang tidak valid
 * @param {string} chatId - ID chat
 * @param {string} messageId - ID pesan
 * @param {string} picId - ID user
 * @param {string} pic - Nama user
 * @param {string} nama - Nama dari data
 * @param {string} field - Field yang error
 * @returns {void}
 */
function inputError(chatId, messageId, picId, pic, nama, field) {
    const pesan = `Hi kak <a href='tg://user?id=${picId}'>${pic}</a>, data atas nama <b>${nama}</b> gagal di input. \n\nFormat <b>${field}</b> Salah, Typo atau Tidak ditemukan, coba cek lagi ya kak! Pastikan juga ada spasi sebelum tanda titik dua. &#129300;`;
    return replyMessage(chatId, messageId, pesan);
}

/**
 * Membuat pesan error dengan format standar
 * @param {string} picId - ID user
 * @param {string} pic - Nama user
 * @param {string} nama - Nama dari data
 * @param {string} field - Field yang error
 * @param {string} note - Catatan tambahan (optional)
 * @returns {string} Pesan error
 */
function createErrorMsg(picId, pic, nama, field, note = "") {
    const noteText = note ? `\n<b>${note}</b>` : "";
    return `Hi kak <a href='tg://user?id=${picId}'>${pic}</a>, data atas nama <b>${nama}</b> gagal di input.\n\nFormat <b>${field}</b> tidak sesuai &#129300;${noteText}.`;
}

// ============================================================================
// TEMPLATE CONFIGURATIONS
// ============================================================================

/**
 * Template configuration untuk semua jenis produk
 * Setiap template memiliki:
 * - name: Identifier unik
 * - displayName: Nama yang ditampilkan ke user
 * - marker: Field unik untuk deteksi template
 * - sheetName: Nama sheet di Google Sheets
 * - fields: Array field yang required (common + products)
 * - messageTemplate: Template pesan untuk user
 */

const TEMPLATE_CONFIGS = {
  
  SK: {
    name: "SK",
    displayName: "Produk SK (OZZASKIN, MAHATIC, OTHER)",
    marker: "ULTI :",
    sheetName: "ORDER_SK",
    
    // Field yang required (3 common + 35 products = 38 fields)
    fields: [
      // Common fields
      "GUDANG", "TOTAL", "KETERANGAN",
      
      // OZZASKIN products (12 items)
      "ULTI", "BASIC", "D CRM", "N CRM", "S SCRN", "F WASH", 
      "DSPOT SRUM", "PELNG SRUM", "TONER", "EYE CARE", "LVL UP SS", "HYPERPIGMENT",
      
      // MAHATIC products (7 items)
      "IX 01", "GU 02", "CH 03", "CB 04", "PL 05", "OMBRE", "BOX",
      
      // OTHER products (16 items)
      "DS SAT", "DS BOX", "VLOR SAT", "VLOR BOX", "MAGANZA",
      "HRM ELE", "HRM LOV", "HRM MAX", "HRM FRE", "HRM PKT",
      "PARAMA", "JCC OIL", "MEISIE", "SELLORA", "NAKDE"
    ],
    
    // Template message untuk user
    messageTemplate: `/NAMA: 
TOTAL : 
GUDANG : 
KETERANGAN : 

========= 
OZZASKIN 
========= 
ULTI : 
BASIC : 
D CRM : 
N CRM : 
S SCRN : 
F WASH : 
DSPOT SRUM : 
PELNG SRUM : 
TONER : 
EYE CARE : 
LVL UP SS :
HYPERPIGMENT : 

========= 
MAHATIC 
========= 
IX 01 : 
GU 02 : 
CH 03 : 
CB 04 : 
PL 05 : 
OMBRE : 
BOX : 

========= 
OTHER 
========= 
DS SAT : 
DS BOX : 
VLOR SAT : 
VLOR BOX : 
MAGANZA : 
HRM ELE : 
HRM LOV : 
HRM MAX : 
HRM FRE : 
HRM PKT : 
PARAMA :
JCC OIL :
MEISIE :
SELLORA :
NAKDE :
`
  },
  
  // ========================================================================
  // TEMPLATE SR12 - Produk SR12
  // ========================================================================
  SR12: {
    name: "SR12",
    displayName: "Produk SR12",
    marker: "GoMlk Ori :",
    sheetName: "ORDER_SR12",
    
    // Field yang required (3 common + 17 products = 20 fields)
    fields: [
      // Common fields
      "GUDANG", "TOTAL", "KETERANGAN",
      
      // SR12 products (17 items)
      "GoMlk Ori", "GoMlk Cklt", "GoMlk Sbri", "GoMlk Gold",
      "Manja Kapsul", "Manja Pil", "Manja WnS",
      "DeoSpray", "DeoSpray Prem",
      "DlyCvr Ntrl", "DlyCvr Pink", "DlyCvr Beig",
      "MatCvr LP", "BB Cream",
      "LipCare Cher", "LipCare Ntrl", "LipBalm Cher"
    ],
    
    // Template message untuk user
    messageTemplate: `/NAMA: 
TOTAL : 
GUDANG : 
KETERANGAN : 

========= 
SR12 
========= 
GoMlk Ori : 
GoMlk Cklt : 
GoMlk Sbri : 
GoMlk Gold : 
Manja Kapsul : 
Manja Pil : 
Manja WnS : 
DeoSpray : 
DeoSpray Prem : 
DlyCvr Ntrl : 
DlyCvr Pink : 
DlyCvr Beig : 
MatCvr LP : 
BB Cream : 
LipCare Cher : 
LipCare Ntrl : 
LipBalm Cher : 
`
  },
  
  // ========================================================================
  // TEMPLATE PARANET - Produk PARANET
  // ========================================================================
  PARANET: {
    name: "PARANET",
    displayName: "Produk PARANET",
    marker: "2M x 2M :",
    sheetName: "ORDER_PARANET",
    
    // Field yang required (3 common + 27 products = 30 fields)
    fields: [
      // Common fields
      "GUDANG", "TOTAL", "KETERANGAN",
      
      // PARANET products (27 items)
      // 2M series (9 items)
      "2M x 2M", "2M x 3M", "2M x 4M", "2M x 5M", "2M x 6M", 
      "2M x 7M", "2M x 8M", "2M x 9M", "2M x 10M",
      
      // 3M series (9 items)
      "3M x 2M", "3M x 3M", "3M x 4M", "3M x 5M", "3M x 6M",
      "3M x 7M", "3M x 8M", "3M x 9M", "3M x 10M",
      
      // 4M series (9 items)
      "4M x 2M", "4M x 3M", "4M x 4M", "4M x 5M", "4M x 6M",
      "4M x 7M", "4M x 8M", "4M x 9M", "4M x 10M"
    ],
    
    // Template message untuk user
    messageTemplate: `/NAMA: 
TOTAL : 
GUDANG : 
KETERANGAN : 

========= 
PARANET 
========= 
2M x 2M : 
2M x 3M : 
2M x 4M : 
2M x 5M : 
2M x 6M : 
2M x 7M : 
2M x 8M : 
2M x 9M : 
2M x 10M : 
3M x 2M : 
3M x 3M : 
3M x 4M : 
3M x 5M : 
3M x 6M : 
3M x 7M : 
3M x 8M : 
3M x 9M : 
3M x 10M : 
4M x 2M : 
4M x 3M : 
4M x 4M : 
4M x 5M : 
4M x 6M : 
4M x 7M : 
4M x 8M : 
4M x 9M : 
4M x 10M : 
`
  }
};

// ============================================================================
// TEMPLATE HELPER FUNCTIONS
// ============================================================================

/**
 * Deteksi template berdasarkan marker field
 * @param {string} message - Pesan dari user
 * @returns {string|null} Template type atau null jika tidak terdeteksi
 */
function detectTemplate(message) {
  // Check PARANET first (most specific marker)
  if (message.includes(TEMPLATE_CONFIGS.PARANET.marker)) {
    return "PARANET";
  }
  
  // Check SR12
  if (message.includes(TEMPLATE_CONFIGS.SR12.marker)) {
    return "SR12";
  }
  
  // Check SK
  if (message.includes(TEMPLATE_CONFIGS.SK.marker)) {
    return "SK";
  }
  
  // No template detected
  return null;
}

/**
 * Mendapatkan konfigurasi template berdasarkan type
 * @param {string} templateType - Type template (LAMA, SR12, PARANET)
 * @returns {Object} Template configuration object
 */
function getTemplateConfig(templateType) {
  return TEMPLATE_CONFIGS[templateType];
}

/**
 * Mendapatkan semua template types yang tersedia
 * @returns {Array} Array of template type strings
 */
function getAllTemplateTypes() {
  return Object.keys(TEMPLATE_CONFIGS);
}

