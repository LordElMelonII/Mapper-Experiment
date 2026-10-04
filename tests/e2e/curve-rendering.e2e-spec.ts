// tests/e2e/curve-rendering.e2e-spec.ts — PKG B-111: `unbundled-bezier`
// curve rendering (rendering-only slice), proven at BOTH playwright projects
// (desktop + emulated phone with touch) per D53/F52.
//
// Cited IDs:
//   §5 M3    — EXECUTION-PLAN Phase 2 M3: "`unbundled-bezier` for curved
//              detours." An edge carrying authored `curve` data
//              (src/core/api.ts:45 — RENDERING-ONLY, validate.ts:264-275)
//              projects the `tme-curved` class + verbatim control-point
//              distances (buildLayerElements, D7 plain-data stylesheet) and
//              resolves curve-style 'unbundled-bezier'.
//   C14      — curves never touch cost/routing/prompts: pricing reads
//              geometry and authored values only, so the demo edge (walk
//              disallowed, no other mode — price.ts:52 gates every mode on
//              `allowed === true`) is unroutable in EVERY mode and currency.
//              Straight data keeps the 'bezier' default; routing totals are
//              provably untouched.
//   D69      — display-copy precedent: the harness displayMap carries ONE
//              harness-only demo edge (`arc-harness-curve-demo`,
//              kotomine-church ↔ fuyuki-bridge — the normative FX1 file is
//              untouched) while staying SEMANTICALLY FX1: the FX2 route
//              totals below render exactly.
//   D7/R1    — the curve is authored LAYOUT data mapped verbatim
//              ('data(curveDistances)'); the stylesheet is plain data and
//              computes nothing (the constant control-point WEIGHT array is
//              a layout constant like B-107's BADGE_OFFSET — the runtime
//              requires weights alongside distances, cytoscape 3.34.3
//              findBezierPoints: curve size = min(distances.length,
//              weights.length), scalar default 0.5 truncates).
//   B-106    — the curve edge is selectable like any edge: tap → arc panel
//              (curve-style does not disturb the B-106 surface).
//   F52/D53  — both viewports; the phone project pins the 375px resolution
//              with no horizontal overflow.
//
// Demo-edge geometry note (tap aiming): with weights [0.5, 0.5] the two
// control points are M + 40·n̂ and M − 30·n̂ (M = the endpoints' midpoint, n̂
// = cytoscape's normal (−dŷ, d̂x) of the PAIR-ordered source→target line —
// pool-ordered, see cytoscape.esm.mjs pair grouping; rendered px scale the
// model distances by zoom). storeAllpts inserts the control points'
// MIDPOINT (M + 5·n̂) as the on-curve junction anchor, so a tap there is
// EXACTLY on the rendered curve at any zoom. All aim math is TEST-side —
// the UI computes nothing (R1).
import { expect, test, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  edgeCurveStyle(id: string): string | null;
  edgeIds(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

/** The D69 harness-only demo edge (src/app/app.ts CURVE_DEMO_EDGE). */
const DEMO_ARC = {
  id: 'arc-harness-curve-demo',
  source: 'kotomine-church',
  target: 'fuyuki-bridge',
};

/** Ordinary authored arcs (no `curve` data): the castle-only arc and one
 *  sharing an endpoint with the demo edge — the class is per-edge data. */
const CASTLE_ARC = { id: 'arc-outskirts-einzbern-castle', source: 'outskirts', target: 'einzbern-castle' };
const CHURCH_ARC = { id: 'arc-outskirts-kotomine-church', source: 'outskirts', target: 'kotomine-church' };

const MISAKI_ID = 'misaki-town';

/**
 * Background placement point (MODEL coords) — the waypoints.e2e-spec.ts
 * BG_POINT discipline, reused verbatim: exhaustively scanned clear of every
 * node, edge corridor, compound box and chrome at both project fits, and
 * >100 model units from the demo curve (kotomine-church ↔ fuyuki-bridge).
 * Placing here connects the k=3 nearest leaves (C7) with `we-` edges whose
 * curve-style must stay the 'bezier' default.
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };

const isPhone = (): boolean => test.info().project.name === 'phone';

const readEdgeCurveStyle = (page: Page, edgeId: string): Promise<string | null> =>
  page.evaluate((id): string | null => {
    // page.evaluate callbacks are serialized: the hook lookup is inlined
    // (same discipline as the other specs), no closures cross the wire.
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.edgeCurveStyle(id);
  }, edgeId);

const readWeIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.edgeIds().filter((id) => id.startsWith('we-'));
  });

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
      return hook.nodeRenderedPosition(nodeId);
    },
    id,
  );

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
 * synchronously, but the ResizeObserver-driven re-fit runs just before the
 * next paint — reads inside that window yield pre-fit coordinates and the
 * next tap misses (arc-panel.e2e-spec.ts precedent).
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

/** F52/D53: tap a canvas node through its rendered position — touch on the
 *  phone project, mouse click on desktop. */
const tapNode = async (page: Page, id: string): Promise<void> => {
  await settle(page);
  const pos = expectPosition(await readPosition(page, id));
  const box = await canvasBox(page);
  await tapPoint(page, { x: box.x + pos.x, y: box.y + pos.y });
};

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/**
 * Tap the DEMO EDGE exactly on its rendered curve (test-side math, R1): the
 * junction anchor J = M + 5·zoom·n̂ px, where M is the endpoints' rendered
 * midpoint and n̂ is cytoscape's pair-ordered normal (−dŷ, d̂x) — see the
 * geometry note in the file header. A straight-midpoint tap would rely on
 * the hit tolerance (the curve bulges ±40/−30 model units); J is ON the
 * curve, so the hit is exact at any zoom on both input paths.
 */
const tapCurveEdge = async (page: Page): Promise<void> => {
  await settle(page);
  // PAIR order (cytoscape.esm.mjs pair grouping: ascending node pool index —
  // the bridge is projected before the church, so the pair runs bridge →
  // church) fixes the normal's sign; the weights are 0.5 either way.
  const bridge = expectPosition(await readPosition(page, 'fuyuki-bridge'));
  const church = expectPosition(await readPosition(page, 'kotomine-church'));
  const zoom = await page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.zoom();
  });
  const dx = church.x - bridge.x;
  const dy = church.y - bridge.y;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const box = await canvasBox(page);
  const junctionOffset = 5 * zoom; // (40 + (−30)) / 2 model units, scaled to px
  await tapPoint(page, {
    x: box.x + (bridge.x + church.x) / 2 + nx * junctionOffset,
    y: box.y + (bridge.y + church.y) / 2 + ny * junctionOffset,
  });
};

test.describe('curve rendering — unbundled-bezier (PKG B-111)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    // First paint is Fuyuki (loadMap's first layer) — the demo edge's
    // endpoints both live there and render immediately.
    await expect.poll(() => readPosition(page, 'kotomine-church')).not.toBeNull();
    await expect.poll(() => readPosition(page, 'fuyuki-bridge')).not.toBeNull();
  });

  test('the demo edge resolves unbundled-bezier; ordinary arcs keep bezier (§5 M3, api.ts:45, D7/R1)', async ({
    page,
  }) => {
    // §5 M3 + api.ts:45: authored curve data renders unbundled-bezier.
    await expect.poll(() => readEdgeCurveStyle(page, DEMO_ARC.id)).toBe('unbundled-bezier');
    // Straight data renders straight — the stylesheet default holds on
    // ordinary authored arcs, including one sharing the demo edge's
    // endpoint (the class is per-edge DATA, not per-node or per-layer).
    await expect.poll(() => readEdgeCurveStyle(page, CASTLE_ARC.id)).toBe('bezier');
    await expect.poll(() => readEdgeCurveStyle(page, CHURCH_ARC.id)).toBe('bezier');
  });

  test('a placed waypoint\'s we- edges keep the bezier default (C7, C14 — curves change looks, never pricing)', async ({
    page,
  }) => {
    const before = await readWeIds(page);
    await tapPoint(page, await modelPoint(page, BG_MODEL_POINT));
    // C7 (k=3 on layer-fuyuki — the waypoints spec pins this exact point):
    // the placement creates exactly 3 `we-` user edges.
    await expect.poll(async () => (await readWeIds(page)).length - before.length).toBe(3);
    const after = await readWeIds(page);
    const newWeIds = after.filter((id) => !before.includes(id));
    // C14/D7: user edges carry no curve data — the 'bezier' default holds.
    for (const weId of newWeIds) {
      expect(await readEdgeCurveStyle(page, weId), `${weId} curve-style`).toBe('bezier');
    }
  });

  test('the demo edge is routing-inert: FX2 350 min renders exactly (C14 row 2, D69)', async ({ page }) => {
    // The route to the other layer (C3): walk 50 + train 300 = 350 min —
    // FX2's normative route, verbatim. The demo edge cannot appear: its only
    // declared mode is disallowed and no other mode exists (price.ts:52 —
    // every mode is gated on `allowed === true`), so it prices ∞ in every
    // currency and never enters a shortest path.
    await activate(page, 'tme-layer-layer-misaki');
    await expect.poll(() => readPosition(page, MISAKI_ID)).not.toBeNull();
    await tapNode(page, MISAKI_ID);
    await expect(page.getByTestId('tme-leg')).toHaveCount(2);
    await expect(page.getByTestId('tme-leg').nth(0)).toHaveText('Emiya Residence → Fuyuki Station · walk · 50');
    await expect(page.getByTestId('tme-leg').nth(1)).toHaveText('Fuyuki Station → Misaki Town · train · 300');
    await expect(page.getByTestId('tme-total')).toHaveText('350 min');
  });

  test('the curved edge is selectable like any edge: arc panel opens, walk disallowed (B-106, C14)', async ({
    page,
  }) => {
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();

    // An exact on-curve tap (junction anchor — see tapCurveEdge): curve-style
    // does not disturb the B-106 tap surface.
    await tapCurveEdge(page);

    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-arc-endpoints')).toHaveText('Kotomine Church ↔ Fuyuki Bridge');
    // Authored display: walk is DISALLOWED on the demo edge and no other
    // mode exists, so no allowed-mode word renders (the panel lists allowed
    // modes only) — walk is absent from the allowed set, never silently
    // shown as usable.
    await expect(page.getByTestId('tme-arc-mode-walk')).toHaveCount(0);
    await expect(page.getByTestId('tme-arc-mode-car')).toHaveCount(0);
    await expect(page.getByTestId('tme-arc-mode-train')).toHaveCount(0);
    // Not blocked: the open state (curve-style is orthogonal to C2).
    await expect(page.getByTestId('tme-arc-open')).toBeVisible();
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveCount(0);
  });

  test('phone: the curve resolves at 375px with no layout overflow (F52/D53)', async ({ page }) => {
    test.skip(!isPhone(), 'the 375px geometry check belongs to the phone project (D53)');
    await page.setViewportSize({ width: 375, height: 667 });

    await expect.poll(() => readEdgeCurveStyle(page, DEMO_ARC.id)).toBe('unbundled-bezier');
    await expect.poll(() => readEdgeCurveStyle(page, CASTLE_ARC.id)).toBe('bezier');

    // D53: never horizontal scroll at 375px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);
  });
});
