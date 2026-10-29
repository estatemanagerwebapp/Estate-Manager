import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { parseOrganizationConfig, type OrganizationConfig } from '@silverstone/config-schema';
import type { OrganizationConfigService } from './modules/organization/config.service.js';
import type { PrismaAuditRepository } from './modules/audit/audit-repository.js';
import type { PrismaSessionRepository } from './modules/auth/session-repository.js';
import type { PermissionResolver } from './modules/auth/permission-resolver.js';
import { OrganizationSettingsService } from './modules/settings/settings.service.js';
import {
  activeSosContactsFromConfig,
  bankTransferDetailsFromConfig,
} from './modules/settings/settings.mapper.js';
import { createApp } from './application.js';

const ORGANIZATION_ID = 'org-1';
const ADMIN_COOKIE = 'silverstone.session=admin-session';
const READER_COOKIE = 'silverstone.session=reader-session';

function initialConfig(): OrganizationConfig {
  return parseOrganizationConfig({
    organization: { name: 'Silverstone', slug: 'silverstone' },
    fees: {
      registration: {
        amountKobo: 5_000_000,
        description: 'One-off registration fee',
        refundable: false,
      },
    },
    accessCodes: { defaultDurationDays: 30 },
    payments: {
      bankTransfer: {
        bankName: 'Example Bank',
        accountName: 'Silverstone Managers',
        accountNumber: '0123456789',
        sortCode: null,
        instructions: 'Use your invoice reference as narration.',
      },
    },
    sos: {
      contacts: [
        {
          id: 'contact-security',
          label: 'Estate security',
          phone: '+2348000000000',
          category: 'SECURITY',
          notes: '24/7',
          active: true,
          sortOrder: 0,
        },
      ],
    },
  });
}

function makeHarness() {
  let config = initialConfig();
  let version = 3;
  const auditRecords: Array<Record<string, unknown>> = [];

  const configService = {
    resolve: vi.fn(async () => ({ config, source: 'database' as const, version })),
    save: vi.fn(async (next: OrganizationConfig) => {
      config = next;
      version += 1;
      return {
        version,
        schemaVersion: next.schemaVersion,
        payload: next,
        activatedAt: new Date(),
      };
    }),
  } as unknown as OrganizationConfigService;

  const audit = {
    record: vi.fn(async (input: Record<string, unknown>) => {
      auditRecords.push(input);
    }),
  } as unknown as PrismaAuditRepository;

  const settingsService = new OrganizationSettingsService(configService, audit);

  const sessions = {
    verify: vi.fn(async (sessionId: string) => {
      if (sessionId !== 'admin-session' && sessionId !== 'reader-session') return null;
      return {
        user: {
          id: sessionId === 'admin-session' ? 'admin-1' : 'reader-1',
          organizationId: ORGANIZATION_ID,
          status: 'ACTIVE',
          role: sessionId === 'admin-session' ? 'SUPER_ADMIN' : 'ESTATE_MANAGER',
        },
        session: { expiresAt: new Date(Date.now() + 60_000) },
      };
    }),
  } as unknown as PrismaSessionRepository;

  const permissions = {
    can: vi.fn(async (role: string, permission: string) => {
      return permission === 'config.manage' && role === 'SUPER_ADMIN';
    }),
  } as unknown as PermissionResolver;

  const app = createApp({
    settings: {
      settingsService,
      sessions,
      permissions,
      organizationId: ORGANIZATION_ID,
    },
  });

  return { app, configService, audit, auditRecords, getVersion: () => version };
}

describe('settings mapping', () => {
  it('hides an unconfigured bank-transfer block', () => {
    const config = parseOrganizationConfig({});
    expect(bankTransferDetailsFromConfig(config)).toBeNull();
  });

  it('hides instructions that are not backed by account details', () => {
    const config = parseOrganizationConfig({
      payments: { bankTransfer: { instructions: 'Pay at the estate office.' } },
    });
    expect(bankTransferDetailsFromConfig(config)).toBeNull();
  });

  it('returns only active emergency contacts in sort order', () => {
    const config = parseOrganizationConfig({
      sos: {
        contacts: [
          {
            id: 'second',
            label: 'Clinic',
            phone: '+2348000000002',
            category: 'MEDICAL',
            active: true,
            sortOrder: 2,
          },
          {
            id: 'hidden',
            label: 'Old line',
            phone: '+2348000000003',
            category: 'OTHER',
            active: false,
            sortOrder: 1,
          },
          {
            id: 'first',
            label: 'Security',
            phone: '+2348000000001',
            category: 'SECURITY',
            active: true,
            sortOrder: 1,
          },
        ],
      },
    });

    expect(activeSosContactsFromConfig(config).map((contact) => contact.id)).toEqual([
      'first',
      'second',
    ]);
  });
});

describe('operational settings', () => {
  let app: Express;
  let harness: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    harness = makeHarness();
    app = harness.app;
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/settings');
    expect(response.status).toBe(401);
  });

  it('requires config.manage', async () => {
    const response = await request(app).get('/api/v1/settings').set('Cookie', READER_COOKIE);
    expect(response.status).toBe(403);
  });

  it('returns the curated settings view', async () => {
    const response = await request(app).get('/api/v1/settings').set('Cookie', ADMIN_COOKIE);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      version: 3,
      onboarding: {
        registrationFee: { amountKobo: 5_000_000, description: 'One-off registration fee' },
      },
      accessCodes: { defaultDurationDays: 30, minDurationDays: 1, maxDurationDays: 365 },
      payments: { bankTransfer: { bankName: 'Example Bank', accountNumber: '0123456789' } },
      sos: { contacts: [{ id: 'contact-security', category: 'SECURITY' }] },
    });
    expect(response.body.data).not.toHaveProperty('modules');
    expect(response.body.data).not.toHaveProperty('propertyOptions');
  });

  it('rejects a stale expectedVersion', async () => {
    const response = await request(app)
      .patch('/api/v1/settings')
      .set('Cookie', ADMIN_COOKIE)
      .send({ expectedVersion: 2, accessCodes: { defaultDurationDays: 14 } });

    expect(response.status).toBe(409);
    expect(harness.configService.save).not.toHaveBeenCalled();
  });

  it('updates settings, writes the next config version and audits the change', async () => {
    const response = await request(app)
      .patch('/api/v1/settings')
      .set('Cookie', ADMIN_COOKIE)
      .send({
        expectedVersion: 3,
        onboarding: {
          registrationFee: { amountKobo: 0, description: null, refundable: true },
        },
        accessCodes: { defaultDurationDays: 14 },
        payments: {
          bankTransfer: {
            bankName: 'New Bank',
            accountName: 'Silverstone Estates',
            accountNumber: '9876543210',
            sortCode: '001',
            instructions: null,
          },
        },
        sos: {
          contacts: [
            {
              id: 'contact-medical',
              label: 'Estate clinic',
              phone: '+2348111111111',
              category: 'MEDICAL',
              notes: null,
              active: true,
              sortOrder: 0,
            },
          ],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.version).toBe(4);
    expect(response.body.data.accessCodes.defaultDurationDays).toBe(14);
    expect(response.body.data.onboarding.registrationFee.amountKobo).toBe(0);
    expect(response.body.data.sos.contacts).toHaveLength(1);

    expect(harness.configService.save).toHaveBeenCalledWith(expect.anything(), 'admin-1', {
      expectedVersion: 3,
    });
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'settings.updated',
        targetType: 'settings',
        targetId: '4',
        metadata: { version: 4, changed: ['onboarding', 'accessCodes', 'payments', 'sos'] },
      }),
    );
  });

  it('merges a partial bank-transfer update against the active config', async () => {
    const response = await request(app)
      .patch('/api/v1/settings')
      .set('Cookie', ADMIN_COOKIE)
      .send({
        expectedVersion: 3,
        payments: { bankTransfer: { sortCode: '002' } },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.payments.bankTransfer).toMatchObject({
      bankName: 'Example Bank',
      accountName: 'Silverstone Managers',
      accountNumber: '0123456789',
      sortCode: '002',
    });
  });

  it('rejects an invalid account number before writing', async () => {
    const response = await request(app)
      .patch('/api/v1/settings')
      .set('Cookie', ADMIN_COOKIE)
      .send({
        expectedVersion: 3,
        payments: { bankTransfer: { accountNumber: 'abc' } },
      });

    expect(response.status).toBe(400);
    expect(harness.configService.save).not.toHaveBeenCalled();
  });

  it('rejects an incomplete bank-transfer configuration after merging', async () => {
    harness.configService.resolve = vi.fn(async () => ({
      config: parseOrganizationConfig({
        organization: { name: 'Silverstone', slug: 'silverstone' },
      }),
      source: 'database' as const,
      version: 3,
    }));

    const response = await request(app)
      .patch('/api/v1/settings')
      .set('Cookie', ADMIN_COOKIE)
      .send({
        expectedVersion: 3,
        payments: { bankTransfer: { bankName: 'Only a bank name' } },
      });

    expect(response.status).toBe(400);
    expect(harness.configService.save).not.toHaveBeenCalled();
  });

  it('does not expose structural configuration through update payloads', async () => {
    const response = await request(app)
      .patch('/api/v1/settings')
      .set('Cookie', ADMIN_COOKIE)
      .send({ expectedVersion: 3, modules: { facilities: true } });

    expect(response.status).toBe(400);
    expect(harness.configService.save).not.toHaveBeenCalled();
  });
});
