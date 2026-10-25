import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

/**
 * Data access for the property registry. Prisma types stop at this
 * boundary; callers receive plain domain shapes (ADR-0001).
 */

export type CreatePropertyInput = {
  estateId: string;
  organizationId: string;
  identifier: string;
  typeKey: string;
  unitTypeKey: string | null;
  parentPropertyId: string | null;
  addressComponents: Record<string, string>;
};

export type UpdatePropertyInput = {
  status?: string;
  addressComponents?: Record<string, string>;
};

export interface PropertyQuery {
  organizationId: string;
  estateId?: string;
  typeKey?: string;
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
  typeKey: string;
  unitTypeKey: string | null;
  parentPropertyId: string | null;
  /** Parent property projection, when the property is a unit under a parent. */
  parentProperty: { id: string; identifier: string } | null;
  addressComponents: Record<string, string>;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

type PrismaPropertyRow = Prisma.PropertyGetPayload<{
  include: {
    parentProperty: { select: { id: true; identifier: true } };
  };
}>;

export class PrismaPropertyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreatePropertyInput): Promise<PropertyRecord> {
    const row = await this.prisma.property.create({
      data: {
        estateId: input.estateId,
        organizationId: input.organizationId,
        identifier: input.identifier,
        typeKey: input.typeKey,
        unitTypeKey: input.unitTypeKey,
        parentPropertyId: input.parentPropertyId,
        addressComponents: input.addressComponents as Prisma.InputJsonValue,
      },
      include: { parentProperty: { select: { id: true, identifier: true } } },
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
    const addressComponentsJson = JSON.stringify(input.addressComponents);
    const sql = Prisma.sql`
      INSERT INTO properties (
        id,
        estate_id,
        organization_id,
        identifier,
        type_key,
        unit_type_key,
        parent_property_id,
        address_components,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ${Prisma.sql`${propertyId}::uuid`},
        ${Prisma.sql`${input.estateId}::uuid`},
        ${Prisma.sql`${input.organizationId}::uuid`},
        ${input.identifier},
        ${input.typeKey},
        ${input.unitTypeKey ?? Prisma.sql`NULL::text`},
        ${input.parentPropertyId ?? Prisma.sql`NULL::uuid`},
        ${Prisma.sql`${addressComponentsJson}::jsonb`},
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
      include: { parentProperty: { select: { id: true, identifier: true } } },
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
      include: { parentProperty: { select: { id: true, identifier: true } } },
    });
    return row ? toRecord(row) : null;
  }

  /** Bulk fetch of existing identifiers for a set of estate ids, for import preview. */
  async identifiersByEstate(estateId: string): Promise<Set<string>> {
    const rows = await this.prisma.property.findMany({
      where: { estateId },
      select: { identifier: true },
    });
    return new Set(rows.map((row) => row.identifier));
  }

  async list(query: PropertyQuery): Promise<{ items: PropertyRecord[]; total: number }> {
    const where: Prisma.PropertyWhereInput = {
      organizationId: query.organizationId,
      ...(query.estateId ? { estateId: query.estateId } : {}),
      ...(query.typeKey ? { typeKey: query.typeKey } : {}),
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
        include: { parentProperty: { select: { id: true, identifier: true } } },
      }),
    ]);
    return { items: rows.map(toRecord), total };
  }

  async update(propertyId: string, input: UpdatePropertyInput): Promise<PropertyRecord | null> {
    const row = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.addressComponents !== undefined
          ? { addressComponents: input.addressComponents as Prisma.InputJsonValue }
          : {}),
      },
      include: { parentProperty: { select: { id: true, identifier: true } } },
    });
    return toRecord(row);
  }

  /**
   * Check whether a property already has children. Used to enforce the depth-1
   * hierarchy rule: a property that has children cannot itself become a
   * child (unit-in-unit is not supported).
   */
  async hasChildren(propertyId: string): Promise<boolean> {
    const count = await this.prisma.property.count({
      where: { parentPropertyId: propertyId },
    });
    return count > 0;
  }

  /**
   * Mark a property archived. Archiving is a status change, not a delete:
   * the record is preserved for historical reference and its children (if any)
   * remain reachable.
   */
  async setArchived(propertyId: string): Promise<PropertyRecord | null> {
    const row = await this.prisma.property.update({
      where: { id: propertyId },
      data: { status: 'ARCHIVED' },
      include: { parentProperty: { select: { id: true, identifier: true } } },
    });
    return row ? toRecord(row) : null;
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

function toRecord(row: PrismaPropertyRow & { addressComponents: unknown }): PropertyRecord {
  const components = (row.addressComponents ?? {}) as Record<string, unknown>;
  const addressComponents: Record<string, string> = {};
  for (const [key, value] of Object.entries(components)) {
    addressComponents[key] = value === null || value === undefined ? '' : String(value);
  }
  return {
    id: row.id,
    estateId: row.estateId,
    organizationId: row.organizationId,
    identifier: row.identifier,
    typeKey: row.typeKey,
    unitTypeKey: row.unitTypeKey,
    parentPropertyId: row.parentPropertyId,
    parentProperty: row.parentProperty
      ? { id: row.parentProperty.id, identifier: row.parentProperty.identifier }
      : null,
    addressComponents,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type { PrismaPropertyRow };
