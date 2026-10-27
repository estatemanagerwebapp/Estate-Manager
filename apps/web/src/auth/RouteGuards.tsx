import type { ReactNode } from 'react';
import type { UserDto } from '@silverstone/shared';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/**
 * Where a signed-in actor belongs. Residents must land in their own portal —
 * sending them to `/app` (the operator console) was the bug behind resident
 * sign-in bouncing to the staff dashboard.
 */
export function signedInDestination(user: UserDto): string {
  if (user.role === 'RESIDENT') {
    return user.mustChangePassword
      ? '/resident/app/change-password'
      : '/resident/app/dashboard';
  }
  return '/app';
}

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
    return <Navigate to={signedInDestination(user)} replace />;
  }

  return <>{children}</>;
}

/** For unauthenticated screens (login / reset): bounce signed-in users to
 *  their own home instead of showing them the login form. */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to={signedInDestination(user)} replace />;
  }

  return <>{children}</>;
}
