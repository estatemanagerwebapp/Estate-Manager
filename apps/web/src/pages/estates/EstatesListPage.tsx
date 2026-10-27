import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Building2, RefreshCw, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { type EstateDto, type EstateStatus, ESTATE_STATUSES } from '@silverstone/shared';
import { api, ApiRequestError, type EstateFilter } from '../../api/client';
import { useApiQuery } from '../../api/query';
import { useCan } from '../../auth/useCan';
import { useToast } from '../../toast/Toast';
import { useConfirm } from '../../components/dialog';
import { Button, Badge, statusTone } from '../../components/ui';

/**
 * Estates list. Mirrors the API's `GET /estates` query params
 * (`search`, `status`). The list is intentionally light — property counts
 * live on the estate detail screen (per the approved plan), so this page
 * does one fetch and no N+1 detail calls.
 */
export function EstatesListPage() {
  const can = useCan();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | EstateStatus>('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

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
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not delete the estate.');
    } finally {
      setActing(null);
    }
  }

  return (
    <div>
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-primary-soft)">
            <Building2 aria-hidden size={20} className="text-(--color-primary)" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Estates</h1>
            <p className="text-sm text-(--color-ink-muted)">
              Property portfolios under this organization
            </p>
          </div>
        </div>
        {can['estate.manage'] && (
          <Link to="/app/estates/new">
            <Button>New estate</Button>
          </Link>
        )}
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            aria-hidden
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-ink-muted)"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or slug"
            aria-label="Search estates"
            className="w-56 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as '' | EstateStatus)}
          aria-label="Filter by status"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
        >
          <option value="">All statuses</option>
          {ESTATE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          <RefreshCw aria-hidden size={13} />
          Refresh
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card)">
        {loading ? (
          <p className="p-6 text-sm text-(--color-ink-muted)" role="status">
            Loading estates…
          </p>
        ) : estates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="text-sm font-medium text-(--color-ink)">No estates yet</p>
            <p className="text-xs text-(--color-ink-muted)">
              {can['estate.manage']
                ? 'Create your first estate to start registering properties.'
                : 'Ask an administrator to create an estate.'}
            </p>
            {can['estate.manage'] && (
              <Link to="/app/estates/new" className="mt-1">
                <Button size="sm">
                  <Plus aria-hidden size={14} />
                  New estate
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-(--color-surface) text-xs text-(--color-ink-muted)">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Slug
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Updated
                </th>
                {can['estate.manage'] && (
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {estates.map((estate) => (
                <tr key={estate.id} className="hover:bg-(--color-surface)">
                  <td className="px-4 py-3">
                    <Link
                      to={`/app/estates/${estate.id}`}
                      className="font-medium text-(--color-ink) hover:text-(--color-primary)"
                    >
                      {estate.name}
                    </Link>
                    {estate.address && (
                      <p className="text-[11px] text-(--color-ink-muted)">{estate.address}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-(--color-ink-muted)">{estate.slug}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(estate.status)}>{estate.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-(--color-ink-muted)">
                    {new Date(estate.updatedAt).toLocaleDateString()}
                  </td>
                  {can['estate.manage'] && (
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void deleteEstate(estate)}
                        disabled={acting === estate.id}
                        aria-label={`Delete ${estate.name}`}
                        title="Delete estate"
                      >
                        <Trash2 aria-hidden size={13} />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
