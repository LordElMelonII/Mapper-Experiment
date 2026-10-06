// src/st/background-assets.ts — PKG C-002 (§5 Phase 3 M3 — D84/D29).
//
// The HOST half of the background-asset store: a localforage-backed
// BackgroundStore for the seam B-130 shipped in
// src/app/graph/background-store.ts — that file's interface contract note is
// this file's spec. D29 stands: uploads are machine-local; the map data
// carries only the assetId key and the bytes live in the host's localforage
// (storage matrix: background assets NEVER share a store with settings or
// the chat overlay).
//
// localforage is never imported: the instance is INJECTED (at Phase 4 wiring
// it is SillyTavern.libs.localforage — see BACKGROUND_STORE_HOST_PROVIDER),
// so this module stays host-free, typechecks in bare Node, and unit-tests
// against a hand-rolled fake (the charter's SillyTavern.libs rule; R5 spirit
// at the boundary).
//
// The contract (the seam's note): the render path binds the STORED assetId
// synchronously as the `<img>` src, so save() creates an object URL from the
// Blob at save time and returns it AS the assetId, persisting the entry
// (Blob + file name + that URL) under an opaque crypto.randomUUID() key in a
// dedicated localforage store (C5's id conventions are for map elements, not
// host assets). Object URLs never survive navigation, so resolve() is the
// async bridge: it hands back a LIVE object URL for an assetId, re-creating
// one from the stored Blob when the saved URL was released (any later
// session). delete() revokes the live URL and drops the entry; unknown ids
// are no-ops. Every store method is async and REJECTS on store failure —
// never throws synchronously — leaving the C32 degrade to the caller.
import type { Provider } from '@angular/core';
import { BACKGROUND_STORE, type BackgroundStore } from '../app/graph/background-store';

/**
 * The slice of localforage's instance API this store uses, verified against
 * the typings bundled with local SillyTavern 1.19.0
 * (node_modules/localforage/typings/localforage.d.ts — ST pins ^1.10.0).
 * `iterate` halts early and resolves with the callback's value when it
 * returns non-undefined (a full walk without a halt resolves undefined,
 * which the real typings fold into `Promise<U>`).
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

/** What one upload persists under its randomUUID key. */
interface StoredAsset {
  blob: Blob;
  /** The C23 display name (File.name; '' for a nameless Blob). */
  name: string;
  /** The object URL created at save time — IS the assetId the map data carries. */
  url: string;
}

function isStoredAsset(value: unknown): value is StoredAsset {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredAsset>;
  return (
    candidate.blob instanceof Blob &&
    typeof candidate.url === 'string' &&
    typeof candidate.name === 'string'
  );
}

// The dedicated store (storage matrix): the extension's own database and its
// own object store for uploaded assets — never the host's default DB, never
// the settings/overlay stores.
const STORE_OPTIONS = {
  name: 'travel-map-explorer',
  storeName: 'tme-background-assets',
} as const;

/**
 * Builds the host BackgroundStore over a DEDICATED localforage store. The
 * instance is injected by the caller (Phase 4 wiring passes
 * SillyTavern.libs.localforage); tests inject a hand-rolled fake.
 */
export function createLocalforageBackgroundStore(
  localforageInstance: LocalforageInstance,
): BackgroundStore {
  return new LocalforageBackgroundStore(localforageInstance.createInstance(STORE_OPTIONS));
}

/**
 * Extracts the host's localforage for the provider factory. Verified against
 * the local SillyTavern 1.19.0 source: public/script.js:293 sets
 * `globalThis.SillyTavern = { libs, getContext }` and public/lib.js exports
 * `localforage` in the libs object (lib.js:89/117). Wiring-time access — a
 * host without it fails the bootstrap loudly (contained by the entry's
 * try/catch, the C-001 pattern) rather than silently mounting a store that
 * would lose every upload.
 */
function hostLocalforage(): LocalforageInstance {
  // Local cast, not the global.d.ts augmentation: that declaration is in the
  // app program only, and the unit spec pulls this module into the spec
  // program (tsconfig.spec.json has no root-level d.ts include).
  const libs = (window as unknown as { SillyTavern?: { libs?: { localforage?: LocalforageInstance } } })
    .SillyTavern?.libs;
  if (libs?.localforage === undefined) {
    throw new Error(
      '[TravelMapper] SillyTavern.libs.localforage unavailable — uploaded backgrounds cannot persist',
    );
  }
  return libs.localforage;
}

/**
 * C-002: the HOST provider for the BACKGROUND_STORE token — the localforage
 * impl this file builds. Consumed by Phase 4's ST bootstrap (the real app
 * mount under SillyTavern; the C-001 skeleton entry mounts without it): add
 * it to createApplication()'s providers there to override the token's
 * harness factory. The libs-access point is SillyTavern.libs.localforage
 * (verified — see hostLocalforage); localforage itself is never bundled.
 */
export const BACKGROUND_STORE_HOST_PROVIDER: Provider = {
  provide: BACKGROUND_STORE,
  useFactory: () => createLocalforageBackgroundStore(hostLocalforage()),
};

/**
 * The localforage-backed BackgroundStore (D29: machine-local uploads).
 * `live` maps each assetId to its in-session entry — the LIVE object URL the
 * render path can bind — and doubles as the nameOf() cache. Entries persist
 * under randomUUID keys with the save-time URL inside, so a later session
 * (whose object URLs are all dead) finds an asset by scanning for that
 * persisted URL and re-creates a live one from the stored Blob.
 */
class LocalforageBackgroundStore implements BackgroundStore {
  private readonly live = new Map<string, { lfKey: string; url: string; name: string }>();

  constructor(private readonly store: LocalforageStore) {}

  async save(data: Blob): Promise<string> {
    const lfKey = crypto.randomUUID();
    const url = URL.createObjectURL(data); // loadable NOW — the contract-note key
    const name = data instanceof File ? data.name : '';
    try {
      await this.store.setItem<StoredAsset>(lfKey, { blob: data, name, url });
    } catch (err) {
      URL.revokeObjectURL(url); // a failed persist must not leak the URL (C32 hygiene)
      throw err;
    }
    this.live.set(url, { lfKey, url, name });
    return url;
  }

  async resolve(assetId: string): Promise<string | null> {
    const cached = this.live.get(assetId);
    if (cached !== undefined) return cached.url; // same session — the saved URL is still live
    const found = await this.findByAssetId(assetId); // later session — the saved URL is dead
    if (found === null) return null;
    const url = URL.createObjectURL(found.asset.blob); // re-created from the stored Blob
    this.live.set(assetId, { lfKey: found.lfKey, url, name: found.asset.name });
    return url;
  }

  async delete(assetId: string): Promise<void> {
    const cached = this.live.get(assetId);
    const lfKey = cached?.lfKey ?? (await this.findByAssetId(assetId))?.lfKey;
    if (lfKey === undefined) return; // unknown assetId — a no-op (C32 spirit, mirrors the harness)
    await this.store.removeItem(lfKey);
    if (cached !== undefined) URL.revokeObjectURL(cached.url);
    this.live.delete(assetId);
  }

  /**
   * nameOf serves hydrated entries only (this session's saves plus resolved
   * assets) — the sync interface cannot reach into localforage. Unknown ⇒ null.
   */
  nameOf(assetId: string): string | null {
    return this.live.get(assetId)?.name ?? null;
  }

  private async findByAssetId(
    assetId: string,
  ): Promise<{ lfKey: string; asset: StoredAsset } | null> {
    const hit = await this.store.iterate<unknown, { lfKey: string; asset: StoredAsset } | undefined>(
      (value, key) => (isStoredAsset(value) && value.url === assetId ? { lfKey: key, asset: value } : undefined),
    );
    return hit ?? null;
  }
}
