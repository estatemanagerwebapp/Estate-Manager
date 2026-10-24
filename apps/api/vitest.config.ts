import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    // Integration tests (auth-flow.test.ts) run against the real Prisma
    // repositories. Locally that's a docker Postgres (fast); it can also be
    // pointed at a remote pooler (e.g. Supabase) where every round-trip adds
    // ~100-200ms. A multi-step test then needs more than the 5s default.
    testTimeout: 30_000,
  },
});
