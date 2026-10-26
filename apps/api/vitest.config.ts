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
    // Every test file opens its own Prisma client, and the URL caps each
    // client at 5 connections, so the workers are bounded to keep the
    // connection count predictable against the shared pooler.
    maxWorkers: 4,
  },
});
