// Unit tests for edgeCost (PKG A-005) — the C14 precedence matrix (FX5):
// one describe block per row, plus the cross-row rulings and the §6.2
// degenerate-geometry rule. Every case asserts the exact number or Infinity.
// C17: Infinity is an internal sentinel here; converting it to ok:false +
// a human reason is A-006's routing-seam business, never this function's.
import { describe, expect, it } from 'vitest';
import { edgeCost } from '../../../src/core/routing/cost';
import type { MapEdgeData, WorldMapData } from '../../../src/core/api';

type Scale = WorldMapData['scale'];

// Geometry chosen so the geometric term is exactly 5 px × 10 unit/px = 50
// canonical units — never equal to the authored values used below (30, 40),
// so an exact assertion always reveals which C14 row won.
const POSITIONS: Record<string, { x: number; y: number } | undefined> = {
  'n-a': { x: 0, y: 0 },
  'n-b': { x: 3, y: 4 }, // euclid(n-a, n-b) = 5
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

// --- C14 row 1 ---------------------------------------------------------------------

describe('C14 row 1 — blocked ⇒ Infinity (C14/FX5, C2/D20)', () => {
  it('blocked edge ⇒ Infinity even with authored minutes present (C14 row 1; D14 yields to the block)', () => {
    const e = edge({ blocked: { reason: 'bridge out' }, modes: { walk: { allowed: true, authoredMinutes: 40 } } });
    expect(edgeCost(e, 'walk', scale(), positionOf)).toBe(Infinity);
  });

  it('blocked edge ⇒ Infinity even with authored distance and speeds defined (C14 row 1)', () => {
    const e = edge({ blocked: { reason: 'bridge out' }, authoredDistance: 30 });
    expect(edgeCost(e, 'walk', scale({ speed: { walk: 5 } }), positionOf)).toBe(Infinity);
  });
});

// --- C14 row 2 ---------------------------------------------------------------------

describe('C14 row 2 — mode not allowed ⇒ Infinity (C14/FX5)', () => {
  it('mode absent from the arc’s modes ⇒ Infinity (C14 row 2)', () => {
    expect(edgeCost(edge(), 'car', scale(), positionOf)).toBe(Infinity);
  });

  it('allowed: false ⇒ Infinity (C14 row 2)', () => {
    const e = edge({ modes: { walk: { allowed: false } } });
    expect(edgeCost(e, 'walk', scale(), positionOf)).toBe(Infinity);
  });

  it('empty modes record ⇒ Infinity (C14 row 2)', () => {
    const e = edge({ modes: {} });
    expect(edgeCost(e, 'walk', scale(), positionOf)).toBe(Infinity);
  });

  it('row 2 outranks row 3 — a disallowed mode ignores authored minutes (C14 normative order; D14 scopes authored overrides to geometry, not blocks)', () => {
    const e = edge({ modes: { walk: { allowed: false, authoredMinutes: 40 } } });
    expect(edgeCost(e, 'walk', scale(), positionOf)).toBe(Infinity);
  });
});

// --- C14 row 3 ---------------------------------------------------------------------

describe('C14 row 3 — authored time wins verbatim (C14/FX5, D14, §6.2)', () => {
  it('authoredMinutes returned verbatim — no terrain accrual (§6.2), no multiplier, no speed conversion (D14)', () => {
    const e = edge({
      terrain: 'mountain',
      modes: { walk: { allowed: true, authoredMinutes: 40, multiplier: 3 } },
    });
    // Any leak is detectable: terrain accrual ⇒ 40 × 2.5 × 3 = 300;
    // geometric fallback ⇒ 5 × 10 × 2.5 × 3 = 375; speed conversion ⇒ 480.
    expect(edgeCost(e, 'walk', scale({ terrainMultipliers: { mountain: 2.5 }, speed: { walk: 5 } }), positionOf))
      .toBe(40);
  });
});

// --- C14 row 4 ---------------------------------------------------------------------

describe('C14 row 4 — authored distance beats geometry; terrain never applies (C14/FX5, C12/D44)', () => {
  it('authoredDistance / speed × 60 ⇒ minutes; the geometric 50 is never consulted (C14 row 4)', () => {
    const e = edge({ authoredDistance: 30 });
    expect(edgeCost(e, 'walk', scale({ speed: { walk: 5 } }), positionOf)).toBe(360);
  });

  it('mode multiplier applies to the DERIVED minutes (C14 row 4; api.ts ModeSpec.multiplier)', () => {
    const e = edge({ authoredDistance: 30, modes: { walk: { allowed: true, multiplier: 2 } } });
    expect(edgeCost(e, 'walk', scale({ speed: { walk: 5 } }), positionOf)).toBe(720);
  });

  it('terrain NEVER applies to authored distance — the TRUE separation (C12/D44), even mountain × 2.5 (C14 row 4)', () => {
    const e = edge({ authoredDistance: 30, terrain: 'mountain' });
    // Geometric × terrain would be 125 units → 1500 min; authored ⇒ exactly 360.
    expect(edgeCost(e, 'walk', scale({ speed: { walk: 5 }, terrainMultipliers: { mountain: 2.5 } }), positionOf))
      .toBe(360);
  });

  it('no speeds ⇒ authored distance is the canonical-unit cost, untouched (C14 rows 4+6, C15)', () => {
    const e = edge({ authoredDistance: 30, terrain: 'mountain', modes: { walk: { allowed: true, multiplier: 3 } } });
    expect(edgeCost(e, 'walk', scale({ terrainMultipliers: { mountain: 2.5 } }), positionOf)).toBe(30);
  });
});

// --- C14 row 5 ---------------------------------------------------------------------

describe('C14 row 5 — geometric × scale × terrain (C14/FX5)', () => {
  it('no speeds ⇒ canonical units: 5 px × 10 × 1 = 50 (C14 rows 5+6, C15)', () => {
    expect(edgeCost(edge(), 'walk', scale(), positionOf)).toBe(50);
  });

  it('with speeds ⇒ minutes: 50 / 5 × 60 = 600 (C14 row 5, C15)', () => {
    expect(edgeCost(edge(), 'walk', scale({ speed: { walk: 5 } }), positionOf)).toBe(600);
  });

  it('terrain mountain × 2.5 ⇒ 5 × 10 × 2.5 = 125 canonical; 1500 min at speed 5 (C14 row 5)', () => {
    const e = edge({ terrain: 'mountain' });
    expect(edgeCost(e, 'walk', scale({ terrainMultipliers: { mountain: 2.5 } }), positionOf)).toBe(125);
    expect(edgeCost(e, 'walk', scale({ terrainMultipliers: { mountain: 2.5 }, speed: { walk: 5 } }), positionOf))
      .toBe(1500);
  });

  it('terrain absent from the map ⇒ multiplier 1 — no edge terrain (plain default) and unmapped kinds alike (C14 row 5)', () => {
    const m = scale({ terrainMultipliers: { mountain: 2.5 } });
    expect(edgeCost(edge(), 'walk', m, positionOf)).toBe(50);                      // plain not in the map
    expect(edgeCost(edge({ terrain: 'road' }), 'walk', m, positionOf)).toBe(50);   // road not in the map ⇒ ?? 1
  });

  it("the no-terrain default is the 'plain' KEY — a mapped plain multiplier applies (C14 row 5 formula)", () => {
    // Pins the ruling's `edge.terrain ?? 'plain'` default, not a bare ×1.
    expect(edgeCost(edge(), 'walk', scale({ terrainMultipliers: { plain: 2 } }), positionOf)).toBe(100);
  });
});

// --- C14 row 6 ---------------------------------------------------------------------

describe('C14 row 6 — no speeds anywhere ⇒ canonical units (C14/FX5, C15, D45)', () => {
  it('terrain DOES apply (it is part of row 5’s distance estimate): 5 × 10 × 2.5 = 125 (C14 row 6)', () => {
    const e = edge({ terrain: 'mountain' });
    expect(edgeCost(e, 'walk', scale({ terrainMultipliers: { mountain: 2.5 } }), positionOf)).toBe(125);
  });

  it('mode multiplier does NOT apply — it factors derived time only (api.ts ModeSpec.multiplier)', () => {
    const e = edge({ terrain: 'mountain', modes: { walk: { allowed: true, multiplier: 3 } } });
    expect(edgeCost(e, 'walk', scale({ terrainMultipliers: { mountain: 2.5 } }), positionOf)).toBe(125);
  });
});

// --- cross-row precedence ----------------------------------------------------------

describe('C14 precedence chain — higher rows dominate everything below (C14/FX5, D14, C2)', () => {
  it('blocked + authoredMinutes + authoredDistance ⇒ Infinity — row 1 wins over all (C14, C2)', () => {
    const e = edge({
      blocked: { reason: 'rockslide' },
      authoredDistance: 30,
      terrain: 'mountain',
      modes: { walk: { allowed: true, authoredMinutes: 40, multiplier: 3 } },
    });
    expect(edgeCost(e, 'walk', scale({ speed: { walk: 5 }, terrainMultipliers: { mountain: 2.5 } }), positionOf))
      .toBe(Infinity);
  });

  it('authoredMinutes + authoredDistance ⇒ minutes — row 3 wins over row 4 (C14 order, D14)', () => {
    const e = edge({
      authoredDistance: 30,
      terrain: 'mountain',
      modes: { walk: { allowed: true, authoredMinutes: 40, multiplier: 3 } },
    });
    expect(edgeCost(e, 'walk', scale({ speed: { walk: 5 }, terrainMultipliers: { mountain: 2.5 } }), positionOf))
      .toBe(40);
  });
});

// --- degenerate geometry (§6.2) ------------------------------------------------------

describe('C14 degenerate geometry — unpositioned endpoints (§6.2, packet ruling)', () => {
  it('one endpoint without a position ⇒ geometric term 0, not Infinity (§6.2 transient state)', () => {
    const e = edge({ target: 'n-nowhere', terrain: 'mountain' });
    // 0 × 10 × 2.5 = 0 — the editor positions nodes on creation, so this is
    // transient; authored values remain the real authoring tool.
    expect(edgeCost(e, 'walk', scale({ terrainMultipliers: { mountain: 2.5 } }), positionOf)).toBe(0);
  });

  it('BOTH endpoints without positions and no authored values ⇒ 0 (§6.2)', () => {
    const e = edge({ source: 'n-ghost-a', target: 'n-ghost-b' });
    expect(edgeCost(e, 'walk', scale(), positionOf)).toBe(0);
  });

  it('authored distance is immune to missing positions — row 4 never consults geometry (C14 order)', () => {
    const e = edge({ source: 'n-ghost-a', target: 'n-ghost-b', authoredDistance: 30 });
    expect(edgeCost(e, 'walk', scale(), positionOf)).toBe(30);
  });
});
