// tests/e2e/panel-resize-viewport.e2e-spec.ts — PKG B-125 (D81): a
// selection-driven panel resize preserves the viewport. On the WIDE layout a
// PANEL-driven container resize (the arc/property panel columns open/close —
// the container changed while the viewport did not) keeps zoom and pan
// byte-untouched, with a pan-only SELECTION RESCUE CLAMP keeping the selected
// element inside the canvas and clear of interactive chrome; the narrow
// layout and the environmental classes keep the B-106 refit byte-identically
// (resize-refit.e2e-spec.ts). Desktop cells skip on the phone project and
// vice versa (the established isPhone pattern); both projects sit far from
// the 700px breakpoint, so the layout class is never ambiguous.
//
// Cited IDs:
//   D81      — the resize-class ruling under test: environmental (either
//              layout) and narrow panel-driven resizes refit; wide
//              panel-driven resizes preserve (no fit, no compensation) and
//              rescue the selection pan-only.
//   B-120    — the surviving pin: a rebuild never fits (zoom and pan are the
//              user's) — asserted throughout via byte-equal viewport reads.
//   B-106    — the refit the narrow layout keeps (the phone cell).
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

/** D81: the five INTERACTIVE chrome surfaces (map-viewer.component). */
const CHROME_SELECTORS = ['.tme-layers', '.tme-chip', '.tme-editor-toggle', '.tme-save-dock', '.tme-tools'];

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
 * Wait two animation frames: a panel open/close changes the stage size
 * synchronously, but the ResizeObserver-driven path (D81: preserve + rescue
 * on the wide layout, the B-106 refit otherwise) runs just before the next
 * paint — reading inside that window yields pre-resize coordinates. Two rAFs
 * put every read AFTER it (deterministic, no arbitrary timeout).
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
 * D81: the interactive-chrome rects as the CLAMP sees them — Playwright
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

test.describe('selection-driven panel resizes preserve the viewport (PKG B-125, D81)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readPosition(page, CASTLE_ARC.source)).not.toBeNull();
    await expect.poll(() => readPosition(page, CASTLE_ARC.target)).not.toBeNull();
  });

  test('wide, view mode: arc select opens the panel zoom/pan byte-equal; node select closes it byte-equal (D81)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout preserve rule is the desktop project (SCSS 700px breakpoint)');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // The castle arc's midpoint sits mid-canvas at the fit — in view and
    // clear of every chrome rect even after the stage narrows — so the
    // preserve path must not move AT ALL (the clamp's common case: zero
    // compensation, D81 geometry fact 1).
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    expect(await readZoom(page), 'zoom preserved across the panel open').toBe(zoomBefore);
    const panOpen = await readPan(page);
    expect(panOpen.x, 'pan.x preserved across the panel open').toBe(panBefore.x);
    expect(panOpen.y, 'pan.y preserved across the panel open').toBe(panBefore.y);

    // Node select ⇒ the arc panel closes (the B-106 mutual exclusion) — the
    // stage widens, the viewport stays byte-put.
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

  test('wide, zoomed in: arc-select open and node-select swap keep the zoomed viewport byte-equal (D81)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout preserve rule is the desktop project');
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

  test('wide clamp, node: the rightmost leaf selected in the editor is rescued pan-only, minimal pure-x (D81)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout preserve rule is the desktop project');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    await page.getByTestId('tme-editor-toggle').click();
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // Engineering: FX1's rightmost content sits inside the full-width stage
    // but PAST the band the docked property panel will take (stage −240px).
    const boxPre = expectBoxed(await readBox(page, GHOST_HOUSE_ID), GHOST_HOUSE_ID);
    const canvasPre = await canvasBox(page);
    expect(boxPre.x + boxPre.w, 'engineering: ghost-house fits the full stage').toBeLessThanOrEqual(canvasPre.width);
    expect(boxPre.x + boxPre.w, 'engineering: ghost-house lies past the post-open band').toBeGreaterThan(
      canvasPre.width - 260,
    );

    await tapNode(page, GHOST_HOUSE_ID); // editor select ⇒ the property panel docks
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await settle(page);
    const canvasAfter = await canvasBox(page);
    expect(canvasAfter.width, 'the stage narrowed with the panel').toBeLessThan(canvasPre.width);

    // Zoom byte-put; the rescue is ONE minimal pure-x pan (the box is
    // vertically clear of all chrome, so dy must be exactly 0) bringing the
    // box's right edge to the canvas's right edge.
    expect(await readZoom(page), 'zoom untouched by the rescue (D81)').toBe(zoomBefore);
    const panAfter = await readPan(page);
    expect(panAfter.y, 'the rescue is pure-x (no vertical motion)').toBe(panBefore.y);
    const expectedDx = canvasAfter.width - (boxPre.x + boxPre.w);
    expect(expectedDx, 'engineering: a rescue was needed').toBeLessThan(0);
    expect(
      Math.abs(panAfter.x - panBefore.x - expectedDx),
      'pan moved by exactly the minimal rescue',
    ).toBeLessThanOrEqual(EPS);

    // The rescued selection: fully in-canvas and clear of every interactive
    // chrome rect as the clamp sees them (Playwright boundingBoxes).
    const boxAfter = expectBoxed(await readBox(page, GHOST_HOUSE_ID), GHOST_HOUSE_ID);
    expectInCanvasAndClear(boxAfter, canvasAfter, await chromeBoxes(page), 'rescued ghost-house');

    // Idempotent settle: dismiss (stage widens, NOTHING selected ⇒ zero
    // motion), then re-select — the settled pan must not move again.
    await page.getByTestId('tme-selection-chip').click();
    await expect(page.getByTestId('tme-property-panel')).toBeHidden();
    await settle(page);
    const panDismissed = await readPan(page);
    expect(panDismissed.x, 'no selection ⇒ zero motion on the close').toBe(panAfter.x);
    expect(panDismissed.y).toBe(panAfter.y);
    expect(await readZoom(page)).toBe(zoomBefore);

    await tapNode(page, GHOST_HOUSE_ID);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await settle(page);
    const panReopened = await readPan(page);
    expect(panReopened.x, 'the clamp is idempotent — repeated resizes settle').toBe(panAfter.x);
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

  test('wide clamp, arc: a panned-past-the-band midpoint is rescued to the canvas edge, zoom byte-put (D81/B-107)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout preserve rule is the desktop project');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // Engineering via pan: drag the view-mode background right ~260px —
    // nodes are ungrabbable in view mode (B-116), so a BACKGROUND drag pans —
    // putting the bridge arc's midpoint into the band the arc panel will
    // take. The drag starts in the stage's empty bottom band (below the
    // fitted content, clear of every element: a down on a node body is
    // captured by the node, not the pan).
    const canvasPre = await canvasBox(page);
    const startX = canvasPre.x + canvasPre.width / 2;
    const startY = canvasPre.y + canvasPre.height - 70;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 260, startY, { steps: 6 });
    await page.mouse.up();
    await settle(page);
    const panPanned = await readPan(page);
    expect(panPanned.x, 'engineering: the drag panned the view').not.toBe(panBefore.x);
    expect(panPanned.y, 'the drag is horizontal').toBe(panBefore.y);

    // The clamp anchors the arc's rendered-BOX MIDPOINT (an edge box can be
    // longer than the chrome-free region — the invariant's edge semantics).
    const boxPre = expectBoxed(await readBox(page, BRIDGE_ARC.id), BRIDGE_ARC.id);
    const midPreX = boxPre.x + boxPre.w / 2;
    expect(midPreX, 'engineering: the midpoint is still tappable (in-canvas)').toBeLessThan(canvasPre.width);

    await tapEdgeMidpoint(page, BRIDGE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    const canvasAfter = await canvasBox(page);
    const expectedDx = canvasAfter.width - midPreX;
    expect(expectedDx, 'engineering: the midpoint sat in the panel band').toBeLessThan(0);

    expect(await readZoom(page), 'zoom untouched by the rescue').toBe(zoomBefore);
    const panAfter = await readPan(page);
    expect(panAfter.y, 'the rescue is pure-x').toBe(panPanned.y);
    expect(Math.abs(panAfter.x - panPanned.x - expectedDx), 'pan moved by exactly the minimal rescue').toBeLessThanOrEqual(
      EPS,
    );

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

  test('wide, editor parity: the docked property panel and the arc→property swaps never move the viewport (D81)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout preserve rule is the desktop project');
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
    // the docked property panel — the castle node is far from every chrome
    // band, so the clamp's common case (zero motion) must hold.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await settle(page);
    expect(await readZoom(page), 'zoom untouched by the arc→property swap').toBe(zoomBefore);
    const panSwapped = await readPan(page);
    expect(panSwapped.x).toBe(panBefore.x);
    expect(panSwapped.y).toBe(panBefore.y);

    // Property → arc swap back: the edge select closes the property panel
    // and re-opens the arc panel (equal column widths — the swap is
    // layout-neutral or two resizes; both preserve).
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

  test('wide discriminator: a real viewport resize with a panel open still refits (D81 keeps the environmental class)', async ({
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

  test('wide, no-selection close: background tap with the panel open closes it with ZERO motion (D81)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout preserve rule is the desktop project');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // A view-mode background tap clears the selection AND closes the panel —
    // the stage widens with NOTHING selected ⇒ the clamp must not exist as
    // even a pan (no selection ⇒ zero motion).
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

  test('phone: arc select stacks the panel and the refit STILL runs — narrow keeps B-106 (D81, F52/D53)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the narrow-layout refit rule is the phone project');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // Touch alone: the arc select stacks the panel BELOW the stage — the
    // same panel-driven class, but the NARROW layout keeps the refit.
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    const zoomAfter = await readZoom(page);
    expect(zoomAfter, 'narrow + panel-driven still refits (D81 keeps B-106)').not.toBe(zoomBefore);

    // The refit is discriminating: the temple (the content's bottom) is
    // in-box only because fitView re-ran for the shrunken stage.
    const canvasAfter = await canvasBox(page);
    const temple = expectPositioned(await readPosition(page, TEMPLE_ID), TEMPLE_ID);
    expect(temple.x, 'temple x inside the shrunken canvas (refit ran)').toBeGreaterThanOrEqual(0);
    expect(temple.x, 'temple x inside the shrunken canvas (refit ran)').toBeLessThanOrEqual(canvasAfter.width);
    expect(temple.y, 'temple y inside the shrunken canvas (refit ran)').toBeGreaterThanOrEqual(0);
    expect(temple.y, 'temple y inside the shrunken canvas (refit ran)').toBeLessThanOrEqual(canvasAfter.height);
    const panAfter = await readPan(page);
    expect(panAfter.y, 'the refit re-pans (vs the pre-open pan)').not.toBe(panBefore.y);

    // Touch-alone interaction post-refit: a node tap still selects (the
    // B-106 chain: content fitted AND tappable at any stage size).
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(CASTLE_LABEL);

    // D53: the panel cycle never forces horizontal scroll at 390px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at the phone viewport (F52/D53)').toBeLessThanOrEqual(0);

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });
});
