import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  workers: 1,
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', channel: process.env.CRM_BROWSER_CHANNEL || undefined, headless: true },
})
