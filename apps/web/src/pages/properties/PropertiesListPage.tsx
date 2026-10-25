import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { api, ApiRequestError, type EstateFilter } from '../../api/client';
import { usePropertyOptions, registerableAssetTypes } from '../../api/hooks';
import { useCan } from '../../auth/useCan';
import {
  Button,
  Badge,
  statusTone,
  EmptyState,
  selectClass,
  Card,
  CardHeader,
} from '../../components/ui';
import type { EstateDto, PropertyListResponse } from '@silverstone/shared';

/**
 * Org-wide properties list (decision #1: properties are estate-scoped on the
 * server, so the screen exposes an estate picker that filters the list).
 */
export function PropertiesListPage() {
  const can = useCan();
  const { view } = usePropertyOptions(true);

  const [estates, setEstates] = useState<EstateDto[]>([]);
  const [estateId, setEstateId] = useState('');
  const [typeKey, setTypeKey] = useState('');
  const [status, setStatus] = useState('');
  const [identifierSearch, setIdentifierSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  const [list, setList] = useState<PropertyListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listEstates({} as EstateFilter)
      .then((body) => {
        if (!cancelled) setEstates(body.estates);
      })
      .catch(() => {
        /* estates picker degrades gracefully; property list still works */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const body = await api.listProperties({
        estateId: estateId || undefined,
        typeKey: typeKey || undefined,
        status: status || undefined,
        identifierContains: identifierSearch.trim() || undefined,
        page,
        pageSize,
      });
      setList(body);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load properties.');
    } finally {
      setLoading(false);
    }
  }, [estateId, typeKey, status, identifierSearch, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const types = registerableAssetTypes(view);

  return (
    <div>
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-primary-soft)">
          <Home aria-hidden size={20} className="text-(--color-primary)" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Properties</h1>
          <p className="text-sm text-(--color-ink-muted)">
            Register a property under an estate, or bulk-import with an .xlsx workbook.
          </p>
        </div>
      </header>

      <Card aria-label="Property filters" className="mt-6">
        <CardHeader title="Filters" />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <select
            value={estateId}
            onChange={(event) => {
              setEstateId(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by estate"
            className={selectClass}
          >
            <option value="">All estates</option>
            {estates.map((estate) => (
              <option key={estate.id} value={estate.id}>
                {estate.name}
              </option>
            ))}
          </select>
          <select
            value={typeKey}
            onChange={(event) => {
              setTypeKey(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by type"
            className={selectClass}
          >
            <option value="">All types</option>
            {types.map((type) => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className={selectClass}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
          <input
            type="search"
            value={identifierSearch}
            onChange={(event) => {
              setIdentifierSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Identifier contains…"
            aria-label="Search by identifier"
            className="w-48 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
          />
        </div>
      </Card>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-4">
        {loading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-(--color-ink-muted)" role="status">
            <LoaderCircle aria-hidden size={14} className="animate-spin" />
            Loading properties…
          </p>
        ) : !list || list.properties.length === 0 ? (
          <EmptyState
            title="No properties match"
            body={
              can['property.manage']
                ? 'Open an estate to register a property, or bulk-import from the Imports tab.'
                : 'Properties appear here once they are registered.'
            }
            action={
              estates.length > 0 && estates[0] ? (
                <Link to={`/app/estates/${estates[0].id}`}>
                  <Button size="sm">Open {estates[0].name}</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card)">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200/80 bg-(--color-surface) text-xs text-(--color-ink-muted)">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Identifier
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Type
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.properties.map((property) => (
                    <tr key={property.id} className="hover:bg-(--color-surface)">
                      <td className="px-4 py-3">
                        <Link
                          to={`/app/properties/${property.id}`}
                          className="font-medium text-(--color-ink) hover:text-(--color-primary)"
                        >
                          {property.identifier}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-(--color-ink-muted)">
                        {property.typeLabel || property.typeKey}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(property.status)}>{property.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-(--color-ink-muted)">
                        {new Date(property.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-(--color-ink-muted)">
              <span>
                Page {list.page} of {Math.max(1, Math.ceil(list.total / list.pageSize))} ·{' '}
                {list.total} total
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={list.page <= 1}
                >
                  <ChevronLeft aria-hidden size={13} />
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setPage((current) =>
                      Math.min(Math.ceil(list.total / list.pageSize), current + 1),
                    )
                  }
                  disabled={list.page >= Math.ceil(list.total / list.pageSize)}
                >
                  Next
                  <ChevronRight aria-hidden size={13} />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
