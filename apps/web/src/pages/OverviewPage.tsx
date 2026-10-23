import { Building2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { MoneyContractCard, SystemStatusCard } from '../components/SystemStatus';
import { ROLE_LABELS } from '@silverstone/shared';

/**
 * Overview for signed-in operators. The Phase 0 foundation widgets
 * (system health, money contract) remain visible so the deployment can
 * still be verified; Phase 2 adds the estate dashboards here.
 */
export function OverviewPage() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-primary-soft)">
          <Building2 aria-hidden size={20} className="text-(--color-primary)" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-(--color-ink-muted)">
            Signed in as {user?.email} · {user ? ROLE_LABELS[user.role] : ''}
          </p>
        </div>
      </header>

      <main className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SystemStatusCard />
        <MoneyContractCard />
      </main>

      <footer className="mt-8 text-xs text-(--color-ink-muted)">
        API version 0.1 · estate, billing and onboarding features land in a later phase
      </footer>
    </div>
  );
}
