// tests/e2e/mode-surfaces.e2e-spec.ts — PKG B-124: the map-driven mode
// surfaces (D78/D42) — the route panel's mode switch renders the MAP's mode
// universe with the ONE core resolver's words (no hardcoded trio), and
// quick-connect commits the map's default-allowed derivation (the SAME
// private draw-arc uses) instead of a hardcoded mode set. Runs at BOTH
// playwright projects (desktop + emulated phone with touch) per D53/F52
// mobile-and-desktop parity; every gesture is touch-alone capable.
//
// Cited IDs:
//   D78/C23 — the switch rows are the map's mode universe (built-ins ∪
//          registry ids, insertion order) rowed with `resolveModeLabel`'s
//          words; the UI never maps ids to words (R1 spirit). On FX1 (no
//          registry) exactly the built-in trio — the pre-existing
//          route-panel/badges mode cells (testid + aria-pressed assertions)
//          stay green UNMODIFIED, which is itself the compat pin.
//   D42/D78 — quick-connect's Done commits `defaultArcModes()`: built-ins
//          allowed unless a registry entry adopting the id opts out
//          (`allowedByDefault: false`), plus every registry entry with
//          `allowedByDefault: true`. On FX1 byte-identical to the retired
//          CONNECT_EDGE_MODES trio — the pre-existing quick-connect D42
//          cells stay green UNMODIFIED.
//   A-016b — the default pricing scan reads the map's mode universe, so a
//          REGISTRY-ONLY arc (one mode, a registry id) prices and routes in
//          DEFAULT runs; RouteLeg carries the resolved modeLabel. Visible
//          here: the demo's horse-only arc routes with the overlay's walk
//          preference (fallback pricing) and keeps routing with Horseback
//          selected — both runs are DEFAULT runs (no explicit mode).
//   C30/C32 — the facade's setTravelMode validates against the loaded map's
//          universe (every rendered id is valid by construction); a
//          registry mode id ('horse') is accepted through the map-driven
//          switch, and the degrade path surfaces user-visibly
//          (travelModeRefusal), never an uncaught throw.
//   B-123 — the arc panel's per-mode rows on a REGISTRY map: the resolved
//          labels render ('Carriage', 'Horseback' — C23) and a registry
//          mode's authored minutes are editable + committable.
//   B-120 — the arc-Apply commit of this spec leaves zoom+pan untouched
//          (the commit-only pin: a rebuild never fits — the baseline is
//          taken on a settled layout and the Apply is layout-neutral at
//          both viewports). Quick-connect's Done is pinned for its committed
//          MODES here; its viewport is unpinned in this spec because the
//          banner close rides a sanctioned resize refit at phone width.
//   D53/F52 — every cell runs at both viewports, touch-alone on the phone
//          project; the wrapped switch never forces horizontal scroll; the
//          harness console stays clean.
//
// The REGISTRY DEMO map (harness-only, src/app/app.ts — the FX fixtures are
// untouched, D69/D70): `?map=registry-demo` boots 'Vale & Coast (Registry
// Demo)' instead of FX1. Registry: `horse` → 'Horseback'
// (allowedByDefault: true, speed 6) and `car` → 'Carriage'
// (allowedByDefault: false — the relabeled, default-opted-out built-in).
// `arc-vale-gate-high-pasture` is the REGISTRY-ONLY arc: horse only, no
// authored minutes — 240 px × 0.125 unitPerPx = 30 leagues, 30/6 × 60 =
// 300 min exactly. Walk arcs carry authored minutes (C14 row 3), so every
// route prices in minutes (C15/D72).
import { expect, test, type Locator, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  edgeIds(): string[];
  zoom(): number;
  pan(): { x: number; y: number };
  /** B-118: the quick-connect pick set, in pick order. */
  pickedNodeIds(): string[];
  /** B-118: whether quick-connect mode is on. */
  connectMode(): boolean;
  /** B-118/B-123: authored fields of one library edge, or null. */
  edgeData(id: string): { id: string; source: string; target: string; modes: string[] } | null;
  /** B-124: the route panel's switch rows (modeRows — the D78/C23 seam). */
  modeRows(): { id: string; label: string }[];
  /** B-123: the per-mode EDIT rows of one arc (arcModesOf), or null. */
  arcModes(id: string): { id: string; label: string; allowed: boolean; authoredMinutes: number | null }[] | null;
  /** B-118: the live route's leg arc ids, or null. */
  routeLegArcIds(): string[] | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

// FX1 facts: the trio universe, no registry.
const FX1_URL = '/';
// The harness-only registry demo (src/app/app.ts): its own id — never FX1's.
const DEMO_URL = '/?map=registry-demo';
const VALE_GATE_ID = 'vale-gate'; // the demo overlay's pin
const HIGH_PASTURE_ID = 'high-pasture'; // reachable ONLY via the registry-only arc
const OLD_MILL_ID = 'old-mill'; // the quick-connect source's picked target
const HORSE_ARC_ID = 'arc-vale-gate-high-pasture'; // THE registry-only arc

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

const readEdgeIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.edgeIds();
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

const readPickedIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.pickedNodeIds();
  });

const readConnectMode = (page: Page): Promise<boolean> =>
  page.evaluate((): boolean => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.connectMode();
  });

const readEdgeData = (page: Page, id: string): Promise<TmeE2EHook['edgeData']> =>
  page.evaluate(
    (edgeId): TmeE2EHook['edgeData'] => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.edgeData(edgeId);
    },
    id,
  );

const readModeRows = (page: Page): Promise<TmeE2EHook['modeRows']> =>
  page.evaluate((): TmeE2EHook['modeRows'] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.modeRows();
  });

const readArcModes = (page: Page, id: string): Promise<TmeE2EHook['arcModes']> =>
  page.evaluate(
    (arcId): TmeE2EHook['arcModes'] => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.arcModes(arcId);
    },
    id,
  );

const readRouteLegArcIds = (page: Page): Promise<string[] | null> =>
  page.evaluate((): string[] | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.routeLegArcIds();
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

/**
 * Screen-px midpoint of the straight line between two nodes — the rendered
 * edge between them passes through it (test-side math only, R1).
 */
const edgeMidpointPoint = async (page: Page, sourceId: string, targetId: string): Promise<Point> => {
  const a = await readRenderedPosition(page, sourceId);
  const b = await readRenderedPosition(page, targetId);
  if (a === null || b === null) throw new Error('edge endpoints not rendered');
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return { x: box.x + (a.x + b.x) / 2, y: box.y + (a.y + b.y) / 2 };
};

/** B-114: the narrow-viewport sheet starts collapsed — one rail tap opens it. */
const openSheetOnPhone = async (page: Page): Promise<void> => {
  if (!isPhone()) return;
  await activate(page.getByTestId('tme-sheet-rail'));
  await expect(page.getByTestId('tme-sheet-body')).toBeVisible();
};

test.describe('map-driven mode surfaces (PKG B-124)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FX1_URL);
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, 'emiya-residence')).not.toBeNull();
  });

  test('FX1 compat: the switch renders exactly the built-in trio with the resolver words (D78 no-registry; C23)', async ({
    page,
  }) => {
    await openSheetOnPhone(page);

    // The service rows ARE the no-registry universe: the built-in trio in
    // built-in order, each with the resolver's word (a bare built-in's id IS
    // its authored word — C23).
    await expect.poll(readModeRows.bind(null, page)).toEqual([
      { id: 'walk', label: 'walk' },
      { id: 'car', label: 'car' },
      { id: 'train', label: 'train' },
    ]);

    // Exactly three buttons, the same testids the pre-existing cells pin.
    const buttons = page.locator('.tme-modes button');
    await expect(buttons).toHaveCount(3);
    for (const id of ['walk', 'car', 'train']) {
      await expect(page.getByTestId(`tme-mode-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('tme-mode-horse')).toHaveCount(0); // no registry rows leak in

    // The active highlight mirrors the overlay default (walk) — the same
    // aria-pressed contract the pre-existing route-panel cells pin.
    await expect(page.getByTestId('tme-mode-walk')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tme-mode-car')).toHaveAttribute('aria-pressed', 'false');
  });

  test('registry demo: the switch renders the map mode universe with the resolved labels (D78/C23), wrapping, never sideways (D53)', async ({
    page,
  }) => {
    await page.goto(DEMO_URL);
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, VALE_GATE_ID)).not.toBeNull();
    await openSheetOnPhone(page);

    // The rows: built-ins first (the relabeled car carries the registry
    // word), then the registry declaration order (horse) — what the service
    // rows give.
    await expect.poll(readModeRows.bind(null, page)).toEqual([
      { id: 'walk', label: 'walk' },
      { id: 'car', label: 'Carriage' },
      { id: 'train', label: 'train' },
      { id: 'horse', label: 'Horseback' },
    ]);

    // Exactly four buttons; the registry-authored words render VERBATIM in
    // the DOM (no id-to-word mapping anywhere — C23).
    const buttons = page.locator('.tme-modes button');
    await expect(buttons).toHaveCount(4);
    await expect(page.getByTestId('tme-mode-car')).toHaveText('Carriage');
    await expect(page.getByTestId('tme-mode-horse')).toHaveText('Horseback');
    await expect(page.getByTestId('tme-mode-walk')).toBeVisible();
    await expect(page.getByTestId('tme-mode-train')).toBeVisible();

    // D53: the wrapped 4-button switch never forces horizontal scroll.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll with the registry switch (D53)').toBeLessThanOrEqual(0);

    // Every row is a >= 44px tap target (F52/D53).
    for (const id of ['walk', 'car', 'train', 'horse']) {
      const box = await page.getByTestId(`tme-mode-${id}`).boundingBox();
      if (box === null) throw new Error(`tme-mode-${id} not visible`);
      expect(box.height, `tme-mode-${id} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box.width, `tme-mode-${id} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }
  });

  test('registry demo: the registry-only arc routes in DEFAULT runs (A-016b) and Horseback activates through the map-driven switch (C30/D78)', async ({
    page,
  }) => {
    await page.goto(DEMO_URL);
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, VALE_GATE_ID)).not.toBeNull();

    // A DEFAULT run (overlay walk preference, no explicit mode) to the node
    // reachable ONLY via the horse-only arc: it prices 300 min — the
    // default candidate scan reads the map's mode universe (A-016b); before
    // that widening this route was unreachable.
    await tapPoint(page, await nodeScreenPoint(page, HIGH_PASTURE_ID));
    await expect(page.getByTestId('tme-legs')).toBeVisible(); // the phone sheet auto-expands (B-114)
    await expect(page.getByTestId('tme-total')).toHaveText('300 min'); // 240 px × 0.125 / 6 × 60 — exact (C15/D72)
    await expect.poll(readRouteLegArcIds.bind(null, page)).toEqual([HORSE_ARC_ID]);

    // The switch mirrors the overlay default; Horseback starts unselected.
    await expect(page.getByTestId('tme-mode-walk')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tme-mode-horse')).toHaveAttribute('aria-pressed', 'false');

    // Select Horseback — a REGISTRY id passes the facade's setTravelMode
    // (C30 validates against the loaded map's universe) — and the
    // re-priced DEFAULT run keeps routing through the registry-only arc,
    // now the PREFERRED mode.
    await activate(page.getByTestId('tme-mode-horse'));
    await expect(page.getByTestId('tme-mode-horse')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tme-mode-walk')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('tme-total')).toHaveText('300 min');
    await expect.poll(readRouteLegArcIds.bind(null, page)).toEqual([HORSE_ARC_ID]);
  });

  test('registry demo: quick-connect commits the default-allowed set — the opted-out built-in is OUT, the registry mode is IN (D42/D78); console clean (D53)', async ({
    page,
  }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    await page.goto(DEMO_URL);
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, VALE_GATE_ID)).not.toBeNull();

    const edgesBefore = await readEdgeIds(page);

    // Enter editor, select the pin-adjacent leaf, start connect mode.
    await activate(page.getByTestId('tme-editor-toggle'));
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
    await tapPoint(page, await nodeScreenPoint(page, VALE_GATE_ID));
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await activate(page.getByTestId('tme-node-connect'));
    await expect(page.getByTestId('tme-connect-from')).toBeVisible();
    await expect.poll(readConnectMode.bind(null, page)).toBe(true);

    // D81 (PKG B-125): with the property panel docked, the preserved
    // viewport keeps the demo's rightmost leaf (high-pasture) where the
    // full-stage fit put it — past the narrowed canvas edge, over the panel
    // column (the pre-D81 panel-open refit used to pull it back). One
    // background drag pans the pick target in-canvas; a drag is not a tap,
    // so connect mode's pick state is untouched. B-127 (D86) aiming repair:
    // the target must also clear the CHIP — the one overlay that stayed on
    // the stage — a tap landing on it dismisses the selection and exits
    // connect mode (clearing the picks), so the drag carries a vertical
    // component whenever the target sits in the chip's band.
    const canvas = await page.getByTestId('tme-canvas').boundingBox();
    if (canvas === null) throw new Error('canvas host not visible');
    const pickTarget = await nodeScreenPoint(page, HIGH_PASTURE_ID);
    const panDx = canvas.x + canvas.width - 60 - pickTarget.x;
    let panDy = 0;
    const chipLoc = page.getByTestId('tme-selection-chip');
    if ((await chipLoc.count()) > 0) {
      const chip = await chipLoc.boundingBox();
      if (
        chip !== null &&
        pickTarget.x + 22 > chip.x &&
        pickTarget.y + 22 > chip.y &&
        pickTarget.y - 22 < chip.y + chip.height
      ) {
        panDy = chip.y + chip.height + 16 - pickTarget.y;
      }
    }
    if (panDx < -8 || panDy > 8) {
      const dragY = canvas.y + canvas.height / 2;
      await page.mouse.move(canvas.x + canvas.width * 0.6, dragY);
      await page.mouse.down();
      await page.mouse.move(canvas.x + canvas.width * 0.6 + Math.min(panDx, 0), dragY + panDy, {
        steps: 4,
      });
      await page.mouse.up();
    }

    // Pick the two other vale leaves — touch alone.
    await tapPoint(page, await nodeScreenPoint(page, OLD_MILL_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([OLD_MILL_ID]);
    await tapPoint(page, await nodeScreenPoint(page, HIGH_PASTURE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([OLD_MILL_ID, HIGH_PASTURE_ID]);

    // Done: one arc per pick, each carrying the MAP's default-allowed set —
    // walk and train (built-ins, no opting entry), horse (allowedByDefault
    // registry entry) — and NO car (the relabeled built-in opts out,
    // allowedByDefault: false). Insertion order is the derivation's:
    // built-ins first (minus the opted-out one), then the registry entry.
    await activate(page.getByTestId('tme-connect-done'));
    await expect.poll(readConnectMode.bind(null, page)).toBe(false);
    const createdIds = (await readEdgeIds(page)).filter((id) => !edgesBefore.includes(id));
    expect(createdIds, 'one arc per picked target (C4)').toHaveLength(2);
    const datas = await Promise.all(createdIds.map((id) => readEdgeData(page, id)));
    for (const data of datas) {
      expect(data, 'the created arc exists in the library plane').not.toBeNull();
      expect(data?.modes).toEqual(['walk', 'train', 'horse']); // D42/D78 — WITHOUT 'car', WITH 'horse'
    }
    expect(datas.map((data) => data?.target).sort()).toEqual([HIGH_PASTURE_ID, OLD_MILL_ID].sort());

    // NOTE (B-120): the commit-only viewport pin lives in the arc-Apply cell
    // below — quick-connect's Done closes the banner, and at the phone
    // viewport that panel swap is a stage resize whose sanctioned
    // notifyResize refit (B-106) rides along, so a strict before/after
    // comparison here would measure the layout change, not the commit.

    expect(bad, 'no console errors/warnings/pageerrors during the journey').toEqual([]);
  });

  test('registry demo: the arc panel rows carry the resolved labels and an editable registry-mode minute field (B-123/C23); the commit never moves the viewport (B-120)', async ({
    page,
  }) => {
    await page.goto(DEMO_URL);
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, VALE_GATE_ID)).not.toBeNull();

    // Select the authored registry-only arc in VIEW mode (a clean canvas —
    // the editor maximizes no panel over the tap), then enter the editor so
    // the draft sections render.
    await tapPoint(page, await edgeMidpointPoint(page, VALE_GATE_ID, HIGH_PASTURE_ID));
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await activate(page.getByTestId('tme-editor-toggle'));
    await expect(page.getByTestId('tme-arc-editor')).toBeVisible();

    // The rows are the WHOLE registry-map universe with the resolver's
    // labels; the arc's own spec reads verbatim (horse allowed, no minutes;
    // the relabeled car not allowed — absent key ⇒ false, C14 row 2).
    await expect
      .poll(readArcModes.bind(null, page, HORSE_ARC_ID))
      .toEqual([
        { id: 'walk', label: 'walk', allowed: false, authoredMinutes: null },
        { id: 'car', label: 'Carriage', allowed: false, authoredMinutes: null },
        { id: 'train', label: 'train', allowed: false, authoredMinutes: null },
        { id: 'horse', label: 'Horseback', allowed: true, authoredMinutes: null },
      ]);

    // The relabeled built-in renders its registry word in the panel rows
    // (C23 — the same words the switch renders).
    await expect(page.getByTestId('tme-arc-mode-row-car')).toHaveText('Carriage');
    await expect(page.getByTestId('tme-arc-mode-row-horse')).toHaveText('Horseback');

    // A registry mode's authored minutes are EDITABLE and committable —
    // B-123's rows on a registry map: type 42, Apply, the live map carries it.
    const minutes = page.getByTestId('tme-arc-minutes-horse');
    await minutes.fill('42');

    // B-120 (the commit-only viewport pin): the baseline is taken with the
    // layout fully settled (the panel opened, the draft sections rendered —
    // every refit already fired) and the Apply commit is layout-neutral (a
    // disabled-state change only; the F45 dock is a stage overlay), so the
    // strict comparison isolates exactly what the COMMIT does: a rebuild
    // never fits (B-120/R21 ruling 1).
    const zoomBefore = await readZoom(page);
    const panBefore = await readPan(page);
    await activate(page.getByTestId('tme-arc-apply'));
    await expect
      .poll(readArcModes.bind(null, page, HORSE_ARC_ID))
      .toEqual([
        { id: 'walk', label: 'walk', allowed: false, authoredMinutes: null },
        { id: 'car', label: 'Carriage', allowed: false, authoredMinutes: null },
        { id: 'train', label: 'train', allowed: false, authoredMinutes: null },
        { id: 'horse', label: 'Horseback', allowed: true, authoredMinutes: 42 },
      ]);
    await settle(page); // the commit's render pass has painted; nothing else moves the viewport
    expect(await readZoom(page), 'zoom unchanged by the Apply commit (B-120)').toBe(zoomBefore);
    expect(await readPan(page), 'pan unchanged by the Apply commit (B-120)').toEqual(panBefore);
  });
});
