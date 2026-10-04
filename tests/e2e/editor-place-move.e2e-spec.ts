// tests/e2e/editor-place-move.e2e-spec.ts — PKG B-116: editor mode on the map
// viewer (§5 Phase 3 M1) — place & move authored nodes plus the F45 save bar.
// Runs at BOTH playwright projects (desktop + emulated phone with touch) —
// D53/F52 mobile-and-desktop parity is mandatory for every UI packet; the
// drag cells run the touch gestures through the Chromium-twin pattern
// (WebKit's iPhone 13 emulation cannot drive CDP touch gestures directly —
// see interactions.e2e-spec.ts).
//
// Cited IDs:
//   §5 Phase 3 M1 — "place/rename/move nodes … property panel": this spec
//          pins place + move; rename/property panel are B-117, not here.
//   D75/F45 — facade.upsertNode creates (id: '') / replaces (a known id) and
//          marks ONLY the core's dirty flag: until saveMap, routing and the
//          snapshot still serve the SAVED graph (product behavior, not
//          staleness to be hidden), and the unsaved-changes indicator — the
//          save dock — appears on the first edit and clears after Save.
//   C5/D75 — the UI never invents ids: a placed node is identified as the
//          delta between the pre- and post-command projections' node-id
//          sets, then selected; its engine-assigned id is read live through
//          the harness seam, never predicted by the test.
//   C23 — the created node's default label is the plain words 'New place'
//          (renaming lands with the property panel), never an id-like token.
//   D10/C4 — in VIEW mode nodes are not draggable (cy.autoungrabify): the
//          map's coordinates are the author's business; a view-mode drag
//          moves nothing.
//   R2/R4/C24 — the app mutates ONLY through facade.upsertNode; the
//          projection re-derives from the authored map references, so the
//          drag-persistence proof survives a layer-switch rebuild.
//   D2/D3 — one headless cy instance, zoneless: only discrete tap/free
//          writes drive the chrome (the save dock is template-bound).
//   F52/D53/§6.2 — ≥ 44px tap targets operated touch-alone (toggle, Save),
//          touch drag synthesized only through CDP on the twin, and the
//          harness console stays clean.
//
// Setup shares the existing harness-entry pattern (page.goto('/') + canvas
// visibility + a seam-backed rendered read), and reuses the vetted
// background-point discipline of waypoints.e2e-spec.ts: the placement point
// is model-anchored and converted test-side through the zoom/pan seams — the
// UI computes nothing (R1).
import { chromium, devices, expect, test, type CDPSession, type Locator, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeModelPosition(id: string): { x: number; y: number } | null;
  selectedNodeId(): string | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';
const EMIYA_ID = 'emiya-residence';
const NEW_PLACE = 'New place'; // C23 default label, verbatim

/**
 * The B-109-vetted clear background point in MODEL coordinates (see
 * waypoints.e2e-spec.ts's header for the exhaustive scan: >110 model units
 * from every authored edge segment, >60 from every node center, the badge
 * and both compound boxes, at BOTH projects' fits; inside the fitted
 * bounding box so the post-placement fitView is a no-op and the node renders
 * exactly at the tap). The editor chrome (toggle/chip/dock) occupies the
 * stage's TOP-RIGHT corner stack; this point's rendered position (left,
 * lowish — exercised repeatedly by the waypoints specs) stays clear of it,
 * as does EMIYA's center.
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

/** D75/R4: the AUTHORED (model) position of one node, read via the seam. */
const readModelPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeModelPosition(nodeId);
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

const expectModelPosition = (pos: { x: number; y: number } | null): { x: number; y: number } => {
  if (pos === null) throw new Error('node absent from the projection (model position unreadable)');
  return pos;
};

/**
 * Wait two animation frames: panel open/close (the route sheet auto-expands
 * on selection at phone width — B-114) and the ResizeObserver-driven re-fit
 * (B-112) run just before the next paint — reads and gestures inside that
 * window would aim at stale coordinates (the arc-panel settle precedent).
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The `phone` project is WebKit (iPhone 13), where CDP touch input does not
 * exist, and the touchscreen API has no drag primitive — the drag families
 * below run on a twin Chromium page with the SAME iPhone 13 emulation
 * (interactions.e2e-spec.ts pattern).
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
 * input path (the touchscreen API has no drag primitive).
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

/**
 * The drag gesture per project: on the phone project's page (the twin,
 * touch-emulated Chromium) through CDP touch input; on the desktop page
 * through the mouse API. A node drag in editor mode releases through `free`
 * → persist (R2: facade.upsertNode is the only mutation).
 */
const dragAt = async (page: Page, from: Point, dx: number, dy: number): Promise<void> => {
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

test.describe('editor mode: place, move, and the F45 save bar (PKG B-116)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, EMIYA_ID)).not.toBeNull();
  });

  test('empty-canvas tap in editor mode places an authored node, selected with the C23 default label (F45/D75/C5/C23/§5 Phase 3 M1)', async ({
    page,
  }) => {
    const toggle = page.getByTestId('tme-editor-toggle');
    const dock = page.getByTestId('tme-save-dock');

    await expect(toggle).toHaveAttribute('aria-pressed', 'false'); // view mode default
    await expect(dock).toBeHidden(); // a fresh load carries no unsaved edits (F45)

    await activate(toggle);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true'); // pressed state (R3)

    // The editor gesture: an empty-canvas tap places an authored node.
    await tapModelPoint(page, BG_MODEL_POINT);

    await expect
      .poll(async () => (await readLabels(page)).filter((label) => label === NEW_PLACE))
      .toHaveLength(1);
    // C5/D75 id discovery: the placed node IS the selection — the engine's
    // id, read live through the seam (never predicted by the test).
    await expect.poll(readSelectedId.bind(null, page)).not.toBeNull();
    const placedId = await readSelectedId(page);
    if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(NEW_PLACE); // C23 plain words

    // F45: the FIRST edit shows the unsaved indicator and its Save button.
    await expect(dock).toBeVisible();
    await expect(page.getByTestId('tme-unsaved')).toHaveText('Unsaved changes');
    await expect(page.getByTestId('tme-save')).toBeVisible();
  });

  test('editor drag of the placed node persists the position across exit/re-enter AND a projection rebuild (D75/F45/R4)', async ({
    page,
  }) => {
    const editorDragAndPersist = async (p: Page): Promise<void> => {
      await activate(p.getByTestId('tme-editor-toggle'));
      await tapModelPoint(p, BG_MODEL_POINT);
      await expect(p.getByTestId('tme-selection-chip')).toBeVisible();
      await expect.poll(readSelectedId.bind(null, p)).not.toBeNull();
      const placedId = await readSelectedId(p);
      if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');

      // Settle + aim FRESH: the selection may auto-expand the route sheet at
      // phone width (B-114), re-fitting the view — gestures inside that
      // window would aim at stale coordinates.
      await settle(p);
      const modelBefore = expectModelPosition(await readModelPosition(p, placedId));
      const start = await nodeScreenPoint(p, placedId);
      // Horizontal-only drag: the node stays inside the fitted bounding box,
      // so the post-move fitView is a no-op and the reads stay deterministic.
      await dragAt(p, start, 60, 0);
      // D75: `free` persisted the released position — poll the MODEL write.
      await expect
        .poll(async () => (await readModelPosition(p, placedId))?.x ?? Number.NEGATIVE_INFINITY)
        .toBeGreaterThan(modelBefore.x + 30);
      const dragged = expectModelPosition(await readModelPosition(p, placedId));
      await expect(p.getByTestId('tme-save-dock')).toBeVisible(); // the edit is dirty (F45)

      // D75/F45: exit editor — the save dock SURVIVES the toggle (edits live
      // in the core's dirty flag, not in editor mode).
      await activate(p.getByTestId('tme-editor-toggle'));
      await expect(p.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'false');
      await expect(p.getByTestId('tme-save-dock')).toBeVisible();

      // Re-enter: the persisted position is unchanged.
      await activate(p.getByTestId('tme-editor-toggle'));
      await expect(p.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
      const modelAfterReenter = expectModelPosition(await readModelPosition(p, placedId));
      expect(modelAfterReenter).toEqual(dragged);

      // R4 persistence proof: a layer switch re-derives the projection from
      // the AUTHORED map — had the drag not persisted, the node would snap
      // back to its pre-drag position here.
      await activate(p.getByTestId('tme-layer-layer-misaki'));
      await expect.poll(() => readLabels(p)).toEqual(['Misaki Town']);
      await activate(p.getByTestId('tme-layer-layer-fuyuki'));
      await expect.poll(() => readLabels(p)).toContain(NEW_PLACE);
      const modelAfterRebuild = expectModelPosition(await readModelPosition(p, placedId));
      expect(modelAfterRebuild).toEqual(dragged);
    };
    if (isPhone()) await withPhoneChromiumPage(editorDragAndPersist);
    else await editorDragAndPersist(page);
  });

  test('the F45 save bar: the indicator appears on the first edit, the Save button clears it (F45/C29/D75)', async ({
    page,
  }) => {
    const dock = page.getByTestId('tme-save-dock');
    const toggle = page.getByTestId('tme-editor-toggle');

    await expect(dock).toBeHidden(); // nothing edited yet
    await activate(toggle);
    await tapModelPoint(page, BG_MODEL_POINT); // first edit
    await expect(dock).toBeVisible();

    // F52/D53: the editor chrome's controls are real tap targets at both
    // viewports (the B-114 sweep's swept states never enter the editor, so
    // this cell pins the sizes for the editor state too).
    for (const testid of ['tme-editor-toggle', 'tme-save']) {
      const box = await page.getByTestId(testid).boundingBox();
      expect(box, `${testid} is on the touch surface`).not.toBeNull();
      expect(box?.height ?? 0, `${testid} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0, `${testid} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }

    // F45: unsaved edits survive exiting editor mode — the dock stays.
    await activate(toggle);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(dock).toBeVisible();

    // Save: the dirty flag clears, the indicator goes away, and the placed
    // node is still on the canvas (the saved edits are live now).
    await activate(page.getByTestId('tme-save'));
    await expect(dock).toBeHidden();
    await expect.poll(() => readLabels(page)).toContain(NEW_PLACE);
  });

  test('view mode: node drag moves nothing (D10/C4 — dragging is editor-only)', async ({ page }) => {
    const viewDragMovesNothing = async (p: Page): Promise<void> => {
      // Fresh page: still in view mode (the toggle is unpressed).
      await expect(p.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'false');
      await settle(p);
      const before = expectModelPosition(await readModelPosition(p, EMIYA_ID));
      const start = await nodeScreenPoint(p, EMIYA_ID);
      await dragAt(p, start, 60, 6);
      // The map is the AUTHOR's truth in view mode: no drag moves the model
      // position (an exact, pan/zoom-independent assertion — D10/C4).
      const after = expectModelPosition(await readModelPosition(p, EMIYA_ID));
      expect(after).toEqual(before);
      // The drag wrote no selection either (a drag is not a tap — D2).
      await expect(p.getByTestId('tme-selection-chip')).toBeHidden();
    };
    if (isPhone()) await withPhoneChromiumPage(viewDragMovesNothing);
    else await viewDragMovesNothing(page);
  });

  test('editor lifecycle sweep keeps the harness console clean (§6.2)', async ({ page }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    // Native-API sweep only (no CDP on the phone project's WebKit page): a
    // full editor round trip — enter, place, exit, re-enter, save.
    await activate(page.getByTestId('tme-editor-toggle'));
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect.poll(() => readLabels(page)).toContain(NEW_PLACE);
    await activate(page.getByTestId('tme-editor-toggle')); // exit (unsaved survives)
    await activate(page.getByTestId('tme-editor-toggle')); // re-enter
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();

    expect(bad, 'no console errors/warnings/pageerrors during the editor sweep').toEqual([]);
  });
});
