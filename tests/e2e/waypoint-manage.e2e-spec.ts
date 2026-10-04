// tests/e2e/waypoint-manage.e2e-spec.ts — PKG B-110: waypoint management
// (Remove + Promote-to-map) from the route panel's Waypoint section, proven
// at BOTH playwright projects (desktop + emulated phone with touch) per
// D53/F52.
//
// Cited IDs:
//   D21     — one-click 'promote to map' NAMES it and saves it into the
//             library map; waypoints are per-chat state and removable. An
//             empty name is not a name (the C30 honesty pattern).
//   C23     — no machine names: the engine's `wp-`/`we-` ids stay in seams
//             and never render — asserted over the whole panel text.
//   C26     — promotion moves the node overlay → library under ONE id
//             (atomic): the chip and route panel re-render under the new
//             name with zero drift because the id never changes.
//   D61     — incident user edges graduate (library-bound edges move into
//             map.edges, ids kept): the `we-` id set is UNCHANGED by
//             promotion and the edges still render — the projection reads
//             both planes (layer-elements.ts).
//   D58/D74 — a waypoint is an ordinary route target (kind-based pin
//             eligibility): the route panel below the section still routes
//             pin→waypoint, ok:true on FX1 with the `min` unit (D74's one
//             honest canonical currency; D72 labels the run).
//   C30     — the facade refuses an empty label; the UI stays honest by
//             disabling Promote while the trimmed input is empty (the B-106
//             pattern — the facade stays the authority).
//   §6.2    — removal takes the node's user edges with it; other waypoints
//             and their edges are untouched; a still-standing waypoint needs
//             no special UI (orphaned waypoints stay — removable).
//   F46/D2  — no undo, no confirmation dialogs: one tap = one command;
//             removal is recoverable by replacement (place again).
//   F52/D53 — every flow at both viewports; the input and both buttons are
//             >= 44px tap targets, operable by touch alone; never horizontal
//             scroll at 375px.
//
// FX1 facts: the pin is Emiya Residence; layer-fuyuki holds 13 leaves ≥
// WAYPOINT_KNN=3, so every placement here creates exactly 3 `we-` edges
// (C7). Canvas content is read/aimed through the DEV-HARNESS-ONLY
// window.__TME_E2E__ hook (src/app/app.ts): read-only projections of the
// cytoscape model. All aim math is TEST-side — the UI computes nothing (R1).
import { expect, test, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  edgeIds(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

const STATION_ID = 'fuyuki-station';
const STATION_LABEL = 'Fuyuki Station';
/** D21: the name the promote flow types — a human label, never an id. */
const PROMOTED_LABEL = 'Riverside Camp';

/**
 * The B-109-vetted clear background points in MODEL coordinates (see
 * waypoints.e2e-spec.ts's header for the exhaustive scan discipline: >110
 * model units from every authored edge segment and >60 from every node
 * center, badge, and compound box, at BOTH projects' fits).
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };
const BG_MODEL_POINT_2: { x: number; y: number } = { x: 300, y: 92 };

const isPhone = (): boolean => test.info().project.name === 'phone';

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeLabels();
  });

const readWeIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.edgeIds().filter((id) => id.startsWith('we-'));
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

/**
 * Wait two animation frames: viewport changes re-fit the view through the
 * ResizeObserver just before the next paint — reads inside that window yield
 * pre-fit coordinates and the next tap misses (arc-panel.e2e-spec.ts
 * precedent).
 */
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

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const tapPoint = async (page: Page, point: Point): Promise<void> => {
  if (isPhone()) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
};

/** F52/D53: one activation path for DOM controls on every project. */
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/** Model point → canvas-relative rendered point (seam read, test-side math). */
const modelPoint = async (page: Page, model: { x: number; y: number }): Promise<Point> => {
  await settle(page);
  return page.evaluate(
    (m): Point => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      const pan = hook.pan();
      const zoom = hook.zoom();
      return { x: pan.x + m.x * zoom, y: pan.y + m.y * zoom };
    },
    model,
  );
};

/** Tap a canvas node through its rendered position (seam + canvas box). */
const tapNode = async (page: Page, id: string): Promise<void> => {
  await settle(page);
  const pos = await readRenderedPosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await canvasBox(page);
  await tapPoint(page, { x: box.x + pos.x, y: box.y + pos.y });
};

/** C5 engine ids are deterministic from a fresh facade: wp-1 then wp-2. */
const waypointCount = async (page: Page): Promise<number> =>
  (await readLabels(page)).filter((l) => l === 'Waypoint').length;

/**
 * B-120 (D76): the placement contract — enter EDITOR mode, select the
 * WAYPOINT tool, tap the model point, then exit back to view mode so every
 * downstream assertion below runs in the exact regime it always has (the
 * tool is KEPT across the exit; the reset happens at the next entry).
 */
const placeWaypointViaEditor = async (page: Page, model: { x: number; y: number }): Promise<void> => {
  await activate(page, 'tme-editor-toggle');
  await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
  await activate(page, 'tme-tool-waypoint');
  await expect(page.getByTestId('tme-tool-waypoint')).toHaveAttribute('aria-pressed', 'true');
  await tapPoint(page, await modelPoint(page, model));
  await activate(page, 'tme-editor-toggle'); // back to view mode
  await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'false');
};

const sorted = (ids: string[]): string[] => [...ids].sort();

test.describe('waypoint management: remove + promote-to-map (PKG B-110)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readRenderedPosition(page, 'emiya-residence')).not.toBeNull();
  });

  test('selecting a placed waypoint opens the Waypoint section; the route below still routes pin→waypoint (D58/D74, C23)', async ({
    page,
  }) => {
    // Ruling 1: no selection ⇒ no section.
    await expect(page.getByTestId('tme-waypoint')).toHaveCount(0);

    // B-109/B-120 flow: place through editor + Waypoint tool (the placement
    // writes no selection — the chip stays hidden), then tap the waypoint to
    // select it.
    await placeWaypointViaEditor(page, BG_MODEL_POINT);
    await expect.poll(() => waypointCount(page)).toBe(1);
    await tapNode(page, 'wp-1');

    // The section shows above the route legs; the chip carries the C23
    // plain-word label, never the engine id.
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText('Waypoint');
    await expect(page.getByTestId('tme-waypoint')).toBeVisible();

    // D58/D74: the waypoint is an ordinary route target — the legs/total
    // below the section route pin→waypoint, ok:true on FX1 with the `min`
    // unit (D74's honest canonical currency; D72 labels the run).
    await expect(page.getByTestId('tme-target')).toContainText('Waypoint');
    await expect(page.getByTestId('tme-total')).toHaveText(/ min$/);
    const legCount = await page.getByTestId('tme-leg').count();
    expect(legCount).toBeGreaterThanOrEqual(1);

    // C23: no machine token anywhere in the panel (ids live in the seams).
    const panelText = await page.getByTestId('tme-route-panel').innerText();
    expect(panelText, 'no wp- machine name renders (C23)').not.toMatch(/wp-\d/);
    expect(panelText, 'no we- machine name renders (C23)').not.toMatch(/we-\d/);
  });

  test('Promote names it into the library: canvas label, section, chip, route and edges all follow (D21/C26/D61)', async ({
    page,
  }) => {
    await placeWaypointViaEditor(page, BG_MODEL_POINT);
    await expect.poll(() => waypointCount(page)).toBe(1);
    await tapNode(page, 'wp-1');
    await expect(page.getByTestId('tme-waypoint')).toBeVisible();

    const weBefore = await readWeIds(page);
    expect(weBefore).toHaveLength(3); // C7 k=3

    await page.getByTestId('tme-waypoint-label-input').fill(PROMOTED_LABEL);
    await activate(page, 'tme-waypoint-promote');

    // D21/C26: the canvas label becomes the authored name — SAME id, now a
    // library node (no 'Waypoint' left).
    await expect.poll(async () => (await readLabels(page)).filter((l) => l === PROMOTED_LABEL)).toHaveLength(1);
    expect((await readLabels(page)).filter((l) => l === 'Waypoint')).toHaveLength(0);

    // Ruling 1: the section disappears — a library node renders no Waypoint
    // section (removal is Phase 3 editor business; C30 refuses it).
    await expect(page.getByTestId('tme-waypoint')).toHaveCount(0);

    // C26 (ruling 2): the chip re-rendered under the new name — the SAME id
    // re-pointed, zero drift.
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(PROMOTED_LABEL);

    // D58/D74: the route panel still routes to it — an ordinary target.
    await expect(page.getByTestId('tme-target')).toContainText(PROMOTED_LABEL);
    await expect(page.getByTestId('tme-total')).toHaveText(/ min$/);

    // D61: graduation keeps ids — the former `we-` edges still render with
    // the SAME ids (the projection reads both planes after the move).
    expect(sorted(await readWeIds(page))).toEqual(sorted(weBefore));
  });

  test('Promote stays disabled while the name is empty or whitespace (C30/D21 — the B-106 honesty pattern)', async ({
    page,
  }) => {
    await placeWaypointViaEditor(page, BG_MODEL_POINT);
    await expect.poll(() => waypointCount(page)).toBe(1);
    await tapNode(page, 'wp-1');
    await expect(page.getByTestId('tme-waypoint')).toBeVisible();

    const promote = page.getByTestId('tme-waypoint-promote');
    await expect(promote).toBeVisible();
    await expect(promote).toBeDisabled(); // empty input

    await page.getByTestId('tme-waypoint-label-input').fill('   ');
    await expect(promote).toBeDisabled(); // whitespace is not a name (D21)

    await page.getByTestId('tme-waypoint-label-input').fill(PROMOTED_LABEL);
    await expect(promote).toBeEnabled();

    // The facade was never offered the throw: nothing promoted while the
    // button was disabled (the node is still the unnamed overlay waypoint).
    expect(await waypointCount(page)).toBe(1);
    expect((await readLabels(page)).filter((l) => l === PROMOTED_LABEL)).toHaveLength(0);
  });

  test('Remove takes the waypoint and its edges; the other waypoint is untouched; the chip clears (§6.2, ruling 2/F46)', async ({
    page,
  }) => {
    await placeWaypointViaEditor(page, BG_MODEL_POINT);
    await expect.poll(() => waypointCount(page)).toBe(1);
    const weAfterFirst = await readWeIds(page); // wp-1's 3 edges (C7)
    await placeWaypointViaEditor(page, BG_MODEL_POINT_2);
    await expect.poll(() => waypointCount(page)).toBe(2);
    expect(await readWeIds(page)).toHaveLength(6); // C5: engine-assigned, collision-free

    // Select and Remove the SECOND waypoint — no confirmation dialog
    // (ruling 3: recoverable by replacement; one tap = one command, F46/D2).
    await tapNode(page, 'wp-2');
    await expect(page.getByTestId('tme-waypoint')).toBeVisible();
    await activate(page, 'tme-waypoint-remove');

    // Gone from the map; its user edges died with it (§6.2). Exactly wp-1's
    // original 3 remain — every `we-` edge is incident to its own waypoint
    // by construction, so the survivor's edge set is untouched (§6.2).
    await expect.poll(() => waypointCount(page)).toBe(1);
    expect(sorted(await readWeIds(page))).toEqual(sorted(weAfterFirst));

    // Ruling 2: the chip cleared with the removed selection — the section
    // and the route target go with it.
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    await expect(page.getByTestId('tme-waypoint')).toHaveCount(0);
  });

  test('the §6.2 orphan case, UI side: the last waypoint removed takes its edges; the survivor needs no special UI (§6.2/F46)', async ({
    page,
  }) => {
    await placeWaypointViaEditor(page, BG_MODEL_POINT);
    await expect.poll(() => waypointCount(page)).toBe(1);
    await placeWaypointViaEditor(page, BG_MODEL_POINT_2);
    await expect.poll(() => waypointCount(page)).toBe(2);
    expect(await readWeIds(page)).toHaveLength(6);

    // Remove the FIRST waypoint: the survivor STAYS (§6.2: orphaned
    // waypoints stay — removable), chip clears.
    await tapNode(page, 'wp-1');
    await expect(page.getByTestId('tme-waypoint')).toBeVisible();
    await activate(page, 'tme-waypoint-remove');
    await expect.poll(() => waypointCount(page)).toBe(1);
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();

    // The survivor needs no special UI: the SAME section opens on it and the
    // SAME Remove works (F46: one tap = one command).
    await tapNode(page, 'wp-2');
    await expect(page.getByTestId('tme-waypoint')).toBeVisible();
    await activate(page, 'tme-waypoint-remove');

    // The only (last) waypoint removed ⇒ its edges went with it: the `we-`
    // set is EMPTY and no 'Waypoint' label remains (§6.2 edge-death rule).
    await expect.poll(() => readWeIds(page)).toHaveLength(0);
    expect(await waypointCount(page)).toBe(0);
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
  });

  test('a library node renders NO Waypoint section (Phase 3 fence — C30 refuses removal)', async ({ page }) => {
    await tapNode(page, STATION_ID);

    // Ruling 1: the section is fenced to PLACED waypoints — a library node
    // keeps the ordinary M2 semantics (chip + route target, no section).
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-selection-label')).toHaveText(STATION_LABEL);
    await expect(page.getByTestId('tme-waypoint')).toHaveCount(0);
    await expect(page.getByTestId('tme-target')).toContainText(STATION_LABEL);
  });

  test('phone 375px: place → manage → promote → remove by touch alone, >=44px controls, no horizontal scroll (F52/D53)', async ({
    page,
  }) => {
    test.skip(!isPhone(), 'the 375px touch-geometry check belongs to the phone project (D53)');
    await page.setViewportSize({ width: 375, height: 667 });
    await settle(page);
    await expect.poll(() => readRenderedPosition(page, 'emiya-residence')).not.toBeNull();

    // Place by touch (editor + Waypoint tool, the B-120 contract), select by
    // touch (B-109 flow).
    await placeWaypointViaEditor(page, BG_MODEL_POINT);
    await expect.poll(() => waypointCount(page)).toBe(1);
    await tapNode(page, 'wp-1');
    await expect(page.getByTestId('tme-waypoint')).toBeVisible();

    // F52: the input and BOTH buttons are >= 44px tap targets (Promote is
    // measurable while disabled — the empty-name state).
    for (const testId of ['tme-waypoint-label-input', 'tme-waypoint-promote', 'tme-waypoint-remove']) {
      const box = await page.getByTestId(testId).boundingBox();
      if (box === null) throw new Error(`${testId} not visible`);
      expect(box.height, `${testId} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box.width, `${testId} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }

    // Promote by touch: type the name, tap the button (C26/D61 as above).
    await page.getByTestId('tme-waypoint-label-input').fill(PROMOTED_LABEL);
    await activate(page, 'tme-waypoint-promote');
    await expect.poll(async () => (await readLabels(page)).filter((l) => l === PROMOTED_LABEL)).toHaveLength(1);
    await expect(page.getByTestId('tme-waypoint')).toHaveCount(0);
    await expect(page.getByTestId('tme-selection-label')).toHaveText(PROMOTED_LABEL);

    // Remove by touch: place a fresh waypoint, select it, Remove.
    await placeWaypointViaEditor(page, BG_MODEL_POINT_2);
    await expect.poll(() => waypointCount(page)).toBe(1);
    await tapNode(page, 'wp-2');
    await expect(page.getByTestId('tme-waypoint')).toBeVisible();
    await activate(page, 'tme-waypoint-remove');
    await expect.poll(() => waypointCount(page)).toBe(0);
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();

    // D53: never horizontal scroll at 375px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal scroll at 375px (F52/D53)').toBeLessThanOrEqual(0);

    // D53: with a selection open again, the route panel (hosting the
    // section) sits inside the viewport and never forces page overflow.
    await tapNode(page, STATION_ID);
    await expect(page.getByTestId('tme-waypoint')).toHaveCount(0);
    const panelFits = await page.evaluate((): boolean => {
      const panel = document.querySelector('tme-route-panel');
      if (panel === null) throw new Error('route panel host not found');
      const box = panel.getBoundingClientRect();
      return box.y + box.height <= window.innerHeight && panel.scrollWidth <= panel.clientWidth + 1;
    });
    expect(panelFits, 'route panel fully visible at 375px (D53)').toBe(true);
  });
});
