import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  UserRound,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  Eye,
  FileText,
  Trash2,
  Copy,
  CreditCard,
  Pencil,
  Archive,
  RotateCcw,
  Power,
  PowerOff,
} from 'lucide-react';
import {
  type EstateDto,
  type PropertyDto,
  type RegisterResidentResponse,
  type ResidentOnboardingDto,
  GENDERS,
  MARITAL_STATUSES,
  RESIDENT_ID_TYPES,
} from '@silverstone/shared';
import { api, ApiRequestError } from '../api/client';
import { useApiQuery } from '../api/query';
import { queryKeys } from '../api/query-keys';
import { useToast } from '../toast/Toast';
import { Modal, useConfirm } from '../components/dialog';
import { FilterBar, OperatorPageHeader } from '../components/operator';
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingPanel,
  inputClass,
  selectClass,
} from '../components/ui';
import { ResidentRegisterModal, OnboardingCodePanel } from './ResidentRegisterModal';

/**
 * Residents — the resident register.
 *
 * A resident is registered by an admin (first name + property) and receives
 * a persistent onboarding code. They complete their own profile, upload an
 * ID document and pay the registration fee at `/onboard`.
 *
 * A resident only becomes a *user* when onboarding completes (payment
 * verified): the account is then created with the RESIDENT role and its portal
 * status is managed here. Until then the resident exists here, as a draft.
 *
 * Phase 1 adds operator edit, soft archive/restore, portal-access control and
 * safe deletion. Archive deliberately does not change portal access; the two
 * controls are separate so an operator never disables an account by surprise.
 */
type ResidentFilter = 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'ARCHIVED' | 'ALL';

export function ResidentsPage() {
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ResidentFilter>('ACTIVE');
  const [search, setSearch] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [issuedCode, setIssuedCode] = useState<RegisterResidentResponse | null>(null);
  const [detail, setDetail] = useState<ResidentOnboardingDto | null>(null);
  const [editTarget, setEditTarget] = useState<ResidentOnboardingDto | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [demoPassword, setDemoPassword] = useState<string | null>(null);
  const [demoPasswordResident, setDemoPasswordResident] = useState<string | null>(null);

  const { data, loading, error, refresh } = useApiQuery(
    queryKeys.residents.all,
    () => api.listResidents(),
    'Could not load the resident register.',
  );
  const residents = useMemo(() => data?.residents ?? [], [data]);

  function syncResident(updated: ResidentOnboardingDto) {
    setDetail((current) => (current && current.id === updated.id ? updated : current));
    setEditTarget((current) => (current && current.id === updated.id ? updated : current));
  }

  async function markPaid(resident: ResidentOnboardingDto) {
    setActingId(resident.id);
    try {
      const response = await api.markResidentPaid(resident.id);
      syncResident(response.resident);
      if (response.demoPassword) {
        // Account was created immediately — show the demo password once.
        setDemoPassword(response.demoPassword);
        setDemoPasswordResident(resident.firstName);
      } else if (response.missingFields?.length) {
        toast.error(
          `Payment recorded, but account not created — missing: ${response.missingFields.join(', ')}.`,
        );
      } else {
        toast.success(`Payment recorded for ${resident.firstName}.`);
      }
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not record the payment.');
    } finally {
      setActingId(null);
    }
  }

  async function archiveResident(resident: ResidentOnboardingDto) {
    const ok = await confirm({
      title: 'Archive this resident?',
      body: `"${resident.firstName}" will be hidden from the active register and their onboarding code will stop working. Portal access is not changed. You can restore them later.`,
    });
    if (!ok) return;
    setActingId(resident.id);
    try {
      const response = await api.archiveResident(resident.id);
      syncResident(response.resident);
      toast.success(`Archived ${resident.firstName}.`);
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not archive the resident.');
    } finally {
      setActingId(null);
    }
  }

  async function restoreResident(resident: ResidentOnboardingDto) {
    setActingId(resident.id);
    try {
      const response = await api.restoreResident(resident.id);
      syncResident(response.resident);
      toast.success(`Restored ${resident.firstName}.`);
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not restore the resident.');
    } finally {
      setActingId(null);
    }
  }

  async function togglePortalAccess(resident: ResidentOnboardingDto) {
    const enable = resident.accountStatus !== 'ACTIVE';
    if (!enable) {
      const ok = await confirm({
        title: 'Disable portal access?',
        body: `${resident.firstName} will be signed out and unable to sign in until portal access is enabled again. The resident record and billing history stay intact.`,
        danger: true,
      });
      if (!ok) return;
    }
    setActingId(resident.id);
    try {
      const response = await api.setResidentPortalAccess(resident.id, { enabled: enable });
      syncResident(response.resident);
      toast.success(
        enable
          ? `Portal access enabled for ${resident.firstName}.`
          : `Portal access disabled for ${resident.firstName}.`,
      );
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not change portal access.');
    } finally {
      setActingId(null);
    }
  }

  async function deleteResident(resident: ResidentOnboardingDto) {
    if (resident.userId) {
      toast.error('Disable portal access and archive this resident instead.');
      return;
    }
    const ok = await confirm({
      title: 'Delete this resident?',
      body: `Permanently remove "${resident.firstName}" and their onboarding record. This cannot be undone.`,
      danger: true,
    });
    if (!ok) return;
    setDeletingId(resident.id);
    try {
      await api.deleteResident(resident.id);
      if (detail?.id === resident.id) setDetail(null);
      toast.success(`Deleted ${resident.firstName}.`);
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not delete the resident.');
    } finally {
      setDeletingId(null);
    }
  }

  async function copyResidentCode(code: string | null, residentId: string) {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(residentId);
      setTimeout(() => setCopiedId(null), 1500);
      toast.success('Onboarding code copied.');
    } catch {
      toast.error('Could not copy the code.');
    }
  }

  const activeResidents = useMemo(
    () => residents.filter((resident) => resident.archivedAt === null),
    [residents],
  );
  const archivedCount = residents.length - activeResidents.length;
  const pendingCount = activeResidents.filter((resident) => resident.status === 'PENDING').length;

  const visibleResidents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return residents.filter((resident) => {
      const archived = resident.archivedAt !== null;
      if (filter === 'ACTIVE' && archived) return false;
      if (filter === 'PENDING' && (archived || resident.status !== 'PENDING')) return false;
      if (filter === 'COMPLETED' && (archived || resident.status !== 'COMPLETED')) return false;
      if (filter === 'ARCHIVED' && !archived) return false;
      if (!query) return true;
      return (
        resident.firstName.toLowerCase().includes(query) ||
        (resident.email ?? '').toLowerCase().includes(query) ||
        resident.property.identifier.toLowerCase().includes(query)
      );
    });
  }, [residents, filter, search]);

  return (
    <div>
      <OperatorPageHeader
        icon={<UserRound aria-hidden size={20} className="text-(--color-primary)" />}
        title="Residents"
        description="Register, edit and archive residents. Accounts are created only after onboarding and payment are complete."
        actions={
          <Button onClick={() => setRegisterOpen(true)} size="sm">
            <Plus aria-hidden size={14} />
            Register resident
          </Button>
        }
      />

      {pendingCount > 0 && (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
          <Clock aria-hidden size={12} />
          {pendingCount} resident{pendingCount === 1 ? '' : 's'} awaiting onboarding
        </p>
      )}

      <FilterBar
        summary={`${visibleResidents.length} of ${residents.length} resident${residents.length === 1 ? '' : 's'}`}
      >
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
            placeholder="Search by name, email or property"
            aria-label="Search residents by name, email or property"
            className="w-64 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
          />
        </div>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as ResidentFilter)}
          aria-label="Filter residents by onboarding status"
          className={selectClass}
        >
          <option value="ACTIVE">Active residents</option>
          <option value="PENDING">Onboarding pending</option>
          <option value="COMPLETED">Onboarding complete</option>
          <option value="ARCHIVED">Archived{archivedCount > 0 ? ` (${archivedCount})` : ''}</option>
          <option value="ALL">All residents</option>
        </select>
      </FilterBar>

      {error && (
        <div className="mt-4">
          <ErrorBanner message={error} onRetry={() => void refresh()} />
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <LoadingPanel label="Loading residents…" />
        ) : visibleResidents.length === 0 ? (
          <EmptyState
            title={filter === 'ARCHIVED' ? 'No archived residents' : 'No residents here yet'}
            body={
              filter === 'ARCHIVED'
                ? 'Archived residents are kept for history and can be restored at any time.'
                : 'Register a resident to issue a persistent onboarding code.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleResidents.map((resident) => (
              <ResidentCard
                key={resident.id}
                resident={resident}
                busy={actingId === resident.id}
                deleting={deletingId === resident.id}
                copiedId={copiedId}
                onMarkPaid={() => void markPaid(resident)}
                onEdit={() => setEditTarget(resident)}
                onArchive={() => void archiveResident(resident)}
                onRestore={() => void restoreResident(resident)}
                onTogglePortal={() => void togglePortalAccess(resident)}
                onDelete={() => void deleteResident(resident)}
                onCopyCode={() => void copyResidentCode(resident.onboardingCode, resident.id)}
                onDetails={() => setDetail(resident)}
              />
            ))}
          </div>
        )}
      </div>

      {registerOpen && (
        <ResidentRegisterModal
          onClose={() => setRegisterOpen(false)}
          onRegistered={(result) => {
            setRegisterOpen(false);
            setIssuedCode(result);
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            void refresh();
          }}
        />
      )}

      {issuedCode && (
        <OnboardingCodePanel result={issuedCode} onClose={() => setIssuedCode(null)} />
      )}

      {detail && <ResidentDetailModal resident={detail} onClose={() => setDetail(null)} />}

      {editTarget && (
        <ResidentEditModal
          resident={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            syncResident(updated);
            setEditTarget(null);
            toast.success(`Updated ${updated.firstName}.`);
            void queryClient.invalidateQueries({ queryKey: ['users'] });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            void refresh();
          }}
        />
      )}

      {confirmDialog}

      {demoPassword && (
        <Modal open onClose={() => setDemoPassword(null)} title="Account created">
          <div className="flex flex-col items-center text-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 aria-hidden size={22} />
            </span>
            <p className="mt-1 text-sm font-medium text-(--color-ink)">
              Account created for {demoPasswordResident}.
            </p>
            <div className="flex items-center gap-2 w-full max-w-xs">
              <input
                type="text"
                readOnly
                value={demoPassword}
                className="flex-1 rounded-md border border-slate-300 bg-(--color-surface) px-3 py-2 text-sm font-mono text-(--color-ink) outline-none select-all"
              />
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(demoPassword ?? '')}
                className="rounded-md border border-slate-300 bg-(--color-surface) px-2.5 py-2 text-[10px] font-medium text-(--color-ink) hover:bg-(--color-surface-soft)"
                aria-label="Copy password"
              >
                <Copy aria-hidden size={12} />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-(--color-ink-muted)">
              Share this demo password with the resident. They will be forced to change it on first
              login.
            </p>
            <Button onClick={() => setDemoPassword(null)}>Got it</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * A single resident card shown in the register grid. Keeps the most useful
 * fields visible at a glance with actions for details, editing, payment,
 * archive/restore and portal access.
 */
function ResidentCard({
  resident,
  busy,
  deleting,
  copiedId,
  onMarkPaid,
  onEdit,
  onArchive,
  onRestore,
  onTogglePortal,
  onDelete,
  onCopyCode,
  onDetails,
}: {
  resident: ResidentOnboardingDto;
  busy: boolean;
  deleting: boolean;
  copiedId: string | null;
  onMarkPaid: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onTogglePortal: () => void;
  onDelete: () => void;
  onCopyCode: () => void;
  onDetails: () => void;
}) {
  const archived = resident.archivedAt !== null;
  const paid = resident.paymentStatus === 'PAID';
  const completed = resident.status === 'COMPLETED';
  const canMarkPaid = !archived && resident.status === 'PENDING' && !paid;
  const portalActive = resident.accountStatus === 'ACTIVE';
  const hasPortal = resident.accountStatus !== null;
  const portalLabel =
    resident.accountStatus === 'ACTIVE'
      ? 'Portal active'
      : resident.accountStatus === 'SUSPENDED'
        ? 'Portal suspended'
        : 'Portal disabled';

  return (
    <article className="overflow-hidden rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card) transition-all hover:shadow-md">
      <div className="p-4">
        {/* Header: name + onboarding status */}
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-semibold text-(--color-ink) leading-snug">{resident.firstName}</h3>
            <p className="mt-0.5 text-[12px] text-(--color-ink-muted)">
              {resident.email ? (
                <span>{resident.email}</span>
              ) : (
                <span className="italic">no email</span>
              )}
              {resident.phone && resident.email ? (
                <span className="block mt-0.5">{resident.phone}</span>
              ) : null}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              archived
                ? 'bg-slate-100 text-slate-700'
                : completed
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
            }`}
          >
            {archived ? (
              <Archive aria-hidden size={10} />
            ) : completed ? (
              <CheckCircle2 aria-hidden size={10} />
            ) : (
              <Clock aria-hidden size={10} />
            )}
            {archived ? 'Archived' : completed ? 'Account created' : 'In progress'}
          </span>
        </div>

        {/* Property section */}
        <div className="mb-3">
          <p className="text-[10px] font-medium text-(--color-ink-muted) uppercase tracking-wider mb-1">
            Property
          </p>
          <p className="text-[12px] text-(--color-ink) leading-none">
            {resident.property.identifier}
          </p>
          {resident.property.name ? (
            <p className="mt-0.5 text-[12px] font-medium text-(--color-ink)">
              {resident.property.name}
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-(--color-ink-muted)">
            {resident.property.estate.name}
          </p>
        </div>

        {/* Onboarding code + copy */}
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md border border-slate-200 bg-(--color-surface) px-2.5 py-1.5 text-[11px] font-medium select-all truncate max-w-[140px] ${
              archived ? 'text-(--color-ink-muted) line-through' : 'text-(--color-ink)'
            }`}
            title={
              archived
                ? 'Archived onboarding codes no longer work'
                : (resident.onboardingCode ?? 'No code available')
            }
          >
            {resident.onboardingCode ?? <span className="text-(--color-ink-muted) italic">—</span>}
          </span>
          <button
            type="button"
            onClick={onCopyCode}
            disabled={!resident.onboardingCode || archived || copiedId === resident.id}
            aria-label={copiedId === resident.id ? 'Copied' : 'Copy onboarding code'}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-[10px] font-medium text-(--color-ink-muted) hover:bg-(--color-surface) disabled:opacity-50"
          >
            {copiedId === resident.id ? (
              <CheckCircle2 aria-hidden size={10} className="text-emerald-600" />
            ) : (
              <Copy aria-hidden size={10} />
            )}
          </button>
        </div>

        {/* Payment status + portal access + registered */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {paid ? <CheckCircle2 aria-hidden size={10} /> : <Clock aria-hidden size={10} />}
              {paid ? 'Paid' : 'Unpaid'}
            </span>
            {hasPortal && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  portalActive ? 'bg-sky-50 text-sky-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {portalActive ? (
                  <Power aria-hidden size={10} />
                ) : (
                  <PowerOff aria-hidden size={10} />
                )}
                {portalLabel}
              </span>
            )}
          </div>
          <p className="text-[11px] text-(--color-ink-muted)">
            Registered {new Date(resident.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-(--color-surface-soft)/50 p-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onDetails}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-[11px] font-medium text-(--color-ink) hover:bg-(--color-surface)"
        >
          <Eye aria-hidden size={12} />
          Details
        </button>
        <div className="flex items-center gap-1">
          {canMarkPaid && (
            <IconAction label="Mark paid" tone="success" onClick={onMarkPaid} disabled={busy}>
              {busy ? <ActionSpinner /> : <CreditCard aria-hidden size={14} />}
            </IconAction>
          )}
          {hasPortal && (
            <IconAction
              label={portalActive ? 'Disable portal access' : 'Enable portal access'}
              tone={portalActive ? 'default' : 'success'}
              onClick={onTogglePortal}
              disabled={busy}
            >
              {portalActive ? <PowerOff aria-hidden size={14} /> : <Power aria-hidden size={14} />}
            </IconAction>
          )}
          <IconAction label="Edit resident" onClick={onEdit} disabled={busy}>
            <Pencil aria-hidden size={14} />
          </IconAction>
          {archived ? (
            <IconAction label="Restore resident" tone="success" onClick={onRestore} disabled={busy}>
              <RotateCcw aria-hidden size={14} />
            </IconAction>
          ) : (
            <IconAction label="Archive resident" onClick={onArchive} disabled={busy}>
              <Archive aria-hidden size={14} />
            </IconAction>
          )}
          {!resident.userId && (
            <IconAction
              label="Delete resident"
              tone="danger"
              onClick={onDelete}
              disabled={busy || deleting}
            >
              {deleting ? <ActionSpinner /> : <Trash2 aria-hidden size={14} />}
            </IconAction>
          )}
        </div>
      </div>
    </article>
  );
}

function IconAction({
  label,
  tone = 'default',
  onClick,
  disabled,
  children,
}: {
  label: string;
  tone?: 'default' | 'success' | 'danger';
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const styles =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      : tone === 'danger'
        ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
        : 'border-slate-300 text-(--color-ink-muted) hover:bg-(--color-surface)';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-md border p-1.5 disabled:opacity-60 ${styles}`}
    >
      {children}
    </button>
  );
}

function ActionSpinner() {
  return (
    <svg
      className="animate-spin h-3.5 w-3.5"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}

/**
 * Operator edit for the admin-owned fields. Resident-provided profile fields
 * stay resident-owned; this modal corrects the name, contact details and
 * property assignment.
 */
function ResidentEditModal({
  resident,
  onClose,
  onSaved,
}: {
  resident: ResidentOnboardingDto;
  onClose: () => void;
  onSaved: (resident: ResidentOnboardingDto) => void;
}) {
  const [firstName, setFirstName] = useState(resident.firstName);
  const [email, setEmail] = useState(resident.email ?? '');
  const [phone, setPhone] = useState(resident.phone ?? '');
  const [estateId, setEstateId] = useState('');
  const [propertyId, setPropertyId] = useState(resident.propertyId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reuse the same cache entries as the register modal so switching between
  // the two never duplicates the estate/property reads.
  const { data: estateData } = useApiQuery(
    ['estates', {}],
    () => api.listEstates(),
    'Could not load estates.',
  );
  const { data: propertyData } = useApiQuery(
    ['properties', 'picker', estateId],
    () => api.listProperties({ estateId, pageSize: 200 }),
    'Could not load properties.',
    Boolean(estateId),
  );
  const estates: EstateDto[] = estateData?.estates ?? [];
  const properties: PropertyDto[] = estateId ? (propertyData?.properties ?? []) : [];

  const currentEstate = estates.find((estate) => estate.slug === resident.property.estate.slug);
  useEffect(() => {
    if (!estateId && currentEstate) setEstateId(currentEstate.id);
  }, [currentEstate, estateId]);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!firstName.trim()) {
      setError('Enter the resident’s first name.');
      return;
    }
    if (resident.userId && !email.trim()) {
      setError('A portal account requires an email address.');
      return;
    }
    if (!propertyId) {
      setError('Select the property to assign.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.updateResident(resident.id, {
        firstName: firstName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        propertyId,
      });
      onSaved(response.resident);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
        setError('Property not found.');
      } else if (err instanceof ApiRequestError && err.code === 'CONFLICT') {
        setError(err.message);
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not update the resident.');
      }
      setSubmitting(false);
    }
  }

  const selectedProperty = properties.find((property) => property.id === propertyId);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${resident.firstName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !firstName.trim() || !propertyId}
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </p>
        )}

        <Field label="First name (required)">
          <input
            className={inputClass}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            maxLength={120}
            required
          />
        </Field>

        <Field
          label={resident.userId ? 'Email (required for the portal account)' : 'Email (optional)'}
        >
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={255}
            required={Boolean(resident.userId)}
            placeholder="name@example.com"
          />
        </Field>

        <Field label="Phone (optional)">
          <input
            type="tel"
            className={inputClass}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={40}
            placeholder="+234 800 000 0000"
          />
        </Field>

        <Field label="Estate">
          <select
            value={estateId}
            onChange={(event) => {
              setEstateId(event.target.value);
              setPropertyId('');
            }}
            className={`${selectClass} w-full`}
            aria-label="Estate"
          >
            <option value="">Select an estate…</option>
            {estates.map((estate) => (
              <option key={estate.id} value={estate.id}>
                {estate.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Property (required)"
          hint={
            selectedProperty
              ? `Identifier: ${selectedProperty.identifier}`
              : 'Required to assign the resident.'
          }
        >
          <select
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            className={`${selectClass} w-full`}
            disabled={!estateId}
            aria-label="Property"
          >
            <option value="">{estateId ? 'Select a property…' : 'Choose an estate first'}</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.identifier}
                {property.name ? ` — ${property.name}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <p className="text-[11px] leading-relaxed text-(--color-ink-muted)">
          Changing a completed resident’s email or name also updates the linked portal account.
          Property changes apply to future billing; existing invoices keep their original property.
        </p>
      </form>
    </Modal>
  );
}

/**
 * Read-only view of everything the resident has provided so far, plus the
 * payment record. Useful for the admin to see what is still outstanding.
 */
function ResidentDetailModal({
  resident,
  onClose,
}: {
  resident: ResidentOnboardingDto;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={`${resident.firstName} — onboarding details`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <section>
          <h3 className="text-xs font-semibold text-(--color-ink-muted)">Assignment</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-(--color-ink-muted)">Property</dt>
            <dd>{resident.property.identifier}</dd>
            <dt className="text-(--color-ink-muted)">Estate</dt>
            <dd>{resident.property.estate.name}</dd>
            <dt className="text-(--color-ink-muted)">Email</dt>
            <dd>{resident.email ?? '—'}</dd>
            <dt className="text-(--color-ink-muted)">Phone</dt>
            <dd>{resident.phone ?? '—'}</dd>
            <dt className="text-(--color-ink-muted)">Record</dt>
            <dd>
              {resident.archivedAt
                ? `Archived ${new Date(resident.archivedAt).toLocaleDateString()}`
                : 'Active'}
            </dd>
          </dl>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-(--color-ink-muted)">Resident-provided</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-(--color-ink-muted)">Gender</dt>
            <dd>{label(resident.gender, GENDERS)}</dd>
            <dt className="text-(--color-ink-muted)">Marital status</dt>
            <dd>{label(resident.maritalStatus, MARITAL_STATUSES)}</dd>
            <dt className="text-(--color-ink-muted)">Property type</dt>
            <dd>{resident.propertyType ?? '—'}</dd>
            <dt className="text-(--color-ink-muted)">Next of kin</dt>
            <dd>{resident.nextOfKinName ?? '—'}</dd>
            <dt className="text-(--color-ink-muted)">Next of kin phone</dt>
            <dd>{resident.nextOfKinPhone ?? '—'}</dd>
            <dt className="text-(--color-ink-muted)">Next of kin email</dt>
            <dd>{resident.nextOfKinEmail ?? '—'}</dd>
            <dt className="text-(--color-ink-muted)">ID type</dt>
            <dd>{label(resident.idType, RESIDENT_ID_TYPES)}</dd>
            <dt className="text-(--color-ink-muted)">ID document</dt>
            <dd>
              {resident.idDocumentUrl ? (
                <a
                  href={resident.idDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  <FileText aria-hidden size={12} />
                  View document
                </a>
              ) : (
                'Not uploaded'
              )}
            </dd>
          </dl>
        </section>

        <section>
          <h3 className="text-xs font-semibold text-(--color-ink-muted)">Payment</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-(--color-ink-muted)">Status</dt>
            <dd>{resident.paymentStatus === 'PAID' ? 'Paid' : 'Unpaid'}</dd>
            <dt className="text-(--color-ink-muted)">Reference</dt>
            <dd>{resident.paymentRef ?? '—'}</dd>
            <dt className="text-(--color-ink-muted)">Account</dt>
            <dd>
              {resident.userId
                ? 'Created — portal account linked'
                : resident.status === 'COMPLETED'
                  ? 'Account deleted'
                  : 'Not created yet'}
            </dd>
            <dt className="text-(--color-ink-muted)">Portal access</dt>
            <dd>{portalAccessLabel(resident.accountStatus)}</dd>
          </dl>
        </section>
      </div>
    </Modal>
  );
}

function portalAccessLabel(status: ResidentOnboardingDto['accountStatus']): string {
  if (status === 'ACTIVE') return 'Enabled';
  if (status === 'DISABLED') return 'Disabled';
  if (status === 'SUSPENDED') return 'Suspended';
  return 'No portal account';
}

function label(value: string | null, options: readonly string[]): string {
  if (!value) return '—';
  return options.includes(value) ? value.replaceAll('_', ' ').toLowerCase() : value;
}
