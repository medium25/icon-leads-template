// scripts/assign-all-leads.mjs
//
// Разовое массовое назначение: проставляет assignedOperator у ВСЕХ
// неархивных лидов филиала указанному оператору. Нужно, когда лиды
// пришли без ответственного (например, через appsscript/VacancyLeadsSync.gs,
// который намеренно оставляет assignedOperator: null) и назначать их по
// одному через карточку слишком долго.
//
// Запуск:
//   npm install --no-save firebase-admin
//   node scripts/assign-all-leads.mjs /путь/к/service-account.json <uid-оператора> [branchId]
//
// uid оператора — id его документа в Firestore (staff/{uid}), тот же,
// что виден в адресной строке Firestore Console на его документе.
// branchId по умолчанию "main".

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const [, , keyPath, operatorUid, branchId = 'main'] = process.argv;
if (!keyPath || !operatorUid) {
  console.error('Использование: node scripts/assign-all-leads.mjs /путь/к/service-account.json <uid-оператора> [branchId]');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const snap = await db.collection('students').where('branchId', '==', branchId).where('isArchived', '==', false).get();
console.log(`Найдено лидов в филиале "${branchId}": ${snap.size}`);

const CHUNK = 400;
const docs = snap.docs;
for (let i = 0; i < docs.length; i += CHUNK) {
  const batch = db.batch();
  for (const doc of docs.slice(i, i + CHUNK)) {
    batch.update(doc.ref, { assignedOperator: operatorUid, updatedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  console.log(`Обновлено: ${Math.min(i + CHUNK, docs.length)}/${docs.length}`);
}

console.log('Готово.');
