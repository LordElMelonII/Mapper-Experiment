// src/app/viewer/route-panel.component.ts — PKG B-105: the M2 route sidebar.
// Tap a node → this panel renders the core's route from the pin to it: per-leg
// detail (C18), the total with its ONE D72 unit label (C15), the overlay
// travel-mode preference switch (F32/D19), and the pin-incident blocked-arc
// reasons (C2/C19 — the M1 deferral, discharged). Extended by B-110 (ruling
// 1): when the selection is a PLACED waypoint, a Waypoint management section
// renders ABOVE the route legs — a single-line name input + Promote (C30/D21
// honesty: disabled while the trimmed input is empty, the B-106 pattern) and
// Remove (D21/§6.2), with the route-to-waypoint rows unchanged below (D58:
// waypoints are ordinary route targets). Library-node selections and
// no-selection render no section (removal of library nodes is Phase 3 editor
// business; the facade itself refuses, C30). Extended by B-114 (§5 M4, D53):
// below the 700px breakpoint the panel presents as a bottom SHEET — an
// always-visible rail (F52 ≥44px) toggling its body — the narrow-viewport
// FORM of this same panel, never a second one.
// B-133 (D91): the panel joins the generalized floating regime — on WIDE it
// AUTO-FLOATS while it has content (a route target selected, or the blocked
// listings of the snapshot projection; the service's routePanelOpen
// linkedSignal owns the rule) and the rail's Route toggle summons it EMPTY
// (a route-count-free empty state — the hint — renders inside; a user needs
// the panel even with nothing to show). The wide surface is the B-119
// property-panel regime generalized: a position:fixed floater with a
// remembered position per panel kind (routePanelPosition — written ONCE per
// drag end; the drag applies the live position as a DIRECT style transform,
// D2), a Maximize/Restore toggle, and best-effort avoid-the-selection
// placement (an unplaced floater anchors on the side away from the
// selection — placement-only, NEVER a pan). Narrow is unchanged: the sheet
// flow, its rail and the expand state below are byte-verbatim.
// Every number and reason string is a core projection rendered verbatim (R1);
// the component mutates nothing itself — the mode switch and the waypoint
// actions go through GraphService's facade commands (R2), and state flows one
// way: events in → signals out → this template (R3). OnPush + zoneless (D2):
// only discrete user actions (taps, keystrokes) write signals; the route is a
// computed in the service, so canvas drags recompute nothing.
import { Component, ElementRef, computed, inject, linkedSignal, signal } from '@angular/core';
import type { SnapshotBlockedNode, SnapshotRoute, TravelMode } from '../../core/api';
import { GraphService } from '../graph/graph.service';

// --- B-133 (D91) floating-surface geometry (the B-119 mirrors) ----------------

/** The floating panel's width cap — 18rem in px (SCSS mirror). */
/** Header height fallback when the header element is unreadable (C32 spirit). */
const HEADER_FALLBACK_PX = 48;
/** Clear gap below the top chrome band when clamped under it. */
const CHROME_CLEAR_GAP_PX = 8;

/**
 * B-133: one gesture's geometry snapshot — every rect is read ONCE (at the
 * dragstart), so pointermove is pure arithmetic plus one direct style write
 * (D2: no signal writes, no change detection). The B-119 ClampFrame, with
 * the top chrome band widened to the breadcrumb + chip union (both are
 * stage-overlay interactive chrome the floater must never cover).
 */
interface ClampFrame {
  readonly stageLeft: number;
  readonly stageTop: number;
  readonly stageRight: number;
  readonly stageBottom: number;
  /** Left edge of the top chrome band's union rect (∞ when absent). */
  readonly chromeLeft: number;
  /** Bottom edge of the same union rect (−∞ when absent). */
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

@Component({
  selector: 'tme-route-panel',
  templateUrl: './route-panel.component.html',
  styleUrl: './route-panel.component.scss',
  host: {
    // B-133 (D91): the wide floater's regime classes — the SCSS keys the
    // fixed/anchor chrome off them (narrow ignores every one of them: the
    // media query owns the two worlds). tme-float-open gates the wide
    // visibility (the auto-float + empty-summon state, service-owned);
    // tme-anchor-start is the avoid-the-selection default anchor (bottom-
    // left of the stage, clearing --tme-rail-w); tme-placed switches the
    // anchor off once a remembered position (transform) exists.
    '[class.tme-float-open]': 'graph.routePanelOpen()',
    '[class.tme-maximized]': 'maximized()',
    '[class.tme-anchor-start]': 'anchorStart()',
    '[class.tme-placed]': 'floatTransform() !== null',
    // B-133: the floating panel's rendered position — translate(x, y) of the
    // remembered viewport position. The DRAG bypasses this binding entirely
    // (direct style.transform writes, D2); the binding re-renders the same
    // value when the position signal commits on pointerup.
    '[style.transform]': 'floatTransform()',
  },
})
export class RoutePanelComponent {
  protected readonly graph = inject(GraphService);

  /** B-133: the drag writes the host's style directly — the element is needed. */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * B-133 (D91): the wide floater's maximize state — component-local VIEW
   * chrome (the B-114 sheet-state precedent): compact floater by default,
   * Maximize lifts the height cap to the near-full-stage overlay form, and
   * Restore returns the cap. Positioning is shared by both forms.
   */
  protected readonly maximized = signal(false);

  // --- B-114 (ruling 2): the narrow sheet state (unchanged) -------------------

  /**
   * B-114 (ruling 2): the narrow-viewport sheet state — component-local VIEW
   * chrome. A linkedSignal keyed on the selection (the node id, else the edge
   * id, else null): collapsed when idle (source null), auto-EXPANDS on every
   * new node/edge selection — a map tap means the user wants the panel, so
   * the M2 tap-to-see-route flow keeps its zero-extra-taps shape — and
   * collapses again when the selection clears (chip dismiss / background tap).
   * The rail's toggle writes between source changes (a discrete gesture — the
   * only D2-sanctioned write here). At >= 700px the stylesheet's media query
   * owns visibility and the rail is display:none, so this state is phone-world
   * only and persists nothing.
   *
   * B-117 (D53): in EDITOR mode a library-node selection belongs to the
   * property panel — the sheet stays collapsed (the rail remains reachable,
   * the user can still expand it). B-122: in editor mode an EDGE selection
   * belongs to the arc panel — the same rationale. D91 note: the narrow sheet
   * now OVERLAYS the stage (the stack), so the stage-height rationale is
   * historical — the mutual-exclusion reading stands (one surface per
   * selection kind, never two stacked panels fighting over the bottom edge).
   */
  protected readonly sheetExpanded = linkedSignal<string | null, boolean>({
    source: () => {
      const sel = this.graph.selection();
      if (sel !== null && this.graph.editorMode() && this.graph.nodeDataById(sel.id) !== null) {
        return null;
      }
      if (this.graph.editorMode() && this.graph.edgeSelection() !== null) {
        return null;
      }
      return sel?.id ?? this.graph.edgeSelection()?.id ?? null;
    },
    computation: (source) => source !== null,
  });

  /** B-114 (ruling 2): the rail's collapse/expand — one discrete tap (D2). */
  protected toggleSheet(): void {
    this.sheetExpanded.update((expanded) => !expanded);
  }

  // --- B-133 (D91): the wide floater's regime (the B-119 surface) -------------

  /**
   * The floating panel's rendered transform — `translate(x, y)` of the
   * remembered viewport position (null while unplaced: the CSS anchor
   * applies). The drag's direct style writes land on the same property; the
   * one signal write per drag end re-renders the committed value here.
   */
  protected readonly floatTransform = computed<string | null>(() => {
    if (!this.graph.routePanelOpen()) return null;
    const pos = this.graph.routePanelPosition();
    return pos === null ? null : `translate(${pos.x}px, ${pos.y}px)`;
  });

  /**
   * Best-effort avoid-the-selection default anchor (D91 — placement-only,
   * never a pan): an UNPLACED floater anchors on the side AWAY from the
   * selection's rendered anchor (the service's selectionRenderedSide, the
   * rescue clamp's own anchor semantics). A remembered position always wins
   * (the user's drag is the authority, D10). The selection signals are read
   * first so this computed re-runs exactly when they change (D2).
   */
  protected readonly anchorStart = computed(() => {
    if (this.graph.routePanelPosition() !== null) return false;
    void this.graph.selection();
    void this.graph.edgeSelection();
    return this.graph.selectionRenderedSide() === 'right';
  });

  /** The drag currently in progress, or null — a plain field (D2). */
  private drag: DragFrame | null = null;

  /**
   * B-133: the Maximize/Restore toggle (the template's only write path, R3) —
   * one discrete tap flipping the compact/tall overlay forms.
   */
  protected toggleMaximize(): void {
    this.maximized.update((m) => !m);
  }

  /**
   * Dragstart on the floater header — the floating panel's handle (the
   * narrow sheet never renders a drag surface). A pointer on one of the
   * header's buttons never starts a drag (the taps keep working); mouse and
   * touch share this one pointer-event path (D53). The high-frequency
   * pointermove listener exists only WHILE dragging (the B-119 lifetime).
   */
  protected onDragStart(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button') !== null) return; // buttons tap, they don't drag
    if (!event.isPrimary) return; // one pointer owns the drag
    if (!this.graph.routePanelOpen() || this.drag !== null) return;
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
    this.graph.routePanelPosition.set(drag.last); // one signal write → the binding re-renders it
  };

  /**
   * Snapshot the clamp geometry — the stage rect (the panel floats over the
   * viewer's stage), the top chrome band's union rect (the breadcrumb and
   * the selection chip; both conditional, both optional), the header height,
   * and the width to clamp against (the live measured width). Null when no
   * stage is reachable (C32 spirit).
   */
  private readFrame(width: number): ClampFrame | null {
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
    };
  }

  /**
   * The stage-bounds clamp (the B-119 arithmetic): the panel stays inside the
   * stage and never covers the top chrome band — while its right edge reaches
   * into the band's horizontal span it is clamped BELOW the band; fully left
   * of the band it may rise to the stage top — and the header stays reachable
   * (maxY keeps it above the stage bottom). Plain containment — NOT F46's
   * fenced canvas snapping. Pure arithmetic over the snapshot frame — safe at
   * pointermove frequency (D2).
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

  // --- B-124/C2/C19/B-110/B-131: the panel's content reads (unchanged) --------

  /**
   * B-124 (D78/C23): the mode switch rows are the SERVICE's `modeRows` — the
   * loaded map's mode universe rowed with the ONE core resolver's words (no
   * hardcoded trio; the UI never maps ids to words, R1 spirit). F32/D19
   * still holds: there is no 'auto' — D60(a) prefers overlay.travelMode per
   * arc and falls back to the cheapest allowed mode in the route's currency.
   * The component renders the rows verbatim and hands every row id straight
   * back through setMode (the facade's setTravelMode validates it, C30).
   */

  /**
   * C2/C19 (the M1 deferral): the pin-incident blocked arcs — label + reason
   * verbatim off the facade snapshot (currency-neutral; blocked arcs always
   * list). Selection-independent: the pin's blocked neighborhood shows whether
   * or not anything is selected.
   */
  protected readonly blockedHere = computed((): readonly SnapshotRoute[] =>
    (this.graph.snapshot()?.routes ?? []).filter((route) => route.blockedReason !== undefined),
  );

  /**
   * B-131 (D94/F55/C34): the blocked-NODE listing — the snapshot's
   * `blockedNodes` projection rendered verbatim (R1/R4: the core's words,
   * never recomputed; the snapshot signal's write on every
   * afterGraphMutation re-renders a block/lift live). NOT pin-incident-
   * scoped: the blocked nodes are the whole chat's state, which is exactly
   * why this is a SIBLING list beside the pin-incident blocked arcs above —
   * the snapshot listing is the projection, and a node block surfaces here
   * like an arc's blockedReason (C2 spirit: label + reason verbatim;
   * unnamed user waypoints never appear — C23, the core already excludes
   * them; omitted entirely when nothing is blocked — the snapshot's shape).
   */
  protected readonly blockedNodes = computed((): readonly SnapshotBlockedNode[] =>
    this.graph.snapshot()?.blockedNodes ?? [],
  );

  /**
   * B-110 (ruling 1): the Waypoint section's data — the selection, only when
   * it is a PLACED waypoint (`isUserNode` reads the live `overlay.userNodes`
   * reference — R4, a presence check, never a copy). graphRevision is a
   * dependency so a promote/remove re-reads the overlay: promotion turns the
   * node into a library node (same id — C26) and the section disappears;
   * removal clears the selection entirely. Library-node selections and
   * no-selection degrade to null — no section (the Phase 3 fence).
   */
  protected readonly waypoint = computed(() => {
    void this.graph.graphRevision(); // dependency: promote/remove re-read (R4)
    const sel = this.graph.selection();
    return sel !== null && this.graph.isUserNode(sel.id) ? sel : null;
  });

  /**
   * B-110: the name input's value — a controlled input ([value] + signal
   * write on every input event; R3: the handler READS the DOM event, writes a
   * signal, never writes the DOM). linkedSignal keyed on the SELECTION ID:
   * switching waypoints starts a fresh editing session, so one waypoint never
   * inherits another's draft (and a re-selection after a dismiss starts
   * empty). Promotion re-points the selection to the SAME id (C26), so the
   * source value is unchanged and nothing resets mid-flow.
   */
  protected readonly label = linkedSignal<string | null, string>({
    source: () => this.graph.selection()?.id ?? null,
    computation: () => '',
  });

  /**
   * The Promote button's honest state (C30/D21 — the B-106 pattern): enabled
   * iff the trimmed name is non-empty. D21: promote NAMES the waypoint; an
   * empty name is not a name. The facade's C30 throw stays the authority and
   * is structurally out of reach.
   */
  protected readonly canPromote = computed(() => this.label().trim().length > 0);

  /** R3: the input event handler — a DOM read, then the signal write. */
  protected onLabelInput(event: Event): void {
    this.label.set((event.target as HTMLInputElement).value);
  }

  /**
   * C26/D21: name + promote through the service (R2). The facade moves the
   * node overlay → library under the SAME id (origin flips 'authored') and
   * its incident user edges graduate per D61; the service then re-points the
   * selection, so the chip and the route below re-render under the new name.
   * Only reachable while canPromote() holds (button disabled otherwise), so
   * the facade's C30 empty-label throw is structurally out of reach.
   */
  protected promote(): void {
    const wp = this.waypoint();
    const name = this.label().trim();
    if (wp === null || name.length === 0) return;
    this.graph.promoteWaypoint(wp.id, name);
  }

  /**
   * D21/§6.2: remove through the service (R2) — the node and its user edges
   * die together (any overlay block on them too), other waypoints untouched.
   * No confirmation dialog (ruling 3: removal is recoverable by replacement;
   * F46's editor fence — one tap = one command, D2).
   */
  protected remove(): void {
    const wp = this.waypoint();
    if (wp === null) return;
    this.graph.removeWaypoint(wp.id);
  }

  /**
   * Ruling 3: one tap path for every project (F52/D53) — the facade command,
   * with the row id passed through untouched (B-124: ids are the stable
   * keys; the facade's setTravelMode validates against the loaded map's
   * universe, C30 — a refusal surfaces through the service's
   * travelModeRefusal, rendered below the switch).
   */
  protected setMode(mode: TravelMode): void {
    this.graph.setTravelModePreference(mode);
  }
}
