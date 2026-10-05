# AGENTS.md — Binding Brief for All Agents

**Read this first.** Every agent — lead or sub — working in this repository reads AGENTS.md before touching anything, then the documents its role requires. Charters for the three implementer agents and the verifier live in `.zcode/agents/`.

---

## 1. Project identity

Travel & Map Explorer: a SillyTavern extension that replaces static distance lookup tables with a user-authored, multi-layer map of nodes and arcs. It tracks the party's position, computes directions, distances, and times, and injects a template-driven context block into LLM prompts. **The user is always the authority** — the product informs and suggests; it never moves characters on its own and never blocks a generation.

## 2. Document map (read order)

| Order | Document | Answers |
|---|---|---|
| 1 | `AGENTS.md` (this file) | What binds everyone |
| 2 | `PRODUCT.md` | *What* — feature catalogue F01–F52, vocabulary, non-features |
| 3 | `CORE.md` | *How the engine guarantees it* — conventions C1–C33, separation contract R1–R6, facade command list, fixtures FX1–FX5 |
| 4 | `EXECUTION-PLAN.md` | *Build plan* — architecture D1–D9, decision register D10–D72, phases, risks |
| 5 | `ORCHESTRATION.md` | *How work is delegated* — task packets, report format, review gates, Task 0 |
| ref | `st-extension-docs/extensions.md` | Host (SillyTavern) API reference — read before any host-layer work |

ID scheme: **D** = decisions (why) · **F** = features (what) · **C** = engine conventions · **R** = separation rules · **FX** = test fixtures. Cite IDs in code comments, tests, and commits; never restate a rule inline when an ID exists.

### Commands (canonical)

| Command | Purpose |
|---|---|
| `npm run verify` | typecheck (app+spec) + `scripts/lint-boundaries.mjs` + ESLint (D66) + vitest — the per-packet acceptance command (iterate cheaply with `npm run test:unit` — vitest alone) |
| `npm run build:extension` | full bundle → `dist/extension/` (single ESM, enforces the 1.5 MB min+gz budget, copies manifest) |
| `npx ng build -c extension` | Angular build only (no merge pass) |
| `npx ng serve` | dev harness (Agent B owns; shared server, reuse the port) |
| `npm run test:e2e` | Playwright e2e — desktop + phone-with-touch projects (D68/D53); specs are `tests/e2e/**/*.e2e-spec.ts` so vitest never collects them |
| `npx tsc --noEmit -p tsconfig.app.json` | Fast typecheck-only health check (no tests) — the cheap pre-dispatch sanity run |

Deploy target: `SillyTavern/public/scripts/extensions/third-party/travel-map-explorer/` (server: `http://localhost:8000` — SSL disabled in the local ST config).

## 3. Non-negotiables (violations are defects, not style)

1. **User authority** (D10): nothing moves the pin, blocks a generation (D30/F47), or auto-applies without the user.
2. **Core purity** (R5): `src/core` imports no framework, renderer, or host API — enforced by lint. The `handlebars` devDependency (D62) is tests/dev-harness only: never import a template engine from `src/` — the shipped bundle stays engine-free.
3. **Facade-only mutation** (R2): frontend and host change state exclusively through the facade list in CORE.md §9. A missing capability is a proposal to extend the facade, never a reason to reach around it.
4. **No UI math** (R1): every number displayed to a user or written into a prompt originates in the core.
5. **No machine names in prompts** (C23).
6. **Cost precedence is C14, verbatim** — geometry first, authored wins (D14/D44/D45); units may be distance or time.
7. **Tests are the proof**: core work cites F-numbers; engine behavior cites C-numbers; FX fixtures are normative. A feature without its cited test is not done.

## 4. Repo status & phase discipline

- **Status (R22 — RELEASED):** Phase 3 (Editor) M1 done & gate-passed (`24c2cdb`); **M2 (Arc editing) done & gate-passed** (PASS-WITH-FINDINGS triaged to zero open critical/major — EXECUTION-PLAN §8.6(l); closed at `35165da`; packets A-015/A-016/A-016b + B-120..B-124, register D76–D80 standing). **Owner boot rulings (§8.6(n)): packet B-125 (D81 — selection-driven panel resizes preserve the viewport on the wide layout; narrow layout + environmental resizes keep B-106's refit) is composed in `.zcode/packets/P3-M3.md` (renamed from `R22.md`; the durable round tracker — a fresh session reads it first) and RELEASED — it dispatches at boot right after baseline confirmation; the round then carries the §5 M3 line (layers & backgrounds), opened by an owner planning contact before M3 packets are composed; focused verifier depth for the D81 close, full phase gate for M3.** The two viewport-doctrine comment blocks in `graph.service.ts` are owner-applied pre-boot (D81 wording re-delivered with the boot handoff — §8.6(n)). Gates at `35165da`: `npm run verify` **565/565** (45 files); `npm run test:e2e` **285 passed / 43 cited skips** (desktop + phone-with-touch). Phases 1–2 are CLOSED. **Current-state-only convention (the R20 collapse ruling): this bullet and the EXECUTION-PLAN status line are REPLACED IN PLACE each round, never appended — round history, hashes, packet lists, and gate verdicts live in EXECUTION-PLAN §8.6 item 6, the one append-only ledger.**
- **R10 (D53): mobile & desktop parity is a v1 requirement** — every UI/host packet from Phase 2 on must satisfy it and ship phone-viewport e2e.
- **Parallel work starts only after the contract freeze:** `src/core/api.ts` types + the CORE.md §9 facade. Agents code against the frozen contract, never against each other's working trees.
- Current milestone, phase gates, and acceptance criteria live in EXECUTION-PLAN §5. Check them before starting any task.

## 5. Sub-agent dispatch

| Task domain | Agent | Definition |
|---|---|---|
| Data model, geometry, cost precedence, routing, snapshot & templates, importers, unit tests | **A — Graph Engine** | `.zcode/agents/graph-engine.md` |
| Viewer + editor UI, canvas, layers, panels, styles, harness, e2e tests | **B — UI & Editor** | `.zcode/agents/ui-editor.md` |
| Manifest, bootstrap, settings, injection channels, toast scanner, persistence, build, README | **C — ST Integration** | `.zcode/agents/st-integration.md` |
| Independent verification at phase gates — adversarial tests, edge-case sweep, seam checks | **D — Verifier** | `.zcode/agents/verifier.md` |

The three agents are **spawnable agent types** running the cheap implementer model, with this file auto-injected into their context (`injectAgentsMd: true`). Dispatch them by type with a task packet as the prompt (ORCHESTRATION.md §4).

Cross-cutting or unclear ownership goes to the Lead (whoever holds the plan). When in doubt, ask — never annex another agent's surface.

## 6. How to work

- **Know your seat.** If you are a sub-agent, you execute task packets (ORCHESTRATION.md): implement exactly the packet, run the acceptance command, report per §5 there — never commit, never edit the register or spec docs, and stop to report when anything is ambiguous. If you are the orchestrator, you own decomposition, packets, review gates, merges, shared files, and the register.
- **Don't re-litigate decided items** (D1–D81). If reality contradicts a decision, draft a new register row and surface it:
  `| D<n> | **Title (source).** One-paragraph decision. |` — appended to EXECUTION-PLAN.md under a new round heading, with PRODUCT.md / CORE.md updated in the same change.
- **Docs are the spec.** Any behavior change updates PRODUCT.md and/or CORE.md in the same commit — documentation drift is a defect.
- **Ponytail ethos:** standard library and library built-ins before custom code; brute force before cleverness at these scales; delete speculation. Editor scope stays fenced (F46: no undo/multi-select/snapping). No new dependency without a register entry justifying it.
- **Degrade, never throw** on generation-time paths (C32).
- Console discipline: consistent `[TravelMapper]` prefix, no spam in production paths.
- **Host-verification gotchas (learned at the M0 gate):** local ST serves plain HTTP on `http://localhost:8000` (owner disabled SSL — no cert handling needed in browser checks). `APP_READY` fires late on a cold cache: wait ~10s before DOM assertions or you get false negatives. Fresh builds must be re-copied to the deploy target before reloading.
- **Test-authoring gotcha:** golden files load via vite `?raw` imports (`/// <reference types="vite/client" />`) — the spec tsconfig ships no `@types/node`, so `node:fs` will not typecheck in specs; goldens live in `tests/golden/`.
- **Cytoscape gotcha:** a browser-context headless `cy` needs `headless: true` (+ `styleEnabled: true`) — omitting it builds the canvas renderer against a null container and crashes; verified against installed 3.34.3 (D67/D3). Also: `min-zoomed-font-size` is a hide-floor, not an upscale-floor — a label zoomed below it is suppressed entirely (B-107, verified in 3.34.3 `eleTextBiggerThanMin`); badge/small-label styles must not set it. Also: the stylesheet cascade has NO CSS specificity — matching rules apply in declaration order and the LAST match per property wins (verified in 3.34.3 `contextStyles`; the cull exemption entries rely on it), and `findNearestElements` touch slop (≈ 22·zoom + 8 px) lets a 44px host node eclipse a nearby small hit target at low zoom — badges cull with all content for exactly this reason (B-115).
- **E2e gotchas (Phase 2+):** the Playwright phone project is **WebKit** (iPhone 13) — CDP touch gestures (pinch, touch-drag) need an in-test Chromium twin with the same emulation (see `tests/e2e/interactions.e2e-spec.ts`); name specs `*.e2e-spec.ts`, never `*.spec.ts`, or vitest collects them (D68). After a CDP-injected touch drag, hold ~200 ms before `touchEnd` or Chromium silently drops the NEXT tap's `click` (~40% repro — pointer events arrive, the click doesn't; see `tests/e2e/editor-panel-regime.e2e-spec.ts`). Expected pricing floats are computed IN-PAGE through the app's engine/hook seams, never hardcoded in the spec — WebKit's `Math.hypot` differs from V8 by 1 ULP and breaks string-exact asserts (found in `arc-editing.e2e-spec.ts`).
- **Frozen-fixture gotcha:** the harness displayMap shallow-copies every FX1 field a facade command mutates in place (nodes/edges arrays — B-110 — and `scale` — B-123); a deep-frozen field makes in-place editor commands throw "Cannot assign to read only property" (C24).
- **Devserver coexistence:** the Playwright webServer (:4200, `reuseExistingServer: true`) and an AngularMCP devserver coexist — prefer the already-running :4200 for e2e; do not spawn extra ports (they drifted 50950→51123 within one round).

## 7. Tooling, skills & MCP

Skill and MCP availability varies by session and agent type — the allocation below is the *required equipment* per role. When something is missing, report it (QUESTIONS) instead of improvising.

| Agent | Skills | MCP / tooling |
|---|---|---|
| **A — Graph Engine** | `typescript-advanced-types` (type & validator design), `ponytail` (pre-report simplicity check) | None — pure Node; tests via the repo verify command |
| **B — UI & Editor** | `angular-developer` (primary), `angular-ui-patterns` (panels/states), `frontend-design` (theming/controls), `typescript-advanced-types`, `ponytail` | AngularMCP: `list_projects`, `get_best_practices`, `devserver_*`, `run_target`, `search_documentation`. Playwright for e2e & scripted interaction; chrome-devtools for console/visual checks |
| **C — ST Integration** | `playwright-cli`, `ponytail` | chrome-devtools against local ST (console, network/payload inspection); web reader for ST source verification |
| **D — Verifier** | `playwright-cli` | The verify command; chrome-devtools & playwright for UI-phase reproduction and finding screenshots |
| **Orchestrator** | `angular-new-app` (Task 0 scaffolding only) + all of the above for review | Devserver lifecycle ownership; skill/MCP installation decisions |

Rules:

- **No installs.** Implementers never install or configure skills or MCP servers; gaps go to QUESTIONS.
- **The fallback is file-based.** Skills are plain `SKILL.md` files on disk (`~/.zcode/skills/`, `~/.agents/skills/`, plugin caches) — sub-agents can always *Read* them even without a Skill tool, and the orchestrator inlines relevant excerpts into packets when needed.
- **Verify, don't recall.** Framework/graph-library APIs → installed type declarations. Angular questions → AngularMCP `search_documentation`. Host APIs → local ST source. Web search only when a packet authorizes it.
- **Shared state discipline.** The Angular devserver is shared: started once, port reused, stopped only on instruction.

## 8. Verification bar

| Layer | Bar |
|---|---|
| Core | `vitest` green in bare Node, zero DOM — unit suites plus the merged `tests/verify/**` adversarial suites (D51); new core logic ships with tests citing C/F/FX IDs |
| UI | dev harness serves; interaction changes ship playwright e2e specs, including a phone-viewport run with touch emulation (D53/F52) |
| Integration | manual + playwright against a local SillyTavern before phase exit, including one mobile-viewport pass (D53) |
| Build | single-file bundle within the 1.5 MB budget; clean host console on load |
