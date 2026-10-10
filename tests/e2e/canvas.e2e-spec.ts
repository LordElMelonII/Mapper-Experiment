// tests/e2e/canvas.e2e-spec.ts — PKG B-102, the first e2e spec (D68).
// Runs under BOTH playwright projects (desktop + emulated phone with touch) —
// D53/F52 mobile-and-desktop parity is mandatory for every UI packet.
//
// Cited IDs: F01 (one layer plane at a time, FX1 layers switchable) · F03
// (per-layer background fitted + centered, graph always on top, D69 harness
// asset) · F07 (districts are compound containers) · F52/D53 (touch-only
// parity, >= 44px targets, canvas touch-action: none) · C2 (blocked arcs
// DRAWN dashed, never hidden) · D2 (zoneless signal service) · D3 (headless
// cy mount/unmount lifecycle) · D7 (stylesheet as data) · FX1 (fixture map).
//
// PKG B-142 (REPAIRS R-2) adds the phone-boot-posture cells: the narrow
// layout's boot stages AT the party position ("where are we, what's next?") at
// a label-legible zoom (the cull factor's double-inverse — the sanctioned
// derivation), where the pre-packet boot rendered anonymous specks
// (REPAIRS.md §R2: the re-baseline is DELIBERATE; the boot zoom's prior
// ≈0.282 world-fit value on the phone stage is retired — no cell below or in
// any aim spec asserts it; the aim specs that scanned their geometry against
// that boot viewport re-baseline by tapping the rail's Fit — the packet's own
// "explicit full-world ask" — see each spec's in-file citation). The R23
// resize-pin law applies to everything here: the pin is asserted by in-box
// content, never a zoom-delta proxy.
//
// Canvas content is read through the DEV-HARNESS-ONLY window.__TME_E2E__ hook
// (see src/app/app.ts): a read-only projection of the cytoscape model. The
// hook is registered by the harness app only — the ST entry (src/st/entry.ts)
// never ships it.
import { expect, test, type Locator, type Page } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  edgeLineStyle(id: string): string | null;
}

/** Read the labels of the nodes currently projected onto the canvas. */
const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeLabels();
  });

/** Read one edge's resolved line-style ('solid' | 'dashed' | ...), or null. */
const readLineStyle = (page: Page, id: string): Promise<string | null> =>
  page.evaluate((edgeId): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.edgeLineStyle(edgeId);
  }, id);

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const activate = async (locator: Locator): Promise<void> => {
  if (test.info().project.name === 'phone') await locator.tap();
  else await locator.click();
};

// B-D1 re-baseline (PROPOSAL-D §2.1 + B-D1): at >=1024 the rail's per-layer
// nav and its Manage entry are shell-gated OFF — the layer list/switch rides
// the LAYER MANAGER's row-name buttons (the switch surface,
// layer-manager.component) and the manager opens through the belt's Layers
// tool (tme-layers-tool); below 1024 the rail's per-layer buttons stand
// byte-identical (R29 ruling 1). Presence-probed against the live DOM — the
// regime truth, never a mirrored breakpoint.

/** A manager row by its NAME button's text (the portals rowByName idiom —
 *  the row can quote other layers in its portal line, the name never does). */
const rowByName = (page: Page, name: string): Locator =>
  page
    .locator('.tme-layer-row')
    .filter({ has: page.locator('[data-testid="tme-layer-name"]', { hasText: name }) });

/** Open the layer manager through the live regime's entry (B-D1). */
const openLayerManager = async (page: Page): Promise<void> => {
  const beltTool = page.getByTestId('tme-layers-tool');
  if (await beltTool.count()) await beltTool.click();
  else await page.getByTestId('tme-layer-manage').click();
  await expect(page.getByTestId('tme-layer-manager')).toBeVisible();
};

/** Switch layers in the live regime (B-D1): the rail's per-layer button below
 *  1024, the manager's row-name button at >=1024 — closed after the shell
 *  switch so the chrome state matches the pre-shell flow (no sheet left open;
 *  selectLayer's explicit fit runs on the row click, D85/D81). */
const switchLayer = async (page: Page, layerId: string, layerName: string): Promise<void> => {
  const railButton = page.getByTestId(`tme-layer-${layerId}`);
  if (await railButton.count()) {
    await activate(railButton);
    return;
  }
  await openLayerManager(page);
  await rowByName(page, layerName).getByTestId('tme-layer-name').click();
  await expect(page.getByTestId('tme-layer-manager')).toBeVisible();
  await page.getByTestId('tme-layer-manager-close').click();
  await expect(page.getByTestId('tme-layer-manager')).toBeHidden();
};

test.describe('map canvas harness (PKG B-102)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
  });

  test('canvas host exists and is non-zero sized (D3 mount)', async ({ page }) => {
    const box = await page.getByTestId('tme-canvas').boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);
  });

  test('layer switcher lists both FX1 layers (F01/FX1)', async ({ page }) => {
    // B-D1 re-baseline (PROPOSAL-D §2.1 + B-D1): the switcher's surface at
    // >=1024 is the manager's row-name buttons (the belt has no per-layer
    // nav); below 1024 the rail buttons stand (R29 ruling 1).
    if (await page.getByTestId('tme-layer-layer-fuyuki').count()) {
      await expect(page.getByTestId('tme-layer-layer-fuyuki')).toHaveText('Fuyuki City');
      await expect(page.getByTestId('tme-layer-layer-misaki')).toHaveText('Misaki Town');
    } else {
      await openLayerManager(page);
      await expect(rowByName(page, 'Fuyuki City').getByTestId('tme-layer-name')).toHaveText('Fuyuki City');
      await expect(rowByName(page, 'Misaki Town').getByTestId('tme-layer-name')).toHaveText('Misaki Town');
    }
  });

  test('header shows pin location and pin layer name verbatim (R1, FX1)', async ({ page }) => {
    // Exact strings from facade.getSnapshot() — the pin (emiya-residence)
    // lives on layer-fuyuki, whose NAME is 'Fuyuki City'; the unit is the
    // snapshot's one honest currency (FX1 canonical unit: minutes).
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence');
    await expect(page.getByTestId('tme-snapshot-layer')).toHaveText('Fuyuki City');
    await expect(page.getByTestId('tme-unit')).toHaveText('min');
  });

  test('tapping the Misaki switcher swaps the rendered node set (F01/D16, F52/D53)', async ({ page }) => {
    // Fuyuki first: the pin's layer, with its 13 leaves + 2 district boxes.
    await expect.poll(readLabels.bind(null, page)).toContain('Emiya Residence');
    // B-D1 re-baseline (PROPOSAL-D §2.1 + B-D1): the regime-aware switch (the
    // rail button below 1024, the manager's row-name button in the shell).
    await switchLayer(page, 'layer-misaki', 'Misaki Town');
    // Misaki Town is the misaki layer's single node — and the Fuyuki set is
    // GONE, proving one plane at a time (F01/D16, no layer blending).
    await expect.poll(readLabels.bind(null, page)).toContain('Misaki Town');
    await expect.poll(readLabels.bind(null, page)).not.toContain('Emiya Residence');
  });

  test('blocked arc renders dashed; a normal arc renders solid (C2, D7)', async ({ page }) => {
    // C2: blocked arcs are excluded from routing but remain DRAWN — dashed,
    // via the tme-blocked stylesheet rule (D7 data), contrasted here against
    // an unblocked sibling arc on the same layer.
    await expect.poll(readLineStyle.bind(null, page, 'arc-emiya-residence-fuyuki-bridge')).toBe('dashed');
    await expect.poll(readLineStyle.bind(null, page, 'arc-emiya-residence-shopping-district')).toBe('solid');
  });

  test('harness background image loads for the active layer (F03/D69)', async ({ page }) => {
    const bg = page.getByTestId('tme-bg');
    await expect(bg).toHaveCount(1);
    // naturalWidth > 0 proves the asset actually loaded (not a broken img).
    await expect
      .poll(() => bg.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  });

  test('phone only: canvas host computes touch-action none (F52/D53)', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'touch-action belongs to the touch project');
    const touchAction = await page
      .getByTestId('tme-canvas')
      .evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe('none');
  });

  // B-104: the first-paint regression net — pin the deterministic initial view
  // (loadMap → first layer → preset layout → facade snapshot) so any drift in
  // the load path fails fast (F01/F19, FX1, C2, R1).
  test('first paint is deterministic: Fuyuki active, pin labeled, both buttons, bridge dashed (F01/F19, FX1, C2, R1)', async ({
    page,
  }) => {
    // F01/FX1: the FIRST layer (Fuyuki City) is active on load — its leaves
    // render, Misaki's single node does not.
    await expect.poll(readLabels.bind(null, page)).toContain('Emiya Residence');
    await expect.poll(readLabels.bind(null, page)).not.toContain('Misaki Town');

    // R1: header strings are the facade snapshot's, verbatim.
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence');
    await expect(page.getByTestId('tme-snapshot-layer')).toHaveText('Fuyuki City');
    await expect(page.getByTestId('tme-unit')).toHaveText('min');

    // F01/FX1: both layers are switchable from first paint — the rail's
    // per-layer buttons below 1024 (R29 ruling 1), the manager's row-name
    // buttons in the >=1024 shell (B-D1 re-baseline, PROPOSAL-D §2.1 + B-D1).
    if (await page.getByTestId('tme-layer-layer-fuyuki').count()) {
      await expect(page.getByTestId('tme-layer-layer-fuyuki')).toHaveText('Fuyuki City');
      await expect(page.getByTestId('tme-layer-layer-misaki')).toHaveText('Misaki Town');
    } else {
      await openLayerManager(page);
      await expect(rowByName(page, 'Fuyuki City').getByTestId('tme-layer-name')).toHaveText('Fuyuki City');
      await expect(rowByName(page, 'Misaki Town').getByTestId('tme-layer-name')).toHaveText('Misaki Town');
    }

    // C2: the blocked bridge is dashed from the very first paint.
    await expect.poll(readLineStyle.bind(null, page, 'arc-emiya-residence-fuyuki-bridge')).toBe('dashed');
  });
});

// --- PKG B-142 (REPAIRS R-2): the phone BOOT POSTURE ------------------------
//
// The narrow layout boots pin-centered at a label-legible zoom (the sanctioned
// derivation: fitZoom × (1/LABEL_CULL_FACTOR)², capped by the service's own
// over-zoom cap constant); the pre-packet phone boot was the whole-world fit
// whose ≈3.4 px labels read as anonymous specks (§R2, P0). Architecture per
// the sanctioned ruling: the posture is entered at mount() on the narrow
// layout; its re-assertion is a mount-armed `cy.one('zoom', …)` one-shot
// consumed by the boot's OWN reflexive initial ResizeObserver refit (the
// narrow boot is a two-fit boot: mount fit + a panel-driven narrow refit
// ~150–250 ms later — neither is a "later narrow environmental resize", so
// the D81/D87 fit sites are untouched and later user gestures/resizes behave
// byte-identically to pre-packet).
//
// The boot cells read a STABILIZED boot state (the reader below waits for two
// consecutive agreeing samples, spanning the reflexive refit). The floor is
// read IN PAGE through the service's own machinery (`cullZoom()` — the field
// fitView's untouched tail re-bases from the boot posture's own zoom) and the
// mirrored constants reproduce the service's numbers below — never asserted
// spec-magic (R1; the label-culling spec's standing constant-mirror
// convention). The R23 law: the pin is asserted by in-box content
// (rendered position), never a zoom-delta proxy.

/** The boot-posture reader's additional hook surface (src/app/app.ts). */
interface BootHook {
  zoom(): number;
  cullZoom(): number;
  nodeHasClass(id: string, cls: string): boolean;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeLabels(): string[];
  bootMapless(): boolean;
}

/** Mirror of the service's LABEL_CULL_FACTOR (graph.service.ts, B-113) — the
 * floor derivation un-undoes it from the machinery's own live threshold. */
const LABEL_CULL_FACTOR_MIRROR = 0.6;

/** Mirror of the service's BOOT_OVER_ZOOM_CAP (graph.service.ts, B-142). */
const BOOT_OVER_ZOOM_CAP_MIRROR = 2.5;

const CULL_CLASS = 'tme-cull-labels';
const BOOT_PIN_ID = 'emiya-residence';

/**
 * Every node projected for FX1's first layer (13 leaves + 2 districts,
 * data/worlds/fuyuki.ts) plus the B-107 badge pseudo-node — the hygiene pin
 * (d) calling below sweeps ALL of them, so a cull leak onto any single node
 * fails the cell (the label-culling.e2e-spec.ts list convention).
 */
const BOOT_PROBE_IDS: readonly string[] = [
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
  'tme-badge-arc-fuyuki-station-misaki-town',
];

/** B-124's harness registry demo — the cap's tooth boots it: a small world
 * (two layers, four leaves) whose phone world-fit is already ≈1, so the
 * sanctioned floor derivation exceeds the cap and lands AT it, bit-exact. */
const CAP_DEMO_PIN_ID = 'vale-gate';
const CAP_DEMO_PROBE_IDS: readonly string[] = [
  'vale-gate',
  'high-pasture',
  'old-mill',
  'coast-lighthouse',
];
const CAP_DEMO_LABEL = 'Vale Gate';

interface BootState {
  zoom: number;
  cullZoom: number;
  pinClass: boolean;
  pinRendered: { x: number; y: number } | null;
  culled: string[];
  canvas: { w: number; h: number };
  labels: string[];
  mapless: boolean;
}

/**
 * The stabilized boot state: the narrow boot settles over TWO fits (mount +
 * the reflexive initial ResizeObserver refit, ~150–250 ms apart on WebKit),
 * so this reader returns only after two consecutive agreeing samples
 * (50 ms apart, bounded) — the R23 in-box-content law, applied to the boot.
 * One reader for every boot cell: the FX1 boot, the mapless boot (all pin
 * reads degrade to null/false there — the projection holds no pin) and the
 * registry-demo boot (a different pin id) all shape it via arguments.
 */
const readStableBootState = (page: Page, probeIds: readonly string[], pinId: string): Promise<BootState> =>
  page.evaluate(
    async ({ pin, probeIds, cullClass }: { pin: string; probeIds: readonly string[]; cullClass: string }): Promise<BootState> => {
      const hook = (window as unknown as { __TME_E2E__?: BootHook }).__TME_E2E__;
      if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
      const snap = (): BootState => {
        const canvas = document.querySelector('[data-testid="tme-canvas"]');
        const box = canvas === null ? { width: 0, height: 0 } : canvas.getBoundingClientRect();
        return {
          zoom: hook.zoom(),
          cullZoom: hook.cullZoom(),
          pinClass: hook.nodeHasClass(pin, 'tme-pin'),
          pinRendered: hook.nodeRenderedPosition(pin),
          culled: probeIds.filter((id) => hook.nodeHasClass(id, cullClass)),
          canvas: { w: box.width, h: box.height },
          labels: hook.nodeLabels(),
          mapless: hook.bootMapless(),
        };
      };
      let prev = snap();
      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const next = snap();
        if (JSON.stringify(prev) === JSON.stringify(next)) return next;
        prev = next;
      }
      return prev;
    },
    { pin: pinId, probeIds, cullClass: CULL_CLASS },
  );

test.describe('phone boot posture (PKG B-142, REPAIRS R-2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
  });

  // (a) pin present and rendered · (b) zoom ≥ the label-survival floor read
  // in-page · (c) the pin within the middle half of the stage on BOTH axes ·
  // (d) the machinery hygiene pin: no tme-cull-labels class anywhere at the
  // boot posture (B-113's intended no-cull-at-a-default-view behavior, not
  // the floor's referee).
  test('phone: boots pin-centered at the label-survival floor, labels un-culled (F09 wayfinding, §R2)', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'phone', 'the posture belongs to the narrow layout');
    const boot = await readStableBootState(page, BOOT_PROBE_IDS, BOOT_PIN_ID);

    // (a) The pin IS projected and rendered.
    expect(boot.pinClass).toBe(true);
    expect(boot.pinRendered).not.toBeNull();

    // (b) zoom ≥ the label-survival floor — the machinery's own live cullZoom
    // un-undone by the mirrored factor (the floor is service-derived, R1).
    const floor = boot.cullZoom / LABEL_CULL_FACTOR_MIRROR;
    expect(boot.zoom).toBeGreaterThanOrEqual(floor - 1e-9);

    // (c) The pin's rendered position sits in the stage's middle half on BOTH
    // axes (the posture centers it exactly; ±1 px of integer-pan tolerance).
    const pin = boot.pinRendered as { x: number; y: number };
    expect(pin.x).toBeGreaterThanOrEqual(boot.canvas.w * 0.25 - 1);
    expect(pin.x).toBeLessThanOrEqual(boot.canvas.w * 0.75 + 1);
    expect(pin.y).toBeGreaterThanOrEqual(boot.canvas.h * 0.25 - 1);
    expect(pin.y).toBeLessThanOrEqual(boot.canvas.h * 0.75 + 1);

    // (d) Hygiene: NO node (map content, pin or cross-layer badge) carries
    // the cull class at the boot posture.
    expect(boot.culled).toEqual([]);
  });

  // (e) Desktop boot UNCHANGED: the wide layout never arms the posture — the
  // boot stays today's plain world fit. The plain-fit identity (cullZoom is
  // exactly zoom × 0.6 by fitView's untouched tail) plus the pin NOT centered
  // (the world fit centers the whole world; FX1's pin is off-center on at
  // least one axis by far more than a posture's 0 px) prove no posture ran.
  test('desktop: boot stays the plain world fit — byte-identical boot viewport (D81 wide, §R2)', async ({ page }) => {
    test.skip(test.info().project.name === 'phone', 'desktop-only assertion');
    const boot = await readStableBootState(page, BOOT_PROBE_IDS, BOOT_PIN_ID);
    expect(boot.pinRendered).not.toBeNull();
    expect(boot.zoom).toBeCloseTo(boot.cullZoom / LABEL_CULL_FACTOR_MIRROR, 12);
    const pin = boot.pinRendered as { x: number; y: number };
    const offCenter =
      Math.abs(pin.x - boot.canvas.w / 2) > boot.canvas.w * 0.02 ||
      Math.abs(pin.y - boot.canvas.h / 2) > boot.canvas.h * 0.02;
    expect(offCenter).toBe(true);
  });

  // (f) Mapless boot unchanged (D40, both viewports): no loadMap ran, the
  // canvas is empty — fitView takes its no-fit branch (cy never gets a
  // viewport write, so the zoom stays the constructor default and cullZoom
  // the never-cull default, B-113 ruling 1's empty-canvas arm) and the
  // posture's pin gate refuses (mapless holds no pin at all).
  test('mapless boot (?map=none) unchanged: empty canvas, constructed zoom, never-cull threshold (D40)', async ({ page }) => {
    await page.goto('/?map=none');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    const mapless = await readStableBootState(page, BOOT_PROBE_IDS, BOOT_PIN_ID);
    expect(mapless.mapless).toBe(true);
    expect(mapless.labels).toEqual([]);
    expect(mapless.pinClass).toBe(false);
    expect(mapless.pinRendered).toBeNull();
    // The constructor default zoom (no fit ran; the posture gate refused) and
    // the never-cull threshold (fitView's empty-canvas arm — B-113 ruling 1):
    // both are the machinery's own standing values, zero spec-magic.
    expect(mapless.zoom).toBe(1);
    expect(mapless.cullZoom).toBe(0);
    expect(mapless.culled).toEqual([]);
  });

  // The over-zoom cap's ONE tooth: on the registry-demo's small world the
  // phone world-fit (≈1) × (1/0.6)² (≈2.8) exceeds the cap, so the sanctioned
  // min() takes the cap branch — bit-exact — and the boot still centers the
  // pin (plus the same hygiene pin) at that clamped level.
  test('phone: the over-zoom cap bites on the small registry-demo world (B-142 cap constant, ?map=registry-demo boot)', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'the posture belongs to the narrow layout');
    await page.goto('/?map=registry-demo');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    const boot = await readStableBootState(page, CAP_DEMO_PROBE_IDS, CAP_DEMO_PIN_ID);
    expect(boot.labels).toContain(CAP_DEMO_LABEL);
    expect(boot.pinClass).toBe(true);
    // The cap branch: the floor derivation's result exceeds BOOT_OVER_ZOOM_CAP
    // on this world, so the posture lands AT the cap, bit-exact (the mirror).
    expect(boot.zoom).toBe(BOOT_OVER_ZOOM_CAP_MIRROR);
    // And the clamped boot keeps the same in-box guarantees:
    expect(boot.zoom).toBeGreaterThanOrEqual(boot.cullZoom / LABEL_CULL_FACTOR_MIRROR - 1e-9);
    const pin = boot.pinRendered as { x: number; y: number };
    expect(pin.x).toBeGreaterThanOrEqual(boot.canvas.w * 0.25 - 1);
    expect(pin.x).toBeLessThanOrEqual(boot.canvas.w * 0.75 + 1);
    expect(pin.y).toBeGreaterThanOrEqual(boot.canvas.h * 0.25 - 1);
    expect(pin.y).toBeLessThanOrEqual(boot.canvas.h * 0.75 + 1);
    expect(boot.culled).toEqual([]);
  });
});
