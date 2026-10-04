// buildSnapshot unit tests (PKG A-008): the C19 neighborhood exactness (incl.
// cross-layer inclusion and the D36 sibling exclusion), the C23 exclusions,
// the C2 blocked-reason passthrough, the C27 degradation shapes, the C10
// direction rules, the D65 routes currency, and the C20/D25 destinations
// (first-leg via/mode, ok:false dropped, cap 12 + destinationsTruncated).
// priceEdge/routeTo are injected — the facade recipe (D65: block-stripped
// honest pricing at ONE currency, null only for a LIVE arc unpriceable there,
// blocked arcs never null) is replicated here so the blocked-arc and currency
// rulings are pinned at builder level.
import { describe, expect, it } from 'vitest';
import { buildSnapshot, DESTINATIONS_CAP } from '../../../src/core/snapshot/build';
import { buildEffectiveGraph } from '../../../src/core/model/effective';
import { priceEdgeIn } from '../../../src/core/routing/price';
import type { CostCurrency } from '../../../src/core/routing/price';
import type {
  ChatMapOverlay,
  MapEdgeData,
  MapNodeData,
  RouteResult,
  TravelMode,
  WorldMapData,
} from '../../../src/core/api';

const overlayFor = (map: WorldMapData, pin: string | null, extra: Partial<ChatMapOverlay> = {}): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: pin,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {},
  ...extra,
});

// D72: ok:false stub — buildSnapshot reads only ok/total/legs, so the label is
// inert at this seam; a fixed canonical-style label keeps the literal honest.
const neverRoute = (): RouteResult => ({ ok: false, total: 0, legs: [], unit: 'km' });

// The facade's getSnapshot recipe (facade.ts, D65): price at ONE currency with
// the block stripped (C2 — the ∞ sentinel never surfaces, C17); honest on a
// minutes-canonical map (D65(a) — authored minutes are canonical minutes when
// unitKind is 'time' and the label is 'min'); null ONLY for a LIVE arc that
// cannot honestly price in that currency (D65(a)); a BLOCKED arc never returns
// null — best-effort price, else cost 0 with its cheapest allowed mode
// (D65(b) — the reason carries the meaning).
const facadeStylePriceEdge =
  (map: WorldMapData, currency: CostCurrency) =>
  (edge: MapEdgeData): { mode: TravelMode; cost: number } | null => {
    const positions = new Map(map.nodes.map((n) => [n.id, n.position] as const));
    const positionOf = (id: string): { x: number; y: number } | undefined => positions.get(id);
    const modes: readonly TravelMode[] = ['walk', 'car', 'train'];
    const price = (inCurrency: CostCurrency): { mode: TravelMode; cost: number } =>
      priceEdgeIn({ ...edge, blocked: undefined }, inCurrency, modes, 'walk', map.scale, positionOf);
    let priced = price(currency);
    if (
      !Number.isFinite(priced.cost) &&
      currency === 'canonical' &&
      map.scale.unitKind === 'time' &&
      map.scale.unitLabel === 'min'
    ) {
      priced = price('minutes'); // D65(a) honesty: the canonical unit IS minutes on such a map
    }
    if (Number.isFinite(priced.cost)) return priced;
    if (edge.blocked !== undefined) {
      return { mode: modes.filter((m) => edge.modes[m]?.allowed === true)[0] ?? 'walk', cost: 0 }; // D65(b)
    }
    return null; // D65(a): a live arc that cannot honestly price drops
  };

const build = (
  map: WorldMapData,
  overlay: ChatMapOverlay,
  priceEdge: (edge: MapEdgeData) => { mode: TravelMode; cost: number } | null,
  routeTo: (nodeId: string) => RouteResult = neverRoute,
) => buildSnapshot(map, overlay, buildEffectiveGraph(map, overlay), priceEdge, routeTo);

// --- C27/C23 degradation ----------------------------------------------------------------

describe('buildSnapshot — C27/C23 degradation (never throws for pin state)', () => {
  const map = (): WorldMapData => ({
    schemaVersion: 2,
    id: 'map-degrade',
    name: 'Degrade',
    layers: [{ id: 'layer-top', name: 'Topside' }],
    scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
    nodes: [{ id: 'pin', label: 'The Pin', kind: 'location', layer: 'layer-top', position: { x: 0, y: 0 } }],
    edges: [],
  });

  it('pin null ⇒ the degraded shape, statusNote/corrective passthrough (C27, D63)', () => {
    const m = map();
    const overlay = overlayFor(m, null, { statusNote: 'on the road', corrective: 'corr line' });
    expect(build(m, overlay, () => null)).toEqual({
      location: null,
      region: null,
      layer: '',
      routes: [],
      destinations: [],
      destinationsTruncated: false,
      unit: 'km', // degraded unit = the canonical unitLabel (ruling)
      statusNote: 'on the road',
      corrective: 'corr line',
    });
  });

  it('pin on a deleted node ⇒ degraded, never a snap to a neighbor (C27/D39)', () => {
    const m = map();
    const overlay = overlayFor(m, 'ghost');
    const snap = build(m, overlay, () => null);
    expect(snap.location).toBeNull();
    expect(snap.routes).toEqual([]);
    expect(snap.destinations).toEqual([]);
  });

  it('pin on a container (ineligible per D58) ⇒ degraded (C27)', () => {
    const m = map();
    (m.nodes[0] as MapNodeData).kind = 'district'; // the pinned node became ineligible
    const overlay = overlayFor(m, 'pin');
    expect(build(m, overlay, () => null).location).toBeNull();
  });

  it('pin on an unnamed user waypoint ⇒ degraded (C23)', () => {
    const m = map();
    const overlay = overlayFor(m, 'wp-1', {
      userNodes: [{ id: 'wp-1', label: 'Waypoint', kind: 'waypoint', layer: 'layer-top', origin: 'user' }],
    });
    expect(build(m, overlay, () => null)).toEqual({
      location: null,
      region: null,
      layer: '',
      routes: [],
      destinations: [],
      destinationsTruncated: false,
      unit: 'km',
    });
  });
});

// --- named pin: region/layer + the C19 neighborhood (C19, C23, D36, C2, C10) --------------

const neighborhoodMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-neigh',
  name: 'Neighborhood',
  layers: [
    { id: 'layer-top', name: 'Topside' },
    { id: 'layer-under', name: 'Undercity' },
  ],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
  nodes: [
    { id: 'district', label: 'Old Town', kind: 'district', layer: 'layer-top' },
    { id: 'pin', label: 'The Pin', kind: 'location', layer: 'layer-top', parent: 'district', position: { x: 0, y: 0 } },
    { id: 'east', label: 'East Gate', kind: 'location', layer: 'layer-top', position: { x: 10, y: 0 } },
    { id: 'north', label: 'North Spire', kind: 'location', layer: 'layer-top', position: { x: 0, y: -10 } },
    { id: 'keep', label: 'Blocked Keep', kind: 'location', layer: 'layer-top', position: { x: -10, y: 0 } },
    { id: 'hut', label: 'Unpositioned Hut', kind: 'location', layer: 'layer-top' },
    { id: 'cross', label: 'Deep Crossing', kind: 'location', layer: 'layer-under', position: { x: 99, y: 99 } },
    { id: 'sibling', label: 'Unconnected Sibling', kind: 'location', layer: 'layer-top', parent: 'district', position: { x: 50, y: 50 } },
  ],
  edges: [
    { id: 'e-pin-east', source: 'pin', target: 'east', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
    { id: 'e-north-pin', source: 'north', target: 'pin', modes: { walk: { allowed: true, authoredMinutes: 7 } } },
    { id: 'e-pin-keep', source: 'pin', target: 'keep', modes: { walk: { allowed: true, authoredMinutes: 9 } }, blocked: { reason: 'gate sealed' } },
    { id: 'e-pin-cross', source: 'pin', target: 'cross', modes: { train: { allowed: true, authoredMinutes: 30 } } },
    { id: 'e-pin-hut', source: 'pin', target: 'hut', modes: { walk: { allowed: true, authoredMinutes: 3 } } },
  ],
});

describe('buildSnapshot — named pin and the C19 neighborhood', () => {
  it('location/region/layer from the pin; region = the parent label, layer = the layer NAME (C23)', () => {
    const m = neighborhoodMap();
    const overlay = overlayFor(m, 'pin');
    const snap = build(m, overlay, facadeStylePriceEdge(m, 'minutes'));
    expect(snap.location).toBe('The Pin');
    expect(snap.region).toBe('Old Town');
    expect(snap.layer).toBe('Topside'); // the name — 'layer-top' is a machine id (C23)
  });

  it('a pin without a parent ⇒ region null', () => {
    const m = neighborhoodMap();
    const overlay = overlayFor(m, 'east');
    const snap = build(m, overlay, facadeStylePriceEdge(m, 'minutes'));
    expect(snap.location).toBe('East Gate');
    expect(snap.region).toBeNull();
  });

  it('routes list EXACTLY the incident arcs: cross-layer in, sibling out (D36), blocked kept with reason (C2), C10 directions', () => {
    const m = neighborhoodMap();
    const overlay = overlayFor(m, 'pin');
    const snap = build(m, overlay, facadeStylePriceEdge(m, 'minutes'));
    expect(snap.routes).toEqual([
      { label: 'East Gate', direction: 'E', cost: 5, mode: 'walk' },
      { label: 'North Spire', direction: 'N', cost: 7, mode: 'walk' },
      { label: 'Blocked Keep', direction: 'W', cost: 9, mode: 'walk', blockedReason: 'gate sealed' }, // C2
      { label: 'Deep Crossing', direction: '', cost: 30, mode: 'train' }, // cross-layer: no direction (C10)
      { label: 'Unpositioned Hut', direction: '', cost: 3, mode: 'walk' }, // missing position: no direction (§6.2)
    ]);
    expect(snap.routes.map((r) => r.label)).not.toContain('Unconnected Sibling'); // D36: no sibling awareness
    expect(snap.unit).toBe('min'); // minutes currency ⇒ 'min', not the canonical 'km' (api.ts/D60)
  });

  it('an arc into an unnamed user waypoint is excluded from routes (C23)', () => {
    const m = neighborhoodMap();
    const overlay = overlayFor(m, 'pin', {
      userNodes: [{ id: 'wp-1', label: 'Waypoint', kind: 'waypoint', layer: 'layer-top', position: { x: 5, y: 5 }, origin: 'user' }],
      userEdges: [{ id: 'we-1', source: 'pin', target: 'wp-1', modes: { walk: { allowed: true } } }],
    });
    const snap = build(m, overlay, facadeStylePriceEdge(m, 'minutes'));
    expect(snap.routes.map((r) => r.label)).not.toContain('Waypoint'); // C23
    expect(snap.routes).toHaveLength(5); // the authored neighborhood only
  });
});

// --- D60 routes currency ------------------------------------------------------------------

const currencyMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-currency',
  name: 'Currency',
  layers: [{ id: 'layer-c', name: 'C' }],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' }, // no speeds ⇒ geometry is canonical only
  nodes: [
    { id: 'pin', label: 'P', kind: 'location', layer: 'layer-c', position: { x: 0, y: 0 } },
    { id: 'm1', label: 'Minutes Neighbor', kind: 'location', layer: 'layer-c', position: { x: 10, y: 0 } },
    { id: 'm2', label: 'Canonical Neighbor', kind: 'location', layer: 'layer-c', position: { x: 20, y: 0 } },
    { id: 'c1', label: 'Km One', kind: 'location', layer: 'layer-c', position: { x: 0, y: 10 } },
    { id: 'c2', label: 'Km Two', kind: 'location', layer: 'layer-c', position: { x: 0, y: 25 } },
  ],
  edges: [
    { id: 'e-pin-m1', source: 'pin', target: 'm1', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
    { id: 'e-m1-m2', source: 'm1', target: 'm2', modes: { walk: { allowed: true } } }, // geometry ⇒ canonical
    { id: 'e-pin-c1', source: 'pin', target: 'c1', modes: { walk: { allowed: true } } },
    { id: 'e-pin-c2', source: 'pin', target: 'c2', modes: { walk: { allowed: true } } },
    { id: 'e-c1-c2', source: 'c1', target: 'c2', modes: { walk: { allowed: true } } },
  ],
});

describe('buildSnapshot — D65 routes currency (all-rule, one honest currency per list)', () => {
  it('a live arc that cannot price minutes flips the list canonical and STAYS listed; the authoredMinutes-only arc drops as unpriceable (D65(a))', () => {
    const m = currencyMap();
    const overlay = overlayFor(m, 'pin');
    const snap = build(m, overlay, facadeStylePriceEdge(m, 'canonical')); // D65 all-rule: a geometric arc cannot price minutes ⇒ canonical
    expect(snap.routes).toEqual([
      { label: 'Km One', direction: 'S', cost: 10, mode: 'walk' }, // canonical-only arc stays listed (D65(a) completeness)
      { label: 'Km Two', direction: 'S', cost: 25, mode: 'walk' },
    ]);
    expect(snap.routes.map((r) => r.label)).not.toContain('Minutes Neighbor'); // authoredMinutes-only on a distance-kind map ⇒ unpriceable ⇒ drops (D65(a))
    expect(snap.unit).toBe('km');
  });

  it('a canonical-only list prices and labels canonically (C15: one currency, unit-aware label)', () => {
    const m = currencyMap();
    const overlay = overlayFor(m, 'c1', { travelMode: 'walk' });
    const snap = build(m, overlay, facadeStylePriceEdge(m, 'canonical')); // no minutes anywhere ⇒ canonical
    expect(snap.routes).toEqual([
      { label: 'P', direction: 'N', cost: 10, mode: 'walk' }, // P lies north of the pin (Δy < 0 ⇒ N, C9)
      { label: 'Km Two', direction: 'S', cost: 15, mode: 'walk' },
    ]);
    expect(snap.unit).toBe('km'); // canonical ⇒ the scale's unitLabel (api.ts)
  });
});

// --- C20/D25 destinations -----------------------------------------------------------------

const destinationMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-dest',
  name: 'Destinations',
  layers: [{ id: 'layer-d', name: 'D' }],
  scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' },
  nodes: [
    { id: 'p', label: 'Crossroads', kind: 'location', layer: 'layer-d', position: { x: 0, y: 0 } },
    { id: 'h1', label: 'Hub One', kind: 'hub', layer: 'layer-d', position: { x: 10, y: 0 } },
    { id: 'h2', label: 'Hub Two', kind: 'hub', layer: 'layer-d', position: { x: 20, y: 0 } },
    { id: 'h3', label: 'Hub Three', kind: 'hub', layer: 'layer-d', position: { x: 30, y: 0 } },
    { id: 'h4', label: 'Hub Four', kind: 'hub', layer: 'layer-d', position: { x: 40, y: 0 } },
    { id: 'h5', label: 'Hub Five', kind: 'hub', layer: 'layer-d', position: { x: 50, y: 0 } },
    { id: 'mid', label: 'Mid', kind: 'location', layer: 'layer-d', position: { x: 5, y: 5 } },
  ],
  edges: [],
});

describe('buildSnapshot — C20/D25 destinations', () => {
  it('via/mode from the FIRST leg, cost = total, sorted ascending; hub set from the merged effective set', () => {
    const m = destinationMap();
    const overlay = overlayFor(m, 'p');
    const routes: Record<string, RouteResult> = {
      // single leg: via is the hub itself; cost 20
      h1: { ok: true, total: 20, legs: [{ arcId: 'a1', from: 'p', to: 'h1', mode: 'walk', modeLabel: 'walk', cost: 20 }], unit: 'min' }, // D72 — destinationMap's canonical label; D78 modeLabel === mode (no registry)
      // two legs: via/mode from the FIRST leg only
      h5: {
        ok: true,
        total: 10,
        unit: 'min', // D72
        legs: [
          { arcId: 'a5', from: 'p', to: 'mid', mode: 'car', modeLabel: 'car', cost: 2 },
          { arcId: 'a6', from: 'mid', to: 'h5', mode: 'train', modeLabel: 'train', cost: 8 },
        ],
      },
      // single leg, cost 5 — sorts first
      h4: { ok: true, total: 5, legs: [{ arcId: 'a4', from: 'p', to: 'h4', mode: 'car', modeLabel: 'car', cost: 5 }], unit: 'min' }, // D72
    };
    const routeTo = (id: string): RouteResult => routes[id] ?? neverRoute(); // unrouted hubs ⇒ ok:false ⇒ dropped
    const snap = build(m, overlay, () => null, routeTo);
    expect(snap.destinations).toEqual([
      { label: 'Hub Four', via: 'Hub Four', mode: 'car', cost: 5 },
      { label: 'Hub Five', via: 'Mid', mode: 'car', cost: 10 }, // first leg's via + mode (ruling)
      { label: 'Hub One', via: 'Hub One', mode: 'walk', cost: 20 },
    ]);
    expect(snap.destinationsTruncated).toBe(false);
  });

  it('ok:false results are dropped (C20/C17)', () => {
    const m = destinationMap();
    const overlay = overlayFor(m, 'p');
    const snap = build(
      m,
      overlay,
      () => null,
      (id) => (id === 'h1' ? { ok: false, total: 0, legs: [], reason: 'no path connects', unit: 'min' } : neverRoute()), // D72
    );
    expect(snap.destinations).toEqual([]); // h1 unreachable, the rest never routed (neverRoute ⇒ ok:false)
  });

  it('a destination whose first leg touches an unnamed node is dropped (C23)', () => {
    const m = destinationMap();
    const overlay = overlayFor(m, 'p', {
      userNodes: [{ id: 'wp-9', label: 'Waypoint', kind: 'waypoint', layer: 'layer-d', origin: 'user' }],
    });
    const snap = build(
      m,
      overlay,
      () => null,
      () => ({
        ok: true,
        total: 30,
        unit: 'min', // D72
        legs: [
          { arcId: 'a2', from: 'p', to: 'wp-9', mode: 'walk', modeLabel: 'walk', cost: 10 },
          { arcId: 'a3', from: 'wp-9', to: 'h2', mode: 'train', modeLabel: 'train', cost: 20 },
        ],
      }),
    );
    expect(snap.destinations).toEqual([]); // via would be 'Waypoint' (C23)
  });

  it('the pin itself and unnamed hubs are not destinations (C20 ruling, C23)', () => {
    const m = destinationMap();
    m.nodes[0].kind = 'hub'; // the pin IS a hub — it must exclude itself
    const overlay = overlayFor(m, 'p', {
      userNodes: [{ id: 'wp-h', label: 'Waypoint', kind: 'hub', layer: 'layer-d', origin: 'user' }],
    });
    const snap = build(
      m,
      overlay,
      () => null,
      (id) => {
        if (id === 'p' || id === 'wp-h') throw new Error(`routeTo must not be called for '${id}'`);
        return { ok: true, total: 7, legs: [{ arcId: 'a', from: 'p', to: id, mode: 'walk', modeLabel: 'walk', cost: 7 }], unit: 'min' }; // D72 + D78 modeLabel
      },
    );
    // h1..h5 all routed at 7 — no entry for the pin, none for the unnamed hub
    expect(snap.destinations.map((d) => d.label)).toEqual(['Hub One', 'Hub Two', 'Hub Three', 'Hub Four', 'Hub Five']);
  });
});

// --- C20 cap ------------------------------------------------------------------------------

const hubMap = (count: number): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-hubs',
  name: 'Hub Ring',
  layers: [{ id: 'layer-hubs', name: 'Hubs' }],
  scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' },
  nodes: [
    { id: 'p', label: 'Crossroads', kind: 'location', layer: 'layer-hubs', position: { x: 0, y: 0 } },
    ...Array.from({ length: count }, (_, i): MapNodeData => ({
      id: `h${i}`,
      label: `Hub ${i}`,
      kind: 'hub',
      layer: 'layer-hubs',
      position: { x: i * 10, y: 0 },
    })),
  ],
  edges: Array.from({ length: count }, (_, i): MapEdgeData => ({
    id: `e-h${i}`,
    source: 'p',
    target: `h${i}`,
    modes: { walk: { allowed: true, authoredMinutes: i + 1 } },
  })),
});

describe('buildSnapshot — C20 cap (DESTINATIONS_CAP = 12, truncation marked, D63)', () => {
  it('exports the C20 cap of 12', () => {
    expect(DESTINATIONS_CAP).toBe(12);
  });

  it('13 hubs ⇒ 12 entries sorted by cost, destinationsTruncated true (the cap dropped the priciest)', () => {
    const m = hubMap(13);
    const overlay = overlayFor(m, 'p');
    const snap = build(
      m,
      overlay,
      facadeStylePriceEdge(m, 'minutes'),
      (id) => ({
        ok: true,
        total: Number(id.slice(1)) + 1,
        unit: 'min', // D72
        legs: [{ arcId: `e-${id}`, from: 'p', to: id, mode: 'walk', modeLabel: 'walk', cost: Number(id.slice(1)) + 1 }],
      }),
    );
    expect(snap.destinations.map((d) => d.cost)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); // 13 dropped
    expect(snap.destinationsTruncated).toBe(true);
  });

  it('12 hubs ⇒ no truncation (C20)', () => {
    const m = hubMap(12);
    const overlay = overlayFor(m, 'p');
    const snap = build(
      m,
      overlay,
      facadeStylePriceEdge(m, 'minutes'),
      (id) => ({
        ok: true,
        total: Number(id.slice(1)) + 1,
        unit: 'min', // D72
        legs: [{ arcId: `e-${id}`, from: 'p', to: id, mode: 'walk', modeLabel: 'walk', cost: Number(id.slice(1)) + 1 }],
      }),
    );
    expect(snap.destinations).toHaveLength(12);
    expect(snap.destinationsTruncated).toBe(false);
  });
});
