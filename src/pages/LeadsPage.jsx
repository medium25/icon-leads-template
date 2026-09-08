// src/pages/LeadsPage.jsx
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { collection, doc, query, where, orderBy, onSnapshot, updateDoc, setDoc, writeBatch, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useDoc } from '../hooks/useDoc.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../components/ui/Toast.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { DeclineLeadModal } from '../components/students/DeclineLeadModal.jsx';
import { ResetLeadModal } from '../components/leads/ResetLeadModal.jsx';
import { DismissFromBoardModal } from '../components/leads/DismissFromBoardModal.jsx';
import { DeleteLeadModal } from '../components/students/DeleteLeadModal.jsx';
import { TrialFormModal } from '../components/leads/TrialFormModal.jsx';
import { GroupBookingModal } from '../components/leads/GroupBookingModal.jsx';
import { LeadColumn } from '../components/leads/LeadColumn.jsx';
import { DropdownMenu } from '../components/ui/DropdownMenu.jsx';
import {
  columnKeyOf,
  resolveColumns,
  reorderStageKeys,
  resolveAttemptSlots,
  customColumns,
  makeCustomStageKey,
  BUILTIN_STAGE_KEYS,
  MAX_STAGES,
  PINNED_FIRST_STAGE,
} from '../components/leads/columns.js';
import { advanceStage, nextCallDueAt, secondTouchDueAt, unreachableCallDueAt } from '../lib/leadFunnel.js';
import { playNewLeadChime } from '../lib/notificationSound.js';

/**
 * Заявки — 7-стадийная воронка продаж (2026-08-13-leads-funnel-redesign.md).
 * Перенос между стадиями — свободный в любую сторону (drag-n-drop или кнопка
 * «→»), без гейтов и авто-инициализации полей стадии. Единственное
 * исключение — «Отказ»: открывается окно с обязательной причиной. Клик по
 * карточке — на `/students/:id`.
 */
export function LeadsPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const { user, staff } = useAuth();
  // Ceo/manager видят все заявки филиала по умолчанию, с кнопкой
  // переключения на «только мои»; остальные роли (admin/teacher) всегда
  // видят только назначенные лично им — без кнопки, переключать нечего.
  const canSeeAllLeads = staff?.role === 'ceo' || staff?.role === 'manager';
  // 'all' | 'mine' | <operator uid> — третий режим (конкретный оператор)
  // доступен только ceo/manager, чтобы посмотреть доску глазами одного
  // человека без переключения аккаунта.
  const [operatorFilter, setOperatorFilter] = useState('all');

  // Тёмная тема — только для этой страницы: класс dark ставится на <html>
  // (не на локальный div), чтобы порталы (DropdownMenu/Modal — рендерятся
  // в document.body, вне DOM-поддерева страницы) тоже подхватывали
  // переменные палитры. Снимается при уходе со страницы или выключении —
  // остальной CRM тёмную тему не видит вообще.
  const [darkTheme, setDarkTheme] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkTheme);
    return () => document.documentElement.classList.remove('dark');
  }, [darkTheme]);

  // Форс-перерисовка раз в минуту — иначе просроченный SLA-бейдж не
  // появится сам по себе (Firestore не «уведомляет» о течении времени).
  const [, forceTick] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(forceTick, 60_000);
    return () => clearInterval(id);
  }, []);

  const branchSettingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: branchSettings } = useDoc(branchSettingsRef);

  // Все ключи стадий, по которым может стоять лид — встроенные + кастомные
  // (даже скрытые: карточка в только что скрытой стадии всё равно должна
  // загрузиться, чтобы columnKeyOf увёл её в 'new', а не потерял).
  const allStageKeys = useMemo(
    () => [...BUILTIN_STAGE_KEYS, ...customColumns(branchSettings?.customStages).map((c) => c.key)].slice(0, 30),
    [branchSettings],
  );

  const leadsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('isArchived', '==', false),
            where('funnelStage', 'in', allStageKeys),
            orderBy('createdAt', 'desc'),
          )
        : null,
    [activeBranchId, allStageKeys],
  );
  const { data: allLeads } = useCollection(leadsQuery);

  // Звук нового лида — играет только тем, у кого сейчас открыта эта
  // страница, при появлении лида в «Новый лид» (вручную или из синка
  // Sheets). Отдельная подписка на тот же query, а не хук useCollection —
  // нужны сырые docChanges, а не готовый список; на первом снапшоте
  // (загрузка уже существующих лидов) звук не играет, только на реальных
  // «added» после него.
  const isFirstLeadsSnapshot = useRef(true);
  useEffect(() => {
    if (!leadsQuery) return;
    isFirstLeadsSnapshot.current = true;
    return onSnapshot(leadsQuery, (snap) => {
      if (isFirstLeadsSnapshot.current) {
        isFirstLeadsSnapshot.current = false;
        return;
      }
      const hasNewLead = snap.docChanges().some((c) => c.type === 'added' && c.doc.data().funnelStage === 'new');
      if (hasNewLead) playNewLeadChime();
    });
  }, [leadsQuery]);

  // Состав/название/цвет/порядок колонок хранятся per-branch в
  // settings/{branchId} (leadStageOverrides / leadStageOrder / customStages /
  // hiddenStages), не в COLUMNS: ключ встроенной стадии неизменен (на него
  // завязаны stageDeadline/markAttempt и спец-рендер), правится только
  // отображение, состав и порядок колонок слева направо.
  const resolvedColumns = useMemo(() => resolveColumns(branchSettings), [branchSettings]);
  const orderedKeys = useMemo(() => resolvedColumns.map((c) => c.key), [resolvedColumns]);
  const customStages = useMemo(() => customColumns(branchSettings?.customStages), [branchSettings]);
  const hiddenColumns = useMemo(() => {
    const hiddenKeys = new Set((branchSettings?.hiddenStages ?? []).filter((k) => k !== PINNED_FIRST_STAGE));
    if (hiddenKeys.size === 0) return [];
    return resolveColumns({ ...branchSettings, hiddenStages: [] }).filter((c) => hiddenKeys.has(c.key));
  }, [branchSettings]);
  // Число кружочков-попыток по стадии (настройка колонки attemptSlots).
  const attemptSlotsByKey = useMemo(
    () => Object.fromEntries(resolvedColumns.map((c) => [c.key, resolveAttemptSlots(c)])),
    [resolvedColumns],
  );

  const editStageColumn = (stageKey, patch) => {
    if (!branchSettingsRef) return;
    // set+merge, не update — settings/{branchId} может ещё не существовать
    // (создаётся лениво при первом сохранении любой из его настроек), а
    // merge на вложенный объект сохраняет overrides остальных стадий как есть.
    if (customStages.some((s) => s.key === stageKey)) {
      // У кастомной стадии label/color/attemptSlots живут в самой записи
      // customStages, не в leadStageOverrides — правим массив.
      const next = customStages.map((s) => (s.key === stageKey ? { ...s, ...patch } : s));
      setDoc(branchSettingsRef, { customStages: next }, { merge: true }).catch(() =>
        showToast('Не удалось сохранить стадию.', { type: 'error' }),
      );
      return;
    }
    setDoc(branchSettingsRef, { leadStageOverrides: { [stageKey]: patch } }, { merge: true }).catch(() =>
      showToast('Не удалось сохранить стадию.', { type: 'error' }),
    );
  };

  const reorderStage = (draggedKey, targetKey) => {
    if (!branchSettingsRef) return;
    const next = reorderStageKeys(orderedKeys, draggedKey, targetKey);
    if (next === orderedKeys) return;
    setDoc(branchSettingsRef, { leadStageOrder: next }, { merge: true }).catch(() =>
      showToast('Не удалось сохранить порядок колонок.', { type: 'error' }),
    );
  };

  // Добавить кастомную колонку слева/справа от колонки `anchorKey` (из её
  // поповера редактирования). Никогда не встаёт левее `new` (вход воронки).
  const addStage = (anchorKey, side) => {
    if (!branchSettingsRef) return;
    if (resolvedColumns.length >= MAX_STAGES) {
      showToast(`Максимум ${MAX_STAGES} колонок.`, { type: 'error' });
      return;
    }
    const key = makeCustomStageKey();
    const order = [...orderedKeys];
    const anchorIdx = order.indexOf(anchorKey);
    let insertAt = anchorIdx < 0 ? order.length : side === 'left' ? anchorIdx : anchorIdx + 1;
    if (insertAt < 1) insertAt = 1;
    order.splice(insertAt, 0, key);
    setDoc(
      branchSettingsRef,
      { customStages: [...customStages, { key, label: 'Новая стадия', color: '#4B5563', attemptSlots: 0 }], leadStageOrder: order },
      { merge: true },
    ).catch(() => showToast('Не удалось добавить колонку.', { type: 'error' }));
  };

  // Удаление (кастомная) / скрытие (встроенная) колонки — только если в ней
  // нет карточек. Проверку пустоты делает вызывающая сторона (LeadColumn),
  // тут страховка на гонку.
  const removeStage = (stageKey) => {
    if (!branchSettingsRef || stageKey === PINNED_FIRST_STAGE) return;
    if ((byColumn[stageKey]?.length ?? 0) > 0) {
      showToast('В колонке есть карточки — сначала перенеси их.', { type: 'error' });
      return;
    }
    const isCustom = customStages.some((s) => s.key === stageKey);
    if (isCustom) {
      updateDoc(branchSettingsRef, {
        customStages: customStages.filter((s) => s.key !== stageKey),
        leadStageOrder: orderedKeys.filter((k) => k !== stageKey),
        [`leadStageOverrides.${stageKey}`]: deleteField(),
      }).catch(() => showToast('Не удалось удалить колонку.', { type: 'error' }));
      return;
    }
    setDoc(
      branchSettingsRef,
      { hiddenStages: [...new Set([...(branchSettings?.hiddenStages ?? []), stageKey])] },
      { merge: true },
    ).catch(() => showToast('Не удалось скрыть колонку.', { type: 'error' }));
  };

  const unhideStage = (stageKey) => {
    if (!branchSettingsRef) return;
    setDoc(
      branchSettingsRef,
      { hiddenStages: (branchSettings?.hiddenStages ?? []).filter((k) => k !== stageKey) },
      { merge: true },
    ).catch(() => showToast('Не удалось вернуть колонку.', { type: 'error' }));
  };

  // won/lost раньше скрывались за пределами текущего календарного месяца
  // (чтобы терминальные колонки не росли бесконечно) — теперь вместо
  // скрытия видны все месяцы сразу, но сгруппированы сворачиваемыми
  // секциями по месяцам (groupLeadsByMonth в LeadColumn.jsx), открыт по
  // умолчанию только текущий. Документ никуда не девается, просто рендер
  // был/остаётся под контролем — раньше через фильтр, теперь через collapse.
  // boardHiddenAt — то же самое, но вручную и раньше конца месяца
  // («Оплачено» — крестик на карточке, см. onDismissFromBoard).
  // 'mine' и не-ceo/manager — свой uid; иначе конкретный uid оператора, если
  // выбран из списка; 'all' (только для ceo/manager) — без ограничения.
  const scopedOperatorUid = !canSeeAllLeads
    ? user.uid
    : operatorFilter === 'mine'
      ? user.uid
      : operatorFilter === 'all'
        ? null
        : operatorFilter;

  const leads = useMemo(() => {
    return allLeads.filter((l) => {
      if (scopedOperatorUid && l.assignedOperator !== scopedOperatorUid) return false;
      if (l.boardHiddenAt) return false;
      return true;
    });
  }, [allLeads, scopedOperatorUid]);

  const staffQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId)) : null),
    [activeBranchId],
  );
  const { data: staffList } = useCollection(staffQuery);

  const operatorByUid = useMemo(() => {
    const map = new Map();
    for (const s of staffList) map.set(s.id, { color: s.color, name: s.fullName });
    return map;
  }, [staffList]);

  // Операторы для выпадающего списка «Оператор» (см. панель фильтра ниже) —
  // роль 'admin' в этом кодовой базе и есть call-center оператор (см.
  // src/lib/roles.js), ceo/manager сами лиды не ведут.
  const operatorOptions = useMemo(
    () => staffList.filter((s) => s.role === 'admin').sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [staffList],
  );

  const [formLead, setFormLead] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [trialTarget, setTrialTarget] = useState(null); // { lead, mode: 'schedule'|'reschedule' }
  const [bookingTarget, setBookingTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [dismissTarget, setDismissTarget] = useState(null);

  const byColumn = useMemo(() => {
    const map = {};
    for (const c of resolvedColumns) map[c.key] = [];
    for (const lead of leads) {
      const key = columnKeyOf(lead, orderedKeys);
      (map[key] ??= []).push(lead);
    }
    // «Пробный назначен» — ближайший пробный первым, «Дозвон» — ближайший
    // дедлайн следующего звонка первым, а не по дате создания лида (порядок
    // остальных колонок), чтобы срочное было видно сразу.
    map.trial_scheduled?.sort((a, b) => (a.trialDate?.seconds ?? Infinity) - (b.trialDate?.seconds ?? Infinity));
    map.calling?.sort((a, b) => (a.nextCallDueAt?.seconds ?? Infinity) - (b.nextCallDueAt?.seconds ?? Infinity));
    return map;
  }, [leads, resolvedColumns, orderedKeys]);

  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const patch = async (lead, data, okMessage) => {
    try {
      await updateDoc(doc(db, 'students', lead.id), { ...data, updatedAt: serverTimestamp() });
      if (okMessage) showToast(okMessage);
    } catch {
      showToast('Не удалось обновить лид.', { type: 'error' });
    }
  };

  /**
   * Пишет саму попытку звонка (callLogs + students.callAttempts) и дедлайн
   * следующего звонка (dueDate — вычислен автоматически). Стадию лида не
   * трогает — перевод между колонками только вручную.
   */
  const commitCallAttempt = async (lead, nextAttempts, result, { dueDate = null } = {}) => {
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'callLogs')), {
        studentId: lead.id,
        direction: 'out',
        result: result === 'success' ? 'reached' : 'no_answer',
        comment: '',
        durationSec: 0,
        quickMark: true,
        userId: user.uid,
        userName: staff?.fullName ?? '',
        createdAt: serverTimestamp(),
      });
      // serverTimestamp() внутри элемента массива не поддерживается Firestore —
      // callAttempts.at использует клиентское время, updatedAt документа ниже —
      // уже верхнеуровневое поле, ему можно.
      batch.update(doc(db, 'students', lead.id), {
        callAttempts: nextAttempts,
        nextCallDueAt: dueDate,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch {
      showToast('Не удалось отметить попытку.', { type: 'error' });
    }
  };

  // Отметка попытки дозвона (кружочки на карточке). Без модалок и без смены
  // стадии — только запись попытки и дедлайн следующего звонка.
  const markAttempt = (lead, result) => {
    const stageKey = columnKeyOf(lead, orderedKeys);
    const slots = attemptSlotsByKey[stageKey] ?? 0;
    const attempts = lead.callAttempts ?? [];
    if (slots === 0 || attempts.length >= slots) return;
    const nextAttempts = [...attempts, { result, at: new Date(), expectedBy: lead.nextCallDueAt ?? null }];

    // Нестандартные стадии (не new/calling): кружочки — просто счётчик
    // попыток с историей, без дедлайна.
    if (stageKey !== 'new' && stageKey !== 'calling') {
      patch(lead, { callAttempts: nextAttempts });
      return;
    }
    commitCallAttempt(lead, nextAttempts, result, { dueDate: nextCallDueAt(nextAttempts, slots) });
  };

  // Перенос карточки между колонками (стрелка «→» / drag). Никаких модалок,
  // гейтов и авто-инициализации полей стадии — только смена funnelStage в
  // любую сторону. Единственное исключение — «Отказ»: открывается окно с
  // обязательной причиной.
  const moveLead = (lead, stageKey) => {
    const fromKey = columnKeyOf(lead, orderedKeys);
    if (fromKey === stageKey) return;
    if (stageKey === 'lost') {
      setDeclineTarget(lead); // окно с причиной отказа
      return;
    }
    advanceStage(db, lead, stageKey, {}, user).catch(() => showToast('Не удалось обновить лид.', { type: 'error' }));
  };

  // Дожим — 2 касания. Дедлайн следующего касания вычисляется и пишется
  // автоматически, без модалки.
  const markTouch = (lead) => {
    const nextNumber = (lead.closingTouchNumber ?? 0) + 1;
    const isFinal = nextNumber >= 2;
    const nextLog = [...(lead.closingTouchLog ?? []), { at: new Date(), expectedBy: lead.nextTouchAt ?? null }];
    patch(
      lead,
      {
        closingTouchNumber: nextNumber,
        nextTouchAt: isFinal ? null : secondTouchDueAt(lead.trialDate?.toDate?.()),
        unreachableAttempts: [],
        closingTouchLog: nextLog,
      },
      `Касание ${nextNumber} отмечено.`,
    );
  };

  // «Не выходит на связь» — до 3 попыток на «Пробном» и в «Дожиме». Дедлайн
  // следующего звонка/касания вычисляется автоматически, без модалки.
  const markUnreachable = (lead, result) => {
    const expectedBy = (lead.funnelStage === 'closing' ? lead.nextTouchAt : lead.unreachableNextCallDueAt) ?? null;
    const attempts = [...(lead.unreachableAttempts ?? []), { result, at: new Date(), expectedBy }];
    const attemptsExhausted = attempts.length >= 3;

    if (lead.funnelStage === 'closing') {
      patch(lead, { unreachableAttempts: attempts, nextTouchAt: attemptsExhausted ? null : unreachableCallDueAt() });
      return;
    }
    patch(lead, {
      unreachableAttempts: attempts,
      unreachableNextCallDueAt: result === 'reschedule' || attemptsExhausted ? null : unreachableCallDueAt(),
    });
  };

  const openAddForm = () => setFormLead({});

  const handleCreated = () => {
    // новый лид уже создан с funnelStage:'new' в StudentFormModal — писать
    // здесь больше нечего, доска подхватит его через onSnapshot.
  };

  const cardActions = {
    onOpen: (lead) => navigate(`/students/${lead.id}`),
    onEdit: (lead) => setFormLead(lead),
    onDecline: (lead) => setDeclineTarget(lead),
    onDelete: (lead) => setDeleteTarget(lead),
    onResetToNew: (lead) => setResetTarget(lead),
    onRescheduleTrial: (lead) => setTrialTarget({ lead, mode: 'reschedule' }),
    onOpenBooking: (lead) => setBookingTarget(lead),
    // Только «Оплачено» — убирает карточку с доски, студент остаётся в
    // системе (просто не рендерится больше в этом списке, см. leads выше).
    // По паролю (см. DismissFromBoardModal), чтобы не улетало случайным кликом.
    onDismissFromBoard: (lead) => setDismissTarget(lead),
    onMarkTouch: markTouch,
    onMove: moveLead,
    onMarkAttempt: markAttempt,
    onMarkUnreachable: markUnreachable,
    onToggleCallReminder: (lead, checked) => patch(lead, { callReminderDone: checked }),
  };

  return (
    <div>
      {/* fixed в угол экрана — не участвует в потоке страницы (колонки
          начинаются сразу сверху) и не переезжает поверх шапок колонок при
          горизонтальном скролле доски, в отличие от absolute сверху. Одна
          кнопка на весь фильтр (не 3 сегмента) — открывает меню со всеми
          вариантами разом (Все/Только мои/каждый оператор); тема — рядом. */}
      <div className="fixed bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-surface-alt p-1 shadow-hover">
        {canSeeAllLeads && (
          <DropdownMenu
            items={[
              { label: 'Все', onClick: () => setOperatorFilter('all') },
              { label: 'Только мои', onClick: () => setOperatorFilter('mine') },
              ...operatorOptions.map((op) => ({ label: op.fullName, onClick: () => setOperatorFilter(op.id) })),
            ]}
            trigger={({ ref, toggle }) => (
              <button
                ref={ref}
                type="button"
                onClick={toggle}
                className="rounded-full bg-navy px-3 py-1.5 text-[13px] text-white"
              >
                {operatorFilter === 'all'
                  ? 'Все'
                  : operatorFilter === 'mine'
                    ? 'Только мои'
                    : (operatorOptions.find((op) => op.id === operatorFilter)?.fullName ?? 'Все')}
                {' ▾'}
              </button>
            )}
          />
        )}
        {hiddenColumns.length > 0 && (
          <DropdownMenu
            items={hiddenColumns.map((c) => ({ label: `Вернуть: ${c.label}`, onClick: () => unhideStage(c.key) }))}
            trigger={({ ref, toggle }) => (
              <button
                ref={ref}
                type="button"
                onClick={toggle}
                className="rounded-full bg-surface px-3 py-1.5 text-[13px] text-muted hover:text-text"
              >
                {`Скрытые (${hiddenColumns.length}) ▾`}
              </button>
            )}
          />
        )}
        <button
          type="button"
          onClick={() => setDarkTheme((v) => !v)}
          aria-label={darkTheme ? 'Светлая тема' : 'Тёмная тема'}
          title={darkTheme ? 'Светлая тема' : 'Тёмная тема'}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-text"
        >
          {darkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {resolvedColumns.map((column) => (
          <LeadColumn
            key={column.key}
            column={column}
            leads={byColumn[column.key] ?? []}
            operatorByUid={operatorByUid}
            onAdd={column.key === 'new' ? openAddForm : undefined}
            onEditColumn={editStageColumn}
            onReorderStage={reorderStage}
            onRemoveStage={column.key === PINNED_FIRST_STAGE ? undefined : removeStage}
            onAddStage={addStage}
            columnEmpty={(byColumn[column.key]?.length ?? 0) === 0}
            columns={resolvedColumns}
            onDropLead={(leadId, columnKey) => {
              const lead = leadsById.get(leadId);
              if (lead) moveLead(lead, columnKey);
            }}
            {...cardActions}
          />
        ))}
      </div>

      <StudentFormModal student={formLead} onClose={() => setFormLead(null)} onCreated={handleCreated} />
      <DeclineLeadModal lead={declineTarget} onClose={() => setDeclineTarget(null)} />
      <DeleteLeadModal lead={deleteTarget} onClose={() => setDeleteTarget(null)} />
      <ResetLeadModal lead={resetTarget} onClose={() => setResetTarget(null)} />
      <DismissFromBoardModal lead={dismissTarget} onClose={() => setDismissTarget(null)} />
      <TrialFormModal target={trialTarget} timeSlots={branchSettings?.trialTimeSlots} onClose={() => setTrialTarget(null)} />
      <GroupBookingModal lead={bookingTarget} allLeads={allLeads} onClose={() => setBookingTarget(null)} />
    </div>
  );
}
