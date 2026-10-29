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

import type { BankTransferDetailsDto, SosContactDto } from './settings-contract.js';

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
  /** Bank-transfer instructions, when the estate office has configured them. */
  paymentDetails: BankTransferDetailsDto | null;
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
  /** Visitor the code was issued for. */
  visitorName: string | null;
  /** Vehicle plate presented at the gate, when supplied. */
  carPlate: string | null;
  /** Relative media URL of the visitor's ID image. */
  idDocumentUrl: string | null;
}

export interface ResidentAccessCodesResponse {
  codes: ResidentAccessCodeDto[];
  /** The estate's configured default validity for a newly generated code. */
  defaultDurationHours: number;
  /** The estate's configured maximum validity a resident may request. */
  maxDurationHours: number;
}

export interface ResidentGenerateAccessCodeInput {
  kind: AccessCodeKind;
  /** Validity window in hours; defaults to the estate setting when omitted. */
  durationHours?: number;
  /** Visitor the code is being issued for. */
  visitorName: string;
  /** Vehicle plate presented at the gate, when supplied. */
  carPlate?: string;
  /** Uploaded visitor ID image URL. */
  idDocumentUrl?: string;
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

// --- Operator gate access (Phase 6) ---------------------------------------------

/** Gate directions a verification can be performed against. */
export const ACCESS_VERIFICATION_GATES = ['ENTRY', 'EXIT'] as const;
export type AccessVerificationGate = (typeof ACCESS_VERIFICATION_GATES)[number];

/** Every verification attempt is either granted or denied. */
export const ACCESS_VERIFICATION_OUTCOMES = ['GRANTED', 'DENIED'] as const;
export type AccessVerificationOutcome = (typeof ACCESS_VERIFICATION_OUTCOMES)[number];

/** Why a verification was denied. Null when it was granted. */
export const ACCESS_VERIFICATION_REASONS = [
  'NOT_FOUND',
  'REVOKED',
  'EXPIRED',
  'WRONG_DIRECTION',
] as const;
export type AccessVerificationReason = (typeof ACCESS_VERIFICATION_REASONS)[number];

/** A resident access code with the resident/property context staff need. */
export interface OperatorAccessCodeDto {
  id: string;
  kind: AccessCodeKind;
  status: AccessCodeStatus;
  codePrefix: string;
  validUntil: string | null;
  issuedAt: string;
  revokedAt: string | null;
  /** Visitor the code was issued for. */
  visitorName: string | null;
  /** Vehicle plate presented at the gate, when supplied. */
  carPlate: string | null;
  /** Relative media URL of the visitor's ID image. */
  idDocumentUrl: string | null;
  resident: OperatorResidentSummaryDto | null;
  property: OperatorPropertySummaryDto | null;
}

export interface OperatorAccessCodesResponse {
  codes: OperatorAccessCodeDto[];
}

export interface OperatorRevokeAccessCodeResponse {
  ok: true;
  code: OperatorAccessCodeDto;
}

/** One gate verification attempt, never the code itself. */
export interface AccessVerificationDto {
  id: string;
  accessCodeId: string | null;
  gate: AccessVerificationGate;
  outcome: AccessVerificationOutcome;
  reason: AccessVerificationReason | null;
  codePrefix: string | null;
  occurredAt: string;
  /** Visitor details carried by the presented code, when it exists. */
  visitorName: string | null;
  carPlate: string | null;
  idDocumentUrl: string | null;
  resident: OperatorResidentSummaryDto | null;
  property: OperatorPropertySummaryDto | null;
  verifiedBy: OperatorActorSummaryDto | null;
}

export interface AccessVerificationsResponse {
  verifications: AccessVerificationDto[];
}

export interface OperatorVerifyAccessCodeInput {
  code: string;
  gate: AccessVerificationGate;
}

export interface OperatorVerifyAccessCodeResponse {
  ok: true;
  verification: AccessVerificationDto;
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

export const MESSAGE_THREAD_STATUSES = ['OPEN', 'CLOSED'] as const;
export type MessageThreadStatus = (typeof MESSAGE_THREAD_STATUSES)[number];
export type MessageSenderRole = 'RESIDENT' | 'ESTATE_OFFICE';

export interface ResidentMessageDto {
  id: string;
  senderRole: MessageSenderRole;
  body: string;
  createdAt: string;
}

export interface ResidentMessageThreadDto {
  id: string;
  subject: string;
  status: MessageThreadStatus;
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

// --- Operator messages & complaints (Phase 4) ---------------------------------------

/** Shared resident context used by the operator messaging/complaint screens. */
export interface OperatorResidentSummaryDto {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
}

/** Shared assigned-property context used by the operator screens. */
export interface OperatorPropertySummaryDto {
  id: string;
  identifier: string;
  name: string | null;
  estate: { id: string; name: string; slug: string };
}

/** A staff or resident account that authored a message/reply. */
export interface OperatorActorSummaryDto {
  id: string;
  fullName: string | null;
  email: string;
  role: string;
}

export interface OperatorMessageDto {
  id: string;
  senderRole: MessageSenderRole;
  body: string;
  createdAt: string;
  author: OperatorActorSummaryDto | null;
}

export interface OperatorMessageThreadDto {
  id: string;
  subject: string;
  status: MessageThreadStatus;
  resident: OperatorResidentSummaryDto | null;
  property: OperatorPropertySummaryDto | null;
  messages: OperatorMessageDto[];
  /** Resident messages created after the shared staff read marker. */
  unreadCount: number;
  staffLastReadAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorMessagesResponse {
  threads: OperatorMessageThreadDto[];
}

export interface OperatorMessageReplyInput {
  body: string;
}

export interface OperatorMessageThreadResponse {
  ok: true;
  thread: OperatorMessageThreadDto;
}

export interface OperatorComplaintReplyDto {
  id: string;
  body: string;
  createdAt: string;
  author: OperatorActorSummaryDto | null;
}

export interface OperatorComplaintDto {
  id: string;
  category: string;
  subject: string;
  description: string;
  status: ComplaintStatus;
  resolvedAt: string | null;
  resident: OperatorResidentSummaryDto | null;
  property: OperatorPropertySummaryDto | null;
  replies: OperatorComplaintReplyDto[];
  createdAt: string;
  updatedAt: string;
}

export interface OperatorComplaintsResponse {
  complaints: OperatorComplaintDto[];
}

export interface OperatorComplaintReplyInput {
  body: string;
}

export interface OperatorComplaintStatusInput {
  status: ComplaintStatus;
}

export interface OperatorComplaintResponse {
  ok: true;
  complaint: OperatorComplaintDto;
}

// --- Operator billing (Phase 5) -----------------------------------------------------

/** Manual payment methods the estate office can record. Provider settlement is out of scope. */
export const OPERATOR_PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'POS',
  'CHEQUE',
  'OTHER',
] as const;
export type OperatorPaymentMethod = (typeof OPERATOR_PAYMENT_METHODS)[number];

export interface OperatorInvoiceDto {
  id: string;
  period: string;
  amountKobo: number;
  currency: string;
  status: ResidentInvoiceStatus;
  dueAt: string;
  issuedAt: string;
  createdAt: string;
  updatedAt: string;
  /** True when the invoice is stored OVERDUE, or still unpaid past its due date. */
  overdue: boolean;
  resident: OperatorResidentSummaryDto | null;
  property: OperatorPropertySummaryDto | null;
  paidKobo: number;
  paymentCount: number;
  createdBy: OperatorActorSummaryDto | null;
  voidedAt: string | null;
  voidedBy: OperatorActorSummaryDto | null;
}

export interface OperatorInvoicesResponse {
  invoices: OperatorInvoiceDto[];
}

export interface OperatorCreateInvoiceInput {
  residentId: string;
  period: string;
  amountKobo: number;
  dueAt: string;
}

export interface OperatorInvoiceResponse {
  ok: true;
  invoice: OperatorInvoiceDto;
}

export interface OperatorRecordPaymentInput {
  method: OperatorPaymentMethod;
  reference?: string;
  paidAt?: string;
}

export interface OperatorPaymentDto {
  id: string;
  invoiceId: string;
  period: string;
  amountKobo: number;
  method: string;
  reference: string | null;
  paidAt: string;
  createdAt: string;
  resident: OperatorResidentSummaryDto | null;
  property: OperatorPropertySummaryDto | null;
  recordedBy: OperatorActorSummaryDto | null;
}

export interface OperatorPaymentsResponse {
  payments: OperatorPaymentDto[];
}

export interface OperatorRecordPaymentResponse {
  ok: true;
  payment: OperatorPaymentDto;
  invoice: OperatorInvoiceDto;
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
  /** The facility's estate. Residents only see facilities on their own estate. */
  estate: { id: string; name: string; slug: string };
  /** Flat fee for one booking, in kobo. 0 = free. */
  usageFeeKobo: number;
}

export const BOOKING_STATUSES = ['REQUESTED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Manual payment state. Provider settlement is out of scope. */
export const BOOKING_PAYMENT_STATUSES = ['UNPAID', 'PAID', 'NOT_REQUIRED'] as const;
export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUSES)[number];

export interface BookingDto {
  id: string;
  facilityId: string;
  facilityName: string;
  startsAt: string;
  endsAt: string;
  attendees: number | null;
  status: BookingStatus;
  /** Flat facility fee snapshot taken at request time. */
  feeKobo: number;
  paymentStatus: BookingPaymentStatus;
  invoiceId: string | null;
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

// --- Operator facilities & bookings (Phase 7) ---------------------------------------

/** Active facilities appear in the register; archived ones are retained. */
export const OPERATOR_FACILITY_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type OperatorFacilityStatus = (typeof OPERATOR_FACILITY_STATUSES)[number];

export interface OperatorFacilityDto {
  id: string;
  name: string;
  description: string;
  estate: { id: string; name: string; slug: string };
  bookable: boolean;
  usageFeeKobo: number;
  archivedAt: string | null;
  liveBookingCount: number;
  waitingWatchCount: number;
  createdAt: string;
}

export interface OperatorFacilitiesResponse {
  facilities: OperatorFacilityDto[];
}

export interface OperatorCreateFacilityInput {
  name: string;
  description: string;
  estateId: string;
  usageFeeKobo?: number;
  bookable?: boolean;
}

export interface OperatorUpdateFacilityInput {
  name?: string;
  description?: string;
  estateId?: string;
  usageFeeKobo?: number;
  bookable?: boolean;
}

export interface OperatorFacilityResponse {
  ok: true;
  facility: OperatorFacilityDto;
}

export interface OperatorBookingDto {
  id: string;
  facilityId: string;
  facilityName: string;
  estate: { id: string; name: string; slug: string };
  resident: OperatorResidentSummaryDto | null;
  property: OperatorPropertySummaryDto | null;
  startsAt: string;
  endsAt: string;
  attendees: number | null;
  feeKobo: number;
  paymentStatus: BookingPaymentStatus;
  invoiceId: string | null;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OperatorBookingsResponse {
  bookings: OperatorBookingDto[];
}

export interface OperatorBookingResponse {
  ok: true;
  booking: OperatorBookingDto;
}

export interface OperatorConfirmBookingPaymentInput {
  method: OperatorPaymentMethod;
  reference?: string;
  paidAt?: string;
}

export interface OperatorConfirmBookingPaymentResponse {
  ok: true;
  booking: OperatorBookingDto;
  invoice: OperatorInvoiceDto;
  payment: OperatorPaymentDto;
}

/** Stored watch states. A past WAITING watch is displayed as EXPIRED. */
export const FACILITY_WATCH_STATUSES = ['WAITING', 'NOTIFIED', 'CANCELLED', 'EXPIRED'] as const;
export type FacilityWatchStatus = (typeof FACILITY_WATCH_STATUSES)[number];

export interface ResidentFacilityWatchDto {
  id: string;
  facilityId: string;
  facilityName: string;
  startsAt: string;
  endsAt: string;
  status: FacilityWatchStatus;
  notifiedAt: string | null;
  createdAt: string;
}

export interface ResidentFacilityWatchesResponse {
  watches: ResidentFacilityWatchDto[];
}

export interface ResidentCreateFacilityWatchInput {
  facilityId: string;
  startsAt: string;
  endsAt: string;
}

export interface ResidentCreateFacilityWatchResponse {
  ok: true;
  watch: ResidentFacilityWatchDto;
}

export interface ResidentCancelFacilityWatchResponse {
  ok: true;
  watch: ResidentFacilityWatchDto;
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
  /** Active predefined emergency contacts configured by the estate office. */
  contacts: SosContactDto[];
}

export interface ResidentCreateSosInput {
  note?: string;
}

export interface ResidentCreateSosResponse {
  ok: true;
  event: SosEventDto;
}

/**
 * Operator-facing SOS shape. It carries the resident/property context and the
 * staff actors, plus the internal resolution note. The resident-facing
 * `SosEventDto` deliberately omits the internal note.
 */
export interface SosOperatorResidentDto {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
}

export interface SosOperatorPropertyDto {
  id: string;
  identifier: string;
  name: string | null;
  estate: { id: string; name: string; slug: string };
}

export interface SosOperatorActorDto {
  id: string;
  fullName: string | null;
  email: string;
}

export interface SosOperatorEventDto {
  id: string;
  note: string | null;
  status: SosStatus;
  raisedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  resident: SosOperatorResidentDto | null;
  property: SosOperatorPropertyDto | null;
  acknowledgedBy: SosOperatorActorDto | null;
  resolvedBy: SosOperatorActorDto | null;
}

export interface OperatorSosEventsResponse {
  events: SosOperatorEventDto[];
  /** Active predefined emergency contacts configured by the estate office. */
  contacts: SosContactDto[];
}

export interface OperatorResolveSosInput {
  resolutionNote?: string;
}

export interface OperatorSosMutationResponse {
  ok: true;
  event: SosOperatorEventDto;
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
