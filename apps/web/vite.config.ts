import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Where the dev server forwards `/api` requests. Defaults to the local API on
 * port 4000; the Playwright suite overrides it with `VITE_API_PROXY_TARGET`
 * so browser tests can run against a dedicated API instance (and its own
 * disposable database) without disturbing a running dev server.
 */
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the local API during development.
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
