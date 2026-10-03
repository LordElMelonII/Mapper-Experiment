// M2 gate — adversarial geometry & cost suite (verifier, PKG D-M2).
// Covers the C9 45° boundaries the A-005 suite leaves unpinned (the whole
// southern half, where atan2 goes negative and the `a + 2π` correction branch
// feeds the sector math), the exact-tangent round-half rule, and two C14 row
// boundaries (authoredMinutes null; a mode spec missing `allowed`). Every
// expected value was verified numerically against the normative §3.4 encoding
// (EXECUTION-PLAN §3.4, implemented verbatim in measure.ts).
import { describe, expect, it } from 'vitest';
import { cardinal } from '../../src/core/geometry/measure';
import { edgeCost } from '../../src/core/routing/cost';
import type { MapEdgeData, WorldMapData } from '../../src/core/api';

type Scale = WorldMapData['scale'];

// --- C9: the southern 45° boundaries (C9, C10, §6.2) --------------------------------------
//
// C9: "unit tests pin the 45° boundaries" — all eight of them. The A-005 suite
// pins E/NE (22.5°) and NE/N (67.5°) plus the axes and diagonals; the four
// boundaries below exercise the negative-atan2 branch (`a < 0 ⇒ a + 2π`)
// against the sector table. Straddle values: tan(22.5°) ≈ 2.41421, so dx = 2.414
// sits just past one boundary and 2.415 just before the other.

describe('C9 — the southern 45° sector boundaries (C9, C10)', () => {
  it('pins the W/SW boundary at 202.5° (C9)', () => {
    expect(cardinal(-2.414, 1)).toBe('SW'); // 202.5018° — 0.0018° inside SW
    expect(cardinal(-2.415, 1)).toBe('W');  // 202.4934° — 0.0066° inside W
  });

  it('pins the SW/S boundary at 247.5° (C9)', () => {
    expect(cardinal(-1, 2.414)).toBe('SW'); // 247.4982° — just inside SW
    expect(cardinal(-1, 2.415)).toBe('S');  // 247.5087° — just inside S
  });

  it('pins the S/SE boundary at 292.5° (C9)', () => {
    expect(cardinal(1, 2.414)).toBe('SE'); // 292.5018° — just inside SE
    expect(cardinal(1, 2.415)).toBe('S');  // 292.4934° — just inside S
  });

  it('pins the SE/E boundary at 337.5° (C9)', () => {
    expect(cardinal(2.414, 1)).toBe('SE'); // 337.4982° — just inside SE
    expect(cardinal(2.415, 1)).toBe('E');  // 337.5066° — just inside E
  });

  it('pins the round-half rule at the exact boundary tangents (C9/C10)', () => {
    // Math.round rounds 0.5 up: exactly 22.5° lands in NE, exactly 67.5° in N.
    expect(cardinal(1, -Math.tan(Math.PI / 8))).toBe('NE');
    expect(cardinal(1, -Math.tan((3 * Math.PI) / 8))).toBe('N');
  });
});

// --- C14 row boundaries (C14, FX5) ---------------------------------------------------------

const POSITIONS: Record<string, { x: number; y: number } | undefined> = {
  'n-a': { x: 0, y: 0 },
  'n-b': { x: 3, y: 4 }, // euclid = 5 — the geometric term is 50 at unitPerPx 10
};
const positionOf = (id: string): { x: number; y: number } | undefined => POSITIONS[id];

const scale = (over: Partial<Scale> = {}): Scale => ({
  unitPerPx: 10,
  unitLabel: 'km',
  unitKind: 'distance',
  ...over,
});

const edge = (over: Partial<MapEdgeData> = {}): MapEdgeData => ({
  id: 'e-x',
  source: 'n-a',
  target: 'n-b',
  modes: { walk: { allowed: true } },
  ...over,
});

describe('C14 row 3 entry condition — authoredMinutes null is NOT authored time (C14, FX5)', () => {
  it('authoredMinutes: null prices through rows 4–5, not row 3 (C14)', () => {
    // Row 3 on a null would return 0 (verbatim null) and sever every route;
    // the `!= null` semantics treat it as absent ⇒ geometric 50 units ⇒ 600 min.
    const e = edge({ modes: { walk: { allowed: true, authoredMinutes: null as unknown as number } } });
    expect(edgeCost(e, 'walk', scale({ speed: { walk: 5 } }), positionOf)).toBe(600);
  });
});

describe('C14 row 2 fail-closed boundary — a mode spec without `allowed` (C14, F50)', () => {
  it('modes.walk = {} (allowed undefined) ⇒ Infinity, never a geometric price (C14 row 2)', () => {
    // api.ts types `allowed` as required; a runtime caller (or hand-edited
    // persisted data) can omit it — row 2 must fail closed, not fall through
    // to rows 3–6.
    const e = edge({ modes: { walk: {} } as MapEdgeData['modes'] });
    expect(edgeCost(e, 'walk', scale(), positionOf)).toBe(Infinity);
  });
});
