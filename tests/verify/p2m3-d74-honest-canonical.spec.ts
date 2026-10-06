// P2 M3 gate — adversarial D74 suite (verifier). Every expectation here is
// re-derived from the SPEC — CORE.md C14/C15/C17/C18 (as amended by D74),
// register D60/D65/D72/D74, PRODUCT.md F10/F26 — and hand-computed from the
// inline fixtures and data/worlds/fuyuki.ts (FX1), never from the
// implementation or its comments.
//
// D74 (register R17), operative reading: findRoute's UNFORCED runs price
// through the snapshot seam's honest read (priceForSnapshot) —
//   (a) the minutes pass stays STRICT (D60 verbatim): the helper no-ops for
//       currency 'minutes', so a minutes-priced route always wins even when a
//       cheaper honest-canonical path exists;
//   (b) the canonical fallback accepts minutes-priced arcs AT THEIR AUTHORED
//       COSTS only when scale.unitKind === 'time' AND scale.unitLabel ===
//       'min' (authored minutes ARE the canonical unit there); geometric arcs
//       price via the scale (C14 row 5, terrain included); ONE currency;
//   (c) EVERY OTHER map shape (distance-kind; time-kind with a non-'min'
//       label) keeps the strict D60 filter verbatim — interleaved-currency
//       paths stay unroutable;
//   (d) forced runs (D65(c)) are unaffected: forced-canonical snapshot
//       destinations already priced honestly; the D74 helper changes nothing
//       for them;
//   (e) C14 per-arc precedence is intact INSIDE the honest read (rows 1–6 in
//       order, one cost function, no parallel math), and ∞ never leaks (C17).
import { describe, expect, it } from 'vitest';
import { createFacade } from '../../src/core/facade';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, MapEdgeData, RouteResult, WorldMapData } from '../../src/core/api';

// C17 deep scan: ∞ never appears in any output object, in any spelling.
const assertNoInfinity = (value: unknown): void => {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) value.forEach(assertNoInfinity);
  else if (value !== null && typeof value === 'object') Object.values(value).forEach(assertNoInfinity);
};
const assertClean = (value: unknown): void => {
  const json = JSON.stringify(value);
  expect(json).not.toContain('Infinity');
  expect(json).not.toContain('∞');
  assertNoInfinity(value);
};

const overlayFor = (map: WorldMapData, pin: string | null): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: pin,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {}, nodeBlocked: {},
});

const load = (map: WorldMapData, pin: string | null = null, compile?: (tpl: string) => (ctx: Record<string, unknown>) => string) => {
  const f = createFacade(compile ? { compile } : undefined);
  f.loadMap(map, overlayFor(map, pin));
  f.materialize();
  return f;
};

// FX1 thawed per facade (C24: the facade keeps the live reference).
const loadFuyuki = (
  pin: string | null = 'emiya-residence',
  compile?: (tpl: string) => (ctx: Record<string, unknown>) => string,
) => {
  const map = JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;
  return { f: load(map, pin, compile), map };
};

const weEdgeBetween = (
  overlay: ChatMapOverlay,
  a: string,
  b: string,
): MapEdgeData => {
  const edge = overlay.userEdges.find(
    (e) => (e.source === a && e.target === b) || (e.source === b && e.target === a),
  );
  if (edge === undefined) throw new Error(`no we- edge between ${a} and ${b}`);
  return edge;
};

// ---------------------------------------------------------------------------
// (b) + (e): the honest canonical read on FX1's D45 shape (time-kind 'min',
// no speeds) — authored legs at AUTHORED costs, geometric legs via the scale,
// C14 rows 1/3/4/5 each individually load-bearing.
//
// Fixture (hand-computed; unitPerPx 0.2 = FX1, mountain ×2.5 = FX1):
//   a(0,0) — e-ab authored 50 min, terrain MOUNTAIN — b(100,0)
//   a — e-a2 authoredDistance 7 — a2(10,0)   (row 4 probe; geometry would be 2)
//   c(200,0) — e-cd authored 20 min — d(300,0)
//   e(150,60) — a decoy leaf that absorbs nothing (kNN third slot)
// Waypoint at (150,0): kNN distances (px): b 50, c 50, e 60, a2 140, a 150,
// d 150 ⇒ k=3 = {b, c, e} (stable tie b before c). we- legs: 50 px × 0.2 = 10.
// Route a→d (the only path crosses the waypoint gap):
//   50 (authored, mountain NOT applied — row 3 beats row 5)
//   + 10 + 10 (we- geometry, plain) + 20 (authored) = 90 min, ONE currency.
//   A terrain-on-authored mutant ⇒ 125; a geometric-reprice-of-authored
//   mutant ⇒ e-ab 20 ⇒ total 60; a strict-refusal mutant ⇒ ok:false.
// ---------------------------------------------------------------------------
const terrainMinMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-terrain-min',
  name: 'Terrain Minutes (verify)',
  layers: [{ id: 'layer-t', name: 'T' }],
  scale: { unitPerPx: 0.2, unitLabel: 'min', unitKind: 'time', terrainMultipliers: { mountain: 2.5 } },
  nodes: [
    { id: 'a', label: 'Alpha', kind: 'location', layer: 'layer-t', position: { x: 0, y: 0 } },
    { id: 'a2', label: 'Alpha Two', kind: 'location', layer: 'layer-t', position: { x: 10, y: 0 } },
    { id: 'b', label: 'Beta', kind: 'location', layer: 'layer-t', position: { x: 100, y: 0 } },
    { id: 'c', label: 'Gamma', kind: 'location', layer: 'layer-t', position: { x: 200, y: 0 } },
    { id: 'd', label: 'Delta', kind: 'location', layer: 'layer-t', position: { x: 300, y: 0 } },
    { id: 'e', label: 'Epsilon', kind: 'location', layer: 'layer-t', position: { x: 150, y: 60 } },
  ],
  edges: [
    { id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true, authoredMinutes: 50 } }, terrain: 'mountain' },
    { id: 'e-a2', source: 'a', target: 'a2', modes: { walk: { allowed: true } }, authoredDistance: 7 },
    { id: 'e-cd', source: 'c', target: 'd', modes: { walk: { allowed: true, authoredMinutes: 20 } } },
  ],
});

describe('D74(b)(e) — the honest canonical fallback on a time-kind min scale (C14 rows inside it, C15 one currency)', () => {
  it('routes across a waypoint gap: authored legs verbatim (terrain NOT applied, row 3), we- legs geometric (row 5), unit min, and the row-4 authoredDistance probe (D74, C14 rows 3–5, C15, C18, D72)', () => {
    const map = terrainMinMap();
    const overlay = overlayFor(map, null);
    const f = createFacade();
    f.loadMap(map, overlay);
    f.materialize();
    f.addUserNodeAt('layer-t', { x: 150, y: 0 });
    const wp = overlay.userNodes[0]!.id;
    const weB = weEdgeBetween(overlay, wp, 'b').id;
    const weC = weEdgeBetween(overlay, wp, 'c').id;

    const r = f.findRoute('a', 'd');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(90); // 50 + 10 + 10 + 20 — one honest 'min' total (C15)
    expect(r.unit).toBe('min'); // D72: the canonical label on this scale — both branches read 'min'
    expect(r.legs).toEqual([
      { arcId: 'e-ab', from: 'a', to: 'b', mode: 'walk', modeLabel: 'walk', cost: 50 }, // authored minutes VERBATIM — mountain ×2.5 must NOT accrue (C14 row 3, D14)
      { arcId: weB, from: 'b', to: wp, mode: 'walk', modeLabel: 'walk', cost: 10 }, // 50 px × 0.2, plain (C14 row 5)
      { arcId: weC, from: wp, to: 'c', mode: 'walk', modeLabel: 'walk', cost: 10 },
      { arcId: 'e-cd', from: 'c', to: 'd', mode: 'walk', modeLabel: 'walk', cost: 20 },
    ]);
    assertClean(r);

    // C14 row 4 INSIDE the honest read: the authoredDistance arc prices its
    // AUTHORED value (7), not its geometry (10 px × 0.2 = 2), in 'min' (row 6:
    // no speeds ⇒ canonical units — which ARE minutes on this scale).
    const r2 = f.findRoute('a', 'a2');
    expect(r2.ok).toBe(true);
    expect(r2.total).toBe(7);
    expect(r2.unit).toBe('min');
    assertClean(r2);
  });

  it('C14 row 1 inside the honest read: a blocked we- edge severs the gap path; lifting restores 90 (C2, D20, D74)', () => {
    const map = terrainMinMap();
    const overlay = overlayFor(map, null);
    const f = createFacade();
    f.loadMap(map, overlay);
    f.materialize();
    f.addUserNodeAt('layer-t', { x: 150, y: 0 });
    const wp = overlay.userNodes[0]!.id;
    const weC = weEdgeBetween(overlay, wp, 'c').id;

    f.setBlocked(weC, 'Rockslide');
    const r = f.findRoute('a', 'd');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/blocked or disallowed/); // connected in principle (C17)
    expect(r.unit).toBe('min');
    assertClean(r);

    f.setBlocked(weC, undefined);
    expect(f.findRoute('a', 'd').total).toBe(90); // restored verbatim
  });
});

// ---------------------------------------------------------------------------
// (e) continued: terrain accrues on GEOMETRIC user edges inside the honest
// read. Hand-authored overlay (validateOverlay-clean), axis-aligned so every
// distance is exact: w(100,100), a(0,100), b(100,0). a→w = 100 px ⇒ 20 min
// (plain); w→b = 100 px × 0.2 × 2.5 = 50 min (mountain). a→b = 70 min. A
// mutant that skips terrain on user edges in the honest read ⇒ 40.
// ---------------------------------------------------------------------------

describe('D74(e) — terrain multipliers apply to geometric user edges in the honest read (C14 row 5, no parallel math)', () => {
  it('a→b over a hand-authored mountain user edge costs 70 min, not 40 (C14 row 5, §6.2 same-cost-function)', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-user-terrain',
      name: 'User Terrain (verify)',
      layers: [{ id: 'layer-u', name: 'U' }],
      scale: { unitPerPx: 0.2, unitLabel: 'min', unitKind: 'time', terrainMultipliers: { mountain: 2.5 } },
      nodes: [
        { id: 'a', label: 'Alpha', kind: 'location', layer: 'layer-u', position: { x: 0, y: 100 } },
        { id: 'b', label: 'Beta', kind: 'location', layer: 'layer-u', position: { x: 100, y: 0 } },
      ],
      edges: [],
    };
    const overlay = overlayFor(map, null);
    overlay.userNodes = [
      { id: 'wp-h', label: 'Waypoint', kind: 'waypoint', layer: 'layer-u', position: { x: 100, y: 100 }, origin: 'user' },
    ];
    overlay.userEdges = [
      { id: 'we-plain', source: 'wp-h', target: 'a', modes: { walk: { allowed: true } } },
      { id: 'we-mtn', source: 'wp-h', target: 'b', modes: { walk: { allowed: true } }, terrain: 'mountain' },
    ];
    const f2 = createFacade();
    f2.loadMap(map, overlay);
    f2.materialize();
    const r = f2.findRoute('a', 'b');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(70); // 20 (plain we-) + 50 (mountain we-: 100 px × 0.2 × 2.5) — terrain accrues on geometry (C14 row 5)
    expect(r.unit).toBe('min');
    expect(r.legs.map((leg) => leg.cost)).toEqual([20, 50]);
    assertClean(r);
  });
});

// ---------------------------------------------------------------------------
// (a): minutes-first stays STRICT — D60 verbatim, the helper no-ops for the
// minutes run. On FX1 + a waypoint at (120,260) (kNN: emiya √500 ≈ 22.36 px,
// matou √6100 ≈ 78.10, shopping √6500 ≈ 80.62), the MIXED path emiya→wp→matou
// costs ≈ 4.47 + 15.62 = 20.09 min honest-canonical — CHEAPER than the
// authored 22-minute arc. The minutes run succeeds (the authored arc prices
// minutes), so D60 forbids the fallback: the route must be exactly 22. A
// mutant leaking the honest read into the minutes run ⇒ ≈ 20.09 ⇒ red.
// ---------------------------------------------------------------------------

describe('D74(a) — minutes-first stays strict: a cheaper honest-canonical path must NOT beat a minutes-priced route (D60 verbatim)', () => {
  it('FX1 emiya→matou stays on the authored 22-min arc; the ~20.09 mixed waypoint path is invisible to the minutes run (D60, D74, FX1)', () => {
    const { f } = loadFuyuki();
    f.addUserNodeAt('layer-fuyuki', { x: 120, y: 260 });
    const r = f.findRoute('emiya-residence', 'matou-residence');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(22); // the authored arc — NOT ≈20.09 (the mixed we- path must not win, D74(a))
    expect(r.legs).toEqual([
      { arcId: 'arc-emiya-residence-matou-residence', from: 'emiya-residence', to: 'matou-residence', mode: 'walk', modeLabel: 'walk', cost: 22 },
    ]);
    expect(r.unit).toBe('min');
    assertClean(r);
  });
});

// ---------------------------------------------------------------------------
// (c): the strict refusal survives on every other map shape.
//   T4 — time-kind with a NON-'min' label ('hours'): the honest read keys on
//        BOTH unitKind and unitLabel; a mutant keying on unitKind alone (or
//        dropping the label check) returns ok:true ⇒ red.
//   T5 — distance-kind + a placed waypoint bridging an authored-minutes
//        corridor: the mixed path stays unroutable (the p2m2 league pin's
//        F26-context twin: F26 is limited, not unlimited, off the min shape).
// ---------------------------------------------------------------------------

describe('D74(c) — the strict filter keeps verbatim off the time-min shape (C15, D60, C17)', () => {
  it("time-kind 'hours' scale: authored-minutes + geometric interleaved path ⇒ ok:false, unit 'hours' (D74 carve-out, C17, D72)", () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-hours',
      name: 'Hours (verify)',
      layers: [{ id: 'layer-h', name: 'H' }],
      scale: { unitPerPx: 1, unitLabel: 'hours', unitKind: 'time' },
      nodes: [
        { id: 'a', label: 'Alpha', kind: 'location', layer: 'layer-h', position: { x: 0, y: 0 } },
        { id: 'b', label: 'Beta', kind: 'location', layer: 'layer-h', position: { x: 0, y: 10 } },
        { id: 'c', label: 'Gamma', kind: 'location', layer: 'layer-h', position: { x: 10, y: 10 } },
      ],
      edges: [
        { id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true, authoredMinutes: 10 } } },
        { id: 'e-bc', source: 'b', target: 'c', modes: { walk: { allowed: true } } },
      ],
    };
    const r = load(map).findRoute('a', 'c');
    expect(r.ok).toBe(false); // strict: the honest read must NOT open on a non-'min' label
    expect(r.total).toBe(0);
    expect(r.legs).toEqual([]);
    expect(r.reason).toMatch(/blocked or disallowed/); // connected in principle (weight-1 probe)
    expect(r.unit).toBe('hours'); // D72: the last attempted (canonical) run's label
    assertClean(r);
  });

  it("distance-kind scale + waypoint bridging an authored-minutes corridor ⇒ still ok:false (D74 carve-out in the F26 context, C15)", () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-km-corridor',
      name: 'Km Corridor (verify)',
      layers: [{ id: 'layer-k', name: 'K' }],
      scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
      nodes: [
        { id: 'a', label: 'Alpha', kind: 'location', layer: 'layer-k', position: { x: 0, y: 0 } },
        { id: 'b', label: 'Beta', kind: 'location', layer: 'layer-k', position: { x: 10, y: 0 } },
        { id: 'c', label: 'Gamma', kind: 'location', layer: 'layer-k', position: { x: 20, y: 0 } },
        { id: 'd', label: 'Delta', kind: 'location', layer: 'layer-k', position: { x: 40, y: 0 } },
      ],
      edges: [
        { id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true, authoredMinutes: 10 } } },
      ],
    };
    const overlay = overlayFor(map, null);
    const f = createFacade();
    f.loadMap(map, overlay);
    f.materialize();
    // (25,0): distances b 15, c 5, d 15, a 25 ⇒ kNN-3 = {c, b, d} (stable tie
    // b before d) — deliberately NOT a, so the wp cannot shortcut the e-ab arc.
    f.addUserNodeAt('layer-k', { x: 25, y: 0 });
    const wp = overlay.userNodes[0]!.id;
    expect(overlay.userEdges.some((e) => e.source === wp && e.target === 'a' || e.source === 'a' && e.target === wp)).toBe(false); // no wp–a shortcut exists
    const r = f.findRoute('a', 'd');
    expect(r.ok).toBe(false); // minutes: we- ∞; canonical strict: authoredMinutes ∞ — no honest single currency off the min shape
    expect(r.reason).toMatch(/blocked or disallowed/);
    expect(r.unit).toBe('km');
    assertClean(r);
    // F26 on THIS shape is limited to pure-canonical corridors: wp→c→d side
    // routes fine (m2-waypoints pins the pure-geometric case) — here the
    // corridor arc itself is the refusal cause, and it stays refused.
  });
});

// ---------------------------------------------------------------------------
// (d) + the snapshot seam: forced runs (D65(c)) are unaffected by D74, and
// the D65(a) currency flip prices honestly. On FX1 (pin Emiya Residence),
// placing then PROMOTING a waypoint at (120,260) graduates its we- edge to
// the library (D61 — all three kNN targets are library nodes), which adds a
// LIVE geometric arc to the pin's incident set:
//   BEFORE promote: the we- edge targets an UNNAMED user node ⇒ excluded from
//   the prompt-facing neighborhood (C23) ⇒ all 6 live incident arcs price
//   minutes ⇒ snapshot currency MINUTES; destinations forced-minutes.
//   AFTER promote: the named 'Riverside Camp' arc is prompt-listable but not
//   minutes-priced ⇒ D65(a) flips the snapshot currency to CANONICAL; the
//   honest read prices the camp arc geometrically (≈ 4.472 min) AND keeps
//   every authored arc at its authored cost; destinations force CANONICAL and
//   must still route (50 / 350) — a D74 regression at the snapshot seam
//   (strict forced-canonical) empties them ⇒ red.
// ---------------------------------------------------------------------------

describe('D74(d) — forced runs (D65(c)) and the D65(a) snapshot flip price honestly (C19, C20, C23, D61, D65)', () => {
  it('FX1: unnamed waypoint adjacent to the pin stays out of the snapshot; after promotion its arc lists geometrically and destinations survive the forced-canonical run (C23, D65(a)(c), D61, D74)', () => {
    // The engine is a test fake (D62 leaves the engine injected) that
    // serializes the C22 context, so the prompt block is inspectable JSON.
    const compile = (_tpl: string) => (ctx: Record<string, unknown>) => JSON.stringify(ctx);
    const { f } = loadFuyuki('emiya-residence', compile);
    f.addUserNodeAt('layer-fuyuki', { x: 120, y: 260 });

    const before = f.getSnapshot();
    expect(before.unit).toBe('min');
    expect(before.routes.map((route) => route.label)).not.toContain('Waypoint'); // C23
    expect(before.routes).toHaveLength(7); // 6 live authored + the authored-blocked bridge (C2)
    expect(before.destinations.map((d) => d.label)).toEqual(['Fuyuki Station', 'Misaki Town']);
    expect(before.destinations.map((d) => d.cost)).toEqual([50, 350]); // forced-MINUTES destination runs (D65(c))
    assertClean(before);

    // Route-to-waypoint works pre-promotion (F10/D74): the direct we- leg at
    // pure geometry (√500 px × 0.2 ≈ 4.472 min), unit 'min' (D72/D74).
    const toWp = f.findRoute('emiya-residence', 'wp-1');
    expect(toWp.ok).toBe(true);
    expect(toWp.legs).toHaveLength(1);
    expect(toWp.total).toBeCloseTo(Math.sqrt(500) * 0.2, 6);
    expect(toWp.unit).toBe('min');
    assertClean(toWp);

    // D21/C26/D61: promote names it; ALL THREE we- edges graduate (their
    // other endpoints are library nodes).
    f.promoteUserNode('wp-1', 'Riverside Camp');

    const after = f.getSnapshot();
    expect(after.unit).toBe('min'); // canonical on this scale reads 'min' too — the flip is proven by the camp row below
    const camp = after.routes.find((route) => route.label === 'Riverside Camp');
    expect(camp).toBeDefined(); // D65(a): the live geometric arc LISTS (a strict-minutes seam would drop it)
    expect(camp!.cost).toBeCloseTo(Math.sqrt(500) * 0.2, 6); // geometric via the scale (C14 row 5) — honest canonical
    expect(camp!.mode).toBe('walk');
    expect(after.routes).toHaveLength(8); // 7 authored (bridge included, C2) + the camp arc
    expect(after.destinations.map((d) => d.label)).toEqual(['Fuyuki Station', 'Misaki Town']);
    expect(after.destinations.map((d) => d.cost)).toEqual([50, 350]); // forced-CANONICAL runs price authored minutes honestly (D65(c) + D74)
    assertClean(after);

    // C23 at the prompt seam: the engine id tokens never surface; the authored
    // name does. (The engine is a test fake — D62 leaves the engine injected.)
    const prompt = f.getPromptBlock();
    expect(prompt).toContain('Riverside Camp');
    expect(prompt).not.toMatch(/wp-\d/);
    expect(prompt).not.toMatch(/we-\d/);
    expect(prompt).not.toContain('Waypoint');
    assertClean(JSON.parse(prompt) as unknown);
  });
});

// ---------------------------------------------------------------------------
// C23 — an unnamed waypoint fronting the ONLY path to a hub drops the
// destination (its via would carry user state), while the route itself stays
// reachable and no machine token leaks. Hand-computed: p(0,0), h(200,0),
// waypoint at (100,0) with kNN-2 {p, h} (fewer than k leaves ⇒ connect what
// exists, C7); we- legs 100 px × 1 = 100 each ⇒ p→h = 200 min.
// ---------------------------------------------------------------------------

describe('C23 × C20 — a hub whose only path starts on an unnamed waypoint drops as a destination; the route stays honest (C23, C20, C17, D65(c))', () => {
  it('destinations [] (not truncated), routes [] at the pin, yet findRoute p→h = 200 min and the prompt carries no user-state token (C23, C20, D74)', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-wp-hub',
      name: 'Waypoint Hub (verify)',
      layers: [{ id: 'layer-w', name: 'W' }],
      scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' },
      nodes: [
        { id: 'p', label: 'Pier', kind: 'location', layer: 'layer-w', position: { x: 0, y: 0 } },
        { id: 'h', label: 'Harborage', kind: 'hub', layer: 'layer-w', position: { x: 200, y: 0 } },
      ],
      edges: [],
    };
    // The engine is a test fake (D62 leaves the engine injected) that
    // serializes the C22 context, so the prompt block is inspectable JSON.
    const compile = (_tpl: string) => (ctx: Record<string, unknown>) => JSON.stringify(ctx);
    const f = load(map, 'p', compile);
    f.addUserNodeAt('layer-w', { x: 100, y: 0 });

    // The route itself: reachable, one honest currency (D74).
    const r = f.findRoute('p', 'h');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(200);
    expect(r.unit).toBe('min');
    assertClean(r);

    // The snapshot: the pin's only incident arc targets an unnamed waypoint ⇒
    // C23-excluded from routes; the hub's only path's FIRST leg touches the
    // unnamed waypoint ⇒ dropped as a destination (its via would carry user
    // state). The drop is C23's price, NOT a cap drop (C20/D63).
    const snap = f.getSnapshot();
    expect(snap.location).toBe('Pier');
    expect(snap.routes).toEqual([]);
    expect(snap.destinations).toEqual([]);
    expect(snap.destinationsTruncated).toBe(false);
    expect(snap.unit).toBe('min');
    assertClean(snap);

    // The prompt block (fake engine ⇒ the raw context JSON): no 'Waypoint',
    // no machine tokens, anywhere (C23).
    const prompt = f.getPromptBlock();
    expect(prompt).not.toContain('Waypoint');
    expect(prompt).not.toMatch(/wp-\d/);
    expect(prompt).not.toMatch(/we-\d/);
    // The pin and the hub are named — the snapshot degrades honestly, not silently empty.
    expect(prompt).toContain('Pier');
    // RouteLeg carry-over: C18 legs remain queryable even when prompt-excluded.
    const legs: RouteResult['legs'] = r.legs;
    expect(legs).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// C17 battery over every D74 branch shape in this suite.
// ---------------------------------------------------------------------------

describe('C17 — ∞ never leaks through any D74 output (C17)', () => {
  it('the full battery: ok routes, refusals, snapshots, prompt blocks all finite (C17)', () => {
    const map = terrainMinMap();
    const overlay = overlayFor(map, null);
    const f = createFacade();
    f.loadMap(map, overlay);
    f.materialize();
    f.addUserNodeAt('layer-t', { x: 150, y: 0 });
    const wp = overlay.userNodes[0]!.id;
    assertClean(f.findRoute('a', 'd'));
    assertClean(f.findRoute('a', 'a2'));
    assertClean(f.findRoute('a', 'e')); // dead-end decoy — reachable via wp
    f.setBlocked(weEdgeBetween(overlay, wp, 'c').id, 'Rockslide');
    assertClean(f.findRoute('a', 'd'));
    assertClean(f.getSnapshot());
    const { f: fxF } = loadFuyuki();
    fxF.addUserNodeAt('layer-fuyuki', { x: 120, y: 260 });
    assertClean(fxF.findRoute('emiya-residence', 'wp-1'));
    assertClean(fxF.getSnapshot());
    assertClean(fxF.findRoute('emiya-residence', 'wp-1', 'train')); // explicit-mode refusal shape
  });
});
