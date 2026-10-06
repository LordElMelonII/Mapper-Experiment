// VERIFIER (Agent D) — adversarial validator sweep: C30, C31, F50, and the
// EXECUTION-PLAN §6.2 "Data" edge-case slice in scope at M1
// (duplicate ids · dangling edge endpoints · NaN coordinates · edges into
// compound parents · imported map with newer schemaVersion ⇒ refuse).
//
// Expectations derived from CORE.md/PRODUCT.md/§6.2 only. Tests labeled
// FINDING encode the verifier's spec-derived position and are expected RED
// at this gate — each matches a reported finding; a green run after a fix
// (or a registered interpretation) retires both.
import { describe, expect, it } from 'vitest';
import { MapValidationError, validateOverlay, validateWorldMap } from '../../src/core/model/validate';
import type { ValidationIssue } from '../../src/core/model/validate';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

// --- helpers -------------------------------------------------------------------

const validMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-demo',
  name: 'Two-Town Demo',
  layers: [
    { id: 'layer-world', name: 'World' },
    { id: 'layer-city', name: 'Fuyuki City' },
  ],
  scale: { unitPerPx: 0.05, unitLabel: 'km', unitKind: 'distance' },
  nodes: [
    { id: 'n-city', label: 'Fuyuki City', kind: 'city', layer: 'layer-city' },
    { id: 'n-emiya', label: 'Emiya Residence', kind: 'location', layer: 'layer-city', parent: 'n-city', position: { x: 10, y: 20 } },
    { id: 'n-station', label: 'Fuyuki Station', kind: 'hub', layer: 'layer-city', parent: 'n-city', position: { x: 80, y: 20 } },
    { id: 'n-town', label: 'Misaki Town', kind: 'hub', layer: 'layer-world', position: { x: 5, y: 5 } },
  ],
  edges: [
    { id: 'e-bridge', source: 'n-emiya', target: 'n-station', modes: { walk: { allowed: true } } },
    { id: 'e-cross', source: 'n-station', target: 'n-town', modes: { train: { allowed: true, authoredMinutes: 300 } } },
  ],
});

const validOverlay = (): ChatMapOverlay => ({
  mapId: 'map-demo',
  currentLocationId: 'n-emiya',
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {}, nodeBlocked: {},
});

const clone = (v: unknown): any => JSON.parse(JSON.stringify(v));

function issuesOf(validate: () => void): ValidationIssue[] {
  try {
    validate();
  } catch (e) {
    expect(e).toBeInstanceOf(MapValidationError);
    return (e as MapValidationError).issues;
  }
  throw new Error('expected validation to refuse this data');
}

// --- C30 collection, sharpened ---------------------------------------------------

describe('C30 — collected, field-precise refusal (F50)', () => {
  it('collects defects across EVERY section of one document into a single report (§6.2 Data)', () => {
    const m = clone(validMap());
    m.schemaVersion = 3;                    // 1: schemaVersion (post-migration contract, C31)
    m.name = '';                            // 2: name
    m.scale.unitPerPx = 0;                  // 3: scale
    m.nodes[1].position.x = NaN;            // 4: NaN coordinate (§6.2)
    m.nodes.push({ ...m.nodes[1] });        // 5: duplicate node id (§6.2)
    m.edges.push({                          // 6+7+8: compound-parent endpoint (§6.2),
      id: 'e-bad',                          //        dangling endpoint (§6.2),
      source: 'n-city',                     //        unknown mode key
      target: 'ghost-node',
      modes: { bike: { allowed: true } },
    });
    const issues = issuesOf(() => validateWorldMap(m));
    const paths = issues.map((i) => i.path);
    for (const expected of [
      'schemaVersion', 'name', 'scale.unitPerPx', 'nodes[1].position.x',
      'nodes[4].id', 'edges[2].source', 'edges[2].target', 'edges[2].modes.bike',
    ]) {
      expect(paths, `missing field-precise path '${expected}'`).toContain(expected);
    }
  });

  it('never mutates the overlay it validates, and loadMap never mutates either input (C30)', () => {
    const map = validMap();
    const overlay = validOverlay();
    overlay.userNodes = [{ id: 'u-camp', label: 'Camp', kind: 'waypoint', layer: 'layer-city', position: { x: 1, y: 2 } }];
    overlay.blocked = { 'e-bridge': 'rockslide' };
    const mapSnap = JSON.stringify(map);
    const overlaySnap = JSON.stringify(overlay);

    validateOverlay(overlay, map);
    const f = createFacade();
    f.loadMap(map, overlay);

    expect(JSON.stringify(map)).toBe(mapSnap);
    expect(JSON.stringify(overlay)).toBe(overlaySnap);
  });
});

// --- FINDINGS: spec-derived positions that are expected RED at this gate ---------

describe('FINDINGS — verifier positions, see report (expected RED until triaged)', () => {
  it('FINDING 1 (F50/C30): unknown keys inside scale.speed / scale.terrainMultipliers must be refused — edge.modes rejects them, the scale maps silently pass (one-line repro: scale.speed = { teleport: 5 })', () => {
    const m = clone(validMap());
    m.scale.speed = { walk: 5, teleport: 99 }; // 'teleport' is not a TravelMode
    expect(() => validateWorldMap(m)).toThrow(MapValidationError);
    const m2 = clone(validMap());
    m2.scale.terrainMultipliers = { volcano: 3 }; // not a Terrain
    expect(() => validateWorldMap(m2)).toThrow(MapValidationError);
  });

  it('FINDING 2 (C5/F50): a user edge id colliding with a library edge id must be refused — user NODE collisions are refused, user EDGE collisions are not, and would yield duplicate ids in the effective graph (one-line repro: userEdges = [{ id: "e-bridge", ... }])', () => {
    const o = clone(validOverlay());
    o.userEdges = [{ id: 'e-bridge', source: 'n-town', target: 'n-emiya', modes: { walk: { allowed: true } } }];
    expect(() => validateOverlay(o, validMap())).toThrow(MapValidationError);
  });

  it('FINDING 3 (C1/F27, interpretation-dependent): a childless kind:district must not hold the pin — C1 says containers never hold it, unconditionally; the implementation only forbids nodes that currently have children (one-line repro: setCurrentLocation on a district with zero children)', () => {
    const m = clone(validMap());
    // an EMPTY district: kind declares the container, no node parents to it yet
    m.nodes.push({ id: 'n-empty-district', label: 'Shinto', kind: 'district', layer: 'layer-city' });
    const o = clone(validOverlay());
    o.currentLocationId = 'n-empty-district';
    expect(() => validateOverlay(o, validateWorldMap(m))).toThrow(MapValidationError);

    const f = createFacade();
    f.loadMap(validateWorldMap(m), { ...o, userNodes: [], userEdges: [], blocked: {}, nodeBlocked: {} });
    expect(() => f.setCurrentLocation('n-empty-district')).toThrow(/C1|container|leaf/i);
  });
});

// --- §6.2 Data slice through the facade (C30/C31 seams) ---------------------------

describe('§6.2 Data slice through loadMap — refuse before mutate, prior load stays queryable', () => {
  it('a refused OVERLAY leaves the prior map, overlay, rebuilt graph and stale flag untouched (C30)', () => {
    const f = createFacade();
    const map = validMap();
    const overlay = validOverlay();
    f.loadMap(map, overlay);
    f.materialize();
    const before = facadeStateOf(f);
    const effectiveBefore = before.effective;
    expect(before.stale).toBe(false);

    // D78/C32: an unknown travelMode no longer refuses a load (loadMap
    // degrades it to 'walk'), so the refusal defect is a dangling blocked key.
    const badOverlay = clone(overlay);
    badOverlay.blocked['ghost-edge'] = 'no such arc';
    expect(() => f.loadMap(validMap(), badOverlay)).toThrow(MapValidationError);

    const after = facadeStateOf(f);
    expect(after.map).toBe(map);              // same live reference (C24)
    expect(after.overlay).toBe(overlay);
    expect(after.effective).toBe(effectiveBefore); // no rebuild happened either
    expect(after.stale).toBe(false);
  });

  it("a map with a newer schemaVersion is refused at 'schemaVersion' and the prior load stays queryable (C31, §6.2)", () => {
    const f = createFacade();
    f.loadMap(validMap(), validOverlay());
    f.materialize();
    const pinBefore = facadeStateOf(f).effective?.pin;

    const future = clone(validMap());
    future.schemaVersion = 3;
    let err: unknown = null;
    try {
      f.loadMap(future, validOverlay());
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MapValidationError);
    expect((err as MapValidationError).issues[0].path).toBe('schemaVersion');

    // prior load still queryable: materialize rebuilds the OLD map without error
    expect(() => f.materialize()).not.toThrow();
    expect(facadeStateOf(f).effective?.pin).toEqual(pinBefore);
    expect(facadeStateOf(f).map?.id).toBe('map-demo');
  });

  it('an older schemaVersion is refused by loadMap too — migration is explicit via migrateData (C31)', () => {
    const f = createFacade();
    const older = clone(validMap());
    older.schemaVersion = 1;
    let err: unknown = null;
    try {
      f.loadMap(older, validOverlay());
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MapValidationError);
    expect((err as MapValidationError).issues[0].path).toBe('schemaVersion');
    expect(facadeStateOf(f).map).toBeNull(); // never half-loaded (F50)
  });
});
