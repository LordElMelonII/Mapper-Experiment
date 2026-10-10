// tests/e2e/toolbelt-shell.e2e-spec.ts — PKG B-D1 (R29,
// docs/ui-restyle/PROPOSAL-D-STRUCTURAL.md §2.1): the >=1024px SHELL — the
// wide editor rail becomes the 56px vertical ICON TOOLBELT, the mode
// toggle and the per-layer dim migrate to the HEADER band (dual-home:
// exactly one instance per testid per rendered regime), the keyboard
// package gains 1/2/3 tool keys beside R-8's rehoused +/-/0, and the
// 700–1023px medium band keeps today's wide chrome byte-for-byte.
//
// DESKTOP PROJECT ONLY (the round's letter: the shell is the wide regime's
// chrome; the phone project skips every cell — its corpus passes untouched
// by the D-1 law, and a phone-arm change here would be a defect).
//
// Cited IDs:
//   PROPOSAL-D §2.1 — the shell under test: 56px toolbelt column, 24px
//              glyphs on >=44px hit targets (the parity floor is hit-SIZE,
//              not glyph size), labeled tooltips on hover, the mode toggle
//              + save dock in the header (the save dock already lives
//              there, B-116), the keyboard package (1/2/3 tools, R-8's
//              +/-/0 rehoused), hover affordances on (hover: hover)
//              devices only.
//   R29 rulings 1/2 — 1024px is a NEW third regime (<700 phone · 700–1023
//              today's wide chrome · >=1024 the shell); the dual-home
//              elements render ONE instance per regime through the service
//              shellWide matchMedia signal, so testids stay unique in
//              every rendered tree (phone locators never go ambiguous).
//   D81     — the 700px breakpoint stays the viewport-behavior authority;
//              the shell query is chrome-only, never a resize class.
//   F52/D53 — every belt control >= 44x44 in BOTH dimensions (floors hold
//              in the live DOM at the shell viewport, the B-114 sweep
//              discipline scoped to the belt); nothing depends on hover.
//   R-8     — the keyboard families rehomed, not re-implemented: the
//              canvas-host guards (form-field focus, host containment)
//              verbatim; +/-/0 still answer (one regression cell).
//   C23     — aria-labels carry the old plain words; glyphs never speak.
//   R1/D2   — the e2e hook stays read-only (the __TME_E2E__ discipline);
//              expected zoom steps are computed from live reads.
//
// Aiming/hover discipline: belt chrome is driven through Playwright
// locators (click/hover — real pointer events, so the (hover:hover)
// media fence matches); the CSS tooltip is asserted through the CSSOM
// (getComputedStyle ::after content) — a pseudo-element has no DOM node;
// every post-resize read waits the two-rAF settle (the arc-panel
// precedent).
import { expect, test, type Page } from '@playwright/test';

interface TmeE2EHook {
  zoom(): number;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

const isPhone = (): boolean => test.info().project.name === 'phone';

/** The round's letter: the shell is the wide regime's chrome; phone skips. */
const skipOnPhone = (): void => {
  if (isPhone()) test.skip(true, 'the toolbelt shell is the >=1024px regime (desktop project)');
};

/** FX1 facts (data/worlds/fuyuki.ts) the cells engineer against. */
const FUYUKI_BUTTON = 'tme-layer-layer-fuyuki';
/** The desktop project's viewport (devices['Desktop Chrome']): 1280x720 — the shell regime. */
const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
/** The medium band (700–1023): today's wide chrome, byte-for-byte (R29 ruling 1). */
const MEDIUM_VIEWPORT = { width: 900, height: 720 };

const readZoom = (page: Page): Promise<number> =>
  page.evaluate((): number => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.zoom();
  });

/** Housekeeping (the D81 pattern): console errors/warnings/pageerrors. */
const collectConsole = (page: Page): string[] => {
  const bad: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));
  return bad;
};

/**
 * Wait two animation frames — the medium-band flip re-render and any
 * resize-classified settle land before the next paint (the arc-panel
 * precedent).
 */
const settle = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

/**
 * The belt's swept controls: every VISIBLE button/input inside the rail
 * host (the B-114 tap-target sweep discipline, scoped to the belt) —
 * enumerated by query, never by count, so a new belt control is swept
 * automatically.
 */
const beltControls = (page: Page): Promise<{ name: string; w: number; h: number }[]> =>
  page.evaluate((): { name: string; w: number; h: number }[] => {
    const rail = document.querySelector('tme-editor-rail');
    if (rail === null) throw new Error('rail host not rendered');
    const out: { name: string; w: number; h: number }[] = [];
    for (const el of Array.from(rail.querySelectorAll<HTMLElement>('button, input'))) {
      const box = el.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) continue; // display:none (the retired rail toggle)
      out.push({
        name: el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? el.tagName.toLowerCase(),
        w: box.width,
        h: box.height,
      });
    }
    return out;
  });

test.describe('the >=1024px toolbelt shell (PKG B-D1, R29 / PROPOSAL-D §2.1)', () => {
  test.beforeEach(async ({ page }) => {
    skipOnPhone();
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => window.innerWidth))
      .toBeGreaterThanOrEqual(1024); // the shell regime is live at this viewport
  });

  test('belt geometry: the rail is the 56px column; every belt control >= 44x44; the icon set carries honest words (PROPOSAL-D §2.1, F52/D53, C23)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);

    // The 56px column (map-viewer's >=1024 flex-basis; ~1px render slack).
    const rail = await page.getByTestId('tme-rail').boundingBox();
    expect(rail, 'the rail host is visible').not.toBeNull();
    expect(Math.abs(rail!.width - 56), 'the belt column is 56px wide').toBeLessThanOrEqual(1);

    // The view-mode belt: Route, Layers, Maps, Legend, the zoom cluster.
    const viewIds = [
      'tme-route-toggle',
      'tme-layers-tool',
      'tme-maps-toggle',
      'tme-legend-toggle',
      'tme-zoom-in',
      'tme-zoom-out',
      'tme-zoom-fit',
    ];
    for (const testId of viewIds) {
      await expect(page.getByTestId(testId), `${testId} renders in the belt`).toBeVisible();
    }

    // Honest words on the icons (C23 — the old labels, never machine
    // names) and honest pressed states (aria-pressed present, mirroring
    // the signals; the exact bool is state, the presence is the contract).
    const labeled = [
      ['tme-route-toggle', 'Route'],
      ['tme-layers-tool', 'Layers'],
      ['tme-maps-toggle', 'Maps'],
      ['tme-zoom-fit', 'Fit'],
    ] as const;
    for (const [testId, word] of labeled) {
      const loc = page.getByTestId(testId);
      await expect(loc, `${testId} carries its plain word (C23)`).toHaveAttribute('aria-label', word);
      await expect(loc, `${testId} carries the native title`).toHaveAttribute('title', word);
    }
    for (const testId of ['tme-route-toggle', 'tme-layers-tool', 'tme-maps-toggle']) {
      await expect(page.getByTestId(testId)).toHaveAttribute('aria-pressed', /^(true|false)$/);
    }

    // The belt sweep: every visible control in the rail >= 44x44 (F52).
    const sweptView = await beltControls(page);
    expect(sweptView.length, 'the view belt enumerated controls (no vacuous sweep)').toBeGreaterThanOrEqual(7);
    for (const control of sweptView) {
      expect(control.w, `${control.name} width >= 44px (F52 — hit-SIZE is the floor)`).toBeGreaterThanOrEqual(44);
      expect(control.h, `${control.name} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }

    // Editor mode: the three tool icons join the belt with their words
    // and their pressed states — the floors asserted on the boxes.
    await page.getByTestId('tme-editor-toggle').click();
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
    const tools = [
      ['tme-tool-node', 'Node'],
      ['tme-tool-waypoint', 'Waypoint'],
      ['tme-tool-arc', 'Arc'],
    ] as const;
    for (const [testId, word] of tools) {
      const loc = page.getByTestId(testId);
      await expect(loc, `${testId} renders in the belt`).toBeVisible();
      await expect(loc, `${testId} carries its plain word (C23)`).toHaveAttribute('aria-label', word);
      await expect(loc, `${testId} carries the native title`).toHaveAttribute('title', word);
      await expect(loc).toHaveAttribute('aria-pressed', /^(true|false)$/);
      const box = await loc.boundingBox();
      expect(box, `${testId} has a box`).not.toBeNull();
      expect(box!.width, `${testId} width >= 44px (the packet's floor cell)`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `${testId} height >= 44px (the packet's floor cell)`).toBeGreaterThanOrEqual(44);
    }
    // The entry default: the Node tool is the pressed one (D76).
    await expect(page.getByTestId('tme-tool-node')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tme-tool-waypoint')).toHaveAttribute('aria-pressed', 'false');

    // The divider: the Layers tool carries the belt's Route|Layers
    // separation — an honest visual gap, asserted as vertical spacing
    // between the two buttons (no overlap, Layers below Route).
    const routeBox = await page.getByTestId('tme-route-toggle').boundingBox();
    const layersBox = await page.getByTestId('tme-layers-tool').boundingBox();
    expect(layersBox!.y, 'Layers sits below Route (the divider band)').toBeGreaterThanOrEqual(
      routeBox!.y + routeBox!.height,
    );

    // The collapsed rail chrome is retired: the toggle is display:none
    // (in the DOM, not focusable, zero box).
    const railToggle = page.getByTestId('tme-rail-toggle');
    await expect(railToggle).toHaveCount(1);
    await expect(railToggle).not.toBeVisible();

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('tooltips: the native title stands; the CSS tooltip renders ONLY under hover — never statically, never on a non-hover pass (PROPOSAL-D §2.1, D53)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);

    // The environment fence: this desktop project is a (hover: hover) and
    // (pointer: fine) device — the ONLY world where the tooltip CSS applies.
    expect(
      await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches),
      'the desktop project is the hover+fine regime',
    ).toBe(true);

    // Before any hover: NO tooltip renders (the fence — the pseudo exists
    // only while :hover matches; a statically-rendered tooltip would fail
    // this and would ship layout risk to every pass).
    const contentOf = (testId: string): Promise<string> =>
      page.evaluate(
        (id): string => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          if (el === null) throw new Error(`${id} not rendered`);
          return getComputedStyle(el, '::after').content;
        },
        testId,
      );
    expect(await contentOf('tme-route-toggle'), 'no tooltip before hover').toBe('none');
    expect(await contentOf('tme-layers-tool'), 'no tooltip before hover').toBe('none');

    // Under hover: the CSS tooltip renders — content pulled from data-tip
    // (the plain word), positioned right of the belt (absolute — zero
    // layout shift by construction; asserted via the computed position).
    const route = page.getByTestId('tme-route-toggle');
    await route.hover();
    expect(await contentOf('tme-route-toggle'), 'the tooltip renders under hover').toContain('Route');
    const pos = await page.evaluate((): { afterLeft: number; buttonRight: number } => {
      const el = document.querySelector('[data-testid="tme-route-toggle"]')!;
      const cs = getComputedStyle(el, '::after');
      const rect = el.getBoundingClientRect();
      // left: calc(100% + 0.625rem) resolves against the button's box.
      return { afterLeft: parseFloat(cs.left), buttonRight: rect.width };
    });
    expect(pos.afterLeft, 'the tooltip sits right of the button (zero layout shift)').toBeGreaterThan(
      pos.buttonRight,
    );

    // Hover gone ⇒ the tooltip is gone (the fence's other edge).
    await page.mouse.move(0, 0);
    await settle(page);
    expect(await contentOf('tme-route-toggle'), 'the tooltip is gone without hover').toBe('none');

    // A belt tool button (the editor family): the same contract. The tool
    // group commits on the zoneless CD tick AFTER the toggle click — wait
    // for it before the DOM read (the keyboard cell's own toBeVisible
    // idiom; without it the read races the commit and the querySelector
    // throws 'not rendered' — flaked 2-for-2 on the first attempt).
    await page.getByTestId('tme-editor-toggle').click();
    const waypoint = page.getByTestId('tme-tool-waypoint');
    await expect(waypoint).toBeVisible();
    expect(await contentOf('tme-tool-waypoint'), 'no tooltip before hover (tools)').toBe('none');
    await waypoint.hover();
    expect(await contentOf('tme-tool-waypoint'), 'the tool tooltip renders under hover').toContain('Waypoint');

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('keyboard 1/2/3: the canvas-host keys pick the tools; a focused input eats them; view mode ignores them (PROPOSAL-D §2.1, R-8 guards verbatim)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);

    // Editor on (the header home — the dual-home cell below owns the
    // placement assert); the tools render; the canvas takes focus.
    await page.getByTestId('tme-editor-toggle').click();
    await expect(page.getByTestId('tme-tool-node')).toBeVisible();
    const canvas = page.getByTestId('tme-canvas');
    await canvas.focus();

    // 2 -> Waypoint (aria-pressed is the honest state, R3).
    await page.keyboard.press('2');
    await expect(page.getByTestId('tme-tool-waypoint')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tme-tool-node')).toHaveAttribute('aria-pressed', 'false');

    // 1 -> Node; 3 -> Arc (each flips the segmented control's writer).
    await page.keyboard.press('1');
    await expect(page.getByTestId('tme-tool-node')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('3');
    await expect(page.getByTestId('tme-tool-arc')).toHaveAttribute('aria-pressed', 'true');

    // A focused form field eats its own keys (the R-8 guard): open the
    // Maps panel, focus its create input, press 1 — the input's content,
    // never the canvas (the tool stays Arc).
    await page.getByTestId('tme-maps-toggle').click();
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible();
    await page.getByTestId('tme-maps-create-input').focus();
    await page.keyboard.press('1');
    await expect(page.getByTestId('tme-maps-create-input')).toHaveValue('1');
    await expect(page.getByTestId('tme-tool-arc'), 'the input ate the key (C32 guard)').toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape'); // close the panel (its own Escape path)
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden();

    // View mode ignores 1/2/3 (like arrows — the tool control never
    // renders there, D76): exit, focus the canvas, press the trio — the
    // mode stays off, the tools stay unrendered, nothing throws (C32).
    await canvas.focus();
    await page.getByTestId('tme-editor-toggle').click();
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('tme-editor-tools')).toHaveCount(0);
    await canvas.focus();
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await page.keyboard.press('3');
    await expect(page.getByTestId('tme-editor-toggle'), 'view mode stands (keys ignored)').toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByTestId('tme-editor-tools'), 'the tools never render in view mode').toHaveCount(0);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('the R-8 zoom keys still answer from the focused canvas: + steps ×1.25, 0 fits (R-8 rehoused, R1/D2)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);
    const zoom0 = await readZoom(page); // the desktop boot IS the world fit

    await page.getByTestId('tme-canvas').focus();
    await page.keyboard.press('+');
    await expect
      .poll(async () => (await readZoom(page)) / (zoom0 * 1.25), 'one + steps in ×1.25 (the trio\'s own seam)')
      .toBeCloseTo(1, 6);
    await page.keyboard.press('+');
    await expect
      .poll(async () => (await readZoom(page)) / (zoom0 * 1.25 ** 2), 'a second + stacks')
      .toBeCloseTo(1, 6);
    await page.keyboard.press('0');
    await expect
      .poll(async () => (await readZoom(page)) / zoom0, "'0' restores the fit (the one fit site)")
      .toBeCloseTo(1, 6);

    expect(bad, 'console clean (housekeeping — the seams write no signals, D2)').toEqual([]);
  });

  test('dual-home: the mode toggle and the dim render in the HEADER at >=1024; their rail homes are ABSENT from the DOM (R29 ruling 2)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);

    // ONE instance of the mode toggle in the whole tree — and it lives in
    // the header band.
    const toggle = page.getByTestId('tme-editor-toggle');
    await expect(toggle, 'the testid is unique in the rendered tree').toHaveCount(1);
    await expect(page.locator('.tme-header [data-testid="tme-editor-toggle"]')).toHaveCount(1);

    // The dim pill: the slider is visible in the header band; the rail
    // renders no dim block (the template gates — count 0, not CSS-hidden).
    await expect(page.locator('.tme-header [data-testid="tme-dim-slider"]')).toBeVisible();
    await expect(page.locator('tme-editor-rail [data-testid="tme-dim"]')).toHaveCount(0);
    await expect(page.locator('tme-editor-rail [data-testid="tme-dim-slider"]')).toHaveCount(0);

    // The header home WORKS: the pill toggles editor mode through the one
    // service write path (the pressed state + the tools' appearance).
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tme-tool-node')).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('tme-tool-node')).toHaveCount(0);

    // The F52 floor on the header homes (the sweep enumerates them — the
    // same law on the new surface).
    for (const testId of ['tme-editor-toggle', 'tme-dim-slider']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box, `${testId} has a box`).not.toBeNull();
      expect(box!.width, `${testId} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `${testId} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('medium band: 900px keeps TODAY\'S wide rail — per-layer buttons, the collapse toggle, no belt-only Layers tool (R29 ruling 1)', async ({
    page,
  }) => {
    const bad = collectConsole(page);
    await settle(page);

    // Narrow into the 700–1023 band: the shell gates flip (matchMedia's
    // change listener — poll: the DOM follows the signal).
    await page.setViewportSize(MEDIUM_VIEWPORT);
    await expect(page.getByTestId(FUYUKI_BUTTON), 'the per-layer rail button returns (today\'s wide chrome)').toBeVisible();
    await expect(page.getByTestId('tme-rail-toggle'), 'the collapse toggle returns').toBeVisible();
    await expect(page.getByTestId('tme-layers-tool'), 'the belt-only Layers tool is ABSENT (template gate)').toHaveCount(0);

    // The dual-home pair flips homes too: the toggle returns to the RAIL,
    // the header copies leave the tree (still exactly one instance each).
    await expect(page.locator('tme-editor-rail [data-testid="tme-editor-toggle"]')).toBeVisible();
    await expect(page.locator('tme-editor-rail [data-testid="tme-dim"]')).toHaveCount(1);
    await expect(page.locator('.tme-header [data-testid="tme-editor-toggle"]')).toHaveCount(0);
    await expect(page.locator('.tme-header [data-testid="tme-dim"]')).toHaveCount(0);

    // The old wide column width stands (the 9.5rem basis — byte-for-byte
    // medium band; the shell never touches it below 1024).
    const rail = await page.getByTestId('tme-rail').boundingBox();
    expect(rail, 'the rail host is visible').not.toBeNull();
    expect(Math.abs(rail!.width - 152), 'the medium rail keeps the 9.5rem column').toBeLessThanOrEqual(1);

    // Widen back: the live listener restores the belt (the flip is
    // reversible — no reload needed).
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await expect(page.getByTestId('tme-layers-tool'), 'the belt returns at >=1024').toBeVisible();
    await expect(page.getByTestId(FUYUKI_BUTTON), 'the per-layer buttons leave again').toHaveCount(0);
    await expect(page.locator('.tme-header [data-testid="tme-dim-slider"]'), 'the dim returns to the header').toBeVisible();

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });

  test('focus reachability: every belt control takes focus in DOM order (the light cycle cell)', async ({ page }) => {
    const bad = collectConsole(page);
    await settle(page);

    // Light cell per the packet: each belt control is focusable (no
    // tabindex="-1", no display:none) and focus() lands on it — Tab can
    // walk the belt and reach the canvas (the canvas host carries
    // tabindex="0", the R-8 destination).
    const belt = [
      'tme-route-toggle',
      'tme-layers-tool',
      'tme-maps-toggle',
      'tme-legend-toggle',
      'tme-zoom-in',
      'tme-zoom-out',
      'tme-zoom-fit',
    ];
    for (const testId of belt) {
      await page.getByTestId(testId).focus();
      const focused = await page.evaluate(
        (id): boolean => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          return el !== null && document.activeElement === el;
        },
        testId,
      );
      expect(focused, `${testId} takes focus (focusable in DOM order)`).toBe(true);
    }

    // The canvas is focusable too (Tab's destination before the belt in
    // DOM order — the R-8 tabindex contract standing in the shell).
    await page.getByTestId('tme-canvas').focus();
    expect(
      await page.evaluate(() => document.activeElement === document.querySelector('[data-testid="tme-canvas"]')),
      'the canvas host takes focus (the R-8 destination)',
    ).toBe(true);

    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });
});
