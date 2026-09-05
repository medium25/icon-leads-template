import { useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Select } from '../ui/Select.jsx';
import { Button } from '../ui/Button.jsx';
import { NON_TERMINAL_STAGES, reassignLeadsToOperator } from '../../lib/leadFunnel.js';

/**
 * Массовый перевод активных лидов от одного оператора другому — например,
 * когда оператор увольняется или уходит в отпуск. Список операторов — тот
 * же фильтр (role='admin' в активном филиале), что и «Ответственный» в
 * StudentFormModal при создании лида.
 */
export function LeadAssignmentTab() {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [fromOperator, setFromOperator] = useState('');
  const [toOperator, setToOperator] = useState('');
  const [saving, setSaving] = useState(false);

  const staffQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId), where('role', '==', 'admin'))
        : null,
    [activeBranchId],
  );
  const { data: staffList } = useCollection(staffQuery);
  const operatorOptions = [...staffList].sort((a, b) => a.fullName.localeCompare(b.fullName)).map((s) => ({ value: s.id, label: s.fullName }));

  const activeLeadsQuery = useMemo(
    () =>
      db && activeBranchId && fromOperator
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('assignedOperator', '==', fromOperator),
            where('funnelStage', 'in', NON_TERMINAL_STAGES),
          )
        : null,
    [activeBranchId, fromOperator],
  );
  const { data: activeLeads, loading: loadingLeads } = useCollection(activeLeadsQuery);

  const canTransfer = Boolean(fromOperator) && Boolean(toOperator) && fromOperator !== toOperator && activeLeads.length > 0;

  const handleTransfer = async () => {
    setSaving(true);
    try {
      await reassignLeadsToOperator(db, activeLeads.map((l) => l.id), toOperator, user);
      showToast(`Переведено лидов: ${activeLeads.length}.`);
      setFromOperator('');
      setToOperator('');
    } catch {
      showToast('Не удалось перевести лидов.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg rounded-card border border-border bg-surface p-5 shadow-card">
      <h2 className="mb-1 text-[16px] font-bold text-text">Назначение ответственных</h2>
      <p className="mb-4 text-[13px] text-muted">
        Переводит все активные лиды одного оператора другому. Отказанные и уже закрытые лиды не трогает — меняется
        только ответственный, стадия воронки остаётся как есть.
      </p>

      <div className="flex flex-col gap-3">
        <Select
          label="От оператора"
          options={[{ value: '', label: 'Выбрать…' }, ...operatorOptions]}
          value={fromOperator}
          onChange={(e) => setFromOperator(e.target.value)}
        />
        {fromOperator && (
          <p className="-mt-1 text-[13px] text-muted">
            {loadingLeads ? 'Считаю…' : `Активных лидов: ${activeLeads.length}`}
          </p>
        )}
        <Select
          label="Кому передать"
          options={[{ value: '', label: 'Выбрать…' }, ...operatorOptions.filter((o) => o.value !== fromOperator)]}
          value={toOperator}
          onChange={(e) => setToOperator(e.target.value)}
        />
        <Button onClick={handleTransfer} loading={saving} disabled={!canTransfer}>
          Перевести все лиды
        </Button>
      </div>
    </div>
  );
}
