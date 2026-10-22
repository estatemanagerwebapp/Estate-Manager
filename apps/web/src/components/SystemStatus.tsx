import type { HealthResponse } from '@silverstone/shared';
import { formatNaira } from '@silverstone/shared';
import { CheckCircle2, Clock, Database, Network, ShieldCheck, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface HealthSummary {
  loading: boolean;
  error: string | null;
  health: HealthResponse | null;
}

/**
 * Polls the API's /api/v1/health/ready endpoint and returns a typed summary.
 * The hook is intentionally self-contained so the dashboard page stays dumb.
 */
export function useSystemHealth(): HealthSummary {
  const [state, setState] = useState<HealthSummary>({
    loading: true,
    error: null,
    health: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch('/api/v1/health/ready');
        const body = (await response.json()) as HealthResponse;
        if (!cancelled) {
          setState({
            loading: false,
            error: response.ok ? null : `health endpoint returned ${response.status}`,
            health: body,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: error instanceof Error ? error.message : 'request failed',
            health: null,
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

export function SystemStatusCard() {
  const { loading, error, health } = useSystemHealth();

  const dbOk = health?.checks.database.status === 'ok';
  const status = health?.status ?? 'unknown';

  return (
    <section
      aria-label="System status"
      className="rounded-(--radius-card) border border-slate-200/80 bg-white p-6 shadow-(--shadow-card)"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-(--color-ink)">System status</h2>
          <p className="text-xs text-(--color-ink-muted)">
            {health ? `${health.service} · v${health.version}` : 'Awaiting first response'}
          </p>
        </div>
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
            loading
              ? 'bg-slate-100 text-slate-400'
              : dbOk
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-700'
          }`}
        >
          {loading ? (
            <Clock aria-hidden size={16} />
          ) : dbOk ? (
            <CheckCircle2 aria-hidden size={16} />
          ) : (
            <ShieldCheck aria-hidden size={16} />
          )}
        </span>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric
          label="Application"
          icon={<Network aria-hidden size={14} />}
          value={loading ? '…' : 'OK'}
        />
        <Metric
          label="Database"
          icon={<Database aria-hidden size={14} />}
          value={loading ? '…' : dbOk ? 'Ready' : 'Degraded'}
          detail={
            health?.checks.database.latencyMs != null
              ? `${health.checks.database.latencyMs} ms`
              : undefined
          }
        />
        <Metric label="Status" icon={<ShieldCheck aria-hidden size={14} />} value={status} />
      </dl>
    </section>
  );
}

interface MetricProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  detail?: string;
}

function Metric({ label, value, icon, detail }: MetricProps) {
  return (
    <div className="rounded-md bg-(--color-surface) p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-(--color-ink-muted)">
        <span className="text-(--color-primary)">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-lg font-semibold text-(--color-ink)">{value}</p>
      {detail && <p className="text-xs text-(--color-ink-muted)">{detail}</p>}
    </div>
  );
}

/**
 * Demonstrates the shared money contract: the API persists and returns kobo,
 * the UI formats naira. No other part of the app may print a monetary amount.
 */
export function MoneyContractCard() {
  return (
    <section
      aria-label="Money contract"
      className="rounded-(--radius-card) border border-slate-200/80 bg-white p-6 shadow-(--shadow-card)"
    >
      <div className="flex items-center gap-2">
        <Wallet aria-hidden size={16} className="text-(--color-primary)" />
        <h2 className="text-sm font-semibold">Money contract</h2>
      </div>
      <p className="mt-2 text-xs text-(--color-ink-muted)">
        All monetary values are stored as integer kobo and rendered through the shared formatter.
      </p>
      <p className="mt-4 text-2xl font-semibold tracking-tight">{formatNaira(8_950_000)}</p>
      <p className="text-xs text-(--color-ink-muted)">
        8,950,000 kobo rendered with <code>formatNaira()</code>
      </p>
    </section>
  );
}
