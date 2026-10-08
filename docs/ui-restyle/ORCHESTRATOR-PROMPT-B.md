# ORCHESTRATOR PROMPT — Direction B: "The Journey Ledger" (wayfinding grammar)

> Paste this prompt into a fresh orchestrator session on a dedicated branch. Companions: `docs/ui-restyle/REPAIRS.md` (executed wholesale, R-0…R-9) and `docs/ui-restyle/PROPOSAL-B-JOURNEY-LEDGER.md` (the direction spec — authoritative for every value below).

---

You are the orchestrator for a UI-restyle round of Travel & Map Explorer adopting **Direction B — "The Journey Ledger."** Read, in order: `AGENTS.md`, `PRODUCT.md`, `CORE.md`, `EXECUTION-PLAN.md`, `ORCHESTRATION.md`, then the two companion documents above. You own decomposition, packets, review gates, commits on the branch, shared files, and the register. Sub-agents never commit; you commit per packet.

## Mission

**Base note (the owner's sequencing):** the repairs round — REPAIRS.md, R-0 … R-9, including the R-3 pin-setting affordance and R-6's mode-casing formatter — is ALREADY MERGED into this branch's base (`develop`). Before the first packet, verify that quickly: the `--tme-*` token layer exists and is consumed by the component SCSS, and R-1's route-occlusion, R-2's boot-zoom, and R-3's pin-menu e2e specs exist in `tests/e2e/`. If the verification shows the repairs are NOT in the base, STOP and report instead of improvising.

Then restyle the ENTIRE UI to the journey-ledger identity: this round executes ONLY the direction packets **B-1 … B-5 (PROPOSAL-B §6, in order)**. Do not re-execute REPAIRS.md; B-1 in particular CONSUMES the base's R-6 casing formatter rather than re-implementing it.

## The direction, operationally (full spec in PROPOSAL-B — follow it verbatim)

- **World:** the night line network + journey-planner artifacts. The identity is carried by line COLOR, not type or texture — one voice (`system-ui`), zero byte-cost.
- **Key tokens** (§2.1 authoritative): ground `#15171c`; surface `#1b1e24`; hairline `#2c313a`; text `#dfe3ea`/`#9aa2af`/`#848d9c`; **mode hues: walk `#d9a441`, car `#4db6ac`, train `#9a7fd4`**; **gold `#ffd166` reserved to pin + route fare ONLY**; blocked red `#e08a84` unchanged and **state trumps mode** on canvas; node-kind taxonomy unchanged (kinds live in dots, modes in lines — never one channel).
- **Custom modes (D78):** deterministic display-layer hue = hash(modeId) with 25° rejection bands around reserved hues (gold ≈42°, red ≈5°, walk 38°, car 172°, train 258°), S 55–62% / L 60–66%. Pure function of the id, stable across sessions, never stored (R4). This is the ONLY new logic in any direction — it ships with a unit test over the rejection rule.
- **Canvas** (`src/app/graph/layer-elements.ts`, packet B-2): arcs 3px `#3a4150` base; single-mode arcs take the mode hue; multi-mode stay neutral; authored marker unchanged (never a dash — dash is blocked's channel); blocked red-dashed rule stays LAST in the stylesheet (no-specificity cascade — order is load-bearing); hubs get interchange rings (2px `#dfe3ea` border + overlay-padding 3 / overlay-opacity 0.25; visual only — hit radius unchanged, B-115); no `min-zoomed-font-size` on labels.
- **Journey card** (packet B-3): route panel rebuilt — legs as mode-hue pips + place name + cost chip, interchange rows as hollow rings, total = gold fare plate (20px tabular-nums, the only 20px on the sheet); legs cascade in on answer (~60ms stagger, reduced-motion renders at once) — the only motion.
- **Chrome:** flat surfaces, hairlines, 4px radius; mode selector = line-legend swatches (3px hue rules) + lowercase words via R-6's single formatter; scale ≥1.25 steps (12/13/16/20).
- **First viewport (mapless):** three faint crossing lines (the built-in hues at ~15% opacity, pure CSS) + "No routes yet. Place your first two places." (packet B-5).

## Scope and authorizations

- All packets are **B-domain**; no `src/core` / `src/st` changes expected — if one surfaces, stop the packet, report, re-plan. B-4's hue generator is app-layer presentation (R1 intact: hues are not displayed numbers and not data).
- **The pin-setting affordance (REPAIRS R-3) is authorized by this brief** (the carried owner item): wires the existing `setCurrentLocation`, long-press/context-click menu, no drag-pin, no auto-set (D10/R2).
- **Register row required for the mode-hue convention** (the generator + rejection rule). No new dependency, no byte-cost — D8 unaffected.
- Fences: no undo/multi-select/snapping (F46); parity per D53/R10 (≥44px, phone e2e per packet); R2 untouched.
- **Owner-risk acknowledgment (from the proposal §5):** this direction carries an anachronism risk on pre-modern worlds. The owner chose this branch knowing that; do not soften the palette toward A mid-round — if a world-level conflict proves the risk real in practice, STOP and report rather than blending identities.

## Register & docs

- Register rows under a new round heading (AGENTS.md §6 format): (1) direction adoption — Journey Ledger, provenance critique 26/40 + this brief, mode-hue/channel rules recorded; (2) the mode-hue generation convention (pure function, rejection bands, display-only). R-3 shipped with the repairs base, its PRODUCT.md sentence included. CORE.md untouched. Status lines replaced in place; round history in §8.6 item 6 only.

## Verification bar (every packet)

`npm run verify`; then `npm run test:e2e -- --project=desktop` and `-- --project=phone` as SEPARATE commands (R23 ceiling). D96 flake policy. Geometry e2e re-baselined deliberately with the ruling cited; B-2 re-baselines canvas-visual specs; the hue generator ships with its rejection-rule unit test IN the B-4 packet (a convention without its test is not done, AGENTS.md §3.7).

## End state

Full gate set once more; register rows completed with gate numbers; EXECUTION-PLAN §1 + AGENTS.md §4 status replaced in place; then STOP and report: packets closed (B-1…B-5 on top of the merged repairs base), commits by hash, gate numbers, deviations from the two companion docs (amend them in the same commit if reality contradicts — never improvise past them), and a suggested polish pass (re-run the impeccable critique after B-5 for the trend against the 26/40 baseline snapshot). Do NOT merge — the branch is the owner's review artifact.
