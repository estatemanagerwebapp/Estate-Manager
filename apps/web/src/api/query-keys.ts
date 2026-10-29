import type { OperatorSosFilter, UserFilter } from './client';

/**
 * Query-key registry for the operator console.
 *
 * Keys are intentionally stable and hierarchical. A mutation invalidates the
 * narrowest key that owns the changed data (for example `users.all`, not the
 * whole cache), and the header Refresh invalidates only active queries.
 *
 * Existing screens still use equivalent literal keys. New operator modules
 * should import from this file, and older screens can migrate as they are
 * touched without changing their cache behavior.
 */
export const queryKeys = {
  dashboard: {
    all: ['dashboard'] as const,
    kpis: ['dashboard', 'kpis'] as const,
    activity: (limit: number) => ['dashboard', 'activity', limit] as const,
  },
  houseTypes: ['house-types'] as const,
  estates: {
    all: ['estates'] as const,
    detail: (estateId: string) => ['estate', estateId] as const,
  },
  properties: {
    all: ['properties'] as const,
    detail: (propertyId: string) => ['property', propertyId] as const,
  },
  users: {
    all: ['users'] as const,
    list: (filter: UserFilter) => ['users', filter] as const,
  },
  residents: {
    all: ['residents'] as const,
  },
  audit: {
    all: ['activity'] as const,
    list: () => ['activity'] as const,
  },
  // Operator modules added in later phases. Keeping the names here makes the
  // invalidation convention visible before the screens exist.
  messages: {
    all: ['messages'] as const,
    list: (filter: Record<string, unknown> = {}) => ['messages', filter] as const,
    detail: (threadId: string) => ['message-thread', threadId] as const,
  },
  complaints: {
    all: ['complaints'] as const,
    list: (filter: Record<string, unknown> = {}) => ['complaints', filter] as const,
    detail: (complaintId: string) => ['complaint', complaintId] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    list: (filter: Record<string, unknown> = {}) => ['invoices', filter] as const,
    detail: (invoiceId: string) => ['invoice', invoiceId] as const,
  },
  payments: {
    all: ['payments'] as const,
    list: (filter: Record<string, unknown> = {}) => ['payments', filter] as const,
  },
  accessCodes: {
    all: ['access-codes'] as const,
    list: (filter: Record<string, unknown> = {}) => ['access-codes', filter] as const,
  },
  verifications: {
    all: ['verifications'] as const,
    list: (filter: Record<string, unknown> = {}) => ['verifications', filter] as const,
  },
  facilities: {
    all: ['facilities'] as const,
    list: (filter: Record<string, unknown> = {}) => ['facilities', filter] as const,
  },
  bookings: {
    all: ['bookings'] as const,
    list: (filter: Record<string, unknown> = {}) => ['bookings', filter] as const,
  },
  sos: {
    all: ['sos'] as const,
    list: (filter: OperatorSosFilter = {}) => ['sos', filter] as const,
  },
  administrators: {
    all: ['administrators'] as const,
    list: (filter: UserFilter = {}) => ['administrators', filter] as const,
  },
};
