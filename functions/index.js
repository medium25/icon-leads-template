// functions/index.js
//
// Принимает вебхуки от appsscript/VacancyLeadsSync.gs (Apps Script, привязан
// к гугл-таблице "ICON VACATIONS" → лист "CALL CENTRE") и заводит каждую
// заявку на вакансию лидом в той же коллекции students/доске «Заявки», что
// и обычные лиды на курсы — просто с доп. полями vacancyName/formAnswers
// (см. src/components/leads/LeadCard.jsx).
//
// Деплой: firebase deploy --only functions (см. functions/README.md).

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Секрет проверяет, что запрос пришёл от нашего Apps Script, а не от кого
// попало из интернета (эндпоинт публичный). Задать значение:
//   firebase functions:secrets:set VACANCY_SYNC_SECRET
// Тот же секрет прописывается в Script Properties Apps Script (см. .gs).
const SYNC_SECRET = defineSecret('VACANCY_SYNC_SECRET');

// В таблице нет столбца с филиалом — все заявки на вакансии падают в один
// филиал. Поменяй под реальный branchId, если он другой.
const DEFAULT_BRANCH_ID = 'main';

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

// Номера в форме приходят вперемешку: с "+998", без кода страны (9 цифр),
// с пробелами/дефисами — приводим к единому формату "998" + 9 цифр, как
// везде в приложении (см. src/lib/auth.js, src/pages/LoginPage.jsx).
function normalizePhone(raw) {
  const digits = digitsOnly(raw);
  return digits.length === 9 ? `998${digits}` : digits;
}

exports.syncVacancyLead = onRequest({ secrets: [SYNC_SECRET] }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  if (req.get('x-sync-secret') !== SYNC_SECRET.value()) {
    res.status(401).send('Unauthorized');
    return;
  }

  const { externalId, fullName, phone, vacancyName, createdTime, formAnswers } = req.body ?? {};
  const trimmedName = String(fullName ?? '').trim();
  const phoneDigits = normalizePhone(phone);

  // Тестовая/пустая строка формы (Meta иногда кладёт такую в лист как
  // образец) отсеивается тут же — без цифр в номере это не лид.
  if (!externalId || !trimmedName || phoneDigits.length < 9) {
    res.status(400).send('Missing or invalid externalId/fullName/phone');
    return;
  }

  // Детерминированный id из внешнего id лида (Meta lead id, столбец A) —
  // повторная доставка того же вебхука (Apps Script перезапустился, ретрай)
  // не создаст вторую карточку, увидит существующий документ и остановится
  // на нём же, ничего не переписывая (см. ветку exists ниже).
  const docId = `vac_${String(externalId).replace(/[^a-zA-Z0-9]/g, '')}`;
  const docRef = db.collection('students').doc(docId);

  const existing = await docRef.get();
  if (existing.exists) {
    // Лид уже заведён раньше — не трогаем: он мог уже уйти по воронке
    // дальше «Нового лида», перезаписывать funnelStage нельзя.
    res.status(200).send('Already exists, skipped');
    return;
  }

  const createdAt = createdTime ? new Date(createdTime) : new Date();
  const createdAtTimestamp = admin.firestore.Timestamp.fromDate(
    Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
  );

  await docRef.set({
    fullName: trimmedName,
    phone: phoneDigits,
    phone2: null,
    branchId: DEFAULT_BRANCH_ID,
    vacancyName: vacancyName || null,
    formAnswers: Array.isArray(formAnswers) ? formAnswers : [],
    source: 'vacancy_form',
    status: 'lead',
    statusReason: null,
    funnelStage: 'new',
    // Ответственного не назначаем автоматически — see Настройки →
    // «Назначение ответственных», либо оператор берёт лида себе вручную
    // при редактировании карточки.
    assignedOperator: null,
    stageHistory: [{ stage: 'new', enteredAt: createdAtTimestamp }],
    balance: 0,
    balanceUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    note: '',
    isFlagged: false,
    activeGroupsCount: 0,
    firstPaymentAt: null,
    lastPaymentAt: null,
    trialAt: null,
    leftAt: null,
    createdAt: createdAtTimestamp,
    createdBy: 'vacancy_sync',
    isArchived: false,
  });

  res.status(201).send('Created');
});
