// src/app/viewer/property-panel.component.ts — PKG B-117 (§5 Phase 3 M1):
// the F40 property panel. With an authored node selected in editor mode it
// edits label, kind, parent, aliases and description, and deletes the node —
// every mutation through GraphService's facade commands (R2): commits are
// `facade.upsertNode` FULL-REPLACE (the id is immutable; a field the draft
// leaves undefined clears), deletes are `facade.removeNode` — direct, no
// confirm dialog (delete-and-redo IS the F46 workflow).
//
// C29/R2 draft rule: the panel binds a LOCAL DRAFT copy of the node's fields
// (plain component state) — never the live MapNodeData (the effective graph
// and the viewer hold the same reference; keystroke writes into it would
// mutate the map pre-command, a reach-around). Commits happen ONLY on the
// draft's close moments — the Done affordance, a selection change, a panel
// close (selection cleared / editor mode exited) — and each commit is ONE
// upsertNode with the WHOLE draft. An untouched draft commits nothing (the
// B-116 no-move precedent: a no-change close must not flag the map dirty).
//
// C30: a refused commit comes back as the collected field-precise issues;
// the panel renders them user-visibly (never console-only) and the draft
// stays open, untouched. On a refusal at a selection change, the draft would
// be orphaned by the navigation — the panel re-points the selection to the
// refused node (the promoteWaypoint re-point precedent) so the author fixes
// or reverts in place; nothing is dropped silently (D10: the user's edit
// survives until they decide).
//
// Kind fence: the kind select offers exactly the six authored kinds — NEVER
// 'waypoint' (D21: the runtime overlay origin is not an editor kind). The
// parent picker lists the container-kind nodes (world/region/city/district)
// of the node's OWN layer plus an explicit none. Further C30 coverage needs
// no extra UI: re-kind to a container with edges, a cyclic parent chain, a
// compound-parent delete with children — the facade refuses field-precisely
// and this panel renders it (§6.2/C27/F48 at the core).
//
// R3: events in → signal writes out → this template; R1: nothing here
// computes a distance, direction, duration, or cost. OnPush + zoneless
// (D2): taps, keystrokes and select changes are discrete — the only writes
// are signal writes, and the seed/commit effect runs per discrete selection
// or editor-mode change. F52/D53: every control ≥ 44px, no hover-only
// affordance, the host hides itself (display:none) whenever it has no open
// draft so the closed panel never occupies a flex slot.
//
// B-118 (D42/F16 quick-connect): the panel is also connect mode's home — the
// Connect button (the edit body's header) is the flow's ONLY entry, legal
// exactly when this panel is open (a library node selected in editor mode).
// Entering FIRST commits any dirty draft (the commit-at-navigation rule —
// a C30 refusal keeps the edit body up with the issues rendered and never
// enters connect mode), so edges and the node draft never interleave
// half-states. While connecting, the banner REPLACES the edit body: the mode
// in words, the pick count, tap feedback and any Done-loop refusal, plus the
// Done/Cancel affordances (all ≥44px, touch-alone, F52) — the canvas taps
// pick, the panel narrates. Done/Cancel and Escape leave the edit body
// showing the committed draft (connect commits edges, never node fields).
//
// B-119 (Q29 panel regime, EXECUTION-PLAN §8 item 3's settled reading),
// re-plumbed by B-133 (D91): the panel is a STANDING panel — MAXIMIZED BY
// DEFAULT in the editor. Under D91 both forms are overlays: maximized is
// the tall surface anchored inside the stage's bottom edge on wide (the old
// flex-region dock is gone — the stage is full-width and every panel
// overlays it; open/close resizes nothing) and the in-stack bottom sheet on
// narrow; the compact FLOATING form (all widths, B-119 verbatim) renders at
// its remembered position. The ≥44px header Maximize/Restore toggle (F52)
// switches the forms: Restore floats at the remembered (stage-clamped)
// position, Maximize returns to the maximized form. Floating, the header is
// the drag handle — pointer events unify mouse/touch (D53, one code path);
// the pointermove listener exists only WHILE dragging (attached on
// dragstart, detached on pointerup/pointercancel) and applies the live
// position as a DIRECT style transform — a purely presentational write that
// never touches a signal and never triggers change detection (D2; the B-113
// zoom-handler precedent) — committing the final clamped position to the
// service's panelPosition signal ONCE on release. The clamp is plain
// containment in the stage bounds below/left of the top chrome band (the
// header stays reachable — the only clamp that must always hold; NOT F46's
// fenced canvas snapping: no targets, no edges, no magnetism). The regime
// state lives in GraphService (frontend viewer memory; the facade gains no
// command — §9 reserves preference persistence for Phase 4's host). All
// B-117/B-118 behavior is untouched: the draft rule, the C30 refusal
// display, the Connect flow, the ≥44px sweep.
//
// B-145 (R-5 name-first property form): the edit body restructures — the
// Identity group (Name/Kind/Description) renders expanded in the open view,
// the five advanced surfaces (Parent, Layer, Opens layer, Aliases, Block
// access) sit behind collapsed-by-default section toggles whose rows carry
// the live summary (C23), and Detach/Delete live in a pinned danger footer
// (red hairline top edge) that never scrolls away. The open is NAME-FIRST:
// the Name input is focused + selected (unqualified across breakpoints —
// the phone soft keyboard is the point). PRESENTATION ONLY: every field,
// testid and commit path is byte-identical (R2 — no command changes), and
// the sections' collapse state is reset exactly when the draft re-seeds for
// a NEW node (a Done re-seed keeps the author's open sections).
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { NodeKind } from '../../core/api';
import { DEFAULT_BLOCK_REASON, GraphService, type NodeEditIssue } from '../graph/graph.service';

/**
 * The six AUTHORED kinds, C23 plain words — 'waypoint' is deliberately
 * absent (D21: the runtime overlay origin is not an editor kind).
 */
const NODE_KIND_OPTIONS: readonly { id: NodeKind; name: string }[] = [
  { id: 'world', name: 'World' },
  { id: 'region', name: 'Region' },
  { id: 'city', name: 'City' },
  { id: 'district', name: 'District' },
  { id: 'location', name: 'Location' },
  { id: 'hub', name: 'Hub' },
];

/**
 * B-131 (D94/F55): the kinds the Blocking section renders for — the kinds
 * that can sit on a route (the LEAF kinds; 'waypoint' never opens this
 * panel — the B-116 precedent). Containers never connect to arcs (F07), so
 * blocking one is a dead control; the facade's C30 gate stays the authority
 * regardless. The draft's kind IS the panel's truth (the same select drives
 * it), so a re-kind drafts the section in and out live.
 */
const BLOCKABLE_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(['location', 'hub']);

// --- B-119 floating-panel geometry -------------------------------------------
// The width/height maxima are MIRRORED by the SCSS in
// :host(.tme-open.tme-floating) — restore clamps against the FLOATING size
// while the panel is still docked (its measured size at that moment is the
// docked region's, not the floater's). The drag itself re-measures the live
// host rect (authoritative).

/** The floating panel's width cap — 18rem in px (SCSS mirror). */
const FLOAT_WIDTH_PX = 288; // 18rem
/**
 * The floating panel's height cap on the WIDE layout — 22rem in px (SCSS
 * mirror, B-136): Restore clamps the WHOLE floating panel against it while the
 * panel is still maximized and unmeasurable (the width mirror's exact
 * precedent). The narrow layout clamps against NARROW_FLOAT_MAX_HEIGHT_PX —
 * see floatCap().
 */
const FLOAT_MAX_HEIGHT_PX = 352; // 22rem
/**
 * B-148r (REPAIRS round, the R-6 inset + R-7 rail-row fallout): the floating
 * panel's height cap on the NARROW layout — 20rem in px (SCSS mirror). The
 * floater must fit between the top chrome band (the chip band's floor at
 * 7rem — the 3.75rem chip top + the 2.75rem 44px target + the clamp's 8px
 * gap) and the stage bottom: the post-R-6/R-7 phone stage measures 445px tall
 * at the D53 viewport (390×844 emulated, dvh 664; was 505 at R-5), so 22rem
 * overhung that stage by 18.5px — the clamp's bands inverted (minY 112 > the
 * whole-panel floor 93) and the parked floater jut past the bottom with a
 * zeroed downward drag range. 20rem fits below the band with a 13px range.
 */
const NARROW_FLOAT_MAX_HEIGHT_PX = 320; // 20rem
/** D81's wide-layout breakpoint — the SCSS split's literal, mirrored by graph.service.ts. */
const WIDE_LAYOUT_QUERY = '(min-width: 700px)';
/**
 * B-148r: the floating height cap per layout at Restore time. The panel is
 * still maximized and unmeasurable then (the width mirror's precedent), so
 * the clamp needs the cap pre-known: 22rem on wide (FLOAT_MAX_HEIGHT_PX —
 * byte-unchanged), 20rem on narrow (NARROW_FLOAT_MAX_HEIGHT_PX — the floater
 * must fit between the chrome band and the stage bottom there). Read live
 * off D81's breakpoint: a narrowed desktop window gets the narrow cap too —
 * correct, that stage is the smallest legitimate one.
 */
const floatCap = (): number =>
  window.matchMedia(WIDE_LAYOUT_QUERY).matches ? FLOAT_MAX_HEIGHT_PX : NARROW_FLOAT_MAX_HEIGHT_PX;
/** Never-dragged default: inset from the stage's top-left (the chrome-rhythm 0.75rem). */
const FLOAT_DEFAULT_INSET_PX = 12;
/** Clear gap below the top-right chrome stack when clamped under it. */
const CHROME_CLEAR_GAP_PX = 8;
/** Header height fallback when the header element is unreadable (C32 spirit). */
const HEADER_FALLBACK_PX = 48;

/**
 * B-119: one gesture's geometry snapshot — every rect is read ONCE (at the
 * Restore tap or the dragstart), so pointermove is pure arithmetic plus one
 * direct style write (D2: no reads that force layout per move beyond the
 * scalars already snapshot, no signal writes, no change detection).
 */
interface ClampFrame {
  readonly stageLeft: number;
  readonly stageTop: number;
  readonly stageRight: number;
  readonly stageBottom: number;
  /** Left edge of the top-right chrome stack's union rect (∞ when absent). */
  readonly chromeLeft: number;
  /** Bottom edge of the same union rect (−∞ when absent). */
  readonly chromeBottom: number;
  readonly width: number;
  readonly headerHeight: number;
  /**
   * The WHOLE panel's measured height (B-136): the bottom clamp arm contains
   * the panel's body too, not just its header. Restore passes the floating
   * form's cap (FLOAT_MAX_HEIGHT_PX) — the panel is unmeasurable at the
   * floating size while still maximized (the width mirror's precedent).
   */
  readonly panelHeight: number;
}

/** B-119: a live drag — the frame plus the pointer's start and the last applied position. */
interface DragFrame extends ClampFrame {
  readonly startClientX: number;
  readonly startClientY: number;
  readonly origX: number;
  readonly origY: number;
  last: { x: number; y: number };
}

/** One editable parent-picker entry (id + authored label, C23). */
interface ParentOption {
  readonly id: string;
  readonly label: string;
}

/**
 * B-145 (R-5 name-first property form): the five advanced sections' names —
 * Parent, Layer, Opens layer, Aliases, Block access — each rendered behind a
 * collapsed-by-default section toggle whose row carries the live summary.
 */
type SectionName = 'parent' | 'layer' | 'portal' | 'aliases' | 'block';

/**
 * The local DRAFT (C29/R2): plain copies of the five panel-editable fields,
 * opened from one library node (id immutable), carrying the seed it was
 * opened from — the no-change guard for the commit points.
 */
interface NodeDraft {
  readonly id: string;
  label: string;
  kind: NodeKind;
  /** null = no parent (the explicit none); a commit sends undefined to clear. */
  parent: string | null;
  aliases: string[];
  description: string;
  /** The seed snapshot — `isDirty` compares against exactly this. */
  readonly seed: {
    label: string;
    kind: NodeKind;
    parent: string | null;
    aliases: string;
    description: string;
  };
}

@Component({
  selector: 'tme-property-panel',
  templateUrl: './property-panel.component.html',
  styleUrl: './property-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.tme-open]': 'open()',
    // B-119: the floating regime's class — the SCSS keys the fixed/float
    // chrome off it (and keeps the closed panel hidden: display:none still
    // wins, the floating rules require .tme-open too).
    '[class.tme-floating]': 'graph.panelFloating()',
    // B-D2 (R29, PROPOSAL-D §2.1): the dock-home chrome class — true exactly
    // while this panel is the context dock's occupant (the service's single
    // source both template homes gate on). The SCSS's :host(.tme-docked ...)
    // compounds stand the maximized/floating forms down inside the dock at
    // float-rule specificity. Inert below 1024px.
    '[class.tme-docked]': 'graph.propertyDockedHome()',
    // B-133 (D91): the maximized overlay form's avoid-the-selection default
    // anchor (bottom-left of the stage when the selection sits on the right
    // half — placement-only, never a pan). The compact floating form ignores
    // it (its remembered transform owns placement).
    '[class.tme-anchor-start]': 'anchorStart()',
    // B-119: the floating panel's rendered position — translate(x, y) of the
    // remembered viewport position. The DRAG bypasses this binding entirely
    // (direct style.transform writes, D2); the binding re-renders the same
    // value when the position signal commits on pointerup.
    '[style.transform]': 'floatTransform()',
    // B-118: Escape exits connect mode (the packet's Escape/Cancel rule) —
    // one discrete keydown, one signal write (D2). A no-op outside it.
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class PropertyPanelComponent {
  protected readonly graph = inject(GraphService);

  /** B-119: the drag writes the host's style directly — the element is needed. */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The kind select's options (the six authored kinds — never 'waypoint'). */
  protected readonly kinds = NODE_KIND_OPTIONS;

  /**
   * The local DRAFT (C29/R2) — null whenever no library node is selected in
   * editor mode (or the selection is a waypoint, which has no editor
   * command — the B-116 precedent; the panel simply does not open for it).
   */
  private readonly draft = signal<NodeDraft | null>(null);

  /**
   * The last commit attempt's field-precise C30 issues (empty when the last
   * attempt committed, was unnecessary, or the draft re-seeded). Rendered
   * user-visibly by the template — never console-only.
   */
  protected readonly refusals = signal<readonly NodeEditIssue[]>([]);

  // --- B-145 (R-5): the advanced sections' collapse state --------------------

  /**
   * B-145 (R-5): the five advanced sections' USER collapse state — collapsed
   * by default, reset when the draft re-seeds for a NEW node (seedDraft; a
   * same-node re-seed after a Done commit keeps the author's open sections —
   * mid-editing Done must not fold their context away). Pure presentation:
   * no field, no commit path, no facade read changes (R2).
   */
  private readonly sections = signal<Record<SectionName, boolean>>({
    parent: false,
    layer: false,
    portal: false,
    aliases: false,
    block: false,
  });

  /** B-145 (R-5): the toggle rows' tap — one signal write (R3, D2). */
  protected toggleSection(name: SectionName): void {
    this.sections.update((s) => ({ ...s, [name]: !s[name] }));
  }

  /**
   * B-145 (R-5, the R-7 design-ahead seam): focus + SELECT the Name input —
   * the name-first open's behavior, exposed as a PUBLIC entry (the
   * rename-nudge packet reuses exactly this open; not an anonymous one-off).
   * A purely presentational imperative write (the B-119 drag-write precedent:
   * focus/selection is DOM chrome, never a signal, never a commit).
   */
  focusName(): void {
    const input = this.host.nativeElement.querySelector<HTMLInputElement>(
      'input[data-testid="tme-node-label-input"]',
    );
    if (input === null) return; // not rendered — degrade, never throw (C32 spirit)
    input.focus();
    input.select();
  }

  /** B-145 (R-5): armed by seedDraft for a new node; fired after the render. */
  private readonly nameFocusArmed = signal(false);

  /**
   * B-145 (R-5): the open path's focus — the input exists only after the
   * @if renders it, so the focus rides an afterRenderEffect (the
   * clearPendingPicks timing precedent): one render shows the seeded input,
   * the next pass focuses + selects it. Unqualified across breakpoints —
   * phone too (the soft keyboard is the point: name it now, D53).
   */
  private readonly focusNameOnOpen = afterRenderEffect(() => {
    if (!this.nameFocusArmed()) return;
    this.nameFocusArmed.set(false);
    this.focusName();
  });

  /**
   * Panel visibility: editor mode with an open draft. The host element
   * mirrors this into a class (see host binding) that the SCSS turns into
   * display:none, and the template keys its @if on the same gate — a closed
   * panel leaves neither a visible section nor an empty host slot.
   */
  protected readonly open = computed(() => this.graph.editorMode() && this.draft() !== null);

  /**
   * The template's render gate: the draft ONLY while the panel is open. A
   * draft that merely survives a hidden state (editor exited — resumable)
   * renders nothing until editor mode returns.
   */
  protected readonly view = computed((): NodeDraft | null => (this.open() ? this.draft() : null));

  // --- B-118 quick-connect (the banner's view state — service-owned, R3) ---

  /** The service's connect mode, mirrored for the template's body switch. */
  protected readonly connecting = this.graph.connectMode;

  // --- B-119 panel regime (Q29/§8 item 3 — the service owns the state, R3) ---

  /** The service's floating flag, mirrored for the header button's label. */
  protected readonly floating = this.graph.panelFloating;

  /**
   * B-119: the floating panel's rendered transform — `translate(x, y)` of
   * the remembered viewport position (null while maximized: the CSS anchor
   * applies). The drag's direct style writes land on the same property; the
   * one signal write per drag end re-renders the committed value here.
   * B-D2: null while the panel is the dock's occupant (a remembered
   * position must not translate the in-flow dock fill; it wins again the
   * moment the panel floats, D10).
   */
  protected readonly floatTransform = computed<string | null>(() => {
    if (this.graph.propertyDockedHome()) return null;
    if (!this.graph.panelFloating()) return null;
    const pos = this.graph.panelPosition();
    return pos === null ? null : `translate(${pos.x}px, ${pos.y}px)`;
  });

  /**
   * B-133 (D91): the maximized overlay form's avoid-the-selection default
   * anchor — an UNPLACED maximized panel anchors away from the selection's
   * rendered anchor (the service's selectionRenderedSide, the rescue clamp's
   * own anchor semantics; placement-only, never a pan). The compact floating
   * form never uses it (a remembered transform is the authority, D10). The
   * selection signals are read first so the computed re-runs exactly when
   * they change (D2).
   */
  protected readonly anchorStart = computed(() => {
    if (this.graph.panelFloating()) return false;
    void this.graph.selection();
    void this.graph.edgeSelection();
    return this.graph.selectionRenderedSide() === 'right';
  });

  /** The drag currently in progress, or null — a plain field (D2: the
   * pointermove handler must never touch Angular state). */
  private drag: DragFrame | null = null;

  /** Tap feedback ("why nothing was picked") and the Done-loop refusal. */
  protected readonly connectFeedback = this.graph.connectFeedback;
  protected readonly connectRefusal = this.graph.connectRefusal;

  /** The connect source's authored label — the banner's "connecting from" line. */
  protected readonly sourceLabel = computed(
    () => this.graph.selection()?.label ?? this.draft()?.label ?? '',
  );

  /**
   * The pick count in words (C23 plain words; a count of picks is UI state,
   * not R1 math).
   */
  protected readonly pickLine = computed((): string => {
    const n = this.graph.connectPicks().size;
    if (n === 0) return 'No places picked yet';
    if (n === 1) return '1 place picked';
    return `${n} places picked`;
  });

  /**
   * The parent picker's options: the container-kind nodes of the draft
   * node's OWN layer (api.ts `parent` contract — "compound parent
   * (district/city) — same layer"), the node itself excluded (a node cannot
   * be its own parent), by label. A seeded parent outside that list (data
   * authored elsewhere) is kept as the first option so the draft round-trips
   * honestly instead of silently re-pointing the parent. Deeper cycle risks
   * (choosing a descendant) are the facade's C30 refusal, rendered — the
   * core is the authority (§6.2).
   * B-126 (D83/C24): editorRevision is a dependency — a Layer-dropdown move
   * swaps the node object in place (`map.nodes[i] = fresh`, the D75 seam)
   * and the picker must follow the node to its NEW layer's containers.
   */
  protected readonly parentOptions = computed((): readonly ParentOption[] => {
    void this.graph.editorRevision(); // dependency: an in-place layer move re-reads (C24)
    const d = this.draft();
    if (d === null) return [];
    const layer = this.graph.nodeDataById(d.id)?.layer;
    if (layer === undefined) return [];
    const options = this.graph
      .containerNodesOnLayer(layer)
      .filter((option) => option.id !== d.id);
    if (d.parent !== null && !options.some((option) => option.id === d.parent)) {
      return [{ id: d.parent, label: this.graph.labelOf(d.parent) }, ...options];
    }
    return options;
  });

  /**
   * B-145 (R-5): the Parent toggle's summary — the authored parent's label
   * (parentOptions already keeps an off-list seeded parent honest), or the
   * none word. C23: authored name or UI chrome, never an id.
   */
  protected readonly parentSummary = computed((): string => {
    const d = this.draft();
    if (d === null || d.parent === null) return 'None';
    return this.parentOptions().find((option) => option.id === d.parent)?.label ?? 'None';
  });

  // --- B-126 (D83): the Layer dropdown — the ONE way to move a node ---------

  /**
   * B-126 (D83/C24): the LIVE node's layer id — the dropdown's truth. The
   * facade's setNodeLayer swaps a FRESH node object in place (the D75
   * seam), so editorRevision is the recompute dependency (the scaleNow
   * precedent); the value itself is the live reference's field (R4).
   */
  protected readonly nodeLayerId = computed((): string | null => {
    void this.graph.editorRevision(); // dependency: an in-place layer move re-reads (C24)
    const d = this.draft();
    if (d === null) return null;
    return this.graph.nodeDataById(d.id)?.layer ?? null;
  });

  // --- B-128 (D85/F02): the "Opens layer" dropdown — the portal wiring ------

  /**
   * B-128 (D85/C24): the LIVE node's portal target id — the dropdown's
   * truth (null = unwired ⇒ the None option). setPortal swaps a FRESH node
   * object in place (the D75 seam), so editorRevision is the recompute
   * dependency (the nodeLayerId precedent); the value itself is the live
   * reference's field (R4).
   */
  protected readonly nodePortalTarget = computed((): string | null => {
    void this.graph.editorRevision(); // dependency: an in-place wiring re-reads (C24)
    const d = this.draft();
    if (d === null) return null;
    return this.graph.nodeDataById(d.id)?.portal ?? null;
  });

  /**
   * B-128 (D85): the dropdown's options — every OTHER layer by authored
   * NAME (C23), the live node's own layer excluded (a portal cannot target
   * its own layer — the validator's rule, so the option simply never
   * renders; the facade stays the authority for everything the type system
   * cannot see). Re-reads on editorRevision like every live read (C24).
   */
  protected readonly portalOptions = computed((): readonly { id: string; name: string }[] => {
    void this.graph.editorRevision(); // dependency: an in-place wiring/move re-reads (C24)
    const d = this.draft();
    if (d === null) return [];
    const ownLayer = this.graph.nodeDataById(d.id)?.layer;
    return this.graph.layerNames().filter((layer) => layer.id !== ownLayer);
  });

  /**
   * B-126 (D83): the DOM select's PENDING pick — set by the change handler
   * before the command runs, cleared by the afterRenderEffect below after
   * the render that showed it. WHY: a refused move must REVERT the select
   * to the live layer ("never silently re-parented", D83), but Angular
   * skips unchanged property writes AND a plain component effect runs
   * BEFORE the view refresh (found live by layer-manager.e2e-spec: the
   * clear coalesced with the pick into a no-op render) — so the revert
   * needs one RENDER where the binding equals the pick (this signal)
   * followed by one where it equals the live layer again.
   * afterRenderEffect runs after the view has rendered, giving exactly
   * those two passes. On a SUCCESSFUL move the live layer IS the pick, so
   * the clear is invisible. Two stable passes, zero imperative DOM writes.
   * B-128 (D85): the SAME mechanism generalizes to the "Opens layer"
   * dropdown's pendingPortal — a refused wiring reverts the select to the
   * live `portal` (never silently rewired); the two pending signals are
   * independent, so one reverting never disturbs the other.
   */
  private readonly pendingLayer = signal<string | null>(null);

  /** B-128 (D85): the portal select's PENDING pick — pendingLayer's twin (same two-pass revert). */
  private readonly pendingPortal = signal<string | null>(null);

  /** The select's rendered value: the pending pick, else the live layer. */
  protected readonly layerSelectValue = computed(
    () => this.pendingLayer() ?? this.nodeLayerId() ?? '',
  );

  /** B-128 (D85): the portal select's rendered value: the pending pick, else the live wiring. */
  protected readonly portalSelectValue = computed(
    () => this.pendingPortal() ?? this.nodePortalTarget() ?? '',
  );

  // --- B-145 (R-5): the collapsed toggle rows' summaries ----------------------
  // Reads of the seams the template already binds (nodeLayerId/layerNames/
  // nodePortalTarget/parentOptions/nodeBlockReason/the draft) — no new facade
  // reads, no copies of state the signals already carry (R4). C23 throughout:
  // authored names + UI chrome words; the alias count is the panel's own row
  // count (the B-118 pickLine precedent — not R1 math).

  /** The Layer toggle's summary: the LIVE node's layer NAME (C23; follows a move). */
  protected readonly layerSummary = computed((): string => {
    const id = this.nodeLayerId();
    return this.graph.layerNames().find((layer) => layer.id === id)?.name ?? 'None';
  });

  /** The Opens-layer toggle's summary: the wired target's NAME, or the none word. */
  protected readonly portalSummary = computed((): string => {
    const target = this.nodePortalTarget();
    if (target === null) return 'None';
    return this.graph.layerNames().find((layer) => layer.id === target)?.name ?? 'None';
  });

  /** The Aliases toggle's summary: the draft's row count in the UI's own voice. */
  protected readonly aliasesSummary = computed((): string => {
    const n = this.draft()?.aliases.length ?? 0;
    if (n === 0) return 'No aliases yet';
    return n === 1 ? '1 alias' : `${n} aliases`;
  });

  /**
   * B-126 (D83), generalized by B-128 (D85): the revert pass — clears the
   * pending picks after the render that showed them (see pendingLayer).
   * Writes a signal it reads, so it re-runs after the SECOND render and
   * finds null — a stable two-pass settle.
   */
  private readonly clearPendingPicks = afterRenderEffect(() => {
    if (this.pendingLayer() !== null) this.pendingLayer.set(null);
    if (this.pendingPortal() !== null) this.pendingPortal.set(null);
  });

  constructor() {
    // The draft lifecycle (C29 draft-then-commit): keyed on the selection
    // and the editor mode — both change only through discrete taps (D2).
    // Switching selection or closing the panel COMMITS a dirty draft first
    // (one upsertNode, whole draft); an untouched draft just re-seeds.
    effect(() => {
      const editor = this.graph.editorMode();
      const selId = this.graph.selection()?.id ?? null;
      const current = this.draft();
      if (!editor) {
        // Editor exit is a panel close: commit-if-dirty. On a C30 refusal
        // the draft survives (hidden) and resumes when editor mode returns
        // with the same selection — the refusal was displayed when it
        // happened; nothing is dropped silently.
        if (current !== null && this.isDirty(current)) this.commitDraft(current);
        return;
      }
      // B-131: leaving a node (selection change / editor re-entry) clears
      // the block-catch refusal with it — the stale message must not follow
      // another node (the arc panel's clearArcBlockRefusal discipline,
      // B-123).
      this.graph.clearNodeBlockRefusal();
      if (current !== null && current.id === selId) return; // same node — keystrokes never re-seed
      if (current !== null && this.isDirty(current)) {
        const committed = this.commitDraft(current);
        if (!committed) {
          // C30 refusal: the draft stays open; undo the navigation that
          // would orphan it (the promoteWaypoint re-point precedent) so the
          // author fixes or reverts in place (D10 — their edit survives).
          this.graph.selection.set({ id: current.id, label: current.label });
          return;
        }
      }
      // B-D3 (R29, PROPOSAL-D §3.1): the placement moment — while the naming
      // popover stands over the selection (or stays LATCHED over it after a
      // resolution, commit or cancel alike) the panel NEVER seeds for that
      // node: the draft stays null ⇒ `open` stays false ⇒ the dock's sticky
      // rule never engages for a placement. The skip sits BELOW the commit
      // arm — a draft displaced by a placement commits first (the
      // commit-at-navigation rule above is untouched), then yields to the
      // popover. The service's guard effect clears the latch the moment the
      // selection leaves the node, so a deselect + reselect opens the panel
      // exactly as today for an existing node (the preserved path; the R-5
      // name-first arm rides that seed unchanged).
      if (
        selId !== null &&
        (this.graph.inlineNamingId() === selId || this.graph.inlineNamingLatch() === selId)
      ) {
        this.draft.set(null);
        return;
      }
      this.seedDraft(selId);
    });

    // B-D2 (R29, PROPOSAL-D §2.1): the panel PUBLISHES its open computed —
    // the service's propertyPanelOpen signal (the dock's open history reads
    // it; the panelFloating-class pattern: the panel owns the computed, the
    // service holds the mirror). One signal write per discrete state flip
    // (D2); nothing below 1024px reads the consumer side.
    effect(() => this.graph.setPropertyPanelOpen(this.open()));
  }

  // --- Template event handlers (R3: DOM read → signal write, never DOM write) ---

  protected onLabelInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draft.update((d) => (d === null ? d : { ...d, label: value }));
  }

  protected onKindChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    // Only the six offered kinds pass — 'waypoint' is unreachable by
    // construction (D21) and a DOM lie must not draft one either.
    if (!NODE_KIND_OPTIONS.some((option) => option.id === value)) return;
    this.draft.update((d) => (d === null ? d : { ...d, kind: value as NodeKind }));
  }

  protected onParentChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.draft.update((d) => (d === null ? d : { ...d, parent: value === '' ? null : value }));
  }

  protected onDescriptionInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.draft.update((d) => (d === null ? d : { ...d, description: value }));
  }

  protected onAliasInput(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draft.update((d) =>
      d === null ? d : { ...d, aliases: d.aliases.map((alias, i) => (i === index ? value : alias)) },
    );
  }

  protected addAlias(): void {
    this.draft.update((d) => (d === null ? d : { ...d, aliases: [...d.aliases, ''] }));
  }

  protected removeAlias(index: number): void {
    this.draft.update((d) =>
      d === null ? d : { ...d, aliases: d.aliases.filter((_, i) => i !== index) },
    );
  }

  /**
   * The Done affordance: commit-if-dirty (one upsertNode, whole draft). An
   * untouched draft is a no-op that also clears a stale refusal display —
   * reverting the fields back to the saved values IS the recovery.
   */
  protected done(): void {
    const d = this.draft();
    if (d === null) return;
    if (!this.isDirty(d)) {
      this.refusals.set([]);
      return;
    }
    this.commitDraft(d);
  }

  /**
   * F46 delete-and-redo: direct, no confirm dialog. A C30 refusal (e.g. a
   * compound parent whose children would dangle) keeps the draft open with
   * the field-precise report; on success the service cleared the selection
   * (the removeUserNode precedent) and the effect closes the panel.
   */
  protected remove(): void {
    const d = this.draft();
    if (d === null) return;
    const refused = this.graph.removeNode(d.id);
    if (refused !== null) {
      this.refusals.set(refused.issues);
      return;
    }
    this.refusals.set([]);
  }

  // --- B-131 (D94/F55): the Blocking section --------------------------------

  /**
   * The Blocking section renders for BLOCKABLE kinds only (see
   * BLOCKABLE_KINDS): the draft's kind is the panel's truth — the same
   * select drives it, so a re-kind drafts the section in and out live.
   */
  protected readonly blockSectionOpen = computed((): boolean => {
    const d = this.draft();
    return d !== null && BLOCKABLE_KINDS.has(d.kind);
  });

  /**
   * The selected node's live block reason — the overlay's C24 reference read
   * through the service (R4, verbatim, never a copy), rendered by the
   * blocked row. graphRevision is a dependency: a block/lift re-reads
   * without the selection moving (the arc panel's arcInfo precedent,
   * B-106 ruling 4).
   */
  protected readonly nodeBlockReason = computed((): string | null => {
    void this.graph.graphRevision(); // dependency: a block/lift re-reads (R4)
    const d = this.draft();
    return d === null ? null : this.graph.nodeBlockReason(d.id);
  });

  /**
   * B-145 (R-5): the Block toggle's summary — the live block state in words
   * (the reason verbatim, C2/D20's mirror; 'Not blocked' is the off word —
   * deliberately NOT 'Open', which the panel already spends on "Opens layer").
   */
  protected readonly blockSummary = computed((): string => {
    const reason = this.nodeBlockReason();
    return reason === null ? 'Not blocked' : `Blocked — ${reason}`;
  });

  /**
   * The reason input's value — a controlled input ([value] + signal write on
   * every input event; R3). NOT a draft field: the block is a discrete
   * intent that commits immediately (the setNodeLayer/setPortal precedent).
   * The one-tap applies the TRIMMED value when non-empty, else the ONE
   * shared default (D94's 'Closed') — one mental model with the arc panel's
   * one-tap.
   */
  protected readonly blockReason = signal('');

  /** R3: the input event handler — a DOM read, then the signal write. */
  protected onBlockReasonInput(event: Event): void {
    this.blockReason.set((event.target as HTMLInputElement).value);
  }

  /**
   * F55/D94: the ONE-TAP "Block access" — blocks the NODE itself (not its
   * arcs) with the trimmed input when non-empty, else DEFAULT_BLOCK_REASON:
   * one tap from a pristine input applies 'Closed', no typing required; the
   * reason input stays ADJACENT for immediate refinement (type the real
   * reason, tap again — adds-or-restates, the facade contract). A C30
   * refusal (an UNSAVED placed node — the A-018 saved-plane gate) is caught
   * by the service and rendered field-precise below; the input is consumed
   * only on success (the blockArc pattern).
   */
  protected blockNode(): void {
    const d = this.draft();
    if (d === null) return;
    const reason = this.blockReason().trim();
    const blocked = this.graph.blockNode(d.id, reason.length > 0 ? reason : DEFAULT_BLOCK_REASON);
    if (blocked) this.blockReason.set('');
  }

  /**
   * B-131 (D94/C34): lift the node block through the service (R2) —
   * overlay-ONLY state, so the lift is unconditional and the row, the
   * listing and the marker vanish via the rebuild.
   */
  protected liftNodeBlock(): void {
    const d = this.draft();
    if (d === null) return;
    this.graph.liftNodeBlock(d.id);
  }

  // --- B-126 (D83/F54): the Layer dropdown + the Detach tool -------------------

  /**
   * B-126 (D83): the Layer dropdown's change — a pick is a COMPLETE
   * discrete intent (the Connect-button precedent), NOT a draft field: the
   * wrapper fires immediately. The pending-pick signal is set FIRST so the
   * refused path can revert the select (see pendingLayer); a C30 refusal
   * (a stranding compound relation — parent or child left across layers —
   * or a portal rule) renders in the panel's existing refusals area with
   * the draft untouched, and the select reverts to the live layer on the
   * effect's next pass. On success the refusals clear and the panel's live
   * reads (the dropdown, the parent picker) follow the moved node via
   * their editorRevision dependencies (C24). The five draft fields and
   * their commit path are untouched by this handler.
   */
  protected onLayerChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const d = this.draft();
    if (d === null || value === this.nodeLayerId()) return; // a no-change pick is not an edit (B-116)
    this.pendingLayer.set(value);
    const refused = this.graph.setNodeLayer(d.id, value);
    if (refused !== null) {
      this.refusals.set(refused.issues);
      // B-133 review fix (D91): the afterRenderEffect's self-clear stopped
      // landing its second render deterministically under the overlay regime
      // (the D83 revert assert flapped) — sequence it explicitly: the pick's
      // render paints, one frame later the clear drives the revert render.
      // The effect's own clear stays (idempotent — the first pass wins).
      requestAnimationFrame(() => this.pendingLayer.set(null));
      return; // the revert — never silently re-parented (D83)
    }
    this.refusals.set([]);
  }

  /**
   * B-128 (D85/F02): the "Opens layer" dropdown's change — a pick is a
   * COMPLETE discrete intent (the setNodeLayer precedent), NOT a draft
   * field: the wrapper fires immediately. The pending-pick signal is set
   * FIRST so the refused path can revert the select (the two-pass revert —
   * see pendingPortal); a C30 refusal (an unknown target, the node's own
   * layer, or a second node onto an already-wired target — all the
   * validator's field-precise portal rules) renders in the panel's existing
   * refusals area with the draft untouched, and the select reverts to the
   * live wiring on the effect's next pass. On success the refusals clear
   * and the rebuild makes the badge appear/vanish (the service owns that).
   * The five draft fields and their commit path are untouched by this
   * handler.
   */
  protected onPortalChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value; // '' = None (unwire)
    const d = this.draft();
    if (d === null) return;
    const target = value === '' ? null : value;
    if (target === this.nodePortalTarget()) return; // a no-change pick is not an edit (B-116 precedent)
    this.pendingPortal.set(value);
    const refused = this.graph.setPortal(d.id, target);
    if (refused !== null) {
      this.refusals.set(refused.issues);
      // B-133 review fix (D91): the onLayerChange twin — the explicit frame-
      // sequenced clear (see onLayerChange; the D85 revert assert shares the
      // mechanism and the regime).
      requestAnimationFrame(() => this.pendingPortal.set(null));
      return; // the revert — never silently rewired
    }
    this.refusals.set([]);
  }

  /**
   * B-126 (D82/F54): the standing Detach tool — every arc incident to the
   * drafted node dies in both planes; the node itself survives untouched,
   * DIRECT, no confirm (the F46 removeNode precedent: delete-and-redo IS
   * the workflow; the cascade confirm exists in the SHEET because a LAYER
   * dies, not because arcs do). A C30 refusal renders in the refusals
   * area; on success the node stays selected (the service never touches
   * the selection), its arcs vanish from the projection, and it does NOT
   * light the draft hue — the service never records the node at the B-121
   * seam because detach is not a node edit.
   */
  protected detach(): void {
    const d = this.draft();
    if (d === null) return;
    const refused = this.graph.detachNode(d.id);
    if (refused !== null) {
      this.refusals.set(refused.issues);
      return;
    }
    this.refusals.set([]);
  }

  // --- B-118 quick-connect handlers ------------------------------------------

  /**
   * The Connect button: enter quick-connect for the drafted node — but ONLY
   * after the draft rule is satisfied (the packet: entering connect mode must
   * first COMMIT or CANCEL any open node draft exactly as a selection change
   * would, so edges and the node draft never interleave half-states). A dirty
   * draft commits first (one whole-draft upsertNode); a C30 refusal keeps the
   * edit body up with the issues rendered and never enters connect mode (D10
   * — the author fixes or reverts first). An untouched draft passes through.
   */
  protected startConnect(): void {
    const d = this.draft();
    if (d === null) return;
    if (this.isDirty(d) && !this.commitDraft(d)) return; // refusal rendered, draft intact
    this.graph.enterConnectMode();
  }

  /** B-118: Done — commit one arc per picked target (the service owns the loop). */
  protected confirmConnect(): void {
    this.graph.doneConnect();
  }

  /** B-118: Cancel — discard the whole set, commit nothing. */
  protected abortConnect(): void {
    this.graph.cancelConnect();
  }

  /** B-118: Escape exits connect mode while connecting (no-op otherwise). */
  protected onEscape(): void {
    if (this.graph.connectMode()) this.graph.cancelConnect();
  }

  // --- B-119 panel regime: Maximize/Restore + header drag (Q29/§8 item 3) -----

  /**
   * The header's regime toggle (the template's only write path, R3): floating
   * → Maximize returns to the maximized overlay form (one signal write);
   * maximized → Restore floats the compact panel at its remembered position,
   * clamped against the CURRENT stage. A never-dragged panel takes the
   * stage's top-left inset as its base — the clamp itself decides whether
   * that sits below the chrome band. Degrades honestly (C32 spirit): no
   * readable stage floats the panel with the remembered position untouched
   * rather than not at all.
   */
  protected toggleFloat(): void {
    if (this.graph.panelFloating()) {
      this.graph.panelFloating.set(false);
      return;
    }
    const frame = this.readFrame(FLOAT_WIDTH_PX, floatCap());
    const remembered = this.graph.panelPosition();
    if (frame !== null) {
      const base =
        remembered ?? {
          x: frame.stageLeft + FLOAT_DEFAULT_INSET_PX,
          y: frame.stageTop + FLOAT_DEFAULT_INSET_PX,
        };
      this.graph.panelPosition.set(this.clampFloat(base.x, base.y, frame));
    }
    this.graph.panelFloating.set(true);
  }

  /**
   * B-D2 (R29, PROPOSAL-D §2.1): the floater's Dock affordance — the
   * float-side half of the dock↔float handoff (the dock header's Float is
   * the other). One service write (R3); shell-gated in the template.
   */
  protected dock(): void {
    this.graph.setPanelDocked('property', true);
  }

  /**
   * Dragstart on the panel header — the floating panel's handle (docked, the
   * header is plain chrome and this returns immediately). A pointer on one of
   * the header's buttons never starts a drag (the taps keep working); mouse
   * and touch share this one pointer-event path (D53). Binding lifetime per
   * the packet/D2: the high-frequency pointermove listener is attached HERE
   * and detached on release — it exists only WHILE dragging.
   */
  protected onDragStart(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button') !== null) return; // buttons tap, they don't drag
    if (!event.isPrimary) return; // one pointer owns the drag
    // The FLOATING form is the drag surface (both layouts — the B-119
    // regime verbatim); the maximized form's header is plain chrome (the
    // old dock's semantics: no drag until Restore).
    if (!this.open() || !this.graph.panelFloating() || this.drag !== null) return;
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
    event.preventDefault(); // the handle drags: no text selection, no scroll fallback
    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerup', this.onDragEnd);
    window.addEventListener('pointercancel', this.onDragEnd);
  }

  /**
   * HIGH-FREQUENCY (D2): reads only the frame's snapshot scalars and writes
   * ONLY the host's style transform — a purely presentational write, never a
   * signal, never change detection (the B-113 zoom-handler precedent). The
   * signal commit happens once, in onDragEnd.
   */
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

  /**
   * Discrete release (pointerup OR pointercancel — a cancelled gesture still
   * leaves the direct style write applied, so the commit happens either way
   * and the binding can never desync from the element): detach the listeners
   * first, then commit the final clamped position to the service ONCE.
   */
  private readonly onDragEnd = (): void => {
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragEnd);
    window.removeEventListener('pointercancel', this.onDragEnd);
    const drag = this.drag;
    this.drag = null;
    if (drag === null) return;
    this.graph.panelPosition.set(drag.last); // one signal write → the binding re-renders it
  };

  /**
   * Snapshot the clamp geometry — the stage rect (the panel floats over the
   * viewer's stage), the top chrome band's union rect (the selection chip
   * and, since B-133, the breadcrumb bar — both conditional, both optional;
   * B-127 fallout note: the editor toggle and the save dock migrated onto
   * the editor RAIL, a sibling outside the stage, so the band is
   * stage-overlay chrome only), the header height, the WHOLE panel height
   * (B-136: the bottom clamp arm contains the body too), and the width to
   * clamp against (the live measured width while dragging, the SCSS maximum
   * at Restore time). `height` overrides the measured panel height where the
   * floating size is unmeasurable (Restore clamps against the FLOATING cap
   * while still maximized — the width mirror's precedent). Null when no
   * stage is reachable (C32 spirit).
   */
  private readFrame(width: number, height?: number): ClampFrame | null {
    const stage =
      this.host.nativeElement.closest('.tme-viewer')?.querySelector('.tme-stage') ?? null;
    if (stage === null) return null;
    const stageRect = stage.getBoundingClientRect();
    const header = this.host.nativeElement.querySelector('.tme-prop-head');
    const headerHeight =
      header === null ? HEADER_FALLBACK_PX : header.getBoundingClientRect().height;
    let chromeLeft = Number.POSITIVE_INFINITY;
    let chromeBottom = Number.NEGATIVE_INFINITY;
    for (const selector of ['.tme-chip', '.tme-breadcrumb']) {
      for (const el of stage.querySelectorAll<HTMLElement>(selector)) {
        if (el.offsetParent === null) continue; // not rendered (conditional chrome)
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
   * The stage-bounds clamp (B-119/Q29): the panel stays inside the stage, it
   * never covers the top-right chrome stack — while its right edge reaches
   * into the stack's horizontal band it is clamped BELOW the stack; fully
   * left of the band it may rise to the stage top ("below/left of it").
   * B-136 (repair 1): the bottom arm contains the WHOLE panel (the old arm
   * guarded only the header — the body hung past the stage's bottom edge,
   * probe-proven at 258px on both layouts); when a tiny stage inverts the
   * bands the header-reachable clamp still wins (the only clamp that must
   * always hold, so it caps maxY from above). Plain containment — NOT F46's
   * fenced canvas snapping (no targets, no edges, no magnetism). Pure
   * arithmetic over the snapshot frame — safe at pointermove frequency (D2).
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

  // --- Draft mechanics -------------------------------------------------------

  /** The no-change guard: an untouched draft commits nothing (B-116 no-move precedent). */
  private isDirty(d: NodeDraft): boolean {
    return (
      d.label !== d.seed.label ||
      d.kind !== d.seed.kind ||
      d.parent !== d.seed.parent ||
      d.description !== d.seed.description ||
      d.aliases.join('\n') !== d.seed.aliases
    );
  }

  /**
   * Commit the whole draft through ONE facade.upsertNode full-replace (R2).
   * The panel owns exactly its five fields; id/layer/position/origin/
   * transit are read fresh off the LIVE node at commit time — a drag that
   * persisted a new position after this draft was seeded must never be
   * reverted by a label commit. Empty optional fields are sent as undefined
   * (D75 PUT semantics: a field the draft leaves undefined clears). Returns
   * true when committed (or nothing was left to save), false on a C30
   * refusal — the draft stays open, untouched, and the issues are displayed.
   */
  private commitDraft(d: NodeDraft): boolean {
    const live = this.graph.nodeDataById(d.id);
    if (live === null) {
      // The node is gone from the library plane — nothing to save, no
      // command to issue; drop the draft (near-unreachable degrade, C32).
      this.refusals.set([]);
      this.draft.set(null);
      return true;
    }
    const refused = this.graph.upsertNode({
      ...live,
      label: d.label,
      kind: d.kind,
      parent: d.parent ?? undefined,
      aliases: d.aliases.length > 0 ? [...d.aliases] : undefined,
      description: d.description.length > 0 ? d.description : undefined,
    });
    if (refused !== null) {
      this.refusals.set(refused.issues);
      return false; // C30: draft intact, panel open, issues rendered
    }
    this.refusals.set([]);
    this.seedDraft(d.id); // re-seed off the committed values — the seed stays honest
    return true;
  }

  /**
   * Seed a LOCAL draft copy from the live node (C29/R2 — the live MapNodeData
   * is never bound). A non-library selection (waypoint — no editor command,
   * B-116 precedent) or no selection closes the draft and the panel.
   * B-145 (R-5): a NEW node's seed is the panel's OPEN moment — the advanced
   * sections reset collapsed and the name-first focus arms (fired by the
   * afterRenderEffect once the input renders). A same-node re-seed (the Done
   * commit's honest re-seed) keeps the author's open sections and focuses
   * nothing — the panel never closed.
   */
  private seedDraft(id: string | null): void {
    const switched = (this.draft()?.id ?? null) !== id;
    if (switched) {
      this.sections.set({ parent: false, layer: false, portal: false, aliases: false, block: false });
      this.nameFocusArmed.set(id !== null);
    }
    if (id === null) {
      this.draft.set(null);
      this.refusals.set([]);
      return;
    }
    const node = this.graph.nodeDataById(id);
    if (node === null) {
      this.draft.set(null);
      this.refusals.set([]);
      return;
    }
    this.refusals.set([]);
    this.draft.set({
      id: node.id,
      label: node.label,
      kind: node.kind,
      parent: node.parent ?? null,
      aliases: node.aliases ? [...node.aliases] : [],
      description: node.description ?? '',
      seed: {
        label: node.label,
        kind: node.kind,
        parent: node.parent ?? null,
        aliases: (node.aliases ?? []).join('\n'),
        description: node.description ?? '',
      },
    });
  }
}
