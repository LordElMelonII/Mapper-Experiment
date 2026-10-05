// tests/verify/p3m2-draw-arc-draft.spec.ts — Phase 3 M2 gate, verifier suite 3 of 3.
// The CORE-side seams of the draw-arc / arc-editing milestone (the gestures
// themselves are B-122's e2e; this suite pins what the committed command must
// do, derived from the spec excerpts):
//
//   C4/D42 — parallel arcs stay possible: no dedup, ever; two commits of the
//   same pair are SIBLINGS with distinct engine-assigned ids (C5).
//   C3/F17 — cross-layer arcs are ORDINARY arcs: a cross-layer upsertEdge
//   validates and routes; the M2 draw-arc fence is UX, never engine policy.
//   §6.2 Layers — a cross-layer arc whose endpoints get re-parented stays
//   valid: edges reference ids, not layers.
//   D75/F45 — a drawn arc is dirty-never-stale, unroutable and absent from
//   the C19 snapshot until saveMap takes it live (×A-016b: even in DEFAULT
//   runs on a registry map).
//   D75 — upsertEdge is single-plane: an overlay we- id is unknown to it.
//   C14/§6.2 — a WAYPOINT edge prices through the ONE cost function (row 3
//   verbatim: authored minutes win, no terrain accrual, no speed conversion).
//   C19/C9 — a saved geometric arc enters the snapshot priced by row 5 with
//   its test-derived cardinal direction.
//   D77 — the draft log is viewer-side: the §9 facade surface stays EXACTLY
//   the CORE.md list (hasUnsavedChanges remains the only unsaved-state seam).
import { describe, expect, it } from 'vitest';
import { createFacade } from '../../src/core/facade';
import type { MapFacade } from '../../src/core/facade';
import { validateWorldMap } from '../../src/core/model/validate';
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
    blocked: {},
  };
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

const horseMap = (modes: ModeDeclaration[], over: Partial<WorldMapData> = {}): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-p3m2-horse',
  name: 'P3M2 Horse Map',
  layers: [{ id: 'layer-h', name: 'H' }],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance', terrainMultipliers: { mountain: 2.5 } },
  nodes: [
    { id: 'a', label: 'Alpha Camp', kind: 'location', layer: 'layer-h', position: { x: 0, y: 0 } },
    { id: 'm', label: 'Midway', kind: 'location', layer: 'layer-h', position: { x: 0, y: 50 } },
    { id: 'b', label: 'Beta Ruin', kind: 'hub', layer: 'layer-h', position: { x: 0, y: 150 } },
  ],
  edges: [{ id: 'e-am', source: 'a', target: 'm', modes: { walk: { allowed: true, authoredMinutes: 5 } } }],
  modes,
  ...over,
});

// CORE.md §9 verbatim — the frozen command surface. D77's "deliberately NO
// new facade surface" makes this list load-bearing: an edit-log query, a
// draftIds accessor, or any other unsaved-state read would violate it.
const SECTION9_COMMANDS: (keyof MapFacade)[] = [
  'loadMap', 'materialize', 'forkMap', 'saveForkToLibrary', 'validateImport', 'migrateData',
  'setCurrentLocation', 'setStatusNote', 'setTravelMode', 'setCorrective',
  'setBlocked', 'addUserNodeAt', 'removeUserNode', 'promoteUserNode',
  'upsertNode', 'upsertEdge', 'removeNode', 'removeEdge', 'calibrateScale', 'saveMap', 'hasUnsavedChanges',
  'findRoute', 'getSnapshot', 'renderTemplate', 'getPromptBlock',
  'setActiveLayer',
];

describe('p3m2 draw-arc core seams — C4/C5 siblings, C3 cross-layer, D75 single-plane', () => {
  it('parallel arcs commit as SIBLINGS: same pair twice ⇒ two distinct engine-assigned arcs (C4/C5/D42)', () => {
    const { f, map } = load(fuyuki());
    f.upsertEdge({ id: '', source: 'outskirts', target: 'einzbern-castle', modes: { walk: { allowed: true } } });
    f.upsertEdge({ id: '', source: 'outskirts', target: 'einzbern-castle', modes: { walk: { allowed: true } } });
    const pair = map.edges.filter((e) => e.source === 'outskirts' && e.target === 'einzbern-castle');
    expect(pair).toHaveLength(3); // FX1's own + two siblings — NO dedup (C4: the author's truth)
    expect(new Set(pair.map((e) => e.id)).size).toBe(3); // every id distinct (C5)
    expect(pair.every((e) => /^arc-/.test(e.id))).toBe(true); // engine-assigned scheme (C5/D75)
  });

  it('a cross-layer arc created through upsertEdge still validates and routes — the draw-arc fence is UX, never engine policy (C3/F17)', () => {
    const { f, map } = load(fuyuki());
    f.upsertEdge({
      id: '',
      source: 'emiya-residence', // layer-fuyuki
      target: 'misaki-town', // layer-misaki
      modes: { train: { allowed: true, authoredMinutes: 400 } },
    });
    const arc = map.edges[map.edges.length - 1];
    expect(arc.source).toBe('emiya-residence');
    expect(arc.target).toBe('misaki-town');
    f.saveMap();
    const r = f.findRoute('emiya-residence', 'misaki-town');
    expect(r.ok).toBe(true);
    // 400 > the FX2 corridor's 350: C16 optimality keeps the station route —
    // the new cross-layer sibling exists but does not win.
    expect(r.total).toBe(350);
    expect(r.legs.map((l) => l.arcId)).toEqual([
      'arc-emiya-residence-fuyuki-station',
      'arc-fuyuki-station-misaki-town',
    ]);
  });

  it('an OVERLAY we- id is unknown to the library plane — upsertEdge is single-plane (D75)', () => {
    const { f, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 260 }); // creates wp-1 + we-1..3 (C7)
    const weId = overlay.userEdges[0].id;
    expect(() => f.upsertEdge({ id: weId, source: 'a', target: 'b', modes: {} })).toThrow(
      new RegExp(`unknown edge id '${weId}'`),
    );
    expect(overlay.userEdges.some((e) => e.id === weId)).toBe(true); // the chat edge untouched
    expect(f.hasUnsavedChanges()).toBe(false);
  });

  it('§6.2: re-parenting a cross-layer arc\'s endpoint to another layer keeps the map valid — edges reference ids, not layers (C3/§6.2 Layers)', () => {
    const { f, map } = load(fuyuki());
    // Move misaki-town to the fuyuki layer via a full-replace PUT (D75).
    const misaki = map.nodes.find((n) => n.id === 'misaki-town')!;
    f.upsertNode({ ...misaki, layer: 'layer-fuyuki' });
    // The former cross-layer arc is now same-layer — and the map STILL
    // validates, with the arc untouched: no endpoint-layer coupling exists (C3).
    expect(() => validateWorldMap(map)).not.toThrow();
    const arc = map.edges.find((e) => e.id === 'arc-fuyuki-station-misaki-town')!;
    expect(arc.target).toBe('misaki-town');
  });
});

describe('p3m2 draw-arc core seams — D75 × A-016b × C19: the drawn arc goes live only at save', () => {
  it('F45 × A-016b: a drawn registry-only arc is unroutable while UNSAVED even in DEFAULT runs; saveMap takes it live (D75/D78/C8)', () => {
    const map = horseMap([{ id: 'horse', label: 'Horseback', speed: 10, allowedByDefault: false }]);
    const { f } = load(map);
    // The draw-arc commit's core shape: upsertEdge with id '' — while
    // unsaved, the DEFAULT run cannot route a→b through it (F45).
    f.upsertEdge({ id: '', source: 'm', target: 'b', modes: { horse: { allowed: true } } });
    const unsaved = map.edges[map.edges.length - 1];
    expect(f.hasUnsavedChanges()).toBe(true);
    expect(f.findRoute('a', 'b').ok).toBe(false); // the SAVED graph has no m→b arc
    f.saveMap();
    const r = f.findRoute('a', 'b'); // default run — the A-016b universe scan reaches the registry arc
    expect(r.ok).toBe(true);
    expect(r.legs.map((l) => l.arcId)).toEqual(['e-am', unsaved.id]);
    expect(r.legs[1]?.mode).toBe('horse');
    expect(r.legs[1]?.modeLabel).toBe('Horseback'); // C23: the authored word
    expect(r.total).toBeCloseTo(5 + (100 / 10) * 60, 8); // authored 5 + geometry 100 px / registry speed 10 × 60
    expect(r.unit).toBe('min'); // one minutes currency across both legs (C15)
  });

  it('C19 discriminator: a drawn-but-unsaved arc never enters the snapshot routes; after save it does, priced by row 5 (C19/F45/C14)', () => {
    // Pin at 'harbor' — its FX1 arcs (bridge, station) are authored-minutes
    // walk arcs, so 'Ghost House' is absent until the new arc commits.
    const { f, map } = load(fuyuki(), 'walk', 'harbor');
    const before = f.getSnapshot();
    expect(before.routes.some((r) => r.label === 'Ghost House')).toBe(false);
    f.upsertEdge({ id: '', source: 'harbor', target: 'ghost-house', modes: { walk: { allowed: true } } });
    expect(JSON.stringify(f.getSnapshot())).toBe(JSON.stringify(before)); // byte-identical pre-save (F45/D75)
    f.saveMap();
    const after = f.getSnapshot();
    const ghost = after.routes.find((r) => r.label === 'Ghost House');
    expect(ghost).toBeDefined(); // C19: exactly the arcs incident to the pin — now including the new one
    // harbor(595,420) ↔ ghost-house(625,140): hypot(30,280) × 0.2 — row 5,
    // no speeds ⇒ canonical pricing under FX1's 'min' label (D45/D74).
    expect(ghost?.cost).toBeCloseTo(Math.hypot(30, 280) * 0.2, 8);
    expect(ghost?.direction).toBe('N'); // Δx=+30, Δy=−280 ⇒ north (C9/C10)
  });

  it('§6.2: a WAYPOINT edge prices through the ONE cost function — authored minutes win with no terrain accrual (§6.2/C14 row 3)', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-p3m2-we',
      name: 'WE Same Function',
      layers: [{ id: 'layer-we', name: 'WE' }],
      scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance', terrainMultipliers: { mountain: 2.5 }, speed: { walk: 10 } },
      nodes: [
        { id: 'a', label: 'Alpha', kind: 'location', layer: 'layer-we', position: { x: 0, y: 0 } },
        { id: 'b', label: 'Bravo', kind: 'location', layer: 'layer-we', position: { x: 0, y: 100 } },
      ],
      edges: [],
    };
    const { f, overlay } = load(map, 'walk', 'a');
    // C24: the overlay is the caller's object — a host-side we- edge with the
    // works (authored minutes + mountain terrain). If any parallel math
    // existed for user edges, terrain (×2.5) or speed (/10×60) would leak.
    overlay.userEdges.push({
      id: 'we-authored',
      source: 'a',
      target: 'b',
      terrain: 'mountain',
      modes: { walk: { allowed: true, authoredMinutes: 9 } },
    });
    f.materialize();
    const r = f.findRoute('a', 'b');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(9); // row 3 verbatim — 22.5 (terrain) or 54 (speed) would be a leak
    expect(r.unit).toBe('min');
  });
});

describe('p3m2 D77 seam — the facade surface stays exactly §9 (no draft-log accessor)', () => {
  it('Object.keys(facade) is EXACTLY the §9 list — hasUnsavedChanges is the only unsaved-state seam (D77/D75, R2)', () => {
    const f = createFacade();
    expect(Object.keys(f).sort()).toEqual([...SECTION9_COMMANDS].sort());
  });
});
