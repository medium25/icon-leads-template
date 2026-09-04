import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { useBranch } from '../../hooks/useBranch.js';

/**
 * Оболочка приложения: сайдбар + топбар + контент. < md сайдбар скрыт —
 * открывается выдвижным меню по гамбургеру в Topbar.
 */
export function AppShell() {
  const { branches, activeBranchId, setActiveBranchId } = useBranch();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          branches={branches}
          activeBranchId={activeBranchId}
          onBranchChange={setActiveBranchId}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
