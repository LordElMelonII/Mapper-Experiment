// tests/e2e/verify-p2m1-seams.e2e-spec.ts — Verifier e2e probes for the
// Phase 2 M1 gate (adversarial suite; D53: every probe runs at BOTH playwright
// projects — desktop pointer and emulated phone with touch).
//
// Expectations derived from the spec, not the implementation:
//   C19/C22 — the header's layer line is the PIN's layer (snapshot semantics):
//             switching the viewer to Misaki must NOT change it while the pin
//             is on Fuyuki. (No M1 test exercised this — the existing specs
//             read the header only while the viewer sits on the pin's layer.)
//   C3      — the cross-layer station arc is NEVER in the projection: not on
//             Fuyuki, not on Misaki, not after a round-trip (no duplicates).
//             Badges are M2; M1 must not draw a line and must not double-add.
//   FX1     — exact per-layer node sets derived from data/worlds/fuyuki.ts:
//             13 leaves + 2 districts on Fuyuki; exactly ['Misaki Town'].
//   F03/§6.2 — the background is fitted+centered via object-fit: contain and
//             pointer-transparent (computed styles — the real pins; a
//             boundingBox comparison of an inset:0 img is vacuously true).
//   D53     — desktop mouse pan on empty canvas changes cy.pan (the one
//             family×viewport cell the M1 specs leave uncovered).
//   §6.2    — harness console stays clean (no errors/warnings) across load,
//             selection, and layer switches at both viewports.
import { expect, test, type Page } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  edgeLineStyle(id: string): string | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeLabels();
  });

const readEdgeStyle = (page: Page, id: string): Promise<string | null> =>
  page.evaluate((edgeId): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.edgeLineStyle(edgeId);
  }, id);

const readPan = (page: Page): Promise<{ x: number; y: number }> =>
  page.evaluate((): { x: number; y: number } => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.pan();
  });

const isPhone = (): boolean => test.info().project.name === 'phone';

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
};

// FX1 facts, re-derived from data/worlds/fuyuki.ts (the verifier's own count):
// 13 leaves + 2 district containers on layer-fuyuki; 1 hub on layer-misaki.
const FUYUKI_LABELS = [
  'Miyama',
  'Shinto',
  'Emiya Residence',
  'Shopping District',
  'Homurahara Academy',
  'Matou Residence',
  'Tohsaka Residence',
  'Ryuudou Temple',
  'Outskirts',
  'Fuyuki Bridge',
  'Fuyuki Station',
  'Harbor',
  'Kotomine Church',
  'Ghost House',
  'Einzbern Castle',
] as const;

const CROSS_LAYER_ARC = 'arc-fuyuki-station-misaki-town';

test.describe('P2 M1 verifier seams (C3/C19/FX1/F03/D53)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readLabels(page)).toContain('Emiya Residence');
  });

  test('header keeps the PIN layer while the viewer shows Misaki (C19/C22 snapshot seam)', async ({
    page,
  }) => {
    await activate(page, 'tme-layer-layer-misaki');
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']); // viewer switched

    // The snapshot is pin-scoped: the viewer's layer switch must not leak into
    // any header string (C22 renders the snapshot verbatim; R1).
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence');
    await expect(page.getByTestId('tme-snapshot-layer')).toHaveText('Fuyuki City');
    await expect(page.getByTestId('tme-unit')).toHaveText('min');
  });

  test('the cross-layer station arc never joins the projection on EITHER layer (C3, M1)', async ({
    page,
  }) => {
    expect(await readEdgeStyle(page, CROSS_LAYER_ARC)).toBeNull(); // not on Fuyuki

    await activate(page, 'tme-layer-layer-misaki');
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']);
    expect(await readEdgeStyle(page, CROSS_LAYER_ARC)).toBeNull(); // not on Misaki either

    await activate(page, 'tme-layer-layer-fuyuki');
    await expect.poll(() => readLabels(page)).toContain('Emiya Residence');
    expect(await readEdgeStyle(page, CROSS_LAYER_ARC)).toBeNull(); // and after the round-trip
  });

  test('per-layer node sets are exactly FX1 — no duplicates after a round-trip (FX1, F01)', async ({
    page,
  }) => {
    const fuyuki = await readLabels(page);
    expect([...fuyuki].sort()).toEqual([...FUYUKI_LABELS].sort());

    await activate(page, 'tme-layer-layer-misaki');
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']);

    await activate(page, 'tme-layer-layer-fuyuki');
    await expect.poll(() => readLabels(page)).toHaveLength(FUYUKI_LABELS.length); // rebuild, not append
    const roundTrip = await readLabels(page);
    expect([...roundTrip].sort()).toEqual([...FUYUKI_LABELS].sort());
  });

  test('background is object-fit contain and pointer-transparent (F03/§6.2 — computed styles)', async ({
    page,
  }) => {
    const bg = page.getByTestId('tme-bg');
    await expect(bg).toHaveCount(1); // Fuyuki carries the D69 harness asset
    await expect(bg).toHaveCSS('object-fit', 'contain'); // fitted + centered (letterboxing)
    await expect(bg).toHaveCSS('pointer-events', 'none'); // the graph is the interface on top
  });

  test('desktop: mouse pan on empty canvas changes cy.pan without page scroll (D53)', async ({
    page,
  }) => {
    // Desktop cell of the pan family: the touch twin is B-103's phone-only
    // one-finger pan test (D53 — one family, both worlds).
    test.skip(isPhone(), 'touch pan is covered by interactions.e2e-spec (phone twin)');
    const before = await readPan(page);
    // Bottom-center of the 1280x720 desktop canvas — clear of every FX1 node,
    // district box, the header and the bottom-left layer switcher.
    await page.mouse.move(640, 680);
    await page.mouse.down();
    await page.mouse.move(760, 620, { steps: 8 });
    await page.mouse.up();
    const after = await readPan(page);
    expect(after.x).not.toBe(before.x);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('harness console stays clean across load, selection and layer switches (§6.2 hygiene)', async ({
    page,
  }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    // A representative interaction sweep: select the pin, switch both ways.
    const pos = await page.evaluate(() => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error('window.__TME_E2E__ missing');
      const box = document.querySelector('[data-testid="tme-canvas"]')!.getBoundingClientRect();
      const p = hook.nodeRenderedPosition('emiya-residence');
      if (p === null) throw new Error('pin not rendered');
      return { x: box.x + p.x, y: box.y + p.y };
    });
    if (isPhone()) await page.touchscreen.tap(pos.x, pos.y);
    else await page.mouse.click(pos.x, pos.y);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();

    await activate(page, 'tme-layer-layer-misaki');
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']);
    await activate(page, 'tme-layer-layer-fuyuki');
    await expect.poll(() => readLabels(page)).toHaveLength(FUYUKI_LABELS.length);

    expect(bad, 'no console errors/warnings/pageerrors during the sweep').toEqual([]);
  });
});
