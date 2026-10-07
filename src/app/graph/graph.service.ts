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
// B-120 (R21 rulings 1 + D76; fit-site list refined by D81, narrowed by
// D91): viewport stability + editor-only placement. (1) fitView belongs to
// mount(), selectLayer() and ENVIRONMENTAL notifyResize() ONLY — rebuildElements
// NEVER fits, so an edit (place/move/property-commit), a block/lift, a mode
// switch or a map load leaves zoom and pan untouched (the cull machinery
// follows: cullZoom is recomputed only by real fits, and a rebuild re-applies
// the cull class from `labelCulled` — an edit while culled stays culled,
// B-113 ruling 4's stated intent now exactly true). D91: the four panels are
// OVERLAYS (floaters on wide, bottom sheets on narrow) — a panel open/close
// resizes NOTHING, so the only remaining panel-driven container resize is the
// editor rail's collapse/expand; on the wide layout it takes the preserve
// path (zoom and pan byte-kept, with a pan-only selection rescue clamp) and
// every narrow-layout and environmental resize keeps the B-106 refit.
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
// B-122 (§5 Phase 3 M2 draw-arc + D76/D77/D78/D42): the third editor tool
// 'arc' — an editor-mode tap on an authored LEAF of the active layer is a
// PICK, never a selection (the tme-connect-pick accent pattern, the distinct
// `tme-draw-pick` class); the second tap on a DIFFERENT eligible leaf commits
// ONE facade.upsertEdge (id: '' — C5/D75) with the map's D78 default-allowed
// mode set (defaultArcModes: built-ins unless a registry entry adopting the
// id opts out, plus every allowedByDefault registry entry — on a no-registry
// map exactly the D42 quick-connect defaults), records the arc at the B-121
// seam, selects it (the arc panel opens), and NEVER fits (B-120). The tool
// STAYS on across commits (consecutive arcs). Escape hatches: tapping the
// source cancels; a background or compound-box tap cancels (with the Arc
// tool active the editor background tap is NEVER a placement — the tool owns
// the gesture); a tool switch or editor exit clears the pick. Same-layer
// only: F17/C3 fence cross-layer arc CREATION out of M2 — a pick that would
// commit cross-layer (a mid-pick layer switch) is refused visibly through
// drawArcFeedback with the pending pick KEPT (degrade, never throw — C32
// spirit). Waypoints and badges are never picks (an authored arc's
// endpoints are library nodes): a waypoint/badge tap keeps the pick.
// B-123 (§5 Phase 3 M2 — the arc panel's editing sections): the panel gains
// the per-mode toggles + authored minutes, terrain, authored distance, curve
// control points, the "measure this arc" scale calibration, and arc Remove —
// editor-gated per the B-117/Q29 regime. Reads: `arcInfo` gains terrain/
// authoredDistance/curve verbatim (R4) plus the `library` plane gate
// (upsertEdge/removeEdge REPLACE is the library plane, D75; overlay `we-`
// arcs are chat state with no editor command — the B-116 waypoint
// precedent — so the draft sections never render for one), and
// `arcModesOf(id)` rows the map's WHOLE mode universe (built-ins ∪ registry
// ids) with the ONE core label resolver (A-016; R1 spirit for authored
// words — the UI never maps ids to words itself), each row reading the
// arc's own spec verbatim (an absent key rows as not-allowed — C14 row 2's
// honest display). Commands: `commitArcDraft` (the panel's full-replace
// `upsertEdge` PUT with the KNOWN id — one commit per Apply; a C30 refusal
// surfaced field-precise), `measureArc` (the A-015 `calibrateScale`
// passthrough — writes SCALE, never the arc), `removeArc`
// (`facade.removeEdge`; the removed id LEAVES the B-121 log via
// forgetUnsaved — that seam's named caller; an overlay block dies with the
// arc, F50) — every successful commit records at the B-121 seam ("every
// editor command records here") and marks only `dirty` (F45/D75: the save
// dock lights; routing and the snapshot serve the SAVED graph until
// saveMap). `blockArc` now CATCHES the facade's C30 refusal (blocking an
// UNSAVED drawn arc — the A-014 saved-plane gate; B-121's found-not-fixed)
// and surfaces it field-precise through `arcBlockRefusal`, never an
// uncaught throw. The live scale is read verbatim through `scaleNow` (R1 —
// the measure section's readout shows the core's numbers; the
// editorRevision dependency re-renders it after an in-place calibration,
// C24).
// B-124 (D78/D42 — the map-driven mode surfaces): the two hardcoded
// mode-vocabulary surfaces read the map now. (1) The route panel's switch
// renders `modeRows` — the map's mode universe (built-ins ∪ registry ids,
// insertion order, the arcModesOf discipline) rowed with the ONE core
// resolver's words (`resolveModeLabel`; the UI never maps ids to words, R1
// spirit) — on a no-registry map exactly the built-in trio. (2) doneConnect
// commits `defaultArcModes()` — the SAME private derivation draw-arc commits
// (one D42 default-allowed set) — replacing the hardcoded CONNECT_EDGE_MODES
// trio; on a no-registry map the committed modes are byte-identical to it. A
// C30 refusal of the facade's setTravelMode (the degrade path — every
// rendered id is valid by construction, but the surface must exist) is
// caught and surfaced user-visibly through `travelModeRefusal` (the
// saveError/arcBlockRefusal pattern), never an uncaught throw (C32).
// B-126 (§5 Phase 3 M3 — D82/D83/F54): the layer-manager surfaces. (1) The
// sheet's open state (`layerManagerOpen` — FRONTEND viewer state, the
// panelFloating class: the facade carries no command for it; closed by
// loadMap and the sheet's own Escape/X/Manage affordances). (2) The five
// layer-command wrappers (upsertLayer / removeLayer / reorderLayers /
// setNodeLayer / detachNode) — R2 seams: the components never touch the
// facade directly; each returns C30 refusals as the panel-renderable
// NodeEditRefusal shape (nodeEditRefusal), marks only `dirty` (F45/D75:
// dirty-never-stale — no graphRevision bump, no snapshot refresh; the save
// dock is the visual) and feeds the B-121 draft log (a moved node joins;
// a removeLayer's portal-unwired survivors join; removed ids LEAVE — the
// removeEdge precedent). (3) `layerRemovalImpact` — the R1 read the
// delete-confirm dialog renders (the ENGINE's N/M/K, never UI counting),
// with `testLayerRemovalImpact` as its harness seam. The active-layer
// reset rides D69/D82: deleting the active layer mirrors the facade's
// reset (survivors' first layer) into the signal and re-projects.
// B-127 (§5 Phase 3 M3 — D86/F53): the editor rail's zoom trio — `zoomIn` /
// `zoomOut` (one ×1.25 multiplicative step about the VIEWPORT CENTER via
// `cy.zoom({ level, renderedPosition })`, cropped by the runtime to its
// min/max zoom) and `fitToView` (the PUBLIC user Fit — the user is the
// authority, D10 — calling the ONE internal fit site, B-120/D81). All
// three are the notifyResize class: NO signal writes, no logging (D2);
// the only followers are the B-113 `zoom`-event cull handler and (B-134)
// the background transform application on the same `zoom`/`pan` stream.
// B-130 (§5 Phase 3 M3 — D84/D29/C32): layer backgrounds go live end-to-end.
// (1) `setLayerBackground` — the R2 wrapper over the facade command (the
// B-126 layer-wrapper discipline: NodeEditRefusal shape, editorRevision bump
// only — the background is NOT a cy projection element, so no rebuild and no
// B-121 entry). (2) `activeBackground` gains the editorRevision dependency
// (C24 — the in-place layer-object swap precedent, the layerNames note) and
// `layerBackground(id)` exposes the ARM-level live read the manager sheet's
// state lines render. (3) The C32 load degrade: the tme-bg img's error lands
// in `backgroundLoadFailed()` — ONE `[TravelMapper] background load failed`
// warn, the `backgroundFailed` view flag hides the img, and the constructor
// effect re-arms it on any src change (a retry succeeds silently); a hostile
// URL never throws and never breaks the canvas (F03).
// B-128 (§5 Phase 3 M3 — D85/F02/F17): portals go live. (1) PORTAL BADGES —
// buildPortalBadges (layer-elements.ts) merges one `tme-portal-badge` pseudo-
// node per wired node into the rebuild batch beside the arc badges (the
// shared `tme-badge` class keeps B-115 cull-coherence; the distinct class
// carries the depth hue); single taps stay no-ops (the waypoint/badge tap
// precedent). (2) THE ENTRY GESTURE (F02's fixed one): dblclick + dbltap on
// `node.tme-portal-badge` ⇒ selectLayer(portal target of that node) —
// available in BOTH modes (D85 fences nothing; a kept draw pick narrates,
// below); a single tap selects nothing, so a double's two taps never select;
// a stale badge (node/target gone mid-rebuild) degrades to a no-op (C32).
// Verified against the installed runtime: the mouse double-click path fires
// BOTH names (cytoscape.umd.js:26441 `["dblclick", "dbltap", "vdblclick"]`),
// the touch path fires dbltap (:27431) — re-entry is an idempotent
// selectLayer of the same target. EventNames is plain `string`
// (@types/cytoscape 3.21.9 index.d.ts:3719), so the names typecheck as-is.
// (3) THE BREADCRUMB: the layer chain derives from the wiring — the service
// exposes the pure breadcrumbChain through the `breadcrumb` computed
// (root → active, names joined, rendered by the viewer when length > 1);
// crumb taps are selectLayer. (4) THE F17 UN-FENCE (D85): selectLayer with a
// pending draw pick KEEPS it and narrates ("Drawing from <label> — tap where
// its arc lands") — the silent mid-pick die-at-the-fence regime ends — and
// the B-122 cross-layer guard RETIRES: a target tap whose layer differs from
// the source's COMMITS cross-layer (plain commitDrawArc; C3 badges it);
// DRAW_ARC_CROSS_LAYER and its constant are gone. loadMap/editor-exit clear,
// the compound-box and self-tap cancels stand. (5) THE WIRING SEAM:
// `setPortal(nodeId, layerId | null)` — the R2 wrapper over A-017's facade
// command (immediate discrete intent, the setNodeLayer precedent; C30
// refusals field-precise; the node joins the B-121 log — a node edit; rebuild,
// no fit, B-120). The pure projection and builders stay R1-clean.
// B-131 (D94/F55/C34): node BLOCKING goes live on its
// surfaces. (1) THE SEAM TRIO — `blockNode` / `liftNodeBlock` /
// `clearNodeBlockRefusal` mirror the blockArc trio byte-for-byte in
// discipline: the ONLY mutation is facade.setNodeBlocked (R2); the ADD
// path's C30 refusals (the A-018 saved-plane gate refuses an UNSAVED editor
// node field-precisely; the non-empty-reason gate) are CAUGHT and surfaced
// through `nodeBlockRefusal` (the arcBlockRefusal pattern — never an
// uncaught console throw), nothing mutated on refusal, `afterGraphMutation()`
// on success (revision bump re-routes, rebuild re-projects, snapshot
// refresh); lift is unconditional. `nodeBlockReason(id)` is the R4 live read
// the property panel renders. (2) THE MARKER — the blocked-node badge rides
// the EXISTING badge machinery (the B-128 portal-badge precedent): one
// DISTINCT `tme-node-blocked-badge` pseudo-node per blocked node on the
// active layer, derived from `overlay.nodeBlocked` in rebuildElements (the
// dashed-arc class precedent reading `overlay.blocked`) and cleared by the
// same rebuild on lift. (3) `DEFAULT_BLOCK_REASON` — the ONE shared
// one-tap default ('Closed', D94's authored vocabulary, C23) both panels
// apply when their reason input is empty.
// B-132 (§5 Phase 3.5 M5 — D90/D93/F56): the per-layer background DIM goes
// live on the rail. The R4 live reads — `activeLayerDim` (absent arm ⇒ 0)
// and `activeLayerHasBackground` — compute over `activeLayer` +
// `editorRevision` (the C24 in-place layer-swap precedent: BOTH the dim
// command and the D93 fresh-start reset inside setLayerBackground splice a
// fresh layer object, so a background change re-reads the reset dim; the
// layer switch follows through the activeLayer dependency — D90). The ONE
// write path `setActiveLayerDim(dim)` wraps facade.setLayerBackgroundDim
// (R2) with NO refusal channel — the zoom-trio pattern: the range input's
// structural 0–1/step bounds make the C30 gate unreachable from the
// control (documented in the method). Commit-on-input: map data, dirty
// per tick (D75 — the dock lighting is correct), no rebuild, no B-121
// entry (the B-130 background-set discipline).
// B-134 (§5 Phase 3.5 M5 — D92/D93): the background joins the VIEWPORT
// transform. The tme-bg <img> becomes a MODEL-SPACE surface: its placement
// (`LayerData.backgroundPlacement`, A-019 — x/y = the image's center in model
// coordinates, scale = model units per image pixel) positions it in the
// graph's plane and it pans/zooms 1:1 with cy. (1) THE DEFAULT — an
// aspect-locked CONTAIN fit of the natural image size to the active layer's
// node bounding box (data positions of the layer's library nodes + overlay
// waypoints; containers carry none), computed by ONE function
// (defaultPlacementFor — B-135's "fit to graph" re-uses it) at EXACTLY three
// sites: background-set, loadMap, layer-switch — never off a graph edit
// (D92: edits never move the placement). The default persists ONLY at the
// background-set authoring moment (the img load resolves the natural size,
// ONE facade.setLayerBackgroundPlacement write — dirty, part of the
// authoring action, D75); at loadMap/layer-switch it is COMPUTED AND HELD in
// app state (heldDefaultPlacement) and NEVER auto-persisted — an unedited
// map never opens dirty. DEGENERATE extents (no/one/coincident positioned
// node — zero-area bbox) leave the placement undefined: the render falls
// back to the D84 stage-contain shape until B-135's explicit calibrate
// writes an arm. (2) THE STREAM — the transform rides the B-113 cull
// precedent's seam: the high-frequency `zoom`/`pan` handlers write NO
// signals; the service calls a listener REGISTERED BY THE VIEWER (the D81
// discipline mirrored — the service owns cy's viewport, the component owns
// its DOM: the callback reads backgroundRenderState() (placement × live
// zoom/pan) and applies left/top/width/height to the img directly, per
// event, idempotent). D91 zero-motion binds too: nothing here fits, resizes
// or pans — the transform only READS the viewport; the C32 failed-load
// degrade stands (no natural size ⇒ no compute, no persist, the img hides).
// The ONE cytoscape instance (D3): created headless
// in the constructor, `mount()`/`unmount()` on demand — computation works with
// the UI closed. Zoneless (D2): the service writes signals; the ONLY canvas
// events bound are discrete gestures (`tap` → selection signals, `free` →
// debug log) plus B-113's `zoom` (high-frequency, writes NO signals — it only
// toggles the cull class on threshold crossings; B-134's background
// transform application joins the same handler, also writing no signals)
// and B-134's `pan` (the same class — the tme-bg transform per event); the
// tapstart/tapdrag/tapend
// stream is never registered, so dragging costs zero change detection.
// B-135 (§5 Phase 3.5 M5 — D93/D92/D75/D91/F07/F56): the calibrate MODE —
// the explicit authoring surface for `backgroundPlacement`, entered from the
// layer-manager's background section and rendered by the viewer as a
// stage-top band (the draw-arc banner precedent). While it is on, the mode
// OWNS the canvas gestures (every existing tap/portal handler gates on it —
// a tap selects and places nothing, the tap-vs-drag discipline): a drag
// translates the placement CENTER in model space (screen delta / live zoom,
// both axes — the same arithmetic B-134's transform inverts; a drag starting
// on a node still calibrates — nodes are read-only: autoungrabify), the
// scale stepper multiplies the ONE aspect-locked scale per committed tap,
// and Fit-to-graph writes B-134's single-sourced `defaultPlacementFor`
// result. The gesture applies LIVE through a draft placement the B-134
// render reads ahead of the arm (a plain field — no signal writes at drag
// frequency, D2); each COMMITTED gesture (drag end, scale step, fit tap) is
// ONE `setActiveLayerPlacement` write (the setLayerBackgroundDim precedent:
// refusal-free structural bounds, editorRevision bump, dock lights — D75)
// re-read through editorRevision (C24). D91 zero-motion binds: nothing here
// fits or resizes — the IMAGE moves in model space, the camera stays (pan
// and zoom are user-input-disabled for the session). Calibration NEVER
// touches node coordinates, distances or costs (D93 — the only writer is
// the placement facade command, and nothing but it). Degenerate extents
// (the D84 fallback rendering) still calibrate: the first gesture
// synthesizes the fallback's implied model placement (the canvas-center
// contain fit over the live viewport) and the committed write replaces the
// fallback with a real arm; Fit-to-graph is disabled honestly there (F07).
// The tapstream handlers register at entry and un-register at exit, so the
// B-134 invariant above stays true outside the mode.
//
// B-139 (§5 Phase 3 M4 — C25/D41/D97): the FORK FAMILY joins the library
// wrapper family — `forkFromLibrary(map)` (the per-row Fork: the packet's
// "open X then `forkMap()`" sequence as ONE component action, legal on any
// row incl. the loaded fork's own row — fork-of-fork, A-022) and
// `saveForkBackToLibrary()` (the D97 explicit non-default save-back, the
// fork's own id/name upsert) plus the two R4 reads (`loadedMapIsFork` — the
// save-back button's structural gate — and `forkError`, the saveError-pattern
// words channel for every fork-family refusal). THE SEAM: after the engine's
// `forkMap()` the fork exists only inside the facade (void command; D97's
// return is the detached save-back snapshot), so the service re-establishes
// its C24 same-reference hold THROUGH the §9 list — saveForkToLibrary read
// back → facade.loadMap(copy) → the twin this.loadMap — never
// `facadeStateOf` (the R4 spirit below holds: the same live reference, one
// truth; the parent object is never re-held after the detach).
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
import type {
  CollectionReturnValue,
  Core,
  EdgeSingular,
  ElementDefinition,
  NodeSingular,
  StylesheetStyle,
} from 'cytoscape';
import { Injectable, OnDestroy, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { MAP_LIBRARY } from './map-library';
import type {
  ChatMapOverlay,
  LayerBackground,
  LayerRemovalImpact,
  MapEdgeData,
  MapNodeData,
  MapSnapshot,
  NodeKind,
  RouteResult,
  Terrain,
  TravelMode,
  WorldMapData,
} from '../../core/api';
import type { MapFacade } from '../../core/facade';
import { MapValidationError, isPinEligible, resolveModeLabel } from '../../core/model/validate';
import {
  breadcrumbChain,
  buildCrossLayerBadges,
  buildLayerElements,
  buildPortalBadges,
  crossLayerAnchors,
} from './layer-elements';

/** Switcher label: the id the facade validates + the C23 human name. */
export interface LayerLabel {
  readonly id: string;
  readonly name: string;
}

/**
 * D81: one interactive-chrome rectangle, in CANVAS-relative px — the clamp's
 * avoidance targets. Measured by the consumer (map-viewer.component reads
 * its own DOM and translates into the canvas space the service's rendered
 * boxes live in; the service never reads the DOM). `x`/`y` is the top-left
 * corner; a zero-area rect is skipped by the clamp.
 */
export interface ChromeRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * B-120 (D76): the editor's placement tools — which kind an editor-mode
 * background/compound-box tap places. B-122 (§5 Phase 3 M2): the third
 * member 'arc' — with it active the background/compound-box tap places
 * NOTHING (the gesture cancels the pending pick instead); leaf taps become
 * draw-arc PICKS (see handleDrawArcTap).
 */
export type EditorTool = 'node' | 'waypoint' | 'arc';

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
  /**
   * B-123 (R4 verbatim): the arc's authored terrain — null when unset (C12:
   * the multiplier via scale.terrainMultipliers applies only when authored).
   */
  readonly terrain: Terrain | null;
  /** B-123 (R4 verbatim): the arc's authored distance override — null when unset (D14). */
  readonly authoredDistance: number | null;
  /** B-123 (R4 verbatim): the authored curve control-point list — null when unset (B-111). */
  readonly curveDistances: readonly number[] | null;
  /**
   * B-123: the arc's EDITOR plane (the library) — upsertEdge/removeEdge
   * REPLACE are library-plane commands (D75); overlay `we-` arcs are chat
   * state with no editor command (the B-116 waypoint precedent), so the
   * panel's draft sections never render for one. A `calibrateScale`
   * measurement, by contrast, takes the MERGED set (A-015) — the measure
   * section is offered regardless of the plane.
   */
  readonly library: boolean;
}

/**
 * B-123 (D78/C23): one per-mode EDIT row of the arc panel — the map's mode
 * universe (built-ins ∪ registry ids, insertion order), each rowed with its
 * RESOLVED authored label (the ONE core resolver — `resolveModeLabel`; the
 * UI never maps ids to words itself, R1 spirit for authored words) and the
 * arc's own spec read verbatim. An arc LACKING the key rows as
 * `allowed: false` + `authoredMinutes: null` — C14 row 2's honest display
 * ("not allowed"), priced ∞ per row 2 until the author allows it.
 */
export interface ArcModeRow {
  readonly id: TravelMode;
  /** The authored display word (a built-in's id IS its word; registry relabels win). */
  readonly label: string;
  /** The arc's spec: `allowed === true` ⇔ the arc's key says so — absent key ⇒ false. */
  readonly allowed: boolean;
  /** The arc's authored minutes — null when the key (or the field) is absent. */
  readonly authoredMinutes: number | null;
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
    // B-122 (draw-arc pick): the pending draw SOURCE's accent — the SAME
    // dashed-teal accent language as tme-connect-pick (the packet's "reuse
    // the ACCENT pattern" ruling) under a DISTINCT class, never
    // `tme-selected`: the draw-arc source is picked as an arc endpoint, not
    // selected for editing (the F46 boundary ruling, B-118's twin). Declared
    // AFTER node.tme-connect-pick per the B-111 no-specificity cascade: the
    // two pick accents can never coexist (connect mode owns every node tap
    // while on, and its exit clears its picks — see the tap handler order),
    // so there is no accent it must yield to; like tme-connect-pick it
    // follows the pin/selected/draft entries because the OPERATIVE transient
    // accent owns the border while a pick is pending. No `text-opacity` and
    // no `min-zoomed-font-size` (the B-107/B-113 gotchas): the cull entries
    // are untouched.
    selector: 'node.tme-draw-pick',
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
    // B-128 (D85/F02): the PORTAL badge's depth hue — one visual language
    // with the arc badges (the shared `tme-badge` entry above owns the
    // body/z-index/cull-coherent text sizing; B-115), a DISTINCT color so
    // "there is depth here" reads apart from a cross-layer arc badge. The
    // single overridden property is `color` — the label text IS the badge's
    // visible paint. Declared AFTER the shared base (the cascade's last-match
    // rule, the B-111 precedent) and BEFORE the draft entry, which must keep
    // its ability to override the text hue on a drafted badge (cascade
    // safety, though portal badges never carry tme-draft — the B-121 log
    // stores the NODE id, and `tme-portal-badge-<id>` never matches the
    // draft projection's `tme-badge-<id>` lookup). No `min-zoomed-font-size`
    // (the B-107 hide-floor gotcha, binding).
    selector: 'node.tme-portal-badge',
    style: { color: '#8fd3b6' },
  },
  {
    // B-131 (D94/F55/C34): the BLOCKED-NODE marker's hue — one visual
    // language with the blocked arcs (edge.tme-blocked's dashed red below):
    // the reason text IS the marker's visible paint (`blocked: <reason>`, C2
    // spirit — the payload), the shared `tme-badge` entry above owns the
    // invisible body/z-index/cull-coherent text sizing (badges cull WITH
    // content, B-115). Declared AFTER the shared base per the cascade's
    // last-match rule (no CSS specificity, B-111). Never carries tme-draft
    // (the draft projection's `tme-badge-<id>` lookup cannot match this
    // prefixed id). No `min-zoomed-font-size` (the B-107 hide-floor gotcha,
    // binding).
    selector: 'node.tme-node-blocked-badge',
    style: { color: '#c9564e' },
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
 * B-127 (D86): the rail's zoom step — one multiplicative ×1.25 in (and its
 * exact reciprocal out), the cytoscape zoom()'s own factor convention. A
 * factor, not a UI-displayed number (R1 not engaged); the runtime crops the
 * level to its min/max zoom itself (cytoscape.esm.mjs getZoomedViewport:
 * `zoom > maxZoom ? maxZoom : zoom < minZoom ? minZoom : zoom`), so the
 * command needs no clamp of its own.
 */
const ZOOM_STEP = 1.25;

/**
 * D81: the WIDE-layout query — a MIRROR of the SCSS's 700px row/column
 * switch (map-viewer.component.scss `@media (min-width: 700px)`); the SCSS
 * owns the layout, this only classifies resizes for the preserve/refit
 * matrix. Deliberately never computed from the canvas box. D91: the four
 * panels are overlays and can no longer move the box — on the wide layout
 * the only panel-driven resize left is the editor rail's collapse/expand
 * (the stage grows/shrinks with the rail column); a floater drag changes
 * nothing the RO can see.
 */
const WIDE_LAYOUT_QUERY = '(min-width: 700px)';

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
 * B-131 (D94/F55): the ONE-TAP default block reason — ONE exported
 * definition, both blocking surfaces (the property panel's "Block access"
 * and the arc panel's one-tap) apply it when their reason input is empty;
 * the panels import it, never restate it. Authored vocabulary (C23 — the
 * word that reaches prompts verbatim as the C34 payload), owner-reviewed at
 * packet review; refinement is the adjacent input + tap again (adds-or-
 * restates, the facade contract).
 */
export const DEFAULT_BLOCK_REASON = 'Closed';

/**
 * B-137 (C23): the D79 hint's plain words — the D79 default scale stated
 * (1 px = 1 unit, distance-kind), the explicit-action rule (C13/D44)
 * spoken as guidance, never a block (D10/D30 spirit: informational).
 */
const CALIBRATE_HINT =
  'New map: 1 px = 1 unit. Draw a route and calibrate its scale when you know real distances.';

/**
 * B-131: the blocked-node marker's display offset from its host node, in
 * model units — the shared badge-anchor convention of layer-elements.ts
 * (BADGE_OFFSET, both axes; that module is the pinned bare-Node seam, so
 * the constant is mirrored here rather than exported from it — keep the two
 * in step). LAYOUT, never computed geography (R1 — the BADGE_OFFSET
 * precedent).
 */
const NODE_BLOCK_BADGE_OFFSET = 40;

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
 * B-122 (D78): the BUILT-IN travel-mode ids — the same private trio as the
 * core's TRAVEL_MODES (src/core/model/validate.ts:52, not exported; the
 * CONNECT_EDGE_MODES precedent of naming them here). defaultArcModes' seed
 * list only; registry derivation does the rest.
 */
const BUILT_IN_MODES: readonly TravelMode[] = ['walk', 'car', 'train'];

/**
 * B-118 (C23 plain words): the connect banner's tap feedback. One generic
 * line for every unpickable tap — a container, a node with children, a
 * foreign-layer node (data guard; the projection only shows the active
 * layer), or a cross-layer badge — and one for the source itself.
 */
const CONNECT_BAD_TARGET = 'Only a location, hub or waypoint on this layer can be picked.';
const CONNECT_SELF_TARGET = "The starting place can't connect to itself.";

/**
 * B-128 (D85 — F17 un-fence, C23 plain words): the kept-pick line selectLayer
 * narrates when a draw pick rides a layer switch. Plain words naming the
 * source (the authored label); the fence refusal this replaces is RETIRED —
 * cross-layer arc creation commits now (D85).
 */
const DRAW_PICK_KEPT = (sourceLabel: string): string =>
  `Drawing from ${sourceLabel} — tap where its arc lands`;

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
   * B-137: the map LIBRARY — the save dock's store write seam (the dock's
   * Save persists the current map through library.save AFTER the facade's
   * saveMap). The harness runs the in-memory impl (session-local by
   * design), the host runs the C packet's localforage one (the
   * BACKGROUND_STORE precedent, B-130).
   */
  private readonly library = inject(MAP_LIBRARY);

  /**
   * B-113 (ruling 1): the label-cull threshold — the fit zoom ×
   * LABEL_CULL_FACTOR, recomputed by fitView() after EVERY fit (each re-fit
   * re-bases the threshold on its own fit zoom); NEVER_CULL_ZOOM while there
   * is nothing to fit. A plain field, deliberately NOT a signal (D2: the
   * high-frequency `zoom` event reads it and must never touch Angular state).
   */
  private cullZoom = NEVER_CULL_ZOOM;

  /**
   * D81: the last-seen viewport dimensions — the resize-class discriminator's
   * state. Initialized by mount() and refreshed by EVERY notifyResize(); a
   * container resize whose viewport did not move since last seen is
   * PANEL-DRIVEN, one whose viewport did is ENVIRONMENTAL. Plain fields,
   * deliberately NOT signals: read/written only inside the RO-driven
   * resize path, which stays outside Angular (D2 — the cullZoom precedent).
   */
  private lastViewportW: number | null = null;
  private lastViewportH: number | null = null;

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
   * happens at the next entry). B-122: the third member 'arc' joined — with
   * it active the background/compound-box tap places NOTHING (the gesture
   * cancels the pending pick instead) and leaf taps are draw-arc PICKS (see
   * handleDrawArcTap); the reset/default semantics are unchanged.
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

  /**
   * B-122 (draw-arc): the PENDING SOURCE — the node id of the arc's first
   * tapped endpoint, or null while the tool waits for its first pick. A
   * signal (the connectPicks discipline): the pick accent is a projection of
   * it inside projectSelectionClasses (R3 — the constructor's class effect
   * re-runs per pick change, and every rebuild re-projects it), never a
   * stray style write. Kept across a layer switch (B-128/D85: the switch
   * narrates the kept pick and the cross-layer tap commits — never a
   * cancel); cleared by the commit, a
   * source/background/compound-box tap cancel, a tool switch, editor exit
   * and map load.
   */
  readonly drawArcSourceId = signal<string | null>(null);

  /**
   * B-122 (C23): why the last draw-arc tap needs attention — since B-128
   * (D85) exactly the kept-pick line a mid-pick layer switch narrates ("the
   * pick rides along — its cross-layer commit is legal now") or a C30 commit
   * refusal. The B-122 cross-layer fence line is RETIRED (D85). Rendered by
   * the viewer's draw-arc banner (the connectFeedback precedent:
   * user-visible, never console-only); cleared by the next successful
   * pick/commit and every pick cancel.
   */
  readonly drawArcFeedback = signal<string | null>(null);

  // --- Panel regime (PKG B-119, Q29 / §8 item 3 — generalized by B-133/D91) --

  /**
   * D91 (B-133): ALL FOUR panels (route, arc, property, layer-manager) are
   * floating surfaces over the full-width stage on wide viewports and
   * overlay as bottom sheets on narrow ones — a panel open/close never
   * resizes the stage and never moves the viewport. The regime state below
   * is FRONTEND viewer chrome, in-memory only: the facade carries no command
   * for any of it and must not gain one (§9 puts preferences with the host
   * in Phase 4). The B-119 split stands: each panel component owns its clamp
   * / drag DOM math (the consumer); the service holds signals and read-only
   * projection reads — one remembered position PER PANEL KIND.
   */

  /**
   * B-119: whether the F40 property panel FLOATS (the compact remembered-
   * position form) instead of sitting maximized — under D91 both forms are
   * overlays over the stage: maximized is the tall surface the editor opens
   * by default, floating the compact one at the remembered position.
   * FRONTEND viewer state, in-memory only — the facade carries no command
   * for it (§9: the host owns preferences, Phase 4's persistence; never map
   * data, so no facade/R2/R4 surface). The panel component is the consumer:
   * it writes this signal on its Maximize/Restore toggle (R3, the
   * selection.set precedent), and enterEditor resets it — the editor
   * maximizes by default (§8 item 3).
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
   * D91 (B-133): the route panel's WIDE open state — the auto-float rule.
   * The panel floats whenever it HAS content (a route target selected, or
   * blocked listings in the snapshot projection) and the rail's Route toggle
   * summons it when it has none (a route-count-free empty state renders
   * inside). A linkedSignal keyed on the CONTENT SIGNATURE (selection id +
   * blocked counts): every content change recomputes (auto-float — the
   * narrow sheet's B-114 auto-expand parity), while the toggle's write
   * persists between content changes (the user can close a content-bearing
   * panel and it stays closed until the content changes again). Narrow
   * never reads this: the narrow sheet flow (its always-visible rail + the
   * component-local expand state) is unchanged. Frontend viewer chrome, the
   * panelFloating class.
   */
  readonly routePanelOpen = linkedSignal<string, boolean>({
    source: () => {
      const snapshot = this.snapshot();
      const blocked =
        (snapshot?.routes ?? []).filter((route) => route.blockedReason !== undefined).length +
        (snapshot?.blockedNodes?.length ?? 0);
      return `${this.selection()?.id ?? ''}|${blocked}`;
    },
    computation: (key) => key !== '|0',
  });

  /**
   * D91 (B-133): the route panel's wide summon/close — the rail toggle's
   * single write path (R3, the toggleLayerManager pattern). The next content
   * change recomputes `routePanelOpen` from the auto-float rule (the
   * linkedSignal source).
   */
  toggleRoutePanel(): void {
    this.routePanelOpen.update((open) => !open);
  }

  /**
   * D91 (B-133): the route panel floater's remembered position — the
   * panelPosition precedent, one slot per panel kind. Frontend viewer
   * chrome, viewport px, written once per drag end by the route panel.
   */
  readonly routePanelPosition = signal<{ x: number; y: number } | null>(null);

  /** D91 (B-133): the arc panel floater's remembered position (routePanelPosition precedent). */
  readonly arcPanelPosition = signal<{ x: number; y: number } | null>(null);

  /** D91 (B-133): the layer-manager floater's remembered position (routePanelPosition precedent). */
  readonly layerManagerPosition = signal<{ x: number; y: number } | null>(null);

  /**
   * D91 (B-133): which half of the canvas the current selection's rendered
   * anchor sits on — the floating panels' best-effort avoid-the-selection
   * DEFAULT placement reads this (a panel without a remembered position
   * anchors on the side AWAY from the selection; placement-only, never a
   * pan). The arc anchor resolves exactly as the rescue clamp's
   * selectionAnchor (a projected arc = its box midpoint, a cross-layer arc =
   * its badge box). null when nothing is selected or projected ⇒ the panel
   * takes its neutral default. A discrete-read for template binding (the
   * computed in the panel reads the selection signals first, so this only
   * runs on selection changes — D2).
   */
  selectionRenderedSide(): 'left' | 'right' | null {
    if (this.selection() === null && this.edgeSelection() === null) return null;
    const anchor = this.selectionAnchor();
    if (anchor === null) return null;
    return (anchor.x1 + anchor.x2) / 2 > this.cy.width() / 2 ? 'right' : 'left';
  }

  /**
   * B-116 (F45/D75): bumped by every editor command (place, move), by
   * saveMap, and by loadMap — the ONLY recompute triggers of `unsavedChanges`
   * (no timers, D2: the facade's dirty flag is core state, not a signal, so
   * the computed polls it on this revision counter, the graphRevision
   * precedent). B-123: the counter is PUBLIC now — the arc panel's computed
   * reads it as the recompute dependency for post-command re-reads (the
   * editorRevision precedent set by the route panel's graphRevision dep),
   * and scaleNow mirrors it for the in-place calibration.
   */
  readonly editorRevision = signal(0);

  /**
   * B-116 (F45/D75): the unsaved-changes indicator's state — the core's
   * hasUnsavedChanges() answer (nothing outside the core tracks dirtiness,
   * D75/R1), recomputed only on the editorRevision signal. Until saveMap()
   * runs, routing and the snapshot still serve the SAVED graph — that is the
   * product behavior (F45), not staleness to be hidden.
   */
  readonly unsavedChanges = computed<boolean>(() => {
    void this.editorRevision(); // dependency: place/move/save/load re-read (F45)
    // B-137: the F45 bar describes the LOADED map's dirty state — with no
    // map loaded (the mapless boot, the delete-loaded-map flow) there is
    // nothing to save, and a dock lit for a deleted map would be the C30
    // dishonesty. The facade keeps the last map's state internally (R2: no
    // unload command exists), so the viewer's mapless state gates the read.
    return this.map() !== null && (this.facade?.hasUnsavedChanges() ?? false);
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

  /**
   * B-126 (D82): the layer-manager SHEET's open state. FRONTEND viewer
   * chrome, in-memory only (the B-119 panelFloating class — the facade
   * carries no command for it; §9 reserves preference persistence for
   * Phase 4's host). Written by the Manage affordance's toggle
   * (toggleLayerManager) and the sheet's Escape/X close (the component);
   * loadMap closes it (a fresh map starts unmanaged — the loadMap precedent
   * for stale viewer state). Available in BOTH view and editor modes: every
   * mutation inside is chrome-driven through the facade (dirty + the save
   * dock appear), and D76's "view mode is purely navigational" fences
   * CANVAS gestures, not management chrome. D91: the sheet OVERLAYS the
   * stage on both layouts (a floater on wide, a bottom sheet on narrow) —
   * opening/closing it resizes nothing.
   */
  readonly layerManagerOpen = signal(false);

  /**
   * B-137 (§5 M4/D40): the Maps manager panel's open state — the layer-
   * manager's structural twin (frontend viewer chrome, in-memory only; the
   * facade carries no command for it). Written by the rail's Maps toggle
   * (toggleMapsPanel), the panel's Escape/X close, the mapless boot's
   * auto-open (D40's picker-first journey — the App sets it), and a fresh
   * loadMap closes it (the layerManagerOpen reset precedent — opening a
   * map is the panel's whole point, so the panel gets out of the way).
   * Going MAPLESS (unloadMap) deliberately does NOT close it: the delete-
   * loaded-map flow leaves the user in the picker (the empty state + the
   * panel open is the D40 mapless state).
   */
  readonly mapsPanelOpen = signal(false);

  /** B-137: the rail's Maps summon — the single toggle write path (R3, the toggleLayerManager pattern). */
  toggleMapsPanel(): void {
    this.mapsPanelOpen.update((open) => !open);
  }

  /**
   * B-137 (D40): the character card's map-pointer SUGGESTION (harness
   * stand-in — the real host read lands at Phase 4): the library row id the
   * `?cardmap=` boot param marks. Display-only state: the Maps panel renders
   * a "Suggested by the character card" line on the matching row and
   * NOTHING auto-loads (the user's explicit pick is the only loader, D40).
   * The id never renders (C23) — the panel matches by id and speaks words.
   */
  readonly cardSuggestedMapId = signal<string | null>(null);

  /**
   * B-137: whether a map is currently loaded — the honest gate for map-only
   * affordances (the rail's editor toggle renders DISABLED while mapless:
   * an editor session over an empty backdrop would place nothing — the F07
   * dead-control reasoning, disabled never hidden). An R4 read of the map
   * signal, nothing more.
   */
  readonly hasMap = computed(() => this.map() !== null);

  /**
   * B-137: the loaded map's id, or null when mapless — the Maps panel's
   * delete flow compares it against the deleted row (the loaded map's row
   * going away takes the viewer mapless). An R4 read (C23: ids never
   * render — the panel compares, the words render).
   */
  readonly loadedMapId = computed(() => this.map()?.id ?? null);

  /**
   * B-139 (C25/D41): whether the LOADED map is a FORK — the save-back
   * button's visibility gate, read straight off the held map reference's
   * `forkedFrom` provenance field (R4: the field the engine set at forkMap;
   * a library original carries none and the button is structurally ABSENT —
   * the state here is structural, not a momentary condition, so the F07
   * disabled-never-hidden rule does not pull it in: a fork-save control in a
   * non-fork session would be noise). An absent/empty provenance is no fork.
   * `forkedFrom` never changes in place (forkMap sets it on a FRESH object;
   * loadMap swaps whole objects), so the map signal alone is the recompute
   * dependency — no editorRevision tie needed.
   */
  readonly loadedMapIsFork = computed<boolean>(() => {
    const from = this.map()?.forkedFrom;
    return typeof from === 'string' && from.length > 0;
  });

  /**
   * B-139: the fork family's words channel — the facade's C30 refusals of
   * `forkMap`/`saveForkToLibrary` (verbatim error words, the saveError
   * pattern: the refusal lives next to the state it describes; the Maps
   * panel renders it) and the library-store failure of the save-back (the
   * saveMapToLibrary precedent: a store rejection surfaces through the same
   * user-visible channel, never an uncaught throw — C32). Both fork commands
   * clear it at entry, so a retried action never shows yesterday's words.
   */
  readonly forkError = signal<string | null>(null);

  /** B-139: the fork channel's clear affordance — the panel's close calls it (the error.set(null) discipline). */
  clearForkError(): void {
    this.forkError.set(null);
  }

  /** The latest facade snapshot (R1: every header string originates here). */
  readonly snapshot = signal<MapSnapshot | null>(null);

  /**
   * Switcher labels derived from the loaded map — names never hardcoded.
   * B-126 (C24): the layer commands mutate `map.layers` IN PLACE (push on
   * create, splice/reassign on delete, reassign on reorder), so the
   * editorRevision counter (bumped by every layer wrapper) is the recompute
   * dependency — the modeRows/scaleNow precedent for in-place map reads.
   */
  readonly layerNames = computed((): readonly LayerLabel[] => {
    void this.editorRevision(); // dependency: a layer create/delete/reorder re-reads (C24)
    return (this.map()?.layers ?? []).map((layer) => ({ id: layer.id, name: layer.name }));
  });

  /**
   * F03/D84: the active layer's background reference (assetId or URL arm), or null when it has none.
   * B-130 (C24): setLayerBackground replaces the layer OBJECT in place
   * (map.layers[index] = fresh — the D75 seam), so the editorRevision bump
   * is the recompute dependency (the layerNames precedent). The returned
   * string is the `<img>` src verbatim — both arms feed the same rendering
   * path ("two sources, one rendering path", D84): a URL arm's URL, or the
   * stored assetId (the BackgroundStore contract makes the key a directly
   * loadable src — the harness store's key IS its object URL;
   * src/app/graph/background-store.ts).
   */
  readonly activeBackground = computed((): string | null => {
    void this.editorRevision(); // B-130 (C24): the in-place layer swap re-reads
    const layer = this.map()?.layers.find((l) => l.id === this.activeLayer());
    const background = layer?.background;
    if (background === undefined) return null;
    return 'assetId' in background ? background.assetId : background.url;
  });

  /**
   * B-130 (D84/C32): the background <img>'s load-failure view state — true
   * while the CURRENT src failed to load, hiding the img (the degrade is
   * "no background", never a broken-image glyph over the canvas; the node
   * graph stays the interface regardless, F03). Cleared by the constructor
   * effect on ANY src change — a retry succeeds silently. Plain view state,
   * not truth: the truth is the map's background reference (activeBackground).
   */
  readonly backgroundFailed = signal(false);

  /**
   * B-128 (D85/F02): the ACTIVE layer's breadcrumb chain, root → active,
   * each crumb as id + authored NAME (C23 — the words render, the id is the
   * tap key). Derives from the portal wiring through the pure
   * `breadcrumbChain` (no separate parent field, D85; cycles are legal data
   * and just end the chain). Empty while no map/layer — the viewer renders
   * the bar only when the chain is longer than one (a root layer has no bar).
   * Computed over DISCRETE signals only (D2): activeLayer (a switch re-reads)
   * and editorRevision (in-place wiring/renames re-read — C24, the
   * layerNames precedent). A crumb whose layer vanished degrades out of the
   * rendered row (C32 spirit) — the pure walk can only emit known layers,
   * but the name join assumes nothing.
   */
  readonly breadcrumb = computed((): readonly { id: string; name: string }[] => {
    void this.editorRevision(); // dependency: an in-place wiring/rename re-reads (C24)
    const map = this.map();
    const layerId = this.activeLayer();
    if (map === null || layerId === null) return [];
    return breadcrumbChain(map, layerId)
      .map((id) => ({ id, name: map.layers.find((layer) => layer.id === id)?.name ?? '' }))
      .filter((crumb) => crumb.name !== '');
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
   * B-123: the blockArc C30 catch's refusal — the field-precise message the
   * arc panel renders (the save-refusal pattern, user-visible and never
   * console-only). Written only when a Block is REFUSED (nothing was
   * mutated); cleared by the next successful block/lift and when the panel
   * leaves the arc (clearArcBlockRefusal). null when nothing failed.
   */
  readonly arcBlockRefusal = signal<string | null>(null);

  /**
   * B-131 (D94/F55): the blockNode C30 catch's refusal — the field-precise
   * message the property panel renders (the arcBlockRefusal pattern,
   * user-visible and never console-only). Written only when a Block access
   * is REFUSED (nothing was mutated — the A-018 saved-plane gate refuses an
   * UNSAVED placed node field-precisely, the B-121 lesson); cleared by the
   * next successful block/lift and when the panel leaves the node
   * (clearNodeBlockRefusal). null when nothing failed.
   */
  readonly nodeBlockRefusal = signal<string | null>(null);

  /**
   * B-105 (ruling 3): mirror of `overlay.travelMode` — the mode switch's
   * active highlight. loadMap seeds it from the live overlay; the ONLY other
   * writer is setTravelModePreference, which keeps it in lockstep with the
   * facade command (R2 — the service itself never mutates the overlay).
   */
  readonly travelMode = signal<TravelMode>('walk');

  /**
   * B-124 (B-105 ruling 3, D78/C23): the route panel's mode switch ROWS —
   * the loaded map's mode universe (built-ins ∪ registry ids, insertion
   * order — the arcModesOf discipline, via modeUniverseIds) rowed with the
   * ONE core resolver's words (`resolveModeLabel`; the UI never maps ids to
   * words itself, R1 spirit for authored words). On a no-registry map this
   * is exactly the built-in trio with the bare built-ins' own words (their
   * ids ARE their words — C23); a registry relabels or extends it. A
   * computed over DISCRETE signals only (D2): the map signal (a load
   * re-reads) and editorRevision (an in-place registry mutation re-reads —
   * C24, the scaleNow precedent; no registry editor exists yet, the dep
   * costs nothing). `travelMode` is deliberately NOT a dependency: the rows
   * are map data — the active highlight compares the travelMode signal in
   * the template (the tme-active projection, R3). Empty before loadMap (no
   * map, no universe — the switch renders no buttons; the panel is never
   * shown pre-load).
   */
  readonly modeRows = computed((): readonly { id: TravelMode; label: string }[] => {
    void this.editorRevision(); // dependency: an in-place registry edit re-reads (C24)
    const map = this.map();
    if (map === null) return [];
    return this.modeUniverseIds(map).map((id) => ({ id, label: resolveModeLabel(id, map.modes) }));
  });

  /**
   * B-124: the travel-mode preference switch's C30 refusal surface (the
   * saveError/arcBlockRefusal pattern). Every rendered row id is valid
   * against the loaded map's universe by construction (the facade's
   * setTravelMode validates against the SAME map, C30), so the throw is the
   * degrade path only (no map loaded, a runtime caller bypassing the type
   * system) — but the surface must exist: the message is caught and rendered
   * user-visibly by the route panel, never an uncaught console throw (C32).
   * Cleared by the next successful switch.
   */
  readonly travelModeRefusal = signal<string | null>(null);

  /**
   * The map's mode universe in ROW ORDER — built-ins first, then the
   * registry's declaration order, a registry entry adopting a built-in id
   * deduplicated to its first occurrence (arcModesOf's insertion-order
   * discipline, B-123; ONE helper so the switch rows and the arc panel's
   * per-mode rows can never drift apart).
   */
  private modeUniverseIds(map: WorldMapData): TravelMode[] {
    const ids: TravelMode[] = [];
    const seen = new Set<string>();
    for (const id of [...BUILT_IN_MODES, ...(map.modes ?? []).map((decl) => decl.id)]) {
      if (seen.has(id)) continue; // a replica mode of an id built-in: one row ever
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }

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
      // B-135 (D93): calibrate owns EVERY canvas gesture while it is on — a
      // tap selects nothing and places nothing (the tap-vs-drag discipline;
      // the drag handlers below own movement). The gate sits above every
      // other mode, connect included.
      if (this.calibrateMode()) return;
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
      // B-122 (§5 M2 draw-arc): with the Arc tool active an editor-mode node
      // tap is a PICK or a commit, NEVER a selection (F46 boundary ruling —
      // the quick-connect precedent) — the branch sits ABOVE the badge and
      // parent paths so a badge tap is a no-op that keeps the pick (badges
      // are never endpoints) and a compound-box tap cancels it. View mode
      // keeps today's behavior byte-identical (the tool renders only in the
      // editor, D76).
      if (this.editorMode() && this.editorTool() === 'arc') {
        this.handleDrawArcTap(node);
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
      // B-135 (D93): calibrate owns the gesture — no selection (see the node gate).
      if (this.calibrateMode()) return;
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
        // B-135 (D93): calibrate owns the gesture — a tap places nothing and
        // clears nothing (see the node gate).
        if (this.calibrateMode()) return;
        // B-118: while connecting a background tap neither places a node nor
        // dismisses the selection — both would orphan the mode mid-pick (the
        // placement would select a NEW node; the dismissal would close the
        // panel). The banner's Done/Cancel own the exit.
        if (this.connectMode()) return;
        if (this.editorMode()) {
          // B-122: with the Arc tool active the editor background tap is
          // NEVER a placement — the tool owns the gesture; it cancels the
          // pending pick (a no-op when none is pending, C32 spirit).
          if (this.editorTool() === 'arc') {
            this.clearDrawPick();
            return;
          }
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
      // B-135 (D93): calibrate makes nodes ungrabbable for the session (the
      // entry's autoungrabify — nodes are read-only), so `free` cannot fire;
      // the gate is the belt (never a node-coordinate write while
      // calibrating — "never touches node coordinates", D93).
      if (this.calibrateMode()) return;
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
    this.cy.on('zoom pan', () => {
      // B-113 (§5 M4 label culling, §6.1 dense row): `zoom` is a Core
      // GraphEventName in the installed @types/cytoscape 3.21.9
      // (index.d.ts:5387 — "when the viewport is zoomed"), and the runtime
      // streams it for every user zoom (pinch/scroll) AND every programmatic
      // viewport change — cy.fit emits 'pan zoom viewport'
      // (cytoscape.esm.mjs:19478). D2: this is a HIGH-FREQUENCY event, so the
      // handler writes NO signals and no change detection — applyLabelCull
      // reads two scalars and, only on a threshold crossing, toggles one
      // class inside cy.batch (one render pass).
      //
      // B-134 (D92): `pan` joins the same registration ("when the viewport is
      // panned", index.d.ts:5378) — a pan-only gesture emits `pan` without
      // `zoom`, so the background transform must ride both names. The
      // application is the cull precedent's DIRECT event work, never a signal
      // write: the registered viewer callback reads the placement × live
      // viewport and styles the img (idempotent, one pass).
      this.applyLabelCull();
      this.applyBackgroundTransform();
    });

    // B-128 (D85/F02): the portal ENTRY GESTURE — double-activation on a
    // portal badge switches the viewport to the badge's target layer (F02's
    // fixed gesture; D85 fences nothing — available in BOTH modes; a kept
    // draw pick narrates through selectLayer). Verified against the installed
    // runtime: the mouse double-click trigger fires BOTH event names
    // (cytoscape.umd.js:26441 `["dblclick", "dbltap", "vdblclick"]`), the
    // touch double-tap fires dbltap (:27431) — so one handler serves both
    // worlds (D53) and a desktop double-click may invoke it twice; re-entry
    // is an idempotent selectLayer of the SAME target (a repeated fit), the
    // ponytail answer to the double-name overlap. `EventNames` is plain
    // `string` (@types/cytoscape 3.21.9 index.d.ts:3719), so the names are
    // type-honest as written. Single taps stay no-ops — the two taps of a
    // double never select anything (the tme-badge branch above swallows them:
    // portal badges carry no `arcId`), so the gesture is the ONLY surface.
    // A discrete double-activation writes signals only through selectLayer (D2).
    this.cy.on('dblclick dbltap', 'node.tme-portal-badge', (event) => {
      // B-135 (D93): calibrate owns the gesture — a double-activation never
      // switches layers mid-calibration (the session is bound to one layer).
      if (this.calibrateMode()) return;
      this.enterPortal(event.target as NodeSingular);
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

    // B-130 (C32): the background img re-arms on ANY src change — a layer
    // switch, a set, a remove. The failed flag belongs to the src that
    // failed it; a fresh src gets a fresh load (and its own error handler
    // pass if IT fails). One discrete read per background change (D2).
    effect(() => {
      void this.activeBackground(); // dependency: the src changed
      this.backgroundFailed.set(false);
    });

    // B-135 (D93): the calibrate session's exit guard (the connectMode guard
    // precedent — the mode is a projection of the substrate it presumes).
    // The session is bound to ONE (layer, background src) pair, snapshotted
    // at entry: a layer switch, a loadMap, a background set/remove (the D93
    // fresh-start — the thing being calibrated is gone) or a failed load
    // (the C32 degrade) ends it CANCEL-flavored (an uncommitted drag draft
    // is discarded; committed gestures stand — there is no undo to run,
    // F46). Every read is a discrete-write signal, so the effect runs per
    // discrete event only (D2); exitCalibrate writes a signal this effect
    // reads, so it re-runs once more and finds the guard false — a stable
    // single pass.
    effect(() => {
      if (!this.calibrateMode()) return;
      if (
        this.map() === null ||
        this.activeLayer() !== this.calibrateLayerId ||
        this.activeBackground() !== this.calibrateBackgroundSrc ||
        this.backgroundFailed()
      ) {
        this.exitCalibrate(false);
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
    this.clearDrawPick(); // B-122: a pending pick is the same class of stale state — cleared with the selections
    this.layerManagerOpen.set(false); // B-126: a fresh map starts unmanaged — the sheet closes with the selections
    this.mapsPanelOpen.set(false); // B-137: a fresh map closes the picker — the map is the point (D40)
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
    // B-134 (D92): the loadMap compute site — any pending authoring moment
    // dies with the old map, the held default recomputes for the first layer
    // (compute-AND-HOLD: never persisted here — an unedited map never opens
    // dirty, D75), and one transform pass follows (a no-op pre-mount).
    this.pendingPlacementLayer = null;
    this.recomputeHeldDefault();
    this.applyBackgroundTransform();
    this.rebuildElements();
    this.refreshSnapshot();
    // B-120 (R21 ruling 1): loadMap deliberately has NO fit of its own — the
    // harness loads before mount(), so mount()'s fit covers the first view.
    // NOTE: a loadMap-while-MOUNTED (the Phase 4 map switch) will need its
    // own explicit fit decision then — out of scope here.
  }

  /**
   * B-137 (D40): attach the facade WITHOUT a map — the harness MAPLESS boot
   * (`?map=none`) creates the facade but never calls loadMap; the Maps
   * panel's Open/New flows load through it later (openMapFromLibrary). The
   * same object the App created — one facade, one truth (R4); only the map
   * lifecycle is deferred. Unreachable from the real host boot (it always
   * has a map or defers to the picker at Phase 4 wiring).
   */
  attachFacade(facade: MapFacade): void {
    this.facade = facade;
  }

  /**
   * B-137 (§5 M4): OPEN one library map — the panel's per-row command. The
   * overlay is FRESH per load (the app.ts boot shape): mapId = the map's
   * id, `currentLocationId: null` — a loaded map starts with NO PIN (D40's
   * explicit pick: the user sets the pin; the C27 degraded snapshot is the
   * honest first state), walking, empty universes. The CALLER owns the
   * copy discipline: the library's get() resolves an independent object
   * (the displayMap doctrine — the facade gets its own; the store keeps
   * its own), so handing it straight through is safe (no aliasing with the
   * stored row). The facade validates (reject-before-mutate — a refused
   * load leaves the prior state untouched) and then this.loadMap resets the
   * viewer exactly as every load does (selections, drafts, panels close).
   * The ONE fit afterwards is a USER-command fit (the selectLayer class —
   * D10: a user command is a legitimate fit trigger; the headless no-op is
   * free): a picker-opened map must present fitted, not at the stale
   * viewport of whatever was on screen before.
   */
  openMapFromLibrary(map: WorldMapData): void {
    const facade = this.facade;
    if (facade === null) return; // no core to load into — degrade (C32 spirit; unreachable via the panel)
    const overlay: ChatMapOverlay = {
      mapId: map.id,
      currentLocationId: null, // D40: a loaded map starts with NO pin — the user sets it
      travelMode: 'walk',
      userNodes: [],
      userEdges: [],
      blocked: {},
      nodeBlocked: {},
    };
    facade.loadMap(map, overlay); // R2: the facade owns the map lifecycle
    this.loadMap(map, overlay, facade); // R4: same references, the viewer resets
    this.fitToView(); // the user-command fit (the selectLayer precedent; headless no-op)
  }

  /**
   * B-139 (C25/D41, PKG fork UX): FORK one library map — the per-row Fork =
   * "open X then `forkMap()`", one user action (the lead's R27 sequence: the
   * chat-attached copy starts from the LIBRARY state; C25's "switches the
   * chat's reference" is forkMap's in-place overlay re-point). Legal on any
   * row, including the LOADED fork's own row — a fork-of-fork is A-022's
   * documented no-special-case. Returns true when the fork session stands;
   * false on the first refusal, whose words ride `forkError` (never an
   * uncaught throw — C32).
   *
   * THE REFERENCE QUESTION (the fork engine's one §9 seam gap, resolved
   * WITHOUT reaching around the facade — CORE.md's closing rule; this
   * service's own law also forbids the `facadeStateOf` diagnostic): after
   * `forkMap()` the engine serves a PRIVATE structured-clone under the fresh
   * id and returns nothing (void), while the service's projections,
   * `loadedMapId`, `loadedMapIsFork` and every later editor command MUST read
   * the fork, not the stale parent reference. `saveForkToLibrary()` (D97)
   * hands back the fork AS IT STANDS, detached, and is legal here (the loaded
   * map just became a fork) — and `loadMap` is §9's OWN reference-doctrine
   * command (it stores the CALLER's object verbatim, validator pass-through
   * returns the same reference). So the fork object the service holds is
   * re-established THROUGH the §9 list: forkMap → saveForkToLibrary (the
   * read-back) → loadMap(forkCopy) → the twin `this.loadMap` re-point. No
   * §9 command is invented, no engine semantics re-implemented, no `forked*`
   * guesses in this file. Byte-equal end state to the held clone (same id,
   * same saved universes, dirty=false, provenance) at one extra clone+validate
   * per explicit user action. C25 stands: the parent object is never re-held
   * after forkMap (the detach), the library row never receives a fork edit,
   * and the second loadMap re-affirms pin-null walk state byte-identically.
   *
   * THE PICKER STAYS OPEN (documented pick): the inner `this.loadMap` closes
   * `mapsPanelOpen` (its shared reset), and this wrapper re-opens it right
   * after — same synchronous batch, never a rendered flicker — because the
   * user picks from the list. The one user-command fit runs once, at the end.
   * A mid-dance failure (validator-refusing the read-back — practically
   * impossible: it is the validated parent's exact clone plus two engine-set
   * fields) leaves the facade serving its own valid fork clone while the
   * service never re-pointed: the next explicit Open/New/fork re-establishes
   * references; the words state what happened.
   *
   * @returns true on success; false with `forkError` words on any refusal.
   */
  forkFromLibrary(map: WorldMapData): boolean {
    const facade = this.facade;
    if (facade === null) return false; // no core — the openMapFromLibrary silent degrade
    this.forkError.set(null); // a retried fork never shows the last attempt's words
    const overlay: ChatMapOverlay = {
      mapId: map.id,
      currentLocationId: null, // D40: the fresh session starts with NO pin — the user sets it
      travelMode: 'walk',
      userNodes: [],
      userEdges: [],
      blocked: {},
      nodeBlocked: {},
    };
    try {
      facade.loadMap(map, overlay); // the parent load (reject-before-mutate) — the fork copies the freshly loaded library state
      facade.forkMap(); // the C25 switch: the engine's private clone + THIS overlay object re-pointed in place
      const fork = facade.saveForkToLibrary(); // D97: the fork as it stands, detached — the §9 read-back
      facade.loadMap(fork, overlay); // §9 loadMap = THE reference command (C24): the facade now holds THE CALLER'S object
      this.loadMap(fork, overlay, facade); // R4: the service holds the same references — the full viewer reset
      this.fitToView(); // ONE user-command fit for the whole action (the open-path precedent)
    } catch (error) {
      this.forkError.set(error instanceof Error ? error.message : `Forking failed: ${String(error)}`);
      return false;
    }
    this.mapsPanelOpen.set(true); // the picker stays open (documented pick above)
    return true;
  }

  /**
   * B-139 (D97 — the D41 explicit, non-default save-back): persist the
   * LOADED fork's save-moment snapshot into the LIBRARY under the fork's OWN
   * id/name (the fork id IS its library id v1; `library.save` upserts by it —
   * a re-save of the same fork replaces its row, nothing else). NOT bundled
   * into any save/dock flow: this is its own command, offered only while the
   * loaded map is a fork (the `loadedMapIsFork` gate). The chat's fork keeps
   * diverging afterwards — the stored row is the save moment (D97), and
   * `saveForkToLibrary` moves NO facade state (no dirty clear, no saved-plane
   * move, no re-point). The returned copy is PERSISTENCE DATA (the store
   * keeps its own clone), never held as a live reference (R4: one truth —
   * the library is a store). Returns true on success; false on any refusal
   * with the words in `forkError` (C32).
   *
   * @returns true on success; false with `forkError` words on any refusal.
   */
  async saveForkBackToLibrary(): Promise<boolean> {
    const facade = this.facade;
    if (facade === null) return false; // no core — the structural silence of the openMapFromLibrary degrade
    this.forkError.set(null); // a retried save never shows the last attempt's words
    let snapshot: WorldMapData;
    try {
      snapshot = facade.saveForkToLibrary(); // D97: the detached save-moment snapshot (the field-precise not-a-fork refusal is structurally dead behind the button gate — still caught: C32)
    } catch (error) {
      this.forkError.set(error instanceof Error ? error.message : `Saving the fork back refused: ${String(error)}`);
      return false;
    }
    try {
      await this.library.save(snapshot); // upsert by the fork's OWN id/name — the D97 host pick
    } catch (error) {
      this.forkError.set(
        error instanceof Error ? error.message : `Saving the fork to the map library failed: ${String(error)}`,
      );
      return false;
    }
    return true;
  }

  /**
   * B-137 (D40): go MAPLESS — the no-map state of the mapless boot, reached
   * at runtime when the Maps panel deletes the LOADED map's row. The
   * viewer's whole map-dependent state resets (the loadMap reset class):
   * references dropped, selections and drafts cleared, editor mode exited
   * (an editor session over an empty backdrop is an invisible affordance —
   * placing has no layer to land in), snapshot null (the header degrades to
   * empty strings, C32), the canvas emptied (rebuildElements' null-map
   * guard returns EARLY — the stale projection would keep painting), the
   * background transform cleared (the img unmounts with activeBackground).
   * The facade is KEPT attached: it holds no user-visible truth while the
   * viewer is mapless (the dock's unsavedChanges gate reads hasMap), and
   * the next Open/New replaces its state wholesale (reject-before-mutate's
   * clean-slate template). The Maps panel is deliberately NOT closed — the
   * user is in it; the empty-library/picker state is where they stand.
   */
  unloadMap(): void {
    this.exitCalibrate(false); // a calibrate session over a deleted map dies with it (the guard effect's class)
    this.map.set(null);
    this.overlay = null;
    this.travelMode.set('walk');
    this.selection.set(null);
    this.edgeSelection.set(null);
    this.clearDrawPick();
    this.exitEditor(); // mapless has nothing to edit — the honest reset
    this.unsavedIds.clear();
    this.editorRevision.update((n) => n + 1);
    this.saveError.set(null);
    this.activeLayer.set(null);
    this.snapshot.set(null);
    this.cy.batch(() => {
      this.cy.elements().remove(); // the null-map rebuild guard returns early — clear by hand
    });
    this.pendingPlacementLayer = null;
    this.recomputeHeldDefault();
    this.applyBackgroundTransform();
  }

  /**
   * B-137 (§5 M4): the save dock's Save — the facade's explicit save (the
   * saved plane moves, C24 untouched) FOLLOWED BY the library store write
   * of the current map (the store keeps its own copy — the harness impl
   * clones on save, so the stored row is the saved state, never a live
   * alias). A facade C30 refusal short-circuits (saveError already
   * surfaced it; nothing to store); a STORE failure surfaces through the
   * same user-visible saveError channel — never an uncaught throw (C32),
   * and the map stays dirty (the dock keeps its state). No map loaded is a
   * no-op (C30 honesty — structurally unreachable from the dock, whose
   * dirty gate requires a loaded facade, but the guard keeps the command
   * honest for any caller).
   */
  async saveMapToLibrary(): Promise<void> {
    const map = this.map();
    if (map === null) return; // no map — nothing to save (C30 honesty)
    this.saveMap(); // the facade's explicit save — refusals land in saveError
    if (this.saveError() !== null) return; // the facade refused — nothing to store
    try {
      await this.library.save(map);
    } catch (error) {
      this.saveError.set(
        error instanceof Error ? error.message : `Saving to the map library failed: ${String(error)}`,
      );
    }
  }

  // --- B-137 (D79): the one-time calibrate hint --------------------------------

  /**
   * B-137 (D79): the map ids created THIS SESSION through the panel's
   * New-map flow (markFreshlyCreatedMap) and not yet calibrated out. The
   * hint shows only while the LOADED map is in this set — boot-seeded,
   * library-opened, and duplicated maps never show it (only a NEW map
   * carries the D79 default scale the hint speaks about). Session-memory
   * is fine for v1 (the packet's ruling).
   */
  private readonly freshlyCreatedMapIds = signal<ReadonlySet<string>>(new Set());

  /** B-137 (D79): the per-map, per-session dismissal record (the signal re-renders the hint, R3). */
  private readonly calibrateHintDismissedIds = signal<ReadonlySet<string>>(new Set());

  /**
   * B-137 (D79): the hint's state — the plain words while the LOADED map
   * was freshly created this session and is neither dismissed nor
   * calibrated, else null. A computed over discrete signals only (D2): the
   * map signal (a load re-reads), the fresh set (create arms it;
   * clearCalibrateHintForLoadedMap removes the id on a successful
   * calibrateScale — THAT signal write is the calibrate recompute trigger),
   * and the dismissed set (a dismiss writes).
   */
  readonly calibrateHint = computed<string | null>(() => {
    const map = this.map();
    if (map === null) return null;
    if (!this.freshlyCreatedMapIds().has(map.id)) return null;
    if (this.calibrateHintDismissedIds().has(map.id)) return null;
    return CALIBRATE_HINT;
  });

  /** B-137: arm the hint for a just-created map (the panel's New flow, before it opens the map). */
  markFreshlyCreatedMap(mapId: string): void {
    this.freshlyCreatedMapIds.update((ids) => new Set(ids).add(mapId));
  }

  /** B-137: the hint's Dismiss — one discrete tap (R3), per-map, session-memory (D79). */
  dismissCalibrateHint(): void {
    const mapId = this.map()?.id;
    if (mapId === undefined) return;
    this.calibrateHintDismissedIds.update((ids) => new Set(ids).add(mapId));
  }

  /**
   * B-137 (D79): calibrating clears the hint — the user has done the thing
   * it suggested. ANY calibrateScale command qualifies; measureArc is the
   * service's one calibrateScale passthrough, so the clear lives at its
   * success site (a refusal changes nothing — no calibration happened).
   */
  private clearCalibrateHintForLoadedMap(): void {
    const mapId = this.map()?.id;
    if (mapId === undefined) return;
    this.freshlyCreatedMapIds.update((ids) => {
      if (!ids.has(mapId)) return ids; // no write when absent — no spurious recompute
      const next = new Set(ids);
      next.delete(mapId);
      return next;
    });
  }

  /** D3: attach the headless instance to a DOM host and size it. */
  mount(el: HTMLElement): void {
    this.cy.mount(el);
    this.cy.resize();
    this.mounted = true;
    // D91: the discriminator's baseline — the first notifyResize compares
    // against THIS snapshot, so its initial RO fire (same viewport) reads as
    // panel-driven and takes the preserve path on wide: harmless, mount's
    // fit below already covered it and no selection exists yet.
    this.lastViewportW = window.innerWidth;
    this.lastViewportH = window.innerHeight;
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

  // --- B-127 (D86/F53): the rail's viewport commands --------------------------
  // The zoom trio's write paths (R2 spirit: viewer state, no facade command —
  // zoom/pan are cy-level viewport state like the user's own wheel/pinch, so
  // the rail buttons are the same gesture class). All three write NO signals
  // and log nothing (D2 — the notifyResize class): cy.zoom()/cy.fit emit the
  // core `zoom` event, whose B-113 handler (applyLabelCull) and B-134
  // background application are the only followers and themselves write no
  // signals.

  /**
   * B-127 (D86): zoom IN one ×1.25 step about the VIEWPORT CENTER (the rail
   * button has no cursor position to honor — the center is the neutral
   * anchor). Verified against @types/cytoscape 3.21.9 index.d.ts:751-755 —
   * `zoom({ level, renderedPosition })` zooms keeping the given RENDERED
   * point fixed (renderedPosition is canvas-relative px). The runtime crops
   * the level to its min/max zoom and no-ops when the cropped level equals
   * the current one (the clamp's own behavior — C32 spirit, never a throw).
   */
  zoomIn(): void {
    this.zoomByCenter(ZOOM_STEP);
  }

  /** B-127 (D86): zoom OUT one step — the exact reciprocal (÷1.25). */
  zoomOut(): void {
    this.zoomByCenter(1 / ZOOM_STEP);
  }

  /** B-127: the shared step — one multiplicative factor about the center. */
  private zoomByCenter(factor: number): void {
    if (!this.mounted) return; // headless has no viewport to zoom (C32 spirit)
    this.cy.zoom({
      level: this.cy.zoom() * factor,
      renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 },
    });
  }

  /**
   * B-127 (D86): the PUBLIC user Fit command — the rail's Fit button. It
   * calls the ONE internal fit site (fitView, B-120's single-site ruling
   * refined by D81: a user command is a legitimate new fit TRIGGER — the user
   * is the authority, D10 — while fitView stays the only fit SITE, re-basing
   * the cull threshold inside it, B-113 ruling 1). Instant, signal-free (D2).
   */
  fitToView(): void {
    if (!this.mounted) return; // headless has no viewport to fit (C32 spirit)
    this.fitView();
  }

  /**
   * B-128 (D85/F02): the portal entry gesture's write path — a viewport
   * switch ONLY (the fixed F02 ruling): selectLayer of the badge node's
   * wired target. Routing, the snapshot and the pin are layer-agnostic and
   * untouched (D16/F02 restated); selectLayer's explicit fit stands (D85:
   * the D81 fit-site list unchanged). The target is re-read off the LIVE
   * map at gesture time by the badge's `nodeId` data (never parsed out of
   * the pseudo-node id — the B-108 precedent): a stale badge whose node was
   * deleted or unwired mid-rebuild, or whose target layer is gone (both
   * unreachable through the facade, but the reference read assumes nothing),
   * degrades to a no-op (C32 spirit).
   */
  private enterPortal(node: NodeSingular): void {
    const map = this.map();
    if (map === null) return; // no core behind the gesture (C32 spirit)
    const nodeId: unknown = node.data('nodeId');
    if (typeof nodeId !== 'string' || nodeId.length === 0) return;
    const wired = map.nodes.find((nd) => nd.id === nodeId);
    const target = wired?.portal;
    if (wired === undefined || target === undefined) return; // stale badge — no-op (C32 spirit)
    if (!map.layers.some((layer) => layer.id === target)) return;
    this.selectLayer(target);
  }

  /**
   * Switch the visible layer: through the facade (R2 — it validates the id
   * and owns viewer state), then mirror into the signal and rebuild the
   * projection. B-120 (R21 ruling 1): the layer switch keeps its refit —
   * EXPLICITLY here, no longer riding rebuildElements' tail (which never
   * fits now): a fresh layer's default view is the fitted, label-visible
   * one (fitView also re-bases the cull threshold, B-113 ruling 1).
   * B-128 (D85 — the F17 un-fence, half a): a pending draw pick is KEPT
   * across the switch (never silently cancelled) and the banner narrates
   * the kept pick in plain words — the target tap on this new layer now
   * COMMITS cross-layer (handleDrawArcTap; C3 badges it). A pick whose
   * source vanished (the orphan case commitDrawArc already cancels on)
   * narrates nothing (degrade, never a false promise, C32/C23 spirit).
   */
  selectLayer(layerId: string): void {
    this.facade?.setActiveLayer(layerId);
    this.activeLayer.set(layerId);
    // B-134 (D92): the layer-switch compute site — the same discipline as
    // loadMap: a pending authoring moment belongs to ONE layer (a switch
    // abandons it), the new layer's default recomputes INTO APP STATE only
    // (never persisted here, D75), and the transform follows. Placed before
    // fitView so the fit's own zoom event applies the FRESH facts.
    this.pendingPlacementLayer = null;
    this.recomputeHeldDefault();
    this.applyBackgroundTransform();
    const sourceId = this.drawArcSourceId(); // B-128: the mid-pick switch keeps its pick
    if (sourceId !== null) {
      const source = this.map()?.nodes.find((nd) => nd.id === sourceId);
      if (source !== undefined) this.drawArcFeedback.set(DRAW_PICK_KEPT(source.label));
    }
    this.rebuildElements();
    this.fitView();
    this.refreshSnapshot();
  }

  /**
   * B-105 (ruling 3): the travel-mode preference switch's write path — the
   * row ids come from `modeRows` (B-124: the map's mode universe, no
   * hardcoded trio — F32/D19: there is no persistent vehicle state, and
   * D60(a) already falls back per arc, so there is no 'auto' option to
   * offer). R2: the facade command is the ONLY mutation; the service then
   * mirrors its signal, refreshes the snapshot (the header re-prices) and
   * rebuilds the projection. B-108 (finding 2, D60(a)/F32/D72): the rebuild
   * is what re-prices the BADGES — their labels are frozen strings computed
   * only in badgeRoutes inside rebuildElements (the route panel re-prices
   * via its travelMode dependency; badges have no such dependency), and it
   * re-applies the selection accents so an open arc panel keeps its accent
   * across the element swap (B-106).
   * B-124 (C30/C32): the facade's setTravelMode validates against the
   * loaded map's mode universe — the SAME map the rows render — so a
   * refusal is the degrade path only (no map loaded; a runtime caller
   * bypassing the type system); it is caught and surfaced user-visibly
   * through `travelModeRefusal` (never an uncaught throw), and the C30
   * reject-before-mutate contract means NOTHING is mirrored or re-priced.
   * A facade-null call keeps the B-105 degrade: the mirror still follows
   * the requested id (no core to contradict it), the rest no-ops.
   */
  setTravelModePreference(mode: TravelMode): void {
    const facade = this.facade;
    if (facade !== null) {
      try {
        facade.setTravelMode(mode);
      } catch (error) {
        this.travelModeRefusal.set(error instanceof Error ? error.message : String(error));
        return; // C30 refusal: nothing happened — no mirror, no re-price
      }
    }
    this.travelModeRefusal.set(null);
    this.travelMode.set(mode);
    this.refreshSnapshot();
    this.rebuildElements();
  }

  /**
   * B-106 (ruling 4), extended by B-123: chat-scoped block with a reason
   * (F14/D20). R2: the ONLY mutation is the facade command —
   * setBlocked(edgeId, reason) validates (C30 non-empty reason, unknown edge
   * id) and writes overlay.blocked. Then the revision bump re-routes the
   * sidebar (route computed dependency), the rebuild re-projects the dashed
   * class (buildLayerElements reads the merge) and the snapshot refresh
   * re-lists pin-incident blocked arcs (C19). The panel's Block button is
   * disabled on an empty reason, so the C30 empty-reason throw is
   * structurally out of reach HOWEVER — the OTHER C30 refusals of the ADD
   * path are NOT: the A-014 saved-plane gate refuses an UNSAVED library arc
   * ("unsaved — save the map first"), exactly the freshly drawn arc of
   * B-122 — B-121 found this throwing UNCAUGHT (a console error), and this
   * packet's inheritance fixes it: the refusal is caught, surfaces
   * field-precise through `arcBlockRefusal` (the save-refusal pattern: the
   * arc panel renders it), NOTHING is mutated (C30 reject-before-mutate)
   * and the method answers false so the caller keeps its input. Never a raw
   * throw.
   *
   * @returns true when the block landed (signal bump; the input is
   *   consumed), false when refused (nothing touched; `arcBlockRefusal`
   *   carries the field-precise message until cleared).
   */
  blockArc(edgeId: string, reason: string): boolean {
    const facade = this.facade;
    if (facade === null) {
      this.arcBlockRefusal.set('No map is loaded.');
      return false;
    }
    try {
      facade.setBlocked(edgeId, reason);
    } catch (error) {
      this.arcBlockRefusal.set(error instanceof Error ? error.message : String(error));
      return false; // C30 refusal: nothing happened — the overlay entry is untouched
    }
    this.arcBlockRefusal.set(null);
    this.afterGraphMutation();
    return true;
  }

  /**
   * B-123: clear the block-catch refusal — the panel calls it when the
   * selection changes (the stale message must not follow another arc) and
   * after a successful Block/Lift re-render made it moot. A pure signal
   * write (R3).
   */
  clearArcBlockRefusal(): void {
    this.arcBlockRefusal.set(null);
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
   * B-131 (D94/F55/C34): chat-scoped block on a NODE itself (not its arcs) —
   * the blockArc mirror verbatim in discipline. R2: the ONLY mutation is the
   * facade command setNodeBlocked(nodeId, reason), which validates (C30:
   * non-empty reason; the A-018 saved-plane gate — `savedNodeIds` ∪ overlay
   * userNodes — refusing an UNSAVED editor node field-precisely, exactly the
   * freshly placed node of B-116) and writes overlay.nodeBlocked. Then the
   * shared post-mutation sequence: the revision bump re-routes the sidebar
   * (a blocked node is impassable as destination/intermediate, origin
   * exempt — C34), the rebuild re-projects the blocked-node marker badge
   * (buildBlockedNodeBadges reads the merge) and the snapshot refresh
   * re-lists the blocked nodes (D94's blockedNodes projection). The panel's
   * one-tap applies a non-empty reason (the trimmed input, else the ONE
   * DEFAULT_BLOCK_REASON), so the C30 empty-reason throw is structurally out
   * of reach HOWEVER — the OTHER C30 refusals of the ADD path are NOT (an
   * unsaved node is refused exactly like an unknown one), so the refusal is
   * CAUGHT and surfaced field-precise through `nodeBlockRefusal` (the
   * arcBlockRefusal pattern, the B-121 lesson), NOTHING is mutated (C30
   * reject-before-mutate) and the method answers false so the caller keeps
   * its input. Never a raw throw.
   *
   * @returns true when the block landed (signal bump; the input is
   *   consumed), false when refused (nothing touched; `nodeBlockRefusal`
   *   carries the field-precise message until cleared).
   */
  blockNode(nodeId: string, reason: string): boolean {
    const facade = this.facade;
    if (facade === null) {
      this.nodeBlockRefusal.set('No map is loaded.');
      return false;
    }
    try {
      facade.setNodeBlocked(nodeId, reason);
    } catch (error) {
      this.nodeBlockRefusal.set(error instanceof Error ? error.message : String(error));
      return false; // C30 refusal: nothing happened — the overlay entry is untouched
    }
    this.nodeBlockRefusal.set(null);
    this.afterGraphMutation();
    return true;
  }

  /**
   * B-131: clear the node-block catch refusal — the property panel calls it
   * when the selection changes (the stale message must not follow another
   * node) and after a successful block/lift re-render made it moot. A pure
   * signal write (R3); the clearArcBlockRefusal precedent.
   */
  clearNodeBlockRefusal(): void {
    this.nodeBlockRefusal.set(null);
  }

  /**
   * B-131 (D94/C34): lift the chat-scoped NODE block. setNodeBlocked(nodeId,
   * undefined) is an UNCONDITIONAL delete of the overlay entry (the A-018
   * contract — node blocks are overlay-ONLY, D94 adds no library-level node
   * block, so there is no authored block to survive). Same re-route path as
   * blockNode; the rebuild drops the marker badge.
   */
  liftNodeBlock(nodeId: string): void {
    this.facade?.setNodeBlocked(nodeId, undefined);
    this.afterGraphMutation();
  }

  /**
   * B-131 (D94/F55): the live overlay block reason for one node — a presence
   * read of the C24 reference (`overlay.nodeBlocked`), never a copy (R4; the
   * isUserNode precedent). Library and unknown ids answer null. The property
   * panel's blocked row renders the returned string verbatim (C2/D20 — the
   * reason is the payload); its computed carries the graphRevision
   * dependency, so a block/lift re-reads.
   */
  nodeBlockReason(nodeId: string): string | null {
    return this.overlay?.nodeBlocked[nodeId] ?? null;
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
   * the floating flag resets so a re-entry always opens the maximized
   * overlay form (D91: the maximized form is the tall surface over the
   * stage's right side, not a flex region — the stage never resizes). The
   * remembered position survives (panelPosition untouched): the next
   * Restore floats it back where the author left it.
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
    this.clearDrawPick(); // B-122: the editor exit clears the pending pick
  }

  /**
   * B-120 (D76): the segmented tool control's write path — the template's
   * only writer (R3). Meaningful in editor mode (the control renders only
   * there); harmless anytime, and the value is never remembered across
   * sessions (enterEditor resets it). B-122: switching tools clears any
   * pending draw-arc pick — the pick belongs to the Arc tool alone.
   */
  setEditorTool(tool: EditorTool): void {
    this.editorTool.set(tool);
    this.clearDrawPick();
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

  // --- Arc editing (PKG B-123, §5 Phase 3 M2 — D75/D77/D44/D42/F44/F46/F45) ---
  //
  // The arc panel's editor-gated command paths, the B-117 blocks transposed:
  // the panel drafts LOCALLY (C29/R2) and commits on ONE Apply as a
  // full-replace `upsertEdge` PUT with the arc's KNOWN id; a C30 refusal
  // comes back as the collected field-precise NodeEditRefusal the panel
  // renders — never a throw, nothing touched (reject-before-mutate). Every
  // successful command records at the B-121 seam ("every editor command
  // records here") and marks only `dirty` (F45/D75: the edits RENDER — the
  // projection reads the live map — but routing and the snapshot serve the
  // SAVED graph until saveMap; no graphRevision bump, no snapshot refresh;
  // the editorRevision bump lights the save dock and re-renders the panel's
  // live reads through scaleNow/arc).

  /**
   * B-123 (D75/D77): commit the arc panel's draft — the ONLY mutation is the
   * facade command `upsertEdge` FULL-REPLACE (the arc's KNOWN id, every
   * authored field kept or cleared: the component builds the whole object —
   * modes from the per-mode rows, terrain, authoredDistance, curve — and
   * `blocked`/source/target/fare ride the live spread untouched). A C30
   * refusal comes back field-precise and NOTHING is touched (reject-before-
   * mutate — the panel keeps its draft and renders the issues). On success
   * the arc is drafted (B-121's seam), the projection re-reads the fresh
   * object (curve classes follow the authored data — D7 computes nothing),
   * and the revision bump lights the F45 dock.
   */
  commitArcDraft(edge: MapEdgeData): NodeEditRefusal | null {
    const facade = this.facade;
    if (facade === null) return { issues: [{ path: '', message: 'No map is loaded.' }] };
    try {
      facade.upsertEdge(edge);
    } catch (error) {
      return nodeEditRefusal(error);
    }
    this.recordUnsaved(edge.id); // B-121 (D77): every editor command records here — the panel's editing IS the drafted state
    this.rebuildElements(); // one cy.batch (B-112): the projection re-reads the fresh object
    this.editorRevision.update((n) => n + 1); // F45: the dock lights
    return null;
  }

  /**
   * B-123 (F44/F20/D44/C13): the measure section's command — a pure
   * `calibrateScale` passthrough (R2). A mode-signature unit ({ label,
   * kind }) seeds the unit word and kind (D44); an ABSENT unit re-measures
   * in the established unit (the label stands). A C30 refusal comes back
   * field-precise (an unmeasurable arc, a non-positive value, an empty
   * label), NOTHING is touched and `dirty` keeps its state. On success the
   * calibration marks only `dirty` (A-015's D75 semantics) — hence the
   * editorRevision bump (the dock lights; the panel's scaleNow readout
   * re-renders) — and NEVER touches the arc: no recordUnsaved, no rebuild,
   * the arc does not become drafted by a measurement.
   */
  measureArc(
    arcId: string,
    authoredDistance: number,
    unit?: { label: string; kind: 'distance' | 'time' },
  ): NodeEditRefusal | null {
    const facade = this.facade;
    if (facade === null) return { issues: [{ path: '', message: 'No map is loaded.' }] };
    try {
      facade.calibrateScale(arcId, authoredDistance, unit);
    } catch (error) {
      return nodeEditRefusal(error);
    }
    this.clearCalibrateHintForLoadedMap(); // B-137 (D79): calibrating clears the hint
    this.editorRevision.update((n) => n + 1); // F45: the dock lights; the readout re-renders (in-place scale write, C24)
    return null;
  }

  /**
   * B-123 (D42's deferred refine/dedup surface + F50): remove the arc —
   * DIRECT, no confirm dialog (delete-and-redo is the F46 workflow; the
   * draft state makes accidental removals recoverable by redrawing). R2:
   * the ONLY mutation is the facade command removeEdge (the library plane —
   * the facade refuses unknown ids field-precisely; the panel gates the
   * button to library arcs anyway). On success the removed id LEAVES the
   * B-121 log (forgetUnsaved — this caller is named at that seam), an
   * overlay block on the arc dies with it (the facade's own delete, F50),
   * the projection re-reads, and — the removeNode precedent — the selection
   * is CLEARED when the removed arc WAS the selection, so the panel closes.
   */
  removeArc(id: string): NodeEditRefusal | null {
    const facade = this.facade;
    if (facade === null) return { issues: [{ path: '', message: 'No map is loaded.' }] };
    try {
      facade.removeEdge(id);
    } catch (error) {
      return nodeEditRefusal(error);
    }
    this.forgetUnsaved(id); // B-121 (D77): a removed id leaves the log
    this.rebuildElements();
    this.editorRevision.update((n) => n + 1); // F45: the dock lights
    if (this.edgeSelection()?.id === id) this.edgeSelection.set(null); // the panel closes with the arc
    return null;
  }

  // --- Layer management (PKG B-126, §5 Phase 3 M3 — D82/D83/F54/D75/D77) ------
  //
  // The layer-manager sheet's and the property panel's layer surfaces — the
  // R2 seams over A-017's facade commands. Every wrapper follows the B-117
  // editor discipline: the ONLY mutation is the facade command; a C30
  // refusal comes back as the collected field-precise NodeEditRefusal with
  // NOTHING touched (reject-before-mutate); a success marks only `dirty`
  // (F45/D75: dirty-never-stale — NO graphRevision bump, NO snapshot
  // refresh; the SAVED graph serves routing and the header until saveMap),
  // bumps the editorRevision (the save dock lights; layerNames re-reads —
  // C24) and rebuilds the projection where projected elements actually
  // change (never a fit — B-120).

  /**
   * B-126 (D82): the layer-manager sheet's open/close toggle — the Manage
   * affordance's single write path (R3, the toggleEditor pattern). A pure
   * signal write. D91: the sheet OVERLAYS the stage on both layouts (a
   * floater on wide, a bottom sheet on narrow) — open/close resizes nothing
   * and the ResizeObserver never fires for it; the preserve/refit matrix
   * below is the rail's and the environment's business only.
   */
  toggleLayerManager(): void {
    this.layerManagerOpen.update((open) => !open);
  }

  /**
   * B-126 (D82/R1): the delete-confirm dialog's counts — the facade's pure
   * `layerRemovalImpact` (N places, M same-layer arcs, K cross-layer arcs
   * from surviving layers), read LIVE (R4). The UI NEVER counts (R1); the
   * dialog renders these three numbers in plain words. Null when no map is
   * loaded or the id is unknown (degrade, never throw — C32 spirit; the
   * dialog never renders for such a row anyway).
   */
  layerRemovalImpact(layerId: string): LayerRemovalImpact | null {
    try {
      return this.facade?.layerRemovalImpact(layerId) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * B-128 (D85): the layer's ENTRY NODE as the manager sheet's read-only
   * mirror line needs it — the first node wired `portal === layerId` with
   * its authored label and the name of the layer it LIVES on (C23: the two
   * words the line renders; the UI never maps ids to words itself, R1
   * spirit). Null when no entry node exists ("No entry from another layer")
   * or no map is loaded (degrade, never throw — C32 spirit). A live
   * filtered read (R4), never a copy; the sheet's computed carries the
   * editorRevision dependency so an in-place wiring re-reads (C24).
   */
  portalEntryOf(layerId: string): { nodeLabel: string; layerName: string } | null {
    const map = this.map();
    if (map === null) return null;
    const entry = map.nodes.find((nd) => nd.portal === layerId);
    if (entry === undefined) return null;
    return {
      nodeLabel: entry.label,
      layerName: map.layers.find((layer) => layer.id === entry.layer)?.name ?? '',
    };
  }

  /**
   * B-126 (D82/C5): create (`id: ''`) or rename (PUT by known id) a layer.
   * On success the command edits NO element — an empty fresh layer projects
   * nothing and a rename changes no projected string — so the post-sequence
   * is the editorRevision bump ALONE (the nav/rows re-read via layerNames'
   * C24 dependency; the save dock lights — dirty is the visual). No
   * recordUnsaved: the B-121 log is an ELEMENT log, and no element was
   * touched (D82: "upsertLayer/reorderLayers edit no element"). The
   * background arm stays out of this wrapper's type: the facade's REPLACE is
   * absent-and-preserve on it (gate-verifier finding 2, M3 gate) — the image
   * has its own command (D84's setLayerBackground), so no upsertLayer caller
   * ever needs the arm.
   */
  upsertLayer(layer: { id: string; name: string }): NodeEditRefusal | null {
    const facade = this.facade;
    if (facade === null) return { issues: [{ path: '', message: 'No map is loaded.' }] };
    try {
      facade.upsertLayer(layer);
    } catch (error) {
      return nodeEditRefusal(error);
    }
    this.editorRevision.update((n) => n + 1); // F45/C24: the dock lights; the nav and sheet rows re-read
    return null;
  }

  /**
   * B-126 (D82): the informed-cascade delete — ONE `removeLayer` deletes the
   * layer (its background with it), every node resident on it in BOTH
   * planes, every arc with a dying endpoint, and unwires every surviving
   * portal that targeted it. Pre-command bookkeeping over the LIVE
   * references (R4 — id sets, never copies): the dying nodes/edges whose
   * ids LEAVE the B-121 log (the removeEdge precedent), and the
   * portal-unwired SURVIVORS that JOIN it (their node objects were swapped
   * — they differ from the saved map now, so they draft: D82 ruling 4).
   * Selection cleanup rides the removeUserNode precedent: a selection on a
   * dying node/arc clears, so the chip and panels close with it.
   * D69/D82: deleting the ACTIVE layer — the facade reset its viewer state
   * to the survivors' first layer; the service mirrors the reset (the live
   * map's first layer), re-projects, and takes the ONE new fit — the reset
   * is a selectLayer-equivalent transition (a fresh active layer's default
   * view is the fitted, label-visible one — the selectLayer rationale;
   * fitView also re-bases the cull threshold, B-113 ruling 1). A surviving
   * active layer needs no fit — the projection re-projects in place (a
   * badge/arc update, the rebuild-never-fits rule, B-120).
   */
  removeLayer(layerId: string): NodeEditRefusal | null {
    const facade = this.facade;
    const map = this.map();
    const overlay = this.overlay;
    if (facade === null || map === null || overlay === null) {
      return { issues: [{ path: '', message: 'No map is loaded.' }] };
    }
    // The facade's own dying-set definition, read pre-command (id
    // bookkeeping — not R1 math; the DIALOG's numbers come from
    // layerRemovalImpact).
    const dying = new Set([
      ...map.nodes.filter((nd) => nd.layer === layerId).map((nd) => nd.id),
      ...overlay.userNodes.filter((nd) => nd.layer === layerId).map((nd) => nd.id),
    ]);
    const dyingEdges = new Set(
      [...map.edges, ...overlay.userEdges]
        .filter((e) => dying.has(e.source) || dying.has(e.target))
        .map((e) => e.id),
    );
    const unwiredSurvivors = map.nodes
      .filter((nd) => nd.portal === layerId && nd.layer !== layerId)
      .map((nd) => nd.id);
    const wasActive = this.activeLayer() === layerId;
    try {
      facade.removeLayer(layerId);
    } catch (error) {
      return nodeEditRefusal(error);
    }
    for (const id of dying) this.forgetUnsaved(id); // B-121: removed ids LEAVE the log
    for (const id of dyingEdges) this.forgetUnsaved(id);
    for (const id of unwiredSurvivors) this.recordUnsaved(id); // B-121: the portal-unwired survivors JOIN
    if (wasActive) {
      // D69: the facade reset to the survivors' first layer — mirror it.
      this.activeLayer.set(map.layers[0]?.id ?? null);
      this.rebuildElements();
      this.fitView();
    } else {
      // A surviving active layer: its projection still changes (cross-layer
      // badges of dying arcs vanish) — re-project, never fit (B-120).
      this.rebuildElements();
    }
    this.editorRevision.update((n) => n + 1); // F45/C24: the dock lights; the nav re-reads
    const nodeSel = this.selection();
    if (nodeSel !== null && dying.has(nodeSel.id)) {
      this.selection.set(null); // the removeUserNode precedent
    }
    const edgeSel = this.edgeSelection();
    if (edgeSel !== null && dyingEdges.has(edgeSel.id)) {
      this.edgeSelection.set(null);
    }
    return null;
  }

  /**
   * B-126 (D82): array/nav order only — the sheet's Up/Down buttons commit
   * the swapped FULL id array (array shuffling is UI state, not R1 math).
   * The command touches ORDER and nothing else: no projected element
   * changes, so the post-sequence is the editorRevision bump alone (the
   * nav and sheet rows re-read; dirty lights the dock) — no rebuild, no
   * draft-log entry (D82: "reorderLayers edits no element").
   */
  reorderLayers(layerIds: readonly string[]): NodeEditRefusal | null {
    const facade = this.facade;
    if (facade === null) return { issues: [{ path: '', message: 'No map is loaded.' }] };
    try {
      facade.reorderLayers(layerIds);
    } catch (error) {
      return nodeEditRefusal(error);
    }
    this.editorRevision.update((n) => n + 1); // F45/C24: the dock lights; the nav re-reads
    return null;
  }

  // --- Layer backgrounds (PKG B-130, §5 Phase 3 M3 — D84/D29/C32/F03) ---------

  /**
   * B-130 (R4): the layer's background REFERENCE — the arm-level live read
   * the manager sheet's state lines render (`{ assetId }` vs `{ url }` vs
   * none; C23: the URL arm's string is the user's own words). A lookup,
   * never a copy — callers render it, never write into it. Template
   * consumers carry the editorRevision dependency (C24 — the in-place swap
   * precedent), exactly like layerNames.
   */
  layerBackground(layerId: string): LayerBackground | null {
    return this.map()?.layers.find((layer) => layer.id === layerId)?.background ?? null;
  }

  /**
   * B-130 (D84): the manager sheet's background command — the R2 wrapper
   * over `facade.setLayerBackground(layerId, source)` (`{ assetId }` upload
   * | `{ url }` remote | `null` clear; exactly-one-arm is the VALIDATOR's
   * C30 rule, so a bad shape refuses field-precisely with nothing touched —
   * reject-before-mutate). The B-126 layer-wrapper discipline: on success
   * the background is NOT a cy projection element (no rebuild) and no
   * element was edited (no B-121 entry), so the post-sequence is the
   * editorRevision bump ALONE — the save dock lights (F45/D75), the sheet's
   * reads and `activeBackground` re-read (C24). A C30 refusal returns the
   * collected field-precise issues for the sheet's refusals area (the
   * upsertLayer precedent).
   */
  setLayerBackground(layerId: string, source: LayerBackground | null): NodeEditRefusal | null {
    const facade = this.facade;
    if (facade === null) return { issues: [{ path: '', message: 'No map is loaded.' }] };
    try {
      facade.setLayerBackground(layerId, source);
    } catch (error) {
      return nodeEditRefusal(error);
    }
    // B-134 (D92/D75 — adjudication 1): the background-set authoring moment.
    // Only a set on the ACTIVE layer can persist the default (the img load
    // that resolves the natural size is the active layer's): the flag arms
    // exactly one facade.setLayerBackgroundPlacement write at that load. A
    // set on an inactive layer gets its default computed-AND-HELD at the
    // layer switch to it. The D93 fresh-start reset has already cleared the
    // old placement arm, so the computed default renders meanwhile.
    this.pendingPlacementLayer = layerId === this.activeLayer() ? layerId : null;
    this.editorRevision.update((n) => n + 1); // F45/C24: the dock lights; activeBackground re-reads
    this.applyBackgroundTransform(); // discrete pass: the src swap re-renders from live facts
    return null;
  }

  /**
   * B-130 (D84/C32): the tme-bg img's error path — the load DEGRADES to no
   * background (the `backgroundFailed` flag hides the img; the canvas and
   * every affordance stay untouched, F03) plus ONE console warn (the
   * `[TravelMapper]` discipline; user-visible surface stays the empty
   * background, not an error banner — a background is decoration, C32).
   * One warn per failed src: a repeat error while the flag stands is
   * swallowed; the constructor effect re-arms the flag on any src change,
   * so a retry succeeds silently. The logged src is the TRUTH's current
   * background string (activeBackground), never a parsed machine name (C23).
   */
  backgroundLoadFailed(): void {
    const src = this.activeBackground();
    if (src === null || this.backgroundFailed()) return; // nothing to name / already reported
    this.backgroundFailed.set(true);
    console.warn(`[TravelMapper] background load failed: ${src}`);
  }

  // --- Per-layer background dim (PKG B-132, §5 Phase 3.5 M5 — D90/D93/F56) ----

  /**
   * B-132 (D90/D93): the ACTIVE layer's background dim — the R4 live read both
   * the rail's slider and the tme-bg opacity bind. Absent arm ⇒ 0 (the D93
   * default: 0 = undimmed; the validator keeps a SET 0 a present own key, so
   * a saved 0 and an absent arm read identically here — both "undimmed").
   * Computed over DISCRETE signals only (D2): `activeLayer` (a switch re-reads
   * the new layer's arm — D90: the slider follows the layer switch) and
   * `editorRevision` (C24 — the in-place layer-object swap precedent of
   * layerNames/activeBackground: BOTH mutating commands splice a fresh layer
   * object — `setLayerBackgroundDim` and the D93 fresh-start reset inside
   * `setLayerBackground`, which bumps the SAME revision — so a background
   * change re-reads the reset dim; never a cached copy, R4). The value is the
   * core arm VERBATIM (R1 — `1 − dim` styling happens at the img, not here).
   */
  readonly activeLayerDim = computed<number>(() => {
    void this.editorRevision(); // C24: the in-place layer swap re-reads (fresh-start included)
    const layer = this.map()?.layers.find((l) => l.id === this.activeLayer());
    return layer?.backgroundDim ?? 0;
  });

  /**
   * B-132 (D90/D93/F07): whether the ACTIVE layer carries a background
   * REFERENCE in map data — the rail slider's enable gate (a dim without a
   * background is a dead control: the F07 reasoning; A-019 pinned the DATA
   * allowing a dim arm without a background — the UI simply does not offer
   * it). The same discrete dependencies as `activeLayerDim`: a switch
   * re-reads the new layer's arm, and the D93 fresh-start reset re-reads.
   */
  readonly activeLayerHasBackground = computed<boolean>(() => {
    void this.editorRevision(); // C24: the in-place layer swap re-reads
    const layer = this.map()?.layers.find((l) => l.id === this.activeLayer());
    return layer?.background !== undefined;
  });

  /**
   * B-132 (D90/D93): the rail slider's write path — the R2 wrapper over
   * `facade.setLayerBackgroundDim(activeLayer, dim)`; the service's
   * single-writer discipline (the component never touches the facade).
   *
   * NO refusal channel — the zoom-trio pattern, not the blockArc one: the
   * control structurally cannot produce a refusable value. The range input's
   * min=0/max=1/step=0.05 clamps and snaps every user input into 0–1 (a
   * non-finite cannot serialize into a range value), and the active layer
   * always exists whenever this can fire (the slider is disabled without a
   * background-bearing active layer, and every rendered layer id is a real
   * layer). The facade's C30 gate remains the structural backstop.
   *
   * Commit-on-`input` (live preview while the thumb drags) is correct D75
   * behavior, not an accident: the dim is MAP data, so every tick marks
   * dirty and lights the save dock; a stray drag is recovered by dragging
   * back or by Save. Like the background set (B-130) the dim is NOT a cy
   * projection element: no rebuild and no B-121 draft-log entry — the
   * post-sequence is the editorRevision bump ALONE (the dock lights; both
   * live reads re-read, C24). The snapshot is untouched: the arm never
   * enters it (D90, unit-pinned).
   */
  setActiveLayerDim(dim: number): void {
    const facade = this.facade;
    const layerId = this.activeLayer();
    if (facade === null || layerId === null) return; // degrade before loadMap (C32 spirit)
    facade.setLayerBackgroundDim(layerId, dim);
    this.editorRevision.update((n) => n + 1); // F45/C24: the dock lights; the reads re-read
  }

  // --- Background sync render (PKG B-134, §5 Phase 3.5 M5 — D92/D93) --------

  /**
   * B-134: the CURRENT tme-bg image's natural size, reported by the viewer at
   * the img's `load` event (the service never reads the DOM — the D81
   * discipline; the component owns the img). Tagged with the src it belongs
   * to, so a compute site can tell a CURRENT natural (same src — a switch
   * between two layers sharing one URL never re-fires the load) from a STALE
   * one (the src swapped; the load event will re-report). null until the
   * first load.
   *
   * B-135: a SIGNAL now — the load is a DISCRETE event (one write per img
   * load, D2-legal), and the calibrate gates (canCalibrate,
   * activeDefaultPlacement) must RE-RENDER when it lands: a layer switch
   * writes its last signal BEFORE the new img decodes, so without the signal
   * the entry button's disabled binding could never observe the arrival
   * (found live in the degenerate-extents e2e cell — the stale binding kept
   * a loadable background uncalibratable). The high-frequency consumers
   * (backgroundRenderState at zoom/pan frequency) only ever READ it — a
   * signal read outside a reactive context is a plain read, no subscription.
   */
  private readonly bgNatural = signal<{ src: string; w: number; h: number } | null>(null);

  /**
   * B-134 (D92): the computed-and-held default placement for the ACTIVE
   * layer — recomputed ONLY at the three D92 compute sites (background-set
   * via the img load, loadMap, layer-switch), never off a graph edit (edits
   * never move the placement). null = the extents were degenerate (the D84
   * stage-contain fallback applies) or no compute has run yet. APP STATE
   * only: this never persists by itself (D75 — an unedited map never opens
   * dirty); the arm (`LayerData.backgroundPlacement`) always wins over it.
   */
  private heldDefaultPlacement: { x: number; y: number; scale: number } | null = null;

  /**
   * B-134 (D92/D75 — adjudication 1): the background-set authoring moment —
   * the layer a setLayerBackground call armed. At that layer's NEXT img load
   * the computed default persists through exactly ONE
   * facade.setLayerBackgroundPlacement write (dirty — part of the authoring
   * action), then the flag clears. Any layer switch / loadMap abandons it;
   * a degenerate fit or a failed load (C32) consumes it without a write.
   */
  private pendingPlacementLayer: string | null = null;

  /**
   * B-134: the viewer-registered transform application — the cull
   * precedent's seam mirrored. The service owns cy's viewport (it sees the
   * zoom/pan stream), the component owns the img's DOM (the D81 discipline:
   * the service never reads the DOM), so the high-frequency handlers call
   * OUT to this listener instead of touching DOM here. Registered at the
   * component's mount, cleared at its teardown. Writes nothing (D2).
   */
  private bgTransformListener: (() => void) | null = null;

  /** B-134: the component registers/unregisters the transform application. */
  setBackgroundTransformListener(listener: (() => void) | null): void {
    this.bgTransformListener = listener;
  }

  /**
   * B-134 (D2): the high-frequency path's whole body — one mounted gate and
   * one registered-callback call, like applyLabelCull's two scalar reads.
   * Every caller is either the `zoom`/`pan` stream or a DISCRETE state
   * change (img load, background-set, loadMap, layer switch); the callback
   * itself is idempotent direct DOM work (no signals, no change detection).
   */
  private applyBackgroundTransform(): void {
    if (!this.mounted) return; // headless has no viewport to place against (C32 spirit)
    this.bgTransformListener?.();
  }

  /**
   * B-134: the D92 default placement for one layer — an aspect-locked
   * CONTAIN fit of the natural image size to the layer's node bounding box:
   * scale = min(bboxW/natW, bboxH/natH) MODEL UNITS PER IMAGE PIXEL, x/y =
   * the bbox center (the D84 stage-contain philosophy carried into model
   * space — the whole image visible, centered on the graph it underlies).
   * THE single-sourced fit: B-135's "fit to graph" re-uses this function.
   *
   * Extents: the data positions of the layer's library nodes + overlay
   * waypoints (R4 — live reads, never copies). Containers carry no authored
   * position (FX1) and are labels, not extents. DEGENERATE (no positioned
   * node, or a zero-area bbox — one node / all coincident) returns null: the
   * fit is undefined and the D84 stage-contain fallback renders until an
   * explicit calibrate writes an arm (B-135).
   *
   * R1 note: this is RENDERING math (placement of a decorative surface), not
   * a distance/direction/duration/cost — no user-displayed or prompt-facing
   * number originates here; the values B-135's calibrate UI will display
   * come from the core arm.
   */
  private defaultPlacementFor(
    layerId: string,
    natural: { w: number; h: number },
  ): { x: number; y: number; scale: number } | null {
    const extents = this.layerNodeExtents(layerId);
    if (extents === null) return null;
    const w = (extents.maxX - extents.minX) / natural.w;
    const h = (extents.maxY - extents.minY) / natural.h;
    if (!Number.isFinite(w) || !Number.isFinite(h) || natural.w <= 0 || natural.h <= 0) return null;
    return {
      x: (extents.minX + extents.maxX) / 2,
      y: (extents.minY + extents.maxY) / 2,
      scale: Math.min(w, h),
    };
  }

  /**
   * B-134: the layer's node bounding box over data positions — null when
   * degenerate (no positioned node, or a zero-area bbox).
   */
  private layerNodeExtents(layerId: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const consider = (pos: { x: number; y: number } | undefined): void => {
      if (pos === undefined) return;
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    };
    for (const node of this.map()?.nodes ?? []) {
      if (node.layer === layerId) consider(node.position);
    }
    for (const node of this.overlay?.userNodes ?? []) {
      if (node.layer === layerId) consider(node.position);
    }
    if (minX === Infinity || maxX === minX || maxY === minY) return null;
    return { minX, minY, maxX, maxY };
  }

  /**
   * B-134: the compute-and-hold pass — the ONE body every D92 compute site
   * runs (loadMap, layer-switch, and the img load that realizes the
   * background-set moment). Skips when the tagged natural is absent or STALE
   * (its src no longer matches the active layer's background — the pending
   * load owns that compute). Never persists (D75): the persist is the
   * background-set moment's business alone (noteBackgroundImageLoaded).
   */
  private recomputeHeldDefault(): void {
    const natural = this.bgNatural();
    const layerId = this.activeLayer();
    if (natural === null || layerId === null || natural.src !== this.activeBackground()) return;
    this.heldDefaultPlacement = this.defaultPlacementFor(layerId, natural);
  }

  /**
   * B-134: the viewer's img-load report (the discrete (load) handler). The
   * natural size lands, the held default recomputes (the load IS the
   * background-set / loadMap / layer-switch compute moment whenever that is
   * what changed the src), and — ONLY when this load is the armed
   * authoring moment — the ONE setLayerBackgroundPlacement write lands
   * (dirty, D75; a degenerate fit writes NOTHING — the fallback applies
   * until B-135's calibrate). A C30 refusal here is structurally
   * unreachable (finite computed numbers on a live layer) but caught —
   * the held default keeps rendering, never a throw (C32).
   */
  noteBackgroundImageLoaded(naturalWidth: number, naturalHeight: number): void {
    const src = this.activeBackground();
    if (src === null) return; // the img is gone (a stale event) — nothing to place
    this.bgNatural.set({ src, w: naturalWidth, h: naturalHeight }); // B-135: a signal write (discrete — one per load)
    this.recomputeHeldDefault();
    const layerId = this.activeLayer();
    if (layerId !== null && this.pendingPlacementLayer === layerId) {
      this.pendingPlacementLayer = null; // the moment consumed — once, whatever happens below
      const placement = this.heldDefaultPlacement;
      if (placement !== null && this.facade !== null) {
        try {
          this.facade.setLayerBackgroundPlacement(layerId, placement);
          this.editorRevision.update((n) => n + 1); // F45/C24: the dock lights (part of the authoring action)
        } catch {
          // C32: degrade to the held default's render — never an uncaught throw.
        }
      }
    }
    this.applyBackgroundTransform();
  }

  /**
   * B-134: the render facts the viewer's transform callback consumes — the
   * LIVE placement (the layer's arm when present, else the held default)
   * joined with the viewport reads (zoom/pan off cy) and the EXPECTED
   * natural pair (the src-tagged bgNatural — the load report's truth). null
   * = the D84 stage-contain fallback applies (no background, degenerate
   * extents, no compute yet, or unmounted). A pure read at event frequency
   * (D2 — no signal touched); the arm is read off the LIVE map (R4, never a
   * copy). The natural pair lets the callback refuse an img whose intrinsic
   * size is mid-swap: a src change updates naturalWidth/naturalHeight in
   * SEPARATE decoder steps (found live in Chromium — a 64×64 SVG swap
   * briefly reported 64×96, the new width with the old height), so an apply
   * against a torn pair would write a non-aspect-locked box; the mismatch
   * skips the pass and the load event re-applies against the settled pair.
   */
  backgroundRenderState(): {
    x: number;
    y: number;
    scale: number;
    zoom: number;
    pan: { x: number; y: number };
    natural: { w: number; h: number } | null;
  } | null {
    if (!this.mounted) return null;
    const layer = this.map()?.layers.find((l) => l.id === this.activeLayer());
    // B-135 (D93): an in-flight calibrate drag's draft renders ahead of the
    // arm — the live preview IS the gesture (the committed write lands at
    // drag end). The draft is a plain field written at event frequency, so
    // this read stays signal-free (D2 — the cullZoom precedent).
    const placement = this.calibrateDraft ?? layer?.backgroundPlacement ?? this.heldDefaultPlacement;
    if (placement === undefined || placement === null) return null;
    return {
      x: placement.x,
      y: placement.y,
      scale: placement.scale,
      zoom: this.cy.zoom(),
      pan: this.cy.pan(),
      natural: this.bgNatural(), // B-135: plain read at event frequency (no reactive context)
    };
  }

  // --- Background calibrate (PKG B-135, §5 Phase 3.5 M5 — D93/D92/D75/D91/F07/F56)

  /**
   * B-135 (D93/F56): the calibrate MODE — the explicit authoring surface for
   * `LayerData.backgroundPlacement`. While it is on, the mode owns the
   * canvas gestures (every tap handler gates on this signal — a tap selects
   * and places nothing) and the render follows the in-flight drag draft
   * (backgroundRenderState). Entered ONLY through enterCalibrate (the
   * manager sheet's gated entry — a background-less or failed layer cannot
   * enter, F07: disabled, not hidden); exited by Done/Cancel (the stage
   * band) or the constructor's guard effect (the substrate moved — a layer
   * switch, a loadMap, a background set/remove, a failed load). Frontend
   * authoring state over MAP data: the placement itself persists only
   * through the facade command (R2 — setActiveLayerPlacement below).
   */
  readonly calibrateMode = signal(false);

  /**
   * B-135: the layer id the session calibrates — snapshotted at entry, so
   * the guard effect can end the session the moment the active layer moves
   * (a calibrate session is bound to one layer's image). A plain field: the
   * guard reads it alongside tracked signals only (D2).
   */
  private calibrateLayerId: string | null = null;

  /**
   * B-135: the background src the session calibrates — the same snapshot
   * discipline as calibrateLayerId; the D93 fresh-start (a new source resets
   * the placement) and a Remove both change it and both end the session.
   */
  private calibrateBackgroundSrc: string | null = null;

  /**
   * B-135 (D2): the in-flight drag's placement — written at `tapdrag`
   * frequency, rendered directly by backgroundRenderState (no signal write,
   * no change detection — the cullZoom/panelPosition discipline), cleared at
   * drag end (the committed write takes over) and at every mode exit.
   */
  private calibrateDraft: { x: number; y: number; scale: number } | null = null;

  /**
   * B-135: the live drag gesture — the tapstart's rendered anchor and the
   * base placement it drags from. A plain field (D2), read only by the
   * tapstream handlers below.
   */
  private calibrateDrag: { startX: number; startY: number; base: { x: number; y: number; scale: number } } | null =
    null;

  /**
   * B-135 (F07/C24): whether the layer-manager row `layerId` may enter
   * calibrate — the entry gate, rendered as a DISABLED button (never hidden)
   * when false. True only when the row IS the active layer (the stage mode
   * calibrates the active layer's rendered image), that layer carries a
   * background reference, its load has not failed (the C32 degrade hides
   * the img — there is nothing to calibrate against), and the img's
   * src-tagged natural size is CURRENT (the gesture base needs it; the
   * currency check is noteBackgroundImageLoaded's own discipline).
   * Template-called method with the editorRevision read — the canSetUrl
   * precedent (C24: every gate re-reads after a background command).
   */
  canCalibrate(layerId: string): boolean {
    void this.editorRevision(); // dependency: a background command re-reads (C24)
    const natural = this.bgNatural();
    return (
      this.map() !== null &&
      layerId === this.activeLayer() &&
      this.activeLayerHasBackground() &&
      !this.backgroundFailed() &&
      natural !== null &&
      natural.src === this.activeBackground()
    );
  }

  /**
   * B-135 (R4/C24): the ACTIVE layer's live placement — the persisted arm
   * when present, else the held D92 default (B-134's compute-and-hold), else
   * null (the degenerate fallback renders). The calibrate band's scale
   * readout reads this (an R4 live read, never a copy — the activeLayerDim
   * precedent). editorRevision is the recompute dependency (C24: the
   * in-place layer swap every placement write performs).
   */
  activeLayerPlacement(): { x: number; y: number; scale: number } | null {
    void this.editorRevision(); // C24: the in-place layer swap re-reads
    const layer = this.map()?.layers.find((l) => l.id === this.activeLayer());
    return layer?.backgroundPlacement ?? this.heldDefaultPlacement;
  }

  /**
   * B-135 (D92 — THE single-sourced fit, exposed): the ACTIVE layer's D92
   * default placement, through B-134's ONE derivation (`defaultPlacementFor`
   * — never a second fit computation) over the current src-tagged natural
   * size. Null when degenerate (no/one/coincident positioned node — the
   * F07 dead-control reasoning disables Fit-to-graph honestly) or the
   * natural is absent/stale. Template-called (the fit button's gate, the
   * scale readout's denominator) and the e2e seam's body
   * (testDefaultPlacement).
   */
  activeDefaultPlacement(): { x: number; y: number; scale: number } | null {
    void this.editorRevision(); // C24: the reactive dep for template-called reads
    const layerId = this.activeLayer();
    const natural = this.bgNatural(); // B-135: the load's arrival re-renders the gates
    if (layerId === null || natural === null || natural.src !== this.activeBackground()) return null;
    return this.defaultPlacementFor(layerId, natural);
  }

  /**
   * B-135 (D93/F07): enter calibrate from the manager sheet's entry. The
   * gate is canCalibrate (belt — the button is disabled when false); the
   * session snapshots its (layer, src) pair for the guard effect, closes
   * the manager sheet (the stage band takes over — the sheet would cover
   * the phone's drag area; a panel close resizes nothing, D91), and takes
   * the canvas: panning and zooming are user-disabled for the session (D91
   * zero-motion made absolute — the camera STAYS; the drag math reads the
   * live zoom at gesture time, and a pinch's two-finger tapdrag stream
   * would otherwise drift the image), nodes are ungrabbable (D93 — nodes
   * are read-only during calibration), and the tapstream registers (a
   * DISCRETE-GESTURE-class binding: it begins/ends with the mode, so the
   * B-134 never-registered invariant stays true outside it). Answers false
   * when the gate refused (nothing changed).
   */
  enterCalibrate(): boolean {
    if (this.calibrateMode()) return true; // idempotent re-entry
    const layerId = this.activeLayer();
    if (!this.mounted || layerId === null || !this.canCalibrate(layerId)) return false;
    this.calibrateLayerId = layerId;
    this.calibrateBackgroundSrc = this.activeBackground();
    this.calibrateDraft = null;
    this.calibrateDrag = null;
    this.calibrateMode.set(true);
    this.cy.userPanningEnabled(false); // D91: the camera stays for the session
    this.cy.userZoomingEnabled(false);
    this.cy.autoungrabify(true); // D93: nodes are read-only while calibrating
    this.cy.on('tapstart', this.calibrateDragStart);
    this.cy.on('tapdrag', this.calibrateDragMove);
    this.cy.on('tapend', this.calibrateDragEnd);
    this.layerManagerOpen.set(false); // the stage band replaces the sheet
    return true;
  }

  /** B-135 (C23 plain word): Done — flush any in-flight draft, then exit. */
  calibrateDone(): void {
    this.exitCalibrate(true);
  }

  /**
   * B-135: Cancel — discard any UNCOMMITTED drag draft and exit. Committed
   * gestures (drag ends, scale steps, fit taps) stand in both exits: each
   * already persisted through the facade (D75) and there is no undo to run
   * (F46) — Cancel's honest meaning is "stop calibrating; the unfinished
   * drag never happened".
   */
  calibrateCancel(): void {
    this.exitCalibrate(false);
  }

  /**
   * B-135: the shared exit — un-register the tapstream, restore the canvas
   * interaction state (pan/zoom always re-enable — the constructor config;
   * grabbify mirrors the editor mode), drop the gesture state, and re-apply
   * the transform so the render falls back from the draft to the arm/held
   * facts. `flushDraft` (Done) commits an in-flight draft first — the same
   * ONE-write discipline as any committed gesture.
   */
  private exitCalibrate(flushDraft: boolean): void {
    if (!this.calibrateMode()) return;
    this.calibrateMode.set(false);
    this.cy.off('tapstart', this.calibrateDragStart);
    this.cy.off('tapdrag', this.calibrateDragMove);
    this.cy.off('tapend', this.calibrateDragEnd);
    this.cy.userPanningEnabled(true);
    this.cy.userZoomingEnabled(true);
    this.cy.autoungrabify(!this.editorMode()); // the enterEditor/exitEditor mirror
    const draft = this.calibrateDraft;
    this.calibrateDraft = null;
    this.calibrateDrag = null;
    if (flushDraft && draft !== null) this.setActiveLayerPlacement(draft);
    this.applyBackgroundTransform(); // the draft's render reverts to the arm/held facts
  }

  /**
   * B-135 (R2 — the placement write path, the setActiveLayerDim precedent):
   * the ONLY calibrate mutation, wrapping facade.setLayerBackgroundPlacement
   * for the ACTIVE layer. NO refusal channel — the zoom-trio/dim reasoning:
   * the caller structurally cannot produce a refusable value (finite model
   * numbers on a live layer — drag deltas over the live zoom, a
   * multiplicative step of a positive scale, or the finite default-fit
   * result), and the active layer always exists when this can fire (the
   * mode's guard owns layer identity). The facade's C30 gate remains the
   * structural backstop and is caught — never an uncaught throw (C32).
   * The post-sequence is the editorRevision bump ALONE: the dock lights
   * (F45/D75 — a committed gesture is map data), the reads re-read (C24);
   * no rebuild and no B-121 entry (the background is not a cy projection
   * element — the B-130 background-set discipline).
   */
  setActiveLayerPlacement(placement: { x: number; y: number; scale: number }): void {
    const facade = this.facade;
    const layerId = this.activeLayer();
    if (facade === null || layerId === null) return; // degrade before loadMap (C32 spirit)
    try {
      facade.setLayerBackgroundPlacement(layerId, placement);
    } catch {
      return; // structurally unreachable from the calibrate surface — degrade (C32)
    }
    this.editorRevision.update((n) => n + 1); // F45/C24: the dock lights; the reads re-read
  }

  /**
   * B-135 (D93): the scale step — ONE multiplicative step on the ONE
   * aspect-locked scale (model units per image pixel), committed per tap
   * (a discrete gesture, D75). The center is untouched: the image grows and
   * shrinks about its own center. The base is the live placement (draft
   * included — a step between drag gestures composes), or the synthesized
   * fallback base when the degenerate fallback renders (the committed write
   * replaces the fallback with a real arm — the packet's calibrate-write
   * clause). The step factor rides the ZOOM_STEP convention (×1.25, its
   * exact reciprocal) — a UI factor, not a displayed number (the B-127
   * precedent).
   */
  calibrateScaleStep(factor: number): void {
    if (!this.calibrateMode()) return;
    const base = this.currentCalibrateBase();
    if (base === null) return; // no natural to scale against (C32 spirit)
    this.setActiveLayerPlacement({ x: base.x, y: base.y, scale: base.scale * factor });
    this.applyBackgroundTransform(); // discrete pass: the new arm renders now
  }

  /**
   * B-135 (D92/D93): Fit to graph — ONE tap, ONE write of B-134's
   * single-sourced default (`activeDefaultPlacement`, the same
   * defaultPlacementFor body every D92 compute site runs — never a second
   * derivation). A null default (degenerate extents) is the disabled
   * control's guard — the F07 dead-control reasoning made code (the button
   * is disabled; this degrades too).
   */
  calibrateFitToGraph(): void {
    if (!this.calibrateMode()) return;
    const placement = this.activeDefaultPlacement();
    if (placement === null) return;
    this.calibrateDraft = null; // a fit replaces any in-flight draft wholesale
    this.setActiveLayerPlacement(placement);
    this.applyBackgroundTransform();
  }

  /**
   * B-135 (D2 — the tapstream handlers, arrow fields so on/off pair): the
   * drag translates the placement CENTER in model space. tapstart records
   * the rendered anchor and the base placement; tapdrag applies
   * `base + screenDelta / liveZoom` to the DRAFT (the live preview — no
   * signal write, the render follows per event through
   * applyBackgroundTransform); tapend commits ONCE through
   * setActiveLayerPlacement when the gesture actually moved (a TAP — no
   * movement — never writes: the draft stays null). Verified against the
   * installed runtime: the tapstream fires for background- and element-
   * anchored gestures alike (triggerEvents targets the core when no element
   * is under the pointer — cytoscape.esm.mjs:25740), independent of the
   * panning/zooming enables (the emission precedes the gesture effects,
   * cytoscape.esm.mjs:26109/26178) — so disabling the camera does not mute
   * the input stream.
   */
  private calibrateDragStart = (event: { renderedPosition: { x: number; y: number } }): void => {
    if (!this.calibrateMode() || !this.mounted || this.calibrateDrag !== null) return;
    const base = this.currentCalibrateBase();
    if (base === null) return; // no natural yet (C32 spirit)
    this.calibrateDrag = { startX: event.renderedPosition.x, startY: event.renderedPosition.y, base };
  };

  private calibrateDragMove = (event: { renderedPosition: { x: number; y: number } }): void => {
    const drag = this.calibrateDrag;
    if (drag === null) return;
    const delta = this.screenDeltaToModel(
      event.renderedPosition.x - drag.startX,
      event.renderedPosition.y - drag.startY,
    );
    this.calibrateDraft = {
      x: drag.base.x + delta.x,
      y: drag.base.y + delta.y,
      scale: drag.base.scale,
    };
    this.applyBackgroundTransform(); // the live preview, event-driven (D2)
  };

  private calibrateDragEnd = (): void => {
    const draft = this.calibrateDraft;
    this.calibrateDrag = null; // the gesture is over whatever happened
    if (draft === null) return; // a tap (no movement) — places nothing, writes nothing
    this.calibrateDraft = null;
    this.setActiveLayerPlacement(draft); // ONE write per committed gesture (D75/C24)
    this.applyBackgroundTransform();
  };

  /**
   * B-135 (D93 gesture arithmetic — UI plumbing, not a user-displayed
   * number): a screen-px delta becomes a model-space delta through the LIVE
   * zoom — the same arithmetic B-134's transform inverts
   * (screen = pan + model × zoom).
   */
  private screenDeltaToModel(dx: number, dy: number): { x: number; y: number } {
    const z = this.cy.zoom();
    return { x: dx / z, y: dy / z };
  }

  /**
   * B-135: the placement a gesture starts from — the draft (a step between
   * drags), else the live placement (the arm / held D92 default, through the
   * ONE read), else the DEGENERATE fallback's implied model placement (the
   * D84 stage-contain shape's model image: the canvas-center contain fit
   * over the live viewport). The fallback synthesis is what lets a calibrate
   * write replace the fallback with a real arm (the packet's clause); null
   * only when no natural size is known (the gesture degrades to a no-op,
   * C32 spirit).
   */
  private currentCalibrateBase(): { x: number; y: number; scale: number } | null {
    if (this.calibrateDraft !== null) return this.calibrateDraft;
    const placement = this.activeLayerPlacement();
    if (placement !== null) return placement;
    return this.fallbackPlacementBase();
  }

  /**
   * B-135: the degenerate fallback's implied model placement — where and at
   * what scale the D84 stage-contain shape would sit if it WERE a
   * placement: the canvas center in model coordinates, the contain fit
   * divided by the live zoom. Rendering math over the live viewport and the
   * src-tagged natural (the B-134 R1 class — plumbing for the gesture, no
   * user-displayed number originates here).
   */
  private fallbackPlacementBase(): { x: number; y: number; scale: number } | null {
    const natural = this.bgNatural(); // plain read at gesture time (no reactive context)
    if (!this.mounted || natural === null || natural.w <= 0 || natural.h <= 0) return null;
    const z = this.cy.zoom();
    const w = this.cy.width();
    const h = this.cy.height();
    if (!(z > 0) || w <= 0 || h <= 0) return null;
    const pan = this.cy.pan();
    return {
      x: (w / 2 - pan.x) / z,
      y: (h / 2 - pan.y) / z,
      scale: Math.min(w / natural.w, h / natural.h) / z,
    };
  }

  /**
   * B-126 (D83): the property panel's Layer dropdown — the ONE way to move
   * a node between layers. A dropdown pick is a COMPLETE discrete intent
   * (the Connect-button precedent), never a draft field: the change event
   * fires this wrapper immediately. C3 rides the facade unchanged — no edge
   * is touched (a cross-layer arc to the moved node re-badges by DERIVING
   * from the endpoints in the next rebuild; a same-layer arc over the move
   * becomes cross-layer and back, no arc edit). A C30 stranding/portal
   * refusal returns field-precise with nothing touched — the PANEL renders
   * the issues and reverts its select to the live layer (never silently
   * re-parented, D83). The same-layer no-op is guarded HERE too (the
   * facade's own no-op leaves dirty untouched — the wrapper must not draft
   * or bump past it either): a no-change pick is not an edit (the B-116
   * no-move precedent).
   */
  setNodeLayer(nodeId: string, layerId: string): NodeEditRefusal | null {
    const facade = this.facade;
    if (facade === null) return { issues: [{ path: '', message: 'No map is loaded.' }] };
    if (this.map()?.nodes.find((nd) => nd.id === nodeId)?.layer === layerId) {
      return null; // already there — the facade's validating no-op (dirty untouched)
    }
    try {
      facade.setNodeLayer(nodeId, layerId);
    } catch (error) {
      return nodeEditRefusal(error);
    }
    this.recordUnsaved(nodeId); // B-121: the moved node is drafted (a node edit — D82 ruling 4)
    this.rebuildElements(); // the node leaves the old layer's projection, joins the new one's (no fit, B-120)
    this.editorRevision.update((n) => n + 1); // F45/C24: the dock lights
    return null;
  }

  /**
   * B-128 (D85/F02): the property panel's "Opens layer" dropdown — portal
   * WIRING (and unwiring with null), the ONE surface that authors
   * `nodes[i].portal`. A dropdown pick is a COMPLETE discrete intent (the
   * setNodeLayer precedent), never a draft field: the change event fires
   * this wrapper immediately. R2: the ONLY mutation is the facade command
   * `setPortal` — a fresh-object swap whose C30 clone gate refuses all three
   * wiring violations field-precisely (unknown target / the node's own
   * layer / a second node onto an already-wired target); a refusal returns
   * the collected issues with NOTHING touched (reject-before-mutate — the
   * panel renders them and reverts its select). The same-layer no-change
   * pick is guarded HERE (the validating no-op must not draft or bump —
   * the B-116 no-move precedent). On success the node JOINS the B-121 log
   * (a node edit — the moved-node precedent: its object was swapped, so it
   * differs from the saved map now) and the rebuild makes the badge
   * appear/vanish — no fit (B-120); the editorRevision bump lights the save
   * dock and re-reads the live reads (C24).
   */
  setPortal(nodeId: string, layerId: string | null): NodeEditRefusal | null {
    const facade = this.facade;
    if (facade === null) return { issues: [{ path: '', message: 'No map is loaded.' }] };
    if (this.map()?.nodes.find((nd) => nd.id === nodeId)?.portal === layerId) {
      return null; // already wired exactly so (or already unwired) — the validating no-op
    }
    try {
      facade.setPortal(nodeId, layerId);
    } catch (error) {
      return nodeEditRefusal(error);
    }
    this.recordUnsaved(nodeId); // B-121: the wired node is drafted (a node edit)
    this.rebuildElements(); // the portal badge appears/vanishes — no fit (B-120)
    this.editorRevision.update((n) => n + 1); // F45/C24: the dock lights; the live reads re-read
    return null;
  }

  /**
   * B-126 (D82/F54): the standing Detach tool — every arc incident to the
   * node dies in BOTH planes (chat blocks with them, F50); the node itself
   * survives byte-identical (the facade swaps NOTHING on it). Draft-log
   * discipline: the DYING arcs' ids LEAVE the log (the removeEdge
   * precedent) and the node NEVER JOINS — detach is not a node edit, so
   * the node does not light the draft hue (D82 ruling 6). A zero-arc node
   * is the facade's validating no-op (dirty untouched): the wrapper's
   * revision bump re-reads a still-clean dirty flag, so the save dock does
   * NOT appear — a no-op stays invisible. The selection is untouched: the
   * node stays selected, its panel stays open, its arcs vanish from the
   * projection in the rebuild below.
   */
  detachNode(nodeId: string): NodeEditRefusal | null {
    const facade = this.facade;
    const map = this.map();
    const overlay = this.overlay;
    if (facade === null || map === null || overlay === null) {
      return { issues: [{ path: '', message: 'No map is loaded.' }] };
    }
    // The incident edge ids, read pre-command (R4) — the log's leavers.
    const incident = [...map.edges, ...overlay.userEdges]
      .filter((e) => e.source === nodeId || e.target === nodeId)
      .map((e) => e.id);
    try {
      facade.detachNode(nodeId);
    } catch (error) {
      return nodeEditRefusal(error);
    }
    for (const id of incident) this.forgetUnsaved(id); // B-121: the dying arcs' ids leave the log
    this.rebuildElements(); // the arcs (and any cross-layer badges riding them) vanish — no fit (B-120)
    this.editorRevision.update((n) => n + 1); // F45/C24: the dock lights on a real teardown
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
   * simply gains a sibling), each with the map's D78 default-allowed mode
   * set — `defaultArcModes()`, the SAME private derivation the draw-arc
   * commit uses (B-124: one derivation, D42's "the default-allowed set";
   * on a no-registry map exactly the D42 trio — all modes allowed,
   * geometry-priced via C14 row 5). Ids are the engine's
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
        facade.upsertEdge({ id: '', source, target, modes: this.defaultArcModes() });
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

  // --- Draw-arc (PKG B-122, §5 Phase 3 M2 — D42/D78/F17/C3/F46/F45) -----------

  /**
   * B-122: clear the pending pick (and its feedback) — the ONE cancel seam
   * for every escape hatch: the source tap, the background/compound-box tap,
   * a tool switch, the editor exit and the map load. Signal writes only; the
   * class effect re-projects the accent off the null pick (R3).
   */
  private clearDrawPick(): void {
    this.drawArcSourceId.set(null);
    this.drawArcFeedback.set(null);
  }

  /**
   * B-122 (the gesture, one per mode — D53): route an Arc-tool node tap.
   * Eligibility is the B-118 precedent restricted to the LIBRARY plane (an
   * authored arc's endpoints are library nodes — MapEdgeData.source/target):
   * `map.nodes`, active layer, `isPinEligible` (kind ∈ {location, hub,
   * waypoint} AND childless — exactly the C1 leaf rule validateWorldMap
   * enforces on edge endpoints, so a commit can never be refused on it).
   * Branches, in order:
   *   - badge pseudo-node (arc OR portal — both carry tme-badge): not an
   *     endpoint — a no-op that KEEPS the pick;
   *   - compound parent (the box, B-120's no-op branch): CANCEL the pick;
   *   - the pending source itself: CANCEL the pick;
   *   - a waypoint or any non-eligible/foreign-layer leaf: a no-op that
   *     KEEPS the pick (degrade, never throw — C32 spirit);
   *   - eligible leaf + no pending source: SET the pick (stale feedback
   *     clears — the connectFeedback precedent);
   *   - eligible leaf + an ORPHANED source (removed mid-pick): CANCEL the
   *     stale pick — never a narrated line that would be false;
   *   - eligible leaf + pending source (ANY layer — B-128 un-fenced the
   *     cross-layer pair): COMMIT (commitDrawArc). The only physical
   *     cross-layer shape is a mid-pick layer switch — the pick is kept and
   *     narrated by selectLayer, and the tap on the new layer commits (D85;
   *     C3 badges the arc). The B-122 refusal fence and its constant are
   *     RETIRED (D85).
   * F46: no selection is ever written here — picks are arc endpoints, not
   * editing selections.
   */
  private handleDrawArcTap(node: NodeSingular): void {
    const map = this.map();
    const layerId = this.activeLayer();
    if (map === null || layerId === null) return; // degrade before loadMap (C32 spirit)
    if (node.hasClass('tme-badge')) return; // a badge is never an endpoint — pick kept
    if (node.isParent()) {
      this.clearDrawPick(); // the compound box: cancel (the B-120 no-op branch)
      return;
    }
    const id = node.id();
    const authored = map.nodes.find((nd) => nd.id === id);
    if (authored === undefined) return; // a waypoint (wp-) is not a pick — pick kept
    if (id === this.drawArcSourceId()) {
      this.clearDrawPick(); // the source tap cancels its own pick
      return;
    }
    // The ONE eligible rule (B-118 precedent over the library plane). The
    // layer guard is a data guard — the projection only shows active-layer
    // leaves, so it cannot fire for a real tap.
    if (!isPinEligible(id, map.nodes) || authored.layer !== layerId) return;
    const sourceId = this.drawArcSourceId();
    if (sourceId === null) {
      this.drawArcFeedback.set(null);
      this.drawArcSourceId.set(id);
      return;
    }
    const source = map.nodes.find((nd) => nd.id === sourceId);
    if (source === undefined) {
      // The pending source was REMOVED mid-pick (the B-117 delete seam can
      // still reach it through the property panel's stale selection) — the
      // pick is orphaned: cancel it. A narrated line here would be false
      // (C23 spirit); the next tap starts a fresh pick.
      this.clearDrawPick();
      return;
    }
    // B-128 (D85 — the F17 un-fence): a source on another layer is the KEPT
    // mid-pick pick (selectLayer narrated it) — the cross-layer tap COMMITS.
    // The B-122 fence refusal (DRAW_ARC_CROSS_LAYER) is retired with it.
    this.commitDrawArc(sourceId, id);
  }

  /**
   * B-122 (D42/D78): the map's default-allowed mode set for a drawn arc —
   * every BUILT-IN unless a registry entry adopting that id sets
   * `allowedByDefault: false`, plus every registry entry with
   * `allowedByDefault: true` (an adopting true entry is already in). On a
   * no-registry map (FX1 today) this is exactly the D42 quick-connect trio —
   * all three built-ins allowed, geometry-priced via C14 row 5 (B-124:
   * quick-connect's Done commits THIS derivation now — one derivation, one
   * D42 default-allowed set). A registry that opts out of everything
   * yields `modes: {}` — legal (never traversable) and refineable in the arc
   * panel (B-123).
   */
  private defaultArcModes(): MapEdgeData['modes'] {
    const registry = this.map()?.modes ?? [];
    const modes: MapEdgeData['modes'] = {};
    const adopted = new Map(registry.map((declaration) => [declaration.id, declaration] as const));
    for (const id of BUILT_IN_MODES) {
      const declaration = adopted.get(id);
      if (declaration === undefined || declaration.allowedByDefault) {
        modes[id] = { allowed: true };
      }
    }
    for (const declaration of registry) {
      if (declaration.allowedByDefault && modes[declaration.id] === undefined) {
        modes[declaration.id] = { allowed: true };
      }
    }
    return modes;
  }

  /**
   * B-122 (the commit): ONE `facade.upsertEdge` with `id: ''` (the engine
   * assigns `arc-<n>` — C5/D75) — parallel arcs stay possible (C4: no dedup,
   * the D42 ruling; drawing the same pair twice commits a sibling). The new
   * arc's id is discovered by the C5/D75 projection DELTA (the doneConnect
   * seam: a single create can only add one edge). F45/D75: the command marks
   * only `dirty` — the arc RENDERS (the rebuild re-reads the live map, one
   * cy.batch — B-112; NO fit, B-120) but routing and the snapshot serve the
   * SAVED graph until saveMap, so no graphRevision bump and no snapshot
   * refresh. Then the B-121 seam records the arc, the pick clears (the TOOL
   * stays on — consecutive arcs), and the new arc is SELECTED through the
   * existing edgeSelection signal so the arc panel opens on it (B-106 mutual
   * exclusion: the node selection clears — an edge tap's exact semantics).
   * B-128 (D85): the commit is LAYER-AGNOSTIC now — a kept mid-pick pick
   * commits cross-layer (C3: the arc projects as BADGES on both ends, never
   * as an edge), and the created arc's id reaches the B-121 log through the
   * known-ids fallback below. A C30 refusal is otherwise unreachable by
   * construction (eligible leaves, registry-derived modes) but degrades to
   * the banner, never a throw (C32).
   */
  private commitDrawArc(source: string, target: string): void {
    const facade = this.facade;
    if (facade === null) return; // no core to commit into — pick kept (C32 spirit)
    const beforeEdgeIds = this.projectedEdgeIds;
    // B-128 (D85): the KNOWN-arc-ids snapshot over the live references (R4) —
    // the discovery fallback for a CROSS-LAYER commit, which B-128's un-fence
    // now creates: such an arc never joins the projection (C3), so the
    // projected-edge delta below is empty exactly when the un-fence fired.
    const knownIds = new Set(
      [...(this.map()?.edges ?? []), ...(this.overlay?.userEdges ?? [])].map((e) => e.id),
    );
    try {
      facade.upsertEdge({ id: '', source, target, modes: this.defaultArcModes() });
    } catch (error) {
      this.drawArcFeedback.set(error instanceof Error ? error.message : String(error));
      return;
    }
    this.rebuildElements();
    let createdId: string | null = null;
    for (const id of this.projectedEdgeIds) {
      if (!beforeEdgeIds.has(id)) {
        createdId = id;
        break;
      }
    }
    if (createdId === null) {
      // B-128: the cross-layer discovery — exactly ONE library edge joined the
      // live map (one create per commit; C4 keeps parallel siblings distinct),
      // and its id must reach the B-121 log even though it projects as badges
      // only (the badge IS the arc's whole canvas surface — the draft hue
      // lands on its badges through projectDraftClasses).
      const fresh = (this.map()?.edges ?? []).filter((edge) => !knownIds.has(edge.id));
      if (fresh.length === 1) createdId = fresh[0].id;
    }
    if (createdId !== null) this.recordUnsaved(createdId); // B-121 (D77): every editor command records here
    this.clearDrawPick();
    this.selection.set(null); // B-106 mutual exclusion
    if (createdId !== null) this.edgeSelection.set({ id: createdId }); // the arc panel opens on the new arc
    this.editorRevision.update((n) => n + 1); // F45: the dock lights
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
   * B-123: the arc's own terrain/authoredDistance/curve fields join verbatim
   * (R4 presence reads, never copies) and `library` settles the EDITOR
   * plane (only map.edges arcs are draftable — the overlay lookup second).
   */
  arcInfo(edgeId: string): ArcInfo | null {
    const map = this.map();
    let edge: MapEdgeData | undefined = map?.edges.find((candidate) => candidate.id === edgeId);
    if (edge === undefined) {
      edge = this.overlay?.userEdges.find((candidate) => candidate.id === edgeId);
    }
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
      terrain: edge.terrain ?? null,
      authoredDistance: edge.authoredDistance ?? null,
      curveDistances: edge.curve === undefined ? null : [...edge.curve.distances],
      library: map?.edges.some((candidate) => candidate.id === edgeId) ?? false,
    };
  }

  /**
   * B-123 (D78/C23): the per-mode EDIT rows for one arc — the map's WHOLE
   * mode universe (built-ins ∪ registry ids, insertion order: walk, car,
   * train, then the registry's declaration order) each rowed with the ONE
   * core resolver's label and the arc's own spec verbatim (an absent key
   * rows as not-allowed — C14 row 2's honest display). Library arcs only:
   * the draft sections edit the library plane (arcInfo's `library` gate);
   * an unknown/non-library id answers null (degrade, never throw — C32
   * spirit). A lookup, never a copy (R4) — the panel drafts LOCAL copies
   * (C29/R2).
   */
  arcModesOf(arcId: string): readonly ArcModeRow[] | null {
    const map = this.map();
    const edge = map?.edges.find((candidate) => candidate.id === arcId);
    if (map === null || edge === undefined) return null;
    // B-124: the SAME insertion-order universe helper the switch rows read —
    // one derivation, the two surfaces can never drift.
    return this.modeUniverseIds(map).map((id) => ({
      id,
      label: resolveModeLabel(id, map.modes), // A-016's ONE resolver — authored words, never UI-mapped
      allowed: edge.modes[id]?.allowed === true,
      authoredMinutes: edge.modes[id]?.authoredMinutes ?? null,
    }));
  }

  /**
   * B-123 (R1/D44): the live scale — the measure section's readout source.
   * A number shown to the user MUST come from the core: this exposes the
   * core's own scale block verbatim (R4). An in-place `calibrateScale`
   * mutates the object's fields (C24 — state.map is never reassigned), so
   * the editorRevision signal (bumped by every editor command) is the
   * recompute dependency; the values themselves stay the core's.
   * A-015's D75 honesty note: pricing serves the SAVED scale until saveMap —
   * this readout is the live DRAFT truth, and the panel says so.
   */
  readonly scaleNow = computed<WorldMapData['scale'] | null>(() => {
    void this.editorRevision(); // dependency: an in-place calibration re-reads (C24)
    return this.map()?.scale ?? null;
  });

  /**
   * B-123 (R4): live lookup of one LIBRARY arc by id — `arcModesOf`'s twin
   * (the nodeDataById precedent). The draft's full-replace commit spreads
   * this live reference (`...edge` — the B-117 commitDraft precedent: a
   * lookup, never a copy; the panel builds the fresh commit object it
   * sends). Overlay `we-` arcs and unknown ids answer null — no editor
   * command exists for the chat plane (D75/B-116).
   */
  edgeDataById(id: string): MapEdgeData | null {
    return this.map()?.edges.find((candidate) => candidate.id === id) ?? null;
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
   * here. B-106 + D81, narrowed by D91: resizes split by class. An
   * ENVIRONMENTAL resize (the browser viewport itself changed — window
   * resize, orientation change) and every resize on the NARROW layout keep
   * B-106's refit — the stage's fixed chrome (header top, breadcrumb,
   * layer switcher bottom-left) overlays the canvas, so content fitted for a
   * taller stage can otherwise end up underneath that chrome once the rail
   * collapses at phone width, untappable (found live by the arc-panel phone
   * e2e: the castle node landed under a layer button); the refit keeps the
   * whole layer visible AND tappable at any stage size. A PANEL-DRIVEN
   * resize on the WIDE layout PRESERVES the viewport instead: zoom untouched,
   * pan untouched — zero compensation — with a pan-only selection rescue
   * clamp when the selection's rendered box would sit outside the canvas or
   * under interactive chrome. D91: the panel-driven class is now the rail's
   * ALONE — the four panels are overlays (floaters on wide, bottom sheets on
   * narrow) and their open/close resizes nothing, so the only wide container
   * resize that reaches here is the rail column's collapse/expand. Either
   * path writes no signals (D2 — outside Angular, like mount()'s fit).
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
  notifyResize(interactiveChrome?: readonly ChromeRect[]): void {
    if (!this.mounted) return;
    // D81: the resize-CLASS discriminator — the VIEWPORT is the class input
    // (the container resize is the event itself). Either viewport dimension
    // changed since last seen ⇒ ENVIRONMENTAL; unchanged ⇒ PANEL-DRIVEN
    // (D91: on wide, the rail's collapse/expand only). Refreshed on every
    // call; plain fields (D2 — this path is outside Angular).
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const environmental =
      this.lastViewportW === null ||
      this.lastViewportH === null ||
      vw !== this.lastViewportW ||
      vh !== this.lastViewportH;
    this.lastViewportW = vw;
    this.lastViewportH = vh;
    this.cy.resize();
    if (environmental || !window.matchMedia(WIDE_LAYOUT_QUERY).matches) {
      // D91 matrix — the refit classes: an environmental resize (either
      // layout) and any resize on the narrow layout keep B-106's blanket
      // guarantee (everything fitted stays visible and tappable). This body
      // is byte-identical to the pre-D81 refit.
      this.fitView();
      this.applyLabelCull();
    } else {
      // D91 matrix — the preserve class (wide + panel-driven, i.e. the
      // rail's collapse/expand): zoom and pan are PRESERVED — fit NEVER runs
      // here, zero compensation — with the pan-only selection rescue clamp
      // keeping the selection inside the canvas and clear of interactive
      // chrome. D91: panel open/close can no longer reach this path at all —
      // the panels overlay the stage and the RO never fires for them.
      this.clampSelectionIntoView(interactiveChrome);
      this.applyLabelCull(); // belt-and-braces: a pan never crosses the zoom threshold
    }
  }

  /**
   * D81: the rescue clamp's target — the selected element's RENDERED box
   * (canvas-relative px) plus its anchor kind. A node selection anchors as
   * the whole box; a cross-layer arc's selection resolves to its badge
   * pseudo-node (the edge is never projected, C3 — and the badge IS the
   * arc's whole canvas surface, B-107), also a box; a PROJECTED arc anchors
   * as the box's MIDPOINT (`point` — an edge box can be longer than the
   * chrome-free region at the current zoom; the invariant's edge semantics).
   * null when nothing is selected or projected ⇒ the clamp no-ops.
   */
  private selectionAnchor(): { x1: number; y1: number; x2: number; y2: number; point: boolean } | null {
    const nodeSel = this.selection();
    const edgeSel = this.edgeSelection();
    let ele: CollectionReturnValue | null = null;
    let point = false;
    if (nodeSel !== null) {
      ele = this.cy.getElementById(nodeSel.id);
    } else if (edgeSel !== null) {
      const edge = this.cy.getElementById(edgeSel.id);
      if (edge.length > 0) {
        ele = edge;
        point = true; // arc anchor: the rendered box's midpoint
      } else {
        ele = this.cy.getElementById(`tme-badge-${edgeSel.id}`); // B-107
      }
    }
    if (ele === null || ele.length === 0) return null;
    const box = ele.renderedBoundingBox(); // BoundingBox12: canvas-px x1/y1/x2/y2
    return { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2, point };
  }

  /**
   * D81, narrowed by D91: the pan-only SELECTION RESCUE CLAMP — keep the
   * selection's anchor inside the canvas and clear of the INTERACTIVE chrome
   * after a wide-layout panel-driven resize (the rail's collapse/expand —
   * the only resize class that still reaches it). No selection ⇒ nothing;
   * already clear ⇒ a no-op
   * (idempotent — repeated resizes settle); otherwise ONE instant `cy.pan()`
   * correction (no animation — the refit is instant too; zoom NEVER changes).
   * A pan delta shifts every rendered position equally (rendered =
   * model·zoom + pan — the installed runtime's modelToRenderedPosition), so
   * the rescue solves for a single (dx, dy): minimal canvas containment
   * first, then a greedy smallest-legal-shift clear per overlapping chrome
   * rect (disjointness in ONE axis suffices; the canvas center band is
   * chrome-free, so a clearing pan always exists). Chrome rects come from
   * the component (canvas-relative, consumer-measured); absent ⇒ the canvas
   * rect alone. Writes NO signals (D2 — the whole resize path stays outside
   * Angular), logs nothing. Viewer mechanics, not a user-facing number
   * (R1 not engaged).
   */
  private clampSelectionIntoView(chrome?: readonly ChromeRect[]): void {
    const anchor = this.selectionAnchor();
    if (anchor === null) return;
    // An arc anchor collapses to its midpoint — a zero-size box keeps ONE
    // rectangle algebra for both anchor kinds below.
    if (anchor.point) {
      anchor.x1 = anchor.x2 = (anchor.x1 + anchor.x2) / 2;
      anchor.y1 = anchor.y2 = (anchor.y1 + anchor.y2) / 2;
    }
    // Sanitized chrome: non-finite or empty rects are skipped — a measurement
    // failure degrades to the canvas-rect-only clamp, never an exception
    // (C32 spirit).
    const rects = (chrome ?? []).filter(
      (r) =>
        Number.isFinite(r.x) &&
        Number.isFinite(r.y) &&
        Number.isFinite(r.w) &&
        Number.isFinite(r.h) &&
        r.w > 0 &&
        r.h > 0,
    );
    const canvas = { x1: 0, y1: 0, x2: this.cy.width(), y2: this.cy.height() };
    let dx = 0;
    let dy = 0;
    // Strict-overlap predicate: touching edges count as disjoint (clear).
    const overlaps = (r: ChromeRect): boolean =>
      anchor.x1 + dx < r.x + r.w &&
      anchor.x2 + dx > r.x &&
      anchor.y1 + dy < r.y + r.h &&
      anchor.y2 + dy > r.y;
    // 1) Canvas containment — the minimal per-axis shift (a box wider than
    //    the stage cannot fully fit; the left/top edge wins, best effort).
    if (anchor.x1 + dx < canvas.x1) dx = canvas.x1 - anchor.x1;
    else if (anchor.x2 + dx > canvas.x2) dx = canvas.x2 - anchor.x2;
    if (anchor.y1 + dy < canvas.y1) dy = canvas.y1 - anchor.y1;
    else if (anchor.y2 + dy > canvas.y2) dy = canvas.y2 - anchor.y2;
    // 2) Chrome clearance — per overlapping rect, the smallest ONE-axis shift
    //    that disjointness-satisfies it while the box stays canvas-contained;
    //    re-pass while anything still overlaps. The pass cap degrades to best
    //    effort instead of hunting forever (C32 spirit).
    for (let pass = 0; pass <= rects.length && pass < 12; pass++) {
      let settled = true;
      for (const r of rects) {
        if (!overlaps(r)) continue;
        settled = false;
        const clearLeft = r.x - (anchor.x2 + dx); // box's right edge → rect's left
        const clearRight = r.x + r.w - (anchor.x1 + dx);
        const clearUp = r.y - (anchor.y2 + dy);
        const clearDown = r.y + r.h - (anchor.y1 + dy);
        const candidates: { d: number; axis: 'x' | 'y' }[] = [];
        if (anchor.x1 + dx + clearLeft >= canvas.x1) candidates.push({ d: clearLeft, axis: 'x' });
        if (anchor.x2 + dx + clearRight <= canvas.x2) candidates.push({ d: clearRight, axis: 'x' });
        if (anchor.y1 + dy + clearUp >= canvas.y1) candidates.push({ d: clearUp, axis: 'y' });
        if (anchor.y2 + dy + clearDown <= canvas.y2) candidates.push({ d: clearDown, axis: 'y' });
        if (candidates.length === 0) continue; // cannot clear this one legally — best effort
        const best = candidates.reduce((m, c) => (Math.abs(c.d) < Math.abs(m.d) ? c : m));
        if (best.axis === 'x') dx += best.d;
        else dy += best.d;
      }
      if (settled) break;
    }
    if (dx === 0 && dy === 0) return; // in view and clear — idempotent no-op
    const pan = this.cy.pan();
    this.cy.pan({ x: pan.x + dx, y: pan.y + dy }); // ONE instant rescue, zoom untouched
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

  /**
   * B-128 (D85): one PORTAL badge's label (the target layer's authored NAME,
   * C23) by its WIRE NODE's id, or null when no portal badge for that node
   * is projected (unwired / other layer / unknown id). A read-only seam —
   * no mutation path (R2/R4 hold); the testBadgeText precedent.
   */
  testPortalBadgeText(nodeId: string): string | null {
    const badge = this.cy.getElementById(`tme-portal-badge-${nodeId}`);
    return badge.length === 0 ? null : String(badge.data('label') ?? '');
  }

  /**
   * B-128 (D85): the ACTIVE layer's breadcrumb chain exactly as rendered —
   * the pure `breadcrumbChain` ids through the `breadcrumb` computed's name
   * join is template state, so this seam reads the COMPUTED (the rendered
   * crumb row's truth), as ids in chain order. Empty pre-load / a root
   * layer's length-1 chain included — the spec asserts the length too. A
   * read-only seam (R2/R4 hold); the testBadgeText precedent.
   */
  testBreadcrumbChain(): string[] {
    return this.breadcrumb().map((crumb) => crumb.id);
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
   * B-126 (D82/R1): the facade's layer-removal counts for the e2e spec —
   * the dialog's three numbers asserted against the ENGINE's own answer
   * (never a spec-side recount). Null when no map is loaded or the id is
   * unknown (degrade, C32 spirit). Read-only, no mutation path (R2/R4
   * hold) — the testDraftedIds precedent.
   */
  testLayerRemovalImpact(layerId: string): LayerRemovalImpact | null {
    return this.layerRemovalImpact(layerId);
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
   * B-122: the pending draw-arc source's id, or null (the testPickedNodeIds
   * precedent — read-only, no mutation path, so R2/R4 hold).
   */
  testDrawArcSourceId(): string | null {
    return this.drawArcSourceId();
  }

  /**
   * B-122: the draw-arc banner's current message, or null (read-only; the
   * cross-layer refusal's visibility seam).
   */
  testDrawArcFeedback(): string | null {
    return this.drawArcFeedback();
  }

  /**
   * B-118: the current quick-connect pick set in pick order (Set iteration
   * is insertion order). Read-only (R2/R4 hold).
   */
  testPickedNodeIds(): string[] {
    return [...this.connectPicks()];
  }

  /**
   * B-118 (extended by B-123): the AUTHORED fields of one LIBRARY edge for
   * e2e — the D42-default assertions (source/target/all-modes-allowed) and,
   * since B-123's arc-editing panels, the editing-plane fields the panel
   * commits (terrain, authoredDistance, curve distances) off the live map
   * reference (quick-connect and edit arcs land in `map.edges` via
   * upsertEdge). A plain copy for the wire; read-only, no mutation path
   * (R2/R4 hold). Overlay edges and unknown ids answer null.
   */
  testEdgeData(id: string): {
    id: string;
    source: string;
    target: string;
    modes: string[];
    /** B-123: the authored terrain, or null when unset (C12). */
    terrain: string | null;
    /** B-123: the authored distance override, or null when unset (D14). */
    authoredDistance: number | null;
    /** B-123: the authored curve control-point distances, or null when unset. */
    curveDistances: number[] | null;
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
      terrain: edge.terrain ?? null,
      authoredDistance: edge.authoredDistance ?? null,
      curveDistances: edge.curve === undefined ? null : [...edge.curve.distances],
    };
  }

  /**
   * B-123: the per-mode EDIT rows of one arc (`arcModesOf`) — the map's mode
   * universe with the resolver's labels and the arc's own spec state, the
   * D78/C23 display seam for e2e. Unknown id answers null (degrade, C32
   * spirit). Read-only (R2/R4 hold).
   */
  testArcModesOf(id: string): { id: string; label: string; allowed: boolean; authoredMinutes: number | null }[] | null {
    const rows = this.arcModesOf(id);
    if (rows === null) return null;
    return rows.map((row) => ({ id: row.id, label: row.label, allowed: row.allowed, authoredMinutes: row.authoredMinutes }));
  }

  /**
   * B-124: the route panel's switch rows (`modeRows`) — the map's mode
   * universe with the resolver's labels, the D78/C23 display seam for e2e
   * (the testArcModesOf twin). Empty before loadMap. Read-only (R2/R4 hold).
   */
  testModeRows(): { id: string; label: string }[] {
    return this.modeRows().map((row) => ({ id: row.id, label: row.label }));
  }

  /**
   * B-135: whether the calibrate mode is currently on — the mode-state seam
   * (the testConnectMode precedent). Read-only (R2/R4 hold).
   */
  testCalibrateMode(): boolean {
    return this.calibrateMode();
  }

  /**
   * B-135: the ACTIVE layer's PERSISTED placement arm — the live map read
   * (R4, never a copy), null when the arm is absent (the held D92 default is
   * deliberately NOT folded in: the spec distinguishes "committed" from
   * "computed-and-held"). The committed-gesture assertion seam. Read-only
   * (R2/R4 hold).
   */
  testActiveLayerPlacement(): { x: number; y: number; scale: number } | null {
    const layer = this.map()?.layers.find((l) => l.id === this.activeLayer());
    return layer?.backgroundPlacement ?? null;
  }

  /**
   * B-135 (D92 — the shared-seam read): the ACTIVE layer's default-fit
   * placement through activeDefaultPlacement (B-134's defaultPlacementFor —
   * the ONE derivation), so a fit-to-graph cell asserts the written value
   * against the same function the write used. Null when degenerate/absent.
   * Read-only (R2/R4 hold).
   */
  testDefaultPlacement(): { x: number; y: number; scale: number } | null {
    return this.activeDefaultPlacement();
  }

  /**
   * B-123 (R1/D44): the live scale's verbatim numbers — the measure section's
   * readout seam (an in-place calibration mutates these fields, C24, so the
   * read is always the live draft truth). Null before loadMap. Read-only
   * (R2/R4 hold).
   */
  testScaleInfo(): { unitPerPx: number; unitLabel: string; unitKind: string } | null {
    const scale = this.map()?.scale;
    if (scale === undefined) return null;
    return { unitPerPx: scale.unitPerPx, unitLabel: scale.unitLabel, unitKind: scale.unitKind };
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
    // B-128 (D85/F02): this layer's PORTAL badges join the same batch — one
    // pseudo-node per wired node (the shared B-107 machinery: same anchor
    // assembly, same cull-coherent class; the distinct tme-portal-badge class
    // carries the depth hue). F02's "there is depth here" is ONE visual
    // language: a badge. The portal badge is display-only on single taps
    // (the badge branch above swallows them — no arcId); its double-activation
    // is the entry gesture (the constructor's binding).
    const portalBadges = buildPortalBadges(map, layerId);
    // B-131 (D94/F55/C34): the blocked-NODE markers join the same batch — one
    // DISTINCT badge pseudo-node per blocked node on this layer, derived from
    // `overlay.nodeBlocked` in the element build (the dashed-arc class
    // precedent reading `overlay.blocked`) and cleared by this very rebuild
    // on lift. Same shared badge machinery (the portal-badge precedent):
    // cull-coherent, tap-swallowed, never draggable.
    const blockBadges = this.buildBlockedNodeBadges(map, layerId);
    // B-116 (C5/D75): record the node ids of the projection being installed —
    // the pre-command set the place-command's id delta reads (placeNodeAt).
    // Derived from the same pure builders' output, so it can never drift from
    // what cy actually holds. B-121: the EDGE ids join it — doneConnect's
    // committed-arc discovery reads that delta.
    const projected = [...elements, ...badges, ...portalBadges, ...blockBadges];
    this.projectedNodeIds = new Set(
      projected.filter((el) => el.group === 'nodes').map((el) => String(el.data.id)),
    );
    this.projectedEdgeIds = new Set(
      projected.filter((el) => el.group === 'edges').map((el) => String(el.data.id)),
    );
    this.cy.batch(() => {
      this.cy.elements().remove();
      this.cy.add([...elements, ...badges, ...portalBadges, ...blockBadges]);
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
   * B-131 (D94/F55/C34): the blocked-NODE marker — one DISTINCT badge per
   * blocked node ON the active layer, riding the EXISTING badge machinery
   * (the B-128 portal-badge precedent): projection pseudo-NODES with the
   * SHARED `tme-badge` class (cull-coherence comes free — badges cull WITH
   * content, B-115, and no `min-zoomed-font-size` may ever be set, the
   * B-107 hide-floor gotcha) plus a DISTINCT `tme-node-blocked-badge` class
   * whose stylesheet entry carries the blocked hue — one visual language
   * with the dashed `tme-blocked` arcs. Presence derives from
   * `overlay.nodeBlocked` in the element build (the dashed-arc class
   * precedent reading `overlay.blocked`, D20) and the lift clears it via
   * the rebuild (afterGraphMutation's rebuildElements). The label is the
   * reason verbatim in the arc-badge tail format (`blocked: <reason>` — C2
   * spirit: the reason IS the payload). The host's id rides as `nodeId`
   * data (carried, never parsed out of the prefixed id — the B-108
   * precedent); single taps are display-only no-ops (the badge branch
   * swallows them — no arcId data; the portal-badge precedent). A blocked
   * node off this layer, unknown to the merged set, or without an authored
   * position degrades to NO badge, never a throw (C32 spirit). R4: a live
   * read of the overlay reference, mutates nothing; R1: the offset is
   * LAYOUT (NODE_BLOCK_BADGE_OFFSET, the BADGE_OFFSET precedent), never
   * computed geography.
   */
  private buildBlockedNodeBadges(map: WorldMapData, layerId: string): ElementDefinition[] {
    const overlay = this.overlay;
    if (overlay === null) return [];
    const badges: ElementDefinition[] = [];
    const allNodes = [...map.nodes, ...overlay.userNodes];
    for (const [nodeId, reason] of Object.entries(overlay.nodeBlocked)) {
      const host = allNodes.find((node) => node.id === nodeId);
      // Off-layer / unknown / position-less hosts degrade to nothing — the
      // marker only exists where its node is drawn (C32 spirit).
      if (host === undefined || host.layer !== layerId || host.position === undefined) continue;
      badges.push({
        group: 'nodes' as const,
        data: { id: `tme-node-blocked-badge-${nodeId}`, label: `blocked: ${reason}`, nodeId },
        position: {
          x: host.position.x + NODE_BLOCK_BADGE_OFFSET,
          y: host.position.y + NODE_BLOCK_BADGE_OFFSET,
        },
        classes: ['tme-badge', 'tme-node-blocked-badge'],
        grabbable: false, // pinned pseudo-node — the compound-parent field (B-103 note)
      });
    }
    return badges;
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
    const drawSource = this.drawArcSourceId(); // B-122: signal read = effect dependency
    this.cy.nodes().removeClass('tme-selected');
    if (sel !== null) this.cy.getElementById(sel.id).addClass('tme-selected');
    this.cy.edges().removeClass('tme-edge-selected');
    if (edgeSel !== null) this.cy.getElementById(edgeSel.id).addClass('tme-edge-selected');
    // B-118 (F46): the pick set's DISTINCT accent — never tme-selected; a
    // pick is an arc endpoint, not an editing selection.
    this.cy.nodes().removeClass('tme-connect-pick');
    for (const id of picks) this.cy.getElementById(id).addClass('tme-connect-pick');
    // B-122 (F46): the draw pick's DISTINCT accent — the same never-selected
    // rule, the same one-function projection for the effect and every
    // rebuild batch (the paths can never diverge).
    this.cy.nodes().removeClass('tme-draw-pick');
    if (drawSource !== null) this.cy.getElementById(drawSource).addClass('tme-draw-pick');
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
