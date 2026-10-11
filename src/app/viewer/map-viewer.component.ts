// src/app/viewer/map-viewer.component.ts — PKG B-102, extended by B-105 (the
// route panel joins the layout) and B-106 (the arc panel joins as a third
// region — rendered only while an edge is selected, ruling 1/3) and B-117
// (the property panel joins — editor mode with a node selection only; the
// open/close gate lives inside the panel component, which hides its host
// when it has no draft). The M1 viewer: canvas host for the GraphService's
// cy instance (D3), per-layer background beneath it (F03/D29/D69), snapshot
// header line (R1 — verbatim core strings). Zoneless + OnPush (D2): only
// signal writes reach the template; the ResizeObserver fires outside Angular
// and touches none. D81, narrowed by D91: the RO classifies resizes through
// the service — the four panels are OVERLAYS (B-133) and open/close none of
// them resizes anything, so the RO fires solely for the editor rail's
// collapse/expand (wide: preserve + selection rescue; narrow: the B-106
// refit) and for environmental resizes — and feeds the service this
// component's measured interactive-chrome rects. B-127 (D86/F53): the editor
// toggle, the tool group, the layer nav, the D91 Route toggle and the save
// dock live on the editor rail (a region sibling — first child on wide, last
// child on narrow); the stage keeps only the header, the breadcrumb, the
// selection chip, the draw-arc feedback banner and (B-135, D93) the calibrate
// mode band — the stage-level mode surfaces (D86's absorb list excludes
// them), and the clamp's measured chrome set is the RAIL rect + the
// breadcrumb + the chip. B-D2 (R29, PROPOSAL-D §2.1): the ≥1024 shell adds
// the CONTEXT DOCK as the viewer's last flex child — its open/close IS a
// panel-driven stage resize the same discriminator classifies (preserve +
// rescue clamp), so '.tme-dock' joins the measured chrome set, and the
// selection chip dual-homes into the canvas-bottom status strip at shell
// widths (one instance per regime).
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
import { ContextDockComponent } from './context-dock.component';
import { EditorRailComponent } from './editor-rail.component';
import { InlineNamingComponent } from './inline-naming.component';
import { LayerManagerComponent } from './layer-manager.component';
import { MapsPanelComponent } from './maps-panel.component';
import { NodeMenuComponent } from './node-menu.component';
import { PropertyPanelComponent } from './property-panel.component';
import { RoutePanelComponent } from './route-panel.component';

@Component({
  selector: 'tme-map-viewer',
  imports: [EditorRailComponent, RoutePanelComponent, ArcPanelComponent, PropertyPanelComponent, LayerManagerComponent, MapsPanelComponent, NodeMenuComponent, ContextDockComponent, InlineNamingComponent],
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
   * B-134 (D92): the tme-bg <img> — optional (the @if unmounts it when the
   * layer has no background or the C32 flag hides it). The transform
   * callback re-reads this signal per invocation, so an img re-created by a
   * failed-load re-arm is picked up without bookkeeping.
   */
  private readonly bgImg = viewChild<ElementRef<HTMLImageElement>>('bgImg');

  /**
   * D81/B-127 (D86): the stage's INTERACTIVE chrome — the viewport-preserve
   * clamp's avoidance targets. The RAIL rect (the whole control surface,
   * collapsed strip included — it is still the rail), the selection chip,
   * (B-128/D85) the breadcrumb bar (a crumb tap is a selectLayer —
   * genuinely interactive), and (B-D2) the context dock — a stage SIBLING
   * like the rail (its rect may sit outside the canvas box, x past the
   * canvas width on wide; the clamp treats it generically); the header and
   * the draw-arc feedback banner are deliberately absent (both are
   * pointer-events: none — messages, not hit targets). D91: the four panels
   * are overlays and are DELIBERATELY not in this set — they position to
   * avoid the selection at placement time (best-effort, each panel's own
   * clamp) and a floater drag must never fight the viewport clamp. Selectors
   * mirror map-viewer.component.html / editor-rail.component /
   * context-dock.component; the e2e mirror constants (panel-resize-viewport
   * / verify-d81-viewport CHROME_SELECTORS) carry the same list.
   */
  private static readonly INTERACTIVE_CHROME: readonly string[] = [
    '.tme-rail',
    '.tme-breadcrumb',
    '.tme-chip',
    '.tme-dock',
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
    // B-134 (D92): the background transform application — the cull
    // precedent's seam: the service sees the zoom/pan stream, this
    // component owns the img's DOM (the D81 discipline), so the service
    // calls OUT and the consumer applies. Registered after mount (mount's
    // own fit precedes it harmlessly — the callback is simply not there
    // yet, and the discrete img-load pass re-applies once loaded).
    this.graph.setBackgroundTransformListener(() => this.applyBackgroundTransform());
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
    this.graph.setBackgroundTransformListener(null); // B-134: gone before unmount
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
   * B-148 (docs/ui-restyle/REPAIRS.md §R8, ruling 3): the canvas host's zoom
   * keys — this sit on the host div (tabindex="0" above in the template) so
   * Tab/click can put keyboard focus on the canvas, and then +/-/= zoom in,
   * -/_ zoom out, 0 fits. Every branch calls the rail zoom trio's EXISTING
   * service viewport commands (zoomIn/zoomOut/fitToView — never a second
   * viewport arithmetic, R1/D81; the trio reads mounted and degrades
   * silently headless, C32).
   * B-D1 (R29, PROPOSAL-D §2.1 keyboard package; R-8 rehoused): 1/2/3 pick
   * the editor tools (node/waypoint/arc) through the segmented control's
   * ONE write path setEditorTool — EDITOR-MODE-GATED: in view mode the keys
   * are ignored like arrows (the tool control never renders there, D76).
   * The guards: (a) a form field holding focus eats its own keys — the
   * handler no-ops whenever an input/textarea/select is the focused element
   * (belt: such a keydown does not bubble through this div anyway — the host
   * has no form descendants — but the guard is the letter's, C32);
   * (b) focus containment — the keydown must carry the host itself (or a
   * descendant) as its target; anything else bubbles from elsewhere and is
   * ignored; (c) every other key returns untouched — arrow keys never nudge
   * (node movement is the editor-scope fence, F46). The consumed keys are
   * preventDefault-ed so a scroll-adjacent UA default never wakes.
   */
  protected onCanvasKeydown(event: KeyboardEvent): void {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    ) {
      return;
    }
    const host = event.currentTarget;
    if (!(host instanceof HTMLElement) || !host.contains(event.target as Node)) return;
    switch (event.key) {
      case '+':
      case '=':
        this.graph.zoomIn();
        break;
      case '-':
      case '_':
        this.graph.zoomOut();
        break;
      case '0':
        this.graph.fitToView();
        break;
      case '1':
      case '2':
      case '3':
        if (!this.graph.editorMode()) return; // view mode: ignored, like arrows (B-D1)
        this.graph.setEditorTool(event.key === '1' ? 'node' : event.key === '2' ? 'waypoint' : 'arc');
        break;
      default:
        return; // arrows and the rest: nothing on the canvas moves (F46)
    }
    event.preventDefault();
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

  /**
   * B-D1 (R29, PROPOSAL-D §2.1): the header dim pill's input path — the
   * rail dim row's exact seam (the editor-rail twin): the service's single
   * write path setActiveLayerDim per committed input tick (R2/R3); the
   * template re-binds from the re-read, never a local echo (D2).
   */
  protected setDim(event: Event): void {
    this.graph.setActiveLayerDim((event.target as HTMLInputElement).valueAsNumber);
  }

  /**
   * B-134: the tme-bg img's discrete `load` report — the service cannot read
   * the DOM (D81), and the natural size is a DOM fact only the loaded img
   * carries. The service owns everything else (compute, persist, apply).
   */
  protected noteBackgroundLoaded(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.graph.noteBackgroundImageLoaded(img.naturalWidth, img.naturalHeight);
  }

  /**
   * B-135 (D93): the calibrate band's scale readout — the image size as a
   * percentage of the D92 default-fit scale, so "100%" means exactly the
   * fit-to-graph baseline (Fit always returns the readout there, and the
   * stepper's steps read as size changes). Presentation arithmetic over the
   * core arm (graph.activeLayerPlacement) and the ONE shared default
   * (graph.activeDefaultPlacement) — the `1 − dim` styling's class: neither
   * input is a distance/direction/duration/cost and nothing here feeds a
   * prompt (R1 holds; the displayed ratio is chrome for the stepper).
   * Null — the readout hides — when the mode is off or the default is
   * degenerate (the stepper still works absolutely). Template-called with
   * the service's editorRevision reads inside (C24 — the canSetUrl
   * precedent), so every committed step re-renders it.
   */
  protected calibrateScalePercent(): number | null {
    if (!this.graph.calibrateMode()) return null;
    const current = this.graph.activeLayerPlacement();
    const def = this.graph.activeDefaultPlacement();
    if (current === null || def === null || def.scale <= 0) return null;
    return Math.round((current.scale / def.scale) * 100);
  }

  /**
   * B-134 (D92): the background transform application — the registered
   * callback the service's `zoom`/`pan` handlers and discrete background
   * sites invoke. The cull precedent's discipline: direct, idempotent,
   * event-frequency work — NO signals, no change detection (D2), no fit and
   * no resize (D91 zero-motion: the transform only READS the viewport).
   *
   * screen = canvasBox.topLeft + pan + model × zoom (the tapModelPoint
   * precedent). With the placement {x, y, scale} (model center + model
   * units per image px) and the img's natural size: width = naturalW ×
   * scale × zoom px, left = canvasLeft + pan.x + (x − naturalW·scale/2)
   * × zoom — expressed in the img's containing-block space (the stage),
   * where the canvas origin is the canvas host's LAYOUT offset
   * (offsetLeft/offsetTop — relative to the same positioned ancestor, the
   * stage). The layout offset is deliberately NOT the viewport
   * getBoundingClientRect: an overflow-hidden ancestor CAN scroll
   * programmatically (WebKit's input-focus scroll does exactly that to the
   * stage when a sheet input is focused) — the gBCR pair would bake that
   * scroll into the style and tear the img off the canvas, while the canvas
   * and the img (both stage content) must stay glued through any scroll.
   * The four inline styles REPLACE the D84 stage-contain fit; a null
   * placement (degenerate extents / no compute) CLEARS them, restoring the
   * bare SCSS rule byte-verbatim (the fallback branch). Skips silently
   * while the img has no decoded bitmap, or while its intrinsic pair
   * disagrees with the service's src-tagged expectation (a src swap updates
   * naturalWidth/Height in separate decoder steps — the B-134 finding; the
   * settled pair arrives with the load event's re-apply).
   */
  private applyBackgroundTransform(): void {
    const img = this.bgImg()?.nativeElement;
    if (img === undefined || img.naturalWidth === 0 || img.naturalHeight === 0) return;
    const state = this.graph.backgroundRenderState();
    if (state === null) {
      if (img.style.width !== '') {
        img.style.left = '';
        img.style.top = '';
        img.style.width = '';
        img.style.height = '';
      }
      return;
    }
    // The torn-natural guard (the B-134 finding): the img's intrinsic pair
    // must equal the load report's src-tagged pair, or a swap is mid-flight
    // and this pass would write a non-aspect-locked box.
    if (state.natural === null || img.naturalWidth !== state.natural.w || img.naturalHeight !== state.natural.h) {
      return;
    }
    if (img.offsetParent === null) return; // not laid out (hidden stage) — nothing to place (C32 spirit)
    const canvas = this.canvasHost().nativeElement;
    const w = state.natural.w * state.scale * state.zoom;
    const h = state.natural.h * state.scale * state.zoom;
    const left = canvas.offsetLeft + state.pan.x + (state.x - (state.natural.w * state.scale) / 2) * state.zoom;
    const top = canvas.offsetTop + state.pan.y + (state.y - (state.natural.h * state.scale) / 2) * state.zoom;
    img.style.left = `${left}px`;
    img.style.top = `${top}px`;
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
  }
}
