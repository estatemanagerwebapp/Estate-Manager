import { AppError } from '../../lib/errors.js';
import type { AuthAuditContext } from '../auth/auth.service.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type {
  OperatorBookingFilter,
  OperatorBookingRecord,
  PrismaFacilitiesRepository,
} from './facilities-repository.js';
import type { AvailabilityService } from './availability.service.js';
import type {
  BookingPaymentStatus,
  OperatorBookingDto,
  OperatorBookingResponse,
  OperatorBookingsResponse,
} from '@silverstone/shared';

export interface OperatorBookingsServiceOptions {
  bookings: PrismaFacilitiesRepository;
  audit: PrismaAuditRepository;
  availability?: AvailabilityService;
  now?: () => Date;
}

/**
 * Operator booking queue and lifecycle (Phase 7).
 *
 * Confirmation requires a settled payment (PAID or NOT_REQUIRED), a future
 * window, an active/bookable facility on the resident's estate and no
 * overlapping live booking. Completion requires the window to have ended and
 * the booking to be settled. Every transition uses a conditional update.
 */
export class OperatorBookingsService {
  constructor(private readonly options: OperatorBookingsServiceOptions) {}

  async list(
    organizationId: string,
    filter: OperatorBookingFilter,
  ): Promise<OperatorBookingsResponse> {
    const records = await this.options.bookings.listBookings(organizationId, filter);
    return { bookings: records.map(toOperatorBookingDto) };
  }

  async confirm(context: AuthAuditContext, bookingId: string): Promise<OperatorBookingResponse> {
    const actorId = requireActor(context);
    const organizationId = requireOrganization(context);
    const booking = await this.options.bookings.findBooking(organizationId, bookingId);
    if (!booking) {
      throw new AppError(404, 'NOT_FOUND', 'Booking not found');
    }
    if (booking.status !== 'REQUESTED') {
      throw new AppError(409, 'CONFLICT', 'Only requested bookings can be confirmed');
    }
    if (!isSettled(booking.paymentStatus)) {
      throw new AppError(409, 'CONFLICT', 'Verify payment before confirming this booking');
    }

    const now = this.now();
    await assertBookingCanBeConfirmed(this.options.bookings, booking, now);

    const updated = await this.options.bookings.confirmBooking(organizationId, bookingId);
    if (!updated) {
      throw new AppError(409, 'CONFLICT', 'This booking can no longer be confirmed');
    }

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'booking.confirmed',
      targetType: 'booking',
      targetId: updated.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: bookingAuditMetadata(updated),
    });

    return { ok: true, booking: toOperatorBookingDto(updated) };
  }

  async cancel(context: AuthAuditContext, bookingId: string): Promise<OperatorBookingResponse> {
    const actorId = requireActor(context);
    const organizationId = requireOrganization(context);
    const booking = await this.options.bookings.findBooking(organizationId, bookingId);
    if (!booking) {
      throw new AppError(404, 'NOT_FOUND', 'Booking not found');
    }
    if (booking.status !== 'REQUESTED' && booking.status !== 'CONFIRMED') {
      throw new AppError(409, 'CONFLICT', 'This booking can no longer be cancelled');
    }

    const updated = await this.options.bookings.cancelBooking(organizationId, bookingId);
    if (!updated) {
      throw new AppError(409, 'CONFLICT', 'This booking can no longer be cancelled');
    }

    let notified = 0;
    if (this.options.availability) {
      try {
        notified = await this.options.availability.notifyFreedWindow(
          organizationId,
          booking.facilityId,
        );
      } catch {
        // A notification failure never undoes the cancellation.
      }
    }

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'booking.cancelled',
      targetType: 'booking',
      targetId: updated.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        ...bookingAuditMetadata(updated),
        previousStatus: booking.status,
        watchesNotified: notified,
      },
    });

    return { ok: true, booking: toOperatorBookingDto(updated) };
  }

  async complete(context: AuthAuditContext, bookingId: string): Promise<OperatorBookingResponse> {
    const actorId = requireActor(context);
    const organizationId = requireOrganization(context);
    const booking = await this.options.bookings.findBooking(organizationId, bookingId);
    if (!booking) {
      throw new AppError(404, 'NOT_FOUND', 'Booking not found');
    }
    if (booking.status !== 'CONFIRMED') {
      throw new AppError(409, 'CONFLICT', 'Only confirmed bookings can be completed');
    }
    if (booking.endsAt > this.now()) {
      throw new AppError(409, 'CONFLICT', 'This booking has not ended yet');
    }
    if (!isSettled(booking.paymentStatus)) {
      throw new AppError(409, 'CONFLICT', 'Verify payment before completing this booking');
    }

    const updated = await this.options.bookings.completeBooking(organizationId, bookingId);
    if (!updated) {
      throw new AppError(409, 'CONFLICT', 'This booking can no longer be completed');
    }

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'booking.completed',
      targetType: 'booking',
      targetId: updated.id,
      requestId: context.requestId,
      outcome: 'success',
      metadata: bookingAuditMetadata(updated),
    });

    return { ok: true, booking: toOperatorBookingDto(updated) };
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

/**
 * The confirmability rules are shared by the confirm action and payment
 * verification. Payment verification must not create an invoice for a
 * request that can no longer be confirmed.
 */
export async function assertBookingCanBeConfirmed(
  bookings: PrismaFacilitiesRepository,
  booking: OperatorBookingRecord,
  now: Date,
): Promise<void> {
  if (booking.startsAt <= now) {
    throw new AppError(409, 'CONFLICT', 'This booking window has already started');
  }
  if (booking.facility.archivedAt) {
    throw new AppError(409, 'CONFLICT', 'The facility has been archived');
  }
  if (!booking.facility.bookable) {
    throw new AppError(409, 'CONFLICT', 'The facility is currently suspended');
  }
  if (!booking.property || booking.property.estate.id !== booking.facility.estate.id) {
    throw new AppError(409, 'CONFLICT', 'The facility is not on the resident’s estate');
  }
  const clash = await bookings.findOverlappingLiveBooking(
    booking.organizationId,
    booking.facilityId,
    booking.startsAt,
    booking.endsAt,
    booking.id,
  );
  if (clash) {
    throw new AppError(409, 'CONFLICT', 'Another live booking now occupies this window');
  }
}

export function isSettled(status: BookingPaymentStatus): boolean {
  return status === 'PAID' || status === 'NOT_REQUIRED';
}

export function toOperatorBookingDto(record: OperatorBookingRecord): OperatorBookingDto {
  return {
    id: record.id,
    facilityId: record.facilityId,
    facilityName: record.facility.name,
    estate: record.facility.estate,
    resident: record.resident,
    property: record.property,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    attendees: record.attendees,
    feeKobo: record.feeKobo,
    paymentStatus: record.paymentStatus,
    invoiceId: record.invoiceId,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function bookingAuditMetadata(record: OperatorBookingRecord) {
  return {
    bookingId: record.id,
    facilityId: record.facilityId,
    residentId: record.userId,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    feeKobo: record.feeKobo,
    paymentStatus: record.paymentStatus,
  };
}

function requireActor(context: AuthAuditContext): string {
  if (!context.actorId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return context.actorId;
}

function requireOrganization(context: AuthAuditContext): string {
  if (!context.organizationId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return context.organizationId;
}
