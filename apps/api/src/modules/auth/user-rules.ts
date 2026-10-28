import { AppError } from '../../lib/errors.js';
import { isRoleKey, isStaffRole, ROLE_KEYS, type RoleKey } from '@silverstone/shared';
import { assertRole, assertStatus, type UserRecord } from './user-repository.js';

/**
 * Authorization rules for user administration.
 *
 * Every rule fails closed: an unknown role, an unknown status, or a missing
 * permission results in a `FORBIDDEN` (403) rather than an allowance.
 *
 * The last-active-super-administrator guard is evaluated here (pure, testable)
 * and wired into `UserService.setStatus` / `setRole`, so the guard cannot be
 * bypassed by a missing call site.
 */

export const USER_MANAGE = 'user.manage';

const ROLE_ORDER: Record<RoleKey, number> = {
  SUPER_ADMIN: 5,
  ESTATE_ADMIN: 4,
  GUARD: 3,
  AUDITOR: 2,
  RESIDENT: 1,
};

export function isSuperAdminRole(role: string): boolean {
  return role === 'SUPER_ADMIN';
}

/**
 * An actor with `user.manage` may manage every role strictly below their own
 * plus their own peers. SUPER_ADMIN manages everyone; ESTATE_ADMIN manages
 * everyone except SUPER_ADMIN.
 */
export function canManageRole(actorRole: string, targetRole: string): boolean {
  if (!isRoleKey(actorRole) || !isRoleKey(targetRole)) return false;
  if (actorRole === 'SUPER_ADMIN') return true;
  if (actorRole === 'ESTATE_ADMIN') return targetRole !== 'SUPER_ADMIN';
  return false;
}

/**
 * Role changes must never widen the target's privileges: the target's *new*
 * role must be strictly below the actor's, unless the actor is the one
 * managing a role at the same level (peers may be reassigned among
 * themselves by a SUPER_ADMIN only).
 */
export function canSetRole(actorRole: string, currentRole: string, newRole: string): boolean {
  if (!isRoleKey(actorRole) || !isRoleKey(newRole)) return false;
  if (!canManageRole(actorRole, currentRole)) return false;
  if (newRole === currentRole) return true;
  return ROLE_ORDER[newRole] < ROLE_ORDER[actorRole];
}

/**
 * The last active SUPER_ADMIN cannot be suspended, disabled or demoted —
 * that would lock the deployment out of recovery.
 */
export function lastAdminGuardApplies(target: UserRecord, isLast: boolean): boolean {
  if (!isLast) return false;
  if (!isSuperAdminRole(target.role) || target.status !== 'ACTIVE') return false;
  return true;
}

export function lastAdminGuardMessage(action: 'suspend' | 'disable' | 'demote' | 'delete'): string {
  switch (action) {
    case 'suspend':
      return 'The last active super administrator cannot be suspended';
    case 'disable':
      return 'The last active super administrator cannot be disabled';
    case 'demote':
      return 'The last active super administrator cannot be demoted';
    case 'delete':
      return 'The last active super administrator cannot be deleted';
  }
}

/** An actor may not modify their own status or role. */
export function assertMayManage(
  actorRole: string,
  target: UserRecord,
  actorId: string,
  targetId: string,
): void {
  if (actorId === targetId) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot modify your own account status or role');
  }
  if (!canManageRole(actorRole, target.role)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to manage this user');
  }
}

export function assertNewRoleAllowed(
  actorRole: string,
  currentRole: string,
  newRole: string,
): void {
  assertRole(newRole);
  if (!canSetRole(actorRole, currentRole, newRole)) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot assign this role to the user');
  }
}

/**
 * Guard for creating a staff account. Resident accounts are never created
 * here — they are produced by the onboarding/payment flow — and an actor may
 * only create a role they can manage.
 */
export function assertCanCreateRole(actorRole: string, newRole: string): void {
  assertRole(newRole);
  if (!isStaffRole(newRole)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Resident accounts are created through resident onboarding',
    );
  }
  if (!canManageRole(actorRole, newRole)) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot create a user with this role');
  }
}

export function assertNewStatusAllowed(newStatus: string): void {
  assertStatus(newStatus);
}

/**
 * An actor may not delete their own account, and may only delete accounts
 * they are otherwise allowed to manage (same role hierarchy as status and
 * role changes). Deletion is permanent, so the checks fail closed.
 */
export function assertMayDelete(
  actorRole: string,
  target: UserRecord,
  actorId: string,
  targetId: string,
): void {
  if (actorId === targetId) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot delete your own account');
  }
  if (!canManageRole(actorRole, target.role)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to delete this user');
  }
}

/** Roles the UI may offer as a "promote to" choice for a given actor role. */
export function assignableRoles(actorRole: string): readonly RoleKey[] {
  const all = [...ROLE_KEYS] as RoleKey[];
  return all.filter((candidate) => canSetRole(actorRole, 'RESIDENT', candidate));
}
