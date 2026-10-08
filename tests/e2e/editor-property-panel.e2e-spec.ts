// tests/e2e/editor-property-panel.e2e-spec.ts — PKG B-117: the F40 property
// panel (§5 Phase 3 M1) — rename, kind & parent (district) assignment,
// aliases, description, delete — proven at BOTH playwright projects (desktop
// + emulated phone with touch) per D53/F52 mobile-and-desktop parity.
//
// Cited IDs:
//   F40     — node editing: rename, re-kind, re-parent, alias, describe
//             (place/move are B-116's, already pinned).
//   F46     — no undo/multi-select/snapping: delete-and-redo IS the workflow
//             — Delete fires facade.removeNode directly, no confirm dialog.
//   F45/D75 — commits mark ONLY the core's dirty flag: the save dock lights
//             on the first commit, the canvas projection shows the edit
//             immediately (the editor surface is the author's truth), but
//             the header snapshot keeps serving the SAVED graph until
//             Save — the go-live discriminator this spec pins (renaming the
//             pin node flips tme-location only after Save).
//   C29/R2  — the panel binds a LOCAL DRAFT copy, never the live
//             MapNodeData; commits are whole-draft, one facade.upsertNode
//             (full-replace, id immutable) on the draft's close moments:
//             Done, selection change, panel close.
//   C30     — refusals throw MapValidationError with the collected
//             field-precise issues; the panel renders them user-visibly
//             (never console-only), the draft stays open, and the refusal
//             is console-silent (caught, nothing half-applied).
//   D21     — 'waypoint' is the runtime overlay origin, never offered as an
//             editor kind; the parent picker lists same-layer containers.
//   F07/§6.2 — re-parenting into a district renders the node inside the
//             compound box (projection parent + bounding box).
//   D10     — a refused draft is never dropped silently: the selection
//             re-points to the refused node so the author fixes or reverts.
//   F52/D53 — every new control is a >= 44px tap target, the whole journey
//             runs touch-alone at the phone viewport, console stays clean.
//
// PKG B-131 (§5 Phase 3.5 M5, D94/F55/C34) extends this suite: the Blocking
// section — the one-tap "Block access" for leaf kinds (default reason
// 'Closed', adjacent input for refinement), the blocked row + Lift, the
// map marker (the D94 badge) and the route panel's blocked-nodes listing,
// plus the caught C30 refusal for an UNSAVED placed node (the A-018
// saved-plane gate, surfaced console-silently — the B-121 lesson).
//
// FX1 facts (data/worlds/fuyuki.ts): 'outskirts' is a parentless location
// with many incident arcs (the re-kind refusal target); 'kotomine-church'
// carries alias 'church' and four projected edges incl. the harness curve
// demo edge (the delete cascade target); 'district-miyama' renders as
// Miyama's compound box; the pin is 'emiya-residence' (the header
// discriminator's rename target); arc-outskirts-einzbern-castle is the
// arc-panel spec's vetted midpoint tap target.
import { expect, test, type Locator, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
  nodeParent(id: string): string | null;
  edgeIds(): string[];
  zoom(): number;
  pan(): { x: number; y: number };
  /** C5/D75: the selected node's id — placed nodes are never id-predicted. */
  selectedNodeId(): string | null;
  /** B-113: whether one projected element (node OR badge pseudo-node) carries a class. */
  nodeHasClass(id: string, cls: string): boolean;
  nodeData(id: string): {
    label: string;
    kind: string;
    parent: string | null;
    aliases: string[];
    description: string | null;
  } | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

const OUTSKIRTS_ID = 'outskirts';
const EMIYA_ID = 'emiya-residence';
const CHURCH_ID = 'kotomine-church';
const MIYAMA_ID = 'district-miyama';
const CASTLE_ID = 'einzbern-castle'; // isolated corner node — tap clearance at the squeezed phone fit

/** FX1 arc facts: the vetted midpoint tap target (arc-panel.e2e-spec.ts). */
const CASTLE_ARC = { source: OUTSKIRTS_ID, target: 'einzbern-castle' };

/** The editor chrome's top-right stack stays clear of this vetted point. */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };

const isPhone = (): boolean => test.info().project.name === 'phone';

/**
 * PKG B-142 (REPAIRS R-2) re-baseline: the phone boot now stages AT the pin
 * (the boot-posture zoom, the pin-centered viewport). This spec's aims are
 * exhaustively scanned against the PRE-PACKET WORLD-FIT boot viewport
 * (zoom = 0.282... on FX1 — the hit-corridor arithmetic above), so the phone
 * cells restore exactly that viewport first by tapping the rail's Fit — the
 * packet's own "explicit full-world ask". Desktop never arms the posture
 * (the wide gate mirrors D81's 700px breakpoint), so its boot is
 * byte-unchanged and this is a no-op. Aim math and every assertion are
 * untouched — the R23 in-box-content law stands throughout.
 */
const restoreBootViewport = async (page: Page): Promise<void> => {
  if (isPhone()) await page.getByTestId('tme-zoom-fit').tap();
};

// page.evaluate callbacks are SERIALIZED: the hook lookup is inlined in each
// one — no module-scope closures cross the wire (interactions.e2e-spec.ts
// precedent).

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeLabels();
  });

const readRenderedPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeRenderedPosition(nodeId);
    },
    id,
  );

const readBoundingBox = (
  page: Page,
  id: string,
): Promise<{ x: number; y: number; w: number; h: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number; w: number; h: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeRenderedBoundingBox(nodeId);
    },
    id,
  );

const readEdgeIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.edgeIds();
  });

/** B-117: the projected `parent` of one node — the compound-box proof. */
const readNodeParent = (page: Page, id: string): Promise<string | null> =>
  page.evaluate(
    (nodeId): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeParent(nodeId);
    },
    id,
  );

/** B-117: the authored fields of one library node (the panel's data seam). */
const readNodeData = (page: Page, id: string): Promise<TmeE2EHook['nodeData']> =>
  page.evaluate(
    (nodeId): TmeE2EHook['nodeData'] => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeData(nodeId);
    },
    id,
  );

/** C5/D75: the selected node's id (the placed node after a place command). */
const readSelectedId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.selectedNodeId();
  });

/** B-131: whether one projected element (node or badge pseudo-node) carries a class. */
const readHasClass = (page: Page, id: string, cls: string): Promise<boolean> =>
  page.evaluate(
    ({ id, cls }): boolean => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeHasClass(id, cls);
    },
    { id, cls },
  );

/**
 * B-133c (D91) coverage guard — the reference implementation's shape
 * (editor-quick-connect @ 5006574), with two probe-derived extensions:
 * the band rects read the panel HOSTS (a scrolled sheet's content rect
 * spans far past the viewport — the host is the visible band that actually
 * intercepts taps), and the ARC panel joins the bands. The dodge is ONE
 * background mouse drag (a drag is not a tap — the panel's draft is
 * untouched); its start is a live clear-canvas point found via
 * elementFromPoint between the top chrome and the topmost band, clear of
 * every rendered node (editor-mode drags grab nodes). Phone-only (D53):
 * desktop taps stay byte-identical.
 */
const EPP_NODE_IDS = [
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
): Promise<void> => {
  const canvas = await page.getByTestId('tme-canvas').boundingBox();
  if (canvas === null) throw new Error('canvas host not visible');
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
        if (hook === undefined) throw new Error(HOOK_ERROR);
        return hook.pan();
      });
    const panBefore = await panRead();
    // The drag's START must be a clear CANVAS point clear of every rendered
    // node (only the down point matters — cytoscape captures the pointer).
    const start = await page.evaluate(
      ({ canvasBox, top, floor, ids }): Point | null => {
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
        ids: [...EPP_NODE_IDS],
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

/** A node tap through the seam, coverage-guarded (B-133c, D91). */
const tapNodeAimed = async (page: Page, id: string): Promise<void> =>
  tapAimed(page, () => nodeScreenPoint(page, id));

/**
 * B-114/B-117 (D53): open the route panel's blocked listing on the phone —
 * in the editor regime the collapsed sheet keeps it one explicit rail tap
 * away (reachable, never gone); desktop is the always-open sidebar.
 * B-133c (D91): in the squeezed sheet stack the maximized property sheet
 * overlaps the rail's lower band once its own content scrolls (probe: the
 * panel's internal scroll moves its pointer-events:none top padding away
 * and elementFromPoint at the rail's CENTER answered the panel's field
 * content — the center tap intercepted forever). The rail's UPPER sliver
 * stays hittable: the tap aims at the first point from the rail's top that
 * elementFromPoint answers with the rail itself — a genuine tap on the
 * control's visible part (the coverage-guard family's DOM-chrome twin).
 */
const openRouteSheet = async (page: Page): Promise<void> => {
  if (!isPhone()) return;
  const at = await page.evaluate((): { x: number; y: number } | null => {
    const rail = document.querySelector('[data-testid="tme-sheet-rail"]');
    if (rail === null) return null;
    const r = rail.getBoundingClientRect();
    for (let dy = 6; dy <= r.height - 6; dy += 6) {
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + dy);
      if (hit !== null && (hit === rail || rail.contains(hit))) {
        return { x: r.width / 2, y: dy };
      }
    }
    return null;
  });
  if (at === null) throw new Error('openRouteSheet: the sheet rail is not hittable (fully covered)');
  await page.getByTestId('tme-sheet-rail').tap({ position: at });
  await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
};

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

/** Enter editor mode and open the property panel for one FX1 node. */
const openPanelFor = async (page: Page, id: string): Promise<void> => {
  await activate(page.getByTestId('tme-editor-toggle'));
  await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
  await tapPoint(page, await nodeScreenPoint(page, id));
  await expect(page.getByTestId('tme-property-panel')).toBeVisible();
};

test.describe('property panel: rename, kind & parent, aliases, description, delete (PKG B-117)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readLabels(page)).toContain('Outskirts');
  });

  test('opens only in editor mode for a library-node selection; an edge selection shows the arc panel instead (B-106 mutual exclusion)', async ({
    page,
  }) => {
    const panel = page.getByTestId('tme-property-panel');

    // View mode: a node selection shows the chip, never the property panel.
    await tapPoint(page, await nodeScreenPoint(page, OUTSKIRTS_ID));
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(panel).toHaveCount(0);

    // Editor mode: the same selection opens the panel, seeded from the node.
    await activate(page.getByTestId('tme-editor-toggle'));
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('tme-node-label-input')).toHaveValue('Outskirts');

    // Editor exit hides the panel (a close moment — cell 7 pins its commit);
    // re-entering resumes it for the same selection.
    await activate(page.getByTestId('tme-editor-toggle'));
    await expect(panel).toHaveCount(0);
    await activate(page.getByTestId('tme-editor-toggle'));
    await expect(panel).toBeVisible();

    // An edge tap clears the node selection (B-106): the arc panel's slot —
    // the property panel is gone. Midpoint of the vetted castle arc.
    // B-133c (D91): the property sheet is open over the stage — the midpoint
    // tap is coverage-guarded (probe: the aim answered the panel's label).
    const arcMidAim = async (): Promise<Point> => {
      await settle(page);
      const a = await readRenderedPosition(page, CASTLE_ARC.source);
      const b = await readRenderedPosition(page, CASTLE_ARC.target);
      if (a === null || b === null) throw new Error('arc endpoints not rendered');
      const box = await page.getByTestId('tme-canvas').boundingBox();
      if (box === null) throw new Error('canvas host not visible');
      return {
        x: box.x + (a.x + b.x) / 2,
        y: box.y + (a.y + b.y) / 2,
      };
    };
    await tapAimed(page, arcMidAim);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(panel).toHaveCount(0);
  });

  test('rename commits on Done; the save dock lights; the header keeps the SAVED label until Save (F45/D75 discriminator)', async ({
    page,
  }) => {
    await openPanelFor(page, EMIYA_ID);
    const label = page.getByTestId('tme-node-label-input');
    await expect(label).toHaveValue('Emiya Residence');

    await label.fill('Emiya Home');
    await activate(page.getByTestId('tme-node-done'));

    // F45: the commit marked the map dirty — the dock lights; the canvas
    // projection (the editor surface) shows the new label immediately...
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect.poll(() => readLabels(page)).toContain('Emiya Home');
    // ...the authored node carries it (R2/R4 — one truth)...
    await expect.poll(async () => (await readNodeData(page, EMIYA_ID))?.label).toBe('Emiya Home');
    // ...and the panel re-seeded from the committed values.
    await expect(label).toHaveValue('Emiya Home');
    // F45's go-live discriminator: the header still serves the SAVED
    // snapshot — routing and the snapshot keep the old label until Save.
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence');

    // Save takes the edit live: the dock clears, the header re-reads.
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Home');
  });

  test('kind select commits a legal re-kind; an empty label refuses field-precise, draft intact, reverting recovers (C30/F46) — console-silent', async ({
    page,
  }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    await openPanelFor(page, OUTSKIRTS_ID);
    const kind = page.getByTestId('tme-node-kind');
    await expect(kind).toHaveValue('location');

    // The engine's leaf/container edge rule is STRUCTURAL (parent-based,
    // §6.2 — 'must be a leaf node' keys on actual parent references), so a
    // childless node with incident edges may legally re-kind to a container:
    // the panel submits one whole-draft command, the facade accepts, the
    // dock lights and the projection re-kinds. The packet's expected refusal
    // for exactly this case does not exist at the core (facade-editor spec
    // pins the refusal for a REAL compound parent's edge endpoint only) —
    // this cell pins the engine's actual answer (DEVIATION, B-117 report).
    await kind.selectOption({ label: 'District' });
    await activate(page.getByTestId('tme-node-done'));
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect(page.getByTestId('tme-node-errors')).toHaveCount(0);
    await expect.poll(async () => (await readNodeData(page, OUTSKIRTS_ID))?.kind).toBe('district');
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();

    // C30 through the fields path: label must be a non-empty string. The
    // refusal renders user-visibly with the precise field path, NOTHING is
    // committed (the dock stays hidden) and the draft stays open, untouched
    // (D10 — the author corrects in place).
    const label = page.getByTestId('tme-node-label-input');
    await label.fill('');
    await activate(page.getByTestId('tme-node-done'));
    await expect(page.getByTestId('tme-node-errors')).toBeVisible();
    await expect(page.getByTestId('tme-node-error').first()).toContainText('must be a non-empty string');
    await expect(page.getByTestId('tme-node-error').first()).toContainText('.label');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect(label).toHaveValue('');

    // Restoring the saved value is the recovery: Done on the untouched draft
    // is a no-op that clears the refusal — and still commits nothing.
    await label.fill('Outskirts');
    await activate(page.getByTestId('tme-node-done'));
    await expect(page.getByTestId('tme-node-errors')).toHaveCount(0);
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();

    expect(bad, 'the C30 refusal is console-silent (caught, never half-applied)').toEqual([]);
  });

  test('re-parent into a district re-renders the node inside the compound box (F07/§6.2)', async ({ page }) => {
    await openPanelFor(page, OUTSKIRTS_ID);
    const parent = page.getByTestId('tme-node-parent');
    await expect(parent).toHaveValue('');

    await parent.selectOption({ label: 'Miyama' });
    await activate(page.getByTestId('tme-node-done'));

    // The commit went through (dock lights) and the projection carries the
    // new parent — the node renders inside Miyama's compound box.
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect.poll(() => readNodeParent(page, OUTSKIRTS_ID)).toBe(MIYAMA_ID);
    await settle(page);
    const box = await readBoundingBox(page, MIYAMA_ID);
    const pos = await readRenderedPosition(page, OUTSKIRTS_ID);
    if (box === null || pos === null) throw new Error('compound box or node not rendered');
    expect(pos.x).toBeGreaterThanOrEqual(box.x);
    expect(pos.x).toBeLessThanOrEqual(box.x + box.w);
    expect(pos.y).toBeGreaterThanOrEqual(box.y);
    expect(pos.y).toBeLessThanOrEqual(box.y + box.h);

    // F45: the saved graph still serves routing/the snapshot until Save.
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
  });

  test('alias add persists through the dirty/save cycle (F08 data plane — matching effects are Phase 4)', async ({
    page,
  }) => {
    await openPanelFor(page, CHURCH_ID);
    const inputs = page.getByTestId('tme-alias-input');
    await expect(inputs).toHaveCount(1); // FX1: 'church'
    await expect(inputs.first()).toHaveValue('church');

    await activate(page.getByTestId('tme-alias-add'));
    await expect(inputs).toHaveCount(2);
    await inputs.nth(1).fill('temple on the hill');
    await activate(page.getByTestId('tme-node-done'));

    // One whole-draft command: the authored node carries BOTH aliases —
    // asserted via the seam post-save (the dirty/save cycle below).
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(async () => (await readNodeData(page, CHURCH_ID))?.aliases).toEqual([
      'church',
      'temple on the hill',
    ]);
  });

  test('delete cascades incident edges, closes the panel and the chip — no confirm dialog (F46/D75)', async ({
    page,
  }) => {
    const dyingEdges = [
      'arc-kotomine-church-ghost-house',
      'arc-fuyuki-station-kotomine-church',
      'arc-outskirts-kotomine-church',
      'arc-harness-curve-demo', // the harness demo edge dies with its endpoint
    ];
    await expect.poll(() => readEdgeIds(page)).toEqual(expect.arrayContaining(dyingEdges));

    await openPanelFor(page, CHURCH_ID);
    await activate(page.getByTestId('tme-node-delete'));

    // Direct delete (F46): the node, its chip and its panel are gone; the
    // D75 cascade took every incident edge in both planes with it.
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    await expect.poll(async () => !(await readLabels(page)).includes('Kotomine Church')).toBe(true);
    await expect
      .poll(async () => readEdgeIds(page).then((ids) => dyingEdges.filter((edge) => ids.includes(edge))))
      .toEqual([]);

    // The delete was an edit: the dock lights; Save takes it live.
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(() => readNodeData(page, CHURCH_ID)).toBeNull();
  });

  test('close affordances commit the draft: chip dismiss and selection change (C29 draft-then-commit)', async ({
    page,
  }) => {
    await openPanelFor(page, OUTSKIRTS_ID);
    const label = page.getByTestId('tme-node-label-input');

    // Panel close (chip dismiss) commits the dirty draft — one command.
    await label.fill('The Outskirts');
    await activate(page.getByTestId('tme-selection-chip'));
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect.poll(() => readLabels(page)).toContain('The Outskirts');

    // Re-selecting resumes the committed value from the authored node.
    await tapPoint(page, await nodeScreenPoint(page, OUTSKIRTS_ID));
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await expect(label).toHaveValue('The Outskirts');

    // A selection CHANGE commits too: the panel re-seeds for the new node —
    // the ISOLATED castle (clearance at the squeezed phone fit, where the
    // clustered Miyama children are a few px apart) — while the previous
    // edit lands (dock stays lit until Save).
    // B-133c (D91): the property sheet is open over the stage — the castle
    // tap is coverage-guarded (probe: the aim answered the panel's title).
    await label.fill('Outskirts End');
    await tapNodeAimed(page, CASTLE_ID);
    await expect(page.getByTestId('tme-node-label-input')).toHaveValue('Einzbern Castle');
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect.poll(() => readLabels(page)).toContain('Outskirts End');

    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
  });

  // --- PKG B-131 (§5 Phase 3.5 M5, D94/F55/C34): the Blocking section ------

  test('one-tap Block access: marker + listing + blocked row land, a real reason restates, lift clears (D94/F55, C34)', async ({
    page,
  }) => {
    await openPanelFor(page, OUTSKIRTS_ID);
    const markerId = `tme-node-blocked-badge-${OUTSKIRTS_ID}`; // the D94 marker convention
    const input = page.getByTestId('tme-node-block-input');

    // The section renders for a leaf kind; the input is pristine.
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('');

    // One tap from pristine: the ONE default reason applies, no typing
    // (D94's authored vocabulary, C23 — the owner-reviewed 'Closed').
    await activate(page.getByTestId('tme-node-block'));
    await expect(page.getByTestId('tme-node-block-row')).toBeVisible();
    await expect(page.getByTestId('tme-node-block-reason')).toHaveText('Closed');

    // The map marker: the blocked-node badge is projected at the node —
    // asserted per the badges.e2e-spec pattern (a rendered pseudo-node box
    // off the seam) plus the DISTINCT marker class.
    await expect.poll(() => readBoundingBox(page, markerId)).not.toBeNull();
    expect(await readHasClass(page, markerId, 'tme-node-blocked-badge')).toBe(true);

    // The route panel's blocked listing: label + reason verbatim, beside the
    // pin-incident blocked-arc list (D94: the nodes are not pin-scoped — the
    // snapshot listing is the projection, R4).
    await openRouteSheet(page);
    await expect(page.getByTestId('tme-blocked-nodes')).toBeVisible();
    await expect(page.getByTestId('tme-blocked-node-item')).toHaveCount(1);
    await expect(page.getByTestId('tme-blocked-node-label')).toHaveText('Outskirts');
    await expect(page.getByTestId('tme-blocked-node-reason')).toHaveText('Closed');

    // Refinement: type the real reason, tap again — adds-or-restates (the
    // facade contract); the listing follows the restated reason live.
    await input.fill('Flooded');
    await activate(page.getByTestId('tme-node-block'));
    await expect(page.getByTestId('tme-node-block-reason')).toHaveText('Flooded');
    await expect(page.getByTestId('tme-blocked-node-reason')).toHaveText('Flooded');

    // Lift: the overlay delete — marker gone (the rebuild), listing gone,
    // row gone.
    await activate(page.getByTestId('tme-node-block-lift'));
    await expect(page.getByTestId('tme-node-block-row')).toHaveCount(0);
    await expect(page.getByTestId('tme-blocked-nodes')).toHaveCount(0);
    await expect.poll(() => readBoundingBox(page, markerId)).toBeNull();
  });

  test('container kind drafts the Blocking section away — a leaf kind brings it back (F07 dead control; the draft kind is the gate)', async ({
    page,
  }) => {
    await openPanelFor(page, OUTSKIRTS_ID);
    const kind = page.getByTestId('tme-node-kind');
    await expect(kind).toHaveValue('location');
    await expect(page.getByTestId('tme-node-block')).toBeVisible();

    // Containers never connect to arcs (F07), so blocking one is a dead
    // control: re-kinding the DRAFT to a container drafts the section out
    // live (the compound box itself is never selectable — an editor box tap
    // places, a view box tap is a no-op — so the draft kind IS the panel's
    // kind truth). No commit: the select writes the draft only.
    await kind.selectOption({ label: 'District' });
    await expect(page.getByTestId('tme-node-block')).toHaveCount(0);
    await expect(page.getByTestId('tme-node-block-input')).toHaveCount(0);

    // Back to a leaf kind: the section returns.
    await kind.selectOption({ label: 'Location' });
    await expect(page.getByTestId('tme-node-block')).toBeVisible();
  });

  test('blocking an UNSAVED placed node is refused field-precise and console-silent; nothing lands (C30, the A-018 saved-plane gate, B-121 lesson)', async ({
    page,
  }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    // Place a node (engine-assigned id, C5 — read live) and block it WITHOUT
    // saving: the facade's ADD path is saved-plane-gated and refuses
    // field-precisely; the service catches it (never an uncaught console
    // throw) and renders it; nothing lands anywhere.
    await activate(page.getByTestId('tme-editor-toggle'));
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await expect.poll(readSelectedId.bind(null, page)).not.toBeNull();
    const placedId = await readSelectedId(page);
    if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');

    await activate(page.getByTestId('tme-node-block'));
    await expect(page.getByTestId('tme-node-block-refusal')).toBeVisible();
    await expect(page.getByTestId('tme-node-block-refusal')).toContainText('unsaved');
    await expect(page.getByTestId('tme-node-block-row')).toHaveCount(0);
    await expect(page.getByTestId('tme-blocked-nodes')).toHaveCount(0);
    await expect.poll(() => readBoundingBox(page, `tme-node-blocked-badge-${placedId}`)).toBeNull();

    expect(bad, 'the caught refusal is console-silent (nothing half-applied)').toEqual([]);
  });

  test('every new control meets the 44px tap-target floor (F52/D53)', async ({ page }) => {
    await openPanelFor(page, CHURCH_ID); // carries one seeded alias row
    for (const testid of [
      'tme-node-label-input',
      'tme-node-kind',
      'tme-node-parent',
      'tme-node-description',
      'tme-alias-input',
      'tme-alias-remove',
      'tme-alias-add',
      'tme-node-block-input',
      'tme-node-block',
      'tme-node-delete',
      'tme-node-done',
    ]) {
      const box = await page.getByTestId(testid).first().boundingBox();
      expect(box, `${testid} is on the touch surface`).not.toBeNull();
      expect(box?.height ?? 0, `${testid} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0, `${testid} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }
  });

  test('touch-alone authoring journey at the phone viewport keeps the harness console clean (§6.2/D53/F52)', async ({
    page,
  }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    // Place: the editor background tap creates + selects a node; the panel
    // opens seeded with the C23 default label. The engine-assigned id is
    // read live (C5/D75) — the parent assertion below needs it.
    await activate(page.getByTestId('tme-editor-toggle'));
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    const label = page.getByTestId('tme-node-label-input');
    await expect(label).toHaveValue('New place');
    await expect.poll(readSelectedId.bind(null, page)).not.toBeNull();
    const placedId = await readSelectedId(page);
    if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');

    // Rename, re-parent, alias — one Done each, one command per commit.
    await label.fill('Crossroads');
    await activate(page.getByTestId('tme-node-done'));
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await page.getByTestId('tme-node-parent').selectOption({ label: 'Miyama' });
    await activate(page.getByTestId('tme-node-done'));
    await activate(page.getByTestId('tme-alias-add'));
    // The placed node seeds with NO aliases — the added row is the FIRST one.
    await page.getByTestId('tme-alias-input').first().fill('crossing');
    await activate(page.getByTestId('tme-node-done'));

    // The projection shows the authored truth: new label inside Miyama.
    await expect.poll(() => readLabels(page)).toContain('Crossroads');
    await expect.poll(() => readNodeParent(page, placedId)).toBe(MIYAMA_ID);

    // Save takes it live; the delete is one direct tap (F46), then save again.
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await activate(page.getByTestId('tme-node-delete'));
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
    await expect.poll(() => readLabels(page)).not.toContain('Crossroads');
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();

    // Exit editor — the journey's last control.
    await activate(page.getByTestId('tme-editor-toggle'));
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'false');

    expect(bad, 'no console errors/warnings/pageerrors during the journey').toEqual([]);
  });
});
