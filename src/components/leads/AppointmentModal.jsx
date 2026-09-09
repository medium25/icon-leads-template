import { useEffect, useState } from 'react';
import { doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { advanceStage } from '../../lib/leadFunnel.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Запись лида на день и время события стадии (тест / стажировка / общение —
 * любая колонка с настройкой `appointment`). Только день и время, без
 * учителя/курса — только день и время встречи.
 *
 * `target.move === true` — окно открыто при переводе карточки в стадию
 * `target.stageKey`: «Сохранить» переводит с датой, «Пропустить» переводит
 * без даты, «Отмена» оставляет карточку на месте. `target.move === false` —
 * правка даты у карточки, уже стоящей в стадии: только запись `appointmentAt`.
 * @param {Object} props
 * @param {{lead: Object, stageKey: string, move: boolean}|null} props.target
 * @param {() => void} props.onClose
 */
export function AppointmentModal({ target, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    const existing = target.lead.appointmentAt?.toDate?.();
    setDate(existing ? format(existing, 'yyyy-MM-dd') : '');
    setTime(existing ? format(existing, 'HH:mm') : '');
    setSaving(false);
  }, [target]);

  if (!target) return null;
  const { lead, stageKey, move } = target;

  const commit = async (appointmentAt) => {
    setSaving(true);
    try {
      if (move) {
        await advanceStage(db, lead, stageKey, appointmentAt ? { appointmentAt } : {}, user);
      } else {
        await updateDoc(doc(db, 'students', lead.id), {
          appointmentAt,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
      }
      onClose();
    } catch {
      showToast('Не удалось сохранить запись.', { type: 'error' });
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!date || !time) return;
    commit(Timestamp.fromDate(new Date(`${date}T${time}:00`)));
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={`Запись: ${lead.fullName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          {move && (
            <Button variant="secondary" onClick={() => commit(null)} loading={saving}>
              Пропустить
            </Button>
          )}
          <Button onClick={handleSave} loading={saving} disabled={!date || !time}>
            Сохранить
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-[13px] text-muted">Укажите день и время — они видны на карточке. Можно пропустить и назначить позже.</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <DatePicker label="День" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <label className="block">
            <span className="mb-1 block text-[13px] text-muted">Время</span>
            <Input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />
          </label>
        </div>
      </form>
    </Modal>
  );
}
