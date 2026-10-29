import type {
  FacilityWatchRecord,
  PrismaBookingRepository,
} from '../resident/bookings-repository.js';
import type { NotifyInput } from '../resident/notifications.service.js';

export interface AvailabilityServiceOptions {
  bookings: PrismaBookingRepository;
  /** Writes to the existing resident in-app inbox. */
  notify: (organizationId: string, userId: string, input: NotifyInput) => Promise<void>;
  /** Injectable clock for tests. */
  now?: () => Date;
}

/**
 * Fulfils date/time-specific facility watches (Phase 7).
 *
 * A watch is fulfilled only after a fresh overlap check proves that no live
 * booking still occupies the watched window and the facility is still an
 * active, bookable facility. Notification failure leaves the watch WAITING so
 * a later cancellation can retry.
 */
export class AvailabilityService {
  constructor(private readonly options: AvailabilityServiceOptions) {}

  /**
   * Called after an operator or resident cancellation, and after a facility
   * is re-enabled. The cancelling resident's own watch is skipped.
   */
  async notifyFreedWindow(
    organizationId: string,
    facilityId: string,
    excludeUserId: string | null = null,
  ): Promise<number> {
    return this.fulfilWatches(organizationId, facilityId, excludeUserId);
  }

  /** Called when `bookable` flips back to true after a suspension. */
  async notifyForFacilityReenabled(organizationId: string, facilityId: string): Promise<number> {
    return this.fulfilWatches(organizationId, facilityId, null);
  }

  private async fulfilWatches(
    organizationId: string,
    facilityId: string,
    excludeUserId: string | null,
  ): Promise<number> {
    const facility = await this.options.bookings.findFacilityById(organizationId, facilityId);
    // An archived or suspended facility cannot be booked, so an "available"
    // notification would be misleading. Leave those watches WAITING.
    if (!facility || facility.archivedAt || !facility.bookable) return 0;

    const now = this.now();
    const watches = await this.options.bookings.listWaitingWatchesForFacility(
      organizationId,
      facilityId,
      now,
    );

    let notified = 0;
    for (const watch of watches) {
      if (excludeUserId && watch.userId === excludeUserId) continue;
      const clash = await this.options.bookings.findOverlappingBooking(
        facilityId,
        watch.startsAt,
        watch.endsAt,
      );
      if (clash) continue;
      if (await this.notifyWatch(watch)) notified += 1;
    }
    return notified;
  }

  private async notifyWatch(watch: FacilityWatchRecord): Promise<boolean> {
    try {
      await this.options.notify(watch.organizationId, watch.userId, {
        kind: 'BOOKING',
        title: `Facility available — ${watch.facilityName}`,
        body: `${watch.facilityName} is now free on ${formatDate(watch.startsAt)}, ${formatTime(
          watch.startsAt,
        )}–${formatTime(watch.endsAt)}. Book it before someone else does.`,
        linkTo: '/resident/app/facilities',
      });
    } catch {
      return false;
    }
    return this.options.bookings.markWatchNotified(watch.organizationId, watch.id, this.now());
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}
