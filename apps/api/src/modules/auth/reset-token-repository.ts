import type { PrismaClient } from '@prisma/client';
import { generateOpaqueToken, sha256Hex } from '../../lib/password.js';

/**
 * Data access for password-reset tokens.
 *
 * The plaintext token exists only in memory (and, once, inside the email).
 * The database stores the SHA-256 hash, so a leaked `password_reset_tokens`
 * table does not hand an attacker reusable credentials.
 */

export interface ResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface CreateResetTokenResult {
  /** Plaintext token — safe to put in the email body; never store it. */
  token: string;
  /** How long the token stays usable. */
  expiresAt: Date;
}

export class PrismaPasswordResetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createForUser(userId: string, lifetimeMinutes: number): Promise<CreateResetTokenResult> {
    const token = generateOpaqueToken(32);
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + lifetimeMinutes * 60 * 1000);

    // Single-active-token policy: any outstanding, un-consumed token for this
    // user is consumed now, so at most one reset is in flight.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
    return { token, expiresAt };
  }

  /** Find an unconsumed, unexpired record for the given hash. */
  async findActiveByHash(tokenHash: string): Promise<ResetTokenRecord | null> {
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row || row.consumedAt !== null) return null;
    if (row.expiresAt.getTime() <= Date.now()) return null;
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
    };
  }

  /** Mark a token consumed. Returns false when it was already consumed or
   *  unknown, so the caller can distinguish "already used" from "valid". */
  async consume(tokenHash: string): Promise<boolean> {
    const result = await this.prisma.passwordResetToken.updateMany({
      where: { tokenHash, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return result.count > 0;
  }

  /** Housekeeping: drop tokens that are past their expiry. */
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: new Date() }, consumedAt: null },
    });
    return result.count;
  }
}
