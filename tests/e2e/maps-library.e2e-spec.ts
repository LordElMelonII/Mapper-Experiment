// tests/e2e/maps-library.e2e-spec.ts — PKG B-137 (§5 Phase 3 M4 / §5 M4
// line): the MAP LIBRARY as a real surface — the Maps manager panel
// (open/new/duplicate/delete), the save dock persisting through the
// library, the D40 mapless boot, and the D79 one-time calibrate hint — at
// BOTH playwright projects (desktop + emulated phone with touch) per
// D53/F52 mobile-and-desktop parity.
//
// Cited IDs:
//   D40      — the boot doctrine: a chat starts mapless; the user explicitly
//              picks a map (?map=none boots the harness mapless and the Maps
//              panel AUTO-OPENS); a card's map pointer appears as a
//              SUGGESTED entry (?cardmap=) and never auto-applies.
//   D79      — the new-map flow: 1 px = 1 unit default scale, one-time
//              calibrate hint (informational, dismissible, cleared by
//              calibrating), explicit-action overwrite only.
//   §5 M4    — save/load/duplicate/delete maps through the MAP_LIBRARY
//              store seam; the save dock persists the current map through
//              library.save AFTER the facade's saveMap (the C24 saved-plane
//              semantics untouched).
//   C25/D41  — duplicates are deep copies (element ids preserved,
//              forkedFrom stripped): editing a copy never moves the
//              original — asserted USER-VISIBLE through the property panel.
//   R1       — the delete confirm names the map, no counts (the UI never
//              counts facts it doesn't have); every displayed word is
//              authored/store data.
//   R2/R4    — the panel mutates nothing directly (store + service
//              wrappers); the library is a store, never a second graph
//              truth. Spec assertions read the read-only __TME_E2E__ seam.
//   C23      — plain words everywhere a user reads (rows addressed by
//              authored name; the confirm's fixed sentence shape).
//   C30/C32  — the empty-input Create is disabled; store failures degrade
//              to rendered words, never throws; the mapless state is the
//              honest empty backdrop (zero console errors).
//   D91      — panel open/close never resizes the stage nor moves the
//              viewport; the B-136 route floor stays a full >= 44px target
//              with the Maps sheet stacked.
//   F52/D53  — every new control >= 44px both dimensions, touch-alone;
//              canvas taps coverage-guarded (the B-133c discipline); no
//              horizontal scroll at phone width.
//
// FX1 facts (data/worlds/fuyuki.ts): the seeded boot map is named
// 'Fuyuki & Misaki (FX1)' (id fuyuki-misaki — an assertion key only, never
// rendered); its boot pin is 'emiya-residence' (the mapless boot + Open
// must show NO pin — D40); 'Emiya Residence' is a known node label. The
// harness library is session-memory: every page load seeds exactly one row
// (the booted display map), so each cell starts from a known store.
import { expect, test, type Page } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeHasClass(id: string, cls: string): boolean;
  nodeData(id: string): { label: string } | null;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  libraryList(): Promise<{ id: string; name: string; forkedFrom: string | null }[]>;
  bootMapless(): boolean;
  cardSuggestedMapId(): string | null;
  loadedMapId(): string | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

/** FX1 facts the cells engineer against. */
const SEEDED_NAME = 'Fuyuki & Misaki (FX1)';
const EMIYA_ID = 'emiya-residence';
const EMIYA_LABEL = 'Emiya Residence';

const isPhone = (): boolean => test.info().project.name === 'phone';

// page.evaluate callbacks are SERIALIZED: the hook lookup is inlined in
// each one and every read happens IN the browser context (functions do not
// survive the wire — the discipline every other spec follows).

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeLabels();
  });

const readNodeHasClass = (page: Page, id: string, cls: string): Promise<boolean> =>
  page.evaluate(
    ({ id, cls }) => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeHasClass(id, cls);
    },
    { id, cls },
  );

const readNodeLabel = (page: Page, id: string): Promise<string | null> =>
  page.evaluate(
    (nodeId) => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeData(nodeId)?.label ?? null;
    },
    id,
  );

const readLibraryList = (page: Page): Promise<{ id: string; name: string }[]> =>
  page.evaluate((): Promise<{ id: string; name: string }[]> => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.libraryList();
  });

const readLoadedMapId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.loadedMapId();
  });

const readBootMapless = (page: Page): Promise<boolean> =>
  page.evaluate((): boolean => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.bootMapless();
  });

const readCardSuggestedMapId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.cardSuggestedMapId();
  });

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId) => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeRenderedPosition(nodeId);
    },
    id,
  );

/** Housekeeping: collect console errors/warnings/pageerrors (the D81 pattern). */
const collectConsole = (page: Page): string[] => {
  const bad: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));
  return bad;
};

/** F52/D53: one activation path for DOM controls on every project. */
const activateLocator = async (page: Page, locator: ReturnType<Page['getByTestId']>): Promise<void> => {
  if (isPhone()) await locator.tap();
  else await locator.click();
};
const activate = async (page: Page, testId: string): Promise<void> =>
  activateLocator(page, page.getByTestId(testId));

/** Wait two animation frames (the pinned settle precedent — post-layout reads). */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const canvasBox = async (page: Page) => {
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return box;
};

/**
 * F52/D53: genuine tap on the touch-emulated project, click on desktop.
 * B-133c coverage guard (the reference primitive): the panels are stage
 * overlays — if the aim point answers anything but the canvas, collapse the
 * route sheet (the standing summon) when it is the cover, else fail with
 * the geometry rather than tapping blind.
 */
const tapPoint = async (page: Page, x: number, y: number): Promise<void> => {
  const covered = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return el === null || el.closest('.tme-canvas') === null ? String(el?.tagName ?? 'none') : null;
  }, [x, y] as const);
  if (covered !== null) {
    const rail = page.getByTestId('tme-sheet-rail');
    if ((await rail.count()) > 0 && (await rail.getAttribute('aria-expanded')) === 'true') {
      await rail.click();
      await expect(rail).toHaveAttribute('aria-expanded', 'false');
      await page.waitForTimeout(200); // the collapse re-renders — a tap in the same tick can still hit the body
    } else {
      throw new Error(`tapPoint: the aim (${Math.round(x)},${Math.round(y)}) is covered by ${covered}`);
    }
  }
  if (isPhone()) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
};

/**
 * Open the Maps panel through the layers nav's Maps affordance (the D82
 * Manage pattern — ONE summon for both worlds, D53/F52). The first
 * activation gets a 2s web-first polling window (the zoneless CD flush
 * lands asynchronously — an immediate DOM read would race it); only a
 * genuine no-open (the D96 dropped-tap class) triggers ONE harmless retry —
 * the second activation fires only if the panel never opened.
 */
const openMaps = async (page: Page): Promise<void> => {
  const panel = page.getByTestId('tme-maps-panel');
  await activate(page, 'tme-maps-toggle');
  const opened = await expect(panel)
    .toBeVisible({ timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    await activate(page, 'tme-maps-toggle');
    await expect(panel).toBeVisible();
  }
};

/**
 * One library row in VIEW mode, addressed by its authored map NAME (C23 —
 * never an id). The name match is EXACT (an anchored regex on the row's
 * name span): a substring match would confuse 'Fuyuki & Misaki (FX1)' with
 * its ' (copy)' twin — two rows, strict-mode violation.
 */
const escapeRe = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mapRow = (page: Page, name: string) =>
  page.locator('[data-testid="tme-map-row"]').filter({
    has: page
      .getByTestId('tme-map-name')
      .filter({ hasText: new RegExp(`^${escapeRe(name)}$`) }),
  });

/**
 * One library row in DELETE-CONFIRM mode — the confirm sentence names the
 * map (the name span is gone while the confirm block shows).
 */
const confirmRow = (page: Page, name: string) =>
  page.locator('[data-testid="tme-map-row"]').filter({
    has: page.getByTestId('tme-map-confirm').filter({ hasText: `'${name}'` }),
  });

/** One row control's activation path for every project (the activate twin, row-scoped). */
const rowActivate = async (page: Page, name: string, testId: string): Promise<void> =>
  activateLocator(page, mapRow(page, name).getByTestId(testId));

/**
 * F52 sweep over the panel's own controls: every visible button/input
 * inside the Maps panel (plus, when rendered, the D79 hint) measures
 * >= 44px in BOTH dimensions (touch-only parity).
 */
const sweepTapTargets = async (page: Page): Promise<void> => {
  const tooSmall = await page.evaluate(() => {
    const bad: string[] = [];
    const roots = [
      document.querySelector('[data-testid="tme-maps-panel"]'),
      document.querySelector('[data-testid="tme-calibrate-hint"]'),
    ];
    for (const root of roots) {
      if (root === null) continue;
      for (const el of root.querySelectorAll<HTMLElement>('button, input')) {
        if (el.offsetParent === null) continue; // not rendered
        const r = el.getBoundingClientRect();
        if (r.width < 44 || r.height < 44) bad.push(`${el.tagName}.${el.className} ${r.width}x${r.height}`);
      }
    }
    return bad;
  });
  expect(tooSmall, 'every Maps-panel/hint control is a >= 44px tap target (F52)').toEqual([]);
};

test.describe('the map library: Maps panel, save dock, mapless boot, D79 hint (PKG B-137)', () => {
  test('default boot byte-stable: the library lists the seeded map (one explicit row pin)', async ({ page }) => {
    const bad = collectConsole(page);
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);

    await openMaps(page);
    await expect(mapRow(page, SEEDED_NAME).getByTestId('tme-map-name')).toHaveText(SEEDED_NAME);
    const rows = await readLibraryList(page);
    expect(rows.map((row) => row.name), 'the boot map is seeded into the library (idempotent upsert)').toEqual([
      SEEDED_NAME,
    ]);
    expect(await readLoadedMapId(page), 'the default boot still loads FX1').not.toBeNull();
    await expect(page.getByTestId('tme-location')).toHaveText(EMIYA_LABEL); // R1: the boot snapshot serves

    await sweepTapTargets(page);
    await activate(page, 'tme-maps-panel-close');
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden();
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('mapless boot (D40): the picker auto-opens over the empty backdrop; Open serves FX1 with NO pin', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await page.goto('/?map=none');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();

    // The mapless state: no loadMap happened — the panel auto-opened, the
    // canvas is empty, the header degrades to empty strings (C27/C32).
    expect(await readBootMapless(page), 'the boot was mapless').toBe(true);
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible(); // AUTO-opened
    expect(await readLoadedMapId(page)).toBeNull();
    await expect.poll(() => readLabels(page)).toEqual([]);
    await expect(page.getByTestId('tme-location')).toHaveText('');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden(); // C30: nothing to save

    // The user's explicit pick loads the map (D40) — the panel closes with
    // the fresh loadMap and the FX1 projections serve.
    await rowActivate(page, SEEDED_NAME, 'tme-map-open');
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden(); // the fresh loadMap closed it
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);
    expect(await readLoadedMapId(page), 'the picked map is loaded').not.toBeNull();

    // D40: a loaded map starts with NO pin — the user sets it (the C27
    // degraded snapshot is the honest first state; the boot pin is gone).
    expect(await readNodeHasClass(page, EMIYA_ID, 'tme-pin'), 'no pin after an explicit open (D40)').toBe(false);
    await expect(page.getByTestId('tme-location')).toHaveText('');

    expect(bad, 'console clean through the mapless journey (C32)').toEqual([]);
  });

  test('new-map flow (D79): create, the one-time hint, dismiss, dock-save persists within the session', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await page.goto('/?map=none');
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible(); // auto-opened picker

    // CREATE "Test Land" (the D79 flow: createWorldMap defaults, store upsert, open).
    await page.getByTestId('tme-maps-create-input').fill('Test Land');
    await activate(page, 'tme-maps-create');
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden(); // the Open path closed it
    await expect.poll(async () => (await readLibraryList(page)).map((row) => row.name)).toContain('Test Land');
    expect(await readLabels(page), 'the empty canvas serves').toEqual([]);

    // The D79 one-time hint shows on the fresh map — and only on it.
    await expect(page.getByTestId('tme-calibrate-hint')).toContainText(
      'New map: 1 px = 1 unit. Draw a route and calibrate its scale when you know real distances.',
    );
    await sweepTapTargets(page); // the hint's Dismiss included
    await activate(page, 'tme-calibrate-hint-dismiss');
    await expect(page.getByTestId('tme-calibrate-hint')).toBeHidden();

    // Editor-place one node: the dock lights (F45/D75)…
    await activate(page, 'tme-editor-toggle');
    const box = await canvasBox(page);
    await tapPoint(page, box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    // …and the dock's Save persists through the library (NO reload — the
    // same session, the store write after the facade's saveMap).
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(async () => (await readLibraryList(page)).map((row) => row.name)).toContain('Test Land');

    // Reload-NOT-required persistence: open another map, come back — the
    // placed node is there (the store kept the saved state).
    await openMaps(page);
    await rowActivate(page, SEEDED_NAME, 'tme-map-open');
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);
    await openMaps(page);
    await rowActivate(page, 'Test Land', 'tme-map-open');
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain('New place');

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('duplicate (C25/D41): a " (copy)" row; the copy edits independently — the original keeps its label', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await page.goto('/');
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);

    await openMaps(page);
    await rowActivate(page, SEEDED_NAME, 'tme-map-duplicate');
    const copyName = `${SEEDED_NAME} (copy)`;
    await expect(mapRow(page, copyName).getByTestId('tme-map-name')).toHaveText(copyName);
    await expect
      .poll(async () => (await readLibraryList(page)).map((row) => row.name))
      .toEqual([SEEDED_NAME, copyName]); // insertion order; a duplicate never loads

    // Open the COPY and rename a node through the property panel (F40).
    await rowActivate(page, copyName, 'tme-map-open');
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden(); // the fresh loadMap closed it
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);
    await activate(page, 'tme-editor-toggle');
    const pos = await readPosition(page, EMIYA_ID);
    expect(pos, 'engineering: the copy projects its nodes').not.toBeNull();
    const box = await canvasBox(page);
    await tapPoint(page, box.x + pos!.x, box.y + pos!.y);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    const label = page.getByTestId('tme-node-label-input');
    await expect(label).toHaveValue(EMIYA_LABEL);
    await label.fill('Emiya Home');
    await activate(page, 'tme-node-done');
    await expect.poll(() => readNodeLabel(page, EMIYA_ID), { timeout: 5_000 }).toBe('Emiya Home');

    // Re-open the ORIGINAL: its stored label is untouched (the deep copy IS
    // the independence — the user sees it, C25/D41).
    await openMaps(page);
    await rowActivate(page, SEEDED_NAME, 'tme-map-open');
    await expect.poll(() => readNodeLabel(page, EMIYA_ID), { timeout: 5_000 }).toBe(EMIYA_LABEL);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('delete: the confirm names the map, no counts (R1); deleting the LOADED map goes mapless (D40)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await page.goto('/');
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);

    await openMaps(page);

    // A COPY dies first: the row goes, the loaded map is unaffected.
    await rowActivate(page, SEEDED_NAME, 'tme-map-duplicate');
    const copyName = `${SEEDED_NAME} (copy)`;
    await expect(mapRow(page, copyName).getByTestId('tme-map-name')).toHaveText(copyName);
    await rowActivate(page, copyName, 'tme-map-delete');
    const confirm = confirmRow(page, copyName).getByTestId('tme-map-confirm');
    await expect(confirm).toHaveText(`Delete map '${copyName}'? This cannot be undone.`); // C23/R1: name, no counts
    await activateLocator(page, confirmRow(page, copyName).getByTestId('tme-map-delete-cancel'));
    await expect(mapRow(page, copyName).getByTestId('tme-map-name')).toBeVisible(); // cancel restored the row
    await rowActivate(page, copyName, 'tme-map-delete');
    await activateLocator(page, confirmRow(page, copyName).getByTestId('tme-map-delete-confirm'));
    await expect(mapRow(page, copyName)).toHaveCount(0);
    expect(await readLoadedMapId(page), 'the loaded map survived the copy delete').not.toBeNull();

    // The LOADED map's row dies: the viewer goes MAPLESS — the same no-map
    // state as the mapless boot, the panel STAYS open (the picker is where
    // the user stands, D40).
    await rowActivate(page, SEEDED_NAME, 'tme-map-delete');
    await activateLocator(page, confirmRow(page, SEEDED_NAME).getByTestId('tme-map-delete-confirm'));
    await expect(mapRow(page, SEEDED_NAME)).toHaveCount(0);
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible(); // stays open (the picker is where the user stands)
    await expect(page.getByTestId('tme-maps-empty')).toBeVisible(); // the empty-library state
    expect(await readLoadedMapId(page)).toBeNull();
    await expect.poll(() => readLabels(page)).toEqual([]);
    await expect(page.getByTestId('tme-location')).toHaveText('');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden(); // C30: no map, no dock

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('card suggestion (D40): the mark shows in the picker; nothing auto-loads', async ({ page }) => {
    const bad = collectConsole(page);
    await page.goto('/?map=none&cardmap=fuyuki-misaki');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible(); // auto-opened

    expect(
      await readCardSuggestedMapId(page),
      'engineering: the boot param reached the suggestion seam',
    ).toBe('fuyuki-misaki');
    await expect(mapRow(page, SEEDED_NAME).getByTestId('tme-map-suggested')).toHaveText(
      'Suggested by the character card',
    );
    // D40: SUGGESTED, never auto-applied — the mapless state stands until
    // the user picks.
    expect(await readLoadedMapId(page)).toBeNull();
    await expect.poll(() => readLabels(page)).toEqual([]);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('phone: the Maps sheet regime — bottom sheet, D91 zero-motion, the B-136 route floor untouched (D53)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the bottom-sheet form + B-136 floor belong to the narrow viewport (D53)');
    const bad = collectConsole(page);
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);
    await settle(page);
    const canvasBefore = await canvasBox(page);

    // The nav's Maps affordance opens the BOTTOM-SHEET form: rail visible,
    // body shown, canvas byte-equal (D91: open/close resizes nothing — the
    // sheet overlays the stage, the B-136 route floor is untouched).
    await openMaps(page);
    await expect(page.getByTestId('tme-maps-rail')).toBeVisible();
    await expect(page.getByTestId('tme-maps-rail')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('tme-maps-body')).toBeVisible();
    await settle(page);
    const canvasOpen = await canvasBox(page);
    expect(canvasOpen.height, 'open never resizes the canvas (D91 zero-motion)').toBe(canvasBefore.height);
    expect(canvasOpen.width, 'open never resizes the canvas (D91 zero-motion)').toBe(canvasBefore.width);

    // The B-136 floor: the route sheet's standing summon stays a full
    // >= 44px tap target WITH the Maps sheet stacked above it.
    const routeRail = page.getByTestId('tme-sheet-rail');
    await expect(routeRail).toBeVisible();
    const floor = await page.evaluate(() => {
      const rail = document.querySelector('[data-testid="tme-sheet-rail"]');
      if (rail === null) return null;
      const r = rail.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { h: r.height, hitIsRail: hit !== null && hit.closest('[data-testid="tme-sheet-rail"]') !== null };
    });
    expect(floor, 'engineering: the route sheet is in the stack').not.toBeNull();
    expect(floor!.h, 'route summon height >= 44px (B-136/F52)').toBeGreaterThanOrEqual(44);
    expect(floor!.hitIsRail, 'the route summon center is hittable (B-136)').toBe(true);

    // The rail collapse folds the body; the canvas still never moves.
    await activate(page, 'tme-maps-rail');
    await expect(page.getByTestId('tme-maps-body')).toBeHidden();
    await settle(page);
    expect((await canvasBox(page)).height, 'collapse never resizes the canvas (D91)').toBe(canvasBefore.height);

    // Re-open and Escape: the whole sheet hides (the B-117 closed form);
    // D53: no horizontal scroll at 390px.
    await openMaps(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden();
    await settle(page);
    expect((await canvasBox(page)).height, 'close never resizes the canvas (D91)').toBe(canvasBefore.height);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at the phone viewport (F52/D53)').toBeLessThanOrEqual(0);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });
});
