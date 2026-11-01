import { OPERATOR_PAYMENT_METHODS } from '@silverstone/shared';
import { AppError } from '../../lib/errors.js';
import {
  requireAuditActor,
  requireAuditOrganization,
  type AuthAuditContext,
} from '../auth/auth.service.js';
import type { PrismaAuditRepository } from '../audit/audit-repository.js';
import type { PrismaFinanceRepository } from '../resident/finance-repository.js';
import type { PrismaFacilitiesRepository } from './facilities-repository.js';
import { assertBookingCanBeConfirmed, toOperatorBookingDto } from './bookings.service.js';
import { toOperatorInvoiceDto, toOperatorPaymentDto } from '../billing/operator-billing.service.js';
import type {
  OperatorConfirmBookingPaymentInput,
  OperatorConfirmBookingPaymentResponse,
} from '@silverstone/shared';

const MAX_PERIOD_LENGTH = 48;
const MAX_REFERENCE_LENGTH = 120;

export interface BookingPaymentServiceOptions {
  bookings: PrismaFacilitiesRepository;
  finance: PrismaFinanceRepository;
  audit: PrismaAuditRepository;
  now?: () => Date;
}

/**
 * Manual booking-payment verification (Phase 7).
 *
 * The estate office receives the fee out of band. This action claims the
 * still-REQUESTED, UNPAID paid-fee booking, creates exactly one PAID invoice,
 * payment row and two ledger entries atomically, and links the invoice. The
 * booking status remains REQUESTED; a separate confirm action follows.
 */
export class BookingPaymentService {
  constructor(private readonly options: BookingPaymentServiceOptions) {}

  async verify(
    context: AuthAuditContext,
    bookingId: string,
    input: OperatorConfirmBookingPaymentInput,
  ): Promise<OperatorConfirmBookingPaymentResponse> {
    const actorId = requireAuditActor(context);
    const organizationId = requireAuditOrganization(context);
    const now = this.now();

    const booking = await this.options.bookings.findBooking(organizationId, bookingId);
    if (!booking) {
      throw new AppError(404, 'NOT_FOUND', 'Booking not found');
    }
    if (booking.status !== 'REQUESTED') {
      throw new AppError(409, 'CONFLICT', 'Only requested bookings can take a payment');
    }
    if (booking.feeKobo <= 0) {
      throw new AppError(409, 'CONFLICT', 'This booking does not require payment');
    }
    if (booking.paymentStatus !== 'UNPAID') {
      throw new AppError(409, 'CONFLICT', 'This booking payment is already verified');
    }

    // Do not create an invoice for a request that can no longer be confirmed.
    await assertBookingCanBeConfirmed(this.options.bookings, booking, now);

    const method = input.method.trim();
    if (!(OPERATOR_PAYMENT_METHODS as readonly string[]).includes(method)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid payment method');
    }
    const reference = input.reference?.trim() || null;
    if (reference && reference.length > MAX_REFERENCE_LENGTH) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Payment reference is too long');
    }
    const paidAt = input.paidAt ? parseDate(input.paidAt) : now;
    const period = bookingPeriod(booking.facility.name, booking.startsAt);

    const created = await this.options.finance.createPaidBookingInvoice({
      organizationId,
      bookingId: booking.id,
      userId: booking.userId,
      propertyId: booking.property?.id ?? null,
      facilityId: booking.facilityId,
      facilityName: booking.facility.name,
      amountKobo: booking.feeKobo,
      period,
      method,
      reference,
      paidAt,
      recordedById: actorId,
    });
    if (!created) {
      throw new AppError(409, 'CONFLICT', 'This booking can no longer take a payment');
    }

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'invoice.created',
      targetType: 'invoice',
      targetId: created.invoiceId,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        invoiceId: created.invoiceId,
        bookingId: booking.id,
        residentId: booking.userId,
        facilityId: booking.facilityId,
        amountKobo: booking.feeKobo,
        source: 'facility_booking',
      },
    });

    await this.options.audit.record({
      organizationId,
      actorId,
      eventType: 'payment.recorded',
      targetType: 'payment',
      targetId: created.paymentId,
      requestId: context.requestId,
      outcome: 'success',
      metadata: {
        paymentId: created.paymentId,
        invoiceId: created.invoiceId,
        bookingId: booking.id,
        residentId: booking.userId,
        method,
        amountKobo: booking.feeKobo,
        paidAt: paidAt.toISOString(),
      },
    });

    const [savedBooking, invoice, payment] = await Promise.all([
      this.options.bookings.findBooking(organizationId, booking.id),
      this.options.finance.findInvoiceForOrganization(organizationId, created.invoiceId),
      this.options.finance.findPaymentForOrganization(organizationId, created.paymentId),
    ]);
    if (!savedBooking || !invoice || !payment) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Booking payment could not be loaded');
    }

    return {
      ok: true,
      booking: toOperatorBookingDto(savedBooking),
      invoice: toOperatorInvoiceDto(invoice, now),
      payment: toOperatorPaymentDto(payment),
    };
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

function bookingPeriod(facilityName: string, startsAt: Date): string {
  const date = startsAt.toISOString().slice(0, 10);
  return `Facility: ${facilityName} — ${date}`.slice(0, MAX_PERIOD_LENGTH);
}

function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid payment date');
  }
  return date;
}
