// tests/verify/m4-library-forks-adversarial.spec.ts — M4 PHASE-GATE adversarial
// suite (Agent D, full §11 gate). Phase 3 M4 (Library & forks).
//
// Every expectation below is derived from the spec alone — CORE.md (C5, C13,
// C14 row 5 verbatim, C15, C23, C24, C25, C29, C30, C32, R4), PRODUCT.md (F05),
// EXECUTION-PLAN D40/D41/D64/D79/D97, D75/F45's saved-plane doctrine — never
// from a source comment or an implementer's words. The numbers are re-derived
// by hand in each cell (3-4-5 triangle, terrain/speed clauses, C13's formula).
//
// Two finding probes from the gate report are REPAIRED here per the M4 gate's
// rulings (registered as D98/D99): finding 2 (the dirty-fork draft leak) is an
// ACTIVE GREEN pin asserting the D99 dirty refusal — the pre-fork session's
// saved pricing stays intact after the refused fork; the finding-1 pin (the fork
// seam's missing id-exclusion channel, its mechanism formerly pinned GREEN to
// keep it visible) now demonstrates the D98 REPAIR in the same two-process
// shape — session 2 forks AROUND its store's ids, the save-back lands as a NEW
// row. The rest of this suite is the verifier's gate record, untouched.
import { describe, expect, it, vi } from 'vitest';
import { createFacade, facadeStateOf, type MapFacade, type FacadeState } from '../../src/core/facade';
import { createWorldMap, duplicateMapData, generateMapId } from '../../src/core/model/create';
import { validateWorldMap, validateOverlay, MapValidationError } from '../../src/core/model/validate';
import { importLookupTable } from '../../src/core/import/lookup';
import { euclid } from '../../src/core/geometry/measure';
import {
  createLocalforageMapLibrary,
  type LocalforageInstance,
  type LocalforageStore,
} from '../../src/st/map-library-store';
import { MAP_LIBRARY, type LibraryEntry, type MapLibrary } from '../../src/app/graph/map-library';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

// The fixture is deep-frozen (D57) — every cell works on a fresh mutable clone.
const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

/** A hand-built two-node geometric map on a D79 fresh base (C14 row 5 material). */
function geoMap(): WorldMapData {
  const fresh = createWorldMap('Strait Anchor'); // authored words everywhere (C23)
  const layerId = fresh.layers[0]!.id;
  fresh.nodes = [
    { id: 'alpha', label: 'Alpha', kind: 'location', layer: layerId, position: { x: 0, y: 0 } },
    { id: 'beta', label: 'Beta', kind: 'location', layer: layerId, position: { x: 3, y: 4 } },
  ];
  fresh.edges = [{ id: 'arc-1', source: 'alpha', target: 'beta', modes: { walk: { allowed: true } } }];
  return fresh;
}

const overlayFor = (map: WorldMapData): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: null,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {},
  nodeBlocked: {},
});

const load = (map: WorldMapData) => {
  const overlay = overlayFor(map);
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

/** A deep-compare digest of the saved plane — the D97 statelessness read. */
function savedPlane(f: MapFacade): FacadeState {
  const s = facadeStateOf(f);
  return {
    ...s,
    savedNodeIds: new Set([...s.savedNodeIds].sort()),
    savedEdgeIds: new Set([...s.savedEdgeIds].sort()),
    savedLayerIds: new Set([...s.savedLayerIds].sort()),
    savedScale: s.savedScale && { ...s.savedScale, speed: s.savedScale.speed && { ...s.savedScale.speed } },
  } as FacadeState;
}

// =================================================================================
// 1. D79 — the new-map default scale (C14 row 5, C13, C5, D44/D45)
// =================================================================================

describe('D79 — a fresh map is 1 px = 1 unit, distance-kind, "units" (create.ts)', () => {
  it('the defaults are verbatim D79, singleton layer named after the map, never a fork', () => {
    const fresh = createWorldMap('Aurea Land');
    expect(fresh.schemaVersion).toBe(2);
    expect(fresh.scale).toEqual({ unitPerPx: 1, unitLabel: 'units', unitKind: 'distance' });
    expect(fresh.nodes).toEqual([]);
    expect(fresh.edges).toEqual([]);
    expect(fresh.layers).toHaveLength(1); // the validator floor (≥ 1 layer)
    expect(fresh.layers[0]!.name).toBe('Aurea Land'); // named after the map (D79)
    expect(fresh.layers[0]!.id).toMatch(/^layer-\d+$/); // engine-assigned (C5)
    expect(fresh.id).toMatch(/^map-\d+$/);
    expect(fresh.forkedFrom).toBeUndefined(); // a new map is a library original (C25/D41)
    expect(() => validateWorldMap(fresh)).not.toThrow(); // the panel saves it unedited
  });

  it('rapid creations never collide (C5), with and without an exclusion set', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = i % 2 === 0 ? createWorldMap(`Map ${i}`, seen).id : generateMapId(seen);
      expect(seen.has(id)).toBe(false); // nothing this process issued is ever re-issued
      seen.add(id);
    }
  });

  it('the exclusion set (host knowledge, prior-process ids) is skipped, and every call consumes the counter (C5)', () => {
    const foreign = new Set(['map-1', 'map-2', 'map-3']);
    const first = generateMapId(foreign);
    expect(first.endsWith('map-1')).toBe(false);
    expect(first.endsWith('map-2')).toBe(false);
    expect(first.endsWith('map-3')).toBe(false);
    const second = generateMapId(foreign);
    expect(second).not.toBe(first); // the counter moved — rapid creations stay unique
  });
});

describe('C14 row 5 on a D79 map — a geometric arc prices from the first stroke', () => {
  it('route total = px distance, unit "units", resolved mode word (3-4-5 placement, hand-derived)', () => {
    const f = createFacade();
    f.loadMap(geoMap(), overlayFor(geoMap()));
    f.setCurrentLocation('alpha');
    f.materialize();
    // hand-derivation: euclid(0,0 → 3,4) = 5 px; unitPerPx 1 ⇒ the geometric leg's
    // px distance IS its unit cost; no speed defined ⇒ C14 row 6 prices canonical
    // units; C15: minutes underivable ⇒ canonical; D72 labels it 'units'.
    const route = f.findRoute('alpha', 'beta');
    expect(route.ok).toBe(true);
    expect(route.total).toBeCloseTo(5, 10);
    expect(route.unit).toBe('units');
    expect(route.legs).toHaveLength(1);
    expect(route.legs[0]!.modeLabel).toBe('walk'); // D78/C23 resolved authored word
    expect(route.legs[0]!.cost).toBeCloseTo(5, 10);
  });

  it('snapshot seam: one currency ("units"), exactly the incident arc at cost 5, direction SE', () => {
    const f = createFacade();
    f.loadMap(geoMap(), overlayFor(geoMap()));
    f.setCurrentLocation('alpha');
    f.materialize();
    const snap = f.getSnapshot();
    expect(snap.unit).toBe('units'); // C15/D65 — canonical; no minutes-derived number shown
    expect(snap.routes).toHaveLength(1); // C19: exactly the arcs incident to the pin
    expect(snap.routes[0]!.label).toBe('Beta'); // authored words only (C23)
    expect(snap.routes[0]!.cost).toBeCloseTo(5, 10);
    expect(snap.routes[0]!.direction).toBe('SE'); // Δx>0 East, Δy>0 South (C9/C10)
    expect(snap.destinations).toEqual([]); // no hubs — nothing to cap (C20)
  });

  it('terrain multiplier joins the geometric leg (row 5 verbatim: px × scale × terrain)', () => {
    const map = geoMap();
    map.edges = [{ id: 'arc-1', source: 'alpha', target: 'beta', modes: { walk: { allowed: true } }, terrain: 'road' }];
    map.scale = { unitPerPx: 1, unitLabel: 'units', unitKind: 'distance', terrainMultipliers: { road: 2 } };
    const f = createFacade();
    f.loadMap(map, overlayFor(map));
    f.setCurrentLocation('alpha');
    f.materialize();
    // hand-derived: 5 px × 1 unit/px × road 2 = 10 units
    const route = f.findRoute('alpha', 'beta');
    expect(route.total).toBeCloseTo(10, 10);
    expect(route.unit).toBe('units');
  });

  it('speed defined ⇒ the geometric leg converts to minutes (row 5 · "converted via speed when defined", C15)', () => {
    const map = geoMap();
    map.scale = { unitPerPx: 1, unitLabel: 'units', unitKind: 'distance', speed: { walk: 12 } };
    const f = createFacade();
    f.loadMap(map, overlayFor(map));
    f.setCurrentLocation('alpha');
    f.materialize();
    // hand-derived: 5 units ÷ 12 units/hour × 60 = 25 minutes
    const route = f.findRoute('alpha', 'beta');
    expect(route.total).toBeCloseTo(25, 10);
    expect(route.unit).toBe('min'); // C15: minutes whenever derivable — and they now are
    expect(route.legs[0]!.cost).toBeCloseTo(25, 10);
  });
});

describe('C13 — the calibrate seam on a D79 map: formula, kinds, explicit-overwrite, refusals', () => {
  it('unitPerPx = authored ÷ px exactly (C13); the edit is dirty-not-live (D75/A-015), then explicit save moves pricing', () => {
    const { f } = load(geoMap());
    f.saveMap(); // the new map is saved truth before anything measures it
    f.calibrateScale('arc-1', 10, { label: 'km', kind: 'distance' });
    // hand-derived: 10 ÷ 5 px = 2 km/px — the DRAFT (D75: dirty, never stale)
    expect(f.hasUnsavedChanges()).toBe(true);
    expect(facadeStateOf(f).savedScale!.unitPerPx).toBe(1); // pricing still serves SAVED 1
    expect(f.findRoute('alpha', 'beta').total).toBeCloseTo(5, 10); // F45: the draft is invisible
    f.saveMap(); // the ONE explicit path that takes the draft live
    expect(facadeStateOf(f).savedScale!.unitPerPx).toBe(2);
    const post = f.findRoute('alpha', 'beta');
    expect(post.total).toBeCloseTo(10, 10); // 5 px × 2 km/px
    expect(post.unit).toBe('km'); // the seeded label (D44/D45 — an explicit unit came)
  });

  it('a TIME-kind unit seeds the two-kind scale (C11/D45) — with no speed the geometry IS minutes', () => {
    const { f } = load(geoMap());
    f.saveMap();
    f.calibrateScale('arc-1', 5, { label: 'min', kind: 'time' }); // 5 min ÷ 5 px = 1 min/px
    f.saveMap();
    const route = f.findRoute('alpha', 'beta');
    expect(route.unit).toBe('min');
    expect(route.total).toBeCloseTo(5, 10); // 5 px × 1 min/px, no speed defined (D74 honest read)
  });

  it('refusals are field-precise and collected — nothing half-applies (C30)', () => {
    const { f } = load(geoMap());
    const scaleBefore = JSON.stringify(facadeStateOf(f).map!.scale);
    expect(() => f.calibrateScale('arc-nowhere', 10)).toThrow(/unknown arc id 'arc-nowhere'/);
    // coincident endpoints ⇒ zero pixel length cannot set a scale
    const map = facadeStateOf(f).map!;
    f.upsertNode({ id: '', label: 'Gamma', kind: 'location', layer: map.layers[0]!.id, position: { x: 3, y: 4 } });
    const gamma = map.nodes.find((n) => n.label === 'Gamma')!;
    f.upsertEdge({ id: '', source: 'beta', target: gamma.id, modes: { walk: { allowed: true } } });
    const zero = map.edges.find(
      (e) => (e.source === 'beta' && e.target === gamma.id) || (e.source === gamma.id && e.target === 'beta'),
    )!;
    expect(() => f.calibrateScale(zero.id, 10)).toThrow(/zero pixel length/);
    expect(() => f.calibrateScale('arc-1', 0)).toThrow(/finite number > 0/);
    expect(() => f.calibrateScale('arc-1', -3)).toThrow(/finite number > 0/);
    expect(() => f.calibrateScale('arc-1', Number.NaN)).toThrow(/finite number > 0/);
    expect(() => f.calibrateScale('arc-1', 10, { label: '   ', kind: 'distance' })).toThrow(/non-empty string/);
    expect(() => f.calibrateScale('arc-1', 10, null as never)).toThrow(/non-empty string/);
    expect(() => f.calibrateScale('arc-1', 10, 'km' as never)).toThrow(/non-empty string/);
    expect(JSON.stringify(facadeStateOf(f).map!.scale)).toBe(scaleBefore); // nothing applied
    // and a valid explicit re-measure over an EXISTING scale still works on demand (C13)
    expect(() => f.calibrateScale('arc-1', 5, { label: 'min', kind: 'time' })).not.toThrow();
  });
});

// =================================================================================
// 2. The fork lifecycle (C25/C24/C29, D41/D97, D75/F45, C5)
// =================================================================================

describe('C25/C24 — forkMap: the detach and the overlay re-point', () => {
  it('after forkMap the parent is no longer held; its in-place edits propagate NOWHERE (materialize included)', () => {
    const { f, map: parent, overlay } = load(fuyuki());
    f.forkMap();
    const st = facadeStateOf(f);
    const parentId = parent.id;
    expect(st.map!.id).not.toBe(parentId);
    expect(st.map!.forkedFrom).toBe(parentId); // D41 provenance: the immediate parent
    expect(overlay.mapId).toBe(st.map!.id); // the CALLER's overlay re-pointed in place (C24)
    // detach from both directions:
    parent.scale.unitPerPx = 99; // C24-style in-place edit of the library object
    parent.nodes = parent.nodes.filter((n) => n.id !== 'ghost-house');
    f.materialize(); // C8: rebuild — from the FORK's references
    expect(st.map!.nodes.some((n) => n.id === 'ghost-house')).toBe(true); // the fork keeps it
    expect(f.findRoute('outskirts', 'ghost-house').ok).toBe(true); // and routes through it
    expect(st.map!.scale.unitPerPx).toBe(0.2); // FX1's authored scale — never 99
  });

  it('forkMap refreshes the saved plane FROM THE FORK (the load-shaped list) and clears dirty; activeLayer rides', () => {
    const f = createFacade();
    const map = geoMap();
    const layerId = map.layers[0]!.id;
    f.loadMap(map, overlayFor(map));
    expect(f.hasUnsavedChanges()).toBe(false);
    f.forkMap();
    const st = facadeStateOf(f);
    expect(st.dirty).toBe(false); // the copy IS the saved plane — a fork starts clean
    expect(st.stale).toBe(true); // the next query rebuilds from the fork (C8)
    expect([...st.savedNodeIds]).toEqual(['alpha', 'beta']);
    expect([...st.savedLayerIds]).toEqual([layerId]);
    expect(st.map!.id).toMatch(/^map-\d+$/); // C5 scheme, distinct from the source's
    expect(st.savedScale).toEqual({ ...map.scale }); // a clone — never the live reference
    expect(st.activeLayer).toBe(layerId); // element ids preserved ⇒ viewer state unaffected
    expect(st.map!.nodes[0]!.id).toBe('alpha');
  });

  /* FINDING 2 — REPAIRED (the M4 gate ruling, registered as D99): forkMap
   * REFUSES a DIRTY session — "the session has unsaved changes — save it or
   * discard it before forking" — before any state moves (C30
   * reject-before-mutate). C25's sentence is "Forking copies library"; C29/D75/F45
   * make an unsaved editor draft non-library truth, and the pre-ruling
   * clone-the-live-map behavior was an IMPLICIT SAVE — silently promoting the
   * draft into the fork's SAVED plane (an unsaved calibration priced routing 10
   * 'km' where the pre-fork session served the SAVED 5 'units'), the exact class
   * C13's explicit-action discipline and D10's user authority forbid. The check
   * rides the EXISTING D75 flag (cleared only by loadMap/saveMap) — nothing new
   * tracked. Consequence: the draft dies with the refusal (the user is TOLD,
   * not guessed around), and the pre-fork session keeps serving its SAVED
   * pricing byte-identically (F45). */
  it('FINDING 2 (repaired, D99): forkMap refuses a dirty session — the throw is field-precise and the saved pricing stays INTACT after the refused fork', () => {
    const map = geoMap();
    const overlay = overlayFor(map);
    const f = createFacade();
    f.loadMap(map, overlay);
    f.setCurrentLocation('alpha');
    f.materialize();
    f.saveMap(); // saved truth: 1 unit/px
    expect(f.hasUnsavedChanges()).toBe(false);
    f.calibrateScale('arc-1', 10, { label: 'km', kind: 'distance' }); // UNSAVED draft: 2 km/px
    expect(f.hasUnsavedChanges()).toBe(true);
    expect(f.findRoute('alpha', 'beta').total).toBeCloseTo(5, 10); // F45 holds pre-fork
    const mapRef = facadeStateOf(f).map;
    const savedScale = facadeStateOf(f).savedScale;
    // D99: THE refusal — field-precise, naming the state and both honest
    // recovery paths; the exclusion form (D98) refuses identically, the gate
    // precedes the channel.
    expect(() => f.forkMap()).toThrow(/the session has unsaved changes/);
    expect(() => f.forkMap()).toThrow(/save it or discard it before forking/);
    expect(() => f.forkMap(new Set(['map-999']))).toThrow(/unsaved changes/);
    // C30: NOTHING moved — the fork never landed, the draft was never promoted:
    expect(facadeStateOf(f).map).toBe(mapRef); // no fork installed (C25 invariant — the reference stands)
    expect(facadeStateOf(f).savedScale).toBe(savedScale);
    expect(facadeStateOf(f).savedScale!.unitPerPx).toBe(1); // the SAVED scale, still 1
    expect(overlay.mapId).toBe(map.id);     // the chat still references the parent (C24)
    expect(f.hasUnsavedChanges()).toBe(true); // the draft still stands — save or discard stays the user's call (D10)
    // and the SAVED pricing is INTACT after the refused fork (F45/FX3-class):
    const route = f.findRoute('alpha', 'beta');
    expect(route.total).toBeCloseTo(5, 10); // no 5→10 drift
    expect(route.unit).toBe('units');       // no 'units'→'km' drift
  });
});

describe('D97 — saveForkToLibrary: the D56 contract-gap ruling', () => {
  it('refuses field-precisely on a non-fork load and mutates nothing (C25/D41, C30)', () => {
    const { f, map } = load(fuyuki());
    const before = savedPlane(f);
    expect(() => f.saveForkToLibrary()).toThrow(/not a fork/);
    expect(savedPlane(f)).toEqual(before);
    expect(map.id).toBe('fuyuki-misaki'); // the loaded object untouched
  });

  it('returns the fork AS IT STANDS (post-edits, provenance carried), deep-copied; NO facade state moves', () => {
    const { f, overlay } = load(fuyuki());
    f.forkMap();
    const forkId = facadeStateOf(f).map!.id;
    const forkLayer = facadeStateOf(f).map!.layers[0]!.id;
    f.upsertNode({ id: '', label: 'Fork Only Node', kind: 'location', layer: forkLayer }); // post-edit (unsaved)
    expect(f.hasUnsavedChanges()).toBe(true);
    const before = savedPlane(f);
    const ret = f.saveForkToLibrary();
    expect(savedPlane(f)).toEqual(before); // D97: NOT a load event — no dirty clear,
    //   no saved-plane move, no rebuild flag
    expect(ret.id).toBe(forkId); // the fork's OWN id — whatever the library calls it
    expect(ret.forkedFrom).toBe('fuyuki-misaki'); // provenance carried as-is (D41/D97)
    expect(ret.nodes.some((n) => n.label === 'Fork Only Node')).toBe(true); // post-edits
    expect(() => validateWorldMap(ret)).not.toThrow(); // save-ready data
    // detached: mutating the return never touches the facade's map
    ret.nodes = ret.nodes.filter((n) => n.label !== 'Fork Only Node');
    expect(facadeStateOf(f).map!.nodes.some((n) => n.label === 'Fork Only Node')).toBe(true);
    // stateless: a second call re-clones (a fresh object, same content)
    const ret2 = f.saveForkToLibrary();
    expect(ret2).not.toBe(ret);
    expect(ret2.nodes.some((n) => n.label === 'Fork Only Node')).toBe(true);
    void overlay;
  });

  it('the save-back never re-establishes the saved plane: a later saveMap still persists (D97 statelessness)', () => {
    const { f } = load(geoMap());
    f.saveMap();
    f.forkMap();
    f.calibrateScale('arc-1', 20, { label: 'km', kind: 'distance' }); // 4 km/px — dirty draft
    void f.saveForkToLibrary(); // the D97 save-back
    expect(f.hasUnsavedChanges()).toBe(true); // the dirty flag SURVIVED the save-back
    expect(facadeStateOf(f).savedScale!.unitPerPx).toBe(1); // the saved plane did NOT move
    f.saveMap(); // the ordinary F45 path, unharmed
    expect(f.findRoute('alpha', 'beta').total).toBeCloseTo(20, 10);
  });

  it("fork-of-fork chains carry the IMMEDIATE parent's id; the three ids stay pairwise distinct (A-022, C5)", () => {
    const { f, map } = load(fuyuki());
    f.forkMap();
    const f1Id = facadeStateOf(f).map!.id;
    const f1 = f.saveForkToLibrary();
    f.loadMap(f1, overlayFor(f1)); // re-establish the fork as the loaded state (the §9 path)
    f.forkMap();
    const f2 = facadeStateOf(f).map!;
    expect(f2.id !== f1Id && f2.id !== map.id).toBe(true);
    expect(f2.forkedFrom).toBe(f1Id); // the immediate parent, never the grandparent
  });
});

describe('duplicateMapData — a duplicate is not a fork (C25/D41), with deep-copy discipline', () => {
  it('strips forkedFrom, preserves element ids verbatim, re-ids beyond the exclusion set', () => {
    const forkClone: WorldMapData = { ...JSON.parse(JSON.stringify(fuyuki())), id: 'orphan-shadow-id', forkedFrom: 'fuyuki-misaki' };
    const exclude = new Set(['orphan-shadow-id', 'fuyuki-misaki', 'map-1', 'map-2', 'map-3']);
    const copy = duplicateMapData(forkClone, exclude);
    expect('forkedFrom' in copy).toBe(false); // STRIPPED — a duplicate re-syncs with nothing
    expect(copy.id).not.toBe('orphan-shadow-id');
    expect(copy.id).not.toMatch(/^(fuyuki-misaki|map-1|map-2|map-3)$/); // bump-forward (C5)
    expect(copy.id).toMatch(/^map-\d+$/); // engine-assigned, never the caller's shape
    expect(copy.nodes.map((n) => n.id)).toEqual(forkClone.nodes.map((n) => n.id)); // element ids
    expect(copy.edges.map((e) => e.id)).toEqual(forkClone.edges.map((e) => e.id));
    expect(() => validateWorldMap(copy)).not.toThrow();
  });

  it('independence both ways: either side mutating never reaches the other (C24/fork-grade detach)', () => {
    const src = fuyuki();
    const copy = duplicateMapData(src, new Set([src.id]));
    copy.nodes = copy.nodes.filter((n) => n.id !== 'ghost-house');
    copy.scale.unitPerPx = 42;
    expect(src.nodes.some((n) => n.id === 'ghost-house')).toBe(true);
    expect(src.scale.unitPerPx).toBe(0.2);
    src.scale.unitPerPx = 7; // the source moved later — the copy holds its own
    expect(copy.scale.unitPerPx).toBe(42);
  });
});

describe('the fork overlay re-point vs validateOverlay (the F50 brick seam on the fork leg)', () => {
  it("an overlay bound to the fork's PRESERVED ids survives the round-trip load, blocks intact (F50/C34)", () => {
    const { f, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-misaki', { x: 220, y: 220 }); // 1 waypoint + its kNN user edge
    f.setBlocked('arc-fuyuki-station-misaki-town', 'strike');
    f.setNodeBlocked('ghost-house', 'haunted');
    expect(overlay.userNodes[0]!.id).toMatch(/^wp-/);
    f.forkMap(); // the C25 switch — the SAME overlay object now points at the fork
    const fork = JSON.parse(JSON.stringify(facadeStateOf(f).map!)) as WorldMapData;
    // the persistence round-trip: load the fork clone with the SAME chat overlay —
    // every chat key still binds to data the fork carries (element ids preserved):
    expect(() => validateOverlay(overlay, fork, { tolerateIneligiblePin: true })).not.toThrow();
    const reloaded = createFacade();
    reloaded.loadMap(fork, overlay);
    expect(overlay.mapId).toBe(fork.id); // the re-point is data-persistent, not a gimmer
    const g = reloaded.findRoute('outskirts', 'ghost-house'); // C34: the named refusal
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/Ghost House/);
    expect(g.reason).toMatch(/haunted/);
  });
});

// =================================================================================
// 3. The library seams — data in / data out, rejection-only shape, ORDER CONTRACT
// =================================================================================

const harnessLibrary = (): MapLibrary => {
  // Angular exposes an InjectionToken's standalone factory on ɵprov — the only
  // route to the harness impl (the class is file-private in map-library.ts).
  const prov = (MAP_LIBRARY as unknown as { ɵprov: { factory?: () => unknown } }).ɵprov;
  if (prov === undefined || typeof prov.factory !== 'function') {
    throw new Error('harness library factory unreachable — the InjectionToken ɵprov shape drifted');
  }
  return prov.factory() as MapLibrary;
};

describe('B-137 harness library — the store never sees live in-place edits (R4/C24)', () => {
  it('data in AND data out are independent copies; a C24 live edit never reaches the stored row', async () => {
    const lib = harnessLibrary();
    const map = geoMap();
    await lib.save(map);
    map.scale.unitPerPx = 42; // C24-style in-place edit of the live object after the save
    map.nodes.push({ id: 'bootstrap-injected', label: 'Draft', kind: 'location', layer: map.layers[0]!.id });
    const stored = await lib.get(map.id);
    expect(stored).not.toBeNull();
    expect(stored!.scale.unitPerPx).toBe(1); // the store kept the save-moment state
    expect(stored!.nodes).toHaveLength(2);
    stored!.name = 'Renamed Through The Hand-Back';
    expect((await lib.get(map.id))!.name).toBe('Strait Anchor'); // each read is ITS OWN copy
  });

  it('same-name rows behave independently regardless of list order (the ORDER CONTRACT)', async () => {
    const lib = harnessLibrary();
    const a = geoMap();
    a.id = 'map-row-a';
    a.nodes[0]!.label = 'Alpha Of A'; // a discriminating marker deep in the row
    await lib.save(a);
    const b = duplicateMapData(a, new Set(['map-row-a']));
    b.id = 'map-row-b'; // same authored name, different row
    await lib.save(b);
    const rows: readonly LibraryEntry[] = await lib.list();
    expect(rows.map((r) => r.id).sort()).toEqual(['map-row-a', 'map-row-b']); // BOTH render
    expect((await lib.get('map-row-a'))!.nodes[0]!.label).toBe('Alpha Of A'); // identity get
    expect((await lib.get('map-row-b'))!.nodes[0]!.label).toBe('Alpha Of A'); // a deep copy of A
    await lib.delete('map-row-a'); // keyed delete — exactly one row dies
    expect((await lib.list()).map((r) => r.id)).toEqual(['map-row-b']);
    expect(await lib.get('map-row-a')).toBeNull();
  });

  it('save is an upsert keyed by map.id — a re-save replaces its own row, never a neighbor', async () => {
    const lib = harnessLibrary();
    const first = geoMap();
    first.id = 'map-fork-1';
    await lib.save(first);
    const sibling = duplicateMapData(first, new Set(['map-fork-1']));
    sibling.id = 'map-keeper';
    await lib.save(sibling);
    await lib.save({ ...first, name: 'Uplands Restated' }); // same id — the upsert shape
    const rows = await lib.list();
    expect(rows).toHaveLength(2);
    expect((await lib.get('map-fork-1'))!.name).toBe('Uplands Restated');
    expect((await lib.get('map-keeper'))!.name).toBe('Strait Anchor');
  });
});

/** A hostile store: every method throws SYNCHRONOUSLY (not a rejected promise). */
class SyncThrowStore implements LocalforageStore {
  readonly boom = new Error('driver exploded synchronously');
  getItem<T = unknown>(): Promise<T | null> {
    throw this.boom;
  }
  setItem<T>(_key: string, value: T): Promise<T> {
    throw this.boom;
  }
  removeItem(): Promise<void> {
    throw this.boom;
  }
  iterate<T, U>(_cb: (value: T, key: string, i: number) => U): Promise<U> {
    throw this.boom;
  }
}

/** A deterministic fake with a FIXED walk order (list() must not inherit it). */
class FixedWalkStore implements LocalforageStore {
  constructor(readonly data: Map<string, unknown>) {}
  async getItem<T = unknown>(key: string): Promise<T | null> {
    const v = this.data.get(key);
    return (v === undefined ? null : JSON.parse(JSON.stringify(v))) as T;
  }
  async setItem<T>(key: string, value: T): Promise<T> {
    this.data.set(key, JSON.parse(JSON.stringify(value)));
    return value;
  }
  async removeItem(key: string): Promise<void> {
    this.data.delete(key);
  }
  async iterate<T, U>(cb: (value: T, key: string, i: number) => U): Promise<U> {
    let i = 0;
    for (const [key, value] of this.data) {
      i += 1;
      const out = cb(JSON.parse(JSON.stringify(value)) as T, key, i);
      if (out !== undefined) return out;
    }
    return undefined as U;
  }
}

class SingleInstance implements LocalforageInstance {
  constructor(readonly store: LocalforageStore) {}
  createInstance(): LocalforageStore {
    return this.store;
  }
}

describe('C-003 host library — the rejection-only shape holds against a hostile store', () => {
  it('every method returns a rejected promise — no synchronous throw ever escapes the seam', async () => {
    const library = createLocalforageMapLibrary(new SingleInstance(new SyncThrowStore()));
    const expectRejected = (call: () => unknown): Promise<unknown> => {
      let promise: Promise<unknown> | undefined;
      expect(() => {
        promise = call() as Promise<unknown>;
      }).not.toThrow(); // the seam contract: rejection, never a synchronous throw
      return promise!;
    };
    const map = geoMap();
    await expect(expectRejected(() => library.save(map))).rejects.toThrow('driver exploded synchronously');
    await expect(expectRejected(() => library.get(map.id))).rejects.toThrow('driver exploded synchronously');
    await expect(expectRejected(() => library.list())).rejects.toThrow('driver exploded synchronously');
    await expect(expectRejected(() => library.delete(map.id))).rejects.toThrow('driver exploded synchronously');
  });

  it('a row whose value.id disagrees with its walk key resolves ONLY by the key (the C5 store-key identity)', async () => {
    const backing = new Map<string, unknown>();
    const legacy = geoMap();
    legacy.id = 'value-claims-different';
    backing.set('legacy-key', JSON.parse(JSON.stringify(legacy)));
    const library = createLocalforageMapLibrary(new SingleInstance(new FixedWalkStore(backing)));
    const rows = await library.list();
    expect(rows).toEqual([{ id: 'legacy-key', name: 'Strait Anchor', forkedFrom: null }]); // the KEY is the row id
    expect((await library.get('legacy-key'))!.id).toBe('value-claims-different'); // get honors the key
    await library.delete('legacy-key'); // and the key is the identity delete dies by
    expect((await library.list()).map((r) => r.id)).toEqual([]);
  });

  it('list() sorts by name (id tiebreak) even when the walk order says otherwise — driver order is never the truth', async () => {
    const backing = new Map<string, unknown>();
    const put = (id: string, name: string): void => {
      const m = geoMap();
      m.id = id;
      m.name = name;
      backing.set(id, JSON.parse(JSON.stringify(m)));
    };
    put('map-z', 'Zulu Reach');
    put('map-a', 'Alpha Crossing');
    put('map-m2', 'Midgate');
    put('map-m1', 'Midgate'); // same name — the id tiebreak, never insertion order
    const library = createLocalforageMapLibrary(new SingleInstance(new FixedWalkStore(backing)));
    const rows = await library.list();
    expect(rows.map((r) => r.id)).toEqual(['map-a', 'map-m1', 'map-m2', 'map-z']);
  });
});

// =================================================================================
// 4. FINDING 1 — REPAIRED (the M4 gate ruling, registered as D98): the fork seam's
// id-exclusion channel
//
// The original finding: forkMap had no id-exclusion channel, so a NEW PROCESS
// forking a stored non-scheme row re-issued 'map-1' and D97's save-back UPSERTED
// BY THAT ID — silently REPLACING an unrelated stored map from a prior session
// (deterministically demonstrated as a green two-process pin against the
// pre-repair tree; filed with the gate report). The repair (D98):
// forkMap(exclude?: ReadonlySet<string>) — the exact C5 contract
// createWorldMap/duplicateMapData already carry. The CALLER brings its stored-id
// knowledge (the library's id set); the ENGINE still generates and never a
// proposed id; excluded candidates are skipped while the counter still advances.
// The pin keeps the two-process demonstration with the FIXED behavior: session 2
// forks AROUND its store's ids, the save-back lands as a NEW row, and
// 'Alpha(original)' SURVIVES.
// =================================================================================
describe('FINDING 1 (repair pin, D98) — session 2 forks AROUND the stored ids; the save-back lands as a NEW row', () => {
  it('a fresh process passes its store’s ids as exclude; the fork id mints around them and the D97 save-back never clobbers Alpha(original)', async () => {
    // Session 1 (a prior process): mint an ORIGINAL — the host persists it under map-1.
    vi.resetModules();
    const s1create = await import('../../src/core/model/create');
    const family = s1create.createWorldMap('Alpha', new Set(['fuyuki-misaki']));
    expect(family.id).toBe('map-1'); // the stored original (host knowledge, prior process)

    // The host's library store AS SESSION 2 FINDS IT: the seeded demo row plus
    // session 1's persisted original. The memory harness save upserts BY map.id —
    // the same keyed-upsert shape the D97 save-back rides against in the host
    // (the B-137 seam), so the repaired behavior is demonstrated end-to-end.
    const lib = harnessLibrary();
    await lib.save(family); // map-1 — Alpha(original), as persisted by the prior session
    const seated: WorldMapData = JSON.parse(JSON.stringify(geoMap()));
    seated.id = 'fuyuki-misaki';
    await lib.save(seated);

    // Session 2 (a NEW process): the user forks 'fuyuki-misaki' and saves the fork
    // back — the caller hands the store's id set to the engine (the D98 channel);
    // C5: the engine still GENERATES, never a proposed id.
    vi.resetModules();
    const s2 = await import('../../src/core/facade');
    const row: WorldMapData = JSON.parse(JSON.stringify(seated));
    const facade = s2.createFacade();
    facade.loadMap(row, overlayFor(row));
    const storeIds = new Set((await lib.list()).map((r) => r.id)); // the caller's stored-id knowledge
    expect([...storeIds].sort()).toEqual(['fuyuki-misaki', 'map-1']);
    facade.forkMap(storeIds);
    const fork = facade.saveForkToLibrary();
    expect(fork.id).toBe('map-2');      // minted AROUND the excluded 'map-1' — skip + counter advance
    expect(fork.id).not.toBe(family.id); // no collision with the prior session's stored row

    // The save-back: the host upserts BY the fork's OWN id — a NEW row lands.
    await lib.save(fork);
    const rows = (await lib.list()).map((r) => r.id).sort();
    expect(rows).toEqual(['fuyuki-misaki', 'map-1', 'map-2']); // three rows — nothing replaced
    expect((await lib.get('map-1'))!.name).toBe('Alpha'); // 'Alpha(original)' SURVIVES the save-back
  });
});

// =================================================================================
// 5. The MDS paste importer (F05/D55/FX3) — C30/C32 at the panel's engine seam
// =================================================================================

const PASTE = (body: string): string => `<walking_distances>\n${body}\n</walking_distances>\n`;

describe('F05 — the paste importer: garbage is collected field-precise words, never a half-map', () => {
  it('COLLECTED defects (one report per issue, not first-only, C30)', () => {
    const text = PASTE(
      [
        'KEY:A:Aka|B:Bee', // a clean KEY — the defects must be line-local, not structural
        'DIST(min):',
        'A:B12,ZZ9', // unknown ZZ (1)
        'A:B14', // duplicate pair — first defined above (2)
        'A:A7', // a source-to-self pair (3): pairs must differ
        'B', // a malformed DIST row, no colon (4)
        'TRANSIT:',
        'A:B9x(vape)', // a malformed TRANSIT entry (5)
      ].join('\n'),
    );
    let refused: MapValidationError | null = null;
    try {
      importLookupTable(text);
    } catch (err) {
      if (err instanceof MapValidationError) refused = err;
    }
    expect(refused, 'a garbage paste must refuse, never half-build').not.toBeNull();
    const issues = refused!.issues;
    expect(issues.length).toBeGreaterThanOrEqual(4); // collected — one report per defect
    expect(issues.every((i) => i.path.startsWith('line '))).toBe(true); // field-precise
    expect(issues.some((i) => /unknown abbreviation 'ZZ'/.test(i.message))).toBe(true);
    expect(issues.some((i) => /must differ/.test(i.message))).toBe(true); // the A:A7 pair-to-self
    expect(issues.some((i) => /duplicate DIST pair/.test(i.message))).toBe(true);
    expect(issues.some((i) => /malformed DIST row/.test(i.message))).toBe(true);
    expect(issues.some((i) => /malformed TRANSIT entry/.test(i.message))).toBe(true);
  });

  it('the drop rule: a transit mode outside the built-in trio vanishes WITHOUT an issue', () => {
    const map = importLookupTable(
      PASTE(
        [
          'KEY:S:Storefront|C:Cavern',
          'DIST(min):',
          'S:C12',
          'TRANSIT:',
          'C:S3km(sub),S2h(car)', // 'sub' drops the whole entry, silently (pre-validation)
        ].join('\n'),
      ),
    );
    const edge = map.edges.find(
      (e) => (e.source === 'C' && e.target === 'S') || (e.source === 'S' && e.target === 'C'),
    )!; // C6: the transit lands on the PAIR's one edge (the walked one), ids follow table order
    expect(Object.keys(edge.modes).sort()).toEqual(['car', 'walk']); // sub never survived
    expect(edge.modes.car!.authoredMinutes).toBe(120); // 2h × 60 (C11 normalization)
    expect(edge.modes.walk!.authoredMinutes).toBe(12); // the DIST row verbatim
    expect(edge.authoredDistance).toBeUndefined(); // the 3km rode the DROPPED entry
  });

  it("importLookupTable returns a map the engine itself accepts, D45's scale inside (C30/F50 within)", () => {
    // DIST format (legacy): ONE source per line — every comma token names its TARGET.
    const map = importLookupTable(
      PASTE(
        [
          'KEY:A:Alpha|B:Bravo|C:Charlie',
          'DIST(min):',
          'A:B30',
          'A:C40',
          'B:C50',
          'TRANSIT:',
          'B:C5h(train)',
        ].join('\n'),
      ),
    );
    expect(() => validateWorldMap(map)).not.toThrow(); // the importer ran validateWorldMap
    expect(map.scale).toEqual({ unitPerPx: 1, unitLabel: 'min', unitKind: 'time' }); // D45
    expect(map.layers).toHaveLength(1);
    expect(map.edges.find((e) => e.id === 'import-A-B')!.modes.walk!.authoredMinutes).toBe(30); // EXACT (D64)
    const bc = map.edges.find(
      (e) => (e.source === 'B' && e.target === 'C') || (e.source === 'C' && e.target === 'B'),
    )!; // C6: ONE bidirectional edge carries both the walk pair and the transit entry
    expect(bc.modes.walk!.authoredMinutes).toBe(50);
    expect(bc.modes.train!.authoredMinutes).toBe(300); // 5h × 60 (C11 normalization — hours, C11)
  });

  it('FX3-lite, re-derived by hand: a 3-4-5 walking triangle embeds at its authored minutes', () => {
    // A–B 30, A–C 40, B–C 50: 30²+40²=50² ⇒ exactly realizable in 2D; classical MDS
    // must recover all three pairwise distances to near machine precision.
    const map = importLookupTable(
      PASTE(['KEY:A:Alpha|B:Bravo|C:Charlie', 'DIST(min):', 'A:B30', 'A:C40', 'B:C50'].join('\n')),
    );
    const pos = new Map(map.nodes.map((n) => [n.id, n.position] as const));
    expect(pos.get('A')).toBeDefined();
    expect(pos.get('B')).toBeDefined();
    expect(pos.get('C')).toBeDefined();
    expect(euclid(pos.get('A')!, pos.get('B')!)).toBeCloseTo(30, 4);
    expect(euclid(pos.get('A')!, pos.get('C')!)).toBeCloseTo(40, 4);
    expect(euclid(pos.get('B')!, pos.get('C')!)).toBeCloseTo(50, 4);
  });

  it('an unconstrained KEY entry stays unpositioned — legal data, the degenerate geometry rule', () => {
    const map = importLookupTable(
      PASTE(['KEY:A:Alpha|B:Bravo|D:Detached', 'DIST(min):', 'A:B12'].join('\n')),
    );
    const detached = map.nodes.find((n) => n.id === 'D')!;
    expect(detached.position).toBeUndefined(); // no finite constraint ⇒ unpositioned (legal)
    expect(() => validateWorldMap(map)).not.toThrow();
    // and the engine loads it without complaint:
    const f = createFacade();
    expect(() => f.loadMap(map, overlayFor(map))).not.toThrow();
  });
});

describe('C5 re-id at the import seam — a second paste becomes a second map, never an overwrite', () => {
  it('generateMapId(knownIds) never re-issues an id the library already holds (the panel re-id ruling, engine side)', () => {
    const first = importLookupTable(PASTE(['KEY:X:Xenia|Y:Yonder', 'DIST(min):', 'X:Y9'].join('\n')));
    expect(first.id).toBe('imported-lookup-table'); // the engine's constant…
    const exclude = new Set<string>([first.id, 'fuyuki-misaki', 'map-1', 'map-2']);
    const freshId = generateMapId(exclude);
    expect(freshId).not.toBe('imported-lookup-table'); // …but the re-id picks beyond exclude
    expect(freshId).not.toBe('fuyuki-misaki');
    expect(freshId).toMatch(/^map-\d+$/);
    expect(['map-1', 'map-2'].includes(freshId)).toBe(false);
    const second = importLookupTable(PASTE(['KEY:X:Xenia|Y:Yonder', 'DIST(min):', 'X:Y9'].join('\n')));
    expect(second.id).toBe(first.id); // the SAME constant — irrelevant: it is re-id'd again
    expect(second).not.toBe(first); // structurally fresh data, never shared
  });
});

// =================================================================================
// 6. C23 — machine names never reach the prompt-facing structures (M4 slice)
// =================================================================================

describe('C23 — the M4 surfaces stay word-clean', () => {
  it("a forked map's snapshot carries only authored words — no map id, no layer id, no fork-id tokens", () => {
    const { f } = load(fuyuki());
    f.forkMap();
    f.setCurrentLocation('ghost-house'); // a named library node — the prompt surfaces fill
    f.materialize();
    const snap = f.getSnapshot();
    expect(snap.location).toBe('Ghost House'); // authored words, verbatim
    expect(snap.layer).toBe('Fuyuki City'); // the pin's layer NAME, never its id
    const blob = JSON.stringify(snap);
    expect(blob).not.toMatch(/fuyuki-misaki/); // the parent id (provenance) never renders
    expect(blob).not.toMatch(/map-\d+/); // the fork's id never renders
    expect(blob).not.toMatch(/layer-fuyuki|layer-misaki/); // layer ids never render — names do
    expect(snap.unit).toBeDefined();
  });

  it('the D97 save-back return keeps forkedFrom as DATA (provenance) — the prompt structures still never see it', () => {
    const { f } = load(fuyuki());
    f.forkMap();
    const st = f.getSnapshot();
    expect(JSON.stringify(st)).not.toMatch(/map-/); // pre- and post-fork alike — the unit check:
    void st;
    const ret = f.saveForkToLibrary();
    expect(ret.forkedFrom).toBeDefined(); // data, by D97's own design (carried as provenance)
    expect(f.getSnapshot().routes.every((r) => !/map-|waypoint/.test(r.mode))).toBe(true);
  });
});

// =================================================================================
// 7. Facade surface sanity for the M4 command list (the CORE.md §9 text)
// =================================================================================

describe('the §9 command list — forkMap/saveForkToLibrary sit with the lifecycle block, refuse alone', () => {
  it('forkMap with no map loaded refuses field-precisely; state stays absoltely untouched', () => {
    const f = createFacade();
    expect(() => f.forkMap()).toThrow(/no map loaded/);
    expect(() => f.saveForkToLibrary()).toThrow(/no map loaded/);
    expect(f.hasUnsavedChanges()).toBe(false);
  });

  it('saveMap on a forked session persists the fork (the fork IS the loaded map), provenance rides', () => {
    const { f } = load(geoMap());
    f.saveMap();
    f.forkMap();
    expect(() => f.saveMap()).not.toThrow(); // C30 final gate accepts the fork wholesale
    expect(f.hasUnsavedChanges()).toBe(false);
    expect(facadeStateOf(f).map!.forkedFrom).toBeDefined();
  });
});
