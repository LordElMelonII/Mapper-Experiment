// src/core/model/effective.ts — C8 materialization: the effective graph is the
// library ∪ overlay, rebuilt from scratch in one synchronous pass on every
// change (edit save, overlay mutation, map/fork switch). The rebuild is a pure
// function returning one fresh object — atomicity is structural: the caller
// swaps the reference in a single assignment, so queries never observe a
// half-applied state (C8).
//
// Inputs are read, never mutated (C24 — the map is the library object itself
// and the host may edit it in place between builds; C30 — no graph change
// without validation upstream). All M2+ queries run against this derived plane
// only (CORE.md §2); the overlay is a diff, never queried directly.
//
// Semantics (A-002 packet):
//   mapId  = the materialized map's id, null with no map.
//   nodes  = map.nodes ∪ overlay.userNodes   (map null ⇒ both empty — an
//            overlay alone is not a graph; user nodes live on a map's layer).
//   edges  = map.edges ∪ overlay.userEdges, with overlay blocks unioned on
//            top: a block can only be ADDED, never lifted (C2/D20) — a
//            library-level `blocked` always survives; an overlay entry for the
//            same edge restates the block with the overlay's reason. Blocked
//            keys whose edge no longer exists (possible after a live library
//            edit, C24) are dropped silently (C32 degrade): they are simply
//            never consulted.
//   pin    = overlay.currentLocationId, kept verbatim even when stale (C27 —
//            never snap to a neighbor). valid iff the node exists in the
//            merged set AND satisfies the D58 pin rule (C1/F27: pin-eligible
//            leaf kind — location/hub/waypoint — and currently childless).

import type { ChatMapOverlay, MapEdgeData, MapNodeData, WorldMapData } from '../api';
import { isPinEligible } from './validate';

/** The derived query plane (CORE.md §2). Input to routing, snapshot, rendering. */
export interface EffectiveGraph {
  mapId: string | null;
  nodes: MapNodeData[];
  edges: MapEdgeData[];
  pin: { id: string | null; valid: boolean };
}

/** Build the effective graph from the library map and the chat overlay (C8). */
export function buildEffectiveGraph(map: WorldMapData | null, overlay: ChatMapOverlay): EffectiveGraph {
  const nodes: MapNodeData[] = map === null ? [] : [...map.nodes, ...overlay.userNodes];
  const edges: MapEdgeData[] = map === null ? [] : [...map.edges, ...overlay.userEdges];

  // Blocked union (C2/D20): overlay entries add or restate a block; absence of
  // an entry never unblocks a library-blocked edge. Dangling keys (edge gone
  // after a live library edit) never match and so degrade silently (C32).
  const mergedEdges: MapEdgeData[] = edges.map((edge) => {
    const reason: string | undefined = overlay.blocked[edge.id];
    // Untouched edges pass through as the same live objects (C24).
    return reason === undefined ? edge : { ...edge, blocked: { reason } };
  });

  const id = overlay.currentLocationId;
  // Pin validity (C1/F27 per D58): ONE shared predicate with the validator and
  // the facade (validate.ts) — existence, pin-eligible kind and childlessness
  // in one place, so a live library edit that parents a node under the pinned
  // leaf invalidates the pin here (C8/C24), never snaps it (C27).
  return {
    mapId: map === null ? null : map.id,
    nodes,
    edges: mergedEdges,
    pin: { id, valid: id !== null && isPinEligible(id, nodes) },
  };
}
