// src/app/graph/background-store.ts — PKG B-130 (§5 Phase 3 M3 — D84/D29).
//
// The background-asset SEAM the manager sheet's Upload arm goes through:
// save (Blob in, assetId key out), resolve (assetId in, loadable src out),
// delete. D29 stands: uploads are machine-local, so the host implementation
// is session/machine-local storage (localforage) — C-002 owns that host
// impl (the st-integration charter's persistence surface); this file ships
// ONLY the InjectionToken + the dev-harness in-memory impl. NOTHING here
// pretends to be host persistence: the harness store is session-local by
// design (the harness has no host storage), and no localforage import
// appears anywhere in this packet.
//
// Interface contract note for the C-002 impl: the render path binds the
// STORED assetId string synchronously as the `<img>` src
// (graph.service activeBackground → the tme-bg img — the D84 "two sources,
// one rendering path" arm), so save() must hand back a key the <img> can
// load directly. The harness impl satisfies that by making the created
// object URL the key; a localforage impl whose keys are opaque must return
// object URLs from save() (or add its async resolve() bridge in its own
// packet — resolve() exists exactly for such an impl).
import { InjectionToken } from '@angular/core';

/**
 * B-130 (D84/D29): the upload store — where an uploaded background image
 * lives and how the app gets a loadable src back out of it. `save` keeps the
 * file's name in the entry (the sheet's state line renders "Uploaded image"
 * plus that name — C23 words); `delete` releases the entry (host impls:
 * the stored blob; the harness impl: the object URL too).
 */
export interface BackgroundStore {
  /** Store one uploaded image; resolves to the assetId key the map data carries. */
  save(data: Blob): Promise<string>;
  /** The src the `<img>` can load for an assetId — or null when unknown. */
  resolve(assetId: string): Promise<string | null>;
  /** Release a stored upload (no-op when unknown — degrade, never throw, C32). */
  delete(assetId: string): Promise<void>;
  /** The stored file's name (C23 display words for the sheet's state line), or null. */
  nameOf(assetId: string): string | null;
}

/**
 * B-130: the store token. The factory below IS the harness impl — C-002
 * swaps this factory for the localforage-backed host implementation (the
 * st-integration charter's persistence surface); nothing else in the app
 * changes.
 */
export const BACKGROUND_STORE = new InjectionToken<BackgroundStore>('BACKGROUND_STORE', {
  providedIn: 'root',
  factory: () => new InMemoryBackgroundStore(), // HARNESS IMPL — C-002 owns the host impl
});

/**
 * The dev-harness BackgroundStore: an in-memory Map whose KEY IS the created
 * object URL — session-local by design (uploads are machine-local, D29; the
 * harness has no host storage). The object-URL-as-key discipline keeps the
 * synchronous render path honest (see the interface contract note above) and
 * makes resolve() the trivial readback. `File.name` rides along so the sheet
 * can render "Uploaded image (<name>)" (C23).
 */
class InMemoryBackgroundStore implements BackgroundStore {
  private readonly entries = new Map<string, { readonly src: string; readonly name: string }>();

  async save(data: Blob): Promise<string> {
    const src = URL.createObjectURL(data); // platform built-in — no dependency (D29)
    const name = data instanceof File ? data.name : '';
    this.entries.set(src, { src, name });
    return src; // the key IS the loadable src (the contract note above)
  }

  async resolve(assetId: string): Promise<string | null> {
    return this.entries.get(assetId)?.src ?? null;
  }

  async delete(assetId: string): Promise<void> {
    const entry = this.entries.get(assetId);
    if (entry === undefined) return; // unknown — a no-op (C32 spirit)
    this.entries.delete(assetId);
    URL.revokeObjectURL(entry.src);
  }

  nameOf(assetId: string): string | null {
    return this.entries.get(assetId)?.name ?? null;
  }
}
