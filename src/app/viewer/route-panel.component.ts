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
// FORM of this same panel, never a second one (Q29 fence: no floating, no
// remembered position, no maximize; that regime is Phase 3).
// Every number and reason string is a core projection rendered verbatim (R1);
// the component mutates nothing itself — the mode switch and the waypoint
// actions go through GraphService's facade commands (R2), and state flows one
// way: events in → signals out → this template (R3). OnPush + zoneless (D2):
// only discrete user actions (taps, keystrokes) write signals; the route is a
// computed in the service, so canvas drags recompute nothing.
import { Component, computed, inject, linkedSignal } from '@angular/core';
import type { SnapshotBlockedNode, SnapshotRoute, TravelMode } from '../../core/api';
import { GraphService } from '../graph/graph.service';

@Component({
  selector: 'tme-route-panel',
  templateUrl: './route-panel.component.html',
  styleUrl: './route-panel.component.scss',
})
export class RoutePanelComponent {
  protected readonly graph = inject(GraphService);

  /**
   * B-114 (ruling 2): the narrow-viewport sheet state — component-local VIEW
   * chrome only (Q29 fence: no floating, no persistence, no maximize; the
   * Phase 3 panel regime is out of scope). A linkedSignal keyed on the
   * selection (the node id, else the edge id, else null): collapsed when
   * idle (source null), auto-EXPANDS on every new node/edge selection — a
   * map tap means the user wants the panel, so the M2 tap-to-see-route flow
   * keeps its zero-extra-taps shape — and collapses again when the selection
   * clears (chip dismiss / background tap). The rail's toggle writes between
   * source changes (a discrete gesture — the only D2-sanctioned write here).
   * At >= 700px the stylesheet's media query owns visibility and the rail is
   * display:none, so this state is phone-world only and persists nothing.
   *
   * B-117 (D53): in EDITOR mode a library-node selection belongs to the
   * property panel — the sheet stays collapsed (the rail remains reachable,
   * the user can still expand it) so the editing stage keeps its height
   * instead of dropping to ~180px under two open panels, where the fitted
   * content lands underneath the fixed chrome (the exact B-106 finding the
   * resize refit exists for). View-mode behavior is unchanged from B-114,
   * and an editor selection that is NOT a library node (a waypoint — no
   * property panel, B-116 precedent) still expands the sheet as before.
   */
  protected readonly sheetExpanded = linkedSignal<string | null, boolean>({
    source: () => {
      const sel = this.graph.selection();
      if (sel !== null && this.graph.editorMode() && this.graph.nodeDataById(sel.id) !== null) {
        return null;
      }
      // B-122 (D53): in editor mode an EDGE selection belongs to the arc
      // panel — the same B-117 rationale, extended: the sheet stays collapsed
      // so the editing stage keeps its height. Found live by
      // draw-arc.e2e-spec: a draw-arc commit selects the new arc, and the
      // expanded sheet + the arc panel collapse the phone stage to ~150px,
      // where the fitted map lands underneath the fixed chrome stack (the
      // exact B-106 finding) and the next draw tap hits the save dock.
      // View-mode behavior is unchanged (B-114 verbatim).
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
