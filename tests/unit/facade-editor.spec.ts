// Behavior tests for the Phase 3 M1 editor commands (PKG A-013): upsertNode /
// upsertEdge / removeNode / removeEdge / saveMap / hasUnsavedChanges.
// D75 command semantics · C5 engine-assigned ids on create ('node-<n>' /
// 'arc-<n>', bump-until-free over the merged id set) · C24 in-place mutation,
// live references, caller objects never aliased · C30 reject-before-mutate
// (clone-validate-apply; field-precise collected issues; the four §6.2 data
// cases) · C8 the rebuild trigger is *edit save* — editor commands never set
// stale · F45/C29 nothing goes live until saved · F40/F46 the editor's
// mutation surface. A-014 (gate fix) pins the D75 amendment's SAVED-plane
// rule: while dirty, the RUNTIME commands derive their membership from the
// saved id-plane universes (savedNodeIds/savedEdgeIds — populated at loadMap,
// refreshed at saveMap), so the pin, setBlocked's add path and the C7 kNN
// never bind unsaved library state (C30 field-precise refusals; F50 — the
// overlay must stay reload-safe against the SAVED map).
// FX1 (data/worlds/fuyuki) is the fixture.
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf, WAYPOINT_KNN } from '../../src/core/facade';
import { MapValidationError, validateOverlay, validateWorldMap } from '../../src/core/model/validate';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, MapEdgeData, MapNodeData, WorldMapData } from '../../src/core/api';

// C24: the facade keeps the loaded references — every suite builds a fresh
// mutable clone of the deep-frozen FX1 fixture so tests never interact.
const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const overlayFor = (map: WorldMapData): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: null,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {}, nodeBlocked: {},
});

const load = (map: WorldMapData) => {
  const overlay = overlayFor(map);
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

// F50: after every command's happy path AND after every refusal, both planes
// still validate.
const expectStillValid = (map: WorldMapData, overlay: ChatMapOverlay): void => {
  expect(() => validateWorldMap(map)).not.toThrow();
  expect(() => validateOverlay(overlay, map)).not.toThrow();
};

const lastOf = <T>(arr: T[]): T => arr[arr.length - 1];

// A valid node draft with an EMPTY id — the D75 create signal.
const nodeDraft = (over: Partial<MapNodeData> = {}): MapNodeData => ({
  id: '',
  label: 'New Spot',
  kind: 'location',
  layer: 'layer-fuyuki',
  position: { x: 300, y: 300 },
  ...over,
});

// A valid edge draft with an EMPTY id — the D75 create signal.
const edgeDraft = (over: Partial<MapEdgeData> = {}): MapEdgeData => ({
  id: '',
  source: 'outskirts',
  target: 'einzbern-castle',
  modes: { walk: { allowed: true } },
  ...over,
});

// Capture a MapValidationError's collected issues (C30).
const issuesOf = (run: () => void): MapValidationError => {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(MapValidationError);
    return e as MapValidationError;
  }
  throw new Error('expected the command to throw MapValidationError');
};

// --- upsertNode: create (C5, C24, D75) -------------------------------------------------------

describe('upsertNode — create (C5, C24, D75)', () => {
  it('assigns an engine id and never aliases the caller object into state (C5, C24, D75)', () => {
    const { f, map, overlay } = load(fuyuki());
    const draft = nodeDraft({ aliases: ['spot'] });
    f.upsertNode(draft);
    const created = lastOf(map.nodes);
    expect(created.id).toMatch(/^node-\d+$/); // C5: the id belongs to the engine
    expect(created).not.toBe(draft); // a FRESH object — the UI binds form drafts (D75)
    expect(created.aliases).toEqual(['spot']);
    // Mutating the caller's draft afterwards must not move state (C24/D75).
    draft.label = 'Moved';
    draft.aliases!.push('extra');
    expect(created.label).toBe('New Spot');
    expect(created.aliases).toEqual(['spot']); // optional array fields copied
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('bumps past scheme-shaped authored ids — authored data cannot hijack the counter (C5)', () => {
    const map = fuyuki();
    map.nodes.push({
      id: 'node-1', label: 'Scheme-shaped', kind: 'location', layer: 'layer-fuyuki', position: { x: 700, y: 700 },
    });
    const { f, overlay } = load(map);
    f.upsertNode(nodeDraft());
    expect(lastOf(map.nodes).id).toBe('node-2'); // bumped until free over the merged set (C5)
    expectStillValid(map, overlay);
  });

  it('the counter is shared with addUserNodeAt — waypoints and nodes never collide (C5, D75)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 250 }); // consumes wp-1 / we-1..3
    f.upsertNode(nodeDraft());
    const nodeId = lastOf(map.nodes).id;
    const mergedIds = new Set([...map.nodes, ...overlay.userNodes].map((nd) => nd.id));
    expect(mergedIds.size).toBe(map.nodes.length + overlay.userNodes.length); // no collision anywhere (C5)
    expect(nodeId).not.toBe(overlay.userNodes[0].id);
    expectStillValid(map, overlay);
  });
});

// --- upsertNode: replace (D75, C24) ------------------------------------------------------------

describe('upsertNode — replace (D75, F45, C24)', () => {
  it('full-replace: explicit-undefined optionals clear; the OLD element is left byte-identical (D75, F45)', () => {
    const { f, map, overlay } = load(fuyuki());
    const emiya = map.nodes.find((nd) => nd.id === 'emiya-residence')!;
    expect(emiya.aliases).toBeDefined(); // FX1 ships aliases — PUT must clear them
    f.upsertNode({
      id: 'emiya-residence', label: 'Emiya Residence', kind: 'location', layer: 'layer-fuyuki',
      position: { x: 100, y: 250 },
      aliases: undefined, parent: undefined, transit: undefined, description: undefined, origin: 'authored',
    });
    const stored = map.nodes.find((nd) => nd.id === 'emiya-residence')!;
    expect(stored).not.toBe(emiya); // a FRESH object swapped in by splice — never mutated in place (F45/D75)
    expect(stored.id).toBe('emiya-residence'); // id immutable
    expect(stored.aliases).toBeUndefined(); // PUT, not PATCH: explicit undefined clears (D75)
    expect(stored.parent).toBeUndefined();
    expect(emiya.aliases).toEqual(['Emiya home']); // the old object is untouched — the effective graph holds it
    expect(emiya.parent).toBe('district-miyama'); // and must keep serving the SAVED value until saveMap
    expectStillValid(map, overlay);
  });

  it('an unknown non-empty id is a field-precise rejection (C5/D75)', () => {
    const { f, map, overlay } = load(fuyuki());
    expect(() => f.upsertNode(nodeDraft({ id: 'nope' }))).toThrow(
      "[TravelMapper] upsertNode: unknown node id 'nope' — pass '' to create (C5/D75)",
    );
    expectStillValid(map, overlay);
  });

  it('an overlay waypoint id is unknown to the LIBRARY plane — editor commands never reach the overlay (D75)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 250 });
    const wpId = overlay.userNodes[0].id;
    expect(() => f.upsertNode(nodeDraft({ id: wpId }))).toThrow(new RegExp(`unknown node id '${wpId}'`));
    expect(overlay.userNodes[0].label).toBe('Waypoint'); // untouched
    expectStillValid(map, overlay);
  });
});

// --- upsertEdge (C5, C1, D75) --------------------------------------------------------------------

describe('upsertEdge — create, replace, refusals (C5, C1, C30, D75)', () => {
  it('create assigns an engine id; unsaved the node is unroutable, after saveMap it routes (F45, C8, D75)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.upsertNode(nodeDraft({ label: 'Riverside' }));
    const node = lastOf(map.nodes);
    f.upsertEdge(edgeDraft({ target: node.id, modes: { walk: { allowed: true, authoredMinutes: 7 } } }));
    const arc = lastOf(map.edges);
    expect(arc.id).toMatch(/^arc-\d+$/); // C5: engine-assigned
    expect(f.hasUnsavedChanges()).toBe(true);
    expect(() => f.findRoute('outskirts', node.id)).toThrow(/unknown node id/); // F45: unsaved ⇒ not live
    f.saveMap(); // C8 edit save
    const r = f.findRoute('outskirts', node.id);
    expect(r.ok).toBe(true);
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0].arcId).toBe(arc.id);
    expect(r.legs[0].cost).toBe(7); // authored minutes win (C14)
    expectStillValid(map, overlay);
  });

  it('replace is a PUT by splice — routing serves the SAVED value until saveMap (F45, C8, D75)', () => {
    const { f, map } = load(fuyuki());
    const arc = map.edges.find((e) => e.id === 'arc-emiya-residence-shopping-district')!;
    expect(f.findRoute('emiya-residence', 'shopping-district').total).toBe(12); // FX1's authored value
    f.upsertEdge({
      id: arc.id, source: arc.source, target: arc.target,
      modes: { walk: { allowed: true, authoredMinutes: 99 } },
    });
    const stored = map.edges.find((e) => e.id === arc.id)!;
    expect(stored).not.toBe(arc); // a FRESH object swapped in by splice — never mutated in place (F45/D75)
    expect(stored.modes.walk?.authoredMinutes).toBe(99); // PUT took effect on the data
    expect(arc.modes.walk?.authoredMinutes).toBe(12); // the old object is byte-identical
    expect(f.hasUnsavedChanges()).toBe(true);
    expect(f.findRoute('emiya-residence', 'shopping-district').total).toBe(12); // F45: still the SAVED graph
    f.saveMap(); // C8 edit save — the rebuild contract runs
    expect(f.hasUnsavedChanges()).toBe(false);
    expect(f.findRoute('emiya-residence', 'shopping-district').total).toBe(28); // now live: via academy 18+10
    expect(facadeStateOf(f).stale).toBe(false); // the query consumed the flag (C8)
  });

  it('F45 discriminator: an unsaved label replacement never reaches the snapshot; saveMap takes it live (F45, C8, D75)', () => {
    const map = fuyuki();
    const overlay = { ...overlayFor(map), currentLocationId: 'outskirts' }; // emiya is a snapshot destination from here
    const f = createFacade();
    f.loadMap(map, overlay);
    f.materialize();
    expect(JSON.stringify(f.getSnapshot())).toContain('Emiya Residence');
    f.upsertNode({
      id: 'emiya-residence', label: 'Renamed Estate', kind: 'location', layer: 'layer-fuyuki',
      position: { x: 100, y: 250 },
    });
    expect(f.hasUnsavedChanges()).toBe(true);
    expect(facadeStateOf(f).stale).toBe(false); // the edit set dirty, never stale (D75)
    const before = JSON.stringify(f.getSnapshot());
    expect(before).toContain('Emiya Residence'); // the SAVED label is still served (F45/D75)
    expect(before).not.toContain('Renamed Estate');
    f.saveMap();
    const after = JSON.stringify(f.getSnapshot());
    expect(after).toContain('Renamed Estate'); // live only after the save (F45/C8)
    expect(after).not.toContain('Emiya Residence');
  });

  it('an unknown non-empty id is a field-precise rejection (C5/D75)', () => {
    const { f } = load(fuyuki());
    expect(() => f.upsertEdge(edgeDraft({ id: 'nope' }))).toThrow(
      "[TravelMapper] upsertEdge: unknown edge id 'nope' — pass '' to create (C5/D75)",
    );
  });
});

// --- C30: the four §6.2 data cases refuse BEFORE mutation, field-precise and collected -----------

describe('C30 reject-before-mutate — the §6.2 data cases (C30, D75)', () => {
  it('duplicate node id (C24 host-edit simulation): refused pre-mutation, state byte-identical', () => {
    const { f, map, overlay } = load(fuyuki());
    map.nodes.push({ ...map.nodes[2] }); // a duplicate id now lives in the live data
    const before = JSON.stringify([map, overlay]); // baseline AFTER the corruption
    const err = issuesOf(() => f.upsertNode(nodeDraft())); // even a valid create must refuse
    expect(err.issues.some((i) => i.message.includes('duplicate node id'))).toBe(true);
    expect(JSON.stringify([map, overlay])).toBe(before); // the command added nothing beyond the corruption (C30)
  });

  it('dangling edge endpoint: refused with a field-precise source path, no edge added', () => {
    const { f, map, overlay } = load(fuyuki());
    const count = map.edges.length;
    const err = issuesOf(() => f.upsertEdge(edgeDraft({ source: 'ghost-node' })));
    expect(err.issues.some((i) => i.path.endsWith('.source') && i.message.includes('not found'))).toBe(true);
    expect(map.edges).toHaveLength(count); // nothing touched (C30)
    expect(f.hasUnsavedChanges()).toBe(false); // a refusal never flips dirty (D75)
    expectStillValid(map, overlay);
  });

  it('NaN coordinates: refused with a field-precise position path, no node added', () => {
    const { f, map, overlay } = load(fuyuki());
    const count = map.nodes.length;
    const err = issuesOf(() => f.upsertNode(nodeDraft({ position: { x: NaN, y: 0 } })));
    expect(err.issues.some((i) => i.path.endsWith('.position.x'))).toBe(true);
    expect(map.nodes).toHaveLength(count); // nothing touched (C30)
    expectStillValid(map, overlay);
  });

  it('edge into a compound parent: refused per C1 — the validator owns the rule, no ad-hoc checks (C1, §6.2)', () => {
    const { f, map, overlay } = load(fuyuki());
    const count = map.edges.length;
    const err = issuesOf(() => f.upsertEdge(edgeDraft({ source: 'district-miyama' }))); // FX1 compound parent
    expect(err.issues.some((i) => i.path.endsWith('.source') && i.message.includes('leaf node'))).toBe(true);
    expect(map.edges).toHaveLength(count);
    expectStillValid(map, overlay);
  });

  it('issues are COLLECTED — one error carries every field-precise defect (C30)', () => {
    const { f } = load(fuyuki());
    const err = issuesOf(() => f.upsertNode(nodeDraft({ layer: 'layer-nowhere', position: { x: NaN, y: 0 } })));
    expect(err.issues.length).toBeGreaterThanOrEqual(2); // layer + position.x in ONE report
  });
});

// --- removeNode / removeEdge (D75, C24, F50) -------------------------------------------------------

describe('removeNode — cascade in BOTH planes (D75, C24, F50)', () => {
  it('removes the node, its library edges AND incident overlay user edges; the chat block dies too', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 250 }); // wp-1 connects to emiya (C7 over FX1)
    const wp = overlay.userNodes[0];
    const libCount = map.edges.length;
    f.setBlocked('arc-emiya-residence-fuyuki-station', 'station closed');
    expect(overlay.blocked['arc-emiya-residence-fuyuki-station']).toBeDefined();

    f.removeNode('emiya-residence');
    expect(map.nodes.some((nd) => nd.id === 'emiya-residence')).toBe(false);
    for (const e of map.edges) {
      expect(e.source === 'emiya-residence' || e.target === 'emiya-residence').toBe(false); // no dangling endpoint
    }
    expect(map.edges.length).toBeLessThan(libCount); // library edges cascaded
    for (const e of overlay.userEdges) {
      expect(e.source === 'emiya-residence' || e.target === 'emiya-residence').toBe(false); // BOTH planes (D75)
    }
    expect(overlay.blocked['arc-emiya-residence-fuyuki-station']).toBeUndefined(); // a block on a dying edge dies (F50)
    expect(overlay.userNodes.map((nd) => nd.id)).toContain(wp.id); // the waypoint survives, orphaned (C7: legal)
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });

  it('removing a compound parent whose children would dangle is refused, map byte-identical (C30, C1)', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    expect(() => f.removeNode('district-miyama')).toThrow(MapValidationError);
    expect(JSON.stringify([map, overlay])).toBe(before); // nothing touched (C30)
    expectStillValid(map, overlay);
  });

  it('an unknown id is a field-precise refusal (C30)', () => {
    const { f, map, overlay } = load(fuyuki());
    expect(() => f.removeNode('ghost')).toThrow(/unknown node id 'ghost'/);
    expect(f.hasUnsavedChanges()).toBe(false);
    expectStillValid(map, overlay);
  });
});

describe('removeEdge — single-plane, library only (D75)', () => {
  it('removes exactly the named library edge; the chat block dies; user edges are not its business', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 250 }); // we-* edges exist in the overlay
    const userEdgesBefore = overlay.userEdges.length;
    const libCount = map.edges.length;
    const target = 'arc-emiya-residence-fuyuki-bridge'; // FX1 ships a DATA-level block on this edge
    f.setBlocked(target, 'flooded'); // plus a chat-scoped one (D20)
    expect(overlay.blocked[target]).toBeDefined();
    expect(() => f.removeEdge(overlay.userEdges[0].id)).toThrow(/unknown edge id/); // the chat plane owns user edges (D75)
    expect(overlay.userEdges).toHaveLength(userEdgesBefore);
    f.removeEdge(target);
    expect(map.edges).toHaveLength(libCount - 1); // exactly one edge removed
    expect(map.edges.some((e) => e.id === target)).toBe(false);
    expect(overlay.blocked[target]).toBeUndefined(); // the chat block died with the edge (F50)
    expectStillValid(map, overlay);
  });
});

// --- dirty / stale / save semantics (F45, C8, C29, D75) -----------------------------------------

describe('dirty/stale/save semantics (F45, C8, C29, D75)', () => {
  it('editor edits set dirty, never stale; queries serve the SAVED graph until saveMap (F45, C8, D75)', () => {
    const map = fuyuki();
    const overlay = { ...overlayFor(map), currentLocationId: 'outskirts' }; // a valid pin so the snapshot is live
    const f = createFacade();
    f.loadMap(map, overlay);
    f.materialize();
    expect(f.hasUnsavedChanges()).toBe(false);
    expect(facadeStateOf(f).stale).toBe(false);

    f.upsertNode(nodeDraft({ label: 'Unsaved Spot' }));
    const node = lastOf(map.nodes);
    f.upsertEdge(edgeDraft({ target: node.id }));
    expect(f.hasUnsavedChanges()).toBe(true);
    expect(facadeStateOf(f).stale).toBe(false); // editor commands NEVER set stale (D75)

    // Both queries still serve the SAVED graph (F45: nothing went live).
    expect(() => f.findRoute('outskirts', node.id)).toThrow(/unknown node id/);
    expect(JSON.stringify(f.getSnapshot())).not.toContain('Unsaved Spot');

    f.saveMap(); // the explicit save takes the edits live
    expect(f.hasUnsavedChanges()).toBe(false);
    expect(facadeStateOf(f).stale).toBe(true); // C8's *edit save* trigger
    expect(f.findRoute('outskirts', node.id).ok).toBe(true); // the query consumed the flag
    expect(JSON.stringify(f.getSnapshot())).toContain('Unsaved Spot');
  });

  it('loadMap resets dirty (D75)', () => {
    const { f } = load(fuyuki());
    f.upsertNode(nodeDraft());
    expect(f.hasUnsavedChanges()).toBe(true);
    f.loadMap(fuyuki(), overlayFor(fuyuki()));
    expect(f.hasUnsavedChanges()).toBe(false);
  });

  it('a refusing save leaves the map dirty and untouched; after repair it saves (F45, C30, D75)', () => {
    const { f, map } = load(fuyuki());
    f.upsertNode(nodeDraft());
    expect(f.hasUnsavedChanges()).toBe(true);
    map.nodes[0].label = ''; // C24 host-edit simulation: the live map went invalid
    const err = issuesOf(() => f.saveMap());
    expect(err.issues.some((i) => i.path === 'nodes[0].label')).toBe(true);
    expect(f.hasUnsavedChanges()).toBe(true); // dirty stays TRUE (D75)
    expect(map.nodes[0].label).toBe(''); // the map is untouched
    map.nodes[0].label = 'Miyama'; // repaired
    f.saveMap();
    expect(f.hasUnsavedChanges()).toBe(false);
  });

  it('a refused editor command never flips dirty; a successful one does (D75)', () => {
    const { f } = load(fuyuki());
    expect(() => f.upsertNode(nodeDraft({ layer: 'layer-nowhere' }))).toThrow(MapValidationError);
    expect(f.hasUnsavedChanges()).toBe(false);
    f.upsertNode(nodeDraft());
    expect(f.hasUnsavedChanges()).toBe(true);
    expect(() => f.upsertEdge(edgeDraft({ source: 'ghost' }))).toThrow(MapValidationError);
    expect(f.hasUnsavedChanges()).toBe(true); // still dirty from the successful edit
  });
});

// --- lifecycle discipline -------------------------------------------------------------------------

describe('no map loaded ⇒ every editor command throws the standard message (§9 discipline)', () => {
  it('all six refuse before anything else; hasUnsavedChanges degrades to false', () => {
    const f = createFacade();
    expect(() => f.upsertNode(nodeDraft())).toThrow('[TravelMapper] no map loaded');
    expect(() => f.upsertEdge(edgeDraft())).toThrow('[TravelMapper] no map loaded');
    expect(() => f.removeNode('x')).toThrow('[TravelMapper] no map loaded');
    expect(() => f.removeEdge('x')).toThrow('[TravelMapper] no map loaded');
    expect(() => f.calibrateScale('arc-x', 5)).toThrow('[TravelMapper] no map loaded');
    expect(() => f.saveMap()).toThrow('[TravelMapper] no map loaded');
    expect(f.hasUnsavedChanges()).toBe(false);
  });
});

// --- A-014: the saved-plane rule — runtime commands never bind unsaved library state -------------
//
// D75 amendment: while `dirty`, the presence/overlay commands derive their
// library-side universes from the SAVED id-plane (savedNodeIds/savedEdgeIds),
// so no chat state can come to reference data the SAVED map lacks (F50 —
// validateOverlay would refuse the WHOLE overlay at the next load). Removing
// a saved node/edge staying routable until save is NOT a leak — it is F45's
// symmetric 'edits go live at save'.

describe('A-014 saved-plane universes — addUserNodeAt (F45/D75, C7, F50)', () => {
  it('kNN binds a SAVED leaf even when an unsaved editor node is nearer; no we- edge references the unsaved id', () => {
    const map = fuyuki();
    const savedIds = new Set(map.nodes.map((nd) => nd.id));
    const { f, overlay } = load(map);
    // An unsaved editor node — the nearest thing to the placement point by far.
    f.upsertNode(nodeDraft({ label: 'Ghost', position: { x: -2000, y: -2000 } }));
    const unsavedId = lastOf(map.nodes).id;
    f.addUserNodeAt('layer-fuyuki', { x: -2000, y: -2010 }); // 10 units from the Ghost, ~2600 from any FX1 leaf
    const wp = lastOf(overlay.userNodes);
    const wpEdges = overlay.userEdges.filter((e) => e.source === wp.id || e.target === wp.id);
    expect(wpEdges).toHaveLength(WAYPOINT_KNN); // the kNN still works over the saved plane (C7)
    for (const e of wpEdges) {
      const other = e.source === wp.id ? e.target : e.source;
      expect(savedIds.has(other), `endpoint '${other}' must be a SAVED library id (F45/D75)`).toBe(true);
    }
    expect(wpEdges.some((e) => e.source === unsavedId || e.target === unsavedId)).toBe(false);
    // F50: the chat state stays reload-safe against the pristine SAVED map.
    expect(() => validateOverlay(JSON.parse(JSON.stringify(overlay)), fuyuki())).not.toThrow();
    expectStillValid(map, overlay);
  });
});

describe('A-014 saved-plane universes — setBlocked (F45/D75, F50, C30)', () => {
  it('refuses an UNSAVED editor arc, then succeeds after saveMap refreshes the universe', () => {
    const { f, map, overlay } = load(fuyuki());
    f.upsertNode(nodeDraft({ label: 'Riverside' }));
    const node = lastOf(map.nodes);
    f.upsertEdge(edgeDraft({ target: node.id, modes: { walk: { allowed: true, authoredMinutes: 7 } } }));
    const arc = lastOf(map.edges);
    expect(f.hasUnsavedChanges()).toBe(true);
    expect(() => f.setBlocked(arc.id, 'closed')).toThrow(
      `[TravelMapper] setBlocked: unknown edge id '${arc.id}' (unsaved — save the map first)`,
    );
    expect(overlay.blocked[arc.id]).toBeUndefined(); // refused before mutating (C30)
    f.saveMap(); // universe refresh — the arc's id enters the saved edge set
    expect(f.hasUnsavedChanges()).toBe(false);
    f.setBlocked(arc.id, 'closed'); // now bindable
    expect(overlay.blocked[arc.id]).toBe('closed');
    expectStillValid(map, overlay);
  });

  it('lifting on an unknown key is a silent no-op — the lift path never binds (C2/D20, A-014)', () => {
    const { f, overlay } = load(fuyuki());
    f.setBlocked('arc-emiya-residence-fuyuki-station', 'strike');
    expect(() => f.setBlocked('we-404')).not.toThrow(); // unknown key — harmless delete
    expect(() => f.setBlocked('arc-ghost', undefined)).not.toThrow(); // same via the typed optional
    expect(overlay.blocked['arc-emiya-residence-fuyuki-station']).toBe('strike'); // the real block untouched
    expect(Object.keys(overlay.blocked)).toEqual(['arc-emiya-residence-fuyuki-station']); // nothing added
  });
});

describe('A-014 saved-plane universes — setCurrentLocation (F45/D75, C30, D58)', () => {
  it("refuses an unsaved id with the field-precise message; a saved id still pins while dirty; the pin doesn't move on refusal", () => {
    const map = fuyuki();
    const overlay = { ...overlayFor(map), currentLocationId: 'outskirts' };
    const f = createFacade();
    f.loadMap(map, overlay);
    f.materialize();
    f.upsertNode(nodeDraft({ label: 'Unsaved Spot' }));
    const unsavedId = lastOf(map.nodes).id;
    expect(() => f.setCurrentLocation(unsavedId)).toThrow(
      `[TravelMapper] setCurrentLocation: unknown node id '${unsavedId}' (unsaved — save the map first)`,
    );
    expect(overlay.currentLocationId).toBe('outskirts'); // refused before mutating (C30)
    expect(() => f.setCurrentLocation('kotomine-church')).not.toThrow(); // saved ids stay pin-eligible while dirty
    expect(overlay.currentLocationId).toBe('kotomine-church');
  });

  it('pinning an overlay waypoint still works while the map is dirty (overlay ids are in-universe)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.upsertNode(nodeDraft({ label: 'Dirty editor node' })); // the map is now dirty
    expect(f.hasUnsavedChanges()).toBe(true);
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 250 });
    const wp = lastOf(overlay.userNodes).id;
    expect(() => f.setCurrentLocation(wp)).not.toThrow(); // overlay userNodes are in-universe
    expect(overlay.currentLocationId).toBe(wp);
    f.materialize();
    expect(facadeStateOf(f).effective!.pin).toEqual({ id: wp, valid: true }); // D58: waypoints hold the pin
    expectStillValid(map, overlay);
  });
});

describe('A-014 saved-plane universes — lifecycle (F45/D75)', () => {
  it('place → saveMap → loadMap(the same map object, re-validated): the placed ids stay bindable (C30/C24)', () => {
    const map = fuyuki();
    const f = createFacade();
    f.loadMap(map, overlayFor(map));
    f.materialize();
    f.upsertNode(nodeDraft({ label: 'Riverside' }));
    const nodeId = lastOf(map.nodes).id;
    f.saveMap(); // the universes now admit the placed id
    expect(facadeStateOf(f).savedNodeIds.has(nodeId)).toBe(true); // saveMap refreshed the universe
    // The SAME map object re-validated at load (C30) — the universes rebuild from it.
    const overlay2 = overlayFor(map);
    f.loadMap(map, overlay2);
    f.materialize();
    expect(f.hasUnsavedChanges()).toBe(false);
    expect(facadeStateOf(f).savedNodeIds.has(nodeId)).toBe(true); // loadMap repopulated
    expect(() => f.setCurrentLocation(nodeId)).not.toThrow(); // the placed id is bindable after the reload
    expect(() => f.setBlocked('arc-outskirts-einzbern-castle', 'flood')).not.toThrow(); // saved arcs still bind
    expect(overlay2.blocked['arc-outskirts-einzbern-castle']).toBe('flood');
    expectStillValid(map, overlay2);
  });

  it('promotion is the third universe refresh: pin, block and kNN admit the promoted ids immediately (C26, D75, F50)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 250 }); // wp-1 → emiya, matou, shopping (C7 over FX1)
    const wp = overlay.userNodes[0].id;
    const graduated = overlay.userEdges.find(
      (e) => (e.source === wp && e.target === 'emiya-residence') || (e.target === wp && e.source === 'emiya-residence'),
    )!;
    f.promoteUserNode(wp, 'Promoted Gate'); // C26: node + library-bound edges move to the library plane (D61)
    expect(map.nodes.some((nd) => nd.id === wp)).toBe(true);
    expect(map.edges.some((e) => e.id === graduated.id)).toBe(true); // it graduated — no longer an overlay edge

    // D75 promotion clause: the promoted ids are library truth NOW, not at the
    // next save — without the refresh all three commands below would refuse.
    f.setCurrentLocation(wp); // the pin gate admits the promoted id
    expect(overlay.currentLocationId).toBe(wp);
    f.setBlocked(graduated.id, 'landslide'); // the graduated edge is blockable (F50: a map.edges key)
    expect(overlay.blocked[graduated.id]).toBe('landslide');

    // kNN: a NEW waypoint placed beside the promoted node binds it as a
    // candidate (savedNodeIds ∪ overlay userNodes — C7 over the saved plane).
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 252 });
    const wp2 = lastOf(overlay.userNodes).id;
    expect(wp2).not.toBe(wp);
    expect(
      overlay.userEdges.some((e) => (e.source === wp2 && e.target === wp) || (e.target === wp2 && e.source === wp)),
    ).toBe(true);
    expectStillValid(map, overlay); // F50: both planes still validate with the new block
  });
});

// --- A-015: calibrateScale — "measure this arc" (C13/D44/D45/D75) ---------------------------------
//
// C13: unitPerPx = authored distance ÷ the arc's pixel length (the endpoints'
// model-space euclid — canvas coordinates ARE the model). D44/D45: a present
// unit seeds the label and the kind (C11's two kinds); an absent unit
// re-measures in the established unit. D75: the edit lands on the LIVE scale
// object (the editor draft the UI displays, C24) and marks dirty — the
// pricing seams serve the SAVED scale snapshot until saveMap (F45: an unsaved
// calibration changes no cost).

describe('calibrateScale — the C13 formula on an FX1 arc (C13, D44, D75)', () => {
  it("unitPerPx = authored ÷ px length; the arc's authored values are NEVER touched; dirty, never stale", () => {
    const { f, map, overlay } = load(fuyuki());
    // emiya-residence (100,250) ↔ matou-residence (60,210): px = hypot(40,40) = 40√2 (C12)
    f.calibrateScale('arc-emiya-residence-matou-residence', 40);
    expect(map.scale.unitPerPx).toBeCloseTo(40 / (40 * Math.SQRT2), 12); // C13 verbatim ⇒ 1/√2
    expect(map.scale.unitLabel).toBe('min'); // D44: no unit ⇒ the established label stands
    expect(map.scale.unitKind).toBe('time');
    expect(f.hasUnsavedChanges()).toBe(true); // D75
    expect(facadeStateOf(f).stale).toBe(false); // editor commands never set stale (D75)
    // Calibration writes ONLY scale — the arc's authored values are a separate
    // upsertEdge concern the UX issues as its own command.
    const arc = map.edges.find((e) => e.id === 'arc-emiya-residence-matou-residence')!;
    expect(arc.modes.walk?.authoredMinutes).toBe(22); // FX1's authored value, byte-identical
    expectStillValid(map, overlay);
  });

  it('unit seeding: a present unit sets label AND kind — the distance kind, then the time kind (C11/D44/D45)', () => {
    const { f, map, overlay } = load(fuyuki());
    const px = 40 * Math.SQRT2; // emiya ↔ matou
    f.calibrateScale('arc-emiya-residence-matou-residence', 3, { label: 'km', kind: 'distance' });
    expect(map.scale.unitLabel).toBe('km');
    expect(map.scale.unitKind).toBe('distance'); // C11: the canonical unit may be either kind (D45)
    expect(map.scale.unitPerPx).toBeCloseTo(3 / px, 12);
    f.calibrateScale('arc-emiya-residence-matou-residence', 6, { label: 'min', kind: 'time' });
    expect(map.scale.unitLabel).toBe('min');
    expect(map.scale.unitKind).toBe('time');
    expect(map.scale.unitPerPx).toBeCloseTo(6 / px, 12);
    expectStillValid(map, overlay);
  });

  it('a label-absent call updates only unitPerPx — re-measurement in the established unit (D44)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.calibrateScale('arc-emiya-residence-matou-residence', 3, { label: 'km', kind: 'distance' });
    f.calibrateScale('arc-emiya-residence-matou-residence', 60); // no unit
    expect(map.scale.unitPerPx).toBeCloseTo(60 / (40 * Math.SQRT2), 12);
    expect(map.scale.unitLabel).toBe('km'); // stands
    expect(map.scale.unitKind).toBe('distance'); // stands
    expectStillValid(map, overlay);
  });

  it('an overlay we- arc measures like a library one — merged-set lookup (D44, C24)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 260 }); // 10 px south of emiya (C7 kNN: emiya, matou, shopping)
    const wp = overlay.userNodes[0];
    const we = overlay.userEdges.find(
      (e) => (e.source === wp.id && e.target === 'emiya-residence') || (e.target === wp.id && e.source === 'emiya-residence'),
    )!;
    expect(we.id).toMatch(/^we-/);
    expect(map.edges.some((e) => e.id === we.id)).toBe(false); // NOT a library edge — the merged set found it
    f.calibrateScale(we.id, 5); // wp(100,260) ↔ emiya(100,250): 10 px ⇒ 0.5
    expect(map.scale.unitPerPx).toBeCloseTo(0.5, 12);
    expect(f.hasUnsavedChanges()).toBe(true);
    expectStillValid(map, overlay);
  });
});

describe('calibrateScale — refusals leave state untouched (C30, D75)', () => {
  it("unknown arc id — field-precise, nothing moved, dirty untouched", () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    expect(() => f.calibrateScale('arc-ghost', 5)).toThrow(
      "[TravelMapper] calibrateScale: unknown arc id 'arc-ghost'",
    );
    expect(JSON.stringify([map, overlay])).toBe(before); // C30
    expect(f.hasUnsavedChanges()).toBe(false); // a refusal never flips dirty (D75)
  });

  it('a positionless endpoint cannot be measured — valid data (a PUT that clears position), field-precise refusal', () => {
    const { f, map, overlay } = load(fuyuki());
    f.upsertNode({
      id: 'einzbern-castle', label: 'Einzbern Castle', kind: 'location', layer: 'layer-fuyuki',
      position: undefined, parent: undefined, aliases: undefined, transit: undefined, description: undefined, origin: 'authored',
    }); // D75 PUT: position cleared — still valid data
    expect(map.nodes.find((nd) => nd.id === 'einzbern-castle')!.position).toBeUndefined();
    const before = JSON.stringify([map, overlay]);
    expect(() => f.calibrateScale('arc-outskirts-einzbern-castle', 5)).toThrow(
      /endpoint 'einzbern-castle' of arc 'arc-outskirts-einzbern-castle' has no position/,
    );
    expect(JSON.stringify([map, overlay])).toBe(before); // C30 — the refusal adds nothing beyond the upsert
  });

  it('zero pixel length — coincident endpoints cannot set a scale (§6.2)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.upsertNode(nodeDraft({ label: 'Coincident Spot', position: { x: 30, y: 360 } })); // exactly outskirts' position
    const twin = lastOf(map.nodes);
    f.upsertEdge(edgeDraft({ source: 'outskirts', target: twin.id }));
    const arc = lastOf(map.edges);
    const before = JSON.stringify([map, overlay]);
    expect(() => f.calibrateScale(arc.id, 5)).toThrow(/zero pixel length/);
    expect(JSON.stringify([map, overlay])).toBe(before); // C30
    expect(map.scale.unitPerPx).toBe(0.2); // FX1's scale untouched
  });

  it('non-positive and non-finite authoredDistance — field-precise, state untouched', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    for (const bad of [0, -5, NaN, Infinity]) {
      expect(() => f.calibrateScale('arc-emiya-residence-matou-residence', bad)).toThrow(
        /authoredDistance must be a finite number > 0/,
      );
    }
    expect(JSON.stringify([map, overlay])).toBe(before); // C30
    expect(f.hasUnsavedChanges()).toBe(false);
  });

  it('an empty (or whitespace-only) unit label — field-precise, state untouched (C30)', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    expect(() => f.calibrateScale('arc-emiya-residence-matou-residence', 5, { label: '', kind: 'distance' })).toThrow(
      /unit\.label must be a non-empty string/,
    );
    expect(() => f.calibrateScale('arc-emiya-residence-matou-residence', 5, { label: '   ', kind: 'time' })).toThrow(
      /unit\.label must be a non-empty string/,
    );
    expect(JSON.stringify([map, overlay])).toBe(before); // C30
    expect(map.scale.unitLabel).toBe('min'); // FX1's label stands
  });

  it('C30 clone gate: an overflowing unitPerPx (∞) is refused field-precisely, nothing applied', () => {
    const { f, map, overlay } = load(fuyuki());
    f.upsertNode(nodeDraft({ label: 'Micro A', position: { x: 0, y: 0 } }));
    const a = lastOf(map.nodes);
    f.upsertNode(nodeDraft({ label: 'Micro B', position: { x: 5e-301, y: 0 } }));
    const b = lastOf(map.nodes);
    f.upsertEdge(edgeDraft({ source: a.id, target: b.id }));
    const arc = lastOf(map.edges);
    const before = JSON.stringify([map, overlay]);
    const err = issuesOf(() => f.calibrateScale(arc.id, 1e308)); // 1e308 ÷ 5e-301 overflows to ∞
    expect(err.issues.some((i) => i.path === 'scale.unitPerPx')).toBe(true);
    expect(JSON.stringify([map, overlay])).toBe(before); // C30 — the gate refused before any apply
  });
});

describe('calibrateScale — D75 saved-scale pricing (F45, C8, D75)', () => {
  it('unsaved calibration changes no cost; saveMap re-prices and re-optimizes the same query', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 260 }); // wp 10 px south of emiya; kNN: emiya, matou, shopping (C7)
    const wp = overlay.userNodes[0].id;
    const t0 = f.findRoute(wp, 'matou-residence');
    expect(t0.total).toBeCloseTo(Math.hypot(100 - 60, 260 - 210) * 0.2, 9); // the direct we- leg: geometry × FX1's scale (C14 row 5)
    expect(t0.legs).toHaveLength(1);
    expect(t0.legs[0].arcId).toMatch(/^we-/);
    f.calibrateScale('arc-emiya-residence-matou-residence', 40); // unitPerPx: 0.2 → 1/√2 ≈ 0.7071
    expect(f.hasUnsavedChanges()).toBe(true);
    expect(facadeStateOf(f).stale).toBe(false); // dirty, never stale (D75)
    const t1 = f.findRoute(wp, 'matou-residence');
    expect(t1.total).toBe(t0.total); // byte-identical — the SAVED scale still prices (F45/D75)
    f.saveMap(); // the explicit save takes the calibration live (C8 edit save)
    expect(f.hasUnsavedChanges()).toBe(false);
    const t2 = f.findRoute(wp, 'matou-residence');
    // Re-priced AND re-optimized under the new scale: the direct we- leg (≈45.28)
    // now loses to wp→emiya (10 px × 1/√2 ≈ 7.07) + the authored 22 (C14 row 3).
    expect(t2.total).toBeCloseTo(10 * Math.SQRT1_2 + 22, 9);
    const weToEmiya = overlay.userEdges.find(
      (e) => (e.source === wp && e.target === 'emiya-residence') || (e.target === wp && e.source === 'emiya-residence'),
    )!;
    expect(t2.legs.map((l) => l.arcId)).toEqual([weToEmiya.id, 'arc-emiya-residence-matou-residence']);
    expectStillValid(map, overlay);
  });
});
