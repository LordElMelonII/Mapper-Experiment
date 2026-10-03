// src/core/geometry/measure.ts — the measurement primitives (PKG A-005).
//
// C9: orientation is encoded in EXACTLY one function — `cardinal` below, the
// EXECUTION-PLAN §3.4 encoding verbatim (origin top-left, x grows East, y
// grows South; Δy < 0 ⇒ North). Unit tests pin the 45° sector boundaries.
// C10: eight-way cardinality from Δx/Δy; cross-layer arcs have no geographic
// direction and are reported without one by their callers, never here.
// C12: `euclid` is the straight-line ("air travel") separation that authored
// distance overrides — the geometric default behind C14 row 5.
//
// R5: imports nothing. Deterministic, host-free, DOM-free.

/** Compass rose, CCW from East with y flipped so North is +90° (C9, §3.4). */
const COMPASS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];

/**
 * Eight-way cardinal direction for a Δx/Δy pair (C9/C10).
 * The §3.4 encoding, verbatim. Degenerate input (Δx = Δy = 0, i.e.
 * zero-distance nodes, §6.2) returns 'E' — the encoding's deterministic
 * answer, pinned by tests as documented behavior.
 */
export function cardinal(dx: number, dy: number): string {
  const a = Math.atan2(-dy, dx);       // flip y: north becomes +90°
  const i = Math.round((a < 0 ? a + 2 * Math.PI : a) / (Math.PI / 4)) % 8;
  return COMPASS[i];
}

/** Straight-line separation between two positions — the C12/C14-row-5 default. */
export function euclid(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
