// src/app/graph/map-library.ts — PKG B-137 (§5 Phase 3 M4 / §5 M4 line, D40).
//
// The map LIBRARY SEAM the Maps manager panel goes through: list (light row
// summaries), get (one full map), save (an UPSERT by map.id), delete. D40
// stands: a chat starts mapless and the user explicitly picks a map — the
// library is that picker's store. The real host persists over localforage
// (the C packet owns that host impl, exactly as C-002 owns the
// BackgroundStore's); this file ships ONLY the InjectionToken + the
// dev-harness in-memory impl. NOTHING here pretends to be host persistence:
// the harness library is session-memory by design (a reload forgets — FINE
// for e2e, every spec seeds its own state through the UI or the boot map).
//
// Interface contract note for the host impl (the BackgroundStore precedent,
// B-130/C-002): every method is ASYNC and REJECTS on store failure — never
// throws synchronously — leaving the C32 degrade (words in the panel, never
// an uncaught throw) to the caller. Data in / data out (R4 — the library is
// a STORE, never a second graph truth): the harness impl deep-clones on
// save (the store keeps its own copy; a live loaded map's in-place edits —
// C24 — never leak into the stored row) and on get (the caller receives an
// independent copy — the displayMap doctrine: the facade gets its own
// object, the library keeps its own; `structuredClone`).
//
// The LIST SHAPE (the packet's decide-and-document): `list()` returns LIGHT
// ROW SUMMARIES (id + name + forkedFrom), not full maps — the panel renders
// names (C23: authored words; ids never render but Open/Duplicate/Delete
// key on the id the row carries), and shipping whole maps in every list
// read would be wasteful. `get(id)` is the full-map read (Open/Duplicate —
// discrete user actions, not render-path reads).
import { InjectionToken } from '@angular/core';
import type { WorldMapData } from '../../core/api';

/** One library row as the panel's list renders it — light words, no payload. */
export interface LibraryEntry {
  readonly id: string;
  /** The authored display word (C23 — this is what renders). */
  readonly name: string;
  /** D41/C25 provenance: the immediate parent map's id when the map is a
   *  FORK, else null (library originals and duplicates carry none). */
  readonly forkedFrom: string | null;
}

/**
 * B-137 (D40): the map library — where authored maps live between sessions.
 * `save` is an UPSERT keyed by `map.id` (a re-save of the same id REPLACES
 * the stored row — the save dock's store write); `delete` of an unknown id
 * is a no-op (C32 spirit); `get` of an unknown id resolves null (the panel
 * degrades in words, never a throw).
 */
export interface MapLibrary {
  /** Every stored map as a light row (the impl's order contract — the harness: insertion order, the Phase 4 host: name-sorted; a render input, not truth). */
  list(): Promise<readonly LibraryEntry[]>;
  /** One full map — an independent copy (the contract note above) — or null when unknown. */
  get(id: string): Promise<WorldMapData | null>;
  /** UPSERT by map.id — the store keeps its own deep copy of the handed map. */
  save(map: WorldMapData): Promise<void>;
  /** Remove a stored map (no-op when unknown — C32 spirit). */
  delete(id: string): Promise<void>;
}

/**
 * B-137: the library token. The factory below IS the harness impl — the C
 * packet swaps this factory for the localforage-backed host implementation
 * (the st-integration charter's persistence surface, Phase 4); nothing else
 * in the app changes (the BACKGROUND_STORE precedent, B-130).
 */
export const MAP_LIBRARY = new InjectionToken<MapLibrary>('MAP_LIBRARY', {
  providedIn: 'root',
  factory: () => new InMemoryMapLibrary(), // HARNESS IMPL — the C packet owns the host impl
});

/**
 * The dev-harness MapLibrary: an in-memory Map keyed by map id —
 * session-local by design (the harness has no host storage; a reload
 * forgets, which is fine for e2e: every spec seeds its own state through
 * the UI or the boot map). Clones on the way in AND out (the contract note
 * above — independence both ways, the C24 deep-copy discipline).
 */
class InMemoryMapLibrary implements MapLibrary {
  private readonly maps = new Map<string, WorldMapData>();

  async list(): Promise<readonly LibraryEntry[]> {
    return [...this.maps.values()].map((map) => ({
      id: map.id,
      name: map.name,
      forkedFrom: map.forkedFrom ?? null,
    }));
  }

  async get(id: string): Promise<WorldMapData | null> {
    const map = this.maps.get(id);
    return map === undefined ? null : structuredClone(map);
  }

  async save(map: WorldMapData): Promise<void> {
    this.maps.set(map.id, structuredClone(map)); // UPSERT by id — the store's own copy
  }

  async delete(id: string): Promise<void> {
    this.maps.delete(id); // unknown — a no-op (C32 spirit)
  }
}
