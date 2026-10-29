import type { PrismaClient } from '@prisma/client';

/**
 * Data access for estates. Prisma types stop at this boundary; callers
 * receive plain domain shapes (ADR-0001 layered boundaries).
 */

export interface EstateRecord {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  address: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateEstateInput = {
  organizationId: string;
  slug: string;
  name: string;
  address: string | null;
};

export type UpdateEstateInput = {
  name?: string;
  slug?: string;
  address?: string | null;
  status?: string;
};

export interface EstateQuery {
  organizationId: string;
  /** Case-insensitive name/slug search. */
  search?: string;
  /** Filter by status. */
  status?: string;
}

export class PrismaEstateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateEstateInput): Promise<EstateRecord> {
    const row = await this.prisma.estate.create({
      data: {
        organizationId: input.organizationId,
        slug: input.slug,
        name: input.name,
        address: input.address,
      },
    });
    return toRecord(row);
  }

  async findById(organizationId: string, estateId: string): Promise<EstateRecord | null> {
    const row = await this.prisma.estate.findFirst({
      where: { id: estateId, organizationId },
    });
    return row ? toRecord(row) : null;
  }

  async findBySlug(organizationId: string, slug: string): Promise<EstateRecord | null> {
    const row = await this.prisma.estate.findFirst({
      where: { organizationId, slug },
    });
    return row ? toRecord(row) : null;
  }

  async count(organizationId: string): Promise<number> {
    return this.prisma.estate.count({ where: { organizationId } });
  }

  async list(query: EstateQuery): Promise<EstateRecord[]> {
    const rows = await this.prisma.estate.findMany({
      where: {
        organizationId: query.organizationId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { slug: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    return rows.map(toRecord);
  }

  async update(estateId: string, input: UpdateEstateInput): Promise<EstateRecord | null> {
    const row = await this.prisma.estate.update({
      where: { id: estateId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    return row ? toRecord(row) : null;
  }

  /** Aggregate property counts for an estate (total + active). */
  async propertyCounts(estateId: string): Promise<{ total: number; active: number }> {
    const [total, active] = await Promise.all([
      this.prisma.property.count({ where: { estateId } }),
      this.prisma.property.count({ where: { estateId, status: 'ACTIVE' } }),
    ]);
    return { total, active };
  }

  async delete(estateId: string): Promise<void> {
    await this.prisma.estate.delete({ where: { id: estateId } });
  }
}

type EstateRow = {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  address: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(row: EstateRow): EstateRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    slug: row.slug,
    name: row.name,
    address: row.address,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
