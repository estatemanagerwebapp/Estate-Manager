import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut,
  LayoutDashboard,
  User,
  Home,
  FileText,
  KeyRound,
  Megaphone,
  Building,
  CalendarDays,
  Siren,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import type { ResidentNavCounterKey } from '@silverstone/shared';
import { useAuth } from '../auth/AuthContext';
import { useSyncSnapshot } from '../api/sync';
import { RefreshButton } from './RefreshButton';

/**
 * Shell for the resident dashboard area (`/resident/app/*`).
 *
 * Minimal sidebar + header, no permission gating (residents see their own
 * data only). The API enforces authorization independently.
 *
 * Badges come from `/sync`: an unread notification carries the route it points
 * at, so the section it belongs to shows the count and clears when the resident
 * reads it. The shell polls every few seconds, so a staff action (booking
 * approved, code used, reply posted) appears without a manual refresh.
 */

interface ResidentNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  counter?: ResidentNavCounterKey;
}

const NAV_ITEMS: readonly ResidentNavItem[] = [
  { to: '/resident/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/resident/app/properties', label: 'My Properties', icon: Home },
  {
    to: '/resident/app/invoices',
    label: 'Invoices & Payments',
    icon: FileText,
    counter: 'invoiceUpdates',
  },
  { to: '/resident/app/codes', label: 'Access Codes', icon: KeyRound, counter: 'codeUpdates' },
  {
    to: '/resident/app/community',
    label: 'Community',
    icon: Megaphone,
    counter: 'communityUpdates',
  },
  { to: '/resident/app/facilities', label: 'Facilities', icon: Building },
  {
    to: '/resident/app/bookings',
    label: 'Bookings',
    icon: CalendarDays,
    counter: 'bookingUpdates',
  },
  { to: '/resident/app/sos', label: 'Emergency / SOS', icon: Siren, counter: 'sosUpdates' },
  {
    to: '/resident/app/notifications',
    label: 'Notifications',
    icon: Bell,
    counter: 'unreadNotifications',
  },
  { to: '/resident/app/profile', label: 'Profile', icon: User },
] as const;

const RESIDENT_BADGE_LABELS: Record<ResidentNavCounterKey, string> = {
  unreadNotifications: 'unread',
  bookingUpdates: 'new',
  codeUpdates: 'new',
  messageUpdates: 'new',
  invoiceUpdates: 'new',
  sosUpdates: 'new',
  communityUpdates: 'new',
};

function badgeText(count: number | null | undefined): string | null {
  if (typeof count !== 'number' || count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

export function ResidentAppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { snapshot } = useSyncSnapshot(Boolean(user));
  const counts = snapshot?.residentCounts ?? null;

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-(--color-surface)">
      <aside className="hidden lg:flex lg:w-64 flex-col border-r border-slate-200/80 bg-white">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <Home aria-hidden size={20} className="text-(--color-primary)" />
            <span className="text-sm font-semibold text-(--color-ink)">Resident Portal</span>
          </div>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.to;
              const count = item.counter ? counts?.[item.counter] : null;
              const text = badgeText(count);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-label={
                    item.counter && text
                      ? `${item.label}, ${text} ${RESIDENT_BADGE_LABELS[item.counter]}`
                      : undefined
                  }
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                    isActive
                      ? 'bg-(--color-surface) text-(--color-ink)'
                      : 'text-(--color-ink-muted) hover:bg-(--color-surface) hover:text-(--color-ink)'
                  }`}
                >
                  <item.icon aria-hidden size={16} />
                  {item.label}
                  {text && (
                    <span
                      aria-hidden="true"
                      className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-orange-700"
                    >
                      {text}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto p-6 border-t border-slate-200/80">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            <LogOut aria-hidden size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-6 py-4 backdrop-blur flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold text-(--color-ink)">Resident Dashboard</h1>
            <p className="text-xs text-(--color-ink-muted)">
              {user?.fullName || user?.email} • Resident
            </p>
          </div>
          <RefreshButton />
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
