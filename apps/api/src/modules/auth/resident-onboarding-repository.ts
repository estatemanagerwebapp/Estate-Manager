import type { PrismaClient } from '@prisma/client';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from '../../lib/password.js';

/**
 * Data access for resident onboarding drafts (the persistent-code model).
 *
 * The draft row is created by an admin (first name + property, optional
 * email/phone) and holds all resident-completed state until the payment
 * gate is passed. The access code is persistent: no TTL, no attempt cap,
 * not single-use. Only its SHA-256 hash is stored; lookups are done in
 * constant time so a wrong code costs the same as a right one.
 */

export interface ResidentOnboardingRecord {
  id: string;
  organizationId: string;
  propertyId: string;
  status: 'PENDING' | 'COMPLETED';
  /** Plaintext onboarding code (re-shareable); null for rows created before
   *  this field was added. Only shown to admins on the Residents screen. */
  onboardingCode: string | null;
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
  /** Soft-archive timestamp; null while the record is active. */
  archivedAt: Date | null;
  /** Status of the linked portal account; null while no account exists. */
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateResidentOnboardingInput {
  organizationId: string;
  propertyId: string;
  firstName: string;
  email: string | null;
  phone: string | null;
  userId?: string | null;
}

export interface CreateResidentOnboardingResult {
  record: ResidentOnboardingRecord;
  /** Plaintext code — hand it to the resident; only the hash is stored. */
  code: string;
}

export interface SaveResidentDraftInput {
  id: string;
  gender?: string | null;
  maritalStatus?: string | null;
  propertyType?: string | null;
  nextOfKinName?: string | null;
  nextOfKinPhone?: string | null;
  nextOfKinEmail?: string | null;
  idType?: string | null;
  idDocumentUrl?: string | null;
}

export interface UpdateResidentAdminFieldsInput {
  id: string;
  firstName?: string;
  email?: string | null;
  phone?: string | null;
  propertyId?: string;
}

/**
 * Generate a human-readable onboarding code: digits + unambiguous letters
 * (no 0/O, 1/I) so read-aloud codes are not confused. `length` chars.
 */
export function generateResidentCode(length: number): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const random = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const index = random.readUInt8(i) % alphabet.length;
    code += alphabet[index];
  }
  return code;
}

type PrismaResidentRow = {
  id: string;
  organizationId: string;
  propertyId: string;
  status: string;
  onboardingCode: string | null;
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
  paymentStatus: string;
  paymentRef: string | null;
  paidAt: Date | null;
  userId: string | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  user?: { status: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(row: PrismaResidentRow): ResidentOnboardingRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    propertyId: row.propertyId,
    status: row.status as 'PENDING' | 'COMPLETED',
    onboardingCode: row.onboardingCode ?? null,
    firstName: row.firstName,
    email: row.email,
    phone: row.phone,
    gender: row.gender,
    maritalStatus: row.maritalStatus,
    propertyType: row.propertyType,
    nextOfKinName: row.nextOfKinName,
    nextOfKinPhone: row.nextOfKinPhone,
    nextOfKinEmail: row.nextOfKinEmail,
    idType: row.idType,
    idDocumentUrl: row.idDocumentUrl,
    paymentStatus: row.paymentStatus as 'UNPAID' | 'PAID',
    paymentRef: row.paymentRef,
    paidAt: row.paidAt,
    userId: row.userId,
    completedAt: row.completedAt,
    archivedAt: row.archivedAt,
    accountStatus: (row.user?.status as ResidentOnboardingRecord['accountStatus']) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaResidentOnboardingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    input: CreateResidentOnboardingInput,
    codeLength: number,
  ): Promise<CreateResidentOnboardingResult> {
    const code = generateResidentCode(codeLength);
    const row = await this.prisma.residentOnboarding.create({
      data: {
        organizationId: input.organizationId,
        propertyId: input.propertyId,
        codeHash: sha256Hex(code),
        onboardingCode: code,
        firstName: input.firstName,
        email: input.email,
        phone: input.phone,
        userId: input.userId ?? null,
      },
    });
    return { record: toRecord(row), code };
  }

  /**
   * Persistent code lookup. Loads every PENDING draft for the organization
   * and compares hashes with a constant-time check; a wrong code takes the
   * same time as a right one so the endpoint does not leak which codes
   * exist.
   */
  async findByCode(code: string, organizationId: string): Promise<ResidentOnboardingRecord | null> {
    const targetHash = sha256Hex(code);
    const rows = await this.prisma.residentOnboarding.findMany({
      where: { organizationId, status: 'PENDING', archivedAt: null },
    });
    for (const row of rows) {
      if (constantTimeEqualsHex(row.codeHash, targetHash)) {
        return toRecord(row);
      }
    }
    // Burn the remaining comparisons even on a miss so timing does not
    // depend on where the match (or lack of one) occurred.
    for (let i = 0; i < 8; i += 1) {
      timingSafeEqual(Buffer.alloc(64), Buffer.alloc(64));
    }
    return null;
  }

  async findById(id: string): Promise<ResidentOnboardingRecord | null> {
    const row = await this.prisma.residentOnboarding.findUnique({
      where: { id },
      include: { user: { select: { status: true } } },
    });
    return row ? toRecord(row) : null;
  }

  async listByOrganization(organizationId: string): Promise<ResidentOnboardingRecord[]> {
    const rows = await this.prisma.residentOnboarding.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { status: true } } },
    });
    return rows.map(toRecord);
  }

  /** Drafts waiting for the resident to finish onboarding. */
  async countPending(organizationId: string): Promise<number> {
    return this.prisma.residentOnboarding.count({
      where: { organizationId, status: 'PENDING', archivedAt: null },
    });
  }

  /** Non-archived drafts (pending + completed-but-not-archived). */
  async countActive(organizationId: string): Promise<number> {
    return this.prisma.residentOnboarding.count({
      where: { organizationId, archivedAt: null },
    });
  }

  /** Operator edit of the admin-owned fields. Omitted fields stay unchanged. */
  async updateAdminFields(
    input: UpdateResidentAdminFieldsInput,
  ): Promise<ResidentOnboardingRecord | null> {
    const row = await this.prisma.residentOnboarding.update({
      where: { id: input.id },
      data: {
        firstName: input.firstName ?? undefined,
        email: input.email === undefined ? undefined : input.email,
        phone: input.phone === undefined ? undefined : input.phone,
        propertyId: input.propertyId ?? undefined,
      },
      include: { user: { select: { status: true } } },
    });
    return toRecord(row);
  }

  /** Set or clear the soft-archive timestamp. */
  async setArchived(id: string, archivedAt: Date | null): Promise<ResidentOnboardingRecord | null> {
    const row = await this.prisma.residentOnboarding.update({
      where: { id },
      data: { archivedAt },
      include: { user: { select: { status: true } } },
    });
    return toRecord(row);
  }

  async saveDraft(input: SaveResidentDraftInput): Promise<ResidentOnboardingRecord | null> {
    const row = await this.prisma.residentOnboarding.update({
      where: { id: input.id },
      data: {
        gender: input.gender ?? undefined,
        maritalStatus: input.maritalStatus ?? undefined,
        propertyType: input.propertyType ?? undefined,
        nextOfKinName: input.nextOfKinName ?? undefined,
        nextOfKinPhone: input.nextOfKinPhone ?? undefined,
        nextOfKinEmail: input.nextOfKinEmail ?? undefined,
        idType: input.idType ?? undefined,
        idDocumentUrl: input.idDocumentUrl ?? undefined,
      },
    });
    return toRecord(row);
  }

  async markPaid(id: string, paymentRef: string | null): Promise<ResidentOnboardingRecord | null> {
    const row = await this.prisma.residentOnboarding.update({
      where: { id },
      data: {
        paymentStatus: 'PAID',
        paymentRef,
        paidAt: new Date(),
      },
    });
    return toRecord(row);
  }

  /**
   * Records the resident's out-of-band payment reference (guest submission).
   * The draft stays UNPAID — the administrator verifies and confirms it.
   * Re-submitting overwrites the previous note.
   */
  async savePaymentNote(
    id: string,
    paymentRef: string | null,
  ): Promise<ResidentOnboardingRecord | null> {
    const row = await this.prisma.residentOnboarding.update({
      where: { id },
      data: { paymentRef },
    });
    return toRecord(row);
  }

  /**
   * Find the onboarding draft linked to a completed account. A resident has
   * at most one draft; the link is set when the account is created.
   */
  async findByUser(userId: string): Promise<ResidentOnboardingRecord | null> {
    const row = await this.prisma.residentOnboarding.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { status: true } } },
    });
    return row ? toRecord(row) : null;
  }

  async findManyByUsers(userIds: readonly string[]): Promise<ResidentOnboardingRecord[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.residentOnboarding.findMany({
      where: { userId: { in: [...new Set(userIds)] }, status: 'COMPLETED', archivedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { user: { select: { status: true } } },
    });
    return rows.map(toRecord);
  }

  async linkUser(id: string, userId: string): Promise<ResidentOnboardingRecord | null> {
    const row = await this.prisma.residentOnboarding.update({
      where: { id },
      data: {
        userId,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
      include: { user: { select: { status: true } } },
    });
    return toRecord(row);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.residentOnboarding.delete({ where: { id } });
  }
}

function constantTimeEqualsHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
