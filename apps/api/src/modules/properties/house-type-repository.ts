import type { PrismaClient } from '@prisma/client';

/**
 * Data access for the organization's house-type catalogue.
 *
 * House types are a real table (not a JSON settings block). The property
 * service and import parser read the same rows, so the manual form and the
 * spreadsheet template can never disagree about which house types exist or
 * whether a type uses unit fields.
 */

export interface HouseTypeRecord {
  key: string;
  label: string;
  requiresUnitFields: boolean;
  active: boolean;
  sortOrder: number;
}

export class PrismaHouseTypeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<HouseTypeRecord[]> {
    const rows = await this.prisma.houseType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async listActive(): Promise<HouseTypeRecord[]> {
    const rows = await this.prisma.houseType.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async findByKey(key: string): Promise<HouseTypeRecord | null> {
    const row = await this.prisma.houseType.findUnique({ where: { key } });
    return row ? toRecord(row) : null;
  }
}

type HouseTypeRow = {
  key: string;
  label: string;
  requiresUnitFields: boolean;
  active: boolean;
  sortOrder: number;
};

function toRecord(row: HouseTypeRow): HouseTypeRecord {
  return {
    key: row.key,
    label: row.label,
    requiresUnitFields: row.requiresUnitFields,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}
