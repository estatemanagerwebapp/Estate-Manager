import { Building2 } from 'lucide-react';
import { MoneyContractCard, SystemStatusCard } from '../components/SystemStatus';

/**
 * Foundation landing page (Phase 0). Shows live system health and the shared
 * money contract so operators can confirm the API/DB wiring before domain
 * features land. No dashboards, billing, or onboarding UI yet.
 */
export function FoundationPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-primary-soft)">
          <Building2 aria-hidden size={20} className="text-(--color-primary)" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Silverstone Managers</h1>
          <p className="text-sm text-(--color-ink-muted)">Estate management · Phase 0 foundation</p>
        </div>
      </header>

      <main className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SystemStatusCard />
        <MoneyContractCard />
      </main>

      <footer className="mt-10 text-xs text-(--color-ink-muted)">
        API version 0.1 · modular monolith · no payment or activation logic in this phase
      </footer>
    </div>
  );
}
