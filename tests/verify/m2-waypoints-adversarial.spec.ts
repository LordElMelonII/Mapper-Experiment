// M2 gate — adversarial waypoint suite (verifier, PKG D-M2).
// Seams the A-007 unit suite does not reach: blocks × waypoint lifecycle
// (C2/D20 × D61/C26), engine id counters under scheme-shaped authored EDGE ids
// (C5), the pinned-waypoint removal seam (C27/C8/D58), and two runtime-lie
// findings against the F50 invariant ("the overlay and map both still validate
// after every command's happy path AND after every refusal" — A-007 packet
// acceptance). Expectations derive from the spec, never from the code.
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { MapValidationError, validateOverlay, validateWorldMap } from '../../src/core/model/validate';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

const waypointMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-waypoints-verify',
  name: 'Waypoint Layout (verify)',
  layers: [{ id: 'layer-main', name: 'Main' }],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
  nodes: [
    { id: 'n1', label: 'Near', kind: 'location', layer: 'layer-main', position: { x: 10, y: 0 } },
    { id: 'n2', label: 'Mid', kind: 'location', layer: 'layer-main', position: { x: 0, y: 20 } },
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

const edgeBetween = (overlay: ChatMapOverlay, a: string, b: string): string | undefined =>
  overlay.userEdges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a))?.id;

// --- FINDING A (expected RED until triaged) ---------------------------------------------
//
// F50/A-007 acceptance: "the overlay and map both still validate after every
// command's happy path AND after every refusal". removeUserNode deletes the
// node and its incident user edges but leaves any overlay.blocked entry for a
// deleted user edge behind; validateOverlay refuses dangling block keys
// (D20: "every key an existing edge id"), so the persisted chat state can no
// longer load (loadMap → validateOverlay throws). C2's overlay may only ADD
// blocks, but a block on an edge the SAME command just removed is dead weight
// the validator punishes — cleanup is removeUserNode's job (C33 spirit).

describe('FINDING A — see report (expected RED until triaged)', () => {
  it('FINDING A (F50/C2/D20): removeUserNode must clean up overlay blocks on its incident user edges — a blocked-then-removed waypoint edge leaves a dangling blocked key that validateOverlay and loadMap refuse (one-line repro: place wp, setBlocked("we-1", "closed"), removeUserNode(wp), validateOverlay throws)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    const wp = overlay.userNodes[0].id;
    const edgeId = overlay.userEdges[0].id;
    f.setBlocked(edgeId, 'waypoint path closed');
    f.removeUserNode(wp);

    // F50: the overlay must still validate after the happy path.
    expect(() => validateOverlay(overlay, map)).not.toThrow();
    // The persistence seam (D21: waypoints persist per chat): the same state
    // must load back — loadMap validates the overlay (C30) and must not refuse
    // state its own commands produced.
    expect(() =>
      createFacade().loadMap(
        JSON.parse(JSON.stringify(map)),
        JSON.parse(JSON.stringify(overlay)),
      ),
    ).not.toThrow();
  });
});

// --- FINDING B (expected RED until triaged) ---------------------------------------------
//
// C30/F50 runtime-lie discipline (the setStatusNote / setBlocked /
// promoteUserNode-label precedent): a runtime caller can lie about a typed
// argument, so the command validates before mutating. addUserNodeAt validates
// the layer but not `position` — a NaN/Infinity position is accepted and the
// persisted overlay then FAILS validateOverlay ("position.x must be a finite
// number"), poisoning the next chat load. §6.2 Data: "NaN coordinates ⇒
// validator rejects pre-cy.add" — the rejection must happen before the
// overlay is mutated, not at some later load.

describe('FINDING B — see report (expected RED until triaged)', () => {
  it('FINDING B (C30/F50, §6.2): addUserNodeAt must refuse a non-finite position before mutating the overlay (one-line repro: f.addUserNodeAt("layer-main", { x: NaN, y: 0 }))', () => {
    const { f, map, overlay } = load(waypointMap());
    expect(() => f.addUserNodeAt('layer-main', { x: NaN, y: 0 })).toThrow();
    expect(() => f.addUserNodeAt('layer-main', { x: 0, y: Infinity })).toThrow();
    expect(overlay.userNodes).toHaveLength(0); // nothing placed by the refused calls
    expect(() => validateOverlay(overlay, map)).not.toThrow();
  });
});

// --- C5: the EDGE id counter vs scheme-shaped authored ids -------------------------------

describe('C5 — engine-assigned user EDGE ids cannot collide with authored scheme-shaped ids (C5, §6.2)', () => {
  it('an authored edge already named we-1 ⇒ the first user edge is we-2 (the bump covers both id spaces, C5)', () => {
    const map = waypointMap();
    map.edges.push({ id: 'we-1', source: 'n1', target: 'n3', modes: { walk: { allowed: true } } });
    const { f, map: m, overlay } = load(map);
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    expect(overlay.userEdges.length).toBeGreaterThan(0);
    for (const e of overlay.userEdges) {
      expect(e.id).not.toBe('we-1'); // rapid creation cannot collide (C5)
      expect(e.id).toMatch(/^we-\d+$/);
    }
    expect(overlay.userEdges[0].id).toBe('we-2'); // the counter bumped past the taken id
    // F50: the merged planes still validate (the collision would be an issue).
    expect(() => validateWorldMap(m)).not.toThrow();
    expect(() => validateOverlay(overlay, m)).not.toThrow();
  });
});

// --- C2/D20 over user edges: chat blocks reach waypoint arcs too -------------------------

describe('C2/D20 — chat-scoped blocks apply to USER edges in routing (C2, D20, C8)', () => {
  it('blocking a waypoint edge severs the waypoint path (ok:false + reason); lifting restores it (C2, D20)', () => {
    const { f, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    const wp = overlay.userNodes[0].id;
    const e1 = edgeBetween(overlay, wp, 'n1');
    const e2 = edgeBetween(overlay, wp, 'n2');
    expect(e1).toBeDefined();
    expect(e2).toBeDefined();

    // Unblocked: n1→n2 has NO library arc — the only path is through the
    // waypoint at pure-geometry cost 10 + 20 = 30 (§6.2: same cost function).
    expect(f.findRoute('n1', 'n2')).toMatchObject({ ok: true, total: 30 });

    f.setBlocked(e1!, 'trail flooded'); // D20: chat-scoped, no materialize() needed (C8)
    const r = f.findRoute('n1', 'n2');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/blocked or disallowed/); // C17 translation at the seam
    expect(JSON.stringify(r)).not.toContain('Infinity'); // C17

    f.setBlocked(e1!, undefined); // D20 lift
    expect(f.findRoute('n1', 'n2').ok).toBe(true); // restored
  });
});

// --- D61 × D20 seam: a chat block on a wp–wp pair edge survives both promotions ----------

describe('D61/C2 — a chat block on a pair edge graduates with the edge and stays blocked (D61, C2, C26, F50)', () => {
  it('block the wp–wp edge, promote both endpoints ⇒ the graduated library edge is still blocked; both planes still validate (D61, C2, F50)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 }); // wp-1 → n1, n2, n3
    f.addUserNodeAt('layer-main', { x: 5, y: 0 }); // wp-2 → n1, wp-1, n2 (C7 merged leaves)
    const [first, second] = overlay.userNodes.map((nd) => nd.id);
    const pairEdgeId = edgeBetween(overlay, first, second);
    expect(pairEdgeId).toBeDefined();

    f.setBlocked(pairEdgeId!, 'path overgrown');
    f.promoteUserNode(first, 'Named One'); // library-bound edges graduate; pair edge stays (D61)
    f.promoteUserNode(second, 'Named Two'); // last overlay endpoint ⇒ pair edge graduates (D61)

    // The pair edge kept its id into the library; the overlay block key now
    // targets a LIBRARY edge and the effective graph must still report it
    // blocked with the chat's reason (C2: the overlay adds, never lifts).
    f.materialize(); // rebuild the derived plane — the promotes only set the stale flag (C8)
    const eff = facadeStateOf(f).effective!;
    expect(eff.edges.find((e) => e.id === pairEdgeId)?.blocked).toEqual({ reason: 'path overgrown' });
    expect(overlay.userEdges).toHaveLength(0);
    expect(() => validateWorldMap(map)).not.toThrow(); // F50
    expect(() => validateOverlay(overlay, map)).not.toThrow(); // F50 — the graduated key is no longer dangling
  });
});

// --- C27/C8/D58 seam: removing the PINNED waypoint ---------------------------------------

describe('C27/C8 — removing the pinned waypoint keeps the pin verbatim, marked invalid, never snapped (C27, D58, C8)', () => {
  it('pin a placed waypoint, remove it ⇒ pin id kept, valid:false in the effective graph (C27, D58)', () => {
    const { f, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    const wp = overlay.userNodes[0].id;
    f.setCurrentLocation(wp); // D58: a waypoint may hold the pin
    f.materialize();
    expect(facadeStateOf(f).effective!.pin).toEqual({ id: wp, valid: true });

    f.removeUserNode(wp);
    f.materialize();
    expect(overlay.currentLocationId).toBe(wp); // kept verbatim — never snapped (C27/D39)
    expect(facadeStateOf(f).effective!.pin).toEqual({ id: wp, valid: false }); // invalid, not gone
  });
});

// --- C26 atomicity under a blocked graduating edge ---------------------------------------

describe('C26 — a promote refusal leaves even the BLOCK state untouched (C26, C30)', () => {
  it('a failed promote (id claimed by a live edit) keeps the overlay blocked map and user edges byte-identical (C26)', () => {
    const { f, map, overlay } = load(waypointMap());
    f.addUserNodeAt('layer-main', { x: 0, y: 0 });
    const wp = overlay.userNodes[0].id;
    f.setBlocked(overlay.userEdges[0].id, 'sealed');
    // C24 live-edit simulation: the library claims the id after placement.
    map.nodes.push({ id: wp, label: 'Collision', kind: 'location', layer: 'layer-main', position: { x: 0, y: 0 } });
    const before = JSON.stringify([map, overlay]);
    expect(() => f.promoteUserNode(wp, 'Named')).toThrow(MapValidationError);
    expect(JSON.stringify([map, overlay])).toBe(before); // C26: on failure NOTHING changed — blocks included
  });
});
