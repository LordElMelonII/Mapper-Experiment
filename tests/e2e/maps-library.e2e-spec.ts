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
// 'Fuyuki & Misaki' (id fuyuki-misaki — an assertion key only, never
// rendered); its boot pin is 'emiya-residence' (the mapless boot + Open
// must show NO pin — D40); 'Emiya Residence' is a known node label. The
// harness library is session-memory: every page load seeds exactly one row
// (the booted display map), so each cell starts from a known store.
import { readFile } from 'node:fs/promises';
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
const SEEDED_NAME = 'Fuyuki & Misaki'; // B-149 R9 item 6 re-baseline: the '(FX1)' suffix was harness fixture-speak (R1 verbatim render).
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

const readLibraryList = (page: Page): Promise<{ id: string; name: string; forkedFrom: string | null }[]> =>
  page.evaluate((): Promise<{ id: string; name: string; forkedFrom: string | null }[]> => {
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
 * Manage pattern — ONE summon for both worlds, D53/F52), IDEMPOTENT for an
 * already-standing panel. B-139 finding (the fork flow leaves the picker
 * standing — the documented pick): the old poll resolved its FIRST expect()
 * probe off the STALE pre-toggle DOM (zoneless CD renders the flip a frame
 * after the click), so one standing-panel openMaps CLOSED the panel and
 * skipped the retry — the row activation then waited on an unrendered row
 * for the whole timeout. THE GATE reads the toggle's rendered aria-pressed
 * (the same mapsPanelOpen state the @if renders — both flip in one CD, so
 * the gate never desynchronizes from the DOM): summon only a genuinely
 * closed panel; a closed-panel summon keeps the original discipline — the
 * first activation gets a 2s polling window, one harmless retry only for a
 * genuine no-open (the D96 dropped-tap class).
 */
const openMaps = async (page: Page): Promise<void> => {
  const panel = page.getByTestId('tme-maps-panel');
  const toggle = page.getByTestId('tme-maps-toggle');
  if ((await toggle.getAttribute('aria-pressed')) === 'true') return; // already standing
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
 * name span): a substring match would confuse 'Fuyuki & Misaki' with
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

// --- PKG B-138: the import/export family ---------------------------------------
//
// Cited IDs (beyond the module header):
//   §5 M4    — "JSON export/import, MDS importer UI ('paste your lookup
//              table')": exactly this family — the per-row Export download,
//              the JSON file import, the paste importer; fork UX is B-139's.
//   C5       — EVERY import lands under a FRESH engine id
//              (generateMapId(knownIds()), the re-id ruling): a foreign
//              file's id never lands, a second paste becomes a second map.
//   C30/C32  — the empty-paste Import is disabled (the canCreate pattern);
//              every refusal renders the engine's field-precise words in the
//              panel's error channel — nothing throws through the UI.
//   D40      — NO auto-load: an import only saves; the user opens it.
//   F05/FX3  — the paste importer IS the engine (importLookupTable: parse +
//              MDS + validate); the engine's fixed name 'Imported Lookup
//              Table' rides; a garbage paste returns the engine's issues and
//              the paste SURVIVES for editing.
//   F52/D53  — the new controls join the >= 44px sweep (the file input's box
//              IS the tap target), touch-alone activation on the phone
//              project; console-clean cells throughout.

/** A small hand-written schemaVersion-2 map — a fixture string, not a repo file. */
const IMPORT_FILE_JSON = JSON.stringify({
  schemaVersion: 2,
  id: 'foreign-map', // the foreign id that must NEVER land (the re-id ruling, C5)
  name: 'Imported Land',
  layers: [{ id: 'l1', name: 'Main' }],
  scale: { unitPerPx: 1, unitLabel: 'units', unitKind: 'distance' },
  nodes: [],
  edges: [],
});

/** A small valid lookup-table paste — a complete walking triangle (F05 format). */
const PASTE_TABLE = `<walking_distances>
KEY: A:Alpha Town|B:Beta Keep|C:Cross Inn

DIST(min):
A:B10,C12
B:C8
</walking_distances>`;

const IMPORTED_FILE_NAME = 'Imported Land';
const IMPORTED_TABLE_NAME = 'Imported Lookup Table'; // the engine's fixed authored name (C23)

test.describe('the map library: import/export family (PKG B-138)', () => {
  test('export (per row): the download is .json and its body round-trips the seeded map', async ({ page }) => {
    const bad = collectConsole(page);
    await page.goto('/');
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);

    await openMaps(page);
    const seededId = (await readLibraryList(page)).find((row) => row.name === SEEDED_NAME)!.id;

    const downloadPromise = page.waitForEvent('download');
    await rowActivate(page, SEEDED_NAME, 'tme-map-export');
    const download = await downloadPromise;
    expect(download.suggestedFilename().endsWith('.json'), 'the export downloads as .json').toBe(true);
    const body = JSON.parse(await readFile(await download.path(), 'utf8')) as { id: string; name: string };
    expect(body.name, 'the body IS the stored map (name round-trip)').toBe(SEEDED_NAME);
    expect(body.id, 'the body IS the stored map (id round-trip)').toBe(seededId);

    await sweepTapTargets(page); // Export joins the row's controls; the import family is swept with it
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('import file: a schemaVersion-2 JSON lands as a fresh-id row; a corrupt file degrades to words, no row', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await page.goto('/');
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);

    await openMaps(page);
    const fileInput = page.getByTestId('tme-maps-import-file');
    await fileInput.setInputFiles({
      name: 'imported-land.json',
      mimeType: 'application/json',
      buffer: Buffer.from(IMPORT_FILE_JSON, 'utf8'),
    });
    await expect.poll(async () => (await readLibraryList(page)).map((row) => row.name)).toContain(IMPORTED_FILE_NAME);
    const rows = await readLibraryList(page);
    const imported = rows.find((row) => row.name === IMPORTED_FILE_NAME)!;
    expect(imported.id, 'the foreign id never lands — a fresh engine id does (C5, the re-id ruling)').not.toBe(
      'foreign-map',
    );
    expect(imported.id).toMatch(/^map-\d+$/);
    expect(await readLoadedMapId(page), 'NO auto-load — the user opens the import (D40)').not.toBe(imported.id);

    // The corrupt file: the parse refusal renders words; no row appears.
    const countBefore = rows.length;
    await fileInput.setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ not json', 'utf8'),
    });
    await expect(page.getByTestId('tme-maps-error')).toBeVisible();
    await expect(page.getByTestId('tme-maps-error')).toContainText('not valid JSON');
    await expect.poll(async () => (await readLibraryList(page)).length).toBe(countBefore);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('paste importer: a valid lookup table lands under the engine name with a fresh id; opening it renders the MDS nodes', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await page.goto('/');
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);

    await openMaps(page);
    const textarea = page.getByTestId('tme-maps-paste-input');
    await expect(
      page.getByTestId('tme-maps-paste-import'),
      'C30: the empty-paste Import is disabled (the canCreate pattern)',
    ).toBeDisabled();
    await textarea.fill(PASTE_TABLE);
    await expect(page.getByTestId('tme-maps-paste-import')).toBeEnabled();
    await activate(page, 'tme-maps-paste-import');

    await expect
      .poll(async () => (await readLibraryList(page)).map((row) => row.name))
      .toContain(IMPORTED_TABLE_NAME);
    const imported = (await readLibraryList(page)).find((row) => row.name === IMPORTED_TABLE_NAME)!;
    expect(
      imported.id,
      'the engine fixed table id never lands — a fresh engine id does (C5, the re-id ruling)',
    ).not.toBe('imported-lookup-table');
    expect(imported.id).toMatch(/^map-\d+$/);
    await expect(textarea, 'cleared on success').toHaveValue('');

    // The user's explicit pick (D40): Open serves the imported map — the
    // MDS-seeded triangle renders (all three KEY labels).
    await rowActivate(page, IMPORTED_TABLE_NAME, 'tme-map-open');
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden(); // the fresh loadMap closed it
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toHaveLength(3);
    expect(await readLabels(page), 'the MDS triangle renders (all three KEY labels)').toEqual(
      expect.arrayContaining(['Alpha Town', 'Beta Keep', 'Cross Inn']),
    );

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('paste importer, garbage: the engine field-precise words render and the paste survives for editing', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await page.goto('/');
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);

    await openMaps(page);
    const textarea = page.getByTestId('tme-maps-paste-input');
    await textarea.fill('nonsense');
    await activate(page, 'tme-maps-paste-import');

    const error = page.getByTestId('tme-maps-error');
    await expect(error).toBeVisible();
    await expect(error, 'the ENGINE field-precise issue, verbatim (C30/C32)').toContainText(
      "line 1: unrecognized line 'nonsense'",
    );
    await expect(textarea, 'NOT wiped — the author edits their paste').toHaveValue('nonsense');
    expect((await readLibraryList(page)).map((row) => row.name), 'no row appears').toEqual([SEEDED_NAME]);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });
});

// --- PKG B-139: the fork family -------------------------------------------------
//
// Cited IDs (beyond the module header):
//   C25/D41  — forking copies library → a chat-attached private map and
//              SWITCHES the chat's reference (the overlay re-point): the fork
//              NEVER lands as a library row until the explicit save-back, and
//              a fork edit never reaches the parent row (never-re-sync is
//              user-visible). The fork session starts clean (D75) and
//              pin-less (D40) like every explicit open.
//   D97/D41  — "Save fork back to library" is its own explicit action (never
//              bundled into the F45 save/dock flows) and moves NO facade
//              state; it lands the save-MOMENT snapshot under the fork's OWN
//              id/name while the fork keeps diverging — both halves asserted
//              user-visibly from the stored row.
//   F07/rows — the save-back control renders ON the fork session and
//              structurally ABSENT on a non-fork one (count-zero, never a
//              disabled husk) — the state is structural.
//   D75/F45  — the copy IS its saved plane: the dock stays unlit right after
//              the fork and lights on the fork's own first edit.
//   C5       — every fork identity is a fresh engine map id ('map-<n>',
//              never the row's); a fork chain never re-uses ids.
//   C23      — fork rows share their parent's NAME (the engine copies it
//              verbatim) and speak the provenance words; rows are therefore
//              located by name AND provenance line — ids never render.
//   A-022    — a re-fork (the loaded fork's own row) is legal with no
//              special case; its saved-back provenance names the IMMEDIATE
//              parent.
//   R2/R4    — every command through the service wrappers; the hook seam
//              reads loaded ids only.
//   F52/D53  — the fork controls join the >= 44px sweep; touch-alone
//              activation on the phone project; console-clean cells.

/**
 * One FORK row — located by the exact NAME span AND the provenance line
 * 'Forked from <parentName>': a fork row shares its parent's NAME (the
 * engine copies it verbatim; C23 speaks words only), so the provenance line
 * is the discriminator against the parent row in strict mode.
 */
const forkRowOf = (page: Page, parentName: string) =>
  page
    .locator('[data-testid="tme-map-row"]')
    .filter({
      has: page.getByTestId('tme-map-provenance').filter({ hasText: `Forked from ${parentName}` }),
    })
    .filter({
      has: page.getByTestId('tme-map-name').filter({ hasText: new RegExp(`^${escapeRe(parentName)}$`) }),
    });

/** Close the Maps panel when open (a fork leaves it open — the documented pick; never shades a canvas aim). */
const closeMapsIfOpen = async (page: Page): Promise<void> => {
  const panel = page.getByTestId('tme-maps-panel');
  if (await panel.isVisible()) await activate(page, 'tme-maps-panel-close');
  await expect(panel).toBeHidden();
};

/** Enter the editor when not already on (repeated loads keep the mode — the pressed state is the idempotence read). */
const ensureEditor = async (page: Page): Promise<void> => {
  const toggle = page.getByTestId('tme-editor-toggle');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await activate(page, 'tme-editor-toggle');
  await expect(toggle, 'the editor is ON (the rename recipe runs in editor mode)').toHaveAttribute(
    'aria-pressed',
    'true',
  );
};

/**
 * The F40 rename recipe: editor ON, tap the node (tapPoint's coverage guard
 * keeps the aim honest), rename through the property panel, poll the hook.
 * The Maps panel must be closed before calling (closeMapsIfOpen).
 */
const renameEmiya = async (page: Page, incoming: string, next: string): Promise<void> => {
  await ensureEditor(page);
  const pos = await readPosition(page, EMIYA_ID);
  expect(pos, 'engineering: the session projects its nodes').not.toBeNull();
  const box = await canvasBox(page);
  await tapPoint(page, box.x + pos!.x, box.y + pos!.y);
  await expect(page.getByTestId('tme-property-panel')).toBeVisible();
  const label = page.getByTestId('tme-node-label-input');
  await expect(label).toHaveValue(incoming);
  await label.fill(next);
  await activate(page, 'tme-node-done');
  await expect.poll(() => readNodeLabel(page, EMIYA_ID), { timeout: 5_000 }).toBe(next);
};

test.describe('the map library: the fork family (PKG B-139)', () => {
  test('fork (C25/D41): a clean chat copy — no row, fresh id, no pin; the edit never reaches the parent', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await page.goto('/');
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);

    await openMaps(page);
    // The row family renders on every row; the save-back is structurally ABSENT
    // on the non-fork session (count-zero, never a disabled husk — F07/structural).
    await expect(mapRow(page, SEEDED_NAME).getByTestId('tme-map-fork')).toBeVisible();
    await expect(
      page.getByTestId('tme-maps-save-fork'),
      'not a fork — the save-back does not render',
    ).toHaveCount(0);
    await sweepTapTargets(page); // Fork joins the row's >= 44px controls on the non-fork form

    const seededId = (await readLibraryList(page)).find((row) => row.name === SEEDED_NAME)!.id;

    // FORK the seeded row — fresh load (pin-null) then forkMap, ONE user action.
    await rowActivate(page, SEEDED_NAME, 'tme-map-fork');

    // The picker STAYS OPEN (documented pick — the user picks from the list).
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible();
    // C25: the fork NEVER lands as a library row — the store is untouched.
    expect(
      (await readLibraryList(page)).map((row) => ({ name: row.name, forkedFrom: row.forkedFrom })),
      'the fork is chat state, not a row (C25)',
    ).toEqual([{ name: SEEDED_NAME, forkedFrom: null }]);

    // C25's "switches the chat's reference": the loaded id is a FRESH engine id, never the row's.
    const forkId = await readLoadedMapId(page);
    expect(forkId, 'the loaded map is the fork (the hook seam reads the service state)').not.toBe(seededId);
    expect(forkId, 'a fresh engine-assigned map id (C5)').toMatch(/^map-\d+$/);
    // D40: the fresh session starts with NO pin.
    expect(await readNodeHasClass(page, EMIYA_ID, 'tme-pin'), 'the fork session starts pin-null (D40)').toBe(false);
    // D75/F45: the fork starts CLEAN — the copy IS its saved plane.
    await expect(page.getByTestId('tme-save-dock'), 'the fork starts clean (D75/F45)').toBeHidden();
    // The save-back gate renders on the fork session; the copy projects FX1.
    await expect(page.getByTestId('tme-maps-save-fork')).toBeVisible();
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);
    await sweepTapTargets(page); // the save-back control joins the >= 44px form on the fork session
    await closeMapsIfOpen(page);

    // Edit the fork through the property panel — the fork is editable chat state.
    await renameEmiya(page, EMIYA_LABEL, 'Emiya Home');
    await expect(page.getByTestId('tme-save-dock'), 'the fork edit is unsaved (F45)').toBeVisible();

    // Re-open the PARENT: its stored label stands (the C25 detach, user-visible — never re-sync).
    await openMaps(page);
    await rowActivate(page, SEEDED_NAME, 'tme-map-open');
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden();
    await expect.poll(() => readNodeLabel(page, EMIYA_ID), { timeout: 5_000 }).toBe(EMIYA_LABEL);
    expect(await readLoadedMapId(page), 'the parent session is back (the fork dropped with it)').toBe(seededId);

    // …and the save-back is structurally gone again on the plain session.
    await openMaps(page);
    await expect(page.getByTestId('tme-maps-save-fork')).toHaveCount(0);

    expect(bad, 'console clean through the fork journey (C32)').toEqual([]);
  });

  test('save fork back (D97): the row carries the save-moment state; the fork keeps diverging', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await page.goto('/');
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);
    const seededId = (await readLibraryList(page)).find((row) => row.name === SEEDED_NAME)!.id;

    // Fork, then edit the fork BEFORE the save-back — the row must carry the CURRENT state.
    await openMaps(page);
    await rowActivate(page, SEEDED_NAME, 'tme-map-fork');
    const forkId = await readLoadedMapId(page);
    expect(forkId, 'engineering: the fork session stands (C25)').not.toBe(seededId);
    await closeMapsIfOpen(page);
    await renameEmiya(page, EMIYA_LABEL, 'Emiya Home');

    // THE EXPLICIT SAVE-BACK — its own single action (never the dock flow).
    await openMaps(page);
    await expect(page.getByTestId('tme-maps-save-fork'), 'the save-back renders on the fork session').toBeVisible();
    await activate(page, 'tme-maps-save-fork');
    await expect(page.getByTestId('tme-fork-saved'), 'the inline words confirm (C23)').toHaveText(
      'Saved to the library.',
    );
    // A fork row appeared: same WORDS as the parent (C23), the provenance line rendered.
    await expect(forkRowOf(page, SEEDED_NAME), 'the saved row is here — name AND provenance').toHaveCount(1);
    await expect(forkRowOf(page, SEEDED_NAME).getByTestId('tme-map-provenance')).toHaveText(
      'Forked from Fuyuki & Misaki',
    );
    const rows = await readLibraryList(page);
    expect(
      rows.map((row) => row.forkedFrom),
      'provenance of the saved row is the parent id (D41/D97)',
    ).toEqual([null, seededId]);
    expect(rows[1].id, 'the fork id IS its library id (D97 v1 — the id round-trips)').toBe(forkId);
    // NOT a load (D97 moves NO facade state): the session stands on the fork, the edit stays unsaved.
    expect(await readLoadedMapId(page), 'the save-back is not a load (D97)').toBe(forkId);
    await expect(
      page.getByTestId('tme-save-dock'),
      'NO dirty clear — the fork keeps diverging after the save moment (D97)',
    ).toBeVisible();

    // Re-open the SAVED row: the fork's CURRENT state came along.
    await openMaps(page);
    await activateLocator(page, forkRowOf(page, SEEDED_NAME).getByTestId('tme-map-open'));
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden();
    await expect.poll(() => readNodeLabel(page, EMIYA_ID), { timeout: 5_000 }).toBe('Emiya Home');
    expect(await readLoadedMapId(page), 'the row opened is the fork itself (the same id)').toBe(forkId);

    // Edit further, then re-open the SAME row: the save-moment snapshot stands (the D97 diverge, user-visible).
    await renameEmiya(page, 'Emiya Home', 'Emiya Mansion');
    await openMaps(page);
    // The gate rides the library round-trip: the stored row carries its forkedFrom, the button renders.
    await expect(page.getByTestId('tme-maps-save-fork'), 'the stored fork row is still a fork session').toBeVisible();
    await activateLocator(page, forkRowOf(page, SEEDED_NAME).getByTestId('tme-map-open'));
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden();
    await expect.poll(() => readNodeLabel(page, EMIYA_ID), { timeout: 5_000 }).toBe('Emiya Home');

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('re-fork (A-022): forking the loaded fork row is legal; its saved lineage names the immediate parent', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await page.goto('/');
    await expect.poll(() => readLabels(page), { timeout: 5_000 }).toContain(EMIYA_LABEL);
    const seededId = (await readLibraryList(page)).find((row) => row.name === SEEDED_NAME)!.id;

    // Fork once and save it back: the fork row exists AND the loaded session IS that row.
    await openMaps(page);
    await rowActivate(page, SEEDED_NAME, 'tme-map-fork');
    const forkF = await readLoadedMapId(page);
    expect(forkF).not.toBe(seededId);
    await activate(page, 'tme-maps-save-fork');
    await expect(page.getByTestId('tme-fork-saved')).toHaveText('Saved to the library.');

    // RE-FORK the loaded fork's own row — fork-of-fork, no special case (A-022).
    await activateLocator(page, forkRowOf(page, SEEDED_NAME).getByTestId('tme-map-fork'));
    const forkF2 = await readLoadedMapId(page);
    expect(forkF2, 'the re-fork is a THIRD identity — a chain never re-uses ids (C5)').not.toBe(forkF);
    expect(forkF2, 'and never the parent').not.toBe(seededId);
    expect(forkF2, 'engine-assigned (C5)').toMatch(/^map-\d+$/);

    // Save the re-fork back: the second fork row lands.
    await activate(page, 'tme-maps-save-fork');
    await expect(page.getByTestId('tme-fork-saved')).toHaveText('Saved to the library.');
    const rows = await readLibraryList(page);
    expect(
      rows,
      'library composition: parent, generation, re-fork — forkedFrom names the IMMEDIATE parent (A-022)',
    ).toEqual([
      { id: seededId, name: SEEDED_NAME, forkedFrom: null },
      { id: forkF, name: SEEDED_NAME, forkedFrom: seededId },
      { id: forkF2, name: SEEDED_NAME, forkedFrom: forkF },
    ]);
    // C23: the words ARE the surface (ids never render) — both fork lines read identically.
    const lines = await page.getByTestId('tme-map-provenance').allTextContents();
    expect(lines, 'the provenance lines render (C23)').toEqual([
      'Forked from Fuyuki & Misaki',
      'Forked from Fuyuki & Misaki',
    ]);
    await expect(forkRowOf(page, SEEDED_NAME), 'both fork rows share the parent name AND words').toHaveCount(2);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });
});
