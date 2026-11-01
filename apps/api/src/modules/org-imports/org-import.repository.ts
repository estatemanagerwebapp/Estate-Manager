import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { OrgImportCounts, OrgImportSheet } from '@silverstone/shared';

export interface OrgImportBatchRecord {
  id: string;
  organizationId: string;
  filename: string;
  fingerprint: string;
  status: string;
  counts: OrgImportCounts;
  uploadedById: string;
  uploadedAt: Date;
  committedAt: Date | null;
}

export interface OrgImportRowRecord {
  id: string;
  batchId: string;
  sheet: OrgImportSheet;
  rowNumber: number;
  status: string;
  errors: string[];
  data: Record<string, unknown>;
  reference: string;
  entityType: string | null;
  entityId: string | null;
}

export interface OrgImportResidentRef {
  id: string;
  email: string;
  propertyId: string | null;
  propertyIdentifier: string | null;
  estateSlug: string | null;
}

export interface OrgImportValidationContext {
  /** Existing estates by lowercase slug. */
  estatesBySlug: Map<string, { id: string; slug: string; status: string }>;
  /** Existing properties keyed `estateSlug\0identifier`. */
  propertiesByKey: Map<
    string,
    { id: string; identifier: string; status: string; estateSlug: string }
  >;
  /** Existing active facility names, keyed `estateSlug\0lowercase(name)`. */
  facilityNames: Set<string>;
  /** Active resident users by lowercase email. */
  activeResidentsByEmail: Map<string, OrgImportResidentRef>;
  /** Every user email (any role/status) plus non-archived onboarding emails. */
  usedEmails: Set<string>;
  /** Non-void invoice keys `userId\0period\0amountKobo` for the candidate emails. */
  invoiceKeys: Set<string>;
}

export interface OrgImportRowInput {
  batchId: string;
  sheet: OrgImportSheet;
  rowNumber: number;
  status: string;
  errors: string[];
  data: Record<string, unknown>;
  reference: string;
}

function propertyKey(estateSlug: string, identifier: string): string {
  return `${estateSlug}\u0000${identifier}`;
}

function invoiceKey(userId: string, period: string, amountKobo: number): string {
  return `${userId}\u0000${period}\u0000${amountKobo}`;
}

export { propertyKey, invoiceKey };

export class PrismaOrgImportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBatchByFingerprint(
    organizationId: string,
    fingerprint: string,
  ): Promise<OrgImportBatchRecord | null> {
    const row = await this.prisma.organizationImportBatch.findUnique({
      where: { organizationId_fingerprint: { organizationId, fingerprint } },
    });
    return row ? toBatchRecord(row) : null;
  }

  async createBatch(input: {
    organizationId: string;
    filename: string;
    fingerprint: string;
    counts: OrgImportCounts;
    uploadedById: string;
  }): Promise<OrgImportBatchRecord> {
    const row = await this.prisma.organizationImportBatch.create({
      data: {
        organizationId: input.organizationId,
        filename: input.filename,
        fingerprint: input.fingerprint,
        counts: input.counts as unknown as Prisma.InputJsonValue,
        uploadedById: input.uploadedById,
      },
    });
    return toBatchRecord(row);
  }

  async createRows(rows: OrgImportRowInput[]): Promise<void> {
    if (rows.length === 0) return;
    await this.prisma.organizationImportRow.createMany({
      data: rows.map((row) => ({
        batchId: row.batchId,
        sheet: row.sheet,
        rowNumber: row.rowNumber,
        status: row.status,
        errors: row.errors as unknown as Prisma.InputJsonValue,
        data: row.data as unknown as Prisma.InputJsonValue,
        reference: row.reference,
      })),
    });
  }

  async deleteBatch(batchId: string): Promise<void> {
    await this.prisma.organizationImportBatch.delete({ where: { id: batchId } });
  }

  async updateBatchInTx(
    tx: Prisma.TransactionClient,
    batchId: string,
    input: { status: string; counts: OrgImportCounts; committedAt: Date | null },
  ): Promise<void> {
    await tx.organizationImportBatch.update({
      where: { id: batchId },
      data: {
        status: input.status,
        counts: input.counts as unknown as Prisma.InputJsonValue,
        committedAt: input.committedAt,
      },
    });
  }

  async rowsForBatch(batchId: string): Promise<OrgImportRowRecord[]> {
    const rows = await this.prisma.organizationImportRow.findMany({
      where: { batchId },
      orderBy: [{ sheet: 'asc' }, { rowNumber: 'asc' }],
    });
    return rows.map(toRowRecord);
  }

  async findById(batchId: string, organizationId: string): Promise<OrgImportBatchRecord | null> {
    const row = await this.prisma.organizationImportBatch.findFirst({
      where: { id: batchId, organizationId },
    });
    return row ? toBatchRecord(row) : null;
  }

  async listByOrganization(organizationId: string, limit = 25): Promise<OrgImportBatchRecord[]> {
    const rows = await this.prisma.organizationImportBatch.findMany({
      where: { organizationId },
      orderBy: [{ uploadedAt: 'desc' }],
      take: limit,
    });
    return rows.map(toBatchRecord);
  }

  async updateBatch(
    batchId: string,
    input: {
      status: string;
      counts?: OrgImportCounts;
      committedAt?: Date | null;
    },
  ): Promise<void> {
    await this.prisma.organizationImportBatch.update({
      where: { id: batchId },
      data: {
        status: input.status,
        ...(input.counts ? { counts: input.counts as unknown as Prisma.InputJsonValue } : {}),
        ...(input.committedAt !== undefined ? { committedAt: input.committedAt } : {}),
      },
    });
  }

  async lockBatch(
    tx: Prisma.TransactionClient,
    batchId: string,
  ): Promise<OrgImportBatchRecord | null> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        organization_id: string;
        filename: string;
        fingerprint: string;
        status: string;
        counts: unknown;
        uploaded_by_id: string;
        uploaded_at: Date;
        committed_at: Date | null;
      }>
    >`
      SELECT id, organization_id, filename, fingerprint, status, counts,
             uploaded_by_id, uploaded_at, committed_at
      FROM organization_import_batches
      WHERE id = ${batchId}::uuid
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organization_id,
      filename: row.filename,
      fingerprint: row.fingerprint,
      status: row.status,
      counts: (row.counts ?? {}) as OrgImportCounts,
      uploadedById: row.uploaded_by_id,
      uploadedAt: row.uploaded_at,
      committedAt: row.committed_at,
    };
  }

  async markRowsCreated(
    tx: Prisma.TransactionClient,
    updates: Array<{ rowId: string; entityType: string; entityId: string }>,
  ): Promise<void> {
    for (const update of updates) {
      await tx.organizationImportRow.update({
        where: { id: update.rowId },
        data: {
          status: 'CREATED',
          entityType: update.entityType,
          entityId: update.entityId,
        },
      });
    }
  }

  async markRowsCollision(
    tx: Prisma.TransactionClient,
    updates: Array<{ rowId: string; message: string }>,
  ): Promise<void> {
    for (const update of updates) {
      const existing = await tx.organizationImportRow.findUnique({
        where: { id: update.rowId },
        select: { errors: true },
      });
      const previous = Array.isArray(existing?.errors) ? existing.errors : [];
      await tx.organizationImportRow.update({
        where: { id: update.rowId },
        data: {
          status: 'COLLISION',
          errors: [...previous, update.message] as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  /** Snapshot used by the parser. Query volume is bounded by organization size. */
  async loadValidationContext(
    organizationId: string,
    billsheetEmails: string[],
  ): Promise<OrgImportValidationContext> {
    const [estates, properties, facilities, users, onboardingEmails] = await Promise.all([
      this.prisma.estate.findMany({
        where: { organizationId },
        select: { id: true, slug: true, status: true },
      }),
      this.prisma.property.findMany({
        where: { organizationId },
        select: {
          id: true,
          identifier: true,
          status: true,
          estate: { select: { slug: true } },
        },
      }),
      this.prisma.facility.findMany({
        where: { organizationId, archivedAt: null },
        select: {
          name: true,
          estate: { select: { slug: true } },
        },
      }),
      this.prisma.user.findMany({
        where: { organizationId, role: 'RESIDENT', status: 'ACTIVE' },
        select: {
          id: true,
          email: true,
          residentOnboardings: {
            where: { archivedAt: null },
            select: {
              propertyId: true,
              property: {
                select: {
                  identifier: true,
                  estate: { select: { slug: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.residentOnboarding.findMany({
        where: { organizationId, archivedAt: null },
        select: { email: true },
      }),
    ]);

    const allEmails = await this.prisma.user.findMany({
      where: { organizationId },
      select: { email: true },
    });

    const estatesBySlug = new Map<string, { id: string; slug: string; status: string }>();
    for (const estate of estates) {
      estatesBySlug.set(estate.slug.toLowerCase(), {
        id: estate.id,
        slug: estate.slug,
        status: estate.status,
      });
    }

    const propertiesByKey = new Map<
      string,
      { id: string; identifier: string; status: string; estateSlug: string }
    >();
    for (const property of properties) {
      const estateSlug = property.estate.slug.toLowerCase();
      propertiesByKey.set(propertyKey(estateSlug, property.identifier), {
        id: property.id,
        identifier: property.identifier,
        status: property.status,
        estateSlug,
      });
    }

    const facilityNames = new Set<string>();
    for (const facility of facilities) {
      facilityNames.add(
        `${facility.estate.slug.toLowerCase()}\u0000${facility.name.trim().toLowerCase()}`,
      );
    }

    const activeResidentsByEmail = new Map<string, OrgImportResidentRef>();
    for (const user of users) {
      const onboarding = user.residentOnboardings[0];
      activeResidentsByEmail.set(user.email.toLowerCase(), {
        id: user.id,
        email: user.email,
        propertyId: onboarding?.propertyId ?? null,
        propertyIdentifier: onboarding?.property?.identifier ?? null,
        estateSlug: onboarding?.property?.estate.slug.toLowerCase() ?? null,
      });
    }

    const usedEmails = new Set<string>();
    for (const user of allEmails) usedEmails.add(user.email.toLowerCase());
    for (const draft of onboardingEmails) {
      if (draft.email) usedEmails.add(draft.email.toLowerCase());
    }

    const invoiceKeys = new Set<string>();
    const candidateEmails = new Set(billsheetEmails.map((email) => email.toLowerCase()));
    const candidateUserIds = users
      .filter((user) => candidateEmails.has(user.email.toLowerCase()))
      .map((user) => user.id);
    if (candidateUserIds.length > 0) {
      const invoices = await this.prisma.invoice.findMany({
        where: {
          organizationId,
          userId: { in: candidateUserIds },
          status: { not: 'VOID' },
        },
        select: { userId: true, period: true, amountKobo: true },
      });
      for (const invoice of invoices) {
        invoiceKeys.add(invoiceKey(invoice.userId, invoice.period, invoice.amountKobo));
      }
    }

    return {
      estatesBySlug,
      propertiesByKey,
      facilityNames,
      activeResidentsByEmail,
      usedEmails,
      invoiceKeys,
    };
  }

  async listEstateRefs(
    organizationId: string,
  ): Promise<Array<{ slug: string; name: string; status: string }>> {
    return this.prisma.estate.findMany({
      where: { organizationId },
      select: { slug: true, name: true, status: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Insert an estate, or return null when the slug already exists. Raw
   * `ON CONFLICT DO NOTHING` keeps a concurrent duplicate from aborting the
   * batch transaction.
   */
  async createEstateInTx(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      slug: string;
      name: string;
      address: string | null;
      status: string;
    },
  ): Promise<string | null> {
    const id = randomUUID();
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO estates (id, organization_id, slug, name, address, status, created_at, updated_at)
      VALUES (
        ${id}::uuid,
        ${input.organizationId}::uuid,
        ${input.slug},
        ${input.name},
        ${input.address},
        ${input.status},
        now(),
        now()
      )
      ON CONFLICT (organization_id, slug) DO NOTHING
      RETURNING id
    `;
    return rows[0]?.id ?? null;
  }

  async createFacilityInTx(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      estateId: string;
      name: string;
      description: string;
      bookable: boolean;
      usageFeeKobo: number;
    },
  ): Promise<string> {
    const row = await tx.facility.create({
      data: {
        organizationId: input.organizationId,
        estateId: input.estateId,
        name: input.name,
        description: input.description,
        bookable: input.bookable,
        usageFeeKobo: input.usageFeeKobo,
      },
      select: { id: true },
    });
    return row.id;
  }

  async createResidentDraftInTx(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      estateId: string;
      propertyId: string;
      firstName: string;
      email: string;
      phone: string | null;
      codeHash: string;
      onboardingCode: string;
    },
  ): Promise<string> {
    const row = await tx.residentOnboarding.create({
      data: {
        organizationId: input.organizationId,
        estateId: input.estateId,
        propertyId: input.propertyId,
        firstName: input.firstName,
        email: input.email,
        phone: input.phone,
        codeHash: input.codeHash,
        onboardingCode: input.onboardingCode,
      },
      select: { id: true },
    });
    return row.id;
  }

  async createInvoiceInTx(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      userId: string;
      propertyId: string | null;
      period: string;
      amountKobo: number;
      dueAt: Date;
      status: string;
      createdById: string | null;
    },
  ): Promise<string> {
    const row = await tx.invoice.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        propertyId: input.propertyId,
        period: input.period,
        amountKobo: input.amountKobo,
        currency: 'NGN',
        status: input.status,
        dueAt: input.dueAt,
        createdById: input.createdById,
      },
      select: { id: true },
    });
    return row.id;
  }
}

function toBatchRecord(row: {
  id: string;
  organizationId: string;
  filename: string;
  fingerprint: string;
  status: string;
  counts: unknown;
  uploadedById: string;
  uploadedAt: Date;
  committedAt: Date | null;
}): OrgImportBatchRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    filename: row.filename,
    fingerprint: row.fingerprint,
    status: row.status,
    counts: (row.counts ?? {}) as OrgImportCounts,
    uploadedById: row.uploadedById,
    uploadedAt: row.uploadedAt,
    committedAt: row.committedAt,
  };
}

function toRowRecord(row: {
  id: string;
  batchId: string;
  sheet: string;
  rowNumber: number;
  status: string;
  errors: unknown;
  data: unknown;
  reference: string;
  entityType: string | null;
  entityId: string | null;
}): OrgImportRowRecord {
  return {
    id: row.id,
    batchId: row.batchId,
    sheet: row.sheet as OrgImportSheet,
    rowNumber: row.rowNumber,
    status: row.status,
    errors: Array.isArray(row.errors) ? (row.errors as string[]) : [],
    data: (row.data ?? {}) as Record<string, unknown>,
    reference: row.reference,
    entityType: row.entityType,
    entityId: row.entityId,
  };
}
