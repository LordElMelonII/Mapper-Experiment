// src/core/routing/cost.ts — the ONE cost function for every edge kind
// (PKG A-005; C14 hard boundary: waypoint, editor-drawn and imported edges
// all price through here — no parallel math, §6.2).
//
// C14 precedence, per arc, per mode — the packet's normative formula ruling
// (the §3.4 edgeCost sketch is R0-illustrative and differs; C14's rows win):
//   row 1: edge.blocked set                        ⇒ Infinity
//   row 2: no spec for the mode / not allowed      ⇒ Infinity
//   row 3: spec.authoredMinutes != null            ⇒ verbatim minutes
//          (no terrain, no multiplier — authored values override what is
//          below them absolutely, D14; §6.2: authored-time edges never
//          accrue terrain multipliers)
//   row 4: edge.authoredDistance != null           ⇒ units = authoredDistance
//          (C12/D44: the TRUE separation — terrain never applies to it;
//          terrain corrects geometric estimates only)
//   row 5: else units = euclid(source, target) × scale.unitPerPx
//               × terrainMultipliers[edge.terrain ?? 'plain'] (default 1)
//   then:  scale.speed[mode] defined ⇒ units / speed × 60 × spec.multiplier
//          (minutes — multiplier factors DERIVED time only, api.ts)
//          else ⇒ units (C14 row 6: canonical units — no multiplier, C15)
//
// C15: minutes whenever time is derivable, else canonical units; one currency
// per route computation (mixing is A-006's routing concern, not this file's).
// C17: Infinity is the INTERNAL sentinel — it must never reach any output;
// converting it to ok:false + a human reason happens at the routing seam.
//
// Degenerate rule (§6.2, pinned by tests): a node without a position
// contributes a geometric term of 0 — an unpositioned endpoint makes the
// geometric distance 0, not ∞ (rows 3–4 never consult geometry at all).
//
// R5: imports only core-relative modules. Deterministic, host-free, DOM-free.

import type { MapEdgeData, TravelMode, WorldMapData } from '../api';
import { euclid } from '../geometry/measure';

/**
 * Cost of traversing one edge in one mode, per the C14 precedence order.
 * Returns minutes when the mode's speed is defined (C14 rows 3–5 with
 * speeds), else canonical map units (C14 row 6). Infinity marks a blocked or
 * mode-disallowed edge — the internal sentinel only (C17).
 */
export function edgeCost(
  edge: MapEdgeData,
  mode: TravelMode,
  scale: WorldMapData['scale'],
  positionOf: (id: string) => { x: number; y: number } | undefined,
): number {
  if (edge.blocked) return Infinity;                              // C14 row 1 (C2/D20)
  const spec = edge.modes[mode];
  if (!spec || !spec.allowed) return Infinity;                    // C14 row 2 (fail-closed)
  if (spec.authoredMinutes != null) return spec.authoredMinutes;  // C14 row 3 (D14)

  // C14 rows 4–5: the distance estimate in canonical units.
  let units: number;
  if (edge.authoredDistance != null) {
    units = edge.authoredDistance;                                // row 4 — no terrain (C12/D44)
  } else {
    const from = positionOf(edge.source);
    const to = positionOf(edge.target);
    const px = from && to ? euclid(from, to) : 0;                 // §6.2 degenerate: 0, not ∞
    units = px * scale.unitPerPx * (scale.terrainMultipliers?.[edge.terrain ?? 'plain'] ?? 1);  // row 5
  }

  const speed = scale.speed?.[mode];
  if (speed == null) return units;                                // C14 row 6 (C15: canonical units)
  return (units / speed) * 60 * (spec.multiplier ?? 1);           // minutes (C15)
}
