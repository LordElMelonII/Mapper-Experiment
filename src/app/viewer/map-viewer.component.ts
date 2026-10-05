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
// and touches none. D81: the RO classifies resizes through the service (the
// narrow layout + environmental resizes refit; a wide-layout panel-driven
// resize preserves the viewport, rescuing the selection pan-only) and feeds
// it this component's measured interactive-chrome rects.
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
import type { ChromeRect, EditorTool } from '../graph/graph.service';
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

  // D81: the component host — the chrome-measurement root (consumer-math:
  // this component measures its own DOM; the service never reads the DOM).
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  // Canvas lifecycle (charter): initialize only after the container exists.
  private readonly canvasHost = viewChild.required<ElementRef<HTMLDivElement>>('canvasHost');

  /**
   * D81: the stage's INTERACTIVE chrome — the viewport-preserve clamp's
   * avoidance targets. The header and the draw-arc feedback banner are
   * deliberately absent (both are pointer-events: none — messages, not hit
   * targets); the bottom-left layer nav never moves on a panel resize but
   * stays a valid avoidance target. Selectors mirror
   * map-viewer.component.scss.
   */
  private static readonly INTERACTIVE_CHROME: readonly string[] = [
    '.tme-layers',
    '.tme-chip',
    '.tme-editor-toggle',
    '.tme-save-dock',
    '.tme-tools',
  ];

  // Charter lifecycle: container resizes (panel layouts, rotation) re-size cy.
  // D81: the callback also hands the service the interactive-chrome rects for
  // its preserve-class rescue clamp, measured AFTER the layout change (the RO
  // fires post-layout). Writes no signals — zero change detection (D2).
  private readonly resizeObserver = new ResizeObserver(() =>
    this.graph.notifyResize(this.measureInteractiveChrome()),
  );

  ngAfterViewInit(): void {
    const host = this.canvasHost().nativeElement;
    this.graph.mount(host);
    this.resizeObserver.observe(host);
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
    this.graph.unmount();
  }

  /**
   * D81: measure the interactive chrome and translate it into the CANVAS
   * coordinate space the service's rendered boxes live in (viewport-px
   * getBoundingClientRect minus the canvas origin — the consumer owns the
   * conversion). Conditional chrome not currently rendered (chip, save dock,
   * editor tools) yields no rect; hidden chrome measures 0×0 and is skipped;
   * any measurement failure degrades to undefined — the canvas-rect-only
   * clamp (C32 spirit, never a throw).
   */
  private measureInteractiveChrome(): ChromeRect[] | undefined {
    try {
      const canvasBox = this.canvasHost().nativeElement.getBoundingClientRect();
      const root = this.host.nativeElement;
      const rects: ChromeRect[] = [];
      for (const selector of MapViewerComponent.INTERACTIVE_CHROME) {
        const el = root.querySelector(selector);
        if (el === null) continue;
        const box = el.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) continue;
        rects.push({
          x: box.left - canvasBox.left,
          y: box.top - canvasBox.top,
          w: box.width,
          h: box.height,
        });
      }
      return rects;
    } catch {
      return undefined;
    }
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
   * B-120 (D76): the segmented tool control's tap path — the service's
   * single write path for the editor tool (R2/R3, the toggleEditor pattern:
   * one signal write, the template follows).
   */
  protected setEditorTool(tool: EditorTool): void {
    this.graph.setEditorTool(tool);
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
