// Template renderer tests (PKG A-009): FX4 goldens, the C22 variable
// contract, the C32 default-template fallback, and the D62 engine refusal.
// The npm `handlebars` devDependency plays the injected engine (D62 — tests
// and the dev harness only; the shipped bundle never embeds one, R5/R6).
// Goldens are byte-exact: toBe against the file's raw text. The goldens come
// in as vite ?raw imports (vite/client typing below) — the spec environment
// ships no @types/node and gains none: zero new dependencies.
/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest';
import Handlebars from 'handlebars';
import { createFacade } from '../../../src/core/facade';
import type { ChatMapOverlay, MapSnapshot, SnapshotRoute, TemplateCompiler, WorldMapData } from '../../../src/core/api';
import { DEFAULT_TEMPLATE, MARKDOWN_SAMPLE, snapshotContext } from '../../../src/core/templates/default';
import DEFAULT_XML_GOLDEN from '../../golden/fx4-default-xml.txt?raw';
import MARKDOWN_GOLDEN from '../../golden/fx4-markdown.txt?raw';
import DEFAULT_XML_NULL_GOLDEN from '../../golden/fx4-default-xml-null-location.txt?raw';
import MARKDOWN_NULL_GOLDEN from '../../golden/fx4-markdown-null-location.txt?raw';

// --- The engine under test (D62): the npm devDependency, injected -------------

const compile: TemplateCompiler = (tpl) => Handlebars.compile(tpl);

const render = (tpl: string, snap: MapSnapshot): string => compile(tpl)(snapshotContext(snap));

// --- FX4's fixed inline snapshot: a hand-built snapshot exercising EVERY C22
// variable (blockedReason, truncated, corrective, a cross-layer route with no
// direction). Not FX1 — the goldens pin the template words, not the fixture map.
const FULL: MapSnapshot = {
  location: 'Emiya Residence',
  region: 'Miyama',
  layer: 'Fuyuki City',
  statusNote: 'on the road to Big Bridge, ~2 km out',
  routes: [
    { label: 'Shopping District', direction: 'SE', cost: 12, mode: 'walk' },
    { label: 'Fuyuki Bridge', direction: 'E', cost: 25, mode: 'walk', blockedReason: 'Bridge closed by local authorities' },
    { label: 'Misaki Town', direction: '', cost: 300, mode: 'train' }, // cross-layer: no direction (C10)
  ],
  destinations: [
    { label: 'Fuyuki Station', via: 'Fuyuki Station', mode: 'walk', cost: 50 },
    { label: 'Misaki Town', via: 'Fuyuki Station', mode: 'walk', cost: 350 },
  ],
  destinationsTruncated: true,
  unit: 'min',
  corrective: "Unknown place 'stasion' — did you mean Fuyuki Station?",
};

// C27's degraded shape (A-008): null location, empty sections — but
// statusNote/corrective still ride along (D17/D63 passthrough).
const DEGRADED: MapSnapshot = {
  location: null,
  region: null,
  layer: '',
  statusNote: 'somewhere on the road',
  routes: [],
  destinations: [],
  destinationsTruncated: false,
  unit: 'min',
  corrective: 'Unknown place — did you mean Fuyuki Station?',
};

// --- A tiny self-contained map for the facade-level tests below ---------------

const tinyMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-tiny',
  name: 'Tiny',
  layers: [{ id: 'layer-tiny', name: 'Tiny Land' }],
  scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' },
  nodes: [
    { id: 'crossroads', label: 'Crossroads', kind: 'location', layer: 'layer-tiny', position: { x: 0, y: 0 } },
    { id: 'hub-a', label: 'Hub A', kind: 'hub', layer: 'layer-tiny', position: { x: 10, y: 0 } },
    { id: 'inn', label: 'The Inn', kind: 'location', layer: 'layer-tiny', position: { x: -10, y: 5 } },
  ],
  edges: [
    { id: 'e-a', source: 'crossroads', target: 'hub-a', modes: { walk: { allowed: true, authoredMinutes: 12 } } },
    { id: 'e-inn', source: 'crossroads', target: 'inn', modes: { walk: { allowed: true, authoredMinutes: 7 } } },
  ],
});

const overlayFor = (map: WorldMapData, pin: string | null = 'crossroads'): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: pin,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {},
});

const loadTiny = (facade: ReturnType<typeof createFacade>): void => {
  const map = tinyMap();
  facade.loadMap(map, overlayFor(map));
  facade.materialize();
};

// --- FX4: golden equality for both templates (FX4, C22, D24, C27) --------------

describe('FX4 goldens — default XML + markdown sample, byte-exact (FX4, D24, F33/F34)', () => {
  it('the default XML template renders the full snapshot byte-identically to its golden', () => {
    expect(render(DEFAULT_TEMPLATE, FULL)).toBe(DEFAULT_XML_GOLDEN);
  });

  it('the markdown sample renders the full snapshot byte-identically to its golden', () => {
    expect(render(MARKDOWN_SAMPLE, FULL)).toBe(MARKDOWN_GOLDEN);
  });

  it('the default XML template degrades to the null-location golden (C27)', () => {
    const out = render(DEFAULT_TEMPLATE, DEGRADED);
    expect(out).toBe(DEFAULT_XML_NULL_GOLDEN);
    expect(out).not.toContain('undefined');
  });

  it('the markdown sample degrades to the null-location golden (C27)', () => {
    const out = render(MARKDOWN_SAMPLE, DEGRADED);
    expect(out).toBe(MARKDOWN_NULL_GOLDEN);
    expect(out).not.toContain('undefined');
  });
});

// --- C22: every variable reaches the output through the npm-engine compile -----

describe('C22 variable contract reaches the rendered output (C22, C2, C10, D63)', () => {
  it('default XML: location, region, layer, status note, unit and the corrective line', () => {
    const out = render(DEFAULT_TEMPLATE, FULL);
    expect(out).toContain('<location>Emiya Residence</location>');
    expect(out).toContain('<region>Miyama</region>');
    expect(out).toContain('<layer>Fuyuki City</layer>');
    expect(out).toContain('<status>on the road to Big Bridge, ~2 km out</status>');
    expect(out).toContain('<routes unit="min">');
    expect(out).toContain('<corrective>Unknown place \'stasion\' — did you mean Fuyuki Station?</corrective>');
  });

  it('default XML: route lines carry label/direction/cost/mode — blocked keeps its reason (C2), cross-layer has none (C10)', () => {
    const out = render(DEFAULT_TEMPLATE, FULL);
    expect(out).toContain('<route label="Shopping District" direction="SE" cost="12" mode="walk"/>');
    expect(out).toContain('<route label="Fuyuki Bridge" direction="E" cost="25" mode="walk" blocked="Bridge closed by local authorities"/>');
    expect(out).toContain('<route label="Misaki Town" cost="300" mode="train"/>'); // no direction attribute
  });

  it('default XML: destination lines carry label/via/cost/mode and the truncation mark (C20/D63)', () => {
    const out = render(DEFAULT_TEMPLATE, FULL);
    expect(out).toContain('<destinations unit="min" truncated="true">');
    expect(out).toContain('<destination label="Fuyuki Station" via="Fuyuki Station" cost="50" mode="walk"/>');
    expect(out).toContain('<destination label="Misaki Town" via="Fuyuki Station" cost="350" mode="walk"/>');
  });

  it('markdown sample: the same variables through different words (D24)', () => {
    const out = render(MARKDOWN_SAMPLE, FULL);
    expect(out).toContain('**Location:** Emiya Residence (Miyama district)');
    expect(out).toContain('**Map layer:** Fuyuki City');
    expect(out).toContain('- **Status:** on the road to Big Bridge, ~2 km out');
    expect(out).toContain('**Nearby routes** (min):');
    expect(out).toContain('- Shopping District (SE): 12 (walk)');
    expect(out).toContain('- Fuyuki Bridge (E): 25 (walk) — **BLOCKED**: Bridge closed by local authorities');
    expect(out).toContain('- Misaki Town: 300 (train)');
    expect(out).toContain('**Known destinations** (min):');
    expect(out).toContain('- Fuyuki Station via Fuyuki Station: 50 (walk)');
    expect(out).toContain('- Misaki Town via Fuyuki Station: 350 (walk)');
    expect(out).toContain('_(destination list truncated — entries omitted)_');
    expect(out).toContain('> **Note:** Unknown place \'stasion\' — did you mean Fuyuki Station?');
  });
});

// --- R1/C22: the data handed to the engine --------------------------------------

describe('snapshotContext — the fixed C22 contract as data (C22, R1, D63)', () => {
  it('exactly the nine C22 variables, no more, no less', () => {
    expect(Object.keys(snapshotContext(FULL)).sort()).toEqual(
      ['corrective', 'destinations', 'layer', 'location', 'region', 'routes', 'statusNote', 'truncated', 'unit'],
    );
  });

  it('numbers stay numbers (R1) and truncated is the D63 rename of destinationsTruncated', () => {
    const ctx = snapshotContext(FULL);
    const routes = ctx['routes'] as SnapshotRoute[];
    expect(typeof routes[0]!.cost).toBe('number');
    expect(routes[0]!.cost).toBe(12); // the number 12, not the string '12' (R1)
    expect(ctx['truncated']).toBe(true); // snapshot.destinationsTruncated (D63)
    expect(ctx['unit']).toBe('min');
  });
});

// --- Facade-level behavior: engine refusal, C32 fallback, C27, C23 ---------------

describe('renderTemplate / getPromptBlock — engine injection (D62)', () => {
  it('no engine injected ⇒ renderTemplate refuses field-precisely (D62)', () => {
    const f = createFacade();
    loadTiny(f);
    expect(() => f.renderTemplate('{{location}}')).toThrow('[TravelMapper] no template engine injected (D62)');
  });

  it('no engine injected ⇒ getPromptBlock refuses field-precisely (D62)', () => {
    const f = createFacade();
    loadTiny(f);
    expect(() => f.getPromptBlock()).toThrow('[TravelMapper] no template engine injected (D62)');
  });

  it('no map loaded ⇒ the §9 query throw wins over the engine refusal (and fires without an engine too)', () => {
    expect(() => createFacade({ compile }).getPromptBlock()).toThrow('[TravelMapper] no map loaded');
    expect(() => createFacade().renderTemplate('{{location}}')).toThrow('[TravelMapper] no map loaded');
  });

  it('engine injected ⇒ getPromptBlock renders the default block over the snapshot', () => {
    const f = createFacade({ compile });
    loadTiny(f);
    const block = f.getPromptBlock();
    expect(block).toContain('<travel_context>');
    expect(block).toContain('<location>Crossroads</location>');
  });
});

describe('C32 — a broken user template degrades, never throws (C32, §6.2, D62)', () => {
  it('a syntax error (unclosed block) ⇒ the default-template output, no throw, nothing logged', () => {
    const errorSpy = vi.spyOn(console, 'error');
    const warnSpy = vi.spyOn(console, 'warn');
    const f = createFacade({ compile });
    loadTiny(f);
    const out = f.renderTemplate('{{#if location}}<unclosed>'); // compile-time error
    expect(out).toBe(f.getPromptBlock()); // the DEFAULT template over the SAME context
    expect(out.length).toBeGreaterThan(0); // never an empty injection
    expect(errorSpy).not.toHaveBeenCalled(); // log nothing — the toast is host business
    expect(warnSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('a runtime error (missing helper) ⇒ the default-template output, no throw', () => {
    const f = createFacade({ compile });
    loadTiny(f);
    const out = f.renderTemplate('{{loud location}}'); // compiles; throws at run time
    expect(out).toBe(f.getPromptBlock());
    expect(out).toContain('<location>Crossroads</location>');
  });

  it('the fallback renders over the SAME context — optional fields survive into it', () => {
    const f = createFacade({ compile });
    loadTiny(f);
    f.setStatusNote('holding the crossroads');
    // helper-with-argument ⇒ missing-helper error at run time (a bare {{{nope}}}
    // is only a lookup: the user's words may legitimately render empty, D23/D24)
    const out = f.renderTemplate('{{loud statusNote}}');
    expect(out).toBe(f.getPromptBlock());
    expect(out).toContain('<status>holding the crossroads</status>'); // the SAME context, not a re-built one
  });
});

describe('C27/C23 — degraded and excluded data render faithfully (C27, C23, C22)', () => {
  it('a null-location snapshot renders the warning through the facade — no crash, no undefined, fields ride along (C27)', () => {
    const f = createFacade({ compile });
    const map = tinyMap();
    f.loadMap(map, overlayFor(map));
    f.materialize();
    f.addUserNodeAt('layer-tiny', { x: 5, y: 0 }); // wp-1 (C5/C7)
    f.setCurrentLocation('wp-1'); // pin on an unnamed user waypoint ⇒ C23 degradation (A-008)
    f.setStatusNote('somewhere on the road');
    f.setCorrective('Unknown place — did you mean The Inn?');
    const out = f.getPromptBlock();
    expect(out).toContain('status="unknown"');
    expect(out).toContain('The party\'s current position is unknown');
    expect(out).toContain('somewhere on the road'); // D17 passthrough on degraded snapshots
    expect(out).toContain('Unknown place — did you mean The Inn?'); // D63 passthrough
    expect(out).not.toContain('undefined');
  });

  it('C23: an unnamed waypoint never reaches the context or any rendered output — the renderer passes the snapshot through faithfully', () => {
    let received: Record<string, unknown> | undefined;
    const spying: TemplateCompiler = (tpl) => (ctx) => {
      received ??= ctx; // first compile = the user template's context
      return Handlebars.compile(tpl)(ctx);
    };
    const f = createFacade({ compile: spying });
    const map = tinyMap();
    f.loadMap(map, overlayFor(map));
    f.materialize();
    f.addUserNodeAt('layer-tiny', { x: 5, y: 0 }); // wp-1 kNN-connects to all three leaves (C7)

    const out = f.renderTemplate(DEFAULT_TEMPLATE);
    expect(received).toBeDefined();
    expect(received!['routes']).toEqual(f.getSnapshot().routes); // verbatim passthrough — the renderer adds nothing (C22)
    expect(JSON.stringify(received)).not.toContain('Waypoint'); // A-008's exclusion reaches the engine intact (C23)
    expect(out).not.toContain('Waypoint');
    expect(out).not.toContain('wp-'); // no machine id either (C23)
  });
});
