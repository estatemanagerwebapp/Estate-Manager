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
    // Every test file opens its own Prisma client and the URL caps each
    // client at 5 connections, so two workers at a time is the most that
    // fits the budget. More than that and the suite fails intermittently
    // with 503 DATABASE_UNAVAILABLE.
    maxWorkers: 2,
  },
});
