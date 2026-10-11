// src/app/viewer/inline-naming.component.ts — PKG B-D3 (R29, PROPOSAL-D
// §3.1): the inline-naming popover — "the form follows the node". A placement
// (placeNodeAt) no longer auto-opens the property panel: the placed node
// enters the INLINE NAMING state (the service's `inlineNamingId`, set after
// the selection write) and this component renders ONE Name input anchored at
// the node's captured rendered position. Enter commits through the service's
// commitInlineName (the B-116 PUT precedent — ONE upsertNode full-replace, no
// new facade surface, R2); Escape keeps the C23 default 'New place'; a
// click-away commits a TYPED name and cancels over an empty input (D10:
// nothing auto-commits — empty never renames).
//
// The node-menu precedent governs the surface discipline (B-143): the host is
// a full-stage INERT overlay (pointer-events none) so no canvas gesture is
// ever blocked, only the plate takes input, and the plate is PARKED at the
// anchor captured at open — pans and zooms never chase it. The dismissal
// contract is the B-143r chrome-tap rule: one document-level pointerdown
// capture listener for the component's life; the gesture that OPENED the
// popover can never dismiss it (the placement tap's pointerdown predates the
// flag), and a press on the plate itself is exempt — only a press elsewhere
// resolves the state (commit the typed name / cancel over empty).
//
// R3: events in → service commands out → the template; the input is
// deliberately uncontrolled (no per-keystroke signal writes, D2 — the only
// commit moments are Enter and the outside press, and both read the input's
// value at the moment). OnPush + zoneless. F52/D53: the input is a >= 44px
// target, focused on render unqualified across breakpoints (the phone soft
// keyboard IS the point — the R-5 name-first rationale); no hover-only
// affordance. F46 fence respected: the popover adds no history, no
// multi-select, no snapping.
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterRenderEffect,
  inject,
} from '@angular/core';
import { GraphService } from '../graph/graph.service';

// --- B-D3 presentation geometry (the node-menu's component-owned clamp
// arithmetic: the consumer measures its own DOM; the service never reads the
// DOM, D81) ---------------------------------------------------------------

/**
 * The plate's offset off the captured anchor — the plate's top-left clears
 * the node's own rendered point so the placed node stays visible under the
 * open surface. The node-menu's MENU_OFFSET_PX value (one placement rhythm).
 */
const PLATE_OFFSET_PX = 14;

/**
 * The plate's width cap — the SCSS mirror (the node-menu's 208px band). The
 * clamp's right arm assumes the box never exceeds this.
 */
const PLATE_MAX_W = 208;

/**
 * The plate's height cap for the clamp's bottom arms — one >= 44px input plus
 * the plate's padding/border rounds to 64 (the SCSS mirror; the honest worst
 * case — the plate grows in width, never in height).
 */
const PLATE_MAX_H = 64;

/**
 * The dismissal contract's "any press elsewhere" — the plate's own presses
 * are exempt (the node-menu's PLATE_SELECTOR rule). One document-level
 * `pointerdown` capture listener, registered for the component's life and
 * removed on destroy.
 */
const PLATE_SELECTOR = 'tme-inline-naming, .tme-inline-naming';

@Component({
  selector: 'tme-inline-naming',
  templateUrl: './inline-naming.component.html',
  styleUrl: './inline-naming.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Escape keeps 'New place' — the packet's discard arm, bound at the host
    // so it answers wherever focus stands (the node-menu's host-binding
    // idiom; the input's own keydown.enter is the commit arm).
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class InlineNamingComponent implements OnDestroy {
  protected readonly graph = inject(GraphService);

  /** The stage-sized host — the plate is positioned inside it (see SCSS). */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The one input, read at the commit moments only (uncontrolled — D2). */
  private input(): HTMLInputElement | null {
    return this.host.nativeElement.querySelector<HTMLInputElement>(
      'input[data-testid="tme-inline-name-input"]',
    );
  }

  /**
   * B-D3: the chrome-tap dismissal arm — the node-menu's B-143r rule. The
   * guard answers nothing while no popover stands, so the listener never
   * triggers change detection outside a discrete naming gesture (D2); the
   * opening placement tap's pointerdown predates the flag, so the popover
   * can never dismiss itself.
   */
  private readonly dismissOnOutsidePress = (event: PointerEvent): void => {
    if (this.graph.inlineNamingId() === null) return;
    const target = event.target;
    if (target instanceof Element && target.closest(PLATE_SELECTOR) !== null) return;
    const value = this.input()?.value ?? '';
    // Click-away: a TYPED name commits; an empty input keeps 'New place'
    // (D10 — empty never renames, commits nothing).
    if (value.trim().length > 0) this.graph.commitInlineName(value);
    else this.graph.cancelInlineNaming();
  };

  constructor() {
    document.addEventListener('pointerdown', this.dismissOnOutsidePress, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.dismissOnOutsidePress, true);
  }

  /**
   * B-D3: focus the input on render — the property panel's focusNameOnOpen
   * precedent (the input exists only after the `@if` renders it, so the
   * focus rides an afterRenderEffect). Unqualified across breakpoints —
   * phone too (the soft keyboard is the point, D53). A purely presentational
   * imperative write (the B-119 drag-write class: focus is DOM chrome, never
   * a signal, never a commit).
   */
  private readonly focusOnOpen = afterRenderEffect(() => {
    if (this.graph.inlineNamingId() === null) return;
    this.input()?.focus();
  });

  /** Enter's commit arm — the input's value, verbatim (the service trims). */
  protected commitFromInput(event: Event): void {
    this.graph.commitInlineName((event.target as HTMLInputElement).value);
  }

  /** Escape's discard arm — keep 'New place', close, latch (no command). */
  protected onEscape(): void {
    if (this.graph.inlineNamingId() !== null) this.graph.cancelInlineNaming();
  }

  /**
   * B-D3: the parked plate's clamped position — the captured anchor offset
   * off the node, then clamped into the stage so the plate never overlaps
   * the header band (top) or the status strip's chip band (bottom, >= 1024).
   * Reads the host rect live at bind time (the node-menu pos() precedent —
   * template-call, one run per discrete signal write, never high-frequency,
   * D2), and the LIVE chrome bands (the property panel's readFrame class —
   * both are stage children, so their gBCR deltas are host-relative). The
   * bottom arm's min-LAST ordering encodes the B-148r containment-wins
   * lesson: a tiny stage inverts the bands and the plate still lands inside.
   */
  protected pos(): { x: number; y: number } {
    const anchor = this.graph.inlineNamingAnchor() ?? { x: 0, y: 0 };
    const rect = this.host.nativeElement.getBoundingClientRect();
    let floor = 0;
    let ceiling = Math.max(0, rect.height - PLATE_MAX_H);
    const stage = this.host.nativeElement.closest('.tme-stage');
    const header = stage?.querySelector<HTMLElement>('.tme-header') ?? null;
    if (header !== null && header.offsetParent !== null) {
      floor = Math.max(floor, header.getBoundingClientRect().bottom - rect.top);
    }
    const strip = stage?.querySelector<HTMLElement>('.tme-status-strip') ?? null;
    if (strip !== null && strip.offsetParent !== null) {
      ceiling = Math.min(ceiling, strip.getBoundingClientRect().top - rect.top - PLATE_MAX_H);
    }
    const x = Math.min(Math.max(anchor.x + PLATE_OFFSET_PX, 0), Math.max(0, rect.width - PLATE_MAX_W));
    const y = Math.min(Math.max(anchor.y + PLATE_OFFSET_PX, floor), Math.max(floor, ceiling));
    return { x, y };
  }
}
