// tests/unit/app/mode-word.spec.ts — PKG B-146 (R6 item 8): the ONE
// app-layer mode-word display formatter's verbatim contract.
//
// The R6 LEAD RULING (it corrects the item's letter): the core's
// `RouteLeg.modeLabel` is "the RESOLVED authored word … the UI never maps
// ids to words itself" (src/core/api.ts), and map-driven custom modes carry
// USER-AUTHORED casing — a blanket `toLowerCase()` formatter would RE-WORD
// authored strings, and the C23 verbatim law outranks the letter. The
// formatter is therefore exact IDENTITY: the built-ins render plain
// lowercase ('walk' — the legs' plain-word voice, D78) and authored words
// render byte-for-byte ('Horseback', 'On Foot' — the D78 resolver cases
// pinned in facade.m2.spec.ts).
//
// This spec pins the FORMATTER only. The chips' CSS capitalize removal and
// the chips-equal-legs unification are pinned by the e2e chip-verbatim cell
// (tests/e2e/mode-surfaces.e2e-spec.ts — the registry demo's custom-cased
// 'Horseback' next to the lowercase built-in 'walk').
import { describe, expect, it } from 'vitest';
import { modeWord } from '../../../src/app/graph/mode-word';

describe('modeWord — the ONE mode-word display formatter (B-146/R6 item 8, C23/D78)', () => {
  it('preserves AUTHORED casing verbatim — a transform would re-word user words (C23)', () => {
    expect(modeWord('Horseback')).toBe('Horseback'); // a registry custom mode (D78)
    expect(modeWord('Carriage')).toBe('Carriage'); // a relabeled built-in (D78)
    expect(modeWord('On Foot')).toBe('On Foot'); // a multi-word authored label (D78)
  });

  it("renders the built-ins as the resolver's plain lowercase words — the legs' voice (D78)", () => {
    for (const word of ['walk', 'car', 'train']) {
      expect(modeWord(word)).toBe(word); // chips and legs agree with zero transformation
    }
  });

  it('never re-words ANY string — the formatter is exact identity', () => {
    for (const word of ['', 'TRAIN', 'iNtErGaLaCtIc ShIp', 'Steam Balloon ']) {
      expect(modeWord(word)).toBe(word);
    }
  });
});
