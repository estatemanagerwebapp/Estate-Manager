import type { PrismaClient } from '@prisma/client';

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
  createdAt: Date;
}

export interface CreateSosEventInput {
  organizationId: string;
  userId: string;
  propertyId: string | null;
  note: string | null;
}

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
    createdAt: row.createdAt,
  };
}
