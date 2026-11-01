import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, ChevronRight, Mail, Phone, Search, Siren } from 'lucide-react';
import {
  SOS_CONTACT_CATEGORY_LABELS,
  type SosOperatorEventDto,
  type SosStatus,
} from '@silverstone/shared';
import { api, ApiRequestError, type OperatorSosFilter } from '../api/client';
import { useApiQuery } from '../api/query';
import { queryKeys } from '../api/query-keys';
import { invalidateNavigationCounts } from '../api/navigation';
import { useCan } from '../auth/useCan';
import { useToast } from '../toast/Toast';
import { Modal } from '../components/dialog';
import { Button, ErrorBanner, Field, Skeleton, inputClass, selectClass } from '../components/ui';
import { FilterBar, StatusBadge } from '../components/operator';
import { formatDateTime } from '../lib/format';

export type SosView = 'ACTIVE' | 'ALL' | SosStatus;

const VIEW_OPTIONS: ReadonlyArray<{ value: SosView; label: string }> = [
  { value: 'ACTIVE', label: 'Active alerts' },
  { value: 'ALL', label: 'All alerts' },
  { value: 'RAISED', label: 'Raised' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'RESOLVED', label: 'Resolved' },
];

const POLL_INTERVAL_MS = 15_000;

const CARD_TONES: Record<SosStatus, string> = {
  RAISED: 'border-l-rose-500 bg-rose-50/40',
  ACKNOWLEDGED: 'border-l-amber-500 bg-amber-50/30',
  RESOLVED: 'border-l-slate-300 bg-white',
};

const ICON_TONES: Record<SosStatus, string> = {
  RAISED: 'bg-rose-100 text-rose-700',
  ACKNOWLEDGED: 'bg-amber-100 text-amber-700',
  RESOLVED: 'bg-slate-100 text-slate-500',
};

/** Build the API filter for a queue view. */
export function filterForView(view: SosView, estateId = ''): OperatorSosFilter {
  const estateFilter = estateId ? { estateId } : {};
  if (view === 'ACTIVE') return { active: true, ...estateFilter };
  if (view === 'ALL') return estateFilter;
  return { status: view, ...estateFilter };
}

export function sosStatusLabel(status: SosStatus): string {
  switch (status) {
    case 'RAISED':
      return 'Raised';
    case 'ACKNOWLEDGED':
      return 'Acknowledged';
    case 'RESOLVED':
      return 'Resolved';
  }
}

export function sosResidentLabel(event: SosOperatorEventDto): string {
  return event.resident?.fullName ?? event.resident?.email ?? 'Resident account unavailable';
}

export function sosPropertyLabel(event: SosOperatorEventDto): string {
  if (!event.property) return 'No property assigned';
  const property = [event.property.identifier, event.property.name].filter(Boolean).join(' · ');
  return `${property} · ${event.property.estate.name}`;
}

export function sosMatchesSearch(event: SosOperatorEventDto, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return [
    sosResidentLabel(event),
    event.resident?.email ?? '',
    event.resident?.phone ?? '',
    sosPropertyLabel(event),
    event.note ?? '',
    event.resolutionNote ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(query);
}

/**
 * Operator SOS queue.
 *
 * Alerts are pulled every 15 seconds while this screen is open (there is no
 * external paging provider). The lifecycle is RAISED → ACKNOWLEDGED →
 * RESOLVED; the API enforces it and stores the acting operator. `sos.read`
 * lets auditors see the queue, while only `sos.manage` renders the actions.
 */
export function SosAlertsPage() {
  const can = useCan();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState<SosView>('ACTIVE');
  const [estateId, setEstateId] = useState('');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<SosOperatorEventDto | null>(null);

  const filter = useMemo(() => filterForView(view, estateId), [view, estateId]);
  const { data: estateData } = useApiQuery(
    ['estates', {}],
    () => api.listEstates(),
    'Could not load estates.',
  );
  const estates = estateData?.estates ?? [];
  const sosKey = queryKeys.sos.list(filter);
  const {
    data,
    loading,
    error: queryError,
    errorObject,
    refresh,
  } = useApiQuery(sosKey, () => api.listOperatorSos(filter), 'Could not load SOS alerts.', true, {
    refetchInterval: POLL_INTERVAL_MS,
  });

  const events = data?.events ?? [];
  const contacts = data?.contacts ?? [];
  const visibleEvents = search.trim()
    ? events.filter((event) => sosMatchesSearch(event, search))
    : events;
  const canManage = can['sos.manage'];
  const queryErrorText =
    errorObject instanceof ApiRequestError && errorObject.code === 'FORBIDDEN'
      ? 'You no longer have permission to view SOS alerts.'
      : queryError;

  async function acknowledge(event: SosOperatorEventDto) {
    setBusyId(event.id);
    setActionError(null);
    try {
      await api.acknowledgeOperatorSos(event.id);
      toast.success(`Acknowledged the SOS alert for ${sosResidentLabel(event)}.`);
      await Promise.all([refresh(), invalidateNavigationCounts(queryClient)]);
    } catch (err) {
      setActionError(
        err instanceof ApiRequestError ? err.message : 'Could not acknowledge the alert.',
      );
    } finally {
      setBusyId(null);
    }
  }

  function resolved(updated: SosOperatorEventDto) {
    setResolving(null);
    toast.success(`Resolved the SOS alert for ${sosResidentLabel(updated)}.`);
    void Promise.all([refresh(), invalidateNavigationCounts(queryClient)]);
  }

  return (
    <div className="min-w-0">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-sm text-slate-500">
        <span>Front Desk</span>
        <ChevronRight aria-hidden size={14} />
        <span className="font-medium text-slate-800" aria-current="page">
          SOS alerts
        </span>
      </nav>

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <Siren aria-hidden size={26} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">SOS alerts</h1>
            <p className="mt-1 max-w-2xl text-base leading-6 text-slate-600">
              Emergency alerts raised by residents. This screen refreshes automatically.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:pt-1">
          <span className="inline-flex items-center gap-2 text-sm text-slate-600">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live · every 15s
          </span>
        </div>
      </header>

      {contacts.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200/80 bg-white px-4 py-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-(--color-ink-muted)">
            Emergency contacts
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1.5">
            {contacts.map((contact) => (
              <li key={contact.id} className="text-base">
                <span className="text-(--color-ink-muted)">
                  {SOS_CONTACT_CATEGORY_LABELS[contact.category]}:
                </span>{' '}
                <a
                  href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}
                  className="inline-flex items-center gap-1 font-medium text-(--color-primary) hover:underline"
                >
                  <Phone aria-hidden size={11} />
                  {contact.label} · {contact.phone}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FilterBar
        summary={
          <span role="status" aria-live="polite">
            {view === 'ACTIVE' ? `${visibleEvents.length} active` : `${visibleEvents.length} shown`}
          </span>
        }
      >
        <select
          value={estateId}
          onChange={(event) => setEstateId(event.target.value)}
          aria-label="Filter SOS alerts by estate"
          className={`${selectClass} min-h-11 w-full rounded-lg bg-white text-base sm:w-auto`}
          style={{ fontSize: '16px' }}
        >
          <option value="">All estates</option>
          {estates.map((estate) => (
            <option key={estate.id} value={estate.id}>
              {estate.name}
            </option>
          ))}
        </select>
        <div className="relative w-full sm:w-[360px] sm:flex-none">
          <Search
            aria-hidden
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-ink-muted)"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search resident, property or alert…"
            aria-label="Search SOS alerts"
            className="h-11 w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-base outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
            style={{ fontSize: '16px' }}
          />
        </div>
        <select
          value={view}
          onChange={(event) => setView(event.target.value as SosView)}
          aria-label="Filter SOS alerts"
          className={`${selectClass} min-h-11 w-full rounded-lg bg-white text-base sm:w-auto`}
          style={{ fontSize: '16px' }}
        >
          {VIEW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FilterBar>

      {actionError && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {actionError}
        </p>
      )}

      {queryErrorText ? (
        <div className="mt-4">
          <ErrorBanner message={queryErrorText} onRetry={() => void refresh()} />
        </div>
      ) : loading ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton
              key={`sos-skeleton-${index}`}
              className="h-36 w-full rounded-(--radius-card)"
            />
          ))}
        </div>
      ) : visibleEvents.length === 0 ? (
        <section className="mt-4 flex min-h-[204px] flex-col items-center justify-center rounded-xl border border-slate-200/80 bg-white px-5 py-8 text-center shadow-[0_2px_10px_rgba(15,23,42,0.035)] sm:min-h-[224px]">
          <span className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 text-orange-600">
            <Siren aria-hidden size={36} strokeWidth={1.7} />
          </span>
          <h2 className="text-base font-semibold text-slate-900">
            {search.trim() ? 'No alerts match your search' : 'No SOS alerts in this view'}
          </h2>
          <p className="mt-1 max-w-xl text-base leading-6 text-slate-600">
            {search.trim()
              ? 'Clear the search or switch to another queue view.'
              : 'New resident alerts appear here automatically while the screen is open.'}
          </p>
        </section>
      ) : (
        <ul className="mt-4 space-y-3">
          {visibleEvents.map((event) => (
            <SosAlertCard
              key={event.id}
              event={event}
              canManage={canManage}
              busy={busyId === event.id}
              onAcknowledge={() => void acknowledge(event)}
              onResolve={() => setResolving(event)}
            />
          ))}
        </ul>
      )}

      {resolving && (
        <ResolveSosDialog
          event={resolving}
          onClose={() => setResolving(null)}
          onResolved={resolved}
        />
      )}
    </div>
  );
}

function SosAlertCard({
  event,
  canManage,
  busy,
  onAcknowledge,
  onResolve,
}: {
  event: SosOperatorEventDto;
  canManage: boolean;
  busy: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
}) {
  const resident = event.resident;
  return (
    <li
      className={`rounded-xl border border-slate-200/80 border-l-4 p-4 shadow-(--shadow-card) sm:p-5 ${CARD_TONES[event.status]}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${ICON_TONES[event.status]}`}
          >
            <Siren aria-hidden size={22} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                status={event.status}
                label={sosStatusLabel(event.status)}
                tone={event.status === 'RAISED' ? 'danger' : undefined}
              />
              <span className="text-sm text-(--color-ink-muted)">
                Raised {formatDateTime(event.raisedAt)}
              </span>
            </div>
            <h2 className="mt-1 break-words text-base font-semibold text-(--color-ink)">
              {sosResidentLabel(event)}
            </h2>
            <p className="break-words text-sm leading-5 text-(--color-ink-muted)">
              {sosPropertyLabel(event)}
            </p>
            {resident && (
              <div className="mt-2 flex flex-col items-start gap-1.5 text-sm text-(--color-ink-muted) sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                <a
                  href={`mailto:${resident.email}`}
                  className="inline-flex items-center gap-1 hover:text-(--color-primary)"
                >
                  <Mail aria-hidden size={15} />
                  {resident.email}
                </a>
                {resident.phone && (
                  <a
                    href={`tel:${resident.phone}`}
                    className="inline-flex items-center gap-1 hover:text-(--color-primary)"
                  >
                    <Phone aria-hidden size={15} />
                    {resident.phone}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:pt-1">
          {!canManage && event.status !== 'RESOLVED' && (
            <span className="text-[11px] text-(--color-ink-muted)">Read-only</span>
          )}
          {canManage && event.status === 'RAISED' && (
            <Button
              size="sm"
              onClick={onAcknowledge}
              disabled={busy}
              className="min-h-11 w-full rounded-lg text-base sm:w-auto"
            >
              <Check aria-hidden size={18} />
              {busy ? 'Acknowledging…' : 'Acknowledge'}
            </Button>
          )}
          {canManage && event.status === 'ACKNOWLEDGED' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onResolve}
              disabled={busy}
              className="min-h-11 w-full rounded-lg text-base sm:w-auto"
            >
              <CheckCircle2 aria-hidden size={18} />
              Resolve
            </Button>
          )}
        </div>
      </div>

      {event.note ? (
        <blockquote className="mt-3 rounded-lg border-l-2 border-slate-300 bg-white/75 px-3 py-3 text-base leading-6 text-(--color-ink)">
          {event.note}
        </blockquote>
      ) : (
        <p className="mt-3 text-sm text-(--color-ink-muted)">No note supplied by the resident.</p>
      )}

      <dl className="mt-4 grid divide-y divide-slate-200/80 text-sm text-(--color-ink-muted) sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="py-2 sm:py-0 sm:pr-4">
          <dt className="text-xs font-medium uppercase tracking-wide">Raised</dt>
          <dd>{formatDateTime(event.raisedAt)}</dd>
        </div>
        <div className="py-2 sm:px-4 sm:py-0">
          <dt className="text-xs font-medium uppercase tracking-wide">Acknowledged</dt>
          <dd>
            {event.acknowledgedAt
              ? `${formatDateTime(event.acknowledgedAt)}${
                  event.acknowledgedBy
                    ? ` · ${event.acknowledgedBy.fullName ?? event.acknowledgedBy.email}`
                    : ''
                }`
              : 'Pending'}
          </dd>
        </div>
        <div className="py-2 sm:py-0 sm:pl-4">
          <dt className="text-xs font-medium uppercase tracking-wide">Resolved</dt>
          <dd>
            {event.resolvedAt
              ? `${formatDateTime(event.resolvedAt)}${
                  event.resolvedBy
                    ? ` · ${event.resolvedBy.fullName ?? event.resolvedBy.email}`
                    : ''
                }`
              : 'Pending'}
          </dd>
        </div>
      </dl>

      {event.resolutionNote && (
        <div className="mt-3 rounded-md bg-slate-100/80 px-3 py-2 text-xs text-(--color-ink)">
          <p className="font-medium text-(--color-ink-muted)">Internal resolution note</p>
          <p className="mt-0.5">{event.resolutionNote}</p>
        </div>
      )}
    </li>
  );
}

function ResolveSosDialog({
  event,
  onClose,
  onResolved,
}: {
  event: SosOperatorEventDto;
  onClose: () => void;
  onResolved: (event: SosOperatorEventDto) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.resolveOperatorSos(event.id, {
        ...(note.trim() ? { resolutionNote: note.trim() } : {}),
      });
      onResolved(result.event);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not resolve the alert.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Resolve SOS alert">
      <form onSubmit={(submitEvent) => void submit(submitEvent)}>
        <p className="text-sm text-(--color-ink)">
          Resolve the alert raised by <strong>{sosResidentLabel(event)}</strong> at{' '}
          {sosPropertyLabel(event)}.
        </p>
        <p className="mt-1 text-sm text-(--color-ink-muted)">
          Resolution is final. The resident sees the status and timestamps, but not the internal
          note below.
        </p>
        <div className="mt-4">
          <Field
            label="Internal resolution note (optional)"
            hint="Visible to staff only. Up to 500 characters."
          >
            <textarea
              value={note}
              onChange={(changeEvent) => setNote(changeEvent.target.value)}
              maxLength={500}
              rows={4}
              placeholder="What was done to close the alert?"
              className={`${inputClass} min-h-28 resize-y text-base`}
              style={{ fontSize: '16px' }}
            />
          </Field>
          <p className="mt-1 text-right text-[11px] text-(--color-ink-muted)">{note.length}/500</p>
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            <CheckCircle2 aria-hidden size={14} />
            {busy ? 'Resolving…' : 'Resolve alert'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
