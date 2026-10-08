// tests/e2e/editor-rail.e2e-spec.ts — PKG B-127 (§5 Phase 3 M3, D86/F53):
// the editor RAIL — the app's single control surface. Wide layout: a LEFT
// COLUMN before the stage; narrow: a BOTTOM BAR after the panel stack (the
// 700px breakpoint, the D81 mirror constant). Every migrated control
// (editor toggle, tools, layer nav + Manage, save dock — testids verbatim)
// is visible ON the rail and the old stage-internal placements render
// NOTHING (D86: nothing remains in duplicate, asserted by geometry). The
// rail's collapse is a panel-driven resize (D81: preserve on wide, refit on
// narrow); the zoom trio drives the new service seams (×1.25 about the
// viewport center, Fit = the public user fit); the clamp's measured chrome
// set is the RAIL rect + the chip.
//
// Cited IDs:
//   D86/F53  — the responsive control rail under test: one surface, both
//              orientations, absorbing the scattered chrome; ≥44px targets,
//              touch-alone (the phone cells tap, never hover).
//   D81      — the resize classes a rail collapse/expand rides: wide +
//              panel-driven PRESERVES (zoom/pan byte-equal, the rescue
//              clamp clear of the measured rail rect); narrow keeps the
//              B-106 refit. The chrome-set rework: '.tme-rail' + '.tme-chip'.
//   B-120    — the zoom trio commits no fit of its own; Fit is a USER
//              command (D10) through the ONE fit site.
//   B-113    — cull coherence rides the zoom events the trio emits (not
//              re-asserted here; label-culling.e2e-spec.ts owns it).
//   F45/D75  — the save dock renders exactly while unsavedChanges() and
//              survives on the rail (cell 1 places one node to light it).
//   B-122    — the Arc tool's pick/refusal path still renders from the rail
//              (cell 4: pick, mid-pick layer switch, the C3 fence banner).
//   B-126    — the rail's Manage entry opens the layer-manager sheet.
//   R1       — the header strings are core snapshots, verbatim, around
//              every resize-class transition.
//   D2/R2    — the zoom seams write no signals; the e2e hook stays
//              read-only (the __TME_E2E__ discipline).
//
// Housekeeping (the packet's item 6) lives inside the cells: every cell
// asserts a clean console and the R1 headers around its transitions, and
// cell 1 pins ≥44px on every rail control (the standing tap-targets sweep
// enumerates the rail's buttons by query automatically — F52).
//
// Aiming discipline: canvas content is read/aimed through the DEV-HARNESS-
// ONLY window.__TME_E2E__ hook (see src/app/app.ts) — reads only, no
// closures across the evaluate wire; chrome boxes come from Playwright
// boundingBox()/locator taps on the components' own testids; every
// post-resize read waits the two-rAF settle (the arc-panel precedent).
// Expected zoom steps and rescue deltas are computed from those live reads
// (test-side math — the UI computes nothing, R1), sub-pixel-tolerant.
import { expect, test, type Locator, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
  drawArcSourceId(): string | null;
  /** B-122/B-128: the draw-arc banner's current message, or null. */
  drawArcFeedback(): string | null;
  selectedNodeId(): string | null;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** FX1 facts (data/worlds/fuyuki.ts) the cells engineer against. */
const CASTLE_ID = 'einzbern-castle';
const CASTLE_LABEL = 'Einzbern Castle';
const TEMPLE_ID = 'ryuudou-temple'; // FX1's BOTTOM content — the refit discriminator
const GHOST_HOUSE_ID = 'ghost-house'; // FX1's RIGHTMOST content (x 625)
const MISAKI_ID = 'misaki-town'; // the Misaki layer's single hub
const EMIYA_ID = 'emiya-residence';
const NEW_PLACE = 'New place'; // C23 default label, verbatim
const FUYUKI_BUTTON = 'tme-layer-layer-fuyuki';
const MISAKI_BUTTON = 'tme-layer-layer-misaki';

/**
 * The B-109/B-116-vetted clear background point in MODEL coordinates (see
 * waypoints.e2e-spec.ts's header for the scan discipline) — converted
 * test-side through the zoom/pan seams; clear of the rail too, which is a
 * SIBLING of the stage, never an overlay (D86).
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };

/** D86/B-127: the clamp's measured chrome set (map-viewer INTERACTIVE_CHROME). */
const CHROME_SELECTORS = ['.tme-rail', '.tme-chip'];

const R1_HEADERS: ReadonlyArray<[string, string]> = [
  ['tme-location', 'Emiya Residence'],
  ['tme-snapshot-layer', 'Fuyuki City'],
  ['tme-unit', 'min'],
];

const isPhone = (): boolean => test.info().project.name === 'phone';

/**
 * PKG B-142 (REPAIRS R-2) re-baseline: the phone boot now stages AT the pin
 * (the boot-posture zoom, the pin-centered viewport). This spec's aims are
 * exhaustively scanned against the PRE-PACKET WORLD-FIT boot viewport
 * (zoom = 0.282... on FX1 — the hit-corridor arithmetic above), so the phone
 * cells restore exactly that viewport first by tapping the rail's Fit — the
 * packet's own "explicit full-world ask". Desktop never arms the posture
 * (the wide gate mirrors D81's 700px breakpoint), so its boot is
 * byte-unchanged and this is a no-op. Aim math and every assertion are
 * untouched — the R23 in-box-content law stands throughout.
 */
const restoreBootViewport = async (page: Page): Promise<void> => {
  if (isPhone()) await page.getByTestId('tme-zoom-fit').tap();
};

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

const readZoom = (page: Page): Promise<number> =>
  page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.zoom();
  });

const readPan = (page: Page): Promise<{ x: number; y: number }> =>
  page.evaluate(() => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.pan();
  });

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId) => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeRenderedPosition(nodeId);
  }, id);

const readBox = (page: Page, id: string): Promise<Box | null> =>
  page.evaluate((nodeId) => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeRenderedBoundingBox(nodeId);
  }, id);

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeLabels();
  });

const readDrawSourceId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.drawArcSourceId();
  });

const readDrawFeedback = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.drawArcFeedback();
  });

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

const railBox = async (page: Page): Promise<Box> => {
  const box = await page.getByTestId('tme-rail').boundingBox();
  if (box === null) throw new Error('rail host not visible');
  return { x: box.x, y: box.y, w: box.width, h: box.height };
};

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const tapPoint = async (page: Page, x: number, y: number): Promise<void> => {
  if (isPhone()) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
};

/** F52/D53: tap on the touch-emulated project, click on desktop (locators). */
const activate = async (locator: Locator): Promise<void> => {
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/**
 * Wait two animation frames: a rail collapse/expand changes the stage size
 * synchronously, but the ResizeObserver-driven path (D81 preserve/rescue on
 * wide, the B-106 refit on narrow) runs just before the next paint — reading
 * inside that window yields pre-resize coordinates. Two rAFs put every read
 * AFTER it (deterministic, no arbitrary timeout).
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

/** Tap a MODEL point: convert via the seam (test-side math only — R1). */
const tapModelPoint = async (page: Page, model: { x: number; y: number }): Promise<void> => {
  await settle(page);
  const screen = await page.evaluate((m): Promise<Point> | Point => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    const box = document.querySelector('[data-testid="tme-canvas"]')?.getBoundingClientRect();
    if (box === null || box === undefined) throw new Error('canvas host not visible');
    return { x: box.x + hook.pan().x + m.x * hook.zoom(), y: box.y + hook.pan().y + m.y * hook.zoom() };
  }, model);
  await tapPoint(page, screen.x, screen.y);
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

/** One control's box, or a throw — every swept control must be on the touch surface. */
const controlBox = async (page: Page, testId: string): Promise<Box> => {
  const box = await page.getByTestId(testId).boundingBox();
  if (box === null) throw new Error(`${testId} not visible`);
  return { x: box.x, y: box.y, w: box.width, h: box.height };
};

/** Containment (1px slack) of one control's box inside the rail region. */
const expectInsideRail = (box: Box, rail: Box, testId: string): void => {
  expect(box.x, `${testId} inside the rail (left)`).toBeGreaterThanOrEqual(rail.x - 1);
  expect(box.x + box.w, `${testId} inside the rail (right)`).toBeLessThanOrEqual(rail.x + rail.w + 1);
  expect(box.y, `${testId} inside the rail (top)`).toBeGreaterThanOrEqual(rail.y - 1);
  expect(box.y + box.h, `${testId} inside the rail (bottom)`).toBeLessThanOrEqual(rail.y + rail.h + 1);
};

/** F52: one control is a >= 44x44 tap target. */
const expectTapTarget = (box: Box, testId: string): void => {
  expect(box.w, `${testId} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
  expect(box.h, `${testId} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
};

/**
 * D81/B-127: the interactive-chrome rects as the CLAMP sees them —
 * Playwright boundingBoxes translated into the canvas coordinate space (the
 * same consumer-math map-viewer.component does for the service).
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

test.describe('the editor rail: one responsive control surface (PKG B-127, D86/F53)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readPosition(page, EMIYA_ID)).not.toBeNull();
  });

  test('orientation + absorption: every migrated control is ON the rail, the old placements are empty (D86, F52/D53, R1)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);

    const rail = await railBox(page);
    const canvas = await canvasBox(page);
    if (isPhone()) {
      // D86: narrow ⇒ the BOTTOM BAR after the panel stack, spanning the width.
      expect(rail.y, 'phone: the rail is below the canvas (bottom bar)').toBeGreaterThanOrEqual(
        canvas.y + canvas.height - 1,
      );
      expect(rail.x, 'phone: the rail spans the width').toBeLessThanOrEqual(canvas.x + 1);
    } else {
      // D86: wide ⇒ the LEFT COLUMN before the stage.
      expect(rail.x + rail.w, 'desktop: the rail is the left column').toBeLessThanOrEqual(canvas.x + 1);
      expect(rail.y, 'desktop: the rail spans the stage height').toBeGreaterThanOrEqual(canvas.y - 1);
    }

    // The boot controls: mode toggle, the layer switcher + Manage, the zoom
    // trio, the collapse toggle — all ON the rail, all >= 44px (F52).
    const bootControls = [
      'tme-editor-toggle',
      FUYUKI_BUTTON,
      MISAKI_BUTTON,
      'tme-layer-manage',
      'tme-zoom-in',
      'tme-zoom-out',
      'tme-zoom-fit',
      'tme-rail-toggle',
    ];
    for (const testId of bootControls) {
      const box = await controlBox(page, testId);
      expectInsideRail(box, await railBox(page), testId);
      expectTapTarget(box, testId);
      // D86's nothing-in-duplicate, per control: it lives on the rail region,
      // NEVER over the canvas (the old placements were stage overlays).
      const overlapsCanvas = box.x < canvas.x + canvas.width && box.x + box.w > canvas.x &&
        box.y < canvas.y + canvas.height && box.y + box.h > canvas.y;
      expect(overlapsCanvas, `${testId} never renders over the canvas (old placement empty)`).toBe(false);
    }

    // The old stage-internal placements render NOTHING (D86) — the classes
    // exist only inside the rail.
    for (const selector of ['.tme-editor-toggle', '.tme-tools', '.tme-layers', '.tme-save-dock']) {
      const count = await page.locator(`.tme-stage ${selector}`).count();
      expect(count, `.tme-stage ${selector} renders nothing (D86 absorption)`).toBe(0);
    }

    // The editor-only section and the conditional save dock, on the rail:
    // enter editor mode, place one node (the dock lights, F45/D75).
    await activate(page.getByTestId('tme-editor-toggle'));
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
    const railExpanded = await railBox(page);
    for (const testId of ['tme-editor-tools', 'tme-tool-node', 'tme-tool-waypoint', 'tme-tool-arc']) {
      const box = await controlBox(page, testId);
      expectInsideRail(box, railExpanded, testId);
      expectTapTarget(box, testId);
    }
    await activate(page.getByTestId('tme-tool-node'));
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect
      .poll(async () => (await readLabels(page)).filter((label) => label === NEW_PLACE))
      .toHaveLength(1);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect(page.getByTestId('tme-unsaved')).toHaveText('Unsaved changes');
    // B-133 review (D91) re-derivation: the dock LEFT the rail — as a rail
    // flow child its dirty/clean flip resized the narrow band on every commit
    // (the stage yielded, the RO fired, the viewport moved — B-124's pin).
    // It is stage chrome now: an app-bar pill inside the header band (the
    // chip's sibling, commit-neutral by construction). Absorption inverted:
    // the header renders it, the rail renders none; the Save target stays
    // >= 44px (F52).
    const headerDock = await page.locator('.tme-header .tme-save-dock').count();
    expect(headerDock, 'the save dock renders in the header band (D91 commit-neutral home)').toBe(1);
    for (const testId of ['tme-save-dock', 'tme-save']) {
      expectTapTarget(await controlBox(page, testId), testId);
    }
    const railDock = await page.locator('tme-editor-rail .tme-save-dock').count();
    expect(railDock, 'the rail renders no save dock (D91: the dock left the rail)').toBe(0);

    // D53: the rail never widens the page.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll (F52/D53)').toBeLessThanOrEqual(0);

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('rail collapse is a panel-driven resize: wide preserves byte-equal, phone refits (D86/D81, R1)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    const toggle = page.getByTestId('tme-rail-toggle');

    // A selection is live through the whole cycle (the clamp's precondition).
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(CASTLE_LABEL);
    await settle(page); // the route sheet's open refit settles (phone) before the pin

    const railBefore = await railBox(page);
    const canvasBefore = await canvasBox(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // Collapse: the region shrinks to the slim strip (only the expand
    // affordance), the stage grows.
    await activate(toggle);
    await expect(toggle).toHaveText('Show');
    await settle(page);
    const railCollapsed = await railBox(page);
    const canvasCollapsed = await canvasBox(page);
    expect(railCollapsed.w * railCollapsed.h, 'the collapsed rail is the slim strip').toBeLessThan(
      railBefore.w * railBefore.h,
    );
    expect(
      canvasCollapsed.width * canvasCollapsed.height,
      'the stage grew with the collapsed rail',
    ).toBeGreaterThan(canvasBefore.width * canvasBefore.height);
    // The strip is still measured chrome (D86) — the clamp's set holds the
    // rail rect in both forms.
    const chromeCollapsed = await chromeBoxes(page);
    expect(chromeCollapsed.length, 'the collapsed strip is still a measured chrome rect').toBeGreaterThanOrEqual(1);

    if (isPhone()) {
      // D81: narrow + panel-driven ⇒ the B-106 refit — the taller stage
      // re-FITS: the content re-centers (pan.y moves) and the discriminating
      // bottom content (the temple) is in-box for the new stage.
      const panCollapsed = await readPan(page);
      expect(panCollapsed.y, 'phone collapse refits (the fit re-centered vertically)').not.toBe(panBefore.y);
      const templeCollapsed = expectPositioned(await readPosition(page, TEMPLE_ID), TEMPLE_ID);
      expect(templeCollapsed.y, 'temple in-box after the collapse refit').toBeGreaterThanOrEqual(0);
      expect(templeCollapsed.y, 'temple in-box after the collapse refit').toBeLessThanOrEqual(
        canvasCollapsed.height,
      );

      // Expand back: the bar returns, the stage shrinks, the refit runs AGAIN
      // (the fit re-centers for the shorter stage — a preserve creep would
      // leave the collapsed-cycle pan standing and fail the inequality).
      await activate(toggle);
      await expect(toggle).toHaveText('Hide');
      await settle(page);
      const canvasReexpanded = await canvasBox(page);
      expect(
        canvasReexpanded.width * canvasReexpanded.height,
        'the stage shrank back with the expanded rail',
      ).toBeLessThan(canvasCollapsed.width * canvasCollapsed.height);
      const panExpanded = await readPan(page);
      expect(panExpanded.y, 'phone expand refits again (re-centered, not preserved)').not.toBe(panCollapsed.y);
      const templeExpanded = expectPositioned(await readPosition(page, TEMPLE_ID), TEMPLE_ID);
      expect(templeExpanded.y, 'temple in-box after the expand refit').toBeGreaterThanOrEqual(0);
      expect(templeExpanded.y, 'temple in-box after the expand refit').toBeLessThanOrEqual(canvasReexpanded.height);
    } else {
      // D81: wide + panel-driven ⇒ PRESERVE — zoom and pan byte-equal through
      // BOTH transitions (the castle sits mid-canvas at the fit, clear of the
      // shrinking/growing bands, so the clamp's common case: zero motion).
      expect(await readZoom(page), 'desktop collapse preserves zoom byte-equal').toBe(zoomBefore);
      const panCollapsed = await readPan(page);
      expect(panCollapsed.x, 'desktop collapse preserves pan.x byte-equal').toBe(panBefore.x);
      expect(panCollapsed.y, 'desktop collapse preserves pan.y byte-equal').toBe(panBefore.y);

      await activate(toggle);
      await expect(toggle).toHaveText('Hide');
      await settle(page);
      expect(await readZoom(page), 'desktop expand preserves zoom byte-equal').toBe(zoomBefore);
      const panExpanded = await readPan(page);
      expect(panExpanded.x, 'desktop expand preserves pan.x byte-equal').toBe(panBefore.x);
      expect(panExpanded.y, 'desktop expand preserves pan.y byte-equal').toBe(panBefore.y);
    }

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('the zoom trio: + and − step ×1.25 about the viewport center; Fit re-fits through the one fit site (D86/B-120, R1)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);

    // The boot fit is the return point (the canvas never resizes in this
    // cell, so the deterministic fit reproduces it byte-exactly).
    const fit = await page.evaluate((): { zoom: number; pan: { x: number; y: number }; w: number; h: number } => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      const canvas = document.querySelector('[data-testid="tme-canvas"]')!.getBoundingClientRect();
      return { zoom: hook.zoom(), pan: hook.pan(), w: canvas.width, h: canvas.height };
    });

    // + : exactly one ×1.25 step, computed in-page off the live read (the
    // app performs the same IEEE multiply — no engine drift is possible).
    await activate(page.getByTestId('tme-zoom-in'));
    await settle(page);
    const afterIn = await page.evaluate((): { zoom: number; pan: { x: number; y: number }; center: { x: number; y: number } } => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      const pan = hook.pan();
      const zoom = hook.zoom();
      const canvas = document.querySelector('[data-testid="tme-canvas"]')!.getBoundingClientRect();
      // The model point pinned at the viewport CENTER (the step's anchor).
      return {
        zoom,
        pan,
        center: { x: (canvas.width / 2 - pan.x) / zoom, y: (canvas.height / 2 - pan.y) / zoom },
      };
    });
    expect(afterIn.zoom, 'zoom-in steps exactly ×1.25 (B-127)').toBeCloseTo(fit.zoom * 1.25, 12);
    // The center-anchoring: the model point under the viewport center before
    // the step is still under it after (renderedPosition semantics).
    const centerBefore = {
      x: (fit.w / 2 - fit.pan.x) / fit.zoom,
      y: (fit.h / 2 - fit.pan.y) / fit.zoom,
    };
    expect(afterIn.center.x, 'the viewport center holds its model point (x)').toBeCloseTo(centerBefore.x, 6);
    expect(afterIn.center.y, 'the viewport center holds its model point (y)').toBeCloseTo(centerBefore.y, 6);

    // − : the exact reciprocal, back at the fit zoom.
    await activate(page.getByTestId('tme-zoom-out'));
    await settle(page);
    const afterOut = await readZoom(page);
    expect(afterOut, 'zoom-out steps exactly ÷1.25').toBeCloseTo(afterIn.zoom / 1.25, 12);

    // Zoom in again so the view is NOT at the fit, then Fit: the USER command
    // re-fits through the one fit site (B-120/D10) — byte-back to the boot
    // viewport (same canvas size, deterministic fit) and the discriminating
    // bottom content (the temple) is in-box.
    await activate(page.getByTestId('tme-zoom-in'));
    await settle(page);
    const zoomed = await readZoom(page);
    expect(zoomed, 'engineering: the view is zoomed past the fit').not.toBe(fit.zoom);
    await activate(page.getByTestId('tme-zoom-fit'));
    await settle(page);
    expect(await readZoom(page), 'Fit returns to the fit zoom (the one fit site)').toBe(fit.zoom);
    const panFit = await readPan(page);
    expect(panFit.x, 'Fit re-pans to the fit pan (deterministic)').toBe(fit.pan.x);
    expect(panFit.y, 'Fit re-pans to the fit pan (deterministic)').toBe(fit.pan.y);
    const canvas = await canvasBox(page);
    const temple = expectPositioned(await readPosition(page, TEMPLE_ID), TEMPLE_ID);
    expect(temple.x, 'temple x in-box after Fit').toBeGreaterThanOrEqual(0);
    expect(temple.x, 'temple x in-box after Fit').toBeLessThanOrEqual(canvas.width);
    expect(temple.y, 'temple y in-box after Fit (the fit ran)').toBeGreaterThanOrEqual(0);
    expect(temple.y, 'temple y in-box after Fit (the fit ran)').toBeLessThanOrEqual(canvas.height);

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping — the seams write no signals, D2)').toEqual([]);
  });

  test('mode + tools from the rail, touch-alone: place, pick, the C3 refusal banner, and Manage opens the sheet (D86/F53, D76, B-122, B-126, F45)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);

    // Editor mode from the rail — the tool group renders ON the rail.
    await activate(page.getByTestId('tme-editor-toggle'));
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
    const rail = await railBox(page);
    expectInsideRail(await controlBox(page, 'tme-editor-tools'), rail, 'tme-editor-tools');

    // The Node tool places through a canvas tap; the save dock lights (F45).
    await activate(page.getByTestId('tme-tool-node'));
    await expect(page.getByTestId('tme-tool-node')).toHaveAttribute('aria-pressed', 'true');
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect
      .poll(async () => (await readLabels(page)).filter((label) => label === NEW_PLACE))
      .toHaveLength(1);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    // The Arc tool: tap-tap picks and commits; the kept-pick banner — a
    // mid-pick layer switch KEEPS the pick and the banner NARRATES it (the
    // F17 un-fence, D85/B-128 — the B-122 refusal is retired); the tap on
    // the new layer commits cross-layer and the banner clears.
    await activate(page.getByTestId('tme-tool-arc'));
    await expect(page.getByTestId('tme-tool-arc')).toHaveAttribute('aria-pressed', 'true');
    // B-133 (D91) review fix: the placement above gave the route sheet
    // content (the auto-expand) and its selection holds the property panel
    // open — on the full-width overlay stage either can cover the castle's
    // tap point. Clear both first (phone; the wide sidebar has no sheet
    // regime). Setup, not assertion.
    if (isPhone()) {
      const chip = page.getByTestId('tme-selection-chip');
      if ((await chip.count()) > 0 && (await chip.isVisible())) {
        await chip.click();
        await expect(chip).toBeHidden();
      }
      if ((await page.getByTestId('tme-sheet-rail').getAttribute('aria-expanded')) === 'true') {
        await page.getByTestId('tme-sheet-rail').click();
        await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'false');
        await page.waitForTimeout(200); // the collapse re-renders — a tap in the same tick can still hit the body
      }
    }
    await tapNode(page, CASTLE_ID);
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(CASTLE_ID);
    await activate(page.getByTestId(MISAKI_BUTTON));
    await expect.poll(readLabels.bind(null, page)).toEqual(['Misaki Town']);
    await expect(page.getByTestId('tme-draw-feedback')).toBeVisible(); // the kept-pick narration
    await expect
      .poll(readDrawFeedback.bind(null, page))
      .toBe('Drawing from Einzbern Castle — tap where its arc lands');
    await tapNode(page, MISAKI_ID); // the kept pick commits cross-layer (D85)
    await expect(page.getByTestId('tme-draw-feedback')).toBeHidden();
    await expect.poll(readDrawSourceId.bind(null, page)).toBeNull();

    // The rail's Manage entry opens B-126's sheet (the bottom bar form on
    // the phone), and its close returns it.
    await activate(page.getByTestId('tme-layer-manage'));
    await expect(page.getByTestId('tme-layer-manager')).toBeVisible();
    await activate(page.getByTestId('tme-layer-manager-close'));
    await expect(page.getByTestId('tme-layer-manager')).toBeHidden();

    await expectHeaders(page); // view-layer switches never rewrite core strings (R1)
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('wide clamp, rail expand: a selection in the reclaimed band is rescued pan-only, zoom byte-put, clear of the measured rail rect (D86/D81)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout preserve rule is the desktop project (SCSS 700px breakpoint)');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);

    // Select FX1's rightmost leaf (view mode — the chip, no editor panels).
    await tapNode(page, GHOST_HOUSE_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await settle(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // Collapse the rail first: the wide column shrinks to the strip and the
    // stage grows — the preserve path's zero-motion case (nothing can leave
    // a GROWING canvas).
    await activate(page.getByTestId('tme-rail-toggle'));
    await settle(page);
    expect(await readZoom(page), 'collapse (stage grows): zoom byte-equal').toBe(zoomBefore);
    const panCollapsed = await readPan(page);
    expect(panCollapsed.x, 'collapse (stage grows): pan.x byte-equal').toBe(panBefore.x);
    expect(panCollapsed.y, 'collapse (stage grows): pan.y byte-equal').toBe(panBefore.y);
    const canvasCollapsed = await canvasBox(page);

    // Engineer the selection into the band the EXPANDED rail will reclaim:
    // a view-mode background drag (the empty bottom band — below the fitted
    // content, clear of every element: a down on a node body is captured by
    // the node, not the pan; a drag is not a tap, so the selection stands)
    // pans the ghost-house's right edge to ~canvasWidth − 24 — inside the
    // collapsed canvas, past the post-expand right edge (the B-125 pattern).
    const boxPre = expectBoxed(await readBox(page, GHOST_HOUSE_ID), GHOST_HOUSE_ID);
    const dragDx = canvasCollapsed.width - 24 - (boxPre.x + boxPre.w);
    if (dragDx > 5) {
      const dragY = canvasCollapsed.y + canvasCollapsed.height - 70;
      const startX = canvasCollapsed.x + canvasCollapsed.width / 2;
      await page.mouse.move(startX, dragY);
      await page.mouse.down();
      await page.mouse.move(startX + dragDx, dragY, { steps: 6 });
      await page.mouse.up();
      await settle(page);
    }
    const boxPanned = expectBoxed(await readBox(page, GHOST_HOUSE_ID), GHOST_HOUSE_ID);
    expect(
      boxPanned.x + boxPanned.w,
      'engineering: the selection sits past the post-expand band',
    ).toBeGreaterThan(canvasCollapsed.width - 100);
    const panPanned = await readPan(page);

    // Expand the rail: the stage narrows from the left ⇒ the preserved
    // viewport leaves the selection past the right edge ⇒ the clamp rescues
    // it — ONE minimal pure-x pan, zoom byte-put (the canvas containment
    // arm; the rail rect is the measured chrome set, vacuous for overlap as
    // a SIBLING region, still measured — D86).
    await activate(page.getByTestId('tme-rail-toggle'));
    await settle(page);
    const canvasAfter = await canvasBox(page);
    expect(canvasAfter.width, 'the stage narrowed with the expanded rail').toBeLessThan(canvasCollapsed.width);
    const expectedDx = canvasAfter.width - (boxPanned.x + boxPanned.w);
    expect(expectedDx, 'engineering: a rescue was needed').toBeLessThan(0);
    expect(await readZoom(page), 'zoom untouched by the rescue (D81)').toBe(zoomBefore);
    const panAfter = await readPan(page);
    expect(panAfter.y, 'the rescue is pure-x (no vertical motion)').toBe(panPanned.y);
    expect(
      Math.abs(panAfter.x - panPanned.x - expectedDx),
      'pan moved by exactly the minimal rescue',
    ).toBeLessThanOrEqual(EPS);

    // The rescued selection: fully in-canvas and clear of every interactive
    // chrome rect as the clamp sees them (the measured rail rect + the chip).
    const boxAfter = expectBoxed(await readBox(page, GHOST_HOUSE_ID), GHOST_HOUSE_ID);
    expect(boxAfter.x, 'rescued ghost-house left edge in-canvas').toBeGreaterThanOrEqual(-EPS);
    expect(boxAfter.x + boxAfter.w, 'rescued ghost-house right edge in-canvas').toBeLessThanOrEqual(
      canvasAfter.width + EPS,
    );
    expect(boxAfter.y, 'rescued ghost-house top edge in-canvas').toBeGreaterThanOrEqual(-EPS);
    expect(boxAfter.y + boxAfter.h, 'rescued ghost-house bottom edge in-canvas').toBeLessThanOrEqual(
      canvasAfter.height + EPS,
    );
    for (const [i, r] of (await chromeBoxes(page)).entries()) {
      const overlaps =
        boxAfter.x < r.x + r.w - EPS && boxAfter.x + boxAfter.w > r.x + EPS &&
        boxAfter.y < r.y + r.h - EPS && boxAfter.y + boxAfter.h > r.y + EPS;
      expect(overlaps, `rescued ghost-house clear of interactive chrome #${i}`).toBe(false);
    }

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });
});
