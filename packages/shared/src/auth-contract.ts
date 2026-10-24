import type { RoleKey } from './roles.js';
import type { Permission } from './permissions.js';

/**
 * Phase 1 identity, authentication and user-management wire contracts.
 * These types describe the envelope payloads only; the auth module in
 * `apps/api` is the one that produces them.
 */

/** Account statuses. A user whose status is not ACTIVE is denied all
 *  authenticated routes, whatever the session says. */
export const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED', 'DISABLED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Safe, public projection of a user. Password hashes, sessions and reset
 *  material are never part of this shape. */
export interface UserDto {
  id: string;
  email: string;
  role: RoleKey;
  /** Effective capability set after organization grants are applied. */
  permissions: readonly Permission[];
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
  lastPasswordChangedAt: string | null;
}

export interface MeResponse {
  user: UserDto;
}

export interface LoginResponse {
  user: UserDto;
}

export interface LogoutResponse {
  ok: true;
}

export interface ChangePasswordResponse {
  ok: true;
}

/** Identical for existing and unknown addresses; never reveals account
 *  existence. */
export interface ForgotPasswordResponse {
  ok: true;
}

export interface ResetPasswordResponse {
  ok: true;
}

/** Admin list items: the same projection as `MeResponse.user`, never the
 *  full user row. */
export type UserListItemDto = UserDto;

export interface UserListResponse {
  users: UserListItemDto[];
}

export interface UserDetailResponse {
  user: UserListItemDto;
}

export interface SetUserStatusResponse {
  ok: true;
  user: UserListItemDto;
}

export interface SetUserRoleResponse {
  ok: true;
  user: UserListItemDto;
}

export const AUDIT_EVENT_TYPES = [
  'login.succeeded',
  'login.failed',
  'logout',
  'password.changed',
  'password.reset_requested',
  'password.reset_completed',
  'account.suspended',
  'account.reactivated',
  'account.disabled',
  'user.role_changed',
  'admin.bootstrap',
  // Phase 2 — estate / property / import events.
  'estate.created',
  'estate.updated',
  'estate.status_changed',
  'property.created',
  'property.updated',
  'property.status_changed',
  'import.previewed',
  'import.completed',
  'import.commit_failed',
  'propertyOptions.updated',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/** A redacted, append-only audit event. `metadata` may only hold safe,
 *  non-secret key/value pairs; passwords, tokens, reset links and full
 *  request bodies are never stored. */
export interface AuditEventDto {
  id: string;
  eventType: AuditEventType;
  actorId: string | null;
  targetType: 'user' | 'session' | 'organization' | 'estate' | 'property' | 'import' | null;
  targetId: string | null;
  requestId: string | null;
  outcome: 'success' | 'failure';
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PasswordPolicy {
  /** Minimum characters. */
  min: number;
  /** Must contain at least one lowercase, one uppercase, one digit. */
  requireLower: boolean;
  requireUpper: boolean;
  requireDigit: boolean;
}

/** The policy used for every new credential in Phase 1. */
export const PASSWORD_POLICY: PasswordPolicy = {
  min: 12,
  requireLower: true,
  requireUpper: true,
  requireDigit: true,
};

export function validatePasswordPolicy(
  password: string,
  policy: PasswordPolicy = PASSWORD_POLICY,
): string[] {
  const problems: string[] = [];
  if (password.length < policy.min) {
    problems.push(`Password must be at least ${policy.min} characters long`);
  }
  if (policy.requireLower && !/[a-z]/.test(password)) {
    problems.push('Password must contain a lowercase letter');
  }
  if (policy.requireUpper && !/[A-Z]/.test(password)) {
    problems.push('Password must contain an uppercase letter');
  }
  if (policy.requireDigit && !/\d/.test(password)) {
    problems.push('Password must contain a digit');
  }
  return problems;
}
