// src/app/viewer/route-panel.component.ts — PKG B-105: the M2 route sidebar.
// Tap a node → this panel renders the core's route from the pin to it: per-leg
// detail (C18), the total with its ONE D72 unit label (C15), the overlay
// travel-mode preference switch (F32/D19), and the pin-incident blocked-arc
// reasons (C2/C19 — the M1 deferral, discharged). Every number and reason
// string is a core projection rendered verbatim (R1); the component mutates
// nothing itself — the mode switch goes through GraphService's facade command
// (R2), and state flows one way: events in → signals out → this template (R3).
// OnPush + zoneless (D2): only discrete user actions (taps) write signals; the
// route is a computed in the service, so canvas drags recompute nothing.
import { Component, computed, inject } from '@angular/core';
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

  /** Ruling 3: one tap path for every project (F52/D53) — the facade command. */
  protected setMode(mode: TravelMode): void {
    this.graph.setTravelModePreference(mode);
  }
}
