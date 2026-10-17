// src/app/viewer/connect-bar.component.ts — PKG B-D5 (R29, PROPOSAL-D §3.2 +
// the store's rulings): the connect BAR — quick-connect's collapsed surface.
// The B-118 banner lived INSIDE the property panel (its connecting branch
// replaced the edit body); D-5's authoring flow moves the whole narration OUT:
// in connect mode NO form is open (the property panel's open() gate refuses
// while connectMode stands — the menu replaced the auto-panel, §3.1), and the
// mode's words live in this ONE 44px bar pinned at the stage's bottom — the
// from-line (the source's live label, C23), the pick count, the tap feedback,
// the Done/Cancel affordances, and the Done-loop's C30 refusal as an attached
// alert line under the bar (the base line stays 44px). The phone recovers its
// visible canvas (the ~70% banner sheet is gone; the 70% sheet CAP is
// untouched — sheets still govern route/property/layers/maps).
//
// Every state read is the service's EXISTING connect signal surface (R3 — the
// same reads the panel's banner branch read today; the service's connect
// machinery is untouched, R2): connectMode/connectPicks/connectFeedback/
// connectRefusal/selection. The handlers are thin — doneConnect/cancelConnect
// verbatim. Escape is a MODE exit (the panel's today-class): one discrete
// keydown, one command, a no-op when the mode is off — deliberately OUTSIDE
// the escapeTopSurface precedence contract (the connect exit never
// participated in it).
//
// The calibrate-band discipline (B-135/D93, the packet's ruling 3): the bar is
// an ABSOLUTE stage overlay that never joins layout flow — a mode flip can
// never resize the stage nor move the viewport (no D81 resize classification).
// The stage-sized host is the node-menu/inline-naming INERT passthrough family
// (pointer-events none; only the bar re-enables) so no canvas gesture is ever
// blocked while the mode is off (and the pick taps own the stage while it is
// on). OnPush + zoneless (D2): the bar flips only on discrete signal writes.
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GraphService } from '../graph/graph.service';

@Component({
  selector: 'tme-connect-bar',
  templateUrl: './connect-bar.component.html',
  styleUrl: './connect-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // B-D5: Escape exits connect mode from the bar (the panel's B-118
    // today-class, moved with the branch — one discrete keydown, one command;
    // a no-op outside the mode).
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class ConnectBarComponent {
  protected readonly graph = inject(GraphService);

  /**
   * The connect source's authored label — the bar's from-line (C23: the live
   * selection label, never an id). The guard effect holds the selection ON the
   * source for the mode's whole life, so this is the source's name exactly
   * (the panel's B-118 sourceLabel computed, minus the draft arm this
   * component never had).
   */
  protected readonly sourceLabel = computed(() => this.graph.selection()?.label ?? '');

  /**
   * The pick count in words (the panel's B-118 pickLine VERBATIM — C23 plain
   * words; a count of picks is UI state, not R1 math).
   */
  protected readonly pickLine = computed((): string => {
    const n = this.graph.connectPicks().size;
    if (n === 0) return 'No places picked yet';
    if (n === 1) return '1 place picked';
    return `${n} places picked`;
  });

  /** B-118: Done — commit one arc per picked target (the service owns the loop). */
  protected confirmConnect(): void {
    this.graph.doneConnect();
  }

  /** B-118: Cancel — discard the whole set, commit nothing (the Done twin). */
  protected abortConnect(): void {
    this.graph.cancelConnect();
  }

  /** B-D5: Escape exits connect mode while connecting (no-op otherwise). */
  protected onEscape(): void {
    if (this.graph.connectMode()) this.graph.cancelConnect();
  }
}
