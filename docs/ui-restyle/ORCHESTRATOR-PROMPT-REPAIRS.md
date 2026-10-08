# ORCHESTRATOR PROMPT — UI Repairs Round (R0–R9, direction-independent)

> Paste this prompt into a fresh orchestrator session working DIRECTLY on `develop` (the owner's instruction — the repairs are the base every direction branch will cut from, so no feature branch here). It is self-contained; the companion document it executes is `docs/ui-restyle/REPAIRS.md`.

---

You are the orchestrator for a UI-repair round of Travel & Map Explorer. Read, in order: `AGENTS.md`, `PRODUCT.md`, `CORE.md`, `EXECUTION-PLAN.md`, `ORCHESTRATION.md` — then this brief. You own decomposition, packets, review gates, commits, shared files, and the register. Sub-agents never commit; you commit per packet.

**Precondition (verify before the first packet):** HEAD is on `develop` with a clean working tree. If `docs/ui-restyle/`, `README.md`, or other round documents sit uncommitted, STOP and report — those are the owner's to commit first; never sweep the owner's uncommitted files into a packet commit.

## Mission

Execute `docs/ui-restyle/REPAIRS.md` in full: packets R-0 through R-9, in the order that file specifies. This is a **craft-repair round with NO visual-identity change** — the current look stays; the round fixes the two P0 findings (route floater occlusion in editor mode; illegible phone boot zoom), the P1s (ghost-punctuation degraded states; the 9-group property wall), every impeccable detector finding, and the recognition/ergonomics gaps. The provenance is the 2026-10-07 critique (26/40 baseline; snapshot at `.impeccable/critique/2026-10-07T20-24-15Z__src-app.md`; screenshots in `tmp-critique/`).

## Scope and authorizations

- **All packets are B-domain.** No `src/core` or `src/st` changes are expected. Do not dispatch A or C unless a packet surfaces a core/host defect — in that case stop that packet, report, and re-plan the packet.
- **The pin-setting affordance (R-3) is authorized by this brief** — it resolves the carried owner item. It wires the EXISTING facade command `setCurrentLocation` (and its `null` clear); R2 stays intact, no facade extension is proposed, and the long-press/context-click menu is the only new affordance. No drag-the-pin, no auto-set (D10).
- **Fences (violations are defects):** no undo/multi-select/snapping (F46); no new npm dependency; no hosted fonts/CDNs; desktop+phone parity per D53/R10 (≥44px targets; every packet ships or re-baselines phone e2e); R1 — every displayed number still originates in core.
- If reality contradicts REPAIRS.md (a measurement that doesn't reproduce, a file that moved), stop the packet, verify against source, and amend the doc in the same commit with the correction noted — never improvise past the doc.

## Register & docs (house rules)

- Append ONE register row to EXECUTION-PLAN.md under a new round heading, per the AGENTS.md §6 format: the repairs-round row recording the critique provenance (26/40 baseline, snapshot path), the R-3 authorization (the carried owner item, resolved by this brief), and the gate results. `| D<n> | **Title (source).** One-paragraph decision. |`
- R-3 changes a user-facing capability: PRODUCT.md's pin/presence rows get the in-app affordance sentence in the same commit as R-3. Nothing in this round touches `src/core`, so CORE.md stays untouched. This bullet's status-line convention: replace in place on the branch, never append.
- Docs drift is a defect: if any packet changes user-visible behavior beyond what the row above records, the PRODUCT.md update rides that packet's commit.

## Verification bar (every packet)

1. `npm run verify` (typecheck + boundary lint + ESLint + vitest).
2. `npm run test:e2e -- --project=desktop` — as its OWN command.
3. `npm run test:e2e -- --project=phone` — as its OWN command.
Never one whole-suite call (the R23 command ceiling kills long dispatches). Known-flake policy per D96: a retry-passed failure is recorded, not chased; a failure that survives retry and reproduces isolated repeatedly is a finding — stop and fix.
Geometry-sensitive e2e (D81 rail regime, dvh rulings, the R23 pin rules) must be re-baselined deliberately: cite the ruling in the commit, never silently.

## Packet discipline

- One commit per packet, message citing the packet ID and the C/F/D numbers REPAIRS.md cites (e.g. R-3 cites D10/R2; R-2 cites the R23 pin rules).
- Each packet's acceptance criteria are in REPAIRS.md's packet table; a packet without its new e2e is not done (AGENTS.md §3.7).
- B's devserver is shared: reuse :4200; do not spawn ports.

## End state

When R-9 closes: run the full gate set once more (`verify` + both e2e projects), write the register row's gate results, replace the EXECUTION-PLAN §1 status line and AGENTS.md §4 status bullet in place (current state only — round history lives in §8.6 item 6, the one append-only ledger), and STOP with a report: packets closed, commits by hash, gate numbers (verify passed/skipped; desktop passed/failed/skipped; phone passed/failed/skipped), any findings or deviations from REPAIRS.md, and the suggested next action (re-run the impeccable critique for the trend; then the owner picks a direction from `docs/ui-restyle/PROPOSAL-*.md`). Commits land directly on `develop` per the owner's instruction — no feature branch, no merge step. The owner then cuts the direction branches (`restyle-A`/`restyle-B`/`restyle-C`/`restyle-D`) from `develop` and tests each against this base.

If anything blocks (a gate that won't close, a finding outside B's surface, an ambiguity in REPAIRS.md), stop and report the block with evidence rather than improvising.
