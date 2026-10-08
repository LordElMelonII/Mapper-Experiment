# UI Repairs & Suggestions — Direction-Independent (R0–R9)

**Status:** Proposal packet for the R29+ UI-restyle effort. Derived from the impeccable critique of 2026-10-07 (dual-agent; snapshot at `.impeccable/critique/2026-10-07T20-24-15Z__src-app.md`, baseline **26/40**; screenshots in `tmp-critique/`).
**Scope rule:** everything in this file is independent of the visual direction eventually chosen (Atlas Plate / Journey Ledger / GM's Table / Structural / none). It carries the two P0 findings, both P1s, every detector finding, and the recognition/ergonomics gaps. **Sequencing (owner's model, R28+):** this file runs ONCE, directly on `develop` (see `ORCHESTRATOR-PROMPT-REPAIRS.md`); the direction branches (`restyle-A`/`B`/`C`/`D`) are cut from `develop` AFTER it merges and build on the merged base — they do not re-execute this file.

**Out of scope (fences, do not re-litigate):** undo / multi-select / snapping (F46); any new core facade command (the one UI addition below wires the EXISTING `setCurrentLocation` — R2 intact); new dependencies; identity/theming changes (that is the direction files' business).

**Domain note for the orchestrator:** every packet below is B-domain (UI/harness). No `src/core` or `src/st` file changes are expected; A and C are not dispatched unless a packet turns one up (report it, stop, re-plan).

---

## R0 — Token foundation (prerequisite for everything else)

**Problem:** design values are hardcoded hex per component — 8 SCSS files plus the cytoscape canvas stylesheet in `src/app/graph/layer-elements.ts` each carry their own copies (`#14171c`, `#ffd166`, `#e6ebf2`, …). There is no CSS custom-property layer. Any restyle means touching every file twice, and drift between DOM and canvas is invisible until it ships.

**Fix:** introduce a `--tme-*` custom-property block (one file, imported once at the harness root — `src/app/app.scss` is the natural host) covering: ground, plate/surface, hairline, three text tiers, accent roles (gold/teal/red/warn), node-kind taxonomy colors, radius steps, and the 44px control rhythm. All 8 SCSS files consume the properties; `layer-elements.ts` derives its canvas stylesheet colors from the same named constants (a TS const map is fine — cytoscape stylesheets are JS strings; the point is ONE source per value, consumed by both planes).

**Constraints:** zero behavior change. Cytoscape gotchas bind the canvas side: the stylesheet cascade has NO CSS specificity (last match per property wins — preserve declaration order exactly while renaming values), and `min-zoomed-font-size` semantics stay untouched.

**Acceptance:** `npm run verify` green; desktop + phone e2e green (separate commands); a grep audit shows no raw accent/ground hex literals left in component SCSS outside the token file.

## R1 — Route-answer integrity (P0: occlusion in editor mode)

**Problem (measured):** in editor mode on desktop, the maximized property panel and the route floater share the same anchor; property paints later and fully covers route rect(164,420,288,368) with rect(164,112,288,676) — while the rail's Route toggle glows active (`aria-pressed`). The product's payoff (the priced route) is invisible exactly when asked.

**Fix (either is acceptable; stagger is cheaper):**
1. Stagger anchors — route floats bottom-left, property bottom-right, when both are open in editor mode; or
2. Auto-collapse the route floater to its drag-header strip when the property panel opens, restoring on close.

Either way: a floater must never report active (`aria-pressed` / gold toggle) while fully occluded. The rail toggle state must reflect real visibility.

**Acceptance:** new e2e spec asserting the route total's bounding box is on-screen and not covered by the property panel's box, in desktop editor mode with both panels open. Phone sheets unaffected (they stack by contract, 70% cap).

## R2 — Phone boot zoom (P0: illegible first paint)

**Problem (measured):** FX1 boots on the 390×844 stage at zoom 0.282; all 15 node labels cull below the zoom floor — the world renders as anonymous specks, the pin is a ~12px dot. The phone glance ("where are we, what's next?") is the primary mobile moment; today it demands a pinch before anything means anything.

**Fix:** phone (and only phone — desktop fit is fine) boots to a **pin-centered, label-legible zoom**: center the viewport on the pin and pick the zoom floor at which labels survive (the label hide-floor is known behavior — boot AT it, not below it), clamped so a lone pin doesn't over-zoom. "Fit" remains the explicit full-world ask, unchanged. Mapless boot is unaffected.

**Acceptance:** re-baselined boot-zoom e2e on the phone project asserting: pin present, zoom ≥ label-survival floor, pin within the middle half of the stage. Cite the ruling in the commit (the R23 resize-pin gotcha: assert pin refit by in-box content, never a zoom-delta proxy).

## R3 — Pin-setting affordance (the carried owner item — authorized by this brief)

**Problem:** `setCurrentLocation` has no app-layer caller (known carried owner item since M4). A user who authors a map cannot set where the party is; the route panel answers the gap with a dangling "→ New place" (empty origin). The core loop is unfinishable without the Phase-4 host flows.

**Fix:** long-press on a node (touch) / context-click (pointer) opens a small node menu with "Set as party location" → `graph`/facade `setCurrentLocation(nodeId)`. Also add a "clear" arm (`setCurrentLocation(null)`) mirroring the facade. The pin moves per core rules (leaf nodes only — core already validates; a refused set renders the core's words, C30/C32 style). Route panel empty-origin state becomes a sentence: "Set where the party is to route from here." (kills the dangling arrow with the same packet).

**Fences:** no drag-the-pin affordance (D10 adjacency: setting is explicit, per node, user-initiated); no auto-set ever. R1/R2/R3 are the packets the core loop depends on — sequence them first.

**Acceptance:** e2e (both projects, long-press via the touch twin pattern) — set pin on a node → header/breadcrumb reflects it; route from it works; clear restores the empty state; refused set (container node) shows words, pin unchanged.

## R4 — Degraded-state copy (P1: ghost punctuation)

**Problem (measured):** mapless header renders "· ·" (two separators around empty spans); a fresh map renders "· units"; pinless route target renders "→ New place" with no origin. Newcomers meet typographic debris at the exact moments they're lost.

**Fix:** the header triplet (location · layer · unit) collapses empty segments — separators render only between present values. Every "empty half of a sentence" state gets a full sentence that names the missing thing and the action: the route-origin sentence lives in R3; audit sibling states (route target, snapshot lines, template preview) for the same pattern and fix in this packet.

**Acceptance:** mapless boot shows no dangling separators; fresh-map header shows the unit only with a label; e2e asserts the mapless header's rendered text.

## R5 — Name-first property form (P1: the 9-group wall)

**Problem (measured):** the property panel is 838–888px of form in a 676px window: Name, Kind, Parent, Layer, Opens layer, Aliases, Description, Block access + Reason, then Detach/Delete at the scroll floor. Placing a node opens this wall pre-emptively for a node auto-named "New place".

**Fix:** name-first pattern — on open, focus + select the Name input; group Identity (Name/Kind/Description) expanded, everything else (Parent/Layer/Opens layer/Aliases/Block access) behind collapsed section toggles with summary values in the toggle row; Detach/Delete pinned to a constant footer band styled as a danger zone (red hairline top edge), never scrolling away. Keep the Done/Cancel contract and every command byte-identical (R2 — this is presentation only).

**Acceptance:** e2e — place node → property opens with Name focused; advanced sections collapsed by default, expandable; Detach/Delete visible without scroll; existing property-panel e2e re-baselined deliberately.

## R6 — Craft & detector batch (all detector findings + the two foreign-object controls)

Items, each verifiable against the critique snapshot:
1. **Dim slider** (`src/app/viewer/editor-rail.component.ts`, the rail's Dim row): native UA control renders white/Arial in the dark rail on both breakpoints. Fix: `color-scheme: dark` + `accent-color` on the range input (two lines, also fixes the phone rail).
2. **Placeholder contrast** (`src/app/viewer/layer-manager.component.html:225` "Image URL" and siblings): `#757575` on `#14171c` = 3.9:1. Fix: raise placeholder/text-muted to ≥4.5:1 per the token's text-muted tier.
3. **Zero-offset gold glow** (`dark-glow`, `#ffba00`): remove the glow; warn/calibrate states keep color via border/text, not shadow.
4. **1px-border + 24px-shadow** (`gpt-thin-border-wide-shadow`): replace wide shadows with flat plates — hairline edge, no blur (or ≤4px for the dragged state only).
5. **Root cramped padding** (`cramped-padding` on `tme-root`): give children a bottom inset.
6. **Clipped overflow** (`clipped-overflow-container` ×2: `tme-stage`, open layer-manager): audit positioned children against the clip; give the layer-manager's open state room or scroll.
7. **File input** (Maps panel "Import a map file"): restyle as a real button affordance ("Choose file…"), not a text field.
8. **Mode casing split:** chips render "Walk" (CSS capitalize) while legs say "walk". Unify at ONE display formatter in the app layer — every mode word in the UI renders through it (pick lowercase to match the legs and the C23 plain-word voice; apply once).

**Acceptance:** `impeccable detect --json src/app` returns only the known `broken-image` false positive (Angular `[src]` binding — documented, leave); manual pass on both breakpoints for slider/file-input; casing e2e or unit assertion on the formatter.

## R7 — Recognition aids (score-6 heuristic: 2/4)

1. **Node-kind legend:** the canvas taxonomy (location `#4f81b5`, hub `#b0813f`, waypoint `#8064b8`, dashed district) has no key anywhere. Add a collapsible legend (rail footer or plate section): swatch + kind word. This becomes the type-system key under directions A/C — build it as a component now.
2. **First-run placement hint:** nothing teaches that edit-mode canvas taps place places. Add a D79-style one-time hint pill on first entry to edit mode with a fresh/empty map: "Tap the map to place a place." (the hint-pill pattern and one-time arm already exist for calibrate — reuse).
3. **Rename nudge:** the second consecutive unnamed "New place" placement re-opens/focuses the property Name (R5's name-first makes this cheap) — the author names as they go instead of harvesting anonymous dots.

**Acceptance:** e2e — legend renders and toggles; hint arms once, dismisses, never returns (the D79 one-time contract).

## R8 — Pointer-world ergonomics (parity-safe)

Zero keyboard support today; no hover states on pointer. All additive, phone parity untouched:
1. Enter commits single-field forms (map name, create/paste importers); Escape dismisses the top-most panel/dialog (existing dismiss contract, keyboard-triggered).
2. Hover states on pointer devices (`@media (hover: hover)`) — border/text brightening only, no layout shift.
3. Zoom controls respond to +/- keys when the canvas has focus; 0 = fit. (No canvas arrow-nudge — that's node *movement*, fenced by the editor-scope discipline for this round.)

**Acceptance:** desktop e2e for Enter/Escape/zoom keys; phone project untouched by hover (assert no hover-dependent assertion added).

## R9 — Minor batch (from the critique's minor observations)

1. Unify floater chrome: drag + collapse affordance class shared by route/property/layer-manager/maps/arc (maps floater currently lacks both; collapse idioms "Hide/Show" vs "Route ▾" converge to one pattern).
2. Fix inverted Restore/Maximize labels (four panels carry `Maximize` strings; semantics verified inverted — "Restore" floats, "Maximize" re-docks).
3. Route legs: stop mid-cost wrap on phone (two-column leg row or nowrap+ellipsis on the cost).
4. Phone corner state: route sheet expanded + Maps sheet open overflows (route section paints into the Maps band) — cap or hand off per the 70% stack contract.
5. Layer-manager rows: background sub-form behind an expander (rows are 6 lines today).
6. Harness fixture-speak: "(FX1)" in the picker row is dev-speak — display the map name only.
7. Top-edge pill stack: chip + calibrate band + save dock stack three pills in edit mode with unsaved changes — give the header band one reserved row (collapse rules), no overlap at 70% stack.

**Acceptance:** existing e2e suites green (several of these are covered); new assertions only for the corner-state fix (4) and the expander (5).

---

## Packet plan, sequencing, and gates

| Packet | Agent | Content | New e2e |
|---|---|---|---|
| R-0 | B | Token foundation | none (pure refactor; full suites must stay green) |
| R-1 | B | Route occlusion + toggle honesty | route-visible assert (desktop) |
| R-2 | B | Phone boot zoom | boot-zoom re-baseline (phone) |
| R-3 | B | Pin-set affordance + route-origin sentence | pin set/clear/refusal (both projects) |
| R-4 | B | Degraded-state copy | mapless header text |
| R-5 | B | Name-first property form + danger footer | name-focus, footer-visible |
| R-6 | B | Craft/detector batch | formatter assertion |
| R-7 | B | Legend + first-run hint + rename nudge | legend, hint-once |
| R-8 | B | Pointer ergonomics | Enter/Escape/zoom keys (desktop) |
| R-9 | B | Minor batch | corner-state, expander |

**Order:** R-0 → R-1 → R-2 → R-3 → R-4 → R-5 → R-6 → R-7 → R-8 → R-9. R-0 is load-bearing for everything; R-1/R-2/R-3 are the core-loop packets and must not slip past R-5.

**Gates per packet:** `npm run verify`; then `npm run test:e2e -- --project=desktop` and `npm run test:e2e -- --project=phone` as SEPARATE commands (the R23 command ceiling — never one whole-suite call). Known-flake policy per D96 (retries: 1; a surviving reproducible failure is a finding).

**Docs sync:** R-3 changes user-facing capability (the pin affordance) — PRODUCT.md's presence/pin rows get the in-app affordance sentence in the same commit; R-6's casing formatter and R-0's token layer are app-internal (no PRODUCT/CORE change); CORE.md is untouched by this whole file (no core files change).

**Expected score movement:** R1–R5 + R6 address heuristics 1, 2, 8, 9 and both P0s; plausible post-gate re-score low-30s/40. Re-run the critique after the round for the trend line.
