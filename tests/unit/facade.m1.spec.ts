// Behavior tests for the M1 facade commands (A-002) + the P2 M1 viewer-state
// command (B-101).
// C8 materialization & stale flag · C24 live references · C27 orphan policy
// (keep, never snap) · C30 reject-before-mutate · C1 leaf-to-leaf pin ·
// C31 migration refusal · D17/D19 presence round-trip · D38 silent pin ·
// F01/D69 active-layer viewer state. (The D56 fork stubs became real commands
// in A-022 — covered by tests/unit/map-lifecycle/fork.spec.ts.)
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { MapValidationError } from '../../src/core/model/validate';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

// --- tiny inline map & overlay (fixtures are A-003's business) ----------------

const tinyMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-tiny',
  name: 'Tiny',
  layers: [{ id: 'layer-1', name: 'Tiny Layer' }],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
  nodes: [
    { id: 'n-district', label: 'Old District', kind: 'district', layer: 'layer-1' },
    { id: 'n-alpha', label: 'Alpha', kind: 'location', layer: 'layer-1', parent: 'n-district', position: { x: 10, y: 10 } },
    { id: 'n-beta', label: 'Beta', kind: 'location', layer: 'layer-1', parent: 'n-district', position: { x: 50, y: 10 } },
  ],
  edges: [
    { id: 'e-ab', source: 'n-alpha', target: 'n-beta', modes: { walk: { allowed: true } } },
  ],
});

const tinyOverlay = (): ChatMapOverlay => ({
  mapId: 'map-tiny',
  currentLocationId: 'n-alpha',
  travelMode: 'walk',
  userNodes: [
    { id: 'u-camp', label: 'Camp', kind: 'waypoint', layer: 'layer-1', position: { x: 30, y: 30 } },
  ],
  userEdges: [
    { id: 'e-uc', source: 'n-beta', target: 'u-camp', modes: { walk: { allowed: true } } },
  ],
  blocked: {}, nodeBlocked: {},
});

// Deliberately invalid — loadMap must refuse it at runtime (typed lie for TS).
const brokenMap = (): WorldMapData => {
  const m = JSON.parse(JSON.stringify(tinyMap()));
  m.name = '';                      // defect 1: empty name
  m.nodes[1].layer = 'layer-ghost'; // defect 2: unknown layer — collected, not first-only (C30)
  return m;
};

// Deliberately invalid overlay — loadMap must refuse it at runtime. D78/C32:
// an unknown travelMode no longer refuses a load (it degrades to 'walk'), so
// the refusal defect is a dangling blocked key instead.
const brokenOverlay = (): ChatMapOverlay => {
  const o = JSON.parse(JSON.stringify(tinyOverlay()));
  o.blocked['ghost-edge'] = 'no such arc';
  return o;
};

// The tiny map with a second layer added (F01) — gives setActiveLayer
// something to switch TO. An empty layer is legal: validators require nodes
// to reference known layers, never the reverse.
const twoLayerMap = (): WorldMapData => {
  const m = JSON.parse(JSON.stringify(tinyMap()));
  m.layers.push({ id: 'layer-2', name: 'Second Layer' });
  return m;
};

// D78: the tiny map plus a one-entry mode registry — 'horse' is declared, so
// it is in THIS map's universe and nowhere else.
const horseMap = (): WorldMapData => {
  const m = JSON.parse(JSON.stringify(tinyMap()));
  m.modes = [{ id: 'horse', label: 'Horseback', speed: 10, allowedByDefault: false }];
  return m;
};

// --- loadMap (C30, C8, C24) -----------------------------------------------------

describe('loadMap', () => {
  it('refuses an invalid map with a collected report and leaves the prior load untouched (C30)', () => {
    const f = createFacade();
    const map = tinyMap();
    const overlay = tinyOverlay();
    f.loadMap(map, overlay);
    f.materialize();
    const before = facadeStateOf(f).effective;

    let err: unknown = null;
    try {
      f.loadMap(brokenMap(), tinyOverlay());
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MapValidationError);
    expect((err as MapValidationError).issues.map((i) => i.path)).toEqual(['name', 'nodes[1].layer']);

    // prior state survives untouched: same references, same rebuilt graph (C30)
    expect(facadeStateOf(f).map).toBe(map);
    expect(facadeStateOf(f).overlay).toBe(overlay);
    f.materialize();
    expect(facadeStateOf(f).effective).toEqual(before);
  });

  it('refuses an invalid overlay the same way, before any state change (C30)', () => {
    const f = createFacade();
    expect(() => f.loadMap(tinyMap(), brokenOverlay())).toThrow(MapValidationError);
    expect(facadeStateOf(f).map).toBeNull();
    expect(facadeStateOf(f).overlay).toBeNull();
  });

  it("D78/C32: an overlay travelMode the loaded map doesn't know degrades to 'walk' — never a throw (the D58 tolerance shape)", () => {
    // chat state saved against a registry map: 'horse' is valid THERE and rides along untouched
    const overlay = tinyOverlay();
    overlay.travelMode = 'horse';
    const f = createFacade();
    f.loadMap(horseMap(), overlay);
    expect(overlay.travelMode).toBe('horse');

    // ...and degrades after the switch to a map whose universe lacks it (C32/D78)
    f.loadMap(tinyMap(), overlay);
    expect(overlay.travelMode).toBe('walk');
    expect(facadeStateOf(f).overlay).toBe(overlay); // C24: the stored overlay is still the caller's object
    expect(() => f.getSnapshot()).not.toThrow(); // the degraded load serves queries (C32)
  });

  it('D78/C32: the degrade lands only on a load that passes every other gate — a refused overlay keeps its travelMode (C30)', () => {
    const overlay = tinyOverlay();
    overlay.travelMode = 'horse'; // unknown to tinyMap ⇒ would degrade
    overlay.blocked['ghost-edge'] = 'dangling key'; // the refusal defect
    const f = createFacade();
    expect(() => f.loadMap(tinyMap(), overlay)).toThrow(MapValidationError);
    expect(overlay.travelMode).toBe('horse'); // NOT rewritten — reject-before-mutate held
  });

  it('stores references and marks stale; materialize() then yields the merged graph (C8, C24)', () => {
    const f = createFacade();
    const map = tinyMap();
    f.loadMap(map, tinyOverlay());
    expect(facadeStateOf(f).stale).toBe(true); // loadMap marks stale (C8)
    expect(facadeStateOf(f).map).toBe(map);    // the library object itself (C24)

    f.materialize();
    expect(facadeStateOf(f).stale).toBe(false);
    const eff = facadeStateOf(f).effective;
    expect(eff).not.toBeNull();
    expect(eff!.mapId).toBe('map-tiny');
    expect(eff!.nodes.map((n) => n.id)).toEqual(['n-district', 'n-alpha', 'n-beta', 'u-camp']);
    expect(eff!.edges.map((e) => e.id)).toEqual(['e-ab', 'e-uc']);
    expect(eff!.pin).toEqual({ id: 'n-alpha', valid: true });
  });

  it('reflects in-place library edits on the next materialize() — references, never copies (C24, C8)', () => {
    const map = tinyMap();
    const f = createFacade();
    f.loadMap(map, tinyOverlay());
    f.materialize();

    map.nodes.push({ id: 'n-gamma', label: 'Gamma', kind: 'location', layer: 'layer-1', parent: 'n-district' });
    map.nodes[1].label = 'Alpha Renamed';
    f.materialize(); // the C24 hook

    const eff = facadeStateOf(f).effective!;
    expect(eff.nodes.some((n) => n.id === 'n-gamma')).toBe(true);
    expect(eff.nodes.find((n) => n.id === 'n-alpha')?.label).toBe('Alpha Renamed');
  });
});

// --- validateImport / migrateData (C30, C31) -------------------------------------

describe('validateImport / migrateData', () => {
  it('validateImport checks the map and changes no state (C30)', () => {
    const f = createFacade();
    expect(() => f.validateImport(tinyMap())).not.toThrow();
    expect(() => f.validateImport(brokenMap())).toThrow(MapValidationError);
    expect(facadeStateOf(f).map).toBeNull(); // pure — nothing was loaded
  });

  it('migrateData returns validated data and changes no state; newer versions are refused (C31)', () => {
    const f = createFacade();
    expect(f.migrateData(tinyMap())).toEqual(tinyMap());
    expect(facadeStateOf(f).map).toBeNull();
    expect(() => f.migrateData({ schemaVersion: 3 } as unknown)).toThrow(MapValidationError);
  });
});

// --- setCurrentLocation (C1, D38) -------------------------------------------------

describe('setCurrentLocation', () => {
  it('moves the pin onto a leaf silently; null clears it (C1, D38)', () => {
    const f = createFacade();
    f.loadMap(tinyMap(), tinyOverlay());
    f.materialize();

    expect(() => f.setCurrentLocation('n-beta')).not.toThrow(); // silent (D38)
    f.materialize();
    expect(facadeStateOf(f).effective!.pin).toEqual({ id: 'n-beta', valid: true });

    f.setCurrentLocation(null);
    f.materialize();
    expect(facadeStateOf(f).effective!.pin).toEqual({ id: null, valid: false });
  });

  it('refuses a container node with a field-precise error and leaves the pin alone (C1)', () => {
    const f = createFacade();
    f.loadMap(tinyMap(), tinyOverlay());
    f.materialize();

    expect(() => f.setCurrentLocation('n-district')).toThrow(/n-district/);
    expect(() => f.setCurrentLocation('n-district')).toThrow(/container/i);
    f.materialize();
    expect(facadeStateOf(f).effective!.pin.id).toBe('n-alpha'); // unchanged after the throw
  });

  it("refuses a childless container kind per D58 — 'districts never hold it' is unconditional (C1/F27)", () => {
    const map = tinyMap();
    map.nodes.push({ id: 'n-shinto', label: 'Shinto', kind: 'district', layer: 'layer-1' });
    const f = createFacade();
    f.loadMap(map, tinyOverlay());
    f.materialize();

    expect(() => f.setCurrentLocation('n-shinto')).toThrow(/container/i);
    f.materialize();
    expect(facadeStateOf(f).effective!.pin.id).toBe('n-alpha'); // refused before mutating (C30)
  });

  it('refuses an unknown node id (C1)', () => {
    const f = createFacade();
    f.loadMap(tinyMap(), tinyOverlay());
    f.materialize();
    expect(() => f.setCurrentLocation('ghost')).toThrow(/ghost/);
  });

  it("throws '[TravelMapper] no map loaded' when nothing is loaded", () => {
    const f = createFacade();
    expect(() => f.setCurrentLocation('n-alpha')).toThrow('[TravelMapper] no map loaded');
  });
});

// --- setStatusNote / setTravelMode (D17, D19) --------------------------------------

describe('setStatusNote / setTravelMode', () => {
  it('round-trips the status note and travel mode on the overlay (D17, D19)', () => {
    const f = createFacade();
    f.loadMap(tinyMap(), tinyOverlay());

    f.setStatusNote('on the road to the station');
    f.setTravelMode('train');
    const state = facadeStateOf(f);
    expect(state.overlay!.statusNote).toBe('on the road to the station');
    expect(state.overlay!.travelMode).toBe('train');
    expect(state.stale).toBe(true); // mutations only set the flag (C8)

    f.setStatusNote(undefined);
    expect('statusNote' in facadeStateOf(f).overlay!).toBe(false); // cleared, not undefined-held
    f.materialize();
    expect(facadeStateOf(f).stale).toBe(false); // rebuild consumes the flag
  });

  it('presence commands refuse to act with nothing loaded', () => {
    const f = createFacade();
    expect(() => f.setStatusNote('x')).toThrow('[TravelMapper] no map loaded');
    expect(() => f.setTravelMode('walk')).toThrow('[TravelMapper] no map loaded');
  });

  it('setTravelMode refuses a runtime value outside {walk, car, train} before mutating the overlay (C30, F50)', () => {
    const f = createFacade();
    f.loadMap(tinyMap(), tinyOverlay());
    expect(() => f.setTravelMode('teleport' as never)).toThrow(/\[TravelMapper\]/);
    expect(facadeStateOf(f).overlay!.travelMode).toBe('walk'); // untouched by the refused call
  });

  it('setTravelMode accepts a registry mode of the loaded map and still rejects garbage (C30, D78)', () => {
    const overlay = tinyOverlay();
    const f = createFacade();
    f.loadMap(horseMap(), overlay);
    f.setTravelMode('horse'); // in the loaded map's universe — accepted
    expect(overlay.travelMode).toBe('horse');
    expect(() => f.setTravelMode('balloon' as never)).toThrow(/setTravelMode/); // not in the universe — refused
    expect(overlay.travelMode).toBe('horse'); // untouched by the refused call (C30)
  });

  it('setStatusNote refuses a non-string note before mutating the overlay (C30, D17)', () => {
    const f = createFacade();
    f.loadMap(tinyMap(), tinyOverlay());
    expect(() => f.setStatusNote(42 as never)).toThrow(/\[TravelMapper\]/);
    expect('statusNote' in facadeStateOf(f).overlay!).toBe(false); // untouched by the refused call
  });
});

// --- orphan policy (C27) ------------------------------------------------------------

describe('orphan policy', () => {
  it('keeps a dangling pin as { id, valid: false } — never snaps to a neighbor (C27)', () => {
    const f = createFacade();
    const overlay = tinyOverlay();
    overlay.currentLocationId = 'ghost-node'; // stale pin: not a load error (C27)
    f.loadMap(tinyMap(), overlay);

    expect(() => f.materialize()).not.toThrow();
    expect(facadeStateOf(f).effective!.pin).toEqual({ id: 'ghost-node', valid: false });
  });
});

// --- setActiveLayer (P2 M1, F01/D69) ----------------------------------------------------
// Facade-held VIEWER state on FacadeState — not map data, not in the frozen
// ChatMapOverlay, never read by the snapshot (whose layer derives from the
// pin's node layer).

describe('setActiveLayer (Phase 2 M1)', () => {
  it("throws '[TravelMapper] setActiveLayer: no map loaded' when nothing is loaded", () => {
    const f = createFacade();
    expect(() => f.setActiveLayer('layer-1')).toThrow('[TravelMapper] setActiveLayer: no map loaded');
    expect(facadeStateOf(f).activeLayer).toBeNull(); // nothing was set
  });

  it('loadMap resets the active layer to the first layer of THAT map (F01, D69)', () => {
    const f = createFacade();
    expect(facadeStateOf(f).activeLayer).toBeNull(); // null until the first load
    f.loadMap(tinyMap(), tinyOverlay());
    expect(facadeStateOf(f).activeLayer).toBe('layer-1'); // deterministic first paint (D69)
  });

  it('a valid layer id sets it and marks stale (C8)', () => {
    const f = createFacade();
    f.loadMap(twoLayerMap(), tinyOverlay());
    f.materialize();
    expect(facadeStateOf(f).stale).toBe(false); // clean baseline — the next assertion is meaningful

    f.setActiveLayer('layer-2');
    expect(facadeStateOf(f).activeLayer).toBe('layer-2');
    expect(facadeStateOf(f).stale).toBe(true); // mutations only set the flag (C8) even with no query reading it yet
  });

  it("refuses an unknown layer id with the exact message, before any mutation (C30, F50)", () => {
    const f = createFacade();
    f.loadMap(twoLayerMap(), tinyOverlay());
    expect(() => f.setActiveLayer('layer-ghost')).toThrow(
      "[TravelMapper] setActiveLayer: unknown layer id 'layer-ghost'",
    );
    expect(facadeStateOf(f).activeLayer).toBe('layer-1'); // untouched by the refused call
  });

  it('reloading a different map resets the active layer to ITS first layer (C24, F01)', () => {
    const f = createFacade();
    f.loadMap(twoLayerMap(), tinyOverlay());
    f.setActiveLayer('layer-2');
    expect(facadeStateOf(f).activeLayer).toBe('layer-2');

    f.loadMap(tinyMap(), tinyOverlay()); // a different map whose only layer is 'layer-1'
    expect(facadeStateOf(f).activeLayer).toBe('layer-1'); // never inherits across loads (C24)
  });
});
