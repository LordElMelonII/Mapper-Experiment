// VERIFIER (Agent D) — M3 gate: the C21/D26 pure matcher, adversarially.
// Expectations from CORE.md C21/C23 and EXECUTION-PLAN D26 (R6: the pure
// function in core; orchestration in the host). The existing match.spec pins
// wording with a fixture whose input order COINCIDES with distance order —
// these probes decouple the two, so a ranking regression cannot hide.
import { describe, expect, it } from 'vitest';
import Handlebars from 'handlebars';
import { matchNodes, suggestCorrective } from '../../src/core/snapshot/match';
import { createFacade } from '../../src/core/facade';
import type { MapNodeData, TemplateCompiler } from '../../src/core/api';

const compile: TemplateCompiler = (tpl) => Handlebars.compile(tpl);

const node = (id: string, label: string, aliases?: string[], origin?: 'user'): MapNodeData => ({
  id,
  label,
  kind: 'location',
  layer: 'L',
  ...(aliases !== undefined ? { aliases } : {}),
  ...(origin !== undefined ? { origin } : {}),
});

// --- C21 word boundaries: the ASCII word-char rule, both directions -------------
describe('VERIFY M3 — C21 boundary semantics (C21)', () => {
  const nodes = [node('b', 'Bridge')];

  it('a hyphen is a boundary: "Fuyuki-Bridge" text hits the name "Bridge"', () => {
    expect(matchNodes(nodes, 'crossing the Fuyuki-Bridge crossing')).toEqual(nodes);
  });

  it('an underscore is NOT a boundary: "Fuyuki_Bridge" never hits (word-char rule)', () => {
    expect(matchNodes(nodes, 'the Fuyuki_Bridge crossing')).toEqual([]);
  });

  it('trailing punctuation is a boundary; a trailing letter is not', () => {
    expect(matchNodes(nodes, 'toward the Bridge.')).toEqual(nodes);
    expect(matchNodes(nodes, 'toward the Bridgex')).toEqual([]);
  });
});

// --- D26 ranking: the suggestions must be the NEAREST names, not input-order ones
describe('VERIFY M3 — D26: suggestions are ranked by Levenshtein distance (D26, C21)', () => {
  // distances from 'Statio': Station 1, Statue 2, Statute 3, Harbor 6 —
  // deliberately listed ANTI-correlated with distance, so an input-order
  // shortcut (no sort) would suggest "Statute, Statue, or Station".
  const nodes = [node('c', 'Statute'), node('b', 'Statue'), node('a', 'Station'), node('d', 'Harbor')];

  it('top-3 are the three nearest names regardless of input order (D26)', () => {
    expect(suggestCorrective(nodes, 'Statio')).toBe(
      "Unknown place 'Statio' — did you mean Station, Statue, or Statute?",
    );
  });

  it('a 2-name listing is distance-ordered too: Harbor is input-first yet listed second', () => {
    expect(suggestCorrective([nodes[3]!, nodes[2]!], 'Statio')).toBe(
      "Unknown place 'Statio' — did you mean Station or Harbor?",
    );
  });
});

// --- C23: an unnamed waypoint is suppressed even when it owns the top slot ------
describe('VERIFY M3 — C23: unnamed waypoints never feed the corrective line (C23, D26)', () => {
  const wp = node('wp-1', 'Waypoint', undefined, 'user');
  const real = [node('a', 'Station'), node('b', 'Statue'), node('c', 'Statute')];

  it('the waypoint is the nearest match for "Waypointt" yet is excluded — three real names shown', () => {
    // 'Waypointt' is distance 1 from the unnamed waypoint's label — the exact
    // wording proves the listing holds only the three REAL names, in true
    // Levenshtein order (Station 7, Statute 8, Statue 9), C23 held.
    expect(suggestCorrective([wp, ...real], 'Waypointt')).toBe(
      "Unknown place 'Waypointt' — did you mean Station, Statute, or Statue?",
    );
  });

  it('a text naming only the waypoint label still suppresses the corrective via matchNodes (C21)... or must not?', () => {
    // 'Waypoint' IS a real word in the text: matchNodes hits the (unnamed) node,
    // so no corrective fires. The node is excluded from SUGGESTIONS, but a hit
    // is a host-facing fact, not a prompt-facing string — C23 governs what
    // reaches the LLM, and nothing does here.
    expect(suggestCorrective([wp, ...real], 'at the Waypoint')).toBeUndefined();
  });
});

// --- the C21/R6 seam: the core matcher builds the line, the host sets it --------
describe('VERIFY M3 — D26 end-to-end seam: matcher → setCorrective → prompt block (C21, R6, D63)', () => {
  const map = () => ({
    schemaVersion: 2 as const,
    id: 'map-matcher',
    name: 'Matcher Probe',
    layers: [{ id: 'L', name: 'Overland' }],
    scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' as const },
    nodes: [{ id: 'st', label: 'Fuyuki Station', kind: 'hub' as const, layer: 'L', position: { x: 0, y: 0 } }],
    edges: [],
  });

  it("the corrective built by the pure matcher renders verbatim in the prompt block", () => {
    const m = map();
    const f = createFacade({ compile });
    f.loadMap(m, {
      mapId: m.id,
      currentLocationId: 'st',
      travelMode: 'walk',
      userNodes: [],
      userEdges: [],
      blocked: {},
    });
    f.materialize();

    const line = suggestCorrective(m.nodes as MapNodeData[], 'stasion'); // the engine-built line (D26/D63)
    expect(line).toBe("Unknown place 'stasion' — did you mean Fuyuki Station?");
    f.setCorrective(line); // the HOST scanner's call (Phase 4 shape)
    const block = f.getPromptBlock();
    expect(block).toContain('<corrective>Unknown place \'stasion\' — did you mean Fuyuki Station?</corrective>');
    // sticky: a second render without a new scan still carries it (D12/D26)
    expect(f.getPromptBlock()).toBe(block);
    // cleared by undefined (D63 set/clear)
    f.setCorrective(undefined);
    expect(f.getSnapshot().corrective).toBeUndefined();
    expect(f.getPromptBlock()).not.toContain('<corrective>');
  });
});
