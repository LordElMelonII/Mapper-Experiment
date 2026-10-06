// Behavior tests for the Phase 3 M3 layer commands (PKG A-017): upsertLayer ·
// removeLayer · reorderLayers · layerRemovalImpact · detachNode ·
// setNodeLayer · setLayerBackground · setPortal.
// D82 (manager sheet: create/rename/reorder, informed-cascade delete + node
// detach) · D83 (property-panel node-to-layer moves, stranding refused
// visibly) · D84 (per-layer backgrounds: asset or URL reference) · D85
// (portal wiring: at most one entry node per layer, the hierarchy derives
// from it). Command semantics ride the A-013 editor regime: C5 engine ids
// ('layer-<n>', bump-until-free) · C24 live-reference in-place mutation,
// caller objects never aliased · C30 clone-validate-apply, field-precise
// collected refusals that leave the map byte-identical · D75 fresh-object
// splice seam (the OLD object stays byte-identical for the effective graph),
// dirty-never-stale, no rebuild from any layer command · D69 the active
// layer resets exactly as loadMap does when (and only when) it dies ·
// C3 cross-layer-ness DERIVES from endpoint layers — no edge mutation on a
// move · F50 both-planes cascades + dying chat blocks · F42/F43/F54/F02 the
// M3 surfaces. FX1 (data/worlds/fuyuki) is the fixture: 15 fuyuki nodes +
// misaki-town, 29 same-layer arcs + 1 cross-layer station arc (C3/F17).
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf, type MapFacade } from '../../src/core/facade';
import { MapValidationError, validateOverlay, validateWorldMap } from '../../src/core/model/validate';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, LayerBackground, WorldMapData } from '../../src/core/api';

// C24: the facade keeps the loaded references — every suite builds a fresh
// mutable clone of the deep-frozen FX1 fixture so tests never interact.
const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const overlayFor = (map: WorldMapData): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: null,
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

const lastOf = <T>(arr: T[]): T => arr[arr.length - 1];

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

// --- upsertLayer (D82, C5, C24, C30, D75) ------------------------------------------------------

describe('upsertLayer — create & replace (D82, C5, C30, D75)', () => {
  it("create: engine id 'layer-<n>' that clears FX1's scheme-shaped authored ids; fresh object; dirty", () => {
    const { f, map, overlay } = load(fuyuki());
    const draft = { id: '', name: 'Ryūdōji Hill' };
    f.upsertLayer(draft);
    const created = lastOf(map.layers);
    expect(created.id).toMatch(/^layer-\d+$/); // C5: the id belongs to the engine
    expect(created.id).toBe('layer-1'); // FX1's layer-fuyuki/layer-misaki never collide with the counter scheme (C5)
    expect(created).not.toBe(draft); // a FRESH object — the sheet binds drafts (D75)
    expect(created.name).toBe('Ryūdōji Hill');
    expect(map.layers.map((l) => l.id)).toEqual(['layer-fuyuki', 'layer-misaki', 'layer-1']); // visible, appended
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('the bump loop clears a counter-shaped authored id (C5)', () => {
    const map = fuyuki();
    map.layers.push({ id: 'layer-1', name: 'Authored Scheme Layer' });
    const { f, overlay } = load(map);
    f.upsertLayer({ id: '', name: 'Another' });
    expect(lastOf(map.layers).id).toBe('layer-2'); // bumped until free over the layer id set (C5)
    expect(new Set(map.layers.map((l) => l.id)).size).toBe(map.layers.length); // no collision
    expectStillValid(map, overlay);
  });

  it('rename via REPLACE: name swaps, id and array position stable, FRESH object (D75 splice seam)', () => {
    const { f, map, overlay } = load(fuyuki());
    const old = map.layers[1]; // layer-misaki
    f.upsertLayer({ id: 'layer-misaki', name: 'Misaki (renamed)' });
    const stored = map.layers[1];
    expect(stored).not.toBe(old); // a FRESH object swapped by index — never mutated in place
    expect(stored.id).toBe('layer-misaki'); // id immutable
    expect(stored.name).toBe('Misaki (renamed)');
    expect(map.layers.map((l) => l.id)).toEqual(['layer-fuyuki', 'layer-misaki']); // position stable
    expect(old.name).toBe('Misaki Town'); // the old object stays byte-identical (D75)
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('an unknown non-empty id is a field-precise rejection (C5/D75)', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    expect(() => f.upsertLayer({ id: 'nope', name: 'X' })).toThrow(
      "[TravelMapper] upsertLayer: unknown layer id 'nope' — pass '' to create (C5/D75)",
    );
    expect(JSON.stringify([map, overlay])).toBe(before); // C30
    expect(f.hasUnsavedChanges()).toBe(false);
  });

  it('an invalid create (empty name) refuses via the clone gate — nothing pushed (C30/D82)', () => {
    const { f, map, overlay } = load(fuyuki());
    const err = issuesOf(() => f.upsertLayer({ id: '', name: '' }));
    expect(err.issues.some((i) => i.path === 'layers[2].name')).toBe(true); // the validator owns the rule
    expect(map.layers).toHaveLength(2); // nothing pushed
    expect(f.hasUnsavedChanges()).toBe(false);
  });
});

// --- reorderLayers (D82, C30) -------------------------------------------------------------------

describe('reorderLayers (D82, C30)', () => {
  it('a valid permutation re-orders map.layers exactly; element identity kept; active layer unchanged; dirty', () => {
    const { f, map, overlay } = load(fuyuki());
    const misaki = map.layers[1];
    f.reorderLayers(['layer-misaki', 'layer-fuyuki']);
    expect(map.layers.map((l) => l.id)).toEqual(['layer-misaki', 'layer-fuyuki']); // the new array/nav order
    expect(map.layers[0]).toBe(misaki); // order is the ONLY change — no element swap
    expect(facadeStateOf(f).activeLayer).toBe('layer-fuyuki'); // an id, not an index — unchanged
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('duplicate id ⇒ field-precise refusal naming it; map byte-identical; dirty untouched (C30)', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    expect(() => f.reorderLayers(['layer-fuyuki', 'layer-fuyuki'])).toThrow(/duplicate: layer-fuyuki/);
    expect(JSON.stringify([map, overlay])).toBe(before);
    expect(f.hasUnsavedChanges()).toBe(false);
  });

  it('missing id ⇒ refusal naming it; map byte-identical (C30)', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    expect(() => f.reorderLayers(['layer-fuyuki'])).toThrow(/missing: layer-misaki/);
    expect(JSON.stringify([map, overlay])).toBe(before);
    expect(f.hasUnsavedChanges()).toBe(false);
  });

  it('extra unknown id ⇒ refusal naming it; map byte-identical (C30)', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    expect(() => f.reorderLayers(['layer-fuyuki', 'layer-misaki', 'layer-ghost'])).toThrow(
      /unknown: layer-ghost/,
    );
    expect(JSON.stringify([map, overlay])).toBe(before);
    expect(f.hasUnsavedChanges()).toBe(false);
  });
});

// --- layerRemovalImpact (D82/R1) -----------------------------------------------------------------

describe('layerRemovalImpact — the delete dialog\'s N/M/K (D82/R1)', () => {
  it('FX1 misaki: hand-computed N=2 (misaki-town + a waypoint), M=1 (the we- arc), K=1 (the station arc); PURE', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-misaki', { x: 220, y: 220 }); // kNN ⇒ the layer's only leaf: misaki-town (C7)
    const wp = overlay.userNodes[0];
    expect(wp.layer).toBe('layer-misaki');
    expect(overlay.userEdges).toHaveLength(1); // wp ↔ misaki-town
    const before = JSON.stringify([map, overlay]);
    const impact = f.layerRemovalImpact('layer-misaki');
    // N: misaki-town + wp = 2 · M: the we- arc (both endpoints die) = 1 ·
    // K: arc-fuyuki-station-misaki-town (exactly one endpoint dies — lost from
    // the surviving layer) = 1.
    expect(impact).toEqual({ nodes: 2, sameLayerArcs: 1, crossLayerArcs: 1 });
    expect(JSON.stringify([map, overlay])).toBe(before); // PURE — no mutation
    expect(f.hasUnsavedChanges()).toBe(false); // and no dirty
  });

  it('FX1 fuyuki: N=16 / M=32 / K=1 with a waypoint + its 3 kNN arcs on the layer; the misaki wp counts nothing', () => {
    const { f } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 260 }); // kNN ⇒ emiya, matou, shopping (C7 over FX1)
    f.addUserNodeAt('layer-misaki', { x: 220, y: 220 }); // not on the dying layer — uncounted
    const impact = f.layerRemovalImpact('layer-fuyuki');
    // N: 15 library nodes (2 districts + 13 leaves) + wp = 16 · M: FX1's 29
    // same-layer arcs + the 3 we- arcs (both endpoints die) = 32 · K: the one
    // cross-layer station arc = 1 (the misaki wp's we- arc has ZERO dying
    // endpoints — not counted in either bucket).
    expect(impact).toEqual({ nodes: 16, sameLayerArcs: 32, crossLayerArcs: 1 });
  });

  it('never refuses on last layer, but unknown ids throw (D82, §9)', () => {
    const map = fuyuki();
    map.layers = [map.layers[0]]; // a one-layer map (misaki-town moves home below)
    map.nodes.find((nd) => nd.id === 'misaki-town')!.layer = 'layer-fuyuki';
    const { f, overlay } = load(map);
    expect(f.layerRemovalImpact('layer-fuyuki')).toEqual({ nodes: 16, sameLayerArcs: 30, crossLayerArcs: 0 });
    expect(() => f.layerRemovalImpact('layer-ghost')).toThrow(
      "[TravelMapper] layerRemovalImpact: unknown layer id 'layer-ghost'",
    );
    expectStillValid(map, overlay);
  });
});

// --- removeLayer — the informed cascade (D82, F50, D69) ------------------------------------------

describe('removeLayer — the informed cascade (D82, F50, D69, C30)', () => {
  it('deleting layer-misaki: layer + background die; nodes die; the cross-layer arc dies out of the SURVIVING layer; overlay waypoints, their arcs and their blocks die; the surviving portal unwires; dirty', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setLayerBackground('layer-misaki', { url: 'https://example.com/misaki.png' }); // dies with the layer
    f.addUserNodeAt('layer-misaki', { x: 220, y: 220 }); // wp + we- arc to misaki-town
    const wp = overlay.userNodes[0];
    const we = overlay.userEdges[0];
    f.setBlocked(we.id, 'closed'); // a chat block on the dying user arc
    f.setBlocked('arc-fuyuki-station-misaki-town', 'strike'); // … and on the dying cross-layer map arc
    f.setPortal('ghost-house', 'layer-misaki'); // a SURVIVING node wires the dying layer (D85)

    f.removeLayer('layer-misaki');
    expect(map.layers.map((l) => l.id)).toEqual(['layer-fuyuki']); // the layer — background included — is gone
    expect(map.nodes.some((nd) => nd.id === 'misaki-town')).toBe(false); // resident nodes die
    expect(map.edges.some((e) => e.id === 'arc-fuyuki-station-misaki-town')).toBe(false); // the cross-layer arc is gone from the surviving layer's edges
    expect(overlay.userNodes.some((nd) => nd.id === wp.id)).toBe(false); // waypoints on the layer die (F50 both planes)
    expect(overlay.userEdges.some((e) => e.id === we.id)).toBe(false); // their incident user edges die
    expect(overlay.blocked[we.id]).toBeUndefined(); // a block on a dying edge dies (F50)
    expect(overlay.blocked['arc-fuyuki-station-misaki-town']).toBeUndefined();
    expect(map.nodes.find((nd) => nd.id === 'ghost-house')!.portal).toBeUndefined(); // unwired — a portal dies with its target (D85)
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('deleting layer-fuyuki: all 15 resident nodes and its 29 same-layer arcs go; misaki-town survives alone', () => {
    const { f, map, overlay } = load(fuyuki());
    f.removeLayer('layer-fuyuki');
    expect(map.layers.map((l) => l.id)).toEqual(['layer-misaki']);
    expect(map.nodes.map((nd) => nd.id)).toEqual(['misaki-town']); // every fuyuki node died — same-layer arcs all gone with them
    expect(map.edges).toEqual([]); // the 29 same-layer arcs AND the cross-layer arc
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('the D69 reset fires ONLY when the ACTIVE layer dies — survivors keep it; the reset is survivors[0] (D69)', () => {
    const a = load(fuyuki());
    a.f.setActiveLayer('layer-misaki');
    a.f.removeLayer('layer-fuyuki'); // a NON-active layer dies
    expect(facadeStateOf(a.f).activeLayer).toBe('layer-misaki'); // untouched

    const b = load(fuyuki()); // loadMap default: active = layers[0] = layer-fuyuki
    b.f.removeLayer('layer-fuyuki'); // the ACTIVE layer dies
    expect(facadeStateOf(b.f).activeLayer).toBe('layer-misaki'); // reset exactly as loadMap does — the survivors' first layer

    const c = load(fuyuki());
    c.f.setActiveLayer('layer-misaki');
    c.f.removeLayer('layer-misaki'); // the ACTIVE layer dies
    expect(facadeStateOf(c.f).activeLayer).toBe('layer-fuyuki'); // survivors[0], not the nearest sibling
  });

  it('the last remaining layer is never deletable (D82)', () => {
    const map = fuyuki();
    map.layers = [map.layers[0]];
    map.nodes.find((nd) => nd.id === 'misaki-town')!.layer = 'layer-fuyuki';
    const { f, overlay } = load(map);
    const before = JSON.stringify([map, overlay]);
    expect(() => f.removeLayer('layer-fuyuki')).toThrow(
      /\[TravelMapper\] removeLayer: 'layer-fuyuki' is the last remaining layer/,
    );
    expect(JSON.stringify([map, overlay])).toBe(before); // C30 — refused before mutating
    expect(f.hasUnsavedChanges()).toBe(false);
  });

  it('an unknown layer id throws field-precisely (§9)', () => {
    const { f, map, overlay } = load(fuyuki());
    expect(() => f.removeLayer('layer-ghost')).toThrow("[TravelMapper] removeLayer: unknown layer id 'layer-ghost'");
    expectStillValid(map, overlay);
  });
});

// --- setNodeLayer (D83, C3, C30, D75) -------------------------------------------------------------

describe('setNodeLayer (D83, C3, C30, D75)', () => {
  it('a move lands as a FRESH swap; the OLD node object stays byte-identical (D75 seam)', () => {
    const { f, map, overlay } = load(fuyuki());
    const outskirts = map.nodes.find((nd) => nd.id === 'outskirts')!; // parentless leaf — a clean mover
    const before = JSON.stringify(outskirts);
    f.setNodeLayer('outskirts', 'layer-misaki');
    const stored = map.nodes.find((nd) => nd.id === 'outskirts')!;
    expect(stored).not.toBe(outskirts); // fresh object swapped in — never mutated in place
    expect(stored.layer).toBe('layer-misaki');
    expect(JSON.stringify(outskirts)).toBe(before); // the old object is untouched — the effective graph keeps serving the SAVED value (F45/D75)
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('C3 derives: a move needs NO edge mutation — the cross-layer arc object is byte-identical, same identity (C3)', () => {
    const { f, map, overlay } = load(fuyuki());
    const arc = map.edges.find((e) => e.id === 'arc-fuyuki-station-misaki-town')!;
    const before = JSON.stringify(arc);
    f.setNodeLayer('misaki-town', 'layer-fuyuki'); // both endpoints now share a layer — a formerly cross-layer arc
    expect(JSON.stringify(arc)).toBe(before); // byte-identical — no edge was touched
    expect(map.edges.find((e) => e.id === arc.id)).toBe(arc); // same object in the array: edges are ordinary arcs before, during and after (C3)
    expectStillValid(map, overlay);
  });

  it('a move that would strand the PARENT behind is refused field-precisely, map untouched (D83/C30)', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    const err = issuesOf(() => f.setNodeLayer('emiya-residence', 'layer-misaki')); // parent district-miyama stays on fuyuki
    expect(err.issues.some((i) => i.path.endsWith('.parent') && i.message.includes('same layer'))).toBe(true);
    expect(JSON.stringify([map, overlay])).toBe(before); // never silently re-parented (D83)
    expect(f.hasUnsavedChanges()).toBe(false);
  });

  it('a move that would strand a CHILD behind is refused field-precisely, map untouched (D83/C30)', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    const err = issuesOf(() => f.setNodeLayer('district-miyama', 'layer-misaki')); // its children stay on fuyuki
    expect(err.issues.some((i) => i.path.endsWith('.parent') && i.message.includes('same layer'))).toBe(true);
    expect(JSON.stringify([map, overlay])).toBe(before);
    expect(f.hasUnsavedChanges()).toBe(false);
  });

  it('a move that would put a portal node ON its own target layer is refused by the validator\'s portal rule (D85/C30)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setPortal('ghost-house', 'layer-misaki'); // wired — ghost-house is parentless
    const before = JSON.stringify([map, overlay]);
    const err = issuesOf(() => f.setNodeLayer('ghost-house', 'layer-misaki')); // would land ON its target
    expect(err.issues.some((i) => i.path.endsWith('.portal') && i.message.includes('own layer'))).toBe(true);
    expect(JSON.stringify([map, overlay])).toBe(before); // the refusal rides C30 — correct, no ad-hoc rule
  });

  it('moving to the CURRENT layer is a validating no-op — dirty untouched; unknown ids throw (D83, §9)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setNodeLayer('outskirts', 'layer-fuyuki'); // already there
    expect(f.hasUnsavedChanges()).toBe(false); // nothing changed
    expect(() => f.setNodeLayer('ghost', 'layer-fuyuki')).toThrow("[TravelMapper] setNodeLayer: unknown node id 'ghost'");
    expect(() => f.setNodeLayer('outskirts', 'layer-ghost')).toThrow(
      "[TravelMapper] setNodeLayer: unknown layer id 'layer-ghost'",
    );
    expectStillValid(map, overlay);
  });
});

// --- setPortal (D85, C30, D75) --------------------------------------------------------------------

describe('setPortal (D85, C30, D75)', () => {
  it('wire + unwire through fresh swaps; dirty both ways (D85)', () => {
    const { f, map, overlay } = load(fuyuki());
    const station = map.nodes.find((nd) => nd.id === 'fuyuki-station')!;
    f.setPortal('fuyuki-station', 'layer-misaki'); // wire: exists, differs from own layer, first wiring
    const wired = map.nodes.find((nd) => nd.id === 'fuyuki-station')!;
    expect(wired).not.toBe(station); // fresh swap (D75 seam)
    expect(wired.portal).toBe('layer-misaki');
    expect(f.hasUnsavedChanges()).toBe(true);
    f.setPortal('fuyuki-station', null); // unwire
    const unwired = map.nodes.find((nd) => nd.id === 'fuyuki-station')!;
    expect(unwired.portal).toBeUndefined();
    expect(unwired).not.toBe(wired); // fresh swap again
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('refusals: unknown target, own layer, a second node onto a wired target — BOTH offenders named (D85/C30)', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    let err = issuesOf(() => f.setPortal('fuyuki-station', 'layer-ghost')); // unknown target
    expect(err.issues.some((i) => i.path.endsWith('.portal') && i.message.includes("'layer-ghost' not found"))).toBe(true);
    err = issuesOf(() => f.setPortal('fuyuki-station', 'layer-fuyuki')); // own layer
    expect(err.issues.some((i) => i.path.endsWith('.portal') && i.message.includes('own layer'))).toBe(true);
    expect(JSON.stringify([map, overlay])).toBe(before); // refusals changed nothing (C30)

    f.setPortal('fuyuki-station', 'layer-misaki'); // the target is now wired
    const afterWire = JSON.stringify([map, overlay]);
    err = issuesOf(() => f.setPortal('kotomine-church', 'layer-misaki')); // a SECOND entry node (D85: at most one)
    const portalIssues = err.issues.filter((i) => i.path.endsWith('.portal') && i.message.includes('at most one'));
    expect(portalIssues.length).toBe(2); // BOTH offenders named field-precisely (C30)
    expect(JSON.stringify([map, overlay])).toBe(afterWire); // the refusal changed nothing beyond the wire
    expect(map.nodes.find((nd) => nd.id === 'kotomine-church')!.portal).toBeUndefined();
    expectStillValid(map, overlay);
  });

  it('an unknown node id throws field-precisely (§9)', () => {
    const { f } = load(fuyuki());
    expect(() => f.setPortal('ghost', null)).toThrow("[TravelMapper] setPortal: unknown node id 'ghost'");
  });
});

// --- setLayerBackground (D84, C30, D75) ------------------------------------------------------------

describe('setLayerBackground (D84, C30, D75)', () => {
  it('{ assetId } and { url } both accepted — two sources, one stored reference; fresh swap; dirty', () => {
    const { f, map, overlay } = load(fuyuki());
    const old = map.layers[0];
    f.setLayerBackground('layer-fuyuki', { assetId: 'lf-bg-1' }); // the upload arm (D29)
    expect(map.layers[0].background).toEqual({ assetId: 'lf-bg-1' });
    expect(map.layers[0]).not.toBe(old); // fresh swap (D75 seam)
    f.setLayerBackground('layer-fuyuki', { url: 'https://example.com/fuyuki.png' }); // the URL arm (travels with the map)
    expect(map.layers[0].background).toEqual({ url: 'https://example.com/fuyuki.png' });
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('{} and both-arms are refused field-precisely by the VALIDATOR rule; map untouched (C30/D84)', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    let err = issuesOf(() => f.setLayerBackground('layer-misaki', {} as unknown as LayerBackground));
    expect(err.issues.some((i) => i.path === 'layers[1].background' && i.message.includes('exactly one'))).toBe(true);
    err = issuesOf(() => f.setLayerBackground('layer-misaki', { assetId: 'a', url: 'u' }));
    expect(err.issues.some((i) => i.path === 'layers[1].background' && i.message.includes('exactly one'))).toBe(true);
    err = issuesOf(() => f.setLayerBackground('layer-misaki', { assetId: '' }));
    expect(err.issues.some((i) => i.path === 'layers[1].background.assetId')).toBe(true);
    expect(JSON.stringify([map, overlay])).toBe(before); // refused before mutating (C30)
    expect(f.hasUnsavedChanges()).toBe(false);
  });

  it('null clears; unknown layer throws (D84, §9)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setLayerBackground('layer-fuyuki', { url: 'https://example.com/f.png' });
    f.setLayerBackground('layer-fuyuki', null); // clear
    expect(map.layers[0].background).toBeUndefined();
    expect(() => f.setLayerBackground('layer-ghost', null)).toThrow(
      "[TravelMapper] setLayerBackground: unknown layer id 'layer-ghost'",
    );
    expectStillValid(map, overlay);
  });
});

// --- detachNode (D82/F54, F50) ---------------------------------------------------------------------

describe('detachNode (D82/F54, F50)', () => {
  it('every incident edge dies in BOTH planes with its chat block; the node survives byte-identical; the waypoint orphan survives; dirty', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 260 }); // we- arcs to emiya, matou, shopping (C7 over FX1)
    const wp = overlay.userNodes[0];
    f.setBlocked('arc-emiya-residence-fuyuki-station', 'strike'); // a chat block on a dying map arc
    const survivingWe = overlay.userEdges.filter((e) => e.source !== 'emiya-residence' && e.target !== 'emiya-residence');
    expect(survivingWe).toHaveLength(2); // matou + shopping arcs stay; the emiya arc is incident
    const emiya = map.nodes.find((nd) => nd.id === 'emiya-residence')!;
    const emiyaJson = JSON.stringify(emiya);
    const libCount = map.edges.length;

    f.detachNode('emiya-residence');
    for (const e of map.edges) {
      expect(e.source === 'emiya-residence' || e.target === 'emiya-residence').toBe(false); // no dangling endpoint
    }
    expect(map.edges).toHaveLength(libCount - 7); // FX1 hand-count: emiya has 7 incident arcs
    expect(overlay.userEdges).toEqual(survivingWe); // BOTH planes (F50) — exactly the non-incident we- arcs remain
    expect(overlay.blocked['arc-emiya-residence-fuyuki-station']).toBeUndefined(); // the block died with its edge (F50)
    const still = map.nodes.find((nd) => nd.id === 'emiya-residence')!;
    expect(still).toBe(emiya); // the node survives UNSWAPPED — the very same object (D82: the node is untouched)
    expect(JSON.stringify(still)).toBe(emiyaJson);
    expect(overlay.userNodes.some((nd) => nd.id === wp.id)).toBe(true); // the waypoint survives, orphaned (C7: legal)
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('a zero-edge node is a no-op — dirty untouched (D82)', () => {
    const map = fuyuki();
    map.nodes.push({ id: 'isolated-spot', label: 'Isolated Spot', kind: 'location', layer: 'layer-fuyuki', position: { x: 0, y: 0 } });
    const { f, overlay } = load(map);
    expect(f.hasUnsavedChanges()).toBe(false);
    f.detachNode('isolated-spot'); // zero incident edges
    expect(f.hasUnsavedChanges()).toBe(false); // nothing changed — dirty untouched
    expect(map.nodes.some((nd) => nd.id === 'isolated-spot')).toBe(true); // and the node survives
    expectStillValid(map, overlay);
  });

  it('unknown ids and overlay waypoints are refused — map nodes only (D82, §9)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 260 });
    const wp = overlay.userNodes[0].id;
    expect(() => f.detachNode('ghost')).toThrow("[TravelMapper] detachNode: unknown node id 'ghost'");
    expect(() => f.detachNode(wp)).toThrow(new RegExp(`unknown node id '${wp}`)); // waypoints are the overlay's business
    expectStillValid(map, overlay);
  });
});

// --- dirty matrix (D75/F45) -------------------------------------------------------------------------

describe('dirty matrix — every mutating command flips dirty; the query and no-ops never do (D75/F45)', () => {
  const dirtyAfter = (run: (f: MapFacade) => void): boolean => {
    const { f } = load(fuyuki());
    run(f);
    return f.hasUnsavedChanges();
  };

  it('one fresh load per command', () => {
    expect(dirtyAfter((f) => f.upsertLayer({ id: '', name: 'X' }))).toBe(true); // create
    expect(dirtyAfter((f) => f.upsertLayer({ id: 'layer-misaki', name: 'M' }))).toBe(true); // rename
    expect(dirtyAfter((f) => f.removeLayer('layer-misaki'))).toBe(true);
    expect(dirtyAfter((f) => f.reorderLayers(['layer-misaki', 'layer-fuyuki']))).toBe(true);
    expect(dirtyAfter((f) => f.detachNode('emiya-residence'))).toBe(true);
    expect(dirtyAfter((f) => f.setNodeLayer('outskirts', 'layer-misaki'))).toBe(true);
    expect(dirtyAfter((f) => f.setLayerBackground('layer-fuyuki', { url: 'https://x/y.png' }))).toBe(true);
    expect(dirtyAfter((f) => f.setLayerBackground('layer-fuyuki', null))).toBe(true);
    expect(dirtyAfter((f) => f.setPortal('fuyuki-station', 'layer-misaki'))).toBe(true);
    // the pure query and the two no-ops never dirty
    expect(dirtyAfter((f) => f.layerRemovalImpact('layer-misaki'))).toBe(false); // R1 query — PURE
    expect(dirtyAfter((f) => f.setNodeLayer('outskirts', 'layer-fuyuki'))).toBe(false); // same-layer no-op
    expect(dirtyAfter((f) => f.detachNode('district-miyama'))).toBe(false); // containers never have arcs (C1) — zero incident edges
  });

  it('saveMap clears the flag after a layer edit (D75/F45/C8)', () => {
    const { f } = load(fuyuki());
    f.upsertLayer({ id: '', name: 'X' });
    expect(f.hasUnsavedChanges()).toBe(true);
    f.saveMap(); // the explicit save — the C8 edit-save trigger takes the layer live
    expect(f.hasUnsavedChanges()).toBe(false);
  });
});

// --- C30 collect -------------------------------------------------------------------------------------

describe('C30 collect — two distinct violations in ONE throw (C30)', () => {
  it('an upsertLayer create with an empty name AND a both-arms background reports both field-precisely', () => {
    const { f, map, overlay } = load(fuyuki());
    const err = issuesOf(() => f.upsertLayer({ id: '', name: '', background: { assetId: 'a', url: 'u' } }));
    const paths = err.issues.map((i) => i.path);
    expect(paths).toContain('layers[2].name'); // violation 1
    expect(paths).toContain('layers[2].background'); // violation 2 — same throw
    expect(map.layers).toHaveLength(2); // nothing pushed
    expectStillValid(map, overlay);
  });
});

// --- validator-level: the new rules directly (C30, D84, D85) ----------------------------------------

describe('validateWorldMap — the new layer rules directly (C30, D84, D85)', () => {
  const mini = (): WorldMapData => ({
    schemaVersion: 2,
    id: 'mini',
    name: 'Mini',
    layers: [
      { id: 'layer-a', name: 'A' },
      { id: 'layer-b', name: 'B' },
    ],
    scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
    nodes: [
      { id: 'n1', label: 'N1', kind: 'location', layer: 'layer-a', position: { x: 0, y: 0 } },
      { id: 'n2', label: 'N2', kind: 'location', layer: 'layer-a', position: { x: 10, y: 0 } },
    ],
    edges: [],
  });

  it('portal to an unknown layer — field-precise path (D85)', () => {
    const map = mini();
    map.nodes[0].portal = 'layer-ghost';
    const err = issuesOf(() => {
      validateWorldMap(map);
    });
    expect(err.issues.some((i) => i.path === 'nodes[0].portal' && i.message.includes("'layer-ghost' not found"))).toBe(true);
  });

  it('portal to the node\'s own layer — field-precise path (D85)', () => {
    const map = mini();
    map.nodes[0].portal = 'layer-a';
    const err = issuesOf(() => {
      validateWorldMap(map);
    });
    expect(err.issues.some((i) => i.path === 'nodes[0].portal' && i.message.includes('own layer'))).toBe(true);
  });

  it('two nodes wiring one target — BOTH named, each field-precise (D85)', () => {
    const map = mini();
    map.nodes[0].portal = 'layer-b';
    map.nodes[1].portal = 'layer-b';
    const err = issuesOf(() => {
      validateWorldMap(map);
    });
    const dupes = err.issues.filter((i) => i.path.endsWith('.portal') && i.message.includes('at most one'));
    expect(dupes.map((i) => i.path)).toEqual(['nodes[0].portal', 'nodes[1].portal']);
  });

  it('background both arms / neither arm / non-object — field-precise paths (D84)', () => {
    const map = mini();
    map.layers[0].background = { assetId: 'a', url: 'u' };
    let err = issuesOf(() => {
      validateWorldMap(map);
    });
    expect(err.issues.some((i) => i.path === 'layers[0].background' && i.message.includes('exactly one'))).toBe(true);
    map.layers[0].background = {} as unknown as { url: string };
    err = issuesOf(() => {
      validateWorldMap(map);
    });
    expect(err.issues.some((i) => i.path === 'layers[0].background' && i.message.includes('exactly one'))).toBe(true);
    (map.layers[0] as { background?: unknown }).background = 'nope';
    err = issuesOf(() => {
      validateWorldMap(map);
    });
    expect(err.issues.some((i) => i.path === 'layers[0].background')).toBe(true);
  });

  it('a well-formed portal/background map validates clean — the rules are not over-broad (D84/D85)', () => {
    const map = mini();
    map.nodes[0].portal = 'layer-b'; // exactly one entry node for layer-b
    map.layers[1].background = { url: 'https://example.com/b.png' };
    expect(() => validateWorldMap(map)).not.toThrow();
  });
});

// --- lifecycle discipline ------------------------------------------------------------------------------

describe('no map loaded ⇒ every layer command throws the standard message (§9 discipline)', () => {
  it('all eight refuse before anything else', () => {
    const f = createFacade();
    expect(() => f.upsertLayer({ id: '', name: 'X' })).toThrow('[TravelMapper] no map loaded');
    expect(() => f.removeLayer('layer-x')).toThrow('[TravelMapper] no map loaded');
    expect(() => f.reorderLayers(['layer-x'])).toThrow('[TravelMapper] no map loaded');
    expect(() => f.layerRemovalImpact('layer-x')).toThrow('[TravelMapper] no map loaded');
    expect(() => f.detachNode('x')).toThrow('[TravelMapper] no map loaded');
    expect(() => f.setNodeLayer('x', 'layer-x')).toThrow('[TravelMapper] no map loaded');
    expect(() => f.setLayerBackground('layer-x', null)).toThrow('[TravelMapper] no map loaded');
    expect(() => f.setPortal('x', null)).toThrow('[TravelMapper] no map loaded');
  });
});

// --- waypoint layer gate (lead small-fix: A-014's saved-plane discipline extended to layers) --------

describe('addUserNodeAt — waypoints bind only SAVED layers (A-014 discipline, D82/F50)', () => {
  it('a waypoint on a created-but-unsaved layer is refused, the overlay stays byte-clean, and saveMap admits it (F50)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.upsertLayer({ id: '', name: 'New Town' });
    const created = lastOf(map.layers).id;
    // The refusal: the layer exists LIVE but not in the SAVED universe — a
    // persisted waypoint would name a layer the saved map lacks, and
    // validateOverlay refuses the WHOLE overlay at the next load (F50).
    expect(() => f.addUserNodeAt(created, { x: 10, y: 10 })).toThrow(
      /\[TravelMapper\] addUserNodeAt: '.+' is not a saved layer id/,
    );
    expect(overlay.userNodes).toEqual([]); // nothing persisted — the F50 state can never occur
    expectStillValid(map, overlay);
    // saveMap moves the saved plane — the new layer now admits waypoints.
    f.saveMap();
    f.addUserNodeAt(created, { x: 10, y: 10 });
    expect(overlay.userNodes).toHaveLength(1);
    expect(overlay.userNodes[0].layer).toBe(created);
    expectStillValid(map, overlay);
  });

  it('a SAVED layer still admits waypoints while the map is dirty — live edits never shrink the universe (A-014)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.upsertNode({ id: '', label: 'Draft', kind: 'location', layer: 'layer-fuyuki' }); // dirty, unsaved node
    f.addUserNodeAt('layer-misaki', { x: 5, y: 5 }); // misaki is saved — binds fine
    expect(overlay.userNodes).toHaveLength(1);
    expectStillValid(map, overlay);
  });
});
