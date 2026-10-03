// src/core/routing/dijkstra.ts — plain Dijkstra over the effective graph
// (PKG A-006). C16 sanctions plain Dijkstra (cross-layer arcs have no
// meaningful geometry, so Euclidean heuristics are inadmissible); D59 fixes
// the implementation shape: brute-force min-scan at map scale (maps have tens
// of nodes), no priority-queue class, no adjacency caching.
//
// C6: every edge is adjacency in BOTH directions — arcs are bidirectional,
// there is no one-way arc. `traversedFrom` hands the traversal direction back
// to the caller so legs (and direction-sensitive weights) can be oriented.
//
// C2/C14: a non-finite weight (blocked arc, mode not allowed) is skipped —
// the ∞ sentinel stays internal. C17: no finite path ⇒ { ok: false, total: 0,
// legs: [] } with NO Infinity anywhere in the result; the human-readable
// reason (disconnected vs blocked/disallowed) is the caller's job — that
// distinction is decidable only at the facade seam.
//
// Weights must be non-negative (Dijkstra's precondition). The validators pin
// authoredMinutes/authoredDistance >= 0 and speeds > 0, and geometry is a
// magnitude — every edgeCost output is a valid weight.
//
// R5: imports only core-relative modules. Deterministic, host-free, DOM-free.

import type { MapEdgeData } from '../api';

/** One traversed arc, travel-ordered (C18 leg minus the caller-owned fields). */
export interface DijkstraLeg {
  arcId: string;
  from: string;
  to: string;
  cost: number;
}

/**
 * Optimal path for the active cost function (C16): brute-force Dijkstra over
 * `nodeIds` ∪ `edges`, every edge traversable in both directions (C6).
 * `weightOf(edge, traversedFrom)` prices one traversal; non-finite weights
 * exclude the edge. Unreachable ⇒ `{ ok: false, total: 0, legs: [] }` (C17 —
 * the reason lives at the facade seam). `from === to` ⇒ trivial success (§6.2).
 */
export function shortestPath(
  nodeIds: string[],
  edges: MapEdgeData[],
  weightOf: (edge: MapEdgeData, traversedFrom: string) => number,
  from: string,
  to: string,
): { ok: boolean; total: number; legs: DijkstraLeg[] } {
  if (from === to) return { ok: true, total: 0, legs: [] }; // §6.2 route-to-self

  // Adjacency in both directions (C6). Edges with an endpoint outside
  // nodeIds cannot be traversed into the node universe and are dropped.
  const adj = new Map<string, Array<{ edge: MapEdgeData; other: string }>>();
  for (const id of nodeIds) adj.set(id, []);
  for (const edge of edges) {
    adj.get(edge.source)?.push({ edge, other: edge.target });
    adj.get(edge.target)?.push({ edge, other: edge.source });
  }

  // dist holds only REACHED, finite distances; done holds settled nodes.
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { edge: MapEdgeData; via: string; cost: number }>();
  const done = new Set<string>([from]);

  let current = from;
  while (current !== to) {
    for (const step of adj.get(current) ?? []) {
      if (done.has(step.other)) continue;
      const w = weightOf(step.edge, current); // traversedFrom orients the undirected edge (C6)
      if (!Number.isFinite(w)) continue;      // blocked / disallowed: the sentinel never enters (C2, C14, C17)
      const candidate = dist.get(current)! + w;
      if (candidate < (dist.get(step.other) ?? Infinity)) {
        dist.set(step.other, candidate);
        prev.set(step.other, { edge: step.edge, via: current, cost: w });
      }
    }
    // Brute-force min-scan over the reached-but-unfinished frontier (D59).
    let best: string | undefined;
    let bestDist = Infinity; // scan-local sentinel only — never in the result (C17)
    for (const [id, d] of dist) {
      if (!done.has(id) && d < bestDist) {
        best = id;
        bestDist = d;
      }
    }
    if (best === undefined) return { ok: false, total: 0, legs: [] }; // frontier exhausted (C17)
    done.add(best);
    current = best;
  }

  // Walk the predecessor chain back to `from`, then flip into travel order.
  const legs: DijkstraLeg[] = [];
  let cursor = to;
  while (cursor !== from) {
    const step = prev.get(cursor);
    if (step === undefined) return { ok: false, total: 0, legs: [] }; // unreachable by construction
    legs.push({ arcId: step.edge.id, from: step.via, to: cursor, cost: step.cost });
    cursor = step.via;
  }
  legs.reverse();
  // total is the settled distance — the exact left-to-right sum of leg costs.
  return { ok: true, total: dist.get(to)!, legs };
}
