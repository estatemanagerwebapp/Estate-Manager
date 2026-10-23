import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/**
 * Route guard: renders `children` only when a session exists. While the
 * initial `/me` probe is in flight it renders a neutral loading panel
 * instead of flashing the login screen.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-(--color-ink-muted)" role="status">
          Checking your session…
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/** Guard for authenticated routes that additionally need a capability. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { user } = useAuth();

  if (user && !user.permissions.includes(permission as never)) {
    // Not the actor's capability: go to their overview rather than 404.
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}

/** For unauthenticated screens (login / reset): bounce signed-in users to
 *  the app instead of showing them the login form. */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
