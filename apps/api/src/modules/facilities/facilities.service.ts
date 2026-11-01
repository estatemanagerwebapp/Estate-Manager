import { AppError } from '../../lib/errors.js';
import {
  requireAuditActor,
  requireAuditOrganization,
  type AuthAuditContext,
} from '../auth/auth.service.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  OperatorFacilityRecord,
  OperatorFacilityFilter,
  PrismaFacilitiesRepository,
} from './facilities-repository.js';
import type { AvailabilityService } from './availability.service.js';
import type {
  OperatorCreateFacilityInput,
  OperatorFacilitiesResponse,
  OperatorFacilityDto,
  OperatorFacilityResponse,
  OperatorUpdateFacilityInput,
} from '@silverstone/shared';

const MAX_NAME_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 2000;

export interface OperatorFacilitiesServiceOptions {
  facilities: PrismaFacilitiesRepository;
  audit: PrismaAuditRepository;
  availability?: AvailabilityService;
  now?: () => Date;
}

/**
 * Operator facility register (Phase 7).
 *
 * Facilities are estate-scoped, carry a flat per-booking fee and can be
 * suspended (`bookable = false`) or archived. Archiving is blocked while a
 * live booking exists; the operator must resolve the queue first.
 */
export class OperatorFacilitiesService {
  constructor(private readonly options: OperatorFacilitiesServiceOptions) {}

  async list(
    organizationId: string,
    filter: OperatorFacilityFilter,
  ): Promise<OperatorFacilitiesResponse> {
    const records = await this.options.facilities.listFacilities(organizationId, filter);
    return { facilities: records.map(toFacilityDto) };
  }

  async detail(organizationId: string, facilityId: string): Promise<OperatorFacilityResponse> {
    const record = await this.options.facilities.findFacility(organizationId, facilityId);
    if (!record) throw new AppError(404, 'NOT_FOUND', 'Facility not found');
    return { ok: true, facility: toFacilityDto(record) };
  }

  async create(
    context: AuthAuditContext,
    input: OperatorCreateFacilityInput,
  ): Promise<OperatorFacilityResponse> {
    const actorId = requireAuditActor(context);
    const organizationId = requireAuditOrganization(context);

    const name = parseName(input.name);
    const description = parseDescription(input.description);
    const usageFeeKobo = parseFee(input.usageFeeKobo ?? 0);
    const bookable = input.bookable ?? true;
    const { openingTime, closingTime } = parseHours(
      input.openingTime ?? '08:00',
      input.closingTime ?? '22:00',
    );
    const bookingThresholdHours = parseThreshold(input.bookingThresholdHours ?? null);

    const estate = await this.options.facilities.findEstate(organizationId, input.estateId);
    if (!estate) {
      throw new AppError(404, 'NOT_FOUND', 'Estate not found');
    }

    const record = await this.options.facilities.createFacility({
      organizationId,
      estateId: estate.id,
      name,
      description,
      usageFeeKobo,
      bookable,
      openingTime,
      closingTime,
      bookingThresholdHours,
    });

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'facility.created',
      targetType: 'facility',
      targetId: record.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        facilityId: record.id,
        estateId: estate.id,
        name,
        usageFeeKobo,
        bookable,
      },
    });

    return { ok: true, facility: toFacilityDto(record) };
  }

  async update(
    context: AuthAuditContext,
    facilityId: string,
    input: OperatorUpdateFacilityInput,
  ): Promise<OperatorFacilityResponse> {
    const actorId = requireAuditActor(context);
    const organizationId = requireAuditOrganization(context);

    const existing = await this.options.facilities.findFacility(organizationId, facilityId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Facility not found');
    }
    if (existing.archivedAt) {
      throw new AppError(409, 'CONFLICT', 'Archived facilities cannot be edited');
    }

    const changed = compactChangedFields(input);
    if (changed.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'No facility fields were supplied');
    }

    const name = input.name === undefined ? undefined : parseName(input.name);
    const description =
      input.description === undefined ? undefined : parseDescription(input.description);
    const usageFeeKobo =
      input.usageFeeKobo === undefined ? undefined : parseFee(input.usageFeeKobo);
    const hours =
      input.openingTime !== undefined || input.closingTime !== undefined
        ? parseHours(
            input.openingTime ?? existing.openingTime,
            input.closingTime ?? existing.closingTime,
          )
        : undefined;
    const bookingThresholdHours =
      input.bookingThresholdHours === undefined
        ? undefined
        : parseThreshold(input.bookingThresholdHours);
    let estateId: string | undefined;
    if (input.estateId !== undefined) {
      const estate = await this.options.facilities.findEstate(organizationId, input.estateId);
      if (!estate) {
        throw new AppError(404, 'NOT_FOUND', 'Estate not found');
      }
      estateId = estate.id;
    }

    const updated = await this.options.facilities.updateFacility(organizationId, facilityId, {
      ...(estateId !== undefined ? { estateId } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(usageFeeKobo !== undefined ? { usageFeeKobo } : {}),
      ...(input.bookable !== undefined ? { bookable: input.bookable } : {}),
      ...(hours ? { openingTime: hours.openingTime, closingTime: hours.closingTime } : {}),
      ...(bookingThresholdHours !== undefined ? { bookingThresholdHours } : {}),
    });
    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Facility not found');
    }

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'facility.updated',
      targetType: 'facility',
      targetId: updated.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        facilityId: updated.id,
        changed,
        estateId: updated.estate.id,
        usageFeeKobo: updated.usageFeeKobo,
        bookable: updated.bookable,
      },
    });

    // Re-enabling a suspended facility can make a watched window bookable
    // again. The same no-remaining-live-booking check applies.
    if (this.options.availability && existing.bookable === false && updated.bookable === true) {
      try {
        await this.options.availability.notifyForFacilityReenabled(organizationId, updated.id);
      } catch {
        // A notification failure never undoes the facility edit.
      }
    }

    return { ok: true, facility: toFacilityDto(updated) };
  }

  async archive(context: AuthAuditContext, facilityId: string): Promise<OperatorFacilityResponse> {
    const actorId = requireAuditActor(context);
    const organizationId = requireAuditOrganization(context);

    const existing = await this.options.facilities.findFacility(organizationId, facilityId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Facility not found');
    }
    if (existing.archivedAt) {
      throw new AppError(409, 'CONFLICT', 'This facility is already archived');
    }
    if (await this.options.facilities.hasLiveBooking(organizationId, facilityId)) {
      throw new AppError(
        409,
        'CONFLICT',
        'Resolve the facility’s live bookings before archiving it',
      );
    }

    const archived = await this.options.facilities.archiveFacility(
      organizationId,
      facilityId,
      this.now(),
    );
    if (!archived) {
      throw new AppError(409, 'CONFLICT', 'This facility is already archived');
    }

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'facility.archived',
      targetType: 'facility',
      targetId: archived.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        facilityId: archived.id,
        name: archived.name,
        estateId: archived.estate.id,
      },
    });

    return { ok: true, facility: toFacilityDto(archived) };
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

function compactChangedFields(input: OperatorUpdateFacilityInput): string[] {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

function parseName(value: string): string {
  const name = value.trim();
  if (!name || name.length > MAX_NAME_LENGTH) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid facility name');
  }
  return name;
}

function parseDescription(value: string): string {
  const description = value.trim();
  if (!description || description.length > MAX_DESCRIPTION_LENGTH) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid facility description');
  }
  return description;
}

function parseFee(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid facility usage fee');
  }
  return value;
}

function parseHours(
  openingTime: string,
  closingTime: string,
): { openingTime: string; closingTime: string } {
  const toMinutes = (value: string) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Facility hours must use HH:MM format');
    }
    const [hours, minutes] = value.split(':').map(Number);
    return hours! * 60 + minutes!;
  };
  if (toMinutes(openingTime) >= toMinutes(closingTime)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Closing time must be later than opening time');
  }
  return { openingTime, closingTime };
}

function parseThreshold(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 720) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Booking threshold must be between 1 and 720 hours',
    );
  }
  return value;
}

function toFacilityDto(record: OperatorFacilityRecord): OperatorFacilityDto {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    estate: record.estate,
    bookable: record.bookable,
    openingTime: record.openingTime,
    closingTime: record.closingTime,
    bookingThresholdHours: record.bookingThresholdHours,
    usageFeeKobo: record.usageFeeKobo,
    archivedAt: record.archivedAt ? record.archivedAt.toISOString() : null,
    liveBookingCount: record.liveBookingCount,
    waitingWatchCount: record.waitingWatchCount,
    createdAt: record.createdAt.toISOString(),
  };
}
