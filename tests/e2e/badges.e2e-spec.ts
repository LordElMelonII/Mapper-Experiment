// tests/e2e/badges.e2e-spec.ts — PKG B-107: cross-layer endpoint badges with
// core-sourced cost. Runs under BOTH playwright projects (desktop + emulated
// phone with touch) — D53/F52 mobile-and-desktop parity is mandatory for
// every UI packet.
//
// Cited IDs:
//   C3        — cross-layer arcs render as BADGES at their on-layer endpoints
//               (the arc itself never renders as an edge on either layer —
//               the pinned p2m1 seam, preserved).
//   C10       — cross-layer arcs have NO geographic direction: no cardinal
//               token ever appears in badge text (§6.1 'Cross-layer edges
//               confuse users' — mitigation = endpoint badges with
//               destination/mode/cost; this is the comprehension check).
//   R1/C15/D72 — the badge's cost and unit are findRoute(endpoint → other)'s
//               own numbers ('300 min' for FX1's train arc); the UI computes
//               nothing.
//   D2/D7     — badges are projection pseudo-nodes riding cytoscape's
//               renderer (pan/zoom for free), styled by stylesheet data.
//   FX1       — exactly one cross-layer arc: arc-fuyuki-station-misaki-town
//               (fuyuki-station on Fuyuki ↔ misaki-town on Misaki, train 300
//               authoredMinutes, train-only).
//   F52/D53   — badge taps are genuine touchscreen taps on the phone project;
//               badges stay legible and inside the canvas at phone width with
//               no layout overflow.
//
// B-108 (verifier-gate fix, findings 1+2):
//   C2/F14    — the badge is the cross-layer arc's ONLY canvas surface: a
//               badge tap selects the ARC (edgeSelection — exactly an edge
//               tap's semantics, node selection cleared, never set), and the
//               badge TEXT carries the merged blocked reason
//               (`… · blocked: <reason>`, NO cost — the reason is the
//               payload, D65(b) spirit; no same-layer carve-out in F14/C2).
//   C17       — with the sole inter-layer arc blocked, pin → Misaki Town is
//               unreachable: the core's reason verbatim, never a number.
//   D20       — the overlay's reason wins the merge; Lift (overlay-only
//               delete) restores the routed badge text and the FX2 route.
//   D60(a)/D72/F32 — badges re-price through rebuildElements on a travel-
//               mode switch (finding 2): after Walk → Car → Walk the badge
//               is still exactly the FX1 string.
//   FX2       — pin → Misaki Town = 50 (walk) + 300 (train) = 350 min.
//
// Canvas content is read through the DEV-HARNESS-ONLY window.__TME_E2E__ hook
// (see src/app/app.ts): read-only projections of the cytoscape model. The
// hook is registered by the harness app only — the ST entry never ships it.
import { expect, test, type Locator, type Page } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  edgeLineStyle(id: string): string | null;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
  badgeText(arcId: string): string | null;
  zoom(): number;
}

const CROSS_LAYER_ARC = 'arc-fuyuki-station-misaki-town';
const BADGE_ID = `tme-badge-${CROSS_LAYER_ARC}`;

// FX1 facts, same derivation as the pinned p2m1 seam spec: 13 leaves + 2
// district containers on layer-fuyuki; exactly ['Misaki Town'] on layer-misaki.
const FUYUKI_LABELS = [
  'Miyama',
  'Shinto',
  'Emiya Residence',
  'Shopping District',
  'Homurahara Academy',
  'Matou Residence',
  'Tohsaka Residence',
  'Ryuudou Temple',
  'Outskirts',
  'Fuyuki Bridge',
  'Fuyuki Station',
  'Harbor',
  'Kotomine Church',
  'Ghost House',
  'Einzbern Castle',
] as const;

// C10: every cardinal the eight-way direction set (and its long forms) can
// contribute — NONE may appear as a word in badge text.
const CARDINALS = [
  'N',
  'NE',
  'E',
  'SE',
  'S',
  'SW',
  'W',
  'NW',
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const;
const CARDINAL_WORD = new RegExp(`\\b(${CARDINALS.join('|')})\\b`, 'i');

const isPhone = (): boolean => test.info().project.name === 'phone';

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const activate = async (locator: Locator): Promise<void> => {
  if (isPhone()) await locator.tap();
  else await locator.click();
};

const readBadgeText = (page: Page): Promise<string | null> =>
  page.evaluate((arcId): string | null => {
    // page.evaluate callbacks are serialized: the hook lookup is inlined
    // (same discipline as the other specs), no closures cross the wire.
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.badgeText(arcId);
  }, CROSS_LAYER_ARC);

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeLabels();
  });

const readEdgeStyle = (page: Page, id: string): Promise<string | null> =>
  page.evaluate((edgeId): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.edgeLineStyle(edgeId);
  }, id);

const readBadgeBox = (
  page: Page,
): Promise<{ x: number; y: number; w: number; h: number } | null> =>
  page.evaluate((badgeId): { x: number; y: number; w: number; h: number } | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedBoundingBox(badgeId);
  }, BADGE_ID);

const readBadgePoint = (page: Page): Promise<{ x: number; y: number } | null> =>
  page.evaluate((badgeId): { x: number; y: number } | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedPosition(badgeId);
  }, BADGE_ID);

const readZoom = (page: Page): Promise<number> =>
  page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.zoom();
  });

test.describe('cross-layer endpoint badges (PKG B-107 — C3/C10, R1/D72)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readLabels(page)).toContain('Emiya Residence');
  });

  test('Fuyuki badge: destination + mode + core cost with its D72 unit (C3, R1/C15/D72, FX1)', async ({
    page,
  }) => {
    // The §6.1 comprehension check: the badge at Fuyuki Station reads toward
    // the FAR endpoint, carries the arc's mode, and — because the core finds
    // a route — its cost labeled with the run's own currency (R1: '300' and
    // 'min' are findRoute's total/unit, never UI math).
    const text = await readBadgeText(page);
    expect(text).not.toBeNull();
    expect(text).toContain('Misaki Town');
    expect(text).toContain('train');
    expect(text).toContain('300 min'); // cost + unit adjacent — D72's label
  });

  test('no cardinal token ever appears in badge text — cross-layer has no direction (C10)', async ({
    page,
  }) => {
    const fuyuki = await readBadgeText(page);
    expect(fuyuki).not.toMatch(CARDINAL_WORD);

    // The far side's badge too — C10 holds on every layer, not just the first.
    await activate(page.getByTestId('tme-layer-layer-misaki'));
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']);
    const misaki = await readBadgeText(page);
    expect(misaki).not.toBeNull();
    expect(misaki).not.toMatch(CARDINAL_WORD);
  });

  test('Misaki layer: the badge follows the on-layer endpoint and names Fuyuki Station (C3, FX1)', async ({
    page,
  }) => {
    // The same arc's badge re-anchors to whichever endpoint is on the ACTIVE
    // layer — on Misaki it sits at misaki-town and reads toward Fuyuki
    // Station, with the same core-priced cost (R1/D72: symmetric 300 min).
    await activate(page.getByTestId('tme-layer-layer-misaki'));
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']);
    const text = await readBadgeText(page);
    expect(text).toContain('Fuyuki Station');
    expect(text).toContain('train');
    expect(text).toContain('300 min');
  });

  test('the arc itself still never renders as an edge on either layer (C3 — pinned p2m1 seam preserved)', async ({
    page,
  }) => {
    expect(await readEdgeStyle(page, CROSS_LAYER_ARC)).toBeNull(); // not on Fuyuki

    await activate(page.getByTestId('tme-layer-layer-misaki'));
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']);
    expect(await readEdgeStyle(page, CROSS_LAYER_ARC)).toBeNull(); // not on Misaki either
  });

  test('nodeLabels() stays the exact FX1 map-node sets — badges excluded (ruling 3, FX1/F01)', async ({
    page,
  }) => {
    const fuyuki = await readLabels(page);
    expect([...fuyuki].sort()).toEqual([...FUYUKI_LABELS].sort());

    await activate(page.getByTestId('tme-layer-layer-misaki'));
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']);
  });

  // B-108 finding 1.1 superseded B-107 ruling 3's "badge tap selects nothing
  // / the tap is swallowed" test: a badge tap now selects the ARC. The
  // corrected semantics — including this suite's original no-chip / no-route-
  // target / hint-verbatim assertions — live in the B-108 describe below.

  test('phone: badge drawn inside the canvas at 375px; no layout overflow (F52/D53)', async ({ page }) => {
    // Phone-width cell of the legibility family; the desktop twin is the
    // presence/text checks above at the desktop viewport (D53: one family,
    // both worlds — the narrow-viewport form is the touch project's).
    test.skip(!isPhone(), 'badge legibility under phone-width fit is the phone project (D53)');
    await page.setViewportSize({ width: 375, height: 667 });
    // The ResizeObserver re-sizes and re-fits cy — wait for the settled width.
    await expect
      .poll(async () => (await page.getByTestId('tme-canvas').boundingBox())?.width ?? 0)
      .toBeGreaterThan(370);

    const badge = await readBadgeBox(page);
    expect(badge).not.toBeNull();
    const box = await page.getByTestId('tme-canvas').boundingBox();
    if (box === null) throw new Error('canvas host not visible');
    const bb = badge as { x: number; y: number; w: number; h: number };
    // Fully on-screen (rendered coords are canvas-relative): the badge is
    // visible, not clipped by the narrow stage.
    expect(bb.x).toBeGreaterThanOrEqual(0);
    expect(bb.y).toBeGreaterThanOrEqual(0);
    expect(bb.x + bb.w).toBeLessThanOrEqual(box.width);
    expect(bb.y + bb.h).toBeLessThanOrEqual(box.height);
    // Drawn, not suppressed: canvas text scales with zoom like every other
    // label (D7) — the LABEL must dominate the box, taller than the 4px
    // invisible body's rendered envelope (≈ 6 model units incl. the
    // renderer's antialias expansion). A hidden/suppressed label collapses
    // the box to exactly that envelope (the min-zoomed-font-size trap —
    // verified semantics: it HIDES below-floor labels), so > 8·zoom proves
    // real rendered text (F52: the badge reads at phone width, and pinch-
    // zoom rescales it like any other label).
    const zoom = await readZoom(page);
    expect(bb.w).toBeGreaterThan(8 * zoom);
    expect(bb.h).toBeGreaterThan(8 * zoom);
    // §6.2/D53: badges are canvas-drawn — the narrow layout never overflows
    // horizontally (panels stack, the page never scrolls sideways).
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PKG B-108 — the badge is the cross-layer arc's management surface, and
// badges re-price on mode switches (verifier findings 1+2). Same file, both
// projects (desktop + emulated phone with touch) — D53/F52.
// ---------------------------------------------------------------------------

// C17: the core's verbatim reason when the graph is connected ignoring
// blocks but every candidate arc is blocked/disallowed (verified against
// src/core/facade.ts computeRoute — same constant as the arc-panel suite).
const BLOCKED_REASON_TEXT = 'every candidate arc is blocked or disallowed for this mode';

const PIN_ID = 'emiya-residence'; // FX1's pinned node (harness overlay)
const MISAKI_ID = 'misaki-town'; // the Misaki layer's only node

/** Two rAFs: panel open/close resizes the stage synchronously, but the
 *  ResizeObserver-driven re-fit runs just before the next paint — reading
 *  rendered positions inside that window yields pre-fit coordinates and the
 *  next tap misses (same discipline as arc-panel.e2e-spec.ts). */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** F52/D53: tap a canvas point — touchscreen on the phone project, mouse on
 *  desktop (unified cytoscape input, §6.2). */
const tapPoint = async (page: Page, x: number, y: number): Promise<void> => {
  if (isPhone()) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
};

const canvasBox = async (page: Page) => {
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return box;
};

const readNodePosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId): { x: number; y: number } | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedPosition(nodeId);
  }, id);

/** Tap a canvas node through its rendered position (seam + canvas box). */
const tapNode = async (page: Page, id: string): Promise<void> => {
  await settle(page);
  const pos = await readNodePosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await canvasBox(page);
  await tapPoint(page, box.x + pos.x, box.y + pos.y);
};

/**
 * Finding 1.1: tap the badge pseudo-node's rendered anchor — the cross-layer
 * arc's only canvas surface. Positions are re-read on every call: block/lift
 * rebuilds and panel open/close re-fit the view, so stale coordinates miss.
 */
const tapBadge = async (page: Page): Promise<void> => {
  await settle(page);
  const rel = await readBadgePoint(page);
  if (rel === null) throw new Error('badge not rendered (unmounted or absent)');
  const box = await canvasBox(page);
  await tapPoint(page, box.x + rel.x, box.y + rel.y);
};

test.describe('badge-tap arc management + badge re-pricing (PKG B-108 — findings 1+2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readLabels(page)).toContain('Emiya Residence');
    await expect.poll(() => readBadgeText(page)).not.toBeNull(); // FX1's badge is projected
  });

  test('badge tap opens the arc panel: endpoints + train mode; never a node selection (finding 1.1, C3/F14/D2)', async ({
    page,
  }) => {
    // A node selection exists FIRST — the badge tap must replace it with the
    // arc selection (B-106 mutual exclusion), never join it.
    const chip = page.getByTestId('tme-selection-chip');
    await expect(chip).toBeHidden();
    await tapNode(page, PIN_ID);
    await expect(chip).toBeVisible();
    await expect(page.getByTestId('tme-current-location')).toBeVisible(); // pin selected

    await tapBadge(page);

    // The ARC panel opens — exactly an edge tap's payload: authored
    // endpoints in authored order, the arc's own mode words, open state.
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-arc-endpoints')).toHaveText('Fuyuki Station ↔ Misaki Town');
    await expect(page.getByTestId('tme-arc-mode-train')).toBeVisible();
    await expect(page.getByTestId('tme-arc-mode-walk')).toHaveCount(0);
    await expect(page.getByTestId('tme-arc-open')).toBeVisible();
    // ...and the tap was still NOT a node selection: no chip, no route
    // target — the route panel back at its no-target state verbatim.
    await expect(chip).toBeHidden();
    await expect(page.getByTestId('tme-current-location')).toHaveCount(0);
    await expect(page.getByTestId('tme-target')).toBeHidden();
    await expect(page.getByTestId('tme-hint')).toHaveText('Tap a node on the map to route there from the pin.');
  });

  test('the cross-layer C2 loop via the badge: block with reason → reason in the badge, no cost, still no edge → unreachable verbatim → lift → 300/350 restored (C2, C3, C17, F14, D20, FX2)', async ({
    page,
  }) => {
    // Open the arc panel FROM THE BADGE and block the sole inter-layer arc
    // with a reason (F14 — no same-layer carve-out).
    await tapBadge(page);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await page.getByTestId('tme-arc-reason-input').fill('Line suspended');
    await activate(page.getByTestId('tme-arc-block'));

    // Finding 1.2 — C2's reason is the payload: the badge text carries
    // destination + mode + `blocked: <reason>` and NO cost, and the arc
    // STILL never renders as an edge (blocked state changes nothing about
    // the C3 seam — the badge remains its only surface).
    await expect.poll(() => readBadgeText(page)).toBe('Misaki Town · train · blocked: Line suspended');
    expect(await readEdgeStyle(page, CROSS_LAYER_ARC)).toBeNull();

    // The cross-layer C2 loop, live: with the only inter-layer arc blocked,
    // pin → Misaki Town is ok:false with the core's reason VERBATIM (C17 —
    // the same endpoints whose badge just dropped its cost).
    await activate(page.getByTestId('tme-layer-layer-misaki'));
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']);
    await tapNode(page, MISAKI_ID);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden(); // mutual exclusion
    await expect(page.getByTestId('tme-target')).toHaveText('Emiya Residence → Misaki Town');
    await expect(page.getByTestId('tme-unreachable')).toHaveText(BLOCKED_REASON_TEXT);
    await expect(page.getByTestId('tme-total')).toHaveCount(0);

    // C2: blocked ≠ hidden — the badge is still rendered (naming the far
    // endpoint, still carrying the reason), still tappable, and its panel
    // offers the lift. Lift ⇒ the badge back to its routed text…
    await expect.poll(() => readBadgeText(page)).toBe('Fuyuki Station · train · blocked: Line suspended');
    await tapBadge(page);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveText('Line suspended');
    await expect(page.getByTestId('tme-arc-lift')).toBeEnabled();
    await activate(page.getByTestId('tme-arc-lift'));
    await expect.poll(() => readBadgeText(page)).toBe('Fuyuki Station · train · 300 min');

    // …and the route restored: FX2 = 50 (walk) + 300 (train) = 350 min.
    await tapNode(page, MISAKI_ID);
    await expect(page.getByTestId('tme-leg').nth(0)).toHaveText('Emiya Residence → Fuyuki Station · walk · 50');
    await expect(page.getByTestId('tme-leg').nth(1)).toHaveText('Fuyuki Station → Misaki Town · train · 300');
    await expect(page.getByTestId('tme-total')).toHaveText('350 min');
  });

  test('mode switches re-price badges: Walk → Car → Walk keeps the exact FX1 badge (finding 2, D60(a)/F32/D72)', async ({
    page,
  }) => {
    // FX1's badge with its cost. The sole cross-layer arc is train-only, so
    // D60(a) per-arc fallback keeps the price across preferences — which is
    // exactly why finding 2 was invisible on FX1; this regression proves the
    // rebuild neither drops the badge nor corrupts its text.
    await expect.poll(() => readBadgeText(page)).toBe('Misaki Town · train · 300 min');

    await activate(page.getByTestId('tme-mode-car'));
    await expect(page.getByTestId('tme-mode-car')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => readBadgeText(page)).toBe('Misaki Town · train · 300 min');

    await activate(page.getByTestId('tme-mode-walk'));
    await expect(page.getByTestId('tme-mode-walk')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => readBadgeText(page)).toBe('Misaki Town · train · 300 min');
  });

  test('phone: the full cross-layer C2 loop by touch at 375px, no horizontal scroll (F52/D53)', async ({ page }) => {
    test.skip(!isPhone(), 'the 375px touch loop belongs to the phone project (D53)');
    await page.setViewportSize({ width: 375, height: 667 });
    // The ResizeObserver re-sizes and re-fits cy — wait for the settled width.
    await expect
      .poll(async () => (await page.getByTestId('tme-canvas').boundingBox())?.width ?? 0)
      .toBeGreaterThan(370);

    // The whole loop by touch (tapBadge/tapNode use touchscreen.tap here).
    await tapBadge(page);
    await expect(page.getByTestId('tme-arc-endpoints')).toHaveText('Fuyuki Station ↔ Misaki Town');

    // F52: the reason input and Block are >= 44px tap targets while the
    // panel is open (Lift is asserted once the block exists).
    for (const testId of ['tme-arc-reason-input', 'tme-arc-block']) {
      const box = await page.getByTestId(testId).boundingBox();
      if (box === null) throw new Error(`${testId} not visible`);
      expect(box.height, `${testId} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${testId} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }

    await page.getByTestId('tme-arc-reason-input').fill('Line suspended');
    await activate(page.getByTestId('tme-arc-block'));
    await expect.poll(() => readBadgeText(page)).toBe('Misaki Town · train · blocked: Line suspended');

    await activate(page.getByTestId('tme-layer-layer-misaki'));
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']);
    await tapNode(page, MISAKI_ID);
    await expect(page.getByTestId('tme-unreachable')).toHaveText(BLOCKED_REASON_TEXT);

    await tapBadge(page); // blocked ≠ hidden — the badge is still the surface
    await expect(page.getByTestId('tme-arc-lift')).toBeEnabled();
    await activate(page.getByTestId('tme-arc-lift'));
    await expect.poll(() => readBadgeText(page)).toBe('Fuyuki Station · train · 300 min');

    await tapNode(page, MISAKI_ID);
    await expect(page.getByTestId('tme-total')).toHaveText('350 min'); // FX2 restored by touch

    // D53: never horizontal scroll at 375px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);
  });
});
