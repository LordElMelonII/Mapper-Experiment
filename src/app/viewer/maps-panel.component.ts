// src/app/viewer/maps-panel.component.ts — PKG B-137 (§5 Phase 3 M4 / §5 M4
// line, D40): the Maps manager PANEL — the library as a real surface: one
// row per stored map (Open / Duplicate / Delete), the D79 New-map flow
// (name → createWorldMap → library.save → open), the card-pointer
// SUGGESTION mark (D40 — suggested, never auto-applied), and the informed
// delete confirm (the map's NAME, no counts — R1: the UI never counts facts
// it doesn't have). Summoned from the layers nav's Maps affordance next to
// Manage (the D82 Manage pattern — present in BOTH worlds); the panel is
// the layer-manager's structural twin: a floating panel over the
// full-width stage on wide, a bottom sheet in the .tme-sheets stack on
// narrow — rendered ONLY while open (the B-117 host-hides-closed form);
// Escape closes it; a fresh loadMap closes it (the service's reset);
// open/close moves no viewport (D91).
//
// PKG B-138 (§5 M4 line): the import/export family joins the panel — the
// per-row Export (the stored map's JSON via an object-URL anchor, revoked
// after — the background-store URL discipline), the JSON file import
// (JSON.parse → the migrate+validate engine C31 → fresh engine id C5 →
// library.save; NO auto-load, D40's explicit pick) and the MDS paste
// importer (the F05/FX3 engine behind a labelled textarea; cleared only on
// success — the author edits their paste after a refusal). EVERY import
// lands under a FRESH engine-assigned id (`generateMapId(knownIds())` —
// C5, the re-id ruling): a foreign file's id never overwrites a stored
// map silently, and a second paste of the same table becomes a second map.
// Engines are CALLED, never re-implemented: `migrateWorldMap` (the pure
// engine behind the facade's `migrateData` command — facade.ts:633 is a
// one-line delegation) and `importLookupTable` imported directly, the
// B-137 pure-core-import precedent (createWorldMap/duplicateMapData) — the
// panel's R2 discipline keeps the facade instance out of this component
// and these are pure transforms of detached data, no loaded state.
//
// R2: the component mutates nothing itself — every map command goes through
// the library STORE seam (MAP_LIBRARY, the BACKGROUND_STORE precedent — the
// layer-manager injects its store directly) and every LOADED-state command
// through the service wrappers (openMapFromLibrary / unloadMap); the
// facade is never touched here. R4: the library is a store (data in / data
// out), never a second graph truth — the facade owns the loaded map.
// R3: events in → signals out → this template; the panel's gestures are
// discrete taps (D2). C23: plain words everywhere a user reads — names are
// authored strings, ids never render (rows are matched by id, spoken by
// name). C5: create/duplicate/import pass the library's stored-id set as
// `exclude` — host knowledge the engine asks for; the UI never proposes
// ids. F52/D53: every control >= 44px, touch-alone, no hover affordance;
// the B-114 rail is the narrow form's collapse affordance (wide hides it).
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  computed,
  signal,
} from '@angular/core';
import { createWorldMap, duplicateMapData, generateMapId } from '../../core/model/create';
import { migrateWorldMap } from '../../core/model/migrate';
import { importLookupTable } from '../../core/import/lookup';
import { MapValidationError } from '../../core/model/validate';
import type { WorldMapData } from '../../core/api';
import { MAP_LIBRARY } from '../graph/map-library';
import type { LibraryEntry } from '../graph/map-library';
import { GraphService } from '../graph/graph.service';

/**
 * B-138: the export filename — the map's NAME made filesystem-safe (a
 * presentation string, not engine data — R1): runs of Windows-reserved
 * separators and control characters become '-', an emptied name falls back
 * to 'map', and '.json' is appended.
 */
function exportFilename(name: string): string {
  const safe = name.replace(/[\p{Cc}\\/:*?"<>|]+/gu, '-').trim(); // \p{Cc} = the control characters
  return `${safe.length > 0 ? safe : 'map'}.json`;
}

@Component({
  selector: 'tme-maps-panel',
  templateUrl: './maps-panel.component.html',
  styleUrl: './maps-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // The B-117 host-hides-closed precedent: display:none while closed, so
    // the panel never occupies a stack slot (D91: it never occupies LAYOUT
    // at all — the surface overlays the stage on both layouts).
    '[class.tme-open]': 'open()',
    // B-137: the panel has NO remembered position and NO maximize — the
    // picker anchors bottom-right on wide (the layer-manager's default
    // anchor form of the D91 float family; the packet asks for the regime,
    // not the drag machinery — kept lean).
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class MapsPanelComponent {
  protected readonly graph = inject(GraphService);

  /**
   * B-137: the library store — the panel's data seam (list/get/save/delete;
   * async, rejects on failure — the C32 degrade renders words here, never
   * an uncaught throw). The harness impl is session-memory; the host's
   * localforage impl arrives with the C packet.
   */
  private readonly library = inject(MAP_LIBRARY);

  /**
   * The panel's open state — the service's signal (loadMap closes it; the
   * mapless boot opens it). The host renders only while open (both worlds).
   */
  protected readonly open = computed(() => this.graph.mapsPanelOpen());

  /**
   * The library rows — refreshed on every open (the constructor effect) and
   * after every store command. Signal-held (R3); list order is the store's
   * insertion order (a render input, not truth).
   */
  protected readonly rows = signal<readonly LibraryEntry[]>([]);

  /**
   * The last store refusal in plain words (C32 degrade — list/save/delete
   * failures are the store's rejections; nothing throws through the panel).
   * Cleared by the next successful command and the close.
   */
  protected readonly error = signal<string | null>(null);

  /** B-114 (the layer-manager precedent): the narrow form's collapse state — component-local view chrome. */
  protected readonly collapsed = signal(false);

  // --- The New-map row (D79) -------------------------------------------------

  /** The create input's text (a controlled input — R3). */
  private readonly createValue = signal('');

  /** The empty-input Create's gate — C30 honesty (the canCreate pattern). */
  protected readonly canCreate = computed(() => this.createValue().trim().length > 0);

  // --- The MDS paste importer (B-138, F05/FX3) --------------------------------

  /** The paste textarea's text (a controlled input — R3). */
  private readonly pasteValue = signal('');

  /** The empty-paste Import's gate — the canCreate pattern (C30 honesty). */
  protected readonly canImportPaste = computed(() => this.pasteValue().trim().length > 0);

  // --- The delete-confirm state ------------------------------------------------

  /** The map id whose inline confirm block is open, or null. */
  private readonly confirmingId = signal<string | null>(null);

  constructor() {
    // Refresh the rows whenever the panel opens (the mapless boot's
    // auto-open included) — one discrete trigger per open (D2).
    effect(() => {
      if (this.open()) void this.refresh();
    });
  }

  /** The C5 exclusion set — the library's stored ids (host knowledge the engine asks for). */
  private knownIds(): ReadonlySet<string> {
    return new Set(this.rows().map((row) => row.id));
  }

  /**
   * Re-read the library. A rejection degrades to the words channel (C32) —
   * the panel stays usable, the rows stay as last read.
   */
  protected async refresh(): Promise<void> {
    try {
      this.rows.set(await this.library.list());
      this.error.set(null);
    } catch {
      this.error.set('The map library could not be read.');
    }
  }

  /**
   * The store-save helper: one UPSERT + a list refresh; a rejection renders
   * words and reports failure so the caller skips its follow-ups (reject-
   * before-proceed — the facade's own discipline).
   */
  private async storeSave(map: WorldMapData): Promise<boolean> {
    try {
      await this.library.save(map);
    } catch {
      this.error.set('The map library refused the save.');
      return false;
    }
    await this.refresh();
    return true;
  }

  // --- Template event handlers (R3: DOM read → command, never DOM write) -------

  protected onCreateInput(event: Event): void {
    this.createValue.set((event.target as HTMLInputElement).value);
  }

  /**
   * B-137 (D79): CREATE — `createWorldMap(name, exclude)` (the engine
   * generates the id, C5; the D79 defaults verbatim: 1 px = 1 unit,
   * 'units', distance-kind, one layer named after the map) → library.save →
   * open it (the Open path). The input clears on success (the add()
   * precedent); the D79 hint arms BEFORE the open (the hint's computed
   * reads the loaded map id). A refused save keeps the input (the author
   * retries) and nothing opens.
   */
  protected async create(): Promise<void> {
    const name = this.createValue().trim();
    if (name.length === 0) return; // the disabled Create's guard (C30 honesty)
    const map = createWorldMap(name, this.knownIds());
    if (!(await this.storeSave(map))) return;
    this.createValue.set('');
    this.error.set(null);
    this.graph.markFreshlyCreatedMap(map.id); // D79: the one-time hint arms for THIS map
    this.graph.openMapFromLibrary(map); // the Open path — loadMap closes this panel
  }

  // --- The import/export family (B-138) ----------------------------------------

  /**
   * One refusal's plain words (C32/C23): a MapValidationError's COLLECTED
   * issues render field-precise — one `path: message` line per issue, the
   * engine's own authored words verbatim (ids never render); anything else
   * degrades to its Error message.
   */
  private words(err: unknown): string {
    if (err instanceof MapValidationError) {
      return err.issues
        .map((issue) => (issue.path.length > 0 ? `${issue.path}: ${issue.message}` : issue.message))
        .join('\n');
    }
    return err instanceof Error ? err.message : String(err);
  }

  /**
   * B-138: the per-row EXPORT — an asynchronous `library.get` of the stored
   * map, serialized as pretty JSON, downloaded through an object-URL anchor
   * that is revoked immediately after (the background-store URL discipline —
   * nothing leaks). A store failure degrades to words (C32); the filename is
   * the map's NAME, sanitized (a presentation string, not engine data — R1).
   */
  protected async exportMap(id: string): Promise<void> {
    let map: WorldMapData | null;
    try {
      map = await this.library.get(id);
    } catch {
      this.error.set('The map library could not be read.');
      return;
    }
    if (map === null) {
      this.error.set('That map is no longer in the library.');
      void this.refresh();
      return;
    }
    this.error.set(null);
    const url = URL.createObjectURL(new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportFilename(map.name);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url); // revoked after — no URL leak (the background-store discipline)
  }

  protected onPasteInput(event: Event): void {
    this.pasteValue.set((event.target as HTMLTextAreaElement).value);
  }

  /**
   * B-138: the MDS PASTE importer (F05/FX3/D55) — the ENGINE parses, MDS-seeds
   * and validates the paste (`importLookupTable`; a garbage paste is a
   * MapValidationError whose field-precise issues render as words, C30/C32).
   * The imported map lands under a FRESH engine id (C5, the re-id ruling),
   * `library.save` refreshes the list — NO auto-load (D40's explicit pick).
   * The textarea is NOT wiped on failure (the author edits their paste) and
   * cleared on success.
   */
  protected async importPaste(): Promise<void> {
    const text = this.pasteValue();
    if (text.trim().length === 0) return; // the disabled Import's guard (C30 honesty)
    let map: WorldMapData;
    try {
      map = importLookupTable(text);
    } catch (err) {
      this.error.set(this.words(err));
      return; // the paste stays for editing
    }
    const fresh = { ...map, id: generateMapId(this.knownIds()) }; // the re-id ruling (C5)
    if (!(await this.storeSave(fresh))) return;
    this.pasteValue.set(''); // cleared ONLY on success
    this.error.set(null);
  }

  /**
   * B-138: the JSON FILE import — text → JSON.parse (a parse failure is
   * words) → the migrate+validate engine (`migrateWorldMap`, C31: schema
   * 1→2 handled, garbage refused field-precise) → re-id via `generateMapId`
   * (C5, the re-id ruling) → `library.save` → list refresh. NO auto-load
   * (D40's explicit pick — the user opens it). The input's DOM value resets
   * after every attempt so re-selecting the same file re-fires `change`
   * (control hygiene — no app state rides on it, R3 untouched).
   */
  protected async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = ''; // re-select the same file re-fires (control hygiene)
    if (file === null) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      this.error.set('The file could not be read.');
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (err) {
      this.error.set(`The file is not valid JSON — ${err instanceof Error ? err.message : String(err)}.`);
      return;
    }
    let map: WorldMapData;
    try {
      map = migrateWorldMap(data);
    } catch (err) {
      this.error.set(this.words(err));
      return;
    }
    const fresh = { ...map, id: generateMapId(this.knownIds()) }; // the re-id ruling (C5)
    if (!(await this.storeSave(fresh))) return;
    this.error.set(null);
  }

  /**
   * B-137: OPEN one row — the library resolves an independent copy (the
   * store's contract), the service's wrapper loads it through the facade
   * with a fresh pin-null overlay (D40) and resets the viewer; loadMap
   * closes this panel. An unknown id (deleted under us — another surface,
   * a hostile store) degrades to words + a refresh (C32).
   */
  protected async openMap(id: string): Promise<void> {
    const map = await this.library.get(id);
    if (map === null) {
      this.error.set('That map is no longer in the library.');
      void this.refresh();
      return;
    }
    this.error.set(null);
    this.graph.openMapFromLibrary(map);
  }

  /**
   * B-137: DUPLICATE one row — `duplicateMapData(source, exclude)` (a deep
   * copy, fresh engine id, element ids preserved, forkedFrom stripped —
   * C25/D41), the stored name presented with a " (copy)" suffix (the
   * SUFFIX IS the stored name's tail — C23-safe words), library.save, the
   * list refreshes. Nothing loads: the user opens the copy explicitly.
   */
  protected async duplicate(id: string): Promise<void> {
    const source = await this.library.get(id);
    if (source === null) {
      this.error.set('That map is no longer in the library.');
      void this.refresh();
      return;
    }
    const copy = duplicateMapData(source, this.knownIds());
    const named = { ...copy, name: `${copy.name} (copy)` };
    if (!(await this.storeSave(named))) return;
    this.error.set(null);
  }

  /** The confirm block's open/close (the layer-manager's inline confirm pattern). */
  protected startDelete(id: string): void {
    this.error.set(null);
    this.confirmingId.set(id);
  }

  protected cancelDelete(): void {
    this.confirmingId.set(null);
  }

  /**
   * The confirm's sentence — the map's NAME in plain words, no counts (R1:
   * the UI never counts engine facts it doesn't have; the whole map dies,
   * the sentence says exactly that).
   */
  protected deleteLine(entry: LibraryEntry): string {
    return `Delete map '${entry.name}'? This cannot be undone.`;
  }

  /**
   * B-137: DELETE — one confirm commits `library.delete(id)`; the list
   * refreshes; deleting the LOADED map's row takes the viewer mapless
   * (unloadMap — the same no-map state as the mapless boot; this panel
   * STAYS open: the picker is where the user stands, D40). A refused
   * delete keeps the confirm open with the words rendered (nothing died).
   */
  protected async confirmDelete(): Promise<void> {
    const id = this.confirmingId();
    if (id === null) return;
    try {
      await this.library.delete(id);
    } catch {
      this.error.set('The map library refused the delete.');
      return;
    }
    this.confirmingId.set(null);
    this.error.set(null);
    await this.refresh();
    if (this.graph.loadedMapId() === id) this.graph.unloadMap();
  }

  /**
   * D41/C25 provenance line — plain words only (C23): the parent's NAME
   * when the fork's parent row is right here in the list (cheaply
   * available), else the fixed word. A duplicate carries NO fork line (the
   * duplicate is not a fork — duplicateMapData strips it).
   */
  protected provenanceLine(entry: LibraryEntry): string | null {
    if (entry.forkedFrom === null) return null;
    const parent = this.rows().find((row) => row.id === entry.forkedFrom);
    return parent === undefined ? 'Forked' : `Forked from ${parent.name}`;
  }

  /** D40: the card-pointer suggestion mark — display-only, never a loader. */
  protected isSuggested(entry: LibraryEntry): boolean {
    return this.graph.cardSuggestedMapId() === entry.id;
  }

  /** The panel's X / Escape close — a pure signal write (R3) + clean row modes. */
  protected close(): void {
    this.graph.mapsPanelOpen.set(false);
    this.confirmingId.set(null);
    this.error.set(null);
    this.createValue.set('');
    this.pasteValue.set(''); // B-138: the paste importer's state joins the reset
  }

  /** Escape — the no-op-when-closed guard lives here (one keydown, D2). */
  protected onEscape(): void {
    if (this.open()) this.close();
  }

  /** B-114: the rail's collapse/expand — one discrete tap (D2). */
  protected toggleRail(): void {
    this.collapsed.update((expanded) => !expanded);
  }
}
