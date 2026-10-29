import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { Building2, KeyRound, LogOut, Settings } from 'lucide-react';
import { useAuth, canManageUsers } from '../auth/AuthContext';
import { useCan } from '../auth/useCan';
import { RefreshButton } from './RefreshButton';
import { ROLE_LABELS, type NavCounterKey, type NavCountsDto } from '@silverstone/shared';
import {
  NAV_SECTIONS,
  SETTINGS_NAV,
  SETTINGS_SECTION_LABEL,
  isNavItemVisible,
  sectionLabelForPath,
  type NavItem,
} from '../navigation';
import { useNavigationCounts } from '../api/navigation';

const BADGE_LABELS: Record<NavCounterKey, string> = {
  sosAlerts: 'active',
  unreadMessages: 'unread',
  openComplaints: 'open',
  requestedBookings: 'awaiting action',
  overdueInvoices: 'overdue',
  pendingResidents: 'pending onboarding',
  facilityWaitlist: 'waiting for a slot',
};

const BADGE_TONES: Record<NavCounterKey, string> = {
  sosAlerts: 'bg-rose-100 text-rose-700',
  unreadMessages: 'bg-sky-100 text-sky-700',
  openComplaints: 'bg-amber-100 text-amber-800',
  requestedBookings: 'bg-amber-100 text-amber-800',
  overdueInvoices: 'bg-amber-100 text-amber-800',
  pendingResidents: 'bg-amber-100 text-amber-800',
  facilityWaitlist: 'bg-slate-100 text-slate-700',
};

function badgeText(count: number | null | undefined): string | null {
  if (typeof count !== 'number' || count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

function NavBadge({ item, counts }: { item: NavItem; counts: NavCountsDto | null }) {
  if (!item.badge) return null;
  const text = badgeText(counts?.[item.badge]);
  if (!text) return null;
  return (
    <span
      aria-hidden="true"
      className={`ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${BADGE_TONES[item.badge]}`}
    >
      {text}
    </span>
  );
}

/**
 * Application shell for signed-in operators. Sidebar navigation is
 * permission-aware: an item only renders when the *user projection* carries
 * the matching capability. Hiding an item is a convenience, never a
 * control — the API enforces every route independently.
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const can = useCan();
  const userCanManage = canManageUsers(user);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: navCounts } = useNavigationCounts();

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

  function renderNavItem(item: NavItem) {
    const Icon = item.icon;
    const text = item.badge ? badgeText(navCounts?.[item.badge]) : null;
    const ariaLabel =
      item.badge && text ? `${item.label}, ${text} ${BADGE_LABELS[item.badge]}` : undefined;

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={navClasses}
        aria-label={ariaLabel}
      >
        <span className="text-(--color-primary)">
          <Icon aria-hidden size={16} />
        </span>
        {item.label}
        <NavBadge item={item} counts={navCounts} />
      </NavLink>
    );
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-y-auto border-r border-slate-200/80 bg-white md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--color-primary-soft)">
            <Building2 aria-hidden size={18} className="text-(--color-primary)" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight tracking-tight">Silverstone</p>
            <p className="text-[11px] text-(--color-ink-muted)">Managers console</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-3 px-3" aria-label="Primary">
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((item) =>
              isNavItemVisible(item, can, userCanManage),
            );
            if (items.length === 0) return null;
            const labelId = `nav-section-${section.id}`;

            return (
              <div
                key={section.id}
                role={section.label ? 'group' : undefined}
                aria-labelledby={section.label ? labelId : undefined}
              >
                {section.label ? (
                  <p
                    id={labelId}
                    className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-(--color-ink-muted)"
                  >
                    {section.label}
                  </p>
                ) : null}
                <div className="flex flex-col gap-1">{items.map(renderNavItem)}</div>
              </div>
            );
          })}

          <div className="mt-auto border-t border-slate-200/80 pt-3">
            <p
              id="nav-settings"
              className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-(--color-ink-muted)"
            >
              {SETTINGS_SECTION_LABEL}
            </p>
            <div role="group" aria-labelledby="nav-settings" className="flex flex-col gap-1">
              {SETTINGS_NAV.filter((item) => isNavItemVisible(item, can, userCanManage)).map(
                renderNavItem,
              )}
            </div>
          </div>
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

      <main className="md:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur md:px-8 md:py-2">
          <div className="flex items-center gap-2 md:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--color-primary-soft)">
              <Building2 aria-hidden size={16} className="text-(--color-primary)" />
            </span>
            <span className="text-sm font-semibold">Silverstone</span>
          </div>
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.14em] text-(--color-ink-muted) md:block">
            {sectionLabelForPath(location.pathname)}
          </p>
          <div className="flex items-center gap-1.5">
            <RefreshButton />
            <Link
              to="/app/account"
              className="rounded-md p-2 text-(--color-ink-muted) hover:bg-(--color-surface) md:hidden"
              aria-label="Account"
            >
              <Settings aria-hidden size={16} />
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-md p-2 text-(--color-ink-muted) hover:bg-(--color-surface) md:hidden"
              aria-label="Sign out"
            >
              <LogOut aria-hidden size={16} />
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-6 py-8">
          {user?.mustChangePassword && (
            <div
              role="alert"
              className="mb-5 flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <span className="text-amber-600">
                <KeyRound aria-hidden size={16} />
              </span>
              <p className="text-xs font-medium text-amber-800">
                You are signed in with a temporary password.{' '}
                <Link
                  to="/app/account"
                  className="underline underline-offset-2 hover:text-amber-900"
                >
                  Set your own password
                </Link>{' '}
                to finish activation.
              </p>
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
