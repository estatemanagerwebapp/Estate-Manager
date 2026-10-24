import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  // Bumped on every explicit login/logout so the initial /me probe (which
  // fires on mount) cannot overwrite a session the user established while
  // the probe was still in flight.
  const sessionVersion = useRef(0);

  useEffect(() => {
    const startedAt = sessionVersion.current;
    api
      .me()
      .then((body) => {
        // A login/logout happened after this probe started: its result is
        // stale — do not clobber the new session state.
        if (sessionVersion.current === startedAt) setUser(body.user);
      })
      .catch(() => {
        // 401 / no session → anonymous. Any other failure is treated the
        // same so a broken API never blocks the login screen.
        if (sessionVersion.current === startedAt) setUser(null);
      })
      .finally(() => {
        // `loading` only means "initial session probe is in flight" — clear
        // it unconditionally. Gating it on the version (as a previous
        // revision did) left `loading` stuck at true whenever a login
        // happened before the probe settled, which made `RequireGuest`
        // refuse to redirect and stranded signed-in users on /login.
        setLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const body = await api.login(email, password);
    sessionVersion.current += 1;
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
    sessionVersion.current += 1;
    setUser(null);
  }, []);

  const clear = useCallback(() => {
    sessionVersion.current += 1;
    setUser(null);
  }, []);

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
