# ORCHESTRATOR PROMPT — UI Repairs Round RESUME (R28 — packets R-3…R-9 + close-out)

> Paste this prompt into a fresh orchestrator session working DIRECTLY on `develop`. It resumes the round whose original brief is `docs/ui-restyle/ORCHESTRATOR-PROMPT-REPAIRS.md` — read that FIRST (it owns the mission, scope, authorizations, fences, register rules, packet discipline, and End state); this handover SUPERSEDES it only where the boot state, the in-flight packet, and the owner's mid-round cadence ruling require.

You are the orchestrator completing the R28 UI-repairs round of Travel & Map Explorer (the companion doc is `docs/ui-restyle/REPAIRS.md`). Read, in order: `AGENTS.md`, `PRODUCT.md`, `CORE.md`, `EXECUTION-PLAN.md`, `ORCHESTRATION.md`, the original brief, then this handover, then the round store `.zcode/packets/R28.md`. You own decomposition, packets, review gates, commits, shared files, and the register. Sub-agents never commit; commit per packet. All packets are B-domain (dispatcher: the `ui-editor` agent type); no `src/core`/`src/st` changes are expected — a packet surfacing a core/host defect stops, reports, and re-plans.

## Boot state (verified 2026-10-08 — do NOT re-verify the original preconditions)

- Branch `develop`, clean of committed drift. The round's docs commit was the owner's `10eb273`.
- THREE PACKETS ALREADY CLOSED, one commit each, all gates green at their close:
  - **R-0 `aecebf4`** — token foundation (`src/app/styles/_tokens.scss` 24 `--tme-*` tokens; `src/app/graph/canvas-tokens.ts` the canvas mirror; all 8 SCSS consume; drift-pin `tests/unit/app/tokens-sync.spec.ts`). Gates at close: verify **810/0/57**; desktop 204/0/40; phone 196/0/48. REPAIRS §R0 attribution corrected in-commit (the canvas hexes live in graph.service.ts :471–783, NOT layer-elements.ts).
  - **R-1 `fd3a391`** — route-floater stagger (route anchors AWAY-FROM-PROPERTY while the property panel is open + unplaced; toggle honest by construction, no rail code). Desktop 205/0/40; phone 196/0/49; teeth proven; deliberate re-baselines in-file cited (tapAimed/clearAimed both viewports; the `parkRouteFloater` D10 drags in five desktop cells). Carry: the sub-760px maximized-floater overlap edge was accepted.
  - **R-2 `2b9717f`** — phone boot posture (`bootAtPin()`: narrow-gated, pin-gated, C32 degrades; level = `min(fitZoom × (1/0.6)², 2.5)`; a mount-armed `cy.one('zoom')` one-shot re-asserts through the boot's own reflexive RO refit). Desktop 207/0/42; phone 199/0/50; teeth proven; REPAIRS §R2 corrected in-commit (the cull premise and the two-fit boot). Carry: 24 aim specs now carry `restoreBootViewport()` (phone-only rail-Fit tap) — preserve its pattern; `?map=registry-demo` boots at the 2.5 cap; the phone boot stages pin-centered at zoom ≈0.78.
- The round store `.zcode/packets/R28.md` is UNTRACKED (lead-owned; committed at close-out). It carries the dispatch basis, the per-packet close records, and the composed packet texts.

## In-flight: R-3 (machine-crash residue — RESUME, do not restart)

The previous orchestrator session dispatched B-143 (the R-3 pin-set affordance packet, text in store §"PKG B-143"); the machine crashed mid-verification. Its UNCOMMITTED work survives in the working tree:

- Modified: `src/app/graph/graph.service.ts` (+248: the `taphold cxttap` node binding with mode gates, the `nodeMenu` signal + dismissal, `setNodeAsLocation`/`clearNodeLocation` — both wrapping the EXISTING `facade.setCurrentLocation`, R2 intact, refusal words captured), `src/app/viewer/map-viewer.component.html/.ts` (menu host), `src/app/viewer/route-panel.component.html/.scss` (the empty-origin sentence).
- New: `src/app/viewer/node-menu.component.{ts,html,scss}` (template-bound menu, component-owned clamp), `tests/e2e/pin-affordance.e2e-spec.ts` (449 lines, both projects, CDP touch-twin long-press).
- The lead audited the tree: structurally complete; `tsc -p tsconfig.app.json` and `tsconfig.spec.json` both green. The crash caught it debugging a failing e2e cell — its scratch artifacts `tmp-b143-debug.mjs` and `tmp-b143-editor-rc.png` sit in the repo root and MUST be deleted before the packet closes.

Dispatch ONE ui-editor packet (`PKG B-143r`) = the original packet text (store §B-143) + this resume preamble: the working tree carries the predecessor's partial work — the implementer audits it line-by-line against the packet, completes anything missing, finishes the verification, deletes the scratch artifacts, proves teeth on the container-refusal cell (staged revert → red → restore md5-identical → re-green), and reports per ORCHESTRATION §5. Two-bounce rule unchanged.

R-3's commit (you make it, one commit): cite §R3/D10/R2 + the product sentence **in the same commit** — PRODUCT.md §F27 (Pin) gains the in-app affordance wording (suggested: "the app layer sets it: long-press (touch) or context-click a node opens the node menu — 'Set as party location', and 'Clear party location' on the pinned node"), F31/F27 rows per your judgment; no REPAIRS.md correction is owed for R-3.

## Owner's mid-round cadence ruling (2026-10-08, in-session — binding)

- Per packet: `npm run verify` + ONLY the e2e specs touching the packet's surface — file-scoped runs (`npx playwright test <files> --project=desktop`, then `-- --project=phone`), each as its own command; launch long suites in the background (R23 command ceiling).
- FULL desktop + phone suites exactly twice more: **once after R-5 closes** (the last core-loop packet), **once at the final close-out** (the End state's mandated gate).
- D96 flake policy (retries: 1) unchanged. The in-test Chromium twin convention (AGENTS.md §6) unchanged.

## Remaining packets

R-4 → R-5 → R-6 → R-7 → R-8 → R-9 per REPAIRS.md's packet table, in order, one commit per packet, composed at dispatch time (ORCHESTRATION §11). Packet texts are NOT pre-composed — work from REPAIRS.md's sections, with the store's mechanism-fact notes. Landmines left by the closed packets: (1) the R-1 stagger moves the unplaced route floater opposite the property panel while both are open — any anchor/panel geometry change re-baselines deliberately with in-file citations; (2) the R-2 boot posture governs phone boot geometry (canvas.e2e-spec.ts cells) and the `restoreBootViewport()` helper pattern; (3) any NEW UI color goes through `_tokens.scss` (+ `canvas-tokens.ts` when canvas-plane; the tokens-sync pin asserts exact sets); (4) the D81/D87 fit sites and D76 placement rules are standing law.

R-5 note (from REPAIRS): keep the Done/Cancel contract and every command byte-identical — presentation only. R-6 note: the acceptance references `impeccable detect --json src/app` returning only the known `broken-image` false positive — if the impeccable tooling is unavailable in your session, fall back to the documented manual pass on both breakpoints and note it.

R-7 note: the legend becomes the type-system key under the direction proposals (build as a component now); the rename nudge reuses R-5's name-first open.

## Close-out (the END STATE, per the original brief with this round's specifics)

After R-9: run the full gate set once more (`npm run verify`; desktop and phone e2e as SEPARATE commands), then in ONE docs commit:
1. Append ONE register row (**D100**) under a new round heading in EXECUTION-PLAN.md, per AGENTS.md §6 format — the repairs-round row recording: the critique provenance (26/40 baseline; snapshot `.impeccable/critique/2026-10-07T20-24-15Z__src-app.md`), the R-3 authorization (the carried owner item resolved by the owner's brief), the owner's mid-round cadence ruling, and the final gate results.
2. Append entry **(w)** to EXECUTION-PLAN §8.6 item 6 — the ONE append-only ledger: packets by hash, the crash-resume story, the two REPAIRS.md corrections, the cadence ruling, the gates.
3. Replace IN PLACE (current state only — the R20 collapse ruling): the EXECUTION-PLAN §1 status line, the §8 item 4 "Round progress" line, and the AGENTS.md §4 status bullet.
4. Commit the round store `.zcode/packets/R28.md` (+ this handover for the record) and CLOSE its tracker.

Then STOP with the report: packets closed, commits by hash, gate numbers (verify passed/skipped; desktop passed/failed/skipped; phone passed/failed/skipped), findings or deviations from REPAIRS.md, and the suggested next action (re-run the impeccable critique for the trend line; then the owner picks a direction from `docs/ui-restyle/PROPOSAL-*.md` and cuts the restyle branches from `develop`).

If anything blocks (a gate that won't close, a finding outside B's surface, an ambiguity in REPAIRS.md), stop and report the block with evidence rather than improvising.
