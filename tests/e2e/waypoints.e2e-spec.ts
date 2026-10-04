// tests/e2e/waypoints.e2e-spec.ts — PKG B-109: tap-to-place waypoints with
// full input disambiguation, proven at BOTH playwright projects (desktop +
// emulated phone with touch) per D53/F52.
//
// Cited IDs:
//   F10/D21  — user nodes (waypoints) are placed at runtime by tapping empty
//              canvas; the plain-word label 'Waypoint' is chat state (the
//              overlay), never an id-like machine name on the canvas (C23).
//   C5       — ids belong to the engine: rapid creations cannot collide. The
//              facade's counter starts at 1 and FX1 authors no `wp-`/`we-`
//              ids, so a fresh page's first placement is deterministically
//              `wp-1` (asserted via the seams, never proposed by the UI).
//   C7       — a placed node connects to the k=3 nearest leaves of the MERGED
//              set on its layer (WAYPOINT_KNN=3; the D58 leaf rule — kind ∈
//              {location, hub, waypoint} AND childless). Layer-fuyuki holds 13
//              leaves ≥ k, so every placement here creates exactly 3 `we-`
//              user edges; a second placement may treat the first waypoint as
//              a leaf (6 total across two placements).
//   C14      — user edges carry NO authored values and price through the ONE
//              cost function (geometric, no parallel math). See the F26 test
//              for the currency consequence on FX1 (D60(b) as amended by D74).
//   C17      — unreachable ⇒ the core's human reason, verbatim, never a
//              number; verified against src/core/facade.ts computeRoute.
//   D60(b)   — ONE currency per findRoute run (the interleaved-currency
//              verifier pin): a path mixing authored-minutes arcs with
//              unitPerPx-only user edges yields ok:false rather than a
//              meaningless mixed total. AMENDED by D74 (register R17): on
//              time-kind `min` scales the unforced canonical fallback now
//              prices authored-minutes arcs and geometric user edges in ONE
//              honest `min` currency (D72 labels it) — see the deviation
//              history note below and the F26 test body.
//   §6.2     — Waypoints & overlay: tap inside a compound's box but not on a
//              node ⇒ top-level user node in that layer; kNN considers leaves
//              only; rapid taps ⇒ engine-assigned ids. Touch: tap-vs-drag
//              threshold; touch-action suppression of double-tap zoom.
//   D53/F52  — one interaction family, both worlds; no hover-only affordance;
//              no horizontal scroll at 375px.
//   D35      — NO double-tap/double-click gesture is bound (portal entry is
//              Phase 3 M3): two rapid taps are two discrete taps.
//   D69      — waypoints render on the ACTIVE layer only (buildLayerElements
//              filters the overlay by it).
//
// DEVIATION HISTORY (packet B-109 F26 bullet, resolved by D74): the packet
// expected the blocked castle route to flip back to ok:true with legs riding
// `we-` edges after a gap placement. At B-109's gate that outcome was
// unsatisfiable on FX1 under the frozen contract, for two independent
// reasons:
//   (1) no point in the plane puts the PIN (Emiya Residence) into a placed
//       node's kNN-3 — the Miyama cluster always crowds it out (exhaustive
//       grid scan), so an all-`we-` two-leg route can never exist; and
//   (2) a reconnecting placement (castle+outskirts in kNN-3) produces a MIXED
//       path, which findRoute refused BY DESIGN under D60(b)'s strict
//       currency filter (src/core/facade.ts — the interleaved-currency
//       verifier pin; §6.2's acknowledged ambiguity).
// Wall (2) is RESOLVED by D74 (A-012): findRoute's unforced canonical
// fallback now accepts minutes-priced arcs on time-kind `min` scales via the
// priceForSnapshot helper, so the mixed path prices honestly in ONE `min`
// currency and the F26 cell below pins the originally-intended assertion —
// ok:true with the block STILL active, the final leg on a `we-` edge, the
// total in min. Wall (1) STANDS — the pin is never in kNN — and is why the
// all-`we-` two-leg shape was never the assertion.
//
// Canvas content is read/aimed through the DEV-HARNESS-ONLY
// window.__TME_E2E__ hook (src/app/app.ts): read-only projections of the
// cytoscape model. All aim math (midpoints, perpendicular offsets, canvas-box
// translation) is TEST-side — the UI computes nothing (R1).
import { chromium, devices, expect, test, type CDPSession, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  edgeIds(): string[];
  nodeParent(id: string): string | null;
  edgeLineStyle(id: string): string | null;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

const CASTLE_ID = 'einzbern-castle';
const CASTLE_LABEL = 'Einzbern Castle';
const STATION_ID = 'fuyuki-station';
const STATION_LABEL = 'Fuyuki Station';
/** FX1 arc facts: the ONLY arc into the castle (walk 240 / car 60). */
const CASTLE_ARC = { id: 'arc-outskirts-einzbern-castle', source: 'outskirts', target: CASTLE_ID };

/** C17: the core's verbatim reason while the castle's only road is blocked. */
const BLOCKED_REASON_TEXT = 'every candidate arc is blocked or disallowed for this mode';

const isPhone = (): boolean => test.info().project.name === 'phone';

/**
 * Background placement points in MODEL coordinates, chosen by an exhaustive
 * scan of the FX1 plane against the installed cytoscape 3.34.3 hit model
 * (findNearestElements/checkNode/checkEdge) at the worst case — the phone
 * touch fit (zoom ≈ 0.282: edge grab corridor = width/2 + 24/zoom ≈ 87 model
 * units, node hit half-width = 22 + 8/zoom ≈ 50 model units; the desktop
 * mouse fit is an order of magnitude tighter). Both points are:
 *   - >110 model units from every authored edge segment and >60 from every
 *     node center, the cross-layer badge, and both compound boxes;
 *   - inside the fitted content bounding box with node-body margin, so the
 *     post-placement fitView (afterGraphMutation → rebuildElements) is a
 *     no-op and the waypoint renders exactly at the tap point (asserted);
 *   - rendered clear of the fixed chrome (header, layer switcher) at both
 *     project viewports.
 * The BG_POINT discipline of interactions.e2e-spec.ts:44, model-anchored:
 * the points convert to canvas-relative px at runtime through the zoom/pan
 * seams (test-side math — the UI computes nothing, R1).
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };
const BG_MODEL_POINT_2: { x: number; y: number } = { x: 300, y: 92 };

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeLabels();
  });

const readState = (page: Page): Promise<{ labels: string[]; weIds: string[] }> =>
  page.evaluate((): { labels: string[]; weIds: string[] } => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return {
      labels: hook.nodeLabels(),
      weIds: hook.edgeIds().filter((id) => id.startsWith('we-')),
    };
  });

const readNodeParent = (page: Page, id: string): Promise<string | null> =>
  page.evaluate(
    (nodeId): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
      return hook.nodeParent(nodeId);
    },
    id,
  );

const readEdgeLineStyle = (page: Page, edgeId: string): Promise<string | null> =>
  page.evaluate(
    (id): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
      return hook.edgeLineStyle(id);
    },
    edgeId,
  );

const readRenderedPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
      return hook.nodeRenderedPosition(nodeId);
    },
    id,
  );

const readPan = (page: Page): Promise<{ x: number; y: number }> =>
  page.evaluate((): { x: number; y: number } => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.pan();
  });

const readScrollY = (page: Page): Promise<number> => page.evaluate(() => window.scrollY);

const expectPosition = (pos: { x: number; y: number } | null): { x: number; y: number } => {
  if (pos === null) throw new Error('node not rendered (unmounted or absent)');
  return pos;
};

const canvasBox = async (page: Page) => {
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return box;
};

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const tapPoint = async (page: Page, point: Point): Promise<void> => {
  if (isPhone()) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
};

/**
 * Wait two animation frames: panel open/close changes the stage size
 * synchronously, but the ResizeObserver-driven re-fit (B-106) runs just
 * before the next paint — reads inside that window yield pre-fit
 * coordinates and the next tap misses (arc-panel.e2e-spec.ts precedent).
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** Model point → canvas-relative rendered point (seam read, test-side math). */
const modelPoint = async (page: Page, model: { x: number; y: number }): Promise<Point> => {
  await settle(page);
  return page.evaluate(
    (m): Point => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
      const pan = hook.pan();
      const zoom = hook.zoom();
      return { x: pan.x + m.x * zoom, y: pan.y + m.y * zoom };
    },
    model,
  );
};

/** Tap a canvas node through its rendered position (seam + canvas box). */
const tapNode = async (page: Page, id: string): Promise<void> => {
  await settle(page);
  const pos = expectPosition(await readRenderedPosition(page, id));
  const box = await canvasBox(page);
  await tapPoint(page, { x: box.x + pos.x, y: box.y + pos.y });
};

/**
 * Tap an arc through the RENDERED MIDPOINT of its two endpoints (B-106
 * ruling 2; test-side math — the UI computes nothing, R1). Re-reads
 * positions on every call: a block/lift/placement rebuild re-fits the view,
 * so stale coordinates would miss.
 */
const tapEdgeMidpoint = async (page: Page, arc: { id: string; source: string; target: string }): Promise<void> => {
  await settle(page);
  const source = expectPosition(await readRenderedPosition(page, arc.source));
  const target = expectPosition(await readRenderedPosition(page, arc.target));
  const box = await canvasBox(page);
  await tapPoint(page, {
    x: box.x + (source.x + target.x) / 2,
    y: box.y + (source.y + target.y) / 2,
  });
};

/**
 * The F26 gap aim: the midpoint between the outskirts and castle rendered
 * positions, offset PERPENDICULAR to their line by 200 MODEL units on the
 * south-west side (away from the Miyama cluster). Test-side math from seam
 * reads only (R1). The offset clears the castle arc's touch hit corridor
 * (width/2 + 24/zoom ≈ 87 model units at the phone fit) by ~113 units, and
 * the kNN-3 membership is stable for ANY offset on this side: the competitor
 * distances grow faster than the endpoints' (matou² = 56125 + 289.2·t + t²
 * vs castle² = 56425 + t²), so C7's k=3 connects {castle, outskirts, matou}
 * and the castle rejoins the connected graph THROUGH the waypoint.
 */
const GAP_OFFSET_MODEL_UNITS = 200;
const gapPoint = async (page: Page): Promise<Point> => {
  await settle(page);
  const source = expectPosition(await readRenderedPosition(page, CASTLE_ARC.source));
  const target = expectPosition(await readRenderedPosition(page, CASTLE_ARC.target));
  const zoom = await page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.zoom();
  });
  const box = await canvasBox(page);
  const dx = source.x - target.x;
  const dy = source.y - target.y;
  const len = Math.hypot(dx, dy);
  // Perpendicular unit vector (-dy, dx)/len points south-west here (the
  // source Outskirts sits right-down of the castle in rendered space, and
  // rendered y grows downward like model y — C9).
  return {
    x: box.x + (source.x + target.x) / 2 + (-dy / len) * GAP_OFFSET_MODEL_UNITS * zoom,
    y: box.y + (source.y + target.y) / 2 + (dx / len) * GAP_OFFSET_MODEL_UNITS * zoom,
  };
};

/**
 * The §6.2 compound-box aim: a point just inside the Miyama district box's
 * bottom-left corner (runtime read off the B-104 bounding-box seam, so it is
 * viewport-independent). Off every CHILD: the nearest child center
 * (Ryuudou Temple) sits ~35px away rendered at the phone fit — outside the
 * 22·zoom + [2|8] px node hit radius (probed at both viewports); a child tap
 * would SELECT (B-105), not place. Edges cannot win the pick: nodes draw
 * above edges (installed cytoscape 3.34.3, z-index-compare 'auto' — "always
 * draws edges under nodes", cytoscape.cjs.js z-order docs).
 */
const miyamaBoxCorner = async (page: Page): Promise<Point> => {
  await settle(page);
  const box = await page.evaluate((): { x: number; y: number; w: number; h: number } => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    const b = hook.nodeRenderedBoundingBox('district-miyama');
    if (b === null) throw new Error('district-miyama not rendered');
    return b;
  });
  const host = await canvasBox(page);
  return { x: host.x + box.x + 8, y: host.y + box.y + box.h - 8 };
};

/**
 * The `phone` playwright project runs the iPhone 13 device on WebKit, and a
 * CDP session exists only in Chromium. Playwright's touchscreen API has no
 * drag primitive, so the touch-drag gesture below (§6.2 tap-vs-drag) runs on
 * a Chromium page with the SAME iPhone 13 emulation — the
 * interactions.e2e-spec.ts twin pattern.
 */
const withPhoneChromiumPage = async (run: (page: Page) => Promise<void>): Promise<void> => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, 'emiya-residence')).not.toBeNull();
    await run(page);
  } finally {
    await browser.close();
  }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** One-finger drag through CDP Input.dispatchTouchEvent (touchscreen has no drag). */
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

test.describe('tap-to-place waypoints (PKG B-109)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, 'emiya-residence')).not.toBeNull();
  });

  test('background tap places one top-level waypoint with its k=3 kNN edges (F10/D21/C7/C5, §6.2)', async ({
    page,
  }) => {
    const before = await readState(page);
    expect(before.labels.filter((l) => l === 'Waypoint')).toHaveLength(0);
    expect(before.weIds).toHaveLength(0);

    await tapPoint(page, await modelPoint(page, BG_MODEL_POINT));

    // F10/D21: exactly one 'Waypoint' appears — the plain-word C23 label of
    // the chat-state overlay node, rendered on the ACTIVE layer (D69).
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);

    // C5: the engine assigned the id (counter starts at 1; FX1 authors no
    // wp- ids — deterministic from a fresh facade). §6.2: the placement is
    // TOP-LEVEL — addUserNodeAt never parents user nodes (validate.ts
    // rejects `parent` on them), even though this tap was a plain
    // background tap.
    expect(await readNodeParent(page, 'wp-1')).toBeNull();

    // C7: k=3 nearest leaves of the merged set — layer-fuyuki holds 13
    // leaves ≥ k, so exactly 3 `we-` user edges appear (walk-only, C14).
    const after = await readState(page);
    expect(after.weIds).toHaveLength(3);
    expect(new Set(after.weIds).size).toBe(3); // C5: no id collisions

    // The waypoint renders exactly at the tap point: BG_MODEL_POINT is inside
    // the fitted content bbox, so the post-placement fitView is a no-op and
    // the rendered position must round-trip within screen-px noise (seam
    // read, test-side only — the UI did no coordinate math, R1).
    const wp = expectPosition(await readRenderedPosition(page, 'wp-1'));
    const aim = await modelPoint(page, BG_MODEL_POINT);
    expect(Math.hypot(wp.x - aim.x, wp.y - aim.y)).toBeLessThanOrEqual(3);

    // Ruling 1: the placement gesture is also the M2 dismiss — no selection
    // chip may appear from a background tap. And D35: no double-tap gesture
    // is bound — a single tap placed exactly one waypoint (the rapid
    // double-tap case is its own test below).
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
  });

  test('the F26 loop: block the only road, place a waypoint in the gap, the sidebar re-routes LIVE through it, lift restores (F26/C7/C14/C17/D74)', async ({
    page,
  }) => {
    // Pre-state: the walk route pin → castle is FX1's 30 + 240 = 270 min.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-total')).toHaveText('270 min');

    // Block the ONLY road (chat-scoped, reason 'Rockslide' — the B-106 flow).
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await page.getByTestId('tme-arc-reason-input').fill('Rockslide');
    if (isPhone()) await page.getByTestId('tme-arc-block').tap();
    else await page.getByTestId('tme-arc-block').click();
    // C2: excluded from routing but still DRAWN — dashed.
    await expect.poll(() => readEdgeLineStyle(page, CASTLE_ARC.id)).toBe('dashed');

    // C17 live: the same selection now renders the core's verbatim reason.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-unreachable')).toHaveText(BLOCKED_REASON_TEXT);
    const legsBlocked = await page.getByTestId('tme-leg').count(); // 0: an unreachable state renders no legs

    // Place a waypoint in the gap between Outskirts and the castle: its C7
    // kNN edges (castle, outskirts, matou — see gapPoint) reconnect the
    // castle TOPOLOGICALLY through the waypoint.
    const before = await readState(page);
    await tapPoint(page, await gapPoint(page));
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);
    const afterPlace = await readState(page);
    expect(afterPlace.weIds.length - before.weIds.length).toBe(3); // C7 k=3
    // The candidate `we-` ids of this placement (engine-assigned, C5) — the
    // derivation basis for the we- leg assertions below: no leg-id seam
    // exists, so the prefix is proven structurally (B-109 deviation 2's
    // derivation pattern; C23 keeps the ids out of every displayed string).
    const newWeIds = afterPlace.weIds.filter((id) => !before.weIds.includes(id));
    expect(newWeIds).toHaveLength(3);
    expect(newWeIds.every((id) => id.startsWith('we-'))).toBe(true);

    // Re-select the castle: the sidebar re-routes LIVE (graphRevision is the
    // route computed's dependency, B-106 ruling 4). F26 under D74: with the
    // block STILL active the reconnected path — pin → authored Miyama arcs →
    // the kNN leaf (matou) → `we-` → waypoint → `we-` → castle — is a MIXED
    // path, and D74's honest canonical fallback prices it in ONE min
    // currency (authored legs keep their authored minutes; `we-` legs price
    // geometrically; D72 labels the run) instead of the pre-D74 D60(b)
    // refusal — so the unreachable state CLEARS.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-unreachable')).toHaveCount(0); // D60(b) wall gone (D74)
    const legs = page.getByTestId('tme-leg');
    // The FINAL leg rides a `we-` edge, proven by derivation: its from-label
    // is the waypoint's C23 label ('Waypoint' — never the wp- id), and the
    // waypoint's ONLY incident arcs are the derived `we-` ids above (C7: a
    // user node connects exclusively via engine-assigned we- edges), so the
    // final leg's arcId ∈ newWeIds and carries the we- prefix.
    await expect(legs.last()).toHaveText(/^Waypoint → Einzbern Castle · walk · [\d.]+$/);
    const legCount = await legs.count();
    expect(legCount).toBeGreaterThan(legsBlocked); // the leg count grows vs the blocked state
    expect(legCount).toBeGreaterThanOrEqual(3); // ≥1 authored leg + the two we- rides
    // The penultimate leg ends AT the waypoint (the last `we-` ride in).
    await expect(legs.nth(legCount - 2)).toHaveText(/→ Waypoint · walk · [\d.]+$/);
    // D74/D72: one honest min currency — the total line ends in min.
    await expect(page.getByTestId('tme-total')).toHaveText(/ min$/);
    expect((await readState(page)).weIds.length - before.weIds.length).toBe(3); // we- edges persist

    // C2: the dashed arc is still tappable — the lift stays reachable.
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-arc-lift')).toBeEnabled();
    if (isPhone()) await page.getByTestId('tme-arc-lift').tap();
    else await page.getByTestId('tme-arc-lift').click();
    await expect.poll(() => readEdgeLineStyle(page, CASTLE_ARC.id)).toBe('solid');

    // The authored road is back: the walk route restores verbatim (the
    // minutes run prices authored arcs only — the user edges cannot enter a
    // minutes run, C14/D60(b)), and the waypoint plus its edges persist.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-unreachable')).toHaveCount(0);
    await expect(page.getByTestId('tme-leg')).toHaveCount(2);
    await expect(page.getByTestId('tme-total')).toHaveText('270 min');
    expect((await readState(page)).weIds.length - before.weIds.length).toBe(3);
    expect((await readLabels(page)).filter((l) => l === 'Waypoint')).toHaveLength(1);
  });

  test('two rapid background taps place two waypoints with engine-assigned ids; no page artifacts (C5/§6.2/D35)', async ({
    page,
  }) => {
    const before = await readState(page);
    expect(before.weIds).toHaveLength(0);

    // Two rapid taps at two DISTINCT clear background points (both model-
    // vetted; ~560 model units apart, so the second tap clears the first
    // waypoint's node hit disk and its 3 we- edge corridors). §6.2: rapid
    // taps are discrete taps (D35: no double-tap gesture is bound); C5: the
    // engine assigns collision-free ids.
    await tapPoint(page, await modelPoint(page, BG_MODEL_POINT));
    await tapPoint(page, await modelPoint(page, BG_MODEL_POINT_2));

    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(2);
    const after = await readState(page);
    // 3 user edges per placement (C7 k=3), all engine-assigned and unique.
    expect(after.weIds.length - before.weIds.length).toBe(6);
    expect(new Set(after.weIds).size).toBe(after.weIds.length);
    expect(await readNodeParent(page, 'wp-1')).toBeNull(); // C5/§6.2: top-level
    expect(await readNodeParent(page, 'wp-2')).toBeNull();

    // §6.2: touch-action: none on the canvas host — no double-tap page zoom
    // or scroll artifacts (on desktop the invariant holds trivially; the
    // double-tap-zoom suppression itself is a touch-browser behavior).
    expect(await readScrollY(page)).toBe(0);
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
  });

  test('desktop: a small background drag pans the map and places NOTHING (§6.2 tap-vs-drag)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'mouse drag runs on desktop; the touch twin is the phone test below (D53)');
    const start = await modelPoint(page, BG_MODEL_POINT);
    const panBefore = await readPan(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 25, { steps: 8 });
    await page.mouse.up();

    const panAfter = await readPan(page);
    expect(panAfter.x).not.toBe(panBefore.x); // the gesture PANNED…
    expect((await readLabels(page)).filter((l) => l === 'Waypoint')).toHaveLength(0); // …and never placed
  });

  test('phone: a touch drag on the background pans and places NOTHING (§6.2 tap-vs-drag, D53)', async () => {
    test.skip(!isPhone(), 'touch-drag needs the touch-emulated project');
    await withPhoneChromiumPage(async (page) => {
      const panBefore = await readPan(page);
      const cdp = await page.context().newCDPSession(page);
      const box = await canvasBox(page);
      const start = await modelPoint(page, BG_MODEL_POINT);
      await cdpTouchDrag(cdp, { x: box.x + start.x, y: box.y + start.y }, 60, 25);
      const panAfter = await readPan(page);
      expect(panAfter.x).not.toBe(panBefore.x); // panned, not tapped
      expect((await readLabels(page)).filter((l) => l === 'Waypoint')).toHaveLength(0);
      expect(await readScrollY(page)).toBe(0);
    });
  });

  test('tap inside the Miyama district box, off every child, places a TOP-LEVEL waypoint (§6.2, B-109 ruling 2)', async ({
    page,
  }) => {
    const before = await readState(page);
    expect(before.labels.filter((l) => l === 'Waypoint')).toHaveLength(0);

    await tapPoint(page, await miyamaBoxCorner(page));

    // The compound parent's box is a placement tap, not a selection: exactly
    // one waypoint appears, the chip stays hidden (a child tap would have
    // selected it — B-105 semantics), and the waypoint is TOP-LEVEL in the
    // layer (addUserNodeAt never parents user nodes — §6.2).
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);
    expect(await readNodeParent(page, 'wp-1')).toBeNull();
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    const after = await readState(page);
    expect(after.weIds.length - before.weIds.length).toBe(3); // C7 k=3 (leaves only)
  });

  test('node and edge taps keep their M2 semantics — a placement never fires (B-105/B-106 pin)', async ({
    page,
  }) => {
    // A leaf-node tap selects (chip + route panel) and places nothing.
    await tapNode(page, STATION_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(STATION_LABEL);
    await expect(page.getByTestId('tme-target')).toContainText(STATION_LABEL);
    expect((await readLabels(page)).filter((l) => l === 'Waypoint')).toHaveLength(0);

    // An edge tap opens the arc panel and places nothing.
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-arc-endpoints')).toHaveText('Outskirts ↔ Einzbern Castle');
    expect((await readLabels(page)).filter((l) => l === 'Waypoint')).toHaveLength(0);
  });

  test('phone 375px: waypoint placement by touch alone, no horizontal scroll (F52/D53)', async ({ page }) => {
    test.skip(!isPhone(), 'the 375px geometry check belongs to the phone project (D53)');
    await page.setViewportSize({ width: 375, height: 667 });
    await settle(page);
    await expect.poll(() => readRenderedPosition(page, CASTLE_ARC.source)).not.toBeNull();

    // Background placement via runtime-derived aims (the fit changed with the
    // narrower stage, so fixed constants would be stale here).
    const before = await readState(page);
    const gap = await gapPoint(page);
    await page.touchscreen.tap(gap.x, gap.y);
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);
    expect((await readState(page)).weIds.length - before.weIds.length).toBe(3); // C7

    // Compound-box placement, touch only, top-level (§6.2).
    const corner = await miyamaBoxCorner(page);
    await page.touchscreen.tap(corner.x, corner.y);
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(2);
    expect(await readNodeParent(page, 'wp-2')).toBeNull();

    // D53/F52: never horizontal scroll at 375px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);
  });
});
