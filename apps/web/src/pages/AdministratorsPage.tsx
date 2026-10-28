import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  KeyRound,
  LogOut,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  ROLE_LABELS,
  STAFF_ROLE_KEYS,
  type AdminCreateUserInput,
  type AdminCreateUserResponse,
  type RoleKey,
  type StaffRole,
  type UserListItemDto,
  type UserListResponse,
} from '@silverstone/shared';
import { api, ApiRequestError, type UserFilter } from '../api/client';
import { useApiQuery } from '../api/query';
import { queryKeys } from '../api/query-keys';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../toast/Toast';
import { Modal, useConfirm } from '../components/dialog';
import {
  DataTable,
  FilterBar,
  OperatorPageHeader,
  StatusBadge,
  type DataTableColumn,
} from '../components/operator';
import { Button, Field, InfoBanner, inputClass, selectClass } from '../components/ui';

/**
 * Administrators — staff account management for operators with `user.manage`.
 *
 * This screen is deliberately staff-only. Resident accounts are created by the
 * onboarding/payment flow and managed from the Residents screen; they never
 * appear here. Every mutation is re-validated by the API, including the role
 * hierarchy and last-active-super-administrator guards.
 */

const STATUS_OPTIONS = ['ACTIVE', 'SUSPENDED', 'DISABLED'] as const;

/** Roles the acting administrator may create or assign. Display only. */
export function assignableStaffRoles(actorRole: RoleKey | undefined): readonly StaffRole[] {
  if (actorRole === 'SUPER_ADMIN') return STAFF_ROLE_KEYS;
  if (actorRole === 'ESTATE_ADMIN') {
    return STAFF_ROLE_KEYS.filter((role) => role !== 'SUPER_ADMIN');
  }
  return [];
}

/** Whether the actor may manage the target at all (display convenience). */
export function canManageStaffRole(actorRole: RoleKey | undefined, targetRole: string): boolean {
  if (!actorRole) return false;
  if (actorRole === 'SUPER_ADMIN') return true;
  if (actorRole === 'ESTATE_ADMIN') return targetRole !== 'SUPER_ADMIN';
  return false;
}

function roleOptionsFor(actorRole: RoleKey | undefined, currentRole: string): readonly StaffRole[] {
  const assignable = assignableStaffRoles(actorRole);
  if ((assignable as readonly string[]).includes(currentRole)) return assignable;
  return [currentRole as StaffRole, ...assignable];
}

export function AdministratorsPage() {
  const { user: actor } = useAuth();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [issued, setIssued] = useState<AdminCreateUserResponse | null>(null);

  const filter = useMemo<UserFilter>(() => {
    const next: UserFilter = { scope: 'staff' };
    if (roleFilter) next.role = roleFilter;
    if (statusFilter) next.status = statusFilter;
    return next;
  }, [roleFilter, statusFilter]);

  const administratorsKey = queryKeys.administrators.list(filter);
  const {
    data,
    loading,
    error: queryError,
    errorObject,
    refresh,
  } = useApiQuery(administratorsKey, () => api.listUsers(filter), 'Could not load administrators.');

  const administrators = data?.users ?? [];
  const queryErrorText =
    errorObject instanceof ApiRequestError && errorObject.code === 'FORBIDDEN'
      ? 'You no longer have permission to manage administrators.'
      : queryError;

  function patchAdministrators(update: (current: UserListItemDto[]) => UserListItemDto[]) {
    queryClient.setQueryData<UserListResponse>(administratorsKey, (current) =>
      current ? { ...current, users: update(current.users) } : current,
    );
  }

  function invalidateAccountCaches() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.administrators.all,
      refetchType: 'none',
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.all, refetchType: 'none' });
  }

  async function applyStatus(target: UserListItemDto, status: string, reason: string) {
    const previous = queryClient.getQueryData<UserListResponse>(administratorsKey);
    setBusyId(target.id);
    setActionError(null);
    patchAdministrators((current) =>
      current.map((user) =>
        user.id === target.id ? { ...user, status: status as UserListItemDto['status'] } : user,
      ),
    );
    try {
      await api.setUserStatus(target.id, status, reason || undefined);
      invalidateAccountCaches();
      toast.success(
        status === 'ACTIVE'
          ? `Reactivated ${target.fullName ?? target.email}.`
          : `Suspended ${target.fullName ?? target.email}.`,
      );
    } catch (err) {
      if (previous) queryClient.setQueryData(administratorsKey, previous);
      setActionError(
        err instanceof ApiRequestError ? err.message : 'Could not update the administrator.',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function applyRole(target: UserListItemDto, role: string) {
    if (role === target.role) return;
    const previous = queryClient.getQueryData<UserListResponse>(administratorsKey);
    setBusyId(target.id);
    setActionError(null);
    patchAdministrators((current) =>
      current.map((user) =>
        user.id === target.id ? { ...user, role: role as UserListItemDto['role'] } : user,
      ),
    );
    try {
      await api.setUserRole(target.id, role);
      invalidateAccountCaches();
      toast.success(
        `Role changed to ${ROLE_LABELS[role as RoleKey] ?? role}. The account was signed out.`,
      );
    } catch (err) {
      if (previous) queryClient.setQueryData(administratorsKey, previous);
      setActionError(
        err instanceof ApiRequestError ? err.message : 'Could not update the administrator.',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function revokeSessions(target: UserListItemDto) {
    const label = target.fullName ?? target.email;
    const ok = await confirm({
      title: 'Sign this administrator out everywhere?',
      body: `${label} will lose every active session immediately. They can sign in again with their current password.`,
    });
    if (!ok) return;

    setBusyId(target.id);
    setActionError(null);
    try {
      await api.revokeUserSessions(target.id);
      toast.success(`Signed ${label} out of all sessions.`);
    } catch (err) {
      setActionError(
        err instanceof ApiRequestError ? err.message : 'Could not revoke the sessions.',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAdministrator(target: UserListItemDto) {
    const label = target.fullName ?? target.email;
    const ok = await confirm({
      title: 'Permanently delete this administrator?',
      body: `The account "${label}" will be deleted along with its sessions and cannot be recovered. Suspend the account instead if you only need to block access.`,
      danger: true,
    });
    if (!ok) return;

    setBusyId(target.id);
    setActionError(null);
    try {
      await api.deleteUser(target.id);
      patchAdministrators((current) => current.filter((user) => user.id !== target.id));
      invalidateAccountCaches();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.all,
        refetchType: 'none',
      });
      toast.success('Administrator deleted.');
    } catch (err) {
      setActionError(
        err instanceof ApiRequestError ? err.message : 'Could not delete the administrator.',
      );
    } finally {
      setBusyId(null);
    }
  }

  function handleCreated(result: AdminCreateUserResponse) {
    setCreateOpen(false);
    setIssued(result);
    invalidateAccountCaches();
    void refresh();
  }

  const visibleAdministrators = search.trim()
    ? administrators.filter((administrator) => {
        const query = search.trim().toLowerCase();
        return (
          administrator.email.toLowerCase().includes(query) ||
          (administrator.fullName ?? '').toLowerCase().includes(query)
        );
      })
    : administrators;

  const columns: DataTableColumn<UserListItemDto>[] = [
    {
      key: 'administrator',
      header: 'Administrator',
      cell: (target) => (
        <div className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5 font-medium">
            {target.fullName ?? target.email}
            {target.id === actor?.id && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-(--color-ink-muted)">
                you
              </span>
            )}
            {target.mustChangePassword && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                temporary password
              </span>
            )}
          </span>
          <span className="text-[11px] text-(--color-ink-muted)">
            Added {new Date(target.createdAt).toLocaleDateString()}
          </span>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      cell: (target) => (
        <div className="flex flex-col gap-0.5 text-[12px] text-(--color-ink-muted)">
          <span>{target.email}</span>
          {target.phone ? <span>{target.phone}</span> : null}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (target) => {
        const manageable = canManageStaffRole(actor?.role, target.role);
        return (
          <select
            value={target.role}
            onChange={(event) => void applyRole(target, event.target.value)}
            disabled={!manageable || target.id === actor?.id || busyId === target.id}
            aria-label={`Role for ${target.fullName ?? target.email}`}
            className={`${selectClass} text-xs disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {roleOptionsFor(actor?.role, target.role).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (target) => (
        <StatusBadge
          status={target.status}
          tone={target.status === 'ACTIVE' ? 'success' : 'danger'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (target) => (
        <AdministratorActions
          target={target}
          isSelf={target.id === actor?.id}
          manageable={canManageStaffRole(actor?.role, target.role)}
          busy={busyId === target.id}
          onStatus={(status, reason) => void applyStatus(target, status, reason)}
          onRevoke={() => void revokeSessions(target)}
          onDelete={() => void deleteAdministrator(target)}
        />
      ),
    },
  ];

  const assignable = assignableStaffRoles(actor?.role);

  return (
    <div>
      <OperatorPageHeader
        icon={<ShieldCheck aria-hidden size={20} className="text-(--color-primary)" />}
        title="Administrators"
        description="Staff accounts for the operator console. Resident portal accounts are managed on the Residents screen."
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={assignable.length === 0}
            title={assignable.length === 0 ? 'You cannot create staff accounts' : undefined}
          >
            <UserPlus aria-hidden size={14} />
            Add administrator
          </Button>
        }
      />

      <FilterBar summary={`${visibleAdministrators.length} shown`}>
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
            placeholder="Search by name or email"
            aria-label="Search administrators by name or email"
            className="w-56 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          aria-label="Filter by role"
          className={selectClass}
        >
          <option value="">All staff roles</option>
          {STAFF_ROLE_KEYS.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by status"
          className={selectClass}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </FilterBar>

      {actionError && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {actionError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={visibleAdministrators}
        getRowKey={(administrator) => administrator.id}
        caption="Staff administrator accounts"
        loading={loading}
        error={queryErrorText}
        onRetry={() => void refresh()}
        emptyTitle="No administrators match"
        emptyBody="Adjust the filters or add the first staff account."
        emptyAction={
          assignable.length > 0 ? (
            <Button variant="secondary" onClick={() => setCreateOpen(true)}>
              <UserPlus aria-hidden size={14} />
              Add administrator
            </Button>
          ) : undefined
        }
      />

      {createOpen && (
        <CreateAdministratorModal
          actorRole={actor?.role}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {issued && <TemporaryPasswordModal result={issued} onClose={() => setIssued(null)} />}

      {confirmDialog}
    </div>
  );
}

function AdministratorActions({
  target,
  isSelf,
  manageable,
  busy,
  onStatus,
  onRevoke,
  onDelete,
}: {
  target: UserListItemDto;
  isSelf: boolean;
  manageable: boolean;
  busy: boolean;
  onStatus: (status: string, reason: string) => void;
  onRevoke: () => void;
  onDelete: () => void;
}) {
  const [reason, setReason] = useState('');
  const active = target.status === 'ACTIVE';
  const label = target.fullName ?? target.email;

  if (isSelf) {
    return (
      <span className="text-[11px] text-(--color-ink-muted)">
        Self — use Account &amp; password
      </span>
    );
  }

  if (!manageable) {
    return <span className="text-[11px] text-(--color-ink-muted)">Higher role required</span>;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {active ? (
        <>
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason (optional)"
            aria-label={`Suspend reason for ${label}`}
            maxLength={280}
            className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-[11px] outline-none focus:border-(--color-primary)"
          />
          <button
            type="button"
            onClick={() => {
              onStatus('SUSPENDED', reason);
              setReason('');
            }}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ShieldOff aria-hidden size={12} />
            Suspend
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => onStatus('ACTIVE', '')}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ShieldCheck aria-hidden size={12} />
          Re-enable
        </button>
      )}
      <button
        type="button"
        onClick={onRevoke}
        disabled={busy}
        title="Sign out everywhere"
        aria-label={`Revoke all sessions for ${label}`}
        className="rounded-md border border-slate-300 bg-white p-1.5 text-(--color-ink-muted) hover:bg-(--color-surface) disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogOut aria-hidden size={12} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        title="Delete administrator"
        aria-label={`Delete ${label}`}
        className="rounded-md border border-rose-200 bg-white p-1.5 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Trash2 aria-hidden size={12} />
      </button>
    </div>
  );
}

function CreateAdministratorModal({
  actorRole,
  onClose,
  onCreated,
}: {
  actorRole: RoleKey | undefined;
  onClose: () => void;
  onCreated: (result: AdminCreateUserResponse) => void;
}) {
  const roles = assignableStaffRoles(actorRole);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>(
    roles.includes('ESTATE_ADMIN') ? 'ESTATE_ADMIN' : (roles[0] ?? 'GUARD'),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setError('Enter a name and email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input: AdminCreateUserInput = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        role,
      };
      onCreated(await api.createAdministrator(input));
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Could not create the administrator.',
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add administrator"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !fullName.trim() || !email.trim() || roles.length === 0}
          >
            {submitting ? 'Creating…' : 'Create administrator'}
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

        <Field label="Full name">
          <input
            className={inputClass}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={160}
            autoComplete="name"
            required
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={255}
            autoComplete="email"
            placeholder="name@example.com"
            required
          />
        </Field>

        <Field label="Phone (optional)">
          <input
            type="tel"
            className={inputClass}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={40}
            autoComplete="tel"
            placeholder="+234 800 000 0000"
          />
        </Field>

        <Field label="Role" hint="Role changes and suspensions sign the account out immediately.">
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as StaffRole)}
            className={`${selectClass} w-full`}
          >
            {roles.map((option) => (
              <option key={option} value={option}>
                {ROLE_LABELS[option]}
              </option>
            ))}
          </select>
        </Field>

        <InfoBanner>
          A temporary password is generated now and shown once. The administrator must change it
          after their first sign-in.
        </InfoBanner>
      </form>
    </Modal>
  );
}

function TemporaryPasswordModal({
  result,
  onClose,
}: {
  result: AdminCreateUserResponse;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const label = result.user.fullName ?? result.user.email;

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Administrator created"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Check aria-hidden size={18} />
          </span>
          <div>
            <p className="text-sm font-medium text-(--color-ink)">{label}</p>
            <p className="text-xs text-(--color-ink-muted)">
              {result.user.email} · {ROLE_LABELS[result.user.role]}
            </p>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-(--color-surface) px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-(--color-ink-muted)">
            <KeyRound aria-hidden size={12} />
            Temporary password
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-white px-3 py-2 text-sm font-semibold tracking-wide text-(--color-ink)">
              {result.temporaryPassword}
            </code>
            <Button variant="secondary" size="sm" onClick={() => void copyPassword()}>
              {copied ? <Check aria-hidden size={12} /> : <Copy aria-hidden size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <InfoBanner tone="warning">
          Copy this password now and share it with the administrator over a trusted channel. It is
          not shown again, and the account must change it after signing in.
        </InfoBanner>
      </div>
    </Modal>
  );
}
