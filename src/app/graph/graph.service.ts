// src/app/graph/graph.service.ts — PKG B-102, extended by B-103 (selection +
// drag), B-105 (route sidebar state), B-106 (edge selection + the blocked
// toggle), B-107 (cross-layer endpoint badges — C3 pseudo-nodes with
// core-sourced cost text) and B-108 (gate fix: the badge IS the cross-layer
// arc's management surface — badge taps select the arc; badges re-price on
// travel-mode switches). The ONE cytoscape instance (D3): created headless
// in the constructor, `mount()`/`unmount()` on demand — computation works with
// the UI closed. Zoneless (D2): the service writes signals; the ONLY canvas
// events bound are discrete gestures (`tap` → selection signals, `free` →
// debug log) — high-frequency events (tapstart/tapdrag/tapend) are never
// registered, so dragging costs zero change detection.
//
// R4 (no shadow truth): the service stores the SAME live WorldMapData +
// ChatMapOverlay references the host handed to the facade (C24) and builds a
// PROJECTION of the active layer into cy. It never reads facadeStateOf, never
// copies nodes/edges, and mutates nothing — all viewer-state changes flow
// through facade commands (R2): loadMap (by the harness) + setActiveLayer.
// R1: nothing here computes a distance, direction, duration, or cost — node
// positions are authored data, labels/names are core strings.
//
// Stylesheet-as-data (D7): GRAPH_STYLESHEET below is plain data; all panel
// chrome lives in component-scoped SCSS. Kept minimal — theming depth is M4.

import cytoscape from 'cytoscape';
import type { Core, EdgeSingular, NodeSingular, StylesheetStyle } from 'cytoscape';
import { Injectable, OnDestroy, computed, effect, signal } from '@angular/core';
import type {
  ChatMapOverlay,
  MapEdgeData,
  MapSnapshot,
  RouteResult,
  TravelMode,
  WorldMapData,
} from '../../core/api';
import type { MapFacade } from '../../core/facade';
import { buildCrossLayerBadges, buildLayerElements, crossLayerAnchors } from './layer-elements';

/** Switcher label: the id the facade validates + the C23 human name. */
export interface LayerLabel {
  readonly id: string;
  readonly name: string;
}

/**
 * B-106 (ruling 3): what the arc panel renders for one arc — authored/overlay
 * data read verbatim off the live references (R4: presence checks, never
 * copies; R1: labels are authored strings, no numbers here). `blockedReason`
 * is the overlay's restated reason when both exist (the facade's "adds or
 * restates only" precedence), else the authored one, else null (open arc).
 */
export interface ArcInfo {
  readonly sourceLabel: string;
  readonly targetLabel: string;
  /** Allowed modes in authored key order — display words, not UI logic. */
  readonly modes: readonly TravelMode[];
  readonly blockedReason: string | null;
  /** D20: a library-level block (MapEdgeData.blocked.reason). */
  readonly authored: boolean;
  /** D20: a chat-scoped block (overlay.blocked[edgeId]). */
  readonly overlay: boolean;
}

/**
 * D7: the cytoscape stylesheet as plain data. Selectors key off element
 * classes assigned by buildElements(): `tme-<kind>` per node kind (F07
 * districts are compound parents), `tme-pin` for the overlay's pinned node,
 * `tme-selected` for the tapped node (B-103, driven by the selectedNode
 * signal), `tme-blocked` for arcs excluded from routing but still DRAWN (C2 —
 * dashed, never hidden), `tme-crosslayer` (informational; such arcs are not
 * drawn in M1, C3), `tme-badge` for B-107's cross-layer endpoint pseudo-node
 * (C3 — the badge REPLACES the arc's line; see node.tme-badge below). Node
 * bodies are 44px so the rendered tap target satisfies F52.
 * Colors are the M4-themable defaults; keep this data, not code.
 */
export const GRAPH_STYLESHEET: StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      width: 44,
      height: 44,
      shape: 'ellipse',
      'background-color': '#56637a',
      'border-width': 1,
      'border-color': '#aebdd3',
      color: '#e6ebf2',
      'font-size': 12,
      'text-valign': 'bottom',
      'text-halign': 'center',
    },
  },
  {
    selector: 'node.tme-district',
    style: {
      // F07: containers organize and label — a transparent box around their
      // children; auto-sized by cytoscape's compound layout.
      shape: 'round-rectangle',
      'background-opacity': 0,
      'border-width': 1.5,
      'border-color': 'rgba(220, 228, 240, 0.4)',
      'border-style': 'dashed',
      'font-size': 14,
      'text-valign': 'top',
      color: '#c7d0dd',
    },
  },
  {
    selector: 'node.tme-location',
    style: { 'background-color': '#4f81b5' },
  },
  {
    selector: 'node.tme-hub',
    style: { 'background-color': '#b0813f' },
  },
  {
    selector: 'node.tme-waypoint',
    style: { 'background-color': '#8064b8' },
  },
  {
    selector: 'node.tme-pin',
    style: {
      'background-color': '#ffd166',
      'border-width': 2,
      'border-color': '#1d232b',
    },
  },
  {
    // B-103: selection accent — follows the selectedNode signal via the
    // service's effect (R3: the class is a projection of signal state, so
    // tap-select, background-tap clear and chip dismiss can never diverge).
    // Gold matches the pin / active-layer accent.
    selector: 'node.tme-selected',
    style: {
      'border-width': 3,
      'border-color': '#ffd166',
    },
  },
  {
    // B-107 (C3, ruling 4), B-108 finding 1: cross-layer endpoint badges —
    // pseudo-nodes with NO visible body and subdued small text; their tap
    // footprint IS the arc's canvas surface (the tap selects the arc).
    // `z-index` IS declared (@types/cytoscape 3.21.9 index.d.ts:4762; runtime
    // draws higher z-index on top, default 0) — -1 keeps badges below every
    // map node, while z-index-compare 'auto' (default) still keeps nodes
    // above edges. The 4px invisible body keeps that footprint from
    // eclipsing map nodes (the visible affordance is the label text).
    // NOTE: `min-zoomed-font-size` is
    // deliberately NOT set — verified against the installed runtime
    // (cytoscape.umd.js eleTextBiggerThanMin): it HIDES any label whose
    // zoomed size falls below the floor (it is not an upscaling floor), which
    // would blank badges at phone-fit zoom. Badge text scales with zoom like
    // every other canvas label (D7).
    selector: 'node.tme-badge',
    style: {
      'background-opacity': 0,
      'border-width': 0,
      width: 4,
      height: 4,
      color: '#8fa0b5',
      'font-size': 11,
      'text-valign': 'center',
      'text-halign': 'center',
      'z-index': -1,
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'line-color': '#8fa0b5',
      // B-106 (ruling 2): 4, not 2 — edges are tappable content now. The
      // installed runtime (cytoscape 3.34.3, findNearestElements/checkEdge)
      // hit-tests an edge within width/2 + (touch 24 : mouse 8)/zoom model
      // units of the rendered line, INDEPENDENT of the 44px control rule —
      // so the width feeds both the visual and half the hit radius. The e2e
      // taps the rendered midpoint of the two endpoints (test-side math).
      width: 4,
    },
  },
  {
    // C2: blocked arcs are excluded from routing but remain DRAWN — dashed
    // and distinct, never hidden (and still tappable — that is how the lift
    // stays reachable). Width restated so a future base-width change can
    // never make the blocked arc thinner than the base (ruling 2).
    selector: 'edge.tme-blocked',
    style: {
      'line-style': 'dashed',
      'line-color': '#c9564e',
      width: 4,
    },
  },
  {
    // B-106: edge-selection accent — the same R3 pattern as tme-selected,
    // driven by the edgeSelection signal. Declared AFTER tme-blocked so a
    // selected blocked arc reads as gold AND dashed (still blocked — the
    // class never restyles line-style, only the accent color/width).
    selector: 'edge.tme-edge-selected',
    style: {
      'line-color': '#ffd166',
      width: 5,
    },
  },
];

/** Padding (px) around the fitted layer bounds — see fitView. */
const FIT_PADDING = 40;

/**
 * The D3 cytoscape owner. `providedIn: 'root'`: one instance per app — in the
 * dev harness the app root; in the extension the panel root (Phase 3).
 */
@Injectable({ providedIn: 'root' })
export class GraphService implements OnDestroy {
  // R4/C24: live references, stored as handed over — never copied, never
  // mutated. The map rides a signal only so layerNames/activeBackground
  // recompute when a (new) map is loaded; the reference itself is read-only.
  private readonly map = signal<WorldMapData | null>(null);
  private overlay: ChatMapOverlay | null = null;
  private facade: MapFacade | null = null;
  private mounted = false;

  /** Facade-held viewer state mirrored for the switcher's active highlight. */
  readonly activeLayer = signal<string | null>(null);

  /** The latest facade snapshot (R1: every header string originates here). */
  readonly snapshot = signal<MapSnapshot | null>(null);

  /** Switcher labels derived from the loaded map — names never hardcoded. */
  readonly layerNames = computed((): readonly LayerLabel[] =>
    (this.map()?.layers ?? []).map((layer) => ({ id: layer.id, name: layer.name })),
  );

  /** F03: the active layer's background assetId, or null when it has none. */
  readonly activeBackground = computed((): string | null => {
    const layer = this.map()?.layers.find((l) => l.id === this.activeLayer());
    return layer?.background?.assetId ?? null;
  });

  /**
   * B-105 (ruling 1): the tapped node — id + label in ONE signal, so the
   * chip, the route and the canvas accent can never drift (R3). The label is
   * the authored string projected at tap time (C23-renderable); the id is the
   * engine's stable key the tme-selected effect matches by — labels are
   * authored strings and not guaranteed unique; ids are. Cleared by a
   * background tap or the chip's dismiss control — every writer goes through
   * this signal.
   */
  readonly selection = signal<{ id: string; label: string } | null>(null);

  /**
   * B-106 (ruling 1): the tapped edge — id only; labels/modes/blocked state
   * are read per-render through arcInfo() off the live references (R4), so
   * this signal can never go stale against a block/lift. Mutually exclusive
   * with `selection` by construction: a node tap clears it, an edge tap
   * clears the node selection, a background tap clears both — every writer
   * is a discrete tap handler (D2). B-108: a cross-layer badge tap is an
   * edge tap in all but coordinates — it writes THIS signal with the arc id
   * the badge carries, so the arc panel opens for cross-layer arcs too.
   */
  readonly edgeSelection = signal<{ id: string } | null>(null);

  /**
   * B-106 (ruling 4): bumped by every blockArc/liftBlock — a revision counter
   * for "the effective graph changed". The route computed lists it as a
   * dependency so blocking the only road flips the sidebar to ok:false LIVE
   * (the C17 display proves itself), and the arc panel's computed re-reads
   * arcInfo after a block/lift without edgeSelection moving.
   */
  readonly graphRevision = signal(0);

  /**
   * B-105 (ruling 3): mirror of `overlay.travelMode` — the mode switch's
   * active highlight. loadMap seeds it from the live overlay; the ONLY other
   * writer is setTravelModePreference, which keeps it in lockstep with the
   * facade command (R2 — the service itself never mutates the overlay).
   */
  readonly travelMode = signal<TravelMode>('walk');

  /**
   * B-105 (ruling 2): the live route from the pin to the selection — a
   * computed over DISCRETE signals only (selection, travelMode,
   * graphRevision), so canvas drags and other high-frequency events recompute
   * nothing (D2). null when nothing is selected, when no facade is loaded,
   * when the pin is unset, or when the selection IS the pin (ruling 6: the
   * panel shows a current-location state instead — the core's from===to
   * branch exists for §6.2 completeness; the UI simply never queries it). The
   * pin id is a plain read of the live overlay reference — the pin does not
   * move in M2. DEFAULT mode (no third argument): D60(a) preference semantics
   * apply. R1: every number/label in the result is core-computed.
   * B-106 (ruling 4): graphRevision is a dependency — a block/lift through
   * blockArc/liftBlock re-runs findRoute (the facade's ensureFresh rebuild
   * picks the overlay change up first), so the C17 unreachable reason lands
   * in the sidebar the moment the only road closes.
   */
  readonly route = computed<RouteResult | null>(() => {
    void this.travelMode(); // dependency: a preference switch re-prices the default run
    void this.graphRevision(); // dependency: a block/lift re-routes (C2 live, B-106)
    const sel = this.selection();
    const pinId = this.overlay?.currentLocationId ?? null;
    if (sel === null || this.facade === null || pinId === null || pinId === sel.id) {
      return null;
    }
    return this.facade.findRoute(pinId, sel.id);
  });

  /**
   * B-105 (ruling 6): the selection is the pin itself — the panel's
   * current-location state (label only, no route numbers).
   */
  readonly pinSelected = computed<boolean>(() => {
    const sel = this.selection();
    return sel !== null && (this.overlay?.currentLocationId ?? null) === sel.id;
  });

  // D3: created ONCE, headless — mount() attaches a DOM host later; unmount()
  // returns to headless. Computation works with the UI closed. Verified
  // against @types/cytoscape 3.21.9 + the installed 3.34.3 runtime: a headless
  // Core IN A BROWSER needs `headless: true` (the renderer dereferences a
  // null container otherwise), and `styleEnabled: true` keeps the stylesheet
  // resolvable while unmounted (mount() re-applies it). There is NO
  // `pinchToZoom` option — pinch-zoom is native touch under
  // userZoomingEnabled.
  private readonly cy: Core = cytoscape({
    container: null,
    headless: true,
    styleEnabled: true,
    style: GRAPH_STYLESHEET,
    layout: { name: 'preset' },
    userZoomingEnabled: true,
    userPanningEnabled: true,
    boxSelectionEnabled: false,
  });

  constructor() {
    // D53: canvas input binds through cytoscape's UNIFIED pointer/touch events
    // — 'tap' etc. of UserInputDeviceEventNameExt in the installed
    // @types/cytoscape 3.21.9 (index.d.ts: tapstart/tapdrag/tapend/taphold
    // declared alongside tap) — never raw touchstart/mousedown, so mouse and
    // touch share one code path (F52). Pinch-zoom and pan are handled natively
    // by cytoscape under userZoomingEnabled/userPanningEnabled (no code, and
    // there is NO pinchToZoom option); touch-action: none on the canvas host
    // (map-viewer SCSS) keeps them from scrolling the host page (§6.2).
    //
    // Binding lifetime: handlers are bound ONCE here for the life of the one
    // cy instance (D3). Verified semantics: cy.unmount() only detaches the
    // container — Core listeners survive mount/unmount cycles and simply
    // receive no input while headless; cy.destroy() (ngOnDestroy) owns their
    // teardown. No unbind in unmount().
    this.cy.on('tap', 'node', (event) => {
      // D2: a tap is a DISCRETE gesture — writing the selection signal here is
      // the sanctioned path. The selector guarantees a node target
      // (EventObject.target is typed any).
      const node = event.target as NodeSingular;
      // B-108 (finding 1.1): the badge pseudo-node IS the cross-layer arc's
      // only canvas surface (C3; F14/C2 have no same-layer carve-out) — a
      // badge tap selects the ARC with exactly an edge tap's semantics:
      // edgeSelection set, node selection cleared (B-106 mutual exclusion),
      // so the arc panel — home of the reason input and Lift — opens for
      // cross-layer arcs too. It still NEVER sets a node selection (badges
      // are not map nodes: no chip, no route target). The arc id comes from
      // the pseudo-node's data (layer-elements carries `arcId`), never parsed
      // out of the prefixed node id; an absent arcId degrades to a swallowed
      // tap (C32 spirit).
      if (node.hasClass('tme-badge')) {
        const arcId = node.data('arcId');
        if (typeof arcId === 'string' && arcId.length > 0) {
          this.selection.set(null);
          this.edgeSelection.set({ id: arcId });
        }
        return;
      }
      // B-105 (ruling 1): selection carries the id (stable, unique) + the
      // label (authored string, projected once at tap time).
      // B-106 (ruling 1): node and edge selection are mutually exclusive —
      // this tap hands the panel back from the arc panel to the route panel.
      this.edgeSelection.set(null);
      this.selection.set({ id: node.id(), label: String(node.data('label') ?? '') });
    });
    this.cy.on('tap', 'edge', (event) => {
      // B-106 (ruling 1/2): an edge tap selects the arc — the selector
      // guarantees an edge target (EventObjectEdge.target: EdgeSingular in
      // the installed @types/cytoscape 3.21.9). Same discrete path (D2); the
      // mutual exclusion clears the node selection, so the arc panel replaces
      // the route target line while it is open.
      const edge = event.target as EdgeSingular;
      this.selection.set(null);
      this.edgeSelection.set({ id: edge.id() });
    });
    this.cy.on('tap', (event) => {
      // Element taps bubble to the core, so only a cy-targeted tap is a
      // background tap: clear BOTH selections (D2, same discrete path;
      // B-106 ruling 1).
      if (event.target === this.cy) {
        this.selection.set(null);
        this.edgeSelection.set(null);
      }
    });
    this.cy.on('free', 'node', () => {
      // Nodes stay grabbable with ZERO code of ours: autolock and
      // autoungrabify both default to false in the installed declarations
      // (@types/cytoscape 3.21.9, Core options — "The default value is
      // false"), so cytoscape's native drag is left untouched.
      //
      // M1 ruling (R2/R4): drag persistence is a MUTATION, and the frozen §9
      // surface has no move command — so the drag is view-local: positions
      // live only in cytoscape (which IS the projection — no shadow copy) and
      // are lost on layer switch. `free` fires on drag release; it writes no
      // signal (D2: high-frequency events never touch Angular state).
      // Phase 3: upsertNode persists node positions.
      console.debug('[TravelMapper] node moved (view-local; Phase 3 upsertNode persists)');
    });

    // R3: the tme-selected / tme-edge-selected accents follow the SIGNALS —
    // the classes are a projection of selection state, so tap-select,
    // background-tap clear and chip dismiss stay consistent without
    // duplicating class bookkeeping. The effect writes no signals, so it
    // triggers no change detection (D2). B-105 (ruling 1): matched by ID via
    // cy.getElementById — labels are not guaranteed unique; ids are the
    // engine's stable keys. An id absent from the current projection (e.g.
    // the element lives on the inactive layer, or the arc is cross-layer —
    // B-108: a badge-selected arc has NO edge in any projection, so its
    // accent lands on the open panel alone) matches an empty collection —
    // a no-op, never an error. rebuildElements() re-runs the same projection
    // after the element swap (B-106: a block/lift rebuild must not drop the
    // accents — one function, no duplicated logic).
    effect(() => {
      this.selection();
      this.edgeSelection();
      this.applySelectionClasses();
    });
  }

  ngOnDestroy(): void {
    this.cy.destroy();
  }

  /**
   * Load a map + overlay + the facade that owns them. `map`/`overlay` must be
   * the SAME objects already given to `facade.loadMap` by the host (R4/C24:
   * one truth; this service only projects it). Rebuilds the projection for
   * the map's first layer and refreshes the snapshot.
   */
  loadMap(map: WorldMapData, overlay: ChatMapOverlay, facade: MapFacade): void {
    this.map.set(map);
    this.overlay = overlay;
    this.facade = facade;
    // B-105: seed the mirrors off the newly loaded state. A selection from a
    // prior map would reference node ids the new map does not know — clear it
    // (the canvas projection is rebuilt below regardless). B-106: same for an
    // edge selection (ruling 1's mutual exclusion starts each map clean).
    this.travelMode.set(overlay.travelMode);
    this.selection.set(null);
    this.edgeSelection.set(null);
    // Validators guarantee >= 1 layer; degrade to no-layer rather than throw.
    const firstLayer = map.layers[0]?.id ?? null;
    if (firstLayer !== null) {
      facade.setActiveLayer(firstLayer); // R2: viewer state flows through the facade
    }
    this.activeLayer.set(firstLayer);
    this.rebuildElements();
    this.refreshSnapshot();
  }

  /** D3: attach the headless instance to a DOM host and size it. */
  mount(el: HTMLElement): void {
    this.cy.mount(el);
    this.cy.resize();
    this.mounted = true;
    this.fitView(); // headless rebuilds have no viewport — fit now that we do
  }

  /**
   * D3: detach — the instance stays alive and queryable, headless again.
   * Event handlers bound in the constructor stay bound (unmount only detaches
   * the container; destroy() owns teardown — see the constructor comment).
   */
  unmount(): void {
    this.mounted = false;
    this.cy.unmount();
  }

  /**
   * Switch the visible layer: through the facade (R2 — it validates the id
   * and owns viewer state), then mirror into the signal, rebuild the
   * projection and re-fit the view to this layer's nodes.
   */
  selectLayer(layerId: string): void {
    this.facade?.setActiveLayer(layerId);
    this.activeLayer.set(layerId);
    this.rebuildElements();
    this.refreshSnapshot();
  }

  /**
   * B-105 (ruling 3): the travel-mode preference switch — Walk/Car/Train only
   * (F32/D19: there is no persistent vehicle state, and D60(a) already falls
   * back per arc, so there is no 'auto' option to offer). R2: the facade
   * command is the ONLY mutation; the service then mirrors its signal,
   * refreshes the snapshot (the header re-prices) and rebuilds the
   * projection. B-108 (finding 2, D60(a)/F32/D72): the rebuild is what
   * re-prices the BADGES — their labels are frozen strings computed only in
   * badgeRoutes inside rebuildElements (the route panel re-prices via its
   * travelMode dependency; badges have no such dependency), and it re-applies
   * the selection accents so an open arc panel keeps its accent across the
   * element swap (B-106).
   */
  setTravelModePreference(mode: TravelMode): void {
    this.facade?.setTravelMode(mode);
    this.travelMode.set(mode);
    this.refreshSnapshot();
    this.rebuildElements();
  }

  /**
   * B-106 (ruling 4): chat-scoped block with a reason (F14/D20). R2: the ONLY
   * mutation is the facade command — setBlocked(edgeId, reason) validates
   * (C30 non-empty reason, unknown edge id) and writes overlay.blocked. Then
   * the revision bump re-routes the sidebar (route computed dependency), the
   * rebuild re-projects the dashed class (buildLayerElements reads the merge)
   * and the snapshot refresh re-lists pin-incident blocked arcs (C19).
   * The panel's Block button is disabled on an empty reason, so the facade's
   * C30 throw is unreachable from this path — the facade stays the authority
   * (§6.2), the UI is honest about it.
   */
  blockArc(edgeId: string, reason: string): void {
    this.facade?.setBlocked(edgeId, reason);
    this.afterGraphMutation();
  }

  /**
   * B-106 (ruling 4): lift the chat-scoped block (C2). setBlocked(edgeId,
   * undefined) deletes the overlay entry only — a library-level authored
   * block survives (the facade contract), and the rebuild re-merges the
   * union, so an authored-blocked arc stays dashed. Same re-route path.
   */
  liftBlock(edgeId: string): void {
    this.facade?.setBlocked(edgeId, undefined);
    this.afterGraphMutation();
  }

  /** B-106 (ruling 4): the shared post-mutation sequence — bump, re-project, re-snapshot. */
  private afterGraphMutation(): void {
    this.graphRevision.update((n) => n + 1);
    this.rebuildElements();
    this.refreshSnapshot();
  }

  /**
   * B-106 (ruling 3): the arc panel's data — authored endpoint labels via
   * labelOf, allowed modes in authored key order, and the merged blocked
   * state (D20: authored OR overlay — a presence check over the two live
   * sources, never math). The displayed reason is the overlay's when both
   * exist ("adds or restates only", the facade contract). Unknown id ⇒ null
   * (degrade, never throw — C32 spirit; the panel hides).
   */
  arcInfo(edgeId: string): ArcInfo | null {
    const map = this.map();
    const edge: MapEdgeData | undefined =
      map?.edges.find((candidate) => candidate.id === edgeId) ??
      this.overlay?.userEdges.find((candidate) => candidate.id === edgeId);
    if (edge === undefined) return null;
    const overlayReason = this.overlay?.blocked[edgeId]; // undefined when absent
    const authoredReason = edge.blocked?.reason; // undefined when absent
    return {
      sourceLabel: this.labelOf(edge.source),
      targetLabel: this.labelOf(edge.target),
      modes: (Object.keys(edge.modes) as TravelMode[]).filter(
        (mode) => edge.modes[mode]?.allowed === true,
      ),
      blockedReason: overlayReason ?? authoredReason ?? null,
      authored: authoredReason !== undefined,
      overlay: overlayReason !== undefined,
    };
  }

  /**
   * B-105 (ruling 4): an authored label lookup for RouteLeg endpoints (which
   * carry node ids) — the loaded map's nodes plus the overlay's user nodes
   * (the C24 live references; a lookup, never a copy — R4). An unknown id
   * degrades to the id itself, never a throw (C32 spirit). Not a computation:
   * authored strings only (R1-safe).
   */
  labelOf(id: string): string {
    const authored = this.map()?.nodes.find((node) => node.id === id)?.label;
    if (authored !== undefined) return authored;
    return this.overlay?.userNodes.find((node) => node.id === id)?.label ?? id;
  }

  /**
   * Charter lifecycle: the host's ResizeObserver funnels container resizes
   * here. B-106: a resized stage also RE-FITS the view — the stage's fixed
   * chrome (header top, layer switcher bottom-left) overlays the canvas, so
   * content fitted for a taller stage can otherwise end up underneath that
   * chrome once a panel opens at phone width, untappable (found live by the
   * arc-panel phone e2e: the castle node landed under a layer button). The
   * refit keeps the whole layer visible AND tappable at any stage size; it
   * writes no signals (D2 — outside Angular, like mount()'s fit).
   */
  notifyResize(): void {
    if (!this.mounted) return;
    this.cy.resize();
    this.fitView();
  }

  // --- Dev-harness-only e2e seam (exposed via window.__TME_E2E__ in App —
  // never in the ST entry). Read-only projections of the cy model; there is
  // no mutation path, so R2/R4 hold. Not facade surface.

  /**
   * Labels of the MAP nodes currently projected for the active layer. B-107
   * (ruling 3): `tme-badge` pseudo-nodes are EXCLUDED — this seam reports map
   * content (the pinned p2m1 per-layer node sets stay exactly FX1); badge
   * text has its own read, testBadgeText below.
   */
  testNodeLabels(): string[] {
    return this.cy
      .nodes()
      .filter((node) => !node.hasClass('tme-badge'))
      .map((node) => String(node.data('label') ?? ''));
  }

  /**
   * B-107 (ruling 3): one badge's text (`destination · modes`, then
   * ` · blocked: <reason>` when the arc's merged blocked state is set, else
   * ` · <total> <unit>` when its route routed — B-108 finding 1.2) by ARC id,
   * or null when no badge for that arc is projected (other layer / unknown
   * arc). A read-only seam — no mutation path (R2/R4 hold).
   */
  testBadgeText(arcId: string): string | null {
    const badge = this.cy.getElementById(`tme-badge-${arcId}`);
    return badge.length === 0 ? null : String(badge.data('label') ?? '');
  }

  /** Resolved line-style of one edge ('solid' | 'dashed' | ...), or null. */
  testEdgeLineStyle(id: string): string | null {
    const edge = this.cy.getElementById(id);
    return edge.length === 0 ? null : String(edge.style('line-style'));
  }

  /** B-103: rendered (canvas-relative, screen-px) position of one node, or null
   * when unmounted or absent — `node.renderedPosition()` (typed on
   * NodeSingular), a pure read used by e2e to aim taps/drag at real pixels.
   */
  testNodeRenderedPosition(id: string): { x: number; y: number } | null {
    if (!this.mounted) return null;
    const node = this.cy.getElementById(id);
    if (node.length === 0) return null;
    const pos = node.renderedPosition();
    return { x: pos.x, y: pos.y };
  }

  /**
   * B-104: rendered bounding box (screen px; x/y at the top-left corner,
   * derived from the declared x1/y1 + w/h shape) of one node — compound
   * parents included — or null when unmounted or absent. Pure read; proves
   * districts CONTAIN their children (F07/§6.2 Layers: the box never moves
   * coordinates).
   */
  testNodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null {
    if (!this.mounted) return null;
    const node = this.cy.getElementById(id);
    if (node.length === 0) return null;
    const box = node.renderedBoundingBox(); // BoundingBox12 & BoundingBoxWH: x1/y1/w/h
    return { x: box.x1, y: box.y1, w: box.w, h: box.h };
  }

  /** B-103: current zoom level (`cy.zoom()`) — pure read. */
  testZoom(): number {
    return this.cy.zoom();
  }

  /** B-103: current pan offset (`cy.pan()`) — pure read. */
  testPan(): { x: number; y: number } {
    const pan = this.cy.pan();
    return { x: pan.x, y: pan.y };
  }

  // --- Projection -----------------------------------------------------------

  /** Swap the projected elements to the active layer, atomically. */
  private rebuildElements(): void {
    const layerId = this.activeLayer();
    const map = this.map();
    if (layerId === null || map === null) return;
    // The pure projection (layer-elements.ts) — pinned bare-Node by
    // tests/verify/p2m1-layer-elements.spec.ts; overlay waypoints included
    // (F10 display-only, M1 verifier finding 2).
    const elements = buildLayerElements(map, this.overlay, layerId);
    // B-107 (C3): this layer's cross-layer arcs render as endpoint badges —
    // pseudo-NODES from the pure builder, priced by the core via badgeRoutes.
    // The arc itself still never joins the projection as an edge (the pinned
    // p2m1 seam holds; buildLayerElements filters cross-layer arcs) — the
    // badge IS the arc's whole canvas surface: its tap opens the arc panel
    // (B-108 finding 1), its text carries block state and cost (finding 1.2).
    const badges = buildCrossLayerBadges(map, this.overlay, layerId, this.badgeRoutes(map, layerId));
    this.cy.batch(() => {
      this.cy.elements().remove();
      this.cy.add([...elements, ...badges]);
    });
    // The swap drops ALL classes — re-project the selection accents so the
    // signals stay the single truth (R3; B-106: block/lift rebuilds included).
    this.applySelectionClasses();
    if (this.mounted) this.fitView();
  }

  /**
   * B-107 (ruling 2): the core-sourced cost queries for this layer's badges —
   * one `facade.findRoute(onLayerEndpoint → otherEndpoint)` per cross-layer
   * anchor, DEFAULT mode (D60(a) preference semantics: the chat's travel mode
   * with per-arc fallback). R1: the service only CARRIES the results to the
   * pure builder; every number/unit is the core's. Called inside
   * rebuildElements — and rebuildElements is called by afterGraphMutation
   * (block/lift) AND by setTravelModePreference (B-108 finding 2), so badges
   * re-price on both: a block/lift re-renders the blocked branch or restores
   * the cost (the builder reads the merged state itself), a mode switch
   * re-runs the query under the new preference. The arc panel opened from a
   * badge (B-108 finding 1) is the surface that performs the lift. Anchors'
   * endpoints are resolved nodes by construction (crossLayerAnchors skips
   * degenerate arcs), so findRoute's C30 unknown-id throw is unreachable
   * here.
   */
  private badgeRoutes(map: WorldMapData, layerId: string): ReadonlyMap<string, RouteResult | null> {
    const routes = new Map<string, RouteResult | null>();
    if (this.facade === null) return routes; // no core yet — badges render without cost
    for (const anchor of crossLayerAnchors(map, this.overlay, layerId)) {
      routes.set(anchor.arcId, this.facade.findRoute(anchor.onLayer, anchor.other));
    }
    return routes;
  }

  /**
   * The selection-accent projection (R3): tme-selected on the selected node,
   * tme-edge-selected on the selected edge. Called from the constructor's
   * effect (signal-driven) and after every rebuildElements (element swap) —
   * one function, so the two paths can never diverge.
   */
  private applySelectionClasses(): void {
    const sel = this.selection();
    const edgeSel = this.edgeSelection();
    this.cy.batch(() => {
      this.cy.nodes().removeClass('tme-selected');
      if (sel !== null) this.cy.getElementById(sel.id).addClass('tme-selected');
      this.cy.edges().removeClass('tme-edge-selected');
      if (edgeSel !== null) this.cy.getElementById(edgeSel.id).addClass('tme-edge-selected');
    });
  }

  private refreshSnapshot(): void {
    this.snapshot.set(this.facade === null ? null : this.facade.getSnapshot());
  }

  private fitView(): void {
    if (this.cy.elements().length > 0) this.cy.fit(undefined, FIT_PADDING);
  }
}
