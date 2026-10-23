import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LoginResponse, UserDto } from '@silverstone/shared';
import { ApiRequestError, api } from '../api/client';

/**
 * Session state for the web console.
 *
 * The browser never stores the session: it lives in an HttpOnly cookie
 * (`silverstone.session`) set by the API. The context only caches the
 * *user projection* returned by `GET /auth/me`, and refreshes it once on
 * mount. A 401 from any API call is treated as "session gone" and clears
 * the cache — the server remains the source of truth.
 */
export interface AuthState {
  /** True while the initial `/me` probe is in flight. */
  loading: boolean;
  user: UserDto | null;
  login: (email: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  /** Clears the local cache and, best-effort, revokes the server session. */
  clear: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((body) => {
        if (!cancelled) setUser(body.user);
      })
      .catch((error: unknown) => {
        // 401 / no session → anonymous. Any other failure is treated the
        // same so a broken API never blocks the login screen.
        if (!cancelled) setUser(null);
        void error;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const body = await api.login(email, password);
    setUser(body.user);
    return body;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch (error) {
      // The session may already be gone; still clear local state.
      void error;
    }
    setUser(null);
  }, []);

  const clear = useCallback(() => setUser(null), []);

  const value = useMemo<AuthState>(
    () => ({ loading, user, login, logout, clear }),
    [loading, user, login, logout, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

/** Convenience: true when the user can administer accounts. The list is a
 *  mirror of the server catalogue and only drives what the UI *shows*;
 *  enforcement always happens on the server. */
export function canManageUsers(user: UserDto | null): boolean {
  return user?.permissions.includes('user.manage') ?? false;
}

/** Re-exports the error type so pages can branch on session expiry. */
export { ApiRequestError };
