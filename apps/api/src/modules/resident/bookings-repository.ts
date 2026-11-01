import type { PrismaClient } from '@prisma/client';

/**
 * Data access for facilities and bookings (S8), plus the Phase 7
 * date/time-specific availability watches.
 *
 * Facilities are read-only for residents; bookings and watches are
 * self-scoped to the acting user.
 */

export type BookingStatus = 'REQUESTED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
export type BookingPaymentStatus = 'UNPAID' | 'PAID' | 'NOT_REQUIRED';
export type StoredWatchStatus = 'WAITING' | 'NOTIFIED' | 'CANCELLED';

export interface FacilityEstateRecord {
  id: string;
  name: string;
  slug: string;
}

export interface FacilityRecord {
  id: string;
  organizationId: string;
  estateId: string;
  estate: FacilityEstateRecord;
  name: string;
  description: string;
  bookable: boolean;
  openingTime: string;
  closingTime: string;
  bookingThresholdHours: number | null;
  usageFeeKobo: number;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface BookingRecord {
  id: string;
  organizationId: string;
  userId: string;
  facilityId: string;
  facilityName: string;
  startsAt: Date;
  endsAt: Date;
  attendees: number | null;
  status: BookingStatus;
  feeKobo: number;
  paymentStatus: BookingPaymentStatus;
  invoiceId: string | null;
  createdAt: Date;
}

export interface CreateBookingInput {
  organizationId: string;
  userId: string;
  facilityId: string;
  startsAt: Date;
  endsAt: Date;
  attendees: number | null;
  feeKobo: number;
  paymentStatus: BookingPaymentStatus;
}

export interface FacilityWatchRecord {
  id: string;
  organizationId: string;
  facilityId: string;
  facilityName: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  status: StoredWatchStatus;
  createdAt: Date;
  notifiedAt: Date | null;
  cancelledAt: Date | null;
}

export interface CreateFacilityWatchInput {
  organizationId: string;
  facilityId: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
}

const FACILITY_INCLUDE = {
  estate: { select: { id: true, name: true, slug: true } },
} as const;

export class PrismaBookingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * The active facilities on the resident's estate. A facility belongs to
   * exactly one estate in Phase 7; suspended (bookable = false) facilities
   * stay visible but cannot accept requests.
   */
  async listFacilities(
    organizationId: string,
    estateId: string | null,
    limit = 100,
  ): Promise<FacilityRecord[]> {
    if (!estateId) return [];
    const rows = await this.prisma.facility.findMany({
      where: { organizationId, estateId, archivedAt: null },
      orderBy: { name: 'asc' },
      take: limit,
      include: FACILITY_INCLUDE,
    });
    return rows.map(toFacilityRecord);
  }

  /** An active facility on the resident's estate, or null when invisible. */
  async findFacility(
    organizationId: string,
    estateId: string | null,
    facilityId: string,
  ): Promise<FacilityRecord | null> {
    if (!estateId) return null;
    const row = await this.prisma.facility.findFirst({
      where: { organizationId, estateId, id: facilityId, archivedAt: null },
      include: FACILITY_INCLUDE,
    });
    return row ? toFacilityRecord(row) : null;
  }

  /** Organization-scoped lookup used by availability re-checks. */
  async findFacilityById(
    organizationId: string,
    facilityId: string,
  ): Promise<FacilityRecord | null> {
    const row = await this.prisma.facility.findFirst({
      where: { organizationId, id: facilityId },
      include: FACILITY_INCLUDE,
    });
    return row ? toFacilityRecord(row) : null;
  }

  /** The acting user's bookings, newest window first. */
  async listBookingsByUser(
    organizationId: string,
    userId: string,
    limit = 100,
  ): Promise<BookingRecord[]> {
    const rows = await this.prisma.booking.findMany({
      where: { organizationId, userId },
      orderBy: { startsAt: 'desc' },
      take: limit,
      include: { facility: { select: { name: true } } },
    });
    return rows.map(toBookingRecord);
  }

  /** Bookings still waiting for an operator decision. */
  async countRequestedBookings(organizationId: string): Promise<number> {
    return this.prisma.booking.count({
      where: { organizationId, status: 'REQUESTED' },
    });
  }

  /** Any overlapping, still-live booking for the same facility. */
  async findOverlappingBooking(
    facilityId: string,
    startsAt: Date,
    endsAt: Date,
    excludeBookingId?: string,
  ): Promise<BookingRecord | null> {
    const row = await this.prisma.booking.findFirst({
      where: {
        facilityId,
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
        status: { in: ['REQUESTED', 'CONFIRMED'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      include: { facility: { select: { name: true } } },
    });
    return row ? toBookingRecord(row) : null;
  }

  async create(input: CreateBookingInput): Promise<BookingRecord> {
    const row = await this.prisma.booking.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        facilityId: input.facilityId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        attendees: input.attendees,
        status: 'REQUESTED',
        feeKobo: input.feeKobo,
        paymentStatus: input.paymentStatus,
      },
      include: { facility: { select: { name: true } } },
    });
    return toBookingRecord(row);
  }

  /** Ownership-checked lookup: another resident's booking is invisible. */
  async findBookingById(
    organizationId: string,
    userId: string,
    bookingId: string,
  ): Promise<BookingRecord | null> {
    const row = await this.prisma.booking.findFirst({
      where: { organizationId, userId, id: bookingId },
      include: { facility: { select: { name: true } } },
    });
    return row ? toBookingRecord(row) : null;
  }

  /** Cancel a live booking, conditional on it still being live. */
  async cancel(bookingId: string): Promise<BookingRecord | null> {
    const updated = await this.prisma.booking.updateMany({
      where: { id: bookingId, status: { in: ['REQUESTED', 'CONFIRMED'] } },
      data: { status: 'CANCELLED' },
    });
    if (updated.count === 0) return null;
    const row = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { facility: { select: { name: true } } },
    });
    return row ? toBookingRecord(row) : null;
  }

  // --- Availability watches -------------------------------------------------

  /** A duplicate WAITING watch for the same resident, facility and window. */
  async findWaitingWatchDuplicate(
    organizationId: string,
    userId: string,
    facilityId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<FacilityWatchRecord | null> {
    const row = await this.prisma.facilityAvailabilityWatch.findFirst({
      where: {
        organizationId,
        userId,
        facilityId,
        startsAt,
        endsAt,
        status: 'WAITING',
      },
      include: { facility: { select: { name: true } } },
    });
    return row ? toWatchRecord(row) : null;
  }

  async createWatch(input: CreateFacilityWatchInput): Promise<FacilityWatchRecord> {
    const row = await this.prisma.facilityAvailabilityWatch.create({
      data: {
        organizationId: input.organizationId,
        facilityId: input.facilityId,
        userId: input.userId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: 'WAITING',
      },
      include: { facility: { select: { name: true } } },
    });
    return toWatchRecord(row);
  }

  /** The acting resident's watches, newest first. */
  async listWatchesByUser(
    organizationId: string,
    userId: string,
    limit = 100,
  ): Promise<FacilityWatchRecord[]> {
    const rows = await this.prisma.facilityAvailabilityWatch.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { facility: { select: { name: true } } },
    });
    return rows.map(toWatchRecord);
  }

  async findWatchById(
    organizationId: string,
    userId: string,
    watchId: string,
  ): Promise<FacilityWatchRecord | null> {
    const row = await this.prisma.facilityAvailabilityWatch.findFirst({
      where: { organizationId, userId, id: watchId },
      include: { facility: { select: { name: true } } },
    });
    return row ? toWatchRecord(row) : null;
  }

  /** Cancel a WAITING watch; return the row even when it was already cancelled. */
  async cancelWatch(
    organizationId: string,
    userId: string,
    watchId: string,
    cancelledAt: Date,
  ): Promise<FacilityWatchRecord | null> {
    await this.prisma.facilityAvailabilityWatch.updateMany({
      where: { organizationId, userId, id: watchId, status: 'WAITING' },
      data: { status: 'CANCELLED', cancelledAt },
    });
    return this.findWatchById(organizationId, userId, watchId);
  }

  /**
   * Future WAITING watches across the organization. Past windows are excluded
   * so the sidebar badge reflects residents still waiting on a bookable slot,
   * not stale requests whose window has already passed.
   */
  async countUpcomingWaitingWatches(organizationId: string, now: Date): Promise<number> {
    return this.prisma.facilityAvailabilityWatch.count({
      where: {
        organizationId,
        status: 'WAITING',
        startsAt: { gt: now },
      },
    });
  }

  /** Future WAITING watches for one facility, used after a cancellation. */
  async listWaitingWatchesForFacility(
    organizationId: string,
    facilityId: string,
    now: Date,
    limit = 500,
  ): Promise<FacilityWatchRecord[]> {
    const rows = await this.prisma.facilityAvailabilityWatch.findMany({
      where: {
        organizationId,
        facilityId,
        status: 'WAITING',
        startsAt: { gt: now },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { facility: { select: { name: true } } },
    });
    return rows.map(toWatchRecord);
  }

  /** Mark a still-WAITING watch NOTIFIED. Returns false when it lost a race. */
  async markWatchNotified(
    organizationId: string,
    watchId: string,
    notifiedAt: Date,
  ): Promise<boolean> {
    const updated = await this.prisma.facilityAvailabilityWatch.updateMany({
      where: { organizationId, id: watchId, status: 'WAITING' },
      data: { status: 'NOTIFIED', notifiedAt },
    });
    return updated.count > 0;
  }

  /** Archiving a facility cancels its outstanding watches without notifying. */
  async cancelWaitingWatchesForFacility(
    organizationId: string,
    facilityId: string,
    cancelledAt: Date,
  ): Promise<number> {
    const updated = await this.prisma.facilityAvailabilityWatch.updateMany({
      where: { organizationId, facilityId, status: 'WAITING' },
      data: { status: 'CANCELLED', cancelledAt },
    });
    return updated.count;
  }
}

type FacilityRow = {
  id: string;
  organizationId: string;
  estateId: string;
  name: string;
  description: string;
  bookable: boolean;
  openingTime: string;
  closingTime: string;
  bookingThresholdHours: number | null;
  usageFeeKobo: number;
  archivedAt: Date | null;
  createdAt: Date;
  estate: FacilityEstateRecord;
};

type BookingRow = {
  id: string;
  organizationId: string;
  userId: string;
  facilityId: string;
  startsAt: Date;
  endsAt: Date;
  attendees: number | null;
  status: string;
  feeKobo: number;
  paymentStatus: string;
  invoiceId: string | null;
  createdAt: Date;
  facility: { name: string };
};

type WatchRow = {
  id: string;
  organizationId: string;
  facilityId: string;
  userId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  createdAt: Date;
  notifiedAt: Date | null;
  cancelledAt: Date | null;
  facility: { name: string };
};

function toFacilityRecord(row: FacilityRow): FacilityRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    estateId: row.estateId,
    estate: row.estate,
    name: row.name,
    description: row.description,
    bookable: row.bookable,
    openingTime: row.openingTime,
    closingTime: row.closingTime,
    bookingThresholdHours: row.bookingThresholdHours,
    usageFeeKobo: row.usageFeeKobo,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
  };
}

function toBookingRecord(row: BookingRow): BookingRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    facilityId: row.facilityId,
    facilityName: row.facility.name,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    attendees: row.attendees,
    status: row.status as BookingStatus,
    feeKobo: row.feeKobo,
    paymentStatus: row.paymentStatus as BookingPaymentStatus,
    invoiceId: row.invoiceId,
    createdAt: row.createdAt,
  };
}

function toWatchRecord(row: WatchRow): FacilityWatchRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    facilityId: row.facilityId,
    facilityName: row.facility.name,
    userId: row.userId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status as StoredWatchStatus,
    createdAt: row.createdAt,
    notifiedAt: row.notifiedAt,
    cancelledAt: row.cancelledAt,
  };
}
