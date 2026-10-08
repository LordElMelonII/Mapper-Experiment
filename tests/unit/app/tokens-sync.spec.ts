// PKG B-140 (R0, docs/ui-restyle/REPAIRS.md) — the plane-drift pin. The
// design tokens live on two planes: the DOM plane publishes the --tme-*
// catalog in src/app/styles/_tokens.scss (consumed via app.scss), and the
// cytoscape canvas plane mirrors the canvas-relevant subset in
// src/app/graph/canvas-tokens.ts, which GRAPH_STYLESHEET renders from.
// Shared names must carry the SAME value on both planes, and the shared
// canvas-relevant set must be defined on both sides — otherwise a restyle
// of one plane silently diverges from the other (R0's whole reason for
// being). Both files are scrubbed as raw text — the vite `?raw` golden-file
// pattern (vite/client typing below); the spec environment ships no
// @types/node and gains none: zero new dependencies (AGENTS.md §6).
//
// Runner precondition (PKG B-140): vitest v5 stubs css-language `?raw`
// imports to "" unless `test.css` opts in — the test below asserts the
// scrapes are non-empty FIRST and names the lead-owned one-liner repair
// when that fires (see the in-test comment).
//
// This is a SOURCING pin, not a runtime one: the values both planes render
// today are the pre-B-140 literals byte-for-byte (zero behavior change), so
// the red here means "one plane's source was edited without the other".
/// <reference types="vite/client" />
import { expect, it } from 'vitest';
import TOKENS_SCSS from '../../../src/app/styles/_tokens.scss?raw';
import CANVAS_TOKENS_TS from '../../../src/app/graph/canvas-tokens.ts?raw';

/** `--tme-name: #hex` declarations of the SCSS catalog. */
const SCSS_DECL_RE = /(--tme-[\w-]+):\s*(#[0-9a-fA-F]{6})/g;

/** `'--tme-name': '#hex'` entries of the canvas const map. */
const TS_ENTRY_RE = /'(--tme-[\w-]+)':\s*'(#[0-9a-fA-F]{6})'/g;

function scrub(text: string, re: RegExp): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of text.matchAll(re)) map.set(m[1], m[2]);
  return map;
}

/**
 * The shared canvas-relevant set — every canvas-plane color (the packet's
 * measured 14), named as the DOM plane's token. The DOM catalog may carry
 * more roles (the plane-only text/accent/kind tiers); the canvas map may
 * define no fewer and no others than this list.
 */
const SHARED_CANVAS_TOKENS = [
  '--tme-accent-gold',
  '--tme-accent-pass',
  '--tme-accent-teal',
  '--tme-accent-warn-strong',
  '--tme-canvas-badge-border',
  '--tme-canvas-draft-paper',
  '--tme-canvas-node-bg',
  '--tme-canvas-text-muted',
  '--tme-hairline',
  '--tme-node-hub',
  '--tme-node-location',
  '--tme-node-waypoint',
  '--tme-text',
  '--tme-text-secondary',
];

it('the canvas plane mirrors the token catalog: every shared --tme-* token is defined on both planes with the same value (R0/D7)', () => {
  // Precondition: the scrapes must have REAL file text. Vitest v5 stubs EVERY
  // css-language `?raw` import to `export default ""` (its CSSEnablerPlugin:
  // post transform, ids matching /\.(?:css|less|sass|scss|...)(?:$|\?)/, when
  // `test.css` does not opt in — the workspace's default `css: { include: [] }`).
  // When this fires, the DOM-plane scrape is mechanically empty, NOT drifted —
  // the turnkey repair is the lead-owned vitest.config.mts adding a test.css
  // include that opts ONLY this ?raw id back in, e.g.
  //   css: { include: [/_tokens\.scss\?raw$/] }
  // (Vite's own css plugin skips ?raw ids — its asset plugin then serves the
  // real file text — while every other css import keeps the cheap stub.)
  expect(
    TOKENS_SCSS.length,
    'src/app/styles/_tokens.scss scraped EMPTY via ?raw — vitest stubs css-language ?raw when test.css does not include it; the lead-owned vitest.config.mts needs css: { include: [/_tokens\\.scss\\?raw$/] } (PKG B-140 report, R0 mechanism conflict)',
  ).toBeGreaterThan(0);
  expect(
    CANVAS_TOKENS_TS.length,
    'src/app/graph/canvas-tokens.ts scraped EMPTY via ?raw — the scraper itself failed',
  ).toBeGreaterThan(0);

  const scssTokens = scrub(TOKENS_SCSS, SCSS_DECL_RE);
  const canvasTokens = scrub(CANVAS_TOKENS_TS, TS_ENTRY_RE);

  // The shared set is defined on both sides.
  for (const name of SHARED_CANVAS_TOKENS) {
    // `--tme-` is the only mismatch shape a rename can take; the message
    // names the file so the drift reads as a one-line repair.
    expect(scssTokens.has(name), `src/app/styles/_tokens.scss must define ${name}`).toBe(true);
  }

  // Same value on both sides, for every shared name.
  for (const name of SHARED_CANVAS_TOKENS) {
    const scssValue = scssTokens.get(name);
    const canvasValue = canvasTokens.get(name);
    expect(canvasTokens.has(name), `src/app/graph/canvas-tokens.ts must define ${name}`).toBe(true);
    expect(
      scssValue,
      `${name}: the DOM plane's value in _tokens.scss`,
    ).toEqual(canvasValue);
  }

  // And the canvas map carries exactly the shared set — one entry per
  // canvas-plane color, no plane-only drift names sneaking in unmirrored.
  expect([...canvasTokens.keys()].sort()).toEqual([...SHARED_CANVAS_TOKENS].sort());
});
