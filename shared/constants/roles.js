/**
 * Estate Manager User Roles
 */
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ESTATE_ADMIN: 'ESTATE_ADMIN',
  GUARD: 'GUARD',
  RESIDENT: 'RESIDENT',
  AUDITOR: 'AUDITOR'
};

const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Super Administrator',
  [ROLES.ESTATE_ADMIN]: 'Estate Administrator',
  [ROLES.GUARD]: 'Security Guard',
  [ROLES.RESIDENT]: 'Resident / Homeowner',
  [ROLES.AUDITOR]: 'Auditor'
};

module.exports = {
  ROLES,
  ROLE_LABELS
};
