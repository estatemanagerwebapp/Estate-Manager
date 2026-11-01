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
import {
  buildTemplate,
  IMPORT_COLUMNS,
  parseWorkbook,
  type ParsedImportRow,
} from './excel-parser.js';
import { deriveIdentifier } from '../../lib/property-identifier.js';
import type {
  HouseTypeRecord,
  PrismaHouseTypeRepository,
} from '../properties/house-type-repository.js';
import { normalizeAddressFields } from '../properties/property-rules.js';
import type { PropertyKind } from '@silverstone/shared';
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
    private readonly houseTypes: PrismaHouseTypeRepository,
    private readonly audit: PrismaAuditRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Upload + parse + validate. Persists the batch + rows in PREVIEWED state.
   * No property records are written here.
   */
  async preview(
    context: ImportServiceContext,
    configVersion: number,
    input: {
      estateId: string;
      filename: string;
      /** Uploaded workbook bytes. */
      buffer: Buffer;
    },
  ): Promise<ImportPreviewResponse> {
    const estate = await this.requireEstate(context.organizationId, input.estateId);
    const houseTypes = await this.houseTypes.listActive();
    const existingIdentifiers = await this.properties.identifiersByEstate(estate.id);

    const result = await parseWorkbook(input.buffer, {
      houseTypes,
      estateSlug: estate.slug,
      existingIdentifiers,
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
      estate.id,
      result.fingerprint,
    );
    if (existingBatch) {
      if (existingBatch.status === 'PREVIEWED') {
        const existingRows = await this.imports.rowsForBatch(existingBatch.id);
        return this.toPreviewResponse(estate, existingBatch, existingRows);
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
        configVersion,
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
      // Embed the normalized property payload and derived identifier so the
      // commit path does not need to re-interpret spreadsheet headers.
      const payload =
        row.status === 'VALID' || row.status === 'COLLISION'
          ? propertyFromRaw(row.raw, houseTypes, estate.slug)
          : null;
      return {
        batchId: batch.id,
        rowNumber: row.rowNumber,
        status: row.status,
        errors: row.errors,
        data: {
          ...row.raw,
          ...(payload
            ? {
                __kind: payload.kind,
                __house_type_key: payload.houseTypeKey,
                __identifier: payload.identifier,
                __fields: payload.fields,
              }
            : { __identifier: '' }),
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

    return this.toPreviewResponse(estate, batch, batchRows);
  }

  private toPreviewResponse(
    estate: EstateRecord,
    batch: ImportBatchRecord,
    batchRows: ImportRowRecord[],
  ): ImportPreviewResponse {
    // The property shape is no longer driven by the versioned organization
    // configuration, so config drift cannot invalidate a batch's property data.
    return {
      batch: toBatchDto(batch, estate, batchRows, false),
      rows: batchRows.map((row) => toRowDto(row)),
      configDrift: false,
      guidance: undefined,
    };
  }

  /**
   * Commit a previewed batch: all valid rows become property records in a
   * single transaction. Rolls back atomically on any failure.
   */
  async commit(context: ImportServiceContext, batchId: string): Promise<ImportCommitResponse> {
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
    const estate = await this.estates.findById(context.organizationId, batch.estateId);
    if (!estate) {
      throw new AppError(404, 'NOT_FOUND', 'Estate not found');
    }

    const batchRows = await this.imports.rowsForBatch(batchId);
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
            const kind = row.data['__kind'] as PropertyKind;
            const houseTypeKey = (row.data['__house_type_key'] as string | null) ?? null;
            const rawFields = (row.data['__fields'] ?? {}) as Record<string, unknown>;
            const fields = normalizeAddressFields({
              streetName: asText(rawFields['streetName']),
              houseNumber: asText(rawFields['houseNumber']),
              blockName: asText(rawFields['blockName']),
              floorNumber: asText(rawFields['floorNumber']),
              unitNumber: asText(rawFields['unitNumber']),
              plotNumber: asText(rawFields['plotNumber']),
              plotName: asText(rawFields['plotName']),
            });

            const propertyId = await this.properties.createInTxSkipDuplicates(tx, {
              estateId: estate.id,
              organizationId: context.organizationId,
              identifier,
              kind,
              houseTypeKey,
              streetName: fields.streetName ?? '',
              houseNumber: fields.houseNumber ?? null,
              blockName: fields.blockName ?? null,
              floorNumber: fields.floorNumber ?? null,
              unitNumber: fields.unitNumber ?? null,
              plotNumber: fields.plotNumber ?? null,
              plotName: fields.plotName ?? null,
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

  /** Active house types, used by the template route to describe allowed values. */
  async activeHouseTypes(): Promise<HouseTypeRecord[]> {
    return this.houseTypes.listActive();
  }

  /**
   * Template metadata for the estate. The actual workbook is built by the
   * route from the same static column list and house-type table.
   */
  async template(
    context: ImportServiceContext,
    configVersion: number,
    estateId: string,
  ): Promise<ImportTemplateInfo> {
    const estate = await this.requireEstate(context.organizationId, estateId);
    return {
      estateId: estate.id,
      estateName: estate.name,
      configVersion,
      columns: [...IMPORT_COLUMNS],
      instructions:
        'One property per row. The "type" column must be house, land, or both. ' +
        'House and both rows require "house_type"; land rows leave it blank. ' +
        'House rows use either house_number or block_name + floor_number + unit_number, ' +
        'depending on the selected house type. Land and both rows require plot_number and plot_name. ' +
        'The Properties worksheet contains headers only — add your own rows starting at row 2.',
    };
  }

  /** Build the header-only .xlsx template for an estate. */
  async templateWorkbook(
    context: ImportServiceContext,
    estateId: string,
    instructions: string,
  ): Promise<{ buffer: Promise<Buffer>; columns: string[] }> {
    const estate = await this.requireEstate(context.organizationId, estateId);
    const houseTypes = await this.houseTypes.listActive();
    return buildTemplate(estate, houseTypes, instructions);
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

function propertyFromRaw(
  raw: Record<string, string>,
  houseTypes: ReadonlyArray<HouseTypeRecord>,
  estateSlug: string,
): {
  identifier: string;
  kind: PropertyKind;
  houseTypeKey: string | null;
  fields: ReturnType<typeof normalizeAddressFields>;
} | null {
  const typeValue = (raw.type ?? '').trim().toLowerCase();
  const kind: PropertyKind | null =
    typeValue === 'house'
      ? 'HOUSE'
      : typeValue === 'land'
        ? 'LAND'
        : typeValue === 'both'
          ? 'BOTH'
          : null;
  if (!kind) return null;

  const houseType =
    kind === 'LAND'
      ? null
      : (houseTypes.find((type) => type.key === (raw.house_type ?? '').trim()) ?? null);
  if ((kind === 'HOUSE' || kind === 'BOTH') && !houseType) return null;

  const fields = normalizeAddressFields({
    streetName: raw.street_name,
    houseNumber: raw.house_number,
    blockName: raw.block_name,
    floorNumber: raw.floor_number,
    unitNumber: raw.unit_number,
    plotNumber: raw.plot_number,
    plotName: raw.plot_name,
  });
  const derived = deriveIdentifier({
    estateSlug,
    kind,
    houseType: houseType
      ? { key: houseType.key, requiresUnitFields: houseType.requiresUnitFields }
      : null,
    streetName: fields.streetName ?? '',
    houseNumber: fields.houseNumber,
    blockName: fields.blockName,
    floorNumber: fields.floorNumber,
    unitNumber: fields.unitNumber,
    plotNumber: fields.plotNumber,
  });
  if (!derived.identifier) return null;
  return {
    identifier: derived.identifier,
    kind,
    houseTypeKey: houseType?.key ?? null,
    fields,
  };
}

function asText(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value);
}

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
