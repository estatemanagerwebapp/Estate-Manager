import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { parseOrganizationConfig } from '@silverstone/config-schema';
import { OrganizationConfigService } from './modules/organization/config.service.js';

const validConfig = () =>
  parseOrganizationConfig({
    schemaVersion: '1.0.0',
    organization: { name: 'Silverstone Managers', slug: 'silverstone' },
  });

describe('system endpoints', () => {
  it('serves /system/info from the database when a document is provisioned', async () => {
    const config = validConfig();
    const service = new OrganizationConfigService(
      {
        findActiveRecord: async () => ({
          version: 2,
          schemaVersion: config.schemaVersion,
          payload: config,
        }),
        createRecord: async () => {
          throw new Error('should not be called');
        },
      } as never,
      () => config,
      'silverstone',
    );

    const app = createApp({
      checkDatabase: async () => {
        /* ok */
      },
      configService: service,
    });

    const response = await request(app).get('/api/v1/system/info');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      organization: { name: 'Silverstone Managers', slug: 'silverstone' },
      config: { source: 'database', version: 2 },
    });
  });

  it('falls back to bootstrap when the database has no document', async () => {
    const config = validConfig();
    const service = new OrganizationConfigService(
      {
        findActiveRecord: async () => null,
        createRecord: async () => {
          throw new Error('should not be called');
        },
      } as never,
      () => config,
      'silverstone',
    );

    const app = createApp({
      checkDatabase: async () => {
        /* ok */
      },
      configService: service,
    });

    const response = await request(app).get('/api/v1/system/info');
    expect(response.status).toBe(200);
    expect(response.body.data.config.source).toBe('bootstrap');
    expect(response.body.data.config.version).toBe(0);
  });
});
