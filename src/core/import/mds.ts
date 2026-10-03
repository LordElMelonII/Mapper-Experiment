// src/core/import/mds.ts — classical multidimensional scaling seed for the
// lookup-table importer (PKG A-010; F05, FX3/D55, C9).
//
// The ruling (packet A-010, "MDS seeding"): classical MDS over the COMPLETE
// walking submatrix — the mutually-complete set of nodes (every member's row
// AND column of known distances is full within the set); MT, whose only known
// value is one hole-filling train minute, is excluded. D² double-centering
// B = −½ J D² J; top-2 eigenpairs by power iteration with deflation — tens of
// nodes, plain loops, no eigen library (D59 ponytail discipline). Determinism
// and golden-stability: a FIXED seed, a FIXED 100-iteration budget (the
// packet pins exactness at n ≤ 20; convergence is asserted by the tests —
// λ2/λ1 ≈ 0.088 on the legacy table ⇒ machine precision), no adaptive loops,
// and the axis-sign ambiguity fixed by flipping x so the largest-|x|
// coordinate is positive.
//
// PACKET DEVIATION (reported for the register): the ruled seed "all-ones
// normalized" is the EXACT null eigenvector of every double-centered matrix
// (rows sum to zero, B·1 = 0). On symmetric data whose rounding noise is
// proportional to all-ones — the packet's own 4-node square case, where
// Math.SQRT2² = 2.0000000000000004 makes the row-sum noise self-proportional
// — the iteration converges perfectly to that null pair (λ ≈ −2e-16) and the
// embedding collapses to zero. The seed is therefore a fixed deterministic
// ramp (1..m, normalized): never in the null space, equally fixed and
// golden-stable. Convergence to ±v1 is seed-independent, the x-flip fixes the
// sign, and the legacy table's embedding is unchanged (verified: identical
// FX3 outcome).
//
// Nodes OUTSIDE the complete submatrix come back `undefined`: this module is
// the pure MDS primitive and only knows the matrix it is given. Resolving
// outside nodes from their own constraints (the ruling's strongest-constraint
// placement — MT at its train minutes due East of Station Front) is the
// importer's job (lookup.ts), which owns the full constraint data.
//
// Contract: `D` is an n×n matrix of distances in the map's canonical unit;
// non-finite entries (Infinity/NaN) mean "no known distance". `labels.length`
// must equal D.length; the returned array is aligned with `labels` (index i).
// Pure: no mutation of D, no state, no host/DOM/console (R5).

export interface SeedPosition {
  x: number;
  y: number;
}

/** Fixed iteration count (packet A-010: exact enough at n ≤ 20; assert via tests, not adaptive loops). */
const POWER_ITERATIONS = 100;

function isKnown(v: number): boolean {
  return Number.isFinite(v);
}

/** The fixed deterministic seed — see the deviation note in the header. */
function fixedSeed(m: number): number[] {
  const ramp = Array.from({ length: m }, (_, i) => i + 1);
  const norm = Math.sqrt(ramp.reduce((s, v) => s + v * v, 0));
  return ramp.map((v) => v / norm);
}

/**
 * One power-iteration top-eigenpair pass over a symmetric matrix: fixed
 * ramp seed, `POWER_ITERATIONS` sweeps, Rayleigh-quotient eigenvalue. A
 * zero product (genuinely zero matrix) ends the sweep; the seed is then a
 * fixed point with λ = 0.
 */
function topEigenpair(M: number[][]): { v: number[]; lambda: number } {
  const m = M.length;
  let u: number[] = fixedSeed(m);
  for (let k = 0; k < POWER_ITERATIONS; k++) {
    let normSq = 0;
    const w: number[] = Array.from({ length: m }, (_, i) => {
      let s = 0;
      for (let j = 0; j < m; j++) s += M[i][j] * u[j];
      normSq += s * s;
      return s;
    });
    if (normSq === 0) break; // zero matrix — nothing to extract
    const norm = Math.sqrt(normSq);
    u = w.map((v) => v / norm);
  }
  let lambda = 0;
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let j = 0; j < m; j++) s += M[i][j] * u[j];
    lambda += u[i] * s; // Rayleigh quotient (u is unit-norm)
  }
  return { v: u, lambda };
}

/**
 * Classical MDS seed per the A-010 ruling. Returns one entry per label
 * (aligned by index): coordinates for nodes of the complete submatrix,
 * `undefined` for every node outside it (the caller resolves those from its
 * own constraint data — see lookup.ts).
 */
export function seedPositions(D: number[][], labels: string[]): Array<SeedPosition | undefined> {
  if (D.length !== labels.length) {
    throw new Error(`[TravelMapper] seedPositions: D (${D.length}) and labels (${labels.length}) must align`);
  }
  const n = labels.length;
  const result: Array<SeedPosition | undefined> = Array.from({ length: n }, () => undefined);
  if (n === 0) return result;

  // The complete walking submatrix (ruling): the mutually-complete set —
  // every member's row AND column fully known within it. Peel-to-fixpoint:
  // repeatedly drop the node with the fewest known distances inside the set
  // while the set is not mutually complete, so a weakly-known node (the
  // legacy table's MT: one train value) is excluded instead of voiding the
  // complete core. Ties peel the lowest index — deterministic. A singleton
  // set is vacuously complete; a node with no known distance at all is never
  // seeded (ruling: "no finite distance ⇒ position omitted").
  const knownWithin = (i: number, set: number[]): number =>
    set.reduce((c, j) => (j !== i && isKnown(D[i][j]) && isKnown(D[j][i]) ? c + 1 : c), 0);
  const mutuallyComplete = (set: number[]): boolean =>
    set.every((i) => set.every((j) => j === i || (isKnown(D[i][j]) && isKnown(D[j][i]))));
  let universe: number[] = Array.from({ length: n }, (_, i) => i);
  while (universe.length > 1 && !mutuallyComplete(universe)) {
    let victim = 0;
    let min = knownWithin(universe[0], universe);
    for (let t = 1; t < universe.length; t++) {
      const deg = knownWithin(universe[t], universe);
      if (deg < min) {
        min = deg;
        victim = t;
      }
    }
    universe = universe.filter((_, t) => t !== victim);
  }
  const members = universe.filter((i) => D[i].some((v, j) => j !== i && isKnown(v)));
  const m = members.length;
  if (m === 0) return result; // nothing measurable — every node stays unseeded

  // Torgerson double-centering (the ruling's formula, standard form with the
  // zero diagonal included in the means): B = −½ J D² J, entrywise
  // B[i][j] = −½ (D²[i][j] − rowMean_i − colMean_j + grandMean).
  const D2: number[][] = members.map((a) => members.map((b) => D[a][b] * D[a][b]));
  const rowMean = D2.map((row) => row.reduce((s, v) => s + v, 0) / m);
  const colMean = Array.from({ length: m }, (_, j) => D2.reduce((s, row) => s + row[j], 0) / m);
  const grand = D2.flat().reduce((s, v) => s + v, 0) / (m * m);
  const B = D2.map((row, i) => row.map((v, j) => -0.5 * (v - rowMean[i] - colMean[j] + grand)));

  // Top-2 eigenpairs: power iteration with deflation, fixed seed (see the
  // deviation note — the ramp, not the degenerate all-ones).
  const e1 = topEigenpair(B);
  const B2 = B.map((row, i) => row.map((v, j) => v - e1.lambda * e1.v[i] * e1.v[j]));
  const e2 = topEigenpair(B2);

  // Coordinates from the (clamped-nonnegative) eigenvalues; sign canonized so
  // the largest-|x| coordinate is positive — the ruling's golden orientation.
  const ax = Math.sqrt(Math.max(e1.lambda, 0));
  const ay = Math.sqrt(Math.max(e2.lambda, 0));
  const xs = e1.v.map((v) => v * ax);
  const ys = e2.v.map((v) => v * ay);
  let maxX = 0;
  for (let t = 1; t < m; t++) if (Math.abs(xs[t]) > Math.abs(xs[maxX])) maxX = t;
  if (xs[maxX] < 0) for (let t = 0; t < m; t++) xs[t] = -xs[t];

  members.forEach((node, t) => {
    result[node] = { x: xs[t], y: ys[t] };
  });
  return result;
}
