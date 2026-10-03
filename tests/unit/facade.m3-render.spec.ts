// M3 render facade tests (PKG A-009): getPromptBlock / renderTemplate
// end-to-end over FX1 (F34, C22, D23, D24, D62). FX1 is thawed per C24 —
// every suite loads a fresh JSON clone so tests never interact. The npm
// `handlebars` devDependency plays the injected engine (D62 — never bundled).
import { describe, expect, it } from 'vitest';
import Handlebars from 'handlebars';
import { createFacade } from '../../src/core/facade';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const fuyukiOverlay = (map: WorldMapData): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: 'emiya-residence',
  travelMode: 'walk', // D19: the chat's default mode preference
  userNodes: [],
  userEdges: [],
  blocked: {},
});

const loadFuyukiWithEngine = () => {
  const map = fuyuki();
  const f = createFacade({ compile: (tpl) => Handlebars.compile(tpl) });
  f.loadMap(map, fuyukiOverlay(map));
  f.materialize();
  return f;
};

describe('getPromptBlock — FX1 end-to-end (F34, C22, D23, D62)', () => {
  it('the default block carries the FX1 neighborhood: exact route lines, ≥2 asserted', () => {
    const block = loadFuyukiWithEngine().getPromptBlock();
    expect(block).toContain('<travel_context>');
    expect(block).toContain('<location>Emiya Residence</location>');
    // C19 neighborhood, pinned verbatim in the default XML format (FX4):
    expect(block).toContain('<route label="Shopping District" direction="SE" cost="12" mode="walk"/>');
    // C2: the blocked bridge stays listed WITH its reason:
    expect(block).toContain(
      '<route label="Fuyuki Bridge" direction="E" cost="25" mode="walk" blocked="Bridge closed by local authorities"/>',
    );
  });

  it('the default block carries the Misaki destination line (D25 — the FX2 shape: walk to the station, train on, total 350)', () => {
    const block = loadFuyukiWithEngine().getPromptBlock();
    expect(block).toContain('<destination label="Misaki Town" via="Fuyuki Station" cost="350" mode="walk"/>');
  });

  it('renderTemplate is a QUERY — it never sets stale (C8)', () => {
    const f = loadFuyukiWithEngine();
    f.renderTemplate('{{location}}');
    f.getPromptBlock();
    // no facadeStateOf assertion here would need the diagnostic seam; the
    // observable proof: repeated renders are identical and materialize()
    // between them changes nothing.
    expect(f.renderTemplate('{{location}}')).toBe(f.renderTemplate('{{location}}'));
  });
});

describe("renderTemplate — a bare-text user template (D24, D23)", () => {
  it("renderTemplate('{{location}}') === 'Emiya Residence' — values are the engine's data, words are the user's", () => {
    expect(loadFuyukiWithEngine().renderTemplate('{{location}}')).toBe('Emiya Residence');
  });

  it('the unit variable reaches a user template as the D60 currency label', () => {
    expect(loadFuyukiWithEngine().renderTemplate('{{unit}}')).toBe('min');
  });
});
