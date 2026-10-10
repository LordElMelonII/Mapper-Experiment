// tests/e2e/viewport.e2e-spec.ts — PKG B-104: the §6.2 viewport-resilience
// slice — panels survive a live viewport resize and orientation change — at
// BOTH playwright projects (D53/F52); orientation change is a phone-world
// behavior and runs there.
//
// Cited IDs:
//   §6.2 Touch & viewport — "panels survive a live viewport resize and
//             orientation change"; no horizontal scroll at narrow widths.
//   D53/F52  — phone-sized parity: tap targets stay >= 44px, no hover-only
//             affordances, panels adapt (never overflow).
//   D2       — resize handling writes no signals (GraphService.notifyResize
//             through the ResizeObserver; zero change detection).
//   R1       — the header strings are core snapshots, verbatim, before and
//             after every viewport change.
import { expect, test, type Page } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  edgeLineStyle(id: string): string | null;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId): { x: number; y: number } | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedPosition(nodeId);
  }, id);

const isPhone = (): boolean => test.info().project.name === 'phone';

/**
 * Every layer-switch control remains visible and >= 44px in BOTH dimensions
 * (F52). B-D1 re-baseline (PROPOSAL-D §2.1 + B-D1): the switch surface is
 * regime-bound — the rail's per-layer buttons below 1024; at >=1024 the
 * belt's Layers tool (the entry) plus the manager's row-name buttons (the
 * switches), swept through an open-close cycle that restores the prior
 * chrome state.
 */
const expectLayerButtonsUsable = async (page: Page): Promise<void> => {
  const railIds = ['tme-layer-layer-fuyuki', 'tme-layer-layer-misaki'];
  if (await page.getByTestId(railIds[0]).count()) {
    for (const layerId of railIds) {
      const box = await page.getByTestId(layerId).boundingBox();
      if (box === null) throw new Error(`${layerId} not visible`);
      expect(box.height, `${layerId} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${layerId} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }
    return;
  }
  const toolBox = await page.getByTestId('tme-layers-tool').boundingBox();
  if (toolBox === null) throw new Error('tme-layers-tool not visible');
  expect(toolBox.height, 'tme-layers-tool height >= 44px (F52)').toBeGreaterThanOrEqual(44);
  expect(toolBox.width, 'tme-layers-tool width >= 44px (F52)').toBeGreaterThanOrEqual(44);
  await page.getByTestId('tme-layers-tool').click();
  await expect(page.getByTestId('tme-layer-manager')).toBeVisible();
  for (const name of ['Fuyuki City', 'Misaki Town']) {
    const nameButton = page
      .locator('.tme-layer-row')
      .filter({ has: page.locator('[data-testid="tme-layer-name"]', { hasText: name }) })
      .getByTestId('tme-layer-name');
    const box = await nameButton.boundingBox();
    if (box === null) throw new Error(`${name} row-name button not visible`);
    expect(box.height, `${name} row-name height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    expect(box.width, `${name} row-name width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
  }
  await page.getByTestId('tme-layer-manager-close').click();
  await expect(page.getByTestId('tme-layer-manager')).toBeHidden();
};

test.describe('viewport resilience (PKG B-104)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readPosition(page, 'emiya-residence')).not.toBeNull();
  });

  test('live viewport resize: canvas resizes, header intact, selection survives (§6.2, D2, R1)', async ({
    page,
  }) => {
    // Set a selection first — a resize must not clear UI state (§6.2).
    const pinPos = await readPosition(page, 'emiya-residence');
    if (pinPos === null) throw new Error('pin not rendered');
    const canvasAt = await page.getByTestId('tme-canvas').boundingBox();
    if (canvasAt === null) throw new Error('canvas not visible');
    const tapPoint = { x: canvasAt.x + pinPos.x, y: canvasAt.y + pinPos.y };
    if (isPhone()) await page.touchscreen.tap(tapPoint.x, tapPoint.y);
    else await page.mouse.click(tapPoint.x, tapPoint.y);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();

    // Resize: shrink the height (phone keyboard / drawer, desktop window).
    const before = await page.getByTestId('tme-canvas').boundingBox();
    if (before === null) throw new Error('canvas not visible');
    await page.setViewportSize({ width: before.width, height: 400 });
    const after = await page.getByTestId('tme-canvas').boundingBox();
    if (after === null) throw new Error('canvas not visible after resize');
    expect(after.height, 'canvas shrank with the viewport (§6.2)').toBeLessThan(before.height);
    expect(after.height).toBeGreaterThan(0);

    // §6.2/R1: the panel content — chip, header strings, layer buttons — survives.
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence');
    await expect(page.getByTestId('tme-snapshot-layer')).toHaveText('Fuyuki City');
    await expectLayerButtonsUsable(page);
  });

  test('orientation change: buttons visible + >=44px, no horizontal scroll, header intact (§6.2, F52/D53)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'orientation change is a phone-world behavior (§6.2/D53)');
    // Portrait (the iPhone 13 project default 390x664) → landscape.
    await page.setViewportSize({ width: 664, height: 390 });
    const canvasBox = await page.getByTestId('tme-canvas').boundingBox();
    if (canvasBox === null) throw new Error('canvas not visible after rotation');
    expect(canvasBox.width).toBeGreaterThan(canvasBox.height); // the plane rotated with us

    // §6.2: panels adapt (collapse/wrap), never horizontal-scroll.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll after rotation (§6.2/F52)').toBeLessThanOrEqual(0);

    await expectLayerButtonsUsable(page);
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence');
    await expect(page.getByTestId('tme-unit')).toHaveText('min');
  });

  test('desktop: bigger viewport grows the canvas (§6.2 sanity)', async ({ page }) => {
    test.skip(isPhone(), 'desktop resize sanity runs on the desktop project (§6.2)');
    const before = await page.getByTestId('tme-canvas').boundingBox();
    if (before === null) throw new Error('canvas not visible');
    await page.setViewportSize({ width: 1600, height: 1000 });
    const after = await page.getByTestId('tme-canvas').boundingBox();
    if (after === null) throw new Error('canvas not visible after growth');
    expect(after.width, 'canvas grew with the viewport (§6.2)').toBeGreaterThan(before.width);
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence');
  });
});
