// PKG C-002 unit tests (D84/D29, C32) — the localforage-backed BackgroundStore
// against a hand-rolled in-memory fake of the verified localforage slice
// (node_modules/localforage/typings/localforage.d.ts shape — never memory).
// Bare Node: Blob/File/crypto are Node 18+/24 globals; URL.createObjectURL is
// patched with a counting fake so no DOM is needed. The fake stores entry
// values by reference (the real IndexedDB structured-clones; identity is
// enough for these tests).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLocalforageBackgroundStore,
  type LocalforageInstance,
  type LocalforageStore,
} from '../../src/st/background-assets';

// --- the fake localforage ------------------------------------------------------

class FakeStore implements LocalforageStore {
  /** When set, the next setItem rejects with it (C32 failure injection). */
  setItemFailure: Error | null = null;

  constructor(readonly map: Map<string, unknown>) {}

  async getItem<T>(key: string): Promise<T | null> {
    return (this.map.get(key) as T) ?? null;
  }

  async setItem<T>(key: string, value: T): Promise<T> {
    if (this.setItemFailure !== null) throw this.setItemFailure;
    this.map.set(key, value);
    return value;
  }

  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }

  async iterate<T, U>(callback: (value: T, key: string, iterationNumber: number) => U): Promise<U> {
    let iterationNumber = 0;
    for (const [key, value] of this.map) {
      iterationNumber++;
      const out = callback(value as T, key, iterationNumber);
      if (out !== undefined) return out; // non-undefined halts and is the resolution (the real contract)
    }
    return undefined as U; // a full walk resolves undefined — the real typings fold it into Promise<U>
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

// --- the URL statics patch (bare Node has no createObjectURL) ------------------

const urlStatics = URL as unknown as {
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
};
const originalCreate = urlStatics.createObjectURL;
const originalRevoke = urlStatics.revokeObjectURL;
let urlCounter = 0;
const revokedUrls: string[] = [];

beforeEach(() => {
  urlCounter = 0;
  revokedUrls.length = 0;
  urlStatics.createObjectURL = () => `blob:fake/${++urlCounter}`;
  urlStatics.revokeObjectURL = (url: string) => {
    revokedUrls.push(url);
  };
});

afterEach(() => {
  urlStatics.createObjectURL = originalCreate;
  urlStatics.revokeObjectURL = originalRevoke;
});

// --- the store -----------------------------------------------------------------

describe('createLocalforageBackgroundStore (PKG C-002 — D84/D29)', () => {
  it('configures a DEDICATED localforage store — never the host default or keyvaluepairs (storage matrix)', () => {
    const fake = new FakeLocalforage();
    createLocalforageBackgroundStore(fake);
    expect(fake.configs).toEqual([{ name: 'travel-map-explorer', storeName: 'tme-background-assets' }]);
  });

  it('save→resolve round-trip: the object URL returned by save IS the assetId and resolves to itself (contract note)', async () => {
    const store = createLocalforageBackgroundStore(new FakeLocalforage());
    const assetId = await store.save(new File(['fuyuki'], 'fuyuki.png'));
    expect(assetId).toMatch(/^blob:fake\//);
    await expect(store.resolve(assetId)).resolves.toBe(assetId);
    expect(store.nameOf(assetId)).toBe('fuyuki.png');
  });

  it('a nameless Blob stores an empty name (harness-mirroring: File.name or "")', async () => {
    const store = createLocalforageBackgroundStore(new FakeLocalforage());
    const assetId = await store.save(new Blob(['bytes']));
    expect(store.nameOf(assetId)).toBe('');
  });

  it('resolve/nameOf on an unknown assetId ⇒ null (C32)', async () => {
    const store = createLocalforageBackgroundStore(new FakeLocalforage());
    await expect(store.resolve('blob:fake/never')).resolves.toBeNull();
    expect(store.nameOf('blob:fake/never')).toBeNull();
  });

  it('delete revokes the live object URL and drops the entry; unknown ids are no-ops (C32 spirit)', async () => {
    const fake = new FakeLocalforage();
    const store = createLocalforageBackgroundStore(fake);
    const assetId = await store.save(new File(['x'], 'gone.png'));
    await expect(store.delete('blob:fake/unknown-id')).resolves.toBeUndefined(); // no-op, must not throw
    await store.delete(assetId);
    expect(revokedUrls).toContain(assetId);
    await expect(store.resolve(assetId)).resolves.toBeNull();
    expect(store.nameOf(assetId)).toBeNull();
    expect(fake.maps.get('travel-map-explorer/tme-background-assets')?.size).toBe(0);
  });

  it('the persistence bridge: a NEW store over the same localforage re-creates a live URL from the stored Blob (post-reload resolve)', async () => {
    const fake = new FakeLocalforage();
    const first = createLocalforageBackgroundStore(fake);
    const assetId = await first.save(new File(['mount'], 'mount.png'));

    const second = createLocalforageBackgroundStore(fake); // a fresh session over the same bytes
    expect(second.nameOf(assetId)).toBeNull(); // cold — not yet hydrated
    const src = await second.resolve(assetId);
    expect(src).not.toBeNull();
    expect(src).not.toBe(assetId); // re-created — object URLs never survive navigation
    expect(second.nameOf(assetId)).toBe('mount.png'); // resolve() hydrates the name

    await second.delete(assetId); // cold delete finds the entry by scan
    expect(revokedUrls).toContain(src);
    expect(fake.maps.get('travel-map-explorer/tme-background-assets')?.size).toBe(0);
  });

  it('a store failure rejects — never throws synchronously — and does not leak the created object URL (C32)', async () => {
    const fake = new FakeLocalforage();
    const store = createLocalforageBackgroundStore(fake);
    const dedicated = fake.created[0]!;
    dedicated.setItemFailure = new Error('quota exceeded');
    let savePromise: Promise<string> | undefined;
    expect(() => {
      savePromise = store.save(new File(['x'], 'doomed.png'));
    }).not.toThrow(); // the C32 discipline: rejection, never a synchronous throw
    await expect(savePromise).rejects.toThrow('quota exceeded');
    expect(revokedUrls).toContain('blob:fake/1'); // the doomed save's URL was revoked, not leaked
    expect(dedicated.map.size).toBe(0);
  });
});
