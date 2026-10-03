// tests/e2e/canvas.e2e-spec.ts — PKG B-102, the first e2e spec (D68).
// Runs under BOTH playwright projects (desktop + emulated phone with touch) —
// D53/F52 mobile-and-desktop parity is mandatory for every UI packet.
//
// Cited IDs: F01 (one layer plane at a time, FX1 layers switchable) · F03
// (per-layer background fitted + centered, graph always on top, D69 harness
// asset) · F07 (districts are compound containers) · F52/D53 (touch-only
// parity, >= 44px targets, canvas touch-action: none) · C2 (blocked arcs
// DRAWN dashed, never hidden) · D2 (zoneless signal service) · D3 (headless
// cy mount/unmount lifecycle) · D7 (stylesheet as data) · FX1 (fixture map).
//
// Canvas content is read through the DEV-HARNESS-ONLY window.__TME_E2E__ hook
// (see src/app/app.ts): a read-only projection of the cytoscape model. The
// hook is registered by the harness app only — the ST entry (src/st/entry.ts)
// never ships it.
import { expect, test, type Locator, type Page } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  edgeLineStyle(id: string): string | null;
}

/** Read the labels of the nodes currently projected onto the canvas. */
const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeLabels();
  });

/** Read one edge's resolved line-style ('solid' | 'dashed' | ...), or null. */
const readLineStyle = (page: Page, id: string): Promise<string | null> =>
  page.evaluate((edgeId): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.edgeLineStyle(edgeId);
  }, id);

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const activate = async (locator: Locator): Promise<void> => {
  if (test.info().project.name === 'phone') await locator.tap();
  else await locator.click();
};

test.describe('map canvas harness (PKG B-102)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
  });

  test('canvas host exists and is non-zero sized (D3 mount)', async ({ page }) => {
    const box = await page.getByTestId('tme-canvas').boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);
  });

  test('layer switcher lists both FX1 layers (F01/FX1)', async ({ page }) => {
    await expect(page.getByTestId('tme-layer-layer-fuyuki')).toHaveText('Fuyuki City');
    await expect(page.getByTestId('tme-layer-layer-misaki')).toHaveText('Misaki Town');
  });

  test('header shows pin location and pin layer name verbatim (R1, FX1)', async ({ page }) => {
    // Exact strings from facade.getSnapshot() — the pin (emiya-residence)
    // lives on layer-fuyuki, whose NAME is 'Fuyuki City'; the unit is the
    // snapshot's one honest currency (FX1 canonical unit: minutes).
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence');
    await expect(page.getByTestId('tme-snapshot-layer')).toHaveText('Fuyuki City');
    await expect(page.getByTestId('tme-unit')).toHaveText('min');
  });

  test('tapping the Misaki switcher swaps the rendered node set (F01/D16, F52/D53)', async ({ page }) => {
    // Fuyuki first: the pin's layer, with its 13 leaves + 2 district boxes.
    await expect.poll(readLabels.bind(null, page)).toContain('Emiya Residence');
    await activate(page.getByTestId('tme-layer-layer-misaki'));
    // Misaki Town is the misaki layer's single node — and the Fuyuki set is
    // GONE, proving one plane at a time (F01/D16, no layer blending).
    await expect.poll(readLabels.bind(null, page)).toContain('Misaki Town');
    await expect.poll(readLabels.bind(null, page)).not.toContain('Emiya Residence');
  });

  test('blocked arc renders dashed; a normal arc renders solid (C2, D7)', async ({ page }) => {
    // C2: blocked arcs are excluded from routing but remain DRAWN — dashed,
    // via the tme-blocked stylesheet rule (D7 data), contrasted here against
    // an unblocked sibling arc on the same layer.
    await expect.poll(readLineStyle.bind(null, page, 'arc-emiya-residence-fuyuki-bridge')).toBe('dashed');
    await expect.poll(readLineStyle.bind(null, page, 'arc-emiya-residence-shopping-district')).toBe('solid');
  });

  test('harness background image loads for the active layer (F03/D69)', async ({ page }) => {
    const bg = page.getByTestId('tme-bg');
    await expect(bg).toHaveCount(1);
    // naturalWidth > 0 proves the asset actually loaded (not a broken img).
    await expect
      .poll(() => bg.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  });

  test('phone only: canvas host computes touch-action none (F52/D53)', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'touch-action belongs to the touch project');
    const touchAction = await page
      .getByTestId('tme-canvas')
      .evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe('none');
  });

  // B-104: the first-paint regression net — pin the deterministic initial view
  // (loadMap → first layer → preset layout → facade snapshot) so any drift in
  // the load path fails fast (F01/F19, FX1, C2, R1).
  test('first paint is deterministic: Fuyuki active, pin labeled, both buttons, bridge dashed (F01/F19, FX1, C2, R1)', async ({
    page,
  }) => {
    // F01/FX1: the FIRST layer (Fuyuki City) is active on load — its leaves
    // render, Misaki's single node does not.
    await expect.poll(readLabels.bind(null, page)).toContain('Emiya Residence');
    await expect.poll(readLabels.bind(null, page)).not.toContain('Misaki Town');

    // R1: header strings are the facade snapshot's, verbatim.
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence');
    await expect(page.getByTestId('tme-snapshot-layer')).toHaveText('Fuyuki City');
    await expect(page.getByTestId('tme-unit')).toHaveText('min');

    // F01/FX1: both layer switcher buttons present with exact names.
    await expect(page.getByTestId('tme-layer-layer-fuyuki')).toHaveText('Fuyuki City');
    await expect(page.getByTestId('tme-layer-layer-misaki')).toHaveText('Misaki Town');

    // C2: the blocked bridge is dashed from the very first paint.
    await expect.poll(readLineStyle.bind(null, page, 'arc-emiya-residence-fuyuki-bridge')).toBe('dashed');
  });
});
