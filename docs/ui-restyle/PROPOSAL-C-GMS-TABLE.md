# PROPOSAL C — "GM's Table"

**Restyle direction for Travel & Map Explorer · the physical session desk.**
Companion to `docs/ui-restyle/REPAIRS.md` (which this direction includes wholesale: R-0 … R-9). Provenance: impeccable critique 2026-10-07 (26/40). The most emotionally specific of the three directions: the tool becomes the GM's table at night — felt ground, index cards, a brass pin.

**Mode:** Operate. **Color strategy:** Restrained (one warm accent on a deep, desaturated ground) — but the *materials* do the identifying, not a palette ramp.

---

## 1. Thesis

Roleplayers already own this surface: the table the map, notes, and cards physically sit on while the story runs. The UI borrows the desk's materials — a deep felt ground, index-card panels, a brass pushpin for the party — and keeps every control quiet so the warmth reads as material, not costume. The category's dark admin panel is refused; so is the parchment-and-wax-seal fantasy forgery: this is a LIVED-WITH surface (slightly worn, slightly warm), not a heraldic one.

## 2. Token system (consumes R-0's `--tme-*` layer; these are C's values)

### 2.1 Color

| Role | Value | Notes |
|---|---|---|
| Ground (felt) | `#1a211b` | deep desaturated green; a CSS radial vignette darkens edges ~6% (pure gradient, zero bytes) |
| Card (panels/floaters/sheets) | `#20261f` | slightly warm card stock; flat |
| Card edge | `#3a4032` | 1px hairline |
| Strap accent (card top bar) | `#8a6d3f` | 3px solid bar across each card's top edge — the deck's one recurring accent |
| Text primary | `#e8e3d5` | warm bone |
| Text secondary | `#a8a294` | ≥4.5:1 on card |
| Text muted/placeholder | `#8b8676` | ≥4.5:1 on card (fixes the 3.9:1 finding) |
| **Brass/gold** (narrowed) | `#ffd166` | the pin, the primary commit, the route total — same three-meaning contract as A |
| Teal (picks/forks) | `#4db6ac` | unchanged |
| Red (blocked/destructive) | `#d97b72` | a shade warmer than today's; blocked canvas arcs keep `#e08a84` for taxonomy stability |
| Warn | `#ffba00` | border/text only; glow deleted |
| Node taxonomy | unchanged | location `#4f81b5` · hub `#b0813f` · waypoint `#8064b8` · dashed districts |

### 2.2 Type

- **UI sans:** `system-ui` — controls, legs, costs, all body copy.
- **The hand — Patrick Hand (one weight, one subset):** node labels and the map title are set in a legible handwriting print face — the GM's own labeling on the map. Why this face and no other: it is designed specifically as a *legible* handwriting face (print forms, open counters) and survives small sizes, where script/hand faces generally collapse; the requirement (handwriting character AT 12–13px label sizes) is met by no workhorse face and by none of the common-default list. Fallback `system-ui` (a failed subset degrades to sans — labels briefly plain, nothing breaks; C32 spirit).
- Delivery: bundled woff2 latin-core subset, one weight (~18–22KB gz); register row records the delta against D8; no hosted stylesheets.
- **The rule that keeps it from tipping into kitsch: the hand appears ONLY on the map's own words** — node labels and map title. Every panel, button, header, and cost stays sans. (Inside panels, place names may take the hand at 15px in the route sheet only.)
- Scale repair (≥1.25 steps): 12 / 13 / 16 / 20; card headers 16px/600 sans with the strap bar doing the plate-header work.

### 2.3 Form language

- Radius: cards 4px; controls 4px; chips stay pills.
- Cards carry the 3px strap bar top-edge (the recurring identity mark) + 1px hairline; **no shadows** (R-6). Elevation: the dragged card state lifts via a 2px edge, like a picked-up card.
- Motion: ONE moment — setting the pin drops the brass pin: scale 1.4 → 1 with a settle (~120ms; `prefers-reduced-motion` renders it in place). Nothing else animates.
- The desk idiom: panels may sit slightly rotated? **No** — rotation fails the Operate bar (scanability) and reads as theme-park. Cards are square to the desk; the felt does the warmth.

## 3. Component treatments (per surface)

- **Canvas (cytoscape):** node fills/borders unchanged; labels re-set in the hand via `src/app/graph/layer-elements.ts` (font-family the bundled face). Gotchas bind exactly as in A: declaration order preserved (no-specificity cascade), no `min-zoomed-font-size` on labels, badges cull with content. Blocked arcs stay today's red-dashed.
- **Panels → index cards:** every floater/sheet gets card stock, strap bar, hairline. Shared floater chrome per R-9 (drag + collapse everywhere). Property panel = R-5's name-first card; its danger footer band carries a red hairline — the wax-red edge, used once per card, at the destructive corner.
- **Route panel:** a card with the origin/destination in the hand at 15px, legs sans, total = brass plate (gold fill, ground-ink text) pinned above the drag header on phone. The desk's payoff moment.
- **Rail:** a strip of card chips; active tool = ink border; Dim slider themed per R-6; the legend (R-7) is a card section — swatch + kind word, kind words in the hand at 14px (the key to the hand-labeled map).
- **Maps panel:** the box of map cards — rows become card entries with the map name in the hand at 15px (names are the GM's handwriting on their boxes); actions stay sans buttons per R-9's row discipline.
- **Phone sheets:** same cards; 70% cap; the pin-drop moment plays on set-location from the long-press menu (R-3).
- **First viewport (mapless):** the bare felt — the vignette, one faint chalk ring (a 1px CSS circle at ~4% bone opacity, centered where the map will sit) and one line in the hand at 17px: *"Clear the table. Name your world."* with Create/Paste beneath. R-4 copy rules hold.
- **Loaded first viewport (FX1):** same layout; labels in the hand; cards re-skinned; brass pin and brass total the only gold.

## 4. What this fixes (mapped to findings)

| Finding | Fix |
|---|---|
| mapless void (the strongest beat-1 valley) | the felt + chalk-ring first viewport; warmth no admin tool has (§3) |
| recognition 2/4 | legend card keyed to the hand-labeled map (§3) |
| flat-type-hierarchy (detector) | §2.2 scale; the hand gives labels a voice without breaking the scale |
| dark-glow / wide-shadow / contrast | §2.3 + R-6 tokens |
| "everything is gold" | brass narrowed to pin/commit/total (§2.1) |
| P0s, P1s, ergonomics | inherited from REPAIRS.md wholesale |

## 5. Risks & mitigations

- **Closest to costume of the three:** the discipline rules are structural, not advisory — the hand NEVER leaves the map's own words; cards are never rotated; the felt is desaturated (a saturated green felt would tip it). Break any of the three and this direction fails its own thesis; the finish review checks them.
- **Host clash:** the green ground is the least neutral next to varied SillyTavern themes (a red-tinted host theme will fight the felt). Mitigation: cards are self-contained warm-neutral; only the canvas ground takes the tint. If the owner runs strong host themes, this argues for A (nearest-neutral ground).
- **Hand legibility at the label floor:** Patrick Hand survives 12px, but the R-2 boot-zoom floor is computed from label legibility — if the hand's floor lands lower than sans's, the boot zoom clamps to the HAND's floor (labels win over extent, as in A).
- **Bytes:** +18–22KB gz against D8 (one subset). Register row; build gate enforces.

## 6. Effort & packets (on the merged repairs base — R-0…R-9 ship on `develop` first)

| Packet | Content |
|---|---|
| C-1 | Tokens→cards: felt ground + vignette, card stock, strap bars, hairlines (DOM chrome) |
| C-2 | The hand: subset wiring (@font-face, bundle) + DOM place-name usages (route sheet, Maps rows, map title) |
| C-3 | Canvas labels in the hand (`layer-elements.ts`, order-preserving) + label-floor recheck with R-2 |
| C-4 | First viewport (chalk ring, copy) + legend card + empty-state copy pass |
| C-5 | Pin-drop motion (reduced-motion arm) |

Each packet: `npm run verify` + both e2e projects as separate commands; C-3 re-baselines label-visible e2e deliberately.
