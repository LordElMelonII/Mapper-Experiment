// tests/e2e/arc-editing.e2e-spec.ts — PKG B-123: the arc panel's M2 editing
// sections (§5 Phase 3 M2 — "mode toggles, terrain, authored distance/time
// overrides, curve control, 'measure this arc' scale calibration (D44) —
// operable by touch alone (D53)") plus the two inherited obligations
// (the blockArc C30 catch; the deferred drafted+blocked cell) and arc Remove.
// Runs at BOTH playwright projects (desktop + emulated phone with touch) per
// D53/F52; the zoom-stability pin runs desktop-wheel + phone-pinch-twin (the
// interactions.e2e-spec.ts pattern — WebKit cannot drive CDP gestures).
//
// Cited IDs:
//   B-117/Q29 regime — the editing sections are EDITOR-gated (view mode keeps
//          exactly the B-106 panel; the blocked toggle is chat state and stays
//          view-mode accessible); controlled draft, ONE Apply commit.
//   D75/D77 — the draft commit is a full-replace upsertEdge PUT with the arc's
//          KNOWN id; commits mark only `dirty` (the arc renders tme-draft,
//          routing serves the SAVED graph until saveMap); a MEASUREMENT writes
//          scale, never the arc (the arc does NOT become drafted), while the
//          save dock still lights.
//   C14 row 2 — a forbidden mode prices ∞; the route re-words/re-prices after
//          save (the D60 default falls back to the cheapest allowed mode).
//   C14 row 3 — authored minutes price EXACTLY that value (D14: authored
//          values override what is below them absolutely).
//   C14 row 4/D14 — authored distance overrides straight-line geometry
//          (units = the authored value verbatim; no terrain applies).
//   C14 row 5/FX1 — geometric distance × scale × terrainMultipliers
//          (FX1: mountain 2.5); the terrain select drives that path.
//   C14 row 6 — no speeds defined anywhere (FX1) ⇒ geometry-priced arcs
//          denominate in canonical units (the scale's label).
//   B-111 — the curve control-point list is AUTHORED data edited verbatim
//          (add/retype/remove; the arc renders unbundled-bezier).
//   F20/F44/D44/C13 — "measure this arc": value + unit word + kind ⇒
//          calibrateScale (unitPerPx = authored ÷ the arc's px length; the
//          label seeds); an EMPTY unit word re-measures in the established
//          unit (the label/kind stand). The readout shows the core's numbers.
//   C30 — refusals surface field-precise in their sections, state untouched,
//          never a raw throw (the blockArc catch included — B-121's
//          found-not-fixed: blocking an UNSAVED drawn arc is refused via the
//          A-014 saved-plane gate with the console kept clean).
//   D42/F50 — Remove: the D42 dedup surface (a redundant parallel arc dies
//          here), no confirm dialog; an overlay block on the removed arc dies
//          with it (a redrawn sibling is born open).
//   B-121 deferred cell — a drafted arc that also carries a block keeps the
//          BLOCKED accent (the declaration-order cascade: blocked wins
//          line-color over the draft hue).
//   R21 ruling 1/B-120 — every commit leaves zoom and pan untouched.
//   D53/F52 — every cell runs touch-alone capable at the phone project; the
//          new controls keep the 44px floor; no horizontal scroll at 375px.
//
// FX1 facts (data/worlds/fuyuki.ts): the pin is 'emiya-residence' (100,250);
// 'outskirts' is (30,360); 'einzbern-castle' is (-380,120) and the castle arc
// (arc-outskirts-einzbern-castle, the ONLY arc into the castle) carries walk
// 240 / car 60 authored minutes; 'ryuudou-temple' (150,470) and
// 'shopping-district' (190,300) are childless leaves on layer-fuyuki;
// arc-emiya-residence-fuyuki-bridge carries FX1's authored block sample.
// Scale: unitPerPx 0.2, unitLabel 'min', unitKind 'time',
// terrainMultipliers { mountain: 2.5 }. Canvas aiming goes through the
// DEV-HARNESS-ONLY window.__TME_E2E__ seam; all aim/price math is TEST-side —
// the UI computes nothing (R1).
import { chromium, devices, expect, test, type CDPSession, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  edgeLineStyle(id: string): string | null;
  edgeCurveStyle(id: string): string | null;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeModelPosition(id: string): { x: number; y: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
  edgeIds(): string[];
  nodeHasClass(id: string, cls: string): boolean;
  selectedNodeId(): string | null;
  /** B-123: authored fields of one library edge, the editing-plane shape. */
  edgeData(id: string): {
    id: string;
    source: string;
    target: string;
    modes: string[];
    terrain: string | null;
    authoredDistance: number | null;
    curveDistances: number[] | null;
  } | null;
  /** B-123: the per-mode EDIT rows (arcModesOf — the D78/C23 seam). */
  arcModes(id: string): { id: string; label: string; allowed: boolean; authoredMinutes: number | null }[] | null;
  /** B-123: the live scale's verbatim numbers (the measure readout seam). */
  scaleInfo(): { unitPerPx: number; unitLabel: string; unitKind: string } | null;
  draftedIds(): string[];
  edgeLineColor(id: string): string | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';
const EMIYA_ID = 'emiya-residence'; // the pin — the harness readiness probe
const CASTLE_ID = 'einzbern-castle'; // isolated corner leaf — clear taps at both fits
const TEMPLE_ID = 'ryuudou-temple'; // childless location leaf
const OUTSKIRTS_ID = 'outskirts'; // parentless location leaf
const SHOPPING_ID = 'shopping-district'; // childless location leaf
const BRIDGE_ID = 'emiya-residence'; // bridge arc endpoint (source)

const CASTLE_ARC = 'arc-outskirts-einzbern-castle';
const BRIDGE_ARC = 'arc-emiya-residence-fuyuki-bridge';

/** FX1 authored positions (data/worlds/fuyuki.ts), inlined in the in-page
 *  calculators below — the pin is emiya-residence (100,250); the castle arc
 *  runs outskirts (30,360) → einzbern-castle (-380,120), its px length the
 *  C13 denominator (euclid of its endpoints, ≈475.08). */

/**
 * The B-109-vetted clear background point in MODEL coordinates (see
 * waypoints.e2e-spec.ts): inside the fitted bounds, >60 model units from
 * every node/edge/compound box at BOTH projects' fits. Used for node
 * placement and background taps.
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };

/** Runtime-resolved colors (cytoscape normalizes hex — the B-121 precedent). */
const BLOCKED_RED = 'rgb(201,86,78)'; // edge.tme-blocked — '#c9564e'
const DRAFT_HUE = 'rgb(244,241,232)'; // edge.tme-draft — '#f4f1e8'
const SELECTED_GOLD = 'rgb(255,209,102)'; // edge.tme-edge-selected — '#ffd166'

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

const readModelPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeModelPosition(nodeId);
    },
    id,
  );

const readEdgeData = (page: Page, id: string): Promise<TmeE2EHook['edgeData']> =>
  page.evaluate(
    (edgeId): TmeE2EHook['edgeData'] => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.edgeData(edgeId);
    },
    id,
  );

const readArcModes = (page: Page, id: string): Promise<TmeE2EHook['arcModes']> =>
  page.evaluate(
    (edgeId): TmeE2EHook['arcModes'] => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.arcModes(edgeId);
    },
    id,
  );

const readScaleInfo = (page: Page): Promise<TmeE2EHook['scaleInfo']> =>
  page.evaluate((): TmeE2EHook['scaleInfo'] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.scaleInfo();
  });

const readEdgeIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.edgeIds();
  });

const readDraftedIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.draftedIds();
  });

const readEdgeHasClass = (page: Page, id: string, cls: string): Promise<boolean> =>
  page.evaluate(
    ({ nodeId, className }): boolean => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeHasClass(nodeId, className);
    },
    { nodeId: id, className: cls },
  );

const readEdgeLineColor = (page: Page, id: string): Promise<string | null> =>
  page.evaluate(
    (edgeId): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.edgeLineColor(edgeId);
    },
    id,
  );

const readEdgeLineStyle = (page: Page, id: string): Promise<string | null> =>
  page.evaluate(
    (edgeId): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.edgeLineStyle(edgeId);
    },
    id,
  );

const readEdgeCurveStyle = (page: Page, id: string): Promise<string | null> =>
  page.evaluate(
    (edgeId): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.edgeCurveStyle(edgeId);
    },
    id,
  );

const readSelectedNodeId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.selectedNodeId();
  });

const readZoom = (page: Page): Promise<number> =>
  page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.zoom();
  });

const readPan = (page: Page): Promise<{ x: number; y: number }> =>
  page.evaluate((): { x: number; y: number } => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.pan();
  });

/**
 * Wait two animation frames: panel open/close and the ResizeObserver-driven
 * re-fit run just before the next paint — reads and gestures inside that
 * window would aim at stale coordinates (the settle precedent).
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
const activate = (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  return isPhone() ? locator.tap() : locator.click();
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

/**
 * Tap an arc through the RENDERED MIDPOINT of its two endpoints (the
 * arc-panel precedent: the midpoint is equidistant-far from both 44px node
 * bodies, so the tap lands the EDGE on both input paths; re-reads positions
 * on every call). B-133c (D91): coverage-guarded — the open property/arc
 * panels and the route sheet overlay the lower stage at the phone width
 * (probe: the C2-loop re-tap answered the sheet body; a BLIND covered tap
 * lands the panel's own content, never the canvas).
 */
const tapArcMidpoint = async (
  page: Page,
  arcId: string,
  sourceId: string,
  targetId: string,
): Promise<void> => {
  const aim = async (): Promise<Point> => {
    await settle(page);
    const source = await readRenderedPosition(page, sourceId);
    const target = await readRenderedPosition(page, targetId);
    if (source === null || target === null) throw new Error(`arc ${arcId} endpoints not rendered`);
    const box = await page.getByTestId('tme-canvas').boundingBox();
    if (box === null) throw new Error('canvas host not visible');
    return { x: box.x + (source.x + target.x) / 2, y: box.y + (source.y + target.y) / 2 };
  };
  await tapAimed(page, aim);
};

/** Tap a MODEL point: convert via the seam (test-side math only — R1). */
const tapModelPoint = async (page: Page, model: { x: number; y: number }): Promise<void> => {
  await settle(page);
  const screen = await page.evaluate((m): Point | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    const box = document.querySelector('[data-testid="tme-canvas"]')?.getBoundingClientRect();
    if (box === null || box === undefined) return null;
    return { x: box.x + hook.pan().x + m.x * hook.zoom(), y: box.y + hook.pan().y + m.y * hook.zoom() };
  }, model);
  if (screen === null) throw new Error('canvas host not visible');
  await tapPoint(page, screen);
};

/**
 * B-133c (D91) coverage guard — the reference implementation's shape
 * (editor-quick-connect @ 5006574), with two probe-derived extensions:
 * the band rects read the panel HOSTS (a scrolled sheet's content rect
 * spans far past the viewport — the host is the visible band that actually
 * intercepts taps), and the ARC panel joins the bands (this spec's own
 * covering sheet — the arc panel stays open across the editing loop, and a
 * blind covered tap lands its CONTENT: probe answers ranged from
 * tme-arc-distance to tme-arc-curve-add). The dodge is ONE background mouse
 * drag (a drag is not a tap — no selection, no draft change); its start is
 * a live clear-canvas point found via elementFromPoint between the top
 * chrome and the topmost band, clear of every rendered node (editor-mode
 * drags grab nodes). Phone-only (D53): desktop taps stay byte-identical.
 */
const EDIT_NODE_IDS = [
  'einzbern-castle',
  'ryuudou-temple',
  'outskirts',
  'emiya-residence',
  'fuyuki-bridge',
  'shopping-district',
  'homurahara-academy',
  'matou-residence',
  'tohsaka-residence',
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
): Promise<void> => {
  const canvas = await page.getByTestId('tme-canvas').boundingBox();
  if (canvas === null) throw new Error('canvas host not visible');
  // B-D2 re-baseline (R29, PROPOSAL-D §2.1 — cited): at shell widths TWO
  // band facts change. (1) The selection chip lives in the canvas-bottom
  // STATUS STRIP — a BOTTOM band, not top chrome (counting it into the top
  // floor put floor+12 past the canvas bottom and emptied the drag-start
  // search window: topFloor 712 vs a 720px canvas). (2) The docked context
  // panel's host is a stage SIBLING RIGHT of the canvas — horizontally
  // outside it, so it can never cover a canvas aim and never steers the
  // pan. Both repairs read the LIVE geometry (presence-probed, the D-1
  // law): a chip in the canvas's top half keeps the pre-D-2 treatment; a
  // band with no horizontal canvas overlap is filtered out.
  const canvasMid = canvas.y + canvas.height / 2;
  const chipIsTopBand = boxes.chip !== null && boxes.chip.top + boxes.chip.height <= canvasMid;
  const coversCanvas = (band: CoverBox): boolean =>
    band.left < canvas.x + canvas.width && band.left + band.width > canvas.x;
  let panDy = 0;
  for (const band of [boxes.prop, boxes.route, boxes.rail, boxes.arc]) {
    if (band === null || !coversCanvas(band)) continue;
    for (const t of aims) {
      if (t.y > band.top - 16) panDy = Math.min(panDy, band.top - 16 - t.y);
    }
  }
  if (boxes.chip !== null) {
    const chip = boxes.chip;
    for (const t of aims) {
      if (t.x + 22 > chip.left && t.y + 22 > chip.top && t.y - 22 < chip.top + chip.height) {
        // Top strip chip: clear BELOW it (the pre-D-2 world). Bottom strip
        // chip (the >=1024 status strip): clear ABOVE it.
        panDy = Math.min(
          panDy,
          chipIsTopBand ? chip.top + chip.height + 16 - t.y : chip.top - 16 - t.y,
        );
      }
    }
  }
  const topFloor = Math.max(
    ...[boxes.header, boxes.breadcrumb, chipIsTopBand ? boxes.chip : null].map((b) =>
      b === null ? 0 : b.top + b.height,
    ),
    0,
  );
  if (topFloor > 0) {
    const needed = Math.max(...aims.map((t) => topFloor + 16 - t.y));
    if (needed > panDy) panDy = needed;
  }
  if (panDy < -8 || panDy > 8) {
    const panBefore = await readPan(page);
    // The drag's START must be a clear CANVAS point clear of every rendered
    // node (only the down point matters — cytoscape captures the pointer).
    const start = await page.evaluate(
      ({ canvasBox, top, floor, ids }): Point | null => {
        const hook = (window as unknown as {
          __TME_E2E__?: { nodeRenderedPosition(id: string): { x: number; y: number } | null };
        }).__TME_E2E__;
        if (hook === undefined) return null;
        // B-D2 re-baseline: bands right of the canvas (the docked panel's
        // host) never bound the search window — see the coversCanvas note
        // in the pan arms above.
        const bands = [top.prop, top.route, top.rail, top.arc].filter(
          (b) => b !== null && b.left < canvasBox.x + canvasBox.width && b.left + b.width > canvasBox.x,
        );
        const minBand =
          bands.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...bands.map((b) => b.top));
        const nodePts = ids
          .map((id: string) => hook.nodeRenderedPosition(id))
          .filter((p): p is { x: number; y: number } => p !== null);
        for (const fx of [0.5, 0.2, 0.8, 0.35, 0.65]) {
          for (let y = floor + 12; y < minBand - 12; y += 8) {
            const x = canvasBox.x + canvasBox.width * fx;
            const el = document.elementFromPoint(x, y);
            if (el === null || el.closest('.tme-canvas') === null) continue;
            // A mousedown on a node GRABS it (editor mode) — the start must
            // clear every node by more than the touch slop (~22·zoom + 8 px).
            if (nodePts.some((p) => Math.hypot(p.x + canvasBox.x - x, p.y + canvasBox.y - y) < 26)) {
              continue;
            }
            return { x, y };
          }
        }
        return null;
      },
      {
        canvasBox: canvas,
        top: { prop: boxes.prop, route: boxes.route, rail: boxes.rail, arc: boxes.arc },
        floor: topFloor,
        ids: [...EDIT_NODE_IDS, 'wp-1'],
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
    const panAfter = await readPan(page);
    if (Math.abs(panAfter.y - panBefore.y) < 8) {
      throw new Error(`dodgeBands: the drag panned nothing (start ${Math.round(start.x)},${Math.round(start.y)})`);
    }
  }
};

/**
 * The canvas tap, coverage-guarded: re-derives the aim FRESH (a dodge pans
 * the map — old coordinates are stale), checks it against the live bands,
 * and dodges only when covered. Fails with the geometry when the corridor
 * cannot fit rather than tapping blind. B-141 re-baseline (docs/ui-restyle/
 * REPAIRS.md R1, deliberate, cited): the route floater's staggered anchor
 * removed the desktop's old lucky geometry — the blind desktop tap was safe
 * only while the route floater sat UNDER the same-anchored property panel
 * — so the BOTH-VIEWPORT guard runs here now (the same machinery the phone
 * project has always exercised; the clear path is byte-identical to the old
 * blind tap).
 */
const tapAimed = async (page: Page, aim: () => Promise<Point>): Promise<void> => {
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

/** A node tap through the seam, coverage-guarded (B-133c, D91). */
const tapNodeAimed = async (page: Page, id: string): Promise<void> =>
  tapAimed(page, () => nodeScreenPoint(page, id));

/** A MODEL-point tap through the seam, coverage-guarded (B-133c, D91). */
const tapModelAimed = async (page: Page, model: { x: number; y: number }): Promise<void> => {
  const aim = async (): Promise<Point> => {
    await settle(page);
    const screen = await page.evaluate((m): Point | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      const box = document.querySelector('[data-testid="tme-canvas"]')?.getBoundingClientRect();
      if (box === null || box === undefined) return null;
      return { x: box.x + hook.pan().x + m.x * hook.zoom(), y: box.y + hook.pan().y + m.y * hook.zoom() };
    }, model);
    if (screen === null) throw new Error('canvas host not visible');
    return screen;
  };
  await tapAimed(page, aim);
};

/** Enter editor mode (the default Node tool). */
const enterEditor = async (page: Page): Promise<void> => {
  await activate(page, 'tme-editor-toggle');
  await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
};

/** Open the arc panel on the castle arc (view- or editor-mode agnostic). */
const openCastleArc = async (page: Page): Promise<void> => {
  await tapArcMidpoint(page, CASTLE_ARC, OUTSKIRTS_ID, CASTLE_ID);
  await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
};

/** The ids of edges created since `before` (engine ids, read live — C5/D75). */
const newEdgeIds = async (page: Page, before: readonly string[]): Promise<string[]> =>
  (await readEdgeIds(page)).filter((id) => !before.includes(id));

/**
 * Park the route floater OUT OF THE WAY for the rest of the cell: one D10
 * user gesture — a header drag (the floater's own drag machinery commits the
 * position, clamped to its stage bounds, so slop in the pointer target lands
 * the same parked rect) — and a PLACED floater wins over every default
 * anchor and survives the D91 content re-derivations for the whole cell.
 * B-141 re-baseline (docs/ui-restyle/REPAIRS.md R1, deliberate, cited): the
 * staggered unplaced floater anchors OPPOSITE the property panel, which
 * covers the B-109-vetted low-left canvas points the blind desktop cells
 * were calibrated against. Desktop-only: the narrow sheet has no floater
 * header (the phone flows never needed it, D91/D53).
 */
const parkRouteFloater = async (page: Page): Promise<void> => {
  if (isPhone()) return;
  await settle(page);
  const canvas = await page.getByTestId('tme-canvas').boundingBox();
  if (canvas === null) throw new Error('canvas host not visible');
  const headBox = await page.getByTestId('tme-route-float-head').boundingBox();
  if (headBox === null) {
    // B-D3 (PROPOSAL-D §3.1, cited): a placement no longer opens the
    // property panel, so at shell widths (>=1024) the route content's own
    // auto-open claims the CONTEXT DOCK (the D-2 occupant rule) — the route
    // never floats and there is nothing to park; the stage is clear by
    // construction (the dock is in-flow beside it). Presence-probed, never
    // a mirrored breakpoint (the B-D1 law): the park still runs in the
    // 700–1023 band, where the route floats over the stage.
    return;
  }
  await page.mouse.move(headBox.x + headBox.width / 2, headBox.y + headBox.height / 2);
  await page.mouse.down();
  // To the upper-right of the stage — clear of both corner anchors and of
  // every aim these cells re-derive (probe-measured at the project viewport).
  await page.mouse.move(canvas.x + canvas.width - 44, canvas.y + 150, { steps: 4 });
  await page.mouse.up();
  await settle(page);
};

/**
 * Place one authored node at the vetted background point and draw one arc
 * from `fromId` to it (the Node tool then the Arc tool — B-120/B-122). The
 * placed node is SELECTED right after placement; the drawn arc is selected
 * after the commit (the panel opens). Returns the placed node id, the arc id
 * and the node's ACTUAL stored model position (the core prices from the
 * authored data — the test reads it back, never predicts it).
 */
const placeNodeAndDrawArc = async (
  page: Page,
  fromId: string,
): Promise<{ nodeId: string; arcId: string; nodePos: { x: number; y: number }; edgesBefore: string[] }> => {
  const edgesBefore = await readEdgeIds(page);
  await activate(page, 'tme-tool-node');
  await tapModelAimed(page, BG_MODEL_POINT);
  await expect.poll(() => readSelectedNodeId(page)).not.toBeNull();
  const nodeId = (await readSelectedNodeId(page)) as string;
  const nodePos = await readModelPosition(page, nodeId);
  if (nodePos === null) throw new Error('placed node has no model position');
  // B-141 re-baseline: the placed node's selection staggered the unplaced
  // route floater onto the opposite corner of the property panel — over this
  // node's low-left aim — so the arc-tool coordinates parked in the cell first.
  await parkRouteFloater(page);
  await activate(page, 'tme-tool-arc');
  // B-133c (D91) guard, retained: BOTH draw taps are coverage-guarded.
  // B-D3 (PROPOSAL-D §3.1, cited): a placement no longer opens the property
  // sheet — the parked popover resolves at the first draw tap's pointerdown
  // (an empty input cancels, D10) — so the guard here is defense in depth.
  await tapNodeAimed(page, fromId);
  await tapNodeAimed(page, nodeId);
  await expect.poll(async () => (await newEdgeIds(page, edgesBefore)).length).toBe(1);
  const arcId = (await newEdgeIds(page, edgesBefore))[0];
  // The draw commit leaves the Arc tool ON (consecutive arcs, B-122) — a node
  // tap would be a PICK, not a selection. Restore the Node tool so the caller
  // can select nodes again.
  await activate(page, 'tme-tool-node');
  return { nodeId, arcId, nodePos, edgesBefore };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Expected PRICING floats are computed INSIDE THE PAGE — the app's own engine.
 * Math.hypot (and any transcendental) may differ by 1 ULP between the test
 * runner's Node (V8) and the phone project's WebKit, and the route panel
 * renders the core's double via String() — a cross-engine constant would
 * flake on the last digit (found live by the first phone run). The operands
 * (FX1 constants, the hook-read authored positions) are exact in both.
 */
const castleArcUnitPerPx = (page: Page, authoredDistance: number): Promise<number> =>
  page.evaluate((value) => value / Math.hypot(-380 - 30, 120 - 360), authoredDistance);

/** C14 row 5 for the drawn arc: px × unitPerPx × multiplier (TEST-side math, in-page engine). */
const drawnArcCost = (
  page: Page,
  nodePos: { x: number; y: number },
  unitPerPx: number,
  multiplier: number,
): Promise<number> =>
  page.evaluate(
    ({ pos, upp, mult }) => Math.hypot(pos.x - 100, pos.y - 250) * upp * mult,
    { pos: nodePos, upp: unitPerPx, mult: multiplier },
  );

/**
 * B-133c (D91): the pinch center picked LIVE from clear canvas — the twin's
 * old chrome-box derivation ignored the overlay bands (the open arc panel
 * rides over the stage's lower band now), and its center landed on the
 * panel's own content (probe: elementFromPoint answered tme-arc-endpoints)
 * so the pinch drugged the sheet, never the map. The clear point answers
 * elementFromPoint as the canvas host, sits between the top chrome and the
 * topmost band, clears every rendered node by more than the touch slop (a
 * finger on a node is a grab, not a pinch), and leaves room for the spread.
 */
const clearPinchCenter = async (page: Page): Promise<{ center: Point; spreadMax: number }> => {
  const canvas = await page.getByTestId('tme-canvas').boundingBox();
  if (canvas === null) throw new Error('canvas host not visible');
  const found = await page.evaluate(
    ({ canvasBox, ids }): { center: Point; spreadMax: number } | null => {
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
      const minBand = bandTops.length === 0 ? canvasBox.y + canvasBox.height : Math.min(...bandTops);
      const nodePts = ids
        .map((id: string) => hook.nodeRenderedPosition(id))
        .filter((p): p is { x: number; y: number } => p !== null);
      for (let y = floor + 16; y < minBand - 16; y += 8) {
        for (const fx of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const x = canvasBox.x + canvasBox.width * fx;
          const el = document.elementFromPoint(x, y);
          if (el === null || el.closest('.tme-canvas') === null) continue;
          if (nodePts.some((p) => Math.hypot(p.x + canvasBox.x - x, p.y + canvasBox.y - y) < 30)) continue;
          const spreadMax = Math.min(120, x - canvasBox.x - 12, canvasBox.x + canvasBox.width - x - 12);
          if (spreadMax >= 40) return { center: { x, y }, spreadMax };
        }
      }
      return null;
    },
    { canvasBox: canvas, ids: [...EDIT_NODE_IDS, 'wp-1'] },
  );
  if (found === null) {
    throw new Error('clearPinchCenter: no clear canvas corridor for the pinch (D91 bands cover it)');
  }
  return found;
};

/**
 * The `phone` project is WebKit (iPhone 13), where CDP touch input does not
 * exist — the pinch cell below runs on a twin Chromium page with the SAME
 * iPhone 13 emulation (interactions.e2e-spec.ts pattern).
 */
const withPhoneChromiumPage = async (run: (page: Page) => Promise<void>): Promise<void> => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
    await run(page);
  } finally {
    await browser.close();
  }
};

/** Two-finger pinch through CDP Input.dispatchTouchEvent (the twin's path). */
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
  // The learned pause: hold ~200ms before touchEnd or Chromium silently
  // drops the NEXT tap's click (~40% repro — AGENTS.md e2e gotchas).
  await sleep(200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

test.describe('arc editing: the M2 sections + measure this arc (PKG B-123)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
    await expect.poll(() => readRenderedPosition(page, CASTLE_ID)).not.toBeNull();
  });

  test('editor gating: the editing sections render only in editor mode on a library arc; the measure section serves an overlay arc (B-117/Q29, A-015 merged set)', async ({
    page,
  }) => {
    // VIEW mode: today's B-106 panel only — no editing sections (the blocked
    // toggle stays chat state, F14/D20).
    await openCastleArc(page);
    await expect(page.getByTestId('tme-arc-editor')).toHaveCount(0);
    await expect(page.getByTestId('tme-arc-measure')).toHaveCount(0);
    await expect(page.getByTestId('tme-arc-block')).toBeVisible();

    // EDITOR mode on a LIBRARY arc: both sections render, the per-mode rows
    // carry the ONE core resolver's words and the honest not-allowed row
    // (C14 row 2 — FX1's castle arc has no train key).
    await enterEditor(page);
    await openCastleArc(page);
    await expect(page.getByTestId('tme-arc-editor')).toBeVisible();
    await expect(page.getByTestId('tme-arc-measure')).toBeVisible();
    await expect(page.getByTestId('tme-arc-mode-row-walk')).toHaveText('walk');
    await expect(page.getByTestId('tme-arc-mode-row-car')).toHaveText('car');
    await expect(page.getByTestId('tme-arc-mode-row-train')).toHaveText('train');
    await expect(page.getByTestId('tme-arc-allowed-train')).not.toBeChecked();
    await expect(page.getByTestId('tme-arc-allowed-walk')).toBeChecked();
    const modes = await readArcModes(page, CASTLE_ARC);
    expect(modes?.map((row) => row.id)).toEqual(['walk', 'car', 'train']);
    expect(modes?.find((row) => row.id === 'walk')).toMatchObject({ allowed: true, authoredMinutes: 240 });

    // EDITOR mode on an OVERLAY `we-` arc: NO edit sections (chat state has no
    // editor command — the B-116 waypoint precedent), but the MEASURE section
    // renders (calibrateScale takes the MERGED set, A-015).
    await activate(page, 'tme-tool-waypoint');
    // B-133c (D91): the library arc's panel is still open over the stage —
    // the placement tap is coverage-guarded (probe: the BG aim answered the
    // panel's body-scroll and wp-1 never existed).
    await tapModelAimed(page, BG_MODEL_POINT);
    await expect
      .poll(async () => (await page.evaluate((): string[] => {
        const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
        if (hook === undefined) throw new Error(HOOK_ERROR);
        return hook.nodeLabels();
      })).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);
    await activate(page, 'tme-tool-node'); // leave the waypoint gesture alone
    // The kNN connect (C7, k=3) wires wp-1 to the three nearest leaves — from
    // the BG point (-250,450) those are outskirts (294), castle (355) and
    // temple (400) by TEST-side math over FX1's authored positions; tap the
    // wp-1↔outskirts we- edge at its rendered midpoint.
    const weId = (await readEdgeIds(page)).find((id) => id.startsWith('we-'));
    expect(weId, 'the kNN connect created a we- edge (C7)').toBeTruthy();
    // B-133c (D91): the we-edge midpoint tap is coverage-guarded too (the
    // arc panel can still be stacked over the stage mid-flow).
    const weMidAim = async (): Promise<Point> => {
      const wp = await nodeScreenPoint(page, 'wp-1');
      const nearest = await nodeScreenPoint(page, OUTSKIRTS_ID);
      return { x: (wp.x + nearest.x) / 2, y: (wp.y + nearest.y) / 2 };
    };
    await tapAimed(page, weMidAim);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-arc-editor')).toHaveCount(0);
    await expect(page.getByTestId('tme-arc-measure')).toBeVisible();
  });

  test('forbidding a mode: the panel re-words live, the route re-words and re-prices after save (C14 row 2, D75)', async ({
    page,
  }) => {
    await enterEditor(page);
    await openCastleArc(page);
    // Uncheck walk ⇒ Apply (ONE full-replace commit, D75).
    await page.getByTestId('tme-arc-allowed-walk').uncheck();
    await expect(page.getByTestId('tme-arc-apply')).toBeEnabled();
    await page.getByTestId('tme-arc-apply').click();
    // The panel's mode WORDS follow immediately (the view body re-reads the
    // live map — walk's chip is gone, car's stays).
    await expect(page.getByTestId('tme-arc-mode-walk')).toHaveCount(0);
    await expect(page.getByTestId('tme-arc-mode-car')).toBeVisible();
    const modes = await readArcModes(page, CASTLE_ARC);
    expect(modes?.find((row) => row.id === 'walk')?.allowed).toBe(false);
    expect(modes?.find((row) => row.id === 'car')?.allowed).toBe(true);
    const data = await readEdgeData(page, CASTLE_ARC);
    expect(data?.modes).toEqual(['car']); // the full-replace PUT kept car verbatim
    await expect(page.getByTestId('tme-save-dock')).toBeVisible(); // dirty only (F45)

    // Save: the route re-prices — walk ∞ on the castle arc (row 2), the D60
    // default falls back to the cheapest allowed mode (car 60): 30 + 60.
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    // B-133c (D91): the arc panel survives the save (the arc stays selected)
    // over the lower stage — the castle re-select is coverage-guarded.
    await tapNodeAimed(page, CASTLE_ID);
    await expect(page.getByTestId('tme-leg').nth(0)).toHaveText('Emiya Residence → Outskirts · walk · 30');
    await expect(page.getByTestId('tme-leg').nth(1)).toHaveText('Outskirts → Einzbern Castle · car · 60');
    await expect(page.getByTestId('tme-total')).toHaveText('90 min');
  });

  test('authored minutes price EXACTLY that value (C14 row 3/D14)', async ({ page }) => {
    await enterEditor(page);
    await openCastleArc(page);
    await page.getByTestId('tme-arc-minutes-walk').fill('111');
    await expect(page.getByTestId('tme-arc-apply')).toBeEnabled();
    await page.getByTestId('tme-arc-apply').click();
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await tapNodeAimed(page, CASTLE_ID); // B-133c (D91): coverage-guarded re-select
    await expect(page.getByTestId('tme-leg').nth(1)).toHaveText('Outskirts → Einzbern Castle · walk · 111');
    await expect(page.getByTestId('tme-total')).toHaveText('141 min'); // 30 + 111, verbatim
    const modes = await readArcModes(page, CASTLE_ARC);
    expect(modes?.find((row) => row.id === 'walk')).toMatchObject({ allowed: true, authoredMinutes: 111 });
  });

  test('authored distance overrides geometry (D14/C14 row 4)', async ({ page }) => {
    await enterEditor(page);
    // Row 4 needs a priced mode WITHOUT authored minutes (row 3 overrides
    // rows 4–5 absolutely, D14) — a drawn arc is geometry-priced (row 5).
    const { nodeId, arcId, nodePos } = await placeNodeAndDrawArc(page, EMIYA_ID);
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    // Baseline: geometry prices the arc px × 0.2 min/px (row 5).
    // B-133c (D91) guard, retained (B-D3, PROPOSAL-D §3.1, cited: no sheet
    // opens on a placement anymore — defense in depth).
    await tapNodeAimed(page, nodeId);
    await expect(page.getByTestId('tme-total')).toHaveText(`${await drawnArcCost(page, nodePos, 0.2, 1)} min`);

    // Author the TRUE separation: 12 — geometry is overridden, not blended.
    await tapArcMidpoint(page, arcId, EMIYA_ID, nodeId);
    await expect(page.getByTestId('tme-arc-editor')).toBeVisible();
    await page.getByTestId('tme-arc-distance').fill('12');
    await page.getByTestId('tme-arc-apply').click();
    const data = await readEdgeData(page, arcId);
    expect(data?.authoredDistance).toBe(12);
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await tapNodeAimed(page, nodeId); // B-133c (D91): guarded (the arc panel is open)
    await expect(page.getByTestId('tme-leg')).toHaveText('Emiya Residence → New place · walk · 12');
    await expect(page.getByTestId('tme-total')).toHaveText('12 min'); // units = 12 verbatim (no terrain, C12/D44)
  });

  test('terrain drives the multiplier path (C14 row 5 — FX1 terrainMultipliers mountain 2.5)', async ({ page }) => {
    await enterEditor(page);
    // A geometry-priced arc in a route: a placed node connected ONLY by a
    // drawn arc (no authored minutes ⇒ no speed ⇒ canonical units, row 6).
    const { nodeId, arcId, nodePos } = await placeNodeAndDrawArc(page, EMIYA_ID);
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();

    // Baseline: the route pin→new node is the single drawn arc priced
    // px × 0.2 min/px (row 5, 'plain' multiplier 1) — TEST-side math over the
    // node's ACTUAL authored position (R1: the UI computed nothing), computed
    // in the app's engine (the in-page float discipline).
    // B-133c (D91) guard, retained (B-D3, PROPOSAL-D §3.1, cited: no sheet
    // opens on a placement anymore — defense in depth).
    await tapNodeAimed(page, nodeId);
    await expect(page.getByTestId('tme-total')).toHaveText(`${await drawnArcCost(page, nodePos, 0.2, 1)} min`);

    // Terrain Mountain ⇒ the same arc re-prices ×2.5 after save.
    await tapArcMidpoint(page, arcId, EMIYA_ID, nodeId);
    await expect(page.getByTestId('tme-arc-editor')).toBeVisible();
    await page.getByTestId('tme-arc-terrain').selectOption('mountain');
    await page.getByTestId('tme-arc-apply').click();
    const data = await readEdgeData(page, arcId);
    expect(data?.terrain).toBe('mountain');
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await tapNodeAimed(page, nodeId); // B-133c (D91): guarded (the arc panel is open)
    await expect(page.getByTestId('tme-total')).toHaveText(`${await drawnArcCost(page, nodePos, 0.2, 2.5)} min`); // FX1's mountain 2.5
  });

  test('a curve control point renders the arc curved (B-111 — authored list edited verbatim)', async ({ page }) => {
    await expect(await readEdgeCurveStyle(page, CASTLE_ARC)).toBe('bezier'); // FX1 baseline
    await enterEditor(page);
    await openCastleArc(page);
    await page.getByTestId('tme-arc-curve-add').click();
    await page.getByTestId('tme-arc-curve-input').fill('-40');
    await page.getByTestId('tme-arc-apply').click();
    // The rendering follows the authored data through the rebuild (D7: the
    // stylesheet computes nothing) — no save needed to RENDER, but the value
    // is drafted until one.
    await expect.poll(() => readEdgeCurveStyle(page, CASTLE_ARC)).toBe('unbundled-bezier');
    const data = await readEdgeData(page, CASTLE_ARC);
    expect(data?.curveDistances).toEqual([-40]);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(() => readEdgeCurveStyle(page, CASTLE_ARC)).toBe('unbundled-bezier'); // survives the save
  });

  test('measure this arc: value + unit word seeds the scale; pricing serves the SAVED scale until save (F20/F44/D44/D75)', async ({
    page,
  }) => {
    await enterEditor(page);
    const { nodeId, arcId, nodePos } = await placeNodeAndDrawArc(page, EMIYA_ID);
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await tapNodeAimed(page, nodeId); // B-133c (D91): guarded (B-D3: no sheet opens on a placement — defense in depth)
    await expect(page.getByTestId('tme-total')).toHaveText(`${await drawnArcCost(page, nodePos, 0.2, 1)} min`);

    // Measure the KNOWN-length castle arc: 6 km ⇒ unitPerPx = 6/475.079…,
    // the label seeds 'km' (F20/D44), the readout shows the core's numbers.
    await tapArcMidpoint(page, CASTLE_ARC, OUTSKIRTS_ID, CASTLE_ID);
    await expect(page.getByTestId('tme-arc-measure')).toBeVisible();
    await page.getByTestId('tme-arc-measure-value').fill('6');
    await page.getByTestId('tme-arc-measure-unit').fill('km');
    await page.getByTestId('tme-arc-measure-kind').selectOption('distance');
    await page.getByTestId('tme-arc-measure-apply').click();
    const unitPerPx = await castleArcUnitPerPx(page, 6);
    await expect(page.getByTestId('tme-arc-scale-value')).toHaveText(`1 px = ${unitPerPx} km`);
    await expect(page.getByTestId('tme-arc-scale-kind')).toHaveText('(distance)');
    expect(await readScaleInfo(page)).toEqual({ unitPerPx, unitLabel: 'km', unitKind: 'distance' });
    // A measurement writes SCALE, never the arc (A-015) — the arc is NOT
    // drafted, while `dirty` still lights (the dock is up from the measurement
    // alone: nothing else is pending here).
    expect(await readDraftedIds(page)).not.toContain(CASTLE_ARC);
    // D75 honesty: pricing serves the SAVED scale until saveMap — the sidebar
    // total is UNCHANGED by the measurement. (The arc midpoint tap cleared the
    // node selection — B-106 mutual exclusion — so re-select the node first.)
    // B-133c (D91): the arc panel is open — the re-select is coverage-guarded.
    await tapNodeAimed(page, nodeId);
    await expect(page.getByTestId('tme-total')).toHaveText(`${await drawnArcCost(page, nodePos, 0.2, 1)} min`);

    // Save: the seeded scale goes live — the same route re-prices in the
    // seeded unit (C14 row 5 through the new unitPerPx; the label says 'km').
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect(page.getByTestId('tme-total')).toHaveText(`${await drawnArcCost(page, nodePos, unitPerPx, 1)} km`);
    expect(await readEdgeData(page, arcId)).not.toBeNull(); // the route's only arc is the drawn one
  });

  test('empty unit word re-measures in the established unit — the label and kind stand (D44)', async ({ page }) => {
    await enterEditor(page);
    await openCastleArc(page);
    // First: seed 'km'/distance.
    await page.getByTestId('tme-arc-measure-value').fill('6');
    await page.getByTestId('tme-arc-measure-unit').fill('km');
    await page.getByTestId('tme-arc-measure-kind').selectOption('distance');
    await page.getByTestId('tme-arc-measure-apply').click();
    expect(await readScaleInfo(page)).toEqual({
      unitPerPx: await castleArcUnitPerPx(page, 6),
      unitLabel: 'km',
      unitKind: 'distance',
    });
    // Then: an EMPTY unit word re-measures — only unitPerPx moves (D44).
    await page.getByTestId('tme-arc-measure-value').fill('8');
    await page.getByTestId('tme-arc-measure-unit').fill('');
    await expect(page.getByText('established unit')).toBeVisible(); // the honest D44 note
    await page.getByTestId('tme-arc-measure-apply').click();
    expect(await readScaleInfo(page)).toEqual({
      unitPerPx: await castleArcUnitPerPx(page, 8),
      unitLabel: 'km', // the established label STANDS
      unitKind: 'distance', // the established kind STANDS
    });
  });

  test('an invalid measurement refuses field-precise with the state untouched (C30); unparseable input disables Apply', async ({
    page,
  }) => {
    await enterEditor(page);
    await openCastleArc(page);
    // Unparseable text: the honest disabled state (Apply never offers the throw).
    await page.getByTestId('tme-arc-measure-value').fill('not a number');
    await expect(page.getByTestId('tme-arc-measure-apply')).toBeDisabled();
    // A negative value PARSES ⇒ Apply is enabled ⇒ the facade refuses and the
    // panel renders the core's field-precise message; the scale is untouched.
    await page.getByTestId('tme-arc-measure-value').fill('-5');
    await expect(page.getByTestId('tme-arc-measure-apply')).toBeEnabled();
    await page.getByTestId('tme-arc-measure-apply').click();
    await expect(page.getByTestId('tme-arc-measure-error')).toContainText(
      'authoredDistance must be a finite number > 0',
    );
    expect(await readScaleInfo(page)).toEqual({ unitPerPx: 0.2, unitLabel: 'min', unitKind: 'time' });
    await expect(page.getByTestId('tme-save-dock')).toBeHidden(); // nothing went dirty
  });

  test('blocking an UNSAVED drawn arc surfaces the refusal and keeps the console clean (the B-121 inheritance)', async ({
    page,
  }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    // Draw an arc (B-122): it is UNSAVED — the A-014 saved-plane gate refuses
    // the block. B-121 found this throwing UNCAUGHT; the catch now surfaces
    // it field-precise in the panel.
    await enterEditor(page);
    await activate(page, 'tme-tool-arc');
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await page.getByTestId('tme-arc-reason-input').fill('Landslide');
    await page.getByTestId('tme-arc-block').click();
    await expect(page.getByTestId('tme-arc-block-refusal')).toContainText('unsaved — save the map first');
    await expect(page.getByTestId('tme-arc-reason-input')).toHaveValue('Landslide'); // kept for the retry
    expect(bad, 'no console errors/warnings/pageerrors on the refused block').toEqual([]);

    // After save the same reason lands (the retry the refusal pointed at).
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await page.getByTestId('tme-arc-block').click();
    await expect(page.getByTestId('tme-arc-block-refusal')).toHaveCount(0);
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveText('Landslide');
    expect(bad, 'console stays clean through the whole loop').toEqual([]);
  });

  test('a drafted arc that also carries a block keeps the BLOCKED accent (the deferred B-121 cell, B-111 cascade)', async ({
    page,
  }) => {
    await enterEditor(page);
    // FX1's bridge arc carries the AUTHORED block sample; editing it drafts
    // the arc while the block rides the full-replace commit (spread verbatim).
    await tapArcMidpoint(page, BRIDGE_ARC, BRIDGE_ID, 'fuyuki-bridge');
    await expect(page.getByTestId('tme-arc-editor')).toBeVisible();
    await page.getByTestId('tme-arc-terrain').selectOption('road');
    await page.getByTestId('tme-arc-apply').click();
    // Both classes ride (D77: visibly-not-yet-saved; C2: blocked ≠ hidden).
    await expect.poll(() => readEdgeHasClass(page, BRIDGE_ARC, 'tme-draft')).toBe(true);
    expect(await readDraftedIds(page)).toContain(BRIDGE_ARC);
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveText('Bridge closed by local authorities');
    // While SELECTED the gold accent wins the line (declared last); clear the
    // selection with a node tap (B-106 mutual exclusion) to read the cascade.
    // B-133c (D91): the arc editor is open over the stage — coverage-guarded
    // (probe: the outskirts aim answered tme-arc-curve-add).
    await tapNodeAimed(page, OUTSKIRTS_ID);
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await expect(await readEdgeLineStyle(page, BRIDGE_ARC)).toBe('dashed'); // blocked line-style stands
    await expect(await readEdgeLineColor(page, BRIDGE_ARC)).toBe(BLOCKED_RED); // blocked wins over the DRAFT_HUE
    // The mutant discriminator: the draft hue must NOT own the line.
    expect(await readEdgeLineColor(page, BRIDGE_ARC)).not.toBe(DRAFT_HUE);
    expect(await readEdgeLineColor(page, BRIDGE_ARC)).not.toBe(SELECTED_GOLD);
  });

  test('Remove takes the arc; its overlay block dies with it — a redrawn sibling is born open (D42/F50)', async ({
    page,
  }) => {
    // Draw a parallel sibling (C4) and save it so the block can land.
    await enterEditor(page);
    await activate(page, 'tme-tool-arc');
    const edgesBefore = await readEdgeIds(page); // BEFORE the draw taps (C5: never predict ids)
    await tapPoint(page, await nodeScreenPoint(page, EMIYA_ID));
    await tapPoint(page, await nodeScreenPoint(page, SHOPPING_ID));
    await expect.poll(async () => (await newEdgeIds(page, edgesBefore)).length).toBe(1);
    const arcId = (await newEdgeIds(page, edgesBefore))[0];
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();

    // Block it (the saved arc accepts the overlay block), then Remove.
    await page.getByTestId('tme-arc-reason-input').fill('Flooded');
    await page.getByTestId('tme-arc-block').click();
    await expect(page.getByTestId('tme-arc-blocked-reason')).toHaveText('Flooded');
    await expect(await readEdgeLineStyle(page, arcId)).toBe('dashed');
    await page.getByTestId('tme-arc-remove').click();
    // Gone: the selection cleared with it (the removeNode precedent), the
    // projection dropped it, the authored plane no longer knows the id.
    await expect(page.getByTestId('tme-arc-panel')).toBeHidden();
    await expect.poll(async () => (await readEdgeIds(page)).includes(arcId)).toBe(false);
    expect(await readEdgeData(page, arcId)).toBeNull();
    expect(await readDraftedIds(page)).not.toContain(arcId); // the id LEAVES the log

    // F50: no block resurrection — redrawing the same pair yields a NEW arc
    // that is OPEN (solid, no reason); the overlay entry died with the old id.
    await activate(page, 'tme-tool-arc');
    const edgesAfterRemoval = await readEdgeIds(page); // BEFORE the draw taps
    await tapPoint(page, await nodeScreenPoint(page, EMIYA_ID));
    await tapPoint(page, await nodeScreenPoint(page, SHOPPING_ID));
    await expect
      .poll(async () => (await readEdgeIds(page)).filter((id) => !edgesAfterRemoval.includes(id)).length)
      .toBe(1);
    const sibling = (await readEdgeIds(page)).find((id) => !edgesAfterRemoval.includes(id)) as string;
    expect(sibling).not.toBe(arcId);
    await expect(page.getByTestId('tme-arc-open')).toBeVisible(); // the panel opened on the new arc
    await expect(await readEdgeLineStyle(page, sibling)).toBe('solid');
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden(); // the map stays saveable (no dangling state)
  });

  test('the editing commits leave zoom and pan untouched (R21 ruling 1/B-120 pin — desktop wheel)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'wheel zoom runs on desktop; the pinch twin is the phone cell below (D53)');
    await enterEditor(page);
    await openCastleArc(page);
    await settle(page); // the panel-open RO refit (B-112) settles before the pin

    await page.getByTestId('tme-canvas').hover();
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -240);
    await settle(page);
    const zoom = await readZoom(page);
    const pan = await readPan(page);

    // The draft Apply commit: a rebuild, never a fit.
    await page.getByTestId('tme-arc-terrain').selectOption('road');
    await page.getByTestId('tme-arc-apply').click();
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    expect(await readZoom(page), 'Apply commit: zoom unchanged').toBe(zoom);
    expect(await readPan(page), 'Apply commit: pan unchanged').toEqual(pan);

    // The measurement commit (scale, not the arc): also viewport-silent.
    await page.getByTestId('tme-arc-measure-value').fill('9');
    await page.getByTestId('tme-arc-measure-apply').click();
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    expect(await readZoom(page), 'Measure commit: zoom unchanged').toBe(zoom);
    expect(await readPan(page), 'Measure commit: pan unchanged').toEqual(pan);
  });

  test('phone: the editing commits leave zoom and pan untouched — pinch twin (R21 ruling 1/B-120, D53)', async () => {
    test.skip(!isPhone(), 'the in-test Chromium twin reproduces the iPhone-13 device identically from either project');
    await withPhoneChromiumPage(async (page) => {
      await enterEditor(page);
      await openCastleArc(page);
      await settle(page);

      // Pinch-IN with BOTH fingers on bare canvas. B-133c (D91): the center
      // and spread derive LIVE from the clear-canvas corridor (the twin's
      // old chrome-box math predates the overlay sheets — with the arc panel
      // open it centered the pinch on the panel's content and the zoom never
      // happened; probe: elementFromPoint at the old center answered
      // tme-arc-endpoints).
      const fitZoom = await readZoom(page);
      const { center, spreadMax } = await clearPinchCenter(page);
      const cdp = await page.context().newCDPSession(page);
      await cdpPinch(cdp, center, spreadMax * 0.65, spreadMax);
      await settle(page);
      const zoom = await readZoom(page);
      const pan = await readPan(page);
      expect(zoom, 'the pinch driver must actually zoom in').toBeGreaterThan(fitZoom * 1.15);

      // The commits while zoomed (touch-alone): rebuild, no fit.
      await page.getByTestId('tme-arc-terrain').selectOption('road');
      await page.getByTestId('tme-arc-apply').click();
      await expect(page.getByTestId('tme-save-dock')).toBeVisible();
      expect(await readZoom(page), 'Apply commit: zoom unchanged').toBe(zoom);
      expect(await readPan(page), 'Apply commit: pan unchanged').toEqual(pan);
      await page.getByTestId('tme-arc-measure-value').fill('9');
      await page.getByTestId('tme-arc-measure-apply').click();
      expect(await readZoom(page), 'Measure commit: zoom unchanged').toBe(zoom);
      expect(await readPan(page), 'Measure commit: pan unchanged').toEqual(pan);
    });
  });

  test('phone: the new editing controls keep the 44px floor at 375px with no horizontal scroll (F52/D53)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the 375px panel-geometry check belongs to the phone project (D53)');
    await page.setViewportSize({ width: 375, height: 667 });
    await enterEditor(page);
    await openCastleArc(page);
    await expect(page.getByTestId('tme-arc-editor')).toBeVisible();
    await expect(page.getByTestId('tme-arc-measure')).toBeVisible();

    // F52: every new interactive control is a >= 44px tap target.
    for (const testId of [
      'tme-arc-allowed-walk',
      'tme-arc-minutes-walk',
      'tme-arc-terrain',
      'tme-arc-distance',
      'tme-arc-curve-add',
      'tme-arc-apply',
      'tme-arc-remove',
      'tme-arc-measure-value',
      'tme-arc-measure-unit',
      'tme-arc-measure-kind',
      'tme-arc-measure-apply',
    ]) {
      const box = await page.getByTestId(testId).boundingBox();
      if (box === null) throw new Error(`${testId} not visible`);
      expect(box.height, `${testId} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${testId} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }

    // D53: the panel never widens the page, and its own overflow never
    // scrolls the host (the sheet-scroll regime owns tall content).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);
    const panelFits = await page.evaluate((): boolean => {
      const panel = document.querySelector('tme-arc-panel');
      if (panel === null) throw new Error('arc panel host not found');
      return panel.scrollWidth <= panel.clientWidth + 1;
    });
    expect(panelFits, 'the editing sections never scroll the page sideways (D53)').toBe(true);
  });
});
