import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    // jsdom rendering is noticeably slower when several suites run at once on
    // a loaded machine; the default 5s flakes even though every test finishes
    // in well under a second in isolation.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
