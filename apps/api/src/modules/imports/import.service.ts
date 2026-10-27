import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { PrismaEstateRepository, EstateRecord } from '../estates/estate-repository.js';
import type { PrismaPropertyRepository } from '../properties/property-repository.js';
import type {
  PrismaImportRepository,
  ImportBatchRecord,
  ImportRowRecord,
} from './import-repository.js';
import { DuplicateImportRowError } from './import-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import { parseWorkbook, type ParsedImportRow } from './excel-parser.js';
import { deriveIdentifier } from '../../lib/property-identifier.js';
import type { PropertyConfigSnapshot } from '../properties/property.service.js';
import type {
  ImportBatchDto,
  ImportRowDto,
  ImportPreviewResponse,
  ImportCommitResponse,
  ImportTemplateInfo,
} from '@silverstone/shared';

/**
 * Bulk property import: upload → parse → validate → preview → commit.
 *
 * The commit is the only path that writes property records, and it runs in a
 * single bounded Prisma transaction. Row outcomes and the batch status are
 * updated inside the same transaction so the database never holds a partial
 * "some rows created, batch still PREVIEWED" state.
 *
 * Identifier collisions are handled transaction-safely: the application
 * pre-checks against a snapshot of existing identifiers and against in-file
 * duplicates, and the database unique index on (estate_id, identifier) is
 * the authoritative backstop. The insert itself uses
 * `INSERT ... ON CONFLICT (estate_id, identifier) DO NOTHING`, so a
 * concurrent writer landing the same identifier between the pre-check and
 * the insert is silently skipped (the row is marked DUPLICATE_EXISTING) and
 * the transaction stays clean. No P2002 is ever raised inside the commit
 * transaction.
 */

export interface ImportServiceContext {
  organizationId: string;
  actorId: string | null;
  requestId: string | null;
}

/** Maximum data rows per workbook (header excluded). */
export const IMPORT_MAX_ROWS = 5000;

export class ImportService {
  constructor(
    private readonly imports: PrismaImportRepository,
    private readonly estates: PrismaEstateRepository,
    private readonly properties: PrismaPropertyRepository,
    private readonly audit: PrismaAuditRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Upload + parse + validate. Persists the batch + rows in PREVIEWED state.
   * No property records are written here.
   */
  async preview(
    context: ImportServiceContext,
    config: PropertyConfigSnapshot,
    input: {
      estateId: string;
      filename: string;
      /** Path to the uploaded .xlsx file on disk (multer temp path). */
      filePath: string;
    },
  ): Promise<ImportPreviewResponse> {
    const estate = await this.requireEstate(context.organizationId, input.estateId);

    const existingIdentifiers = await this.properties.identifiersByEstate(estate.id);

    const result = await parseWorkbook(input.filePath, {
      assetTypes: config.assetTypes.map((type) => ({
        key: type.key,
        label: type.label,
        active: type.active,
        detailKind: type.detailKind,
      })),
      propertyOptions: config.propertyOptions,
      estateSlug: estate.slug,
      estateId: estate.id,
      existingIdentifiers,
      renderIdentifier: ({ estateSlug, typeKey, addressComponents }) =>
        deriveIdentifier({
          estateSlug,
          typeKey,
          addressComponents,
          propertyOptions: config.propertyOptions,
        }),
      maxRows: IMPORT_MAX_ROWS,
    });

    // Hard reject if the workbook exceeds the row limit.
    if (result.rowLimitExceeded) {
      throw new AppError(
        400,
        'IMPORT_REJECTED',
        `The workbook contains more than ${IMPORT_MAX_ROWS} data rows. Split the file into multiple smaller files and upload them separately.`,
      );
    }

    // The fingerprint is the idempotency key for re-uploads. An open batch is
    // returned as-is (no duplicate rows); a terminal batch is refused so the
    // same workbook cannot be imported twice.
    const existingBatch = await this.imports.findBatchByFingerprint(
      context.organizationId,
      result.fingerprint,
    );
    if (existingBatch) {
      if (existingBatch.status === 'PREVIEWED') {
        const existingRows = await this.imports.rowsForBatch(existingBatch.id);
        return this.toPreviewResponse(estate, existingBatch, existingRows, config.configVersion);
      }
      throw new AppError(
        409,
        'CONFLICT',
        `This file has already been imported (batch ${existingBatch.id}). Upload a different workbook or delete that batch first.`,
      );
    }

    // Persist the batch + rows.
    const counts = aggregateCounts(result.rows);
    let batch: ImportBatchRecord;
    try {
      batch = await this.imports.createBatch({
        estateId: estate.id,
        organizationId: context.organizationId,
        filename: input.filename,
        fingerprint: result.fingerprint,
        configVersion: config.configVersion,
        counts,
        uploadedById: context.actorId ?? '',
      });
    } catch (error) {
      // Two concurrent uploads of the same workbook can both pass the
      // pre-check; the unique fingerprint index is the backstop. Surface a
      // 409 instead of a 500 (no P2002 ever escapes as a programmatic error).
      const isUniqueViolation =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'P2002';
      if (!isUniqueViolation) throw error;
      throw new AppError(
        409,
        'CONFLICT',
        'This file is already being imported. Wait for the existing batch to finish before uploading it again.',
        { cause: error },
      );
    }

    const rowInputs = result.rows.map((row) => {
      // Embed the derived identifier so the commit path can skip rows whose
      // identifier now collides with a live property.
      const identifier =
        row.status === 'VALID' || row.status === 'COLLISION'
          ? (deriveIdentifier({
              estateSlug: estate.slug,
              typeKey: row.raw['type'] ?? '',
              addressComponents: row.raw,
              propertyOptions: config.propertyOptions,
            }).identifier ?? '')
          : '';
      return {
        batchId: batch.id,
        rowNumber: row.rowNumber,
        status: row.status,
        errors: row.errors,
        data: {
          type: row.raw['type'] ?? '',
          __identifier: identifier,
          ...(row.legacySampleCandidate ? { __legacySampleCandidate: true } : {}),
          ...row.raw,
        },
      };
    });
    try {
      await this.imports.createRows(rowInputs);
    } catch (error) {
      // Rows and their batch are one logical preview unit. A row-number
      // uniqueness conflict must not leave an empty/retryable batch behind.
      await this.imports.deleteBatch(batch.id);
      if (error instanceof DuplicateImportRowError) {
        throw new AppError(409, 'CONFLICT', error.message, { cause: error });
      }
      throw error;
    }

    // Re-fetch to get the created row ids (createMany does not return ids).
    const batchRows = await this.imports.rowsForBatch(batch.id);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'import.previewed',
      targetType: 'import',
      targetId: batch.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        batchId: batch.id,
        total: counts.total,
        valid: counts.valid,
        error: counts.error,
      },
    });

    return this.toPreviewResponse(estate, batch, batchRows, config.configVersion);
  }

  private toPreviewResponse(
    estate: EstateRecord,
    batch: ImportBatchRecord,
    batchRows: ImportRowRecord[],
    activeConfigVersion: number,
  ): ImportPreviewResponse {
    // Config drift: if the active config version is ahead of the version pinned
    // at upload time, the batch must be re-validated.
    const configDrift = batch.configVersion < activeConfigVersion;
    const guidance = configDrift
      ? 'The organization configuration has changed since this file was uploaded. Re-upload the file to re-validate against the current configuration.'
      : undefined;

    return {
      batch: toBatchDto(batch, estate, batchRows, configDrift),
      rows: batchRows.map((row) => toRowDto(row)),
      configDrift,
      guidance,
    };
  }

  /**
   * Commit a previewed batch: all valid rows become property records in a
   * single transaction. Rolls back atomically on any failure.
   */
  async commit(
    context: ImportServiceContext,
    batchId: string,
    activeConfigVersion: number,
    confirmLegacySampleRows = false,
  ): Promise<ImportCommitResponse> {
    const batch = await this.imports.findById(batchId, context.organizationId);
    if (!batch) {
      throw new AppError(404, 'NOT_FOUND', 'Import batch not found');
    }
    if (batch.status === 'COMMITTED') {
      throw new AppError(409, 'CONFLICT', 'This batch has already been committed');
    }
    if (batch.status === 'COMMIT_FAILED') {
      throw new AppError(
        409,
        'CONFLICT',
        'This batch failed to commit. Re-validate the file and upload a fresh batch before committing.',
      );
    }
    if (batch.status === 'FAILED') {
      throw new AppError(
        409,
        'CONFLICT',
        'This batch is in a terminal failed state and cannot be committed',
      );
    }
    // Config drift: the batch was validated against an older configuration, so
    // committing it now would write identifiers/labels the current rules do not
    // allow. Refuse and force a re-upload (the preview flagged this already).
    if (batch.configVersion < activeConfigVersion) {
      throw new AppError(
        409,
        'CONFLICT',
        `The organization configuration changed since this file was uploaded (batch config v${batch.configVersion}, active v${activeConfigVersion}). Re-upload the file to re-validate it before committing.`,
      );
    }

    const estate = await this.estates.findById(context.organizationId, batch.estateId);
    if (!estate) {
      throw new AppError(404, 'NOT_FOUND', 'Estate not found');
    }

    const batchRows = await this.imports.rowsForBatch(batchId);
    const legacySampleRows = batchRows.filter(
      (row) => row.data['__legacySampleCandidate'] === true,
    );
    if (legacySampleRows.length > 0 && !confirmLegacySampleRows) {
      throw new AppError(
        409,
        'CONFLICT',
        `This legacy template contains ${legacySampleRows.length} sample-like row(s) at worksheet row(s) ${legacySampleRows.map((row) => row.rowNumber).join(', ')}. Review them and explicitly confirm before committing.`,
      );
    }
    const validRows = batchRows.filter((row) => row.status === 'VALID');
    const collisionRows = batchRows.filter((row) => row.status === 'COLLISION');

    // Load the active config for identifier rendering.
    const activeIdentifiers = await this.properties.identifiersByEstate(estate.id);

    // Re-check collisions against the live identifier set (the snapshot at
    // upload time may be stale). Rows that now collide are skipped, not
    // created.
    const collisionRowIds = new Set(
      [
        ...collisionRows,
        ...validRows.filter((row) => activeIdentifiers.has(identifierFromRow(row))),
      ].map((row) => row.id),
    );

    const toCreate = validRows.filter((row) => !collisionRowIds.has(row.id));

    const createdPropertyIds: string[] = [];
    const skipRowIds: string[] = [];

    try {
      await this.prisma.$transaction(async (tx) => {
        // Serialize same-batch commits: lock the batch row with FOR UPDATE so
        // a concurrent commit of the same batch blocks until this one
        // finishes, then re-reads the status and fails with 409.
        const locked = await this.imports.lockBatch(tx, batchId);
        if (!locked || locked.status !== 'PREVIEWED') {
          throw new AppError(
            409,
            'CONFLICT',
            'This batch has already been committed or is in a terminal state',
          );
        }

        // Create properties chunked (200 at a time) inside the transaction.
        // Each row uses INSERT ... ON CONFLICT (estate_id, identifier) DO
        // NOTHING via raw SQL so a concurrent write of the same identifier
        // never throws P2002 — the transaction stays clean and the row is
        // silently skipped (ADR-0007).
        const chunkSize = 200;
        const createdRowIdToPropertyId = new Map<string, string>();
        const conflictRowIds: string[] = [];

        for (let i = 0; i < toCreate.length; i += chunkSize) {
          const chunk = toCreate.slice(i, i + chunkSize);
          for (const row of chunk) {
            const identifier = identifierFromRow(row);
            const rowData = { ...row.data };
            delete rowData['__identifier'];
            const typeKey = row.data['type'] as string;
            const unitTypeKey = (rowData['unit_type_key'] as string) || null;

            const propertyId = await this.properties.createInTxSkipDuplicates(tx, {
              estateId: estate.id,
              organizationId: context.organizationId,
              identifier,
              typeKey,
              unitTypeKey,
              parentPropertyId: null,
              addressComponents: rowData as Record<string, string>,
              name: null,
            });

            if (propertyId !== null) {
              createdPropertyIds.push(propertyId);
              createdRowIdToPropertyId.set(row.id, propertyId);
            } else {
              // ON CONFLICT DO NOTHING skipped this row: the identifier
              // already exists (race between pre-check and insert).
              conflictRowIds.push(row.id);
            }
          }
        }

        // Mark created rows.
        if (createdRowIdToPropertyId.size > 0) {
          await this.imports.markRowsCreated(
            tx,
            [...createdRowIdToPropertyId.entries()].map(([rowId, propertyId]) => ({
              rowId,
              propertyId,
            })),
          );
        }

        // Mark rows that collided (both the pre-checked collisions and the
        // ON CONFLICT skips) as DUPLICATE_EXISTING so they are not lost.
        const allSkippedIds = [...new Set([...collisionRowIds, ...conflictRowIds])].filter(
          (id) => !createdRowIdToPropertyId.has(id),
        );
        if (allSkippedIds.length > 0) {
          await this.imports.markRowsSkipped(tx, allSkippedIds);
        }
        skipRowIds.push(...allSkippedIds);

        // Update batch status + counts atomically.
        const newCounts = {
          ...batch.counts,
          created: createdPropertyIds.length,
          skippedCollision: allSkippedIds.length,
        };
        await tx.importBatch.update({
          where: { id: batchId },
          data: {
            status: 'COMMITTED',
            counts: newCounts,
            committedAt: new Date(),
          },
        });
      });
    } catch (error) {
      // The transaction aborted. Mark the batch COMMIT_FAILED (outside the
      // aborted transaction, on a fresh connection) and re-throw so the
      // client receives a 500 envelope. No partial property state remains.
      const failedCounts = {
        ...batch.counts,
        failed: toCreate.length - createdPropertyIds.length,
      };
      await this.imports.updateBatch(batchId, {
        status: 'COMMIT_FAILED',
        counts: failedCounts,
      });
      await this.audit.record({
        organizationId: context.organizationId,
        actorId: context.actorId,
        eventType: 'import.commit_failed',
        targetType: 'import',
        targetId: batchId,
        requestId: context.requestId,
        outcome: 'failure',
        metadata: { batchId, reason: error instanceof Error ? error.message : 'unknown' },
      });
      if (error instanceof AppError) throw error;
      throw error;
    }

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'import.completed',
      targetType: 'import',
      targetId: batchId,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        batchId,
        created: createdPropertyIds.length,
        skippedCollision: skipRowIds.length,
      },
    });

    // Re-fetch the final batch + rows.
    const finalBatch = await this.imports.findById(batchId);
    const finalRows = await this.imports.rowsForBatch(batchId);
    const dto = toBatchDto(finalBatch!, estate, finalRows, false);

    return {
      batch: dto,
      createdPropertyIds,
    };
  }

  /**
   * Batch detail: the batch DTO plus persisted row results.
   */
  async detail(
    context: ImportServiceContext,
    batchId: string,
  ): Promise<{ batch: ImportBatchDto; rows: ImportRowDto[] }> {
    const batch = await this.imports.findById(batchId, context.organizationId);
    if (!batch) {
      throw new AppError(404, 'NOT_FOUND', 'Import batch not found');
    }
    const estate = await this.estates.findById(context.organizationId, batch.estateId);
    if (!estate) {
      throw new AppError(404, 'NOT_FOUND', 'Estate not found');
    }
    const rows = await this.imports.rowsForBatch(batchId);
    return {
      batch: toBatchDto(batch, estate, rows, false),
      rows: rows.map(toRowDto),
    };
  }

  /**
   * Lists the import batches for an estate (most recent first).
   */
  async list(
    context: ImportServiceContext,
    estateId: string,
  ): Promise<{ batches: ImportBatchDto[]; total: number }> {
    const batches = await this.imports.listByEstate(estateId, context.organizationId);
    const dtos: ImportBatchDto[] = [];
    for (const batch of batches) {
      const estate = await this.estates.findById(context.organizationId, batch.estateId);
      if (estate) {
        const rows = await this.imports.rowsForBatch(batch.id);
        dtos.push(toBatchDto(batch, estate, rows, false));
      }
    }
    return { batches: dtos, total: dtos.length };
  }

  /**
   * Generates a template workbook for the estate + active configuration.
   */
  async template(
    context: ImportServiceContext,
    config: PropertyConfigSnapshot,
    estateId: string,
  ): Promise<ImportTemplateInfo> {
    const estate = await this.requireEstate(context.organizationId, estateId);
    const columns = ['type', ...config.propertyOptions.addressComponents.map((c) => c.key)];
    return {
      estateId: estate.id,
      estateName: estate.name,
      configVersion: config.configVersion,
      columns,
      instructions:
        'One property per row. The "type" column must be a configured asset type key. ' +
        'Address component values must satisfy the configured format. ' +
        'The identifier is derived from the configured template at import time. ' +
        'The Properties worksheet contains headers only — add your own rows starting at row 2.',
    };
  }

  private async requireEstate(organizationId: string, estateId: string): Promise<EstateRecord> {
    const estate = await this.estates.findById(organizationId, estateId);
    if (!estate) {
      throw new AppError(404, 'NOT_FOUND', 'Estate not found');
    }
    return estate;
  }
}

// --- Helpers ------------------------------------------------------------------

function aggregateCounts(rows: ParsedImportRow[]): Record<string, number> {
  const counts: Record<string, number> = {
    total: rows.length,
    valid: 0,
    error: 0,
    duplicateInFile: 0,
    collision: 0,
    created: 0,
    skippedCollision: 0,
    failed: 0,
  };
  for (const row of rows) {
    const status = row.status;
    if (status === 'VALID') counts.valid = (counts.valid ?? 0) + 1;
    else if (status === 'ERROR') counts.error = (counts.error ?? 0) + 1;
    else if (status === 'DUPLICATE_IN_FILE')
      counts.duplicateInFile = (counts.duplicateInFile ?? 0) + 1;
    else if (status === 'COLLISION') counts.collision = (counts.collision ?? 0) + 1;
  }
  return counts;
}

/**
 * Derives the identifier for a persisted import row from the snapshot stored
 * at parse time (`row.data.__identifier`). Used during commit to skip rows
 * whose identifier now collides with a live property.
 */
function identifierFromRow(row: { data: Record<string, unknown> }): string {
  const identifier = row.data['__identifier'] as string | undefined;
  return identifier ?? '';
}

function toBatchDto(
  batch: ImportBatchRecord,
  estate: EstateRecord,
  rows: ImportRowRecord[],
  configDrift: boolean,
): ImportBatchDto {
  const counts = batch.counts ?? {};
  const createdCount = rows.filter((row) => row.status === 'CREATED').length;
  const skippedCount = rows.filter((row) => row.status === 'DUPLICATE_EXISTING').length;

  return {
    id: batch.id,
    estateId: batch.estateId,
    estateName: estate.name,
    filename: batch.filename,
    fingerprint: batch.fingerprint,
    status: batch.status as ImportBatchDto['status'],
    configVersion: batch.configVersion,
    configDrift,
    counts: {
      total: counts.total ?? rows.length,
      valid: counts.valid ?? 0,
      error: counts.error ?? 0,
      duplicateInFile: counts.duplicateInFile ?? 0,
      collision: counts.collision ?? 0,
      created: createdCount,
      skippedCollision: skippedCount,
      failed: counts.failed ?? 0,
    },
    uploadedById: batch.uploadedById,
    legacySampleRows: rows.filter((row) => row.data['__legacySampleCandidate'] === true).length,
    uploadedAt: batch.uploadedAt.toISOString(),
    committedAt: batch.committedAt?.toISOString() ?? null,
  };
}

function toRowDto(row: ImportRowRecord): ImportRowDto {
  return {
    id: row.id,
    batchId: row.batchId,
    rowNumber: row.rowNumber,
    status: row.status as ImportRowDto['status'],
    errors: row.errors,
    propertyId: row.propertyId,
  };
}
