/**
 * Unit tests for the resident onboarding service (no database — fakes only).
 * Covers: register → save → mark paid → complete → user creation,
 * code lookup, and the forced-password-change flag.
 */
import { describe, expect, it } from 'vitest';
import { AppError } from './lib/errors.js';
import {
  ResidentOnboardingService,
  residentOnboardingConfigFromConfig,
  type PropertyDetail,
} from './modules/auth/resident-onboarding.service.js';
import type { PrismaUserRepository } from './modules/auth/user-repository.js';
import type { PrismaResidentOnboardingRepository } from './modules/auth/resident-onboarding-repository.js';

// --- Test doubles ------------------------------------------------------------------

type ResolvedRecord = {
  record: {
    id: string;
    organizationId: string;
    propertyId: string;
    status: 'PENDING' | 'COMPLETED';
    firstName: string;
    email: string | null;
    phone: string | null;
    gender: string | null;
    maritalStatus: string | null;
    propertyType: string | null;
    nextOfKinName: string | null;
    nextOfKinPhone: string | null;
    nextOfKinEmail: string | null;
    idType: string | null;
    idDocumentUrl: string | null;
    paymentStatus: 'UNPAID' | 'PAID';
    paymentRef: string | null;
    paidAt: Date | null;
    userId: string | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  code: string;
};

function makeFakeDrafts(
  records: Array<{
    id: string;
    codeHash: string;
    organizationId: string;
    propertyId: string;
    firstName: string;
    email: string | null;
    phone: string | null;
    gender?: string | null;
    maritalStatus?: string | null;
    nextOfKinName?: string | null;
    nextOfKinPhone?: string | null;
    idType?: string | null;
    idDocumentUrl?: string | null;
    paymentStatus?: 'UNPAID' | 'PAID';
    status?: 'PENDING' | 'COMPLETED';
  }>,
) {
  const store = new Map<string, ResolvedRecord['record']>();
  const codeToId = new Map<string, string>();
  for (const r of records) {
    const rec: ResolvedRecord['record'] = {
      id: r.id,
      organizationId: r.organizationId,
      propertyId: r.propertyId,
      status: r.status ?? 'PENDING',
      firstName: r.firstName,
      email: r.email,
      phone: r.phone,
      gender: r.gender ?? null,
      maritalStatus: r.maritalStatus ?? null,
      propertyType: null,
      nextOfKinName: r.nextOfKinName ?? null,
      nextOfKinPhone: r.nextOfKinPhone ?? null,
      nextOfKinEmail: null,
      idType: r.idType ?? null,
      idDocumentUrl: r.idDocumentUrl ?? null,
      paymentStatus: r.paymentStatus ?? 'UNPAID',
      paymentRef: null,
      paidAt: null,
      userId: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.set(rec.id, rec);
    codeToId.set(r.codeHash, rec.id);
  }

  return {
    store,
    codeToId,
    async create(input: unknown, codeLength: number): Promise<ResolvedRecord> {
      const rec: ResolvedRecord['record'] = {
        id: crypto.randomUUID(),
        organizationId: (input as { organizationId: string }).organizationId,
        propertyId: (input as { propertyId: string }).propertyId,
        status: 'PENDING',
        firstName: (input as { firstName: string }).firstName,
        email: (input as { email: string | null }).email,
        phone: (input as { phone: string | null }).phone,
        gender: null,
        maritalStatus: null,
        propertyType: null,
        nextOfKinName: null,
        nextOfKinPhone: null,
        nextOfKinEmail: null,
        idType: null,
        idDocumentUrl: null,
        paymentStatus: 'UNPAID',
        paymentRef: null,
        paidAt: null,
        userId: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.set(rec.id, rec);
      return { record: rec, code: 'FAKE' + codeLength };
    },
    async findByCode(code: string, organizationId: string) {
      void organizationId;
      const id = codeToId.get(code);
      if (!id) return null;
      const rec = store.get(id)!;
      return { ...rec };
    },
    async findById(id: string) {
      const rec = store.get(id);
      return rec ? { ...rec } : null;
    },
    async listByOrganization(organizationId: string) {
      void organizationId;
      return [...store.values()].map((r) => ({ ...r }));
    },
    async saveDraft(input: {
      id: string;
      gender?: string | null;
      maritalStatus?: string | null;
      propertyType?: string | null;
      nextOfKinName?: string | null;
      nextOfKinPhone?: string | null;
      nextOfKinEmail?: string | null;
      idType?: string | null;
      idDocumentUrl?: string | null;
    }) {
      const rec = store.get(input.id);
      if (!rec) return null;
      if (input.gender !== undefined) rec.gender = input.gender;
      if (input.maritalStatus !== undefined) rec.maritalStatus = input.maritalStatus;
      if (input.propertyType !== undefined) rec.propertyType = input.propertyType;
      if (input.nextOfKinName !== undefined) rec.nextOfKinName = input.nextOfKinName;
      if (input.nextOfKinPhone !== undefined) rec.nextOfKinPhone = input.nextOfKinPhone;
      if (input.nextOfKinEmail !== undefined) rec.nextOfKinEmail = input.nextOfKinEmail;
      if (input.idType !== undefined) rec.idType = input.idType;
      if (input.idDocumentUrl !== undefined) rec.idDocumentUrl = input.idDocumentUrl;
      return { ...rec };
    },
    async markPaid(id: string, paymentRef: string | null) {
      const rec = store.get(id);
      if (!rec) return null;
      rec.paymentStatus = 'PAID';
      rec.paymentRef = paymentRef;
      rec.paidAt = new Date();
      return { ...rec };
    },
    async linkUser(id: string, userId: string) {
      const rec = store.get(id);
      if (!rec) return null;
      rec.userId = userId;
      rec.status = 'COMPLETED';
      rec.completedAt = new Date();
      return { ...rec };
    },
  };
}

function makeFakeUsers(
  createdUsers: Array<{
    organizationId: string;
    email: string;
    passwordHash: string;
    fullName: string | null;
    phone: string | null;
    role: string;
    status?: string;
    mustChangePassword?: boolean;
  }> = [],
) {
  const byEmail = new Map<string, (typeof createdUsers)[0] & { id: string }>();
  for (const u of createdUsers) {
    byEmail.set(u.email.toLowerCase(), { ...u, id: 'user-' + u.email });
  }
  const createCalls: unknown[] = [];
  return {
    createdUsers: () => [...byEmail.values()],
    createCalls,
    async findByEmail(_orgId: string, email: string) {
      const found = byEmail.get(email.toLowerCase());
      if (!found) return null;
      return {
        id: found.id,
        organizationId: found.organizationId,
        email: found.email.toLowerCase(),
        passwordHash: found.passwordHash,
        fullName: found.fullName,
        phone: found.phone,
        role: found.role,
        status: found.status ?? 'ACTIVE',
        mustChangePassword: found.mustChangePassword ?? false,
        lastPasswordChangedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    async create(input: {
      organizationId: string;
      email: string;
      passwordHash: string;
      fullName: string | null;
      phone: string | null;
      role: string;
      status?: string;
      mustChangePassword?: boolean;
    }) {
      createCalls.push(input);
      const user = {
        id: 'new-user',
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        role: input.role,
        status: input.status ?? 'ACTIVE',
        mustChangePassword: input.mustChangePassword ?? false,
        lastPasswordChangedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      byEmail.set(user.email, { ...user });
      return user;
    },
  };
}

function makeFakeAudit() {
  const calls: unknown[] = [];
  return {
    calls,
    async record(input: unknown) {
      calls.push(input);
    },
  };
}

function makeFakePermissions() {
  return {
    async effectivePermissions(_role: string) {
      return ['portal.access.self'] as const;
    },
  };
}

const FAKE_CONFIG = {
  onboarding: { residentCode: { length: 10 } },
  fees: { registration: { amountKobo: 5000000 } },
} as unknown as Parameters<typeof residentOnboardingConfigFromConfig>[0];

function makeService(
  draftRecords: Parameters<typeof makeFakeDrafts>[0] = [],
  userRecords: Parameters<typeof makeFakeUsers>[0] = [],
) {
  const drafts = makeFakeDrafts(draftRecords);
  const users = makeFakeUsers(userRecords);
  const audit = makeFakeAudit();
  const permissions = makeFakePermissions();
  const loadConfig = async () => FAKE_CONFIG;
  const loadProperty = async (
    _orgId: string,
    _propertyId: string,
  ): Promise<PropertyDetail | null> => ({
    identifier: 'PROP-001',
    name: 'Test Property',
    estate: { name: 'Test Estate', slug: 'test_estate' },
  });
  const service = new ResidentOnboardingService(
    users as unknown as PrismaUserRepository,
    drafts as unknown as PrismaResidentOnboardingRepository,
    audit as never,
    permissions as never,
    loadConfig,
    loadProperty,
  );
  return { service, drafts, users, audit, permissions };
}

const CONTEXT = {
  organizationId: 'org-1',
  actorId: 'admin-1',
  requestId: 'req-1',
};

// --- registerResident -------------------------------------------------------------

describe('registerResident', () => {
  it('creates a draft and returns the plaintext code', async () => {
    const { service } = makeService();
    const result = await service.registerResident(CONTEXT, 'SUPER_ADMIN', {
      firstName: 'Adaeze',
      email: 'adaeze@example.com',
      phone: '+2348000000000',
      propertyId: 'prop-1',
    });
    expect(result.ok).toBe(true);
    expect(result.resident.firstName).toBe('Adaeze');
    expect(result.resident.property.identifier).toBe('PROP-001');
    expect(result.onboardingCode).toBe('FAKE10');
  });

  it('rejects an empty first name', async () => {
    const { service } = makeService();
    await expect(
      service.registerResident(CONTEXT, 'SUPER_ADMIN', {
        firstName: '   ',
        propertyId: 'prop-1',
      }),
    ).rejects.toThrow(AppError);
  });
});

// --- viewByCode ---------------------------------------------------------------------

describe('viewByCode', () => {
  it('returns the draft + fee for a valid code', async () => {
    const { service } = makeFakeServiceWithRecord();
    const view = await service.viewByCode('org-1', 'CODE1');
    expect(view.resident.firstName).toBe('Adaeze');
    expect(view.registrationFee.amountKobo).toBe(5000000);
    expect(view.registrationFee.currency).toBe('NGN');
  });

  it('throws 404 for an unknown code', async () => {
    const { service } = makeService();
    await expect(service.viewByCode('org-1', 'UNKNOWN')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

function makeFakeServiceWithRecord() {
  return makeService([
    {
      id: 'draft-1',
      codeHash: 'CODE1',
      organizationId: 'org-1',
      propertyId: 'prop-1',
      firstName: 'Adaeze',
      email: 'adaeze@example.com',
      phone: '+2348000000000',
    },
  ]);
}

// --- saveDraft ----------------------------------------------------------------------

describe('saveDraft', () => {
  it('persists resident fields on a valid code', async () => {
    const { service, drafts } = makeFakeServiceWithRecord();
    const result = await service.saveDraft('org-1', {
      code: 'CODE1',
      gender: 'FEMALE',
      maritalStatus: 'SINGLE',
      nextOfKinName: 'John Doe',
      nextOfKinPhone: '+2348000000001',
    });
    expect(result.resident.gender).toBe('FEMALE');
    expect(result.resident.maritalStatus).toBe('SINGLE');
    expect(result.resident.nextOfKinName).toBe('John Doe');
    void drafts;
  });

  it('rejects an unknown gender value', async () => {
    const { service } = makeFakeServiceWithRecord();
    await expect(service.saveDraft('org-1', { code: 'CODE1', gender: 'INVALID' })).rejects.toThrow(
      AppError,
    );
  });

  it('rejects a completed onboarding', async () => {
    const { service } = makeService([
      {
        id: 'draft-2',
        codeHash: 'CODE2',
        organizationId: 'org-1',
        propertyId: 'prop-1',
        firstName: 'Adaeze',
        email: null,
        phone: null,
        status: 'COMPLETED',
      },
    ]);
    await expect(
      service.saveDraft('org-1', { code: 'CODE2', gender: 'MALE' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// --- markPaid -----------------------------------------------------------------------

describe('markPaid', () => {
  it('marks a PENDING draft as PAID', async () => {
    const { service, drafts } = makeFakeServiceWithRecord();
    const result = await service.markPaid(CONTEXT, 'SUPER_ADMIN', 'draft-1', {});
    expect(result.resident.paymentStatus).toBe('PAID');
    expect(drafts.store.get('draft-1')!.paymentStatus).toBe('PAID');
  });

  it('rejects marking an already-PAID draft', async () => {
    const { service } = makeService([
      {
        id: 'draft-3',
        codeHash: 'CODE3',
        organizationId: 'org-1',
        propertyId: 'prop-1',
        firstName: 'Adaeze',
        email: null,
        phone: null,
        paymentStatus: 'PAID',
      },
    ]);
    await expect(service.markPaid(CONTEXT, 'SUPER_ADMIN', 'draft-3', {})).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

// --- complete -------------------------------------------------------------------------

describe('complete', () => {
  it('creates a User with a generated demo password when all fields + payment are complete', async () => {
    const { service, users } = makeService([
      {
        id: 'draft-4',
        codeHash: 'CODE4',
        organizationId: 'org-1',
        propertyId: 'prop-1',
        firstName: 'Adaeze',
        email: 'adaeze@example.com',
        phone: '+2348000000000',
        gender: 'FEMALE',
        maritalStatus: 'SINGLE',
        nextOfKinName: 'John',
        nextOfKinPhone: '+2348000000001',
        idType: 'NATIONAL_ID',
        idDocumentUrl: '/media/org-1/doc1',
        paymentStatus: 'PAID',
      },
    ]);
    const result = await service.complete('org-1', { code: 'CODE4' }, CONTEXT);
    expect(result.ok).toBe(true);
    expect(result.demoPassword).toHaveLength(16);
    // The created user must carry mustChangePassword
    const created = users.createCalls[0] as { mustChangePassword?: boolean };
    expect(created.mustChangePassword).toBe(true);
    // The draft is linked + completed
    expect(users.createdUsers().length).toBe(1);
  });

  it('rejects completion when payment is UNPAID', async () => {
    const { service } = makeService([
      {
        id: 'draft-5',
        codeHash: 'CODE5',
        organizationId: 'org-1',
        propertyId: 'prop-1',
        firstName: 'Adaeze',
        email: 'adaeze@example.com',
        phone: null,
        gender: 'FEMALE',
        maritalStatus: 'SINGLE',
        nextOfKinName: 'John',
        nextOfKinPhone: '+2348000000001',
        idType: 'NATIONAL_ID',
        idDocumentUrl: '/media/org-1/doc1',
      },
    ]);
    await expect(service.complete('org-1', { code: 'CODE5' }, CONTEXT)).rejects.toMatchObject({
      statusCode: 409,
      code: 'PAYMENT_REQUIRED',
    });
  });

  it('rejects completion with missing required fields', async () => {
    const { service } = makeService([
      {
        id: 'draft-6',
        codeHash: 'CODE6',
        organizationId: 'org-1',
        propertyId: 'prop-1',
        firstName: 'Adaeze',
        email: 'adaeze@example.com',
        phone: null,
        gender: 'FEMALE',
        maritalStatus: 'SINGLE',
        nextOfKinName: 'John',
        nextOfKinPhone: '+2348000000001',
        idType: null,
        idDocumentUrl: null,
        paymentStatus: 'PAID',
      },
    ]);
    await expect(service.complete('org-1', { code: 'CODE6' }, CONTEXT)).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects completion when email is null (no login credential)', async () => {
    const { service } = makeService([
      {
        id: 'draft-7',
        codeHash: 'CODE7',
        organizationId: 'org-1',
        propertyId: 'prop-1',
        firstName: 'Adaeze',
        email: null,
        phone: null,
        gender: 'FEMALE',
        maritalStatus: 'SINGLE',
        nextOfKinName: 'John',
        nextOfKinPhone: '+2348000000001',
        idType: 'NATIONAL_ID',
        idDocumentUrl: '/media/org-1/doc1',
        paymentStatus: 'PAID',
      },
    ]);
    await expect(service.complete('org-1', { code: 'CODE7' }, CONTEXT)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects completion when a user with that email already exists', async () => {
    const { service } = makeService(
      [
        {
          id: 'draft-8',
          codeHash: 'CODE8',
          organizationId: 'org-1',
          propertyId: 'prop-1',
          firstName: 'Adaeze',
          email: 'existing@example.com',
          phone: null,
          gender: 'FEMALE',
          maritalStatus: 'SINGLE',
          nextOfKinName: 'John',
          nextOfKinPhone: '+2348000000001',
          idType: 'NATIONAL_ID',
          idDocumentUrl: '/media/org-1/doc1',
          paymentStatus: 'PAID',
        },
      ],
      [
        {
          organizationId: 'org-1',
          email: 'existing@example.com',
          passwordHash: 'x',
          fullName: 'Someone',
          phone: null,
          role: 'RESIDENT',
        },
      ],
    );
    await expect(service.complete('org-1', { code: 'CODE8' }, CONTEXT)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
  });
});

// --- demo password --------------------------------------------------------------------

describe('demo password generation', () => {
  it('generates a 16-char password that satisfies the policy', async () => {
    const { service } = makeService([
      {
        id: 'draft-9',
        codeHash: 'CODE9',
        organizationId: 'org-1',
        propertyId: 'prop-1',
        firstName: 'Adaeze',
        email: 'adaeze9@example.com',
        phone: null,
        gender: 'FEMALE',
        maritalStatus: 'SINGLE',
        nextOfKinName: 'John',
        nextOfKinPhone: '+2348000000001',
        idType: 'NATIONAL_ID',
        idDocumentUrl: '/media/org-1/doc1',
        paymentStatus: 'PAID',
      },
    ]);
    const result = await service.complete('org-1', { code: 'CODE9' }, CONTEXT);
    const pw = result.demoPassword;
    expect(pw).toHaveLength(16);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
  });
});

// --- attachIdDocument -----------------------------------------------------------------

describe('attachIdDocument', () => {
  it('records the uploaded URL on the draft', async () => {
    const { service, drafts } = makeFakeServiceWithRecord();
    await service.attachIdDocument('org-1', 'CODE1', '/media/org-1/newdoc');
    expect(drafts.store.get('draft-1')!.idDocumentUrl).toBe('/media/org-1/newdoc');
  });

  it('rejects an unknown code', async () => {
    const { service } = makeService();
    await expect(
      service.attachIdDocument('org-1', 'UNKNOWN', '/media/org-1/doc'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// --- config snapshot -------------------------------------------------------------------

describe('residentOnboardingConfigFromConfig', () => {
  it('reads code length and fee from the resolved config', () => {
    const config = {
      onboarding: { residentCode: { length: 12 } },
      fees: { registration: { amountKobo: 12345 } },
    } as unknown as Parameters<typeof residentOnboardingConfigFromConfig>[0];
    const snapshot = residentOnboardingConfigFromConfig(config);
    expect(snapshot.codeLength).toBe(12);
    expect(snapshot.fee.amountKobo).toBe(12345);
  });

  it('falls back to defaults when the config section is absent', () => {
    const empty = {} as unknown as Parameters<typeof residentOnboardingConfigFromConfig>[0];
    const snapshot = residentOnboardingConfigFromConfig(empty);
    expect(snapshot.codeLength).toBe(10);
  });
});

// --- repository code generation ---------------------------------------------------------

describe('generateResidentCode', () => {
  it('produces a code of the requested length with the unambiguous alphabet', async () => {
    const { PrismaResidentOnboardingRepository: _Unused, generateResidentCode } =
      await import('./modules/auth/resident-onboarding-repository.js');
    void _Unused;
    const code = generateResidentCode(10);
    expect(code).toHaveLength(10);
    // No 0, O, 1, I
    expect(code).not.toMatch(/[0OI1]/);
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/);
  });
});
