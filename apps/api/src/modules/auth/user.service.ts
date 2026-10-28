import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { generateTemporaryPassword } from '../../lib/temporary-password.js';
import type { PrismaUserRepository } from './user-repository.js';
import type { PrismaSessionRepository } from './session-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { PermissionResolver } from './permission-resolver.js';
import {
  assertCanCreateRole,
  assertMayManage,
  assertMayDelete,
  assertNewRoleAllowed,
  assertNewStatusAllowed,
  lastAdminGuardMessage,
} from './user-rules.js';
import type {
  AdminCreateUserInput,
  AdminCreateUserResponse,
  UserDto,
  UserListItemDto,
  RevokeUserSessionsResponse,
  SetUserStatusResponse,
  SetUserRoleResponse,
  DeleteUserResponse,
  UserDetailResponse,
  UserListResponse,
} from '@silverstone/shared';
import type { AuthAuditContext } from './auth.service.js';

/**
 * Administrative user lifecycle: list, view, suspend/re-enable, assign
 * roles. Every mutation requires the `user.manage` permission and is
 * audited; the caller's identity is always read from the authenticated
 * session, never from the request body.
 *
 * Privilege-escalation guards (see `user-rules.ts`):
 * - An administrator cannot change the status or role of *themselves*.
 * - The last active SUPER_ADMIN cannot be suspended or demoted, so the
 *   deployment cannot lock itself out of recovery.
 */
export class UserService {
  constructor(
    private readonly users: PrismaUserRepository,
    private readonly sessions: PrismaSessionRepository,
    private readonly audit: PrismaAuditRepository,
    private readonly permissions: PermissionResolver,
  ) {}

  async list(
    organizationId: string,
    filter: { role?: string; status?: string; staffOnly?: boolean },
  ): Promise<UserListResponse> {
    const records = await this.users.list({
      organizationId,
      role: filter.role,
      status: filter.status,
      staffOnly: filter.staffOnly,
    });
    return {
      users: await Promise.all(records.map((record) => this.toDto(record))),
    };
  }

  /**
   * Create a staff account with a one-time temporary password.
   *
   * Only staff roles are accepted (residents are created by onboarding), and
   * the actor may only create roles they can manage. The plaintext password is
   * returned once and never persisted or audited.
   */
  async create(
    context: AuthAuditContext,
    actorRole: string,
    input: AdminCreateUserInput,
  ): Promise<AdminCreateUserResponse> {
    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    const phone = input.phone?.trim() || null;

    assertCanCreateRole(actorRole, input.role);

    const existing = await this.users.findByEmail(context.organizationId, email);
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'A user with this email already exists');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const record = await this.users.create({
      organizationId: context.organizationId,
      email,
      passwordHash,
      fullName,
      phone,
      role: input.role,
      status: 'ACTIVE',
      mustChangePassword: true,
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'user.created',
      targetType: 'user',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        email: record.email,
        role: record.role,
        mustChangePassword: true,
      },
    });

    return {
      ok: true,
      user: await this.toDto(record),
      temporaryPassword,
    };
  }

  /**
   * Revoke every session for a managed staff account. Useful after a lost
   * device or when an operator wants to force a fresh sign-in without
   * changing the account's status or role.
   */
  async revokeSessions(
    context: AuthAuditContext,
    actorRole: string,
    targetUserId: string,
  ): Promise<RevokeUserSessionsResponse> {
    const target = await this.users.findById(context.organizationId, targetUserId);
    if (!target) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    assertMayManage(actorRole, target, context.actorId ?? '', target.id);
    await this.sessions.revokeAllForUser(target.id);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'user.sessions_revoked',
      targetType: 'user',
      targetId: target.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { role: target.role, status: target.status },
    });

    return { ok: true, id: target.id };
  }

  async get(organizationId: string, userId: string): Promise<UserDetailResponse> {
    const record = await this.users.findById(organizationId, userId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }
    return { user: await this.toDto(record) };
  }

  async setStatus(
    context: AuthAuditContext,
    actorRole: string,
    targetUserId: string,
    newStatus: string,
    reason: string,
  ): Promise<SetUserStatusResponse> {
    const organizationId = context.organizationId;
    const target = await this.users.findById(organizationId, targetUserId);
    if (!target) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    assertNewStatusAllowed(newStatus);
    assertMayManage(actorRole, target, context.actorId ?? '', target.id);

    const closing = newStatus !== 'ACTIVE';
    // The guard blocks only when the target is active *and* is the
    // organization's last remaining active super admin — closing that
    // account would leave zero active super admins.
    if (
      closing &&
      target.status === 'ACTIVE' &&
      (await this.users.isLastActiveSuperAdmin(organizationId, target.id))
    ) {
      throw new AppError(409, 'CONFLICT', lastAdminGuardMessage('suspend'));
    }

    await this.users.updateStatus(target.id, newStatus);
    if (closing) {
      // A suspended / disabled account's sessions stop working immediately.
      await this.sessions.revokeAllForUser(target.id);
    }

    const eventType =
      newStatus === 'ACTIVE'
        ? 'account.reactivated'
        : newStatus === 'SUSPENDED'
          ? 'account.suspended'
          : 'account.disabled';

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType,
      targetType: 'user',
      targetId: target.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        from: target.status,
        to: newStatus,
        ...(reason ? { reason: reason.slice(0, 280) } : {}),
      },
    });

    const updated = await this.users.findById(context.organizationId, target.id);
    return { ok: true, user: await this.toDto(updated ?? target) };
  }

  async setRole(
    context: AuthAuditContext,
    actorRole: string,
    targetUserId: string,
    newRole: string,
  ): Promise<SetUserRoleResponse> {
    const target = await this.users.findById(context.organizationId, targetUserId);
    if (!target) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    assertNewRoleAllowed(actorRole, target.role, newRole);
    assertMayManage(actorRole, target, context.actorId ?? '', target.id);

    // Demoting any active super admin out of the role reduces the active
    // super-admin count; block it when the target is the last one.
    if (
      target.role === 'SUPER_ADMIN' &&
      target.status === 'ACTIVE' &&
      (await this.users.isLastActiveSuperAdmin(context.organizationId, target.id))
    ) {
      throw new AppError(409, 'CONFLICT', lastAdminGuardMessage('demote'));
    }

    const previousRole = target.role;
    await this.users.updateRole(target.id, newRole);
    // A role change revokes the user's sessions so the new permissions apply
    // immediately.
    await this.sessions.revokeAllForUser(target.id);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'user.role_changed',
      targetType: 'user',
      targetId: target.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { from: previousRole, to: newRole },
    });

    const updated = await this.users.findById(context.organizationId, target.id);
    return { ok: true, user: await this.toDto(updated ?? target) };
  }

  /**
   * Permanently delete a user account.
   *
   * Guards (all fail closed):
   * - the target must exist in this organization;
   * - an administrator cannot delete their own account;
   * - the actor must be allowed to manage the target's role;
   * - the last active SUPER_ADMIN cannot be deleted (recovery lockout).
   *
   * The account disappears immediately: sessions are revoked first, and the
   * resident-onboarding link is nulled by the schema so the resident record
   * survives. The deletion is audited (`user.deleted`).
   */
  async remove(
    context: AuthAuditContext,
    actorRole: string,
    targetUserId: string,
  ): Promise<DeleteUserResponse> {
    const organizationId = context.organizationId;
    const target = await this.users.findById(organizationId, targetUserId);
    if (!target) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    assertMayDelete(actorRole, target, context.actorId ?? '', target.id);

    if (
      target.role === 'SUPER_ADMIN' &&
      target.status === 'ACTIVE' &&
      (await this.users.isLastActiveSuperAdmin(organizationId, target.id))
    ) {
      throw new AppError(409, 'CONFLICT', lastAdminGuardMessage('delete'));
    }

    // Revoke sessions first: a deleted account must lose access immediately.
    await this.sessions.revokeAllForUser(target.id);
    await this.users.delete(target.id);

    await this.audit.record({
      organizationId,
      actorId: context.actorId,
      eventType: 'user.deleted',
      targetType: 'user',
      targetId: target.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { email: target.email, role: target.role },
    });

    return { ok: true, id: target.id };
  }

  private async toDto(record: {
    id: string;
    email: string;
    phone: string | null;
    fullName: string | null;
    role: string;
    status: string;
    mustChangePassword: boolean;
    lastPasswordChangedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<UserListItemDto> {
    const permissions = await this.permissions.effectivePermissions(record.role);
    return {
      id: record.id,
      email: record.email,
      phone: record.phone,
      fullName: record.fullName,
      role: record.role as UserDto['role'],
      mustChangePassword: record.mustChangePassword,
      permissions,
      status: record.status as UserDto['status'],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      lastPasswordChangedAt: record.lastPasswordChangedAt?.toISOString() ?? null,
    };
  }
}
