// src/app/graph/layer-elements.ts — the PURE layer projection (B-102, M1
// verifier finding 2 fix): frozen core types in, cytoscape element
// definitions out. No Angular, no cytoscape runtime, no DOM — type-only
// imports, which is exactly what lets tests/verify (bare-Node vitest) pin it
// without a browser (the UI bar's e2e still covers the mounted pipeline).
//
// R4: takes the SAME live map/overlay references the facade holds (C24) and
// only READS them — this builds a projection, never a second truth. R1: no
// distance/direction/duration is computed here; positions are authored data.

import type { ElementDefinition } from 'cytoscape';
import type { ChatMapOverlay, WorldMapData } from '../../core/api';

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
 *     simply not drawn in M1 (badges are M2).
 * Blocked state is the merge the effective graph implements: an authored
 * block OR a chat-scoped overlay block (D20) — read-only, no math (R1).
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
      classes.push('tme-crosslayer'); // C3: informational — such arcs are filtered out in M1
    }
    if (sourceLayer !== layerId || targetLayer !== layerId) continue; // F01/D16 + C3 (M1)
    edges.push({
      group: 'edges' as const,
      data: { id: edge.id, source: edge.source, target: edge.target },
      classes,
    });
  }

  return [...nodes, ...edges];
}
