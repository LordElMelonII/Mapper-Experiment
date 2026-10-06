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

test.describe('the route panel as a narrow-width sheet (PKG B-114)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
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
