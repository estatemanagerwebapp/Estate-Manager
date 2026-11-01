import type { Prisma, PrismaClient } from '@prisma/client';

export interface EstateSettingsRecord {
  estateId: string;
  operationalSettings: Prisma.JsonValue;
  version: number;
}

export class PrismaEstateSettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(organizationId: string, estateId: string): Promise<EstateSettingsRecord | null> {
    const row = await this.prisma.estate.findFirst({
      where: { id: estateId, organizationId },
      select: { id: true, operationalSettings: true, settingsVersion: true },
    });
    return row
      ? {
          estateId: row.id,
          operationalSettings: row.operationalSettings,
          version: row.settingsVersion,
        }
      : null;
  }

  async save(
    organizationId: string,
    estateId: string,
    expectedVersion: number,
    operationalSettings: Prisma.InputJsonValue,
  ): Promise<EstateSettingsRecord | null> {
    const result = await this.prisma.estate.updateMany({
      where: { id: estateId, organizationId, settingsVersion: expectedVersion },
      data: { operationalSettings, settingsVersion: { increment: 1 } },
    });
    return result.count === 0 ? null : this.find(organizationId, estateId);
  }
}
