// Facade fork commands (PKG A-022, Phase 3 M4): forkMap / saveForkToLibrary
// over FX1. C25 the fork switch + never-re-sync · C24 the detach IS the deep
// copy and the caller's overlay is re-pointed in place · C5 engine-assigned
// map ids (fork-of-fork never re-uses the chain) · D41 forkedFrom provenance +
// the explicit save-back · D56/D97 the WorldMapData return, detached, no
// facade state moves · D75 a fork starts clean (the copy IS the saved plane) ·
// A-014 saved-plane universes rebuilt from the fork (F50 gate family).
// FX1 is thawed per C24 — every suite loads a fresh JSON clone so tests never
// interact.
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../../src/core/facade';
import { validateOverlay } from '../../../src/core/model/validate';
import { fuyukiMap } from '../../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../../src/core/api';

const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const fuyukiOverlay = (map: WorldMapData, pin = 'emiya-residence'): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: pin,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {},
  nodeBlocked: {},
});

const loadFuyuki = (pin = 'emiya-residence') => {
  const map = fuyuki();
  const overlay = fuyukiOverlay(map, pin);
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

// --- forkMap — the C25 switch -------------------------------------------------

describe('forkMap — the C25 switch', () => {
  it('the facade serves the fork; the caller\'s overlay is re-pointed IN PLACE (C25, C24, C5, D41)', () => {
    const { f, map, overlay } = loadFuyuki();
    const before = f.getSnapshot();

    f.forkMap();

    const fork = facadeStateOf(f).map!;
    expect(fork).not.toBe(map);               // the reference swapped — the library original is no longer held (C25/C24)
    expect(fork.id).not.toBe(map.id);          // a NEW engine-assigned map id (C5)
    expect(fork.forkedFrom).toBe(map.id);      // D41/C25 provenance — the immediate parent
    expect(facadeStateOf(f).overlay).toBe(overlay); // the CALLER'S overlay object — never a copy (C24)
    expect(overlay.mapId).toBe(fork.id);       // read on the caller's object: the chat now references the fork
    expect(f.getSnapshot()).toEqual(before);   // the byte-copy serves identical projections
  });

  it('forks never re-sync: the original drifts, the fork\'s projections stand still (C25, C24)', () => {
    const { f, map } = loadFuyuki();
    f.forkMap();
    const fork = facadeStateOf(f).map!;
    const forkNodeCount = fork.nodes.length;

    // the host mutates the ORIGINAL library object in place (the C24 live-edit
    // channel the fork deliberately stopped listening to)
    map.nodes.push({ id: 'n-late', label: 'Late Addition', kind: 'location', layer: 'layer-fuyuki', position: { x: 0, y: 0 } });
    const emiya = map.nodes.find((n) => n.id === 'emiya-residence')!;
    emiya.label = 'Renamed Away';
    f.materialize(); // the C24 hook — rebuilds from the FORK, not the original

    const eff = facadeStateOf(f).effective!;
    expect(eff.nodes.some((n) => n.id === 'n-late')).toBe(false);  // the detach proof
    expect(fork.nodes).toHaveLength(forkNodeCount);                // the fork never received the edit
    expect(f.getSnapshot().location).toBe('Emiya Residence');      // the fork's label stands
  });

  it('a fork starts clean and dirties like any map (D75, F45)', () => {
    const { f } = loadFuyuki();
    f.forkMap();
    expect(f.hasUnsavedChanges()).toBe(false); // the copy IS the saved plane

    f.upsertNode({ id: '', label: 'Fork Child', kind: 'location', layer: 'layer-fuyuki', position: { x: 1, y: 1 } });
    expect(f.hasUnsavedChanges()).toBe(true);
  });

  it('the saved universes are rebuilt FROM THE FORK — a pre-fork drift (unsaved at loadMap) is fork-carried (A-014, F50 gate family)', () => {
    const { f, map } = loadFuyuki();
    // the host drifts the original BEFORE the fork — an id loadMap's saved
    // universe never admitted
    map.nodes.push({ id: 'n-early', label: 'Early Drift', kind: 'location', layer: 'layer-fuyuki', position: { x: 2, y: 2 } });
    f.forkMap(); // the fork copies the loaded map as it stands; the universes rebuild from the fork

    expect(f.hasUnsavedChanges()).toBe(false); // the drifted copy IS the fork's saved plane (D75)
    // the A-014 add-path gate ADMITS the id — provable only if the universes
    // were rebuilt from the fork's arrays, not inherited from loadMap (F50 family)
    expect(() => f.setNodeBlocked('n-early', 'testing')).not.toThrow();

    // the fork's own post-fork edits stay OUT of the saved plane until saveMap (D75)
    f.upsertNode({ id: '', label: 'Fork Draft', kind: 'location', layer: 'layer-fuyuki', position: { x: 3, y: 3 } });
    const draftId = facadeStateOf(f).map!.nodes.find((n) => n.label === 'Fork Draft')!.id;
    expect(() => f.setNodeBlocked(draftId, 'testing')).toThrow(/unsaved/);
    // a fork-carried id binds throughout (the chat's pins survive)
    expect(() => f.setCurrentLocation('fuyuki-station')).not.toThrow();

    f.saveMap(); // the saved plane moves — the draft becomes saved truth
    expect(f.hasUnsavedChanges()).toBe(false);
    expect(() => f.setNodeBlocked(draftId, 'testing')).not.toThrow();
  });

  it('the original\'s post-fork drift never enters the fork\'s saved plane (C25, A-014)', () => {
    const { f, map } = loadFuyuki();
    f.forkMap();
    map.nodes.push({ id: 'n-late', label: 'Late Addition', kind: 'location', layer: 'layer-fuyuki', position: { x: 0, y: 0 } });
    f.materialize(); // rebuilds from the fork — the drift enters nothing

    expect(() => f.setCurrentLocation('n-late')).toThrow(/n-late/); // the gate reads the FORK's saved universe
  });
});

// --- forkMap — field-precise refusals -------------------------------------------

describe('forkMap / saveForkToLibrary — refusals', () => {
  it('both commands refuse with nothing loaded, field-precise (C30 house style)', () => {
    const f = createFacade();
    expect(() => f.forkMap()).toThrow('[TravelMapper] no map loaded');
    expect(() => f.saveForkToLibrary()).toThrow('[TravelMapper] no map loaded');
  });

  it('saveForkToLibrary refuses a loaded library map — the save-back needs a fork (C25/D41)', () => {
    const { f } = loadFuyuki();
    expect(() => f.saveForkToLibrary()).toThrow(/not a fork/);
    expect(facadeStateOf(f).map).not.toBeNull(); // nothing moved
  });
});

// --- saveForkToLibrary — the D56/D97 return ---------------------------------------

describe('saveForkToLibrary — the D56/D97 return', () => {
  it('returns the fork as it stands — post-fork edits ride along (D56/D97, D41)', () => {
    const { f } = loadFuyuki();
    f.forkMap();
    f.upsertNode({ id: '', label: 'Post-fork Edit', kind: 'location', layer: 'layer-fuyuki', position: { x: 2, y: 2 } });

    const saved = f.saveForkToLibrary();
    const fork = facadeStateOf(f).map!;
    expect(saved.id).toBe(fork.id);
    expect(saved.forkedFrom).toBe(fork.forkedFrom); // provenance carried — the host chooses what to persist
    expect(saved.nodes.some((n) => n.label === 'Post-fork Edit')).toBe(true);
  });

  it('the returned snapshot is the SAVE MOMENT — the fork keeps diverging after it (D56/D97)', () => {
    const { f } = loadFuyuki();
    f.forkMap();
    const saved = f.saveForkToLibrary();
    const countAtSave = saved.nodes.length;

    f.upsertNode({ id: '', label: 'Diverged', kind: 'location', layer: 'layer-fuyuki', position: { x: 4, y: 4 } });
    expect(saved.nodes).toHaveLength(countAtSave); // the earlier snapshot is frozen
    expect(facadeStateOf(f).map!.nodes.some((n) => n.label === 'Diverged')).toBe(true);
  });

  it('the returned object is detached — mutating it never touches the facade (C24, D56/D97)', () => {
    const { f } = loadFuyuki();
    f.forkMap();
    const saved = f.saveForkToLibrary();

    saved.nodes.push({ id: 'n-ghost', label: 'Ghost', kind: 'location', layer: 'layer-fuyuki', position: { x: 0, y: 0 } });
    saved.nodes.find((n) => n.id === 'emiya-residence')!.label = 'Mutated';
    saved.name = 'Mutated Name';

    const fork = facadeStateOf(f).map!;
    expect(fork.nodes.some((n) => n.id === 'n-ghost')).toBe(false);
    expect(fork.nodes.find((n) => n.id === 'emiya-residence')?.label).toBe('Emiya Residence');
    expect(fork.name).not.toBe('Mutated Name');
    expect(facadeStateOf(f).map).toBe(fork); // same reference — no swap happened
  });

  it('changes NO facade state — saving back is not a load event (D75)', () => {
    const { f } = loadFuyuki();
    f.forkMap();
    f.materialize(); // fresh baseline
    f.upsertNode({ id: '', label: 'Keep Me Dirty', kind: 'location', layer: 'layer-fuyuki', position: { x: 5, y: 5 } });

    const snapBefore = f.getSnapshot();
    const mapRef = facadeStateOf(f).map;
    const dirtyBefore = f.hasUnsavedChanges(); // true — the edit is unsaved
    const nodeIds = facadeStateOf(f).savedNodeIds;
    const scale = facadeStateOf(f).savedScale;

    f.saveForkToLibrary();

    expect(f.hasUnsavedChanges()).toBe(dirtyBefore);       // no dirty clear (D75 — not a load/save event)
    expect(facadeStateOf(f).map).toBe(mapRef);
    expect(facadeStateOf(f).savedNodeIds).toBe(nodeIds);   // the Set identity itself — nothing rebuilt
    expect(facadeStateOf(f).savedScale).toBe(scale);
    expect(f.getSnapshot()).toEqual(snapBefore);           // projections unchanged
  });
});

// --- fork-of-fork -----------------------------------------------------------------

describe('fork-of-fork', () => {
  it('forking the current fork chains forkedFrom to the IMMEDIATE parent — legal, no special case (C25/D41, C5)', () => {
    const { f, map, overlay } = loadFuyuki();

    f.forkMap();
    const firstForkId = facadeStateOf(f).map!.id;
    expect(firstForkId).not.toBe(map.id);
    expect(facadeStateOf(f).map!.forkedFrom).toBe(map.id);

    f.forkMap();
    const second = facadeStateOf(f).map!;
    expect(second.id).not.toBe(firstForkId);
    expect(second.id).not.toBe(map.id);          // the chain's ids are never re-used (C5)
    expect(second.forkedFrom).toBe(firstForkId); // the immediate parent, not the grandparent
    expect(overlay.mapId).toBe(second.id);       // the chat rides the newest fork
  });
});

// --- binds survive the fork --------------------------------------------------------

describe('binds survive the fork', () => {
  it('validateOverlay passes on the fork map — the chat\'s binds survive the re-point (C25, C5 element-id preservation)', () => {
    const { f, map, overlay } = loadFuyuki();
    // real chat binds, spanning every overlay reference kind (F50's universe)
    overlay.userNodes.push({ id: 'u-wp', label: 'Waypoint', kind: 'waypoint', layer: 'layer-fuyuki', position: { x: 120, y: 260 }, origin: 'user' });
    overlay.userEdges.push({ id: 'e-uwp', source: 'u-wp', target: 'emiya-residence', modes: { walk: { allowed: true } } });
    overlay.blocked['arc-emiya-residence-fuyuki-bridge'] = 'chat-scoped doubt';
    overlay.nodeBlocked['ghost-house'] = 'missing';

    f.forkMap(); // re-points mapId; element ids preserved — every bind still resolves

    const fork = facadeStateOf(f).map!;
    expect(overlay.mapId).toBe(fork.id);
    expect(() => validateOverlay(overlay, fork)).not.toThrow();
  });
});
