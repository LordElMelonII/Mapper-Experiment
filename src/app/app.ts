// src/app/app.ts — PKG B-102. The dev harness root: loads FX1 (the
// Fuyuki/Misaki demo map) through the facade and renders the M1 viewer.
// Dev-harness-only: the shipped extension entry is src/st/entry.ts, which
// never imports this file.
import { Component, inject } from '@angular/core';
import { GraphService } from './graph/graph.service';
import { MapViewerComponent } from './viewer/map-viewer.component';
import { createFacade } from '../core/facade';
import type { ChatMapOverlay, MapEdgeData } from '../core/api';
import { fuyukiMap } from '../../data/worlds/fuyuki';

/**
 * B-111 — the ONE harness-only demo edge (the D69 display-copy precedent:
 * the dev harness may add display content the normative FX1 file never
 * carries). FX1's authored edges carry no `curve`, user edges never will this
 * milestone, and e2e cannot author library edges — so the harness displayMap
 * gains exactly this edge to prove §5 M3's `unbundled-bezier` rendering:
 *   - `kotomine-church` ↔ `fuyuki-bridge`: both layer-fuyuki, neither
 *     pin-incident (the pin is emiya-residence), so no per-layer node set,
 *     badge, or pinned route can see it;
 *   - `modes: { walk: { allowed: false } }` — its ONLY declared mode is
 *     disallowed and no other mode exists, so it prices ∞ in EVERY mode and
 *     currency (src/core/routing/price.ts:52 — `edge.modes[m]?.allowed ===
 *     true` is the usability gate; C14 row 2): routing-inert, so NO pinned
 *     route total (FX2 included) can move and it never enters a shortest
 *     path or destination list;
 *   - `curve: { distances: [40, -30] }` — validateWorldMap-clean (finite
 *     numbers, validate.ts:264-275); RENDERING-ONLY data (api.ts:45).
 * The demo edge rides the displayMap's COPIED edges array (B-110: the
 * shallow copy exists so promoteUserNode can mutate map.edges in place).
 */
const CURVE_DEMO_EDGE: MapEdgeData = {
  id: 'arc-harness-curve-demo',
  source: 'kotomine-church',
  target: 'fuyuki-bridge',
  modes: { walk: { allowed: false } },
  curve: { distances: [40, -30] },
};

/** Shape of the dev-harness-only e2e seam installed below (D53 phone e2e). */
interface TmeE2EHook {
  nodeLabels(): string[];
  edgeLineStyle(id: string): string | null;
  /** B-111: resolved curve-style of one edge ('bezier' | 'unbundled-bezier' | ...) or null. */
  edgeCurveStyle(id: string): string | null;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
  /** B-107: one cross-layer badge's text by arc id, or null (C3/C10 pin). */
  badgeText(arcId: string): string | null;
  /** B-109 (ruling 4): every projected edge id — counting kNN `we-` edges (C7). */
  edgeIds(): string[];
  /** B-109 (ruling 4): projected `parent` of one node — null for top-level (§6.2). */
  nodeParent(id: string): string | null;
  /** B-113: whether one projected node currently carries a class (read-only). */
  nodeHasClass(id: string, cls: string): boolean;
  /** B-116: MODEL position of one node (read-only) — persistence/non-drag proofs. */
  nodeModelPosition(id: string): { x: number; y: number } | null;
  /** B-116: the selected node's id, or null — engine-assigned ids are never hardcoded (C5/D75). */
  selectedNodeId(): string | null;
  /** B-117: authored fields of one library node (the editor plane), or null —
   *  the property panel's data seam (label/kind/parent/aliases/description). */
  nodeData(id: string): {
    label: string;
    kind: string;
    parent: string | null;
    aliases: string[];
    description: string | null;
  } | null;
  /** B-118: whether quick-connect mode is currently on. */
  connectMode(): boolean;
  /** B-118: the quick-connect pick set, in pick order. */
  pickedNodeIds(): string[];
  /** B-122: the pending draw-arc source's id, or null. */
  drawArcSourceId(): string | null;
  /** B-122: the draw-arc banner's current message, or null. */
  drawArcFeedback(): string | null;
  /** B-118: authored fields of one library edge (source/target/allowed modes),
   *  or null — the D42-default assertion seam for created arcs. */
  edgeData(id: string): { id: string; source: string; target: string; modes: string[] } | null;
  /** B-118: the live route's leg arc ids, or null — the F45 discriminator seam. */
  routeLegArcIds(): string[] | null;
  /** B-121 (D77): the edit log's ids — the draft visual's state seam. */
  draftedIds(): string[];
  /** B-121 (D77): resolved border-color of one node, or null (cascade pin). */
  nodeBorderColor(id: string): string | null;
  /** B-121 (D77): resolved line-color of one edge, or null (cascade pin). */
  edgeLineColor(id: string): string | null;
  /** B-121 (D77): the stylesheet's selectors in declaration order (cascade pin). */
  stylesheetSelectors(): string[];
}

@Component({
  selector: 'tme-root',
  imports: [MapViewerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly graphService = inject(GraphService);

  constructor() {
    const facade = createFacade();

    // D69 (harness ruling): the display map is a per-layer copy that adds a
    // harness-only placeholder background to layer-fuyuki. The node/edge
    // ARRAYS are shallow copies because the FX1 fixture is deep-frozen (D70)
    // while B-110's promoteUserNode mutates map.nodes/map.edges IN PLACE
    // (C24 — the stored library reference): the real host hands loadMap
    // fresh-parsed, extensible state, and the harness mirrors that. The
    // element objects stay the frozen authored ones — promote derives a NEW
    // node object (C26), nothing mutates them. The facade validates and
    // stores this object; the service gets the SAME reference (C24 — one
    // truth, R4). D70: the app layer may import data/ fixtures display-only
    // (lint-boundaries allows the 'data' pseudo-layer for 'app').
    const displayMap = {
      ...fuyukiMap,
      nodes: [...fuyukiMap.nodes],
      // B-111: the harness-only curve demo edge rides the COPY (see
      // CURVE_DEMO_EDGE above) — the frozen FX1 file stays untouched (D69).
      edges: [...fuyukiMap.edges, CURVE_DEMO_EDGE],
      layers: fuyukiMap.layers.map((layer) =>
        layer.id === 'layer-fuyuki'
          ? { ...layer, background: { assetId: 'assets/harness-bg-fuyuki.png' } }
          : layer,
      ),
    };

    // A fresh chat overlay (the state C persists per chat, Phase 4): pin on
    // Emiya Residence, walking, no user nodes/edges/blocks.
    const overlay: ChatMapOverlay = {
      mapId: 'fuyuki-misaki',
      currentLocationId: 'emiya-residence',
      travelMode: 'walk',
      userNodes: [],
      userEdges: [],
      blocked: {},
    };

    facade.loadMap(displayMap, overlay); // R2: the facade owns the map lifecycle
    this.graphService.loadMap(displayMap, overlay, facade); // R4: same references

    this.installE2EHook();
  }

  /**
   * DEV-HARNESS-ONLY e2e seam (D53) — never registered by the ST entry.
   * Read-only projections of the cy model for Playwright canvas assertions;
   * the hook exposes no mutation path (R2/R4) and no machine names (C23).
   */
  private installE2EHook(): void {
    (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__ = {
      nodeLabels: () => this.graphService.testNodeLabels(),
      edgeLineStyle: (id: string) => this.graphService.testEdgeLineStyle(id),
      edgeCurveStyle: (id: string) => this.graphService.testEdgeCurveStyle(id),
      nodeRenderedPosition: (id: string) => this.graphService.testNodeRenderedPosition(id),
      nodeRenderedBoundingBox: (id: string) => this.graphService.testNodeRenderedBoundingBox(id),
      zoom: () => this.graphService.testZoom(),
      pan: () => this.graphService.testPan(),
      badgeText: (arcId: string) => this.graphService.testBadgeText(arcId),
      edgeIds: () => this.graphService.testEdgeIds(),
      nodeParent: (id: string) => this.graphService.testNodeParent(id),
      nodeHasClass: (id: string, cls: string) => this.graphService.testNodeHasClass(id, cls),
      nodeModelPosition: (id: string) => this.graphService.testNodeModelPosition(id),
      selectedNodeId: () => this.graphService.selection()?.id ?? null,
      nodeData: (id: string) => this.graphService.testNodeData(id),
      connectMode: () => this.graphService.testConnectMode(),
      pickedNodeIds: () => this.graphService.testPickedNodeIds(),
      drawArcSourceId: () => this.graphService.testDrawArcSourceId(),
      drawArcFeedback: () => this.graphService.testDrawArcFeedback(),
      edgeData: (id: string) => this.graphService.testEdgeData(id),
      routeLegArcIds: () => this.graphService.testRouteLegArcIds(),
      draftedIds: () => this.graphService.testDraftedIds(),
      nodeBorderColor: (id: string) => this.graphService.testNodeBorderColor(id),
      edgeLineColor: (id: string) => this.graphService.testEdgeLineColor(id),
      stylesheetSelectors: () => this.graphService.testStylesheetSelectors(),
    };
  }
}
