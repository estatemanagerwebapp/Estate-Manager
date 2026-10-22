/**
 * Phase 0 seed.
 *
 * Provisions the deployment's Organization row and activates the initial
 * configuration document from `config/organization.default.json`. It is
 * idempotent: re-running it will not create a second active document and will
 * not overwrite an organization that already exists.
 *
 * Run with: npm run db:seed
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  OrganizationConfigError,
  parseOrganizationConfig,
  toStoredPayload,
  type OrganizationConfig,
} from '@silverstone/config-schema';

const prisma = new PrismaClient();

function loadBootstrapConfig(): OrganizationConfig {
  const raw = readFileSync(
    resolve(process.cwd(), '../../config/organization.default.json'),
    'utf8',
  );
  const document: unknown = JSON.parse(raw);
  try {
    return parseOrganizationConfig(document);
  } catch (error) {
    if (error instanceof OrganizationConfigError) {
      console.error('Bootstrap configuration is invalid:');
      for (const issue of error.issues) console.error(`  - ${issue.path}: ${issue.message}`);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const config = loadBootstrapConfig();
  const payload = toStoredPayload(config);

  const org = await prisma.organization.upsert({
    where: { slug: config.organization.slug },
    update: { name: config.organization.name },
    create: { name: config.organization.name, slug: config.organization.slug },
  });

  const active = await prisma.organizationConfig.findFirst({
    where: { organizationId: org.id, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });

  if (active) {
    console.log(
      `Organization "${org.slug}" already provisioned (active config version ${active.version}). Nothing to do.`,
    );
    return;
  }

  const latest = await prisma.organizationConfig.findFirst({
    where: { organizationId: org.id },
    orderBy: { version: 'desc' },
  });

  await prisma.organizationConfig.create({
    data: {
      organizationId: org.id,
      version: (latest?.version ?? 0) + 1,
      status: 'ACTIVE',
      schemaVersion: payload.schemaVersion,
      payload: payload as Prisma.InputJsonValue,
      createdBy: 'seed',
      activatedAt: new Date(),
    },
  });

  console.log(`Organization "${org.slug}" provisioned with active config version 1.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
