import type { LucideIcon } from 'lucide-react';
import {
  Building,
  CalendarDays,
  FileSpreadsheet,
  History,
  Home,
  KeyRound,
  LayoutDashboard,
  Mail,
  ScanLine,
  ShieldCheck,
  Siren,
  UserRound,
  Wallet,
} from 'lucide-react';
import type { NavCounterKey, Permission } from '@silverstone/shared';

/**
 * Operator navigation registry.
 *
 * The shell renders from this list rather than hard-coding links. A later
 * module adds its entry here only when its route and permission already
 * exist, so the sidebar never points at a dead page.
 *
 * `requiresUserManage` mirrors the existing account-administration surface:
 * Residents and Administrators are visible to operators who can administer
 * accounts. It is a display convenience only; every route is guarded
 * separately.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  permission?: Permission;
  requiresUserManage?: boolean;
  /** Sidebar counter key. Omitted for destinations with no actionable queue. */
  badge?: NavCounterKey;
}

export interface NavSection {
  id: string;
  label?: string;
  items: readonly NavItem[];
}

/**
 * Primary destinations grouped by operator intent.
 *
 * Front desk queues come first because they are the daily work surface.
 * Portfolio and operations follow, and occasional administration tools sit at
 * the bottom. Empty groups are dropped by the shell for restricted roles.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'overview',
    items: [
      {
        to: '/app',
        label: 'Overview',
        icon: LayoutDashboard,
        end: true,
      },
    ],
  },
  {
    id: 'front-desk',
    label: 'Front desk',
    items: [
      {
        to: '/app/sos',
        label: 'SOS alerts',
        icon: Siren,
        permission: 'sos.read',
        badge: 'sosAlerts',
      },
      {
        to: '/app/messages',
        label: 'Messages',
        icon: Mail,
        permission: 'message.read',
        badge: 'unreadMessages',
      },
    ],
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    items: [
      {
        to: '/app/estates',
        label: 'Estates',
        icon: Home,
        permission: 'estate.read',
      },
      {
        to: '/app/residents',
        label: 'Residents',
        icon: UserRound,
        permission: 'resident.manage',
        badge: 'pendingResidents',
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        to: '/app/billing',
        label: 'Billing',
        icon: Wallet,
        permission: 'billing.read',
        badge: 'overdueInvoices',
      },
      {
        to: '/app/facilities',
        label: 'Facilities',
        icon: Building,
        permission: 'facility.read',
        badge: 'facilityWaitlist',
      },
      {
        to: '/app/bookings',
        label: 'Bookings',
        icon: CalendarDays,
        permission: 'booking.read',
        badge: 'requestedBookings',
      },
      {
        to: '/app/gate',
        label: 'Gate access',
        icon: ScanLine,
        permission: 'verification.read',
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      {
        to: '/app/activity',
        label: 'Activity',
        icon: History,
        permission: 'audit.read',
      },
      {
        to: '/app/imports',
        label: 'Data import',
        icon: FileSpreadsheet,
        permission: 'import.manage',
      },
      {
        to: '/app/administrators',
        label: 'Administrators',
        icon: ShieldCheck,
        requiresUserManage: true,
      },
    ],
  },
];

export const SETTINGS_SECTION_LABEL = 'Settings';

export const SETTINGS_NAV: readonly NavItem[] = [
  {
    to: '/app/account',
    label: 'Account & password',
    icon: KeyRound,
  },
];

export function isNavItemVisible(
  item: NavItem,
  can: Partial<Record<Permission, boolean>>,
  userCanManageUsers: boolean,
): boolean {
  if (item.requiresUserManage) return userCanManageUsers;
  return item.permission ? can[item.permission] === true : true;
}

/** Human-readable name for the sticky header. */
export function sectionLabelForPath(pathname: string): string {
  if (pathname.startsWith('/app/estates')) return 'Estates';
  if (pathname.startsWith('/app/properties/')) return 'Property';
  if (pathname.startsWith('/app/properties')) return 'Estates';
  if (pathname.startsWith('/app/imports')) return 'Data import';
  if (pathname.startsWith('/app/billing')) return 'Billing';
  if (pathname.startsWith('/app/facilities')) return 'Facilities';
  if (pathname.startsWith('/app/bookings')) return 'Bookings';
  if (pathname.startsWith('/app/residents')) return 'Residents';
  if (pathname.startsWith('/app/administrators')) return 'Administrators';
  if (pathname.startsWith('/app/users')) return 'Administrators';
  if (pathname.startsWith('/app/sos')) return 'SOS alerts';
  if (pathname.startsWith('/app/messages')) return 'Messages';
  if (pathname.startsWith('/app/gate')) return 'Gate access';
  if (pathname.startsWith('/app/activity')) return 'Activity';
  if (pathname.startsWith('/app/settings')) return 'Settings';
  if (pathname.startsWith('/app/account')) return 'Settings';
  return 'Overview';
}
