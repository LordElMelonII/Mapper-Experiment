# PROPOSAL A — "Atlas Plate"

**Restyle direction for Travel & Map Explorer · engraved sourcebook cartography.**
Companion to `docs/ui-restyle/REPAIRS.md` (which this direction includes wholesale: R-0 … R-9). Provenance: impeccable critique 2026-10-07 (26/40) — the verdict was "the engine's honesty is designed; the world is not." This direction gives the tool its world by adopting the one graphic tradition its audience already reads fluently: the printed atlas plate / RPG sourcebook map.

**Mode:** Operate (scanability, consistency, real usage outrank expression). **Color strategy:** Restrained — neutrals tinted from the world plus one accent.
**Recommendation rationale:** the only direction that converts existing verified strengths (the semantic color contract, the cartographic node taxonomy, the gold route total) into a visible identity rather than replacing them. Lowest host-clash risk; one small bundled font subset is its only byte cost.

---

## 1. Thesis

The tool IS an atlas the GM keeps. The UI borrows the grammar of the printed map plate — margin hairlines, registration ticks, a legend block, a cartouche — instead of floating admin chrome. What the category always ships (dark admin panel) and its predictable opposite (parchment fantasy costume) are both refused: the plate lives on the SAME dark ink ground the host already uses, but every surface behaves like printed matter — flat, ruled, typographically coded, no glows, no shadows.

## 2. Token system (consumes R-0's `--tme-*` layer; these are A's values)

### 2.1 Color (named roles)

| Role | Value | Notes |
|---|---|---|
| Ground (canvas/page) | `#12161d` | one step from today's `#14171c`; host harmony preserved |
| Plate (panels/floaters/sheets) | `#181d26` | flat; no shadow, ever |
| Plate raised (dragged/floating) | `#1b2029` + 2px edge | elevation = edge weight, not blur |
| Hairline (plate edges) | `#2a3242` | 1px |
| Hairline inner (dividers) | `#232a37` | 1px |
| Ink (primary text) | `#e9e4d8` | warm bone — the "ink on paper" signal |
| Ink-2 (secondary) | `#a9a695` | ≥4.5:1 on plate (R-6 rule) |
| Ink-3 (muted/placeholder) | `#8a877a` | ≥4.5:1 on plate — fixes the 3.9:1 finding |
| **Gold** (narrowed) | `#ffd166` | EXACTLY three meanings: the pin, the primary commit, the route total |
| Active toggle / selection | ink `#e9e4d8` | bone-on-ink state (2px ink underline or ink border) — NOT gold |
| Teal (picks/forks) | `#4db6ac` | unchanged (verified contract) |
| Red (blocked/destructive) | `#e08a84` | unchanged |
| Warn (calibrate/impact) | `#ffba00` | border/text only — the glow is deleted (R-6) |
| Node taxonomy | unchanged | location `#4f81b5` · hub `#b0813f` · waypoint `#8064b8` · dashed districts — already good cartography |

The gold narrowing answers the critique's question 2 ("when everything important is gold, what is gold?"): after this round, gold points at exactly the three things the story is about — where the party IS, what they COMMIT, what the journey COSTS.

### 2.2 Type

Two voices, per the printed-plate idiom — **serif for the map's own words, sans for the controls:**

- **UI sans (controls, body, buttons):** `system-ui` stack — unchanged family; Operate-correct, zero bytes.
- **Cartographic serif — Spectral (roman + italic) + Spectral SC (true small caps):** the map's typographic code. Why this face and no other: Spectral is one of the few serifs designed specifically for screen legibility at 12–16px (node labels live at 12–14px; most display serifs do not survive there), and its SC companion family delivers TRUE small caps without synthetic `font-variant` distortion. It is not on the common-default list, and the requirement (small-size screen serif + true-SC sibling) is satisfied by no workhorse alternative.
- **The typographic code** (this replaces the missing legend — heuristic 6 fixed structurally):
  - location labels: Spectral regular, 13px, upright, bone-white
  - waypoint labels: Spectral italic, 13px (the hand-placed voice)
  - district labels: Spectral SC, 12px, +0.04em (the container voice, matching the dashed boxes)
  - hub labels: Spectral SC, 12.5px, +0.08em, uppercase-shape via SC (the station voice)
  - map title / breadcrumb pin name: Spectral 17px (title), Spectral italic 14px (pin name)
  - route sheet: place names Spectral 15px; legs/costs stay sans; the total becomes the **cartouche**: gold fill, ground-ink text, Spectral SemiBold 18px
  - panel headers: Spectral SC 14px +0.06em — every plate reads as a printed plate header
- **Scale repair** (fixes `flat-type-hierarchy`, largest adjacent step 1.14 → ≥1.25): control sizes 12 / 13 / 16 / 20 with the serif headers set between — hierarchy returns because two families now carry two jobs.
- **Delivery:** bundled woff2 subsets (latin core, one weight each: Spectral 400, Spectral Italic 400, Spectral SC 400; SemiBold only if the cartouche demands it), served from the bundle — no hosted stylesheets (the build's first-viewport discipline refuses external font hosts anyway). Estimated 30–50KB gz total; the D8 1.5MB budget absorbs it; the register row records the delta. Fallback stack `Georgia, 'Times New Roman', serif` — a failed subset degrades, never throws (C32 spirit).

### 2.3 Form language

- Radius: plates 2px (printed matter, near-square); controls 4px; existing chips keep their pill radius.
- **No shadows anywhere** (R-6 kills the wide-blur finding; plates are flat). Elevation = hairline weight (1px resting → 2px raised).
- **Registration ticks:** floaters carry 6px corner ticks (1px hairline pseudo-elements) — the plate idiom that makes panels feel printed, not floating.
- Motion: ONE moment — asking for a route draws the path and counts the total up in place (~150ms, `prefers-reduced-motion: reduce` disables both). Everything else is still.

## 3. Component treatments (per surface)

- **Canvas (cytoscape):** node fills/borders unchanged (taxonomy untouched); labels switch to the typographic code above via the stylesheet in `src/app/graph/layer-elements.ts`. Gotchas bind: preserve declaration ORDER exactly (no CSS specificity in the cascade — last match wins); never set `min-zoomed-font-size` on these labels (it is a hide-floor, B-107); badges keep culling with content (B-115).
- **Header/breadcrumb:** pin name in Spectral italic ink, active layer name in gold (the ONE gold wayfinding use, kept), unit in Ink-2 small caps. R-4's collapse rule applies — no ghost separators.
- **Rail:** plates in a column; active tool = ink border + ink text (not gold). Dim slider themed by R-6. Legend (R-7) lives here as a collapsible plate section — swatch + kind word set in Spectral SC, i.e. the legend IS the type system's key.
- **Route panel:** the plate's **legend block**. Header Spectral SC; origin/destination in Spectral italic; legs sans with hairline separators; total cartouche gold. This is the product's signature composition, finally dressed for it.
- **Property panel:** R-5's name-first form on a plate; section toggles as printed index rules; danger footer band with red hairline.
- **Layer manager / Maps panel:** plate tables — rows as ruled entries, not button walls (R-9's expander applies); the Maps panel reads as the atlas's index page.
- **Floaters:** one shared chrome (R-9): drag + collapse everywhere, ticks, no per-panel divergence.
- **Phone sheets:** identical token set; sheets cap at 70% per contract; the route sheet keeps bottom-sheet semantics with the cartouche pinned above the drag header — the one-thumbed payoff.
- **First viewport (mapless):** the empty plate — faint CSS graticule (repeating 1px lines every 80px at ~3% bone opacity; zero bytes), one compass tick (inline SVG < 64px), and one line of Spectral italic: *"Your world begins here. Name it, or paste your old distance table."* with the Create and Paste actions beneath. The R-4 copy rules hold.
- **Loaded first viewport (FX1):** today's layout is kept — labels re-set in the typographic code, plates re-skinned, route cartouche bottom-right. No IA change beyond REPAIRS.md.

## 4. What this fixes (mapped to findings)

| Finding | Fix |
|---|---|
| flat-type-hierarchy (detector) | two-family system, ≥1.25 scale steps (§2.2) |
| no-legend / recognition 2/4 | typographic code + legend-as-key (§2.2, §3) |
| gpt-thin-border-wide-shadow, dark-glow | flat plates, glow deleted (§2.3, R-6) |
| low-contrast placeholder | Ink-3 ≥4.5:1 (§2.1) |
| mapless void (beat-1 valley) | the empty-plate first viewport with authored copy (§3) |
| "everything is gold" | gold narrowed to pin/commit/total (§2.1) |
| P0s, P1s, ergonomics | inherited from REPAIRS.md wholesale |

## 5. Risks & mitigations

- **Austerity:** hairline restraint can read cold. Mitigation: the bone-warm ink family and the three-meaning gold keep one degree of warmth in every plate; the cartouche is deliberately rich.
- **Serif at 12px:** Spectral was chosen for exactly this regime, but labels must be eyeballed at the phone label floor; if the subset fails legibility at the R-2 boot zoom, drop label size no lower — raise the boot-zoom floor instead (labels win over extent).
- **Bytes:** +30–50KB gz against D8. Mitigation: subsets, one weight each; build gate enforces the budget mechanically.
- **Host-theme variance:** dark ground one step from today's; plates are self-contained — the design assumes a dark host (SillyTavern default) and degrades gracefully on light hosts (plates stay dark, like a printed plate on a desk).

## 6. Effort & packets (on the merged repairs base — R-0…R-9 ship on `develop` first)

| Packet | Content |
|---|---|
| A-1 | Plate chrome: tokens→plates, ticks, radius/shadow swap, rail + floater re-skin (DOM) |
| A-2 | Typographic code (DOM): headers, breadcrumb, route legend-block + cartouche, Maps/layer tables |
| A-3 | Canvas labels: `layer-elements.ts` stylesheet re-set in Spectral (order-preserving; gotcha-compliant) + font subset wiring (@font-face, bundle) |
| A-4 | First viewport (graticule, compass, copy) + legend component + empty-state copy pass |
| A-5 | Motion: route draw + total count-up, reduced-motion arm |

Each packet: `npm run verify` + both e2e projects as separate commands; A-3 re-baselines any label-visible e2e deliberately.
