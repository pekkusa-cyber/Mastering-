// Automatiska UI-tester i en telefonstor Chromium mot simulatorn för live-motorn (src/livedsp.js, ?sim=1).
// Kör: npm test. CI kör dem innan en APK publiceras.
import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const local = '/opt/pw-browsers/chromium'; // förinstallerad Chromium i molnsessioner; CI installerar sin egen
export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.js',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5175',
    viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: 'sv-SE',
    trace: 'off',
    ...(existsSync(local) && !process.env.CI ? { launchOptions: { executablePath: local } } : {}),
  },
  webServer: { command: 'npx vite --port 5175 --strictPort', url: 'http://localhost:5175', reuseExistingServer: !process.env.CI, timeout: 60000 },
});
