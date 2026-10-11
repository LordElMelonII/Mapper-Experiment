// src/app/viewer/context-dock.component.ts — PKG B-D2 (R29,
// docs/ui-restyle/PROPOSAL-D-STRUCTURAL.md §2.1): the >=1024px shell's
// CONTEXT DOCK — the 280px right column that hosts exactly ONE context panel
// at a time (the service's dockContext: the most-recently-opened non-floated
// panel among route/arc/property/layers/maps). Context swap, not stack: the
// @switch renders the occupant's component — the same component classes the
// .tme-sheets home uses, one live home per kind per regime (map-viewer's
// sheets gates render a kind everywhere BUT here; service-held state makes
// the swap safe, R3). Kills the P0 occlusion class by construction: the dock
// is `.tme-viewer`'s LAST flex child (in-flow, never position:fixed), so its
// open/close resizes the canvas host ⇒ the ResizeObserver ⇒ notifyResize ⇒
// the D81 wide class ⇒ preserve + rescue clamp — the ONE panel-driven stage
// resize the discriminator classifies alongside the rail's collapse/expand.
//
// Chrome: the occupant's title word (C23 plain words) + the Float button —
// the dock↔float handoff's dock-side half (the floater-side Dock buttons live
// on the panels' own headers, shell-gated). Both >= 44px (F52). The close
// path stays the occupant's own (R29 contract — the dock chrome never closes
// what the user or content opened, D10).
//
// R3 discipline: state lives in GraphService (the dockContext computed + the
// per-kind dock flags); this component renders it and writes back through
// setPanelDocked. OnPush + zoneless (D2): the occupant swaps are discrete
// signal writes. Tokens only; zero global leakage (D7). Below 1024px the
// template renders nothing (dockContext is null — the predicates are
// shellWide-gated), so the sub-shell chrome is byte-for-byte today's.
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GraphService, type ContextKind } from '../graph/graph.service';
import { ArcPanelComponent } from './arc-panel.component';
import { LayerManagerComponent } from './layer-manager.component';
import { MapsPanelComponent } from './maps-panel.component';
import { PropertyPanelComponent } from './property-panel.component';
import { RoutePanelComponent } from './route-panel.component';

@Component({
  selector: 'tme-context-dock',
  templateUrl: './context-dock.component.html',
  styleUrl: './context-dock.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RoutePanelComponent,
    ArcPanelComponent,
    PropertyPanelComponent,
    LayerManagerComponent,
    MapsPanelComponent,
  ],
})
export class ContextDockComponent {
  protected readonly graph = inject(GraphService);

  /**
   * B-D2 (C23): the occupant's title word — plain words only (the panels'
   * own titles: Route / Arc; the property form's "Place details"; the two
   * managers' names). Never a machine name.
   */
  protected readonly titleWord = computed((): string => {
    switch (this.graph.dockContext()) {
      case 'route':
        return 'Route';
      case 'arc':
        return 'Arc';
      case 'property':
        return 'Place details';
      case 'layers':
        return 'Layers';
      case 'maps':
        return 'Maps';
      default:
        return '';
    }
  });

  /**
   * B-D2: the Float handoff — tears the occupant's kind off the dock (one
   * service write, R3); the panel re-homes into the .tme-sheets floater form
   * (remembered position intact) and the dock re-hosts the next open context
   * or closes. The template's only write path.
   */
  protected float(kind: ContextKind): void {
    this.graph.setPanelDocked(kind, false);
  }
}
