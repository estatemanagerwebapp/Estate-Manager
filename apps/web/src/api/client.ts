import type {
  ChangePasswordResponse,
  LoginResponse,
  LogoutResponse,
  MeResponse,
  ResetPasswordResponse,
  UserDto,
  UserListResponse,
  UserDetailResponse,
  SetUserStatusResponse,
  SetUserRoleResponse,
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
  PropertyOptionsView,
  UpdatePropertyOptionsRequest,
  ImportPreviewResponse,
  ImportCommitResponse,
  ImportBatchDto,
  ImportRowDto,
  EstateDto,
  PropertyDto,
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
}

/** Query filters for the estate list (mirrors the API's accepted params). */
export interface EstateFilter {
  /** Free-text search against name/slug. */
  search?: string;
  /** `ACTIVE` or `ARCHIVED`. */
  status?: string;
}

/** Query filters for the property list (paginated on the server). */
export interface PropertyFilter {
  estateId?: string;
  typeKey?: string;
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
    const qs = params.toString();
    return request<UserListResponse>(`/api/v1/auth/users${qs ? `?${qs}` : ''}`);
  },

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

  // --- Phase 2: properties ----------------------------------------------------
  listProperties: (filter: PropertyFilter = {}) => {
    const params = new URLSearchParams();
    if (filter.estateId) params.set('estateId', filter.estateId);
    if (filter.typeKey) params.set('typeKey', filter.typeKey);
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

  // --- Phase 2: property options (config) ------------------------------------
  getPropertyOptions: () => request<PropertyOptionsView>('/api/v1/property-options'),

  updatePropertyOptions: (body: UpdatePropertyOptionsRequest) =>
    request<PropertyOptionsView>('/api/v1/property-options', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

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
  commitImport: (batchId: string) =>
    request<ImportCommitResponse>(`/api/v1/imports/${encodeURIComponent(batchId)}/commit`, {
      method: 'POST',
    }),

  /**
   * Download the server-generated .xlsx template for an estate.
   * Returns a `Blob` the caller can wrap in `URL.createObjectURL`.
   */
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
