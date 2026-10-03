// src/app/graph/graph.service.ts — PKG B-102, extended by B-103 (selection +
// drag). The ONE cytoscape instance (D3): created headless in the constructor,
// `mount()`/`unmount()` on demand — computation works with the UI closed.
// Zoneless (D2): the service writes signals; the ONLY canvas events bound are
// discrete gestures (`tap` → selection signal, `free` → debug log) —
// high-frequency events (tapstart/tapdrag/tapend) are never registered, so
// dragging costs zero change detection.
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
import type { Core, NodeSingular, StylesheetStyle } from 'cytoscape';
import { Injectable, OnDestroy, computed, effect, signal } from '@angular/core';
import type { ChatMapOverlay, MapSnapshot, WorldMapData } from '../../core/api';
import type { MapFacade } from '../../core/facade';
import { buildLayerElements } from './layer-elements';

/** Switcher label: the id the facade validates + the C23 human name. */
export interface LayerLabel {
  readonly id: string;
  readonly name: string;
}

/**
 * D7: the cytoscape stylesheet as plain data. Selectors key off element
 * classes assigned by buildElements(): `tme-<kind>` per node kind (F07
 * districts are compound parents), `tme-pin` for the overlay's pinned node,
 * `tme-selected` for the tapped node (B-103, driven by the selectedNode
 * signal), `tme-blocked` for arcs excluded from routing but still DRAWN (C2 —
 * dashed, never hidden), `tme-crosslayer` (informational; such arcs are not
 * drawn in M1, C3). Node bodies are 44px so the rendered tap target satisfies
 * F52.
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
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'line-color': '#8fa0b5',
      width: 2,
    },
  },
  {
    // C2: blocked arcs are excluded from routing but remain DRAWN — dashed
    // and distinct, never hidden.
    selector: 'edge.tme-blocked',
    style: {
      'line-style': 'dashed',
      'line-color': '#c9564e',
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
   * B-103: the label of the tapped node, or null. Labels are authored strings
   * projected from core/display data (R1-safe: nothing is computed here), and
   * the selection chip renders one verbatim (C23). Cleared by a background tap
   * or the chip's dismiss control — every writer goes through this signal.
   */
  readonly selectedNode = signal<string | null>(null);

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
      this.selectedNode.set(String(node.data('label') ?? ''));
    });
    this.cy.on('tap', (event) => {
      // Element taps bubble to the core, so only a cy-targeted tap is a
      // background tap: clear the selection (D2, same discrete path).
      if (event.target === this.cy) this.selectedNode.set(null);
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

    // R3: the tme-selected accent follows the SIGNAL — the class is a
    // projection of selection state, so tap-select, background-tap clear and
    // chip dismiss stay consistent without duplicating class bookkeeping.
    // The effect writes no signals, so it triggers no change detection (D2).
    effect(() => {
      const label = this.selectedNode();
      this.cy.batch(() => {
        this.cy.nodes().removeClass('tme-selected');
        if (label !== null) {
          this.cy.nodes().filter((node) => node.data('label') === label).addClass('tme-selected');
        }
      });
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

  /** Charter lifecycle: the host's ResizeObserver funnels container resizes here. */
  notifyResize(): void {
    if (this.mounted) this.cy.resize();
  }

  // --- Dev-harness-only e2e seam (exposed via window.__TME_E2E__ in App —
  // never in the ST entry). Read-only projections of the cy model; there is
  // no mutation path, so R2/R4 hold. Not facade surface.

  /** Labels of the nodes currently projected for the active layer. */
  testNodeLabels(): string[] {
    return this.cy.nodes().map((node) => String(node.data('label') ?? ''));
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
    this.cy.batch(() => {
      this.cy.elements().remove();
      this.cy.add(elements);
    });
    if (this.mounted) this.fitView();
  }

  private refreshSnapshot(): void {
    this.snapshot.set(this.facade === null ? null : this.facade.getSnapshot());
  }

  private fitView(): void {
    if (this.cy.elements().length > 0) this.cy.fit(undefined, FIT_PADDING);
  }
}
