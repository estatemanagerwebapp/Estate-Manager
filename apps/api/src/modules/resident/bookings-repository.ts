import type { PrismaClient } from '@prisma/client';

/**
 * Data access for facilities and bookings (S8).
 *
 * Facilities are read-only for residents; bookings are self-scoped to the
 * acting user.
 */

export type BookingStatus = 'REQUESTED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface FacilityRecord {
  id: string;
  organizationId: string;
  estateId: string | null;
  name: string;
  description: string;
  bookable: boolean;
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
  createdAt: Date;
}

export interface CreateBookingInput {
  organizationId: string;
  userId: string;
  facilityId: string;
  startsAt: Date;
  endsAt: Date;
  attendees: number | null;
}

export class PrismaBookingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * The facilities the resident may book: those on their estate plus
   * organization-wide ones (no estate).
   */
  async listFacilities(
    organizationId: string,
    estateId: string | null,
    limit = 100,
  ): Promise<FacilityRecord[]> {
    const rows = await this.prisma.facility.findMany({
      where: {
        organizationId,
        ...(estateId ? { OR: [{ estateId }, { estateId: null }] } : { estateId: null }),
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      estateId: row.estateId,
      name: row.name,
      description: row.description,
      bookable: row.bookable,
      createdAt: row.createdAt,
    }));
  }

  async findFacility(
    organizationId: string,
    estateId: string | null,
    facilityId: string,
  ): Promise<FacilityRecord | null> {
    const row = await this.prisma.facility.findFirst({
      where: {
        organizationId,
        id: facilityId,
        ...(estateId ? { OR: [{ estateId }, { estateId: null }] } : { estateId: null }),
      },
    });
    return row
      ? {
          id: row.id,
          organizationId: row.organizationId,
          estateId: row.estateId,
          name: row.name,
          description: row.description,
          bookable: row.bookable,
          createdAt: row.createdAt,
        }
      : null;
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

  /** Any overlapping, still-live booking for the same facility. */
  async findOverlappingBooking(
    facilityId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<BookingRecord | null> {
    const row = await this.prisma.booking.findFirst({
      where: {
        facilityId,
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

  async cancel(bookingId: string): Promise<BookingRecord | null> {
    const row = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
      include: { facility: { select: { name: true } } },
    });
    return toBookingRecord(row);
  }
}

type BookingRow = {
  id: string;
  organizationId: string;
  userId: string;
  facilityId: string;
  startsAt: Date;
  endsAt: Date;
  attendees: number | null;
  status: string;
  createdAt: Date;
  facility: { name: string };
};

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
    createdAt: row.createdAt,
  };
}
