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
/** Maximum window — a code may not be issued for more than a year. */
export const MAX_CODE_DURATION_HOURS = 365 * 24;
/** Length of the generated code. */
export const ACCESS_CODE_LENGTH = 8;
const MS_PER_HOUR = 60 * 60 * 1000;

export interface ResidentCodesServiceOptions {
  codes: PrismaAccessCodeRepository;
  audit: PrismaAuditRepository;
  /** Resolves the acting resident's assigned property (may be null). */
  loadPropertyId: (organizationId: string, userId: string) => Promise<string | null>;
  /** Configured default validity; falls back to 720 hours when absent. */
  loadDefaultDurationHours?: () => Promise<number>;
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
  async list(organizationId: string, userId: string): Promise<ResidentAccessCodesResponse> {
    const [records, defaultDurationHours] = await Promise.all([
      this.options.codes.listByUser(organizationId, userId),
      this.defaultDurationHours(),
    ]);
    const now = new Date();
    return {
      codes: records.map((record) => toDto(withDerivedStatus(record, now))),
      defaultDurationHours,
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
    const durationHours = resolveDurationHours(
      input.durationHours,
      await this.defaultDurationHours(),
    );
    const validUntil = new Date(Date.now() + durationHours * MS_PER_HOUR);
    const propertyId = await this.options.loadPropertyId(organizationId, userId);

    const { record, code } = await this.options.codes.create({
      organizationId,
      userId,
      propertyId,
      kind: input.kind,
      validUntil,
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
    codeId: string,
    durationHours: number | undefined,
    requestId: string | null,
  ): Promise<ResidentExtendAccessCodeResponse> {
    const record = await this.options.codes.findById(organizationId, userId, codeId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Access code not found');
    }
    if (record.status === 'REVOKED') {
      throw new AppError(409, 'CONFLICT', 'This access code has been deactivated');
    }

    const hours = resolveDurationHours(durationHours, await this.defaultDurationHours());
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
    codeId: string,
    requestId: string | null,
  ): Promise<ResidentDeactivateAccessCodeResponse> {
    const record = await this.options.codes.findById(organizationId, userId, codeId);
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

  private async defaultDurationHours(): Promise<number> {
    if (!this.options.loadDefaultDurationHours) return DEFAULT_CODE_DURATION_HOURS;
    return this.options.loadDefaultDurationHours();
  }
}

/** Clamp + validate the requested duration; default is configured by the estate. */
function resolveDurationHours(
  requested: number | undefined,
  defaultDurationHours = DEFAULT_CODE_DURATION_HOURS,
): number {
  if (requested === undefined || requested === null) return defaultDurationHours;
  if (!Number.isInteger(requested)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Duration must be a whole number of hours');
  }
  if (requested < MIN_CODE_DURATION_HOURS || requested > MAX_CODE_DURATION_HOURS) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Duration must be between ${MIN_CODE_DURATION_HOURS} and ${MAX_CODE_DURATION_HOURS} hours`,
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
    kind: record.kind,
    status: record.status,
    codePrefix: record.codePrefix,
    validUntil: record.validUntil ? record.validUntil.toISOString() : null,
    issuedAt: record.issuedAt.toISOString(),
    revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null,
  };
}
