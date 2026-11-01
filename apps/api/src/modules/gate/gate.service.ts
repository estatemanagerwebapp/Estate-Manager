import { AppError } from '../../lib/errors.js';
import { sha256Hex } from '../../lib/password.js';
import {
  requireAuditActor,
  requireAuditOrganization,
  type AuthAuditContext,
} from '../auth/auth.service.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { NotifyInput } from '../resident/notifications.service.js';
import type {
  AccessCodeStatus,
  AccessVerificationGate,
  AccessVerificationOutcome,
  AccessVerificationReason,
  AccessVerificationDto,
  AccessVerificationsResponse,
  OperatorAccessCodeDto,
  OperatorAccessCodesResponse,
  OperatorRevokeAccessCodeResponse,
  OperatorVerifyAccessCodeInput,
  OperatorVerifyAccessCodePreviewResponse,
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
  /** Resident inbox hook; failures never undo a recorded verification. */
  notify?: (organizationId: string, userId: string, input: NotifyInput) => Promise<void>;
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
    const actorId = requireAuditActor(context);
    const organizationId = requireAuditOrganization(context);

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

  /**
   * Resolve a presented code **without recording anything**.
   *
   * This is the first half of the gate check: the guard enters a code, sees who
   * it belongs to and what the outcome would be, and only then decides to
   * record the entry/exit. A preview has no side effects — no verification row,
   * no audit event — so an abandoned lookup never pollutes the log.
   */
  async preview(
    organizationId: string,
    input: OperatorVerifyAccessCodeInput,
  ): Promise<OperatorVerifyAccessCodePreviewResponse> {
    const code = normalizeCode(input.code);
    const now = this.now();
    const record = await this.options.gate.findAccessCodeByHash(organizationId, sha256Hex(code));
    const decision = decide(record, input.gate, now);

    return {
      ok: true,
      preview: {
        found: record !== null,
        outcome: decision.outcome,
        reason: decision.reason,
        gate: input.gate,
        codePrefix: record?.codePrefix ?? code.slice(0, 4),
        kind: record?.kind ?? null,
        status: record ? accessCodeStatus(record, now) : null,
        validUntil: record?.validUntil ? record.validUntil.toISOString() : null,
        issuedAt: record?.issuedAt ? record.issuedAt.toISOString() : null,
        visitorName: record?.visitorName ?? null,
        carPlate: record?.carPlate ?? null,
        idDocumentUrl: record?.idDocumentUrl ?? null,
        authenticationType: record?.authenticationType ?? null,
        resident: record?.resident ?? null,
        property: record?.property ?? null,
        accessCodeId: record?.id ?? null,
      },
    };
  }

  async verify(
    context: AuthAuditContext,
    input: OperatorVerifyAccessCodeInput,
  ): Promise<OperatorVerifyAccessCodeResponse> {
    const actorId = requireAuditActor(context);
    const organizationId = requireAuditOrganization(context);
    const code = normalizeCode(input.code);

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

    // Tell the code owner their visitor arrived. Denials are not pushed: an
    // expired or mistyped code at the gate is not an event the resident needs.
    if (decision.outcome === 'GRANTED' && record?.userId) {
      await this.notifyResident(organizationId, record.userId, {
        kind: 'CODE',
        title: 'Your access code was used',
        body: `${record.visitorName?.trim() || 'A visitor'} checked ${input.gate === 'ENTRY' ? 'in' : 'out'} at the gate.`,
        linkTo: '/resident/app/codes',
      });
    }

    return { ok: true, verification: toVerificationDto(verification) };
  }

  private toAccessCodeDto(record: OperatorAccessCodeRecord, now: Date): OperatorAccessCodeDto {
    return toOperatorAccessCodeDto(record, now);
  }

  private async notifyResident(
    organizationId: string,
    userId: string,
    input: NotifyInput,
  ): Promise<void> {
    if (!this.options.notify) return;
    try {
      await this.options.notify(organizationId, userId, input);
    } catch {
      // The verification and its audit row are already committed; the inbox
      // note is best-effort.
    }
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

function normalizeCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!code || code.length > MAX_CODE_LENGTH) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid access code');
  }
  return code;
}

/** Derived status: an `ACTIVE` code past its window displays as `EXPIRED`. */
export function accessCodeStatus(
  record: { status: AccessCodeStatus; validUntil: Date | null },
  now: Date,
): AccessCodeStatus {
  return record.status === 'ACTIVE' && record.validUntil && record.validUntil < now
    ? 'EXPIRED'
    : record.status;
}

/**
 * Map a repository record to the operator wire shape.
 *
 * Exported so the guard dashboard can reuse the exact access-code projection
 * (derived `EXPIRED` status included) instead of duplicating it.
 */
export function toOperatorAccessCodeDto(
  record: OperatorAccessCodeRecord,
  now: Date,
): OperatorAccessCodeDto {
  return {
    id: record.id,
    kind: record.kind,
    status: accessCodeStatus(record, now),
    codePrefix: record.codePrefix,
    validUntil: record.validUntil ? record.validUntil.toISOString() : null,
    issuedAt: record.issuedAt.toISOString(),
    revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null,
    visitorName: record.visitorName,
    carPlate: record.carPlate,
    idDocumentUrl: record.idDocumentUrl,
    authenticationType: record.authenticationType,
    resident: record.resident,
    property: record.property,
  };
}

export function toVerificationDto(record: AccessVerificationRecord): AccessVerificationDto {
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
    authenticationType: record.authenticationType,
    resident: record.resident,
    property: record.property,
    verifiedBy: record.verifiedBy,
  };
}
