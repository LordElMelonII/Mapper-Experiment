// vitest.config.ts — unit + verify suites run in bare Node (zero DOM);
// the core is headless-testable by contract (CORE.md §1).
// Angular TestBed specs keep their own runner via `ng test` and are excluded.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
  },
});
