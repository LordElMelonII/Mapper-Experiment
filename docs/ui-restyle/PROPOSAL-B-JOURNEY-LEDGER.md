# PROPOSAL B — "The Journey Ledger"

**Restyle direction for Travel & Map Explorer · wayfinding grammar (the transit diagram).**
Companion to `docs/ui-restyle/REPAIRS.md` (which this direction includes wholesale: R-0 … R-9). Provenance: impeccable critique 2026-10-07 (26/40). The product's unique mechanism is *priced travel* — modes, costs, hubs, blocks. The most honest priced-travel graphic language people already read by heart is the transit line diagram; this direction borrows its grammar for the map and the panels.

**Mode:** Operate. **Color strategy:** Full palette (3–4 named roles) — the boldest of the three directions; the identity is carried by line COLOR, not by type or texture.

---

## 1. Thesis

The map is a night line network; the panels are journey-planner artifacts. Arcs read as lines, hubs read as interchanges, the route sheet reads as a journey card with per-leg pips and a gold fare total. What the category always ships (dark admin) and its predictable opposite (fantasy map costume) are both refused — this is neither; it is the data-graphics tradition of Beck's diagram, applied to a world where the modes are walk, car, and train (or horse and airship, per D78 registries).

## 2. Token system (consumes R-0's `--tme-*` layer; these are B's values)

### 2.1 Color

| Role | Value | Notes |
|---|---|---|
| Ground | `#15171c` | canvas + page |
| Surface (panels/sheets) | `#1b1e24` | flat, no shadow |
| Hairline | `#2c313a` | 1px |
| Text primary | `#dfe3ea` | cool bone |
| Text secondary | `#9aa2af` | ≥4.5:1 on surface |
| Text muted/placeholder | `#848d9c` | ≥4.5:1 on surface (fixes the 3.9:1 finding) |
| **Walk** | `#d9a441` | amber |
| **Car** | `#4db6ac` | teal (inherits the pick accent — teal now means BOTH car and picks; acceptable: picks are chrome-state, car is data, never adjacent) |
| **Train** | `#9a7fd4` | violet |
| **Gold** (reserved) | `#ffd166` | the pin + the route total ONLY — the single warm constant |
| Blocked/destructive | `#e08a84` | unchanged; **state trumps mode** on canvas (a blocked arc is red-dashed even if mode-colored) |
| Warn | `#ffba00` | border/text only, glow deleted |
| Node taxonomy | unchanged | kinds keep their fills; MODES live in the lines, KINDS in the dots — the two axes never share a channel |

**Custom modes (D78 registries) get generated hues — deterministic, display-layer only:** `hue = hash(modeId) mod 360`, rejected and re-hashed if within 25° of a reserved hue (gold ≈42°, red ≈5°, walk 38°, car 172°, train 258°), fixed S 55–62% / L 60–66%. Pure function of the id: stable across sessions, no storage. **This needs a register row** (the only new logic any direction adds) — it is app-layer presentation (R1 intact: no numbers displayed are computed here; hues are not data).

### 2.2 Type

- One voice: `system-ui` throughout. This direction's identity is the line network; type stays workhorse (correct for Operate, zero bytes).
- Costs and the total set in `font-variant-numeric: tabular-nums` (degrades silently where unsupported).
- Scale repair (≥1.25 adjacent steps, fixes the detector finding): 12 / 13 / 16 / 20; panel headers 16px/600 with a 2px mode-neutral ink underline; the journey card's total is the only 20px on any sheet.
- Casing: unified lowercase everywhere through R-6's single formatter ("walk", "car", "train") — in this direction the HUE is the capital letter; doubling it with CSS caps would be the old noise.

### 2.3 Form language

- Radius 4px on surfaces, pills for mode chips (existing).
- No shadows (R-6); plates flat with hairlines.
- **Lines are the decoration:** the only graphic element any panel may carry is a mode-colored rule — 3px round-capped, like a line legend swatch. No gradients, no ticks, no texture.
- Motion: ONE moment — the journey card's legs cascade in on route answer (~60ms stagger, 150ms total; `prefers-reduced-motion` renders all legs at once). The canvas never animates.

## 3. Component treatments (per surface)

- **Canvas (cytoscape):**
  - Arcs: 3px base stroke `#3a4150` (neutral ink line). An arc admitting EXACTLY ONE mode takes that mode's hue at 3px. Multi-mode arcs stay neutral (the line belongs to no single line-diagram). Authored arcs keep today's authored marker (NOT a dash — dash is blocked's channel). Blocked arcs: red dashed, trumping any hue (order preserved per the no-specificity cascade; the blocked rule stays LAST).
  - Hubs: interchange rings — existing fill + 2px `#dfe3ea` border + `overlay-padding: 3` / `overlay-opacity: 0.25` ink halo. Purely stylesheet-side (order-safe, no geometry change; B-115's touch-slop noted: the halo is visual, hit radius unchanged).
  - Node kinds: fills/borders unchanged; labels stay sans 12–13px.
  - Gotchas as in A: declaration order load-bearing; no `min-zoomed-font-size` on labels; badges cull with content.
- **Mode selector (route panel):** segmented control, one segment per mode, each rendered as a line-legend swatch (3px hue rule) + lowercase word; active = hue underline + ink text. The selector doubles as the network's line legend.
- **Route panel → journey card:** header "from → to" with the pin gold-ticked; legs as pip (mode hue dot) + place name + cost chip; interchange rows (cross-layer/hub transfers) as a hollow ring pip; total = gold fare plate (the only gold on the sheet). Blocked legs render the reason in red beneath the leg row (existing words, C23).
- **Rail:** tools unchanged in structure; active tool = ink border (NOT gold — gold stays reserved); the zoom cluster gets a hairline group box like a diagram's scale bar.
- **Layers / Maps / Property / Arc panels:** neutral surfaces; the only hue they may show is mode swatches where modes are listed (arc panel's mode rows each get their line swatch — the arc editor becomes a line-register table).
- **Phone sheets:** same card grammar; journey card keeps the 70% cap; fare plate pinned above the drag header.
- **First viewport (mapless):** a faint night network — three CSS-drawn crossing lines (walk amber / car teal / train violet at ~15% opacity, round caps, zero bytes) and one line: *"No routes yet. Place your first two places."* R-4 copy rules hold.
- **Loaded first viewport (FX1):** same layout; arcs re-hued per the single-mode rule; the pin and the fare total become the only warm pixels on the canvas.

## 4. What this fixes (mapped to findings)

| Finding | Fix |
|---|---|
| Match-with-real-world 2/4, casing split | hue-as-label + one lowercase formatter (§2.2); "Walk/walk" split becomes structural |
| Recognition 2/4 | the mode selector IS a line legend; hub rings mark interchanges (§3) |
| flat-type-hierarchy (detector) | §2.2 scale |
| dark-glow / wide-shadow / contrast | §2.3 + R-6 tokens |
| mapless void | the night-network first viewport (§3) |
| "everything is gold" | gold reserved to pin + fare (§2.1) |
| P0s, P1s, ergonomics | inherited from REPAIRS.md wholesale |

## 5. Risks & mitigations

- **Anachronism:** a metro diagram on a pre-industrial fantasy map can jar. Mitigation: the grammar is abstract (colored lines between dots), not literal (no station roundels, no line numbers); with D78 registries a world declares its own modes and the palette follows the world, not the category. If the owner's worlds are consistently pre-modern, this risk is decisive — pick A or C.
- **Hue collision with reserved channels:** the 25° rejection band + the state-trumps-mode rule keep blocked-red and pin-gold unambiguous; the generation function ships with a unit test over the rejection rule.
- **Register burden:** the hue generator is the only new convention here — one D-row, one pure function, one test. If the owner wants zero new logic, that argues for A or C.
- **Custom-mode palette drift:** generated hues are display-only; exported map data carries no color (R4 — no shadow truth). A world's palette is not its data.

## 6. Effort & packets (on the merged repairs base — R-0…R-9 ship on `develop` first)

| Packet | Content |
|---|---|
| B-1 | Tokens→surfaces, flat plates, scale/casing formatter (DOM chrome) |
| B-2 | Canvas line grammar: arc hue rule + blocked-trumps + hub rings (`layer-elements.ts`, order-preserving) |
| B-3 | Journey card: route panel rebuild (pips, chips, fare plate, leg cascade motion) |
| B-4 | Mode-hue generator (pure fn + rejection test) + arc-panel line-register swatches |
| B-5 | First viewport (night network) + empty-state copy pass |

Each packet: `npm run verify` + both e2e projects as separate commands; B-2 re-baselines canvas-visual e2e deliberately. Zero byte-cost to the D8 budget.
