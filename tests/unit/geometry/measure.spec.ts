// Unit tests for the measurement primitives (PKG A-005) — C9 orientation
// pinned at the 45° sector boundaries, C10 eight-way cardinality, the
// zero-vector degenerate (§6.2 "zero-distance nodes"), and euclid's contract
// (the C12 geometric default). The encoding under test is EXECUTION-PLAN
// §3.4, implemented verbatim in src/core/geometry/measure.ts.
import { describe, expect, it } from 'vitest';
import { cardinal, euclid } from '../../../src/core/geometry/measure';

// --- cardinal (C9/C10, §3.4) -----------------------------------------------------
//
// Sector layout after the C9 y-flip, measured CCW from East:
//   E: [-22.5°, +22.5°) · NE: [+22.5°, +67.5°) · N: [+67.5°, +112.5°) · …
// Boundary tangents: tan(22.5°) = 1/tan(67.5°) ≈ 0.41421356 and
// tan(67.5°) ≈ 2.41421356 (per unit dx at dy = 1, and vice versa).

describe('cardinal — C9 orientation at the 45° sector boundaries (C9, C10)', () => {
  it('pins the four axes — Δy < 0 ⇒ North (C9)', () => {
    expect(cardinal(1, 0)).toBe('E');
    expect(cardinal(0, -1)).toBe('N');
    expect(cardinal(-1, 0)).toBe('W');
    expect(cardinal(0, 1)).toBe('S');
  });

  it('pins the exact diagonals (C10)', () => {
    expect(cardinal(1, -1)).toBe('NE');
    expect(cardinal(-1, -1)).toBe('NW');
    expect(cardinal(-1, 1)).toBe('SW');
    expect(cardinal(1, 1)).toBe('SE');
  });

  it('pins vectors adjacent to the 22.5°/67.5° boundaries (C9)', () => {
    // (1, -2.414): 67.4982° — 0.0018° inside NE at the NE/N boundary ⇒ NE.
    // (The exact tangent dy = tan(67.5°) ≈ 2.41421356 would round half-up
    // through the sector line to 'N'.)
    expect(cardinal(1, -2.414)).toBe('NE');
    // (2.414, -1): 22.5018° — 0.0018° inside NE at the E/NE boundary ⇒ NE.
    // Packet note (DEVIATION PROPOSED): the packet's table expected 'E' here,
    // but the normative §3.4 encoding yields NE — the boundary tangent is
    // dx = 1/tan(22.5°) ≈ 2.41421356, and 2.414 sits just ABOVE 22.5°, on the
    // NE side. Verified numerically against the verbatim encoding.
    expect(cardinal(2.414, -1)).toBe('NE');
    // 2.415 > 2.41421356 ⇒ 22.4934°, 0.0066° inside E at the E/NE boundary —
    // pins the E side of the boundary (the packet case's evident intent).
    expect(cardinal(2.415, -1)).toBe('E');
  });

  it('pins the zero vector — zero-distance nodes (§6.2, C10 degenerate)', () => {
    // atan2(0, 0) = 0 ⇒ 'E'. Degenerate but deterministic: the encoding's
    // documented answer for co-located nodes (§6.2 "zero-distance nodes").
    expect(cardinal(0, 0)).toBe('E');
  });
});

// --- euclid (C12) ------------------------------------------------------------------

describe('euclid — straight-line separation (C12)', () => {
  it('computes the 3-4-5 triangle exactly', () => {
    expect(euclid({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('is symmetric', () => {
    expect(euclid({ x: 1.5, y: -2.5 }, { x: 7, y: 11 }))
      .toBe(euclid({ x: 7, y: 11 }, { x: 1.5, y: -2.5 }));
  });

  it('is zero for identical points (§6.2 zero-distance nodes)', () => {
    expect(euclid({ x: 42, y: -7 }, { x: 42, y: -7 })).toBe(0);
  });
});
