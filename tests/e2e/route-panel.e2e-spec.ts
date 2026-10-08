// tests/e2e/route-panel.e2e-spec.ts — PKG B-105: the M2 route sidebar — tap a
// node to route there from the pin; per-leg detail, the D72 total+unit, the
// travel-mode preference switch, and the pin-incident blocked-arc reasons
// (the M1 deferral, discharged) — at BOTH playwright projects (desktop +
// emulated phone with touch) per D53/F52.
//
// Cited IDs:
//   C2      — a blocked arc is excluded from routing but remains listed with
//             its reason: the "Blocked here" section shows label + reason
//             verbatim (the M1 deferral named M2's routing panel as home).
//   C15/D72 — one currency per route; the total line carries the unit ONCE
//             ('50 min', '350 min'); per-leg rows show the cost number only.
//   C17/F24 — unreachable ⇒ the reason verbatim, never a number, never ∞
//             (rendered branch; FX1 has no unreachable target from the pin).
//   C18     — legs are the unit of UI display: arc from→to, mode, cost, in
//             order (FX2's walk-then-train shape).
//   C19     — snapshot routes carry pin-incident blocked arcs (D65(b): always
//             list, currency-neutral).
//   D19/F32 — routing picks the best mode per route; overlay.travelMode is a
//             per-arc PREFERENCE (D60(a)) — preference beats price within a
//             currency, so no 'auto' option exists.
//   D53/F52 — every flow below runs at both viewports; node taps are genuine
//             touchscreen taps on the phone project, clicks on desktop; all
//             controls >= 44px, no hover-only affordances.
//   C3/FX2  — routing is layer-agnostic: the route to a node on the OTHER
//             layer renders while the viewer shows that layer.
//
// PKG B-131 (§5 Phase 3.5 M5, D94/F55/C34) extends this suite: the
// blocked-NODES sibling list — the snapshot's blockedNodes projection
// rendered verbatim (label + reason) beside the pin-incident blocked-arc
// list, absent when nothing is blocked.
//
// PKG B-141 (docs/ui-restyle/REPAIRS.md R1) adds one desktop-only cell: with
// the property panel open in editor mode, the unplaced route floater anchors
// OPPOSITE the property panel (the owner's stagger) — the priced route's box
// is on-screen and disjoint from the property panel's box while the rail's
// Route toggle reports pressed.
//
// PKG B-145 (REPAIRS R-5) re-baseline: the blocked-nodes cell's one-tap
// Block access now sits behind its collapsed section toggle — the cell
// expands the section first (cited in-file, R23).
//
// Canvas nodes are tapped through their RENDERED positions (the
// DEV-HARNESS-ONLY window.__TME_E2E__ seam, src/app/app.ts) — real pixels,
// both worlds, no locator-on-canvas cheating.
import { expect, test, type Locator, type Page } from '@playwright/test';

interface TmeE2EHook {
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
}

// FX1 facts (data/worlds/fuyuki.ts): the pin, the walk-50 arc to the station,
// the train-300 cross-layer arc, the walk-240/car-60 castle arc, and the
// pin-incident blocked bridge with its authored reason.
const PIN_ID = 'emiya-residence';
const STATION_ID = 'fuyuki-station';
const MISAKI_ID = 'misaki-town';
const CASTLE_ID = 'einzbern-castle';
const OUTSKIRTS_ID = 'outskirts'; // the B-131 blocking cell's leaf node

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

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId): { x: number; y: number } | null => {
    // page.evaluate callbacks are serialized: the hook lookup is inlined
    // (same discipline as the other specs), no closures cross the wire.
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedPosition(nodeId);
  }, id);

/**
 * Wait two animation frames: editor-mode toggles and panel open/close change
 * the stage size synchronously, but the ResizeObserver-driven re-fit runs
 * just before the next paint — reads inside that window aim at stale
 * coordinates (the settle precedent from the other specs).
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** F52/D53: tap a canvas node through its rendered position — touch on the
 *  phone project (genuine touchscreen), mouse click on desktop. */
const tapNode = async (page: Page, id: string): Promise<void> => {
  const pos = await readPosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  const x = box.x + pos.x;
  const y = box.y + pos.y;
  if (isPhone()) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
};

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
};

const legRow = (page: Page, index: number): Locator => page.getByTestId('tme-leg').nth(index);

test.describe('route sidebar (PKG B-105)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    // First paint is Fuyuki (loadMap's first layer) with the pin rendered.
    await expect.poll(() => readPosition(page, PIN_ID)).not.toBeNull();
  });

  test('tap Fuyuki Station: one walk leg, total with the unit once (C18, C15/D72, FX1)', async ({
    page,
  }) => {
    // No-selection hint before any tap (the panel's empty state). B-114
    // (ruling 6, deliberate): at narrow widths the panel starts as a
    // COLLAPSED sheet — the hint lives behind the rail, and the rail is the
    // always-visible affordance; desktop keeps the always-open sidebar.
    if (isPhone()) {
      await expect(page.getByTestId('tme-sheet-rail')).toBeVisible();
      await expect(page.getByTestId('tme-hint')).toBeHidden();
    } else {
      await expect(page.getByTestId('tme-hint')).toBeVisible();
    }
    await expect(page.getByTestId('tme-leg')).toHaveCount(0);

    await tapNode(page, STATION_ID);

    // C18: one leg — authored labels via the id lookup, mode and cost verbatim
    // from the core's RouteLeg; the cost NUMBER only (C15/D72: unit is the
    // total line's, once).
    await expect(page.getByTestId('tme-leg')).toHaveCount(1);
    await expect(legRow(page, 0)).toHaveText('Emiya Residence → Fuyuki Station · walk · 50');
    await expect(page.getByTestId('tme-total')).toHaveText('50 min');
    // R1: the target line is core/authored strings — the pin's snapshot label
    // → the tapped node's label.
    await expect(page.getByTestId('tme-target')).toContainText('Emiya Residence');
    await expect(page.getByTestId('tme-target')).toContainText('Fuyuki Station');
  });

  test('route to the other layer: FX2 two legs, walk then train, 350 min (C18, C3, FX2)', async ({
    page,
  }) => {
    // Switch the viewer to the target's layer first — the route must survive
    // the target living on the other plane (routing is layer-agnostic, C3).
    await activate(page, 'tme-layer-layer-misaki');
    await expect.poll(() => readPosition(page, MISAKI_ID)).not.toBeNull();

    await tapNode(page, MISAKI_ID);

    // FX2's normative route: walk 50 + train 300 = 350 min, in order.
    await expect(page.getByTestId('tme-leg')).toHaveCount(2);
    await expect(legRow(page, 0)).toHaveText('Emiya Residence → Fuyuki Station · walk · 50');
    await expect(legRow(page, 1)).toHaveText('Fuyuki Station → Misaki Town · train · 300');
    await expect(page.getByTestId('tme-total')).toHaveText('350 min');
    await expect(page.getByTestId('tme-target')).toContainText('Misaki Town');
  });

  test('mode switch re-prices per arc: preference beats price within a currency (D60(a), D19/F32)', async ({
    page,
  }) => {
    await expect.poll(() => readPosition(page, CASTLE_ID)).not.toBeNull();
    await tapNode(page, CASTLE_ID);

    // Walk preference (the overlay default): the castle arc prefers walk —
    // 240, not the cheaper car 60 (preference beats price, D60(a)).
    await expect(legRow(page, 0)).toHaveText('Emiya Residence → Outskirts · walk · 30');
    await expect(legRow(page, 1)).toHaveText('Outskirts → Einzbern Castle · walk · 240');
    await expect(page.getByTestId('tme-total')).toHaveText('270 min');
    await expect(page.getByTestId('tme-mode-walk')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tme-mode-car')).toHaveAttribute('aria-pressed', 'false');

    // One tap on Car — the overlay preference flips through the facade (R2)
    // and the computed re-prices: the castle leg becomes car 60, the
    // walk-only leg to Outskirts is UNCHANGED (D60(a) falls back per arc).
    await activate(page, 'tme-mode-car');
    await expect(legRow(page, 0)).toHaveText('Emiya Residence → Outskirts · walk · 30');
    await expect(legRow(page, 1)).toHaveText('Outskirts → Einzbern Castle · car · 60');
    await expect(page.getByTestId('tme-total')).toHaveText('90 min');
    await expect(page.getByTestId('tme-mode-car')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tme-mode-walk')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Blocked here lists the pin-incident blocked arc, label + reason verbatim (C2, C19)', async ({
    page,
  }) => {
    // Selection-independent: the pin's blocked neighborhood lists on load —
    // excluded from routing, never hidden, reason verbatim (the M1 deferral).
    // B-114 (ruling 6, deliberate): at narrow widths the collapsed sheet puts
    // the list one explicit rail tap away — reachable, never gone (C2);
    // desktop keeps the always-open sidebar that lists at load.
    if (isPhone()) {
      await activate(page, 'tme-sheet-rail');
      await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    }
    await expect(page.getByTestId('tme-blocked')).toBeVisible();
    await expect(page.getByTestId('tme-blocked-item')).toHaveCount(1);
    await expect(page.getByTestId('tme-blocked-label')).toHaveText('Fuyuki Bridge');
    await expect(page.getByTestId('tme-blocked-reason')).toHaveText(
      'Bridge closed by local authorities',
    );
  });

  // --- PKG B-131 (§5 Phase 3.5 M5, D94/F55/C34): the blocked-nodes list ----

  test('blocked nodes list beside the blocked arcs: label + reason verbatim (D94/F55, C34, R4)', async ({
    page,
  }) => {
    // FX1 blocks no NODE: the sibling list is ABSENT (omitted entirely when
    // empty — the snapshot's shape), while the pin-incident blocked ARC
    // lists. B-114: one rail tap opens the collapsed phone sheet.
    if (isPhone()) {
      await activate(page, 'tme-sheet-rail');
      await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    }
    await expect(page.getByTestId('tme-blocked')).toBeVisible();
    await expect(page.getByTestId('tme-blocked-nodes')).toHaveCount(0);

    // Block a leaf node through the property panel's one-tap (D94/F55):
    // editor mode, select Outskirts, Block access on the pristine input.
    // B-145 (R-5) re-baseline: Block access renders behind its collapsed
    // section toggle — expand first (R23: cited, never silent).
    await activate(page, 'tme-editor-toggle');
    await settle(page);
    await tapNode(page, OUTSKIRTS_ID);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    // Idempotent (the portals unwire probe): tap only when collapsed.
    if ((await page.getByTestId('tme-node-section-block').getAttribute('aria-expanded')) !== 'true') {
      await activate(page, 'tme-node-section-block');
    }
    await expect(page.getByTestId('tme-node-section-block')).toHaveAttribute('aria-expanded', 'true');
    await activate(page, 'tme-node-block');
    await expect(page.getByTestId('tme-node-block-reason')).toHaveText('Closed');
    // Exit editor — the block is chat-scoped overlay state, it survives.
    await activate(page, 'tme-editor-toggle');

    // The snapshot listing renders label + reason BESIDE the arc list (the
    // blocked nodes are NOT pin-incident-scoped — the snapshot listing is
    // the projection, R4; the panel recomputes nothing, R1). Editor exit
    // auto-expands the phone sheet with the selection live (B-114 ruling 2);
    // open it explicitly only if it is not already showing.
    if (isPhone()) {
      const body = page.getByTestId('tme-sheet-body');
      if (!(await body.isVisible())) await activate(page, 'tme-sheet-rail');
      await expect(body).toBeVisible();
    }
    await expect(page.getByTestId('tme-blocked-nodes')).toBeVisible();
    await expect(page.getByTestId('tme-blocked-node-item')).toHaveCount(1);
    await expect(page.getByTestId('tme-blocked-node-label')).toHaveText('Outskirts');
    await expect(page.getByTestId('tme-blocked-node-reason')).toHaveText('Closed');
    // Coexistence: the pin-incident arc list is untouched beside it.
    await expect(page.getByTestId('tme-blocked')).toBeVisible();
    await expect(page.getByTestId('tme-blocked-item')).toHaveCount(1);
    await expect(page.getByTestId('tme-blocked-label')).toHaveText('Fuyuki Bridge');
  });

  // --- PKG B-141 (docs/ui-restyle/REPAIRS.md R1, the owner's stagger) ------

  test('editor mode, both floaters open: the priced route never hides under the property panel (B-141/R1, D91)', async ({
    page,
  }) => {
    // The same-anchor stagger is a WIDE-floater rule: phone sheets stack by
    // contract (the B-129 cap arithmetic) and never share the dose anchors.
    test.skip(
      isPhone(),
      'the route-vs-property anchor stagger is desktop geometry (R1); phone sheets stack by contract',
    );

    // The R1 collision case, reproduced live: a library-node tap in editor
    // mode opens the property panel (B-117) WHILE the route auto-floats with
    // its content (the routePanelOpen rule) — both wide floaters open,
    // neither placed (fresh page, no drag).
    await activate(page, 'tme-editor-toggle');
    await settle(page);
    await tapNode(page, STATION_ID);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await expect(page.getByTestId('tme-total')).toHaveText('50 min');

    // Toggle honesty (R1): the rail's Route toggle keeps reporting the panel
    // open — and with occlusion impossible by construction the pressed state
    // reflects real visibility (routePanelOpen is untouched; no code change).
    const routeToggle = page.getByTestId('tme-route-toggle');
    await expect(routeToggle).toBeVisible();
    await expect(routeToggle).toHaveAttribute('aria-pressed', 'true');

    // The route panel's visible surface is on-screen and the route TOTAL
    // (the priced route) sits OUTSIDE the property panel's box — never
    // covering the product's payoff (R1 acceptance).
    const routeBox = await page.getByTestId('tme-route-panel').boundingBox();
    if (routeBox === null) throw new Error('tme-route-panel not visible');
    const totalBox = await page.getByTestId('tme-total').boundingBox();
    if (totalBox === null) throw new Error('tme-total not visible');
    const propBox = await page.getByTestId('tme-property-panel').boundingBox();
    if (propBox === null) throw new Error('tme-property-panel not visible');

    const viewport = page.viewportSize();
    if (viewport === null) throw new Error('no viewport');
    for (const [name, box] of [
      ['tme-route-panel', routeBox],
      ['tme-total', totalBox],
    ] as const) {
      expect(box.x, `${name} on-screen left (R1)`).toBeGreaterThanOrEqual(0);
      expect(box.y, `${name} on-screen top (R1)`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${name} on-screen right (R1)`).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height, `${name} on-screen bottom (R1)`).toBeLessThanOrEqual(
        viewport.height,
      );
    }

    // AABB disjointness (edge-touching allowed): the staggered anchors put
    // the two floaters on opposite sides, so no box intersection survives —
    // with either fade's collision case (same side, both defaults).
    const disjoint = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ): boolean =>
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y;
    expect(
      disjoint(totalBox, propBox),
      'the route total is not covered by the property panel (R1)',
    ).toBe(true);
    expect(
      disjoint(routeBox, propBox),
      'the route panel surface does not intersect the property panel (R1)',
    ).toBe(true);
  });

  test('tap the pin: current-location state, no route numbers (ruling 6)', async ({ page }) => {
    await tapNode(page, PIN_ID);

    await expect(page.getByTestId('tme-current-location')).toBeVisible();
    await expect(page.getByTestId('tme-current-location')).toHaveText(
      'Current location: Emiya Residence',
    );
    // No findRoute ran: no legs, no total, no unreachable reason.
    await expect(page.getByTestId('tme-leg')).toHaveCount(0);
    await expect(page.getByTestId('tme-total')).toHaveCount(0);
    await expect(page.getByTestId('tme-unreachable')).toHaveCount(0);
  });

  test('phone: panel fully visible and operable at 375px, touch alone (F52/D53)', async ({ page }) => {
    test.skip(!isPhone(), 'the 375px panel-geometry check belongs to the phone project (D53)');
    await page.setViewportSize({ width: 375, height: 667 });

    // B-114 (ruling 6, deliberate re-pin): at idle the panel is the collapsed
    // sheet — the rail is the visible, ≥44px affordance; the node tap below
    // auto-expands the body (zero extra taps preserved, B-114 ruling 2).
    const rail = page.getByTestId('tme-sheet-rail');
    await expect(rail).toBeVisible();
    await expect(rail).toHaveAttribute('aria-expanded', 'false');
    const railBox = await rail.boundingBox();
    if (railBox === null) throw new Error('tme-sheet-rail not visible');
    expect(railBox.height, 'tme-sheet-rail height >= 44px (F52)').toBeGreaterThanOrEqual(44);

    // The whole flow by touch: tap a node → the sheet auto-expands → route renders.
    await tapNode(page, STATION_ID);
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    await expect(legRow(page, 0)).toHaveText('Emiya Residence → Fuyuki Station · walk · 50');
    await expect(page.getByTestId('tme-total')).toHaveText('50 min');

    // The mode switch works by touch and re-prices the walk route (nothing
    // cheaper exists to the station — the walk 50 stays, proving the tap took
    // without depending on a car arc at the pin).
    await activate(page, 'tme-mode-train');
    await expect(page.getByTestId('tme-mode-train')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tme-total')).toHaveText('50 min');

    // D53: never horizontal scroll at 375px — the app root fits its client
    // width exactly.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);

    // F52: mode buttons are >= 44px tap targets.
    for (const mode of ['tme-mode-walk', 'tme-mode-car', 'tme-mode-train']) {
      const box = await page.getByTestId(mode).boundingBox();
      if (box === null) throw new Error(`${mode} not visible`);
      expect(box.height, `${mode} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${mode} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }

    // Fully visible: the panel's own content fits without internal scrolling,
    // and every key element sits inside the viewport box.
    const panelFits = await page.evaluate((): boolean => {
      const panel = document.querySelector('tme-route-panel');
      if (panel === null) throw new Error('route panel host not found');
      return panel.scrollHeight <= panel.clientHeight + 1;
    });
    expect(panelFits, 'panel content fully visible at 375px (D53)').toBe(true);

    const viewportHeight = page.viewportSize()?.height ?? 0;
    for (const testId of ['tme-total', 'tme-mode-walk', 'tme-blocked-reason']) {
      const box = await page.getByTestId(testId).boundingBox();
      if (box === null) throw new Error(`${testId} not visible`);
      expect(box.y + box.height, `${testId} inside the viewport (D53)`).toBeLessThanOrEqual(
        viewportHeight,
      );
    }
  });
});
