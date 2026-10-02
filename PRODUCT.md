# PRODUCT.md — Travel & Map Explorer: Feature Catalogue

**Status:** R10 · Stack-free product specification
**Companions:** `CORE.md` (engine conventions & logic boundaries) · `EXECUTION-PLAN.md` (architecture, phases, decision register D10–D53)
**Rule of this document:** it describes *what* the product does and what users experience — no frameworks, libraries, or host APIs. Where a feature exists because of a recorded product decision, the decision ID is cited (D-numbers live in EXECUTION-PLAN.md).

---

## 1. What this is

A tool for roleplayers who run stories across a geography. It replaces static "distance lookup tables" pasted into prompts with a living map the user authors: places (nodes) connected by routes (arcs), arranged on one or more layers with optional background images. The product always knows where the party is, what is reachable, at what cost, and in which direction — and turns that into a compact, template-driven context block for the language model.

Target host: SillyTavern. The prime directive: **the user is the authority.** The product informs and suggests; it never moves characters on its own, never blocks a generation, and never enforces realism the author didn't author.

---

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Map** | A world's full definition: layers, scale, nodes, arcs. Lives in the user's library. |
| **Layer** | One coordinate plane with its own extent and optional background (a world layer, a town layer). |
| **Node** | A place. Kinds: world, region, city, district, location, hub, user node. |
| **Hub** | A location with transit metadata (station, port, subway stop) — the natural endpoint of cross-layer arcs. |
| **Arc** | A direct travel connection between two nodes: allowed modes, optional authored cost, terrain, blocked state. |
| **Mode** | walk / car / train. |
| **Pin** | The party's current location, always on a leaf node. |
| **Status note** | Freeform presence text for "between places" or vague presence. |
| **Block** | A chat-scoped mark on an arc: impassable, with a reason. |
| **Overlay** | Per-chat state: pin, active mode, status note, blocks, user nodes and arcs. |
| **Library** | The user's collection of authored maps. |
| **Fork** | A private copy of a library map attached to a chat; immune to library edits. |
| **Snapshot** | The computed state of the world at an instant: where we are, what's reachable, at what cost. |
| **Prompt block** | The snapshot rendered through a template into text for the LLM. |

---

## 3. Feature catalogue

F-numbers are stable feature IDs. The roadmap and test plan cite them.

### A. Maps & layers

- **F01 Multi-layer maps** — a map contains any number of layers, each its own coordinate plane (D16).
- **F02 Drill-down navigation** — one layer visible at a time behind a breadcrumb; nodes on coarser layers act as portals (enter by double-tap or double-click). Upper-layer positions still give inter-town directions for narration ("Misaki lies north") (D35).
- **F03 Background images** — user-uploaded, per layer, fitted and centered; the node graph is always the interface on top (D29).
- **F04 Map library** — save, load, duplicate, delete; chats reference library maps live, with an update notice when a map they use changed (D33).
- **F05 Import / export** — whole maps as JSON files, in and out.
- **F06 Legacy importer** — paste an existing distance lookup table; node positions are auto-seeded from the table's numbers as a starting point.

### B. Nodes

- **F07 Kinds & nesting** — places organize into containers (districts inside cities inside regions); containers label and group, they never carry the pin and never connect to arcs.
- **F08 Names & aliases** — a display name plus alternate spellings; aliases feed message matching (F31, F38).
- **F09 Hubs & transit metadata** — a node may declare itself a station/port/stop with a line name.
- **F10 User nodes (waypoints)** — placed at runtime by tapping empty canvas; persist for the chat; promotable into the map under a proper name. Unnamed user nodes never reach the LLM (D21).

### C. Arcs

- **F11 Travel modes** — per-arc allowed modes: car-only roads, walk-only paths, rail.
- **F12 Authored cost — distance *or* time** — an arc may carry an authored straight-line distance (any distance unit) or an authored journey time (any time unit). Authored values always win over geometry (D14, D44, D45).
- **F13 Terrain multipliers** — optional per-terrain factors (road, plain, river, swamp, mountain) applied to derived costs.
- **F14 Blocked routes** — an arc can be impassable with a reason; excluded from routing, still drawn (dashed), and still reported to the LLM with its reason (D20).
- **F15 Curved display** — optional visual bend for arcs that detour around something.
- **F16 Quick-connect** — select a node, pick any number of targets, batch-create arcs with sensible defaults (D42).
- **F17 Cross-layer arcs** — connect hubs across layers (station ↔ station); inter-layer travel always passes through these explicit arcs.

### D. Measurement & geography

- **F18 Coordinate orientation** — standard screen orientation; directions are reported consistently (Δy < 0 = North, Δx > 0 = East).
- **F19 Geometry first** — costs derive from node positions and the map scale by default; nothing needs to be typed unless the author wants to override.
- **F20 Scale calibration** — "measure this arc": authored distance ÷ on-screen length ⇒ the map's scale; the unit label seeds from it (D44).
- **F21 Unit freedom** — the map's canonical unit may be distance-kind (km, miles) *or* time-kind (minutes); per-arc authored values may be either kind (D15, D45).
- **F22 Direction reporting** — every reachable neighbor is reported with a cardinal or intercardinal direction.

### E. Routing

- **F23 Multi-modal shortest route** — between any two nodes, across layers, honoring modes, blocks, and authored costs; results carry per-leg detail (mode, cost, blocked reason).
- **F24 Unreachable reporting** — no finite route yields a human-readable reason, never a raw "infinity".
- **F25 Destination awareness** — the prompt block can include a compact list of known far destinations with best-mode costs, routed through hubs (D25).
- **F26 Runtime detours** — blocked volcano pass? Tap to place a user node; routes recompute through it (F10).

### F. Presence & travel

- **F27 Pin on leaves** — the pin sits on concrete places; districts never hold it. A precise unnamed spot means the user creates a node for it (D37).
- **F28 Status note** — freeform presence: "on the road to Big Bridge, ~2 km out" (D17).
- **F29 Sticky state** — the position survives swipes, deletions, and regenerations (D12).
- **F30 Silent moves + announce toggle** — moving the pin is silent by default; an optional bracketed travel line can be emitted to chat (D38).
- **F31 Location-detection toast** — scans messages (scope configurable: AI / user / both) for known place names and offers to move the pin; never acts alone (D11, D34).
- **F32 Mode per route** — routing picks the best mode per route; there is no persistent vehicle state (D19).

### G. LLM context

- **F33 Template-driven block** — the entire prompt block is a user-editable template; the product computes values, the user owns the words (D24).
- **F34 Default template** — an XML-style default matching the classic lookup-table look; markdown, brackets, or bare text are equally valid user templates.
- **F35 Injection channels** — automatic on every generation, a macro placed anywhere, or on demand via command (D23).
- **F36 Placement control** — before chat history, or in-chat at a chosen depth and role (D23).
- **F37 Routes optional** — users may strip route listings from their template and narrate travel themselves (D36).
- **F38 Corrective line** — a narrated place that matches nothing yields a nearest-known-suggestions line (D26).
- **F39 Token discipline** — capped route and destination counts; truncation is marked.

### H. Editor

- **F40 Node editing** — place, rename, move, re-kind, re-parent, alias, describe.
- **F41 Arc editing** — draw, edit modes/terrain/authored costs, curve, delete.
- **F42 Layer management** — create/rename/reorder; assign nodes to layers; portal wiring.
- **F43 Background upload** — per layer, stored as assets, never inside settings.
- **F44 Calibration UX** — measure an arc to set or adjust the map scale (F20).
- **F45 Explicit save** — a save button and an unsaved-changes indicator; nothing goes live until saved (D47).
- **F46 v1 fences** — no undo, no multi-select, no snapping; delete-and-redo is the v1 workflow.

### I. Safeguards

- **F47 Never abort** — the product never blocks a text generation (D30).
- **F48 Orphan policy** — if a map edit deletes the node under the pin: keep the pin, warn, pause injection until re-pinned (D39).
- **F49 Map-less idling** — chats without a map are untouched (D31).
- **F50 Validation & migration** — malformed or future-version data is rejected with precise messages, never half-loaded.
- **F51 Hygiene** — disable/remove leaves no settings, assets, or listeners behind.

### J. Platform

- **F52 Mobile & desktop parity** — every feature above, the editor included, works with touch alone on a phone-sized screen and with a mouse on a desktop: no hover-dependent affordances, tap-and-drag targets of usable size, pinch-zoom/pan/tap canvas gestures, and panels that adapt to narrow viewports instead of overflowing. One responsive UI — there is no separate mobile mode, and no feature is desktop-only (D53).

---

## 4. Explicit non-features (v1)

| Non-feature | Why deferred |
|---|---|
| LLM-driven movement (function tools) | Authority stays with the user (D10); revisit post-MVP |
| Automatic travel parsing | Manual + toast first; learn real usage |
| Position rollback on swipe | Sticky by decision (D12) |
| Fog of war / discovery | Useful later; the snapshot keeps a seam for it (D22) |
| World clock, weather, time-of-day | Times are descriptive only (D18); modifiers later |
| Vehicles with locations, fares | Economy tracking is a different product |
| Editor undo / multi-select / snapping | Tar-pit fencing (F46) |
| Map embedded in character export | Sharing story later (D40) |
| MCP server | Redundant with native function tools for now (D32) |
| i18n | Post-adoption — mobile support is in scope (F52/D53); translations are not |

---

## 5. Traceability

Features cite decision IDs (D10–D53) from EXECUTION-PLAN.md. Tests cite feature IDs (F-numbers). CORE.md defines the engine rules that make every number the product shows trustworthy.
