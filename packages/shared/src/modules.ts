/**
 * Optional product modules. A deployment enables a subset through organization
 * configuration; routes, UI and API access are gated on the resulting flags.
 */
export const MODULE_KEYS = [
  'estates',
  'residents',
  'properties',
  'assignments',
  'billing',
  'payments',
  'gateAccess',
  'maintenance',
  'power',
  'pettyCash',
  'facilities',
  'shortlet',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  estates: 'Estates',
  residents: 'Residents',
  properties: 'Properties and units',
  assignments: 'Property assignments',
  billing: 'Billing and invoices',
  payments: 'Payments',
  gateAccess: 'Gate access',
  maintenance: 'Maintenance and work orders',
  power: 'Power and utilities',
  pettyCash: 'Petty cash',
  facilities: 'Facilities and amenities',
  shortlet: 'Short-let stays',
};

export type ModuleFlags = Record<ModuleKey, boolean>;

/** Every module enabled — the bootstrap baseline for a new deployment. */
export const DEFAULT_MODULE_FLAGS: ModuleFlags = {
  estates: true,
  residents: true,
  properties: true,
  assignments: true,
  billing: true,
  payments: true,
  gateAccess: true,
  maintenance: true,
  power: false,
  pettyCash: false,
  facilities: false,
  shortlet: false,
};

export function isModuleEnabled(flags: ModuleFlags, moduleKey: ModuleKey): boolean {
  return flags[moduleKey] === true;
}

export function enabledModules(flags: ModuleFlags): ModuleKey[] {
  return MODULE_KEYS.filter((key) => flags[key]);
}
