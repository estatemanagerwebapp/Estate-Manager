const { ROLES } = require('../constants/roles');

/**
 * Granular System Permissions
 */
const PERMISSIONS = {
  // Global & Estate Administration
  ESTATE_CREATE: 'estate:create',
  ESTATE_READ: 'estate:read',
  ESTATE_UPDATE: 'estate:update',
  ESTATE_DELETE: 'estate:delete',
  ADMIN_DELEGATE: 'admin:delegate',

  // Resident & Property Management
  RESIDENT_READ: 'resident:read',
  RESIDENT_MANAGE: 'resident:manage',
  PROPERTY_READ: 'property:read',
  PROPERTY_MANAGE: 'property:manage',
  
  // Gate & Access Code Operations
  ACCESS_CODE_CREATE: 'code:create',
  ACCESS_CODE_READ: 'code:read',
  ACCESS_CODE_REVOKE: 'code:revoke',
  ACCESS_CODE_RESTRICT: 'code:restrict', // SuperAdmin Exclusive (Rule 11)
  GATE_VERIFY: 'gate:verify',
  GATE_LOG_READ: 'gate:log_read',

  // Financials & Billing
  INVOICE_CREATE: 'invoice:create',
  INVOICE_READ: 'invoice:read',
  INVOICE_PAY: 'invoice:pay',
  INVOICE_OVERRIDE: 'invoice:override',

  // Maintenance & Complaints
  COMPLAINT_CREATE: 'complaint:create',
  COMPLAINT_READ: 'complaint:read',
  COMPLAINT_UPDATE: 'complaint:update',

  // Compliance & Audit
  AUDIT_LOG_READ: 'audit:read',
  REPORT_GENERATE: 'report:generate',

  // Emergency SOS
  EMERGENCY_TRIGGER: 'emergency:trigger',
  EMERGENCY_RECEIVE: 'emergency:receive'
};

/**
 * Role-to-Permissions Mapping Matrix
 */
const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),

  [ROLES.ESTATE_ADMIN]: [
    PERMISSIONS.ESTATE_READ,
    PERMISSIONS.RESIDENT_READ,
    PERMISSIONS.RESIDENT_MANAGE,
    PERMISSIONS.PROPERTY_READ,
    PERMISSIONS.PROPERTY_MANAGE,
    PERMISSIONS.ACCESS_CODE_READ,
    PERMISSIONS.GATE_LOG_READ,
    PERMISSIONS.INVOICE_CREATE,
    PERMISSIONS.INVOICE_READ,
    PERMISSIONS.COMPLAINT_READ,
    PERMISSIONS.COMPLAINT_UPDATE,
    PERMISSIONS.REPORT_GENERATE,
    PERMISSIONS.EMERGENCY_RECEIVE
  ],

  [ROLES.GUARD]: [
    PERMISSIONS.GATE_VERIFY,
    PERMISSIONS.GATE_LOG_READ,
    PERMISSIONS.ACCESS_CODE_READ,
    PERMISSIONS.EMERGENCY_RECEIVE
  ],

  [ROLES.RESIDENT]: [
    PERMISSIONS.ACCESS_CODE_CREATE,
    PERMISSIONS.ACCESS_CODE_READ,
    PERMISSIONS.ACCESS_CODE_REVOKE,
    PERMISSIONS.INVOICE_READ,
    PERMISSIONS.INVOICE_PAY,
    PERMISSIONS.COMPLAINT_CREATE,
    PERMISSIONS.COMPLAINT_READ,
    PERMISSIONS.EMERGENCY_TRIGGER
  ],

  [ROLES.AUDITOR]: [
    PERMISSIONS.ESTATE_READ,
    PERMISSIONS.RESIDENT_READ,
    PERMISSIONS.PROPERTY_READ,
    PERMISSIONS.GATE_LOG_READ,
    PERMISSIONS.INVOICE_READ,
    PERMISSIONS.COMPLAINT_READ,
    PERMISSIONS.AUDIT_LOG_READ,
    PERMISSIONS.REPORT_GENERATE
  ]
};

/**
 * Helper to check whether a role has a given permission
 */
const hasPermission = (role, permission) => {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
};

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission
};
