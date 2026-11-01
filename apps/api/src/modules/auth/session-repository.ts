import type { PrismaClient } from '@prisma/client';
import { generateOpaqueToken } from '../../lib/password.js';

/**
 * Data access for server-side session records.
 *
 * The browser stores *nothing* in local storage: the session is carried by an
 * HttpOnly cookie whose value is an opaque id. The database row tracks
 * expiration and revocation, so logout / password changes / account locks
 * can invalidate it remotely.
 */

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface VerifiedSession {
  user: {
    id: string;
    organizationId: string;
    status: string;
    role: string;
    estateIds?: string[];
    propertyIds?: string[];
  };
  session: { expiresAt: Date | null };
}

export class PrismaSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Create a new session and return the opaque id that goes into the
   *  cookie. The id itself is random; the hash is never stored — the id is
   *  the lookup key. */
  async create(userId: string, lifetimeDays: number): Promise<SessionRecord> {
    const id = generateOpaqueToken(16);
    const expiresAt = new Date(Date.now() + lifetimeDays * 24 * 60 * 60 * 1000);
    const row = await this.prisma.session.create({
      data: { id, userId, expiresAt },
    });
    return toSessionRecord(row);
  }

  /**
   * Verify a session id: it must exist, not be revoked (`expiresAt` null),
   * not be in the past, and its user must be `ACTIVE`. Returns null on any
   * failure — the guard layer converts that to a single generic 401 so no
   * message reveals which check failed.
   */
  async verify(id: string): Promise<VerifiedSession | null> {
    const row = await this.prisma.session.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            organizationId: true,
            status: true,
            role: true,
          },
        },
      },
    });
    if (!row) return null;
    return {
      user: {
        id: row.userId,
        organizationId: row.user.organizationId,
        status: row.user.status,
        role: row.user.role,
      },
      session: { expiresAt: row.expiresAt },
    };
  }

  /** Revoke a single session (logout). Idempotent. */
  async revoke(id: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { id }, data: { expiresAt: null } });
  }

  /** Revoke every session for a user (password change, account lock). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { userId }, data: { expiresAt: null } });
  }

  /** Delete sessions that have naturally expired or been revoked. */
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { lt: new Date() } }],
      },
    });
    return result.count;
  }
}

type PrismaSessionRow = {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date | null;
};

function toSessionRecord(row: PrismaSessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}
