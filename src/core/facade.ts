// src/core/facade.ts — the CORE.md §9 facade: the only command surface the
// frontend (src/app) and host (src/st) may call (R2). The MapFacade interface
// is frozen with api.ts (contract freeze, AGENTS.md §4); packets implement
// bodies, never the surface. M1 (A-002) implements the map-lifecycle and
// presence commands over the C8 materializer.
//
// Internal state holds REFERENCES, never copies (C24): the host may mutate the
// library object in place, and materialize() propagates those edits on the
// next rebuild. Mutations only set the `stale` flag (C8 rebuild-on-change);
// the atomic rebuild happens in materialize() or in the next query's
// ensureFresh(). M1 (A-002) implements the map-lifecycle and presence
// commands; M2 (A-006) adds findRoute + setBlocked; M2 (A-007) adds the
// waypoint commands addUserNodeAt / removeUserNode / promoteUserNode; M3
// (A-008) adds setCorrective + getSnapshot over the shared D60 pricer
// (routing/price.ts) and the pure snapshot builder (snapshot/build.ts); M3
// (A-009) adds renderTemplate + getPromptBlock over the injected engine
// (D62) with the C32 default-template fallback. D65 (A-011) refines the
// snapshot seam: ONE honest currency per snapshot (all-rule routes currency,
// forced-currency destination runs) and blocked arcs that always list. P2 M1
// (B-101) adds setActiveLayer — facade-held viewer state (F01/D69), not map
// data and untouched by the snapshot. P3 M1 (A-013) adds the editor commands —
// upsertNode/upsertEdge/removeNode/removeEdge + saveMap/hasUnsavedChanges
// (D75): C30 clone-validate-apply, C5 engine ids on create, F45 explicit-save
// dirty/stale semantics. A-014 (gate fix, D75 amendment) adds the SAVED
// id-plane universes (savedNodeIds/savedEdgeIds — populated at loadMap,
// refreshed at saveMap) and gates the RUNTIME commands on them, so while
// dirty no presence/overlay command binds unsaved library state: the pin and
// setBlocked's add path refuse field-precisely (C30) and the C7 kNN scans
// saved candidates only — validateOverlay must never find a chat key that
// references data the SAVED map lacks (F50). A-015 implements calibrateScale
// (C13/D44/D45, "measure this arc") with the savedScale pricing seam: the
// pricing closures read a SAVED scale snapshot (taken at loadMap, refreshed
// at saveMap — the A-014 doctrine: the saved plane moves only at load/save),
// so an unsaved calibration never enters routing or the snapshot (D75/F45).
// A-016b (A-016's lead ruling, D78/C19) widens the DEFAULT pricing scans —
// computeRoute's no-mode fallback, getSnapshot's candidates + currency
// predicates, snapshot/build.ts's routesCurrency — to the loaded map's mode
// universe (built-ins ∪ registry ids): a registry-only arc is priceable in
// default runs and never silently drops from C19's route list; explicit
// modes stay strict (C14 row 2), the C14/C15 arithmetic stands, and a
// no-registry map prices byte-identically (the trio IS its universe). A-017
// (P3 M3, D82–D85) adds the layer commands — the manager sheet's
// create/rename/reorder/informed-cascade delete, the R1 impact query, the
// node detach tool, the property panel's node move and portal wiring, and
// the per-layer background reference. D16 restated: the pin, routing and
// the snapshot are layer-agnostic — no layer command touches them, and none
// ever rebuilds the effective graph (D75: dirty, never stale; saveMap owns
// the rebuild).
// Commands still unimplemented throw their exact TODO markers — never fake
// data (Task 0 rule).

import type {
  ChatMapOverlay,
  LayerBackground,
  LayerData,
  LayerRemovalImpact,
  MapEdgeData,
  MapNodeData,
  MapSnapshot,
  RouteLeg,
  RouteResult,
  TemplateCompiler,
  TravelMode,
  WorldMapData,
} from './api';
import { euclid } from './geometry/measure';
import { buildEffectiveGraph } from './model/effective';
import type { EffectiveGraph } from './model/effective';
import { migrateWorldMap } from './model/migrate';
import { isPinEligible, modeUniverseOf, resolveModeLabel, validateOverlay, validateWorldMap } from './model/validate';
import { shortestPath } from './routing/dijkstra';
import { minutesPriced, priceEdgeIn } from './routing/price';
import type { CostCurrency } from './routing/price';
import { buildSnapshot } from './snapshot/build';
import { DEFAULT_TEMPLATE, snapshotContext } from './templates/default';

/** CORE.md §9 — the facade command surface. */
export interface MapFacade {
  // Map lifecycle
  loadMap(map: WorldMapData, overlay: ChatMapOverlay): void;
  materialize(): void;
  forkMap(): void;
  saveForkToLibrary(): void;
  validateImport(data: unknown): void;
  migrateData(data: unknown): WorldMapData;
  // Presence
  setCurrentLocation(id: string | null): void;
  setStatusNote(note: string | undefined): void;
  setTravelMode(mode: TravelMode): void;
  setCorrective(text: string | undefined): void; // D63: D26's corrective line — set by the host scanner, sticky until replaced/cleared
  // Overlay edits
  setBlocked(edgeId: string, reason?: string): void;
  setNodeBlocked(nodeId: string, reason?: string): void; // D94/C34: the node mirror of setBlocked — a blocked node is impassable as destination/intermediate but may be a route's origin (C34); saved-plane-gated add, unconditional lift, non-empty reason
  addUserNodeAt(layer: string, position: { x: number; y: number }): void;
  removeUserNode(id: string): void;
  promoteUserNode(id: string, label: string): void;
  // Editor commands
  upsertNode(node: MapNodeData): void;
  upsertEdge(edge: MapEdgeData): void;
  removeNode(id: string): void;
  removeEdge(id: string): void;
  calibrateScale(arcId: string, authoredDistance: number, unit?: { label: string; kind: 'distance' | 'time' }): void; // C13/D44/D45: unitPerPx = authored ÷ the arc's px length; a present unit seeds label+kind (C11's two kinds), absent ⇒ only unitPerPx moves
  saveMap(): void;
  hasUnsavedChanges(): boolean; // D75/F45: additive §9 extension — the unsaved-changes indicator's state lives in the core
  // Layer commands (P3 M3 — D82–D85)
  upsertLayer(layer: { id: string; name: string; background?: LayerBackground }): void; // D82: id '' ⇒ create ('layer-<n>', C5); else rename/background PUT by splice
  removeLayer(layerId: string): void; // D82: the informed-cascade delete — atomic, both planes, background discarded with the layer
  reorderLayers(layerIds: readonly string[]): void; // D82: exact permutation of the layer id set ⇒ the new array/nav order; active layer unchanged
  layerRemovalImpact(layerId: string): LayerRemovalImpact; // D82/R1: the delete dialog's N/M/K — pure, core-computed
  detachNode(nodeId: string): void; // D82/F54: every incident edge dies in both planes; the node survives byte-identical
  setNodeLayer(nodeId: string, layerId: string): void; // D83: the property-panel move; C3 rides — no edge updates, ever
  setLayerBackground(layerId: string, source: LayerBackground | null): void; // D84: store the reference (asset or URL); null clears — D93 fresh-start: EVERY call resets placement+dim to defaults (the minimal-fresh shape; an old image's tuning must not leak into the new one)
  setLayerBackgroundPlacement(layerId: string, placement: { x: number; y: number; scale: number } | null): void; // D93: the per-layer placed background — x/y = the image's center in model coords, scale = model units per image px (aspect-locked); null = the arm's explicit clear (the D92 default fit applies again)
  setLayerBackgroundDim(layerId: string, dim: number): void; // D90/D93: the per-layer background dim, 0–1 (0 = undimmed) — saved map data, never snapshot/template payload
  setPortal(nodeId: string, layerId: string | null): void; // D85: wire/unwire the entry node — at most one per layer
  // Queries
  findRoute(from: string, to: string, mode?: TravelMode): RouteResult;
  getSnapshot(): MapSnapshot;
  renderTemplate(tpl: string): string;
  getPromptBlock(): string;
  // Viewer state
  setActiveLayer(layerId: string): void;
}

const todo = (milestone: string, command: string): Error =>
  new Error(`TODO(${milestone}): ${command} is not implemented — facade stub from Task 0`);

/**
 * D78 + A-015: the SAVED scale's speed table is the RESOLVED mode-speed map —
 * registry-first, then scale.speed (an entry with `speed` undefined falls
 * through to `scale.speed[mode]`; both absent ⇒ the mode prices in canonical
 * units, C14 row 6 — the speedless-built-in rule). ONE seam: cost.ts and
 * price.ts keep reading `scale.speed[mode]` verbatim, so C14 rows 4–6's exact
 * arithmetic and C15's one-currency rule are mechanically untouched — the
 * registry enters pricing only through this snapshot, taken at loadMap and
 * refreshed at saveMap (the A-014/A-015 saved-plane doctrine). A map with no
 * registry speeds gets today's plain shallow clone, byte-for-byte behavior.
 */
function savedScaleOf(map: WorldMapData): WorldMapData['scale'] {
  const declared = map.modes?.filter((d) => d.speed !== undefined) ?? [];
  if (declared.length === 0) return { ...map.scale };
  const speed = { ...map.scale.speed };
  for (const declaration of declared) speed[declaration.id] = declaration.speed!; // registry wins (D78)
  return { ...map.scale, speed };
}

// C23: the unnamed-user predicate — the tap-placed label addUserNodeAt assigns
// is USER STATE, not a name. Kept local: it mirrors snapshot/build.ts's private
// twin (promotion flips origin to 'authored', clearing both). getSnapshot needs
// it for the C19 arc list that feeds the D65 currency decision.
const isUnnamedUser = (node: MapNodeData): boolean => node.origin === 'user' && node.label === 'Waypoint';

/**
 * D65(a) snapshot-seam pricing — the honest-currency read of priceEdgeIn. On a
 * map whose canonical unit IS minutes (unitKind 'time' with the 'min' label —
 * FX1's D45 shape), an authored-minutes arc prices honestly in the canonical
 * list, so a canonical run accepts minutes-priced modes too: the minutes pass
 * runs first (keeping D60's preference rule intact for authored arcs) and
 * geometric-only arcs fall through to the canonical pass. Every other
 * currency/map shape is priceEdgeIn verbatim. D74: findRoute's own runs price
 * through this helper too (the honest canonical fallback on time-kind 'min'
 * scales); the minutes pass stays strict — the helper no-ops for that
 * currency — so routing's fallback joins the snapshot seam in ONE honest
 * read (D65(a)/D74).
 */
function priceForSnapshot(
  edge: MapEdgeData,
  currency: CostCurrency,
  candidates: readonly TravelMode[],
  preferred: TravelMode,
  scale: WorldMapData['scale'],
  positionOf: (id: string) => { x: number; y: number } | undefined,
): { mode: TravelMode; cost: number } {
  if (currency === 'canonical' && scale.unitKind === 'time' && scale.unitLabel === 'min') {
    const asMinutes = priceEdgeIn(edge, 'minutes', candidates, preferred, scale, positionOf);
    if (Number.isFinite(asMinutes.cost)) return asMinutes;
  }
  return priceEdgeIn(edge, currency, candidates, preferred, scale, positionOf);
}

/**
 * C7: a runtime-placed node connects to the k nearest leaf nodes on its layer
 * — this is C7's default k. A module constant, not a parameter: the frozen
 * §9 command surface takes no options (D21/§6.2 fix the behavior).
 */
export const WAYPOINT_KNN = 3;

/** Internal facade state (A-002): live references plus the derived graph (C24, C8). */
export interface FacadeState {
  map: WorldMapData | null;
  overlay: ChatMapOverlay | null;
  effective: EffectiveGraph | null;
  stale: boolean;
  dirty: boolean; // D75/F45: unsaved editor edits — set by the editor commands, cleared by saveMap/loadMap; never triggers a rebuild (that is `stale`'s job, C8)
  activeLayer: string | null; // P2 M1 (F01/D69): viewer state — null until a map loads; reset by every loadMap
  // A-014 (D75 amendment): the SAVED plane's id sets — the universes the
  // RUNTIME commands derive their library-side membership from while the map
  // is dirty. Populated from the validated map at loadMap, refreshed at
  // saveMap (after validation passes, before dirty clears); the editor
  // commands never touch them (only saveMap/loadMap move the saved plane).
  savedNodeIds: Set<string>;
  savedEdgeIds: Set<string>;
  savedLayerIds: Set<string>; // A-017 follow-up: gates addUserNodeAt's layer — waypoints bind only SAVED layers (F50)
  // A-015 (D75): the SAVED scale — what every pricing seam reads. calibrateScale
  // mutates the live map.scale in place (the editor draft the UI displays, C24);
  // pricing serves this snapshot until saveMap refreshes it. Same doctrine as
  // the A-014 id universes: populated at loadMap, refreshed at saveMap only —
  // materialize() deliberately does NOT refresh it (an overlay command's
  // rebuild must not leak an unsaved calibration). Shallow clone: calibration
  // writes only unitPerPx/unitLabel/unitKind (top-level fields).
  savedScale: WorldMapData['scale'] | null;
  compile?: TemplateCompiler; // D62: injected engine — absent until the host/tests provide one
}

// The state lives outside the facade object so that Object.keys(facade) stays
// exactly the §9 command list; this WeakMap is the diagnostic seam below.
const states = new WeakMap<MapFacade, FacadeState>();

/**
 * Diagnostic read-out of a facade's internal state — unit-test seam for
 * milestones whose commands have no query surface yet (M1), and for host
 * diagnostics. NOT a §9 command: read-only by convention (R4 — a projection,
 * never a second copy of the truth; mutations go through commands, R2).
 */
export function facadeStateOf(facade: MapFacade): FacadeState {
  const state = states.get(facade);
  if (state === undefined) {
    throw new Error('[TravelMapper] facadeStateOf: object was not created by createFacade');
  }
  return state;
}

/** Facade factory: M1 + M2 commands implemented, the rest still explicit TODOs. */
export function createFacade(engine?: { compile?: TemplateCompiler }): MapFacade {
  const state: FacadeState = {
    map: null,
    overlay: null,
    effective: null,
    stale: false,
    dirty: false, // D75/F45
    activeLayer: null, // F01/D69: viewer state — null until the first loadMap
    savedNodeIds: new Set<string>(), // A-014: empty until a loadMap/saveMap populates them
    savedEdgeIds: new Set<string>(),
    savedLayerIds: new Set<string>(),
    savedScale: null, // A-015: null until the first loadMap snapshots it
    // D62: the template engine is injected (R5) — Handlebars-shaped. Absent
    // until the host (SillyTavern.libs) or the test/harness devDependency
    // provides one; renderTemplate/getPromptBlock refuse field-precisely.
    compile: engine?.compile,
  };

  // C8: one atomic rebuild from the stored references. No-op when nothing is
  // loaded. Callers swap `state.effective` in a single assignment.
  const rebuild = (): void => {
    const { map, overlay } = state;
    if (map === null || overlay === null) return;
    state.effective = buildEffectiveGraph(map, overlay);
    state.stale = false;
  };

  // C8: mutations only set `stale`; queries (M2) call this before reading, so
  // no query ever observes a stale graph. No M1 callers yet by design.
  const ensureFresh = (): void => {
    if (state.stale) rebuild();
  };

  // The ONE route computation (C18) — findRoute and getSnapshot's destination
  // runs (A-008) both call it, so routing and snapshot share a single D60
  // pricer (routing/price.ts; §6.2: no parallel math). Ensures freshness and
  // validates endpoints itself (C30), so every caller gets the same seams.
  // D65(c): the snapshot's hub computation passes `forcedCurrency` (an
  // INTERNAL parameter — the MapFacade interface and findRoute's call are
  // untouched) to run EXACTLY the snapshot's currency; findRoute keeps D60's
  // minutes-first/canonical-fallback shape verbatim.
  const computeRoute = (from: string, to: string, mode?: TravelMode, forcedCurrency?: CostCurrency): RouteResult => {
    ensureFresh(); // C8 — queries never observe a stale graph
    const { map, overlay, effective } = state;
    if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
    const eff = effective!; // C8 invariant: with map+overlay loaded, ensureFresh has built the graph
    const savedScale = state.savedScale!; // A-015/D75: pricing reads the SAVED scale — only loadMap/saveMap move it

    // C30: field-precise endpoint validation against the effective node set.
    if (!eff.nodes.some((node) => node.id === from)) {
      throw new Error(`[TravelMapper] findRoute: unknown node id '${from}'`);
    }
    if (!eff.nodes.some((node) => node.id === to)) {
      throw new Error(`[TravelMapper] findRoute: unknown node id '${to}'`);
    }
    // Authored labels for every human reason below (C23 — labels are authored
    // words; machine ids never reach a prompt-facing reason). ONE definition
    // shared by the C34 destination refusal and the C17 unreachable wording.
    const labelOf = (id: string): string => eff.nodes.find((node) => node.id === id)?.label ?? id;
    // Route-to-self (§6.2) — trivially satisfiable. D72: no run happened, so
    // the label is the canonical one (the D65 empty-set precedent: an empty
    // set presents no minutes-derived cost). C34: the trivial success stands
    // untouched even on a blocked node — the ORIGIN exemption (the party can
    // always leave somewhere they already are).
    if (from === to) return { ok: true, total: 0, legs: [], unit: savedScale.unitLabel };

    // C34/D94: a blocked node is impassable as a DESTINATION — refused before
    // any run, the reason naming the block (the authored label + the authored
    // reason, verbatim). D72: no run happened, so the unit label is the
    // canonical one (the route-to-self precedent above); no cost is presented
    // (C17). This rides the ONE shared route computation, so the C20
    // destination runs (getSnapshot's routeTo) inherit the refusal and the
    // blocked hub drops from the destinations list (the C15 drop precedent).
    const toBlockReason = overlay.nodeBlocked[to];
    if (toBlockReason !== undefined) {
      return {
        ok: false,
        total: 0,
        legs: [],
        unit: savedScale.unitLabel, // D72: no run — the route-to-self precedent
        reason: `'${labelOf(to)}' is blocked: ${toBlockReason}`,
      };
    }

    const positions = new Map(eff.nodes.map((node) => [node.id, node.position] as const));
    const positionOf = (id: string): { x: number; y: number } | undefined => positions.get(id);

    // Per-edge pricing (D19/F32, D60): an explicit mode is a strict filter
    // (C14 row 2) over a single candidate; the default prefers the chat's
    // travel mode and falls back to the cheapest mode the arc allows. Every
    // number comes from edgeCost via priceForSnapshot → priceEdgeIn — one cost
    // function for every edge kind, no parallel math (C14, §6.2). C15/D60: ONE
    // currency per route — every computation runs minutes-first and falls back
    // to canonical units only when no minutes-priced route exists.
    // D65(c)/D74: every run prices through the snapshot seam's honest read
    // (priceForSnapshot). A FORCED run (D65(c)) shares the snapshot's ONE
    // honest currency; findRoute's own runs (D74) keep D60's minutes pass
    // strict — the helper no-ops for the minutes currency — and gain the
    // honest canonical read ONLY on a time-kind 'min' scale, where authored
    // minutes ARE the canonical unit (FX1's D45 shape). Every other map shape
    // (distance-kind, other labels) keeps the strict D60 filter verbatim —
    // the pinned league-map interleaving refusal stands.
    const nodeIds = eff.nodes.map((node) => node.id);
    // A-016b/D78/C19: the DEFAULT scan reads the loaded map's mode universe
    // (built-ins ∪ registry ids) — an arc allowing ONLY a registry mode is
    // priceable in a default run and never silently drops from C19's "exactly
    // the arcs incident to the pin". An explicit mode stays a STRICT
    // single-candidate filter (C14 row 2 — untouched). Universe source is the
    // LIVE map: no M2 editor command can mutate map.modes (the registry
    // arrives only via loadMap), so live == saved today; when a
    // registry-EDITING command arrives, this scan set must move to the saved
    // plane exactly as savedScale did (A-015 doctrine).
    const candidates: readonly TravelMode[] = mode !== undefined ? [mode] : [...modeUniverseOf(map)];
    const preferred = mode !== undefined ? mode : overlay.travelMode;
    const priceIn = (edge: MapEdgeData, currency: CostCurrency): { mode: TravelMode; cost: number } =>
      priceForSnapshot(edge, currency, candidates, preferred, savedScale, positionOf);
    // C34/D94: a blocked node is impassable as an INTERMEDIATE stop — the
    // existing weightOf wrapped at the ONE seam: a step INTO a node-blocked
    // endpoint yields the non-finite sentinel (C2's ∞ discipline — it never
    // enters the result, C17). The ORIGIN is never stepped into (dijkstra
    // seeds it as settled), so the C34 origin exemption falls out by
    // construction. The exclusion is silent, like a blocked arc's ∞ — the
    // unreachable-reason discrimination below is untouched. dijkstra.ts
    // itself is unchanged (D94: the semantics ride the caller's weightOf).
    const run = (currency: CostCurrency) =>
      shortestPath(nodeIds, eff.edges, (edge, traversedFrom) => {
        const into = edge.source === traversedFrom ? edge.target : edge.source; // C6: the endpoint being entered
        if (overlay.nodeBlocked[into] !== undefined) return Infinity; // the internal sentinel — never in any output (C2/C17)
        return priceIn(edge, currency).cost;
      }, from, to);
    let currency: CostCurrency;
    let result: ReturnType<typeof run>;
    if (forcedCurrency !== undefined) {
      // D65(c): forced — exactly this currency; no fallback run, ok:false stays
      // ok:false (the hub drops like a cross-currency route arc).
      currency = forcedCurrency;
      result = run(currency);
    } else {
      currency = 'minutes';
      result = run(currency);
      if (!result.ok) {
        currency = 'canonical'; // C15/D60: no minutes route ⇒ the whole computation re-runs in canonical units
        result = run(currency);
      }
    }
    const priceEdge = (edge: MapEdgeData): { mode: TravelMode; cost: number } => priceIn(edge, currency);

    // D72: this run's currency label — verbatim the rule MapSnapshot.unit
    // follows (snapshot/build.ts): 'min' when the computation priced minutes,
    // else the canonical scale label (C15/D60). Forced-currency runs (D65(c))
    // label their forced currency through the same expression, and ok:false
    // carries the last attempted run's label while presenting no costs (C17).
    const unit = currency === 'minutes' ? 'min' : savedScale.unitLabel;

    if (!result.ok) {
      // C17: translate unreachability into a human reason. Was the graph
      // disconnected in principle, or did blocks/mode restrictions sever it?
      // Brute-force probe (D59): a second plain run at weight 1 per edge —
      // ignoring blocked/disallowed costs entirely (C2). The probe ignores
      // node blocks too (C34): an intermediate node-block sever is SILENT
      // here, exactly like a blocked arc's ∞ — the route dies with the
      // existing unreachable wording, never naming the intermediate block.
      const connected = shortestPath(nodeIds, eff.edges, () => 1, from, to).ok;
      return {
        ok: false,
        total: 0,
        legs: [],
        unit, // D72: the last attempted run's label; no cost is presented (C17/F24)
        reason: connected
          ? 'every candidate arc is blocked or disallowed for this mode'
          : `no path connects '${labelOf(from)}' and '${labelOf(to)}'`,
      };
    }

    // C18 legs: from→to per traversal (dijkstra hands the orientation back),
    // the priced mode per leg — FX2's walk-then-train shape. D78/C23: each leg
    // also carries the RESOLVED label (always present — the registry's authored
    // word, else the id itself, which for the bare built-ins IS the word), so
    // the UI never maps ids to words itself.
    const edgeById = new Map(eff.edges.map((edge) => [edge.id, edge] as const));
    const legs: RouteLeg[] = result.legs.map((leg) => {
      const priced = priceEdge(edgeById.get(leg.arcId)!); // dijkstra only emits arcIds from eff.edges
      return {
        arcId: leg.arcId,
        from: leg.from,
        to: leg.to,
        mode: priced.mode,
        modeLabel: resolveModeLabel(priced.mode, map.modes),
        cost: leg.cost,
      };
    });
    return { ok: result.ok, total: result.total, legs, unit }; // D72
  };

  // C5: ids belong to the engine — per-facade monotonic counters, one per id
  // space (§6.2 schemes 'wp-<n>' for user nodes, 'we-<n>' for user edges;
  // D82 adds 'layer-<n>' for layers). Each candidate is bumped until free in
  // the merged id set, so rapid taps (§6.2) and authored data that already
  // uses the scheme can never collide.
  let nextNodeId = 1;
  let nextEdgeId = 1;
  let nextLayerId = 1;

  // A-009: the ONE render path for both §9 template commands (no parallel
  // math, §6.2). Builds the current snapshot through getSnapshot (§9 query
  // prelude: C8 freshness + the no-map throw), assembles the C22 context,
  // then compiles+runs through the injected engine (D62/R5 — the core never
  // owns a template library). C32/§6.2: a template error — syntax at compile
  // or at runtime (a missing helper) — must never abort or empty an injection,
  // so it falls back to the DEFAULT template over the SAME context and logs
  // nothing (the toast is host business, Phase 4). No caching, no
  // partials/helpers registration (Ponytail): plain compile + context.
  const renderViaEngine = (tpl: string): string => {
    const snapshot = facade.getSnapshot(); // the §9 query — never sets stale (C8)
    const engine = state.compile;
    if (engine === undefined) {
      throw new Error('[TravelMapper] no template engine injected (D62)');
    }
    const context = snapshotContext(snapshot);
    try {
      return engine(tpl)(context);
    } catch {
      return engine(DEFAULT_TEMPLATE)(context);
    }
  };

  const facade: MapFacade = {
    // --- Map lifecycle -------------------------------------------------------

    loadMap: (map, overlay) => {
      // C30: reject-before-mutate — both validators run before any state
      // changes, so an invalid input leaves the prior load untouched.
      const validatedMap = validateWorldMap(map);
      // D78/C32 — the D58 tolerance shape, written rather than opted into:
      // validateOverlay's travel-mode check stays strict (its universe is THIS
      // map's), but the LOAD path degrades an overlay travelMode the loaded
      // map does not know to 'walk' — chat state saved against another map's
      // registry must never refuse a load. The gate runs on a one-field shallow
      // projection (R4 spirit) so reject-before-mutate still holds: the
      // caller's overlay object is rewritten only after every other check has
      // passed, and the STORED overlay stays the caller's object (C24).
      const universe = modeUniverseOf(validatedMap);
      const degraded = typeof overlay.travelMode !== 'string' || !universe.has(overlay.travelMode);
      const candidate = degraded ? { ...overlay, travelMode: 'walk' as TravelMode } : overlay;
      const validatedOverlay = validateOverlay(candidate, validatedMap, { tolerateIneligiblePin: true });
      if (degraded) overlay.travelMode = 'walk'; // C32 — lands only on a load that passed every gate
      // C27: the pin is chat state, not graph data — a live library edit (C24)
      // can make the pinned node ineligible at any moment, so load neither
      // refuses nor snaps on pin eligibility; the pin rides along and
      // materialization marks it invalid (C8). Eligibility is still enforced
      // by validateOverlay's default mode (the D58 contract) and by
      // setCurrentLocation below. (Normative: M1 verifier FINDING 3 — an
      // overlay pinning a childless district loads; its pin is simply invalid.)
      state.map = validatedMap; // C24: the library object itself, never a copy
      state.overlay = degraded ? overlay : validatedOverlay;
      // P2 M1 (F01/D69): deterministic first paint — every fresh load resets
      // the active layer to THIS map's first layer; a stale layer id from a
      // previous map is never inherited (C24). Validators guarantee ≥ 1 layer.
      state.activeLayer = validatedMap.layers[0].id;
      // A-014: the saved id-plane is rebuilt from the VALIDATED map — the
      // universe every runtime command's membership gate reads until the next
      // loadMap/saveMap.
      state.savedNodeIds = new Set(validatedMap.nodes.map((nd) => nd.id));
      state.savedEdgeIds = new Set(validatedMap.edges.map((e) => e.id));
      state.savedLayerIds = new Set(validatedMap.layers.map((l) => l.id));
      // A-015: the pricing seams' scale snapshot — a clone, never the reference
      // (calibrateScale mutates the live object in place; a reference would
      // alias the draft straight into routing, breaking D75/F45). D78: the
      // clone's speed table is the RESOLVED mode-speed map (savedScaleOf —
      // registry-first, then scale.speed, one seam).
      state.savedScale = savedScaleOf(validatedMap);
      state.dirty = false; // D75: a fresh load carries no unsaved editor edits
      state.stale = true; // C8: the next materialize()/query rebuilds
    },

    // C24 hook: propagates host-side in-place library edits into the derived
    // graph. Unconditional rebuild when loaded; no-op when nothing is loaded.
    materialize: () => {
      rebuild();
    },

    // D56/C25: forks have no consumer before Phase 3 M4.
    forkMap: () => { throw todo('Phase 3 M4', 'forkMap'); },
    saveForkToLibrary: () => { throw todo('Phase 3 M4', 'saveForkToLibrary'); },

    // Pure check — validates the candidate import, changes no state (C30).
    validateImport: (data) => {
      validateWorldMap(data);
    },

    // Pure — migrate + validate, returns the WorldMapData; changes no state (C31).
    migrateData: (data) => migrateWorldMap(data),

    // --- Presence ------------------------------------------------------------

    setCurrentLocation: (id) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      if (id !== null) {
        // A-014 (D75 amendment): the saved-plane gate — a RUNTIME command never
        // binds unsaved library state. The id must live in savedNodeIds ∪
        // overlay userNodes, else an unsaved editor node could take the pin
        // (and through it routing + the snapshot) while findRoute refuses the
        // same id. C30 field-precise; object-level eligibility below stays
        // live-read on the merged node set (the amendment).
        if (!state.savedNodeIds.has(id) && !overlay.userNodes.some((nd) => nd.id === id)) {
          throw new Error(
            `[TravelMapper] setCurrentLocation: unknown node id '${id}' (unsaved — save the map first)`,
          );
        }
        // C1/F27 pin rule per D58 — ONE shared predicate with the validator and
        // the materializer, checked against the effective view (a check-only
        // build; storage mutations never rebuild here, C8).
        const graph = buildEffectiveGraph(map, overlay);
        if (!graph.nodes.some((node) => node.id === id)) {
          throw new Error(`[TravelMapper] setCurrentLocation: unknown node id '${id}'`);
        }
        if (!isPinEligible(id, graph.nodes)) {
          throw new Error(
            `[TravelMapper] setCurrentLocation: '${id}' is a container node — containers never hold the pin (C1/F27, D58)`,
          );
        }
      }
      overlay.currentLocationId = id; // D38: moving the pin is silent
      state.stale = true;
    },

    setStatusNote: (note) => {
      const { overlay } = state;
      if (overlay === null) throw new Error('[TravelMapper] no map loaded');
      // C30: validate BEFORE mutating — the declared type is string | undefined,
      // a runtime caller (or old persisted data) can lie (F50).
      const candidate: unknown = note;
      if (candidate !== undefined && typeof candidate !== 'string') {
        throw new Error(`[TravelMapper] setStatusNote: note must be a string or undefined (got ${typeof candidate})`);
      }
      if (note === undefined) delete overlay.statusNote; // D17: set/clear
      else overlay.statusNote = note;
      state.stale = true;
    },

    setTravelMode: (mode) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      // C30/D78: validate BEFORE mutating — against the LOADED map's mode
      // universe (built-ins ∪ registry ids), the same membership
      // validateOverlay enforces at load (F50); a registry mode ('horse') is
      // accepted, garbage is refused. A runtime caller can bypass the type
      // system, so the string check is explicit.
      const universe = modeUniverseOf(map);
      if (typeof mode !== 'string' || !universe.has(mode)) {
        throw new Error(
          `[TravelMapper] setTravelMode: travel mode must be one of: ${[...universe].join(', ')} (got '${String(mode)}')`,
        );
      }
      overlay.travelMode = mode; // D19
      state.stale = true;
    },

    // D63: the D26 corrective line — a pure core matcher (snapshot/match.ts)
    // builds the string; the HOST scanner (Phase 4, D11/D34) decides and calls
    // this. Sticky: persists across regenerations until the next scan replaces
    // or clears it (D12/D26). Same shape and C30 discipline as setStatusNote.
    setCorrective: (text) => {
      const { overlay } = state;
      if (overlay === null) throw new Error('[TravelMapper] no map loaded');
      // C30: validate BEFORE mutating — the declared type is string | undefined,
      // a runtime caller (or old persisted data) can lie (F50). An empty string
      // is not a corrective line: refuse it rather than silently clearing
      // (the setBlocked-reason precedent).
      const candidate: unknown = text;
      if (candidate !== undefined && (typeof candidate !== 'string' || candidate.length === 0)) {
        throw new Error(
          `[TravelMapper] setCorrective: corrective must be a non-empty string or undefined (got '${String(candidate)}')`,
        );
      }
      if (text === undefined) delete overlay.corrective; // D63: set/clear — sticky until the next scan
      else overlay.corrective = text;
      state.stale = true; // C8 — the next query's ensureFresh picks the change up
    },

    // --- Overlay edits (M2) ----------------------------------------------------

    setBlocked: (edgeId, reason) => {
      ensureFresh(); // C8 — keeps the no-map invariant below uniform with the other §9 commands
      const { overlay, effective } = state;
      if (overlay === null || effective === null) throw new Error('[TravelMapper] no map loaded');
      if (reason !== undefined) {
        // A-014 (D75 amendment): the ADD path writes an overlay key, so it may
        // only reference an edge the SAVED plane knows (savedEdgeIds ∪
        // overlay user edges) — a key absent from the saved library would make
        // validateOverlay refuse the WHOLE overlay at the next load (F50).
        // An unsaved editor arc is refused exactly like an unknown one (C30
        // field-precise); the LIFT path below never binds and stays
        // unconditional.
        if (!state.savedEdgeIds.has(edgeId) && !overlay.userEdges.some((e) => e.id === edgeId)) {
          throw new Error(`[TravelMapper] setBlocked: unknown edge id '${edgeId}' (unsaved — save the map first)`);
        }
        // C30/F50: a runtime caller can lie about the typed optional — validate
        // before mutating (setStatusNote precedent). An empty string is neither
        // a reason nor a lift: refusing it never silently clears a block.
        // Whitespace-only is the same defect (P2 M2 verifier finding 3 — a
        // Phase 4 host caller could otherwise persist a blank-looking reason
        // that reaches prompts verbatim as C2's payload). Valid strings are
        // stored verbatim, untrimmed — the reason is the author's payload.
        if (typeof reason !== 'string' || reason.trim().length === 0) {
          throw new Error(
            `[TravelMapper] setBlocked: reason must be a non-empty string or undefined (got '${String(reason)}')`,
          );
        }
        overlay.blocked[edgeId] = reason; // D20: chat-scoped block — adds or restates only
      } else {
        // Lift: an UNCONDITIONAL delete of the overlay entry (A-014 — the lift
        // path never binds state, so the saved-plane gate does not apply; a
        // no-op on an unknown/stale key is harmless). C2/A-002 — the overlay
        // can only add a block, never lift one, so a library-level block
        // survives this delete (a silent no-op there); the next rebuild
        // re-merges the union.
        delete overlay.blocked[edgeId];
      }
      state.stale = true; // C8 — the next query's ensureFresh picks the change up
    },
    // D94/C34: the node-level mirror of setBlocked — a chat-scoped block on a
    // NODE (not its arcs). Same seams verbatim: ensureFresh prelude, no-map
    // refusal, saved-plane-gated ADD (A-014 — an overlay key the saved plane
    // lacks would make validateOverlay refuse the WHOLE overlay at the next
    // load, F50), C30 non-empty-reason refusal stored verbatim untrimmed,
    // UNCONDITIONAL lift (a no-op on an unknown/stale key is harmless), and
    // stale, never dirty (the R25 adjudication: an overlay command —
    // chat-scoped blocks must not ride saveMap into the library).
    setNodeBlocked: (nodeId, reason) => {
      ensureFresh(); // C8 — keeps the no-map invariant below uniform with the other §9 commands
      const { overlay, effective } = state;
      if (overlay === null || effective === null) throw new Error('[TravelMapper] no map loaded');
      if (reason !== undefined) {
        // A-014 (D75 amendment): the ADD path writes an overlay key, so it may
        // only reference a node the SAVED plane knows (savedNodeIds ∪ overlay
        // userNodes) — an unsaved editor node is refused exactly like an
        // unknown one (C30 field-precise); the LIFT path below never binds
        // and stays unconditional.
        if (!state.savedNodeIds.has(nodeId) && !overlay.userNodes.some((nd) => nd.id === nodeId)) {
          throw new Error(`[TravelMapper] setNodeBlocked: unknown node id '${nodeId}' (unsaved — save the map first)`);
        }
        // C30/F50: the setBlocked discipline verbatim — validate BEFORE
        // mutating; an empty or whitespace-only string is neither a reason
        // nor a lift (a blank-looking reason would reach prompts verbatim as
        // C34's payload). Valid strings are stored verbatim, untrimmed — the
        // reason is the author's payload.
        if (typeof reason !== 'string' || reason.trim().length === 0) {
          throw new Error(
            `[TravelMapper] setNodeBlocked: reason must be a non-empty string or undefined (got '${String(reason)}')`,
          );
        }
        overlay.nodeBlocked[nodeId] = reason; // D94/C34: chat-scoped block — adds or restates only
      } else {
        // Lift: an UNCONDITIONAL delete of the overlay entry (the setBlocked
        // mirror — the lift path never binds state, so the saved-plane gate
        // does not apply). Node blocks are overlay-ONLY (D94 adds no
        // library-level node block), so there is no library block to
        // survive; the next rebuild re-reads the map.
        delete overlay.nodeBlocked[nodeId];
      }
      state.stale = true; // C8 — the next query's ensureFresh picks the change up
    },
    // D21/§6.2: a click-placed waypoint — a user-created node stored in the
    // chat overlay (which persists per chat) with an engine-assigned id (C5)
    // and the plain-word label 'Waypoint' (C23: never an id-like token; M3
    // owns keeping unnamed user nodes out of prompt-facing structures).
    addUserNodeAt: (layer, position) => {
      ensureFresh(); // C8 — the uniform prelude; the mutation reads the live references (C24)
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      // A-014 discipline (A-017 follow-up, D82/F50): the layer gate reads the
      // SAVED plane's universe, not the live map — a waypoint placed on a
      // created-but-unsaved layer would persist a layer id the saved map
      // lacks, and validateOverlay would refuse the WHOLE overlay at the next
      // load (F50). saveMap admits new layers to the universe.
      if (!state.savedLayerIds.has(layer)) {
        throw new Error(
          `[TravelMapper] addUserNodeAt: '${layer}' is not a saved layer id — a waypoint cannot bind a layer the saved map lacks (saveMap first; F50)`,
        );
      }

      // C30/F50: the one runtime-supplied argument besides `layer` — a NaN or
      // infinite coordinate must be refused BEFORE the overlay is mutated, or
      // the persisted chat state would fail validateOverlay's finite check at
      // the next load (verifier finding 2; §6.2 Data: "NaN coordinates ⇒
      // validator rejects" — the facade never creates the invalid state).
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        throw new Error(
          `[TravelMapper] addUserNodeAt: position must be finite { x, y } (got x='${String(position.x)}', y='${String(position.y)}')`,
        );
      }

      // C5: bump until free in the merged node set — authored maps may already
      // contain scheme-shaped ids.
      const nodeIds = new Set([...map.nodes, ...overlay.userNodes].map((nd) => nd.id));
      let n = nextNodeId;
      while (nodeIds.has(`wp-${n}`)) n += 1;
      nextNodeId = n + 1;
      const id = `wp-${n}`;

      const node: MapNodeData = { id, label: 'Waypoint', kind: 'waypoint', layer, position, origin: 'user' };
      overlay.userNodes.push(node); // C24: the overlay is the stored chat-state reference

      // C7: the k nearest leaves on this layer — A-014 (D75 amendment): the
      // candidate pool is the SAVED plane's library nodes (savedNodeIds — a
      // chat edge must never bind an unsaved editor node: it would enter
      // routing live while the id is absent from the saved map, and
      // validateOverlay would refuse the WHOLE overlay at the next load, F50)
      // ∪ previously placed waypoints. The ONE D58 predicate is the leaf rule
      // (kind ∈ {location, hub, waypoint} AND childless — containers and
      // parents never connect, C1); the new node excludes itself;
      // unpositioned candidates are unmeasurable and skipped (§6.2). Fewer
      // than k leaves ⇒ connect to what exists; zero ⇒ the node stays
      // orphaned — legal and harmless (C7).
      const merged = [
        ...map.nodes.filter((nd) => state.savedNodeIds.has(nd.id)),
        ...overlay.userNodes,
      ];
      const nearest = merged
        .filter((nd) => nd.id !== id && nd.layer === layer && nd.position !== undefined && isPinEligible(nd.id, merged))
        .map((nd) => ({ node: nd, d: euclid(position, nd.position!) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, WAYPOINT_KNN);

      // User edges: engine-assigned ids (C5, same scheme), walk allowed, NO
      // authored values — with pure geometry they price through edgeCost like
      // every other arc (C14; §6.2: waypoint edges use the same cost function,
      // no parallel math).
      const edgeIds = new Set([...map.edges, ...overlay.userEdges].map((e) => e.id));
      for (const { node: leaf } of nearest) {
        let e = nextEdgeId;
        while (edgeIds.has(`we-${e}`)) e += 1;
        nextEdgeId = e + 1;
        const edgeId = `we-${e}`;
        edgeIds.add(edgeId);
        overlay.userEdges.push({ id: edgeId, source: id, target: leaf.id, modes: { walk: { allowed: true } } });
      }

      state.stale = true; // C8 — the next query's ensureFresh picks the change up
    },

    // §6.2: a placed waypoint is removable. Its user edges go with it; any
    // waypoint left without a connection stays, orphaned (C7 — legal and
    // harmless). Library nodes are Phase 3 editor business and refuse here.
    removeUserNode: (id) => {
      ensureFresh(); // C8
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      const index = overlay.userNodes.findIndex((nd) => nd.id === id);
      if (index === -1) {
        if (map.nodes.some((nd) => nd.id === id)) {
          throw new Error(
            `[TravelMapper] removeUserNode: '${id}' is a library node — removing library nodes is editor business (Phase 3)`,
          );
        }
        throw new Error(`[TravelMapper] removeUserNode: unknown user node id '${id}'`);
      }
      overlay.userNodes.splice(index, 1);
      // Every user edge with either endpoint == id dies with the node; other
      // waypoints and their edges are untouched (§6.2). A chat block on a
      // removed edge is meaningless and must die with it — a surviving
      // overlay.blocked entry would fail validateOverlay's edge-existence
      // check at the next load (F50; verifier finding 1).
      const dying = overlay.userEdges.filter((e) => e.source === id || e.target === id);
      overlay.userEdges = overlay.userEdges.filter((e) => e.source !== id && e.target !== id);
      for (const edge of dying) delete overlay.blocked[edge.id];
      delete overlay.nodeBlocked[id]; // A-018 follow-up (D94/F50): the node is gone — a surviving node-block would fail validateOverlay's node-existence check at the next load (the edge-block mirror above)
      state.stale = true; // C8
    },

    // C26/D21: promoting names the waypoint and moves it overlay → library
    // under ONE id — same id, kind and position kept, origin flips to
    // 'authored'; incident user edges follow per D61 (library-bound edges
    // graduate, waypoint-bound edges stay chat-scoped), ids kept. The map is
    // mutated in place (C24 — the stored library reference; the host persists
    // the library on its next save, C29/D21/D47). Atomic: the full mutation is
    // computed and validated against a candidate map BEFORE anything is
    // touched (C30 spirit) — on refusal the overlay and map are untouched.
    promoteUserNode: (id, label) => {
      ensureFresh(); // C8
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      const node = overlay.userNodes.find((nd) => nd.id === id);
      if (node === undefined) {
        if (map.nodes.some((nd) => nd.id === id)) {
          throw new Error(`[TravelMapper] promoteUserNode: '${id}' is a library node — not a user waypoint (C26)`);
        }
        throw new Error(`[TravelMapper] promoteUserNode: unknown user node id '${id}'`);
      }
      // D21: promote NAMES it. A runtime caller can lie about the typed string
      // (C30/F50 — the setStatusNote precedent). Whitespace-only is the same
      // defect (P2 M3 verifier finding 1, the setBlocked precedent): a blank
      // label would persist into the library and render as blank space in
      // prompt-facing structures (C23 spirit). Valid strings are stored
      // verbatim, untrimmed — the name is the author's payload.
      if (typeof label !== 'string' || label.trim().length === 0) {
        throw new Error(`[TravelMapper] promoteUserNode: label must be a non-empty string (got '${String(label)}')`);
      }
      // The full mutation, computed first (C26): the node enters map.nodes and
      // its incident user edges split by their OTHER endpoint (D61): edges to
      // library nodes graduate into map.edges; edges to still-overlay
      // waypoints STAY in the overlay — a library↔overlay user edge is the
      // normal waypoint shape, keeps the runtime connection chat-scoped, and
      // graduates only when its last overlay endpoint promotes. No dangling
      // endpoints at any step, and any waypoint can always promote.
      const promoted: MapNodeData = { ...node, label, origin: 'authored' };
      const libraryIds = new Set(map.nodes.map((nd) => nd.id));
      const incident = overlay.userEdges.filter((e) => e.source === id || e.target === id);
      const moving = incident.filter((e) => libraryIds.has(e.source === id ? e.target : e.source));
      // Reject-before-mutate (C30 spirit, C26 atomic): the map must still pass
      // validateWorldMap with the node and graduating edges absorbed — e.g. a
      // live library edit (C24) may have claimed the id since placement. The
      // field-precise MapValidationError propagates; nothing has been touched.
      validateWorldMap({ ...map, nodes: [...map.nodes, promoted], edges: [...map.edges, ...moving] });
      map.nodes.push(promoted);
      map.edges.push(...moving);
      overlay.userNodes = overlay.userNodes.filter((nd) => nd.id !== id);
      overlay.userEdges = overlay.userEdges.filter((e) => !moving.includes(e));
      // D75 promotion clause (C26): the graduated ids are library truth the moment the atomic move lands — the universes admit them now (the next saveMap re-validates them like any other saved id).
      state.savedNodeIds.add(id);
      for (const e of moving) state.savedEdgeIds.add(e.id);
      state.stale = true; // C8
    },

    // --- Editor commands (Phase 3, PKG A-013) -----------------------------------
    //
    // Shared semantics (D75): every command mutates the loaded map object IN
    // PLACE (C24 — `state.map` is never reassigned; the frontend holds the
    // same live reference) but marks only the facade-held `dirty` flag, never
    // `stale` — unsaved edits never enter routing or the snapshot (F45:
    // nothing goes live until saved; C8's rebuild trigger is *edit save*,
    // i.e. saveMap below). Reject-before-mutate (C30): the edit is applied to
    // a structuredClone of the map and validated FIRST; on success the
    // identical edit is applied to the live map and `dirty` flips — a refused
    // command leaves the map byte-identical and dirty untouched. The
    // MapValidationError propagates as the collected field-precise report.

    upsertNode: (node) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      if (node.id === '') {
        // CREATE (C5): the engine assigns 'node-<n>' over the shared counter,
        // bumped until free in the MERGED id set — authored maps may already
        // contain scheme-shaped ids and the overlay's waypoints must never collide.
        const nodeIds = new Set([...map.nodes, ...overlay.userNodes].map((nd) => nd.id));
        let n = nextNodeId;
        while (nodeIds.has(`node-${n}`)) n += 1;
        const id = `node-${n}`;
        // A FRESH object — never alias the caller's (the UI binds form
        // drafts); optional array fields are copied too.
        const fresh: MapNodeData = { ...node, id };
        if (node.aliases !== undefined) fresh.aliases = [...node.aliases];
        const clone = structuredClone(map);
        clone.nodes.push(fresh);
        validateWorldMap(clone); // C30 — MapValidationError propagates; nothing touched
        nextNodeId = n + 1;
        map.nodes.push(fresh);
        state.dirty = true;
        return;
      }
      const index = map.nodes.findIndex((nd) => nd.id === node.id);
      if (index === -1) {
        throw new Error(`[TravelMapper] upsertNode: unknown node id '${node.id}' — pass '' to create (C5/D75)`);
      }
      // REPLACE (D75): full-replace semantics — PUT, not PATCH. The element is
      // swapped for a FRESH object built exactly like CREATE (never the
      // caller's; optional array fields copied); a field the caller passes as
      // undefined clears. The OLD object is left byte-identical: the C8
      // effective graph holds it by reference and must keep serving the SAVED
      // value until saveMap flips `stale` (F45/D75 — uniform for every edit
      // kind). C24 protects the map object's and the arrays' identities — both
      // survive an element splice; ELEMENT identity is deliberately not
      // preserved.
      const fresh: MapNodeData = { ...node, id: node.id };
      if (node.aliases !== undefined) fresh.aliases = [...node.aliases];
      const clone = structuredClone(map);
      clone.nodes[index] = fresh;
      validateWorldMap(clone); // C30
      map.nodes[index] = fresh;
      state.dirty = true;
    },

    upsertEdge: (edge) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      if (edge.id === '') {
        // CREATE (C5): 'arc-<n>' over the shared counter, bumped until free in
        // the merged edge id set (library ∪ overlay user edges).
        const edgeIds = new Set([...map.edges, ...overlay.userEdges].map((e) => e.id));
        let n = nextEdgeId;
        while (edgeIds.has(`arc-${n}`)) n += 1;
        const id = `arc-${n}`;
        const fresh: MapEdgeData = { ...edge, id };
        // C1/§6.2 (leaf-to-leaf, no compound-parent endpoints, no dangling
        // refs) rides validateWorldMap — no ad-hoc checks beyond it.
        const clone = structuredClone(map);
        clone.edges.push(fresh);
        validateWorldMap(clone); // C30
        nextEdgeId = n + 1;
        map.edges.push(fresh);
        state.dirty = true;
        return;
      }
      const index = map.edges.findIndex((e) => e.id === edge.id);
      if (index === -1) {
        throw new Error(`[TravelMapper] upsertEdge: unknown edge id '${edge.id}' — pass '' to create (C5/D75)`);
      }
      // REPLACE: the same splice seam as upsertNode (F45/D75) — a FRESH object
      // swaps in by index; the old one stays byte-identical so the effective
      // graph keeps serving the SAVED value until saveMap.
      const fresh: MapEdgeData = { ...edge, id: edge.id };
      const clone = structuredClone(map); // C30: clone-validate-apply
      clone.edges[index] = fresh;
      validateWorldMap(clone);
      map.edges[index] = fresh;
      state.dirty = true;
    },

    removeNode: (id) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      if (!map.nodes.some((nd) => nd.id === id)) {
        throw new Error(`[TravelMapper] removeNode: unknown node id '${id}'`);
      }
      // C30: the candidate map without the node and its incident library
      // edges must validate FIRST — e.g. removing a compound parent whose
      // children would dangle is refused field-precisely, map untouched.
      const clone = structuredClone(map);
      clone.nodes = clone.nodes.filter((nd) => nd.id !== id);
      clone.edges = clone.edges.filter((e) => e.source !== id && e.target !== id);
      validateWorldMap(clone);
      // Apply the identical edit to the live map, cascading incident edges in
      // BOTH planes (D75 — no dangling endpoint can exist; the removeUserNode
      // precedent mirrored). A chat block on a dying edge is meaningless and
      // dies with it (F50 — a surviving entry would fail validateOverlay at
      // the next load).
      map.nodes = map.nodes.filter((nd) => nd.id !== id);
      const dying = map.edges.filter((e) => e.source === id || e.target === id);
      map.edges = map.edges.filter((e) => e.source !== id && e.target !== id);
      const dyingUser = overlay.userEdges.filter((e) => e.source === id || e.target === id);
      overlay.userEdges = overlay.userEdges.filter((e) => e.source !== id && e.target !== id);
      for (const e of [...dying, ...dyingUser]) delete overlay.blocked[e.id];
      delete overlay.nodeBlocked[id]; // A-018 follow-up (D94/F50): the node-block mirror of the edge cleanup — a surviving entry would fail validateOverlay's node-existence check at the next load
      state.dirty = true;
    },

    // Single-plane removal: library edges only — the overlay's removeUserNode
    // / setBlocked own the chat plane (D75).
    removeEdge: (id) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      if (!map.edges.some((e) => e.id === id)) {
        throw new Error(`[TravelMapper] removeEdge: unknown edge id '${id}'`);
      }
      const clone = structuredClone(map); // C30: clone-validate-apply
      clone.edges = clone.edges.filter((e) => e.id !== id);
      validateWorldMap(clone);
      map.edges = map.edges.filter((e) => e.id !== id);
      delete overlay.blocked[id]; // a chat block on a removed edge dies with it (F50)
      state.dirty = true;
    },

    // C13/D44 — "measure this arc": unitPerPx = authored distance ÷ the arc's
    // pixel length (the model-space euclid of its endpoints — canvas
    // coordinates ARE the model). The arc comes from the MERGED edge set (both
    // planes' arcs have measurable geometry; the scale is a library property
    // either way). D44/D45: a present `unit` seeds the label and the kind
    // (C11's two kinds); an absent one re-measures in the established unit —
    // only unitPerPx moves. C13's "never silently overwritten" reads at this
    // seam as D79's explicit-action ruling: the UI offers, this command
    // executes — there is no overwrite guard beyond C30 validity. The arc
    // itself is NEVER touched (authored values are a separate upsertEdge
    // concern the UX issues as its own command) — calibration writes only
    // scale. D75: the edit applies to the live scale object in place (the
    // editor draft the UI displays, C24) and marks `dirty`; the pricing seams
    // keep serving state.savedScale until saveMap (F45 — an unsaved
    // calibration changes no cost).
    calibrateScale: (arcId, authoredDistance, unit) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      const edge = [...map.edges, ...overlay.userEdges].find((e) => e.id === arcId);
      if (edge === undefined) {
        throw new Error(`[TravelMapper] calibrateScale: unknown arc id '${arcId}'`);
      }
      // Positions resolve from the merged node set — measurement is geometry,
      // not runtime binding, so unsaved editor nodes are measurable like any
      // other (unlike the A-014-gated runtime commands).
      const nodeById = new Map([...map.nodes, ...overlay.userNodes].map((nd) => [nd.id, nd] as const));
      const positions = [edge.source, edge.target].map((id) => {
        const position = nodeById.get(id)?.position;
        if (position === undefined) {
          throw new Error(
            `[TravelMapper] calibrateScale: endpoint '${id}' of arc '${arcId}' has no position — an unpositioned endpoint cannot be measured`,
          );
        }
        return position;
      });
      // The ONE euclid (C12 — the same measurement cost/price uses, no parallel math).
      const pxLength = euclid(positions[0], positions[1]);
      if (pxLength === 0) {
        throw new Error(
          `[TravelMapper] calibrateScale: arc '${arcId}' has zero pixel length — coincident endpoints cannot set a scale`,
        );
      }
      if (!Number.isFinite(authoredDistance) || authoredDistance <= 0) {
        throw new Error(
          `[TravelMapper] calibrateScale: authoredDistance must be a finite number > 0 (got '${String(authoredDistance)}')`,
        );
      }
      const unitPerPx = authoredDistance / pxLength; // C13 verbatim
      if (unit !== undefined) {
        // The promoteUserNode/setBlocked precedent (verifier findings): an
        // empty or whitespace-only label is the same defect — a blank unit
        // word would persist into the library and render blank space in
        // prompt-facing structures (C23 spirit). Valid strings are stored
        // verbatim, untrimmed. A lying `kind` needs no ad-hoc check — the
        // C30 clone gate below owns it (the upsertEdge precedent). A
        // non-object `unit` (a JS caller lying past the optional type —
        // null included) refuses field-precisely here, the same
        // runtime-guard discipline as setStatusNote/setBlocked (C30; the
        // P3 M2 verifier's hardening finding).
        if (
          unit === null ||
          typeof unit !== 'object' ||
          typeof (unit as { label?: unknown }).label !== 'string' ||
          ((unit as { label: string }).label.trim().length === 0)
        ) {
          throw new Error(
            `[TravelMapper] calibrateScale: unit.label must be a non-empty string (got '${String(unit)}')`,
          );
        }
      }
      // C30/D75: clone-validate-apply — the identical edit, on the clone first.
      const clone = structuredClone(map);
      clone.scale.unitPerPx = unitPerPx;
      if (unit !== undefined) {
        clone.scale.unitLabel = unit.label; // D44 seeding
        clone.scale.unitKind = unit.kind; // C11/D45
      }
      validateWorldMap(clone); // MapValidationError propagates; nothing touched
      map.scale.unitPerPx = unitPerPx; // the live draft (C24: in place, never a reassign of state.map)
      if (unit !== undefined) {
        map.scale.unitLabel = unit.label;
        map.scale.unitKind = unit.kind;
      }
      state.dirty = true; // D75: dirty, never stale — saveMap is the live trigger
    },

    // F45/C29/D75: explicit save — the only command that takes unsaved editor
    // edits live. C30 final gate: an invalid live map is refused (the error
    // propagates, `dirty` stays TRUE, the map is untouched); on success
    // `dirty` clears and C8's *edit save* trigger marks `stale` — the next
    // query's ensureFresh rebuilds from the saved map. Host-side persistence
    // subscribes at Phase 4; in the harness this is the in-memory commit.
    saveMap: () => {
      const { map } = state;
      if (map === null) throw new Error('[TravelMapper] no map loaded');
      validateWorldMap(map); // C30 final gate
      // A-014: the saved id-plane moves to the live map — the edits are now
      // the SAVED plane, so the runtime commands' universes admit their ids.
      state.savedNodeIds = new Set(map.nodes.map((nd) => nd.id));
      state.savedEdgeIds = new Set(map.edges.map((e) => e.id));
      state.savedLayerIds = new Set(map.layers.map((l) => l.id));
      state.savedScale = savedScaleOf(map); // A-015: the saved plane moves — pricing sees the calibrated scale from the next query on; D78: the speed table re-resolves over the saved registry
      state.dirty = false;
      state.stale = true; // C8 edit save
    },

    // D75/F45: the F45 unsaved-changes indicator reads its state here —
    // nothing outside the core tracks dirtiness (R1).
    hasUnsavedChanges: () => state.map !== null && state.dirty,

    // --- Layer commands (Phase 3 M3, PKG A-017 — D82–D85) -----------------------
    //
    // Shared semantics with the editor block above (D75): live-reference
    // in-place mutation, C30 clone-validate-apply, FRESH objects on every
    // replace (the D75 splice seam — the old object stays byte-identical for
    // the effective graph until saveMap), and dirty, never stale — no layer
    // command rebuilds the effective graph (D16 restated: the pin, routing
    // and the snapshot are layer-agnostic and untouched).

    upsertLayer: (layer) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      if (layer.id === '') {
        // CREATE (C5): 'layer-<n>' over the shared counter, bumped until free —
        // authored maps may already contain scheme-shaped layer ids. A fresh
        // layer starts EMPTY (nodes arrive by setNodeLayer/upsertNode); it
        // inherits the map's scale automatically — scale is map-level
        // (WorldMapData.scale), there is no per-layer calibration (D82). The
        // name/background rules (non-empty name, exactly-one background arm —
        // D84) are the VALIDATOR's: the clone gate refuses, no ad-hoc checks.
        const layerIds = new Set(map.layers.map((l) => l.id));
        let n = nextLayerId;
        while (layerIds.has(`layer-${n}`)) n += 1;
        const id = `layer-${n}`;
        // A FRESH object — never the caller's (the manager sheet binds drafts).
        const fresh: LayerData = { id, name: layer.name };
        if (layer.background !== undefined) fresh.background = { ...layer.background };
        const clone = structuredClone(map);
        clone.layers.push(fresh);
        validateWorldMap(clone); // C30 — MapValidationError propagates; nothing touched
        nextLayerId = n + 1;
        map.layers.push(fresh);
        state.dirty = true;
        return;
      }
      const index = map.layers.findIndex((l) => l.id === layer.id);
      if (index === -1) {
        throw new Error(`[TravelMapper] upsertLayer: unknown layer id '${layer.id}' — pass '' to create (C5/D75)`);
      }
      // REPLACE (D82): rename / background entry in one command; a FRESH
      // object swapped by index, id and position stable. Gate-verifier
      // finding 2 (M3 gate): the background arm is ABSENT-AND-PRESERVE, not
      // the node commands' undefined-clears (D75) — the rename caller
      // (commitRename) does not manage the image, and a silent clear on
      // omission would destroy authored work; the field has its OWN command
      // (D84's setLayerBackground) whose explicit `null` owns clearing. A
      // supplied arm still replaces (the entry path rides this command too).
      // D93 extends the same doctrine to the presentation arms: the spread
      // carries `backgroundPlacement`/`backgroundDim` through a rename
      // untouched (absent-and-preserve) — the upsertLayer ARG does not grow
      // the arms (the sheet manages neither; the two commands own them).
      const fresh: LayerData = { ...map.layers[index], name: layer.name };
      if (layer.background !== undefined) fresh.background = { ...layer.background };
      const clone = structuredClone(map);
      clone.layers[index] = fresh;
      validateWorldMap(clone); // C30
      map.layers[index] = fresh;
      state.dirty = true;
    },

    // D82: the informed-cascade delete — ONE atomic command deletes the layer
    // (background discarded with it), every node resident on it in BOTH
    // planes, every arc with a dying endpoint (same-layer AND cross-layer),
    // the chat blocks on dying arcs, and unwires every surviving portal that
    // targeted it. The confirm dialog's counts come from layerRemovalImpact
    // (R1). The last remaining layer is never deletable; deleting the ACTIVE
    // layer resets it exactly as loadMap does (D69 first paint).
    removeLayer: (layerId) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      if (!map.layers.some((l) => l.id === layerId)) {
        throw new Error(`[TravelMapper] removeLayer: unknown layer id '${layerId}'`);
      }
      if (map.layers.length === 1) {
        throw new Error(
          `[TravelMapper] removeLayer: '${layerId}' is the last remaining layer — the last remaining layer is never deletable (D82)`,
        );
      }
      // The dying id set spans BOTH planes: map nodes on the layer plus the
      // overlay's waypoints on it (a waypoint on a dead layer is a dangling
      // ref — meaningless, it dies with the layer; the F50 both-planes rule).
      const dying = new Set([
        ...map.nodes.filter((nd) => nd.layer === layerId).map((nd) => nd.id),
        ...overlay.userNodes.filter((nd) => nd.layer === layerId).map((nd) => nd.id),
      ]);
      // C30: the COMPLETE post-state map is built and validated FIRST — layer
      // gone, resident nodes/arcs gone, surviving portals to it unwired.
      const clone = structuredClone(map);
      clone.layers = clone.layers.filter((l) => l.id !== layerId);
      clone.nodes = clone.nodes.filter((nd) => nd.layer !== layerId);
      clone.edges = clone.edges.filter((e) => !dying.has(e.source) && !dying.has(e.target));
      for (const nd of clone.nodes) {
        if (nd.portal === layerId) delete nd.portal; // a portal dies with its target (D85)
      }
      validateWorldMap(clone); // MapValidationError propagates; nothing touched
      // Apply the identical edit to the live map …
      map.layers = map.layers.filter((l) => l.id !== layerId);
      map.nodes = map.nodes.filter((nd) => nd.layer !== layerId);
      const dyingEdges = map.edges.filter((e) => dying.has(e.source) || dying.has(e.target));
      map.edges = map.edges.filter((e) => !dying.has(e.source) && !dying.has(e.target));
      // … the overlay cascade (the removeNode precedent): waypoints on the
      // layer, their incident user edges, and the chat blocks on every dying
      // edge in BOTH planes (F50 — a surviving blocked entry would fail
      // validateOverlay at the next load).
      const dyingUserEdges = overlay.userEdges.filter((e) => dying.has(e.source) || dying.has(e.target));
      overlay.userNodes = overlay.userNodes.filter((nd) => nd.layer !== layerId);
      overlay.userEdges = overlay.userEdges.filter((e) => !dying.has(e.source) && !dying.has(e.target));
      for (const e of [...dyingEdges, ...dyingUserEdges]) delete overlay.blocked[e.id];
      for (const id of dying) delete overlay.nodeBlocked[id]; // A-018 follow-up (D94/F50): every dying node's block dies with it — both planes (the edge-block mirror; a surviving entry would fail validateOverlay at the next load)
      // Gate-verifier finding 1 (M3 gate): the saved-plane universes shrink
      // with an un-undoable removal (F46 — the user who deleted the layer
      // will not place waypoints on it, and the eventual saveMap must never
      // persist overlay state naming ids the saved map lacks; a bind admitted
      // here would brick the next loadMap's validateOverlay). The A-014
      // doctrine's "only saveMap/loadMap move the saved plane" is thereby
      // amended: un-undoable removals move it too.
      state.savedLayerIds.delete(layerId);
      for (const id of dying) state.savedNodeIds.delete(id);
      for (const e of [...dyingEdges, ...dyingUserEdges]) state.savedEdgeIds.delete(e.id);
      // Surviving portals to the dying layer are unwired by fresh-object swap
      // (the D75 seam — the old node objects stay byte-identical).
      map.nodes = map.nodes.map((nd) => {
        if (nd.portal !== layerId) return nd;
        const fresh: MapNodeData = { ...nd };
        delete fresh.portal;
        return fresh;
      });
      // D69: deleting the ACTIVE layer resets it to the survivors' first
      // layer — exactly loadMap's first-paint rule; a surviving active layer
      // is untouched (the active layer is an id, not an index).
      if (state.activeLayer === layerId) state.activeLayer = map.layers[0].id;
      state.dirty = true;
    },

    // D82: array/nav order only — the switcher, the breadcrumb siblings and
    // the save order all read map.layers; the hierarchy itself derives from
    // portal wiring (D85), so this command touches ORDER and nothing else.
    reorderLayers: (layerIds) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      // C30/F50: a runtime caller can lie about the typed array — refuse
      // field-precisely before anything is read (the calibrateScale guard
      // discipline).
      if (!Array.isArray(layerIds) || layerIds.some((id) => typeof id !== 'string')) {
        throw new Error(
          `[TravelMapper] reorderLayers: layerIds must be an array of layer id strings (got '${String(layerIds)}')`,
        );
      }
      // An EXACT permutation of the current id set: same length, same
      // membership, no duplicates — anything else names the mismatch (C30).
      const current = new Set(map.layers.map((l) => l.id));
      const seen = new Set<string>();
      const duplicates: string[] = [];
      const unknown: string[] = [];
      for (const id of layerIds) {
        if (seen.has(id)) duplicates.push(id);
        else seen.add(id);
        if (!current.has(id)) unknown.push(id);
      }
      const missing = [...current].filter((id) => !seen.has(id));
      if (duplicates.length > 0 || unknown.length > 0 || missing.length > 0) {
        const parts: string[] = [];
        if (unknown.length > 0) parts.push(`unknown: ${unknown.join(', ')}`);
        if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
        if (duplicates.length > 0) parts.push(`duplicate: ${duplicates.join(', ')}`);
        throw new Error(
          `[TravelMapper] reorderLayers: not an exact permutation of the current layer ids — ${parts.join('; ')}`,
        );
      }
      // A FRESH array in the given order; the element objects keep their
      // identity (nothing about them changed). The active layer is an id, not
      // an index — unchanged by construction.
      const byId = new Map(map.layers.map((l) => [l.id, l] as const));
      map.layers = layerIds.map((id) => byId.get(id)!);
      state.dirty = true;
    },

    // D82/R1: the delete dialog's counts — core-computed, never UI math.
    // PURE: reads only, no mutation, no dirty, no rebuild. Counts EXACTLY what
    // removeLayer deletes, across BOTH planes, with the same dying-set
    // definition. Never refuses on 'last layer' — the dialog never offers the
    // delete there; the count is honest either way.
    layerRemovalImpact: (layerId) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      if (!map.layers.some((l) => l.id === layerId)) {
        throw new Error(`[TravelMapper] layerRemovalImpact: unknown layer id '${layerId}'`);
      }
      const dying = new Set([
        ...map.nodes.filter((nd) => nd.layer === layerId).map((nd) => nd.id),
        ...overlay.userNodes.filter((nd) => nd.layer === layerId).map((nd) => nd.id),
      ]);
      let sameLayerArcs = 0;
      let crossLayerArcs = 0;
      for (const edge of [...map.edges, ...overlay.userEdges]) {
        const dyingEndpoints = (dying.has(edge.source) ? 1 : 0) + (dying.has(edge.target) ? 1 : 0);
        if (dyingEndpoints === 2) sameLayerArcs += 1;
        else if (dyingEndpoints === 1) crossLayerArcs += 1;
      }
      return { nodes: dying.size, sameLayerArcs, crossLayerArcs };
    },

    // D82/F54: the node detach tool — ONE teardown semantic with the delete
    // cascade, two surfaces. Every incident edge dies in BOTH planes (map
    // edges + user edges) and their chat blocks die with them (F50); the node
    // itself survives byte-identical — no swap, it is untouched. Zero
    // incident edges ⇒ a validating no-op: dirty stays untouched.
    detachNode: (nodeId) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      if (!map.nodes.some((nd) => nd.id === nodeId)) {
        throw new Error(`[TravelMapper] detachNode: unknown node id '${nodeId}'`);
      }
      const incident = (e: MapEdgeData): boolean => e.source === nodeId || e.target === nodeId;
      if (!map.edges.some(incident) && !overlay.userEdges.some(incident)) return; // nothing changes
      const clone = structuredClone(map); // C30: clone-validate-apply
      clone.edges = clone.edges.filter((e) => !incident(e));
      validateWorldMap(clone);
      const dyingEdges = map.edges.filter(incident);
      map.edges = map.edges.filter((e) => !incident(e));
      const dyingUserEdges = overlay.userEdges.filter(incident);
      overlay.userEdges = overlay.userEdges.filter((e) => !incident(e));
      for (const e of [...dyingEdges, ...dyingUserEdges]) delete overlay.blocked[e.id];
      // Gate-verifier finding 1 (M3 gate): the saved-edge universe shrinks
      // with the un-undoable detach (F46) — same seam as removeLayer's
      // cascade above; a setBlocked on a detached id must refuse, never
      // persist into the F50 brick.
      for (const e of [...dyingEdges, ...dyingUserEdges]) state.savedEdgeIds.delete(e.id);
      state.dirty = true;
    },

    // D83: the node property panel's Layer dropdown — the ONE way to move a
    // node between layers. C3 rides unchanged: cross-layer-ness DERIVES from
    // endpoint layers, so NO edge is touched before, during or after (the
    // edges are ordinary arcs throughout). The stranding refusals (a compound
    // relation left across layers — parent or child) and the portal-own-layer
    // refusal ride the C30 clone gate: the validator's parent-same-layer and
    // portal rules refuse field-precisely; nothing is ever silently
    // re-parented. The D75 splice seam applies — a FRESH node object swaps
    // in, the old one stays byte-identical for the effective graph.
    setNodeLayer: (nodeId, layerId) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      const index = map.nodes.findIndex((nd) => nd.id === nodeId);
      if (index === -1) {
        throw new Error(`[TravelMapper] setNodeLayer: unknown node id '${nodeId}'`);
      }
      if (!map.layers.some((l) => l.id === layerId)) {
        throw new Error(`[TravelMapper] setNodeLayer: unknown layer id '${layerId}'`);
      }
      if (map.nodes[index].layer === layerId) return; // already there — dirty untouched
      const fresh: MapNodeData = { ...map.nodes[index], layer: layerId };
      const clone = structuredClone(map); // C30: clone-validate-apply
      clone.nodes[index] = fresh;
      validateWorldMap(clone); // the stranding/portal refusals propagate; nothing touched
      map.nodes[index] = fresh;
      state.dirty = true;
    },

    // D84: store the background REFERENCE — `{ assetId }` (localforage
    // upload, D29) or `{ url }` (remote URL, travels with the saved map). The
    // core never loads images: the localforage adapter and URL loading are
    // app-side; C32's degrade-never-throw governs that LOAD path, command-
    // time validation throws per C30 (the standing regime). Exactly-one-arm
    // is the VALIDATOR's rule — the clone gate refuses both/neither/ad-hoc
    // shapes field-precisely, and `null` clears.
    //
    // D93 fresh-start rule: the minimal-fresh shape below — a fresh LayerData
    // carrying ONLY id/name (plus the new background on the source path) —
    // OMITS every other arm, so EVERY call (new source or null) resets the
    // D93 presentation arms (`backgroundPlacement`/`backgroundDim`) to their
    // defaults (absent): an old image's placement/dim tuning must never leak
    // into the new one. Re-tuning is the two presentation commands' business.
    setLayerBackground: (layerId, source) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      const index = map.layers.findIndex((l) => l.id === layerId);
      if (index === -1) {
        throw new Error(`[TravelMapper] setLayerBackground: unknown layer id '${layerId}'`);
      }
      // PUT: null clears — the fresh object simply carries no background.
      const fresh: LayerData = { id: layerId, name: map.layers[index].name };
      if (source !== null) fresh.background = { ...source };
      const clone = structuredClone(map); // C30: clone-validate-apply
      clone.layers[index] = fresh;
      validateWorldMap(clone); // the background arm rule refuses field-precisely
      map.layers[index] = fresh;
      state.dirty = true;
    },

    // D93: the per-layer placed background — the STORAGE + validation surface
    // the app persists its D92 calibrate-mode result through (the core never
    // loads images and never computes the fit). x/y = the image's CENTER in
    // MODEL coordinates (the same plane the nodes live in), scale = MODEL
    // UNITS PER IMAGE PIXEL — aspect-locked by construction (one scale, no
    // rotation ever); `null` clears the arm so the app's D92 default fit
    // applies again. Pure presentation data beside the graph — nothing in the
    // snapshot, template, routing or the effective graph reads it (D90/D92;
    // calibration never touches node coordinates, distances or costs —
    // structural here). The setPortal discipline verbatim: unknown-id ad-hoc
    // refusal; a FRESH layer object with the arm set or deleted; C30
    // clone-validate-apply (the VALIDATOR owns the shape rules — finite x/y,
    // finite scale > 0 — field-precise, no ad-hoc checks); dirty, never stale
    // (D75 — map data, unlike the A-018 overlay node blocks).
    setLayerBackgroundPlacement: (layerId, placement) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      const index = map.layers.findIndex((l) => l.id === layerId);
      if (index === -1) {
        throw new Error(`[TravelMapper] setLayerBackgroundPlacement: unknown layer id '${layerId}'`);
      }
      const fresh: LayerData = { ...map.layers[index] };
      if (placement === null) delete fresh.backgroundPlacement; // clear — the D92 default fit applies again
      else fresh.backgroundPlacement = { ...placement }; // never alias the caller's object (D75)
      const clone = structuredClone(map); // C30: clone-validate-apply
      clone.layers[index] = fresh;
      validateWorldMap(clone); // the placement shape rules refuse field-precisely
      map.layers[index] = fresh;
      state.dirty = true; // D75: dirty, never stale — saveMap is the live trigger
    },

    // D90/D93: the per-layer background DIM — 0–1 (0 = undimmed, 1 = fully
    // dimmed toward the stage backdrop), saved WITH THE MAP (the D90 owner
    // pick) so it exports to SillyTavern in Phase 4. Pure presentation data —
    // never enters the snapshot or the template (D90). The setPortal
    // discipline verbatim (see setLayerBackgroundPlacement above): the
    // VALIDATOR owns the 0–1 rule (NaN fails the finite test) via the C30
    // clone gate, fresh-object swap, dirty never stale (D75).
    setLayerBackgroundDim: (layerId, dim) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      const index = map.layers.findIndex((l) => l.id === layerId);
      if (index === -1) {
        throw new Error(`[TravelMapper] setLayerBackgroundDim: unknown layer id '${layerId}'`);
      }
      const fresh: LayerData = { ...map.layers[index] };
      fresh.backgroundDim = dim; // the validator owns the 0–1 rule (C30)
      const clone = structuredClone(map); // C30: clone-validate-apply
      clone.layers[index] = fresh;
      validateWorldMap(clone); // a dim outside 0–1 (or non-finite) refuses field-precisely
      map.layers[index] = fresh;
      state.dirty = true; // D75: dirty, never stale — saveMap is the live trigger
    },

    // D85: wire (or unwire, null) the portal — the layer's ONE entry node.
    // All three wiring violations (unknown target, own layer, a second node
    // onto an already-wired layer) are the VALIDATOR's portal rules — the C30
    // clone gate refuses each field-precisely at nodes[i].portal, no ad-hoc
    // checks. Fresh-object swap (the D75 seam). The hierarchy DERIVES from
    // this wiring — there is no second structure to maintain (R4 spirit).
    setPortal: (nodeId, layerId) => {
      const { map, overlay } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      const index = map.nodes.findIndex((nd) => nd.id === nodeId);
      if (index === -1) {
        throw new Error(`[TravelMapper] setPortal: unknown node id '${nodeId}'`);
      }
      const fresh: MapNodeData = { ...map.nodes[index] };
      if (layerId === null) delete fresh.portal; // unwire
      else fresh.portal = layerId;
      const clone = structuredClone(map); // C30: clone-validate-apply
      clone.nodes[index] = fresh;
      validateWorldMap(clone); // the portal rules refuse field-precisely
      map.nodes[index] = fresh;
      state.dirty = true;
    },

    // --- Queries -----------------------------------------------------------------

    findRoute: (from, to, mode) => computeRoute(from, to, mode),

    // A-008: the C19/C20/C23/C27 snapshot. A QUERY — ensureFresh, then pure
    // reads; it never sets stale and mutates nothing (C8).
    getSnapshot: () => {
      ensureFresh(); // C8 — queries never observe a stale graph
      const { map, overlay, effective } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      const eff = effective!; // C8 invariant: with map+overlay loaded, ensureFresh has built the graph
      const savedScale = state.savedScale!; // A-015/D75: the snapshot prices the SAVED scale — an unsaved calibration never enters it

      // D60 default pricing context: the chat's travel mode preferred, the
      // MAP's mode universe the candidates (A-016b/D78/C19 — getSnapshot takes
      // no mode argument, §9 surface; the universe is built-ins ∪ registry
      // ids, so an arc allowing only a registry mode prices here too instead
      // of silently dropping from C19's "exactly" list). Universe source is
      // the LIVE map: no M2 editor command can mutate map.modes (the registry
      // arrives only via loadMap), so live == saved today; when a
      // registry-EDITING command arrives, this scan set must move to the
      // saved plane exactly as savedScale did (A-015 doctrine). ONE derived
      // constant serves the pricing scan, the D65(b) minutes predicate and
      // the blocked-arc allowed-list fallback below.
      const positions = new Map(eff.nodes.map((node) => [node.id, node.position] as const));
      const positionOf = (id: string): { x: number; y: number } | undefined => positions.get(id);
      const candidates: readonly TravelMode[] = [...modeUniverseOf(map)];
      const preferred = overlay.travelMode;

      // The C19 arc list — the same selection buildSnapshot walks (a pure
      // function of eff + pin; the frozen buildSnapshot signature carries no
      // currency argument, so the D60 currency decision is taken here and the
      // unit label is derived in build.ts by the same rule over the same arcs).
      const pinId = eff.pin.id;
      const pinNode = pinId === null ? undefined : eff.nodes.find((node) => node.id === pinId);
      const pin =
        pinNode !== undefined && eff.pin.valid && !isUnnamedUser(pinNode) ? pinNode : undefined;
      const neighborhood =
        pin === undefined
          ? []
          : eff.edges.filter((edge) => {
              if (edge.source !== pin.id && edge.target !== pin.id) return false;
              const other = eff.nodes.find((node) => node.id === (edge.source === pin.id ? edge.target : edge.source));
              return other !== undefined && !isUnnamedUser(other);
            });

      // D65(a) routes currency — minutes iff at least one LIVE prompt-listable
      // incident arc exists and every one prices in minutes; otherwise
      // canonical units (completeness beats the minutes preference — C19's
      // "exactly the arcs incident to the pin"). Blocked arcs are exempt
      // (D65(b): they always list — best-effort cost or cost 0 — so they price
      // in either currency and never constrain the choice). An empty live set
      // presents no minutes-derived cost, so it stays canonical — the same
      // unit-label default as the C27 degraded path. Same minutesPriced helper
      // routing uses (C15/D60); kept in lockstep with build.ts's
      // routesCurrency: same predicate, same exemptions, same arc selection,
      // same universe scan (A-016b — modeUniverseOf on both sides).
      const liveArcs = neighborhood.filter((edge) => edge.blocked === undefined);
      const allMinutes =
        liveArcs.length > 0 &&
        liveArcs.every((edge) =>
          candidates.some((m) => edge.modes[m]?.allowed === true && minutesPriced(edge, m, savedScale)),
        );
      const currency: CostCurrency = allMinutes ? 'minutes' : 'canonical';

      // C2/C17/D65: prompt pricing strips the BLOCK, never the reason. A live
      // arc that cannot honestly price in the list's currency returns null ⇒
      // dropped (D65(a)); a BLOCKED arc is never dropped (D65(b) — C2 wins
      // over D60's exclusion): it prices best-effort, and when unpriceable
      // there it lists with cost 0 and its cheapest allowed mode — the reason,
      // not the cost, is the prompt payload. The ∞ sentinel never reaches the
      // snapshot.
      const priceEdge = (edge: MapEdgeData): { mode: TravelMode; cost: number } | null => {
        const priced = priceForSnapshot(
          { ...edge, blocked: undefined },
          currency,
          candidates,
          preferred,
          savedScale,
          positionOf,
        );
        if (Number.isFinite(priced.cost)) return priced;
        if (edge.blocked === undefined) return null; // D65(a): a live arc that cannot honestly price drops
        // A-016b: the fallback's allowed-list scans the universe too — a
        // blocked registry-only arc lists with ITS mode ('Horseback'), never
        // the preferred mode's word for an arc that forbids it.
        const allowed = candidates.filter((m) => edge.modes[m]?.allowed === true);
        return { mode: allowed[0] ?? preferred, cost: 0 }; // D65(b): cost 0 + cheapest allowed mode
      };

      // C20/D25: destinations route through the facade's ONE route computation,
      // FORCED into the snapshot's currency (D65(c) — no per-run canonical
      // fallback inside this snapshot; a hub without an in-currency route
      // drops like a cross-currency route arc).
      const routeTo = (nodeId: string): RouteResult => computeRoute(pinId!, nodeId, undefined, currency);

      // A-015/D75: buildSnapshot reads scale through its `map` parameter
      // (routesCurrency + the unit labels) — hand it a READ-VIEW over the live
      // map whose scale is the SAVED snapshot, so the currency decision and the
      // label stay in lockstep with the closures above. A projection for this
      // one synchronous call, never a second copy of the truth (R4).
      return buildSnapshot({ ...map, scale: savedScale }, overlay, eff, priceEdge, routeTo);
    },
    // A-009: render a USER template over the current snapshot (C22). The
    // template content is user data host-stored (D23); the words may be
    // anything — XML, markdown, brackets, bare text (D24/F33).
    renderTemplate: (tpl) => renderViaEngine(tpl),

    // A-009: the prompt block — the DEFAULT template over the current
    // snapshot (D23: user templates are host-stored; the host passes them to
    // renderTemplate). Same engine/C32 rules via the one render path (F34).
    getPromptBlock: () => renderViaEngine(DEFAULT_TEMPLATE),

    // --- Viewer state (Phase 2) ---------------------------------------------------

    // P2 M1 (B-101): which layer the viewer shows — facade-held VIEWER state
    // (F01/D69), never map data and never read by the snapshot (the snapshot's
    // layer derives from the pin's node layer, snapshot/build.ts). Membership
    // is checked against state.map.layers directly, so no ensureFresh is
    // needed here (C8's stale flag is still the mutation contract).
    setActiveLayer: (layerId) => {
      const { map } = state;
      if (map === null) throw new Error('[TravelMapper] setActiveLayer: no map loaded');
      // C30/F50: validate BEFORE mutating — a runtime caller can lie about the
      // typed string, and any id not in the live map's layers is refused.
      if (!map.layers.some((l) => l.id === layerId)) {
        throw new Error(`[TravelMapper] setActiveLayer: unknown layer id '${layerId}'`);
      }
      state.activeLayer = layerId;
      state.stale = true; // C8 — the flag is the mutation contract even though no query reads it yet
    },
  };

  states.set(facade, state);
  return facade;
}
