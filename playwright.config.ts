import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5180',
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run dev -- --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: false
  },
  projects: [
    ...(['chromium', 'firefox', 'webkit'] as const).map((browserName) => ({
      name: browserName,
      use: { browserName, viewport: { width: 394, height: 980 } }
    })),
    { name: 'android-touch', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'iphone-touch', use: { ...devices['iPhone 13'], browserName: 'webkit' } }
  ]
});
