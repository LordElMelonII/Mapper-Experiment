// src/app/viewer/layer-manager.component.ts — PKG B-126 (§5 Phase 3 M3):
// the D82 layer-manager SHEET — create / rename / up-down reorder / informed-
// cascade delete, the fifth REGION of the map viewer (beside the other
// panels on wide viewports, a bottom sheet with a >= 44px collapse rail on
// narrow ones — the B-114 pattern). Opened by the Manage affordance on the
// bottom-left layer nav (map-viewer); the nav STAYS the compact switcher —
// the sheet never duplicates it (no layer switching here, D82). B-128
// (D85): the read-only PORTAL MIRROR line joined each row. B-130 (D84/D29):
// the per-row BACKGROUND entry joined too — the current state in words
// (none / the user's URL / "Uploaded image" + the stored file name), the
// Upload label (BackgroundStore.save ⇒ setLayerBackground { assetId }), the
// URL input + Set (setLayerBackground { url }; Set is disabled for an empty
// trimmed input AND for a no-change URL — C30 honesty, the canCreate
// pattern), and Remove (setLayerBackground null; rendered only when a
// background exists). Replace = set again — one image per layer.
// B-135 (D93/F07): the background entry also carries CALIBRATE — the
// placement authoring mode's only doorway, through the service's gated
// enterCalibrate (the service closes this sheet on entry; the stage band
// takes over). The button is disabled — never hidden — while the row
// cannot calibrate (canCalibrate: not the active layer, no background, a
// failed load, a stale natural).
//
// R2: the component mutates nothing itself — every command goes through the
// service's layer wrappers (upsertLayer / removeLayer / reorderLayers /
// setLayerBackground), which own the facade call, the C30 refusal shape,
// the F45 dirty bump and the B-121 draft-log coverage. R1: the delete-confirm's
// three counts are the ENGINE's `layerRemovalImpact` rendered in plain
// words — the UI never counts (D82). B-128 (D85): each row's read-only
// portal mirror line comes from the service's portalEntryOf read (words
// only, C23; re-reads on editorRevision, C24). R3: events in → signals out
// → this template; the sheet's gestures are discrete taps (D2). C23: plain
// words everywhere a user reads — names are authored strings, ids never
// render. F52/D53: every control >= 44px, touch-alone, no hover affordance;
// the rail is the narrow form's collapse affordance (the B-114 media-query
// pattern — wide hides the rail and always shows the body). D81: the
// sheet's open/close is a panel-driven resize the existing discriminator
// classifies (preserve on wide, refit on narrow) — ZERO resize code here.
// Escape closes the sheet (a no-op when closed — the connect-mode Escape
// precedent); a fresh loadMap closes it (the service's reset).
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { LayerRemovalImpact } from '../../core/api';
import { BACKGROUND_STORE } from '../graph/background-store';
import { GraphService, type NodeEditIssue } from '../graph/graph.service';

// --- B-133 (D91) floating-surface geometry (the B-119 mirrors) ----------------

/** The floating panel's width cap — 18rem in px (SCSS mirror). */
/** Header height fallback when the header element is unreadable (C32 spirit). */
const HEADER_FALLBACK_PX = 48;
/** Clear gap below the top chrome band when clamped under it. */
const CHROME_CLEAR_GAP_PX = 8;

/**
 * B-133: one gesture's geometry snapshot — every rect is read ONCE (at the
 * dragstart), so pointermove is pure arithmetic plus one direct style write
 * (D2). The B-119 ClampFrame, with the top chrome band widened to the
 * breadcrumb + chip union (both are stage-overlay interactive chrome).
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

/** B-133: a live drag — the frame plus the pointer's start and the last applied position. */
interface DragFrame extends ClampFrame {
  readonly startClientX: number;
  readonly startClientY: number;
  readonly origX: number;
  readonly origY: number;
  last: { x: number; y: number };
}

/**
 * C23 wording helper: one count + noun in plain words ("1 place",
 * "3 arcs"). The COUNT always comes from the engine (R1); this only
 * pluralizes — wording, not math.
 */
function countWord(n: number, noun: string): string {
  return `${n} ${n === 1 ? noun : `${noun}s`}`;
}

@Component({
  selector: 'tme-layer-manager',
  templateUrl: './layer-manager.component.html',
  styleUrl: './layer-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // The B-117 host-hides-closed precedent: display:none while closed, so
    // the sheet never occupies a region slot (D91: it never occupies LAYOUT
    // at all — the surface overlays the stage on both layouts).
    '[class.tme-open]': 'open()',
    // B-133 (D91): the wide floater's regime classes (the route/arc panel
    // precedent; narrow ignores them — the media query owns the worlds).
    '[class.tme-maximized]': 'maximized()',
    '[class.tme-anchor-start]': 'anchorStart()',
    '[class.tme-placed]': 'floatTransform() !== null',
    '[style.transform]': 'floatTransform()',
    // B-126 (D82): Escape closes the sheet — one discrete keydown (D2), a
    // no-op when closed (the connect-mode Escape precedent).
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class LayerManagerComponent {
  protected readonly graph = inject(GraphService);

  /** B-133: the drag writes the host's style directly — the element is needed. */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * B-133 (D91): the wide floater's maximize state — component-local VIEW
   * chrome (compact floater by default; Maximize lifts the height cap).
   */
  protected readonly maximized = signal(false);

  /**
   * B-133: the floating panel's rendered transform — `translate(x, y)` of
   * the remembered viewport position (null while unplaced: the CSS anchor
   * applies). The drag's direct style writes land on the same property.
   */
  protected readonly floatTransform = computed<string | null>(() => {
    if (!this.open()) return null;
    const pos = this.graph.layerManagerPosition();
    return pos === null ? null : `translate(${pos.x}px, ${pos.y}px)`;
  });

  /**
   * B-133: the avoid-the-selection default anchor (D91 — placement-only,
   * never a pan): an UNPLACED floater anchors away from the selection's
   * rendered anchor. A remembered position always wins (D10). The selection
   * signals are read first so the computed re-runs exactly when they change.
   */
  protected readonly anchorStart = computed(() => {
    if (this.graph.layerManagerPosition() !== null) return false;
    void this.graph.selection();
    void this.graph.edgeSelection();
    return this.graph.selectionRenderedSide() === 'right';
  });

  /** The drag currently in progress, or null — a plain field (D2). */
  private drag: DragFrame | null = null;

  /** B-133: the Maximize/Restore toggle (the template's only write path, R3). */
  protected toggleMaximize(): void {
    this.maximized.update((m) => !m);
  }

  /**
   * B-133: dragstart on the floater header (the route/arc panel machinery —
   * the header's buttons keep their taps; one pointer owns the drag; the
   * high-frequency pointermove listener exists only WHILE dragging, D2/D53).
   */
  protected onDragStart(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button') !== null) return;
    if (!event.isPrimary) return;
    if (!this.open() || this.drag !== null) return;
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

  /** B-133: HIGH-FREQUENCY (D2) — reads frame scalars, writes the style transform only. */
  private readonly onDragMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || !event.isPrimary) return;
    const pos = this.clampFloat(
      drag.origX + (event.clientX - drag.startClientX),
      drag.origY + (event.clientY - drag.startClientY),
      drag,
    );
    drag.last = pos;
    this.host.nativeElement.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  };

  /** B-133: discrete release — detach first, then commit the position ONCE. */
  private readonly onDragEnd = (): void => {
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragEnd);
    window.removeEventListener('pointercancel', this.onDragEnd);
    const drag = this.drag;
    this.drag = null;
    if (drag === null) return;
    this.graph.layerManagerPosition.set(drag.last);
  };

  /** B-133: snapshot the clamp geometry (the route/arc panel readFrame pattern). */
  private readFrame(width: number): ClampFrame | null {
    const stage =
      this.host.nativeElement.closest('.tme-viewer')?.querySelector('.tme-stage') ?? null;
    if (stage === null) return null;
    const stageRect = stage.getBoundingClientRect();
    const header = this.host.nativeElement.querySelector('.tme-manager-head');
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

  /** B-133: the stage-bounds clamp (the B-119 arithmetic, route/arc twin). */
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
   * The sheet's rows — the loaded map's layers in ARRAY order (the one
   * truth: D82 "layer order is array/nav order only"). A pass-through of
   * the service's computed (C24: it re-reads on every layer command).
   */
  protected readonly rows = this.graph.layerNames;

  /**
   * C32: the sheet degrades honestly — hidden entirely with no map (or no
   * layers) even if the open signal stands. The host class drives the
   * display:none form; the template's @if keys off the same gate so a
   * closed sheet renders no chrome at all.
   */
  protected readonly open = computed(() => this.graph.layerManagerOpen() && this.rows().length > 0);

  /**
   * B-114 (the Q29 narrow-form precedent): the rail's collapse state —
   * component-local VIEW chrome only (no floating, no persistence; the
   * sheet's OPEN state is the service's, the body's collapse is this
   * component's). Narrow-only by the media query; wide always shows the
   * body regardless of it.
   */
  protected readonly collapsed = signal(false);

  // --- The create row -------------------------------------------------------

  /** The create input's text (a controlled input — R3). */
  private readonly createValue = signal('');

  /** C30 honesty (the canPromote pattern): Add is offered only for a name. */
  protected readonly canCreate = computed(() => this.createValue().trim().length > 0);

  // --- The rename row state ---------------------------------------------------

  /** The layer id currently in rename mode, or null. */
  private readonly renamingId = signal<string | null>(null);

  /** The rename input's text (a controlled input — R3). */
  private readonly renameValue = signal('');

  /** C30 honesty: Save is offered only for a non-empty name. */
  protected readonly canRename = computed(() => this.renameValue().trim().length > 0);

  // --- The delete-confirm state ------------------------------------------------

  /** The layer id whose inline confirm block is open, or null. */
  private readonly confirmingId = signal<string | null>(null);

  /**
   * B-126 (D82/R1): the open confirm's counts — the ENGINE's answer for
   * the confirmed layer, re-read on every editor revision (C24) so the
   * block can never go stale under a sheet command. Null while no confirm
   * is open (or the layer vanished — degrade, C32 spirit).
   */
  protected readonly impact = computed((): LayerRemovalImpact | null => {
    const id = this.confirmingId();
    if (id === null) return null;
    void this.graph.editorRevision(); // dependency: a sheet command re-reads (C24)
    return this.graph.layerRemovalImpact(id);
  });

  /**
   * D82/C23: the confirm's sentence — the engine's three numbers in plain
   * words, always all three (zeros are honest counts, never omissions):
   * "Deletes 1 place, 0 arcs on this layer, and 1 arc from another layer."
   */
  protected readonly impactLine = computed((): string => {
    const counts = this.impact();
    if (counts === null) return '';
    return (
      `Deletes ${countWord(counts.nodes, 'place')}, ` +
      `${countWord(counts.sameLayerArcs, 'arc')} on this layer, ` +
      `and ${countWord(counts.crossLayerArcs, 'arc')} from another layer.`
    );
  });

  /**
   * B-128 (D85): the read-only PORTAL MIRROR — one line per layer row,
   * under its name: "Entered from <node label> (<layer name>)" when an
   * entry node is wired to it, "No entry from another layer" otherwise.
   * Plain words throughout (C23 — authored labels/names via the service's
   * portalEntryOf read; ids never render); READ-ONLY — no affordance. The
   * editorRevision dependency makes every line re-read after a wiring
   * change, a rename, or a layer command (C24 — the in-place mutation
   * precedent); keyed by layer id for the row template's direct lookup.
   */
  protected readonly portalLines = computed((): ReadonlyMap<string, string> => {
    void this.graph.editorRevision(); // dependency: a wiring/rename re-reads (C24)
    const lines = new Map<string, string>();
    for (const layer of this.rows()) {
      const entry = this.graph.portalEntryOf(layer.id);
      lines.set(
        layer.id,
        entry === null
          ? 'No entry from another layer'
          : `Entered from ${entry.nodeLabel} (${entry.layerName})`,
      );
    }
    return lines;
  });

  /**
   * The last C30 refusal of a sheet command — the collected field-precise
   * issues, rendered user-visibly (never console-only; the B-117 pattern).
   */
  protected readonly refusals = signal<readonly NodeEditIssue[]>([]);

  // --- The per-row background entry (PKG B-130, D84/D29) ----------------------

  /**
   * B-130: the upload store — the D84 Upload arm's seam (save ⇒
   * setLayerBackground { assetId }). Injected through the BACKGROUND_STORE
   * token; the harness runs the in-memory impl (session-local by design,
   * D29), the host runs C-002's localforage one.
   */
  private readonly store = inject(BACKGROUND_STORE);

  /**
   * The per-row URL input's text, keyed by layer id (controlled inputs —
   * R3; one map so the rows never share state). Cleared on a successful
   * Set (the create-input precedent).
   */
  private readonly bgUrls = signal<ReadonlyMap<string, string>>(new Map());

  /**
   * B-130 (D84/C23): the row's background STATE LINE — none / the user's
   * URL verbatim / "Uploaded image" + the stored file name (the name lives
   * in the store entry, D29). Computed over the editorRevision (C24 — the
   * wrapper's in-place layer swap) so every line re-reads after any
   * background command; keyed by layer id for the row template's lookup.
   */
  protected readonly backgroundLines = computed((): ReadonlyMap<string, string> => {
    void this.graph.editorRevision(); // dependency: a background command re-reads (C24)
    const lines = new Map<string, string>();
    for (const layer of this.rows()) {
      const background = this.graph.layerBackground(layer.id);
      if (background === null) lines.set(layer.id, 'No background');
      else if ('url' in background) lines.set(layer.id, background.url);
      else {
        const name = this.store.nameOf(background.assetId);
        lines.set(layer.id, name === null ? 'Uploaded image' : `Uploaded image (${name})`);
      }
    }
    return lines;
  });

  /**
   * B-130: whether the row's Remove button renders — only when a background
   * exists (D84: remove has nothing to do otherwise; the packet's refusal-
   * path cell pins the absence). The editorRevision read is the C24
   * dependency (the in-place swap) — the same discipline as backgroundLines.
   */
  protected hasBackground(layerId: string): boolean {
    void this.graph.editorRevision(); // dependency: a background command re-reads (C24)
    return this.graph.layerBackground(layerId) !== null;
  }

  /**
   * B-130: the row's URL input text (controlled input — R3). Reading the
   * bgUrls signal inside a template-called method keeps the binding
   * reactive (the canSetUrl discipline).
   */
  protected bgUrlValue(layerId: string): string {
    return this.bgUrls().get(layerId) ?? '';
  }

  /**
   * B-130 (C30 honesty, the canCreate/canRename pattern): Set is offered
   * only for a NON-EMPTY trimmed URL that is not a NO-CHANGE — a URL equal
   * to the layer's current url arm would re-commit the same reference (the
   * facade's PUT always marks dirty, so the UI keeps no-change off the
   * command path entirely). An assetId-arm layer takes any non-empty URL
   * (every URL is a change of arm).
   */
  protected canSetUrl(layerId: string): boolean {
    void this.graph.editorRevision(); // dependency: the current-arm comparison re-reads (C24)
    const url = this.bgUrls().get(layerId)?.trim() ?? '';
    if (url.length === 0) return false;
    const current = this.graph.layerBackground(layerId);
    return !(current !== null && 'url' in current && current.url === url);
  }

  // --- Template event handlers (R3: DOM read → signal write, never DOM write) ---

  protected onCreateInput(event: Event): void {
    this.createValue.set((event.target as HTMLInputElement).value);
  }

  /**
   * D82/C5: create — `upsertLayer({ id: '', name })`; the engine assigns
   * the id. The input clears on success (ruling 2); a refusal renders the
   * issues and KEEPS the input (the author fixes the name).
   */
  protected add(): void {
    const name = this.createValue().trim();
    if (name.length === 0) return; // the disabled Add's guard (C30 honesty)
    const refused = this.graph.upsertLayer({ id: '', name });
    if (refused !== null) {
      this.refusals.set(refused.issues);
      return;
    }
    this.refusals.set([]);
    this.createValue.set('');
  }

  protected onRenameInput(event: Event): void {
    this.renameValue.set((event.target as HTMLInputElement).value);
  }

  /** Ruling 2: Edit toggles the row into its name input + Save/Cancel. */
  protected startRename(layerId: string, name: string): void {
    this.refusals.set([]);
    this.confirmingId.set(null); // one row mode at a time
    this.renamingId.set(layerId);
    this.renameValue.set(name);
  }

  /**
   * Ruling 2: commit — `upsertLayer({ id, name })` (the PUT rename). The
   * background needs NO pass-through: the facade's upsertLayer REPLACE is
   * absent-and-preserve on the arm (gate-verifier finding 2, M3 gate — the
   * rename caller does not manage the image; setLayerBackground owns it).
   */
  protected commitRename(): void {
    const layerId = this.renamingId();
    const name = this.renameValue().trim();
    if (layerId === null || name.length === 0) return;
    const refused = this.graph.upsertLayer({ id: layerId, name });
    if (refused !== null) {
      this.refusals.set(refused.issues);
      return;
    }
    this.refusals.set([]);
    this.renamingId.set(null);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
    this.refusals.set([]);
  }

  /**
   * Ruling 2: Up/Down commit `reorderLayers` with the swapped FULL id array
   * — array shuffling is UI state, not R1 math. The boundary buttons are
   * disabled in the template (plain order facts: the first row's Up, the
   * last row's Down), so the bounds check here is belt-only.
   */
  protected moveLayer(index: number, delta: -1 | 1): void {
    const ids = this.graph.layerNames().map((layer) => layer.id);
    const swap = index + delta;
    if (swap < 0 || swap >= ids.length) return;
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
    const refused = this.graph.reorderLayers(ids);
    if (refused !== null) {
      this.refusals.set(refused.issues);
      return;
    }
    this.refusals.set([]);
  }

  /** Ruling 3: Delete swaps the row into the inline confirm block. */
  protected startDelete(layerId: string): void {
    this.refusals.set([]);
    this.renamingId.set(null); // one row mode at a time
    this.confirmingId.set(layerId);
  }

  /**
   * Ruling 3: ONE confirm = `removeLayer(layerId)` — the informed cascade
   * (N places, M same-layer arcs, K cross-layer arcs, the background —
   * all of it, together). A refusal keeps the block open with the issues
   * rendered (nothing died — reject-before-mutate).
   */
  protected confirmDelete(): void {
    const layerId = this.confirmingId();
    if (layerId === null) return;
    const refused = this.graph.removeLayer(layerId);
    if (refused !== null) {
      this.refusals.set(refused.issues);
      return;
    }
    this.refusals.set([]);
    this.confirmingId.set(null);
  }

  protected cancelDelete(): void {
    this.confirmingId.set(null);
    this.refusals.set([]);
  }

  // --- Background handlers (PKG B-130, D84/D29 — R3: DOM read → command) ------

  /**
   * B-130: the Upload label's file input — D29's upload arm: store.save ⇒
   * `setLayerBackground(layerId, { assetId })`. Replace = set again (one
   * image per layer). The input's value clears FIRST so re-picking the same
   * file re-fires change; a refused command renders in the sheet's refusals
   * area (the store entry simply stays unreferenced — harmless, session-
   * local, D29). A absent file (cancel) is a no-op (C32 spirit).
   */
  protected async onUpload(event: Event, layerId: string): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    const assetId = await this.store.save(file);
    const refused = this.graph.setLayerBackground(layerId, { assetId });
    if (refused !== null) {
      this.refusals.set(refused.issues);
      return;
    }
    this.refusals.set([]);
  }

  protected onBgUrlInput(event: Event, layerId: string): void {
    const value = (event.target as HTMLInputElement).value;
    this.bgUrls.update((urls) => new Map(urls).set(layerId, value));
  }

  /**
   * B-130: the URL arm's Set — `setLayerBackground(layerId, { url })` with
   * the TRIMMED input (the user's own words travel with the saved map, D84).
   * The empty/no-change cases are the disabled button's guard (C30 honesty —
   * unreachable here); a success clears the row's input (the create-input
   * precedent), a refusal keeps it for fixing.
   */
  protected setBgUrl(layerId: string): void {
    const url = this.bgUrls().get(layerId)?.trim() ?? '';
    if (url.length === 0) return;
    const refused = this.graph.setLayerBackground(layerId, { url });
    if (refused !== null) {
      this.refusals.set(refused.issues);
      return;
    }
    this.refusals.set([]);
    this.bgUrls.update((urls) => new Map(urls).set(layerId, ''));
  }

  /**
   * B-130: Remove — `setLayerBackground(layerId, null)`; the button renders
   * only when a background exists (hasBackground), so the nothing-to-remove
   * case is unreachable by construction (the packet's refusal-path ruling).
   */
  protected removeBackground(layerId: string): void {
    const refused = this.graph.setLayerBackground(layerId, null);
    if (refused !== null) {
      this.refusals.set(refused.issues);
      return;
    }
    this.refusals.set([]);
  }

  /**
   * B-135 (D93/F07): the row's Calibrate entry — the mode's ONLY doorway,
   * through the service's gated write path (R2/R3: enterCalibrate owns the
   * gate, the session snapshot and the canvas takeover, and closes this
   * sheet itself — the stage band replaces it). The button is DISABLED —
   * never hidden — while the row cannot calibrate (the service's
   * canCalibrate: not the active layer, no background, a failed load, or a
   * stale natural — the F07 dead-control reasoning).
   */
  protected canCalibrate(layerId: string): boolean {
    return this.graph.canCalibrate(layerId);
  }

  protected enterCalibrate(): void {
    this.graph.enterCalibrate();
  }

  /** The sheet's X / Escape close — a pure signal write (R3). */
  protected close(): void {
    this.graph.layerManagerOpen.set(false);
    // No half-open row modes survive the close (the next open starts clean).
    this.renamingId.set(null);
    this.confirmingId.set(null);
    this.refusals.set([]);
  }

  /**
   * Escape — the no-op-when-closed guard lives here (one keydown, D2).
   * B-148 (REPAIRS §R8, packet ruling 2): Escape dismisses the TOP-MOST
   * open surface, one per press — the sheet takes the press ONLY when the
   * service reads it as top-most (the Maps panel paints above it — the
   * stack's later sibling — and a parked node menu above both). The close
   * is this surface's OWN ×/Escape path above; never a second one.
   */
  protected onEscape(): void {
    if (
      this.graph.layerManagerOpen() &&
      this.graph.escapeTopSurface() === 'layer-manager'
    ) {
      this.close();
    }
  }

  /** B-114: the rail's collapse/expand — one discrete tap (D2). */
  protected toggleRail(): void {
    this.collapsed.update((expanded) => !expanded);
  }
}
