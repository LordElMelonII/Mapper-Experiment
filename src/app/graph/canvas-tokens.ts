// PKG B-140 (R0, docs/ui-restyle/REPAIRS.md) — the canvas plane's single
// source for every color in the cytoscape stylesheet (D7 plain data).
// graph.service.ts builds GRAPH_STYLESHEET from this map — cytoscape
// stylesheets are JS strings, so the values land verbatim in the same
// declarations and positions the pre-B-140 literals occupied: the cascade
// has NO CSS specificity (last match per property wins, the B-111/AGENTS.md
// gotcha), so declaration order is preserved by construction and
// `min-zoomed-font-size` semantics stay untouched.
//
// Plain data, no imports (D7). Keys are the DOM plane's --tme-* token names
// (src/app/styles/_tokens.scss) for the values the planes share, so the
// drift pin — tests/unit/app/tokens-sync.spec.ts — can assert every shared
// name carries the same value on both sides; canvas-only values carry the
// --tme-canvas-* prefix. One entry per canvas-plane color, values
// byte-identical to the literals consumed before this file existed.

/** The canvas-plane color map — exactly the palette GRAPH_STYLESHEET renders. */
export const CANVAS_TOKENS = {
  '--tme-canvas-node-bg': '#56637a',
  '--tme-hairline': '#aebdd3',
  '--tme-text': '#e6ebf2',
  '--tme-text-secondary': '#c7d0dd',
  '--tme-node-location': '#4f81b5',
  '--tme-node-hub': '#b0813f',
  '--tme-node-waypoint': '#8064b8',
  '--tme-accent-gold': '#ffd166',
  '--tme-canvas-badge-border': '#1d232b',
  '--tme-accent-teal': '#4db6ac',
  '--tme-canvas-text-muted': '#8fa0b5',
  '--tme-accent-pass': '#8fd3b6',
  '--tme-accent-warn-strong': '#c9564e',
  '--tme-canvas-draft-paper': '#f4f1e8',
} as const;

/**
 * B-140: a literal key that is not a CANVAS_TOKENS entry is a compile error
 * (`keyof` from the `as const` map), so the stylesheet builder's bracket
 * lookups — required anyway by `noPropertyAccessFromIndexSignature` — leave
 * no silent string fallthrough when a token is renamed.
 */
