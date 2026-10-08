// src/app/app.ts — PKG B-102. The dev harness root: loads FX1 (the
// Fuyuki/Misaki demo map) through the facade and renders the M1 viewer.
// Dev-harness-only: the shipped extension entry is src/st/entry.ts, which
// never imports this file.
//
// PKG B-124 — HARNESS-ONLY REGISTRY DEMO MAP: the map-driven mode surfaces
// (the route panel's switch, quick-connect's committed mode set) are only
// e2e-testable against a map that DECLARES a mode registry (D78). Boot with
// `?map=registry-demo` (e.g. http://localhost:4200/?map=registry-demo) to
// load REGISTRY_DEMO below INSTEAD of FX1 — a small two-layer world whose
// registry declares a registry mode ('horse' → 'Horseback', D42
// allowedByDefault) and a RELABELED, default-opted-out built-in ('car' →
// 'Carriage', allowedByDefault: false), plus one registry-only arc (horse
// its only allowed mode — prices in default runs only because A-016b
// widened the default candidate scan to the map's mode universe). The
// DEFAULT boot path (no param, any other value) is byte-identical to the
// pre-B-124 harness: FX1, the curve demo edge, the harness background.
// The demo map is IN-FILE data following the api.ts shape — validateWorldMap
// accepts it at loadMap (the D69 display-copy precedent: harness-only
// display content, the FX fixtures stay untouched, D70).
// PKG B-137 — THE MAP LIBRARY BOOT (§5 M4/D40): the display map is seeded
// into the MAP_LIBRARY at boot (an idempotent upsert — the Maps manager
// panel's list always carries the booted map); `?map=none` boots MAPLESS —
// no loadMap at all, the GraphService holds its no-map state and the Maps
// panel AUTO-OPENS (D40's picker-first journey, harness-testable now; the
// REAL host boots mapless at Phase 4 wiring and keeps its FX1-equivalent
// flow). `?cardmap=<id>` marks the matching library row "Suggested by the
// character card" (D40: suggested, NEVER auto-applied — the harness
// stand-in for the Phase 4 card-pointer read) in BOTH boot paths. The
// DEFAULT boot path (no param) is otherwise byte-identical to pre-B-137:
// FX1 or (with `?map=registry-demo`) the registry demo, the same loadMap
// pair, the curve demo edge, the harness background.
import { Component, inject } from '@angular/core';
import { GraphService } from './graph/graph.service';
import { MapViewerComponent } from './viewer/map-viewer.component';
import { createFacade } from '../core/facade';
import type { ChatMapOverlay, MapEdgeData, WorldMapData } from '../core/api';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import { MAP_LIBRARY } from './graph/map-library';

/** B-124: the `map` URL param value that boots the registry demo instead of FX1. */
const REGISTRY_DEMO_PARAM = 'registry-demo';

/** B-137 (D40): the `map` URL param value that boots MAPLESS — the picker-first journey. */
const MAPLESS_PARAM = 'none';

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

/**
 * B-124 — the harness-only REGISTRY DEMO map (see the header comment; the
 * FX fixtures stay untouched, D69/D70). A FRESH literal per call (the
 * displayMap doctrine: the real host hands loadMap fresh-parsed, extensible
 * state — facade commands mutate the stored map IN PLACE, C24, so nothing
 * here may be frozen or shared across constructions). Facts the e2e cells
 * pin (all arithmetic float-exact):
 *   - registry: `horse` → 'Horseback' (speed 6 — the resolved saved speed
 *     map takes registry entries first, so the arc below prices in MINUTES
 *     via C14 rows 5–6: units/speed×60), `car` → 'Carriage' with
 *     `allowedByDefault: false` (the D78 default-allowed derivation drops it
 *     — quick-connect/draw-arc commits carry NO 'car');
 *   - scale.speed carries the one BUILT-IN entry (`train: 6`) — inert here,
 *     structural proof that a scale.speed built-in and a registry mode
 *     coexist in one map's universe;
 *   - `arc-vale-gate-high-pasture` is A-016b's REGISTRY-ONLY arc: horse is
 *     its ONLY allowed mode, no authored minutes — 240 px × 0.125 = 30
 *     leagues, 30/6 × 60 = 300 min exactly. High Pasture is reachable ONLY
 *     through it, so the default run's route through the registry-only arc
 *     is structural, not price-comparison luck;
 *   - the walk arc carries authored minutes (C14 row 3 — verbatim, no
 *     multipliers), so every route runs in the minutes currency (C15);
 *   - every leaf sits in the map's TOP half (y ≤ 240) — the fitted phone
 *     view never places a node under the stage's bottom-corner chrome
 *     (the tool control / layer switcher), the B-106 overlay class of
 *     problem, so touch taps land on nodes at both viewports (D53).
 */
function registryDemoMap(): WorldMapData {
  return {
    schemaVersion: 2,
    id: 'vale-coast-registry-demo',
    name: 'Vale & Coast (Registry Demo)',
    layers: [
      { id: 'layer-vale', name: 'Green Vale' },
      { id: 'layer-coast', name: 'Coast' },
    ],
    scale: {
      unitPerPx: 0.125, // 1 px = 1/8 league (binary-exact: ×240 px = 30)
      unitLabel: 'league',
      unitKind: 'distance',
      speed: { train: 6 }, // the built-in speed entry (canonical units per hour)
    },
    modes: [
      { id: 'horse', label: 'Horseback', unit: 'leagues per hour', speed: 6, allowedByDefault: true },
      { id: 'car', label: 'Carriage', allowedByDefault: false },
    ],
    nodes: [
      { id: 'vale-gate', label: 'Vale Gate', kind: 'location', layer: 'layer-vale', position: { x: 100, y: 100 } },
      { id: 'high-pasture', label: 'High Pasture', kind: 'location', layer: 'layer-vale', position: { x: 340, y: 100 } },
      // top-half placement (see the comment block above) — clear of the
      // bottom-corner chrome at the phone fit
      { id: 'old-mill', label: 'Old Mill', kind: 'location', layer: 'layer-vale', position: { x: 220, y: 240 } },
      // the second layer's leaf — two-layer shape, no cross-layer arc needed
      { id: 'coast-lighthouse', label: 'Lighthouse', kind: 'location', layer: 'layer-coast', position: { x: 200, y: 200 } },
    ],
    edges: [
      // THE registry-only arc (A-016b): horse only, and the ONLY way into
      // High Pasture — unreachable in default runs before the default scan
      // widened to the map's mode universe (A-016b).
      {
        id: 'arc-vale-gate-high-pasture',
        source: 'vale-gate',
        target: 'high-pasture',
        modes: { horse: { allowed: true } },
      },
      { id: 'arc-vale-gate-old-mill', source: 'vale-gate', target: 'old-mill', modes: { walk: { allowed: true, authoredMinutes: 30 } } },
    ],
  };
}

/**
 * The DEFAULT boot map (D69 harness ruling): the FX1 display copy — a
 * per-layer copy that adds a harness-only placeholder background to
 * layer-fuyuki. The node/edge ARRAYS are shallow copies because the FX1
 * fixture is deep-frozen (D70) while B-110's promoteUserNode mutates
 * map.nodes/map.edges IN PLACE (C24 — the stored library reference): the
 * real host hands loadMap fresh-parsed, extensible state, and the harness
 * mirrors that. The element objects stay the frozen authored ones — promote
 * derives a NEW node object (C26), nothing mutates them. The facade
 * validates and stores this object; the service gets the SAME reference
 * (C24 — one truth, R4). D70: the app layer may import data/ fixtures
 * display-only (lint-boundaries allows the 'data' pseudo-layer for 'app').
 */
function fuyukiDisplayMap(): WorldMapData {
  return {
    ...fuyukiMap,
    nodes: [...fuyukiMap.nodes],
    // B-111: the harness-only curve demo edge rides the COPY (see
    // CURVE_DEMO_EDGE above) — the frozen FX1 file stays untouched (D69).
    edges: [...fuyukiMap.edges, CURVE_DEMO_EDGE],
    // B-123: the scale block is a SHALLOW COPY for the same B-110 doctrine —
    // A-015's calibrateScale mutates scale.unitPerPx/unitLabel/unitKind IN
    // PLACE (C24 — the stored library reference), and a deep-frozen fixture
    // scale would make every "measure this arc" refusal-throw
    // ("Cannot assign to read only property"). The real host hands loadMap
    // fresh-parsed, extensible state; the harness mirrors that. The nested
    // terrainMultipliers stay the frozen authored ones — pricing reads them,
    // no facade command writes them.
    scale: { ...fuyukiMap.scale },
    // B-126 (C24): the layer commands mutate `map.layers` in place —
    // upsertLayer CREATE pushes, removeLayer/reorderLayers REASSIGN — so
    // the array must be a shallow copy exactly like nodes/edges (B-110) and
    // scale (B-123): the frozen FX1 array would make every layer command
    // throw "Cannot assign to read only property". The `.map()` IS that
    // copy (plus the harness-only fuyuki background patch, D69); the layer
    // ELEMENT objects stay the frozen authored ones — every layer command
    // swaps FRESH objects in by index (the D75 seam), nothing mutates them.
    layers: fuyukiMap.layers.map((layer) =>
      layer.id === 'layer-fuyuki'
        ? { ...layer, background: { assetId: 'assets/harness-bg-fuyuki.png' } }
        : layer,
    ),
  };
}

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
  /** B-142 (R-2 phone boot zoom): the LIVE label-cull threshold (fitView's
   *  fit-relative field, B-113 ruling 1) — the boot floor's in-page seam. */
  cullZoom(): number;
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
   *  or null — the D42-default assertion seam for created arcs. B-123: the
   *  editing-plane fields the arc panel commits (terrain, authoredDistance,
   *  curve distances) joined the shape. */
  edgeData(id: string): {
    id: string;
    source: string;
    target: string;
    modes: string[];
    terrain: string | null;
    authoredDistance: number | null;
    curveDistances: number[] | null;
  } | null;
  /** B-123: the per-mode EDIT rows of one arc (arcModesOf — the D78/C23 seam),
   *  or null; the map's mode universe with the resolver's labels. */
  arcModes(id: string): { id: string; label: string; allowed: boolean; authoredMinutes: number | null }[] | null;
  /** B-124: the route panel's switch rows (modeRows — the D78/C23 seam):
   *  the map's mode universe with the resolver's labels, or [] pre-load. */
  modeRows(): { id: string; label: string }[];
  /** B-123 (R1/D44): the live scale's verbatim numbers — the measure readout seam. */
  scaleInfo(): { unitPerPx: number; unitLabel: string; unitKind: string } | null;
  /** B-118: the live route's leg arc ids, or null — the F45 discriminator seam. */
  routeLegArcIds(): string[] | null;
  /** B-121 (D77): the edit log's ids — the draft visual's state seam. */
  draftedIds(): string[];
  /** B-126 (D82/R1): the engine's layer-removal counts (N/M/K) — the delete
   *  dialog's numbers asserted against the core's own answer, or null when
   *  no map is loaded / the id is unknown. */
  layerRemovalImpact(layerId: string): { nodes: number; sameLayerArcs: number; crossLayerArcs: number } | null;
  /** B-121 (D77): resolved border-color of one node, or null (cascade pin). */
  nodeBorderColor(id: string): string | null;
  /** B-121 (D77): resolved line-color of one edge, or null (cascade pin). */
  edgeLineColor(id: string): string | null;
  /** B-121 (D77): the stylesheet's selectors in declaration order (cascade pin). */
  stylesheetSelectors(): string[];
  /** B-128 (D85): the ACTIVE layer's breadcrumb chain (as rendered), or [] —
   *  root → active, the rendered crumb row's truth. */
  breadcrumbChain(): string[];
  /** B-128 (D85): one portal badge's label (the target layer's name) by its
   *  wire node's id, or null when not projected (unwired / other layer). */
  portalBadgeText(nodeId: string): string | null;
  /** B-135: whether the calibrate mode is currently on (the mode-state seam). */
  calibrateMode(): boolean;
  /** B-135: the ACTIVE layer's PERSISTED placement arm, or null (the
   *  committed-gesture seam — the held default is deliberately excluded). */
  backgroundPlacement(): { x: number; y: number; scale: number } | null;
  /** B-135 (D92): the ACTIVE layer's default-fit placement through the ONE
   *  shared derivation (defaultPlacementFor), or null when degenerate. */
  defaultPlacement(): { x: number; y: number; scale: number } | null;
  /** B-137: the map library's rows as light summaries (id/name/forkedFrom —
   *  the Maps panel's list state), or [] on a store failure. Read-only
   *  (R2/R4); the ids are assertion keys, never rendered words (C23). */
  libraryList(): Promise<{ id: string; name: string; forkedFrom: string | null }[]>;
  /** B-137: whether THIS boot took the mapless path (?map=none — D40). */
  bootMapless(): boolean;
  /** B-137: the card-pointer suggestion's map id (?cardmap=), or null. */
  cardSuggestedMapId(): string | null;
  /** B-137: the loaded map's id, or null when mapless (the mapless/delete states). */
  loadedMapId(): string | null;
}

@Component({
  selector: 'tme-root',
  imports: [MapViewerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly graphService = inject(GraphService);
  private readonly library = inject(MAP_LIBRARY);

  /** B-137: whether this boot took the mapless path — the e2e hook's read. */
  private bootWasMapless = false;

  constructor() {
    const facade = createFacade();
    const params = new URLSearchParams(window.location.search);
    const mapParam = params.get('map');

    if (mapParam === MAPLESS_PARAM) {
      // B-137 (D40): the MAPLESS boot — no loadMap call at all; the service
      // holds its no-map state and the Maps panel AUTO-OPENS (the
      // picker-first journey). The facade is attached WITHOUT a map so the
      // panel's Open/New flows load through it later. The library is still
      // seeded (a STORE write, never a load — the real host's picker stands
      // over previously-saved maps; the harness stand-in seeds the demo
      // world so the mapless journey has something to open).
      this.bootWasMapless = true;
      this.graphService.attachFacade(facade);
      this.graphService.mapsPanelOpen.set(true);
      this.library.save(fuyukiDisplayMap()).catch(() =>
        console.warn('[TravelMapper] map library seed failed'),
      );
    } else {
      // B-124: `?map=registry-demo` boots the harness-only registry demo map
      // INSTEAD of FX1 (see the header comment) — the DEFAULT boot path (no
      // param, any other value) stays byte-identical: fuyukiDisplayMap().
      const demoRequested = mapParam === REGISTRY_DEMO_PARAM;
      const displayMap = demoRequested ? registryDemoMap() : fuyukiDisplayMap();

      // A fresh chat overlay (the state C persists per chat, Phase 4): pin on
      // the map's start leaf, walking, no user nodes/edges/blocks. The demo's
      // overlay rides its own map id and pin (the mode universe it validates
      // against is the demo registry's — D78).
      const overlay: ChatMapOverlay = demoRequested
        ? {
            mapId: 'vale-coast-registry-demo',
            currentLocationId: 'vale-gate',
            travelMode: 'walk',
            userNodes: [],
            userEdges: [],
            blocked: {},
            nodeBlocked: {},
          }
        : {
            mapId: 'fuyuki-misaki',
            currentLocationId: 'emiya-residence',
            travelMode: 'walk',
            userNodes: [],
            userEdges: [],
            blocked: {},
            nodeBlocked: {},
          };

      facade.loadMap(displayMap, overlay); // R2: the facade owns the map lifecycle
      this.graphService.loadMap(displayMap, overlay, facade); // R4: same references

      // B-137 (§5 M4): the boot map seeds the library — an idempotent upsert
      // (the store clones; the stored row is the boot state). A store
      // failure degrades to ONE warn — the harness map still runs (C32).
      this.library.save(displayMap).catch(() =>
        console.warn('[TravelMapper] map library seed failed'),
      );
    }

    // B-137 (D40): the card-pointer SUGGESTION (harness stand-in) — marks a
    // library row in the Maps panel, never auto-applies, works in BOTH boot
    // paths. The real host read lands at Phase 4.
    const cardMapId = params.get('cardmap');
    if (cardMapId !== null && cardMapId.length > 0) {
      this.graphService.cardSuggestedMapId.set(cardMapId);
    }

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
      cullZoom: () => this.graphService.testCullZoom(),
      nodeModelPosition: (id: string) => this.graphService.testNodeModelPosition(id),
      selectedNodeId: () => this.graphService.selection()?.id ?? null,
      nodeData: (id: string) => this.graphService.testNodeData(id),
      connectMode: () => this.graphService.testConnectMode(),
      pickedNodeIds: () => this.graphService.testPickedNodeIds(),
      drawArcSourceId: () => this.graphService.testDrawArcSourceId(),
      drawArcFeedback: () => this.graphService.testDrawArcFeedback(),
      edgeData: (id: string) => this.graphService.testEdgeData(id),
      arcModes: (id: string) => this.graphService.testArcModesOf(id),
      modeRows: () => this.graphService.testModeRows(),
      scaleInfo: () => this.graphService.testScaleInfo(),
      routeLegArcIds: () => this.graphService.testRouteLegArcIds(),
      draftedIds: () => this.graphService.testDraftedIds(),
      layerRemovalImpact: (layerId: string) => this.graphService.testLayerRemovalImpact(layerId),
      nodeBorderColor: (id: string) => this.graphService.testNodeBorderColor(id),
      edgeLineColor: (id: string) => this.graphService.testEdgeLineColor(id),
      stylesheetSelectors: () => this.graphService.testStylesheetSelectors(),
      breadcrumbChain: () => this.graphService.testBreadcrumbChain(),
      portalBadgeText: (nodeId: string) => this.graphService.testPortalBadgeText(nodeId),
      calibrateMode: () => this.graphService.testCalibrateMode(),
      backgroundPlacement: () => this.graphService.testActiveLayerPlacement(),
      defaultPlacement: () => this.graphService.testDefaultPlacement(),
      libraryList: async () => {
        try {
          return (await this.library.list()).map((entry) => ({
            id: entry.id,
            name: entry.name,
            forkedFrom: entry.forkedFrom,
          }));
        } catch {
          return []; // the store refused — the spec's row expectations fail honestly (C32 spirit)
        }
      },
      bootMapless: () => this.bootWasMapless,
      cardSuggestedMapId: () => this.graphService.cardSuggestedMapId(),
      loadedMapId: () => this.graphService.loadedMapId(),
    };
  }
}
