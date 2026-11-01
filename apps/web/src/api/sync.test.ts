import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { SYNC_DOMAINS, residentSectionForLink } from '@silverstone/shared';
import { DOMAIN_QUERY_KEYS, SYNC_INTERVAL_MS } from './sync';
import { invalidateNavigationCounts } from './navigation';
import { queryKeys } from './query-keys';

describe('live sync', () => {
  it('polls fast enough to feel live', () => {
    expect(SYNC_INTERVAL_MS).toBeLessThanOrEqual(5_000);
  });

  it('maps every sync domain to at least one query key', () => {
    for (const domain of SYNC_DOMAINS) {
      const keys = DOMAIN_QUERY_KEYS[domain];
      expect(keys.length, domain).toBeGreaterThan(0);
      for (const key of keys) expect(key.length, domain).toBeGreaterThan(0);
    }
  });

  it('refreshes both shells from one domain change', () => {
    // A resident booking decision must refresh the operator queue and the
    // resident bookings screen, so both prefixes are present.
    const serialized = DOMAIN_QUERY_KEYS.bookings.map((key) => JSON.stringify(key));
    expect(serialized).toContain(JSON.stringify(['bookings']));
    expect(serialized).toContain(JSON.stringify(['resident', 'facilities']));

    const paymentKeys = DOMAIN_QUERY_KEYS.payments.map((key) => JSON.stringify(key));
    expect(paymentKeys).toContain(JSON.stringify(['resident', 'finance']));
    expect(paymentKeys).toContain(JSON.stringify(['invoices']));
  });

  it('maps notification routes to resident sections', () => {
    expect(residentSectionForLink('/resident/app/bookings')).toBe('bookings');
    expect(residentSectionForLink('/resident/app/codes?x=1')).toBe('codes');
    expect(residentSectionForLink('/resident/app/messages/1')).toBe('messages');
    expect(residentSectionForLink('/resident/app/invoices')).toBe('invoices');
    expect(residentSectionForLink('/resident/app/sos')).toBe('sos');
    expect(residentSectionForLink('/resident/app/community')).toBe('community');
    expect(residentSectionForLink(null)).toBe('notifications');
    expect(residentSectionForLink('/resident/app/profile')).toBe('notifications');
  });

  it('immediately refreshes the sync snapshot after a mutation', async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
    await invalidateNavigationCounts(client);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.sync.snapshot });
  });
});
