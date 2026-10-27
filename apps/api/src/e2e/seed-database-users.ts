/**
 * Creates the fixture users the Playwright browser suite signs in with.
 *
 * Run as a child of `reset-database.ts` so the target database URL has
 * already passed the destructive-operation guard. The script itself only
 * writes users — it never drops or migrates anything.
 */
import { PrismaClient } from '@prisma/client';
import { seedE2EUsers } from './seed-users.js';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed the fixture users.');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const organization = await prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!organization) {
      throw new Error(
        'No organization found in the test database — run the organization seed before this script.',
      );
    }
    await seedE2EUsers(prisma, organization.id);
    console.log(`Fixture users created for organization "${organization.slug}".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
