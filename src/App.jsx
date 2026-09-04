import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.js';
import { BranchProvider } from './hooks/useBranch.js';
import { ToastProvider } from './components/ui/Toast.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { AppShell } from './components/layout/AppShell.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { LeadsPage } from './pages/LeadsPage.jsx';

/**
 * Шаблон «доска лидов» — одна страница (LeadsPage) под защитой авторизации.
 * Не тянет остальные разделы полной CRM (студенты/финансы/отчёты) — только
 * то, что нужно самой доске (см. StudentFormModal/DeclineLeadModal —
 * добавление и отказ лида остаются частью воронки, не отдельный раздел).
 */
function App() {
  return (
    <AuthProvider>
      <BranchProvider>
        <ToastProvider>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/leads" replace />} />
                <Route path="leads" element={<LeadsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </ToastProvider>
      </BranchProvider>
    </AuthProvider>
  );
}

export default App;
