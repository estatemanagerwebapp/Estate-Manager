import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { EstateDto, PropertyListResponse } from '@silverstone/shared';
import { api } from '../../api/client';
import { useApiQuery } from '../../api/query';
import { usePropertyOptions, registerableAssetTypes } from '../../api/hooks';
import { useCan } from '../../auth/useCan';
import { useToast } from '../../toast/Toast';
import { Button, Badge, statusTone, EmptyState, selectClass } from '../../components/ui';
import { PropertyRegisterModal } from '../properties/PropertyRegisterModal';

/**
 * Estate-scoped properties list. Lives inside the estate detail "Properties"
 * tab. It fetches the property-options view once (for the type picker and
 * the register form's dynamic address components) and the property list on
 * filter/page change.
 *
 * What it does NOT do: re-derive identifiers, re-validate type keys, or
 * decide import validity. The API is the source of truth; the UI just
 * renders what comes back.
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
  const { view: optionsView } = usePropertyOptions(true);

  const [typeKey, setTypeKey] = useState('');
  const [status, setStatus] = useState('');
  const [identifierSearch, setIdentifierSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [registerOpen, setRegisterOpen] = useState(false);

  const filter = useMemo(
    () => ({
      estateId: estate.id,
      typeKey: typeKey || undefined,
      status: status || undefined,
      identifierContains: identifierSearch.trim() || undefined,
      page,
      pageSize,
    }),
    [estate.id, typeKey, status, identifierSearch, page, pageSize],
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

  const types = registerableAssetTypes(optionsView);
  const estateActive = estate.status === 'ACTIVE';

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
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
        <div className="relative">
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
            className="w-44 rounded-md border border-slate-300 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-(--color-primary)"
          />
        </div>
        <div className="ml-auto">
          {can['property.manage'] && (
            <Button size="sm" onClick={() => setRegisterOpen(true)} disabled={!estateActive}>
              <Plus aria-hidden size={13} />
              Register property
            </Button>
          )}
        </div>
      </div>

      {!estateActive && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This estate is archived — new properties can no longer be registered here.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
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
            <table className="w-full text-left text-sm">
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
                        {property.identifier}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-(--color-ink-muted)">
                      {property.typeLabel || property.typeKey}
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
    <div className="mt-3 flex items-center justify-between text-xs text-(--color-ink-muted)">
      <span>
        Page {list.page} of {totalPages} · {list.total} total
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft aria-hidden size={13} />
          Prev
        </Button>
        <Button
          variant="secondary"
          size="sm"
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
