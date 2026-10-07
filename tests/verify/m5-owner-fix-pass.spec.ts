// tests/verify/m5-owner-fix-pass.spec.ts — Phase 3 M5 (Owner Fix Pass, D90–D94)
// PHASE-GATE adversarial suite (Agent D). Expectations derived ONLY from the
// spec: CORE.md C34 (§5 Path conventions), C2/C17/C23/C24/C30/C32, the §9
// facade line (setNodeBlocked · setLayerBackgroundPlacement ·
// setLayerBackgroundDim · setLayerBackground's fresh-start · upsertLayer's
// D88 absent-and-preserve), EXECUTION-PLAN §1 D90/D93/D94 + the D75 outcome
// clause, §8.6(o)'s "un-undoable removals move the saved plane too" doctrine,
// F50/F55/F56; fixture facts re-derived by hand from data/worlds/fuyuki.ts
// (FX1: canonical unit time — unitLabel 'min'; bridge→station 25 min,
// station→church 20 min, bridge→harbor 15, harbor→station 15 ⇒ the cheapest
// Bridge→Church walk is 45 min; misaki-town's ONLY arc is
// arc-fuyuki-station-misaki-town, so a station node-block severs every
// Emiya→Misaki Town route at an INTERMEDIATE).
//
// Every green cell can fail for a plausible defect. The gate's FINDING probes
// were merged as documented skips (the M5 gate's merge rule: never red). Three
// were FIXED and FLIPPED by A-020 (the C34 through-case reason; the
// removeNode/removeEdge saved-plane shrink) — they now pin the fixed behavior.
// ONE documented skip REMAINS (it.skip, inline): the D94/C2-spirit prompt-
// channel probe — exposing blockedNodes needs a C22 contract amendment, an
// explicit owner call per the probe's own note.
import { describe, expect, it } from 'vitest';
import Handlebars from 'handlebars';
import { createFacade, facadeStateOf, type MapFacade } from '../../src/core/facade';
import { MapValidationError, validateOverlay, validateWorldMap } from '../../src/core/model/validate';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

const compile = (tpl: string) => Handlebars.compile(tpl);

// C24: the fixture is deep-frozen — every suite runs on a fresh mutable clone.
const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const overlayFor = (map: WorldMapData): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: null,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {},
  nodeBlocked: {},
});

const load = (map: WorldMapData, engine?: { compile: typeof compile }) => {
  const overlay = overlayFor(map);
  const f = createFacade(engine);
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

const stillValidPair = (map: WorldMapData, overlay: ChatMapOverlay): void => {
  expect(() => validateWorldMap(map)).not.toThrow();
  expect(() => validateOverlay(overlay, map)).not.toThrow();
};

// ---------------------------------------------------------------------------
// C34/D94 — the three routing seats of a blocked node.
// ---------------------------------------------------------------------------

describe('C34/D94 — a blocked node as route ORIGIN (the owner pick: the party can always leave)', () => {
  it('a route FROM a blocked node routes normally (origin exempt)', () => {
    const { f } = load(fuyuki());
    f.setNodeBlocked('fuyuki-bridge', 'Flooded');
    // Hand-derived from FX1: Bridge→Station 25 + Station→Church 20 = 45 min,
    // beating Bridge→Harbor 15 + Harbor→Station 15 + Station→Church 20 = 50.
    const r = f.findRoute('fuyuki-bridge', 'kotomine-church');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(45);
    expect(r.legs.map((l) => l.from)).toEqual(['fuyuki-bridge', 'fuyuki-station']);
    expect(r.legs.map((l) => l.to)).toEqual(['fuyuki-station', 'kotomine-church']);
    expect(r.unit).toBe('min'); // FX1 canonical: minutes
  });

  it('route-to-self ON a blocked node is the trivial origin success (§6.2 × C34)', () => {
    const { f } = load(fuyuki());
    f.setNodeBlocked('fuyuki-bridge', 'Flooded');
    const r = f.findRoute('fuyuki-bridge', 'fuyuki-bridge');
    expect(r).toEqual({ ok: true, total: 0, legs: [], unit: 'min' });
  });
});

describe('C34/D94 — a blocked node as route DESTINATION', () => {
  it('refused before any run, the reason naming authored label + authored reason verbatim', () => {
    const { f } = load(fuyuki());
    f.setNodeBlocked('fuyuki-bridge', 'Flooded');
    const r = f.findRoute('emiya-residence', 'fuyuki-bridge');
    expect(r.ok).toBe(false);
    expect(r.total).toBe(0);
    expect(r.legs).toEqual([]);
    expect(r.reason).toBe("'Fuyuki Bridge' is blocked: Flooded");
    expect(r.unit).toBe('min'); // D72: no run — the canonical label
  });

  it('origin AND destination blocked ⇒ the destination refusal still names the destination', () => {
    const { f } = load(fuyuki());
    f.setNodeBlocked('fuyuki-bridge', 'Flooded');
    f.setNodeBlocked('kotomine-church', 'Guarded');
    const r = f.findRoute('fuyuki-bridge', 'kotomine-church');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("'Kotomine Church' is blocked: Guarded");
  });

  it('blocking an OVERLAY waypoint refuses by its authored word, never its id (C23)', () => {
    const { f } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 110, y: 240 }); // wp-1 near Emiya
    f.setNodeBlocked('wp-1', 'Collapsed');
    const r = f.findRoute('emiya-residence', 'wp-1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("'Waypoint' is blocked: Collapsed");
    expect(JSON.stringify(r)).not.toContain('wp-1'); // C23: no machine name in any output
  });

  it('the lift restores routing; a lift on an unknown id is a harmless no-op (unconditional)', () => {
    const { f } = load(fuyuki());
    f.setNodeBlocked('fuyuki-bridge', 'Flooded');
    f.setNodeBlocked('fuyuki-bridge', undefined);
    expect(f.findRoute('emiya-residence', 'fuyuki-bridge').ok).toBe(true);
    expect(() => f.setNodeBlocked('never-existed', undefined)).not.toThrow();
  });

  it('a blocked hub drops from the C20 destinations; the blockedNodes listing still names it', () => {
    const { f } = load(fuyuki());
    f.setCurrentLocation('emiya-residence');
    f.materialize();
    const before = f.getSnapshot();
    expect(before.destinations.some((d) => d.label === 'Misaki Town')).toBe(true);
    f.setNodeBlocked('misaki-town', 'Warded');
    const after = f.getSnapshot();
    expect(after.destinations.some((d) => d.label === 'Misaki Town')).toBe(false);
    expect(after.blockedNodes).toEqual([{ label: 'Misaki Town', reason: 'Warded' }]);
  });
});

describe('C34/D94 — a blocked node as route INTERMEDIATE', () => {
  it('severs the route: ok:false, no legs, and ∞ never reaches any output (C17)', () => {
    const { f } = load(fuyuki());
    f.setNodeBlocked('fuyuki-station', 'Station lockdown');
    const r = f.findRoute('emiya-residence', 'misaki-town'); // the station is misaki's ONLY gateway
    expect(r.ok).toBe(false);
    expect(r.legs).toEqual([]);
    expect(JSON.stringify(r)).not.toMatch(/Infinity/i);
  });

  it('a destination-side sever is visible in the route panel query even mid-snapshot currency (D65(c))', () => {
    // The C20 runs pass forcedCurrency; the destination refusal must fire
    // there too (computeRoute is the ONE shared computation).
    const { f } = load(fuyuki());
    f.setCurrentLocation('emiya-residence');
    f.materialize();
    f.setNodeBlocked('fuyuki-station', 'Station lockdown');
    const snap = f.getSnapshot();
    expect(snap.destinations.some((d) => d.label === 'Misaki Town')).toBe(false);
    // Fuyuki Station itself is a hub destination — also refused now.
    expect(snap.destinations.some((d) => d.label === 'Fuyuki Station')).toBe(false);
  });

  // M5-GATE FINDING, FIXED (A-020) — kept as the durable regression pin.
  // C34 verbatim: "routing to or through it returns unreachable with the block
  // named"; D94 verbatim: "routing to or through it returns unreachable naming
  // the block". Observed at the gate (scratch-probe transcript, this exact
  // shape): reason: "every candidate arc is blocked or disallowed for this
  // mode" — the block NOT named, and the wording factually WRONG when no arc
  // is blocked (the sever is a NODE block). facade.ts's probe comment stated
  // the D59 brute-force connectivity run made the intermediate block "SILENT
  // here" — an implementation comment contradicting the register; the register
  // is the law. Root cause: the probe is cost-blind and A-018's node-block
  // exclusion rode the priced run's weightOf, so "connected but unpriced" was
  // misread as an arc sever. The fix (facade.ts, the D59 precedent mirrored):
  // re-run the priced computation per blocked candidate with that ONE block
  // lifted; the first unblocking that restores a route is the sever, named in
  // the destination seat's exact wording. This cell pins the fix.
  it('FINDING, FIXED (C34/D94): the through-case reason NAMES the block', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'mini',
      name: 'Mini',
      layers: [{ id: 'L', name: 'Layer' }],
      scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' },
      nodes: [
        { id: 'A', label: 'Alpha', kind: 'location', layer: 'L', position: { x: 0, y: 0 } },
        { id: 'C', label: 'Checkpoint', kind: 'waypoint', layer: 'L', position: { x: 10, y: 0 } },
        { id: 'B', label: 'Beta', kind: 'location', layer: 'L', position: { x: 20, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'A', target: 'C', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
        { id: 'e2', source: 'C', target: 'B', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
      ],
    };
    const { f } = load(map);
    f.setNodeBlocked('C', 'Guard post');
    const r = f.findRoute('A', 'B');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("'Checkpoint' is blocked: Guard post"); // the destination seat's EXACT wording shape (C34/C23)
    expect(r.reason).toContain('Checkpoint'); // the block NAMED (C34)
    expect(r.reason).toContain('Guard post'); // the block's reason carried
    expect(r.reason).not.toBe('every candidate arc is blocked or disallowed for this mode');
  });
});

// ---------------------------------------------------------------------------
// D94 — the facade command's own discipline (C30/A-014/F50/D75).
// ---------------------------------------------------------------------------

describe('setNodeBlocked command discipline (D94 §9 line)', () => {
  it('add-path is saved-plane gated: an UNSAVED editor node is refused field-precisely (A-014/F50)', () => {
    const { f } = load(fuyuki());
    f.upsertNode({ id: '', label: 'Draft Shack', kind: 'location', layer: 'layer-fuyuki' });
    expect(facadeStateOf(f).dirty).toBe(true);
    const state = facadeStateOf(f);
    const draftId = state.map!.nodes[state.map!.nodes.length - 1]!.id;
    expect(() => f.setNodeBlocked(draftId, 'why')).toThrow(/unsaved/);
    expect(facadeStateOf(f).overlay!.nodeBlocked).toEqual({});
  });

  it('an overlay waypoint is admissible on the add path (savedNodeIds ∪ userNodes)', () => {
    const { f } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 120, y: 230 });
    expect(() => f.setNodeBlocked('wp-1', 'Collapsed')).not.toThrow();
    expect(facadeStateOf(f).overlay!.nodeBlocked['wp-1']).toBe('Collapsed');
  });

  it('reason validation: empty, whitespace-only, non-string refused BEFORE mutation; valid stored verbatim untrimmed (C30)', () => {
    const { f } = load(fuyuki());
    for (const bad of ['', '   ', '\t\n', 42, null, {}] as unknown[]) {
      expect(() => f.setNodeBlocked('fuyuki-bridge', bad as never)).toThrow(/non-empty string/);
    }
    expect(facadeStateOf(f).overlay!.nodeBlocked).toEqual({});
    f.setNodeBlocked('fuyuki-bridge', '  Flooded  ');
    expect(facadeStateOf(f).overlay!.nodeBlocked['fuyuki-bridge']).toBe('  Flooded  ');
  });

  it('restating overwrites (adds-or-restates); the add path on an unknown id refuses field-precisely', () => {
    const { f } = load(fuyuki());
    f.setNodeBlocked('fuyuki-bridge', 'Flooded');
    f.setNodeBlocked('fuyuki-bridge', 'Repaired, then re-flooded');
    expect(facadeStateOf(f).overlay!.nodeBlocked['fuyuki-bridge']).toBe('Repaired, then re-flooded');
    expect(() => f.setNodeBlocked('ghost-node', 'why')).toThrow(/unknown node id/);
  });

  it('no map loaded ⇒ refusal (the uniform §9 prelude)', () => {
    const f = createFacade();
    expect(() => f.setNodeBlocked('x', 'y')).toThrow(/no map loaded/);
  });
});

// ---------------------------------------------------------------------------
// D75 polarity + F50 — overlay-blocked ≠ map data; removals clean up.
// ---------------------------------------------------------------------------

describe('D75 polarity split (the R25 adjudication: stale vs dirty)', () => {
  it('setNodeBlocked marks STALE, never dirty; saveMap carries NO blocks (chat-scoped, D94)', () => {
    const { f, map } = load(fuyuki());
    f.setNodeBlocked('fuyuki-bridge', 'Flooded');
    const s = facadeStateOf(f);
    expect(s.stale).toBe(true);
    expect(s.dirty).toBe(false);
    expect(f.hasUnsavedChanges()).toBe(false);
    // The routing change is live WITHOUT a materialize (the next query's
    // ensureFresh) — and the saved map object never grows a block field.
    expect(f.findRoute('emiya-residence', 'fuyuki-bridge').ok).toBe(false);
    f.saveMap(); // legal — blocks are not map data, the map still validates
    expect(JSON.stringify(map)).not.toContain('nodeBlocked');
    expect(facadeStateOf(f).overlay!.nodeBlocked['fuyuki-bridge']).toBe('Flooded'); // survives in the chat plane
  });

  it('setLayerBackgroundDim / setLayerBackgroundPlacement mark DIRTY, never stale (D75 — map data)', () => {
    const { f } = load(fuyuki());
    f.setLayerBackgroundDim('layer-fuyuki', 0.4);
    let s = facadeStateOf(f);
    expect(s.dirty).toBe(true);
    expect(s.stale).toBe(false);
    expect(f.hasUnsavedChanges()).toBe(true);
    const f2 = load(fuyuki()).f;
    f2.setLayerBackgroundPlacement('layer-fuyuki', { x: 1, y: 2, scale: 3 });
    s = facadeStateOf(f2);
    expect(s.dirty).toBe(true);
    expect(s.stale).toBe(false);
  });

  it('an overlay command never clobbers a standing dirty (the flags are independent)', () => {
    const { f } = load(fuyuki());
    f.upsertLayer({ id: 'layer-fuyuki', name: 'Fuyuki Renamed' }); // dirty
    f.setNodeBlocked('fuyuki-bridge', 'Flooded'); // overlay
    const s = facadeStateOf(f);
    expect(s.dirty).toBe(true); // untouched by the overlay command
    expect(s.stale).toBe(true);
  });
});

describe('F50 — removals clean up their blocks (the brick prevention, green half)', () => {
  it('removeUserNode takes the waypoint node-block with it', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 120, y: 230 });
    f.setNodeBlocked('wp-1', 'Collapsed');
    f.removeUserNode('wp-1');
    expect(overlay.nodeBlocked).toEqual({});
    stillValidPair(map, overlay); // the next loadMap must not refuse
  });

  it('removeNode takes a library node-block with it', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setNodeBlocked('harbor', 'Flooded');
    f.removeNode('harbor');
    expect(overlay.nodeBlocked).toEqual({});
    stillValidPair(map, overlay);
  });

  it('removeEdge takes the removed arc block with it', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setBlocked('arc-fuyuki-station-harbor', 'Pier closed');
    f.removeEdge('arc-fuyuki-station-harbor');
    expect(overlay.blocked).toEqual({});
    stillValidPair(map, overlay);
  });

  it('removeLayer cascades node-blocks of dying nodes in BOTH planes and shrinks the saved node universe', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-misaki', { x: 210, y: 210 }); // wp-1 dies with the layer
    f.setNodeBlocked('misaki-town', 'Warded'); // dies with the layer
    f.setNodeBlocked('wp-1', 'Flooded'); // dies with the layer
    f.setNodeBlocked('fuyuki-bridge', 'Flooded'); // SURVIVES
    f.removeLayer('layer-misaki');
    expect(overlay.nodeBlocked).toEqual({ 'fuyuki-bridge': 'Flooded' });
    expect(facadeStateOf(f).savedNodeIds.has('misaki-town')).toBe(false); // §8.6(o): the shrink
    expect(facadeStateOf(f).savedNodeIds.has('wp-1')).toBe(false);
    stillValidPair(map, overlay);
  });

  it('detachNode keeps the SURVIVING node block but shrinks savedEdgeIds — a post-detach arc-block add refuses', () => {
    const { f } = load(fuyuki());
    f.setNodeBlocked('outskirts', 'Quarantined');
    const before = facadeStateOf(f).savedEdgeIds.size;
    f.detachNode('outskirts');
    expect(facadeStateOf(f).overlay!.nodeBlocked['outskirts']).toBe('Quarantined'); // the node survives
    const after = facadeStateOf(f).savedEdgeIds;
    expect(after.size).toBeLessThan(before);
    expect(() => f.setBlocked('arc-outskirts-fuyuki-bridge', 'why')).toThrow(/unsaved/); // the M3 doctrine holds
  });

  // M5-GATE FINDING, FIXED (A-020) — kept as the durable regression pin.
  // D75 outcome clause: "validateOverlay must never find a chat key that
  // references data the SAVED map lacks"; §8.6(o) (the M3 gate ruling):
  // "un-undoable removals move [the saved plane] too"; AGENTS.md §6: "a new
  // removal-shaped command must shrink them, or setBlocked/addUserNodeAt admit
  // binds to dead ids and the next loadMap refuses the whole overlay (the F50
  // brick)". removeNode (P3 M1) was an un-undoable removal that did NOT shrink
  // savedNodeIds/savedEdgeIds (only removeLayer/detachNode did). Observed at
  // the gate (scratch-probe transcript): removeNode('harbor') then
  // setNodeBlocked('harbor','Flooded') was ADMITTED (the stale savedNodeIds
  // passed the gate); validateOverlay(overlay, map) then refused the WHOLE
  // overlay — the chat's next loadMap bricked. removeNode now shrinks the
  // universes (the removeLayer seam mirrored), so the add-path gate refuses
  // field-precisely. This cell pins the fix.
  it('FINDING, FIXED (F50/D75): a node-block cannot bind a node removeNode just deleted', () => {
    const { f, map, overlay } = load(fuyuki());
    f.removeNode('harbor'); // un-undoable (F46); savedNodeIds still carried it
    expect(() => f.setNodeBlocked('harbor', 'Flooded')).toThrow(/unknown node id|unsaved/);
    expect(overlay.nodeBlocked).toEqual({});
    stillValidPair(map, overlay);
  });

  // M5-GATE FINDING, FIXED (A-020) — kept as the durable regression pin. The
  // removeEdge mirror of the cell above: the un-undoable removal now shrinks
  // savedEdgeIds (the removeLayer/detachNode seam mirrored), so setBlocked's
  // add path refuses the dead id field-precisely instead of admitting a bind
  // that would brick the next loadMap (F50/D75, §8.6(o)).
  it('FINDING, FIXED (F50/D75): an arc-block cannot bind an edge removeEdge just deleted', () => {
    const { f, map, overlay } = load(fuyuki());
    f.removeEdge('arc-fuyuki-station-harbor');
    expect(() => f.setBlocked('arc-fuyuki-station-harbor', 'Pier closed')).toThrow(/unknown edge id|unsaved/);
    expect(overlay.blocked).toEqual({});
    stillValidPair(map, overlay);
  });
});

// ---------------------------------------------------------------------------
// D90/D93 — the presentation arms: validator shape, fresh-start, D88, round-trip,
// and the never-in-a-prompt guarantee.
// ---------------------------------------------------------------------------

describe('D90/D93 validator arms (C30 field-precise, clone-validate-apply)', () => {
  it('dim: boundaries 0 and 1 accepted verbatim; outside/non-finite/non-number refused field-precisely', () => {
    const { f, map } = load(fuyuki());
    f.setLayerBackgroundDim('layer-fuyuki', 0);
    expect(map.layers[0]!.backgroundDim).toBe(0);
    f.setLayerBackgroundDim('layer-fuyuki', 1);
    expect(map.layers[0]!.backgroundDim).toBe(1);
    for (const bad of [-0.01, 1.01, NaN, Infinity, -Infinity, '0.5', null]) {
      try {
        f.setLayerBackgroundDim('layer-fuyuki', bad as never);
        expect.unreachable(`dim ${String(bad)} must refuse`);
      } catch (e) {
        expect(e).toBeInstanceOf(MapValidationError);
        expect((e as MapValidationError).issues.some((i) => /layers\[\d+\]\.backgroundDim/.test(i.path))).toBe(true);
      }
    }
    expect(map.layers[0]!.backgroundDim).toBe(1); // the refusals never landed
  });

  it('placement: finite x/y + scale>0 accepted; each sub-field refuses with its OWN path; null clears', () => {
    const { f, map } = load(fuyuki());
    const given = { x: 10, y: -4, scale: 0.5 };
    f.setLayerBackgroundPlacement('layer-fuyuki', given);
    expect(map.layers[0]!.backgroundPlacement).toEqual({ x: 10, y: -4, scale: 0.5 });
    given.x = 999; // never alias the caller's object (D75)
    expect(map.layers[0]!.backgroundPlacement).toEqual({ x: 10, y: -4, scale: 0.5 });
    for (const [bad, pathRe] of [
      [{ x: NaN, y: 0, scale: 1 }, /\.x$/],
      [{ x: 0, y: Infinity, scale: 1 }, /\.y$/],
      [{ x: 0, y: 0, scale: 0 }, /\.scale$/],
      [{ x: 0, y: 0, scale: -1 }, /\.scale$/],
      [{ x: 0, y: 0, scale: 'big' }, /\.scale$/],
      [{ x: 0, y: 0 }, /\.scale$/], // scale missing ⇒ not a finite number > 0
      ['nope', /\.backgroundPlacement(\.(x|y|scale))+$/], // a spread string becomes an object with all-sub-field defects
    ] as const) {
      try {
        f.setLayerBackgroundPlacement('layer-fuyuki', bad as never);
        expect.unreachable(`placement ${JSON.stringify(bad)} must refuse`);
      } catch (e) {
        expect(e).toBeInstanceOf(MapValidationError);
        expect(
          (e as MapValidationError).issues.some(
            (i) => /^layers\[\d+\]\.backgroundPlacement/.test(i.path) && pathRe.test(i.path),
          ),
        ).toBe(true);
      }
    }
    f.setLayerBackgroundPlacement('layer-fuyuki', null);
    expect(map.layers[0]!.backgroundPlacement).toBeUndefined(); // the D92 default applies again
  });

  it('a refused write leaves the PRIOR arm byte-identical (reject-before-mutate)', () => {
    const { f, map } = load(fuyuki());
    f.setLayerBackgroundDim('layer-fuyuki', 0.25);
    expect(() => f.setLayerBackgroundDim('layer-fuyuki', 7)).toThrow();
    expect(map.layers[0]!.backgroundDim).toBe(0.25);
    f.setLayerBackgroundPlacement('layer-fuyuki', { x: 1, y: 1, scale: 1 });
    expect(() => f.setLayerBackgroundPlacement('layer-fuyuki', { x: NaN, y: 1, scale: 1 })).toThrow();
    expect(map.layers[0]!.backgroundPlacement).toEqual({ x: 1, y: 1, scale: 1 });
  });
});

describe('D93 fresh-start + D88 absent-and-preserve (upsertLayer)', () => {
  it('setLayerBackground (new source) resets BOTH arms — an old image tuning never leaks', () => {
    const { f, map } = load(fuyuki());
    f.setLayerBackgroundDim('layer-fuyuki', 0.6);
    f.setLayerBackgroundPlacement('layer-fuyuki', { x: 5, y: 5, scale: 2 });
    f.setLayerBackground('layer-fuyuki', { url: 'https://example.com/new.png' });
    expect(map.layers[0]!.background).toEqual({ url: 'https://example.com/new.png' });
    expect(map.layers[0]!.backgroundDim).toBeUndefined();
    expect(map.layers[0]!.backgroundPlacement).toBeUndefined();
  });

  it('setLayerBackground(null) clears the source AND both arms', () => {
    const { f, map } = load(fuyuki());
    f.setLayerBackground('layer-fuyuki', { url: 'https://example.com/x.png' });
    f.setLayerBackgroundDim('layer-fuyuki', 0.6);
    f.setLayerBackgroundPlacement('layer-fuyuki', { x: 5, y: 5, scale: 2 });
    f.setLayerBackground('layer-fuyuki', null);
    expect(map.layers[0]!.background).toBeUndefined();
    expect(map.layers[0]!.backgroundDim).toBeUndefined();
    expect(map.layers[0]!.backgroundPlacement).toBeUndefined();
  });

  it('tuning with NO background present is still reset by the next setLayerBackground', () => {
    const { f, map } = load(fuyuki()); // FX1 carries no background arm
    f.setLayerBackgroundDim('layer-fuyuki', 0.9); // legal — the arm is independent
    f.setLayerBackground('layer-fuyuki', { url: 'https://example.com/x.png' });
    expect(map.layers[0]!.backgroundDim).toBeUndefined(); // the fresh-start reached it
  });

  it('upsertLayer rename preserves background, placement AND dim byte-identical (D88/D93 absent-and-preserve)', () => {
    const { f, map } = load(fuyuki());
    f.setLayerBackground('layer-fuyuki', { url: 'https://example.com/x.png' });
    f.setLayerBackgroundDim('layer-fuyuki', 0.35);
    f.setLayerBackgroundPlacement('layer-fuyuki', { x: 7, y: 8, scale: 1.5 });
    const before = JSON.stringify(map.layers[0]);
    f.upsertLayer({ id: 'layer-fuyuki', name: 'Fuyuki Renamed' });
    expect(map.layers[0]!.name).toBe('Fuyuki Renamed');
    expect(JSON.stringify(map.layers[0])).not.toBe(before); // the name moved
    expect(map.layers[0]!.background).toEqual({ url: 'https://example.com/x.png' });
    expect(map.layers[0]!.backgroundDim).toBe(0.35);
    expect(map.layers[0]!.backgroundPlacement).toEqual({ x: 7, y: 8, scale: 1.5 });
  });

  it('a caller smuggling placement/dim through the upsertLayer ARG has them ignored — the two commands own the arms', () => {
    const { f, map } = load(fuyuki());
    f.setLayerBackgroundDim('layer-fuyuki', 0.35);
    f.upsertLayer({
      id: 'layer-fuyuki',
      name: 'Fuyuki Renamed',
      backgroundPlacement: { x: 0, y: 0, scale: 99 },
      backgroundDim: 1,
    } as never);
    expect(map.layers[0]!.backgroundDim).toBe(0.35); // preserved, not clobbered
    expect(map.layers[0]!.backgroundPlacement).toBeUndefined(); // never created from the arg
  });

  it('a supplied background arm replaces ONLY the background; the tuning arms survive', () => {
    const { f, map } = load(fuyuki());
    f.setLayerBackgroundDim('layer-fuyuki', 0.35);
    f.setLayerBackgroundPlacement('layer-fuyuki', { x: 7, y: 8, scale: 1.5 });
    f.upsertLayer({ id: 'layer-fuyuki', name: 'Fuyuki', background: { url: 'https://example.com/y.png' } });
    expect(map.layers[0]!.background).toEqual({ url: 'https://example.com/y.png' });
    expect(map.layers[0]!.backgroundDim).toBe(0.35);
    expect(map.layers[0]!.backgroundPlacement).toEqual({ x: 7, y: 8, scale: 1.5 });
  });
});

describe('D90 — the arms are saved map data, prompt-blind', () => {
  it('saveMap round-trips both arms through validation and a JSON cycle (schemaVersion stays 2)', () => {
    const { f, map } = load(fuyuki());
    f.setLayerBackgroundDim('layer-misaki', 0.8);
    f.setLayerBackgroundPlacement('layer-misaki', { x: 200, y: 200, scale: 0.25 });
    f.saveMap();
    expect(f.hasUnsavedChanges()).toBe(false);
    const cycled = JSON.parse(JSON.stringify(map)) as WorldMapData;
    expect(cycled.schemaVersion).toBe(2);
    expect(() => validateWorldMap(cycled)).not.toThrow();
    const misaki = cycled.layers.find((l) => l.id === 'layer-misaki')!;
    expect(misaki.backgroundDim).toBe(0.8);
    expect(misaki.backgroundPlacement).toEqual({ x: 200, y: 200, scale: 0.25 });
  });

  it('NEITHER arm reaches the snapshot or the prompt — while a block reason DOES (C2/C34 positive control, D90/D93)', () => {
    const { f } = load(fuyuki(), { compile });
    f.setLayerBackgroundDim('layer-fuyuki', 1);
    f.setLayerBackgroundPlacement('layer-fuyuki', { x: 12345, y: -6789, scale: 0.0075 });
    f.setCurrentLocation('emiya-residence');
    f.setNodeBlocked('fuyuki-bridge', 'Flooded'); // the NODE block — snapshot-level (below)
    f.materialize();
    const snap = f.getSnapshot();
    const snapJson = JSON.stringify(snap);
    expect(snapJson).not.toContain('backgroundDim');
    expect(snapJson).not.toContain('backgroundPlacement');
    expect(snapJson).not.toContain('background');
    expect(snap.blockedNodes).toEqual([{ label: 'Fuyuki Bridge', reason: 'Flooded' }]);
    // Positive control — an authored ARC block's reason renders (C2): the
    // pin-incident Emiya↔Bridge arc carries its authored reason into routes.
    const prompt = f.getPromptBlock();
    expect(prompt).not.toContain('12345');
    expect(prompt).not.toContain('0.0075');
    expect(prompt).toContain('Fuyuki Bridge');
    expect(prompt).toContain('Bridge closed by local authorities');
  });

  // FINDING-PROBE SKIP (M5 gate, Agent D) — DO NOT merge green, DO NOT delete.
  // D94: nodeBlocked "mirrors the arc blocks (D20 spirit: excluded from
  // routing, visible to the prompt)"; C2's rule exists so "the LLM knows why a
  // route is unavailable". The snapshot carries blockedNodes (C34's literal
  // sentence — met), but snapshotContext's C22 variable contract (the ONE
  // prompt channel) does NOT expose it — no template, default or user, can
  // render a node-block reason. The prompt never learns why a node is barred.
  // Whether this needs a C22/D94 contract amendment is an owner call; until
  // then the D20-spirit half of the mirror is inoperative. Enabling this cell
  // turns the suite red until the context exposes the listing.
  it.skip('FINDING (D94/C2-spirit): a node-block reason can reach a prompt through the template contract', () => {
    const { f } = load(fuyuki(), { compile });
    f.setCurrentLocation('emiya-residence');
    f.setNodeBlocked('fuyuki-bridge', 'Flooded');
    f.materialize();
    const out = f.renderTemplate('{{#each blockedNodes}}{{{label}}}:{{{reason}}}{{/each}}');
    expect(out).toContain('Fuyuki Bridge');
    expect(out).toContain('Flooded');
  });

  it('the blockedNodes listing rides the DEGRADED (pin-less) snapshot too, and a C24-dangling key degrades out silently', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setNodeBlocked('ghost-house', 'Burned down');
    f.setNodeBlocked('fuyuki-bridge', 'Flooded');
    // Degrade the pin out of the snapshot (C27 path) via a null pin.
    f.setCurrentLocation(null);
    f.materialize();
    let snap = f.getSnapshot();
    expect(snap.location).toBeNull();
    expect(snap.blockedNodes).toEqual([
      { label: 'Ghost House', reason: 'Burned down' },
      { label: 'Fuyuki Bridge', reason: 'Flooded' },
    ]);
    // C24: a live library edit deletes Ghost House under the overlay's feet;
    // the dangling key degrades out of the listing (C32) — never a throw.
    map.nodes = map.nodes.filter((nd) => nd.id !== 'ghost-house');
    f.materialize();
    snap = f.getSnapshot();
    expect(snap.blockedNodes).toEqual([{ label: 'Fuyuki Bridge', reason: 'Flooded' }]);
    // …and validateOverlay would refuse the now-dangling chat key (the F50
    // load-side gate the facade's removal cleanups above must pre-empt).
    expect(() => validateOverlay(overlay, map)).toThrow();
  });

  it('an unnamed blocked waypoint never reaches the listing (C23)', () => {
    const { f } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 130, y: 235 });
    f.setNodeBlocked('wp-1', 'Collapsed');
    f.setCurrentLocation('emiya-residence');
    f.materialize();
    const snap = f.getSnapshot();
    expect(snap.blockedNodes).toBeUndefined(); // omitted entirely — no empty-array noise (the statusNote shape)
    expect(JSON.stringify(f.getSnapshot())).not.toContain('wp-1'); // …and id-free (C23)
  });
});
