import { describe, expect, it } from 'vitest';
import {
  domainsForEventTypes,
  emptyResidentCounts,
  residentCountsFromLinks,
} from './modules/sync/sync.service.js';

describe('sync domain mapping', () => {
  it('maps audit event types to the screens they change', () => {
    expect(domainsForEventTypes(['booking.confirmed'])).toEqual(['bookings']);
    expect(domainsForEventTypes(['verification.recorded'])).toEqual(['codes']);
    expect(domainsForEventTypes(['payment.recorded'])).toEqual(['payments']);
    expect(domainsForEventTypes(['sos.acknowledged'])).toEqual(['sos']);
  });

  it('ignores events that no screen needs to refresh', () => {
    expect(domainsForEventTypes(['login.succeeded', 'audit.exported'])).toEqual([]);
  });

  it('deduplicates domains across event types', () => {
    expect(
      domainsForEventTypes(['resident.booking_created', 'booking.confirmed', 'booking.cancelled']),
    ).toEqual(['bookings']);
  });
});

describe('resident badge counts', () => {
  it('starts with every counter present and zeroed', () => {
    expect(emptyResidentCounts()).toEqual({
      unreadNotifications: 0,
      bookingUpdates: 0,
      codeUpdates: 0,
      messageUpdates: 0,
      invoiceUpdates: 0,
      sosUpdates: 0,
      communityUpdates: 0,
    });
  });

  it('groups unread notifications by the route they point at', () => {
    const counts = residentCountsFromLinks([
      { linkTo: '/resident/app/bookings', count: 2 },
      { linkTo: '/resident/app/codes', count: 1 },
      { linkTo: '/resident/app/messages/1', count: 3 },
      { linkTo: '/resident/app/invoices', count: 1 },
      { linkTo: null, count: 2 },
    ]);

    expect(counts).toEqual({
      unreadNotifications: 9,
      bookingUpdates: 2,
      codeUpdates: 1,
      messageUpdates: 3,
      invoiceUpdates: 1,
      sosUpdates: 0,
      communityUpdates: 0,
    });
  });

  it('counts unknown routes only against the bell, not a section', () => {
    expect(residentCountsFromLinks([{ linkTo: '/resident/app/profile', count: 4 }])).toEqual({
      unreadNotifications: 4,
      bookingUpdates: 0,
      codeUpdates: 0,
      messageUpdates: 0,
      invoiceUpdates: 0,
      sosUpdates: 0,
      communityUpdates: 0,
    });
  });
});
