import {
  Building2,
  Database,
  History,
  Network,
  ShieldCheck,
  Users,
  UserRound,
  ClipboardList,
  CircleCheck,
  CircleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuditEventDto, AuditEventType } from '@silverstone/shared';
import type { DashboardKpis } from '../api/hooks';
/**
 * The operator overview widgets: KPI cards, a property-status chart, a recent
 * activity feed and the Phase-0 system-health strip. All data arrives from
 * the `useDashboard` hook; this file owns only the presentation, including
 * the skeleton / "n/a" / error states.
 *
 * No charting dependency is introduced: the property-status breakdown is a
 * compact SVG donut with a legend, which keeps the bundle flat and the visual
 * language consistent with the existing cards.
 */

// --- KPI cards -----------------------------------------------------------------

interface KpiCardProps {
  label: string;
  /** The metric value, or `null` when hidden to the signed-in role. */
  value: number | null;
  icon: React.ReactNode;
  /** Optional sub-line, e.g. "active / total". */
  detail?: string;
}

function KpiCard({ label, value, icon, detail }: KpiCardProps) {
  return (
    <section
      aria-label={label}
      className="rounded-(--radius-card) border border-slate-200/80 bg-white p-5 shadow-(--shadow-card)"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-(--color-ink-muted)">
        <span className="text-(--color-primary)">{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-(--color-ink)">
        {value === null ? 'n/a' : value}
      </p>
      {detail && <p className="mt-1 text-xs text-(--color-ink-muted)">{detail}</p>}
    </section>
  );
}

function KpiSkeleton() {
  return (
    <div
      aria-hidden
      className="h-[120px] animate-pulse rounded-(--radius-card) border border-slate-200/80 bg-white p-5 shadow-(--shadow-card)"
    >
      <div className="h-3 w-24 rounded bg-slate-200" />
      <div className="mt-4 h-7 w-16 rounded bg-slate-200" />
      <div className="mt-2 h-3 w-28 rounded bg-slate-200" />
    </div>
  );
}

/**
 * The KPI row. Every card is independent: a card whose value is `null` (the
 * role lacks the matching read permission) still renders, with "n/a", so the
 * grid layout does not jump.
 */
export function KpiRow({ kpis }: { kpis: DashboardKpis | null }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Key metrics">
      <KpiCard
        label="Estates"
        value={kpis?.estates ?? null}
        icon={<Building2 aria-hidden size={14} />}
      />
      <KpiCard
        label="Active properties"
        value={kpis?.activeProperties ?? null}
        icon={<Database aria-hidden size={14} />}
        detail={
          kpis?.totalProperties != null
            ? `${kpis.activeProperties ?? 0} of ${kpis.totalProperties}`
            : undefined
        }
      />
      <KpiCard label="Users" value={kpis?.users ?? null} icon={<Users aria-hidden size={14} />} />
      <KpiCard
        label="Resident drafts"
        value={kpis?.residentDrafts ?? null}
        icon={<UserRound aria-hidden size={14} />}
        detail={
          kpis?.auditEventsLast30Days != null
            ? `${kpis.auditEventsLast30Days} audit events in the last 30 days`
            : undefined
        }
      />
    </div>
  );
}

export function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden>
      <KpiSkeleton />
      <KpiSkeleton />
      <KpiSkeleton />
      <KpiSkeleton />
    </div>
  );
}

// --- Property status chart ------------------------------------------------------

export interface PropertyStatusSlice {
  label: string;
  value: number;
  tone: 'success' | 'neutral' | 'warning' | 'danger' | 'info';
}

const SLICE_COLORS: Record<PropertyStatusSlice['tone'], string> = {
  success: '#059669',
  neutral: '#94a3b8',
  warning: '#d97706',
  danger: '#e11d48',
  info: '#0284c7',
};

/**
 * A compact SVG donut. Values are laid out on a 240-unit circle; zero-value
 * slices are skipped so an all-zero dataset renders an empty ring instead of
 * a NaN path.
 */
export function DonutChart({
  slices,
  size = 148,
}: {
  slices: PropertyStatusSlice[];
  size?: number;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 44;
  const center = 120 / 2;
  const circumference = 2 * Math.PI * radius;

  let consumed = 0;
  const arcs = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const fraction = total > 0 ? slice.value / total : 0;
      const dash = fraction * circumference;
      const arc = { ...slice, dash, offset: consumed };
      consumed += dash;
      return arc;
    });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        role="img"
        aria-label={`Status breakdown: ${slices
          .map((slice) => `${slice.label} ${slice.value}`)
          .join(', ')}`}
      >
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={12} />
        <g transform={`rotate(-90 ${center} ${center})`}>
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={SLICE_COLORS[arc.tone]}
              strokeWidth={12}
              strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
        </g>
        <text
          x={center}
          y={center - 2}
          textAnchor="middle"
          className="fill-(--color-ink) text-xl font-semibold"
          style={{ font: '600 18px Inter, sans-serif' }}
        >
          {total}
        </text>
        <text
          x={center}
          y={center + 16}
          textAnchor="middle"
          style={{ font: '500 9px Inter, sans-serif' }}
          className="fill-(--color-ink-muted)"
        >
          total
        </text>
      </svg>

      <ul className="flex flex-col gap-2">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: SLICE_COLORS[slice.tone] }}
            />
            <span className="text-(--color-ink-muted)">{slice.label}</span>
            <span className="ml-auto font-semibold text-(--color-ink)">
              {slice.value === 0 ? '0' : slice.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Recent activity ------------------------------------------------------------

/** The human-facing label for an audit event type (the "what happened" line). */
const ACTIVITY_LABELS: Record<AuditEventType, string> = {
  'login.succeeded': 'signed in',
  'login.failed': 'failed to sign in',
  logout: 'signed out',
  'password.changed': 'changed a password',
  'password.reset_requested': 'requested a password reset',
  'password.reset_completed': 'completed a password reset',
  'account.suspended': 'suspended an account',
  'account.reactivated': 'reactivated an account',
  'account.disabled': 'disabled an account',
  'user.role_changed': 'changed a role',
  'user.deleted': 'deleted a user',
  'admin.bootstrap': 'bootstrapped the deployment',
  'user.registered': 'registered a user',
  'user.onboarding_completed': 'completed onboarding',
  'resident.registered': 'registered a resident',
  'resident.onboarding_completed': 'completed resident onboarding',
  'resident.payment_recorded': 'recorded a payment',
  'resident.payment_submitted': 'submitted a payment reference',
  'resident.deleted': 'deleted a resident draft',
  'estate.created': 'created an estate',
  'estate.updated': 'updated an estate',
  'estate.status_changed': 'changed an estate status',
  'estate.deleted': 'deleted an estate',
  'property.created': 'created a property',
  'property.updated': 'updated a property',
  'property.status_changed': 'changed a property status',
  'property.deleted': 'deleted a property',
  'import.previewed': 'previewed an import',
  'import.completed': 'completed an import',
  'import.commit_failed': 'an import commit failed',
  'propertyOptions.updated': 'updated property options',
  'resident.profile_updated': 'updated their profile',
  'resident.invoice_created': 'created a resident invoice',
  'resident.code_generated': 'generated an access code',
  'resident.code_extended': 'extended an access code',
  'resident.code_deactivated': 'deactivated an access code',
  'resident.complaint_created': 'filed a complaint',
};

type ActivityTone = 'success' | 'danger' | 'warning' | 'neutral';

function activityTone(event: AuditEventDto): ActivityTone {
  if (event.outcome === 'failure') return 'danger';
  switch (event.eventType) {
    case 'import.commit_failed':
    case 'login.failed':
    case 'user.deleted':
    case 'estate.deleted':
    case 'property.deleted':
    case 'resident.deleted':
      return 'warning';
    case 'login.succeeded':
    case 'resident.payment_recorded':
    case 'import.completed':
      return 'success';
    default:
      return 'neutral';
  }
}

const TONE_CHIPS: Record<ActivityTone, string> = {
  success: 'bg-emerald-50 text-emerald-700',
  danger: 'bg-rose-50 text-rose-700',
  warning: 'bg-amber-50 text-amber-700',
  neutral: 'bg-slate-100 text-slate-700',
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

function eventSummary(event: AuditEventDto): string {
  // The audit metadata is safe, non-secret key/value pairs (passwords, tokens
  // and request bodies are stripped at write time), so the small display
  // fields it carries may be shown.
  const metadata = event.metadata ?? {};
  const target = (metadata.targetName ?? metadata.identifier ?? metadata.slug ?? '') as
    string | undefined;
  const who = (metadata.actorEmail ?? metadata.email ?? metadata.fullName ?? '') as
    string | undefined;
  const label = ACTIVITY_LABELS[event.eventType] ?? event.eventType;

  if (target && who && target !== who) return `${who} ${label} — ${target}`;
  if (who) return `${who} ${label}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The dashboard's compact activity feed: the 5 most recent audit events and a
 * "View all" link to the full activity page. The full history with cursor
 * pagination lives on the `/app/activity` route.
 */
export function RecentActivityPanel({
  events,
  loading,
  denied,
}: {
  events: AuditEventDto[] | null;
  loading: boolean;
  denied: boolean;
}) {
  return (
    <section
      aria-label="Recent activity"
      className="rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card)"
    >
      <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4">
        <div className="flex items-center gap-2">
          <History aria-hidden size={16} className="text-(--color-primary)" />
          <h2 className="text-sm font-semibold text-(--color-ink)">Recent activity</h2>
        </div>
        {denied ? (
          <p className="text-[11px] text-(--color-ink-muted)">No access</p>
        ) : (
          <Link
            to="/app/activity"
            className="text-xs font-medium text-(--color-primary) hover:underline"
          >
            View all
          </Link>
        )}
      </div>

      <div className="p-5">
        {loading ? (
          <ul className="flex flex-col gap-3" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-slate-200" />
                <span className="h-3 flex-1 animate-pulse rounded bg-slate-200" />
                <span className="h-3 w-16 shrink-0 animate-pulse rounded bg-slate-200" />
              </li>
            ))}
          </ul>
        ) : denied ? (
          <p className="text-xs text-(--color-ink-muted)">
            Your role does not have read access to the audit log.
          </p>
        ) : !events || events.length === 0 ? (
          <p className="text-xs text-(--color-ink-muted)">No events recorded yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {events.map((event) => (
              <ActivityRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** One audit event, shared by the dashboard feed and the full activity page. */
export function ActivityRow({ event }: { event: AuditEventDto }) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
          activityTone(event) === 'neutral'
            ? 'bg-slate-300'
            : activityTone(event) === 'success'
              ? 'bg-emerald-500'
              : activityTone(event) === 'warning'
                ? 'bg-amber-500'
                : 'bg-rose-500'
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-(--color-ink)">{eventSummary(event)}</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE_CHIPS[activityTone(event)]}`}
      >
        {ACTIVITY_LABELS[event.eventType] ?? event.eventType}
      </span>
      <span className="w-20 shrink-0 text-right text-[11px] text-(--color-ink-muted)">
        {relativeTime(event.createdAt)}
      </span>
    </li>
  );
}

// --- System health strip --------------------------------------------------------

/**
 * The Phase-0 system-health strip, re-used on the dashboard. Mirrors
 * `useSystemHealth`'s polling contract (30-second interval) so the overview
 * still surfaces a deployment's health next to its business KPIs.
 */
export interface SystemHealthState {
  loading: boolean;
  error: string | null;
  databaseOk: boolean;
  databaseLatencyMs: number | null;
  status: string;
}

export function useDashboardHealth(): SystemHealthState {
  const [state, setState] = useState<SystemHealthState>({
    loading: true,
    error: null,
    databaseOk: false,
    databaseLatencyMs: null,
    status: 'unknown',
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch('/api/v1/health/ready');
        const body = (await response.json()) as {
          status: string;
          checks: { database: { status: string; latencyMs?: number } };
        };
        if (!cancelled) {
          setState({
            loading: false,
            error: response.ok ? null : `health endpoint returned ${response.status}`,
            databaseOk: body?.checks?.database?.status === 'ok',
            databaseLatencyMs: body?.checks?.database?.latencyMs ?? null,
            status: body?.status ?? 'unknown',
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error instanceof Error ? error.message : 'request failed',
            databaseOk: false,
            databaseLatencyMs: null,
            status: 'unknown',
          });
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return state;
}

export function SystemHealthStrip() {
  const { loading, error, databaseOk, databaseLatencyMs, status } = useDashboardHealth();

  const tone = loading
    ? 'bg-slate-100 text-slate-500'
    : databaseOk
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-rose-50 text-rose-700';

  return (
    <section
      aria-label="System status"
      className="flex flex-col gap-4 rounded-(--radius-card) border border-slate-200/80 bg-white p-5 shadow-(--shadow-card) sm:flex-row sm:items-center"
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${tone}`}>
          {loading ? (
            <Network aria-hidden size={16} />
          ) : databaseOk ? (
            <CircleCheck aria-hidden size={16} />
          ) : (
            <CircleAlert aria-hidden size={16} />
          )}
        </span>
        <div>
          <p className="text-sm font-semibold text-(--color-ink)">System status</p>
          <p className="text-xs text-(--color-ink-muted)">
            {loading
              ? 'Checking…'
              : error
                ? 'Unreachable'
                : `${status === 'ok' ? 'Ready' : 'Degraded'}`}
          </p>
        </div>
      </div>

      <dl className="grid flex-1 grid-cols-2 gap-3 sm:max-w-sm sm:grid-cols-3">
        <HealthMetric
          label="Application"
          value={loading ? '…' : 'OK'}
          icon={<Network aria-hidden size={12} />}
        />
        <HealthMetric
          label="Database"
          value={loading ? '…' : databaseOk ? 'Ready' : 'Down'}
          detail={databaseLatencyMs != null ? `${databaseLatencyMs} ms` : undefined}
          icon={<Database aria-hidden size={12} />}
        />
        <HealthMetric
          label="Uptime"
          value={loading ? '…' : status}
          icon={<ShieldCheck aria-hidden size={12} />}
        />
      </dl>
    </section>
  );
}

function HealthMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-(--color-surface) p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-(--color-ink-muted)">
        <span className="text-(--color-primary)">{icon}</span>
        {label}
      </div>
      <p className="mt-1.5 text-sm font-semibold text-(--color-ink)">{value}</p>
      {detail && <p className="text-[11px] text-(--color-ink-muted)">{detail}</p>}
    </div>
  );
}

// --- Property status chart card -------------------------------------------------

export function PropertyStatusCard({
  total,
  active,
  linkTo,
}: {
  total: number | null;
  active: number | null;
  /** Optional link to the properties list (hidden when the role lacks `property.read`). */
  linkTo?: string;
}) {
  const archived = total != null && active != null ? Math.max(0, total - active) : null;

  const slices: PropertyStatusSlice[] = [
    { label: 'Active', value: active ?? 0, tone: 'success' },
    { label: 'Archived', value: archived ?? 0, tone: 'neutral' },
  ];

  return (
    <section
      aria-label="Property status"
      className="rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card)"
    >
      <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4">
        <div className="flex items-center gap-2">
          <ClipboardList aria-hidden size={16} className="text-(--color-primary)" />
          <h2 className="text-sm font-semibold text-(--color-ink)">Properties by status</h2>
        </div>
        {linkTo && total != null && (
          <Link to={linkTo} className="text-xs font-medium text-(--color-primary) hover:underline">
            View all
          </Link>
        )}
      </div>
      <div className="p-5">
        {total === null && active === null ? (
          <p className="text-xs text-(--color-ink-muted)">
            Your role does not have read access to the property registry.
          </p>
        ) : (
          <DonutChart slices={slices} />
        )}
      </div>
    </section>
  );
}
