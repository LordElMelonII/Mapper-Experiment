// src/app/graph/layer-elements.ts — the PURE layer projection (B-102, M1
// verifier finding 2 fix), extended by B-107 (cross-layer endpoint badges)
// and B-128 (D85/F02: portal badges + the breadcrumb chain builder): frozen
// core types in, cytoscape element definitions out. No Angular, no cytoscape
// runtime, no DOM — type-only imports, which is exactly what lets tests/verify
// and tests/unit (bare-Node vitest) pin it without a browser (the UI bar's
// e2e still covers the mounted pipeline).
//
// R4: takes the SAME live map/overlay references the facade holds (C24) and
// only READS them — this builds a projection, never a second truth. R1: no
// distance/direction/duration is computed here; positions are authored data.

import type { ElementDefinition } from 'cytoscape';
import type { ChatMapOverlay, RouteResult, TravelMode, WorldMapData } from '../../core/api';

/**
 * ElementDefinition[] for ONE layer (F01/D16: each layer is its own plane;
 * the viewer shows one at a time):
 *   - district containers as compound parents (F07, C1: no position, no pin,
 *     no arcs) — ordered before their children, which cytoscape requires;
 *   - leaf nodes with authored positions and `tme-<kind>` classes, plus
 *     `tme-pin` on the overlay's currentLocationId when it lives here;
 *   - chat waypoints (F10/D21): `overlay.userNodes` on this layer project
 *     like any leaf (kind 'waypoint' picks up `tme-waypoint`); DISPLAY ONLY —
 *     placing them is M3, and C23 keeps unnamed ones out of prompts, never
 *     off the canvas;
 *   - edges — library AND overlay user edges (D61) — only when BOTH endpoints
 *     are on this layer: C3 says a cross-layer arc is an ordinary arc that is
 *     simply not drawn as a line on its layer (its endpoints carry B-107
 *     badges; since B-128/D85 cross-layer arcs are also CREATABLE — the F17
 *     un-fence).
 * Blocked state is the merge the effective graph implements: an authored
 * block OR a chat-scoped overlay block (D20) — read-only, no math (R1).
 * B-111: an edge carrying authored `curve` data gains the `tme-curved`
 * display class + verbatim control-point data (api.ts:45) — display classing
 * only, exactly like `tme-blocked`/`tme-crosslayer`; no behavior branches.
 */
export function buildLayerElements(
  map: WorldMapData,
  overlay: ChatMapOverlay | null,
  layerId: string,
): ElementDefinition[] {
  // C8's effective-graph shape: library nodes first, chat waypoints after —
  // ids are unique across both (C5 assigns waypoint ids).
  const allNodes = overlay === null ? [...map.nodes] : [...map.nodes, ...overlay.userNodes];
  const allEdges = overlay === null ? [...map.edges] : [...map.edges, ...overlay.userEdges];
  const layerNodes = allNodes.filter((node) => node.layer === layerId);
  const layerOf = new Map(allNodes.map((node) => [node.id, node.layer] as const));
  const pinId = overlay?.currentLocationId ?? null;

  // Compound parents must exist before their children (F07/C1).
  const parentIds = new Set<string>();
  for (const node of layerNodes) {
    if (node.parent !== undefined) parentIds.add(node.parent);
  }
  const parents = layerNodes.filter((node) => parentIds.has(node.id));
  const children = layerNodes.filter((node) => !parentIds.has(node.id));

  const nodes: ElementDefinition[] = [...parents, ...children].map((node) => ({
    group: 'nodes' as const,
    data: {
      id: node.id,
      label: node.label,
      kind: node.kind,
      layer: node.layer,
      ...(node.parent !== undefined ? { parent: node.parent } : {}),
    },
    ...(node.position !== undefined ? { position: { ...node.position } } : {}),
    classes: node.id === pinId ? [`tme-${node.kind}`, 'tme-pin'] : [`tme-${node.kind}`],
    // C1/F07 (B-103): compound containers organize and label — they never
    // drag in M1; only leaves grab. `grabbable` is an ElementDefinition
    // field (typed at index.d.ts:100) — NOT a stylesheet style property in
    // @types/cytoscape 3.21.9 + cytoscape 3.34.3 (verified against the
    // installed runtime: no `grabbable` style prop is declared), so it lives
    // on the element definition rather than in GRAPH_STYLESHEET.
    ...(parentIds.has(node.id) ? { grabbable: false } : {}),
  }));

  const edges: ElementDefinition[] = [];
  for (const edge of allEdges) {
    const sourceLayer = layerOf.get(edge.source);
    const targetLayer = layerOf.get(edge.target);
    if (sourceLayer === undefined || targetLayer === undefined) continue; // degenerate arc: degrade, never throw (C32 spirit)
    const classes: string[] = [];
    if (edge.blocked !== undefined || (overlay !== null && overlay.blocked[edge.id] !== undefined)) {
      classes.push('tme-blocked'); // C2: drawn dashed, excluded from routing
    }
    if (sourceLayer !== targetLayer) {
      classes.push('tme-crosslayer'); // C3: informational — no line here; badges at the endpoints (B-107)
    }
    if (edge.curve !== undefined) {
      classes.push('tme-curved'); // B-111 (§5 M3): authored curve data → unbundled-bezier
    }
    if (sourceLayer !== layerId || targetLayer !== layerId) continue; // F01/D16 + C3 (M1)
    edges.push({
      group: 'edges' as const,
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        // B-111 (§5 M3, api.ts:45): authored curve control-point distances
        // projected VERBATIM — R1/D7: layout data, the builder computes
        // nothing, and C14 keeps curves out of cost/routing/prompts entirely.
        // `curveWeights` is the runtime's requirement, not our math: the
        // installed cytoscape (3.34.3, findBezierPoints) sizes the curve at
        // Math.min(distances.length, weights.length) and the default weight
        // is the scalar 0.5 (a length-1 array), which would truncate a
        // multi-point curve to ONE control point — so a constant-weight
        // array (the runtime's own default value, CURVE_CONTROL_POINT_WEIGHT
        // below) rides alongside. A layout constant like BADGE_OFFSET, never
        // user-facing math (R1).
        ...(edge.curve !== undefined
          ? {
              curveDistances: edge.curve.distances,
              curveWeights: edge.curve.distances.map(() => CURVE_CONTROL_POINT_WEIGHT),
            }
          : {}),
      },
      classes,
    });
  }

  return [...nodes, ...edges];
}

/**
 * B-107: one cross-layer arc × its endpoint ON `layerId` — the anchor a badge
 * rides (C3). Shared by buildCrossLayerBadges (pure text/position assembly)
 * and the service's route queries, so the two walks can never drift apart.
 */
export interface CrossLayerAnchor {
  readonly arcId: string;
  /** Node id of the arc's endpoint on `layerId` — the badge's host. */
  readonly onLayer: string;
  /** Node id of the far endpoint — the badge's destination. */
  readonly other: string;
}

/**
 * B-107 (ruling 2): every cross-layer arc with exactly one endpoint on
 * `layerId`, over the same merged node/edge sets buildLayerElements projects
 * (library + overlay, D61). Degenerate arcs (an endpoint unknown to the node
 * sets) degrade to nothing — never throw (C32 spirit). PURE: reads the live
 * references, mutates nothing (R4).
 */
export function crossLayerAnchors(
  map: WorldMapData,
  overlay: ChatMapOverlay | null,
  layerId: string,
): CrossLayerAnchor[] {
  const allNodes = overlay === null ? [...map.nodes] : [...map.nodes, ...overlay.userNodes];
  const allEdges = overlay === null ? [...map.edges] : [...map.edges, ...overlay.userEdges];
  const layerOf = new Map(allNodes.map((node) => [node.id, node.layer] as const));
  const anchors: CrossLayerAnchor[] = [];
  for (const edge of allEdges) {
    const sourceLayer = layerOf.get(edge.source);
    const targetLayer = layerOf.get(edge.target);
    if (sourceLayer === undefined || targetLayer === undefined || sourceLayer === targetLayer) {
      continue; // degenerate or same-layer — C3 only spans genuinely cross-layer arcs
    }
    if (sourceLayer === layerId) {
      anchors.push({ arcId: edge.id, onLayer: edge.source, other: edge.target });
    } else if (targetLayer === layerId) {
      anchors.push({ arcId: edge.id, onLayer: edge.target, other: edge.source });
    }
  }
  return anchors;
}

/**
 * B-107 ruling 1: the badge's display offset from its on-layer endpoint, in
 * model units. This is LAYOUT, not computed geography — R1 bars the UI from
 * computing a distance/direction that routing or prompts consume; a fixed
 * placement constant never feeds either.
 */
const BADGE_OFFSET = 40;

/**
 * B-128: the SHARED badge anchor — one placement assembly for every badge
 * pseudo-node, so the arc badges (B-107) and the portal badges (D85) can
 * never drift apart. The anchor sits BADGE_OFFSET off the host node on both
 * axes: at the node's exact position a badge would be untappable — the 44px
 * host body (F52) wins `findNearestElements`, and the B-115 touch-slop
 * (host reach 22·z + 8 px) swallows anything inside it at every zoom — which
 * would kill the F02 double-tap entry gesture outright. Pure reads (R4);
 * null when the host carries no authored position (the caller degrades).
 */
function badgeAnchor(host: { position?: { x: number; y: number } }): { x: number; y: number } | null {
  if (host.position === undefined) return null;
  return { x: host.position.x + BADGE_OFFSET, y: host.position.y + BADGE_OFFSET };
}

/**
 * B-111: the control-point WEIGHT emitted for every curve control point —
 * the installed runtime's own default value (cytoscape 3.34.3,
 * cytoscape.esm.mjs stylesheet defaults: `'control-point-weights': 0.5`).
 * A LAYOUT constant (like BADGE_OFFSET above): the runtime requires weights
 * alongside distances for `unbundled-bezier` — findBezierPoints sizes the
 * curve at `Math.min(distances.length, weights.length)` — but the weights
 * themselves are pure display placement, never computed geography that
 * routing or prompts consume (R1).
 */
const CURVE_CONTROL_POINT_WEIGHT = 0.5;

/**
 * B-107 (C3): cross-layer arcs render as BADGES at their on-layer endpoints —
 * projection pseudo-NODES (id `tme-badge-<arcId>`, class `tme-badge`,
 * `grabbable: false`), so cytoscape's own renderer tracks them through
 * pan/zoom with zero extra event code (D2). The ARC itself still never joins
 * the projection as an edge — buildLayerElements filters it (C3, M1 seam).
 *
 * B-108 (finding 1, gate fix): the badge is the cross-layer arc's ONLY canvas
 * surface (F14/C2 have no same-layer carve-out). `data.arcId` carries the arc
 * id so a badge tap can select the ARC (the service's tap handler reads it —
 * never parsed out of the prefixed node id), and the badge text carries the
 * arc's merged blocked state: the reason IS the payload (C2, D65(b) spirit).
 *
 * Badge text per ruling 2 + B-108, destination + modes, then ONE tail:
 *   - blocked (authored `edge.blocked.reason` OR `overlay.blocked[arcId]` —
 *     the same presence checks arcInfo uses; the overlay's reason wins the
 *     merge, D20 "adds or restates only"):
 *       `${destinationLabel} · ${allowedModes.join(', ')} · blocked: ${reason}`
 *     with NO cost — C17: never a number for an unroute.
 *   - routed (`facade.findRoute(onLayer → other)` ok:true — DEFAULT mode,
 *     D60(a) preference semantics, passed in by the service via `routes`):
 *       `… · ${total} ${unit}` — R1/C15/D72: the core's own numbers, verbatim;
 *       this builder computes nothing.
 *   - else (no facade yet, unreachable, ok:false while not blocked):
 *     destination + modes, no tail.
 * NO direction token ever appears — C10: cross-layer arcs have no geographic
 * direction, and no arrow/cardinal glyph may imply one (§6.1 comprehension).
 *
 * PURE (type-only imports, bare-Node friendly, R4 read-only): the phase-gate
 * verifier pins it in tests/verify.
 */
export function buildCrossLayerBadges(
  map: WorldMapData,
  overlay: ChatMapOverlay | null,
  layerId: string,
  routes: ReadonlyMap<string, RouteResult | null>,
): ElementDefinition[] {
  const allNodes = overlay === null ? [...map.nodes] : [...map.nodes, ...overlay.userNodes];
  const allEdges = overlay === null ? [...map.edges] : [...map.edges, ...overlay.userEdges];
  const nodeOf = new Map(allNodes.map((node) => [node.id, node] as const));
  const edgeOf = new Map(allEdges.map((edge) => [edge.id, edge] as const));

  const badges: ElementDefinition[] = [];
  for (const anchor of crossLayerAnchors(map, overlay, layerId)) {
    const host = nodeOf.get(anchor.onLayer);
    const anchorPoint = host === undefined ? null : badgeAnchor(host);
    if (host === undefined || anchorPoint === null) continue; // no anchor to ride — degrade (C32 spirit)
    const edge = edgeOf.get(anchor.arcId);
    if (edge === undefined) continue; // unreachable: anchors derive from these very edges
    const destination = nodeOf.get(anchor.other)?.label ?? anchor.other; // degrade, never throw
    const modes = (Object.keys(edge.modes) as TravelMode[]).filter(
      (mode) => edge.modes[mode]?.allowed === true,
    );
    let label = `${destination} · ${modes.join(', ')}`;
    // B-108 (finding 1.2): the merged blocked state — the same presence checks
    // arcInfo uses (D20: authored OR overlay; the overlay's reason restates
    // the authored one). C2's reason is the payload: the badge text carries
    // `blocked: <reason>` and NO cost; the route-cost branch applies only
    // when not blocked (C17: never a number for an unroute).
    const overlayReason = overlay?.blocked[edge.id]; // undefined when absent
    const blockedReason = overlayReason ?? edge.blocked?.reason ?? null;
    if (blockedReason !== null) {
      label += ` · blocked: ${blockedReason}`;
    } else {
      const route = routes.get(anchor.arcId);
      if (route?.ok) label += ` · ${route.total} ${route.unit}`; // core numbers verbatim (R1/D72)
    }
    badges.push({
      group: 'nodes' as const,
      // B-108 (finding 1.1): `arcId` is the tap handler's key into the ARC —
      // carried as data, never parsed out of the prefixed pseudo-node id.
      data: { id: `tme-badge-${anchor.arcId}`, label, arcId: anchor.arcId },
      position: anchorPoint,
      classes: ['tme-badge'],
      // Ruling 1: pinned pseudo-node — display only, never draggable (same
      // ElementDefinition field the compound parents use; see B-103 note).
      grabbable: false,
    });
  }
  return badges;
}

/**
 * B-128 (D85/F02): one PORTAL badge per node ON `layerId` wired through
 * `setPortal` — the "there is depth here" marker (F02), riding the B-107
 * badge machinery: projection pseudo-NODES with the SHARED `tme-badge` class
 * (cull-coherence comes free — badges cull WITH content, B-115, and no
 * `min-zoomed-font-size` may ever be added) plus a DISTINCT `tme-portal-badge`
 * class whose stylesheet entry carries the depth hue, so a portal reads apart
 * from a cross-layer arc badge.
 *
 * The label is the TARGET layer's authored NAME (C23 — the word the user
 * wrote, never the id); a wiring whose target layer no longer exists
 * (unreachable through the facade — removeLayer unwires — but a live-reference
 * read must not assume) degrades to NO badge, never a machine name (C32
 * spirit). The host node's id rides as `nodeId` data — the service's
 * double-tap entry gesture keys on it (carried as data, never parsed out of
 * the prefixed id — the B-108 `arcId` precedent). Library nodes only: a
 * portal is authored wiring on MapNodeData, and overlay waypoints have no
 * editor command (the B-116 precedent).
 *
 * PURE (type-only imports, bare-Node friendly, R4 read-only).
 */
export function buildPortalBadges(map: WorldMapData, layerId: string): ElementDefinition[] {
  const layerNameOf = new Map(map.layers.map((layer) => [layer.id, layer.name] as const));
  const badges: ElementDefinition[] = [];
  for (const node of map.nodes) {
    if (node.layer !== layerId || node.portal === undefined) continue;
    const targetName = layerNameOf.get(node.portal);
    if (targetName === undefined) continue; // stale wiring — degrade to nothing (C32 spirit)
    const anchorPoint = badgeAnchor(node);
    if (anchorPoint === null) continue; // no authored position to anchor on — degrade (C32 spirit)
    badges.push({
      group: 'nodes' as const,
      // `nodeId` is the entry gesture's key into the LIVE node (it re-reads
      // the wiring at gesture time — a stale badge degrades to a no-op).
      data: { id: `tme-portal-badge-${node.id}`, label: targetName, nodeId: node.id },
      position: anchorPoint,
      classes: ['tme-badge', 'tme-portal-badge'],
      grabbable: false, // pinned pseudo-node — the compound-parent field (B-103 note)
    });
  }
  return badges;
}

/**
 * B-128 (D85/F02): the breadcrumb CHAIN of `activeLayerId` — the layer
 * hierarchy DERIVES from the portal wiring (no separate parent field, D85):
 * parent(L) is the layer of the first node in `map.nodes` order carrying
 * `portal === L` (reading (a): several layers may entry into the same target
 * — one NODE per target, not one parent — so the walk takes the FIRST wired
 * node's layer, deterministic over the authored array order). The chain runs
 * ROOT → ACTIVE. Reading (b): CYCLES are legal data (A portals into B, B
 * into A — the validator forbids only self-targets), so the walk carries a
 * visited-set and STOPS on a revisit — the chain just ends (degrade honestly,
 * no hang, C32 spirit). An active layer unknown to the map (degenerate) is
 * the empty chain. PURE: positions are authored data — nothing is computed
 * (R1); ids only, the rendered words are the layers' own names joined by the
 * caller (C23). Unit-pinned by tests/unit/portal-elements.spec.ts.
 */
export function breadcrumbChain(map: WorldMapData, activeLayerId: string): string[] {
  const known = new Set(map.layers.map((layer) => layer.id));
  if (!known.has(activeLayerId)) return []; // degenerate — degrade to nothing (C32 spirit)
  const parentOf = (layerId: string): string | null => {
    const wired = map.nodes.find((node) => node.portal === layerId);
    return wired === undefined ? null : wired.layer;
  };
  // Root → active: walk parents from the active layer, then reverse.
  const walked: string[] = [activeLayerId];
  const visited = new Set([activeLayerId]);
  let current = activeLayerId;
  for (;;) {
    const parent = parentOf(current);
    if (parent === null || !known.has(parent)) break; // no wiring / stale target — chain ends
    if (visited.has(parent)) break; // a cycle is legal data — the chain just ends (C32 spirit)
    visited.add(parent);
    walked.push(parent);
    current = parent;
  }
  return walked.reverse();
}
