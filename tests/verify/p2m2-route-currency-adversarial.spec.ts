// P2 M2 gate — adversarial route-currency suite (verifier, PKG D-P2M2).
// Expectations derived from CORE.md C2/C15/C17/C18/C19/C23, PRODUCT.md
// F14/F23/F24/F32, and register D60/D65(b)/D72 — never from the implementation.
// Every expected value is hand-computed from data/worlds/fuyuki.ts (FX1) or
// from the inline maps built below.
//
// The M2 route sidebar and cross-layer badges display findRoute numbers, so
// D72's unit label is load-bearing UI data: this suite attacks every branch of
// the rule ('min' when the run priced minutes, else scale.unitLabel), the
// snapshot-vs-findRoute currency DIVERGENCE that motivated D72 (each seam must
// label with ITS OWN run's currency), and the C2/D65(b) blocked-arc precedence
// battery the sidebar's "Blocked here" section renders.
import { describe, expect, it } from 'vitest';
import { createFacade } from '../../src/core/facade';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

// FX1 thawed per facade (C24: the facade keeps the live reference).
const loadFuyuki = (travelMode: ChatMapOverlay['travelMode'] = 'walk') => {
  const map = JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;
  const overlay: ChatMapOverlay = {
    mapId: map.id,
    currentLocationId: 'emiya-residence',
    travelMode,
    userNodes: [],
    userEdges: [],
    blocked: {}, nodeBlocked: {},
  };
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return f;
};

const overlayOf = (map: WorldMapData, pin: string | null): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: pin,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {}, nodeBlocked: {},
});

const load = (map: WorldMapData, pin: string | null = null) => {
  const f = createFacade();
  f.loadMap(map, overlayOf(map, pin));
  f.materialize();
  return f;
};

// C17 deep scan: ∞ never appears in any output object, in any spelling.
const assertNoInfinity = (value: unknown): void => {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) value.forEach(assertNoInfinity);
  else if (value !== null && typeof value === 'object') Object.values(value).forEach(assertNoInfinity);
};
const assertClean = (r: unknown): void => {
  const json = JSON.stringify(r);
  expect(json).not.toContain('Infinity');
  expect(json).not.toContain('∞');
  assertNoInfinity(r);
};

// ---------------------------------------------------------------------------
// D72 — the canonical label is scale.unitLabel VERBATIM, on every branch.
// The implementer suite pins 'km'; these pin a non-'km' label and a hybrid
// graph, so a hardcoded 'km'/'min' (or "min whenever any arc has authored
// minutes") mutant cannot pass.
// ---------------------------------------------------------------------------

const leagueMap = (): WorldMapData => ({
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
    // authored DISTANCE (C14 row 4) — canonical currency, no speeds anywhere
    { id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true } }, authoredDistance: 3 },
  ],
});

describe('D72 — canonical label is scale.unitLabel verbatim (C15/D72)', () => {
  it("an authored-distance run on a 'league' map labels 'league', not 'km'/min (D72, C14 row 4)", () => {
    const r = load(leagueMap()).findRoute('a', 'b');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(3); // authored distance wins over geometry (D14) — canonical units
    expect(r.unit).toBe('league');
    assertClean(r);
  });

  it("ok:false on a hybrid map: minutes-priced arcs EXIST in the graph, but the label is still the canonical 'league' (D72 last-attempted-run rule)", () => {
    // a—b authoredMinutes 10 (minutes), b—c geometric only (canonical): the one
    // path interleaves currencies, so no uniform-currency route exists (D60's
    // own consequence case) — minutes ran first AND failed; canonical ran last.
    const map = leagueMap();
    map.edges = [
      { id: 'e-ab-min', source: 'a', target: 'b', modes: { walk: { allowed: true, authoredMinutes: 10 } } },
      { id: 'e-b-c', source: 'b', target: 'c', modes: { walk: { allowed: true } } },
    ];
    const r = load(map).findRoute('a', 'c');
    expect(r.ok).toBe(false);
    expect(r.total).toBe(0);
    expect(r.legs).toEqual([]);
    expect(r.unit).toBe('league'); // the LAST attempted run was canonical — its label wins
    expect(r.reason).toMatch(/blocked or disallowed/);
    assertClean(r);
  });
});

// ---------------------------------------------------------------------------
// D72's motivating divergence: MapSnapshot.unit (D65: pin-incident-based) and
// RouteResult.unit (D60: path-based minutes-first) computed on the SAME map.
// The M2 UI reads both (header vs route total / badge); each must carry its
// OWN source's label — 'km' and 'min' coexist honestly on one map.
// ---------------------------------------------------------------------------

// Pinland: pin p is incident to a minutes arc AND a canonical arc; the pin's
// snapshot is canonical (D65(a): not every live incident arc prices minutes),
// while the p→t path is pure minutes (D60: minutes-first finds it).
const pinland = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-pinland',
  name: 'Pinland',
  layers: [{ id: 'layer-p', name: 'P' }],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
  nodes: [
    { id: 'p', label: 'Pier', kind: 'location', layer: 'layer-p', position: { x: 0, y: 0 } },
    { id: 'm1', label: 'Milltown', kind: 'location', layer: 'layer-p', position: { x: 0, y: 10 } },
    { id: 'g1', label: 'Gorse Hill', kind: 'location', layer: 'layer-p', position: { x: 3, y: 4 } },
    { id: 't', label: 'Tarn', kind: 'location', layer: 'layer-p', position: { x: 0, y: 20 } },
  ],
  edges: [
    { id: 'e-p-m1', source: 'p', target: 'm1', modes: { walk: { allowed: true, authoredMinutes: 10 } } },
    { id: 'e-p-g1', source: 'p', target: 'g1', modes: { walk: { allowed: true } } }, // geometric 3-4-5 ⇒ 5 km
    { id: 'e-m1-t', source: 'm1', target: 't', modes: { walk: { allowed: true, authoredMinutes: 7 } } },
  ],
});

describe('D72 divergence — snapshot.unit and findRoute unit disagree, each labeled by its own run (D65 vs D60, C15)', () => {
  it("the pin's snapshot is canonical ('km') while findRoute(p→t) priced minutes ('min') — same map, same facade (D65(a), D60, D72)", () => {
    const f = load(pinland(), 'p');
    const snap = f.getSnapshot();
    expect(snap.unit).toBe('km'); // D65(a): a live geometric incident arc forces canonical
    const route = f.findRoute('p', 't');
    expect(route.ok).toBe(true);
    expect(route.total).toBe(17); // 10 + 7 authored minutes — D60 minutes-first finds the pure-minutes path
    expect(route.unit).toBe('min'); // D72: the ROUTE's own run priced minutes
    assertClean(route);
  });

  it('p→g1 (canonical-only corridor) falls back whole: 5 km, never a mixed 10-min+5-km total (D60 fallback, C15)', () => {
    const f = load(pinland(), 'p');
    const r = f.findRoute('p', 'g1');
    expect(r.ok).toBe(true); // direct geometric arc — the whole computation re-ran in canonical units
    expect(r.total).toBe(5);
    expect(r.unit).toBe('km');
  });
});

// ---------------------------------------------------------------------------
// D65(b) — a blocked incident arc is exempt from currency exclusion in a
// CANONICAL snapshot: it always lists, prices best-effort or cost 0 with its
// first allowed mode, and the reason (not the cost) is the payload (C2).
// FX1's blocked bridge is minutes-clean, so this needs a map where the blocked
// arc is UNPRICEABLE in the snapshot's canonical currency.
// ---------------------------------------------------------------------------

const tollgate = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-tollgate',
  name: 'Tollgate',
  layers: [{ id: 'layer-t', name: 'T' }],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
  nodes: [
    { id: 'q', label: 'Quay', kind: 'location', layer: 'layer-t', position: { x: 0, y: 0 } },
    { id: 'r', label: 'Ridge', kind: 'location', layer: 'layer-t', position: { x: 3, y: 4 } },
    { id: 'w', label: 'Weir', kind: 'location', layer: 'layer-t', position: { x: 0, y: 9 } },
  ],
  edges: [
    { id: 'e-q-r', source: 'q', target: 'r', modes: { walk: { allowed: true } } }, // live geometric 5 km
    // blocked, walk-only, authoredMinutes-only: unpriceable in canonical — the
    // D65(b) fallback shape (cost 0 + first allowed mode), reason kept (C2)
    {
      id: 'e-q-w',
      source: 'q',
      target: 'w',
      modes: { walk: { allowed: true, authoredMinutes: 9 } },
      blocked: { reason: 'Toll boycott' },
    },
  ],
});

describe('D65(b) — a blocked incident arc lists in a canonical snapshot with cost 0, first allowed mode, and its reason (C2, C19)', () => {
  it('the blocked arc never constrains the currency and never disappears (D65(b), C2)', () => {
    const snap = load(tollgate(), 'q').getSnapshot();
    expect(snap.unit).toBe('km'); // forced by the live geometric arc — the blocked arc did not vote
    const labels = snap.routes.map((route) => route.label);
    expect(labels).toContain('Ridge');
    expect(labels).toContain('Weir'); // C2: blocked ≠ hidden — always listed
    const weir = snap.routes.find((route) => route.label === 'Weir')!;
    expect(weir.blockedReason).toBe('Toll boycott'); // the reason is the payload (D65(b))
    expect(weir.cost).toBe(0); // unpriceable in canonical ⇒ cost 0, never ∞ (C17)
    expect(weir.mode).toBe('walk'); // first allowed mode in the fixed walk/car/train order
    assertClean(snap);
  });
});

// ---------------------------------------------------------------------------
// FX1 blocked-bridge precedence battery — the exact state machine the M2 arc
// panel and "Blocked here" section render (C2, D20, C19).
// Hand-derived from FX1: the bridge arc is authored-blocked
// ('Bridge closed by local authorities'); the pin's cheapest detour to the
// bridge node is emiya→shopping(12)→bridge(15) = 27.
// ---------------------------------------------------------------------------

describe('FX1 blocked precedence — restate wins, lift-of-authored is a no-op, routing stays excluded (C2, D20, C19)', () => {
  it('the authored block lists in the snapshot with its reason, priced best-effort at 25 walk (C2, C19, D65(b))', () => {
    const snap = loadFuyuki().getSnapshot();
    const bridge = snap.routes.find((route) => route.label === 'Fuyuki Bridge')!;
    expect(bridge.blockedReason).toBe('Bridge closed by local authorities');
    expect(bridge.cost).toBe(25); // authored walk minutes, best-effort in the minutes snapshot
    expect(bridge.mode).toBe('walk');
  });

  it('an overlay block RESTATES the authored reason in the snapshot (D20 "adds or restates only")', () => {
    const f = loadFuyuki();
    f.setBlocked('arc-emiya-residence-fuyuki-bridge', 'Storm damage');
    const bridge = f.getSnapshot().routes.find((route) => route.label === 'Fuyuki Bridge')!;
    expect(bridge.blockedReason).toBe('Storm damage'); // the overlay's reason wins the merge
  });

  it('lift-of-authored: the overlay entry deletes, the AUTHORED reason returns, and routing STILL excludes the arc (C2, facade contract)', () => {
    const f = loadFuyuki();
    f.setBlocked('arc-emiya-residence-fuyuki-bridge', 'Storm damage');
    f.setBlocked('arc-emiya-residence-fuyuki-bridge', undefined); // lift — overlay-only
    const bridge = f.getSnapshot().routes.find((route) => route.label === 'Fuyuki Bridge')!;
    expect(bridge.blockedReason).toBe('Bridge closed by local authorities'); // authored survived
    // routing never unblocked: cheapest live path is 12 + 15 = 27, not the blocked 25
    const r = f.findRoute('emiya-residence', 'fuyuki-bridge');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(27);
    expect(r.legs.map((leg) => leg.arcId)).not.toContain('arc-emiya-residence-fuyuki-bridge'); // C2: excluded
    assertClean(r);
  });

  it('an overlay block on the FX2 first leg reroutes around it and never traverses the blocked arc (C2, FX2)', () => {
    const f = loadFuyuki();
    f.setBlocked('arc-emiya-residence-fuyuki-station', 'Strike');
    const r = f.findRoute('emiya-residence', 'misaki-town');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(352); // 12 (shopping) + 15 (shopping→bridge) + 25 (bridge→station) + 300 (train)
    expect(r.legs.map((leg) => leg.arcId)).not.toContain('arc-emiya-residence-fuyuki-station');
    expect(r.unit).toBe('min');
    assertClean(r);
  });
});

// ---------------------------------------------------------------------------
// C17/C23 — the reason strings themselves, and the ∞ battery.
// ---------------------------------------------------------------------------

describe('C17/C23 — unreachable reasons are human-readable and carry LABELS, never ids or ∞ (C17, C23, F24)', () => {
  const islandMap = (): WorldMapData => ({
    schemaVersion: 2,
    id: 'map-islands',
    name: 'Islands',
    layers: [{ id: 'layer-i', name: 'I' }],
    scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
    nodes: [
      { id: 'a', label: 'Alpha Hamlet', kind: 'location', layer: 'layer-i', position: { x: 0, y: 0 } },
      { id: 'z', label: 'Omega Reach', kind: 'location', layer: 'layer-i', position: { x: 90, y: 90 } },
    ],
    edges: [],
  });

  it("a disconnected pair's reason names both LABELS — the machine ids never surface (C17, C23)", () => {
    const r = load(islandMap()).findRoute('a', 'z');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Alpha Hamlet');
    expect(r.reason).toContain('Omega Reach');
    expect(r.reason).not.toMatch(/'a'/); // the raw machine id never appears as a quoted token (C23)
    expect(r.reason).not.toMatch(/'z'/);
    assertClean(r);
  });

  it('the blocked-out reason on FX1 is the connected-but-severed shape (C17, C2)', () => {
    const f = loadFuyuki();
    f.setBlocked('arc-outskirts-einzbern-castle', 'Rockslide'); // sole arc into the castle
    const r = f.findRoute('emiya-residence', 'einzbern-castle');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/blocked or disallowed/);
    assertClean(r);
  });

  it('∞ battery: ok routes, canonical routes, unreachables and snapshots all stay finite (C17)', () => {
    const f1 = loadFuyuki();
    assertClean(f1.findRoute('emiya-residence', 'misaki-town')); // FX2
    assertClean(f1.getSnapshot());
    f1.setBlocked('arc-outskirts-einzbern-castle', 'Rockslide');
    assertClean(f1.findRoute('emiya-residence', 'einzbern-castle'));
    assertClean(f1.findRoute('misaki-town', 'einzbern-castle')); // cross-layer unreachable
    assertClean(load(leagueMap()).findRoute('a', 'b'));
    assertClean(load(pinland(), 'p').getSnapshot());
    assertClean(load(tollgate(), 'q').getSnapshot());
  });
});

// ---------------------------------------------------------------------------
// C30 — the reason/endpoint argument discipline the M2 arc panel leans on.
// ---------------------------------------------------------------------------

describe('C30 — setBlocked/findRoute argument discipline at the M2 seams (C30, F50)', () => {
  it('an empty-string reason is refused — never a silent clear (C30)', () => {
    const f = loadFuyuki();
    expect(() => f.setBlocked('arc-fuyuki-station-harbor', '')).toThrow(/non-empty/);
  });

  it('a runtime-lie null reason is refused field-precisely (C30/F50)', () => {
    const f = loadFuyuki();
    expect(() => f.setBlocked('arc-fuyuki-station-harbor', null as unknown as string)).toThrow(/non-empty/);
  });

  it('an unknown edge id is refused, and the overlay is untouched (C30)', () => {
    const f = loadFuyuki();
    expect(() => f.setBlocked('no-such-arc', 'x')).toThrow(/unknown edge id/);
    expect(() => f.getSnapshot()).not.toThrow();
  });

  it('unknown route endpoints throw before any from===to shortcut (C30)', () => {
    const f = loadFuyuki();
    expect(() => f.findRoute('emiya-residence', 'no-such-node')).toThrow(/unknown node id 'no-such-node'/);
    expect(() => f.findRoute('no-such-node', 'emiya-residence')).toThrow(/unknown node id 'no-such-node'/);
    expect(() => f.findRoute('no-such-node', 'no-such-node')).toThrow(/unknown node id/);
  });
});
