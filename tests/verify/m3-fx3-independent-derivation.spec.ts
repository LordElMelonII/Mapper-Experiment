// VERIFIER (Agent D) — M3 gate: FX3/D64 independent derivation.
// The existing tests/verify/fx3-legacy-regression.spec.ts replays an INLINED
// copy of the legacy table through the IMPLEMENTATION'S OWN parser
// (parseLookupTable) — if that parser misread the notes, that suite would
// compare the implementation against itself. This suite closes that loop:
//
//   1. `Notes for locations.md` is read from disk and parsed HERE with an
//      independent parser (this file's own regexes, written from the notes'
//      documented format).
//   2. The parsed table drives every expectation: edge count, authored
//      minutes preserved EXACTLY (D64), the transit modes.
//   3. The ±20% FX3 classification is re-derived from the imported map's
//      geometry and checked against the D64 exemption list (transcribed
//      independently into this file): exactly 56/78 pairs within the bound,
//      exactly the 22 ruled pairs beyond it, each still-beyond AND not
//      materially worse (D64's self-enforcing exemption, re-proven here).
//   4. FX2's acceptance route is re-proven on the imported map.
//
// IDs: FX3, FX2, D55, D64, F05, C6, C9, C14, D60.
/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { createFacade } from '../../src/core/facade';
import { importLookupTable } from '../../src/core/import/lookup';
import { euclid } from '../../src/core/geometry/measure';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';
import NOTES from '../../Notes for locations.md?raw';

// --- independent parse of `Notes for locations.md` (no implementation code) -----

const block = /<walking_distances>([\s\S]*?)<\/walking_distances>/.exec(NOTES)?.[1];
expect(block, 'the notes must contain a <walking_distances> block').toBeDefined();

const lines = block!.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

// KEY: ABBR:Name|ABBR:Name|...
const keyLine = lines.find((l) => l.startsWith('KEY:'))!;
const abbrevs: string[] = [];
const labels: string[] = [];
for (const entry of keyLine.slice(4).split('|')) {
  const sep = entry.indexOf(':');
  abbrevs.push(entry.slice(0, sep).trim());
  labels.push(entry.slice(sep + 1).trim());
}
const idxOf = new Map(abbrevs.map((a, i) => [a, i]));

// DIST(min): rows "ABBR:TARGET<minutes>,..."
let section = '';
const pairs: Array<{ a: string; b: string; minutes: number }> = [];
for (const line of lines) {
  if (line.startsWith('KEY:')) continue;
  if (line === 'DIST(min):') { section = 'dist'; continue; }
  if (line === 'TRANSIT:') { section = 'transit'; continue; }
  if (section !== 'dist') continue;
  const sep = line.indexOf(':');
  const from = line.slice(0, sep).trim();
  for (const tok of line.slice(sep + 1).split(',')) {
    const m = /^([A-Za-z]+)(\d+(?:\.\d+)?)$/.exec(tok.trim());
    if (m === null) continue;
    pairs.push({ a: from, b: m[1]!, minutes: Number(m[2]) });
  }
}

// TRANSIT: rows "ABBR:[TARGET]<n>h(MODE),..." — target carries across entries
const transit: Array<{ a: string; b: string; minutes: number; mode: string }> = [];
let carry: string | null = null;
for (const line of lines) {
  if (line === 'TRANSIT:') { section = 'transit'; continue; }
  if (section !== 'transit') continue;
  const sep = line.indexOf(':');
  if (sep === -1) continue;
  carry = null;
  for (const entry of line.slice(sep + 1).split(',')) {
    const m = /^([A-Za-z]*)(\d+(?:\.\d+)?)(h|km)\(([A-Za-z]+)\)$/.exec(entry.trim());
    if (m === null) continue;
    const target: string | null = m[1] !== '' ? m[1]! : carry;
    carry = target;
    if (target === null || m[3] !== 'h') continue; // km entries are a different unit; non-h entries dropped here
    transit.push({ a: line.slice(0, sep).trim(), b: target, minutes: Number(m[2]) * 60, mode: m[4]! });
  }
}

const keyOf = (a: string, b: string): string => (idxOf.get(a)! < idxOf.get(b)! ? `${a}-${b}` : `${b}-${a}`);

// --- the D64 exemption list, transcribed independently into THIS file ----------
const D64_EXEMPT_22: Record<string, number> = {
  'E-SD': 0.312, 'E-Sc': 0.235, 'E-M': 0.419, 'E-T': 0.492,
  'SD-M': 0.505, 'SD-T': 0.538, 'SD-RT': 0.224,
  'Sc-M': 0.548, 'Sc-T': 0.480, 'Sc-RT': 0.357,
  'M-T': 0.680, 'M-B': 0.226,
  'T-B': 0.241,
  'RT-O': 0.407,
  'B-H': 1.021, 'B-GH': 0.207,
  'S-H': 0.302, 'S-GH': 0.284, 'S-C': 0.550,
  'H-GH': 0.205, 'H-C': 0.367,
  'GH-C': 0.265,
};

// --- the map under test: the importer over the notes' own text ------------------
const imported: WorldMapData = importLookupTable(`<walking_distances>${block}</walking_distances>`);

const edgeBetween = (a: string, b: string) =>
  imported.edges.find(
    (e) => (e.source === a && e.target === b) || (e.source === b && e.target === a),
  );

const positionOf = new Map(imported.nodes.map((n) => [n.id, n.position]));
const relDelta = (a: string, b: string, minutes: number): number => {
  const pa = positionOf.get(a)!;
  const pb = positionOf.get(b)!;
  return Math.abs(euclid(pa!, pb!) * imported.scale.unitPerPx - minutes) / minutes;
};

describe('VERIFY M3 — FX3/D64: the importer preserves the notes, independently re-parsed (F05, D64, C6)', () => {
  it('parses the notes into 14 KEY entries and exactly 78 DIST pairs (the FX3 pair set)', () => {
    expect(abbrevs).toHaveLength(14);
    expect(labels[0]).toBe('Emiya Residence');
    expect(labels[13]).toBe('Misaki Town');
    expect(pairs).toHaveLength(78);
    // spot pins straight from the notes, values included
    expect(pairs).toContainEqual({ a: 'E', b: 'SD', minutes: 12 });
    expect(pairs).toContainEqual({ a: 'B', b: 'H', minutes: 15 }); // D64's minimal proof pair
    expect(pairs).toContainEqual({ a: 'C', b: 'EC', minutes: 300 });
  });

  it('every one of the 78 parsed pairs lands on an edge with authored minutes EXACTLY as authored (D64)', () => {
    const walkEdges = imported.edges.filter((e) => e.modes.walk?.allowed === true);
    expect(imported.edges).toHaveLength(79); // 78 walk + the S–MT train edge
    expect(walkEdges).toHaveLength(78);
    for (const { a, b, minutes } of pairs) {
      const edge = edgeBetween(a, b);
      expect(edge, `pair ${a}-${b} must exist as an edge (C6: one bidirectional arc)`).toBeDefined();
      expect(edge!.modes.walk?.authoredMinutes, `authored minutes preserved exactly on ${a}-${b}`).toBe(minutes);
    }
  });

  it('the TRANSIT rows become mode specs: S–MT train 300, O–EC walk 240 + car 60; the km(sub) entry is gone', () => {
    const smt = edgeBetween('S', 'MT');
    expect(smt?.modes.train).toMatchObject({ allowed: true, authoredMinutes: 300 }); // 5h × 60 (C11)
    const oec = edgeBetween('O', 'EC');
    expect(oec?.modes.walk?.authoredMinutes).toBe(240); // 4h — and identical to the DIST O–EC 240
    expect(oec?.modes.car?.authoredMinutes).toBe(60); // 1h
    expect(edgeBetween('RT', 'Cavern')).toBeUndefined(); // 'Cavern' is not a KEY abbreviation; sub mode dropped
    expect(imported.edges.every((e) => e.authoredDistance === undefined)).toBe(true); // no km value survived
  });
});

describe('VERIFY M3 — FX3: the ±20% bound re-derived from the notes (FX3, D55, D64)', () => {
  it('exactly 56 of the 78 pairs sit within ±20%; exactly the 22 D64-exempt pairs sit beyond', () => {
    const beyond = new Set<string>();
    for (const { a, b, minutes } of pairs) {
      const key = keyOf(a, b);
      if (relDelta(a, b, minutes) > 0.2) beyond.add(key);
    }
    expect(beyond.size).toBe(22); // the D64 split: 56/22 over the 78 pairs
    expect([...beyond].sort()).toEqual(Object.keys(D64_EXEMPT_22).sort());
    for (const { a, b, minutes } of pairs) {
      const key = keyOf(a, b);
      if (!D64_EXEMPT_22[key]) {
        expect(relDelta(a, b, minutes), `${key} must stay within the FX3 bound`).toBeLessThanOrEqual(0.2);
      }
    }
  });

  it('each exempt pair is STILL beyond the bound and NOT materially worse than the ruled maxima (D64 self-enforcement, re-proven)', () => {
    let checkedExempt = 0;
    for (const { a, b, minutes } of pairs) {
      const key = keyOf(a, b);
      const max = D64_EXEMPT_22[key];
      if (max === undefined) continue;
      checkedExempt += 1;
      const rel = relDelta(a, b, minutes);
      expect(rel, `${key} now satisfies the bound — shrink the D64 exemption list`).toBeGreaterThan(0.2);
      expect(rel, `${key} drifted materially worse than the D64-ruled embedding`).toBeLessThanOrEqual(max + 1e-9);
    }
    expect(checkedExempt).toBe(22); // the exemption list must actually engage — never pass vacuously
  });
});

describe('VERIFY M3 — FX2 on the imported map, re-proven (FX2, D54/D60)', () => {
  it('findRoute E → MT = 350: walk 50 to Station Front, then the 5h train (D60 default-mode preference)', () => {
    const overlay: ChatMapOverlay = {
      mapId: imported.id,
      currentLocationId: 'E',
      travelMode: 'walk',
      userNodes: [],
      userEdges: [],
      blocked: {},
    };
    const f = createFacade();
    f.loadMap(imported, overlay);
    f.materialize();

    const route = f.findRoute('E', 'MT');
    expect(route.ok).toBe(true);
    expect(route.total).toBe(350); // 50 (E–S) + 300 (S–MT 5h train)
    expect(route.legs).toEqual([
      { arcId: 'import-E-S', from: 'E', to: 'S', mode: 'walk', cost: 50 },
      { arcId: 'import-S-MT', from: 'S', to: 'MT', mode: 'train', cost: 300 },
    ]);

    // the imported map has no hubs (the legacy table has no hub concept), so
    // C20's destination set is empty — and the unit-aware label is 'min'
    // (all-minutes pricing) even with no speeds configured anywhere (D60/§6.2).
    const snap = f.getSnapshot();
    expect(snap.location).toBe('Emiya Residence');
    expect(snap.destinations).toEqual([]);
    expect(snap.unit).toBe('min');
    expect(snap.destinationsTruncated).toBe(false);
  });
});
