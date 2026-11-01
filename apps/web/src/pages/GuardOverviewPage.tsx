import { Link, useNavigate } from 'react-router-dom';
import { ScanLine, ShieldCheck, Siren } from 'lucide-react';
import {
  ROLE_LABELS,
  type AccessVerificationDto,
  type GuardOverviewDto,
  type OperatorAccessCodeDto,
  type SosOperatorEventDto,
} from '@silverstone/shared';
import { useGuardOverview } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { useCan } from '../auth/useCan';
import { Countdown } from '../components/Countdown';
import { OperatorPageHeader, StatusBadge } from '../components/operator';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Skeleton,
} from '../components/ui';
import {
  accessCodeVisitorLabel,
  verificationOutcomeLabel,
  verificationOutcomeTone,
  verificationPropertyLabel,
  verificationResidentLabel,
} from './GatePage';
import { sosPropertyLabel, sosResidentLabel } from './SosAlertsPage';

/** Yes / no summary for the three cards above the two queues. */
export function guardCounters(overview: GuardOverviewDto | null): {
  expected: number | null;
  granted: number | null;
  denied: number | null;
} {
  return {
    expected: overview?.expectedToday ? overview.expectedToday.length : null,
    granted: overview?.verificationsToday?.granted ?? null,
    denied: overview?.verificationsToday?.denied ?? null,
  };
}

/** One-line "who is at the gate" label for an expected visitor row. */
export function expectedVisitorDetail(code: OperatorAccessCodeDto): string {
  const property = code.property
    ? [code.property.identifier, code.property.name].filter(Boolean).join(' · ')
    : null;
  const resident = code.resident?.fullName ?? code.resident?.email ?? null;
  return [property, resident].filter(Boolean).join(' — ') || 'Property not recorded';
}

/**
 * The guard home.
 *
 * Deliberately not the operator overview: a gateman only acts on an SOS alert
 * and the gate. Everything else (estates, properties, billing, complaints,
 * audit) is absent by design, and the server returns `null` for any section
 * the role cannot read so the page hides it rather than showing a zero.
 */
export function GuardOverviewPage() {
  const { user } = useAuth();
  const can = useCan();
  const navigate = useNavigate();
  const { overview, loading, error, refresh } = useGuardOverview(user !== null);

  const counters = guardCounters(overview);
  const activeSos = overview?.activeSos ?? null;
  const sosEvents = overview?.activeSosEvents ?? null;
  const expected = overview?.expectedToday ?? null;
  const recent = overview?.recentVerifications ?? null;

  return (
    <div className="flex flex-col">
      <OperatorPageHeader
        icon={<ShieldCheck aria-hidden size={20} className="text-(--color-primary)" />}
        title="Gate desk"
        description={
          <>
            {user ? `${ROLE_LABELS[user.role]} · ${user.email}` : 'Signed in'}
            {' · '}SOS and gate verification only
          </>
        }
        actions={
          <>
            <Button size="sm" onClick={() => navigate('/app/gate')}>
              <ScanLine aria-hidden size={14} />
              Verify a code
            </Button>
          </>
        }
      />

      <main className="mt-8 flex flex-col gap-6">
        {error && <ErrorBanner message={error} onRetry={() => void refresh()} />}

        <section aria-label="Active SOS alerts">
          <Card className={activeSos && activeSos > 0 ? 'border-l-4 border-l-rose-500' : undefined}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Siren
                    aria-hidden
                    size={16}
                    className={
                      activeSos && activeSos > 0 ? 'text-rose-600' : 'text-(--color-ink-muted)'
                    }
                  />
                  SOS
                </span>
              }
              subtitle="Resident emergency alerts waiting for a guard."
              actions={
                <Link
                  to="/app/sos"
                  className="text-xs font-medium text-(--color-primary) hover:underline"
                >
                  Open SOS queue
                </Link>
              }
            />
            <CardBody>
              {loading ? (
                <Skeleton className="h-20 w-full" />
              ) : activeSos === null || sosEvents === null ? (
                <p className="text-xs text-(--color-ink-muted)">
                  Your role cannot read SOS alerts.
                </p>
              ) : activeSos === 0 ? (
                <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <span className="font-semibold">No active SOS alerts.</span>{' '}
                  <span className="text-xs">The estate is clear right now.</span>
                </div>
              ) : (
                <>
                  <p
                    className="text-sm font-semibold text-rose-700"
                    role="status"
                    aria-live="polite"
                  >
                    {activeSos} active alert{activeSos === 1 ? '' : 's'}
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {sosEvents.map((event) => (
                      <SosRow key={event.id} event={event} />
                    ))}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <CounterCard
            label="Expected today"
            value={counters.expected}
            hint="Visitor codes valid today"
          />
          <CounterCard
            label="Granted today"
            value={counters.granted}
            hint="Successful gate checks"
          />
          <CounterCard
            label="Denied today"
            value={counters.denied}
            hint="Review denials on the gate screen"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Expected today"
              subtitle="Visitors whose code is valid today."
              actions={
                <Link
                  to="/app/gate"
                  className="text-xs font-medium text-(--color-primary) hover:underline"
                >
                  Gate register
                </Link>
              }
            />
            <CardBody>
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : expected === null ? (
                <p className="text-xs text-(--color-ink-muted)">
                  Your role cannot read access codes.
                </p>
              ) : expected.length === 0 ? (
                <EmptyState
                  title="No visitors expected today"
                  body="When a resident issues a visitor code valid today, it appears here."
                />
              ) : (
                <ul className="flex flex-col divide-y divide-slate-100">
                  {expected.map((code) => (
                    <li key={code.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-(--color-ink)">
                          {accessCodeVisitorLabel(code)}
                        </p>
                        <p className="truncate text-xs text-(--color-ink-muted)">
                          {expectedVisitorDetail(code)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone="neutral">{code.kind}</Badge>
                        <span className="text-[11px] text-(--color-ink-muted)">
                          {code.validUntil ? (
                            <Countdown validUntil={code.validUntil} status={code.status} />
                          ) : (
                            'No expiry'
                          )}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent verifications"
              subtitle="Today’s entry and exit checks, newest first."
            />
            <CardBody>
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : recent === null ? (
                <p className="text-xs text-(--color-ink-muted)">
                  Your role cannot read verification history.
                </p>
              ) : recent.length === 0 ? (
                <EmptyState
                  title="No verifications yet today"
                  body="Every entry and exit check you record appears here."
                />
              ) : (
                <ul className="flex flex-col divide-y divide-slate-100">
                  {recent.map((entry) => (
                    <VerificationRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {can['gate.manage'] && (
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-(--color-ink)">
                  Checking someone in or out?
                </p>
                <p className="text-xs text-(--color-ink-muted)">
                  Run an entry or exit verification on the gate screen. Every attempt is recorded.
                </p>
              </div>
              <Button onClick={() => navigate('/app/gate')}>
                <ScanLine aria-hidden size={16} />
                Open gate access
              </Button>
            </CardBody>
          </Card>
        )}
      </main>
    </div>
  );
}

function SosRow({ event }: { event: SosOperatorEventDto }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-rose-100 bg-rose-50/40 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-(--color-ink)">{sosResidentLabel(event)}</p>
        <p className="truncate text-xs text-(--color-ink-muted)">{sosPropertyLabel(event)}</p>
        {event.note && <p className="mt-1 line-clamp-2 text-xs text-(--color-ink)">{event.note}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge status={event.status} />
        <span className="text-[11px] text-(--color-ink-muted)">
          {new Date(event.raisedAt).toLocaleTimeString('en-NG', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </li>
  );
}

function VerificationRow({ entry }: { entry: AccessVerificationDto }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-(--color-ink)">
          {entry.visitorName?.trim() || verificationResidentLabel(entry)}
        </p>
        <p className="truncate text-xs text-(--color-ink-muted)">
          {verificationPropertyLabel(entry)} · {entry.gate}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={verificationOutcomeTone(entry.outcome)}>
          {verificationOutcomeLabel(entry.outcome)}
        </Badge>
        <span className="text-[11px] text-(--color-ink-muted)">
          {new Date(entry.occurredAt).toLocaleTimeString('en-NG', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </li>
  );
}

function CounterCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <div className="rounded-(--radius-card) border border-slate-200/80 bg-white px-4 py-4 shadow-(--shadow-card)">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-(--color-ink-muted)">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-(--color-ink)">
        {value === null ? '—' : value}
      </p>
      <p className="mt-0.5 text-xs text-(--color-ink-muted)">{hint}</p>
    </div>
  );
}
