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
// ensureFresh() (M2). Commands still unimplemented throw their exact TODO
// markers — never fake data (Task 0 rule).

import type {
  ChatMapOverlay,
  MapEdgeData,
  MapNodeData,
  MapSnapshot,
  RouteResult,
  TravelMode,
  WorldMapData,
} from './api';
import { buildEffectiveGraph } from './model/effective';
import type { EffectiveGraph } from './model/effective';
import { migrateWorldMap } from './model/migrate';
import { isPinEligible, validateOverlay, validateWorldMap } from './model/validate';

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

/** Internal facade state (A-002): live references plus the derived graph (C24, C8). */
export interface FacadeState {
  map: WorldMapData | null;
  overlay: ChatMapOverlay | null;
  effective: EffectiveGraph | null;
  stale: boolean;
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

/** Facade factory: M1 commands implemented, the rest still explicit TODOs. */
export function createFacade(): MapFacade {
  const state: FacadeState = { map: null, overlay: null, effective: null, stale: false };

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

    // --- Overlay edits (M2) ----------------------------------------------------

    setBlocked: () => { throw todo('M2', 'setBlocked'); },
    addUserNodeAt: () => { throw todo('M2', 'addUserNodeAt'); },
    removeUserNode: () => { throw todo('M2', 'removeUserNode'); },
    promoteUserNode: () => { throw todo('M2', 'promoteUserNode'); },

    // --- Editor commands (Phase 3) ---------------------------------------------

    upsertNode: () => { throw todo('Phase 3', 'upsertNode'); },
    upsertEdge: () => { throw todo('Phase 3', 'upsertEdge'); },
    removeNode: () => { throw todo('Phase 3', 'removeNode'); },
    removeEdge: () => { throw todo('Phase 3', 'removeEdge'); },
    calibrateScale: () => { throw todo('Phase 3', 'calibrateScale'); },
    saveMap: () => { throw todo('Phase 3', 'saveMap'); },

    // --- Queries -----------------------------------------------------------------

    findRoute: () => { throw todo('M2', 'findRoute'); },
    getSnapshot: () => { throw todo('M3', 'getSnapshot'); },
    renderTemplate: () => { throw todo('M3', 'renderTemplate'); },
    getPromptBlock: () => { throw todo('M3', 'getPromptBlock'); },

    // --- Viewer state (Phase 2) ---------------------------------------------------

    setActiveLayer: () => { throw todo('Phase 2', 'setActiveLayer'); },
  };

  states.set(facade, state);
  return facade;
}
