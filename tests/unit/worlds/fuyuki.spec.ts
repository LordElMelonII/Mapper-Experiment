// Unit tests for the FX1 fixture (PKG A-003) — data/worlds/fuyuki.ts.
// FX1 — Fuyuki/Misaki two-layer demo map; FX2 — Emiya → Misaki: this spec pins
// the route's TOPOLOGICAL preconditions (the full route assertion is M2's).
// Every assertion cites its F / C / FX IDs.
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, validateWorldMap } from '../../../src/core/model/validate';
import { fuyukiMap } from '../../../data/worlds/fuyuki';

// --- helpers -------------------------------------------------------------------

function nodeOf(id: string) {
  const node = fuyukiMap.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`fixture is missing node '${id}'`);
  return node;
}

function edgeOf(id: string) {
  const edge = fuyukiMap.edges.find((e) => e.id === id);
  if (!edge) throw new Error(`fixture is missing edge '${id}'`);
  return edge;
}

const idsOf = (list: { id: string }[]): string[] => list.map((item) => item.id);
const childrenOf = (id: string): string[] => idsOf(fuyukiMap.nodes.filter((n) => n.parent === id));

// --- fixture acceptance ----------------------------------------------------------

describe('FX1 — fuyukiMap fixture (Fuyuki/Misaki two-layer demo map)', () => {
  it('validates clean against the frozen contract and is deep-frozen (F50, C30, C31)', () => {
    expect(fuyukiMap.id).toBe('fuyuki-misaki');
    expect(fuyukiMap.name).toBe('Fuyuki & Misaki (FX1)');
    // the fixture hardcodes the literal 2 (data-only file, no value imports per D57);
    // this pins it to the contract's current schema version (C31)
    expect(fuyukiMap.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(() => validateWorldMap(fuyukiMap)).not.toThrow(); // zero issues in the collected report (C30)
    expect(validateWorldMap(fuyukiMap)).toBe(fuyukiMap); // reject-before-mutate: same reference out
    // deliverable 1: the exported data is deep-frozen — spot-check the deepest structures
    expect(Object.isFrozen(fuyukiMap)).toBe(true);
    expect(Object.isFrozen(fuyukiMap.scale)).toBe(true);
    expect(Object.isFrozen(nodeOf('emiya-residence'))).toBe(true);
    expect(Object.isFrozen(nodeOf('emiya-residence').aliases)).toBe(true);
    expect(Object.isFrozen(edgeOf('arc-emiya-residence-fuyuki-bridge').modes)).toBe(true);
    expect(Object.isFrozen(edgeOf('arc-emiya-residence-fuyuki-bridge').blocked)).toBe(true);
  });

  it('has exactly two layers; fuyuki holds 2 districts + 13 leaves with correct parent wiring (F01, F07)', () => {
    expect(fuyukiMap.layers.map((l) => l.id)).toEqual(['layer-fuyuki', 'layer-misaki']);
    expect(fuyukiMap.layers.map((l) => l.name)).toEqual(['Fuyuki City', 'Misaki Town']);

    const fuyuki = fuyukiMap.nodes.filter((n) => n.layer === 'layer-fuyuki');
    expect(fuyuki).toHaveLength(15); // 2 containers + 13 leaves (FX1's "13 locations")
    expect(idsOf(fuyuki.filter((n) => n.kind === 'district'))).toEqual(['district-miyama', 'district-shinto']);
    const leaves = fuyuki.filter((n) => n.kind !== 'district');
    expect(leaves).toHaveLength(13);
    // the station leaf declares kind 'hub' (F09), the other 12 leaves are 'location'
    expect(idsOf(leaves.filter((n) => n.kind === 'hub'))).toEqual(['fuyuki-station']);
    expect(leaves.filter((n) => n.kind === 'location')).toHaveLength(12);
    expect(nodeOf('fuyuki-station').transit).toEqual({ type: 'train' });

    // parent wiring: districts parent exactly their leaves (same layer); districts have no parent (F07)
    expect(childrenOf('district-miyama')).toEqual([
      'emiya-residence',
      'shopping-district',
      'homurahara-academy',
      'matou-residence',
      'tohsaka-residence',
      'ryuudou-temple',
    ]);
    expect(childrenOf('district-shinto')).toEqual(['fuyuki-station', 'harbor']);
    expect(idsOf(fuyuki.filter((n) => n.parent === undefined))).toEqual([
      'district-miyama',
      'district-shinto',
      'outskirts',
      'fuyuki-bridge',
      'kotomine-church',
      'ghost-house',
      'einzbern-castle',
    ]);
  });

  it('misaki layer holds exactly one node: the misaki-town train hub (F09)', () => {
    const misaki = fuyukiMap.nodes.filter((n) => n.layer === 'layer-misaki');
    expect(misaki).toHaveLength(1);
    expect(misaki[0]).toEqual({
      id: 'misaki-town',
      label: 'Misaki Town',
      kind: 'hub',
      layer: 'layer-misaki',
      position: { x: 200, y: 200 },
      transit: { type: 'train' },
    });
  });

  it('scale is time-kind with label min (FX1, F21, D45)', () => {
    expect(fuyukiMap.scale).toEqual({
      unitPerPx: 0.2,
      unitLabel: 'min',
      unitKind: 'time',
      terrainMultipliers: { mountain: 2.5 },
    });
  });

  it('exactly one blocked arc: arc-emiya-residence-fuyuki-bridge, with its human reason (FX1, F14, C2, D20)', () => {
    const blocked = fuyukiMap.edges.filter((e) => e.blocked);
    expect(idsOf(blocked)).toEqual(['arc-emiya-residence-fuyuki-bridge']);
    expect(blocked[0].blocked).toEqual({ reason: 'Bridge closed by local authorities' });
    // blocked ≠ hidden: the arc is still authored with its walk cost (C2)
    expect(blocked[0].modes['walk']).toEqual({ allowed: true, authoredMinutes: 25 });
  });

  it('exactly one cross-layer arc: arc-fuyuki-station-misaki-town, train-only, authoredMinutes 300 (FX1, F17, C3)', () => {
    const layerOf = new Map(fuyukiMap.nodes.map((n) => [n.id, n.layer]));
    const crossLayer = fuyukiMap.edges.filter((e) => layerOf.get(e.source) !== layerOf.get(e.target));
    // C3: an ordinary arc whose endpoints happen to live on different layers
    expect(idsOf(crossLayer)).toEqual(['arc-fuyuki-station-misaki-town']);
    expect(crossLayer[0].source).toBe('fuyuki-station');
    expect(crossLayer[0].target).toBe('misaki-town');
    expect(Object.keys(crossLayer[0].modes)).toEqual(['train']); // train-only
    expect(crossLayer[0].modes['train']).toEqual({ allowed: true, authoredMinutes: 300 });
  });

  it('FX2 preconditions: the Emiya→Fuyuki Station walk leg (50 min) and the cross-layer train arc exist (FX2, C14)', () => {
    const leg1 = edgeOf('arc-emiya-residence-fuyuki-station');
    expect(leg1.source).toBe('emiya-residence');
    expect(leg1.target).toBe('fuyuki-station');
    expect(Object.keys(leg1.modes)).toEqual(['walk']);
    expect(leg1.modes['walk']).toEqual({ allowed: true, authoredMinutes: 50 });
    // leg 2 is the cross-layer arc pinned above (C3)
    expect(edgeOf('arc-fuyuki-station-misaki-town').modes['train']).toEqual({ allowed: true, authoredMinutes: 300 });
    // the full route assertion (total 350 min, optimality) is M2's (FX2)
  });

  it('fuyuki layer is connected: BFS over same-layer arcs, undirected (C6), reaches all 13 leaves (F07, C1)', () => {
    const fuyuki = fuyukiMap.nodes.filter((n) => n.layer === 'layer-fuyuki');
    const fuyukiIds = new Set(idsOf(fuyuki));

    // adjacency over arcs with both endpoints on layer-fuyuki, treated as undirected (C6);
    // the cross-layer arc drops out because misaki-town is not a fuyuki node
    const adjacency = new Map<string, Set<string>>();
    for (const id of fuyukiIds) adjacency.set(id, new Set());
    for (const edge of fuyukiMap.edges) {
      if (fuyukiIds.has(edge.source) && fuyukiIds.has(edge.target)) {
        adjacency.get(edge.source)?.add(edge.target);
        adjacency.get(edge.target)?.add(edge.source);
      }
    }

    const visited = new Set<string>(['emiya-residence']);
    const queue = ['emiya-residence'];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    // the layer's 15 nodes decompose as 13 leaves + 2 districts; containers carry no
    // arcs (C1), so arc-BFS covers exactly the 13 leaves
    const leaves = idsOf(fuyuki.filter((n) => n.kind !== 'district')).sort();
    expect([...visited].sort()).toEqual(leaves);

    const arcEndpoints = new Set(fuyukiMap.edges.flatMap((e) => [e.source, e.target]));
    expect(idsOf(fuyuki.filter((n) => n.kind === 'district')).every((id) => !arcEndpoints.has(id))).toBe(true); // C1
  });
});
