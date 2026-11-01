import { describe, expect, it, vi } from 'vitest';
import { parseOrganizationConfig } from '@silverstone/config-schema';
import { OrganizationConfigService } from './modules/organization/config.service.js';

const config = parseOrganizationConfig({
  schemaVersion: '1.0.0',
  organization: { name: 'Silverstone Managers', slug: 'silverstone' },
});

const activeRecord = {
  version: 3,
  schemaVersion: config.schemaVersion,
  payload: config,
  activatedAt: new Date(),
};

function makeService(cacheTtlMs: number) {
  const findActiveRecord = vi.fn(async () => activeRecord);
  const service = new OrganizationConfigService(
    { findActiveRecord } as never,
    () => config,
    'silverstone',
    cacheTtlMs,
  );
  return { service, findActiveRecord };
}

describe('OrganizationConfigService cache', () => {
  it('reuses the resolved configuration within the ttl', async () => {
    const { service, findActiveRecord } = makeService(30_000);

    const first = await service.resolve();
    const second = await service.resolve();

    expect(second).toBe(first);
    expect(findActiveRecord).toHaveBeenCalledTimes(1);
  });

  it('reloads after the ttl expires', async () => {
    vi.useFakeTimers();
    try {
      const { service, findActiveRecord } = makeService(30_000);

      await service.resolve();
      vi.advanceTimersByTime(30_001);
      await service.resolve();

      expect(findActiveRecord).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('can bypass and invalidate the cache', async () => {
    const { service, findActiveRecord } = makeService(30_000);

    await service.resolve();
    await service.resolve({ bypassCache: true });
    expect(findActiveRecord).toHaveBeenCalledTimes(2);

    service.invalidate();
    await service.resolve();
    expect(findActiveRecord).toHaveBeenCalledTimes(3);
  });
});
