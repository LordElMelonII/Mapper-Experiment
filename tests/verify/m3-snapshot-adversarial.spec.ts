// VERIFIER (Agent D) — M3 gate: snapshot adversarials.
// Every expectation here is derived from CORE.md (C2, C15, C17, C19, C20, C23,
// C27, C32) and EXECUTION-PLAN.md (D39, D60, D63, §6.2), never from the
// implementation or its own tests. Runs through the FACADE (the §9 query
// surface), so the seams the builder-level unit tests cannot see are exercised:
// the D60 currency decision in getSnapshot, the C24 in-place-edit propagation,
// and the injected pricing recipe.
import { describe, expect, it } from 'vitest';
import Handlebars from 'handlebars';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import type { TemplateCompiler } from '../../src/core/api';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

const compile: TemplateCompiler = (tpl) => Handlebars.compile(tpl);

const overlayFor = (map: WorldMapData, pin: string | null, extra: Partial<ChatMapOverlay> = {}): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: pin,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {},
  ...extra,
});

const load = (map: WorldMapData, overlay: ChatMapOverlay) => {
  const f = createFacade({ compile });
  f.loadMap(map, overlay);
  f.materialize();
  return f;
};

// --- FINDING PROBE 1 (C15/D60): the destinations' currency vs the snapshot unit ---
//
// C15: "Minutes whenever time is derivable; otherwise canonical units. One
// currency per route computation — costs are never mixed within a route."
// D60(b): the whole computation re-runs in canonical units only when no
// minutes-priced route exists; D60(closing): "M3's snapshot/template labels
// each leg's unit". C22's contract has ONE `unit` for the whole snapshot — so
// every cost the snapshot carries must be denominated in that unit.
//
// This map mixes currencies AT THE PIN: an authored-minutes arc (minutes
// priced) and a pure-geometric chain to a hub (canonical priced, no speeds
// anywhere). D60: the route to the hub has no minutes-priced form (the
// authored arc is cross-currency in the canonical run, the geometric arcs are
// cross-currency in the minutes run), so findRoute's canonical fallback
// prices it in the map's canonical unit ('km'). The snapshot's unit, however,
// is derived from the NEIGHBORHOOD arcs — which are minutes-priced. A km
// total under a 'min' label is a wrong number reaching the LLM.
describe('VERIFY M3 — the snapshot presents ONE currency under its unit label (C15, D60)', () => {
  const map = (): WorldMapData => ({
    schemaVersion: 2,
    id: 'map-currency-leak',
    name: 'Currency Leak Probe',
    layers: [{ id: 'L', name: 'Overland' }],
    scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' }, // NO speeds anywhere
    nodes: [
      { id: 'P', label: 'Pinpost', kind: 'location', layer: 'L', position: { x: 0, y: 0 } },
      { id: 'A', label: 'Authored Town', kind: 'location', layer: 'L', position: { x: 1000, y: 0 } },
      { id: 'B', label: 'Geometric Cross', kind: 'location', layer: 'L', position: { x: 100, y: 0 } },
      { id: 'H', label: 'Far Hub', kind: 'hub', layer: 'L', position: { x: 150, y: 0 } },
    ],
    edges: [
      // minutes-priced arc at the pin — makes the neighborhood currency 'minutes'
      { id: 'e-PA', source: 'P', target: 'A', modes: { walk: { allowed: true, authoredMinutes: 10 } } },
      // geometric arcs — canonical-priced only (no authored values, no speeds)
      { id: 'e-PB', source: 'P', target: 'B', modes: { walk: { allowed: true } } },
      { id: 'e-BH', source: 'B', target: 'H', modes: { walk: { allowed: true } } },
    ],
  });

  it('a canonical-fallback destination never appears under a "min" unit label', () => {
    const f = load(map(), overlayFor(map(), 'P'));
    const snap = f.getSnapshot();

    // the hub is genuinely reachable — but only in the canonical currency (D60
    // consequence: the minutes run finds nothing, the canonical re-run does).
    const route = f.findRoute('P', 'H');
    expect(route.ok).toBe(true);
    expect(route.total).toBe(150); // 100 + 50 canonical units (km), NOT minutes

    // SPEC: the destinations section renders its costs under the snapshot's ONE
    // unit (C22 contract). Either the destination is excluded from a 'min'
    // list (the same rule the routes section applies to cross-currency arcs,
    // D60) or the unit label is the canonical one. Currently NEITHER holds.
    if (snap.destinations.length > 0) {
      expect(snap.unit).toBe('km');
    } else {
      expect(snap.unit).toBe('min');
    }
    // and, uniformly: every destination cost must be denominated in the unit
    // the snapshot declares — the minutes-routed values, when unit is 'min'.
    if (snap.unit === 'min') {
      expect(snap.destinations).toEqual([]);
    }
  });
});

// --- FINDING PROBE 2 (C2): a blocked arc that is cross-currency must still be LISTED ---
//
// C2: "Blocked ≠ hidden. A blocked arc is excluded from routing (infinite
// cost) but remains in the snapshot with its reason, so the LLM knows WHY a
// route is unavailable." The snapshot's pricing strips the block (so the ∞
// sentinel never surfaces, C17) — but a blocked arc whose only modes are
// canonical-priced is unpriceable in a minutes list and is dropped outright,
// reason and all. The LLM then never learns the route exists and is closed.
describe('VERIFY M3 — C2: every blocked arc at the pin stays listed with its reason (C2, C19)', () => {
  const map = (): WorldMapData => ({
    schemaVersion: 2,
    id: 'map-blocked-cross-currency',
    name: 'Blocked Cross-Currency Probe',
    layers: [{ id: 'L', name: 'Overland' }],
    scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' }, // NO speeds
    nodes: [
      { id: 'P', label: 'Pinpost', kind: 'location', layer: 'L', position: { x: 0, y: 0 } },
      { id: 'A', label: 'Authored Town', kind: 'location', layer: 'L', position: { x: 1000, y: 0 } },
      { id: 'B', label: 'Landslide Pass', kind: 'location', layer: 'L', position: { x: 100, y: 0 } },
    ],
    edges: [
      { id: 'e-PA', source: 'P', target: 'A', modes: { walk: { allowed: true, authoredMinutes: 10 } } },
      // blocked AND canonical-priced: C2 demands it stays in the snapshot with
      // its reason even though its cost cannot be stated in the minutes list.
      { id: 'e-PB', source: 'P', target: 'B', modes: { walk: { allowed: true } }, blocked: { reason: 'Landslide took the path' } },
    ],
  });

  it('the blocked arc remains in routes[] with its blockedReason (C2)', () => {
    const f = load(map(), overlayFor(map(), 'P'));
    const snap = f.getSnapshot();
    const pass = snap.routes.find((r) => r.label === 'Landslide Pass');
    expect(pass, 'C2: a blocked arc incident to the pin remains in the snapshot with its reason').toBeDefined();
    expect(pass?.blockedReason).toBe('Landslide took the path');
    // the minutes-priced arc is listed normally alongside it
    expect(snap.routes.map((r) => r.label)).toContain('Authored Town');
  });
});

// --- C19/C17/C23 adversarial snapshot: exactly the incident arcs, nothing else ---
describe('VERIFY M3 — C19 exactness with adversarial neighbors (C19, C2, C10, C17, C23, D36)', () => {
  const map = (): WorldMapData => ({
    schemaVersion: 2,
    id: 'map-c19-adv',
    name: 'Neighborhood Adversary',
    layers: [
      { id: 'surface', name: 'Surface' },
      { id: 'under', name: 'Underdark' },
    ],
    scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' }, // no speeds — all costs are authored minutes
    nodes: [
      { id: 'P', label: 'Pinpost', kind: 'location', layer: 'surface', position: { x: 0, y: 0 } },
      { id: 'sib', label: 'Sibling Vale', kind: 'location', layer: 'surface', position: { x: 50, y: 0 } }, // NO arc to P
      { id: 'brg', label: 'Old Bridge', kind: 'location', layer: 'surface', position: { x: -100, y: 0 } },
      { id: 'deep', label: 'Deep Hub', kind: 'hub', layer: 'under', position: { x: 0, y: 0 } }, // cross-layer
    ],
    edges: [
      { id: 'e-brg', source: 'P', target: 'brg', modes: { walk: { allowed: true, authoredMinutes: 25 } }, blocked: { reason: 'Collapsed' } },
      { id: 'e-deep', source: 'P', target: 'deep', modes: { train: { allowed: true, authoredMinutes: 300 } } }, // cross-layer
    ],
  });

  it('routes = exactly the incident arcs: sibling absent (D36), unnamed-waypoint arc absent (C23), blocked kept (C2), cross-layer without direction (C10)', () => {
    const f = load(map(), overlayFor(map(), 'P', {
      userNodes: [{ id: 'wp-9', label: 'Waypoint', kind: 'waypoint', layer: 'surface', position: { x: 30, y: 0 }, origin: 'user' }],
      userEdges: [{ id: 'e-wp', source: 'P', target: 'wp-9', modes: { walk: { allowed: true } } }],
    }));
    const snap = f.getSnapshot();
    expect(snap.routes.map((r) => r.label).sort()).toEqual(['Deep Hub', 'Old Bridge']); // exactly two
    expect(snap.routes.find((r) => r.label === 'Sibling Vale')).toBeUndefined(); // D36: no sibling awareness
    const bridge = snap.routes.find((r) => r.label === 'Old Bridge');
    expect(bridge).toEqual({ label: 'Old Bridge', direction: 'W', cost: 25, mode: 'walk', blockedReason: 'Collapsed' });
    const deep = snap.routes.find((r) => r.label === 'Deep Hub');
    expect(deep).toEqual({ label: 'Deep Hub', direction: '', cost: 300, mode: 'train' }); // cross-layer: no direction (C10)
    // C20/D25: the cross-layer hub is a destination, reached by its one arc
    expect(snap.destinations).toEqual([{ label: 'Deep Hub', via: 'Deep Hub', mode: 'train', cost: 300 }]);
    expect(snap.destinationsTruncated).toBe(false);
  });

  it('no ∞/NaN/undefined and no machine token reaches the serialized snapshot (C17, C23)', () => {
    const f = load(map(), overlayFor(map(), 'P', {
      userNodes: [{ id: 'wp-9', label: 'Waypoint', kind: 'waypoint', layer: 'surface', position: { x: 30, y: 0 }, origin: 'user' }],
      userEdges: [{ id: 'e-wp', source: 'P', target: 'wp-9', modes: { walk: { allowed: true } } }],
    }));
    const json = JSON.stringify(f.getSnapshot());
    expect(json).not.toContain('Infinity');
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('undefined');
    expect(json).not.toContain('wp-'); // C23: machine ids never reach prompt-facing structures
    expect(json).not.toContain('Waypoint');
  });
});

// --- C27 lifecycle seam: in-place library edit (C24) deletes the pinned node ------
describe('VERIFY M3 — C27 orphan lifecycle through the facade (C27, D39, C24, C8, C32)', () => {
  const map = (): WorldMapData => ({
    schemaVersion: 2,
    id: 'map-orphan',
    name: 'Orphan Probe',
    layers: [{ id: 'L', name: 'Overland' }],
    scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' },
    nodes: [
      { id: 'alpha', label: 'Alpha', kind: 'location', layer: 'L', position: { x: 0, y: 0 } },
      { id: 'beta', label: 'Beta', kind: 'location', layer: 'L', position: { x: 100, y: 0 } },
    ],
    edges: [{ id: 'e-ab', source: 'alpha', target: 'beta', modes: { walk: { allowed: true, authoredMinutes: 5 } } }],
  });

  it('deleting the pinned node degrades the snapshot, keeps the pin, never snaps; re-pinning recovers', () => {
    const m = map();
    const overlay = overlayFor(m, 'alpha', { statusNote: 'road note', corrective: 'Unknown place — did you mean Beta?' });
    const f = load(m, overlay);
    expect(f.getSnapshot().location).toBe('Alpha');

    // the C24 host pattern: the library object is edited IN PLACE, then the
    // host calls materialize() to propagate (C8).
    const idx = m.nodes.findIndex((n) => n.id === 'alpha');
    expect(idx).toBeGreaterThanOrEqual(0);
    m.nodes.splice(idx, 1);
    f.materialize();

    const snap = f.getSnapshot();
    expect(snap.location).toBeNull(); // degraded to the warning shape (C27)
    expect(snap.routes).toEqual([]); // never silently snapped to Beta (D39)
    expect(snap.destinations).toEqual([]);
    expect(snap.statusNote).toBe('road note'); // passthrough rides on degraded snapshots
    expect(snap.corrective).toBe('Unknown place — did you mean Beta?');
    // the pin itself is KEPT (C27), invalid, in the overlay — never reassigned
    expect(facadeStateOf(f).overlay?.currentLocationId).toBe('alpha');

    // injection paused = the rendered block is the warning, never a throw,
    // never 'undefined' (C32; the pausing itself is host business, Phase 4)
    const block = f.getPromptBlock();
    expect(block).toContain("position is unknown");
    expect(block).toContain('road note');
    expect(block).not.toContain('undefined');
    expect(block.length).toBeGreaterThan(0);

    // re-pinning recovers; the now-dangling arc degrades silently (C8/C32)
    f.setCurrentLocation('beta');
    const recovered = f.getSnapshot();
    expect(recovered.location).toBe('Beta');
    expect(recovered.routes).toEqual([]); // e-ab's other endpoint no longer exists
  });
});

// --- §6.2 unit-aware labels: no speeds configured ⇒ the canonical label renders ----
describe('VERIFY M3 — §6.2: the template renders the unit-aware label (C14 row 6, D60)', () => {
  const map = (): WorldMapData => ({
    schemaVersion: 2,
    id: 'map-leagues',
    name: 'League Map',
    layers: [{ id: 'L', name: 'Overland' }],
    scale: { unitPerPx: 0.5, unitLabel: 'league', unitKind: 'distance' }, // no speeds, no authored minutes
    nodes: [
      { id: 'P', label: 'Pinpost', kind: 'location', layer: 'L', position: { x: 0, y: 0 } },
      { id: 'Q', label: 'Far Town', kind: 'location', layer: 'L', position: { x: 100, y: 0 } },
    ],
    edges: [{ id: 'e-pq', source: 'P', target: 'Q', modes: { walk: { allowed: true } } }],
  });

  it('unit is the canonical unitLabel and the rendered block says so — never "min"', () => {
    const f = load(map(), overlayFor(map(), 'P'));
    const snap = f.getSnapshot();
    expect(snap.unit).toBe('league');
    expect(snap.routes).toEqual([{ label: 'Far Town', direction: 'E', cost: 50, mode: 'walk' }]);
    const block = f.getPromptBlock(); // the default template's unit-aware labels (§6.2 M3 clause)
    expect(block).toContain('unit="league"');
    expect(block).not.toContain('unit="min"');
    expect(block).not.toContain('Infinity');
  });
});
