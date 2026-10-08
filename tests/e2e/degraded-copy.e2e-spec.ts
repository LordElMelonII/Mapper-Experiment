// tests/e2e/degraded-copy.e2e-spec.ts — PKG B-144 (REPAIRS.md §R4, ghost
// punctuation): the DEGRADED-STATE COPY contract — no newcomer ever meets
// typographic debris at the exact moments they are lost. Runs under BOTH
// playwright projects (desktop + emulated phone with touch) per D53/F52 —
// the header and the hint are viewport-independent chrome, so every cell
// asserts the IDENTICAL render at both breakpoints (the parity law's
// strictest form: byte-identical, not merely present).
//
// Cited IDs:
//   §R4      — the ruling this file teeths: the header triplet collapses
//              empty segments (separators render only between present
//              values) and every "empty half of a sentence" state renders a
//              full sentence naming the missing thing and the action.
//   R-3      — the sentence family landed for the route-origin degrade
//              (tme-empty-origin); the pinless hint below reuses its voice
//              and its exact predicate so the two surfaces never disagree.
//   R1       — every rendered value is the snapshot's own string, verbatim;
//              the fresh map's unit word is READ IN-PAGE through the
//              __TME_E2E__ hook (never a spec-magic string).
//   C32      — the degraded states render honest emptiness/sentences, never
//              throws; console stays clean through every cell.
//   D40      — the mapless boot (?map=none, picker auto-opens) and the
//              loaded-map-starts-with-NO-pin rule (the cheapest pinless
//              staging — no canvas gesture needed at all).
//   D79      — the fresh map's createWorldMap defaults (1 px = 1 unit) and
//              the one-time calibrate hint pill, which this spec TOLERATES
//              beside the header (a stage sibling, never inside it — D79's
//              one-time contract is not weakened).
//   C23      — the sentences name user-facing things only (the party, the
//              pin, the map), never machine ids.
//
// Structure: a NEW file — the four cells cut across the canvas (header),
// maps-library (create/open flows) and sheet-panel (hint visibility)
// surfaces; no existing describe fits them all, and one ruling-named file
// keeps §R4 assertable as a unit.
import { expect, test, type Page } from '@playwright/test';

interface TmeE2EHook {
  snapshotUnit(): string | null;
}

const HOOK_ERROR = 'window.__TME_E2E__ missing — dev harness not loaded';

/** FX1 authored facts (data/worlds/fuyuki.ts) — assertion keys per the
 * canvas-spec convention: authored fixture strings, never engine output. */
const EMIYA_LABEL = 'Emiya Residence';
const PIN_LAYER_NAME = 'Fuyuki City';
const SEEDED_NAME = 'Fuyuki & Misaki (FX1)';

const isPhone = (): boolean => test.info().project.name === 'phone';

// page.evaluate callbacks are SERIALIZED: the hook lookup is inlined in each
// one and every read happens IN the browser context (the discipline every
// other spec follows).

/** The header's rendered text, whitespace-normalized — the §R4 read: what a
 * user actually reads, separators included. */
const readHeaderText = (page: Page): Promise<string> =>
  page.evaluate((): string => {
    const header = document.querySelector('[data-testid="tme-header"]');
    if (header === null) throw new Error('tme-header missing');
    return (header.textContent ?? '').replace(/\s+/g, ' ').trim();
  });

/** R1: the snapshot's cost-unit word read as DATA through the app's own
 * seam — never hardcoded in the spec. Null when mapless. */
const readSnapshotUnit = (page: Page): Promise<string | null> =>
  page.evaluate((): string | null => {
    const hook = (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__;
    if (hook === undefined) throw new Error(HOOK_ERROR);
    return hook.snapshotUnit();
  });

/** F52/D53: one activation path for DOM controls on every project. */
const activate = async (page: Page, testId: string): Promise<void> => {
  const locator = page.getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/** One library row control, addressed by its authored map NAME (C23 — the
 * maps-library spec's exact-match row helper: never an id, never a
 * substring). */
const escapeRe = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rowActivate = async (page: Page, name: string, testId: string): Promise<void> => {
  const locator = page
    .locator('[data-testid="tme-map-row"]')
    .filter({
      has: page.getByTestId('tme-map-name').filter({ hasText: new RegExp(`^${escapeRe(name)}$`) }),
    })
    .getByTestId(testId);
  if (isPhone()) await locator.tap();
  else await locator.click();
};

/** Housekeeping: collect console errors/warnings/pageerrors (the D81 pattern). */
const collectConsole = (page: Page): string[] => {
  const bad: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') bad.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => bad.push(`pageerror: ${err.message}`));
  return bad;
};

test.describe('degraded-state copy (PKG B-144, REPAIRS R-4)', () => {
  test('mapless boot: the header carries no dangling separators (§R4, D40)', async ({ page }) => {
    const bad = collectConsole(page);
    await page.goto('/?map=none');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible(); // the auto-opened picker (D40)

    // The §R4 collapse: three EMPTY value spans, ZERO separators — the
    // pre-packet render was "· ·" (two separators around empty spans).
    expect(await readHeaderText(page), 'the mapless header is fully empty').toBe('');
    await expect(page.getByTestId('tme-header')).not.toContainText('·');

    // The value spans keep their DOM presence in every state (the per-span
    // contract the mapped-state specs assert).
    await expect(page.getByTestId('tme-location')).toHaveText('');
    await expect(page.getByTestId('tme-snapshot-layer')).toHaveText('');
    await expect(page.getByTestId('tme-unit')).toHaveText('');
    expect(await readSnapshotUnit(page), 'mapless: no snapshot, no unit').toBeNull();
    expect(bad, 'console clean through the mapless state (C32)').toEqual([]);
  });

  test('fresh map (D79 create): the header renders the unit alone, no separator debris (§R4, R1)', async ({ page }) => {
    const bad = collectConsole(page);
    await page.goto('/?map=none');
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible(); // auto-opened picker

    // The D79 create row: engine-assigned id (C5), 1 px = 1 unit defaults,
    // no pin — the freshest map a user can meet. The create's success CLOSES
    // the picker (the map is the point).
    await page.getByTestId('tme-maps-create-input').fill('Header Land');
    await activate(page, 'tme-maps-create');
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden();

    // R1: the unit word read IN-PAGE off the app's own seam — the exact
    // string the header renders, never a spec-magic word.
    const unit = await readSnapshotUnit(page);
    expect(unit, 'a loaded map always has a snapshot unit').not.toBeNull();
    expect(unit!.length).toBeGreaterThan(0);
    await expect(page.getByTestId('tme-unit')).toHaveText(unit!);

    // The §R4 collapse, unit-only shape: location and layer are empty (no
    // pin), so BOTH separators refuse — the pre-packet render was
    // "· · <unit>". The D79 one-time hint pill (armed by this very create)
    // is a stage SIBLING of the header, tolerated untouched.
    expect(await readHeaderText(page), 'the unit alone — labeled, no debris').toBe(unit!);
    await expect(page.getByTestId('tme-header')).not.toContainText('·');
    await expect(page.getByTestId('tme-location')).toHaveText('');
    await expect(page.getByTestId('tme-snapshot-layer')).toHaveText('');
    expect(bad, 'console clean through the fresh-map state (C32)').toEqual([]);
  });

  test('pinless loaded map, no selection: the route panel names the missing pin (§R4, R-3 family, D40)', async ({ page }) => {
    const bad = collectConsole(page);
    await page.goto('/?map=none');
    await expect(page.getByTestId('tme-maps-panel')).toBeVisible();

    // The CHEAPEST pinless staging (measured): a map opened from the picker
    // starts with NO pin (D40 — maps-library.e2e-spec.ts:326 pins this), so
    // two DOM steps beat the R-3 menu's canvas-taphold Clear arm with zero
    // canvas gestures. No selection exists either — exactly the state where
    // the old hint said "route there from the pin" about a pin that was not
    // there.
    await rowActivate(page, SEEDED_NAME, 'tme-map-open');
    await expect(page.getByTestId('tme-maps-panel')).toBeHidden(); // the fresh loadMap closed it

    // Summon the empty route panel per world (D53): the wide floater's
    // empty-summon toggle (wide-only chrome) vs the narrow sheet's rail.
    if (isPhone()) await activate(page, 'tme-sheet-rail');
    else await activate(page, 'tme-route-toggle');

    // The §R4 sentence — the R-3 family voice, its own testid so both hint
    // states stay independently assertable; the pin variant is gone.
    await expect(page.getByTestId('tme-hint-pinless')).toHaveText('Set where the party is to route from here.');
    await expect(page.getByTestId('tme-hint')).toHaveCount(0);
    expect(bad, 'console clean through the pinless state (C32)').toEqual([]);
  });

  test('pinned no-selection: the hint and the full header triplet are byte-identical (§R4 pin-present guard, R1)', async ({ page }) => {
    const bad = collectConsole(page);
    await page.goto('/');
    await expect(page.getByTestId('tme-canvas')).toBeVisible();

    // FX1 boot: pin on Emiya Residence, no selection. Desktop keeps the
    // always-open route sidebar (the pin-incident blocked arc is content —
    // the route-panel spec's own boot expectation); phone expands the sheet.
    if (isPhone()) await activate(page, 'tme-sheet-rail');

    // The pin-present hint: same testid, same words — byte-unchanged by the
    // packet; the pinless variant is absent.
    await expect(page.getByTestId('tme-hint')).toHaveText('Tap a node on the map to route there from the pin.');
    await expect(page.getByTestId('tme-hint-pinless')).toHaveCount(0);

    // The all-present triplet keeps BOTH separators — the collapse never
    // touches a full header. The unit is read in-page (R1); the location and
    // layer are FX1's authored fixture strings (the canvas-spec convention).
    // NOTE: the separator spans carry no DOM whitespace of their own (the
    // SCSS owns the visual gap) — the pre-packet render had this same
    // adjacency; the guard asserts the exact byte shape.
    const unit = await readSnapshotUnit(page);
    expect(unit).not.toBeNull();
    expect(await readHeaderText(page), 'the full triplet, both separators').toBe(
      `${EMIYA_LABEL}·${PIN_LAYER_NAME}·${unit}`,
    );
    expect(bad, 'console clean (housekeeping)').toEqual([]);
  });
});
