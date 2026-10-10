// tests/e2e/background-calibrate.e2e-spec.ts — PKG B-135 (§5 Phase 3.5 M5):
// the D93 calibrate MODE — the explicit authoring surface for
// LayerData.backgroundPlacement. The manager sheet's background section
// grows the Calibrate entry (F07: disabled — never hidden — without a
// present, loaded, non-failed background on the ACTIVE layer); entry turns
// the stage into the mode (a stage-top band: badge, the aspect-locked scale
// stepper, Fit to graph, Done/Cancel) and owns every canvas gesture. A drag
// translates the placement CENTER in model space (screen delta / live zoom);
// a tap selects and places nothing; the scale stepper multiplies the ONE
// scale per committed tap; Fit to graph writes B-134's single-sourced
// defaultPlacementFor result. EVERY committed gesture (drag end, scale
// step, fit tap) is ONE facade.setLayerBackgroundPlacement write — dirty
// (D75, the dock lights), re-read through editorRevision (C24). D91
// zero-motion: the camera never moves (the entry disables user pan/zoom and
// nothing here fits). D93: calibration NEVER touches node coordinates,
// distances or costs — pinned here as a byte-equal assertion over every
// node's model position, not a comment. The D93 fresh-start: a new
// background source resets the placement and ends the session.
//
// Cited IDs:
//   D93      — the calibrate mode is the ONLY placement writer; the lock is
//              calibrate being off; calibration never touches node
//              coordinates; the fresh-start reset (a new source, a new
//              session); nodes are read-only while calibrating.
//   D92      — Fit to graph writes the ONE shared default derivation (the
//              hook's defaultPlacement seam reads the same
//              defaultPlacementFor body the write used); the degenerate
//              fallback stands until a calibrate write replaces it.
//   D75/F45  — each committed gesture dirties: the save dock lights; Save
//              clears it and the tuned placement lives in map data (the
//              leave/return re-read renders it verbatim).
//   C24      — every read re-reads through editorRevision (the arm, the
//              dock, the gates, the readout).
//   D91      — zero-motion: enter/gestures/exit never fit, never resize,
//              never pan — zoom/pan pinned byte-equal across the session.
//   F07      — the dead-control gates, disabled not hidden: no Calibrate
//              without a (loaded, non-failed) background; Fit disabled on
//              degenerate extents; the scale readout hidden there.
//   F52/D53  — every control >= 44px, the whole journey touch-alone; the
//              drag family runs on the phone project through the in-test
//              Chromium twin (the interactions.e2e-spec precedent — CDP
//              touch needs Chromium), with the 200 ms hold before touchEnd
//              (the dropped-tap gotcha).
//   C23      — plain words: "Calibrate", "Fit to graph", "Done", "Cancel".
//
// Expected-value discipline (R1 spirit): every expected number is computed
// test-side from FX1's authored positions and the ENGINE's own reads (the
// hook's zoom/pan, the seam placements) — the spec hardcodes only the
// fixture facts, never a measured pixel. Node coordinates are pinned
// BYTE-EQUAL (JSON.stringify) across calibrate sessions — "never touches
// node coordinates" is an assertion.
import { chromium, devices, expect, test, type CDPSession, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeModelPosition(id: string): { x: number; y: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
  /** B-135: whether the calibrate mode is currently on. */
  calibrateMode(): boolean;
  /** B-135: the ACTIVE layer's PERSISTED placement arm, or null. */
  backgroundPlacement(): { x: number; y: number; scale: number } | null;
  /** B-135/D92: the ACTIVE layer's default-fit placement (the ONE shared
   *  derivation), or null when degenerate. */
  defaultPlacement(): { x: number; y: number; scale: number } | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

/** A deterministic data:image/svg+xml URL — no network, decodes in both engines. */
const SVG_URL =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%2764%27%20height%3D%2764%27%3E%3Crect%20width%3D%2764%27%20height%3D%2764%27%20fill%3D%27%23ff8800%27%2F%3E%3C%2Fsvg%3E";

/** Connection-refused dead URL — the img error event, no wait beyond it. */
const DEAD_URL = 'http://127.0.0.1:1/dead.png';

const FUYUKI_ROW = 'Fuyuki City';
const MISAKI_ROW = 'Misaki Town';
const MISAKI_ID = 'misaki-town';

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

// B-D1 re-baseline (PROPOSAL-D §2.1 + B-D1): at >=1024 the rail's per-layer
// nav and its Manage entry are shell-gated OFF — the layer switch rides the
// LAYER MANAGER's row-name button (the switch surface, layer-manager.component)
// and the manager opens through the belt's Layers tool (tme-layers-tool);
// below 1024 the rail surfaces stand byte-identical (R29 ruling 1).
// Presence-probed against the live DOM — the regime truth, never a mirrored
// breakpoint. The manager-state-aware switch leaves an ALREADY-OPEN sheet
// open (the pre-shell rail switch never touched it). The phone-arm code
// paths (the in-test Chromium twin) are untouched — sub-1024 keeps the rail.

/** The manager's open-state probe (the enterCalibrateViaSheet idiom). */
const managerOpen = async (page: Page): Promise<boolean> => {
  const body = page.getByTestId('tme-layer-manager-body');
  return (await body.count()) > 0 && (await body.isVisible());
};

/** Open the layer manager through the live regime's entry (B-D1). */
const openManager = async (page: Page): Promise<void> => {
  if (await managerOpen(page)) return;
  const beltTool = page.getByTestId('tme-layers-tool');
  if (await beltTool.count()) await tap(beltTool);
  else await tap(page.getByTestId('tme-layer-manage'));
  await expect(page.getByTestId('tme-layer-manager-body')).toBeVisible();
};

/** The rail's per-layer button ids by authored layer name (FX1). */
const RAIL_LAYER_BUTTON: Readonly<Record<string, string>> = {
  'Fuyuki City': 'tme-layer-layer-fuyuki',
  'Misaki Town': 'tme-layer-layer-misaki',
};

/** Switch layers in the live regime (B-D1): the rail's per-layer button
 *  below 1024 (the original .click() input path, both projects byte-equal),
 *  the manager's row-name button at >=1024 (an already-open manager stays
 *  open; one opened for the switch closes after it — the pre-shell chrome
 *  state; selectLayer's explicit fit runs either way, D85/D81). */
const switchLayer = async (page: Page, name: string): Promise<void> => {
  const rail = page.getByTestId(RAIL_LAYER_BUTTON[name] ?? '');
  if (await rail.count()) {
    await rail.click();
    return;
  }
  const wasOpen = await managerOpen(page);
  if (!wasOpen) await openManager(page);
  await layerRow(page, name).getByTestId('tme-layer-name').click();
  if (!wasOpen) await tap(page.getByTestId('tme-layer-manager-close'));
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

/**
 * The twin cell's verdict: the same housekeeping, tolerating Chromium's own
 * synthetic-input note ("Ignored attempt to cancel a touchend event with
 * cancelable=false…") — the browser raises it inside its own event dispatch
 * when a listener calls preventDefault on a CDP-INJECTED touchend over the
 * touch-action:none canvas (cytoscape does, for every injected drag; the
 * interactions.e2e-spec precedent simply carries no console housekeeping).
 * Browser input-layer noise, not app output — the same tolerated-note class
 * as the dead-URL cell's `Failed to load resource` (B-130).
 */
const expectCleanConsoleToleratingSyntheticTouch = async (tally: ConsoleTally): Promise<void> => {
  expect(tally.pageErrors, 'no page errors (housekeeping)').toEqual([]);
  expect(
    tally.errors.filter((e) => !e.includes('Ignored attempt to cancel a touchend event')),
    'no app console errors beyond the synthetic-input note',
  ).toEqual([]);
  expect(tally.warnings, 'console warnings clean (housekeeping)').toEqual([]);
};

/**
 * B-149 (REPAIRS §R9 item 5) re-baseline helper: the background sub-form
 * (Upload / URL / Set / Remove / Calibrate) renders behind a collapsed-by-
 * DEFAULT expander (the R-5 idiom) — a cell driving one of its fields
 * expands the row's section first. IDEMPOTENT (the R-5 expandSection law,
 * the portals wireCastleTo precedent): an already-expanded row is never
 * folded — tap only when collapsed. Each caller cites this helper (R23: a
 * re-baseline is named in-file, never silent).
 */
const expandBgForm = async (page: Page, rowName: string): Promise<void> => {
  const toggle = layerRow(page, rowName).getByTestId('tme-layer-bg-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await tap(toggle);
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
};

/** Set the URL arm on one row, touch-alone on phone (fill + tap Set). */
const setUrlOn = async (page: Page, rowName: string, url: string): Promise<void> => {
  const row = layerRow(page, rowName);
  await expandBgForm(page, rowName); // B-149 (R9 item 5): expand-first re-baseline
  await row.getByTestId('tme-layer-bg-url').fill(url);
  await tap(row.getByTestId('tme-layer-bg-set'));
};

/** Enter calibrate from the manager sheet (opens the sheet only if closed —
 *  Manage is a TOGGLE; the fresh-start and degenerate cells reuse an
 *  already-open sheet), then taps the row's entry. B-149 (R9 item 5): the
 *  entry hides behind the row's collapsed expander — expand first. */
const enterCalibrateViaSheet = async (page: Page, rowName: string): Promise<void> => {
  const body = page.getByTestId('tme-layer-manager-body');
  const open = await managerOpen(page); // B-D1 (PROPOSAL-D §2.1 + B-D1): the regime probe
  if (!open) await openManager(page); // B-D1: the regime-aware entry
  await expect(body).toBeVisible();
  await expandBgForm(page, rowName); // B-149 (R9 item 5): expand-first re-baseline
  await tap(layerRow(page, rowName).getByTestId('tme-layer-bg-calibrate'));
  await expect(page.getByTestId('tme-calibrate')).toBeVisible();
};

/** The engine's seam reads, in one evaluate (same-tick consistent). */
const readSeams = (page: Page): Promise<{
  calibrate: boolean;
  arm: { x: number; y: number; scale: number } | null;
  def: { x: number; y: number; scale: number } | null;
  zoom: number;
  pan: { x: number; y: number };
}> =>
  page.evaluate(() => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return {
      calibrate: hook.calibrateMode(),
      arm: hook.backgroundPlacement(),
      def: hook.defaultPlacement(),
      zoom: hook.zoom(),
      pan: hook.pan(),
    };
  });

/**
 * The tme-bg render read — the img's laid-out box, its inline style box
 * (placed vs fallback discriminator), its natural size, the canvas host box,
 * and the engine's own zoom/pan, in ONE evaluate (the B-134 precedent).
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

/** Placed-and-decoded: the img has a bitmap AND an inline transform box. */
const bgPlaced = async (page: Page): Promise<boolean> => {
  const read = await readBgRender(page);
  return read.natural !== null && read.inline !== null && read.inline.width !== '';
};

/**
 * Placed for a KNOWN natural pair AND aspect-locked to it (the settled box
 * the last apply wrote) — the src-SWAP gate (the B-134 precedent).
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
 * The B-133c coverage discipline (the per-spec local copy): a live-scanned
 * clear-canvas point — elementFromPoint proves the aim reaches the canvas
 * (the calibrate band, the D91 bands and the floating panels reject it), and
 * a 40px node-corridor keeps it off every rendered node.
 */
const clearCanvasPoint = async (page: Page): Promise<Point> => {
  await settle(page);
  const found = await page.evaluate((): Point | null => {
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
        return { x, y };
      }
    }
    return null;
  });
  if (found === null) throw new Error('clearCanvasPoint: no clear canvas corridor');
  return found;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Desktop mouse drag over the canvas (the B-134 pan-cell shape). */
const mouseDrag = async (page: Page, from: Point, dx: number, dy: number): Promise<void> => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.mouse.up();
  await settle(page);
};

/**
 * D93's byte-equal node pin: every Fuyuki leaf's MODEL position as a JSON
 * string, in fixed order — "never touches node coordinates" as an assertion
 * (the B-116 seam; a viewport move changes rendered positions, never these).
 */
const FUYUKI_NODE_IDS: readonly string[] = [
  'emiya-residence', 'shopping-district', 'homurahara-academy', 'matou-residence',
  'tohsaka-residence', 'ryuudou-temple', 'outskirts', 'fuyuki-bridge', 'fuyuki-station',
  'harbor', 'kotomine-church', 'ghost-house', 'einzbern-castle',
];

const pinNodePositions = (page: Page, ids: readonly string[]): Promise<string[]> =>
  page.evaluate((nodeIds) => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return nodeIds.map((id) => JSON.stringify(hook.nodeModelPosition(id)));
  }, [...ids]);

/**
 * The interactions.e2e-spec twin, verbatim in shape: the phone project is
 * WebKit and a CDP session exists only in Chromium, so the input-pipeline
 * gestures run on an in-test Chromium page with the SAME iPhone 13
 * emulation (a touch drag there IS the phone journey's drag).
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

/** CDP one-finger drag (the interactions precedent, 200 ms hold before end). */
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
  // click — the Done tap below rides on this hold.
  await sleep(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

test.describe('background calibrate (PKG B-135, D93/D92/D75/D90/C24/F07/F52/D53)', () => {
  // FX1 facts (data/worlds/fuyuki.ts): the 13 POSITIONED Fuyuki leaves (the
  // two district containers carry no authored position — labels, not
  // extents); Misaki holds exactly ONE positioned node — a zero-area bbox,
  // the degenerate case.
  const FUYUKI_POSITIONS: ReadonlyArray<readonly [number, number]> = [
    [100, 250], [190, 300], [170, 160], [60, 210], [95, 125], [150, 470], [30, 360],
    [400, 285], [560, 260], [595, 420], [520, 85], [625, 140], [-380, 120],
  ];
  const FUYUKI_CENTER = (): { x: number; y: number } => ({
    x: (Math.min(...FUYUKI_POSITIONS.map((p) => p[0])) + Math.max(...FUYUKI_POSITIONS.map((p) => p[0]))) / 2,
    y: (Math.min(...FUYUKI_POSITIONS.map((p) => p[1])) + Math.max(...FUYUKI_POSITIONS.map((p) => p[1]))) / 2,
  });

  /**
   * The placement mapping assert (the B-134 expectPlacement shape, run
   * against EXPECTED values): model center = (img box center −
   * canvasBox.topLeft − pan) / zoom; the implied model-units-per-image-px =
   * (box size / zoom) / natural. Tolerances absorb layout quantization.
   */
  const expectPlacementAt = (
    read: BgRenderRead,
    expected: { x: number; y: number; scale: number },
    label: string,
  ): void => {
    if (read.box === null || read.natural === null) throw new Error(`${label}: img/natural not rendered`);
    const cx = (read.box.left + read.box.width / 2 - read.canvas.x - read.pan.x) / read.zoom;
    const cy = (read.box.top + read.box.height / 2 - read.canvas.y - read.pan.y) / read.zoom;
    expect(cx, `${label}: the img center renders at the placement (model x)`).toBeCloseTo(expected.x, 0);
    expect(cy, `${label}: the img center renders at the placement (model y)`).toBeCloseTo(expected.y, 0);
    expect(
      read.box.width / read.zoom / read.natural.w,
      `${label}: the rendered scale matches the placement (aspect-locked, one number)`,
    ).toBeCloseTo(expected.scale, 2);
    expect(
      read.box.height / read.zoom / read.natural.h,
      `${label}: the rendered scale matches the placement (y axis)`,
    ).toBeCloseTo(expected.scale, 2);
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await settle(page);
  });

  test('D93 journey: drag moves the placement center in model coords; node coordinates byte-equal; the camera stays; a tap places nothing (D93/D91/D75)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the mouse-drag journey is the desktop pass; the twin carries the phone drag (D53)');
    const bad = collectConsole(page);
    await expectHeaders(page);

    // Boot: the default renders and NO arm is persisted (the held D92
    // default — an unedited map never opens dirty).
    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    expect((await readSeams(page)).arm, 'boot: no placement arm (the held default renders)').toBeNull();
    const pinned = await pinNodePositions(page, FUYUKI_NODE_IDS);
    const before = await readSeams(page);
    expect(before.def, 'the shared default seam is live at boot').not.toBeNull();

    // Enter from the sheet: the mode is on, the sheet closes, the band shows.
    await enterCalibrateViaSheet(page, FUYUKI_ROW);
    await expect(page.getByTestId('tme-layer-manager-body')).toHaveCount(0);
    await expect(page.getByTestId('tme-calibrate-badge')).toHaveText('Calibrating — drag the map to move the image');
    expect((await readSeams(page)).calibrate, 'the mode-state seam is on').toBe(true);

    // A TAP places and selects nothing (the tap-vs-drag discipline): a node
    // tap mid-calibrate writes no selection and no placement. The tap must
    // REACH the canvas to prove the gate (not be eaten by the band): the
    // first node whose rendered position elementFromPoint resolves to the
    // canvas is the aim.
    const tapAim = await page.evaluate((ids: readonly string[]): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      const cb = document.querySelector('[data-testid="tme-canvas"]')!.getBoundingClientRect();
      for (const id of ids) {
        const p = hook.nodeRenderedPosition(id);
        if (p === null) continue;
        const x = cb.left + p.x;
        const y = cb.top + p.y;
        const el = document.elementFromPoint(x, y);
        if (el !== null && el.closest('.tme-canvas') !== null) return { x, y };
      }
      return null;
    }, FUYUKI_NODE_IDS);
    expect(tapAim, 'a canvas-reachable node exists for the tap').not.toBeNull();
    await page.mouse.click(tapAim!.x, tapAim!.y);
    await settle(page);
    await expect(page.getByTestId('tme-selection-chip')).toHaveCount(0);
    expect((await readSeams(page)).arm, 'a tap never writes a placement').toBeNull();

    // THE DRAG: the placement center moves by screenDelta / live zoom, both
    // axes; the camera stays (D91 — zoom/pan byte-equal); the node
    // coordinates stay byte-equal (D93 — the assertion, not a comment).
    const aim = await clearCanvasPoint(page);
    await mouseDrag(page, aim, 120, -60);
    const after = await readSeams(page);
    expect(after.arm, 'the committed drag persisted the arm').not.toBeNull();
    expect(after.arm!.x, 'the arm center moved by dx/zoom (model x)').toBeCloseTo(
      FUYUKI_CENTER().x + 120 / before.zoom,
      0,
    );
    expect(after.arm!.y, 'the arm center moved by dy/zoom (model y)').toBeCloseTo(
      FUYUKI_CENTER().y - 60 / before.zoom,
      0,
    );
    expect(after.arm!.scale, 'a drag never rescales (the base was the held default)').toBeCloseTo(before.def!.scale, 4);
    expect(after.zoom, 'D91 zero-motion: the drag never zooms the camera').toBe(before.zoom);
    expect(after.pan, 'D91 zero-motion: the drag never pans the camera').toEqual(before.pan);
    expect(await pinNodePositions(page, FUYUKI_NODE_IDS), 'D93: node coordinates byte-equal through the drag').toEqual(
      pinned,
    );

    // D75: the committed gesture is map data — the save dock lit.
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    // The render follows the arm (the B-134 mapping).
    expectPlacementAt(await readBgRender(page), after.arm!, 'the dragged placement renders');

    // Done: the mode exits (the band leaves; the seam reads off).
    await tap(page.getByTestId('tme-calibrate-done'));
    await expect(page.getByTestId('tme-calibrate')).toHaveCount(0);
    expect((await readSeams(page)).calibrate, 'Done exits the mode').toBe(false);
    expect((await readSeams(page)).arm, 'Done keeps the committed arm').not.toBeNull();

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('D93 scale control: one multiplicative aspect-locked step per tap; the readout speaks percentages of the default (D93/D92)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the stepper journey is desktop here; the phone pass is the posture + twin cells (D53)');
    const bad = collectConsole(page);

    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    await enterCalibrateViaSheet(page, FUYUKI_ROW);

    // The readout opens at 100% — the boot placement IS the default fit.
    await expect(page.getByTestId('tme-calibrate-scale')).toHaveText('100%');
    const base = (await readSeams(page)).def!;
    const baseScale = base.scale;

    // ONE tap = ONE committed multiplicative step (×1.25): the arm's scale
    // moves, the center does not (the image grows about its own center).
    await tap(page.getByTestId('tme-calibrate-scale-up'));
    const stepped = await readSeams(page);
    expect(stepped.arm, 'the step committed the arm').not.toBeNull();
    expect(stepped.arm!.scale, 'one tap = ×1.25 on the ONE scale').toBeCloseTo(baseScale * 1.25, 4);
    expect(stepped.arm!.x, 'a scale step never moves the center (x)').toBeCloseTo(base.x, 0);
    expect(stepped.arm!.y, 'a scale step never moves the center (y)').toBeCloseTo(base.y, 0);
    await expect(page.getByTestId('tme-calibrate-scale')).toHaveText('125%');
    await expect(page.getByTestId('tme-save-dock'), 'D75: the step is a committed gesture — the dock lights').toBeVisible();

    // Aspect-locked by construction: the rendered box keeps the natural ratio.
    const read = await readBgRender(page);
    expect(read.box, 'the img renders').not.toBeNull();
    expect(read.natural, 'the img decoded').not.toBeNull();
    expect(
      read.box!.width / read.box!.height,
      'aspect-locked: rendered w/h ratio == natural w/h ratio',
    ).toBeCloseTo(read.natural!.w / read.natural!.h, 2);

    // The reciprocal step lands back on the default scale (the readout too).
    await tap(page.getByTestId('tme-calibrate-scale-down'));
    const back = await readSeams(page);
    expect(back.arm!.scale, 'the reciprocal step restores the scale').toBeCloseTo(baseScale, 4);
    await expect(page.getByTestId('tme-calibrate-scale')).toHaveText('100%');

    await tap(page.getByTestId('tme-calibrate-done'));
    await expectCleanConsole(bad);
  });

  test('D93 fit to graph: resets to the ONE shared default (equal to the seam), the render re-fits (D92/D93)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the fit-reset journey is desktop here; the phone posture cell taps Fit touch-alone (D53)');
    const bad = collectConsole(page);

    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    await enterCalibrateViaSheet(page, FUYUKI_ROW);

    // Tune away from the default: a drag plus a scale step.
    const aim = await clearCanvasPoint(page);
    await mouseDrag(page, aim, 90, 40);
    await tap(page.getByTestId('tme-calibrate-scale-up'));
    const tuned = await readSeams(page);
    expect(tuned.def, 'the default seam is live').not.toBeNull();
    expect(tuned.arm!.scale, 'precondition: tuned off the default scale').toBeCloseTo(tuned.def!.scale * 1.25, 4);

    // Fit to graph: the arm becomes EXACTLY the shared default (the seam
    // reads the same defaultPlacementFor body the write used — equal
    // floats, not close floats).
    await tap(page.getByTestId('tme-calibrate-fit'));
    const fitted = await readSeams(page);
    expect(fitted.arm, 'the fit wrote the arm').not.toBeNull();
    expect(fitted.def, 'the default seam is live').not.toBeNull();
    expect(fitted.arm!.x, 'fit x == the shared default (exact float equality)').toBe(fitted.def!.x);
    expect(fitted.arm!.y, 'fit y == the shared default (exact float equality)').toBe(fitted.def!.y);
    expect(fitted.arm!.scale, 'fit scale == the shared default (exact float equality)').toBe(fitted.def!.scale);
    await expect(page.getByTestId('tme-calibrate-scale'), 'the readout returns to the baseline').toHaveText('100%');

    // The render re-fits to the D92 default (the B-134 mapping's own values —
    // the expected scale is the shared seam's answer, never a hardcoded
    // natural).
    expectPlacementAt(await readBgRender(page), fitted.def!, 'the fitted render');

    await tap(page.getByTestId('tme-calibrate-done'));
    await expectCleanConsole(bad);
  });

  test('D75/C24 round trip: the dock lights per committed gesture; Save clears it; the tuned placement re-reads verbatim (D75/F45/C24)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the save round trip is the desktop pass (the packet cell list)');
    const bad = collectConsole(page);

    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    await enterCalibrateViaSheet(page, FUYUKI_ROW);

    // Gesture 1 — a drag: dock lit.
    const aim = await clearCanvasPoint(page);
    await mouseDrag(page, aim, 70, 30);
    await expect(page.getByTestId('tme-save-dock'), 'gesture 1 lights the dock').toBeVisible();
    // Gesture 2 — a scale step: dock still lit.
    await tap(page.getByTestId('tme-calibrate-scale-up'));
    await expect(page.getByTestId('tme-save-dock'), 'gesture 2 keeps the dock lit').toBeVisible();

    // The tuned arm, read BEFORE the round trip (the expected value — the
    // base scale is the shared seam's answer, never a hardcoded natural).
    const pre = await readSeams(page);
    expect(pre.def, 'the default seam is live').not.toBeNull();
    const tuned = pre.arm!;
    expect(tuned.scale, 'precondition: tuned scale').toBeCloseTo(pre.def!.scale * 1.25, 4);

    // Done, Save: the dock clears — the placement lives in map data now.
    await tap(page.getByTestId('tme-calibrate-done'));
    await tap(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toHaveCount(0);

    // The loadMap-shaped re-read: leave the layer and come back — the ARM
    // renders verbatim (same center, same scale), and the switch dirties
    // nothing (D75: the save already landed it).
    await switchLayer(page, MISAKI_ROW); // B-D1 (PROPOSAL-D §2.1 + B-D1): the regime-aware switch
    await expect(page.getByTestId('tme-bg')).toHaveCount(0);
    await switchLayer(page, FUYUKI_ROW); // B-D1 (PROPOSAL-D §2.1 + B-D1): the regime-aware switch
    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    const returned = await readSeams(page);
    expect(returned.arm, 'the tuned arm survives the round trip verbatim').toEqual(tuned);
    expectPlacementAt(await readBgRender(page), tuned, 'the tuned render after the round trip');
    await expect(page.getByTestId('tme-save-dock'), 'the switch itself dirties nothing').toHaveCount(0);

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('D93 fresh-start: a new background source resets the placement and ends the session (D93/D75/C24)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the fresh-start journey is the desktop pass (the packet cell list)');
    const bad = collectConsole(page);

    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    await enterCalibrateViaSheet(page, FUYUKI_ROW);

    // Tune: a drag commits an arm away from the default.
    const aim = await clearCanvasPoint(page);
    await mouseDrag(page, aim, -80, 25);
    expect((await readSeams(page)).arm, 'precondition: the tuned arm stands').not.toBeNull();
    expect((await readSeams(page)).calibrate, 'mid-session').toBe(true);

    // A NEW source on the same layer (the sheet reopens over the session;
    // the D93 fresh-start resets the placement and the session ends — the
    // thing being calibrated is gone).
    await openManager(page); // B-D1 (PROPOSAL-D §2.1 + B-D1): the regime-aware entry
    await expect(page.getByTestId('tme-layer-manager-body')).toBeVisible();
    await setUrlOn(page, FUYUKI_ROW, SVG_URL);
    await expect.poll(() => bgPlacedFor(page, 64, 64), { timeout: 5_000 }).toBe(true);

    // The session ended (the band leaves; the seam reads off) and the arm is
    // the DEFAULT again — the authoring moment re-persisted the fresh fit
    // (the B-134 round-trip semantics), the tuned placement is gone.
    await expect(page.getByTestId('tme-calibrate')).toHaveCount(0);
    const fresh = await readSeams(page);
    expect(fresh.calibrate, 'the fresh-start ended the session').toBe(false);
    expect(fresh.arm, 'the fresh arm stands (the authoring moment)').not.toBeNull();
    expect(fresh.def, 'the default seam is live').not.toBeNull();
    expect(fresh.arm!.x, 'fresh-start: the arm is the default again (x)').toBe(fresh.def!.x);
    expect(fresh.arm!.y, 'fresh-start: the arm is the default again (y)').toBe(fresh.def!.y);
    expect(fresh.arm!.scale, 'fresh-start: the arm is the default again (scale)').toBe(fresh.def!.scale);
    await expect(page.getByTestId('tme-save-dock'), 'D75: the set is dirty').toBeVisible();

    // The calibrate UI re-reads the reset: re-entry works against the fresh
    // image and the readout opens at the baseline again.
    await enterCalibrateViaSheet(page, FUYUKI_ROW);
    await expect(page.getByTestId('tme-calibrate-scale')).toHaveText('100%');
    await tap(page.getByTestId('tme-calibrate-cancel'));

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('F07 gates: no calibrate without a (loaded, non-failed) background — disabled, not hidden (F07/C32)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the gate matrix is the desktop pass (the packet cell list)');
    const bad = collectConsole(page);

    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    await openManager(page); // B-D1 (PROPOSAL-D §2.1 + B-D1): the regime-aware entry
    await expect(page.getByTestId('tme-layer-manager-body')).toBeVisible();

    // Fuyuki (active, harness background): ENABLED. Misaki (inactive, no
    // background): DISABLED — never hidden (the F07 dead-control reasoning).
    // B-149 (R9 item 5): expand-first — the entry hides behind the row's
    // collapsed expander; both rows open so the gate matrix reads real
    // controls.
    const fuyuki = layerRow(page, FUYUKI_ROW);
    const misaki = layerRow(page, MISAKI_ROW);
    await expandBgForm(page, FUYUKI_ROW);
    await expandBgForm(page, MISAKI_ROW);
    await expect(fuyuki.getByTestId('tme-layer-bg-calibrate')).toBeEnabled();
    await expect(misaki.getByTestId('tme-layer-bg-calibrate')).toBeDisabled();

    // Remove Fuyuki's background: the entry disables (nothing to calibrate).
    await fuyuki.getByTestId('tme-layer-bg-remove').click();
    await expect(page.getByTestId('tme-bg')).toHaveCount(0);
    await expect(fuyuki.getByTestId('tme-layer-bg-calibrate')).toBeDisabled();

    // The failed-load degrade (C32): a dead src hides the img and the entry
    // stays disabled — there is no image to calibrate against.
    await setUrlOn(page, FUYUKI_ROW, DEAD_URL);
    await expect
      .poll(() => bad.warnings.filter((w) => w.includes('[TravelMapper] background load failed')), {
        timeout: 5_000,
      })
      .toHaveLength(1);
    await expect(fuyuki.getByTestId('tme-layer-bg-calibrate')).toBeDisabled();

    // A good src re-enables (the flag re-arms on any src change — C32).
    await setUrlOn(page, FUYUKI_ROW, SVG_URL);
    await expect.poll(() => bgPlacedFor(page, 64, 64), { timeout: 5_000 }).toBe(true);
    await expect(fuyuki.getByTestId('tme-layer-bg-calibrate')).toBeEnabled();

    // The mode never entered through any of it.
    expect((await readSeams(page)).calibrate, 'the gates kept the mode off').toBe(false);
    expect(
      bad.errors.filter((e) => !e.startsWith('Failed to load resource')),
      'no app console errors beyond the browser resource note',
    ).toEqual([]);
    expect(bad.pageErrors, 'no page error (C32)').toEqual([]);

    await expectHeaders(page);
  });

  test('D92 degenerate extents: the fallback stands until a calibrate write; Fit disabled honestly; a drag replaces it with a real placement (D92/D93/F07)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the degenerate journey is the desktop pass (the packet cell list)');
    const bad = collectConsole(page);

    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);

    // Misaki holds exactly ONE positioned node (FX1) — a zero-area bbox: set
    // its background and switch to it; the D84 stage-contain fallback renders.
    await openManager(page); // B-D1 (PROPOSAL-D §2.1 + B-D1): the regime-aware entry
    await setUrlOn(page, MISAKI_ROW, SVG_URL);
    await switchLayer(page, MISAKI_ROW); // B-D1 (PROPOSAL-D §2.1 + B-D1): the regime-aware switch
    await expect.poll(() => bgFallback(page), { timeout: 5_000 }).toBe(true);
    const pinned = await pinNodePositions(page, [MISAKI_ID]);
    const misakiSeams = await readSeams(page);
    expect(misakiSeams.arm, 'degenerate: no arm (the fallback renders)').toBeNull();
    expect(misakiSeams.def, 'degenerate: the shared default is null (Fit will be disabled)').toBeNull();

    // Entry IS offered (a present, loaded background — the F07 entry gate is
    // about the image, not the extents)…
    await enterCalibrateViaSheet(page, MISAKI_ROW);
    // …but Fit is disabled honestly (the dead control) and the readout hides
    // (there is no default to be a percentage of).
    await expect(page.getByTestId('tme-calibrate-fit')).toBeDisabled();
    await expect(page.getByTestId('tme-calibrate-scale')).toHaveCount(0);

    // The drag: the base is the fallback's implied model placement (the
    // canvas-center contain fit over the live viewport); the committed write
    // REPLACES the fallback with a real arm.
    const aim = await clearCanvasPoint(page);
    await mouseDrag(page, aim, 50, 35);
    const after = await readSeams(page);
    expect(after.arm, 'the calibrate write replaced the fallback with a real placement').not.toBeNull();
    const read = await readBgRender(page);
    const expectedBase = {
      x: (read.canvas.width / 2 - misakiSeams.pan.x) / misakiSeams.zoom,
      y: (read.canvas.height / 2 - misakiSeams.pan.y) / misakiSeams.zoom,
      scale: Math.min(read.canvas.width / 64, read.canvas.height / 64) / misakiSeams.zoom,
    };
    expect(after.arm!.x, 'the synthesized base center + drag delta (model x)').toBeCloseTo(
      expectedBase.x + 50 / misakiSeams.zoom,
      0,
    );
    expect(after.arm!.y, 'the synthesized base center + drag delta (model y)').toBeCloseTo(
      expectedBase.y + 35 / misakiSeams.zoom,
      0,
    );
    expect(after.arm!.scale, 'the synthesized contain scale (a drag never rescales)').toBeCloseTo(expectedBase.scale, 2);
    expect(await pinNodePositions(page, [MISAKI_ID]), 'D93: Misaki\'s node coordinates byte-equal').toEqual(pinned);
    await expect(page.getByTestId('tme-save-dock'), 'D75: the write dirtied').toBeVisible();

    // The render: the fallback is GONE — a placed, aspect-locked box.
    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);
    expectPlacementAt(await readBgRender(page), after.arm!, 'the replaced placement renders');

    await tap(page.getByTestId('tme-calibrate-done'));
    await expectCleanConsole(bad);
  });

  test('phone posture: the whole journey touch-alone at 375px, every control >= 44px (F52/D53/F07)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the touch-alone journey is the phone project (D53)');
    const bad = collectConsole(page);
    await page.setViewportSize({ width: 375, height: 812 });

    await expect.poll(() => bgPlaced(page), { timeout: 5_000 }).toBe(true);

    // The entry: a >= 44px tap target in the sheet; the journey runs
    // touch-alone from there.
    await openManager(page); // B-D1 (PROPOSAL-D §2.1 + B-D1): the regime-aware entry
    await expandBgForm(page, FUYUKI_ROW); // B-149 (R9 item 5): the entry hides behind the expander
    const calibrate = layerRow(page, FUYUKI_ROW).getByTestId('tme-layer-bg-calibrate');
    await expect(calibrate).toBeEnabled();
    const entryBox = await calibrate.boundingBox();
    expect(entryBox, 'the Calibrate entry is visible').not.toBeNull();
    expect(entryBox!.height, 'entry height >= 44px (F52)').toBeGreaterThanOrEqual(44);
    expect(entryBox!.width, 'entry width >= 44px (F52)').toBeGreaterThanOrEqual(44);
    await calibrate.tap();
    await expect(page.getByTestId('tme-calibrate')).toBeVisible();
    await expect(page.getByTestId('tme-layer-manager-body')).toHaveCount(0);

    // The band's controls: every one a >= 44px target (the bar wraps at
    // 375px — wrapping, never horizontal scroll, D53).
    const targets = [
      'tme-calibrate-scale-down',
      'tme-calibrate-scale-up',
      'tme-calibrate-fit',
      'tme-calibrate-done',
      'tme-calibrate-cancel',
    ];
    for (const id of targets) {
      const b = await page.getByTestId(id).boundingBox();
      expect(b, `${id} visible`).not.toBeNull();
      expect(b!.height, `${id} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(b!.width, `${id} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);

    // Touch-alone: scale up (the dock lights — D75), Fit (back to the
    // baseline), Done (the mode exits; the committed arm stands).
    await page.getByTestId('tme-calibrate-scale-up').tap();
    await expect(page.getByTestId('tme-calibrate-scale')).toHaveText('125%');
    await expect(page.getByTestId('tme-save-dock'), 'D75: the step dirtied').toBeVisible();
    await page.getByTestId('tme-calibrate-fit').tap();
    await expect(page.getByTestId('tme-calibrate-scale')).toHaveText('100%');
    const fitted = await readSeams(page);
    expect(fitted.arm, 'the fit wrote the arm').not.toBeNull();
    expect(fitted.def, 'the default seam is live').not.toBeNull();
    expect(fitted.arm!.scale, 'the arm is the default again').toBe(fitted.def!.scale);
    await page.getByTestId('tme-calibrate-done').tap();
    await expect(page.getByTestId('tme-calibrate')).toHaveCount(0);
    expect((await readSeams(page)).calibrate, 'Done exits the mode').toBe(false);

    // Re-entry works (the sheet reopens; the entry is still enabled).
    await openManager(page); // B-D1 (PROPOSAL-D §2.1 + B-D1): the regime-aware entry
    await expandBgForm(page, FUYUKI_ROW); // B-149 (R9 item 5): idempotent — a no-op while still expanded
    await expect(layerRow(page, FUYUKI_ROW).getByTestId('tme-layer-bg-calibrate')).toBeEnabled();

    await expectHeaders(page);
    await expectCleanConsole(bad);
  });

  test('D53 twin: the calibrate drag is a touch drag; the placement moves in model coords; Done commits (D93/D91/D53)', async () => {
    test.skip(!isPhone(), 'touch gestures need the in-test Chromium twin (the interactions precedent)');
    await withPhoneChromiumPage(async (page) => {
      const bad = collectConsole(page);

      // Enter touch-alone: Manage, then the Fuyuki row's Calibrate.
      await page.getByTestId('tme-layer-manage').tap();
      await expect(page.getByTestId('tme-layer-manager-body')).toBeVisible();
      await expandBgForm(page, FUYUKI_ROW); // B-149 (R9 item 5): expand-first re-baseline
      await layerRow(page, FUYUKI_ROW).getByTestId('tme-layer-bg-calibrate').tap();
      await expect(page.getByTestId('tme-calibrate')).toBeVisible();
      await expect(page.getByTestId('tme-layer-manager-body')).toHaveCount(0);

      const pinned = await pinNodePositions(page, FUYUKI_NODE_IDS);
      const before = await readSeams(page);

      // THE TOUCH DRAG (one finger, CDP): the arm center moves by
      // screenDelta / live zoom; the camera stays; the nodes are untouched.
      const aim = await clearCanvasPoint(page);
      const cdp = await page.context().newCDPSession(page);
      await cdpTouchDrag(cdp, aim, 90, -45);
      await settle(page);
      const after = await readSeams(page);
      expect(after.arm, 'the committed touch drag persisted the arm').not.toBeNull();
      expect(after.arm!.x, 'the touch drag moved the center by dx/zoom (model x)').toBeCloseTo(
        FUYUKI_CENTER().x + 90 / before.zoom,
        0,
      );
      expect(after.arm!.y, 'the touch drag moved the center by dy/zoom (model y)').toBeCloseTo(
        FUYUKI_CENTER().y - 45 / before.zoom,
        0,
      );
      expect(after.zoom, 'D91 zero-motion: the drag never zooms the camera').toBe(before.zoom);
      expect(after.pan, 'D91 zero-motion: the drag never pans the camera').toEqual(before.pan);
      expect(await pinNodePositions(page, FUYUKI_NODE_IDS), 'D93: node coordinates byte-equal').toEqual(pinned);
      await expect(page.getByTestId('tme-save-dock'), 'D75: the committed drag dirtied').toBeVisible();

      // Done — a tap AFTER the drag (the 200 ms hold in cdpTouchDrag is the
      // dropped-tap medicine): the mode exits, the arm stands.
      await page.getByTestId('tme-calibrate-done').tap();
      await expect(page.getByTestId('tme-calibrate')).toHaveCount(0);
      const done = await readSeams(page);
      expect(done.calibrate, 'Done exits the mode').toBe(false);
      expect(done.arm, 'the committed arm stands through Done').toEqual(after.arm);

      await expectCleanConsoleToleratingSyntheticTouch(bad);
    });
  });
});
