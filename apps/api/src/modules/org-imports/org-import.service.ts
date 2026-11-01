import type { PrismaClient } from '@prisma/client';
import {
  ORG_IMPORT_COLUMNS,
  ORG_IMPORT_SHEETS,
  type OrgImportBatchDto,
  type OrgImportCommitResponse,
  type OrgImportCounts,
  type OrgImportCreatedCounts,
  type OrgImportDetailResponse,
  type OrgImportListResponse,
  type OrgImportPreviewResponse,
  type OrgImportRowDto,
  type OrgImportSheet,
  type OrgImportSheetCounts,
  type OrgImportTemplateInfo,
} from '@silverstone/shared';
import { AppError } from '../../lib/errors.js';
import { sha256Hex } from '../../lib/password.js';
import type { AuthAuditContext } from '../auth/auth.service.js';
import { generateResidentCode } from '../auth/resident-onboarding-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { PrismaHouseTypeRepository } from '../properties/house-type-repository.js';
import type { PrismaPropertyRepository } from '../properties/property-repository.js';
import {
  buildOrgTemplate,
  extractBillingResidentEmails,
  parseOrgWorkbook,
  type OrgImportPayload,
  type ParsedOrgRow,
} from './org-import.parser.js';
import {
  propertyKey,
  type OrgImportBatchRecord,
  type OrgImportRowRecord,
  type PrismaOrgImportRepository,
} from './org-import.repository.js';

export interface OrgImportServiceOptions {
  prisma: PrismaClient;
  imports: PrismaOrgImportRepository;
  properties: PrismaPropertyRepository;
  houseTypes: PrismaHouseTypeRepository;
  audit: PrismaAuditRepository;
  /** Organization onboarding-code length, resolved from active config. */
  loadResidentCodeLength: () => Promise<number>;
}

const TEMPLATE_FILENAME = 'silverstone-organization-import-template.xlsx';
const MAX_TRANSACTION_MS = 60_000;
const MAX_TRANSACTION_WAIT_MS = 10_000;

/**
 * Organization-level, multi-sheet data import.
 *
 * Preview parses and validates every row without writing domain records.
 * Commit is one transaction ordered Estates → Properties → Facilities →
 * Residents → Billing. Residents become onboarding drafts only; billing rows
 * create unpaid invoices for existing active residents only.
 */
export class OrgImportService {
  constructor(private readonly options: OrgImportServiceOptions) {}

  async preview(
    context: AuthAuditContext,
    input: { filename: string; buffer: Buffer },
  ): Promise<OrgImportPreviewResponse> {
    const filename = input.filename.slice(0, 255) || 'organization-import.xlsx';
    const billingEmails = await extractBillingResidentEmails(input.buffer);
    const [validationContext, houseTypes] = await Promise.all([
      this.options.imports.loadValidationContext(context.organizationId, billingEmails),
      this.options.houseTypes.listActive(),
    ]);
    const parsed = await parseOrgWorkbook(input.buffer, {
      context: validationContext,
      houseTypes,
    });

    const existing = await this.options.imports.findBatchByFingerprint(
      context.organizationId,
      parsed.fingerprint,
    );
    if (existing) {
      if (existing.status === 'PREVIEWED') {
        return this.detail(context.organizationId, existing.id);
      }
      throw new AppError(
        409,
        'CONFLICT',
        'This workbook was already imported for this organization. Download the template and start a new workbook, or upload a different file.',
      );
    }

    const counts = aggregateRows(parsed.rows);
    const batch = await this.options.imports.createBatch({
      organizationId: context.organizationId,
      filename,
      fingerprint: parsed.fingerprint,
      counts,
      uploadedById: context.actorId ?? '',
    });

    try {
      await this.options.imports.createRows(
        parsed.rows.map((row) => ({
          batchId: batch.id,
          sheet: row.sheet,
          rowNumber: row.rowNumber,
          status: row.status,
          errors: row.errors,
          data: (row.payload ?? {}) as Record<string, unknown>,
          reference: row.reference.slice(0, 255),
        })),
      );
    } catch (error) {
      await this.options.imports.deleteBatch(batch.id).catch(() => undefined);
      throw error;
    }

    await this.options.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'import.previewed',
      targetType: 'import',
      targetId: batch.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        scope: 'organization',
        batchId: batch.id,
        total: counts.total,
        valid: counts.valid,
        error: counts.error,
        duplicateInFile: counts.duplicateInFile,
        collision: counts.collision,
      },
    });

    return this.detail(context.organizationId, batch.id);
  }

  async list(organizationId: string): Promise<OrgImportListResponse> {
    const batches = await this.options.imports.listByOrganization(organizationId);
    return {
      batches: batches.map(toBatchDto),
      total: batches.length,
    };
  }

  async detail(organizationId: string, batchId: string): Promise<OrgImportDetailResponse> {
    const batch = await this.options.imports.findById(batchId, organizationId);
    if (!batch) {
      throw new AppError(404, 'NOT_FOUND', 'Import batch not found');
    }
    const rows = sortRows(await this.options.imports.rowsForBatch(batch.id));
    return {
      batch: toBatchDto(batch),
      rows: rows.map(toRowDto),
    };
  }

  async template(organizationId: string): Promise<{
    filename: string;
    buffer: Buffer;
    info: OrgImportTemplateInfo;
  }> {
    const [houseTypes, estates] = await Promise.all([
      this.options.houseTypes.listActive(),
      this.options.imports.listEstateRefs(organizationId),
    ]);
    const instructions = [
      'Silverstone Managers — organization onboarding workbook.',
      '',
      'Upload this file from Data import. The file is previewed first; nothing is written until you commit the batch.',
      'Use one row per record. Do not rename or delete the header columns.',
    ].join('\n');
    const buffer = await buildOrgTemplate({ houseTypes, estates, instructions });
    return {
      filename: TEMPLATE_FILENAME,
      buffer,
      info: {
        filename: TEMPLATE_FILENAME,
        sheets: ORG_IMPORT_SHEETS.map((sheet) => ({
          name: sheet,
          columns: [...ORG_IMPORT_COLUMNS[sheet]],
        })),
        instructions,
      },
    };
  }

  async commit(context: AuthAuditContext, batchId: string): Promise<OrgImportCommitResponse> {
    const batch = await this.options.imports.findById(batchId, context.organizationId);
    if (!batch) {
      throw new AppError(404, 'NOT_FOUND', 'Import batch not found');
    }
    if (batch.status !== 'PREVIEWED') {
      throw new AppError(
        409,
        'CONFLICT',
        'This batch has already been committed or is in a terminal state',
      );
    }

    const rows = sortRows(await this.options.imports.rowsForBatch(batch.id));
    const validRows = rows.filter((row) => row.status === 'VALID');
    if (validRows.length === 0) {
      throw new AppError(
        409,
        'CONFLICT',
        'This batch has no valid rows to commit. Fix the row errors and upload a new workbook.',
      );
    }

    const codeLength = clampCodeLength(await this.options.loadResidentCodeLength());
    const created: OrgImportCreatedCounts = {
      estates: 0,
      properties: 0,
      facilities: 0,
      residents: 0,
      invoices: 0,
    };
    const createdBySheet = emptySheetRecord();

    try {
      await this.options.prisma.$transaction(
        async (tx) => {
          const locked = await this.options.imports.lockBatch(tx, batch.id);
          if (!locked || locked.status !== 'PREVIEWED') {
            throw new AppError(
              409,
              'CONFLICT',
              'This batch has already been committed or is in a terminal state',
            );
          }

          const estateIdBySlug = new Map<string, string>();
          const propertyIdByKey = new Map<string, string>();
          const rowUpdates: Array<{ rowId: string; entityType: string; entityId: string }> = [];
          const collisions: Array<{ rowId: string; message: string }> = [];

          for (const row of validRows) {
            const payload = row.data as unknown as OrgImportPayload;
            assertPayload(row.sheet, payload);

            if (payload.kind === 'estate') {
              const estateId = await this.options.imports.createEstateInTx(tx, {
                organizationId: context.organizationId,
                slug: payload.slug,
                name: payload.name,
                address: payload.address,
                status: payload.status,
              });
              if (!estateId) {
                collisions.push({
                  rowId: row.id,
                  message: `Estate slug "${payload.slug}" was created by another request before this commit.`,
                });
                continue;
              }
              estateIdBySlug.set(payload.slug, estateId);
              rowUpdates.push({
                rowId: row.id,
                entityType: 'estate',
                entityId: estateId,
              });
              created.estates += 1;
              createdBySheet.Estates += 1;
              continue;
            }

            if (payload.kind === 'property') {
              const estateId = payload.estateId ?? estateIdBySlug.get(payload.estateSlug) ?? null;
              if (!estateId) {
                throw new AppError(
                  409,
                  'CONFLICT',
                  `Estate "${payload.estateSlug}" was not available at commit time.`,
                );
              }
              const propertyId = await this.options.properties.createInTxSkipDuplicates(tx, {
                estateId,
                organizationId: context.organizationId,
                identifier: payload.identifier,
                kind: payload.propertyKind,
                houseTypeKey: payload.houseTypeKey,
                streetName: payload.fields.streetName ?? '',
                houseNumber: payload.fields.houseNumber ?? null,
                blockName: payload.fields.blockName ?? null,
                floorNumber: payload.fields.floorNumber ?? null,
                unitNumber: payload.fields.unitNumber ?? null,
                plotNumber: payload.fields.plotNumber ?? null,
                plotName: payload.fields.plotName ?? null,
                name: payload.name,
                status: payload.status,
              });
              if (!propertyId) {
                collisions.push({
                  rowId: row.id,
                  message: `Property "${payload.identifier}" was created by another request before this commit.`,
                });
                continue;
              }
              propertyIdByKey.set(propertyKey(payload.estateSlug, payload.identifier), propertyId);
              rowUpdates.push({
                rowId: row.id,
                entityType: 'property',
                entityId: propertyId,
              });
              created.properties += 1;
              createdBySheet.Properties += 1;
              continue;
            }

            if (payload.kind === 'facility') {
              const estateId = payload.estateId ?? estateIdBySlug.get(payload.estateSlug) ?? null;
              if (!estateId) {
                throw new AppError(
                  409,
                  'CONFLICT',
                  `Estate "${payload.estateSlug}" was not available at commit time.`,
                );
              }
              const facilityId = await this.options.imports.createFacilityInTx(tx, {
                organizationId: context.organizationId,
                estateId,
                name: payload.name,
                description: payload.description,
                bookable: payload.bookable,
                usageFeeKobo: payload.usageFeeKobo,
              });
              rowUpdates.push({
                rowId: row.id,
                entityType: 'facility',
                entityId: facilityId,
              });
              created.facilities += 1;
              createdBySheet.Facilities += 1;
              continue;
            }

            if (payload.kind === 'resident') {
              const estateId = payload.estateId ?? estateIdBySlug.get(payload.estateSlug) ?? null;
              const propertyId =
                payload.propertyId ??
                propertyIdByKey.get(propertyKey(payload.estateSlug, payload.propertyIdentifier)) ??
                null;
              if (!estateId || !propertyId) {
                throw new AppError(
                  409,
                  'CONFLICT',
                  `Property "${payload.propertyIdentifier}" was not available at commit time.`,
                );
              }
              const onboardingCode = generateResidentCode(codeLength);
              const draftId = await this.options.imports.createResidentDraftInTx(tx, {
                organizationId: context.organizationId,
                estateId,
                propertyId,
                firstName: payload.firstName,
                email: payload.email,
                phone: payload.phone,
                codeHash: sha256Hex(onboardingCode),
                onboardingCode,
              });
              rowUpdates.push({
                rowId: row.id,
                entityType: 'resident_onboarding',
                entityId: draftId,
              });
              created.residents += 1;
              createdBySheet.Residents += 1;
              continue;
            }

            const invoiceId = await this.options.imports.createInvoiceInTx(tx, {
              organizationId: context.organizationId,
              userId: payload.userId,
              propertyId: payload.propertyId,
              period: payload.period,
              amountKobo: payload.amountKobo,
              dueAt: new Date(payload.dueAt),
              status: payload.status,
              createdById: context.actorId,
            });
            rowUpdates.push({
              rowId: row.id,
              entityType: 'invoice',
              entityId: invoiceId,
            });
            created.invoices += 1;
            createdBySheet.Billing += 1;
          }

          await this.options.imports.markRowsCreated(tx, rowUpdates);
          await this.options.imports.markRowsCollision(tx, collisions);

          const nextCounts = withCreated(this.normalizeCounts(locked.counts), createdBySheet);
          await this.options.imports.updateBatchInTx(tx, batch.id, {
            status: 'COMMITTED',
            counts: nextCounts,
            committedAt: new Date(),
          });
        },
        { maxWait: MAX_TRANSACTION_WAIT_MS, timeout: MAX_TRANSACTION_MS },
      );
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 409) {
        throw error;
      }
      await this.options.imports
        .updateBatch(batch.id, {
          status: 'COMMIT_FAILED',
          counts: { ...this.normalizeCounts(batch.counts), failed: validRows.length },
        })
        .catch(() => undefined);
      await this.options.audit
        .record({
          organizationId: context.organizationId,
          actorId: context.actorId,
          eventType: 'import.commit_failed',
          targetType: 'import',
          targetId: batch.id,
          requestId: context.requestId,
          outcome: 'failure',
          metadata: {
            scope: 'organization',
            batchId: batch.id,
            reason: error instanceof Error ? error.message.slice(0, 200) : 'Unknown error',
          },
        })
        .catch(() => undefined);
      throw error;
    }

    await this.options.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      eventType: 'import.completed',
      targetType: 'import',
      targetId: batch.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        scope: 'organization',
        batchId: batch.id,
        created: { ...created },
      },
    });

    const updated = await this.options.imports.findById(batch.id, context.organizationId);
    if (!updated) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Import batch disappeared after commit');
    }
    return {
      batch: toBatchDto(updated),
      created,
    };
  }

  private normalizeCounts(value: unknown): OrgImportCounts {
    const counts = emptyCounts();
    if (!value || typeof value !== 'object') return counts;
    const raw = value as Partial<OrgImportCounts>;
    counts.total = numberOrZero(raw.total);
    counts.valid = numberOrZero(raw.valid);
    counts.error = numberOrZero(raw.error);
    counts.duplicateInFile = numberOrZero(raw.duplicateInFile);
    counts.collision = numberOrZero(raw.collision);
    counts.created = numberOrZero(raw.created);
    counts.failed = numberOrZero(raw.failed);
    if (raw.sheets && typeof raw.sheets === 'object') {
      for (const sheet of ORG_IMPORT_SHEETS) {
        const sheetRaw = raw.sheets[sheet];
        if (!sheetRaw) continue;
        counts.sheets[sheet] = {
          total: numberOrZero(sheetRaw.total),
          valid: numberOrZero(sheetRaw.valid),
          error: numberOrZero(sheetRaw.error),
          duplicateInFile: numberOrZero(sheetRaw.duplicateInFile),
          collision: numberOrZero(sheetRaw.collision),
          created: numberOrZero(sheetRaw.created),
        };
      }
    }
    return counts;
  }
}

function emptySheetCounts(): OrgImportSheetCounts {
  return {
    total: 0,
    valid: 0,
    error: 0,
    duplicateInFile: 0,
    collision: 0,
    created: 0,
  };
}

function emptySheetRecord(): Record<OrgImportSheet, number> {
  return {
    Estates: 0,
    Properties: 0,
    Facilities: 0,
    Residents: 0,
    Billing: 0,
  };
}

function emptyCounts(): OrgImportCounts {
  return {
    ...emptySheetCounts(),
    failed: 0,
    sheets: {
      Estates: emptySheetCounts(),
      Properties: emptySheetCounts(),
      Facilities: emptySheetCounts(),
      Residents: emptySheetCounts(),
      Billing: emptySheetCounts(),
    },
  };
}

function aggregateRows(rows: ParsedOrgRow[]): OrgImportCounts {
  const counts = emptyCounts();
  for (const row of rows) {
    counts.total += 1;
    counts.sheets[row.sheet].total += 1;
    if (row.status === 'VALID') {
      counts.valid += 1;
      counts.sheets[row.sheet].valid += 1;
    } else if (row.status === 'ERROR') {
      counts.error += 1;
      counts.sheets[row.sheet].error += 1;
    } else if (row.status === 'DUPLICATE_IN_FILE') {
      counts.duplicateInFile += 1;
      counts.sheets[row.sheet].duplicateInFile += 1;
    } else if (row.status === 'COLLISION') {
      counts.collision += 1;
      counts.sheets[row.sheet].collision += 1;
    }
  }
  return counts;
}

function withCreated(
  counts: OrgImportCounts,
  createdBySheet: Record<OrgImportSheet, number>,
): OrgImportCounts {
  const next: OrgImportCounts = {
    ...counts,
    sheets: {
      Estates: { ...counts.sheets.Estates },
      Properties: { ...counts.sheets.Properties },
      Facilities: { ...counts.sheets.Facilities },
      Residents: { ...counts.sheets.Residents },
      Billing: { ...counts.sheets.Billing },
    },
  };
  next.created = 0;
  for (const sheet of ORG_IMPORT_SHEETS) {
    next.sheets[sheet].created = createdBySheet[sheet];
    next.created += createdBySheet[sheet];
  }
  next.failed = 0;
  return next;
}

function toBatchDto(batch: OrgImportBatchRecord): OrgImportBatchDto {
  return {
    id: batch.id,
    filename: batch.filename,
    fingerprint: batch.fingerprint,
    status: batch.status as OrgImportBatchDto['status'],
    counts: normalizeStoredCounts(batch.counts),
    uploadedById: batch.uploadedById,
    uploadedAt: batch.uploadedAt.toISOString(),
    committedAt: batch.committedAt ? batch.committedAt.toISOString() : null,
  };
}

function normalizeStoredCounts(value: unknown): OrgImportCounts {
  const counts = emptyCounts();
  if (!value || typeof value !== 'object') return counts;
  const raw = value as Partial<OrgImportCounts>;
  counts.total = numberOrZero(raw.total);
  counts.valid = numberOrZero(raw.valid);
  counts.error = numberOrZero(raw.error);
  counts.duplicateInFile = numberOrZero(raw.duplicateInFile);
  counts.collision = numberOrZero(raw.collision);
  counts.created = numberOrZero(raw.created);
  counts.failed = numberOrZero(raw.failed);
  if (raw.sheets && typeof raw.sheets === 'object') {
    for (const sheet of ORG_IMPORT_SHEETS) {
      const sheetRaw = raw.sheets[sheet];
      if (!sheetRaw) continue;
      counts.sheets[sheet] = {
        total: numberOrZero(sheetRaw.total),
        valid: numberOrZero(sheetRaw.valid),
        error: numberOrZero(sheetRaw.error),
        duplicateInFile: numberOrZero(sheetRaw.duplicateInFile),
        collision: numberOrZero(sheetRaw.collision),
        created: numberOrZero(sheetRaw.created),
      };
    }
  }
  return counts;
}

function toRowDto(row: OrgImportRowRecord): OrgImportRowDto {
  return {
    id: row.id,
    batchId: row.batchId,
    sheet: row.sheet,
    rowNumber: row.rowNumber,
    status: row.status as OrgImportRowDto['status'],
    errors: row.errors,
    reference: row.reference,
    entityType: row.entityType,
    entityId: row.entityId,
  };
}

function sortRows(rows: OrgImportRowRecord[]): OrgImportRowRecord[] {
  const order = new Map<OrgImportSheet, number>(
    ORG_IMPORT_SHEETS.map((sheet, index) => [sheet, index]),
  );
  return [...rows].sort((left, right) => {
    const sheetDelta = (order.get(left.sheet) ?? 0) - (order.get(right.sheet) ?? 0);
    return sheetDelta !== 0 ? sheetDelta : left.rowNumber - right.rowNumber;
  });
}

function assertPayload(sheet: OrgImportSheet, payload: OrgImportPayload): void {
  const expected: Record<OrgImportSheet, OrgImportPayload['kind']> = {
    Estates: 'estate',
    Properties: 'property',
    Facilities: 'facility',
    Residents: 'resident',
    Billing: 'billing',
  };
  if (!payload || payload.kind !== expected[sheet]) {
    throw new AppError(500, 'INTERNAL_ERROR', `Import row payload does not match "${sheet}"`);
  }
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clampCodeLength(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(32, Math.max(8, Math.trunc(value)));
}
