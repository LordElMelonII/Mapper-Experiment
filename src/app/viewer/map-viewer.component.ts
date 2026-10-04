// src/app/viewer/map-viewer.component.ts — PKG B-102, extended by B-105 (the
// route panel joins the layout) and B-106 (the arc panel joins as a third
// region — beside the route panel on wide viewports, under it on narrow
// ones, rendered only while an edge is selected, ruling 1/3) and B-117 (the
// property panel joins as the fourth region — editor mode with a node
// selection only; the open/close gate lives inside the panel component,
// which hides its host when it has no draft). The M1 viewer:
// canvas host for the GraphService's cy instance (D3), per-layer background
// beneath it (F03/D29/D69), snapshot header line (R1 — verbatim core
// strings) and the layer switcher (F01/FX1). Zoneless + OnPush (D2): only
// signal writes reach the template; the ResizeObserver fires outside Angular
// and touches none.
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  viewChild,
} from '@angular/core';
import { GraphService } from '../graph/graph.service';
import { ArcPanelComponent } from './arc-panel.component';
import { PropertyPanelComponent } from './property-panel.component';
import { RoutePanelComponent } from './route-panel.component';

@Component({
  selector: 'tme-map-viewer',
  imports: [RoutePanelComponent, ArcPanelComponent, PropertyPanelComponent],
  templateUrl: './map-viewer.component.html',
  styleUrl: './map-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapViewerComponent implements AfterViewInit, OnDestroy {
  protected readonly graph = inject(GraphService);

  // Canvas lifecycle (charter): initialize only after the container exists.
  private readonly canvasHost = viewChild.required<ElementRef<HTMLDivElement>>('canvasHost');

  // Charter lifecycle: container resizes (panel layouts, rotation) re-size cy.
  // The callback writes no signals — zero change detection (D2).
  private readonly resizeObserver = new ResizeObserver(() => this.graph.notifyResize());

  ngAfterViewInit(): void {
    const host = this.canvasHost().nativeElement;
    this.graph.mount(host);
    this.resizeObserver.observe(host);
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
    this.graph.unmount();
  }

  /** F52/D53: one tap path for every project — no hover-only affordances. */
  protected selectLayer(layerId: string): void {
    this.graph.selectLayer(layerId);
  }

  /**
   * B-103: chip dismiss — clears selection through the same signal path as a
   * background tap; the tme-selected canvas accent follows the signal via the
   * service's effect (R3).
   */
  protected dismissSelection(): void {
    this.graph.selection.set(null);
  }

  /**
   * B-116 (§5 Phase 3 M1): the editor toggle — enters/exits editor mode
   * through the service's single write paths (R2/R3: no canvas or DOM writes
   * here, only the signal + the core-wide grabbable switch the service owns).
   */
  protected toggleEditor(): void {
    if (this.graph.editorMode()) this.graph.exitEditor();
    else this.graph.enterEditor();
  }

  /**
   * B-116 (F45/C29/D75): the save bar's Save — the facade's explicit save
   * through the service (R2). A C30 refusal surfaces user-visibly via the
   * service's saveError signal (rendered in the save dock), never
   * console-only.
   */
  protected saveMap(): void {
    this.graph.saveMap();
  }
}
