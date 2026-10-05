// tests/e2e/draw-arc.e2e-spec.ts — PKG B-122: the third editor tool Arc
// (§5 Phase 3 M2 draw-arc) — with it active, an editor-mode tap on an
// authored leaf PICKS the arc source (a distinct accent, never a selection),
// the second tap on a different eligible leaf commits ONE authored arc via
// facade.upsertEdge with the map's default-allowed modes, selects it (the
// arc panel opens) and leaves the tool on for consecutive arcs. Runs at BOTH
// playwright projects (desktop + emulated phone with touch) per D53/F52;
// the pinch cell runs through the Chromium-twin pattern (WebKit's iPhone 13
// emulation cannot drive CDP touch gestures — see interactions.e2e-spec.ts).
//
// Cited IDs:
//   §5 Phase 3 M2 (draw-arc clause) — "draw-arc mode (tap/click source →
//          target) … operable by touch alone (D53)". This spec pins the
//          DRAWING gesture + the commit; the toggles/terrain/overrides/
//          curve/measure UX is B-123's, not here.
//   D76/B-120 — the tool regime draw-arc joins: editor-mode-only, same
//          segmented control, default 'node' reset on entry, and with the
//          Arc tool active the editor background tap is NEVER a placement
//          (the tool owns the gesture — it cancels the pending pick).
//   D42/D78 — the committed arc's mode set: the map's default-allowed
//          derivation (built-ins unless an adopting registry entry opts out,
//          plus every allowedByDefault registry entry). FX1 has no registry,
//          so it is exactly the D42 quick-connect defaults: all three
//          built-ins allowed, geometry-priced (C14 row 5).
//   C4/D42 — parallel arcs: drawing the same pair twice commits a SIBLING
//          (no dedup — the author's truth).
//   F17/C3 — the cross-layer fence: M2 draws SAME-layer arcs only; a pick
//          that would commit cross-layer (a mid-pick layer switch) is
//          refused VISIBLY (the banner) with the pending pick KEPT.
//   D77/B-121 — the commit records at the edit-log seam: the new arc
//          renders DRAFTED until saveMap clears it.
//   F45/D75 — upsertEdge marks only `dirty`: the save dock lights, routing
//          serves the SAVED graph until Save (engine-assigned `arc-<n>` ids
//          are read live through the seam, never predicted — C5/D75).
//   F46 — picks are not selections: the pending source carries a DISTINCT
//          class (tme-draw-pick), never tme-selected; no selection is
//          written while picking (the commit's edgeSelection is the arc
//          panel's regime, not a node selection).
//   D21 — waypoints are chat state, never arc endpoints: a waypoint tap
//          with a pending pick is a no-op that KEEPS the pick.
//   R21 ruling 1/B-120 — the commit NEVER fits: zoom and pan are untouched
//          (exact equality) while zoomed, the editor-place-move pin's
//          discipline (the pin starts AFTER the panel-open RO refit settles
//          — that chain is B-112's, not under pin here).
//   D53/F52/§6.2 — every gesture touch-alone capable at the phone viewport,
//          every control >= 44px, no horizontal scroll at 375px, console
//          clean.
//
// FX1 facts (data/worlds/fuyuki.ts): 'einzbern-castle' is the isolated
// corner leaf (vetted clear-tap target at both fits, one incident arc, none
// to 'ryuudou-temple'); 'ryuudou-temple' is a childless location;
// 'outskirts' is a parentless location; layer 'layer-misaki' carries the
// single leaf 'misaki-town' (a hub); the pin is 'emiya-residence'. Canvas
// aiming goes through the DEV-HARNESS-ONLY window.__TME_E2E__ seam; all aim
// math is test-side — the UI computes nothing (R1).
import { chromium, devices, expect, test, type CDPSession, type Locator, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  edgeIds(): string[];
  nodeHasClass(id: string, cls: string): boolean;
  zoom(): number;
  pan(): { x: number; y: number };
  /** B-122: the pending draw-arc source's id, or null. */
  drawArcSourceId(): string | null;
  /** B-122: the draw-arc banner's current message, or null. */
  drawArcFeedback(): string | null;
  /** B-118: authored fields of one library edge, or null (D42 assertions). */
  edgeData(id: string): { id: string; source: string; target: string; modes: string[] } | null;
  /** B-121 (D77): the edit log's ids — the draft visual's state seam. */
  draftedIds(): string[];
  /** B-121 (D77): resolved line-color of one edge, or null (cascade pin). */
  edgeLineColor(id: string): string | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';
const EMIYA_ID = 'emiya-residence'; // the pin — the harness readiness probe
const CASTLE_ID = 'einzbern-castle'; // isolated corner leaf — clear taps at both fits
const TEMPLE_ID = 'ryuudou-temple'; // childless location leaf — the first target
const OUTSKIRTS_ID = 'outskirts'; // parentless location leaf — the consecutive-arc source
const MISAKI_ID = 'misaki-town'; // the Misaki layer's single leaf (the fence cell)
const LAYER_FUYUKI = 'tme-layer-layer-fuyuki';
const LAYER_MISAKI = 'tme-layer-layer-misaki';

/**
 * The runtime-resolved colors the cascade assertions compare against
 * (cytoscape normalizes stylesheet hex literals — the B-121 precedent).
 * The committed arc is SELECTED, and edge.tme-edge-selected is declared
 * AFTER edge.tme-draft, so the gold accent wins the line while both
 * classes ride (the draft is pinned by its class + the log seam).
 */
const GOLD_SELECTED = 'rgb(255,209,102)'; // edge.tme-edge-selected — '#ffd166'
/** The plain `edge` default line — '#8fa0b5'. */
const BASE_EDGE = 'rgb(143,160,181)';

/**
 * The B-109-vetted clear background point in MODEL coordinates (see
 * waypoints.e2e-spec.ts's exhaustive scan): inside the fitted bounding box,
 * >60 model units from every node center, edge segment, compound box and
 * badge at BOTH projects' fits. The background-cancel cell taps here.
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };

const isPhone = (): boolean => test.info().project.name === 'phone';

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

const readEdgeIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.edgeIds();
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

const readEdgeData = (page: Page, id: string): Promise<TmeE2EHook['edgeData']> =>
  page.evaluate(
    (edgeId): TmeE2EHook['edgeData'] => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.edgeData(edgeId);
    },
    id,
  );

const readDraftedIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.draftedIds();
  });

const readEdgeLineColor = (page: Page, id: string): Promise<string | null> =>
  page.evaluate(
    (edgeId): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.edgeLineColor(edgeId);
    },
    id,
  );

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

/**
 * Wait two animation frames: panel open/close and the ResizeObserver-driven
 * re-fit (B-112) run just before the next paint — reads and gestures inside
 * that window would aim at stale coordinates (the settle precedent).
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
const activate = (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  return isPhone() ? locator.tap() : locator.click();
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

/** Enter editor mode and activate the Arc tool (the cells' shared prelude). */
const enterArcTool = async (page: Page): Promise<void> => {
  await activate(page, 'tme-editor-toggle');
  await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
  await activate(page, 'tme-tool-arc');
  await expect(page.getByTestId('tme-tool-arc')).toHaveAttribute('aria-pressed', 'true');
};

/**
 * FX1's same-layer leaf candidates for the zoomed cells (all childless
 * locations/hubs on layer-fuyuki — isPinEligible by construction).
 */
const LEAF_CANDIDATES = [
  'einzbern-castle',
  'ryuudou-temple',
  'outskirts',
  'homurahara-academy',
  'matou-residence',
  'tohsaka-residence',
  'shopping-district',
  'fuyuki-bridge',
  'fuyuki-station',
  'harbor',
  'kotomine-church',
  'ghost-house',
] as const;

/**
 * Two eligible leaves whose rendered centers VERIFIABLY hit the canvas —
 * after a user zoom/pan a node can render underneath the stage's fixed
 * chrome (found live: post-pinch draw taps landed on the tool control and
 * the save dock, cancelling the pick instead of committing), so the zoomed
 * cells choose their pair dynamically instead of hardcoding one. All math
 * is test-side (R1); any two distinct leaves serve the commit pin.
 */
const twoClearLeaves = async (page: Page): Promise<[string, string]> => {
  const clear: string[] = [];
  for (const id of LEAF_CANDIDATES) {
    if (clear.length === 2) break;
    const point = await nodeScreenPoint(page, id);
    const hitsCanvas = await page.evaluate((pt) => {
      const el = document.elementFromPoint(pt.x, pt.y);
      const host = document.querySelector('[data-testid="tme-canvas"]');
      return el !== null && host !== null && (el === host || host.contains(el));
    }, point);
    if (hitsCanvas) clear.push(id);
  }
  if (clear.length < 2) throw new Error('no two chrome-clear leaves found for the zoomed draw');
  return [clear[0], clear[1]];
};

/** The ids of edges created since `before` (engine ids, read live — C5/D75). */
const newEdgeIds = async (page: Page, before: readonly string[]): Promise<string[]> =>
  (await readEdgeIds(page)).filter((id) => !before.includes(id));

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The `phone` project is WebKit (iPhone 13), where CDP touch input does not
 * exist — the pinch cell below runs on a twin Chromium page with the SAME
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

/** Two-finger pinch through CDP Input.dispatchTouchEvent (the twin's path). */
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
  // The learned pause: hold ~200ms before touchEnd or Chromium silently
  // drops the NEXT tap's click (~40% repro — AGENTS.md e2e gotchas).
  await sleep(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

test.describe('draw-arc: the third editor tool (PKG B-122, §5 Phase 3 M2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
  });

  test('tap source, tap target: one default arc commits DRAFTED, the dock lights, the arc panel opens on it; save clears the draft (§5 M2/D42/D78/D77/F45)', async ({
    page,
  }) => {
    const edgesBefore = await readEdgeIds(page);
    await enterArcTool(page);

    // First tap = the PICK: a distinct accent (F46), never a selection — no
    // chip, no dirty flag, no arc yet.
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(CASTLE_ID);
    // The class is the pick signal's EFFECT projection — poll it (the signal
    // write and the class effect are separate ticks).
    await expect
      .poll(() => readNodeHasClass(page, CASTLE_ID, 'tme-draw-pick'))
      .toBe(true);
    expect(await readNodeHasClass(page, CASTLE_ID, 'tme-selected')).toBe(false);
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    expect((await newEdgeIds(page, edgesBefore)).length).toBe(0);

    // Second tap on a DIFFERENT eligible leaf = the commit: one arc with an
    // engine-assigned id, the D78 default mode set (FX1 has no registry, so
    // exactly the D42 trio), drafted (B-121), dirty (F45), selected — the
    // arc panel OPENS on it through the existing regime — and the pick
    // clears while the TOOL stays on (consecutive arcs).
    await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBeNull();
    await expect
      .poll(async () => (await newEdgeIds(page, edgesBefore)).length)
      .toBe(1);
    const createdIds = await newEdgeIds(page, edgesBefore);
    const arcId = createdIds[0];
    expect(arcId, 'the engine assigned an arc- id (C5/D75)').toMatch(/^arc-/);
    const data = await readEdgeData(page, arcId);
    expect(data?.source).toBe(CASTLE_ID);
    expect(data?.target).toBe(TEMPLE_ID);
    expect(data?.modes).toEqual(['walk', 'car', 'train']); // D42/D78 defaults — geometry-priced (C14 row 5)
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([arcId]); // B-121 seam
    await expect
      .poll(() => readNodeHasClass(page, arcId, 'tme-draft'))
      .toBe(true); // the draft class rides the edge
    // The cascade (B-111/B-121 declaration order): the commit SELECTS the
    // arc, and the selected accent (declared after the draft) wins the line
    // color while both classes ride — gold, not the draft hue.
    await expect.poll(() => readEdgeLineColor(page, arcId)).toBe(GOLD_SELECTED);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible(); // F45: the dock lights
    const panel: Locator = page.getByTestId('tme-arc-panel');
    await expect(panel).toBeVisible(); // the commit selects the arc — the panel opens
    await expect(page.getByTestId('tme-arc-endpoints')).toHaveText('Einzbern Castle ↔ Ryuudou Temple');
    await expect(page.getByTestId('tme-arc-mode-walk')).toBeVisible();
    await expect(page.getByTestId('tme-arc-open')).toBeVisible();
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden(); // an edge selection, never a node one (B-106)
    await expect(page.getByTestId('tme-property-panel')).toBeHidden();
    await expect(page.getByTestId('tme-tool-arc')).toHaveAttribute('aria-pressed', 'true'); // the tool stays on

    // Save: the arc goes live — the log clears whole (F45/D77). The arc
    // stays SELECTED (the panel survives the save), so the plain line shows
    // only after the selection clears: exit the editor and tap the
    // background in view mode (one gesture, both selections — D76).
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([]);
    await expect
      .poll(() => readNodeHasClass(page, arcId, 'tme-draft'))
      .toBe(false);
    await activate(page, 'tme-editor-toggle');
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect.poll(() => readEdgeLineColor(page, arcId)).toBe(BASE_EDGE);
  });

  test('the tool stays on: consecutive arcs, and drawing the same pair twice commits a parallel SIBLING (C4/D42 no-dedup)', async ({
    page,
  }) => {
    const edgesBefore = await readEdgeIds(page);
    await enterArcTool(page);

    // Arc 1: castle → temple.
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(CASTLE_ID);
    await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
    await expect
      .poll(async () => (await newEdgeIds(page, edgesBefore)).length)
      .toBe(1);

    // Arc 2, CONSECUTIVE — no tool re-activation, no intermediate chrome: a
    // fresh pick commits immediately (the "stay on until done" precedent).
    await tapPoint(page, await nodeScreenPoint(page, OUTSKIRTS_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(OUTSKIRTS_ID);
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect
      .poll(async () => (await newEdgeIds(page, edgesBefore)).length)
      .toBe(2);

    // Arc 3 = the PARALLEL sibling: the same endpoint pair as arc 1 commits
    // a second, distinct arc — no dedup, ever (C4: the author's truth).
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(CASTLE_ID);
    await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
    await expect
      .poll(async () => (await newEdgeIds(page, edgesBefore)).length)
      .toBe(3);
    const createdIds = await newEdgeIds(page, edgesBefore);
    const first = await readEdgeData(page, createdIds[0]);
    const sibling = await readEdgeData(page, createdIds[2]);
    expect([first?.source, first?.target].sort()).toEqual([CASTLE_ID, TEMPLE_ID].sort());
    expect([sibling?.source, sibling?.target].sort()).toEqual([CASTLE_ID, TEMPLE_ID].sort());
    expect(sibling?.id).not.toBe(first?.id); // a SIBLING, not the same arc
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
  });

  test('cancels: the source tap, the background tap (placing NOTHING), a tool switch and the editor exit each clear the pick; nothing turns dirty (D76/F46)', async ({
    page,
  }) => {
    const edgesBefore = await readEdgeIds(page);
    await enterArcTool(page);

    // Source tap cancels its own pick.
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(CASTLE_ID);
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBeNull();
    expect((await newEdgeIds(page, edgesBefore)).length).toBe(0);

    // Background tap cancels AND PLACES NOTHING (D76: with the Arc tool
    // active the editor background tap is never a placement).
    await tapPoint(page, await nodeScreenPoint(page, OUTSKIRTS_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(OUTSKIRTS_ID);
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect.poll(readDrawSourceId.bind(null, page)).toBeNull();
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'New place' || l === 'Waypoint'))
      .toHaveLength(0); // no authored node, no waypoint
    expect((await newEdgeIds(page, edgesBefore)).length).toBe(0);
    await expect(page.getByTestId('tme-save-dock')).toBeHidden(); // nothing ever turned dirty

    // Tool switch clears the pick (the pick belongs to the Arc tool alone).
    await tapPoint(page, await nodeScreenPoint(page, OUTSKIRTS_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(OUTSKIRTS_ID);
    await activate(page, 'tme-tool-node');
    await expect.poll(readDrawSourceId.bind(null, page)).toBeNull();

    // Editor exit clears the pick; re-entry resets the tool to Node (the
    // unchanged B-120 default semantics, now over three segments).
    await activate(page, 'tme-tool-arc');
    await tapPoint(page, await nodeScreenPoint(page, OUTSKIRTS_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(OUTSKIRTS_ID);
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-editor-tools')).toBeHidden();
    await expect.poll(readDrawSourceId.bind(null, page)).toBeNull();
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-tool-node')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tme-tool-arc')).toHaveAttribute('aria-pressed', 'false');
    expect((await newEdgeIds(page, edgesBefore)).length).toBe(0);
  });

  test('the cross-layer fence: a mid-pick layer switch refuses the next pick VISIBLY and keeps the source; re-aiming commits same-layer (F17/C3)', async ({
    page,
  }) => {
    const edgesBefore = await readEdgeIds(page);
    await enterArcTool(page);

    // Pick on Fuyuki, then switch layers: the pending source now lives on a
    // different layer than every visible leaf.
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(CASTLE_ID);
    await activate(page, LAYER_MISAKI);
    await expect.poll(readLabels.bind(null, page)).toEqual(['Misaki Town']);

    // The Misaki leaf tap would commit CROSS-LAYER: refused visibly through
    // the banner (plain words, C23), the pending pick KEPT, nothing commits.
    await tapPoint(page, await nodeScreenPoint(page, MISAKI_ID));
    await expect(page.getByTestId('tme-draw-feedback')).toBeVisible();
    await expect(page.getByTestId('tme-draw-feedback')).toContainText('layer');
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(CASTLE_ID); // the pick survives
    expect((await newEdgeIds(page, edgesBefore)).length).toBe(0);

    // The author re-aims: back on the source's layer the same pick commits a
    // SAME-layer arc and the refusal clears.
    await activate(page, LAYER_FUYUKI);
    await expect.poll(() => readLabels(page)).toContain('Einzbern Castle');
    await expect(page.getByTestId('tme-draw-feedback')).toBeVisible(); // kept until the next action
    await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
    await expect
      .poll(async () => (await newEdgeIds(page, edgesBefore)).length)
      .toBe(1);
    const createdIds = await newEdgeIds(page, edgesBefore);
    const data = await readEdgeData(page, createdIds[0]);
    expect([data?.source, data?.target].sort()).toEqual([CASTLE_ID, TEMPLE_ID].sort());
    await expect.poll(readDrawSourceId.bind(null, page)).toBeNull();
    await expect.poll(readDrawFeedback.bind(null, page)).toBeNull();
    await expect(page.getByTestId('tme-draw-feedback')).toBeHidden();
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
  });

  test('a waypoint tap with a pending pick is a no-op that KEEPS the pick (D21 — waypoints are never endpoints)', async ({
    page,
  }) => {
    await activate(page, 'tme-editor-toggle');
    await activate(page, 'tme-tool-waypoint');
    await tapModelPoint(page, BG_MODEL_POINT); // place wp-1 (kNN and all — B-109)
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);

    await activate(page, 'tme-tool-arc');
    const edgesBefore = await readEdgeIds(page); // the kNN we- edges are baseline now
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(CASTLE_ID);

    // The waypoint tap: not a pick, not a cancel — the pick stands.
    await tapPoint(page, await nodeScreenPoint(page, 'wp-1'));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(CASTLE_ID);
    expect((await newEdgeIds(page, edgesBefore)).length).toBe(0);
    expect(await readDrawFeedback(page)).toBeNull(); // a silent no-op

    // The pick still commits afterwards.
    await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
    await expect
      .poll(async () => (await newEdgeIds(page, edgesBefore)).length)
      .toBe(1);
    const createdIds = await newEdgeIds(page, edgesBefore);
    const data = await readEdgeData(page, createdIds[0]);
    expect([data?.source, data?.target].sort()).toEqual([CASTLE_ID, TEMPLE_ID].sort());
  });

  // --- R21 ruling 1 / B-120: THE viewport-stability pin for the commit --------
  //
  // Mutant discriminator: any commit path that ends in a fit (the pre-B-120
  // rebuild tail) moves zoom AND pan — the exact equality below catches it.
  // The pin starts AFTER the first commit's arc-panel RO refit settles (that
  // chain is B-112's); from then on the second draw is pure rebuild.

  test('desktop: the draw commit while ZOOMED leaves zoom and pan untouched (R21 ruling 1 / B-120)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'wheel zoom runs on desktop; the pinch twin is the phone cell below (D53)');
    const edgesBefore = await readEdgeIds(page);
    await enterArcTool(page);

    // Arc 1 opens the arc panel — settle its RO refit (B-112) before noting.
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
    await expect
      .poll(async () => (await newEdgeIds(page, edgesBefore)).length)
      .toBe(1);
    await settle(page);

    // Zoom IN by wheel (user gesture) around the stage center — a modest
    // ×1.25 keeps every vetted aim point inside the canvas.
    const fitZoom = await readZoom(page);
    const box = await page.getByTestId('tme-canvas').boundingBox();
    if (box === null) throw new Error('canvas host not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -240);
    await settle(page);
    const zoom = await readZoom(page);
    const pan = await readPan(page);
    expect(zoom, 'the zoom-in driver must actually zoom in').toBeGreaterThan(fitZoom * 1.15);

    // The zoomed pair is chosen DYNAMICALLY — a center-focused zoom can push
    // the leftmost nodes off-canvas and fixed chrome covers bands of the
    // stage (found live by this cell's first runs), so only verifiably
    // canvas-clear leaves are tapped (twoClearLeaves).
    const [leafA, leafB] = await twoClearLeaves(page);

    // A PICK while zoomed moves nothing.
    await tapPoint(page, await nodeScreenPoint(page, leafA));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(leafA);
    expect(await readZoom(page), 'pick while zoomed: zoom unchanged').toBe(zoom);
    expect(await readPan(page), 'pick while zoomed: pan unchanged').toEqual(pan);

    // The COMMIT while zoomed: rebuild, no fit — the second edge lands
    // without the viewport moving by a sub-pixel.
    await tapPoint(page, await nodeScreenPoint(page, leafB));
    await expect
      .poll(async () => (await newEdgeIds(page, edgesBefore)).length)
      .toBe(2);
    const createdIds = await newEdgeIds(page, edgesBefore);
    const data = await readEdgeData(page, createdIds[1]);
    expect([data?.source, data?.target].sort()).toEqual([leafA, leafB].sort());
    expect(await readZoom(page), 'commit while zoomed: zoom unchanged (R21 ruling 1)').toBe(zoom);
    expect(await readPan(page), 'commit while zoomed: pan unchanged (R21 ruling 1)').toEqual(pan);
  });

  test('phone: pinch-zoom in, then the draw commit leaves zoom and pan untouched (R21 ruling 1 / B-120, D53)', async () => {
    test.skip(!isPhone(), 'the in-test Chromium twin reproduces the iPhone-13 device identically from either project; wheel zoom is the desktop twin above');
    await withPhoneChromiumPage(async (page) => {
      const edgesBefore = await readEdgeIds(page);
      await enterArcTool(page);

      // Arc 1 opens the arc panel (stacked below at phone width) — settle
      // its RO refit before pinching.
      await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
      await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
      await expect
        .poll(async () => (await newEdgeIds(page, edgesBefore)).length)
        .toBe(1);
      await settle(page);

      // Pinch-IN with BOTH fingers on bare canvas: the center and spread
      // derive from the chrome's runtime boxes (left of the right-side
      // stack — toggle + tool control — above the bottom-left layer
      // switcher), the waypoints cell's discipline.
      const fitZoom = await readZoom(page);
      const box = await page.getByTestId('tme-canvas').boundingBox();
      if (box === null) throw new Error('canvas host not visible');
      const toggle = await page.getByTestId('tme-editor-toggle').boundingBox();
      const tools = await page.getByTestId('tme-editor-tools').boundingBox();
      const layers = await page.getByTestId('tme-layer-layer-fuyuki').boundingBox();
      const rightEdge = Math.min(toggle?.x ?? Infinity, tools?.x ?? Infinity) - 16;
      const bottomEdge = layers?.y ?? box.y + box.height;
      const center = {
        x: box.x + (12 + rightEdge) / 2,
        y: box.y + Math.max(64, Math.min(box.height * 0.45, bottomEdge - box.y - 20)),
      };
      const spreadMax = Math.min(120, (rightEdge - 12) / 2 - 8);
      const cdp = await page.context().newCDPSession(page);
      await cdpPinch(cdp, center, spreadMax * 0.65, spreadMax);
      await settle(page);
      const zoom = await readZoom(page);
      const pan = await readPan(page);
      expect(zoom, 'the pinch driver must actually zoom in').toBeGreaterThan(fitZoom * 1.15);

      // The COMMIT while zoomed (tap-tap, touch-alone): rebuild, no fit.
      // The pair is chosen DYNAMICALLY (twoClearLeaves) — after a pinch the
      // fixed chrome (the lifted tool control, the save dock) covers bands
      // of the tiny stage, and tapping a node under one cancels the pick
      // instead of committing (found live by this cell's first runs).
      const [leafA, leafB] = await twoClearLeaves(page);
      await tapPoint(page, await nodeScreenPoint(page, leafA));
      await expect.poll(readDrawSourceId.bind(null, page)).toBe(leafA);
      await tapPoint(page, await nodeScreenPoint(page, leafB));
      await expect
        .poll(async () => (await newEdgeIds(page, edgesBefore)).length)
        .toBe(2);
      const createdIds = await newEdgeIds(page, edgesBefore);
      const data = await readEdgeData(page, createdIds[1]);
      expect([data?.source, data?.target].sort()).toEqual([leafA, leafB].sort());
      expect(await readZoom(page), 'commit while zoomed: zoom unchanged (R21 ruling 1)').toBe(zoom);
      expect(await readPan(page), 'commit while zoomed: pan unchanged (R21 ruling 1)').toEqual(pan);
    });
  });

  test('the Arc segment meets the 44px tap-target floor beside its siblings (F52/D53)', async ({ page }) => {
    await activate(page, 'tme-editor-toggle');
    for (const testId of ['tme-tool-node', 'tme-tool-waypoint', 'tme-tool-arc']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box, `${testId} is on the touch surface`).not.toBeNull();
      expect(box?.height ?? 0, `${testId} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0, `${testId} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }
    // The control never widens past the stage (D53: no horizontal scroll).
    const tools = await page.getByTestId('tme-editor-tools').boundingBox();
    const canvas = await page.getByTestId('tme-canvas').boundingBox();
    if (tools === null || canvas === null) throw new Error('tool control or canvas not visible');
    expect(tools.x, 'the tool control stays inside the stage (left)').toBeGreaterThanOrEqual(canvas.x);
    expect(
      tools.x + tools.width,
      'the tool control stays inside the stage (right)',
    ).toBeLessThanOrEqual(canvas.x + canvas.width);
  });

  test('phone: the refusal banner renders at 375px with no horizontal scroll (F52/D53)', async ({ page }) => {
    test.skip(!isPhone(), 'the 375px geometry check belongs to the phone project (D53)');
    await page.setViewportSize({ width: 375, height: 667 });
    const edgesBefore = await readEdgeIds(page);
    await enterArcTool(page);
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await activate(page, LAYER_MISAKI);
    await expect.poll(readLabels.bind(null, page)).toEqual(['Misaki Town']);
    await tapPoint(page, await nodeScreenPoint(page, MISAKI_ID));
    await expect(page.getByTestId('tme-draw-feedback')).toBeVisible();

    // D53: never horizontal scroll at 375px — the banner caps to the stage.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);
    expect((await newEdgeIds(page, edgesBefore)).length).toBe(0);
  });

  test('the draw-arc journey keeps the harness console clean (§6.2/D53)', async ({ page }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    // Native-API sweep only (no CDP on the phone project's WebKit page): a
    // full journey — draw, refuse the fence, re-aim, save.
    const edgesBefore = await readEdgeIds(page);
    await enterArcTool(page);
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
    await expect
      .poll(async () => (await newEdgeIds(page, edgesBefore)).length)
      .toBe(1);
    // Pick BEFORE the layer switch — the fence refuses a COMMIT with a
    // pending cross-layer source; with no pick the same tap would just set
    // one (the commit clears the pick).
    await tapPoint(page, await nodeScreenPoint(page, OUTSKIRTS_ID));
    await expect.poll(readDrawSourceId.bind(null, page)).toBe(OUTSKIRTS_ID);
    await activate(page, LAYER_MISAKI);
    await expect.poll(readLabels.bind(null, page)).toEqual(['Misaki Town']);
    await tapPoint(page, await nodeScreenPoint(page, MISAKI_ID)); // the fence refusal
    await expect(page.getByTestId('tme-draw-feedback')).toBeVisible();
    await activate(page, LAYER_FUYUKI);
    await expect.poll(() => readLabels(page)).toContain('Einzbern Castle');
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID)); // the re-aimed commit
    await expect
      .poll(async () => (await newEdgeIds(page, edgesBefore)).length)
      .toBe(2);
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(readDraftedIds.bind(null, page)).toEqual([]);

    expect(bad, 'no console errors/warnings/pageerrors during the journey').toEqual([]);
  });
});
