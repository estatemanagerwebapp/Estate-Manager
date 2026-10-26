import { AppError } from '../../lib/errors.js';
import type { PrismaUserRepository, UserRecord } from '../auth/user-repository.js';
import type {
  PrismaResidentOnboardingRepository,
  ResidentOnboardingRecord,
} from '../auth/resident-onboarding-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  ResidentProfileDto,
  ResidentProfileView,
  ResidentProfileUpdateInput,
  ResidentProfileUpdateResponse,
} from '@silverstone/shared';

export interface ProfilePropertyDetail {
  identifier: string;
  estate: { name: string; slug: string };
}

export interface ResidentProfileServiceOptions {
  users: PrismaUserRepository;
  drafts: PrismaResidentOnboardingRepository;
  audit: PrismaAuditRepository;
  /** Resolves the acting user's assigned property + estate (config-driven labels). */
  loadProperty: (
    organizationId: string,
    propertyId: string,
  ) => Promise<ProfilePropertyDetail | null>;
}

/**
 * Resident profile service (S1).
 *
 * Self-scoped: every read/write resolves the acting user's own row from the
 * session (the router pins it via `getResidentContext`); no path param ever
 * selects a different resident.
 */
export class ResidentProfileService {
  constructor(private readonly options: ResidentProfileServiceOptions) {}

  async view(organizationId: string, userId: string): Promise<ResidentProfileView> {
    const user = await this.options.users.findById(organizationId, userId);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'Resident not found');
    }
    const draft = await this.options.drafts.findByUser(userId);
    const property =
      draft && draft.propertyId
        ? await this.options.loadProperty(organizationId, draft.propertyId)
        : null;

    return { profile: toProfileDto(user, draft, property) };
  }

  async update(
    organizationId: string,
    userId: string,
    input: ResidentProfileUpdateInput,
    requestId: string | null,
  ): Promise<ResidentProfileUpdateResponse> {
    const user = await this.options.users.findById(organizationId, userId);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'Resident not found');
    }

    const phone = normalizeNullable(input.phone);
    if (phone !== null && phone.length > 40) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Phone must be at most 40 characters');
    }

    // The phone lives on the User row; the next-of-kin block lives on the
    // linked onboarding draft. Update both, then re-read for the response.
    if (phone !== undefined) {
      await this.options.users.updatePhone(userId, phone);
    }

    const draft = await this.options.drafts.findByUser(userId);
    const hasDraftFields =
      input.nextOfKinName !== undefined ||
      input.nextOfKinPhone !== undefined ||
      input.nextOfKinEmail !== undefined ||
      input.idType !== undefined ||
      input.propertyType !== undefined;

    if (hasDraftFields && draft) {
      await this.options.drafts.saveDraft({
        id: draft.id,
        nextOfKinName: normalizeNullable(input.nextOfKinName) ?? undefined,
        nextOfKinPhone: normalizeNullable(input.nextOfKinPhone) ?? undefined,
        nextOfKinEmail: normalizeNullable(input.nextOfKinEmail) ?? undefined,
        idType: normalizeNullable(input.idType) ?? undefined,
        propertyType: normalizeNullable(input.propertyType) ?? undefined,
      });
    }

    const updatedUser = await this.options.users.findById(organizationId, userId);
    const updatedDraft = await this.options.drafts.findByUser(userId);
    const property =
      updatedDraft && updatedDraft.propertyId
        ? await this.options.loadProperty(organizationId, updatedDraft.propertyId)
        : null;

    await this.options.audit.record({
      organizationId,
      actorId: userId,
      eventType: 'resident.profile_updated',
      targetType: 'resident',
      targetId: userId,
      requestId,
      outcome: 'success',
      metadata: {
        updatedPhone: phone !== undefined,
        updatedDraftFields: hasDraftFields,
      },
    });

    return {
      ok: true,
      profile: toProfileDto(updatedUser ?? user, updatedDraft ?? draft, property),
    };
  }
}

function normalizeNullable(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toProfileDto(
  user: UserRecord,
  draft: ResidentOnboardingRecord | null,
  property: ProfilePropertyDetail | null,
): ResidentProfileDto {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    gender: draft?.gender ?? null,
    maritalStatus: draft?.maritalStatus ?? null,
    propertyType: draft?.propertyType ?? null,
    nextOfKinName: draft?.nextOfKinName ?? null,
    nextOfKinPhone: draft?.nextOfKinPhone ?? null,
    nextOfKinEmail: draft?.nextOfKinEmail ?? null,
    idType: draft?.idType ?? null,
    idDocumentUrl: draft?.idDocumentUrl ?? null,
    property: property ? { identifier: property.identifier, estate: property.estate } : null,
  };
}
