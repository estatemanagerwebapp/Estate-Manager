import { Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCan } from '../auth/useCan';
import { useDashboard } from '../api/hooks';
import { MoneyContractCard } from '../components/SystemStatus';
import {
  KpiRow,
  KpiRowSkeleton,
  RecentActivityPanel,
  PropertyStatusCard,
  SystemHealthStrip,
} from '../components/DashboardWidgets';
import { ROLE_LABELS } from '@silverstone/shared';

/**
 * Overview for signed-in operators.
 *
 * The page is deliberately dumb: every fetch and permission check lives in a
 * hook (`useDashboard`, `useCan`), and the widgets in
 * `components/DashboardWidgets.tsx` own the presentation. This section is the
 * *operator* dashboard — KPIs, a property-status chart, a recent-activity feed
 * and the system-health strip. The Phase-0 money-contract card is kept below
 * so a deployment can still verify the kobo → naira contract on the same
 * screen.
 */
export function OverviewPage() {
  const { user } = useAuth();
  const can = useCan();
  const dashboardEnabled = user !== null;
  const { kpis, activity, activityDenied, loading, error } = useDashboard(dashboardEnabled);

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

      <main className="mt-8 flex flex-col gap-6">
        {loading ? <KpiRowSkeleton /> : <KpiRow kpis={kpis} />}

        {error && (
          <div role="alert" className="rounded-md bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PropertyStatusCard
            total={kpis?.totalProperties ?? null}
            active={kpis?.activeProperties ?? null}
            linkTo={can['property.read'] ? '/app/properties' : undefined}
          />
          <RecentActivityPanel events={activity} loading={loading} denied={activityDenied} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <MoneyContractCard />
          {can['estate.read'] && (
            <section
              aria-label="Quick actions"
              className="rounded-(--radius-card) border border-slate-200/80 bg-white p-6 shadow-(--shadow-card)"
            >
              <h2 className="text-sm font-semibold text-(--color-ink)">Quick actions</h2>
              <ul className="mt-3 flex flex-col gap-2">
                <QuickLink to="/app/estates" label="Manage estates" />
                {can['property.read'] && <QuickLink to="/app/properties" label="View properties" />}
                {can['billing.read'] && <QuickLink to="/app/billing" label="Review billing" />}
                {can['verification.read'] && <QuickLink to="/app/gate" label="Open gate access" />}
              </ul>
            </section>
          )}
        </div>

        <SystemHealthStrip />
      </main>

      <footer className="mt-8 text-xs text-(--color-ink-muted)">
        API version 0.1 · payments are recorded manually by estate staff
      </footer>
    </div>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <li>
      <Link
        to={to}
        className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-(--color-ink-muted) transition-colors hover:bg-(--color-surface) hover:text-(--color-ink)"
      >
        {label}
      </Link>
    </li>
  );
}
