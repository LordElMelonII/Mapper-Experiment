// tests/e2e/editor-place-move.e2e-spec.ts — PKG B-116: editor mode on the map
// viewer (§5 Phase 3 M1) — place & move authored nodes plus the F45 save bar.
// Runs at BOTH playwright projects (desktop + emulated phone with touch) —
// D53/F52 mobile-and-desktop parity is mandatory for every UI packet; the
// drag cells run the touch gestures through the Chromium-twin pattern
// (WebKit's iPhone 13 emulation cannot drive CDP touch gestures directly —
// see interactions.e2e-spec.ts).
//
// Cited IDs:
//   §5 Phase 3 M1 — "place/rename/move nodes … property panel": this spec
//          pins place + move; rename/property panel are B-117, not here.
//   D75/F45 — facade.upsertNode creates (id: '') / replaces (a known id) and
//          marks ONLY the core's dirty flag: until saveMap, routing and the
//          snapshot still serve the SAVED graph (product behavior, not
//          staleness to be hidden), and the unsaved-changes indicator — the
//          save dock — appears on the first edit and clears after Save.
//   C5/D75 — the UI never invents ids: a placed node is identified as the
//          delta between the pre- and post-command projections' node-id
//          sets, then selected; its engine-assigned id is read live through
//          the harness seam, never predicted by the test.
//   C23 — the created node's default label is the plain words 'New place'
//          (renaming lands with the property panel), never an id-like token.
//   D10/C4 — in VIEW mode nodes are not draggable (cy.autoungrabify): the
//          map's coordinates are the author's business; a view-mode drag
//          moves nothing.
//   R2/R4/C24 — the app mutates ONLY through facade.upsertNode; the
//          projection re-derives from the authored map references, so the
//          drag-persistence proof survives a layer-switch rebuild.
//   D2/D3 — one headless cy instance, zoneless: only discrete tap/free
//          writes drive the chrome (the save dock is template-bound).
//   F52/D53/§6.2 — ≥ 44px tap targets operated touch-alone (toggle, Save),
//          touch drag synthesized only through CDP on the twin, and the
//          harness console stays clean.
//
// Setup shares the existing harness-entry pattern (page.goto('/') + canvas
// visibility + a seam-backed rendered read), and reuses the vetted
// background-point discipline of waypoints.e2e-spec.ts: the placement point
// is model-anchored and converted test-side through the zoom/pan seams — the
// UI computes nothing (R1).
import { chromium, devices, expect, test, type CDPSession, type Locator, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeModelPosition(id: string): { x: number; y: number } | null;
  selectedNodeId(): string | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';
const EMIYA_ID = 'emiya-residence';
const NEW_PLACE = 'New place'; // C23 default label, verbatim

/**
 * The B-109-vetted clear background point in MODEL coordinates (see
 * waypoints.e2e-spec.ts's header for the exhaustive scan: >110 model units
 * from every authored edge segment, >60 from every node center, the badge
 * and both compound boxes, at BOTH projects' fits; inside the fitted
 * bounding box so the post-placement fitView is a no-op and the node renders
 * exactly at the tap). The editor chrome (toggle/chip/dock) occupies the
 * stage's TOP-RIGHT corner stack; this point's rendered position (left,
 * lowish — exercised repeatedly by the waypoints specs) stays clear of it,
 * as does EMIYA's center.
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };

const isPhone = (): boolean => test.info().project.name === 'phone';

/**
 * PKG B-142 (REPAIRS R-2) re-baseline: the phone boot now stages AT the pin
 * (the boot-posture zoom, the pin-centered viewport). This spec's aims are
 * exhaustively scanned against the PRE-PACKET WORLD-FIT boot viewport
 * (zoom = 0.282... on FX1 — the hit-corridor arithmetic above), so the phone
 * cells restore exactly that viewport first by tapping the rail's Fit — the
 * packet's own "explicit full-world ask". Desktop never arms the posture
 * (the wide gate mirrors D81's 700px breakpoint), so its boot is
 * byte-unchanged and this is a no-op. The withPhoneChromiumPage twin boots
 * under the SAME iPhone-13 emulation, so it takes the same restore. Aim
 * math and every assertion are untouched — the R23 in-box-content law
 * stands throughout.
 */
const restoreBootViewport = async (page: Page): Promise<void> => {
  if (isPhone()) await page.getByTestId('tme-zoom-fit').tap();
};

// page.evaluate callbacks are SERIALIZED: the hook lookup is inlined in each
// one — no module-scope closures cross the wire (interactions.e2e-spec.ts
// precedent).

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeLabels();
  });

const readRenderedPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeRenderedPosition(nodeId);
    },
    id,
  );

/** D75/R4: the AUTHORED (model) position of one node, read via the seam. */
const readModelPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeModelPosition(nodeId);
    },
    id,
  );

/** C5/D75: the selected node's id (the placed node after a place command). */
const readSelectedId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.selectedNodeId();
  });

const expectModelPosition = (pos: { x: number; y: number } | null): { x: number; y: number } => {
  if (pos === null) throw new Error('node absent from the projection (model position unreadable)');
  return pos;
};

/**
 * Wait two animation frames: panel open/close (the route sheet auto-expands
 * on selection at phone width — B-114) and the ResizeObserver-driven re-fit
 * (B-112) run just before the next paint — reads and gestures inside that
 * window would aim at stale coordinates (the arc-panel settle precedent).
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** F52/D53: tap on the touch-emulated project, click on desktop (points). */
const tapPoint = async (page: Page, point: Point): Promise<void> => {
  if (isPhone()) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
};

/** F52/D53: tap on the touch-emulated project, click on desktop (locators). */
const activate = async (locator: Locator): Promise<void> => {
  if (isPhone()) await locator.tap();
  else await locator.click();
};

// B-D1 re-baseline (PROPOSAL-D §2.1 + B-D1): at >=1024 the rail's per-layer
// nav is shell-gated OFF — the switch rides the LAYER MANAGER's row-name
// button (the switch surface, layer-manager.component) through the belt's
// Layers tool entry; below 1024 the rail's per-layer button stands
// byte-identical (R29 ruling 1). Presence-probed against the live DOM (the
// helper serves BOTH the desktop shell page and the phone twin — the regime,
// not the project, decides). The manager closes after the shell-path switch
// so the persistence reads run on a clear stage.
const switchToLayer = async (page: Page, railTestId: string, layerName: string): Promise<void> => {
  const railButton = page.getByTestId(railTestId);
  if (await railButton.count()) {
    await activate(railButton);
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

/** Screen-px point of a node's rendered center (seam read + canvas box). */
const nodeScreenPoint = async (page: Page, id: string): Promise<Point> => {
  await settle(page);
  const pos = await readRenderedPosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return { x: box.x + pos.x, y: box.y + pos.y };
};

/** Tap a MODEL point: convert via the seam (test-side math only — R1). */
const tapModelPoint = async (page: Page, model: { x: number; y: number }): Promise<void> => {
  await settle(page);
  const screen = await page.evaluate((m): Point | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    const box = document.querySelector('[data-testid="tme-canvas"]')?.getBoundingClientRect();
    if (box === null || box === undefined) return null;
    return { x: box.x + hook.pan().x + m.x * hook.zoom(), y: box.y + hook.pan().y + m.y * hook.zoom() };
  }, model);
  if (screen === null) throw new Error('canvas host not visible');
  await tapPoint(page, screen);
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * B-133c (D91) coverage guard — the reference implementation's shape
 * (editor-quick-connect @ 5006574), with two probe-derived extensions:
 * the band rects read the panel HOSTS (a scrolled sheet's content rect
 * spans far past the viewport — the host is the visible band), and the ARC
 * panel joins the bands. Diagnosed live on this spec's drag cell: the
 * placed node's selection opens the property sheet over the lower stage —
 * the DRAG START sat under it (probe: the aim answered the panel's label
 * input) and the CDP touch drag moved nothing. The dodge is ONE background
 * mouse drag (a drag is not a tap — no selection, no placement); its start
 * is a live clear-canvas point clear of every rendered node (editor-mode
 * drags grab nodes). Phone-only (D53): desktop stays byte-identical.
 */
const PM_NODE_IDS = [
  'einzbern-castle',
  'ryuudou-temple',
  'outskirts',
  'emiya-residence',
  'misaki-town',
  'shopping-district',
  'homurahara-academy',
  'matou-residence',
  'tohsaka-residence',
  'fuyuki-bridge',
  'fuyuki-station',
  'harbor',
  'kotomine-church',
  'ghost-house',
  'district-miyama',
  'district-shinto',
] as const;

interface CoverBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const coveringBands = (page: Page): Promise<Record<string, CoverBox | null>> =>
  page.evaluate((): Record<string, CoverBox | null> => {
    const boxOf = (sel: string, host: boolean): CoverBox | null => {
      const el = host ? document.querySelector(sel) : document.querySelector(`[data-testid="${sel}"]`);
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return r.width === 0 && r.height === 0
        ? null
        : { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    return {
      chip: boxOf('tme-selection-chip', false),
      prop: boxOf('tme-property-panel', true), // the HOST: the visible clamped band
      route: boxOf('tme-route-panel', true),
      rail: boxOf('tme-sheet-rail', false),
      arc: boxOf('tme-arc-panel', true),
      header: boxOf('tme-header', false),
      breadcrumb: boxOf('tme-breadcrumb', false),
    };
  });

const bandCovers = (pt: Point, band: CoverBox | null): boolean =>
  // EXACT DOM containment (+4px boundary safety) — the reference predicate
  // (probe-proven: a comfort margin false-positives fittable corridors).
  band !== null &&
  pt.x >= band.left - 4 &&
  pt.x <= band.left + band.width + 4 &&
  pt.y >= band.top - 4 &&
  pt.y <= band.top + band.height + 4;

/** One background drag carrying every aim above the CURRENT bands, clamped below the top chrome. */
const dodgeBands = async (
  page: Page,
  aims: readonly Point[],
  boxes: Record<string, CoverBox | null>,
): Promise<void> => {
  const canvas = await page.getByTestId('tme-canvas').boundingBox();
  if (canvas === null) throw new Error('canvas host not visible');
  // B-D2 re-baseline (R29, PROPOSAL-D §2.1 — cited): at shell widths the
  // selection chip lives in the canvas-bottom STATUS STRIP — a BOTTOM band,
  // not top chrome (counting it into the top floor put floor+12 past the
  // canvas bottom and emptied the drag-start search window: topFloor 712 vs
  // a 720px canvas). The chip dodge flips to clear-ABOVE for a bottom chip,
  // and bands horizontally outside the canvas (the docked panel's host — a
  // stage SIBLING right of it) never steer the pan. Both repairs read the
  // LIVE geometry (presence-probed, the D-1 law): a chip in the canvas's
  // top half keeps the pre-D-2 treatment byte-identically.
  const canvasMid = canvas.y + canvas.height / 2;
  const chipIsTopBand = boxes.chip !== null && boxes.chip.top + boxes.chip.height <= canvasMid;
  const coversCanvas = (band: CoverBox): boolean =>
    band.left < canvas.x + canvas.width && band.left + band.width > canvas.x;
  let panDy = 0;
  for (const band of [boxes.prop, boxes.route, boxes.rail, boxes.arc]) {
    if (band === null || !coversCanvas(band)) continue;
    for (const t of aims) {
      if (t.y > band.top - 16) panDy = Math.min(panDy, band.top - 16 - t.y);
    }
  }
  if (boxes.chip !== null) {
    const chip = boxes.chip;
    for (const t of aims) {
      if (t.x + 22 > chip.left && t.y + 22 > chip.top && t.y - 22 < chip.top + chip.height) {
        panDy = Math.min(
          panDy,
          chipIsTopBand ? chip.top + chip.height + 16 - t.y : chip.top - 16 - t.y,
        );
      }
    }
  }
  const topFloor = Math.max(
    ...[boxes.header, boxes.breadcrumb, chipIsTopBand ? boxes.chip : null].map((b) =>
      b === null ? 0 : b.top + b.height,
    ),
    0,
  );
  if (topFloor > 0) {
    const needed = Math.max(...aims.map((t) => topFloor + 16 - t.y));
    if (needed > panDy) panDy = needed;
  }
  if (panDy < -8 || panDy > 8) {
    const panRead = (): Promise<{ x: number; y: number }> =>
      page.evaluate((): { x: number; y: number } => {
        const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
        if (hook === undefined) throw new Error(HOOK_ERROR);
        return hook.pan();
      });
    const panBefore = await panRead();
    // The drag's START must be a clear CANVAS point clear of every rendered
    // node except the aims themselves (the drag target is a node — this
    // dodge's own start must not grab ANY node; only the down point matters).
    const start = await page.evaluate(
      ({ canvasBox, top, floor, ids }): Point | null => {
        const hook = (window as unknown as {
          __TME_E2E__?: { nodeRenderedPosition(id: string): { x: number; y: number } | null };
        }).__TME_E2E__;
        if (hook === undefined) return null;
        // B-D2 re-baseline: bands right of the canvas (the docked panel's
        // host) never bound the search window — see the coversCanvas note
        // in the pan arms above.
        const bands = [top.prop, top.route, top.rail, top.arc].filter(
          (b) => b !== null && b.left < canvasBox.x + canvasBox.width && b.left + b.width > canvasBox.x,
        );
        const minBand =
          bands.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...bands.map((b) => b.top));
        const nodePts = ids
          .map((id: string) => hook.nodeRenderedPosition(id))
          .filter((p): p is { x: number; y: number } => p !== null);
        for (const fx of [0.5, 0.2, 0.8, 0.35, 0.65]) {
          for (let y = floor + 12; y < minBand - 12; y += 8) {
            const x = canvasBox.x + canvasBox.width * fx;
            const el = document.elementFromPoint(x, y);
            if (el === null || el.closest('.tme-canvas') === null) continue;
            // A mousedown on a node GRABS it (editor mode) — the start must
            // clear every node by more than the touch slop (~22·zoom + 8 px).
            if (nodePts.some((p) => Math.hypot(p.x + canvasBox.x - x, p.y + canvasBox.y - y) < 26)) {
              continue;
            }
            return { x, y };
          }
        }
        return null;
      },
      {
        canvasBox: canvas,
        top: { prop: boxes.prop, route: boxes.route, rail: boxes.rail, arc: boxes.arc },
        floor: topFloor,
        ids: [...PM_NODE_IDS],
      },
    );
    if (start === null) {
      throw new Error(
        `dodgeBands: no clear canvas drag start (topFloor=${topFloor}, bands=${boxes.rail?.top ?? 'x'}/${boxes.prop?.top ?? 'x'}/${boxes.arc?.top ?? 'x'})`,
      );
    }
    // Drag up = content up; the map translates uniformly, so every aim clears together.
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + panDy, { steps: 4 });
    await page.mouse.up();
    const panAfter = await panRead();
    if (Math.abs(panAfter.y - panBefore.y) < 8) {
      throw new Error(`dodgeBands: the drag panned nothing (start ${Math.round(start.x)},${Math.round(start.y)})`);
    }
  }
};

/**
 * Park the route floater OUT OF THE WAY for the rest of the cell: one D10
 * user gesture — a header drag (the floater's own drag machinery commits the
 * position, clamped to its stage bounds, so slop in the pointer target lands
 * the same parked rect) — and a PLACED floater wins over every default
 * anchor and survives the D91 content re-derivations for the whole cell.
 * B-141 re-baseline (docs/ui-restyle/REPAIRS.md R1, deliberate, cited): the
 * staggered unplaced floater anchors OPPOSITE the property panel, which
 * covers the B-109-vetted low-left canvas points the blind desktop cells
 * were calibrated against. Desktop-only: the narrow sheet has no floater
 * header (the phone flows never needed it, D91/D53).
 */
const parkRouteFloater = async (page: Page): Promise<void> => {
  if (isPhone()) return;
  await settle(page);
  const canvas = await page.getByTestId('tme-canvas').boundingBox();
  if (canvas === null) throw new Error('canvas host not visible');
  const headBox = await page.getByTestId('tme-route-float-head').boundingBox();
  if (headBox === null) {
    // B-D3 (PROPOSAL-D §3.1, cited): a placement no longer opens the
    // property panel, so at shell widths (>=1024) the route content's own
    // auto-open claims the CONTEXT DOCK (the D-2 occupant rule) — the route
    // never floats and there is nothing to park; the stage is clear by
    // construction (the dock is in-flow beside it). Presence-probed, never
    // a mirrored breakpoint (the B-D1 law): the park still runs in the
    // 700–1023 band, where the route floats over the stage.
    return;
  }
  await page.mouse.move(headBox.x + headBox.width / 2, headBox.y + headBox.height / 2);
  await page.mouse.down();
  // To the upper-right of the stage — clear of both corner anchors and of
  // every aim these cells re-derive (probe-measured at the project viewport).
  await page.mouse.move(canvas.x + canvas.width - 44, canvas.y + 150, { steps: 4 });
  await page.mouse.up();
  await settle(page);
};

/**
 * A coverage-clear gesture start: re-derives the aim FRESH, checks it
 * against the live bands, dodges while covered, and returns the clear
 * point for the caller's own gesture (the drag cell's start). Fails with
 * the geometry when the corridor cannot fit. B-141 re-baseline (docs/
 * ui-restyle/REPAIRS.md R1, deliberate, cited): the route floater's
 * staggered anchor removed the desktop's old lucky geometry — the blind
 * desktop start was safe only while the route floater sat UNDER the
 * same-anchored property panel — so the BOTH-VIEWPORT guard runs here now
 * (the same machinery the phone project has always exercised; the clear
 * path is byte-identical to the old plain aim).
 */
const clearAimed = async (page: Page, aim: () => Promise<Point>): Promise<Point> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const pt = await aim();
    const boxes = await coveringBands(page);
    if (
      ![boxes.chip, boxes.prop, boxes.route, boxes.rail, boxes.arc].some((band) =>
        bandCovers(pt, band),
      )
    ) {
      return pt;
    }
    await dodgeBands(page, [pt], boxes);
  }
  const pt = await aim();
  const boxes = await coveringBands(page);
  throw new Error(
    `clearAimed: the aim point (${Math.round(pt.x)},${Math.round(pt.y)}) stays covered — chip=${boxes.chip?.top ?? 'x'} prop=${boxes.prop?.top ?? 'x'} route=${boxes.route?.top ?? 'x'} rail=${boxes.rail?.top ?? 'x'} arc=${boxes.arc?.top ?? 'x'}`,
  );
};

/**
 * The `phone` project is WebKit (iPhone 13), where CDP touch input does not
 * exist, and the touchscreen API has no drag primitive — the drag families
 * below run on a twin Chromium page with the SAME iPhone 13 emulation
 * (interactions.e2e-spec.ts pattern).
 */
const withPhoneChromiumPage = async (run: (page: Page) => Promise<void>): Promise<void> => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
    await run(page);
  } finally {
    await browser.close();
  }
};

/**
 * One-finger drag through CDP Input.dispatchTouchEvent — the twin's touch
 * input path (the touchscreen API has no drag primitive).
 */
const cdpTouchDrag = async (cdp: CDPSession, from: Point, dx: number, dy: number): Promise<void> => {
  const steps = 6;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  });
  await sleep(40);
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps }],
    });
    await sleep(25);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

/**
 * The drag gesture per project: on the phone project's page (the twin,
 * touch-emulated Chromium) through CDP touch input; on the desktop page
 * through the mouse API. A node drag in editor mode releases through `free`
 * → persist (R2: facade.upsertNode is the only mutation).
 */
const dragAt = async (page: Page, from: Point, dx: number, dy: number): Promise<void> => {
  if (isPhone()) {
    const cdp = await page.context().newCDPSession(page);
    await cdpTouchDrag(cdp, from, dx, dy);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
    await page.mouse.up();
  }
};

test.describe('editor mode: place, move, and the F45 save bar (PKG B-116)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
  });

  test('empty-canvas tap in editor mode places an authored node, selected with the C23 default label (F45/D75/C5/C23/§5 Phase 3 M1)', async ({
    page,
  }) => {
    const toggle = page.getByTestId('tme-editor-toggle');
    const dock = page.getByTestId('tme-save-dock');

    await expect(toggle).toHaveAttribute('aria-pressed', 'false'); // view mode default
    await expect(dock).toBeHidden(); // a fresh load carries no unsaved edits (F45)

    await activate(toggle);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true'); // pressed state (R3)

    // The editor gesture: an empty-canvas tap places an authored node.
    await tapModelPoint(page, BG_MODEL_POINT);

    await expect
      .poll(async () => (await readLabels(page)).filter((label) => label === NEW_PLACE))
      .toHaveLength(1);
    // C5/D75 id discovery: the placed node IS the selection — the engine's
    // id, read live through the seam (never predicted by the test).
    await expect.poll(readSelectedId.bind(null, page)).not.toBeNull();
    const placedId = await readSelectedId(page);
    if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(NEW_PLACE); // C23 plain words

    // F45: the FIRST edit shows the unsaved indicator and its Save button.
    await expect(dock).toBeVisible();
    await expect(page.getByTestId('tme-unsaved')).toHaveText('Unsaved changes');
    await expect(page.getByTestId('tme-save')).toBeVisible();
  });

  test('editor drag of the placed node persists the position across exit/re-enter AND a projection rebuild (D75/F45/R4)', async ({
    page,
  }) => {
    const editorDragAndPersist = async (p: Page): Promise<void> => {
      await activate(p.getByTestId('tme-editor-toggle'));
      await tapModelPoint(p, BG_MODEL_POINT);
      await expect(p.getByTestId('tme-selection-chip')).toBeVisible();
      await expect.poll(readSelectedId.bind(null, p)).not.toBeNull();
      const placedId = await readSelectedId(p);
      if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');

      // B-141 re-baseline: the placed node's selection staggered the unplaced
      // route floater onto the opposite corner of the property panel — over
      // this node's low-left aim — so the cell parks the floater (D10) before
      // any gesture derives coordinates.
      await parkRouteFloater(p);
      // Settle + aim FRESH: the selection may auto-expand the route sheet at
      // phone width (B-114), re-fitting the view — gestures inside that
      // window would aim at stale coordinates.
      await settle(p);
      const modelBefore = expectModelPosition(await readModelPosition(p, placedId));
      // B-133c (D91) guard, retained: the drag start must be coverage-clear
      // before the touch drag. B-D3 (PROPOSAL-D §3.1, cited): a placement no
      // longer opens the property sheet — the parked popover resolves at the
      // drag's first pointerdown (an empty input cancels, D10) — so the
      // guard here is defense in depth, not the live fix it was.
      const start = await clearAimed(p, () => nodeScreenPoint(p, placedId));
      // Horizontal-only drag: the node stays inside the fitted bounding box,
      // so the post-move fitView is a no-op and the reads stay deterministic.
      await dragAt(p, start, 60, 0);
      // D75: `free` persisted the released position — poll the MODEL write.
      await expect
        .poll(async () => (await readModelPosition(p, placedId))?.x ?? Number.NEGATIVE_INFINITY)
        .toBeGreaterThan(modelBefore.x + 30);
      const dragged = expectModelPosition(await readModelPosition(p, placedId));
      await expect(p.getByTestId('tme-save-dock')).toBeVisible(); // the edit is dirty (F45)

      // D75/F45: exit editor — the save dock SURVIVES the toggle (edits live
      // in the core's dirty flag, not in editor mode).
      await activate(p.getByTestId('tme-editor-toggle'));
      await expect(p.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'false');
      await expect(p.getByTestId('tme-save-dock')).toBeVisible();

      // Re-enter: the persisted position is unchanged.
      await activate(p.getByTestId('tme-editor-toggle'));
      await expect(p.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
      const modelAfterReenter = expectModelPosition(await readModelPosition(p, placedId));
      expect(modelAfterReenter).toEqual(dragged);

      // R4 persistence proof: a layer switch re-derives the projection from
      // the AUTHORED map — had the drag not persisted, the node would snap
      // back to its pre-drag position here. B-D1 (PROPOSAL-D §2.1 + B-D1):
      // the regime-aware switch (rail button below 1024, manager row-name in
      // the shell).
      await switchToLayer(p, 'tme-layer-layer-misaki', 'Misaki Town');
      await expect.poll(() => readLabels(p)).toEqual(['Misaki Town']);
      await switchToLayer(p, 'tme-layer-layer-fuyuki', 'Fuyuki City');
      await expect.poll(() => readLabels(p)).toContain(NEW_PLACE);
      const modelAfterRebuild = expectModelPosition(await readModelPosition(p, placedId));
      expect(modelAfterRebuild).toEqual(dragged);
    };
    if (isPhone()) await withPhoneChromiumPage(editorDragAndPersist);
    else await editorDragAndPersist(page);
  });

  test('the F45 save bar: the indicator appears on the first edit, the Save button clears it (F45/C29/D75)', async ({
    page,
  }) => {
    const dock = page.getByTestId('tme-save-dock');
    const toggle = page.getByTestId('tme-editor-toggle');

    await expect(dock).toBeHidden(); // nothing edited yet
    await activate(toggle);
    await tapModelPoint(page, BG_MODEL_POINT); // first edit
    await expect(dock).toBeVisible();

    // F52/D53: the editor chrome's controls are real tap targets at both
    // viewports (the B-114 sweep's swept states never enter the editor, so
    // this cell pins the sizes for the editor state too).
    for (const testid of ['tme-editor-toggle', 'tme-save']) {
      const box = await page.getByTestId(testid).boundingBox();
      expect(box, `${testid} is on the touch surface`).not.toBeNull();
      expect(box?.height ?? 0, `${testid} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0, `${testid} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }

    // F45: unsaved edits survive exiting editor mode — the dock stays.
    await activate(toggle);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(dock).toBeVisible();

    // Save: the dirty flag clears, the indicator goes away, and the placed
    // node is still on the canvas (the saved edits are live now).
    await activate(page.getByTestId('tme-save'));
    await expect(dock).toBeHidden();
    await expect.poll(() => readLabels(page)).toContain(NEW_PLACE);
  });

  test('view mode: node drag moves nothing (D10/C4 — dragging is editor-only)', async ({ page }) => {
    const viewDragMovesNothing = async (p: Page): Promise<void> => {
      // Fresh page: still in view mode (the toggle is unpressed).
      await expect(p.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'false');
      await settle(p);
      const before = expectModelPosition(await readModelPosition(p, EMIYA_ID));
      const start = await nodeScreenPoint(p, EMIYA_ID);
      await dragAt(p, start, 60, 6);
      // The map is the AUTHOR's truth in view mode: no drag moves the model
      // position (an exact, pan/zoom-independent assertion — D10/C4).
      const after = expectModelPosition(await readModelPosition(p, EMIYA_ID));
      expect(after).toEqual(before);
      // The drag wrote no selection either (a drag is not a tap — D2).
      await expect(p.getByTestId('tme-selection-chip')).toBeHidden();
    };
    if (isPhone()) await withPhoneChromiumPage(viewDragMovesNothing);
    else await viewDragMovesNothing(page);
  });

  test('editor lifecycle sweep keeps the harness console clean (§6.2)', async ({ page }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    // Native-API sweep only (no CDP on the phone project's WebKit page): a
    // full editor round trip — enter, place, exit, re-enter, save.
    await activate(page.getByTestId('tme-editor-toggle'));
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect.poll(() => readLabels(page)).toContain(NEW_PLACE);
    await activate(page.getByTestId('tme-editor-toggle')); // exit (unsaved survives)
    await activate(page.getByTestId('tme-editor-toggle')); // re-enter
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();

    expect(bad, 'no console errors/warnings/pageerrors during the editor sweep').toEqual([]);
  });
});
