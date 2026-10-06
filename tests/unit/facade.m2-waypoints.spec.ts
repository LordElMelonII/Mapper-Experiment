// Behavior tests for the M2 waypoint commands (PKG A-007): addUserNodeAt /
// removeUserNode / promoteUserNode.
// C5 engine-assigned ids ('wp-<n>' / 'we-<n>', bump-until-free) · C7 kNN leaf
// connection over the merged node set (k = 3, leaves only, orphans legal) ·
// C26 atomic promotion (overlay → library, one id) · C1 containers never
// connect · D58 waypoint pin eligibility (the ONE leaf predicate) · D21
// waypoints persist per chat, promote names it · C8 ensureFresh stale
// discipline · C14/§6.2 waypoint edges price through the ONE cost function ·
// C23 the label is the plain word 'Waypoint' · C30 field-precise refusals ·
// F50 the overlay and map still validate after every happy path and refusal.
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { euclid } from '../../src/core/geometry/measure';
import { MapValidationError, validateOverlay, validateWorldMap } from '../../src/core/model/validate';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

// C24: the facade keeps the loaded references — every suite builds a fresh
// mutable clone of the deep-frozen FX1 fixture (or an inline map) so tests
// never interact.
const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const overlayFor = (map: WorldMapData): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: null,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {}, nodeBlocked: {},
});

const load = (map: WorldMapData) => {
  const overlay = overlayFor(map);
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

// F50: after every command's happy path AND after every refusal, both planes
// still validate.
const expectStillValid = (map: WorldMapData, overlay: ChatMapOverlay): void => {
  expect(() => validateWorldMap(map)).not.toThrow();
  expect(() => validateOverlay(overlay, map)).not.toThrow();
};

// The user edge between two nodes, if placement created one (C6: direction-free).
const edgeBetween = (overlay: ChatMapOverlay, a: string, b: string): string | undefined =>
  overlay.userEdges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a))?.id;

// Hand-placed kNN layout (C7). The tap at (0,0) sits amid decoys: a container
// CLOSER than every leaf (C1: excluded by kind even when nearest) and a leaf
// that has a child (the D58 predicate: not childless ⇒ not connectable), so
// the 3 nearest connectable leaves are n1 (10), n2 (20), n3 (30) — child (50),
// n4 (100) and 'unpositioned' (unmeasurable, §6.2) miss the cut. layer-empty
// has no leaves at all; layer-ghosts has only unpositioned leaves; layer-pair
// has exactly two.
const waypointMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-waypoints',
  name: 'Waypoint Layout',
  layers: [
    { id: 'layer-main', name: 'Main' },
    { id: 'layer-empty', name: 'Empty' },
    { id: 'layer-ghosts', name: 'Ghosts' },
    { id: 'layer-pair', name: 'Pair' },
  ],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
  nodes: [
    { id: 'decoy-district', label: 'Decoy District', kind: 'district', layer: 'layer-main', position: { x: 1, y: 1 } },
    { id: 'parent-leaf', label: 'Parent Leaf', kind: 'location', layer: 'layer-main', position: { x: 2, y: 0 } },
    { id: 'child', label: 'Child', kind: 'location', layer: 'layer-main', parent: 'parent-leaf', position: { x: -50, y: 0 } },
    { id: 'n1', label: 'Near', kind: 'location', layer: 'layer-main', position: { x: 10, y: 0 } },
    { id: 'n2', label: 'Mid', kind: 'location', layer: 'layer-main', position: { x: 0, y: 20 } },
    { id: 'n3', label: 'Far', kind: 'location', layer: 'layer-main', position: { x: 30, y: 0 } },
    { id: 'n4', label: 'Farther', kind: 'location', layer: 'layer-main', position: { x: 100, y: 0 } },
    { id: 'unpositioned', label: 'Unpositioned', kind: 'location', layer: 'layer-main' },
    { id: 'ghost-a', label: 'Ghost A', kind: 'location', layer: 'layer-ghosts' },
    { id: 'ghost-b', label: 'Ghost B', kind: 'location', layer: 'layer-ghosts' },
    { id: 'p1', label: 'Pair One', kind: 'location', layer: 'layer-pair', position: { x: 50, y: 0 } },
    { id: 'p2', label: 'Pair Two', kind: 'location', layer: 'layer-pair', position: { x: 0, y: 50 } },
  ],
  edges: [],
});

const targetsOf = (overlay: ChatMapOverlay, wp: string): string[] =>
  overlay.userEdges.map((e) => (e.source === wp ? e.target : e.source)).sort();

// --- placement (C5, C7, C23, D21, §6.2) ---------------------------------------------------

describe('addUserNodeAt — placement and kNN connection (C5, C7, D21, §6.2)', () => {
  it('places an overlay user node with an engine id, the plain label and origin user (C5, C23, D21)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    expect(overlay.userNodes).toHaveLength(1);
    const wp = overlay.userNodes[0];
    expect(wp.id).toMatch(/^wp-\d+$/); // C5: the id belongs to the engine ('wp-<n>' scheme)
    expect(wp.label).toBe('Waypoint'); // C23: a plain word, not an id-like token
    expect(wp.kind).toBe('waypoint');
    expect(wp.layer).toBe('layer-main');
    expect(wp.position).toEqual({ x: 0, y: 0 });
    expect(wp.origin).toBe('user');
    expect(wp.parent).toBeUndefined(); // §6.2: a tap inside a compound yields a TOP-LEVEL user node
    expect(map.nodes.some((nd) => nd.id === wp.id)).toBe(false); // overlay, not library
    expectStillValid(map, overlay);
  });

  it('connects exactly the k nearest leaves — containers and parents excluded even when closer (C7, C1, D58)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    const wp = overlay.userNodes[0].id;
    expect(overlay.userEdges).toHaveLength(3); // min(k, leafCount) — 5 connectable leaves ⇒ k = 3, the C7 default, pinned behaviorally
    expect(targetsOf(overlay, wp)).toEqual(['n1', 'n2', 'n3']); // by euclid: 10, 20, 30
    // decoy-district (d ≈ 1.4) and parent-leaf (d = 2) are nearer than n1 — excluded
    // by kind / childlessness, the ONE D58 leaf predicate (C1, D58)
    for (const e of overlay.userEdges) {
      expect(e.modes.walk?.allowed).toBe(true);
      expect(e.modes.walk?.authoredMinutes).toBeUndefined(); // NO authored values (§6.2)
      expect(e.authoredDistance).toBeUndefined();
      expect(edgeBetween(overlay, wp, e.source === wp ? e.target : e.source)).toBe(e.id);
    }
    expectStillValid(map, overlay);
  });

  it('fewer than k leaves ⇒ connects to what exists (C7, §6.2)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-pair', { x: 0, y: 0 });
    const wp = overlay.userNodes[0].id;
    expect(overlay.userEdges).toHaveLength(2);
    expect(targetsOf(overlay, wp)).toEqual(['p1', 'p2']);
    expectStillValid(map, overlay);
  });

  it('zero-leaf layer ⇒ placed, no edges, no throw — the orphan is legal and harmless (C7)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-empty', { x: 0, y: 0 });
    expect(overlay.userNodes).toHaveLength(1);
    expect(overlay.userNodes[0].layer).toBe('layer-empty');
    expect(overlay.userEdges).toHaveLength(0);
    expectStillValid(map, overlay);
  });

  it('unpositioned candidates are skipped — a layer of only unmeasurable leaves orphans the node (C7, §6.2)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-ghosts', { x: 0, y: 0 });
    expect(overlay.userNodes).toHaveLength(1);
    expect(overlay.userEdges).toHaveLength(0); // ghost-a/ghost-b have no position — unmeasurable (§6.2)
    expectStillValid(map, overlay);
  });

  it('FX1: connects the 3 nearest leaves of the real fixture by euclid (C7, FX1)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 250 }); // Emiya Residence's spot
    const wp = overlay.userNodes[0].id;
    expect(targetsOf(overlay, wp)).toEqual(['emiya-residence', 'matou-residence', 'shopping-district']);
    expectStillValid(map, overlay);
  });

  it('unknown layer ⇒ field-precise refusal, nothing placed (C30, §6.2)', () => {
    const { f, map, overlay } = load(waypointMap());
    // A-017 follow-up: the gate reads the SAVED layer universe (A-014
    // discipline, F50) — an unknown id and an unsaved layer refuse alike.
    expect(() => f.addUserNodeAt('layer-nowhere', { x: 0, y: 0 })).toThrow(
      /\[TravelMapper\] addUserNodeAt: 'layer-nowhere' is not a saved layer id/,
    );
    expect(overlay.userNodes).toHaveLength(0);
    expect(overlay.userEdges).toHaveLength(0);
    expectStillValid(map, overlay);
  });
});

// --- engine-assigned ids (C5, §6.2) ---------------------------------------------------------

describe('rapid taps and id assignment (C5, §6.2)', () => {
  it('three rapid placements ⇒ three distinct node ids and distinct edge ids, colliding with nothing (C5)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    f.addUserNodeAt('layer-main', { x: 5, y: 0 });
    f.addUserNodeAt('layer-main', { x: 10, y: 5 });
    const ids = overlay.userNodes.map((nd) => nd.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3); // rapid creations cannot collide (C5)
    const libraryIds = new Set(map.nodes.map((nd) => nd.id));
    const edgeIds = overlay.userEdges.map((e) => e.id);
    const libraryEdgeIds = new Set(map.edges.map((e) => e.id));
    for (const id of ids) {
      expect(id).toMatch(/^wp-\d+$/);
      expect(libraryIds.has(id)).toBe(false);
    }
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
    for (const eid of edgeIds) {
      expect(eid).toMatch(/^we-\d+$/);
      expect(libraryEdgeIds.has(eid)).toBe(false);
    }
    // C7 over the MERGED node set: a later tap may connect to an earlier
    // waypoint (kind 'waypoint', childless — a merged leaf). wp-2's nearest
    // connectable nodes include wp-1 (d = 5, tied with n1 and inside the top 3).
    expect(edgeBetween(overlay, ids[0], ids[1])).toBeDefined();
    expectStillValid(map, overlay);
  });

  it('scheme-shaped authored ids cannot hijack the counter — the bump skips them (C5)', () => {
    const map = waypointMap();
    map.nodes.push({
      id: 'wp-1', label: 'Authored WP-shaped', kind: 'location', layer: 'layer-main', position: { x: 200, y: 0 },
    });
    const { f, overlay } = load(map);
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    expect(overlay.userNodes.map((nd) => nd.id)).toEqual(['wp-2']); // bumped past the taken id (C5)
    expectStillValid(map, overlay);
  });
});

// --- routing through waypoint edges (C14, §6.2, C8) ------------------------------------------

describe('waypoint edges route with edgeCost numbers — no parallel math (C14, §6.2)', () => {
  it('routes n1 → n2 through the waypoint; costs are pure geometry (C14, C17)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    const wp = overlay.userNodes[0].id;
    // No library arc n1–n2 exists — the route MUST traverse the waypoint edges.
    const r = f.findRoute('n1', 'n2');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(30); // euclid 10 + 20 at unitPerPx 1 — the numbers edgeCost computes
    expect(r.legs).toEqual([
      { arcId: edgeBetween(overlay, wp, 'n1'), from: 'n1', to: wp, mode: 'walk', modeLabel: 'walk', cost: 10 },
      { arcId: edgeBetween(overlay, wp, 'n2'), from: wp, to: 'n2', mode: 'walk', modeLabel: 'walk', cost: 20 },
    ]);
    expect(JSON.stringify(r)).not.toContain('Infinity'); // C17
    expectStillValid(map, overlay);
  });

  it('FX1: a waypoint edge prices through edgeCost — straight-line × unitPerPx (C14, §6.2, FX1)', () => {
    const { f, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 250 });
    const wp = overlay.userNodes[0].id;
    const r = f.findRoute(wp, 'matou-residence');
    expect(r.ok).toBe(true);
    expect(r.total).toBeCloseTo(euclid({ x: 100, y: 250 }, { x: 60, y: 210 }) * 0.2, 6);
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0].mode).toBe('walk');
    expect(r.legs[0].arcId).toBe(edgeBetween(overlay, wp, 'matou-residence'));
  });
});

// --- removal (§6.2, C7, C30) -------------------------------------------------------------------

describe('removeUserNode — node plus incident edges, others untouched (§6.2, C7)', () => {
  it('removes the node and exactly its incident edges; a sibling waypoint and its edges survive (§6.2)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 }); // wp-1 → n1, n2, n3
    f.addUserNodeAt('layer-main', { x: 100, y: 20 }); // wp-2 → n4, n3, n1 (no wp-1 connection)
    const [first, second] = overlay.userNodes.map((nd) => nd.id);
    expect(overlay.userEdges).toHaveLength(6);
    f.removeUserNode(first);
    expect(overlay.userNodes.map((nd) => nd.id)).toEqual([second]);
    expect(overlay.userEdges).toHaveLength(3);
    for (const e of overlay.userEdges) {
      expect(e.source === first || e.target === first).toBe(false); // incident edges gone (§6.2)
      expect(e.source === second || e.target === second).toBe(true); // the sibling's edges survive
    }
    expectStillValid(map, overlay);
  });

  it('a waypoint left orphaned by the removal stays (C7, §6.2)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-empty', { x: 0, y: 0 }); // wp-1
    f.addUserNodeAt('layer-empty', { x: 5, y: 0 }); // wp-2 — connects to wp-1 (merged leaf, C7)
    const [first, second] = overlay.userNodes.map((nd) => nd.id);
    expect(overlay.userEdges).toHaveLength(1); // wp-2's only connection is wp-1
    f.removeUserNode(first);
    expect(overlay.userNodes.map((nd) => nd.id)).toEqual([second]); // the orphan stays (C7)
    expect(overlay.userEdges).toHaveLength(0);
    expectStillValid(map, overlay);
  });

  it('refuses a library id and an unknown id, field-precisely (C30, §6.2)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    expect(() => f.removeUserNode('n1')).toThrow(/library node/);
    expect(() => f.removeUserNode('ghost')).toThrow(/unknown user node id 'ghost'/);
    expect(overlay.userNodes).toHaveLength(1); // nothing removed
    expectStillValid(map, overlay);
  });
});

// --- promotion (C26, D21, C24, F50) --------------------------------------------------------------

describe('promoteUserNode — atomic overlay → library move (C26, D21, C24)', () => {
  it('moves the node into map.nodes under the same id, origin authored, new label; edges move with ids kept (C26, D21)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    const wp = overlay.userNodes[0];
    f.promoteUserNode(wp.id, 'Ryuudou Gate');
    const promoted = map.nodes.find((nd) => nd.id === wp.id);
    expect(promoted).toMatchObject({
      id: wp.id, // SAME id (C26)
      label: 'Ryuudou Gate', // D21: promote names it
      kind: 'waypoint',
      layer: 'layer-main',
      position: { x: 0, y: 0 }, // position kept
      origin: 'authored', // origin flips (C26/§6.2)
    });
    expect(overlay.userNodes).toHaveLength(0); // left the overlay (C26)
    expect(overlay.userEdges).toHaveLength(0);
    expect(map.edges.filter((e) => e.id.startsWith('we-'))).toHaveLength(3); // ids kept (C26)
    // F50: both planes still validate after the move.
    expectStillValid(map, overlay);
    // C24: the library reference was mutated in place — routing over the
    // promoted edges works with no re-load.
    expect(f.findRoute('n1', 'n2').ok).toBe(true);
  });

  it('a second promote of the same id refuses — it is a library node now (C26, C30)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    const wp = overlay.userNodes[0].id;
    f.promoteUserNode(wp, 'Named');
    expect(() => f.promoteUserNode(wp, 'Again')).toThrow(/library node/);
    expect(map.nodes.find((nd) => nd.id === wp)?.label).toBe('Named'); // untouched by the refusal
    expectStillValid(map, overlay);
  });

  it('atomicity: a label that fails validation throws and leaves overlay + map byte-identical (C26, C30)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    const before = JSON.stringify([map, overlay]);
    expect(() => f.promoteUserNode(overlay.userNodes[0].id, '')).toThrow(/label must be a non-empty string/);
    expect(() => f.promoteUserNode(overlay.userNodes[0].id, undefined as unknown as string)).toThrow(
      /label must be a non-empty string/,
    );
    expect(JSON.stringify([map, overlay])).toBe(before); // C26: on failure NOTHING changed
    expectStillValid(map, overlay);
  });

  it('D61: an edge into a still-overlay waypoint stays chat-scoped — the promote succeeds and the pair edge waits', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 }); // wp-1 → n1, n2, n3
    f.addUserNodeAt('layer-main', { x: 5, y: 0 }); // wp-2 → n1, wp-1, n2 (C7 over the merged set)
    const [first, second] = overlay.userNodes.map((nd) => nd.id);
    const pairEdgeId = edgeBetween(overlay, first, second);
    expect(pairEdgeId).toBeDefined(); // the wp–wp edge exists

    f.promoteUserNode(first, 'Named'); // D61: succeeds — nothing dangles
    expect(map.edges.filter((e) => e.id.startsWith('we-'))).toHaveLength(3); // wp-1's library-bound edges graduated
    // wp-2 keeps ALL its edges in the overlay (its own n1/n2 edges were never
    // incident to wp-1) — including the pair edge, still chat-scoped (D61).
    expect(overlay.userEdges).toHaveLength(3);
    expect(overlay.userEdges.map((e) => e.id)).toContain(pairEdgeId);
    expectStillValid(map, overlay); // F50 — both planes valid, no dangling endpoint

    f.promoteUserNode(second, 'Also Named'); // the last overlay endpoint graduates the pair edge
    expect(overlay.userEdges).toHaveLength(0);
    expect(map.edges.some((e) => e.id === pairEdgeId)).toBe(true); // ids kept (C26)
    expectStillValid(map, overlay);
  });

  it('atomicity: a candidate map that would not validate refuses BEFORE mutating (C26, C30)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    const wp = overlay.userNodes[0].id;
    // C24 live-edit simulation: the library claims the id after placement —
    // absorbing the node would duplicate it, so the candidate map is invalid.
    map.nodes.push({ id: wp, label: 'Collision', kind: 'location', layer: 'layer-main', position: { x: 0, y: 0 } });
    const before = JSON.stringify([map, overlay]);
    expect(() => f.promoteUserNode(wp, 'Named')).toThrow(MapValidationError);
    expect(JSON.stringify([map, overlay])).toBe(before); // byte-identical (C26)
  });
});

// --- pin eligibility (D58) --------------------------------------------------------------------------

describe('waypoint pin (D58)', () => {
  it('setCurrentLocation accepts a placed waypoint; the effective pin is valid (D58)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    const wp = overlay.userNodes[0].id;
    expect(() => f.setCurrentLocation(wp)).not.toThrow(); // D58: 'waypoint' is pin-eligible
    expect(overlay.currentLocationId).toBe(wp);
    f.materialize();
    expect(facadeStateOf(f).effective?.pin).toEqual({ id: wp, valid: true }); // the D58 predicate over the merged set
    expectStillValid(map, overlay);
  });
});

// --- stale discipline (C8) -----------------------------------------------------------------------------

describe('stale discipline (C8)', () => {
  it('addUserNodeAt then findRoute with no explicit materialize sees the waypoint edges (C8)', () => {
    const { f, overlay } = load(waypointMap());
    expect(facadeStateOf(f).stale).toBe(false);
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    expect(facadeStateOf(f).stale).toBe(true); // the mutation set the flag (C8)
    const wp = overlay.userNodes[0].id;
    const r = f.findRoute('n1', 'n2'); // NO materialize() — ensureFresh must rebuild
    expect(facadeStateOf(f).stale).toBe(false); // the query consumed the flag (C8)
    expect(r.ok).toBe(true);
    expect(r.legs.map((l) => l.arcId)).toEqual([edgeBetween(overlay, wp, 'n1'), edgeBetween(overlay, wp, 'n2')]);
  });
});

// --- argument & lifecycle discipline ----------------------------------------------------------------

describe('no map loaded ⇒ every waypoint command throws the standard message', () => {
  it('all three refuse before anything else (§9 discipline)', () => {
    const f = createFacade();
    expect(() => f.addUserNodeAt('layer', { x: 0, y: 0 })).toThrow('[TravelMapper] no map loaded');
    expect(() => f.removeUserNode('wp-1')).toThrow('[TravelMapper] no map loaded');
    expect(() => f.promoteUserNode('wp-1', 'Named')).toThrow('[TravelMapper] no map loaded');
  });
});
