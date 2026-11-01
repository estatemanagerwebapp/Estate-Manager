import { useState, type FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Pencil,
  Home,
  Trash2,
  Building2,
  ReceiptText,
  CalendarDays,
  ScanLine,
  History,
  Upload,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { EstateDto } from '@silverstone/shared';
import { api, ApiRequestError } from '../../api/client';
import { useApiQuery } from '../../api/query';
import { useCan } from '../../auth/useCan';
import { useToast } from '../../toast/Toast';
import { useConfirm } from '../../components/dialog';
import {
  Button,
  Badge,
  statusTone,
  Card,
  ErrorBanner,
  LoadingPanel,
  Field,
} from '../../components/ui';
import { PropertiesTab } from './EstateDetailTabs';
import { ImportsTab } from '../imports/ImportsTab';
import { SettingsPage } from '../SettingsPage';
import { BillingPage } from '../BillingPage';
import { FacilitiesPage } from '../FacilitiesPage';
import { BookingsPage } from '../BookingsPage';
import { GatePage } from '../GatePage';
import { ActivityPage } from '../activity/ActivityPage';

/**
 * Estate detail. Header shows identity + status and the admin actions
 * (edit / archive / re-activate). The two tabs below — Properties and
 * Imports — each own their data.
 *
 * Archive and re-activation are gated by `estate.manage` in the UI; the API
 * remains the authoritative gate. `POST /estates/:id/status` accepts both
 * `ACTIVE` and `ARCHIVED`, so the UI shows an "Archive" button when active
 * and a "Reactivate" button when archived.
 *
 * A refresh (after a property is registered, or an import batch is created)
 * keeps the current screen on display: only the first load shows the
 * full-page loading panel. Unmounting the card on every refresh would reset
 * the active tab and throw away the tab's own state — the selected import
 * batch and its row results, for example.
 */
export function EstateDetailPage() {
  const { estateId = '' } = useParams();
  const can = useCan();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);

  const {
    data: detail,
    loading,
    error: queryError,
    errorObject,
    refresh,
  } = useApiQuery(
    ['estate', estateId],
    () => api.getEstate(estateId),
    'Could not load the estate.',
  );

  const error =
    errorObject instanceof ApiRequestError && errorObject.code === 'NOT_FOUND'
      ? 'This estate no longer exists.'
      : queryError;

  const estate: EstateDto | null = detail?.estate ?? null;

  async function toggleStatus(next: 'ACTIVE' | 'ARCHIVED') {
    if (!estate) return;
    const isArchiving = next === 'ARCHIVED';
    const ok = await confirm({
      title: isArchiving ? 'Archive this estate?' : 'Restore this estate?',
      body: isArchiving
        ? 'Archived estates cannot receive new properties. Existing records remain readable.'
        : 'The estate will accept new properties again.',
      danger: isArchiving,
    });
    if (!ok) return;
    try {
      const result = await api.setEstateStatus(estate.id, next);
      queryClient.setQueryData<Awaited<ReturnType<typeof api.getEstate>>>(
        ['estate', estateId],
        (current) => (current ? { ...current, estate: result.estate } : current),
      );
      // The list and dashboard counters reflect status; mark them stale for
      // the next visit without pulling them now.
      void queryClient.invalidateQueries({ queryKey: ['estates'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'none' });
      toast.success(isArchiving ? 'Estate archived.' : 'Estate reactivated.');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  }

  async function remove() {
    if (!estate) return;
    const ok = await confirm({
      title: 'Permanently delete this estate?',
      body: `The estate "${estate.name}" will be removed along with its import history. This cannot be undone. Estates that still have registered properties cannot be deleted — delete or archive those properties first.`,
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteEstate(estate.id);
      toast.success('Estate deleted.');
      void queryClient.invalidateQueries({ queryKey: ['estates'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'none' });
      queryClient.removeQueries({ queryKey: ['estate', estateId] });
      navigate('/app/estates', { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not delete the estate.');
    }
  }

  return (
    <div>
      <Link
        to="/app/estates"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-(--color-ink-muted) hover:text-(--color-ink)"
      >
        <ArrowLeft aria-hidden size={14} />
        Back to estates
      </Link>

      {loading && !detail ? (
        <LoadingPanel label="Loading estate…" />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void refresh()} />
      ) : estate ? (
        <Card aria-label={`Estate ${estate.name}`}>
          <header className="flex flex-col gap-3 border-b border-slate-200/80 px-4 py-4 sm:px-5 sm:py-5 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <Home aria-hidden size={20} className="shrink-0 text-(--color-primary)" />
                <h1 className="text-xl font-semibold tracking-tight text-(--color-ink) sm:text-2xl">
                  {estate.name}
                </h1>
                <Badge tone={statusTone(estate.status)}>{estate.status}</Badge>
              </div>
              {estate.address && (
                <p className="mt-1 pl-8 text-sm text-(--color-ink-muted)">{estate.address}</p>
              )}
            </div>
            {can['estate.manage'] ? (
              <div className="flex flex-wrap gap-2 md:shrink-0">
                <Button variant="secondary" size="sm" onClick={() => setEditing((value) => !value)}>
                  <Pencil aria-hidden size={13} />
                  {editing ? 'Hide edit' : 'Edit'}
                </Button>
                {estate.status === 'ACTIVE' ? (
                  <Button variant="danger" size="sm" onClick={() => void toggleStatus('ARCHIVED')}>
                    <Archive aria-hidden size={13} />
                    Archive
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => void toggleStatus('ACTIVE')}>
                    <ArchiveRestore aria-hidden size={13} />
                    Reactivate
                  </Button>
                )}
                <Button variant="danger" size="sm" onClick={() => void remove()}>
                  <Trash2 aria-hidden size={13} />
                  Delete
                </Button>
              </div>
            ) : null}
          </header>

          {editing && can['estate.manage'] && (
            <div className="border-b border-slate-200/80 bg-(--color-surface) px-5 py-4">
              <EstateEditForm
                estate={estate}
                onSaved={(updated) => {
                  queryClient.setQueryData<Awaited<ReturnType<typeof api.getEstate>>>(
                    ['estate', estateId],
                    (current) => (current ? { ...current, estate: updated } : current),
                  );
                  void queryClient.invalidateQueries({
                    queryKey: ['estates'],
                    refetchType: 'none',
                  });
                  setEditing(false);
                }}
              />
            </div>
          )}

          <EstateTabs
            estate={estate}
            propertiesCount={detail!.propertyCount}
            onPropertiesChanged={() => void refresh()}
          />
        </Card>
      ) : null}

      {dialog}
    </div>
  );
}

// --- Estate workspace navigation ----------------------------------------------

type EstateSection =
  | 'properties'
  | 'billing'
  | 'facilities'
  | 'bookings'
  | 'gate'
  | 'activity'
  | 'imports'
  | 'settings';

interface EstateNavigationItem {
  id: EstateSection;
  label: string;
  icon: LucideIcon;
  count?: number;
  separated?: boolean;
}

function EstateTabs({
  estate,
  propertiesCount,
  onPropertiesChanged,
}: {
  estate: EstateDto;
  propertiesCount: number;
  onPropertiesChanged: () => void;
}) {
  const can = useCan();
  const [section, setSection] = useState<EstateSection>('properties');
  const navigation: EstateNavigationItem[] = [
    { id: 'properties', label: 'Properties', icon: Home, count: propertiesCount },
    ...(can['billing.read']
      ? [{ id: 'billing' as const, label: 'Billing', icon: ReceiptText }]
      : []),
    ...(can['facility.read']
      ? [{ id: 'facilities' as const, label: 'Facilities', icon: Building2 }]
      : []),
    ...(can['booking.read']
      ? [{ id: 'bookings' as const, label: 'Bookings', icon: CalendarDays }]
      : []),
    ...(can['gate.read'] || can['verification.read']
      ? [{ id: 'gate' as const, label: 'Gate access', icon: ScanLine }]
      : []),
    ...(can['audit.read'] ? [{ id: 'activity' as const, label: 'Activity', icon: History }] : []),
    { id: 'imports', label: 'Imports', icon: Upload, separated: true },
    ...(can['config.manage']
      ? [{ id: 'settings' as const, label: 'Settings', icon: Settings2 }]
      : []),
  ];
  const activeItem = navigation.find((item) => item.id === section) ?? navigation[0]!;

  function renderSection() {
    switch (section) {
      case 'properties':
        return <PropertiesTab estate={estate} onPropertiesChanged={onPropertiesChanged} />;
      case 'billing':
        return <BillingPage key={estate.id} fixedEstateId={estate.id} />;
      case 'facilities':
        return <FacilitiesPage key={estate.id} fixedEstateId={estate.id} />;
      case 'bookings':
        return <BookingsPage key={estate.id} fixedEstateId={estate.id} />;
      case 'gate':
        return <GatePage key={estate.id} fixedEstateId={estate.id} />;
      case 'activity':
        return <ActivityPage key={estate.id} fixedEstateId={estate.id} />;
      case 'imports':
        return <ImportsTab estate={estate} onPropertiesChanged={onPropertiesChanged} />;
      case 'settings':
        return <SettingsPage estateId={estate.id} estateName={estate.name} />;
    }
  }

  return (
    <div className="min-w-0">
      <nav
        role="tablist"
        aria-orientation="horizontal"
        className="flex min-w-0 gap-1 overflow-x-auto border-b border-slate-200/80 px-3 py-2 sm:px-5"
        aria-label="Estate sections"
      >
        {navigation.map((item) => (
          <EstateNavigationButton
            key={item.id}
            item={item}
            active={section === item.id}
            onClick={() => setSection(item.id)}
          />
        ))}
      </nav>

      <div className="min-w-0">
        <main role="tabpanel" aria-label={activeItem.label} className="min-w-0 p-4 sm:p-5 lg:p-6">
          {renderSection()}
        </main>
      </div>
    </div>
  );
}

function EstateNavigationButton({
  item,
  active,
  onClick,
}: {
  item: EstateNavigationItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors ${
        item.separated ? 'ml-2 border-l border-slate-200/80 pl-4' : ''
      } ${
        active
          ? 'bg-(--color-primary-soft) font-semibold text-(--color-primary) after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:rounded-full after:bg-(--color-primary)'
          : 'text-slate-600 hover:bg-slate-50 hover:text-(--color-ink)'
      }`}
    >
      <Icon aria-hidden size={17} className="shrink-0" />
      <span className="whitespace-nowrap">{item.label}</span>
      {item.count !== undefined && (
        <span className="text-xs text-(--color-ink-muted)">{item.count}</span>
      )}
    </button>
  );
}

// --- Edit form ------------------------------------------------------------------

function EstateEditForm({
  estate,
  onSaved,
}: {
  estate: EstateDto;
  onSaved: (estate: EstateDto) => void;
}) {
  const [name, setName] = useState(estate.name);
  const [address, setAddress] = useState(estate.address ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.updateEstate(estate.id, {
        name: name.trim(),
        address: address.trim() ? address.trim() : undefined,
      });
      toast.success('Estate updated.');
      onSaved(result.estate);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'CONFLICT') {
        setError(`Slug conflict: ${err.message}`);
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save changes.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-xs font-medium text-(--color-ink-muted)">
        Edit estate details. The slug is immutable after creation.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            className="min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-(--color-primary) sm:min-h-0 sm:text-sm"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            required
          />
        </Field>
        <Field label="Address">
          <input
            className="min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-(--color-primary) sm:min-h-0 sm:text-sm"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            maxLength={500}
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
