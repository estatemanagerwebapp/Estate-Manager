import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The integration tests run against one remote Postgres (Supabase's
    // pooler, in another region). A single onboarding flow is a chain of
    // sequential HTTP round-trips, so the default 30s budget is tight once
    // several files run at once and a slow query turns into a hard failure.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    exclude: ['**/node_modules/**', '**/.git/**', '**/e2e/**'],
    // The pooler runs in session mode and accepts only 15 client sessions
    // in total ("max clients reached in session mode ... pool_size: 15").
    // Each test file opens its own Prisma client, narrowed to three
    // connections in test mode (see lib/prisma.ts), so two workers at a
    // time is six connections — room to spare for a development server
    // running against the same database. More workers exhausted the pool
    // and the suite failed intermittently with 503 DATABASE_UNAVAILABLE.
    maxWorkers: 2,
  },
});
