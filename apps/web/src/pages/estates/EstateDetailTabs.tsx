import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  PROPERTY_KINDS,
  PROPERTY_KIND_LABELS,
  type EstateDto,
  type PropertyListResponse,
} from '@silverstone/shared';
import { api } from '../../api/client';
import { useApiQuery } from '../../api/query';
import { useCan } from '../../auth/useCan';
import { useToast } from '../../toast/Toast';
import { Button, Badge, statusTone, EmptyState, selectClass } from '../../components/ui';
import { PropertyRegisterModal } from '../properties/PropertyRegisterModal';

/**
 * Estate-scoped properties list. Lives inside the estate detail "Properties"
 * tab. The register form and the list read the same typed property model.
 *
 * What it does NOT do: re-derive identifiers, re-validate address fields, or
 * decide import validity. The API is the source of truth; the UI just renders
 * what comes back.
 */
export function PropertiesTab({
  estate,
  onPropertiesChanged,
}: {
  estate: EstateDto;
  onPropertiesChanged?: () => void;
}) {
  const can = useCan();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [identifierSearch, setIdentifierSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [registerOpen, setRegisterOpen] = useState(false);

  const filter = useMemo(
    () => ({
      estateId: estate.id,
      kind: kind || undefined,
      status: status || undefined,
      identifierContains: identifierSearch.trim() || undefined,
      page,
      pageSize,
    }),
    [estate.id, kind, status, identifierSearch, page, pageSize],
  );

  const {
    data: list,
    loading,
    error,
    refresh,
  } = useApiQuery(
    ['properties', filter],
    () => api.listProperties(filter),
    'Could not load properties.',
  );

  const estateActive = estate.status === 'ACTIVE';

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <select
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by type"
          className={`${selectClass} min-h-11 w-full text-base sm:min-h-0 sm:w-auto sm:text-sm`}
        >
          <option value="">All types</option>
          {PROPERTY_KINDS.map((option) => (
            <option key={option} value={option}>
              {PROPERTY_KIND_LABELS[option]}
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
          className={`${selectClass} min-h-11 w-full text-base sm:min-h-0 sm:w-auto sm:text-sm`}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="ARCHIVED">ARCHIVED</option>
        </select>
        <div className="relative min-w-0 sm:flex-1 sm:max-w-xs">
          <Search
            aria-hidden
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--color-ink-muted)"
          />
          <input
            type="search"
            value={identifierSearch}
            onChange={(event) => {
              setIdentifierSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search identifier"
            aria-label="Search by identifier"
            className="min-h-11 w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-base outline-none focus:border-(--color-primary) sm:min-h-0 sm:py-1.5 sm:text-sm"
          />
        </div>
        <div className="sm:ml-auto">
          {can['property.manage'] && (
            <Button
              size="md"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => setRegisterOpen(true)}
              disabled={!estateActive}
            >
              <Plus aria-hidden size={13} />
              Register property
            </Button>
          )}
        </div>
      </div>

      {!estateActive && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This estate is archived — new properties can no longer be registered here.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-3">
        {loading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-(--color-ink-muted)" role="status">
            <LoaderCircle aria-hidden size={14} className="animate-spin" />
            Loading properties…
          </p>
        ) : !list || list.properties.length === 0 ? (
          <EmptyState
            title="No properties yet"
            body={
              can['property.manage']
                ? 'Register a property or use the Imports tab to bulk-upload.'
                : 'Properties appear here once they are registered.'
            }
          />
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {list.properties.map((property) => (
                <article
                  key={property.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/app/properties/${property.id}`}
                        className="block truncate text-base font-semibold text-(--color-ink) hover:text-(--color-primary)"
                      >
                        {property.name || property.identifier}
                      </Link>
                      {property.name && (
                        <p className="mt-0.5 break-all text-xs text-(--color-ink-muted)">
                          {property.identifier}
                        </p>
                      )}
                    </div>
                    <Badge tone={statusTone(property.status)}>{property.status}</Badge>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-(--color-ink-muted)">
                      {property.kindLabel}
                      {property.houseTypeLabel ? ` · ${property.houseTypeLabel}` : ''}
                    </span>
                    <span className="shrink-0 text-xs text-(--color-ink-muted)">
                      {new Date(property.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200/80 md:block">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b border-slate-200/80 bg-(--color-surface) text-xs text-(--color-ink-muted)">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Identifier
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Type
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.properties.map((property) => (
                    <tr key={property.id} className="hover:bg-(--color-surface)">
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/app/properties/${property.id}`}
                          className="font-medium text-(--color-ink) hover:text-(--color-primary)"
                        >
                          {property.name || property.identifier}
                        </Link>
                        {property.name && (
                          <p className="mt-0.5 text-xs text-(--color-ink-muted)">
                            {property.identifier}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-(--color-ink-muted)">
                        {property.kindLabel}
                        {property.houseTypeLabel ? ` · ${property.houseTypeLabel}` : ''}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={statusTone(property.status)}>{property.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-(--color-ink-muted)">
                        {new Date(property.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination list={list} page={page} onPage={setPage} />
          </>
        )}
      </div>

      {registerOpen && (
        <PropertyRegisterModal
          estate={estate}
          onClose={() => setRegisterOpen(false)}
          onCreated={(property) => {
            setRegisterOpen(false);
            toast.success(`Property ${property.identifier} registered.`);
            void queryClient.invalidateQueries({
              queryKey: ['properties'],
              refetchType: 'none',
            });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'none' });
            void refresh();
            onPropertiesChanged?.();
          }}
        />
      )}
    </div>
  );
}

function Pagination({
  list,
  page,
  onPage,
}: {
  list: PropertyListResponse;
  page: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));
  return (
    <div className="mt-3 flex flex-col gap-3 text-sm text-(--color-ink-muted) sm:flex-row sm:items-center sm:justify-between">
      <span>
        Page {list.page} of {totalPages} · {list.total} total
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="md"
          className="min-h-11"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft aria-hidden size={13} />
          Prev
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="min-h-11"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Next
          <ChevronRight aria-hidden size={13} />
        </Button>
      </div>
    </div>
  );
}
