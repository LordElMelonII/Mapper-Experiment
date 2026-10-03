// tests/e2e/interactions.e2e-spec.ts — PKG B-103: node tap-select + drag +
// unified pointer/touch guarantees on canvas input, proven at BOTH playwright
// projects (desktop + emulated phone with touch) — D53/F52 mobile-and-desktop
// parity is mandatory for every UI packet.
//
// Cited IDs:
//   D2   — zoneless: only DISCRETE gestures (tap) write signals; drag and
//          pinch/pan gestures never touch Angular state.
//   D53  — canvas input through the graph library's unified pointer/touch
//          events (tap, drag, pinch-zoom, pan) with touch-action so gestures
//          never scroll the host page; every interaction family runs in both
//          worlds — device-bound families run in their project and skip the
//          other with a cited in-code reason.
//   F52  — touch-only parity: >= 44px tap targets, no hover-only affordances.
//   §6.2 — tap-vs-drag threshold; touch-action: none kills the browser's
//          double-tap zoom; no-host-scroll during canvas gestures.
//   C1/F07 — districts are compound containers: not grabbable (drag tests
//          target a leaf node).
//   R1/R4 — M1 drag is view-local (cytoscape's own positions are the
//          projection): the header's core strings never change on drag.
//
// Canvas content is read/aimed through the DEV-HARNESS-ONLY
// window.__TME_E2E__ hook (see src/app/app.ts): read-only projections of the
// cytoscape model (renderedPosition/zoom/pan). The hook is registered by the
// harness app only — the ST entry never ships it.
import { chromium, devices, expect, test, type CDPSession, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  edgeLineStyle(id: string): string | null;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

const EMIYA_ID = 'emiya-residence';
const EMIYA_LABEL = 'Emiya Residence';

// FX1 leaf the drag tests move (C1/F07: districts are never dragged).
// Background/gesture points are canvas-relative px, probed against the fixed
// desktop (1280x720) and phone (390x664) viewports: clear of every node
// center, edge, compound-parent box, the top-right chip and the bottom-left
// layer switcher — a tap there targets cy itself (the background).
const BG_POINT: Point = { x: 10, y: 100 };
const PAN_START: Point = { x: 30, y: 140 };
const PINCH_CENTER: Point = { x: 195, y: 150 };

const isPhone = (): boolean => test.info().project.name === 'phone';

const readRenderedPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId): { x: number; y: number } | null => {
    // page.evaluate callbacks are serialized: the hook lookup is inlined
    // (same discipline as canvas.e2e-spec.ts), no closures cross the wire.
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedPosition(nodeId);
  }, id);

const readZoom = (page: Page): Promise<number> =>
  page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.zoom();
  });

const readPan = (page: Page): Promise<{ x: number; y: number }> =>
  page.evaluate((): { x: number; y: number } => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.pan();
  });

const readScrollY = (page: Page): Promise<number> => page.evaluate(() => window.scrollY);

/** Screen-px point of a node's rendered center (seam read + canvas box). */
const nodeScreenPoint = async (page: Page, id: string): Promise<Point> => {
  const pos = await readRenderedPosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return { x: box.x + pos.x, y: box.y + pos.y };
};

/** Canvas-relative point → screen-px point. */
const canvasPoint = async (page: Page, rel: Point): Promise<Point> => {
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return { x: box.x + rel.x, y: box.y + rel.y };
};

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const activatePoint = async (page: Page, point: Point): Promise<void> => {
  if (isPhone()) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The `phone` playwright project runs the iPhone 13 device on WebKit
 * (devices['iPhone 13'] sets defaultBrowserType: 'webkit' and the frozen
 * playwright.config.ts overrides no browser), and a CDP session exists only
 * in Chromium. Playwright's touchscreen API has no drag/multi-touch
 * primitives, so the input-pipeline touch gestures below — CDP
 * Input.dispatchTouchEvent, as the packet mandates — run on a Chromium page
 * with the SAME iPhone 13 emulation (same 390x664 viewport, hasTouch,
 * isMobile). Everything that plain tap APIs cover stays on the project page.
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
 * One-finger drag synthesized through CDP Input.dispatchTouchEvent — the
 * touchscreen API has no drag primitive. A `drift` under the tap threshold is
 * exactly the §6.2 tap-vs-drag test: cytoscape's touchTapThreshold
 * (installed @types/cytoscape 3.21.9, Core options) defaults to 8 px on
 * touch (desktopTapThreshold defaults to 4 px).
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
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

/** Assert a rendered position read is usable, typed without non-null checks. */
const expectPosition = (pos: { x: number; y: number } | null): { x: number; y: number } => {
  if (pos === null) throw new Error('node not rendered (unmounted or absent)');
  return pos;
};

/**
 * Two-finger pinch synthesized through CDP: two touchPoints touching down,
 * spreading apart `from` → `to` px around the center, lifting. Pinch-zoom is
 * native touch under userZoomingEnabled (there is NO pinchToZoom option —
 * verified against the installed declarations and runtime).
 */
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
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

test.describe('canvas interactions (PKG B-103)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
  });

  test('tap/click a node selects it (chip shows its label); background tap clears (D2/F52/D53)', async ({ page }) => {
    const chip = page.getByTestId('tme-selection-chip');
    await expect(chip).toBeHidden(); // nothing selected before any tap

    await activatePoint(page, await nodeScreenPoint(page, EMIYA_ID));
    // R3: the chip is template-bound to the selectedNode signal — the tap
    // handler wrote the signal, the template followed.
    await expect(chip).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(EMIYA_LABEL);

    await activatePoint(page, await canvasPoint(page, BG_POINT));
    await expect(chip).toBeHidden(); // background tap → selectedNode(null)
  });

  test('a tap with a few px of drift still selects — under the tap threshold (§6.2, D53/F52)', async ({ page }) => {
    // Touch tap threshold default is 8 px (installed @types/cytoscape 3.21.9,
    // touchTapThreshold); the desktop mouse threshold is 4 px
    // (desktopTapThreshold). Drift stays under the operative per-device
    // threshold — 5 px on touch (which exceeds the desktop 4, proving the
    // touch threshold governs), 3 px on mouse.
    const drift = isPhone() ? 5 : 3;
    const tapWithDrift = async (p: Page): Promise<void> => {
      const start = await nodeScreenPoint(p, EMIYA_ID);
      if (isPhone()) {
        const cdp = await p.context().newCDPSession(p);
        await cdpTouchDrag(cdp, start, drift, 0);
      } else {
        await p.mouse.move(start.x, start.y);
        await p.mouse.down();
        await p.mouse.move(start.x + drift, start.y, { steps: 2 });
        await p.mouse.up();
      }
      await expect(p.getByTestId('tme-selection-chip')).toBeVisible();
      await expect(p.getByTestId('tme-selection-label')).toHaveText(EMIYA_LABEL);
    };
    if (isPhone()) await withPhoneChromiumPage(tapWithDrift);
    else await tapWithDrift(page);
  });

  test('desktop: mouse drag moves the node view-locally; header strings untouched (R1/R4, D2, C1/F07)', async ({ page }) => {
    // Mouse-drag family runs on the desktop project; the touch-drag twin is
    // the phone-only test below (D53: one family, both worlds).
    test.skip(isPhone(), 'mouse-drag runs on desktop; touch-drag is the phone twin');
    const before = expectPosition(await readRenderedPosition(page, EMIYA_ID));
    const start = await nodeScreenPoint(page, EMIYA_ID);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 90, start.y + 10, { steps: 8 });
    await page.mouse.up();

    const after = expectPosition(await readRenderedPosition(page, EMIYA_ID));
    expect(after.x).toBeGreaterThan(before.x + 50);
    // R1/R4: the move is view-local — no facade write, so the snapshot's core
    // strings (header location = the pin's label) are verbatim unchanged.
    await expect(page.getByTestId('tme-location')).toHaveText(EMIYA_LABEL);
    // D2: a drag is not a tap — no selection signal was written on the way.
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
  });

  test('phone: touch-drag moves the node (D53/F52)', async () => {
    // Touch-drag family runs on the touch project; the mouse twin above runs
    // on desktop.
    test.skip(!isPhone(), 'touch-drag needs the touch-emulated project');
    await withPhoneChromiumPage(async (page) => {
      const before = expectPosition(await readRenderedPosition(page, EMIYA_ID));
      const cdp = await page.context().newCDPSession(page);
      await cdpTouchDrag(cdp, await nodeScreenPoint(page, EMIYA_ID), 60, 10);
      const after = expectPosition(await readRenderedPosition(page, EMIYA_ID));
      expect(after.x).toBeGreaterThan(before.x + 40);
      // §6.2: the canvas drag never scrolled the host page.
      expect(await readScrollY(page)).toBe(0);
    });
  });

  test('phone: pinch-zoom changes the cy zoom and never scrolls the host page (D53, §6.2)', async () => {
    test.skip(!isPhone(), 'pinch is a two-finger touch gesture (D53)');
    await withPhoneChromiumPage(async (page) => {
      const zoomBefore = await readZoom(page);
      const cdp = await page.context().newCDPSession(page);
      await cdpPinch(cdp, await canvasPoint(page, PINCH_CENTER), 120, 175);
      await expect.poll(() => readZoom(page)).not.toBe(zoomBefore);
      // §6.2/D53: touch-action: none on the canvas host — the two-finger
      // gesture zoomed the MAP, never the page.
      expect(await readScrollY(page)).toBe(0);
    });
  });

  test('phone: one-finger pan on empty canvas changes the cy pan; page scroll stays 0 (D53, §6.2)', async () => {
    test.skip(!isPhone(), 'one-finger pan is a touch gesture (D53)');
    await withPhoneChromiumPage(async (page) => {
      const panBefore = await readPan(page);
      const cdp = await page.context().newCDPSession(page);
      await cdpTouchDrag(cdp, await canvasPoint(page, PAN_START), 110, 40);
      await expect
        .poll(async () => (await readPan(page)).x)
        .not.toBe(panBefore.x);
      expect(await readScrollY(page)).toBe(0);
    });
  });

  test('phone: rapid double-tap leaves no page zoom/scroll artifacts; a double-tap is two taps (§6.2)', async ({ page }) => {
    test.skip(
      !isPhone(),
      'double-tap page zoom is a touch-browser behavior (§6.2); desktop has no such gesture',
    );
    const point = await nodeScreenPoint(page, EMIYA_ID);
    await page.touchscreen.tap(point.x, point.y);
    await page.touchscreen.tap(point.x, point.y);
    // touch-action: none suppressed the browser's double-tap page zoom —
    // no scroll/viewport artifacts.
    expect(await readScrollY(page)).toBe(0);
    // Selection state is sane: two tap events fired, the second re-selected
    // the same node — the chip shows its label once.
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(EMIYA_LABEL);
  });
});
