import { Building2 } from 'lucide-react';
import { InfoBanner } from '../components/ui';

/**
 * Resident dashboard landing page.
 *
 * Shows "Welcome to your dashboard" and a short intro. Residents with
 * `mustChangePassword = true` are redirected to the change-password screen
 * by the login page before they ever reach here.
 */
export function ResidentDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building2 aria-hidden size={20} className="text-(--color-primary)" />
        <h1 className="text-lg font-semibold text-(--color-ink)">Welcome to your dashboard</h1>
      </div>
      <p className="text-sm text-(--color-ink-muted)">
        Your resident portal. From here you can view your property details, upcoming payments, and
        manage your account.
      </p>

      <InfoBanner tone="info">
        This is your resident dashboard. Use the sidebar to navigate between your property and
        account pages.
      </InfoBanner>
    </div>
  );
}
