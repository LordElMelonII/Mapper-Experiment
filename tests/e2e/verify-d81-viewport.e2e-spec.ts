// tests/e2e/verify-d81-viewport.e2e-spec.ts — VERIFIER suite (Agent D, PKG
// B-125 close), re-derived under PKG B-133 (D91): the cells the sweep
// requires that panel-resize-viewport.e2e-spec.ts does not already pin.
// Adversarial: every zero-motion cell here FAILS if D91's overlay posture is
// reverted to a stage-resizing panel regime (a panel transition that moves
// the stage re-fits or re-clamps, and the byte-equal asserts go red), and
// the refit-class cells fail if the discriminator over-preserves.
//
// Cited IDs:
//   D91      — the overlay panel regime (amending D81): panel open/close
//              never resizes the stage and never moves the viewport; the
//              panel-driven resize class narrows to the rail's
//              collapse/expand (wide: preserve + pan-only rescue clamp);
//              environmental (either layout) and narrow-layout resizes refit.
//   B-106    — the refit guarantee the narrow layout keeps (phone cells).
//   B-107/C3 — a cross-layer arc's badge pseudo-node IS its whole canvas
//              surface: the clamp's badge-fallback anchor (the edge is never
//              projected for a cross-layer arc — buildLayerElements filters
//              it — so the badge box is the only possible anchor).
//   B-120    — fit sites are mount(), notifyResize() (environmental/narrow
//              classes) and selectLayer() ONLY; the selectLayer cell pins
//              that inventory against regressions.
//   D2       — the resize path writes no signals / logs nothing: every cell
//              asserts a clean console.
//   F52/D53  — the phone cell runs touch alone; the wide-layout cells only
//              exist at >= 700px so they self-skip on the phone project (the
//              established isPhone pattern, panel-resize-viewport precedent).
//
// Coverage limit (reported, not faked): the clamp's OVERSIZED-box branch
// (a selection box exceeding the canvas — best-effort containment, the
// 12-pass chrome cap, C32) is not reachable through genuine gestures: the
// wheel-zoom clamp (maxZoom) caps a leaf node's rendered box well under the
// canvas, and compound parents are never selectable by tap (the B-120
// no-op branch). That branch is covered by inspection only in this packet.
//
// Aiming discipline: reads/aims through the DEV-HARNESS-ONLY
// window.__TME_E2E__ hook (reads only, no closures across the evaluate wire);
// expected rescue deltas are computed from those reads with TEST-side math
// (the UI computes nothing, R1); sub-pixel EPS slack because the service's
// internal box edges are float-identical only to rounding.
import { expect, test, type Page } from '@playwright/test';

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
const CASTLE_ID = 'einzbern-castle';
const CASTLE_LABEL = 'Einzbern Castle';
const TEMPLE_ID = 'ryuudou-temple'; // FX1's BOTTOM content — the refit discriminator
const CROSS_LAYER_ARC = 'arc-fuyuki-station-misaki-town'; // FX1's only cross-layer arc (C3/F17)
const BADGE_ID = `tme-badge-${CROSS_LAYER_ARC}`;
const FUYUKI_LAYER_BUTTON = 'tme-layer-layer-fuyuki';
const MISAKI_LAYER_BUTTON = 'tme-layer-layer-misaki';

/** D91/B-127/B-128 (D86/D85): the measured INTERACTIVE chrome surfaces (map-viewer.component — the rail, the breadcrumb bar and the chip). */
const CHROME_SELECTORS = ['.tme-rail', '.tme-breadcrumb', '.tme-chip'];

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

const readZoom = (page: Page): Promise<number> =>
  page.evaluate(() => {
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
 * Wait two animation frames: a resize's RO-driven path (D91 preserve/rescue
 * for the wide rail class, the B-106 refit otherwise) runs just before the
 * next paint — reading inside that window yields pre-resize coordinates. Two
 * rAFs put every read AFTER it.
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

// B-D1 re-baseline (PROPOSAL-D §2.1 + B-D1): at >=1024 the rail's per-layer
// nav, its Manage entry and the collapse toggle are shell-gated OFF — the
// layer switch rides the LAYER MANAGER's row-name button (the switch
// surface) through the belt's Layers tool, and the rail collapse/expand
// cycle lives in the 700–1023 medium band (the wide column's home regime,
// byte-for-byte per R29 ruling 1). Presence-probed against the live DOM,
// never a mirrored breakpoint; the manager closes after a shell-path switch
// (the pre-shell chrome state; selectLayer's explicit fit runs on the row
// click, D85/D81 — exactly the fit-site inventory this spec pins).

/** Narrow a >=1024 desktop page into the medium band (the collapse cycle's
 *  home regime); a no-op below 1024 (the phone arm never hits it). */
const stageAtWideChromeViewport = async (page: Page): Promise<void> => {
  const width = page.viewportSize()?.width ?? 0;
  if (width < 1024) return;
  await page.setViewportSize({ width: 900, height: 720 }); // the medium band
  await settle(page); // the shell flip re-render lands before the next paint
};

/** Switch layers in the live regime (B-D1): the rail's per-layer button
 *  below 1024, the manager's row-name button at >=1024. */
const switchLayer = async (page: Page, railTestId: string, layerName: string): Promise<void> => {
  const railButton = page.getByTestId(railTestId);
  if (await railButton.count()) {
    await railButton.click();
    return;
  }
  await page.getByTestId('tme-layers-tool').click();
  await expect(page.getByTestId('tme-layer-manager')).toBeVisible();
  await page
    .locator('.tme-layer-row')
    .filter({ has: page.locator('[data-testid="tme-layer-name"]', { hasText: layerName }) })
    .getByTestId('tme-layer-name')
    .click();
  await page.getByTestId('tme-layer-manager-close').click();
  await expect(page.getByTestId('tme-layer-manager')).toBeHidden();
};

const tapNode = async (page: Page, id: string): Promise<void> => {
  await settle(page);
  const pos = expectPositioned(await readPosition(page, id), id);
  const box = await canvasBox(page);
  await tapPoint(page, box.x + pos.x, box.y + pos.y);
};

const tapEdgeMidpoint = async (page: Page, arc: ArcFact): Promise<void> => {
  await settle(page);
  const source = expectPositioned(await readPosition(page, arc.source), arc.source);
  const target = expectPositioned(await readPosition(page, arc.target), arc.target);
  const box = await canvasBox(page);
  await tapPoint(page, box.x + (source.x + target.x) / 2, box.y + (source.y + target.y) / 2);
};

const expectHeaders = async (page: Page): Promise<void> => {
  for (const [testId, text] of R1_HEADERS) {
    await expect(page.getByTestId(testId)).toHaveText(text);
  }
};

const collectConsole = (page: Page): string[] => {
  const bad: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));
  return bad;
};

/** The clamp's chrome rects as the clamp sees them (Playwright boundingBoxes, canvas-relative). */
const chromeBoxes = async (page: Page): Promise<Box[]> => {
  const canvas = await canvasBox(page);
  const rects: Box[] = [];
  for (const selector of CHROME_SELECTORS) {
    const loc = page.locator(selector);
    if ((await loc.count()) === 0) continue;
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

/**
 * D91: the pan used to engineer the badge into the rail's reclaimed band — a
 * view-mode background drag in the stage's empty bottom band (below the
 * fitted content, clear of every element). The start point is the canvas's
 * horizontal center so it clears the boot route floater (bottom-right
 * anchor).
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

test.describe('D91 verifier cells (PKG B-133; the D81 close re-derived)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readPosition(page, CASTLE_ARC.source)).not.toBeNull();
    await expect.poll(() => readPosition(page, CASTLE_ARC.target)).not.toBeNull();
  });

  test('boot zero-motion: zoom/pan are byte-stable from the first post-mount frame through settle (D91/B-120/D2)', async ({
    page,
  }) => {
    // The RO's initial fire takes the preserve path on wide (mount's
    // baseline classifies it panel-driven) — boot must be visually inert:
    // mount's fit is the last word. An init-script rAF log records the
    // viewport from the first frame the projection exists; EVERY recorded
    // frame must be byte-identical (a stray boot-time fit/clamp/pan would
    // show as a changed entry). Honest limit: a boot-time REFIT of an
    // unchanged canvas reproduces the same numbers, so this cell pins zero
    // MOTION, not the classifier's label at boot.
    const bad = collectConsole(page);
    await page.addInitScript(() => {
      const w = window as unknown as {
        __D91_BOOT_LOG?: { z: number; px: number; py: number }[];
        __TME_E2E__?: {
          zoom(): number;
          pan(): { x: number; y: number };
          nodeRenderedPosition(id: string): { x: number; y: number } | null;
        };
      };
      w.__D91_BOOT_LOG = [];
      const tick = (): void => {
        const hook = w.__TME_E2E__;
        if (hook !== undefined && hook.nodeRenderedPosition('outskirts') !== null) {
          w.__D91_BOOT_LOG!.push({ z: hook.zoom(), px: hook.pan().x, py: hook.pan().y });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto('/'); // reload so the init script owns this boot
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readPosition(page, CASTLE_ARC.source)).not.toBeNull();
    await settle(page);
    await page.waitForTimeout(100); // a few more logged frames past the settle
    const log = await page.evaluate(
      () => (window as unknown as { __D91_BOOT_LOG?: { z: number; px: number; py: number }[] }).__D91_BOOT_LOG ?? [],
    );
    expect(log.length, 'the boot probe observed multiple frames').toBeGreaterThanOrEqual(3);
    const first = log[0];
    for (const [i, frame] of log.entries()) {
      expect(frame.z, `boot frame ${i} zoom byte-stable`).toBe(first.z);
      expect(frame.px, `boot frame ${i} pan.x byte-stable`).toBe(first.px);
      expect(frame.py, `boot frame ${i} pan.y byte-stable`).toBe(first.py);
    }
    expect(first.z, 'boot settled at a real fit (not the identity viewport)').toBeGreaterThan(0);
    await expectHeaders(page);
    expect(bad, 'console clean through boot (D2)').toEqual([]);
  });

  test('wide discriminator edge: a 1px viewport move with a floating panel open flips to the environmental refit; the panel close after it preserves byte-equal (D91)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout discriminator is the desktop project (SCSS 700px breakpoint)');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);

    // Panel open (an overlay ⇒ zero motion — the D91 baseline).
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    const zoomPanel = await readZoom(page);

    // A MINIMAL viewport move (+1px width) must flip the class: the
    // discriminator is ANY-dimension-changed, not a threshold. The
    // environmental refit re-fits the 1px-wider canvas ⇒ zoom moves off its
    // preserved value (a preserve path would leave it byte-identical).
    await page.setViewportSize({ width: 1281, height: 720 });
    await settle(page);
    const canvasWide = await canvasBox(page);
    const zoomRefit = await readZoom(page);
    expect(zoomRefit, 'a 1px viewport move flips to the environmental refit (zoom re-based)').not.toBe(zoomPanel);
    const temple = expectPositioned(await readPosition(page, TEMPLE_ID), TEMPLE_ID);
    expect(temple.x, 'temple in-box after the environmental refit').toBeGreaterThanOrEqual(0);
    expect(temple.x, 'temple in-box after the environmental refit').toBeLessThanOrEqual(canvasWide.width);
    expect(temple.y, 'temple in-box after the environmental refit').toBeGreaterThanOrEqual(0);
    expect(temple.y, 'temple in-box after the environmental refit').toBeLessThanOrEqual(canvasWide.height);

    // The classifier REFRESHED at that resize: the panel close now compares
    // against the post-refit viewport (unchanged) ⇒ panel-driven ⇒ preserve
    // ⇒ the close must not move a byte (an always-refit body fails here).
    const zoomBeforeClose = await readZoom(page);
    const panBeforeClose = await readPan(page);
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(CASTLE_LABEL);
    await settle(page);
    expect(await readZoom(page), 'panel close after the refit preserves zoom byte-equal').toBe(zoomBeforeClose);
    const panClosed = await readPan(page);
    expect(panClosed.x, 'panel close after the refit preserves pan.x byte-equal').toBe(panBeforeClose.x);
    expect(panClosed.y, 'panel close after the refit preserves pan.y byte-equal').toBe(panBeforeClose.y);

    await expectHeaders(page);
    expect(bad, 'console clean (D2)').toEqual([]);
  });

  test('wide clamp badge fallback: the floating panel opens with zero motion, and a rail EXPAND rescues the cross-layer arc through its B-107 badge anchor, pan-only, zoom byte-put (D91/B-107/C3)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout clamp rule is the desktop project');
    const bad = collectConsole(page);
    await stageAtWideChromeViewport(page); // B-D1 (PROPOSAL-D §2.1 + B-D1): the collapse cycle lives below 1024
    await settle(page);
    await expectHeaders(page);
    const zoomBefore = await readZoom(page);

    // Collapse the rail first (nothing selected ⇒ zero motion: the stage
    // grows), then engineer the badge into the band the EXPAND will reclaim:
    // a view-mode background drag pans the view so the badge's right edge
    // lands at collapsedWidth − 60 — in-canvas (tappable) and past the
    // post-expand band. The drag length is COMPUTED from live reads, not
    // assumed.
    await page.getByTestId('tme-rail-toggle').click();
    await settle(page);
    const canvasCollapsed = await canvasBox(page);
    expect(await readZoom(page), 'collapse (stage grows): zoom byte-equal').toBe(zoomBefore);
    const badgeAtFit = expectBoxed(await readBox(page, BADGE_ID), BADGE_ID);
    const dragDx = canvasCollapsed.width - 60 - (badgeAtFit.x + badgeAtFit.w);
    if (Math.abs(dragDx) > 5) await panByDrag(page, dragDx);
    const panPanned = await readPan(page);
    const badgePre = expectBoxed(await readBox(page, BADGE_ID), BADGE_ID);
    expect(badgePre.x + badgePre.w, 'engineering: badge right edge inside the collapsed canvas').toBeLessThanOrEqual(
      canvasCollapsed.width,
    );
    expect(badgePre.x + badgePre.w, 'engineering: badge right edge past the post-expand band').toBeGreaterThan(
      canvasCollapsed.width - 100,
    );

    // Badge tap ⇒ the ARC is selected (B-108: the badge is the cross-layer
    // arc's only canvas surface) ⇒ the arc panel FLOATS — zero motion (D91):
    // zoom and pan byte-untouched by the open.
    const badgePos = expectPositioned(await readPosition(page, BADGE_ID), BADGE_ID);
    await tapPoint(page, canvasCollapsed.x + badgePos.x, canvasCollapsed.y + badgePos.y);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    expect(await readZoom(page), 'zoom untouched by the floating panel open (D91)').toBe(zoomBefore);
    const panOpen = await readPan(page);
    expect(panOpen.x, 'pan untouched by the floating panel open (D91)').toBe(panPanned.x);
    expect(panOpen.y, 'pan untouched by the floating panel open (D91)').toBe(panPanned.y);

    // Expand the rail: the stage narrows from the left ⇒ the preserved
    // viewport leaves the badge past the right edge ⇒ the clamp rescues it —
    // ONE minimal pure-x pan bringing the badge box's right edge to the
    // canvas's right edge (the badge anchors as a BOX — the fallback branch;
    // a missing fallback would mean no anchor at all ⇒ zero motion ⇒ the
    // delta assert below fails).
    await page.getByTestId('tme-rail-toggle').click();
    await settle(page);
    const canvasAfter = await canvasBox(page);
    expect(canvasAfter.width, 'the stage narrowed with the expanded rail').toBeLessThan(canvasCollapsed.width);
    const expectedDx = canvasAfter.width - (badgePre.x + badgePre.w);
    expect(expectedDx, 'engineering: a rescue was needed').toBeLessThan(0);
    expect(await readZoom(page), 'zoom untouched by the badge rescue (D91)').toBe(zoomBefore);
    const panAfter = await readPan(page);
    expect(panAfter.y, 'the rescue is pure-x').toBe(panPanned.y);
    expect(
      Math.abs(panAfter.x - panPanned.x - expectedDx),
      'pan moved by exactly the minimal badge rescue',
    ).toBeLessThanOrEqual(EPS);

    // Post-rescue: the badge box fully in-canvas and clear of every
    // interactive chrome rect as the clamp sees them.
    const boxAfter = expectBoxed(await readBox(page, BADGE_ID), BADGE_ID);
    expect(boxAfter.x, 'rescued badge left edge in-canvas').toBeGreaterThanOrEqual(-EPS);
    expect(boxAfter.x + boxAfter.w, 'rescued badge right edge in-canvas').toBeLessThanOrEqual(
      canvasAfter.width + EPS,
    );
    expect(boxAfter.y, 'rescued badge top edge in-canvas').toBeGreaterThanOrEqual(-EPS);
    expect(boxAfter.y + boxAfter.h, 'rescued badge bottom edge in-canvas').toBeLessThanOrEqual(canvasAfter.height + EPS);
    for (const [i, r] of (await chromeBoxes(page)).entries()) {
      const overlaps =
        boxAfter.x < r.x + r.w - EPS && boxAfter.x + boxAfter.w > r.x + EPS && boxAfter.y < r.y + r.h - EPS && boxAfter.y + boxAfter.h > r.y + EPS;
      expect(overlaps, `rescued badge clear of interactive chrome #${i}`).toBe(false);
    }

    await expectHeaders(page);
    expect(bad, 'console clean (D2)').toEqual([]);
  });

  test('B-113 cull coherence across the D91 classes: the preserve path neither re-bases nor strands the cull; the environmental refit re-bases it (D91/B-113)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout preserve rule is the desktop project');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    const readCulled = (): Promise<boolean> =>
      page.evaluate((nodeId) => {
        const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
        if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
        return (hook as unknown as { nodeHasClass(id: string, cls: string): boolean }).nodeHasClass(
          nodeId,
          'tme-cull-labels',
        );
      }, CASTLE_ID);
    expect(await readCulled(), 'engineering: labels start uncalled at the fit').toBe(false);

    // Drive zoom OUT past the B-113 threshold (fit zoom × 0.6) with real
    // wheel gestures: labels cull.
    const fitZoom = await readZoom(page);
    const canvas = await canvasBox(page);
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    let ticks = 0;
    while ((await readZoom(page)) > fitZoom * 0.6 * 0.9 && ticks++ < 40) await page.mouse.wheel(0, 240);
    await settle(page);
    expect(await readCulled(), 'engineering: the cull engaged below the threshold').toBe(true);
    const zoomCulled = await readZoom(page);

    // Floating panel open ⇒ zero motion: zoom byte-put, and the cull state
    // is EXACTLY preserved — no re-base (cullZoom belongs to the last real
    // fit) and no spurious crossing in either direction.
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await settle(page);
    expect(await readZoom(page), 'the overlay open keeps the zoomed-out zoom byte-put').toBe(zoomCulled);
    expect(await readCulled(), 'the preserve path leaves the cull state untouched (no re-base, no strand)').toBe(
      true,
    );

    // Environmental resize (the viewport itself moves) ⇒ refit ⇒ cullZoom
    // RE-BASES from the new fit zoom. Discriminating: the 400px-stage fit
    // zoom (~0.75) sits ABOVE its fresh threshold (×0.6) ⇒ labels uncull;
    // a stale boot-fit threshold (0.89) would keep them culled and fail
    // this assert (the strand the cell exists to catch).
    await page.setViewportSize({ width: 1280, height: 400 });
    await settle(page);
    const zoomRefit = await readZoom(page);
    expect(zoomRefit, 'the environmental refit re-zoomed').not.toBe(zoomCulled);
    expect(await readCulled(), 'the refit re-based the threshold — labels uncull (no stale strand)').toBe(false);

    await expectHeaders(page);
    expect(bad, 'console clean (D2)').toEqual([]);
  });

  test('selectLayer keeps its explicit fit — the D91 fit-site inventory is intact (D91/B-120)', async ({ page }) => {
    test.skip(isPhone(), 'pinned on the wide layout where the preserve class could have swallowed it');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);
    const fitZoom = await readZoom(page);
    const fitPan = await readPan(page);

    // Layer switch ⇒ selectLayer's explicit fitView (B-120's third fit
    // site): the single-hub Misaki layer fits differently ⇒ zoom moves.
    // The canvas LABELS are the switch's assertion surface — selectLayer is
    // viewer-internal (no facade write), so the core snapshot header stays
    // 'Fuyuki City' (asserted verbatim at the end: view-layer switches do
    // not rewrite core strings, R1).
    await switchLayer(page, MISAKI_LAYER_BUTTON, 'Misaki Town'); // B-D1 (PROPOSAL-D §2.1 + B-D1): the regime-aware switch
    await settle(page);
    const misakiZoom = await readZoom(page);
    expect(misakiZoom, 'selectLayer re-fit ran (zoom re-based on the new layer)').not.toBe(fitZoom);
    const misakiLabels = await page.evaluate(() => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
      return (hook as unknown as { nodeLabels(): string[] }).nodeLabels();
    });
    expect(misakiLabels, 'the Misaki hub is the projected layer content').toContain('Misaki Town');
    expect(misakiLabels, 'the fuyuki leaves are gone (F01 one-layer-at-a-time)').not.toContain('Emiya Residence');

    // Switching back re-fits the SAME content at the SAME canvas size — the
    // fit is deterministic ⇒ the pristine fuyuki viewport returns byte-equal.
    await switchLayer(page, FUYUKI_LAYER_BUTTON, 'Fuyuki City'); // B-D1 (PROPOSAL-D §2.1 + B-D1): the regime-aware switch
    await settle(page);
    expect(await readZoom(page), 'the return fit restores the pristine zoom byte-equal').toBe(fitZoom);
    const panBack = await readPan(page);
    expect(panBack.x, 'the return fit restores the pristine pan byte-equal').toBe(fitPan.x);
    expect(panBack.y, 'the return fit restores the pristine pan byte-equal').toBe(fitPan.y);

    await expectHeaders(page);
    expect(bad, 'console clean (D2)').toEqual([]);
  });

  test('phone: the narrow panel round-trip is ZERO-MOTION both ways — open AND close keep the viewport and the canvas box byte-put (D91, F52/D53)', async ({
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
    // — D91's zero-motion invariant on narrow: the canvas box, zoom and pan
    // are byte-untouched by the open (the old stacked-region regime shrank
    // the stage and refit BOTH ways; that resize class is gone).
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
    // The fit never moved: the temple (the content's bottom) is in-box
    // exactly as the boot fit left it — the content-tappable proxy.
    const temple = expectPositioned(await readPosition(page, TEMPLE_ID), TEMPLE_ID);
    expect(temple.y, 'temple in-box after the overlay open (content never moved)').toBeGreaterThanOrEqual(0);
    expect(temple.y, 'temple in-box after the overlay open (content never moved)').toBeLessThanOrEqual(
      canvasOpen.height,
    );

    // Close by node select (the arc panel's mutual exclusion — touch alone):
    // the overlay vanishes, zero motion again.
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
    expect(bad, 'console clean (D2)').toEqual([]);
  });
});
