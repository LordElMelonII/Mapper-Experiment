// P2 M3 gate — adversarial waypoint/overlay suite (verifier). Expectations
// derive from the SPEC — CORE.md C1/C2/C5/C7/C26/C30, register D21/D61/D74,
// EXECUTION-PLAN §6.2 "Waypoints & overlay" + "Geometry & routing" slices,
// PRODUCT.md F10/F26 — never from the implementation. Covers the seams the
// unit suites and my prior adversarial suites do not:
//   1. the D61 graduation SPLIT under chat blocks on BOTH edge kinds (a
//      library-bound edge graduating WITH its block while the pair edge stays
//      overlay with its own), validated (F50) at every step;
//   2. a C30 FINDING (expected RED until triaged): promoteUserNode accepts a
//      whitespace-only label — the exact defect class the P2 M2 gate ruling
//      fixed at the setBlocked seam (whitespace-only reason);
//   3. the rapid-tap id storm (C5) beyond the unit suite's three taps;
//   4. bare-Node pins of the pure projection's NEW M3 facts: authored curve
//      data ⇒ tme-curved + verbatim curveDistances + constant curveWeights
//      (B-111/D7/R1), C2-vs-curve orthogonality, and the overlay-block merge
//      on USER edges (p2m1 pinned the library-edge merge only).
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { buildLayerElements } from '../../src/app/graph/layer-elements';
import { MapValidationError, validateOverlay, validateWorldMap } from '../../src/core/model/validate';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

const splitMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-split-verify',
  name: 'Graduation Split (verify)',
  layers: [{ id: 'layer-main', name: 'Main' }],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
  nodes: [
    { id: 'n1', label: 'Near', kind: 'location', layer: 'layer-main', position: { x: 0, y: 0 } },
    { id: 'n2', label: 'Mid', kind: 'location', layer: 'layer-main', position: { x: 0, y: 30 } },
    { id: 'n3', label: 'Far', kind: 'location', layer: 'layer-main', position: { x: 30, y: 0 } },
  ],
  edges: [],
});

const load = (map: WorldMapData) => {
  const overlay: ChatMapOverlay = {
    mapId: map.id,
    currentLocationId: null,
    travelMode: 'walk',
    userNodes: [],
    userEdges: [],
    blocked: {}, nodeBlocked: {},
  };
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

const edgeBetween = (overlay: ChatMapOverlay, a: string, b: string): string => {
  const edge = overlay.userEdges.find(
    (e) => (e.source === a && e.target === b) || (e.source === b && e.target === a),
  );
  if (edge === undefined) throw new Error(`no user edge between ${a} and ${b}`);
  return edge.id;
};

// ---------------------------------------------------------------------------
// 1. D61 graduation split under blocks on BOTH edge kinds (D61, C2, C26, F50).
//    wp1 at (0,10): kNN = {n1 (10), n2 (20), n3 (√1000 ≈ 31.6)} ⇒ 3 library
//    edges. wp2 at (5,10): kNN = {wp1 (5), n1 (√125 ≈ 11.2), n2 (√425 ≈ 20.6)}
//    ⇒ 2 library edges + the wp2–wp1 pair edge.
// ---------------------------------------------------------------------------

describe('D61 × C2 — the graduation split carries each edge kind correctly, blocks included (D61, C2, C26, F50)', () => {
  it('promoting wp1 graduates ITS library-bound edges WITH their block; wp2 stays overlay with the pair edge AND its own library-bound edges; the second promote graduates everything (D61, C2, F50)', () => {
    const { f, map, overlay } = load(splitMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 10 });
    f.addUserNodeAt('layer-main', { x: 5, y: 10 });
    const [wp1, wp2] = overlay.userNodes.map((nd) => nd.id);
    const eLib = edgeBetween(overlay, wp1!, 'n1'); // graduates on wp1's promote
    const ePair = edgeBetween(overlay, wp1!, wp2!); // stays until BOTH promote
    const eW2n1 = edgeBetween(overlay, wp2!, 'n1'); // wp2's own library-bound edges
    const eW2n2 = edgeBetween(overlay, wp2!, 'n2'); // (graduate on wp2's promote)
    f.setBlocked(eLib, 'landslide');
    f.setBlocked(ePair, 'flooded');

    f.promoteUserNode(wp1!, 'Camp One');

    // D61: wp1's THREE library-bound edges moved into map.edges, ids kept;
    // the overlay keeps wp2's edges — the pair edge AND wp2's own two
    // library-bound edges (they graduate only when wp2 promotes).
    expect(map.edges.map((e) => e.id)).toEqual(expect.arrayContaining([eLib]));
    expect(map.edges).toHaveLength(3);
    expect(overlay.userEdges.map((e) => e.id)).toContain(ePair);
    expect(overlay.userEdges).toHaveLength(3);
    // C2: each blocked edge's block rides the merge — the graduated key now
    // targets a LIBRARY edge and stays valid (D20/F50).
    const eff = facadeStateOf(f).effective!;
    expect(eff.edges.find((e) => e.id === eLib)?.blocked).toEqual({ reason: 'landslide' });
    expect(eff.edges.find((e) => e.id === ePair)?.blocked).toEqual({ reason: 'flooded' });
    // The promoted node: same id, origin flipped, named (C26/D21).
    const promoted = map.nodes.find((nd) => nd.id === wp1!);
    expect(promoted).toMatchObject({ id: wp1, label: 'Camp One', origin: 'authored' });
    // F50: both planes still validate after the split.
    expect(() => validateWorldMap(map)).not.toThrow();
    expect(() => validateOverlay(overlay, map)).not.toThrow();

    // The second promote graduates wp2's remaining edges (its last overlay
    // endpoint is gone); every block key stays valid against the library.
    f.promoteUserNode(wp2!, 'Camp Two');
    expect(overlay.userEdges).toHaveLength(0);
    expect(map.edges).toHaveLength(6);
    expect(() => validateOverlay(overlay, map)).not.toThrow();
    const eff2 = facadeStateOf(f).effective!;
    expect(eff2.edges.find((e) => e.id === ePair)?.blocked).toEqual({ reason: 'flooded' });
    // C2 on graduated edges: the route n1→n2 (√125 + √425 ≈ 31.80 km through
    // Camp Two) must ride ONLY unblocked edges — the blocked we- edges stay
    // routing-excluded after graduation (C2, D61).
    const r = f.findRoute('n1', 'n2');
    expect(r.ok).toBe(true);
    expect(r.total).toBeCloseTo(Math.sqrt(125) + Math.sqrt(425), 6);
    expect(r.legs.map((leg) => leg.arcId)).toEqual([eW2n1, eW2n2]);
    expect(r.legs.map((leg) => leg.arcId)).not.toContain(eLib);
    expect(r.legs.map((leg) => leg.arcId)).not.toContain(ePair);
    expect(r.unit).toBe('km');
    expect(JSON.stringify(r)).not.toContain('Infinity');
  });

  it('C26 atomicity under the split: a promote refusal (id claimed by a live edit) leaves the map, overlay AND both blocks byte-identical (C26, C30)', () => {
    const { f, map, overlay } = load(splitMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 10 });
    f.addUserNodeAt('layer-main', { x: 5, y: 10 });
    const [wp1, wp2] = overlay.userNodes.map((nd) => nd.id);
    f.setBlocked(edgeBetween(overlay, wp1!, 'n1'), 'landslide');
    f.setBlocked(edgeBetween(overlay, wp1!, wp2!), 'flooded');
    map.nodes.push({ id: wp1!, label: 'Collision', kind: 'location', layer: 'layer-main', position: { x: 0, y: 10 } });
    const before = JSON.stringify([map, overlay]);
    expect(() => f.promoteUserNode(wp1!, 'Camp One')).toThrow(MapValidationError);
    expect(JSON.stringify([map, overlay])).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 2. FINDING (expected RED until triaged) — C30/F50 consistency at the
//    promote seam: promoteUserNode validates `typeof label !== 'string' ||
//    label.length === 0` but NOT whitespace-only labels, while the SAME
//    packet family's setBlocked refuses whitespace-only reasons (P2 M2
//    verifier finding 3, fixed in-facade and unit-pinned: "Whitespace-only is
//    the same defect — a Phase 4 host caller could otherwise persist a
//    blank-looking reason that reaches prompts verbatim"). A whitespace-named
//    promotion persists a library node whose label renders as blank space in
//    every prompt-facing structure it later appears in (routes/via/labels).
//    The dev-harness UI trims and disables Promote, so the defect is
//    unreachable from THIS milestone's UI — severity: minor (C30 consistency
//    + Phase 4 host-caller exposure). One-line repro:
//    f.promoteUserNode(wp, '   ')  ⇒ currently accepted.
// ---------------------------------------------------------------------------

describe('FINDING — see report (expected RED until triaged)', () => {
  it('FINDING C30-consistency: promoteUserNode must refuse a whitespace-only label, the setBlocked precedent (C30, D21, F50)', () => {
    const { f, map, overlay } = load(splitMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 10 });
    const wp = overlay.userNodes[0]!.id;
    const before = JSON.stringify([map, overlay]);
    expect(() => f.promoteUserNode(wp, '   ')).toThrow(/non-empty/);
    expect(JSON.stringify([map, overlay])).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 3. C5 rapid-tap storm — ten placements without materialize between them
//    (C8: mutations only set stale; addUserNodeAt works off live references),
//    then place-remove-place (counter monotonicity).
// ---------------------------------------------------------------------------

describe('C5 — a ten-tap storm and a removal keep every id engine-assigned and collision-free (C5, C8, §6.2)', () => {
  it('10 rapid placements ⇒ 10 distinct wp- ids + 30 distinct we- ids; merged planes validate; remove-then-place never reuses an id (C5, F50)', () => {
    const { f, map, overlay } = load(splitMap());
    for (let i = 0; i < 10; i++) {
      f.addUserNodeAt('layer-main', { x: 100 + i * 40, y: 100 + (i % 3) * 25 });
    }
    const nodeIds = overlay.userNodes.map((nd) => nd.id);
    expect(new Set(nodeIds).size).toBe(10);
    expect(nodeIds.every((id) => /^wp-\d+$/.test(id))).toBe(true);
    // Every placement connects k=3 leaves of the ever-growing merged set.
    expect(overlay.userEdges).toHaveLength(30);
    const edgeIds = overlay.userEdges.map((e) => e.id);
    expect(new Set(edgeIds).size).toBe(30);
    expect(edgeIds.every((id) => /^we-\d+$/.test(id))).toBe(true);
    expect(() => validateOverlay(overlay, map)).not.toThrow();

    // Remove the fifth waypoint and place again: the new id is fresh (the
    // counter never reissues), and only that waypoint's edges died (§6.2).
    const victim = nodeIds[4]!;
    f.removeUserNode(victim);
    const remaining = overlay.userNodes.map((nd) => nd.id);
    expect(remaining).not.toContain(victim);
    f.addUserNodeAt('layer-main', { x: 250, y: 60 });
    const newest = overlay.userNodes[overlay.userNodes.length - 1]!.id;
    expect(newest).not.toBe(victim);
    expect(overlay.userNodes.map((nd) => nd.id).filter((id) => id === newest)).toHaveLength(1);
    expect(() => validateOverlay(overlay, map)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. Bare-Node pins of the pure projection's M3 facts (buildLayerElements —
//    type-only imports, no DOM). The e2e proves the RESOLVED style through
//    the mounted pipeline; these pin the projection DATA the stylesheet
//    consumes, so a regression cannot hide behind a runtime default.
// ---------------------------------------------------------------------------

const curveMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-curve-verify',
  name: 'Curve Projection (verify)',
  layers: [{ id: 'layer-c', name: 'C' }],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
  nodes: [
    { id: 's1', label: 'One', kind: 'location', layer: 'layer-c', position: { x: 0, y: 0 } },
    { id: 's2', label: 'Two', kind: 'location', layer: 'layer-c', position: { x: 100, y: 0 } },
    { id: 's3', label: 'Three', kind: 'location', layer: 'layer-c', position: { x: 0, y: 100 } },
  ],
  edges: [
    { id: 'arc-curved', source: 's1', target: 's2', modes: { walk: { allowed: true } }, curve: { distances: [40, -30] } },
    { id: 'arc-straight', source: 's2', target: 's3', modes: { walk: { allowed: true } } },
    {
      id: 'arc-blocked-curved',
      source: 's1',
      target: 's3',
      modes: { walk: { allowed: true } },
      blocked: { reason: 'closed' },
      curve: { distances: [10, 20, 30] },
    },
  ],
});

const curveOverlay = (): ChatMapOverlay => ({
  mapId: 'map-curve-verify',
  currentLocationId: 's1',
  travelMode: 'walk',
  userNodes: [
    { id: 'wp-c1', label: 'Waypoint', kind: 'waypoint', layer: 'layer-c', position: { x: 50, y: 50 }, origin: 'user' },
  ],
  userEdges: [{ id: 'we-c1', source: 'wp-c1', target: 's2', modes: { walk: { allowed: true } } }],
  blocked: { 'we-c1': 'trail closed' },
  nodeBlocked: {},
});

const nodeOf = (elements: ReturnType<typeof buildLayerElements>, id: string) => {
  const hit = elements.find((el) => el.group === 'nodes' && el.data.id === id);
  if (hit === undefined) throw new Error(`node ${id} missing from projection`);
  return hit;
};

const edgeOf = (elements: ReturnType<typeof buildLayerElements>, id: string) => {
  const hit = elements.find((el) => el.group === 'edges' && el.data.id === id);
  if (hit === undefined) throw new Error(`edge ${id} missing from projection`);
  return hit;
};

describe('buildLayerElements — M3 curve projection (§5 M3, api.ts:45, B-111, D7, R1)', () => {
  it('an authored curved edge gains tme-curved + VERBATIM curveDistances (negatives preserved) + a constant-weight array matching the control-point count (B-111, R1)', () => {
    const el = edgeOf(buildLayerElements(curveMap(), null, 'layer-c'), 'arc-curved');
    expect(el.classes).toContain('tme-curved');
    expect(el.data!['curveDistances']).toEqual([40, -30]); // verbatim — the builder computes nothing (R1)
    expect(el.data!['curveWeights']).toEqual([0.5, 0.5]); // one weight per control point (the runtime's min(len) rule)
  });

  it('a straight edge carries NO tme-curved class and NO curve data (per-edge data, not per-layer)', () => {
    const el = edgeOf(buildLayerElements(curveMap(), null, 'layer-c'), 'arc-straight');
    expect(el.classes).not.toContain('tme-curved');
    expect(el.data!['curveDistances']).toBeUndefined();
    expect(el.data!['curveWeights']).toBeUndefined();
  });

  it('C2 is orthogonal to curve-style: an authored-blocked curved edge carries BOTH tme-blocked and tme-curved (C2, D7)', () => {
    const el = edgeOf(buildLayerElements(curveMap(), null, 'layer-c'), 'arc-blocked-curved');
    expect(el.classes).toContain('tme-blocked');
    expect(el.classes).toContain('tme-curved');
    expect(el.data!['curveDistances']).toEqual([10, 20, 30]);
    expect(el.data!['curveWeights']).toEqual([0.5, 0.5, 0.5]);
  });

  it('an overlay block on a USER edge renders tme-blocked — the merge reads overlay.blocked on the user plane too (C2/D20; p2m1 pinned the library edge only)', () => {
    const el = edgeOf(buildLayerElements(curveMap(), curveOverlay(), 'layer-c'), 'we-c1');
    expect(el.classes).toContain('tme-blocked');
    // And the same edge projects as an ordinary on-layer edge otherwise
    // (D61: user edges project like library edges).
    expect(el.data).toMatchObject({ id: 'we-c1', source: 'wp-c1', target: 's2' });
  });

  it('R4: the projection copies element positions — mutating the projection never touches the overlay (R4, C24)', () => {
    const overlay = curveOverlay();
    const els = buildLayerElements(curveMap(), overlay, 'layer-c');
    const node = nodeOf(els, 'wp-c1') as { position?: { x: number; y: number } };
    node.position!.x = 99999;
    expect(overlay.userNodes[0]!.position!.x).toBe(50); // the live reference is untouched
  });
});
