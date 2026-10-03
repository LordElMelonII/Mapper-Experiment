// Unit tests for the classical-MDS seeder (PKG A-010, import/mds.ts).
//
// The packet's test charter: a hand-checkable 3-node matrix (3-4-5 right
// triangle ⇒ pairwise distances preserved), a 4-node square (side 1),
// determinism (two calls byte-identical), unconstrained node ⇒ undefined.
// Fixed 100 power iterations are asserted exact HERE (the distances close to
// machine precision) — no adaptive loops (packet ruling, D59 ponytail).
//
// IDs: F05 (importer seeding), FX3/D55 (the MDS-seeding ruling), C9
// (orientation — the golden x-flip only canonizes the sign, never geography).
import { describe, expect, it } from 'vitest';
import { seedPositions } from '../../../src/core/import/mds';

const INF = Infinity;


type Pt = { x: number; y: number } | undefined;

function distance(a: Pt, b: Pt): number {
  expect(a).toBeDefined();
  expect(b).toBeDefined();
  return Math.hypot(b!.x - a!.x, b!.y - a!.y);
}

describe('seedPositions — classical MDS over the complete submatrix (F05, FX3/D55)', () => {
  it('embeds a 3-4-5 right triangle with all pairwise distances preserved', () => {
    // A-B = 3, A-C = 4, B-C = 5 — an exactly-planar matrix: classical MDS
    // must recover it with (near-)zero stress.
    const pos = seedPositions(
      [
        [0, 3, 4],
        [3, 0, 5],
        [4, 5, 0],
      ],
      ['A', 'B', 'C'],
    );
    expect(distance(pos[0], pos[1])).toBeCloseTo(3, 6);
    expect(distance(pos[0], pos[2])).toBeCloseTo(4, 6);
    expect(distance(pos[1], pos[2])).toBeCloseTo(5, 6);
  });

  it('embeds a 4-node square (side 1) with all six pairwise distances preserved', () => {
    // Corners (0,0), (1,0), (0,1), (1,1): sides 1, diagonals √2. The square's
    // two nonzero eigenvalues are exactly degenerate — power iteration lands
    // on SOME orthonormal basis of the eigenspace, so pairwise DISTANCES are
    // the stable assertion, not absolute coordinates.
    const pos = seedPositions(
      [
        [0, 1, 1, Math.SQRT2],
        [1, 0, Math.SQRT2, 1],
        [1, Math.SQRT2, 0, 1],
        [Math.SQRT2, 1, 1, 0],
      ],
      ['P0', 'P1', 'P2', 'P3'],
    );
    const sides = [
      distance(pos[0], pos[1]),
      distance(pos[0], pos[2]),
      distance(pos[1], pos[3]),
      distance(pos[2], pos[3]),
    ];
    const diagonals = [distance(pos[0], pos[3]), distance(pos[1], pos[2])];
    for (const s of sides) expect(s).toBeCloseTo(1, 6);
    for (const d of diagonals) expect(d).toBeCloseTo(Math.SQRT2, 6);
  });

  it('is deterministic — two calls produce byte-identical output (golden-stable)', () => {
    const D = [
      [0, 3, 4],
      [3, 0, 5],
      [4, 5, 0],
    ];
    expect(JSON.stringify(seedPositions(D, ['A', 'B', 'C']))).toBe(
      JSON.stringify(seedPositions(D, ['A', 'B', 'C'])),
    );
  });

  it('canonizes the sign: the largest-|x| coordinate is positive (packet ruling)', () => {
    const pos = seedPositions(
      [
        [0, 3, 4],
        [3, 0, 5],
        [4, 5, 0],
      ],
      ['A', 'B', 'C'],
    );
    let maxAt = 0;
    for (let i = 1; i < pos.length; i++) {
      if (Math.abs(pos[i]!.x) > Math.abs(pos[maxAt]!.x)) maxAt = i;
    }
    expect(pos[maxAt]!.x).toBeGreaterThan(0);
  });

  it('returns undefined for a node with no finite distance (unconstrained ⇒ omitted)', () => {
    // D is unconstrained on row/column 3 — it has nothing to seed from.
    const pos = seedPositions(
      [
        [0, 3, 4, INF],
        [3, 0, 5, INF],
        [4, 5, 0, INF],
        [INF, INF, INF, 0],
      ],
      ['A', 'B', 'C', 'X'],
    );
    expect(pos[0]).toBeDefined();
    expect(pos[1]).toBeDefined();
    expect(pos[2]).toBeDefined();
    expect(pos[3]).toBeUndefined();
    // the complete submatrix is unaffected by the passenger
    expect(distance(pos[0], pos[1])).toBeCloseTo(3, 6);
    expect(distance(pos[1], pos[2])).toBeCloseTo(5, 6);
  });

  it('leaves nodes outside the complete submatrix to the caller (partial row ⇒ undefined)', () => {
    // 'D' has known distances only to A — its row is not complete, so it is
    // not part of the MDS submatrix; the importer resolves it from its own
    // constraint data (lookup.ts placement ruling).
    const pos = seedPositions(
      [
        [0, 3, 4, INF],
        [3, 0, 5, 7],
        [4, 5, 0, INF],
        [INF, 7, INF, 0],
      ],
      ['A', 'B', 'C', 'D'],
    );
    expect(pos[3]).toBeUndefined();
    expect(distance(pos[0], pos[1])).toBeCloseTo(3, 6);
  });

  it('returns all-undefined for a matrix with no known distance at all', () => {
    const pos = seedPositions(
      [
        [0, INF],
        [INF, 0],
      ],
      ['A', 'B'],
    );
    expect(pos).toEqual([undefined, undefined]);
  });

  it('refuses a misaligned D/labels pair (programming contract, not data validation)', () => {
    expect(() => seedPositions([[0, 1], [1, 0]], ['A'])).toThrow(/must align/);
  });
});
