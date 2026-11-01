import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Data access for resident emergency / SOS events (S9).
 *
 * Every query is scoped by organization + the acting user's id, so a
 * resident can only ever reach their own SOS history.
 */

export type SosStatus = 'RAISED' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface SosEventRecord {
  id: string;
  organizationId: string;
  userId: string;
  propertyId: string | null;
  note: string | null;
  status: SosStatus;
  raisedAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
}

export interface CreateSosEventInput {
  organizationId: string;
  userId: string;
  propertyId: string | null;
  note: string | null;
}

export interface OperatorSosQuery {
  organizationId: string;
  status?: SosStatus;
  estateId?: string;
  /** Active means RAISED + ACKNOWLEDGED. Ignored when `status` is set. */
  activeOnly?: boolean;
  limit?: number;
}

export interface OperatorSosResidentRecord {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
}

export interface OperatorSosPropertyRecord {
  id: string;
  identifier: string;
  name: string | null;
  estate: { id: string; name: string; slug: string };
}

export interface OperatorSosActorRecord {
  id: string;
  fullName: string | null;
  email: string;
}

export interface OperatorSosEventRecord extends SosEventRecord {
  resident: OperatorSosResidentRecord | null;
  property: OperatorSosPropertyRecord | null;
  acknowledgedBy: OperatorSosActorRecord | null;
  resolvedBy: OperatorSosActorRecord | null;
}

const operatorInclude = {
  user: { select: { id: true, fullName: true, email: true, phone: true } },
  property: {
    select: {
      id: true,
      identifier: true,
      name: true,
      estate: { select: { id: true, name: true, slug: true } },
    },
  },
  acknowledgedBy: { select: { id: true, fullName: true, email: true } },
  resolvedBy: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.SosEventInclude;

type OperatorSosRow = Prisma.SosEventGetPayload<{ include: typeof operatorInclude }>;

export class PrismaSosRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** The acting user's SOS events, most recent first. */
  async listByUser(organizationId: string, userId: string, limit = 50): Promise<SosEventRecord[]> {
    const rows = await this.prisma.sosEvent.findMany({
      where: { organizationId, userId },
      orderBy: { raisedAt: 'desc' },
      take: limit,
    });
    return rows.map(toSosRecord);
  }

  async create(input: CreateSosEventInput): Promise<SosEventRecord> {
    const row = await this.prisma.sosEvent.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        propertyId: input.propertyId,
        note: input.note,
        status: 'RAISED',
        raisedAt: new Date(),
      },
    });
    return toSosRecord(row);
  }

  /** RAISED + ACKNOWLEDGED count for the dashboard. */
  async countActive(organizationId: string): Promise<number> {
    return this.prisma.sosEvent.count({
      where: { organizationId, status: { in: ['RAISED', 'ACKNOWLEDGED'] } },
    });
  }

  /**
   * Operator queue. Relations are loaded in one query so the SOS screen never
   * produces an N+1 read per alert.
   */
  async listForOrganization(query: OperatorSosQuery): Promise<OperatorSosEventRecord[]> {
    const where: Prisma.SosEventWhereInput = { organizationId: query.organizationId };
    if (query.status) {
      where.status = query.status;
    } else if (query.activeOnly) {
      where.status = { in: ['RAISED', 'ACKNOWLEDGED'] };
    }
    if (query.estateId) where.property = { estateId: query.estateId };

    const rows = await this.prisma.sosEvent.findMany({
      where,
      include: operatorInclude,
      orderBy: { raisedAt: 'desc' },
      take: query.limit ?? 100,
    });
    return rows.map(toOperatorSosRecord);
  }

  async findForOrganization(
    organizationId: string,
    sosEventId: string,
  ): Promise<OperatorSosEventRecord | null> {
    const row = await this.prisma.sosEvent.findFirst({
      where: { id: sosEventId, organizationId },
      include: operatorInclude,
    });
    return row ? toOperatorSosRecord(row) : null;
  }

  /**
   * Conditional transition prevents two operators from acknowledging/resolving
   * the same alert concurrently. The caller re-reads the event after a
   * successful update.
   */
  async acknowledge(organizationId: string, sosEventId: string, actorId: string): Promise<boolean> {
    const result = await this.prisma.sosEvent.updateMany({
      where: { id: sosEventId, organizationId, status: 'RAISED' },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedById: actorId,
      },
    });
    return result.count === 1;
  }

  async resolve(
    organizationId: string,
    sosEventId: string,
    actorId: string,
    resolutionNote: string | null,
  ): Promise<boolean> {
    const result = await this.prisma.sosEvent.updateMany({
      where: { id: sosEventId, organizationId, status: 'ACKNOWLEDGED' },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedById: actorId,
        resolutionNote,
      },
    });
    return result.count === 1;
  }
}

type SosRow = {
  id: string;
  organizationId: string;
  userId: string;
  propertyId: string | null;
  note: string | null;
  status: string;
  raisedAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
};

function toSosRecord(row: SosRow): SosEventRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    propertyId: row.propertyId,
    note: row.note,
    status: row.status as SosStatus,
    raisedAt: row.raisedAt,
    acknowledgedAt: row.acknowledgedAt,
    resolvedAt: row.resolvedAt,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt,
  };
}

function toOperatorSosRecord(row: OperatorSosRow): OperatorSosEventRecord {
  return {
    ...toSosRecord(row),
    resident: row.user
      ? {
          id: row.user.id,
          fullName: row.user.fullName,
          email: row.user.email,
          phone: row.user.phone,
        }
      : null,
    property: row.property
      ? {
          id: row.property.id,
          identifier: row.property.identifier,
          name: row.property.name,
          estate: row.property.estate,
        }
      : null,
    acknowledgedBy: row.acknowledgedBy
      ? {
          id: row.acknowledgedBy.id,
          fullName: row.acknowledgedBy.fullName,
          email: row.acknowledgedBy.email,
        }
      : null,
    resolvedBy: row.resolvedBy
      ? {
          id: row.resolvedBy.id,
          fullName: row.resolvedBy.fullName,
          email: row.resolvedBy.email,
        }
      : null,
  };
}
