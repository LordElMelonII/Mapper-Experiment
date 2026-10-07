// src/st/map-library-store.ts — PKG C-003 (§5 Phase 3 M4 — the C-002
// precedent, BackgroundStore's host half).
//
// The HOST half of the map-library seam B-137 shipped in
// src/app/graph/map-library.ts — that file's interface contract note is this
// file's spec: list (LIGHT rows), get (one full map — null on miss), save
// (an UPSERT by map.id — a re-save REPLACES the stored row), delete (a no-op
// on an unknown id). Every method is ASYNC and REJECTS on store failure —
// never throws synchronously — leaving the C32 degrade (the panel's words
// channel) to the caller. D40 stands: a chat starts mapless and the user
// explicitly picks a map; this dedicated localforage store is where authored
// maps persist session-to-session on this machine — the library's
// machine-local home (the D29 side), while the map DATA itself is the thing
// that travels (export/import; D41's fork data rides export). The storage
// matrix holds: map data never shares a store with settings, the chat
// overlay, or background assets — each gets its own storeName.
//
// localforage is never imported: the instance is INJECTED (at Phase 4 wiring
// it is SillyTavern.libs.localforage — see MAP_LIBRARY_HOST_PROVIDER), so
// this module stays host-free, typechecks in bare Node, and unit-tests
// against a hand-rolled fake (the C-002 pattern; R5's spirit at the
// boundary).
//
// IMPORT DIRECTION (R5/R6): the seam types come from
// ../app/graph/map-library — the host IMPLEMENTS the app-defined seam, never
// the reverse (the C-002 import direction). R4: the library is a STORE,
// data in / data out — no second graph truth lives here.
//
// PAYLOAD DECISION: the stored row IS the map — `StoredMap` is a bare alias
// of WorldMapData, not a `{ map }` wrapper. The map is already a
// self-versioned payload (WorldMapData.schemaVersion), the key is the map's
// own id (C5 ids are the store keys here — background assets used
// randomUUIDs because they predate ids; maps HAVE ids), a one-field wrapper
// would add a nesting level for nothing, and the store is DEDICATED (only
// save() writes it), so rows carry exactly one shape. A future payload need
// (companions like a savedAt marker) is a new register row, not an
// improvisation here.
//
// ORDER CONTRACT: localforage iteration order is unspecified across drivers
// (IndexedDB walks key order, the others differ), so list() SORTS the walked
// rows by name (localeCompare) with the id as the tiebreak — deterministic
// on a given machine regardless of which driver sits under the store. The
// harness impl is insertion order (map-library.ts's own note); the two
// differ by design — every row list is "a render input, not truth", and the
// panel must not key behavior on order identity across impls. A row's id is
// the STORE KEY — the identity get/delete honor — taken from the walk key,
// name/forkedFrom from the value; for every row save() wrote the key and the
// map's own id coincide.
//
// ALIASING STANCE: no explicit deep copies here. Real localforage serializes
// to its backing store on the way in and deserializes on the way out
// (IndexedDB structured clones — verified against the bundled 1.10.x source;
// the localStorage/WebSQL drivers serialize too), so the store keeps its own
// copy of every saved map and every read — getItem and iterate alike — hands
// back a structurally fresh object: the seam's data-in/data-out independence
// holds by the serialization round-trip, and a live loaded map's in-place
// edits (C24) never leak into stored rows. The unit fake MIRRORS that
// (structural clones on the way in and out); a by-reference fake would leave
// the aliasing contract untestable.
import type { Provider } from '@angular/core';
import type { WorldMapData } from '../core/api';
import {
  MAP_LIBRARY,
  type LibraryEntry,
  type MapLibrary,
} from '../app/graph/map-library';

/**
 * The slice of localforage's instance API this store uses — the same shape
 * C-002 verified (each module carries its own slice, never a shared
 * import): against the typings bundled with local SillyTavern 1.19.0
 * (node_modules/localforage/typings/localforage.d.ts — ST pins ^1.10.0).
 * `iterate` halts early and resolves with the callback's value when it
 * returns non-undefined; a full walk without a halt resolves undefined
 * (source-verified: dist/localforage.js calls `resolve()` at cursor
 * exhaustion), which is this file's walk mode.
 */
export interface LocalforageStore {
  getItem<T = unknown>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<T>;
  removeItem(key: string): Promise<void>;
  iterate<T, U>(callback: (value: T, key: string, iterationNumber: number) => U): Promise<U>;
}

/** The global localforage the host exposes as SillyTavern.libs.localforage. */
export interface LocalforageInstance {
  createInstance(options: { name?: string; storeName?: string }): LocalforageStore;
}

/** PAYLOAD DECISION (above): the stored row IS the map — one alias, no wrapper. */
type StoredMap = WorldMapData;

/**
 * The list guard (the C-002 isStoredAsset precedent): the store is DEDICATED
 * (only save() writes it, always full maps), so this guards just against a
 * junk row crashing the light-row build (C32 spirit) — an object with a
 * string name is row-able. Deliberately NOT a schemaVersion pin: schema
 * evolution (the D78 additive precedent; C30's unknown-key tolerance) must
 * keep legacy rows LISTABLE, not silently dropped by the panel.
 */
function isStoredMap(value: unknown): value is StoredMap {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name?: unknown }).name === 'string'
  );
}

// The dedicated store (storage matrix): the extension's own database and its
// own object store for the library — never the host's default DB, never the
// settings/overlay/background stores (the sibling name follows the
// tme-background-assets convention; add the maps store UNDER the same
// database so one machine-local home holds the extension's localforage data).
const STORE_OPTIONS = {
  name: 'travel-map-explorer',
  storeName: 'tme-maps',
} as const;

/**
 * Builds the host MapLibrary over a DEDICATED localforage store. The
 * instance is injected by the caller (Phase 4 wiring passes
 * SillyTavern.libs.localforage); tests inject a hand-rolled fake.
 */
export function createLocalforageMapLibrary(localforageInstance: LocalforageInstance): MapLibrary {
  return new LocalforageMapLibrary(localforageInstance.createInstance(STORE_OPTIONS));
}

/**
 * Extracts the host's localforage for the provider factory (the C-002
 * hostLocalforage pattern, verified against the same source: public/script.js
 * sets globalThis.SillyTavern = { libs, getContext } and public/lib.js
 * exports localforage in the libs object). Wiring-time access — a host
 * without it fails the bootstrap loudly (contained by the entry's try/catch,
 * the C-001 pattern) rather than silently mounting a store that would lose
 * every authored map.
 */
function hostLocalforage(): LocalforageInstance {
  // Local cast, not the global.d.ts augmentation: that declaration is in the
  // app program only, and the unit spec pulls this module into the spec
  // program (tsconfig.spec.json has no root-level d.ts include).
  const libs = (window as unknown as { SillyTavern?: { libs?: { localforage?: LocalforageInstance } } })
    .SillyTavern?.libs;
  if (libs?.localforage === undefined) {
    throw new Error(
      '[TravelMapper] SillyTavern.libs.localforage unavailable — the map library cannot persist',
    );
  }
  return libs.localforage;
}

/**
 * C-003: the HOST provider for the MAP_LIBRARY token — the localforage impl
 * this file builds. Consumed by Phase 4's ST bootstrap (the real app mount
 * under SillyTavern; the C-001 skeleton entry mounts without it): add it to
 * createApplication()'s providers there to override the token's harness
 * factory. The libs-access point is SillyTavern.libs.localforage (see
 * hostLocalforage); localforage itself is never bundled.
 */
export const MAP_LIBRARY_HOST_PROVIDER: Provider = {
  provide: MAP_LIBRARY,
  useFactory: () => createLocalforageMapLibrary(hostLocalforage()),
};

/**
 * The localforage-backed MapLibrary (D40's picker store). The KEY is the map
 * id, so `save` is a bare setItem (an UPSERT — a re-save replaces) and
 * `delete` a bare removeItem (source-verified against the bundled 1.10.x
 * drivers: IndexedDB `delete()`, localStorage `removeItem` and the SQL
 * `DELETE FROM` all resolve for a missing key — the no-op-on-miss contract
 * needs no existence pre-scan). Data in / data out independence is the
 * serialization round-trip (the aliasing stance above).
 */
class LocalforageMapLibrary implements MapLibrary {
  constructor(private readonly store: LocalforageStore) {}

  async list(): Promise<readonly LibraryEntry[]> {
    const rows: LibraryEntry[] = [];
    await this.store.iterate<StoredMap, void>((value, key) => {
      if (isStoredMap(value)) {
        // id = the store key (what get/delete honor); name = the authored
        // display word (C23 — the light row's payload); fork provenance as
        // the LibraryEntry's `string | null` (D41/C25 — absent ⇒ null).
        rows.push({ id: key, name: value.name, forkedFrom: value.forkedFrom ?? null });
      }
    });
    return rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<WorldMapData | null> {
    return await this.store.getItem<StoredMap>(id); // null on miss — the caller's degrade path
  }

  async save(map: WorldMapData): Promise<void> {
    await this.store.setItem(map.id, map); // UPSERT by map.id (C5 ids are the store keys)
  }

  async delete(id: string): Promise<void> {
    await this.store.removeItem(id); // a missing key resolves — the no-op contract
  }
}
