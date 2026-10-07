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
// R2: the component mutates nothing itself — every map command goes through
// the library STORE seam (MAP_LIBRARY, the BACKGROUND_STORE precedent — the
// layer-manager injects its store directly) and every LOADED-state command
// through the service wrappers (openMapFromLibrary / unloadMap); the
// facade is never touched here. R4: the library is a store (data in / data
// out), never a second graph truth — the facade owns the loaded map.
// R3: events in → signals out → this template; the panel's gestures are
// discrete taps (D2). C23: plain words everywhere a user reads — names are
// authored strings, ids never render (rows are matched by id, spoken by
// name). C5: create/duplicate pass the library's stored-id set as
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
import { createWorldMap, duplicateMapData } from '../../core/model/create';
import type { WorldMapData } from '../../core/api';
import { MAP_LIBRARY } from '../graph/map-library';
import type { LibraryEntry } from '../graph/map-library';
import { GraphService } from '../graph/graph.service';

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
