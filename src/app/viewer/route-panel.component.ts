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
// business; the facade itself refuses, C30).
// Every number and reason string is a core projection rendered verbatim (R1);
// the component mutates nothing itself — the mode switch and the waypoint
// actions go through GraphService's facade commands (R2), and state flows one
// way: events in → signals out → this template (R3). OnPush + zoneless (D2):
// only discrete user actions (taps, keystrokes) write signals; the route is a
// computed in the service, so canvas drags recompute nothing.
import { Component, computed, inject, linkedSignal } from '@angular/core';
import type { SnapshotRoute, TravelMode } from '../../core/api';
import { GraphService } from '../graph/graph.service';

@Component({
  selector: 'tme-route-panel',
  templateUrl: './route-panel.component.html',
  styleUrl: './route-panel.component.scss',
})
export class RoutePanelComponent {
  protected readonly graph = inject(GraphService);

  /**
   * F32/D19 (ruling 3): the three overlay preference modes — there is no
   * 'auto'; D60(a) already prefers overlay.travelMode per arc and falls back
   * to the cheapest allowed mode in the route's currency.
   */
  protected readonly modes: readonly { id: TravelMode; name: string }[] = [
    { id: 'walk', name: 'Walk' },
    { id: 'car', name: 'Car' },
    { id: 'train', name: 'Train' },
  ];

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

  /** Ruling 3: one tap path for every project (F52/D53) — the facade command. */
  protected setMode(mode: TravelMode): void {
    this.graph.setTravelModePreference(mode);
  }
}
