// vitest.config.ts — unit + verify suites run in bare Node (zero DOM);
// the core is headless-testable by contract (CORE.md §1).
// Angular TestBed specs keep their own runner via `ng test` and are excluded.
// Phase 2 e2e specs (`tests/e2e/*.e2e-spec.ts`, D68) run under Playwright —
// the suffix keeps them out of this `*.spec.ts` glob by construction, and the
// exclude is belt-and-braces.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    exclude: ['tests/e2e/**'],
    environment: 'node',
    // PKG B-140 (R0): the suite's one css-language `?raw` import is the token
    // drift pin's `_tokens.scss?raw` — vitest v5 stubs css-language ?raw to ""
    // unless test.css opts in. Include ONLY that one id (Vite's css plugin
    // itself skips ?raw ids; its asset plugin serves the file text as-is).
    css: { include: [/_tokens\.scss\?raw$/] },
  },
});
