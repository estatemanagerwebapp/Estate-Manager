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
} from '@silverstone/shared';

/**
 * Minimal fetch client for the Silverstone API. All methods share the
 * `credentials: 'include'` flag so the HttpOnly session cookie is sent
 * on cross-origin requests in development (Vite proxy keeps them
 * same-origin, but the flag makes intent explicit and future-proof).
 *
 * Errors are thrown as `ApiRequestError` with a stable `code` so calling
 * code can branch on it without parsing the message.
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
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as T & Partial<ApiErrorBody>;

  if (!response.ok) {
    const error = (body as Partial<ApiErrorBody>).error;
    throw new ApiRequestError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.requestId,
    );
  }

  return body as T;
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
