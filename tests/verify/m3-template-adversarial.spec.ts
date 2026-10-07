// VERIFIER (Agent D) — M3 gate: template renderer adversarials (C22, C32, D62,
// D24/F33, FX4, C17). Expectations derived from CORE.md C22/C32/C17, FX4 and
// EXECUTION-PLAN D62/D63/§6.2 — never from the implementation or its tests.
// The npm `handlebars` devDependency plays the injected engine (D62 — tests
// only; the shipped bundle never embeds one).
/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import Handlebars from 'handlebars';
import { createFacade } from '../../src/core/facade';
import { DEFAULT_TEMPLATE } from '../../src/core/templates/default';
import type { ChatMapOverlay, TemplateCompiler, WorldMapData } from '../../src/core/api';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import DEFAULT_XML_GOLDEN from '../golden/fx4-default-xml.txt?raw';
import MARKDOWN_GOLDEN from '../golden/fx4-markdown.txt?raw';
import DEFAULT_XML_NULL_GOLDEN from '../golden/fx4-default-xml-null-location.txt?raw';
import MARKDOWN_NULL_GOLDEN from '../golden/fx4-markdown-null-location.txt?raw';

const compile: TemplateCompiler = (tpl) => Handlebars.compile(tpl);

const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const loadFuyuki = (pin = 'emiya-residence') => {
  const map = fuyuki();
  const overlay: ChatMapOverlay = {
    mapId: map.id,
    currentLocationId: pin,
    travelMode: 'walk',
    userNodes: [],
    userEdges: [],
    blocked: {}, nodeBlocked: {},
  };
  const f = createFacade({ compile });
  f.loadMap(map, overlay);
  f.materialize();
  f.setStatusNote('on the road to Big Bridge, ~2 km out');
  f.setCorrective("Unknown place 'stasion' — did you mean Fuyuki Station?");
  return f;
};

// --- C32 over a RICH snapshot: the fallback must carry the FULL context ---------
//
// C32: "Any core failure on a generation-time path yields an empty or stale
// snapshot, not an exception." §6.2: "template syntax error in user template ⇒
// fall back to default template + toast (never an empty injection)." The
// existing renderer tests prove the fallback on a tiny map; here the SAME
// guarantees are proven over a snapshot carrying routes, a blocked reason,
// destinations, and the corrective — the data an LLM actually consumes.
describe('VERIFY M3 — C32 fallback over a rich FX1 snapshot (C32, §6.2, C22)', () => {
  it('a compile-error template yields byte-identical default-template output over the SAME context', () => {
    const f = loadFuyuki();
    const good = f.getPromptBlock();
    expect(good.length).toBeGreaterThan(0);
    const out = f.renderTemplate('{{#if location}}<routes>{{#each routes}}'); // unclosed blocks
    expect(out).toBe(good); // the DEFAULT template over the SAME context — not a re-build
  });

  it('a runtime-error template (missing helper) yields the same default output, no throw', () => {
    const f = loadFuyuki();
    const out = f.renderTemplate('{{loud statusNote}}'); // compiles; throws at run time
    expect(out).toBe(f.getPromptBlock());
  });

  it('the fallback output still carries routes, the blocked reason, destinations and the corrective (C2, C20, D26)', () => {
    const f = loadFuyuki();
    const out = f.renderTemplate('totally broken {{#x}}');
    expect(out).toBe(f.getPromptBlock());
    expect(out).toContain('blocked="Bridge closed by local authorities"'); // C2 rides through the fallback
    expect(out).toContain('<destinations unit="min">'); // D25 section survives
    expect(out).toContain('Misaki Town'); // the 350-min FX2 destination
    expect(out).toContain('<corrective>'); // D26 line survives
    expect(out.length).toBeGreaterThan(0); // never an empty injection
  });

  it('the rendered block never carries ∞/NaN/undefined on a snapshot with a blocked arc (C17)', () => {
    const f = loadFuyuki();
    const out = f.getPromptBlock();
    expect(out).not.toContain('Infinity');
    expect(out).not.toContain('NaN');
    expect(out).not.toContain('undefined');
  });
});

// --- D24/F33: the words are user data — a template consuming a SUBSET works -----
describe('VERIFY M3 — the C22 contract serves arbitrary user words (D24, F33, C22)', () => {
  it('a destinations-only template renders the destinations in template order', () => {
    const f = loadFuyuki();
    const out = f.renderTemplate(
      'FROM {{location}}:{{#each destinations}} {{{label}}}={{{cost}}}({{{mode}}}) via {{{via}}};{{/each}}',
    );
    expect(out).toBe('FROM Emiya Residence: Fuyuki Station=50(walk) via Fuyuki Station; Misaki Town=350(walk) via Fuyuki Station;');
  });

  it('getPromptBlock is the DEFAULT template over the current snapshot (F34/D23)', () => {
    const f = loadFuyuki();
    expect(f.getPromptBlock()).toBe(f.renderTemplate(DEFAULT_TEMPLATE));
  });
});

// --- FX4 golden-quality audit: the goldens must exercise EVERY C22 variable -----
//
// FX4: "Default XML template plus one markdown variant, golden-file tested."
// A golden that silently stops exercising a contract variable would let the
// templates drop that variable without a golden failure. This audit pins the
// CONTRACT COVERAGE of each golden file itself (C22's ten variables — D95
// added blockedNodes[] — plus the per-entry fields).
describe('VERIFY M3 — FX4 goldens exercise the full C22 contract (FX4, C22, D63, D95)', () => {
  it('the full-snapshot XML golden carries all ten variables and every entry field', () => {
    expect(DEFAULT_XML_GOLDEN).toContain('<location>Emiya Residence</location>'); // location
    expect(DEFAULT_XML_GOLDEN).toContain('<region>Miyama</region>'); // region
    expect(DEFAULT_XML_GOLDEN).toContain('<layer>Fuyuki City</layer>'); // layer
    expect(DEFAULT_XML_GOLDEN).toContain('<status>on the road to Big Bridge, ~2 km out</status>'); // statusNote
    expect(DEFAULT_XML_GOLDEN).toContain('unit="min"'); // unit (routes + destinations)
    expect(DEFAULT_XML_GOLDEN).toContain('direction="SE"'); // routes[].direction
    expect(DEFAULT_XML_GOLDEN).toContain('cost="12"'); // routes[].cost
    expect(DEFAULT_XML_GOLDEN).toContain('mode="walk"'); // routes[].mode
    expect(DEFAULT_XML_GOLDEN).toContain('blocked="Bridge closed by local authorities"'); // routes[].blockedReason (C2)
    expect(DEFAULT_XML_GOLDEN).toContain('<blocked_places>'); // blockedNodes[] (D95)
    expect(DEFAULT_XML_GOLDEN).toContain('<place label="Ghost House" reason="Warded"/>'); // blockedNodes[].label + reason
    expect(DEFAULT_XML_GOLDEN).toContain('via="Fuyuki Station"'); // destinations[].via
    expect(DEFAULT_XML_GOLDEN).toContain('truncated="true"'); // truncated (D63)
    expect(DEFAULT_XML_GOLDEN).toContain('<corrective>'); // corrective (D26)
    expect(DEFAULT_XML_GOLDEN).not.toContain('undefined');
  });

  it('the full-snapshot markdown golden carries the same contract through different words (D24, D95)', () => {
    expect(MARKDOWN_GOLDEN).toContain('**Location:** Emiya Residence');
    expect(MARKDOWN_GOLDEN).toContain('(Miyama district)');
    expect(MARKDOWN_GOLDEN).toContain('**Map layer:** Fuyuki City');
    expect(MARKDOWN_GOLDEN).toContain('**Status:** on the road to Big Bridge, ~2 km out');
    expect(MARKDOWN_GOLDEN).toContain('**Nearby routes** (min)');
    expect(MARKDOWN_GOLDEN).toContain('**BLOCKED**: Bridge closed by local authorities');
    expect(MARKDOWN_GOLDEN).toContain('**Off limits**:'); // blockedNodes[] (D95)
    expect(MARKDOWN_GOLDEN).toContain('- Ghost House — Warded'); // blockedNodes[].label + reason
    expect(MARKDOWN_GOLDEN).toContain('**Known destinations** (min)');
    expect(MARKDOWN_GOLDEN).toContain('via Fuyuki Station: 350');
    expect(MARKDOWN_GOLDEN).toContain('_(destination list truncated — entries omitted)_');
    expect(MARKDOWN_GOLDEN).toContain('> **Note:**');
    expect(MARKDOWN_GOLDEN).not.toContain('undefined');
  });

  it('both null-location goldens render the C27 warning plus the riding fields (C27, D63)', () => {
    for (const golden of [DEFAULT_XML_NULL_GOLDEN, MARKDOWN_NULL_GOLDEN]) {
      expect(golden).toContain("position is unknown"); // the C27 warning branch
      expect(golden).toContain('somewhere on the road'); // statusNote passthrough
      expect(golden).toContain('Unknown place — did you mean Fuyuki Station?'); // corrective passthrough
      expect(golden).not.toContain('undefined');
      expect(golden.length).toBeGreaterThan(0); // never an empty injection
    }
    // and the degraded branches genuinely omit the data sections
    expect(DEFAULT_XML_NULL_GOLDEN).not.toContain('<routes');
    expect(MARKDOWN_NULL_GOLDEN).not.toContain('**Nearby routes**');
  });
});
