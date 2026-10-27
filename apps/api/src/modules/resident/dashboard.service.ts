import type { ResidentProfileService } from './profile.service.js';
import type { ResidentPropertiesService } from './properties.service.js';
import type { ResidentFinanceService } from './finance.service.js';
import type { ResidentCodesService } from './codes.service.js';
import type { ResidentComplaintsService } from './complaints.service.js';
import type { ResidentCommunityService } from './community.service.js';
import type { ResidentBookingsService } from './bookings.service.js';
import type { ResidentNotificationsService } from './notifications.service.js';
import type { ResidentDashboardView } from '@silverstone/shared';

/** How many recent notifications the dashboard shows. */
const RECENT_NOTIFICATION_LIMIT = 5;

export interface ResidentDashboardServiceOptions {
  profile: ResidentProfileService;
  properties?: ResidentPropertiesService;
  finance?: ResidentFinanceService;
  codes?: ResidentCodesService;
  complaints?: ResidentComplaintsService;
  community?: ResidentCommunityService;
  bookings?: ResidentBookingsService;
  notifications?: ResidentNotificationsService;
}

/**
 * The resident dashboard home (S11).
 *
 * One aggregation endpoint that composes the sections from the services
 * S1–S10 already expose — no queries are duplicated here. Every section
 * tolerates empty data, and a section whose service is not wired reads as
 * empty rather than failing the whole page.
 */
export class ResidentDashboardService {
  constructor(private readonly options: ResidentDashboardServiceOptions) {}

  async get(organizationId: string, userId: string): Promise<ResidentDashboardView> {
    // Sequential on purpose: every service opens its own queries, and the
    // database connection budget is small. One section at a time keeps the
    // pool quiet.
    const profile = await this.options.profile.view(organizationId, userId);

    const properties = this.options.properties
      ? await this.options.properties.list(organizationId, userId)
      : null;

    const finance = this.options.finance
      ? await this.options.finance.view(organizationId, userId)
      : null;

    const codes = this.options.codes ? await this.options.codes.list(organizationId, userId) : null;

    const complaints = this.options.complaints
      ? await this.options.complaints.list(organizationId, userId)
      : null;

    const community = this.options.community
      ? await this.options.community.get(organizationId, userId)
      : null;

    const bookings = this.options.bookings
      ? await this.options.bookings.list(organizationId, userId)
      : null;

    const notifications = this.options.notifications
      ? await this.options.notifications.list(organizationId, userId)
      : null;

    const openComplaints = (complaints?.complaints ?? []).filter(
      (complaint) => complaint.status === 'OPEN' || complaint.status === 'IN_PROGRESS',
    ).length;

    return {
      profile: profile.profile,
      property: properties?.properties ?? [],
      finance: {
        outstandingCount: finance?.outstanding.length ?? 0,
        outstandingTotalKobo:
          finance?.outstanding.reduce((total, invoice) => total + invoice.amountKobo, 0) ?? 0,
      },
      codes: {
        activeCount: (codes?.codes ?? []).filter((code) => code.status === 'ACTIVE').length,
      },
      estateOffice: {
        openComplaints,
        latestAnnouncement: community?.announcements[0] ?? null,
        activeBroadcast: community?.broadcast ?? null,
      },
      notifications: {
        upcomingBookings: bookings?.upcoming ?? [],
        recentNotifications: (notifications?.recentNotifications ?? []).slice(
          0,
          RECENT_NOTIFICATION_LIMIT,
        ),
      },
    };
  }
}
