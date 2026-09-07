// appsscript/FormLeadsSync.gs
//
// Приём заявок из Google Form «ICON HR bo'limi» в леды-борд. В отличие от
// VacancyLeadsSync.gs (старый лист «CALL CENTRE» с фиксированной раскладкой
// колонок) — тут НЕ выбираются нужные колонки: скрипт берёт все ответы
// формы. Имя и телефон определяются по ключевым словам в тексте вопроса,
// всё остальное целиком уходит в formAnswers. Добавили/убрали вопрос в
// форме — код менять не нужно.
//
// Живёт в ТОМ ЖЕ Apps Script проекте, что и VacancyLeadsSync.gs (Расширения
// → Apps Script из таблицы «ICON VACATIONS»), отдельным .gs-файлом. Делит с
// ним Script Properties. Свои функции названы с префиксом form_ / fs_ —
// чтобы не столкнуться с одноимёнными из VacancyLeadsSync.gs (в Apps Script
// все .gs-файлы проекта в одной области видимости).
//
// === Разовая настройка ===
//
// 1. Привязать форму к таблице «ICON VACATIONS»:
//    Открыть форму → вкладка «Ответы» (Javoblar) → зелёная иконка Sheets →
//    «Выбрать существующую таблицу» → «ICON VACATIONS». Появится новый лист
//    «Ответы на форму 1» (или похоже) — это и есть новый лист.
//
// 2. Script Properties (Настройки проекта → шестерёнка) — если уже заданы
//    для VacancyLeadsSync.gs, ничего добавлять не нужно:
//      FIRESTORE_PROJECT_ID  = icon-hr-crm
//      SERVICE_ACCOUNT_JSON  = <весь JSON-ключ сервис-аккаунта одной строкой>
//      DEFAULT_BRANCH_ID     = main
//      DEFAULT_OPERATOR_UID  = <uid оператора в staff/{uid}> (необязательно)
//
// 3. В редакторе выбрать функцию form_installTrigger → Выполнить (один раз,
//    попросит доступ). Заведёт триггер «при отправке формы».
//
// 4. Проверка: отправить тестовую заявку через форму → через пару секунд
//    карточка появляется в первом столбце доски. Логи — Executions (⏱).

// --- ключевые слова для распознавания полей (регистр не важен) ------------
// Заголовок вопроса, содержащий одно из этих слов, трактуется как имя/
// телефон/вакансия. Всё, что не распозналось, идёт в formAnswers.
// «name» намеренно НЕ в списке имени — оно ловит «Telegram username».
var FORM_NAME_HINTS = ['ism', 'имя', 'фио', 'ф.и.о', 'исм', 'familiya'];
var FORM_PHONE_HINTS = ['raqam', 'telefon', 'телефон', 'номер', 'aloqa'];
var FORM_VACANCY_HINTS = ['vakansiya', 'vakansiyaga', 'vazifa', 'lavozim', 'вакансия', 'должность', 'позиция'];
var FORM_TELEGRAM_HINTS = ['telegram', 'телеграм', 'tg username', 'tg:'];

/**
 * Триггер «при отправке формы» (устанавливается form_installTrigger).
 * e.namedValues — { «Текст вопроса»: [«ответ»] }.
 */
function form_onSubmit(e) {
  if (!e || !e.namedValues) {
    Logger.log('Нет e.namedValues — запусти через реальную отправку формы, не вручную.');
    return;
  }

  var picked = { name: '', phone: '', vacancyName: '', telegram: '', answers: [] };
  Object.keys(e.namedValues).forEach(function (question) {
    var answer = (e.namedValues[question] || []).join(', ').trim();
    if (!answer) return;

    var q = String(question).toLowerCase();
    if (q.indexOf('timestamp') !== -1 || q.indexOf('отметка времени') !== -1 || q === 'vaqt belgisi') return;

    if (!picked.name && form_matches_(q, FORM_NAME_HINTS)) {
      picked.name = answer;
      return;
    }
    if (!picked.phone && form_matches_(q, FORM_PHONE_HINTS)) {
      picked.phone = answer;
      return;
    }
    if (!picked.vacancyName && form_matches_(q, FORM_VACANCY_HINTS)) {
      picked.vacancyName = answer;
      return;
    }
    if (!picked.telegram && form_matches_(q, FORM_TELEGRAM_HINTS)) {
      // чистый хэндл: без @, без ссылки-обёртки, первое «слово»
      picked.telegram = answer
        .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
        .replace(/^@+/, '')
        .split(/[\/?\s]/)[0];
      return;
    }
    picked.answers.push({ question: String(question).replace(/\s+/g, ' ').trim(), answer: answer });
  });

  if (!picked.name || form_normalizePhone_(picked.phone).length < 9) {
    Logger.log('Пропущено: не нашёл имя или телефон. namedValues: ' + JSON.stringify(e.namedValues));
    return;
  }

  var props = PropertiesService.getScriptProperties();
  var createdAt = form_readTimestamp_(e);
  var docId = 'form_' + (e.range && e.range.getRow ? e.range.getRow() : Date.now());

  var doc = fs_toFields_({
    fullName: picked.name,
    phone: form_normalizePhone_(picked.phone),
    phone2: null,
    branchId: props.getProperty('DEFAULT_BRANCH_ID') || 'main',
    vacancyName: picked.vacancyName || '',
    telegram: picked.telegram || '',
    formAnswers: picked.answers,
    source: 'vacancy_form',
    status: 'lead',
    statusReason: null,
    funnelStage: 'new',
    assignedOperator: props.getProperty('DEFAULT_OPERATOR_UID') || null,
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
    createdBy: 'form_sync',
    isArchived: false,
  });

  var projectId = props.getProperty('FIRESTORE_PROJECT_ID');
  if (!projectId) throw new Error('Script Properties: задай FIRESTORE_PROJECT_ID (см. инструкцию в шапке файла).');

  // currentDocument.exists=false — повторная доставка той же строки (retry)
  // не создаст дубль и не перезапишет уже продвинутый по воронке лид.
  var url =
    'https://firestore.googleapis.com/v1/projects/' +
    projectId +
    '/databases/(default)/documents/students/' +
    docId +
    '?currentDocument.exists=false';

  var response = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + fs_getAccessToken_() },
    payload: JSON.stringify({ fields: doc }),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code === 200 || code === 409) {
    Logger.log('OK (' + code + '): ' + picked.name + ' → students/' + docId);
    return;
  }
  Logger.log('Firestore write failed ' + code + ': ' + response.getContentText());
  throw new Error('Firestore вернул ' + code);
}

function form_matches_(loweredQuestion, hints) {
  for (var i = 0; i < hints.length; i++) {
    if (loweredQuestion.indexOf(hints[i]) !== -1) return true;
  }
  return false;
}

/** Первый столбец листа ответов формы — Timestamp; читаем его как дату создания. */
function form_readTimestamp_(e) {
  try {
    var raw = e.range.getSheet().getRange(e.range.getRow(), 1).getValue();
    var d = raw instanceof Date ? raw : new Date(raw);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch (err) {
    return new Date();
  }
}

// Номер: с «+998», без кода (9 цифр), с пробелами/дефисами — к «998» + 9 цифр.
function form_normalizePhone_(raw) {
  var digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 9 ? '998' + digits : digits;
}

/**
 * Разовый прогон всех строк листа ответов формы — для заявок, пришедших ДО
 * установки триггера (onFormSubmit ловит только новые). Дубли не создаёт
 * (docId = form_<номер строки>, currentDocument.exists=false). Запускать
 * вручную из редактора. FORM_SHEET_NAME — имя листа с ответами (см. ниже),
 * поправь, если у тебя оно другое.
 */
var FORM_SHEET_NAME = 'Form_Responses2';

function form_backfillAll() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FORM_SHEET_NAME);
  if (!sheet) {
    Logger.log('Лист «' + FORM_SHEET_NAME + '» не найден. Поправь FORM_SHEET_NAME в начале файла.');
    return;
  }
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('В листе нет строк с данными.');
    return;
  }
  var headers = data[0];
  var ok = 0;
  var skipped = 0;
  for (var r = 1; r < data.length; r++) {
    var namedValues = {};
    for (var c = 0; c < headers.length; c++) {
      var v = data[r][c];
      namedValues[String(headers[c])] = [v === null || v === undefined ? '' : String(v)];
    }
    var fakeEvent = { namedValues: namedValues, range: { getRow: function () { return r + 1; }, getSheet: function () { return sheet; } } };
    try {
      form_onSubmit(fakeEvent);
      ok++;
    } catch (err) {
      skipped++;
      Logger.log('Строка ' + (r + 1) + ': ' + (err.message || err));
    }
  }
  Logger.log('Backfill готово: обработано ' + ok + ', пропущено/ошибка ' + skipped + ' из ' + (data.length - 1) + '.');
}

/** Запустить один раз вручную — ставит триггер «при отправке формы» (заменяет старый с тем же именем). */
function form_installTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers()
    .filter(function (t) {
      return t.getHandlerFunction() === 'form_onSubmit';
    })
    .forEach(function (t) {
      ScriptApp.deleteTrigger(t);
    });
  ScriptApp.newTrigger('form_onSubmit').forSpreadsheet(ss).onFormSubmit().create();
  Logger.log('Триггер form_onSubmit поставлен на таблицу «' + ss.getName() + '».');
}

// --- Firestore REST value encoding (fs_ — свои, чтобы не конфликтовать) ---

function fs_toValue_(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return value % 1 === 0 ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fs_toValue_) } };
  if (typeof value === 'object') return { mapValue: { fields: fs_toFields_(value) } };
  return { stringValue: String(value) };
}

function fs_toFields_(obj) {
  var fields = {};
  Object.keys(obj).forEach(function (key) {
    fields[key] = fs_toValue_(obj[key]);
  });
  return fields;
}

// --- Сервис-аккаунт: JWT → access token (без внешних библиотек) ----------

function fs_getAccessToken_() {
  var saJson = PropertiesService.getScriptProperties().getProperty('SERVICE_ACCOUNT_JSON');
  if (!saJson) throw new Error('Script Properties: задай SERVICE_ACCOUNT_JSON (см. инструкцию в шапке файла).');
  var sa = JSON.parse(saJson);

  var now = Math.floor(Date.now() / 1000);
  var header = fs_base64Url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claimSet = fs_base64Url_(
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
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true,
  });

  var body = JSON.parse(response.getContentText());
  if (!body.access_token) throw new Error('Не удалось получить access_token: ' + response.getContentText());
  return body.access_token;
}

function fs_base64Url_(str) {
  return Utilities.base64EncodeWebSafe(Utilities.newBlob(str).getBytes()).replace(/=+$/, '');
}
