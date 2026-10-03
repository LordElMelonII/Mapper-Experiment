// playwright.config.ts — Phase 2 e2e (D68, D53/F52).
// Two projects are mandatory for every UI packet from Phase 2 on (D53): a
// desktop-viewport run and an emulated phone-viewport run with touch
// (EXECUTION-PLAN §3.8; AGENTS.md §8 UI bar). e2e specs live in tests/e2e as
// `*.e2e-spec.ts` so the vitest glob (`tests/**/*.spec.ts`) never picks them
// up — `npm run verify` stays typecheck + boundary lint + ESLint + vitest in
// bare Node; e2e runs as its own command (`npm run test:e2e`).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e-spec.ts', // keeps vitest's `*.spec.ts` glob and this runner disjoint
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4200',
  },
  projects: [
    // D53: one interaction family, both worlds — same specs, two viewports.
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npx ng serve',
    url: 'http://localhost:4200',
    reuseExistingServer: true, // the devserver is shared (AGENTS.md §7)
    timeout: 120_000,
  },
});
