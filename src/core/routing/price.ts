// src/core/routing/price.ts — the D60 per-edge pricing, shared by findRoute and
// getSnapshot (PKG A-008). One implementation, no parallel math (§6.2): the
// facade's routing and the snapshot's prompt-facing numbers both call these
// helpers — the exact logic that was closure-local in findRoute, moved verbatim.
//
// D60 semantics (register, R13):
//   - an explicit mode is a strict filter (C14 row 2) over a single candidate;
//   - the default prefers the chat's travel mode on an arc when that mode is
//     allowed and prices in the route's currency, and otherwise falls back to
//     the cheapest allowed mode in that currency — preference beats price
//     within a currency;
//   - C15/D60: ONE currency per computation — every computation runs
//     minutes-first and falls back to canonical units only when no
//     minutes-priced route exists; a mode priced in the other currency is
//     unroutable in a run (counting as "disallowed" for it).
//
// C17: Infinity is the INTERNAL sentinel — callers skip it and never emit it.
//
// R5: imports only core-relative modules. Pure — no state, deterministic.

import type { MapEdgeData, TravelMode, WorldMapData } from '../api';
import { edgeCost } from './cost';

/** The two cost currencies (C15/D60). */
export type CostCurrency = 'minutes' | 'canonical';

/**
 * True when the edge-mode pair prices in MINUTES (D60): an authored time on
 * the arc, or a defined speed for the mode that converts canonical units.
 */
export function minutesPriced(edge: MapEdgeData, m: TravelMode, scale: WorldMapData['scale']): boolean {
  return edge.modes[m]?.authoredMinutes != null || scale.speed?.[m] != null;
}

/**
 * Price one edge in one currency (D60): `preferred` when it is allowed and
 * prices in the currency (preference beats price), else the cheapest
 * in-currency candidate. Every number comes from edgeCost — one cost function
 * for every edge kind, no parallel math (C14, §6.2). A ∞ result (blocked, or
 * no candidate mode usable in this currency) marks the edge unpriceable here —
 * callers skip it (C17).
 */
export function priceEdgeIn(
  edge: MapEdgeData,
  currency: CostCurrency,
  candidates: readonly TravelMode[],
  preferred: TravelMode,
  scale: WorldMapData['scale'],
  positionOf: (id: string) => { x: number; y: number } | undefined,
): { mode: TravelMode; cost: number } {
  const usable = (m: TravelMode): boolean =>
    edge.modes[m]?.allowed === true && (currency === 'minutes') === minutesPriced(edge, m, scale);
  if (usable(preferred)) {
    return { mode: preferred, cost: edgeCost(edge, preferred, scale, positionOf) }; // preference beats price (D60)
  }
  let bestMode: TravelMode | null = null;
  let bestCost = Infinity; // scan-local sentinel only — a ∞ price is skipped by the search (C17)
  for (const candidate of candidates) {
    if (candidate === preferred || !usable(candidate)) continue;
    const cost = edgeCost(edge, candidate, scale, positionOf);
    if (cost < bestCost) {
      bestCost = cost;
      bestMode = candidate;
    }
  }
  return bestMode === null ? { mode: preferred, cost: Infinity } : { mode: bestMode, cost: bestCost };
}
