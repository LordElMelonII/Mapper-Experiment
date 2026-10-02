// Unit tests for buildEffectiveGraph (A-002) — the C8 materialization
// semantics: library ∪ overlay merge, blocked union (add-only, C2/D20),
// stale-block drop (C32/C24), pin validity incl. the C1 leaf rule, and the
// null-map case. Tiny inline maps only — fixtures are A-003's business.
import { describe, expect, it } from 'vitest';
import { buildEffectiveGraph } from '../../../src/core/model/effective';
import type { ChatMapOverlay, WorldMapData } from '../../../src/core/api';

// --- tiny inline map & overlay -------------------------------------------------

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
    { id: 'n-gamma', label: 'Gamma', kind: 'location', layer: 'layer-1', parent: 'n-district', position: { x: 90, y: 10 } },
  ],
  edges: [
    { id: 'e-ab', source: 'n-alpha', target: 'n-beta', modes: { walk: { allowed: true } } },
    { id: 'e-bg', source: 'n-beta', target: 'n-gamma', modes: { walk: { allowed: true } }, blocked: { reason: 'bridge out' } },
  ],
});

const tinyOverlay = (over: Partial<ChatMapOverlay> = {}): ChatMapOverlay => ({
  mapId: 'map-tiny',
  currentLocationId: 'n-alpha',
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {},
  ...over,
});

// --- merge (C8) ------------------------------------------------------------------

describe('buildEffectiveGraph — merge (C8)', () => {
  it('merges the library and overlay planes into one query surface (C8, CORE.md §2)', () => {
    const eff = buildEffectiveGraph(tinyMap(), tinyOverlay({
      userNodes: [{ id: 'u-camp', label: 'Camp', kind: 'waypoint', layer: 'layer-1', position: { x: 30, y: 30 } }],
      userEdges: [{ id: 'e-uc', source: 'u-camp', target: 'n-alpha', modes: { walk: { allowed: true } } }],
    }));
    expect(eff.mapId).toBe('map-tiny');
    expect(eff.nodes.map((n) => n.id)).toEqual(['n-district', 'n-alpha', 'n-beta', 'n-gamma', 'u-camp']);
    expect(eff.edges.map((e) => e.id)).toEqual(['e-ab', 'e-bg', 'e-uc']);
  });

  it('never mutates its inputs — the map is the live library object (C24, C30)', () => {
    const map = tinyMap();
    const overlay = tinyOverlay({ blocked: { 'e-ab': 'rockslide' } });
    const mapSnapshot = JSON.stringify(map);
    const overlaySnapshot = JSON.stringify(overlay);

    buildEffectiveGraph(map, overlay);

    expect(JSON.stringify(map)).toBe(mapSnapshot);
    expect(JSON.stringify(overlay)).toBe(overlaySnapshot);
  });
});

// --- blocked union (C2, D20) --------------------------------------------------------

describe('buildEffectiveGraph — blocked union (C2, D20)', () => {
  it('applies an overlay block to a clean edge without touching the library edge object', () => {
    const map = tinyMap();
    const eff = buildEffectiveGraph(map, tinyOverlay({ blocked: { 'e-ab': 'rockslide' } }));

    const merged = eff.edges.find((e) => e.id === 'e-ab');
    expect(merged?.blocked).toEqual({ reason: 'rockslide' });
    expect(map.edges[0].blocked).toBeUndefined(); // library object untouched (C24)

    // edges without an overlay entry pass through as the same live objects (C24)
    expect(eff.edges.find((e) => e.id === 'e-bg')).toBe(map.edges[1]);
  });

  it('cannot lift a library-level block — the overlay can only add, never remove (C2, D20)', () => {
    const eff = buildEffectiveGraph(tinyMap(), tinyOverlay()); // no blocked key for e-bg
    expect(eff.edges.find((e) => e.id === 'e-bg')?.blocked).toEqual({ reason: 'bridge out' });
  });

  it('keeps an already-blocked edge blocked when the overlay restates it, with the overlay reason', () => {
    const eff = buildEffectiveGraph(tinyMap(), tinyOverlay({ blocked: { 'e-bg': 'flooded' } }));
    expect(eff.edges.find((e) => e.id === 'e-bg')?.blocked).toEqual({ reason: 'flooded' });
  });

  it('drops block keys whose edge no longer exists — silent degrade after a live library edit (C24, C32)', () => {
    const eff = buildEffectiveGraph(tinyMap(), tinyOverlay({ blocked: { 'e-gone': 'vanished' } }));
    expect(eff.edges).toHaveLength(2);
    expect(eff.edges.every((e) => e.blocked?.reason !== 'vanished')).toBe(true);
  });
});

// --- pin validity (C1, C27) -----------------------------------------------------------

describe('buildEffectiveGraph — pin (C1, C27)', () => {
  it('is valid for an existing leaf, including an overlay user node', () => {
    expect(buildEffectiveGraph(tinyMap(), tinyOverlay()).pin).toEqual({ id: 'n-alpha', valid: true });
    const withUser = tinyOverlay({
      currentLocationId: 'u-camp',
      userNodes: [{ id: 'u-camp', label: 'Camp', kind: 'waypoint', layer: 'layer-1', position: { x: 1, y: 1 } }],
    });
    expect(buildEffectiveGraph(tinyMap(), withUser).pin).toEqual({ id: 'u-camp', valid: true });
  });

  it('is invalid for an unknown id — the pin is kept, never snapped (C27)', () => {
    expect(buildEffectiveGraph(tinyMap(), tinyOverlay({ currentLocationId: 'ghost' })).pin)
      .toEqual({ id: 'ghost', valid: false });
  });

  it('is invalid for a container — a node other nodes parent to never holds the pin (C1)', () => {
    expect(buildEffectiveGraph(tinyMap(), tinyOverlay({ currentLocationId: 'n-district' })).pin)
      .toEqual({ id: 'n-district', valid: false });
  });

  it('is invalid for a childless container kind — districts never hold the pin, empty or not (C1/F27, D58)', () => {
    const map = tinyMap();
    map.nodes.push({ id: 'n-shinto', label: 'Shinto', kind: 'district', layer: 'layer-1' });
    expect(buildEffectiveGraph(map, tinyOverlay({ currentLocationId: 'n-shinto' })).pin)
      .toEqual({ id: 'n-shinto', valid: false });
  });

  it('is valid for each pin-eligible leaf kind — location, hub, waypoint (D58)', () => {
    for (const kind of ['location', 'hub', 'waypoint'] as const) {
      const map = tinyMap();
      map.nodes.push({ id: 'n-leaf', label: 'Leaf', kind, layer: 'layer-1' });
      expect(buildEffectiveGraph(map, tinyOverlay({ currentLocationId: 'n-leaf' })).pin, `kind '${kind}'`)
        .toEqual({ id: 'n-leaf', valid: true });
    }
  });

  it('is invalid when no pin is set', () => {
    expect(buildEffectiveGraph(tinyMap(), tinyOverlay({ currentLocationId: null })).pin)
      .toEqual({ id: null, valid: false });
  });
});

// --- null map -------------------------------------------------------------------------

describe('buildEffectiveGraph — null map', () => {
  it('map === null ⇒ empty graph, mapId null, pin kept but invalid (C27)', () => {
    const eff = buildEffectiveGraph(null, tinyOverlay({
      userNodes: [{ id: 'u-camp', label: 'Camp', kind: 'waypoint', layer: 'layer-1', position: { x: 1, y: 1 } }],
    }));
    expect(eff.mapId).toBeNull();
    expect(eff.nodes).toEqual([]); // an overlay alone is not a graph
    expect(eff.edges).toEqual([]);
    expect(eff.pin).toEqual({ id: 'n-alpha', valid: false });
  });
});
