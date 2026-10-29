import { readFileSync } from 'node:fs';
import { DEFAULT_MODULE_FLAGS } from '@silverstone/shared';
import { describe, expect, it } from 'vitest';
import {
  CONFIG_SCHEMA_VERSION,
  OrganizationConfigSchema,
  buildBaselineConfig,
  type OrganizationConfigInput,
} from './organization-config.schema.js';
import { OrganizationConfigError, parseOrganizationConfig } from './parse.js';
import { resolveOrganizationConfig } from './resolve.js';

const validDocument = () => ({
  schemaVersion: CONFIG_SCHEMA_VERSION,
  organization: { name: 'Silverstone Managers', slug: 'silverstone' },
  assetModel: {
    types: [
      { key: 'house', label: 'House', detailKind: 'PROPERTY' },
      {
        key: 'apartment_block',
        label: 'Apartment block',
        detailKind: 'PROPERTY',
        requiresUnits: true,
        unitTypeKeys: ['two_bedroom'],
        defaultUnitTypeKey: 'two_bedroom',
      },
    ],
    unitTypes: [{ key: 'two_bedroom', label: 'Two bedroom', bedrooms: 2 }],
  },
});

const issuePaths = (input: unknown): string[] => {
  try {
    parseOrganizationConfig(input);
    return [];
  } catch (error) {
    if (!(error instanceof OrganizationConfigError)) throw error;
    return error.issues.map((issue) => issue.path);
  }
};

describe('baseline configuration', () => {
  it('parses an empty document into a complete configuration', () => {
    const config = OrganizationConfigSchema.parse({});

    expect(config.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(config.organization.currency).toBe('NGN');
    expect(config.organization.timezone).toBe('Africa/Lagos');
    expect(config.assetModel.types.length).toBeGreaterThan(0);
    expect(config.modules.estates).toBe(true);
    expect(config.fees.registration.amountKobo).toBe(0);
    expect(config.onboarding.residentCode.persistent).toBe(true);
    expect(config.accessCodes.defaultDurationDays).toBe(30);
    expect(config.payments.bankTransfer.bankName).toBeNull();
    expect(config.sos.contacts).toEqual([]);
    expect(config.customFields).toEqual([]);
  });

  it('keeps module defaults aligned with the shared module contract', () => {
    const config = buildBaselineConfig();
    expect(config.modules).toEqual(DEFAULT_MODULE_FLAGS);
  });

  it('ships a bootstrap file that validates against the schema', () => {
    const raw = readFileSync(
      new URL('../../../config/organization.default.json', import.meta.url),
      'utf8',
    );
    const config = parseOrganizationConfig(JSON.parse(raw));

    expect(config.organization.slug).toBe('silverstone');
    expect(config.fees.registration.amountKobo).toBe(5_000_000);
    expect(config.payments.provider).toBe('NONE');
    expect(config.accessCodes.defaultDurationDays).toBe(30);
    expect(config.sos.contacts).toEqual([]);
    // No payment integration or account activation may be enabled in Phase 0.
    expect(config.onboarding.createAccountOnlyAfterVerifiedPayment).toBe(true);
  });
});

describe('configuration validation', () => {
  it('accepts a minimally complete document', () => {
    expect(() => parseOrganizationConfig(validDocument())).not.toThrow();
  });

  it('rejects an unsupported schema version', () => {
    const document = { ...validDocument(), schemaVersion: '2.0.0' };
    expect(issuePaths(document)).toContain('schemaVersion');
  });

  it('rejects invalid branding colours', () => {
    const document = { ...validDocument(), branding: { primaryColor: 'orange' } };
    expect(issuePaths(document)).toContain('branding.primaryColor');
  });

  it('rejects negative and fractional fee amounts', () => {
    const negative = { ...validDocument(), fees: { registration: { amountKobo: -1 } } };
    const fractional = { ...validDocument(), fees: { registration: { amountKobo: 100.5 } } };
    expect(issuePaths(negative)).toContain('fees.registration.amountKobo');
    expect(issuePaths(fractional)).toContain('fees.registration.amountKobo');
  });

  it('rejects duplicate asset type keys', () => {
    const document = validDocument();
    document.assetModel.types.push({ key: 'house', label: 'Duplicate', detailKind: 'PROPERTY' });
    expect(issuePaths(document)).toContain('assetModel.types.2.key');
  });

  it('rejects unit-bearing asset types without permitted unit types', () => {
    const document = validDocument();
    document.assetModel.types[1] = {
      key: 'apartment_block',
      label: 'Apartment block',
      detailKind: 'PROPERTY',
      requiresUnits: true,
      unitTypeKeys: [],
    } as never;
    expect(issuePaths(document)).toContain('assetModel.types.1.unitTypeKeys');
  });

  it('rejects references to undeclared unit types', () => {
    const document = validDocument();
    document.assetModel.types[1] = {
      key: 'apartment_block',
      label: 'Apartment block',
      detailKind: 'PROPERTY',
      requiresUnits: true,
      unitTypeKeys: ['penthouse'],
      defaultUnitTypeKey: 'two_bedroom',
    } as never;
    expect(issuePaths(document)).toContain('assetModel.types.1.unitTypeKeys');
  });

  it('rejects a default unit type that is not permitted for the asset type', () => {
    const document = validDocument();
    document.assetModel.types[1] = {
      key: 'apartment_block',
      label: 'Apartment block',
      detailKind: 'PROPERTY',
      requiresUnits: true,
      unitTypeKeys: ['two_bedroom'],
      defaultUnitTypeKey: 'penthouse',
    } as never;
    expect(issuePaths(document)).toContain('assetModel.types.1.defaultUnitTypeKey');
  });

  it('rejects unit types on assets that do not hold units', () => {
    const document = validDocument();
    document.assetModel.types[0] = {
      key: 'house',
      label: 'House',
      detailKind: 'PROPERTY',
      unitTypeKeys: ['two_bedroom'],
    } as never;
    expect(issuePaths(document)).toContain('assetModel.types.0.unitTypeKeys');
  });

  it('requires options for select fields and forbids them elsewhere', () => {
    const select = {
      ...validDocument(),
      customFields: [
        { key: 'ownership_type', label: 'Ownership type', entity: 'PROPERTY', type: 'SELECT' },
      ],
    };
    const textWithOptions = {
      ...validDocument(),
      customFields: [
        {
          key: 'notes',
          label: 'Notes',
          entity: 'RESIDENT',
          type: 'TEXT',
          options: [{ value: 'a', label: 'A' }],
        },
      ],
    };
    expect(issuePaths(select)).toContain('customFields.0.options');
    expect(issuePaths(textWithOptions)).toContain('customFields.0.options');
  });

  it('rejects custom fields pointing at undeclared asset types', () => {
    const document = {
      ...validDocument(),
      customFields: [
        {
          key: 'plot_size',
          label: 'Plot size',
          entity: 'PROPERTY',
          type: 'NUMBER',
          assetTypeKey: 'mansion',
        },
      ],
    };
    expect(issuePaths(document)).toContain('customFields.0.assetTypeKey');
  });

  it('rejects duplicate role grants', () => {
    const document = {
      ...validDocument(),
      roles: {
        grants: [
          { role: 'AUDITOR', permissions: ['audit.read'] },
          { role: 'AUDITOR', permissions: ['resident.read'] },
        ],
      },
    };
    expect(issuePaths(document)).toContain('roles.grants.1.role');
  });

  it('rejects access-code durations outside the supported window', () => {
    expect(issuePaths({ ...validDocument(), accessCodes: { defaultDurationDays: 0 } })).toContain(
      'accessCodes.defaultDurationDays',
    );
    expect(issuePaths({ ...validDocument(), accessCodes: { defaultDurationDays: 366 } })).toContain(
      'accessCodes.defaultDurationDays',
    );
  });

  it('requires complete bank-transfer details when any bank field is set', () => {
    const partial = {
      ...validDocument(),
      payments: { bankTransfer: { bankName: 'Example Bank' } },
    };
    expect(issuePaths(partial)).toContain('payments.bankTransfer.accountName');
    expect(issuePaths(partial)).toContain('payments.bankTransfer.accountNumber');
  });

  it('rejects malformed emergency contacts', () => {
    const malformed = {
      ...validDocument(),
      sos: {
        contacts: [
          {
            id: 'contact-1',
            label: 'Security',
            phone: 'call-us',
          },
        ],
      },
    };
    expect(issuePaths(malformed)).toContain('sos.contacts.0.phone');
  });

  it('rejects duplicate emergency contact ids', () => {
    const duplicate = {
      ...validDocument(),
      sos: {
        contacts: [
          { id: 'contact-1', label: 'Security', phone: '+2348000000001' },
          { id: 'contact-1', label: 'Clinic', phone: '+2348000000002' },
        ],
      },
    };
    expect(issuePaths(duplicate)).toContain('sos.contacts.1.id');
  });

  it('refuses configuration that would weaken payment invariants', () => {
    const accountFirst = {
      ...validDocument(),
      onboarding: { createAccountOnlyAfterVerifiedPayment: false },
    };
    const clientAmounts = {
      ...validDocument(),
      payments: { serverControlledAmounts: false },
    };
    const nonPersistentCodes = {
      ...validDocument(),
      onboarding: { residentCode: { persistent: false } },
    };
    expect(issuePaths(accountFirst)).toContain('onboarding.createAccountOnlyAfterVerifiedPayment');
    expect(issuePaths(clientAmounts)).toContain('payments.serverControlledAmounts');
    expect(issuePaths(nonPersistentCodes)).toContain('onboarding.residentCode.persistent');
  });

  it('exposes readable issue paths for operators', () => {
    try {
      parseOrganizationConfig({ ...validDocument(), branding: { primaryColor: 'blue' } });
      expect.unreachable('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(OrganizationConfigError);
      const configError = error as OrganizationConfigError;
      expect(configError.issues[0]?.path).toBe('branding.primaryColor');
      expect(configError.issues[0]?.message).toMatch(/hex colour/i);
    }
  });
});

describe('configuration resolution', () => {
  it('falls back to bootstrap defaults when nothing is provisioned', () => {
    const bootstrap = parseOrganizationConfig(validDocument());
    const resolved = resolveOrganizationConfig({ bootstrap, stored: null });
    expect(resolved.source).toBe('bootstrap');
    expect(resolved.version).toBe(0);
    expect(resolved.config.organization.slug).toBe('silverstone');
  });

  it('lets the database document win without merging bootstrap values', () => {
    const bootstrap = parseOrganizationConfig(validDocument());
    const storedPayload: OrganizationConfigInput = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      organization: {
        name: 'Another Estate',
        slug: 'another_estate',
      },
    };

    const resolved = resolveOrganizationConfig({
      bootstrap,
      stored: {
        version: 3,
        schemaVersion: CONFIG_SCHEMA_VERSION,
        payload: storedPayload,
      },
    });

    expect(resolved.source).toBe('database');
    expect(resolved.version).toBe(3);
    expect(resolved.config.organization.name).toBe('Another Estate');
    // A field left untouched in the stored document keeps its own value...
    expect(resolved.config.organization.slug).toBe('another_estate');
    // ...not the bootstrap default.
    expect(resolved.config.organization.slug).not.toBe(bootstrap.organization.slug);
  });

  it('rejects stored documents from an unsupported major version', () => {
    const bootstrap = parseOrganizationConfig(validDocument());
    expect(() =>
      resolveOrganizationConfig({
        bootstrap,
        stored: { version: 1, schemaVersion: '2.0.0', payload: validDocument() },
      }),
    ).toThrow(/not supported/i);
  });

  it('rejects mismatched metadata and document versions', () => {
    const bootstrap = parseOrganizationConfig(validDocument());
    expect(() =>
      resolveOrganizationConfig({
        bootstrap,
        stored: {
          version: 1,
          schemaVersion: '1.1.0',
          payload: { ...validDocument(), schemaVersion: '1.0.0' },
        },
      }),
    ).toThrow(/declares/i);
  });

  it('rejects invalid stored versions and payloads', () => {
    const bootstrap = parseOrganizationConfig(validDocument());
    expect(() =>
      resolveOrganizationConfig({
        bootstrap,
        stored: { version: 0, schemaVersion: CONFIG_SCHEMA_VERSION, payload: validDocument() },
      }),
    ).toThrow(/positive integer/i);

    expect(() =>
      resolveOrganizationConfig({
        bootstrap,
        stored: {
          version: 2,
          schemaVersion: CONFIG_SCHEMA_VERSION,
          payload: { schemaVersion: CONFIG_SCHEMA_VERSION, organization: { name: '' } },
        },
      }),
    ).toThrow(OrganizationConfigError);
  });
});
