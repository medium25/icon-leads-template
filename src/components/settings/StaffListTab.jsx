import { useMemo } from 'react';
import { collection, doc, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useRole } from '../../hooks/useRole.js';
import { useToast } from '../ui/Toast.jsx';
import { ALL_ROLE_OPTIONS } from './StaffTab.jsx';

/**
 * Список всех сотрудников филиала с редактированием роли и активности
 * прямо тут — то же самое, что раньше правилось руками в Firestore Console.
 * Ограничения повторяют firestore.rules (match /staff/{uid} → allow
 * update): роль 'admin' может менять только сотрудников с ролью 'teacher'
 * (и не менять саму роль дальше), ceo/manager могут править кого угодно.
 * Свою же строку (uid текущего пользователя) намеренно не даём трогать —
 * иначе можно случайно деактивировать или разжаловать самого себя без
 * возможности зайти обратно и всё исправить.
 */
export function StaffListTab() {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { role: myRole } = useRole();
  const { showToast } = useToast();

  const staffQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId)) : null),
    [activeBranchId],
  );
  const { data: staffList } = useCollection(staffQuery);
  const sorted = [...staffList].sort((a, b) => a.fullName.localeCompare(b.fullName));

  const canEditRow = (member) => member.id !== user.uid && (myRole !== 'admin' || member.role === 'teacher');

  const updateRole = (member, newRole) => {
    updateDoc(doc(db, 'staff', member.id), { role: newRole }).catch(() =>
      showToast('Не удалось изменить роль.', { type: 'error' }),
    );
  };

  const toggleActive = (member, isActive) => {
    updateDoc(doc(db, 'staff', member.id), { isActive }).catch(() =>
      showToast('Не удалось изменить статус.', { type: 'error' }),
    );
  };

  return (
    <div className="max-w-2xl rounded-card border border-border bg-surface p-5 shadow-card">
      <h2 className="mb-1 text-[16px] font-bold text-text">Все сотрудники</h2>
      <p className="mb-4 text-[13px] text-muted">
        Роль и активность правятся прямо тут, без Firebase Console. Свою строку менять нельзя — риск случайно
        закрыть себе доступ.
      </p>

      <div className="flex flex-col divide-y divide-border">
        {sorted.map((member) => {
          const isSelf = member.id === user.uid;
          const editable = canEditRow(member);
          return (
            <div key={member.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-text">
                  {member.fullName} {isSelf && <span className="font-normal text-muted">(вы)</span>}
                </p>
                <p className="truncate text-[12px] text-muted">{member.phone}</p>
              </div>
              <select
                value={member.role}
                disabled={!editable}
                onChange={(e) => updateRole(member, e.target.value)}
                className="h-9 rounded-field border border-border-strong bg-white px-2 text-[13px] text-text disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted"
              >
                {ALL_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-[12px] text-muted">
                <input
                  type="checkbox"
                  checked={Boolean(member.isActive)}
                  disabled={!editable}
                  onChange={(e) => toggleActive(member, e.target.checked)}
                />
                Активен
              </label>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="py-4 text-center text-[13px] text-muted">Пока никого нет.</p>}
      </div>
    </div>
  );
}
