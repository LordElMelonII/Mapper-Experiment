// tests/e2e/context-dock.e2e-spec.ts — PKG B-D2 (R29,
// docs/ui-restyle/PROPOSAL-D-STRUCTURAL.md §2.1): the >=1024px shell's
// CONTEXT DOCK — exactly ONE context panel docked at a time in the 280px
// right column (context swap, not stack), the dock↔float handoff with
// remembered positions intact, the D81-classified stage resize (preserve +
// rescue clamp), and the canvas-bottom STATUS STRIP receiving the selection
// chip.
//
// DESKTOP PROJECT ONLY (the shell is the >=1024 regime; the phone corpus
// passes untouched — a phone-arm change here would be a defect, R29 law).
//
// Cited IDs:
//   PROPOSAL-D §2.1 — the dock under test: 280px right column, exclusive
//              (exactly ONE context panel), Float affordance (the B-119
//              remembered-position machinery kept), status strip at the
//              canvas bottom.
//   R29 rulings 1–4 — the occupant is the most-recently-OPENED non-floated
//              open panel among {route, arc, property, layers, maps}; NO
//              evictions, NO machine-closed states (D10) — opening a context
//              swaps the occupant, closing falls back down the open history;
//              the arc panel docks in the same rotation; the strip carries
//              ONLY the chip in this packet (the save dock stays in the
//              header — no duplicate unsaved indicator).
//   D81/D91  — the dock's open/close is a panel-driven stage resize the
//              discriminator classifies: wide ⇒ preserve (zoom/pan EXACTLY
//              untouched) + the selection rescue clamp.
//   F52/D53  — the dock's controls >= 44px; nothing here depends on hover.
//   R1/D2    — the __TME_E2E__ hook stays read-only; no hardcoded expected
//              floats (in-page reads only).
//   C23      — the dock header speaks plain words (the occupant's title).
//
// Chrome mirror: `.tme-dock` joined map-viewer's INTERACTIVE_CHROME and both
// e2e mirror constants (verify-d81-viewport / panel-resize-viewport
// CHROME_SELECTORS — updated in this packet; the geometry cell below asserts
// the live DOM answer the mirrors measure).
import { expect, test, type Page } from '@playwright/test';

interface TmeE2EHook {
  zoom(): number;
  pan(): { x: number; y: number };
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

const isPhone = (): boolean => test.info().project.name === 'phone';

/** The round's letter: the dock is the >=1024px regime; phone skips. */
const skipOnPhone = (): void => {
  if (isPhone()) test.skip(true, 'the context dock is the >=1024px regime (desktop project)');
};

/** FX1 facts (data/worlds/fuyuki.ts) the cells engineer against. */
const STATION_ID = 'fuyuki-station';
const CASTLE_ID = 'einzbern-castle'; // FX1's LEFT content — clear of the dock band and the bottom-right floater slot

/** The desktop project's viewport (devices['Desktop Chrome']): 1280x720 — the shell regime. */
const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
/** The medium band (700–1023): today's wide chrome — no dock, no strip. */
const MEDIUM_VIEWPORT = { width: 900, height: 720 };

/** The five dockable context panels' section testids — the exclusivity probe. */
const PANEL_SECTION_TESTIDS = [
  'tme-route-panel',
  'tme-property-panel',
  'tme-arc-panel',
  'tme-layer-manager',
  'tme-maps-panel',
] as const;

const readZoom = (page: Page): Promise<number> =>
  page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.zoom();
  });

const readPan = (page: Page): Promise<{ x: number; y: number }> =>
  page.evaluate(() => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.pan();
  });

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId) => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeRenderedPosition(nodeId);
  }, id);

/** Housekeeping (the D81 pattern): console errors/warnings/pageerrors. */
const collectConsole = (page: Page): string[] => {
  const bad: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));
  return bad;
};

/**
 * Wait two animation frames — the dock's open/close resizes the stage
 * synchronously, but the ResizeObserver-driven classify runs just before the
 * next paint (the arc-panel settle precedent).
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** F52/D53: tap a canvas node through its rendered position (mouse on desktop). */
const tapNode = async (page: Page, id: string): Promise<void> => {
  const pos = await readPosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  await page.mouse.click(box.x + pos.x, box.y + pos.y);
};

/** The dock's occupant count — the five panel sections inside .tme-dock. */
const dockedPanelCount = (page: Page): Promise<number> =>
  page.getByTestId('tme-dock').locator(PANEL_SECTION_TESTIDS.map((t) => `[data-testid="${t}"]`).join(', ')).count();

test.describe('the >=1024px context dock (PKG B-D2, R29 / PROPOSAL-D §2.1)', () => {
  test.beforeEach(async ({ page }) => {
    skipOnPhone();
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => window.innerWidth))
      .toBeGreaterThanOrEqual(1024); // the shell regime is live at this viewport
  });

  test('exclusivity + swap: maps, then a selection — the dock hosts property alone; closing it hands back (R29 rulings 1/2)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);

    // Boot: FX1's blocked-bridge listing auto-opens the route — the dock's
    // first occupant (one panel inside, none duplicated in the sheets home).
    await expect(page.getByTestId('tme-dock')).toBeVisible();
    expect(await dockedPanelCount(page), 'exactly ONE occupant at boot').toBe(1);
    await expect(page.getByTestId('tme-dock').getByTestId('tme-route-panel')).toBeVisible();
    await expect(page.getByTestId('tme-route-panel')).toHaveCount(1); // one live home

    // Open Maps (the belt toggle): the most-recently-OPENED context swaps
    // the occupant — nothing closed (D10): the route keeps its floater form.
    await page.getByTestId('tme-maps-toggle').click();
    await expect(page.getByTestId('tme-dock').getByTestId('tme-maps-panel')).toBeVisible();
    expect(await dockedPanelCount(page), 'exactly ONE occupant after the swap').toBe(1);
    await expect(page.getByTestId('tme-maps-panel')).toHaveCount(1);
    await expect(page.getByTestId('tme-route-panel')).toHaveCount(1); // still open — as a floater

    // The owner's R29 review: ONE header. The dock header owns the title
    // word; the occupant's own duplicate title never renders (its actions —
    // the close X — stay reachable).
    await expect(page.getByTestId('tme-dock').locator('.tme-dock-title')).toHaveText('Maps');
    await expect(
      page.getByTestId('tme-dock').locator('[data-testid="tme-maps-panel"] .tme-maps-head .tme-title'),
    ).toBeHidden();
    await expect(page.getByTestId('tme-dock').getByTestId('tme-maps-panel-close')).toBeVisible();

    // Select a node in editor mode: property publishes open and becomes the
    // occupant (the most recent context); Maps is NOT in the dock (its
    // floater stands), and the property form has exactly one home.
    await page.getByTestId('tme-editor-toggle').click();
    await expect(page.getByTestId('tme-tool-node')).toBeVisible();
    await settle(page);
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-dock').getByTestId('tme-property-panel')).toBeVisible();
    expect(await dockedPanelCount(page), 'exactly ONE occupant (property)').toBe(1);
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(1);
    await expect(page.getByTestId('tme-maps-panel')).toHaveCount(1); // floater, not docked

    // The swap back: dismissing the selection closes the property draft
    // (the panel's own gate — no machine-close) and Maps RETURNS as the
    // occupant (the open-history fallback, ruling 1).
    await page.getByTestId('tme-selection-chip').click();
    await expect(page.getByTestId('tme-dock').getByTestId('tme-maps-panel')).toBeVisible();
    expect(await dockedPanelCount(page), 'exactly ONE occupant (maps again)').toBe(1);
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('dock↔float round-trip: Float tears the occupant off (position:fixed floater), Dock returns it, the remembered position survives (PROPOSAL-D §2.1, D10)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);

    // Property docked (editor mode + a library-node selection).
    await page.getByTestId('tme-editor-toggle').click();
    await expect(page.getByTestId('tme-tool-node')).toBeVisible();
    await settle(page);
    await tapNode(page, CASTLE_ID);
    const dock = page.getByTestId('tme-dock');
    await expect(dock.getByTestId('tme-property-panel')).toBeVisible();

    // FLOAT: the dock header's handoff — the occupant's kind tears off; the
    // dock re-hosts the next open context (route — FX1's standing open) or
    // would close; the property renders as a FLOATER (position:fixed).
    await page.getByTestId('tme-dock-float').click();
    await expect(dock.getByTestId('tme-route-panel')).toBeVisible();
    const floatHost = page.locator('tme-property-panel');
    await expect(floatHost).toHaveCount(1);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const host = document.querySelector('tme-property-panel');
          if (host === null) return 'absent';
          return getComputedStyle(host).position;
        }),
      )
      .toBe('fixed');

    // Give it a remembered position: Restore (the compact float form), then
    // drag the header — the commit is ONE signal write on release (D2). The
    // drag pulls UP-LEFT away from the strip chip's bottom band (the chip is
    // live chrome here): fully left of it the floater's clamp bands un-invert
    // and the commit lands in sane stage space.
    await page.getByTestId('tme-panel-maximize').click(); // 'Restore' — floats compact
    const head = page.getByTestId('tme-property-panel').locator('.tme-prop-head');
    await expect(head).toBeVisible();
    const headBox = await head.boundingBox();
    if (headBox === null) throw new Error('property floater head not visible');
    await page.mouse.move(headBox.x + 40, headBox.y + headBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(headBox.x + 40 - 200, headBox.y + headBox.height / 2 - 40, { steps: 8 });
    await page.mouse.up();
    await settle(page);
    const remembered = await page.evaluate(() => document.querySelector('tme-property-panel')?.style.transform ?? '');
    expect(remembered, 'the drag committed a transform').toContain('translate');

    // DOCK: the floater's shell-gated Dock button returns the kind — the
    // dock column hosts the property form again, the floater is gone.
    await page.getByTestId('tme-property-dock').click();
    await expect(dock.getByTestId('tme-property-panel')).toBeVisible();
    await expect(floatHost).toHaveCount(1); // the dock's instance (one live home)
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const host = document.querySelector('tme-property-panel');
          if (host === null) return 'absent';
          return getComputedStyle(host).position;
        }),
      )
      .toBe('static');

    // The remembered position survives the round-trip (D10): Float again —
    // the panel was left FLOATING (the dock never touches the float state),
    // so it tears off directly in the compact form AT the dragged transform.
    await page.getByTestId('tme-dock-float').click();
    await expect(page.locator('tme-property-panel')).toHaveCount(1);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const host = document.querySelector('tme-property-panel');
          if (host === null) return 'absent';
          return getComputedStyle(host).position;
        }),
      )
      .toBe('fixed');
    await settle(page);
    const after = await page.evaluate(() => document.querySelector('tme-property-panel')?.style.transform ?? '');
    expect(after, 'the remembered position survives Float→Dock→Float (D10)').toBe(remembered);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('geometry: the dock column is 280px; the canvas host shrinks when it opens and restores when it closes (the D81-classified resize)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);

    // Boot: the dock is open (route). Column width ≈ 280 (±1 render slack).
    const dock = page.getByTestId('tme-dock');
    await expect(dock).toBeVisible();
    const dockBox = await dock.boundingBox();
    if (dockBox === null) throw new Error('tme-dock not visible');
    expect(Math.abs(dockBox.width - 280), 'the dock column is 280px').toBeLessThanOrEqual(1);

    const canvasWidthWithDock = (await page.getByTestId('tme-canvas').boundingBox())?.width ?? 0;
    expect(canvasWidthWithDock, 'the canvas yields the dock band').toBeLessThan(1280);

    // Close the dock (the Route toggle closes its occupant): the dock
    // unmounts — zero layout cost — and the canvas box RESTORES.
    await page.getByTestId('tme-route-toggle').click();
    await expect(dock).toHaveCount(0);
    await settle(page);
    const canvasWidthWithoutDock = (await page.getByTestId('tme-canvas').boundingBox())?.width ?? 0;
    expect(
      canvasWidthWithoutDock - canvasWidthWithDock,
      'the canvas regains the 280px band (±1 slack)',
    ).toBeGreaterThanOrEqual(279);

    // Reopen: the dock returns at the same width and the canvas re-yields.
    await page.getByTestId('tme-route-toggle').click();
    await expect(dock).toBeVisible();
    await settle(page);
    const canvasWidthReopened = (await page.getByTestId('tme-canvas').boundingBox())?.width ?? 0;
    expect(
      Math.abs(canvasWidthReopened - canvasWidthWithDock),
      'the reopen re-fits the same boxes',
    ).toBeLessThanOrEqual(1);

    // The chrome mirrors measure this element (map-viewer's
    // INTERACTIVE_CHROME + the two e2e CHROME_SELECTORS constants): the live
    // DOM carries exactly one .tme-dock while rendered, zero while not.
    expect(
      await page.evaluate(() => document.querySelectorAll('.tme-dock').length),
      'exactly one .tme-dock element (the chrome-mirror target)',
    ).toBe(1);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('D81 pin: dock open/close leaves zoom AND pan untouched and the selection visible (preserve + rescue class)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);

    // A selection in view mode (the strip chip), then a wheel-zoom ABOUT the
    // node (the cursor anchors the zoom) — a zoomed, panned-by-boot viewport.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    const nodePos = await readPosition(page, CASTLE_ID);
    if (nodePos === null) throw new Error('castle not rendered');
    const canvas = await page.getByTestId('tme-canvas').boundingBox();
    if (canvas === null) throw new Error('canvas host not visible');
    await page.mouse.move(canvas.x + nodePos.x, canvas.y + nodePos.y);
    await page.mouse.wheel(0, -480); // two wheel steps in, about the node
    await settle(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);
    expect(zoomBefore, 'the wheel zoom took (a zoomed viewport)').toBeGreaterThan(0.5);

    // Close the dock (Route toggle — the occupant closes): the stage grows.
    // Preserve class: zoom/pan EXACTLY untouched.
    await page.getByTestId('tme-route-toggle').click();
    await expect(page.getByTestId('tme-dock')).toHaveCount(0);
    await settle(page);
    expect(await readZoom(page), 'zoom preserved across the dock close (D81 preserve)').toBe(zoomBefore);
    expect(await readPan(page), 'pan preserved across the dock close (D81 preserve)').toEqual(panBefore);

    // Reopen: the stage shrinks; the selection sits LEFT of the dock band by
    // construction, so the rescue clamp has nothing to do — still exact.
    await page.getByTestId('tme-route-toggle').click();
    await expect(page.getByTestId('tme-dock')).toBeVisible();
    await settle(page);
    expect(await readZoom(page), 'zoom preserved across the dock reopen').toBe(zoomBefore);
    expect(await readPan(page), 'pan preserved across the dock reopen').toEqual(panBefore);

    // The selection stayed visible through both resizes (the rescue clamp's
    // honest no-op here): the node still renders inside the canvas box.
    const after = await readPosition(page, CASTLE_ID);
    if (after === null) throw new Error('castle unmounted by the resize');
    const canvasAfter = await page.getByTestId('tme-canvas').boundingBox();
    if (canvasAfter === null) throw new Error('canvas host not visible');
    expect(after.x, 'the selection stayed on-canvas (x)').toBeGreaterThanOrEqual(0);
    expect(after.x, 'the selection stayed on-canvas (x within)').toBeLessThanOrEqual(canvasAfter.width);
    expect(after.y, 'the selection stayed on-canvas (y)').toBeGreaterThanOrEqual(0);
    expect(after.y, 'the selection stayed on-canvas (y within)').toBeLessThanOrEqual(canvasAfter.height);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('status strip: the chip lives in the strip at >=1024 (one instance); the header below (medium band)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);

    // Shell regime: the strip renders (the empty line stands for D-5's
    // words), the chip is NOT in the header band.
    const strip = page.getByTestId('tme-status-strip');
    await expect(strip).toHaveCount(1);
    await expect(page.locator('.tme-header [data-testid="tme-selection-chip"]')).toHaveCount(0);

    // Select → the chip renders in the strip, exactly once in the tree.
    await tapNode(page, STATION_ID);
    const chip = page.getByTestId('tme-selection-chip');
    await expect(chip).toHaveCount(1);
    await expect(strip.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.locator('.tme-header [data-testid="tme-selection-chip"]')).toHaveCount(0);

    // Dismiss through the strip chip (the same signal path) → gone.
    await chip.click();
    await expect(page.getByTestId('tme-selection-chip')).toHaveCount(0);

    // Medium band: the strip is ABSENT (template gate), the dock is ABSENT,
    // and a selection puts the chip back in the header band — byte-for-byte
    // today's chrome.
    await page.setViewportSize(MEDIUM_VIEWPORT);
    await expect(strip).toHaveCount(0);
    await expect(page.getByTestId('tme-dock')).toHaveCount(0);
    await expect(page.locator('.tme-status-strip')).toHaveCount(0);
    await tapNode(page, STATION_ID);
    await expect(page.locator('.tme-header [data-testid="tme-selection-chip"]')).toHaveCount(1);
    await expect(page.getByTestId('tme-selection-chip')).toHaveCount(1);

    // Back to the shell: the chip migrates home again (the dual-home is live).
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await expect(strip).toHaveCount(1);
    await expect(strip.getByTestId('tme-selection-chip')).toBeVisible();

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('medium band unchanged: 900px renders no dock and today\'s floater chrome (R29 round law)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);

    await page.setViewportSize(MEDIUM_VIEWPORT);
    await settle(page);
    // No dock, no strip, no shell-gated Dock buttons — the 700–1023 band is
    // byte-for-byte today's wide chrome (the route floats with its content).
    await expect(page.getByTestId('tme-dock')).toHaveCount(0);
    await expect(page.getByTestId('tme-status-strip')).toHaveCount(0);
    await expect(page.getByTestId('tme-route-dock')).toHaveCount(0);
    await expect(page.getByTestId('tme-route-panel')).toBeVisible();
    const routeHost = page.locator('tme-route-panel');
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const host = document.querySelector('tme-route-panel');
          if (host === null) return 'absent';
          return getComputedStyle(host).position;
        }),
      )
      .toBe('fixed');

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('the sticky form: a live property draft is never displaced — contexts opened mid-draft wait, the typed value survives, the swap happens at the draft\u2019s resolution (the C29 sharp edge, the lead review ruling)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);

    // Property docked (editor mode + a library-node selection).
    await page.getByTestId('tme-editor-toggle').click();
    await expect(page.getByTestId('tme-tool-node')).toBeVisible();
    await settle(page);
    await tapNode(page, CASTLE_ID);
    const dock = page.getByTestId('tme-dock');
    await expect(dock.getByTestId('tme-property-panel')).toBeVisible();

    // A draft stands: type a name the node does not carry (uncommitted).
    const nameInput = dock.getByTestId('tme-node-label-input');
    await nameInput.fill('Draft keepsake');

    // Open Maps mid-draft: the dock KEEPS hosting property (the sticky form
    // — the instance is never swapped away, so the keystrokes cannot drop);
    // Maps is NOT in the dock (it waits, its floater form clamped clear of
    // the dock band by --tme-dock-w). The typed value SURVIVES the toggle.
    await page.getByTestId('tme-maps-toggle').click();
    await expect(dock.getByTestId('tme-property-panel')).toBeVisible();
    expect(await dockedPanelCount(page), 'property stays the lone occupant mid-draft').toBe(1);
    await expect(page.getByTestId('tme-maps-panel')).toHaveCount(1); // floater — waiting
    await expect(dock.getByTestId('tme-maps-panel')).toHaveCount(0);
    await expect(nameInput, 'the uncommitted keystrokes survive the mid-draft swap attempt (C29)').toHaveValue(
      'Draft keepsake',
    );

    // Layers too — the sticky rule is not a Maps special case.
    await page.getByTestId('tme-layers-tool').click();
    await expect(dock.getByTestId('tme-property-panel')).toBeVisible();
    await expect(nameInput).toHaveValue('Draft keepsake');

    // Done COMMITS but does not close the panel (B-145: a same-node re-seed
    // keeps the author's context) — the draft stands re-seeded clean, so the
    // sticky occupant remains property and the committed name shows.
    await dock.getByTestId('tme-node-done').click();
    await expect(dock.getByTestId('tme-property-panel')).toBeVisible();
    expect(await dockedPanelCount(page), 'property stays the occupant through the commit (B-145)').toBe(1);
    await expect(dock.getByTestId('tme-maps-panel')).toHaveCount(0);
    await expect(dock.getByTestId('tme-layer-manager')).toHaveCount(0);

    // The draft RESOLVES at the selection's dismissal (the panel's gate):
    // the swap happens NOW — the most recent waiting context (layers,
    // opened last) becomes the occupant, exactly one panel in the dock.
    await page.getByTestId('tme-selection-chip').click();
    await expect(dock.getByTestId('tme-layer-manager')).toBeVisible();
    expect(await dockedPanelCount(page), 'exactly ONE occupant after the draft resolves (layers)').toBe(1);
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  // The owner's review finding: the docked layer manager's list had NO
  // scrollbar — the section (.tme-manager) was a plain block, so the host's
  // height: 100% never propagated and the body's overflow-y: auto never
  // engaged (the rows painted straight past the dock column). The B-149
  // shrink-chain fix (route/maps' own precedent): flex column + min-height:
  // 0 on the section lets the squeeze through — the BODY becomes the scroll
  // member. STAGING: a short stage (the bug is height-dependent — at the
  // full 720px the three-layer list simply fits, so nothing would overflow
  // and the cell would prove nothing). The cell pins: the list overflows the
  // docked box, the body never paints past the dock column, and the LAST
  // row scrolls into view.
  test('the docked layer manager scrolls its own list — the body is the scroll member (the B-149 shrink chain, owner review fix)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: DESKTOP_VIEWPORT.width, height: 460 });
    await settle(page);
    await page.getByTestId('tme-layers-tool').click();
    await expect(page.getByTestId('tme-dock').getByTestId('tme-layer-manager')).toBeVisible();
    await settle(page);

    const measured = await page.evaluate((): { overflow: boolean; bodyInsideDock: boolean; scrollTop: number } => {
      const dock = document.querySelector('.tme-dock');
      const body = document.querySelector('[data-testid="tme-layer-manager-body"]');
      if (dock === null || body === null) throw new Error('dock or layer-manager body missing');
      const dockRect = dock.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      return {
        overflow: body.scrollHeight > body.clientHeight,
        bodyInsideDock: bodyRect.bottom <= dockRect.bottom + 0.5,
        scrollTop: body.scrollTop,
      };
    });
    expect(measured.overflow, 'the FX1 layer list overflows the short docked body (scrollHeight > clientHeight)').toBe(
      true,
    );
    expect(measured.bodyInsideDock, 'the body box never paints past the dock column').toBe(true);

    // The scroll actually moves (the shrink chain made the BODY the scroll
    // member — not a clipped overflow:hidden box), and reaches the END: the
    // LAST layer row sits inside the body's box.
    await page.getByTestId('tme-layer-manager-body').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const scrolled = await page.evaluate((): { scrollTop: number; lastRowInView: boolean } => {
      const rows = document.querySelectorAll('[data-testid="tme-layer-row"]');
      const body = document.querySelector('[data-testid="tme-layer-manager-body"]');
      if (rows.length === 0 || body === null) return { scrollTop: 0, lastRowInView: false };
      const row = rows[rows.length - 1].getBoundingClientRect();
      const box = body.getBoundingClientRect();
      return {
        scrollTop: body.scrollTop,
        lastRowInView: row.bottom <= box.bottom + 1 && row.top >= box.top - 1,
      };
    });
    expect(scrolled.scrollTop, 'the body scrolls (a clipped box keeps scrollTop at 0)').toBeGreaterThan(0);
    expect(scrolled.lastRowInView, 'the last layer row scrolls into the body (the list is completable)').toBe(true);
  });
});
