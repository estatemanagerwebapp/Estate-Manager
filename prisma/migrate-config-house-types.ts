/**
 * One-off migration: move the live organization configuration to the Phase 2
 * land/house model.
 *
 * Why this exists: the active database document still declares the old asset
 * type set (`house`, `apartment_block`, `land_plot`, optionally `both`) with
 * address components that reference the new keys (`land`, `house.*`). The
 * Phase 2 schema cross-validates those references, so the stored document
 * fails to parse and every authenticated route degrades to 503
 * CONFIG_INVALID until this migration runs.
 *
 * What it does (per approved plan, section E):
 *  1. Reads the ACTIVE config record for the target organization.
 *  2. Transforms `assetModel.types` in place:
 *     - `land_plot` → `land` (LAND_PARCEL, active)
 *     - `house` stays (PROPERTY, active)
 *     - `apartment_block` / `both` are kept but marked `active: false` so
 *       existing rows remain readable while creation under them is rejected.
 *  3. Sets `propertyOptions.houseTypes` to the five nested house types.
 *  4. Replaces `addressComponents` with the new six-component field set
 *     (requiredFor / notApplicableFor keyed on top-level and `house.*` keys).
 *  5. Validates the transformed document against the current config schema.
 *  6. Archives the old record and activates the next version in one
 *     transaction (same semantics as PrismaOrganizationConfigRepository).
 *
 * Usage:
 *   npx tsx prisma/migrate-config-house-types.ts [--dry-run] [--org <slug>]
 *
 * `--org` overrides the organization slug (default: ORGANIZATION_SLUG from
 * .env, falling back to "silverstone").
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_HOUSE_TYPES,
  OrganizationConfigSchema,
  type AssetType,
  type OrganizationConfig,
} from '../packages/config-schema/src/index';

// --- CLI arguments -----------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const orgIndex = args.indexOf('--org');
const organizationSlug =
  (orgIndex >= 0 ? args[orgIndex + 1] : undefined) ?? process.env.ORGANIZATION_SLUG ?? 'silverstone';

// --- The new address component field set (mirrors config/organization.default.json) ---

const NEW_ADDRESS_COMPONENTS: unknown[] = [
  {
    key: 'street_name',
    label: 'Street name',
    requiredFor: ['land', 'house'],
    notApplicableFor: [],
    maxLength: 120,
    pattern: null,
  },
  {
    key: 'plot_number',
    label: 'Plot number',
    requiredFor: ['land'],
    notApplicableFor: [
      'house.bungalow',
      'house.terrace',
      'house.duplex',
      'house.apartment',
      'house.flat',
    ],
    maxLength: 32,
    pattern: '\\d+',
  },
  {
    key: 'house_number',
    label: 'House number',
    requiredFor: ['house.bungalow', 'house.terrace', 'house.duplex'],
    notApplicableFor: ['house.apartment', 'house.flat', 'land'],
    maxLength: 32,
    pattern: '\\d+[A-Za-z]?',
  },
  {
    key: 'block_name',
    label: 'Building / block name',
    requiredFor: ['house.apartment', 'house.flat'],
    notApplicableFor: ['house.bungalow', 'house.terrace', 'house.duplex', 'land'],
    maxLength: 64,
    pattern: null,
  },
  {
    key: 'floor_number',
    label: 'Floor number',
    requiredFor: ['house.apartment', 'house.flat'],
    notApplicableFor: ['house.bungalow', 'house.terrace', 'house.duplex', 'land'],
    maxLength: 16,
    pattern: '\\d+',
  },
  {
    key: 'unit_number',
    label: 'Unit / apartment number',
    requiredFor: ['house.apartment', 'house.flat'],
    notApplicableFor: ['house.bungalow', 'house.terrace', 'house.duplex', 'land'],
    maxLength: 32,
    pattern: '\\d+[A-Za-z]?',
  },
];

// --- Transformation ----------------------------------------------------------

/**
 * Renames `land_plot` → `land`, keeps `house`, and deactivates legacy
 * container types. Existing rows under an inactive type stay readable; the
 * create path rejects them.
 */
function transformAssetTypes(types: AssetType[]): AssetType[] {
  const seen = new Set<string>();
  const transformed: AssetType[] = [];

  for (const type of types) {
    if (type.key === 'land_plot') {
      if (seen.has('land')) continue;
      seen.add('land');
      transformed.push({
        ...type,
        key: 'land',
        label: 'Land',
        detailKind: 'LAND_PARCEL',
        requiresUnits: false,
        unitTypeKeys: [],
        defaultUnitTypeKey: null,
        active: true,
      });
      continue;
    }
    if (type.key === 'land') {
      if (seen.has('land')) continue;
      seen.add('land');
      transformed.push({ ...type, active: true });
      continue;
    }
    if (type.key === 'house') {
      if (seen.has('house')) continue;
      seen.add('house');
      transformed.push({ ...type, active: true });
      continue;
    }
    // apartment_block, both, or any other legacy key: keep declared (so old
    // rows still validate) but inactive (so creation is rejected).
    if (!seen.has(type.key)) {
      seen.add(type.key);
      transformed.push({ ...type, active: false, requiresUnits: false, unitTypeKeys: [] });
    }
  }

  if (!seen.has('land')) {
    transformed.unshift(AssetTypeSchemaDefaults.land());
  }
  if (!seen.has('house')) {
    transformed.push(AssetTypeSchemaDefaults.house());
  }
  return transformed;
}

/** Fallback declarations when the stored doc lacks a required type entirely. */
const AssetTypeSchemaDefaults = {
  land: () => ({
    key: 'land',
    label: 'Land',
    detailKind: 'LAND_PARCEL' as const,
    requiresUnits: false,
    unitTypeKeys: [],
    defaultUnitTypeKey: null,
    active: true,
  }),
  house: () => ({
    key: 'house',
    label: 'House',
    detailKind: 'PROPERTY' as const,
    requiresUnits: false,
    unitTypeKeys: [],
    defaultUnitTypeKey: null,
    active: true,
  }),
};

/** Applies every Phase 2 transformation to the stored payload. */
function transformPayload(payload: Record<string, unknown>): OrganizationConfig {
  const doc = payload as {
    assetModel?: { types?: AssetType[]; unitTypes?: unknown; [k: string]: unknown };
    propertyOptions?: Record<string, unknown>;
    [k: string]: unknown;
  };

  const assetModel = {
    ...doc.assetModel,
    types: transformAssetTypes(doc.assetModel?.types ?? []),
  };

  const propertyOptions = {
    ...doc.propertyOptions,
    addressComponents: NEW_ADDRESS_COMPONENTS,
    houseTypes: DEFAULT_HOUSE_TYPES,
  };

  // The schema fills remaining defaults and cross-validates the references.
  return OrganizationConfigSchema.parse({
    ...payload,
    assetModel,
    propertyOptions,
  });
}

// --- Main --------------------------------------------------------------------

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const organization = await prisma.organization.findUnique({
      where: { slug: organizationSlug },
      select: { id: true, name: true },
    });
    if (!organization) {
      throw new Error(`Organization "${organizationSlug}" not found`);
    }

    const active = await prisma.organizationConfig.findFirst({
      where: { organizationId: organization.id, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, schemaVersion: true, payload: true },
    });
    if (!active) {
      throw new Error(
        `No ACTIVE config for "${organizationSlug}" — nothing to migrate; provision first`,
      );
    }

    console.log(
      `Loaded ACTIVE config v${active.version} (schemaVersion ${active.schemaVersion}) for "${organizationSlug}"`,
    );

    const payload = active.payload as unknown as Record<string, unknown>;
    const migrated = transformPayload(payload);

    // Report what changed before touching the database.
    const oldTypes = (payload.assetModel as { types?: AssetType[] })?.types?.map((t) => t.key) ?? [];
    console.log(`assetModel.types: [${oldTypes.join(', ')}] → [${migrated.assetModel.types.map((t) => `${t.key}${t.active ? '' : ' (inactive)'}`).join(', ')}]`);
    console.log(`propertyOptions.houseTypes: ${migrated.propertyOptions.houseTypes.map((h) => h.key).join(', ')}`);
    console.log(`propertyOptions.addressComponents: ${migrated.propertyOptions.addressComponents.map((c) => c.key).join(', ')}`);

    if (dryRun) {
      console.log('Dry run only — document validated against the current schema, no write performed.');
      return;
    }

    const latest = await prisma.organizationConfig.findFirst({
      where: { organizationId: organization.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    await prisma.$transaction(async (tx) => {
      await tx.organizationConfig.updateMany({
        where: { organizationId: organization.id, status: 'ACTIVE' },
        data: { status: 'ARCHIVED' },
      });
      await tx.organizationConfig.create({
        data: {
          organizationId: organization.id,
          version: nextVersion,
          status: 'ACTIVE',
          schemaVersion: migrated.schemaVersion,
          payload: migrated as unknown as Parameters<typeof tx.organizationConfig.create>[0]['data']['payload'],
          createdBy: 'migrate-config-house-types',
          activatedAt: new Date(),
        },
      });
    });

    console.log(`Archived v${active.version}; activated v${nextVersion} under the land/house model.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
