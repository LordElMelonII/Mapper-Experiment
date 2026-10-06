// Behavior tests for the per-layer background presentation arms (PKG A-019):
// setLayerBackgroundPlacement · setLayerBackgroundDim.
// D93 — a per-layer placement (position + scale, aspect-locked) AND a per-layer
// dim level persist in map data as FLAT OPTIONAL arms on LayerData (zero
// migration — the D78/D84 additive precedent: old data lacks the arms, which
// ARE the defaults); the VALIDATOR owns the shape rules (dim 0–1, placement
// finite x/y + finite scale > 0) field-precisely (C30); setting a new
// background source starts it FRESH — setLayerBackground's minimal-fresh shape
// resets both arms on EVERY call, source or null (an old image's tuning must
// not leak into the new one); D88's absent-and-preserve extends to the arms
// across an upsertLayer rename.
// D90 — the dim is saved WITH THE MAP (the D90 owner pick) so it exports to
// SillyTavern in Phase 4, and is pure presentation data: it never enters the
// snapshot or the template.
// D92 — the default fit is APP-side (the core never loads images); this
// surface is only the storage the app persists through, and calibration never
// touches node coordinates, distances or costs (structural: the arms live
// beside the graph — nothing computes from them).
// F56 (background placement, calibration & dim) · F03 (background images).
// Command semantics ride the M3 editor regime: C30 clone-validate-apply, the
// D75 fresh-object splice seam, dirty-never-stale (map data — the A-018
// overlay polarity mirrored), no rebuild from any layer command (D16).
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { MapValidationError, validateOverlay, validateWorldMap } from '../../src/core/model/validate';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, LayerData, WorldMapData } from '../../src/core/api';

// C24: the facade keeps the loaded references — every suite builds a fresh
// mutable clone of the deep-frozen FX1 fixture so tests never interact.
const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const overlayFor = (map: WorldMapData): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: 'emiya-residence', // a live pin — the D90 snapshot pin reads a REAL (non-degraded) snapshot
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {}, nodeBlocked: {},
});

const load = (map: WorldMapData) => {
  const overlay = overlayFor(map);
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

// F50: after every command's happy path AND after every refusal, both planes
// still validate.
const expectStillValid = (map: WorldMapData, overlay: ChatMapOverlay): void => {
  expect(() => validateWorldMap(map)).not.toThrow();
  expect(() => validateOverlay(overlay, map)).not.toThrow();
};

// Capture a MapValidationError's collected issues (C30).
const issuesOf = (run: () => void): MapValidationError => {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(MapValidationError);
    return e as MapValidationError;
  }
  throw new Error('expected the command to throw MapValidationError');
};

// --- setLayerBackgroundDim (D90/D93, C30, D75) --------------------------------------------------

describe('setLayerBackgroundDim (D90/D93, C30, D75)', () => {
  it('sets and updates the dim; FRESH swap (the old object stays byte-identical); dirty (D75 seam)', () => {
    const { f, map, overlay } = load(fuyuki());
    const old = map.layers[0];
    f.setLayerBackgroundDim('layer-fuyuki', 0.5); // set
    expect(map.layers[0].backgroundDim).toBe(0.5);
    expect(map.layers[0]).not.toBe(old); // fresh swap — never mutated in place
    expect(old.backgroundDim).toBeUndefined(); // the old object is untouched
    f.setLayerBackgroundDim('layer-fuyuki', 0.85); // update
    expect(map.layers[0].backgroundDim).toBe(0.85);
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('the boundaries 0 and 1 are legal and stay PRESENT own keys — 0 = undimmed is a value, not absence (D90)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setLayerBackgroundDim('layer-fuyuki', 0);
    expect('backgroundDim' in map.layers[0]).toBe(true);
    expect(map.layers[0].backgroundDim).toBe(0);
    f.setLayerBackgroundDim('layer-fuyuki', 1);
    expect(map.layers[0].backgroundDim).toBe(1); // fully dimmed toward the stage backdrop
    expectStillValid(map, overlay);
  });

  it('a lying dim is refused by the VALIDATOR via the clone gate — field-precise, map byte-identical, dirty untouched (C30)', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify(map);
    for (const bad of [-0.1, 1.1, NaN, Infinity, '0.5', null]) {
      const err = issuesOf(() => f.setLayerBackgroundDim('layer-fuyuki', bad as unknown as number));
      expect(err.issues).toHaveLength(1);
      expect(err.issues[0].path).toBe('layers[0].backgroundDim'); // the validator owns the rule
      expect(err.issues[0].message).toContain('between 0 and 1');
    }
    expect(JSON.stringify(map)).toBe(before); // nothing touched (C30 reject-before-mutate)
    expect(f.hasUnsavedChanges()).toBe(false); // the refusals never flipped dirty
    f.setLayerBackgroundDim('layer-fuyuki', 0.5); // a valid value lands after the refusals
    expect(map.layers[0].backgroundDim).toBe(0.5);
    expectStillValid(map, overlay);
  });

  it("an unknown layer id throws field-precisely (§9)", () => {
    const { f } = load(fuyuki());
    expect(() => f.setLayerBackgroundDim('layer-ghost', 0.5)).toThrow(
      "[TravelMapper] setLayerBackgroundDim: unknown layer id 'layer-ghost'",
    );
  });
});

// --- setLayerBackgroundPlacement (D93/D92, C30, D75) ---------------------------------------------

describe('setLayerBackgroundPlacement (D93/D92, C30, D75)', () => {
  it('sets and updates the placement, never aliasing the caller object; null clears; dirty both ways', () => {
    const { f, map, overlay } = load(fuyuki());
    const old = map.layers[0];
    const placement = { x: 10, y: -4, scale: 0.25 }; // image center (model coords) + model units per image px
    f.setLayerBackgroundPlacement('layer-fuyuki', placement);
    expect(map.layers[0].backgroundPlacement).toEqual(placement);
    expect(map.layers[0].backgroundPlacement).not.toBe(placement); // a FRESH copy — the app binds drafts (D75)
    expect(map.layers[0]).not.toBe(old); // fresh swap
    f.setLayerBackgroundPlacement('layer-fuyuki', { x: 0, y: 0, scale: 0.5 }); // update
    expect(map.layers[0].backgroundPlacement).toEqual({ x: 0, y: 0, scale: 0.5 });
    expect(f.hasUnsavedChanges()).toBe(true);
    f.setLayerBackgroundPlacement('layer-fuyuki', null); // the arm's explicit clear
    expect('backgroundPlacement' in map.layers[0]).toBe(false); // absent — the D92 default fit applies again
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('a malformed placement is refused field-precisely per SUB-FIELD by the VALIDATOR (C30/D93) — nothing touched', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify(map);
    const refused = (placement: unknown, path: string, fragment: string): void => {
      const err = issuesOf(() => f.setLayerBackgroundPlacement('layer-fuyuki', placement as never));
      expect(err.issues.some((i) => i.path === path && i.message.includes(fragment))).toBe(true);
    };
    refused({ x: 1, y: 2 }, 'layers[0].backgroundPlacement.scale', 'finite number > 0'); // missing scale
    refused({ x: 1, y: 2, scale: 0 }, 'layers[0].backgroundPlacement.scale', 'finite number > 0'); // scale 0
    refused({ x: 1, y: 2, scale: -0.5 }, 'layers[0].backgroundPlacement.scale', 'finite number > 0'); // negative scale
    refused({ x: NaN, y: 2, scale: 0.25 }, 'layers[0].backgroundPlacement.x', 'must be a finite number'); // non-finite x
    // a runtime caller lying about the typed shape is refused too — the fresh-copy
    // spread reduces a primitive to an object with no valid sub-fields (the
    // non-object arm itself is the validator's own concern, pinned in validate.spec)
    refused(42, 'layers[0].backgroundPlacement.x', 'must be a finite number');
    // C30 collect: multiple sub-field defects in ONE report (NaN x AND scale 0)
    const err = issuesOf(() => f.setLayerBackgroundPlacement('layer-fuyuki', { x: NaN, y: 2, scale: 0 }));
    const paths = err.issues.map((i) => i.path);
    expect(paths).toContain('layers[0].backgroundPlacement.x');
    expect(paths).toContain('layers[0].backgroundPlacement.scale');
    expect(JSON.stringify(map)).toBe(before); // refused before mutating (C30)
    expect(f.hasUnsavedChanges()).toBe(false);
    expectStillValid(map, overlay);
  });

  it("an unknown layer id throws field-precisely (§9)", () => {
    const { f } = load(fuyuki());
    expect(() => f.setLayerBackgroundPlacement('layer-ghost', null)).toThrow(
      "[TravelMapper] setLayerBackgroundPlacement: unknown layer id 'layer-ghost'",
    );
  });
});

// --- dirty/stale polarity + no-map discipline (D75/F45, C8 — the A-018 mirror, opposite polarity) --

describe('dirty/stale polarity (D75/F45) — the A-018 mirror, opposite polarity', () => {
  it('dirty flips and stale does NOT — editor commands over MAP data (C8/D75)', () => {
    const { f } = load(fuyuki());
    expect(f.hasUnsavedChanges()).toBe(false);
    f.setLayerBackgroundDim('layer-fuyuki', 0.4);
    expect(facadeStateOf(f).dirty).toBe(true);
    expect(facadeStateOf(f).stale).toBe(false); // never a rebuild trigger — the graph is untouched (D16/D75)
    f.setLayerBackgroundPlacement('layer-fuyuki', { x: 5, y: 5, scale: 0.3 });
    expect(facadeStateOf(f).dirty).toBe(true);
    expect(facadeStateOf(f).stale).toBe(false);
    f.saveMap(); // the explicit save — the C8 edit-save trigger takes the arms live
    expect(f.hasUnsavedChanges()).toBe(false);
    expect(facadeStateOf(f).stale).toBe(true); // C8 edit save
  });

  it('no map loaded ⇒ both commands throw the standard refusal (§9 discipline)', () => {
    const f = createFacade();
    expect(() => f.setLayerBackgroundDim('layer-x', 0.5)).toThrow('[TravelMapper] no map loaded');
    expect(() => f.setLayerBackgroundPlacement('layer-x', null)).toThrow('[TravelMapper] no map loaded');
  });
});

// --- the D93 fresh-start rule (setLayerBackground resets the arms) --------------------------------

describe('the D93 fresh-start rule — setLayerBackground resets BOTH arms on EVERY call (source or null)', () => {
  it('a NEW source resets both arms — an old image\'s placement/dim tuning must not leak into the new one (D93)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setLayerBackground('layer-fuyuki', { url: 'https://example.com/old.png' });
    f.setLayerBackgroundDim('layer-fuyuki', 0.7);
    f.setLayerBackgroundPlacement('layer-fuyuki', { x: 12, y: 34, scale: 0.4 });
    expect(map.layers[0].backgroundDim).toBe(0.7);
    expect(map.layers[0].backgroundPlacement).toEqual({ x: 12, y: 34, scale: 0.4 });
    f.setLayerBackground('layer-fuyuki', { url: 'https://example.com/new.png' }); // the source replace
    expect(map.layers[0].background).toEqual({ url: 'https://example.com/new.png' });
    expect('backgroundDim' in map.layers[0]).toBe(false); // reset to the default (absent = 0)
    expect('backgroundPlacement' in map.layers[0]).toBe(false); // reset to the default (absent = D92 fit)
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('setLayerBackground(null) clears the background AND both arms (D93 — the arm\'s ONLY clear beside placement\'s own null)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setLayerBackground('layer-misaki', { assetId: 'lf-bg-9' });
    f.setLayerBackgroundDim('layer-misaki', 0.9);
    f.setLayerBackgroundPlacement('layer-misaki', { x: -3, y: 7, scale: 0.2 });
    f.setLayerBackground('layer-misaki', null);
    expect(map.layers[1].background).toBeUndefined();
    expect('backgroundDim' in map.layers[1]).toBe(false);
    expect('backgroundPlacement' in map.layers[1]).toBe(false);
    expectStillValid(map, overlay);
  });

  it('the reset fires even when the arms were tuned with NO background present — the minimal-fresh shape omits every arm (D93)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setLayerBackgroundDim('layer-fuyuki', 0.7); // no background was ever set
    f.setLayerBackgroundPlacement('layer-fuyuki', { x: 1, y: 2, scale: 0.1 });
    f.setLayerBackground('layer-fuyuki', { url: 'https://example.com/first.png' }); // EVERY call resets — source or null
    expect('backgroundDim' in map.layers[0]).toBe(false);
    expect('backgroundPlacement' in map.layers[0]).toBe(false);
    expectStillValid(map, overlay);
  });
});

// --- the D88 absent-and-preserve extension (upsertLayer rename) ------------------------------------

describe('the D88 absent-and-preserve extension — upsertLayer rename (D93)', () => {
  it('the arms SURVIVE a rename — the REPLACE spread carries them; the upsertLayer arg does not grow the arms (D88/D93)', () => {
    const { f, map, overlay } = load(fuyuki());
    const old = map.layers[1]; // layer-misaki
    f.setLayerBackground('layer-misaki', { url: 'https://example.com/misaki.png' });
    f.setLayerBackgroundDim('layer-misaki', 0.6);
    f.setLayerBackgroundPlacement('layer-misaki', { x: 8, y: 9, scale: 0.15 });
    f.upsertLayer({ id: 'layer-misaki', name: 'Misaki (renamed)' }); // the rename caller manages NEITHER arm
    const stored = map.layers[1];
    expect(stored).not.toBe(old); // fresh swap (D75 seam)
    expect(stored.name).toBe('Misaki (renamed)');
    expect(stored.background).toEqual({ url: 'https://example.com/misaki.png' }); // the M3 precedent, still standing
    expect(stored.backgroundDim).toBe(0.6); // absent-and-preserve now covers the D93 arms too
    expect(stored.backgroundPlacement).toEqual({ x: 8, y: 9, scale: 0.15 });
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });
});

// --- D90 export premise + the never-enters-prompt pin -----------------------------------------------

describe('the arms are MAP data (D90): a saveMap round-trip carries them; the snapshot never does', () => {
  it('a saveMap round-trip (serialize → loadMap revalidation) carries both arms — the D90 export premise', () => {
    const { f, map } = load(fuyuki());
    f.setLayerBackgroundDim('layer-fuyuki', 0.35);
    f.setLayerBackgroundPlacement('layer-fuyuki', { x: 50, y: 60, scale: 0.05 });
    f.saveMap(); // dirty clears; the arms are now SAVED map data
    const saved = JSON.parse(JSON.stringify(map)) as WorldMapData; // the persistence seam (host-side, Phase 4)
    expect(saved.layers[0].backgroundDim).toBe(0.35);
    expect(saved.layers[0].backgroundPlacement).toEqual({ x: 50, y: 60, scale: 0.05 });
    const overlay = overlayFor(saved);
    const f2 = createFacade();
    f2.loadMap(saved, overlay); // validateWorldMap accepts the arms (zero migration, D93)
    expect((saved.layers[0] as LayerData).backgroundDim).toBe(0.35);
    expect((saved.layers[0] as LayerData).backgroundPlacement).toEqual({ x: 50, y: 60, scale: 0.05 });
  });

  it('the snapshot stays ARM-FREE — buildSnapshot output carries no backgroundDim/backgroundPlacement (D90)', () => {
    const { f, map } = load(fuyuki());
    const routeBefore = f.findRoute('emiya-residence', 'misaki-town').total; // FX2's train arc, 300 min
    for (const layer of map.layers) {
      f.setLayerBackgroundDim(layer.id, 0.5);
      f.setLayerBackgroundPlacement(layer.id, { x: 100, y: 200, scale: 0.2 });
    }
    expect(f.findRoute('emiya-residence', 'misaki-town').total).toBe(routeBefore); // costs untouched (D92 — structural)
    const snapshot = f.getSnapshot();
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain('backgroundDim'); // never enters the prompt payload (D90)
    expect(json).not.toContain('backgroundPlacement');
    expect(snapshot.layer).toBe('Fuyuki City'); // a real (non-degraded) snapshot — the pin holds where it matters
  });
});
