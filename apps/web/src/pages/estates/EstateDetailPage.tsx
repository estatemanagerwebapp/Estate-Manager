import { useState, type FormEvent, type ReactNode } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Archive, ArchiveRestore, Pencil, Home, Trash2 } from 'lucide-react';
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
  CardHeader,
  ErrorBanner,
  LoadingPanel,
  Field,
} from '../../components/ui';
import { PropertiesTab } from './EstateDetailTabs';
import { ImportsTab } from '../imports/ImportsTab';

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
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Home aria-hidden size={15} className="text-(--color-primary)" />
                {estate.name}
                <Badge tone={statusTone(estate.status)}>{estate.status}</Badge>
              </span>
            }
            subtitle={`slug: ${estate.slug}${estate.address ? ` · ${estate.address}` : ''}`}
            actions={
              can['estate.manage'] ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing((value) => !value)}
                  >
                    <Pencil aria-hidden size={13} />
                    {editing ? 'Hide edit' : 'Edit'}
                  </Button>
                  {estate.status === 'ACTIVE' ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void toggleStatus('ARCHIVED')}
                    >
                      <Archive aria-hidden size={13} />
                      Archive
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void toggleStatus('ACTIVE')}
                    >
                      <ArchiveRestore aria-hidden size={13} />
                      Reactivate
                    </Button>
                  )}
                  <Button variant="danger" size="sm" onClick={() => void remove()}>
                    <Trash2 aria-hidden size={13} />
                    Delete
                  </Button>
                </>
              ) : null
            }
          />

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

// --- Tab wrapper ----------------------------------------------------------------

function EstateTabs({
  estate,
  propertiesCount,
  onPropertiesChanged,
}: {
  estate: EstateDto;
  propertiesCount: number;
  onPropertiesChanged: () => void;
}) {
  const [tab, setTab] = useState<'properties' | 'imports'>('properties');

  return (
    <div>
      <div className="flex gap-1 border-b border-slate-200/80 px-5" role="tablist">
        <TabButton active={tab === 'properties'} onClick={() => setTab('properties')}>
          Properties ({propertiesCount})
        </TabButton>
        <TabButton active={tab === 'imports'} onClick={() => setTab('imports')}>
          Imports
        </TabButton>
      </div>

      <div role="tabpanel">
        {tab === 'properties' ? (
          <PropertiesTab estate={estate} onPropertiesChanged={onPropertiesChanged} />
        ) : (
          <ImportsTab estate={estate} onPropertiesChanged={onPropertiesChanged} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-(--color-primary) text-(--color-ink)'
          : 'border-transparent text-(--color-ink-muted) hover:text-(--color-ink)'
      }`}
    >
      {children}
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
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={160}
            required
          />
        </Field>
        <Field label="Address">
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
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
