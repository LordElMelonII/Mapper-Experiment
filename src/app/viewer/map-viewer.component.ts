// src/app/viewer/map-viewer.component.ts — PKG B-102, extended by B-105 (the
// route panel joins the layout) and B-106 (the arc panel joins as a third
// region — beside the route panel on wide viewports, under it on narrow
// ones, rendered only while an edge is selected, ruling 1/3) and B-117 (the
// property panel joins as the fourth region — editor mode with a node
// selection only; the open/close gate lives inside the panel component,
// which hides its host when it has no draft). The M1 viewer: canvas host for
// the GraphService's cy instance (D3), per-layer background beneath it
// (F03/D29/D69), snapshot header line (R1 — verbatim core strings). Zoneless
// + OnPush (D2): only signal writes reach the template; the ResizeObserver
// fires outside Angular and touches none. D81: the RO classifies resizes
// through the service (the narrow layout + environmental resizes refit; a
// wide-layout panel-driven resize preserves the viewport, rescuing the
// selection pan-only) and feeds it this component's measured
// interactive-chrome rects. B-127 (D86/F53): the editor toggle, the tool
// group, the layer nav and the save dock MIGRATED onto the editor rail (a
// region sibling — first child on wide, last child on narrow); the stage
// keeps only the header, the selection chip and the draw-arc feedback
// banner (D86's absorb list excludes them), and the clamp's measured chrome
// set is the RAIL rect + the chip.
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
import type { ChromeRect } from '../graph/graph.service';
import { ArcPanelComponent } from './arc-panel.component';
import { EditorRailComponent } from './editor-rail.component';
import { LayerManagerComponent } from './layer-manager.component';
import { PropertyPanelComponent } from './property-panel.component';
import { RoutePanelComponent } from './route-panel.component';

@Component({
  selector: 'tme-map-viewer',
  imports: [EditorRailComponent, RoutePanelComponent, ArcPanelComponent, PropertyPanelComponent, LayerManagerComponent],
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
   * D81/B-127 (D86): the stage's INTERACTIVE chrome — the viewport-preserve
   * clamp's avoidance targets. Post-rail this is the RAIL rect (the whole
   * control surface, collapsed strip included — it is still the rail), the
   * selection chip, and (B-128/D85) the breadcrumb bar (a crumb tap is a
   * selectLayer — genuinely interactive); the header and the draw-arc
   * feedback banner are deliberately absent (both are pointer-events: none
   * — messages, not hit targets). The five pre-rail selectors left with the
   * chrome they measured (the toggle/tools/layers/save-dock now live ON the
   * rail, so the rail rect covers them all). Selectors mirror
   * map-viewer.component.html / editor-rail.component; the e2e mirror
   * constants (panel-resize-viewport / verify-d81-viewport
   * CHROME_SELECTORS) carry the same list.
   */
  private static readonly INTERACTIVE_CHROME: readonly string[] = [
    '.tme-rail',
    '.tme-breadcrumb',
    '.tme-chip',
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
   * conversion). Conditional chrome not currently rendered (chip) yields no
   * rect; the rail is a SIBLING region, so its rect may legitimately sit
   * outside the canvas box (negative-x on wide, below on narrow) — the clamp
   * treats it generically; hidden chrome measures 0×0 and is skipped; any
   * measurement failure degrades to undefined — the canvas-rect-only clamp
   * (C32 spirit, never a throw).
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

  /**
   * B-103: chip dismiss — clears selection through the same signal path as a
   * background tap; the tme-selected canvas accent follows the signal via the
   * service's effect (R3).
   */
  protected dismissSelection(): void {
    this.graph.selection.set(null);
  }

  /**
   * B-128 (D85/F02): a breadcrumb crumb's tap — the layer switch through the
   * service's single write path (R2/R3; selectLayer's explicit fit stands,
   * D85/D81). The active crumb is a non-interactive span (aria-current), so
   * only ancestor crumbs reach here.
   */
  protected selectLayer(layerId: string): void {
    this.graph.selectLayer(layerId);
  }
}
