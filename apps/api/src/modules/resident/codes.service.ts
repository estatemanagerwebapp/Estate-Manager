import { AppError } from '../../lib/errors.js';
import type { PrismaAccessCodeRepository, AccessCodeRecord } from './codes-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  ResidentAccessCodeDto,
  ResidentAccessCodesResponse,
  ResidentGenerateAccessCodeInput,
  ResidentGenerateAccessCodeResponse,
  ResidentExtendAccessCodeResponse,
  ResidentDeactivateAccessCodeResponse,
} from '@silverstone/shared';

/** Default validity window for a newly generated code. */
export const DEFAULT_CODE_DURATION_HOURS = 30 * 24;
/** Minimum window when a resident asks for a specific duration. */
export const MIN_CODE_DURATION_HOURS = 1;
/** Absolute maximum window — a code may not be issued for more than a year. */
export const MAX_CODE_DURATION_HOURS = 365 * 24;
/** Length of the generated code. */
export const ACCESS_CODE_LENGTH = 8;
const MS_PER_HOUR = 60 * 60 * 1000;

export interface AccessCodeDurationLimits {
  defaultDurationHours: number;
  maxDurationHours: number;
}

export interface ResidentCodesServiceOptions {
  codes: PrismaAccessCodeRepository;
  audit: PrismaAuditRepository;
  /** Configured validity limits; falls back to 720 / 8760 hours when absent. */
  loadDurationLimits?: (
    organizationId: string,
    propertyId: string,
  ) => Promise<AccessCodeDurationLimits>;
  /**
   * Confirms an uploaded visitor ID image belongs to the acting resident.
   * Returning false keeps an arbitrary URL from being attached to a code.
   */
  ownsMediaUrl?: (organizationId: string, userId: string, url: string) => Promise<boolean>;
}

/**
 * Resident access codes (S4).
 *
 * Codes are persistent — no TTL, no attempt cap — but they carry a validity
 * window (configured by the estate office) that the resident can extend, and
 * they can be deactivated at any time. The full code is returned exactly once,
 * at generation; the API only ever exposes the prefix afterwards.
 */
export class ResidentCodesService {
  constructor(private readonly options: ResidentCodesServiceOptions) {}

  /**
   * The acting resident's codes. Expired codes are reported as EXPIRED (and
   * revoked ones as REVOKED) so the list stays truthful without mutating
   * rows on read.
   */
  async list(
    organizationId: string,
    userIds: string | readonly string[],
    propertyId: string | null,
  ): Promise<ResidentAccessCodesResponse> {
    const [records, limits] = await Promise.all([
      this.options.codes.listByUser(organizationId, userIds),
      this.durationLimits(organizationId, propertyId ?? ''),
    ]);
    const now = new Date();
    return {
      codes: records.map((record) => toDto(withDerivedStatus(record, now))),
      defaultDurationHours: limits.defaultDurationHours,
      maxDurationHours: limits.maxDurationHours,
    };
  }

  /**
   * Generate a code. The full plaintext is returned exactly once; only its
   * hash and a display prefix are stored.
   */
  async generate(
    organizationId: string,
    userId: string,
    input: ResidentGenerateAccessCodeInput,
    requestId: string | null,
  ): Promise<ResidentGenerateAccessCodeResponse> {
    const limits = await this.durationLimits(organizationId, input.propertyId);
    const durationHours = resolveDurationHours(input.durationHours, limits);
    const validUntil = new Date(Date.now() + durationHours * MS_PER_HOUR);
    const propertyId = input.propertyId;

    const visitorName = input.visitorName?.trim() ?? '';
    if (!visitorName) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Visitor name is required');
    }
    if (visitorName.length > 120) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Visitor name must be 120 characters or fewer');
    }
    const carPlate = input.carPlate?.trim() || null;
    if (carPlate && carPlate.length > 24) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Car plate must be 24 characters or fewer');
    }
    // The guard is told to verify the plate, so a car-plate code without one
    // would be unusable at the gate. Enforce it server-side, not only in the
    // resident form.
    const idDocumentUrl = input.idDocumentUrl?.trim() || null;
    if (idDocumentUrl) {
      if (!this.options.ownsMediaUrl) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Visitor ID uploads are not available in this deployment',
        );
      }
      const owned = await this.options.ownsMediaUrl(organizationId, userId, idDocumentUrl);
      if (!owned) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Visitor ID document could not be verified');
      }
    }

    const { record, code } = await this.options.codes.create({
      organizationId,
      userId,
      propertyId,
      kind: input.kind,
      validUntil,
      visitorName,
      carPlate,
      idDocumentUrl,
      authenticationType: input.authenticationType,
      codeLength: ACCESS_CODE_LENGTH,
    });

    await this.options.audit.record({
      organizationId,
      actorId: userId,
      eventType: 'resident.code_generated',
      targetType: 'resident',
      targetId: userId,
      requestId,
      outcome: 'success',
      metadata: {
        codeId: record.id,
        kind: record.kind,
        durationHours,
        validUntil: validUntil.toISOString(),
        hasCarPlate: Boolean(carPlate),
        hasIdDocument: Boolean(idDocumentUrl),
        authenticationType: input.authenticationType,
      },
    });

    return { ok: true, code, codeId: record.id };
  }

  /**
   * Extend a code's validity window. The new end is always further out than
   * the current one, so extending never shortens a code's life.
   */
  async extend(
    organizationId: string,
    userId: string,
    accountUserIds: readonly string[],
    codeId: string,
    durationHours: number | undefined,
    requestId: string | null,
  ): Promise<ResidentExtendAccessCodeResponse> {
    const record = await this.options.codes.findById(organizationId, accountUserIds, codeId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Access code not found');
    }
    if (record.status === 'REVOKED') {
      throw new AppError(409, 'CONFLICT', 'This access code has been deactivated');
    }

    const hours = resolveDurationHours(
      durationHours,
      await this.durationLimits(organizationId, record.propertyId ?? ''),
    );
    const candidate = new Date(Date.now() + hours * MS_PER_HOUR);
    const current = record.validUntil ? record.validUntil.getTime() : 0;
    const validUntil = new Date(Math.max(candidate.getTime(), current));

    const updated = await this.options.codes.extendValidUntil(record.id, validUntil);
    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Access code not found');
    }

    await this.options.audit.record({
      organizationId,
      actorId: userId,
      eventType: 'resident.code_extended',
      targetType: 'resident',
      targetId: userId,
      requestId,
      outcome: 'success',
      metadata: {
        codeId: record.id,
        durationHours: hours,
        validUntil: validUntil.toISOString(),
      },
    });

    return { ok: true, code: toDto(updated) };
  }

  /** Deactivate (revoke) a code. Idempotent-safe: revoking twice is a 409. */
  async deactivate(
    organizationId: string,
    userId: string,
    accountUserIds: readonly string[],
    codeId: string,
    requestId: string | null,
  ): Promise<ResidentDeactivateAccessCodeResponse> {
    const record = await this.options.codes.findById(organizationId, accountUserIds, codeId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Access code not found');
    }
    if (record.status === 'REVOKED') {
      throw new AppError(409, 'CONFLICT', 'This access code is already deactivated');
    }

    const updated = await this.options.codes.revoke(record.id, new Date());
    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Access code not found');
    }

    await this.options.audit.record({
      organizationId,
      actorId: userId,
      eventType: 'resident.code_deactivated',
      targetType: 'resident',
      targetId: userId,
      requestId,
      outcome: 'success',
      metadata: { codeId: record.id, kind: record.kind },
    });

    return { ok: true, code: toDto(updated) };
  }

  private async durationLimits(
    organizationId: string,
    propertyId: string,
  ): Promise<AccessCodeDurationLimits> {
    if (!this.options.loadDurationLimits) {
      return {
        defaultDurationHours: DEFAULT_CODE_DURATION_HOURS,
        maxDurationHours: MAX_CODE_DURATION_HOURS,
      };
    }
    return this.options.loadDurationLimits(organizationId, propertyId);
  }
}

/** Validate the requested duration against the estate's configured ceiling. */
function resolveDurationHours(
  requested: number | undefined,
  limits: AccessCodeDurationLimits,
): number {
  const maxHours = Math.min(
    Math.max(limits.maxDurationHours, MIN_CODE_DURATION_HOURS),
    MAX_CODE_DURATION_HOURS,
  );
  if (requested === undefined || requested === null) {
    return Math.min(limits.defaultDurationHours, maxHours);
  }
  if (!Number.isInteger(requested)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Duration must be a whole number of hours');
  }
  if (requested < MIN_CODE_DURATION_HOURS || requested > maxHours) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Duration must be between ${MIN_CODE_DURATION_HOURS} and ${maxHours} hours, as set by the estate office`,
    );
  }
  return requested;
}

/**
 * A code whose window has passed reads as EXPIRED. The stored status stays
 * ACTIVE so the truth is always derived from the window, not from a stale
 * flag.
 */
function withDerivedStatus(record: AccessCodeRecord, now: Date): AccessCodeRecord {
  if (record.status === 'ACTIVE' && record.validUntil && record.validUntil < now) {
    return { ...record, status: 'EXPIRED' };
  }
  return record;
}

function toDto(record: AccessCodeRecord): ResidentAccessCodeDto {
  return {
    id: record.id,
    propertyId: record.propertyId,
    kind: record.kind,
    status: record.status,
    codePrefix: record.codePrefix,
    validUntil: record.validUntil ? record.validUntil.toISOString() : null,
    issuedAt: record.issuedAt.toISOString(),
    revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null,
    visitorName: record.visitorName,
    carPlate: record.carPlate,
    idDocumentUrl: record.idDocumentUrl,
    authenticationType: record.authenticationType,
  };
}
