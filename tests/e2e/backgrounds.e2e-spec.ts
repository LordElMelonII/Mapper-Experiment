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
import { expect, test, type Page } from '@playwright/test';

interface TmeE2EHook {
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
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
