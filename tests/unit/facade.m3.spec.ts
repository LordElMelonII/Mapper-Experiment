// M3 facade tests (PKG A-008): getSnapshot over FX1 (C19/C20/C23/C27, D25/D36,
// D60) and the D63 corrective seam (setCorrective round-trip, C30 discipline,
// C8 stale discipline). FX1 is thawed per C24 — every suite loads a fresh JSON
// clone so tests never interact.
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import { euclid } from '../../src/core/geometry/measure';
import type { ChatMapOverlay, MapNodeData, WorldMapData } from '../../src/core/api';

const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const fuyukiOverlay = (map: WorldMapData, pin = 'emiya-residence'): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: pin,
  travelMode: 'walk', // D19: the chat's default mode preference
  userNodes: [],
  userEdges: [],
  blocked: {},
});

const loadFuyuki = (pin = 'emiya-residence') => {
  const map = fuyuki();
  const overlay = fuyukiOverlay(map, pin);
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

// --- FX1 at the Emiya Residence: the C19 neighborhood + C20 destinations -------

describe('getSnapshot — FX1 at emiya-residence (C19, C2, D36, D60)', () => {
  it('location/region/layer from the pin; unit "min" for the all-minutes routes (D60)', () => {
    const { f } = loadFuyuki();
    const snap = f.getSnapshot();
    expect(snap.location).toBe('Emiya Residence');
    expect(snap.region).toBe('Miyama'); // parent district-miyama's label
    expect(snap.layer).toBe('Fuyuki City'); // the layer NAME — machine ids never reach the prompt (C23)
    expect(snap.unit).toBe('min');
  });

  it('routes[] = EXACTLY the incident arcs: labels, cardinal directions, blocked bridge WITH its reason (C2), no sibling (D36)', () => {
    const { f } = loadFuyuki();
    const snap = f.getSnapshot();
    expect(snap.routes).toEqual([
      { label: 'Shopping District', direction: 'SE', cost: 12, mode: 'walk' },
      { label: 'Homurahara Academy', direction: 'NE', cost: 18, mode: 'walk' },
      { label: 'Matou Residence', direction: 'NW', cost: 22, mode: 'walk' },
      { label: 'Ryuudou Temple', direction: 'S', cost: 50, mode: 'walk' },
      { label: 'Outskirts', direction: 'SW', cost: 30, mode: 'walk' },
      { label: 'Fuyuki Station', direction: 'E', cost: 50, mode: 'walk' },
      { label: 'Fuyuki Bridge', direction: 'E', cost: 25, mode: 'walk', blockedReason: 'Bridge closed by local authorities' },
    ]);
    // D36: Tohsaka Residence sits in the same district but has no incident arc — absent.
    expect(snap.routes.map((r) => r.label)).not.toContain('Tohsaka Residence');
    expect(snap.destinationsTruncated).toBe(false);
  });

  it('destinations = the hub set minus self, sorted by cost: Station 50, Misaki 350 via the first leg (D25, C20)', () => {
    const { f } = loadFuyuki();
    const snap = f.getSnapshot();
    expect(snap.destinations).toEqual([
      { label: 'Fuyuki Station', via: 'Fuyuki Station', mode: 'walk', cost: 50 },
      // the ruling pins via/mode to the FIRST leg: walk to Fuyuki Station, then
      // train 300 — total 350 (FX2's shape)
      { label: 'Misaki Town', via: 'Fuyuki Station', mode: 'walk', cost: 350 },
    ]);
    expect(snap.destinationsTruncated).toBe(false);
  });
});

// --- C20 truncation marker on a 13-hub map (D63) --------------------------------

describe('getSnapshot — destinationsTruncated (C20/D63)', () => {
  const hubRing = (count: number): WorldMapData => ({
    schemaVersion: 2,
    id: 'map-hubring',
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
    edges: Array.from({ length: count }, (_, i) => ({
      id: `e-h${i}`,
      source: 'p',
      target: `h${i}`,
      modes: { walk: { allowed: true, authoredMinutes: i + 1 } },
    })),
  });

  const load = (count: number) => {
    const map = hubRing(count);
    const f = createFacade();
    f.loadMap(map, fuyukiOverlay(map, 'p'));
    f.materialize();
    return f;
  };

  it('13 hubs ⇒ 12 cheapest kept, the cap dropping the priciest is marked (C20/D63)', () => {
    const snap = load(13).getSnapshot();
    expect(snap.destinations.map((d) => d.cost)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(snap.destinationsTruncated).toBe(true);
  });

  it('12 hubs ⇒ everything fits, no truncation marker (C20)', () => {
    const snap = load(12).getSnapshot();
    expect(snap.destinations).toHaveLength(12);
    expect(snap.destinationsTruncated).toBe(false);
  });
});

// --- D63 corrective seam ----------------------------------------------------------

describe('setCorrective — the D63 corrective seam (C30, C8)', () => {
  it('no map loaded ⇒ the standard throw', () => {
    expect(() => createFacade().setCorrective('x')).toThrow('[TravelMapper] no map loaded');
  });

  it("empty string ⇒ field-precise throw (C30 — the setBlocked-reason precedent)", () => {
    const { f } = loadFuyuki();
    expect(() => f.setCorrective('')).toThrow(/setCorrective: corrective must be a non-empty string or undefined/);
  });

  it('non-string ⇒ field-precise throw (C30 — a runtime caller can lie, F50)', () => {
    const { f } = loadFuyuki();
    expect(() => f.setCorrective(42 as unknown as string)).toThrow(
      /setCorrective: corrective must be a non-empty string or undefined/,
    );
  });

  it("setCorrective('…')/undefined round-trip into getSnapshot().corrective (D63)", () => {
    const { f } = loadFuyuki();
    const line = "Unknown place 'stasion' — did you mean Fuyuki Station?";
    f.setCorrective(line);
    expect(f.getSnapshot().corrective).toBe(line); // passthrough verbatim (ruling)
    f.setCorrective(undefined);
    expect(f.getSnapshot().corrective).toBeUndefined();
  });

  it('stale discipline: setCorrective marks stale; getSnapshot with NO materialize sees it and consumes the flag (C8)', () => {
    const { f } = loadFuyuki();
    f.setCorrective('sticky line');
    expect(facadeStateOf(f).stale).toBe(true); // the mutation set the flag (C8)
    const snap = f.getSnapshot(); // no materialize() in between
    expect(snap.corrective).toBe('sticky line');
    expect(facadeStateOf(f).stale).toBe(false); // the query consumed it (C8)
    f.getSnapshot();
    expect(facadeStateOf(f).stale).toBe(false); // getSnapshot never SETS stale — it is a query
  });

  it('getSnapshot ensureFreshes: loadMap then query WITHOUT materialize still sees the graph (C8)', () => {
    const map = fuyuki();
    const f = createFacade();
    f.loadMap(map, fuyukiOverlay(map));
    expect(facadeStateOf(f).stale).toBe(true);
    const snap = f.getSnapshot();
    expect(facadeStateOf(f).stale).toBe(false);
    expect(snap.routes.length).toBeGreaterThan(0);
  });
});

// --- C27/C23 degradation on FX1-derived state -------------------------------------

describe('getSnapshot — degradation on FX1-derived state (C27, C23/D58)', () => {
  it('the pin on a placed unnamed waypoint ⇒ the degraded shape, never a throw (C23/D58)', () => {
    const { f } = loadFuyuki();
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 250 }); // engine-assigned id (C5)
    f.setCurrentLocation('wp-1'); // waypoints are pin-eligible leaves (D58)
    expect(f.getSnapshot()).toEqual({
      location: null,
      region: null,
      layer: '',
      routes: [],
      destinations: [],
      destinationsTruncated: false,
      unit: 'min', // FX1's canonical unitLabel
    });
  });

  it('C23 endpoint exclusion: user edges into the unnamed waypoint never enter the pinned routes (C23)', () => {
    const { f } = loadFuyuki();
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 250 }); // kNN connects wp-1 to Emiya + 2 neighbors (C7)
    const snap = f.getSnapshot();
    expect(snap.routes.map((r) => r.label)).toEqual([
      'Shopping District',
      'Homurahara Academy',
      'Matou Residence',
      'Ryuudou Temple',
      'Outskirts',
      'Fuyuki Station',
      'Fuyuki Bridge',
    ]); // the authored neighborhood only — 'Waypoint' appears nowhere (C23)
  });
});

// --- D65 currency on a mixed FX1 variant -------------------------------------------

describe('getSnapshot — mixed-currency FX1 variant (D65)', () => {
  it("stripping one incident arc's authoredMinutes flips the list canonical; the stripped arc STAYS priced geometrically and the destinations re-price in the snapshot's currency (D65(a)/D65(c))", () => {
    const map = fuyuki();
    const arc = map.edges.find((e) => e.id === 'arc-emiya-residence-shopping-district')!;
    const walk = arc.modes.walk;
    if (walk === undefined) throw new Error('fixture drift: the shopping arc must allow walk');
    delete walk.authoredMinutes; // now prices only in canonical units (no speeds on FX1)
    const f = createFacade();
    f.loadMap(map, fuyukiOverlay(map));
    f.materialize();
    const snap = f.getSnapshot();
    // D65(a): the all-rule flips the list canonical (the stripped arc cannot
    // price minutes); FX1 is time-kind with the 'min' label (D45), so the
    // canonical list carries authored minutes honestly — every incident arc
    // stays listed, the stripped one now priced geometrically (C14 row 5).
    const shopping = snap.routes[0]!;
    expect(shopping.label).toBe('Shopping District');
    const node = (id: string): { x: number; y: number } => {
      const found = map.nodes.find((n) => n.id === id)?.position;
      if (found === undefined) throw new Error('fixture drift: missing position');
      return found;
    };
    expect(shopping.cost).toBeCloseTo(euclid(node('emiya-residence'), node('shopping-district')) * map.scale.unitPerPx, 9);
    expect(shopping.mode).toBe('walk');
    expect(snap.routes.map((r) => r.label)).toEqual([
      'Shopping District',
      'Homurahara Academy',
      'Matou Residence',
      'Ryuudou Temple',
      'Outskirts',
      'Fuyuki Station',
      'Fuyuki Bridge', // still blocked WITH its reason (C2/D65(b))
    ]);
    expect(snap.routes.find((r) => r.label === 'Fuyuki Bridge')?.blockedReason).toBe('Bridge closed by local authorities');
    expect(snap.unit).toBe('min'); // FX1's canonical unitLabel — time-kind (D45); ONE unit per snapshot (D65)
    // D65(c): destinations re-price in the (canonical) snapshot currency —
    // the same honest minutes, no cross-currency drops.
    expect(snap.destinations).toEqual([
      { label: 'Fuyuki Station', via: 'Fuyuki Station', mode: 'walk', cost: 50 },
      { label: 'Misaki Town', via: 'Fuyuki Station', mode: 'walk', cost: 350 },
    ]);
    expect(snap.destinationsTruncated).toBe(false);
  });
});
