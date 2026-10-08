# ORCHESTRATOR PROMPT — Direction D: Structural rework (desktop shell + authoring flow)

> Paste this prompt into a fresh orchestrator session on a dedicated branch. Companions: `docs/ui-restyle/REPAIRS.md` (executed wholesale, R-0…R-9) and `docs/ui-restyle/PROPOSAL-D-STRUCTURAL.md` (the rework spec — authoritative for every structural claim below).

---

You are the orchestrator for a STRUCTURAL rework round of Travel & Map Explorer: **Direction D — the desktop shell + the canvas-first authoring flow.** Read, in order: `AGENTS.md`, `PRODUCT.md`, `CORE.md`, `EXECUTION-PLAN.md`, `ORCHESTRATION.md`, then the two companion documents above. You own decomposition, packets, review gates, commits on the branch, shared files, and the register. Sub-agents never commit; you commit per packet.

## Mission

**Base note (the owner's sequencing):** the repairs round — REPAIRS.md, R-0 … R-9, including the R-3 pin-setting affordance (which D-4 generalizes) and R-8's keyboard/hover package — is ALREADY MERGED into this branch's base (`develop`). Before the first packet, verify that quickly: the `--tme-*` token layer exists and is consumed by the component SCSS, and R-1's route-occlusion, R-2's boot-zoom, and R-3's pin-menu e2e specs exist in `tests/e2e/`. If the verification shows the repairs are NOT in the base, STOP and report instead of improvising.

Then execute the two structural reworks of PROPOSAL-D §2–§3 as packets **D-1 … D-5 (its §7 order, including the hard gate after D-2: the Shell phase — D-1 + D-2 — must be closed, gates green, before the authoring phase — D-3 … D-5 — starts)**. Do not re-execute REPAIRS.md. Two base interactions to handle deliberately:
- **R-1 (route-occlusion stagger) becomes moot the moment D-2's dock lands** — that is expected, not a conflict. D-2 removes the stagger workaround when the dock replaces the floating default, and updates R-1's e2e to assert dock exclusivity instead. Cite the supersession in D-2's commit.
- **R-8's keyboard/hover package already exists in the base** — D-1 REHOUSES it into the toolbelt shell (same bindings, new homes), never re-implements it.

D replaces the architecture of two surfaces (desktop chrome, authoring flow) and leaves the engine, facade, host layer, and phone layout untouched.

**Visual identity: DO NOT change it in this round.** D is orthogonal to skin — this branch ships the current look with the new structure. Composing D with a visual direction (A/B/C) is a separate round. Do not "helpfully" re-theme while restructuring.

## The rework, operationally (full spec in PROPOSAL-D — follow it verbatim)

- **Scope discipline (§0):** wide regime = `@media (min-width: 1024px)` — the media query that today merely reorders the rail. Below 1024px the chrome stays byte-for-byte today's; **a phone e2e change in a D packet is a defect — investigate immediately** (the one deliberate exception is D-5's connect-banner collapse, which ships its own phone e2e and leaves the 70% sheet cap untouched).
- **Toolbelt shell (D-1, §2.1):** the wide-regime rail becomes a 56px vertical icon toolbelt (24px glyphs on 44px targets, hover tooltips); the mode toggle and save dock move to the header; zoom cluster compact. Keyboard package: 1/2/3 tools, Tab panel cycle, Enter commit, Escape closes the top panel, +/−/0 zoom. Hover via `@media (hover: hover)` only.
- **Context dock (D-2, §2.1):** wide regime hosts exactly ONE docked context panel (280px, right) at a time — property / route / layer manager / maps (context swap, not stack). **The P0 occlusion class dies by construction — no floating-over-each-other in the default.** Floating (B-119's machinery) is preserved VERBATIM as the per-panel opt-in ("float" affordance, remembered positions untouched); docking is the new default around it. The status strip (canvas-bottom line) receives the selection chip, refusal words, and unsaved state, replacing the floating pills (R-9 item 7's fix lives here). The dock's open/close is a panel-driven stage resize — classify it under the D91 discriminator, cite it.
- **Inline naming (D-3, §3.1):** placing a node keeps `upsertNode id:''` + selection EXACTLY as today, but the property panel does NOT auto-open (remove the B-119 editor-maximizes default for placement; entering editor mode itself still maximizes nothing — the panel opens on explicit Details). A compact DOM popover anchors at the node's rendered position: one Name input, focused; Enter commits (upsertNode full-replace, the B-116 PUT precedent), Esc keeps 'New place', click-away commits a typed name. No new facade command; no auto-anything (D10).
- **Node menu (D-4, §3.1):** selection (long-press touch / context-click pointer) opens the object menu: Rename · Set as party location · Connect… · Details · Detach · Delete. This generalizes R-3's pin affordance (same facade call `setCurrentLocation`, same refusal words); "Connect…" enters the existing B-118 quick-connect from the menu (its precondition — selection in editor mode — still holds); "Details" opens the R-5 name-first form unchanged in content.
- **Connect-mode collapse + arc readout (D-5, §3.2–3.3):** in connect mode the banner collapses to a 44px bar above the rail ("Connect: <source> — tap places." + pick count + Done/Cancel); no form is open during connect (the auto-panel is gone, so the phone visible canvas recovers to ~85%+). Draw-arc's pending state gains a status-strip readout ("Arc: <source> → tap the other end"); refusals render in the strip.
- R-5 shipped with the repairs base (Details keeps the name-first form). R-8's items exist in the base and are rehoused by D-1 — do not re-dispatch R-8 as a separate packet.

## Scope and authorizations

- All packets are **B-domain**; no `src/core` / `src/st` changes expected — the rework uses only existing facade commands (`upsertNode`, `setCurrentLocation`, quick-connect's `upsertEdge`). If a packet surfaces a core/host gap, stop the packet, report, re-plan — never reach around the facade (R2).
- **The pin-setting affordance (R-3 in the repairs base, generalized by D-4) was authorized by the repairs brief** (the carried owner item). No drag-the-pin, no auto-set (D10).
- Fences: no undo/multi-select/snapping (F46 — the popover/menu add no history, no multi-target); no new dependency; no hosted fonts; parity per D53/R10 (44px hit floors on BOTH regimes; phone e2e per packet); R1 — the status strip renders core-produced words/numbers only.
- The two NEW composite components (toolbelt, context dock) carry real state machinery (exclusivity, dock↔float handoff) — they are app-layer, R3-compliant (state in the service, template writes through it).

## Register & docs

Register rows under a new round heading (AGENTS.md §6 format): (1) the D-adoption row — provenance critique 26/40 + this brief; (2) the **docked-context-panel regime** (exclusivity, dock↔float handoff, stage-resize classification under D91); (3) the **inline-naming state** (placement → popover → one upsertNode commit; the panel no longer auto-opens on placement). R-3 shipped with the repairs base, its PRODUCT.md sentence included; D-4's node menu is a further user-facing capability — its PRODUCT.md sentence rides D-4. CORE.md untouched (no core changes). Status lines replaced in place; round history in §8.6 item 6 only.

## Verification bar (every packet)

`npm run verify`; then `npm run test:e2e -- --project=desktop` and `-- --project=phone` as SEPARATE commands (R23 ceiling). D96 flake policy. The wide-regime e2e corpus re-baselines HEAVILY in D-1/D-2 — re-baseline deliberately, cite the ruling in each commit, never incidentally. The hard gate after D-2 means: full gate set green on the shell phase before D-3's first commit.

## End state

Full gate set once more; register rows completed with gate numbers; EXECUTION-PLAN §1 + AGENTS.md §4 status replaced in place; then STOP and report: packets closed (D-1…D-5 on top of the merged repairs base, with R-8 noted as rehoused into D-1 and R-1 superseded by D-2), commits by hash, gate numbers, the phone corpus's untouched-ness statement (or the defect if not), deviations from the two companion docs (amend them in the same commit if reality contradicts — never improvise past them), and a suggested polish pass (re-run the impeccable critique after D-5 for the trend against the 26/40 baseline snapshot). Do NOT merge — the branch is the owner's review artifact.
