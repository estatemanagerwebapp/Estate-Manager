import { AppError } from '../../lib/errors.js';
import {
  getDummyPasswordHash,
  hashPassword,
  verifyPassword,
  sha256Hex,
} from '../../lib/password.js';
import { validatePassword } from './password-policy.js';
import type { PrismaUserRepository } from './user-repository.js';
import type { PrismaSessionRepository } from './session-repository.js';
import type { PrismaPasswordResetRepository } from './reset-token-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { PermissionResolver } from './permission-resolver.js';
import type { EmailAdapter } from './email-adapter.js';
import type {
  UserDto,
  ResetPasswordResponse,
  ChangePasswordResponse,
  MeResponse,
  LogoutResponse,
} from '@silverstone/shared';

export interface AuthAuditContext {
  organizationId: string;
  actorId: string | null;
  requestId: string | null;
}

// A deliberately-failing hash matching the active backend. Verifying against it
// takes the same wall-clock time as a real check, so a login attempt for an
// unknown email takes as long as one for a known email — no account enumeration
// through timing. Resolved per backend because PBKDF2 and Argon2id have very
// different costs.

/**
 * Business rules for authentication, sessions and password lifecycle.
 *
 * This service is the *only* place where decisions live (ADR-0001). Route
 * handlers translate HTTP ↔ service calls and throw; they never branch on
 * business conditions.
 */
export class AuthService {
  constructor(
    private readonly users: PrismaUserRepository,
    private readonly sessions: PrismaSessionRepository,
    private readonly resetTokens: PrismaPasswordResetRepository,
    private readonly audit: PrismaAuditRepository,
    private readonly permissions: PermissionResolver,
    private readonly email: EmailAdapter,
    private readonly sessionLifetimeDays: number,
    private readonly resetTokenTtlMinutes: number,
    private readonly webBaseUrl: string,
  ) {}

  // --- Login ----------------------------------------------------------------

  async login(
    organizationId: string,
    email: string,
    password: string,
    context: AuthAuditContext,
  ): Promise<{ user: UserDto; sessionToken: string }> {
    const normalizedEmail = email.toLowerCase();

    const record = await this.users.findByEmail(organizationId, normalizedEmail);
    const accountExists = record !== null;

    let passwordOk = false;
    if (record) {
      passwordOk = await verifyPassword(record.passwordHash, password);
    }

    // Uniform timing: run a dummy verify when the account is unknown so the
    // response latency does not reveal account existence.
    if (!accountExists) {
      await verifyPassword(await getDummyPasswordHash(), password);
    }

    const statusActive = record?.status === 'ACTIVE';
    const success = accountExists && passwordOk && statusActive;

    if (!success) {
      await this.audit.record({
        organizationId,
        actorId: record?.id ?? null,
        eventType: 'login.failed',
        targetType: 'user',
        targetId: record?.id ?? null,
        requestId: context.requestId,
        outcome: 'failure',
        metadata: {
          reason: !accountExists
            ? 'unknown_account'
            : !statusActive
              ? 'account_not_active'
              : 'invalid_password',
        },
      });
      // Generic 401: does not disclose whether the account exists.
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid credentials');
    }

    const session = await this.sessions.create(record.id, this.sessionLifetimeDays);

    await this.audit.record({
      organizationId,
      actorId: record.id,
      eventType: 'login.succeeded',
      targetType: 'user',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
    });

    const user = await this.toUserDto(record);
    return { user, sessionToken: session.id };
  }

  // --- Logout -----------------------------------------------------------------

  async logout(context: AuthAuditContext, sessionId: string): Promise<LogoutResponse> {
    await this.sessions.revoke(sessionId);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'logout',
      targetType: 'session',
      targetId: sessionId,
      requestId: context.requestId,
      outcome: 'success',
    });
    return { ok: true };
  }

  // --- Me ----------------------------------------------------------------------

  async me(context: AuthAuditContext): Promise<MeResponse> {
    const record = await this.users.findById(context.organizationId, context.actorId ?? '');
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }
    return { user: await this.toUserDto(record) };
  }

  // --- Change password ---------------------------------------------------------

  async changePassword(
    context: AuthAuditContext,
    currentPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResponse> {
    const record = await this.users.findById(context.organizationId, context.actorId ?? '');
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    const currentOk = await verifyPassword(record.passwordHash, currentPassword);
    if (!currentOk) {
      await this.audit.record({
        organizationId: context.organizationId,
        actorId: record.id,
        eventType: 'login.failed',
        targetType: 'user',
        targetId: record.id,
        requestId: context.requestId,
        outcome: 'failure',
        metadata: { reason: 'password_change_wrong_current' },
      });
      throw new AppError(401, 'UNAUTHORIZED', 'Current password is incorrect');
    }

    const problems = validatePassword(newPassword);
    if (problems.length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Password does not meet the requirements', {
        details: problems.map((message, index) => ({
          path: `body.newPassword[${index}]`,
          message,
        })),
      });
    }

    const newHash = await hashPassword(newPassword);
    await this.users.updatePassword(record.id, newHash);

    // Invalidate every session for this user so a stolen cookie stops
    // working the moment the password changes.
    await this.sessions.revokeAllForUser(record.id);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: record.id,
      eventType: 'password.changed',
      targetType: 'user',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: { reason: 'user_initiated' },
    });

    return { ok: true };
  }

  // --- Forgot password ---------------------------------------------------------

  /**
   * Identical response for existing and unknown addresses; the endpoint
   * cannot be used to enumerate accounts.
   */
  async forgotPassword(
    organizationId: string,
    email: string,
    context: AuthAuditContext,
  ): Promise<{ ok: true }> {
    const normalizedEmail = email.toLowerCase();
    const record = await this.users.findByEmail(organizationId, normalizedEmail);

    if (!record || record.status !== 'ACTIVE') {
      await this.audit.record({
        organizationId,
        actorId: null,
        eventType: 'password.reset_requested',
        targetType: 'user',
        targetId: record?.id ?? null,
        requestId: context.requestId,
        outcome: 'failure',
        metadata: { reason: !record ? 'unknown_email' : 'account_not_active' },
      });
      return { ok: true };
    }

    const { token } = await this.resetTokens.createForUser(record.id, this.resetTokenTtlMinutes);
    const resetUrl = `${this.webBaseUrl}/reset-password?token=${token}`;

    let delivered = false;
    try {
      await this.email.send({
        to: record.email,
        subject: 'Reset your Silverstone Managers password',
        text:
          `A password reset was requested for ${record.email}.\n` +
          `Open ${resetUrl} to choose a new password. This link expires ` +
          `${this.resetTokenTtlMinutes} minutes from now.\n` +
          'If you did not request this, you can ignore this message.',
      });
      delivered = true;
    } catch {
      delivered = false;
    }

    await this.audit.record({
      organizationId,
      actorId: null,
      eventType: 'password.reset_requested',
      targetType: 'user',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      // The token and URL are deliberately NOT recorded; `delivered`
      // honestly reports whether the provider accepted the message.
      metadata: { provider: this.email.provider, delivered },
    });

    return { ok: true };
  }

  // --- Reset password ---------------------------------------------------------

  async resetPassword(
    organizationId: string,
    token: string,
    newPassword: string,
    context: AuthAuditContext,
  ): Promise<ResetPasswordResponse> {
    const tokenHash = sha256Hex(token);
    const record = await this.resetTokens.findActiveByHash(tokenHash);

    if (!record) {
      await this.audit.record({
        organizationId,
        actorId: null,
        eventType: 'password.reset_requested',
        targetType: 'user',
        targetId: null,
        requestId: context.requestId,
        outcome: 'failure',
        metadata: { reason: 'token_invalid_or_expired' },
      });
      throw new AppError(400, 'BAD_REQUEST', 'This reset token is invalid or has expired');
    }

    const problems = validatePassword(newPassword);
    if (problems.length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Password does not meet the requirements', {
        details: problems.map((message, index) => ({
          path: `body.newPassword[${index}]`,
          message,
        })),
      });
    }

    // Single-use: consume before applying, so a double-spend attempt fails.
    const consumed = await this.resetTokens.consume(tokenHash);
    if (!consumed) {
      throw new AppError(400, 'BAD_REQUEST', 'This reset token has already been used');
    }

    const userRecord = await this.users.findById(organizationId, record.userId);
    if (!userRecord || userRecord.status !== 'ACTIVE') {
      throw new AppError(400, 'BAD_REQUEST', 'This account is not active');
    }

    const newHash = await hashPassword(newPassword);
    await this.users.updatePassword(userRecord.id, newHash);

    // A password reset revokes every session, so any device that was not the
    // one that requested the reset is signed out.
    await this.sessions.revokeAllForUser(userRecord.id);

    await this.audit.record({
      organizationId,
      actorId: null,
      eventType: 'password.reset_completed',
      targetType: 'user',
      targetId: userRecord.id,
      requestId: context.requestId,
      outcome: 'success',
      // No token, no link, no email.
    });

    return { ok: true };
  }

  // --- Bootstrap ---------------------------------------------------------------

  /**
   * Create the first SUPER_ADMIN for a fresh deployment.
   *
   * Fails safely when an administrator already exists — rerunning the
   * bootstrap on a provisioned deployment is a no-op, not a credential
   * replacement. Subsequent super-admins are created through the ordinary
   * user-management surface by an existing SUPER_ADMIN.
   */
  async bootstrapSuperAdmin(
    organizationId: string,
    email: string,
    password: string,
  ): Promise<{ created: boolean; user: UserDto | null }> {
    const alreadyHasAdmin = await this.users.hasSuperAdmin(organizationId);
    if (alreadyHasAdmin) {
      // No replacement, no extension — this path is only for the first admin.
      return { created: false, user: null };
    }

    const problems = validatePassword(password);
    if (problems.length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Password does not meet the requirements', {
        details: problems.map((message, index) => ({
          path: `body.password[${index}]`,
          message,
        })),
      });
    }

    const hash = await hashPassword(password);
    const user = await this.users.create({
      organizationId,
      email,
      passwordHash: hash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });

    await this.audit.record({
      organizationId,
      actorId: user.id,
      eventType: 'admin.bootstrap',
      targetType: 'user',
      targetId: user.id,
      requestId: null,
      outcome: 'success',
      metadata: { method: 'cli' },
    });

    return { created: true, user: await this.toUserDto(user) };
  }

  // --- Projection --------------------------------------------------------------

  private async toUserDto(record: {
    id: string;
    email: string;
    role: string;
    status: string;
    lastPasswordChangedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<UserDto> {
    const permissions = await this.permissions.effectivePermissions(record.role);
    return {
      id: record.id,
      email: record.email,
      role: record.role as UserDto['role'],
      permissions,
      status: record.status as UserDto['status'],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      lastPasswordChangedAt: record.lastPasswordChangedAt?.toISOString() ?? null,
    };
  }
}
