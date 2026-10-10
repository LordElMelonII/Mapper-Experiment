// tests/e2e/label-culling.e2e-spec.ts — PKG B-113: label culling as a
// deliberate, TESTED behavior (R18): at zoom-out beyond a FIT-RELATIVE
// threshold (current fit zoom × 0.6 — the service constant LABEL_CULL_FACTOR
// is the authority, src/app/graph/graph.service.ts) every node gains ONE
// class, `tme-cull-labels`, and the stylesheet hides map-content labels with
// it; zooming back in restores them.
//
// Cited IDs:
//   §5 M4 / §6.1 — label culling is the dense-overview readability +
//          draw-cost mitigation, implemented deliberately (not a renderer
//          side effect).
//   B-107 (binding gotcha) — `min-zoomed-font-size` is a hide-floor, not an
//          upscale-floor, and badge/small-label styles must never set it:
//          the cull is a CLASS + stylesheet policy instead, which is exactly
//          what makes it assertable at runtime (the hide-floor is
//          renderer-internal). The stylesheet sets no hide-floor anywhere.
//   F52/D53 — every interaction family runs at BOTH viewports: desktop
//          drives zoom with the mouse wheel, the phone project drives it
//          through the in-test CDP Chromium twin with the SAME iPhone 13
//          emulation (the phone project itself is WebKit — CDP touch
//          gestures need Chromium; tests/e2e/interactions.e2e-spec.ts
//          pattern).
//   D2     — the cy `zoom` event is high-frequency (pinch streams it): the
//          handler writes NO signals; these specs double as the live proof
//          that zooming never disturbs selection state (the chip survives).
//   R1/D7  — WHICH labels stay visible while the blanket class is on is
//          stylesheet DATA (the later node.tme-pin / node.tme-selected
//          .tme-cull-labels → 'text-opacity': 1 entries in GRAPH_STYLESHEET
//          — cytoscape applies matching rules in declaration order, last
//          match per property wins), not per-element code branching. B-115
//          (P2-M4 verifier gate fix): the B-113 BADGE exemption is GONE —
//          badges carry the blanket class and cull WITH all map content,
//          because a culled badge is a visible-but-dead affordance (its tap
//          anchor sits inside the host node's touch reach below z ≈ 0.28
//          touch while its text renders at ≈2–3 px). The class assertions
//          below therefore pin the STRUCTURE (one blanket class on all
//          nodes); rendered label opacity is the stylesheet's business and
//          deliberately has no read seam (R2/R4).
//   FX1    — the fixture map; D70 keeps its ids frozen, so the projected
//          node-id list below is stable (the harness displayMap adds only
//          the B-111 curve demo EDGE, never a node).
//
// Canvas content is read/aimed through the DEV-HARNESS-ONLY
// window.__TME_E2E__ hook (see src/app/app.ts): read-only projections of the
// cytoscape model. The hook is registered by the harness app only — the ST
// entry never ships it.
import { chromium, devices, expect, test, type CDPSession, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeHasClass(id: string, cls: string): boolean;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  zoom(): number;
}

const CULL_CLASS = 'tme-cull-labels';
const PIN_ID = 'emiya-residence';
const BADGE_ID = 'tme-badge-arc-fuyuki-station-misaki-town';
/** Map-content probes: a hub leaf and a compound parent (both must cull). */
const STATION_ID = 'fuyuki-station';
const DISTRICT_ID = 'district-miyama';
/** A leaf that is NOT the pin — the select-then-cull probe. */
const SELECTED_ID = 'kotomine-church';
const STATION_LABEL = 'Fuyuki Station';

/**
 * Every node projected for FX1's first layer (13 leaves + 2 districts,
 * data/worlds/fuyuki.ts) plus the B-107 badge pseudo-node — the "no node is
 * culled at the default fit" cell asserts over ALL of them, so a cull leak
 * onto any single node fails the cell.
 */
const ALL_PROJECTED_NODE_IDS: readonly string[] = [
  'district-miyama',
  'district-shinto',
  'emiya-residence',
  'shopping-district',
  'homurahara-academy',
  'matou-residence',
  'tohsaka-residence',
  'ryuudou-temple',
  'outskirts',
  'fuyuki-bridge',
  'fuyuki-station',
  'harbor',
  'kotomine-church',
  'ghost-house',
  'einzbern-castle',
  BADGE_ID,
];

/** Mirror of the service's LABEL_CULL_FACTOR (see file-top comment). */
const FIT_CULL_FACTOR = 0.6;

// Desktop wheel driving: positive deltaY = zoom OUT (installed runtime,
// cytoscape.esm.mjs:26636 `diff = delta / -250` → zoom × 10^diff). Wheel
// ticks move zoom a few percent each, so the bounded loop converges well
// under the cap.
const WHEEL_STEP = 480;
const MAX_WHEELS = 60;
// Phone pinch driving: one gesture's distance ratio ≈ zoom ratio, so a
// 150→60 closing pinch is ~×0.4 per gesture; the cap leaves wide margin.
const MAX_GESTURES = 12;

// Canvas-relative points probed against the phone twin's 390x664 stage:
// clear of nodes, the chip and the layer switcher.
const PINCH_CENTER: Point = { x: 195, y: 150 };

const isPhone = (): boolean => test.info().project.name === 'phone';

/**
 * PKG B-142 (REPAIRS R-2) re-baseline: the phone boot now stages AT the pin
 * (the boot-posture zoom, the pin-centered viewport). This spec's aims are
 * exhaustively scanned against the PRE-PACKET WORLD-FIT boot viewport
 * (zoom = 0.282... on FX1 — the whole world in view: the castle at x=-380,
 * the station cluster at x=560+ — all out of the narrow pin-centered view),
 * so the phone cells restore exactly that viewport first by tapping the
 * rail's Fit — the packet's own "explicit full-world ask" (§R2). Desktop
 * never arms the posture (the wide gate mirrors D81's 700px breakpoint),
 * so its boot is byte-unchanged and this is a no-op. Booted twins (the
 * in-test Chromium phone pages) take the same restore. Aim math and every
 * assertion are untouched — the R23 in-box-content law stands throughout.
 */
const restoreBootViewport = async (page: Page): Promise<void> => {
  if (isPhone()) await page.getByTestId('tme-zoom-fit').tap();
};

const readZoom = (page: Page): Promise<number> =>
  page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.zoom();
  });

const readNodeHasClass = (page: Page, id: string, cls: string): Promise<boolean> =>
  page.evaluate(([nodeId, className]: [string, string]): boolean => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeHasClass(nodeId, className);
  }, [id, cls]);

const readRenderedPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId): { x: number; y: number } | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedPosition(nodeId);
  }, id);

/** Screen-px point of a node's rendered center (re-read on every call —
 * zooming moves it; the drivers re-aim before each tap). */
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
 * (devices['iPhone 13'] sets defaultBrowserType: 'webkit'), and a CDP
 * session exists only in Chromium. The pinch gesture below — CDP
 * Input.dispatchTouchEvent, as the packet mandates — runs on a Chromium page
 * with the SAME iPhone 13 emulation (same 390x664 viewport, hasTouch,
 * isMobile), so the phone run exercises the real fit-relative threshold of
 * its own stage (fit ≈0.30, not the desktop's ≈0.84).
 */
const withPhoneChromiumPage = async (run: (page: Page) => Promise<void>): Promise<void> => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readRenderedPosition(page, PIN_ID)).not.toBeNull();
    await run(page);
  } finally {
    await browser.close();
  }
};

/**
 * Two-finger pinch through CDP (the interactions.e2e-spec.ts helper): two
 * touchPoints down, spread changing `from` → `to` px around the center,
 * lift. Pinch-zoom is native touch under userZoomingEnabled.
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

/**
 * Drive zoom OUT (user gesture only — never a programmatic zoom, which would
 * not prove the cull handler) until `zoom() < threshold`. Desktop: mouse
 * wheel over the canvas (hover first — the wheel zooms about the cursor).
 * Phone twin: the CDP pinch with the fingers CLOSING (spread 150 → 60) —
 * the zoom-out gesture; the final assertion pins the direction, not the
 * wording. The threshold is the test-side mirror of the service's cullZoom:
 * both are computed as fitZoom × 0.6 from the same observed fit zoom (the
 * app's own mount fit), so the crossings line up exactly.
 */
const zoomOutPast = async (page: Page, threshold: number): Promise<void> => {
  if (isPhone()) {
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < MAX_GESTURES && (await readZoom(page)) >= threshold; i++) {
      await cdpPinch(cdp, await canvasPoint(page, PINCH_CENTER), 150, 60);
    }
  } else {
    const box = await page.getByTestId('tme-canvas').boundingBox();
    if (box === null) throw new Error('canvas host not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < MAX_WHEELS && (await readZoom(page)) >= threshold; i++) {
      await page.mouse.wheel(0, WHEEL_STEP);
    }
  }
  expect(await readZoom(page), 'the zoom-out driver must cross below the cull threshold').toBeLessThan(
    threshold,
  );
};

/** Drive zoom back IN (user gesture only) until `zoom() >= threshold`. */
const zoomInPast = async (page: Page, threshold: number): Promise<void> => {
  if (isPhone()) {
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < MAX_GESTURES && (await readZoom(page)) <= threshold; i++) {
      await cdpPinch(cdp, await canvasPoint(page, PINCH_CENTER), 60, 150);
    }
  } else {
    const box = await page.getByTestId('tme-canvas').boundingBox();
    if (box === null) throw new Error('canvas host not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < MAX_WHEELS && (await readZoom(page)) <= threshold; i++) {
      await page.mouse.wheel(0, -WHEEL_STEP);
    }
  }
  expect(await readZoom(page), 'the zoom-in driver must cross back above the cull threshold').toBeGreaterThanOrEqual(
    threshold,
  );
};

test.describe('label culling (PKG B-113)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readRenderedPosition(page, PIN_ID)).not.toBeNull();
  });

  test('at the default fit NO node carries the cull class — labels visible on every viewport (fit-relative comprehension guarantee)', async ({
    page,
  }) => {
    // §6.1's comprehension guarantee: the DEFAULT view is never culled — on
    // EITHER stage. This cell runs on both projects: the desktop fits at
    // ≈0.84 zoom, the phone at ≈0.30, and neither culls because the
    // threshold is fit-relative (fitZoom × 0.6). An absolute floor could not
    // pass this cell on both viewports — that is what makes the
    // fit-relative choice provable here.
    //
    // Sanity anchors first: the pin and the badge ARE projected (so the
    // class assertions below are non-vacuous).
    expect(await readNodeHasClass(page, PIN_ID, 'tme-pin')).toBe(true);
    expect(await readNodeHasClass(page, BADGE_ID, 'tme-badge')).toBe(true);
    for (const id of ALL_PROJECTED_NODE_IDS) {
      expect(await readNodeHasClass(page, id, CULL_CLASS), `node ${id} must not be culled at the default fit`).toBe(
        false,
      );
    }
  });

  test('zooming out past the threshold culls map-content labels; pin, badge and the selected node carry the same blanket class (exemptions are stylesheet data)', async ({
    page,
  }) => {
    const run = async (p: Page): Promise<void> => {
      // Select a non-pin leaf at the default fit (a clean hit target), then
      // zoom out — so the culled state is observed WITH a selection held.
      // The selection tap comes FIRST: on the phone stage it grows the route
      // panel (the route to Kotomine Church renders), which re-fits the view
      // (B-106 resize ruling) — reading the threshold after that settle keeps
      // it in lockstep with the service's re-based cullZoom (FX1's fit is
      // width-bound, so the value itself is unchanged, but the order is
      // honest about what the tap can move).
      await activatePoint(p, await nodeScreenPoint(p, SELECTED_ID));
      await expect(p.getByTestId('tme-selection-chip')).toBeVisible();

      const threshold = (await readZoom(p)) * FIT_CULL_FACTOR;

      // R28 R-9r (phone-only staging, cited): the phone stage shrank
      // 505→445px between the R-5 era and R-9 (R-6's root inset −8px +
      // R-7's legend rail row −52px — the B-148r bisect's measured pair),
      // so the selection's auto-opened route sheet (B-105) now tops its
      // rail at y≈133.5 while the pinch line (PINCH_CENTER y=150
      // canvas-relative) crosses it: the CDP fingers land on the sheet's
      // title/rail (HTML), cy never sees the gesture, and the zoom never
      // crosses the threshold (at the 505 stage the rail topped ≈151.5 —
      // 1.5px below the pinch, which is why this cell passed at post-R-5).
      // Collapse it first — the standing tapAimed-guard idiom (rail click
      // + aria-expanded assert + 200 ms); a panel open/close moves no
      // viewport (D91), so the threshold read stays in lockstep, and the
      // collapsed rail sits at ~401, clear of the pinch. Desktop never
      // runs this (its floater never crossed the pinch line).
      if (
        isPhone() &&
        (await p.getByTestId('tme-sheet-rail').getAttribute('aria-expanded')) === 'true'
      ) {
        await p.getByTestId('tme-sheet-rail').click();
        await expect(p.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'false');
        await p.waitForTimeout(200); // the collapse re-renders — a gesture in the same tick can still hit the body
      }

      await zoomOutPast(p, threshold);

      // ONE blanket class on ALL nodes (ruling 2): map content (a hub leaf
      // and a compound parent), the pin, the badge pseudo-node and the
      // selected node all carry tme-cull-labels. WHICH labels stay VISIBLE
      // while it is on is the stylesheet's data — the later
      // node.tme-pin / node.tme-selected .tme-cull-labels → 'text-opacity': 1
      // entries in GRAPH_STYLESHEET (graph.service.ts), with no
      // min-zoomed-font-size anywhere (B-107). Since B-115 there is NO badge
      // exemption: the culled badge hides with all map content (the dead
      // affordance the verifier proved is gone). The spec pins the
      // structure; rendered opacity has no read seam by design (R2/R4).
      expect(await readNodeHasClass(p, STATION_ID, CULL_CLASS)).toBe(true);
      expect(await readNodeHasClass(p, DISTRICT_ID, CULL_CLASS)).toBe(true);
      expect(await readNodeHasClass(p, PIN_ID, CULL_CLASS)).toBe(true);
      expect(await readNodeHasClass(p, BADGE_ID, CULL_CLASS)).toBe(true);
      expect(await readNodeHasClass(p, SELECTED_ID, CULL_CLASS)).toBe(true);

      // D2, live: the high-frequency zoom stream wrote no signals — the
      // selection held through the entire zoom-out.
      await expect(p.getByTestId('tme-selection-chip')).toBeVisible();
      await expect(p.getByTestId('tme-selection-label')).toHaveText('Kotomine Church');
    };
    if (isPhone()) await withPhoneChromiumPage(run);
    else await run(page);
  });

  test('zooming back in past the threshold clears the cull class (labels restore)', async ({ page }) => {
    const run = async (p: Page): Promise<void> => {
      const threshold = (await readZoom(p)) * FIT_CULL_FACTOR;
      await zoomOutPast(p, threshold);
      expect(await readNodeHasClass(p, STATION_ID, CULL_CLASS)).toBe(true);

      await zoomInPast(p, threshold);
      // The class is one blanket toggle (ruling 2): every node clears
      // together — map content, pin and badge alike (the pin's label was
      // exempt from HIDING while culled, the badge culls with all content
      // per B-115; none of them was ever exempt from the CLASS).
      expect(await readNodeHasClass(p, STATION_ID, CULL_CLASS)).toBe(false);
      expect(await readNodeHasClass(p, PIN_ID, CULL_CLASS)).toBe(false);
      expect(await readNodeHasClass(p, BADGE_ID, CULL_CLASS)).toBe(false);
    };
    if (isPhone()) await withPhoneChromiumPage(run);
    else await run(page);
  });

  test('a culled node stays tappable: tapping it selects it, and it then carries BOTH tme-cull-labels and tme-selected (cascade, not class removal)', async ({
    page,
  }) => {
    const run = async (p: Page): Promise<void> => {
      const threshold = (await readZoom(p)) * FIT_CULL_FACTOR;
      await zoomOutPast(p, threshold);
      expect(await readNodeHasClass(p, STATION_ID, CULL_CLASS)).toBe(true);

      // A culled LABEL is not a hit target — the node body still is (F52's
      // 44px tap footprint is never hidden). Re-aim at the station's CURRENT
      // rendered position (zoom-out moved it), then tap.
      await activatePoint(p, await nodeScreenPoint(p, STATION_ID));
      await expect(p.getByTestId('tme-selection-chip')).toBeVisible();
      await expect(p.getByTestId('tme-selection-label')).toHaveText(STATION_LABEL);

      // B-133 (D91) re-derivation: the selection grows the route sheet as a
      // stage OVERLAY — the stage never resizes and the viewport never moves
      // (the zero-motion doctrine), so NO refit fires and the zoom STAYS
      // below the cull threshold through the selection. The pre-D91 phone
      // branch (wait for the resize refit to un-cull, then re-cull to prove
      // the cascade) observed a resize that no longer exists. Under D91 the
      // culled state simply persists through the tap — the cascade asserts
      // below prove BOTH classes on the still-culled, now-selected node at
      // both viewports with the same flow.

      // The tap path removes NO classes: the selected node carries BOTH —
      // its label stays visible only through the later
      // node.tme-selected.tme-cull-labels stylesheet entry (the exemption is
      // cascade data, ruling 3).
      expect(await readNodeHasClass(p, STATION_ID, CULL_CLASS)).toBe(true);
      expect(await readNodeHasClass(p, STATION_ID, 'tme-selected')).toBe(true);
    };
    if (isPhone()) await withPhoneChromiumPage(run);
    else await run(page);
  });
});
