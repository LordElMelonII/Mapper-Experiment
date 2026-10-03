// Unit tests for shortestPath (PKG A-006) — plain Dijkstra per C16/D59.
// C16 optimality (shortest ≠ fewest-hops, hand-computed) · C6 undirectedness
// (both directions over one arc, traversedFrom orientation) · C17
// unreachability (ok:false, ∞ nowhere in the result — deep-scanned) · §6.2
// route-to-self. weightOf is injected, so these run without edgeCost or any
// fixture: optimality is a property of the search over the active cost
// function (C16), whatever prices the edges.
import { describe, expect, it } from 'vitest';
import { shortestPath } from '../../../src/core/routing/dijkstra';
import type { MapEdgeData } from '../../../src/core/api';

const edge = (id: string, source: string, target: string): MapEdgeData => ({
  id,
  source,
  target,
  modes: {}, // weightOf is injected — the mode specs are irrelevant here
});

/** Build a graph from [id, source, target, weight] rows; weightOf reads the table. */
const graph = (rows: Array<[string, string, string, number]>) => {
  const weights = new Map(rows.map(([id, , , w]) => [id, w] as const));
  const edges = rows.map(([id, source, target]) => edge(id, source, target));
  const nodes = [...new Set(rows.flatMap(([, s, t]) => [s, t]))];
  return { nodes, edges, weightOf: (e: MapEdgeData): number => weights.get(e.id)! };
};

// C17 deep scan: every numeric value anywhere in the result must be finite —
// the ∞ sentinel may be internal but never appears in an output object.
const assertAllFinite = (value: unknown): void => {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) value.forEach(assertAllFinite);
  else if (value !== null && typeof value === 'object') Object.values(value).forEach(assertAllFinite);
};

// --- C16 optimality ------------------------------------------------------------------

describe('C16 — optimality for the active cost function (D59: plain Dijkstra)', () => {
  // Hand-computed 6-node graph: the fewest-hops A→B→F route costs 20; the
  // optimal route is the 4-hop A→C→D→E→F at 4. Decoys: A→D direct (5) loses to
  // A→C→D (2); A→C→E→F (5) and A→B→D→E→F (19) also lose.
  const g = graph([
    ['e-ab', 'A', 'B', 10],
    ['e-bf', 'B', 'F', 10],
    ['e-ac', 'A', 'C', 1],
    ['e-cd', 'C', 'D', 1],
    ['e-de', 'D', 'E', 1],
    ['e-ef', 'E', 'F', 1],
    ['e-ad', 'A', 'D', 5],
    ['e-ce', 'C', 'E', 3],
    ['e-bd', 'B', 'D', 6],
  ]);

  it('picks the cheap 4-hop path over the expensive 2-hop path (C16)', () => {
    const r = shortestPath(g.nodes, g.edges, g.weightOf, 'A', 'F');
    expect(r).toEqual({
      ok: true,
      total: 4,
      legs: [
        { arcId: 'e-ac', from: 'A', to: 'C', cost: 1 },
        { arcId: 'e-cd', from: 'C', to: 'D', cost: 1 },
        { arcId: 'e-de', from: 'D', to: 'E', cost: 1 },
        { arcId: 'e-ef', from: 'E', to: 'F', cost: 1 },
      ],
    });
  });

  it('reroutes around an expensive direct arc: A→B costs 8 via C/D, not 10 (C16)', () => {
    // dist(B) = min(direct 10, A→C→D→B = 1+1+6 = 8) — hand-computed.
    const r = shortestPath(g.nodes, g.edges, g.weightOf, 'A', 'B');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(8);
    expect(r.legs.map((l) => l.arcId)).toEqual(['e-ac', 'e-cd', 'e-bd']);
  });

  it('beats a longer-weight direct arc on sub-routes too: A→D costs 2, not 5 (C16)', () => {
    const r = shortestPath(g.nodes, g.edges, g.weightOf, 'A', 'D');
    expect(r.total).toBe(2);
    expect(r.legs.map((l) => l.arcId)).toEqual(['e-ac', 'e-cd']);
  });
});

// --- C6 undirectedness -----------------------------------------------------------------

describe('C6 — arcs are bidirectional (no one-way arc)', () => {
  it('routes A→B and B→A over the same single edge (C6)', () => {
    const g = graph([['e-ab', 'A', 'B', 7]]);
    const ab = shortestPath(g.nodes, g.edges, g.weightOf, 'A', 'B');
    expect(ab).toEqual({ ok: true, total: 7, legs: [{ arcId: 'e-ab', from: 'A', to: 'B', cost: 7 }] });
    const ba = shortestPath(g.nodes, g.edges, g.weightOf, 'B', 'A');
    expect(ba).toEqual({ ok: true, total: 7, legs: [{ arcId: 'e-ab', from: 'B', to: 'A', cost: 7 }] });
  });

  it('hands traversedFrom to weightOf — direction-sensitive pricing resolves (C6 legs orientation)', () => {
    // Price 1 leaving the source, 2 leaving the target: A→B must cost 1, B→A 2.
    const e = edge('e-ab', 'A', 'B');
    const weightOf = (edge: MapEdgeData, traversedFrom: string): number =>
      traversedFrom === edge.source ? 1 : 2;
    expect(shortestPath(['A', 'B'], [e], weightOf, 'A', 'B').total).toBe(1);
    expect(shortestPath(['A', 'B'], [e], weightOf, 'B', 'A').total).toBe(2);
  });
});

// --- C17 unreachability ------------------------------------------------------------------

describe('C17 — no finite path ⇒ ok:false, ∞ never in any output', () => {
  it('two islands ⇒ { ok: false, total: 0, legs: [] } (C17; the reason lives at the facade seam)', () => {
    const g = graph([
      ['e-ab', 'A', 'B', 3],
      ['e-cd', 'C', 'D', 4],
    ]);
    const r = shortestPath(g.nodes, g.edges, g.weightOf, 'A', 'D');
    expect(r).toEqual({ ok: false, total: 0, legs: [] });
  });

  it('an all-infinite weight table is unreachable, not ∞-costed (C2, C14, C17)', () => {
    const g = graph([['e-ab', 'A', 'B', 1]]);
    const r = shortestPath(g.nodes, g.edges, () => Infinity, 'A', 'B');
    expect(r).toEqual({ ok: false, total: 0, legs: [] });
    const json = JSON.stringify(r);
    expect(json).not.toContain('Infinity');
    assertAllFinite(r);
  });

  it('a reachable result is finite everywhere — deep-scanned (C17)', () => {
    const g = graph([
      ['e-ab', 'A', 'B', 3],
      ['e-bc', 'B', 'C', 4],
    ]);
    const r = shortestPath(g.nodes, g.edges, g.weightOf, 'A', 'C');
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r)).not.toContain('Infinity');
    assertAllFinite(r);
  });
});

// --- §6.2 route-to-self ----------------------------------------------------------------

describe('§6.2 — route-to-self is trivially satisfiable', () => {
  it('from === to ⇒ { ok: true, total: 0, legs: [] } exactly', () => {
    const g = graph([['e-ab', 'A', 'B', 3]]);
    expect(shortestPath(g.nodes, g.edges, g.weightOf, 'A', 'A')).toEqual({
      ok: true,
      total: 0,
      legs: [],
    });
  });
});
