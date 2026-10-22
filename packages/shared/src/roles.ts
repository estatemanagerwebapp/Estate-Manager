/**
 * Roles are deployment-wide identities. Estate- or module-scoped grants arrive
 * with the permissions model in Phase 1; nothing here should be treated as an
 * authorization decision on its own.
 */
export const ROLE_KEYS = ['SUPER_ADMIN', 'ESTATE_ADMIN', 'GUARD', 'RESIDENT', 'AUDITOR'] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

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
