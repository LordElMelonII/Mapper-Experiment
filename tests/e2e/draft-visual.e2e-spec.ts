// tests/e2e/draft-visual.e2e-spec.ts — PKG B-121: the unsaved-element DRAFT
// visual (R21 ruling D77) — nodes AND arcs with unsaved edits render one
// light draft treatment, tracked by a viewer-side edit log cleared by
// saveMap/loadMap. Runs at BOTH playwright projects (desktop + emulated
// phone with touch) per D53/F52; the drag cells run the touch gestures
// through the Chromium-twin pattern (WebKit's iPhone 13 emulation cannot
// drive CDP touch gestures — see interactions.e2e-spec.ts).
//
// Cited IDs:
//   D77 (R21 ruling) — nodes AND arcs with unsaved edits render a LIGHT
//          draft treatment, ONE visual language across both kinds (the
//          same pale paper hue: a node's outline, an arc's line); the
//          viewer tracks unsaved ids in an edit log fed by the commands it
//          issued (viewer-side; saveMap/loadMap reset it) with deliberately
//          NO new facade surface.
//   D75/F45 — editor commands mark only `dirty`: the edits RENDER (the
//          projection reads the live map) but go live only after saveMap.
//          The draft visual is exactly that rendered truth: unsaved ≠
//          invisible, it is visibly-not-yet-saved. The save dock keeps
//          reading the facade's hasUnsavedChanges — the log and the bar are
//          independent seams pinned side by side here.
//   C5/D75 — engine-assigned ids are read live through the seam, never
//          predicted (the placed node IS the selection; each committed
//          quick-connect arc is an edgeIds delta).
//   D7/R1 spirit — the class is projected, the stylesheet computes: all
//          style assertions are RESOLVED style reads (the B-111
//          testEdgeCurveStyle precedent), with cytoscape's runtime color
//          normalization asserted in rgb() form.
//   Cytoscape cascade (B-111 precedent, binding) — the stylesheet has NO
//          CSS specificity: matching rules apply in declaration order and
//          the LAST match per property wins, so `tme-draft` is declared
//          BEFORE the pin/selected/blocked accents — those accents still
//          override the draft's border/line while the element carries both
//          classes. Pinned two ways: structurally (the selector-order seam)
//          and behaviorally (a drafted+selected node resolves GOLD; a
//          drafted pin node resolves the pin's dark border).
//   A-014 (D75 amendment) — setBlocked's ADD path refuses unsaved library
//          arcs, so an edge carrying BOTH tme-draft and tme-blocked is not
//          reachable through today's command surface (quick-connect arcs
//          are library-plane; arc EDITING commands land in B-122/B-123).
//          The blocked-wins half of the cascade is therefore pinned here
//          structurally (edge.tme-draft precedes edge.tme-blocked in the
//          declaration order) plus behaviorally on the reachable neighbor:
//          FX1's authored blocked arc keeps its dashed red style while
//          drafts are on canvas — the draft projection never leaks onto
//          non-drafted elements. The combined-class behavioral cell lands
//          with the arc-editing packets.
//   C2/D20 — the authored blocked arc stays drawn, dashed and distinct at
//          every step (blocked state is the merge the projection reads).
//   D21 — overlay waypoints are chat state, never dirty, NEVER drafted:
//          placing one leaves the log empty (and the kNN `we-` edges with
//          it).
//   D53/F52/§6.2 — every gesture is touch-alone capable; the phone cell
//          pins the 375px geometry with no horizontal overflow; the
//          journey cell keeps the harness console clean.
//
// FX1 facts (data/worlds/fuyuki.ts): 'emiya-residence' is the pin AND an
// authored leaf (an editor drag persists its position — the drafted+pin
// cascade cell); 'arc-emiya-residence-fuyuki-bridge' is FX1's authored
// blocked sample; 'outskirts' and 'einzbern-castle' are parentless leaves
// (the quick-connect flow's vetted source and clear-tap target).
import { chromium, devices, expect, test, type CDPSession, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeModelPosition(id: string): { x: number; y: number } | null;
  selectedNodeId(): string | null;
  nodeHasClass(id: string, cls: string): boolean;
  edgeIds(): string[];
  edgeLineStyle(id: string): string | null;
  zoom(): number;
  pan(): { x: number; y: number };
  /** B-121 (D77): the edit log's ids — the draft visual's state seam. */
  draftedIds(): string[];
  /** B-121 (D77): resolved border-color of one node, or null (cascade pin). */
  nodeBorderColor(id: string): string | null;
  /** B-121 (D77): resolved line-color of one edge, or null (cascade pin). */
  edgeLineColor(id: string): string | null;
  /** B-121 (D77): the stylesheet's selectors in declaration order. */
  stylesheetSelectors(): string[];
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';
const EMIYA_ID = 'emiya-residence'; // the pin — the drafted+pin cascade cell
const OUTSKIRTS_ID = 'outskirts'; // parentless location leaf — connect source
const CASTLE_ID = 'einzbern-castle'; // isolated corner leaf — clear taps at both fits
const NEW_PLACE = 'New place'; // C23 default label, verbatim
const BLOCKED_ARC = 'arc-emiya-residence-fuyuki-bridge'; // FX1's authored blocked sample

/**
 * The draft/accent palette as the RUNTIME resolves it — cytoscape
 * normalizes stylesheet hex literals to `rgb(r,g,b)` strings (verified live
 * against the installed 3.34.3: '#ffd166' reads back 'rgb(255,209,102)').
 * DRAFT is the one pale paper hue D77's "light" ruling is implemented with
 * ('#f4f1e8' — src/app/graph/graph.service.ts DRAFT_ACCENT).
 */
const GOLD_SELECTED = 'rgb(255,209,102)'; // node.tme-selected
const PIN_DARK = 'rgb(29,35,43)'; // node.tme-pin's border
const DRAFT = 'rgb(244,241,232)'; // node.tme-draft / edge.tme-draft — '#f4f1e8'
const BLOCKED_RED = 'rgb(201,86,78)'; // edge.tme-blocked — '#c9564e'
const BASE_EDGE = 'rgb(143,160,181)'; // the plain `edge` default — '#8fa0b5'

/**
 * The B-109-vetted clear background point in MODEL coordinates (see
 * waypoints.e2e-spec.ts's exhaustive scan): inside the fitted bounding box,
 * >60 model units from every node center, edge segment, compound box and
 * badge at BOTH projects' fits.
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };

const isPhone = (): boolean => test.info().project.name === 'phone';

// page.evaluate callbacks are SERIALIZED: the hook lookup is inlined in
// each one — no module-scope closures cross the wire (interactions spec
// precedent).

const readDraftedIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.draftedIds();
  });

const readNodeBorderColor = (page: Page, id: string): Promise<string | null> =>
  page.evaluate(
    (nodeId): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeBorderColor(nodeId);
    },
    id,
  );

const readEdgeLineColor = (page: Page, id: string): Promise<string | null> =>
  page.evaluate(
    (edgeId): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.edgeLineColor(edgeId);
    },
    id,
  );

const readEdgeLineStyle = (page: Page, id: string): Promise<string | null> =>
  page.evaluate(
    (edgeId): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.edgeLineStyle(edgeId);
    },
    id,
  );

const readSelectors = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.stylesheetSelectors();
  });

const readEdgeIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.edgeIds();
  });

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

const readModelPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeModelPosition(nodeId);
    },
    id,
  );

const readSelectedId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.selectedNodeId();
  });

const readNodeHasClass = (page: Page, id: string, cls: string): Promise<boolean> =>
  page.evaluate(
    ({ nodeId, className }): boolean => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeHasClass(nodeId, className);
    },
    { nodeId: id, className: cls },
  );

/**
 * Wait two animation frames: panel open/close and the ResizeObserver-driven
 * re-fit run just before the next paint — reads and gestures inside that
 * window would aim at stale coordinates (the settle precedent).
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
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
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
 * panel joins the bands. Diagnosed live on this spec's move cell: the
 * placed node's selection opens the property sheet over the lower stage —
 * the DRAG START sat under it (probe: the aim answered the panel's label
 * input) and the CDP touch drag moved nothing (the model-x poll never
 * crossed its threshold). The dodge is ONE background mouse drag (a drag
 * is not a tap — no selection, no placement, the draft log untouched); its
 * start is a live clear-canvas point clear of every rendered node
 * (editor-mode drags grab nodes). Phone-only (D53): desktop stays
 * byte-identical.
 */
const DV_NODE_IDS = [
  'einzbern-castle',
  'ryuudou-temple',
  'outskirts',
  'emiya-residence',
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
  let panDy = 0;
  for (const band of [boxes.prop, boxes.route, boxes.rail, boxes.arc]) {
    if (band === null) continue;
    for (const t of aims) {
      if (t.y > band.top - 16) panDy = Math.min(panDy, band.top - 16 - t.y);
    }
  }
  if (boxes.chip !== null) {
    const chip = boxes.chip;
    for (const t of aims) {
      if (t.x + 22 > chip.left && t.y + 22 > chip.top && t.y - 22 < chip.top + chip.height) {
        panDy = Math.min(panDy, chip.top + chip.height + 16 - t.y);
      }
    }
  }
  const topFloor = Math.max(
    ...[boxes.header, boxes.breadcrumb, boxes.chip].map((b) => (b === null ? 0 : b.top + b.height)),
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
    // node (only the down point matters — cytoscape captures the pointer).
    const start = await page.evaluate(
      ({ canvasBox, top, floor, ids }): Point | null => {
        const hook = (window as unknown as {
          __TME_E2E__?: { nodeRenderedPosition(id: string): { x: number; y: number } | null };
        }).__TME_E2E__;
        if (hook === undefined) return null;
        const bands = [top.prop, top.route, top.rail, top.arc].filter((b) => b !== null);
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
        ids: [...DV_NODE_IDS],
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
 * A coverage-clear gesture start: re-derives the aim FRESH, checks it
 * against the live bands, dodges while covered, and returns the clear
 * point for the caller's own gesture (the drag cell's start). Fails with
 * the geometry when the corridor cannot fit. Phone-only (D53): desktop
 * returns the plain aim.
 */
const clearAimed = async (page: Page, aim: () => Promise<Point>): Promise<Point> => {
  if (!isPhone()) return aim();
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
 * exist — the drag cell below runs on a twin Chromium page with the SAME
 * iPhone 13 emulation (interactions.e2e-spec.ts pattern).
 */
const withPhoneChromiumPage = async (run: (page: Page) => Promise<void>): Promise<void> => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
    await run(page);
  } finally {
    await browser.close();
  }
};

/** One-finger drag through CDP Input.dispatchTouchEvent — the twin's path. */
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
  // The B-116 learned pause: hold ~200ms before touchEnd or Chromium
  // silently drops the NEXT tap's click (~40% repro — AGENTS.md e2e gotchas).
  await sleep(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

/** The drag gesture per project: CDP touch on the twin, mouse on desktop. */
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

test.describe('unsaved-element draft visual (PKG B-121, D77)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
    // D77: a fresh load carries NO drafted elements — the log starts empty.
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([]);
  });

  test('place ⇒ drafted: the node renders the light treatment; the SELECTION accent wins while selected; dismiss reveals the draft; save clears it (D77/D75/F45)', async ({
    page,
  }) => {
    await activate(page, 'tme-editor-toggle');
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect.poll(() => readLabels(page)).toContain(NEW_PLACE);
    await expect.poll(readSelectedId.bind(null, page)).not.toBeNull();
    const placedId = await readSelectedId(page);
    if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');

    // D77: the placed node is in the edit log and carries the draft class.
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([placedId]);
    expect(await readNodeHasClass(page, placedId, 'tme-draft')).toBe(true);
    // The cascade (B-111 precedent): the placed node is ALSO selected, and
    // the accent — declared AFTER the draft entry — wins border-color. The
    // draft survives underneath, erased by nothing.
    expect(await readNodeHasClass(page, placedId, 'tme-selected')).toBe(true);
    expect(await readNodeBorderColor(page, placedId)).toBe(GOLD_SELECTED);

    // Dismiss the selection (the chip): the accent leaves, the draft
    // treatment IS what remains — visibly-not-yet-saved (F45's rendered
    // truth).
    await activate(page, 'tme-selection-chip');
    await expect.poll(readSelectedId.bind(null, page)).toBeNull();
    expect(await readNodeHasClass(page, placedId, 'tme-draft')).toBe(true);
    await expect.poll(() => readNodeBorderColor(page, placedId)).toBe(DRAFT);

    // The F45 dock and the log are independent seams: the dock reads the
    // facade's dirty flag and shows for the same unsaved edit (D75).
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    // Save: the log clears whole, the class comes off, the border returns
    // to the plain default — and the node itself stays (its edits are LIVE
    // now, F45). saveMap performs NO rebuild: the class-only pass must
    // leave every other property untouched.
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([]);
    await expect.poll(() => readNodeHasClass(page, placedId, 'tme-draft')).toBe(false);
    await expect.poll(() => readNodeBorderColor(page, placedId)).toBe('rgb(174,189,211)');
    await expect.poll(() => readLabels(page)).toContain(NEW_PLACE);
  });

  test('move ⇒ still drafted: an editor drag of the placed node keeps the log entry (D77/D75)', async ({
    page,
  }) => {
    const moveKeepsDraft = async (p: Page): Promise<void> => {
      await activate(p, 'tme-editor-toggle');
      await tapModelPoint(p, BG_MODEL_POINT);
      await expect.poll(readSelectedId.bind(null, p)).not.toBeNull();
      const placedId = await readSelectedId(p);
      if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');
      await expect.poll(readDraftedIds.bind(null, p)).toEqual([placedId]);

      // Settle + aim FRESH (the selection may re-fit at phone width); the
      // BEFORE model read must precede the drag (editor-place-move order).
      await settle(p);
      const modelBefore = await readModelPosition(p, placedId);
      if (modelBefore === null) throw new Error('placed node absent before drag');
      // B-133c (D91): the property sheet is open over the lower stage — the
      // drag start must be coverage-clear before the touch drag (probe: the
      // placed node's aim answered the panel's label input).
      const start = await clearAimed(p, () => nodeScreenPoint(p, placedId));
      await dragAt(p, start, 60, 0);
      // D75: `free` persisted the released position — poll the MODEL write.
      await expect
        .poll(async () => (await readModelPosition(p, placedId))?.x ?? Number.NEGATIVE_INFINITY)
        .toBeGreaterThan(modelBefore.x + 30);
      // D77: the MOVE records the same id again (a Set — still one entry):
      // a moved-but-unsaved node stays drafted.
      await expect.poll(readDraftedIds.bind(null, p)).toEqual([placedId]);
      expect(await readNodeHasClass(p, placedId, 'tme-draft')).toBe(true);
      await expect(p.getByTestId('tme-save-dock')).toBeVisible();
    };
    if (isPhone()) await withPhoneChromiumPage(moveKeepsDraft);
    else await moveKeepsDraft(page);
  });

  test('a drafted PIN node keeps the pin accent — the accent family wins over the draft (D77 cascade, B-111 precedent)', async ({
    page,
  }) => {
    const pinWinsOverDraft = async (p: Page): Promise<void> => {
      await activate(p, 'tme-editor-toggle');
      // Drag the pin's AUTHORED node (an ordinary editor move, D75): the
      // node enters the log — drafted AND pinned at once.
      await settle(p);
      const modelBefore = await readModelPosition(p, EMIYA_ID);
      if (modelBefore === null) throw new Error('pin node not rendered before drag');
      const start = await nodeScreenPoint(p, EMIYA_ID);
      await dragAt(p, start, 40, 0);
      // D75: `free` persisted the released position — poll the MODEL write.
      await expect
        .poll(async () => (await readModelPosition(p, EMIYA_ID))?.x ?? Number.NEGATIVE_INFINITY)
        .toBeGreaterThan(modelBefore.x + 10);
      await expect.poll(readDraftedIds.bind(null, p)).toEqual([EMIYA_ID]);
      expect(await readNodeHasClass(p, EMIYA_ID, 'tme-draft')).toBe(true);
      expect(await readNodeHasClass(p, EMIYA_ID, 'tme-pin')).toBe(true);
      // node.tme-pin is declared AFTER node.tme-draft: the pin's dark
      // border wins — the draft does not erase the wayfinding accent.
      await expect.poll(() => readNodeBorderColor(p, EMIYA_ID)).toBe(PIN_DARK);
    };
    if (isPhone()) await withPhoneChromiumPage(pinWinsOverDraft);
    else await pinWinsOverDraft(page);
  });

  test('quick-connect arcs ⇒ drafted: each committed arc renders the light line; save clears ALL elements; the authored blocked arc keeps its blocked style throughout (D77/D42/C2/A-014 note)', async ({
    page,
  }) => {
    const edgesBefore = await readEdgeIds(page);

    // The B-118 flow: editor → select the source → Connect → pick → Done.
    await activate(page, 'tme-editor-toggle');
    await tapPoint(page, await nodeScreenPoint(page, OUTSKIRTS_ID));
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await activate(page, 'tme-node-connect');
    await expect(page.getByTestId('tme-connect-from')).toBeVisible();
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect(page.getByTestId('tme-connect-count')).toHaveText('1 place picked');
    await activate(page, 'tme-connect-done');
    const createdIds = (await readEdgeIds(page)).filter((id) => !edgesBefore.includes(id));
    expect(createdIds, 'one arc per picked target (C4)').toHaveLength(1);
    const arcId = createdIds[0];

    // D77: EACH committed arc's engine-assigned id is in the log (read
    // live, never predicted — C5/D75), the edge carries the draft class and
    // resolves the light line — the same hue as the node outline, one
    // visual language across both kinds.
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([arcId]);
    await expect.poll(() => readEdgeLineColor(page, arcId)).toBe(DRAFT);

    // C2/D20 + the draft-projection fence: FX1's authored blocked arc —
    // NOT in the log — keeps its own style while drafts are on canvas; the
    // draft never leaks onto non-drafted elements. (An edge carrying BOTH
    // classes needs an arc-EDITING command — A-014 gates setBlocked on
    // unsaved library arcs — so the blocked-wins OVERRIDE itself is pinned
    // structurally in the cascade-order cell below; B-122/B-123 land the
    // combined-class behavioral cell.)
    await expect.poll(() => readEdgeLineStyle(page, BLOCKED_ARC)).toBe('dashed');
    await expect.poll(() => readEdgeLineColor(page, BLOCKED_ARC)).toBe(BLOCKED_RED);

    // Save: the log clears WHOLE — arcs and nodes alike — and the created
    // arc's line returns to the plain default (its edits are live, F45).
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([]);
    await expect.poll(() => readEdgeLineColor(page, arcId)).toBe(BASE_EDGE);
    // The blocked arc is untouched by the save (authored state, C2).
    await expect.poll(() => readEdgeLineColor(page, BLOCKED_ARC)).toBe(BLOCKED_RED);
  });

  test('the cascade declaration order: tme-draft precedes every accent entry (D77 binding rule, B-111 precedent)', async ({
    page,
  }) => {
    const selectors = await readSelectors(page);
    const at = (selector: string): number => {
      const index = selectors.indexOf(selector);
      expect(index, `${selector} is declared in GRAPH_STYLESHEET`).toBeGreaterThanOrEqual(0);
      return index;
    };
    // Nodes: draft BEFORE pin/selected/connect-pick — those accents can
    // still override the draft's border on a both-class element.
    expect(at('node.tme-draft')).toBeLessThan(at('node.tme-pin'));
    expect(at('node.tme-draft')).toBeLessThan(at('node.tme-selected'));
    expect(at('node.tme-draft')).toBeLessThan(at('node.tme-connect-pick'));
    // Edges: draft BEFORE blocked/edge-selected — the same override rule
    // for a drafted blocked or selected arc (the A-014-unreachable
    // combined state's structural pin until B-122/B-123).
    expect(at('edge.tme-draft')).toBeLessThan(at('edge.tme-blocked'));
    expect(at('edge.tme-draft')).toBeLessThan(at('edge.tme-edge-selected'));
    // The badge draft entry follows the badge base (its subdued text color
    // must be overridable) and never touches the cull entries' property.
    expect(at('node.tme-badge')).toBeLessThan(at('node.tme-badge.tme-draft'));
  });

  test('loadMap resets the log: a reload carries no drafted elements and discards the unsaved edit (D77/D75)', async ({
    page,
  }) => {
    await activate(page, 'tme-editor-toggle');
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect.poll(readDraftedIds.bind(null, page)).toHaveLength(1);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    // A reload runs the harness's loadMap (App constructor →
    // graphService.loadMap): the fresh load carries no unsaved edits and
    // the draft log is empty — the unsaved node itself is gone with them
    // (F45: unsaved edits never survive the session).
    await page.reload();
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([]);
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(() => readLabels(page)).not.toContain(NEW_PLACE);
  });

  test('view mode drafts nothing; a placed WAYPOINT never enters the log — chat state, never dirty (D77/D21)', async ({
    page,
  }) => {
    // Fresh view mode: FX1's authored content, nothing drafted.
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([]);
    expect(await readNodeHasClass(page, EMIYA_ID, 'tme-draft')).toBe(false);
    await expect.poll(() => readEdgeLineColor(page, BLOCKED_ARC)).toBe(BLOCKED_RED); // authored style, untouched

    // B-120 (D76): editor + Waypoint tool places a chat waypoint (kNN and
    // all). D21: it is chat state — never dirty, never an editor draft:
    // neither the waypoint nor its `we-` edges enter the log.
    const edgesBefore = await readEdgeIds(page);
    await activate(page, 'tme-editor-toggle');
    await activate(page, 'tme-tool-waypoint');
    await expect(page.getByTestId('tme-tool-waypoint')).toHaveAttribute('aria-pressed', 'true');
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect
      .poll(async () => (await readEdgeIds(page)).length - edgesBefore.length)
      .toBeGreaterThanOrEqual(1); // the C7 kNN edges exist…
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([]); // …and none of it is drafted
    await expect(page.getByTestId('tme-save-dock')).toBeHidden(); // never dirty (D21)

    // Back in view mode: still nothing drafted (overlay waypoints are not
    // editor drafts at ANY time).
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([]);
  });

  test('phone: the draft machinery and cascade resolve at 375px with no layout overflow (F52/D53)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the 375px geometry check belongs to the phone project (D53)');
    await page.setViewportSize({ width: 375, height: 667 });

    await activate(page, 'tme-editor-toggle');
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect.poll(readSelectedId.bind(null, page)).not.toBeNull();
    const placedId = await readSelectedId(page);
    if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');
    // The draft class + the accent override resolve identically at the
    // phone viewport — the treatment is not desktop-only paint.
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([placedId]);
    expect(await readNodeHasClass(page, placedId, 'tme-draft')).toBe(true);
    await expect.poll(() => readNodeBorderColor(page, placedId)).toBe(GOLD_SELECTED); // accent wins
    await activate(page, 'tme-selection-chip');
    await expect.poll(() => readNodeBorderColor(page, placedId)).toBe(DRAFT); // the light shows

    // D53: never horizontal scroll at 375px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);
  });

  test('the draft journey keeps the harness console clean (§6.2/D53)', async ({ page }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    // Native-API sweep only (no CDP on the phone project's WebKit page):
    // place, move on (dismiss), connect one arc, save — the whole draft
    // lifecycle.
    const edgesBefore = await readEdgeIds(page);
    await activate(page, 'tme-editor-toggle');
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect.poll(readDraftedIds.bind(null, page)).toHaveLength(1);
    await activate(page, 'tme-selection-chip');
    await tapPoint(page, await nodeScreenPoint(page, OUTSKIRTS_ID));
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await activate(page, 'tme-node-connect');
    await expect(page.getByTestId('tme-connect-from')).toBeVisible();
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await activate(page, 'tme-connect-done');
    await expect
      .poll(async () => (await readEdgeIds(page)).length - edgesBefore.length)
      .toBe(1);
    await expect.poll(readDraftedIds.bind(null, page)).toHaveLength(2); // the node AND the arc
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([]);

    expect(bad, 'no console errors/warnings/pageerrors during the draft journey').toEqual([]);
  });
});
