// src/app/viewer/legend.component.ts — PKG B-147 (REPAIRS R-7): the
// node-kind LEGEND — the canvas taxonomy's key (the recognition finding:
// location/hub/waypoint hues and the dashed district have no glossary
// anywhere). Built as a component now; under the direction proposals it
// becomes the type-system key.
//
// The rows are STATIC taxonomy — the canvas's four visually-distinct node
// classes (GRAPH_STYLESHEET, graph.service.ts: the `node.tme-<kind>` hue
// entries and the district's dashed compound-parent box), mirrored by the
// R-0 token catalog. The kinds world/region/city have NO distinct canvas
// rendering today (no stylesheet entry — grep-proven; childless they render
// the default node body, as parents they still render the default shape —
// only district gets the container box), so the legend lists exactly the
// four classes the canvas actually draws; it never invents a swatch (the
// packet's honesty ruling). Words are the property panel's kind-select
// voice (NODE_KIND_OPTIONS — C23 plain words). Colors are the tokens, never
// a hex (R0). No service state, no canvas reads — presentation chrome only
// (R2/R4 untouched); every row is the same in every state.
//
// F52/D53: the toggle is one ≥44px tap target, touch-alone operable, aria-
// expanded honest; the collapse state is component-local VIEW chrome (the
// B-114 rail precedent) — default COLLAPSED (the legend is reference
// material, not an action surface; the rail is the author's persistent
// chrome and its D86 section order is standing law — the legend joins the
// body's flow at the END, it re-orders nothing).
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GraphService } from '../graph/graph.service';

/** One legend row: the kind's plain word (C23) + its swatch class (the SCSS styles from the tokens). */
interface LegendRow {
  readonly kind: string;
  readonly swatch: 'location' | 'hub' | 'waypoint' | 'district';
}

const LEGEND_ROWS: readonly LegendRow[] = [
  { kind: 'Location', swatch: 'location' },
  { kind: 'Hub', swatch: 'hub' },
  { kind: 'Waypoint', swatch: 'waypoint' },
  { kind: 'District', swatch: 'district' }, // the dashed container box (F07 compound parent)
];

@Component({
  selector: 'tme-legend',
  templateUrl: './legend.component.html',
  styleUrl: './legend.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegendComponent {
  protected readonly rows = LEGEND_ROWS;
  protected readonly expanded = signal(false);
  protected toggle(): void {
    this.expanded.update((open) => !open);
  }

  /**
   * B-D1 (R29, PROPOSAL-D §2.1): the SHELL regime read — at ≥1024 the
   * toggle renders as one belt icon (glyph visible, word in the shell-gated
   * attributes). The legend stays presentation chrome: this is the same
   * viewer-chrome regime signal the rail gates on (the panelFloating
   * class), read-only here — no service state is written (R2/R4 hold).
   */
  protected readonly shellWide = inject(GraphService).shellWide;

  /**
   * B-D1: a belt attribute's shell-gated value — the plain word (C23) at
   * ≥1024, null below it (Angular drops the attribute: the sub-1024 DOM is
   * byte-identical). The rail's beltWord twin.
   */
  protected beltWord(word: string): string | null {
    return this.shellWide() ? word : null;
  }
}
