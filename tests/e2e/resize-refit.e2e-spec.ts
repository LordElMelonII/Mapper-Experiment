// tests/e2e/resize-refit.e2e-spec.ts — PKG B-112: the resize → cy.resize() →
// refit → content-tappable chain, pinned END TO END at BOTH playwright
// projects (desktop + emulated phone with touch) per D53/F52.
//
// The ResizeObserver → GraphService.notifyResize() → cy.resize() + refit
// wiring shipped at M1 (map-viewer.component.ts); B-104 pinned live viewport
// resize + orientation change, B-106 added the REFIT for a live-found reason:
// content fitted for a taller stage can otherwise end up underneath the
// stage's fixed chrome (or below the shrunken canvas), untappable. This spec
// pins what neither earlier spec could: that after a resize the map content
// is still TAPPABLE, for both resize shapes.
//
// D91 scoping (B-133): the four panels are OVERLAYS — a panel open/close
// resizes NOTHING on either layout, so the phone panel cell re-derives to
// the ZERO-MOTION invariant (the canvas box and the viewport are byte-put
// across the panel round-trip). The refit guarantee itself now belongs to
// the ENVIRONMENTAL classes (the desktop cell resizes the viewport) and the
// rail's collapse/expand (editor-rail.e2e-spec.ts pins the rail cells); the
// narrow rail collapse keeps the B-106 refit (layer-manager/sheet-panel
// companion specs cover the sheet world's rotation survival).
//
// Cited IDs:
//   §6.1 (canvas-sizing row) — ResizeObserver → cy.resize() keeps the canvas
//             matched to its container; the refit (B-106) keeps the fitted
//             layer visible AND tappable at any stage size. The
//             container-only shape ST's animating drawers will exercise in
//             Phase 4 is the rail's collapse/expand (the surviving
//             panel-driven class — editor-rail.e2e-spec.ts).
//   §6.2     — "panels survive a live viewport resize and orientation
//             change": surviving means usable — a node tap still selects.
//   D91      — panel open/close is a pure overlay transition: zero motion.
//   D2       — the RO callback and every cy-level handler write NO signals —
//             zero change detection; the refit is pure canvas state, which
//             is why it can run outside Angular's knowledge entirely.
//   F52/D53  — one interaction family, both worlds; canvas taps are genuine
//             touchscreen taps on the phone project, mouse clicks on desktop.
//   R1       — the header strings are core snapshots, verbatim, before and
//             after every resize (the B-104 assertions).
//
// Canvas content is read/aimed through the DEV-HARNESS-ONLY
// window.__TME_E2E__ hook (see src/app/app.ts), same discipline as the other
// specs: read-only projections, no closures across the evaluate wire.
import { expect, test, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

/** FX1 arc facts: id + its two endpoint node ids (the edge-tap anchors). */
interface ArcFact {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

const CASTLE_ID = 'einzbern-castle';
const CASTLE_LABEL = 'Einzbern Castle';
/** FX1's only arc into the castle — the phone cell opens the arc panel with it. */
const CASTLE_ARC: ArcFact = {
  id: 'arc-outskirts-einzbern-castle',
  source: 'outskirts',
  target: 'einzbern-castle',
};

const isPhone = (): boolean => test.info().project.name === 'phone';

/**
 * PKG B-142 (REPAIRS R-2) re-baseline: the phone boot now stages AT the pin
 * (the boot-posture zoom, the pin-centered viewport). This spec's aims are
 * exhaustively scanned against the PRE-PACKET WORLD-FIT boot viewport
 * (zoom = 0.282... on FX1 — the whole world in view: the castle at x=-380,
 * the station cluster at x=560+ — all out of the narrow pin-centered view),
 * so the phone cells restore exactly that viewport first by tapping the
 * rail's Fit — the packet's own "explicit full-world ask" (§R2). Desktop
 * never arms the posture (the wide gate mirrors D81's 700px breakpoint),
 * so its boot is byte-unchanged and this is a no-op. Booted twins (the
 * in-test Chromium phone pages) take the same restore. Aim math and every
 * assertion are untouched — the R23 in-box-content law stands throughout.
 */
const restoreBootViewport = async (page: Page): Promise<void> => {
  if (isPhone()) await page.getByTestId('tme-zoom-fit').tap();
};

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId): { x: number; y: number } | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedPosition(nodeId);
  }, id);

const readZoom = (page: Page): Promise<number> =>
  page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.zoom();
  });

const readPan = (page: Page): Promise<{ x: number; y: number }> =>
  page.evaluate(() => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.pan();
  });

const canvasBox = async (page: Page) => {
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return box;
};

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const tapPoint = async (page: Page, x: number, y: number): Promise<void> => {
  if (isPhone()) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
};

/**
 * Wait two animation frames: a resize changes the stage size synchronously,
 * but the ResizeObserver-driven re-fit (notifyResize → cy.resize + fitView)
 * runs just before the next paint — reading rendered positions inside that
 * window yields pre-fit coordinates and the next tap misses. Two rAFs put
 * every read AFTER the refit (deterministic, no arbitrary timeout; the
 * arc-panel spec's settle precedent).
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** Tap a canvas node through its rendered position (seam + canvas box). */
const tapNode = async (page: Page, id: string): Promise<void> => {
  await settle(page); // the resize re-fit lands just before the next paint
  const pos = await readPosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await canvasBox(page);
  await tapPoint(page, box.x + pos.x, box.y + pos.y);
};

/**
 * Tap an arc through the RENDERED MIDPOINT of its two endpoints (the
 * arc-panel specs' aiming pattern): the midpoint is equidistant-far from both
 * 44px node bodies, so the tap lands the EDGE on both input paths. Test-side
 * math only — the UI computes nothing (R1).
 */
const tapEdgeMidpoint = async (page: Page, arc: ArcFact): Promise<void> => {
  await settle(page); // panel open/close re-fits asynchronously — read post-fit
  const source = await readPosition(page, arc.source);
  const target = await readPosition(page, arc.target);
  if (source === null || target === null) {
    throw new Error(`arc ${arc.id} endpoints not rendered (unmounted or absent)`);
  }
  const box = await canvasBox(page);
  await tapPoint(page, box.x + (source.x + target.x) / 2, box.y + (source.y + target.y) / 2);
};

test.describe('resize → refit → content tappable (PKG B-112)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readPosition(page, CASTLE_ID)).not.toBeNull();
  });

  test('live viewport shrink: castle stays inside the canvas and tappable (§6.1 canvas-sizing, §6.2, R1)', async ({
    page,
  }) => {
    // Select nothing: this pins the RESIZE path alone (B-104 already pins
    // selection survival across a resize).
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();

    // Live shrink to 400px height, keeping the width (the B-104 pattern).
    const before = await canvasBox(page);
    await page.setViewportSize({ width: before.width, height: 400 });
    const after = await canvasBox(page);
    expect(after.height, 'canvas shrank with the viewport (§6.2)').toBeLessThan(before.height);
    expect(after.height, 'canvas survived the shrink (§6.1: never 0×0)').toBeGreaterThan(0);

    // The refit guarantee, stated on the geometry: the far-left node's
    // rendered position lands INSIDE the new canvas box — content fitted for
    // the taller stage would sit outside (or under the chrome) after the
    // shrink; only notifyResize's fitView re-fits it into the smaller stage.
    await settle(page);
    const pos = await readPosition(page, CASTLE_ID);
    if (pos === null) throw new Error('castle not rendered after resize');
    expect(pos.x, 'castle x inside the resized canvas (refit ran)').toBeGreaterThanOrEqual(0);
    expect(pos.x, 'castle x inside the resized canvas (refit ran)').toBeLessThanOrEqual(after.width);
    expect(pos.y, 'castle y inside the resized canvas (refit ran)').toBeGreaterThanOrEqual(0);
    expect(pos.y, 'castle y inside the resized canvas (refit ran)').toBeLessThanOrEqual(after.height);

    // The DISCRIMINATING node (B-112 review gate): ryuudou-temple (model
    // y = 470 — the BOTTOM of the fitted content) sits below the 400px canvas
    // pre-refit; castle alone survives the shrink without the refit, so the
    // in-box pair above is only half the proof. This assertion fails if
    // notifyResize ever loses its fitView (the mutant the pin must catch).
    const temple = await readPosition(page, 'ryuudou-temple');
    if (temple === null) throw new Error('temple not rendered after resize');
    expect(temple.y, 'temple y inside the resized canvas (fitView ran — discriminating)').toBeGreaterThanOrEqual(0);
    expect(temple.y, 'temple y inside the resized canvas (fitView ran — discriminating)').toBeLessThanOrEqual(after.height);

    // End to end: the node is actually tappable at its new position — the
    // resize → cy.resize() → refit → content-tappable chain in one gesture.
    const tapAt: Point = { x: after.x + pos.x, y: after.y + pos.y };
    await tapPoint(page, tapAt.x, tapAt.y);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(CASTLE_LABEL);

    // R1: the header strings survive the resize verbatim (the B-104 assertions).
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence');
    await expect(page.getByTestId('tme-snapshot-layer')).toHaveText('Fuyuki City');
    await expect(page.getByTestId('tme-unit')).toHaveText('min');
  });

  test('phone: the arc panel overlays with ZERO motion — the canvas box and the viewport are untouched and content stays tappable (§6.1/§6.2, D91, D2)', async ({
    page,
  }) => {
    test.skip(
      !isPhone(),
      'the phone cell pins the D91 zero-motion invariant on the narrow layout, where the panel used to stack and shrink the stage (map-viewer.component.scss breakpoint)',
    );

    // PANEL open: under D91 the arc panel is a bottom-sheet OVERLAY — the
    // canvas box (height AND width) and the viewport must not move a byte.
    // The old regime stacked the panel below the stage and refit; that
    // resize class no longer exists on narrow panel transitions.
    const before = await canvasBox(page);
    const clientWidthBefore = await page.evaluate(() => document.documentElement.clientWidth);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);

    const after = await canvasBox(page);
    expect(after.width, 'canvas width untouched by the panel open (D91 zero-motion)').toBe(before.width);
    expect(after.height, 'canvas height untouched by the panel open (D91 zero-motion)').toBe(before.height);
    expect(after.height, 'canvas survived (§6.1: never 0×0)').toBeGreaterThan(0);
    const clientWidthAfter = await page.evaluate(() => document.documentElement.clientWidth);
    expect(
      clientWidthAfter,
      'documentElement.clientWidth unchanged — no layout shift at all (§6.1)',
    ).toBe(clientWidthBefore);
    expect(await readZoom(page), 'zoom byte-equal across the open (D91 zero-motion)').toBe(zoomBefore);
    const panAfter = await readPan(page);
    expect(panAfter.x, 'pan.x byte-equal across the open (D91 zero-motion)').toBe(panBefore.x);
    expect(panAfter.y, 'pan.y byte-equal across the open (D91 zero-motion)').toBe(panBefore.y);

    // Content stays tappable through the overlay: a node tap still selects.
    // B-133 (D91) review fix: collapse the route sheet first — its blocked
    // listing is content at boot (the auto-expand) and on the full-width
    // overlay stage its body can cover the castle's tap point. A user
    // collapses it via the sheet's own rail toggle; setup, not assertion.
    if ((await page.getByTestId('tme-sheet-rail').getAttribute('aria-expanded')) === 'true') {
      await page.getByTestId('tme-sheet-rail').click();
      await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'false');
      await page.waitForTimeout(200); // the collapse re-renders — a tap in the same tick can still hit the body
    }
    // Even collapsed, the route rail rides ABOVE the arc sheet in the
    // bottom-anchored stack and can still cover the castle's point — clear
    // the selection with a background tap on the visible canvas ABOVE the
    // sheets (either outcome closes the arc panel), then node-select.
    const closeBox = await canvasBox(page);
    await tapPoint(page, closeBox.x + closeBox.width / 2, closeBox.y + 40);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(CASTLE_LABEL);

    // R1: the header strings survive the overlay transition verbatim.
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence');
    await expect(page.getByTestId('tme-snapshot-layer')).toHaveText('Fuyuki City');
    await expect(page.getByTestId('tme-unit')).toHaveText('min');
  });
});
