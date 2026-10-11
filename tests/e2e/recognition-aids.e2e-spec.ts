// tests/e2e/recognition-aids.e2e-spec.ts — PKG B-147 (REPAIRS R-7):
// recognition aids at BOTH playwright projects (desktop + emulated phone
// with touch) per D53/F52 mobile-and-desktop parity.
//
// Cited IDs:
//   R-7      — the packet: node-kind legend, first-run placement hint,
//              rename nudge.
//   D79      — the one-time hint contract reused from the calibrate hint
//              (B-137): fresh-created map only, dismissible, session-memory.
//   R-5      — the name-first property form; the rename nudge rode the SAME
//              machinery (seedDraft armed focus on every new-node seed) —
//              B-D3 (PROPOSAL-D §3.1) SUPERSEDES the nudge: every placement
//              names INLINE now, and the nudge cells below pin the popover
//              (R29 ruling 3); R-5's own law stands for panel opens.
//   C23      — plain words: the hint sentence and the legend's kind words.
//   F52/D53  — every control >= 44px both dims, touch-alone; the hint's
//              Dismiss and the legend's toggle are swept.
//   R0/R1    — the legend's swatches read the R-0 tokens; no display math.
//   R2/R4    — presentation only; the hint state is service signal reads.
//
// The D79 staging follows maps-library.e2e-spec.ts: boot ?map=none (the
// picker auto-opens), CREATE a fresh map (markFreshlyCreatedMap arms the
// fresh-set before the open). On a fresh map the calibrate hint has
// PRIORITY (B-147: one top-center pill at a time) — the placement hint
// renders only after that hint is dismissed or calibrated away.
import { expect, test, type Page } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  pan(): { x: number; y: number };
  zoom(): number;
  loadedMapId(): string | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

const isPhone = (): boolean => test.info().project.name === 'phone';

/**
 * The proven-empty placement point of editor-property-panel.e2e-spec.ts
 * (B-145/R-5's own cells — FX1's lower-left void, clear of nodes AND arcs).
 */
const BG_MODEL_POINT: { x: number; y: number } = { x: -250, y: 450 };

const NEW_PLACE = 'New place'; // C23 default label, verbatim

// page.evaluate callbacks are SERIALIZED: the hook lookup is inlined in
// each one (the maps-library discipline).

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeLabels();
  });

const collectConsole = (page: Page): string[] => {
  const bad: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));
  return bad;
};

/** F52/D53: one activation path for DOM controls on every project. */
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/** Wait two animation frames (the pinned settle precedent — post-layout reads). */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/**
 * B-D1 re-baseline (PROPOSAL-D §2.1 + B-D1): the collapsed-rail cell below
 * drives the rail COLLAPSE cycle — at >=1024 the collapse toggle is
 * display:none (a 56px belt has nothing to collapse), so the cycle's home
 * regime is the 700–1023 medium band, where the wide column and its toggle
 * stand byte-for-byte (R29 ruling 1). The desktop arm stages there first.
 * Self-gates on the live viewport width (the phone arm never hits it).
 */
const stageAtWideChromeViewport = async (page: Page): Promise<void> => {
  const width = page.viewportSize()?.width ?? 0;
  if (width < 1024) return;
  await page.setViewportSize({ width: 900, height: 720 }); // the medium band
  await settle(page); // the shell flip re-render lands before the next paint
};

const canvasBox = async (page: Page) => {
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  return box;
};

/**
 * F52/D53: genuine tap on the touch-emulated project, click on desktop.
 * B-133c coverage guard (maps-library's primitive): if the aim answers
 * anything but the canvas, collapse the standing sheet stack (phone) when
 * that is the cover, else fail with the geometry rather than tapping blind.
 */
const tapPoint = async (page: Page, x: number, y: number): Promise<void> => {
  const covered = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return el === null || el.closest('.tme-canvas') === null ? String(el?.tagName ?? 'none') : null;
  }, [x, y] as const);
  if (covered !== null) {
    const rail = page.getByTestId('tme-sheet-rail');
    if ((await rail.count()) > 0 && (await rail.getAttribute('aria-expanded')) === 'true') {
      await rail.click();
      await expect(rail).toHaveAttribute('aria-expanded', 'false');
      await page.waitForTimeout(200); // the collapse re-renders — a tap in the same tick can still hit the body
    } else {
      const chain = await page.evaluate(([px, py]) => {
        const el = document.elementFromPoint(px, py);
        const out: string[] = [];
        let cur: Element | null = el;
        while (cur !== null && out.length < 6) {
          out.push(`${cur.tagName}/${cur.getAttribute('data-testid') ?? cur.className?.toString?.().slice(0, 40) ?? ''}`);
          cur = cur.parentElement;
        }
        return out;
      }, [x, y] as const);
      throw new Error(`tapPoint: the aim (${Math.round(x)},${y}) is covered by ${covered} — chain ${chain.join(' < ')}`);
    }
  }
  if (isPhone()) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
};

/** Tap a MODEL point: convert via the seam (test-side math only — R1). */
const tapModelPoint = async (page: Page, model: { x: number; y: number }): Promise<void> => {
  await settle(page);
  const screen = await page.evaluate((m): { x: number; y: number } | null => {
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
 * Create a fresh map through the picker's New flow (the D79 staging of
 * maps-library.e2e-spec.ts:340): the create arms the calibrate hint and
 * (B-147) the placement fresh-set, then the Open path closes the picker.
 */
const createFreshMap = async (page: Page, name: string): Promise<void> => {
  await page.goto('/?map=none');
  await expect(page.getByTestId('tme-maps-panel')).toBeVisible(); // auto-opened picker
  await page.getByTestId('tme-maps-create-input').fill(name);
  await activate(page, 'tme-maps-create');
  await expect(page.getByTestId('tme-maps-panel')).toBeHidden(); // the Open path closed it
  await expect(page.getByTestId('tme-calibrate-hint')).toBeVisible(); // the D79 hint armed
};

test.describe('node-kind legend (PKG B-147, R-7 item 1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    // The boot posture (B-142) may cull labels at the narrow fit — the
    // legend is rail chrome and needs no node reads, so no viewport fixup.
  });

  test('renders collapsed by default; the toggle expands the four kind rows (R-7, C23)', async ({ page }) => {
    const legend = page.getByTestId('tme-legend');
    await expect(legend).toBeVisible();
    await expect(page.getByTestId('tme-legend-toggle')).toHaveAttribute('aria-expanded', 'false');

    // Collapsed: the rows are absent, the toggle alone.
    await expect(page.locator('.tme-legend-rows')).toHaveCount(0);

    await activate(page, 'tme-legend-toggle');
    await expect(page.getByTestId('tme-legend-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.tme-legend-rows')).toBeVisible();

    // The four truthful rows — the visually-distinct canvas classes
    // (GRAPH_STYLESHEET): three leaf hues + the dashed district box. Plain
    // words (C23), the property panel's kind-select voice.
    for (const word of ['Location', 'Hub', 'Waypoint', 'District']) {
      await expect(legend).toContainText(word);
    }
    await expect(legend).not.toContainText('World'); // no invented swatches (the honesty ruling)
    await expect(legend).not.toContainText('Region');
    await expect(legend).not.toContainText('City');

    // The swatches are rendered (one per row) — token-colored (R0), no hex.
    expect(await page.locator('.tme-legend-swatch').count(), 'one swatch per row').toBe(4);

    // Toggle back collapsed.
    await activate(page, 'tme-legend-toggle');
    await expect(page.getByTestId('tme-legend-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.tme-legend-rows')).toHaveCount(0);
  });

  test('the legend toggle is a >= 44x44 touch target (F52)', async ({ page }) => {
    const box = await page.getByTestId('tme-legend-toggle').boundingBox();
    expect(box?.height ?? 0, 'toggle height >= 44px (F52)').toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, 'toggle width >= 44px (F52)').toBeGreaterThanOrEqual(44);
  });

  test('the collapsed rail hides the legend (it lives in the body flow, not a standing band)', async ({ page }) => {
    // R-5 precedent: count-based collapse asserts are false on desktop (the
    // panel template keeps rendering off-screen slices) — assert GEOMETRY:
    // collapsed, the legend must not overlap the canvas. B-D1 (PROPOSAL-D
    // §2.1 + B-D1): the collapse cycle lives below 1024 — stage the desktop
    // arm at the medium band first.
    await stageAtWideChromeViewport(page);
    await activate(page, 'tme-rail-toggle');
    await expect(page.getByTestId('tme-rail-toggle')).toHaveText('Show');
    await settle(page);
    const legend = await page.getByTestId('tme-legend').boundingBox();
    const canvas = await canvasBox(page);
    const overlaps =
      legend !== null &&
      !(legend.x + legend.width <= canvas.x || canvas.x + canvas.width <= legend.x) &&
      !(legend.y + legend.height <= canvas.y || canvas.y + canvas.height <= legend.y);
    expect(overlaps, 'the collapsed rail hides the legend (no canvas overlap)').toBe(false);
    await activate(page, 'tme-rail-toggle');
    await expect(page.getByTestId('tme-rail-toggle')).toHaveText('Hide');
  });
});

test.describe('first-run placement hint (PKG B-147, R-7 item 2, D79 reuse)', () => {
  test('arms on a fresh map, yields to the calibrate hint, dismisses once, is taught away by the first placement', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await createFreshMap(page, 'Hint Land');

    // PRIORITY: on a fresh map the calibrate hint is up and the placement
    // hint does NOT render (one pill at a time — the B-137 slot idiom).
    await expect(page.getByTestId('tme-place-hint')).toHaveCount(0);

    // Dismiss the calibrate hint → the placement hint takes the slot once
    // the author ENTERS EDITOR MODE (its gate — the hint teaches placement).
    await activate(page, 'tme-calibrate-hint-dismiss');
    await expect(page.getByTestId('tme-calibrate-hint')).toBeHidden();
    await expect(page.getByTestId('tme-place-hint')).toHaveCount(0);
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tme-place-hint')).toBeVisible();
    await expect(page.getByTestId('tme-place-hint')).toContainText('Tap the map to place a place.');
    await expect(page.getByTestId('tme-place-hint-text')).toHaveText('Tap the map to place a place.');

    // The hint's own dismiss: one discrete tap, gone for this session.
    await activate(page, 'tme-place-hint-dismiss');
    await expect(page.getByTestId('tme-place-hint')).toBeHidden();

    // Re-enter editor mode → dismissed hints never return (the D79 contract).
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-place-hint')).toHaveCount(0);

    // The taught-away path: a SECOND fresh map; dismiss the calibrate hint,
    // enter editor mode → the placement hint shows (not yet done)…
    await createFreshMap(page, 'Hint Land 2');
    await activate(page, 'tme-calibrate-hint-dismiss');
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-place-hint')).toBeVisible();

    // …the FIRST successful placement marks it done WITHOUT a dismiss.
    const box = await canvasBox(page);
    await tapPoint(page, box.x + box.width / 2, box.y + box.height * 0.7); // lower stage: clear of the top-center hints

    // The placement consumed the hint…
    await expect(page.getByTestId('tme-place-hint')).toBeHidden();
    // …the node exists (the hint taught the truth)…
    await expect.poll(() => readLabels(page)).toContain('New place');
    // …and it never returns (done-set), including on a re-entry.
    await activate(page, 'tme-editor-toggle');
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-place-hint')).toHaveCount(0);

    expect(bad, 'console clean through the hint journey (C32)').toEqual([]);
  });

  test('the place-hint dismiss is a >= 44x44 touch target (F52)', async ({ page }) => {
    await createFreshMap(page, 'Hint F52');
    await activate(page, 'tme-calibrate-hint-dismiss');
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-place-hint')).toBeVisible();
    const box = await page.getByTestId('tme-place-hint-dismiss').boundingBox();
    expect(box?.height ?? 0, 'dismiss height >= 44px (F52)').toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, 'dismiss width >= 44px (F52)').toBeGreaterThanOrEqual(44);
  });
});

test.describe('rename nudge superseded by inline naming (R29 B-D3 ruling 3 — PROPOSAL-D §3.1)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    // The BG point staging is scanned against the WORLD-FIT viewport (the
    // R-2 re-baseline law): the phone's pin-centered boot pushes the FX1
    // castle off-viewport — one rail-Fit tap restores the fit first.
    if (isPhone()) await page.getByTestId('tme-zoom-fit').tap();
  });

  test('every new placement names inline: the popover re-arms Name-focused on each placement (R-7 item 3 — the nudge IS the popover now)', async ({
    page,
  }) => {
    // R-7 item 3 SUPERSEDED (B-D3, PROPOSAL-D §3.1 — cited): every placement
    // names INLINE, so "name as you go" needs no panel re-open arm — the
    // FIRST placement's popover stands focused over the fresh node, and the
    // SECOND placement re-arms the same way over ITS node (the input empty;
    // the placeholder carries the ask). The R-5 panel-open focus+select law
    // is untouched for panel opens (pinned by editor-property-panel's
    // library leg on the preserved path).
    await activate(page, 'tme-editor-toggle');
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
    await tapModelPoint(page, BG_MODEL_POINT); // the R-5 cells' proven-empty placement point

    // First placement: the popover focused; the panel never opened; the
    // placed node is the selection (C5/C23 via the chip).
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
    await expect(page.getByTestId('tme-inline-naming')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? ''))
      .toBe('tme-inline-name-input');
    await expect(page.getByTestId('tme-selection-label')).toHaveText(NEW_PLACE);

    // SECOND placement — the nudge's successor: the dismissing tap itself
    // resolves the first popover (an empty input cancels, D10 — no chip
    // staging needed on phone anymore, and no route-floater park on desktop:
    // no stage-covering panel opens on a placement now), the tap goes on to
    // place the next node, and the popover re-arms focused over it. The aim
    // must be a DIFFERENT clear point than the first placement (the first
    // node now sits at BG_MODEL_POINT — a same-point tap would select it),
    // clear of the parked PLATE too (probe-measured: the plate anchors
    // +14px DOWN-RIGHT of the node and spans ~214x60, so the offset goes
    // UP-RIGHT — (+70,-70) model units renders ~55px away at the desktop
    // boot fit (zoom 0.786) and ~20px at the phone's 0.282, clear of the
    // plate box and the node's tap radius on every project), still inside
    // FX1's lower-left void (the R-5 cells' proven-empty region).
    await tapModelPoint(page, { x: BG_MODEL_POINT.x + 70, y: BG_MODEL_POINT.y - 70 });
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? ''))
      .toBe('tme-inline-name-input');
    const state = await page.evaluate(() => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement ? { value: el.value } : null;
    });
    expect(state?.value, 'the re-armed input is empty for the new node').toBe('');

    // Both placements carry the C23 default; the second is the selection.
    await expect(page.getByTestId('tme-selection-label')).toHaveText(NEW_PLACE);
    await expect
      .poll(async () => (await readLabels(page)).filter((label) => label === NEW_PLACE))
      .toHaveLength(2);
  });
});
