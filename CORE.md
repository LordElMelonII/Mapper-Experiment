# CORE.md — Engine Conventions & the Business-Logic Boundary

**Status:** R12 · Normative for the core engine (`src/core`) and the service facade
**Companions:** `PRODUCT.md` (feature catalogue) · `EXECUTION-PLAN.md` (architecture & decisions D10–D64)
**Rule of this document:** defines *how the engine computes and what it owns*, so the numbers are trustworthy and the logic stays independent of any UI, framework, or host. Convention IDs (C-numbers) are cited by tests and code comments; they deliberately continue the C1–C3 numbering first used in EXECUTION-PLAN.md.

---

## 1. What "core" means

The core is the product's brain: everything that must remain true when the screen is off. Its properties:

- **Pure** — no imports from UI frameworks, rendering libraries, or the host application. Dependency direction is one-way: everything may depend on the core; the core depends on nothing.
- **Deterministic** — same inputs, same outputs. Ids are assigned by the engine, never by callers, the clock, or randomness the caller can't see.
- **Headless-testable** — runs in a bare Node test runner against plain data.
- **The single source of numeric truth** — every distance, direction, duration, and route the user or the LLM ever sees originates here. No other layer computes one.

---

## 2. Data planes & the effective graph

Three planes, never mixed:

| Plane | Contents | Mutated by |
|---|---|---|
| **Library** (authored truth) | Maps: layers, scale, nodes, arcs | The editor, on explicit save only |
| **Overlay** (per-chat truth) | Pin, active mode, status note, blocks, user nodes/arcs | Runtime commands, as the user acts |
| **Effective graph** (derived) | Library ∪ overlay | Nobody — always rebuilt |

All queries (routing, snapshot, template rendering) run against the **effective graph** only. The overlay is a diff, not a second graph; it is never queried directly.

---

## 3. Graph & structure conventions

- **C1 — Leaf-to-leaf.** Arcs terminate on leaf nodes only. Containers (districts, cities) organize and label; they never connect and never hold the pin. (D58: pin eligibility is *kind*-based — only `location`, `hub`, `waypoint`, and currently childless — and arc-endpoint eligibility follows the same childless-leaf rule: an edge into a compound parent is invalid data that the validator rejects, §6.2. "Parent-based" in D58 means *being a parent disqualifies a node as an endpoint*, not that parents are endpoints.)
- **C2 — Blocked ≠ hidden.** A blocked arc is excluded from routing (infinite cost) but remains in the snapshot with its reason, so the LLM knows *why* a route is unavailable.
- **C3 — Cross-layer arcs are ordinary arcs** whose endpoints happen to live on different layers. No special routing semantics; the frontend renders them as badges at their endpoints.
- **C4 — The graph is the author's truth.** The core never invents connections: no implicit adjacency, no obstacle inference, no "these two are close so connect them". Chokepoints (bridges, mountain passes) are nodes the author creates (D43).
- **C5 — Ids belong to the engine.** Callers never propose ids; rapid creations cannot collide.
- **C6 — Arcs are bidirectional** in v1. There is no one-way arc.
- **C7 — User-node connection.** A runtime-placed node connects to the *k* nearest leaf nodes on the same layer (k defaults to 3, configurable). An orphaned user node is legal and harmless.
- **C8 — Materialization.** The effective graph is rebuilt from library + overlay on every change (edit save, overlay mutation, map/fork switch). Rebuild is atomic: queries never observe a half-applied state.

---

## 4. Measurement conventions

- **C9 — Orientation.** Origin top-left; x grows East; y grows South (Δy < 0 ⇒ North). Encoded in exactly one function; unit tests pin the 45° boundaries.
- **C10 — Cardinality.** Eight-way directions (N, NE, E, …) computed from Δx and Δy. Cross-layer arcs have no geographic direction and are reported without one.
- **C11 — Quantities.** Every authored value is *value + unit kind* (`distance` or `time`). Normalization on ingest: time → minutes; distance → the map's distance unit (establishing it via calibration when absent, D44). The map's canonical scale may itself be distance-kind (1 px = 0.25 km) or time-kind (1 px = 6 min) (D45).
- **C12 — Authored semantics.** An authored distance is the **straight-line separation** between two nodes ("air travel" distance), never a padded road length. Winding streets and longer-than-they-look journeys belong to authored *time* or multipliers (D44).
- **C13 — Calibration.** `unitPerPx = authored distance ÷ pixel length of the arc`. Offered when the scale is unset or on demand; an existing scale is never silently overwritten.
- **C14 — Cost precedence** (per arc, per mode — the normative order):
  1. arc blocked → ∞
  2. mode not allowed on the arc → ∞
  3. authored time → that value (normalized minutes)
  4. authored distance → converted via the mode's speed (when speeds are defined)
  5. geometric distance × scale × terrain multiplier → converted via speed when defined
  6. no speeds defined anywhere → cost is denominated in canonical units; routing optimizes by distance and every label says so
- **C15 — Routing currency.** Minutes whenever time is derivable; otherwise canonical units. One currency per route computation — costs are never mixed within a route. (Enforced at the `findRoute` seam per D60: minutes-first, whole-computation canonical fallback, cross-currency modes unroutable in a run. At the snapshot seam per D65: one currency per **snapshot** — minutes only when at least one live incident arc exists and all price in minutes; blocked arcs are currency-neutral and always listed (C2); hub destinations run currency-forced, and a hub with no in-currency route drops like a cross-currency arc.)

---

## 5. Path conventions

- **C16 — Optimality.** Route results must be optimal for the active cost function. Because cross-layer arcs have no meaningful geometry, Euclidean heuristics are inadmissible when they exist: use plain Dijkstra, or A\* with the heuristic zeroed on cross-layer arcs.
- **C17 — Unreachability.** No finite path ⇒ `ok: false` plus a human-readable reason (disconnected, or all candidate arcs blocked/disallowed). The value ∞ never appears in any output.
- **C18 — Route shape.** `{ ok, total, legs[] }`; each leg carries arc id, from, to, mode, cost, and optional blocked/detour reason. Legs are the unit of UI display and of template loops.

---

## 6. Snapshot & prompt conventions

- **C19 — Neighborhood.** The snapshot's route section lists exactly the arcs incident to the pin within its layer, plus cross-layer arcs at the pin. There is no same-district sibling awareness (D36).
- **C20 — Destinations.** Shortest paths from the pin to a curated destination set (hubs by default), capped (12 entries), with truncation marked.
- **C21 — Text matching.** Matching free text to nodes uses word-boundary, case-insensitive matching over names ∪ aliases. A failed match produces a nearest-suggestions corrective string (D26). The pure matching function lives in the core; only its orchestration (subscribing to events, showing popups) lives in the host layer.
- **C22 — Snapshot is data; the template is words.** The snapshot is a plain serializable object. Rendering to the prompt block goes through the user's template with a fixed variable contract: `location`, `region`, `layer`, `statusNote`, `routes[]`, `destinations[]`, `truncated` (C20's cap dropped entries — D63), `unit`, `corrective`. The renderer is core (context assembly, C23 exclusion, C32 fallback); the template *content* is user data; the template **engine** is an injected Handlebars-shaped capability per D62/R5 (host: SillyTavern.libs; tests/harness: devDependency — never bundled). The ONE `unit` labels the whole snapshot (D65): every presented cost — routes and destinations alike — is stated in it; uniformity is per snapshot, not per leg.
- **C23 — No machine names.** Unnamed user nodes are excluded from every prompt-facing structure. `waypoint_3` must never reach an LLM.

---

## 7. State & lifecycle conventions

- **C24 — Live references.** A chat's map is the library object itself; edits propagate on next materialization, and affected chats are notified ("map updated") (D33).
- **C25 — Forks.** Forking copies library → a chat-attached private map and switches the chat's reference to it. Forks never re-sync. Saving a fork back to the library is an explicit, non-default action (D41).
- **C26 — Promotion.** Promoting a user node moves it overlay → library under one id. Atomic: on failure the overlay is untouched. Incident user edges graduate per D61: library-bound edges move into the map; edges to still-overlay waypoints stay chat-scoped in the overlay until their last overlay endpoint promotes.
- **C27 — Orphan policy.** If materialization finds the pin's node deleted: keep the pin, mark it invalid, degrade the snapshot to a warning, pause injection until re-pinned. Never silently snap to a neighbor (D39).
- **C28 — Stickiness.** No message-level rollback of the pin (D12).
- **C29 — Explicit saves.** Nothing mutates the library until a save command runs (D47).

---

## 8. Validation & failure conventions

- **C30 — Reject-before-mutate.** Validators run before any graph change; errors are field-precise and collected (multiple issues per report, not first-only).
- **C31 — Versioning.** An unknown *newer* schema version is refused with a clear message; a known-older one is migrated on load, one migration step per version.
- **C32 — Degrade, never throw.** Any core failure on a generation-time path yields an empty or stale snapshot, not an exception. The host's generation must never be endangered by the map.
- **C33 — Completeness of cleanup.** Disable/uninstall paths remove listeners, storage keys, and assets without residue.

**Validator/load seam (D58):** `validateOverlay` enforces pin eligibility strictly by default; `loadMap` passes `tolerateIneligiblePin` because the pin is chat state a live library edit can invalidate at any moment (C27) — load neither refuses nor snaps. `buildEffectiveGraph` marks an ineligible pin `valid: false` and `setCurrentLocation` throws; those two carry the runtime enforcement.

---

## 9. The separation contract (core vs frontend vs host)

**The core owns:** measurement (C9–C15), graph rules (C1–C8), routing (C16–C18), snapshot & prompt rendering (C19–C23), state transitions (C24–C29), validation & migration (C30–C31), id assignment.

**The frontend owns:** rendering the graph and panels, interaction (taps, clicks, drags, canvas gestures, arc drawing — touch and pointer parity per D53), editor ergonomics, theming, responsive layout. It calls commands and renders projections.

**The host layer owns** (SillyTavern-specific): persistence adapters (library storage, per-chat storage, preferences, card pointer), prompt injection channels, event subscription, popup/toast orchestration. It calls the core; the core never calls it.

**Rules (normative):**

- **R1 — No UI math.** If a number is displayed, the core produced it. The frontend never computes a distance, direction, or duration.
- **R2 — Commands only.** The frontend mutates nothing directly; every change is a facade command (below).
- **R3 — Unidirectional flow.** command → state → derived snapshot/projections → view. Views never write state.
- **R4 — No shadow truth.** The frontend holds projections (read-only views of snapshot/route), never a second copy of the graph.
- **R5 — Dependency direction.** core ← frontend ← host. Host-facing adapters implement core-defined interfaces; the core imports nothing outward.
- **R6 — Split by nature, not by layer.** Pure logic that *touches* host concepts (e.g., message-text matching for the toast) lives in the core as a pure function; only its orchestration lives in the host layer.

**The facade — the only command surface the frontend and host may call:**

```
Map lifecycle    loadMap · materialize · forkMap · saveForkToLibrary · validateImport · migrateData
Presence         setCurrentLocation · setStatusNote · setTravelMode · setCorrective (D63)
Overlay edits    setBlocked · addUserNodeAt · removeUserNode · promoteUserNode
Editor commands  upsertNode · upsertEdge · removeNode · removeEdge · calibrateScale · saveMap
Queries          findRoute · getSnapshot · renderTemplate · getPromptBlock
Viewer state     setActiveLayer
```

Anything the frontend or host needs beyond this list is a core design gap, not a license to reach around the facade.

---

## 10. Test fixtures & acceptance (normative)

- **FX1 — Fuyuki/Misaki two-layer fixture.** Derived from `Notes for locations.md`: 13 locations, districts, a cross-layer station arc, one blocked-bridge sample. Canonical unit: time (minutes), matching the legacy table.
- **FX2 — Emiya → Misaki.** Expected route: Emiya Residence → Fuyuki Station → Misaki Town (walk 50 min, then train 5h). The owner's stated acceptance case; wording normalized to the FX1 dataset per D54 — the Fuyuki material is a demo, not canon.
- **FX3 — Legacy regression.** Derived values within ±20% of the original lookup table across its pairs — enforced on the metric-satisfiable pairs; the 22 pairs the table itself violates are waived under a self-enforcing exemption list (D64; the minimal proof: B–H = 15 vs |305−275| = 30 breaks the reverse triangle inequality, so no embedding can realize the exact table). Enforced at M3 against MDS-importer-seeded maps (D55); the hand-authored FX1 fixture is held to plausible geography plus FX2, not to FX3. Authored minutes are preserved exactly on every imported edge.
- **FX4 — Template snapshots.** Default XML template plus one markdown variant, golden-file tested.
- **FX5 — Precedence matrix.** Every row of C14 exercised by a unit test, including blocked, disallowed-mode, authored-time, authored-distance, terrain, and no-speeds cases.
