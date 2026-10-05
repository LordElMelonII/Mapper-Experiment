// src/app/graph/graph.service.ts — PKG B-102, extended by B-103 (selection +
// drag), B-105 (route sidebar state), B-106 (edge selection + the blocked
// toggle), B-107 (cross-layer endpoint badges — C3 pseudo-nodes with
// core-sourced cost text), B-108 (gate fix: the badge IS the cross-layer
// arc's management surface — badge taps select the arc; badges re-price on
// travel-mode switches) and B-109 (tap-to-place waypoints: background and
// compound-box taps place through facade.addUserNodeAt, F10/C7/D21/§6.2) and
// B-110 (waypoint management: removeWaypoint/promoteWaypoint mirror
// facade.removeUserNode/promoteUserNode — D21/C26/D61 — plus the isUserNode
// presence getter, ruling 1) and B-111 (curve rendering: the `edge.tme-curved`
// stylesheet entry — §5 M3/api.ts:45, authored curve data mapped verbatim,
// R1/D7 — plus the testEdgeCurveStyle read-only seam) and B-112 (one
// `cy.batch` per rebuild: the selection-accent re-projection moved INSIDE
// rebuildElements' batch — §6.1 dense-row mitigation, one render pass per
// rebuild; the resize→refit chain itself is pinned by
// tests/e2e/resize-refit.e2e-spec.ts) and B-113 (label culling, §5 M4/§6.1:
// past a FIT-RELATIVE zoom threshold one `tme-cull-labels` class is applied
// blindly to all nodes — the stylesheet's later entries keep the pin and
// selected labels visible; `min-zoomed-font-size` is deliberately never
// set, per the B-107 gotcha; pinned by tests/e2e/label-culling.e2e-spec.ts)
// and B-115 (P2-M4 verifier gate fix: the B-113 BADGE exemption is dropped —
// badges cull WITH all map content. The verifier derived the mechanism off
// the installed runtime's findNearestElements touch slop: the host node's
// touch hit reach is 22·z + 8 px while the badge anchor sits ≈56.6·z px
// away, so touch swallows badge taps for z ≲ 0.28 — every culled phone view
// showed the exempt badge text (11·z ≈ 2–3 px, illegible dust) as a dead
// affordance; the cross-layer surface now returns exactly when it is both
// readable and tappable). B-116 (editor mode, §5 Phase 3 M1/D75): an
// `editorMode` signal + enter/exit; in editor mode the background/compound-box
// tap places an authored node through facade.upsertNode (id: '' — C5/D75,
// 'New place' label, kind 'location', active layer, event.position verbatim)
// identified by the projected-node-id delta and selected via the existing
// tme-selected signal path; a node `free` (dragend) persists the new position
// through upsertNode full-replace with the node's KNOWN id; grabbable is OFF
// in view mode (cy.autoungrabify — the M1 view-local drag is retired); the
// F45 save bar reads `unsavedChanges` (facade.hasUnsavedChanges recomputed on
// the editorRevision signal — no timers) and saveMap() runs the facade's
// explicit save. Editor commands mark only the facade's `dirty` flag —
// routing and the snapshot still serve the SAVED graph until saveMap
// (F45/D75), so place/move bump neither graphRevision nor the snapshot.
// B-117 (the F40 property panel, §5 Phase 3 M1): the panel's mutation paths
// join the editor block — `upsertNode` (whole-draft full-replace commit,
// C30 refusals normalized to a field-precise NodeEditRefusal the panel
// renders) and `removeNode` (direct delete, F46 delete-and-redo; the
// removeUserNode selection-clear precedent) — both F45-safe (dirty only:
// rebuild + editorRevision, never graphRevision/snapshot), plus the panel's
// live-reference reads `nodeDataById` / `containerNodesOnLayer` (R4
// lookups, never copies) and the `testNodeData` read-only e2e seam.
// B-118 (quick-connect, §5 Phase 3 M1/D42/F16): a connect mode entered from
// the property panel — the panel is open exactly when a library node is
// selected in editor mode, quick-connect's exact precondition. Leaf taps
// toggle a PICK SET (the core's `isPinEligible` over the merged node set is
// the ONE pickable rule — D58/C1/§6.2: same active layer, containers and
// parents never, the source never picks itself), highlighted by a DISTINCT
// `tme-connect-pick` class (F46 ruling: picks are not selections — no
// selection is written while connecting). Done commits ONE
// `facade.upsertEdge` per picked target (D42 defaults: all three modes
// allowed, everything else geometry-priced — C14 row 5; parallel arcs stay
// possible per C4, no dedup), a C30 refusal surfaces field-precise with the
// uncommitted picks intact; Cancel discards. Mode exit rides selection
// change / editor exit / panel close. F45/D75: the arcs mark only `dirty` —
// they RENDER (the projection reads the live map) but routing serves the
// SAVED graph until saveMap.
// B-119 (Q29 panel regime, §8 item 3's settled reading): the property
// panel's standing-panel state — `panelFloating`/`panelPosition` (FRONTEND
// viewer state, in-memory only: the facade carries no command for it and
// must not gain one this milestone — §9 puts preferences with the host in
// Phase 4) with the maximized-default reset on editor entry. All clamp /
// drag DOM math lives in the panel component (the consumer); the service
// holds the two signals and nothing else.
// B-120 (R21 rulings 1 + D76): viewport stability + editor-only placement.
// (1) fitView belongs to mount(), notifyResize() and selectLayer() ONLY —
// rebuildElements NEVER fits, so an edit (place/move/property-commit), a
// block/lift, a mode switch or a map load leaves zoom and pan untouched
// (the cull machinery follows: cullZoom is recomputed only by real fits, and
// a rebuild re-applies the cull class from `labelCulled` — an edit while
// culled stays culled, B-113 ruling 4's stated intent now exactly true).
// (2) D76: view mode is purely navigational — tap selects, drag pans, pinch
// zooms, NOTHING is ever placed (a background tap clears both selections
// only; a compound-box tap is a deliberate no-op). Placement of every kind
// (authored nodes via placeNodeAt, chat waypoints via placeWaypointAt) is
// editor-mode-only and gated by the visible `editorTool` ('node' default /
// 'waypoint'; draw-arc joins the same control in B-122) — one gesture per
// mode, no invisible affordance (D53).
// B-121 (R21 ruling D77): the unsaved-element DRAFT visual — a viewer-side
// edit log (a plain Set of element ids, deliberately NOT a facade surface:
// hasUnsavedChanges stays the only unsaved-state seam) fed by every editor
// command this service issues, projected as ONE `tme-draft` class inside
// rebuildElements' batch (nodes, edges, AND cross-layer badges — a badge IS
// its arc's whole canvas surface, B-107) and styled light in the D7
// stylesheet data. saveMap success / loadMap reset the log; a C30 save
// refusal leaves it intact. Unsaved ≠ invisible: the edits RENDER (the
// projection reads the live map) but are visibly-not-yet-saved until
// saveMap (F45/D75).
// The ONE cytoscape instance (D3): created headless
// in the constructor, `mount()`/`unmount()` on demand — computation works with
// the UI closed. Zoneless (D2): the service writes signals; the ONLY canvas
// events bound are discrete gestures (`tap` → selection signals, `free` →
// debug log) plus B-113's `zoom` (high-frequency, writes NO signals — it only
// toggles the cull class on threshold crossings); the tapstart/tapdrag/tapend
// stream is never registered, so dragging costs zero change detection.
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
  MapNodeData,
  MapSnapshot,
  NodeKind,
  RouteResult,
  TravelMode,
  WorldMapData,
} from '../../core/api';
import type { MapFacade } from '../../core/facade';
import { MapValidationError, isPinEligible } from '../../core/model/validate';
import { buildCrossLayerBadges, buildLayerElements, crossLayerAnchors } from './layer-elements';

/** Switcher label: the id the facade validates + the C23 human name. */
export interface LayerLabel {
  readonly id: string;
  readonly name: string;
}

/**
 * B-120 (D76): the editor's placement tools — which kind an editor-mode
 * background/compound-box tap places. Extensible for B-122's draw-arc (a
 * third member joins; the tap handlers switch over it then).
 */
export type EditorTool = 'node' | 'waypoint';

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
 * B-121 (D77): the ONE light draft hue — the same pale paper tone across
 * both element kinds (a node's outline, an arc's line, a badge's text): the
 * "pencil sketch" reading of visibly-not-yet-saved. Plain data (D7).
 */
const DRAFT_ACCENT = '#f4f1e8';

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
    // B-121 (D77): a node with unsaved edits renders the light draft
    // outline. Declared BEFORE `tme-pin` / `tme-selected` /
    // `tme-connect-pick` because cytoscape has no CSS specificity —
    // matching rules apply in declaration order and the LAST match per
    // property wins (the B-111 precedent) — so those accents still
    // override the draft's border while the element carries both classes.
    // No `min-zoomed-font-size` (the B-107 hide-floor gotcha) and no
    // text-opacity: the draft never fights the B-113 cull entries.
    selector: 'node.tme-draft',
    style: {
      'border-color': DRAFT_ACCENT,
      'border-width': 2,
    },
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
    // B-118 (D42/F16, F46 boundary ruling): the quick-connect PICK SET's
    // DISTINCT visual — a dashed teal accent, deliberately NOT `tme-selected`:
    // connect targets are picked as arc endpoints, never selected for editing,
    // and the pick class must never be confusable with the selection accent.
    // Projected by the same signal-driven effect as tme-selected (R3) and
    // re-projected inside every rebuild batch (B-112).
    selector: 'node.tme-connect-pick',
    style: {
      'border-width': 3,
      'border-color': '#4db6ac',
      'border-style': 'dashed',
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
    // B-121 (D77): a cross-layer arc with unsaved edits drafts its BADGE —
    // the badge IS the arc's whole canvas surface (B-107), and its visible
    // paint is the label TEXT, so the draft treatment here is the same
    // light hue on `color`. Declared AFTER `node.tme-badge` (its subdued
    // base text color must be overridable by the draft) and before the
    // cull entries, which it never touches (no text-opacity — the badge
    // culls with all map content, B-115).
    selector: 'node.tme-badge.tme-draft',
    style: { color: DRAFT_ACCENT },
  },
  {
    // B-113 (§5 M4 label culling, §6.1 dense row): the culled state is ONE
    // class applied blindly to ALL nodes (ruling 2) — the stylesheet owns
    // the policy, the code owns no per-element branching (R1/D7 spirit).
    // `text-opacity` hides the label text while the node body (44px, F52)
    // stays tappable. (B-115 finding 2 corrects this comment's original
    // mechanism claim — "a culled label is not a hit target": labels are
    // never hit targets AT ALL, `text-events` defaulting to 'no' so the
    // installed runtime's checkLabel skips rendered text at any zoom; the
    // cull changes only what is PAINTED, never what a tap reaches. The
    // behavior stands: a culled node remains tappable by its 44px body.)
    // Declared BEFORE the two exemption entries below because
    // cytoscape has no CSS specificity cascade: matching rules apply in
    // declaration order and the LAST match per property wins (verified
    // against the installed 3.34.3 runtime — the stylesheet's contextStyles
    // loop, cytoscape.esm.mjs:16097-16112; the tme-blocked → tme-edge-selected
    // pair below already relies on that order).
    // NOTE: `min-zoomed-font-size` is deliberately NOT used anywhere in this
    // stylesheet (B-107 gotcha, binding): it is a hide-floor, not an
    // upscale-floor, and would suppress labels renderer-internally with no
    // runtime-assertable seam.
    selector: 'node.tme-cull-labels',
    style: { 'text-opacity': 0 },
  },
  {
    // B-113 (ruling 3), AMENDED by B-115 (P2-M4 verifier gate, major
    // finding): the PIN's label never culls (F09 wayfinding — the party's
    // position stays readable at any zoom). The exemption survives the
    // B-115 gate because the pin is an ORDINARY node: its label is dust at
    // culled zooms too, but that is no false affordance — nothing promises
    // a tap target there, and the pin's wayfinding identity shows the
    // moment it is legible. (The BADGE exemption B-113 ruled here is GONE,
    // per B-115: a culled badge's tap anchor sits inside its host node's
    // touch reach — host reach 22·z + 8 px vs anchor ≈56.6·z px away, so
    // touch swallows the tap for z ≲ 0.28 — while its 11·z ≈ 2–3 px text is
    // illegible: the visible-but-dead affordance the cull exists to
    // remove. Badges cull with all map content and return exactly when
    // readable AND tappable.) Later entry overrides the culled text-opacity
    // for pins only.
    selector: 'node.tme-pin.tme-cull-labels',
    style: { 'text-opacity': 1 },
  },
  {
    // B-113 (ruling 3): the SELECTED node's label never culls (the node
    // under inspection). The exemption is cascade data, not class removal:
    // a selected node in a culled view carries BOTH tme-cull-labels and
    // tme-selected. District labels cull with everything else — and since
    // B-115, badge labels do too.
    selector: 'node.tme-selected.tme-cull-labels',
    style: { 'text-opacity': 1 },
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
    // B-121 (D77): an arc with unsaved edits renders the light draft line
    // — the same DRAFT_ACCENT hue as the node outline, one visual language
    // across both kinds. Declared BEFORE `tme-blocked` /
    // `tme-edge-selected` so those accents still override line-color on a
    // drafted blocked or selected arc (the B-111 declaration-order
    // precedent; the cascade has no CSS specificity). Width is untouched —
    // the draft changes hue only.
    selector: 'edge.tme-draft',
    style: { 'line-color': DRAFT_ACCENT },
  },
  {
    // B-111 (§5 M3, api.ts:45): edges carrying authored `curve` data render
    // as unbundled-bezier with their control-point distances — authored
    // LAYOUT data mapped verbatim off the projection (R1/D7: plain data, the
    // stylesheet computes nothing). Declared BEFORE tme-blocked /
    // tme-edge-selected so those accents can still override line-color (and
    // the blocked line-style) on a curved blocked or selected edge — C2 is
    // orthogonal to curve-style, no special case. `control-point-weights`
    // rides along as data because the installed runtime REQUIRES it:
    // findBezierPoints (cytoscape.esm.mjs) sizes the curve at
    // Math.min(distances.length, weights.length) and the default weight is
    // the scalar 0.5, which would truncate a multi-point curve to one
    // control point — buildLayerElements emits the constant-weight array
    // (CURVE_CONTROL_POINT_WEIGHT, the runtime's own default value).
    selector: 'edge.tme-curved',
    style: {
      'curve-style': 'unbundled-bezier',
      'control-point-distances': 'data(curveDistances)',
      'control-point-weights': 'data(curveWeights)',
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
 * B-117 (api.ts `parent` contract, §5 Phase 3 M1): the CONTAINER kinds —
 * every kind that may hold compound children. The property panel's parent
 * picker offers exactly these (same layer), and never 'waypoint' (D21: the
 * runtime overlay origin is neither an editor kind nor a parent — F40's
 * six authored kinds are world/region/city/district/location/hub).
 */
const CONTAINER_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>([
  'world',
  'region',
  'city',
  'district',
]);

/**
 * B-117: one field-precise C30 refusal issue, the app's copy of the core's
 * ValidationIssue (path + message rendered verbatim by the property panel —
 * user-visibly, never console-only).
 */
export interface NodeEditIssue {
  readonly path: string;
  readonly message: string;
}

/** B-117: a refused editor command — the collected field-precise report (C30). */
export interface NodeEditRefusal {
  readonly issues: readonly NodeEditIssue[];
}

/**
 * B-118 (D42 contract, verbatim): the modes of every quick-connect arc —
 * ALL modes allowed, no authored distance/time, no terrain, not blocked.
 * Geometry prices the arc via C14 row 5 (F19 geometry-first); the author
 * refines in M2's arc editing (F41 — this packet creates ONLY default arcs).
 */
const CONNECT_EDGE_MODES: MapEdgeData['modes'] = {
  walk: { allowed: true },
  car: { allowed: true },
  train: { allowed: true },
};

/**
 * B-118 (C23 plain words): the connect banner's tap feedback. One generic
 * line for every unpickable tap — a container, a node with children, a
 * foreign-layer node (data guard; the projection only shows the active
 * layer), or a cross-layer badge — and one for the source itself.
 */
const CONNECT_BAD_TARGET = 'Only a location, hub or waypoint on this layer can be picked.';
const CONNECT_SELF_TARGET = "The starting place can't connect to itself.";

/**
 * B-117: normalize any facade throw into the panel's refusal shape (C30
 * field-precise issues for a MapValidationError; the message alone for any
 * other refusal — degrade, never throw, on this UI path, C32 spirit).
 */
function nodeEditRefusal(error: unknown): NodeEditRefusal {
  if (error instanceof MapValidationError) {
    return { issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) };
  }
  return {
    issues: [{ path: '', message: error instanceof Error ? error.message : String(error) }],
  };
}

/**
 * B-113 (§5 M4 label culling, §6.1 dense sub-graph perf row): labels hide
 * when the current zoom falls below the CURRENT fit zoom × this factor.
 * The threshold is fit-RELATIVE, not absolute, because one absolute floor
 * cannot serve both worlds (D53): FX1's Fuyuki-layer authored coordinates
 * span ≈1050×430 model units (data/worlds/fuyuki.ts:37-49), which fits at
 * ≈0.84 zoom on the desktop stage but ≈0.30 on the iPhone-13 portrait
 * stage — a floor that spares the phone's default view would never fire on
 * desktop, and one that fires usefully on desktop would blank the phone's
 * default view. 0.6 keeps the default fit itself label-visible by
 * construction (zoom === fitZoom is never below fitZoom × 0.6), so labels
 * are ON at every default view and only deliberate zoom-OUT culls them.
 */
const LABEL_CULL_FACTOR = 0.6;

/**
 * B-113 (ruling 1): the cull threshold while there is nothing to fit — the
 * never-cull default. Cytoscape zoom is strictly positive (the runtime's
 * min-zoom floor), so `zoom() < NEVER_CULL_ZOOM` can never fire and nothing
 * culls on an empty canvas.
 */
const NEVER_CULL_ZOOM = 0;

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

  /**
   * B-113 (ruling 1): the label-cull threshold — the fit zoom ×
   * LABEL_CULL_FACTOR, recomputed by fitView() after EVERY fit (each re-fit
   * re-bases the threshold on its own fit zoom); NEVER_CULL_ZOOM while there
   * is nothing to fit. A plain field, deliberately NOT a signal (D2: the
   * high-frequency `zoom` event reads it and must never touch Angular state).
   */
  private cullZoom = NEVER_CULL_ZOOM;

  /**
   * B-116 (C5/D75): the node ids of the LAST projection — rebuilt by
   * rebuildElements from the very element definitions it installs. The
   * place-command's id discovery reads the delta between this set and the
   * post-command projection: the single command can only have created one
   * node, so the delta IS the created node (the UI never invents ids — C5).
   * A plain field: read only by discrete tap handlers (D2).
   */
  private projectedNodeIds = new Set<string>();

  /**
   * B-121 (D77): the projected EDGE ids of the last projection — rebuilt by
   * rebuildElements beside projectedNodeIds. doneConnect's arc-id discovery
   * reads the delta between this set and the post-command projection: every
   * committed quick-connect arc is engine-assigned (`arc-<n>`, C5/D75), and
   * the single Done loop only ever ADDS edges, so the delta IS the committed
   * arc set. A plain field, same discipline as projectedNodeIds (D2).
   */
  private projectedEdgeIds = new Set<string>();

  /**
   * B-121 (D77): the viewer-side EDIT LOG — the ids of the elements the
   * editor commands this service issued have touched and not yet saved
   * (created node ids, moved node ids, committed draft ids, committed arc
   * ids). Deliberately NOT a facade surface: hasUnsavedChanges (D75) stays
   * the ONLY unsaved-state seam — this log is purely the draft VISUAL's
   * feed. Cleared whole by saveMap() success and loadMap(); a C30 save
   * refusal leaves it intact (the map is still dirty). A removed id LEAVES
   * the log (removeNode forgets it; its cascaded edges vanish from the
   * projection, so a stale edge id in the log matches nothing). Overlay
   * waypoints and their kNN edges are chat state (D21 — never dirty, never
   * editor commands) and never enter it. A plain Set, not a signal: it is
   * written only at discrete command sites, each of which immediately
   * re-projects the classes (D2).
   */
  private readonly unsavedIds = new Set<string>();

  /**
   * B-116 (§5 Phase 3 M1/D75): editor mode — the authoring state. In editor
   * mode the empty-canvas tap places an authored node (facade.upsertNode) and
   * leaves become grabbable so dragging persists positions; in view mode
   * nodes are not draggable (grabbable off — the M1 view-local drag is
   * retired; the map's coordinates are the author's business, D10/C4).
   */
  readonly editorMode = signal(false);

  /**
   * B-120 (D76): the active editor tool — WHAT an editor-mode background or
   * compound-box tap places. 'node' (default): an AUTHORED node through
   * placeNodeAt — the B-116 behavior byte-identical (the default keeps
   * editor-place-move.e2e-spec.ts green unmodified). 'waypoint': a chat
   * waypoint through placeWaypointAt — the B-109 semantics (kNN and all),
   * now editor+tool-gated. FRONTEND viewer state, in-memory only, the
   * B-119 panelFloating class (the facade carries no command for it): reset
   * to 'node' on every enterEditor; exitEditor KEEPS the choice (the reset
   * happens at the next entry). Draw-arc joins this control in B-122 — the
   * type grows a third member then, nothing here changes.
   */
  readonly editorTool = signal<EditorTool>('node');

  /**
   * B-118 (D42/F16): quick-connect mode — on while the author picks arc
   * targets for the node selected when the mode was entered. Entered ONLY
   * from the property panel (the panel is open exactly when connect mode is
   * legal: editor mode + a library-node selection); exited by Done (commit),
   * Cancel/Escape (discard), or any state change that would orphan the mode —
   * editor exit, a selection change/dismissal, a map reload — via the
   * constructor's guard effect below.
   */
  readonly connectMode = signal(false);

  /**
   * B-118: the connect source — the node id the mode was entered with (the
   * selection at entry; the D42 `source` of every created arc). Frozen at
   * entry: while connecting, taps never write the selection (F46 boundary),
   * so a mismatch between this and the live selection can only mean the mode
   * was orphaned — the guard effect exits.
   */
  readonly connectSourceId = signal<string | null>(null);

  /**
   * B-118: the pick set — target node ids in pick order (Set iteration is
   * insertion order). One tap = one toggle (the packet's toggle-on/off rule;
   * Set membership IS the double-pick prevention). Never written by taps on
   * unpickable nodes — those surface `connectFeedback` instead.
   */
  readonly connectPicks = signal<ReadonlySet<string>>(new Set());

  /**
   * B-118 (C23): why the last tap picked nothing — a container, a node with
   * children, a foreign-layer node or a badge (generic line) or the source
   * itself. Cleared by a successful toggle, Done and every mode exit.
   */
  readonly connectFeedback = signal<string | null>(null);

  /**
   * B-118: a C30 refusal of the Done commit loop (e.g. an edge the validator
   * refuses), normalized through the B-117 NodeEditRefusal pattern — rendered
   * field-precise by the banner, with the UNCOMMITTED picks intact so the
   * author can drop the offending target and retry. null after any clean
   * commit/cancel.
   */
  readonly connectRefusal = signal<NodeEditRefusal | null>(null);

  // --- Panel regime (PKG B-119, Q29 / §8 item 3 — the property panel) ------

  /**
   * B-119: whether the F40 property panel FLOATS over the stage (Q29's
   * standing-panel regime) instead of sitting maximized in its docked
   * region. FRONTEND viewer state, in-memory only — the facade carries no
   * command for it and must not gain one this milestone (§9: the host owns
   * preferences, Phase 4's persistence; never map data, so no facade/R2/R4
   * surface). The panel component is the consumer: it writes this signal on
   * its Maximize/Restore toggle (R3, the selection.set precedent), and
   * enterEditor resets it — the editor maximizes by default (§8 item 3).
   */
  readonly panelFloating = signal(false);

  /**
   * B-119: the floating panel's remembered position — VIEWPORT px, rendered
   * by the panel as `translate(x, y)` on its `position: fixed` host.
   * Written ONCE per drag end by the panel component (never during the drag
   * — D2: pointermove applies the live position as a direct style transform
   * with zero signal writes) and clamped by the component to the stage
   * bounds below/left of the top-right chrome stack (F52/D53: the chrome
   * stays reachable in every state). Remembered across panel close/reopen
   * AND editor toggles; only `panelFloating` resets on editor entry.
   */
  readonly panelPosition = signal<{ x: number; y: number } | null>(null);

  /**
   * B-116 (F45/D75): bumped by every editor command (place, move), by
   * saveMap, and by loadMap — the ONLY recompute triggers of `unsavedChanges`
   * (no timers, D2: the facade's dirty flag is core state, not a signal, so
   * the computed polls it on this revision counter, the graphRevision
   * precedent).
   */
  private readonly editorRevision = signal(0);

  /**
   * B-116 (F45/D75): the unsaved-changes indicator's state — the core's
   * hasUnsavedChanges() answer (nothing outside the core tracks dirtiness,
   * D75/R1), recomputed only on the editorRevision signal. Until saveMap()
   * runs, routing and the snapshot still serve the SAVED graph — that is the
   * product behavior (F45), not staleness to be hidden.
   */
  readonly unsavedChanges = computed<boolean>(() => {
    void this.editorRevision(); // dependency: place/move/save/load re-read (F45)
    return this.facade?.hasUnsavedChanges() ?? false;
  });

  /**
   * B-116: the user-visible save refusal — the facade's C30 final-gate error
   * message (an invalid live map refuses saveMap, dirty stays true, the map
   * is untouched). Rendered by the save bar; cleared on the next successful
   * save. null when nothing failed.
   */
  readonly saveError = signal<string | null>(null);

  /**
   * B-113 (ruling 2): which side of the threshold the view is currently on —
   * the crossing gate that keeps the high-frequency `zoom` handler from
   * batching class operations when nothing flips. Same plain-field discipline
   * as cullZoom (D2); rebuildElements' batch re-projects from it (ruling 4).
   */
  private labelCulled = false;

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
   * B-116 (F45/D75): a selection the SAVED graph does not know yet (an
   * unsaved editor node) is no route until saveMap makes it live — the query
   * refuses (C30) and the computed degrades to null, never a crash (C32
   * spirit).
   */
  readonly route = computed<RouteResult | null>(() => {
    void this.travelMode(); // dependency: a preference switch re-prices the default run
    void this.graphRevision(); // dependency: a block/lift re-routes (C2 live, B-106)
    const sel = this.selection();
    const pinId = this.overlay?.currentLocationId ?? null;
    if (sel === null || this.facade === null || pinId === null || pinId === sel.id) {
      return null;
    }
    // B-116 gate fix (C32 spirit, F45/D75): the query can REFUSE — since D75
    // the UI can legitimately hold a selection the CORE does not know yet
    // (an unsaved editor node: upsertNode marks only `dirty`, the effective
    // graph is rebuilt on SAVE, so routing serves the SAVED map until then —
    // the product behavior, F45). findRoute answers that refusal by throwing
    // its C30 unknown-id error; the sidebar degrades to its no-route state
    // (the panel's @else branch) instead of crashing out of the computed.
    // The refusal ends at saveMap: the graphRevision bump there re-runs this
    // against the now-live graph.
    try {
      return this.facade.findRoute(pinId, sel.id);
    } catch {
      return null;
    }
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
    // B-116: view mode (the default) has nodes NOT grabbable — dragging is an
    // editor-mode affordance (the M1 view-local drag is retired; §5 M1 puts
    // move under the editor, D10/C4). `autoungrabify` is CORE state (persists
    // across rebuilds; false restores the per-element `grabbable` field, so
    // compound parents and badges stay pinned even in editor mode). Verified
    // against @types/cytoscape 3.21.9 index.d.ts:995-1003.
    this.cy.autoungrabify(true);

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
      // B-118: connect mode owns every node tap — a pickable leaf toggles the
      // pick set; a container, a parent, a badge or the source itself is
      // ignored with banner feedback (C1/§6.2: never an arc into a compound
      // parent — the validator would refuse it). NO selection is written
      // while connecting (F46 ruling: picks are arc endpoints, not
      // selections), so the badge/isParent/selection branches below are
      // unreachable until the mode exits.
      if (this.connectMode()) {
        this.handleConnectTap(node);
        return;
      }
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
      // B-109 (ruling 2, §6.2 Waypoints): a tap on a compound parent's BOX (off
      // its children — the selector matched the parent) routes through
      // `node.isParent()` (@types/cytoscape 3.21.9 index.d.ts:3624 — the
      // runtime's own compound check, not a kind-string heuristic) to the
      // PLACEMENT path — the event's model position is used verbatim (no
      // coordinate math, R1). B-120 (D76): placement of every kind is
      // EDITOR-ONLY and tool-gated — editor + Node tool places an AUTHORED
      // node (upsertNode, the B-116 behavior), editor + Waypoint tool places
      // a chat waypoint (addUserNodeAt — TOP-LEVEL: validate.ts rejects
      // `parent` on user nodes, so the node lands in this layer unparented).
      // In VIEW mode the box tap is a deliberate NO-OP: the box is not a
      // selectable leaf, nothing happens (D76 — view mode is purely
      // navigational; nothing is ever placed).
      if (node.isParent()) {
        if (this.editorMode()) {
          if (this.editorTool() === 'waypoint') this.placeWaypointAt(event.position);
          else this.placeNodeAt(event.position);
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
      // B-118: while connecting an arc tap is neither a pick nor a selection —
      // it must not hand the panel from the connect banner to the arc panel.
      if (this.connectMode()) return;
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
      // background tap. B-120 (D76): the gesture is EDITOR-ONLY placement —
      // the Node tool places an AUTHORED node through upsertNode and SELECTS
      // it (the C5/D75 id-delta path — the B-116 behavior; the placement
      // handler owns the selection writes), the Waypoint tool places a chat
      // waypoint at the event's model position (InputEventObject.position —
      // the library converts rendered→model coordinates, so the app performs
      // no coordinate math, R1; stray placements are recoverable — waypoints
      // are removable, B-110). In VIEW mode the same gesture clears BOTH
      // selections ONLY (the M2 panel-dismiss ergonomics survive — one
      // gesture, two effects, no hidden modes) and places NOTHING: view mode
      // is purely navigational (D76).
      if (event.target === this.cy) {
        // B-118: while connecting a background tap neither places a node nor
        // dismisses the selection — both would orphan the mode mid-pick (the
        // placement would select a NEW node; the dismissal would close the
        // panel). The banner's Done/Cancel own the exit.
        if (this.connectMode()) return;
        if (this.editorMode()) {
          if (this.editorTool() === 'waypoint') this.placeWaypointAt(event.position);
          else this.placeNodeAt(event.position);
          return;
        }
        this.selection.set(null);
        this.edgeSelection.set(null);
      }
    });
    this.cy.on('free', 'node', (event) => {
      // Nodes stay grabbable per their element definitions with ZERO code of
      // ours; the CORE-WIDE grabbable switch is autoungrabify, owned by the
      // editor mode (B-116: view mode sets it true — nodes not draggable —
      // and enterEditor restores the per-element field). `free` fires on drag
      // release (@types/cytoscape 3.21.9 index.d.ts:5347) and writes no
      // signal (D2: high-frequency drag events never touch Angular state —
      // this is a DISCRETE release event; the writes it triggers below are
      // signal writes through the sanctioned paths).
      //
      // B-116 (D75/F45, replacing the M1 view-local seam): dragging a node is
      // an EDITOR affordance whose release PERSISTS the new position —
      // upsertNode full-replace with the node's KNOWN id and
      // `e.target.position()` verbatim (model coordinates; R1: a position is
      // authored data being recorded, not a computed number). persistNode
      // Position guards degrade silently (C32 spirit): not in editor mode,
      // not a library node (overlay waypoints have no editor command in this
      // packet — their drag stays view-local), or a grab-release without a
      // move.
      if (!this.editorMode()) return;
      const node = event.target as NodeSingular;
      this.persistNodePosition(node.id(), node.position());
    });
    this.cy.on('zoom', () => {
      // B-113 (§5 M4 label culling, §6.1 dense row): `zoom` is a Core
      // GraphEventName in the installed @types/cytoscape 3.21.9
      // (index.d.ts:5387 — "when the viewport is zoomed"), and the runtime
      // streams it for every user zoom (pinch/scroll) AND every programmatic
      // viewport change — cy.fit emits 'pan zoom viewport'
      // (cytoscape.esm.mjs:19478). D2: this is a HIGH-FREQUENCY event, so the
      // handler writes NO signals and no change detection — applyLabelCull
      // reads two scalars and, only on a threshold crossing, toggles one
      // class inside cy.batch (one render pass).
      this.applyLabelCull();
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

    // B-118: connect mode's exit guard (R3 — the mode is a projection of the
    // state it presumes, never independent). Every read is a discrete-write
    // signal, so the effect runs per discrete event only (D2): editor exit,
    // a selection change (chip dismiss, removeNode's clear, loadMap's reset)
    // or a map reload that would orphan the mode exits it cleanly — the
    // banner's precondition (the property panel open on the SOURCE) never
    // silently lapses. exitConnectMode writes signals this effect reads, so
    // it re-runs once more and finds the guard false — a stable single pass.
    effect(() => {
      if (!this.connectMode()) return;
      const selId = this.selection()?.id ?? null;
      if (!this.editorMode() || selId === null || selId !== this.connectSourceId()) {
        this.exitConnectMode();
      }
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
    // B-116 (D75): a fresh load carries no unsaved editor edits (the facade
    // clears its dirty flag in loadMap) — recompute the F45 bar and drop any
    // stale save refusal from the previous session.
    // B-121 (D77): the draft log resets with it — the rebuild below
    // re-projects from the empty log, so no element arrives drafted.
    this.unsavedIds.clear();
    this.editorRevision.update((n) => n + 1);
    this.saveError.set(null);
    // Validators guarantee >= 1 layer; degrade to no-layer rather than throw.
    const firstLayer = map.layers[0]?.id ?? null;
    if (firstLayer !== null) {
      facade.setActiveLayer(firstLayer); // R2: viewer state flows through the facade
    }
    this.activeLayer.set(firstLayer);
    this.rebuildElements();
    this.refreshSnapshot();
    // B-120 (R21 ruling 1): loadMap deliberately has NO fit of its own — the
    // harness loads before mount(), so mount()'s fit covers the first view.
    // NOTE: a loadMap-while-MOUNTED (the Phase 4 map switch) will need its
    // own explicit fit decision then — out of scope here.
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
   * and owns viewer state), then mirror into the signal and rebuild the
   * projection. B-120 (R21 ruling 1): the layer switch keeps its refit —
   * EXPLICITLY here, no longer riding rebuildElements' tail (which never
   * fits now): a fresh layer's default view is the fitted, label-visible
   * one (fitView also re-bases the cull threshold, B-113 ruling 1).
   */
  selectLayer(layerId: string): void {
    this.facade?.setActiveLayer(layerId);
    this.activeLayer.set(layerId);
    this.rebuildElements();
    this.fitView();
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

  /**
   * B-109 (ruling 3, F10/C7/D21): place a waypoint in the ACTIVE layer at the
   * given model position — the tap event's `position` verbatim (verified:
   * InputEventObject.position, @types/cytoscape 3.21.9 index.d.ts:5227 — the
   * library converts rendered→model, so there is no coordinate math to
   * perform here, R1). B-120 (D76): reachable ONLY from editor mode + the
   * Waypoint tool (the tap handlers' branch) — view mode places nothing. R2:
   * the ONLY mutation is the facade command addUserNodeAt — engine-assigned
   * id (C5), label 'Waypoint', kNN connect to the k=3 nearest leaves of the
   * merged set (C7/D58; zero eligible leaves ⇒ orphaned, still legal). Then
   * the shared post-mutation sequence: the graphRevision bump re-runs the
   * route computed (the selection's route re-prices LIVE, F26) and
   * rebuildElements re-projects the node + its user edges and re-prices
   * badges (B-108) — with NO fit (B-120: the viewport is untouched). Guards
   * degrade silently before loadMap (no facade / no active layer — C32
   * spirit); the facade itself remains the C30 authority on layer/position
   * validity.
   */
  placeWaypointAt(position: { x: number; y: number }): void {
    const facade = this.facade;
    const layerId = this.activeLayer();
    if (facade === null || layerId === null) return;
    facade.addUserNodeAt(layerId, position);
    this.afterGraphMutation();
  }

  /**
   * B-110 (ruling 1): presence check of one id against `overlay.userNodes` —
   * a live read of the C24 reference, never a copy (R4). Library nodes and
   * unknown ids answer false, which is what fences the route panel's Waypoint
   * section to PLACED waypoints: removal of library nodes is Phase 3 editor
   * business and the facade itself refuses it (C30).
   */
  isUserNode(id: string): boolean {
    return this.overlay?.userNodes.some((node) => node.id === id) ?? false;
  }

  /**
   * B-110 (ruling 2, D21/§6.2): remove the waypoint. R2: the ONLY mutation is
   * the facade command removeUserNode (C30 throws for library/unknown ids —
   * the section never renders for those, so the throw is structurally out of
   * reach); it takes the node, every user edge with either endpoint `id`, and
   * any overlay block on those edges, leaving other waypoints untouched
   * (§6.2). Then the shared post-mutation sequence (rerender/reroute/
   * re-badge), and — per ruling 2, in this order — the selection is CLEARED
   * when the removed node WAS the selection, so the chip and panels go with
   * it. No confirmation dialogs (ruling 3: recoverable by replacement; one
   * tap = one command, D2/F46).
   */
  removeWaypoint(id: string): void {
    this.facade?.removeUserNode(id);
    this.afterGraphMutation();
    if (this.selection()?.id === id) this.selection.set(null);
  }

  /**
   * B-110 (ruling 2, C26/D21/D61): promote the waypoint into the library
   * under the SAME id with the given label. R2: the ONLY mutation is the
   * facade command promoteUserNode (C30 throws for library/unknown ids and
   * empty labels — the UI disables Promote while the trimmed input is empty,
   * the B-106 honesty pattern; C26 atomic: on refusal nothing is touched);
   * incident user edges graduate per D61 (library-bound edges move into
   * map.edges, waypoint-bound stay overlay) with ids KEPT, so the projection
   * re-renders seamlessly. Then the shared post-mutation sequence and — per
   * ruling 2 — the selection is RE-POINTED to `{ id, label }`: same id (C26),
   * so the chip and route panel re-render under the new name with zero drift
   * (R3). No rename-after-promote exists (Phase 3 upsertNode).
   */
  promoteWaypoint(id: string, label: string): void {
    this.facade?.promoteUserNode(id, label);
    this.afterGraphMutation();
    if (this.selection()?.id === id) this.selection.set({ id, label });
  }

  // --- Editor mode (PKG B-116, §5 Phase 3 M1 — D75/F45/C5/R1/R2) --------------

  /**
   * Enter editor mode: canvas taps place (per the active tool) and leaf
   * nodes become grabbable (drag persists — see the `free` handler). The
   * toggle is the template's only write path for this state (R3).
   * B-119 (Q29/§8 item 3): editor entry also MAXIMIZES the property panel —
   * the floating flag resets so a re-entry always opens the docked region
   * form. The remembered position survives (panelPosition untouched): the
   * next Restore floats it back where the author left it.
   * B-120 (D76): entry also RESETS the tool to 'node' — every editor session
   * starts from the authored-node default (no remembered placement kind
   * fires as a surprise gesture).
   */
  enterEditor(): void {
    this.editorMode.set(true);
    this.editorTool.set('node'); // B-120: the session default (D76)
    this.panelFloating.set(false); // B-119: the editor maximizes by default
    this.cy.autoungrabify(false); // restores the per-element `grabbable` field
  }

  /**
   * Exit editor mode: nodes are no longer draggable (grabbable off — the M1
   * view-local drag is retired) and the canvas returns to purely
   * navigational taps (D76/B-120: a background tap clears the selections,
   * nothing is ever placed in view mode). Unsaved edits survive the toggle
   * (F45: they live in the core's dirty flag until saveMap, not in the
   * editor mode). The tool choice is KEPT (reset at the next entry).
   */
  exitEditor(): void {
    this.editorMode.set(false);
    this.cy.autoungrabify(true);
  }

  /**
   * B-120 (D76): the segmented tool control's write path — the template's
   * only writer (R3). Meaningful in editor mode (the control renders only
   * there); harmless anytime, and the value is never remembered across
   * sessions (enterEditor resets it).
   */
  setEditorTool(tool: EditorTool): void {
    this.editorTool.set(tool);
  }

  /**
   * B-116 (§5 M1/D75/C5): place an AUTHORED node in the active layer at the
   * given model position — the tap event's `position` verbatim (verified:
   * InputEventObject.position, @types/cytoscape 3.21.9 index.d.ts:5227 — the
   * library converts rendered→model, so there is no coordinate math to
   * perform here, R1). R2: the ONLY mutation is the facade command upsertNode
   * with `id: ''` (the engine assigns `node-<n>` over the shared counter,
   * bumped until free in the merged id set — D75/C5) and the C23 default
   * label 'New place' (plain words; rename lands with the property panel,
   * B-117). Kind 'location', active layer, origin 'authored'.
   *
   * C5/D75 id discovery: the UI never invents ids — the created node is the
   * delta between the pre-command projection's node-id set
   * (projectedNodeIds) and the post-command one; a single command can create
   * exactly one node, so the delta IS it. The node is then SELECTED through
   * the existing tme-selected signal path (R3: the accent, the chip and the
   * route target follow the signal; the mutual exclusion clears any edge
   * selection, B-106).
   *
   * F45/D75: the command marks only the facade's `dirty` flag — routing and
   * the snapshot still serve the SAVED graph, so NO graphRevision bump and NO
   * snapshot refresh here (do not force a rebuild; C8's rebuild trigger is
   * edit save). The editorRevision bump recomputes the save bar.
   */
  placeNodeAt(position: { x: number; y: number }): void {
    const facade = this.facade;
    const layerId = this.activeLayer();
    if (facade === null || layerId === null) return; // degrade before loadMap (C32 spirit)
    const beforeIds = this.projectedNodeIds;
    facade.upsertNode({
      id: '',
      label: 'New place',
      kind: 'location',
      layer: layerId,
      // The event's model position, values verbatim (no coordinate math, R1)
      // — copied so the stored node never aliases the transient event object.
      position: { x: position.x, y: position.y },
      origin: 'authored',
    });
    // The projection rebuild re-reads the live references (R4) inside ONE
    // cy.batch (B-112) and refreshes projectedNodeIds (no fit — B-120: the
    // viewport is untouched by edits).
    this.rebuildElements();
    // The single-command delta: the post-command projection's ids minus the
    // pre-command ones. Absent (projection blocked by a null layer/map)
    // degrades to no selection — the node still exists (C32 spirit).
    let createdId: string | null = null;
    for (const id of this.projectedNodeIds) {
      if (!beforeIds.has(id)) {
        createdId = id;
        break;
      }
    }
    // B-121 (D77): every editor command records here — the placed node is
    // drafted from the moment it exists (recordUnsaved also re-projects the
    // tme-draft classes, so the class lands on the node the rebuild above
    // could not yet have known).
    if (createdId !== null) this.recordUnsaved(createdId);
    this.edgeSelection.set(null); // B-106 mutual exclusion: a node selection replaces an edge selection
    if (createdId !== null) this.selection.set({ id: createdId, label: 'New place' });
    this.editorRevision.update((n) => n + 1); // F45: the first edit shows the unsaved indicator
  }

  /**
   * B-116 (D75): persist one node's NEW position — the `free` (dragend)
   * handler's write path. R2: the ONLY mutation is the facade command
   * upsertNode full-replace (PUT, not PATCH — the node's KNOWN id with every
   * authored field kept and the new position verbatim; `...authored` reads
   * the live reference, R4 — a lookup, never a copy). Guards degrade
   * silently (C32 spirit):
   *   - not a LIBRARY node (upsertNode REPLACE is the library plane, D75;
   *     overlay waypoints have no editor command in this packet — their drag
   *     stays view-local), and projection pseudo-nodes are excluded too;
   *   - the authored position already equals the released one — a
   *     grab-and-release without a move is not an edit and must not flag the
   *     map dirty.
   * F45/D75: dirty only — the saved graph still serves routing/the snapshot
   * (no graphRevision bump, no snapshot refresh); the editorRevision bump
   * recomputes the save bar.
   */
  private persistNodePosition(id: string, position: { x: number; y: number }): void {
    const facade = this.facade;
    if (facade === null) return;
    const authored: MapNodeData | undefined = this.map()?.nodes.find((nd) => nd.id === id);
    if (authored === undefined) return;
    if (
      authored.position !== undefined &&
      authored.position.x === position.x &&
      authored.position.y === position.y
    ) {
      return; // a grab without a move: nothing to persist, nothing to flag
    }
    // The two numbers are copied VERBATIM (no coordinate math, R1) because
    // the installed runtime's `position()` getter returns the node's LIVE
    // internal `_private.position` object (cytoscape.umd.js:9010-9016,
    // define.data's no-arg branch — NOT a copy): storing it would alias
    // cytoscape's internal state into the authored map, defeating D75's
    // REPLACE semantics (a fresh object swaps in; the old one must stay
    // byte-identical for the C8 effective graph).
    facade.upsertNode({ ...authored, position: { x: position.x, y: position.y } });
    this.recordUnsaved(id); // B-121 (D77): every editor command records here — the moved node is drafted
    this.rebuildElements(); // B-112: one cy.batch — the projection re-reads the fresh object (D75 REPLACE)
    this.editorRevision.update((n) => n + 1);
  }

  /**
   * B-117 (R4): live lookup of one AUTHORED node by id — the loaded map's
   * nodes ONLY (the library plane): facade.upsertNode REPLACE and
   * facade.removeNode are the library plane (D75), and overlay waypoints
   * have no editor command (the B-116 persistNodePosition precedent), so a
   * waypoint id answers null and the property panel never opens for one.
   * A lookup, never a copy (R4) — callers must not write into the result
   * (C29/R2: the panel drafts a LOCAL copy of the fields it edits).
   */
  nodeDataById(id: string): MapNodeData | null {
    return this.map()?.nodes.find((node) => node.id === id) ?? null;
  }

  /**
   * B-117 (api.ts `parent` contract): the CONTAINER-kind nodes (see
   * CONTAINER_KINDS) of one layer as id + authored label — the property
   * panel's parent picker list. A live filtered read (R4), not a copy of
   * node objects.
   */
  containerNodesOnLayer(layerId: string): readonly { id: string; label: string }[] {
    return (this.map()?.nodes ?? [])
      .filter((node) => CONTAINER_KINDS.has(node.kind) && node.layer === layerId)
      .map((node) => ({ id: node.id, label: node.label }));
  }

  /**
   * B-117 (F40/D75/R2): commit a whole node draft — the property panel's
   * ONLY rename/re-kind/re-parent/alias/describe path. R2: the ONLY
   * mutation is the facade command upsertNode (full-replace PUT with the
   * node's known id; a field the draft leaves undefined clears). A C30
   * refusal comes back as the collected field-precise NodeEditRefusal and
   * NOTHING is touched (reject-before-mutate — the panel keeps its draft
   * open and renders the issues). A successful commit marks only `dirty`
   * (F45: routing/snapshot still serve the SAVED graph until saveMap), so
   * the post-sequence is the B-116 editor one: rebuildElements (the
   * projection re-reads the fresh object) + the editorRevision bump (the
   * save bar lights) — no graphRevision, no snapshot refresh. The selection
   * is re-pointed when it IS the committed node (the promoteWaypoint
   * precedent): same id, fresh authored label, so the chip and route target
   * follow the rename with zero drift (R3).
   */
  upsertNode(node: MapNodeData): NodeEditRefusal | null {
    const facade = this.facade;
    if (facade === null) return { issues: [{ path: '', message: 'No map is loaded.' }] };
    try {
      facade.upsertNode(node);
    } catch (error) {
      return nodeEditRefusal(error);
    }
    this.recordUnsaved(node.id); // B-121 (D77): every editor command records here — the committed draft's node is drafted
    this.rebuildElements();
    this.editorRevision.update((n) => n + 1);
    const sel = this.selection();
    if (sel !== null && sel.id === node.id && sel.label !== node.label) {
      this.selection.set({ id: sel.id, label: node.label });
    }
    return null;
  }

  /**
   * B-117 (F46/D75/R2): delete the authored node — DIRECT, no confirm
   * dialog: delete-and-redo IS the F46 workflow. R2: the ONLY mutation is
   * the facade command removeNode; a C30 refusal (e.g. a compound parent
   * whose children would dangle) comes back field-precise with nothing
   * touched; on success the facade cascades incident edges in BOTH planes
   * (D75). Then the B-116 editor post-sequence (rebuild + editorRevision;
   * F45: no graphRevision/snapshot — the SAVED graph still serves routing
   * until saveMap), and the removeUserNode precedent: the selection is
   * CLEARED when the removed node WAS the selection, so the chip and the
   * property panel close with it.
   */
  removeNode(id: string): NodeEditRefusal | null {
    const facade = this.facade;
    if (facade === null) return { issues: [{ path: '', message: 'No map is loaded.' }] };
    try {
      facade.removeNode(id);
    } catch (error) {
      return nodeEditRefusal(error);
    }
    // B-121 (D77): a removed id LEAVES the edit log; its cascaded edges are
    // already gone from the projection, so any of their log entries match
    // nothing (cleared whole by the next save/load).
    this.forgetUnsaved(id);
    this.rebuildElements();
    this.editorRevision.update((n) => n + 1);
    if (this.selection()?.id === id) this.selection.set(null);
    return null;
  }

  // --- Quick-connect (PKG B-118, §5 Phase 3 M1 — D42/F16/C1/§6.2/F46/F45) -----

  /**
   * B-118: enter connect mode for the CURRENT selection (the property panel's
   * Connect button is the only entry, and the panel is open exactly when this
   * precondition holds: editor mode + a library-node selection). The source
   * is frozen at entry; the pick set, feedback and refusal all start clean.
   * No draft can be left half-committed: the panel commits (or is refused on)
   * its draft BEFORE calling this — the B-117 commit-at-navigation rule.
   */
  enterConnectMode(): void {
    const sel = this.selection();
    if (!this.editorMode() || sel === null) return;
    this.connectSourceId.set(sel.id);
    this.connectPicks.set(new Set());
    this.connectFeedback.set(null);
    this.connectRefusal.set(null);
    this.connectMode.set(true);
  }

  /**
   * B-118: exit cleanly, discarding any uncommitted picks — the Done and
   * Cancel paths both end here (Done after its commit loop), as does the
   * constructor's guard effect on any orphaning state change. The pick
   * signal's clear re-projects the classes off the pick signal (R3), so the
   * `tme-connect-pick` accents drop with the mode with no separate cy write.
   */
  exitConnectMode(): void {
    if (!this.connectMode()) return;
    this.connectMode.set(false);
    this.connectSourceId.set(null);
    this.connectPicks.set(new Set());
    this.connectFeedback.set(null);
    this.connectRefusal.set(null);
  }

  /** B-118: Cancel — discard the whole set, commit nothing (the Done twin). */
  cancelConnect(): void {
    this.exitConnectMode();
  }

  /**
   * B-118 (D42/F16): Done — commit ONE `facade.upsertEdge` per picked target
   * (one command per arc, C4: the engine never invents or removes
   * connections and no dedup happens here — a pre-existing parallel arc
   * simply gains a sibling), each with the D42 defaults (CONNECT_EDGE_MODES:
   * all modes allowed; geometry prices it, C14 row 5). Ids are the engine's
   * (`id: ''` — C5/D75); the UI never invents one. A C30 refusal (the
   * validator's clone-validate-apply gate) surfaces field-precise through
   * `connectRefusal` with the UNCOMMITTED picks intact and the mode still on
   * — committed arcs stay committed (each command is atomic), so the author
   * drops the offending target and retries; a blind retry can never
   * double-commit a target, because committed targets leave the pick set.
   * After a clean loop (or an empty set): the mode exits. F45/D75: the
   * commands mark only `dirty` — the arcs RENDER (one rebuildElements per
   * Done, one cy.batch — B-112) but routing serves the SAVED graph until
   * saveMap; the editorRevision bump lights the save dock.
   */
  doneConnect(): void {
    if (!this.connectMode()) return;
    const facade = this.facade;
    const source = this.connectSourceId();
    if (facade === null || source === null) {
      this.exitConnectMode(); // degrade: no core to commit into (C32 spirit)
      return;
    }
    const remaining = new Set(this.connectPicks());
    const beforeEdgeIds = this.projectedEdgeIds; // B-121: the Done loop only ADDS edges — the post-rebuild delta IS the committed arc set
    let refusal: NodeEditRefusal | null = null;
    for (const target of remaining) {
      try {
        facade.upsertEdge({ id: '', source, target, modes: CONNECT_EDGE_MODES });
        remaining.delete(target);
      } catch (error) {
        refusal = nodeEditRefusal(error);
        break; // committed arcs stay; the rest of the set stays picked
      }
    }
    const committed = this.connectPicks().size - remaining.size;
    if (committed > 0) {
      this.connectPicks.set(remaining); // uncommitted picks intact; committed ones are arcs now
      this.rebuildElements(); // the projection re-reads the live map (one cy.batch, B-112)
      // B-121 (D77): every editor command records here — EACH committed
      // arc is drafted by its engine-assigned id, the same C5/D75 id-delta
      // pattern over edges (the loop above only creates, so the delta is
      // exactly the committed set; a refused arc never existed and never
      // enters the log).
      for (const id of this.projectedEdgeIds) {
        if (!beforeEdgeIds.has(id)) this.recordUnsaved(id);
      }
      this.editorRevision.update((n) => n + 1); // F45: the dock lights on the first arc
    }
    if (refusal !== null) {
      this.connectRefusal.set(refusal); // user-visible (never console-only); mode stays on
      return;
    }
    this.exitConnectMode();
  }

  /**
   * B-118 (C1/§6.2/D58): route a connect-mode node tap — the ONE pickable
   * rule is the core's `isPinEligible` over the MERGED node set (library +
   * overlay waypoints): kind ∈ {location, hub, waypoint} AND no children
   * reference it. A container, a parent, a foreign-layer node or a badge
   * pseudo-node is ignored with banner feedback — never an arc (the
   * validator refuses edges into compound parents, §6.2), never a selection
   * (F46). The source never picks itself. A pickable tap TOGGLES the set
   * (one tap = one toggle; Set membership is the double-pick prevention)
   * and clears any stale feedback.
   */
  private handleConnectTap(node: NodeSingular): void {
    const id = node.id();
    if (id === this.connectSourceId()) {
      this.connectFeedback.set(CONNECT_SELF_TARGET);
      return;
    }
    const map = this.map();
    const layerId = this.activeLayer();
    if (map === null || layerId === null) return; // degrade before loadMap (C32 spirit)
    const overlay = this.overlay;
    const merged = overlay === null ? map.nodes : [...map.nodes, ...overlay.userNodes];
    const authored = merged.find((nd) => nd.id === id);
    if (authored === undefined || authored.layer !== layerId || !isPinEligible(id, merged)) {
      this.connectFeedback.set(CONNECT_BAD_TARGET);
      return;
    }
    this.connectFeedback.set(null);
    this.connectPicks.update((picks) => {
      const next = new Set(picks);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * B-116 (F45/C29/D75): the save bar's Save — the facade's explicit save,
   * the only command that takes unsaved editor edits live (C8's edit save
   * sets `stale`). The C30 final gate can REFUSE (an invalid live map): the
   * error surfaces user-visibly through the saveError signal (never
   * console-only), `dirty` stays true and the map is untouched. On success
   * the saved edits are LIVE: the revision bumps re-run the sidebar's route
   * (graphRevision — the edits changed the effective graph now) and the
   * header re-reads the snapshot (which the next getSnapshot rebuilds from
   * the saved map). No rebuildElements: the canvas projection already shows
   * the edited references — the editor surface is the author's truth.
   */
  saveMap(): void {
    const facade = this.facade;
    if (facade === null) return;
    try {
      facade.saveMap();
    } catch (error) {
      this.saveError.set(error instanceof Error ? error.message : String(error));
      return; // C30 refusal: the log stays INTACT — the map is still dirty (B-121/D77)
    }
    this.saveError.set(null);
    // B-121 (D77): the saved edits are LIVE — the whole draft log clears and
    // the tme-draft classes come off every element. A class-only pass (no
    // rebuildElements — the projection already shows the edited references,
    // the comment above stands); the empty log is the truth every later
    // rebuild re-projects.
    this.unsavedIds.clear();
    this.applyDraftClasses();
    this.editorRevision.update((n) => n + 1); // F45: the indicator clears
    this.graphRevision.update((n) => n + 1); // the saved graph went live — re-route live (B-106 precedent)
    this.refreshSnapshot();
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
   *
   * B-113 (ruling 5): the cull check re-runs after the re-fit — idempotent.
   * Verification finding (B-111 precedent, file:line): a programmatic
   * cy.fit DOES emit `zoom` (cytoscape.esm.mjs:19478, 'pan zoom viewport'),
   * and fitView re-runs the check after recomputing the threshold — so this
   * explicit pass is belt-and-braces, keeping the resize path self-sufficient
   * should a resize ever change zoom without a fit (cy.resize() itself emits
   * only `resize`). The re-fit also re-bases cullZoom: a resize that moves
   * zoom across the old threshold cannot strand a stale cull state.
   */
  notifyResize(): void {
    if (!this.mounted) return;
    this.cy.resize();
    this.fitView();
    this.applyLabelCull();
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

  /**
   * B-111: resolved curve-style of one edge ('bezier' | 'unbundled-bezier' |
   * ...), or null — mirrors testEdgeLineStyle. Read-only (R2/R4 hold).
   */
  testEdgeCurveStyle(id: string): string | null {
    const edge = this.cy.getElementById(id);
    return edge.length === 0 ? null : String(edge.style('curve-style'));
  }

  /**
   * B-121 (D77): resolved line-color of one edge (the draft/blocked/selected
   * cascade's assertion surface — the tme-draft entry's exact B-111
   * precedent: a resolved style read, never a screenshot diff), or null.
   * Read-only (R2/R4 hold).
   */
  testEdgeLineColor(id: string): string | null {
    const edge = this.cy.getElementById(id);
    return edge.length === 0 ? null : String(edge.style('line-color'));
  }

  /**
   * B-121 (D77): resolved border-color of one node (the draft/pin/selected
   * cascade's assertion surface), or null. Read-only (R2/R4 hold).
   */
  testNodeBorderColor(id: string): string | null {
    const node = this.cy.getElementById(id);
    return node.length === 0 ? null : String(node.style('border-color'));
  }

  /**
   * B-121 (D77): the edit log's ids, insertion-ordered (the draft visual's
   * state seam — the testNodeLabels precedent). Read-only (R2/R4 hold);
   * never a mutation path, so the log stays the service's own.
   */
  testDraftedIds(): string[] {
    return [...this.unsavedIds];
  }

  /**
   * B-121 (D77): the stylesheet's selector strings in declaration order —
   * the structural pin that `tme-draft` precedes the pin/selected/blocked
   * accent entries (the no-specificity cascade's override rule; the B-111
   * declaration-order precedent). Read-only plain data (D7, R2/R4 hold).
   */
  testStylesheetSelectors(): string[] {
    return GRAPH_STYLESHEET.map((entry) => String(entry.selector));
  }

  /**
   * B-109 (ruling 4): ids of every edge in the projection — authored arcs
   * (`arc-`) plus kNN user edges (`we-`, C7), so e2e can count the walk-only
   * connections a placement creates. Read-only (R2/R4 hold).
   */
  testEdgeIds(): string[] {
    return this.cy.edges().map((edge) => edge.id());
  }

  /**
   * B-109 (ruling 4): the projected `parent` data of one node — null for a
   * top-level node (the §6.2 compound-box case: addUserNodeAt places
   * unparented) or an unknown id (degrade, C32 spirit). Read-only (R2/R4).
   */
  testNodeParent(id: string): string | null {
    const node = this.cy.getElementById(id);
    if (node.length === 0) return null;
    const parent: unknown = node.data('parent');
    return typeof parent === 'string' ? parent : null;
  }

  /**
   * B-113: whether the projected node `id` currently carries class `cls` —
   * the label-culling spec's assertion surface (the class IS the cull state;
   * which labels stay visible is stylesheet data the class assertions pin
   * structurally). Mirrors the other read-only test* seams: no mutation path
   * (R2/R4 hold); an unknown id answers false (degrade, C32 spirit).
   * `hasClass` is typed on SingularStyle (@types/cytoscape 3.21.9
   * index.d.ts:2274), reachable on the getElementById collection via
   * CollectionReturnValue (index.d.ts:1407).
   */
  testNodeHasClass(id: string, cls: string): boolean {
    const node = this.cy.getElementById(id);
    return node.length > 0 && node.hasClass(cls);
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
   * B-116: MODEL position of one node, or null when absent — `node.position()`
   * (@types/cytoscape 3.21.9 index.d.ts:1795), a pure read used by e2e to
   * prove a view-mode drag moves NOTHING (a pan changes the rendered
   * position, never the model one) and that an editor drag's persisted
   * authored position survives mode toggles. Read-only (R2/R4 hold).
   */
  testNodeModelPosition(id: string): { x: number; y: number } | null {
    const node = this.cy.getElementById(id);
    if (node.length === 0) return null;
    const pos = node.position();
    return { x: pos.x, y: pos.y };
  }

  /**
   * B-117: the AUTHORED fields of one LIBRARY node (the editor plane) for
   * e2e — label/kind/parent/aliases/description, a plain copy for the wire.
   * Read-only, no mutation path (R2/R4 hold). Overlay waypoints and unknown
   * ids answer null (no editor command — the B-116 precedent).
   */
  testNodeData(id: string): {
    label: string;
    kind: string;
    parent: string | null;
    aliases: string[];
    description: string | null;
  } | null {
    const node = this.map()?.nodes.find((nd) => nd.id === id);
    if (node === undefined) return null;
    return {
      label: node.label,
      kind: node.kind,
      parent: node.parent ?? null,
      aliases: node.aliases ? [...node.aliases] : [],
      description: node.description ?? null,
    };
  }

  /** B-118: whether connect mode is currently on — the banner's state seam. */
  testConnectMode(): boolean {
    return this.connectMode();
  }

  /**
   * B-118: the current quick-connect pick set in pick order (Set iteration
   * is insertion order). Read-only (R2/R4 hold).
   */
  testPickedNodeIds(): string[] {
    return [...this.connectPicks()];
  }

  /**
   * B-118: the AUTHORED fields of one LIBRARY edge for e2e — the D42-default
   * assertions (source/target/all-modes-allowed) off the live map reference
   * (quick-connect arcs land in `map.edges` via upsertEdge). A plain copy
   * for the wire; read-only, no mutation path (R2/R4 hold). Overlay edges and
   * unknown ids answer null.
   */
  testEdgeData(id: string): {
    id: string;
    source: string;
    target: string;
    modes: string[];
  } | null {
    const edge = this.map()?.edges.find((candidate) => candidate.id === id);
    if (edge === undefined) return null;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      modes: (Object.keys(edge.modes) as TravelMode[]).filter(
        (mode) => edge.modes[mode]?.allowed === true,
      ),
    };
  }

  /**
   * B-118: the live route's leg arc ids (R1: the core's own route, carried
   * verbatim — the F45 discriminator's seam: before saveMap a route to an
   * unsaved node is null, after save it prices and its legs name the created
   * arcs), or null when no route is computed. Read-only (R2/R4 hold).
   */
  testRouteLegArcIds(): string[] | null {
    const route = this.route();
    return route === null ? null : route.legs.map((leg) => leg.arcId);
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

  /**
   * Swap the projected elements to the active layer, atomically. §6.1 dense
   * rows + PKG B-112 (ruling 1): remove, add AND the selection-accent
   * re-projection run in ONE cy.batch — one render pass per rebuild, per
   * caller (block/lift, travel-mode switch, layer switch, map load, editor
   * commands). B-120 (R21 ruling 1): a rebuild NEVER fits the view — zoom
   * and pan are the user's; the ONLY fit sites are mount(), notifyResize()
   * and selectLayer()'s explicit fitView (a loadMap-while-mounted gets its
   * own decision in Phase 4 — see loadMap).
   */
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
    // B-116 (C5/D75): record the node ids of the projection being installed —
    // the pre-command set the place-command's id delta reads (placeNodeAt).
    // Derived from the same pure builders' output, so it can never drift from
    // what cy actually holds. B-121: the EDGE ids join it — doneConnect's
    // committed-arc discovery reads that delta.
    const projected = [...elements, ...badges];
    this.projectedNodeIds = new Set(
      projected.filter((el) => el.group === 'nodes').map((el) => String(el.data.id)),
    );
    this.projectedEdgeIds = new Set(
      projected.filter((el) => el.group === 'edges').map((el) => String(el.data.id)),
    );
    this.cy.batch(() => {
      this.cy.elements().remove();
      this.cy.add([...elements, ...badges]);
      // The swap drops ALL classes — re-project the selection accents INSIDE
      // this same batch so the signals stay the single truth (R3; B-106:
      // block/lift rebuilds included) without a second render pass (§6.1
      // dense-row mitigation; PKG B-112 ruling 1).
      this.projectSelectionClasses();
      // B-121 (D77): the draft classes join the SAME batch — the element
      // swap drops them with every other class, and the edit log (plain
      // field, D2) is re-projected onto the fresh elements here: nodes,
      // edges and cross-layer badges of arcs with unsaved edits.
      this.projectDraftClasses();
      // B-113 (ruling 4), exactly true since B-120: a rebuild must not
      // un-cull a culled view — the blanket class re-applies to the FRESH
      // elements from the labelCulled state field (D2) inside this batch,
      // and rebuildElements NEVER fits (B-120/R21 ruling 1: an edit while
      // culled stays culled; cullZoom is recomputed only by real fits —
      // mount, notifyResize, selectLayer's explicit fitView). applyLabelCull
      // still rides zoom events, so the class follows the threshold again
      // the moment the user zooms.
      if (this.labelCulled) this.cy.nodes().addClass('tme-cull-labels');
    });
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
   * B-121 (D77): the draft-visual seam — EVERY editor command this service
   * issues records the touched element id here (placeNodeAt,
   * persistNodePosition, the B-117 draft commit, doneConnect per committed
   * arc; B-122/B-123's draw-arc and arc-panel commits join the same seam).
   * Log write + immediate class re-projection, so the caller's ordering
   * against rebuildElements can never leave a drafted id un-classed.
   */
  private recordUnsaved(id: string): void {
    this.unsavedIds.add(id);
    this.applyDraftClasses();
  }

  /**
   * B-121 (D77): the log's one removal — a DELETED element's id leaves the
   * log (removeNode; B-123's removeEdge joins here). Class re-projection
   * included, same one-seam discipline.
   */
  private forgetUnsaved(id: string): void {
    this.unsavedIds.delete(id);
    this.applyDraftClasses();
  }

  /**
   * B-121 (D77): the draft projection's batched wrapper — the record/forget
   * seam's whole write (the applySelectionClasses twin; PKG B-112 ruling 1).
   */
  private applyDraftClasses(): void {
    this.cy.batch(() => this.projectDraftClasses());
  }

  /**
   * B-121 (D77): the RAW draft class operations — deliberately UN-batched
   * (the B-112 ruling 1 structure): the CALLER owns the cy.batch, so a
   * rebuild costs one render pass. ONE `tme-draft` class per logged id on
   * whatever projects it — the node/edge with that id, AND the cross-layer
   * badge pseudo-node `tme-badge-<id>` (a badge IS its arc's whole canvas
   * surface, B-107). Class application only, no per-element style
   * computation (R1 spirit; D7: the stylesheet computes nothing from code);
   * ids absent from the projection (removed, other layer) match an empty
   * collection — a no-op, never an error.
   */
  private projectDraftClasses(): void {
    this.cy.elements().removeClass('tme-draft');
    for (const id of this.unsavedIds) {
      this.cy.getElementById(id).addClass('tme-draft');
      this.cy.getElementById(`tme-badge-${id}`).addClass('tme-draft');
    }
  }

  /**
   * The selection-accent projection (R3), batched — the constructor effect's
   * path (signal-driven: tap-select, background-tap clear, chip dismiss).
   * PKG B-112 (ruling 1): the raw class operations live in
   * projectSelectionClasses so rebuildElements can run them inside ITS
   * batch; this wrapper stays the effect's whole write.
   */
  private applySelectionClasses(): void {
    this.cy.batch(() => this.projectSelectionClasses());
  }

  /**
   * The RAW selection-accent class operations — deliberately UN-batched
   * (PKG B-112 ruling 1): the CALLER owns the cy.batch, so a rebuild costs
   * one render pass, not two (§6.1 dense sub-graph perf). tme-selected on
   * the selected node, tme-edge-selected on the selected edge, and (B-118)
   * tme-connect-pick on the quick-connect pick set — read off the signals at
   * call time (the picks read also makes the constructor's class effect
   * re-run per pick toggle). One function for all call sites (the effect via
   * applySelectionClasses, the element swap inside rebuildElements' batch),
   * so the paths can never diverge.
   */
  private projectSelectionClasses(): void {
    const sel = this.selection();
    const edgeSel = this.edgeSelection();
    const picks = this.connectPicks(); // B-118: signal read = effect dependency
    this.cy.nodes().removeClass('tme-selected');
    if (sel !== null) this.cy.getElementById(sel.id).addClass('tme-selected');
    this.cy.edges().removeClass('tme-edge-selected');
    if (edgeSel !== null) this.cy.getElementById(edgeSel.id).addClass('tme-edge-selected');
    // B-118 (F46): the pick set's DISTINCT accent — never tme-selected; a
    // pick is an arc endpoint, not an editing selection.
    this.cy.nodes().removeClass('tme-connect-pick');
    for (const id of picks) this.cy.getElementById(id).addClass('tme-connect-pick');
  }

  private refreshSnapshot(): void {
    this.snapshot.set(this.facade === null ? null : this.facade.getSnapshot());
  }

  /**
   * The single fit site — and since B-120 (R21 ruling 1) the ONLY fit sites
   * are mount(), notifyResize() and selectLayer()'s explicit call: an edit,
   * a block/lift, a mode switch or a map load never refits (zoom and pan
   * are the user's). B-113 (ruling 1): after cy.fit the cull threshold is
   * RECOMPUTED from the fit zoom (every re-fit re-bases it — the threshold
   * is fit-relative), then the cull check re-runs. The re-run is required,
   * not defensive: the fit itself synchronously emits `zoom`
   * (cytoscape.esm.mjs:19478) and that handler pass executes against the
   * PREVIOUS threshold. Idempotent — see applyLabelCull. An empty canvas
   * takes the never-cull threshold instead.
   */
  private fitView(): void {
    if (this.cy.elements().length > 0) {
      this.cy.fit(undefined, FIT_PADDING);
      this.cullZoom = this.cy.zoom() * LABEL_CULL_FACTOR;
    } else {
      this.cullZoom = NEVER_CULL_ZOOM;
    }
    this.applyLabelCull();
  }

  /**
   * B-113 (ruling 2): the label-cull check — one viewport read, one crossing
   * gate, and on a crossing ONE blanket class toggled on ALL nodes inside
   * cy.batch. Which labels stay visible while the class is on is the
   * stylesheet's business (the tme-pin/tme-selected entries — B-115: badges
   * no longer exempt, they cull with all content) — the
   * code applies the class blindly, no per-element branching (R1/D7 spirit).
   * Safe to call from any zoom-change path at any frequency: below the
   * crossing threshold it is two scalar reads (D2).
   */
  private applyLabelCull(): void {
    const shouldCull = this.cy.zoom() < this.cullZoom;
    if (shouldCull === this.labelCulled) return; // only on crossing
    this.labelCulled = shouldCull;
    this.cy.batch(() => {
      if (shouldCull) this.cy.nodes().addClass('tme-cull-labels');
      else this.cy.nodes().removeClass('tme-cull-labels');
    });
  }
}
