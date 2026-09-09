// src/components/leads/columns.js
/**
 * 7 стадий воронки продаж (2026-08-13-leads-funnel-redesign.md). Порядок —
 * порядок колонок слева направо на доске «Заявки». Перенос карточки между
 * стадиями свободный в любую сторону (см. moveLead в LeadsPage.jsx),
 * гейтов нет.
 */
export const COLUMNS = [
  {
    key: 'new',
    label: 'Новый лид',
    color: '#2F6FE4',
    hint: {
      summary: 'Лид только что создан, оператор назначен автоматически по очереди (round-robin).',
      steps: [
        'Позвоните как можно быстрее — SLA 15 минут в рабочее время (9:00–18:00). Красная рамка и значок ⚠ на карточке — дедлайн уже прошёл.',
        'После звонка нажмите первую точку под номером телефона и выберите «Успешно» или «Не успешно».',
        'Карточка сама переедет в «Дозвон» после первой отметки — переносить вручную не нужно.',
      ],
    },
  },
  {
    key: 'calling',
    label: 'Дозвон',
    color: '#E5842B',
    hint: {
      summary: 'До 5 попыток дозвона. Сюда карточка попадает автоматически после первой отметки в «Новый лид».',
      steps: [
        'Звоните по графику из подсказки под точками: 2 попытки сегодня, 2 завтра, 1 послезавтра.',
        'После каждого звонка отмечайте точку — «Успешно» или «Не успешно».',
        'Лид согласен на пробный → меню «⋮» → «Записать на пробный», укажите дату, время и учителя.',
        'Лид явно отказался → меню «⋮» → «Отказ», укажите причину.',
        'Если все 5 точек стали красными — карточка сама уходит в «Отказ» с причиной «Не дозвонились», ничего делать не нужно.',
      ],
    },
  },
  {
    key: 'trial_scheduled',
    label: 'Пробный назначен',
    color: '#D6336C',
    hint: {
      summary: 'Дата, время и учитель пробного урока зафиксированы — дождитесь дня занятия.',
      steps: [
        'Ученик не пришёл → кнопка «Не пришёл» откроет форму переноса, укажите новую дату. Карточка останется на этой стадии, счётчик переносов увеличится.',
        'Ученик пришёл и готов продолжать → создание студента теперь на отдельной странице «Пробные» (видна всем операторам). Как только там нажмут «Создать студента», карточка сама переедет в «Пробный проведён».',
      ],
    },
  },
  {
    key: 'trial_completed',
    label: 'Пробный проведён',
    color: '#0F9D8C',
    hint: {
      summary: 'Студент уже создан (страница «Пробные») — дождитесь оплаты или переведите вручную в «Дожим».',
      steps: [
        'Оплаты ещё не было → стрелка/drag в «Дожим», начнётся отсчёт касаний.',
        'Оплата уже пришла (редкий случай) → стрелка/drag сразу в «Оплачено».',
      ],
    },
  },
  {
    key: 'closing',
    label: 'Дожим',
    color: '#7C5CBF',
    hint: {
      summary: '3 обязательных касания, чтобы довести ученика до оплаты.',
      steps: [
        'Касание 1 — вечером в день пробного урока.',
        'Касание 2 — через 1 день после первого.',
        'Касание 3 — через 4 дня после второго (финальное предложение с дедлайном).',
        'После каждого звонка/сообщения нажимайте «Отметить касание» — счётчик и дата следующего касания обновятся.',
        'Ученик оплатил → оформите оплату на странице студента («Добавить оплату») — карточка сама переедет в «Оплачено».',
        'Явный отказ или все 3 касания без результата → меню «⋮» → «Отказ», укажите причину.',
      ],
    },
  },
  {
    key: 'won',
    label: 'Оплачено',
    color: '#34A853',
    hint: {
      summary: 'Финал воронки: лид стал студентом.',
      steps: [
        'Дальнейшая работа — со страницы студента: запись в группу, расписание, посещаемость. На доске «Заявки» делать больше нечего.',
        'Карточка видна в этой колонке 30 дней после оплаты, затем уходит с доски — сами данные при этом никуда не деваются.',
      ],
    },
  },
  {
    key: 'lost',
    label: 'Отказ',
    color: '#C0392B',
    hint: {
      summary: 'Финал воронки с отрицательным исходом.',
      steps: [
        'Причина фиксируется один раз в момент отказа и не редактируется с доски.',
        'Лиды с причиной «Не дозвонились» или «Не пришёл на пробный» старше 30 дней автоматически попадают в отчёт «Ремаркетинг» (Отчёты → Ремаркетинг) — их можно попробовать поднять повторно.',
        'Карточка видна в этой колонке 30 дней после отказа, затем уходит с доски — данные сохраняются.',
      ],
    },
  },
];

// Набор для выбора цвета колонки в редакторе стадий — специально не
// шаблонные Tailwind-токены проекта (те бледные, для фона/текста), а
// насыщенные, далеко разнесённые по тону цвета, чтобы 7 колонок подряд не
// сливались друг с другом.
export const STAGE_COLOR_SWATCHES = [
  '#2F6FE4', // синий
  '#E5842B', // оранжевый
  '#D6336C', // малиновый
  '#0F9D8C', // бирюзовый
  '#7C5CBF', // фиолетовый
  '#34A853', // зелёный
  '#C0392B', // красный
  '#D4A017', // янтарный
  '#0891B2', // голубой
  '#4B5563', // графитовый
];

/**
 * Первая колонка — вход воронки (кнопка «+», авто-назначение оператора,
 * авто-переход new→calling при первой отметке звонка). Её позицию менять
 * нельзя: всегда слева, всегда стартовая стадия.
 */
export const PINNED_FIRST_STAGE = 'new';

/** Ключи встроенных стадий — их код знает «в лицо» (спец-рендер, дедлайны, воронка). */
export const BUILTIN_STAGE_KEYS = COLUMNS.map((c) => c.key);

/** Потолок общего числа колонок (Firestore `in`-запрос по funnelStage — до 30 значений). */
export const MAX_STAGES = 20;

/** Свежий ключ кастомной стадии — `custom_` + рандом, не пересекается со встроенными. */
export function makeCustomStageKey() {
  return `custom_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

/**
 * Кастомная стадия из настроек → форма колонки (как во встроенном COLUMNS,
 * но без `hint` и спец-поведения). Невалидные записи отсеиваются.
 * @param {Array<{key: string, label: string, color?: string, attemptSlots?: number, appointment?: boolean}>} [customStages]
 * @returns {Array<{key: string, label: string, color: string, custom: true, attemptSlots?: number, appointment?: boolean}>}
 */
export function customColumns(customStages) {
  if (!Array.isArray(customStages)) return [];
  return customStages
    .filter((s) => s && typeof s.key === 'string' && s.key.startsWith('custom_') && typeof s.label === 'string')
    .map((s) => ({
      key: s.key,
      label: s.label,
      color: s.color || '#4B5563',
      custom: true,
      ...(Number.isFinite(s.attemptSlots) ? { attemptSlots: s.attemptSlots } : {}),
      ...(s.appointment ? { appointment: true } : {}),
    }));
}

/**
 * Требует ли колонка записи на день и время (настройка стадии
 * `appointment`) — при переводе карточки в такую колонку открывается окно
 * выбора дня и времени (тест / стажировка / общение и т.п.), а дата пишется
 * в `students.appointmentAt` и показывается на карточке. Запись
 * необязательна: окно можно пропустить и назначить позже.
 * @param {{appointment?: boolean}} [column]
 * @returns {boolean}
 */
export function columnRequiresAppointment(column) {
  return Boolean(column?.appointment);
}

/** Верхний предел кружочков-попыток на карточке (настройка колонки). */
export const MAX_ATTEMPT_SLOTS = 12;

// Сколько кружочков-попыток дозвона на карточке по умолчанию (пока в
// настройках колонки не задано `attemptSlots`). Только new/calling — это
// «звонковые» стадии; на остальных кружочков нет, пока их явно не включат.
const DEFAULT_ATTEMPT_SLOTS = { new: 5, calling: 5 };

/**
 * Сколько кружочков-попыток показывать на карточках этой колонки:
 * `attemptSlots` из настроек колонки, иначе дефолт по ключу стадии.
 * @param {{key: string, attemptSlots?: number}} column
 * @returns {number} 0 — кружочков нет
 */
export function resolveAttemptSlots(column) {
  const raw = column?.attemptSlots;
  if (Number.isFinite(raw)) return Math.max(0, Math.min(MAX_ATTEMPT_SLOTS, Math.round(raw)));
  return DEFAULT_ATTEMPT_SLOTS[column?.key] ?? 0;
}

/**
 * Применяет пользовательские правки названия/цвета/кружочков стадии (см.
 * `settings/{branchId}.leadStageOverrides`, двойной клик по заголовку)
 * поверх набора колонок. Ключ стадии неизменен (на него завязаны
 * `stageDeadline` и спец-рендер `trial_scheduled`/`won`/`lost`). Порядок и
 * состав задаются отдельно, см. `resolveColumns`.
 * @param {Array<{key: string}>} cols
 * @param {Record<string, {label?: string, color?: string, attemptSlots?: number}>} [overrides]
 * @returns {Array<{key: string}>}
 */
export function withStageOverrides(cols, overrides) {
  if (!overrides) return cols;
  return cols.map((c) => (overrides[c.key] ? { ...c, ...overrides[c.key] } : c));
}

/**
 * Колонки доски в порядке отображения: встроенные + кастомные
 * (`customStages`), минус скрытые (`hiddenStages`, `new` не скрывается
 * никогда), плюс правки label/color/attemptSlots (`leadStageOverrides`),
 * плюс порядок (`leadStageOrder` — массив ключей). Неизвестные ключи в
 * порядке игнорируются, недостающие дописываются в хвост. `new` всегда
 * первым (см. PINNED_FIRST_STAGE).
 * @param {Object} [settings] документ settings/{branchId}
 * @param {Record<string, Object>} [settings.leadStageOverrides]
 * @param {string[]} [settings.leadStageOrder]
 * @param {Array<Object>} [settings.customStages]
 * @param {string[]} [settings.hiddenStages]
 * @returns {Array<{key: string, label: string, color: string, custom?: boolean}>}
 */
export function resolveColumns(settings) {
  const s = settings ?? {};
  const hidden = new Set((s.hiddenStages ?? []).filter((k) => k !== PINNED_FIRST_STAGE));
  let cols = [...COLUMNS, ...customColumns(s.customStages)].filter((c) => !hidden.has(c.key));
  cols = withStageOverrides(cols, s.leadStageOverrides);

  const order = s.leadStageOrder;
  if (order?.length) {
    const byKey = new Map(cols.map((c) => [c.key, c]));
    const seen = new Set();
    const result = [];
    for (const key of order) {
      const col = byKey.get(key);
      if (col && !seen.has(key)) {
        result.push(col);
        seen.add(key);
      }
    }
    for (const col of cols) if (!seen.has(col.key)) result.push(col);
    cols = result;
  }

  const firstIdx = cols.findIndex((c) => c.key === PINNED_FIRST_STAGE);
  if (firstIdx > 0) cols.unshift(cols.splice(firstIdx, 1)[0]);
  return cols;
}

/**
 * Новый порядок ключей после перетаскивания колонки `draggedKey` на место
 * колонки `targetKey`. `new` не двигается и на его место ничего не встаёт.
 * Вставка «куда указал»: тащишь вправо — встаёт после target, влево — перед.
 * @param {string[]} currentKeys текущий порядок (все ключи стадий)
 * @param {string} draggedKey
 * @param {string} targetKey
 * @returns {string[]} новый порядок (та же длина); тот же массив, если ход невозможен
 */
export function reorderStageKeys(currentKeys, draggedKey, targetKey) {
  if (draggedKey === targetKey || draggedKey === PINNED_FIRST_STAGE || targetKey === PINNED_FIRST_STAGE) {
    return currentKeys;
  }
  const from = currentKeys.indexOf(draggedKey);
  const to = currentKeys.indexOf(targetKey);
  if (from < 0 || to < 0) return currentKeys;

  const keys = [...currentKeys];
  keys.splice(from, 1);
  const targetIdx = keys.indexOf(targetKey);
  keys.splice(from < to ? targetIdx + 1 : targetIdx, 0, draggedKey);
  return keys;
}

/**
 * Ключ колонки, в которой рендерится лид. Дефолт 'new' — для лидов без
 * funnelStage (до миграции) и для тех, чья стадия сейчас не показывается на
 * доске (скрыта или кастомная стадия удалена) — иначе карточка потерялась
 * бы. `knownKeys` — ключи колонок, реально присутствующих на доске (из
 * `resolveColumns`); без него проверяются только встроенные.
 * @param {Object} lead
 * @param {string[]} [knownKeys]
 * @returns {string}
 */
export function columnKeyOf(lead, knownKeys) {
  const keys = knownKeys ?? BUILTIN_STAGE_KEYS;
  return keys.includes(lead.funnelStage) ? lead.funnelStage : 'new';
}
