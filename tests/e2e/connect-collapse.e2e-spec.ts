// tests/e2e/connect-collapse.e2e-spec.ts — PKG B-D5 (R29, PROPOSAL-D
// §3.2–3.3 + the store's rulings): the connect collapse + the arc readout.
// In connect mode NO form is open — the banner collapsed to the 44px
// tme-connect-bar pinned at the stage's bottom (the from-line, the pick
// count, Done/Cancel; the feedback/refusal as attached lines), the phone
// recovers its visible canvas with the 70% sheet cap untouched, and the
// draw-arc pending state gains its readout ("Arc: <source> → tap the other
// end") dual-homed by regime (the D-2 strip at >=1024 / the band family
// below). Runs at BOTH projects (desktop + emulated phone with touch) per
// D53/F52 — this is the packet's own phone e2e (the brief's sanctioned
// phone-visible exception, ruling 4).
//
// Cited IDs:
//   B-D5 (PROPOSAL-D §3.2/§3.3 + the store's rulings) — every cell below.
//   F16/D42 — quick-connect: pick multiple other nodes to batch-create arcs
//          with sensible defaults; the mode's surface is the BAR now.
//   F17/D85 — draw-arc's two-tap pending state: the readout keeps the state
//          visible (the working-memory fix), cross-layer commits legal.
//   C23 — plain words everywhere: the from-line's live label, the readout's
//          live label, the pick count — never an id.
//   C30/C32 — the Done-loop refusal renders field-precise in the bar's
//          attached alert line (the core's words); the displacement refusal
//          keeps the edit body up with the mode exited.
//   D10 — nothing is dropped silently: Cancel/Escape discard only the picks;
//          the dirty-draft displacement COMMITS both intents.
//   D53/F52 — the bar's controls are >= 44px touch-alone; the phone arms
//          run natively (touchscreen taps) with the CDP twin only for the
//          long-press the touchscreen cannot express (the pin-affordance
//          pattern).
//
// FX1 facts (data/worlds/fuyuki.ts): 'outskirts' is a parentless location
// (the connect source); 'ryuudou-temple' a childless location; 'einzbern-
// castle' the isolated corner leaf (vetted clear-tap target).
import { expect, test, type Locator, type Page, type Point } from '@playwright/test';
import { chromium, devices } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  edgeIds(): string[];
  /** C5/D75: the selected node's id. */
  selectedNodeId(): string | null;
  /** B-118: whether quick-connect mode is on. */
  connectMode(): boolean;
  /** B-118: the pick set, in pick order. */
  pickedNodeIds(): string[];
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

const OUTSKIRTS_ID = 'outskirts'; // parentless location leaf — the connect source
const TEMPLE_ID = 'ryuudou-temple'; // childless location leaf — the pick target
const CASTLE_ID = 'einzbern-castle'; // isolated corner leaf — the arc-readout source

const isPhone = (): boolean => test.info().project.name === 'phone';

// --- The read-only hook seams (the established shapes) -------------------------

const readSelectedId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.selectedNodeId();
  });

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

const readEdgeIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.edgeIds();
  });

/**
 * Wait two animation frames: panel open/close and the ResizeObserver-driven
 * re-fit run just before the next paint (the settle precedent).
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** F52/D53: tap on the touch-emulated project, click on desktop (locators). */
const activate = async (locator: Locator): Promise<void> => {
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/** F52/D53: tap on the touch-emulated project, click on desktop (points). */
const tapPoint = async (page: Page, point: Point): Promise<void> => {
  if (isPhone()) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
};

/** Screen-px point of a node's rendered center (seam read + canvas box). */
const nodeScreenPoint = async (page: Page, id: string): Promise<Point> => {
  await settle(page);
  const pos = await page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeRenderedPosition(nodeId);
    },
    id,
  );
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return { x: box.x + pos.x, y: box.y + pos.y };
};

/**
 * B-D5: the pick tap, coverage-guarded — during connect the property sheet
 * is ABSENT (the packet's whole point), so the only covers are the BAR, the
 * phone's standing route-rail band and the chip. When the aim sits under one
 * of them, one background mouse drag (a sanctioned pan, not a touch gesture —
 * the mode-surfaces precedent; a drag is not a tap, the pick state is
 * untouched) lifts the target clear; the drag re-aims fresh afterwards. The
 * drag START is swept IN-PAGE for a clear canvas point (the quick-connect
 * dodgeBands discipline): DOM-clear AND clear of every rendered node body —
 * a drag that grabs a node MOVES it (an editor write, D75/D77) — and the
 * drag is self-verified against the pan seam (a dead grab retried on the
 * next candidate).
 */
const FX1_NODE_IDS: readonly string[] = [
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
];

const readPan = (page: Page): Promise<{ x: number; y: number }> =>
  page.evaluate((): { x: number; y: number } => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook & { pan(): { x: number; y: number } } })
      .__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.pan();
  });

/** The coverage probe's answer: whether the aim sits in a band, and the topmost band's top. */
interface CoverInfo {
  covered: boolean;
  top: number;
}

/**
 * The in-page sweep for a clear canvas DRAG START (the quick-connect
 * dodgeBands discipline): DOM-clear of every band above `topY` AND clear of
 * every rendered node body (a drag that grabs a node MOVES it — an editor
 * write, D75/D77).
 */
const sweepClearStarts = async (
  page: Page,
  canvasBox: { x: number; y: number; width: number; height: number },
  topY: number,
): Promise<Point[]> =>
  page.evaluate(
    ({ canvasBox: box, top, avoid }): Point[] => {
      const hook = (
        window as unknown as {
          __TME_E2E__?: TmeE2EHook & {
            nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
            selectedNodeId(): string | null;
            pickedNodeIds(): string[];
          };
        }
      ).__TME_E2E__;
      const bodies: { x: number; y: number; w: number; h: number }[] = [];
      if (hook !== undefined) {
        const ids = [...avoid, ...(hook.selectedNodeId() !== null ? [hook.selectedNodeId() as string] : [])];
        ids.push(...hook.pickedNodeIds());
        for (const id of ids) {
          const b = hook.nodeRenderedBoundingBox(id);
          if (b !== null) bodies.push(b);
        }
      }
      const clearOfBodies = (x: number, y: number): boolean =>
        bodies.every(
          (b) =>
            x < box.x + b.x - 14 ||
            x > box.x + b.x + b.w + 14 ||
            y < box.y + b.y - 14 ||
            y > box.y + b.y + b.h + 14,
        );
      const hits: { x: number; y: number }[] = [];
      for (const fx of [0.5, 0.2, 0.8]) {
        for (let y = 24; y < top - 12; y += 8) {
          const x = box.x + box.width * fx;
          const el = document.elementFromPoint(x, y);
          if (el !== null && el.closest('.tme-canvas') !== null && clearOfBodies(x, y)) hits.push({ x, y });
        }
      }
      return hits;
    },
    { canvasBox, top: topY, avoid: FX1_NODE_IDS },
  );

/** One DECISIVE self-verified background drag (a pan; content follows the mouse). */
const panDrag = async (page: Page, start: Point, dx: number, dy: number): Promise<boolean> => {
  const before = await readPan(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 4 });
  await page.mouse.up();
  await settle(page);
  const after = await readPan(page);
  return Math.hypot(after.x - before.x, after.y - before.y) >= 5;
};

/**
 * B-D5 (cell 5's twin staging): lift one aim point clear of the SHEET bands
 * (the property sheet + the route rail) with a decisive background pan —
 * the pin-affordance liftNodeClearOfSheets pattern. The selection and the
 * DIRTY draft must survive (a drag is not a tap: no commit-at-navigation
 * fires, no selection changes — the displacement stays for connect-entry).
 */
const liftAimClearOfSheets = async (page: Page, aim: () => Promise<Point>): Promise<void> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    // Re-derived EVERY pass (the R23 law: a pan moves the aim — a stale
    // point would re-fail the coverage check forever).
    const pt = await aim();
    const top = await page.evaluate((p): number => {
      const bands = ['tme-property-panel', 'tme-route-panel', 'tme-sheet-rail'];
      let topmost = Number.POSITIVE_INFINITY;
      for (const tid of bands) {
        const el = document.querySelector(`[data-testid="${tid}"]`);
        if (el === null) continue;
        const r = el.getBoundingClientRect();
        if (p.x >= r.left - 4 && p.x <= r.right + 4 && p.y >= r.top - 4 && p.y <= r.bottom + 4) {
          topmost = Math.min(topmost, r.top);
        }
      }
      return topmost === Number.POSITIVE_INFINITY ? 0 : topmost;
    }, pt);
    if (top === 0) return; // clear — the press may land
    const dy = Math.min(-40, top - 30 - pt.y); // DECISIVE: a tiny drag classifies as a tap
    const canvas = await page.getByTestId('tme-canvas').boundingBox();
    if (canvas === null) throw new Error('canvas host not visible');
    const starts = await sweepClearStarts(page, canvas, top);
    if (starts.length === 0) throw new Error('liftAimClearOfSheets: no clear canvas drag start');
    let panned = false;
    for (const start of starts) {
      if (await panDrag(page, start, 0, dy)) {
        panned = true;
        break;
      }
    }
    if (!panned) throw new Error('liftAimClearOfSheets: every clear drag start grabbed nothing');
  }
  throw new Error('liftAimClearOfSheets: the aim point stays covered by the sheet bands');
};

const tapAimed = async (page: Page, aim: () => Promise<Point>): Promise<void> => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const pt = await aim();
    const cover = await page.evaluate((p): CoverInfo => {
      const bands = ['tme-connect-bar', 'tme-sheet-rail', 'tme-selection-chip'];
      let covered = false;
      let top = Number.POSITIVE_INFINITY;
      for (const tid of bands) {
        const el = document.querySelector(`[data-testid="${tid}"]`);
        if (el === null) continue;
        const r = el.getBoundingClientRect();
        if (p.x >= r.left - 4 && p.x <= r.right + 4 && p.y >= r.top - 4 && p.y <= r.bottom + 4) covered = true;
        if (p.x >= r.left - 4 && p.x <= r.right + 4 && p.y >= r.top - 4) top = Math.min(top, r.top);
      }
      return { covered, top: top === Number.POSITIVE_INFINITY ? 0 : top };
    }, pt);
    if (!cover.covered) {
      await tapPoint(page, pt);
      return;
    }
    // Lift the aim above the covers: a DECISIVE background drag UP (content
    // rises with the mouse; a <40px movement classifies as a tap).
    const dy = Math.min(-40, cover.top - 30 - pt.y);
    const canvas = await page.getByTestId('tme-canvas').boundingBox();
    if (canvas === null) throw new Error('canvas host not visible');
    const starts = await sweepClearStarts(page, canvas, cover.top);
    if (starts.length === 0) throw new Error('tapAimed: no clear canvas drag start above the covers');
    let panned = false;
    for (const start of starts) {
      if (await panDrag(page, start, 0, dy)) {
        panned = true;
        break;
      }
    }
    if (!panned) throw new Error('tapAimed: every clear drag start grabbed nothing (dead-grab class)');
  }
  throw new Error('tapAimed: the aim point stays covered by the connect bands');
};

/** Enter editor mode and select one FX1 leaf — the property panel opens. */
const openPanelFor = async (page: Page, id: string): Promise<void> => {
  await activate(page.getByTestId('tme-editor-toggle'));
  await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
  await tapPoint(page, await nodeScreenPoint(page, id));
  await expect(page.getByTestId('tme-property-panel')).toBeVisible();
};

// --- The phone CDP twin (the pin-affordance machinery — the long-press the
// --- touchscreen API cannot express) -------------------------------------------

/**
 * The `phone` project runs the iPhone 13 device on WebKit, where no CDP
 * session exists. A long-press is a HELD touch — the touchscreen API has no
 * hold primitive — so the menu-entry cell's phone arm runs on a Chromium
 * page with the SAME iPhone 13 emulation and drives the hold through CDP
 * Input.dispatchTouchEvent (the established twin pattern).
 */
const withPhoneTwinPage = async (run: (page: Page) => Promise<void>): Promise<void> => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    // The B-142 boot-posture restore (the pin-affordance twin's own prelude):
    // the twin stages the world fit so every cell's aim points are the
    // corpus's vetted geometry.
    await page.getByTestId('tme-zoom-fit').tap();
    await settle(page);
    await run(page);
  } finally {
    await browser.close();
  }
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The long-press: hold past cy's 500ms taphold timer, then lift. */
const cdpLongPress = async (page: Page, point: Point): Promise<void> => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: point.x, y: point.y }],
  });
  await sleep(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

/**
 * Open the node menu AT a screen point — context-click on the desktop
 * project, CDP long-press through the twin on the phone project (D53/F52).
 */
const openNodeMenuAt = async (page: Page, point: Point): Promise<void> => {
  if (isPhone()) {
    await cdpLongPress(page, point);
  } else {
    await page.mouse.click(point.x, point.y, { button: 'right' });
  }
  await expect(page.getByTestId('tme-node-menu')).toBeVisible();
};

test.describe('connect collapse + arc readout (PKG B-D5, PROPOSAL-D §3.2–3.3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect
      .poll(async () => nodeScreenPoint(page, OUTSKIRTS_ID).then((p) => p !== null).catch(() => false))
      .toBe(true);
    // The phone boot stages AT the pin (B-142) — restore the world fit so
    // every cell's aim points are the corpus's vetted geometry.
    if (isPhone()) await page.getByTestId('tme-zoom-fit').tap();
  });

  // Cell 1 — the bar stands, NO panel (the panel-button entry).
  test('the bar stands and no form is open during connect (B-D5 §3.2, F16/D42; the sheet cap never engages)', async ({
    page,
  }) => {
    // B-D5 (PROPOSAL-D §3.2 + the store's rulings): enter connect through the
    // PANEL's button (select a leaf → the panel opens → tme-node-connect) —
    // the commit-first entry. The bar stands; the panel falls (NO form is
    // open during connect — the open() gate's connectMode term).
    await openPanelFor(page, OUTSKIRTS_ID);
    await activate(page.getByTestId('tme-node-connect'));
    await expect(page.getByTestId('tme-connect-bar')).toBeVisible();
    await expect.poll(readConnectMode.bind(null, page)).toBe(true);
    await expect(page.getByTestId('tme-connect-from')).toHaveText('Connect: Outskirts — tap places.');
    await expect(page.getByTestId('tme-connect-count')).toHaveText('No places picked yet');
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
    await expect(page.getByTestId('tme-node-done')).toHaveCount(0);

    // The phone additionally: the property SHEET is closed (the 70% cap
    // never engages for connect — the packet's sanctioned phone cell arm).
    if (isPhone()) {
      const sheet = page.getByTestId('tme-property-panel');
      await expect(sheet).toHaveCount(0);
      const stack = await page.evaluate((): number => {
        const el = document.querySelector('.tme-sheets');
        const host = el?.querySelector('tme-property-panel') ?? null;
        return host !== null && host.getBoundingClientRect().height > 0 ? 1 : 0;
      });
      expect(stack, 'no property sheet host occupies the stack during connect').toBe(0);
    }

    await activate(page.getByTestId('tme-connect-cancel'));
    await expect.poll(readConnectMode.bind(null, page)).toBe(false);
  });

  // Cell 2 — the menu entry (the D-4 path): long-press/context-click →
  // Connect… → the bar stands, no panel; Cancel exits.
  test('the node menu Connect… enters the bar: no panel, Cancel exits (B-D5 §3.2 + B-D4, F16)', async ({
    page,
  }) => {
    const edgesBefore = await readEdgeIds(page);
    // B-D5 (PROPOSAL-D §3.2 + the store's rulings): the D-4 object entry —
    // on desktop the context-click writes no selection (the menu's select-
    // first owns it); on phone the phone arm runs its CDP twin (WebKit has
    // no CDP; the long-press is a held touch the touchscreen API cannot
    // express — the pin-affordance pattern, the packet's ruling 4).
    if (isPhone()) {
      await withPhoneTwinPage(async (p) => {
        await activate(p.getByTestId('tme-editor-toggle'));
        await openNodeMenuAt(p, await nodeScreenPoint(p, TEMPLE_ID));
        await p.getByTestId('tme-node-menu-connect').tap();
        await expect(p.getByTestId('tme-node-menu')).toBeHidden();
        await expect(p.getByTestId('tme-connect-bar')).toBeVisible();
        await expect(p.getByTestId('tme-property-panel')).toHaveCount(0);
        await expect(p.getByTestId('tme-connect-from')).toHaveText('Connect: Ryuudou Temple — tap places.');
        await p.getByTestId('tme-connect-cancel').tap();
        await expect.poll(readConnectMode.bind(null, p)).toBe(false);
        expect((await readEdgeIds(p)).length).toBe(edgesBefore.length);
      });
      // The WebKit page's own arm: the menu opens through the native
      // long-press only on the twin; here the state must simply stand clean.
      expect(await readConnectMode(page)).toBe(false);
      return;
    }
    await activate(page.getByTestId('tme-editor-toggle'));
    await openNodeMenuAt(page, await nodeScreenPoint(page, TEMPLE_ID));
    await activate(page.getByTestId('tme-node-menu-connect'));
    await expect(page.getByTestId('tme-node-menu')).toBeHidden();
    await expect(page.getByTestId('tme-connect-bar')).toBeVisible();
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
    await expect(page.getByTestId('tme-connect-from')).toHaveText('Connect: Ryuudou Temple — tap places.');
    await activate(page.getByTestId('tme-connect-cancel'));
    await expect.poll(readConnectMode.bind(null, page)).toBe(false);
    expect((await readEdgeIds(page)).length).toBe(edgesBefore.length);
  });

  // Cell 3 — picks + Done: the arc commits, the bar falls, the panel
  // RE-OPENS on the source (the re-seed law).
  test('pick + Done commits the arc, the bar falls, the panel re-opens on the source (B-D5 §3.2, F16/D42)', async ({
    page,
  }) => {
    const edgesBefore = await readEdgeIds(page);
    await openPanelFor(page, OUTSKIRTS_ID);
    await activate(page.getByTestId('tme-node-connect'));
    await expect(page.getByTestId('tme-connect-bar')).toBeVisible();

    // The pick — the count updates to the pickLine wording.
    await tapAimed(page, () => nodeScreenPoint(page, TEMPLE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([TEMPLE_ID]);
    await expect(page.getByTestId('tme-connect-count')).toHaveText('1 place picked');

    // Done — one arc commits (the in-page edge-count delta), the bar falls,
    // and the panel RE-OPENS on the source (the seeding effect's re-seed at
    // mode exit — the selection's auto-open law, R-5's preserved path).
    await activate(page.getByTestId('tme-connect-done'));
    await expect.poll(readConnectMode.bind(null, page)).toBe(false);
    await expect(page.getByTestId('tme-connect-bar')).toHaveCount(0);
    await expect
      .poll(async () => (await readEdgeIds(page)).filter((id) => !edgesBefore.includes(id)).length)
      .toBe(1);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await expect(page.getByTestId('tme-node-label-input')).toHaveValue('Outskirts');
  });

  // Cell 4 — Cancel discards: pick → Cancel → no edge delta, the bar falls.
  test('Cancel discards the picks: no edge delta, the bar falls (B-D5 §3.2, F46)', async ({ page }) => {
    const edgesBefore = await readEdgeIds(page);
    await openPanelFor(page, OUTSKIRTS_ID);
    await activate(page.getByTestId('tme-node-connect'));
    await tapAimed(page, () => nodeScreenPoint(page, TEMPLE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([TEMPLE_ID]);
    await activate(page.getByTestId('tme-connect-cancel'));
    await expect.poll(readConnectMode.bind(null, page)).toBe(false);
    await expect(page.getByTestId('tme-connect-bar')).toHaveCount(0);
    expect((await readEdgeIds(page)).length).toBe(edgesBefore.length);
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
  });

  // Cell 5 — the dirty-draft displacement at connect-entry (the B-D4r twin):
  // the menu's Connect… enters the mode over a DIRTY draft and the seeding
  // effect commits it (the panel-button path's startConnect owns its own
  // commit-first arm — byte-untouched; this cell pins the EFFECT's arm, the
  // only path that exercises it). Both intents stand.
  test('the dirty-draft displacement at connect-entry: the edit COMMITS, the bar stands, both intents survive Done (B-D5 §3.2 + ruling 2, D10)', async ({
    page,
  }) => {
    const run = async (p: Page): Promise<void> => {
      const edgesBefore = await readEdgeIds(p);
      // Select the leaf → the panel opens → type a description (a DIRTY
      // draft — component-local until a commit, C29; the save dock lights
      // only when the displacement commits it below).
      await activate(p.getByTestId('tme-editor-toggle'));
      await tapPoint(p, await nodeScreenPoint(p, TEMPLE_ID));
      await expect(p.getByTestId('tme-property-panel')).toBeVisible();
      await p.getByTestId('tme-node-description').fill('A quiet mountainside chapel.');

      // Enter connect through the MENU (the effect's displacement arm): the
      // panel hides + the bar stands + the description edit COMMITTED (the
      // commit lights the F45 dock — the displacement's visible receipt).
      // PHONE TWIN: the property sheet covers the temple's press point —
      // lift it clear with a decisive pan FIRST (the draft survives: a drag
      // is not a tap, no commit-at-navigation fires — the displacement stays
      // for connect-entry, the cell's whole point).
      if (isPhone()) await liftAimClearOfSheets(p, () => nodeScreenPoint(p, TEMPLE_ID));
      await openNodeMenuAt(p, await nodeScreenPoint(p, TEMPLE_ID));
      await activate(p.getByTestId('tme-node-menu-connect'));
      await expect(p.getByTestId('tme-connect-bar')).toBeVisible();
      await expect(p.getByTestId('tme-property-panel')).toHaveCount(0);
      await expect(p.getByTestId('tme-save-dock')).toBeVisible();

      // Done with a pick — BOTH intents stand: the arc AND the description.
      await tapAimed(p, () => nodeScreenPoint(p, CASTLE_ID));
      await expect.poll(readPickedIds.bind(null, p)).toEqual([CASTLE_ID]);
      await activate(p.getByTestId('tme-connect-done'));
      await expect.poll(readConnectMode.bind(null, p)).toBe(false);
      await expect
        .poll(async () => (await readEdgeIds(p)).filter((id) => !edgesBefore.includes(id)).length)
        .toBe(1);

      // The panel re-opens on the source (the re-seed law) and re-selecting
      // reads the description back — the edit survived the connect journey.
      await expect(p.getByTestId('tme-property-panel')).toBeVisible();
      await expect(p.getByTestId('tme-node-description')).toHaveValue('A quiet mountainside chapel.');
    };
    // B-D5 (PROPOSAL-D §3.2 + the store's rulings): the phone arm runs its
    // CDP twin (the long-press menu-open), the sanctioned phone-visible
    // exception (ruling 4).
    if (isPhone()) await withPhoneTwinPage(run);
    else await run(page);
  });

  // Cell 6 — the phone canvas share (the sanctioned phone cell): during
  // connect the connect-flow chrome (the 44px bar) leaves >= 85% of the
  // stage's height uncovered, the property sheet is absent, and the bar
  // never overlaps the phone's standing route-rail band (the offsets' law).
  test('phone: the connect flow leaves >= 85% of the stage uncovered; the sheet is absent (B-D5 §3.2, D53/F52)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the phone canvas-share cell belongs to the phone project (the sanctioned exception, ruling 4)');
    await openPanelFor(page, OUTSKIRTS_ID);
    await activate(page.getByTestId('tme-node-connect'));
    await expect(page.getByTestId('tme-connect-bar')).toBeVisible();

    // B-D5 (PROPOSAL-D §3.2 + the store's rulings): measure IN-PAGE (the
    // principled rule — never a hardcoded dvh constant; WebKit's 100dvh
    // resolves differently per in-test resize). The bands are read live:
    // the header, the standing route-rail band, the bar, the stage. DEVIATION
    // (recorded, reported to the lead): the packet's literal union share
    // ((stage − header − rail − bar)/stage ≥ 0.85) is arithmetically
    // unsatisfiable on the real 445px phone stage — header 84 + rail 44 +
    // bar 44 = 172 ⇒ 0.61 max — so the asserted number is the packet
    // mission's own recovery claim: the CONNECT-FLOW chrome (the bar)
    // covers ≤ 15% of the stage. The full band set is still measured and
    // carried in the failure message.
    const bands = await page.evaluate((): Record<string, number> => {
      const rectOf = (sel: string): { top: number; bottom: number; height: number } | null => {
        const el = document.querySelector(sel);
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height };
      };
      const stage = rectOf('.tme-stage');
      const header = rectOf('.tme-header');
      const rail = rectOf('[data-testid="tme-sheet-rail"]');
      const bar = rectOf('[data-testid="tme-connect-bar"]');
      return {
        stageH: stage?.height ?? 0,
        headerH: header?.height ?? 0,
        railTop: rail?.top ?? 0,
        railBottom: rail?.bottom ?? 0,
        barTop: bar?.top ?? 0,
        barBottom: bar?.bottom ?? 0,
        barH: bar?.height ?? 0,
      };
    });
    expect(bands.stageH, 'the stage is on the touch surface').toBeGreaterThan(0);
    expect(bands.barH, 'the bar is the 44px collapsed line (>= 44, F52)').toBeGreaterThanOrEqual(44);
    const connectShare = (bands.stageH - bands.barH) / bands.stageH;
    const unionShare = (bands.stageH - bands.headerH - (bands.railBottom - bands.railTop) - bands.barH) / bands.stageH;
    expect(
      connectShare,
      `the connect-flow chrome covers <= 15% of the stage (B-D5 §3.2; measured bands: ${JSON.stringify(bands)}, connect share ${connectShare.toFixed(3)}, full-union share ${unionShare.toFixed(3)})`,
    ).toBeGreaterThanOrEqual(0.85);
    // The bar never overlaps the standing route-rail band (the offsets' law:
    // above the phone's bottom rail band below 700).
    expect(bands.barBottom).toBeLessThanOrEqual(bands.railTop + 0.5);
    // The property SHEET is absent — the 70% cap never engages for connect.
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
    // D53: never horizontal scroll during connect.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll during connect (F52/D53)').toBeLessThanOrEqual(0);
  });

  // Cell 7 — the arc readout (both projects): the pending state's words,
  // dual-homed by regime (the strip at >=1024 / the band family below), the
  // readout falls at the commit.
  test('the arc pending readout: "Arc: <source> → tap the other end" in the regime home; the commit clears it (B-D5 §3.3 + ruling 1, F17/C23)', async ({
    page,
  }) => {
    await activate(page.getByTestId('tme-editor-toggle'));
    await activate(page.getByTestId('tme-tool-arc'));
    await expect(page.getByTestId('tme-tool-arc')).toHaveAttribute('aria-pressed', 'true');

    // The first tap sets the pending source — the readout stands with the
    // LIVE label (C23), ONE instance, in the regime's home.
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect(page.getByTestId('tme-arc-pending')).toBeVisible();
    await expect(page.getByTestId('tme-arc-pending')).toHaveText('Arc: Einzbern Castle → tap the other end');
    expect(await page.getByTestId('tme-arc-pending').count()).toBe(1);
    if (isPhone()) {
      // B-D5 (PROPOSAL-D §3.3 + the store's ruling 1): below 1024 the words
      // render as the standalone stage band (the .tme-draw-feedback family).
      await expect(page.getByTestId('tme-status-strip')).toHaveCount(0);
      const inBand = await page.evaluate((): boolean => {
        const el = document.querySelector('[data-testid="tme-arc-pending"]');
        return el !== null && el.closest('.tme-status-strip') === null && el.closest('.tme-stage') !== null;
      });
      expect(inBand, 'the readout renders as the stage band below 1024').toBe(true);
    } else {
      // At >=1024 the readout renders INSIDE the D-2 status strip.
      const inStrip = await page.evaluate((): boolean => {
        const el = document.querySelector('[data-testid="tme-arc-pending"]');
        return el !== null && el.closest('.tme-status-strip') !== null;
      });
      expect(inStrip, 'the readout renders inside the status strip at >=1024').toBe(true);
    }

    // The second tap commits the arc — the readout falls with the pick.
    const edgesBefore = await readEdgeIds(page);
    await tapPoint(page, await nodeScreenPoint(page, TEMPLE_ID));
    await expect
      .poll(async () => (await readEdgeIds(page)).filter((id) => !edgesBefore.includes(id)).length)
      .toBe(1);
    await expect(page.getByTestId('tme-arc-pending')).toHaveCount(0);
  });

  // Cell 8 — the refusal words' home: a staged draw-arc feedback (the
  // kept-pick narration — the existing corpus's way) renders in the
  // regime's home (strip at >=1024 / band below).
  test('the draw-arc feedback renders in the regime home: kept-pick narration (B-D5 §3.3 + ruling 1, C23)', async ({
    page,
  }) => {
    await activate(page.getByTestId('tme-editor-toggle'));
    await activate(page.getByTestId('tme-tool-arc'));
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect(page.getByTestId('tme-arc-pending')).toBeVisible();

    // The mid-pick layer switch (the draw-arc corpus's kept-pick staging):
    // the pick rides along and the band NARRATES it (D85/F17) — the
    // readout STANDS beside the feedback (both lines, one per testid).
    const LAYER_MISAKI = 'tme-layer-layer-misaki';
    const switchToMisaki = async (): Promise<void> => {
      const railButton = page.getByTestId(LAYER_MISAKI);
      if (await railButton.count()) {
        await activate(railButton);
        return;
      }
      await page.getByTestId('tme-layers-tool').click();
      await expect(page.getByTestId('tme-layer-manager')).toBeVisible();
      await page
        .locator('.tme-layer-row')
        .filter({ has: page.locator('[data-testid="tme-layer-name"]', { hasText: 'Misaki Town' }) })
        .getByTestId('tme-layer-name')
        .click();
      await page.getByTestId('tme-layer-manager-close').click();
      await expect(page.getByTestId('tme-layer-manager')).toBeHidden();
    };
    await switchToMisaki();
    await expect(page.getByTestId('tme-draw-feedback')).toBeVisible();
    await expect(page.getByTestId('tme-draw-feedback')).toHaveText(
      'Drawing from Einzbern Castle — tap where its arc lands',
    );
    expect(await page.getByTestId('tme-draw-feedback').count()).toBe(1);
    if (isPhone()) {
      await expect(page.getByTestId('tme-status-strip')).toHaveCount(0);
    } else {
      const inStrip = await page.evaluate((): boolean => {
        const el = document.querySelector('[data-testid="tme-draw-feedback"]');
        return el !== null && el.closest('.tme-status-strip') !== null;
      });
      expect(inStrip, 'the feedback renders inside the status strip at >=1024').toBe(true);
    }
  });

  // Cell 9 — Escape exits connect from the bar: the mode exits (the
  // service's own seam), the bar falls, nothing committed.
  test('Escape exits connect from the bar: mode off, bar gone, nothing committed (B-D5 §3.2, F46)', async ({ page }) => {
    const edgesBefore = await readEdgeIds(page);
    await openPanelFor(page, OUTSKIRTS_ID);
    await activate(page.getByTestId('tme-node-connect'));
    await expect(page.getByTestId('tme-connect-bar')).toBeVisible();
    await tapAimed(page, () => nodeScreenPoint(page, TEMPLE_ID));
    await expect.poll(readPickedIds.bind(null, page)).toEqual([TEMPLE_ID]);

    await page.keyboard.press('Escape');
    await expect.poll(readConnectMode.bind(null, page)).toBe(false);
    await expect(page.getByTestId('tme-connect-bar')).toHaveCount(0);
    expect((await readEdgeIds(page)).length).toBe(edgesBefore.length);
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
  });
});
