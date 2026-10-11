// tests/e2e/pin-affordance.e2e-spec.ts — PKG B-143 (docs/ui-restyle/
// REPAIRS.md §R3): the pin-setting node menu — the app's FIRST
// setCurrentLocation caller — at BOTH playwright projects (desktop +
// emulated phone with touch) per D53/F52.
//
// Cited IDs:
//   R3 (REPAIRS.md) — long-press (touch) / context-click (pointer) on a node
//           opens the node menu; Set = `facade.setCurrentLocation(nodeId)`,
//           Clear = `setCurrentLocation(null)`; refused sets render the
//           core's own words and leave the pin unmoved (C30/C32); no
//           drag-the-pin, no auto-set ever (D10 fences).
//   REPAIRS §R3 (R4 names the pattern) — the empty-origin state renders the sentence
//           "Set where the party is to route from here." instead of the
//           dangling "→ New place" arrow (same slot, its own testid).
//   D38    — moving/clearing the pin is silent core-side; the UI answer is
//           the projection: the `tme-pin` class rides the rebuild (the
//           canvas-spec hook conventions), the header triplet re-reads the
//           snapshot, and the route computed re-runs (graphRevision).
//   C1/F27/D58 — leaf nodes only; a container node's set refuses with the
//           field-precise words ("containers never hold the pin").
//   D75    — the saved-plane gate: a fresh UNSAVED editor node refuses with
//           "save the map first".
//   F52/D53 — both arms are >= 44px touch targets; every menu open runs
//           touch-first on the phone project (the CDP Chromium twin — cy
//           `taphold` needs a HELD touch the touchscreen API cannot
//           synthesize) and pointer-first on desktop (context-click); all
//           aims through rendered positions via the DEV-HARNESS-ONLY
//           window.__TME_E2E__ seam — real pixels, both worlds.
//   B-106  — the edge hit radius (width/2 + (touch 24 : mouse 8)/zoom
//           model units) the container-refusal aim must clear alongside
//           the child bodies, at the cell's per-project zoom.
//   addendum-d (B-143r resume) — "any tap elsewhere" includes viewer
//           chrome: the component's document-level pointerdown dismissal
//           (the selection-chip tap in the dismissal-contract cell).
//   B-115  — the compound-box refusal aim clears every child's touch-slop
//           reach IN PAGE, never spec-magic: the aim's model span to the
//           nearest child is asserted against the hook's live zoom before
//           the gesture (the arc-editing seam convention).
//   B-D4 (PROPOSAL-D §3.1) — the node menu, generalized: the six object
//           verbs (Rename · Set as party location · Connect… · Details ·
//           Detach from arcs · Delete) on editor-mode LIBRARY nodes, {Set}
//           alone in view mode and on waypoints; every verb routes an
//           EXISTING command path (R2); refusals render the core's own
//           words in-menu (C30) and keep the surface open; the menu-open
//           gesture writes NO selection — the authoring verbs select-first
//           themselves (the D-3 guard-order law); Rename re-opens D-3's
//           popover SEEDED with the live label; Details/Connect yield the
//           naming state + latch so the panel's preserved seeding path
//           runs; Detach/Delete are the panel arms' exact commands (F54/
//           F46, no confirm — D10).
import { chromium, devices, expect, test, type CDPSession, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeHasClass(id: string, cls: string): boolean;
  selectedNodeId(): string | null;
  zoom(): number;
  pan(): { x: number; y: number };
  edgeIds(): string[];
  edgeData(id: string): { source: string; target: string } | null;
  connectMode(): boolean;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

const BOOT_PIN_ID = 'emiya-residence'; // the harness boot pin (FX1, D40's explicit pick)
const SET_TARGET_ID = 'shopping-district'; // the Set arm's leaf
const ROUTE_TARGET_ID = 'outskirts'; // the route-from cell's second node
const CONTAINER_ID = 'district-miyama'; // the C1/F27 refusal's compound parent
const ABOVE_BAND_NODE_ID = 'kotomine-church'; // B-143r: the dismissal-contract cell's above-band node — rendered y≈164.8 on the 445px phone stage (R28 R-9r; the 505-era y≈195), inside the re-raised one-leg rail band (top ≈152) until stageSheetAway folds it
const SHORT_SHEET_NODE_ID = 'matou-residence'; // B-143r: a one-leg selection from the boot pin — its short sheet leaves the above-band node pressable once folded (R28 R-9r: matou renders y≈200 on the 445px stage)
const NEW_PLACE = 'New place'; // C23 default label of an unsaved placed node

/**
 * The unsaved-node cell's PLACEMENT point — off the FX1 world's upper-left
 * edge (world bbox min x/y = 0, data/worlds/fuyuki.ts): no adjacent content,
 * and its rendered slot clears the editor auto-surfaces on both projects
 * (a fresh placement auto-floats the route floater — B-141's bottom-left
 * stagger when the property panel is open — and opens the property surface;
 * the aim sits in the stage's upper band, above every bottom-anchored
 * floater). Measured landings through the in-page seam, both projects:
 *   desktop (world fit: pan ≈ 446/84, zoom 0.954, canvas 152..1280×720):
 *     screen (359.4, 45.5) — in-canvas, ~44px below the canvas top edge,
 *     ~350px from the nearest node's rendered center. B-143r: the prior
 *     draft aim (x:-250, y:-90) measured (359.4, −2.2) — 2px ABOVE the top
 *     edge, so the click never reached the canvas and the cell placed
 *     nothing (the 'placed node not selected' finding; y −90 → −40).
 *   phone (Fit-restored world fit: pan ≈ 160/171, zoom 0.2822, canvas
 *     390×505): screen (89.5, 159.5) — in-canvas, 58px from the nearest
 *     node (Einzbern Castle), clear of node hit-reach and of the narrow
 *     rail strip (canvas y 461+).
 * `modelScreenPoint` asserts the live landing in-canvas before every tap
 * (B-143r: this cell's silent failure mode was an off-canvas click).
 * B-D1 re-baseline (PROPOSAL-D §2.1 + B-D1, R23 staged-geometry): at >=1024
 * the cell places at the SAME hole, LOWER (y −40 → 120) — the shell's header
 * band homes the editor-mode pill at the canvas's top-left, and the −40
 * placement rendered the placed node INSIDE that band (measured live: node
 * y≈12, the parked menu y 26–111 over the pill y 8–62, z-17 by design), so
 * the mode-exit tap at the cell's end could never land. At y 120 the node
 * renders y≈179 and the parked menu (y 193–278) clears the pill and every
 * floater. The PHONE ARM KEEPS THE VETTED −40 POINT byte-identical — its
 * clear-of-content vetting (the B-109 scan) stands and the phone chrome
 * never moves under the shell (sub-1024 keeps the rail).
 */
const PLACE_MODEL_POINT: { x: number; y: number } = { x: -250, y: -40 };

/** B-D1 (PROPOSAL-D §2.1 + B-D1): the placement point for the live regime —
 *  the shell's lowered point at >=1024 (clear of the header band's pill,
 *  measured above), the vetted −40 hole below it (the phone twin included:
 *  its clear-of-content geometry is untouched law). */
const placeModelPointFor = (page: Page): { x: number; y: number } =>
  (page.viewportSize()?.width ?? 0) >= 1024 ? { x: -250, y: 120 } : PLACE_MODEL_POINT;

/**
 * The container-refusal aim: a point INSIDE the Miyama district's compound
 * body that clears every CHILD body, every edge LINE, and the body's own
 * border at the cell's live zoom — on BOTH hit regimes (touch 24px slop on
 * the phone twin, mouse 8px on desktop; B-106's documented radius: an edge
 * wins within width/2 + (touch 24 : mouse 8)/zoom MODEL units of the
 * rendered line, a node within its 44px body + (touch 8 : mouse 2)/zoom).
 * B-143r second re-aim (deliberate, cited — the resume debug): the prior
 * hole (115,215) cleared every CHILD (≥38 model units, asserted in-page)
 * but sat ~1.6 units off the emiya→homurahara CHORD and ~9.6 off
 * matou→emiya — at the phone's zoom the touch edge radius
 * (2 + 24/0.55 ≈ 45.5 model units) swallowed the press, cy resolved an
 * EDGE (edges paint z-above compound parents, and the hit loop gives the
 * edge near[0]), and the node-scoped taphold never fired (measured: no
 * menu, selection null). ryuudou-temple (150,470) is ALSO a Miyama child —
 * the body extends to y≈470, and its lower-left chamber is the one region
 * clear of every chord: (72,458) spans ≥43.9 model units from the nearest
 * edge segment (ryuudou→outskirts) and 78.9 from the nearest child
 * (ryuudou), ≥12 units inside the children envelope so the parent's
 * rounded-rectangle body owns the point outright. The zoom that makes the
 * phone's fat touch slop fit those clearances is ×1.25⁵ from the world
 * fit (z≈0.861: edge radius 29.9, child radius 31.3 — margins 14/47.6
 * model units); the desktop viewport cannot take ×4 (the aim would leave
 * the canvas bottom) and needs none of it (mouse radius at its ×3,
 * z≈1.864: 6.3/26.3) — so the cell zooms per project. The child-span half
 * is asserted IN PAGE at the live zoom (the authored-scan story fixes only
 * the model-space hole).
 */
const CONTAINER_AIM: { x: number; y: number } = { x: 72, y: 458 };
/** The scan's result: the model distance CONTAINER_AIM → nearest child (rounded down). */
const CONTAINER_AIM_SPAN = 78;

const isPhone = (): boolean => test.info().project.name === 'phone';

// page.evaluate callbacks are SERIALIZED: the hook lookup is inlined in each
// one — no module-scope closures cross the wire (the interactions.e2e-spec.ts
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

/** The tme-pin class is the pin's WHOLE canvas surface (layer-elements.ts:69). */
const hasPinClass = (page: Page, id: string): Promise<boolean> =>
  page.evaluate(
    (nodeId): boolean => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeHasClass(nodeId, 'tme-pin');
    },
    id,
  );

/** B-115 mechanism read, IN PAGE: the container aim's span (passed in —
 *  evaluate callbacks serialize without module closures, the interactions
 *  spec's inlining discipline) clears the touch-slop reach (22·zoom + 8 px)
 *  at the LIVE zoom — a child body can never win findNearestElements at
 *  this viewport. Proven before every compound-box gesture. */
const expectContainerAimClearOfSlop = async (page: Page): Promise<void> => {
  const clear = await page.evaluate((span): boolean => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    const zoom = hook.zoom();
    return span * zoom > 22 * zoom + 8;
  }, CONTAINER_AIM_SPAN);
  expect(clear, 'the container aim clears every child touch-slop reach (B-115, in-page)').toBe(true);
};

/** C5/D75: the selected node's id (the placed node after a place command). */
const readSelectedId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.selectedNodeId();
  });

const settle = (page: Page): Promise<void> =>
  // Wait two animation frames: panel open/close changes the stage size
  // synchronously but the ResizeObserver-driven re-fit runs just before the
  // next paint — reads and gestures inside that window aim stale (the
  // interactions/arc-panel settle precedent).
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Screen-px point of a node's rendered center (seam read + canvas box). */
const nodeScreenPoint = async (page: Page, id: string): Promise<Point> => {
  await settle(page);
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

/** MODEL point → screen-px point (test-side conversion via the seam — R1).
 *  B-143r: the live landing is ASSERTED in-canvas before every tap — this
 *  spec's cell-4 failure mode was a click 2px off the canvas top (never
 *  received by the app, selection stayed null, and the cell failed two steps
 *  later with no signal of the true cause). Loud, not silent. */
const modelScreenPoint = async (page: Page, model: { x: number; y: number }): Promise<Point> => {
  await settle(page);
  const screen = await page.evaluate((m): Point | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    const box = document.querySelector('[data-testid="tme-canvas"]')?.getBoundingClientRect();
    if (box === null || box === undefined) return null;
    return {
      x: box.x + hook.pan().x + m.x * hook.zoom(),
      y: box.y + hook.pan().y + m.y * hook.zoom(),
    };
  }, model);
  if (screen === null) throw new Error('canvas host not visible');
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  const inside =
    screen.x >= box.x &&
    screen.x <= box.x + box.width &&
    screen.y >= box.y &&
    screen.y <= box.y + box.height;
  expect(inside, `aim ${JSON.stringify(model)} lands in-canvas (got ${screen.x},${screen.y})`).toBe(
    true,
  );
  return screen;
};

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const tapPoint = async (page: Page, point: Point): Promise<void> => {
  if (isPhone()) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
};

/** F52/D53: tap on the touch-emulated project, click on desktop (locators). */
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/** B-142 note: the phone cells restore the pre-packet world fit (the boot
 *  posture's pin-centered zoom shows the world without the wrapper's aims
 *  far from the pin). Desktop never arms the posture and its boot is
 *  byte-unchanged — a no-op there. */
const restoreBootViewport = async (page: Page): Promise<void> => {
  if (isPhone()) await page.getByTestId('tme-zoom-fit').tap();
};

/**
 * B-143r re-baseline (deliberate, cited): any canvas gesture that leaves a
 * selection standing — every long-press's own release-tap on the touch
 * twin, tap-selects — auto-opens the route panel (B-105), and on the NARROW
 * regime that panel is a bottom sheet whose pe-auto body covers the stage's
 * lower band (measured at the world-fit phone view: body y=212..505). A
 * canvas gesture aimed inside that band is intercepted by the sheet's own
 * surface — cy never sees it (this debug found the exact element: the
 * sheet's tme-sheet-rail button). The selection chip
 * (tme-selection-chip, the stage-top 44px dismiss, B-103) clears the
 * selection AND collapses the sheet to its 44px rail at y=461..505 —
 * measured — reclaiming the canvas. NOTE (B-143r addendum d): the chip is
 * CHROME — its tap also closes a parked menu (the component's
 * document-level pointerdown dismissal); callers that need a menu standing
 * after clearing the band must re-open it. No-op when nothing is selected
 * (the pointer cxttap path leaves no selection).
 */
const dismissSelection = async (page: Page): Promise<void> => {
  const chip = page.getByTestId('tme-selection-chip');
  if (await chip.isVisible()) await activate(page, 'tme-selection-chip');
};

/**
 * R28 R-9r re-baseline (phone-only staging, cited): the phone stage shrank
 * 505→445px between the R-5 era and R-9 (R-6's root inset −8px + R-7's
 * legend rail row −52px — the B-148r bisect's measured pair), so the
 * one-leg sheet's rail now tops at y≈152 (the 505-era staging constants in
 * this spec said 212) and the above-band node cast renders INSIDE the
 * re-raised band (Kotomine y≈164.8, matou y≈200 — probe-measured): a
 * long-press aimed there grabs the rail, not the node (the close-out
 * gate's :565 failure). Fold the sheet before the press — the standing
 * collapse idiom (the tapAimed guards' rail click + aria-expanded assert +
 * 200 ms); the collapsed rail sits at ~401. Like any chrome tap it closes
 * a parked menu (R-3's chrome-tap dismissal) — call it BEFORE opening a
 * menu, never while one stands. Phone-only: the desktop floater regime
 * has no rail band to fold.
 *
 * Pass-2 hardening (the close-out pass-1 failure at :590): the fold must
 * never RACE the auto-expand — the selection→route→expand pipeline renders
 * a frame or more AFTER the selecting tap, and a fold that reads
 * aria-expanded before the flip silently skips (the press below then hit
 * the expanded rail, and the hold's release toggled the sheet closed —
 * the failure snapshot's folded rail with no menu). So: settle two frames
 * first, and while a selection stands (content is coming), POLL until the
 * expand lands before folding.
 */
const stageSheetAway = async (page: Page): Promise<void> => {
  if (!isPhone()) return;
  await settle(page); // the selection's auto-expand renders a frame later — never race it
  const rail = page.getByTestId('tme-sheet-rail');
  if (await page.getByTestId('tme-selection-chip').isVisible()) {
    await expect
      .poll(() => rail.getAttribute('aria-expanded'), { timeout: 2_000 })
      .toBe('true');
  }
  if ((await rail.getAttribute('aria-expanded')) === 'true') {
    await rail.click();
    await expect(rail).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(200); // the collapse re-renders — a press in the same tick can still hit the body
  }
};

// --- The phone CDP twin (the interactions.e2e-spec.ts machinery) -------------

/**
 * The `phone` project runs the iPhone 13 device on WebKit, where no CDP
 * session exists. A long-press is a HELD touch — the touchscreen API has no
 * hold primitive — so every menu-open below runs on a Chromium page with the
 * SAME iPhone 13 emulation and drives the hold through CDP
 * Input.dispatchTouchEvent, exactly like the established drag/pinch twins.
 */
const withPhoneTwinPage = async (run: (page: Page) => Promise<void>): Promise<void> => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, BOOT_PIN_ID)).not.toBeNull();
    await restoreBootViewport(page);
    await settle(page);
    await run(page);
  } finally {
    await browser.close();
  }
};

/**
 * The long-press itself: touch down on the node, hold PAST cytoscape's
 * taphold timer (the installed runtime's tapholdDuration = 500 ms — the
 * timer fires `taphold` on the down element mid-hold), then lift. The
 * lift's release-`tap` fires the :1646 tap handler on the SAME node —
 * whose dismissal hook is deliberately same-node-exempt, so the menu
 * survives its own open while the tap's normal select branch keeps the
 * pre-packet semantics (the packet's byte-identical rule).
 */
const cdpLongPress = async (cdp: CDPSession, point: Point): Promise<void> => {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: point.x, y: point.y }],
  });
  await sleep(700); // ≥ 500 ms tapholdDuration + margin; the held touch is the gesture
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

/**
 * B-D4 (cell 10): one-finger canvas PAN through CDP — the twin's touch input
 * path (the touchscreen API has no drag primitive), the editor-panel-regime
 * cdpTouchDrag verbatim. The 200 ms HOLD before the release is load-bearing,
 * not cosmetic: a touchEnd landing right after the last move leaves
 * Chromium's gesture recognizer half-armed and the NEXT tap's click is
 * silently dropped (the regime spec's reproduced ~40% finding).
 */
const cdpPanDrag = async (cdp: CDPSession, from: Point, dx: number, dy: number): Promise<void> => {
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
 * Open the node menu AT a screen point — context-click on the pointer
 * project, CDP long-press through the twin on the phone project
 * (D53/F52: one affordance, two worlds, no hover dependency). The menu's
 * visibility is asserted here so every caller starts from an OPEN surface.
 */
const openNodeMenuAt = async (page: Page, point: Point): Promise<void> => {
  if (isPhone()) {
    const cdp = await page.context().newCDPSession(page);
    await cdpLongPress(cdp, point);
  } else {
    // The pointer arm (R3): right-button context-click — cy's own machinery
    // maps it to `cxttap` (verified in the installed runtime: the which===3
    // branch). No tap follows a right-click, so the menu opens WITHOUT the
    // selection side-effect on desktop; on touch the release-`tap` fires the
    // byte-identical node select branch (the exemption above).
    await page.mouse.click(point.x, point.y, { button: 'right' });
  }
  await expect(page.getByTestId('tme-node-menu')).toBeVisible();
};

const openNodeMenuOnNode = async (page: Page, id: string): Promise<void> =>
  openNodeMenuAt(page, await nodeScreenPoint(page, id));

// --- B-D4 (PROPOSAL-D §3.1) helper seams (the established read-only shapes) ---

/** The projection's node labels — the canvas-label assert surface (C23). */
const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeLabels();
  });

/** B-109 ruling 4: every edge id in the projection — the F54/F46 count seam. */
const readEdgeIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.edgeIds();
  });

/**
 * The ids of every arc currently incident to one node — computed IN PAGE from
 * the live edge set (the detach/delete cells' F54/F46 basis). NEVER a
 * hardcoded count: the boot incident sets are staging facts, not contracts
 * (FX1 boots emiya-residence with 7 and shopping-district with 6 incident
 * arcs — read live, asserted as deltas).
 */
const readIncidentEdgeIds = (page: Page, nodeId: string): Promise<string[]> =>
  page.evaluate(
    (id): string[] => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.edgeIds().filter((edgeId) => {
        const data = hook.edgeData(edgeId);
        return data !== null && (data.source === id || data.target === id);
      });
    },
    nodeId,
  );

/** B-118: whether connect mode is on — the banner's state seam. */
const readConnectMode = (page: Page): Promise<boolean> =>
  page.evaluate((): boolean => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.connectMode();
  });

/** The focused element's testid — the focus asserts' poll surface (D53). */
const activeElementTestid = (page: Page): Promise<string> =>
  page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');

/** The focused input's value + selection span (the R-5 replace-wholesale read). */
const activeInputSelection = (
  page: Page,
): Promise<{ value: string; start: number; end: number } | null> =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el instanceof HTMLInputElement
      ? { value: el.value, start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 }
      : null;
  });

// --- B-D4 cell 10: the phone arm's sheet-dodge staging ------------------------
// The cell's canvas gestures run while the MAXIMIZED property sheet stands
// (probe-measured on the 445px phone stage: the sheet tops ≈177px and the
// collapsed route rail rides at ≈133.5..177.5 — the whole lower two-thirds
// of the stage). A node rendered at the world fit (the Set target sits
// y≈225) is UNDER the sheet: a press at its center hits the panel, never
// the canvas. The lift below is the editor-property-panel dodgeBands
// discipline (B-133c) re-homed at this spec's CDP twin.

/** One sheet/chrome band's live DOM rect (null when absent or zero-sized). */
interface BandBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * B-D4 cell 10: the FX1 node ids for the dodge's clear-start scan — the
 * editor-property-panel EPP_NODE_IDS precedent (the hook exposes per-id
 * reads only; the scan needs every rendered center).
 */
const FX1_NODE_IDS = [
  'einzbern-castle',
  'ryuudou-temple',
  'outskirts',
  'emiya-residence',
  'shopping-district',
  'homurahara-academy',
  'matou-residence',
  'tohsaka-residence',
  'fuyuki-bridge',
  'fuyuki-station',
  'harbor',
  'kotomine-church',
  'ghost-house',
  'district-miyama',
  'district-shinto',
] as const;

/** The live covering bands: the sheets (property/route/rail) + the chip. */
const sheetBands = (page: Page): Promise<{ sheets: (BandBox | null)[]; chip: BandBox | null }> =>
  page.evaluate(() => {
    const boxOf = (sel: string): BandBox | null => {
      const el = document.querySelector(sel);
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return r.width === 0 && r.height === 0
        ? null
        : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    return {
      sheets: [
        boxOf('tme-property-panel'),
        boxOf('tme-route-panel'),
        boxOf('[data-testid="tme-sheet-rail"]'),
      ],
      chip: boxOf('[data-testid="tme-selection-chip"]'),
    };
  });

/**
 * B-D4 cell 10 (phone-only, the twin): lift one node's rendered point clear
 * of the covering sheet bands with ONE decisive one-finger PAN. Two rules,
 * both probe-found live:
 *   - DECISIVE drags only (the corrective dy is floored at 40px): a <40px
 *     finger movement classifies as a background TAP in cy's gesture
 *     recognition, and in editor+Node a background tap PLACES a node whose
 *     naming popover then owns the stage (measured: a 15px "correction"
 *     placed 'node-1' and parked its popover exactly over the press aim).
 *   - The STRICT (±4px, the bandCovers predicate) containment check ends
 *     the loop — the map's top clamp keeps the last few px of a lift, and a
 *     margin-chasing corrective loop would tap-place (the rule above).
 * Re-aims FRESH every pass (R23 law: a band open/close re-pans at constant
 * zoom — stale aims bit three times); fails loud with the geometry when the
 * corridor between the chip band and the sheets cannot fit — never a blind
 * press at a covered aim (the B-136 discipline). A clean no-op when the
 * aim already clears.
 */
const liftNodeClearOfSheets = async (page: Page, id: string): Promise<void> => {
  const inside = (y: number, b: BandBox | null, margin: number): boolean =>
    b !== null && y >= b.top - margin && y <= b.bottom + margin;
  for (let attempt = 0; attempt < 3; attempt++) {
    await settle(page);
    const aim = await nodeScreenPoint(page, id);
    const bands = await sheetBands(page);
    if (!bands.sheets.some((b) => inside(aim.y, b, 4))) return; // clear — the press may land
    const tops = bands.sheets.filter((b): b is BandBox => b !== null).map((b) => b.top);
    let dy = (tops.length > 0 ? Math.min(...tops) : aim.y) - 30 - aim.y;
    if (dy > -40) dy = -40; // DECISIVE: a tiny drag classifies as a tap — and places
    const floor = bands.chip !== null ? bands.chip.bottom + 16 : 16;
    if (aim.y + dy < floor) {
      throw new Error(
        `liftNodeClearOfSheets: corridor too narrow (aim y ${Math.round(aim.y)}, dy ${Math.round(dy)}, floor ${Math.round(floor)})`,
      );
    }
    const start = await page.evaluate((ids): Point | null => {
      const hook = (window as unknown as {
        __TME_E2E__?: { nodeRenderedPosition(nodeId: string): { x: number; y: number } | null };
      }).__TME_E2E__;
      if (hook === undefined) return null;
      const host = document.querySelector('[data-testid="tme-canvas"]');
      if (host === null) return null;
      const canvasBox = host.getBoundingClientRect();
      const sheetTops = [
        'tme-property-panel',
        'tme-route-panel',
        '[data-testid="tme-sheet-rail"]',
      ]
        .map((sel) => document.querySelector(sel))
        .filter((el): el is Element => el !== null)
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 || r.height > 0)
        .map((r) => r.top);
      const minSheet = sheetTops.length > 0 ? Math.min(...sheetTops) : canvasBox.bottom;
      const chip = document.querySelector('[data-testid="tme-selection-chip"]');
      const topFloor = chip !== null ? chip.getBoundingClientRect().bottom : canvasBox.top;
      const nodePts = ids
        .map((nodeId: string) => hook.nodeRenderedPosition(nodeId))
        .filter((p): p is { x: number; y: number } => p !== null);
      for (const fx of [0.5, 0.2, 0.8, 0.35, 0.65]) {
        for (let y = topFloor + 12; y < minSheet - 12; y += 6) {
          const x = canvasBox.x + canvasBox.width * fx;
          const el = document.elementFromPoint(x, y);
          if (el === null || el.closest('.tme-canvas') === null) continue;
          // A down on a node GRABS it (editor mode) — clear every center by
          // more than the touch slop (~22·zoom + 8 px; the dodgeBands rule).
          if (nodePts.some((p) => Math.hypot(canvasBox.x + p.x - x, canvasBox.y + p.y - y) < 26)) {
            continue;
          }
          return { x, y };
        }
      }
      return null;
    }, [...FX1_NODE_IDS]);
    if (start === null) throw new Error('liftNodeClearOfSheets: no clear canvas drag start');
    const cdp = await page.context().newCDPSession(page);
    await cdpPanDrag(cdp, start, 0, dy);
  }
  await settle(page);
  const aim = await nodeScreenPoint(page, id);
  const bands = await sheetBands(page);
  if (bands.sheets.some((b) => inside(aim.y, b, 4))) {
    throw new Error(
      `liftNodeClearOfSheets: ${id} stays covered (aim y ${Math.round(aim.y)}, sheet tops ${bands.sheets
        .filter((b) => b !== null)
        .map((b) => Math.round(b.top))
        .join('/')})`,
    );
  }
};

test.describe('pin-setting node menu (PKG B-143, REPAIRS §R3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, BOOT_PIN_ID)).not.toBeNull();
    await restoreBootViewport(page);
    // The harness boot pins on the map's start leaf (the app.ts boot shape):
    // the pre-packet truth every cell builds from.
    await expect.poll(() => hasPinClass(page, BOOT_PIN_ID)).toBe(true);
  });

  // The THROUGH-LINE cell: open on a leaf → Set → the pin class moves, the
  // header triplet follows the snapshot, and the panel routes FROM the new
  // pin (the graphRevision re-route).
  test('set as party location: pin moves, header reflects it, and it routes from there (R3, D38, R1)', async ({ page }) => {
    const cell = async (p: Page): Promise<void> => {
      // Boot: the pin is NOT on the Set target — a leaf menu shows only the
      // Set arm (the Clear arm belongs to the pinned node alone).
      expect(await hasPinClass(p, SET_TARGET_ID)).toBe(false);
      await openNodeMenuOnNode(p, SET_TARGET_ID);
      await expect(p.getByTestId('tme-node-menu-label')).toHaveText('Shopping District');
      await expect(p.getByTestId('tme-node-menu-set')).toBeVisible();
      await expect(p.getByTestId('tme-node-menu-clear')).toHaveCount(0);

      await activate(p, 'tme-node-menu-set');

      // R3: a successful set CONSUMES the menu, then the shared
      // post-mutation sequence re-projects (D38 is silent core-side — the
      // UI answer is the projection: pin class, header, route).
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
      await expect.poll(() => hasPinClass(p, SET_TARGET_ID)).toBe(true);
      await expect.poll(() => hasPinClass(p, BOOT_PIN_ID)).toBe(false);
      // The header triplet renders the snapshot's location verbatim (R1).
      await expect(p.getByTestId('tme-location')).toHaveText('Shopping District');

      // B-143r: the menu's release-tap (the touch twin's same-node
      // exemption) also SELECTED the set target — the B-105 auto-opened
      // route sheet's pe-auto band covers the canvas's lower band and would
      // eat the outskirt tap below. The chip clears it first (the sheet
      // collapses to its 44px rail; the collapse re-opens on the tap's own
      // select of the route target).
      await dismissSelection(p);

      // Route FROM the new pin: tap a second node, the panel renders the
      // core's priced route from the pin to it (authored FX1 minutes —
      // shopping-district → outskirts is the single walk-25 arc).
      await tapPoint(p, await nodeScreenPoint(p, ROUTE_TARGET_ID));
      await expect(p.getByTestId('tme-leg')).toHaveCount(1);
      await expect(p.getByTestId('tme-leg').nth(0)).toHaveText(
        'Shopping District → Outskirts · walk · 25',
      );
      await expect(p.getByTestId('tme-total')).toHaveText('25 min');
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  test('clear restores the pinless state — header empties, the route target slot speaks (R3, R4)', async ({ page }) => {
    const cell = async (p: Page): Promise<void> => {
      // Stage: move the pin to the Set target and select a node so the
      // wide floater (or the narrow sheet) has live route content.
      await openNodeMenuOnNode(p, SET_TARGET_ID);
      await activate(p, 'tme-node-menu-set');
      await expect.poll(() => hasPinClass(p, SET_TARGET_ID)).toBe(true);
      // B-143r: the set's release-tap selection stands — dismiss it so the
      // elsewhere-node tap below reaches the canvas (the sheet's band covers
      // it otherwise; see dismissSelection).
      await dismissSelection(p);
      await tapPoint(p, await nodeScreenPoint(p, ROUTE_TARGET_ID));
      await expect(p.getByTestId('tme-target')).toBeVisible();

      // Re-open the menu on the PINNED node: NOW the Clear arm renders
      // beside Set (the service's live isPartyLocation read — "only
      // while" the long-pressed node holds the pin).
      // B-143r: the route tap re-selected the target and re-opened the
      // sheet — clear it again before the press at the set target's center.
      await dismissSelection(p);
      await openNodeMenuOnNode(p, SET_TARGET_ID);
      await expect(p.getByTestId('tme-node-menu-clear')).toBeVisible();
      await expect(p.getByTestId('tme-node-menu-clear')).toHaveText('Clear party location');

      await activate(p, 'tme-node-menu-clear');

      // The pinless state returns: the menu is consumed, the header triplet
      // empties (nothing renders as the location), the pin class leaves the
      // projection, and the route computed degrades to null.
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
      await expect.poll(() => hasPinClass(p, SET_TARGET_ID)).toBe(false);
      await expect(p.getByTestId('tme-location')).toHaveText('');

      // Re-establish a selection, then read the target slot: the empty-origin
      // sentence stands in the arrow line's slot (R4 names the no-ghost-arrow pattern; the sentence is R3's).
      // B-143r: the re-select is needed PER WORLD for different reasons —
      // the phone still holds the release-tap's set-target selection (whose
      // sheet band must collapse before the canvas tap reaches the node),
      // while desktop's selection was consumed by the pre-menu chip click
      // (dismissSelection) and needs a fresh tap-select for the slot to
      // render at all.
      await dismissSelection(p);
      await tapPoint(p, await nodeScreenPoint(p, ROUTE_TARGET_ID));
      await expect(p.getByTestId('tme-target')).toHaveCount(0);
      await expect(p.getByTestId('tme-empty-origin')).toHaveText(
        'Set where the party is to route from here.',
      );
      // The route answer is GONE with its origin (the routed legs were
      // rendered to the selection before the clear).
      await expect(p.getByTestId('tme-leg')).toHaveCount(0);
      await expect(p.getByTestId('tme-total')).toHaveCount(0);
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  test('refused set on a container: the core words render in the menu, the pin stays put (C1/F27/D58, C30/C32)', async ({ page }) => {
    const cell = async (p: Page): Promise<void> => {
      // Shrink the hit slop until the compound parent's body wins the press
      // at the aiming hole (see CONTAINER_AIM's block): the phone's touch
      // regime needs ×1.25⁵ from its world fit (z≈0.861) to pull the edge
      // radius under the hole's 43.9-unit chord clearance; the desktop
      // viewport cannot zoom that deep without losing the aim off its
      // bottom edge and its mouse slop is already thin at ×3 (z≈1.864).
      const zoomTaps = isPhone() ? 5 : 3;
      for (let i = 0; i < zoomTaps; i++) await activate(p, 'tme-zoom-in');
      await settle(p);
      await expectContainerAimClearOfSlop(p);

      // The compound parent's menu; Set is refused by the facade — the
      // menu renders the core's OWN words (minus the console prefix —
      // asserted by the human substring) and KEEPS them on the surface.
      await openNodeMenuAt(p, await modelScreenPoint(p, CONTAINER_AIM));
      await activate(p, 'tme-node-menu-set');
      const refusal = p.getByTestId('tme-node-menu-refusal');
      await expect(refusal).toBeVisible();
      await expect(refusal).toContainText('containers never hold the pin');
      await expect(p.getByTestId('tme-node-menu')).toBeVisible();
      // The compound parent IS a menu-bearing map node (not a badge): its
      // label is the authored district name.
      await expect(p.getByTestId('tme-node-menu-label')).toHaveText('Miyama');

      // C30 reject-before-mutate: the pin never left the boot node.
      await expect.poll(() => hasPinClass(p, BOOT_PIN_ID)).toBe(true);
      expect(await hasPinClass(p, CONTAINER_ID)).toBe(false);
      await expect(p.getByTestId('tme-location')).toHaveText('Emiya Residence');

      // The menu (and its refusal words) dismiss on the background tap —
      // the packet's named dismissal path (the vetted clear point; the
      // tap is cy-targeted, not a menu tap). The zoom returns to the
      // world fit first so the clear point sits in vetted geometry.
      for (let i = 0; i < zoomTaps; i++) await activate(p, 'tme-zoom-out');
      await tapPoint(p, await canvasPoint(p, { x: 10, y: 100 }));
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  test('refused set on an unsaved node: "save the map first" renders, nothing binds (D75, C30/C32)', async ({ page }) => {
    const cell = async (p: Page): Promise<void> => {
      // Editor mode + Node tool: tap-place an authored node (the B-116
      // behavior) — the placed node is engine-assigned and SELECTED
      // (C5/D75 id discovery), still unsaved until saveMap. The placement
      // point is the upper-left hole (PLACE_MODEL_POINT — clear of the
      // auto-floated surfaces).
      await activate(p, 'tme-editor-toggle');
      await settle(p);
      // B-D1 (PROPOSAL-D §2.1 + B-D1): the regime-aware placement point (the
      // shell's lowered hole at >=1024; the vetted −40 hole below it).
      await tapPoint(p, await modelScreenPoint(p, placeModelPointFor(p)));
      // C5/D75 id discovery — POLLED (the editor-place-move.e2e-spec.ts
      // convention: the placement→selection write lands within the click
      // dispatch, but the poll converts any engine-side delay into a
      // red-in-time, not a false cell failure).
      await expect.poll(readSelectedId.bind(null, p)).not.toBeNull();
      const placedId = await readSelectedId(p);
      if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');

      // B-143r: the place-tap's selection auto-opened the route sheet's
      // pe-auto band (measured body y=212..505 at the world-fit phone view)
      // — the placed node's press below aims at its rendered center
      // (y≈159), inside the band. The chip clears the selection and
      // collapses the sheet before the gesture.
      await dismissSelection(p);

      // The D75 saved-plane gate refuses the runtime pin-set first —
      // field-precise; the menu keeps the words and the pin is unmoved.
      await openNodeMenuOnNode(p, placedId);
      await expect(p.getByTestId('tme-node-menu-label')).toHaveText(NEW_PLACE);
      await activate(p, 'tme-node-menu-set');
      const refusal = p.getByTestId('tme-node-menu-refusal');
      await expect(refusal).toBeVisible();
      await expect(refusal).toContainText('save the map first');

      await expect.poll(() => hasPinClass(p, BOOT_PIN_ID)).toBe(true);
      await expect(p.getByTestId('tme-location')).toHaveText('Emiya Residence');

      // Mode-change dismissal: exiting the editor closes any parked menu
      // (the dismissal effect's editorMode arm).
      await activate(p, 'tme-editor-toggle');
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  test('the pinned node menu offers both arms; the parked surface dismisses on taps elsewhere (R3 dismissal contract)', async ({ page }) => {
    const cell = async (p: Page): Promise<void> => {
      // The BOOT pin node is the party location from the first paint: its
      // menu carries BOTH arms out of the box (the Clear arm's standing
      // precondition).
      await openNodeMenuOnNode(p, BOOT_PIN_ID);
      await expect(p.getByTestId('tme-node-menu-set')).toBeVisible();
      await expect(p.getByTestId('tme-node-menu-clear')).toBeVisible();

      // CANVAS dismissal — the packet's named path. The background tap
      // closes the parked menu (the aim sits above the phone's sheet band,
      // which the release-tap just re-raised) and clears the selection the
      // release-tap left, collapsing the band for the next press.
      await tapPoint(p, await canvasPoint(p, { x: 10, y: 100 }));
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();

      // CHROME dismissal — B-143r addendum d: "any tap elsewhere" includes
      // viewer chrome, not just the canvas. Staging (phone geometry, all
      // measured): a ONE-LEG selection (matou, 22 min from the boot pin)
      // raises a short sheet. R28 R-9r (the 445px stage): the one-leg rail
      // now tops at y≈152 and Kotomine Church renders at y≈164.8 — INSIDE
      // the band (the 505-era constants — rail 212, Kotomine 195, tall-rail
      // 187 — no longer hold), so the sheet is FOLDED before the press
      // (stageSheetAway — a pre-menu chrome tap, legal; the release-tap
      // re-selects Kotomine and re-raises the sheet only AFTER the menu
      // stands); the chip — stage-top chrome — then closes the parked menu.
      await tapPoint(p, await nodeScreenPoint(p, SHORT_SHEET_NODE_ID));
      await stageSheetAway(p);
      await openNodeMenuOnNode(p, ABOVE_BAND_NODE_ID);
      await expect(p.getByTestId('tme-node-menu')).toBeVisible();
      await dismissSelection(p);
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();

      // DIFFERENT-NODE dismissal + the byte-identical rule: the menu opens
      // on an unpinned leaf (Set only — the Clear arm belongs to the pinned
      // node alone), then a tap on Kotomine Church — clear of the one-leg
      // sheet's rail the release-tap just re-raised — closes the menu AND
      // selects. This block ends the cell.
      //
      // R28 R-9r (phone staging, probe-measured — probe9b): on the 445px
      // stage the width-limited world fit renders EVERY leaf at y
      // 164.8–273.4, all inside the re-raised sheet (rail top 152, body to
      // 445) — NO leaf is tappable at the fit, and the sheet cannot be
      // folded while the menu stands (the rail tap is chrome and would
      // dismiss it — R-3's own rule). The staging therefore zooms ×1.25²
      // through the rail's zoom-in chrome (legal — no menu stands yet)
      // BEFORE the shopping press: Kotomine's center lifts to (369.7,
      // 132.3) — CANVAS-probed, 19.7px above the re-raised rail, 56px
      // below the chip band (75.6), clear of the parked menu plate (185+).
      // Phone-ONLY (the pass-1 desktop finding: the ungated zoom displaced
      // the desktop tap — its branch keeps the original staging
      // byte-identical). Every assertion below is byte-identical.
      if (isPhone()) {
        for (let i = 0; i < 2; i++) await activate(p, 'tme-zoom-in');
        await settle(p);
      }
      await stageSheetAway(p);
      await openNodeMenuOnNode(p, SET_TARGET_ID);
      await expect(p.getByTestId('tme-node-menu-clear')).toHaveCount(0);
      await tapPoint(p, await nodeScreenPoint(p, ABOVE_BAND_NODE_ID));
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
      await expect(p.getByTestId('tme-selection-chip')).toBeVisible();
      await expect(p.getByTestId('tme-selection-label')).toHaveText('Kotomine Church');
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });
});

// --- B-D4 (PROPOSAL-D §3.1): the node menu, generalized — the six object
// verbs at the selection. Every cell runs BOTH arms (desktop pointer /
// phone CDP-twin touch, D53/F52) through the shared staging above. -------

/** B-D4: the Rename cell's replacement label (C23 plain words). */
const RENAMED_LABEL = 'Market Quarter';

/** B-D4 (cell 10): the NON-label dirty draft edit — a description change
 *  (two label edits would muddy the assert: the packet pins the draft's
 *  field edit against the popover's label intent). */
const DESC_EDIT = 'The busiest arcade in Miyama.';

/**
 * B-D4: the waypoint cell's placement point — the B-109-vetted clear
 * background hole (waypoints.e2e-spec.ts's BG_MODEL_POINT scan: >60 model
 * units from every node center, inside the fitted bbox at both fits).
 */
const WP_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };

/**
 * B-D4: the engine-assigned id of the FIRST waypoint on a fresh facade (C5 —
 * deterministic, the waypoints spec's own pinned fact; read live after the
 * placement through the rendered-position seam before any gesture on it).
 */
const WAYPOINT_ID = 'wp-1';

test.describe('the object menu: six verbs at the selection (PKG B-D4, PROPOSAL-D §3.1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, BOOT_PIN_ID)).not.toBeNull();
    await restoreBootViewport(page);
    await expect.poll(() => hasPinClass(page, BOOT_PIN_ID)).toBe(true);
  });

  // Cell 1 — the menu's SHAPE: editor mode renders the six object rows on a
  // library leaf; view mode (the default boot) keeps exactly today's {Set}.
  test('editor menu carries the six verbs; view mode keeps exactly {Set} on a leaf (B-D4, PROPOSAL-D §3.1, F52/D53)', async ({
    page,
  }) => {
    const cell = async (p: Page): Promise<void> => {
      // VIEW mode first (the default boot): the authoring rows are ABSENT —
      // exactly the pre-packet {Set} shape on a non-pin leaf.
      await openNodeMenuOnNode(p, SET_TARGET_ID);
      await expect(p.getByTestId('tme-node-menu-label')).toHaveText('Shopping District');
      await expect(p.getByTestId('tme-node-menu-set')).toBeVisible();
      for (const tid of ['rename', 'connect', 'details', 'detach', 'delete']) {
        await expect(p.getByTestId(`tme-node-menu-${tid}`)).toHaveCount(0);
      }
      await expect(p.getByTestId('tme-node-menu-clear')).toHaveCount(0); // not the pin
      // Dismiss through the packet's named path (the aim sits above the
      // phone's raised sheet band — the standing cell-5 precedent).
      await tapPoint(p, await canvasPoint(p, { x: 10, y: 100 }));
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();

      // EDITOR mode: the six rows stand — Rename, Set, Connect…, Details,
      // Detach from arcs, Delete (Clear still absent: not the pin).
      await activate(p, 'tme-editor-toggle');
      await settle(p);
      await openNodeMenuOnNode(p, SET_TARGET_ID);
      const rows = ['set', 'rename', 'connect', 'details', 'detach', 'delete'];
      for (const tid of rows) {
        await expect(p.getByTestId(`tme-node-menu-${tid}`)).toHaveCount(1);
      }
      await expect(p.getByTestId('tme-node-menu-clear')).toHaveCount(0);
      // F52: every row is a >= 44px tap target in BOTH regimes.
      for (const tid of rows) {
        const box = await p.getByTestId(`tme-node-menu-${tid}`).boundingBox();
        expect(box?.height ?? 0, `row ${tid} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      }
      // The mode-exit dismissal (the unsaved-node cell's precedent).
      await activate(p, 'tme-editor-toggle');
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  // Cell 2 — Rename: the popover re-opens SEEDED with the current label
  // (focused + fully selected — typing replaces wholesale); Enter commits
  // through the one PUT; Esc keeps the label (no command).
  test('Rename seeds the popover with the live label; Enter commits, Esc keeps it (B-D4, C23/C30, D10, F45)', async ({
    page,
  }) => {
    const cell = async (p: Page): Promise<void> => {
      await activate(p, 'tme-editor-toggle');
      await settle(p);
      await openNodeMenuOnNode(p, SET_TARGET_ID);
      await activate(p, 'tme-node-menu-rename');

      // The menu consumed itself; the popover stands with the CURRENT label
      // pre-filled, focused, and fully selected (the R-5 idiom at the object).
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
      await expect(p.getByTestId('tme-inline-naming')).toBeVisible();
      const input = p.getByTestId('tme-inline-name-input');
      await expect(input).toHaveValue('Shopping District');
      await expect.poll(() => activeElementTestid(p)).toBe('tme-inline-name-input');
      const seeded = await activeInputSelection(p);
      expect(seeded?.start).toBe(0);
      expect(seeded?.end, 'the seed is fully selected — typing replaces it').toBe(
        'Shopping District'.length,
      );

      // Replace + Enter: ONE upsertNode full-replace — the canvas label and
      // the selection chip follow, the map is dirty (F45 presence).
      await input.fill(RENAMED_LABEL);
      await input.press('Enter');
      await expect(p.getByTestId('tme-inline-naming')).toHaveCount(0);
      await expect.poll(() => readLabels(p)).toContain(RENAMED_LABEL);
      await expect.poll(() => readLabels(p)).not.toContain('Shopping District');
      await expect(p.getByTestId('tme-selection-label')).toHaveText(RENAMED_LABEL);
      await expect(p.getByTestId('tme-save-dock')).toBeVisible();
      await expect(p.getByTestId('tme-property-panel')).toHaveCount(0); // the latch holds it shut

      // The Esc arm: re-open → Rename → Esc — the CURRENT label stands, no
      // rename command fires (D10: nothing auto-commits).
      await openNodeMenuOnNode(p, SET_TARGET_ID);
      await activate(p, 'tme-node-menu-rename');
      await expect(input).toHaveValue(RENAMED_LABEL);
      await input.press('Escape');
      await expect(p.getByTestId('tme-inline-naming')).toHaveCount(0);
      await expect.poll(() => readLabels(p)).toContain(RENAMED_LABEL);
      await expect.poll(() => readLabels(p)).not.toContain('New place');
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  // Cell 3 — Details on a LATCHED node: a placement resolved by Esc leaves
  // the panel suppressed; the menu's Details yields the latch and the panel
  // opens NAME-FIRST through the preserved seeding path (R-5 standing).
  test('Details yields the latch: the panel opens name-first on a node whose popover resolved (B-D4, R-5)', async ({
    page,
  }) => {
    const cell = async (p: Page): Promise<void> => {
      await activate(p, 'tme-editor-toggle');
      await settle(p);
      await tapPoint(p, await modelScreenPoint(p, placeModelPointFor(p)));
      await expect.poll(readSelectedId.bind(null, p)).not.toBeNull();
      const placedId = await readSelectedId(p);
      if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');

      // Resolve the popover by Esc — the latch parks the panel shut. NO
      // dismissSelection here: the selection must STAY (the latch dies with
      // its departure — the thing Details must overcome). B-117 keeps the
      // route sheet collapsed for the editor-mode library selection, so the
      // placed node's press point stands clear.
      await p.getByTestId('tme-inline-name-input').press('Escape');
      await expect(p.getByTestId('tme-inline-naming')).toHaveCount(0);
      await expect(p.getByTestId('tme-property-panel')).toHaveCount(0);

      await openNodeMenuOnNode(p, placedId);
      await activate(p, 'tme-node-menu-details');

      // The menu consumed itself; the panel opens through the PRESERVED
      // seeding path — NAME-FIRST: the Name input is the panel's first
      // field, focused, seeded with the live label, fully selected (R-5).
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
      await expect(p.getByTestId('tme-property-panel')).toBeVisible();
      await expect.poll(() => activeElementTestid(p)).toBe('tme-node-label-input');
      const firstField = await p.evaluate(() => {
        const panel = document.querySelector('[data-testid="tme-property-panel"]');
        return panel?.querySelector('input, select, textarea')?.getAttribute('data-testid') ?? null;
      });
      expect(firstField, 'the Name input is the panel\'s first field (R-5 name-first)').toBe(
        'tme-node-label-input',
      );
      const state = await activeInputSelection(p);
      expect(state?.value).toBe(NEW_PLACE);
      expect(state?.start).toBe(0);
      expect(state?.end, 'the Name is fully selected (R-5)').toBe(NEW_PLACE.length);
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  // Cell 4 — Connect…: the existing quick-connect mode entered from the
  // object; the banner names the node; Cancel exits (no arcs touched).
  test('Connect… enters quick-connect from the menu: the banner names the node, Cancel exits (B-D4, F16/F27)', async ({
    page,
  }) => {
    const cell = async (p: Page): Promise<void> => {
      const edgesBefore = await readEdgeIds(p);
      await activate(p, 'tme-editor-toggle');
      await settle(p);
      await openNodeMenuOnNode(p, SET_TARGET_ID);
      await activate(p, 'tme-node-menu-connect');

      // The menu consumed itself; the mode is on (the service's select-first
      // wrote the frozen source) and the banner names it in the core's own
      // C23 words.
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
      await expect.poll(readConnectMode.bind(null, p)).toBe(true);
      await expect(p.getByTestId('tme-connect-from')).toBeVisible();
      await expect(p.getByTestId('tme-connect-from')).toHaveText('Connecting from Shopping District');

      // Exit through the banner's Cancel — nothing committed.
      await activate(p, 'tme-connect-cancel');
      await expect.poll(readConnectMode.bind(null, p)).toBe(false);
      await expect(p.getByTestId('tme-connect-from')).toHaveCount(0);
      expect((await readEdgeIds(p)).length).toBe(edgesBefore.length);
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  // Cell 5 — Detach from arcs (F54): every incident arc dies in both planes,
  // the node survives byte-identical, the selection STANDS, the menu is
  // consumed. The boot pin node doubles as the pin-untouched proof (D10).
  test('Detach from arcs kills the incident arcs, keeps the node and the selection (F54, B-D4)', async ({ page }) => {
    const cell = async (p: Page): Promise<void> => {
      const before = await readEdgeIds(p);
      const incident = await readIncidentEdgeIds(p, BOOT_PIN_ID);
      expect(incident.length, 'the boot pin node has incident arcs to lose (F54 staging)').toBeGreaterThan(0);

      // Desktop: the context-click writes NO selection — stage one first (a
      // plain tap selects; the auto-opened route dock is closed through the
      // rail's wide Route toggle so nothing floats over the press). The
      // phone arm needs none: the long-press's own release-tap selects.
      if (!isPhone()) {
        await tapPoint(p, await nodeScreenPoint(p, BOOT_PIN_ID));
        await expect.poll(readSelectedId.bind(null, p)).toBe(BOOT_PIN_ID);
        await activate(p, 'tme-route-toggle');
        await settle(p);
      }
      await activate(p, 'tme-editor-toggle');
      await settle(p);
      await openNodeMenuOnNode(p, BOOT_PIN_ID);
      await activate(p, 'tme-node-menu-detach');

      // F54: exactly the incident set died (live-counted, never hardcoded);
      // the node, the selection, and the pin stand.
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
      const after = await readEdgeIds(p);
      expect(after.length).toBe(before.length - incident.length);
      for (const id of incident) expect(after).not.toContain(id);
      await expect.poll(() => readRenderedPosition(p, BOOT_PIN_ID)).not.toBeNull();
      expect(await readSelectedId(p)).toBe(BOOT_PIN_ID);
      await expect.poll(() => hasPinClass(p, BOOT_PIN_ID)).toBe(true); // detach never touches the pin (D10)
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  // Cell 6 — Delete (F46): the node AND its incident arcs die, the selection
  // CLEARS (the service's own clear — the chip and panels close with it),
  // the menu is consumed. No confirm dialog ever (delete-and-redo).
  test('Delete removes the node and its arcs, clears the selection, consumes the menu (F46, B-D4)', async ({ page }) => {
    const cell = async (p: Page): Promise<void> => {
      const before = await readEdgeIds(p);
      const incident = await readIncidentEdgeIds(p, SET_TARGET_ID);
      expect(incident.length, 'the delete target has incident arcs to lose (F46 staging)').toBeGreaterThan(0);

      // The detach cell's desktop staging: a selection must stand for the
      // clear to be honest (the context-click writes none).
      if (!isPhone()) {
        await tapPoint(p, await nodeScreenPoint(p, SET_TARGET_ID));
        await expect.poll(readSelectedId.bind(null, p)).toBe(SET_TARGET_ID);
        await activate(p, 'tme-route-toggle');
        await settle(p);
      }
      await activate(p, 'tme-editor-toggle');
      await settle(p);
      await openNodeMenuOnNode(p, SET_TARGET_ID);
      await activate(p, 'tme-node-menu-delete');

      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
      const after = await readEdgeIds(p);
      expect(after.length).toBe(before.length - incident.length);
      for (const id of incident) expect(after).not.toContain(id);
      await expect.poll(() => readRenderedPosition(p, SET_TARGET_ID)).toBeNull(); // the node is gone
      expect(await readSelectedId(p)).toBeNull(); // the service cleared it
      await expect(p.getByTestId('tme-selection-chip')).toBeHidden();
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  // Cell 7 — the C30 refusal: Delete on the compound parent (children would
  // dangle) renders the CORE's own words in-menu and KEEPS the surface open.
  test('refused delete on a container: the core words render in the menu, nothing dies (C30/C32, B-D4)', async ({
    page,
  }) => {
    const cell = async (p: Page): Promise<void> => {
      // The container-refusal cell's zoom staging (the slop-shrink so the
      // compound parent's body owns the press — see CONTAINER_AIM's block).
      const zoomTaps = isPhone() ? 5 : 3;
      for (let i = 0; i < zoomTaps; i++) await activate(p, 'tme-zoom-in');
      await settle(p);
      await expectContainerAimClearOfSlop(p);

      // Editor mode for the Delete row — through the WAYPOINT tool: the
      // phone twin's release-tap on a compound parent's box is a PLACEMENT
      // gesture in editor+node (B-109 ruling 2), and a placed node's naming
      // popover would park exactly where the menu parks (aim+14) and cover
      // the arms; the Waypoint tool's release places a waypoint with NO
      // popover and NO selection, leaving the menu the top surface.
      await activate(p, 'tme-editor-toggle');
      await settle(p);
      await activate(p, 'tme-tool-waypoint');
      await settle(p);

      await openNodeMenuAt(p, await modelScreenPoint(p, CONTAINER_AIM));
      await expect(p.getByTestId('tme-node-menu-delete')).toBeVisible();
      await activate(p, 'tme-node-menu-delete');

      // The validator's own words (each dangling child's parent issue —
      // folded into the menu's one status line), the menu STAYS open
      // (retry-elsewhere), and nothing died (C30 reject-before-mutate).
      const refusal = p.getByTestId('tme-node-menu-refusal');
      await expect(refusal).toBeVisible();
      await expect(refusal).toContainText(
        "must reference an existing node id ('district-miyama' not found)",
      );
      await expect(p.getByTestId('tme-node-menu')).toBeVisible();
      expect(await readRenderedPosition(p, CONTAINER_ID)).not.toBeNull();

      // Dismiss through the standing cell's path (zoom home, then the vetted
      // clear point).
      for (let i = 0; i < zoomTaps; i++) await activate(p, 'tme-zoom-out');
      await tapPoint(p, await canvasPoint(p, { x: 10, y: 100 }));
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  // Cell 8 — D-3's standing law at the new surface: the popover and the menu
  // are NEVER simultaneous — the long-press's own press resolves a standing
  // popover FIRST (the typed name commits), then the menu stands.
  test('never simultaneous: a long-press resolves the standing popover first, then the menu stands (B-D4, D-3/D10)', async ({
    page,
  }) => {
    const cell = async (p: Page): Promise<void> => {
      await activate(p, 'tme-editor-toggle');
      await settle(p);
      await tapPoint(p, await modelScreenPoint(p, placeModelPointFor(p)));
      await expect.poll(readSelectedId.bind(null, p)).not.toBeNull();
      const placedId = await readSelectedId(p);
      if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');

      // Type a name and leave the popover standing — then long-press the
      // SAME node. The press (the menu-open gesture's own pointerdown)
      // commits the typed name through the popover's outside-press arm
      // BEFORE the hold opens the menu; the hold's taphold then opens the
      // menu on the now-renamed node.
      const input = p.getByTestId('tme-inline-name-input');
      await input.fill('Riverbend');
      await openNodeMenuOnNode(p, placedId);

      // The popover is GONE while the menu stands — never both at once —
      // and the typed name COMMITTED (the canvas label and the menu's own
      // label line carry it).
      await expect(p.getByTestId('tme-node-menu')).toBeVisible();
      await expect(p.getByTestId('tme-inline-naming')).toHaveCount(0);
      await expect.poll(() => readLabels(p)).toContain('Riverbend');
      await expect(p.getByTestId('tme-node-menu-label')).toHaveText('Riverbend');
      await expect(p.getByTestId('tme-selection-label')).toHaveText('Riverbend');
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  // Cell 9 — the waypoint menu keeps today's exact {Set} shape: an overlay
  // waypoint is no library node, so no authoring row renders (the live
  // nodeDataById presence read — the panel-never-opens rule's menu twin).
  test('a waypoint menu keeps exactly {Set}: no authoring rows on the overlay plane (B-D4, F10/D21)', async ({
    page,
  }) => {
    const cell = async (p: Page): Promise<void> => {
      // The waypoints spec's placement prefix: editor mode + the Waypoint
      // tool; one tap places 'wp-1' (C5, deterministic on a fresh facade).
      await activate(p, 'tme-editor-toggle');
      await settle(p);
      await activate(p, 'tme-tool-waypoint');
      await expect(p.getByTestId('tme-tool-waypoint')).toHaveAttribute('aria-pressed', 'true');
      await tapPoint(p, await modelScreenPoint(p, WP_MODEL_POINT));
      await expect.poll(() => readRenderedPosition(p, WAYPOINT_ID)).not.toBeNull();

      await openNodeMenuOnNode(p, WAYPOINT_ID);
      await expect(p.getByTestId('tme-node-menu-label')).toHaveText('Waypoint');
      await expect(p.getByTestId('tme-node-menu-set')).toBeVisible();
      for (const tid of ['rename', 'connect', 'details', 'detach', 'delete']) {
        await expect(p.getByTestId(`tme-node-menu-${tid}`)).toHaveCount(0);
      }
      await expect(p.getByTestId('tme-node-menu-clear')).toHaveCount(0); // not the pin

      // The mode-exit dismissal (a background tap here would PLACE another
      // waypoint — the Waypoint tool owns the gesture).
      await activate(p, 'tme-editor-toggle');
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });

  // Cell 10 — the SAME-NODE displacement (the review-gate finding): a DIRTY
  // panel draft displaced by its OWN node's Rename resolves FIRST — the
  // seeding effect commits the draft (the displacement commit) before the
  // popover stands, so the popover's later PUT reads the LIVE map and BOTH
  // intents survive the navigation commit: the renamed canvas label AND the
  // draft's description edit. The pre-fix bug: the same-node early return
  // ("keystrokes never re-seed") shielded the dirty draft — it stood HIDDEN
  // under the popover, and its STALE label committed at the next selection
  // change, silently reverting the rename (the older intent committing
  // last). B-D4 + the D-3 displacement rule (C29). Note: the popover's seed
  // shows the PRE-commit live label — cosmetic: the text is fully selected
  // for wholesale replacement.
  test('Rename over its own dirty draft: both intents survive the navigation (B-D4 + the D-3 displacement rule, C29)', async ({
    page,
  }) => {
    const cell = async (p: Page): Promise<void> => {
      await activate(p, 'tme-editor-toggle');
      await settle(p);

      // A PLAIN TAP selects the leaf (a leaf tap in editor mode keeps the
      // select branch — only compound boxes place) and the panel opens,
      // seeded. The draft is dirtied through the DESCRIPTION field — a
      // NON-label edit.
      await tapPoint(p, await nodeScreenPoint(p, SET_TARGET_ID));
      await expect.poll(readSelectedId.bind(null, p)).toBe(SET_TARGET_ID);
      await expect(p.getByTestId('tme-property-panel')).toBeVisible();
      await p.getByTestId('tme-node-description').fill(DESC_EDIT);

      // Phone-only staging: the maximized property sheet covers the node's
      // rendered slot (probe-measured: sheet top ≈177px, the node y≈225) —
      // lift it above the sheet bands before the press.
      if (isPhone()) await liftNodeClearOfSheets(p, SET_TARGET_ID);

      // Menu → Rename over the SAME node whose draft stands dirty.
      await openNodeMenuOnNode(p, SET_TARGET_ID);
      await activate(p, 'tme-node-menu-rename');
      await expect(p.getByTestId('tme-node-menu')).toBeHidden();
      const input = p.getByTestId('tme-inline-name-input');
      await expect(input).toBeVisible();
      await expect(input).toHaveValue('Shopping District'); // the seed: the PRE-commit live label (cosmetic, see above)
      // The displacement commit resolved the draft BEFORE the popover stood:
      // the panel is gone — never both surfaces, and no draft survives the
      // naming state hidden.
      await expect(p.getByTestId('tme-property-panel')).toHaveCount(0);

      await input.fill(RENAMED_LABEL);
      await input.press('Enter');
      await expect(p.getByTestId('tme-inline-naming')).toHaveCount(0);

      // The navigation: select ANOTHER node — the exact moment the pre-fix
      // bug's hidden draft committed its stale label.
      if (isPhone()) await liftNodeClearOfSheets(p, ROUTE_TARGET_ID);
      await tapPoint(p, await nodeScreenPoint(p, ROUTE_TARGET_ID));
      await expect.poll(readSelectedId.bind(null, p)).toBe(ROUTE_TARGET_ID);

      // BOTH intents stand after the navigation commit: the popover's label
      // on the canvas (the pre-fix revert put 'Shopping District' back
      // here)...
      await expect.poll(() => readLabels(p)).toContain(RENAMED_LABEL);
      await expect.poll(() => readLabels(p)).not.toContain('Shopping District');

      // ...and the draft's description edit, read back through the panel
      // after a re-select (no revert of either).
      if (isPhone()) await liftNodeClearOfSheets(p, SET_TARGET_ID);
      await tapPoint(p, await nodeScreenPoint(p, SET_TARGET_ID));
      await expect.poll(readSelectedId.bind(null, p)).toBe(SET_TARGET_ID);
      await expect(p.getByTestId('tme-property-panel')).toBeVisible();
      await expect(p.getByTestId('tme-node-description')).toHaveValue(DESC_EDIT);
    };
    if (isPhone()) await withPhoneTwinPage(cell);
    else await cell(page);
  });
});
