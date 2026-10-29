import { ChevronDown, Download, Eye, FilterX, History } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  AUDIT_EVENT_OUTCOMES,
  AUDIT_EVENT_TYPES,
  AUDIT_TARGET_TYPES,
  type AuditEventDto,
  type AuditEventFilter,
  type AuditEventOutcome,
  type AuditEventType,
  type AuditTargetType,
} from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { apiErrorMessage } from '../../api/query';
import { queryKeys } from '../../api/query-keys';
import { useToast } from '../../toast/Toast';
import { Button, ErrorBanner, inputClass, selectClass } from '../../components/ui';
import {
  DataTable,
  DetailDrawer,
  FilterBar,
  OperatorPageHeader,
  StatusBadge,
  type DataTableColumn,
} from '../../components/operator';

const PAGE_SIZE = 25;

type ActivityFilterState = {
  eventType: AuditEventType | '';
  outcome: AuditEventOutcome | '';
  targetType: AuditTargetType | '';
  from: string;
  to: string;
};

const EMPTY_FILTERS: ActivityFilterState = {
  eventType: '',
  outcome: '',
  targetType: '',
  from: '',
  to: '',
};

/**
 * Group audit event types for the select. The groups mirror the event-name
 * prefix (login, resident, billing, ...), so a new event lands in a sensible
 * group without another hand-maintained list.
 */
const EVENT_GROUP_LABELS: Record<string, string> = {
  login: 'Sign-in',
  password: 'Password',
  account: 'Account',
  user: 'Users',
  admin: 'Deployment',
  resident: 'Residents',
  estate: 'Estates',
  property: 'Properties',
  import: 'Imports',
  settings: 'Settings',
  complaint: 'Complaints',
  message: 'Messages',
  invoice: 'Billing',
  payment: 'Billing',
  access_code: 'Gate access',
  access_verification: 'Gate access',
  facility: 'Facilities',
  booking: 'Bookings',
  sos: 'SOS',
  audit: 'Audit',
};

function eventGroup(eventType: AuditEventType): string {
  const prefix = eventType.includes('.') ? eventType.split('.')[0]! : 'login';
  return EVENT_GROUP_LABELS[prefix] ?? prefix.replaceAll('_', ' ');
}

const EVENT_GROUPS = AUDIT_EVENT_TYPES.reduce<Map<string, AuditEventType[]>>((groups, event) => {
  const label = eventGroup(event);
  const bucket = groups.get(label) ?? [];
  bucket.push(event);
  groups.set(label, bucket);
  return groups;
}, new Map());

function isFiltered(filters: ActivityFilterState): boolean {
  return Boolean(
    filters.eventType || filters.outcome || filters.targetType || filters.from || filters.to,
  );
}

/** Local date input → inclusive UTC ISO bounds. */
export function buildActivityFilter(filters: ActivityFilterState): AuditEventFilter {
  return {
    ...(filters.eventType ? { eventType: filters.eventType } : {}),
    ...(filters.outcome ? { outcome: filters.outcome } : {}),
    ...(filters.targetType ? { targetType: filters.targetType } : {}),
    ...(filters.from ? { from: new Date(`${filters.from}T00:00:00`).toISOString() } : {}),
    ...(filters.to ? { to: new Date(`${filters.to}T23:59:59.999`).toISOString() } : {}),
  };
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function shortId(value: string | null): string {
  return value ? `${value.slice(0, 8)}…` : '—';
}

/**
 * Full audit activity log with server-side filters, event detail and CSV
 * export. Requires `audit.read`; the route is wrapped in `RequirePermission`
 * in `main.tsx`, so this page only renders for roles that can read the log.
 *
 * Filters live in the query key, so changing one starts a fresh cursor chain.
 * The header Refresh re-reads every page that is currently loaded.
 */
export function ActivityPage() {
  const toast = useToast();
  const [filters, setFilters] = useState<ActivityFilterState>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<AuditEventDto | null>(null);
  const [exporting, setExporting] = useState(false);

  const queryFilter = useMemo(() => buildActivityFilter(filters), [filters]);

  const {
    data,
    isLoading,
    isError,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKeys.audit.list(queryFilter),
    queryFn: ({ pageParam }) =>
      api.getAuditEvents({
        ...queryFilter,
        limit: PAGE_SIZE,
        after: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const events = data?.pages.flatMap((page) => page.events) ?? [];
  const error = isError ? apiErrorMessage(queryError, 'Could not load activity.') : null;
  const loading = isLoading;

  const columns: DataTableColumn<AuditEventDto>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (event) => (
        <span className="whitespace-nowrap text-xs text-(--color-ink-muted)">
          {formatTimestamp(event.createdAt)}
        </span>
      ),
    },
    {
      key: 'event',
      header: 'Event',
      cell: (event) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-(--color-ink)">{event.eventType}</p>
          <p className="text-[11px] text-(--color-ink-muted)">
            {event.outcome === 'failure' ? 'Failed action' : 'Completed action'}
          </p>
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      cell: (event) => (
        <span className="text-xs text-(--color-ink-muted)">
          {event.actorEmail ?? (event.actorId ? shortId(event.actorId) : 'System')}
        </span>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      cell: (event) => (
        <span className="text-xs text-(--color-ink-muted)" title={event.targetId ?? undefined}>
          {event.targetType ? event.targetType.replaceAll('_', ' ') : '—'}
          {event.targetId ? ` · ${shortId(event.targetId)}` : ''}
        </span>
      ),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      cell: (event) => (
        <StatusBadge
          status={event.outcome}
          tone={event.outcome === 'success' ? 'success' : 'danger'}
        />
      ),
    },
    {
      key: 'details',
      header: '',
      align: 'right',
      cell: (event) => (
        <Button variant="ghost" size="sm" onClick={() => setSelected(event)}>
          <Eye aria-hidden size={14} />
          View
        </Button>
      ),
    },
  ];

  function updateFilter<Key extends keyof ActivityFilterState>(
    key: Key,
    value: ActivityFilterState[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { blob, filename } = await api.exportAuditEvents(queryFilter);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filename}.`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not export the audit log.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col">
      <OperatorPageHeader
        icon={<History aria-hidden size={20} className="text-(--color-primary)" />}
        title="Activity"
        description="Organization-wide audit log, filters and CSV export. Requires audit read access."
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            <Download aria-hidden size={14} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        }
      />

      <FilterBar
        summary={`${events.length} event${events.length === 1 ? '' : 's'} loaded`}
        actions={
          isFiltered(filters) ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              <FilterX aria-hidden size={14} />
              Clear
            </Button>
          ) : undefined
        }
      >
        <label className="flex items-center gap-1.5 text-xs text-(--color-ink-muted)">
          Event
          <select
            aria-label="Filter by event type"
            className={`${selectClass} w-auto`}
            value={filters.eventType}
            onChange={(event) =>
              updateFilter('eventType', event.target.value as ActivityFilterState['eventType'])
            }
          >
            <option value="">All events</option>
            {[...EVENT_GROUPS.entries()].map(([label, types]) => (
              <optgroup key={label} label={label}>
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-(--color-ink-muted)">
          Outcome
          <select
            aria-label="Filter by outcome"
            className={`${selectClass} w-auto`}
            value={filters.outcome}
            onChange={(event) =>
              updateFilter('outcome', event.target.value as ActivityFilterState['outcome'])
            }
          >
            <option value="">Any outcome</option>
            {AUDIT_EVENT_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {outcome}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-(--color-ink-muted)">
          Target
          <select
            aria-label="Filter by target type"
            className={`${selectClass} w-auto`}
            value={filters.targetType}
            onChange={(event) =>
              updateFilter('targetType', event.target.value as ActivityFilterState['targetType'])
            }
          >
            <option value="">Any target</option>
            {AUDIT_TARGET_TYPES.map((target) => (
              <option key={target} value={target}>
                {target.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-(--color-ink-muted)">
          From
          <input
            type="date"
            aria-label="Filter from date"
            className={`${inputClass} w-auto`}
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => updateFilter('from', event.target.value)}
          />
        </label>

        <label className="flex items-center gap-1.5 text-xs text-(--color-ink-muted)">
          To
          <input
            type="date"
            aria-label="Filter to date"
            className={`${inputClass} w-auto`}
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => updateFilter('to', event.target.value)}
          />
        </label>
      </FilterBar>

      {error && events.length > 0 && (
        <div className="mt-4">
          <ErrorBanner message={error} onRetry={() => void refetch()} />
        </div>
      )}

      <DataTable
        caption="Audit events"
        columns={columns}
        rows={events}
        getRowKey={(event) => event.id}
        loading={loading}
        error={events.length === 0 ? error : null}
        onRetry={() => void refetch()}
        emptyTitle={isFiltered(filters) ? 'No matching events' : 'No events recorded yet'}
        emptyBody={
          isFiltered(filters)
            ? 'Try widening the date range or clearing a filter.'
            : 'Audit events appear here as operators use the console.'
        }
        footer={
          hasNextPage && !loading ? (
            <div className="flex justify-center border-t border-slate-200/80 p-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                <ChevronDown aria-hidden size={14} />
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          ) : undefined
        }
      />

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Audit event"
        subtitle={selected?.eventType}
      >
        {selected && (
          <div className="flex flex-col gap-5 p-5">
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-xs">
              <DetailTerm label="Event ID" value={selected.id} />
              <DetailTerm label="When" value={formatTimestamp(selected.createdAt)} />
              <DetailTerm label="Outcome" value={selected.outcome} />
              <DetailTerm
                label="Actor"
                value={selected.actorEmail ?? selected.actorName ?? selected.actorId ?? 'System'}
              />
              <DetailTerm label="Target type" value={selected.targetType ?? '—'} />
              <DetailTerm label="Target ID" value={selected.targetId ?? '—'} />
              <DetailTerm label="Request ID" value={selected.requestId ?? '—'} />
            </dl>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-ink-muted)">
                Metadata
              </h3>
              <pre className="mt-2 max-h-[50vh] overflow-auto rounded-md bg-slate-50 p-3 text-[11px] leading-relaxed text-(--color-ink)">
                {JSON.stringify(selected.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

function DetailTerm({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-medium text-(--color-ink-muted)">{label}</dt>
      <dd className="break-all text-(--color-ink)">{value}</dd>
    </>
  );
}
