import { AppError } from '../../lib/errors.js';
import type {
  PrismaBookingRepository,
  BookingRecord,
  FacilityWatchRecord,
  StoredWatchStatus,
} from './bookings-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { AvailabilityService } from '../facilities/availability.service.js';
import type {
  BookingDto,
  FacilityWatchStatus,
  ResidentBookingsView,
  ResidentCancelBookingResponse,
  ResidentCancelFacilityWatchResponse,
  ResidentCreateBookingInput,
  ResidentCreateBookingResponse,
  ResidentCreateFacilityWatchInput,
  ResidentCreateFacilityWatchResponse,
  ResidentFacilityWatchDto,
  ResidentFacilityWatchesResponse,
} from '@silverstone/shared';

/** Longest single booking, in hours. */
const MAX_BOOKING_HOURS = 24;
/** Largest number of attendees a resident may declare. */
const MAX_ATTENDEES = 500;
/** How far in the future a booking may start. */
const MAX_ADVANCE_DAYS = 365;

export interface BookingCreatedHook {
  organizationId: string;
  userId: string;
  bookingId: string;
  facilityId: string;
  facilityName: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ResidentBookingsServiceOptions {
  bookings: PrismaBookingRepository;
  audit: PrismaAuditRepository;
  /** Resolves the acting resident's estate (may be null). */
  loadEstateId: (organizationId: string, userId: string) => Promise<string | null>;
  /**
   * Called after a booking is created — the resident's inbox is notified
   * from here. Failures in the hook never fail the booking.
   */
  onBookingCreated?: (hook: BookingCreatedHook) => Promise<void>;
  /**
   * Phase 7: after a resident cancellation frees a watched window, the same
   * notification path the operator use runs. Optional so the S8 unit wiring
   * remains valid.
   */
  availability?: AvailabilityService;
  /** Organization-local schedule timezone. */
  loadTimeZone?: (organizationId: string) => Promise<string>;
  /** Injectable clock for tests. */
  now?: () => Date;
}

/**
 * Facilities and bookings (S8), plus the Phase 7 availability watches.
 *
 * Residents browse the active facilities on their estate and request
 * bookings. A booking is always owned by the acting user — the id comes from
 * the session, never the request.
 */
export class ResidentBookingsService {
  constructor(private readonly options: ResidentBookingsServiceOptions) {}

  /** Facilities plus the resident's upcoming and past bookings. */
  async list(organizationId: string, userId: string): Promise<ResidentBookingsView> {
    const estateId = await this.options.loadEstateId(organizationId, userId);
    const [facilities, bookings] = await Promise.all([
      this.options.bookings.listFacilities(organizationId, estateId),
      this.options.bookings.listBookingsByUser(organizationId, userId),
    ]);

    const now = this.now();
    const live = new Set(['REQUESTED', 'CONFIRMED']);
    return {
      facilities: facilities.map((facility) => ({
        id: facility.id,
        name: facility.name,
        description: facility.description,
        bookable: facility.bookable,
        openingTime: facility.openingTime,
        closingTime: facility.closingTime,
        bookingThresholdHours: facility.bookingThresholdHours,
        estate: facility.estate,
        usageFeeKobo: facility.usageFeeKobo,
      })),
      upcoming: bookings
        .filter((booking) => live.has(booking.status) && booking.endsAt > now)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map(toBookingDto),
      past: bookings
        .filter((booking) => !live.has(booking.status) || booking.endsAt <= now)
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
        .map(toBookingDto),
    };
  }

  /** Request a booking for one of the resident's available facilities. */
  async create(
    organizationId: string,
    userId: string,
    input: ResidentCreateBookingInput,
    requestId: string | null,
  ): Promise<ResidentCreateBookingResponse> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    validateBookingWindow(startsAt, endsAt, this.now());

    const attendees = input.attendees ?? null;
    if (attendees !== null) {
      if (!Number.isInteger(attendees) || attendees < 1 || attendees > MAX_ATTENDEES) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Attendees must be a whole number between 1 and ${MAX_ATTENDEES}`,
        );
      }
    }

    const estateId = await this.options.loadEstateId(organizationId, userId);
    const facility = await this.options.bookings.findFacility(
      organizationId,
      estateId,
      input.facilityId,
    );
    if (!facility) {
      throw new AppError(404, 'NOT_FOUND', 'Facility not found');
    }
    if (!facility.bookable) {
      throw new AppError(409, 'CONFLICT', 'This facility cannot be booked');
    }
    assertWithinFacilityRules(
      facility,
      startsAt,
      endsAt,
      this.now(),
      (await this.options.loadTimeZone?.(organizationId)) ?? 'Africa/Lagos',
    );

    const clash = await this.options.bookings.findOverlappingBooking(facility.id, startsAt, endsAt);
    if (clash) {
      throw new AppError(409, 'CONFLICT', 'This facility is already booked for part of that time');
    }

    // The fee is snapshotted now; a later facility edit changes only future
    // bookings. A free booking never needs a payment step.
    const feeKobo = facility.usageFeeKobo;
    const record = await this.options.bookings.create({
      organizationId,
      userId,
      facilityId: facility.id,
      startsAt,
      endsAt,
      attendees,
      feeKobo,
      paymentStatus: feeKobo > 0 ? 'UNPAID' : 'NOT_REQUIRED',
    });

    await this.options.audit.record({
      organizationId,
      actorId: userId,
      eventType: 'resident.booking_created',
      targetType: 'resident',
      targetId: userId,
      requestId,
      outcome: 'success',
      metadata: {
        bookingId: record.id,
        facilityId: facility.id,
        facilityName: facility.name,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        attendees,
        feeKobo,
        paymentStatus: record.paymentStatus,
      },
    });

    if (this.options.onBookingCreated) {
      try {
        await this.options.onBookingCreated({
          organizationId,
          userId,
          bookingId: record.id,
          facilityId: facility.id,
          facilityName: facility.name,
          startsAt,
          endsAt,
        });
      } catch {
        // A failed notification must not undo a successful booking.
      }
    }

    return { ok: true, booking: toBookingDto(record) };
  }

  /** Cancel one of the resident's own bookings. */
  async cancel(
    organizationId: string,
    userId: string,
    bookingId: string,
    requestId: string | null,
  ): Promise<ResidentCancelBookingResponse> {
    const record = await this.options.bookings.findBookingById(organizationId, userId, bookingId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Booking not found');
    }
    if (record.status === 'CANCELLED') {
      throw new AppError(409, 'CONFLICT', 'This booking is already cancelled');
    }
    if (record.status === 'COMPLETED') {
      throw new AppError(409, 'CONFLICT', 'This booking has already taken place');
    }

    const updated = await this.options.bookings.cancel(record.id);
    if (!updated) {
      throw new AppError(409, 'CONFLICT', 'This booking can no longer be cancelled');
    }

    await this.options.audit.record({
      organizationId,
      actorId: userId,
      eventType: 'resident.booking_cancelled',
      targetType: 'resident',
      targetId: userId,
      requestId,
      outcome: 'success',
      metadata: {
        bookingId: record.id,
        facilityId: record.facilityId,
        facilityName: record.facilityName,
      },
    });

    // The cancelling resident must not be told their own slot is free.
    if (this.options.availability) {
      try {
        await this.options.availability.notifyFreedWindow(
          organizationId,
          record.facilityId,
          userId,
        );
      } catch {
        // Notification failures never undo the cancellation.
      }
    }

    return { ok: true, booking: toBookingDto(updated) };
  }

  // --- Availability watches -------------------------------------------------

  async listWatches(
    organizationId: string,
    userId: string,
  ): Promise<ResidentFacilityWatchesResponse> {
    const records = await this.options.bookings.listWatchesByUser(organizationId, userId);
    return { watches: records.map((record) => toWatchDto(record, this.now())) };
  }

  async createWatch(
    organizationId: string,
    userId: string,
    input: ResidentCreateFacilityWatchInput,
  ): Promise<ResidentCreateFacilityWatchResponse> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    validateBookingWindow(startsAt, endsAt, this.now());

    const estateId = await this.options.loadEstateId(organizationId, userId);
    const facility = await this.options.bookings.findFacility(
      organizationId,
      estateId,
      input.facilityId,
    );
    if (!facility) {
      throw new AppError(404, 'NOT_FOUND', 'Facility not found');
    }
    if (!facility.bookable) {
      throw new AppError(409, 'CONFLICT', 'This facility cannot be booked');
    }
    assertWithinFacilityRules(
      facility,
      startsAt,
      endsAt,
      this.now(),
      (await this.options.loadTimeZone?.(organizationId)) ?? 'Africa/Lagos',
    );

    const clash = await this.options.bookings.findOverlappingBooking(facility.id, startsAt, endsAt);
    if (!clash) {
      throw new AppError(409, 'CONFLICT', 'This slot is available — book it instead.');
    }

    const duplicate = await this.options.bookings.findWaitingWatchDuplicate(
      organizationId,
      userId,
      facility.id,
      startsAt,
      endsAt,
    );
    if (duplicate) {
      throw new AppError(409, 'CONFLICT', 'You are already watching this slot');
    }

    const record = await this.options.bookings.createWatch({
      organizationId,
      facilityId: facility.id,
      userId,
      startsAt,
      endsAt,
    });
    return { ok: true, watch: toWatchDto(record, this.now()) };
  }

  async cancelWatch(
    organizationId: string,
    userId: string,
    watchId: string,
  ): Promise<ResidentCancelFacilityWatchResponse> {
    const record = await this.options.bookings.findWatchById(organizationId, userId, watchId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Availability alert not found');
    }
    if (record.status === 'NOTIFIED') {
      throw new AppError(409, 'CONFLICT', 'This alert has already been fulfilled');
    }
    if (record.status === 'CANCELLED') {
      return { ok: true, watch: toWatchDto(record, this.now()) };
    }

    const updated = await this.options.bookings.cancelWatch(
      organizationId,
      userId,
      record.id,
      this.now(),
    );
    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Availability alert not found');
    }
    return { ok: true, watch: toWatchDto(updated, this.now()) };
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

/** Shared booking-window rules, reused by watches. */
function validateBookingWindow(startsAt: Date, endsAt: Date, now: Date): void {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid booking window');
  }
  if (endsAt <= startsAt) {
    throw new AppError(400, 'VALIDATION_ERROR', 'The booking must end after it starts');
  }
  if (startsAt <= now) {
    throw new AppError(400, 'VALIDATION_ERROR', 'The booking must start in the future');
  }
  if (startsAt.getTime() > now.getTime() + MAX_ADVANCE_DAYS * 86_400_000) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `The booking cannot start more than ${MAX_ADVANCE_DAYS} days from now`,
    );
  }
  const durationHours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
  if (durationHours > MAX_BOOKING_HOURS) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `A booking cannot run for more than ${MAX_BOOKING_HOURS} hours`,
    );
  }
}

function assertWithinFacilityRules(
  facility: { openingTime: string; closingTime: string; bookingThresholdHours: number | null },
  startsAt: Date,
  endsAt: Date,
  now: Date,
  timeZone: string,
): void {
  const parts = (value: Date) => {
    const values = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(value);
    const get = (key: string) => values.find((part) => part.type === key)?.value ?? '';
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      minute: Number(get('hour')) * 60 + Number(get('minute')),
    };
  };
  const start = parts(startsAt);
  const end = parts(endsAt);
  const minutes = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    return hour! * 60 + minute!;
  };
  if (
    start.date !== end.date ||
    start.minute < minutes(facility.openingTime) ||
    end.minute > minutes(facility.closingTime)
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `This facility is open ${facility.openingTime}–${facility.closingTime}; choose a booking within those hours on one day.`,
    );
  }
  if (facility.bookingThresholdHours !== null) {
    const earliest = now.getTime() + facility.bookingThresholdHours * 3_600_000;
    if (startsAt.getTime() < earliest) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `This facility must be booked at least ${facility.bookingThresholdHours} hours in advance.`,
      );
    }
  }
}

function toBookingDto(record: BookingRecord): BookingDto {
  return {
    id: record.id,
    facilityId: record.facilityId,
    facilityName: record.facilityName,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    attendees: record.attendees,
    status: record.status,
    feeKobo: record.feeKobo,
    paymentStatus: record.paymentStatus,
    invoiceId: record.invoiceId,
  };
}

function toWatchDto(record: FacilityWatchRecord, now: Date): ResidentFacilityWatchDto {
  return {
    id: record.id,
    facilityId: record.facilityId,
    facilityName: record.facilityName,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    status: watchDisplayStatus(record.status, record.startsAt, now),
    notifiedAt: record.notifiedAt ? record.notifiedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}

function watchDisplayStatus(
  status: StoredWatchStatus,
  startsAt: Date,
  now: Date,
): FacilityWatchStatus {
  if (status === 'WAITING' && startsAt <= now) return 'EXPIRED';
  return status;
}
