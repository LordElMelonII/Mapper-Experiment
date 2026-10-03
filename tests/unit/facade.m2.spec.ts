// Behavior tests for the M2 facade commands (PKG A-006): findRoute + setBlocked.
// FX2 (Emiya Residence → Misaki Town, 350 min) is the owner's acceptance case
// (D54) · C2 blocked ≠ hidden, overlay can only add a block · C6/C16 routing
// over the effective graph · C17 ok:false + human reason, ∞ never in output ·
// C18 leg shape · C8 ensureFresh (stale discipline) · C14 row 2 mode
// filtering · D19 mode choice · D20 chat-scoped blocks · §6.2 route-to-self ·
// C15/D60 route currency (minutes-first, one currency per route).
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

// C24: the facade keeps the loaded reference — every suite thaws a fresh JSON
// clone of the deep-frozen FX1 fixture so tests never interact.
const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const fuyukiOverlay = (map: WorldMapData): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: 'emiya-residence',
  travelMode: 'walk', // D19: the chat's default mode preference
  userNodes: [],
  userEdges: [],
  blocked: {},
});

const loadFuyuki = () => {
  const map = fuyuki();
  const overlay = fuyukiOverlay(map);
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

// §6.2 disconnected pair: two islands, one arc each, nothing between (C17).
const islands = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-islands',
  name: 'Two Islands',
  layers: [{ id: 'layer-isles', name: 'Isles' }],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
  nodes: [
    { id: 'a', label: 'A Isle', kind: 'location', layer: 'layer-isles', position: { x: 0, y: 0 } },
    { id: 'b', label: 'B Isle', kind: 'location', layer: 'layer-isles', position: { x: 10, y: 0 } },
    { id: 'c', label: 'C Isle', kind: 'location', layer: 'layer-isles', position: { x: 100, y: 0 } },
    { id: 'd', label: 'D Isle', kind: 'location', layer: 'layer-isles', position: { x: 110, y: 0 } },
  ],
  edges: [
    { id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true } } },
    { id: 'e-cd', source: 'c', target: 'd', modes: { walk: { allowed: true } } },
  ],
});

const loadIslands = () => {
  const map = islands();
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

// --- FX2 acceptance (FX2, C18, D54) -----------------------------------------------------

describe('FX2 — Emiya Residence → Misaki Town (the owner acceptance case)', () => {
  it('routes walk 50 then train 300, total 350; the blocked bridge arc appears nowhere (FX2, C18, C2)', () => {
    const { f } = loadFuyuki();
    const r = f.findRoute('emiya-residence', 'misaki-town'); // no mode ⇒ D19 default
    expect(r.ok).toBe(true);
    expect(r.total).toBe(350);
    expect(r.legs).toEqual([
      { arcId: 'arc-emiya-residence-fuyuki-station', from: 'emiya-residence', to: 'fuyuki-station', mode: 'walk', cost: 50 },
      { arcId: 'arc-fuyuki-station-misaki-town', from: 'fuyuki-station', to: 'misaki-town', mode: 'train', cost: 300 },
    ]);
    // C2: the blocked arc is excluded from routing — invisible to the route (C2/FX2).
    expect(JSON.stringify(r)).not.toContain('arc-emiya-residence-fuyuki-bridge');
  });
});

// --- mode choice (C14 row 2, D19) ---------------------------------------------------------

describe('mode choice — explicit mode strictly filters (C14 row 2, D19)', () => {
  it("mode 'train' from the origin ⇒ ok:false — no train arcs there (C14 row 2 ⇒ C17 reason)", () => {
    const { f } = loadFuyuki();
    const r = f.findRoute('emiya-residence', 'misaki-town', 'train');
    expect(r.ok).toBe(false);
    expect(r.total).toBe(0);
    expect(r.legs).toEqual([]);
    expect(r.reason).toMatch(/blocked or disallowed/i); // C14 row 2's sentinel, translated (C17)
    expect(JSON.stringify(r)).not.toContain('Infinity');
  });

  it('the explicit mode overrides the default where it exists (D19)', () => {
    const { f } = loadFuyuki();
    const r = f.findRoute('fuyuki-station', 'misaki-town', 'train');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(300);
    expect(r.legs[0]?.mode).toBe('train');
  });

  it("mode 'walk' cannot traverse the train-only station arc — the default would (D19, C14 row 2)", () => {
    const { f } = loadFuyuki();
    // Default (preference + fallback): walk is unavailable on the arc, the
    // train fallback prices it — the D19 default routes.
    const fallback = f.findRoute('fuyuki-station', 'misaki-town');
    expect(fallback.ok).toBe(true);
    expect(fallback.legs[0]?.mode).toBe('train');
    // Explicit 'walk' is a strict filter: the only arc disallows it ⇒ ok:false.
    expect(f.findRoute('fuyuki-station', 'misaki-town', 'walk').ok).toBe(false);
  });
});

// --- C2 live: setBlocked / lift / cannot-lift-library (C2, D20, C8) ------------------------

describe('setBlocked — chat-scoped blocks that reroute (C2, D20)', () => {
  it('blocks the direct arc and reroutes through Shopping District WITHOUT materialize() (C2, C8)', () => {
    const { f } = loadFuyuki();
    f.setBlocked('arc-emiya-residence-fuyuki-station', 'strike'); // D20
    expect(facadeStateOf(f).stale).toBe(true); // mutation set the flag (C8)

    const r = f.findRoute('emiya-residence', 'misaki-town'); // ensureFresh, no explicit materialize
    expect(facadeStateOf(f).stale).toBe(false); // the query consumed it (C8)
    expect(r.ok).toBe(true);
    expect(r.total).toBe(352); // hand-computed: 12 + 15 + 25 + 300
    expect(r.legs).toEqual([
      { arcId: 'arc-emiya-residence-shopping-district', from: 'emiya-residence', to: 'shopping-district', mode: 'walk', cost: 12 },
      { arcId: 'arc-shopping-district-fuyuki-bridge', from: 'shopping-district', to: 'fuyuki-bridge', mode: 'walk', cost: 15 },
      { arcId: 'arc-fuyuki-bridge-fuyuki-station', from: 'fuyuki-bridge', to: 'fuyuki-station', mode: 'walk', cost: 25 },
      { arcId: 'arc-fuyuki-station-misaki-town', from: 'fuyuki-station', to: 'misaki-town', mode: 'train', cost: 300 },
    ]);
    expect(r.legs.map((l) => l.arcId)).not.toContain('arc-emiya-residence-fuyuki-station'); // blocked arc absent (C2)
  });

  it('lifting with reason undefined restores the FX2 route and empties the overlay entry (D20)', () => {
    const { f, overlay } = loadFuyuki();
    f.setBlocked('arc-emiya-residence-fuyuki-station', 'strike');
    f.setBlocked('arc-emiya-residence-fuyuki-station', undefined);
    expect('arc-emiya-residence-fuyuki-station' in overlay.blocked).toBe(false);
    expect(f.findRoute('emiya-residence', 'misaki-town')).toMatchObject({ ok: true, total: 350 });
  });

  it('cannot lift a LIBRARY block — the overlay only adds, never lifts (C2, A-002)', () => {
    const { f, map } = loadFuyuki();
    const bridge = 'arc-emiya-residence-fuyuki-bridge';

    f.setBlocked(bridge, 'my reason'); // restate over the library block
    f.materialize();
    expect(facadeStateOf(f).effective!.edges.find((e) => e.id === bridge)?.blocked?.reason).toBe('my reason');

    f.setBlocked(bridge, undefined); // attempt the lift
    f.materialize();
    // The library's own block survives with the LIBRARY reason (C2).
    expect(facadeStateOf(f).effective!.edges.find((e) => e.id === bridge)?.blocked?.reason).toBe(
      map.edges.find((e) => e.id === bridge)?.blocked?.reason,
    );
    expect(map.edges.find((e) => e.id === bridge)?.blocked?.reason).toBe('Bridge closed by local authorities');
  });
});

// --- unreachability reasons (C17, C2) -------------------------------------------------------

describe('unreachability — ok:false plus a human reason, never Infinity (C17)', () => {
  it('every arc out of the origin blocked ⇒ reason mentions blocked (C2, C17)', () => {
    const { f } = loadFuyuki();
    for (const id of [
      'arc-emiya-residence-shopping-district',
      'arc-emiya-residence-homurahara-academy',
      'arc-emiya-residence-matou-residence',
      'arc-emiya-residence-ryuudou-temple',
      'arc-emiya-residence-outskirts',
      'arc-emiya-residence-fuyuki-station',
    ]) {
      f.setBlocked(id, 'sealed');
    }
    const r = f.findRoute('emiya-residence', 'misaki-town');
    expect(r.ok).toBe(false);
    expect(r.total).toBe(0);
    expect(r.legs).toEqual([]);
    expect(r.reason).toMatch(/blocked/);
    expect(JSON.stringify(r)).not.toContain('Infinity'); // C17: ∞ never appears in any output
  });

  it('a disconnected pair ⇒ "no path connects" reason (C17, §6.2)', () => {
    const f = loadIslands();
    const r = f.findRoute('a', 'd');
    expect(r.ok).toBe(false);
    expect(r.legs).toEqual([]);
    expect(r.reason).toMatch(/no path connects 'A Isle' and 'D Isle'/);
    expect(JSON.stringify(r)).not.toContain('Infinity');
  });
});

// --- route currency: one per computation, minutes first (C15, D60) -------------------------

// A map with TWO corridors a→c: via B in authored minutes (5+7=12), via D in
// pure geometry (3+3=6 canonical km — cheaper but not time-denominated).
// unitPerPx 1, no speeds: geometric legs price in canonical units only.
const mixedCurrency = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-mixed',
  name: 'Mixed Currency',
  layers: [{ id: 'layer-mixed', name: 'Mixed' }],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
  nodes: [
    { id: 'a', label: 'A', kind: 'location', layer: 'layer-mixed', position: { x: 0, y: 0 } },
    { id: 'b', label: 'B', kind: 'location', layer: 'layer-mixed', position: { x: 3, y: 4 } },
    { id: 'c', label: 'C', kind: 'location', layer: 'layer-mixed', position: { x: 6, y: 0 } },
    { id: 'd', label: 'D', kind: 'location', layer: 'layer-mixed', position: { x: 3, y: 0 } },
  ],
  edges: [
    { id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
    { id: 'e-bc', source: 'b', target: 'c', modes: { walk: { allowed: true, authoredMinutes: 7 } } },
    { id: 'e-ad', source: 'a', target: 'd', modes: { walk: { allowed: true } } },
    { id: 'e-dc', source: 'd', target: 'c', modes: { walk: { allowed: true } } },
  ],
});

const loadMixed = () => {
  const map = mixedCurrency();
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

describe('route currency — one currency per route, minutes first (C15, D60)', () => {
  it('minutes whenever derivable: the 12-min corridor wins over the CHEAPER 6-km canonical one (C15, D60)', () => {
    const f = loadMixed();
    const r = f.findRoute('a', 'c');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(12); // authored minutes — not the cheaper 6 km geometric route
    expect(r.legs.map((l) => l.cost)).toEqual([5, 7]); // every leg minutes — nothing mixed in
  });

  it('canonical fallback: minutes corridor severed ⇒ the whole route re-prices in units, never mixed (C15, D60, C2)', () => {
    const f = loadMixed();
    f.setBlocked('e-ab', 'closed');
    const r = f.findRoute('a', 'c');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(6); // 3 km + 3 km — canonical currency for BOTH legs
    expect(r.legs.map((l) => l.arcId)).toEqual(['e-ad', 'e-dc']);
    expect(r.legs.map((l) => l.cost)).toEqual([3, 3]); // geometry only — no authored-minutes leg sneaks in
    expect(JSON.stringify(r)).not.toContain('Infinity'); // C17
  });

  it('the currency gate applies to explicit modes too: walk reroutes canonically when its minutes leg is blocked (C15, D60, C14 row 2)', () => {
    const f = loadMixed();
    f.setBlocked('e-ab', 'closed');
    const r = f.findRoute('a', 'c', 'walk');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(6);
    expect(r.legs.every((l) => l.mode === 'walk')).toBe(true);
  });

  it('no uniform-currency route exists ⇒ ok:false with a human reason, never a mixed total (C15, C17)', () => {
    const f = loadMixed();
    f.setBlocked('e-ab', 'closed');
    f.setBlocked('e-ad', 'closed'); // minutes corridor and canonical corridor both severed at the origin
    const r = f.findRoute('a', 'c');
    expect(r.ok).toBe(false);
    expect(r.total).toBe(0);
    expect(r.legs).toEqual([]);
    expect(r.reason).toMatch(/blocked or disallowed/i); // currency exclusion counts as disallowed (D60)
    expect(JSON.stringify(r)).not.toContain('Infinity');
  });
});

// --- argument discipline (C30, §6.2) ---------------------------------------------------------

describe('findRoute / setBlocked argument discipline (C30)', () => {
  it('unknown endpoints throw field-precise errors naming the id (C30)', () => {
    const { f } = loadFuyuki();
    expect(() => f.findRoute('emiya-residence', 'ghost')).toThrow(/unknown node id 'ghost'/);
    expect(() => f.findRoute('ghost', 'misaki-town')).toThrow(/unknown node id 'ghost'/);
  });

  it('route-to-self is trivially ok — pinned shape (§6.2)', () => {
    const { f } = loadFuyuki();
    expect(f.findRoute('emiya-residence', 'emiya-residence')).toEqual({ ok: true, total: 0, legs: [], unit: 'min' }); // D72 — FX1's canonical label (route-to-self runs nothing)
  });

  it('no map loaded ⇒ both commands throw the standard message', () => {
    const f = createFacade();
    expect(() => f.findRoute('a', 'b')).toThrow('[TravelMapper] no map loaded');
    expect(() => f.setBlocked('e-x', 'reason')).toThrow('[TravelMapper] no map loaded');
  });

  it('setBlocked on an unknown edge throws field-precisely (C30)', () => {
    const { f } = loadFuyuki();
    expect(() => f.setBlocked('arc-ghost', 'reason')).toThrow(/unknown edge id 'arc-ghost'/);
  });

  it('setBlocked refuses a whitespace-only reason like an empty one, stores valid strings verbatim (C30, P2 M2 verifier finding 3)', () => {
    const { f } = loadFuyuki();
    expect(() => f.setBlocked('arc-outskirts-einzbern-castle', '   ')).toThrow(
      /reason must be a non-empty string or undefined/,
    );
    expect(() => f.setBlocked('arc-outskirts-einzbern-castle', '\t\n')).toThrow(
      /reason must be a non-empty string or undefined/,
    );
    // Valid strings persist verbatim, untrimmed — the reason is the author's payload (C2).
    f.setBlocked('arc-outskirts-einzbern-castle', '  Rockslide  ');
    const { overlay } = facadeStateOf(f);
    expect(overlay?.blocked['arc-outskirts-einzbern-castle']).toBe('  Rockslide  ');
  });
});
