import { AppError } from '../../lib/errors.js';
import type { PrismaBookingRepository, BookingRecord } from './bookings-repository.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  BookingDto,
  ResidentBookingsView,
  ResidentCreateBookingInput,
  ResidentCreateBookingResponse,
  ResidentCancelBookingResponse,
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
}

/**
 * Facilities and bookings (S8).
 *
 * Residents browse the facilities available on their estate (plus
 * organization-wide ones) and request bookings. A booking is always owned
 * by the acting user — the id comes from the session, never the request.
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

    const now = new Date();
    const live = new Set(['REQUESTED', 'CONFIRMED']);
    return {
      facilities: facilities.map((facility) => ({
        id: facility.id,
        name: facility.name,
        description: facility.description,
        bookable: facility.bookable,
      })),
      upcoming: bookings
        .filter((booking) => live.has(booking.status) && booking.endsAt > now)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map(toDto),
      past: bookings
        .filter((booking) => !live.has(booking.status) || booking.endsAt <= now)
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
        .map(toDto),
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
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid booking window');
    }
    if (endsAt <= startsAt) {
      throw new AppError(400, 'VALIDATION_ERROR', 'The booking must end after it starts');
    }
    const now = new Date();
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

    const clash = await this.options.bookings.findOverlappingBooking(facility.id, startsAt, endsAt);
    if (clash) {
      throw new AppError(409, 'CONFLICT', 'This facility is already booked for part of that time');
    }

    const record = await this.options.bookings.create({
      organizationId,
      userId,
      facilityId: facility.id,
      startsAt,
      endsAt,
      attendees,
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

    return { ok: true, booking: toDto(record) };
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
      throw new AppError(404, 'NOT_FOUND', 'Booking not found');
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

    return { ok: true, booking: toDto(updated) };
  }
}

function toDto(record: BookingRecord): BookingDto {
  return {
    id: record.id,
    facilityId: record.facilityId,
    facilityName: record.facilityName,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    attendees: record.attendees,
    status: record.status,
  };
}
