// appsscript/VacancyLeadsSync.gs
//
// Синк заявок на вакансии из таблицы "ICON VACATIONS" (лист "CALL CENTRE")
// в леды-борд — шлёт новые строки на functions/index.js (syncVacancyLead),
// который заводит их лидами в students/доске «Заявки».
//
// Это не деплоится этим репозиторием — Apps Script живёт в Google, файл
// тут только как источник правды. Настройка:
//
// 1. В таблице "ICON VACATIONS": Расширения → Apps Script.
// 2. Вставить содержимое этого файла (замените Code.gs целиком).
// 3. Настройки проекта (⚙ слева) → Script Properties → Add script property:
//      ENDPOINT_URL = https://<region>-<project>.cloudfunctions.net/syncVacancyLead
//      SYNC_SECRET  = <тот же секрет, что задан через
//                      `firebase functions:secrets:set VACANCY_SYNC_SECRET`>
// 4. В редакторе выбрать функцию installTrigger_ → Выполнить (один раз,
//    попросит доступ) — это заведёт триггер по расписанию (каждые 10 минут).
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

/**
 * Точка входа триггера — обрабатывает строки, добавленные с прошлого
 * запуска (PropertiesService.lastProcessedRow), шлёт их по одной на
 * syncVacancyLead и останавливается на первой ошибке (следующий запуск
 * повторит её и всё, что после — ничего не теряется).
 */
function syncNewLeads() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Лист "' + SHEET_NAME + '" не найден.');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var props = PropertiesService.getScriptProperties();
  var startRow = Number(props.getProperty('lastProcessedRow') || 1) + 1;
  if (startRow > lastRow) return; // новых строк нет

  var headerRow = sheet
    .getRange(1, ANSWER_COL_START, 1, ANSWER_COL_END - ANSWER_COL_START + 1)
    .getValues()[0];

  var numRows = lastRow - startRow + 1;
  var data = sheet.getRange(startRow, 1, numRows, ANSWER_COL_END).getValues();

  var endpoint = getEndpoint_();
  var secret = getSecret_();
  var processedThrough = startRow - 1;

  for (var i = 0; i < data.length; i++) {
    var ok = sendRow_(data[i], headerRow, endpoint, secret);
    if (!ok) break;
    processedThrough = startRow + i;
  }

  props.setProperty('lastProcessedRow', String(processedThrough));
}

/** @returns {boolean} true — принято (200/201) или строка пустая/невалидная (пропущена намеренно), false — реальная ошибка, нужно повторить. */
function sendRow_(row, headerRow, endpoint, secret) {
  var id = row[COL_ID - 1];
  if (!id) return true; // полностью пустая строка — пропускаем, не ошибка

  var answers = [];
  for (var c = ANSWER_COL_START; c <= ANSWER_COL_END; c++) {
    var answer = row[c - 1];
    if (answer === '' || answer === null || answer === undefined) continue;
    answers.push({ question: humanizeHeader_(headerRow[c - ANSWER_COL_START]), answer: String(answer) });
  }

  var createdTime = row[COL_CREATED - 1];
  var payload = {
    externalId: String(id),
    createdTime: createdTime instanceof Date ? createdTime.toISOString() : String(createdTime || ''),
    vacancyName: String(row[COL_VACANCY - 1] || ''),
    fullName: String(row[COL_NAME - 1] || ''),
    phone: String(row[COL_PHONE - 1] || ''),
    formAnswers: answers,
  };

  var response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-secret': secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  // 400 — невалидная строка (нет телефона и т.п., см. functions/index.js) —
  // такую не имеет смысла повторять, считаем «обработанной».
  if (code === 200 || code === 201 || code === 400) return true;

  Logger.log('syncVacancyLead: ошибка для id=' + id + ' — ' + code + ' ' + response.getContentText());
  return false;
}

/** "qaysi_ish_grafikimiz_sizga_mos?_" → "Qaysi ish grafikimiz sizga mos?" */
function humanizeHeader_(header) {
  var s = String(header || '')
    .trim()
    .replace(/^_+|_+$/g, '')
    .replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getEndpoint_() {
  var url = PropertiesService.getScriptProperties().getProperty('ENDPOINT_URL');
  if (!url) throw new Error('Script Properties: задай ENDPOINT_URL (см. инструкцию в шапке файла).');
  return url;
}

function getSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty('SYNC_SECRET');
  if (!secret) throw new Error('Script Properties: задай SYNC_SECRET (см. инструкцию в шапке файла).');
  return secret;
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
