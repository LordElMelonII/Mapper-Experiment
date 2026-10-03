// M2 gate — adversarial routing suite (verifier, PKG D-M2).
// Expectations re-derived from the spec, never from the implementation: D60(a)
// preference-beats-price and strict-filter semantics, D60(b)/C15 currency
// discipline (D60's own consequence clause: a path mixing authored-time arcs
// with unconverted geometric arcs yields ok:false, never a mixed total), C6
// leg orientation on the reverse FX2 route, §6.2 routing-level terrain and
// zero-distance rules, C17 ∞-never-in-output deep scans, C8 query purity.
// Every expected value below is hand-computed from data/worlds/fuyuki.ts (FX1)
// or from the inline maps built here.
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const loadFuyuki = (travelMode: ChatMapOverlay['travelMode'] = 'walk') => {
  const map = fuyuki();
  const overlay: ChatMapOverlay = {
    mapId: map.id,
    currentLocationId: null,
    travelMode,
    userNodes: [],
    userEdges: [],
    blocked: {},
  };
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

// C17 deep scan: no Infinity anywhere in an output object.
const assertNoInfinity = (value: unknown): void => {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) value.forEach(assertNoInfinity);
  else if (value !== null && typeof value === 'object') Object.values(value).forEach(assertNoInfinity);
};

// --- D60(a): preference beats price within a currency (D60, D19, C15) -----------------
//
// FX1's arc-outskirts-einzbern-castle allows walk (authoredMinutes 240) AND car
// (authoredMinutes 60) — re-derived from the fixture. With travelMode 'walk'
// the default MUST price the arc at 240 in walk; switching to the cheaper car
// would violate D60a ("preference beats price within a currency").

describe('D60(a) — the default prefers overlay.travelMode over the cheaper mode (D60, D19)', () => {
  it('travelMode walk ⇒ outskirts→einzbern costs 240 on foot, NOT 60 by car (D60a)', () => {
    const { f } = loadFuyuki('walk');
    const r = f.findRoute('outskirts', 'einzbern-castle');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(240); // a price-first implementation would return 60 — this line is the trap
    expect(r.legs).toEqual([
      { arcId: 'arc-outskirts-einzbern-castle', from: 'outskirts', to: 'einzbern-castle', mode: 'walk', cost: 240 },
    ]);
  });

  it('travelMode car ⇒ the same arc prices 60 by car (preference follows the chat setting, D19/D60a)', () => {
    const { f } = loadFuyuki('car');
    const r = f.findRoute('outskirts', 'einzbern-castle');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(60);
    expect(r.legs[0].mode).toBe('car');
  });

  it('FX2 with travelMode car: car is absent on both arcs ⇒ cheapest-allowed fallback per leg, still 350 walk+train (D60a, FX2)', () => {
    const { f } = loadFuyuki('car');
    const r = f.findRoute('emiya-residence', 'misaki-town');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(350);
    expect(r.legs.map((l) => [l.mode, l.cost])).toEqual([
      ['walk', 50], // car not offered on the arc — D60a fallback, NOT a strict filter
      ['train', 300],
    ]);
  });

  it("the DEFAULT is preference+fallback, not a strict filter: travelMode train still routes FX2 (D60a vs C14 row 2)", () => {
    const { f } = loadFuyuki('train');
    const r = f.findRoute('emiya-residence', 'misaki-town');
    // Strict-filter semantics (C14 row 2, the explicit-argument rule) would make
    // this ok:false — no train arc leaves the Emiya Residence. D60a's default
    // falls back to the cheapest allowed mode per arc instead.
    expect(r.ok).toBe(true);
    expect(r.total).toBe(350);
    expect(r.legs.map((l) => l.mode)).toEqual(['walk', 'train']);
  });
});

// --- D60(b)/C15: one currency per computation, minutes first ---------------------------
//
// D60's consequence clause, verbatim: "a map whose only path mixes
// authored-time arcs with unconverted geometric arcs yields ok:false rather
// than a meaningless mixed total". The unit suite severs both corridors at the
// origin; this map interleaves them WITHIN the single path (a–b authored 10,
// b–c geometric only, c–d authored 5), so no uniform-currency route exists at
// all and a mixing implementation would happily return 15+something.

const interleaved = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-interleaved',
  name: 'Interleaved Currency',
  layers: [{ id: 'layer-i', name: 'Interleaved' }],
  scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' },
  nodes: [
    { id: 'a', label: 'A', kind: 'location', layer: 'layer-i', position: { x: 0, y: 0 } },
    { id: 'b', label: 'B', kind: 'location', layer: 'layer-i', position: { x: 0, y: 10 } },
    { id: 'c', label: 'C', kind: 'location', layer: 'layer-i', position: { x: 10, y: 10 } },
    { id: 'd', label: 'D', kind: 'location', layer: 'layer-i', position: { x: 10, y: 0 } },
  ],
  edges: [
    { id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true, authoredMinutes: 10 } } },
    { id: 'e-bc', source: 'b', target: 'c', modes: { walk: { allowed: true } } }, // geometric only — no authored values, no speeds
    { id: 'e-cd', source: 'c', target: 'd', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
  ],
});

const loadInterleaved = () => {
  const map = interleaved();
  const f = createFacade();
  f.loadMap(map, {
    mapId: map.id,
    currentLocationId: 'a',
    travelMode: 'walk',
    userNodes: [],
    userEdges: [],
    blocked: {},
  });
  f.materialize();
  return f;
};

describe('D60(b)/C15 — a path that interleaves minutes-priced and canonical arcs is unroutable (D60, C15, C17)', () => {
  it('ok:false with the disallowed reason; never a mixed total, never Infinity (D60, C15, C17)', () => {
    const f = loadInterleaved();
    const r = f.findRoute('a', 'd');
    expect(r.ok).toBe(false);
    expect(r.total).toBe(0);
    expect(r.legs).toEqual([]);
    // the currency exclusion counts as "disallowed" (D60b); the weight-1 probe
    // proves the graph is connected in principle (C17 reason distinction)
    expect(r.reason).toMatch(/blocked or disallowed/);
    const json = JSON.stringify(r);
    expect(json).not.toContain('Infinity'); // C17: ∞ never appears in any output
    assertNoInfinity(r);
  });

  it('the explicit-mode variant is gated identically (D60b)', () => {
    const f = loadInterleaved();
    const r = f.findRoute('a', 'd', 'walk');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/blocked or disallowed/);
    expect(JSON.stringify(r)).not.toContain('Infinity');
  });
});

// --- §6.2 routing-level: authored time never accrues terrain (§6.2, C14 row 3) ---------

describe('§6.2 at the route level — authored-time legs must not accrue terrain multipliers (§6.2, C14 row 3, D14)', () => {
  it('a mountain-terrain authored-minutes edge routes at its authored value end-to-end (§6.2)', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-mountain-time',
      name: 'Mountain Time',
      layers: [{ id: 'layer-m', name: 'M' }],
      // geometric term would be 100 px × 1 = 100 units; terrain ×2.5 ⇒ 250 —
      // any of those leaking into the total means the route is NOT pricing
      // through edgeCost's row 3 (D14/§6.2).
      scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time', terrainMultipliers: { mountain: 2.5 } },
      nodes: [
        { id: 'a', label: 'A', kind: 'location', layer: 'layer-m', position: { x: 0, y: 0 } },
        { id: 'b', label: 'B', kind: 'location', layer: 'layer-m', position: { x: 100, y: 0 } },
      ],
      edges: [
        { id: 'e-ab', source: 'a', target: 'b', terrain: 'mountain', modes: { walk: { allowed: true, authoredMinutes: 30 } } },
      ],
    };
    const f = createFacade();
    f.loadMap(map, { mapId: map.id, currentLocationId: 'a', travelMode: 'walk', userNodes: [], userEdges: [], blocked: {} });
    f.materialize();
    const r = f.findRoute('a', 'b');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(30); // verbatim — not 75 (×2.5 on time) and not 250 (geometric × terrain)
    expect(r.legs[0].cost).toBe(30);
  });
});

// --- §6.2 zero-distance nodes at the route level (§6.2, C14 row 5) ---------------------

describe('§6.2 — zero-distance nodes route at cost 0, not ∞ (§6.2, C14 row 5)', () => {
  const zeroDistance = (withEdge: boolean): WorldMapData => ({
    schemaVersion: 2,
    id: 'map-zero',
    name: 'Zero Distance',
    layers: [{ id: 'layer-z', name: 'Z' }],
    scale: { unitPerPx: 2, unitLabel: 'km', unitKind: 'distance' },
    nodes: [
      { id: 'a', label: 'A', kind: 'location', layer: 'layer-z', position: { x: 5, y: 5 } },
      { id: 'b', label: 'B', kind: 'location', layer: 'layer-z', position: { x: 5, y: 5 } }, // co-located
    ],
    edges: withEdge
      ? [{ id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true } } }]
      : [],
  });

  it('co-located nodes with an unauthored arc ⇒ ok:true, total 0 (§6.2)', () => {
    const map = zeroDistance(true);
    const f = createFacade();
    f.loadMap(map, { mapId: map.id, currentLocationId: 'a', travelMode: 'walk', userNodes: [], userEdges: [], blocked: {} });
    f.materialize();
    const r = f.findRoute('a', 'b');
    expect(r).toEqual({
      ok: true,
      total: 0,
      legs: [{ arcId: 'e-ab', from: 'a', to: 'b', mode: 'walk', cost: 0 }],
    });
    expect(JSON.stringify(r)).not.toContain('Infinity'); // C17
  });

  it('co-located nodes WITHOUT an arc ⇒ ok:false + human reason (C17, §6.2)', () => {
    const map = zeroDistance(false);
    const f = createFacade();
    f.loadMap(map, { mapId: map.id, currentLocationId: 'a', travelMode: 'walk', userNodes: [], userEdges: [], blocked: {} });
    f.materialize();
    const r = f.findRoute('a', 'b');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no path connects 'A' and 'B'/);
    expect(JSON.stringify(r)).not.toContain('Infinity');
  });
});

// --- C6/C18: the reverse FX2 route — legs must come back in travel order ---------------

describe('C6/C18 — FX2 in reverse: bidirectional arcs, travel-ordered legs (C6, C18, FX2)', () => {
  it('misaki → emiya costs 350 with the legs REVERSED (train 300 then walk 50), correct from/to orientation (C6, C18, FX2)', () => {
    const { f } = loadFuyuki('walk');
    const r = f.findRoute('misaki-town', 'emiya-residence');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(350);
    expect(r.legs).toEqual([
      { arcId: 'arc-fuyuki-station-misaki-town', from: 'misaki-town', to: 'fuyuki-station', mode: 'train', cost: 300 },
      { arcId: 'arc-emiya-residence-fuyuki-station', from: 'fuyuki-station', to: 'emiya-residence', mode: 'walk', cost: 50 },
    ]);
  });
});

// --- C8: findRoute is a pure query -------------------------------------------------------

describe('C8 — findRoute mutates nothing and is idempotent (C8, packet A-006 query rule)', () => {
  it('map and overlay are byte-identical after a findRoute that consumed a stale flag; a double call returns the same result (C8)', () => {
    const { f, map, overlay } = loadFuyuki('walk');
    f.setBlocked('arc-emiya-residence-fuyuki-station', 'strike'); // mutation ⇒ stale
    const afterMutation = JSON.stringify([map, overlay]);
    expect(facadeStateOf(f).stale).toBe(true);

    const first = f.findRoute('emiya-residence', 'misaki-town');
    expect(facadeStateOf(f).stale).toBe(false); // ensureFresh consumed the flag (C8)
    expect(JSON.stringify([map, overlay])).toBe(afterMutation); // the query touched no plane (R1/R4)

    const second = f.findRoute('emiya-residence', 'misaki-town');
    expect(second).toEqual(first); // idempotent — no state drift between calls (C8)
    expect(first.total).toBe(352); // hand-computed reroute: 12 + 15 + 25 + 300
  });
});
