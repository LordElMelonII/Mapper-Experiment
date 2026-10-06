// tests/e2e/layer-manager.e2e-spec.ts — PKG B-126 (§5 Phase 3 M3): the D82
// layer-manager SHEET (create / rename / up-down reorder / informed-cascade
// delete), the D83 property-panel Layer dropdown, and the F54 Detach tool —
// at BOTH playwright projects (desktop + emulated phone with touch) per
// D53/F52 mobile-and-desktop parity (the desktop-only cells: informed
// cascade, fences, draft log — the packet's cell list).
//
// Cited IDs:
//   D82      — the sheet regime: a sheet opened from the layer nav's Manage
//              affordance; reorder is up/down buttons (drag handles refused
//              — D53); deletion is an INFORMED CASCADE whose confirm counts
//              are core-computed (R1) and one confirm deletes it all
//              together; the last remaining layer is never deletable;
//              deleting the active layer resets it exactly as loadMap does
//              (D69); layer order is array/nav order only.
//   D83      — the node property panel's Layer dropdown: the ONE way to move
//              a node between layers; C3 rides (cross-layer-ness derives —
//              a cross-layer arc re-badges with NO arc edit); a stranding
//              move is refused visibly and the dropdown reverts — never
//              silently re-parented.
//   F54      — the standing Detach tool: every incident arc dies, the node
//              survives; no confirm (the F46 removeNode precedent).
//   D81      — the sheet's open/close is a panel-driven resize: PRESERVED on
//              wide (zoom+pan byte-equal, the arc-panel precedent), REFIT on
//              narrow (the B-114 pinned rail behavior).
//   R1       — the confirm's three numbers are asserted against
//              layerRemovalImpact (the ENGINE's counts) through the
//              window.__TME_E2E__ seam — never a spec-side recount; the
//              header strings stay verbatim across every resizing
//              transition.
//   D75/F45  — every sheet/dropdown/detach command marks only `dirty`: the
//              save dock appears; a zero-arc Detach no-op flips nothing
//              (the dock does NOT appear).
//   B-121/D77 — the draft log: a moved node joins; no dying id remains
//              after a cascade delete.
//   C23      — plain words everywhere a user reads; machine ids never
//              render (the spec addresses rows by authored NAME).
//   F52/D53  — the whole journey runs touch-alone at the phone viewport;
//              every control is a >= 44px tap target; no hover affordance.
//
// FX1 facts (data/worlds/fuyuki.ts): layers layer-fuyuki ("Fuyuki City") /
// layer-misaki ("Misaki Town"); 'misaki-town' is misaki's ONLY node; the
// map's only cross-layer arc is arc-fuyuki-station-misaki-town (badge on
// the fuyuki canvas at load); 'outskirts' is a PARENTLESS location with 5
// incident arcs (the movable node — arc-outskirts-einzbern-castle goes
// cross-layer when it moves); 'emiya-residence' has parent 'district-miyama'
// (the stranding refusal target — api.ts: parent is "same layer"); the pin
// is 'emiya-residence'. Canvas content is aimed/read through the
// DEV-HARNESS-ONLY window.__TME_E2E__ seam (src/app/app.ts).
import { expect, test, type Page } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  edgeIds(): string[];
  /** B-107: one cross-layer badge's text by arc id, or null when no badge projects. */
  badgeText(arcId: string): string | null;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
  /** C5/D75: the selected node's id, or null. */
  selectedNodeId(): string | null;
  /** B-121 (D77): the edit log's ids. */
  draftedIds(): string[];
  /** B-126 (D82/R1): the engine's layer-removal counts, or null. */
  layerRemovalImpact(layerId: string): { nodes: number; sameLayerArcs: number; crossLayerArcs: number } | null;
  /** The authored source/target of one library edge, or null (the incident-count read). */
  edgeData(id: string): { id: string; source: string; target: string } | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

/** FX1 facts the cells engineer against. */
const OUTSKIRTS_ID = 'outskirts'; // parentless, 5 incident arcs — the movable node
const EMIYA_ID = 'emiya-residence'; // parent district-miyama — the stranding refusal
const CASTLE_ARC_ID = 'arc-outskirts-einzbern-castle'; // goes cross-layer when outskirts moves
const STATION_ARC_ID = 'arc-fuyuki-station-misaki-town'; // FX1's only cross-layer arc
const MISAKI_LAYER_ID = 'layer-misaki';
const FUYUKI_LAYER_ID = 'layer-fuyuki';
const CREATED_LAYER_NAME = 'Shadow Port';
const RENAMED_LAYER_NAME = 'Dusk Port';

/** R1: the three core header strings, verbatim. */
const R1_HEADERS: ReadonlyArray<[string, string]> = [
  ['tme-location', 'Emiya Residence'],
  ['tme-snapshot-layer', 'Fuyuki City'],
  ['tme-unit', 'min'],
];

const isPhone = (): boolean => test.info().project.name === 'phone';

// page.evaluate callbacks are SERIALIZED: the hook lookup is inlined in
// each one — no module-scope closures cross the wire (the discipline every
// other spec follows).

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeLabels();
  });

const readEdgeIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.edgeIds();
  });

const readBadgeText = (page: Page, arcId: string): Promise<string | null> =>
  page.evaluate(
    (id): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.badgeText(id);
    },
    arcId,
  );

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeRenderedPosition(nodeId);
    },
    id,
  );

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

const readSelectedNodeId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.selectedNodeId();
  });

const readDraftedIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.draftedIds();
  });

/** B-126/R1: the ENGINE's counts — the confirm dialog's numbers asserted against these. */
const readImpact = (
  page: Page,
  layerId: string,
): Promise<{ nodes: number; sameLayerArcs: number; crossLayerArcs: number } | null> =>
  page.evaluate(
    (id): { nodes: number; sameLayerArcs: number; crossLayerArcs: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.layerRemovalImpact(id);
    },
    layerId,
  );

/** How many projected edges are incident to one node (in-page, via edgeData). */
const countIncident = async (page: Page, nodeId: string): Promise<number> => {
  const { total, incident } = await page.evaluate(
    (id): { total: number; incident: number } => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      const ids = hook.edgeIds();
      let n = 0;
      for (const edgeId of ids) {
        const edge = hook.edgeData(edgeId);
        if (edge !== null && (edge.source === id || edge.target === id)) n += 1;
      }
      return { total: ids.length, incident: n };
    },
    nodeId,
  );
  expect(total, 'engineering: the projection holds edges').toBeGreaterThan(0);
  return incident;
};

const canvasBox = async (page: Page) => {
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return box;
};

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const tapPoint = async (page: Page, x: number, y: number): Promise<void> => {
  // B-133 (D91) review fix: the panels are stage overlays — a tap aimed at a
  // covered point lands on the sheet, not the canvas. If the aim point sits
  // under the route sheet (the auto-expanded content overlay), collapse it
  // first — the user's "the map didn't respond, close the sheet, tap again"
  // flow; a selection below re-expands it (B-114).
  const covered = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return el !== null && el.closest('tme-route-panel') !== null;
  }, [x, y] as const);
  if (covered) {
    if ((await page.getByTestId('tme-sheet-rail').getAttribute('aria-expanded')) === 'true') {
      await page.getByTestId('tme-sheet-rail').click();
      await expect(page.getByTestId('tme-sheet-rail')).toHaveAttribute('aria-expanded', 'false');
      await page.waitForTimeout(200); // the collapse re-renders — a tap in the same tick can still hit the body
    }
  }
  if (isPhone()) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
};

/** F52/D53: one activation path for DOM controls on every project. */
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/**
 * Wait two animation frames: a sheet open/close changes the stage size
 * synchronously, but the ResizeObserver-driven path (D81: preserve + rescue
 * on wide, the B-106 refit otherwise) runs just before the next paint —
 * geometry reads inside that window yield pre-resize values (the pinned
 * arc-panel settle precedent).
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** Tap a canvas node through its rendered position (seam + canvas box). */
const tapNode = async (page: Page, id: string): Promise<void> => {
  await settle(page);
  const pos = await readPosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await canvasBox(page);
  await tapPoint(page, box.x + pos.x, box.y + pos.y);
};

/**
 * B-133c (D91) coverage guard — the reference implementation's shape
 * (editor-quick-connect @ 5006574), with two probe-derived extensions: the
 * band rects read the panel HOSTS (a scrolled sheet's content rect spans
 * far past the viewport — the host is the visible band), and the ARC panel
 * joins the bands. Diagnosed live on this spec's D83 cell: the emiya tap
 * after the move sat under the open property sheet (788px content; the aim
 * answered the panel's <label>), the selection never changed, and the
 * dropdown kept the prior node's layer. The dodge is ONE background mouse
 * drag (a drag is not a tap — the panel's draft and the dropdown's state
 * are untouched); its start is a live clear-canvas point clear of every
 * rendered node (editor-mode drags grab nodes). Phone-only (D53): desktop
 * taps stay byte-identical.
 */
const LM_NODE_IDS = [
  'einzbern-castle',
  'ryuudou-temple',
  'outskirts',
  'emiya-residence',
  'misaki-town',
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

const bandCovers = (pt: { x: number; y: number }, band: CoverBox | null): boolean =>
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
  aims: readonly { x: number; y: number }[],
  boxes: Record<string, CoverBox | null>,
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
    const panBefore = await readPan(page);
    // The drag's START must be a clear CANVAS point clear of every rendered
    // node (only the down point matters — cytoscape captures the pointer).
    const start = await page.evaluate(
      ({ canvasBox: cb, top, floor, ids }): { x: number; y: number } | null => {
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
        ids: [...LM_NODE_IDS],
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
 * cannot fit rather than tapping blind. Phone-only (D53).
 */
const tapAimed = async (page: Page, aim: () => Promise<{ x: number; y: number }>): Promise<void> => {
  if (!isPhone()) {
    const pt = await aim();
    await tapPoint(page, pt.x, pt.y);
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
      await tapPoint(page, pt.x, pt.y);
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
  tapAimed(page, async () => {
    await settle(page);
    const pos = await readPosition(page, id);
    if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
    const box = await canvasBox(page);
    return { x: box.x + pos.x, y: box.y + pos.y };
  });

/** R1: the three core header strings, verbatim. */
const expectHeaders = async (page: Page): Promise<void> => {
  for (const [testId, text] of R1_HEADERS) {
    await expect(page.getByTestId(testId)).toHaveText(text);
  }
};

/** Housekeeping: collect console errors/warnings/pageerrors (the D81 pattern). */
const collectConsole = (page: Page): string[] => {
  const bad: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));
  return bad;
};

/** One sheet row, addressed by its authored layer NAME (C23 — never an id). */
const layerRow = (page: Page, name: string) => page.locator('.tme-layer-row', { hasText: name });

/** The nav's layer-button labels in DOM order (array order — the one truth). */
const navLayerNames = (page: Page): Promise<string[]> =>
  page.locator('nav.tme-layers .tme-layer-button:not(.tme-manage)').allInnerTexts();

test.describe('the layer-manager sheet, the Layer dropdown and Detach (PKG B-126, D82/D83/F54)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readPosition(page, EMIYA_ID)).not.toBeNull();
  });

  test('open/close: Manage opens the sheet, X and Escape close it; wide preserves the viewport byte-equal (D81)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the wide-layout preserve rule is the desktop project (SCSS 700px breakpoint)');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);

    // A live selection far from the right band the sheet will take: FX1's
    // LEFTMOST content — the clamp's common case (zero compensation).
    await tapNode(page, 'einzbern-castle');
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await settle(page);
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);

    // Manage opens the sheet — a region column on wide (rail hidden, body shown).
    await activate(page, 'tme-layer-manage');
    await expect(page.getByTestId('tme-layer-manager')).toBeVisible();
    await expect(page.getByTestId('tme-layer-manager-body')).toBeVisible();
    await expect(page.getByTestId('tme-layer-rail')).toBeHidden(); // wide neutralizes the rail (B-114)
    await settle(page);
    expect(await readZoom(page), 'zoom preserved across the sheet open (D81)').toBe(zoomBefore);
    const panOpen = await readPan(page);
    expect(panOpen.x, 'pan.x preserved across the sheet open (D81)').toBe(panBefore.x);
    expect(panOpen.y, 'pan.y preserved across the sheet open (D81)').toBe(panBefore.y);
    await expectHeaders(page);

    // The X close: the stage widens back, the viewport stays byte-put.
    await activate(page, 'tme-layer-manager-close');
    await expect(page.getByTestId('tme-layer-manager')).toBeHidden();
    await settle(page);
    expect(await readZoom(page), 'zoom preserved across the sheet close (D81)').toBe(zoomBefore);
    const panClosed = await readPan(page);
    expect(panClosed.x, 'pan.x preserved across the sheet close (D81)').toBe(panBefore.x);
    expect(panClosed.y, 'pan.y preserved across the sheet close (D81)').toBe(panBefore.y);
    await expectHeaders(page);

    // Escape closes too (one discrete keydown; a no-op when closed).
    await activate(page, 'tme-layer-manage');
    await expect(page.getByTestId('tme-layer-manager')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tme-layer-manager')).toBeHidden();
    await settle(page);
    expect(await readZoom(page), 'zoom preserved across the whole cycle (D81)').toBe(zoomBefore);

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('phone: the sheet overlays as a bottom sheet with a rail; collapse and close never resize the canvas (D91 narrow / B-114 pinned)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the bottom-sheet form + rail collapse belong to the narrow viewport (D53)');
    const bad = collectConsole(page);
    await settle(page);
    await expectHeaders(page);

    // Manage opens the sheet in its bottom-sheet form: rail visible, body shown.
    await activate(page, 'tme-layer-manage');
    await expect(page.getByTestId('tme-layer-manager')).toBeVisible();
    await expect(page.getByTestId('tme-layer-rail')).toBeVisible();
    await expect(page.getByTestId('tme-layer-rail')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('tme-layer-manager-body')).toBeVisible();
    await settle(page);
    const expandedCanvas = await canvasBox(page);
    const expandedPan = await readPan(page);

    // The rail collapse hides the body — and under D91 the sheet OVERLAYS
    // the stage, so the canvas box is byte-identical collapsed and expanded
    // (the old freed-height-returns-to-canvas refit is gone: sheet
    // transitions resize nothing on narrow either — the re-pan observable
    // below pins that the refit no longer fires).
    await activate(page, 'tme-layer-rail');
    await expect(page.getByTestId('tme-layer-manager-body')).toBeHidden();
    await expect(page.getByTestId('tme-layer-rail')).toHaveAttribute('aria-expanded', 'false');
    await settle(page);
    const collapsedCanvas = await canvasBox(page);
    expect(collapsedCanvas.height, 'collapse never resizes the canvas (D91 zero-motion)').toBe(
      expandedCanvas.height,
    );
    expect(collapsedCanvas.width, 'collapse never resizes the canvas (D91 zero-motion)').toBe(
      expandedCanvas.width,
    );
    const collapsedPan = await readPan(page);
    expect(collapsedPan.y, 'no resize ⇒ no refit ⇒ the pan stands (D91)').toBe(expandedPan.y);
    await expectHeaders(page);

    // Escape closes the whole sheet; the canvas box still never moved.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tme-layer-manager')).toBeHidden();
    await settle(page);
    const closedCanvas = await canvasBox(page);
    expect(closedCanvas.height, 'the close never resizes the canvas (D91 zero-motion)').toBe(
      expandedCanvas.height,
    );

    // D53: the sheet cycle never forces horizontal scroll at 390px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at the phone viewport (F52/D53)').toBeLessThanOrEqual(0);

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('create, rename, reorder: row and nav move together; boundary buttons disabled (D82, touch-alone on phone)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await activate(page, 'tme-layer-manage');
    await expect(page.getByTestId('tme-layer-manager-body')).toBeVisible();

    // CREATE: a name + Add — the row appears, the nav button appears, the
    // input clears (the engine assigns the id, C5 — the spec never predicts it).
    await page.getByTestId('tme-layer-create-input').fill(CREATED_LAYER_NAME);
    await activate(page, 'tme-layer-create');
    await expect(layerRow(page, CREATED_LAYER_NAME)).toBeVisible();
    await expect(page.locator('nav.tme-layers', { hasText: CREATED_LAYER_NAME })).toBeVisible();
    await expect(page.getByTestId('tme-layer-create-input')).toHaveValue('');

    // RENAME: Edit toggles the row into its input; Save renames row AND nav.
    await layerRow(page, CREATED_LAYER_NAME).getByTestId('tme-layer-edit').click();
    await page.getByTestId('tme-layer-rename-input').fill(RENAMED_LAYER_NAME);
    await activate(page, 'tme-layer-rename-save');
    await expect(layerRow(page, RENAMED_LAYER_NAME)).toBeVisible();
    await expect(layerRow(page, CREATED_LAYER_NAME)).toHaveCount(0);
    await expect(
      page.locator('nav.tme-layers button', { hasText: RENAMED_LAYER_NAME }),
    ).toBeVisible();

    // REORDER: the last row's Up commits — the nav order swaps WITH the rows
    // (array order is the one truth). Boundary facts: first Up / last Down disabled.
    await expect
      .poll(async () => navLayerNames(page), { timeout: 5_000 })
      .toEqual(['Fuyuki City', 'Misaki Town', RENAMED_LAYER_NAME]);
    await layerRow(page, RENAMED_LAYER_NAME).getByTestId('tme-layer-up').click();
    await expect
      .poll(async () => navLayerNames(page), { timeout: 5_000 })
      .toEqual(['Fuyuki City', RENAMED_LAYER_NAME, 'Misaki Town']);
    await expect(layerRow(page, 'Fuyuki City').getByTestId('tme-layer-up')).toBeDisabled();
    await expect(layerRow(page, 'Misaki Town').getByTestId('tme-layer-down')).toBeDisabled();
    await expect(layerRow(page, RENAMED_LAYER_NAME).getByTestId('tme-layer-up')).toBeEnabled();
    await expect(layerRow(page, RENAMED_LAYER_NAME).getByTestId('tme-layer-down')).toBeEnabled();

    // The reorder marked dirty (D75): the save dock is the visual.
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('informed cascade: the confirm shows the ENGINE counts; one Delete removes layer, badge and all (D82/R1/D75)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the informed-cascade cell is the desktop project (the packet cell list)');
    const bad = collectConsole(page);
    await expectHeaders(page);
    await activate(page, 'tme-layer-manage');
    const impactBefore = await readImpact(page, MISAKI_LAYER_ID);
    expect(impactBefore, 'engineering: the engine answers for layer-misaki').not.toBeNull();

    // Delete opens the INLINE confirm; the three numbers in the sentence are
    // the engine's, verbatim (R1 — parsed out of the plain-words line and
    // compared against layerRemovalImpact, never recounted spec-side).
    await layerRow(page, 'Misaki Town').getByTestId('tme-layer-delete').click();
    const line = page.getByTestId('tme-layer-impact');
    await expect(line).toBeVisible();
    const match = (await line.innerText()).match(
      /^Deletes (\d+) places?, (\d+) arcs? on this layer, and (\d+) arcs? from another layer\.$/,
    );
    expect(match, 'the confirm sentence renders in the fixed plain-words shape (C23)').not.toBeNull();
    expect(Number(match![1]), 'N places equals the engine count (R1)').toBe(impactBefore!.nodes);
    expect(Number(match![2]), 'M same-layer arcs equals the engine count (R1)').toBe(impactBefore!.sameLayerArcs);
    expect(Number(match![3]), 'K cross-layer arcs equals the engine count (R1)').toBe(impactBefore!.crossLayerArcs);

    // CANCEL first: the row restores, nothing dies — the badge stands, no dock.
    await activate(page, 'tme-layer-delete-cancel');
    await expect(layerRow(page, 'Misaki Town').getByTestId('tme-layer-name')).toBeVisible();
    await expect(line).toBeHidden();
    expect(await readBadgeText(page, STATION_ARC_ID), 'cancel killed nothing (C30)').not.toBeNull();
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();

    // CONFIRM: one Delete deletes it all together — the row and nav button
    // go, the cross-layer arc's badge vanishes from the surviving layer's
    // canvas, the save dock appears (D75), the counts block is gone.
    await layerRow(page, 'Misaki Town').getByTestId('tme-layer-delete').click();
    await expect(line).toBeVisible();
    await activate(page, 'tme-layer-delete-confirm');
    await expect(layerRow(page, 'Misaki Town')).toHaveCount(0);
    await expect(page.locator('nav.tme-layers button', { hasText: 'Misaki Town' })).toHaveCount(0);
    await expect
      .poll(async () => readBadgeText(page, STATION_ARC_ID), { timeout: 5_000 })
      .toBeNull();
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect(line).toBeHidden();

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('fences: the last layer never deletes; deleting the ACTIVE layer resets to the survivors\' first (D82/D69)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the fences cell is the desktop project (the packet cell list)');
    const bad = collectConsole(page);
    await expectHeaders(page);

    // Make Misaki Town the ACTIVE layer (the nav stays the switcher), then
    // delete it from the sheet — it IS the active layer.
    await activate(page, 'tme-layer-' + MISAKI_LAYER_ID);
    await expect(page.getByTestId('tme-layer-' + MISAKI_LAYER_ID)).toHaveClass(/tme-active/);
    await activate(page, 'tme-layer-manage');
    await layerRow(page, 'Misaki Town').getByTestId('tme-layer-delete').click();
    await activate(page, 'tme-layer-delete-confirm');
    await expect(layerRow(page, 'Misaki Town')).toHaveCount(0);

    // D69: the active layer reset to the survivors' FIRST layer — the nav
    // highlight moved AND the canvas shows it (the fuyuki projection).
    await expect(page.getByTestId('tme-layer-' + FUYUKI_LAYER_ID)).toHaveClass(/tme-active/);
    await expect
      .poll(async () => readLabels(page), { timeout: 5_000 })
      .toContain('Emiya Residence');

    // The LAST remaining layer's Delete renders DISABLED with its reason in
    // words (the facade would refuse; the UI shows the fence honestly).
    const lastRow = layerRow(page, 'Fuyuki City');
    await expect(lastRow.getByTestId('tme-layer-delete')).toBeDisabled();
    await expect(lastRow.getByTestId('tme-layer-fence')).toHaveText(
      "The last remaining layer can't be deleted.",
    );

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('Layer dropdown: a move re-projects and re-badges (C3 derives); a stranding move is refused and reverts (D83)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await expectHeaders(page);

    // Engineering: outskirts' castle arc is SAME-layer at load — no badge.
    await settle(page);
    expect(await readBadgeText(page, CASTLE_ARC_ID), 'engineering: the castle arc is same-layer at load').toBeNull();

    // Editor + a plain (parentless) node: the dropdown shows its layer.
    await activate(page, 'tme-editor-toggle');
    await tapNode(page, OUTSKIRTS_ID);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    // B-133 REVIEW DIAGNOSTIC (temporary): which node did the tap select?
    const dropdown = page.getByTestId('tme-node-layer');
    await expect(dropdown).toHaveValue(FUYUKI_LAYER_ID);

    // THE MOVE: pick Misaki Town — immediate (a pick is a complete intent).
    await dropdown.selectOption({ label: 'Misaki Town' });
    await expect(dropdown).toHaveValue(MISAKI_LAYER_ID);

    // The node is gone from the old layer's canvas…
    await expect
      .poll(async () => readLabels(page), { timeout: 5_000 })
      .not.toContain('Outskirts');
    // …and its same-layer castle arc went CROSS-layer: the badge DERIVES from
    // the endpoints now (C3) — no arc edit anywhere.
    expect(await readBadgeText(page, CASTLE_ARC_ID), 'the castle arc re-badged cross-layer (C3 derives)').not.toBeNull();

    // Switching layers shows it on the NEW one.
    await activate(page, 'tme-layer-' + MISAKI_LAYER_ID);
    await expect
      .poll(async () => readLabels(page), { timeout: 5_000 })
      .toContain('Outskirts');
    await activate(page, 'tme-layer-' + FUYUKI_LAYER_ID);
    await expect
      .poll(async () => readLabels(page), { timeout: 5_000 })
      .not.toContain('Outskirts');

    // The save dock lit (D75: the move is dirty).
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    // STRANDING: emiya-residence has parent district-miyama (same layer by
    // contract) — the move is REFUSED in words and the dropdown REVERTS
    // (never silently re-parented, D83).
    // B-133c (D91): the property sheet is open over the stage — the emiya
    // tap is coverage-guarded (the diagnosed D83 failure: the aim answered
    // the panel's <label>, the selection never changed, the dropdown kept
    // the moved node's layer). The D83 two-pass revert itself is untouched.
    await tapNodeAimed(page, EMIYA_ID);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await expect(dropdown).toHaveValue(FUYUKI_LAYER_ID);
    await dropdown.selectOption({ label: 'Misaki Town' });
    await expect(page.getByTestId('tme-node-errors')).toBeVisible();
    await expect(dropdown, 'the dropdown reverts to the live layer (D83)').toHaveValue(FUYUKI_LAYER_ID);
    await expect
      .poll(async () => readLabels(page), { timeout: 5_000 })
      .toContain('Emiya Residence'); // never moved

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('Detach: the arcs vanish, the node stays selected; a zero-arc Detach flips nothing (F54/D75)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await expectHeaders(page);
    await activate(page, 'tme-editor-toggle');
    await tapNode(page, OUTSKIRTS_ID);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();

    const incidentBefore = await countIncident(page, OUTSKIRTS_ID);
    expect(incidentBefore, 'engineering: outskirts has incident arcs at load').toBeGreaterThan(0);
    const edgesBefore = (await readEdgeIds(page)).length;

    // Detach — immediate, NO confirm (the F46 precedent: the cascade confirm
    // exists because a LAYER dies, not because arcs do).
    await activate(page, 'tme-node-detach');
    await expect
      .poll(async () => countIncident(page, OUTSKIRTS_ID), { timeout: 5_000 })
      .toBe(0);
    expect((await readEdgeIds(page)).length, 'exactly the incident arcs died').toBe(
      edgesBefore - incidentBefore,
    );
    // The node survives SELECTED (the panel stays open); the move marks dirty (D75).
    await expect
      .poll(async () => readSelectedNodeId(page), { timeout: 5_000 })
      .toBe(OUTSKIRTS_ID);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    // A ZERO-ARC Detach is the facade's validating no-op: dirty untouched —
    // save first, then Detach again and the dock must NOT reappear.
    await activate(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await activate(page, 'tme-node-detach');
    await expect(page.getByTestId('tme-save-dock'), 'a no-op detach never flips dirty (D75)').toBeHidden();
    expect((await readEdgeIds(page)).length, 'the no-op changed nothing').toBe(edgesBefore - incidentBefore);

    await expectHeaders(page);
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('draft log: a moved node joins; no dying id remains after a cascade delete (B-121/D77)', async ({
    page,
  }) => {
    test.skip(isPhone(), 'the draft-log cell is the desktop project (the packet cell list)');
    const bad = collectConsole(page);

    // Move outskirts to Misaki Town — the moved node is DRAFTED.
    await activate(page, 'tme-editor-toggle');
    await tapNode(page, OUTSKIRTS_ID);
    await page.getByTestId('tme-node-layer').selectOption({ label: 'Misaki Town' });
    await expect
      .poll(async () => readDraftedIds(page), { timeout: 5_000 })
      .toContain(OUTSKIRTS_ID);

    // The cascade delete of layer-misaki kills outskirts with the layer —
    // NO dying id remains in the log (removed ids LEAVE, D82 ruling 4).
    await activate(page, 'tme-layer-manage');
    await layerRow(page, 'Misaki Town').getByTestId('tme-layer-delete').click();
    await activate(page, 'tme-layer-delete-confirm');
    await expect(layerRow(page, 'Misaki Town')).toHaveCount(0);
    await expect
      .poll(async () => readDraftedIds(page), { timeout: 5_000 })
      .not.toContain(OUTSKIRTS_ID);
    expect(await readDraftedIds(page), 'no dying id remains (misaki-town was never drafted)').not.toContain(
      'misaki-town',
    );

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });
});
