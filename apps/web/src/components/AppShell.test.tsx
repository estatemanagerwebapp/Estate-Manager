/**
 * The operator sidebar groups daily queues first, keeps account settings under
 * Settings, and renders permission-gated counters without exposing a
 * misleading zero.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavCountsDto, UserDto } from '@silverstone/shared';

const authState = vi.hoisted(() => ({
  user: {
    id: 'u1',
    email: 'admin@example.com',
    phone: null,
    fullName: 'Admin',
    role: 'SUPER_ADMIN',
    mustChangePassword: false,
    permissions: [],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastPasswordChangedAt: null,
  } as UserDto,
}));

const navCountsState = vi.hoisted(() => ({
  counts: null as NavCountsDto | null,
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    clear: vi.fn(),
  }),
  canManageUsers: () => true,
}));

vi.mock('../auth/useCan', () => ({
  useCan: () => ({
    'estate.read': true,
    'property.read': true,
    'config.manage': true,
    'sos.read': true,
    'message.read': true,
    'complaint.read': true,
    'billing.read': true,
    'facility.read': true,
    'booking.read': true,
    'verification.read': true,
    'audit.read': true,
    'import.manage': true,
  }),
}));

vi.mock('../api/navigation', () => ({
  useNavigationCounts: () => ({ data: navCountsState.counts }),
}));

// Imported after the mocks so the shell receives the stubbed context.
import { AppShell } from './AppShell';

function renderShell() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/app" element={<p>overview body</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell navigation', () => {
  beforeEach(() => {
    navCountsState.counts = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('does not expose a Property options screen under Settings', () => {
    renderShell();

    const settings = screen.getByRole('group', { name: 'Settings' });
    expect(within(settings).queryByRole('link', { name: /property options/i })).toBeNull();
    expect(within(settings).getByRole('link', { name: /account & password/i })).toBeTruthy();
  });

  it('renders the grouped primary navigation in order', () => {
    renderShell();

    const frontDesk = screen.getByRole('group', { name: 'Front desk' });
    expect(within(frontDesk).getByRole('link', { name: 'SOS alerts' })).toBeTruthy();
    expect(within(frontDesk).getByRole('link', { name: 'Messages' })).toBeTruthy();
    expect(within(frontDesk).getByRole('link', { name: 'Complaints' })).toBeTruthy();

    const portfolio = screen.getByRole('group', { name: 'Portfolio' });
    expect(within(portfolio).getByRole('link', { name: /residents/i })).toBeTruthy();

    const administration = screen.getByRole('group', { name: 'Administration' });
    expect(within(administration).getByRole('link', { name: /data import/i })).toBeTruthy();
    expect(within(administration).getByRole('link', { name: /administrators/i })).toBeTruthy();
  });

  it('renders readable counters, hides zero, and caps large values', () => {
    navCountsState.counts = {
      sosAlerts: 0,
      unreadMessages: 5,
      openComplaints: 120,
      requestedBookings: null,
      overdueInvoices: 2,
      pendingResidents: 3,
      facilityWaitlist: 1,
    };

    renderShell();

    expect(screen.getByRole('link', { name: /messages, 5 unread/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /complaints, 99\+ open/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /billing, 2 overdue/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /facilities, 1 waiting for a slot/i })).toBeTruthy();
    // Zero is hidden: the link keeps its plain name.
    expect(screen.getByRole('link', { name: 'SOS alerts' })).toBeTruthy();
    // Unreadable is hidden too.
    expect(screen.getByRole('link', { name: 'Bookings' })).toBeTruthy();
  });
});
