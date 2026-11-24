import { fileURLToPath } from 'node:url';
import { defineConfig } from '../vendor/calccanvas/node_modules/@playwright/test/index.mjs';

export default defineConfig({
  testDir: '.',
  testMatch: ['workspace.spec.mjs', 'tool-library.spec.mjs', 'fin-plate.spec.mjs'],
  timeout: 90000,
  workers: 1,
  use: { baseURL: 'http://localhost:4180/mCalcPlatform/', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve-dist.mjs', cwd: fileURLToPath(new URL('../', import.meta.url)), url: 'http://localhost:4180/mCalcPlatform/', reuseExistingServer: false },
});
