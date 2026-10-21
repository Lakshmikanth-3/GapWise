import { defineConfig } from '@playwright/test';

// E2E runs against a live local server (real data): `npm start` in another terminal, or set ZEROGAP_URL.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: process.env.ZEROGAP_URL ?? 'http://localhost:8787' },
});
