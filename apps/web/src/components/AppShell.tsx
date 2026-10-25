import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  LayoutDashboard,
  Users,
  KeyRound,
  LogOut,
  Settings,
  Home,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth, canManageUsers } from '../auth/AuthContext';
import { useCan } from '../auth/useCan';
import { ROLE_LABELS } from '@silverstone/shared';

/**
 * Application shell for signed-in operators. Sidebar navigation is
 * permission-aware: an item only renders when the *user projection* carries
 * the matching capability. Hiding an item is a convenience, never a
 * control — the API enforces every route independently.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const can = useCan();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const navClasses = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-(--color-primary-soft) text-(--color-ink)'
        : 'text-(--color-ink-muted) hover:bg-(--color-surface) hover:text-(--color-ink)'
    }`;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200/80 bg-white md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--color-primary-soft)">
            <Building2 aria-hidden size={18} className="text-(--color-primary)" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight tracking-tight">Silverstone</p>
            <p className="text-[11px] text-(--color-ink-muted)">Managers console</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Primary">
          <NavLink to="/app" end className={navClasses}>
            <span className="text-(--color-primary)">
              <LayoutDashboard aria-hidden size={16} />
            </span>
            Overview
          </NavLink>
          {can['estate.read'] && (
            <NavLink to="/app/estates" className={navClasses}>
              <span className="text-(--color-primary)">
                <Home aria-hidden size={16} />
              </span>
              Estates
            </NavLink>
          )}
          {can['property.read'] && (
            <NavLink to="/app/properties" className={navClasses}>
              <span className="text-(--color-primary)">
                <Building2 aria-hidden size={16} />
              </span>
              Properties
            </NavLink>
          )}
          {can['property.read'] && (
            <NavLink to="/app/property-options" className={navClasses}>
              <span className="text-(--color-primary)">
                <SlidersHorizontal aria-hidden size={16} />
              </span>
              Property options
            </NavLink>
          )}
          {canManageUsers(user) && (
            <NavLink to="/app/users" className={navClasses}>
              <span className="text-(--color-primary)">
                <Users aria-hidden size={16} />
              </span>
              Users
            </NavLink>
          )}
          <NavLink to="/app/account" className={navClasses}>
            <span className="text-(--color-primary)">
              <KeyRound aria-hidden size={16} />
            </span>
            Account &amp; password
          </NavLink>
        </nav>

        <div className="border-t border-slate-200/80 p-4">
          <p className="truncate text-xs font-medium text-(--color-ink)">{user?.email ?? '…'}</p>
          <p className="text-[11px] text-(--color-ink-muted)">
            {user ? ROLE_LABELS[user.role] : ''}
          </p>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-3 flex w-full items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-(--color-ink-muted) transition-colors hover:bg-(--color-surface)"
          >
            <LogOut aria-hidden size={14} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        {/* Mobile header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--color-primary-soft)">
              <Building2 aria-hidden size={16} className="text-(--color-primary)" />
            </span>
            <span className="text-sm font-semibold">Silverstone</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/app/account"
              className="rounded-md p-2 text-(--color-ink-muted) hover:bg-(--color-surface)"
              aria-label="Account"
            >
              <Settings aria-hidden size={16} />
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-md p-2 text-(--color-ink-muted) hover:bg-(--color-surface)"
              aria-label="Sign out"
            >
              <LogOut aria-hidden size={16} />
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
