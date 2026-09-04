import { useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { Inbox, ChevronsLeft, ChevronsRight, X } from 'lucide-react';

const STORAGE_KEY = 'leads-board:sidebar-collapsed';

/**
 * Меню шаблона — один пункт («Заявки»), т.к. это не полная CRM, а
 * вынесенная доска лидов. Добавляя новые разделы под конкретный проект,
 * расширяй ITEMS так же, как в исходной Sidebar.jsx полной CRM.
 * @param {Object} props
 * @param {boolean} [props.mobileOpen]
 * @param {() => void} [props.onMobileClose]
 */
export function Sidebar({ mobileOpen = false, onMobileClose }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const content = (
    <div className={`flex h-full flex-col border-r border-border bg-surface ${collapsed ? 'w-[76px]' : 'w-60'} transition-[width]`}>
      <div className="flex h-16 shrink-0 items-center justify-between px-4">
        {!collapsed && <span className="truncate text-[15px] font-bold text-text">Leads Board</span>}
        <button
          type="button"
          onClick={onMobileClose}
          aria-label="Закрыть меню"
          className="rounded-field p-1.5 text-muted hover:bg-surface-alt md:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        <NavLink
          to="/leads"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-field px-3 py-2.5 text-[14px] font-bold ${
              isActive ? 'bg-navy/10 text-navy' : 'text-muted hover:bg-surface-alt hover:text-text'
            }`
          }
        >
          <Inbox className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="truncate">Заявки</span>}
        </NavLink>
      </nav>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        className="mx-3 mb-3 hidden items-center justify-center rounded-field p-2 text-muted hover:bg-surface-alt md:flex"
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
      </button>
    </div>
  );

  return (
    <>
      <div className="hidden md:block">{content}</div>
      {mobileOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={onMobileClose} />
            <div className="relative">{content}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
