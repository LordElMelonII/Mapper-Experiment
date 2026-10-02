# Travel & Map Visualization Extension — Execution Plan

**Role:** Lead Software Architect & Project Planner
**Status:** R12 — decisions D10–D59 · PRODUCT.md (features) · CORE.md (conventions) · AGENTS.md + .zcode/agents/ (spawnable charters A–D) · ORCHESTRATION.md (delegation + phase gates) · **Task 0 + M0 done (committed `17275b9` on `develop`, includes D53).** **M1 done & verifier gate passed (committed on `develop`):** A-001 validators/migrations, A-002 effective graph + M1 facade commands, A-003 FX1 fixture (`data/worlds/fuyuki.ts`), A-004 gate fixes; independent verification found 5 minor findings (all resolved; finding 3 settled as ruling **D58**), zero critical/major; `tests/verify/**` (29 tests) merged as regression protection; `npm run verify` 125/125 green. **M2 decomposed (R12, **D59**): packets A-005 (geometry + C14/FX5 cost precedence) → A-006 (Dijkstra routing, findRoute + setBlocked, FX2 acceptance) → A-007 (waypoints: addUserNodeAt / removeUserNode / promoteUserNode, C7/C26) sit composed in `.zcode/packets/M2.md` — dispatch sequentially to `graph-engine` with orchestrator review + verify between packets, then the M2 verifier gate (C9–C10, C12, C14–C18, C2/C5/C6, FX2 full route, FX5, §6.2 Geometry/Routing + Waypoints slices), then propose the M2 gate commit.**
**Source inputs:** `st-extension-docs/extensions.md` (ST extension API), `Notes for locations.md` (spatial spec + Fuyuki dataset), `README.md` (placeholder — real README is a Phase 4 deliverable).

---

## 0. Executive Summary

The extension replaces static lookup tables with a **user-authored, multi-layer map of nodes and arcs**. It maintains where the party is, computes directions/distances/times from geometry (unless the author says otherwise), and renders a fully template-driven context block into the prompt — where, how, and whether that block appears is the user's choice, not ours.

Three product pillars, in priority order:

1. **A map you can make yourself.** A visual editor (nodes, arcs, backgrounds, layers) is a hard requirement, not a power feature. The Fuyuki dataset ships as a demo, not as the product.
2. **Manual authority.** The LLM never moves the pin. The user moves it; the extension informs, suggests (a toast), and never aborts a generation.
3. **Presentation freedom.** Geometry is the default, authored values win, and everything the LLM sees goes through a user-editable template — XML, markdown, brackets, plain text, metric units instead of time: all just templates.

Both worlds, one build: every feature above — the editor included — must be fully operable on a phone-sized touch screen as well as with a desktop pointer (D53).

The extension ships as a **single-file ES-module bundle** (Angular + Cytoscape compiled via esbuild) loaded through a standard `manifest.json`, exposed as a custom element running zoneless. One Cytoscape instance, owned by `GraphService`, lives headlessly for computation and mounts into the DOM only while a map view is open.

---

## 1. Product Decision Register

Single source of truth for product behavior. **D1–D9** are stack decisions from R0 (§3.2); **D10–D31** are product decisions confirmed by the owner in R1. Items marked *(default)* were not explicitly confirmed — object and they change.

### The core loop

| # | Decision |
|---|----------|
| D10 | **Movement is manual-only.** Nothing happens automatically when the LLM narrates travel. The user moves the pin (UI or slash command) and chooses when and how to inject context. |
| D11 | **Location-detection toast.** The extension scans the latest AI message for known location names/aliases (word-boundary, case-insensitive regex). On a match ≠ current location, it offers a Yes/No "move to X?" toast. Never auto-applies. |
| D12 | **Sticky state.** Position survives swipes, deletes, and regenerations. No per-message rollback journal in v1. |
| D13 | **Single camera position** per chat; the schema reserves an optional `actorId` so multi-actor positions need no migration later. |

### Numbers and structure

| # | Decision |
|---|----------|
| D14 | **Geometry first, authored wins.** Distance derives from coordinates by default. Any edge can carry an authored distance (street layouts, winding paths) and any mode can carry an authored time; authored values override geometry absolutely. |
| D15 | **User-defined units.** The canonical computed quantity is *distance in the map's unit* (`unitPerPx` × `unitLabel`, e.g. km, miles, leagues). Time is a *derived* layer (per-mode speeds) — a user who wants metric distances instead of travel times simply templates around the time macros. |
| D16 | **Multi-layer maps.** A map has layers (e.g., a World layer, a Fuyuki layer, a Misaki layer), each with its own coordinate plane and optional user-uploaded background image. Travel between layers is explicit leaf-to-leaf arcs (Fuyuki Station ↔ Shinto Station). One logical graph across all layers; pathfinding is layer-agnostic. *(Inferred from R1 answers — the routing example "Emiya → Fuyuki Station → Shinto Station" plus "multiple layers: a world, a town".)* |
| D17 | **Between nodes** *(default)*: a freeform annotation ("on the road to Big Bridge, ~2 km out") rendered through the template. No fractional edge-state in the graph. |
| D18 | **No world clock** *(default)*. Times are descriptive. Weather/time-of-day modifiers are a future layer on top of edge multipliers. |
| D19 | **Mode is a per-route choice** made by pathfinding. No persistent vehicle state, no vehicle location, no fares in v1. |

### State semantics

| # | Decision |
|---|----------|
| D20 | **Blocked routes are chat-scoped** facts: user-set, unconditional, no expiry in v1. "Promote block to world" is backlog. |
| D21 | **Waypoints persist per chat.** A click-placed waypoint is a user-created node stored in chat state and survives reload. One-click "promote to map" names it and saves it into the library map for other chats. No machine names (`waypoint_3`) ever reach a prompt — unnamed waypoints are UI-only. |
| D22 | **No fog of war in v1.** Discovery/reveal is a future feature (the snapshot builder keeps a seam for it). |

### What the LLM sees

| # | Decision |
|---|----------|
| D23 | **Injection is user-defined**: (a) *auto* — via ST's extension-prompt mechanism with configurable placement (before chat history vs. in-chat at depth), role, and depth; (b) *manual* — a registered macro (e.g. `{{travel_map}}`) usable anywhere macros work (cards, author's note, presets); (c) *on demand* — slash command prints/uses the block. A default template ships; the template is user-editable. |
| D24 | **Template-driven format.** Hard numbers in v1 (fuzzy phrasing later). XML is just the default template — markdown, brackets, or bare text are equally valid user templates. |
| D25 | **Destination awareness.** The block includes a compact "known destinations" section (Dijkstra to a curated/hub list, capped) so the LLM can answer "how far is Misaki?" — routed through hub arcs per D16. |
| D26 | **Hallucination handling.** When a narrated place matches nothing, the template carries a corrective line with nearest matches. Matching is normalized word-boundary regex over names + aliases, coordinated with World Info keywords and respecting that ST users run their own regex scripts. |

### Authoring, storage, failure

| # | Decision |
|---|----------|
| D27 | **Visual editor is a first-class deliverable** (Phase 3): create/edit nodes and arcs, property panels, per-layer background upload, layer management, save to library. Must be easy, not engineer-grade. |
| D28 | **Map library + card pointer.** Maps live in a personal library; a character card optionally carries a default-map reference. Optional mirroring of location entries into a World Info book (keywords feed the D11 toast and lore injection) — with a double-injection guard. |
| D29 | **Backgrounds are user content.** Any image, uploaded per layer, stored as binary assets (localforage), never in settings. The overlay is always the node graph. |
| D30 | **Never abort a generation.** Contradictions (teleports, impossible timing) are injected as context; the model self-corrects or the user does. |
| D31 | **Map-less chats idle silently** (one-time toast only). |
| D32 | **MCP is out of scope for v1** — see §7 backlog rationale. |
| D33 | **Live-referenced maps.** Library edits propagate immediately to every chat using that map; affected chats get a "map updated" toast on next load. (Consequence: an edit can delete the node a chat is standing on — handled by D39; forking, D41, is the escape hatch.) |
| D34 | **Toast scan scope is user-configurable** (refines D11): AI messages only, user messages only, or both. |

### R3 additions — layers, authoring & scale (D35–D44)

| # | Decision |
|---|----------|
| D35 | **Drill-down layer navigation (Q22, Option A).** One layer visible at a time behind a breadcrumb bar; nodes on coarser layers are portals (double-click to enter); cross-layer arcs render as endpoint badges (C3). Coarse positions on upper layers still provide inter-town cardinality for narration. |
| D36 | **Routes are edge-scoped and optional (Q24).** The prompt's route section lists only real arcs incident to the current node within its layer (plus cross-layer hub entries) — no same-district sibling awareness. Users who want full manual control simply strip the routes section from their template. |
| D37 | **Pins sit on leaves only (Q23).** Vague presence ("somewhere in Miyama") is a status note; a precise unnamed spot means the user authors a node for it. |
| D38 | **Pin moves are silent by default (Q25).** Optional "announce travel" toggle emits a bracketed system line (`[Party traveled to X — 50 min on foot]`). |
| D39 | **Orphaned position policy (Q26).** A live map edit that deletes the current location's node keeps the orphaned position, warns the user, and pauses injection until re-pinned. Never silently snap. |
| D40 | **No auto-load, no export embedding — for now (Q27).** A new chat starts mapless; the user explicitly picks a map. A character card's map pointer (D28) appears as a *suggested* entry in the picker, never auto-applied. Character export does not embed map data (revisit when sharing matters). |
| D41 | **Fork (Q27).** The user can fork a library map into a private copy attached to the chat (character-level forks later); forks stop receiving library edits. "Save fork back to library" is an explicit action. |
| D42 | **Quick-connect (user addition).** After creating/selecting a node, the user can pick multiple other nodes to batch-create arcs (sensible defaults, refined afterwards). |
| D43 | **The graph is the author's truth (user addition).** The engine never enforces geographic realism: chokepoints (bridges, mountain passes) are ordinary nodes the author creates so the two banks don't connect directly. Documented as an authoring pattern, never automated. |
| D44 | **Authored distance = straight-line ("air travel") separation (user addition).** When a user writes a distance + unit on an arc, that value is the true separation between its endpoints: it (a) overrides geometric computation for that arc, and (b) can calibrate the map scale — "measure this arc" sets `unitPerPx = authored ÷ pixel-distance` (offered when the scale is unset, or on demand; the unit label seeds from the first authored value). Winding streets / longer journeys belong to authored *time* or multipliers, not distance. Consequence: adjacent arcs may disagree with calibrated geometry — accepted; the author decides. |

### R4 additions — units & documentation (D45–D47)

| # | Decision |
|---|----------|
| D45 | **Arc units may be distance *or* time** (amends D15). The map's canonical scale is distance-kind *or* time-kind (the legacy lookup table was time-based — "DIST(min)"); per-arc authored values may be either kind and are normalized on ingest (time → minutes; distance → the map's distance unit, calibrating per D44 when absent). Routing currency stays minutes whenever derivable, else canonical units (CORE.md C11, C14–C15). |
| D46 | **Documentation split.** `PRODUCT.md` catalogues features stack-free (F-numbers); `CORE.md` defines engine conventions (C-numbers) and the core/frontend/host separation contract (R-numbers). This file remains the build plan: architecture, phases, agents, risks, decisions. |
| D47 | **Editor saves are explicit** (backfilled from R3 Q28): a save command plus an unsaved-changes indicator; nothing mutates the library until saved. |

### R5 addition — agent structure (D48)

| # | Decision |
|---|----------|
| D48 | **Agent onboarding structure.** `AGENTS.md` at the repo root binds every agent (non-negotiables, document map, dispatch table, decision-proposal format, verification bar) and is auto-injected into every sub-agent's context. Sub-agents are spawnable agent definitions in `.zcode/agents/`: `graph-engine` (A), `ui-editor` (B), `st-integration` (C) — frontmatter pins the cheap implementer model and `injectAgentsMd: true`; the body is the charter (mission, ownership, packet protocol, report format, hard boundaries, guardrails, definition of done), citing D/F/C/R/FX IDs rather than restating rules. |

### R6 addition — delegation model (D49)

| # | Decision |
|---|----------|
| D49 | **Orchestrator + cheap implementers.** One strong-model orchestrator owns architecture, decomposition, task packets, reviews, merges, shared files, and the decision register; all implementation happens inside packets executed by cheaper sub-agents, per `ORCHESTRATION.md` (packet/report/review formats, inlined-context rule, mechanical acceptance, orchestrator-only files). Discretion flows upward — implementers stop and report rather than improvise. **Task 0** (orchestrator-owned: scaffold, compiling `api.ts`, lint-enforced purity, `npm run verify`) precedes all packets and is the first half of M0; C-001 (walking skeleton) is the first dispatch. |

### R7 addition — tooling allocation (D50)

| # | Decision |
|---|----------|
| D50 | **Skills & MCP are assigned per role** (AGENTS.md §7, mirrored in each agent body). A: `typescript-advanced-types` + `ponytail`, no MCP (pure Node). B: the Angular skill set (`angular-developer`, `angular-ui-patterns`, `frontend-design`, `typescript-advanced-types`, `ponytail`) + AngularMCP (`list_projects`, `get_best_practices`, `devserver_*`, `run_target`, `search_documentation`) + playwright/chrome-devtools. C: `playwright-cli` + `ponytail` + chrome-devtools for host verification + web reader for ST source checks. `angular-new-app` is orchestrator-only (Task 0). Implementers never install skills/MCP; missing tooling is reported, and the orchestrator falls back to inlining `SKILL.md` content — skills are plain files on disk, so sub-agents can always Read them. |

### R8 addition — independent verification (D51)

| # | Decision |
|---|----------|
| D51 | **Testing is two jobs, split deliberately.** (1) *Tests as acceptance* stay with the implementers — FX fixtures are normative and packets close on commands passing, so per-packet test authorship is load-bearing. (2) *Independent verification* is a dedicated **Verifier agent (D)**, `.zcode/agents/verifier.md`: dispatched only at phase gates (ORCHESTRATION.md §11), derives expectations from spec citations alone — never implementer claims — writes only to `tests/verify/**` (merged afterward as regression protection), and reports findings with severity instead of fixing. Mitigates cheap-model self-confirmation bias (a misread convention would otherwise be encoded in the implementer's own tests). |

### R9 addition — workspace scaffold (D52)

| # | Decision |
|---|----------|
| D52 | **Angular 22.2 workspace at repo root, zoneless, strict; `@angular/elements@22.2.1` is the sole dependency addition.** Task 0 scaffold: no `zone.js` in the dependency tree (D2 is native in Angular ≥21); `"strict": true` added to `tsconfig.json`; R5 + layering enforced by `scripts/lint-boundaries.mjs` (zero-dep Node script — no ESLint toolchain, per ponytail ethos) wired into `npm run verify` = typecheck (app + spec projects) + boundary lint + vitest (Node environment, bare DOM-free). `@angular/elements` justified: D1's custom-element bridge has no alternative entry (`createCustomElement`); verified against installed type declarations. |

### R10 addition — platform parity (D53)

| # | Decision |
|---|----------|
| D53 | **Mobile & desktop parity (owner revision).** v1 is fully usable on touch-only, phone-sized screens and on desktop pointers alike — viewer, editor, settings, toasts, and slash flows all included; nothing is desktop-recommended-only. (Owner rationale, confirmed at R10: roleplayers use SillyTavern on their phones — the map must follow the story there, editor included.) Means: no hover-dependent affordances; tap targets of usable size (≥ 44 px); canvas input through the graph library's unified pointer/touch events (tap, drag, pinch-zoom, pan — verify against installed declarations in Phase 2 M1) with `touch-action` set so gestures never scroll the host page; panels adapt to narrow viewports (collapse to sheets, never horizontal scroll). Where an earlier register row says "click" (D21, D35), it means tap-or-click. Parity is of **features, not pixels**: one responsive component tree, no separate mobile bundle, no new dependency; the core is untouched — platform is a frontend/host concern (R5). Proof: e2e specs for every interaction family run at both a desktop viewport and an emulated phone viewport with touch (§3.8); host verification includes one mobile-viewport pass. |

### R11 additions — M1 decomposition (D54–D57)

| # | Decision |
|---|----------|
| D54 | **FX2 wording normalized to the FX1 dataset (owner, R11).** The owner confirmed the Fuyuki material is a demo, not canon ("the Fuyuki stuff was an example"). FX1 names the cross-layer hubs 'Fuyuki Station' (alias 'Station Front') and 'Misaki Town'; FX2's expected route reads "Emiya Residence → Fuyuki Station → Misaki Town (walk 50 min, then train 5h)". CORE.md amended in the same change; supersedes the 'Shinto Station' naming in D16's example. |
| D55 | **FX3 is the importer's acceptance test (owner-assented, R11).** The legacy table is not triangle-consistent (e.g. M:O = 20 min vs M→E→O = 52), so ±20% across all pairs is unsatisfiable for any hand-authored sparse graph. FX3 is enforced at M3 against maps seeded by the MDS lookup-table importer; the hand-authored FX1 fixture is held to plausible geography plus the FX2 route. CORE.md amended in the same change. |
| D56 | **Fork facade commands deferred M1 → Phase 3 M4 (orchestrator, R11).** `forkMap`/`saveForkToLibrary` have no consumer before the fork UX lands (Phase 3 M4), and `saveForkToLibrary(): void` cannot hand the fork back to the host — that contract gap is decided when the fork UX is real (likely a return-type amendment). Stub TODOs relabel to 'Phase 3 M4' inside A-002. Sequencing only: no product behavior change (C25 unchanged). |
| D57 | **FX1 ships as `data/worlds/fuyuki.ts` (typed, deep-frozen); `misaki.json` deferred (owner-approved, R11).** A TS module is compile-time typechecked against `WorldMapData`; runtime JSON remains the user-facing import/export format (F05), validated by `validateWorldMap`. Supersedes the §3.7 `fuyuki.json`/`misaki.json` sketch; a second fixture file has no consumer yet. |

### R12 additions — M1 gate rulings & M2 decomposition (D58–D59)

| # | Decision |
|---|---|
| D58 | **Pin eligibility is kind-based (M1 verifier finding 3, orchestrator ruling).** Only kinds `location`/`hub`/`waypoint` may hold the pin, and the node must currently be childless — F27's "districts never hold it" is unconditional (D37). Arc endpoints remain *parent*-based ("edges into compound parents", §6.2). Validator/load seam: `validateOverlay` enforces pin eligibility strictly by default; `loadMap` opts into `tolerateIneligiblePin` (C27 — the pin is chat state a live library edit can invalidate at any moment, so load neither refuses nor snaps); `buildEffectiveGraph` marks the pin invalid and `setCurrentLocation` throws. One shared predicate (`isPinEligible`) in `validate.ts` so the rule cannot drift. CORE.md amended in the same change. |
| D59 | **M2 routing is a plain Dijkstra inside `src/core` (orchestrator, R12).** D6's "cytoscape built-ins via CyLike" assumed routing on the GraphService cy instance; the M1 architecture routes headlessly over the plain `EffectiveGraph`, where cytoscape is unreachable (R5). C16 explicitly sanctions plain Dijkstra (cross-layer arcs make Euclidean heuristics inadmissible). Brute-force min-scan at map scale (ponytail — maps have tens of nodes); revisit only if profiling demands. D6 remains the plan for any Phase 2 GraphService-side routing; no `CyLike` interface is introduced at M2. |

---

## 2. The Product in One Page

**Building a map.** The user opens the editor, creates layers (World / Fuyuki / Misaki), optionally uploads background images, clicks to place nodes (naming them, assigning kind and parent district), draws arcs between nodes (toggling walk/car/train, terrain, authored overrides where geometry would lie), and draws cross-layer arcs station-to-station. Saving stores the map in the library; importing a lookup-table block auto-seeds coordinates (MDS) as a starter.

**Playing.** In a chat, the user sets the current location. On every generation (if auto-inject is on), the extension renders the template from the live graph — current location, region, available routes with cardinal directions and costs, known destinations, blocked-route reasons — and injects it at the user-chosen position/depth/role. When the story moves somewhere, the user moves the pin; the toast offers to do it when it spots the name. A blocked bridge is two taps. A detour around the volcano is a tap on empty canvas — the waypoint persists for the chat and can be promoted into the map.

**Out-of-scope by design (v1):** the LLM moving the pin, automatic travel parsing, fog of war, world clocks, vehicle/economy tracking, aborting generations.

---

## 3. Architecture Blueprint

### 3.1 Layered overview

```
┌─ SillyTavern host page ────────────────────────────────────────────────┐
│  manifest.json ──▶ index.js (bundled ES module)                        │
│       hooks: activate/update/clean · macro {{travel_map}} ·            │
│       slash commands (/map …) · settings panel · toast scanner         │
│                                                                        │
│   <st-map-explorer> (Angular custom element, zoneless)                 │
│     └─ Viewer + Editor components                                      │
│           canvas host (cy.mount/unmount) · layer switcher · panels     │
│                                                                        │
│   GraphService (single cy instance, headless authority)                │
│     ├─ GraphEngine (pure TS: geometry, costs, dijkstra/aStar,          │
│     │   waypoints, snapshot + template renderer)                       │
│     └─ StateStore (signals: position, mode, overlay, blocked)          │
│                                                                        │
│   Persistence: library (localforage) · chat overlay (chatMetadata) ·   │
│   prefs/templates (extensionSettings) · card pointer (writeExtField)   │
└────────────────────────────────────────────────────────────────────────┘
```

Hard rule unchanged: **`src/core` never imports Angular, Cytoscape rendering, or SillyTavern.** Pure TypeScript over plain data + a `CyLike` structural interface, unit-testable in Node.

### 3.2 Stack decisions (D1–D9, provisional)

| # | Decision |
|---|----------|
| D1 | Angular exposed as a custom element (`@angular/elements`); no page ownership assumptions. |
| D2 | **Zoneless** (signals) — never load `zone.js` into ST. Cytoscape canvas events write signals only; high-frequency events cost zero change detection. Zoned fallback (`runOutsideAngular` + `run`) documented if the pinned Angular forces zones. |
| D3 | One `cy` instance owned by `GraphService`, created headless, `mount()`/`unmount()` on demand — computation works with the UI closed. |
| D4 | `SillyTavern.getContext()` only; bundle fully self-contained. |
| D5 | Prompt injection via ST's extension-prompt mechanism (verify `setExtensionPrompt` against the target ST's `st-context.js` — **not covered by the local doc excerpt**; fallback: `generate_interceptor`). Plus macro + manual modes (D23). |
| D6 | Pathfinding via cytoscape built-ins (`eles.dijkstra()` / `eles.aStar()`) with a mode-aware `weight(edge)` closure. No custom priority queues. |
| D7 | Cytoscape stylesheet as data; component-scoped CSS for panels; minimal global `style.css`. |
| D8 | Single-file ESM bundle via Angular CLI (esbuild) + post-build esbuild pass → `dist/extension/`. |
| D9 | Persistence split per §3.6; large binaries only in localforage. |

### 3.3 Core data model (`src/core/model/types.ts`)

```ts
export type NodeKind = 'world' | 'region' | 'city' | 'district' | 'location' | 'hub' | 'waypoint';
export type TravelMode = 'walk' | 'car' | 'train';
export type Terrain = 'road' | 'plain' | 'river' | 'swamp' | 'mountain';
export type NodeOrigin = 'authored' | 'user';   // user nodes live in the chat overlay (D21)

export interface LayerData {
  id: string;
  name: string;                        // 'World', 'Fuyuki City', 'Misaki Town'
  background?: { assetId: string };    // localforage-backed image (D29)
}

export interface MapNodeData {
  id: string;
  label: string;
  kind: NodeKind;
  layer: string;                       // which plane this node lives in (D16)
  parent?: string;                     // compound parent (district/city) — same layer
  position?: { x: number; y: number }; // canvas coords, y grows SOUTH
  description?: string;
  aliases?: string[];                  // also used by toast matching (D11/D26)
  transit?: { type: 'train' | 'port' | 'subway'; line?: string };
  origin?: NodeOrigin;                 // default 'authored'
}

export interface ModeSpec {
  allowed: boolean;                    // false ⇒ cost = Infinity
  authoredMinutes?: number;            // AUTHORED TIME WINS over everything (D14)
  multiplier?: number;                 // relative factor on derived time
}

export interface MapEdgeData {
  id: string;
  source: string;                      // leaf-to-leaf; may cross layers (D16)
  target: string;
  modes: Partial<Record<TravelMode, ModeSpec>>;
  terrain?: Terrain;
  authoredDistance?: number;           // overrides straight-line geometry (D14)
  blocked?: { reason: string };        // Infinity to routing, visible to prompt (D20)
  curve?: { distances: number[] };     // unbundled-bezier control points (visual)
  fare?: number;                       // reserved
}

export interface WorldMapData {
  schemaVersion: 2;
  id: string;
  name: string;
  layers: LayerData[];                 // ≥ 1 (single-layer maps are the degenerate case)
  scale: {
    unitPerPx: number;                 // 1 px = n of the canonical unit
    unitLabel: string;                 // 'km' | 'min' | 'league' | …
    unitKind: 'distance' | 'time';     // canonical unit may be either (D45)
    terrainMultipliers?: Partial<Record<Terrain, number>>;
    speed?: Partial<Record<TravelMode, number>>; // distance ↔ time conversion when needed
  };
  nodes: MapNodeData[];
  edges: MapEdgeData[];
}

// Per-chat overlay — persisted in chatMetadata, never in the library
export interface ChatMapOverlay {
  mapId: string | null;
  currentLocationId: string | null;
  actorId?: string;                    // reserved (D13)
  travelMode: TravelMode;
  statusNote?: string;                 // "on the road to X, ~2 km out" (D17)
  userNodes: MapNodeData[];            // waypoints — persist, promotable (D21)
  userEdges: MapEdgeData[];
  blocked: Record<string, string>;     // edgeId → reason (D20)
}
```

### 3.4 Geometry, cost & orientation (pure functions)

Orientation contract (encoded once, tested at 45° boundaries):

```ts
const COMPASS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']; // CCW from East, y flipped
export function cardinal(dx: number, dy: number): string {
  const a = Math.atan2(-dy, dx);       // flip y: north becomes +90°
  const i = Math.round((a < 0 ? a + 2 * Math.PI : a) / (Math.PI / 4)) % 8;
  return COMPASS[i];
}
```

**Cost function (per mode)** — the single `weight:` closure passed to dijkstra/aStar. Precedence per D14/D15:

```ts
export function edgeCost(e: EdgeSextette, mode: TravelMode, scale: Scale): number {
  if (e.blocked) return Infinity;                        // unreachable but LLM-visible
  const spec = e.modes?.[mode];
  if (!spec?.allowed) return Infinity;
  if (spec.authoredMinutes != null) return spec.authoredMinutes;   // authored time wins
  const units = e.authoredDistance                      // authored distance wins over geometry
    ?? euclid(posOf(e.source), posOf(e.target)) * scale.unitPerPx;
  const terrain = scale.terrainMultipliers?.[e.terrain ?? 'plain'] ?? 1;
  if (!scale.speed?.[mode]) return units;               // no speeds ⇒ cost = distance
  return (units * terrain) / scale.speed[mode] * 60 * (spec.multiplier ?? 1); // minutes
}
```

**Constraints carried from R0:**
- **C1:** edges terminate on leaves only (cytoscape compound rule) — cross-layer hub arcs (station↔station) are the intended inter-region model, not a workaround.
- **C2:** blocked edges return `Infinity` to routing but remain rendered (dashed/red) and prompt-visible (`[BLOCKED: reason]`).
- **C3:** cross-layer edges have no drawable line — each endpoint renders a badge ("→ Shinto Station · train 5h"); routing treats them as ordinary edges.

### 3.5 `GraphService` vs UI components

Unchanged from R0 in shape; surface extended for the editor and overlay:

```ts
@Injectable({ providedIn: 'root' })
export class GraphService {
  // signals: currentLocation, travelMode, activeLayer, route, snapshot (computed), dirty
  mount(el: HTMLElement): void;  unmount(): void;
  loadMap(map: WorldMapData, overlay: ChatMapOverlay): void;
  // runtime commands
  setCurrentLocation(id: string | null): void;
  addWaypointAt(layer: string, position: {x: number; y: number}): void; // kNN-connect leaves
  promoteWaypoint(id: string, label: string): void;                     // overlay → library
  setBlocked(edgeId: string, reason?: string): void;
  setStatusNote(note: string | undefined): void;                        // D17
  findRoute(from: string, to: string, mode?: TravelMode): RouteResult;  // layer-agnostic
  // rendering & prompts
  setActiveLayer(layerId: string): void;                                // viewer filter
  renderTemplate(tpl: string): string;                                  // Handlebars → block
  getPromptBlock(): string;                                             // default template
  // editor commands (Phase 3)
  upsertNode(node: MapNodeData): void;  removeNode(id: string): void;
  upsertEdge(edge: MapEdgeData): void;  removeEdge(id: string): void;
  exportMap(): WorldMapData;
}
```

`RouteResult` carries per-leg detail (edge, from/to, mode, minutes-or-units, blockedReason) for both the sidebar and template loops.

**Change-detection boundary (D2):** cy handlers are plain functions that write signals; no direct DOM mutation from event handlers. Panels are template-bound.

### 3.6 SillyTavern integration bridge

**Manifest:** as R0 (`generate_interceptor` retained only if D5 verification forces the fallback; macro + hooks otherwise).

**Bootstrap:** `activate` hook registers the custom element and stashes context handles; heavy work defers to `APP_READY`; the map panel mounts lazily on first open.

**Injection (D23).** Three user-selectable channels:

1. **Auto:** settings expose position (`before chat history` | `in-chat depth N`), role (system/user/assistant), and a scan toggle — wired to ST's extension-prompt API (`setExtensionPrompt(key, value, position, depth, role)`; constants verified against the running ST). The block re-renders on every state change; ST handles the rest.
2. **Macro:** `macros.register('travel_map', …)` renders the current block wherever the user places it (cards, author's note, STscript). Sync handler reading the snapshot.
3. **Manual:** `/map inject now` and `/map prompt` (returns the block for piping).

**Template engine (D24).** The block template is a user-editable string compiled with **Handlebars from `SillyTavern.libs`** (free, familiar, and syntactically distinct from ST's `{{macro}}` system — avoids double-processing collisions; our Handlebars uses `{{location}}` *inside the template string only*, which ST's macro engine never sees because the stored template is compiled by us, not substituted by ST). Default template reproduces the notes' XML. Variables: `location`, `region`, `layer`, `statusNote`, `routes[]` (label, direction, cost, mode, blockedReason), `destinations[]` (label, via, mode, cost), `unit`, `corrective` (D26 line).

**Toast scanner (D11).** On `CHARACTER_MESSAGE_RENDERED`, word-boundary regex over `aliases ∪ labels` of the active map (+ WI keywords if mirrored — D28). Match ≠ current location → `Popup.show.confirm("Move to X?")`. One consolidated prompt per message even with multiple matches (pick the *last* mentioned).

**Persistence matrix:**

| Data | Store | API |
|---|---|---|
| Map library (topology JSON) | localforage `travel_mapper/maps/<id>` | `SillyTavern.libs.localforage` |
| Background images (binary) | localforage `travel_mapper/assets/<id>` | idem — never in settings (D29) |
| Chat overlay (position, mode, blocks, waypoints) | `chatMetadata.travel_mapper` — always re-read via `getContext()` | `saveMetadata()`; restored on `CHAT_CHANGED` |
| Prefs, injection config, templates | `extensionSettings.travel_mapper` | `saveSettingsDebounced()` |
| Card ↔ default map pointer | `writeExtensionField(characterId, 'travel_mapper_default_map', mapId)` | guarded — `characterId` is undefined in groups |

**Schema migrations:** `schemaVersion` + `onUpdate` hook migration table; validators reject unknown-newer versions with a field-precise message (never a partial load).

**Slash commands:** `/map show|hide`, `/map set-location <name|alias>`, `/map goto <name> [mode=]` (compute + move + toast ETA), `/map block|unblock <edge> [reason]`, `/map note <text>` (D17), `/map prompt`, `/map inject now`.

### 3.7 Repository layout

```
AGENTS.md        binding brief for every agent (auto-injected into sub-agents via injectAgentsMd)
.zcode/agents/   spawnable implementer agents (cheap model, D49): graph-engine · ui-editor · st-integration
src/core/        model (types, validate, migrate) · geometry · routing · prompt (snapshot, template)
src/app/         graph.service.ts · viewer/ (canvas, layers, panels) · editor/ (node, arc, props) · elements.ts
src/st/          entry · settings-ui · injection (prompt-api, macro, commands) · scanner (toast) · persistence
data/worlds/     fuyuki.json (2 layers + Misaki hubs) · misaki.json
tests/           unit (Vitest, Node) · e2e (playwright, harness)
scripts/         build-extension.mjs · import-lookup-table.mjs (MDS seeder)
```

Dev loop unchanged: `ng serve` harness (custom element + demo map, zero ST) → copy `dist/extension/` into local ST's `public/scripts/extensions/third-party/` for smoke tests.

### 3.8 Testing strategy

| Layer | What it proves |
|---|---|
| `src/core` (Vitest, Node) | compass at boundaries; cost precedence (authored time > authored distance > geometry; blocked > all); **two-layer acceptance: Emiya Residence → Fuyuki Station → Shinto Station** (the owner's stated expected route); disconnected/all-blocked ⇒ `ok:false` + reason; template rendering snapshots (default XML + a markdown variant); validator rejections |
| `src/app` (TestBed) | signal flow, mount/unmount, editor commands mutate graph + dirty flag, waypoint promote moves node overlay→library |
| E2E (playwright, harness) | editor: create map from scratch (place node, draw arc, save, reload, route); viewer: tap-canvas waypoint + reroute; layer switch; resize; **every interaction family also runs at an emulated phone viewport with touch (D53)** |
| ST integration (manual + playwright) | auto-inject at both positions; macro placement; toast on narrated location; overlay survives reload & chat switch; injected content does not persist into saved history; map-less chat idles; one mobile-viewport pass over settings, toast, and slash flows (D53) |
| Independent verification (`verifier` agent, phase gates) | adversarial suite in `tests/verify/**` derived from spec, not implementation: trivially-green tests in existing suites; uncovered F/C rows; the §6.2 edge-case catalog; FX gaming; ∞ leakage (C17); machine names in prompts (C23); precedence violations (C14); A/B/C seam behavior |

---

## 4. Sub-Agent / Workstream Breakdown

Contract-first rule unchanged: `src/core/api.ts` + `GraphService` surface frozen before parallel work.

### Agent A — Graph Engine
Owns `src/core/**`, `data/worlds/*`, `scripts/import-lookup-table.mjs`, unit tests. Delivers: model with layers/units/overrides; geometry + cost precedence; layer-agnostic dijkstra/aStar via `CyLike`; waypoint kNN-connect + promote; snapshot + **Handlebars-compiled template renderer** with the variable contract of §3.6; validators/migrations; MDS importer that seeds coordinates from a lookup-table paste. Done when: Vitest green incl. the Emiya→Misaki two-layer route and template snapshots; zero framework/ST imports (lint-enforced). *Ponytail: brute-force kNN; no graph DB; no custom algorithms before profiling.*

### Agent B — UI, Visualization & Editor
Owns `src/app/**`, styles, harness, e2e. Delivers: viewer (mount/unmount, **layer switcher with per-layer backgrounds**, compound rendering, route sidebar, location inspector, blocked toggle, waypoint placement/promotion, cross-layer badges C3, `unbundled-bezier` curves) **and the editor** (create/edit/delete nodes with property panel, draw-arc mode with mode/terrain/authored fields, layer management, background upload, library save/load/export-import) — all of it responsive and touch-operable at phone viewports (D53: unified pointer/touch canvas input, no hover-only affordances, panels → sheets at narrow widths). Done when: playwright builds a usable two-town map from scratch in the harness — desktop and emulated phone viewport with touch alike (D53); waypoints persist via service commands; resize-safe canvas; no global CSS leakage.

### Agent C — SillyTavern Integration
Owns `src/st/**`, `manifest.json`, `global.d.ts`, build script, README. Delivers: bootstrap; settings panel (injection config D23, template editor with live preview, defaults); injection channels (extension-prompt API — **verify then wire**, macro, slash commands); toast scanner (D11/D26, coordinated with WI keywords); persistence matrix incl. library + card pointer + optional WI mirroring with double-injection guard; `onClean` purge; README per submission rules. Done when: loads clean in local ST; auto-inject + macro + manual all demonstrable; overlay survives reload/chat switch; group chats degrade gracefully; no generation is ever aborted.

**Parallelization:** M0 walking skeleton (Agent C) validates D1/D2/D8 first; A starts immediately; B starts same-day on contract stubs.

---

## 5. Phased Development Roadmap

### Phase 1 — Headless Engine *(~1.5–2 weeks)*
- **M0 Walking skeleton:** zoneless custom element hello-world, build script, manifest, loads into local ST. *Gate for D1/D2/D8.*
- **M1 Model & data:** types + validators + migrations; two-layer Fuyuki/Misaki fixture with hub arc; units config.
- **M2 Engine:** geometry, cost precedence (D14/D15), pathfinding, unreachable handling, waypoint connect/promote, status note.
- **M3 Snapshot & templates:** neighborhood query, destinations (D25), corrective line (D26), Handlebars renderer + default XML template + one markdown sample; MDS lookup-table importer.

*Exit: the extension answers "where am I, where can I go, at what cost, which direction, in the user's chosen format" as text, from Node, with no UI.*

### Phase 2 — Viewer *(~2 weeks)*
- **M1 Canvas & layers:** mount/unmount, layer switcher, backgrounds, compound boxes, first-paint layout, drag; unified pointer/touch input (tap, drag, pinch-zoom, pan — D53), verified at an emulated phone viewport.
- **M2 Routing UX:** route sidebar with legs/totals/mode switch, blocked toggle with reason input (C2), cross-layer badges (C3).
- **M3 Waypoints:** tap-to-place (kNN connect), remove, promote-to-map, rerender/reroute; `unbundled-bezier` for curved detours.
- **M4 Polish:** ResizeObserver → `cy.resize()`, label culling, `cy.batch` bulk ops; responsive panels (sheets at narrow widths) and tap-target sizing (D53).

*Exit: fully navigable demo map in the harness — desktop pointer and phone-viewport touch alike (D53).*

### Phase 3 — Editor *(~2–3 weeks — the product requirement)*
- **M1 Node editing:** place/rename/move nodes, kind & parent (district) assignment, aliases, property panel, **quick-connect** — select a node, pick targets, batch-create arcs with defaults (D42).
- **M2 Arc editing:** draw-arc mode (tap/click source → target), mode toggles, terrain, authored distance/time overrides, curve control, **"measure this arc" scale calibration** (D44) — operable by touch alone (D53).
- **M3 Layers & backgrounds:** layer create/rename/reorder, per-layer background upload (assets → localforage), assign nodes to layers; drill-down portal behavior (D35).
- **M4 Library & forks:** save/load/duplicate/delete maps, JSON export/import, MDS importer UI ("paste your lookup table"), fork-to-chat + save-fork-back-to-library (D41); card pointer surfaces as a picker suggestion (D40).

*Exit: a user with zero JSON knowledge builds a two-town map with a background image and routes between them — on a desktop and on a phone-sized touch screen (D53).*

### Phase 4 — SillyTavern Hookup *(~1.5–2 weeks)*
- **M1 Lifecycle & settings:** bootstrap, settings panel, injection config + template editor with preview, persistence wiring, `CHAT_CHANGED` restore, migrations.
- **M2 Injection:** extension-prompt API (verified) + macro + manual command; skip conditions; no-persist guarantee tested.
- **M3 Awareness:** toast scanner (D11) with alias/WI-keyword coordination; corrective line; `/map` command suite.
- **M4 Ship prep:** README (install/usage/features), versioned release, `onClean`, submission checklist; mobile-viewport smoke pass in local ST via device emulation — settings, toast, slash flows (D53).

### Phase 5 — Post-MVP backlog (explicitly out of scope until asked)
Function tools (`travel_to` for LLM-driven movement), auto-travel parsing, position rollback journal, fog of war (D22), weather/time-of-day modifiers (D18), vehicle location & fares, promote blocks to world, multi-actor positions, fuzzy time phrasing, WI mirroring UX, **MCP server adapter** (§7).

---

## 6. Risk & Edge-Case Assessment

### 6.1 Risks

| Risk | L×I | Mitigation | Owner |
|---|---|---|---|
| Angular-in-ST bundle friction | H×H | M0 skeleton first; zoneless; custom element; scoped CSS; core is framework-free so the UI layer is rebuildable | C |
| **Editor scope creep** (the classic graph-editor tar pit: undo/redo, snapping, multi-select, alignment) | H×M | MVP editor = tap-create, drag, draw-arc, property panel. **No undo, no multi-select, no snapping in v1** (delete-and-redo is acceptable); Ponytail review at phase gate | B |
| `setExtensionPrompt` unverified in target ST (absent from local doc excerpt) | M×H | Verify against `st-context.js` early in Phase 4 M2; documented fallback = `generate_interceptor` (chat-splice with clone strategy) | C |
| Template syntax collisions (ST `{{macros}}` vs our template) | M×M | Inner templates compiled by us via Handlebars; ST macro engine never sees stored template strings; e2e test with a `{{macro}}`-looking placeholder | A/C |
| WI mirroring double-injects location lore + map block | M×M | Mirroring off by default; when on, either lore-only entries or block slimming; integration test counts injections | C |
| Canvas sizing in ST's animating drawers (0×0 at mount) | H×M | Lazy mount on first open; ResizeObserver → `cy.resize()`; rAF poll until non-zero | B |
| Touch & narrow-viewport gaps (hover-only affordances, pinch conflicting with host page scroll, cramped panels) | M×M | Unified pointer/touch canvas input + `touch-action` rules; no hover-only affordances; panels → sheets at narrow widths; e2e at emulated phone viewport (D53) | B |
| Cross-layer edges confuse users (invisible connection) | M×M | Endpoint badges with destination/mode/cost (C3); e2e comprehension check | B |
| Token bloat from block | M×M | Neighborhood-only + destinations cap (12) + template-side trimming; char budget asserted in snapshot tests | A |
| Dense sub-graph perf | M×M | `cy.batch`, label culling, texture-on-hover; headless instance unaffected by render load | A/B |
| ST version drift | L×M | `getContext()` surface only; `minimum_client_version`; typed `global.d.ts` | C |
| State corruption / schema drift | M×M | `schemaVersion` + migrations; validators reject-and-report; all ST hooks wrapped in try/catch — map failures must never block generation | A/C |
| Bundle size | M×L | 1.5 MB budget checked in build; no router/CDK without justification | C |

### 6.2 Edge cases (test-backed)

**Geometry & routing:** cardinal at 45° boundaries; zero-distance nodes; route-to-self; disconnected/all-blocked ⇒ `ok:false` + human reason (never `Infinity` in a prompt); authored-time edges must not accrue terrain multipliers; waypoint edges use the same cost function (no parallel math); **cost units are ambiguous when no speeds are configured — template must render unit-aware labels, and `/map goto` toasts "km" not "min" in that mode**.

**Waypoints & overlay:** tap inside a compound's box but not on a node ⇒ top-level user node in that layer; kNN considers leaves only; orphaned waypoints stay (removable); rapid taps ⇒ engine-assigned ids; promote moves the node overlay→library atomically (same id, `origin` flips to `authored`).

**Layers:** cross-layer arc whose endpoints get re-parented to another layer — stays valid (edges reference ids, not layers); layer deletion with resident nodes ⇒ blocked with count, forces move-or-delete; background aspect ≠ canvas ⇒ fit-and-center with letterboxing, coordinates unaffected.

**Touch & viewport (D53):** tap-vs-drag threshold on the canvas; pinch-zoom never scrolls the host page (`touch-action`); double-tap portal entry never triggers the browser's double-tap zoom; panels survive a live viewport resize and orientation change; editor draw-arc works with touch only; hover-only affordances are a defect, not a degradation.

**SillyTavern lifecycle:** `CHAT_CHANGED` mid-edit ⇒ debounced `saveMetadata` flushed first; group chat ⇒ no card pointer write, library default applies with toast; generation with injection off / no location ⇒ zero-cost no-op; injected block must not persist into saved history (tested after `GENERATION_ENDED`); extension disabled ⇒ listeners removed, element detached, `onClean` purges settings + localforage.

**Data:** duplicate ids, dangling edge endpoints, NaN coordinates, edges into compound parents ⇒ validator rejects pre-`cy.add`; imported map with newer `schemaVersion` ⇒ refuse with toast; template syntax error in user template ⇒ fall back to default template + toast (never an empty injection).

---

## 7. MCP Verdict (D32)

**Out of scope for v1 — it solves a problem we don't have yet, at real cost.**

- **Redundant in-app:** ST's native function-tool registration (`registerFunctionTool`, documented in our own `extensions.md`) already lets the LLM call map operations with zero extra infrastructure. Anything an MCP server would expose to the ST-hosted LLM, native tools expose cheaper.
- **Deployment friction:** an MCP server is a second process the user must run and configure. The ST submission rules reject extensions requiring server-side companions for good reason — same logic applies to MCP for a v1 audience of ST users.
- **What MCP *would** buy: the map engine usable by agents *outside* SillyTavern (other clients, external editors, scripting). That's a real but future need — and cheap later, **precisely because `src/core` is framework-free pure TypeScript**: an MCP server is a thin stdio adapter over `findRoute`/`getPromptBlock`, roughly a hundred lines plus transport. No architectural regret from deferring.
- *Caveat to verify when revisiting:* ST's own MCP client support and tool-exposure semantics against the then-current release.

---

## 8. Immediate Next Steps

Product spec is stable through R10 (D10–D53); features in `PRODUCT.md`, conventions in `CORE.md`, charters in `AGENTS.md` + `.zcode/agents/` (A–D, spawnable, cheap model), delegation & phase gates in `ORCHESTRATION.md`, tooling allocation in AGENTS.md §7. Remaining micro-confirmations (defaults in effect unless vetoed):

1. **Fork default (D41):** forks attach to the chat; character-level forks and "save back to library" come as explicit actions.
2. **Card pointer (D40):** shows as a *suggested* map in the picker, never auto-applied — this reconciles Q17 (R1) with Q27 (R3).
3. **Q29 assumption:** the doubled "Q28: your rec" in R3 is read as covering Q29 too — floating, remembered-position panel with a maximize button; editor maximizes by default.
4. **Phase 1 progress:** Task 0 + M0 done at R9 (scaffold + walking skeleton loading in local ST); **M1 done & gate-passed at R12** (D58 ruling; awaiting owner commit approval). Next dispatch: M2 packets A-005 → A-006 → A-007 per `.zcode/packets/M2.md`, then the M2 verifier gate. **R10 (D53):** mobile & desktop parity applies to every UI/host packet from Phase 2 on; Phase 1 (headless core) is unaffected.
