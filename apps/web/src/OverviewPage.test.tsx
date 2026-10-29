/**
 * Overview page smoke test: the KPI row, the property-status card and the
 * activity feed all render their value / "n/a" / empty / denied states,
 * driven by mocked hooks so the test never needs the network.
 */
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type {
  UserDto,
  AuditEventDto,
  DashboardAttentionItemDto,
  DashboardKpisDto,
  Permission,
} from '@silverstone/shared';
import type { useDashboard } from './api/hooks';
import { OverviewPage } from './pages/OverviewPage';

// The page is dumb: it reads `useCan` (which internally reads `useAuth`) and
// `useDashboard`. Both live in their own modules, so we stub them here to
// fix the permission matrix and the dashboard payload without a live session.
//
// `vi.mock` is hoisted to the top of the file, so the factory can only read
// a variable named `mockUseCan`/`mockUseDashboard` (a `vi.hoisted` binding
// would also work, but a plain `let` is enough here since the factory runs
// lazily on first import of the mocked module).
let mockUseCan: (Record<string, boolean> & { user: UserDto | null }) | null = null;
let mockUseDashboard: ReturnType<typeof useDashboard> | null = null;
let mockUseAuth: { user: UserDto | null } | null = null;

vi.mock('./auth/useCan', () => ({
  useCan: () => mockUseCan,
}));

vi.mock('./auth/AuthContext', () => ({
  useAuth: () => mockUseAuth,
  canManageUsers: (user: unknown) =>
    (user as { permissions?: readonly string[] } | null)?.permissions?.includes('user.manage') ??
    false,
}));

vi.mock('./api/hooks', () => ({
  useDashboard: () => mockUseDashboard,
}));

/** A minimal user projection matching the shape `useCan` returns. */
function canMatrix(
  permissions: string[],
  user: UserDto,
): Record<string, boolean> & { user: UserDto | null } {
  return {
    'organization.manage': permissions.includes('organization.manage'),
    'config.manage': permissions.includes('config.manage'),
    'estate.manage': permissions.includes('estate.manage'),
    'estate.read': permissions.includes('estate.read'),
    'resident.manage': permissions.includes('resident.manage'),
    'resident.read': permissions.includes('resident.read'),
    'property.manage': permissions.includes('property.manage'),
    'property.read': permissions.includes('property.read'),
    'assignment.manage': permissions.includes('assignment.manage'),
    'billing.manage': permissions.includes('billing.manage'),
    'billing.read': permissions.includes('billing.read'),
    'payment.verify': permissions.includes('payment.verify'),
    'gate.manage': permissions.includes('gate.manage'),
    'gate.read': permissions.includes('gate.read'),
    'maintenance.manage': permissions.includes('maintenance.manage'),
    'maintenance.read': permissions.includes('maintenance.read'),
    'audit.read': permissions.includes('audit.read'),
    'user.manage': permissions.includes('user.manage'),
    'portal.access.self': permissions.includes('portal.access.self'),
    user,
  } as unknown as Record<string, boolean> & { user: UserDto | null };
}

function renderOverview({
  permissions,
  kpis,
  attention,
  events,
  activityDenied,
}: {
  permissions: Permission[];
  kpis?: DashboardKpisDto;
  attention?: DashboardAttentionItemDto[];
  events?: AuditEventDto[];
  activityDenied?: boolean;
}) {
  const user: UserDto = {
    id: 'user-1',
    email: 'admin@example.com',
    phone: null,
    fullName: 'Admin',
    role: 'SUPER_ADMIN',
    mustChangePassword: false,
    permissions,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    lastPasswordChangedAt: null,
  };

  mockUseAuth = { user };
  mockUseCan = canMatrix(permissions, user);
  mockUseDashboard = {
    kpis: kpis ?? null,
    attention: attention ?? null,
    activity: events ?? null,
    activityDenied: activityDenied ?? false,
    loading: false,
    error: null,
  };

  return render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );
}

function kpis(overrides: Partial<DashboardKpisDto> = {}): DashboardKpisDto {
  return {
    residents: null,
    pendingInvitations: null,
    activeProperties: null,
    totalProperties: null,
    outstandingKobo: null,
    outstandingInvoices: null,
    overdueInvoices: null,
    activeSos: null,
    openComplaints: null,
    auditEventsLast30Days: null,
    estates: null,
    users: null,
    residentDrafts: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mockUseCan = null;
  mockUseDashboard = null;
  mockUseAuth = null;
});

describe('OverviewPage dashboard', () => {
  it('renders KPI values when the API supplies them', async () => {
    renderOverview({
      permissions: ['estate.read', 'property.read', 'user.manage', 'resident.manage', 'audit.read'],
      kpis: kpis({
        residents: 20,
        pendingInvitations: 4,
        activeProperties: 12,
        totalProperties: 15,
        outstandingKobo: 4_500_000,
        outstandingInvoices: 6,
        overdueInvoices: 2,
        activeSos: 1,
        openComplaints: 3,
      }),
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Residents/i)?.textContent).toContain('20');
    });
    expect(screen.getByLabelText(/Residents/i)?.textContent).toContain('4 pending invitations');
    expect(screen.getByLabelText(/Active properties/i)?.textContent).toContain('12');
    expect(screen.getByLabelText(/Active properties/i)?.textContent).toContain('12 of 15');
    expect(screen.getByLabelText(/Outstanding invoices/i)?.textContent).toContain('6 invoices');
    expect(screen.getByLabelText(/Outstanding invoices/i)?.textContent).toContain('2 overdue');
    expect(screen.getByLabelText(/Active SOS alerts/i)?.textContent).toContain('1');
    expect(screen.getByLabelText(/Active SOS alerts/i)?.textContent).toContain('3 open complaints');
  });

  it('renders "n/a" for KPIs hidden to a restricted role', async () => {
    // A GUARD holds none of the read permissions the KPIs are gated on, so
    // every counter arrives as null and the card says "n/a" (not 0).
    renderOverview({
      permissions: [],
      kpis: kpis(),
    });

    await waitFor(() => {
      expect(screen.getAllByText('n/a')).toHaveLength(4);
    });
  });

  it('renders the property status card with a donut when property data is present', async () => {
    renderOverview({
      permissions: ['property.read'],
      kpis: kpis({ activeProperties: 7, totalProperties: 10 }),
    });

    await waitFor(() => {
      expect(screen.getByRole('img', { name: /Status breakdown/i })).toBeTruthy();
    });
    // The legend lists both slices.
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Archived')).toBeTruthy();
  });

  it('hides the property status card for a role without property.read', async () => {
    renderOverview({
      permissions: [],
      kpis: kpis(),
    });

    await waitFor(() => {
      expect(
        screen.getByText('Your role does not have read access to the property registry.'),
      ).toBeTruthy();
    });
  });

  it('renders the needs-attention queue from the dashboard payload', async () => {
    renderOverview({
      permissions: ['billing.read', 'complaint.read', 'audit.read'],
      kpis: kpis({ overdueInvoices: 2, openComplaints: 3 }),
      attention: [
        {
          key: 'billing',
          label: 'Overdue invoices',
          count: 2,
          href: '/app/billing',
        },
        {
          key: 'complaints',
          label: 'Open complaints',
          count: 3,
          href: '/app/complaints',
        },
      ],
    });

    await waitFor(() => {
      const panel = screen.getByLabelText('Needs attention');
      expect(panel.textContent).toContain('Overdue invoices');
      expect(panel.textContent).toContain('2 items');
      expect(panel.textContent).toContain('Open complaints');
    });
    expect(screen.getAllByRole('link', { name: /Review/i })[0]?.getAttribute('href')).toBe(
      '/app/billing',
    );
  });

  it('shows the quiet attention state when no readable counter needs attention', async () => {
    renderOverview({ permissions: [], kpis: kpis(), attention: [] });

    await waitFor(() => {
      expect(screen.getByText(/Nothing needs attention right now/i)).toBeTruthy();
    });
  });

  it('renders the activity feed from audit events', async () => {
    renderOverview({
      permissions: ['audit.read'],
      events: [
        {
          id: 'ev-1',
          eventType: 'estate.created',
          actorId: 'user-1',
          targetType: 'estate',
          targetId: 'est-1',
          requestId: 'req-1',
          outcome: 'success',
          metadata: { targetName: 'Silverstone Gate A', actorEmail: 'admin@example.com' },
          createdAt: new Date().toISOString(),
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText(/admin@example.com created an estate/i)).toBeTruthy();
    });
  });

  it('hides the activity feed (not the page) when the role lacks audit.read', async () => {
    renderOverview({
      permissions: ['estate.read', 'property.read', 'user.manage', 'resident.manage'],
      activityDenied: true,
    });

    await waitFor(() => {
      expect(
        screen.getByText('Your role does not have read access to the audit log.'),
      ).toBeTruthy();
    });
    // The page header is still present — the 403 on /activity did not take
    // the rest of the dashboard down.
    expect(screen.getByRole('heading', { name: /Overview/i })).toBeTruthy();
  });
});
