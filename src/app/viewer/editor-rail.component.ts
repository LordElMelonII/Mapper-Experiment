// src/app/viewer/editor-rail.component.ts — PKG B-127 (§5 Phase 3 M3,
// D86/F53): the editor RAIL — the app's single control surface. It carries
// editor/view mode, the tool picks, the layer switcher + Manage, the zoom
// trio and the save dock, and it ABSORBS the former scattered chrome (the
// stage's top-right editor-toggle/save stack, bottom-right tools group,
// bottom-left layer nav — D86's "nothing remains in duplicate"): the
// ELEMENTS and their testids migrate here verbatim; the old stage-internal
// placements render nothing. The selection chip, the header and the
// draw-arc feedback banner are NOT on the rail (D86's absorb list excludes
// them) — they stay on the stage.
//
// The rail is the map viewer's region sibling: a LEFT COLUMN on the wide
// layout, a BOTTOM BAR on narrow/tall (the 700px breakpoint — the map-viewer
// SCSS owns the region placement/order; this component's SCSS mirrors the
// same constant for its INTERNAL orientation, the D81 discipline). A rail
// collapse/expand is THE panel-driven resize under D91 (B-133: the four
// panels are overlays and open/close none of them resizes anything) — the
// existing discriminator classifies it with zero new resize code (preserve +
// rescue clamp on wide, refit on narrow — the B-126 sheet precedent).
//
// B-133 (D91): the rail also carries the Route toggle (tme-route-toggle) —
// the wide route floater's summon/close; WIDE-ONLY chrome (the narrow
// sheet's rail on the panel is that world's summon — the phone bottom-rail
// regime keeps its two bands).
//
// R2/R3: every control's tap path is the service's single write path (the
// handlers moved here from map-viewer with the elements — migration, not
// duplication). D2: taps are discrete gestures; the collapse flag is
// component-local VIEW state (the B-114/B-126 rail precedent — no service
// signal; the RO catches the resize regardless of who owns the flag).
// C23: plain words or +/−/Fit glyphs only — no machine names. F52/D53:
// every control >= 44px, touch-alone operable, no hover affordances; the
// collapsed rail is a slim strip carrying only the expand affordance.
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GraphService } from '../graph/graph.service';
import type { EditorTool } from '../graph/graph.service';
import { LegendComponent } from './legend.component';

@Component({
  selector: 'tme-editor-rail',
  templateUrl: './editor-rail.component.html',
  styleUrl: './editor-rail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegendComponent], // B-147 (R-7): the node-kind legend hosts here
  host: {
    // D86: the rail HOST is the clamp's measured chrome rect (the map-viewer
    // measures '.tme-rail'); the collapsed class lets the PARENT's SCSS size
    // the slim strip (flex-basis) — the class is this component's, the sizing
    // is the region owner's (the layer-manager tme-open precedent).
    '[class.tme-collapsed]': 'collapsed()',
  },
})
export class EditorRailComponent {
  protected readonly graph = inject(GraphService);

  /**
   * B-114 (the narrow-sheet rail precedent): the rail's collapse state —
   * component-local VIEW chrome only. Collapsed ⇒ the body (every section)
   * hides and the rail is a slim strip carrying only the expand affordance;
   * the region shrink is an ordinary container resize (D81 classifies it).
   */
  protected readonly collapsed = signal(false);

  /** The rail's collapse/expand — one discrete tap (D2), no service write. */
  protected toggleRail(): void {
    this.collapsed.update((expanded) => !expanded);
  }

  /** F52/D53: one tap path for every project — no hover-only affordances. */
  protected selectLayer(layerId: string): void {
    this.graph.selectLayer(layerId);
  }

  /**
   * B-126 (D82): the layer nav's Manage affordance — toggles the
   * layer-manager sheet through the service's single write path (R2/R3, the
   * toggleEditor pattern), in BOTH view and editor modes (D76 fences
   * canvas gestures, not management chrome).
   */
  protected toggleLayerManager(): void {
    this.graph.toggleLayerManager();
  }

  /**
   * B-133 (D91): the Route panel's summon/close — the wide floater's toggle
   * through the service's single write path (R2/R3, the Manage precedent).
   * The next route-content change recomputes the auto-float state (the
   * linkedSignal source); between changes this toggle's write stands.
   */
  protected toggleRoutePanel(): void {
    this.graph.toggleRoutePanel();
  }

  /**
   * B-137 (D40): the Maps panel's summon — the layers nav's Maps affordance
   * (the D82 Manage pattern: a nav sibling, present in BOTH worlds) through
   * the service's single write path (R2/R3).
   */
  protected toggleMapsPanel(): void {
    this.graph.toggleMapsPanel();
  }

  /**
   * B-132 (D90/D93): the per-layer background dim slider's tap/drag path —
   * the service's single write path (R2/R3: one facade-bound method, the
   * toggleLayerManager pattern). The input event is a discrete committed
   * intent per step tick (commit-on-input: live preview while dragging);
   * the range control's min/max/step structurally bound the value, so no
   * refusal channel exists (the service documents the reasoning). D2: the
   * writes ride the service's signals; the template re-binds from the
   * re-read (never a local echo).
   */
  protected setDim(event: Event): void {
    this.graph.setActiveLayerDim((event.target as HTMLInputElement).valueAsNumber);
  }

  /**
   * B-116 (§5 Phase 3 M1): the editor toggle — enters/exits editor mode
   * through the service's single write paths (R2/R3: one signal write, the
   * template follows).
   */
  protected toggleEditor(): void {
    if (this.graph.editorMode()) this.graph.exitEditor();
    else this.graph.enterEditor();
  }

  /**
   * B-120 (D76): the segmented tool control's tap path — the service's
   * single write path for the editor tool (R2/R3).
   */
  protected setEditorTool(tool: EditorTool): void {
    this.graph.setEditorTool(tool);
  }

  /**
   * B-127 (D86): the zoom trio — the service's viewport commands (R2 seams;
   * D2: they write no signals).
   */
  protected zoomIn(): void {
    this.graph.zoomIn();
  }

  protected zoomOut(): void {
    this.graph.zoomOut();
  }

  protected fitToView(): void {
    this.graph.fitToView();
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
