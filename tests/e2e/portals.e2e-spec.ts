// tests/e2e/portals.e2e-spec.ts — PKG B-128 (D85/F02/F17): portals go live —
// the property panel's "Opens layer" wiring, portal badges (the B-107
// machinery), the double-activation entry gesture with the breadcrumb bar,
// and the F17 cross-layer draw un-fence. Runs under BOTH playwright projects
// (desktop + emulated phone with touch) per D53/F52.
//
// Cited IDs:
//   D85/F02 — wiring is authored in the node property panel ("Opens layer",
//             at most one entry node per layer, mirrored read-only in the
//             manager sheet); a portal node wears a badge marker (one visual
//             language with the arc badges, C3); ENTERING a layer is a
//             viewport switch ONLY (double-activate the badge) — routing,
//             the snapshot and the pin are layer-agnostic and untouched
//             (D16/F02 restated); the breadcrumb bar is the way back, its
//             chain derived from the wiring; selectLayer's explicit fit
//             STANDS (D85: the D81 fit-site list unchanged).
//   D85/F17 — the un-fence: cross-layer arc CREATION commits — a mid-pick
//             layer switch KEEPS the pick and narrates it; the tap on the
//             new layer commits (C3 badges it); the B-122 refusal message
//             never renders.
//   C23     — the badge label is the TARGET layer's authored NAME; every
//             rendered word is an authored word (no ids anywhere).
//   C30     — wiring refusals (unknown target / own layer / a second node
//             onto a wired target) render field-precise and the select
//             REVERTS (the two-pass revert — never silently rewired /
//             re-parented, D83's regime generalized).
//   F45/D75 — wiring and the drawn cross-layer arc mark only `dirty`: the
//             save dock lights until Save.
//   D53/F52 — every gesture touch-alone capable at the phone viewport
//             (the double-activation is dblclick desktop / dbltap phone —
//             the installed runtime fires both names on the mouse path and
//             dbltap on touch, so plain taps suffice; no WebKit twin needed,
//             AGENTS.md §6); crumbs and the panel select are >= 44px.
//   R1      — the pin's snapshot headers stay verbatim across every
//             transition (the pin renders on its home layer).
//
// FX1 facts (data/worlds/fuyuki.ts): 'einzbern-castle' is the isolated
// Fuyuki corner leaf (the vetted clear-tap target); 'outskirts' is a
// parentless leaf; 'misaki-town' is the Misaki layer's single hub; layers
// layer-fuyuki ('Fuyuki City') and layer-misaki ('Misaki Town'); the pin is
// 'emiya-residence'. Canvas aiming goes through the DEV-HARNESS-ONLY
// window.__TME_E2E__ seam; all aim math is test-side (R1).
import { expect, test, type Locator, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  zoom(): number;
  edgeData(id: string): { id: string; source: string; target: string; modes: string[] } | null;
  badgeText(arcId: string): string | null;
  /** B-121 (D77): the edit log's ids — a committed cross-layer arc NEVER
   *  projects as an edge (C3), so its engine-assigned id is read here. */
  draftedIds(): string[];
  /** B-128: one portal badge's label by its wire node's id, or null. */
  portalBadgeText(nodeId: string): string | null;
  /** B-128: the active layer's breadcrumb chain (as rendered), or []. */
  breadcrumbChain(): string[];
  /** B-122: the pending draw-arc source's id, or null. */
  drawArcSourceId(): string | null;
  /** B-122/B-128: the draw-arc banner's current message, or null. */
  drawArcFeedback(): string | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';
const CASTLE_ID = 'einzbern-castle';
const CASTLE_LABEL = 'Einzbern Castle';
const OUTSKIRTS_ID = 'outskirts';
const MISAKI_ID = 'misaki-town';
const LAYER_FUYUKI_BTN = 'tme-layer-layer-fuyuki';
const LAYER_MISAKI_BTN = 'tme-layer-layer-misaki';
const PORTAL_BADGE_ID = `tme-portal-badge-${CASTLE_ID}`;
const KEPT_PICK_LINE = `Drawing from ${CASTLE_LABEL} — tap where its arc lands`;

const R1_HEADERS: ReadonlyArray<[string, string]> = [
  ['tme-location', 'Emiya Residence'],
  ['tme-snapshot-layer', 'Fuyuki City'], // the PIN's home layer — never the active viewer layer (D16)
  ['tme-unit', 'min'],
];

const isPhone = (): boolean => test.info().project.name === 'phone';

/**
 * PKG B-142 (REPAIRS R-2) re-baseline: the phone boot now stages AT the pin
 * (the boot-posture zoom, the pin-centered viewport). This spec's aims are
 * exhaustively scanned against the PRE-PACKET WORLD-FIT boot viewport
 * (zoom = 0.282... on FX1 — the whole world in view: the castle at x=-380,
 * the station cluster at x=560+ — all out of the narrow pin-centered view),
 * so the phone cells restore exactly that viewport first by tapping the
 * rail's Fit — the packet's own "explicit full-world ask" (§R2). Desktop
 * never arms the posture (the wide gate mirrors D81's 700px breakpoint),
 * so its boot is byte-unchanged and this is a no-op. Booted twins (the
 * in-test Chromium phone pages) take the same restore. Aim math and every
 * assertion are untouched — the R23 in-box-content law stands throughout.
 */
const restoreBootViewport = async (page: Page): Promise<void> => {
  if (isPhone()) await page.getByTestId('tme-zoom-fit').tap();
};

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const activate = async (locator: Locator): Promise<void> => {
  if (isPhone()) await locator.tap();
  else await locator.click();
};

const activateTestId = (page: Page, testId: string): Promise<void> =>
  activate(page.getByTestId(testId));

// page.evaluate callbacks are SERIALIZED: the hook lookup is inlined in each
// one and data crosses as the evaluate argument — no closures over spec-scope
// variables (the established specs' discipline).

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeLabels();
  });

const readZoom = (page: Page): Promise<number> =>
  page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.zoom();
  });

const readEdgeData = (page: Page, id: string) =>
  page.evaluate((edgeId) => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.edgeData(edgeId);
  }, id);

const readBadgeText = (page: Page, arcId: string) =>
  page.evaluate((arc) => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.badgeText(arc);
  }, arcId);

const readPortalBadgeText = (page: Page, nodeId: string) =>
  page.evaluate((id) => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.portalBadgeText(id);
  }, nodeId);

const readChain = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.breadcrumbChain();
  });

const readDraftedIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.draftedIds();
  });

const readDrawSourceId = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.drawArcSourceId();
  });

const readDrawFeedback = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.drawArcFeedback();
  });

const readRenderedPosition = (
  page: Page,
  id: string,
): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId) => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.nodeRenderedPosition(nodeId);
  }, id);

const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/** Aim a canvas tap at a node's rendered position (the seam + canvas box). */
const tapNode = async (page: Page, id: string): Promise<void> => {
  await settle(page);
  const pos = await readRenderedPosition(page, id);
  if (pos === null) throw new Error(`node ${id} not rendered (unmounted or absent)`);
  const box = await page.getByTestId('tme-canvas').boundingBox();
  if (box === null) throw new Error('canvas host not visible');
  await tapPoint(page, { x: box.x + pos.x, y: box.y + pos.y });
};

const tapPoint = async (page: Page, point: Point): Promise<void> => {
  if (isPhone()) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
};

/** F02's fixed double-activation: dblclick desktop, dbltap phone (touch alone). */
const doubleActivatePoint = async (page: Page, point: Point): Promise<void> => {
  if (isPhone()) {
    await page.touchscreen.tap(point.x, point.y);
    await page.touchscreen.tap(point.x, point.y);
  } else {
    await page.mouse.dblclick(point.x, point.y);
  }
};

/** R1: the three core header strings, verbatim. */
const expectHeaders = async (page: Page): Promise<void> => {
  for (const [testId, text] of R1_HEADERS) {
    await expect(page.getByTestId(testId)).toHaveText(text);
  }
};

/** Wire (or unwire) the castle to a layer through the property panel. */
const wireCastleTo = async (page: Page, layerLabel: string | null): Promise<void> => {
  await activateTestId(page, 'tme-editor-toggle'); // enter editor
  await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
  await tapNode(page, CASTLE_ID); // selects the castle — the panel opens
  await expect(page.getByTestId('tme-property-panel')).toBeVisible();
  await expect(page.getByTestId('tme-node-label-input')).toHaveValue(CASTLE_LABEL); // the panel is CASTLE's
  const select = page.getByTestId('tme-node-portal');
  await expect(select).toHaveValue(''); // unwired by default
  await select.selectOption(layerLabel === null ? { label: 'None' } : { label: layerLabel });
  if (layerLabel !== null) {
    await expect.poll(() => readPortalBadgeText(page, CASTLE_ID)).toBe(layerLabel);
  }
  await activateTestId(page, 'tme-editor-toggle'); // exit editor — the gesture works in view mode too
  await expect(page.getByTestId('tme-editor-tools')).toBeHidden();
};

/** A sheet row by its NAME SPAN (the mirror line can name other layers — filter on the name itself). */
const rowByName = (page: Page, name: string): Locator =>
  page
    .locator('.tme-layer-row')
    .filter({ has: page.locator('[data-testid="tme-layer-name"]', { hasText: name }) });

test.describe('portals: badges, the entry gesture, the breadcrumb, and the F17 un-fence (PKG B-128, D85)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    await expect.poll(() => readRenderedPosition(page, 'emiya-residence')).not.toBeNull();
  });

  test('wire + badge + the sheet mirror, then unwire (desktop)', async ({ page }) => {
    test.skip(isPhone(), 'the wiring UX cell is pinned at the desktop viewport (the phone cell exercises the gesture + breadcrumb + draw)');
    await wireCastleTo(page, 'Misaki Town');

    // The badge label is the TARGET layer's authored NAME (C23) and the save
    // dock lights (F45: wiring marks only dirty).
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await activateTestId(page, 'tme-layer-manage');
    const misakiRow = rowByName(page, 'Misaki Town');
    await expect(misakiRow.getByTestId('tme-layer-portal')).toHaveText(
      `Entered from ${CASTLE_LABEL} (Fuyuki City)`,
    );
    const fuyukiRow = rowByName(page, 'Fuyuki City');
    await expect(fuyukiRow.getByTestId('tme-layer-portal')).toHaveText(
      'No entry from another layer',
    );
    await activateTestId(page, 'tme-layer-manager-close');

    // Unwiring removes the badge and the mirror line re-reads (C24).
    await activateTestId(page, 'tme-editor-toggle');
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-node-label-input')).toHaveValue(CASTLE_LABEL);
    await page.getByTestId('tme-node-portal').selectOption({ label: 'None' });
    await expect.poll(() => readPortalBadgeText(page, CASTLE_ID)).toBeNull();
    await activateTestId(page, 'tme-layer-manage');
    await expect(misakiRow.getByTestId('tme-layer-portal')).toHaveText(
      'No entry from another layer',
    );
  });

  test('the entry gesture switches layers; the breadcrumb bar is the way back (both projects)', async ({ page }) => {
    await wireCastleTo(page, 'Misaki Town');
    await expect(page.getByTestId('tme-breadcrumb')).toBeHidden(); // a root layer has no bar (chain length 1)
    const zoomBefore = await readZoom(page);

    // Double-activate the badge — F02's fixed gesture, touch-alone on phone.
    await settle(page);
    // B-133 (D91): the wiring selection left the route sheet auto-expanded
    // (B-114), and on the full-width overlay stage it can cover the badge —
    // the taps would hit the sheet, not the canvas. A user dismisses the
    // selection first (the chip dismiss also collapses the sheet); the
    // gesture then runs on a clear map. Setup, not assertion.
    if (await page.getByTestId('tme-selection-chip').isVisible()) {
      await activateTestId(page, 'tme-selection-chip');
      await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    }
    const pos = await readRenderedPosition(page, PORTAL_BADGE_ID);
    if (pos === null) throw new Error('portal badge not rendered');
    const box = await page.getByTestId('tme-canvas').boundingBox();
    if (box === null) throw new Error('canvas host not visible');
    await doubleActivatePoint(page, { x: box.x + pos.x, y: box.y + pos.y });

    // The viewport switched ONLY (D85): the canvas shows the target layer…
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']);
    // …the nav highlight moved…
    await expect(page.getByTestId(LAYER_MISAKI_BTN)).toHaveClass(/tme-active/);
    // …the breadcrumb chain derives from the wiring, active crumb last…
    await expect.poll(() => readChain(page)).toEqual(['layer-fuyuki', 'layer-misaki']);
    const crumbs = page.getByTestId('tme-crumb');
    await expect(crumbs).toHaveCount(2);
    await expect(crumbs.first()).toHaveText('Fuyuki City');
    await expect(crumbs.last()).toHaveText('Misaki Town');
    await expect(crumbs.last()).toHaveAttribute('aria-current', 'page'); // the active crumb is non-interactive
    // …the headers stay the PIN's truth, verbatim (R1/D16 — layer-agnostic).
    await expectHeaders(page);
    // D81 pin (desktop): the entry IS a selectLayer — its explicit fit ran.
    if (!isPhone()) {
      const zoomAfter = await readZoom(page);
      expect(zoomAfter, 'selectLayer re-fit ran on the entry (D85/D81)').not.toBe(zoomBefore);
    }
    // Crumbs are >= 44px tap targets (F52).
    const crumbBox = await crumbs.first().boundingBox();
    expect(crumbBox?.height ?? 0, 'crumb height >= 44px (F52)').toBeGreaterThanOrEqual(44);
    expect(crumbBox?.width ?? 0, 'crumb width >= 44px (F52)').toBeGreaterThanOrEqual(44);

    // A crumb tap returns; with the root active the bar hides (length 1).
    await activate(crumbs.first());
    await expect.poll(() => readLabels(page)).toContain(CASTLE_LABEL);
    await expect.poll(() => readChain(page)).toEqual(['layer-fuyuki']);
    await expect(page.getByTestId('tme-breadcrumb')).toBeHidden();
  });

  test('the F17 un-fence: the kept mid-pick pick commits cross-layer; badges at both ends (both projects)', async ({
    page,
  }) => {
    // The created arc's id is read off the B-121 edit log (C5/D75: engine
    // ids are never predicted) — a CROSS-LAYER arc never projects as an edge
    // on either layer (C3), so the edge-id delta cannot see it.
    const draftedBefore = await readDraftedIds(page);
    await activateTestId(page, 'tme-editor-toggle');
    await activateTestId(page, 'tme-tool-arc');
    await tapNode(page, CASTLE_ID);
    await expect.poll(() => readDrawSourceId(page)).toBe(CASTLE_ID);

    // Mid-pick layer switch (the nav tap): the pick is KEPT and NARRATED —
    // the old refusal message never renders (D85).
    await activateTestId(page, LAYER_MISAKI_BTN);
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']);
    await expect.poll(() => readDrawFeedback(page)).toBe(KEPT_PICK_LINE);
    await expect(page.getByTestId('tme-draw-feedback')).toContainText('Drawing from');
    expect(await readDraftedIds(page)).toEqual(draftedBefore); // the switch alone commits nothing

    // The target tap on the new layer COMMITS cross-layer (F17 un-fenced).
    await tapNode(page, MISAKI_ID);
    await expect
      .poll(async () => (await readDraftedIds(page)).length)
      .toBe(draftedBefore.length + 1);
    const created = (await readDraftedIds(page)).filter((id) => !draftedBefore.includes(id));
    const data = await readEdgeData(page, created[0]);
    expect([data?.source, data?.target].sort()).toEqual([CASTLE_ID, MISAKI_ID].sort());
    expect(data?.modes).toEqual(['walk', 'car', 'train']); // the D42 default-allowed set (D78)
    await expect.poll(() => readDrawSourceId(page)).toBeNull();
    await expect.poll(() => readDrawFeedback(page)).toBeNull();
    await expect(page.getByTestId('tme-save-dock')).toBeVisible(); // F45/D75: dirty lights

    // C3: the arc is BADGED at its on-layer endpoint — Misaki's end names the
    // far destination; switching back shows the other end.
    await expect.poll(() => readBadgeText(page, created[0])).toContain(CASTLE_LABEL);
    await activateTestId(page, LAYER_FUYUKI_BTN);
    await expect.poll(() => readBadgeText(page, created[0])).toContain('Misaki Town');
    await activateTestId(page, 'tme-save');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(() => readDraftedIds(page)).toEqual([]); // the save cleared the log
  });

  test('refusals render field-precise and the selects revert (desktop)', async ({ page }) => {
    test.skip(isPhone(), 'the refusal/revert cells are pinned at the desktop viewport (the phone cells exercise the gesture + draw)');
    await wireCastleTo(page, 'Misaki Town'); // castle → Misaki: the target is now wired

    // A SECOND node onto the wired target refuses (the validator's
    // one-entry-node-per-layer rule, field-precise) and the select reverts
    // to the live wiring (None) — never silently rewired.
    await activateTestId(page, 'tme-editor-toggle');
    await tapNode(page, OUTSKIRTS_ID);
    // Gate on the panel having SWITCHED to the tapped node — the selects
    // are content-bound, and a selectOption racing the panel render would
    // hit the previous node's DOM.
    await expect(page.getByTestId('tme-node-label-input')).toHaveValue('Outskirts');
    await page.getByTestId('tme-node-portal').selectOption({ label: 'Misaki Town' });
    await expect(page.getByTestId('tme-node-errors')).toBeVisible();
    await expect(page.getByTestId('tme-node-errors')).toContainText(
      'at most one node may open layer',
    );
    await expect(page.getByTestId('tme-node-portal')).toHaveValue(''); // the two-pass revert
    await expect.poll(() => readPortalBadgeText(page, OUTSKIRTS_ID)).toBeNull();

    // Moving the PORTAL NODE onto its own target layer refuses (the
    // validator's own-layer rule) and the LAYER select reverts (B-126's
    // mechanism); the wiring itself survives untouched.
    await tapNode(page, CASTLE_ID);
    await expect(page.getByTestId('tme-node-label-input')).toHaveValue(CASTLE_LABEL);
    await page.getByTestId('tme-node-layer').selectOption({ label: 'Misaki Town' });
    await expect(page.getByTestId('tme-node-errors')).toBeVisible();
    await expect(page.getByTestId('tme-node-errors')).toContainText(
      'a portal cannot target its own layer',
    );
    await expect(page.getByTestId('tme-node-layer')).toHaveValue('layer-fuyuki'); // the revert
    await expect.poll(() => readPortalBadgeText(page, CASTLE_ID)).toBe('Misaki Town');
  });

  test('journey housekeeping: console clean, R1 headers verbatim at every transition, touch-alone (both projects)', async ({
    page,
  }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    await wireCastleTo(page, 'Misaki Town');
    await settle(page);
    // B-133 (D91): dismiss the wiring selection first — the auto-expanded
    // route sheet can cover the badge on the full-width overlay stage (the
    // entry-gesture cell's note); the gesture runs on a clear map.
    if (await page.getByTestId('tme-selection-chip').isVisible()) {
      await activateTestId(page, 'tme-selection-chip');
      await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    }
    const pos = await readRenderedPosition(page, PORTAL_BADGE_ID);
    if (pos === null) throw new Error('portal badge not rendered');
    const box = await page.getByTestId('tme-canvas').boundingBox();
    if (box === null) throw new Error('canvas host not visible');
    await doubleActivatePoint(page, { x: box.x + pos.x, y: box.y + pos.y });
    await expect.poll(() => readLabels(page)).toEqual(['Misaki Town']);
    await expectHeaders(page); // the pin's truth on the entered layer (R1/D16)
    await activate(page.getByTestId('tme-crumb').first());
    await expect.poll(() => readLabels(page)).toContain(CASTLE_LABEL);
    await expectHeaders(page); // verbatim on the way back too

    expect(bad, 'no console errors/warnings/pageerrors during the portal journey').toEqual([]);
  });
});
