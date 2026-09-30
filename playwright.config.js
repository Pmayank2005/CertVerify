const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:8089', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/serve-frontend.js --port 8089',
    url: 'http://127.0.0.1:8089',
    reuseExistingServer: false,
  },
});
