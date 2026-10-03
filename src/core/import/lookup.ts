// src/core/import/lookup.ts — the legacy lookup-table importer (PKG A-010;
// F05, FX3/D55, C30, C6, C9, D45, D54).
//
// Turns a `<walking_distances>` paste (see `Notes for locations.md`) into a
// valid WorldMapData:
//   KEY:        abbreviations → full names (names become node labels, the
//               abbreviations the node ids the facade queries — findRoute('E','MT')).
//   DIST(min):  walking minutes between walking-network nodes; EVERY pair
//               becomes ONE bidirectional edge (C6 — no reverse duplicates)
//               with modes.walk = { allowed: true, authoredMinutes }.
//   TRANSIT:    unit-suffixed mode-tagged entries — `<n>h(mode)` ⇒
//               authoredMinutes n×60, `<n>km(mode)` ⇒ authoredDistance n —
//               added to the pair's edge when one exists, else creating it.
//               Modes outside TravelMode {'walk','car','train'} (e.g. 'sub')
//               are DROPPED with the rest of their entry (TravelMode is
//               closed — pinned by test).
//
// C30: the parser is reject-before-mutate, field-precise and COLLECTED —
// every defect is reported with its line; garbage in ⇒ MapValidationError,
// never a half-built table or map. The assembled map must pass
// validateWorldMap inside the importer: a map that does not validate is a
// bug, not caller data.
//
// Geometry seeding (D45 time-kind — the coordinates ARE minutes): the
// complete walking submatrix is embedded by classical MDS (seedPositions,
// import/mds.ts); nodes outside it are placed by their strongest constraint —
// the smallest finite minute-value to a placed node, due East of it
// (anchor.position + (d, 0); C9: +x is East) — a node with no finite
// constraint stays unpositioned (legal; the degenerate cost rule prices its
// geometry 0, C14 §6.2). Transit `<n>h` minutes seed placement; `<n>km`
// values are a different unit and never seed a minutes-coordinate map.
//
// Deterministic: no ids from callers (C5 — import ids are engine-scheme
// constants `import-<from>-<to>` in table order), no clock, no randomness.
// R5: imports only core-relative modules; no DOM/console/host.

import type { MapEdgeData, TravelMode, WorldMapData } from '../api';
import { validateWorldMap, MapValidationError } from '../model/validate';
import type { ValidationIssue } from '../model/validate';
import { seedPositions } from './mds';

// Mirrors validate.ts's private union membership (F50) — the drop rule's mode
// test. Kept local: the importer needs no new export from validate (facade
// precedent).
const TRAVEL_MODES: readonly TravelMode[] = ['walk', 'car', 'train'];

// --- parsed table (indices into `labels`) ------------------------------------

export interface LookupPair {
  from: number;
  to: number;
  minutes: number;
}

export interface LookupTransit {
  from: number;
  to: number;
  mode: TravelMode;
  minutes?: number; // from `<n>h(mode)` — n × 60
  distance?: number; // from `<n>km(mode)` — n, in the map's distance unit
}

/**
 * The parsed legacy table: node identity (`abbrevs`, the node ids) and names
 * (`labels`, the node labels) aligned by index; walking pairs and transit
 * entries as indices into those arrays. `abbrevs` is additive to the packet's
 * named shape — the `import-<from>-<to>` edge ids and the facade queries need
 * the abbreviations, which exist nowhere else.
 */
export interface LookupTable {
  abbrevs: string[];
  labels: string[];
  walkMinutes: LookupPair[];
  transit: LookupTransit[];
}

// --- parser -------------------------------------------------------------------

const DIST_TOKEN = /^([A-Za-z]+)(\d+(?:\.\d+)?)$/; // TARGET<minutes> — 'SD12'
const TRANSIT_ENTRY = /^([A-Za-z]*)(\d+(?:\.\d+)?)(h|km)\(([A-Za-z]+)\)$/; // [TARGET]<n><h|km>(MODE)

/** Parse a `<walking_distances>` block (C30: collected, field-precise, reject-before-mutate). */
export function parseLookupTable(text: string): LookupTable {
  const issues: ValidationIssue[] = [];
  const issue = (line: number | 'KEY', message: string): void => {
    issues.push({ path: line === 'KEY' ? 'KEY' : `line ${line}`, message });
  };

  let abbrevs: string[] = [];
  let labels: string[] = [];
  const indexOf: Record<string, number> = {};
  let keySeen = false;
  let section: 'dist' | 'transit' | null = null;
  const walkMinutes: LookupPair[] = [];
  const transit: LookupTransit[] = [];
  const pairLine = new Map<string, number>(); // normalized 'a:b' → first defining line

  const resolve = (abbr: string, line: number, role: string): number | null => {
    const i = indexOf[abbr];
    if (i === undefined) {
      issue(line, `unknown abbreviation '${abbr}' in ${role}`);
      return null;
    }
    return i;
  };

  const parseKey = (payload: string, line: number): void => {
    if (keySeen) {
      issue(line, 'duplicate KEY line');
      return;
    }
    keySeen = true;
    const entries = payload.split('|');
    for (const entry of entries) {
      const sep = entry.indexOf(':');
      const abbr = sep === -1 ? entry.trim() : entry.slice(0, sep).trim();
      const name = sep === -1 ? '' : entry.slice(sep + 1).trim();
      if (abbr.length === 0 || name.length === 0) {
        issue(line, `malformed KEY entry '${entry.trim()}' — expected ABBR:Name`);
        continue;
      }
      if (indexOf[abbr] !== undefined) {
        issue(line, `duplicate abbreviation '${abbr}'`);
        continue;
      }
      indexOf[abbr] = abbrevs.length;
      abbrevs.push(abbr);
      labels.push(name);
    }
    if (abbrevs.length === 0) issue('KEY', 'KEY must map at least one abbreviation');
  };

  const parseDistRow = (line: string, no: number): void => {
    const sep = line.indexOf(':');
    if (sep === -1) {
      issue(no, `malformed DIST row '${line}' — expected ABBR:TARGET<minutes>,…`);
      return;
    }
    const from = resolve(line.slice(0, sep).trim(), no, 'DIST row source');
    const tokens = line
      .slice(sep + 1)
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    for (const token of tokens) {
      const match = DIST_TOKEN.exec(token);
      if (match === null) {
        issue(no, `malformed DIST token '${token}' — expected TARGET<minutes>`);
        continue;
      }
      const to = resolve(match[1], no, `DIST target '${match[1]}'`);
      if (from === null || to === null) continue;
      if (to === from) {
        issue(no, `DIST pair must differ (self-loop on '${match[1]}')`);
        continue;
      }
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      if (pairLine.has(key)) {
        issue(no, `duplicate DIST pair '${line.slice(0, sep).trim()}-${match[1]}' (first defined on line ${pairLine.get(key)})`);
        continue;
      }
      pairLine.set(key, no);
      walkMinutes.push({ from, to, minutes: Number(match[2]) });
    }
  };

  const parseTransitRow = (line: string, no: number): void => {
    const sep = line.indexOf(':');
    if (sep === -1) {
      issue(no, `malformed TRANSIT row '${line}' — expected ABBR:[TARGET]<n><h|km>(MODE),…`);
      return;
    }
    const from = resolve(line.slice(0, sep).trim(), no, 'TRANSIT row source');
    if (from === null) return;
    let target: number | null = null; // carries across comma-separated entries ('O:EC4h(walk),1h(car)')
    const entries = line
      .slice(sep + 1)
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    for (const entry of entries) {
      const match = TRANSIT_ENTRY.exec(entry);
      if (match === null) {
        issue(no, `malformed TRANSIT entry '${entry}' — expected [TARGET]<n><h|km>(MODE)`);
        continue;
      }
      // The drop rule (packet ruling, pinned by test): modes outside TravelMode
      // drop the WHOLE entry — before target validation, so 'Cavern3km(sub)'
      // vanishes without an unknown-abbreviation error.
      const mode = match[4];
      if (!TRAVEL_MODES.includes(mode as TravelMode)) continue;
      if (match[1] !== '') {
        target = resolve(match[1], no, `TRANSIT target '${match[1]}'`);
        if (target === null) continue;
      } else if (target === null) {
        issue(no, `TRANSIT entry '${entry}' must name a target abbreviation (the row's first entry does)`);
        continue;
      }
      if (target === from) {
        issue(no, `TRANSIT pair must differ (self-loop on '${line.slice(0, sep).trim()}')`);
        continue;
      }
      // 'h' ⇒ minutes ×60 (C11 normalization: time → minutes); 'km' ⇒ distance verbatim.
      transit.push(
        match[3] === 'h'
          ? { from, to: target, mode: mode as TravelMode, minutes: Number(match[2]) * 60 }
          : { from, to: target, mode: mode as TravelMode, distance: Number(match[2]) },
      );
    }
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const no = i + 1;
    const line = lines[i].trim();
    if (line.length === 0 || line === '<walking_distances>' || line === '</walking_distances>') continue;
    if (line.startsWith('KEY:')) {
      parseKey(line.slice(4).trim(), no);
    } else if (line === 'DIST(min):') {
      if (section === 'dist') issue(no, 'duplicate DIST(min): header');
      section = 'dist';
    } else if (line === 'TRANSIT:') {
      if (section === 'transit') issue(no, 'duplicate TRANSIT: header');
      section = 'transit';
    } else if (section === 'dist') {
      parseDistRow(line, no);
    } else if (section === 'transit') {
      parseTransitRow(line, no);
    } else {
      issue(no, `unrecognized line '${line}' — expected KEY:, DIST(min): or TRANSIT:`);
    }
  }
  if (!keySeen) issue('KEY', 'missing KEY line — abbreviations cannot be resolved');

  if (issues.length > 0) throw new MapValidationError(issues, 'lookup table');
  return { abbrevs, labels, walkMinutes, transit };
}

// --- map assembly ---------------------------------------------------------------

const MAP_ID = 'imported-lookup-table';
const MAP_NAME = 'Imported Lookup Table';
const LAYER_ID = 'imported';
const LAYER_NAME = 'Imported';

/**
 * Import a legacy lookup-table paste into a validated WorldMapData (F05,
 * FX3/D55 seeding). Parse + MDS + edge assembly + validateWorldMap — a map
 * that does not validate is a bug, so the validator runs HERE (C30/F50: the
 * caller receives accepted data or a MapValidationError, never half-built
 * output).
 */
export function importLookupTable(text: string): WorldMapData {
  const table = parseLookupTable(text);
  const n = table.labels.length;

  // Two distance matrices (D45 time-kind — the coordinates ARE minutes):
  //   W — the WALKING matrix (DIST pairs only): what `seedPositions` embeds,
  //       per the ruling ("the complete walking submatrix"). Transit values
  //       must not leak into it: a transit-only node would look like a
  //       walking-network member and skew the peeling.
  //   M — walk minutes plus transit `<n>h` minutes filling holes (MT's train
  //       link is its only finite value): the placement constraint set.
  // `<n>km` values never enter either matrix — a different unit kind than a
  // minutes-coordinate map.
  const walkMatrix: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)),
  );
  for (const pair of table.walkMinutes) {
    walkMatrix[pair.from][pair.to] = pair.minutes;
    walkMatrix[pair.to][pair.from] = pair.minutes;
  }
  const constraints = walkMatrix.map((row) => row.slice());
  for (const entry of table.transit) {
    if (entry.minutes === undefined) continue;
    if (!Number.isFinite(constraints[entry.from][entry.to])) {
      constraints[entry.from][entry.to] = entry.minutes;
      constraints[entry.to][entry.from] = entry.minutes;
    }
  }

  // Seeding: MDS over the complete walking submatrix, then the ruling's
  // strongest-constraint placement for nodes outside it — smallest finite
  // minute-value to an already-placed node, due East of it (C9: +x is East);
  // no finite constraint to any placed node ⇒ stays unpositioned (legal;
  // C14 §6.2 degenerate rule prices its geometry 0). Index order keeps
  // chained placements deterministic.
  const positions = seedPositions(walkMatrix, table.labels);
  for (let i = 0; i < n; i++) {
    if (positions[i] !== undefined) continue;
    let anchor = -1;
    let best = Infinity; // scan-local sentinel only
    for (let j = 0; j < n; j++) {
      if (j === i || !Number.isFinite(constraints[i][j]) || positions[j] === undefined) continue;
      if (constraints[i][j] < best) {
        best = constraints[i][j];
        anchor = j;
      }
    }
    if (anchor >= 0) positions[i] = { x: positions[anchor]!.x + best, y: positions[anchor]!.y };
  }

  const nodes: WorldMapData['nodes'] = table.labels.map((label, i) => ({
    id: table.abbrevs[i],
    label,
    kind: 'location',
    layer: LAYER_ID,
    ...(positions[i] !== undefined ? { position: positions[i] } : {}),
  }));

  // Every DIST pair ⇒ ONE bidirectional edge (C6), ids `import-<from>-<to>`
  // in table order (stable, testable; C5's scheme-shaped authored ids).
  const edges: MapEdgeData[] = [];
  const edgeByPair = new Map<string, MapEdgeData>();
  const pairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (const pair of table.walkMinutes) {
    const edge: MapEdgeData = {
      id: `import-${table.abbrevs[pair.from]}-${table.abbrevs[pair.to]}`,
      source: table.abbrevs[pair.from],
      target: table.abbrevs[pair.to],
      modes: { walk: { allowed: true, authoredMinutes: pair.minutes } },
    };
    edges.push(edge);
    edgeByPair.set(pairKey(pair.from, pair.to), edge);
  }

  // TRANSIT entries add mode specs to the pair's edge (created when the pair
  // has no walking edge), in table order after the walk edges.
  for (const entry of table.transit) {
    const key = pairKey(entry.from, entry.to);
    let edge = edgeByPair.get(key);
    if (edge === undefined) {
      edge = {
        id: `import-${table.abbrevs[entry.from]}-${table.abbrevs[entry.to]}`,
        source: table.abbrevs[entry.from],
        target: table.abbrevs[entry.to],
        modes: {},
      };
      edges.push(edge);
      edgeByPair.set(key, edge);
    }
    const spec = { ...(edge.modes[entry.mode] ?? { allowed: true }) };
    if (entry.minutes !== undefined) spec.authoredMinutes = entry.minutes; // C14 row 3: authored time
    edge.modes[entry.mode] = spec;
    if (entry.distance !== undefined) edge.authoredDistance = entry.distance; // C14 row 4 (C12/D44)
  }

  // The map must validate — inside the importer (C30/F50). D45 time-kind:
  // unitPerPx 1 with unitLabel 'min' — the coordinates ARE minutes.
  return validateWorldMap({
    schemaVersion: 2,
    id: MAP_ID,
    name: MAP_NAME,
    layers: [{ id: LAYER_ID, name: LAYER_NAME }],
    scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' },
    nodes,
    edges,
  });
}
