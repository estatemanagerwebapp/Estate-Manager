import type { Permission, UserDto } from '@silverstone/shared';
import { PERMISSIONS } from '@silverstone/shared';
import { useAuth } from '../auth/AuthContext';

/**
 * Permission predicates for the UI. These mirror the server's capability
 * catalogue and are used *only* to hide or show actions — they never replace
 * the server's own authorization. The API remains the authoritative gate; a
 * hidden button is a convenience, not a control.
 */
export function useCan(): Record<Permission, boolean> & { user: UserDto | null } {
  const { user } = useAuth();

  const record = PERMISSIONS.reduce(
    (acc, permission) => {
      acc[permission] = user?.permissions.includes(permission) ?? false;
      return acc;
    },
    {} as Record<Permission, boolean>,
  );

  return Object.assign(record, { user });
}
