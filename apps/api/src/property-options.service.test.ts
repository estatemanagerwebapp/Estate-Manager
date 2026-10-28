import { describe, expect, it, vi } from 'vitest';
import { parseOrganizationConfig } from '@silverstone/config-schema';
import { PropertyOptionsService } from './modules/organization/property-options.service.js';

const config = parseOrganizationConfig({
  schemaVersion: '1.0.0',
  organization: { name: 'Silverstone Managers', slug: 'silverstone' },
});

function makeService(activeVersion = 5) {
  const resolved = {
    config,
    source: 'database' as const,
    version: activeVersion,
  };
  const configService = {
    resolve: vi.fn(async () => resolved),
    invalidate: vi.fn(),
  };
  const created = {
    version: activeVersion + 1,
    schemaVersion: config.schemaVersion,
    payload: config,
    activatedAt: new Date(),
  };
  const configRepository = {
    createRecord: vi.fn(async () => created),
  };
  const audit = {
    record: vi.fn(async () => undefined),
  };
  const service = new PropertyOptionsService(
    configService as never,
    configRepository as never,
    audit as never,
    async () => ({
      assetTypes: config.assetModel.types,
      unitTypes: config.assetModel.unitTypes,
      propertyOptions: config.propertyOptions,
      configVersion: activeVersion,
    }),
    'silverstone',
  );

  return { service, configService, configRepository, audit };
}

describe('PropertyOptionsService cache handling', () => {
  it('checks the committed version and invalidates the config cache after writing', async () => {
    const { service, configService, configRepository } = makeService();

    const view = await service.update(
      { organizationId: 'org_1', actorId: 'user_1', requestId: null },
      { baseVersion: 5, propertyOptions: config.propertyOptions },
    );

    expect(configService.resolve).toHaveBeenCalledWith({ bypassCache: true });
    expect(configRepository.createRecord).toHaveBeenCalledTimes(1);
    expect(configService.invalidate).toHaveBeenCalledTimes(1);
    expect(view.configVersion).toBe(6);
  });

  it('rejects a stale base version without writing or invalidating', async () => {
    const { service, configService, configRepository } = makeService(6);

    await expect(
      service.update(
        { organizationId: 'org_1', actorId: 'user_1', requestId: null },
        { baseVersion: 5, propertyOptions: config.propertyOptions },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(configRepository.createRecord).not.toHaveBeenCalled();
    expect(configService.invalidate).not.toHaveBeenCalled();
  });
});
