# ORCHESTRATOR PROMPT — Direction A: "Atlas Plate" (engraved sourcebook cartography)

> Paste this prompt into a fresh orchestrator session on a dedicated branch. Companions: `docs/ui-restyle/REPAIRS.md` (executed wholesale, R-0…R-9) and `docs/ui-restyle/PROPOSAL-A-ATLAS-PLATE.md` (the direction spec — authoritative for every value below).

---

You are the orchestrator for a UI-restyle round of Travel & Map Explorer adopting **Direction A — "Atlas Plate."** Read, in order: `AGENTS.md`, `PRODUCT.md`, `CORE.md`, `EXECUTION-PLAN.md`, `ORCHESTRATION.md`, then the two companion documents above. You own decomposition, packets, review gates, commits on the branch, shared files, and the register. Sub-agents never commit; you commit per packet.

## Mission

**Base note (the owner's sequencing):** the repairs round — REPAIRS.md, R-0 … R-9, including the R-3 pin-setting affordance and R-8's keyboard/hover package — is ALREADY MERGED into this branch's base (`develop`). Before the first packet, verify that quickly: the `--tme-*` token layer exists and is consumed by the component SCSS, and R-1's route-occlusion, R-2's boot-zoom, and R-3's pin-menu e2e specs exist in `tests/e2e/`. If the verification shows the repairs are NOT in the base, STOP and report instead of improvising.

Then restyle the ENTIRE UI to the atlas-plate identity: this round executes ONLY the direction packets **A-1 … A-5 (PROPOSAL-A §6, in order)**. Do not re-execute REPAIRS.md; where the direction builds on an R-packet (R-3's affordance, R-8's keyboard/hover), build on what the base ships — never re-implement.

## The direction, operationally (full spec in PROPOSAL-A — follow it verbatim)

- **World:** printed map plate / RPG sourcebook cartography on the SAME dark ground. Flat plates, hairlines, registration ticks, a legend block, a cartouche. No shadows, no glows, no parchment, no texture rasters.
- **Key tokens** (§2.1 of the proposal is authoritative): ground `#12161d`; plate `#181d26`; hairlines `#2a3242`/`#232a37`; ink `#e9e4d8` / `#a9a695` / `#8a877a`; **gold `#ffd166` narrowed to exactly three meanings — pin, primary commit, route total**; active/selection states become bone-on-ink, NOT gold; teal `#4db6ac` and red `#e08a84` unchanged; node taxonomy unchanged.
- **Type:** system sans for controls; **Spectral + Spectral SC (true small caps) as the cartographic face** for node labels (kind-coded: location upright, waypoint italic, district/hub SC letterspaced), panel headers, breadcrumb pin name, route place names, and the gold cartouche total. Bundled woff2 subsets (~30–50KB gz), `@font-face` from the bundle — no hosted font stylesheets. Fallback `Georgia, serif`.
- **Form:** plate radius 2px, controls 4px; corner ticks on floaters; flat (the only elevation is a 2px edge on the dragged state); type scale ≥1.25 adjacent steps.
- **Canvas:** labels re-set in `src/app/graph/layer-elements.ts` — preserve declaration ORDER exactly (the cascade has no specificity; last match wins), never set `min-zoomed-font-size` on these labels (hide-floor, B-107), badges cull with content (B-115).
- **Signature moment:** route answer draws the path and counts the total up in place (~150ms, `prefers-reduced-motion`-aware) — packet A-5, the only motion in the app.
- **First viewport (mapless):** faint CSS graticule + compass tick + one Spectral italic line: "Your world begins here. Name it, or paste your old distance table." (packet A-4).

## Scope and authorizations

- All packets are **B-domain**; no `src/core` / `src/st` changes expected — if one surfaces, stop the packet, report, re-plan. A-3 touches only `layer-elements.ts` + font wiring (app side).
- **The pin-setting affordance (REPAIRS R-3) is authorized by this brief** (the carried owner item): wires the existing `setCurrentLocation`, long-press/context-click menu, no drag-pin, no auto-set (D10/R2).
- **New-asset register row required:** the Spectral/Spectral SC subsets are a bundled asset (~30–50KB gz) — AGENTS.md §6 requires a register entry; the D8 1.5MB build gate enforces the budget mechanically (if it trips, subset tighter — never drop the SC family, the small caps are the identity).
- Fences: no undo/multi-select/snapping (F46); no hosted fonts/CDNs; parity per D53/R10 (≥44px, phone e2e per packet); R1/R2 untouched (restyle is presentation + the R-3 facade call).

## Register & docs

- Register rows under a new round heading (AGENTS.md §6 format): (1) the direction-adoption row — Atlas Plate, provenance critique 26/40 + this brief, gold-narrowing and token-layer conventions recorded; (2) the font-subset asset row with measured gz delta. R-3 shipped with the repairs base, its PRODUCT.md sentence included. CORE.md untouched (no core changes). Status lines replaced in place; round history in §8.6 item 6 only.

## Verification bar (every packet)

`npm run verify`; then `npm run test:e2e -- --project=desktop` and `-- --project=phone` as SEPARATE commands (R23 ceiling). D96 flake policy. Geometry e2e re-baselined deliberately with the ruling cited (R23 pin rules; A-3 re-baselines label-visible specs; A-1's paddings may move rail-regime assertions — cite, never incidentally).

## End state

Full gate set once more; register rows completed with gate numbers; EXECUTION-PLAN §1 + AGENTS.md §4 status replaced in place; then STOP and report: packets closed (A-1…A-5 on top of the merged repairs base), commits by hash, gate numbers, the bundle's min+gz figure against the 1.5MB budget, deviations from the two companion docs (if reality contradicts them, amend them in the same commit with the correction noted — never improvise past them), and a suggested polish pass (the `/impeccable polish` findings inherit from the critique snapshot `.impeccable/critique/2026-10-07T20-24-15Z__src-app.md`; a re-run critique after A-5 gives the trend). Do NOT merge — the branch is the owner's review artifact.
