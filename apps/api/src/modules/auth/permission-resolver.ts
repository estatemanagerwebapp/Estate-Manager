import {
  PERMISSIONS,
  permissionsForRole,
  isRoleKey,
  isPermission,
  type Permission,
  type RoleKey,
} from '@silverstone/shared';

/**
 * Centralized authorization decision.
 *
 * Given a user's *stored* role (always read from the database, never taken
 * from a request) and a permission string, this service answers whether the
 * role — combined with any organization-level grants — allows it.
 *
 * Deny-by-default: an unknown role, or a grant that references a permission
 * that no longer exists in the shared catalogue, is treated as "no
 * permissions" rather than a wildcard.
 */
export class PermissionResolver {
  constructor(
    /**
     * Loads the organization's current role grants. Returns an empty array
     * when the deployment is unprovisioned or the configuration is
     * unavailable.
     */
    private readonly loadGrants: () => Promise<
      readonly { role: string; permissions: readonly string[] }[]
    >,
  ) {}

  /**
   * An organization grant may narrow or extend a role's baseline. Each grant
   * value is re-checked against the shared catalogue at use time so a
   * hand-edited document cannot widen a role to a permission string that no
   * code path checks.
   */
  private grantOverrides(
    grants: readonly { role: string; permissions: readonly string[] }[],
  ): Partial<Record<RoleKey, readonly Permission[]>> {
    const overrides: Partial<Record<RoleKey, readonly Permission[]>> = {};
    for (const grant of grants) {
      if (!isRoleKey(grant.role)) continue;
      const valid = (grant.permissions as readonly string[]).filter((p) =>
        isPermission(p),
      ) as Permission[];
      overrides[grant.role] = valid;
    }
    return overrides;
  }

  /** Resolve the effective permission set for a stored role. */
  async effectivePermissions(role: string): Promise<readonly Permission[]> {
    if (!isRoleKey(role)) return [];

    let overrides: Partial<Record<RoleKey, readonly Permission[]>> = {};
    try {
      const grants = await this.loadGrants();
      overrides = this.grantOverrides(grants);
    } catch {
      // Config unavailable: the shared baseline still applies. Availability
      // is surfaced by the health endpoint, and authorization fails closed
      // to the documented default.
    }

    const effective = permissionsForRole(role as RoleKey, overrides);
    // Account creation, role changes and estate staff allocation are reserved
    // for the organization-wide super administrator. A stale/broad grant must
    // never turn an estate-scoped operator into a global user administrator.
    return role === 'SUPER_ADMIN'
      ? effective
      : effective.filter(
          (permission) =>
            permission !== 'user.manage' &&
            permission !== 'organization.manage' &&
            permission !== 'config.manage',
        );
  }

  async can(role: string, permission: string): Promise<boolean> {
    if (!isPermission(permission)) return false;
    const perms = await this.effectivePermissions(role);
    return perms.includes(permission as Permission);
  }

  /** True when every value in `permissions` is a known permission. */
  static allPermissionsValid(permissions: readonly string[]): boolean {
    return permissions.every((p) => isPermission(p));
  }

  /** Exposed for tests and the `GET /users` projection. */
  static permissionCatalogue(): readonly Permission[] {
    return PERMISSIONS;
  }
}
