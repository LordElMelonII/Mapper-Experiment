// src/core/snapshot/build.ts — the MapSnapshot builder (PKG A-008): the C19
// neighborhood, the C20/D25 destinations, the C23 exclusions, the C27
// degradation. Plain data in, plain serializable data out (C22); every number
// arrives through the injected priceEdge/routeTo closures, which the facade
// builds from the SAME price.ts helpers findRoute uses — no parallel math
// (§6.2, D60).
//
// C27/C32: the snapshot never throws for pin state — a missing/invalid pin or
// an unnamed-waypoint pin degrades to the warning shape (location null); the
// template renders the warning and pauses nothing (injection pausing is host
// business, Phase 4).
//
// R5: imports only core-relative modules. Pure, deterministic, host-free,
// DOM-free.

import type {
  ChatMapOverlay,
  MapEdgeData,
  MapNodeData,
  MapSnapshot,
  RouteResult,
  SnapshotDestination,
  SnapshotRoute,
  TravelMode,
  WorldMapData,
} from '../api';
import { cardinal } from '../geometry/measure';
import type { EffectiveGraph } from '../model/effective';
import { minutesPriced } from '../routing/price';

/** C20: the destinations section is capped; the cap dropping an entry is marked. */
export const DESTINATIONS_CAP = 12;

const TRAVEL_MODES: readonly TravelMode[] = ['walk', 'car', 'train'];

/**
 * C23: an unnamed user waypoint — the tap-placed label the facade assigns, so
 * it is USER STATE, not a name ('Waypoint' reads plainly, but the node is
 * unnamed user state). Promotion names it and flips origin to 'authored'
 * (C26), which clears this predicate. Such nodes never appear in any
 * prompt-facing structure — not as the pin, not as a route endpoint, not as a
 * destination, not as a `via`.
 */
function isUnnamedUserNode(node: MapNodeData | undefined): boolean {
  return node !== undefined && node.origin === 'user' && node.label === 'Waypoint';
}

/**
 * D60 routes currency, minutes-first (C15): minutes when ANY neighborhood arc
 * can price in minutes — an arc prices in minutes when some allowed mode is
 * minutes-priced per D60 — else canonical units. Kept in lockstep with the
 * facade's getSnapshot priceEdge closure: same predicate (minutesPriced), same
 * rule, same arc selection (the frozen buildSnapshot signature carries no
 * currency argument, so the unit label is derived here from the same inputs).
 */
function routesCurrency(map: WorldMapData, arcs: MapEdgeData[]): 'minutes' | 'canonical' {
  const anyMinutes = arcs.some((edge) =>
    TRAVEL_MODES.some((m) => edge.modes[m]?.allowed === true && minutesPriced(edge, m, map.scale)),
  );
  return anyMinutes ? 'minutes' : 'canonical';
}

/**
 * Build the snapshot (C19–C23, C27, D25/D26, D60/D63).
 *
 * `priceEdge` prices one arc in the routes' single currency and returns null
 * for a cross-currency arc — an arc whose cost cannot be stated in the list's
 * currency is not a prompt-facing route (D60). `routeTo` runs the facade's
 * findRoute machinery from the pin (C20/D25 destinations).
 */
export function buildSnapshot(
  map: WorldMapData,
  overlay: ChatMapOverlay,
  effective: EffectiveGraph,
  priceEdge: (edge: MapEdgeData) => { mode: TravelMode; cost: number } | null,
  routeTo: (nodeId: string) => RouteResult,
): MapSnapshot {
  // statusNote/corrective ride on every snapshot, degraded or not (D17/D63).
  const passthrough = {
    ...(overlay.statusNote !== undefined ? { statusNote: overlay.statusNote } : {}),
    ...(overlay.corrective !== undefined ? { corrective: overlay.corrective } : {}),
  };

  const pinId = effective.pin.id;
  const pinNode = pinId === null ? undefined : effective.nodes.find((node) => node.id === pinId);

  // C27/C23 degradation: pin null, pin invalid (node deleted or ineligible,
  // C27) or the pin on an unnamed user waypoint (C23) — data, never a throw.
  if (pinNode === undefined || !effective.pin.valid || isUnnamedUserNode(pinNode)) {
    return {
      location: null,
      region: null,
      layer: '',
      routes: [],
      destinations: [],
      destinationsTruncated: false,
      unit: map.scale.unitLabel,
      ...passthrough,
    };
  }
  const pin: MapNodeData = pinNode; // non-nullable from here on (degraded path returned)

  // region = the nearest ancestor's label (ruling); layer = the layer's NAME —
  // machine ids never reach the prompt (C23; region is a label by the same
  // token). A dangling parent or layer record degrades its field, never throws.
  const region = pin.parent ? effective.nodes.find((node) => node.id === pin.parent)?.label ?? null : null;
  const layer = map.layers.find((l) => l.id === pin.layer)?.name ?? '';

  // C19 neighborhood: exactly the arcs incident to the pin (either endpoint),
  // cross-layer arcs AT the pin included; arcs whose other endpoint is an
  // unnamed user node excluded (C23). There is no same-district sibling
  // awareness (D36) — a sibling without an incident arc is simply absent.
  // A dangling endpoint (impossible post-validation) degrades out silently.
  const otherOf = (edge: MapEdgeData): MapNodeData | undefined =>
    effective.nodes.find((node) => node.id === (edge.source === pin.id ? edge.target : edge.source));
  const neighborhood = effective.edges.filter((edge) => {
    if (edge.source !== pin.id && edge.target !== pin.id) return false;
    const other = otherOf(edge);
    return other !== undefined && !isUnnamedUserNode(other);
  });

  const routes: SnapshotRoute[] = [];
  for (const edge of neighborhood) {
    const priced = priceEdge(edge);
    if (priced === null) continue; // D60: unpriceable in the list's currency ⇒ not a prompt-facing route
    const other = otherOf(edge)!; // the filter above kept only arcs with a known other endpoint
    // C10: cross-layer arcs report without a direction; an in-layer arc needs
    // both endpoints positioned to have one (§6.2 degenerate rule).
    const crossLayer = other.layer !== pin.layer;
    const direction =
      !crossLayer && pin.position !== undefined && other.position !== undefined
        ? cardinal(other.position.x - pin.position.x, other.position.y - pin.position.y)
        : '';
    routes.push({
      label: other.label,
      direction,
      cost: priced.cost,
      mode: priced.mode,
      // C2: blocked ≠ hidden — the arc stays listed with its reason.
      ...(edge.blocked !== undefined ? { blockedReason: edge.blocked.reason } : {}),
    });
  }

  // C20/D25 destinations: the shortest path from the pin to every hub of the
  // merged effective set except the pin itself and unnamed user nodes (C23);
  // ok:false results dropped (C17/C20). via/mode come from the FIRST leg; a
  // destination whose first leg touches an unnamed node is dropped (C23 — its
  // `via` would be machine-named).
  const candidates: SnapshotDestination[] = [];
  for (const hub of effective.nodes) {
    if (hub.kind !== 'hub' || hub.id === pin.id || isUnnamedUserNode(hub)) continue;
    const route = routeTo(hub.id);
    if (!route.ok || route.legs.length === 0) continue;
    const first = route.legs[0]!;
    const fromNode = effective.nodes.find((node) => node.id === first.from);
    const toNode = effective.nodes.find((node) => node.id === first.to);
    if (isUnnamedUserNode(fromNode) || isUnnamedUserNode(toNode)) continue;
    const via = first.from === pin.id ? toNode : fromNode;
    if (via === undefined) continue;
    candidates.push({ label: hub.label, via: via.label, mode: first.mode, cost: route.total });
  }
  candidates.sort((a, b) => a.cost - b.cost); // stable — node order breaks ties
  const destinationsTruncated = candidates.length > DESTINATIONS_CAP; // C20/D63

  return {
    location: pin.label,
    region,
    layer,
    routes,
    destinations: candidates.slice(0, DESTINATIONS_CAP), // C20
    destinationsTruncated,
    unit: routesCurrency(map, neighborhood) === 'minutes' ? 'min' : map.scale.unitLabel,
    ...passthrough,
  };
}
