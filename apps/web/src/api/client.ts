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

  constructor(code: string, message: string, requestId?: string) {
    super(message);
    this.code = code;
    this.requestId = requestId;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: {
        'Content-Type': 'application/json',
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
    | Partial<ApiSuccessBody<unknown>>
    | Partial<ApiErrorBody>;

  if (!response.ok) {
    const error = (body as Partial<ApiErrorBody>).error;
    throw new ApiRequestError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.requestId,
    );
  }

  // Unwrap the `{ data }` envelope; the method's generic `T` is the payload.
  return (body as Partial<ApiSuccessBody<T>>).data as T;
}

export interface UserFilter {
  role?: string;
  status?: string;
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
};

export type { UserDto };
