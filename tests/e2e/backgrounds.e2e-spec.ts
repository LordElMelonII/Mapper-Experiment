// tests/e2e/backgrounds.e2e-spec.ts — PKG B-130 (§5 Phase 3 M3): the D84
// per-layer backgrounds go live end-to-end in the manager sheet — the URL
// arm, the Upload arm through the BackgroundStore seam, Remove, per-layer
// scoping, and the C32 load-failure degrade — at BOTH playwright projects
// per D53/F52 (the desktop-only cells: upload replace, remove + scoping,
// C32 degrade, refusal path — the packet's cell list).
//
// Cited IDs:
//   D84      — one background image per layer, two sources one rendering
//              path: Upload ⇒ store.save ⇒ setLayerBackground { assetId };
//              URL Set ⇒ setLayerBackground { url }; Remove ⇒ null; replace
//              = set again. The URL arm travels with the saved map (the
//              portability mitigation for D29).
//   D29      — uploads are machine-local: the harness store is session-local
//              by design; the row names the stored FILE, never a machine key.
//   C32      — a failed load (dead URL) degrades to NO background: the img
//              hides, ONE `[TravelMapper] background load failed` warn, the
//              canvas stays interactive, no pageerror. The console-clean
//              housekeeping tolerates the DELIBERATE warn inside the degrade
//              cell only.
//   F03      — the node graph stays the interface regardless: a node tap
//              still selects after the background dies.
//   D75/F45  — every background command marks only `dirty`: the save dock
//              lights; the no-change cases never reach the command path
//              (Remove renders only when a background exists; Set is
//              disabled while the trimmed input is empty or a no-change).
//   C23      — plain words: the row speaks the user's URL or
//              "Uploaded image (file.png)" — never a store key.
//   F52/D53  — touch-alone operable at 375px; no horizontal scroll; every
//              control a >= 44px tap target; R1 headers verbatim across
//              layer switches.
//
// FX1 facts (data/worlds/fuyuki.ts): layers layer-fuyuki ("Fuyuki City") /
// layer-misaki ("Misaki Town"); the harness displayMap patches layer-fuyuki
// with the placeholder background { assetId: 'assets/harness-bg-fuyuki.png' }
// (D69) — so Fuyuki's row opens with a background (Remove visible) and
// Misaki's opens with none. Canvas taps aim through the DEV-HARNESS-ONLY
// window.__TME_E2E__ seam (src/app/app.ts).
import { chromium, devices, expect, test, type CDPSession, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  /** B-134: the engine's own viewport reads — the transform math's inputs. */
  zoom(): number;
  pan(): { x: number; y: number };
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

/** A deterministic data:image/svg+xml URL — no network, decodes in both engines. */
const SVG_URL =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%2764%27%20height%3D%2764%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20fill%3D%27%23ff8800%27%2F%3E%3C%2Fsvg%3E";

/** Connection-refused dead URL — the img error event, no wait beyond it. */
const DEAD_URL = 'http://127.0.0.1:1/dead.png';

/**
 * The packet's tiny fixture upload (tests/fixtures/bg-red.png, 1x1 red,
 * <= 2KB). Derived from the test FILE's path (TestInfo has no dir in the
 * installed types — verified live: the property is `undefined`) by swapping
 * the file name for the sibling fixtures segment; both engines' Node
 * accepts the mixed separators this produces on Windows.
 */
const fixturePng = (): string =>
  test.info().file.replace(/[/\\][^/\\]+$/, '/../fixtures/bg-red.png');

const FUYUKI_ROW = 'Fuyuki City';
const MISAKI_ROW = 'Misaki Town';
const EMIYA_ID = 'emiya-residence';

/** R1: the three core header strings, verbatim. */
const R1_HEADERS: ReadonlyArray<[string, string]> = [
  ['tme-location', 'Emiya Residence'],
  ['tme-snapshot-layer', 'Fuyuki City'],
  ['tme-unit', 'min'],
];

const isPhone = (): boolean => test.info().project.name === 'phone';

/** One sheet row, addressed by its authored layer NAME (C23 — never an id). */
const layerRow = (page: Page, name: string) => page.locator('.tme-layer-row', { hasText: name });

/** F52/D53: one activation path for DOM controls on every project. */
const tap = async (locator: ReturnType<Page['locator']>): Promise<void> => {
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/**
 * Wait two animation frames: a sheet open/close or a background swap changes
 * the stage synchronously, but ResizeObserver-driven paths run just before
 * the next paint (the pinned settle precedent).
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/**
 * The tme-bg <img> as the DOM holds it — src + naturalWidth, or null when
 * absent (removed, cleared, or hidden by the C32 failed flag). Plain DOM
 * read: the background is a host <img>, not a cy projection element.
 */
const readBg = (page: Page): Promise<{ src: string; naturalWidth: number } | null> =>
  page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('[data-testid="tme-bg"]');
    return img === null ? null : { src: img.src, naturalWidth: img.naturalWidth };
  });

/**
 * B-132 (D90/D93): the tme-bg img's COMPUTED opacity — the `1 − dim`
 * application the active layer's arm drives (asserted numerically: the
 * style system's float32 storage and IEEE 1−0.8=0.1999… make string-exact
 * opacity asserts wrong by construction). null when the img is absent.
 */
const readBgOpacity = (page: Page): Promise<number | null> =>
  page.evaluate(() => {
    const img = document.querySelector<HTMLElement>('[data-testid="tme-bg"]');
    if (img === null) return null;
    return Number(getComputedStyle(img).opacity);
  });

/**
 * B-132: the dim slider as the DOM holds it — value (a string, the range
 * input's own serialization) + disabled (the F07 no-background gate), or
 * null when absent. Plain DOM read of the control's state.
 */
const readDimSlider = (
  page: Page,
): Promise<{ value: string; disabled: boolean } | null> =>
  page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('[data-testid="tme-dim-slider"]');
    return input === null ? null : { value: input.value, disabled: input.disabled };
  });

/** R1: the three core header strings, verbatim. */
const expectHeaders = async (page: Page): Promise<void> => {
  for (const [testId, text] of R1_HEADERS) {
    await expect(page.getByTestId(testId)).toHaveText(text);
  }
};

interface ConsoleTally {
  warnings: string[];
  errors: string[];
  pageErrors: string[];
}

/** Housekeeping: collect console warnings/errors/pageerrors (the D81 pattern). */
const collectConsole = (page: Page): ConsoleTally => {
  const tally: ConsoleTally = { warnings: [], errors: [], pageErrors: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'warning') tally.warnings.push(msg.text());
    if (msg.type() === 'error') tally.errors.push(msg.text());
  });
  page.on('pageerror', (err) => tally.pageErrors.push(err.message));
  return tally;
};

/** The housekeeping verdict outside the deliberate C32 warn cell. */
const expectCleanConsole = async (tally: ConsoleTally): Promise<void> => {
  expect(tally.pageErrors, 'no page errors (housekeeping)').toEqual([]);
  expect(tally.errors, 'console errors clean (housekeeping)').toEqual([]);
  expect(tally.warnings, 'console warnings clean (housekeeping)').toEqual([]);
};

/** Set the URL arm on one row, touch-alone on phone (fill + tap Set). */
const setUrlOn = async (page: Page, rowName: string, url: string): Promise<void> => {
  const row = layerRow(page, rowName);
  await row.getByTestId('tme-layer-bg-url').fill(url);
  await tap(row.getByTestId('tme-layer-bg-set'));
};

/** Tap a canvas node through its rendered position (seam + canvas box). */
const tapNode = async (page: Page, id: string): Promise<void> => {
  await settle(page);
  const pos = await page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeRenderedPosition(nodeId);
    },
    id,
  );
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  if (isPhone()) await page.touchscreen.tap(box.x + pos.x, box.y + pos.y);
  else await page.mouse.click(box.x + pos.x, box.y + pos.y);
};

test.describe('per-layer backgrounds: sheet entry, store upload, degrade (PKG B-130, D84/D29/C32)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await settle(page);
  });

  test('URL arm: the img renders the data URL, the row speaks it, the dock lights (D84/D75)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await expectHeaders(page);

    // The harness patch renders first (D69) — then the URL arm replaces it
    // (one image per layer: replace = set again).
    await expect(page.getByTestId('tme-bg')).toBeVisible();
    await tap(page.getByTestId('tme-layer-manage'));
    await expect(page.getByTestId('tme-layer-manager-body')).toBeVisible();
    await setUrlOn(page, FUYUKI_ROW, SVG_URL);

    // The img renders the user's URL — src verbatim, decoded (naturalWidth).
    await expect
      .poll(() => readBg(page), { timeout: 5_000 })
      .toEqual({ src: SVG_URL, naturalWidth: 64 });

    // The row speaks the user's own words (C23 — the URL string itself)…
    await expect(layerRow(page, FUYUKI_ROW).getByTestId('tme-layer-bg-state')).toHaveText(SVG_URL);
    // …the input cleared on success (the create-input precedent)…
    await expect(layerRow(page, FUYUKI_ROW).getByTestId('tme-layer-bg-url')).toHaveValue('');
    // …and the command marked dirty (D75/F45): the save dock is the visual.
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('upload arm: store.save ⇒ the img renders the object URL; the URL replaces it (D84/D29, desktop)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the upload + replace cell is the desktop project (the packet cell list)');
    const bad = collectConsole(page);

    await tap(page.getByTestId('tme-layer-manage'));
    const row = layerRow(page, FUYUKI_ROW);
    await row.getByTestId('tme-layer-bg-file').setInputFiles(fixturePng());

    // The stored upload renders — the harness store's key IS the object URL.
    await expect
      .poll(
        async () => {
          const bg = await readBg(page);
          return bg !== null && bg.src.startsWith('blob:') && bg.naturalWidth > 0;
        },
        { timeout: 5_000 },
      )
      .toBe(true);

    // The row names the upload in words — "Uploaded image" + the stored FILE
    // name (D29/C23: the machine-local store entry, never a machine key).
    await expect(row.getByTestId('tme-layer-bg-state')).toHaveText('Uploaded image (bg-red.png)');

    // REPLACE with the URL arm — one image per layer: the URL wins.
    await setUrlOn(page, FUYUKI_ROW, SVG_URL);
    await expect.poll(() => readBg(page), { timeout: 5_000 }).toEqual({ src: SVG_URL, naturalWidth: 64 });
    await expect(row.getByTestId('tme-layer-bg-state')).toHaveText(SVG_URL);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('remove + layer scoping: no Remove without a background; a background follows its layer (D84)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the remove + scoping cell is the desktop project (the packet cell list)');
    const bad = collectConsole(page);

    await tap(page.getByTestId('tme-layer-manage'));
    const fuyuki = layerRow(page, FUYUKI_ROW);
    const misaki = layerRow(page, MISAKI_ROW);

    // Engineering: the harness patch gives Fuyuki a background (Remove
    // rendered), Misaki has none (no Remove — the nothing-to-remove case
    // never renders).
    await expect(fuyuki.getByTestId('tme-layer-bg-remove')).toBeVisible();
    await expect(misaki.getByTestId('tme-layer-bg-remove')).toHaveCount(0);

    // Remove ⇒ setLayerBackground(null): no tme-bg, the row says none.
    await fuyuki.getByTestId('tme-layer-bg-remove').click();
    await expect(page.getByTestId('tme-bg')).toHaveCount(0);
    await expect(fuyuki.getByTestId('tme-layer-bg-state')).toHaveText('No background');
    await expect(fuyuki.getByTestId('tme-layer-bg-remove')).toHaveCount(0);

    // Set a background on Fuyuki ONLY: it shows on Fuyuki, not on Misaki —
    // per-layer truth (D84), and the headers stay verbatim across switches.
    await setUrlOn(page, FUYUKI_ROW, SVG_URL);
    await expect.poll(() => readBg(page), { timeout: 5_000 }).toEqual({ src: SVG_URL, naturalWidth: 64 });
    await page.getByTestId('tme-layer-layer-misaki').click();
    await expect(page.getByTestId('tme-bg')).toHaveCount(0);
    await expectHeaders(page);
    await page.getByTestId('tme-layer-layer-fuyuki').click();
    await expect.poll(() => readBg(page), { timeout: 5_000 }).toEqual({ src: SVG_URL, naturalWidth: 64 });

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('C32 degrade: a dead URL hides the img with ONE warn; the canvas stays interactive (C32/F03, desktop)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the degrade cell is the desktop project (the packet cell list)');
    const bad = collectConsole(page);

    await tap(page.getByTestId('tme-layer-manage'));
    await setUrlOn(page, FUYUKI_ROW, DEAD_URL);

    // The load failed: the img hid (degrade to NO background) and the
    // console carries exactly ONE [TravelMapper] warn (the console
    // discipline). The browser's own resource-load note for the dead URL
    // is tolerated — nothing else, and no page error.
    await expect
      .poll(() => bad.warnings.filter((w) => w.includes('[TravelMapper] background load failed')), {
        timeout: 5_000,
      })
      .toHaveLength(1);
    await expect.poll(() => readBg(page), { timeout: 5_000 }).toBeNull();
    expect(
      bad.warnings.filter((w) => w.includes('[TravelMapper] background load failed'))[0],
      'the warn names the failed src',
    ).toContain(DEAD_URL);
    expect(bad.pageErrors, 'no page error (C32: degrade, never throw)').toEqual([]);
    // The browser's own resource-load note for the deliberate dead load is
    // tolerated (Chromium blocks port 1 as net::ERR_UNSAFE_PORT, WebKit
    // refuses it — a network-layer note, not app output); nothing else.
    expect(
      bad.errors.filter((e) => !e.startsWith('Failed to load resource')),
      'no app console errors beyond the browser resource note',
    ).toEqual([]);

    // F03: the node graph stays the interface — a tap still selects.
    await tapNode(page, EMIYA_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText('Emiya Residence');

    await expectHeaders(page);
  });

  test('refusal path: no-change never reaches the command path (D84/D75, desktop)', async ({ page }) => {
    test.skip(isPhone(), 'the refusal-path cell is the desktop project (the packet cell list)');
    const bad = collectConsole(page);

    await tap(page.getByTestId('tme-layer-manage'));
    const fuyuki = layerRow(page, FUYUKI_ROW);
    const misaki = layerRow(page, MISAKI_ROW);

    // Misaki opens with NO background: no Remove button (the packet's
    // refusal-path ruling — the nothing-to-remove case is unreachable).
    await expect(misaki.getByTestId('tme-layer-bg-remove')).toHaveCount(0);
    // Set is disabled while the trimmed input is empty (C30 honesty).
    await expect(misaki.getByTestId('tme-layer-bg-set')).toBeDisabled();

    // Set the URL arm (a real change — enabled, dock lights), then re-type
    // the SAME URL: a no-change Set is disabled (the facade's PUT would
    // dirty a truth that did not move — the UI keeps it off the path).
    await setUrlOn(page, FUYUKI_ROW, SVG_URL);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await fuyuki.getByTestId('tme-layer-bg-url').fill(SVG_URL);
    await expect(fuyuki.getByTestId('tme-layer-bg-set')).toBeDisabled();
    // A different URL re-enables Set (a real change of arm content).
    await fuyuki.getByTestId('tme-layer-bg-url').fill(DEAD_URL);
    await expect(fuyuki.getByTestId('tme-layer-bg-set')).toBeEnabled();

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('phone posture: touch-alone at 375px, no horizontal scroll, >= 44px targets (F52/D53)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the narrow posture is the phone project (D53)');
    const bad = collectConsole(page);
    await page.setViewportSize({ width: 375, height: 812 });

    // The whole URL-arm journey runs touch-alone at 375px.
    await tap(page.getByTestId('tme-layer-manage'));
    const row = layerRow(page, FUYUKI_ROW);
    const targets = [
      { id: 'tme-layer-bg-upload', name: 'Upload label' },
      { id: 'tme-layer-bg-url', name: 'URL input' },
      { id: 'tme-layer-bg-set', name: 'Set button' },
      { id: 'tme-layer-bg-remove', name: 'Remove button' },
    ];
    for (const target of targets) {
      const box = await row.getByTestId(target.id).boundingBox();
      expect(box, `${target.name} visible`).not.toBeNull();
      expect(box!.height, `${target.name} is a >= 44px tap target (F52)`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${target.name} is a >= 44px tap target (F52)`).toBeGreaterThanOrEqual(44);
    }

    await row.getByTestId('tme-layer-bg-url').fill(SVG_URL);
    await row.getByTestId('tme-layer-bg-set').tap();
    await expect
      .poll(() => readBg(page), { timeout: 5_000 })
      .toEqual({ src: SVG_URL, naturalWidth: 64 });
    await expect(row.getByTestId('tme-layer-bg-state')).toHaveText(SVG_URL);

    // …and Remove lands it back to none, touch-alone.
    await row.getByTestId('tme-layer-bg-remove').tap();
    await expect(page.getByTestId('tme-bg')).toHaveCount(0);
    await expect(row.getByTestId('tme-layer-bg-state')).toHaveText('No background');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });
});

// PKG B-132 (§5 Phase 3.5 M5 — D90/D93/F56): the per-layer background DIM on
// the editor rail. The slider edits the ACTIVE layer's arm through the
// service's one write path (facade.setLayerBackgroundDim — R2) and follows
// the layer switch (D90); the img applies it as opacity `1 − dim` toward the
// stage backdrop (presentational styling — the displayed value stays the
// core arm, R4/R1).
//
// Cited IDs:
//   D90/D93  — the dim is PER-LAYER MAP DATA, saved with the map (the save
//              dock lights per tick, D75; the D93 fresh-start rule resets it
//              when a new background source is set). Absent arm = 0.
//   F56      — background placement, calibration & dim: the dim UI lives
//              beside the layer switcher it edits.
//   F07      — a layer WITHOUT a background disables the slider (a dead
//              control is not offered; disabled, not hidden).
//   F52/D53  — >= 44px tap target swept by the standing sweep, touch-alone
//              operable at the phone viewport (the native track tap).
//
// Harness-persistence note (the reload cell's honest form): the dev harness
// has NO host persistence — a page.reload() boots a FRESH map (the draft-
// visual spec's reload cell documents the same boot semantics), so "reload
// the map and the slider + opacity come back" is proven here as the MAP-DATA
// re-read: Save, leave the layer, come back — the same R4 live-read path a
// loadMap binds. The serialize→loadMap round trip itself is unit-pinned in
// tests/unit/facade-background-presentation.spec.ts (A-019, D90).
test.describe('per-layer background dim on the rail (PKG B-132, D90/D93/F56)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await settle(page);
  });

  test('dim lifecycle: enabled → opacity → dock → Save persists → the map-data re-read brings slider + opacity back (D90/D75, desktop)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the save-persist loop is the desktop project (the packet cell list)');
    const bad = collectConsole(page);
    await expectHeaders(page);

    // Boot: Fuyuki carries the harness background (D69) — the slider is
    // ENABLED at 0 (absent arm = undimmed) and the img renders at opacity 1.
    await expect(page.getByTestId('tme-dim-slider')).toBeEnabled();
    await expect.poll(() => readDimSlider(page)).toEqual({ value: '0', disabled: false });
    await expect.poll(() => readBgOpacity(page)).toBeCloseTo(1, 5);

    // Set the dim: the opacity applies as 1 − dim (styling), the readout
    // renders the arm verbatim (R1), and the dock lights — dim is map data,
    // dirty per tick (D75).
    await page.getByTestId('tme-dim-slider').fill('0.4');
    await expect.poll(() => readBgOpacity(page)).toBeCloseTo(0.6, 5);
    await expect(page.getByTestId('tme-dim-value')).toHaveText('0.4');
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    // Save: the dock clears and the dim REMAINS — it lives in map data, not
    // in the dirty flag (the D90 saved-with-the-map premise).
    await page.getByTestId('tme-save').click();
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect(page.getByTestId('tme-dim-slider')).toHaveValue('0.4');
    await expect.poll(() => readBgOpacity(page)).toBeCloseTo(0.6, 5);

    // The map-data re-read: leave the layer and come back — the slider and
    // the opacity come back FROM THE MAP (the R4 live-read path a loadMap
    // binds; Misaki's disabled slider rides the same cell).
    await page.getByTestId('tme-layer-layer-misaki').click();
    await expect(page.getByTestId('tme-bg')).toHaveCount(0);
    await expect.poll(() => readDimSlider(page)).toEqual({ value: '0', disabled: true });
    await page.getByTestId('tme-layer-layer-fuyuki').click();
    await expect.poll(() => readDimSlider(page)).toEqual({ value: '0.4', disabled: false });
    await expect.poll(() => readBgOpacity(page)).toBeCloseTo(0.6, 5);

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('layer switch follows: per-layer dims at different levels; a layer without a background disables the slider (D90/F07, desktop)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the switch-follow matrix is the desktop project (the packet cell list)');
    const bad = collectConsole(page);
    await expectHeaders(page);

    // Misaki boots with NO background: its slider is DISABLED (the F07
    // dead-control gate — the UI does not offer a dim without an image).
    await page.getByTestId('tme-layer-layer-misaki').click();
    await expect(page.getByTestId('tme-bg')).toHaveCount(0);
    await expect.poll(() => readDimSlider(page)).toEqual({ value: '0', disabled: true });

    // Give Misaki a background (the sheet's URL arm): its slider ENABLES at
    // 0 — a fresh layer arm, not Fuyuki's.
    await tap(page.getByTestId('tme-layer-manage'));
    await setUrlOn(page, MISAKI_ROW, SVG_URL);
    await expect.poll(() => readBg(page), { timeout: 5_000 }).toEqual({ src: SVG_URL, naturalWidth: 64 });
    await expect.poll(() => readDimSlider(page)).toEqual({ value: '0', disabled: false });

    // Dim Misaki 0.8, Fuyuki 0.4 — then follow BOTH switches: the slider and
    // the opacity always describe the ACTIVE layer (D90), per-layer values
    // never bleed.
    await page.getByTestId('tme-dim-slider').fill('0.8');
    await expect.poll(() => readBgOpacity(page)).toBeCloseTo(0.2, 5);
    await expect(page.getByTestId('tme-dim-value')).toHaveText('0.8');
    await page.getByTestId('tme-layer-layer-fuyuki').click();
    await expect.poll(() => readDimSlider(page)).toEqual({ value: '0', disabled: false });
    await page.getByTestId('tme-dim-slider').fill('0.4');
    await expect.poll(() => readBgOpacity(page)).toBeCloseTo(0.6, 5);
    await page.getByTestId('tme-layer-layer-misaki').click();
    await expect.poll(() => readDimSlider(page)).toEqual({ value: '0.8', disabled: false });
    await expect.poll(() => readBgOpacity(page)).toBeCloseTo(0.2, 5);
    await page.getByTestId('tme-layer-layer-fuyuki').click();
    await expect.poll(() => readDimSlider(page)).toEqual({ value: '0.4', disabled: false });
    await expect.poll(() => readBgOpacity(page)).toBeCloseTo(0.6, 5);

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('D93 fresh-start: a new background source resets the dim through the UI (D93/F56, desktop)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the fresh-start cell is the desktop project (the packet cell list)');
    const bad = collectConsole(page);
    await expectHeaders(page);

    // Dim Fuyuki's harness background first — the arm is set, the img dimmed.
    await page.getByTestId('tme-dim-slider').fill('0.4');
    await expect.poll(() => readBgOpacity(page)).toBeCloseTo(0.6, 5);

    // The sheet's REPLACE path: a NEW background source on the same layer
    // (the harness assetId arm → the URL arm; one image per layer).
    await tap(page.getByTestId('tme-layer-manage'));
    await setUrlOn(page, FUYUKI_ROW, SVG_URL);
    await expect.poll(() => readBg(page), { timeout: 5_000 }).toEqual({ src: SVG_URL, naturalWidth: 64 });

    // The D93 reset, pinned through the UI: the slider returns to 0 (an old
    // image's tuning must not leak) and STAYS ENABLED (the new background
    // exists); the img is undimmed again; the set is also dirty (D75).
    await expect.poll(() => readDimSlider(page)).toEqual({ value: '0', disabled: false });
    await expect(page.getByTestId('tme-dim-value')).toHaveText('0');
    await expect.poll(() => readBgOpacity(page)).toBeCloseTo(1, 5);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('phone: the dim slider is operable touch-alone; >= 44px target; the dock lights (F52/D53/D75)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the touch-alone pass is the phone project (D53)');
    const bad = collectConsole(page);
    await page.setViewportSize({ width: 375, height: 812 });

    // Fuyuki boots with the harness background — the slider is live and a
    // swept-size >= 44x44 tap target (the standing sweep asserts it too).
    const slider = page.getByTestId('tme-dim-slider');
    await expect(slider).toBeEnabled();
    const box = await slider.boundingBox();
    expect(box, 'the slider is visible at 375px').not.toBeNull();
    expect(box!.height, 'slider height >= 44px (F52)').toBeGreaterThanOrEqual(44);
    expect(box!.width, 'slider width >= 44px (F52)').toBeGreaterThanOrEqual(44);

    // Touch-alone: a native tap on the track's MIDPOINT sets the dim to 0.5
    // — the value↔position mapping is the control's own (test-side fraction
    // math only: 0.5 is on the 0.05 step grid from anywhere near center);
    // the opacity applies and the dock lights (D75).
    await slider.tap();
    await expect.poll(() => readDimSlider(page)).toEqual({ value: '0.5', disabled: false });
    await expect(page.getByTestId('tme-dim-value')).toHaveText('0.5');
    await expect.poll(() => readBgOpacity(page)).toBeCloseTo(0.5, 5);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    // Back down: a tap near the track's LEFT edge lands below the first step
    // — the dim returns to 0 and the img undims. The box is re-read BEFORE
    // the tap: the first tap opened the save dock, the rail re-flowed and
    // the control moved (the resize-pin gotcha in miniature — aim only at a
    // fresh box; pinned live against WebKit's track mapping).
    const left = await slider.boundingBox();
    await page.touchscreen.tap(left!.x + left!.width * 0.02, left!.y + left!.height / 2);
    await expect.poll(() => readDimSlider(page)).toEqual({ value: '0', disabled: false });
    await expect.poll(() => readBgOpacity(page)).toBeCloseTo(1, 5);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });
});

// PKG B-134 (§5 Phase 3.5 M5 — D92/D93): the background sync render — the
// tme-bg image joins the viewport transform. The placement
// (`LayerData.backgroundPlacement`, A-019: x/y = the image's CENTER in model
// coordinates, scale = MODEL UNITS PER IMAGE PIXEL) positions it in the
// graph's plane; it pans and zooms 1:1 with cy, always. The DEFAULT
// placement — an aspect-locked CONTAIN fit of the natural image size to the
// active layer's node bounding box — is computed ONCE per background-set /
// loadMap / layer-switch (never off a graph edit); it persists ONLY at the
// background-set authoring moment (ONE facade write, dirty — part of the
// authoring action, D75); at loadMap/layer-switch it is COMPUTED AND HELD in
// app state and NEVER auto-persisted (an unedited map never opens dirty).
// Degenerate extents (zero-area node bbox) fall back to the D84
// stage-contain shape until B-135's calibrate writes an arm. The C32
// failed-load degrade stands; D91 zero-motion binds the background too (a
// background set/transform never moves the viewport).
//
// Cited IDs:
//   D92      — the model-space transform (1:1 pan/zoom), the computed-once
//              default, the degenerate fallback, edits-never-move-it.
//   D93/A-019— the placement arm's shape and fresh-start reset; the arm
//              renders verbatim whenever present.
//   D75/F45  — the ONE dirtying write per background-set (the authoring
//              moment); loadMap/layer-switch compute-and-hold only.
//   D91      — zero-motion: the background appearing/changing/transforming
//              never calls fitView, never notifies resize, never moves
//              zoom/pan.
//   C32      — the dead-src degrade keeps working with the transform live.
//   D53/F52  — every interaction family at BOTH projects: read-only
//              placement cells run on both; the touch gesture family runs
//              on the phone project through the in-test Chromium twin (the
//              interactions.e2e-spec precedent — CDP touch needs Chromium).
//
// Expected-value discipline (R1 spirit): every expected number is computed
// IN-PAGE/test-side from the ENGINE's own reads (the hook's zoom/pan, the
// img's natural size) over FX1's authored positions — the spec hardcodes
// only the fixture facts, never a measured pixel.
test.describe('background sync render (PKG B-134, D92/D93/D75/D91)', () => {
  // FX1 facts (data/worlds/fuyuki.ts): the 13 POSITIONED Fuyuki leaves. The
  // two district containers carry no authored position (labels, not
  // extents); Misaki holds exactly ONE positioned node — a zero-area bbox,
  // the degenerate case of the fallback cell.
  const FUYUKI_POSITIONS: ReadonlyArray<readonly [number, number]> = [
    [100, 250], // emiya-residence
    [190, 300], // shopping-district
    [170, 160], // homurahara-academy
    [60, 210], // matou-residence
    [95, 125], // tohsaka-residence
    [150, 470], // ryuudou-temple
    [30, 360], // outskirts
    [400, 285], // fuyuki-bridge
    [560, 260], // fuyuki-station
    [595, 420], // harbor
    [520, 85], // kotomine-church
    [625, 140], // ghost-house
    [-380, 120], // einzbern-castle
  ];
  const FUYUKI_CENTER = (): { x: number; y: number } => ({
    x: (Math.min(...FUYUKI_POSITIONS.map((p) => p[0])) + Math.max(...FUYUKI_POSITIONS.map((p) => p[0]))) / 2,
    y: (Math.min(...FUYUKI_POSITIONS.map((p) => p[1])) + Math.max(...FUYUKI_POSITIONS.map((p) => p[1]))) / 2,
  });
  const FUYUKI_W = (): number =>
    Math.max(...FUYUKI_POSITIONS.map((p) => p[0])) - Math.min(...FUYUKI_POSITIONS.map((p) => p[0]));
  const FUYUKI_H = (): number =>
    Math.max(...FUYUKI_POSITIONS.map((p) => p[1])) - Math.min(...FUYUKI_POSITIONS.map((p) => p[1]));
  /** The D92 default scale for a natural image size: the aspect-locked contain fit. */
  const defaultScaleFor = (nw: number, nh: number): number =>
    Math.min(FUYUKI_W() / nw, FUYUKI_H() / nh);

  /**
   * The tme-bg render read — EVERYTHING the placement math consumes, read in
   * ONE evaluate so the facts are same-tick consistent: the img's laid-out
   * box, its inline style box (placed vs fallback discriminator), its
   * natural size, the canvas host box, and the engine's own zoom/pan.
   */
  interface BgRenderRead {
    box: { left: number; top: number; width: number; height: number } | null;
    inline: { left: string; top: string; width: string; height: string } | null;
    natural: { w: number; h: number } | null;
    canvas: { x: number; y: number; width: number; height: number };
    zoom: number;
    pan: { x: number; y: number };
  }

  const readBgRender = async (page: Page): Promise<BgRenderRead> =>
    page.evaluate((): BgRenderRead => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      const canvas = document.querySelector<HTMLElement>('[data-testid="tme-canvas"]');
      if (canvas === null) throw new Error('canvas host missing');
      const cb = canvas.getBoundingClientRect();
      const img = document.querySelector<HTMLImageElement>('[data-testid="tme-bg"]');
      return {
        box:
          img === null
            ? null
            : (({ left, top, width, height }) => ({ left, top, width, height }))(img.getBoundingClientRect()),
        inline:
          img === null
            ? null
            : { left: img.style.left, top: img.style.top, width: img.style.width, height: img.style.height },
        natural: img !== null && img.naturalWidth > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null,
        canvas: { x: cb.left, y: cb.top, width: cb.width, height: cb.height },
        zoom: hook.zoom(),
        pan: hook.pan(),
      };
    });

  /**
   * The placement mapping assert (the tapModelPoint precedent inverted):
   * model center = (img box center − canvasBox.topLeft − pan) / zoom, the
   * implied model-units-per-image-px = (box size / zoom) / natural.
   * Tolerances absorb layout quantization (LayoutUnit 1/64 px) divided by
   * the fit zoom — centers at precision 0 (±0.5 model units), scale at
   * precision 2.
   */
  const expectPlacement = (read: BgRenderRead, label: string): void => {
    if (read.box === null || read.natural === null) throw new Error(`${label}: img/natural not rendered`);
    const cx = (read.box.left + read.box.width / 2 - read.canvas.x - read.pan.x) / read.zoom;
    const cy = (read.box.top + read.box.height / 2 - read.canvas.y - read.pan.y) / read.zoom;
    const sx = read.box.width / read.zoom / read.natural.w;
    const sy = read.box.height / read.zoom / read.natural.h;
    const expectedScale = defaultScaleFor(read.natural.w, read.natural.h);
    expect(cx, `${label}: the img center sits at the node-bbox center (model x)`).toBeCloseTo(FUYUKI_CENTER().x, 0);
    expect(cy, `${label}: the img center sits at the node-bbox center (model y)`).toBeCloseTo(FUYUKI_CENTER().y, 0);
    expect(sx, `${label}: scale = the aspect-locked contain fit (x axis)`).toBeCloseTo(expectedScale, 2);
    expect(
      sy,
      `${label}: scale = the aspect-locked contain fit (y axis — one scale, no rotation)`,
    ).toBeCloseTo(expectedScale, 2);
  };

  /** Placed-and-decoded: the img has a bitmap AND an inline transform box. */
  const bgPlaced = async (page: Page): Promise<boolean> => {
    const read = await readBgRender(page);
    return read.natural !== null && read.inline !== null && read.inline.width !== '';
  };

  /**
   * Placed for a KNOWN natural pair — the gate for a src SWAP on a SURVIVING
   * img element (the authoring moment): the poll must not pass on the old
   * bitmap/box (inline stays non-empty through the swap) nor on a torn
   * intrinsic pair (the B-134 finding — a src swap updates naturalWidth and
   * naturalHeight in separate decoder steps, briefly e.g. 64×96). Passes
   * only when the pair settled to (nw, nh) AND the rendered box is
   * aspect-locked to it (the settled box the load event's apply wrote).
   */
  const bgPlacedFor = async (page: Page, nw: number, nh: number): Promise<boolean> => {
    const read = await readBgRender(page);
    if (read.natural === null || read.natural.w !== nw || read.natural.h !== nh) return false;
    if (read.inline === null || read.inline.width === '' || read.box === null) return false;
    const sx = read.box.width / read.zoom / nw;
    const sy = read.box.height / read.zoom / nh;
    return Math.abs(sx - sy) < 1e-6;
  };

  /** Fallback-and-decoded: the img has a bitmap and NO inline box (the D84 shape). */
  const bgFallback = async (page: Page): Promise<boolean> => {
    const read = await readBgRender(page);
    return read.natural !== null && read.inline !== null && read.inline.width === '';
  };

  /**
   * The B-133c coverage discipline (the waypoints clearPinchCenter local
   * shape): a live-scanned clear-canvas point — elementFromPoint proves the
   * aim reaches the canvas (the D91 bands and the floating panels reject
   * it), and a 40px node-corridor keeps it off every rendered node. With
   * minSpread > 0 the point doubles as a pinch center with room for both
   * fingers (spreadMax = the largest two-sided spread that stays on-canvas).
   */
  const clearCanvasPoint = async (page: Page, minSpread = 0): Promise<{ at: Point; spreadMax: number }> => {
    await settle(page);
    const found = await page.evaluate((minSpreadArg): { at: Point; spreadMax: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      const cb = document.querySelector('[data-testid="tme-canvas"]')!.getBoundingClientRect();
      const ids = [
        'emiya-residence', 'shopping-district', 'homurahara-academy', 'matou-residence',
        'tohsaka-residence', 'ryuudou-temple', 'outskirts', 'fuyuki-bridge', 'fuyuki-station',
        'harbor', 'kotomine-church', 'ghost-house', 'einzbern-castle',
      ];
      const nodePts = ids
        .map((id) => hook.nodeRenderedPosition(id))
        .filter((p): p is { x: number; y: number } => p !== null)
        .map((p) => ({ x: p.x + cb.left, y: p.y + cb.top }));
      for (let y = cb.top + 40; y < cb.top + cb.height - 60; y += 10) {
        for (const fx of [0.5, 0.35, 0.65, 0.2, 0.8, 0.09, 0.91]) {
          const x = cb.left + cb.width * fx;
          const el = document.elementFromPoint(x, y);
          if (el === null || el.closest('.tme-canvas') === null) continue;
          if (nodePts.some((p) => Math.hypot(p.x - x, p.y - y) < 40)) continue;
          const spreadMax = Math.min(120, x - cb.left - 12, cb.left + cb.width - x - 12);
          if (spreadMax >= minSpreadArg) return { at: { x, y }, spreadMax };
        }
      }
      return null;
    }, minSpread);
    if (found === null) throw new Error(`clearCanvasPoint: no clear canvas corridor (minSpread=${minSpread})`);
    return found;
  };

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * The interactions.e2e-spec twin, verbatim in shape: the phone project is
   * WebKit and a CDP session exists only in Chromium, so the
   * input-pipeline gestures run on an in-test Chromium page with the SAME
   * iPhone 13 emulation.
   */
  const withPhoneChromiumPage = async (run: (page: Page) => Promise<void>): Promise<void> => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await context.newPage();
    try {
      await page.goto('/');
      await expect(page.getByTestId('tme-canvas')).toBeVisible();
      await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true); // the boot bg placed
      await run(page);
    } finally {
      await browser.close();
    }
  };

  /** CDP one-finger drag (the interactions precedent). */
  const cdpTouchDrag = async (cdp: CDPSession, from: Point, dx: number, dy: number): Promise<void> => {
    const steps = 6;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    await sleep(40);
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps }],
      });
      await sleep(25);
    }
    // The R23 gotcha: hold before touchEnd or Chromium drops the NEXT tap's
    // click — these cells tap nothing after, the hold is pure hygiene.
    await sleep(200);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  /** CDP two-finger pinch (the interactions precedent): spread `from` → `to`. */
  const cdpPinch = async (cdp: CDPSession, center: Point, from: number, to: number): Promise<void> => {
    const steps = 6;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: center.x - from, y: center.y },
        { x: center.x + from, y: center.y },
      ],
    });
    await sleep(60);
    for (let i = 1; i <= steps; i++) {
      const spread = from + ((to - from) * i) / steps;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: center.x - spread, y: center.y },
          { x: center.x + spread, y: center.y },
        ],
      });
      await sleep(30);
    }
    await sleep(200); // the same dropped-input hygiene
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await settle(page);
  });

  test('D92 default: the img fits the node bbox aspect-locked, computed once at load, never persisted (D92/D93/D75)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await expectHeaders(page);

    // The harness boots Fuyuki with its background (D69) and NO placement
    // arm — the computed default applies (the inline transform is present).
    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    expectPlacement(await readBgRender(page), 'boot default');

    // D75 (adjudication 1): the loadMap compute is HELD, never written — an
    // unedited map opens CLEAN (the dock stays dark).
    await expect(page.getByTestId('tme-save-dock')).toHaveCount(0);

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('D92 transform: the img pans and zooms 1:1 with the viewport (desktop wheel + drag)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the touch twin cell carries the phone pass of this family (D53)');
    const bad = collectConsole(page);
    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);

    // WHEEL ZOOM about a clear point: the rendered width tracks the zoom
    // ratio exactly (the anchor-dependent left/top shift is the SAME 1:1
    // law — width is its anchor-free proof).
    const aim = await clearCanvasPoint(page);
    await page.mouse.move(aim.at.x, aim.at.y);
    const before = await readBgRender(page);
    await page.mouse.wheel(0, -240);
    await settle(page);
    const zoomed = await readBgRender(page);
    expect(zoomed.zoom, 'the wheel zoomed the viewport').toBeGreaterThan(before.zoom);
    expect(
      zoomed.box!.width / before.box!.width,
      'the img width scales 1:1 with the zoom (D92)',
    ).toBeCloseTo(zoomed.zoom / before.zoom, 2);

    // MOUSE DRAG pan: a pure pan (zoom byte-unchanged) shifts the img by
    // exactly the pan delta, width untouched.
    const start = await clearCanvasPoint(page);
    await page.mouse.move(start.at.x, start.at.y);
    await page.mouse.down();
    await page.mouse.move(start.at.x + 130, start.at.y - 70, { steps: 8 });
    await page.mouse.up();
    await settle(page);
    const panned = await readBgRender(page);
    expect(panned.zoom, 'a pan never changes zoom').toBe(zoomed.zoom);
    expect(panned.box!.left - zoomed.box!.left, 'the img left tracks the pan delta (D92)').toBeCloseTo(
      panned.pan.x - zoomed.pan.x,
      0,
    );
    expect(panned.box!.top - zoomed.box!.top, 'the img top tracks the pan delta (D92)').toBeCloseTo(
      panned.pan.y - zoomed.pan.y,
      0,
    );
    expect(panned.box!.width, 'a pan never rescales the img').toBeCloseTo(zoomed.box!.width, 2);

    await expectCleanConsole(bad);
  });

  test('D92 transform: the touch twin — drag pans and pinch zooms the img 1:1 (D53/F52)', async () => {
    test.skip(!isPhone(), 'touch gestures need the in-test Chromium twin (the interactions precedent)');
    await withPhoneChromiumPage(async (page) => {
      const bad = collectConsole(page);

      // TOUCH-DRAG pan (one finger): the img tracks the pan delta 1:1.
      const start = await clearCanvasPoint(page);
      const cdp = await page.context().newCDPSession(page);
      const before = await readBgRender(page);
      await cdpTouchDrag(cdp, start.at, 100, 50);
      await settle(page);
      const after = await readBgRender(page);
      expect(after.zoom, 'a drag pan never changes zoom').toBe(before.zoom);
      expect(after.box!.left - before.box!.left, 'the img left tracks the touch-pan delta (D92)').toBeCloseTo(
        after.pan.x - before.pan.x,
        0,
      );
      expect(after.box!.top - before.box!.top, 'the img top tracks the touch-pan delta (D92)').toBeCloseTo(
        after.pan.y - before.pan.y,
        0,
      );

      // PINCH zoom (two fingers): the rendered width tracks the zoom ratio.
      const { at, spreadMax } = await clearCanvasPoint(page, 40);
      const pb = await readBgRender(page);
      await cdpPinch(cdp, at, spreadMax * 0.5, spreadMax);
      await settle(page);
      const pa = await readBgRender(page);
      expect(pa.zoom, 'the pinch zoomed the viewport').toBeGreaterThan(pb.zoom);
      expect(
        pa.box!.width / pb.box!.width,
        'the img width scales 1:1 with the pinch zoom (D92)',
      ).toBeCloseTo(pa.zoom / pb.zoom, 2);

      await expectCleanConsole(bad);
    });
  });

  test('D93 arm round-trip: the authoring moment persists once; save + leave/return renders it verbatim; zero-motion holds (D92/D93/D75/D91)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await expectHeaders(page);

    // Boot: the default held, the dock dark, the viewport noted.
    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    const boot = await readBgRender(page);

    // The authoring moment: a NEW source on the ACTIVE layer. The img load
    // resolves the natural size, ONE setLayerBackgroundPlacement writes the
    // computed default (dirty — D75), and (D91) the background appearing/
    // changing/transforming never moves the viewport.
    await tap(page.getByTestId('tme-layer-manage'));
    await expect(page.getByTestId('tme-layer-manager-body')).toBeVisible();
    await setUrlOn(page, FUYUKI_ROW, SVG_URL);
    // The swap gate: the SURVIVING img element's naturals settle to the
    // SVG's 64×64 and the box re-locks to their aspect (see bgPlacedFor).
    await expect.poll(() => bgPlacedFor(page, 64, 64), { timeout: 5_000 }).toBe(true);
    const authored = await readBgRender(page);
    expect(authored.zoom, 'D91 zero-motion: the set + persist never zoom').toBe(boot.zoom);
    expect(authored.pan, 'D91 zero-motion: the set + persist never pan').toEqual(boot.pan);
    expectPlacement(authored, 'authored default (the persisted arm)');

    // Save: the dock clears; the arm survives in map data.
    await tap(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toHaveCount(0);

    // The loadMap/layer-switch read path a persisted map binds: leave the
    // layer and come back — the ARM renders verbatim (same center, same
    // scale), and the switch dirties nothing.
    await page.getByTestId('tme-layer-layer-misaki').click();
    await expect(page.getByTestId('tme-bg')).toHaveCount(0);
    await page.getByTestId('tme-layer-layer-fuyuki').click();
    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    expectPlacement(await readBgRender(page), 'the arm re-read after the switch');
    await expect(page.getByTestId('tme-save-dock')).toHaveCount(0);

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('D92 layer switch: the default recomputes per layer from app state, never persists (D92/D75)', async ({
    page,
  }) => {
    const bad = collectConsole(page);

    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    expectPlacement(await readBgRender(page), 'boot default');

    // Misaki carries NO background: the img leaves the stage entirely.
    await page.getByTestId('tme-layer-layer-misaki').click();
    await expect(page.getByTestId('tme-bg')).toHaveCount(0);

    // Back: the default re-applies from the recomputed hold — identical
    // placement, and still nothing persisted (D75).
    await page.getByTestId('tme-layer-layer-fuyuki').click();
    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    expectPlacement(await readBgRender(page), 'the recomputed default after the round trip');
    await expect(page.getByTestId('tme-save-dock')).toHaveCount(0);

    await expectCleanConsole(bad);
  });

  test('D92 degenerate extents: a single-node layer falls back to the stage-contain shape (D92)', async ({
    page,
  }) => {
    const bad = collectConsole(page);

    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);

    // Misaki holds exactly ONE positioned node (FX1) — its node bbox has
    // zero area, so the fit-to-graph is undefined. Give it a background and
    // switch to it: the default is undefined → the D84 stage-contain
    // fallback renders (no inline box) until B-135's calibrate writes an arm.
    await tap(page.getByTestId('tme-layer-manage'));
    await expect(page.getByTestId('tme-layer-manager-body')).toBeVisible();
    await setUrlOn(page, MISAKI_ROW, SVG_URL);
    await page.getByTestId('tme-layer-layer-misaki').click();
    await expect.poll(() => bgFallback(page), { timeout: 5_000 }).toBe(true);

    // The fallback IS the old contain shape: the img box equals the canvas
    // box (inset:0), no inline transform anywhere.
    const read = await readBgRender(page);
    expect(read.inline!.width, 'no inline transform in the fallback').toBe('');
    expect(read.box!.left, 'fallback: the img spans the canvas (left)').toBeCloseTo(read.canvas.x, 0);
    expect(read.box!.top, 'fallback: the img spans the canvas (top)').toBeCloseTo(read.canvas.y, 0);
    expect(read.box!.width, 'fallback: the img spans the canvas (width)').toBeCloseTo(read.canvas.width, 0);
    expect(read.box!.height, 'fallback: the img spans the canvas (height)').toBeCloseTo(read.canvas.height, 0);

    await expectCleanConsole(bad);
  });

  test('C32 degrade with the transform live: a dead src hides the img, nothing throws (C32/D92, desktop)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the dead-URL console tolerances are the B-130 degrade cell\u2019s desktop tuning');
    const bad = collectConsole(page);

    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);

    // The placed default is live; REPLACE it with a dead URL (the harness
    // assetId arm → a hostile src). The load degrades to NO background —
    // the img hides, ONE warn, and the transform machinery never throws.
    await tap(page.getByTestId('tme-layer-manage'));
    await setUrlOn(page, FUYUKI_ROW, DEAD_URL);
    await expect
      .poll(() => bad.warnings.filter((w) => w.includes('[TravelMapper] background load failed')), {
        timeout: 5_000,
      })
      .toHaveLength(1);
    await expect.poll(() => readBg(page), { timeout: 5_000 }).toBeNull();
    expect(bad.pageErrors, 'no page error (C32: degrade, never throw)').toEqual([]);
    expect(
      bad.errors.filter((e) => !e.startsWith('Failed to load resource')),
      'no app console errors beyond the browser resource note',
    ).toEqual([]);

    // The transform stream stays healthy over the hidden img (the @if
    // unmounted it — the callback skips) and the graph stays the interface.
    const aim = await clearCanvasPoint(page);
    await page.mouse.move(aim.at.x, aim.at.y);
    await page.mouse.wheel(0, -240);
    await settle(page);
    await tapNode(page, EMIYA_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    expect(bad.pageErrors, 'still no page error after zoom + tap (C32/F03)').toEqual([]);

    await expectHeaders(page);
  });
});
