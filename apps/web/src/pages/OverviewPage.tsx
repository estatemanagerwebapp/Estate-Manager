import {
  ArrowRight,
  Building2,
  CalendarDays,
  FileText,
  Home,
  ScanLine,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCan } from '../auth/useCan';
import { useDashboard } from '../api/hooks';
import {
  KpiRow,
  KpiRowSkeleton,
  NeedsAttentionPanel,
  RecentActivityPanel,
  PropertyStatusCard,
  SystemHealthStrip,
} from '../components/DashboardWidgets';

/**
 * Operator overview. The page owns dashboard composition; existing hooks and
 * widgets continue to own data, permission checks and loading/error states.
 */
export function OverviewPage() {
  const { user } = useAuth();
  const can = useCan();
  const dashboardEnabled = user !== null;
  const { kpis, attention, activity, activityDenied, loading, error } =
    useDashboard(dashboardEnabled);
  const displayName = user?.fullName || user?.email?.split('@')[0] || 'Admin';
  const todayDate = new Date();
  const today = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(todayDate);
  const dateTime = [
    todayDate.getFullYear(),
    String(todayDate.getMonth() + 1).padStart(2, '0'),
    String(todayDate.getDate()).padStart(2, '0'),
  ].join('-');

  return (
    <div className="flex flex-col">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Overview
          </p>
          <h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-[-0.035em] text-slate-950 sm:text-[34px]">
            Overview
          </h1>
          <p className="mt-1 text-base font-medium text-slate-700">Welcome back, {displayName}</p>
          <p className="mt-1 text-sm text-slate-500">
            Here’s what’s happening across your estates and properties today.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-600 sm:pb-1">
          <CalendarDays aria-hidden size={16} className="text-slate-500" />
          <time dateTime={dateTime}>{today}</time>
        </div>
      </header>

      <main className="mt-6 flex flex-col gap-4">
        {loading ? <KpiRowSkeleton /> : <KpiRow kpis={kpis} />}

        {error && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-12">
          <div className="xl:col-span-5">
            <NeedsAttentionPanel items={attention} loading={loading} />
          </div>
          <div className="xl:col-span-7">
            <RecentActivityPanel events={activity} loading={loading} denied={activityDenied} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-12">
          <div className={can['estate.read'] ? 'xl:col-span-5' : 'xl:col-span-12'}>
            <PropertyStatusCard
              total={kpis?.totalProperties ?? null}
              active={kpis?.activeProperties ?? null}
              linkTo={can['property.read'] ? '/app/properties' : undefined}
            />
          </div>
          {can['estate.read'] && (
            <section
              aria-label="Quick actions"
              className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.035)] sm:p-5 xl:col-span-7"
            >
              <div className="mb-4 flex items-center gap-2">
                <Zap aria-hidden size={18} className="text-orange-500" />
                <h2 className="text-sm font-semibold text-slate-900">Quick actions</h2>
              </div>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <QuickAction
                  to="/app/estates"
                  label="Manage estates"
                  description="View and manage all estates"
                  icon={<Home aria-hidden size={20} />}
                  featured
                />
                {can['property.read'] && (
                  <QuickAction
                    to="/app/properties"
                    label="View properties"
                    description="Browse all properties"
                    icon={<Building2 aria-hidden size={20} />}
                  />
                )}
                {can['billing.read'] && (
                  <QuickAction
                    to="/app/billing"
                    label="Review billing"
                    description="Check invoices and payments"
                    icon={<FileText aria-hidden size={20} />}
                  />
                )}
                {can['verification.read'] && (
                  <QuickAction
                    to="/app/gate"
                    label="Open gate access"
                    description="Manage access codes"
                    icon={<ScanLine aria-hidden size={20} />}
                  />
                )}
              </ul>
            </section>
          )}
        </div>

        <SystemHealthStrip />
      </main>
    </div>
  );
}

function QuickAction({
  to,
  label,
  description,
  icon,
  featured = false,
}: {
  to: string;
  label: string;
  description: string;
  icon: ReactNode;
  featured?: boolean;
}) {
  return (
    <li>
      <Link
        to={to}
        className={`group relative flex min-h-[132px] flex-col rounded-lg border p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${
          featured
            ? 'border-orange-200 bg-orange-50/70 hover:bg-orange-50'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
          {icon}
        </span>
        <span className="mt-2 pr-3 text-xs font-semibold leading-4 text-slate-900">{label}</span>
        <span className="mt-1 pr-2 text-[11px] leading-4 text-slate-600">{description}</span>
        <ArrowRight
          aria-hidden
          size={14}
          className="absolute bottom-3 right-3 text-slate-500 transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  );
}
