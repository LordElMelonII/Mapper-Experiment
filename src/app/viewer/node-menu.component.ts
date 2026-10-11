// src/app/viewer/node-menu.component.ts — PKG B-143 (docs/ui-restyle/
// REPAIRS.md §R3), generalized by B-D4 (R29, PROPOSAL-D §3.1): the node
// menu — the app's FIRST setCurrentLocation caller and now also home of
// the six object verbs (Rename · Set as party location · Connect… ·
// Details · Detach from arcs · Delete). The service holds the menu state
// (the `nodeMenu` signal); this component is its viewer surface, bound
// template-only (R3): the component mutates nothing itself, every arm
// hands the choice straight back through the service's blockArc-shaped
// command wrappers (R2 — no new facade surface), and state flows one way
// (events in → signals out → this template). OnPush + zoneless (D2): the
// menu opens/closes exclusively on discrete user gestures (the
// taphold/cxttap binding, the arms, the dismissal paths), never on canvas
// drags or pans — the menu is PARKED at its captured rendered position,
// and pointer/pan gestures keep working under it while it stands. The
// authoring rows gate on editor mode + a LIBRARY node (a live per-CD-pass
// `nodeDataById` read, the isPartyLocation precedent — an overlay
// waypoint keeps today's exact {Set/Clear} shape; connect's own
// precondition governs, no duplicated validator gating).
//
// A dedicated component (not a map-viewer template slice) because it is a
// self-contained interactive surface with its own geometry discipline
// (capture-cheap clamp, the F52 arms) — the same seams the route panel's
// clamp and the calibrate band's controls own in their own files; the
// viewer's stage markup stays declarative only.
import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, inject } from '@angular/core';
import { GraphService } from '../graph/graph.service';

// --- B-143 presentation geometry (component-owned clamp arithmetic; the
// B-119 ClampFrame class: the consumer measures its own DOM; the service
// never reads the DOM, D81) -------------------------------------------------

/**
 * The menu's offset off the captured rendered anchor — the menu's top-left
 * clears the node's own rendered point by this much so the long-pressed
 * node stays visible under the open surface. A LAYOUT constant (the
 * NODE_BLOCK_BADGE_OFFSET class — R1: presentation placement, never
 * computed geography).
 */
const MENU_OFFSET_PX = 14;

/**
 * The menu's width cap — the SCSS `max-width` mirror. The clamp's right arm
 * assumes the LOGICAL box never exceeds this, so the rendered plate stays
 * inside the stage when its left edge is clamped to `stage.w − MENU_MAX_W`.
 */
const MENU_MAX_W = 208;

/**
 * The menu's height cap for the clamp's bottom arm — the honest worst case
 * of the VIEW-mode plate (B-143's own content, unchanged by B-D4): label +
 * the Set/Clear arms + a wrapped multi-line refusal rounds to 260. A menu
 * taller than this cap could paint past the stage's bottom edge on a tiny
 * stage (an honest degrade, never a throw — C32 spirit). The SCSS rides
 * the same content, so real heights stay under the cap.
 */
const MENU_MAX_H = 260;

/**
 * B-D4 (R29, PROPOSAL-D §3.1): the EDITOR-mode plate's height cap — the
 * honest worst case of the six-verb menu: the worst render is the pinned
 * library node (Set AND Clear co-occur — SEVEN 44px rows):
 *   padding 12 (6+6) + label ~42 (2 wrapped lines) + 7×44 = 308
 *   + refusal ~65 (3 wrapped lines) + 8 gaps × 2 = 16  →  443, rounded to
 * 448 for slack. The clamp ALSO gains a header FLOOR (the inline-naming
 * pos() precedent, same stage/bands) because this cap exceeds a phone
 * stage's height (445px): without the floor the bottom arm degenerates
 * (`max(0, 445−448)` = 0) and every editor menu parks at the stage's very
 * top, covering the header band's chip — its tap would never land. With
 * the floor, an editor menu parks BELOW the header (real heights ~311–404
 * still fit a 445px stage; the pathological 7-row + wrapped-refusal case
 * paints past the bottom edge — the documented honest degrade, C32). View
 * mode keeps the 260 cap byte-identically: its real plate is short, and
 * the old clamp geometry is load-bearing staging for the dismissal corpus.
 */
const EDITOR_MENU_MAX_H = 448;

/**
 * The dismissal contract's "any tap elsewhere" includes VIEWER CHROME, not
 * just the canvas: a press on a zoom button, the selection chip, a sheet
 * body — anything that is not the parked plate itself — closes the menu
 * (B-143r, the resume addendum's (d) ruling). One document-level
 * `pointerdown` capture listener, registered for the component's life and
 * removed on destroy. A PRESS, not a click: the gesture that OPENED the
 * menu can never dismiss it — `taphold` fires mid-hold (the opening
 * pointerdown predates the menu) and `cxttap` at release (no later
 * pointerdown follows) — so the exempt set is exactly the plate's own
 * presses (the two arms keep their clicks). Canvas presses flow through
 * unchanged (the stage host is pointer-events:none; the press reaches cy,
 * whose own tap hooks then re-write the same closed state — idempotent).
 */
const PLATE_SELECTOR = 'tme-node-menu, .tme-node-menu';

@Component({
  selector: 'tme-node-menu',
  templateUrl: './node-menu.component.html',
  styleUrl: './node-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // B-148 (REPAIRS §R8, packet ruling 2): Escape can dismiss the menu too —
    // it takes the press only while parked AND painted as the top-most
    // surface (the service's precedence; the plate's z-17 sits above the
    // sheet stack). The dismissal is the SAME closeNodeMenu() call the
    // outside-tap arm below makes — the menu's plain-tap semantics stay
    // byte-identical (the R-3 landmine): keyboard Escape is additive chrome,
    // never a second dismissal path.
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class NodeMenuComponent implements OnDestroy {
  protected readonly graph = inject(GraphService);

  /** The stage-sized host (the plate is positioned INSIDE it — see SCSS). */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * B-143r (addendum d): the chrome-tap dismissal arm — see PLATE_SELECTOR's
   * block. R3/D2: events in → one signal out; the handler is a no-op read
   * when nothing is parked, so it never triggers change detection outside a
   * discrete menu gesture.
   */
  private readonly dismissOnOutsidePress = (event: PointerEvent): void => {
    if (this.graph.nodeMenu() === null) return;
    const target = event.target;
    if (target instanceof Element && target.closest(PLATE_SELECTOR) !== null) return;
    this.graph.closeNodeMenu();
  };

  constructor() {
    document.addEventListener('pointerdown', this.dismissOnOutsidePress, true);
  }

  /**
   * B-148 (REPAIRS §R8, packet ruling 2): Escape — only when the menu is
   * parked AND the service reads it as the top-most open surface; otherwise
   * a silent no-op. C32 degrade-never-throw: a keydown over a closed menu
   * (or under an open management panel — the z-paint authority) changes
   * nothing, throws nothing.
   */
  protected onEscape(): void {
    if (this.graph.nodeMenu() !== null && this.graph.escapeTopSurface() === 'node-menu') {
      this.graph.closeNodeMenu();
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.dismissOnOutsidePress, true);
  }

  /**
   * B-143: the parked menu's clamped position — the captured rendered point
   * (canvas-relative == host-relative: the host is the stage-sized inset-0
   * overlay) offset off the node, then clamped into the stage bounds. Reads
   * the host rect live at bind time (template-call, the calibrateScalePercent
   * precedent — one call per discrete signal write, never high-frequency,
   * D2), so a menu opening against any stage edge lands inside.
   * B-D4 (R29, PROPOSAL-D §3.1): the clamp is regime-aware and gains the
   * inline-naming pos() FLOOR — the header band's bottom. The cap is the
   * MODE's honest worst case (the authoring rows render only in editor mode
   * over a library node — the same live reads the template gates on): view
   * mode keeps the 260 cap (byte-identical parking for the short plate —
   * load-bearing staging geometry), editor mode clamps against 448, which
   * exceeds a phone stage's height — the FLOOR is what keeps that plate
   * below the header band (the chip's taps must always land) instead of
   * degenerating to the stage's top edge. The min-LAST ordering encodes the
   * B-148r containment-wins lesson: a tiny stage inverts the bands and the
   * plate still lands inside.
   */
  protected pos(): { x: number; y: number } {
    const menu = this.graph.nodeMenu();
    if (menu === null) return { x: 0, y: 0 };
    const rect = this.host.nativeElement.getBoundingClientRect();
    const cap =
      this.graph.editorMode() && this.graph.nodeDataById(menu.nodeId) !== null
        ? EDITOR_MENU_MAX_H
        : MENU_MAX_H;
    let floor = 0;
    const stage = this.host.nativeElement.closest('.tme-stage');
    const header = stage?.querySelector<HTMLElement>('.tme-header') ?? null;
    if (header !== null && header.offsetParent !== null) {
      floor = Math.max(floor, header.getBoundingClientRect().bottom - rect.top);
    }
    const clampedX = Math.min(Math.max(menu.x + MENU_OFFSET_PX, 0), Math.max(0, rect.width - MENU_MAX_W));
    const clampedY = Math.min(Math.max(menu.y + MENU_OFFSET_PX, floor), Math.max(floor, rect.height - cap));
    return { x: clampedX, y: clampedY };
  }

  /** B-143: the menu's Set arm — the service's R2 command, verbatim. */
  protected setLocation(nodeId: string): void {
    this.graph.setNodeAsLocation(nodeId);
  }

  /** B-143: the menu's Clear arm — the service's R2 command, verbatim. */
  protected clearLocation(nodeId: string): void {
    this.graph.clearNodeLocation(nodeId);
  }

  // --- B-D4 (R29, PROPOSAL-D §3.1): the five authoring arms — thin handlers
  // to the service's menu verbs (R3: events in → one command out; every
  // ordering rule — select-first, latch teardown, refusal rendering — lives
  // in the service where the state it touches lives).

  /** B-D4: the Rename arm — the seeded inline-naming re-open. */
  protected rename(nodeId: string): void {
    this.graph.renameNodeFromMenu(nodeId);
  }

  /** B-D4: the Connect… arm — the existing quick-connect entry. */
  protected connect(nodeId: string): void {
    this.graph.connectNodeFromMenu(nodeId);
  }

  /** B-D4: the Details arm — the panel's preserved seeding path. */
  protected details(nodeId: string): void {
    this.graph.openNodeDetailsFromMenu(nodeId);
  }

  /** B-D4: the Detach arm — F54 through the panel's own command. */
  protected detach(nodeId: string): void {
    this.graph.detachNodeFromMenu(nodeId);
  }

  /** B-D4: the Delete arm — F46 through the panel's own command. */
  protected deleteNode(nodeId: string): void {
    this.graph.deleteNodeFromMenu(nodeId);
  }
}
