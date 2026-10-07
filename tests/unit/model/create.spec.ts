// Pure map constructors (PKG A-022, Phase 3 M4): generateMapId (C5),
// createWorldMap (D79's new-map default), duplicateMapData (the library
// duplicate). D79 defaults verbatim (the C14-row-5 unitPerPx=1 pricing
// consequence is a routing-suite concern — the scale SHAPE is pinned here) ·
// C5 engine-assigned ids + the caller's exclusion discipline · C25/D41
// forkedFrom absent on create and duplicate · C24's deep-copy detach
// guarantee at the pure level.
import { describe, expect, it } from 'vitest';
import { createWorldMap, duplicateMapData, generateMapId } from '../../../src/core/model/create';
import type { WorldMapData } from '../../../src/core/api';

// A rich, valid-shaped source: every arm the constructors must carry through.
const richMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-source',
  name: 'Rich Source',
  layers: [
    { id: 'layer-a', name: 'Layer A' },
    { id: 'layer-b', name: 'Layer B', background: { url: 'https://example.com/bg.png' }, backgroundDim: 0.5 },
  ],
  scale: { unitPerPx: 0.25, unitLabel: 'km', unitKind: 'distance', terrainMultipliers: { swamp: 2 } },
  nodes: [
    { id: 'n-city', label: 'Old Town', kind: 'city', layer: 'layer-a' },
    { id: 'n-spot', label: 'The Spot', kind: 'location', layer: 'layer-a', parent: 'n-city', position: { x: 10, y: 20 }, aliases: ['spot'] },
    { id: 'n-hub', label: 'Depot', kind: 'hub', layer: 'layer-b', position: { x: 5, y: 5 }, transit: { type: 'train' } },
  ],
  edges: [
    { id: 'e-1', source: 'n-spot', target: 'n-hub', modes: { walk: { allowed: true }, car: { allowed: true, multiplier: 0.5 } }, terrain: 'road' },
  ],
  modes: [{ id: 'horse', label: 'Horseback', speed: 10, allowedByDefault: true }],
});

// --- generateMapId (C5) ----------------------------------------------------------

describe('generateMapId', () => {
  it('never returns a member of the caller-provided exclusion set (C5)', () => {
    const exclude = new Set<string>(['map-1', 'map-2', 'map-7']);
    expect(exclude.has(generateMapId(exclude))).toBe(false);
  });

  it('rapid creations with each id fed back into the exclusion set never collide (C5)', () => {
    const exclude = new Set<string>();
    const ids = Array.from({ length: 8 }, () => {
      const id = generateMapId(exclude);
      exclude.add(id); // the host's store discipline — its knowledge, fed back
      return id;
    });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('generates the map-id scheme (C5 — engine-shaped, never caller-proposed)', () => {
    expect(generateMapId()).toMatch(/^map-\d+$/);
  });
});

// --- createWorldMap (D79) ----------------------------------------------------------

describe('createWorldMap', () => {
  it('the D79 new-map default, byte-exact apart from the engine-assigned ids (D79, C5)', () => {
    const map = createWorldMap('New Land');
    expect(map).toEqual({
      schemaVersion: 2,
      id: map.id, // engine-assigned, asserted by scheme below
      name: 'New Land',
      layers: [{ id: map.layers[0].id, name: 'New Land' }], // exactly one layer, named after the map
      scale: { unitPerPx: 1, unitLabel: 'units', unitKind: 'distance' }, // D79 verbatim — C14 row 5 prices from the first stroke
      nodes: [],
      edges: [],
    });
    expect(map.id).toMatch(/^map-\d+$/); // C5
    expect(map.layers[0].id).toMatch(/^layer-\d+$/); // C5 — the same discipline as element ids
  });

  it("forkedFrom is absent — a fresh map is a library original, never a fork (C25/D41)", () => {
    const map = createWorldMap('New Land');
    expect('forkedFrom' in map).toBe(false);
  });

  it('the exclusion set steers the fresh map id away from the host\'s stored ids (C5)', () => {
    const exclude = new Set<string>();
    const a = createWorldMap('A', exclude);
    exclude.add(a.id);
    const b = createWorldMap('B', exclude);
    expect(b.id).not.toBe(a.id);
  });

  it('two fresh maps share nothing by reference — independent objects (C24 spirit)', () => {
    const a = createWorldMap('Same');
    const b = createWorldMap('Same');
    expect(a.layers[0]).not.toBe(b.layers[0]);
    expect(a.scale).not.toBe(b.scale);
    a.scale.unitPerPx = 42;
    a.nodes.push({ id: 'x', label: 'X', kind: 'location', layer: a.layers[0].id });
    expect(b.scale.unitPerPx).toBe(1); // D79 default intact on the other map
    expect(b.nodes).toHaveLength(0);
  });
});

// --- duplicateMapData (C25/C24/D41) -------------------------------------------------

describe('duplicateMapData', () => {
  it('deep copy: everything byte-equal to the source except the fresh map id (C5, C25)', () => {
    const source = richMap();
    const dup = duplicateMapData(source);
    expect(dup.id).not.toBe(source.id);
    const expected = structuredClone(source);
    expected.id = dup.id;
    expect(dup).toEqual(expected);
  });

  it('forkedFrom is stripped — a library duplicate is not a fork, no chat semantics (D41/C25)', () => {
    const source = { ...richMap(), forkedFrom: 'map-parent' };
    const dup = duplicateMapData(source);
    expect('forkedFrom' in source).toBe(true); // the source is untouched
    expect('forkedFrom' in dup).toBe(false);
  });

  it('element ids are preserved verbatim — map-scoped, C5\'s element-id conventions unaffected', () => {
    const source = richMap();
    const dup = duplicateMapData(source);
    expect(dup.layers.map((l) => l.id)).toEqual(source.layers.map((l) => l.id));
    expect(dup.nodes.map((n) => n.id)).toEqual(source.nodes.map((n) => n.id));
    expect(dup.edges.map((e) => e.id)).toEqual(source.edges.map((e) => e.id));
  });

  it('independence BOTH ways — mutating the duplicate never touches the source (the fork-detach guarantee at the pure level, C24)', () => {
    const source = richMap();
    const dup = duplicateMapData(source);

    dup.nodes[1].label = 'Changed';
    dup.nodes.push({ id: 'n-fork-only', label: 'Fork Only', kind: 'location', layer: 'layer-a' });
    dup.scale.unitPerPx = 42;
    dup.layers.push({ id: 'layer-x', name: 'X' });
    expect(source.nodes.find((n) => n.id === 'n-spot')?.label).toBe('The Spot');
    expect(source.nodes).toHaveLength(3);
    expect(source.scale.unitPerPx).toBe(0.25);
    expect(source.layers).toHaveLength(2);

    source.edges.push({ id: 'e-src-only', source: 'n-spot', target: 'n-hub', modes: {} });
    source.scale.unitLabel = 'league';
    expect(dup.edges).toHaveLength(1);
    expect(dup.scale.unitLabel).toBe('km');
  });

  it('the exclusion set steers the fresh id away from the host\'s stored ids (C5)', () => {
    const exclude = new Set<string>();
    const first = duplicateMapData(richMap(), exclude);
    exclude.add(first.id);
    const second = duplicateMapData(richMap(), exclude);
    expect(second.id).not.toBe(first.id);
  });
});
