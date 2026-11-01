import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Building2,
  ChevronDown,
  KeyRound,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from 'lucide-react';
import { useState } from 'react';
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
import { useSyncSnapshot } from '../api/sync';

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
  const { snapshot } = useSyncSnapshot(Boolean(user));
  const navCounts = snapshot?.staffCounts ?? null;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const navClasses = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-r-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'border-(--color-primary) bg-orange-50 text-orange-800'
        : 'border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-950'
    } ${sidebarCollapsed ? 'md:justify-center md:px-0' : ''}`;

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
        title={sidebarCollapsed ? item.label : undefined}
      >
        <span className="text-(--color-primary)">
          <Icon aria-hidden size={18} strokeWidth={1.8} />
        </span>
        <span className={sidebarCollapsed ? 'md:sr-only' : ''}>{item.label}</span>
        <span className={sidebarCollapsed ? 'md:hidden' : ''}>
          <NavBadge item={item} counts={navCounts} />
        </span>
      </NavLink>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f8fb] text-slate-900">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/35 md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col overflow-x-hidden overflow-y-auto border-r border-slate-200/80 bg-white transition-[width,transform] duration-200 md:translate-x-0 ${sidebarCollapsed ? 'md:w-[76px]' : 'md:w-[268px]'} ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div
          className={`relative flex h-[72px] shrink-0 items-center justify-between border-b border-slate-100 px-5 ${sidebarCollapsed ? 'md:h-[104px] md:flex-col md:justify-center md:gap-1 md:px-0' : ''}`}
        >
          <Link
            to="/app"
            onClick={() => setMobileNavOpen(false)}
            className={`flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-orange-500 ${sidebarCollapsed ? 'md:justify-center' : ''}`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-sm shadow-orange-200">
              <Building2 aria-hidden size={20} strokeWidth={2.1} />
            </span>
            <span className={sidebarCollapsed ? 'md:hidden' : ''}>
              <span className="block text-[15px] font-bold leading-tight tracking-tight">
                Silverstone
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">Managers console</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 md:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`hidden rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 md:block ${sidebarCollapsed ? 'md:static' : ''}`}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-4 px-0 py-4" aria-label="Primary">
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
                    className={`px-6 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${sidebarCollapsed ? 'md:sr-only' : ''}`}
                  >
                    {section.label}
                  </p>
                ) : null}
                <div className={`flex flex-col gap-1 pr-3 ${sidebarCollapsed ? 'md:pr-2' : ''}`}>
                  {items.map((item) => (
                    <span key={item.to} onClick={() => setMobileNavOpen(false)}>
                      {renderNavItem(item)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="mt-auto border-t border-slate-100 pt-3">
            <p
              id="nav-settings"
              className={`px-6 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${sidebarCollapsed ? 'md:sr-only' : ''}`}
            >
              {SETTINGS_SECTION_LABEL}
            </p>
            <div
              role="group"
              aria-labelledby="nav-settings"
              className={`flex flex-col gap-1 pr-3 ${sidebarCollapsed ? 'md:pr-2' : ''}`}
            >
              {SETTINGS_NAV.filter((item) => isNavItemVisible(item, can, userCanManage)).map(
                (item) => (
                  <span key={item.to} onClick={() => setMobileNavOpen(false)}>
                    {renderNavItem(item)}
                  </span>
                ),
              )}
            </div>
          </div>
        </nav>

        <div
          className={`border-t border-slate-100 p-4 ${sidebarCollapsed ? 'md:flex md:justify-center md:p-3' : ''}`}
        >
          <div className={sidebarCollapsed ? 'md:hidden' : ''}>
            <p className="truncate text-xs font-semibold text-slate-800">{user?.email ?? '…'}</p>
            <p className="text-[11px] text-slate-500">{user ? ROLE_LABELS[user.role] : ''}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            title={sidebarCollapsed ? 'Sign out' : undefined}
            className={`mt-3 flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 ${sidebarCollapsed ? 'md:mt-0 md:h-10 md:w-10 md:justify-center md:p-0' : ''}`}
          >
            <LogOut aria-hidden size={14} />
            <span className={sidebarCollapsed ? 'md:sr-only' : ''}>Sign out</span>
          </button>
        </div>
      </aside>

      <main className={sidebarCollapsed ? 'md:pl-[76px]' : 'md:pl-[268px]'}>
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
              aria-label="Open menu"
            >
              <Menu size={19} />
            </button>
            <label className="hidden h-10 w-full max-w-[470px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 text-slate-500 shadow-sm md:flex">
              <Search aria-hidden size={17} />
              <input
                aria-label="Search estates, properties, residents"
                placeholder="Search estates, properties, residents…"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </label>
            <p className="truncate text-sm font-semibold text-slate-700 md:hidden">
              {sectionLabelForPath(location.pathname)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Link
              to="/app/activity"
              aria-label="Recent activity"
              title="Recent activity"
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
            >
              <Bell size={18} strokeWidth={1.8} />
            </Link>
            <span className="hidden h-8 w-px bg-slate-200 sm:block" />
            <Link
              to="/app/account"
              className="flex items-center gap-3 rounded-lg py-1 pl-1 pr-2 transition hover:bg-slate-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-base font-medium text-white shadow-sm">
                {(user?.fullName || user?.email || 'A').slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-36 truncate text-sm font-semibold leading-tight text-slate-900">
                  {user?.fullName || user?.email?.split('@')[0] || 'Admin'}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {user ? ROLE_LABELS[user.role] : ''}
                </span>
              </span>
              <ChevronDown size={15} className="hidden text-slate-500 sm:block" />
            </Link>
            <RefreshButton />
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 md:px-7 md:py-7">
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
