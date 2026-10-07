// Facade fork commands (PKG A-022, Phase 3 M4): forkMap / saveForkToLibrary
// over FX1. C25 the fork switch + never-re-sync · C24 the detach IS the deep
// copy and the caller's overlay is re-pointed in place · C5 engine-assigned
// map ids (fork-of-fork never re-uses the chain) · D41 forkedFrom provenance +
// the explicit save-back · D56/D97 the WorldMapData return, detached, no
// facade state moves · D75 a fork starts clean (the copy IS the saved plane) ·
// A-014 saved-plane universes rebuilt from the fork (F50 gate family).
// PKG A-023 (the M4 gate's two fork findings): D98 the OPTIONAL exclusion
// channel — the exact create.ts C5 contract's shape (the CALLER passes its
// library's stored-id set, the engine still generates and skips excluded
// candidates while the counter still advances; the parent chain is excluded
// unconditionally) — and D99 the dirty-session refusal ("the session has
// unsaved changes — save it or discard it before forking"; C30
// reject-before-mutate proves the flag rides D75's existing dirty state, and a
// refused fork promotes NOTHING).
// FX1 is thawed per C24 — every suite loads a fresh JSON clone so tests never
// interact.
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../../src/core/facade';
import { validateOverlay } from '../../../src/core/model/validate';
import { generateMapId } from '../../../src/core/model/create';
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

// --- forkMap — the M4 gate's fork findings (PKG A-023): D98 exclusion · D99 dirty refusal -----

describe('forkMap — D98 exclusion channel · D99 dirty refusal', () => {
  it('forkMap honors the exclude set — the mint skips the excluded candidate, the counter still advances (D98, C5)', () => {
    const { f, map } = loadFuyuki();
    // Locate the module counter without assuming an absolute position: spend one
    // candidate via create.ts's own generator, then the fork's natural mint is
    // probe+1 — exclude THAT and the fork must mint probe+2 (skip + advance, the
    // constructors' exact C5 discipline; the counter consumes excluded candidates).
    const probe = generateMapId();
    const n = Number(probe.slice('map-'.length));
    const excludedCandidate = `map-${n + 1}`;
    f.forkMap(new Set([excludedCandidate, map.id])); // the caller passes its library's id set
    const fork = facadeStateOf(f).map!;
    expect(fork.id).toBe(`map-${n + 2}`); // the excluded candidate SKIPPED — minted around it
    expect(fork.id).not.toBe(map.id);     // the parent's id is never re-issued (C5)
    expect(fork.forkedFrom).toBe(map.id); // D41 provenance — unchanged by the channel
  });

  it('fork-of-fork with a caller set: the parent chain stays excluded and the caller channel keeps gating the mint (D98, C5, C25/D41)', () => {
    const { f, map } = loadFuyuki();
    const probe = generateMapId();
    const n = Number(probe.slice('map-'.length));
    const callerSet = new Set([`map-${n + 1}`, map.id]); // the caller's stored-id knowledge
    f.forkMap(callerSet);
    const fork1 = facadeStateOf(f).map!;
    expect(fork1.id).toBe(`map-${n + 2}`);  // the caller-set candidate skipped
    expect(fork1.forkedFrom).toBe(map.id);  // the immediate parent

    f.forkMap(callerSet); // the SAME caller set — stale, and NOT containing fork1's id
    const fork2 = facadeStateOf(f).map!;
    expect(fork2.id).toBe(`map-${n + 3}`);                     // a fresh mint beyond both
    expect(fork2.id !== fork1.id && fork2.id !== map.id).toBe(true); // the chain's ids are never re-used — with or without a caller set (C5)
    expect(fork2.forkedFrom).toBe(fork1.id);                   // the immediate parent, no special case (C25/D41)
  });

  it('a dirty session refuses field-precisely and NOTHING moves — reject-before-mutate (D99, C30, C25/D75/F45)', () => {
    const { f, map, overlay } = loadFuyuki();
    f.upsertNode({ id: '', label: 'Draft', kind: 'location', layer: 'layer-fuyuki', position: { x: 9, y: 9 } }); // the unsaved draft
    expect(f.hasUnsavedChanges()).toBe(true);
    const mapRef = facadeStateOf(f).map;
    const savedNodes = facadeStateOf(f).savedNodeIds;
    const savedEdges = facadeStateOf(f).savedEdgeIds;
    const savedLayers = facadeStateOf(f).savedLayerIds;
    const savedScale = facadeStateOf(f).savedScale;
    const mapIdBefore = overlay.mapId;
    const snapshotBefore = f.getSnapshot();

    // the refusal, field-precise — the state AND both honest recovery paths named (D99)
    expect(() => f.forkMap()).toThrow(/the session has unsaved changes/);
    expect(() => f.forkMap()).toThrow(/save it or discard it before forking/);
    expect(() => f.forkMap(new Set(['map-999']))).toThrow(/unsaved changes/); // the exclusion form refuses identically

    // C30 NOTHING moves — reject-before-mutate proven on every plane:
    expect(facadeStateOf(f).map).toBe(mapRef);      // no fork installed — the same reference (C25)
    expect(f.hasUnsavedChanges()).toBe(true);       // the D75 flag untouched
    expect(overlay.mapId).toBe(mapIdBefore);        // the chat still references the parent (C24)
    expect(facadeStateOf(f).savedNodeIds).toBe(savedNodes); // the Set identity itself — nothing rebuilt (A-014)
    expect(facadeStateOf(f).savedEdgeIds).toBe(savedEdges);
    expect(facadeStateOf(f).savedLayerIds).toBe(savedLayers);
    expect(facadeStateOf(f).savedScale).toBe(savedScale);   // the A-015 pricing seam untouched (F45)
    expect(f.getSnapshot()).toEqual(snapshotBefore);        // projections byte-equal — never 5→10 'units' drift
    // the draft promotes NOTHING: it is still the live map's unsaved state — save or discard stays the user's call (D10)
    expect(facadeStateOf(f).map!.nodes.some((nd) => nd.label === 'Draft')).toBe(true);
    expect(facadeStateOf(f).map!.forkedFrom).toBeUndefined(); // the parent was never re-pointed at a fork
    void map;
  });

  it('saveMap clears dirty — the saved-then-fork path works, and the saved draft rides the fork as library truth (D99, D75)', () => {
    const { f, map, overlay } = loadFuyuki();
    f.upsertNode({ id: '', label: 'Saved Draft', kind: 'location', layer: 'layer-fuyuki', position: { x: 9, y: 9 } });
    expect(f.hasUnsavedChanges()).toBe(true);
    f.saveMap(); // the ONE explicit path that takes the draft live (C13/C29/D75)
    expect(f.hasUnsavedChanges()).toBe(false); // dirty cleared exactly by saveMap
    f.forkMap(new Set(['map-999'])); // the exclusion channel rides fine post-save (D98)
    const fork = facadeStateOf(f).map!;
    expect(fork.id).not.toBe('map-999'); // the engine still generates — never a proposed id (C5)
    expect(fork.forkedFrom).toBe(map.id);
    expect(overlay.mapId).toBe(fork.id); // the C25 overlay re-point happened
    expect(f.hasUnsavedChanges()).toBe(false); // the copy IS the fork's saved plane (D75)
    expect(fork.nodes.some((nd) => nd.label === 'Saved Draft')).toBe(true); // the SAVED draft is library truth the fork copies (D75)
  });

  it('a fresh loadMap → forkMap still works after a refused fork — the established flow; the refusal lingers on nothing (D99, D75)', () => {
    const { f } = loadFuyuki();
    f.upsertNode({ id: '', label: 'Abandoned Draft', kind: 'location', layer: 'layer-fuyuki', position: { x: 9, y: 9 } });
    expect(() => f.forkMap()).toThrow(/unsaved changes/); // refused while dirty
    const fresh = fuyuki();
    f.loadMap(fresh, fuyukiOverlay(fresh)); // discard-via-reload: loadMap clears dirty (D75)
    expect(f.hasUnsavedChanges()).toBe(false);
    f.forkMap(); // the established no-arg flow — every B-137-era call site (D98's mixed signature)
    const fork = facadeStateOf(f).map!;
    expect(fork.forkedFrom).toBe(fresh.id);
    expect(f.hasUnsavedChanges()).toBe(false);
  });
});
