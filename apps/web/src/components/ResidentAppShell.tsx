import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut,
  LayoutDashboard,
  User,
  Home,
  FileText,
  KeyRound,
  MessageSquareWarning,
  Mail,
  Megaphone,
  Building,
  CalendarDays,
  Siren,
  Bell,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

/**
 * Shell for the resident dashboard area (`/resident/app/*`).
 *
 * Minimal sidebar + header, no permission gating (residents see their own
 * data only). The API enforces authorization independently.
 */

const NAV_ITEMS = [
  { to: '/resident/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/resident/app/profile', label: 'Profile', icon: User },
  { to: '/resident/app/properties', label: 'My Properties', icon: Home },
  { to: '/resident/app/invoices', label: 'Invoices & Payments', icon: FileText },
  { to: '/resident/app/codes', label: 'Access Codes', icon: KeyRound },
  { to: '/resident/app/complaints', label: 'Complaints', icon: MessageSquareWarning },
  { to: '/resident/app/messages', label: 'Messages', icon: Mail },
  { to: '/resident/app/community', label: 'Community', icon: Megaphone },
  { to: '/resident/app/facilities', label: 'Facilities', icon: Building },
  { to: '/resident/app/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/resident/app/sos', label: 'Emergency / SOS', icon: Siren },
  { to: '/resident/app/notifications', label: 'Notifications', icon: Bell },
] as const;

export function ResidentAppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await logout();
    navigate('/resident/login', { replace: true });
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
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                    isActive
                      ? 'bg-(--color-surface) text-(--color-ink)'
                      : 'text-(--color-ink-muted) hover:bg-(--color-surface) hover:text-(--color-ink)'
                  }`}
                >
                  <item.icon aria-hidden size={16} />
                  {item.label}
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
        <header className="border-b border-slate-200/80 bg-white px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-(--color-ink)">Resident Dashboard</h1>
            <p className="text-xs text-(--color-ink-muted)">
              {user?.fullName || user?.email} • Resident
            </p>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
