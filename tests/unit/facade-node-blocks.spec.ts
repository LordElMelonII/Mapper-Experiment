// Behavior tests for node-level blocking (PKG A-018): the setNodeBlocked
// command + the C34 origin-exempt routing exclusion.
// D94 — ChatMapOverlay.nodeBlocked mirrors the arc blocks (D20 spirit:
// excluded from routing, visible to the prompt); setNodeBlocked mirrors
// setBlocked at every seam — saved-plane-gated add (A-014/F50), unconditional
// lift, non-empty reason (C30) — and is an OVERLAY command: stale, never
// dirty (the R25 adjudication; chat-scoped blocks never ride saveMap).
// C34 — a blocked node is impassable as a route destination and as an
// intermediate stop; the ORIGIN is exempt (the party can always leave
// somewhere they already are). F55 — node & arc quick blocking.
// C2/C17 — ∞ never appears in any output; ok:false carries a human reason.
// C20 — the destinations list drops a blocked hub (the C15 drop precedent).
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

// C24: the facade keeps the loaded reference — every suite thaws a fresh JSON
// clone of the deep-frozen FX1 fixture so tests never interact.
const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const fuyukiOverlay = (map: WorldMapData): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: 'emiya-residence',
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {},
  nodeBlocked: {},
});

const loadFuyuki = () => {
  const map = fuyuki();
  const overlay = fuyukiOverlay(map);
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

// --- setNodeBlocked: the D94 mirror of setBlocked (D94/F55, C8) ---------------------------

describe('setNodeBlocked — chat-scoped node blocks mirroring setBlocked (D94/F55)', () => {
  it('adds, restates, and lifts the overlay entry; valid reasons are stored verbatim, untrimmed (D94, C30)', () => {
    const { f, overlay } = loadFuyuki();
    f.setNodeBlocked('fuyuki-station', 'rail strike'); // add
    expect(overlay.nodeBlocked['fuyuki-station']).toBe('rail strike');
    f.setNodeBlocked('fuyuki-station', '  rail strike  '); // restate — the author's payload, untrimmed
    expect(overlay.nodeBlocked['fuyuki-station']).toBe('  rail strike  ');
    f.setNodeBlocked('fuyuki-station', undefined); // lift
    expect('fuyuki-station' in overlay.nodeBlocked).toBe(false);
  });

  it('the ADD path is saved-plane-gated: an unsaved editor node is refused field-precisely (A-014, C30/F50)', () => {
    const { f } = loadFuyuki();
    f.upsertNode({ id: '', label: 'Doom Gate', kind: 'location', layer: 'layer-fuyuki', position: { x: 0, y: 0 } });
    expect(() => f.setNodeBlocked('node-1', 'sealed')).toThrow(
      `[TravelMapper] setNodeBlocked: unknown node id 'node-1' (unsaved — save the map first)`,
    );
    f.saveMap(); // the editor node joins the saved plane — the gate admits it
    f.setNodeBlocked('node-1', 'sealed');
    expect(facadeStateOf(f).overlay?.nodeBlocked['node-1']).toBe('sealed');
  });

  it('an overlay user node is accepted on the ADD path (D94 — savedNodeIds ∪ overlay userNodes)', () => {
    const { f } = loadFuyuki();
    f.addUserNodeAt('layer-fuyuki', { x: 110, y: 260 }); // C5: 'wp-1'
    f.setNodeBlocked('wp-1', 'collapsed');
    expect(facadeStateOf(f).overlay?.nodeBlocked['wp-1']).toBe('collapsed');
  });

  it('an empty or whitespace-only reason is refused without lifting an existing block (C30/F50, the setBlocked discipline)', () => {
    const { f, overlay } = loadFuyuki();
    f.setNodeBlocked('fuyuki-station', 'rail strike');
    for (const bad of ['', '   ', '\t\n']) {
      expect(() => f.setNodeBlocked('fuyuki-station', bad)).toThrow(
        /reason must be a non-empty string or undefined/,
      );
    }
    expect(overlay.nodeBlocked['fuyuki-station']).toBe('rail strike'); // the refusal never silently lifts
  });

  it('the LIFT path is unconditional and a no-op on unknown keys; the ADD path still gates (A-014 mirror)', () => {
    const { f, overlay } = loadFuyuki();
    f.setNodeBlocked('fuyuki-bridge', 'sealed');
    f.setNodeBlocked('fuyuki-bridge', undefined);
    expect('fuyuki-bridge' in overlay.nodeBlocked).toBe(false);
    expect(() => f.setNodeBlocked('ghost-node', undefined)).not.toThrow(); // lift never binds
    expect(() => f.setNodeBlocked('ghost-node', 'why')).toThrow(/unknown node id 'ghost-node'/); // add gates
  });

  it('stale flips and dirty does NOT — the R25 adjudication: an overlay command, never an editor one (C8, D75/F45)', () => {
    const { f } = loadFuyuki();
    expect(f.hasUnsavedChanges()).toBe(false);
    f.setNodeBlocked('fuyuki-station', 'rail strike');
    expect(facadeStateOf(f).stale).toBe(true); // C8 — the mutation contract
    expect(facadeStateOf(f).dirty).toBe(false); // never SET by an overlay command
    expect(f.hasUnsavedChanges()).toBe(false); // chat-scoped blocks never ride saveMap into the library
    f.findRoute('emiya-residence', 'misaki-town'); // a query consumes the flag (C8)
    expect(facadeStateOf(f).stale).toBe(false);
    // …and it never CLEARS a pending editor-dirty flag either:
    f.upsertNode({ id: '', label: 'Doom Gate', kind: 'location', layer: 'layer-fuyuki', position: { x: 0, y: 0 } });
    f.setNodeBlocked('fuyuki-bridge', 'sealed');
    expect(facadeStateOf(f).dirty).toBe(true); // the editor edit is still pending
  });

  it('no map loaded ⇒ the standard refusal', () => {
    const f = createFacade();
    expect(() => f.setNodeBlocked('n', 'reason')).toThrow('[TravelMapper] no map loaded');
  });
});

// --- C34 routing: destination + intermediate impassable, origin exempt (C34/F23, C17) ------

describe('C34 routing — blocked nodes are impassable destinations and intermediates; the origin is exempt', () => {
  it('a blocked DESTINATION ⇒ ok:false with the block named — label + authored reason (C34, C17, C23)', () => {
    const { f } = loadFuyuki();
    f.setNodeBlocked('misaki-town', 'ward seals the town');
    const r = f.findRoute('emiya-residence', 'misaki-town');
    expect(r.ok).toBe(false);
    expect(r.total).toBe(0);
    expect(r.legs).toEqual([]);
    expect(r.reason).toContain('Misaki Town'); // the authored label — never the machine id (C23)
    expect(r.reason).toContain('ward seals the town'); // the authored reason, verbatim
    expect(JSON.stringify(r)).not.toContain('Infinity'); // C17
  });

  it('a blocked INTERMEDIATE is avoided: the unblocked baseline proves the block changed the route (C34, C17)', () => {
    const { f } = loadFuyuki();
    expect(f.findRoute('emiya-residence', 'ghost-house').total).toBe(65); // 50 + 15 THROUGH Fuyuki Station
    f.setNodeBlocked('fuyuki-station', 'rail strike');
    const r = f.findRoute('emiya-residence', 'ghost-house');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(80); // around: 30 (Outskirts) + 50
    expect(r.legs.map((l) => [l.from, l.to]).flat()).not.toContain('fuyuki-station'); // never passes THROUGH the blocked node
    expect(JSON.stringify(r)).not.toContain('Infinity'); // C17
  });

  it('a blocked INTERMEDIATE at a cut vertex ⇒ unreachable with the SILENT existing wording (C34, C17 — the blocked-arc ∞ mirror)', () => {
    const { f } = loadFuyuki();
    f.setNodeBlocked('fuyuki-station', 'severed');
    const r = f.findRoute('emiya-residence', 'misaki-town'); // Misaki Town hangs off the station alone
    expect(r.ok).toBe(false);
    expect(r.legs).toEqual([]);
    expect(r.reason).toMatch(/blocked or disallowed/); // the exclusion is silent — never naming the intermediate block
    expect(r.reason).not.toContain('Fuyuki Station');
    expect(JSON.stringify(r)).not.toContain('Infinity'); // C17
  });

  it('a blocked ORIGIN still routes — the C34 exemption, the owner’s pin-on-bridge pick (C34)', () => {
    const { f } = loadFuyuki();
    f.setNodeBlocked('emiya-residence', 'under siege');
    const r = f.findRoute('emiya-residence', 'misaki-town');
    expect(r.ok).toBe(true);
    expect(r.total).toBe(350); // FX2 unchanged — the origin is never stepped into
    expect(r.legs[0]?.from).toBe('emiya-residence');
  });

  it('from === to on a blocked node stays trivial success (§6.2 + the C34 origin exemption)', () => {
    const { f } = loadFuyuki();
    f.setNodeBlocked('misaki-town', 'ward');
    expect(f.findRoute('misaki-town', 'misaki-town')).toEqual({ ok: true, total: 0, legs: [], unit: 'min' });
  });

  it('the C20 destinations list drops a blocked hub — the C15 drop precedent — and blockedNodes lists it (C20, D94/C34)', () => {
    const { f } = loadFuyuki();
    expect(f.getSnapshot().destinations.map((d) => d.label)).toEqual(
      expect.arrayContaining(['Fuyuki Station', 'Misaki Town']),
    );
    f.setNodeBlocked('misaki-town', 'ward seals the town');
    const snap = f.getSnapshot();
    expect(snap.destinations.map((d) => d.label)).not.toContain('Misaki Town'); // the forced-currency run returns ok:false ⇒ dropped
    expect(snap.destinations.map((d) => d.label)).toContain('Fuyuki Station'); // the unblocked hub stays
    expect(snap.blockedNodes).toEqual([{ label: 'Misaki Town', reason: 'ward seals the town' }]); // the blocked listing (C2 spirit)
  });
});
