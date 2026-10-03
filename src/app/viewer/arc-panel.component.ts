// src/app/viewer/arc-panel.component.ts — PKG B-106: the arc panel (ruling 3).
// Rendered by the viewer ONLY while an edge is selected (ruling 1); shows the
// arc's endpoints/modes/blocked state verbatim off the live references
// (ArcInfo — authored labels, authored mode words, D20 merged block state)
// and hosts the chat-scoped blocked toggle: a single-line reason input +
// Block, and Lift wherever the facade contract allows lifting (overlay blocks
// only — an authored block displays its reason with Lift disabled and a
// static note). R1: no number is computed or displayed here; R2: Block/Lift
// go through GraphService's facade commands, never the facade from the
// template; R3: events in → signals out → this template. OnPush + zoneless
// (D2): taps and input keystrokes are discrete — the only writes are signal
// writes. F52/D53: every control is a >= 44px tap target, touch-action
// manipulation, no hover-only affordances.
import { Component, computed, inject, signal } from '@angular/core';
import { GraphService } from '../graph/graph.service';

@Component({
  selector: 'tme-arc-panel',
  templateUrl: './arc-panel.component.html',
  styleUrl: './arc-panel.component.scss',
})
export class ArcPanelComponent {
  protected readonly graph = inject(GraphService);

  /**
   * The selected arc's data (ruling 3): graphRevision is a dependency so a
   * Block/Lift re-reads arcInfo without edgeSelection moving — the reason
   * line flips to the overlay's restated text, Lift enables, live. Null only
   * if the id no longer resolves (map swap races) — the @if hides the body.
   */
  protected readonly arc = computed(() => {
    void this.graph.graphRevision(); // dependency: block/lift re-reads (B-106 ruling 4)
    const sel = this.graph.edgeSelection();
    return sel === null ? null : this.graph.arcInfo(sel.id);
  });

  /**
   * The reason input's value — a controlled input ([value] + signal write on
   * every input event; R3: the handler READS the DOM event, writes a signal,
   * never writes the DOM). Trimmed to '' on submit: the facade's C30 contract
   * refuses empty reasons, and the UI stays honest by disabling Block while
   * the trimmed value is empty (§6.2 spirit — the facade is the authority).
   */
  protected readonly reason = signal('');

  /** The Block button's honest state: enabled iff the trimmed reason is non-empty. */
  protected readonly canBlock = computed(() => this.reason().trim().length > 0);

  /** R3: the input event handler — a DOM read, then the signal write. */
  protected onReasonInput(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  /**
   * F14/C2: block with a reason through the service (R2). Only reachable
   * while canBlock() holds (button disabled otherwise), so the facade's C30
   * throw is structurally out of reach. Clears the input after: the block is
   * now displayed from the live overlay, and re-stating starts fresh.
   */
  protected block(): void {
    const sel = this.graph.edgeSelection();
    const reason = this.reason().trim();
    if (sel === null || reason.length === 0) return;
    this.graph.blockArc(sel.id, reason);
    this.reason.set('');
  }

  /**
   * C2 lift: deletes the overlay entry only (facade contract). An authored
   * block survives — the panel re-renders with the authored reason and the
   * disabled Lift, which is exactly the "overlay can add, never lift" rule
   * made visible.
   */
  protected lift(): void {
    const sel = this.graph.edgeSelection();
    if (sel === null) return;
    this.graph.liftBlock(sel.id);
  }
}
