// src/core/facade.ts — the CORE.md §9 facade: the only command surface the
// frontend (src/app) and host (src/st) may call (R2). Frozen with api.ts at
// Task 0; implementation lands in the Phase 1 packets.
//
// Every stub throws — never returns fake data (Task 0 rule). The TODO markers
// name the milestone that delivers each command.

import type {
  ChatMapOverlay,
  MapEdgeData,
  MapNodeData,
  MapSnapshot,
  RouteResult,
  TravelMode,
  WorldMapData,
} from './api';

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

/** Stub facade: every command throws an explicit TODO (no fake data). */
export function createFacade(): MapFacade {
  return {
    loadMap: () => { throw todo('M1', 'loadMap'); },
    materialize: () => { throw todo('M1', 'materialize'); },
    forkMap: () => { throw todo('M1', 'forkMap'); },
    saveForkToLibrary: () => { throw todo('M1', 'saveForkToLibrary'); },
    validateImport: () => { throw todo('M1', 'validateImport'); },
    migrateData: () => { throw todo('M1', 'migrateData'); },
    setCurrentLocation: () => { throw todo('M1', 'setCurrentLocation'); },
    setStatusNote: () => { throw todo('M1', 'setStatusNote'); },
    setTravelMode: () => { throw todo('M1', 'setTravelMode'); },
    setBlocked: () => { throw todo('M2', 'setBlocked'); },
    addUserNodeAt: () => { throw todo('M2', 'addUserNodeAt'); },
    removeUserNode: () => { throw todo('M2', 'removeUserNode'); },
    promoteUserNode: () => { throw todo('M2', 'promoteUserNode'); },
    upsertNode: () => { throw todo('Phase 3', 'upsertNode'); },
    upsertEdge: () => { throw todo('Phase 3', 'upsertEdge'); },
    removeNode: () => { throw todo('Phase 3', 'removeNode'); },
    removeEdge: () => { throw todo('Phase 3', 'removeEdge'); },
    calibrateScale: () => { throw todo('Phase 3', 'calibrateScale'); },
    saveMap: () => { throw todo('Phase 3', 'saveMap'); },
    findRoute: () => { throw todo('M2', 'findRoute'); },
    getSnapshot: () => { throw todo('M3', 'getSnapshot'); },
    renderTemplate: () => { throw todo('M3', 'renderTemplate'); },
    getPromptBlock: () => { throw todo('M3', 'getPromptBlock'); },
    setActiveLayer: () => { throw todo('Phase 2', 'setActiveLayer'); },
  };
}
