import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  AccessCodeAuthenticationType,
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
  organizationId: string;
  userId: string;
  kind: AccessCodeKind;
  status: AccessCodeStatus;
  codePrefix: string;
  validUntil: Date | null;
  visitorName: string | null;
  carPlate: string | null;
  idDocumentUrl: string | null;
  authenticationType: AccessCodeAuthenticationType;
  issuedAt: Date;
  revokedAt: Date | null;
  resident: GateResidentRecord | null;
  property: GatePropertyRecord | null;
}

export interface AccessCodeFilter {
  status?: AccessCodeStatus;
  kind?: AccessCodeKind;
  estateId?: string;
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
  visitorName: string | null;
  carPlate: string | null;
  idDocumentUrl: string | null;
  authenticationType: AccessCodeAuthenticationType | null;
  resident: GateResidentRecord | null;
  property: GatePropertyRecord | null;
  verifiedBy: GateActorRecord | null;
}

export interface VerificationFilter {
  outcome?: AccessVerificationOutcome;
  gate?: AccessVerificationGate;
  estateId?: string;
  limit?: number;
  /** Inclusive lower bound on `occurredAt`. */
  since?: Date;
  /** Exclusive upper bound on `occurredAt`. */
  until?: Date;
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
  accessCode: {
    select: {
      visitorName: true,
      carPlate: true,
      idDocumentUrl: true,
      authenticationType: true,
    },
  },
} satisfies Prisma.AccessVerificationInclude;

type PrismaAccessCodeRow = {
  id: string;
  organizationId: string;
  userId: string;
  kind: string;
  status: string;
  codePrefix: string;
  validUntil: Date | null;
  visitorName: string | null;
  carPlate: string | null;
  idDocumentUrl: string | null;
  authenticationType: string;
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
  accessCode: {
    visitorName: string | null;
    carPlate: string | null;
    idDocumentUrl: string | null;
    authenticationType: string;
  } | null;
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
    const statusFilter: Prisma.AccessCodeWhereInput | undefined =
      filter.status === 'ACTIVE'
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
            : undefined;
    const estateFilter: Prisma.AccessCodeWhereInput | undefined = filter.estateId
      ? {
          OR: [
            { property: { is: { estateId: filter.estateId } } },
            {
              user: {
                is: {
                  residentOnboardings: {
                    some: { property: { is: { estateId: filter.estateId } } },
                  },
                },
              },
            },
          ],
        }
      : undefined;
    const rows = await this.prisma.accessCode.findMany({
      where: {
        organizationId,
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(estateFilter || statusFilter
          ? { AND: [estateFilter, statusFilter].filter((condition) => condition !== undefined) }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: filter.limit ?? 100,
      include: ACCESS_CODE_INCLUDE,
    });
    return (rows as PrismaAccessCodeRow[]).map(toAccessCodeRecord);
  }

  /** Organization-scoped lookup by primary key, with display context. */
  async findAccessCodeById(
    organizationId: string,
    codeId: string,
  ): Promise<OperatorAccessCodeRecord | null> {
    if (!isUuid(codeId)) return null;
    const row = await this.prisma.accessCode.findFirst({
      where: { id: codeId, organizationId },
      include: ACCESS_CODE_INCLUDE,
    });
    return row ? toAccessCodeRecord(row as PrismaAccessCodeRow) : null;
  }

  /**
   * Revoke a code on behalf of the estate office. Scoped by organization and
   * refuses to touch a code that is already revoked.
   */
  async revokeAccessCode(
    organizationId: string,
    codeId: string,
    revokedAt: Date,
  ): Promise<OperatorAccessCodeRecord | null> {
    if (!isUuid(codeId)) return null;
    const result = await this.prisma.accessCode.updateMany({
      where: { id: codeId, organizationId, status: { not: 'REVOKED' } },
      data: { status: 'REVOKED', revokedAt },
    });
    if (result.count === 0) return null;
    const row = await this.prisma.accessCode.findFirst({
      where: { id: codeId, organizationId },
      include: ACCESS_CODE_INCLUDE,
    });
    return row ? toAccessCodeRecord(row as PrismaAccessCodeRow) : null;
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
        ...(filter.estateId
          ? {
              OR: [
                { property: { is: { estateId: filter.estateId } } },
                {
                  resident: {
                    is: {
                      residentOnboardings: {
                        some: { property: { is: { estateId: filter.estateId } } },
                      },
                    },
                  },
                },
                {
                  accessCode: {
                    is: {
                      OR: [
                        { property: { is: { estateId: filter.estateId } } },
                        {
                          user: {
                            is: {
                              residentOnboardings: {
                                some: { property: { is: { estateId: filter.estateId } } },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
        ...(filter.since || filter.until
          ? {
              occurredAt: {
                ...(filter.since ? { gte: filter.since } : {}),
                ...(filter.until ? { lt: filter.until } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }],
      take: filter.limit ?? 100,
      include: VERIFICATION_INCLUDE,
    });
    return (rows as PrismaVerificationRow[]).map(toVerificationRecord);
  }

  /**
   * Codes a visitor is expected to present today: still valid, not revoked,
   * and either issued today or expiring before the day ends.
   *
   * A standing code issued before today with no expiry is deliberately
   * excluded — nobody scheduled that visitor for today, and including every
   * open-ended code would turn the list into a second register. Expiring
   * codes are ordered first so the gate sees the tightest window at the top.
   */
  async listExpectedToday(
    organizationId: string,
    now: Date,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<OperatorAccessCodeRecord[]> {
    const rows = await this.prisma.accessCode.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        AND: [
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
          { OR: [{ issuedAt: { gte: dayStart } }, { validUntil: { lt: dayEnd } }] },
        ],
      },
      orderBy: [{ validUntil: 'asc' }, { issuedAt: 'desc' }],
      take: 50,
      include: ACCESS_CODE_INCLUDE,
    });
    return (rows as PrismaAccessCodeRow[]).map(toAccessCodeRecord);
  }

  /** Today's verification attempts grouped by outcome. */
  async countVerificationsToday(
    organizationId: string,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<{ granted: number; denied: number }> {
    const rows = await this.prisma.accessVerification.groupBy({
      by: ['outcome'],
      where: { organizationId, occurredAt: { gte: dayStart, lt: dayEnd } },
      _count: { _all: true },
    });
    let granted = 0;
    let denied = 0;
    for (const row of rows) {
      if (row.outcome === 'GRANTED') granted = row._count._all;
      if (row.outcome === 'DENIED') denied = row._count._all;
    }
    return { granted, denied };
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function toAccessCodeRecord(row: PrismaAccessCodeRow): OperatorAccessCodeRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    kind: row.kind as AccessCodeKind,
    status: row.status as AccessCodeStatus,
    codePrefix: row.codePrefix,
    validUntil: row.validUntil,
    visitorName: row.visitorName,
    carPlate: row.carPlate,
    idDocumentUrl: row.idDocumentUrl,
    authenticationType: row.authenticationType as AccessCodeAuthenticationType,
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
    visitorName: row.accessCode?.visitorName ?? null,
    carPlate: row.accessCode?.carPlate ?? null,
    idDocumentUrl: row.accessCode?.idDocumentUrl ?? null,
    authenticationType:
      (row.accessCode?.authenticationType as AccessCodeAuthenticationType | undefined) ?? null,
    resident: row.resident,
    property: row.property,
    verifiedBy: row.verifiedBy,
  };
}
