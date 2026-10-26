import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 300000,
  workers: 1,
  webServer:
    process.env.DEPLOYGRID_TEST_RUNTIME === '1'
      ? {
          command: 'pnpm exec tsx scripts/browser-runtime.mts',
          url: 'http://127.0.0.1:3000',
          reuseExistingServer: false,
          timeout: 120000,
        }
      : undefined,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox'],
    },
  },
});
