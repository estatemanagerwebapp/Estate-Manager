/**
 * Unit tests for permanent user deletion (`UserService.remove`).
 *
 * No database: the service is exercised against repository fakes so the
 * guards (self-deletion, role hierarchy, last active super admin) are
 * asserted in isolation.
 */
import { describe, expect, it } from 'vitest';
import { UserService } from './modules/auth/user.service.js';
import type { UserRecord } from './modules/auth/user-repository.js';

function makeUser(overrides: Partial<UserRecord>): UserRecord {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    email: 'ops@example.com',
    passwordHash: '$argon2id$dummy',
    fullName: 'Ops Person',
    phone: null,
    role: 'RESIDENT',
    status: 'ACTIVE',
    mustChangePassword: false,
    lastPasswordChangedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeService(targets: UserRecord[], options?: { lastActiveSuperAdmin?: boolean }) {
  const store = new Map(targets.map((t) => [t.id, { ...t }]));
  const deleted: string[] = [];
  const revoked: string[] = [];
  const auditEvents: Array<{ eventType: string; targetId: string | null; metadata: unknown }> = [];

  const users = {
    async findById(_orgId: string, userId: string) {
      const found = store.get(userId);
      return found ? { ...found } : null;
    },
    async isLastActiveSuperAdmin(_orgId: string, _userId: string) {
      return options?.lastActiveSuperAdmin ?? false;
    },
    async delete(userId: string) {
      deleted.push(userId);
      store.delete(userId);
    },
  };

  const sessions = {
    async revokeAllForUser(userId: string) {
      revoked.push(userId);
    },
  };

  const audit = {
    async record(input: {
      eventType: string;
      targetId: string | null;
      metadata?: Record<string, unknown>;
    }) {
      auditEvents.push({
        eventType: input.eventType,
        targetId: input.targetId,
        metadata: input.metadata ?? {},
      });
    },
  };

  const permissions = {
    async effectivePermissions() {
      return [] as never[];
    },
  };

  const service = new UserService(
    users as never,
    sessions as never,
    audit as never,
    permissions as never,
  );

  return { service, deleted, revoked, auditEvents, store };
}

const CONTEXT = {
  organizationId: 'org-1',
  actorId: 'admin-1',
  requestId: 'req-1',
};

describe('UserService.remove', () => {
  it('deletes the account, revokes its sessions and records the audit event', async () => {
    const { service, deleted, revoked, auditEvents } = makeService([
      makeUser({ id: 'target-1', role: 'RESIDENT' }),
    ]);

    const result = await service.remove(CONTEXT, 'SUPER_ADMIN', 'target-1');

    expect(result).toEqual({ ok: true, id: 'target-1' });
    expect(deleted).toEqual(['target-1']);
    expect(revoked).toEqual(['target-1']);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.eventType).toBe('user.deleted');
    expect(auditEvents[0]?.targetId).toBe('target-1');
  });

  it('rejects an unknown user with 404', async () => {
    const { service, deleted } = makeService([]);
    await expect(service.remove(CONTEXT, 'SUPER_ADMIN', 'nope')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(deleted).toEqual([]);
  });

  it('refuses to delete the caller’s own account', async () => {
    const { service, deleted } = makeService([makeUser({ id: 'admin-1', role: 'SUPER_ADMIN' })]);

    await expect(service.remove(CONTEXT, 'SUPER_ADMIN', 'admin-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(deleted).toEqual([]);
  });

  it('refuses when the actor cannot manage the target’s role', async () => {
    const { service, deleted } = makeService([makeUser({ id: 'boss-1', role: 'SUPER_ADMIN' })]);

    // An ESTATE_ADMIN may not delete a SUPER_ADMIN.
    await expect(service.remove(CONTEXT, 'ESTATE_ADMIN', 'boss-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(deleted).toEqual([]);
  });

  it('refuses to delete the last active super administrator', async () => {
    const { service, deleted } = makeService(
      [makeUser({ id: 'boss-1', role: 'SUPER_ADMIN', status: 'ACTIVE' })],
      { lastActiveSuperAdmin: true },
    );

    await expect(service.remove(CONTEXT, 'SUPER_ADMIN', 'boss-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
    expect(deleted).toEqual([]);
  });

  it('allows deleting a super administrator when another one remains', async () => {
    const { service, deleted } = makeService(
      [makeUser({ id: 'boss-2', role: 'SUPER_ADMIN', status: 'ACTIVE' })],
      { lastActiveSuperAdmin: false },
    );

    const result = await service.remove(CONTEXT, 'SUPER_ADMIN', 'boss-2');
    expect(result.ok).toBe(true);
    expect(deleted).toEqual(['boss-2']);
  });
});
