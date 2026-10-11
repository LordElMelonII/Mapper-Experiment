// tests/e2e/inline-naming.e2e-spec.ts — PKG B-D3 (R29, PROPOSAL-D §3.1): the
// inline-naming popover — the form follows the node. Runs at BOTH playwright
// projects (desktop + emulated phone with touch): the flow is CROSS-WIDTH by
// the packet's own ruling — isPhone() gates only the gesture mechanics (the
// house tap idiom), never the flow (D53/F52).
//
// Cited IDs:
//   PROPOSAL-D §3.1 + B-D3 — placing a node keeps the B-116 command sequence
//          byte-identical (upsertNode id:'' + selection) but the property
//          panel NO LONGER auto-opens for a placement: the placed node enters
//          the inline-naming state — one focused Name input on a parked
//          popover anchored at the node's rendered position. Enter commits
//          (the B-116 PUT precedent: ONE upsertNode full-replace, no new
//          facade surface, R2); Escape keeps 'New place'; a click-away
//          commits a TYPED name; an empty input commits nothing (D10:
//          nothing auto-commits — empty never renames).
//   C5/C23 — the placed node is the selection (engine id read live through
//          the seam, never predicted); the default label is the plain words
//          'New place'.
//   R-5    — the EXISTING-node path is preserved: a deselect + reselect opens
//          the property panel name-first (focused + fully selected Name) —
//          the packet's honest test that the skip is latched to the naming
//          moment only.
//   F52/D53 — the input is a >= 44px target, focused unqualified across
//          breakpoints (the soft keyboard IS the point on phone); no
//          hover-only affordance.
//   F45/D75 — the save dock lights from the placement + rename alone (dirty
//          presence, never counts).
import { expect, test, type Locator, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  selectedNodeId(): string | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';
const NEW_PLACE = 'New place'; // C23 default label, verbatim

/**
 * The B-109-vetted clear background point in MODEL coordinates
 * (editor-place-move.e2e-spec.ts's exhaustive scan: >60 model units from
 * every node center, inside the fitted bounding box so the placement renders
 * exactly at the tap, clear of the top-right editor chrome at both fits).
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };

/**
 * The click-away target — a second clear background point, ~99 model units
 * from the first placement (~28px rendered at the 0.282 world fit — beyond
 * the touch slop), so the dismissing tap lands on bare canvas, never on the
 * placed node or the parked plate above it.
 */
const BG_AWAY_MODEL_POINT: { x: number; y: number } = { x: -180, y: 380 };

const isPhone = (): boolean => test.info().project.name === 'phone';

/**
 * PKG B-142 (REPAIRS R-2): the phone boot stages AT the pin — one rail Fit
 * tap restores the world-fit viewport the aims are scanned against. Desktop
 * never arms the posture: a no-op there.
 */
const restoreBootViewport = async (page: Page): Promise<void> => {
  if (isPhone()) await page.getByTestId('tme-zoom-fit').tap();
};

// page.evaluate callbacks are SERIALIZED: the hook lookup is inlined in each
// one — no module-scope closures cross the wire (the maps-library discipline).

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeLabels();
  });

/** C5/D75: the selected node's id (the placed node after a place command). */
const readSelectedId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.selectedNodeId();
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

const collectConsole = (page: Page): string[] => {
  const bad: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));
  return bad;
};

/** Wait two animation frames (the pinned settle precedent — post-layout reads). */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

const canvasBox = async (page: Page) => {
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return box;
};

/** F52/D53: tap on the touch-emulated project, click on desktop (locators). */
const activate = async (locator: Locator): Promise<void> => {
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/**
 * F52/D53 coverage-guarded canvas tap (the recognition-aids idiom): the aim
 * must answer the CANVAS — a plate-, panel- or chrome-covered aim fails with
 * the geometry instead of tapping blind (a covered tap would resolve or
 * dismiss through the wrong surface and the cell would lie).
 */
const tapPoint = async (page: Page, x: number, y: number): Promise<void> => {
  const covered = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return el === null || el.closest('.tme-canvas') === null ? String(el?.tagName ?? 'none') : null;
  }, [x, y] as const);
  if (covered !== null) {
    throw new Error(`tapPoint: the aim (${Math.round(x)},${Math.round(y)}) is covered by ${covered}`);
  }
  if (isPhone()) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
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
  await tapPoint(page, screen.x, screen.y);
};

/**
 * The B-D3 placement staging: editor mode on, one tap at the vetted point.
 * Returns the placed node's engine-assigned id (C5/D75 — read live, never
 * predicted).
 */
const placeNode = async (page: Page): Promise<string> => {
  const toggle = page.getByTestId('tme-editor-toggle');
  await activate(toggle);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await tapModelPoint(page, BG_MODEL_POINT);
  await expect.poll(readSelectedId.bind(null, page)).not.toBeNull();
  const placedId = await readSelectedId(page);
  if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');
  return placedId;
};

test.describe('inline naming: the form follows the node (PKG B-D3, PROPOSAL-D §3.1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readLabels(page)).toContain('Outskirts');
  });

  test('a placement names inline: the popover stands at the node, focused, and the property panel stays shut (B-D3)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await placeNode(page);

    // THE packet's headline: the panel does NOT open for a placement.
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);

    // The popover stands instead — visible, with the input focused on render
    // (asserted via document.activeElement; no IME simulation needed, D53).
    const plate = page.getByTestId('tme-inline-naming');
    await expect(plate).toBeVisible();
    const input = page.getByTestId('tme-inline-name-input');
    await expect(input).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? ''))
      .toBe('tme-inline-name-input');

    // F52: a real touch target both dims.
    const inputBox = await input.boundingBox();
    expect(inputBox?.height ?? 0, 'input height >= 44px (F52)').toBeGreaterThanOrEqual(44);
    expect(inputBox?.width ?? 0, 'input width >= 44px (F52)').toBeGreaterThanOrEqual(44);

    // Anchored at the node: the plate sits within ~80px of the node's
    // rendered position (the +14px offset; the stage clamp adds nothing at
    // this vetted interior point) and stays INSIDE the stage box.
    const placedId = await readSelectedId(page);
    if (placedId === null) throw new Error('placed node lost');
    const nodePos = await readRenderedPosition(page, placedId);
    if (nodePos === null) throw new Error('placed node not rendered');
    const canvas = await canvasBox(page);
    const plateBox = await plate.boundingBox();
    if (plateBox === null) throw new Error('inline-naming plate not visible');
    const dx = plateBox.x - (canvas.x + nodePos.x);
    const dy = plateBox.y - (canvas.y + nodePos.y);
    expect(dx, 'the plate anchors beside the node (x)').toBeGreaterThanOrEqual(0);
    expect(dx, 'the plate anchors within ~80px of the node (x)').toBeLessThanOrEqual(80);
    expect(dy, 'the plate anchors beside the node (y)').toBeGreaterThanOrEqual(0);
    expect(dy, 'the plate anchors within ~80px of the node (y)').toBeLessThanOrEqual(80);
    expect(plateBox.x + plateBox.width, 'the plate stays inside the stage (right)').toBeLessThanOrEqual(canvas.x + canvas.width + 1);
    expect(plateBox.y + plateBox.height, 'the plate stays inside the stage (bottom)').toBeLessThanOrEqual(canvas.y + canvas.height + 1);

    expect(bad, 'console clean through the placement (C32)').toEqual([]);
  });

  test('type + Enter commits the name: the canvas and chip carry it, the panel stays shut, the selection stands, the map is dirty (B-116 PUT/F45)', async ({
    page,
  }) => {
    const placedId = await placeNode(page);
    const input = page.getByTestId('tme-inline-name-input');
    await input.fill('Emiya Cottage');
    await input.press('Enter');

    // The commit is ONE upsertNode full-replace: the canvas projection and
    // the selection chip both carry the typed name (C23 plain words).
    await expect.poll(() => readLabels(page)).toContain('Emiya Cottage');
    await expect.poll(() => readLabels(page)).not.toContain(NEW_PLACE);
    await expect(page.getByTestId('tme-selection-label')).toHaveText('Emiya Cottage');

    // The selection STAYS on the node (today's post-placement state)…
    expect(await readSelectedId(page)).toBe(placedId);
    // …the popover resolved, and the panel STILL did not open.
    await expect(page.getByTestId('tme-inline-naming')).toHaveCount(0);
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);

    // The map is dirty EXACTLY from the placement + rename (one upsert each)
    // — asserted via the save dock's presence, never counts (F45).
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
  });

  test('click-away with a typed name commits it; the tap continues onto the canvas (D10: typed text only)', async ({
    page,
  }) => {
    await placeNode(page);
    const input = page.getByTestId('tme-inline-name-input');
    await input.fill('Old Mill');
    await tapModelPoint(page, BG_AWAY_MODEL_POINT);

    // The typed name committed — the first node carries it…
    await expect.poll(() => readLabels(page)).toContain('Old Mill');
    // …and the dismissing tap went on to place the next node (the editor
    // Node tool's own gesture), which names inline in turn — the honest
    // accounting of the click-away flow.
    await expect.poll(() => readLabels(page)).toContain(NEW_PLACE);
    await expect(page.getByTestId('tme-inline-naming')).toBeVisible();
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
  });

  test('Escape over an empty input keeps New place — the popover closes, nothing renames, the panel stays shut (D10)', async ({
    page,
  }) => {
    await placeNode(page);
    await page.getByTestId('tme-inline-name-input').press('Escape');

    await expect(page.getByTestId('tme-inline-naming')).toHaveCount(0);
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
    // The C23 default stands; the placement's own dirty flag is the only
    // edit (presence, not counts — F45).
    await expect(page.getByTestId('tme-selection-label')).toHaveText(NEW_PLACE);
    await expect.poll(() => readLabels(page)).toContain(NEW_PLACE);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
  });

  test('Empty + Enter is Escape: nothing commits (D10 — empty never renames)', async ({
    page,
  }) => {
    await placeNode(page);
    await page.getByTestId('tme-inline-name-input').press('Enter');

    await expect(page.getByTestId('tme-inline-naming')).toHaveCount(0);
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
    await expect(page.getByTestId('tme-selection-label')).toHaveText(NEW_PLACE);
    await expect.poll(() => readLabels(page)).toContain(NEW_PLACE);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible(); // the placement alone
  });

  test('after Escape, deselect + reselect opens the panel name-first — the preserved existing-node path (R-5 standing)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    const placedId = await placeNode(page);
    await page.getByTestId('tme-inline-name-input').press('Escape');
    await expect(page.getByTestId('tme-inline-naming')).toHaveCount(0);
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);

    // The honest test: the skip is latched to the naming moment only —
    // dismiss the selection (the chip; the latch dies with it) and reselect
    // the node: the panel opens as today for an existing node, NAME-FIRST
    // (focused + fully selected — typing replaces wholesale, R-5).
    await activate(page.getByTestId('tme-selection-chip'));
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    await settle(page);
    const nodePos = await readRenderedPosition(page, placedId);
    if (nodePos === null) throw new Error('placed node not rendered');
    const canvas = await canvasBox(page);
    await tapPoint(page, canvas.x + nodePos.x, canvas.y + nodePos.y);

    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? ''))
      .toBe('tme-node-label-input');
    const state = await page.evaluate(() => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement
        ? { value: el.value, start: el.selectionStart, end: el.selectionEnd }
        : null;
    });
    expect(state?.value, 'the draft is the placed node').toBe(NEW_PLACE);
    expect(state?.start).toBe(0);
    expect(state?.end, 'the Name is fully selected (R-5)').toBe(NEW_PLACE.length);

    expect(bad, 'console clean through the preserved path (C32)').toEqual([]);
  });
});
