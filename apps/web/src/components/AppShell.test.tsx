/**
 * The operator sidebar keeps configuration screens under Settings rather than
 * mixed into the day-to-day estate navigation.
 */
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { UserDto } from '@silverstone/shared';

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
  useCan: () => ({ 'estate.read': true, 'property.read': true, 'config.manage': true }),
}));

// Imported after the mocks so the shell receives the stubbed context.
import { AppShell } from './AppShell';

describe('AppShell navigation', () => {
  it('files Property options under Settings', () => {
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/app" element={<p>overview body</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const settings = screen.getByRole('group', { name: 'Settings' });
    expect(within(settings).getByRole('link', { name: /property options/i })).toBeTruthy();
    expect(within(settings).getByRole('link', { name: /account & password/i })).toBeTruthy();
  });
});
