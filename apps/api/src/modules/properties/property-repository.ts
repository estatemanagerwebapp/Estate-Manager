import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaClient, PropertyKind } from '@prisma/client';

/**
 * Data access for the property registry. Prisma types stop at this
 * boundary; callers receive plain domain shapes (ADR-0001).
 *
 * The row is explicit: `kind` plus typed address columns. There is no JSON
 * address shape and no parent/child property hierarchy in this model.
 */

export type CreatePropertyInput = {
  estateId: string;
  organizationId: string;
  identifier: string;
  kind: PropertyKind;
  /** For HOUSE/BOTH: the house-type catalogue key. Null for LAND. */
  houseTypeKey: string | null;
  streetName: string;
  houseNumber: string | null;
  blockName: string | null;
  floorNumber: string | null;
  unitNumber: string | null;
  plotNumber: string | null;
  plotName: string | null;
  /** Human-facing property name; null when not supplied (import path). */
  name: string | null;
};

export type UpdatePropertyInput = {
  status?: string;
  name?: string | null;
  streetName?: string;
  houseNumber?: string | null;
  blockName?: string | null;
  floorNumber?: string | null;
  unitNumber?: string | null;
  plotNumber?: string | null;
  plotName?: string | null;
};

export interface PropertyQuery {
  organizationId: string;
  estateId?: string;
  kind?: string;
  status?: string;
  /** Case-insensitive search over the identifier. */
  identifierContains?: string;
  page: number;
  pageSize: number;
}

export interface PropertyRecord {
  id: string;
  estateId: string;
  organizationId: string;
  identifier: string;
  kind: PropertyKind;
  /** House-type catalogue key; null for LAND. */
  houseTypeKey: string | null;
  streetName: string;
  houseNumber: string | null;
  blockName: string | null;
  floorNumber: string | null;
  unitNumber: string | null;
  plotNumber: string | null;
  plotName: string | null;
  /** Human-facing property name; null for legacy/import-created records. */
  name: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PrismaPropertyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreatePropertyInput): Promise<PropertyRecord> {
    const row = await this.prisma.property.create({
      data: {
        estateId: input.estateId,
        organizationId: input.organizationId,
        identifier: input.identifier,
        kind: input.kind,
        houseTypeKey: input.houseTypeKey,
        streetName: input.streetName,
        houseNumber: input.houseNumber,
        blockName: input.blockName,
        floorNumber: input.floorNumber,
        unitNumber: input.unitNumber,
        plotNumber: input.plotNumber,
        plotName: input.plotName,
        name: input.name,
      },
    });
    return toRecord(row);
  }

  /**
   * Transactional create-or-skip for the import commit path.
   *
   * Uses `INSERT ... ON CONFLICT (estate_id, identifier) DO NOTHING` via
   * raw SQL so that a concurrent write of the same identifier between the
   * pre-check and the insert never throws P2002 — the transaction stays
   * usable and the row is silently skipped.
   *
   * The new property's UUID is generated on the client and passed as a
   * parameter, so the statement is fully parameterized and the inserted id
   * is known up front: when the row count is 1 we just inserted that id,
   * when it is 0 the identifier already existed and the insert was skipped.
   * No P2002 is ever raised, so no error handling is needed inside the
   * transaction (ADR-0007).
   */
  async createInTxSkipDuplicates(
    tx: Prisma.TransactionClient,
    input: CreatePropertyInput,
  ): Promise<string | null> {
    const propertyId = randomUUID();
    const sql = Prisma.sql`
      INSERT INTO properties (
        id,
        estate_id,
        organization_id,
        identifier,
        kind,
        house_type_key,
        street_name,
        house_number,
        block_name,
        floor_number,
        unit_number,
        plot_number,
        plot_name,
        name,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ${propertyId}::uuid,
        ${input.estateId}::uuid,
        ${input.organizationId}::uuid,
        ${input.identifier},
        ${input.kind}::"PropertyKind",
        ${input.houseTypeKey},
        ${input.streetName},
        ${input.houseNumber},
        ${input.blockName},
        ${input.floorNumber},
        ${input.unitNumber},
        ${input.plotNumber},
        ${input.plotName},
        ${input.name},
        'ACTIVE',
        now(),
        now()
      )
      ON CONFLICT (estate_id, identifier) DO NOTHING
    `;
    const affected = await tx.$executeRaw(sql);
    return affected === 1 ? propertyId : null;
  }

  async findById(organizationId: string, propertyId: string): Promise<PropertyRecord | null> {
    const row = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId },
    });
    return row ? toRecord(row) : null;
  }

  /**
   * Existence check for a canonical identifier within an estate. Used for the
   * friendly pre-check that reports a 409 with the existing property id; the
   * database unique index is the authoritative backstop under a race.
   */
  async findExistingIdentifier(
    estateId: string,
    identifier: string,
  ): Promise<PropertyRecord | null> {
    const row = await this.prisma.property.findFirst({
      where: { estateId, identifier },
    });
    return row ? toRecord(row) : null;
  }

  /** Fetch the set of existing identifiers in an estate, for import preview. */
  async identifiersByEstate(estateId: string): Promise<Set<string>> {
    const rows = await this.prisma.property.findMany({
      where: { estateId },
      select: { identifier: true },
    });
    return new Set(rows.map((row) => row.identifier));
  }

  /** Exact organization-scoped count, optionally filtered by status. */
  async count(organizationId: string, status?: string): Promise<number> {
    return this.prisma.property.count({
      where: { organizationId, ...(status ? { status } : {}) },
    });
  }

  async list(query: PropertyQuery): Promise<{ items: PropertyRecord[]; total: number }> {
    const where: Prisma.PropertyWhereInput = {
      organizationId: query.organizationId,
      ...(query.estateId ? { estateId: query.estateId } : {}),
      ...(query.kind ? { kind: query.kind as PropertyKind } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.identifierContains
        ? { identifier: { contains: query.identifierContains, mode: 'insensitive' } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.property.count({ where }),
      this.prisma.property.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async update(propertyId: string, input: UpdatePropertyInput): Promise<PropertyRecord | null> {
    const row = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.streetName !== undefined ? { streetName: input.streetName } : {}),
        ...(input.houseNumber !== undefined ? { houseNumber: input.houseNumber } : {}),
        ...(input.blockName !== undefined ? { blockName: input.blockName } : {}),
        ...(input.floorNumber !== undefined ? { floorNumber: input.floorNumber } : {}),
        ...(input.unitNumber !== undefined ? { unitNumber: input.unitNumber } : {}),
        ...(input.plotNumber !== undefined ? { plotNumber: input.plotNumber } : {}),
        ...(input.plotName !== undefined ? { plotName: input.plotName } : {}),
      },
    });
    return toRecord(row);
  }

  /** Physically delete a property. */
  async delete(propertyId: string): Promise<void> {
    await this.prisma.property.delete({ where: { id: propertyId } });
  }

  /** Mark a property archived. Archiving is a status change, not a delete. */
  async setArchived(propertyId: string): Promise<PropertyRecord | null> {
    const row = await this.prisma.property.update({
      where: { id: propertyId },
      data: { status: 'ARCHIVED' },
    });
    return toRecord(row);
  }

  /** Update row statuses + property refs for the import commit. */
  async updateRowStatuses(
    _batchId: string,
    updates: Array<{ rowId: string; status: string; propertyId?: string | null }>,
  ): Promise<void> {
    await Promise.all(
      updates.map((update) =>
        this.prisma.importRow.update({
          where: { id: update.rowId },
          data: {
            status: update.status,
            propertyId: update.propertyId ?? null,
          },
        }),
      ),
    );
  }

  async getRowIdsByStatus(batchId: string, status: string): Promise<string[]> {
    const rows = await this.prisma.importRow.findMany({
      where: { batchId, status },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async getPropertyRowsByStatus(
    batchId: string,
    status: string,
  ): Promise<Array<{ id: string; rowNumber: number; propertyId: string | null }>> {
    const rows = await this.prisma.importRow.findMany({
      where: { batchId, status },
      select: { id: true, rowNumber: true, propertyId: true },
    });
    return rows;
  }
}

function toRecord(row: {
  id: string;
  estateId: string;
  organizationId: string;
  identifier: string;
  kind: PropertyKind;
  houseTypeKey: string | null;
  streetName: string;
  houseNumber: string | null;
  blockName: string | null;
  floorNumber: string | null;
  unitNumber: string | null;
  plotNumber: string | null;
  plotName: string | null;
  name: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): PropertyRecord {
  return {
    id: row.id,
    estateId: row.estateId,
    organizationId: row.organizationId,
    identifier: row.identifier,
    kind: row.kind,
    houseTypeKey: row.houseTypeKey,
    streetName: row.streetName,
    houseNumber: row.houseNumber,
    blockName: row.blockName,
    floorNumber: row.floorNumber,
    unitNumber: row.unitNumber,
    plotNumber: row.plotNumber,
    plotName: row.plotName,
    name: row.name ?? null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
