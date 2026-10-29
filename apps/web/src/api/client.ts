import type {
  ChangePasswordResponse,
  CompleteResidentOnboardingResponse,
  LoginResponse,
  LogoutResponse,
  MeResponse,
  RegisterResidentInput,
  RegisterResidentResponse,
  ResetPasswordResponse,
  UserDto,
  UserListResponse,
  UserDetailResponse,
  AdminCreateUserInput,
  AdminCreateUserResponse,
  RevokeUserSessionsResponse,
  SetUserStatusResponse,
  SetUserRoleResponse,
  DeleteUserResponse,
  ApiErrorBody,
  ApiSuccessBody,
  CreateEstateInput,
  UpdateEstateInput,
  EstateListResponse,
  EstateDetailResponse,
  SetEstateStatusResponse,
  CreatePropertyInput,
  UpdatePropertyInput,
  PropertyListResponse,
  PropertyDetailResponse,
  HouseTypesResponse,
  ImportPreviewResponse,
  ImportCommitResponse,
  ImportBatchDto,
  ImportRowDto,
  EstateDto,
  PropertyDto,
  ResidentOnboardingDto,
  OnboardingGuestView,
  OnboardingSaveInput,
  OnboardingSaveResponse,
  AdminMarkPaidInput,
  AdminMarkPaidResponse,
  AdminSetResidentPortalAccessInput,
  AdminUpdateResidentInput,
  ResidentMutationResponse,
  AuditEventDto,
  ResidentProfileView,
  ResidentProfileUpdateInput,
  ResidentProfileUpdateResponse,
  ResidentPropertiesResponse,
  ResidentFinanceView,
  ResidentCreatePaymentInput,
  ResidentCreatePaymentResponse,
  ResidentAccessCodesResponse,
  ResidentGenerateAccessCodeInput,
  ResidentGenerateAccessCodeResponse,
  ResidentExtendAccessCodeResponse,
  ResidentDeactivateAccessCodeResponse,
  ResidentComplaintsResponse,
  ResidentCreateComplaintInput,
  ResidentCreateComplaintResponse,
  ComplaintStatus,
  ResidentMessagesResponse,
  ResidentSendMessageInput,
  ResidentSendMessageResponse,
  ResidentCommunityView,
  ResidentBookingsView,
  ResidentCreateBookingInput,
  ResidentCreateBookingResponse,
  ResidentCancelBookingResponse,
  ResidentFacilityWatchesResponse,
  ResidentCreateFacilityWatchInput,
  ResidentCreateFacilityWatchResponse,
  ResidentCancelFacilityWatchResponse,
  OperatorFacilitiesResponse,
  OperatorFacilityResponse,
  OperatorCreateFacilityInput,
  OperatorUpdateFacilityInput,
  OperatorBookingsResponse,
  OperatorBookingResponse,
  OperatorConfirmBookingPaymentInput,
  OperatorConfirmBookingPaymentResponse,
  BookingPaymentStatus,
  BookingStatus,
  OperatorFacilityStatus,
  ResidentSosEventsResponse,
  ResidentCreateSosInput,
  ResidentCreateSosResponse,
  OperatorSosEventsResponse,
  OperatorResolveSosInput,
  OperatorSosMutationResponse,
  MessageThreadStatus,
  OperatorMessagesResponse,
  OperatorMessageThreadResponse,
  OperatorMessageReplyInput,
  OperatorComplaintsResponse,
  OperatorComplaintResponse,
  OperatorComplaintReplyInput,
  OperatorComplaintStatusInput,
  OperatorInvoicesResponse,
  OperatorInvoiceResponse,
  OperatorCreateInvoiceInput,
  OperatorRecordPaymentInput,
  OperatorRecordPaymentResponse,
  OperatorPaymentsResponse,
  OperatorAccessCodesResponse,
  AccessVerificationsResponse,
  OperatorVerifyAccessCodeInput,
  OperatorVerifyAccessCodeResponse,
  AccessCodeKind,
  AccessCodeStatus,
  AccessVerificationGate,
  AccessVerificationOutcome,
  ResidentInvoiceStatus,
  ResidentNotificationsView,
  ResidentMarkNotificationReadResponse,
  ResidentDashboardView,
  OrganizationSettingsView,
  OrganizationSettingsUpdateInput,
} from '@silverstone/shared';

/**
 * Minimal fetch client for the Silverstone API. All methods share the
 * `credentials: 'include'` flag so the HttpOnly session cookie is sent
 * on cross-origin requests in development (Vite proxy keeps them
 * same-origin, but the flag makes intent explicit and future-proof).
 *
 * Every successful API response is an `ApiSuccessBody<T>` envelope: the
 * payload lives under `data`. This client unwraps it, so `request<T>()`
 * resolves to the payload itself — callers never see the envelope.
 *
 * Errors are thrown as `ApiRequestError` with a stable `code` so calling
 * code can branch on it without parsing the message. `NETWORK_ERROR`
 * means the request never completed (proxy down, CORS, browser blocked
 * it); other codes come from the server's error envelope.
 */

export class ApiRequestError extends Error {
  readonly code: string;
  readonly requestId: string | undefined;
  /**
   * Structured field-level errors from the server's error envelope
   * (`error.details`), present on some VALIDATION_ERROR responses.
   * Callers can branch on this without parsing the prose message.
   */
  readonly details?: Array<{ path: string; message: string }>;
  /** HTTP status of the response, when the server produced a 4xx/5xx. */
  readonly status: number | undefined;

  constructor(
    code: string,
    message: string,
    options?: {
      requestId?: string;
      status?: number;
      details?: Array<{ path: string; message: string }>;
    },
  ) {
    super(message);
    this.code = code;
    this.requestId = options?.requestId;
    this.status = options?.status;
    this.details = options?.details;
  }
}

/**
 * Global hook so any 4xx that means "the session is no longer valid" can
 * clear auth state and redirect to the login screen. The `AuthProvider`
 * registers a handler once; the fetch wrapper calls it on 401 so the
 * operator never has to manually re-authenticate after their session
 * expires mid-task.
 */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === 'UNAUTHORIZED';
}

/**
 * Core fetch wrapper. `init.content` (string | Blob) overrides the default
 * JSON serialization; `content` is used for multipart / binary uploads so
 * the `Content-Type` header is not forced to JSON.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isBlobOrForm = init.body instanceof Blob || init.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: {
        ...(isBlobOrForm ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    });
  } catch (error) {
    // Network-level failure: the request never completed. Re-throw as an
    // ApiRequestError so callers can distinguish "server unreachable" from
    // a 4xx/5xx response, and the reason survives to the UI for diagnosis.
    const cause =
      error instanceof Error
        ? [error.message, error.cause instanceof Error ? error.cause.message : undefined]
            .filter(Boolean)
            .join(' — ')
        : String(error);
    throw new ApiRequestError('NETWORK_ERROR', `Request to ${path} failed: ${cause}`, undefined);
  }

  const body = (await response.json().catch(() => ({}))) as
    Partial<ApiSuccessBody<unknown>> | Partial<ApiErrorBody>;

  if (!response.ok) {
    const error = (body as Partial<ApiErrorBody>).error;
    const code = error?.code ?? 'INTERNAL_ERROR';
    // A 401 means the session cookie is no longer accepted (expired, revoked,
    // or logged out elsewhere). Let the auth layer react — but keep going
    // with the normal error path so the caller can still surface the message.
    if (response.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiRequestError(
      code,
      error?.message ?? `Request failed with status ${response.status}`,
      {
        requestId: error?.requestId,
        status: response.status,
        details: error?.details,
      },
    );
  }

  // Unwrap the `{ data }` envelope; the method's generic `T` is the payload.
  return (body as Partial<ApiSuccessBody<T>>).data as T;
}

export interface UserFilter {
  role?: string;
  status?: string;
  /** `staff` excludes RESIDENT accounts (Administrators screen). */
  scope?: 'all' | 'staff';
}

/** Query filters for the estate list (mirrors the API's accepted params). */
export interface EstateFilter {
  /** Free-text search against name/slug. */
  search?: string;
  /** `ACTIVE` or `ARCHIVED`. */
  status?: string;
}

/** Query filters for the operator SOS queue. */
export interface OperatorSosFilter {
  /** `RAISED`, `ACKNOWLEDGED`, or `RESOLVED`. */
  status?: string;
  /** Active means RAISED + ACKNOWLEDGED. Ignored when `status` is set. */
  active?: boolean;
  /** Server caps at 200. */
  limit?: number;
}

/** Query filters for the operator message inbox. */
export interface OperatorMessageFilter {
  status?: MessageThreadStatus;
  /** Server caps at 200. */
  limit?: number;
}

/** Query filters for the operator complaint queue. */
export interface OperatorComplaintFilter {
  status?: ComplaintStatus;
  /** Server caps at 200. */
  limit?: number;
}

/** Query filters for the operator invoice/payment views. */
export interface OperatorInvoiceFilter {
  status?: ResidentInvoiceStatus;
  /** Server caps at 200. */
  limit?: number;
}

export interface OperatorPaymentFilter {
  /** Server caps at 200. */
  limit?: number;
}

/** Query filters for the operator access-code register. */
export interface OperatorAccessCodeFilter {
  status?: AccessCodeStatus;
  kind?: AccessCodeKind;
  /** Server caps at 200. */
  limit?: number;
}

/** Query filters for the gate verification history. */
export interface AccessVerificationFilter {
  outcome?: AccessVerificationOutcome;
  gate?: AccessVerificationGate;
  /** Server caps at 200. */
  limit?: number;
}

/** Query filters for the Phase 7 facility register. */
export interface OperatorFacilityFilter {
  status?: OperatorFacilityStatus;
  estateId?: string;
  /** Server caps at 200. */
  limit?: number;
}

/** Query filters for the Phase 7 booking queue. */
export interface OperatorBookingFilter {
  status?: BookingStatus;
  paymentStatus?: BookingPaymentStatus;
  facilityId?: string;
  /** ISO timestamps; both filter on startsAt. */
  from?: string;
  to?: string;
  /** Server caps at 200. */
  limit?: number;
}

/** Query filters for the property list (paginated on the server). */
export interface PropertyFilter {
  estateId?: string;
  /** `HOUSE`, `LAND`, or `BOTH`. */
  kind?: string;
  /** `ACTIVE` or `ARCHIVED`. */
  status?: string;
  identifierContains?: string;
  page?: number;
  /** Server caps at 200. */
  pageSize?: number;
}

/**
 * Error envelope `details` field (present on VALIDATION_ERROR responses that
 * carry structured field errors).
 */
export interface ApiErrorDetails {
  code: string;
  message: string;
  requestId?: string;
  details?: Array<{ path: string; message: string }>;
}

export const api = {
  // --- Auth ----------------------------------------------------------------
  login: (email: string, password: string) =>
    request<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<LogoutResponse>('/api/v1/auth/logout', { method: 'POST' }),

  me: () => request<MeResponse>('/api/v1/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<ChangePasswordResponse>('/api/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  forgotPassword: (email: string) =>
    request<{ ok: true }>('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    request<ResetPasswordResponse>('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),

  // --- Admin user management -------------------------------------------------
  listUsers: (filter: UserFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.role) params.set('role', filter.role);
    if (filter.status) params.set('status', filter.status);
    if (filter.scope) params.set('scope', filter.scope);
    const qs = params.toString();
    return request<UserListResponse>(`/api/v1/auth/users${qs ? `?${qs}` : ''}`);
  },

  /** Create a staff account. The response carries the temporary password once. */
  createAdministrator: (input: AdminCreateUserInput) =>
    request<AdminCreateUserResponse>('/api/v1/auth/users', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** Sign a managed account out everywhere without changing its status. */
  revokeUserSessions: (userId: string) =>
    request<RevokeUserSessionsResponse>(
      `/api/v1/auth/users/${encodeURIComponent(userId)}/sessions/revoke`,
      { method: 'POST' },
    ),

  getUser: (userId: string) =>
    request<UserDetailResponse>(`/api/v1/auth/users/${encodeURIComponent(userId)}`),

  setUserStatus: (userId: string, status: string, reason?: string) =>
    request<SetUserStatusResponse>(`/api/v1/auth/users/${encodeURIComponent(userId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
    }),

  setUserRole: (userId: string, role: string) =>
    request<SetUserRoleResponse>(`/api/v1/auth/users/${encodeURIComponent(userId)}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  /** Permanently delete a user account. */
  deleteUser: (userId: string) =>
    request<DeleteUserResponse>(`/api/v1/auth/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),

  // --- Registration + onboarding (Phase 2) ---------------------------------
  registerResident: (input: RegisterResidentInput) =>
    request<RegisterResidentResponse>('/api/v1/onboard/residents', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listResidents: () => request<{ residents: ResidentOnboardingDto[] }>('/api/v1/onboard/residents'),

  updateResident: (residentId: string, input: AdminUpdateResidentInput) =>
    request<ResidentMutationResponse>(
      `/api/v1/onboard/residents/${encodeURIComponent(residentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    ),

  archiveResident: (residentId: string) =>
    request<ResidentMutationResponse>(
      `/api/v1/onboard/residents/${encodeURIComponent(residentId)}/archive`,
      { method: 'POST' },
    ),

  restoreResident: (residentId: string) =>
    request<ResidentMutationResponse>(
      `/api/v1/onboard/residents/${encodeURIComponent(residentId)}/restore`,
      { method: 'POST' },
    ),

  setResidentPortalAccess: (residentId: string, input: AdminSetResidentPortalAccessInput) =>
    request<ResidentMutationResponse>(
      `/api/v1/onboard/residents/${encodeURIComponent(residentId)}/portal-access`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  markResidentPaid: (residentId: string, input: AdminMarkPaidInput = {}) =>
    request<AdminMarkPaidResponse>(
      `/api/v1/onboard/residents/${encodeURIComponent(residentId)}/payment`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  /** Delete a resident onboarding draft (testing cleanup). */
  deleteResident: (residentId: string) =>
    request<{ ok: true; id: string }>(
      `/api/v1/onboard/residents/${encodeURIComponent(residentId)}`,
      { method: 'DELETE' },
    ),

  getOnboardingByCode: (code: string) =>
    request<OnboardingGuestView>(`/api/v1/onboard/by-code/${encodeURIComponent(code)}`),

  saveOnboardingDraft: (code: string, input: OnboardingSaveInput) =>
    request<OnboardingSaveResponse>(`/api/v1/onboard/by-code/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  /**
   * Records the resident's out-of-band payment reference (temporary
   * walk-through while the payment gateway is not connected). The draft stays
   * UNPAID until an administrator confirms it.
   */
  submitPaymentNote: (code: string, paymentRef: string) =>
    request<OnboardingSaveResponse>(
      `/api/v1/onboard/by-code/${encodeURIComponent(code)}/payment-note`,
      { method: 'POST', body: JSON.stringify({ paymentRef }) },
    ),

  completeOnboarding: (code: string) =>
    request<CompleteResidentOnboardingResponse>(
      `/api/v1/onboard/by-code/${encodeURIComponent(code)}/complete`,
      { method: 'POST', body: JSON.stringify({ code }) },
    ),

  uploadIdDocument: (code: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ id: string; publicUrl: string; mimeType: string; sizeBytes: number }>(
      `/api/v1/onboard/by-code/${encodeURIComponent(code)}/id-document`,
      {
        method: 'POST',
        body: form,
        // The multipart boundary is set by the browser; do not force JSON.
      },
    );
  },

  // --- Phase 2: estates -------------------------------------------------------
  listEstates: (filter: EstateFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.search) params.set('search', filter.search);
    if (filter.status) params.set('status', filter.status);
    const qs = params.toString();
    return request<EstateListResponse>(`/api/v1/estates${qs ? `?${qs}` : ''}`);
  },

  createEstate: (input: CreateEstateInput) =>
    request<{ estate: EstateDto }>('/api/v1/estates', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getEstate: (estateId: string) =>
    request<EstateDetailResponse>(`/api/v1/estates/${encodeURIComponent(estateId)}`),

  updateEstate: (estateId: string, input: UpdateEstateInput) =>
    request<{ estate: EstateDto }>(`/api/v1/estates/${encodeURIComponent(estateId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  setEstateStatus: (estateId: string, status: 'ACTIVE' | 'ARCHIVED') =>
    request<SetEstateStatusResponse>(`/api/v1/estates/${encodeURIComponent(estateId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  deleteEstate: (estateId: string) =>
    request<{ ok: true }>(`/api/v1/estates/${encodeURIComponent(estateId)}`, {
      method: 'DELETE',
    }),

  // --- Phase 2: properties ----------------------------------------------------
  listProperties: (filter: PropertyFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.estateId) params.set('estateId', filter.estateId);
    if (filter.kind) params.set('kind', filter.kind);
    if (filter.status) params.set('status', filter.status);
    if (filter.identifierContains) params.set('identifierContains', filter.identifierContains);
    if (filter.page) params.set('page', String(filter.page));
    if (filter.pageSize) params.set('pageSize', String(filter.pageSize));
    const qs = params.toString();
    return request<PropertyListResponse>(`/api/v1/properties${qs ? `?${qs}` : ''}`);
  },

  createProperty: (input: CreatePropertyInput) =>
    request<{ property: PropertyDto }>('/api/v1/properties', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getProperty: (propertyId: string) =>
    request<PropertyDetailResponse>(`/api/v1/properties/${encodeURIComponent(propertyId)}`),

  updateProperty: (propertyId: string, input: UpdatePropertyInput) =>
    request<{ property: PropertyDto }>(`/api/v1/properties/${encodeURIComponent(propertyId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  archiveProperty: (propertyId: string) =>
    request<{ property: PropertyDto }>(
      `/api/v1/properties/${encodeURIComponent(propertyId)}/archive`,
      {
        method: 'POST',
      },
    ),

  deleteProperty: (propertyId: string) =>
    request<{ ok: true }>(`/api/v1/properties/${encodeURIComponent(propertyId)}`, {
      method: 'DELETE',
    }),

  // --- Dashboard (operator overview) -----------------------------------------
  /**
   * KPI aggregates for the overview dashboard. Counters the signed-in role is
   * not permitted to read are `null` (rendered as "n/a"), never a zero —
   * a zero would claim the metric is empty, which is a fact the role cannot
   * see.
   */
  getDashboardKpis: () =>
    request<{
      kpis: {
        estates: number | null;
        activeProperties: number | null;
        totalProperties: number | null;
        users: number | null;
        residentDrafts: number | null;
        auditEventsLast30Days: number | null;
      };
    }>('/api/v1/dashboard/kpis'),

  /**
   * Most-recent audit events for the dashboard activity feed and the full
   * activity page. Requires `audit.read`.
   *
   * `limit` is clamped to the documented [1,50] window. Pass `after` (the
   * previous page's `nextCursor`) to page forward through the audit log.
   */
  getDashboardActivity: (limit = 20, after?: string) =>
    request<{
      events: AuditEventDto[];
      nextCursor: string | null;
      limit: number;
    }>(
      (() => {
        const params = new URLSearchParams({ limit: String(Math.min(Math.max(limit, 1), 50)) });
        if (after) params.set('after', after);
        return `/api/v1/dashboard/activity?${params.toString()}`;
      })(),
    ),

  /** Active house-type catalogue for the property form. */
  getHouseTypes: () => request<HouseTypesResponse>('/api/v1/properties/house-types'),

  // --- Phase 2: imports -------------------------------------------------------
  /**
   * Upload a .xlsx workbook for a given estate. The API returns a PREVIEWED
   * batch with row-level validation results. `file` is the user-selected
   * `File`; the client posts it as a `multipart/form-data` body under the
   * field name `file` (the multer field the route expects).
   */
  uploadImport: (estateId: string, file: File, filename?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (filename) form.append('filename', filename);
    return request<ImportPreviewResponse>(
      `/api/v1/estates/${encodeURIComponent(estateId)}/imports`,
      {
        method: 'POST',
        body: form,
      },
    );
  },

  /** List the import batches for an estate (most recent first). */
  listImportBatches: (estateId: string) =>
    request<{ batches: ImportBatchDto[]; total: number }>(
      `/api/v1/estates/${encodeURIComponent(estateId)}/imports`,
    ),

  /** Batch detail with persisted row results. */
  getImportBatch: (batchId: string) =>
    request<{ batch: ImportBatchDto; rows: ImportRowDto[] }>(
      `/api/v1/imports/${encodeURIComponent(batchId)}`,
    ),

  /**
   * Commit a PREVIEWED batch. 409 is raised when the batch is already in a
   * terminal state or when config drift means the active config has advanced
   * past the batch's pinned `configVersion`.
   */
  commitImport: (batchId: string, confirmLegacySampleRows = false) =>
    request<ImportCommitResponse>(`/api/v1/imports/${encodeURIComponent(batchId)}/commit`, {
      method: 'POST',
      body: JSON.stringify({ confirmLegacySampleRows }),
    }),

  /**
   * Download the server-generated .xlsx template for an estate.
   * Returns a `Blob` the caller can wrap in `URL.createObjectURL`.
   */
  // --- Phase 3: resident dashboard -------------------------------------------------
  /** The acting resident's own profile (user + onboarding + assigned property). */
  getResidentProfile: () => request<ResidentProfileView>('/api/v1/resident/profile'),

  /** Update the acting resident's editable fields (phone + next-of-kin). */
  updateResidentProfile: (input: ResidentProfileUpdateInput) =>
    request<ResidentProfileUpdateResponse>('/api/v1/resident/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  /** S2: the acting resident's assigned property(ies). */
  getResidentProperties: () => request<ResidentPropertiesResponse>('/api/v1/resident/properties'),

  /** S3: the acting resident's finance view (4 sections). */
  getResidentFinance: () => request<ResidentFinanceView>('/api/v1/resident/finance'),

  /** S3: record a payment against one of the acting resident's invoices. */
  createResidentPayment: (input: ResidentCreatePaymentInput) =>
    request<ResidentCreatePaymentResponse>('/api/v1/resident/payments', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** S4: the acting resident's access codes (prefix + validity, never the secret). */
  getResidentCodes: () => request<ResidentAccessCodesResponse>('/api/v1/resident/codes'),

  /** S4: generate an access code. The full code is returned exactly once. */
  generateResidentAccessCode: (input: ResidentGenerateAccessCodeInput) =>
    request<ResidentGenerateAccessCodeResponse>('/api/v1/resident/codes', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** S4: push a code's validity window further out. */
  extendResidentAccessCode: (codeId: string, durationHours?: number) =>
    request<ResidentExtendAccessCodeResponse>(
      `/api/v1/resident/codes/${encodeURIComponent(codeId)}/extend`,
      {
        method: 'POST',
        body: JSON.stringify({ durationHours }),
      },
    ),

  /** S4: deactivate (revoke) an access code. */
  deactivateResidentAccessCode: (codeId: string) =>
    request<ResidentDeactivateAccessCodeResponse>(
      `/api/v1/resident/codes/${encodeURIComponent(codeId)}/deactivate`,
      { method: 'POST' },
    ),

  /** S5: the acting resident's complaints (with their reply threads). */
  getResidentComplaints: (status?: ComplaintStatus) =>
    request<ResidentComplaintsResponse>(
      `/api/v1/resident/complaints${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),

  /** S5: file a complaint on the acting resident's property. */
  createResidentComplaint: (input: ResidentCreateComplaintInput) =>
    request<ResidentCreateComplaintResponse>('/api/v1/resident/complaints', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** S6: the acting resident's conversation threads with the estate office. */
  getResidentMessages: () => request<ResidentMessagesResponse>('/api/v1/resident/messages'),

  /** S6: start a thread (no threadId) or reply into an open one. */
  sendResidentMessage: (input: ResidentSendMessageInput) =>
    request<ResidentSendMessageResponse>('/api/v1/resident/messages', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** S7: community feed — latest announcements + the estate broadcast. */
  getResidentCommunity: () => request<ResidentCommunityView>('/api/v1/resident/community'),

  /** S8: bookable facilities plus the resident's upcoming and past bookings. */
  getResidentFacilities: () => request<ResidentBookingsView>('/api/v1/resident/facilities'),

  /** S8: request a booking. */
  createResidentBooking: (input: ResidentCreateBookingInput) =>
    request<ResidentCreateBookingResponse>('/api/v1/resident/bookings', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** S8: cancel one of the resident's own bookings. */
  cancelResidentBooking: (bookingId: string) =>
    request<ResidentCancelBookingResponse>(
      `/api/v1/resident/bookings/${encodeURIComponent(bookingId)}/cancel`,
      { method: 'POST' },
    ),

  /** S8 (Phase 7): the resident's own date/time-specific availability alerts. */
  getResidentFacilityWatches: () =>
    request<ResidentFacilityWatchesResponse>('/api/v1/resident/facility-watches'),

  /** S8 (Phase 7): watch an occupied facility window. */
  createResidentFacilityWatch: (input: ResidentCreateFacilityWatchInput) =>
    request<ResidentCreateFacilityWatchResponse>('/api/v1/resident/facility-watches', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** S8 (Phase 7): cancel one of the resident's own waiting alerts. */
  cancelResidentFacilityWatch: (watchId: string) =>
    request<ResidentCancelFacilityWatchResponse>(
      `/api/v1/resident/facility-watches/${encodeURIComponent(watchId)}/cancel`,
      { method: 'POST' },
    ),

  /** S9: the resident's own SOS history. */
  getResidentSosEvents: () => request<ResidentSosEventsResponse>('/api/v1/resident/sos'),

  /** S9: raise an SOS alert. */
  createResidentSos: (input: ResidentCreateSosInput) =>
    request<ResidentCreateSosResponse>('/api/v1/resident/sos', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // --- Operator SOS queue -----------------------------------------------------
  /** Staff SOS queue, organization-scoped. */
  listOperatorSos: (filter: OperatorSosFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.active !== undefined) params.set('active', String(filter.active));
    if (filter.limit) params.set('limit', String(filter.limit));
    const qs = params.toString();
    return request<OperatorSosEventsResponse>(`/api/v1/sos${qs ? `?${qs}` : ''}`);
  },

  /** Acknowledge a RAISED alert. Requires `sos.manage`. */
  acknowledgeOperatorSos: (sosEventId: string) =>
    request<OperatorSosMutationResponse>(
      `/api/v1/sos/${encodeURIComponent(sosEventId)}/acknowledge`,
      { method: 'POST' },
    ),

  /** Resolve an ACKNOWLEDGED alert with an optional internal note. */
  resolveOperatorSos: (sosEventId: string, input: OperatorResolveSosInput = {}) =>
    request<OperatorSosMutationResponse>(`/api/v1/sos/${encodeURIComponent(sosEventId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // --- Operator messages ------------------------------------------------------
  /** Staff inbox, organization-scoped. */
  listOperatorMessages: (filter: OperatorMessageFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.limit) params.set('limit', String(filter.limit));
    const qs = params.toString();
    return request<OperatorMessagesResponse>(`/api/v1/messages${qs ? `?${qs}` : ''}`);
  },

  /** Mark a conversation as read by the estate office. */
  markOperatorMessageRead: (threadId: string) =>
    request<OperatorMessageThreadResponse>(
      `/api/v1/messages/${encodeURIComponent(threadId)}/read`,
      { method: 'POST' },
    ),

  /** Reply as the estate office. */
  replyOperatorMessage: (threadId: string, input: OperatorMessageReplyInput) =>
    request<OperatorMessageThreadResponse>(
      `/api/v1/messages/${encodeURIComponent(threadId)}/reply`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  /** Close an open conversation. */
  closeOperatorMessage: (threadId: string) =>
    request<OperatorMessageThreadResponse>(
      `/api/v1/messages/${encodeURIComponent(threadId)}/close`,
      { method: 'POST' },
    ),

  /** Reopen a closed conversation. */
  reopenOperatorMessage: (threadId: string) =>
    request<OperatorMessageThreadResponse>(
      `/api/v1/messages/${encodeURIComponent(threadId)}/reopen`,
      { method: 'POST' },
    ),

  // --- Operator complaints ----------------------------------------------------
  /** Staff complaint queue, organization-scoped. */
  listOperatorComplaints: (filter: OperatorComplaintFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.limit) params.set('limit', String(filter.limit));
    const qs = params.toString();
    return request<OperatorComplaintsResponse>(`/api/v1/complaints${qs ? `?${qs}` : ''}`);
  },

  /** Reply to a complaint as the estate office. */
  replyOperatorComplaint: (complaintId: string, input: OperatorComplaintReplyInput) =>
    request<OperatorComplaintResponse>(
      `/api/v1/complaints/${encodeURIComponent(complaintId)}/reply`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  /** Change a complaint status. */
  setOperatorComplaintStatus: (complaintId: string, input: OperatorComplaintStatusInput) =>
    request<OperatorComplaintResponse>(
      `/api/v1/complaints/${encodeURIComponent(complaintId)}/status`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  // --- Operator billing -------------------------------------------------------
  /** Organization-scoped invoice queue. Requires `billing.read`. */
  listOperatorInvoices: (filter: OperatorInvoiceFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.limit) params.set('limit', String(filter.limit));
    const qs = params.toString();
    return request<OperatorInvoicesResponse>(`/api/v1/invoices${qs ? `?${qs}` : ''}`);
  },

  /** Issue a manual invoice for a resident. Requires `billing.manage`. */
  createOperatorInvoice: (input: OperatorCreateInvoiceInput) =>
    request<OperatorInvoiceResponse>('/api/v1/invoices', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** Void an unpaid invoice. Requires `billing.manage`. */
  voidOperatorInvoice: (invoiceId: string) =>
    request<OperatorInvoiceResponse>(`/api/v1/invoices/${encodeURIComponent(invoiceId)}/void`, {
      method: 'POST',
    }),

  /** Record a payment received out of band. Requires `payment.verify`. */
  recordOperatorPayment: (invoiceId: string, input: OperatorRecordPaymentInput) =>
    request<OperatorRecordPaymentResponse>(
      `/api/v1/invoices/${encodeURIComponent(invoiceId)}/payments`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  /** Organization-scoped manual payment history. Requires `billing.read`. */
  listOperatorPayments: (filter: OperatorPaymentFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.limit) params.set('limit', String(filter.limit));
    const qs = params.toString();
    return request<OperatorPaymentsResponse>(`/api/v1/payments${qs ? `?${qs}` : ''}`);
  },

  // --- Operator gate access ---------------------------------------------------
  /** Organization-wide access-code register. Requires `gate.read`. */
  listOperatorAccessCodes: (filter: OperatorAccessCodeFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.kind) params.set('kind', filter.kind);
    if (filter.limit) params.set('limit', String(filter.limit));
    const qs = params.toString();
    return request<OperatorAccessCodesResponse>(`/api/v1/access-codes${qs ? `?${qs}` : ''}`);
  },

  /** Gate verification history. Requires `verification.read`. */
  listAccessVerifications: (filter: AccessVerificationFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.outcome) params.set('outcome', filter.outcome);
    if (filter.gate) params.set('gate', filter.gate);
    if (filter.limit) params.set('limit', String(filter.limit));
    const qs = params.toString();
    return request<AccessVerificationsResponse>(`/api/v1/verifications${qs ? `?${qs}` : ''}`);
  },

  /** Verify a presented code and record the attempt. Requires `gate.manage`. */
  verifyAccessCode: (input: OperatorVerifyAccessCodeInput) =>
    request<OperatorVerifyAccessCodeResponse>('/api/v1/verifications', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // --- Operator facilities & bookings (Phase 7) ------------------------------
  /** Organization-scoped facility register. Requires `facility.read`. */
  listOperatorFacilities: (filter: OperatorFacilityFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.estateId) params.set('estateId', filter.estateId);
    if (filter.limit) params.set('limit', String(filter.limit));
    const qs = params.toString();
    return request<OperatorFacilitiesResponse>(`/api/v1/facilities${qs ? `?${qs}` : ''}`);
  },

  /** Create an estate-scoped facility. Requires `facility.manage`. */
  createOperatorFacility: (input: OperatorCreateFacilityInput) =>
    request<OperatorFacilityResponse>('/api/v1/facilities', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** Edit a facility, including its estate and fee. Requires `facility.manage`. */
  updateOperatorFacility: (facilityId: string, input: OperatorUpdateFacilityInput) =>
    request<OperatorFacilityResponse>(`/api/v1/facilities/${encodeURIComponent(facilityId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  /** Archive a facility with no live bookings. Requires `facility.manage`. */
  archiveOperatorFacility: (facilityId: string) =>
    request<OperatorFacilityResponse>(
      `/api/v1/facilities/${encodeURIComponent(facilityId)}/archive`,
      { method: 'POST' },
    ),

  /** Organization-scoped booking queue. Requires `booking.read`. */
  listOperatorBookings: (filter: OperatorBookingFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.paymentStatus) params.set('paymentStatus', filter.paymentStatus);
    if (filter.facilityId) params.set('facilityId', filter.facilityId);
    if (filter.from) params.set('from', filter.from);
    if (filter.to) params.set('to', filter.to);
    if (filter.limit) params.set('limit', String(filter.limit));
    const qs = params.toString();
    return request<OperatorBookingsResponse>(`/api/v1/bookings${qs ? `?${qs}` : ''}`);
  },

  /** Confirm a settled request. Requires `booking.manage`. */
  confirmOperatorBooking: (bookingId: string) =>
    request<OperatorBookingResponse>(`/api/v1/bookings/${encodeURIComponent(bookingId)}/confirm`, {
      method: 'POST',
    }),

  /** Verify a manual booking payment and create the paid invoice. */
  confirmOperatorBookingPayment: (bookingId: string, input: OperatorConfirmBookingPaymentInput) =>
    request<OperatorConfirmBookingPaymentResponse>(
      `/api/v1/bookings/${encodeURIComponent(bookingId)}/payment`,
      { method: 'POST', body: JSON.stringify(input) },
    ),

  /** Decline a request or cancel a confirmed booking. Requires `booking.manage`. */
  cancelOperatorBooking: (bookingId: string) =>
    request<OperatorBookingResponse>(`/api/v1/bookings/${encodeURIComponent(bookingId)}/cancel`, {
      method: 'POST',
    }),

  /** Complete an ended, settled confirmed booking. Requires `booking.manage`. */
  completeOperatorBooking: (bookingId: string) =>
    request<OperatorBookingResponse>(`/api/v1/bookings/${encodeURIComponent(bookingId)}/complete`, {
      method: 'POST',
    }),

  /** S10: the resident's notification inbox plus their upcoming bookings. */
  getResidentNotifications: () =>
    request<ResidentNotificationsView>('/api/v1/resident/notifications'),

  /** S10: mark one of the resident's own notifications as read. */
  markResidentNotificationRead: (notificationId: string) =>
    request<ResidentMarkNotificationReadResponse>(
      `/api/v1/resident/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: 'POST' },
    ),

  /** S11: the dashboard home aggregate. */
  getResidentDashboard: () => request<ResidentDashboardView>('/api/v1/resident/dashboard'),

  // --- Operational settings ------------------------------------------------
  getSettings: () => request<OrganizationSettingsView>('/api/v1/settings'),

  updateSettings: (input: OrganizationSettingsUpdateInput) =>
    request<OrganizationSettingsView>('/api/v1/settings', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  downloadImportTemplate: async (estateId: string): Promise<Blob> => {
    const response = await fetch(
      `/api/v1/estates/${encodeURIComponent(estateId)}/imports/template`,
      { credentials: 'include' },
    );
    if (!response.ok) {
      throw new ApiRequestError(
        'INTERNAL_ERROR',
        `Template download failed with status ${response.status}`,
        { status: response.status },
      );
    }
    return response.blob();
  },
};

export type { UserDto };
