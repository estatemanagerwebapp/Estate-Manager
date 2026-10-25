import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Data access for bulk import batches and rows. Prisma types stop at this
 * boundary (ADR-0001).
 *
 * The fingerprint is a SHA-256 hex digest of the uploaded file bytes; it is
 * the idempotency key for re-uploads and the basis for "duplicate file"
 * rejection of a second commit of the same workbook.
 */

export interface ImportBatchRecord {
  id: string;
  estateId: string;
  organizationId: string;
  filename: string;
  fingerprint: string;
  status: string;
  configVersion: number;
  counts: Record<string, number>;
  uploadedById: string;
  uploadedAt: Date;
  committedAt: Date | null;
}

export interface ImportRowRecord {
  id: string;
  batchId: string;
  rowNumber: number;
  status: string;
  errors: string[];
  propertyId: string | null;
  data: Record<string, unknown>;
}

export type CreateBatchInput = {
  estateId: string;
  organizationId: string;
  filename: string;
  fingerprint: string;
  configVersion: number;
  counts: Record<string, number>;
  uploadedById: string;
};

export type CreateRowInput = {
  batchId: string;
  rowNumber: number;
  status: string;
  errors: string[];
  data: Record<string, unknown>;
};

type BatchRow = Prisma.ImportBatchGetPayload<{
  select: {
    id: true;
    estateId: true;
    organizationId: true;
    filename: true;
    fingerprint: true;
    status: true;
    configVersion: true;
    counts: true;
    uploadedById: true;
    uploadedAt: true;
    committedAt: true;
  };
}>;

export class PrismaImportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createBatch(input: CreateBatchInput): Promise<ImportBatchRecord> {
    const row = await this.prisma.importBatch.create({
      data: {
        estateId: input.estateId,
        organizationId: input.organizationId,
        filename: input.filename,
        fingerprint: input.fingerprint,
        configVersion: input.configVersion,
        counts: input.counts as Prisma.InputJsonValue,
        uploadedById: input.uploadedById,
      },
    });
    return toBatchRecord(row);
  }

  async createRows(rows: CreateRowInput[]): Promise<ImportRowRecord[]> {
    if (rows.length === 0) return [];
    // Chunked inserts keep the SQL statement small and the row batch atomic
    // when the caller runs this inside a transaction.
    const chunkSize = 500;
    const result: ImportRowRecord[] = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const rowNumbers = chunk.map((row) => row.rowNumber);
      await this.prisma.importRow.createMany({
        data: chunk.map((row) => ({
          batchId: row.batchId,
          rowNumber: row.rowNumber,
          status: row.status,
          errors: row.errors as Prisma.InputJsonValue,
          data: row.data as Prisma.InputJsonValue,
        })),
        skipDuplicates: false,
      });
      // createMany does not return the ids; fetch them back for the batch.
      // The row numbers are unique per batch, so this lookup is deterministic.
      const fetched = await this.prisma.importRow.findMany({
        where: { batchId: chunk[0]?.batchId ?? '', rowNumber: { in: rowNumbers } },
      });
      for (const record of fetched) {
        result.push(toRowRecord(record));
      }
    }
    return result;
  }

  async findBatchByFingerprint(
    organizationId: string,
    fingerprint: string,
  ): Promise<ImportBatchRecord | null> {
    const row = await this.prisma.importBatch.findFirst({
      where: { organizationId, fingerprint },
    });
    return row ? toBatchRecord(row) : null;
  }

  async findById(batchId: string, organizationId?: string): Promise<ImportBatchRecord | null> {
    const row = await this.prisma.importBatch.findFirst({
      where: {
        id: batchId,
        ...(organizationId ? { organizationId } : {}),
      },
    });
    return row ? toBatchRecord(row) : null;
  }

  async listByEstate(estateId: string, organizationId: string): Promise<ImportBatchRecord[]> {
    const rows = await this.prisma.importBatch.findMany({
      where: { estateId, organizationId },
      orderBy: [{ uploadedAt: 'desc' }],
    });
    return rows.map(toBatchRecord);
  }

  async rowsForBatch(batchId: string): Promise<ImportRowRecord[]> {
    const rows = await this.prisma.importRow.findMany({
      where: { batchId },
      orderBy: [{ rowNumber: 'asc' }],
    });
    return rows.map(toRowRecord);
  }

  /** Update a batch's status + counts (used at commit / commit-failure). */
  async updateBatch(
    batchId: string,
    update: { status?: string; counts?: Record<string, number>; committedAt?: Date },
  ): Promise<ImportBatchRecord | null> {
    const row = await this.prisma.importBatch.update({
      where: { id: batchId },
      data: {
        ...(update.status ? { status: update.status } : {}),
        ...(update.counts !== undefined ? { counts: update.counts as Prisma.InputJsonValue } : {}),
        ...(update.committedAt ? { committedAt: update.committedAt } : {}),
      },
    });
    return toBatchRecord(row);
  }

  /**
   * Mark valid rows as CREATED with their property ids, in one bounded
   * transaction alongside the property inserts. Runs on the tx client.
   */
  async markRowsCreated(
    tx: Prisma.TransactionClient,
    updates: Array<{ rowId: string; propertyId: string }>,
  ): Promise<void> {
    if (updates.length === 0) return;
    for (const update of updates) {
      await tx.importRow.update({
        where: { id: update.rowId },
        data: { status: 'CREATED', propertyId: update.propertyId },
      });
    }
  }

  /**
   * Acquire an exclusive row lock on a batch so concurrent commits of the
   * same batch are serialized. A second caller blocks until the first
   * transaction finishes (commit or abort), then re-reads the status and
   * fails with 409 if the batch is no longer PREVIEWED.
   */
  async lockBatch(
    tx: Prisma.TransactionClient,
    batchId: string,
  ): Promise<ImportBatchRecord | null> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
        counts: unknown;
        estate_id: string;
        organization_id: string;
        filename: string;
        fingerprint: string;
        config_version: number;
        uploaded_by_id: string;
        uploaded_at: Date;
        committed_at: Date | null;
      }>
    >`
      SELECT id, estate_id, organization_id, filename, fingerprint, status, config_version, counts, uploaded_by_id, uploaded_at, committed_at
      FROM import_batches
      WHERE id = ${batchId}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0) return null;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      estateId: row.estate_id,
      organizationId: row.organization_id,
      filename: row.filename,
      fingerprint: row.fingerprint,
      status: row.status,
      configVersion: row.config_version,
      counts: (row.counts ?? {}) as Record<string, number>,
      uploadedById: row.uploaded_by_id,
      uploadedAt: row.uploaded_at,
      committedAt: row.committed_at,
    };
  }

  /**
   * Mark rows that collided with an existing property as DUPLICATE_EXISTING.
   * Runs on the tx client so the row status stays consistent with the
   * property inserts in the same transaction.
   */
  async markRowsSkipped(tx: Prisma.TransactionClient, rowIds: string[]): Promise<void> {
    if (rowIds.length === 0) return;
    await tx.importRow.updateMany({
      where: { id: { in: rowIds } },
      data: { status: 'DUPLICATE_EXISTING' },
    });
  }
}

function toBatchRecord(row: BatchRow): ImportBatchRecord {
  return {
    id: row.id,
    estateId: row.estateId,
    organizationId: row.organizationId,
    filename: row.filename,
    fingerprint: row.fingerprint,
    status: row.status,
    configVersion: row.configVersion,
    counts: (row.counts ?? {}) as Record<string, number>,
    uploadedById: row.uploadedById,
    uploadedAt: row.uploadedAt,
    committedAt: row.committedAt,
  };
}

function toRowRecord(row: {
  id: string;
  batchId: string;
  rowNumber: number;
  status: string;
  errors: unknown;
  propertyId: string | null;
  data: unknown;
}): ImportRowRecord {
  return {
    id: row.id,
    batchId: row.batchId,
    rowNumber: row.rowNumber,
    status: row.status,
    errors: (row.errors ?? []) as string[],
    propertyId: row.propertyId,
    data: (row.data ?? {}) as Record<string, unknown>,
  };
}
