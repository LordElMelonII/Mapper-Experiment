// src/app/viewer/arc-panel.component.ts — PKG B-106: the arc panel (ruling 3),
// extended by PKG B-123 (§5 Phase 3 M2 — the editing sections): the panel
// renders endpoints/modes/blocked state verbatim off the live references
// (ArcInfo — authored labels, authored mode words, D20 merged block state)
// and hosts the chat-scoped blocked toggle (F14/C2/D20, both modes). In
// EDITOR mode (graph.editorMode() — the B-117/Q29 property-panel regime; view
// mode keeps exactly the B-106 body) it gains the §5 M2 editing sections:
//   - per-mode rows over the map's WHOLE mode universe (arcModesOf): an
//     allowed checkbox + an authored-minutes input (C14 rows 2–3; the label
//     is the ONE core resolver's authored word — the UI never maps ids to
//     words itself). The `multiplier` field is OUT of M2 scope: rows never
//     edit it and never drop it (the commit copies the live spec verbatim).
//   - terrain select (C12), authored-distance input (D14), curve
//     control-point rows (B-111 — the AUTHORED list edited verbatim: add /
//     remove / retype; no math, ever — R1).
//   - the "measure this arc" section (F44/F20/D44): value + unit word + kind
//     select + Apply ⇒ facade.calibrateScale (A-015) with a non-empty word,
//     or unit-absent (re-measure in the established unit, D44). The scale
//     readout is graph.scaleNow — core numbers verbatim (R1); a measurement
//     writes SCALE, never the arc (the arc does NOT become drafted), while
//     `dirty` lights and pricing serves the SAVED scale until saveMap — the
//     section says so.
//   - Remove (D42's deferred refine/dedup surface): facade.removeEdge; an
//     overlay block dies with the arc (F50); no confirm dialog (F46 — the
//     draft state makes accidental removals recoverable by redrawing).
// The B-117 draft discipline (C29/R2): every control is a CONTROLLED input
// (signal in/out) bound to an arc panel-LOCAL draft — never the live
// MapEdgeData; ONE draft commit per Apply (a full-replace upsertEdge PUT with
// the arc's KNOWN id, D75); an un-Applyed draft is abandoned on selection
// change (nothing was promised: no dirty, no drafted visual). Untouched rows
// commit the live spec verbatim — a round-trip of the packet's "never drop
// what the panel does not own" for multipliers and absent keys.
// C30: refusals surface user-visibly (the field-precise issues list, the
// connectRefusal/nodeEditRefusal pattern) — the draft refusal under the edit
// body, the measure refusal under its section, and the B-123 blockArc catch
// under the chat toggle (blocking an UNSAVED drawn arc no longer throws
// uncaught). Honest disabled states: Apply disables while any touched text
// is unparseable, the measure Apply while the value is not a number.
// R1: no number here is computed or displayed except the core's own scale
// readout; R2: everything goes through GraphService's facade commands; R3:
// events in → signals out → this template. Zoneless (D2): taps, keystrokes
// and select changes are discrete — the only writes are signal writes. The
// seed/commit effect runs per discrete selection or editor-mode change.
// F52/D53: every control ≥ 44px, touch-action manipulation, no hover-only
// affordances.
// B-133 (D91): the panel joins the generalized floating regime — on WIDE it
// floats over the full-width stage (the B-119 property-panel surface: a
// position:fixed floater with a remembered position per panel kind
// (arcPanelPosition — written ONCE per drag end; the drag applies the live
// position as a DIRECT style transform, D2), a Maximize/Restore toggle, and
// best-effort avoid-the-selection placement (an unplaced floater anchors on
// the side away from the arc's rendered anchor — placement-only, NEVER a
// pan). On narrow it overlays as a bottom sheet in the .tme-sheets stack
// (unchanged content, overlay form). The @if in map-viewer.component.html
// still gates the whole panel on an edge selection.
import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { MapEdgeData, ModeSpec, Terrain, TravelMode } from '../../core/api';
import { DEFAULT_BLOCK_REASON, GraphService, type NodeEditIssue } from '../graph/graph.service';

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
  /** The WHOLE panel's measured height (B-136: the bottom arm contains the body too). */
  readonly panelHeight: number;
}

/** B-133: a live drag — the frame plus the pointer's start and the last applied position. */
interface DragFrame extends ClampFrame {
  readonly startClientX: number;
  readonly startClientY: number;
  readonly origX: number;
  readonly origY: number;
  last: { x: number; y: number };
}

/** The five TERRAINS with their C23 select words — api.ts's union, verbatim. */
const TERRAIN_OPTIONS: readonly { id: Terrain; name: string }[] = [
  { id: 'road', name: 'Road' },
  { id: 'plain', name: 'Plain' },
  { id: 'river', name: 'River' },
  { id: 'swamp', name: 'Swamp' },
  { id: 'mountain', name: 'Mountain' },
];

/** The two C11 unit kinds with their select words. */
const UNIT_KIND_OPTIONS: readonly { id: 'distance' | 'time'; name: string }[] = [
  { id: 'distance', name: 'Distance' },
  { id: 'time', name: 'Time' },
];

/**
 * One editable mode row (C29/R2: the draft's local copy). `touched` flags are
 * set by EVERY input event of their control — the commit writes a spec only
 * for touched rows and copies the live spec verbatim (multiplier included,
 * out of M2 scope) for untouched ones, so a full-replace commit never drops
 * data the author did not edit.
 */
interface ModeDraftRow {
  readonly id: TravelMode;
  /** The authored display word (the ONE core resolver's label, seeded once — C23/R1: the UI never maps ids to words). */
  readonly label: string;
  allowed: boolean;
  allowedTouched: boolean;
  /** The authored-minutes input text — '' when none (clearing is a write). */
  minutes: string;
  minutesTouched: boolean;
}

/**
 * The local ARC DRAFT (C29/R2): plain copies of the panel-editable fields,
 * seeded from the live arc and committed ONLY on Apply (one full-replace
 * `upsertEdge` — the packet's one-draft-commit-per-Apply rule). `terrain` ''
 * means none (the explicit none; a commit sends undefined to clear). The
 * curve rows are ONE CONTROL POINT per row (verbatim authored strings).
 */
interface ArcDraft {
  readonly id: string;
  readonly modes: ModeDraftRow[];
  terrain: string;
  terrainTouched: boolean;
  distance: string;
  distanceTouched: boolean;
  curve: string[];
  curveTouched: boolean;
}

/** Parse authored text as a finite number, or null when not one (input handling, not computation — R1). */
function asFiniteNumber(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

@Component({
  selector: 'tme-arc-panel',
  templateUrl: './arc-panel.component.html',
  styleUrl: './arc-panel.component.scss',
  host: {
    // B-133 (D91): the wide floater's regime classes (the route-panel
    // precedent; narrow ignores them — the media query owns the worlds).
    // The wide VISIBILITY stays the map-viewer template's @if on the edge
    // selection (ruling 1 unchanged); these classes only shape the surface.
    '[class.tme-maximized]': 'maximized()',
    '[class.tme-anchor-start]': 'anchorStart()',
    '[class.tme-placed]': 'floatTransform() !== null',
    // B-D2 (R29, PROPOSAL-D §2.1): the dock-home chrome class — the arc
    // panel docks in the same rotation as the selection surfaces (R29
    // ruling 4); the SCSS :host(.tme-docked ...) compounds stand the float
    // forms down inside the dock. Inert below 1024px.
    '[class.tme-docked]': 'graph.arcDockedHome()',
    '[style.transform]': 'floatTransform()',
  },
})
export class ArcPanelComponent {
  protected readonly graph = inject(GraphService);

  /** B-133: the drag writes the host's style directly — the element is needed. */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** C23 select words for the terrain/unit-kind controls (plain data). */
  protected readonly terrains = TERRAIN_OPTIONS;
  protected readonly unitKinds = UNIT_KIND_OPTIONS;

  /**
   * B-133 (D91): the wide floater's maximize state — component-local VIEW
   * chrome (compact floater by default; Maximize lifts the height cap).
   */
  protected readonly maximized = signal(false);

  /**
   * B-133: the floating panel's rendered transform — `translate(x, y)` of
   * the remembered viewport position (null while unplaced: the CSS anchor
   * applies). The drag's direct style writes land on the same property.
   * B-D2: null while the panel is the dock's occupant (a remembered
   * position must not translate the in-flow dock fill; it wins again the
   * moment the panel floats, D10).
   */
  protected readonly floatTransform = computed<string | null>(() => {
    if (this.graph.arcDockedHome()) return null;
    if (this.graph.edgeSelection() === null) return null;
    const pos = this.graph.arcPanelPosition();
    return pos === null ? null : `translate(${pos.x}px, ${pos.y}px)`;
  });

  /**
   * B-133: the avoid-the-selection default anchor (D91 — placement-only,
   * never a pan): an UNPLACED floater anchors away from the arc's rendered
   * anchor. A remembered position always wins (D10). The selection signals
   * are read first so the computed re-runs exactly when they change (D2).
   */
  protected readonly anchorStart = computed(() => {
    if (this.graph.arcPanelPosition() !== null) return false;
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
   * B-D2 (R29, PROPOSAL-D §2.1): the floater's Dock affordance — the
   * float-side half of the dock↔float handoff (the dock header's Float is
   * the other). One service write (R3); shell-gated in the template.
   */
  protected dock(): void {
    this.graph.setPanelDocked('arc', true);
  }

  /**
   * B-133: dragstart on the floater header (the route-panel's machinery —
   * buttons keep their taps; one pointer owns the drag; the high-frequency
   * pointermove listener exists only WHILE dragging, D2/D53).
   */
  protected onDragStart(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button') !== null) return;
    if (!event.isPrimary) return;
    if (this.graph.edgeSelection() === null || this.drag !== null) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    const frame = this.readFrame(rect.width, rect.height);
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

  /** B-133: discrete release — detach first, then commit the position ONCE. */
  private readonly onDragEnd = (): void => {
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragEnd);
    window.removeEventListener('pointercancel', this.onDragEnd);
    const drag = this.drag;
    this.drag = null;
    if (drag === null) return;
    this.graph.arcPanelPosition.set(drag.last);
  };

  /** B-133: snapshot the clamp geometry (the route-panel readFrame pattern). */
  private readFrame(width: number, height?: number): ClampFrame | null {
    const stage =
      this.host.nativeElement.closest('.tme-viewer')?.querySelector('.tme-stage') ?? null;
    if (stage === null) return null;
    const stageRect = stage.getBoundingClientRect();
    const header = this.host.nativeElement.querySelector('.tme-float-head');
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
      panelHeight: height ?? this.host.nativeElement.getBoundingClientRect().height,
    };
  }

  /**
   * B-133: the stage-bounds clamp (the B-119 arithmetic, route-panel twin).
   * B-136 (repair 1): the bottom arm contains the WHOLE panel (the old arm
   * guarded only the header — the body hung past the stage's bottom edge,
   * probe-proven on the property/route twins of this identical arithmetic);
   * when a tiny stage inverts the bands the header-reachable clamp still
   * wins (the only clamp that must always hold, so it caps maxY from above).
   */
  private clampFloat(x: number, y: number, frame: ClampFrame): { x: number; y: number } {
    const clampedX = Math.min(Math.max(x, frame.stageLeft), frame.stageRight - frame.width);
    const minY =
      clampedX + frame.width > frame.chromeLeft
        ? frame.chromeBottom + CHROME_CLEAR_GAP_PX
        : frame.stageTop;
    const maxY = Math.min(
      Math.max(minY, frame.stageBottom - frame.panelHeight), // whole panel inside the stage (B-136)
      frame.stageBottom - frame.headerHeight, // header reachable — wins when the bands invert
    );
    const clampedY = Math.min(Math.max(y, minY), maxY);
    return { x: clampedX, y: clampedY };
  }

  /**
   * B-124 (D78/C23): the allowed-mode chips' word LOOKUP — the
   * core-resolved label via the service's `modeRows` (the ONE resolver's
   * words; the UI looks a word up, it never maps an id itself, R1 spirit
   * for authored words). A registry relabel renders ('Carriage'); on a
   * no-registry map the id IS the word, so the rendering is byte-identical
   * to the pre-B-124 trio. Unknown id ⇒ the id (degrade, never throw —
   * C32 spirit).
   * B-146 (R6 item 8): renamed from `modeWord` — this resolves id → word;
   * DISPLAY is the service's ONE formatter (`graph.modeWord`, identity on
   * the resolver's word per the R6 lead ruling), which the template applies
   * to this lookup's result.
   */
  protected modeLabelOf(id: TravelMode): string {
    const row = this.graph.modeRows().find((candidate) => candidate.id === id);
    return row?.label ?? id;
  }

  /**
   * The selected arc's data (ruling 3): graphRevision is a dependency so a
   * Block/Lift re-reads arcInfo without edgeSelection moving — the reason
   * line flips to the overlay's restated text, Lift enables, live.
   * B-123: editorRevision joins as a dependency (a commit/calibration/removal
   * bumps it) so the whole view body re-reads after the panel's own commands
   * too. Null only if the id no longer resolves (map swap races) — the @if
   * hides the body.
   */
  protected readonly arc = computed(() => {
    void this.graph.graphRevision(); // dependency: block/lift re-reads (B-106 ruling 4)
    void this.graph.editorRevision(); // B-123: the panel's own commands re-read
    const sel = this.graph.edgeSelection();
    return sel === null ? null : this.graph.arcInfo(sel.id);
  });

  /**
   * B-123: the arc panel-LOCAL draft (C29/R2) — null whenever the editing
   * sections must not render: view mode, no selection, a NON-library arc
   * (overlay `we-` edges are chat state with no editor command — the B-116
   * waypoint precedent; arcModesOf answers null for them). The MEASURE
   * section is deliberately independent of the draft: calibrateScale takes
   * the MERGED arc set (A-015), so an overlay arc measures like any other.
   */
  private readonly draft = signal<ArcDraft | null>(null);

  /** The draft Apply's last C30 refusal — the collected field-precise issues. */
  protected readonly refusals = signal<readonly NodeEditIssue[]>([]);

  /** The measure Apply's last C30 refusal — same pattern, own section. */
  protected readonly measureRefusals = signal<readonly NodeEditIssue[]>([]);

  // --- The measure section's controlled inputs (F44/F20/D44) ---------------

  /** The "real-world distance" input's text — '' while untouched. */
  protected readonly measureValue = signal('');
  /** The unit word input's text — '' ⇒ re-measure in the established unit (D44). */
  protected readonly measureUnit = signal('');
  /** The kind select's value — seeded to the established kind at draft seed. */
  protected readonly measureKind = signal<'distance' | 'time'>('distance');

  /**
   * F44/F20: the scale readout's source — the service's `scaleNow` (core
   * numbers verbatim, R1) surfaced for the template.
   */
  protected readonly scale = this.graph.scaleNow;

  /** B-123: the blockArc catch's refusal, rendered under the chat toggle. */
  protected readonly blockRefusal = this.graph.arcBlockRefusal;

  // --- Draft mechanics (B-117 pattern) --------------------------------------

  constructor() {
    // The draft lifecycle (C29 draft-then-commit): keyed on the selection and
    // the editor mode — both change only through discrete taps (D2). A
    // selection change or the editor exit re-seeds (an un-Applyed draft is
    // abandoned — the packet's one-commit-per-Apply rule; nothing was
    // written, so nothing is lost). graphRevision is deliberately NOT a
    // dependency: a Block/Lift while editing must not wipe the draft.
    effect(() => {
      const editor = this.graph.editorMode();
      const sel = this.graph.edgeSelection();
      if (!editor || sel === null) {
        this.seedDraft(null);
        return;
      }
      // B-123: leaving the arc clears the block-catch refusal with it (the
      // stale message must not follow another arc).
      this.graph.clearArcBlockRefusal();
      this.seedDraft(sel.id);
    });
  }

  /**
   * The draft's dirty state — any touched control. Nothing touched means
   * Apply is a no-op (the B-116 no-move precedent: an untouched draft commits
   * nothing and never flags the map dirty).
   */
  protected readonly draftDirty = computed((): boolean => {
    const d = this.draft();
    if (d === null) return false;
    return (
      d.modes.some((row) => row.allowedTouched || row.minutesTouched) ||
      d.terrainTouched ||
      d.distanceTouched ||
      d.curveTouched
    );
  });

  /**
   * The draft's parse validity — every TOUCHED numeric text must be a finite
   * number (the honest disabled state: unparseable text disables Apply; a
   * valid-but-invalid value — e.g. negative minutes — is applied and its C30
   * refusal surfaces field-precise, the facade stays the authority).
   */
  protected readonly draftValid = computed((): boolean => {
    const d = this.draft();
    if (d === null) return true;
    for (const row of d.modes) {
      if (row.minutesTouched && row.minutes.trim() !== '' && asFiniteNumber(row.minutes) === null) {
        return false;
      }
    }
    if (d.distanceTouched && d.distance.trim() !== '' && asFiniteNumber(d.distance) === null) {
      return false;
    }
    for (const point of d.curve) {
      if (asFiniteNumber(point) === null) return false;
    }
    return true;
  });

  /** The Apply button's honest state: dirty + parse-valid (B-117 discipline). */
  protected readonly canApply = computed(() => this.draftDirty() && this.draftValid());

  /** The measure Apply's honest state: the value must parse (D44's apply-what-parses). */
  protected readonly canMeasure = computed(() => asFiniteNumber(this.measureValue()) !== null);

  /** F20 seeding made visible: the seeded label stands when the word is empty. */
  protected readonly establishedUnitNote = computed((): string | null => {
    if (this.measureUnit().trim() !== '') return null;
    const s = this.scale();
    if (s === null) return null;
    return `No unit word — re-measures in the established unit (${s.unitLabel} ${s.unitKind}).`;
  });

  // --- The reason input (B-106, unchanged) -----------------------------------

  /** R3: the input event handler — a DOM read, then the signal write. */
  protected onReasonInput(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  /**
   * F14/C2: block with a reason through the service (R2). Only reachable
   * while canBlock() holds. B-123: blockArc now answers false on its caught
   * C30 refusal (an UNSAVED drawn arc — the A-014 gate); the input is kept
   * so the author can retry after saving, and the message renders above.
   */
  protected block(): void {
    const sel = this.graph.edgeSelection();
    const reason = this.reason().trim();
    if (sel === null || reason.length === 0) return;
    const blocked = this.graph.blockArc(sel.id, reason);
    if (blocked) this.reason.set('');
  }

  /**
   * B-131 (D94/F55): the ONE-TAP "Block access" — the same blocked outcome
   * as block() without typing: the TRIMMED input when non-empty, else the
   * ONE shared default reason (DEFAULT_BLOCK_REASON, D94's authored
   * 'Closed') — one tap from a pristine input blocks. It sits BESIDE the
   * typed Block (F14's flow — its C30 disabled-while-empty honesty, its
   * testids — is byte-untouched) without displacing it, one mental model
   * with the property panel's one-tap; refinement is type + tap again
   * (adds-or-restates, the facade contract). The same blockArc catch applies
   * (an UNSAVED drawn arc surfaces field-precise through arcBlockRefusal)
   * and the input is consumed only on success.
   */
  protected blockAccess(): void {
    const sel = this.graph.edgeSelection();
    if (sel === null) return;
    const reason = this.reason().trim();
    const blocked = this.graph.blockArc(sel.id, reason.length > 0 ? reason : DEFAULT_BLOCK_REASON);
    if (blocked) this.reason.set('');
  }

  /**
   * C2 lift: deletes the overlay entry only (facade contract). An authored
   * block survives — the panel re-renders with the authored reason and the
   * disabled Lift, which is exactly the "overlay can add, never lift" rule
   * made visible.
   */
  protected lift(): void {
    const sel = this.graph.edgeSelection();
    if (sel === null) return;
    this.graph.liftBlock(sel.id);
  }

  // --- Editor draft handlers (R3: DOM read → signal write, never DOM write) ---

  protected onAllowedToggle(row: ModeDraftRow, event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    this.updateDraft((d) => ({
      ...d,
      modes: d.modes.map((r) =>
        r.id === row.id ? { ...r, allowed: value, allowedTouched: true } : r,
      ),
    }));
  }

  protected onMinutesInput(row: ModeDraftRow, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.updateDraft((d) => ({
      ...d,
      modes: d.modes.map((r) =>
        r.id === row.id ? { ...r, minutes: value, minutesTouched: true } : r,
      ),
    }));
  }

  protected onTerrainChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    // Only '' or the five offered terrains pass — a DOM lie must not draft one.
    if (value !== '' && !TERRAIN_OPTIONS.some((option) => option.id === value)) return;
    this.updateDraft((d) => ({ ...d, terrain: value, terrainTouched: true }));
  }

  protected onDistanceInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.updateDraft((d) => ({ ...d, distance: value, distanceTouched: true }));
  }

  /** One control point per row — AUTHORED strings edited verbatim (R1). */
  protected onCurveInput(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.updateDraft((d) => ({
      ...d,
      curve: d.curve.map((p, i) => (i === index ? value : p)),
      curveTouched: true,
    }));
  }

  protected addCurvePoint(): void {
    this.updateDraft((d) => ({ ...d, curve: [...d.curve, ''], curveTouched: true }));
  }

  protected removeCurvePoint(index: number): void {
    this.updateDraft((d) => ({
      ...d,
      curve: d.curve.filter((_, i) => i !== index),
      curveTouched: true,
    }));
  }

  /**
   * B-123 (D75/D77): the ONE draft commit per Apply — a full-replace
   * `upsertEdge` PUT with the arc's KNOWN id (the whole draft; untouched
   * specs verbatim). A C30 refusal renders field-precise with the draft
   * intact; on success the panel re-seeds from the committed values (the
   * B-117 reseed precedent) and the canvasside draft treatment lights (B-121).
   */
  protected applyDraft(): void {
    const d = this.draft();
    if (d === null || !this.canApply()) return;
    const live = this.graph.edgeDataById(d.id);
    if (live === null) {
      // The arc is gone from the library plane — nothing to save, no command
      // to issue; drop the draft (near-unreachable degrade, C32).
      this.refusals.set([]);
      this.draft.set(null);
      return;
    }
    const modes: MapEdgeData['modes'] = {};
    for (const row of d.modes) {
      const liveSpec = live.modes[row.id];
      if (!row.allowedTouched && !row.minutesTouched) {
        // Untouched ⇒ the live spec verbatim — a full-replace commit never
        // drops what the panel does not own (multiplier included — out of
        // M2 scope, never edited, never dropped; B-123 packet ruling).
        if (liveSpec !== undefined) {
          const preserved: ModeSpec = { ...liveSpec };
          modes[row.id] = preserved;
        }
        continue;
      }
      const minutes = row.minutesTouched
        ? row.minutes.trim() === ''
          ? undefined
          : asFiniteNumber(row.minutes) ?? undefined
        : liveSpec?.authoredMinutes;
      const allowed = row.allowedTouched ? row.allowed : (liveSpec?.allowed ?? false);
      const spec: ModeSpec = { allowed };
      if (minutes !== undefined && Number.isFinite(minutes)) spec.authoredMinutes = minutes;
      if (liveSpec?.multiplier !== undefined) spec.multiplier = liveSpec.multiplier;
      modes[row.id] = spec;
    }
    const terrain = d.terrainTouched
      ? d.terrain === ''
        ? undefined
        : (d.terrain as Terrain)
      : live.terrain;
    const authoredDistance = d.distanceTouched
      ? (d.distance.trim() === '' ? undefined : asFiniteNumber(d.distance) ?? undefined)
      : live.authoredDistance;
    const curve = d.curveTouched
      ? (d.curve.length === 0
          ? undefined
          : { distances: d.curve.map((point) => asFiniteNumber(point) as number) })
      : live.curve;
    const refused = this.graph.commitArcDraft({
      ...live,
      modes,
      ...(terrain !== undefined ? { terrain } : {}),
      ...(authoredDistance !== undefined ? { authoredDistance } : {}),
      ...(curve !== undefined ? { curve } : {}),
    });
    if (refused !== null) {
      this.refusals.set(refused.issues);
      return; // C30: draft intact, panel open, issues rendered
    }
    this.refusals.set([]);
    this.seedDraft(d.id); // re-seed off the committed values — the seed stays honest
  }

  /**
   * F46 delete-and-redo: DIRECT, no confirm dialog (D42's refine/dedup — a
   * redundant parallel arc dies here; the draft state makes accidental
   * removals recoverable by redrawing). A C30 refusal keeps the draft open
   * with the field-precise report; on success the service cleared the edge
   * selection (the removeNode precedent) and the panel closes.
   */
  protected removeArc(): void {
    const d = this.draft();
    if (d === null) return;
    const refused = this.graph.removeArc(d.id);
    if (refused !== null) {
      this.refusals.set(refused.issues);
      return;
    }
    this.refusals.set([]);
  }

  // --- Measure handlers (F44/F20/D44) ----------------------------------------

  protected onMeasureValueInput(event: Event): void {
    this.measureValue.set((event.target as HTMLInputElement).value);
  }

  protected onMeasureUnitInput(event: Event): void {
    this.measureUnit.set((event.target as HTMLInputElement).value);
  }

  protected onMeasureKindChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'distance' || value === 'time') this.measureKind.set(value);
  }

  /**
   * B-123 (F44/D44): apply the measurement THROUGH the service (R2) —
   * `calibrateScale(arcId, value, { label, kind })` with a non-empty word,
   * or unit-absent when the word is empty/whitespace (re-measure in the
   * established unit — D44). A C30 refusal renders field-precise and the
   * state is untouched; on success only the SCALE moved (the arc is not
   * drafted) — the readout renders the seeded label next tick. A negative or
   * zero value PARSES, so Apply stays enabled and the facade refuses — the
   * UI never silences the core's own message.
   */
  protected applyMeasure(): void {
    const sel = this.graph.edgeSelection();
    if (sel === null || !this.canMeasure()) return;
    const value = asFiniteNumber(this.measureValue());
    if (value === null) return;
    const label = this.measureUnit().trim();
    const refused = this.graph.measureArc(
      sel.id,
      value,
      label === '' ? undefined : { label, kind: this.measureKind() },
    );
    if (refused !== null) {
      this.measureRefusals.set(refused.issues);
      return;
    }
    this.measureRefusals.set([]);
  }

  // --- Draft seeding ----------------------------------------------------------

  /** The updateDraft helper — a null-safe draft write (a keystroke racing a
   *  re-seed degrades to a no-op, C32 spirit). */
  private updateDraft(fn: (d: ArcDraft) => ArcDraft): void {
    this.draft.update((d) => (d === null ? d : fn(d)));
  }

  /**
   * Seed a LOCAL draft copy from the live references (C29/R2 — the live
   * MapEdgeData is never bound; arcModesOf answers null for non-library
   * arcs, closing the draft there). Clears the section refusals; the
   * measure kind re-seeds to the established kind so a first measurement
   * touches nothing surprising. Null clears the draft and the panels'
   * editor state.
   */
  private seedDraft(id: string | null): void {
    if (id === null) {
      this.draft.set(null);
      this.refusals.set([]);
      return;
    }
    const rows = this.graph.arcModesOf(id);
    const info = this.graph.arcInfo(id);
    if (rows === null || info === null) {
      this.draft.set(null);
      this.refusals.set([]);
      return;
    }
    this.refusals.set([]);
    const scale = this.scale();
    this.measureKind.set(scale?.unitKind === 'time' ? 'time' : 'distance');
    this.draft.set({
      id, // the arc's KNOWN id — immutable, carried verbatim (D75 PUT)
      modes: rows.map((row) => ({
        id: row.id,
        label: row.label, // the resolver's authored word, seeded once (C23/R1)
        allowed: row.allowed,
        allowedTouched: false,
        minutes: row.authoredMinutes === null ? '' : String(row.authoredMinutes),
        minutesTouched: false,
      })),
      terrain: info.terrain ?? '',
      terrainTouched: false,
      distance: info.authoredDistance === null ? '' : String(info.authoredDistance),
      distanceTouched: false,
      curve: info.curveDistances === null ? [] : info.curveDistances.map((n) => String(n)),
      curveTouched: false,
    });
  }

  /**
   * The reason input's value — a controlled input ([value] + signal write on
   * every input event; R3: the handler READS the DOM event, writes a signal,
   * never writes the DOM). Trimmed to '' on submit: the facade's C30 contract
   * refuses empty reasons, and the UI stays honest by disabling Block while
   * the trimmed value is empty (§6.2 spirit — the facade is the authority).
   */
  protected readonly reason = signal('');

  /** The Block button's honest state: enabled iff the trimmed reason is non-empty. */
  protected readonly canBlock = computed(() => this.reason().trim().length > 0);
}
