// tests/e2e/tap-targets.e2e-spec.ts — PKG B-114: the F52 tap-target sweep —
// EVERY visible interactive control (button, input) in every app state is
// >= 44x44 px in BOTH dimensions, at BOTH playwright projects (desktop +
// emulated phone with touch), with no horizontal scroll — the §5 M4
// "tap-target sizing (D53)" completion of F52.
//
// Cited IDs:
//   F52      — "every feature above, the editor included, works with touch
//              alone on a phone-sized screen and with a mouse on a desktop:
//              no hover-dependent affordances, tap-and-drag targets of usable
//              size, ... and panels that adapt to narrow viewports instead of
//              overflowing. One responsive UI — there is no separate mobile
//              mode, and no feature is desktop-only (D53)." (verbatim)
//   D53      — mobile & desktop parity is a v1 requirement: the sweep runs
//              per project, and phone taps are genuine touchscreen taps.
//   §6.2     — "hover-only affordances are a defect, not a degradation"; the
//              sweep covers every STATE the chrome can be seen in.
//   B-114    — the four swept states: idle; node selected (route sheet auto-
//              expanded on phone); edge selected (arc panel open); waypoint
//              selected (the Waypoint management section).
//
// Enumeration discipline (ruling 5): elements are enumerated BY QUERY —
// every `button`/`input`/[role="button"] in the document that is visible at
// sweep time — never a hardcoded count of one state, so a new control is
// swept automatically and a query bug cannot vacuously pass (a non-empty
// floor is asserted per state). Disabled controls are swept too: the ≥44px
// rule is about touch REACHABILITY, and disabled Promote/Block rows are part
// of the visible chrome. The ≥44x44 sizes themselves are stylesheet minima;
// this spec proves they hold in the live DOM at both viewports.
//
// FX1 facts: the pin is Emiya Residence; layer-fuyuki holds 13 leaves, so a
// background placement creates exactly one selectable `wp-1` waypoint (C7).
// Canvas aiming goes through the DEV-HARNESS-ONLY window.__TME_E2E__ seam
// (src/app/app.ts); all aim math is test-side — the UI computes nothing (R1).
import { expect, test, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

interface SweptControl {
  /** data-testid, else id, else tag — for the failure message only. */
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

const STATION_ID = 'fuyuki-station';
/** FX1 arc facts: the only arc into the castle (the edge-selected state). */
const CASTLE_ARC = { id: 'arc-outskirts-einzbern-castle', source: 'outskirts', target: 'einzbern-castle' };
/**
 * The B-109-vetted clear background point in MODEL coordinates (see
 * waypoints.e2e-spec.ts's header for the scan discipline: >110 model units
 * from every authored edge segment and >60 from every node center/badge/box,
 * at BOTH projects' fits). FX1's phone fit is WIDTH-bound, so the sheet
 * freeing stage height moves the content's vertical centering only — the
 * model-space clearance and the runtime seam conversion are unaffected.
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };

const isPhone = (): boolean => test.info().project.name === 'phone';

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeRenderedPosition(nodeId);
    },
    id,
  );

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeLabels();
  });

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

/**
 * Wait two animation frames: panel open/close changes the stage size
 * synchronously, but the ResizeObserver-driven re-fit (B-112) runs just
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
  const pos = await readPosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await canvasBox(page);
  await tapPoint(page, { x: box.x + pos.x, y: box.y + pos.y });
};

/** Tap an arc through the RENDERED MIDPOINT of its two endpoints (B-106). */
const tapEdgeMidpoint = async (page: Page, arc: { id: string; source: string; target: string }): Promise<void> => {
  await settle(page);
  const source = await readPosition(page, arc.source);
  const target = await readPosition(page, arc.target);
  if (source === null || target === null) {
    throw new Error(`arc ${arc.id} endpoints not rendered (unmounted or absent)`);
  }
  const box = await canvasBox(page);
  await tapPoint(page, {
    x: box.x + (source.x + target.x) / 2,
    y: box.y + (source.y + target.y) / 2,
  });
};

/**
 * The in-page sweep: enumerate every visible interactive control by query.
 * "Visible" = a non-empty box that intersects the viewport (a control hidden
 * by display:none — e.g. the sheet rail at ≥700px — or scrolled out of the
 * viewport is not part of the touch surface). Enumerated by role/query, not
 * by count, so every control in every future state is swept automatically.
 */
const sweepControls = (page: Page): Promise<SweptControl[]> =>
  page.evaluate((): SweptControl[] => {
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const out: SweptControl[] = [];
    const els = document.querySelectorAll<HTMLElement>('button, input, [role="button"]');
    for (const el of Array.from(els)) {
      const box = el.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) continue; // not visible (display:none / zero-size)
      if (box.y + box.height <= 0 || box.y >= viewportH) continue; // outside the touch surface
      if (box.x + box.width <= 0 || box.x >= viewportW) continue;
      out.push({
        name:
          el.getAttribute('data-testid') ??
          el.getAttribute('id') ??
          `${el.tagName.toLowerCase()}${el.textContent?.trim().slice(0, 20) ?? ''}`,
        width: box.width,
        height: box.height,
      });
    }
    return out;
  });

/** The F52 assertion over one swept state: every control >= 44x44, both dims. */
const expectAllTapTargets = async (page: Page, state: string, minCount: number): Promise<void> => {
  const controls = await sweepControls(page);
  expect(
    controls.length,
    `${state}: the sweep enumerated controls (a query bug would vacuously pass)`,
  ).toBeGreaterThanOrEqual(minCount);
  for (const control of controls) {
    expect(
      control.height,
      `${state}: ${control.name} height >= 44px (F52)`,
    ).toBeGreaterThanOrEqual(44);
    expect(
      control.width,
      `${state}: ${control.name} width >= 44px (F52)`,
    ).toBeGreaterThanOrEqual(44);
  }
  // F52: panels adapt to narrow viewports instead of overflowing.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${state}: no horizontal scroll (F52/D53)`).toBeLessThanOrEqual(0);
};

test.describe('F52 tap-target sweep (PKG B-114)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readPosition(page, 'emiya-residence')).not.toBeNull();
  });

  test('idle: layer switcher, route chrome — every visible control >= 44x44 (F52/D53/§6.2)', async ({
    page,
  }) => {
    await expectAllTapTargets(page, 'idle', 3); // >= 2 layer buttons + chrome
  });

  test('node selected: sheet body + mode switch + chip — every visible control >= 44x44 (F52/D53/§6.2)', async ({
    page,
  }) => {
    await tapNode(page, STATION_ID);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(page.getByTestId('tme-total')).toBeVisible(); // the auto-expanded body (B-114)
    await expectAllTapTargets(page, 'node selected', 5); // layers + chip + rail + 3 modes
  });

  test('edge selected: the reason input and the block/lift buttons — every visible control >= 44x44 (F52/D53/§6.2)', async ({
    page,
  }) => {
    await tapEdgeMidpoint(page, CASTLE_ARC);
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(page.getByTestId('tme-arc-block')).toBeVisible(); // disabled, still swept
    await expectAllTapTargets(page, 'edge selected', 5);
  });

  test('waypoint selected: the Waypoint section input and buttons — every visible control >= 44x44 (F52/D53/§6.2)', async ({
    page,
  }) => {
    // Place by background tap (the B-109 gesture), then select the waypoint
    // so the Waypoint management section renders (B-110).
    await tapPoint(page, await modelPoint(page, BG_MODEL_POINT));
    await expect
      .poll(async () => (await readLabels(page)).filter((l) => l === 'Waypoint'))
      .toHaveLength(1);
    await tapNode(page, 'wp-1');
    await expect(page.getByTestId('tme-waypoint')).toBeVisible();
    await expect(page.getByTestId('tme-waypoint-promote')).toBeVisible(); // disabled, still swept
    await expectAllTapTargets(page, 'waypoint selected', 5);
  });
});
