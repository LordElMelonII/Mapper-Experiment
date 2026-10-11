// tests/e2e/waypoints.e2e-spec.ts — PKG B-109: tap-to-place waypoints with
// full input disambiguation, proven at BOTH playwright projects (desktop +
// emulated phone with touch) per D53/F52. B-120 (D76): every placement cell
// now runs through the NEW contract — enter editor mode first, then select
// the Waypoint tool on the segmented control; view mode is purely
// navigational and places NOTHING (the view-mode no-op cells pin that side).
//
// Cited IDs:
//   F10/D21  — user nodes (waypoints) are placed at runtime by tapping empty
//              canvas (in the editor with the Waypoint tool, D76/B-120);
//              the plain-word label 'Waypoint' is chat state (the
//              overlay), never an id-like machine name on the canvas (C23).
//   C5       — ids belong to the engine: rapid creations cannot collide. The
//              facade's counter starts at 1 and FX1 authors no `wp-`/`we-`
//              ids, so a fresh page's first placement is deterministically
//              `wp-1` (asserted via the seams, never proposed by the UI).
//   C7       — a placed node connects to the k=3 nearest leaves of the MERGED
//              set on its layer (WAYPOINT_KNN=3; the D58 leaf rule — kind ∈
//              {location, hub, waypoint} AND childless). Layer-fuyuki holds 13
//              leaves ≥ k, so every placement here creates exactly 3 `we-`
//              user edges; a second placement may treat the first waypoint as
//              a leaf (6 total across two placements).
//   C14      — user edges carry NO authored values and price through the ONE
//              cost function (geometric, no parallel math). See the F26 test
//              for the currency consequence on FX1 (D60(b) as amended by D74).
//   C17      — unreachable ⇒ the core's human reason, verbatim, never a
//              number; verified against src/core/facade.ts computeRoute.
//   D60(b)   — ONE currency per findRoute run (the interleaved-currency
//              verifier pin): a path mixing authored-minutes arcs with
//              unitPerPx-only user edges yields ok:false rather than a
//              meaningless mixed total. AMENDED by D74 (register R17): on
//              time-kind `min` scales the unforced canonical fallback now
//              prices authored-minutes arcs and geometric user edges in ONE
//              honest `min` currency (D72 labels it) — see the deviation
//              history note below and the F26 test body.
//   §6.2     — Waypoints & overlay: tap inside a compound's box but not on a
//              node ⇒ top-level user node in that layer; kNN considers leaves
//              only; rapid taps ⇒ engine-assigned ids. Touch: tap-vs-drag
//              threshold; touch-action suppression of double-tap zoom.
//   D53/F52  — one interaction family, both worlds; no hover-only affordance;
//              no horizontal scroll at 375px.
//   D35      — NO double-tap/double-click gesture is bound (portal entry is
//              Phase 3 M3): two rapid taps are two discrete taps.
//   D69      — waypoints render on the ACTIVE layer only (buildLayerElements
//              filters the overlay by it).
//
// DEVIATION HISTORY (packet B-109 F26 bullet, resolved by D74): the packet
// expected the blocked castle route to flip back to ok:true with legs riding
// `we-` edges after a gap placement. At B-109's gate that outcome was
// unsatisfiable on FX1 under the frozen contract, for two independent
// reasons:
//   (1) no point in the plane puts the PIN (Emiya Residence) into a placed
//       node's kNN-3 — the Miyama cluster always crowds it out (exhaustive
//       grid scan), so an all-`we-` two-leg route can never exist; and
//   (2) a reconnecting placement (castle+outskirts in kNN-3) produces a MIXED
//       path, which findRoute refused BY DESIGN under D60(b)'s strict
//       currency filter (src/core/facade.ts — the interleaved-currency
//       verifier pin; §6.2's acknowledged ambiguity).
// Wall (2) is RESOLVED by D74 (A-012): findRoute's unforced canonical
// fallback now accepts minutes-priced arcs on time-kind `min` scales via the
// priceForSnapshot helper, so the mixed path prices honestly in ONE `min`
// currency and the F26 cell below pins the originally-intended assertion —
// ok:true with the block STILL active, the final leg on a `we-` edge, the
// total in min. Wall (1) STANDS — the pin is never in kNN — and is why the
// all-`we-` two-leg shape was never the assertion.
//
// Canvas content is read/aimed through the DEV-HARNESS-ONLY
// window.__TME_E2E__ hook (src/app/app.ts): read-only projections of the
// cytoscape model. All aim math (midpoints, perpendicular offsets, canvas-box
// translation) is TEST-side — the UI computes nothing (R1).
import { chromium, devices, expect, test, type CDPSession, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  edgeIds(): string[];
  nodeParent(id: string): string | null;
  edgeLineStyle(id: string): string | null;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
  /** B-120: the selection's id — identifies the placed node for the drag aim. */
  selectedNodeId(): string | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

const CASTLE_ID = 'einzbern-castle';
const CASTLE_LABEL = 'Einzbern Castle';
const STATION_ID = 'fuyuki-station';
const STATION_LABEL = 'Fuyuki Station';
/** FX1 arc facts: the ONLY arc into the castle (walk 240 / car 60). */
const CASTLE_ARC = { id: 'arc-outskirts-einzbern-castle', source: 'outskirts', target: CASTLE_ID };

/** C17: the core's verbatim reason while the castle's only road is blocked. */
const BLOCKED_REASON_TEXT = 'every candidate arc is blocked or disallowed for this mode';

const isPhone = (): boolean => test.info().project.name === 'phone';

/**
 * PKG B-142 (REPAIRS R-2) re-baseline: the phone boot now stages AT the pin
 * (the boot-posture zoom, the pin-centered viewport). This spec's aims are
 * exhaustively scanned against the PRE-PACKET WORLD-FIT boot viewport
 * (zoom = 0.282... on FX1 — the hit-corridor arithmetic above), so the phone
 * cells restore exactly that viewport first by tapping the rail's Fit — the
 * packet's own "explicit full-world ask". Desktop never arms the posture
 * (the wide gate mirrors D81's 700px breakpoint), so its boot is
 * byte-unchanged and this is a no-op. The withPhoneChromiumPage twin boots
 * under the SAME iPhone-13 emulation, so it takes the same restore. Aim
 * math and every assertion are untouched — the R23 in-box-content law
 * stands throughout.
 */
const restoreBootViewport = async (page: Page): Promise<void> => {
  if (isPhone()) await page.getByTestId('tme-zoom-fit').tap();
};

/**
 * Background placement points in MODEL coordinates, chosen by an exhaustive
 * scan of the FX1 plane against the installed cytoscape 3.34.3 hit model
 * (findNearestElements/checkNode/checkEdge) at the worst case — the phone
 * touch fit (zoom ≈ 0.282: edge grab corridor = width/2 + 24/zoom ≈ 87 model
 * units, node hit half-width = 22 + 8/zoom ≈ 50 model units; the desktop
 * mouse fit is an order of magnitude tighter). Both points are:
 *   - >110 model units from every authored edge segment and >60 from every
 *     node center, the cross-layer badge, and both compound boxes;
 *   - inside the fitted content bounding box with node-body margin, so the
 *     waypoint renders exactly at the tap point (asserted — and since B-120
 *     a placement never refits at all: zoom and pan are untouched);
 *   - rendered clear of the fixed chrome (header, layer switcher, the
 *     B-120 bottom-right editor tool control) at both project viewports;
 * The BG_POINT discipline of interactions.e2e-spec.ts:44, model-anchored:
 * the points convert to canvas-relative px at runtime through the zoom/pan
 * seams (test-side math — the UI computes nothing, R1).
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };
const BG_MODEL_POINT_2: { x: number; y: number } = { x: 300, y: 92 };

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeLabels();
  });

const readState = (page: Page): Promise<{ labels: string[]; weIds: string[] }> =>
  page.evaluate((): { labels: string[]; weIds: string[] } => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return {
      labels: hook.nodeLabels(),
      weIds: hook.edgeIds().filter((id) => id.startsWith('we-')),
    };
  });

const readNodeParent = (page: Page, id: string): Promise<string | null> =>
  page.evaluate(
    (nodeId): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
      return hook.nodeParent(nodeId);
    },
    id,
  );

const readEdgeLineStyle = (page: Page, edgeId: string): Promise<string | null> =>
  page.evaluate(
    (id): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
      return hook.edgeLineStyle(id);
    },
    edgeId,
  );

const readRenderedPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
      return hook.nodeRenderedPosition(nodeId);
    },
    id,
  );

const readPan = (page: Page): Promise<{ x: number; y: number }> =>
  page.evaluate((): { x: number; y: number } => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.pan();
  });

const readZoom = (page: Page): Promise<number> =>
  page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.zoom();
  });

const readSelectedId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.selectedNodeId();
  });

/** F52/D53: one activation path for DOM controls on every project. */
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/**
 * B-120 (D76): the placement prefix every waypoint cell now runs through —
 * enter EDITOR mode, then select the WAYPOINT tool on the segmented control.
 * View mode is purely navigational (nothing is ever placed); the tool makes
 * the placement kind visible before the first tap (no invisible affordance,
 * D53). Both controls are >= 44px and touch-alone operable.
 */
const enterEditorWaypointTool = async (page: Page): Promise<void> => {
  await activate(page, 'tme-editor-toggle');
  await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tme-editor-tools')).toBeVisible();
  await activate(page, 'tme-tool-waypoint');
  await expect(page.getByTestId('tme-tool-waypoint')).toHaveAttribute('aria-pressed', 'true');
};

const readScrollY = (page: Page): Promise<number> => page.evaluate(() => window.scrollY);

const expectPosition = (pos: { x: number; y: number } | null): { x: number; y: number } => {
  if (pos === null) throw new Error('node not rendered (unmounted or absent)');
  return pos;
};

const canvasBox = async (page: Page) => {
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return box;
};

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const tapPoint = async (page: Page, point: Point): Promise<void> => {
  // B-133 (D91): the panels are stage overlays — a tap aimed at a covered
  // point lands on the sheet, not the canvas. If the aim point sits under a
  // panel, collapse the route sheet (the auto-expanded content overlay —
  // the user's "the map didn't respond, close the sheet, tap again" flow)
  // and recompute nothing: the caller's geometry stands, and a selection
  // below re-expands the sheet (B-114). Coverage by the property/arc panels
  // is NOT auto-cleared (their dismissal would churn the selection state
  // the cell under test owns — those cells clear it explicitly).
  const covered = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return el !== null && el.closest('tme-route-panel') !== null;
  }, [point.x, point.y] as const);
  if (covered) {
    if ((await page.getByTestId('tme-sheet-rail').getAttribute('aria-expanded')) === 'true') {
      await page.getByTestId('tme-sheet-rail').click();
      await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'false');
      await page.waitForTimeout(200); // the collapse re-renders — a tap in the same tick can still hit the body
    }
  }
  if (isPhone()) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
};

/**
 * B-D2 re-baseline (R29, PROPOSAL-D §2.1 — cited): at shell widths the
 * context dock narrows the canvas, so a fixed top-center strip tap is no
 * longer a guaranteed background clear (the D-1 header DIM pill — a real
 * control — sits exactly at the narrowed center; probe-proven at (528, 40)).
 * Probe candidate points for one whose elementFromPoint IS the canvas (the
 * recognition-aids guard idiom) and tap it — a background clear with view
 * semantics at the call sites.
 */
const clearCanvasTap = async (page: Page): Promise<void> => {
  const box = await canvasBox(page);
  const point = await page.evaluate(([bx, by, bw]): { x: number; y: number } | null => {
    for (const [fx, dy] of [[0.5, 40], [0.5, 140], [0.25, 40], [0.25, 140], [0.75, 140]]) {
      const x = bx + bw * fx;
      const y = by + dy;
      const el = document.elementFromPoint(x, y);
      if (el !== null && el.closest('.tme-canvas') !== null) return { x, y };
    }
    return null;
  }, [box.x, box.y, box.width] as const);
  if (point === null) throw new Error('no clear canvas point for the background tap');
  await tapPoint(page, point);
};

/**
 * Wait two animation frames: panel open/close changes the stage size
 * synchronously, but the ResizeObserver-driven re-fit (B-106) runs just
 * before the next paint — reads inside that window yield pre-fit
 * coordinates and the next tap misses (arc-panel.e2e-spec.ts precedent).
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** Model point → canvas-relative rendered point (seam read, test-side math). */
const modelPoint = async (page: Page, model: { x: number; y: number }): Promise<Point> => {
  await settle(page);
  return page.evaluate(
    (m): Point => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
      const pan = hook.pan();
      const zoom = hook.zoom();
      return { x: pan.x + m.x * zoom, y: pan.y + m.y * zoom };
    },
    model,
  );
};


/**
 * B-127 (D86) aiming repair: modelPoint's CANVAS-RELATIVE result doubled as
 * the SCREEN tap point while the canvas sat at the viewport origin; the wide
 * rail column moved the canvas origin, so every tap/drag/click site converts
 * through the live canvas box now (the comparison sites stay canvas-relative
 * — rendered reads are canvas-relative).
 */
const screenModelPoint = async (page: Page, model: { x: number; y: number }): Promise<Point> => {
  const point = await modelPoint(page, model);
  const box = await canvasBox(page);
  return { x: box.x + point.x, y: box.y + point.y };
};

/**
 * D91 (B-133c): the overlay floaters cover arbitrary model points per their
 * avoid-the-selection anchors — a vetted constant aim can legally sit under
 * a panel (found live: the station selection swings the route floater onto
 * the historical southwest aim). The background taps derive their aim from
 * the live page instead: the first candidate in a list of vetted EMPTY model
 * points (each >= 90 model units from every FX1 node and far off every arc
 * corridor at both projects' fits) whose screen position elementFromPoint
 * resolves INTO the canvas host — the browser's own hit-test, the same
 * ground truth the tap uses. Test-side reads only (R1).
 */
const BACKGROUND_CANDIDATES: ReadonlyArray<{ x: number; y: number }> = [
  BG_MODEL_POINT,
  { x: 400, y: 150 },
  { x: -250, y: -50 },
  { x: 100, y: -300 },
  { x: 500, y: 470 },
];

const backgroundAim = async (page: Page): Promise<Point> => {
  for (const model of BACKGROUND_CANDIDATES) {
    const pt = await screenModelPoint(page, model);
    const hit = await page.evaluate(
      ([x, y]: [number, number]): boolean => {
        const el = document.elementFromPoint(x, y);
        return el !== null && el.closest('[data-testid="tme-canvas"]') !== null;
      },
      [pt.x, pt.y],
    );
    if (hit) return pt;
  }
  throw new Error('no vetted background candidate clear of the overlay chrome');
};

/**
 * B-133 (D91): the route sheet's blocked listing is CONTENT at boot (the
 * auto-expand), and on the full-width overlay stage its body covers the
 * lower canvas — canvas gestures aimed there hit the sheet. A user collapses
 * it via the sheet's own rail toggle first; a selection below re-expands it
 * (B-114), so route-panel reads placed AFTER a re-select stay valid. Setup,
 * not assertion.
 */
const collapseRouteSheet = async (page: Page): Promise<void> => {
  if (!isPhone()) return; // wide has no sheet regime — the sidebar is always open
  if ((await page.getByTestId('tme-sheet-rail').getAttribute('aria-expanded')) === 'true') {
    await page.getByTestId('tme-sheet-rail').click();
    await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(200); // the collapse re-renders — a tap in the same tick can still hit the body
  }
};

/** Tap a canvas node through its rendered position (seam + canvas box). */
const tapNode = async (page: Page, id: string): Promise<void> => {
  await settle(page);
  const pos = expectPosition(await readRenderedPosition(page, id));
  const box = await canvasBox(page);
  await tapPoint(page, { x: box.x + pos.x, y: box.y + pos.y });
};

/**
 * Tap an arc through the RENDERED MIDPOINT of its two endpoints (B-106
 * ruling 2; test-side math — the UI computes nothing, R1). Re-reads
 * positions on every call: a block/lift/placement rebuild re-fits the view,
 * so stale coordinates would miss.
 */
const tapEdgeMidpoint = async (
  page: Page,
  arc: { id: string; source: string; target: string },
  endpoints?: string,
): Promise<void> => {
  await settle(page);
  const source = expectPosition(await readRenderedPosition(page, arc.source));
  const target = expectPosition(await readRenderedPosition(page, arc.target));
  const box = await canvasBox(page);
  // B-133 review (D91): the D91 world made this tap precision-sensitive —
  // the boot zoom dipped while the dock's home settled, and a placed
  // waypoint's C7 we- edges crowd the line's midpoint corridor (a tap there
  // can land on the waypoint node or a we- edge instead). A user taps again,
  // somewhere else ON the line; the helper samples along the segment and
  // verifies the arc panel ANSWERED — with the caller's endpoints text when
  // given, so a we- edge's panel never passes for the target arc's.
  const answered = async (): Promise<boolean> => {
    if (!(await page.getByTestId('tme-arc-panel').isVisible().catch(() => false))) return false;
    if (endpoints === undefined) return true;
    return (await page.getByTestId('tme-arc-endpoints').textContent()) === endpoints;
  };
  for (const f of [0.5, 0.35, 0.65, 0.42, 0.58]) {
    await tapPoint(page, {
      x: box.x + source.x + (target.x - source.x) * f,
      y: box.y + source.y + (target.y - source.y) * f,
    });
    if (await answered()) return;
  }
};

/**
 * The F26 gap aim: the midpoint between the outskirts and castle rendered
 * positions, offset PERPENDICULAR to their line by 200 MODEL units on the
 * south-west side (away from the Miyama cluster). Test-side math from seam
 * reads only (R1). The offset clears the castle arc's touch hit corridor
 * (width/2 + 24/zoom ≈ 87 model units at the phone fit) by ~113 units, and
 * the kNN-3 membership is stable for ANY offset on this side: the competitor
 * distances grow faster than the endpoints' (matou² = 56125 + 289.2·t + t²
 * vs castle² = 56425 + t²), so C7's k=3 connects {castle, outskirts, matou}
 * and the castle rejoins the connected graph THROUGH the waypoint.
 */
const GAP_OFFSET_MODEL_UNITS = 200;
const gapPoint = async (page: Page): Promise<Point> => {
  await settle(page);
  const source = expectPosition(await readRenderedPosition(page, CASTLE_ARC.source));
  const target = expectPosition(await readRenderedPosition(page, CASTLE_ARC.target));
  const zoom = await page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.zoom();
  });
  const box = await canvasBox(page);
  const dx = source.x - target.x;
  const dy = source.y - target.y;
  const len = Math.hypot(dx, dy);
  // Perpendicular unit vector (-dy, dx)/len points south-west here (the
  // source Outskirts sits right-down of the castle in rendered space, and
  // rendered y grows downward like model y — C9).
  return {
    x: box.x + (source.x + target.x) / 2 + (-dy / len) * GAP_OFFSET_MODEL_UNITS * zoom,
    y: box.y + (source.y + target.y) / 2 + (dx / len) * GAP_OFFSET_MODEL_UNITS * zoom,
  };
};

/**
 * The §6.2 compound-box aim: a point just inside the Miyama district box's
 * bottom-left corner (runtime read off the B-104 bounding-box seam, so it is
 * viewport-independent). Off every CHILD: the nearest child center
 * (Ryuudou Temple) sits ~35px away rendered at the phone fit — outside the
 * 22·zoom + [2|8] px node hit radius (probed at both viewports); a child tap
 * would SELECT (B-105), not place. Edges cannot win the pick: nodes draw
 * above edges (installed cytoscape 3.34.3, z-index-compare 'auto' — "always
 * draws edges under nodes", cytoscape.cjs.js z-order docs).
 */
const miyamaBoxCorner = async (page: Page): Promise<Point> => {
  await settle(page);
  const box = await page.evaluate((): { x: number; y: number; w: number; h: number } => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    const b = hook.nodeRenderedBoundingBox('district-miyama');
    if (b === null) throw new Error('district-miyama not rendered');
    return b;
  });
  const host = await canvasBox(page);
  return { x: host.x + box.x + 8, y: host.y + box.y + box.h - 8 };
};

/**
 * The `phone` playwright project runs the iPhone 13 device on WebKit, and a
 * CDP session exists only in Chromium. Playwright's touchscreen API has no
 * drag primitive, so the touch-drag gesture below (§6.2 tap-vs-drag) runs on
 * a Chromium page with the SAME iPhone 13 emulation — the
 * interactions.e2e-spec.ts twin pattern.
 */
const withPhoneChromiumPage = async (run: (page: Page) => Promise<void>): Promise<void> => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readRenderedPosition(page, 'emiya-residence')).not.toBeNull();
    await run(page);
  } finally {
    await browser.close();
  }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One-finger drag through CDP Input.dispatchTouchEvent (touchscreen has no
 * drag). The 200ms HOLD before the release is load-bearing (the
 * editor-panel-regime gotcha): a touchEnd landing immediately after the last
 * move leaves Chromium's gesture recognizer half-armed and the NEXT tap's
 * click is silently dropped — the B-120 stability cell follows its drag with
 * taps, so the hold is mandatory here.
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
 * Two-finger pinch synthesized through CDP (the interactions.e2e-spec.ts
 * twin): two touchPoints touching down, spreading `from` → `to` px around
 * the center, lifting. Pinch-zoom is native touch under userZoomingEnabled
 * — the B-120 stability cell's zoom-in gesture on the phone.
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
  await sleep(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

/**
 * B-133c (D91) coverage guard — the reference implementation's shape
 * (editor-quick-connect @ 5006574), with two probe-derived extensions: the
 * band rects read the panel HOSTS (a scrolled sheet's content rect spans
 * far past the viewport — the host is the visible band), and the ARC panel
 * joins the bands. The dodge is ONE background mouse drag (a drag is not a
 * tap — no placement, no selection); its start is a live clear-canvas point
 * found via elementFromPoint between the top chrome and the topmost band,
 * clear of every rendered node (editor-mode drags grab nodes) — the id list
 * takes RUNTIME EXTRAS because this spec places nodes whose engine ids are
 * only knowable live (C5/D75). Phone-only (D53): desktop stays
 * byte-identical.
 */
const WP_NODE_IDS = [
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

interface CoverBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const coveringBands = (page: Page): Promise<Record<string, CoverBox | null>> =>
  page.evaluate((): Record<string, CoverBox | null> => {
    const boxOf = (sel: string, host: boolean): CoverBox | null => {
      const el = host ? document.querySelector(sel) : document.querySelector(`[data-testid="${sel}"]`);
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return r.width === 0 && r.height === 0
        ? null
        : { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    return {
      chip: boxOf('tme-selection-chip', false),
      prop: boxOf('tme-property-panel', true), // the HOST: the visible clamped band
      route: boxOf('tme-route-panel', true),
      rail: boxOf('tme-sheet-rail', false),
      arc: boxOf('tme-arc-panel', true),
      header: boxOf('tme-header', false),
      breadcrumb: boxOf('tme-breadcrumb', false),
    };
  });

const bandCovers = (pt: Point, band: CoverBox | null): boolean =>
  // EXACT DOM containment (+4px boundary safety) — the reference predicate
  // (probe-proven: a comfort margin false-positives fittable corridors).
  band !== null &&
  pt.x >= band.left - 4 &&
  pt.x <= band.left + band.width + 4 &&
  pt.y >= band.top - 4 &&
  pt.y <= band.top + band.height + 4;

/** One background drag carrying every aim above the CURRENT bands, clamped below the top chrome. */
const dodgeBands = async (
  page: Page,
  aims: readonly Point[],
  boxes: Record<string, CoverBox | null>,
  extraNodeIds: readonly string[] = [],
): Promise<void> => {
  const canvas = await canvasBox(page);
  let panDy = 0;
  for (const band of [boxes.prop, boxes.route, boxes.rail, boxes.arc]) {
    if (band === null) continue;
    for (const t of aims) {
      if (t.y > band.top - 16) panDy = Math.min(panDy, band.top - 16 - t.y);
    }
  }
  if (boxes.chip !== null) {
    const chip = boxes.chip;
    for (const t of aims) {
      if (t.x + 22 > chip.left && t.y + 22 > chip.top && t.y - 22 < chip.top + chip.height) {
        panDy = Math.min(panDy, chip.top + chip.height + 16 - t.y);
      }
    }
  }
  const topFloor = Math.max(
    ...[boxes.header, boxes.breadcrumb, boxes.chip].map((b) => (b === null ? 0 : b.top + b.height)),
    0,
  );
  if (topFloor > 0) {
    const needed = Math.max(...aims.map((t) => topFloor + 16 - t.y));
    if (needed > panDy) panDy = needed;
  }
  if (panDy < -8 || panDy > 8) {
    const panRead = (): Promise<{ x: number; y: number }> =>
      page.evaluate((): { x: number; y: number } => {
        const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
        if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
        return hook.pan();
      });
    const panBefore = await panRead();
    // The drag's START must be a clear CANVAS point clear of every rendered
    // node (only the down point matters — cytoscape captures the pointer).
    const start = await page.evaluate(
      ({ canvasBox: cb, top, floor, ids }): Point | null => {
        const hook = (window as unknown as {
          __TME_E2E__?: { nodeRenderedPosition(id: string): { x: number; y: number } | null };
        }).__TME_E2E__;
        if (hook === undefined) return null;
        const bands = [top.prop, top.route, top.rail, top.arc].filter((b) => b !== null);
        const minBand =
          bands.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...bands.map((b) => b.top));
        const nodePts = ids
          .map((id: string) => hook.nodeRenderedPosition(id))
          .filter((p): p is { x: number; y: number } => p !== null);
        for (const fx of [0.5, 0.2, 0.8, 0.35, 0.65]) {
          for (let y = floor + 12; y < minBand - 12; y += 8) {
            const x = cb.x + cb.width * fx;
            const el = document.elementFromPoint(x, y);
            if (el === null || el.closest('.tme-canvas') === null) continue;
            // A mousedown on a node GRABS it (editor mode) — the start must
            // clear every node by more than the touch slop (~22·zoom + 8 px).
            if (nodePts.some((p) => Math.hypot(p.x + cb.x - x, p.y + cb.y - y) < 26)) continue;
            return { x, y };
          }
        }
        return null;
      },
      {
        canvasBox: canvas,
        top: { prop: boxes.prop, route: boxes.route, rail: boxes.rail, arc: boxes.arc },
        floor: topFloor,
        ids: [...WP_NODE_IDS, ...extraNodeIds],
      },
    );
    if (start === null) {
      throw new Error(
        `dodgeBands: no clear canvas drag start (topFloor=${topFloor}, bands=${boxes.rail?.top ?? 'x'}/${boxes.prop?.top ?? 'x'}/${boxes.arc?.top ?? 'x'})`,
      );
    }
    // Drag up = content up; the map translates uniformly, so every aim clears together.
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + panDy, { steps: 4 });
    await page.mouse.up();
    const panAfter = await panRead();
    if (Math.abs(panAfter.y - panBefore.y) < 8) {
      throw new Error(`dodgeBands: the drag panned nothing (start ${Math.round(start.x)},${Math.round(start.y)})`);
    }
  }
};

/**
 * The canvas tap, coverage-guarded: re-derives the aim FRESH (a dodge pans
 * the map — old coordinates are stale), checks it against the live bands,
 * and dodges only when covered. Fails with the geometry when the corridor
 * cannot fit rather than tapping blind. Phone-only (D53).
 */
const tapAimed = async (page: Page, aim: () => Promise<Point>): Promise<void> => {
  if (!isPhone()) {
    await tapPoint(page, await aim());
    return;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const pt = await aim();
    const boxes = await coveringBands(page);
    if (
      ![boxes.chip, boxes.prop, boxes.route, boxes.rail, boxes.arc].some((band) =>
        bandCovers(pt, band),
      )
    ) {
      await tapPoint(page, pt);
      return;
    }
    await dodgeBands(page, [pt], boxes);
  }
  const pt = await aim();
  const boxes = await coveringBands(page);
  throw new Error(
    `tapAimed: the aim point (${Math.round(pt.x)},${Math.round(pt.y)}) stays covered — chip=${boxes.chip?.top ?? 'x'} prop=${boxes.prop?.top ?? 'x'} route=${boxes.route?.top ?? 'x'} rail=${boxes.rail?.top ?? 'x'} arc=${boxes.arc?.top ?? 'x'}`,
  );
};

/**
 * A coverage-clear gesture start: re-derives the aim FRESH, dodges while
 * covered, and returns the clear point for the caller's own gesture (the
 * zoomed move cell's CDP drag start). Phone-only (D53): desktop returns the
 * plain aim.
 */
const clearAimed = async (page: Page, aim: () => Promise<Point>): Promise<Point> => {
  if (!isPhone()) return aim();
  for (let attempt = 0; attempt < 3; attempt++) {
    const pt = await aim();
    const boxes = await coveringBands(page);
    if (
      ![boxes.chip, boxes.prop, boxes.route, boxes.rail, boxes.arc].some((band) =>
        bandCovers(pt, band),
      )
    ) {
      return pt;
    }
    await dodgeBands(page, [pt], boxes);
  }
  const pt = await aim();
  const boxes = await coveringBands(page);
  throw new Error(
    `clearAimed: the aim point (${Math.round(pt.x)},${Math.round(pt.y)}) stays covered — chip=${boxes.chip?.top ?? 'x'} prop=${boxes.prop?.top ?? 'x'} route=${boxes.route?.top ?? 'x'} rail=${boxes.rail?.top ?? 'x'} arc=${boxes.arc?.top ?? 'x'}`,
  );
};

/**
 * B-133c (D91): the pinch center picked LIVE from clear canvas — the twin's
 * old chrome-box derivation ignored the overlay bands (the property sheet
 * opened by node A's selection rides over the stage's lower band), and its
 * center landed on the sheet's own content so the pinch drugged the panel,
 * never the map. The clear point answers elementFromPoint as the canvas
 * host, sits between the top chrome and the topmost band, clears every
 * rendered node by more than the touch slop (a finger on a node is a grab,
 * not a pinch), and leaves room for the spread.
 */
const clearPinchCenter = async (
  page: Page,
  extraNodeIds: readonly string[] = [],
): Promise<{ center: Point; spreadMax: number }> => {
  const canvas = await canvasBox(page);
  const found = await page.evaluate(
    ({ canvasBox: cb, ids }): { center: Point; spreadMax: number } | null => {
      const hook = (window as unknown as {
        __TME_E2E__?: { nodeRenderedPosition(id: string): { x: number; y: number } | null };
      }).__TME_E2E__;
      if (hook === undefined) return null;
      const bandTops: number[] = [];
      let floor = 0;
      const addBand = (sel: string, host: boolean, isFloor: boolean): void => {
        const el = host ? document.querySelector(sel) : document.querySelector(`[data-testid="${sel}"]`);
        if (el === null) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (isFloor) floor = Math.max(floor, r.top + r.height);
        else bandTops.push(r.top);
      };
      for (const sel of ['tme-property-panel', 'tme-route-panel', 'tme-arc-panel']) addBand(sel, true, false);
      addBand('tme-sheet-rail', false, false);
      addBand('tme-header', false, true);
      addBand('tme-breadcrumb', false, true);
      addBand('tme-selection-chip', false, true);
      const minBand = bandTops.length === 0 ? cb.y + cb.height : Math.min(...bandTops);
      const nodePts = ids
        .map((id: string) => hook.nodeRenderedPosition(id))
        .filter((p): p is { x: number; y: number } => p !== null);
      for (let y = floor + 16; y < minBand - 16; y += 8) {
        for (const fx of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const x = cb.x + cb.width * fx;
          const el = document.elementFromPoint(x, y);
          if (el === null || el.closest('.tme-canvas') === null) continue;
          if (nodePts.some((p) => Math.hypot(p.x + cb.x - x, p.y + cb.y - y) < 30)) continue;
          const spreadMax = Math.min(120, x - cb.x - 12, cb.x + cb.width - x - 12);
          if (spreadMax >= 40) return { center: { x, y }, spreadMax };
        }
      }
      return null;
    },
    { canvasBox: canvas, ids: [...WP_NODE_IDS, ...extraNodeIds] },
  );
  if (found === null) {
    throw new Error('clearPinchCenter: no clear canvas corridor for the pinch (D91 bands cover it)');
  }
  return found;
};

test.describe('tap-to-place waypoints (PKG B-109)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readRenderedPosition(page, 'emiya-residence')).not.toBeNull();
  });

  test('background tap places one top-level waypoint with its k=3 kNN edges (F10/D21/C7/C5, §6.2, D76)', async ({
    page,
  }) => {
    const before = await readState(page);
    expect(before.labels.filter((l) => l === 'Waypoint')).toHaveLength(0);
    expect(before.weIds).toHaveLength(0);

    // D76/B-120: the placement contract — editor mode first, then the
    // Waypoint tool; the background tap that follows places the waypoint.
    await enterEditorWaypointTool(page);
    await tapPoint(page, await screenModelPoint(page, BG_MODEL_POINT));

    // F10/D21: exactly one 'Waypoint' appears — the plain-word C23 label of
    // the chat-state overlay node, rendered on the ACTIVE layer (D69).
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);

    // C5: the engine assigned the id (counter starts at 1; FX1 authors no
    // wp- ids — deterministic from a fresh facade). §6.2: the placement is
    // TOP-LEVEL — addUserNodeAt never parents user nodes (validate.ts
    // rejects `parent` on them), even though this tap was a plain
    // background tap.
    expect(await readNodeParent(page, 'wp-1')).toBeNull();

    // C7: k=3 nearest leaves of the merged set — layer-fuyuki holds 13
    // leaves ≥ k, so exactly 3 `we-` user edges appear (walk-only, C14).
    const after = await readState(page);
    expect(after.weIds).toHaveLength(3);
    expect(new Set(after.weIds).size).toBe(3); // C5: no id collisions

    // The waypoint renders exactly at the tap point: BG_MODEL_POINT is inside
    // the fitted content bbox and a placement never refits (B-120), so the
    // rendered position must round-trip within screen-px noise (seam read,
    // test-side only — the UI did no coordinate math, R1).
    const wp = expectPosition(await readRenderedPosition(page, 'wp-1'));
    const aim = await modelPoint(page, BG_MODEL_POINT);
    expect(Math.hypot(wp.x - aim.x, wp.y - aim.y)).toBeLessThanOrEqual(3);

    // The waypoint placement writes NO selection (B-109 semantics, unchanged
    // by the editor gate) — no chip appears from the placement tap. And D35:
    // no double-tap gesture is bound — a single tap placed exactly one
    // waypoint (the rapid double-tap case is its own test below).
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
  });

  test('the F26 loop: block the only road, place a waypoint in the gap, the sidebar re-routes LIVE through it, lift restores (F26/C7/C14/C17/D74)', async ({
    page,
  }) => {
    // Pre-state: the walk route pin → castle is FX1's 30 + 240 = 270 min.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-total')).toHaveText('270 min');

    // Block the ONLY road (chat-scoped, reason 'Rockslide' — the B-106 flow).
    await tapEdgeMidpoint(page, CASTLE_ARC, 'Outskirts ↔ Einzbern Castle');
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await page.getByTestId('tme-arc-reason-input').fill('Rockslide');
    if (isPhone()) await page.getByTestId('tme-arc-block').tap();
    else await page.getByTestId('tme-arc-block').click();
    // C2: excluded from routing but still DRAWN — dashed.
    await expect.poll(() => readEdgeLineStyle(page, CASTLE_ARC.id)).toBe('dashed');

    // C17 live: the same selection now renders the core's verbatim reason.
    // B-133 (D91) review fix: the arc selection left the route sheet expanded
    // OVER the castle's point with the arc sheet below it — a castle tap
    // there lands on the sheet header band. Clear the panels first: collapse
    // the route sheet, background-tap the visible top strip (closes the arc
    // panel — blocks are overlay state and survive), then the castle tap
    // lands clean. Setup, not assertion.
    await collapseRouteSheet(page);
    await clearCanvasTap(page); // B-D2 re-baseline: the probed background clear (cited in the helper)
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await tapNode(page, CASTLE_ID);
    // The re-select re-expands the sheet (B-114); if the guard collapsed it
    // en route instead, restore it for the route-body reads below.
    if (isPhone() && (await page.getByTestId('tme-sheet-rail').getAttribute('aria-expanded')) === 'false') {
      await page.getByTestId('tme-sheet-rail').click();
      await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'true');
    }
    await expect(page.getByTestId('tme-unreachable')).toHaveText(BLOCKED_REASON_TEXT);
    const legsBlocked = await page.getByTestId('tme-leg').count(); // 0: an unreachable state renders no legs

    // Place a waypoint in the gap between Outskirts and the castle — the F26
    // flow under D76/B-120: enter the editor, pick the Waypoint tool, tap the
    // gap. The waypoint's C7 kNN edges (castle, outskirts, matou — see
    // gapPoint) reconnect the castle TOPOLOGICALLY through the waypoint.
    // B-133 (D91) review fix: clear the leftover selection first (the editor
    // entry would maximize the property panel over the gap) and collapse the
    // route sheet (its expanded body covers the gap's tap point); the castle
    // re-select below re-expands the sheet for the route asserts. Setup, not
    // assertion.
    if (await page.getByTestId('tme-selection-chip').isVisible()) {
      if (isPhone()) await page.getByTestId('tme-selection-chip').tap();
      else await page.getByTestId('tme-selection-chip').click();
      await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    }
    await collapseRouteSheet(page);
    const before = await readState(page);
    await enterEditorWaypointTool(page);
    await tapPoint(page, await gapPoint(page));
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);
    const afterPlace = await readState(page);
    expect(afterPlace.weIds.length - before.weIds.length).toBe(3); // C7 k=3
    // The candidate `we-` ids of this placement (engine-assigned, C5) — the
    // derivation basis for the we- leg assertions below: no leg-id seam
    // exists, so the prefix is proven structurally (B-109 deviation 2's
    // derivation pattern; C23 keeps the ids out of every displayed string).
    const newWeIds = afterPlace.weIds.filter((id) => !before.weIds.includes(id));
    expect(newWeIds).toHaveLength(3);
    expect(newWeIds.every((id) => id.startsWith('we-'))).toBe(true);

    // Re-select the castle: the sidebar re-routes LIVE (graphRevision is the
    // route computed's dependency, B-106 ruling 4). F26 under D74: with the
    // block STILL active the reconnected path — pin → authored Miyama arcs →
    // the kNN leaf (matou) → `we-` → waypoint → `we-` → castle — is a MIXED
    // path, and D74's honest canonical fallback prices it in ONE min
    // currency (authored legs keep their authored minutes; `we-` legs price
    // geometrically; D72 labels the run) instead of the pre-D74 D60(b)
    // refusal — so the unreachable state CLEARS.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-unreachable')).toHaveCount(0); // D60(b) wall gone (D74)
    const legs = page.getByTestId('tme-leg');
    // The FINAL leg rides a `we-` edge, proven by derivation: its from-label
    // is the waypoint's C23 label ('Waypoint' — never the wp- id), and the
    // waypoint's ONLY incident arcs are the derived `we-` ids above (C7: a
    // user node connects exclusively via engine-assigned we- edges), so the
    // final leg's arcId ∈ newWeIds and carries the we- prefix.
    await expect(legs.last()).toHaveText(/^Waypoint → Einzbern Castle · walk · [\d.]+$/);
    const legCount = await legs.count();
    expect(legCount).toBeGreaterThan(legsBlocked); // the leg count grows vs the blocked state
    expect(legCount).toBeGreaterThanOrEqual(3); // ≥1 authored leg + the two we- rides
    // The penultimate leg ends AT the waypoint (the last `we-` ride in).
    await expect(legs.nth(legCount - 2)).toHaveText(/→ Waypoint · walk · [\d.]+$/);
    // D74/D72: one honest min currency — the total line ends in min.
    await expect(page.getByTestId('tme-total')).toHaveText(/ min$/);
    expect((await readState(page)).weIds.length - before.weIds.length).toBe(3); // we- edges persist

    // C2: the dashed arc is still tappable — the lift stays reachable.
    // B-133 (D91) review fix: exit the editor first — the placement flow left
    // the editor in Waypoint-tool mode (a background "clear" tap there is a
    // PLACEMENT, not a clear — two of this cell's repair drafts learned that
    // the hard way), and view mode is the regime the block site above
    // already proved the line tappable in. The waypoint and its we- edges
    // persist (overlay state survives the mode switch); the tail re-selects
    // the castle regardless.
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'false');
    await collapseRouteSheet(page);
    await clearCanvasTap(page); // B-D2 re-baseline: the probed background clear (cited in the helper)
    await tapEdgeMidpoint(page, CASTLE_ARC, 'Outskirts ↔ Einzbern Castle');
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-arc-lift')).toBeEnabled();
    if (isPhone()) await page.getByTestId('tme-arc-lift').tap();
    else await page.getByTestId('tme-arc-lift').click();
    await expect.poll(() => readEdgeLineStyle(page, CASTLE_ARC.id)).toBe('solid');

    // The authored road is back: the walk route restores verbatim (the
    // minutes run prices authored arcs only — the user edges cannot enter a
    // minutes run, C14/D60(b)), and the waypoint plus its edges persist.
    // B-133 (D91) review fix: the open arc sheet rides ABOVE the collapsed
    // route rail in the stack, pushing the rail band up over the castle's
    // point — a castle tap there would toggle the rail instead. Close the
    // arc panel with a top-strip clear first (view semantics; the block was
    // already lifted), then the castle tap lands on canvas.
    await clearCanvasTap(page); // B-D2 re-baseline: the probed background clear (cited in the helper)
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await tapNode(page, CASTLE_ID);
    // The pre-lift collapse left the sheet collapsed and the castle re-select
    // is the SAME selection the pre-lift clear already cleared — either way
    // B-114's auto-expand may not have fired: restore the body for the reads.
    if (isPhone() && (await page.getByTestId('tme-sheet-rail').getAttribute('aria-expanded')) === 'false') {
      await page.getByTestId('tme-sheet-rail').click();
      await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'true');
    }
    await expect(page.getByTestId('tme-unreachable')).toHaveCount(0);
    await expect(page.getByTestId('tme-leg')).toHaveCount(2);
    await expect(page.getByTestId('tme-total')).toHaveText('270 min');
    expect((await readState(page)).weIds.length - before.weIds.length).toBe(3);
    expect((await readLabels(page)).filter((l) => l === 'Waypoint')).toHaveLength(1);
  });

  test('two rapid background taps place two waypoints with engine-assigned ids; no page artifacts (C5/§6.2/D35)', async ({
    page,
  }) => {
    const before = await readState(page);
    expect(before.weIds).toHaveLength(0);

    // D76/B-120: editor + Waypoint tool, then two rapid taps at two DISTINCT
    // clear background points (both model-vetted; ~560 model units apart, so
    // the second tap clears the first waypoint's node hit disk and its 3 we-
    // edge corridors). §6.2: rapid taps are discrete taps (D35: no
    // double-tap gesture is bound); C5: the engine assigns collision-free
    // ids.
    await enterEditorWaypointTool(page);
    await tapPoint(page, await screenModelPoint(page, BG_MODEL_POINT));
    await tapPoint(page, await screenModelPoint(page, BG_MODEL_POINT_2));

    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(2);
    const after = await readState(page);
    // 3 user edges per placement (C7 k=3), all engine-assigned and unique.
    expect(after.weIds.length - before.weIds.length).toBe(6);
    expect(new Set(after.weIds).size).toBe(after.weIds.length);
    expect(await readNodeParent(page, 'wp-1')).toBeNull(); // C5/§6.2: top-level
    expect(await readNodeParent(page, 'wp-2')).toBeNull();

    // §6.2: touch-action: none on the canvas host — no double-tap page zoom
    // or scroll artifacts (on desktop the invariant holds trivially; the
    // double-tap-zoom suppression itself is a touch-browser behavior).
    expect(await readScrollY(page)).toBe(0);
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
  });

  test('desktop: a small background drag pans the map and places NOTHING; a view-mode background TAP places nothing too (§6.2 tap-vs-drag, D76)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'mouse drag runs on desktop; the touch twin is the phone test below (D53)');
    const start = await screenModelPoint(page, BG_MODEL_POINT);
    const panBefore = await readPan(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 25, { steps: 8 });
    await page.mouse.up();

    const panAfter = await readPan(page);
    expect(panAfter.x).not.toBe(panBefore.x); // the gesture PANNED…
    expect((await readLabels(page)).filter((l) => l === 'Waypoint')).toHaveLength(0); // …and never placed

    // B-120 (D76) extension: in VIEW mode even a clean background TAP places
    // nothing — the gesture clears the selections only. Node count (and the
    // we- set) is unchanged by the tap.
    const before = await readState(page);
    await settle(page);
    const aim = await screenModelPoint(page, BG_MODEL_POINT_2);
    await page.mouse.click(aim.x, aim.y);
    await settle(page);
    const after = await readState(page);
    expect(after.labels.length, 'a view-mode background tap places NOTHING (D76)').toBe(before.labels.length);
    expect(after.labels.filter((l) => l === 'Waypoint')).toHaveLength(0);
    expect(after.labels.filter((l) => l === 'New place')).toHaveLength(0);
    expect(after.weIds).toHaveLength(before.weIds.length);
  });

  test('phone: a touch drag on the background pans and places NOTHING (§6.2 tap-vs-drag, D53)', async () => {
    // Still true in BOTH modes since D76/B-120 — in view mode trivially so
    // (nothing is ever placed there); this cell stays in view mode.
    test.skip(!isPhone(), 'touch-drag needs the touch-emulated project');
    await withPhoneChromiumPage(async (page) => {
      const panBefore = await readPan(page);
      const cdp = await page.context().newCDPSession(page);
      const box = await canvasBox(page);
      const start = await modelPoint(page, BG_MODEL_POINT);
      await cdpTouchDrag(cdp, { x: box.x + start.x, y: box.y + start.y }, 60, 25);
      const panAfter = await readPan(page);
      expect(panAfter.x).not.toBe(panBefore.x); // panned, not tapped
      expect((await readLabels(page)).filter((l) => l === 'Waypoint')).toHaveLength(0);
      expect(await readScrollY(page)).toBe(0);
    });
  });

  test('tap inside the Miyama district box, off every child, places a TOP-LEVEL waypoint — editor + Waypoint tool (§6.2, B-109 ruling 2, D76)', async ({
    page,
  }) => {
    const before = await readState(page);
    expect(before.labels.filter((l) => l === 'Waypoint')).toHaveLength(0);

    // D76/B-120: the compound-box placement joins every other placement kind
    // behind editor mode + the Waypoint tool (the view-mode box tap is the
    // no-op cell below).
    await enterEditorWaypointTool(page);
    await tapPoint(page, await miyamaBoxCorner(page));

    // The compound parent's box is a placement tap, not a selection: exactly
    // one waypoint appears, the chip stays hidden (a child tap would have
    // selected it — B-105 semantics), and the waypoint is TOP-LEVEL in the
    // layer (addUserNodeAt never parents user nodes — §6.2).
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);
    expect(await readNodeParent(page, 'wp-1')).toBeNull();
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    const after = await readState(page);
    expect(after.weIds.length - before.weIds.length).toBe(3); // C7 k=3 (leaves only)
  });

  test('node and edge taps keep their M2 semantics — a placement never fires (B-105/B-106 pin)', async ({
    page,
  }) => {
    // B-133 (D91): the boot-expanded route sheet covers the station's tap
    // point — collapse it first; the selection below re-expands it for the
    // tme-target read. Setup, not assertion.
    await collapseRouteSheet(page);
    // A leaf-node tap selects (chip + route panel) and places nothing.
    await tapNode(page, STATION_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(STATION_LABEL);
    await expect(page.getByTestId('tme-target')).toContainText(STATION_LABEL);
    expect((await readLabels(page)).filter((l) => l === 'Waypoint')).toHaveLength(0);

    // An edge tap opens the arc panel and places nothing.
    await tapEdgeMidpoint(page, CASTLE_ARC, 'Outskirts ↔ Einzbern Castle');
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-arc-endpoints')).toHaveText('Outskirts ↔ Einzbern Castle');
    expect((await readLabels(page)).filter((l) => l === 'Waypoint')).toHaveLength(0);
  });

  test('phone 375px: waypoint placement by touch alone, no horizontal scroll (F52/D53, D76)', async ({ page }) => {
    test.skip(!isPhone(), 'the 375px geometry check belongs to the phone project (D53)');
    await page.setViewportSize({ width: 375, height: 667 });
    await settle(page);
    await expect.poll(() => readRenderedPosition(page, CASTLE_ARC.source)).not.toBeNull();

    // D76/B-120: editor + Waypoint tool by touch alone, then background
    // placement via runtime-derived aims (the fit changed with the narrower
    // stage, so fixed constants would be stale here).
    await enterEditorWaypointTool(page);
    const before = await readState(page);
    const gap = await gapPoint(page);
    await page.touchscreen.tap(gap.x, gap.y);
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);
    expect((await readState(page)).weIds.length - before.weIds.length).toBe(3); // C7

    // Compound-box placement, touch only, top-level (§6.2).
    const corner = await miyamaBoxCorner(page);
    await page.touchscreen.tap(corner.x, corner.y);
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(2);
    expect(await readNodeParent(page, 'wp-2')).toBeNull();

    // D53/F52: never horizontal scroll at 375px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);
  });

  // --- B-120 (D76): the view-mode no-op pins + the tool regime ---------------

  test('view mode: a background tap clears the selections and places NOTHING (D76/B-120)', async ({
    page,
  }) => {
    // A selection is open (the M2 dismiss ergonomics the view-mode tap keeps).
    await tapNode(page, STATION_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(STATION_LABEL);

    // D91 aiming repair (B-133c): the aim is derived AFTER the selection is
    // open, so the route floater's avoid-the-selection anchor (the station
    // sits right ⇒ the floater anchors bottom-left) is part of the hit-test
    // the derivation reads — the tap that lands is a genuine canvas
    // background tap. The observable is unchanged.
    const aim = await backgroundAim(page);

    // D76: view mode is purely navigational — the background tap's ONLY
    // effect is clearing both selections. The node count is unchanged and no
    // placement kind (authored node or waypoint) appeared.
    const before = await readState(page);
    await tapPoint(page, aim);
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    const after = await readState(page);
    expect(after.labels.length, 'a view-mode background tap places NOTHING (D76)').toBe(
      before.labels.length,
    );
    expect(after.labels.filter((l) => l === 'Waypoint')).toHaveLength(0);
    expect(after.labels.filter((l) => l === 'New place')).toHaveLength(0);
    expect(after.weIds).toHaveLength(before.weIds.length);
  });

  test('view mode: a compound-box tap is a no-op — nothing placed, the selection survives (D76/B-120)', async ({
    page,
  }) => {
    // A selection is open, then the box tap: the box is not a selectable
    // leaf and placement is editor-only — NOTHING happens (the chip survives
    // untouched, unlike the background tap's clear).
    await tapNode(page, STATION_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    const before = await readState(page);
    await tapPoint(page, await miyamaBoxCorner(page));
    await settle(page);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(STATION_LABEL);
    const after = await readState(page);
    expect(after.labels.length, 'a view-mode compound-box tap is a no-op (D76)').toBe(
      before.labels.length,
    );
    expect(after.labels.filter((l) => l === 'Waypoint')).toHaveLength(0);
    expect(after.weIds).toHaveLength(before.weIds.length);
  });

  test('the Waypoint tool round-trips: place from the editor, remove from the panel; the tool resets on re-entry (D76/B-110/B-120)', async ({
    page,
  }) => {
    await enterEditorWaypointTool(page);
    await tapPoint(page, await screenModelPoint(page, BG_MODEL_POINT));
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);

    // The placed waypoint is an ordinary selection target (B-110): the
    // Waypoint section renders and Remove takes it — the editor gate changed
    // the ENTRY, not the management.
    await tapNode(page, 'wp-1');
    await expect(page.getByTestId('tme-waypoint')).toBeVisible();
    await activate(page, 'tme-waypoint-remove');
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(0);

    // B-120: exitEditor KEEPS the tool, the next enterEditor RESETS it to
    // Node — every editor session starts from the authored-node default.
    await activate(page, 'tme-editor-toggle'); // exit (Waypoint still chosen)
    await expect(page.getByTestId('tme-editor-tools')).toBeHidden();
    await activate(page, 'tme-editor-toggle'); // re-enter
    await expect(page.getByTestId('tme-editor-tools')).toBeVisible();
    await expect(page.getByTestId('tme-tool-node')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tme-tool-waypoint')).toHaveAttribute('aria-pressed', 'false');
  });

  // --- B-120 (R21 ruling 1): THE viewport-stability pin ----------------------
  //
  // Mutant discriminators: any placement/move/commit path that ends in a fit
  // (the pre-B-120 rebuildElements tail) moves zoom AND pan — the exact
  // equality below catches it. The pin deliberately starts AFTER the panels
  // opened by placing node A have settled (their open/close resize is the
  // pinned B-112 RO chain, untouched by this packet); from then on every
  // edit path is pure rebuild — the viewport must not move by a sub-pixel.

  test('desktop: place/move/property-commit and a Waypoint-tool placement while ZOOMED leave zoom and pan untouched (R21 ruling 1 / B-120)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'wheel zoom runs on desktop; the pinch twin is the phone cell below (D53)');

    // Editor with the default Node tool (B-116 behavior); node A pre-opens
    // the property-panel column and save dock — the RO refit that follows is
    // the B-112 chain, NOT under pin here.
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-tool-node')).toHaveAttribute('aria-pressed', 'true');
    await tapPoint(page, await screenModelPoint(page, BG_MODEL_POINT));
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'New place'))
      .toHaveLength(1);
    await settle(page); // let the panel-open RO refit land before noting

    // Zoom IN by wheel (user gesture). D81 (PKG B-125): the panel-open keeps
    // the preserved viewport (no refit), so the wheel aims at
    // BG_MODEL_POINT_2's own screen position — the zoom keeps the cursor
    // point fixed, holding that vetted placement aim in-canvas at any factor
    // — and the loop caps the factor near ×1.3 so the castle-arc gap point
    // (the Waypoint step's aim) stays in-canvas too (the pre-D81 panel-open
    // refit used to answer this narrowing).
    const fitZoom = await readZoom(page);
    const box = await canvasBox(page);
    const zoomAnchor = await modelPoint(page, BG_MODEL_POINT_2);
    await page.mouse.move(box.x + zoomAnchor.x, box.y + zoomAnchor.y);
    let ticks = 0;
    while ((await readZoom(page)) < fitZoom * 1.25 && ticks++ < 40) await page.mouse.wheel(0, -240);
    await settle(page);
    const zoom = await readZoom(page);
    expect(zoom, 'the zoom-in driver must actually zoom in').toBeGreaterThan(fitZoom * 1.15);
    const pan = await readPan(page);

    // PLACE a node while zoomed: placeNodeAt → rebuild, no fit.
    await tapPoint(page, await screenModelPoint(page, BG_MODEL_POINT_2));
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'New place'))
      .toHaveLength(2);
    expect(await readZoom(page), 'place while zoomed: zoom unchanged (R21 ruling 1)').toBe(zoom);
    expect(await readPan(page), 'place while zoomed: pan unchanged (R21 ruling 1)').toEqual(pan);

    // MOVE it while zoomed: drag → free → persistNodePosition → rebuild.
    const placedId = await readSelectedId(page);
    if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');
    const before = expectPosition(await readRenderedPosition(page, placedId));
    const start = await screenModelPoint(page, BG_MODEL_POINT_2);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 60, start.y + 8, { steps: 6 });
    await page.mouse.up();
    const after = expectPosition(await readRenderedPosition(page, placedId));
    expect(after.x, 'the editor drag moved the node').toBeGreaterThan(before.x + 40);
    expect(await readZoom(page), 'move while zoomed: zoom unchanged (R21 ruling 1)').toBe(zoom);
    expect(await readPan(page), 'move while zoomed: pan unchanged (R21 ruling 1)').toEqual(pan);

    // PROPERTY COMMIT while zoomed: rename via the property panel, Done.
    await page.getByTestId('tme-node-label-input').fill('Market Square');
    await activate(page, 'tme-node-done');
    await expect(page.getByTestId('tme-selection-label')).toHaveText('Market Square');
    expect(await readZoom(page), 'property commit while zoomed: zoom unchanged').toBe(zoom);
    expect(await readPan(page), 'property commit while zoomed: pan unchanged').toEqual(pan);

    // D91 aiming repair (B-133c): the standing overlays cover arbitrary model
    // points per their anchors — with 'Market Square' selected, the maximized
    // property panel anchors bottom-left OVER the vetted gap aim (found live),
    // so the author dismisses the selection first (the M2 affordance): the
    // property panel closes and the route floater swings to its no-selection
    // anchor, clearing the aim. The pin gains the dismissal as one more
    // zero-motion beat (D91: a panel close and a floater re-anchor move zoom
    // and pan NOT A BYTE).
    await activate(page, 'tme-selection-chip');
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    await expect(page.getByTestId('tme-property-panel')).toBeHidden();
    expect(await readZoom(page), 'dismissal: zoom unchanged (D91 zero-motion)').toBe(zoom);
    expect(await readPan(page), 'dismissal: pan unchanged (D91 zero-motion)').toEqual(pan);

    // WAYPOINT-tool placement while zoomed (the F26 path): tool switch, tap.
    await activate(page, 'tme-tool-waypoint');
    await tapPoint(page, await gapPoint(page));
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);
    expect(await readZoom(page), 'waypoint place while zoomed: zoom unchanged').toBe(zoom);
    expect(await readPan(page), 'waypoint place while zoomed: pan unchanged').toEqual(pan);
  });

  // B-133 (D91) REVIEW DEBT — RESTORED by B-133c (2026-10-06): the cell was
  // fixme'd because the pre-D91 pinch/drag geometry sat under the overlay
  // sheets and every in-place re-derivation missed the next coupling. The
  // B-133c medicine closes it: the pinch center derives LIVE from the
  // clear-canvas corridor (clearPinchCenter), the post-pinch canvas aims
  // (the BG_2 place/move point and the waypoint gap point) are dodged clear
  // with ONE user pan BEFORE the R21 pins are read (a user pan is not a
  // fit — the R21 ruling's own discriminator), and every canvas gesture
  // then runs coverage-guarded. The R21/B-120 pins themselves are
  // byte-equal in intent: place/move/property-commit/waypoint-place while
  // zoomed leave zoom and pan untouched.
  test('phone: pinch-zoom in, then place/move/property-commit while zoomed leave zoom and pan untouched (R21 ruling 1 / B-120, D53)', async () => {
    test.skip(!isPhone(), 'the in-test Chromium twin reproduces the iPhone-13 device identically from either project; wheel zoom is the desktop twin above');
    await withPhoneChromiumPage(async (page) => {
      // Editor + Node tool; node A pre-opens the phone's panels (sheet
      // expansion + property region) — settle their RO refit first.
      await activate(page, 'tme-editor-toggle');
      await expect(page.getByTestId('tme-tool-node')).toHaveAttribute('aria-pressed', 'true');
      await tapAimed(page, () => screenModelPoint(page, BG_MODEL_POINT));
      await expect
        .poll(async () => (await readLabels(page)).filter((l) => l === 'New place'))
        .toHaveLength(1);
      await settle(page);
      // C5/D75: node A's engine id, read live — the dodge/pinch corridors
      // must clear it too (a finger or mousedown on it grabs/places).
      const nodeAId = await readSelectedId(page);
      if (nodeAId === null) throw new Error('placed node A not selected (C5/D75 id discovery failed)');
      const runtimeIds = [nodeAId, 'wp-1'];

      // Pinch-IN with BOTH fingers on bare canvas — the B-133c clear-canvas
      // corridor center (between the top chrome and the topmost D91 band,
      // clear of every node, room for the spread).
      const fitZoom = await readZoom(page);
      const { center, spreadMax } = await clearPinchCenter(page, runtimeIds);
      const cdp = await page.context().newCDPSession(page);
      await cdpPinch(cdp, center, spreadMax * 0.65, spreadMax);
      await settle(page);
      const zoomedIn = await readZoom(page);
      expect(zoomedIn, 'the pinch driver must actually zoom in').toBeGreaterThan(fitZoom * 1.15);

      // B-133c (D91): the corridor-centered pinch pushes the cell's later
      // aims (the BG_2 place/move point and the waypoint gap point) DOWN
      // under the open property sheet — and the stack RE-FLOWS as the app's
      // own content changes (fact 1), so a once-cleared aim can become
      // covered again mid-cell. Before each zoomed gesture the aim is
      // re-cleared (ONE user pan when needed — a pan is not a fit) and the
      // pins are RE-READ: every pin below still measures exactly its own
      // gesture (the R21 no-fit discriminator), never the test's pan.
      const rePin = async (): Promise<{ zoom: number; pan: { x: number; y: number } }> => ({
        zoom: await readZoom(page),
        pan: await readPan(page),
      });

      // PLACE while zoomed.
      await clearAimed(page, () => screenModelPoint(page, BG_MODEL_POINT_2));
      let pins = await rePin();
      await tapAimed(page, () => screenModelPoint(page, BG_MODEL_POINT_2));
      await expect
        .poll(async () => (await readLabels(page)).filter((l) => l === 'New place'))
        .toHaveLength(2);
      expect(await readZoom(page), 'place while zoomed: zoom unchanged (R21 ruling 1)').toBe(pins.zoom);
      expect(await readPan(page), 'place while zoomed: pan unchanged (R21 ruling 1)').toEqual(pins.pan);

      // MOVE while zoomed (CDP touch drag, hold-terminated) — the drag
      // start is coverage-cleared first (the property sheet is open on the
      // placed node's selection).
      const placedId = await readSelectedId(page);
      if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');
      const start = await clearAimed(page, () => screenModelPoint(page, BG_MODEL_POINT_2));
      const before = expectPosition(await readRenderedPosition(page, placedId));
      pins = await rePin();
      await cdpTouchDrag(cdp, start, 55, 8);
      const after = expectPosition(await readRenderedPosition(page, placedId));
      expect(after.x, 'the editor drag moved the node').toBeGreaterThan(before.x + 35);
      expect(await readZoom(page), 'move while zoomed: zoom unchanged (R21 ruling 1)').toBe(pins.zoom);
      expect(await readPan(page), 'move while zoomed: pan unchanged (R21 ruling 1)').toEqual(pins.pan);

      // PROPERTY COMMIT while zoomed.
      await page.getByTestId('tme-node-label-input').fill('Market Square');
      await activate(page, 'tme-node-done');
      await expect(page.getByTestId('tme-selection-label')).toHaveText('Market Square');
      expect(await readZoom(page), 'property commit while zoomed: zoom unchanged').toBe(pins.zoom);
      expect(await readPan(page), 'property commit while zoomed: pan unchanged').toEqual(pins.pan);

      // WAYPOINT-tool placement while zoomed (the F26 path) — the gap aim is
      // re-cleared live (the stack may have re-flowed again) before its pin.
      await activate(page, 'tme-tool-waypoint');
      await clearAimed(page, () => gapPoint(page));
      pins = await rePin();
      await tapAimed(page, () => gapPoint(page));
      await expect
        .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
        .toHaveLength(1);
      expect(await readZoom(page), 'waypoint place while zoomed: zoom unchanged').toBe(pins.zoom);
      expect(await readPan(page), 'waypoint place while zoomed: pan unchanged').toEqual(pins.pan);
    });
  });
});
