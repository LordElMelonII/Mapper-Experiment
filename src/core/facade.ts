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
// forced-currency destination runs) and blocked arcs that always list.
// Commands still unimplemented throw their exact TODO markers — never fake
// data (Task 0 rule).

import type {
  ChatMapOverlay,
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
import { isPinEligible, validateOverlay, validateWorldMap } from './model/validate';
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
  addUserNodeAt(layer: string, position: { x: number; y: number }): void;
  removeUserNode(id: string): void;
  promoteUserNode(id: string, label: string): void;
  // Editor commands
  upsertNode(node: MapNodeData): void;
  upsertEdge(edge: MapEdgeData): void;
  removeNode(id: string): void;
  removeEdge(id: string): void;
  calibrateScale(arcId: string, authoredDistance: number): void;
  saveMap(): void;
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

// Mirrors validate.ts's private union membership (F50) — the runtime guard for
// setTravelMode (C30). Kept local: the facade needs no new export from validate.
const TRAVEL_MODES: readonly TravelMode[] = ['walk', 'car', 'train'];

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
 * currency/map shape is priceEdgeIn verbatim. Routing itself keeps D60's
 * strict currency filter (the interleaved-currency verifier pin), so this
 * helper is the SNAPSHOT seam only: getSnapshot's priceEdge closure and the
 * forced destination runs (D65(c)) — never findRoute's own runs.
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

    // C30: field-precise endpoint validation against the effective node set.
    if (!eff.nodes.some((node) => node.id === from)) {
      throw new Error(`[TravelMapper] findRoute: unknown node id '${from}'`);
    }
    if (!eff.nodes.some((node) => node.id === to)) {
      throw new Error(`[TravelMapper] findRoute: unknown node id '${to}'`);
    }
    if (from === to) return { ok: true, total: 0, legs: [] }; // route-to-self (§6.2) — trivially satisfiable

    const positions = new Map(eff.nodes.map((node) => [node.id, node.position] as const));
    const positionOf = (id: string): { x: number; y: number } | undefined => positions.get(id);

    // Per-edge pricing (D19/F32, D60): an explicit mode is a strict filter
    // (C14 row 2) over a single candidate; the default prefers the chat's
    // travel mode and falls back to the cheapest mode the arc allows. Every
    // number comes from edgeCost via priceEdgeIn — one cost function for every
    // edge kind, no parallel math (C14, §6.2). C15/D60: ONE currency per route
    // — every computation runs minutes-first and falls back to canonical units
    // only when no minutes-priced route exists; a mode priced in the other
    // currency is unroutable in a run (counting as "disallowed" for it).
    // D65(c): a FORCED run prices through the snapshot seam's honest read
    // (priceForSnapshot) so destination costs share the snapshot's ONE honest
    // currency; findRoute's own runs keep the strict D60 filter verbatim.
    const nodeIds = eff.nodes.map((node) => node.id);
    const candidates: readonly TravelMode[] = mode !== undefined ? [mode] : TRAVEL_MODES;
    const preferred = mode !== undefined ? mode : overlay.travelMode;
    const priceIn = (edge: MapEdgeData, currency: CostCurrency): { mode: TravelMode; cost: number } =>
      forcedCurrency !== undefined
        ? priceForSnapshot(edge, currency, candidates, preferred, map.scale, positionOf)
        : priceEdgeIn(edge, currency, candidates, preferred, map.scale, positionOf);
    const run = (currency: CostCurrency) =>
      shortestPath(nodeIds, eff.edges, (edge) => priceIn(edge, currency).cost, from, to);
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

    if (!result.ok) {
      // C17: translate unreachability into a human reason. Was the graph
      // disconnected in principle, or did blocks/mode restrictions sever it?
      // Brute-force probe (D59): a second plain run at weight 1 per edge —
      // ignoring blocked/disallowed costs entirely (C2).
      const connected = shortestPath(nodeIds, eff.edges, () => 1, from, to).ok;
      const labelOf = (id: string): string => eff.nodes.find((node) => node.id === id)?.label ?? id;
      return {
        ok: false,
        total: 0,
        legs: [],
        reason: connected
          ? 'every candidate arc is blocked or disallowed for this mode'
          : `no path connects '${labelOf(from)}' and '${labelOf(to)}'`,
      };
    }

    // C18 legs: from→to per traversal (dijkstra hands the orientation back),
    // the priced mode per leg — FX2's walk-then-train shape.
    const edgeById = new Map(eff.edges.map((edge) => [edge.id, edge] as const));
    const legs: RouteLeg[] = result.legs.map((leg) => ({
      arcId: leg.arcId,
      from: leg.from,
      to: leg.to,
      mode: priceEdge(edgeById.get(leg.arcId)!).mode, // dijkstra only emits arcIds from eff.edges
      cost: leg.cost,
    }));
    return { ok: result.ok, total: result.total, legs };
  };

  // C5: ids belong to the engine — two per-facade monotonic counters, one per
  // id space (§6.2 schemes 'wp-<n>' for user nodes, 'we-<n>' for user edges).
  // Each candidate is bumped until free in the merged id set, so rapid taps
  // (§6.2) and authored data that already uses the scheme can never collide.
  let nextNodeId = 1;
  let nextEdgeId = 1;

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
      // C27: the pin is chat state, not graph data — a live library edit (C24)
      // can make the pinned node ineligible at any moment, so load neither
      // refuses nor snaps on pin eligibility; the pin rides along and
      // materialization marks it invalid (C8). Eligibility is still enforced
      // by validateOverlay's default mode (the D58 contract) and by
      // setCurrentLocation below. (Normative: M1 verifier FINDING 3 — an
      // overlay pinning a childless district loads; its pin is simply invalid.)
      const validatedOverlay = validateOverlay(overlay, validatedMap, { tolerateIneligiblePin: true });
      state.map = validatedMap; // C24: the library object itself, never a copy
      state.overlay = validatedOverlay;
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
      const { overlay } = state;
      if (overlay === null) throw new Error('[TravelMapper] no map loaded');
      // C30: validate BEFORE mutating — the same membership validateOverlay
      // enforces at load (F50); a runtime caller can bypass the type system.
      if (!TRAVEL_MODES.includes(mode)) {
        throw new Error(
          `[TravelMapper] setTravelMode: travel mode must be one of: ${TRAVEL_MODES.join(', ')} (got '${String(mode)}')`,
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
      ensureFresh(); // C8 — the membership check below reads the current effective graph
      const { overlay, effective } = state;
      if (overlay === null || effective === null) throw new Error('[TravelMapper] no map loaded');
      if (!effective.edges.some((edge) => edge.id === edgeId)) {
        throw new Error(`[TravelMapper] setBlocked: unknown edge id '${edgeId}'`);
      }
      if (reason !== undefined) {
        // C30/F50: a runtime caller can lie about the typed optional — validate
        // before mutating (setStatusNote precedent). An empty string is neither
        // a reason nor a lift: refusing it never silently clears a block.
        if (typeof reason !== 'string' || reason.length === 0) {
          throw new Error(
            `[TravelMapper] setBlocked: reason must be a non-empty string or undefined (got '${String(reason)}')`,
          );
        }
        overlay.blocked[edgeId] = reason; // D20: chat-scoped block — adds or restates only
      } else {
        // Lift: delete the overlay entry. C2/A-002 — the overlay can only add a
        // block, never lift one, so a library-level block survives this delete
        // (a silent no-op there); the next rebuild re-merges the union.
        delete overlay.blocked[edgeId];
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
      if (!map.layers.some((l) => l.id === layer)) {
        throw new Error(`[TravelMapper] addUserNodeAt: unknown layer id '${layer}'`);
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

      // C7: the k nearest leaves of the MERGED node set on this layer —
      // library nodes and previously placed waypoints alike. The ONE D58
      // predicate is the leaf rule (kind ∈ {location, hub, waypoint} AND
      // childless — containers and parents never connect, C1); the new node
      // excludes itself; unpositioned candidates are unmeasurable and skipped
      // (§6.2). Fewer than k leaves ⇒ connect to what exists; zero ⇒ the node
      // stays orphaned — legal and harmless (C7).
      const merged = [...map.nodes, ...overlay.userNodes];
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
      // (C30/F50 — the setStatusNote precedent).
      if (typeof label !== 'string' || label.length === 0) {
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
      state.stale = true; // C8
    },

    // --- Editor commands (Phase 3) ---------------------------------------------

    upsertNode: () => { throw todo('Phase 3', 'upsertNode'); },
    upsertEdge: () => { throw todo('Phase 3', 'upsertEdge'); },
    removeNode: () => { throw todo('Phase 3', 'removeNode'); },
    removeEdge: () => { throw todo('Phase 3', 'removeEdge'); },
    calibrateScale: () => { throw todo('Phase 3', 'calibrateScale'); },
    saveMap: () => { throw todo('Phase 3', 'saveMap'); },

    // --- Queries -----------------------------------------------------------------

    findRoute: (from, to, mode) => computeRoute(from, to, mode),

    // A-008: the C19/C20/C23/C27 snapshot. A QUERY — ensureFresh, then pure
    // reads; it never sets stale and mutates nothing (C8).
    getSnapshot: () => {
      ensureFresh(); // C8 — queries never observe a stale graph
      const { map, overlay, effective } = state;
      if (map === null || overlay === null) throw new Error('[TravelMapper] no map loaded');
      const eff = effective!; // C8 invariant: with map+overlay loaded, ensureFresh has built the graph

      // D60 default pricing context: the chat's travel mode preferred, all
      // modes candidates (getSnapshot takes no mode argument — §9 surface).
      const positions = new Map(eff.nodes.map((node) => [node.id, node.position] as const));
      const positionOf = (id: string): { x: number; y: number } | undefined => positions.get(id);
      const candidates: readonly TravelMode[] = TRAVEL_MODES;
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
      // routesCurrency: same predicate, same exemptions, same arc selection.
      const liveArcs = neighborhood.filter((edge) => edge.blocked === undefined);
      const allMinutes =
        liveArcs.length > 0 &&
        liveArcs.every((edge) =>
          TRAVEL_MODES.some((m) => edge.modes[m]?.allowed === true && minutesPriced(edge, m, map.scale)),
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
          map.scale,
          positionOf,
        );
        if (Number.isFinite(priced.cost)) return priced;
        if (edge.blocked === undefined) return null; // D65(a): a live arc that cannot honestly price drops
        const allowed = TRAVEL_MODES.filter((m) => edge.modes[m]?.allowed === true);
        return { mode: allowed[0] ?? preferred, cost: 0 }; // D65(b): cost 0 + cheapest allowed mode
      };

      // C20/D25: destinations route through the facade's ONE route computation,
      // FORCED into the snapshot's currency (D65(c) — no per-run canonical
      // fallback inside this snapshot; a hub without an in-currency route
      // drops like a cross-currency route arc).
      const routeTo = (nodeId: string): RouteResult => computeRoute(pinId!, nodeId, undefined, currency);

      return buildSnapshot(map, overlay, eff, priceEdge, routeTo);
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

    setActiveLayer: () => { throw todo('Phase 2', 'setActiveLayer'); },
  };

  states.set(facade, state);
  return facade;
}
