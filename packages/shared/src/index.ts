export {
  KOBO_PER_NAIRA,
  MoneyError,
  assertKobo,
  formatNaira,
  koboToNaira,
  nairaToKobo,
  parseNaira,
  sumKobo,
} from './money.js';
export type { FormatNairaOptions, Kobo } from './money.js';

export { ROLE_KEYS, ROLE_LABELS, isRoleKey } from './roles.js';
export type { RoleKey } from './roles.js';

export {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  hasPermission,
  isPermission,
  permissionsForRole,
} from './permissions.js';
export type { Permission } from './permissions.js';

export {
  DEFAULT_MODULE_FLAGS,
  MODULE_KEYS,
  MODULE_LABELS,
  enabledModules,
  isModuleEnabled,
} from './modules.js';
export type { ModuleFlags, ModuleKey } from './modules.js';

export {
  ACCOUNT_STATUSES,
  AUDIT_EVENT_TYPES,
  PASSWORD_POLICY,
  validatePasswordPolicy,
} from './auth-contract.js';
export type {
  AccountStatus,
  AuditEventDto,
  AuditEventType,
  ChangePasswordResponse,
  ForgotPasswordResponse,
  LoginResponse,
  LogoutResponse,
  MeResponse,
  PasswordPolicy,
  ResetPasswordResponse,
  SetUserRoleResponse,
  SetUserStatusResponse,
  UserDetailResponse,
  UserDto,
  UserListResponse,
  UserListItemDto,
} from './auth-contract.js';

export { ERROR_CODES } from './api-contract.js';
export type {
  ApiErrorBody,
  ApiSuccessBody,
  ErrorCode,
  FieldError,
  HealthCheckResult,
  HealthResponse,
  LivenessResponse,
  SystemInfo,
} from './api-contract.js';
