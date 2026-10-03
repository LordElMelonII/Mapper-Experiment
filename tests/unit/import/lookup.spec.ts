// Unit tests for the legacy lookup-table importer (PKG A-010, import/lookup.ts).
//
// Parsing rulings (packet A-010): KEY maps abbreviations to full names (names
// become node labels, abbreviations the node ids); DIST(min) rows are walking
// minutes; TRANSIT entries carry unit-suffixed mode-tagged values — <n>h ⇒
// minutes ×60, <n>km ⇒ authoredDistance — and modes outside TravelMode are
// DROPPED with their entry (pinned here). Malformed rows/keys/numbers ⇒
// field-precise errors naming the line, COLLECTED (C30).
//
// Assembly rulings: schemaVersion 2, one layer ('Imported'), kind 'location'
// nodes, scale { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' } (D45 —
// the coordinates ARE minutes); every DIST pair ⇒ ONE bidirectional edge (C6)
// with walk authoredMinutes; TRANSIT adds mode specs to the pair's edge or
// creates it; edge ids 'import-<from>-<to>' in table order (stable); MT sits
// due East of Station Front at its 300 train minutes (C9, strongest-constraint
// ruling); the result passes validateWorldMap (run inside the importer).
//
// IDs: F05, FX2/D54 (the E→MT data), FX3/D55 (seeding), C6, C9, C30, D45.
import { describe, expect, it } from 'vitest';
import type { WorldMapData } from '../../../src/core/api';
import { importLookupTable, parseLookupTable } from '../../../src/core/import/lookup';
import { MapValidationError, validateWorldMap } from '../../../src/core/model/validate';
import type { ValidationIssue } from '../../../src/core/model/validate';

// The legacy table, verbatim from `Notes for locations.md` (block lines 6–27),
// wrapper tags and blank lines included — a real paste looks exactly like this.
const FULL_TABLE = `<walking_distances>
KEY: E:Emiya Residence|SD:Shopping District|Sc:Homurahara Academy|M:Matou Residence|T:Tohsaka Residence|RT:Ryuudou Temple|O:Outskirts|B:Fuyuki Bridge|S:Station Front|H:Harbor|GH:Ghost House (Edelfelt Mansion)|C:Kotomine Church|EC:Einzbern Castle|MT:Misaki Town

DIST(min):
E:SD12,Sc18,M22,T28,RT50,O30,B25,S50,H40,GH55,C60,EC270
SD:Sc10,M12,T15,RT45,O25,B15,S40,H40,GH40,C45,EC265
Sc:M15,T15,RT40,O15,B25,S50,H50,GH45,C55,EC255
M:T5,RT55,O20,B25,S55,H50,GH45,C50,EC260
T:RT60,O20,B25,S60,H55,GH45,C50,EC260
RT:O45,B60,S85,H80,GH85,C95,EC285
O:B35,S60,H65,GH50,C60,EC240
B:S25,H15,GH20,C35,EC275
S:H15,GH15,C20,EC300
H:GH25,C30,EC305
GH:C15,EC290
C:EC300

TRANSIT:
S:MT5h(train)
O:EC4h(walk),1h(car)
RT:Cavern3km(sub)
</walking_distances>`;

function issuesOf(text: string): ValidationIssue[] {
  try {
    parseLookupTable(text);
  } catch (e) {
    expect(e).toBeInstanceOf(MapValidationError);
    return (e as MapValidationError).issues;
  }
  throw new Error('expected parseLookupTable to refuse this table');
}

describe('parseLookupTable — KEY ruling (F05)', () => {
  it('maps abbreviations to full names in KEY order; names become labels, abbreviations the ids', () => {
    const t = parseLookupTable(FULL_TABLE);
    expect(t.abbrevs).toEqual(['E', 'SD', 'Sc', 'M', 'T', 'RT', 'O', 'B', 'S', 'H', 'GH', 'C', 'EC', 'MT']);
    expect(t.labels[0]).toBe('Emiya Residence');
    expect(t.labels[8]).toBe('Station Front'); // KEY: S:Station Front
    expect(t.labels[10]).toBe('Ghost House (Edelfelt Mansion)');
    expect(t.labels[13]).toBe('Misaki Town');
  });

  it('accepts a whole <walking_distances> paste — wrapper tags and blank lines included', () => {
    // FULL_TABLE IS the verbatim paste; parsing it at all pins the tolerance.
    expect(parseLookupTable(FULL_TABLE).labels).toHaveLength(14);
  });
});

describe('parseLookupTable — DIST(min) ruling (F05, C30)', () => {
  it('yields the 78 upper-triangle walking pairs as indices, minutes verbatim', () => {
    const t = parseLookupTable(FULL_TABLE);
    expect(t.walkMinutes).toHaveLength(78);
    expect(t.walkMinutes[0]).toEqual({ from: 0, to: 1, minutes: 12 }); // E:SD12
    expect(t.walkMinutes[7]).toEqual({ from: 0, to: 8, minutes: 50 }); // E:S50
    expect(t.walkMinutes[77]).toEqual({ from: 11, to: 12, minutes: 300 }); // C:EC300
    // MT (index 13) has no walking row — the walking network excludes it
    expect(t.walkMinutes.every((p) => p.from !== 13 && p.to !== 13)).toBe(true);
  });

  it('rejects a malformed number field-precisely, naming the line (C30)', () => {
    const issues = issuesOf('KEY: E:Emiya|SD:Shopping\n\nDIST(min):\nE:SD1x2');
    expect(issues).toContainEqual({ path: 'line 4', message: expect.stringContaining("malformed DIST token 'SD1x2'") });
  });

  it('rejects unknown abbreviations in DIST rows, source and target (C30)', () => {
    const issues = issuesOf('KEY: E:Emiya|SD:Shopping\nDIST(min):\nXX:SD12');
    expect(issues[0].path).toBe('line 3');
    expect(issues[0].message).toContain("unknown abbreviation 'XX' in DIST row source");
    const issues2 = issuesOf('KEY: E:Emiya|SD:Shopping\nDIST(min):\nE:ZZ12');
    expect(issues2[0].message).toContain("unknown abbreviation 'ZZ'");
  });

  it('rejects duplicate pairs in either orientation and self-loops (C6, C30)', () => {
    const dup = issuesOf('KEY: E:Emiya|SD:Shopping\nDIST(min):\nE:SD12\nSD:E12');
    expect(dup[0].message).toContain('duplicate DIST pair');
    const self = issuesOf('KEY: E:Emiya\nDIST(min):\nE:E5');
    expect(self[0].message).toContain('self-loop');
  });
});

describe('parseLookupTable — TRANSIT ruling (F05, C30)', () => {
  it('converts <n>h to minutes ×60 and inherits the target across entries of a row', () => {
    const t = parseLookupTable(FULL_TABLE);
    expect(t.transit).toEqual([
      { from: 8, to: 13, mode: 'train', minutes: 300 }, // S:MT5h(train) — 5h ⇒ 300
      { from: 6, to: 12, mode: 'walk', minutes: 240 }, // O:EC4h(walk)
      { from: 6, to: 12, mode: 'car', minutes: 60 }, // ,1h(car) — target inherited
    ]);
  });

  it('converts <n>km to authoredDistance — a different unit kind than the minutes matrix', () => {
    const t = parseLookupTable('KEY: A:Alpha|RT:Temple\nDIST(min):\nA:RT10\nTRANSIT:\nA:RT2km(train)');
    expect(t.transit).toEqual([{ from: 0, to: 1, mode: 'train', distance: 2 }]);
  });

  it('DROPS entries with modes outside TravelMode, without error — pinned drop rule', () => {
    // The real table's third TRANSIT line: mode 'sub' is not 'walk'|'car'|'train'
    // (TravelMode is closed), so the whole entry — unknown target 'Cavern'
    // included — vanishes. No error, no node, no edge.
    const t = parseLookupTable(FULL_TABLE);
    expect(t.transit).toHaveLength(3);
    expect(t.transit.some((e) => e.to === 10)).toBe(false);
    // even mixed into a row with a valid entry, only the valid one survives
    const mixed = parseLookupTable('KEY: RT:Temple|MT:Misaki\nTRANSIT:\nRT:Cavern3km(sub),MT2h(train)');
    expect(mixed.transit).toEqual([{ from: 0, to: 1, mode: 'train', minutes: 120 }]);
  });

  it('rejects unknown targets of KNOWN modes and target-less first entries (C30)', () => {
    const unknown = issuesOf('KEY: RT:Temple|MT:Misaki\nTRANSIT:\nRT:Cavern5h(train)');
    expect(unknown[0].message).toContain("unknown abbreviation 'Cavern' in TRANSIT target");
    const noTarget = issuesOf('KEY: A:Alpha|B:Beta\nTRANSIT:\nA:4h(car)');
    expect(noTarget[0].path).toBe('line 3');
    expect(noTarget[0].message).toContain('must name a target abbreviation');
  });
});

describe('parseLookupTable — C30 collected, field-precise refusals', () => {
  it('collects several defects into ONE error, each naming its line', () => {
    const issues = issuesOf(
      'KEY: E:Emiya|SD:Shopping\nDIST(min):\nE:SD1x2\nE:ZZ12\nWALKING:\nSD:E12',
    );
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.map((i) => i.path)).toContain('line 3');
    expect(issues.map((i) => i.path)).toContain('line 4');
    expect(issues.map((i) => i.path)).toContain('line 5'); // unrecognized section header
  });

  it('reports a missing KEY and the rows that could not resolve', () => {
    const issues = issuesOf('DIST(min):\nE:SD12');
    expect(issues.some((i) => i.path === 'KEY' && i.message.includes('missing KEY'))).toBe(true);
    expect(issues.some((i) => i.message.includes("unknown abbreviation 'E'"))).toBe(true);
  });

  it('rejects duplicate KEY lines', () => {
    const issues = issuesOf('KEY: A:Alpha\nKEY: B:Beta');
    expect(issues[0].message).toContain('duplicate KEY line');
  });
});

describe('importLookupTable — map assembly (F05, D45, C6, FX3/D55)', () => {
  const map: WorldMapData = importLookupTable(FULL_TABLE);

  it('round-trips: the returned map passes validateWorldMap standalone', () => {
    expect(validateWorldMap(map)).toBe(map); // the importer already ran it — never a half-built map
    expect(map.schemaVersion).toBe(2);
    expect(map.layers).toEqual([{ id: 'imported', name: 'Imported' }]);
    expect(map.scale).toEqual({ unitPerPx: 1, unitLabel: 'min', unitKind: 'time' }); // D45: coordinates ARE minutes
  });

  it('creates 14 "location" nodes with parsed labels and abbreviation ids, all positioned', () => {
    expect(map.nodes).toHaveLength(14);
    expect(map.nodes.every((n) => n.kind === 'location' && n.layer === 'imported')).toBe(true);
    expect(map.nodes.map((n) => n.id)).toEqual([
      'E', 'SD', 'Sc', 'M', 'T', 'RT', 'O', 'B', 'S', 'H', 'GH', 'C', 'EC', 'MT',
    ]);
    expect(map.nodes.every((n) => n.position !== undefined)).toBe(true);
    expect(map.nodes.find((n) => n.id === 'S')!.label).toBe('Station Front');
  });

  it('turns every DIST pair into ONE bidirectional edge with walk authoredMinutes (C6)', () => {
    expect(map.edges).toHaveLength(79); // 78 walk pairs + the S–MT transit edge
    const ids = new Set(map.edges.map((e) => e.id));
    expect(ids.size).toBe(79); // stable, collision-free (C5 scheme-shaped authored ids)
    expect(map.edges[0]).toEqual({
      id: 'import-E-SD',
      source: 'E',
      target: 'SD',
      modes: { walk: { allowed: true, authoredMinutes: 12 } },
    });
    expect(map.edges[1]!.id).toBe('import-E-Sc');
    // the O–EC pair is ONE edge carrying the DIST walk value AND both TRANSIT modes
    const oec = map.edges.filter((e) => new Set([e.source, e.target]).has('O') && new Set([e.source, e.target]).has('EC'));
    expect(oec).toHaveLength(1);
    expect(oec[0]!.id).toBe('import-O-EC');
    expect(oec[0]!.modes).toEqual({
      walk: { allowed: true, authoredMinutes: 240 },
      car: { allowed: true, authoredMinutes: 60 },
    });
  });

  it('appends the transit-created edge last, in table order: import-S-MT (train 300)', () => {
    const last = map.edges[78]!;
    expect(last.id).toBe('import-S-MT');
    expect(last.modes).toEqual({ train: { allowed: true, authoredMinutes: 300 } }); // 5h ⇒ 300 (C14 row 3)
    expect(last.modes.walk).toBeUndefined(); // MT is not on the walking network
  });

  it('places MT due East of Station Front at its 300 train minutes (C9, strongest-constraint ruling)', () => {
    const s = map.nodes.find((n) => n.id === 'S')!.position!;
    const mt = map.nodes.find((n) => n.id === 'MT')!.position!;
    expect(mt.x - s.x).toBeCloseTo(300, 6);
    expect(mt.y - s.y).toBeCloseTo(0, 6); // due East: Δy = 0 (C9)
  });

  it('leaves a node with no finite constraint unpositioned — legal, validating data', () => {
    const mini = importLookupTable('KEY: A:Alpha|B:Beta|C:Gamma\nDIST(min):\nA:B10');
    const c = mini.nodes.find((n) => n.id === 'C')!;
    expect(c.position).toBeUndefined(); // no distance anywhere ⇒ omitted (degenerate rule prices it 0, C14 §6.2)
    expect(mini.nodes.find((n) => n.id === 'A')!.position).toBeDefined();
  });

  it('places a transit-only node East of its anchor from <n>h minutes', () => {
    const mini = importLookupTable('KEY: A:Alpha|B:Beta|C:Gamma\nDIST(min):\nA:B10\nTRANSIT:\nB:C2h(train)');
    const b = mini.nodes.find((n) => n.id === 'B')!.position!;
    const c = mini.nodes.find((n) => n.id === 'C')!.position!;
    expect(c.x - b.x).toBeCloseTo(120, 6); // 2h ⇒ 120 minutes East (C9)
    expect(c.y - b.y).toBeCloseTo(0, 6);
    expect(mini.edges.map((e) => e.id)).toEqual(['import-A-B', 'import-B-C']);
    expect(mini.edges[1]!.modes).toEqual({ train: { allowed: true, authoredMinutes: 120 } });
  });
});
