/**
 * Plain-JS runner for the Phase 2 live config migration.
 *
 * Equivalent to `npx tsx prisma/migrate-config-house-types.ts`, but runs on
 * stock Node against the built config-schema package so it needs no TS
 * loader. Keep both files in sync: this is the execution shim, the .ts file
 * is the source of truth.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_HOUSE_TYPES,
  OrganizationConfigSchema,
} from '../packages/config-schema/dist/index.js';

const NEW_ADDRESS_COMPONENTS = [
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

const LAND = {
  key: 'land',
  label: 'Land',
  detailKind: 'LAND_PARCEL',
  requiresUnits: false,
  unitTypeKeys: [],
  defaultUnitTypeKey: null,
  active: true,
};
const HOUSE = {
  key: 'house',
  label: 'House',
  detailKind: 'PROPERTY',
  requiresUnits: false,
  unitTypeKeys: [],
  defaultUnitTypeKey: null,
  active: true,
};

function transformAssetTypes(types) {
  const seen = new Set();
  const out = [];
  for (const type of types) {
    if (type.key === 'land_plot' || type.key === 'land') {
      if (seen.has('land')) continue;
      seen.add('land');
      out.push({ ...LAND, label: type.label ?? 'Land' });
      continue;
    }
    if (type.key === 'house') {
      if (seen.has('house')) continue;
      seen.add('house');
      out.push({ ...HOUSE, label: type.label ?? 'House' });
      continue;
    }
    if (!seen.has(type.key)) {
      seen.add(type.key);
      out.push({ ...type, active: false, requiresUnits: false, unitTypeKeys: [] });
    }
  }
  if (!seen.has('land')) out.unshift(LAND);
  if (!seen.has('house')) out.push(HOUSE);
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const orgIndex = process.argv.indexOf('--org');
  const organizationSlug =
    (orgIndex >= 0 ? process.argv[orgIndex + 1] : undefined) ??
    process.env.ORGANIZATION_SLUG ??
    'silverstone';

  const prisma = new PrismaClient();
  try {
    const organization = await prisma.organization.findUnique({
      where: { slug: organizationSlug },
      select: { id: true, name: true },
    });
    if (!organization) throw new Error(`Organization "${organizationSlug}" not found`);

    const active = await prisma.organizationConfig.findFirst({
      where: { organizationId: organization.id, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, schemaVersion: true, payload: true },
    });
    if (!active) throw new Error(`No ACTIVE config for "${organizationSlug}"`);

    console.log(
      `Loaded ACTIVE config v${active.version} (schemaVersion ${active.schemaVersion}) for "${organizationSlug}"`,
    );

    const payload = active.payload;
    const migrated = OrganizationConfigSchema.parse({
      ...payload,
      assetModel: {
        ...payload.assetModel,
        types: transformAssetTypes(payload.assetModel?.types ?? []),
      },
      propertyOptions: {
        ...payload.propertyOptions,
        addressComponents: NEW_ADDRESS_COMPONENTS,
        houseTypes: DEFAULT_HOUSE_TYPES,
      },
    });

    const oldTypes = (payload.assetModel?.types ?? []).map((t) => t.key);
    console.log(
      `assetModel.types: [${oldTypes.join(', ')}] → [${migrated.assetModel.types
        .map((t) => `${t.key}${t.active ? '' : ' (inactive)'}`)
        .join(', ')}]`,
    );
    console.log(
      `propertyOptions.houseTypes: ${migrated.propertyOptions.houseTypes.map((h) => h.key).join(', ')}`,
    );
    console.log(
      `propertyOptions.addressComponents: ${migrated.propertyOptions.addressComponents.map((c) => c.key).join(', ')}`,
    );

    if (dryRun) {
      console.log('Dry run only — validated, no write performed.');
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
          payload: migrated,
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
