/**
 * Regression tests for the shared guest route. A resident who signs in at
 * `/login` must never be bounced to the operator console (`/app`).
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { UserDto } from '@silverstone/shared';

const authState = vi.hoisted(() => ({
  user: null as UserDto | null,
  loading: false,
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    ...authState,
    login: vi.fn(),
    logout: vi.fn(),
    clear: vi.fn(),
  }),
}));

// Imported after the mock so the guard receives the stubbed context.
import { RequireGuest } from './RouteGuards';

function user(overrides: Partial<UserDto>): UserDto {
  return {
    id: 'u1',
    email: 'resident@example.com',
    phone: null,
    fullName: 'Resident',
    role: 'RESIDENT',
    mustChangePassword: false,
    permissions: [],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastPasswordChangedAt: null,
    ...overrides,
  };
}

function renderGuestRoute() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route
          path="/login"
          element={
            <RequireGuest>
              <p>resident sign in</p>
            </RequireGuest>
          }
        />
        <Route path="/resident/app/dashboard" element={<p>resident dashboard</p>} />
        <Route path="/resident/app/change-password" element={<p>change password</p>} />
        <Route path="/app" element={<p>operator app</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireGuest', () => {
  it('shows the form to an anonymous visitor', () => {
    authState.user = null;
    renderGuestRoute();
    expect(screen.getByText('resident sign in')).toBeTruthy();
  });

  it('sends a signed-in resident to the resident dashboard', () => {
    authState.user = user({});
    renderGuestRoute();
    expect(screen.getByText('resident dashboard')).toBeTruthy();
    expect(screen.queryByText('operator app')).toBeNull();
  });

  it('sends a resident who must change password to the change screen', () => {
    authState.user = user({ mustChangePassword: true });
    renderGuestRoute();
    expect(screen.getByText('change password')).toBeTruthy();
  });

  it('still sends an operator to the operator console', () => {
    authState.user = user({ role: 'SUPER_ADMIN' });
    renderGuestRoute();
    expect(screen.getByText('operator app')).toBeTruthy();
  });
});
