# ORCHESTRATOR PROMPT — Direction C: "GM's Table" (the physical session desk)

> Paste this prompt into a fresh orchestrator session on a dedicated branch. Companions: `docs/ui-restyle/REPAIRS.md` (executed wholesale, R-0…R-9) and `docs/ui-restyle/PROPOSAL-C-GMS-TABLE.md` (the direction spec — authoritative for every value below).

---

You are the orchestrator for a UI-restyle round of Travel & Map Explorer adopting **Direction C — "GM's Table."** Read, in order: `AGENTS.md`, `PRODUCT.md`, `CORE.md`, `EXECUTION-PLAN.md`, `ORCHESTRATION.md`, then the two companion documents above. You own decomposition, packets, review gates, commits on the branch, shared files, and the register. Sub-agents never commit; you commit per packet.

## Mission

**Base note (the owner's sequencing):** the repairs round — REPAIRS.md, R-0 … R-9, including the R-3 pin-setting affordance (whose menu C-5's pin-drop motion rides) and R-2's boot zoom (which C-3 re-checks against the hand's label floor) — is ALREADY MERGED into this branch's base (`develop`). Before the first packet, verify that quickly: the `--tme-*` token layer exists and is consumed by the component SCSS, and R-1's route-occlusion, R-2's boot-zoom, and R-3's pin-menu e2e specs exist in `tests/e2e/`. If the verification shows the repairs are NOT in the base, STOP and report instead of improvising.

Then restyle the ENTIRE UI to the session-desk identity: this round executes ONLY the direction packets **C-1 … C-5 (PROPOSAL-C §6, in order)**. Do not re-execute REPAIRS.md.

## The direction, operationally (full spec in PROPOSAL-C — follow it verbatim)

- **World:** the GM's desk at night — deep felt ground, index-card panels, a brass pushpin. Warm and lived-with, never heraldic: no parchment, no wax seals, no rotation, no texture rasters.
- **Key tokens** (§2.1 authoritative): felt ground `#1a211b` + CSS radial vignette (~6% edge darkening, zero bytes); card `#20261f`; card edge `#3a4032`; **strap bar `#8a6d3f`, 3px, across every card's top edge** (the recurring identity mark); text `#e8e3d5`/`#a8a294`/`#8b8676`; **brass `#ffd166` narrowed to exactly three meanings — pin, primary commit, route total**; teal `#4db6ac` unchanged; destructive red warms to `#d97b72` (canvas blocked arcs stay `#e08a84`); node taxonomy unchanged.
- **Type:** system sans everywhere EXCEPT the map's own words — **Patrick Hand (one weight, one woff2 latin-core subset ~18–22KB gz) for node labels, map title, and place names in the route sheet/Maps rows at ≤15–17px.** THE DISCIPLINE RULE (structural, checked at finish): the hand NEVER appears in panels, buttons, headers, or costs. Fallback `system-ui` (degrade, C32). Scale ≥1.25 steps (12/13/16/20).
- **Form:** cards 4px radius + strap bar + hairline; **no shadows** (dragged state lifts via 2px edge); cards sit square to the desk (rotation fails the Operate bar — never).
- **Canvas** (`src/app/graph/layer-elements.ts`, packet C-3): labels re-set in the hand — preserve declaration ORDER exactly (no-specificity cascade; last match wins), no `min-zoomed-font-size` on labels (B-107), badges cull with content (B-115). If the hand's legibility floor lands lower than sans's, the R-2 phone boot zoom clamps to the HAND's floor — labels win over extent.
- **Signature moment:** setting the pin (R-3's menu) drops the brass pin — scale 1.4→1 settle, ~120ms, `prefers-reduced-motion` renders in place (packet C-5, the only motion).
- **First viewport (mapless):** felt + vignette + one faint chalk ring (1px CSS circle, ~4% bone opacity) + one line in the hand at 17px: "Clear the table. Name your world." (packet C-4).

## Scope and authorizations

- All packets are **B-domain**; no `src/core` / `src/st` changes expected — if one surfaces, stop the packet, report, re-plan.
- **The pin-setting affordance (REPAIRS R-3) is authorized by this brief** (the carried owner item): wires the existing `setCurrentLocation`, long-press/context-click menu, no drag-pin, no auto-set (D10/R2). C-5's pin-drop motion is the affordance's feedback, not a new behavior.
- **New-asset register row required:** the Patrick Hand subset is a bundled asset (~18–22KB gz) — AGENTS.md §6 requires a register entry; the D8 1.5MB build gate enforces the budget.
- Fences: no undo/multi-select/snapping (F46); no hosted fonts/CDNs; parity per D53/R10 (≥44px, phone e2e per packet); R1/R2 untouched.
- **Owner-risk acknowledgment (from the proposal §5):** this is the direction closest to costume, and the green ground is the least host-neutral. The discipline rules (hand placement, square cards, desaturated felt) are what keep it a design and not a theme — the finish review checks them; if a finding shows the direction tipping, tighten the discipline rather than adding warmth.

## Register & docs

- Register rows under a new round heading (AGENTS.md §6 format): (1) direction adoption — GM's Table, provenance critique 26/40 + this brief, the three discipline rules recorded as conventions; (2) the font-subset asset row with measured gz delta. R-3 shipped with the repairs base, its PRODUCT.md sentence included. CORE.md untouched. Status lines replaced in place; round history in §8.6 item 6 only.

## Verification bar (every packet)

`npm run verify`; then `npm run test:e2e -- --project=desktop` and `-- --project=phone` as SEPARATE commands (R23 ceiling). D96 flake policy. Geometry e2e re-baselined deliberately with the ruling cited; C-3 re-baselines label-visible specs and re-checks the R-2 boot-zoom floor against the hand's legibility (cite the clamping decision in the commit).

## End state

Full gate set once more; register rows completed with gate numbers; EXECUTION-PLAN §1 + AGENTS.md §4 status replaced in place; then STOP and report: packets closed (C-1…C-5 on top of the merged repairs base), commits by hash, gate numbers, the bundle's min+gz figure against the 1.5MB budget, the three discipline rules' status (held/broken — a broken rule is a finding against the direction, not a style note), deviations from the two companion docs (amend them in the same commit if reality contradicts — never improvise past them), and a suggested polish pass (re-run the impeccable critique after C-5 for the trend against the 26/40 baseline snapshot). Do NOT merge — the branch is the owner's review artifact.
