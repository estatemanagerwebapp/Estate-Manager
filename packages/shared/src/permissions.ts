import type { RoleKey } from './roles.js';

/**
 * Capability strings. Permission checks are always performed on the server;
 * the frontend may use the same catalogue only to hide unavailable actions.
 */
export const PERMISSIONS = [
  'organization.manage',
  'config.manage',
  'estate.manage',
  'estate.read',
  'resident.manage',
  'resident.read',
  'property.manage',
  'property.read',
  'assignment.manage',
  'billing.manage',
  'billing.read',
  'payment.verify',
  'gate.manage',
  'gate.read',
  'maintenance.manage',
  'maintenance.read',
  'audit.read',
  'user.manage',
  'import.manage',
  'portal.access.self',
  // Resident dashboard capabilities (additive; granted to RESIDENT by default).
  'profile.view',
  'property.view',
  'invoice.view',
  'payment.create',
  'code.create',
  'code.deactivate',
  'complaint.create',
  'complaint.view',
  'message.view',
  'facility.book',
  'sos.create',
  // Operator console capabilities (Phase 0 foundation; routes land in later phases).
  'complaint.read',
  'complaint.manage',
  'message.read',
  'message.manage',
  'sos.read',
  'sos.manage',
  'facility.read',
  'facility.manage',
  'booking.read',
  'booking.manage',
  'verification.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_PERMISSIONS = [...PERMISSIONS] satisfies Permission[];

const ADMIN_PERMISSIONS = ALL_PERMISSIONS.filter(
  (permission) =>
    permission !== 'organization.manage' &&
    permission !== 'config.manage' &&
    permission !== 'user.manage',
);

const AUDITOR_PERMISSIONS: Permission[] = [
  'estate.read',
  'resident.read',
  'property.read',
  'billing.read',
  'gate.read',
  'maintenance.read',
  'audit.read',
  'complaint.read',
  'message.read',
  'sos.read',
  'facility.read',
  'booking.read',
  'verification.read',
];

/**
 * Baseline role → permission map.
 *
 * This is a *default* only: deployments may narrow or extend it through
 * organization configuration, and the database becomes the source of truth once
 * an organization is provisioned.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ESTATE_ADMIN: ADMIN_PERMISSIONS,
  GUARD: [
    'gate.manage',
    'gate.read',
    'verification.read',
    'resident.read',
    'sos.read',
    'sos.manage',
  ],
  RESIDENT: [
    'portal.access.self',
    'profile.view',
    'property.view',
    'invoice.view',
    'payment.create',
    'code.create',
    'code.deactivate',
    'complaint.create',
    'complaint.view',
    'message.view',
    'facility.book',
    'sos.create',
  ],
  AUDITOR: AUDITOR_PERMISSIONS,
};

export function permissionsForRole(
  role: RoleKey,
  overrides: Partial<Record<RoleKey, readonly Permission[]>> = {},
): readonly Permission[] {
  return overrides[role] ?? DEFAULT_ROLE_PERMISSIONS[role];
}

/** Pure permission predicate. Never trust a client-supplied permission list. */
export function hasPermission(
  role: RoleKey,
  permission: Permission,
  overrides: Partial<Record<RoleKey, readonly Permission[]>> = {},
): boolean {
  return permissionsForRole(role, overrides).includes(permission);
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}
