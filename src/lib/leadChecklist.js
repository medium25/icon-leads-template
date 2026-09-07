/**
 * Чек-лист проверки кандидата — фиксированный список пунктов (задан
 * вручную, не редактируется из UI), оператор отмечает пройденные прямо на
 * карточке в стадиях «ФИЛЬТР»/«ИНТЕРВЬЮ ПО ТЕЛЕФОНУ» (`new`/`calling`).
 * Хранится на лид-документе как map `checklist.{key}: true` — отсутствие
 * ключа равносильно false, ничего не нужно инициализировать при создании.
 */
export const LEAD_CHECKLIST_ITEMS = [
  { key: 'item_1', label: 'Forma to‘liq to‘ldirilganmi?' },
  { key: 'item_2', label: 'Imloviy xatolar bormi? (Sh > w)' },
  { key: 'item_3', label: 'Savollarga aniq va tushunarli javob berganmi?' },
  { key: 'item_4', label: 'Ish tajribasi qanday?' },
  { key: 'item_5', label: 'Til bilish darajasi yetarlimi?' },
  { key: 'item_6', label: 'Nimalarga erishgan' },
];

/** Тревожные признаки кандидата — показываются под чек-листом (справочно, без отметок). */
export const CHECKLIST_RED_FLAGS = [
  'Noaniq va umumiy gaplar bilan to‘ldirilgan',
  'Hayot yutiqlari bo‘yicha konkret natija yo‘q',
  'Ish tajribasi beqaror (4-5 oy ichida ko‘p o‘zgarish)',
  'Haddan tashqari imloviy xatolar',
];

/** Хорошие признаки кандидата — показываются под чек-листом (справочно, без отметок). */
export const CHECKLIST_GREEN_FLAGS = [
  'Natijalari aniq va sonda yozilgan',
  'Kitob tanlash bo‘yicha yaxshi tushunchaga ega',
  '1 joyda kamida 1-2 yil ishlab tajriba orttirgan',
];

export function checklistCheckedCount(checklist) {
  if (!checklist) return 0;
  return LEAD_CHECKLIST_ITEMS.filter((item) => checklist[item.key]).length;
}

export function checklistPercent(checklist) {
  const checked = checklistCheckedCount(checklist);
  return Math.round((checked / LEAD_CHECKLIST_ITEMS.length) * 100);
}
