// src/core/model/create.ts — the pure map constructors (PKG A-022, Phase 3 M4):
// createWorldMap (D79's new-map default) and duplicateMapData (the library
// duplicate), plus the engine-side map-id generator (C5). The M4 UI/host flows
// (new-map dialog, library duplicate) call these and take the result through
// the ordinary seams — loadMap / the host's library store; nothing here loads
// a facade, commands anything, or persists.
//
// R5: pure data in, pure data out — imports only types from ../api; no facade
// state, no host concepts, no I/O, no DOM.
//
// C5: ids belong to the engine — these helpers GENERATE ids; a caller never
// proposes one. Uniqueness against the host's STORED maps is host knowledge
// the caller may pass as `exclude` (its library-store map-id set); the engine
// still generates, never accepts a proposed id. A process-wide monotonic
// counter keeps bare rapid creations collision-free (C5 verbatim); the
// exclusion set covers ids assigned outside this process (maps persisted by
// earlier sessions). Element ids (nodes/edges/layers) are MAP-SCOPED: a
// duplicate preserves them verbatim, a fresh map assigns its one layer with
// the same bump-forward discipline ('layer-<n>' — the §6.2 scheme the facade's
// upsertLayer shares; its bump-until-free guard admits both sources).

import type { LayerData, WorldMapData } from '../api';

// Engine state, deterministic per process (same call sequence ⇒ same ids) —
// the facade's per-facade id counters mirrored at module scope, because these
// constructors run before any facade exists.
let nextMapId = 1;
let nextLayerId = 1;

/**
 * Generate a fresh engine-assigned map id ('map-<n>', C5). Bumps forward past
 * every id in `exclude` — the caller's knowledge of ids that must not be
 * re-used (the host's stored maps; a fork's parent chain). Each call consumes
 * the counter (excluded candidates included), so rapid creations never
 * collide even when the caller passes no exclusion set.
 */
export function generateMapId(exclude?: ReadonlySet<string>): string {
  let n = nextMapId;
  while (exclude?.has(`map-${n}`)) n += 1;
  nextMapId = n + 1;
  return `map-${n}`;
}

/**
 * D79: a fresh, empty world map — 1 px = 1 unit, distance-kind, label 'units'
 * (geometric arcs price from the first stroke, C14 row 5; calibration remains
 * an explicit action only, C13/D44). Exactly one layer — the validator's ≥ 1
 * floor — named after the map, its id engine-assigned (C5). `forkedFrom` is
 * absent: a new map is a library original, never a fork (C25/D41).
 */
export function createWorldMap(name: string, exclude?: ReadonlySet<string>): WorldMapData {
  const layer: LayerData = { id: `layer-${nextLayerId++}`, name }; // named after the map (D79)
  return {
    schemaVersion: 2,
    id: generateMapId(exclude),
    name,
    layers: [layer],
    scale: { unitPerPx: 1, unitLabel: 'units', unitKind: 'distance' }, // D79 verbatim
    nodes: [],
    edges: [],
  };
}

/**
 * C25/D41: a library duplicate — a deep copy of `map` under a fresh
 * engine-assigned map id (C5). Everything else is byte-equal to the source:
 * element ids are preserved verbatim (they are map-scoped — C5's element-id
 * conventions are unaffected by the copy). `forkedFrom` is STRIPPED: a
 * duplicate is not a fork — it carries no chat semantics and re-syncs with
 * nothing (the fork relationship is C25's, not the copy's). Mutating either
 * side never touches the other — the same deep-copy guarantee forkMap's
 * detach rests on (C24).
 */
export function duplicateMapData(map: WorldMapData, exclude?: ReadonlySet<string>): WorldMapData {
  const copy = structuredClone(map); // the deep copy — independence both ways
  copy.id = generateMapId(exclude);
  delete copy.forkedFrom; // a library duplicate is not a fork (D41/C25)
  return copy;
}
