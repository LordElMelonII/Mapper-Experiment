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
// B-119 (Q29 panel regime, EXECUTION-PLAN §8 item 3's settled reading): the
// panel is a STANDING panel — MAXIMIZED BY DEFAULT in the editor (the docked
// region form, exactly as landed), with a ≥44px header Maximize/Restore
// toggle (F52): Restore floats it over the stage at its remembered position,
// Maximize returns it to the dock. Floating, the header is the drag handle —
// pointer events unify mouse/touch (D53, one code path); the pointermove
// listener exists only WHILE dragging (attached on dragstart, detached on
// pointerup/pointercancel) and applies the live position as a DIRECT style
// transform — a purely presentational write that never touches a signal and
// never triggers change detection (D2; the B-113 zoom-handler precedent) —
// committing the final clamped position to the service's panelPosition
// signal ONCE on release. The clamp is plain containment in the stage bounds
// below/left of the top-right chrome stack (the header stays reachable — the
// only clamp that must always hold; NOT F46's fenced canvas snapping: no
// targets, no edges, no magnetism). The regime state lives in GraphService
// (frontend viewer memory; the facade gains no command — §9 reserves
// preference persistence for Phase 4's host). All B-117/B-118 behavior is
// untouched: the draft rule, the C30 refusal display, the Connect flow, the
// ≥44px sweep.
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
import { GraphService, type NodeEditIssue } from '../graph/graph.service';

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

// --- B-119 floating-panel geometry -------------------------------------------
// The width/height maxima are MIRRORED by the SCSS in
// :host(.tme-open.tme-floating) — restore clamps against the FLOATING size
// while the panel is still docked (its measured size at that moment is the
// docked region's, not the floater's). The drag itself re-measures the live
// host rect (authoritative).

/** The floating panel's width cap — 18rem in px (SCSS mirror). */
const FLOAT_WIDTH_PX = 288; // 18rem
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
   * the remembered viewport position (null while docked: no transform). The
   * drag's direct style writes land on the same property; the one signal
   * write per drag end re-renders the committed value here.
   */
  protected readonly floatTransform = computed<string | null>(() => {
    if (!this.graph.panelFloating()) return null;
    const pos = this.graph.panelPosition();
    return pos === null ? null : `translate(${pos.x}px, ${pos.y}px)`;
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
      this.seedDraft(selId);
    });
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
      return; // the effect's clear reverts the select — never silently re-parented (D83)
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
      return; // the effect's clear reverts the select — never silently rewired
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
   * → Maximize returns to the docked region form (one signal write); docked →
   * Restore floats the panel at its remembered position, clamped against the
   * CURRENT stage. A never-dragged panel takes the stage's top-left inset as
   * its base — the clamp itself decides whether that sits below the chrome
   * stack. Degrades honestly (C32 spirit): no readable stage floats the
   * panel with the remembered position untouched rather than not at all.
   */
  protected toggleFloat(): void {
    if (this.graph.panelFloating()) {
      this.graph.panelFloating.set(false);
      return;
    }
    const frame = this.readFrame(FLOAT_WIDTH_PX);
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
    if (!this.open() || !this.graph.panelFloating() || this.drag !== null) return;
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
   * viewer's stage, found through its own figure), the top-right chrome
   * stack's union rect (the editor toggle, the selection chip and the save
   * dock; all conditional, all optional), the header height, and the width
   * to clamp against (the live measured width while dragging, the SCSS
   * maximum at Restore time). Null when no stage is reachable (C32 spirit).
   */
  private readFrame(width: number): ClampFrame | null {
    const stage =
      this.host.nativeElement.closest('.tme-viewer')?.querySelector('.tme-stage') ?? null;
    if (stage === null) return null;
    const stageRect = stage.getBoundingClientRect();
    const header = this.host.nativeElement.querySelector('.tme-prop-head');
    const headerHeight =
      header === null ? HEADER_FALLBACK_PX : header.getBoundingClientRect().height;
    let chromeLeft = Number.POSITIVE_INFINITY;
    let chromeBottom = Number.NEGATIVE_INFINITY;
    // B-127 (D86) fallout, lead cleanup: the editor toggle and the save dock
    // migrated onto the editor RAIL (a sibling region outside the stage) —
    // the selection chip is the only stage-overlay chrome left to clear.
    for (const el of stage.querySelectorAll<HTMLElement>('.tme-chip')) {
      if (el.offsetParent === null) continue; // not rendered (conditional chrome)
      const r = el.getBoundingClientRect();
      chromeLeft = Math.min(chromeLeft, r.left);
      chromeBottom = Math.max(chromeBottom, r.bottom);
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

  /**
   * The stage-bounds clamp (B-119/Q29): the panel stays inside the stage, it
   * never covers the top-right chrome stack — while its right edge reaches
   * into the stack's horizontal band it is clamped BELOW the stack; fully
   * left of the band it may rise to the stage top ("below/left of it") — and
   * the header stays reachable (maxY keeps it above the stage bottom: the
   * only clamp that must always hold, so it wins when a tiny stage inverts
   * the band). Plain containment — NOT F46's fenced canvas snapping (no
   * targets, no edges, no magnetism). Pure arithmetic over the snapshot
   * frame — safe at pointermove frequency (D2).
   */
  private clampFloat(x: number, y: number, frame: ClampFrame): { x: number; y: number } {
    const clampedX = Math.min(Math.max(x, frame.stageLeft), frame.stageRight - frame.width);
    const minY =
      clampedX + frame.width > frame.chromeLeft
        ? frame.chromeBottom + CHROME_CLEAR_GAP_PX
        : frame.stageTop;
    const clampedY = Math.min(Math.max(y, minY), frame.stageBottom - frame.headerHeight);
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
   */
  private seedDraft(id: string | null): void {
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
