// tests/verify/p3m2-modes-registry.spec.ts — Phase 3 M2 gate, verifier suite 2 of 3.
// The D78 user-defined modes registry, derived from the SPEC excerpts:
//
//   D78  — map-level registry { label, unit, pace/speed, allowed-by-default };
//          the built-ins remain defaults; a registry speed is EXACTLY the
//          scale.speed[mode] semantic (canonical units per hour) entering
//          pricing at ONE seam — never a third currency (C14 verbatim).
//   C14  — rows 4–5 arithmetic verbatim under a registry speed (units / speed
//          × 60 × spec.multiplier); row 6 canonical for a speedless custom
//          mode; row 2 strict for explicit modes (the A-016b widening adds
//          candidates to DEFAULT scans only, never prices).
//   C23  — the label is the authored word; the id is the structural key; an
//          entry MAY adopt a built-in id to relabel it. RouteLeg.modeLabel AND
//          the snapshot's routes[].mode / destinations[].mode carry the
//          RESOLVED word — machine ids never render.
//   C32  — an unknown (or non-string) overlay travelMode degrades to 'walk'
//          at load, never throws, and the degrade never lands on a load that
//          fails another gate (C30 reject-before-mutate).
//   C30  — registry validation (duplicate id, empty label, bad speed,
//          non-boolean allowedByDefault, empty id) and map-relative edge /
//          scale.speed key checks — through the validator AND the editor path.
//   C15/D65(a)/D74 — ONE honest currency per snapshot: on a time-kind 'min'
//          scale an authored-minutes arc and a speedless-registry arc list
//          under the same canonical 'min' label, each priced honestly.
//   D60  — preference beats price WITHIN a currency: an overlay walk
//          preference falls back to a registry mode when walk cannot price
//          minutes, and an explicit walk stays a strict filter.
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { MapValidationError, validateWorldMap } from '../../src/core/model/validate';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, ModeDeclaration, WorldMapData } from '../../src/core/api';

const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const load = (map: WorldMapData, travelMode: ChatMapOverlay['travelMode'] = 'walk', pin: string | null = 'emiya-residence') => {
  const overlay: ChatMapOverlay = {
    mapId: map.id,
    currentLocationId: pin,
    travelMode,
    userNodes: [],
    userEdges: [],
    blocked: {}, nodeBlocked: {},
  };
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

const issuesOf = (run: () => void): MapValidationError => {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(MapValidationError);
    return e as MapValidationError;
  }
  throw new Error('expected the command to throw MapValidationError');
};

// A 3-4-5 triangle pair 500 px apart — the geometry multiplies out exactly.
const horseMap = (
  modes: ModeDeclaration[],
  over: Partial<WorldMapData> = {},
): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-p3m2-horse',
  name: 'P3M2 Horse Map',
  layers: [{ id: 'layer-h', name: 'H' }],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance', terrainMultipliers: { mountain: 2.5 } },
  nodes: [
    { id: 'a', label: 'Alpha Camp', kind: 'location', layer: 'layer-h', position: { x: 0, y: 0 } },
    { id: 'b', label: 'Beta Ruin', kind: 'hub', layer: 'layer-h', position: { x: 300, y: 400 } }, // hypot = 500
  ],
  edges: [
    { id: 'e-ab', source: 'a', target: 'b', terrain: 'mountain', modes: { horse: { allowed: true, multiplier: 3 } } },
  ],
  modes,
  ...over,
});

describe('p3m2 registry — C14 rows 4–6 arithmetic verbatim under a registry speed (D78/C14/C15)', () => {
  it('500 px × 2.5 mountain ÷ registry speed 2 × 60 × multiplier 3 = 112500 min — the ONE seam, own math (C14 rows 4–5)', () => {
    const { f } = load(horseMap([{ id: 'horse', label: 'Horseback', speed: 2, allowedByDefault: false }]));
    const expected = ((500 * 2.5) / 2) * 60 * 3; // units → minutes: /speed × 60, × spec.multiplier (D78 semantic)
    const r = f.findRoute('a', 'b', 'horse');
    expect(r.ok).toBe(true);
    expect(r.total).toBeCloseTo(expected, 8);
    expect(r.unit).toBe('min'); // the speed makes minutes derivable (C15)
    expect(r.legs[0]?.modeLabel).toBe('Horseback'); // the authored word, never the id (C23)
    // A speedless registry mode prices canonically and the label says so (C14 row 6, C15).
    const { f: f2 } = load(horseMap([{ id: 'horse', label: 'Horseback', allowedByDefault: false }]));
    const r2 = f2.findRoute('a', 'b', 'horse');
    expect(r2.total).toBeCloseTo(500 * 2.5, 8); // row 5 verbatim — canonical units, no conversion
    expect(r2.unit).toBe('km'); // the canonical label (C15/D72)
  });

  it('D60 × D78: the walk preference falls back to the registry mode in the minutes run; an explicit walk re-runs CANONICALLY (D60, C15, C14 row 2)', () => {
    // walk allowed but NOT minutes-priced (no authored minutes, no walk
    // speed); horse minutes-priced via its registry speed. The default run
    // (preferred walk) must price the leg through HORSE, not drop the route.
    const map = horseMap([{ id: 'horse', label: 'Horseback', speed: 10, allowedByDefault: false }], {
      edges: [{ id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true }, horse: { allowed: true } } }],
    });
    const { f } = load(map, 'walk');
    const r = f.findRoute('a', 'b'); // no explicit mode — the default scan
    expect(r.ok).toBe(true);
    expect(r.total).toBeCloseTo((500 / 10) * 60, 8); // 3000 min — 500 px × plain 1 / registry speed 10 × 60
    expect(r.legs[0]?.mode).toBe('horse');
    expect(r.legs[0]?.modeLabel).toBe('Horseback');
    expect(r.unit).toBe('min');
    // An explicit walk is a strict filter WITHIN each currency (C14 row 2):
    // the minutes run cannot price walk, so the WHOLE computation re-runs in
    // canonical units (C15/D60) where walk prices geometrically — the SAME
    // arc, the other currency, never a mixed total.
    const strict = f.findRoute('a', 'b', 'walk');
    expect(strict.ok).toBe(true);
    expect(strict.total).toBeCloseTo(500, 8); // 500 canonical km — the canonical fallback run
    expect(strict.unit).toBe('km'); // D72: the run's own currency label
    expect(strict.legs[0]?.mode).toBe('walk');
    // An explicit mode NO arc allows is unroutable in every run (row 2 ⇒ C17).
    const ghost = f.findRoute('a', 'b', 'balloon' as never);
    expect(ghost.ok).toBe(false);
    expect(ghost.legs).toEqual([]);
    expect(ghost.reason).toMatch(/blocked or disallowed/);
    expect(JSON.stringify(ghost)).not.toContain('Infinity');
  });

  it('ONE honest currency: an authored-minutes arc and a speedless-registry arc list together under the min-scale label (C15/D65(a)/D74/D78)', () => {
    // Time-kind 'min' scale (the FX1 D45 shape), no speeds anywhere.
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-p3m2-honest',
      name: 'Honest Currency',
      layers: [{ id: 'layer-hc', name: 'HC' }],
      scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' },
      nodes: [
        { id: 'a', label: 'Alpha', kind: 'location', layer: 'layer-hc', position: { x: 0, y: 0 } },
        { id: 'b', label: 'Bravo', kind: 'location', layer: 'layer-hc', position: { x: 0, y: 30 } },
        { id: 'c', label: 'Charlie', kind: 'location', layer: 'layer-hc', position: { x: 0, y: 100 } },
      ],
      edges: [
        { id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true, authoredMinutes: 12 } } },
        { id: 'e-ac', source: 'a', target: 'c', modes: { horse: { allowed: true } } }, // 100 px × 1 = 100 canonical min
      ],
      modes: [{ id: 'horse', label: 'Horseback', allowedByDefault: false }],
    };
    const { f } = load(map, 'walk', 'a');
    const snap = f.getSnapshot();
    expect(snap.unit).toBe('min'); // the ONE label for the whole list (C22/D65)
    const bravo = snap.routes.find((r) => r.label === 'Bravo');
    const charlie = snap.routes.find((r) => r.label === 'Charlie');
    expect(bravo).toEqual({ label: 'Bravo', direction: 'S', cost: 12, mode: 'walk' }); // authored minutes, face value
    expect(charlie).toEqual({ label: 'Charlie', direction: 'S', cost: 100, mode: 'Horseback' }); // registry arc priced, not dropped (A-016b)
    // findRoute agrees with the snapshot's label on either branch (D72).
    expect(f.findRoute('a', 'b').unit).toBe('min'); // minutes run (authored)
    expect(f.findRoute('a', 'c').unit).toBe('min'); // canonical run on a 'min' scale — same word
  });
});

describe('p3m2 registry — C23 label resolution on prompt-facing structures (D78/C23, C22)', () => {
  it('a RELABELED built-in: snapshot routes[].mode AND destinations[].mode carry the authored word; undeclared ids stay their own word', () => {
    const map = fuyuki();
    map.modes = [{ id: 'walk', label: 'On Foot', allowedByDefault: true }]; // adopts 'walk' to relabel it (D78)
    const { f } = load(map, 'walk', 'fuyuki-station');
    const snap = f.getSnapshot();
    // Every walk leg renders 'On Foot'; the cross-layer TRAIN arc at the
    // station keeps its bare built-in word (the undeclared id IS the word —
    // C23), so both resolutions are visible in ONE list.
    expect(snap.routes.filter((r) => r.mode === 'On Foot').length).toBeGreaterThan(0);
    expect(snap.routes.some((r) => r.mode === 'train')).toBe(true);
    expect(snap.routes.filter((r) => r.mode === 'walk')).toHaveLength(0); // the relabeled id never renders raw
    // Destinations run through the ONE resolver too: Misaki Town's first leg
    // is the cross-layer TRAIN arc ⇒ 'train'.
    const misaki = snap.destinations.find((d) => d.label === 'Misaki Town');
    expect(misaki).toBeDefined();
    expect(misaki?.mode).toBe('train'); // bare built-in: the id IS the authored word (C23)
    expect(JSON.stringify(snap)).not.toContain('"mode":"walk"'); // the relabeled id never renders raw
  });

  it('the blocked-arc mode word is the arc\'s OWN allowed mode, resolved (D65(b)/C23)', () => {
    const map = fuyuki();
    map.modes = [{ id: 'walk', label: 'On Foot', allowedByDefault: true }];
    const { f } = load(map); // pin at emiya — the FX1 blocked bridge arc is incident
    const snap = f.getSnapshot();
    const bridge = snap.routes.find((r) => r.label === 'Fuyuki Bridge');
    expect(bridge?.blockedReason).toBe('Bridge closed by local authorities'); // C2: the reason lists
    expect(bridge?.mode).toBe('On Foot'); // resolved word, not the id (C23/D65(b))
  });
});

describe('p3m2 registry — C32 degrade at load, C30 gate discipline (D78/C32/C30)', () => {
  it('a NON-STRING overlay travelMode degrades to walk and serves queries (C32 robustness beyond the unknown-id case)', () => {
    const map = fuyuki();
    const overlay: ChatMapOverlay = {
      mapId: map.id,
      currentLocationId: 'emiya-residence',
      travelMode: 42 as unknown as ChatMapOverlay['travelMode'],
      userNodes: [],
      userEdges: [],
      blocked: {}, nodeBlocked: {},
    };
    const f = createFacade();
    f.loadMap(map, overlay);
    expect(overlay.travelMode).toBe('walk'); // degraded, never thrown (C32/D78)
    expect(() => f.getSnapshot()).not.toThrow();
    expect(f.findRoute('emiya-residence', 'misaki-town').ok).toBe(true); // FX2 still routes
  });

  it('setTravelMode accepts a registry id, refuses garbage with the FULL map universe listed, and mutates nothing on refusal (C30/D78)', () => {
    const map = fuyuki();
    map.modes = [{ id: 'horse', label: 'Horseback', speed: 8, allowedByDefault: true }];
    const { f, overlay } = load(map);
    f.setTravelMode('horse'); // registry id — accepted (D78: chat-level routing preference)
    expect(overlay.travelMode).toBe('horse');
    overlay.travelMode = 'walk'; // reset for the refusal half
    expect(() => f.setTravelMode('balloon' as never)).toThrow(/setTravelMode/);
    expect(() => f.setTravelMode('balloon' as never)).toThrow(/walk, car, train, horse/); // field-precise universe (C30)
    expect(overlay.travelMode).toBe('walk'); // the refusal mutated nothing
  });

  it('the editor path validates edge mode keys against the map-relative universe; a refusal leaves dirty false (C30/D75/D78)', () => {
    const map = fuyuki();
    map.modes = [{ id: 'horse', label: 'Horseback', allowedByDefault: true }];
    const { f, map: live } = load(map);
    const edgesBefore = live.edges.length;
    const err = issuesOf(() =>
      f.upsertEdge({
        id: '',
        source: 'outskirts',
        target: 'einzbern-castle',
        modes: { balloon: { allowed: true } } as WorldMapData['edges'][number]['modes'],
      }),
    );
    expect(err.issues.some((i) => i.path.endsWith('.modes.balloon'))).toBe(true);
    expect(err.issues.some((i) => i.message.includes('walk, car, train, horse'))).toBe(true);
    expect(live.edges).toHaveLength(edgesBefore); // reject-before-mutate (C30)
    expect(f.hasUnsavedChanges()).toBe(false); // D75
    // The registry mode itself commits through the SAME editor path.
    f.upsertEdge({ id: '', source: 'outskirts', target: 'einzbern-castle', modes: { horse: { allowed: true } } });
    expect(live.edges).toHaveLength(edgesBefore + 1);
    expect(f.hasUnsavedChanges()).toBe(true);
  });

  it('registry validation: an EMPTY id is refused at modes[i].id (C30/D78)', () => {
    const map = fuyuki();
    map.modes = [{ id: '', label: 'Nameless', allowedByDefault: true }];
    expect(() => validateWorldMap(map)).toThrow(MapValidationError);
    try {
      validateWorldMap(map);
    } catch (e) {
      expect((e as MapValidationError).issues[0]?.path).toBe('modes[0].id');
    }
    // …as is a non-string id (a runtime caller can lie about the typed field).
    const map2 = fuyuki();
    map2.modes = [{ id: 42 as unknown as string, label: 'Answer', allowedByDefault: true }];
    try {
      validateWorldMap(map2);
      throw new Error('expected MapValidationError');
    } catch (e) {
      expect(e).toBeInstanceOf(MapValidationError);
      expect((e as MapValidationError).issues[0]?.path).toBe('modes[0].id');
    }
  });
});
