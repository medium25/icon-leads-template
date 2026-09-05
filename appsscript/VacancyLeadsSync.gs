// appsscript/VacancyLeadsSync.gs
//
// Синк заявок на вакансии из таблицы "ICON VACATIONS" (лист "CALL CENTRE")
// в леды-борд — пишет новые строки НАПРЯМУЮ в Firestore (students) через
// REST API + сервис-аккаунт, без Cloud Functions/Blaze-плана.
//
// Это не деплоится этим репозиторием — Apps Script живёт в Google, файл
// тут только как источник правды. Настройка:
//
// 1. Завести сервис-аккаунт с доступом к Firestore (без Blaze — это
//    обычный IAM, бесплатно):
//      Google Cloud Console → IAM & Admin → Service Accounts → Create
//      service account → любое имя → роль "Cloud Datastore User"
//      (roles/datastore.user) → готово.
//      Затем: этот аккаунт → Keys → Add key → Create new key → JSON —
//      скачается файл, откройте его текстом, весь JSON целиком
//      понадобится на шаге 3.
//    Проект в Cloud Console — тот же, что Firebase-проект (icon-hr-crm),
//    они делят один и тот же GCP-проект.
//
// 2. В таблице "ICON VACATIONS": Расширения → Apps Script → вставить
//    содержимое этого файла (замените Code.gs целиком).
//
// 3. Настройки проекта (⚙ слева) → Script Properties → Add script property
//    (три штуки):
//      FIRESTORE_PROJECT_ID = icon-hr-crm
//      SERVICE_ACCOUNT_JSON = <вставить весь JSON-файл ключа из шага 1
//                              одной строкой как есть>
//      DEFAULT_BRANCH_ID    = main   (или ваш реальный branchId филиала)
//
// 4. В редакторе выбрать функцию installTrigger_ → Выполнить (один раз,
//    попросит доступ) — заведёт триггер по расписанию (каждые 10 минут).
//    Без этого шага синк не будет запускаться сам.
//
// Проверить руками: выбрать функцию syncNewLeads → Выполнить, посмотреть
// Executions (⏱ слева) на ошибки.

var SHEET_NAME = 'CALL CENTRE';

// 1-indexed позиции колонок (id столбца A=1) — под текущую раскладку листа.
var COL_ID = 1; // id
var COL_CREATED = 2; // created_time
var COL_VACANCY = 13; // M — qaysi_vakansiya
var COL_NAME = 14; // N — ismingiz:_
var COL_PHONE = 15; // O — raqamingiz:_
var ANSWER_COL_START = 16; // P
var ANSWER_COL_END = 23; // W — остальное с P по W уходит вопрос/ответ парами
// Столбец AZ (намеренно далеко за пределами реальных данных листа — там
// могут быть свои служебные столбцы вроде "CREATED" от Meta/Zapier,
// начиная примерно с Z/AA) — сюда скрипт пишет "synced"/"error" после
// попытки отправки, чтобы не слать одну и ту же строку повторно. Новую
// строку в столбец вписывать вручную не нужно — заполнится само при
// первом запуске.
var SYNC_MARKER_COL = 52; // AZ

/**
 * Точка входа триггера. Новые лиды в этой таблице вставляются НАВЕРХ (это
 * приводит к тому, что даже строка заголовков со временем съезжает вниз),
 * поэтому отслеживать «последнюю обработанную строку» по номеру нельзя —
 * вместо этого каждый раз ищем строку заголовков заново и обрабатываем
 * все строки листа, у которых столбец SYNC_MARKER_COL ещё пуст.
 */
function syncNewLeads() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Лист "' + SHEET_NAME + '" не найден.');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var headerRowIndex = findHeaderRow_(sheet, lastRow);
  var headerRow = sheet
    .getRange(headerRowIndex, ANSWER_COL_START, 1, ANSWER_COL_END - ANSWER_COL_START + 1)
    .getValues()[0];

  var allData = sheet.getRange(1, 1, lastRow, ANSWER_COL_END).getValues();
  var markers = sheet.getRange(1, SYNC_MARKER_COL, lastRow, 1).getValues().map(function (m) {
    return m[0];
  });

  var accessToken = null; // получаем лениво — незачем ходить за токеном, если слать нечего

  for (var i = 0; i < allData.length; i++) {
    var rowNumber = i + 1;
    if (rowNumber === headerRowIndex) continue;
    if (markers[i] === 'synced') continue; // уже отправлена раньше

    if (!accessToken) accessToken = getAccessToken_();
    markers[i] = sendRow_(allData[i], headerRow, accessToken) ? 'synced' : 'error';
  }

  sheet.getRange(1, SYNC_MARKER_COL, lastRow, 1).setValues(markers.map(function (v) {
    return [v];
  }));
}

/** Строка заголовков — та, где в столбце A буквально "id" (см. комментарий у syncNewLeads, её позиция плавает). */
function findHeaderRow_(sheet, lastRow) {
  var colA = sheet.getRange(1, COL_ID, lastRow, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    if (colA[i][0] === 'id') return i + 1;
  }
  throw new Error('Не нашёл строку заголовков (столбец A со значением "id").');
}

/** @returns {boolean} true — записано, уже существовало, или строка невалидна/пустая (пропущена намеренно); false — реальная ошибка, нужно повторить. */
function sendRow_(row, headerRow, accessToken) {
  var id = row[COL_ID - 1];
  if (!id) return true; // полностью пустая строка — пропускаем, не ошибка

  var fullName = String(row[COL_NAME - 1] || '').trim();
  var phone = normalizePhone_(row[COL_PHONE - 1]);
  // Тестовая/пустая строка формы (Meta иногда кладёт такую в лист как
  // образец) отсеивается тут же — без цифр в номере это не лид.
  if (!fullName || phone.length < 9) return true;

  var answers = [];
  for (var c = ANSWER_COL_START; c <= ANSWER_COL_END; c++) {
    var answer = row[c - 1];
    if (answer === '' || answer === null || answer === undefined) continue;
    answers.push({ question: humanizeHeader_(headerRow[c - ANSWER_COL_START]), answer: String(answer) });
  }

  var createdTimeRaw = row[COL_CREATED - 1];
  var createdAt = createdTimeRaw instanceof Date ? createdTimeRaw : new Date(createdTimeRaw);
  if (isNaN(createdAt.getTime())) createdAt = new Date();

  var props = PropertiesService.getScriptProperties();
  var docId = 'vac_' + String(id).replace(/[^a-zA-Z0-9]/g, '');
  var fields = toFirestoreFields_({
    fullName: fullName,
    phone: phone,
    phone2: null,
    branchId: props.getProperty('DEFAULT_BRANCH_ID') || 'main',
    vacancyName: String(row[COL_VACANCY - 1] || ''),
    formAnswers: answers,
    source: 'vacancy_form',
    status: 'lead',
    statusReason: null,
    funnelStage: 'new',
    // Ответственного не назначаем автоматически — берут вручную через
    // карточку либо через Настройки → «Назначение ответственных».
    assignedOperator: null,
    stageHistory: [{ stage: 'new', enteredAt: createdAt }],
    balance: 0,
    balanceUpdatedAt: new Date(),
    note: '',
    isFlagged: false,
    activeGroupsCount: 0,
    firstPaymentAt: null,
    lastPaymentAt: null,
    trialAt: null,
    leftAt: null,
    createdAt: createdAt,
    createdBy: 'vacancy_sync',
    isArchived: false,
  });

  var projectId = props.getProperty('FIRESTORE_PROJECT_ID');
  if (!projectId) throw new Error('Script Properties: задай FIRESTORE_PROJECT_ID (см. инструкцию в шапке файла).');

  // currentDocument.exists=false — Firestore сам откажет (409), если
  // документ с таким id уже есть: повторная доставка той же строки (retry,
  // перезапуск скрипта) не создаст дубль и не перезапишет уже продвинутый
  // по воронке лид.
  var url =
    'https://firestore.googleapis.com/v1/projects/' +
    projectId +
    '/databases/(default)/documents/students/' +
    docId +
    '?currentDocument.exists=false';

  var response = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + accessToken },
    payload: JSON.stringify({ fields: fields }),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code === 200 || code === 409) return true; // создано, либо уже было — оба ок

  Logger.log('Firestore write failed for id=' + id + ': ' + code + ' ' + response.getContentText());
  return false;
}

// Номера в форме приходят вперемешку: с "+998", без кода страны (9 цифр),
// с пробелами/дефисами — приводим к единому формату "998" + 9 цифр, как
// везде в приложении (см. src/lib/auth.js, src/pages/LoginPage.jsx).
function normalizePhone_(raw) {
  var digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 9 ? '998' + digits : digits;
}

/** "qaysi_ish_grafikimiz_sizga_mos?_" → "Qaysi ish grafikimiz sizga mos?" */
function humanizeHeader_(header) {
  var s = String(header || '')
    .trim()
    .replace(/^_+|_+$/g, '')
    .replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- Firestore REST value encoding ---------------------------------------

function toFirestoreValue_(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return value % 1 === 0 ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue_) } };
  if (typeof value === 'object') return { mapValue: { fields: toFirestoreFields_(value) } };
  return { stringValue: String(value) };
}

function toFirestoreFields_(obj) {
  var fields = {};
  Object.keys(obj).forEach(function (key) {
    fields[key] = toFirestoreValue_(obj[key]);
  });
  return fields;
}

// --- Сервис-аккаунт: подписываем JWT и меняем на access token -----------
// Без внешних библиотек — Utilities.computeRsaSha256Signature встроен в
// Apps Script специально для этого сценария (service account без OAuth2
// consent-экрана, т.к. это server-to-server, не от имени пользователя).

function getAccessToken_() {
  var saJson = PropertiesService.getScriptProperties().getProperty('SERVICE_ACCOUNT_JSON');
  if (!saJson) throw new Error('Script Properties: задай SERVICE_ACCOUNT_JSON (см. инструкцию в шапке файла).');
  var sa = JSON.parse(saJson);

  var now = Math.floor(Date.now() / 1000);
  var header = base64Url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claimSet = base64Url_(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  var signatureInput = header + '.' + claimSet;
  var signatureBytes = Utilities.computeRsaSha256Signature(signatureInput, sa.private_key);
  var jwt = signatureInput + '.' + Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, '');

  var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    },
    muteHttpExceptions: true,
  });

  var body = JSON.parse(response.getContentText());
  if (!body.access_token) throw new Error('Не удалось получить access_token: ' + response.getContentText());
  return body.access_token;
}

function base64Url_(str) {
  return Utilities.base64EncodeWebSafe(Utilities.newBlob(str).getBytes()).replace(/=+$/, '');
}

/** Запустить один раз вручную из редактора — заводит триггер каждые 10 минут (замену старого, если уже был). */
function installTrigger_() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) {
      return t.getHandlerFunction() === 'syncNewLeads';
    })
    .forEach(function (t) {
      ScriptApp.deleteTrigger(t);
    });
  ScriptApp.newTrigger('syncNewLeads').timeBased().everyMinutes(10).create();
}
