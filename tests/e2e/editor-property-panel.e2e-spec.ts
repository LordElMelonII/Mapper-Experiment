// tests/e2e/editor-property-panel.e2e-spec.ts — PKG B-117: the F40 property
// panel (§5 Phase 3 M1) — rename, kind & parent (district) assignment,
// aliases, description, delete — proven at BOTH playwright projects (desktop
// + emulated phone with touch) per D53/F52 mobile-and-desktop parity.
//
// Cited IDs:
//   F40     — node editing: rename, re-kind, re-parent, alias, describe
//             (place/move are B-116's, already pinned).
//   F46     — no undo/multi-select/snapping: delete-and-redo IS the workflow
//             — Delete fires facade.removeNode directly, no confirm dialog.
//   F45/D75 — commits mark ONLY the core's dirty flag: the save dock lights
//             on the first commit, the canvas projection shows the edit
//             immediately (the editor surface is the author's truth), but
//             the header snapshot keeps serving the SAVED graph until
//             Save — the go-live discriminator this spec pins (renaming the
//             pin node flips tme-location only after Save).
//   C29/R2  — the panel binds a LOCAL DRAFT copy, never the live
//             MapNodeData; commits are whole-draft, one facade.upsertNode
//             (full-replace, id immutable) on the draft's close moments:
//             Done, selection change, panel close.
//   C30     — refusals throw MapValidationError with the collected
//             field-precise issues; the panel renders them user-visibly
//             (never console-only), the draft stays open, and the refusal
//             is console-silent (caught, nothing half-applied).
//   D21     — 'waypoint' is the runtime overlay origin, never offered as an
//             editor kind; the parent picker lists same-layer containers.
//   F07/§6.2 — re-parenting into a district renders the node inside the
//             compound box (projection parent + bounding box).
//   D10     — a refused draft is never dropped silently: the selection
//             re-points to the refused node so the author fixes or reverts.
//   F52/D53 — every new control is a >= 44px tap target, the whole journey
//             runs touch-alone at the phone viewport, console stays clean.
//
// FX1 facts (data/worlds/fuyuki.ts): 'outskirts' is a parentless location
// with many incident arcs (the re-kind refusal target); 'kotomine-church'
// carries alias 'church' and four projected edges incl. the harness curve
// demo edge (the delete cascade target); 'district-miyama' renders as
// Miyama's compound box; the pin is 'emiya-residence' (the header
// discriminator's rename target); arc-outskirts-einzbern-castle is the
// arc-panel spec's vetted midpoint tap target.
import { expect, test, type Locator, type Page, type Point } from '@playwright/test';

interface TmeE2EHook {
  nodeLabels(): string[];
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
  nodeParent(id: string): string | null;
  edgeIds(): string[];
  zoom(): number;
  pan(): { x: number; y: number };
  /** C5/D75: the selected node's id — placed nodes are never id-predicted. */
  selectedNodeId(): string | null;
  nodeData(id: string): {
    label: string;
    kind: string;
    parent: string | null;
    aliases: string[];
    description: string | null;
  } | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

const OUTSKIRTS_ID = 'outskirts';
const EMIYA_ID = 'emiya-residence';
const CHURCH_ID = 'kotomine-church';
const MIYAMA_ID = 'district-miyama';
const CASTLE_ID = 'einzbern-castle'; // isolated corner node — tap clearance at the squeezed phone fit

/** FX1 arc facts: the vetted midpoint tap target (arc-panel.e2e-spec.ts). */
const CASTLE_ARC = { source: OUTSKIRTS_ID, target: 'einzbern-castle' };

/** The editor chrome's top-right stack stays clear of this vetted point. */
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

const readBoundingBox = (
  page: Page,
  id: string,
): Promise<{ x: number; y: number; w: number; h: number } | null> =>
  page.evaluate(
    (nodeId): { x: number; y: number; w: number; h: number } | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeRenderedBoundingBox(nodeId);
    },
    id,
  );

const readEdgeIds = (page: Page): Promise<string[]> =>
  page.evaluate((): string[] => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.edgeIds();
  });

/** B-117: the projected `parent` of one node — the compound-box proof. */
const readNodeParent = (page: Page, id: string): Promise<string | null> =>
  page.evaluate(
    (nodeId): string | null => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeParent(nodeId);
    },
    id,
  );

/** B-117: the authored fields of one library node (the panel's data seam). */
const readNodeData = (page: Page, id: string): Promise<TmeE2EHook['nodeData']> =>
  page.evaluate(
    (nodeId): TmeE2EHook['nodeData'] => {
      const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
      if (hook === undefined) throw new Error(HOOK_ERROR);
      return hook.nodeData(nodeId);
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

/**
 * Wait two animation frames: panel open/close and the ResizeObserver-driven
 * re-fit (B-112) run just before the next paint — reads and gestures inside
 * that window would aim at stale coordinates (the settle precedent).
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

/** Enter editor mode and open the property panel for one FX1 node. */
const openPanelFor = async (page: Page, id: string): Promise<void> => {
  await activate(page.getByTestId('tme-editor-toggle'));
  await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'true');
  await tapPoint(page, await nodeScreenPoint(page, id));
  await expect(page.getByTestId('tme-property-panel')).toBeVisible();
};

test.describe('property panel: rename, kind & parent, aliases, description, delete (PKG B-117)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect.poll(() => readLabels(page)).toContain('Outskirts');
  });

  test('opens only in editor mode for a library-node selection; an edge selection shows the arc panel instead (B-106 mutual exclusion)', async ({
    page,
  }) => {
    const panel = page.getByTestId('tme-property-panel');

    // View mode: a node selection shows the chip, never the property panel.
    await tapPoint(page, await nodeScreenPoint(page, OUTSKIRTS_ID));
    await expect(page.getByTestId('tme-selection-chip')).toBeVisible();
    await expect(panel).toHaveCount(0);

    // Editor mode: the same selection opens the panel, seeded from the node.
    await activate(page.getByTestId('tme-editor-toggle'));
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('tme-node-label-input')).toHaveValue('Outskirts');

    // Editor exit hides the panel (a close moment — cell 7 pins its commit);
    // re-entering resumes it for the same selection.
    await activate(page.getByTestId('tme-editor-toggle'));
    await expect(panel).toHaveCount(0);
    await activate(page.getByTestId('tme-editor-toggle'));
    await expect(panel).toBeVisible();

    // An edge tap clears the node selection (B-106): the arc panel's slot —
    // the property panel is gone. Midpoint of the vetted castle arc.
    await settle(page);
    const a = await readRenderedPosition(page, CASTLE_ARC.source);
    const b = await readRenderedPosition(page, CASTLE_ARC.target);
    if (a === null || b === null) throw new Error('arc endpoints not rendered');
    const box = await page.getByTestId('tme-canvas').boundingBox();
    if (box === null) throw new Error('canvas host not visible');
    await tapPoint(page, {
      x: box.x + (a.x + b.x) / 2,
      y: box.y + (a.y + b.y) / 2,
    });
    await expect(page.getByTestId('tme-arc-panel')).toBeVisible();
    await expect(panel).toHaveCount(0);
  });

  test('rename commits on Done; the save dock lights; the header keeps the SAVED label until Save (F45/D75 discriminator)', async ({
    page,
  }) => {
    await openPanelFor(page, EMIYA_ID);
    const label = page.getByTestId('tme-node-label-input');
    await expect(label).toHaveValue('Emiya Residence');

    await label.fill('Emiya Home');
    await activate(page.getByTestId('tme-node-done'));

    // F45: the commit marked the map dirty — the dock lights; the canvas
    // projection (the editor surface) shows the new label immediately...
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect.poll(() => readLabels(page)).toContain('Emiya Home');
    // ...the authored node carries it (R2/R4 — one truth)...
    await expect.poll(async () => (await readNodeData(page, EMIYA_ID))?.label).toBe('Emiya Home');
    // ...and the panel re-seeded from the committed values.
    await expect(label).toHaveValue('Emiya Home');
    // F45's go-live discriminator: the header still serves the SAVED
    // snapshot — routing and the snapshot keep the old label until Save.
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Residence');

    // Save takes the edit live: the dock clears, the header re-reads.
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect(page.getByTestId('tme-location')).toHaveText('Emiya Home');
  });

  test('kind select commits a legal re-kind; an empty label refuses field-precise, draft intact, reverting recovers (C30/F46) — console-silent', async ({
    page,
  }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    await openPanelFor(page, OUTSKIRTS_ID);
    const kind = page.getByTestId('tme-node-kind');
    await expect(kind).toHaveValue('location');

    // The engine's leaf/container edge rule is STRUCTURAL (parent-based,
    // §6.2 — 'must be a leaf node' keys on actual parent references), so a
    // childless node with incident edges may legally re-kind to a container:
    // the panel submits one whole-draft command, the facade accepts, the
    // dock lights and the projection re-kinds. The packet's expected refusal
    // for exactly this case does not exist at the core (facade-editor spec
    // pins the refusal for a REAL compound parent's edge endpoint only) —
    // this cell pins the engine's actual answer (DEVIATION, B-117 report).
    await kind.selectOption({ label: 'District' });
    await activate(page.getByTestId('tme-node-done'));
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect(page.getByTestId('tme-node-errors')).toHaveCount(0);
    await expect.poll(async () => (await readNodeData(page, OUTSKIRTS_ID))?.kind).toBe('district');
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();

    // C30 through the fields path: label must be a non-empty string. The
    // refusal renders user-visibly with the precise field path, NOTHING is
    // committed (the dock stays hidden) and the draft stays open, untouched
    // (D10 — the author corrects in place).
    const label = page.getByTestId('tme-node-label-input');
    await label.fill('');
    await activate(page.getByTestId('tme-node-done'));
    await expect(page.getByTestId('tme-node-errors')).toBeVisible();
    await expect(page.getByTestId('tme-node-error').first()).toContainText('must be a non-empty string');
    await expect(page.getByTestId('tme-node-error').first()).toContainText('.label');
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect(label).toHaveValue('');

    // Restoring the saved value is the recovery: Done on the untouched draft
    // is a no-op that clears the refusal — and still commits nothing.
    await label.fill('Outskirts');
    await activate(page.getByTestId('tme-node-done'));
    await expect(page.getByTestId('tme-node-errors')).toHaveCount(0);
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();

    expect(bad, 'the C30 refusal is console-silent (caught, never half-applied)').toEqual([]);
  });

  test('re-parent into a district re-renders the node inside the compound box (F07/§6.2)', async ({ page }) => {
    await openPanelFor(page, OUTSKIRTS_ID);
    const parent = page.getByTestId('tme-node-parent');
    await expect(parent).toHaveValue('');

    await parent.selectOption({ label: 'Miyama' });
    await activate(page.getByTestId('tme-node-done'));

    // The commit went through (dock lights) and the projection carries the
    // new parent — the node renders inside Miyama's compound box.
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect.poll(() => readNodeParent(page, OUTSKIRTS_ID)).toBe(MIYAMA_ID);
    await settle(page);
    const box = await readBoundingBox(page, MIYAMA_ID);
    const pos = await readRenderedPosition(page, OUTSKIRTS_ID);
    if (box === null || pos === null) throw new Error('compound box or node not rendered');
    expect(pos.x).toBeGreaterThanOrEqual(box.x);
    expect(pos.x).toBeLessThanOrEqual(box.x + box.w);
    expect(pos.y).toBeGreaterThanOrEqual(box.y);
    expect(pos.y).toBeLessThanOrEqual(box.y + box.h);

    // F45: the saved graph still serves routing/the snapshot until Save.
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
  });

  test('alias add persists through the dirty/save cycle (F08 data plane — matching effects are Phase 4)', async ({
    page,
  }) => {
    await openPanelFor(page, CHURCH_ID);
    const inputs = page.getByTestId('tme-alias-input');
    await expect(inputs).toHaveCount(1); // FX1: 'church'
    await expect(inputs.first()).toHaveValue('church');

    await activate(page.getByTestId('tme-alias-add'));
    await expect(inputs).toHaveCount(2);
    await inputs.nth(1).fill('temple on the hill');
    await activate(page.getByTestId('tme-node-done'));

    // One whole-draft command: the authored node carries BOTH aliases —
    // asserted via the seam post-save (the dirty/save cycle below).
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(async () => (await readNodeData(page, CHURCH_ID))?.aliases).toEqual([
      'church',
      'temple on the hill',
    ]);
  });

  test('delete cascades incident edges, closes the panel and the chip — no confirm dialog (F46/D75)', async ({
    page,
  }) => {
    const dyingEdges = [
      'arc-kotomine-church-ghost-house',
      'arc-fuyuki-station-kotomine-church',
      'arc-outskirts-kotomine-church',
      'arc-harness-curve-demo', // the harness demo edge dies with its endpoint
    ];
    await expect.poll(() => readEdgeIds(page)).toEqual(expect.arrayContaining(dyingEdges));

    await openPanelFor(page, CHURCH_ID);
    await activate(page.getByTestId('tme-node-delete'));

    // Direct delete (F46): the node, its chip and its panel are gone; the
    // D75 cascade took every incident edge in both planes with it.
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
    await expect(page.getByTestId('tme-selection-chip')).toBeHidden();
    await expect.poll(async () => !(await readLabels(page)).includes('Kotomine Church')).toBe(true);
    await expect
      .poll(async () => readEdgeIds(page).then((ids) => dyingEdges.filter((edge) => ids.includes(edge))))
      .toEqual([]);

    // The delete was an edit: the dock lights; Save takes it live.
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await expect.poll(() => readNodeData(page, CHURCH_ID)).toBeNull();
  });

  test('close affordances commit the draft: chip dismiss and selection change (C29 draft-then-commit)', async ({
    page,
  }) => {
    await openPanelFor(page, OUTSKIRTS_ID);
    const label = page.getByTestId('tme-node-label-input');

    // Panel close (chip dismiss) commits the dirty draft — one command.
    await label.fill('The Outskirts');
    await activate(page.getByTestId('tme-selection-chip'));
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect.poll(() => readLabels(page)).toContain('The Outskirts');

    // Re-selecting resumes the committed value from the authored node.
    await tapPoint(page, await nodeScreenPoint(page, OUTSKIRTS_ID));
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    await expect(label).toHaveValue('The Outskirts');

    // A selection CHANGE commits too: the panel re-seeds for the new node —
    // the ISOLATED castle (clearance at the squeezed phone fit, where the
    // clustered Miyama children are a few px apart) — while the previous
    // edit lands (dock stays lit until Save).
    await label.fill('Outskirts End');
    await tapPoint(page, await nodeScreenPoint(page, CASTLE_ID));
    await expect(page.getByTestId('tme-node-label-input')).toHaveValue('Einzbern Castle');
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await expect.poll(() => readLabels(page)).toContain('Outskirts End');

    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
  });

  test('every new control meets the 44px tap-target floor (F52/D53)', async ({ page }) => {
    await openPanelFor(page, CHURCH_ID); // carries one seeded alias row
    for (const testid of [
      'tme-node-label-input',
      'tme-node-kind',
      'tme-node-parent',
      'tme-node-description',
      'tme-alias-input',
      'tme-alias-remove',
      'tme-alias-add',
      'tme-node-delete',
      'tme-node-done',
    ]) {
      const box = await page.getByTestId(testid).first().boundingBox();
      expect(box, `${testid} is on the touch surface`).not.toBeNull();
      expect(box?.height ?? 0, `${testid} height >= 44px (F52)`).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0, `${testid} width >= 44px (F52)`).toBeGreaterThanOrEqual(44);
    }
  });

  test('touch-alone authoring journey at the phone viewport keeps the harness console clean (§6.2/D53/F52)', async ({
    page,
  }) => {
    const bad: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));

    // Place: the editor background tap creates + selects a node; the panel
    // opens seeded with the C23 default label. The engine-assigned id is
    // read live (C5/D75) — the parent assertion below needs it.
    await activate(page.getByTestId('tme-editor-toggle'));
    await tapModelPoint(page, BG_MODEL_POINT);
    await expect(page.getByTestId('tme-property-panel')).toBeVisible();
    const label = page.getByTestId('tme-node-label-input');
    await expect(label).toHaveValue('New place');
    await expect.poll(readSelectedId.bind(null, page)).not.toBeNull();
    const placedId = await readSelectedId(page);
    if (placedId === null) throw new Error('placed node not selected (C5/D75 id discovery failed)');

    // Rename, re-parent, alias — one Done each, one command per commit.
    await label.fill('Crossroads');
    await activate(page.getByTestId('tme-node-done'));
    await expect(page.getByTestId('tme-save-dock')).toBeVisible();
    await page.getByTestId('tme-node-parent').selectOption({ label: 'Miyama' });
    await activate(page.getByTestId('tme-node-done'));
    await activate(page.getByTestId('tme-alias-add'));
    // The placed node seeds with NO aliases — the added row is the FIRST one.
    await page.getByTestId('tme-alias-input').first().fill('crossing');
    await activate(page.getByTestId('tme-node-done'));

    // The projection shows the authored truth: new label inside Miyama.
    await expect.poll(() => readLabels(page)).toContain('Crossroads');
    await expect.poll(() => readNodeParent(page, placedId)).toBe(MIYAMA_ID);

    // Save takes it live; the delete is one direct tap (F46), then save again.
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();
    await activate(page.getByTestId('tme-node-delete'));
    await expect(page.getByTestId('tme-property-panel')).toHaveCount(0);
    await expect.poll(() => readLabels(page)).not.toContain('Crossroads');
    await activate(page.getByTestId('tme-save'));
    await expect(page.getByTestId('tme-save-dock')).toBeHidden();

    // Exit editor — the journey's last control.
    await activate(page.getByTestId('tme-editor-toggle'));
    await expect(page.getByTestId('tme-editor-toggle')).toHaveAttribute('aria-pressed', 'false');

    expect(bad, 'no console errors/warnings/pageerrors during the journey').toEqual([]);
  });
});
