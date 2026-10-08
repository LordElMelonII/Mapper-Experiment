// tests/e2e/layers.e2e-spec.ts — PKG B-104: the FX1-structure proof matrix —
// compound district boxes, blocked-arc contrast across a layer round-trip,
// background presence/isolation, and first-paint determinism — at BOTH
// playwright projects (desktop + emulated phone with touch) per D53/F52.
//
// Cited IDs:
//   F01/D16 — one layer visible at a time: switching planes swaps the node
//             set completely; switching back restores the exact first paint.
//   F03/D69 — per-layer background: fitted + centered (object-fit contain
//             letterboxes aspect mismatch, §6.2 Layers), pointer-transparent
//             (the graph is always the interface on top), present on Fuyuki,
//             absent on Misaki (FX1 carries none — D69's harness placeholder
//             exercises layer-fuyuki only).
//   F07     — districts are compound containers: their rendered box CONTAINS
//             the children's rendered positions; the box never moves
//             coordinates (§6.2 Layers: coordinates unaffected).
//   C2      — the blocked arc stays DRAWN dashed across a layer round-trip
//             (excluded from routing, never hidden).
//
// Reads go through the DEV-HARNESS-ONLY window.__TME_E2E__ hook (app.ts):
// read-only projections of the cytoscape model; the ST entry never ships it.
import { expect, test, type Page } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  edgeLineStyle(id: string): string | null;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const readLabels = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeLabels();
  });

const readLineStyle = (page: Page, id: string): Promise<string | null> =>
  page.evaluate((edgeId): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.edgeLineStyle(edgeId);
  }, id);

const readPosition = (page: Page, id: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate((nodeId): { x: number; y: number } | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedPosition(nodeId);
  }, id);

const readBoundingBox = (page: Page, id: string): Promise<Box | null> =>
  page.evaluate((nodeId): Box | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error('window.__TME_E2E__ missing — dev harness not loaded');
    return hook.nodeRenderedBoundingBox(nodeId);
  }, id);

/** F52/D53: genuine tap on the touch-emulated project, click on desktop. */
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (test.info().project.name === 'phone') await locator.tap();
  else await locator.click();
};

/**
 * PKG B-142 (REPAIRS R-2) re-baseline: the phone boot now stages AT the pin
 * (the boot-posture zoom, the pin-centered viewport). This spec's cells pin
 * the determinism of the PRE-PACKET WORLD-FIT boot viewport (the round-trip
 * first-paint equality), so the phone cells restore exactly that viewport
 * first by tapping the rail's Fit — the packet's own "explicit full-world
 * ask" (§R2). Desktop never arms the posture (the wide gate mirrors D81's
 * 700px breakpoint), so its boot is byte-unchanged and this is a no-op. Aim
 * math and every assertion are untouched — the R23 in-box-content law stands
 * throughout.
 */
const restoreBootViewport = async (page: Page): Promise<void> => {
  if (test.info().project.name === 'phone') await page.getByTestId('tme-zoom-fit').tap();
};

// FX1 facts (data/worlds/fuyuki.ts): district-miyama parents exactly these six
// leaves; the blocked bridge arc; the pin.
const MIYAMA_CHILDREN = [
  'emiya-residence',
  'shopping-district',
  'homurahara-academy',
  'matou-residence',
  'tohsaka-residence',
  'ryuudou-temple',
] as const;
const BLOCKED_ARC = 'arc-emiya-residence-fuyuki-bridge';
const SOLID_ARC = 'arc-emiya-residence-shopping-district';
const PIN_NODE = 'emiya-residence';

const pointInside = (p: { x: number; y: number }, box: Box): boolean =>
  p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;

test.describe('layers & structures (PKG B-104)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await restoreBootViewport(page);
    // First paint is Fuyuki (loadMap's first layer) — the precondition every
    // test below builds on.
    await expect.poll(() => readLabels(page)).toContain('Emiya Residence');
  });

  test('district-miyama renders as a compound box containing its six leaves (F07, §6.2 Layers)', async ({
    page,
  }) => {
    const box = await readBoundingBox(page, 'district-miyama');
    // Assert-not-null without non-null assertions (strict lint).
    if (box === null) throw new Error('district-miyama not rendered');
    expect(box.w).toBeGreaterThan(0);
    expect(box.h).toBeGreaterThan(0);

    for (const child of MIYAMA_CHILDREN) {
      const pos = await readPosition(page, child);
      if (pos === null) throw new Error(`child ${child} not rendered`);
      // §6.2 Layers: the box groups and labels — the children's coordinates
      // are untouched by it; containment is geometric, in rendered px.
      expect(pointInside(pos, box), `${child} inside district-miyama's box`).toBe(true);
    }
  });

  test('blocked arc stays dashed across a layer round-trip; normal arc solid (C2)', async ({ page }) => {
    await expect.poll(() => readLineStyle(page, BLOCKED_ARC)).toBe('dashed');
    await expect.poll(() => readLineStyle(page, SOLID_ARC)).toBe('solid');

    await activate(page, 'tme-layer-layer-misaki');
    await expect.poll(readLabels.bind(null, page)).not.toContain('Emiya Residence');
    await activate(page, 'tme-layer-layer-fuyuki');
    // C2: the blocked bridge is STILL drawn dashed after the round-trip —
    // layer switching never drops or restyles it away from dashed.
    await expect.poll(() => readLineStyle(page, BLOCKED_ARC)).toBe('dashed');
    await expect.poll(() => readLineStyle(page, SOLID_ARC)).toBe('solid');
  });

  test('background: present + loaded on Fuyuki; pointer-transparent (F03/D69, §6.2)', async ({
    page,
  }) => {
    const bg = page.getByTestId('tme-bg');
    await expect(bg).toHaveCount(1);
    // naturalWidth > 0 proves the placeholder actually loaded.
    await expect
      .poll(() => bg.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    // (Fitted/centered letterboxing + pointer-events pins live in the
    // verifier's computed-style probe, verify-p2m1-seams.e2e-spec.ts — the
    // img's border box follows inset:0, so bounds-checking it here would be
    // trivially green; M1 verifier finding 3.)

    // F03: the graph is always the interface on top — pointer-events: none on
    // the image means a tap on a node OVER the image still selects the node.
    const pinPos = await readPosition(page, PIN_NODE);
    if (pinPos === null) throw new Error('pin node not rendered');
    const canvas = page.getByTestId('tme-canvas');
    const canvasAt = await canvas.boundingBox();
    if (canvasAt === null) throw new Error('canvas not visible');
    const tapPoint = { x: canvasAt.x + pinPos.x, y: canvasAt.y + pinPos.y };
    if (test.info().project.name === 'phone') await page.touchscreen.tap(tapPoint.x, tapPoint.y);
    else await page.mouse.click(tapPoint.x, tapPoint.y);
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
  });

  test('Misaki layer: no background element; Fuyuki labels gone (F01/D16 isolation, D69)', async ({
    page,
  }) => {
    await activate(page, 'tme-layer-layer-misaki');
    await expect(page.getByTestId('tme-bg')).toHaveCount(0); // FX1's Misaki carries none (D69)
    await expect.poll(readLabels.bind(null, page)).toContain('Misaki Town');
    await expect.poll(readLabels.bind(null, page)).not.toContain('Emiya Residence');
    // The cross-layer station arc is never drawn in M1 (C3 — its endpoints
    // are never both on the active layer); nothing dangling replaces it.
    const labels = await readLabels(page);
    expect(labels).toHaveLength(1); // FX1's Misaki layer holds exactly one node
  });

  test('round-trip back to Fuyuki restores the exact first paint (F01, F19)', async ({ page }) => {
    const before = await readPosition(page, PIN_NODE);
    if (before === null) throw new Error('pin node not rendered');

    await activate(page, 'tme-layer-layer-misaki');
    await expect.poll(readLabels.bind(null, page)).toContain('Misaki Town');
    await activate(page, 'tme-layer-layer-fuyuki');
    await expect.poll(readLabels.bind(null, page)).toContain('Emiya Residence');

    // Preset layout is deterministic from authored positions (F19) — the pin
    // renders at the same pixel as the first paint (viewport re-fit aside,
    // the same layer yields the same fit).
    const after = await readPosition(page, PIN_NODE);
    if (after === null) throw new Error('pin node not rendered after round-trip');
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });
});
