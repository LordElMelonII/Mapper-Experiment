# PROPOSAL D — Structural rework: the desktop shell + the authoring flow

**Rework direction for Travel & Map Explorer · NOT a reskin.**
Companion to `docs/ui-restyle/REPAIRS.md` (which this direction includes wholesale: R-0 … R-9). Provenance: impeccable critique 2026-10-07 (26/40; snapshot `.impeccable/critique/2026-10-07T20-24-15Z__src-app.md`) and the orchestrator's finding that two surfaces fail at the STRUCTURE level, not the style level. Where A/B/C preserve today's information architecture and change its skin, **D changes the architecture of two surfaces and keeps the engine, the facade, and the phone layout.**

**Mode:** Operate. **Visual identity:** unspecified here by design — D is orthogonal to skin. It composes with A, B, C, or the current identity. If the owner wants a full rework, the recommended stack is **D + A** (structure + identity). A D-only branch is a legitimate test.

---

## 0. What D is and is not

| | In | Out |
|---|---|---|
| Desktop chrome | reworked (wide-regime shell: docked panels, hover, keyboard, slim rail) | the phone layout (untouched; parity = equal quality per surface, D53) |
| Authoring flow | reworked (canvas-first editing: the form follows the node) | view-mode UX (route sheet, snapshot — untouched) |
| Engine/facade | unchanged — every command already exists (R2) | any new facade command; any core file |
| Editor scope fence | unchanged (F46: no undo/multi-select/snapping) | — |

The rework stops where the product's contract begins: no core change, no host-layer change, no behavior the facade cannot express.

## 1. Why structure, not skin (the measured case)

1. **The desktop shell is phone chrome scaled up** (critique, Alex persona): a 152px-wide bottom-bar rail promoted to the left column by a media query, 135×44px "Fit" buttons, a "+" glyph in a 135px-wide button, no hover states, zero keyboard. That is not a styling problem — the *layout container* is wrong for pointer. R-8 patches ergonomics on top of the wrong container; D replaces the container.
2. **The authoring flow fights its users** (critique, Jordan + Casey personas + P1): placing a node opens a 9-group, 838–888px form wall (676px window) for a node auto-named "New place"; on phone, the property sheet leaves ~36% of the canvas visible while connect mode asks the user to "tap places on the map". R-5 mitigates (name-first, collapsed sections). D replaces the pattern: **the form follows the node** — a small inline identity editor at the point of edit, with the full form as an explicit "open details" action, not the default.

Both failures share a root: the UI treats every edit as a *form submission*. Map-editing is not form-filling; it is direct manipulation with occasional text entry.

## 2. Rework 1 — the desktop shell (wide regime only)

**Trigger:** `@media (min-width: 1024px)` — a NEW third breakpoint (correction at execution, D-1 2026-10-10: today's rail-reordering query is the 700px `WIDE_LAYOUT_QUERY`; 1024px did not exist in the tree). After D-1: <700px the phone chrome · 700–1023px today's wide chrome (the rail reorder) byte-for-byte · ≥1024 the D shell. The D81 700px discriminator stays the viewport-behavior authority — the shell query is chrome-only. Phone/medium keeps today's chrome byte-for-byte.

### 2.1 The shell

```
┌──────────────────────────────────────────────────────────────┐
│ header: pin · layer breadcrumb · unit          [save state] │  48px
├───┬──────────────────────────────────────────────────────────┤
│ T │                                                          │
│ o │                 canvas (cytoscape)                       │
│ o │                                                          │
│ l │                                       ┌────────────────┐ │
│ b ├───────────────────────────────────────┤ docked context │ │
│ a │  status strip: selection / refusals   │ panel (280px)  │ │
│ r │                                       └────────────────┘ │
└───┴──────────────────────────────────────────────────────────┘
  56px
```

- **Toolbelt (56px column, left):** vertical icon strip (24px glyphs, 44px hit targets — the parity floor is hit-SIZE, not glyph size), labeled tooltips on hover. Tools: Edit/View toggle, Node, Waypoint, Arc, Route, then a divider, then Layers (opens the layer dock), Maps, zoom cluster (+/−/Fit as compact stacked icons). The current segmented rail buttons' labels become tooltips; the mode toggle and save dock live in the header.
- **Docked context panel (280px, right, exclusive):** exactly ONE context panel docked at a time — property (node/arc selected), route, layer manager, maps. Tabs or a single context swap, not stacked floaters. **This kills the P0 occlusion class by construction** — panels no longer float over each other; the canvas shrinks (the stage re-fits per the D81 rescue-clamp rules — the ONE panel-driven resize is the discriminator-classified case, preserved). A "float" affordance per panel (the B-119 remembered-position machinery, kept) lets an author tear a panel off when they truly want it over the canvas — floating remains, docking is the default.
- **Status strip (bottom of canvas area):** one line — selection chip, refusal words, unsaved state migrate here from the floating pills; kills the three-pill top-edge stack (R-9 item 7) and the banner-over-canvas collisions.
- **Hover affordances** (`@media (hover: hover)`): canvas nodes brighten + cursor pointer; buttons/rows get background tint; tooltips on toolbelt. Phone: none (no regression vector).
- **Keyboard (desktop only, additive):** 1/2/3 tools, Tab panel focus cycle, Enter commit, Escape = close top panel (the R-8 package, rehomed here), +/−/0 zoom.

### 2.2 What stays

The header, breadcrumb, header fields, save contract (F45/D75), the D91 fit regime, the B-119 floating machinery (as the opt-in), the 44px floor, the semantic color contract, the current (or chosen) skin's tokens. The e2e corpus for the wide regime re-baselines deliberately; the phone corpus should pass untouched — **a phone e2e change in a D packet is a defect, investigate immediately.**

## 3. Rework 2 — canvas-first authoring

### 3.1 The placement moment (the form follows the node)

Today (`placeNodeAt`, verified): tap → `upsertNode` with label 'New place' → selection set → the maximized 9-group property panel opens (B-119's editor-maximizes default). The form interrupts a gesture.

D's flow, using ONLY existing facade commands:

1. Tap places the node exactly as today (`upsertNode id:''`, engine id, C5) — **but the panel does NOT open.** The placed node enters an **inline naming state**: a compact DOM popover anchored to the node's rendered position (reuse the render→model projection the rescue clamp already reads): one input (Name, focused, pre-filled placeholder "Name this place"), Enter commits / Esc discards to keep 'New place', click-away commits the typed name. Commit = `upsertNode` full-replace (the B-116 PUT precedent) — one command, no new facade surface.
2. A small node badge-menu appears on selection (long-press/context-click — the R-3 affordance, generalized): **Rename · Set as party location · Connect… · Details · Detach · Delete.** The common verbs live here, at the object, not in a panel.
3. **"Details" opens the full property panel** — R-5's name-first, collapsed-sections form, unchanged in content (all 9 groups, C30 refusals intact). The form becomes the explicit deep edit, not the automatic response to a tap.
4. **Connect…** enters the existing quick-connect mode (B-118) — from the menu, not only from inside the panel (the verified precondition "panel open exactly when a library node is selected" still holds: the menu only exists on selection).

Kind changes after placement (location → hub etc.) live in Details; the placement default (kind 'location', active layer, origin 'authored') is unchanged. Waypoint tool behavior is unchanged (overlay plane, `addUserNodeAt`, kNN).

### 3.2 The connect-mode canvas share (phone)

The connect banner (B-118) today overlaps the canvas the user must tap. D: in connect mode the banner **collapses to a slim bar (44px) pinned above the rail** showing "Connect: <source> — tap places. (Done · Cancel)" — the pick-set count rides in the bar. No form is open during connect mode (the panel is closed by construction: connect mode's precondition is a selected node; the menu replaced the auto-panel). Phone visible-canvas recovery: from ~36% to ~85%+ without touching the 70% sheet cap (which governs route/property/layer/maps sheets, all of which stay sheets).

### 3.3 Arc authoring

Draw-arc's two-tap pending state keeps its dashed-border source marker (B-122) — D adds the pending-target ghost readout to the status strip ("Arc: <source> → tap the other end") so the state never lives in memory alone (the critique's working-memory failure). Refusals render in the status strip (they already have field-precise words).

## 4. What this fixes that the other proposals can't

| Finding | A/B/C | D |
|---|---|---|
| P0 route occlusion (editor, desktop) | stagger/collapse fix | **eliminated by construction** (docked exclusive panel; no stacking) |
| 9-group wall (P1) | R-5 mitigation (name-first within the same panel) | **replaced** — form follows the node; panel is opt-in |
| Phone connect-mode ~36% canvas | untouched (R-5 only shrinks the form) | **~85%** via the collapsed banner (§3.2) |
| Desktop-as-scaled-phone (Alex) | R-8 patches | **replaced** — toolbelt/dock/hover/keyboard shell |
| Working-memory failures (arc pending, draft-commit split) | noted | status strip keeps state visible |
| Detach/Delete below the fold | R-5 footer band | node menu carries them at the object, footer band stays in Details |

Honest costs, stated: the wide-regime e2e corpus re-baselines heavily (the largest re-baseline of any proposal); two new composite components (toolbelt, context dock) with real state machinery (exclusivity, the dock↔float handoff); the D81 fit regime interacts with the new stage-resize case (the dock is another panel-driven resize — the discriminator classifies it; cite it). This is the most expensive proposal by a wide margin.

## 5. Risks & mitigations

- **Biggest blast radius:** the wide-regime shell touches map-viewer layout, all five panels' positioning, the rail, the chip/dock/banner plumbing. Mitigation: two-phase packet plan (§7) with a hard gate between them — Shell phase ships before the authoring phase starts, so a stalled D leaves the repairs + a working shell.
- **Floating machinery regression:** B-119's remembered positions/anchors are subtle (the avoid-the-selection logic). Mitigation: floating is preserved verbatim as the opt-in; docking is a new default around it, not a replacement of it.
- **Phone regression risk:** deliberately near-zero by scope, but the connect-banner change (§3.2) IS a phone-visible change — it ships its own phone e2e and the 70%-cap contract is untouched.
- **Fidelity to D10:** the popover commits nothing the user didn't type; Esc/click-away behavior is explicit; no auto-kind, no auto-anything.

## 6. Register rows required

One round row (the D adoption, provenance critique + this brief); one row for the **docked-context-panel regime** (exclusivity + dock↔float handoff + the stage-resize classification); one row for the **inline-naming state** (placement → popover → commit = one upsertNode; the panel no longer auto-opens). No facade extension, no dependency, no byte cost.

## 7. Packets (after R-0…R-9)

| Packet | Content |
|---|---|
| D-1 | Toolbelt shell: wide-regime rail → icon column, header/save migration, keyboard/hover (R-8 rehomed) |
| D-2 | Context dock: docked exclusive right panel + dock↔float handoff + status strip; panels rehomed (route/property/layers/maps); occlusion e2e now asserts dock exclusivity |
| D-3 | Inline naming popover: placement no longer opens the panel; commit path via upsertNode PUT; Esc/click-away contracts |
| D-4 | Node menu (generalizes R-3): Rename / Set as party location / Connect… / Details / Detach / Delete at the object |
| D-5 | Connect-mode collapse + arc ghost readout (§3.2/§3.3) |

Order: **R-0…R-9 ship on `develop` first (the owner's model) — this branch starts directly at D-1**, with R-8's keyboard/hover package rehoused into the shell and R-1's stagger superseded by D-2's dock (cite both in their commits). R-5 shipped with the base (Details keeps the name-first form).

Each packet: `npm run verify` + both e2e projects as separate commands (R23 ceiling); D96 flake policy; wide-regime re-baselines cite their rulings.

## 8. When to pick D

- The owner lives in editor mode (authoring-heavy use).
- Phase 4's real SillyTavern mount (drawer/popup) is on the horizon — a docked shell adapts to constrained mounts far better than five floating panels.
- The R-repairs re-score lands under ~30/40 — the surface layer wasn't the whole problem.
- Combine with A for the full "what a rework looks like" branch; run D-alone if the identity question should be kept separate from the structure question.
