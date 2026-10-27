import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Home,
  ChevronLeft,
  ChevronRight,
  Plus,
  Archive,
  RotateCcw,
  ExternalLink,
  MapPin,
  Tag,
  Clock,
  Trash2,
} from 'lucide-react';
import { api, ApiRequestError, type EstateFilter } from '../../api/client';
import { usePropertyOptions } from '../../api/hooks';
import { useCan } from '../../auth/useCan';
import { useToast } from '../../toast/Toast';
import { useConfirm } from '../../components/dialog';
import {
  Button,
  Badge,
  statusTone,
  EmptyState,
  selectClass,
  Card,
  CardHeader,
  Skeleton,
} from '../../components/ui';
import type { EstateDto, PropertyDto, PropertyListResponse } from '@silverstone/shared';
import { PropertyRegisterModal } from './PropertyRegisterModal';

/**
 * Org-wide properties list (decision #1: properties are estate-scoped on the
 * server, so the screen exposes an estate picker that filters the list).
 *
 * Layout: a responsive card grid — each card shows the property's name,
 * identifier, type label, estate, status badge, and last-updated date, plus
 * inline actions (Open detail, Archive, Reactivate) depending on status and
 * the caller's permissions.
 */
export function PropertiesListPage() {
  const can = useCan();
  const { view } = usePropertyOptions(true);
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const [estates, setEstates] = useState<EstateDto[]>([]);
  const [estateId, setEstateId] = useState('');
  const [typeKey, setTypeKey] = useState('');
  const [status, setStatus] = useState('');
  const [identifierSearch, setIdentifierSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(24);

  const [list, setList] = useState<PropertyListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

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

  const types = (view?.assetTypes ?? []).filter((type) => type.active);
  const estateName = new Map(estates.map((estate) => [estate.id, estate.name]));

  async function archiveProperty(property: PropertyDto) {
    const ok = await confirm({
      title: 'Archive this property?',
      body: `The identifier ${property.identifier} will be preserved for audit; the property will no longer appear in active lists.`,
      danger: true,
    });
    if (!ok) return;
    setActing(property.id);
    try {
      await api.archiveProperty(property.id);
      toast.success('Property archived.');
      void load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not archive the property.');
    } finally {
      setActing(null);
    }
  }

  async function reactivateProperty(property: PropertyDto) {
    setActing(property.id);
    try {
      await api.updateProperty(property.id, { status: 'ACTIVE' });
      toast.success('Property reactivated.');
      void load();
    } catch (err) {
      toast.error(
        err instanceof ApiRequestError ? err.message : 'Could not reactivate the property.',
      );
    } finally {
      setActing(null);
    }
  }

  async function deleteProperty(property: PropertyDto) {
    const ok = await confirm({
      title: 'Permanently delete this property?',
      body: `The identifier ${property.identifier} will be released for re-registration within this estate. This cannot be undone. Properties with child units cannot be deleted.`,
      danger: true,
    });
    if (!ok) return;
    setActing(property.id);
    try {
      await api.deleteProperty(property.id);
      toast.success('Property deleted.');
      void load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not delete the property.');
    } finally {
      setActing(null);
    }
  }

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
        <div className="ml-auto">
          {can['property.manage'] && (
            <Button size="sm" onClick={() => setRegisterOpen(true)} disabled={estates.length === 0}>
              <Plus aria-hidden size={13} />
              Register property
            </Button>
          )}
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
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <input
            type="search"
            value={identifierSearch}
            onChange={(event) => {
              setIdentifierSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search identifier…"
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
          <PropertyCardSkeleton count={8} />
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.properties.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  estateName={estateName.get(property.estateId)}
                  canManage={can['property.manage']}
                  acting={acting === property.id}
                  onArchive={() => void archiveProperty(property)}
                  onReactivate={() => void reactivateProperty(property)}
                  onDelete={() => void deleteProperty(property)}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-(--color-ink-muted)">
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

      {registerOpen && (
        <PropertyRegisterModal
          estates={estates}
          defaultEstateId={estateId || estates[0]?.id}
          onClose={() => setRegisterOpen(false)}
          onCreated={() => {
            setRegisterOpen(false);
            void load();
          }}
        />
      )}
      {dialog}
    </div>
  );
}

// --- Skeleton -----------------------------------------------------------------

function PropertyCardSkeleton({ count }: { count: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading properties"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="rounded-(--radius-card) border border-slate-200/80 bg-white p-4 shadow-(--shadow-card)"
        >
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-3 w-40" />
          <Skeleton className="mt-2 h-3 w-24" />
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <Skeleton className="h-3 w-20" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-14 rounded" />
              <Skeleton className="h-6 w-16 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Card ---------------------------------------------------------------------

function PropertyCard({
  property,
  estateName,
  canManage,
  acting,
  onArchive,
  onReactivate,
  onDelete,
}: {
  property: PropertyDto;
  estateName?: string;
  canManage: boolean;
  acting: boolean;
  onArchive: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const isArchived = property.status === 'ARCHIVED';

  return (
    <div
      className={`rounded-(--radius-card) border bg-white p-4 shadow-(--shadow-card) transition-opacity ${
        isArchived ? 'border-slate-200/80 opacity-70' : 'border-slate-200/80'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-(--color-ink)">
            {property.name ?? property.identifier}
          </p>
          {property.name && (
            <p className="mt-0.5 truncate text-xs text-(--color-ink-muted)">
              {property.identifier}
            </p>
          )}
        </div>
        <Badge tone={statusTone(property.status)}>{isArchived ? 'Archived' : 'Active'}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-(--color-ink-muted)">
        <span className="inline-flex items-center gap-1">
          <Tag aria-hidden size={12} />
          {property.typeLabel || property.typeKey}
          {property.houseTypeKey && property.houseTypeLabel ? (
            <span className="ml-1 text-[10px] text-(--color-ink-muted)">({property.houseTypeLabel})</span>
          ) : null}
        </span>
        {estateName && (
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden size={12} />
            {estateName}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Clock aria-hidden size={12} />
          {new Date(property.updatedAt).toLocaleDateString()}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <Link
          to={`/app/properties/${property.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-(--color-primary) hover:opacity-80"
        >
          Open
          <ExternalLink aria-hidden size={12} />
        </Link>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={acting}
                aria-label={`Delete ${property.name ?? property.identifier}`}
                title="Delete permanently"
              >
                <Trash2 aria-hidden size={13} />
              </Button>
              {isArchived ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onReactivate}
                  disabled={acting}
                  aria-label={`Reactivate ${property.name ?? property.identifier}`}
                >
                  <RotateCcw aria-hidden size={12} />
                  {acting ? 'Working…' : 'Reactivate'}
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={onArchive}
                  disabled={acting}
                  aria-label={`Archive ${property.name ?? property.identifier}`}
                >
                  <Archive aria-hidden size={12} />
                  {acting ? 'Working…' : 'Archive'}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
