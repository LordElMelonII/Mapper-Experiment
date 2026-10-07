// PKG C-003 unit tests (D40, C32; the C-002 spec pattern) — the
// localforage-backed MapLibrary against a hand-rolled in-memory fake of the
// verified localforage slice (the C-002 module's shape — never memory).
// Bare Node. The fake MIRRORS the real store's serialization
// (structuredClone on the way in AND out — real localforage deserializes on
// every read, so hand-backs are structurally fresh; a by-reference fake
// would leave the aliasing contract untestable).
import { describe, expect, it } from 'vitest';
import {
  createLocalforageMapLibrary,
  type LocalforageInstance,
  type LocalforageStore,
} from '../../src/st/map-library-store';
import type { LibraryEntry } from '../../src/app/graph/map-library';
import type { WorldMapData } from '../../src/core/api';

// --- the fake localforage ------------------------------------------------------

class FakeStore implements LocalforageStore {
  /** Per-method failure injection (C32 — the rejection-propagation cells). */
  getItemFailure: Error | null = null;
  setItemFailure: Error | null = null;
  removeItemFailure: Error | null = null;
  iterateFailure: Error | null = null;

  constructor(readonly map: Map<string, unknown>) {}

  async getItem<T>(key: string): Promise<T | null> {
    if (this.getItemFailure !== null) throw this.getItemFailure;
    const value = this.map.get(key);
    return (value === undefined ? null : structuredClone(value)) as T;
  }

  async setItem<T>(key: string, value: T): Promise<T> {
    if (this.setItemFailure !== null) throw this.setItemFailure;
    this.map.set(key, structuredClone(value)); // serialize ON WRITE — the real driver's stance
    return value;
  }

  async removeItem(key: string): Promise<void> {
    if (this.removeItemFailure !== null) throw this.removeItemFailure;
    this.map.delete(key); // a missing key deletes nothing — the real drivers all resolve
  }

  async iterate<T, U>(callback: (value: T, key: string, iterationNumber: number) => U): Promise<U> {
    if (this.iterateFailure !== null) throw this.iterateFailure;
    let iterationNumber = 0;
    for (const [key, value] of this.map) {
      iterationNumber++;
      const out = callback(structuredClone(value) as T, key, iterationNumber); // fresh on every read
      if (out !== undefined) return out; // non-undefined halts and is the resolution (the real contract)
    }
    return undefined as U; // a full walk resolves undefined — source-verified in dist/localforage.js
  }
}

class FakeLocalforage implements LocalforageInstance {
  /** Every createInstance() config this instance was asked for. */
  readonly configs: Array<{ name?: string; storeName?: string }> = [];
  /** Every store this instance handed out (failure injection reaches them here). */
  readonly created: FakeStore[] = [];
  /** Data keyed by `<name>/<storeName>` — how the tests assert store isolation. */
  readonly maps = new Map<string, Map<string, unknown>>();

  createInstance(options: { name?: string; storeName?: string }): LocalforageStore {
    this.configs.push({ ...options });
    const key = `${options.name ?? 'localforage'}/${options.storeName ?? 'keyvaluepairs'}`;
    const map = this.maps.get(key) ?? new Map<string, unknown>();
    this.maps.set(key, map);
    const store = new FakeStore(map);
    this.created.push(store);
    return store;
  }
}

// --- the fixture ---------------------------------------------------------------

/** A minimal valid WorldMapData. Test-local ids (C5 governs runtime ids, not fixtures). */
const makeMap = (id: string, name: string, forkedFrom?: string): WorldMapData => ({
  schemaVersion: 2,
  id,
  name,
  layers: [{ id: `${id}-layer`, name: 'World' }],
  scale: { unitPerPx: 1, unitLabel: 'units', unitKind: 'distance' },
  nodes: [],
  edges: [],
  ...(forkedFrom === undefined ? {} : { forkedFrom }),
});

const storeKey = (fake: FakeLocalforage): Map<string, unknown> =>
  fake.maps.get('travel-map-explorer/tme-maps')!;

// --- the library ---------------------------------------------------------------

describe('createLocalforageMapLibrary (PKG C-003 — D40, the C-002 pattern)', () => {
  it('configures a DEDICATED localforage store — never the host default, keyvaluepairs, or the background store (storage matrix)', () => {
    const fake = new FakeLocalforage();
    createLocalforageMapLibrary(fake);
    expect(fake.configs).toEqual([{ name: 'travel-map-explorer', storeName: 'tme-maps' }]);
  });

  it('save→get round-trips the map; a re-save of the same id REPLACES — the upsert contract, never a second row', async () => {
    const fake = new FakeLocalforage();
    const library = createLocalforageMapLibrary(fake);
    const first = makeMap('map-1', 'Alpha Crossing');
    await library.save(first);
    await expect(library.get('map-1')).resolves.toEqual(first);

    const second = { ...first, name: 'Alpha Renamed' };
    await library.save(second); // the save dock's store write — same id
    await expect(library.get('map-1')).resolves.toEqual(second);

    const rows = await library.list();
    expect(rows).toHaveLength(1); // UPSERT — one id, one row
    expect(rows[0]).toEqual({ id: 'map-1', name: 'Alpha Renamed', forkedFrom: null });
    expect(storeKey(fake).size).toBe(1);
  });

  it('list() carries every stored map, NAME-sorted with an id tiebreak — the documented host order contract (deterministic regardless of driver order)', async () => {
    // The fake's Map iterates in insertion order — a name-ordered assertion
    // there proves the impl sorts, not the driver.
    const library = createLocalforageMapLibrary(new FakeLocalforage());
    await library.save(makeMap('map-3', 'Zeta Keep'));
    await library.save(makeMap('map-1', 'Midgate'));
    await library.save(makeMap('map-2', 'Alpha Crossing'));
    expect(await library.list()).toEqual([
      { id: 'map-2', name: 'Alpha Crossing', forkedFrom: null },
      { id: 'map-1', name: 'Midgate', forkedFrom: null },
      { id: 'map-3', name: 'Zeta Keep', forkedFrom: null },
    ]);
  });

  it('two maps sharing an authored name order by the id tiebreak (the documented order contract)', async () => {
    const library = createLocalforageMapLibrary(new FakeLocalforage());
    await library.save(makeMap('map-b', 'Same Name'));
    await library.save(makeMap('map-a', 'Same Name'));
    const rows = await library.list();
    expect(rows.map((row) => row.id)).toEqual(['map-a', 'map-b']); // id order, not insertion order
  });

  it('rows are LIGHT — exactly id/name/forkedFrom (LibraryEntry) — and fork provenance round-trips (D41/C25)', async () => {
    const library = createLocalforageMapLibrary(new FakeLocalforage());
    await library.save(makeMap('map-parent', 'Steppe Border'));
    await library.save(makeMap('map-fork', 'Steppe Fork', 'map-parent')); // D41: a fork of the parent
    const rows: readonly LibraryEntry[] = await library.list();
    expect(rows).toEqual([
      { id: 'map-parent', name: 'Steppe Border', forkedFrom: null }, // originals carry null
      { id: 'map-fork', name: 'Steppe Fork', forkedFrom: 'map-parent' },
    ]);
    await expect(library.get('map-fork')).resolves.toEqual(makeMap('map-fork', 'Steppe Fork', 'map-parent'));
  });

  it('delete removes a stored map and is a no-op on an unknown id (C32 spirit — get null, empty list, empty store)', async () => {
    const fake = new FakeLocalforage();
    const library = createLocalforageMapLibrary(fake);
    await expect(library.delete('map-never')).resolves.toBeUndefined(); // unknown — no-op, never rejects
    expect(await library.list()).toEqual([]);

    await library.save(makeMap('map-1', 'Alpha Crossing'));
    await library.delete('map-1'); // known — removes
    await expect(library.get('map-1')).resolves.toBeNull();
    expect(await library.list()).toEqual([]);
    expect(storeKey(fake).size).toBe(0);
  });

  it('data in / data out (R4, C24): the store keeps its own copy and hands back fresh ones — the fake mirrors the real serialization', async () => {
    const library = createLocalforageMapLibrary(new FakeLocalforage());
    const map = makeMap('map-1', 'Alpha Crossing');
    await library.save(map);
    map.name = 'Caller-side Rename'; // a live map's in-place edits never leak INTO the store
    await expect(library.get('map-1')).resolves.toEqual(makeMap('map-1', 'Alpha Crossing'));

    const stored = await library.get('map-1');
    stored!.name = 'Hand Rename'; // each read is an independent copy (the displayMap doctrine)
    await expect(library.get('map-1')).resolves.toEqual(makeMap('map-1', 'Alpha Crossing'));
  });

  it('every store method rejects on store failure — never throws synchronously (the seam contract note, C32)', async () => {
    const fake = new FakeLocalforage();
    const library = createLocalforageMapLibrary(fake);
    const dedicated = fake.created[0]!;
    const boom = new Error('quota exceeded');

    let savePromise: Promise<void> | undefined;
    dedicated.setItemFailure = boom;
    expect(() => {
      savePromise = library.save(makeMap('map-1', 'Alpha Crossing'));
    }).not.toThrow(); // the C32 discipline: rejection, never a synchronous throw
    await expect(savePromise).rejects.toThrow('quota exceeded');
    dedicated.setItemFailure = null;

    let listPromise: Promise<readonly LibraryEntry[]> | undefined;
    dedicated.iterateFailure = boom;
    expect(() => {
      listPromise = library.list();
    }).not.toThrow();
    await expect(listPromise).rejects.toThrow('quota exceeded');
    dedicated.iterateFailure = null;

    let getPromise: Promise<WorldMapData | null> | undefined;
    dedicated.getItemFailure = boom;
    expect(() => {
      getPromise = library.get('map-1');
    }).not.toThrow();
    await expect(getPromise).rejects.toThrow('quota exceeded');
    dedicated.getItemFailure = null;

    let deletePromise: Promise<void> | undefined;
    dedicated.removeItemFailure = boom;
    expect(() => {
      deletePromise = library.delete('map-1');
    }).not.toThrow();
    await expect(deletePromise).rejects.toThrow('quota exceeded');
  });

  it('list() skips a row that is not a stored map (a dedicated store still tolerates junk — C32 spirit, the isStoredMap guard)', async () => {
    const fake = new FakeLocalforage();
    const library = createLocalforageMapLibrary(fake);
    await library.save(makeMap('map-1', 'Alpha Crossing'));
    storeKey(fake).set('junk', { nope: true });
    expect(await library.list()).toEqual([{ id: 'map-1', name: 'Alpha Crossing', forkedFrom: null }]);
  });
});
