import { defineConfig } from '@playwright/test';

const frontendUrl = 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.js',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: './test-results/e2e',
  use: {
    baseURL: frontendUrl,
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    locale: 'en-US',
    // Avoid persisting request bodies, access tokens, or sign-in inputs in traces.
    trace: 'off',
  },
});
