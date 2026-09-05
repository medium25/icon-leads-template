import { useState } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '../../firebase.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useRole } from '../../hooks/useRole.js';
import { useToast } from '../ui/Toast.jsx';
import { Input } from '../ui/Input.jsx';
import { Select } from '../ui/Select.jsx';
import { Button } from '../ui/Button.jsx';
import { phoneToAuthEmail } from '../../lib/auth.js';

const ALL_ROLE_OPTIONS = [
  { value: 'admin', label: 'Оператор' },
  { value: 'teacher', label: 'Учитель' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'ceo', label: 'CEO' },
];

function randomPassword() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Заводит нового сотрудника — то же самое, что раньше делалось руками в
 * Firebase Console (Authentication → Add user + Firestore → staff/{uid}).
 *
 * createUserWithEmailAndPassword логинит созданного пользователя в том
 * Auth-инстансе, где вызван — если бы вызвали его на основном `auth`, это
 * разлогинило бы текущего ceo/manager/admin прямо здесь, в его же форме.
 * Поэтому создаём временный, отдельный Firebase App с тем же конфигом
 * (firebaseConfig), логинимся там, сразу выходим и удаляем этот app —
 * основная сессия его не видит и не трогает.
 */
export function StaffTab() {
  const { activeBranchId } = useBranch();
  const { role: myRole } = useRole();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(randomPassword);
  const [saving, setSaving] = useState(false);

  // 'admin' может заводить только учителей (см. firestore.rules → match
  // /staff/{uid} → allow create) — ceo/manager могут завести кого угодно.
  const roleOptions = myRole === 'admin' ? ALL_ROLE_OPTIONS.filter((o) => o.value === 'teacher') : ALL_ROLE_OPTIONS;
  const [role, setRole] = useState(roleOptions[0]?.value ?? 'admin');

  const missingPhone = phone.length !== 9;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || missingPhone || !password) return;
    setSaving(true);
    try {
      const fullPhone = `998${phone}`;
      const email = phoneToAuthEmail(fullPhone);

      const secondaryApp = initializeApp(firebaseConfig, `staff-create-${Date.now()}`);
      let uid;
      try {
        const secondaryAuth = getAuth(secondaryApp);
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        uid = cred.user.uid;
        await signOut(secondaryAuth);
      } finally {
        await deleteApp(secondaryApp);
      }

      await setDoc(doc(db, 'staff', uid), {
        fullName: fullName.trim(),
        phone: fullPhone,
        email,
        role,
        branchIds: activeBranchId ? [activeBranchId] : [],
        isActive: true,
      });

      showToast(`Сотрудник добавлен. Логин: ${phone}, пароль: ${password} — сообщите их сотруднику.`);
      setFullName('');
      setPhone('');
      setPassword(randomPassword());
    } catch (err) {
      showToast(
        err.code === 'auth/email-already-in-use' ? 'Сотрудник с таким номером уже есть.' : 'Не удалось добавить сотрудника.',
        { type: 'error' },
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg rounded-card border border-border bg-surface p-5 shadow-card">
      <h2 className="mb-1 text-[16px] font-bold text-text">Новый сотрудник</h2>
      <p className="mb-4 text-[13px] text-muted">
        Заводит вход по номеру телефона и запись в базе — пароль после сохранения нужно передать сотруднику самим
        (сообщение/звонок), автоматически он никуда не отправляется.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input label="Имя" required value={fullName} onChange={(e) => setFullName(e.target.value)} />

        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Номер телефона</span>
          <span className="flex items-center gap-2">
            <span className="flex h-11 shrink-0 items-center rounded-field border border-border-strong bg-surface-alt px-3 text-[15px] text-muted">
              +998
            </span>
            <input
              type="tel"
              placeholder="901234567"
              required
              maxLength={9}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
              className="h-11 w-full rounded-field border border-border-strong bg-white px-3 text-[15px] text-text placeholder:text-muted focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
            />
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Пароль</span>
          <span className="flex items-center gap-2">
            <input
              type="text"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-field border border-border-strong bg-white px-3 text-[15px] text-text focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
            />
            <Button type="button" variant="secondary" onClick={() => setPassword(randomPassword())}>
              Сгенерировать
            </Button>
          </span>
        </label>

        <Select label="Роль" options={roleOptions} value={role} onChange={(e) => setRole(e.target.value)} />

        <Button type="submit" loading={saving} disabled={!fullName.trim() || missingPhone || !password}>
          Добавить сотрудника
        </Button>
      </form>
    </div>
  );
}
