// tests/verify/p3m3-layers-adversarial.spec.ts — M3 PHASE-GATE adversarial
// suite (Agent D). Expectations derived ONLY from the spec: CORE.md §9 (the
// Layer-command line), C3/C5/C8/C24/C27/C30/C32, D69/D75/D82/D83/D84/D85,
// F42/F43/F48/F50/F54; fixtures re-derived by hand from
// data/worlds/fuyuki.ts (FX1: 15 fuyuki nodes + misaki-town, 29 same-layer
// arcs + the one cross-layer train arc 'arc-fuyuki-station-misaki-town' at
// 300 authored minutes; FX2 Emiya→Misaki = walk 50 + train 300 = 350 min).
// Every cell names the decision it attacks; three cells are FINDING PROBES
// that are RED against the current tree by design (each documented inline).
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf, type MapFacade } from '../../src/core/facade';
import { MapValidationError, validateOverlay, validateWorldMap } from '../../src/core/model/validate';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import { breadcrumbChain, buildLayerElements, crossLayerAnchors } from '../../src/app/graph/layer-elements';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

// C24: the fixture is deep-frozen — every suite runs on a fresh mutable clone.
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

const stillValid = (map: WorldMapData, overlay: ChatMapOverlay): void => {
  expect(() => validateWorldMap(map)).not.toThrow();
  expect(() => validateOverlay(overlay, map)).not.toThrow();
};

// ---------------------------------------------------------------------------
// FINDING PROBE 1 (D75 outcome clause + F50 + D82's both-planes cascade).
// The A-017 saved-layer gate (facade.ts addUserNodeAt) admits a waypoint onto
// a layer that removeLayer just deleted, because savedLayerIds only moves at
// loadMap/saveMap. removeLayer is not undoable (F46) and saveMap will persist
// the smaller layer set, so the bind is guaranteed-dangling: after saveMap the
// overlay names a layer the saved map lacks, and the NEXT loadMap refuses the
// WHOLE overlay (validateOverlay: userNodes' layer must exist) — the chat's
// map load bricks. D75's outcome clause: "validateOverlay must never find a
// chat key that references data the SAVED map lacks". The correct behavior:
// addUserNodeAt refuses a layer the live map no longer has.
// ---------------------------------------------------------------------------
describe('FINDING PROBE — removeLayer (dirty) vs the saved-layer gate (F50/D75 outcome clause)', () => {
  it('a waypoint cannot bind a layer removeLayer deleted (guaranteed-dangling; F50)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.removeLayer('layer-misaki'); // dirty; savedLayerIds still carries the id
    expect(() => f.addUserNodeAt('layer-misaki', { x: 220, y: 220 })).toThrow(
      /is not a saved layer id|no longer part of the map/,
    );
    expect(overlay.userNodes).toEqual([]); // nothing persisted either way
    expect(() => f.saveMap()).not.toThrow();
    // and the poison state can never exist: a fresh load of the saved pair is accepted
    expect(() => validateOverlay(overlay, map)).not.toThrow();
  });

  it('a chat block cannot bind an arc removeLayer deleted (same F50 mirror)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.removeLayer('layer-misaki'); // the station arc died with misaki-town
    expect(() => f.setBlocked('arc-fuyuki-station-misaki-town', 'strike')).toThrow(
      /unknown edge id|no longer part of the map/,
    );
    expect(overlay.blocked).toEqual({});
    f.saveMap();
    expect(() => validateOverlay(overlay, map)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FINDING PROBE 2 (D84/F42/D82 — the manager sheet's rename loses the
// background). The sheet's commitRename calls upsertLayer({ id, name }) —
// no background field — and the facade's PUT semantics replace the layer
// object wholesale, dropping the stored background reference. Renaming a
// layer silently deletes its uploaded image / URL: F42's rename must not be
// a remove affordance (D84: replace/remove are EXPLICIT manager-sheet
// actions). The required end state (whichever side carries the fix): a
// rename through the sheet's exact call shape preserves the background.
// ---------------------------------------------------------------------------
describe('FINDING PROBE — rename preserves the layer background (D84/F42)', () => {
  it("upsertLayer({ id, name }) — the sheet's rename call — must keep an existing background", () => {
    const { f, map, overlay } = load(fuyuki());
    f.setLayerBackground('layer-misaki', { url: 'https://example.com/misaki.png' });
    expect(map.layers[1].background).toEqual({ url: 'https://example.com/misaki.png' });
    // the EXACT call layer-manager.component.ts commitRename() makes:
    f.upsertLayer({ id: 'layer-misaki', name: 'Misaki (renamed)' });
    expect(map.layers[1].background).toEqual({ url: 'https://example.com/misaki.png' });
    expect(map.layers[1].name).toBe('Misaki (renamed)');
    stillValid(map, overlay);
  });
});

// ---------------------------------------------------------------------------
// D82/R1: the R1 dialog contract — layerRemovalImpact's three numbers must
// equal EXACTLY what removeLayer deletes, recounted independently here from
// the pre-state (never via the query itself).
// ---------------------------------------------------------------------------
describe('layerRemovalImpact ≡ removeLayer — the dialog counts can never lie (D82/R1)', () => {
  it('every bucket matches an independent recount; nothing else moves', () => {
    const { f, map, overlay } = load(fuyuki());
    f.addUserNodeAt('layer-misaki', { x: 220, y: 220 }); // kNN ⇒ misaki-town (its only leaf) + 1 we- arc
    const wpId = overlay.userNodes[0].id;
    const weId = overlay.userEdges[0].id;
    f.setBlocked(weId, 'flood');
    f.setBlocked('arc-fuyuki-station-misaki-town', 'strike');
    f.setPortal('ghost-house', 'layer-misaki');

    // independent pre-state recount (my own derivation, not the engine's):
    const dyingNodes = new Set([
      ...map.nodes.filter((n) => n.layer === 'layer-misaki').map((n) => n.id),
      ...overlay.userNodes.filter((n) => n.layer === 'layer-misaki').map((n) => n.id),
    ]);
    expect([...dyingNodes].sort()).toEqual(['misaki-town', wpId]); // N = 2, hand-derived
    const sameLayer: string[] = [];
    const crossLayer: string[] = [];
    for (const e of [...map.edges, ...overlay.userEdges]) {
      const hits = (dyingNodes.has(e.source) ? 1 : 0) + (dyingNodes.has(e.target) ? 1 : 0);
      if (hits === 2) sameLayer.push(e.id);
      else if (hits === 1) crossLayer.push(e.id);
    }
    expect(sameLayer).toEqual([weId]); // M = 1
    expect(crossLayer).toEqual(['arc-fuyuki-station-misaki-town']); // K = 1

    const impact = f.layerRemovalImpact('layer-misaki');
    expect(impact).toEqual({ nodes: 2, sameLayerArcs: 1, crossLayerArcs: 1 });

    f.removeLayer('layer-misaki');
    // the deletion is EXACTLY the counted set — no more, no less:
    const mapNodeIds = new Set(map.nodes.map((n) => n.id));
    const preMapNodeIds = new Set(fuyuki().nodes.map((n) => n.id));
    expect(mapNodeIds).toEqual(new Set([...preMapNodeIds].filter((id) => id !== 'misaki-town')));
    expect(map.edges.map((e) => e.id)).not.toContain('arc-fuyuki-station-misaki-town');
    expect(map.edges).toHaveLength(29); // FX1: 30 edges − the dead cross-layer arc; all 29 same-layer arcs survive
    expect(overlay.userNodes.map((n) => n.id)).not.toContain(wpId);
    expect(overlay.userEdges.map((e) => e.id)).not.toContain(weId);
    expect(overlay.blocked[weId]).toBeUndefined();
    expect(overlay.blocked['arc-fuyuki-station-misaki-town']).toBeUndefined();
    expect(map.nodes.find((n) => n.id === 'ghost-house')?.portal).toBeUndefined();
    stillValid(map, overlay);
  });
});

// ---------------------------------------------------------------------------
// D75/F45/C8/D16: layer commands mark dirty, NEVER stale — no layer command
// rebuilds the effective graph; queries keep serving the SAVED graph until
// saveMap. And saveMap's rebuild really takes the removal live (C17 shape).
// ---------------------------------------------------------------------------
describe('dirty-never-stale at the layer seam (D75/F45/C8/D16, C17)', () => {
  it('layer commands flip dirty but never stale; the saved graph serves; saveMap takes the removal live', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setCurrentLocation('emiya-residence'); // the pin — the stale rebuild serves it below
    f.getSnapshot(); // settle the pin's C8 stale flag (the layer commands must not move it)

    f.upsertLayer({ id: '', name: 'Draft Layer' });
    const draftLayerId = map.layers[map.layers.length - 1].id;
    f.reorderLayers(['layer-misaki', 'layer-fuyuki', draftLayerId]);
    f.setLayerBackground('layer-fuyuki', { url: 'https://example.com/f.png' });
    f.setPortal('ghost-house', 'layer-misaki');
    expect(facadeStateOf(f).dirty).toBe(true);
    expect(facadeStateOf(f).stale).toBe(false); // D75: dirty, never stale

    f.removeLayer('layer-misaki');
    expect(facadeStateOf(f).stale).toBe(false); // the removal is NOT live yet

    // FX2 still routes over the SAVED graph while dirty (walk 50 + train 300):
    const route = f.findRoute('emiya-residence', 'misaki-town');
    expect(route.ok).toBe(true);
    expect(route.total).toBe(350); // 50 + 300 — hand-derived from FX1
    expect(route.unit).toBe('min');
    const snap = f.getSnapshot();
    expect(snap.location).toBe('Emiya Residence'); // the saved graph serves

    f.saveMap(); // C8's edit-save trigger
    expect(facadeStateOf(f).stale).toBe(true);
    // the removal is LIVE: the rebuilt saved graph no longer knows misaki-town,
    // so findRoute refuses the endpoint field-precisely (C30 — the node does
    // not exist; C17's ok:false shape belongs to existing-but-unreachable
    // nodes, pinned by the core suites).
    expect(() => f.findRoute('emiya-residence', 'misaki-town')).toThrow(
      "[TravelMapper] findRoute: unknown node id 'misaki-town'",
    );
    const snapAfter = f.getSnapshot();
    expect(snapAfter.location).toBe('Emiya Residence'); // the pin's node survives (it was never on the dead layer)
    stillValid(map, overlay);
  });
});

// ---------------------------------------------------------------------------
// C27/F48: removing the PIN's node via removeLayer + saveMap — the pin is
// kept but invalid, the snapshot degrades (never snaps to a neighbor), and
// the overlay still names the dead node (C27: re-pinnable when it returns).
// ---------------------------------------------------------------------------
describe('C27 at the layer seam — removeLayer deletes the pinned node (C27/F48)', () => {
  it('pin on misaki-town: kept-but-invalid after the save; snapshot degrades; no snap', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setCurrentLocation('misaki-town');
    expect(f.getSnapshot().location).toBe('Misaki Town');
    f.removeLayer('layer-misaki');
    f.saveMap();
    const snap = f.getSnapshot(); // ensureFresh rebuilt; the pin's node is gone
    expect(snap.location).toBeNull(); // degraded, never snapped to a neighbor
    expect(snap.routes).toEqual([]);
    expect(snap.destinations).toEqual([]);
    expect(overlay.currentLocationId).toBe('misaki-town'); // the pin survives (C27)
    stillValid(map, overlay);
  });
});

// ---------------------------------------------------------------------------
// C27 contrast: detachNode removes the arcs but keeps the node — the pin
// stays valid and its C19 neighborhood empties (F54/D82).
// ---------------------------------------------------------------------------
describe('F54 detach vs the pin — the node survives, the neighborhood empties', () => {
  it('pin on emiya-residence survives detach; snapshot location intact; routes gone', () => {
    const { f, overlay } = load(fuyuki());
    f.setCurrentLocation('emiya-residence');
    expect(f.getSnapshot().routes.length).toBeGreaterThan(0);
    f.detachNode('emiya-residence');
    f.saveMap();
    const snap = f.getSnapshot();
    expect(snap.location).toBe('Emiya Residence'); // the node survived (C27 not triggered)
    expect(snap.routes).toEqual([]); // C19: zero incident arcs
    expect(overlay.currentLocationId).toBe('emiya-residence');
  });
});

// ---------------------------------------------------------------------------
// C3/D83: a node-to-layer move re-badges by DERIVATION — the pure projection
// seams flip without any edge mutation (the edge object keeps its identity),
// in both directions.
// ---------------------------------------------------------------------------
describe('C3 rides setNodeLayer — re-badge by derivation, no edge mutation (C3/D83)', () => {
  it('misaki-town → layer-fuyuki: the cross-layer anchor dissolves, the arc projects as a same-layer edge, and back', () => {
    const { f, map } = load(fuyuki());
    const arc = map.edges.find((e) => e.id === 'arc-fuyuki-station-misaki-town')!;

    expect(crossLayerAnchors(map, null, 'layer-fuyuki')).toEqual([
      { arcId: 'arc-fuyuki-station-misaki-town', onLayer: 'fuyuki-station', other: 'misaki-town' },
    ]);
    const beforeEdges = buildLayerElements(map, null, 'layer-fuyuki').filter((el) => el.group === 'edges');
    expect(beforeEdges.map((e) => e.data!.id)).not.toContain(arc.id); // cross-layer: not drawn (C3)

    f.setNodeLayer('misaki-town', 'layer-fuyuki');
    expect(crossLayerAnchors(map, null, 'layer-fuyuki')).toEqual([]); // derived — no badge anymore
    const afterEdges = buildLayerElements(map, null, 'layer-fuyuki').filter((el) => el.group === 'edges');
    expect(afterEdges.map((e) => e.data!.id)).toContain(arc.id); // now an ordinary same-layer arc
    expect(map.edges.find((e) => e.id === arc.id)).toBe(arc); // SAME object — nothing was edited (C3)

    f.setNodeLayer('misaki-town', 'layer-misaki');
    expect(crossLayerAnchors(map, null, 'layer-fuyuki')).toEqual([
      { arcId: 'arc-fuyuki-station-misaki-town', onLayer: 'fuyuki-station', other: 'misaki-town' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// D85/D82: the breadcrumb hierarchy derives from portal WIRING, not array
// order — reorderLayers must not move it; removeLayer of the parent layer
// degrades the chain and unwires nothing that survives.
// ---------------------------------------------------------------------------
describe('hierarchy from wiring, not array order (D85/D82/R4 spirit)', () => {
  it('reorder leaves the chain byte-identical; deleting the parent layer degrades the chain', () => {
    const { f, map } = load(fuyuki());
    f.setPortal('ghost-house', 'layer-misaki'); // layer-misaki's parent is layer-fuyuki
    expect(breadcrumbChain(map, 'layer-misaki')).toEqual(['layer-fuyuki', 'layer-misaki']);

    f.reorderLayers(['layer-misaki', 'layer-fuyuki']); // nav order is NOT the hierarchy
    expect(breadcrumbChain(map, 'layer-misaki')).toEqual(['layer-fuyuki', 'layer-misaki']);

    f.removeLayer('layer-fuyuki'); // the parent layer dies — its wiring with it
    expect(breadcrumbChain(map, 'layer-misaki')).toEqual(['layer-misaki']);
  });
});

// ---------------------------------------------------------------------------
// C24/D75: the splice seam under removeLayer — the unwired survivor is a
// FRESH object, every other surviving node and edge keeps object identity
// (only the arrays are fresh). The stale effective graph keeps serving the
// saved values until saveMap.
// ---------------------------------------------------------------------------
describe('splice-seam identity under removeLayer (C24/D75)', () => {
  it('the portal-unwired survivor is swapped fresh; all other survivors keep identity', () => {
    const { f, map, overlay } = load(fuyuki());
    f.setPortal('ghost-house', 'layer-misaki');
    const ghostBefore = map.nodes.find((n) => n.id === 'ghost-house')!;
    const emiyaBefore = map.nodes.find((n) => n.id === 'emiya-residence')!;
    const bridgeEdgeBefore = map.edges.find((e) => e.id === 'arc-outskirts-fuyuki-bridge')!;
    const bridgeJson = JSON.stringify(bridgeEdgeBefore);

    f.removeLayer('layer-misaki');

    const ghostAfter = map.nodes.find((n) => n.id === 'ghost-house')!;
    expect(ghostAfter).not.toBe(ghostBefore); // fresh object — it changed (unwired)
    expect(ghostAfter.portal).toBeUndefined();
    expect(map.nodes.find((n) => n.id === 'emiya-residence')).toBe(emiyaBefore); // SAME reference
    expect(map.edges.find((e) => e.id === 'arc-outskirts-fuyuki-bridge')).toBe(bridgeEdgeBefore);
    expect(JSON.stringify(bridgeEdgeBefore)).toBe(bridgeJson); // byte-identical
    expect(overlay.userNodes).toEqual([]); // no overlay casualties when the overlay is empty
  });
});

// ---------------------------------------------------------------------------
// D84/C5/C30: create-with-background and the empty-URL arm.
// ---------------------------------------------------------------------------
describe('background reference edges (D84/C5/C30)', () => {
  it('create carries a background arm; the created layer validates (C5/D84)', () => {
    const { f, map, overlay } = load(fuyuki());
    f.upsertLayer({ id: '', name: 'Ryūdōji Hill', background: { url: 'https://example.com/hill.png' } });
    const created = map.layers[map.layers.length - 1];
    expect(created.id).toMatch(/^layer-\d+$/);
    expect(created.background).toEqual({ url: 'https://example.com/hill.png' });
    stillValid(map, overlay);
  });

  it('an empty-URL arm is refused field-precisely at layers[i].background.url (C30)', () => {
    const map = fuyuki();
    map.layers[0] = { ...map.layers[0], background: { url: '' } };
    try {
      validateWorldMap(map);
      throw new Error('expected MapValidationError');
    } catch (e) {
      expect(e).toBeInstanceOf(MapValidationError);
      const issues = (e as MapValidationError).issues;
      expect(issues.some((i) => i.path === 'layers[0].background.url')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// D69: deleting the ACTIVE layer resets the facade's viewer state to the
// survivors' first layer; the removed id stops validating immediately.
// ---------------------------------------------------------------------------
describe('D69 reset at the facade — the removed id never validates again', () => {
  it('active reset to survivors[0]; setActiveLayer(removed) throws', () => {
    const { f } = load(fuyuki());
    f.setActiveLayer('layer-misaki');
    f.removeLayer('layer-misaki');
    expect(facadeStateOf(f).activeLayer).toBe('layer-fuyuki'); // survivors[0] (D69)
    expect(() => f.setActiveLayer('layer-misaki')).toThrow(/unknown layer id/);
    expect(facadeStateOf(f).activeLayer).toBe('layer-fuyuki'); // refused before mutating
  });
});

// NOTE on the harness BackgroundStore (src/app/graph/background-store.ts): its
// class is deliberately module-private — the public surface is the
// root-provided BACKGROUND_STORE token, which bare-Node vitest cannot resolve
// without a bootstrapped Angular platform (NG0201 — verified live). The
// harness store's behavior (upload → render → remove) is pinned by
// tests/e2e/backgrounds.e2e-spec.ts at both viewports; the HOST store's
// persistence bridge, failure injection and revocation are pinned by
// tests/unit/st-background-assets.spec.ts. No unit cell is duplicated here.
