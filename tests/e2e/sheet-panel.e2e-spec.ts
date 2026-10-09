// tests/e2e/sheet-panel.e2e-spec.ts — PKG B-114: the route panel as a bottom
// SHEET at narrow widths — the §5 Phase 2 M4 "responsive panels (sheets at
// narrow widths) and tap-target sizing (D53)" item — at BOTH playwright
// projects (desktop + emulated phone with touch) per D53/F52.
//
// Cited IDs:
//   §5 M4    — "responsive panels (sheets at narrow widths) and tap-target
//              sizing (D53)": below the existing 700px breakpoint the route
//              panel docks as a sheet — an always-visible ≥44px rail that
//              collapses/expands the panel body — instead of the always-open
//              stacked sidebar; at and above 700px the sidebar is unchanged.
//   §6.1     — the touch & narrow-viewport row: "panels → sheets at narrow
//              widths; e2e at emulated phone viewport (D53)".
//   F52      — "every feature above, the editor included, works with touch
//              alone on a phone-sized screen and with a mouse on a desktop:
//              no hover-dependent affordances, tap-and-drag targets of usable
//              size, ... and panels that adapt to narrow viewports instead of
//              overflowing. One responsive UI — there is no separate mobile
//              mode, and no feature is desktop-only (D53)." (verbatim)
//   §6.2     — "panels survive a live viewport resize and orientation
//              change"; hover-only affordances are a defect.
//   Q29      — the fence: the sheet is the narrow-viewport FORM of the
//              EXISTING route panel — not a new panel, not floating, no
//              remembered position, no maximize (that regime is Phase 3).
//              The state below is component-local view chrome and persists
//              nothing (view-local, phone-world only at ≥700px).
//   R18      — the narrow form never silently breaks the M2/M3 phone cells:
//              where the sidebar became a sheet, the older specs were updated
//              deliberately (see route-panel.e2e-spec.ts, listed in DEVIATIONS).
//   D2       — rail taps are discrete gestures; the sheet state is written
//              through signals only (zoneless, R3).
//   D53/F52  — one interaction family, both worlds; the rail is a ≥44px tap
//              target; no hover-only affordance anywhere on the sheet.
//   C2/C19   — the "Blocked here" list is never hidden — at narrow widths it
//              sits behind ONE explicit rail tap, not gone.
//
// FX1 facts (data/worlds/fuyuki.ts): the pin is `emiya-residence` ("Emiya
// Residence"); the authored-blocked pin-incident arc
// `arc-emiya-residence-fuyuki-bridge` ("Bridge closed by local authorities")
// makes the Blocked-here list non-empty at load. Canvas content is aimed
// through the DEV-HARNESS-ONLY window.__TME_E2E__ seam (src/app/app.ts).
import { expect, test, type Page } from '@playwright/test';

interface TmeE2EHook {
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
}

const STATION_ID = 'fuyuki-station';
const CASTLE_ID = 'einzbern-castle';

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

/** F52/D53: one activation path for DOM controls on every project. */
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/**
 * Wait two animation frames: sheet collapse/expand changes the stage size
 * synchronously, but the ResizeObserver-driven re-fit (B-112) runs just
 * before the next paint — geometry reads inside that window yield pre-fit
 * values (the arc-panel spec's settle precedent).
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

const noHorizontalScroll = async (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/**
 * The narrow route summon's rendered state (B-136): the route HOST's height
 * (the flex member the stack squeezes) and whether the rail's center is
 * tap-reachable (elementFromPoint at the rail's center must answer the rail
 * or a descendant). Boxes are read IN-PAGE — the sheet stack rides layout
 * that locator.boundingBox() can misread (the quick-connect precedent).
 */
interface RouteStrip {
  hostH: number;
  railH: number;
  centerIsRail: boolean;
}

const readRouteStrip = (page: Page): Promise<RouteStrip> =>
  page.evaluate((): RouteStrip => {
    const host = document.querySelector('tme-route-panel');
    const rail = document.querySelector('[data-testid="tme-sheet-rail"]');
    if (host === null || rail === null) throw new Error('route sheet not rendered');
    const hb = host.getBoundingClientRect();
    const rb = rail.getBoundingClientRect();
    const hit = document.elementFromPoint(rb.left + rb.width / 2, rb.top + rb.height / 2);
    return {
      hostH: hb.height,
      railH: rb.height,
      centerIsRail: hit !== null && (hit === rail || rail.contains(hit)),
    };
  });

test.describe('the route panel as a narrow-width sheet (PKG B-114)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readPosition(page, 'emiya-residence')).not.toBeNull();
  });

  test('phone idle: the rail is visible and >= 44px; the body is hidden (collapsed default)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the sheet form belongs to the narrow viewport (§5 M4/D53); desktop is the cell below');

    // Ruling 1: the rail is ALWAYS visible — the panel's single affordance.
    const rail = page.getByTestId('tme-sheet-rail');
    await expect(rail).toBeVisible();
    await expect(rail).toHaveAttribute('aria-expanded', 'false');
    const railBox = await rail.boundingBox();
    if (railBox === null) throw new Error('rail not visible');
    expect(railBox.height, 'rail height >= 44px (F52)').toBeGreaterThanOrEqual(44);
    expect(railBox.width, 'rail is full-width (ruling 1)').toBeGreaterThanOrEqual(375);

    // Collapsed default at idle (no selection): the body — every control the
    // panel has ever rendered (hint, modes, Blocked here) — hides behind the
    // rail as one wrapper; the Blocked-here reachability has its own cell.
    await expect(page.getByTestId('tme-sheet-body')).toBeHidden();
  });

  test('phone: rail tap expands the body (the idle hint renders); tap again collapses (D2)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the sheet toggle belongs to the narrow viewport (§5 M4/D53)');

    // One discrete tap (D2) expands the sheet — the body's idle state is the
    // hint, verbatim.
    await activate(page, 'tme-sheet-rail');
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('tme-hint')).toHaveText(
      'Tap a node on the map to route there from the pin.',
    );

    // The second tap collapses again — the rail's toggle is symmetric.
    await activate(page, 'tme-sheet-rail');
    await expect(page.getByTestId('tme-sheet-body')).toBeHidden();
    await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'false');

    // D53: the sheet never overflows the narrow viewport.
    expect(await noHorizontalScroll(page), 'no horizontal scroll (F52/D53)').toBeLessThanOrEqual(0);
  });

  test('phone: a node tap auto-expands the sheet and shows the route; chip dismiss collapses (M2 flow, zero extra taps)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the auto-expand flow is the phone-world form of the M2 flow (ruling 2)');

    // Collapsed at idle…
    await expect(page.getByTestId('tme-sheet-body')).toBeHidden();

    // …one canvas tap on a node: the selection auto-EXPANDS the sheet (a map
    // tap means the user wants the panel) and the M2 route renders — the
    // tap-to-see-route flow keeps its zero-extra-taps shape (ruling 2).
    await tapNode(page, STATION_ID);
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('tme-leg')).toHaveCount(1);
    await expect(page.getByTestId('tme-total')).toHaveText('50 min');

    // The chip dismiss clears the selection — the sheet collapses with it
    // (ruling 2: the state follows the selection signal, R3).
    await activate(page, 'tme-selection-chip');
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    await expect(page.getByTestId('tme-sheet-body')).toBeHidden();
    await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'false');
  });

  test('phone: collapsing overlays nothing — the canvas keeps its height (D91); the refit-free flow keeps nodes tappable; landscape rotation survives (§6.2)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the overlay + rotation checks belong to the phone stage (§5 M4/§6.2)');

    // Expand via a selection, then collapse via the rail: under D91 the
    // sheet OVERLAYS the stage — the canvas box is byte-identical collapsed
    // and expanded (the old freed-height-returns-to-canvas behavior and its
    // refit are gone: panel transitions resize nothing).
    await tapNode(page, STATION_ID);
    await settle(page);
    const expandedCanvas = await canvasBox(page);
    await activate(page, 'tme-sheet-rail');
    await expect(page.getByTestId('tme-sheet-body')).toBeHidden();
    await settle(page);
    const collapsedCanvas = await canvasBox(page);
    expect(
      collapsedCanvas.height,
      'collapse never resizes the canvas (D91 zero-motion)',
    ).toBe(expandedCanvas.height);
    expect(
      collapsedCanvas.width,
      'collapse never resizes the canvas (D91 zero-motion)',
    ).toBe(expandedCanvas.width);

    // The RO chain no longer runs for the sheet — and nothing needs to: the
    // canvas box never moved, so the fit stands. A node is still tappable at
    // its untouched position (end to end).
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText('Einzbern Castle');
    // The selection also auto-re-expanded the sheet — the mid-state below.
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();

    // §6.2 live orientation: rotate to landscape mid-state (664px is still
    // below the 700px breakpoint, so the sheet form survives) — rail and
    // body both survive, the selection held (B-104), no horizontal scroll.
    await page.setViewportSize({ width: 664, height: 390 });
    await expect(page.getByTestId('tme-sheet-rail')).toBeVisible();
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    expect(await noHorizontalScroll(page), 'no horizontal scroll after rotation (§6.2/F52)').toBeLessThanOrEqual(0);

    // Back to portrait: the sheet state survives the round trip.
    await page.setViewportSize({ width: 390, height: 664 });
    await expect(page.getByTestId('tme-sheet-rail')).toBeVisible();
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
  });

  test('phone: "Blocked here" is reachable — one rail tap from idle renders the list (C2/C19)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the one-tap-away check belongs to the narrow form; desktop lists at load (cell below)');

    // Collapsed at idle: the blocked list is hidden WITH the body — behind
    // one explicit tap, never gone (C2: never hidden).
    await expect(page.getByTestId('tme-blocked')).toBeHidden();

    await activate(page, 'tme-sheet-rail');
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();

    // FX1's authored block, label + reason verbatim, selection-independent
    // (C2/C19 — the M1 deferral discharged in M2, now one rail tap away).
    await expect(page.getByTestId('tme-blocked')).toBeVisible();
    await expect(page.getByTestId('tme-blocked-item')).toHaveCount(1);
    await expect(page.getByTestId('tme-blocked-label')).toHaveText('Fuyuki Bridge');
    await expect(page.getByTestId('tme-blocked-reason')).toHaveText(
      'Bridge closed by local authorities',
    );
  });

  test('desktop: the rail is absent and the body always shows (the media query owns it, Q29)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the ≥700px sidebar form is the desktop world (§5 M4/D53)');

    // Opened at the desktop default width directly (≥700px): the rail is
    // display:none — there is nothing to toggle — and the body ALWAYS shows
    // regardless of the (phone-world) collapse state, which is false at idle
    // here: the media query owns visibility, not the signal (ruling 1/Q29).
    await expect(page.getByTestId('tme-sheet-rail')).toBeHidden();
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
    await expect(page.getByTestId('tme-hint')).toHaveText(
      'Tap a node on the map to route there from the pin.',
    );
    // The load-time sidebar content is unchanged from M2: the blocked list
    // renders with no interaction at all (C2/C19).
    await expect(page.getByTestId('tme-blocked')).toBeVisible();
    await expect(page.getByTestId('tme-blocked-label')).toHaveText('Fuyuki Bridge');

    // And the desktop sidebar flow is untouched: a node tap renders the route.
    await tapNode(page, STATION_ID);
    await expect(page.getByTestId('tme-total')).toHaveText('50 min');
  });
});

// tests/e2e B-136 — the D91-regime repair 2 (EXECUTION-PLAN §8.6(t) finding 1,
// R27 ruling 3): a maximized+scrolled property sheet used to flex-shrink the
// route sheet's standing summon strip below 44px (probe: the route HOST at
// 16.5px, the rail's center hit-blocked by the sheet's content — the "~16px
// summon sliver"). The repaired stack floors the route host at the summon's
// 44px F52 height (B-114 ruling 1's always-visible rail) at every stack fill
// level. Cells assert the repaired BEHAVIOR (strip height, center
// reachability), not the SCSS; both projects per D53/F52.
test.describe('the route summon floor under a maximized sheet (PKG B-136, D91 repair 2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readPosition(page, 'emiya-residence')).not.toBeNull();
  });

  test('phone: the summon strip keeps its 44px floor under a maximized+scrolled property sheet', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the sheet stack belongs to the narrow viewport (D53); the wide summon is the cell below');

    // Editor mode + one canvas node tap, coverage-guarded (the B-133c
    // discipline: the aim is re-derived fresh off the seam and must hit the
    // CANVAS — a covered aim fails with the geometry instead of tapping a
    // panel). At idle only the 44px route strip rides the stage bottom.
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
    await settle(page);
    const pos = await readPosition(page, STATION_ID);
    if (pos === null) throw new Error(`${STATION_ID} not rendered`);
    const canvas = await canvasBox(page);
    const aim = { x: canvas.x + pos.x, y: canvas.y + pos.y };
    const aimClear = await page.evaluate(
      ([px, py]) => document.elementFromPoint(px, py)?.closest('.tme-canvas') !== null,
      [aim.x, aim.y] as const,
    );
    if (!aimClear) {
      throw new Error(
        `B-136 aim (${Math.round(aim.x)},${Math.round(aim.y)}) is covered — the node tap would hit a panel`,
      );
    }
    await tapPoint(page, aim.x, aim.y);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();

    // The property sheet opens as the maximized in-stack sheet; in editor
    // mode a library-node selection belongs to the property panel, so the
    // route sheet stands COLLAPSED — the summon strip is the finding's
    // subject exactly as it stands (B-117/D53's mutual exclusion).
    await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'false');

    // The floor: the route HOST keeps the rail's full 44px box and the
    // strip's center is tap-reachable (pre-repair the stack squeezed the
    // host to ~16px and the sheet's content blocked the center tap).
    const strip = await readRouteStrip(page);
    expect(
      strip.hostH,
      'B-136: the summon strip keeps >= 44px under the maximized sheet (F52/B-114 ruling 1)',
    ).toBeGreaterThanOrEqual(44);
    expect(strip.railH, 'B-136: the rail box itself is >= 44px (F52)').toBeGreaterThanOrEqual(44);
    expect(strip.centerIsRail, 'B-136: the strip center is tap-reachable').toBe(true);

    // Every stack fill level: grow the maximized sheet (three alias rows —
    // draft-only, nothing commits) and scroll it to its bottom; the floor
    // holds and the summon stays a full tap target.
    // B-145 (R-5) re-baseline: Aliases renders behind its collapsed section
    // toggle — expand first, idempotently (R23: cited, never silent).
    if ((await page.getByTestId('tme-node-section-aliases').getAttribute('aria-expanded')) !== 'true') {
      await activate(page, 'tme-node-section-aliases');
    }
    await expect(page.getByTestId('tme-node-section-aliases')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    for (let i = 0; i < 3; i++) {
      await activate(page, 'tme-alias-add');
    }
    await page.evaluate(() => {
      const host = document.querySelector('tme-property-panel');
      if (host !== null) host.scrollTop = host.scrollHeight;
    });
    await settle(page);
    const grown = await readRouteStrip(page);
    expect(
      grown.hostH,
      'B-136: the summon strip keeps >= 44px under the grown+scrolled sheet',
    ).toBeGreaterThanOrEqual(44);
    expect(grown.centerIsRail, 'B-136: the strip center stays tap-reachable').toBe(true);
  });

  test('desktop: the Route summon on the rail stays reachable beside the maximized property panel', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide summon lives on the rail column (≥700px, D53); the narrow strip is the cell above');

    // The property panel opens MAXIMIZED (the bottom-right overlay); the
    // route summon is the rail's Route toggle — a rail-column control the
    // stage-clamped floater can never cover. The narrow floor's wide-world
    // mirror: the summon stays a full >= 44px reachable target panel-up.
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
    await tapNode(page, STATION_ID);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();

    const toggle = page.getByTestId('tme-route-toggle');
    await expect(toggle).toBeVisible();
    const box = await toggle.boundingBox();
    if (box === null) throw new Error('route toggle not visible');
    expect(box.height, 'route summon height >= 44px (F52)').toBeGreaterThanOrEqual(44);
    expect(box.width, 'route summon width >= 44px (F52)').toBeGreaterThanOrEqual(44);
    const reachable = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="tme-route-toggle"]');
      if (el === null) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && (hit === el || el.contains(hit));
    });
    expect(reachable, 'the route summon stays tap-reachable beside the maximized panel').toBe(true);
  });
});

// PKG B-149 (REPAIRS §R9 item 4) — the corner state: the route sheet EXPANDED
// while the Maps sheet is open. The defect: the stack (the 70% cap) squeezed
// the route HOST while the route SECTION — a plain block — refused the
// squeeze and painted 293px of content straight through its 139px host into
// the Maps sheet's band (measured pre-fix: route section 188→481 across the
// Maps rail at 378). The repair is the .tme-maps flex chain's route-side
// twin: the section is the host's shrink chain (flex column, min-height 0),
// so a stack squeeze scrolls the ROUTE BODY — the standing D53/D91 rule —
// and the rail keeps its 44px floor (the B-136 --tme-route-floor band).
//
// Cited IDs:
//   R9 item 4 — this cell is the packet's NEW corner-state assertion.
//   D53/D91   — a stack squeeze scrolls the sheet's own body, never paints
//               out of it; the canvas/stage never resizes.
//   B-136     — the route rail's 44px summon floor under a squeezed stack.
//   C2        — the Blocked-here/Blocked-places rows stay reachable (they
//               scroll, never vanish).
test.describe('the corner-state stack cap (PKG B-149, REPAIRS §R9 item 4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readPosition(page, 'emiya-residence')).not.toBeNull();
  });

  test('phone: the expanded route sheet scrolls its body instead of painting into the open Maps band; the summon floor holds', async ({
    page,
  }) => {
    test.skip(
      !isPhone(),
      'the corner state is the narrow stack\'s phenomenon — at ≥700px the stack dissolves (display: contents) and the panels are independent floaters that never share a band',
    );

    // The corner state, staged in the proven order: Maps open, its body
    // collapsed (the rail idiom), then a node tap auto-expands the route
    // sheet (the M2 flow), then the Maps body re-expands — BOTH bodies open,
    // the stack at its squeeze.
    await activate(page, 'tme-maps-toggle');
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible();
    await activate(page, 'tme-maps-rail');
    await expect(page.getByTestId('tme-maps-body')).toBeHidden();
    await tapNode(page, 'emiya-residence');
    await expect(page.getByTestId('tme-sheet-body')).toBeVisible(); // the route sheet auto-expanded
    await activate(page, 'tme-maps-rail');
    await expect(page.getByTestId('tme-maps-body')).toBeVisible();

    // The verdict, read IN-PAGE (one evaluate, same-tick consistent — the
    // readRouteStrip discipline): the route section must EQUAL its host box
    // (the shrink chain holds), the body must be the scrollable member, and
    // nothing may paint into the Maps sheet's band.
    await settle(page);
    const corner = await page.evaluate(() => {
      const rect = (el: Element | null): { top: number; bottom: number; h: number } | null => {
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
      };
      const host = document.querySelector('tme-route-panel');
      const section = host?.querySelector('.tme-route') ?? null;
      const rail = host?.querySelector('[data-testid="tme-sheet-rail"]') ?? null;
      const body = host?.querySelector('[data-testid="tme-sheet-body"]') ?? null;
      const mapsHost = document.querySelector('tme-maps-panel');
      const mapsSection = mapsHost?.querySelector('.tme-maps') ?? null;
      const mapsBody = mapsHost?.querySelector('[data-testid="tme-maps-body"]') ?? null;
      const hitRailCenter = (): boolean => {
        if (rail === null) return false;
        const r = rail.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit !== null && (hit === rail || rail.contains(hit));
      };
      return {
        host: rect(host),
        section: rect(section),
        rail: rect(rail),
        railCenterReachable: hitRailCenter(),
        bodyScrolls:
          body !== null && (body as HTMLElement).scrollHeight > (body as HTMLElement).clientHeight,
        mapsHost: rect(mapsHost),
        mapsSection: rect(mapsSection),
        mapsBodyScrolls:
          mapsBody !== null &&
          (mapsBody as HTMLElement).scrollHeight > (mapsBody as HTMLElement).clientHeight,
      };
    });

    // 1. The section honors the host — the shrink chain (the defect had it
    //    at 293px through a 139px host).
    expect(corner.host, 'route host rendered').not.toBeNull();
    expect(corner.section, 'route section rendered').not.toBeNull();
    expect(
      Math.abs(corner.section!.h - corner.host!.h),
      'R9.4: the route section never exceeds its host (the flex chain holds)',
    ).toBeLessThanOrEqual(1);
    // 2. Nothing paints into the Maps band.
    expect(corner.mapsHost, 'maps host rendered').not.toBeNull();
    expect(
      corner.section!.bottom <= corner.mapsHost!.top + 1,
      `R9.4: the route sheet ends (${corner.section!.bottom}) at or above the Maps band (${corner.mapsHost!.top})`,
    ).toBe(true);
    // 3. The squeeze became SCROLL, on both bodies (the D53/D91 rule).
    expect(corner.bodyScrolls, 'R9.4: the squeezed route body scrolls its overflow').toBe(true);
    expect(corner.mapsBodyScrolls, 'R9.4: the squeezed maps body scrolls its overflow').toBe(true);
    // 4. The B-136 summon floor: the route rail keeps its box and its center
    //    stays tap-reachable under the squeeze.
    expect(corner.rail!.h, 'R9.4: the route rail keeps >= 44px (F52/B-136)').toBeGreaterThanOrEqual(
      44,
    );
    expect(corner.railCenterReachable, 'R9.4: the rail center is tap-reachable').toBe(true);

    // 5. The rail still WORKS: one tap folds the route sheet (the summon is
    //    a real affordance, not painted chrome) — and the stack re-flows.
    await activate(page, 'tme-sheet-rail');
    await expect(page.getByTestId('tme-sheet-body')).toBeHidden();

    // D53: the corner state never forces horizontal overflow.
    expect(
      await noHorizontalScroll(page),
      'no horizontal scroll in the corner state (F52/D53)',
    ).toBeLessThanOrEqual(0);
  });
});
