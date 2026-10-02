# ORCHESTRATION.md — Delegation Protocol

**Status:** R6 · Normative for how work happens
**Operating model:** one orchestrator (strong model) plans, decomposes, delegates, verifies, reviews, and merges. Implementation happens *only* inside task packets executed by implementer sub-agents (cheaper models). Nothing else touches code.

The session bootstrap prompt for a fresh orchestrator session lives in `ORCHESTRATOR-PROMPT.md` — paste it verbatim; it defers to this document on any disagreement.

---

## 1. Division of labor

| Concern | Owner |
|---|---|
| Architecture, decomposition, contracts, docs, decision register | **Orchestrator** |
| Implementation inside one task packet | **Implementer sub-agent** |
| Review of every diff; commits and merges | **Orchestrator** |
| Mechanical verification (typecheck / lint / test / build) | **Machine** — run by the orchestrator; a prose "it passes" is never evidence |

Prime rule: **discretion flows upward.** An implementer facing ambiguity or a contradiction with a cited rule stops and reports. It never improvises architecture, dependencies, or scope.

## 2. Why packets (cheap-model reality)

- **Small scope** — one milestone slice, ~1–2 hours of work. Capability degrades with breadth.
- **Self-contained** — the relevant rules are *inlined verbatim*, not "go read CORE.md". Cite the ID, quote the lines.
- **Mechanical acceptance** — the done-condition is a command that passes plus named artifacts, never a judgment call.
- **Exhaustive deliver lists** — "these files, no others" prevents both under-delivery and speculative building.
- **No shared files** — implementers touch only files inside their charter's `owns`; shared manifests are orchestrator-only.

## 3. Task packet format

```markdown
# PKG <agent>-<seq> — <title>
Mission: one sentence.
Read: agents/<charter>.md (your law).
Context (verbatim, with IDs):
  <quoted conventions / decisions / type declarations this task needs>
Deliver:
  <exact files and functions to create or modify — exhaustive>
Constraints:
  <the charter boundaries that apply here + explicit "do not" list>
Acceptance:
  <commands that must pass + artifacts that must exist>
Report: per ORCHESTRATION.md §5.
```

## 4. Spawn protocol (orchestrator)

Implementers are registered agent types in `.zcode/agents/` — `graph-engine`, `ui-editor`, `st-integration` — running the cheap implementer model, with AGENTS.md auto-injected (`injectAgentsMd: true`). Dispatch by spawning the matching type with the packet as the prompt. Every dispatch contains: the packet, the inlined context, the verify command, and the report format — plus this standing instruction: *"If anything is ambiguous or contradicts a cited rule, stop and report it; do not resolve it yourself."* One packet per run. Composed packets for the active milestone live in `.zcode/packets/<milestone>.md`; when a packet is reworked after bounces, rewrite it there. Implementers never: commit or push, edit the decision register or any spec doc, install dependencies, or modify files outside their `owns`. Deviations are *proposed* in the report; the orchestrator decides.

The protocol works identically if prompts are copy-pasted into another session instead.

Packets name their expected tooling per AGENTS.md §7. If a sub-agent reports a skill or MCP tool as unavailable, inline the relevant `SKILL.md` excerpt (they are plain files on disk) or run that verification step yourself — never let an implementer substitute an unverified alternative.

## 5. Report format (implementer)

```
STATUS:    done | partial | blocked
FILES:     created / modified (paths)
TESTS:     added / updated (citing F / C / FX IDs)
VERIFY:    command run + result
DEVIATIONS:none | list, one-line reason each
QUESTIONS: none | list
```

## 6. Review gate (orchestrator)

1. Read the full diff. Check against the charter rubric: R1–R6 boundaries, no new dependencies, no scope creep, tests that actually assert the acceptance (not smoke tests).
2. Run the mechanical gates yourself (`npm run verify`; before Task 0 lands, `tsc --noEmit` and targeted test runs).
3. Merge, or bounce with precise instructions. **Two bounces on the same packet means the packet was probably bad** — rewrite it or do the task yourself; don't send it a third time unchanged.

## 7. Parallelism & file safety

- Ownership directories (`src/core`, `src/app`, `src/st`, `tests/`, `data/`) make parallel dispatch *mostly* safe.
- **Orchestrator-only files:** `package.json`, workspace/build configs, tsconfig, lint rules, `manifest.json`, `scripts/`, all root docs (`*.md`, `.zcode/agents/`). A packet needing a change there flags it in QUESTIONS.
- When in doubt, sequence. Correctness beats wall-clock, and reviews can be batched to save orchestrator cost.

## 8. Cheap-model failure modes → mandated mitigations

| Failure mode | Mitigation (non-negotiable) |
|---|---|
| Hallucinated APIs (graph lib, framework, host context) | Pin exact versions in the packet; instruct "verify against installed type declarations in `node_modules`, not memory"; keep the API surface touched per packet small |
| Invented dependencies | No installs, ever; check the host's bundled libraries first (Agent C charter); new deps require a register entry by the orchestrator |
| Over-building, speculative abstraction | Exhaustive deliver lists + Ponytail guardrails + review gate |
| Quietly skipped or fake tests | Acceptance is command-based; review checks that tests assert behavior, citing F/C/FX |
| Edits outside scope | `owns`-only rule + diff review |
| Misread long documents | Inline only the needed excerpts; keep the total dispatch lean |

## 9. Task 0 — orchestrator-owned, before any packet

Create the scaffold single-handedly (or in one tightly-specified packet you review line-by-line):

1. Workspace init, strict TypeScript, lint rules **enforcing core purity (R5)** and import boundaries.
2. Folder skeleton per EXECUTION-PLAN §3.7.
3. `src/core/api.ts` — the types verbatim from EXECUTION-PLAN §3.3, compiling.
4. Facade stubs with explicit TODO markers (throwing or empty, never fake data).
5. `npm run verify` — typecheck + lint + vitest, green on the empty suite.

This is the single biggest reliability multiplier for cheap implementers: they fill in real, compiling interfaces instead of inventing structure. Task 0 is the first half of M0; **C-001** (the SillyTavern walking skeleton) remains the first dispatched packet.

## 10. Worked example packet

```markdown
# PKG A-002 — Cost precedence (C14)
Mission: implement edgeCost() exactly per C14 and prove every row with tests.
Read: agents/graph-engine.md.
Context (verbatim):
  <C14's six precedence rows, quoted from CORE.md>
  <ModeSpec + scale type declarations, quoted from src/core/api.ts>
Deliver:
  - src/core/routing/cost.ts — export function edgeCost(arc, mode, scale): number
  - tests/unit/routing/cost.spec.ts — one describe block per C14 row (FX5)
Constraints: import types only; ∞ is an internal sentinel, never an output; do not
  modify api.ts; no new files beyond the two listed.
Acceptance: `npm run verify` green; all six C14 rows covered by asserting tests.
Report: per ORCHESTRATION.md §5.
```

## 11. Decomposition & phase gates

The orchestrator decomposes a milestone into packets **at dispatch time**, never more than one milestone ahead — pre-decomposed backlogs rot as reality arrives. Sequencing within Phase 1: Task 0 → C-001 (walking skeleton) → A-packets (engine) → B-packets (harness against stubs).

**Phase gates** close every milestone (EXECUTION-PLAN §5):

1. Orchestrator merges the milestone's reviewed work; the verify command is green.
2. Dispatch a **verification packet** to the `verifier` agent: the F/C/FX IDs in scope, verbatim spec excerpts, and the applicable slice of the edge-case catalog (EXECUTION-PLAN §6.2) — but **never the implementers' reports or claims**. Independence is the entire point.
3. Triage findings: defects become fix packets bounced to the owning agent (or orchestrator fixes for small ones); the verifier's `tests/verify` additions merge as permanent regression protection.
4. The gate passes when the full suite — unit + e2e + adversarial — is green and no critical or major finding remains open.

Per-diff review (§6) stays the orchestrator's job at packet granularity; the verifier is the independent second pass at milestone granularity, not a per-packet stage.
