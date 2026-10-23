import http from 'node:http';
import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { createAppDependencies } from './dependencies.js';
import { logger } from './lib/logger.js';
import { disconnectPrisma } from './lib/prisma.js';

async function main(): Promise<void> {
  const env = getEnv();
  const deps = await createAppDependencies();
  const app = createApp({
    checkDatabase: deps.checkDatabase,
    configService: deps.configService,
    auth: {
      ...deps.auth,
      organizationId: deps.organizationId,
    },
  });

  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, basePath: env.API_BASE_PATH },
      'API listening',
    );
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    server.close();
    const forceExit = setTimeout(() => {
      logger.warn({ timeoutMs: env.SHUTDOWN_TIMEOUT_MS }, 'forced shutdown after timeout');
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();
    server.on('close', async () => {
      await disconnectPrisma();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.fatal({ err: error }, 'failed to start');
  process.exit(1);
});
