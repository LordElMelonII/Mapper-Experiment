// tests/e2e/arc-panel.e2e-spec.ts — PKG B-106: edge selection + the
// chat-scoped blocked toggle with reason input, proven at BOTH playwright
// projects (desktop + emulated phone with touch) per D53/F52.
//
// Cited IDs:
//   C2      — blocked ≠ hidden: the blocked arc stays DRAWN (dashed via the
//             edgeLineStyle seam) and still TAPPABLE (the lift is always
//             reachable); excluded from routing with its reason kept.
//   C17/F24 — the route panel renders the core's unreachable reason verbatim,
//             never a number, never ∞ — and it flips LIVE when the only road
//             closes/opens (graphRevision is the route computed's dep).
//   C30     — the facade refuses an empty-string reason; the UI stays honest
//             by disabling Block while the trimmed input is empty (§6.2: the
//             facade validates, the UI disables).
//   D20     — chat-scoped overlay block vs library-level authored block: the
//             overlay can add/restate but never lift an authored block
//             (FX1's bridge arc: 'Bridge closed by local authorities').
//   D2      — edge taps are discrete gestures; the signal writes are the
//             sanctioned path (no high-frequency binding).
//   F14     — an arc can be impassable with a reason: excluded from routing,
//             still drawn dashed, still reported with its reason.
//   F52/D53 — every flow runs at both viewports; canvas edge taps are genuine
//             touchscreen taps on the phone project (midpoint of the two
//             endpoints' rendered positions — TEST-side math, R1-safe: the UI
//             computes nothing); all controls >= 44px, no hover affordances.
//
// PKG B-131 (§5 Phase 3.5 M5, D94/F55) extends this suite: the ONE-TAP
// "Block access" beside the typed Block — the trimmed input when non-empty,
// else the ONE shared default reason ('Closed'), no typing required; the
// typed F14 flow and its testids stay byte-untouched.
//
// FX1 facts (data/worlds/fuyuki.ts): arc-outskirts-einzbern-castle is the
// ONLY arc into Einzbern Castle (walk 240 / car 60); the walk route to the
// castle is 'Emiya Residence → Outskirts · walk · 30' + 'Outskirts →
// Einzbern Castle · walk · 240' = 270 min; arc-emiya-residence-fuyuki-bridge
// carries FX1's authored block sample.
import { expect, test, type Page } from '@playwright/test';

interface TmeE2EHook {
  edgeLineStyle(id: string): string | null;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
}

/** FX1 arc facts: id + its two endpoint node ids (tap targets' anchors). */
interface ArcFact {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

const CASTLE_ARC: ArcFact = { id: 'arc-outskirts-einzbern-castle', source: 'outskirts', target: 'einzbern-castle' };
const BRIDGE_ARC: ArcFact = {
  id: 'arc-emiya-residence-fuyuki-bridge',
  source: 'emiya-residence',
  target: 'fuyuki-bridge',
};

const CASTLE_ID = 'einzbern-castle';
const CASTLE_LABEL = 'Einzbern Castle';

// C17: the core's verbatim reason when the graph is connected ignoring
// blocks but every candidate arc is blocked/disallowed (verified against
// src/core/facade.ts computeRoute).
const BLOCKED_REASON_TEXT = 'every candidate arc is blocked or disallowed for this mode';

const isPhone = (): boolean => test.info().project.name === 'phone';

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId): { x: number; y: number } | null => {
    // page.evaluate callbacks are serialized: the hook lookup is inlined
    // (same discipline as the other specs), no closures cross the wire.
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedPosition(nodeId);
  }, id);

const readEdgeLineStyle = (page: Page, edgeId: string): Promise<string | null> =>
  page.evaluate((id): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.edgeLineStyle(id);
  }, edgeId);

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
};

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

/**
 * Wait two animation frames: panel open/close changes the stage size
 * synchronously, but the ResizeObserver-driven re-fit (B-106) runs just
 * before the next paint — reading rendered positions inside that window
 * yields pre-fit coordinates and the next tap misses. Two rAFs put every
 * helper read AFTER the refit (deterministic, no arbitrary timeout).
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
  const pos = await readPosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await canvasBox(page);
  await tapPoint(page, box.x + pos.x, box.y + pos.y);
};

/**
 * Tap an arc through the RENDERED MIDPOINT of its two endpoints (ruling 2).
 * Edges are map content, not 44px controls: the installed cytoscape runtime
 * (3.34.3, findNearestElements/checkEdge) hit-tests an edge within
 * width/2 + (touch 24 : mouse 8)/zoom model units of the rendered line, and
 * the midpoint is equidistant-far from both 44px node bodies, so the tap
 * lands the EDGE on both input paths. This midpoint is TEST-side math — the
 * UI computes nothing (R1). Re-reads positions on every call: a block/lift
 * rebuild re-fits the view, so stale coordinates would miss.
 */
const tapEdgeMidpoint = async (page: Page, arc: ArcFact): Promise<void> => {
  await settle(page); // panel open/close re-fits asynchronously — read post-fit
  const source = await readPosition(page, arc.source);
  const target = await readPosition(page, arc.target);
  if (source === null || target === null) {
    throw new Error(`arc ${arc.id} endpoints not rendered (unmounted or absent)`);
  }
  const box = await canvasBox(page);
  const x = box.x + (source.x + target.x) / 2;
  const y = box.y + (source.y + target.y) / 2;
  await tapPoint(page, x, y);
};

test.describe('arc panel + blocked toggle (PKG B-106)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    // First paint is Fuyuki (loadMap's first layer) with the castle arc's
    // endpoints rendered.
    await expect.poll(() => readPosition(page, CASTLE_ARC.source)).not.toBeNull();
    await expect.poll(() => readPosition(page, CASTLE_ARC.target)).not.toBeNull();
  });

  test('tap the castle arc: panel shows endpoints and authored modes (F14, D2)', async ({ page }) => {
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden(); // ruling 1: no edge selected yet

    await tapEdgeMidpoint(page, CASTLE_ARC);

    // Authored endpoint labels in authored order (source ↔ target), verbatim.
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-arc-endpoints')).toHaveText('Outskirts ↔ Einzbern Castle');
    // Authored allowed modes, as authored words: walk + car (FX1's TRANSIT arc).
    await expect(page.getByTestId('tme-arc-mode-walk')).toBeVisible();
    await expect(page.getByTestId('tme-arc-mode-car')).toBeVisible();
    await expect(page.getByTestId('tme-arc-mode-train')).toHaveCount(0);
    // No block: the open state, no reason row, no lift (ruling 3).
    await expect(page.getByTestId('tme-arc-open')).toBeVisible();
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveCount(0);
    await expect(page.getByTestId('tme-arc-lift')).toHaveCount(0);
  });

  test('the C2 loop live: block → dashed + verbatim unreachable reason → lift → restored (C2, C17, F14)', async ({
    page,
  }) => {
    // Pre-state: the walk route to the castle is 270 min (FX1 facts).
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-leg').nth(0)).toHaveText('Emiya Residence → Outskirts · walk · 30');
    await expect(page.getByTestId('tme-leg').nth(1)).toHaveText('Outskirts → Einzbern Castle · walk · 240');
    await expect(page.getByTestId('tme-total')).toHaveText('270 min');

    // Block the ONLY road (chat-scoped, reason 'Rockslide').
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await page.getByTestId('tme-arc-reason-input').fill('Rockslide');
    await activate(page, 'tme-arc-block');

    // C2: the arc is excluded from routing but stays DRAWN — dashed (seam).
    await expect.poll(() => readEdgeLineStyle(page, CASTLE_ARC.id)).toBe('dashed');
    // The panel now shows the overlay's reason (graphRevision re-read).
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveText('Rockslide');

    // C17 live: selecting the castle flips the sidebar to ok:false with the
    // core's reason VERBATIM (the route computed's graphRevision dep) — the
    // same selection that read 270 min before the block.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await expect(page.getByTestId('tme-unreachable')).toHaveText(BLOCKED_REASON_TEXT);
    await expect(page.getByTestId('tme-leg')).toHaveCount(0);
    await expect(page.getByTestId('tme-total')).toHaveCount(0);

    // C2 again: blocked ≠ hidden — the DASHED arc is still tappable; the
    // panel re-opens showing the live overlay reason, and Lift is offered.
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveText('Rockslide');
    await expect(page.getByTestId('tme-arc-lift')).toBeEnabled();

    // Lift: the overlay entry is deleted — solid again, open state, route back.
    await activate(page, 'tme-arc-lift');
    await expect.poll(() => readEdgeLineStyle(page, CASTLE_ARC.id)).toBe('solid');
    await expect(page.getByTestId('tme-arc-open')).toBeVisible();
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveCount(0);

    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-unreachable')).toHaveCount(0);
    await expect(page.getByTestId('tme-leg')).toHaveCount(2);
    await expect(page.getByTestId('tme-total')).toHaveText('270 min');
  });

  test('authored block: reason verbatim, Lift disabled, authored note (D20, F14)', async ({ page }) => {
    await tapEdgeMidpoint(page, BRIDGE_ARC);

    await expect(page.getByTestId('tme-arc-endpoints')).toHaveText('Emiya Residence ↔ Fuyuki Bridge');
    // FX1's authored sample, verbatim (D20: library-level block).
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveText('Bridge closed by local authorities');
    // The facade contract: the overlay can add but never lift an authored
    // block — Lift is visibly disabled with the static note, never hidden.
    const lift = page.getByTestId('tme-arc-lift');
    await expect(lift).toBeVisible();
    await expect(lift).toBeDisabled();
    await expect(page.getByTestId('tme-arc-authored-note')).toBeVisible();
    await expect(page.getByTestId('tme-arc-authored-note')).toHaveText('authored — the chat cannot lift it');
  });

  test('Block disabled while the reason is empty or whitespace (C30, §6.2 honesty)', async ({ page }) => {
    await tapEdgeMidpoint(page, CASTLE_ARC);

    const block = page.getByTestId('tme-arc-block');
    await expect(block).toBeVisible();
    await expect(block).toBeDisabled(); // empty input

    await page.getByTestId('tme-arc-reason-input').fill('   '); // whitespace only
    await expect(block).toBeDisabled();

    await page.getByTestId('tme-arc-reason-input').fill('Rockslide'); // a real reason
    await expect(block).toBeEnabled();
  });

  // --- PKG B-131 (§5 Phase 3.5 M5, D94/F55): the ONE-TAP "Block access" ----

  test('one-tap Block access: blocked with the default reason, no typing; a real reason restates; lift unchanged (D94/F55, C2)', async ({
    page,
  }) => {
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();

    // Pristine input: the typed Block is C30-disabled while the one-tap is
    // not — it applies the ONE shared default reason (D94's authored
    // 'Closed') with no typing at all.
    await expect(page.getByTestId('tme-arc-block')).toBeDisabled();
    await activate(page, 'tme-arc-block-access');

    // Blocked: the reason verbatim in the panel, dashed on the canvas — the
    // typed flow's C2 visuals are shared (excluded from routing, still drawn).
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveText('Closed');
    await expect.poll(() => readEdgeLineStyle(page, CASTLE_ARC.id)).toBe('dashed');

    // F52: the one-tap is a full tap target (both projects).
    const box = await page.getByTestId('tme-arc-block-access').boundingBox();
    if (box === null) throw new Error('tme-arc-block-access not visible');
    expect(box.height, 'tme-arc-block-access height >= 44px (F52)').toBeGreaterThanOrEqual(44);
    expect(box.width, 'tme-arc-block-access width >= 44px (F52)').toBeGreaterThanOrEqual(44);

    // Refinement: type the real reason, tap the typed Block — adds-or-restates
    // (the facade contract; the F14 typed flow itself is byte-untouched and
    // already pinned by the C2-loop cell above).
    await page.getByTestId('tme-arc-reason-input').fill('Rockslide');
    await activate(page, 'tme-arc-block');
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveText('Rockslide');

    // Lift unchanged (C2): the overlay delete — solid again, open state.
    await expect(page.getByTestId('tme-arc-lift')).toBeEnabled();
    await activate(page, 'tme-arc-lift');
    await expect.poll(() => readEdgeLineStyle(page, CASTLE_ARC.id)).toBe('solid');
    await expect(page.getByTestId('tme-arc-open')).toBeVisible();
  });

  test('mutual exclusion: node tap hides the arc panel; edge tap clears the chip (ruling 1, D2)', async ({
    page,
  }) => {
    // Edge selected: the arc panel is open, no node chip.
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();

    // Node tap: the arc panel hides, the chip shows the node's label.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(CASTLE_LABEL);

    // Edge tap again: the chip hides, the arc panel returns.
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
  });

  test('phone: the full C2 loop by touch alone at 375px, no horizontal scroll (F52/D53)', async ({ page }) => {
    test.skip(!isPhone(), 'the 375px panel-geometry check belongs to the phone project (D53)');
    await page.setViewportSize({ width: 375, height: 667 });

    // The whole flow by touch: edge tap → panel; reason + Block → dashed +
    // reason shown; node tap → verbatim unreachable; dashed re-tap → panel;
    // Lift → solid; node tap → 270 min restored.
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-endpoints')).toHaveText('Outskirts ↔ Einzbern Castle');

    // F52: the input and Block are >= 44px tap targets while the panel is
    // open (Lift is asserted once a block exists — no Lift row renders on an
    // open arc, ruling 3).
    for (const testId of ['tme-arc-reason-input', 'tme-arc-block']) {
      const box = await page.getByTestId(testId).boundingBox();
      if (box === null) throw new Error(`${testId} not visible`);
      expect(box.height, `${testId} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${testId} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }

    await page.getByTestId('tme-arc-reason-input').fill('Rockslide');
    await activate(page, 'tme-arc-block');
    await expect.poll(() => readEdgeLineStyle(page, CASTLE_ARC.id)).toBe('dashed');
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveText('Rockslide');
    const liftBox = await page.getByTestId('tme-arc-lift').boundingBox();
    if (liftBox === null) throw new Error('tme-arc-lift not visible');
    expect(liftBox.height, 'tme-arc-lift height >= 44px (F52)').toBeGreaterThanOrEqual(44);
    expect(liftBox.width, 'tme-arc-lift width >= 44px (F52)').toBeGreaterThanOrEqual(44);

    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-unreachable')).toHaveText(BLOCKED_REASON_TEXT);

    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveText('Rockslide');
    await activate(page, 'tme-arc-lift');
    await expect.poll(() => readEdgeLineStyle(page, CASTLE_ARC.id)).toBe('solid');

    // Route restored by touch: the walk route to the castle is back.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-total')).toHaveText('270 min');

    // D53: never horizontal scroll at 375px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);

    // D53: with the arc panel open again (re-tap the open arc), its content
    // sits inside the viewport and its own overflow never scrolls the page.
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    const panelFits = await page.evaluate((): boolean => {
      const panel = document.querySelector('tme-arc-panel');
      if (panel === null) throw new Error('arc panel host not found');
      const box = panel.getBoundingClientRect();
      return box.y + box.height <= window.innerHeight && panel.scrollWidth <= panel.clientWidth + 1;
    });
    expect(panelFits, 'arc panel fully visible at 375px (D53)').toBe(true);
  });
});
