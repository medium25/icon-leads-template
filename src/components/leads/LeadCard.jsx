import { useMemo, useState } from 'react';
import { collection, addDoc, doc, updateDoc, increment, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, XCircle, Circle, Snowflake, ArrowRight, MessageSquare, ListChecks, X, CalendarClock } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { COLUMNS, resolveAttemptSlots, columnRequiresAppointment } from './columns.js';
import { isPriorityLead, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { formatPhone, formatDateTime, formatDateTimeShort, formatRelativeDeadline, formatSource } from '../../lib/format.js';
import { LEAD_CHECKLIST_ITEMS, CHECKLIST_RED_FLAGS, CHECKLIST_GREEN_FLAGS, checklistCheckedCount, checklistPercent } from '../../lib/leadChecklist.js';

/**
 * Компактная лента комментариев лида, разворачивается прямо в карточке.
 * Та же коллекция `comments` (entityType/entityId), что и CommentsTab у
 * студента/группы, но своя вёрстка — под тесную карточку в канбане, ввод
 * одной строкой («командная строка»), без textarea и большой кнопки.
 */
export function LeadCommentsPanel({ leadId }) {
  const { user, staff } = useAuth();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const commentsQuery = useMemo(
    () =>
      db
        ? query(collection(db, 'comments'), where('entityType', '==', 'lead'), where('entityId', '==', leadId), orderBy('createdAt', 'desc'))
        : null,
    [leadId],
  );
  const { data: comments, loading } = useCollection(commentsQuery);

  const submit = async () => {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'comments'), {
        entityType: 'lead',
        entityId: leadId,
        text: value,
        authorId: user.uid,
        authorName: staff?.fullName ?? '',
        createdAt: serverTimestamp(),
      });
      // Денормализованный счётчик на самом лиде — чтобы иконка комментария
      // могла показать «тут есть записи», не открывая отдельный listener
      // на comments для каждой из карточек на доске.
      await updateDoc(doc(db, 'students', leadId), { commentsCount: increment(1) });
      setText('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1.5 border-t border-border pt-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="max-h-40 space-y-1.5 overflow-y-auto">
        {loading && <p className="text-[12px] text-muted">Загрузка…</p>}
        {!loading && comments.length === 0 && <p className="text-[12px] text-muted">Пока нет комментариев</p>}
        {comments.map((c) => (
          <div key={c.id} className="text-[12px]">
            <span className="font-bold text-text">{c.authorName}</span>{' '}
            <span className="text-muted">{formatDateTime(c.createdAt)}</span>
            <p className="whitespace-pre-wrap text-text">{c.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1 rounded-field border border-border-strong bg-surface-alt px-2 py-1">
        <span className="shrink-0 font-mono text-[13px] text-muted">&gt;</span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.stopPropagation();
            submit();
          }}
          placeholder="Написать комментарий…"
          disabled={saving}
          className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-text placeholder:text-muted focus:outline-none"
        />
      </div>
    </div>
  );
}

/**
 * Чек-лист проверки кандидата — раскрывается прямо в карточке, только в
 * «ФИЛЬТР»/«ИНТЕРВЬЮ ПО ТЕЛЕФОНУ» (`new`/`calling`, см. LEAD_CHECKLIST_ITEMS).
 * Пишет сразу в Firestore по каждому клику — тот же самооптимистичный
 * паттерн, что и остальные действия на карточке, без промежуточного стейта.
 * Под чек-листом — справочные списки Red/Green flag (без отметок).
 */
function LeadChecklistPanel({ leadId, checklist }) {
  const checked = checklistCheckedCount(checklist);
  const percent = checklistPercent(checklist);
  return (
    <div className="mt-1.5 flex flex-col gap-1 border-t border-border pt-1.5" onClick={(e) => e.stopPropagation()}>
      <p className="text-[11px] font-bold text-muted">
        Соблюдено: {checked}/{LEAD_CHECKLIST_ITEMS.length} ({percent}%)
      </p>
      {LEAD_CHECKLIST_ITEMS.map((item) => (
        <label key={item.key} className="flex cursor-pointer items-start gap-1.5 text-[12px] leading-tight text-text">
          <input
            type="checkbox"
            className="mt-0.5 shrink-0"
            checked={Boolean(checklist?.[item.key])}
            onChange={(e) => updateDoc(doc(db, 'students', leadId), { [`checklist.${item.key}`]: e.target.checked })}
          />
          {item.label}
        </label>
      ))}
      <div className="mt-1 rounded-field bg-danger/5 p-1.5 text-[11px] text-danger">
        <p className="font-bold">Red flag</p>
        <ul className="list-disc space-y-0.5 pl-3.5">
          {CHECKLIST_RED_FLAGS.map((flag, i) => (
            <li key={i}>{flag}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-field bg-success/10 p-1.5 text-[11px] text-success">
        <p className="font-bold">Green flag</p>
        <ul className="list-disc space-y-0.5 pl-3.5">
          {CHECKLIST_GREEN_FLAGS.map((flag, i) => (
            <li key={i}>{flag}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Шапка карточки красится цветом текущей колонки (column.color — та же
// линия, что под заголовком столбца), но бледно: заливка ~7%, линия ~20%.
// Текст чёрный. Альфы менять тут.
const HEADER_BG_ALPHA = 0.07;
const HEADER_BORDER_ALPHA = 0.2;
const HEADER_TITLE_COLOR = '#0F172A';
const HEADER_SUBTITLE_COLOR = '#1F2937';

/** hex (#RRGGBB) → rgba(...) с заданной прозрачностью. */
function tint(hex, alpha) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(139, 148, 163, ${alpha})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alpha})`;
}

/** «Muslima Azizova» → «MA» — инициалы оператора для бейджа-квадрата, как в Telegram. */
export function operatorInitials(name) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts[1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

/** Триггер-точка попытки дозвона. */
function AttemptDot({ ref, toggle, ariaLabel }) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      aria-label={ariaLabel}
      className="flex h-4 w-4 items-center justify-center text-border hover:text-navy"
    >
      <Circle className="h-4 w-4" />
    </button>
  );
}

/**
 * Ряд точек — попытки дозвона, см. 2026-08-12-lead-card-call-attempts-design.md.
 * Число точек (`slots`) — настройка колонки (`attemptSlots`, см.
 * columns.js/resolveAttemptSlots); ряд переносится по строке, если точек
 * много. Меню выбора результата — через DropdownMenu (портал,
 * `position: fixed`) — точка попытки лежит у левого края узкой карточки в
 * канбане, обычный absolute-попап вылезал за край карточки и обрезался/
 * наезжал на соседнюю колонку.
 */
function CallAttemptDots({ attempts, onMark, nextCallDueAt, slots }) {
  const isCold = attempts.length >= slots && slots > 0 && attempts.every((a) => a.result === 'fail');
  const deadlineLabel = !isCold && nextCallDueAt ? formatRelativeDeadline(nextCallDueAt) : null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {Array.from({ length: slots }, (_, i) => {
          const attempt = attempts[i];
          if (attempt) {
            const Icon = attempt.result === 'success' ? CheckCircle2 : XCircle;
            return (
              <DropdownMenu
                key={i}
                items={[{ label: attempt.at ? formatDateTimeShort(attempt.at) : '—', disabled: true }]}
                trigger={({ ref, toggle }) => (
                  <button
                    ref={ref}
                    type="button"
                    onClick={toggle}
                    aria-label={`Попытка ${i + 1}: когда отмечена`}
                    className="flex h-4 w-4 items-center justify-center"
                  >
                    <Icon className={`h-4 w-4 ${attempt.result === 'success' ? 'text-success' : 'text-danger'}`} />
                  </button>
                )}
              />
            );
          }
          if (i === attempts.length) {
            return (
              <DropdownMenu
                key={i}
                items={[
                  { label: '✓ Успешно', onClick: () => onMark('success') },
                  { label: '✕ Не успешно', danger: true, onClick: () => onMark('fail') },
                ]}
                trigger={({ ref, toggle }) => (
                  <AttemptDot ref={ref} toggle={toggle} ariaLabel={`Попытка ${i + 1}: отметить результат звонка`} />
                )}
              />
            );
          }
          return <Circle key={i} className="h-4 w-4 text-border" />;
        })}
      </div>
      {isCold && (
        <span title="Все попытки дозвона неудачны" className="flex items-center">
          <Snowflake className="h-4 w-4 text-danger" />
        </span>
      )}
      {deadlineLabel && <span className="text-[12px] font-bold text-text">{deadlineLabel}</span>}
    </div>
  );
}

/**
 * Карточка лида на канбан-доске «Заявки». Перетаскивается мышью (native
 * HTML5 DnD) в любую колонку — терминальные (won/lost) не draggable вовсе.
 * @param {Object} props
 * @param {Object} props.lead документ `students`
 * @param {string} [props.operatorColor] hex-цвет назначенного оператора (`staff.color`)
 * @param {string} [props.operatorName] имя назначенного оператора
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onEdit
 * @param {(lead: Object) => void} props.onDecline
 * @param {(lead: Object) => void} props.onDelete полное удаление, только для status=='lead'
 * @param {(lead: Object) => void} props.onEditAppointment правка дня/времени записи (колонка с `appointment`)
 * @param {(lead: Object, stageKey: string) => void} props.onMove
 * @param {(lead: Object, result: 'success'|'fail') => void} props.onMarkAttempt
 * @param {(lead: Object) => void} props.onDismissFromBoard только для won — скрывает с доски, студент остаётся в системе
 * @param {(lead: Object) => void} props.onResetToNew полный сброс воронки за кодом доступа (ResetLeadModal)
 */
export function LeadCard({
  lead,
  operatorColor,
  operatorName,
  onOpen,
  onEdit,
  onDecline,
  onDelete,
  onEditAppointment,
  onMove,
  onMarkAttempt,
  onDismissFromBoard,
  onResetToNew,
  columns = COLUMNS,
}) {
  const stage = lead.funnelStage ?? 'new';
  const isTerminal = stage === 'won' || stage === 'lost';
  const attempts = lead.callAttempts ?? [];
  const currentColumn = columns.find((c) => c.key === stage);
  // Сколько кружочков-попыток на карточке — настройка текущей колонки.
  const attemptSlots = resolveAttemptSlots(currentColumn ?? { key: stage });
  // Колонка «требует записи» (тест / стажировка / общение) — на карточке
  // виден день и время встречи, клик открывает окно правки (onEditAppointment).
  const needsAppointment = columnRequiresAppointment(currentColumn);
  const operatorLabel = operatorInitials(operatorName);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const hasComments = (lead.commentsCount ?? 0) > 0;
  const [checklistOpen, setChecklistOpen] = useState(false);
  const checklistChecked = checklistCheckedCount(lead.checklist);
  const checklistPct = checklistPercent(lead.checklist);

  const createdAt = lead.createdAt?.toDate?.();
  // priority — метка «лид пришёл вне рабочих часов», актуальна только пока
  // не отработан первый SLA на стадии 'new'; дальше по воронке не показываем.
  const priority = stage === 'new' && createdAt ? isPriorityLead(createdAt) : false;

  // Telegram-username — своё поле `lead.telegram` (пишет FormLeadsSync.gs)
  // или, для старых лидов, вытаскиваем из formAnswers по вопросу «telegram».
  // Нормализуем к чистому хэндлу для ссылки t.me/<handle>.
  const telegramHandle = (() => {
    const raw =
      lead.telegram ||
      (Array.isArray(lead.formAnswers) ? lead.formAnswers.find((a) => /telegram/i.test(a?.question || ''))?.answer : null);
    if (!raw) return null;
    const handle = String(raw)
      .trim()
      .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
      .replace(/^@+/, '')
      .split(/[/?\s]/)[0];
    return /^[A-Za-z0-9_]{3,}$/.test(handle) ? handle : null;
  })();

  // Ответы на вопросы формы (formAnswers: [{question, answer}]; старые поля
  // russianLevel/… с прошлых таблиц). Показываются прямо на карточке
  // прокручиваемым блоком. Telegram оттуда убираем — он уже рядом с телефоном.
  const infoItems = [
    ...(Array.isArray(lead.formAnswers)
      ? lead.formAnswers.filter((a) => a && a.answer && !/telegram/i.test(a.question || ''))
      : []),
    lead.russianLevel && { question: 'Rus tilida qanday darajadasiz?', answer: lead.russianLevel },
    lead.russianLearningReason && { question: "Rus tilini nima sababdan o'rganmoqchisiz?", answer: lead.russianLearningReason },
    lead.livesInTashkent && { question: 'Toshkentda yashaysizmi?', answer: lead.livesInTashkent },
  ].filter(Boolean);

  const menuItems = [
    ...(needsAppointment ? [{ label: 'День и время', onClick: () => onEditAppointment(lead) }] : []),
    { label: 'Редактировать', onClick: () => onEdit(lead) },
    // Пункт виден на любой нетерминальной стадии — реально удаляет только
    // status=='lead' (правило Firestore), для остальных DeleteLeadModal
    // покажет понятную ошибку («есть записи в группу»), не молча блокирует
    // пункт меню. Оплаченных («Оплачено») насовсем не удаляем никогда —
    // с этой стадии карточку можно только скрыть с доски (см. won-ветку ниже).
    ...(stage !== 'won' ? [{ label: 'Удалить навсегда', danger: true, onClick: () => onDelete(lead) }] : []),
    // Полный сброс воронки — за кодом доступа (ResetLeadModal), не для
    // 'new' (сбрасывать уже некуда) и не для 'won' (там своё урезанное
    // меню без этого пункта вовсе).
    ...(stage !== 'new' && stage !== 'won' ? [{ label: 'Вернуть в новый лид', danger: true, onClick: () => onResetToNew(lead) }] : []),
  ];

  // Перенос в любую колонку, кроме текущей — без гейтов «только вперёд».
  // Единственная спец-форма — «Отказ»: окно с обязательной причиной
  // (onDecline). Остальные стадии — голый onMove.
  const moveItems = columns.filter((c) => c.key !== stage).map((c) => ({
    label: c.label,
    danger: c.key === 'lost',
    onClick: () => (c.key === 'lost' ? onDecline(lead) : onMove(lead, c.key)),
  }));

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!isTerminal}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(lead)}
      className={`group relative flex min-h-[215px] flex-col gap-2.5 rounded-xl border bg-surface p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isTerminal ? 'cursor-pointer border-border' : 'cursor-grab border-border hover:border-navy/20 active:cursor-grabbing'
      } ${
        priority ? 'border-l-4 border-l-orange-soft' : ''
      }`}
    >
      {/* Шапка карточки — бледная заливка цветом текущей колонки
          (column.color, та же линия, что под заголовком столбца), текст
          чёрный. Отрицательные margin/rounded-t растягивают заливку до
          самых краёв карточки поверх её собственного p-3.5. */}
      <div
        className="-mx-3.5 -mt-3.5 flex items-center justify-between gap-2 rounded-t-xl border-b px-3.5 pb-2.5 pt-3.5"
        style={{
          backgroundColor: tint(currentColumn?.color, HEADER_BG_ALPHA),
          borderColor: tint(currentColumn?.color, HEADER_BORDER_ALPHA),
        }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 truncate text-[13px] font-bold leading-tight" style={{ color: HEADER_TITLE_COLOR }}>
            {lead.fullName}
          </p>
        </div>
        <div className="flex min-w-0 shrink items-center gap-1">
          {lead.vacancyName && (
            <span className="truncate text-[12px] font-bold" style={{ color: HEADER_SUBTITLE_COLOR }}>
              {lead.vacancyName}
            </span>
          )}
        </div>
      </div>

      <div className="-mt-1 flex items-center justify-between gap-2 text-[14px] font-semibold" onClick={(e) => e.stopPropagation()}>
        <a href={`tel:+${lead.phone}`} className="shrink-0 text-link">
          {formatPhone(lead.phone)}
        </a>
        {telegramHandle && (
          <a
            href={`https://t.me/${telegramHandle}`}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 truncate text-right text-link"
          >
            @{telegramHandle}
          </a>
        )}
      </div>

      {needsAppointment && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEditAppointment(lead);
          }}
          className="flex items-center gap-1.5 self-start rounded-field bg-surface-alt px-2 py-1 text-[12px] font-semibold text-text hover:bg-border/50"
        >
          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-muted" />
          {lead.appointmentAt ? (
            formatRelativeDeadline(lead.appointmentAt)
          ) : (
            <span className="text-muted">Назначить день и время</span>
          )}
        </button>
      )}

      {attemptSlots > 0 && (
        <div onClick={(e) => e.stopPropagation()}>
          <CallAttemptDots
            attempts={attempts}
            onMark={(result) => onMarkAttempt(lead, result)}
            nextCallDueAt={lead.nextCallDueAt}
            slots={attemptSlots}
          />
        </div>
      )}

      {infoItems.length > 0 && (
        <div
          className="max-h-[136px] space-y-1.5 overflow-y-auto rounded-field bg-surface-alt px-2 py-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {infoItems.map((item, i) => (
            <div key={i}>
              <p className="text-[10px] leading-snug text-muted">{item.question}</p>
              <p className="whitespace-pre-line text-[12px] font-semibold leading-snug text-text">{item.answer}</p>
            </div>
          ))}
        </div>
      )}

      {stage === 'lost' && lead.lostReason && (
        <p className="text-[12px] text-danger">
          Причина: {LOST_REASON_OPTIONS.find((o) => o.value === lead.lostReason)?.label ?? lead.lostReason}
          {lead.lostReasonDetail ? ` — ${lead.lostReasonDetail}` : ''}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-border pt-2" onClick={(e) => e.stopPropagation()}>
        {operatorLabel ? (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
            style={{ backgroundColor: `${operatorColor || '#8B94A3'}26`, color: operatorColor || '#8B94A3' }}
          >
            {operatorLabel}
          </span>
        ) : (
          <span />
        )}
        {stage === 'won' ? (
          // «Оплачено» — карточка ведёт себя как уведомление: только
          // посмотреть (клик по карточке) и скрыть с доски. Ни коммента, ни
          // ⋮-меню с «Удалить навсегда» тут никогда не было и не будет —
          // студент остаётся в системе, убирается только вид на доске
          // (onDismissFromBoard, см. LeadsPage.boardHiddenAt).
          <button
            type="button"
            onClick={() => onDismissFromBoard(lead)}
            aria-label="Скрыть с доски"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-0.5">
            {(stage === 'new' || stage === 'calling') && (
              <button
                type="button"
                onClick={() => setChecklistOpen((v) => !v)}
                aria-label="Чек-лист"
                className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-alt ${
                  checklistOpen
                    ? 'text-navy'
                    : checklistChecked === 0
                      ? 'text-muted'
                      : checklistPct === 100
                        ? 'text-success'
                        : 'text-orange'
                }`}
              >
                <ListChecks className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setCommentsOpen((v) => !v)}
              aria-label="Комментарии"
              className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-alt ${
                commentsOpen || hasComments ? 'text-navy' : 'text-muted'
              }`}
            >
              <MessageSquare className="h-4 w-4" fill={hasComments ? 'currentColor' : 'none'} fillOpacity={hasComments ? 0.15 : 1} />
            </button>
            {!isTerminal && moveItems.length > 0 && <DropdownMenu items={moveItems} icon={ArrowRight} ariaLabel="Перенести в колонку" />}
            <DropdownMenu items={menuItems} />
          </div>
        )}
      </div>

      {(stage === 'new' || stage === 'calling') && checklistOpen && (
        <LeadChecklistPanel leadId={lead.id} checklist={lead.checklist} />
      )}
      {stage !== 'won' && commentsOpen && <LeadCommentsPanel leadId={lead.id} />}

      <span className="-mt-1 text-[10px] text-muted">
        {formatDateTimeShort(lead.createdAt)}
        {formatSource(lead.source) ? ` · ${formatSource(lead.source)}` : ''}
        {stage === 'new' || stage === 'calling' ? ` · Чек-лист ${checklistPct}%` : ''}
      </span>
    </div>
  );
}
