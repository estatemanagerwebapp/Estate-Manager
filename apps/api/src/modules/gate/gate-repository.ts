import type { PrismaClient } from '@prisma/client';
import type {
  AccessCodeKind,
  AccessCodeStatus,
  AccessVerificationGate,
  AccessVerificationOutcome,
  AccessVerificationReason,
} from '@silverstone/shared';

/**
 * Data access for operator gate access (Phase 6).
 *
 * Access codes remain resident-owned. This repository only exposes the
 * organization-scoped read model staff need, plus an append-only verification
 * log. It never selects or returns the code hash.
 */

export interface GateActorRecord {
  id: string;
  fullName: string | null;
  email: string;
  role: string;
}

export interface GateResidentRecord {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
}

export interface GatePropertyRecord {
  id: string;
  identifier: string;
  name: string | null;
  estate: { id: string; name: string; slug: string };
}

export interface OperatorAccessCodeRecord {
  id: string;
  kind: AccessCodeKind;
  status: AccessCodeStatus;
  codePrefix: string;
  validUntil: Date | null;
  issuedAt: Date;
  revokedAt: Date | null;
  resident: GateResidentRecord | null;
  property: GatePropertyRecord | null;
}

export interface AccessCodeFilter {
  status?: AccessCodeStatus;
  kind?: AccessCodeKind;
  limit?: number;
}

export interface AccessVerificationRecord {
  id: string;
  accessCodeId: string | null;
  gate: AccessVerificationGate;
  outcome: AccessVerificationOutcome;
  reason: AccessVerificationReason | null;
  codePrefix: string | null;
  occurredAt: Date;
  resident: GateResidentRecord | null;
  property: GatePropertyRecord | null;
  verifiedBy: GateActorRecord | null;
}

export interface VerificationFilter {
  outcome?: AccessVerificationOutcome;
  gate?: AccessVerificationGate;
  limit?: number;
}

export interface CreateAccessVerificationInput {
  organizationId: string;
  accessCodeId: string | null;
  residentId: string | null;
  propertyId: string | null;
  verifiedById: string;
  gate: AccessVerificationGate;
  outcome: AccessVerificationOutcome;
  reason: AccessVerificationReason | null;
  codePrefix: string | null;
  occurredAt: Date;
}

const ACTOR_SELECT = {
  id: true,
  fullName: true,
  email: true,
  role: true,
} satisfies Record<string, true>;

const RESIDENT_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
} satisfies Record<string, true>;

const PROPERTY_SELECT = {
  id: true,
  identifier: true,
  name: true,
  estate: { select: { id: true, name: true, slug: true } },
} satisfies Record<string, unknown>;

const ACCESS_CODE_INCLUDE = {
  user: { select: RESIDENT_SELECT },
  property: { select: PROPERTY_SELECT },
} satisfies Record<string, unknown>;

const VERIFICATION_INCLUDE = {
  resident: { select: RESIDENT_SELECT },
  property: { select: PROPERTY_SELECT },
  verifiedBy: { select: ACTOR_SELECT },
} satisfies Record<string, unknown>;

type PrismaAccessCodeRow = {
  id: string;
  kind: string;
  status: string;
  codePrefix: string;
  validUntil: Date | null;
  issuedAt: Date;
  revokedAt: Date | null;
  user: GateResidentRecord | null;
  property: GatePropertyRecord | null;
};

type PrismaVerificationRow = {
  id: string;
  accessCodeId: string | null;
  gate: string;
  outcome: string;
  reason: string | null;
  codePrefix: string | null;
  occurredAt: Date;
  resident: GateResidentRecord | null;
  property: GatePropertyRecord | null;
  verifiedBy: GateActorRecord | null;
};

export class PrismaGateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Organization-wide access-code register, newest first. */
  async listAccessCodes(
    organizationId: string,
    filter: AccessCodeFilter,
    now: Date,
  ): Promise<OperatorAccessCodeRecord[]> {
    const rows = await this.prisma.accessCode.findMany({
      where: {
        organizationId,
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.status === 'ACTIVE'
          ? {
              status: 'ACTIVE',
              OR: [{ validUntil: null }, { validUntil: { gte: now } }],
            }
          : filter.status === 'EXPIRED'
            ? {
                OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', validUntil: { lt: now } }],
              }
            : filter.status
              ? { status: filter.status }
              : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: filter.limit ?? 100,
      include: ACCESS_CODE_INCLUDE,
    });
    return (rows as PrismaAccessCodeRow[]).map(toAccessCodeRecord);
  }

  /** Hash lookup within the active organization. The plaintext never reaches SQL. */
  async findAccessCodeByHash(
    organizationId: string,
    codeHash: string,
  ): Promise<OperatorAccessCodeRecord | null> {
    const row = await this.prisma.accessCode.findFirst({
      where: { organizationId, codeHash },
      orderBy: { createdAt: 'desc' },
      include: ACCESS_CODE_INCLUDE,
    });
    return row ? toAccessCodeRecord(row as PrismaAccessCodeRow) : null;
  }

  /** Append one verification attempt and return it with display context. */
  async createVerification(
    input: CreateAccessVerificationInput,
  ): Promise<AccessVerificationRecord> {
    const row = await this.prisma.accessVerification.create({
      data: {
        organizationId: input.organizationId,
        accessCodeId: input.accessCodeId,
        residentId: input.residentId,
        propertyId: input.propertyId,
        verifiedById: input.verifiedById,
        gate: input.gate,
        outcome: input.outcome,
        reason: input.reason,
        codePrefix: input.codePrefix,
        occurredAt: input.occurredAt,
      },
      include: VERIFICATION_INCLUDE,
    });
    return toVerificationRecord(row as PrismaVerificationRow);
  }

  /** Organization-scoped, newest-first verification history. */
  async listVerifications(
    organizationId: string,
    filter: VerificationFilter,
  ): Promise<AccessVerificationRecord[]> {
    const rows = await this.prisma.accessVerification.findMany({
      where: {
        organizationId,
        ...(filter.outcome ? { outcome: filter.outcome } : {}),
        ...(filter.gate ? { gate: filter.gate } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }],
      take: filter.limit ?? 100,
      include: VERIFICATION_INCLUDE,
    });
    return (rows as PrismaVerificationRow[]).map(toVerificationRecord);
  }
}

function toAccessCodeRecord(row: PrismaAccessCodeRow): OperatorAccessCodeRecord {
  return {
    id: row.id,
    kind: row.kind as AccessCodeKind,
    status: row.status as AccessCodeStatus,
    codePrefix: row.codePrefix,
    validUntil: row.validUntil,
    issuedAt: row.issuedAt,
    revokedAt: row.revokedAt,
    resident: row.user,
    property: row.property,
  };
}

function toVerificationRecord(row: PrismaVerificationRow): AccessVerificationRecord {
  return {
    id: row.id,
    accessCodeId: row.accessCodeId,
    gate: row.gate as AccessVerificationGate,
    outcome: row.outcome as AccessVerificationOutcome,
    reason: row.reason as AccessVerificationReason | null,
    codePrefix: row.codePrefix,
    occurredAt: row.occurredAt,
    resident: row.resident,
    property: row.property,
    verifiedBy: row.verifiedBy,
  };
}
