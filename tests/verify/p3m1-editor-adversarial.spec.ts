// VERIFIER (Agent D) — Phase 3 M1 gate: node-editing adversarials. Expectations
// derive from the SPEC — CORE.md C1/C2/C5/C8/C21/C23/C24/C29/C30, register D75
// (P3-M1 packet store, verbatim), EXECUTION-PLAN §5 Phase 3 M1 + §6.2, and
// PRODUCT.md F08/F16/D42/F40/F45/F46 — never from the implementation.
//
// Cells:
//   1. A-014 GATE (flipped GREEN — the behavior landed): setCurrentLocation
//      REFUSES an UNSAVED editor node — routing and the snapshot keep serving
//      the SAVED graph only (F45/D75's outcome clause binds RUNTIME commands;
//      the saved id-plane universes gate the pin, C30 field-precise).
//   2. A-014 GATE (flipped GREEN — the behavior landed): addUserNodeAt's C7
//      kNN never binds a chat user edge to an UNSAVED editor node (F45/D75;
//      the candidate pool is the saved plane ∪ overlay userNodes, so the
//      overlay stays reload-safe against the SAVED map — F50).
//   3. C5 id discipline: engine-assigned `node-<n>`/`arc-<n>` from 1 on a
//      fresh facade; an id storm (40 nodes + waypoints, interleaved) stays
//      unique across BOTH planes; scheme-shaped authored data cannot hijack
//      the counters (§6.2 "rapid taps ⇒ engine-assigned ids").
//   4. Edge upsert is PUT, not PATCH (D75): replacing an authored BLOCKED arc
//      with a payload that omits `blocked` clears the block on the data while
//      the OLD object keeps serving the SAVED graph — C2 still excludes the
//      arc from routing and the snapshot still lists the reason until
//      saveMap; after the save the arc prices direct (F45's go-live
//      discriminator, uniform for field edits).
//   5. removeNode's both-plane cascade cleans a chat BLOCK on a dying USER
//      edge too (D75 + F50 — a surviving overlay.blocked entry would fail
//      validateOverlay at the next load).
//   6. A REPLACE whose parent dangles is refused field-precisely BEFORE any
//      mutation; map + overlay byte-identical; dirty untouched (C30/D75).
//   7. A self-loop arc create is refused (validator owns the rule, §6.2/C1 —
//      no ad-hoc facade checks), nothing added, dirty untouched.
//   8. C23 guard over the editor flows: after place/connect/waypoint + save,
//      neither getPromptBlock nor getSnapshot serialization ever carries an
//      engine-id token (node-N / arc-N / wp-N / we-N).
import { describe, expect, it } from 'vitest';
import Handlebars from 'handlebars';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { MapValidationError, validateOverlay, validateWorldMap } from '../../src/core/model/validate';
import type { ChatMapOverlay, MapNodeData, TemplateCompiler, WorldMapData } from '../../src/core/api';
import { fuyukiMap } from '../../data/worlds/fuyuki';

const compile: TemplateCompiler = (tpl) => Handlebars.compile(tpl);

// C24: fresh mutable clones of the deep-frozen FX1 fixture per suite.
const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const overlayFor = (map: WorldMapData, pin: string | null = null): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: pin,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {}, nodeBlocked: {},
});

const load = (map: WorldMapData, overlay: ChatMapOverlay, withEngine = false) => {
  const f = withEngine ? createFacade({ compile }) : createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

const lastOf = <T>(arr: T[]): T => arr[arr.length - 1];

const issuesOf = (run: () => void): MapValidationError => {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(MapValidationError);
    return e as MapValidationError;
  }
  throw new Error('expected the command to throw MapValidationError');
};

const nodeDraft = (over: Partial<MapNodeData> = {}): MapNodeData => ({
  id: '',
  label: 'New place',
  kind: 'location',
  layer: 'layer-fuyuki',
  position: { x: 300, y: 300 },
  origin: 'authored',
  ...over,
});

// --- A-014 GATE 1 (was FINDING 1, flipped GREEN): the pin refuses UNSAVED editor nodes ---

describe('A-014 gate (was FINDING 1, expected GREEN): setCurrentLocation refuses UNSAVED editor nodes (F45/D75)', () => {
  it('pinning an unsaved node refuses field-precisely; routing/snapshot keep serving the SAVED graph only', () => {
    const map = fuyuki();
    const { f, overlay } = load(map, overlayFor(map));
    f.upsertNode(nodeDraft({ label: 'Unsaved Spot', position: { x: -2000, y: -2000 } }));
    const unsavedId = lastOf(map.nodes).id;
    expect(f.hasUnsavedChanges()).toBe(true); // the edit is dirty, never saved (F45)

    // Spec: the SAVED graph does not know this id (F45/D75 — nothing is live
    // until saveMap), so the §9 pin command must refuse it exactly as findRoute
    // refuses unknown-to-saved endpoints (C30 field-precise, A-014 message).
    expect(() => f.setCurrentLocation(unsavedId)).toThrow(
      `[TravelMapper] setCurrentLocation: unknown node id '${unsavedId}' (unsaved — save the map first)`,
    );

    // The saved graph keeps serving: routing refuses the same unsaved id, the
    // snapshot never carries the unsaved label, and the pin never moved
    // (D75's outcome clause — the refusal happens before any state change).
    expect(() => f.findRoute('outskirts', unsavedId)).toThrow(/unknown node id/);
    expect(JSON.stringify(f.getSnapshot())).not.toContain('Unsaved Spot');
    expect(overlay.currentLocationId).toBeNull();
  });
});

// --- A-014 GATE 2 (was FINDING 2, flipped GREEN): the kNN never binds UNSAVED editor nodes ---

describe('A-014 gate (was FINDING 2, expected GREEN): addUserNodeAt kNN never connects waypoints to UNSAVED editor nodes (F45/D75, F50)', () => {
  it('a runtime-placed waypoint only binds SAVED library leaves', () => {
    const map = fuyuki();
    const savedLibraryIds = new Set(map.nodes.map((nd) => nd.id));
    const { f, overlay } = load(map, overlayFor(map));

    // An editor session leaves one node UNSAVED (dirty, never saveMap'd) far
    // from every FX1 node.
    f.upsertNode(nodeDraft({ label: 'Ghost Town', position: { x: -2000, y: -2000 } }));
    const unsavedId = lastOf(map.nodes).id;

    // UI-reachable flow: exit the editor, tap-to-place a waypoint right next
    // to the unsaved node (view mode). C7 connects the k=3 nearest leaves of
    // the SAVED plane (A-014: the unsaved node is 10 units away but is NOT a
    // candidate; the nearest FX1 leaf ~2600).
    f.addUserNodeAt('layer-fuyuki', { x: -2000, y: -2010 });
    const wp = lastOf(overlay.userNodes);

    // F45/D75: no chat state may bind to data that has not gone live. Every
    // user-edge endpoint must be a SAVED library node or the waypoint itself.
    const strays = overlay.userEdges
      .filter((e) => e.source === wp.id || e.target === wp.id)
      .map((e) => [e.source, e.target])
      .flat()
      .filter((id) => id !== wp.id && !savedLibraryIds.has(id));
    expect(strays, 'F45/D75: no user edge may reference an unsaved editor node').toEqual([]);
    expect(
      overlay.userEdges.some((e) => e.source === unsavedId || e.target === unsavedId),
      'the unsaved id is bound by no edge at all',
    ).toBe(false);
    expect(overlay.userEdges.length, 'the kNN still binds SAVED leaves — the gate is not vacuous').toBeGreaterThan(0);

    // F50: the chat state this flow creates MUST survive a reload against the
    // SAVED map (the host persists the overlay per chat; the map save may
    // never happen) — no dangling endpoint, so no whole-overlay refusal.
    expect(() => validateOverlay(JSON.parse(JSON.stringify(overlay)), fuyuki())).not.toThrow();
  });
});

// --- C5 id discipline ----------------------------------------------------------

describe('C5 id discipline over the editor commands (C5/D75, §6.2)', () => {
  it('engine ids start at 1 per space on a fresh facade; a storm across BOTH planes never collides', () => {
    const map = fuyuki();
    const { f, overlay } = load(map, overlayFor(map));

    // First creations: deterministic engine ids (C5 — ids belong to the
    // engine; D75 — `node-<n>` / `arc-<n>`).
    f.upsertNode(nodeDraft({ label: 'First' }));
    expect(lastOf(map.nodes).id).toBe('node-1');
    f.upsertEdge({ id: '', source: 'outskirts', target: lastOf(map.nodes).id, modes: { walk: { allowed: true } } });
    expect(lastOf(map.edges).id).toBe('arc-1');

    // The §6.2 storm: 40 rapid places interleaved with runtime waypoints —
    // every id unique across the MERGED set (library nodes ∪ overlay
    // waypoints), no collision anywhere.
    const authoredCount = map.nodes.length;
    const engineAssigned: string[] = [lastOf(map.nodes).id];
    for (let i = 0; i < 40; i++) {
      f.upsertNode(nodeDraft({ position: { x: 300 + i, y: 300 } }));
      engineAssigned.push(lastOf(map.nodes).id);
      if (i % 8 === 0) {
        f.addUserNodeAt('layer-fuyuki', { x: -2000, y: -2000 - i });
        engineAssigned.push(lastOf(overlay.userNodes).id);
      }
    }
    const merged = [...map.nodes, ...overlay.userNodes].map((nd) => nd.id);
    expect(map.nodes).toHaveLength(authoredCount + 40);
    expect(new Set(merged).size).toBe(merged.length); // C5: rapid creations cannot collide
    for (const id of engineAssigned) expect(id).toMatch(/^(node|wp)-\d+$/); // D75 schemes
    expect(new Set(engineAssigned).size).toBe(engineAssigned.length);
    expect(map.edges.length + overlay.userEdges.length).toBeGreaterThan(0);
    expect(() => validateWorldMap(map)).not.toThrow();
    expect(() => validateOverlay(overlay, map)).not.toThrow();
  });

  it('scheme-shaped authored data cannot hijack the EDGE counter either (C5/D75)', () => {
    const map = fuyuki();
    map.edges.push({
      id: 'arc-1', source: 'outskirts', target: 'fuyuki-bridge',
      modes: { walk: { allowed: true, authoredMinutes: 35 } },
    });
    const { f } = load(map, overlayFor(map));
    f.upsertEdge({ id: '', source: 'outskirts', target: 'kotomine-church', modes: { walk: { allowed: true } } });
    expect(lastOf(map.edges).id).toBe('arc-2'); // bumped until free over the merged set
  });
});

// --- Edge upsert is PUT, not PATCH — C2/F14/F45/D75 ------------------------------

describe('edge REPLACE clears omitted fields; the SAVED graph serves until saveMap (D75, C2, F45)', () => {
  it('an omitted `blocked` clears on the data; C2 keeps the arc excluded and the reason listed until the save', () => {
    const map = fuyuki();
    const { f } = load(map, overlayFor(map, 'emiya-residence'));
    const bridge = map.edges.find((e) => e.id === 'arc-emiya-residence-fuyuki-bridge')!;
    expect(bridge.blocked?.reason).toBe('Bridge closed by local authorities'); // FX1's authored block

    // Re-derived from FX1 (never from a test): with the direct arc blocked,
    // emiya→bridge routes via Shopping District (12) + Bridge (15) = 27.
    expect(f.findRoute('emiya-residence', 'fuyuki-bridge').total).toBe(27);

    f.upsertEdge({
      id: bridge.id, source: bridge.source, target: bridge.target,
      modes: { walk: { allowed: true, authoredMinutes: 25 } }, // `blocked` OMITTED — PUT, not PATCH
    });
    const stored = map.edges.find((e) => e.id === bridge.id)!;
    expect(stored).not.toBe(bridge); // fresh object swapped in (D75 REPLACE)
    expect(stored.blocked).toBeUndefined(); // the omitted field CLEARED (D75 full-replace)
    expect(bridge.blocked?.reason).toBe('Bridge closed by local authorities'); // old object byte-identical
    expect(f.hasUnsavedChanges()).toBe(true);
    expect(facadeStateOf(f).stale).toBe(false); // dirty, never stale (D75)

    // F45: the SAVED graph still serves — C2 still excludes the (saved) block,
    // and the snapshot still lists the reason for the LLM.
    expect(f.findRoute('emiya-residence', 'fuyuki-bridge').total).toBe(27);
    expect(JSON.stringify(f.getSnapshot())).toContain('Bridge closed by local authorities');

    f.saveMap(); // C8 edit save — the edits go live
    expect(f.findRoute('emiya-residence', 'fuyuki-bridge').total).toBe(25); // the direct arc, unblocked
    expect(JSON.stringify(f.getSnapshot())).not.toContain('Bridge closed by local authorities');
  });

  it('an omitted mode key clears too — the stored data is exactly the payload (D75)', () => {
    const map = fuyuki();
    const { f } = load(map, overlayFor(map));
    const dual = map.edges.find((e) => e.id === 'arc-outskirts-einzbern-castle')!; // walk 240 + car 60
    f.upsertEdge({
      id: dual.id, source: dual.source, target: dual.target,
      modes: { car: { allowed: true, authoredMinutes: 60 } }, // walk OMITTED
    });
    const stored = map.edges.find((e) => e.id === dual.id)!;
    expect(stored.modes.walk).toBeUndefined(); // PUT: the omitted mode is gone
    expect(stored.modes.car?.allowed).toBe(true);
    expect(f.hasUnsavedChanges()).toBe(true);
  });
});

// --- removeNode: the chat-block cleanup reaches USER edges too (D75, F50) -------

describe('removeNode cascade cleans overlay.blocked for dying USER edges (D75, F50)', () => {
  it('a chat block on a we-* edge dies with the edge when its library endpoint is removed', () => {
    const map = fuyuki();
    const { f, overlay } = load(map, overlayFor(map));
    f.addUserNodeAt('layer-fuyuki', { x: 100, y: 260 }); // kNN: emiya is 10 units away — we-1 = emiya↔wp
    const wpEdges = overlay.userEdges.filter((e) => e.source === overlay.userNodes[0].id || e.target === overlay.userNodes[0].id);
    const emiyaEdge = wpEdges.find((e) => e.source === 'emiya-residence' || e.target === 'emiya-residence')!;
    f.setBlocked(emiyaEdge.id, 'rockslide');
    expect(overlay.blocked[emiyaEdge.id]).toBe('rockslide');

    f.removeNode('emiya-residence'); // cascades BOTH planes (D75)
    expect(overlay.userEdges.some((e) => e.id === emiyaEdge.id)).toBe(false); // the user edge died
    expect(overlay.blocked[emiyaEdge.id]).toBeUndefined(); // its chat block died with it (F50)
    expect(overlay.userNodes).toHaveLength(1); // the waypoint survives, orphaned (C7: legal)
    for (const e of overlay.userEdges) {
      expect(e.source === 'emiya-residence' || e.target === 'emiya-residence').toBe(false);
    }
    expect(f.hasUnsavedChanges()).toBe(true);
    expect(() => validateWorldMap(map)).not.toThrow();
    expect(() => validateOverlay(overlay, map)).not.toThrow();
  });
});

// --- C30 refusals: field-precise, pre-mutation, dirty untouched ------------------

describe('C30 refusals on the editor seams (C30, D75, §6.2)', () => {
  it('a REPLACE with a dangling parent refuses field-precisely; map + overlay byte-identical; dirty untouched', () => {
    const map = fuyuki();
    const { f, overlay } = load(map, overlayFor(map));
    const before = JSON.stringify([map, overlay]);
    const err = issuesOf(() =>
      f.upsertNode({
        id: 'outskirts', label: 'Outskirts', kind: 'location', layer: 'layer-fuyuki',
        position: { x: 30, y: 360 }, parent: 'ghost-district',
      }),
    );
    expect(err.issues.some((i) => i.path.endsWith('.parent') && i.message.includes('not found'))).toBe(true);
    expect(JSON.stringify([map, overlay])).toBe(before); // nothing touched (C30)
    expect(f.hasUnsavedChanges()).toBe(false); // a refusal never flips dirty (D75)
  });

  it('a self-loop arc create refuses (the validator owns the rule), nothing added', () => {
    const map = fuyuki();
    const { f } = load(map, overlayFor(map));
    const count = map.edges.length;
    const err = issuesOf(() =>
      f.upsertEdge({ id: '', source: 'outskirts', target: 'outskirts', modes: { walk: { allowed: true } } }),
    );
    expect(err.issues.some((i) => i.path.endsWith('.source') && i.message.includes('differ'))).toBe(true);
    expect(map.edges).toHaveLength(count);
    expect(f.hasUnsavedChanges()).toBe(false);
  });
});

// --- C23 guard over the editor flows ---------------------------------------------

describe('C23: engine-id tokens never reach prompt-facing structures through editor flows (C23, F40/F16)', () => {
  it('place + connect + waypoint + save leaves no node-N/arc-N/wp-N/we-N in the block or snapshot', () => {
    const map = fuyuki();
    const { f } = load(map, overlayFor(map, 'outskirts'), true);
    f.upsertNode(nodeDraft({ label: 'New place', position: { x: -800, y: 600 } }));
    const placedId = lastOf(map.nodes).id;
    f.upsertEdge({ id: '', source: 'outskirts', target: placedId, modes: { walk: { allowed: true, authoredMinutes: 9 } } });
    f.saveMap(); // go live (F45)
    f.addUserNodeAt('layer-fuyuki', { x: -800, y: 620 }); // a waypoint bound to the now-saved node

    const snapshotText = JSON.stringify(f.getSnapshot());
    const prompt = f.getPromptBlock();
    const MACHINE_TOKEN = /(?:node|arc|wp|we)-\d+/;
    expect(snapshotText).not.toMatch(MACHINE_TOKEN);
    expect(prompt).not.toMatch(MACHINE_TOKEN);
    // Sanity: the flows actually went live (the guard is not vacuous) —
    // the saved place and its snapshot/waypoint presence are real.
    expect(f.findRoute('outskirts', placedId).ok).toBe(true);
    expect(snapshotText).toContain('New place');
  });
});
