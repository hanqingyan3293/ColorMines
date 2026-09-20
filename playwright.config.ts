import { defineConfig, devices } from '@playwright/test';

const PORT = 4179;

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1200, height: 900 },
    // Pinned so the "follow system" default resolves to the source language.
    // Switching to English is covered by its own test.
    locale: 'zh-CN',
  },
  webServer: {
    // Serves the built bundle, not the dev server: the point is to test what
    // ships (which is also exactly what the Tauri window loads).
    command: `npx vite preview --port ${PORT} --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
