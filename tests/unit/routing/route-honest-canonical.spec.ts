// Unit tests for the D74 canonical fallback (PKG A-012): findRoute's UNFORCED
// runs price through the snapshot seam's honest read (priceForSnapshot). The
// reopening: on a time-kind 'min' scale (FX1's D45 shape — the canonical unit
// IS minutes, no speeds), the canonical fallback accepts authored-minutes arcs
// at their authored costs (C14 authored-wins within the same unit) while
// geometric arcs price via the scale — so a path mixing authored arcs with
// waypoint `we-` edges (C7: no authored values) routes again (F26) and
// route-to-waypoint works (F10). Minutes-first stays strict verbatim (D60 —
// the helper no-ops for the minutes currency); every other map shape keeps
// the strict filter (the league-map interleaving refusal, pinned in
// tests/verify/p2m2-route-currency-adversarial.spec.ts). Inline-literal
// fixtures per the dijkstra.spec.ts pattern; every number hand-computed.
import { describe, expect, it } from 'vitest';
import { createFacade } from '../../../src/core/facade';
import { euclid } from '../../../src/core/geometry/measure';
import { fuyukiMap } from '../../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../../src/core/api';

// C17 deep scan: ∞ never appears in any output object, in any spelling (C17).
const assertClean = (value: unknown): void => {
  const json = JSON.stringify(value);
  expect(json).not.toContain('Infinity');
  expect(json).not.toContain('∞');
  const scan = (v: unknown): void => {
    if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    else if (Array.isArray(v)) v.forEach(scan);
    else if (v !== null && typeof v === 'object') Object.values(v).forEach(scan);
  };
  scan(value);
};

// C24: the facade keeps the loaded references — a fresh facade per test.
const load = (map: WorldMapData) => {
  const overlay: ChatMapOverlay = {
    mapId: map.id,
    currentLocationId: null,
    travelMode: 'walk',
    userNodes: [],
    userEdges: [],
    blocked: {},
  };
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

// The we- edge a waypoint placement created to one leaf (C6: direction-free).
const weEdgeTo = (overlay: ChatMapOverlay, wp: string, leaf: string): string => {
  const edge = overlay.userEdges.find(
    (e) => (e.source === wp && e.target === leaf) || (e.source === leaf && e.target === wp),
  );
  if (edge === undefined) throw new Error(`no we- edge between ${wp} and ${leaf}`);
  return edge.id;
};

// FX1's scale shape: canonical unit IS minutes (time-kind, 'min' label), NO
// speeds — the exact D74 reopening shape (D45/D74). Two authored-minutes
// clusters with a gap only a waypoint's `we-` edges can span; node 'e' is a
// dead-end decoy that absorbs the kNN-3 third slot so the bridge is exactly
// b—wp—c (a dead-end leaf can never carry a route).
const honestMinMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-honest-min',
  name: 'Honest Minutes',
  layers: [{ id: 'layer-h', name: 'H' }],
  scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' },
  nodes: [
    { id: 'a', label: 'Alpha', kind: 'location', layer: 'layer-h', position: { x: 0, y: 0 } },
    { id: 'b', label: 'Beta', kind: 'location', layer: 'layer-h', position: { x: 10, y: 0 } },
    { id: 'c', label: 'Gamma', kind: 'location', layer: 'layer-h', position: { x: 90, y: 0 } },
    { id: 'd', label: 'Delta', kind: 'location', layer: 'layer-h', position: { x: 100, y: 0 } },
    { id: 'e', label: 'Epsilon', kind: 'location', layer: 'layer-h', position: { x: 55, y: 0 } },
  ],
  edges: [
    { id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true, authoredMinutes: 10 } } },
    { id: 'e-cd', source: 'c', target: 'd', modes: { walk: { allowed: true, authoredMinutes: 20 } } },
  ],
});

// --- the D74 reopening -----------------------------------------------------------------

describe('D74 — the canonical fallback accepts authored minutes on a time-kind min scale (FX1 shape)', () => {
  it('routes a—d across a waypoint bridge: authored legs verbatim, we- legs geometric, unit min (D74, C14, C7, C15, D72)', () => {
    const { f, overlay } = load(honestMinMap());
    // kNN-3 from (50,0): e (5), b (40), c (40 — stable-sort tie, both make the
    // cut): the bridge spans the gap; a and d get no we- edge of their own.
    f.addUserNodeAt('layer-h', { x: 50, y: 0 });
    const wp = overlay.userNodes[0].id;
    const r = f.findRoute('a', 'd');
    expect(r.ok).toBe(true); // pre-D74 BOTH single-currency runs refused this path (the D74 finding — F26 was inert)
    expect(r.total).toBe(110); // 10 (authored) + 40 + 40 (we- geometry) + 20 (authored) — one honest 'min' total
    expect(r.legs).toEqual([
      { arcId: 'e-ab', from: 'a', to: 'b', mode: 'walk', cost: 10 }, // authored minutes verbatim (C14 row 3, D14)
      { arcId: weEdgeTo(overlay, wp, 'b'), from: 'b', to: wp, mode: 'walk', cost: 40 }, // euclid 40 px × unitPerPx 1 (C14 row 5; C7: the we- edge has no authored values)
      { arcId: weEdgeTo(overlay, wp, 'c'), from: wp, to: 'c', mode: 'walk', cost: 40 },
      { arcId: 'e-cd', from: 'c', to: 'd', mode: 'walk', cost: 20 }, // authored minutes verbatim (C14 row 3, D14)
    ]);
    expect(r.unit).toBe('min'); // D72: the canonical label on a time-min scale — both branches label 'min'
    assertClean(r); // C17
  });

  it('FX1: findRoute to a placed waypoint succeeds — the we- leg prices geometrically under the min label (D74, F10, FX1, C7)', () => {
    const map = JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;
    const { f, overlay } = load(map);
    // Placement at (120,260) — kNN-3 by euclid: emiya-residence (√500 ≈ 22.36),
    // matou-residence (√6100 ≈ 78.10), shopping-district (√6500 ≈ 80.62).
    f.addUserNodeAt('layer-fuyuki', { x: 120, y: 260 });
    const wp = overlay.userNodes[0].id;
    const r = f.findRoute('emiya-residence', wp);
    expect(r.ok).toBe(true); // pre-D74 route-to-waypoint was ALWAYS ok:false on FX1 (the D74 finding)
    expect(r.legs).toHaveLength(1); // the direct we- edge wins: ≈4.47 min vs ≈28.12 via shopping, ≈37.62 via matou
    expect(r.legs[0].arcId).toBe(weEdgeTo(overlay, wp, 'emiya-residence')); // the last (only) leg rides the we- edge
    expect(r.legs[0].mode).toBe('walk');
    expect(r.legs[0].cost).toBeCloseTo(euclid({ x: 100, y: 250 }, { x: 120, y: 260 }) * 0.2, 6); // geometry × unitPerPx (C14 row 5)
    expect(r.total).toBeCloseTo(euclid({ x: 100, y: 250 }, { x: 120, y: 260 }) * 0.2, 6);
    expect(r.unit).toBe('min'); // D72/D74
    assertClean(r); // C17
  });
});

// --- minutes-first stays strict ----------------------------------------------------------

describe('D74 — minutes-first stays strict: the fallback changed, not the preference (D60)', () => {
  it('a minutes-priced route beats a shorter mixed path — the minutes run succeeds and no canonical fallback happens (D60, D74)', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-strict-min',
      name: 'Strict Minutes',
      layers: [{ id: 'layer-s', name: 'S' }],
      scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' }, // FX1's shape, no speeds (D74)
      nodes: [
        { id: 's', label: 'Start', kind: 'location', layer: 'layer-s', position: { x: 0, y: 0 } },
        { id: 'm', label: 'Middle', kind: 'location', layer: 'layer-s', position: { x: 10, y: 0 } },
        { id: 't', label: 'Terminal', kind: 'location', layer: 'layer-s', position: { x: 30, y: 0 } },
      ],
      edges: [
        { id: 'e-st', source: 's', target: 't', modes: { walk: { allowed: true, authoredMinutes: 50 } } }, // the pure minutes path
        { id: 'e-sm', source: 's', target: 'm', modes: { walk: { allowed: true, authoredMinutes: 10 } } },
        { id: 'e-mt', source: 'm', target: 't', modes: { walk: { allowed: true } } }, // geometric 20 — the mixed path costs 10 + 20 = 30 in the honest canonical read
      ],
    };
    const { f } = load(map);
    const r = f.findRoute('s', 't');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(50); // the MINUTES route — the mixed path (30) would win if the fallback ran or minutes leaked
    expect(r.legs).toEqual([{ arcId: 'e-st', from: 's', to: 't', mode: 'walk', cost: 50 }]); // D60 preference semantics verbatim
    expect(r.unit).toBe('min'); // D72 — the run priced minutes
    assertClean(r); // C17
  });
});

// --- distance-kind strictness preserved ---------------------------------------------------

describe('D74 — distance-kind strictness preserved: the interleaving refusal stands (D74 carve-out, C15, C17)', () => {
  it('authoredMinutes a—b + geometric b—c on a distance-kind scale ⇒ still ok:false, canonical label, human reason (D74, D60, C17, D72)', () => {
    // Mirrors tests/verify/p2m2-route-currency-adversarial.spec.ts:99 (the
    // league-map pin, untouched) — the unit-level twin of the same case.
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-league',
      name: 'Leagues',
      layers: [{ id: 'layer-l', name: 'L' }],
      scale: { unitPerPx: 0.5, unitLabel: 'league', unitKind: 'distance' },
      nodes: [
        { id: 'a', label: 'Alpha', kind: 'location', layer: 'layer-l', position: { x: 0, y: 0 } },
        { id: 'b', label: 'Beta', kind: 'location', layer: 'layer-l', position: { x: 10, y: 0 } },
        { id: 'c', label: 'Gamma', kind: 'location', layer: 'layer-l', position: { x: 50, y: 0 } },
      ],
      edges: [
        { id: 'e-ab-min', source: 'a', target: 'b', modes: { walk: { allowed: true, authoredMinutes: 10 } } },
        { id: 'e-bc', source: 'b', target: 'c', modes: { walk: { allowed: true } } },
      ],
    };
    const { f } = load(map);
    const r = f.findRoute('a', 'c');
    expect(r.ok).toBe(false); // the helper no-ops off the time-min shape — the strict D60 filter verbatim (D74)
    expect(r.total).toBe(0); // F24/C17: no costs presented
    expect(r.legs).toEqual([]);
    expect(r.reason).toMatch(/blocked or disallowed/); // connected in principle — the weight-1 probe succeeds (C17)
    expect(r.unit).toBe('league'); // D72: the LAST attempted run was canonical — scale.unitLabel verbatim
    assertClean(r); // C17
  });
});

// --- ok:false unchanged on a time-kind map --------------------------------------------------

describe('D74 — ok:false is unchanged: disconnection still yields the human reason, no costs (C17, F24)', () => {
  it('a genuinely disconnected pair on a time-kind min map: labels, total 0, empty legs, no ∞ (C17, F24, C23, D72)', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-island-min',
      name: 'Islands (time)',
      layers: [{ id: 'layer-i', name: 'I' }],
      scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' },
      nodes: [
        { id: 'a', label: 'Alpha Hamlet', kind: 'location', layer: 'layer-i', position: { x: 0, y: 0 } },
        { id: 'b', label: 'Beta Rise', kind: 'location', layer: 'layer-i', position: { x: 10, y: 0 } },
        { id: 'c', label: 'Gamma Ford', kind: 'location', layer: 'layer-i', position: { x: 200, y: 0 } },
        { id: 'd', label: 'Delta Reach', kind: 'location', layer: 'layer-i', position: { x: 210, y: 0 } },
      ],
      edges: [
        { id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
        { id: 'e-cd', source: 'c', target: 'd', modes: { walk: { allowed: true, authoredMinutes: 6 } } },
      ],
    };
    const { f } = load(map);
    const r = f.findRoute('a', 'd');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Alpha Hamlet'); // C23: human labels, never machine ids
    expect(r.reason).toContain('Delta Reach');
    expect(r.total).toBe(0); // F24/C17: no cost is presented
    expect(r.legs).toEqual([]);
    expect(r.unit).toBe('min'); // D72: both runs label 'min' on this scale
    assertClean(r); // C17: ∞ nowhere
  });
});
