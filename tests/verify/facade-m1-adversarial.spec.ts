// VERIFIER (Agent D) — adversarial facade sweep for the M1 commands:
// C27 orphan policy exercised through LIVE library edits (not just load-time
// stale pins), C1 pin invalidation when a leaf becomes a container, C30 on
// runtime presence commands, and the A-003 ↔ A-002 seam: the real FX1 fixture
// through the full M1 path (loadMap → materialize → presence → blocks union).
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

// --- tiny map for lifecycle tests --------------------------------------------------

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

const tinyOverlay = (pin: string | null): ChatMapOverlay => ({
  mapId: 'map-tiny',
  currentLocationId: pin,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {},
});

// --- C27 orphan policy through LIVE library edits (D33/D39/D47 real path) ----------

describe('C27 orphan policy — live library edit deletes the node under the pin', () => {
  it('keeps the pin, marks it invalid, never snaps; the deleted id is re-refused; re-pinning restores validity (C27, C24, C8)', () => {
    const f = createFacade();
    const map = tinyMap();
    f.loadMap(map, tinyOverlay('n-alpha'));
    f.materialize();
    expect(facadeStateOf(f).effective!.pin).toEqual({ id: 'n-alpha', valid: true });

    // host mutates the LIBRARY object in place (C24 live reference) — Alpha deleted
    map.nodes = map.nodes.filter((n) => n.id !== 'n-alpha');
    map.edges = map.edges.filter((e) => e.source !== 'n-alpha' && e.target !== 'n-alpha');
    f.materialize(); // C8: rebuild on change

    const eff = facadeStateOf(f).effective!;
    expect(eff.pin).toEqual({ id: 'n-alpha', valid: false }); // kept, invalidated, NOT snapped
    expect(eff.nodes.some((n) => n.id === 'n-alpha')).toBe(false);
    expect(eff.pin.id).not.toBe('n-beta'); // never silently snap to a neighbor (C27/D39)

    expect(() => f.setCurrentLocation('n-alpha')).toThrow(/unknown node id/);

    f.setCurrentLocation('n-beta'); // re-pin: injection may resume (C27)
    f.materialize();
    expect(facadeStateOf(f).effective!.pin).toEqual({ id: 'n-beta', valid: true });
  });

  it('a pinned LEAF that becomes a container via a live edit invalidates the pin (C1, C8)', () => {
    const f = createFacade();
    const map = tinyMap();
    f.loadMap(map, tinyOverlay('n-beta'));
    f.materialize();
    expect(facadeStateOf(f).effective!.pin).toEqual({ id: 'n-beta', valid: true });

    // host re-parents a node under the pinned leaf — Beta is now a container (C1)
    map.nodes.push({ id: 'n-child', label: 'Child', kind: 'location', layer: 'layer-1', parent: 'n-beta' });
    f.materialize();

    expect(facadeStateOf(f).effective!.pin).toEqual({ id: 'n-beta', valid: false });
  });
});

// --- C30 on runtime presence commands (FINDING 4) ------------------------------------

describe('FINDING 4 — see report (expected RED until triaged)', () => {
  it('FINDING 4 (C30): setTravelMode must reject a value outside {walk, car, train} before mutating the overlay — loadMap refuses the same field, the runtime command silently accepts it (one-line repro: f.setTravelMode("teleport"))', () => {
    const f = createFacade();
    f.loadMap(tinyMap(), tinyOverlay('n-alpha'));
    expect(() => f.setTravelMode('teleport' as never)).toThrow();
    // the overlay must be untouched by the refused command
    expect(facadeStateOf(f).overlay!.travelMode).toBe('walk');
  });
});

// --- the A-003 ↔ A-002 seam: the real FX1 fixture through the whole M1 path ---------

describe('FX1 through the facade (FX1, C8, C24, C2/D20, C1, F17)', () => {
  it('loads, materializes, holds the pin on a leaf hub of another layer, and unions chat blocks over the library (C2, D20)', () => {
    const overlay: ChatMapOverlay = {
      mapId: 'fuyuki-misaki',
      currentLocationId: 'emiya-residence',
      travelMode: 'walk',
      statusNote: 'on the road to the station',
      userNodes: [],
      userEdges: [],
      blocked: { 'arc-shopping-district-fuyuki-bridge': 'Protest shuts the bridge approach' },
    };
    const map: WorldMapData = JSON.parse(JSON.stringify(fuyukiMap)); // deepFreeze would poison mutation tests
    const f = createFacade();

    expect(() => f.loadMap(map, overlay)).not.toThrow(); // FX1 validates against the frozen contract (F50)
    f.materialize();

    const eff = facadeStateOf(f).effective!;
    expect(eff.mapId).toBe('fuyuki-misaki');
    expect(eff.nodes).toHaveLength(16); // 13 Fuyuki leaves + 2 districts + Misaki Town
    expect(eff.edges).toHaveLength(30);
    expect(eff.pin).toEqual({ id: 'emiya-residence', valid: true });

    // C2/D20: chat-scoped block lands on a clean library edge…
    expect(eff.edges.find((e) => e.id === 'arc-shopping-district-fuyuki-bridge')?.blocked)
      .toEqual({ reason: 'Protest shuts the bridge approach' });
    // …the library's own blocked bridge stays blocked with ITS reason…
    expect(eff.edges.find((e) => e.id === 'arc-emiya-residence-fuyuki-bridge')?.blocked)
      .toEqual({ reason: 'Bridge closed by local authorities' });
    // …and every untouched edge is unchanged.
    expect(eff.edges.find((e) => e.id === 'arc-outskirts-fuyuki-bridge')?.blocked).toBeUndefined();

    // C1/F17: a hub is a leaf — the pin may sit on the cross-layer hub
    f.setCurrentLocation('misaki-town');
    f.materialize();
    expect(facadeStateOf(f).effective!.pin).toEqual({ id: 'misaki-town', valid: true });
  });

  it('the deep-frozen fixture survives the full M1 path unmutated (C24, C30, D57)', () => {
    const overlay: ChatMapOverlay = {
      mapId: 'fuyuki-misaki',
      currentLocationId: 'emiya-residence',
      travelMode: 'walk',
      userNodes: [],
      userEdges: [],
      blocked: {},
    };
    const snap = JSON.stringify(fuyukiMap);
    const f = createFacade();
    f.loadMap(fuyukiMap, overlay); // the frozen object itself, per C24
    f.materialize();
    f.setCurrentLocation('fuyuki-bridge');
    f.setStatusNote('at the bridge');
    f.materialize();

    expect(JSON.stringify(fuyukiMap)).toBe(snap); // reject-before-mutate + read-only materializer
    expect(Object.isFrozen(fuyukiMap)).toBe(true);
    expect(facadeStateOf(f).effective!.pin).toEqual({ id: 'fuyuki-bridge', valid: true });
  });
});
