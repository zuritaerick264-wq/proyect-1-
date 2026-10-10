import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100', browserName: 'chromium', launchOptions: { executablePath }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node server.js', url: 'http://127.0.0.1:3100', env: { PORT: '3100' }, reuseExistingServer: false },
  reporter: 'list',
});
