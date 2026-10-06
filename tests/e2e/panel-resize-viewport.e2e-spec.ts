// tests/e2e/panel-resize-viewport.e2e-spec.ts — PKG B-125 (D81), re-derived
// under PKG B-133 (D91): the four panels are OVERLAYS — floaters over the
// full-width stage on wide, bottom sheets on narrow — so a panel open/close
// RESIZES NOTHING on either layout. The wide byte-equal cells keep their
// observable (panel transitions move nothing — the viewport math did not
// change, only the mechanism: no stage delta ever). The clamp cells
// re-derive their TRIGGER: the clamp rescue belongs to the surviving
// panel-driven class — the editor rail's collapse/expand on wide (the
// panels can no longer produce one) — and are modeled on
// editor-rail.e2e-spec.ts's rail-expand cell. The phone cell FLIPS: under
// D91 a panel transition moves nothing on narrow either, so it now pins the
// ZERO-MOTION invariant (byte-equal zoom/pan and an unchanged canvas box
// across the open/close round-trip). The environmental class keeps the
// B-106 refit byte-identically (resize-refit.e2e-spec.ts). Desktop cells
// skip on the phone project and vice versa (the established isPhone
// pattern); both projects sit far from the 700px breakpoint, so the layout
// class is never ambiguous.
//
// Cited IDs:
//   D91      — the overlay panel regime: panel open/close never resizes the
//              stage and never moves the viewport; the panel-driven resize
//              class narrows to the rail's collapse/expand (+environmental),
//              whose wide branch preserves the viewport with a pan-only
//              selection rescue clamp.
//   B-120    — the surviving pin: a rebuild never fits (zoom and pan are the
//              user's) — asserted throughout via byte-equal viewport reads.
//   B-106    — the refit the narrow layout keeps for environmental/rail
//              resizes (the phone cells).
//   B-107    — a cross-layer arc's badge IS its whole canvas surface: the
//              clamp's edge-anchor semantics (midpoint) and badge fallback
//              are the engine side of this spec's geometry.
//   R1       — the header strings are core snapshots, verbatim, before and
//              after every transition.
//   D2/R2/R4 — the resize path writes no signals; the e2e hook stays
//              read-only (the __TME_E2E__ discipline).
//   F52/D53  — the phone cell runs touch alone; no hover affordances.
//
// Aiming discipline: canvas content is read/aimed through the
// DEV-HARNESS-ONLY window.__TME_E2E__ hook (see src/app/app.ts) — reads
// only, no closures across the evaluate wire; chrome boxes come from
// Playwright boundingBox() on the component's own classes; every
// post-resize read waits the two-rAF settle (the arc-panel precedent).
// Expected rescue deltas are computed IN-PAGE from those reads (test-side
// math — the UI computes nothing, R1), sub-pixel-tolerant because the
// service's internal box edges are float-identical only to rounding.
import { expect, test, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  zoom(): number;
  pan(): { x: number; y: number };
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
}

interface ArcFact {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** FX1 facts (data/worlds/fuyuki.ts) the cells engineer against. */
const CASTLE_ARC: ArcFact = {
  id: 'arc-outskirts-einzbern-castle',
  source: 'outskirts',
  target: 'einzbern-castle',
};
const BRIDGE_ARC: ArcFact = {
  id: 'arc-emiya-residence-fuyuki-bridge',
  source: 'emiya-residence',
  target: 'fuyuki-bridge',
};
const CASTLE_ID = 'einzbern-castle';
const CASTLE_LABEL = 'Einzbern Castle';
const OUTSKIRTS_ID = 'outskirts';
const GHOST_HOUSE_ID = 'ghost-house'; // FX1's RIGHTMOST content (x 625)
const TEMPLE_ID = 'ryuudou-temple'; // FX1's BOTTOM content (y 470)

/** D91/B-127/B-128 (D86/D85): the measured INTERACTIVE chrome surfaces (map-viewer.component — the rail, the breadcrumb bar and the chip). */
const CHROME_SELECTORS = ['.tme-rail', '.tme-breadcrumb', '.tme-chip'];

const R1_HEADERS: ReadonlyArray<[string, string]> = [
  ['tme-location', 'Emiya Residence'],
  ['tme-snapshot-layer', 'Fuyuki City'],
  ['tme-unit', 'min'],
];

const isPhone = (): boolean => test.info().project.name === 'phone';

const readZoom = (page: Page): Promise<number> => page.evaluate((): number => {
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

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId) => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedPosition(nodeId);
  }, id);

const readBox = (page: Page, id: string): Promise<Box | null> =>
  page.evaluate((nodeId) => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedBoundingBox(nodeId);
  }, id);

const expectPositioned = (pos: { x: number; y: number } | null, id: string): { x: number; y: number } => {
  if (pos === null) throw new Error(`${id} not rendered (unmounted or absent)`);
  return pos;
};

const expectBoxed = (box: Box | null, id: string): Box => {
  if (box === null) throw new Error(`${id} has no rendered bounding box`);
  return box;
};

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
 * Wait two animation frames: a resize's RO-driven path (D91: preserve +
 * rescue for the wide rail class, the B-106 refit otherwise) runs just
 * before the next paint — reading inside that window yields pre-resize
 * coordinates. Two rAFs put every read AFTER it (deterministic, no
 * arbitrary timeout).
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
  await settle(page);
  const pos = expectPositioned(await readPosition(page, id), id);
  const box = await canvasBox(page);
  await tapPoint(page, box.x + pos.x, box.y + pos.y);
};

/**
 * Tap an arc through the RENDERED MIDPOINT of its two endpoints (the
 * arc-panel specs' aiming pattern — test-side math, R1-safe), re-reading
 * post-settle so a pan/zoomed view aims at live pixels.
 */
const tapEdgeMidpoint = async (page: Page, arc: ArcFact): Promise<void> => {
  await settle(page);
  const source = expectPositioned(await readPosition(page, arc.source), arc.source);
  const target = expectPositioned(await readPosition(page, arc.target), arc.target);
  const box = await canvasBox(page);
  await tapPoint(page, box.x + (source.x + target.x) / 2, box.y + (source.y + target.y) / 2);
};

/** R1: the three core header strings, verbatim. */
const expectHeaders = async (page: Page): Promise<void> => {
  for (const [testId, text] of R1_HEADERS) {
    await expect(page.getByTestId(testId)).toHaveText(text);
  }
};

/** Housekeeping: collect console errors/warnings/pageerrors (the arc-editing pattern). */
const collectConsole = (page: Page): string[] => {
  const bad: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));
  return bad;
};

/**
 * D91: the interactive-chrome rects as the CLAMP sees them — Playwright
 * boundingBoxes translated into the canvas coordinate space (the same
 * consumer-math map-viewer.component does for the service).
 */
const chromeBoxes = async (page: Page): Promise<Box[]> => {
  const canvas = await canvasBox(page);
  const rects: Box[] = [];
  for (const selector of CHROME_SELECTORS) {
    const loc = page.locator(selector);
    if ((await loc.count()) === 0) continue; // conditional chrome not rendered
    const el = loc.first();
    if (!(await el.isVisible())) continue;
    const box = await el.boundingBox();
    if (box === null) continue;
    rects.push({ x: box.x - canvas.x, y: box.y - canvas.y, w: box.width, h: box.height });
  }
  return rects;
};

/** Sub-pixel slack for float-path differences against the service's math. */
const EPS = 0.5;

/** The clamp's post-state: the box fully in-canvas and chrome-clear. */
const expectInCanvasAndClear = (box: Box, canvas: { width: number; height: number }, chrome: Box[], label: string): void => {
  expect(box.x, `${label} left edge in-canvas`).toBeGreaterThanOrEqual(-EPS);
  expect(box.x + box.w, `${label} right edge in-canvas`).toBeLessThanOrEqual(canvas.width + EPS);
  expect(box.y, `${label} top edge in-canvas`).toBeGreaterThanOrEqual(-EPS);
  expect(box.y + box.h, `${label} bottom edge in-canvas`).toBeLessThanOrEqual(canvas.height + EPS);
  for (const [i, r] of chrome.entries()) {
    const overlaps =
      box.x < r.x + r.w - EPS && box.x + box.w > r.x + EPS && box.y < r.y + r.h - EPS && box.y + box.h > r.y + EPS;
    expect(overlaps, `${label} clear of interactive chrome #${i}`).toBe(false);
  }
};

/**
 * D91: the pan used to engineer a selection into the rail's reclaimed band —
 * a background drag in the stage's empty bottom band (below the fitted
 * content, clear of every element: a down on a node body is captured by the
 * node, not the pan; a drag is not a tap, so any selection stands). The
 * start point is the canvas's horizontal center so it clears the boot route
 * floater (bottom-right anchor) on both sides.
 */
const panByDrag = async (page: Page, dx: number): Promise<void> => {
  const canvas = await canvasBox(page);
  const startX = canvas.x + canvas.width / 2;
  const startY = canvas.y + canvas.height - 70;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY, { steps: 6 });
  await page.mouse.up();
  await settle(page);
};

test.describe('panel transitions and rail resizes (PKG B-133, D91)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readPosition(page, CASTLE_ARC.source)).not.toBeNull();
    await expect.poll(() => readPosition(page, CASTLE_ARC.target)).not.toBeNull();
  });

  test('wide, view mode: arc select opens the floating panel zoom/pan byte-equal; node select closes it byte-equal (D91)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout zero-motion rule is the desktop project (SCSS 700px breakpoint)');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // The castle arc's midpoint sits mid-canvas at the fit — in view and
    // clear of every chrome rect — so the ZERO-MOTION invariant must hold
    // exactly: the arc panel FLOATS (D91 — it resizes nothing), and with no
    // rescue-worthy displacement nothing moves at all.
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    expect(await readZoom(page), 'zoom preserved across the panel open').toBe(zoomBefore);
    const panOpen = await readPan(page);
    expect(panOpen.x, 'pan.x preserved across the panel open').toBe(panBefore.x);
    expect(panOpen.y, 'pan.y preserved across the panel open').toBe(panBefore.y);

    // Node select ⇒ the arc panel closes (the B-106 mutual exclusion) — the
    // overlay vanishes, the viewport stays byte-put.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await settle(page);
    expect(await readZoom(page), 'zoom preserved across the panel close').toBe(zoomBefore);
    const panClosed = await readPan(page);
    expect(panClosed.x, 'pan.x preserved across the panel close').toBe(panBefore.x);
    expect(panClosed.y, 'pan.y preserved across the panel close').toBe(panBefore.y);

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('wide, zoomed in: arc-select open and node-select swap keep the zoomed viewport byte-equal (D91)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout zero-motion rule is the desktop project');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    const fitZoom = await readZoom(page);

    // Wheel-zoom IN about the castle arc's midpoint (cytoscape zooms at the
    // cursor) so both endpoints stay on-canvas; the variant's point is that
    // a NON-fit zoom survives the panel transitions byte-untouched.
    const canvas = await canvasBox(page);
    const source = expectPositioned(await readPosition(page, CASTLE_ARC.source), CASTLE_ARC.source);
    const target = expectPositioned(await readPosition(page, CASTLE_ARC.target), CASTLE_ARC.target);
    await page.mouse.move(
      canvas.x + (source.x + target.x) / 2,
      canvas.y + (source.y + target.y) / 2,
    );
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -240);
    await settle(page);
    const zoomBefore = await readZoom(page);
    expect(zoomBefore, 'engineering: the view is zoomed in past the fit').not.toBe(fitZoom);
    const panBefore = await readPan(page);

    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    expect(await readZoom(page), 'zoomed zoom preserved across the open').toBe(zoomBefore);
    const panOpen = await readPan(page);
    expect(panOpen.x).toBe(panBefore.x);
    expect(panOpen.y).toBe(panBefore.y);

    // The close swaps to a node selection — the arc panel closes, the chip
    // shows, and the zoomed viewport is still byte-put.
    await tapNode(page, OUTSKIRTS_ID);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await expect(page.getByTestId('tme-selection-label')).toHaveText('Outskirts');
    await settle(page);
    expect(await readZoom(page), 'zoomed zoom preserved across the close').toBe(zoomBefore);
    const panClosed = await readPan(page);
    expect(panClosed.x).toBe(panBefore.x);
    expect(panClosed.y).toBe(panBefore.y);

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('wide clamp, node: selecting the rightmost leaf in the editor floats the panel with zero motion, and a rail EXPAND rescues it pan-only, minimal pure-x (D91)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout clamp rule is the desktop project');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // Enter the editor FIRST (D91 aiming repair, B-133c): the collapsed rail
    // strip carries only the expand affordance (B-127), so the editor toggle
    // must be operated while the rail is still expanded. Editor entry alone
    // moves nothing (no selection, no panel — byte-equal asserts below).
    await page.getByTestId('tme-editor-toggle').click();
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');

    // Collapse the rail (nothing selected ⇒ the preserve path's
    // zero-motion case: nothing can leave a GROWING canvas) — the stage
    // widens, and the reclaimed band the EXPAND will take back is engineered
    // below (the editor-rail rail-expand cell's proven pattern).
    await page.getByTestId('tme-rail-toggle').click();
    await settle(page);
    const canvasCollapsed = await canvasBox(page);
    expect(await readZoom(page), 'collapse (stage grows): zoom byte-equal').toBe(zoomBefore);
    expect((await readPan(page)).x, 'collapse (stage grows): pan.x byte-equal').toBe(panBefore.x);

    // Engineering: FX1's rightmost content is panned (view-mode background
    // drag — a drag is not a tap) so its right edge sits inside the
    // COLLAPSED canvas but past the post-EXPAND band.
    const boxFit = expectBoxed(await readBox(page, GHOST_HOUSE_ID), GHOST_HOUSE_ID);
    const dragDx = canvasCollapsed.width - 24 - (boxFit.x + boxFit.w);
    if (dragDx > 5) await panByDrag(page, dragDx);
    const boxPre = expectBoxed(await readBox(page, GHOST_HOUSE_ID), GHOST_HOUSE_ID);
    expect(
      boxPre.x + boxPre.w,
      'engineering: ghost-house sits past the post-expand band',
    ).toBeGreaterThan(canvasCollapsed.width - 100);
    const panPanned = await readPan(page);

    // Editor select ⇒ the property panel FLOATS (D91): the stage must not
    // move a byte — no stage delta, no refit, no clamp motion (the selection
    // is comfortably in-canvas). The editor is already on (entered before
    // the rail collapse — the collapsed strip has no editor toggle).
    await tapNode(page, GHOST_HOUSE_ID);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await settle(page);
    const canvasSelected = await canvasBox(page);
    expect(canvasSelected.width, 'the stage NEVER resizes for a panel (D91)').toBe(canvasCollapsed.width);
    expect(await readZoom(page), 'zoom untouched by the panel open (D91)').toBe(zoomBefore);
    const panSelected = await readPan(page);
    expect(panSelected.x, 'pan untouched by the panel open (D91)').toBe(panPanned.x);
    expect(panSelected.y, 'pan untouched by the panel open (D91)').toBe(panPanned.y);

    // Expand the rail: the stage narrows from the left ⇒ the preserved
    // viewport leaves the selection past the right edge ⇒ the clamp rescues
    // it — ONE minimal pure-x pan, zoom byte-put (the D91 panel-driven
    // class's surviving wide branch).
    await page.getByTestId('tme-rail-toggle').click();
    await settle(page);
    const canvasAfter = await canvasBox(page);
    expect(canvasAfter.width, 'the stage narrowed with the expanded rail').toBeLessThan(canvasCollapsed.width);
    const expectedDx = canvasAfter.width - (boxPre.x + boxPre.w);
    expect(expectedDx, 'engineering: a rescue was needed').toBeLessThan(0);
    expect(await readZoom(page), 'zoom untouched by the rescue (D91)').toBe(zoomBefore);
    const panAfter = await readPan(page);
    expect(panAfter.y, 'the rescue is pure-x (no vertical motion)').toBe(panSelected.y);
    expect(
      Math.abs(panAfter.x - panSelected.x - expectedDx),
      'pan moved by exactly the minimal rescue',
    ).toBeLessThanOrEqual(EPS);

    // The rescued selection: fully in-canvas and clear of every interactive
    // chrome rect as the clamp sees them (Playwright boundingBoxes).
    const boxAfter = expectBoxed(await readBox(page, GHOST_HOUSE_ID), GHOST_HOUSE_ID);
    expectInCanvasAndClear(boxAfter, canvasAfter, await chromeBoxes(page), 'rescued ghost-house');

    // Settle: dismiss (the floating panel closes with the selection — ZERO
    // motion: no resize exists to react to), then re-select — the settled
    // pan must not move again.
    await page.getByTestId('tme-selection-chip').click();
    await expect(page.getByTestId('tme-property-panel')).toBeHidden();
    await settle(page);
    const panDismissed = await readPan(page);
    expect(panDismissed.x, 'no selection ⇒ zero motion on the close').toBe(panAfter.x);
    expect(panDismissed.y).toBe(panAfter.y);
    expect(await readZoom(page)).toBe(zoomBefore);

    // Re-select (the editor is still on): the property panel floats again,
    // the pan and zoom stand untouched.
    await tapNode(page, GHOST_HOUSE_ID);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await settle(page);
    const panReopened = await readPan(page);
    expect(panReopened.x, 'the clamp is idempotent — a settled pan never moves again').toBe(panAfter.x);
    expect(panReopened.y).toBe(panAfter.y);
    expect(await readZoom(page)).toBe(zoomBefore);
    expectInCanvasAndClear(
      expectBoxed(await readBox(page, GHOST_HOUSE_ID), GHOST_HOUSE_ID),
      await canvasBox(page),
      await chromeBoxes(page),
      're-selected ghost-house',
    );

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('wide clamp, arc: the floating arc panel opens with zero motion, and a rail EXPAND rescues a panned-past-the-band midpoint to the canvas edge, zoom byte-put (D91/B-107)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout clamp rule is the desktop project');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // Collapse the rail first (nothing selected ⇒ zero motion), then pan the
    // bridge arc's box MIDPOINT into the band the EXPAND will reclaim —
    // inside the collapsed canvas, past the post-expand right edge (the
    // clamp anchors an edge at its rendered-box midpoint — the invariant's
    // edge semantics).
    await page.getByTestId('tme-rail-toggle').click();
    await settle(page);
    const canvasCollapsed = await canvasBox(page);
    expect(await readZoom(page), 'collapse (stage grows): zoom byte-equal').toBe(zoomBefore);
    const boxFit = expectBoxed(await readBox(page, BRIDGE_ARC.id), BRIDGE_ARC.id);
    const midFitX = boxFit.x + boxFit.w / 2;
    const dragDx = canvasCollapsed.width - 60 - midFitX;
    if (dragDx > 5) await panByDrag(page, dragDx);
    const boxPre = expectBoxed(await readBox(page, BRIDGE_ARC.id), BRIDGE_ARC.id);
    const midPreX = boxPre.x + boxPre.w / 2;
    expect(midPreX, 'engineering: the midpoint is still tappable (in-canvas)').toBeLessThan(
      canvasCollapsed.width,
    );
    expect(midPreX, 'engineering: the midpoint sits past the post-expand band').toBeGreaterThan(
      canvasCollapsed.width - 100,
    );
    const panPanned = await readPan(page);

    // Tap the midpoint ⇒ the ARC is selected and its panel FLOATS — the
    // zero-motion invariant (D91): zoom and pan byte-untouched by the open.
    await tapEdgeMidpoint(page, BRIDGE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    expect(await readZoom(page), 'zoom untouched by the floating panel open (D91)').toBe(zoomBefore);
    const panOpen = await readPan(page);
    expect(panOpen.x, 'pan untouched by the floating panel open (D91)').toBe(panPanned.x);
    expect(panOpen.y, 'pan untouched by the floating panel open (D91)').toBe(panPanned.y);

    // Expand the rail: the stage narrows ⇒ the midpoint falls outside ⇒ the
    // clamp rescues it — ONE minimal pure-x pan bringing the MIDPOINT to the
    // canvas's right edge (an edge's box may legally extend past the stage).
    await page.getByTestId('tme-rail-toggle').click();
    await settle(page);
    const canvasAfter = await canvasBox(page);
    const expectedDx = canvasAfter.width - midPreX;
    expect(expectedDx, 'engineering: the midpoint sat in the reclaimed band').toBeLessThan(0);
    expect(await readZoom(page), 'zoom untouched by the rescue').toBe(zoomBefore);
    const panAfter = await readPan(page);
    expect(panAfter.y, 'the rescue is pure-x').toBe(panPanned.y);
    expect(
      Math.abs(panAfter.x - panPanned.x - expectedDx),
      'pan moved by exactly the minimal rescue',
    ).toBeLessThanOrEqual(EPS);

    // Post-rescue: the box's MIDPOINT is in-canvas and point-clear of every
    // chrome rect (an edge's box may legally extend past the stage).
    const boxAfter = expectBoxed(await readBox(page, BRIDGE_ARC.id), BRIDGE_ARC.id);
    const midAfter: Point = { x: boxAfter.x + boxAfter.w / 2, y: boxAfter.y + boxAfter.h / 2 };
    expect(midAfter.x, 'rescued midpoint in-canvas').toBeGreaterThanOrEqual(-EPS);
    expect(midAfter.x, 'rescued midpoint in-canvas').toBeLessThanOrEqual(canvasAfter.width + EPS);
    expect(midAfter.y, 'rescued midpoint in-canvas').toBeGreaterThanOrEqual(-EPS);
    expect(midAfter.y, 'rescued midpoint in-canvas').toBeLessThanOrEqual(canvasAfter.height + EPS);
    for (const [i, r] of (await chromeBoxes(page)).entries()) {
      const inside =
        midAfter.x > r.x - EPS && midAfter.x < r.x + r.w + EPS && midAfter.y > r.y - EPS && midAfter.y < r.y + r.h + EPS;
      expect(inside, `rescued midpoint clear of interactive chrome #${i}`).toBe(false);
    }

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('wide, editor parity: the floating property panel and the arc→property swaps never move the viewport (D91)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout zero-motion rule is the desktop project');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    await page.getByTestId('tme-editor-toggle').click();
    await tapEdgeMidpoint(page, CASTLE_ARC); // an editor-mode edge tap opens the arc panel
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // Arc → property swap: the node select closes the arc panel and opens
    // the property panel — both FLOAT (D91), so the castle node far from
    // every chrome band keeps the common case: zero motion.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await settle(page);
    expect(await readZoom(page), 'zoom untouched by the arc→property swap').toBe(zoomBefore);
    const panSwapped = await readPan(page);
    expect(panSwapped.x).toBe(panBefore.x);
    expect(panSwapped.y).toBe(panBefore.y);

    // Property → arc swap back: the edge select closes the property panel
    // and re-opens the arc panel — overlays both, nothing resizes, both
    // preserve.
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-property-panel')).toBeHidden();
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    expect(await readZoom(page), 'zoom untouched by the property→arc swap').toBe(zoomBefore);
    const panSwappedBack = await readPan(page);
    expect(panSwappedBack.x).toBe(panBefore.x);
    expect(panSwappedBack.y).toBe(panBefore.y);

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('wide discriminator: a real viewport resize with a panel open still refits (D91 keeps the environmental class)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the desktop environmental cell mirrors resize-refit\'s desktop shrink');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    const zoomBefore = await readZoom(page);

    // The VIEWPORT moves (720 → 400 height) while the panel stays open ⇒
    // ENVIRONMENTAL ⇒ the B-106 refit must run. The temple (the content's
    // bottom) fits the shrunken stage only through fitView — the
    // resize-refit pattern's discriminating node.
    await page.setViewportSize({ width: 1280, height: 400 });
    await settle(page);
    const canvasAfter = await canvasBox(page);
    const temple = expectPositioned(await readPosition(page, TEMPLE_ID), TEMPLE_ID);
    expect(temple.x, 'temple x inside the resized canvas (refit ran)').toBeGreaterThanOrEqual(0);
    expect(temple.x, 'temple x inside the resized canvas (refit ran)').toBeLessThanOrEqual(canvasAfter.width);
    expect(temple.y, 'temple y inside the resized canvas (refit ran)').toBeGreaterThanOrEqual(0);
    expect(temple.y, 'temple y inside the resized canvas (refit ran)').toBeLessThanOrEqual(canvasAfter.height);
    expect(await readZoom(page), 'the environmental refit re-zoomed').not.toBe(zoomBefore);

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('wide, no-selection close: background tap with the panel open closes it with ZERO motion (D91)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout zero-motion rule is the desktop project');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // A view-mode background tap clears the selection AND closes the panel —
    // an overlay vanishing with NOTHING selected ⇒ zero motion (D91: there
    // is no resize to react to, not even a clamp).
    const canvas = await canvasBox(page);
    await tapPoint(page, canvas.x + canvas.width / 2, canvas.y + canvas.height - 60);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    await settle(page);
    expect(await readZoom(page), 'zoom untouched by the no-selection close').toBe(zoomBefore);
    const panAfter = await readPan(page);
    expect(panAfter.x, 'pan untouched by the no-selection close').toBe(panBefore.x);
    expect(panAfter.y, 'pan untouched by the no-selection close').toBe(panBefore.y);

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('phone: the arc panel overlays with zero motion — byte-equal zoom/pan and an unchanged canvas box across the open/close round-trip (D91, F52/D53)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the narrow-layout zero-motion rule is the phone project');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);
    const canvasBefore = await canvasBox(page);

    // Touch alone: the arc select opens the panel as a bottom-sheet OVERLAY
    // (D91) — the canvas box must not move a pixel (the old stacked-region
    // regime shrank the stage and refit; that resize class is GONE on
    // narrow panel transitions too).
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    const canvasOpen = await canvasBox(page);
    expect(canvasOpen.width, 'the canvas box never resizes for a panel open (D91)').toBe(canvasBefore.width);
    expect(canvasOpen.height, 'the canvas box never resizes for a panel open (D91)').toBe(canvasBefore.height);
    expect(await readZoom(page), 'zoom byte-equal across the open (D91 zero-motion)').toBe(zoomBefore);
    const panOpen = await readPan(page);
    expect(panOpen.x, 'pan.x byte-equal across the open (D91 zero-motion)').toBe(panBefore.x);
    expect(panOpen.y, 'pan.y byte-equal across the open (D91 zero-motion)').toBe(panBefore.y);

    // Close by node select (the arc panel's mutual exclusion — touch alone):
    // the overlay vanishes, the viewport and the canvas box are still
    // byte-put, and the selection is live (content stays tappable — the
    // fitted content never moved).
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
    // sheets (either outcome — empty-canvas clear or a node's mutual
    // exclusion — closes the arc panel), then node-select the castle.
    const closeBox = await canvasBox(page);
    await tapPoint(page, closeBox.x + closeBox.width / 2, closeBox.y + 40);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(CASTLE_LABEL);
    await settle(page);
    const canvasClosed = await canvasBox(page);
    expect(canvasClosed.width, 'the canvas box never resizes for a panel close (D91)').toBe(canvasBefore.width);
    expect(canvasClosed.height, 'the canvas box never resizes for a panel close (D91)').toBe(canvasBefore.height);
    expect(await readZoom(page), 'zoom byte-equal across the close (D91 zero-motion)').toBe(zoomBefore);
    const panClosed = await readPan(page);
    expect(panClosed.x, 'pan.x byte-equal across the close (D91 zero-motion)').toBe(panBefore.x);
    expect(panClosed.y, 'pan.y byte-equal across the close (D91 zero-motion)').toBe(panBefore.y);

    // D53: the panel cycle never forces horizontal scroll at 390px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at the phone viewport (F52/D53)').toBeLessThanOrEqual(0);

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });
});
