import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    exclude: ['**/node_modules/**', '**/.git/**', '**/e2e/**'],
    // The integration tests share one remote Postgres (Supabase's pooler)
    // whose connection budget is small: every test file opens its own Prisma
    // client, and the URL caps each client at 5 connections. Bounding the
    // workers keeps the connection count predictable instead of letting
    // every file run at once.
    maxWorkers: 4,
  },
});
