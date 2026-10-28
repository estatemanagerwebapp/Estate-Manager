/**
 * Roles are deployment-wide identities. Estate- or module-scoped grants arrive
 * with the permissions model in Phase 1; nothing here should be treated as an
 * authorization decision on its own.
 */
export const ROLE_KEYS = ['SUPER_ADMIN', 'ESTATE_ADMIN', 'GUARD', 'RESIDENT', 'AUDITOR'] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/**
 * Staff roles are every role except RESIDENT.
 *
 * The operator console's Administrators screen manages these accounts only.
 * Residents are created through onboarding, never through administrator
 * account creation, so the two lifecycles stay separate.
 */
export const STAFF_ROLE_KEYS = ['SUPER_ADMIN', 'ESTATE_ADMIN', 'GUARD', 'AUDITOR'] as const;

export type StaffRole = (typeof STAFF_ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super administrator',
  ESTATE_ADMIN: 'Estate administrator',
  GUARD: 'Security guard',
  RESIDENT: 'Resident',
  AUDITOR: 'Auditor',
};

/** Runtime guard for values that arrive from tokens, requests or stored config. */
export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === 'string' && (ROLE_KEYS as readonly string[]).includes(value);
}

/** Runtime guard for staff-only account surfaces. RESIDENT fails closed. */
export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLE_KEYS as readonly string[]).includes(value);
}
