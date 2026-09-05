import { StaffTab } from '../components/settings/StaffTab.jsx';
import { StaffListTab } from '../components/settings/StaffListTab.jsx';
import { LeadAssignmentTab } from '../components/settings/LeadAssignmentTab.jsx';

/**
 * Настройки — только для ceo/manager/admin (см. ProtectedRoute на маршруте
 * /settings в App.jsx). Добавляя новые разделы, оформляй их так же
 * отдельным компонентом в components/settings/.
 */
export function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[20px] font-bold text-text">Настройки</h1>
      <div className="flex flex-wrap gap-4">
        <StaffTab />
        <LeadAssignmentTab />
      </div>
      <StaffListTab />
    </div>
  );
}
