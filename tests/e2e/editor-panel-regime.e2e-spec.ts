// tests/e2e/editor-panel-regime.e2e-spec.ts — PKG B-119: the Q29 panel
// regime on the F40 property panel (EXECUTION-PLAN §8 item 3's settled
// reading — settled product per R20, not an open question): the panel opens
// MAXIMIZED (the docked region form) in the editor, a ≥44px header
// Maximize/Restore toggle floats it at a REMEMBERED position, the header
// drags it (pointer events — one path for mouse and touch, D53), and the
// position survives close/reopen. Runs at BOTH playwright projects (desktop
// + emulated phone with touch) per D53/F52; the drag cells run the touch
// gestures through the Chromium-twin pattern (WebKit's iPhone 13 emulation
// cannot drive CDP touch gestures directly — see
// editor-place-move.e2e-spec.ts / interactions.e2e-spec.ts).
//
// Cited IDs:
//   Q29/§8 item 3 — floating, remembered-position panel with a maximize
//          button; the editor maximizes by default (cell 3: re-entering the
//          editor always re-docks the panel, while the position itself stays
//          remembered across the editor toggle).
//   D2     — the drag's high-frequency pointermove writes NO signals: the
//          live position is a direct style transform (purely presentational)
//          and the position signal commits ONCE on release — every
//          assertion here reads the committed/rendered state, never a
//          mid-drag Angular state.
//   F52/D53 — the regime button is a ≥44px tap target in both states, the
//          drag works touch-alone through the twin, and the floating panel
//          NEVER covers the top-right chrome stack (editor toggle, chip,
//          save dock): reachability is proven with elementFromPoint in every
//          state (the clamp's contract, "below/left of it").
//   F46    — the clamp is plain containment in the stage bounds (no snap
//          targets, no edges, no magnetism) — NOT the fenced canvas
//          snapping; nothing here asserts magnetism, only bounds.
//   B-117/B-118 — the panel's landed behavior (draft rule, C30 display,
//          Connect flow) is untouched: every cell drives the panel through
//          the same public affordances as before.
//
// FX1 facts: 'emiya-residence' and 'outskirts' are library nodes whose
// rendered centers are vetted tap targets at both projects' fits
// (editor-property-panel.e2e-spec.ts precedents); the pin is Emiya
// Residence. Canvas aiming goes through the DEV-HARNESS-ONLY
// window.__TME_E2E__ seam; all aim math is test-side — the UI computes
// nothing (R1).
import { chromium, devices, expect, test, type CDPSession, type Locator, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
}

interface PanelState {
  /** computed position — 'static' docked (maximized) / 'fixed' floating. */
  position: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';
const EMIYA_ID = 'emiya-residence';
const OUTSKIRTS_ID = 'outskirts';
const CHURCH_ID = 'kotomine-church';
const CASTLE_ID = 'einzbern-castle'; // isolated corner node — the clear-tap fallback
/** Reopen candidates: one of these is always clear of the dragged panel. */
const REOPEN_CANDIDATES = [EMIYA_ID, OUTSKIRTS_ID, CHURCH_ID, CASTLE_ID];

const isPhone = (): boolean => test.info().project.name === 'phone';

// page.evaluate callbacks are SERIALIZED: the hook lookup is inlined in each
// one — no module-scope closures cross the wire (interactions.e2e-spec.ts
// precedent).

const readRenderedPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeRenderedPosition(nodeId);
    },
    id,
  );

/**
 * The panel's regime state + rendered rect, or null while closed. This reads
 * the HOST element (`tme-property-panel`) — the regime (floating class,
 * position: fixed, transform) lives there; the data-testid marks the inner
 * section (the panel's content), which stays position:static in both states.
 */
const readPanelState = (page: Page): Promise<PanelState | null> =>
  page.evaluate((): PanelState | null => {
    const panel = document.querySelector('tme-property-panel');
    if (panel === null) return null;
    const cs = getComputedStyle(panel);
    const r = panel.getBoundingClientRect();
    return { position: cs.position, x: r.x, y: r.y, w: r.width, h: r.height };
  });

/** The map stage's rect (the clamp's bounds — read test-side only). */
const readStageBox = (page: Page): Promise<Box> =>
  page.evaluate((): Box => {
    const stage = document.querySelector('.tme-stage');
    if (stage === null) throw new Error('.tme-stage missing — viewer not loaded');
    const r = stage.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });

/**
 * The top-right chrome stack stays REACHABLE: for every rendered control of
 * the stack (editor toggle, selection chip, save dock), the element at its
 * center is itself or a descendant — the floating panel never covers it.
 */
const chromeReachable = (page: Page): Promise<boolean> =>
  page.evaluate((): boolean => {
    for (const id of ['tme-editor-toggle', 'tme-selection-chip', 'tme-save-dock']) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (el === null) continue; // conditional chrome (chip/dock) not rendered
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit === null || !(hit === el || el.contains(hit))) return false;
    }
    return true;
  });

/** computed touch-action of the panel's header (the drag handle). */
const headerTouchAction = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const header = document
      .querySelector('[data-testid="tme-property-panel"]')
      ?.querySelector('.tme-prop-head');
    return header === null || header === undefined ? null : getComputedStyle(header).touchAction;
  });

const regimeButton = (page: Page): Locator => page.getByTestId('tme-panel-maximize');

/**
 * Wait two animation frames: panel open/close and the ResizeObserver-driven
 * re-fit (B-112) run just before the next paint — reads and gestures inside
 * that window would aim at stale coordinates (the settle precedent).
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** F52/D53: tap on the touch-emulated project, click on desktop (points). */
const tapPoint = async (page: Page, point: Point): Promise<void> => {
  if (isPhone()) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
};

/** F52/D53: tap on the touch-emulated project, click on desktop (locators). */
const activate = async (locator: Locator): Promise<void> => {
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/** Screen-px point of a node's rendered center (seam read + canvas box). */
const nodeScreenPoint = async (page: Page, id: string): Promise<Point> => {
  await settle(page);
  const pos = await readRenderedPosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return { x: box.x + pos.x, y: box.y + pos.y };
};

/** Enter editor mode and open the property panel for one FX1 node. */
const openPanelFor = async (page: Page, id: string): Promise<void> => {
  await activate(page.getByTestId('tme-editor-toggle'));
  await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
  await tapPoint(page, await nodeScreenPoint(page, id));
  await expect(page.getByTestId('tme-property-panel')).toBeVisible();
};

/** Collect console errors/warnings/pageerrors into `bad` (the house sweep). */
const watchConsole = (page: Page, bad: string[]): void => {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The `phone` project is WebKit (iPhone 13), where CDP touch input does not
 * exist, and the touchscreen API has no drag primitive — the drag cells run
 * on a twin Chromium page with the SAME iPhone 13 emulation
 * (editor-place-move.e2e-spec.ts pattern).
 */
const withPhoneChromiumPage = async (run: (page: Page) => Promise<void>): Promise<void> => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
    await run(page);
  } finally {
    await browser.close();
  }
};

/**
 * One-finger drag through CDP Input.dispatchTouchEvent — the twin's touch
 * input path (the touchscreen API has no drag primitive). The 200ms HOLD
 * before the release is load-bearing, not cosmetic: a touchEnd landing
 * immediately after the last move leaves Chromium's gesture recognizer
 * half-armed and the NEXT tap's click is silently dropped (reproduced ~40%
 * of runs — pointerdown/up + touchstart/end all arrive at the target, no
 * `click`; found live by this spec's chip-dismiss step). A real finger ends
 * a drag with a hold; with it the following taps click reliably (12/12 vs
 * 5/6 without).
 */
const cdpTouchDrag = async (cdp: CDPSession, from: Point, dx: number, dy: number): Promise<void> => {
  const steps = 6;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  });
  await sleep(40);
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps }],
    });
    await sleep(25);
  }
  await sleep(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

/**
 * The drag gesture per project: on the phone project's page (the twin,
 * touch-emulated Chromium) through CDP touch input; on the desktop page
 * through the mouse API. `from` must be a header point clear of the header
 * buttons (they keep their taps — a pointer on one never starts a drag).
 */
const dragFrom = async (page: Page, from: Point, dx: number, dy: number): Promise<void> => {
  if (isPhone()) {
    const cdp = await page.context().newCDPSession(page);
    await cdpTouchDrag(cdp, from, dx, dy);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
    await page.mouse.up();
  }
};

/** Drag the floating panel by its header's title end (never the buttons). */
const dragPanel = async (page: Page, dx: number, dy: number): Promise<void> => {
  const box = await page.getByTestId('tme-property-panel').boundingBox();
  if (box === null) throw new Error('floating panel not visible');
  await dragFrom(page, { x: box.x + 24, y: box.y + 20 }, dx, dy);
  await settle(page);
};

test.describe('property panel regime: floating, remembered, maximized-by-default (PKG B-119)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
  });

  test('opens maximized; Restore floats it clear of the top-right chrome; Maximize re-docks (Q29/F52/D53)', async ({
    page,
  }) => {
    const bad: string[] = [];
    watchConsole(page, bad);
    const regime = regimeButton(page);

    await openPanelFor(page, EMIYA_ID);

    // Maximized default: the docked region form (in-flow, position static),
    // Restore offered, the chrome stack it shares the stage with reachable.
    let state = await readPanelState(page);
    expect(state?.position, 'docked panel is in-flow (maximized default)').toBe('static');
    await expect(regime).toHaveText('Restore');
    expect(await chromeReachable(page), 'chrome reachable while docked').toBe(true);

    // Make the save dock part of the stack: a committed edit lights it
    // (F45 — the dock reads the core's dirty flag, so the draft must be
    // COMMITTED via Done, not merely typed into). The dock is one of the
    // surfaces the floating panel must never cover.
    await page.getByTestId('tme-node-label-input').fill('Emiya Home');
    await activate(page.getByTestId('tme-node-done'));
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    // Restore → floating: out of flow (the stage regains the region), inside
    // the stage bounds, and the whole top-right stack stays reachable.
    const stageDocked = await readStageBox(page);
    await activate(regime);
    await expect(regime).toHaveText('Maximize');
    await settle(page);
    state = await readPanelState(page);
    const stageFloating = await readStageBox(page);
    expect(state?.position, 'restored panel floats (position fixed)').toBe('fixed');
    expect(
      stageFloating.width * stageFloating.height,
      'the freed dock region returns to the stage',
    ).toBeGreaterThan(stageDocked.width * stageDocked.height);
    if (state === null) throw new Error('panel closed unexpectedly');
    expect(state.x, 'floating panel inside the stage (left)').toBeGreaterThanOrEqual(stageFloating.x);
    expect(
      state.x + state.w,
      'floating panel inside the stage (right)',
    ).toBeLessThanOrEqual(stageFloating.x + stageFloating.width);
    expect(state.y, 'floating panel inside the stage (top)').toBeGreaterThanOrEqual(stageFloating.y);
    expect(await chromeReachable(page), 'chrome reachable while floating').toBe(true);

    // F52: the regime control is a real tap target in the floating state too.
    const regimeBox = await regime.boundingBox();
    expect(regimeBox, 'regime button on the touch surface').not.toBeNull();
    expect(regimeBox?.height ?? 0, 'regime button height >= 44px (F52)').toBeGreaterThanOrEqual(44);
    expect(regimeBox?.width ?? 0, 'regime button width >= 44px (F52)').toBeGreaterThanOrEqual(44);

    // D53/§6.2: the drag handle owns touch-action none — the header only,
    // never the stage; docked, the header is plain chrome again.
    expect(await headerTouchAction(page), 'floating header is the drag surface').toBe('none');
    await activate(regime);
    await expect(regime).toHaveText('Restore');
    state = await readPanelState(page);
    expect(state?.position, 'Maximize returns the docked form').toBe('static');
    const stageRedocked = await readStageBox(page);
    expect(
      stageRedocked.width * stageRedocked.height,
      'Maximize gives the region back to the dock',
    ).toBeLessThan(stageFloating.width * stageFloating.height);
    expect(await headerTouchAction(page), 'docked header is not a drag surface').not.toBe('none');
    expect(await chromeReachable(page), 'chrome reachable re-docked').toBe(true);

    expect(bad, 'no console errors/warnings/pageerrors in the regime sweep').toEqual([]);
  });

  test('header drag moves the floating panel (mouse / Chromium-twin touch); the position survives close/reopen; Maximize re-docks', async ({
    page,
  }) => {
    const dragRememberRedock = async (p: Page): Promise<void> => {
      const bad: string[] = [];
      watchConsole(p, bad);

      await openPanelFor(p, OUTSKIRTS_ID);
      await activate(regimeButton(p)); // Restore → floating at the default spot
      await settle(p);
      const floating = await readPanelState(p);
      expect(floating?.position).toBe('fixed');
      if (floating === null) throw new Error('panel not floating after Restore');

      // Drag left+down by the header (the clamp normalizes overshoot; the
      // vertical move is the unclamped, always-honest proof of motion).
      await dragPanel(p, -160, 150);
      const dragged = await readPanelState(p);
      if (dragged === null) throw new Error('panel closed by the drag');
      expect(dragged.position).toBe('fixed');
      expect(dragged.y, 'the drag moved the panel down (D2: committed state)').toBeGreaterThanOrEqual(
        floating.y + 100,
      );
      expect(dragged.x, 'the drag moved the panel toward the left edge').toBeLessThan(floating.x);
      const stage = await readStageBox(p);
      expect(dragged.x).toBeGreaterThanOrEqual(stage.x); // plain containment (F46-safe)
      expect(dragged.y).toBeGreaterThanOrEqual(stage.y);
      expect(await chromeReachable(p), 'chrome reachable after the drag').toBe(true);

      // Remembered: close (the chip dismisses the selection — the draft is
      // untouched, a panel drag never touched the fields) and reopen on a
      // node clear of the floating panel; it must float back to the SAME
      // spot without a new Restore.
      await activate(p.getByTestId('tme-selection-chip'));
      await expect(p.getByTestId('tme-property-panel')).toHaveCount(0);
      let target: Point | null = null;
      for (const id of REOPEN_CANDIDATES) {
        const pt = await nodeScreenPoint(p, id);
        const covered =
          pt.x >= dragged.x && pt.x <= dragged.x + dragged.w && pt.y >= dragged.y && pt.y <= dragged.y + dragged.h;
        if (!covered) {
          target = pt;
          break;
        }
      }
      if (target === null) throw new Error('no candidate node clear of the floating panel');
      await tapPoint(p, target);
      await expect(p.getByTestId('tme-property-panel')).toBeVisible();
      const reopened = await readPanelState(p);
      if (reopened === null) throw new Error('panel did not reopen');
      expect(reopened.position, 'reopens floating (the regime is remembered)').toBe('fixed');
      expect(Math.abs(reopened.x - dragged.x), 'remembered x survives close/reopen').toBeLessThanOrEqual(2);
      expect(Math.abs(reopened.y - dragged.y), 'remembered y survives close/reopen').toBeLessThanOrEqual(2);
      await expect(regimeButton(p)).toHaveText('Maximize');
      expect(await chromeReachable(p), 'chrome reachable after reopen').toBe(true);

      // Maximize → the docked form returns.
      await activate(regimeButton(p));
      await settle(p); // the re-dock is a class flip — let the CD flush land (D2)
      const redocked = await readPanelState(p);
      expect(redocked?.position).toBe('static');

      expect(bad, 'no console errors/warnings/pageerrors in the drag cell').toEqual([]);
    };
    if (isPhone()) await withPhoneChromiumPage(dragRememberRedock);
    else await dragRememberRedock(page);
  });

  test('editor entry maximizes by default; the position stays remembered across the editor toggle (Q29 §8 item 3)', async ({
    page,
  }) => {
    const editorEntryMaximizes = async (p: Page): Promise<void> => {
      const bad: string[] = [];
      watchConsole(p, bad);

      await openPanelFor(p, EMIYA_ID);
      await activate(regimeButton(p)); // float
      await dragPanel(p, -160, 90);
      const dragged = await readPanelState(p);
      if (dragged === null) throw new Error('panel not floating after the drag');
      expect(dragged.position).toBe('fixed');

      // Exit + re-enter the editor: the (untouched) draft survives the exit
      // resumable (B-117), so the panel reopens BY ITSELF — and it reopens
      // MAXIMIZED: the editor maximizes by default, even though it floated
      // a moment ago.
      await activate(p.getByTestId('tme-editor-toggle'));
      await expect(p.getByTestId('tme-property-panel')).toHaveCount(0);
      await activate(p.getByTestId('tme-editor-toggle'));
      await expect(p.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
      await expect(p.getByTestId('tme-property-panel')).toBeVisible();
      const reentered = await readPanelState(p);
      expect(reentered?.position, 'editor entry re-docks the panel (maximized default)').toBe('static');
      await expect(regimeButton(p)).toHaveText('Restore');

      // Restore floats it back to the remembered spot (±2px), even though a
      // dock/maximize cycle happened in between.
      await activate(regimeButton(p));
      await settle(p);
      const restored = await readPanelState(p);
      if (restored === null) throw new Error('panel not floating after Restore');
      expect(restored.position).toBe('fixed');
      expect(Math.abs(restored.x - dragged.x), 'remembered x survives the editor toggle').toBeLessThanOrEqual(2);
      expect(Math.abs(restored.y - dragged.y), 'remembered y survives the editor toggle').toBeLessThanOrEqual(2);
      expect(await chromeReachable(p), 'chrome reachable after the restore').toBe(true);

      expect(bad, 'no console errors/warnings/pageerrors in the editor-toggle cell').toEqual([]);
    };
    if (isPhone()) await withPhoneChromiumPage(editorEntryMaximizes);
    else await editorEntryMaximizes(page);
  });
});
