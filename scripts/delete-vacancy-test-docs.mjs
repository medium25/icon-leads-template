// scripts/delete-vacancy-test-docs.mjs
//
// Разовая уборка: удаляет из students все документы с id, начинающимся на
// "vac_" (см. appsscript/VacancyLeadsSync.gs) — например, после
// перезаписи скрипта синка с исправленной раскладкой вопрос/ответ, чтобы
// не оставлять документы со старыми, неправильными данными.
//
// Запуск:
//   npm install --no-save firebase-admin
//   node scripts/delete-vacancy-test-docs.mjs /путь/к/service-account.json
//
// Тот же JSON-ключ сервис-аккаунта, что уже настроен для Apps Script
// (Script Properties → SERVICE_ACCOUNT_JSON).

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const keyPath = process.argv[2];
if (!keyPath) {
  console.error('Использование: node scripts/delete-vacancy-test-docs.mjs /путь/к/service-account.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const snap = await db.collection('students').get();
const toDelete = snap.docs.filter((doc) => doc.id.startsWith('vac_'));

console.log(`Найдено документов с префиксом "vac_": ${toDelete.length}`);

for (const doc of toDelete) {
  await doc.ref.delete();
  console.log('удалён:', doc.id);
}

console.log('Готово.');
