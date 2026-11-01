import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Trash2, Home, KeyRound, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { type EstateDto, type EstateStatus, ESTATE_STATUSES } from '@silverstone/shared';
import { api, ApiRequestError, type EstateFilter } from '../../api/client';
import { useCan } from '../../auth/useCan';
import { useToast } from '../../toast/Toast';
import { useConfirm } from '../../components/dialog';
import { Button, Badge, EmptyState, ErrorBanner, Skeleton, statusTone } from '../../components/ui';
import { useApiQuery } from '../../api/query';

/**
 * Estates list and portfolio summary. Estate rows and dashboard counts use
 * their existing API projections; this page does not fetch per-estate detail.
 */
export function EstatesListPage() {
  const can = useCan();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | EstateStatus>('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<'name-asc' | 'name-desc' | 'updated'>('name-asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Debounce the free-text search a touch so we don't fire a request per
  // keystroke; the status filter fires immediately.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filter = useMemo<EstateFilter>(() => {
    const next: EstateFilter = {};
    if (debouncedSearch) next.search = debouncedSearch;
    if (status) next.status = status;
    return next;
  }, [debouncedSearch, status]);

  const { data, loading, error, refresh } = useApiQuery(
    ['estates', filter],
    () => api.listEstates(filter),
    'Could not load estates.',
  );
  const estates = data?.estates ?? [];
  const summary = useApiQuery(
    ['estates', 'summary'],
    () => api.listEstates(),
    'Could not load estate totals.',
  );
  const propertiesSummary = useApiQuery(
    ['dashboard', 'kpis'],
    () => api.getDashboardKpis(),
    'Could not load property totals.',
  );
  const sortedEstates = useMemo(() => {
    const result = [...estates];
    if (sort === 'updated') {
      result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } else {
      result.sort((a, b) => a.name.localeCompare(b.name));
      if (sort === 'name-desc') result.reverse();
    }
    return result;
  }, [estates, sort]);
  const pageCount = Math.max(1, Math.ceil(sortedEstates.length / pageSize));
  const pageEstates = sortedEstates.slice((page - 1) * pageSize, page * pageSize);
  const activeEstateCount = summary.data?.estates.filter(
    (estate) => estate.status === 'ACTIVE',
  ).length;
  const archivedEstateCount = summary.data?.estates.filter(
    (estate) => estate.status === 'ARCHIVED',
  ).length;

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const queryClient = useQueryClient();

  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [acting, setActing] = useState<string | null>(null);

  async function deleteEstate(estate: EstateDto) {
    const ok = await confirm({
      title: 'Permanently delete this estate?',
      body: `The estate "${estate.name}" will be removed along with its import history. This cannot be undone. Estates that still have registered properties cannot be deleted.`,
      danger: true,
    });
    if (!ok) return;
    setActing(estate.id);
    try {
      await api.deleteEstate(estate.id);
      toast.success('Estate deleted.');
      // The overview counters and the property picker are derived from the
      // estate list; mark them stale so the next visit refreshes them once.
      void queryClient.invalidateQueries({ queryKey: ['estates'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'none' });
      queryClient.removeQueries({ queryKey: ['estate', estate.id] });
      await Promise.all([refresh(), summary.refresh(), propertiesSummary.refresh()]);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not delete the estate.');
    } finally {
      setActing(null);
    }
  }

  const totalEstates = summary.data?.total ?? null;
  const totalProperties = propertiesSummary.data?.kpis.totalProperties ?? null;
  const displayValue = (value: number | null | undefined, busy: boolean) =>
    busy ? '—' : (value ?? 'n/a');
  const firstVisible = sortedEstates.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastVisible = Math.min(page * pageSize, sortedEstates.length);

  return (
    <div className="min-w-0">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-sm text-slate-500">
        <span>Portfolio</span>
        <ChevronRight aria-hidden size={14} />
        <span className="font-medium text-slate-800" aria-current="page">
          Estates
        </span>
      </nav>

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Home aria-hidden size={26} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Estates</h1>
            <p className="mt-1 text-base leading-6 text-slate-600">
              Property portfolios under this organization.
            </p>
          </div>
        </div>
        {can['estate.manage'] && (
          <Link
            to="/app/estates/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white transition hover:bg-orange-700 sm:self-auto"
          >
            <Plus aria-hidden size={18} />
            New estate
          </Link>
        )}
      </header>

      <div className="mt-5 flex flex-col gap-2.5 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_2px_10px_rgba(15,23,42,0.035)] sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-[380px]">
          <Search
            aria-hidden
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by name, slug or location…"
            aria-label="Search estates"
            className="h-11 w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-base outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
            style={{ fontSize: '16px' }}
          />
        </div>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as '' | EstateStatus);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-(--color-primary) sm:w-auto"
          style={{ fontSize: '16px' }}
        >
          <option value="">All statuses</option>
          {ESTATE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value === 'ACTIVE' ? 'Active' : 'Archived'}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as typeof sort);
            setPage(1);
          }}
          aria-label="Sort estates"
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-(--color-primary) sm:w-auto"
          style={{ fontSize: '16px' }}
        >
          <option value="name-asc">Sort by name (A–Z)</option>
          <option value="name-desc">Sort by name (Z–A)</option>
          <option value="updated">Recently updated</option>
        </select>
      </div>

      {error && (
        <div className="mt-3">
          <ErrorBanner message={error} onRetry={() => void refresh()} />
        </div>
      )}

      <section
        aria-label="Estate summary"
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <EstateMetric
          label="Total estates"
          value={displayValue(totalEstates, summary.loading)}
          icon={<Home aria-hidden size={21} />}
          tone="orange"
        />
        <EstateMetric
          label="Active estates"
          value={displayValue(activeEstateCount, summary.loading)}
          icon={<span aria-hidden className="h-4 w-4 rounded-full bg-emerald-600" />}
          tone="green"
        />
        <EstateMetric
          label="Inactive estates"
          value={displayValue(archivedEstateCount, summary.loading)}
          icon={<span aria-hidden className="h-4 w-4 rounded-full bg-slate-500" />}
          tone="slate"
        />
        <EstateMetric
          label="Total properties"
          value={displayValue(totalProperties, propertiesSummary.loading)}
          icon={<KeyRound aria-hidden size={21} />}
          tone="orange"
        />
      </section>

      <div className="mt-4" aria-busy={loading}>
        <EstateTable
          estates={pageEstates}
          loading={loading}
          canManage={can['estate.manage']}
          acting={acting}
          emptyTitle={search.trim() ? 'No estates match your search' : 'No estates yet'}
          emptyBody={
            search.trim()
              ? 'Clear the search or change the status filter.'
              : can['estate.manage']
                ? 'Create your first estate to start registering properties.'
                : 'Ask an administrator to create an estate.'
          }
          onDelete={(estate) => void deleteEstate(estate)}
        />
      </div>

      {sortedEstates.length > 0 && (
        <footer className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Showing {firstVisible}–{lastVisible} of {sortedEstates.length} estates
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              aria-label="Estates per page"
              className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-base"
              style={{ fontSize: '16px' }}
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
            </select>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
              className="min-h-10 min-w-10 rounded-lg px-2"
            >
              <ChevronLeft aria-hidden size={18} />
            </Button>
            <span
              className="flex h-10 min-w-10 items-center justify-center rounded-lg bg-orange-600 px-3 text-sm font-semibold text-white"
              aria-current="page"
            >
              {page}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              disabled={page >= pageCount}
              aria-label="Next page"
              className="min-h-10 min-w-10 rounded-lg px-2"
            >
              <ChevronRight aria-hidden size={18} />
            </Button>
          </div>
        </footer>
      )}
      {confirmDialog}
    </div>
  );
}

function EstateMetric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  tone: 'orange' | 'green' | 'slate';
}) {
  const iconTone = {
    orange: 'bg-orange-50 text-orange-600',
    green: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-500',
  }[tone];
  return (
    <section
      aria-label={label}
      className="flex min-h-[94px] items-center gap-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.035)]"
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconTone}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-600">{label}</p>
        <p className="mt-1 text-2xl font-semibold leading-none tracking-tight text-slate-950">
          {value}
        </p>
      </div>
    </section>
  );
}

function EstateTable({
  estates,
  loading,
  canManage,
  acting,
  emptyTitle,
  emptyBody,
  onDelete,
}: {
  estates: EstateDto[];
  loading: boolean;
  canManage: boolean;
  acting: string | null;
  emptyTitle: string;
  emptyBody: string;
  onDelete: (estate: EstateDto) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-xl border border-slate-200/80 bg-white p-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={`estate-row-${index}`} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (estates.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white px-3 shadow-(--shadow-card)">
        <EmptyState title={emptyTitle} body={emptyBody} />
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.035)]">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-slate-200/80 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className="px-5 py-3.5">
              Name
            </th>
            <th scope="col" className="px-4 py-3.5">
              Slug
            </th>
            <th scope="col" className="px-4 py-3.5 text-right">
              Properties
            </th>
            <th scope="col" className="px-4 py-3.5">
              Status
            </th>
            <th scope="col" className="px-4 py-3.5">
              Updated
            </th>
            <th scope="col" className="px-5 py-3.5 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {estates.map((estate) => (
            <tr key={estate.id} className="transition-colors hover:bg-slate-50/80">
              <td className="max-w-[360px] px-5 py-3">
                <Link
                  to={`/app/estates/${estate.id}`}
                  className="font-semibold text-slate-900 hover:text-orange-700"
                >
                  {estate.name}
                </Link>
                {estate.address && (
                  <p className="mt-0.5 truncate text-sm text-slate-500">{estate.address}</p>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">{estate.slug}</td>
              <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-slate-700">
                {estate.propertyCount ?? '—'}
              </td>
              <td className="px-4 py-3">
                <Badge tone={statusTone(estate.status)}>
                  {estate.status === 'ACTIVE' ? 'Active' : 'Archived'}
                </Badge>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                {new Date(estate.updatedAt).toLocaleDateString()}
              </td>
              <td className="px-5 py-3 text-right">
                <div className="inline-flex items-center gap-2">
                  <Link
                    to={`/app/estates/${estate.id}`}
                    className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  >
                    View estate
                  </Link>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(estate)}
                      disabled={acting === estate.id}
                      aria-label={`Delete ${estate.name}`}
                      title="Delete estate"
                      className="min-h-9 min-w-9 rounded-lg text-rose-600"
                    >
                      <Trash2 aria-hidden size={15} />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
