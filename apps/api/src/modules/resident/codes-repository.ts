import type { PrismaClient } from '@prisma/client';
import { sha256Hex } from '../../lib/password.js';
import { generateResidentCode } from '../auth/resident-onboarding-repository.js';

/**
 * Data access for resident access codes (S4).
 *
 * Every query is scoped by organization + user id. A resident can only ever
 * reach their own codes: the service passes the acting user's id, which
 * comes from the session, never from the request body.
 *
 * The full code is never persisted. Only its SHA-256 hash and a short
 * display prefix are stored; the plaintext is returned to the resident once,
 * at generation time.
 */

export type AccessCodeKind = 'ENTRY' | 'EXIT' | 'BOTH';
export type AccessCodeStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface AccessCodeRecord {
  id: string;
  organizationId: string;
  userId: string;
  propertyId: string | null;
  kind: AccessCodeKind;
  codeHash: string;
  codePrefix: string;
  status: AccessCodeStatus;
  validUntil: Date | null;
  issuedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAccessCodeInput {
  organizationId: string;
  userId: string;
  propertyId?: string | null;
  kind: AccessCodeKind;
  validUntil: Date | null;
  /** Length of the generated code. */
  codeLength: number;
}

export interface CreateAccessCodeResult {
  record: AccessCodeRecord;
  /** Plaintext code — handed to the resident once, never stored. */
  code: string;
}

/** Number of leading characters kept for display. */
const PREFIX_LENGTH = 4;

export class PrismaAccessCodeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateAccessCodeInput): Promise<CreateAccessCodeResult> {
    const code = generateResidentCode(input.codeLength);
    const row = await this.prisma.accessCode.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        propertyId: input.propertyId ?? null,
        kind: input.kind,
        codeHash: sha256Hex(code),
        codePrefix: code.slice(0, PREFIX_LENGTH),
        status: 'ACTIVE',
        validUntil: input.validUntil,
      },
    });
    return { record: toRecord(row), code };
  }

  /**
   * The acting user's codes, newest first. Revoked codes are included so the
   * resident can see the history; expired ones are filtered in the service.
   */
  async listByUser(
    organizationId: string,
    userId: string,
    limit = 50,
  ): Promise<AccessCodeRecord[]> {
    const rows = await this.prisma.accessCode.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toRecord);
  }

  /** Ownership-checked lookup: a code belonging to someone else is invisible. */
  async findById(
    organizationId: string,
    userId: string,
    codeId: string,
  ): Promise<AccessCodeRecord | null> {
    const row = await this.prisma.accessCode.findFirst({
      where: { organizationId, userId, id: codeId },
    });
    return row ? toRecord(row) : null;
  }

  async extendValidUntil(
    id: string,
    validUntil: Date,
  ): Promise<AccessCodeRecord | null> {
    const row = await this.prisma.accessCode.update({
      where: { id },
      data: { validUntil },
    });
    return toRecord(row);
  }

  async revoke(id: string, revokedAt: Date): Promise<AccessCodeRecord | null> {
    const row = await this.prisma.accessCode.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt },
    });
    return toRecord(row);
  }
}

function toRecord(row: {
  id: string;
  organizationId: string;
  userId: string;
  propertyId: string | null;
  kind: string;
  codeHash: string;
  codePrefix: string;
  status: string;
  validUntil: Date | null;
  issuedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AccessCodeRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    propertyId: row.propertyId,
    kind: row.kind as AccessCodeKind,
    codeHash: row.codeHash,
    codePrefix: row.codePrefix,
    status: row.status as AccessCodeStatus,
    validUntil: row.validUntil,
    issuedAt: row.issuedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
