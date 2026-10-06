// tests/e2e/editor-quick-connect.e2e-spec.ts — PKG B-118: quick-connect
// (§5 Phase 3 M1) — select a node, Connect, pick same-layer leaf targets on
// the canvas, Done batch-creates one default arc per target. Runs at BOTH
// playwright projects (desktop + emulated phone with touch) per D53/F52
// mobile-and-desktop parity; every gesture is touch-alone capable.
//
// Cited IDs:
//   D42/F16 — quick-connect: pick multiple other nodes to batch-create arcs
//          with sensible defaults. The D42 contract is pinned verbatim: every
//          created arc carries source = the selected node, the picked target,
//          and ALL THREE modes allowed (walk/car/train) — no authored
//          distance/time, no terrain, not blocked; geometry prices it (C14
//          row 5 / F19). Refinement is M2's arc editing (F41) — this flow
//          creates ONLY default arcs.
//   C1/D58/§6.2 — the ONE pickable rule is the core's isPinEligible over the
//          merged node set: leaf kinds (location/hub/waypoint) AND childless,
//          on the ACTIVE layer. A container tap (a compound box) picks
//          nothing — feedback, never an arc (the validator refuses edges into
//          compound parents). The source never picks itself.
//   F46 (orchestrator ruling) — connect-picking is NOT multi-select: the
//          pick set highlights with a DISTINCT class (tme-connect-pick, never
//          tme-selected), no selection is written while connecting, toggling
//          a pick on/off is one tap, and Done/Cancel commits or discards the
//          whole set.
//   C4 — the author's truth: one arc per picked target even when a parallel
//          arc exists — no silent dedup; the pick Set itself prevents
//          double-picks within one session.
//   D75 seam/F45 — upsertEdge engine-assigns `arc-<n>` (C5); the arcs RENDER
//          immediately but routing serves the SAVED graph until saveMap — the
//          go-live discriminator: a route to the freshly placed source is
//          null before Save and prices through a created arc after it.
//   C30 — a refused Done loop surfaces field-precise, user-visibly, with the
//          uncommitted picks intact (B-117's NodeEditRefusal pattern).
//   C23 — plain words everywhere: the banner, the feedback, the count.
//   D2/R2/R3 — every mutation is facade.upsertEdge through the service;
//          classes/signals are the only state; picks project like selections.
//   D53/F52/§6.2 — >= 44px tap targets, no hover-only affordance, the whole
//          journey runs touch-alone at the phone viewport, console clean.
//
// FX1 facts (data/worlds/fuyuki.ts): 'einzbern-castle' is the isolated
// corner leaf (vetted clear-tap target, one incident arc); 'ryuudou-temple'
// is a childless location; 'outskirts' is a parentless location; the pin is
// 'emiya-residence'; 'district-miyama' renders Miyama's compound box (the
// waypoints spec's vetted box-corner aim hits the PARENT, off every child).
import { expect, test, type Locator, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
  edgeIds(): string[];
  zoom(): number;
  pan(): { x: number; y: number };
  nodeHasClass(id: string, cls: string): boolean;
  /** C5/D75: the selected node's id — placed nodes are never id-predicted. */
  selectedNodeId(): string | null;
  /** B-118: whether quick-connect mode is on. */
  connectMode(): boolean;
  /** B-118: the pick set, in pick order. */
  pickedNodeIds(): string[];
  /** B-118: authored fields of one library edge, or null (D42 assertions). */
  edgeData(id: string): { id: string; source: string; target: string; modes: string[] } | null;
  /** B-118: the live route's leg arc ids, or null (F45 discriminator). */
  routeLegArcIds(): string[] | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

const EMIYA_ID = 'emiya-residence'; // the pin — the route discriminator's anchor
const CASTLE_ID = 'einzbern-castle'; // isolated corner leaf — clear taps at both fits
const TEMPLE_ID = 'ryuudou-temple'; // childless location leaf
const OUTSKIRTS_ID = 'outskirts'; // parentless location leaf — the guard cells' source
const NEW_PLACE = 'New place'; // C23 default label, verbatim

/**
 * The B-109-vetted clear background point in MODEL coordinates (see
 * editor-place-move.e2e-spec.ts): inside the fitted bounding box (the
 * post-placement fit is a no-op), >60 model units from every node center,
 * every edge segment, both compound boxes and the badge, at BOTH projects'
 * fits. A node placed here is routable ONLY through arcs this spec creates.
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };

const isPhone = (): boolean => test.info().project.name === 'phone';

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

const readEdgeIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.edgeIds();
  });

const readSelectedId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.selectedNodeId();
  });

const readNodeHasClass = (page: Page, id: string, cls: string): Promise<boolean> =>
  page.evaluate(
    ({ nodeId, className }): boolean => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeHasClass(nodeId, className);
    },
    { nodeId: id, className: cls },
  );

const readConnectMode = (page: Page): Promise<boolean> =>
  page.evaluate((): boolean => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.connectMode();
  });

const readPickedIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.pickedNodeIds();
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

const readRouteLegArcIds = (page: Page): Promise<string[] | null> =>
  page.evaluate((): string[] | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.routeLegArcIds();
  });

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
  // B-133 (D91) review fix: the panels are stage overlays — a tap aimed at a
  // covered point lands on the sheet, not the canvas. If the aim point sits
  // under the route sheet (the auto-expanded content overlay), collapse it
  // first — the user's "the map didn't respond, close the sheet, tap again"
  // flow; a selection below re-expands it (B-114).
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

/**
 * The §6.2 compound-box aim (the waypoints spec's vetted pattern): a point
 * just inside the Miyama district box's bottom-left corner, runtime-read off
 * the B-104 bounding-box seam so it is viewport-independent, and off every
 * CHILD (the nearest child center sits ~35px away rendered at the phone fit —
 * outside the 22·zoom + 8 px hit radius). In connect mode this tap must pick
 * NOTHING (C1/D58/§6.2): the parent is a container, never an arc endpoint.
 */
const miyamaBoxCorner = async (page: Page): Promise<Point> => {
  await settle(page);
  const box = await page.evaluate((): { x: number; y: number; w: number; h: number } => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    const b = hook.nodeRenderedBoundingBox('district-miyama');
    if (b === null) throw new Error('district-miyama not rendered');
    return b;
  });
  const host = await page.getByTestId('tme-canvas').boundingBox();
  if (host === null) throw new Error('canvas host not visible');
  return { x: host.x + box.x + 8, y: host.y + box.y + box.h - 8 };
};

/** Enter editor mode and select one FX1 leaf — the property panel opens. */
const openPanelFor = async (page: Page, id: string): Promise<void> => {
  await activate(page.getByTestId('tme-editor-toggle'));
  await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
  await tapPoint(page, await nodeScreenPoint(page, id));
  await expect(page.getByTestId('tme-property-panel')).toBeVisible();
};

/** Open the panel for one node and press its Connect button. */
const startConnectFor = async (page: Page, id: string): Promise<void> => {
  await openPanelFor(page, id);
  await activate(page.getByTestId('tme-node-connect'));
  await expect(page.getByTestId('tme-connect-from')).toBeVisible();
  await expect.poll(readConnectMode.bind(null, page)).toBe(true);
};

test.describe('quick-connect: select, pick leaves, batch-create default arcs (PKG B-118)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
  });

  test('place → Connect → pick two leaves → Done: two default arcs render, the dock lights; Save prices a route through a created arc (D42/F16/F45/D75 discriminator)', async ({
    page,
  }) => {
    // Place the source at the vetted empty point: it is selected (B-116) and
    // the property panel opens — quick-connect's exact precondition.
    await activate(page.getByTestId('tme-editor-toggle'));
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await expect.poll(readSelectedId.bind(null, page)).not.toBeNull();
    const placedId = await readSelectedId(page);
    if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');
    await expect(page.getByTestId('tme-selection-label')).toHaveText(NEW_PLACE);

    const edgesBefore = await readEdgeIds(page);

    await activate(page.getByTestId('tme-node-connect'));
    await expect(page.getByTestId('tme-connect-from')).toHaveText(`Connecting from ${NEW_PLACE}`);
    await expect(page.getByTestId('tme-connect-count')).toHaveText('No places picked yet');
    await expect.poll(readConnectMode.bind(null, page)).toBe(true);
    // F46: the edit body is REPLACED by the banner while connecting.
    await expect(page.getByTestId('tme-node-done')).toHaveCount(0);

    // Pick two leaves — one tap each; the DISTINCT pick accent (not the
    // selection), and the selection itself never moves (F46 ruling).
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([CASTLE_ID]);
    await expect(page.getByTestId('tme-connect-count')).toHaveText('1 place picked');
    expect(await readNodeHasClass(page, CASTLE_ID, 'tme-connect-pick')).toBe(true);
    expect(await readNodeHasClass(page, CASTLE_ID, 'tme-selected')).toBe(false);
    expect(await readSelectedId(page)).toBe(placedId);

    await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([CASTLE_ID, TEMPLE_ID]);
    await expect(page.getByTestId('tme-connect-count')).toHaveText('2 places picked');

    // Done: one command per picked target — two arcs render, the pick set
    // and its accents clear, the mode exits back to the edit body, and the
    // F45 dock lights (dirty only — the save bar's first edit).
    await activate(page.getByTestId('tme-connect-done'));
    await expect.poll(readConnectMode.bind(null, page)).toBe(false);
    await expect
      .poll(async () => (await readEdgeIds(page)).filter((id) => !edgesBefore.includes(id)).length)
      .toBe(2);
    const createdIds = (await readEdgeIds(page)).filter((id) => !edgesBefore.includes(id));
    expect(createdIds, 'one arc per picked target (C4: no dedup, none missed)').toHaveLength(2);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect.poll(readPickedIds.bind(null, page)).toEqual([]);
    expect(await readNodeHasClass(page, CASTLE_ID, 'tme-connect-pick')).toBe(false);
    expect(await readNodeHasClass(page, TEMPLE_ID, 'tme-connect-pick')).toBe(false);
    await expect(page.getByTestId('tme-node-done')).toBeVisible(); // the edit body is back

    // The D42 contract, verbatim, on each created arc (engine-assigned ids —
    // read live, never predicted, C5/D75): source = the selected node, all
    // three modes allowed, targets exactly the two picks.
    const datas = await Promise.all(createdIds.map((id) => readEdgeData(page, id)));
    for (const data of datas) {
      expect(data, 'the created arc exists in the library plane').not.toBeNull();
      expect(data?.source).toBe(placedId);
      expect(data?.modes).toEqual(['walk', 'car', 'train']); // D42 defaults — C14 row 5 prices it
    }
    expect(datas.map((data) => data?.target).sort()).toEqual([CASTLE_ID, TEMPLE_ID].sort());

    // F45 go-live discriminator, first half: the arcs RENDER but routing
    // serves the SAVED graph — a route to the unsaved source does not exist.
    await expect.poll(readRouteLegArcIds.bind(null, page)).toBeNull();

    // Save: the arcs go live, the dock clears, and the route to the placed
    // source prices THROUGH a created arc (the placed node's only incident
    // arcs are the two just created — any route must end on one of them).
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(readRouteLegArcIds.bind(null, page)).not.toBeNull();
    const legs = (await readRouteLegArcIds(page)) ?? [];
    expect(legs.length).toBeGreaterThan(0);
    expect(legs[legs.length - 1], 'the route enters the placed node via a created arc').toEqual(
      expect.stringMatching(/^(arc-)/),
    );
    expect(createdIds).toContain(legs[legs.length - 1]);
    // DOM proof at both viewports (the phone sheet needs one rail tap — the
    // B-117 rule keeps it collapsed in editor mode with a library selection).
    if (isPhone()) await activate(page.getByTestId('tme-sheet-rail'));
    await expect(page.getByTestId('tme-legs')).toBeVisible();
    await expect(page.getByTestId('tme-leg').last()).toContainText(NEW_PLACE);
    await expect(page.getByTestId('tme-total')).toBeVisible();
  });

  test('a container tap picks nothing (C1/D58/§6.2) and the source cannot pick itself — feedback, mode intact', async ({
    page,
  }) => {
    const edgesBefore = await readEdgeIds(page);
    await startConnectFor(page, OUTSKIRTS_ID);

    // The compound box: the tap hits the PARENT (district-miyama) — not a
    // leaf, so not a pick: feedback, no arc, no placement, mode stays on.
    await tapPoint(page, await miyamaBoxCorner(page));
    await expect(page.getByTestId('tme-connect-feedback')).toBeVisible();
    await expect.poll(readPickedIds.bind(null, page)).toEqual([]);
    expect(await readConnectMode(page)).toBe(true);
    expect(await readSelectedId(page)).toBe(OUTSKIRTS_ID); // picks are not selections (F46)
    await expect(page.getByTestId('tme-connect-from')).toBeVisible(); // banner still up
    expect((await readEdgeIds(page)).length).toBe(edgesBefore.length);

    // The source itself is never a pick target of its own arcs.
    await tapPoint(page, await nodeScreenPoint(page, OUTSKIRTS_ID));
    await expect(page.getByTestId('tme-connect-feedback')).toContainText("can't connect to itself");
    await expect.poll(readPickedIds.bind(null, page)).toEqual([]);

    // Cancel: nothing was committed, nothing turned dirty.
    await activate(page.getByTestId('tme-connect-cancel'));
    await expect.poll(readConnectMode.bind(null, page)).toBe(false);
    expect((await readEdgeIds(page)).length).toBe(edgesBefore.length);
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
  });

  test('Escape and Cancel each discard the whole set — nothing commits (F46 Done/Cancel rule)', async ({
    page,
  }) => {
    const edgesBefore = await readEdgeIds(page);

    // Escape exits cleanly.
    await startConnectFor(page, OUTSKIRTS_ID);
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([CASTLE_ID]);
    await page.keyboard.press('Escape');
    await expect.poll(readConnectMode.bind(null, page)).toBe(false);
    await expect.poll(readPickedIds.bind(null, page)).toEqual([]);
    expect((await readEdgeIds(page)).length).toBe(edgesBefore.length);
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect(page.getByTestId('tme-node-connect')).toBeVisible(); // edit body restored

    // The Cancel button likewise.
    await activate(page.getByTestId('tme-node-connect'));
    await expect(page.getByTestId('tme-connect-from')).toBeVisible();
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([CASTLE_ID]);
    await activate(page.getByTestId('tme-connect-cancel'));
    await expect.poll(readConnectMode.bind(null, page)).toBe(false);
    expect((await readEdgeIds(page)).length).toBe(edgesBefore.length);
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
  });

  test('toggling a pick off removes it from the set; a double-pick is impossible; one Done creates one arc per surviving target (C4)', async ({
    page,
  }) => {
    const edgesBefore = await readEdgeIds(page);
    await startConnectFor(page, OUTSKIRTS_ID);

    // One tap picks; the same tap again unpicks — the double-pick prevention.
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([CASTLE_ID]);
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([]);
    await expect(page.getByTestId('tme-connect-count')).toHaveText('No places picked yet');

    // Only the surviving target commits — exactly one new arc.
    await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([TEMPLE_ID]);
    await activate(page.getByTestId('tme-connect-done'));
    await expect.poll(readConnectMode.bind(null, page)).toBe(false);
    const createdIds = (await readEdgeIds(page)).filter((id) => !edgesBefore.includes(id));
    expect(createdIds).toHaveLength(1);
    const data = await readEdgeData(page, createdIds[0]);
    expect(data?.source).toBe(OUTSKIRTS_ID);
    expect(data?.target).toBe(TEMPLE_ID);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
  });

  test('every connect control meets the 44px tap-target floor (F52/D53)', async ({ page }) => {
    await openPanelFor(page, OUTSKIRTS_ID);
    for (const testid of ['tme-node-connect', 'tme-node-done']) {
      const box = await page.getByTestId(testid).boundingBox();
      expect(box, `${testid} is on the touch surface`).not.toBeNull();
      expect(box?.height ?? 0, `${testid} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0, `${testid} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }
    await activate(page.getByTestId('tme-node-connect'));
    await expect(page.getByTestId('tme-connect-from')).toBeVisible();
    for (const testid of ['tme-connect-done', 'tme-connect-cancel']) {
      const box = await page.getByTestId(testid).boundingBox();
      expect(box, `${testid} is on the touch surface`).not.toBeNull();
      expect(box?.height ?? 0, `${testid} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0, `${testid} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }
  });

  test('touch-alone connect journey on authored FX1 nodes keeps the harness console clean (§6.2/D53/F52)', async ({
    page,
  }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    const edgesBefore = await readEdgeIds(page);
    await startConnectFor(page, OUTSKIRTS_ID);
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([CASTLE_ID]);
    await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([CASTLE_ID, TEMPLE_ID]);
    await activate(page.getByTestId('tme-connect-done'));
    await expect.poll(readConnectMode.bind(null, page)).toBe(false);
    const createdIds = (await readEdgeIds(page)).filter((id) => !edgesBefore.includes(id));
    expect(createdIds).toHaveLength(2);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();

    // Save takes the arcs live; the edit body is back on the untouched draft.
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    for (const id of createdIds) {
      const data = await readEdgeData(page, id);
      expect(data?.source).toBe(OUTSKIRTS_ID);
      expect(data?.modes).toEqual(['walk', 'car', 'train']);
    }

    expect(bad, 'no console errors/warnings/pageerrors during the journey').toEqual([]);
  });
});
