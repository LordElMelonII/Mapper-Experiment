// tests/e2e/verify-p2m4-m4sweep.e2e-spec.ts — P2 M4 gate (verifier, D-P2M4):
// adversarial sweep of the M4 surface — the sheet's breakpoint edges (§5 M4,
// §6.2, Q29), the sheet-state ↔ selection interplay (D-P2M4 ruling 2), the
// cull threshold re-basing on re-fit (B-112/B-113 ruling 1), culling's
// interplay with layer switch / waypoint placement (D-P2M4 rulings), the
// badge's cull-then-recover cycle (B-115: culled it hides with all content;
// zoomed back in the arc-panel tap returns — C3/B-108 + F52), and console
// cleanliness across the new interactions (M1 gate precedent).
//
// Cited IDs:
//   §5 M4    — "ResizeObserver → `cy.resize()`, label culling, `cy.batch`
//              bulk ops; responsive panels (sheets at narrow widths) and
//              tap-target sizing (D53)."
//   §6.2     — "panels survive a live viewport resize and orientation
//              change"; "hover-only affordances are a defect, not a
//              degradation."
//   F52/D53  — one responsive UI, both viewports; touch alone on the phone.
//   Q29      — the sheet is the narrow FORM of the existing route panel; the
//              ≥700px media query OWNS visibility (no floating, no
//              persistence, no maximize).
//   C2/C3    — blocked arcs never hidden; the badge is the cross-layer arc's
//              canvas management surface (B-108) — B-115 (amending the
//              B-113/D-P2M4 ruling 3 exemption the verifier proved false):
//              it culls WITH all map content and returns exactly when it is
//              both readable and tappable. The B-107 gotcha stands: no
//              hide-floor anywhere.
//   D2       — the zoom/RO streams write no signals (chip/selection survive
//              every zoom storm below).
//   D67/D3   — geometry/behavior claims re-derived against the installed
//              cytoscape 3.34.3 hit-test model (findNearestElements:
//              nodeThreshold = (touch ? 8 : 2)/zoom screen px slop; last
//              z-wins for nodes) — see the badge cells' comments.
//
// The B-113 gate shipped one `test.fail()` ratchet for the verifier's major
// finding (the culled badge as a visible-but-dead touch affordance); B-115
// amends the policy (badges cull with all map content) and this suite re-pins
// the fixed behavior — the ratchet is removed with the fix, as its contract
// required.
import { chromium, devices, expect, test, type CDPSession, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeHasClass(id: string, cls: string): boolean;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

const CULL_CLASS = 'tme-cull-labels';
const STATION_ID = 'fuyuki-station';
const PIN_ID = 'emiya-residence';
const CASTLE_ARC = { id: 'arc-outskirts-einzbern-castle', source: 'outskirts', target: 'einzbern-castle' };
const BADGE_ID = 'tme-badge-arc-fuyuki-station-misaki-town';
/** Mirror of the service's LABEL_CULL_FACTOR (B-113 ruling 1: fit-relative). */
const FIT_CULL_FACTOR = 0.6;
/**
 * The badge-recovery zoom for the touch cell (B-115). The verifier derived
 * (D-P2M4 finding, installed 3.34.3 findNearestElements) that the host
 * node's touch hit reach — 22·z + 8 screen px — swallows the badge anchor
 * (≈56.6·z px away) for z ≲ 0.28, and the phone cull threshold
 * (≈0.30 × 0.6 ≈ 0.18) sits BELOW that bound: a badge between the two would
 * be visible but dead, the exact affordance B-115 culls away. The recovery
 * zoom-in therefore targets past the touch bound (with margin), where the
 * badge is readable AND tappable at once.
 */
const BADGE_RECOVERY_ZOOM = 0.32;

const isPhone = (): boolean => test.info().project.name === 'phone';

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

const readZoom = (page: Page): Promise<number> =>
  page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.zoom();
  });

const readPan = (page: Page): Promise<{ x: number; y: number }> =>
  page.evaluate((): { x: number; y: number } => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.pan();
  });

const readNodeHasClass = (page: Page, id: string, cls: string): Promise<boolean> =>
  page.evaluate(([nodeId, className]: [string, string]): boolean => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeHasClass(nodeId, className);
  }, [id, cls]);

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId): { x: number; y: number } | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeRenderedPosition(nodeId);
  }, id);

const canvasBox = async (page: Page) => {
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return box;
};

/** Model point → canvas-relative rendered point (the tap-targets pattern:
 * rendered = pan + model × zoom — test-side math only, R1). */
const modelPoint = async (page: Page, model: { x: number; y: number }): Promise<Point> => {
  await settle(page);
  const pan = await readPan(page);
  const zoom = await readZoom(page);
  return { x: pan.x + model.x * zoom, y: pan.y + model.y * zoom };
};

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const tapPoint = async (page: Page, x: number, y: number): Promise<void> => {
  if (isPhone()) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
};

const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** Tap a canvas node through its rendered position — settle FIRST, then read
 * (panel open/close and rail toggles re-fit asynchronously; positions read
 * before the re-fit are pre-fit coordinates that miss). */
const tapNode = async (page: Page, id: string): Promise<void> => {
  await settle(page);
  const pos = await readPosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await canvasBox(page);
  await tapPoint(page, box.x + pos.x, box.y + pos.y);
};

/** Tap an arc through the rendered midpoint of its endpoints (settle first). */
const tapEdgeMidpoint = async (
  page: Page,
  arc: { id: string; source: string; target: string },
): Promise<void> => {
  await settle(page);
  const source = await readPosition(page, arc.source);
  const target = await readPosition(page, arc.target);
  if (source === null || target === null) throw new Error(`arc ${arc.id} endpoints not rendered`);
  const box = await canvasBox(page);
  await tapPoint(page, box.x + (source.x + target.x) / 2, box.y + (source.y + target.y) / 2);
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Desktop wheel driving (installed runtime: delta clamped to ±5, diff =
// -0.02 × wheelSensitivity → ≈ ×0.955 per event — re-derived at
// cytoscape.esm.mjs:26626-26640, NOT memory).
const WHEEL_STEP = 480;
const MAX_WHEELS = 60;

const zoomOutPast = async (page: Page, threshold: number): Promise<void> => {
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < MAX_WHEELS && (await readZoom(page)) >= threshold; i++) {
    await page.mouse.wheel(0, WHEEL_STEP);
  }
  expect(await readZoom(page), 'the zoom-out driver must cross below the cull threshold').toBeLessThan(threshold);
};

/** Drive zoom back IN (user wheel only) until `zoom() >= threshold`. */
const zoomInPast = async (page: Page, threshold: number): Promise<void> => {
  const box = await canvasBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < MAX_WHEELS && (await readZoom(page)) <= threshold; i++) {
    await page.mouse.wheel(0, -WHEEL_STEP);
  }
  expect(await readZoom(page), 'the zoom-in driver must cross back above the cull threshold').toBeGreaterThanOrEqual(
    threshold,
  );
};

// Phone twin (the phone project is WebKit; CDP pinch needs Chromium — the
// label-culling spec's established pattern) with the SAME iPhone 13 emulation.
const withPhoneChromiumPage = async (run: (page: Page) => Promise<void>): Promise<void> => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readPosition(page, PIN_ID)).not.toBeNull();
    await run(page);
  } finally {
    await browser.close();
  }
};

const cdpPinch = async (cdp: CDPSession, center: Point, from: number, to: number): Promise<void> => {
  const steps = 6;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: center.x - from, y: center.y },
      { x: center.x + from, y: center.y },
    ],
  });
  await sleep(60);
  for (let i = 1; i <= steps; i++) {
    const spread = from + ((to - from) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: center.x - spread, y: center.y },
        { x: center.x + spread, y: center.y },
      ],
    });
    await sleep(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

const zoomOutPastPhone = async (page: Page, threshold: number): Promise<void> => {
  const cdp = await page.context().newCDPSession(page);
  const box = await canvasBox(page);
  const center = { x: box.x + box.width / 2, y: box.y + 150 };
  for (let i = 0; i < 12 && (await readZoom(page)) >= threshold; i++) {
    await cdpPinch(cdp, center, 150, 60);
  }
  expect(await readZoom(page), 'the pinch driver must cross below the cull threshold').toBeLessThan(threshold);
};

/**
 * Pinch-IN driver for the badge recovery (B-115 cell): zoom (user gesture
 * only) until `zoom() >= target`, re-centering EVERY gesture on the badge's
 * current rendered position — the pinch centroid is the zoom anchor, so the
 * badge stays exactly put while the zoom crosses the target and no drift
 * can carry the tap target off-screen. The spread adapts to the badge's
 * distance from the canvas edges (both fingers stay on the canvas, clear of
 * the fixed chrome at the top and the sheet/switcher at the bottom) with a
 * small-step ratio (≈×1.5 per gesture) so convergence stays gentle.
 */
const zoomInPastPhoneOnBadge = async (page: Page, target: number): Promise<void> => {
  const cdp = await page.context().newCDPSession(page);
  const box = await canvasBox(page);
  for (let i = 0; i < 12 && (await readZoom(page)) < target; i++) {
    const pos = await readPosition(page, BADGE_ID);
    if (pos === null) throw new Error('badge not rendered');
    const spread = Math.max(
      24,
      Math.min(60, pos.x - 12, box.width - 12 - pos.x, pos.y - 12, box.height - 120 - pos.y),
    );
    await cdpPinch(cdp, { x: box.x + pos.x, y: box.y + pos.y }, spread, spread * 1.5);
  }
  expect(await readZoom(page), 'the pinch-in driver must cross above the badge-recovery zoom').toBeGreaterThanOrEqual(
    target,
  );
};

const noHorizontalScroll = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('P2 M4 verifier sweep (D-P2M4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readPosition(page, PIN_ID)).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // 1. The cull threshold is RE-BASED by every re-fit (B-113 ruling 1).
  //
  // Mutant discriminators: (a) a stale threshold that is never recomputed
  // keeps the view culled after a refit whose zoom sits BELOW the stale
  // threshold but ABOVE the fresh (fit-relative) one; (b) a lost refit never
  // moves zoom at all. Both keep tme-cull-labels on; the correct code clears
  // it, because the post-refit zoom equals the new fit zoom and
  // zoom < fitZoom × 0.6 can never hold at a fit (the comprehension
  // guarantee). The resized width is chosen so the refit zoom (≈400px stage /
  // ≈1050 model units ≈ 0.31) lands clearly below the stale threshold
  // (≈0.84 × 0.6 ≈ 0.50) — inside the discriminating band.
  // -------------------------------------------------------------------------
  test('a refit re-bases the cull threshold: a culled view un-culls after a viewport shrink (B-113 ruling 1, §6.1)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'desktop wheel drives the zoom; the phone project covers the cull family natively in label-culling.e2e-spec.ts (D53)');

    const fitZoom = await readZoom(page);
    const staleThreshold = fitZoom * FIT_CULL_FACTOR;

    await zoomOutPast(page, staleThreshold);
    expect(await readNodeHasClass(page, STATION_ID, CULL_CLASS)).toBe(true); // culled

    const boxBefore = await canvasBox(page);
    await page.setViewportSize({ width: 720, height: 720 });
    const boxAfter = await canvasBox(page);
    expect(boxAfter.width, 'the canvas shrank with the viewport (the RO path ran)').toBeLessThan(boxBefore.width);

    await settle(page);
    // Anti-vacuous anchor: the post-refit zoom must sit in the band where the
    // stale-threshold mutant differs from the correct code (below stale).
    expect(await readZoom(page), 'the refit moved zoom below the stale threshold').toBeLessThan(staleThreshold);
    // The spec expectation: a fit can never culled — the class clears.
    await expect
      .poll(() => readNodeHasClass(page, STATION_ID, CULL_CLASS), 'the refit re-based the threshold and un-culled')
      .toBe(false);
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence'); // R1 survives
  });

  // -------------------------------------------------------------------------
  // 2. Culling vs layer switch and vs waypoint placement (D-P2M4 edge cases,
  // SPLIT by B-120): the layer switch keeps its refit — EXPLICIT in
  // selectLayer since B-120 (R21 ruling 1), so a fresh layer's default view
  // is never culled. The placement half FLIPS: rebuildElements never fits
  // anymore, so a placement made while culled lands cleanly AND the cull
  // state survives the edit (B-113 ruling 4's stated intent, exactly true
  // since B-120) — zoom and pan untouched (the ruling's own pin).
  // -------------------------------------------------------------------------
  test('layer switch from a CULLED view re-fits to a label-visible default — explicit in selectLayer (§5 M4, B-113 ruling 1, B-120)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'desktop wheel drives the zoom; the rebuild-refit seam is viewport-independent (D53: the cull family runs natively on the phone in label-culling.e2e-spec.ts)');

    await zoomOutPast(page, (await readZoom(page)) * FIT_CULL_FACTOR);
    expect(await readNodeHasClass(page, STATION_ID, CULL_CLASS)).toBe(true);

    // Layer switch: rebuild + EXPLICIT fit → the Misaki default view is not culled.
    await page.getByTestId('tme-layer-layer-misaki').click();
    await expect.poll(() => readPosition(page, 'misaki-town')).not.toBeNull();
    await expect
      .poll(() => readNodeHasClass(page, 'misaki-town', CULL_CLASS), 'fresh layer projection is not culled')
      .toBe(false);

    // Back to Fuyuki: the explicit selectLayer fit re-bases there too.
    await page.getByTestId('tme-layer-layer-fuyuki').click();
    await expect.poll(() => readPosition(page, STATION_ID)).not.toBeNull();
    await expect
      .poll(() => readNodeHasClass(page, STATION_ID, CULL_CLASS), 'the layer-switch refit un-culls (explicit in selectLayer)')
      .toBe(false);
  });

  test('waypoint placement from a CULLED view no longer re-fits — the cull state SURVIVES the edit (§5 M4, F10, B-113 ruling 4, B-120)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'desktop wheel drives the zoom; the rebuild-refit seam is viewport-independent (D53: the cull family runs natively on the phone in label-culling.e2e-spec.ts)');

    await zoomOutPast(page, (await readZoom(page)) * FIT_CULL_FACTOR);
    expect(await readNodeHasClass(page, STATION_ID, CULL_CLASS)).toBe(true);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // D76/B-120: placement runs through editor mode + the Waypoint tool (no
    // selection is written, so no panel opens — the viewport is isolated to
    // the placement rebuild alone).
    await page.getByTestId('tme-editor-toggle').click();
    await page.getByTestId('tme-tool-waypoint').click();
    await expect(page.getByTestId('tme-tool-waypoint')).toHaveAttribute('aria-pressed', 'true');

    // The vetted clear background point (tap-targets' BG_MODEL_POINT: >110
    // model units from every edge segment, >60 from every node/badge/box —
    // a canvas-center tap is NOT clear: the harness curve-demo edge runs
    // through it and an edge tap selects instead of placing).
    const bg = await modelPoint(page, { x: -250, y: 450 });
    const box = await canvasBox(page);
    await tapPoint(page, box.x + bg.x, box.y + bg.y);
    await expect
      .poll(() => readPosition(page, 'wp-1'), 'the culled-view placement projected the waypoint')
      .not.toBeNull();
    // The FLIP (B-120): the placement rebuild does NOT refit — the edit
    // stays culled (rebuildElements re-applies the blanket class from the
    // labelCulled state; only real fits re-base the threshold).
    await expect
      .poll(() => readNodeHasClass(page, 'wp-1', CULL_CLASS), 'an edit while culled stays culled (B-113 ruling 4)')
      .toBe(true);
    expect(await readNodeHasClass(page, STATION_ID, CULL_CLASS), 'the whole view stays culled').toBe(true);
    // R21 ruling 1's own pin, stated on the viewport: zoom and pan untouched.
    expect(await readZoom(page), 'placement while culled: zoom unchanged').toBe(zoomBefore);
    expect(await readPan(page), 'placement while culled: pan unchanged').toEqual(panBefore);
  });

  // -------------------------------------------------------------------------
  // 3. The 700px boundary in BOTH directions with a non-default sheet state
  // (§6.2 "panels survive a live viewport resize", Q29: the media query owns
  // visibility at ≥700px; the component state is phone-world and persists
  // nothing there).
  // -------------------------------------------------------------------------
  test('sheet state crosses the 700px boundary in both directions; wide shows the body whatever the state, narrow restores it (§6.2, Q29)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the phone project crosses the boundary by real rotation in the cell below (D53); desktop drives both sides here');

    // Narrow: expand the sheet while idle (a non-default state).
    await page.setViewportSize({ width: 390, height: 664 });
    await expect(page.getByTestId('tme-sheet-rail')).toBeVisible();
    await page.getByTestId('tme-sheet-rail').click();
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);

    // Wide: the rail disappears and the body shows (media query wins — Q29);
    // the desktop sidebar is the unchanged M2 surface.
    await page.setViewportSize({ width: 900, height: 720 });
    await expect(page.getByTestId('tme-sheet-rail')).toBeHidden();
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    await expect(page.getByTestId('tme-hint')).toHaveText('Tap a node on the map to route there from the pin.');
    expect(await noHorizontalScroll(page)).toBeLessThanOrEqual(0);

    // Narrow again: the phone-world state (expanded) survived the round trip.
    await page.setViewportSize({ width: 390, height: 664 });
    await expect(page.getByTestId('tme-sheet-rail')).toBeVisible();
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();

    // And with a COLLAPSED mid-state: collapse, go wide (body still shows —
    // the media query owns it), come back (collapsed again).
    await page.getByTestId('tme-sheet-rail').click();
    await expect(page.getByTestId('tme-sheet-body')).toBeHidden();
    await page.setViewportSize({ width: 900, height: 720 });
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    await expect(page.getByTestId('tme-sheet-rail')).toBeHidden();
    await page.setViewportSize({ width: 390, height: 664 });
    await expect(page.getByTestId('tme-sheet-body')).toBeHidden();
    await expect(page.getByTestId('tme-sheet-rail')).toBeVisible();
  });

  test('phone: real rotation across the breakpoint (390 portrait ↔ 844 landscape) preserves the sheet and its state (§6.2, D53)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'rotation across 700px is the phone device shape (iPhone 13: 390×664 portrait, 844×390 landscape)');

    // Expand while idle, so a non-default state crosses the boundary.
    await page.getByTestId('tme-sheet-rail').tap();
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();

    // Landscape (844 ≥ 700): the wide row layout — rail gone, body always on.
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByTestId('tme-sheet-rail')).toBeHidden();
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    expect(await noHorizontalScroll(page), 'no horizontal scroll in wide-landscape (F52)').toBeLessThanOrEqual(0);

    // Back to portrait: the expanded state survived the crossing BOTH ways.
    await page.setViewportSize({ width: 390, height: 664 });
    await expect(page.getByTestId('tme-sheet-rail')).toBeVisible();
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();

    // Collapse and rotate again: at ≥700px the body shows regardless (Q29).
    await page.getByTestId('tme-sheet-rail').tap();
    await expect(page.getByTestId('tme-sheet-body')).toBeHidden();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    await expect(page.getByTestId('tme-sheet-rail')).toBeHidden();
  });

  // -------------------------------------------------------------------------
  // 4. Collapsed sheet + EDGE selection (D-P2M4 ruling 2's edge): the edge
  // tap must open the arc panel AND auto-expand the sheet (a map tap means
  // the user wants the panel — the M2 zero-extra-taps shape).
  // -------------------------------------------------------------------------
  test('phone: an edge tap from a COLLAPSED sheet opens the arc panel and auto-expands the sheet (ruling 2)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the collapsed sheet is the narrow form (§5 M4/D53); the desktop rail does not exist');

    await tapNode(page, STATION_ID); // auto-expands
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    await page.getByTestId('tme-sheet-rail').tap(); // collapse mid-selection
    await expect(page.getByTestId('tme-sheet-body')).toBeHidden();

    // The stage re-fit moved content — tapEdgeMidpoint settles FIRST, then
    // reads positions (the pre-fit coordinates from before the collapse miss).
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible(); // auto-expanded (source: arc id)
    await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'true');
  });

  // -------------------------------------------------------------------------
  // 5. Re-tap the ALREADY-SELECTED node while the sheet is collapsed — the
  // narrowest ruling-2 edge ("a map tap means the user wants the panel").
  // The linkedSignal resets on EVERY source-dependency change (the selection
  // signal fires with a fresh object even for the same id), so the re-tap
  // re-expands. Pinned because the probe surface (stale DOM reads around the
  // collapse refit) makes this easy to misjudge, and nothing else pins it.
  // The chip label assertion keeps the aim honest: the re-tap must still
  // hold the SAME node.
  // -------------------------------------------------------------------------
  test('phone: re-tapping the selected node while the sheet is collapsed re-expands it (ruling 2)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the collapsed sheet is the narrow form (§5 M4/D53)');

    await tapNode(page, STATION_ID);
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    await page.getByTestId('tme-sheet-rail').tap();
    await expect(page.getByTestId('tme-sheet-body')).toBeHidden();

    await tapNode(page, STATION_ID); // the SAME node — the selection signal fires afresh
    await expect(page.getByTestId('tme-selection-label')).toHaveText('Fuyuki Station'); // aim honesty
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible(); // re-expanded (ruling 2)
  });

  // -------------------------------------------------------------------------
  // 6. Culled-view badge under the B-115 amended policy (C3/B-108: the badge
  // is the cross-layer arc's ONLY canvas surface — reachable exactly when
  // readable). Desktop pointer: while CULLED the badge hides with all map
  // content (it carries the same blanket class; the resolved text-opacity
  // cascade is runtime-proven in tests/verify/p2m4-stylesheet-cascade.spec.ts
  // — the structural assertion keeps the R2/R4 no-read-seam discipline);
  // zoomed back in past the threshold it is visible again and the tap opens
  // the ARC panel. Pointer zoom has no eclipse band above the cull threshold
  // (the verifier's desktop anchor-eclipse window sits below z ≈ 0.12 —
  // unreachable in practice and unpromised, B-115 ruling 5).
  // -------------------------------------------------------------------------
  test('desktop: the culled badge hides with all content; zooming back in restores it and the arc-panel tap (B-115, C3/B-108)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the phone touch variant is the cell below (D53)');

    const threshold = (await readZoom(page)) * FIT_CULL_FACTOR;
    await zoomOutPast(page, threshold);
    await settle(page);
    expect(await readNodeHasClass(page, STATION_ID, CULL_CLASS)).toBe(true); // culled view
    // B-115: the badge carries the SAME blanket class — hidden by the same
    // stylesheet rule as all map content. No visible dead affordance in the
    // culled overview.
    expect(await readNodeHasClass(page, BADGE_ID, CULL_CLASS)).toBe(true);

    await zoomInPast(page, threshold);
    await settle(page);
    // Zoomed back in: the badge is visible again (class cleared — same
    // blanket toggle as every node).
    expect(await readNodeHasClass(page, BADGE_ID, CULL_CLASS)).toBe(false);
    expect(await readNodeHasClass(page, STATION_ID, CULL_CLASS)).toBe(false);

    // The C3/B-108 management surface is reachable exactly when readable:
    // the badge tap opens the ARC panel (not the host node's chip).
    await tapNode(page, BADGE_ID);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-arc-endpoints')).toHaveText('Fuyuki Station ↔ Misaki Town');
  });

  // -------------------------------------------------------------------------
  // 7. The same recovery on TOUCH (B-115; this cell was the D-P2M4 major
  // finding's test.fail() ratchet — the fix landed, the ratchet retires).
  // The verifier's derivation (installed 3.34.3 findNearestElements): the
  // host node's touch hit reach is 22·z + 8 px while the badge anchor sits
  // ≈56.6·z px away, so touch swallows badge taps for z ≲ 0.28 — and the
  // phone cull threshold (≈0.30 × 0.6 ≈ 0.18) sits BELOW that bound, which
  // is exactly why the culled badge must HIDE (a visible badge there was
  // dead). The recovery therefore zooms in past the touch bound
  // (BADGE_RECOVERY_ZOOM), not merely past the cull threshold: past it the
  // badge is readable AND tappable at once, and the tap opens the ARC panel
  // (the finding's demanded recovery path, now pinned).
  // -------------------------------------------------------------------------
  test('phone: the culled badge hides with all content; zooming back in restores it and the arc-panel tap (B-115, C3/B-108, F52)', async () => {
    test.skip(!isPhone(), 'the in-test Chromium twin reproduces the iPhone-13 device identically from either project; the desktop-pointer variant is the cell above');
    await withPhoneChromiumPage(async (p) => {
      const threshold = (await readZoom(p)) * FIT_CULL_FACTOR;
      await zoomOutPastPhone(p, threshold);
      await settle(p);
      expect(await readNodeHasClass(p, STATION_ID, CULL_CLASS)).toBe(true); // culled view
      // B-115: the badge carries the SAME blanket class — hidden by the same
      // stylesheet rule as all map content (structural assertion, R2/R4
      // no-read-seam discipline).
      expect(await readNodeHasClass(p, BADGE_ID, CULL_CLASS)).toBe(true);

      await zoomInPastPhoneOnBadge(p, BADGE_RECOVERY_ZOOM);
      await settle(p);
      // Zoomed back in past the touch bound: the badge is visible again
      // (class cleared) AND its tap reaches the arc.
      expect(await readNodeHasClass(p, BADGE_ID, CULL_CLASS)).toBe(false);
      expect(await readNodeHasClass(p, STATION_ID, CULL_CLASS)).toBe(false);

      // The recovery path the finding demanded: the badge tap opens the ARC
      // panel (B-108) — not the host node's chip.
      await tapNode(p, BADGE_ID);
      await expect(p.getByTestId('tme-arc-panel')).toBeVisible();
      await expect(p.getByTestId('tme-arc-endpoints')).toHaveText('Fuyuki Station ↔ Misaki Town');
    });
  });

  // -------------------------------------------------------------------------
  // 8. Console cleanliness across the NEW M4 interactions (M1 gate
  // precedent): zoom storm (cull toggles), sheet toggles, selection flows,
  // layer switch — no errors/warnings/pageerrors on either project/browser.
  // -------------------------------------------------------------------------
  test('console stays clean across M4 interactions: zoom culling, sheet toggles, selections (M1 precedent)', async ({
    page,
  }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    // The zoom storm runs on DESKTOP only (mobile WebKit has no mouse.wheel
    // and no CDP pinch on the native page — the phone's zoom-stream console
    // silence is covered by the Chromium-twin cells of label-culling and of
    // this spec, where any pageerror fails the run outright). Phone sweeps
    // the DOM-side M4 interactions natively instead: selections, sheet
    // toggles, layer switches.
    if (!isPhone()) {
      const threshold = (await readZoom(page)) * FIT_CULL_FACTOR;
      await zoomOutPast(page, threshold);
      await tapNode(page, STATION_ID); // selection while culled
      await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    } else {
      await tapNode(page, STATION_ID); // selection — the sheet AUTO-EXPANDS
      await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
      await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
      await page.getByTestId('tme-sheet-rail').tap(); // collapse
      await expect(page.getByTestId('tme-sheet-body')).toBeHidden();
      await page.getByTestId('tme-sheet-rail').tap(); // expand again
      await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    }

    // Layer switch while culled (rebuild + refit inside the zoom storm).
    await page.getByTestId('tme-layer-layer-misaki').click();
    await expect.poll(() => readPosition(page, 'misaki-town')).not.toBeNull();
    await page.getByTestId('tme-layer-layer-fuyuki').click();
    await expect.poll(() => readPosition(page, STATION_ID)).not.toBeNull();

    expect(bad, 'no console errors/warnings/pageerrors during the M4 sweep').toEqual([]);
  });
});
