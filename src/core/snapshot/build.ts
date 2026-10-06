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
  SnapshotBlockedNode,
  SnapshotDestination,
  SnapshotRoute,
  TravelMode,
  WorldMapData,
} from '../api';
import { cardinal } from '../geometry/measure';
import type { EffectiveGraph } from '../model/effective';
import { modeUniverseOf, resolveModeLabel } from '../model/validate';
import { minutesPriced } from '../routing/price';

/** C20: the destinations section is capped; the cap dropping an entry is marked. */
export const DESTINATIONS_CAP = 12;

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
 * D65(a) routes currency: minutes only when at least one LIVE prompt-listable
 * incident arc exists and every one prices in minutes — completeness beats the
 * minutes preference (C19's "exactly the arcs incident to the pin") — else
 * canonical units (including the empty-live-set case, which presents no
 * minutes-derived cost; the C27 degraded path defaults the same way). Blocked
 * arcs are exempt (D65(b): they always list — best-effort cost or cost 0 — so
 * they price in either currency and never constrain the choice). Kept in
 * lockstep with the facade's getSnapshot decision: same minutesPriced
 * predicate, same exemptions, same arc selection, same universe scan (the
 * frozen buildSnapshot signature carries no currency argument, so the unit
 * label is derived here from the same inputs the facade decided over).
 */
function routesCurrency(map: WorldMapData, arcs: MapEdgeData[]): 'minutes' | 'canonical' {
  // A-016b/D78: the predicate scans the MAP's mode universe (built-ins ∪
  // registry ids) — a registry speed is a minutes source the currency decision
  // must see (C19's "exactly": an arc must not flip the currency — or drop —
  // over a hardcoded scan). Universe source is the LIVE map: no M2 editor
  // command can mutate map.modes (the registry arrives only via loadMap), so
  // live == saved today; when a registry-EDITING command arrives, this scan
  // must move to the saved plane exactly as the facade's savedScale did
  // (A-015 doctrine).
  const universe = [...modeUniverseOf(map)];
  const liveArcs = arcs.filter((edge) => edge.blocked === undefined);
  const allMinutes =
    liveArcs.length > 0 &&
    liveArcs.every((edge) =>
      universe.some((m) => edge.modes[m]?.allowed === true && minutesPriced(edge, m, map.scale)),
    );
  return allMinutes ? 'minutes' : 'canonical';
}

/**
 * Build the snapshot (C19–C23, C27, D25/D26, D60/D63).
 *
 * `priceEdge` prices one arc in the routes' single currency: null marks a LIVE
 * arc that cannot honestly price there, and it drops (D65(a)); a BLOCKED arc
 * always prices — best-effort in the list's currency, or cost 0 with its
 * cheapest allowed mode when unpriceable (D65(b), C2 wins) — and never returns
 * null. `routeTo` runs the facade's findRoute machinery from the pin, forced
 * into the snapshot's one currency (C20/D25 destinations, D65(c)).
 */
export function buildSnapshot(
  map: WorldMapData,
  overlay: ChatMapOverlay,
  effective: EffectiveGraph,
  priceEdge: (edge: MapEdgeData) => { mode: TravelMode; cost: number } | null,
  routeTo: (nodeId: string) => RouteResult,
): MapSnapshot {
  // statusNote/corrective ride on every snapshot, degraded or not (D17/D63).
  // D94/C34: the blocked-nodes listing rides with them — overlay chat state
  // independent of the pin, surfaced like an arc's blockedReason (C2 spirit:
  // the prompt learns WHY access is barred). One entry per overlay.nodeBlocked
  // key resolvable in the effective graph, the node's authored label + the
  // authored reason. A dangling key (node gone after a live library edit, C24)
  // degrades out silently (C32 — the effective.ts dangling-key mirror); an
  // unnamed user waypoint never surfaces (C23 — the same exclusion seam as
  // routes/destinations). Omitted entirely when nothing is left (no empty
  // array noise — the statusNote/corrective shape).
  const blockedNodes: SnapshotBlockedNode[] = [];
  for (const [id, reason] of Object.entries(overlay.nodeBlocked)) {
    const node = effective.nodes.find((nd) => nd.id === id);
    if (node === undefined || isUnnamedUserNode(node)) continue;
    blockedNodes.push({ label: node.label, reason });
  }
  const passthrough = {
    ...(overlay.statusNote !== undefined ? { statusNote: overlay.statusNote } : {}),
    ...(overlay.corrective !== undefined ? { corrective: overlay.corrective } : {}),
    ...(blockedNodes.length > 0 ? { blockedNodes } : {}),
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
    if (priced === null) continue; // D65(a): a live arc that cannot honestly price in the list's currency drops
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
      // D78/C23: the prompt-facing mode word — the RESOLVED label via the ONE
      // shared resolver (the registry's authored word, else the id itself,
      // which for the bare built-ins IS the word). A machine id never renders.
      mode: resolveModeLabel(priced.mode, map.modes),
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
    // D78/C23: the destination's mode word is the leg's already-RESOLVED label
    // (computeRoute resolved it against the same registry through the ONE
    // shared resolver — no duplicated mapping; the route is the authority on
    // its own legs' words).
    candidates.push({ label: hub.label, via: via.label, mode: first.modeLabel, cost: route.total });
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
