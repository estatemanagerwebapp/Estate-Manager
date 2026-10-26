import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { randomBytes } from 'node:crypto';
import type { PrismaUserRepository } from './user-repository.js';
import type {
  PrismaResidentOnboardingRepository,
  ResidentOnboardingRecord,
} from './resident-onboarding-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { PermissionResolver } from './permission-resolver.js';
import type {
  RegisterResidentInput,
  RegisterResidentResponse,
  OnboardingGuestView,
  OnboardingSaveInput,
  OnboardingSaveResponse,
  CompleteResidentOnboardingInput,
  CompleteResidentOnboardingResponse,
  AdminMarkPaidInput,
  AdminMarkPaidResponse,
  ResidentOnboardingDto,
  UserListItemDto,
} from '@silverstone/shared';
import type { AuthAuditContext } from './auth.service.js';
import type { OrganizationConfig, Fee } from '@silverstone/config-schema';
import { GENDERS, MARITAL_STATUSES, RESIDENT_ID_TYPES } from '@silverstone/shared';

/**
 * Resident onboarding service.
 *
 * Admin path (`resident.registered`): creates a draft record bound to a
 * property and returns the persistent access code to the admin. No User row
 * is created at this point.
 *
 * Guest path (`resident.onboarding_completed`): the resident presents the
 * code, autosaves fields (resumable at any time), uploads an ID document
 * (separate media endpoint), and completes once payment is PAID. Completion
 * creates the User with a generated demo password and `mustChangePassword`.
 *
 * Payment (`resident.payment_recorded`): with provider `NONE` the admin
 * marks the draft PAID manually; a future Zest webhook will call the same
 * `markPaid` path.
 */

export interface ResidentOnboardingConfigSnapshot {
  codeLength: number;
  fee: Fee;
}

export function residentOnboardingConfigFromConfig(
  config: OrganizationConfig,
): ResidentOnboardingConfigSnapshot {
  return {
    codeLength: config.onboarding?.residentCode?.length ?? 10,
    fee: config.fees?.registration ?? ({ amountKobo: 0 } as unknown as Fee),
  };
}

export interface PropertyDetail {
  identifier: string;
  name: string | null;
  estate: { name: string; slug: string };
}

export interface OnAccountCreatedHook {
  organizationId: string;
  userId: string;
  propertyId: string | null;
  requestId: string | null;
}

export class ResidentOnboardingService {
  constructor(
    private readonly users: PrismaUserRepository,
    private readonly drafts: PrismaResidentOnboardingRepository,
    private readonly audit: PrismaAuditRepository,
    private readonly permissions: PermissionResolver,
    /** Loads the resolved organization configuration at request time. */
    private readonly loadConfig: () => Promise<OrganizationConfig>,
    /** Resolves a property + its estate for display in the guest view. */
    private readonly loadProperty: (
      organizationId: string,
      propertyId: string,
    ) => Promise<PropertyDetail | null>,
    /**
     * Optional post-account-creation hook (S3: finance seed). Wired in
     * production to seed the registration-fee invoice + payment +
     * transaction; omitted in tests that don't exercise the finance domain.
     */
    private readonly onAccountCreated?: (hook: OnAccountCreatedHook) => Promise<void>,
  ) {}

  // --- Admin registration ----------------------------------------------------

  /**
   * Register a resident: first name + property (required), email/phone
   * optional. Creates the draft + issues the persistent code. No User row.
   */
  async registerResident(
    context: AuthAuditContext,
    _actorRole: string,
    input: RegisterResidentInput,
  ): Promise<RegisterResidentResponse> {
    const firstName = input.firstName.trim();
    if (!firstName) {
      throw new AppError(400, 'VALIDATION_ERROR', 'First name is required');
    }
    const email = input.email?.trim() || null;
    const phone = input.phone?.trim() || null;

    // Property must exist in this deployment.
    const property = await this.loadProperty(context.organizationId, input.propertyId);
    if (!property) {
      throw new AppError(404, 'NOT_FOUND', 'Property not found');
    }

    const config = await this.loadConfig();
    const policy = residentOnboardingConfigFromConfig(config);
    const { record, code } = await this.drafts.create(
      {
        organizationId: context.organizationId,
        propertyId: input.propertyId,
        firstName,
        email,
        phone,
      },
      policy.codeLength,
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'resident.registered',
      targetType: 'resident',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        propertyId: input.propertyId,
        hasEmail: email !== null,
        hasPhone: phone !== null,
      },
    });

    return {
      ok: true,
      resident: await this.toDto(record, property),
      onboardingCode: code,
    };
  }

  // --- Guest: load by code ----------------------------------------------------

  /**
   * Load the draft + property + fee for the guest onboarding view. The code
   * is persistent; there is no TTL or attempt cap.
   */
  async viewByCode(organizationId: string, code: string): Promise<OnboardingGuestView> {
    const record = await this.drafts.findByCode(code.trim(), organizationId);
    if (!record) {
      await this.audit.record({
        organizationId,
        actorId: null,
        eventType: 'resident.registered',
        targetType: 'resident',
        targetId: null,
        requestId: null,
        outcome: 'failure',
        metadata: { reason: 'code_not_found' },
      });
      throw new AppError(404, 'NOT_FOUND', 'Onboarding code not found');
    }
    const property = await this.loadProperty(record.organizationId, record.propertyId);
    if (!property) {
      throw new AppError(404, 'NOT_FOUND', 'Property no longer exists');
    }
    const config = await this.loadConfig();
    const policy = residentOnboardingConfigFromConfig(config);
    return {
      resident: await this.toDto(record, property),
      registrationFee: { amountKobo: policy.fee.amountKobo, currency: 'NGN' },
    };
  }

  // --- Guest: autosave --------------------------------------------------------

  /** Autosave resident-provided fields. Idempotent; resumable. */
  async saveDraft(
    organizationId: string,
    input: OnboardingSaveInput,
  ): Promise<OnboardingSaveResponse> {
    const record = await this.drafts.findByCode(input.code.trim(), organizationId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Onboarding code not found');
    }
    if (record.status === 'COMPLETED') {
      throw new AppError(409, 'CONFLICT', 'This onboarding is already completed');
    }

    // Validate the enum-ish fields (the shared constants are the source of
    // truth; the DB does not enforce them so validation happens here).
    const gender = normalizeNullable(input.gender);
    if (gender && !(GENDERS as readonly string[]).includes(gender)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Unknown gender value');
    }
    const maritalStatus = normalizeNullable(input.maritalStatus);
    if (maritalStatus && !(MARITAL_STATUSES as readonly string[]).includes(maritalStatus)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Unknown marital status value');
    }
    const idType = normalizeNullable(input.idType);
    if (idType && !(RESIDENT_ID_TYPES as readonly string[]).includes(idType)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Unknown ID type value');
    }

    const updated = await this.drafts.saveDraft({
      id: record.id,
      gender,
      maritalStatus,
      propertyType: normalizeNullable(input.propertyType),
      nextOfKinName: normalizeNullable(input.nextOfKinName),
      nextOfKinPhone: normalizeNullable(input.nextOfKinPhone),
      nextOfKinEmail: normalizeNullable(input.nextOfKinEmail),
      idType,
      idDocumentUrl: null,
    });
    if (!updated) throw new AppError(404, 'NOT_FOUND', 'Onboarding draft not found');

    const property = await this.loadProperty(organizationId, record.propertyId);
    return { ok: true, resident: await this.toDto(updated, property) };
  }

  // --- Admin: mark paid -------------------------------------------------------

  async markPaid(
    context: AuthAuditContext,
    _actorRole: string,
    residentId: string,
    input: AdminMarkPaidInput,
  ): Promise<AdminMarkPaidResponse> {
    const record = await this.drafts.findById(residentId);
    if (!record) throw new AppError(404, 'NOT_FOUND', 'Resident onboarding not found');
    if (record.status === 'COMPLETED') {
      throw new AppError(409, 'CONFLICT', 'This onboarding is already completed');
    }
    if (record.paymentStatus === 'PAID') {
      throw new AppError(409, 'CONFLICT', 'Payment already recorded');
    }

    // Resident-provided field completeness
    const missing: string[] = [];
    if (!record.gender) missing.push('gender');
    if (!record.maritalStatus) missing.push('maritalStatus');
    if (!record.nextOfKinName) missing.push('nextOfKinName');
    if (!record.nextOfKinPhone) missing.push('nextOfKinPhone');
    if (!record.idType) missing.push('idType');
    if (!record.idDocumentUrl) missing.push('idDocument');

    // Email is required at account creation. Validate presence and uniqueness
    // *before* marking paid so a failed account creation never leaves payment
    // stuck at PAID with no way to retry.
    const email = record.email?.trim().toLowerCase();

    let user: UserListItemDto | undefined;
    let demoPassword: string | undefined;

    if (missing.length === 0 && email) {
      // Everything is complete: validate email is not already in use, then
      // mark paid and create the account.
      const existing = await this.users.findByEmail(context.organizationId, email);
      if (existing) {
        throw new AppError(409, 'CONFLICT', 'A user with this email already exists');
      }

      const updated = await this.drafts.markPaid(residentId, input.paymentRef?.trim() || null);
      if (!updated) throw new AppError(404, 'NOT_FOUND', 'Resident onboarding not found');

      const property = await this.loadProperty(context.organizationId, record.propertyId);
      const result = await this.createAccount(context.organizationId, updated, context);
      user = result.user;
      demoPassword = result.demoPassword;

      await this.audit.record({
        organizationId: context.organizationId,
        actorId: context.actorId,
        eventType: 'resident.payment_recorded',
        targetType: 'resident',
        targetId: record.id,
        requestId: context.requestId,
        outcome: 'success',
        metadata: {
          paymentRef: input.paymentRef?.trim() || null,
          method: 'admin',
          accountCreated: true,
          missingFields: null,
        },
      });

      return {
        ok: true,
        resident: await this.toDto(updated, property),
        user,
        demoPassword,
      };
    }

    // Fields incomplete or email missing: mark paid only, no account created.
    const updated = await this.drafts.markPaid(residentId, input.paymentRef?.trim() || null);
    if (!updated) throw new AppError(404, 'NOT_FOUND', 'Resident onboarding not found');

    const property = await this.loadProperty(context.organizationId, record.propertyId);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'resident.payment_recorded',
      targetType: 'resident',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        paymentRef: input.paymentRef?.trim() || null,
        method: 'admin',
        accountCreated: false,
        missingFields: missing.length > 0 ? missing : null,
      },
    });

    return {
      ok: true,
      resident: await this.toDto(updated, property),
      ...(missing.length > 0 ? { missingFields: missing } : {}),
    };
  }

  /** Admin: delete a resident onboarding draft (testing cleanup). */
  async remove(
    context: AuthAuditContext,
    _actorRole: string,
    residentId: string,
  ): Promise<{ ok: true; id: string }> {
    const record = await this.drafts.findById(residentId);
    if (!record) throw new AppError(404, 'NOT_FOUND', 'Resident onboarding not found');

    await this.drafts.remove(residentId);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'resident.deleted',
      targetType: 'resident',
      targetId: residentId,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { firstName: record.firstName, propertyId: record.propertyId },
    });

    return { ok: true, id: residentId };
  }

  /** Admin list: every draft (pending + completed) in the deployment. */
  async list(context: AuthAuditContext): Promise<ResidentOnboardingDto[]> {
    const records = await this.drafts.listByOrganization(context.organizationId);
    const result: ResidentOnboardingDto[] = [];
    for (const record of records) {
      const property = await this.loadProperty(record.organizationId, record.propertyId);
      result.push(await this.toDto(record, property));
    }
    return result;
  }

  // --- Guest: submit the out-of-band payment note ----------------------------

  /**
   * Records the resident's out-of-band payment reference.
   *
   * This is the temporary walk-through used while the real payment gateway is
   * not yet connected: the resident submits the reference they paid with, the
   * draft stays UNPAID, and the administrator verifies and confirms it on the
   * Residents screen. Nothing here creates an account.
   */
  async submitPaymentNote(
    organizationId: string,
    code: string,
    paymentRef: string,
  ): Promise<OnboardingSaveResponse> {
    const record = await this.drafts.findByCode(code.trim(), organizationId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Onboarding code not found');
    }
    if (record.status === 'COMPLETED') {
      throw new AppError(409, 'CONFLICT', 'This onboarding is already completed');
    }
    if (record.paymentStatus === 'PAID') {
      throw new AppError(409, 'CONFLICT', 'Payment has already been confirmed');
    }

    const trimmed = paymentRef.trim();
    if (trimmed.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Payment reference is required');
    }

    const updated = await this.drafts.savePaymentNote(record.id, trimmed);
    if (!updated) throw new AppError(404, 'NOT_FOUND', 'Resident onboarding draft not found');

    const property = await this.loadProperty(updated.organizationId, updated.propertyId);
    if (!property) {
      throw new AppError(404, 'NOT_FOUND', 'Property no longer exists');
    }

    await this.audit.record({
      organizationId,
      actorId: null,
      eventType: 'resident.payment_submitted',
      targetType: 'resident',
      targetId: record.id,
      requestId: null,
      outcome: 'success',
      metadata: { paymentRef: trimmed, method: 'resident_note' },
    });

    return { ok: true, resident: await this.toDto(updated, property) };
  }

  // --- Attach ID document (guest by code, or admin by draft id) --------------
  /** Records the uploaded ID document URL on the draft (guest, by code). */
  async attachIdDocument(
    organizationId: string,
    code: string,
    idDocumentUrl: string,
  ): Promise<void> {
    const record = await this.drafts.findByCode(code.trim(), organizationId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Onboarding code not found');
    }
    if (record.status === 'COMPLETED') {
      throw new AppError(409, 'CONFLICT', 'This onboarding is already completed');
    }
    const updated = await this.drafts.saveDraft({ id: record.id, idDocumentUrl });
    if (!updated) throw new AppError(404, 'NOT_FOUND', 'Onboarding draft not found');
  }

  /** Admin uploads the ID document on behalf of a resident (by draft id). */
  async attachIdDocumentByAdmin(
    organizationId: string,
    draftId: string,
    idDocumentUrl: string,
  ): Promise<void> {
    const record = await this.drafts.findById(draftId);
    if (!record || record.organizationId !== organizationId) {
      throw new AppError(404, 'NOT_FOUND', 'Resident onboarding not found');
    }
    if (record.status === 'COMPLETED') {
      throw new AppError(409, 'CONFLICT', 'This onboarding is already completed');
    }
    const updated = await this.drafts.saveDraft({ id: record.id, idDocumentUrl });
    if (!updated) throw new AppError(404, 'NOT_FOUND', 'Resident draft not found');
  }

  // --- Guest: complete --------------------------------------------------------

  /**
   * Complete onboarding: verify every required resident field + payment is
   * PAID, then create the User with a generated demo password and
   * `mustChangePassword = true`. The demo password is returned exactly
   * once; the first login is forced to change it.
   */
  async complete(
    organizationId: string,
    input: CompleteResidentOnboardingInput,
    context: AuthAuditContext,
  ): Promise<CompleteResidentOnboardingResponse> {
    const record = await this.drafts.findByCode(input.code.trim(), organizationId);
    if (!record) {
      await this.audit.record({
        organizationId,
        actorId: null,
        eventType: 'resident.onboarding_completed',
        targetType: 'resident',
        targetId: null,
        requestId: context.requestId,
        outcome: 'failure',
        metadata: { reason: 'code_not_found' },
      });
      throw new AppError(404, 'NOT_FOUND', 'Onboarding code not found');
    }
    if (record.status === 'COMPLETED') {
      throw new AppError(409, 'CONFLICT', 'This onboarding is already completed');
    }

    // Payment gate (config invariant: createAccountOnlyAfterVerifiedPayment).
    if (record.paymentStatus !== 'PAID') {
      throw new AppError(
        409,
        'PAYMENT_REQUIRED',
        'Registration fee must be paid before the account is created',
      );
    }

    // Resident-provided field completeness.
    const missing: string[] = [];
    if (!record.gender) missing.push('gender');
    if (!record.maritalStatus) missing.push('maritalStatus');
    if (!record.nextOfKinName) missing.push('nextOfKinName');
    if (!record.nextOfKinPhone) missing.push('nextOfKinPhone');
    if (!record.idType) missing.push('idType');
    if (!record.idDocumentUrl) missing.push('idDocument');
    if (missing.length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Missing required fields', {
        details: missing.map((field) => ({ path: `body.${field}`, message: 'Required' })),
      });
    }

    // Email is required at account creation (the login credential).
    const email = record.email?.trim().toLowerCase();
    if (!email) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Email is required to create the account');
    }
    const existing = await this.users.findByEmail(organizationId, email);
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'A user with this email already exists');
    }

    const { user, demoPassword } = await this.createAccount(organizationId, record, context);

    return { ok: true, user, demoPassword };
  }

  /**
   * Creates the User account for a completed onboarding draft, links it to the
   * draft, and audits the event. Returns the user DTO + demo password.
   *
   * Caller must have already verified paymentStatus === 'PAID' and field
   * completeness (including email).
   */
  private async createAccount(
    organizationId: string,
    record: ResidentOnboardingRecord,
    context: AuthAuditContext,
  ): Promise<{ user: UserListItemDto; demoPassword: string }> {
    // Generate the demo password (meets the password policy: 12+ chars,
    // mixed case + digit). It is returned to the resident exactly once
    // and hashed immediately.
    const demoPassword = generateDemoPassword();
    const hash = await hashPassword(demoPassword);

    const user = await this.users.create({
      organizationId,
      email: record.email!.trim().toLowerCase(),
      passwordHash: hash,
      fullName: record.firstName,
      phone: record.phone,
      role: 'RESIDENT',
      status: 'ACTIVE',
      mustChangePassword: true,
    });

    await this.drafts.linkUser(record.id, user.id);

    await this.audit.record({
      organizationId,
      actorId: user.id,
      eventType: 'resident.onboarding_completed',
      targetType: 'resident',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { userId: user.id, email: record.email!.trim().toLowerCase() },
    });

    const permissions = await this.permissions.effectivePermissions(user.role);
    const dto: UserListItemDto = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      role: user.role as UserListItemDto['role'],
      mustChangePassword: true,
      permissions,
      status: user.status as UserListItemDto['status'],
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastPasswordChangedAt: user.lastPasswordChangedAt?.toISOString() ?? null,
    };

    // S3: seed the registration-fee invoice + payment + transaction so the
    // resident's finance ledger is never empty. No-op when not wired.
    await this.onAccountCreated?.({
      organizationId,
      userId: user.id,
      propertyId: record.propertyId,
      requestId: context.requestId,
    });

    return { user: dto, demoPassword };
  }

  // --- Projection --------------------------------------------------------------

  private async toDto(
    record: ResidentOnboardingRecord,
    property: PropertyDetail | null,
  ): Promise<ResidentOnboardingDto> {
    return {
      id: record.id,
      status: record.status,
      onboardingCode: record.onboardingCode ?? null,
      propertyId: record.propertyId,
      property: property
        ? {
            identifier: property.identifier,
            name: property.name,
            estate: { name: property.estate.name, slug: property.estate.slug },
          }
        : { identifier: '—', name: null, estate: { name: '—', slug: '' } },
      firstName: record.firstName,
      email: record.email,
      phone: record.phone,
      gender: record.gender,
      maritalStatus: record.maritalStatus,
      propertyType: record.propertyType,
      nextOfKinName: record.nextOfKinName,
      nextOfKinPhone: record.nextOfKinPhone,
      nextOfKinEmail: record.nextOfKinEmail,
      idType: record.idType,
      idDocumentUrl: record.idDocumentUrl,
      paymentStatus: record.paymentStatus,
      paymentRef: record.paymentRef,
      userId: record.userId,
      completedAt: record.completedAt ? record.completedAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

function normalizeNullable(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Generate a demo password that satisfies the password policy
 * (12+ chars, at least one lowercase, one uppercase, one digit).
 */
function generateDemoPassword(): string {
  const lowercase = 'abcdefghjkmnpqrstuvwxyz';
  const uppercase = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lowercase + uppercase + digits;
  const random = randomBytes(16);
  const chars: string[] = [];
  // Guarantee one from each class, then fill the rest at random.
  chars.push(lowercase.charAt(random.readUInt8(0) % lowercase.length));
  chars.push(uppercase.charAt(random.readUInt8(1) % uppercase.length));
  chars.push(digits.charAt(random.readUInt8(2) % digits.length));
  for (let i = 3; i < 16; i += 1) {
    const idx = random.readUInt8(i) % all.length;
    chars.push(all.charAt(idx));
  }
  // Shuffle (Fisher-Yates) so the guaranteed chars are not in fixed
  // positions.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = random.readUInt8(i) % (i + 1);
    const tmp = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = tmp;
  }
  return chars.join('');
}
