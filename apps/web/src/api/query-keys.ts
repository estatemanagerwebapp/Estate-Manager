import type { AuditEventFilter } from '@silverstone/shared';
import type {
  AccessVerificationFilter,
  OperatorAccessCodeFilter,
  OperatorBookingFilter,
  OperatorComplaintFilter,
  OperatorFacilityFilter,
  OperatorInvoiceFilter,
  OperatorMessageFilter,
  OperatorPaymentFilter,
  OperatorSosFilter,
  UserFilter,
} from './client';

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
  navigation: {
    all: ['navigation'] as const,
    counts: ['navigation', 'counts'] as const,
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
    list: (filter: AuditEventFilter = {}) => ['activity', filter] as const,
  },
  orgImports: {
    all: ['org-imports'] as const,
    detail: (batchId: string) => ['org-import', batchId] as const,
  },
  // Operator modules added in later phases. Keeping the names here makes the
  // invalidation convention visible before the screens exist.
  messages: {
    all: ['messages'] as const,
    list: (filter: OperatorMessageFilter = {}) => ['messages', filter] as const,
    detail: (threadId: string) => ['message-thread', threadId] as const,
  },
  complaints: {
    all: ['complaints'] as const,
    list: (filter: OperatorComplaintFilter = {}) => ['complaints', filter] as const,
    detail: (complaintId: string) => ['complaint', complaintId] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    list: (filter: OperatorInvoiceFilter = {}) => ['invoices', filter] as const,
    detail: (invoiceId: string) => ['invoice', invoiceId] as const,
  },
  payments: {
    all: ['payments'] as const,
    list: (filter: OperatorPaymentFilter = {}) => ['payments', filter] as const,
  },
  accessCodes: {
    all: ['access-codes'] as const,
    list: (filter: OperatorAccessCodeFilter = {}) => ['access-codes', filter] as const,
  },
  verifications: {
    all: ['verifications'] as const,
    list: (filter: AccessVerificationFilter = {}) => ['verifications', filter] as const,
  },
  facilities: {
    all: ['facilities'] as const,
    list: (filter: OperatorFacilityFilter = {}) => ['facilities', filter] as const,
  },
  bookings: {
    all: ['bookings'] as const,
    list: (filter: OperatorBookingFilter = {}) => ['bookings', filter] as const,
  },
  resident: {
    facilities: ['resident', 'facilities'] as const,
    facilityWatches: ['resident', 'facility-watches'] as const,
    dashboard: ['resident', 'dashboard'] as const,
  },
  sos: {
    all: ['sos'] as const,
    list: (filter: OperatorSosFilter = {}) => ['sos', filter] as const,
  },
  administrators: {
    all: ['administrators'] as const,
    list: (filter: UserFilter = {}) => ['administrators', filter] as const,
  },
  settings: {
    all: ['settings'] as const,
  },
};
