// The C21/D26 pure matcher (PKG A-008): word-boundary, case-insensitive
// matching over label ∪ aliases; a failed match yields the D26 corrective line
// (bounded Levenshtein over labels ∪ aliases, top 3, wording pinned). Names
// are matched literally — regex metacharacters in labels must never explode
// (D26: ST users run their own regex scripts; ours must not interact).
import { describe, expect, it } from 'vitest';
import { matchNodes, suggestCorrective } from '../../../src/core/snapshot/match';
import type { MapNodeData } from '../../../src/core/api';

const node = (id: string, label: string, aliases?: string[]): MapNodeData => ({
  id,
  label,
  kind: 'location',
  layer: 'layer-test',
  ...(aliases !== undefined ? { aliases } : {}),
});

describe('matchNodes — word boundaries (C21)', () => {
  const station = node('fuyuki-station', 'Fuyuki Station', ['Station Front', 'station']);

  it("'tat' must not match 'Station' — mid-word fragments are no hits (C21)", () => {
    expect(matchNodes([station], 'tat')).toEqual([]);
    expect(matchNodes([station], 'the statues are tall')).toEqual([]); // 'tat' inside 'statues'
  });

  it("the full alias phrase matches exactly: '…Station Front…' hits via 'Station Front' (C21)", () => {
    expect(matchNodes([station], 'we wait at the Station Front kiosk')).toEqual([station]);
  });

  it('a whole word inside a longer phrase is a boundary hit; edges count as boundaries (C21)', () => {
    // 'station' is a complete word inside 'Station Front' — a boundary hit (C21
    // semantics: word-boundary, not whole-string equality).
    expect(matchNodes([station], 'Station Front')).toEqual([station]);
    expect(matchNodes([station], 'station')).toEqual([station]);
    // punctuation counts as a boundary, not as part of the name
    expect(matchNodes([station], '(station),')).toEqual([station]);
  });
});

describe('matchNodes — case-insensitivity, aliases, multi-match (C21)', () => {
  const station = node('fuyuki-station', 'Fuyuki Station', ['Station Front', 'station']);
  const temple = node('ryuudou-temple', 'Ryuudou Temple', ['temple']);

  it('case-insensitive in both directions: shouting text, cased names (C21)', () => {
    expect(matchNodes([temple], 'we climb to the TEMPLE')).toEqual([temple]);
    expect(matchNodes([station], 'the FUYUKI STATION bells ring')).toEqual([station]);
  });

  it('alias hits count as hits (C21: names ∪ aliases)', () => {
    expect(matchNodes([station], 'meet me at the station')).toEqual([station]);
  });

  it('multi-match returns every hit in input order (C21)', () => {
    expect(matchNodes([station, temple], 'from the temple to the station')).toEqual([station, temple]);
  });

  it('no name occurs ⇒ empty (C21)', () => {
    expect(matchNodes([station, temple], 'the archery club meets at noon')).toEqual([]);
  });

  it('blank text matches nothing (C21)', () => {
    expect(matchNodes([station], '')).toEqual([]);
    expect(matchNodes([station], '   ')).toEqual([]);
  });
});

describe('matchNodes — literal names (D26)', () => {
  it("regex metacharacters in labels are literal: 'C. Motel (East)' matches and never explodes (D26)", () => {
    const motel = node('motel', 'C. Motel (East)');
    expect(matchNodes([motel], 'we reached the C. Motel (East) at dusk')).toEqual([motel]);
    // the name with metacharacters removed is NOT a hit — no regex was built from it
    expect(matchNodes([motel], 'we reached the C Motel East at dusk')).toEqual([]);
  });
});

describe('suggestCorrective — the D26 corrective line', () => {
  // Distances from 'Statio' (lowercased DP): Station 1, Statue 2, Statute 3, Harbor 6.
  const three = [node('a', 'Station'), node('b', 'Statue'), node('c', 'Statute'), node('d', 'Harbor')];

  it('3 suggestions, exact wording (D26)', () => {
    expect(suggestCorrective(three, 'Statio')).toBe(
      "Unknown place 'Statio' — did you mean Station, Statue, or Statute?",
    );
  });

  it('2 suggestions ⇒ "<a> or <b>" (D26)', () => {
    expect(suggestCorrective([node('a', 'Station'), node('c', 'Statute')], 'Statio')).toBe(
      "Unknown place 'Statio' — did you mean Station or Statute?",
    );
  });

  it('1 suggestion ⇒ just "<a>" (D26)', () => {
    expect(suggestCorrective([node('a', 'Station')], 'Statio')).toBe(
      "Unknown place 'Statio' — did you mean Station?",
    );
  });

  it('blank/whitespace input matches nothing and yields NO corrective (D26)', () => {
    expect(suggestCorrective(three, '')).toBeUndefined();
    expect(suggestCorrective(three, '   ')).toBeUndefined();
  });

  it('a text that DID match yields no corrective (C21: the corrective is for failed matches)', () => {
    expect(suggestCorrective([node('a', 'Ryuudou Temple', ['temple'])], 'at the temple')).toBeUndefined();
  });

  it('aliases feed the suggestions (D26: over labels ∪ aliases)', () => {
    // 'templ' is distance 1 from the ALIAS 'temple' and far from the label —
    // the alias outranks the label itself.
    const temple = node('ryuudou-temple', 'Ryuudou Temple', ['temple']);
    expect(suggestCorrective([temple], 'templ')).toBe(
      "Unknown place 'templ' — did you mean temple or Ryuudou Temple?",
    );
  });

  it('no explosion on metacharacter names — the DP is plain string work (D26)', () => {
    const motel = node('motel', 'C. Motel (East)');
    expect(suggestCorrective([motel], 'C. Motel East')).toBe(
      "Unknown place 'C. Motel East' — did you mean C. Motel (East)?",
    );
  });

  it('unnamed user waypoints never feed suggestions (C23 — the line is prompt-facing)', () => {
    const wp: MapNodeData = { id: 'wp-1', label: 'Waypoint', kind: 'waypoint', layer: 'L', origin: 'user' };
    const named = node('a', 'Harbor');
    // input is closest to 'Waypoint' (distance 2) — still suggested never
    expect(suggestCorrective([wp, named], 'Waypoin')).toBe("Unknown place 'Waypoin' — did you mean Harbor?");
  });
});
