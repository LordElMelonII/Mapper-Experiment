// VERIFIER (Agent D) — FX1 fixture fidelity, derived INDEPENDENTLY from
// `Notes for locations.md` (repo root), never from the fixture or its tests.
//
// Method: the legacy lookup table in the notes is transcribed here in full
// (66 DIST pairs + the TRANSIT lines). Every authored cost the fixture ships
// must trace to that table (FX1: "Derived from Notes for locations.md"),
// values included — a number in the fixture that the table does not contain
// is FX gaming. FX1's sparseness is legal (D55: the hand-authored fixture is
// held to plausible geography plus FX2, not to all pairs).
//
// IDs: FX1, FX2 (topological preconditions only — the route assertion is M2's),
// C2, C3, C6, F09, F14, F17, F21, D20, D45, D54.
import { describe, expect, it } from 'vitest';
import { fuyukiMap } from '../../data/worlds/fuyuki';

// --- the legacy table, transcribed from `Notes for locations.md` -------------
// DIST(min): abbreviations exactly as in the notes' KEY line.
const DIST: Record<string, number> = {
  'E|SD': 12, 'E|Sc': 18, 'E|M': 22, 'E|T': 28, 'E|RT': 50, 'E|O': 30,
  'E|B': 25, 'E|S': 50, 'E|H': 40, 'E|GH': 55, 'E|C': 60, 'E|EC': 270,
  'SD|Sc': 10, 'SD|M': 12, 'SD|T': 15, 'SD|RT': 45, 'SD|O': 25,
  'SD|B': 15, 'SD|S': 40, 'SD|H': 40, 'SD|GH': 40, 'SD|C': 45, 'SD|EC': 265,
  'Sc|M': 15, 'Sc|T': 15, 'Sc|RT': 40, 'Sc|O': 15, 'Sc|B': 25,
  'Sc|S': 50, 'Sc|H': 50, 'Sc|GH': 45, 'Sc|C': 55, 'Sc|EC': 255,
  'M|T': 5, 'M|RT': 55, 'M|O': 20, 'M|B': 25, 'M|S': 55,
  'M|H': 50, 'M|GH': 45, 'M|C': 50, 'M|EC': 260,
  'T|RT': 60, 'T|O': 20, 'T|B': 25, 'T|S': 60, 'T|H': 55,
  'T|GH': 45, 'T|C': 50, 'T|EC': 260,
  'RT|O': 45, 'RT|B': 60, 'RT|S': 85, 'RT|H': 80, 'RT|GH': 85,
  'RT|C': 95, 'RT|EC': 285,
  'O|B': 35, 'O|S': 60, 'O|H': 65, 'O|GH': 50, 'O|C': 60,
  'B|S': 25, 'B|H': 15, 'B|GH': 20, 'B|C': 35, 'B|EC': 275,
  'S|H': 15, 'S|GH': 15, 'S|C': 20, 'S|EC': 300,
  'H|GH': 25, 'H|C': 30, 'H|EC': 305,
  'GH|C': 15, 'GH|EC': 290,
  'C|EC': 300,
};
// TRANSIT:
//   S:MT 5h(train) — D54 wording: Fuyuki Station ↔ Misaki Town, train, 5h = 300 min
//   O:EC 4h(walk), 1h(car) — one arc, two modes
//   RT:Cavern 3km(sub) — the Cavern is not one of the 13 locations; excluded.
const TRANSIT_WALK: Record<string, number> = { 'O|EC': 240 };
const TRANSIT_CAR: Record<string, number> = { 'O|EC': 60 };
const TRANSIT_TRAIN: Record<string, number> = { 'S|MT': 300 };

// KEY abbreviations → the fixture node ids FX1/D54 name.
const ID_OF: Record<string, string> = {
  E: 'emiya-residence', SD: 'shopping-district', Sc: 'homurahara-academy',
  M: 'matou-residence', T: 'tohsaka-residence', RT: 'ryuudou-temple',
  O: 'outskirts', B: 'fuyuki-bridge', S: 'fuyuki-station', H: 'harbor',
  GH: 'ghost-house', C: 'kotomine-church', EC: 'einzbern-castle',
  MT: 'misaki-town',
};

function pairKey(idA: string, idB: string): string | undefined {
  const abbrevs = Object.entries(ID_OF).filter(([, id]) => id === idA || id === idB).map(([a]) => a);
  if (abbrevs.length !== 2) return undefined;
  const [x, y] = abbrevs;
  return `${x}|${y}` in DIST || `${x}|${y}` in TRANSIT_WALK || `${x}|${y}` in TRANSIT_TRAIN
    ? `${x}|${y}`
    : `${y}|${x}`;
}

// --- every authored cost traces to the legacy table ---------------------------

describe('FX1 fidelity — every authored cost traces to the legacy table (FX1, D55)', () => {
  it('each arc mode cost equals the DIST/TRANSIT value for its unordered pair', () => {
    for (const edge of fuyukiMap.edges) {
      const key = pairKey(edge.source, edge.target);
      // the pair must be one the table knows — no invented connections (C4)
      expect(key, `edge '${edge.id}' pairs nodes the legacy table does not list`).toBeDefined();
      if (key === undefined) continue;
      for (const [mode, spec] of Object.entries(edge.modes)) {
        expect(spec, `edge '${edge.id}' mode '${mode}'`).toBeDefined();
        if (mode === 'walk') {
          expect(spec!.authoredMinutes, `edge '${edge.id}' walk`).toBe(
            DIST[key] ?? TRANSIT_WALK[key],
          );
        } else if (mode === 'car') {
          expect(spec!.authoredMinutes, `edge '${edge.id}' car`).toBe(TRANSIT_CAR[key]);
        } else if (mode === 'train') {
          expect(spec!.authoredMinutes, `edge '${edge.id}' train`).toBe(TRANSIT_TRAIN[key]);
        }
      }
    }
  });

  it('carries the TRANSIT line O:EC as ONE arc with both walk (4h) and car (1h) allowed', () => {
    const arc = fuyukiMap.edges.filter((e) => {
      const ids = [e.source, e.target].sort();
      return ids.join('|') === 'einzbern-castle|outskirts';
    });
    expect(arc).toHaveLength(1); // one arc, two modes (C6: no reverse duplicate)
    expect(arc[0].modes['walk']).toEqual({ allowed: true, authoredMinutes: 240 });
    expect(arc[0].modes['car']).toEqual({ allowed: true, authoredMinutes: 60 });
  });

  it('carries the TRANSIT line S:MT as the cross-layer train arc, 5h = 300 min (F17, C3, D54)', () => {
    const arc = fuyukiMap.edges.find(
      (e) => e.source === 'fuyuki-station' && e.target === 'misaki-town',
    );
    expect(arc).toBeDefined();
    expect(arc!.modes).toEqual({ train: { allowed: true, authoredMinutes: 300 } });
  });

  it('excludes the RT:Cavern(sub) transit line — the Cavern is not one of the 13 locations', () => {
    expect(fuyukiMap.nodes.some((n) => /cavern/i.test(n.id + ' ' + n.label))).toBe(false);
    for (const edge of fuyukiMap.edges) {
      expect(Object.keys(edge.modes)).not.toContain('sub');
    }
  });
});

// --- structure, names, unit, blocked sample ------------------------------------

describe('FX1 fidelity — structure, names, canonical unit, blocked sample (FX1)', () => {
  it('has exactly 13 leaves on the Fuyuki layer (the KEY line minus Misaki) plus Misaki Town', () => {
    const fuyukiLeaves = fuyukiMap.nodes.filter(
      (n) => n.layer === 'layer-fuyuki' && n.kind !== 'district',
    );
    const misakiLeaves = fuyukiMap.nodes.filter((n) => n.layer === 'layer-misaki');
    expect(fuyukiLeaves).toHaveLength(13);
    expect(misakiLeaves.map((n) => n.id)).toEqual(['misaki-town']);

    // all 13 KEY names present as labels (D54: 'Station Front' is an alias of Fuyuki Station)
    const labels = new Set(fuyukiMap.nodes.map((n) => n.label));
    for (const name of [
      'Emiya Residence', 'Shopping District', 'Homurahara Academy', 'Matou Residence',
      'Tohsaka Residence', 'Ryuudou Temple', 'Outskirts', 'Fuyuki Bridge',
      'Fuyuki Station', 'Harbor', 'Kotomine Church', 'Ghost House', 'Einzbern Castle',
      'Misaki Town',
    ]) {
      expect(labels.has(name), `missing label '${name}'`).toBe(true);
    }
  });

  it('keeps the notes-derivable aliases: Station Front, Big Bridge, Edelfelt Mansion (F08, D11, D54)', () => {
    const aliasesOf = (id: string): string[] =>
      fuyukiMap.nodes.find((n) => n.id === id)?.aliases ?? [];
    expect(aliasesOf('fuyuki-station')).toContain('Station Front'); // KEY: S:Station Front
    expect(aliasesOf('fuyuki-bridge')).toContain('Big Bridge'); // notes' blocked-route example
    expect(aliasesOf('ghost-house')).toContain('Edelfelt Mansion'); // KEY: GH:Ghost House (Edelfelt Mansion)
  });

  it('canonical unit is TIME in minutes, matching the legacy DIST(min) table (F21, D45, FX1)', () => {
    expect(fuyukiMap.scale.unitKind).toBe('time');
    expect(fuyukiMap.scale.unitLabel).toBe('min');
  });

  it('exactly one blocked arc — the Emiya↔Bridge sample — with the notes-verbatim reason (F14, C2, D20)', () => {
    const blocked = fuyukiMap.edges.filter((e) => e.blocked !== undefined);
    expect(blocked.map((e) => e.id)).toEqual(['arc-emiya-residence-fuyuki-bridge']);
    // blocked ≠ hidden: still authored with its table cost (E:B = 25), still carrying the reason
    expect(blocked[0].blocked!.reason).toBe('Bridge closed by local authorities');
    expect(blocked[0].modes['walk']).toEqual({ allowed: true, authoredMinutes: 25 });
  });

  it('districts organize only — no arc touches a container; children share the container layer (C1, F07)', () => {
    const districts = fuyukiMap.nodes.filter((n) => n.kind === 'district');
    expect(districts.length).toBeGreaterThanOrEqual(1); // FX1: "districts"
    const arcEndpoints = new Set(fuyukiMap.edges.flatMap((e) => [e.source, e.target]));
    for (const district of districts) {
      expect(arcEndpoints.has(district.id), `district '${district.id}' terminates an arc (C1)`).toBe(false);
      const layerOf = new Map(fuyukiMap.nodes.map((n) => [n.id, n.layer]));
      for (const child of fuyukiMap.nodes.filter((n) => n.parent === district.id)) {
        expect(child.layer).toBe(district.layer);
        expect(child.kind).not.toBe('district');
      }
    }
  });
});

// --- FX2 topological preconditions (the route assertion itself is M2's) ---------

/** Plain Dijkstra over walk-allowed arcs, weight = authored minutes (FX1 canonical unit). */
function shortestWalkMinutes(from: string, to: string, excluded: ReadonlySet<string> = new Set()): number {
  const dist = new Map<string, number>([[from, 0]]);
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (!done.has(id) && d < best) {
        cur = id;
        best = d;
      }
    }
    if (cur === null) return Infinity;
    if (cur === to) return best;
    done.add(cur);
    for (const edge of fuyukiMap.edges) {
      if (excluded.has(edge.id)) continue;
      if (edge.blocked !== undefined) continue; // C2: blocked arcs are excluded from routing
      const walk = edge.modes['walk'];
      if (!walk?.allowed || walk.authoredMinutes === undefined) continue;
      // C6: bidirectional — try both directions
      const neighbors: string[] = [];
      if (edge.source === cur) neighbors.push(edge.target);
      if (edge.target === cur) neighbors.push(edge.source);
      for (const next of neighbors) {
        if (done.has(next)) continue;
        const candidate = best + walk.authoredMinutes;
        if (candidate < (dist.get(next) ?? Infinity)) dist.set(next, candidate);
      }
    }
  }
}

describe('FX2 topological preconditions (FX2, C14 row 3, C6) — full route assertion is M2', () => {
  it('direct Emiya→Fuyuki Station walk arc exists, walk-only, at the table value 50 min', () => {
    const arc = fuyukiMap.edges.find((e) => {
      const ids = [e.source, e.target].sort().join('|');
      return ids === 'emiya-residence|fuyuki-station';
    });
    expect(arc).toBeDefined();
    expect(Object.keys(arc!.modes)).toEqual(['walk']); // walk-only: no train shortcut on land
    expect(arc!.modes['walk']).toEqual({ allowed: true, authoredMinutes: 50 });
  });

  it('that direct arc is strictly the cheapest walk path Emiya→Station (FX2 leg 1 stays optimal at M2)', () => {
    // Re-derived, blocked arcs excluded per C2 (the blocked E–B 25 + B–S 25
    // would tie at 50): via Shopping District, E→SD 12 + SD→B 15 + B→S 25 = 52;
    // everything unblocked and direct-free is longer. Assert the invariant, not
    // the alternative's exact value: with the direct arc removed, the walkable
    // graph is still connected but costs strictly more.
    const alternative = shortestWalkMinutes(
      'emiya-residence',
      'fuyuki-station',
      new Set(['arc-emiya-residence-fuyuki-station']),
    );
    expect(alternative).toBeGreaterThan(50);
    expect(alternative).toBeLessThan(Infinity);
  });

  it('Misaki Town is reachable ONLY through the station arc — FX2 must pass through Fuyuki Station', () => {
    const incident = fuyukiMap.edges.filter((e) => e.source === 'misaki-town' || e.target === 'misaki-town');
    expect(incident.map((e) => e.id)).toEqual(['arc-fuyuki-station-misaki-town']);
  });
});
