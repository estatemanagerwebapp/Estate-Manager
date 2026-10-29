import type { PrismaClient } from '@prisma/client';
import {
  ROLE_KEYS,
  STAFF_ROLE_KEYS,
  isRoleKey,
  isStaffRole,
  ACCOUNT_STATUSES,
} from '@silverstone/shared';

/**
 * Data access for staff users. Prisma types stop at this boundary; callers
 * receive plain domain shapes so services never import `@prisma/client`
 * (ADR-0001 layered boundaries).
 */

export interface UserRecord {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  fullName: string | null;
  phone: string | null;
  role: string;
  status: string;
  mustChangePassword: boolean;
  lastPasswordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  organizationId: string;
  email: string;
  passwordHash: string;
  fullName: string | null;
  phone: string | null;
  role: string;
  status?: string;
  mustChangePassword?: boolean;
}

export interface UserQuery {
  organizationId: string;
  /** Optional role/status filters for the admin list. */
  role?: string;
  status?: string;
  /** Restrict the result to staff roles (Administrators screen). */
  staffOnly?: boolean;
  /** Case-insensitive email prefix search (admin convenience). */
  emailContains?: string;
}

export class PrismaUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(organizationId: string, email: string): Promise<UserRecord | null> {
    const normalized = email.toLowerCase();
    const row = await this.prisma.user.findFirst({
      where: { organizationId, email: normalized },
    });
    return row ? toUserRecord(row) : null;
  }

  async findById(organizationId: string, userId: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
    });
    return row ? toUserRecord(row) : null;
  }

  async list(query: UserQuery): Promise<UserRecord[]> {
    // `staffOnly` is the Administrators screen. An explicit role is
    // intersected with the staff set, so asking for RESIDENT on a staff list
    // returns nothing rather than leaking resident accounts into it.
    const roleFilter = query.staffOnly
      ? {
          role: {
            in: query.role ? (isStaffRole(query.role) ? [query.role] : []) : [...STAFF_ROLE_KEYS],
          },
        }
      : query.role
        ? { role: query.role }
        : {};

    const rows = await this.prisma.user.findMany({
      where: {
        organizationId: query.organizationId,
        ...roleFilter,
        ...(query.status ? { status: query.status } : {}),
        ...(query.emailContains ? { email: { contains: query.emailContains.toLowerCase() } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toUserRecord);
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const row = await this.prisma.user.create({
      data: {
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        role: input.role,
        status: input.status ?? 'ACTIVE',
        mustChangePassword: input.mustChangePassword ?? false,
        lastPasswordChangedAt: new Date(),
      },
    });
    return toUserRecord(row);
  }

  /** Set or replace the user's phone (profile edit). */
  async updatePhone(userId: string, phone: string | null): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { phone } });
  }

  /**
   * Operator edit of the identity fields shared with the resident draft.
   * Email is normalized exactly like login and account creation.
   */
  async updateProfile(
    userId: string,
    input: { email?: string; fullName?: string | null; phone?: string | null },
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: input.email === undefined ? undefined : input.email.toLowerCase(),
        fullName: input.fullName === undefined ? undefined : input.fullName,
        phone: input.phone === undefined ? undefined : input.phone,
      },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        lastPasswordChangedAt: new Date(),
      },
    });
  }

  async updateStatus(userId: string, status: string): Promise<void> {
    assertStatus(status);
    await this.prisma.user.update({ where: { id: userId }, data: { status } });
  }

  async updateRole(userId: string, role: string): Promise<void> {
    assertRole(role);
    await this.prisma.user.update({ where: { id: userId }, data: { role } });
  }

  /**
   * Permanently delete a user row. Sessions, reset tokens and audit events
   * are removed by their own foreign keys (or preserved for audit events).
   * The resident-onboarding link is set to null by the schema, so the
   * resident record survives an account deletion.
   */
  async delete(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async countByRole(organizationId: string, role: string): Promise<number> {
    assertRole(role);
    return this.prisma.user.count({ where: { organizationId, role } });
  }

  /** Active accounts for one role (used by the dashboard resident KPI). */
  async countActiveByRole(organizationId: string, role: string): Promise<number> {
    assertRole(role);
    return this.prisma.user.count({ where: { organizationId, role, status: 'ACTIVE' } });
  }

  async countAll(organizationId: string): Promise<number> {
    return this.prisma.user.count({ where: { organizationId } });
  }

  async hasSuperAdmin(organizationId: string): Promise<boolean> {
    const count = await this.prisma.user.count({
      where: { organizationId, role: 'SUPER_ADMIN' },
    });
    return count > 0;
  }

  /** True when the user is the organization's last active SUPER_ADMIN —
   *  used to prevent the last gatekeeper from being locked out. */
  async isLastActiveSuperAdmin(organizationId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true, role: true, status: true },
    });
    if (!row || row.organizationId !== organizationId) return false;
    if (row.role !== 'SUPER_ADMIN' || row.status !== 'ACTIVE') return false;
    const peers = await this.prisma.user.count({
      where: {
        organizationId,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        id: { not: userId },
      },
    });
    return peers === 0;
  }
}

export function assertRole(role: string): void {
  if (!isRoleKey(role)) {
    throw new Error(`Unknown role "${role}". Expected one of ${ROLE_KEYS.join(', ')}`);
  }
}

export function assertStatus(status: string): void {
  if (!(ACCOUNT_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Unknown status "${status}". Expected one of ${ACCOUNT_STATUSES.join(', ')}`);
  }
}

type PrismaUserRow = {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  fullName: string | null;
  phone: string | null;
  role: string;
  status: string;
  mustChangePassword: boolean;
  lastPasswordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toUserRecord(row: PrismaUserRow): UserRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    phone: row.phone,
    role: row.role,
    status: row.status,
    mustChangePassword: row.mustChangePassword,
    lastPasswordChangedAt: row.lastPasswordChangedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
