// tests/e2e/keyboard-ergonomics.e2e-spec.ts — PKG B-148 (docs/ui-restyle/
// REPAIRS.md §R8, packet rulings 1–3): the pointer-world's KEYBOARD
// ergonomics. The letter's acceptance is DESKTOP e2e for the three key
// families — Enter commits, Escape dismisses the top-most surface, and the
// canvas zoom keys — so the file's cells are desktop-only by the letter
// (each cell skips the phone project deliberately; D53 is untouched by
// this packet: the phone keeps its touch-only parity and the hover sweep
// adds NO events/DOM on any device, so no hover-dependent assertion exists
// in the round and none is added here).
//
// Cited IDs:
//   R-8 ruling 1 — Enter commits the single-field forms (the maps panel's
//           create-name input; the layer-manager's create/rename inputs) by
//           firing the SAME handler the commit button fires; the empty-name
//           disabled state stays a no-op (C30); the paste textarea's Enter
//           is CONTENT by the deliberate reading (a lookup table is line-
//           delimited) — its commit stays the Import button.
//   R-8 ruling 2 — Escape dismisses the TOP-MOST open surface, one per
//           press: the service's `escapeTopSurface` precedence reads the
//           stage's own z-stack (the node menu's parked plate at z-17; the
//           Maps panel and the layer manager share their grade, DOM order
//           decides — the Maps panel is the .tme-sheets stack's later
//           sibling and paints above). Each surface fires its OWN close
//           path (never a second one); the route/property/arc floaters and
//           the property panel's connect-mode exit are OUT of scope.
//   R-8 ruling 3 — +/= zoom in, -/_ zoom out, 0 = fit, ONLY when the key
//           lands on the focused canvas host: the same ×1.25 multiplicative
//           step the service's zoom trio documents (graph.service.ts, R1 —
//           no second arithmetic) and the same fit site the Fit button
//           calls; a form field holding focus eats its own keys (C32);
//           arrows never nudge (F46).
//   D53/F52 — untouched: every skipped phone cell is the letter's own
//           desktop-only acceptance, not a parity waiver.
import { expect, test, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  zoom(): number;
  loadedMapId(): string | null;
  libraryList(): Promise<{ id: string; name: string; forkedFrom: string | null }[]>;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

/** FX1 authored facts — assertion keys per the canvas-spec convention. */
const BOOT_MAP_ID = 'fuyuki-misaki';
const SEEDED_NAME = 'Fuyuki & Misaki (FX1)';

const isPhone = (): boolean => test.info().project.name === 'phone';

/** The letter's acceptance is desktop-only for keys; phone skips by design. */
const skipOnPhone = (): void => {
  if (isPhone()) test.skip(true, 'R-8 key acceptance is desktop-only by the letter');
};

const readZoom = (page: Page): Promise<number> =>
  page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.zoom();
  });

const readLoadedMapId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.loadedMapId();
  });

const readLibraryRows = (page: Page): Promise<{ id: string; name: string }[]> =>
  page.evaluate(async (): Promise<{ id: string; name: string }[]> => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    // The library read is ASYNC (the store's contract) — await it in-page.
    const rows = await hook.libraryList();
    return rows.map((row) => ({ id: row.id, name: row.name }));
  });

/** The seeded demo row lands (a poll — the async store save lags the boot). */
const seededRowReady = (page: Page) => expect.poll(() => readLibraryRows(page));

/** Housekeeping (the D81 pattern): console errors/warnings/pageerrors. */
const collectConsole = (page: Page): string[] => {
  const bad: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));
  return bad;
};

/** F52/D53: one activation path for DOM controls (desktop runs clicks). */
const activate = async (page: Page, testId: string): Promise<void> => {
  await page.getByTestId(testId).click();
};

/**
 * One FX1 node's SCREEN point (rendered position + the canvas host box —
 * the pin-affordance spec's real-pixel idiom), picked among the candidate
 * ids so the point sits INSIDE the canvas and OUTSIDE every listed open
 * chrome box (floaters occlude their rectangle; a click there would hit
 * the panel, never the node).
 */
const pickAimPoint = (page: Page, avoidTestIds: string[]): Promise<Point> =>
  page.evaluate((avoid: string[]): Point => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    const canvas = document.querySelector('[data-testid="tme-canvas"]');
    if (canvas === null) throw new Error('tme-canvas missing');
    const cb = canvas.getBoundingClientRect();
    const avoidBoxes = avoid
      .map((testId) => document.querySelector(`[data-testid="${testId}"]`))
      .filter((el): el is HTMLElement => el !== null)
      .map((el) => el.getBoundingClientRect());
    const covered = (p: { x: number; y: number }, b: DOMRect): boolean =>
      p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;
    for (const id of [
      // FX1 authored ids, inlined: evaluate callbacks are SERIALIZED — no
      // module scope crosses the wire (the degraded-copy discipline).
      'emiya-residence',
      'kotomine-church',
      'outskirts',
      'matou-residence',
      'shopping-district',
      'fuyuki-bridge',
    ]) {
      const rp = hook.nodeRenderedPosition(id);
      if (rp === null) continue;
      const p = { x: cb.left + rp.x, y: cb.top + rp.y };
      if (p.x < cb.left + 8 || p.x > cb.right - 8 || p.y < cb.top + 8 || p.y > cb.bottom - 8) {
        continue; // out of the canvas proper (rail band / stage edges)
      }
      if (avoidBoxes.some((b) => covered(p, b))) continue; // under open chrome
      return p;
    }
    throw new Error('no FX1 node clears the open chrome');
  }, avoidTestIds);

test.describe('keyboard ergonomics (PKG B-148, REPAIRS R-8)', () => {
  test('Enter commits the maps create form; the disabled empty-name state fires nothing (R-8 ruling 1)', async ({ page }) => {
    skipOnPhone();
    const bad = collectConsole(page);
    await page.goto('/?map=none');
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible(); // the mapless picker boots open (D40)
    // The harness seed rides an async store save — let the seeded row land
    // (the Maps panel list refresh re-reads it; the wrong-time read would be
    // a false empty) before any assertion builds on the row count.
    await seededRowReady(page).toHaveLength(1);
    expect((await readLibraryRows(page))[0]!.name, 'the seeded demo row is the boot library').toBe(SEEDED_NAME);

    // The disabled Create's Enter — a NO-OP: the same create() the button
    // fires carries the C30 empty-name guard, so nothing loads and nothing
    // is stored.
    await page.getByTestId('tme-maps-create-input').fill('');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible(); // the panel stands
    expect(await readLoadedMapId(page), 'no map loaded by the empty Enter').toBeNull();
    const rows = await readLibraryRows(page);
    expect(rows, 'the library is unchanged').toHaveLength(1);
    expect(rows[0]!.name).toBe(SEEDED_NAME);

    // Now a real name: Enter commits the create flow — the map loads (the
    // hook's id matches the new library row) and the picker closes (the
    // loadMap reset), the same path the Create button's tap takes.
    await page.getByTestId('tme-maps-create-input').fill('Test Land');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden();
    const rowsAfter = await readLibraryRows(page);
    const created = rowsAfter.find((row) => row.name === 'Test Land');
    expect(created, "the 'Test Land' row landed in the library").toBeDefined();
    expect(await readLoadedMapId(page), 'Enter opened the created map').toBe(created!.id);
    expect(bad, 'console clean through the create flow (C32)').toEqual([]);
  });

  test('Escape dismisses the TOP-MOST surface, one per press: the Maps panel outranks the layer manager (R-8 ruling 2)', async ({ page }) => {
    skipOnPhone();
    const bad = collectConsole(page);
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();

    // Both management surfaces stand: the Maps panel (opened after it would
    // matter NOT — the order opened is irrelevant to the paint rule) and the
    // layer manager. Their paint order is the measured fact the service
    // encodes: the Maps panel is the .tme-sheets stack's LATER sibling, so
    // it paints above the layer manager at every breakpoint.
    await activate(page, 'tme-maps-toggle');
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible();
    await activate(page, 'tme-layer-manage');
    await expect(page.getByTestId('tme-layer-manager')).toBeVisible();

    // ONE press = ONE dismissal: the top-most (the Maps panel) closes; the
    // layer manager stands. (The pre-packet defect closed BOTH on one press.)
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden();
    await expect(page.getByTestId('tme-layer-manager')).toBeVisible();

    // The next press dismisses the now-top-most surface.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tme-layer-manager')).toBeHidden();
    expect(bad, 'console clean through the Escape pair (C32)').toEqual([]);
  });

  test('Escape reaches the parked node menu first; one press dismisses one surface (R-8 ruling 2, the menu joins the stack)', async ({ page }) => {
    skipOnPhone();
    const bad = collectConsole(page);
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();

    // The Maps panel opens FIRST (a later pointer down would dismiss a parked
    // menu — the chrome-tap arm; this order is the keyboard-only viable one).
    await activate(page, 'tme-maps-toggle');
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible();

    // Context-click a node that clears the open chrome: the R-3 menu parks
    // over the canvas while the panel stands.
    const aim = await pickAimPoint(page, ['tme-maps-panel', 'tme-route-panel', 'tme-property-panel']);
    await page.mouse.click(aim.x, aim.y, { button: 'right' });
    await expect(page.getByTestId('tme-node-menu')).toBeVisible();

    // The menu is the top-most surface (z-17 over the sheet stack): Escape
    // closes the MENU alone; the Maps panel keeps standing.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tme-node-menu')).toHaveCount(0);
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible();

    // The follow-up press dismisses the panel through its own close path.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden();
    expect(bad, 'console clean through the menu Escape (C32)').toEqual([]);
  });

  test('Canvas zoom keys: +/= in, -/_ out, 0 = the Fit machinery; a focused input eats its own keys (R-8 ruling 3)', async ({ page }) => {
    skipOnPhone();
    const bad = collectConsole(page);
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    const zoom0 = await readZoom(page); // the desktop boot IS the world fit

    // Put keyboard focus ON the canvas host (the tabindex addition), then
    // drive the trio's service commands through the keys. Each step is the
    // service's own ×1.25 multiplicative step about the viewport center.
    await page.getByTestId('tme-canvas').focus();
    await page.keyboard.type('+');
    await expect
      .poll(async () => (await readZoom(page)) / (zoom0 * 1.25), 'one + steps in ×1.25')
      .toBeCloseTo(1, 6);
    await page.keyboard.type('='); // alias: the legend's unshifted key
    await expect
      .poll(async () => (await readZoom(page)) / (zoom0 * 1.25 ** 2), "an '=' steps in again")
      .toBeCloseTo(1, 6);
    await page.keyboard.type('-'); // one out — the reciprocal
    await expect
      .poll(async () => (await readZoom(page)) / (zoom0 * 1.25), "'-' steps out ×1.25")
      .toBeCloseTo(1, 6);
    await page.keyboard.type('_'); // alias: the underscore
    await expect
      .poll(async () => (await readZoom(page)) / zoom0, "a '_' steps back to the boot zoom")
      .toBeCloseTo(1, 6);

    // Repeated steps, then 0 = fit: the value returns to exactly what the
    // Fit button's machinery produces (the ONE internal fit site, R1/D81).
    await page.keyboard.type('+');
    await page.keyboard.type('+');
    await page.keyboard.type('0');
    await expect.poll(async () => (await readZoom(page)) / zoom0, "'0' restores the fit").toBeCloseTo(1, 6);
    await page.keyboard.type('-');
    await activate(page, 'tme-zoom-fit'); // the button — the same fit, not arithmetic
    await expect
      .poll(async () => (await readZoom(page)) / zoom0, "the Fit button's fit == the '0' fit")
      .toBeCloseTo(1, 6);

    // A form field holding focus eats its own keys (C32 guard): '+' typed
    // into the Maps panel's create input moves the INPUT, never the canvas.
    await activate(page, 'tme-maps-toggle');
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible();
    const zFocused = await readZoom(page);
    await page.getByTestId('tme-maps-create-input').focus();
    await page.keyboard.type('+++---'); // the input's content; the canvas is untouched
    await expect
      .poll(async () => (await readZoom(page)) / zFocused, 'zoom unmoved while an input holds focus')
      .toBeCloseTo(1, 6);
    expect(await readLoadedMapId(page), 'no commit fired from the guarded keys').toBe(BOOT_MAP_ID);
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible();
    expect(bad, 'console clean through the key families (C32)').toEqual([]);
  });
});
