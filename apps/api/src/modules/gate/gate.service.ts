import { AppError } from '../../lib/errors.js';
import { sha256Hex } from '../../lib/password.js';
import type { AuthAuditContext } from '../auth/auth.service.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  AccessVerificationGate,
  AccessVerificationOutcome,
  AccessVerificationReason,
  AccessVerificationDto,
  AccessVerificationsResponse,
  OperatorAccessCodeDto,
  OperatorAccessCodesResponse,
  OperatorRevokeAccessCodeResponse,
  OperatorVerifyAccessCodeInput,
  OperatorVerifyAccessCodeResponse,
} from '@silverstone/shared';
import type {
  AccessCodeFilter,
  AccessVerificationRecord,
  OperatorAccessCodeRecord,
  PrismaGateRepository,
  VerificationFilter,
} from './gate-repository.js';

const MAX_CODE_LENGTH = 32;

export interface OperatorGateServiceOptions {
  gate: PrismaGateRepository;
  audit: PrismaAuditRepository;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

/**
 * Operator gate access (Phase 6).
 *
 * A guard verifies a resident's access code at ENTRY or EXIT. Every attempt is
 * logged with the outcome and a short prefix; the full code and its hash are
 * never returned or copied into the log. Access-code management stays with the
 * resident portal.
 */
export class OperatorGateService {
  constructor(private readonly options: OperatorGateServiceOptions) {}

  async listAccessCodes(
    organizationId: string,
    filter: AccessCodeFilter,
  ): Promise<OperatorAccessCodesResponse> {
    const now = this.now();
    const records = await this.options.gate.listAccessCodes(organizationId, filter, now);
    return {
      codes: records.map((record) => this.toAccessCodeDto(record, now)),
    };
  }

  async listVerifications(
    organizationId: string,
    filter: VerificationFilter,
  ): Promise<AccessVerificationsResponse> {
    const records = await this.options.gate.listVerifications(organizationId, filter);
    return { verifications: records.map((record) => toVerificationDto(record)) };
  }

  /**
   * Revoke a resident-issued code from the estate office. The resident can no
   * longer present it at the gate, and the action is audited.
   */
  async revoke(
    context: AuthAuditContext,
    codeId: string,
  ): Promise<OperatorRevokeAccessCodeResponse> {
    const actorId = requireActor(context);
    const organizationId = requireOrganization(context);

    const record = await this.options.gate.findAccessCodeById(organizationId, codeId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Access code not found');
    }
    if (record.status === 'REVOKED') {
      throw new AppError(409, 'CONFLICT', 'This access code is already revoked');
    }

    const now = this.now();
    const updated = await this.options.gate.revokeAccessCode(organizationId, codeId, now);
    if (!updated) {
      throw new AppError(409, 'CONFLICT', 'This access code is already revoked');
    }

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'access_code.revoked',
      targetType: 'access_code',
      targetId: codeId,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        residentId: record.resident?.id ?? null,
        propertyId: record.property?.id ?? null,
        codePrefix: record.codePrefix,
        kind: record.kind,
      },
    });

    return { ok: true, code: this.toAccessCodeDto(updated, now) };
  }

  async verify(
    context: AuthAuditContext,
    input: OperatorVerifyAccessCodeInput,
  ): Promise<OperatorVerifyAccessCodeResponse> {
    const actorId = requireActor(context);
    const organizationId = requireOrganization(context);
    const code = input.code.trim().toUpperCase();
    if (!code || code.length > MAX_CODE_LENGTH) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid access code');
    }

    const now = this.now();
    const record = await this.options.gate.findAccessCodeByHash(organizationId, sha256Hex(code));
    const decision = decide(record, input.gate, now);
    const verification = await this.options.gate.createVerification({
      organizationId,
      accessCodeId: record?.id ?? null,
      residentId: record?.resident?.id ?? null,
      propertyId: record?.property?.id ?? null,
      verifiedById: actorId,
      gate: input.gate,
      outcome: decision.outcome,
      reason: decision.reason,
      codePrefix: record?.codePrefix ?? code.slice(0, 4),
      occurredAt: now,
    });

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'verification.recorded',
      targetType: 'access_verification',
      targetId: verification.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        accessCodeId: record?.id ?? null,
        residentId: record?.resident?.id ?? null,
        propertyId: record?.property?.id ?? null,
        gate: input.gate,
        result: decision.outcome,
        reason: decision.reason,
      },
    });

    return { ok: true, verification: toVerificationDto(verification) };
  }

  private toAccessCodeDto(record: OperatorAccessCodeRecord, now: Date): OperatorAccessCodeDto {
    const status =
      record.status === 'ACTIVE' && record.validUntil && record.validUntil < now
        ? 'EXPIRED'
        : record.status;
    return {
      id: record.id,
      kind: record.kind,
      status,
      codePrefix: record.codePrefix,
      validUntil: record.validUntil ? record.validUntil.toISOString() : null,
      issuedAt: record.issuedAt.toISOString(),
      revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null,
      visitorName: record.visitorName,
      carPlate: record.carPlate,
      idDocumentUrl: record.idDocumentUrl,
      resident: record.resident,
      property: record.property,
    };
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

function decide(
  record: OperatorAccessCodeRecord | null,
  gate: AccessVerificationGate,
  now: Date,
): { outcome: AccessVerificationOutcome; reason: AccessVerificationReason | null } {
  if (!record) return { outcome: 'DENIED', reason: 'NOT_FOUND' };
  if (record.status === 'REVOKED') return { outcome: 'DENIED', reason: 'REVOKED' };
  if (record.status === 'EXPIRED' || (record.validUntil && record.validUntil < now)) {
    return { outcome: 'DENIED', reason: 'EXPIRED' };
  }
  if (record.kind !== 'BOTH' && record.kind !== gate) {
    return { outcome: 'DENIED', reason: 'WRONG_DIRECTION' };
  }
  return { outcome: 'GRANTED', reason: null };
}

function toVerificationDto(record: AccessVerificationRecord): AccessVerificationDto {
  return {
    id: record.id,
    accessCodeId: record.accessCodeId,
    gate: record.gate,
    outcome: record.outcome,
    reason: record.reason,
    codePrefix: record.codePrefix,
    occurredAt: record.occurredAt.toISOString(),
    visitorName: record.visitorName,
    carPlate: record.carPlate,
    idDocumentUrl: record.idDocumentUrl,
    resident: record.resident,
    property: record.property,
    verifiedBy: record.verifiedBy,
  };
}

function requireActor(context: AuthAuditContext): string {
  if (!context.actorId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return context.actorId;
}

function requireOrganization(context: AuthAuditContext): string {
  if (!context.organizationId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Organization context is required');
  }
  return context.organizationId;
}
