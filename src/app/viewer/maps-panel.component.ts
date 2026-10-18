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
// PKG B-139 (§5 M4 line — C25/D41/D97): the FORK family joins the rows —
// the per-row Fork (the fork-from-picker sequence as ONE user action: the
// service's `forkFromLibrary` wrapper opens the row then runs the engine's
// `forkMap` — the chat-attached private copy; C25: the copy NEVER lands as
// a library row until the explicit save-back) and, while the LOADED map is
// a fork (`graph.loadedMapIsFork` — the R4 provenance read), the single
// explicit "Save fork back to library" (D41's non-default action — never
// bundled into the save/dock flows; structurally absent on a non-fork
// session: a fork-save control there would be noise). The save-back
// upserts the fork's OWN id/name (the fork id IS its library id v1 — D97)
// through the same service wrapper, then the list refreshes and one plain
// words confirmation renders inline. A re-fork is legal (fork-of-fork,
// A-022): the row actions carry no special case and the provenance line's
// parent lookup (below) reads whatever `forkedFrom` the stored row carries.
// Fork-family refusals render in the panel's error channel (the service's
// `forkError` joined with the store refusals — C32 words, never throws).
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
  ElementRef,
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

// --- B-149 (REPAIRS §R9 item 1) floating-surface geometry (the layer-manager mirrors) ---
// D81's wide-layout breakpoint — the drag surface (the floater head) is the
// wide form only; the narrow sheet stayed in the stack's flow.
const WIDE_LAYOUT_QUERY = '(min-width: 700px)';
/** Header height fallback when the header element is unreadable (C32 spirit). */
const HEADER_FALLBACK_PX = 48;
/** Clear gap below the top chrome band when clamped under it. */
const CHROME_CLEAR_GAP_PX = 8;

/**
 * B-149: one gesture's geometry snapshot — every rect is read ONCE (at the
 * dragstart), so pointermove is pure arithmetic plus one direct style write
 * (D2). The B-133 ClampFrame (the layer-manager's shape).
 */
interface ClampFrame {
  readonly stageLeft: number;
  readonly stageTop: number;
  readonly stageRight: number;
  readonly stageBottom: number;
  readonly chromeLeft: number;
  readonly chromeBottom: number;
  readonly width: number;
  readonly headerHeight: number;
}

/** B-149: a live drag — the frame plus the pointer's start and the last applied position. */
interface DragFrame extends ClampFrame {
  readonly startClientX: number;
  readonly startClientY: number;
  readonly origX: number;
  readonly origY: number;
  last: { x: number; y: number };
}

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
    // B-149 (REPAIRS §R9 item 1): the wide floater joins the D91 float
    // family chrome the other floaters carry — the drag handle's committed
    // transform (the B-133 host classes) and the Maximize/Restore regime
    // cap lift. Narrow ignores every one of them (the media query owns the
    // worlds); the servant sheet keeps its rail flow byte-unchanged.
    '[class.tme-maximized]': 'maximized()',
    '[class.tme-placed]': 'floatTransform() !== null',
    // B-D2 (R29, PROPOSAL-D §2.1): the dock-home chrome class — the panel
    // docks in the shell's rotation; the SCSS :host(.tme-docked ...)
    // compounds stand the float forms down inside the dock. Inert below
    // 1024px.
    '[class.tme-docked]': 'graph.mapsDockedHome()',
    '[style.transform]': 'floatTransform()',
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class MapsPanelComponent {
  protected readonly graph = inject(GraphService);

  /** B-149: the drag writes the host's style directly — the element is needed. */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * B-149 (REPAIRS §R9 item 1): the wide floater's maximize state —
   * component-local VIEW chrome (the layer-manager precedent: floating
   * compact by default; Maximize lifts the height cap to the tall overlay
   * form). Narrow never renders the regime chrome (the media query).
   */
  protected readonly maximized = signal(false);

  /** B-149: the Maximize/Restore toggle (the template's only write path, R3). */
  protected toggleMaximize(): void {
    this.maximized.update((m) => !m);
  }

  /**
   * B-D2 (R29, PROPOSAL-D §2.1): the floater's Dock affordance — the
   * float-side half of the dock↔float handoff (the dock header's Float is
   * the other). One service write (R3); shell-gated in the template.
   */
  protected dock(): void {
    this.graph.setPanelDocked('maps', true);
  }

  /**
   * B-149: the floating panel's rendered transform — `translate(x, y)` of
   * the remembered viewport position (null while anchored: the SCSS anchor
   * applies). The drag's direct style writes land on the same property;
   * the signal commits once on release (the D91 family shape). B-D2: null
   * while the panel is the dock's occupant (a remembered position must not
   * translate the in-flow dock fill; it wins again the moment the panel
   * floats, D10).
   */
  protected readonly floatTransform = computed<string | null>(() => {
    if (this.graph.mapsDockedHome()) return null;
    if (!this.open()) return null;
    const pos = this.graph.mapsPanelPosition();
    return pos === null ? null : `translate(${pos.x}px, ${pos.y}px)`;
  });

  /** B-149: the drag currently in progress, or null — a plain field (D2). */
  private drag: DragFrame | null = null;

  /**
   * B-149: dragstart on the floater header (the layer-manager machinery —
   * the header's buttons keep their taps; one pointer owns the drag; the
   * high-frequency pointermove listener exists only WHILE dragging, D2/D53).
   * WIDE-ONLY by the D81 breakpoint literal (the drag surface is the wide
   * floater's head; the narrow sheet's head stays plain chrome and the
   * stack rules its reach — the property panel's !floating narrow gate's
   * equivalent on a panel whose narrow form has no regime at all).
   */
  protected onDragStart(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button') !== null) return;
    if (!event.isPrimary) return;
    if (!this.open() || this.drag !== null) return;
    if (!window.matchMedia(WIDE_LAYOUT_QUERY).matches) return; // the floater is the wide form only
    const rect = this.host.nativeElement.getBoundingClientRect();
    const frame = this.readFrame(rect.width);
    if (frame === null) return; // no stage to clamp into — no drag (C32 spirit)
    this.drag = {
      ...frame,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origX: rect.left,
      origY: rect.top,
      last: { x: rect.left, y: rect.top },
    };
    event.preventDefault();
    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerup', this.onDragEnd);
    window.addEventListener('pointercancel', this.onDragEnd);
  }

  /** B-149: HIGH-FREQUENCY (D2) — reads frame scalars, writes the style transform only. */
  private readonly onDragMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || !event.isPrimary) return;
    const pos = this.clampFloat(
      drag.origX + (event.clientX - drag.startClientX),
      drag.origY + (event.clientY - drag.startClientY),
      drag,
    );
    drag.last = pos;
    // The owner's R29 review fix (the first-drag vanish): an UNPLACED panel
    // is still on its default CSS anchor (bottom/right), so writing the
    // ABSOLUTE translate would offset from that anchor and fling the panel
    // off-stage until release (when the position commit pins it to the
    // origin). Translate RELATIVE to the drag's start rect until a
    // remembered position owns the placement; absolute after.
    const placed = this.floatTransform() !== null;
    const dx = placed ? pos.x : pos.x - drag.origX;
    const dy = placed ? pos.y : pos.y - drag.origY;
    this.host.nativeElement.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  /** B-149: discrete release — detach first, then commit the position ONCE. */
  private readonly onDragEnd = (): void => {
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragEnd);
    window.removeEventListener('pointercancel', this.onDragEnd);
    const drag = this.drag;
    this.drag = null;
    if (drag === null) return;
    this.graph.mapsPanelPosition.set(drag.last); // one signal write → the binding re-renders it
  };

  /** B-149: snapshot the clamp geometry (the layer-manager readFrame pattern). */
  private readFrame(width: number): ClampFrame | null {
    const stage =
      this.host.nativeElement.closest('.tme-viewer')?.querySelector('.tme-stage') ?? null;
    if (stage === null) return null;
    const stageRect = stage.getBoundingClientRect();
    const header = this.host.nativeElement.querySelector('.tme-maps-head');
    const headerHeight =
      header === null ? HEADER_FALLBACK_PX : header.getBoundingClientRect().height;
    let chromeLeft = Number.POSITIVE_INFINITY;
    let chromeBottom = Number.NEGATIVE_INFINITY;
    for (const selector of ['.tme-chip', '.tme-breadcrumb']) {
      for (const el of stage.querySelectorAll<HTMLElement>(selector)) {
        if (el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        chromeLeft = Math.min(chromeLeft, r.left);
        chromeBottom = Math.max(chromeBottom, r.bottom);
      }
    }
    return {
      stageLeft: stageRect.left,
      stageTop: stageRect.top,
      stageRight: stageRect.right,
      stageBottom: stageRect.bottom,
      chromeLeft,
      chromeBottom,
      width,
      headerHeight,
    };
  }

  /** B-149: the stage-bounds clamp (the B-119 arithmetic, layer-manager twin). */
  private clampFloat(x: number, y: number, frame: ClampFrame): { x: number; y: number } {
    const clampedX = Math.min(Math.max(x, frame.stageLeft), frame.stageRight - frame.width);
    const minY =
      clampedX + frame.width > frame.chromeLeft
        ? frame.chromeBottom + CHROME_CLEAR_GAP_PX
        : frame.stageTop;
    const clampedY = Math.min(Math.max(y, minY), frame.stageBottom - frame.headerHeight);
    return { x: clampedX, y: clampedY };
  }

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
   * order contract (the harness impl: insertion order; the Phase 4 host:
   * name-sorted — C-003; a render input, not truth either way).
   */
  protected readonly rows = signal<readonly LibraryEntry[]>([]);

  /**
   * The last store refusal in plain words (C32 degrade — list/save/delete
   * failures are the store's rejections; nothing throws through the panel).
   * Cleared by the next successful command and the close.
   */
  protected readonly error = signal<string | null>(null);

  /**
   * B-139: the merged refusal words the error block renders — the panel's
   * STORE refusals joined with the service's fork-family channel (`forkError`:
   * facade + save-back-store rejections, the saveError pattern). One visible
   * block for one family of words; the first non-null wins (a store refusal
   * and a fork refusal can't be simultaneous).
   */
  protected readonly refusal = computed(() => this.error() ?? this.graph.forkError());

  /**
   * B-139: the save-back's inline success confirmation — plain words
   * ("Saved to the library"), cleared by the next fork-family action and
   * the close (the error-signal discipline mirrored for the happy path).
   */
  protected readonly savedBackNote = signal<string | null>(null);

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
   * B-139: FORK one row — the fork-from-picker sequence as ONE user action
   * (the packet's lead ruling): the store read hands the map to the
   * service's `forkFromLibrary` wrapper, which loads it fresh (pin-null —
   * the fork session starts where every explicit open starts, D40) and runs
   * the engine's `forkMap()`. The PANEL never touches the facade (R2); the
   * wrapper owns every refusal and surfaces them through its words channel
   * — rendered here beside the store errors (C32). The fork is NOT a library
   * row (C25: the chat-attached private copy) — the list is untouched and
   * the picker STAYS OPEN (the user picks from the list; the service's
   * documented re-open makes the inner load's close invisible). Never
   * refuses-for-being-late in plain sight: anything after this is the
   * wrapper's words, not UI logic.
   *
   * A stale id (the row died under us) degrades exactly like Open (C32).
   */
  protected async fork(id: string): Promise<void> {
    const map = await this.library.get(id);
    if (map === null) {
      this.error.set('That map is no longer in the library.');
      void this.refresh();
      return;
    }
    this.error.set(null);
    this.savedBackNote.set(null); // the next fork-family action clears the last success words
    await this.graph.forkFromLibrary(map); // the picker re-opens after the fork's inner load — words on refusal
  }

  /**
   * B-139: SAVE FORK BACK TO LIBRARY (D97/D41 — the explicit, non-default
   * action; C25: never bundled into the save/dock flows; rendered ONLY while
   * the loaded map is a fork). The service wrapper runs
   * `facade.saveForkToLibrary()` (the save-moment snapshot, the fork's OWN
   * id/name — the fork id IS its library id v1) and upserts it in the store;
   * the list refreshes and the words confirmation renders inline. The loaded
   * session keeps diverging afterwards (D97: the stored row is the save
   * moment, no facade state moved) — nothing here re-points or re-loads.
   */
  protected async saveForkBack(): Promise<void> {
    this.savedBackNote.set(null); // the next fork-family action clears the last success words
    const saved = await this.graph.saveForkBackToLibrary();
    await this.refresh(); // the store re-read serves whatever the upsert did
    if (saved) {
      this.error.set(null);
      this.savedBackNote.set('Saved to the library.');
    }
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
    this.graph.clearForkError(); // B-139: the fork words channel joins the reset
    this.confirmingId.set(null);
    this.error.set(null);
    this.savedBackNote.set(null); // B-139: the save-back words join the reset
    this.createValue.set('');
    this.pasteValue.set(''); // B-138: the paste importer's state joins the reset
  }

  /**
   * Escape — the no-op-when-closed guard lives here (one keydown, D2).
   * B-148 (REPAIRS §R8, packet ruling 2): Escape dismisses the TOP-MOST
   * open surface, one per press — the panel takes the press ONLY when the
   * service reads it as top-most (the Maps panel paints above the layer
   * manager — the stack's later sibling — and beneath a parked node menu).
   * The close is this surface's OWN ×/Escape path above; never a second one.
   */
  protected onEscape(): void {
    if (this.open() && this.graph.escapeTopSurface() === 'maps-panel') this.close();
  }

  /** B-114: the rail's collapse/expand — one discrete tap (D2). */
  protected toggleRail(): void {
    this.collapsed.update((expanded) => !expanded);
  }
}
