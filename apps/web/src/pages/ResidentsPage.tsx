import { useMemo, useState } from 'react';
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
} from 'lucide-react';
import {
  type RegisterResidentResponse,
  type ResidentOnboardingDto,
  GENDERS,
  MARITAL_STATUSES,
  RESIDENT_ID_TYPES,
} from '@silverstone/shared';
import { api, ApiRequestError } from '../api/client';
import { useApiQuery } from '../api/query';
import { useToast } from '../toast/Toast';
import { Modal, useConfirm } from '../components/dialog';
import { Button, EmptyState, ErrorBanner, LoadingPanel } from '../components/ui';
import { ResidentRegisterModal, OnboardingCodePanel } from './ResidentRegisterModal';

/**
 * Residents — the resident register.
 *
 * A resident is registered by an admin (first name + property) and receives
 * a persistent onboarding code. They complete their own profile, upload an
 * ID document and pay the registration fee at `/onboard`.
 *
 * A resident only becomes a *user* when onboarding completes (payment
 * verified): the account is then created with the RESIDENT role and appears
 * on the Users screen. Until then the resident exists here, as a draft.
 */
type ResidentFilter = 'ALL' | 'PENDING' | 'COMPLETED';

export function ResidentsPage() {
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ResidentFilter>('ALL');
  const [search, setSearch] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [issuedCode, setIssuedCode] = useState<RegisterResidentResponse | null>(null);
  const [detail, setDetail] = useState<ResidentOnboardingDto | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [demoPassword, setDemoPassword] = useState<string | null>(null);
  const [demoPasswordResident, setDemoPasswordResident] = useState<string | null>(null);

  const { data, loading, error, refresh } = useApiQuery(
    ['residents'],
    () => api.listResidents(),
    'Could not load the resident register.',
  );
  const residents = useMemo(() => data?.residents ?? [], [data]);

  async function markPaid(resident: ResidentOnboardingDto) {
    setActingId(resident.id);
    try {
      const response = await api.markResidentPaid(resident.id);
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

  async function deleteResident(resident: ResidentOnboardingDto) {
    const ok = await confirm({
      title: 'Delete this resident?',
      body: `Permanently remove "${resident.firstName}" and their onboarding draft. This cannot be undone.`,
      danger: true,
    });
    if (!ok) return;
    setDeletingId(resident.id);
    try {
      await api.deleteResident(resident.id);
      toast.success(`Deleted ${resident.firstName}.`);
      // Deleting a completed resident also removes their account; keep the
      // Users screen and the KPI row honest without re-pulling them now.
      void queryClient.invalidateQueries({ queryKey: ['users'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'none' });
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

  const visibleResidents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return residents.filter((resident) => {
      if (filter === 'PENDING' && resident.status !== 'PENDING') return false;
      if (filter === 'COMPLETED' && resident.status !== 'COMPLETED') return false;
      if (!query) return true;
      return (
        resident.firstName.toLowerCase().includes(query) ||
        (resident.email ?? '').toLowerCase().includes(query) ||
        resident.property.identifier.toLowerCase().includes(query)
      );
    });
  }, [residents, filter, search]);

  const pendingCount = residents.filter((r) => r.status === 'PENDING').length;

  return (
    <div>
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-primary-soft)">
            <UserRound aria-hidden size={20} className="text-(--color-primary)" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Residents</h1>
            <p className="text-sm text-(--color-ink-muted)">
              Residents registered by an admin. A resident becomes a user once onboarding and
              payment are complete.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRegisterOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-(--color-primary) px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus aria-hidden size={14} />
          Register resident
        </button>
      </header>

      {pendingCount > 0 && (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
          <Clock aria-hidden size={12} />
          {pendingCount} resident{pendingCount === 1 ? '' : 's'} awaiting onboarding
        </p>
      )}

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
            placeholder="Search by name, email or property"
            aria-label="Search residents by name, email or property"
            className="w-64 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
          />
        </div>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as ResidentFilter)}
          aria-label="Filter residents by onboarding status"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
        >
          <option value="ALL">All residents</option>
          <option value="PENDING">Onboarding pending</option>
          <option value="COMPLETED">Onboarding complete</option>
        </select>
      </div>

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
            title="No residents here yet"
            body="Register a resident to issue a persistent onboarding code."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleResidents.map((resident) => (
              <ResidentCard
                key={resident.id}
                resident={resident}
                actingId={actingId}
                deletingId={deletingId}
                copiedId={copiedId}
                onMarkPaid={() => void markPaid(resident)}
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
 * fields visible at a glance with actions for details, payment marking and
 * deletion.
 */
function ResidentCard({
  resident,
  actingId,
  deletingId,
  copiedId,
  onMarkPaid,
  onDelete,
  onCopyCode,
  onDetails,
}: {
  resident: ResidentOnboardingDto;
  actingId: string | null;
  deletingId: string | null;
  copiedId: string | null;
  onMarkPaid: () => void;
  onDelete: () => void;
  onCopyCode: () => void;
  onDetails: () => void;
}) {
  const canMarkPaid = resident.status === 'PENDING' && resident.paymentStatus === 'UNPAID';

  const paid = resident.paymentStatus === 'PAID';
  const completed = resident.status === 'COMPLETED';

  return (
    <article className="overflow-hidden rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card) transition-all hover:shadow-(--shadow-card-hover)">
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
              completed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {completed ? <CheckCircle2 aria-hidden size={10} /> : <Clock aria-hidden size={10} />}
            {completed ? 'Account created' : 'In progress'}
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
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-(--color-surface) px-2.5 py-1.5 text-[11px] font-medium text-(--color-ink) select-all truncate max-w-[140px]"
            title={resident.onboardingCode ?? 'No code available'}
          >
            {resident.onboardingCode ?? <span className="text-(--color-ink-muted) italic">—</span>}
          </span>
          <button
            type="button"
            onClick={onCopyCode}
            disabled={!resident.onboardingCode || copiedId === resident.id}
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

        {/* Payment status + registered */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {paid ? <CheckCircle2 aria-hidden size={10} /> : <Clock aria-hidden size={10} />}
            {paid ? 'Paid' : 'Unpaid'}
          </span>
          <p className="text-[11px] text-(--color-ink-muted)">
            Registered {new Date(resident.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-(--color-surface-soft)/50 p-3 flex items-center justify-between gap-2">
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
            <button
              type="button"
              onClick={onMarkPaid}
              disabled={actingId === resident.id}
              aria-label="Mark paid"
              className="rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              {actingId === resident.id ? (
                <svg
                  className="animate-spin -ml-1 h-5 w-5"
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
              ) : (
                <CreditCard aria-hidden size={14} />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={deletingId === resident.id}
            aria-label="Delete resident"
            className="rounded-md border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 disabled:opacity-60"
          >
            {deletingId === resident.id ? (
              <svg
                className="animate-spin -ml-1 h-5 w-5"
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
            ) : (
              <Trash2 aria-hidden size={14} />
            )}
          </button>
        </div>
      </div>
    </article>
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
                ? 'Created — see the Users screen'
                : resident.status === 'COMPLETED'
                  ? 'Account deleted'
                  : 'Not created yet'}
            </dd>
          </dl>
        </section>
      </div>
    </Modal>
  );
}

function label(value: string | null, options: readonly string[]): string {
  if (!value) return '—';
  return options.includes(value) ? value.replaceAll('_', ' ').toLowerCase() : value;
}
