import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4178',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npx vite --port 4178',
    url: 'http://localhost:4178/test/test-page.html',
    reuseExistingServer: false,
    timeout: 30000
  }
})
