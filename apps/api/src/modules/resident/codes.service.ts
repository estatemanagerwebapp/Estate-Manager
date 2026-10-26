import { AppError } from '../../lib/errors.js';
import type {
  PrismaAccessCodeRepository,
  AccessCodeRecord,
} from './codes-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  ResidentAccessCodeDto,
  ResidentGenerateAccessCodeInput,
  ResidentGenerateAccessCodeResponse,
  ResidentExtendAccessCodeResponse,
  ResidentDeactivateAccessCodeResponse,
} from '@silverstone/shared';

/** Default validity window for a newly generated code. */
export const DEFAULT_CODE_DURATION_DAYS = 30;
/** Minimum window when a resident asks for a specific duration. */
export const MIN_CODE_DURATION_DAYS = 1;
/** Maximum window — a code may not be issued for more than a year. */
export const MAX_CODE_DURATION_DAYS = 365;
/** Length of the generated code. */
export const ACCESS_CODE_LENGTH = 8;

export interface ResidentCodesServiceOptions {
  codes: PrismaAccessCodeRepository;
  audit: PrismaAuditRepository;
  /** Resolves the acting resident's assigned property (may be null). */
  loadPropertyId: (organizationId: string, userId: string) => Promise<string | null>;
}

/**
 * Resident access codes (S4).
 *
 * Codes are persistent — no TTL, no attempt cap — but they carry a validity
 * window (30 days by default) that the resident can extend, and they can be
 * deactivated at any time. The full code is returned exactly once, at
 * generation; the API only ever exposes the prefix afterwards.
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
    userId: string,
  ): Promise<{ codes: ResidentAccessCodeDto[] }> {
    const records = await this.options.codes.listByUser(organizationId, userId);
    const now = new Date();
    return {
      codes: records.map((record) => toDto(withDerivedStatus(record, now))),
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
    const durationDays = resolveDurationDays(input.durationDays);
    const validUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
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
        durationDays,
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
    durationDays: number | undefined,
    requestId: string | null,
  ): Promise<ResidentExtendAccessCodeResponse> {
    const record = await this.options.codes.findById(organizationId, userId, codeId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Access code not found');
    }
    if (record.status === 'REVOKED') {
      throw new AppError(409, 'CONFLICT', 'This access code has been deactivated');
    }

    const days = resolveDurationDays(durationDays);
    const candidate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
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
        durationDays: days,
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
}

/** Clamp + validate the requested duration; default 30 days. */
function resolveDurationDays(requested: number | undefined): number {
  if (requested === undefined || requested === null) return DEFAULT_CODE_DURATION_DAYS;
  if (!Number.isInteger(requested)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Duration must be a whole number of days');
  }
  if (requested < MIN_CODE_DURATION_DAYS || requested > MAX_CODE_DURATION_DAYS) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Duration must be between ${MIN_CODE_DURATION_DAYS} and ${MAX_CODE_DURATION_DAYS} days`,
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
