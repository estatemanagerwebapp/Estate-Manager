import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  BookingPaymentStatus,
  BookingStatus,
  OperatorFacilityStatus,
} from '@silverstone/shared';

/**
 * Data access for the Phase 7 operator facility register and booking queue.
 *
 * Every query is organization-scoped. The repository returns plain domain
 * shapes; Prisma types stop at this boundary (ADR-0001).
 */

export interface OperatorEstateSummary {
  id: string;
  name: string;
  slug: string;
}

export interface OperatorFacilityRecord {
  id: string;
  organizationId: string;
  estate: OperatorEstateSummary;
  name: string;
  description: string;
  bookable: boolean;
  usageFeeKobo: number;
  archivedAt: Date | null;
  createdAt: Date;
  liveBookingCount: number;
  waitingWatchCount: number;
}

export interface OperatorFacilityFilter {
  status?: OperatorFacilityStatus;
  estateId?: string;
  limit?: number;
}

export interface CreateFacilityRecordInput {
  organizationId: string;
  estateId: string;
  name: string;
  description: string;
  usageFeeKobo: number;
  bookable: boolean;
}

export interface UpdateFacilityRecordInput {
  estateId?: string;
  name?: string;
  description?: string;
  usageFeeKobo?: number;
  bookable?: boolean;
}

export interface OperatorBookingResidentRecord {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
}

export interface OperatorBookingPropertyRecord {
  id: string;
  identifier: string;
  name: string | null;
  estate: OperatorEstateSummary;
}

export interface OperatorBookingFacilityRecord {
  id: string;
  name: string;
  estate: OperatorEstateSummary;
  bookable: boolean;
  archivedAt: Date | null;
}

export interface OperatorBookingRecord {
  id: string;
  organizationId: string;
  userId: string;
  facilityId: string;
  startsAt: Date;
  endsAt: Date;
  attendees: number | null;
  status: BookingStatus;
  feeKobo: number;
  paymentStatus: BookingPaymentStatus;
  invoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  facility: OperatorBookingFacilityRecord;
  resident: OperatorBookingResidentRecord | null;
  property: OperatorBookingPropertyRecord | null;
}

export interface OperatorBookingFilter {
  status?: BookingStatus;
  paymentStatus?: BookingPaymentStatus;
  facilityId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

const ESTATE_SELECT = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.EstateSelect;

const RESIDENT_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
} satisfies Prisma.UserSelect;

const PROPERTY_SELECT = {
  id: true,
  identifier: true,
  name: true,
  estate: { select: ESTATE_SELECT },
} satisfies Prisma.PropertySelect;

const BOOKING_INCLUDE = {
  facility: {
    select: {
      id: true,
      name: true,
      bookable: true,
      archivedAt: true,
      estate: { select: ESTATE_SELECT },
    },
  },
  user: {
    select: {
      ...RESIDENT_SELECT,
      residentOnboarding: {
        select: {
          property: { select: PROPERTY_SELECT },
        },
      },
    },
  },
} satisfies Prisma.BookingInclude;

const FACILITY_INCLUDE = {
  estate: { select: ESTATE_SELECT },
  _count: {
    select: {
      bookings: { where: { status: { in: ['REQUESTED', 'CONFIRMED'] } } },
      watches: { where: { status: 'WAITING' } },
    },
  },
} satisfies Prisma.FacilityInclude;

type FacilityRow = Prisma.FacilityGetPayload<{ include: typeof FACILITY_INCLUDE }>;
type BookingRow = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

export class PrismaFacilitiesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** The organization's facility register, active and archived. */
  async listFacilities(
    organizationId: string,
    filter: OperatorFacilityFilter = {},
  ): Promise<OperatorFacilityRecord[]> {
    const where: Prisma.FacilityWhereInput = { organizationId };
    if (filter.estateId) where.estateId = filter.estateId;
    if (filter.status === 'ACTIVE') where.archivedAt = null;
    if (filter.status === 'ARCHIVED') where.archivedAt = { not: null };

    const rows = await this.prisma.facility.findMany({
      where,
      orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
      take: filter.limit ?? 100,
      include: FACILITY_INCLUDE,
    });
    return rows.map(toFacilityRecord);
  }

  async findFacility(
    organizationId: string,
    facilityId: string,
  ): Promise<OperatorFacilityRecord | null> {
    const row = await this.prisma.facility.findFirst({
      where: { organizationId, id: facilityId },
      include: FACILITY_INCLUDE,
    });
    return row ? toFacilityRecord(row) : null;
  }

  /** An active estate in the organization, or null. */
  async findEstate(
    organizationId: string,
    estateId: string,
  ): Promise<OperatorEstateSummary | null> {
    const row = await this.prisma.estate.findFirst({
      where: { organizationId, id: estateId },
      select: ESTATE_SELECT,
    });
    return row;
  }

  async createFacility(input: CreateFacilityRecordInput): Promise<OperatorFacilityRecord> {
    const row = await this.prisma.facility.create({
      data: {
        organizationId: input.organizationId,
        estateId: input.estateId,
        name: input.name,
        description: input.description,
        usageFeeKobo: input.usageFeeKobo,
        bookable: input.bookable,
      },
      include: FACILITY_INCLUDE,
    });
    return toFacilityRecord(row);
  }

  async updateFacility(
    organizationId: string,
    facilityId: string,
    input: UpdateFacilityRecordInput,
  ): Promise<OperatorFacilityRecord | null> {
    const row = await this.prisma.facility.update({
      where: { id: facilityId, organizationId },
      data: {
        ...(input.estateId !== undefined ? { estateId: input.estateId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.usageFeeKobo !== undefined ? { usageFeeKobo: input.usageFeeKobo } : {}),
        ...(input.bookable !== undefined ? { bookable: input.bookable } : {}),
      },
      include: FACILITY_INCLUDE,
    });
    return row ? toFacilityRecord(row) : null;
  }

  /** Whether the facility still has a live (REQUESTED/CONFIRMED) booking. */
  async hasLiveBooking(organizationId: string, facilityId: string): Promise<boolean> {
    const count = await this.prisma.booking.count({
      where: {
        organizationId,
        facilityId,
        status: { in: ['REQUESTED', 'CONFIRMED'] },
      },
    });
    return count > 0;
  }

  /**
   * Archive a facility and cancel its outstanding watches. The conditional
   * update means a concurrent archive loses cleanly instead of resetting the
   * original archive timestamp.
   */
  async archiveFacility(
    organizationId: string,
    facilityId: string,
    archivedAt: Date,
  ): Promise<OperatorFacilityRecord | null> {
    const updated = await this.prisma.facility.updateMany({
      where: { organizationId, id: facilityId, archivedAt: null },
      data: { archivedAt, bookable: false },
    });
    if (updated.count === 0) return null;

    await this.prisma.facilityAvailabilityWatch.updateMany({
      where: { organizationId, facilityId, status: 'WAITING' },
      data: { status: 'CANCELLED', cancelledAt: archivedAt },
    });
    return this.findFacility(organizationId, facilityId);
  }

  /** Newest booking requests first. */
  async listBookings(
    organizationId: string,
    filter: OperatorBookingFilter = {},
  ): Promise<OperatorBookingRecord[]> {
    const where: Prisma.BookingWhereInput = { organizationId };
    if (filter.status) where.status = filter.status;
    if (filter.paymentStatus) where.paymentStatus = filter.paymentStatus;
    if (filter.facilityId) where.facilityId = filter.facilityId;
    if (filter.from || filter.to) {
      where.startsAt = {
        ...(filter.from ? { gte: filter.from } : {}),
        ...(filter.to ? { lte: filter.to } : {}),
      };
    }

    const rows = await this.prisma.booking.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { startsAt: 'asc' }],
      take: filter.limit ?? 100,
      include: BOOKING_INCLUDE,
    });
    return rows.map(toBookingRecord);
  }

  async findBooking(
    organizationId: string,
    bookingId: string,
  ): Promise<OperatorBookingRecord | null> {
    const row = await this.prisma.booking.findFirst({
      where: { organizationId, id: bookingId },
      include: BOOKING_INCLUDE,
    });
    return row ? toBookingRecord(row) : null;
  }

  /** Any other live booking that overlaps the window. */
  async findOverlappingLiveBooking(
    organizationId: string,
    facilityId: string,
    startsAt: Date,
    endsAt: Date,
    excludeBookingId: string,
  ): Promise<OperatorBookingRecord | null> {
    const row = await this.prisma.booking.findFirst({
      where: {
        organizationId,
        facilityId,
        id: { not: excludeBookingId },
        status: { in: ['REQUESTED', 'CONFIRMED'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      include: BOOKING_INCLUDE,
    });
    return row ? toBookingRecord(row) : null;
  }

  /** REQUESTED → CONFIRMED only while the booking is settled. */
  async confirmBooking(
    organizationId: string,
    bookingId: string,
  ): Promise<OperatorBookingRecord | null> {
    const updated = await this.prisma.booking.updateMany({
      where: {
        organizationId,
        id: bookingId,
        status: 'REQUESTED',
        paymentStatus: { in: ['PAID', 'NOT_REQUIRED'] },
      },
      data: { status: 'CONFIRMED' },
    });
    if (updated.count === 0) return null;
    return this.findBooking(organizationId, bookingId);
  }

  /** REQUESTED|CONFIRMED → CANCELLED. */
  async cancelBooking(
    organizationId: string,
    bookingId: string,
  ): Promise<OperatorBookingRecord | null> {
    const updated = await this.prisma.booking.updateMany({
      where: {
        organizationId,
        id: bookingId,
        status: { in: ['REQUESTED', 'CONFIRMED'] },
      },
      data: { status: 'CANCELLED' },
    });
    if (updated.count === 0) return null;
    return this.findBooking(organizationId, bookingId);
  }

  /** CONFIRMED → COMPLETED only. */
  async completeBooking(
    organizationId: string,
    bookingId: string,
  ): Promise<OperatorBookingRecord | null> {
    const updated = await this.prisma.booking.updateMany({
      where: { organizationId, id: bookingId, status: 'CONFIRMED' },
      data: { status: 'COMPLETED' },
    });
    if (updated.count === 0) return null;
    return this.findBooking(organizationId, bookingId);
  }
}

function toFacilityRecord(row: FacilityRow): OperatorFacilityRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    estate: row.estate,
    name: row.name,
    description: row.description,
    bookable: row.bookable,
    usageFeeKobo: row.usageFeeKobo,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    liveBookingCount: row._count.bookings,
    waitingWatchCount: row._count.watches,
  };
}

function toBookingRecord(row: BookingRow): OperatorBookingRecord {
  const property = row.user.residentOnboarding?.property ?? null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    facilityId: row.facilityId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    attendees: row.attendees,
    status: row.status as BookingStatus,
    feeKobo: row.feeKobo,
    paymentStatus: row.paymentStatus as BookingPaymentStatus,
    invoiceId: row.invoiceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    facility: {
      id: row.facility.id,
      name: row.facility.name,
      estate: row.facility.estate,
      bookable: row.facility.bookable,
      archivedAt: row.facility.archivedAt,
    },
    resident: row.user
      ? {
          id: row.user.id,
          fullName: row.user.fullName,
          email: row.user.email,
          phone: row.user.phone,
        }
      : null,
    property: property
      ? {
          id: property.id,
          identifier: property.identifier,
          name: property.name,
          estate: property.estate,
        }
      : null,
  };
}
