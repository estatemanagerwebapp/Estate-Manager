/**
 * Session boundaries must clear the in-memory data cache. A resident and an
 * operator share the same SPA bundle; without this, data from one account
 * could be painted for the next one.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserDto } from '@silverstone/shared';

const apiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../api/client', () => {
  class ApiRequestError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status?: number,
    ) {
      super(message);
    }
  }
  return {
    api: apiMocks,
    ApiRequestError,
    setUnauthorizedHandler: vi.fn(),
  };
});

import { queryClient } from '../api/query';
import { AuthProvider, useAuth } from './AuthContext';

const operator: UserDto = {
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
};

function Consumer() {
  const { user, loading, login, logout } = useAuth();
  return (
    <div>
      <p>{loading ? 'loading' : (user?.email ?? 'anonymous')}</p>
      <button type="button" onClick={() => void login('admin@example.com', 'secret')}>
        Log in
      </button>
      <button type="button" onClick={() => void logout()}>
        Log out
      </button>
    </div>
  );
}

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

describe('AuthProvider cache boundaries', () => {
  it('clears cached reads when signing in and when signing out', async () => {
    apiMocks.me.mockRejectedValue(new Error('no session'));
    apiMocks.login.mockResolvedValue({ user: operator });
    apiMocks.logout.mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await screen.findByText('anonymous');

    queryClient.setQueryData(['private'], { value: 'operator-only' });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await screen.findByText('admin@example.com');
    await waitFor(() => expect(queryClient.getQueryData(['private'])).toBeUndefined());

    queryClient.setQueryData(['private'], { value: 'operator-only' });
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await screen.findByText('anonymous');
    await waitFor(() => expect(queryClient.getQueryData(['private'])).toBeUndefined());
  });
});
