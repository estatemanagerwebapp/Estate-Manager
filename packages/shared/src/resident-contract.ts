/**
 * Resident dashboard wire contracts (Phase 3).
 *
 * These types describe the envelope payloads for the resident-facing portal
 * (`/resident/app/*`). The resident modules in `apps/api` produce them.
 *
 * All resident endpoints are self-scoped: a resident can only read or write
 * their own data. The API enforces this server-side; the shared contracts
 * here are the wire shapes only.
 */

// --- Profile (S1) -------------------------------------------------------------

export interface ResidentProfileDto {
  id: string;
  email: string;
  phone: string | null;
  fullName: string | null;
  // Onboarding details (from the linked ResidentOnboarding)
  gender: string | null;
  maritalStatus: string | null;
  propertyType: string | null;
  nextOfKinName: string | null;
  nextOfKinPhone: string | null;
  nextOfKinEmail: string | null;
  idType: string | null;
  idDocumentUrl: string | null;
  // Assigned property
  property: {
    identifier: string;
    estate: { name: string; slug: string };
  } | null;
}

export interface ResidentProfileView {
  profile: ResidentProfileDto;
}

export interface ResidentProfileUpdateInput {
  phone?: string | null;
  nextOfKinName?: string | null;
  nextOfKinPhone?: string | null;
  nextOfKinEmail?: string | null;
  idType?: string | null;
  propertyType?: string | null;
}

export interface ResidentProfileUpdateResponse {
  ok: true;
  profile: ResidentProfileDto;
}

// --- My Properties (S2) ---------------------------------------------------------

export interface ResidentPropertyDto {
  identifier: string;
  kind: 'HOUSE' | 'LAND' | 'BOTH';
  kindLabel: string;
  houseType: string | null;
  houseTypeLabel: string | null;
  streetName: string;
  houseNumber: string | null;
  blockName: string | null;
  floorNumber: string | null;
  unitNumber: string | null;
  plotNumber: string | null;
  plotName: string | null;
  status: string;
  estate: { name: string; slug: string };
  /** Formatted full address assembled from the typed address fields. */
  fullAddress: string;
}

export interface ResidentPropertiesResponse {
  properties: ResidentPropertyDto[];
}

// --- Invoices & Payments (S3) ---------------------------------------------------

export const RESIDENT_INVOICE_STATUSES = ['UNPAID', 'PAID', 'OVERDUE', 'VOID'] as const;
export type ResidentInvoiceStatus = (typeof RESIDENT_INVOICE_STATUSES)[number];

export interface ResidentInvoiceDto {
  id: string;
  period: string;
  amountKobo: number;
  currency: string;
  status: ResidentInvoiceStatus;
  dueAt: string;
  issuedAt: string;
}

export interface ResidentPaymentDto {
  id: string;
  invoiceId: string;
  amountKobo: number;
  method: string;
  reference: string | null;
  paidAt: string;
}

export interface ResidentTransactionDto {
  id: string;
  kind: 'INVOICE' | 'PAYMENT' | 'REFUND' | 'FEE';
  amountKobo: number;
  /** Positive = credit (incoming), negative = debit (outgoing). */
  signed: number;
  memo: string | null;
  reference: string | null;
  occurredAt: string;
}

export interface ResidentFinanceView {
  outstanding: ResidentInvoiceDto[];
  paid: ResidentInvoiceDto[];
  payments: ResidentPaymentDto[];
  transactions: ResidentTransactionDto[];
}

export interface ResidentCreatePaymentInput {
  invoiceId: string;
  method?: string;
  reference?: string;
}

export interface ResidentCreatePaymentResponse {
  ok: true;
  payment: ResidentPaymentDto;
}

// --- Access Codes (S4) ----------------------------------------------------------

export const ACCESS_CODE_KINDS = ['ENTRY', 'EXIT', 'BOTH'] as const;
export type AccessCodeKind = (typeof ACCESS_CODE_KINDS)[number];

export const ACCESS_CODE_STATUSES = ['ACTIVE', 'REVOKED', 'EXPIRED'] as const;
export type AccessCodeStatus = (typeof ACCESS_CODE_STATUSES)[number];

export interface ResidentAccessCodeDto {
  id: string;
  kind: AccessCodeKind;
  status: AccessCodeStatus;
  /** First 4 chars of the code for display; the full code is returned only once. */
  codePrefix: string;
  validUntil: string | null;
  issuedAt: string;
  revokedAt: string | null;
}

export interface ResidentGenerateAccessCodeInput {
  kind: AccessCodeKind;
  /** Validity window in days; defaults to 30 when omitted. */
  durationDays?: number;
}

export interface ResidentGenerateAccessCodeResponse {
  ok: true;
  /** Full code, returned exactly once (like the onboarding demo password). */
  code: string;
  codeId: string;
}

export interface ResidentExtendAccessCodeResponse {
  ok: true;
  code: ResidentAccessCodeDto;
}

export interface ResidentDeactivateAccessCodeResponse {
  ok: true;
  code: ResidentAccessCodeDto;
}

// --- Complaints (S5) -------------------------------------------------------------

export const COMPLAINT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export interface ComplaintReplyDto {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface ResidentComplaintDto {
  id: string;
  category: string;
  subject: string;
  description: string;
  status: ComplaintStatus;
  replies: ComplaintReplyDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ResidentComplaintsResponse {
  complaints: ResidentComplaintDto[];
}

export interface ResidentCreateComplaintInput {
  category: string;
  subject: string;
  description: string;
}

export interface ResidentCreateComplaintResponse {
  ok: true;
  complaint: ResidentComplaintDto;
}

// --- Messages (S6) ---------------------------------------------------------------

export interface ResidentMessageDto {
  id: string;
  senderRole: 'RESIDENT' | 'ESTATE_OFFICE';
  body: string;
  createdAt: string;
}

export interface ResidentMessageThreadDto {
  id: string;
  subject: string;
  status: 'OPEN' | 'CLOSED';
  messages: ResidentMessageDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ResidentMessagesResponse {
  threads: ResidentMessageThreadDto[];
}

export interface ResidentSendMessageInput {
  /** Omit for a new thread; provide to reply into an existing one. */
  threadId?: string;
  subject?: string;
  body: string;
}

export interface ResidentSendMessageResponse {
  ok: true;
  thread: ResidentMessageThreadDto;
}

// --- Community (S7) ----------------------------------------------------------------

export interface AnnouncementDto {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}

export interface EstateBroadcastDto {
  id: string;
  estateId: string;
  title: string;
  body: string;
  priority: 'INFO' | 'WARNING' | 'CRITICAL';
  issuedAt: string;
  /** Null = the broadcast does not expire. */
  expiresAt: string | null;
}

export interface ResidentCommunityView {
  announcements: AnnouncementDto[];
  broadcast: EstateBroadcastDto | null;
}

// --- Facilities & Bookings (S8) -----------------------------------------------------

export interface FacilityDto {
  id: string;
  name: string;
  description: string;
  bookable: boolean;
}

export const BOOKING_STATUSES = ['REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface BookingDto {
  id: string;
  facilityId: string;
  facilityName: string;
  startsAt: string;
  endsAt: string;
  attendees: number | null;
  status: BookingStatus;
}

export interface ResidentBookingsView {
  facilities: FacilityDto[];
  upcoming: BookingDto[];
  /** Bookings whose window has already passed (or that were cancelled). */
  past: BookingDto[];
}

export interface ResidentCreateBookingInput {
  facilityId: string;
  startsAt: string;
  endsAt: string;
  attendees?: number;
}

export interface ResidentCreateBookingResponse {
  ok: true;
  booking: BookingDto;
}

export interface ResidentCancelBookingResponse {
  ok: true;
  booking: BookingDto;
}

// --- Emergency / SOS (S9) -------------------------------------------------------------

export const SOS_STATUSES = ['RAISED', 'ACKNOWLEDGED', 'RESOLVED'] as const;
export type SosStatus = (typeof SOS_STATUSES)[number];

export interface SosEventDto {
  id: string;
  note: string | null;
  status: SosStatus;
  raisedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

export interface ResidentSosEventsResponse {
  events: SosEventDto[];
}

export interface ResidentCreateSosInput {
  note?: string;
}

export interface ResidentCreateSosResponse {
  ok: true;
  event: SosEventDto;
}

// --- Notifications (S10) ---------------------------------------------------------------

export interface ResidentNotificationDto {
  id: string;
  kind: 'BOOKING' | 'ANNOUNCEMENT' | 'BROADCAST' | 'COMPLANT' | 'SYSTEM';
  title: string;
  body: string;
  read: boolean;
  linkTo: string | null;
  createdAt: string;
}

export interface ResidentNotificationsView {
  upcomingBookings: BookingDto[];
  recentNotifications: ResidentNotificationDto[];
  unreadCount: number;
}

export interface ResidentMarkNotificationReadInput {
  id: string;
}

export interface ResidentMarkNotificationReadResponse {
  ok: true;
}

// --- Dashboard aggregate (S11) -----------------------------------------------------------

export interface ResidentDashboardView {
  profile: ResidentProfileDto;
  property: ResidentPropertyDto[];
  finance: {
    outstandingCount: number;
    outstandingTotalKobo: number;
  };
  codes: {
    activeCount: number;
  };
  estateOffice: {
    openComplaints: number;
    latestAnnouncement: AnnouncementDto | null;
    activeBroadcast: EstateBroadcastDto | null;
  };
  notifications: {
    upcomingBookings: BookingDto[];
    recentNotifications: ResidentNotificationDto[];
  };
}
