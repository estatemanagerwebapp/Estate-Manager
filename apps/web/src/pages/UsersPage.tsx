import { useCallback, useEffect, useState } from 'react';
import { Users, Search, ShieldOff, ShieldCheck, RefreshCw } from 'lucide-react';
import {
  ROLE_KEYS,
  ROLE_LABELS,
  ACCOUNT_STATUSES,
  type UserListItemDto,
} from '@silverstone/shared';
import { api, ApiRequestError, type UserFilter } from '../api/client';
import { useAuth } from '../auth/AuthContext';

/**
 * User administration for operators with `user.manage`. Lists staff
 * accounts, suspends / re-enables them, and assigns roles.
 *
 * What is shown here is convenience only — every mutation is re-validated
 * on the server (including the last-super-admin guard), so the page may
 * optimistically display state without ever weakening the security model.
 */
export function UsersPage() {
  const { user: actor } = useAuth();
  const [users, setUsers] = useState<UserListItemDto[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (filter: UserFilter) => {
    setError(null);
    try {
      const body = await api.listUsers(filter);
      setUsers(body.users);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'FORBIDDEN') {
        setError('You no longer have permission to manage users.');
      } else {
        setError('Could not load users.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const filter: UserFilter = {};
    if (roleFilter) filter.role = roleFilter;
    if (statusFilter) filter.status = statusFilter;
    setLoading(true);
    void load(filter);
  }, [roleFilter, statusFilter, load]);

  async function applyStatus(target: UserListItemDto, status: string, reason: string) {
    const previous = users;
    setUsers((current) =>
      current.map((user) =>
        user.id === target.id ? { ...user, status: status as UserListItemDto['status'] } : user,
      ),
    );
    try {
      await api.setUserStatus(target.id, status, reason || undefined);
    } catch (err) {
      setUsers(previous);
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Could not update the user.');
      }
    }
  }

  async function applyRole(target: UserListItemDto, role: string) {
    const previous = users;
    setUsers((current) =>
      current.map((user) =>
        user.id === target.id ? { ...user, role: role as UserListItemDto['role'] } : user,
      ),
    );
    try {
      await api.setUserRole(target.id, role);
    } catch (err) {
      setUsers(previous);
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Could not update the user.');
      }
    }
  }

  const visibleUsers = search.trim()
    ? users.filter((user) => user.email.toLowerCase().includes(search.trim().toLowerCase()))
    : users;

  return (
    <div>
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-primary-soft)">
          <Users aria-hidden size={20} className="text-(--color-primary)" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-(--color-ink-muted)">
            {actor ? `Signed in as ${ROLE_LABELS[actor.role]}` : ''} · suspending or demoting signs
            the affected user out immediately
          </p>
        </div>
      </header>

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
            placeholder="Search by email"
            aria-label="Search users by email"
            className="w-56 rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary-soft)"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          aria-label="Filter by role"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
        >
          <option value="">All roles</option>
          {ROLE_KEYS.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by status"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
        >
          <option value="">All statuses</option>
          {ACCOUNT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-hidden rounded-(--radius-card) border border-slate-200/80 bg-white shadow-(--shadow-card)">
        {loading ? (
          <p className="p-6 text-sm text-(--color-ink-muted)" role="status">
            Loading users…
          </p>
        ) : visibleUsers.length === 0 ? (
          <p className="p-6 text-sm text-(--color-ink-muted)">
            No users match the current filters.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-(--color-surface) text-xs text-(--color-ink-muted)">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Email
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleUsers.map((target) => (
                <UserRow
                  key={target.id}
                  target={target}
                  isSelf={target.id === actor?.id}
                  onStatus={(status, reason) => void applyStatus(target, status, reason)}
                  onRole={(role) => void applyRole(target, role)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function UserRow({
  target,
  isSelf,
  onStatus,
  onRole,
}: {
  target: UserListItemDto;
  isSelf: boolean;
  onStatus: (status: string, reason: string) => void;
  onRole: (role: string) => void;
}) {
  const active = target.status === 'ACTIVE';
  const [reason, setReason] = useState('');

  return (
    <tr>
      <td className="px-4 py-3">
        <span className="font-medium">{target.email}</span>
        {isSelf && (
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-(--color-ink-muted)">
            you
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <select
          value={target.role}
          onChange={(event) => onRole(event.target.value)}
          disabled={isSelf}
          aria-label={`Role for ${target.email}`}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-(--color-primary) disabled:cursor-not-allowed disabled:opacity-60"
        >
          {ROLE_KEYS.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {active ? <ShieldCheck aria-hidden size={12} /> : <ShieldOff aria-hidden size={12} />}
          {target.status}
        </span>
      </td>
      <td className="px-4 py-3">
        {isSelf ? (
          <span className="text-[11px] text-(--color-ink-muted)">
            Self — changes blocked by policy
          </span>
        ) : active ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason (optional)"
              aria-label={`Suspend reason for ${target.email}`}
              maxLength={280}
              className="w-40 rounded-md border border-slate-300 px-2 py-1.5 text-[11px] outline-none focus:border-(--color-primary)"
            />
            <button
              type="button"
              onClick={() => {
                onStatus('SUSPENDED', reason);
                setReason('');
              }}
              className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100"
            >
              Suspend
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onStatus('ACTIVE', '')}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
          >
            <RefreshCw aria-hidden size={12} />
            Re-enable
          </button>
        )}
      </td>
    </tr>
  );
}
