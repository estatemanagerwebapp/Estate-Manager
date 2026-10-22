/**
 * Application dependencies, wired once at startup.
 *
 * Everything that can vary between environments (database connectivity,
 * bootstrap location, organization identity) is injected through this
 * factory so `createApp` stays a pure function of its options.
 */
import { getPrismaClient } from '../lib/prisma.js';
import { loadBootstrapConfig } from '../modules/organization/bootstrap.js';
import {
  PrismaOrganizationConfigRepository,
  OrganizationConfigService,
} from '../modules/organization/config.service.js';
import { getEnv } from '../config/env.js';

export interface AppDependencies {
  checkDatabase: () => Promise<void>;
  configService: OrganizationConfigService;
}

export function createAppDependencies(): AppDependencies {
  const env = getEnv();
  const prisma = getPrismaClient();
  const repository = new PrismaOrganizationConfigRepository(prisma);
  const configService = new OrganizationConfigService(
    repository,
    loadBootstrapConfig,
    env.ORGANIZATION_SLUG,
  );

  return {
    checkDatabase: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    configService,
  };
}
