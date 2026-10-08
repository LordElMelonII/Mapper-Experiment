// src/app/graph/mode-word.ts — PKG B-146 (R6 item 8): the ONE app-layer
// mode-word display formatter.
//
// The R6 LEAD RULING (it corrects the item's letter): the core's
// `RouteLeg.modeLabel` is "the RESOLVED authored word … the UI never maps
// ids to words itself" (src/core/api.ts), and map-driven custom modes carry
// USER-AUTHORED casing — a blanket `toLowerCase()` formatter would RE-WORD
// authored strings, and the C23 verbatim law outranks the letter. The
// formatter is therefore IDENTITY on the resolver's word: the built-ins
// render plain lowercase ('walk' — matching the legs' plain-word voice),
// authored words render byte-for-byte ('Horseback', 'On Foot', 'Carriage').
//
// Why one seam at all: the chips used to CSS-capitalize (`Walk`) while the
// legs said `walk` — the R6 split. Every mode-word render site now goes
// through this formatter (route-panel chips + legs, the arc panel's chips
// and per-mode rows) and the chips' `text-transform: capitalize` is
// RETIRED, so chips and legs agree with zero transformation — and any
// future casing policy has exactly one home (unit-pinned in
// tests/unit/app/mode-word.spec.ts; the rendered verbatim contract is
// pinned by the e2e chip-verbatim cell in mode-surfaces.e2e-spec.ts).
export function modeWord(word: string): string {
  return word;
}
