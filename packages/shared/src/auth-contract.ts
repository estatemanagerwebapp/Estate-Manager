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
  phone: string | null;
  fullName: string | null;
  role: RoleKey;
  /** True while the account still holds the generated demo password; the
   *  web shell forces a change on first login. */
  mustChangePassword: boolean;
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

/** Result of permanently deleting a user account. */
export interface DeleteUserResponse {
  ok: true;
  /** The id of the deleted user. */
  id: string;
}

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDERS)[number];

export const MARITAL_STATUSES = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const RESIDENT_ID_TYPES = [
  'NATIONAL_ID',
  'DRIVER_LICENSE',
  'INTERNATIONAL_PASSPORT',
  'VOTERS_CARD',
  'BIRTH_CERTIFICATE',
  'CAC_CERTIFICATE',
] as const;
export type ResidentIdType = (typeof RESIDENT_ID_TYPES)[number];

/**
 * A resident registered by an admin with a first name + property assignment
 * (email/phone optional). A PERSISTENT onboarding code is issued — no TTL,
 * no attempt cap, resumable — so the resident can complete onboarding at
 * their own pace. The User account is created only after verified payment.
 */
export interface RegisterResidentInput {
  /** First name — the only required field. */
  firstName: string;
  email?: string | null;
  phone?: string | null;
  /** Assigned property/estate (required). */
  propertyId: string;
}

export interface RegisterResidentResponse {
  ok: true;
  resident: ResidentOnboardingDto;
  /**
   * The persistent onboarding code, returned to the registering admin.
   * Only its SHA-256 hash is stored; the admin may re-share it freely.
   */
  onboardingCode: string;
}

export interface ResidentOnboardingDto {
  id: string;
  /** PENDING (in progress) or COMPLETED (account created). */
  status: 'PENDING' | 'COMPLETED';
  /** The persistent onboarding code, re-shareable with the resident at any
   *  time. Null for drafts created before this field was added. */
  onboardingCode: string | null;
  /** The property/estate the resident is bound to. */
  propertyId: string;
  property: {
    identifier: string;
    name: string | null;
    estate: { name: string; slug: string };
  };
  // Admin-provided (prefilled, read-only to the resident)
  firstName: string;
  email: string | null;
  phone: string | null;
  // Resident-provided
  gender: string | null;
  maritalStatus: string | null;
  propertyType: string | null;
  nextOfKinName: string | null;
  nextOfKinPhone: string | null;
  nextOfKinEmail: string | null;
  idType: string | null;
  idDocumentUrl: string | null;
  // Payment
  paymentStatus: 'UNPAID' | 'PAID';
  paymentRef: string | null;
  /**
   * The account created for this resident after payment. Null while the
   * onboarding is still in progress (or when the account was deleted).
   */
  userId: string | null;
  /** When the account was created; null while still pending. */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Guest (public) onboarding view, keyed by the persistent code. */
export interface OnboardingGuestView {
  resident: ResidentOnboardingDto;
  /** The configured registration fee the resident will pay. */
  registrationFee: { amountKobo: number; currency: string };
}

/** Autosave of resident-provided fields (idempotent, resumable). */
export interface OnboardingSaveInput {
  code: string;
  gender?: string | null;
  maritalStatus?: string | null;
  propertyType?: string | null;
  nextOfKinName?: string | null;
  nextOfKinPhone?: string | null;
  nextOfKinEmail?: string | null;
  idType?: string | null;
  /** Public URL of an already-uploaded ID document. */
  idDocumentUrl?: string | null;
}

export interface OnboardingSaveResponse {
  ok: true;
  resident: ResidentOnboardingDto;
}

/**
 * Final onboarding step: verifies all required fields + payment is PAID,
 * creates the User with a generated demo password, and forces a change on
 * first login. The demo password is returned exactly once.
 */
export interface CompleteResidentOnboardingInput {
  code: string;
}

export interface CompleteResidentOnboardingResponse {
  ok: true;
  user: UserListItemDto;
  /** The generated demo password, returned exactly once. */
  demoPassword: string;
}

export interface AdminMarkPaidInput {
  paymentRef?: string | null;
}

export interface AdminMarkPaidResponse {
  ok: true;
  resident: ResidentOnboardingDto;
  /** Set when all onboarding fields were complete and the user account was
   *  created immediately after marking paid. */
  user?: UserListItemDto;
  /** The generated demo password, returned exactly once when the account is
   *  created. Shown to the admin so they can share it with the resident. */
  demoPassword?: string;
  /** Required resident fields still missing before an account can be created.
   *  Present only when payment was recorded but the account was not created. */
  missingFields?: string[];
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
  'user.deleted',
  'admin.bootstrap',
  'user.registered',
  'user.onboarding_completed',
  'resident.registered',
  'resident.onboarding_completed',
  'resident.payment_recorded',
  'resident.payment_submitted',
  'resident.deleted',
  // Phase 2 — estate / property / import events.
  'estate.created',
  'estate.updated',
  'estate.status_changed',
  'estate.deleted',
  'property.created',
  'property.updated',
  'property.status_changed',
  'property.deleted',
  'import.previewed',
  'import.completed',
  'import.commit_failed',
  'propertyOptions.updated',
  // Phase 3 — resident dashboard.
  'resident.profile_updated',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/** A redacted, append-only audit event. `metadata` may only hold safe,
 *  non-secret key/value pairs; passwords, tokens, reset links and full
 *  request bodies are never stored. */
export interface AuditEventDto {
  id: string;
  eventType: AuditEventType;
  actorId: string | null;
  targetType:
    'user' | 'session' | 'organization' | 'estate' | 'property' | 'import' | 'resident' | null;
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
