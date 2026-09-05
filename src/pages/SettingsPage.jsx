import { LeadAssignmentTab } from '../components/settings/LeadAssignmentTab.jsx';

/**
 * Настройки — только для ceo/manager/admin (см. ProtectedRoute на маршруте
 * /settings в App.jsx). Пока один раздел; добавляя новые, оформляй их так
 * же отдельным компонентом в components/settings/.
 */
export function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[20px] font-bold text-text">Настройки</h1>
      <LeadAssignmentTab />
    </div>
  );
}
