import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  UserRound,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  Eye,
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
} from '@silverstone/shared';
import { api, ApiRequestError } from '../api/client';
import { useApiQuery } from '../api/query';
import { queryKeys } from '../api/query-keys';
import { invalidateNavigationCounts } from '../api/navigation';
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
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ResidentFilter>('ACTIVE');
  const [search, setSearch] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [issuedCode, setIssuedCode] = useState<RegisterResidentResponse | null>(null);
  const [editTarget, setEditTarget] = useState<ResidentOnboardingDto | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [demoPassword, setDemoPassword] = useState<string | null>(null);
  const [demoPasswordResident, setDemoPasswordResident] = useState<string | null>(null);
  const [dependantPassword, setDependantPassword] = useState<string | null>(null);
  const [dependantEmail, setDependantEmail] = useState<string | null>(null);
  const [dependantInvitationSent, setDependantInvitationSent] = useState(false);

  const { data, loading, error, refresh } = useApiQuery(
    queryKeys.residents.all,
    () => api.listResidents(),
    'Could not load the resident register.',
  );
  const residents = useMemo(() => data?.residents ?? [], [data]);

  function syncResident(updated: ResidentOnboardingDto) {
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
        toast.success(
          response.accountLinked
            ? `Property added to ${resident.firstName}'s existing resident account.`
            : `Payment recorded for ${resident.firstName}.`,
        );
      }
      if (response.dependantTemporaryPassword || response.dependantInvitationSent) {
        setDependantPassword(response.dependantTemporaryPassword ?? null);
        setDependantEmail(resident.nextOfKinEmail);
        setDependantInvitationSent(response.dependantInvitationSent ?? false);
      }
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void invalidateNavigationCounts(queryClient);
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
      void invalidateNavigationCounts(queryClient);
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
      void invalidateNavigationCounts(queryClient);
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
      toast.success(`Deleted ${resident.firstName}.`);
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void invalidateNavigationCounts(queryClient);
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
            className="min-h-11 w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-base outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft) sm:min-h-0 sm:w-64 sm:text-sm"
          />
        </div>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as ResidentFilter)}
          aria-label="Filter residents by onboarding status"
          className={`${selectClass} min-h-11 w-full text-base sm:min-h-0 sm:w-auto sm:text-sm`}
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
          <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-(--shadow-card)">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-(--color-surface) text-xs font-semibold uppercase tracking-wide text-(--color-ink-muted)">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Resident
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Property
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Onboarding
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Payment
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Portal
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Registered
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleResidents.map((resident) => {
                  const archived = resident.archivedAt !== null;
                  const completed = resident.status === 'COMPLETED';
                  const paid = resident.paymentStatus === 'PAID';
                  const portalActive = resident.accountStatus === 'ACTIVE';
                  const hasPortal = resident.accountStatus !== null;
                  const busy = actingId === resident.id;
                  const deleting = deletingId === resident.id;
                  return (
                    <tr key={resident.id} className="align-middle hover:bg-(--color-surface)">
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="truncate font-semibold text-(--color-ink)">
                          {resident.firstName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-(--color-ink-muted)">
                          {resident.email || 'No email'}
                        </p>
                        {resident.phone && (
                          <p className="mt-0.5 text-xs text-(--color-ink-muted)">
                            {resident.phone}
                          </p>
                        )}
                      </td>
                      <td className="max-w-[280px] px-4 py-3">
                        <p
                          className="truncate font-medium text-(--color-ink)"
                          title={resident.property.name || resident.property.estate.name}
                        >
                          {resident.property.name || resident.property.estate.name}
                        </p>
                        <p
                          className="mt-0.5 truncate text-xs text-(--color-ink-muted)"
                          title={resident.property.identifier}
                        >
                          {resident.property.identifier}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${archived ? 'bg-slate-100 text-slate-700' : completed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                          >
                            {archived ? 'Archived' : completed ? 'Account created' : 'In progress'}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`max-w-[150px] truncate rounded border border-slate-200 bg-(--color-surface) px-2 py-1 font-mono text-xs ${archived ? 'text-(--color-ink-muted) line-through' : 'text-(--color-ink)'}`}
                              title={resident.onboardingCode ?? 'No code available'}
                            >
                              {resident.onboardingCode ?? '—'}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                void copyResidentCode(resident.onboardingCode, resident.id)
                              }
                              disabled={
                                !resident.onboardingCode || archived || copiedId === resident.id
                              }
                              aria-label={
                                copiedId === resident.id
                                  ? 'Copied onboarding code'
                                  : 'Copy onboarding code'
                              }
                              className="rounded border border-slate-300 p-1.5 text-(--color-ink-muted) hover:bg-(--color-surface) disabled:opacity-50"
                            >
                              {copiedId === resident.id ? (
                                <CheckCircle2 aria-hidden size={13} className="text-emerald-600" />
                              ) : (
                                <Copy aria-hidden size={13} />
                              )}
                            </button>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                        >
                          {paid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {hasPortal ? (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${portalActive ? 'bg-sky-50 text-sky-700' : 'bg-rose-50 text-rose-700'}`}
                          >
                            {resident.accountStatus === 'ACTIVE'
                              ? 'Active'
                              : resident.accountStatus === 'SUSPENDED'
                                ? 'Suspended'
                                : 'Disabled'}
                          </span>
                        ) : (
                          <span className="text-xs text-(--color-ink-muted)">Not created</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-(--color-ink-muted)">
                        {new Date(resident.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="min-h-9"
                            onClick={() => navigate(`/app/residents/${resident.id}`)}
                          >
                            <Eye aria-hidden size={13} /> Details
                          </Button>
                          {!archived && resident.status === 'PENDING' && !paid && (
                            <IconAction
                              label="Mark paid"
                              tone="success"
                              onClick={() => void markPaid(resident)}
                              disabled={busy}
                            >
                              {busy ? <ActionSpinner /> : <CreditCard aria-hidden size={14} />}
                            </IconAction>
                          )}
                          {hasPortal && (
                            <IconAction
                              label={
                                portalActive ? 'Disable portal access' : 'Enable portal access'
                              }
                              tone={portalActive ? 'default' : 'success'}
                              onClick={() => void togglePortalAccess(resident)}
                              disabled={busy}
                            >
                              {portalActive ? (
                                <PowerOff aria-hidden size={14} />
                              ) : (
                                <Power aria-hidden size={14} />
                              )}
                            </IconAction>
                          )}
                          <IconAction
                            label="Edit resident"
                            onClick={() => setEditTarget(resident)}
                            disabled={busy}
                          >
                            <Pencil aria-hidden size={14} />
                          </IconAction>
                          {archived ? (
                            <IconAction
                              label="Restore resident"
                              tone="success"
                              onClick={() => void restoreResident(resident)}
                              disabled={busy}
                            >
                              <RotateCcw aria-hidden size={14} />
                            </IconAction>
                          ) : (
                            <IconAction
                              label="Archive resident"
                              onClick={() => void archiveResident(resident)}
                              disabled={busy}
                            >
                              <Archive aria-hidden size={14} />
                            </IconAction>
                          )}
                          {!resident.userId && (
                            <IconAction
                              label="Delete resident"
                              tone="danger"
                              onClick={() => void deleteResident(resident)}
                              disabled={busy || deleting}
                            >
                              {deleting ? <ActionSpinner /> : <Trash2 aria-hidden size={14} />}
                            </IconAction>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {registerOpen && (
        <ResidentRegisterModal
          onClose={() => setRegisterOpen(false)}
          onRegistered={(result) => {
            setRegisterOpen(false);
            setIssuedCode(result);
            void queryClient.invalidateQueries({ queryKey: ['properties'], refetchType: 'none' });
            void queryClient.invalidateQueries({ queryKey: ['estates'], refetchType: 'none' });
            void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            void invalidateNavigationCounts(queryClient);
            void refresh();
          }}
        />
      )}

      {issuedCode && (
        <OnboardingCodePanel result={issuedCode} onClose={() => setIssuedCode(null)} />
      )}

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
            void invalidateNavigationCounts(queryClient);
            void refresh();
          }}
        />
      )}

      {confirmDialog}

      {(demoPassword || dependantPassword || dependantInvitationSent) && (
        <Modal
          open
          onClose={() => {
            setDemoPassword(null);
            setDependantPassword(null);
            setDependantEmail(null);
            setDependantInvitationSent(false);
          }}
          title="Resident access ready"
        >
          <div className="flex flex-col items-center text-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 aria-hidden size={22} />
            </span>
            <p className="mt-1 text-sm font-medium text-(--color-ink)">
              Account created for {demoPasswordResident}.
            </p>
            {demoPassword && (
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
            )}
            {demoPassword && (
              <p className="mt-1 text-[11px] text-(--color-ink-muted)">
                Share this demo password with the resident. They will be forced to change it on
                first login.
              </p>
            )}
            {dependantInvitationSent && (
              <p className="text-sm text-emerald-700">
                A separate dependant login was emailed to {dependantEmail}.
              </p>
            )}
            {dependantPassword && (
              <div className="w-full rounded-md bg-orange-50 p-3 text-left">
                <p className="text-sm font-medium">Dependant login · {dependantEmail}</p>
                <p className="mt-1 font-mono text-sm">{dependantPassword}</p>
                <p className="mt-1 text-xs text-(--color-ink-muted)">
                  They must change this password at first sign-in.
                </p>
              </div>
            )}
            <Button
              onClick={() => {
                setDemoPassword(null);
                setDependantPassword(null);
                setDependantEmail(null);
                setDependantInvitationSent(false);
              }}
            >
              Got it
            </Button>
          </div>
        </Modal>
      )}
    </div>
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
