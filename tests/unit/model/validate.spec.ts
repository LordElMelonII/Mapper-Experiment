// Unit tests for the map/overlay validators (A-001).
// C30 — collected, field-precise, reject-before-mutate.
// C31/F50 — malformed or future-version data is refused, never half-loaded.
// §6.2 Data — duplicate ids, dangling edge endpoints, NaN coordinates,
// edges into compound parents.
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  MapValidationError,
  PIN_ELIGIBLE_KINDS,
  validateOverlay,
  validateWorldMap,
} from '../../../src/core/model/validate';
import type { ValidationIssue } from '../../../src/core/model/validate';
import type { ChatMapOverlay, WorldMapData } from '../../../src/core/api';

// --- fixtures & helpers ------------------------------------------------------

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
    {
      id: 'n-station',
      label: 'Fuyuki Station',
      kind: 'hub',
      layer: 'layer-city',
      parent: 'n-city',
      position: { x: 80, y: 20 },
      aliases: ['Station Front'],
      transit: { type: 'train', line: 'Fuyuki Line' },
    },
    { id: 'n-town', label: 'Misaki Town', kind: 'hub', layer: 'layer-world', position: { x: 5, y: 5 } },
  ],
  edges: [
    { id: 'e-bridge', source: 'n-emiya', target: 'n-station', modes: { walk: { allowed: true } } },
    { id: 'e-cross', source: 'n-station', target: 'n-town', modes: { train: { allowed: true, authoredMinutes: 300 } }, terrain: 'road' },
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

/** A deep clone of the valid map with one (deliberately invalid) mutation applied. */
const mutated = (apply: (m: any) => void): unknown => {
  const m = JSON.parse(JSON.stringify(validMap())) as any;
  apply(m);
  return m;
};

/** A deep clone of the valid overlay with a mutation applied. */
const mutatedOverlay = (apply: (o: any) => void): unknown => {
  const o = JSON.parse(JSON.stringify(validOverlay())) as any;
  apply(o);
  return o;
};

function mapIssues(data: unknown): ValidationIssue[] {
  try {
    validateWorldMap(data);
  } catch (e) {
    expect(e).toBeInstanceOf(MapValidationError);
    return (e as MapValidationError).issues;
  }
  throw new Error('expected validateWorldMap to refuse this data');
}

function overlayIssues(overlay: unknown, map: WorldMapData = validMap()): ValidationIssue[] {
  try {
    validateOverlay(overlay, map);
  } catch (e) {
    expect(e).toBeInstanceOf(MapValidationError);
    return (e as MapValidationError).issues;
  }
  throw new Error('expected validateOverlay to refuse this data');
}

function pathsOf(issues: ValidationIssue[]): string[] {
  return issues.map((i) => i.path);
}

function singlePath(issues: ValidationIssue[]): string {
  expect(issues).toHaveLength(1);
  return issues[0].path;
}

// --- validateWorldMap ---------------------------------------------------------

describe('validateWorldMap', () => {
  it('accepts a valid map and returns equivalent data (F50)', () => {
    const data = validMap();
    expect(validateWorldMap(data)).toEqual(data);
  });

  it('never mutates its input (C30 reject-before-mutate)', () => {
    const data = validMap();
    const snapshot = JSON.stringify(data);
    validateWorldMap(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('collects every issue into one report instead of failing on the first (C30)', () => {
    const issues = mapIssues(mutated((m) => {
      m.name = '';
      m.edges[0].target = 'ghost-node';
    }));
    expect(issues).toHaveLength(2);
    expect(pathsOf(issues)).toContain('name');
    expect(pathsOf(issues)).toContain('edges[0].target');
  });

  it('refuses non-object input (F50)', () => {
    for (const bad of [null, 42, 'map', [], true]) {
      expect(() => validateWorldMap(bad)).toThrow(MapValidationError);
    }
  });

  it(`requires schemaVersion ${CURRENT_SCHEMA_VERSION} — validate sees post-migration data (C31)`, () => {
    expect(singlePath(mapIssues(mutated((m) => { m.schemaVersion = CURRENT_SCHEMA_VERSION + 1; })))).toBe('schemaVersion');
    expect(singlePath(mapIssues(mutated((m) => { m.schemaVersion = 1; })))).toBe('schemaVersion');
    expect(singlePath(mapIssues(mutated((m) => { delete m.schemaVersion; })))).toBe('schemaVersion');
  });

  it('differentiates the schemaVersion refusal — a NEWER version is named unsupported, older/missing keep the migrate-first wording (C31/F50)', () => {
    const newer = mapIssues(mutated((m) => { m.schemaVersion = CURRENT_SCHEMA_VERSION + 1; }))[0].message;
    const older = mapIssues(mutated((m) => { m.schemaVersion = CURRENT_SCHEMA_VERSION - 1; }))[0].message;
    const missing = mapIssues(mutated((m) => { delete m.schemaVersion; }))[0].message;
    expect(newer).toContain(`unsupported schema version ${CURRENT_SCHEMA_VERSION + 1}`);
    expect(newer).toContain('newer than the supported version');
    expect(older).toContain(`must equal ${CURRENT_SCHEMA_VERSION}`);
    expect(older).toContain('migrate older data');
    expect(missing).toBe(older); // wrong-typed/missing data keeps the same advice
    expect(newer).not.toBe(older); // the two refusals are distinct messages
  });

  it('requires non-empty string id and name', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.id = ''; })))).toBe('id');
    expect(singlePath(mapIssues(mutated((m) => { m.id = 7; })))).toBe('id');
    expect(singlePath(mapIssues(mutated((m) => { delete m.name; })))).toBe('name');
  });

  it('requires at least one layer with unique non-empty ids and names', () => {
    // nodes/edges cleared so the layer defect is not cascaded into node
    // layer-reference issues — the cascade is correct (C30 collects it), the
    // isolation is for single-path precision.
    expect(singlePath(mapIssues(mutated((m) => { m.layers = []; m.nodes = []; m.edges = []; })))).toBe('layers');
    expect(singlePath(mapIssues(mutated((m) => { m.layers = 'World'; m.nodes = []; m.edges = []; })))).toBe('layers');
    expect(singlePath(mapIssues(mutated((m) => { delete m.layers[0].id; m.nodes = []; m.edges = []; })))).toBe('layers[0].id');
    expect(singlePath(mapIssues(mutated((m) => { m.layers[0].name = ''; })))).toBe('layers[0].name');
    expect(singlePath(mapIssues(mutated((m) => { m.layers.push({ ...m.layers[0] }); })))).toBe('layers[2].id');
  });

  it('requires a finite positive unitPerPx and a non-empty unitLabel (C11/D45)', () => {
    for (const bad of [0, -1, NaN, Infinity, 'x', undefined]) {
      expect(singlePath(mapIssues(mutated((m) => { m.scale.unitPerPx = bad; })))).toBe('scale.unitPerPx');
    }
    expect(singlePath(mapIssues(mutated((m) => { m.scale.unitLabel = ''; })))).toBe('scale.unitLabel');
  });

  it('requires unitKind distance|time (D45)', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.scale.unitKind = 'miles'; })))).toBe('scale.unitKind');
    expect(singlePath(mapIssues(mutated((m) => { delete m.scale.unitKind; })))).toBe('scale.unitKind');
  });

  it('requires terrain multiplier and speed values to be finite > 0 when present (C14 row 5)', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.scale.terrainMultipliers = { swamp: 0 }; })))).toBe('scale.terrainMultipliers.swamp');
    expect(singlePath(mapIssues(mutated((m) => { m.scale.speed = { walk: -2 }; })))).toBe('scale.speed.walk');
    expect(() => validateWorldMap(mutated((m) => {
      m.scale.terrainMultipliers = { road: 1.5, plain: 1 };
      m.scale.speed = { walk: 5, train: 60 };
    }))).not.toThrow();
  });

  it('refuses unknown keys in scale.speed / scale.terrainMultipliers — union-keyed like edge.modes (F50/C30)', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.scale.speed = { walk: 5, teleport: 99 }; })))).toBe('scale.speed.teleport');
    expect(singlePath(mapIssues(mutated((m) => { m.scale.terrainMultipliers = { road: 1.5, volcano: 3 }; })))).toBe('scale.terrainMultipliers.volcano');
    // known keys keep passing with valid values
    expect(() => validateWorldMap(mutated((m) => {
      m.scale.speed = { walk: 5, train: 60 };
      m.scale.terrainMultipliers = { road: 1.5, mountain: 2.5 };
    }))).not.toThrow();
  });

  it('requires node ids non-empty and unique across all nodes (§6.2 duplicate ids)', () => {
    // edges cleared: a node id wiped from the registry legitimately dangles its
    // edges — isolating the id defect for a single-path assertion
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[2].id = ''; m.edges = []; })))).toBe('nodes[2].id');
    expect(singlePath(mapIssues(mutated((m) => { m.nodes.push({ ...m.nodes[1] }); })))).toBe('nodes[4].id');
  });

  it('requires node labels non-empty and kinds in the NodeKind union', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[0].label = ''; })))).toBe('nodes[0].label');
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[0].kind = 'castle'; })))).toBe('nodes[0].kind');
  });

  it('requires node layers to reference existing layer ids', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[1].layer = 'layer-nope'; })))).toBe('nodes[1].layer');
  });

  it('requires parents to reference an existing node (§6.2)', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[1].parent = 'ghost'; })))).toBe('nodes[1].parent');
  });

  it('rejects a node as its own parent', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[0].parent = 'n-city'; })))).toBe('nodes[0].parent');
  });

  it('requires a parent on the same layer as the node (§6.2)', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[3].parent = 'n-city'; })))).toBe('nodes[3].parent');
  });

  it('rejects cyclic parent chains, reported once (§6.2)', () => {
    const issues = mapIssues(mutated((m) => {
      m.edges = [];
      m.nodes[1].parent = 'n-station'; // Emiya -> Station
      m.nodes[2].parent = 'n-emiya';   // Station -> Emiya
    }));
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('nodes[1].parent');
    expect(issues[0].message).toMatch(/cyclic/i);
  });

  it('rejects NaN and infinite coordinates (§6.2 NaN coordinates)', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[1].position.x = NaN; })))).toBe('nodes[1].position.x');
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[2].position.y = Infinity; })))).toBe('nodes[2].position.y');
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[1].position.x = '10'; })))).toBe('nodes[1].position.x');
  });

  it('accepts missing positions and rejects malformed ones', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[1].position = 'top left'; })))).toBe('nodes[1].position');
    expect(singlePath(mapIssues(mutated((m) => { delete m.nodes[1].position.x; })))).toBe('nodes[1].position.x');
  });

  it('requires aliases to be unique non-empty strings when present (D11/D26)', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[2].aliases = ['Station Front', 'Station Front']; })))).toBe('nodes[2].aliases[1]');
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[2].aliases = ['']; })))).toBe('nodes[2].aliases[0]');
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[2].aliases = 'Station Front'; })))).toBe('nodes[2].aliases');
  });

  it('requires transit.type in {train, port, subway} and origin authored|user when present', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[2].transit = { type: 'bus' }; })))).toBe('nodes[2].transit.type');
    expect(singlePath(mapIssues(mutated((m) => { m.nodes[1].origin = 'imported'; })))).toBe('nodes[1].origin');
  });

  it('requires edge ids unique (§6.2 duplicate ids)', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.edges.push({ ...m.edges[0] }); })))).toBe('edges[2].id');
  });

  it('requires endpoints to reference existing nodes and differ (§6.2 dangling endpoints, no self-loops)', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].source = 'ghost'; })))).toBe('edges[0].source');
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].target = 'ghost'; })))).toBe('edges[0].target');
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].target = 'n-emiya'; })))).toBe('edges[0].source');
  });

  it('requires leaf endpoints — no edges into compound parents (C1, §6.2)', () => {
    expect(singlePath(mapIssues(mutated((m) => {
      m.edges.push({ id: 'e-bad', source: 'n-city', target: 'n-town', modes: {} });
    })))).toBe('edges[2].source');
  });

  it('requires modes keys within {walk, car, train} and boolean allowed flags', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].modes.bike = { allowed: true }; })))).toBe('edges[0].modes.bike');
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].modes.walk = { allowed: 'yes' }; })))).toBe('edges[0].modes.walk.allowed');
    expect(singlePath(mapIssues(mutated((m) => { delete m.edges[0].modes; })))).toBe('edges[0].modes');
  });

  it('requires authoredMinutes finite >= 0 and multiplier finite > 0 when present (D14)', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].modes.walk.authoredMinutes = -5; })))).toBe('edges[0].modes.walk.authoredMinutes');
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].modes.walk.authoredMinutes = NaN; })))).toBe('edges[0].modes.walk.authoredMinutes');
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].modes.walk.multiplier = 0; })))).toBe('edges[0].modes.walk.multiplier');
    expect(singlePath(mapIssues(mutated((m) => { m.edges[1].modes.train.multiplier = Infinity; })))).toBe('edges[1].modes.train.multiplier');
  });

  it('accepts an edge with modes {} — legal, never traversable (C14 row 2)', () => {
    expect(() => validateWorldMap(mutated((m) => { m.edges[0].modes = {}; }))).not.toThrow();
  });

  it('requires terrain in the Terrain union and authoredDistance finite >= 0 (D14)', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.edges[1].terrain = 'sky'; })))).toBe('edges[1].terrain');
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].authoredDistance = -1; })))).toBe('edges[0].authoredDistance');
    expect(() => validateWorldMap(mutated((m) => { m.edges[0].authoredDistance = 0; }))).not.toThrow();
  });

  it('requires blocked.reason non-empty when blocked (C2/D20)', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].blocked = {}; })))).toBe('edges[0].blocked.reason');
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].blocked = { reason: '' }; })))).toBe('edges[0].blocked.reason');
    expect(() => validateWorldMap(mutated((m) => { m.edges[0].blocked = { reason: 'bridge collapsed' }; }))).not.toThrow();
  });

  it('requires curve.distances to be finite numbers and fare finite >= 0 when present', () => {
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].curve = { distances: [10, 'x'] }; })))).toBe('edges[0].curve.distances[1]');
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].curve = { distances: [NaN] }; })))).toBe('edges[0].curve.distances[0]');
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].curve = { distances: 'bendy' }; })))).toBe('edges[0].curve.distances');
    expect(singlePath(mapIssues(mutated((m) => { m.edges[0].fare = -0.5; })))).toBe('edges[0].fare');
    expect(() => validateWorldMap(mutated((m) => {
      m.edges[0].curve = { distances: [10, 20] };
      m.edges[0].fare = 0;
    }))).not.toThrow();
  });
});

// --- validateOverlay -----------------------------------------------------------

describe('validateOverlay', () => {
  it('accepts a valid overlay against a valid map (F50)', () => {
    expect(validateOverlay(validOverlay(), validMap())).toEqual(validOverlay());
  });

  it('requires mapId to be a string or null', () => {
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { delete o.mapId; })))).toBe('mapId');
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { o.mapId = 7; })))).toBe('mapId');
    expect(() => validateOverlay(mutatedOverlay((o) => { o.mapId = null; }), validMap())).not.toThrow();
  });

  it('tolerates a pin on an unknown node (C27) but never on a container (C1/F27)', () => {
    expect(() => validateOverlay(mutatedOverlay((o) => { o.currentLocationId = 'vanished-node'; }), validMap())).not.toThrow();
    expect(() => validateOverlay(mutatedOverlay((o) => { o.currentLocationId = null; }), validMap())).not.toThrow();
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { o.currentLocationId = 'n-city'; })))).toBe('currentLocationId');
  });

  it('refuses a pin on a childless container kind and on a leaf kind with children; accepts every leaf kind (C1/F27, D58)', () => {
    const withNode = (node: Record<string, unknown>): WorldMapData =>
      mutated((m) => { m.nodes.push(node); }) as WorldMapData;
    const pinTo = (id: string): ChatMapOverlay => ({ ...validOverlay(), currentLocationId: id });

    // childless district: 'districts never hold it' is unconditional (F27, D58)
    const emptyDistrict = withNode({ id: 'n-shinto', label: 'Shinto', kind: 'district', layer: 'layer-city' });
    expect(singlePath(overlayIssues(pinTo('n-shinto'), emptyDistrict))).toBe('currentLocationId');

    // pin-eligible kind, but a child parents to it — no longer pin-eligible (D58)
    const parentedLeaf = withNode({ id: 'n-kid', label: 'Kid', kind: 'location', layer: 'layer-city', parent: 'n-emiya' });
    expect(singlePath(overlayIssues(pinTo('n-emiya'), parentedLeaf))).toBe('currentLocationId');

    // every leaf kind of the frozen contract may hold the pin (D58)
    for (const kind of ['location', 'hub', 'waypoint'] as const) {
      const leafMap = withNode({ id: 'n-leaf', label: 'Leaf', kind, layer: 'layer-city' });
      expect(() => validateOverlay(pinTo('n-leaf'), leafMap), `kind '${kind}' should hold the pin`).not.toThrow();
    }
  });

  it('requires travelMode in {walk, car, train}', () => {
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { delete o.travelMode; })))).toBe('travelMode');
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { o.travelMode = 'teleport'; })))).toBe('travelMode');
    expect(() => validateOverlay(mutatedOverlay((o) => { o.travelMode = 'car'; }), validMap())).not.toThrow();
  });

  it('requires statusNote to be a string when present (D17)', () => {
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { o.statusNote = 42; })))).toBe('statusNote');
    expect(() => validateOverlay(mutatedOverlay((o) => { o.statusNote = 'on the road to Misaki'; }), validMap())).not.toThrow();
  });

  it('forbids parent on user nodes — a tap inside a compound yields a top-level node (§6.2/D21)', () => {
    expect(singlePath(overlayIssues(mutatedOverlay((o) => {
      o.userNodes = [{ id: 'u1', label: 'Camp', kind: 'waypoint', layer: 'layer-city', parent: 'n-city' }];
    })))).toBe('userNodes[0].parent');
  });

  it('requires user node ids unique within the overlay and free of library collisions (C5)', () => {
    expect(singlePath(overlayIssues(mutatedOverlay((o) => {
      o.userNodes = [{ id: 'n-emiya', label: 'Impostor', kind: 'location', layer: 'layer-city' }];
    })))).toBe('userNodes[0].id');
    expect(singlePath(overlayIssues(mutatedOverlay((o) => {
      o.userNodes = [
        { id: 'u1', label: 'Camp', kind: 'waypoint', layer: 'layer-city' },
        { id: 'u1', label: 'Camp 2', kind: 'waypoint', layer: 'layer-city' },
      ];
    })))).toBe('userNodes[1].id');
  });

  it('applies full node rules to user nodes: layer must exist in the map, kind in the union', () => {
    expect(singlePath(overlayIssues(mutatedOverlay((o) => {
      o.userNodes = [{ id: 'u1', label: 'Camp', kind: 'waypoint', layer: 'layer-nope' }];
    })))).toBe('userNodes[0].layer');
    expect(singlePath(overlayIssues(mutatedOverlay((o) => {
      o.userNodes = [{ id: 'u1', label: 'Camp', kind: 'castle', layer: 'layer-city' }];
    })))).toBe('userNodes[0].kind');
  });

  it('accepts a wired user node and rejects bad user edge endpoints (C1/§6.2)', () => {
    const ok = mutatedOverlay((o) => {
      o.userNodes = [{ id: 'u1', label: 'Riverside Camp', kind: 'waypoint', layer: 'layer-city', position: { x: 40, y: 60 }, origin: 'user' }];
      o.userEdges = [{ id: 'ue1', source: 'u1', target: 'n-station', modes: { walk: { allowed: true } } }];
    });
    expect(() => validateOverlay(ok, validMap())).not.toThrow();

    expect(singlePath(overlayIssues(mutatedOverlay((o) => {
      o.userEdges = [{ id: 'ue1', source: 'ghost', target: 'n-station', modes: {} }];
    })))).toBe('userEdges[0].source');
    expect(singlePath(overlayIssues(mutatedOverlay((o) => {
      o.userEdges = [{ id: 'ue1', source: 'n-city', target: 'n-station', modes: {} }];
    })))).toBe('userEdges[0].source');
    expect(singlePath(overlayIssues(mutatedOverlay((o) => {
      o.userEdges = [{ id: 'ue1', source: 'n-station', target: 'n-station', modes: {} }];
    })))).toBe('userEdges[0].source');
  });

  it('requires user edge ids unique within the overlay', () => {
    expect(singlePath(overlayIssues(mutatedOverlay((o) => {
      o.userEdges = [
        { id: 'ue1', source: 'n-emiya', target: 'n-station', modes: {} },
        { id: 'ue1', source: 'n-station', target: 'n-town', modes: {} },
      ];
    })))).toBe('userEdges[1].id');
  });

  it('refuses a user edge id colliding with a library edge id — user NODE collisions are refused, edges must match (C5/F50)', () => {
    const issues = overlayIssues(mutatedOverlay((o) => {
      o.userEdges = [{ id: 'e-bridge', source: 'n-town', target: 'n-emiya', modes: { walk: { allowed: true } } }];
    }));
    expect(singlePath(issues)).toBe('userEdges[0].id');
    expect(issues[0].message).toMatch(/library edge id/);
  });

  it('requires blocked keys to reference library or user edges with non-empty reasons (D20)', () => {
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { o.blocked = { 'e-ghost': 'why' }; })))).toBe('blocked.e-ghost');
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { o.blocked = { 'e-bridge': '' }; })))).toBe('blocked.e-bridge');
    expect(() => validateOverlay(mutatedOverlay((o) => { o.blocked = { 'e-bridge': 'bridge is out' }; }), validMap())).not.toThrow();
  });

  it('accepts a block on a user edge (D20)', () => {
    const ok = mutatedOverlay((o) => {
      o.userNodes = [{ id: 'u1', label: 'Camp', kind: 'waypoint', layer: 'layer-city' }];
      o.userEdges = [{ id: 'ue1', source: 'u1', target: 'n-emiya', modes: { walk: { allowed: true } } }];
      o.blocked = { ue1: 'flooded' };
    });
    expect(() => validateOverlay(ok, validMap())).not.toThrow();
  });

  it('requires nodeBlocked keys to reference library or user nodes with non-empty reasons (D94/C34)', () => {
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { o.nodeBlocked = { 'n-ghost': 'why' }; })))).toBe('nodeBlocked.n-ghost');
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { o.nodeBlocked = { 'n-station': '' }; })))).toBe('nodeBlocked.n-station');
    expect(() => validateOverlay(mutatedOverlay((o) => { o.nodeBlocked = { 'n-station': 'flooded' }; }), validMap())).not.toThrow();
  });

  it('refuses a missing or non-object nodeBlocked like blocked (F50/C30)', () => {
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { delete o.nodeBlocked; })))).toBe('nodeBlocked');
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { o.nodeBlocked = 'nope'; })))).toBe('nodeBlocked');
    expect(singlePath(overlayIssues(mutatedOverlay((o) => { o.nodeBlocked = null; })))).toBe('nodeBlocked');
  });

  it('collects every nodeBlocked issue into one report (C30)', () => {
    const issues = overlayIssues(mutatedOverlay((o) => {
      o.nodeBlocked = { 'n-ghost': 'why', 'n-station': '' };
    }));
    expect(pathsOf(issues).sort()).toEqual(['nodeBlocked.n-ghost', 'nodeBlocked.n-station']);
  });

  it('accepts a node block on a user node (D94/C34)', () => {
    const ok = mutatedOverlay((o) => {
      o.userNodes = [{ id: 'u1', label: 'Camp', kind: 'waypoint', layer: 'layer-city' }];
      o.nodeBlocked = { u1: 'camp flooded' };
    });
    expect(() => validateOverlay(ok, validMap())).not.toThrow();
  });
});

// --- pin eligibility vocabulary (D58) -------------------------------------------

describe('pin eligibility (C1/F27, D58)', () => {
  it('PIN_ELIGIBLE_KINDS is exactly the leaf kinds {location, hub, waypoint} of the frozen NodeKind union (D58)', () => {
    expect([...PIN_ELIGIBLE_KINDS].sort()).toEqual(['hub', 'location', 'waypoint']);
  });
});

// --- mode registry (D78) ------------------------------------------------------------------------

describe('mode registry (D78)', () => {
  const horse = { id: 'horse', label: 'Horseback', unit: 'leagues per day', speed: 10, allowedByDefault: false };

  it('accepts a registry beside the scale block: edge.modes and scale.speed may reference the declared ids (D78)', () => {
    const data = mutated((m) => {
      m.modes = [horse, { id: 'airship', label: 'Airship', allowedByDefault: true }];
      m.edges[0].modes = { horse: { allowed: true } };
      m.scale.speed = { airship: 200 };
    });
    expect(validateWorldMap(data)).toEqual(data);
  });

  it('an entry may adopt a built-in id to relabel it — the label then wins everywhere the id would display (D78/C23)', () => {
    const data = mutated((m) => {
      m.modes = [{ id: 'walk', label: 'On Foot', allowedByDefault: true }];
    });
    expect(validateWorldMap(data)).toEqual(data);
  });

  it('rejects a duplicate registry id at the second occurrence (C30/D78)', () => {
    const issues = mapIssues(mutated((m) => {
      m.modes = [horse, { ...horse }];
    }));
    expect(singlePath(issues)).toBe('modes[1].id');
    expect(issues[0].message).toBe("duplicate mode id 'horse'");
  });

  it('rejects an empty label (C30/D78)', () => {
    const issues = mapIssues(mutated((m) => {
      m.modes = [{ id: 'horse', label: '', allowedByDefault: true }];
    }));
    expect(singlePath(issues)).toBe('modes[0].label');
  });

  it('rejects a speed that is not a finite number > 0 (C30/D78)', () => {
    for (const speed of [0, -5, null]) {
      const issues = mapIssues(mutated((m) => {
        m.modes = [{ id: 'horse', label: 'Horseback', speed, allowedByDefault: true }];
      }));
      expect(singlePath(issues)).toBe('modes[0].speed');
    }
  });

  it('rejects a non-boolean allowedByDefault (C30/D78)', () => {
    const issues = mapIssues(mutated((m) => {
      m.modes = [{ id: 'horse', label: 'Horseback', allowedByDefault: 'yes' }];
    }));
    expect(singlePath(issues)).toBe('modes[0].allowedByDefault');
  });

  it('unknown registry-id references in edge.modes are C30 rejections listing the key and the universe (D78)', () => {
    const issues = mapIssues(mutated((m) => {
      m.modes = [horse];
      m.edges[0].modes = { balloon: { allowed: true } };
    }));
    expect(singlePath(issues)).toBe('edges[0].modes.balloon');
    expect(issues[0].message).toBe("unknown travel mode 'balloon' — must be one of: walk, car, train, horse");
  });

  it('scale.speed keys check against the same map-relative universe (D78)', () => {
    const issues = mapIssues(mutated((m) => {
      m.modes = [horse];
      m.scale.speed = { balloon: 3 };
    }));
    expect(singlePath(issues)).toBe('scale.speed.balloon');
    expect(issues[0].message).toContain('walk, car, train, horse');
  });

  it('absent modes field ⇒ exactly the old universe: the built-in trio, nothing else (D78 no-registry compat)', () => {
    const issues = mapIssues(mutated((m) => {
      m.edges[0].modes = { horse: { allowed: true } };
    }));
    expect(singlePath(issues)).toBe('edges[0].modes.horse');
    expect(issues[0].message).toBe("unknown travel mode 'horse' — must be one of: walk, car, train");
  });

  it('validateOverlay: a registry mode is valid chat state; garbage lists the map universe, strictly (D78)', () => {
    const map = validateWorldMap(mutated((m) => {
      m.modes = [horse];
    }));
    expect(() => validateOverlay(mutatedOverlay((o) => { o.travelMode = 'horse'; }), map)).not.toThrow();
    const issues = overlayIssues(mutatedOverlay((o) => { o.travelMode = 'balloon'; }), map);
    expect(singlePath(issues)).toBe('travelMode');
    expect(issues[0].message).toBe('must be one of: walk, car, train, horse');
  });
});
