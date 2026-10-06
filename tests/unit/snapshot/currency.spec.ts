// PKG A-011 — D65 currency integrity & blocked-arc visibility, asserted at the
// §9 facade seam (getSnapshot — the seam the verifier probes run through):
//   D65(a) routes currency: minutes only when EVERY prompt-listable incident
//     arc prices in minutes — blocked arcs exempt (they always list, D65(b)) —
//     and a live arc drops only when it cannot honestly price in the list's
//     currency (a distance-kind map cannot carry authoredMinutes-only arcs;
//     a time-kind 'min' map can — FX1's D45 shape);
//   D65(b) blocked arcs are never dropped: best-effort cost in the list's
//     currency, else cost 0 with the arc's cheapest allowed mode — the reason
//     carries the meaning;
//   D65(c) destinations price in the snapshot's ONE currency: forced runs, no
//     per-run canonical fallback inside a minutes snapshot.
// Routing itself keeps D60's strict filter (pinned by the M2 verifier suite);
// nothing here touches tests/verify/**.
import { describe, expect, it } from 'vitest';
import { createFacade } from '../../../src/core/facade';
import type { ChatMapOverlay, MapNodeData, WorldMapData } from '../../../src/core/api';

const overlayFor = (map: WorldMapData, pin: string | null, extra: Partial<ChatMapOverlay> = {}): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: pin,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {}, nodeBlocked: {},
  ...extra,
});

const load = (map: WorldMapData, overlay: ChatMapOverlay) => {
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return f;
};

const node = (id: string, label: string, kind: MapNodeData['kind'], x: number, y: number): MapNodeData => ({
  id,
  label,
  kind,
  layer: 'L',
  position: { x, y },
});

// --- D65(a): the routes-currency all-rule -------------------------------------------------

describe('D65(a) — the snapshot lists ONE honest currency over EVERY prompt-listable incident arc', () => {
  it('authored-minutes arc + geometric-only arc on a time-kind-min map ⇒ canonical list, BOTH listed (the authored arc prices honestly in min)', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-d65-x',
      name: 'D65 Scenario X',
      layers: [{ id: 'L', name: 'Layer' }],
      scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' }, // canonical unit IS minutes (FX1's D45 shape)
      nodes: [node('P', 'Pinpost', 'location', 0, 0), node('A', 'Authored Town', 'location', 10, 0), node('G', 'Geometric Cross', 'location', 0, 10)],
      edges: [
        { id: 'e-PA', source: 'P', target: 'A', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
        { id: 'e-PG', source: 'P', target: 'G', modes: { walk: { allowed: true } } }, // geometric only
      ],
    };
    const snap = load(map, overlayFor(map, 'P')).getSnapshot();
    // the geometric arc cannot price minutes ⇒ the all-rule flips the list
    // canonical; the map's canonical unit is 'min', so the authored arc prices
    // honestly there — completeness (C19) beats the minutes preference.
    expect(snap.routes).toEqual([
      { label: 'Authored Town', direction: 'E', cost: 5, mode: 'walk' },
      { label: 'Geometric Cross', direction: 'S', cost: 10, mode: 'walk' },
    ]);
    expect(snap.unit).toBe('min');
    expect(snap.destinations).toEqual([]);
  });

  it('an authoredMinutes-only LIVE arc on a distance-kind map cannot honestly price in the canonical list ⇒ it drops (pinned)', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-d65-y',
      name: 'D65 Scenario Y',
      layers: [{ id: 'L', name: 'Layer' }],
      scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' }, // minutes are NOT the canonical unit here
      nodes: [node('P', 'Pinpost', 'location', 0, 0), node('A', 'Authored Town', 'location', 10, 0), node('G', 'Geometric Cross', 'location', 0, 10)],
      edges: [
        { id: 'e-PA', source: 'P', target: 'A', modes: { walk: { allowed: true, authoredMinutes: 5 } } }, // authoredMinutes-ONLY
        { id: 'e-PG', source: 'P', target: 'G', modes: { walk: { allowed: true } } },
      ],
    };
    const snap = load(map, overlayFor(map, 'P')).getSnapshot();
    expect(snap.routes).toEqual([{ label: 'Geometric Cross', direction: 'S', cost: 10, mode: 'walk' }]);
    expect(snap.routes.map((r) => r.label)).not.toContain('Authored Town'); // D65(a): the drop, pinned
    expect(snap.unit).toBe('km');
  });

  it('every LIVE arc minutes-priced + a blocked cross-currency arc ⇒ the list STAYS minutes (blocked arcs never constrain it, D65(b))', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-d65-min',
      name: 'D65 Minutes Holds',
      layers: [{ id: 'L', name: 'Layer' }],
      scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
      nodes: [node('P', 'Pinpost', 'location', 0, 0), node('A', 'Authored Town', 'location', 10, 0), node('C', 'Landslide Pass', 'location', 0, 10)],
      edges: [
        { id: 'e-PA', source: 'P', target: 'A', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
        { id: 'e-PC', source: 'P', target: 'C', modes: { walk: { allowed: true } }, blocked: { reason: 'Landslide took the path' } },
      ],
    };
    const snap = load(map, overlayFor(map, 'P')).getSnapshot();
    // the blocked arc is exempt from the currency decision (D65(b)): it always
    // lists, so the minutes-priced live arc keeps the list in minutes — and
    // the unpriceable blocked arc falls back to cost 0 + cheapest allowed mode.
    expect(snap.routes).toEqual([
      { label: 'Authored Town', direction: 'E', cost: 5, mode: 'walk' },
      { label: 'Landslide Pass', direction: 'S', cost: 0, mode: 'walk', blockedReason: 'Landslide took the path' },
    ]);
    expect(snap.unit).toBe('min');
  });

  it('an EMPTY live set stays canonical: zero incident arcs ⇒ unitLabel; a blocked-only neighborhood lists the arc but never declares minutes (D65(a))', () => {
    const isolated: WorldMapData = {
      schemaVersion: 2,
      id: 'map-d65-empty',
      name: 'D65 Empty Live Set',
      layers: [{ id: 'L', name: 'Layer' }],
      scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
      nodes: [node('P', 'Lonely Pin', 'location', 0, 0)],
      edges: [],
    };
    const snapEmpty = load(isolated, overlayFor(isolated, 'P')).getSnapshot();
    expect(snapEmpty.routes).toEqual([]);
    expect(snapEmpty.destinations).toEqual([]);
    expect(snapEmpty.unit).toBe('km'); // no minutes-derived cost presented ⇒ the canonical label

    const blockedOnly: WorldMapData = {
      schemaVersion: 2,
      id: 'map-d65-blockedonly',
      name: 'D65 Blocked Only',
      layers: [{ id: 'L', name: 'Layer' }],
      scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
      nodes: [node('P', 'Pinpost', 'location', 0, 0), node('C', 'Landslide Pass', 'location', 0, 10)],
      edges: [{ id: 'e-PC', source: 'P', target: 'C', modes: { walk: { allowed: true } }, blocked: { reason: 'Landslide took the path' } }],
    };
    const snapBlocked = load(blockedOnly, overlayFor(blockedOnly, 'P')).getSnapshot();
    // the blocked arc still lists (C2/D65(b), priced best-effort in the
    // canonical list), but the empty LIVE set never declares minutes.
    expect(snapBlocked.routes).toEqual([
      { label: 'Landslide Pass', direction: 'S', cost: 10, mode: 'walk', blockedReason: 'Landslide took the path' },
    ]);
    expect(snapBlocked.unit).toBe('km');
  });
});

// --- D65(b): blocked arcs are never dropped ----------------------------------------------

describe('D65(b) — a blocked incident arc always lists; the reason, not the cost, is the payload', () => {
  const map = (): WorldMapData => ({
    schemaVersion: 2,
    id: 'map-d65-b',
    name: 'D65 Blocked Fallbacks',
    layers: [{ id: 'L', name: 'Layer' }],
    scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
    nodes: [
      node('P', 'Pinpost', 'location', 0, 0),
      node('A', 'Authored Town', 'location', 10, 0),
      node('C', 'Landslide Pass', 'location', 0, 10),
      node('D', 'Flooded Ford', 'location', -10, 0),
      node('E', 'Gate Town', 'location', 0, -10),
    ],
    edges: [
      { id: 'e-PA', source: 'P', target: 'A', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
      { id: 'e-PC', source: 'P', target: 'C', modes: { walk: { allowed: true } }, blocked: { reason: 'Landslide took the path' } },
      // two allowed modes, both cross-currency in the minutes list ⇒ the
      // cheapest-allowed fallback resolves in TRAVEL_MODES order: walk, then car
      {
        id: 'e-PD',
        source: 'P',
        target: 'D',
        modes: { car: { allowed: true }, walk: { allowed: true } },
        blocked: { reason: 'Flooded' },
      },
      // blocked but minutes-priced: best-effort pricing SUCCEEDS ⇒ the real
      // authored cost stays, never 0 (the FX1-bridge shape)
      { id: 'e-PE', source: 'P', target: 'E', modes: { walk: { allowed: true, authoredMinutes: 7 } }, blocked: { reason: 'Gate shut' } },
    ],
  });

  it('unpriceable blocked arcs list with cost 0 + their cheapest allowed mode + reason; priceable ones keep their real cost (C2, D65(b))', () => {
    const snap = load(map(), overlayFor(map(), 'P')).getSnapshot();
    expect(snap.routes).toEqual([
      { label: 'Authored Town', direction: 'E', cost: 5, mode: 'walk' },
      { label: 'Landslide Pass', direction: 'S', cost: 0, mode: 'walk', blockedReason: 'Landslide took the path' }, // D65(b) cost-0 fallback
      { label: 'Flooded Ford', direction: 'W', cost: 0, mode: 'walk', blockedReason: 'Flooded' }, // walk before car (TRAVEL_MODES order)
      { label: 'Gate Town', direction: 'N', cost: 7, mode: 'walk', blockedReason: 'Gate shut' }, // best-effort succeeded: real cost
    ]);
    expect(snap.unit).toBe('min'); // every LIVE arc prices minutes; blocked arcs never constrain (D65(a)+(b))
  });

  it('a blocked user-waypoint edge beside an authored sibling stays listed with its reason (the named waypoint is prompt-listable, C23)', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-d65-wp',
      name: 'D65 Waypoint Block',
      layers: [{ id: 'L', name: 'Layer' }],
      scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
      nodes: [node('P', 'Pinpost', 'location', 0, 0), node('A', 'Authored Sibling', 'location', 10, 0)],
      edges: [{ id: 'e-PA', source: 'P', target: 'A', modes: { walk: { allowed: true, authoredMinutes: 5 } } }],
    };
    const overlay = overlayFor(map, 'P', {
      userNodes: [{ id: 'wp-1', label: 'Camp', kind: 'waypoint', layer: 'L', position: { x: 0, y: 10 }, origin: 'user' }],
      userEdges: [{ id: 'we-1', source: 'P', target: 'wp-1', modes: { walk: { allowed: true } } }],
    });
    const f = load(map, overlay);
    f.setBlocked('we-1', 'Washed out'); // D20: chat-scoped block on the user edge
    const snap = f.getSnapshot();
    expect(snap.routes).toEqual([
      { label: 'Authored Sibling', direction: 'E', cost: 5, mode: 'walk' },
      // the geometric user edge cannot price minutes (cross-currency) — C2/D65(b):
      // it still lists, cost 0 + cheapest allowed mode + the block's reason
      { label: 'Camp', direction: 'S', cost: 0, mode: 'walk', blockedReason: 'Washed out' },
    ]);
    expect(snap.unit).toBe('min');
  });
});

// --- D65(c): destinations price in the snapshot's ONE currency ----------------------------

describe('D65(c) — destination runs are forced into the snapshot currency (no fallback)', () => {
  it('minutes snapshot: a hub reachable only geometrically is ABSENT; the minutes-reachable hub is present; no canonical fallback', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-d65-c1',
      name: 'D65 Forced Minutes',
      layers: [{ id: 'L', name: 'Layer' }],
      scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
      nodes: [
        node('P', 'Pinpost', 'location', 0, 0),
        node('A', 'Mid A', 'location', 10, 0),
        node('H1', 'Minutes Hub', 'hub', 20, 0),
        node('G', 'Mid G', 'location', 0, 10),
        node('H2', 'Geometric Hub', 'hub', 0, 20),
      ],
      edges: [
        { id: 'e-PA', source: 'P', target: 'A', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
        { id: 'e-AH1', source: 'A', target: 'H1', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
        { id: 'e-PG', source: 'P', target: 'G', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
        { id: 'e-GH2', source: 'G', target: 'H2', modes: { walk: { allowed: true } } }, // geometric-only ⇒ cross-currency in a minutes run
      ],
    };
    const snap = load(map, overlayFor(map, 'P')).getSnapshot();
    // H2 HAS a canonical route (5 + 10) — the old unconstrained hub computation
    // would have listed it; D65(c) forces the snapshot's minutes currency, so
    // its run is ok:false and the hub drops exactly like a cross-currency arc.
    expect(snap.destinations).toEqual([{ label: 'Minutes Hub', via: 'Mid A', mode: 'walk', cost: 10 }]);
    expect(snap.destinationsTruncated).toBe(false); // only C20 cap drops are marked
    expect(snap.unit).toBe('min');
  });

  it('canonical snapshot: hubs price in the canonical unit (D65(c) symmetry)', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-d65-c2',
      name: 'D65 Forced Canonical',
      layers: [{ id: 'L', name: 'Layer' }],
      scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
      nodes: [node('P', 'Pinpost', 'location', 0, 0), node('H1', 'Near Hub', 'hub', 10, 0), node('G', 'Mid G', 'location', 0, 10), node('H2', 'Far Hub', 'hub', 0, 30)],
      edges: [
        { id: 'e-PH1', source: 'P', target: 'H1', modes: { walk: { allowed: true } } },
        { id: 'e-PG', source: 'P', target: 'G', modes: { walk: { allowed: true } } },
        { id: 'e-GH2', source: 'G', target: 'H2', modes: { walk: { allowed: true } } },
      ],
    };
    const snap = load(map, overlayFor(map, 'P')).getSnapshot();
    expect(snap.destinations).toEqual([
      { label: 'Near Hub', via: 'Near Hub', mode: 'walk', cost: 10 },
      { label: 'Far Hub', via: 'Mid G', mode: 'walk', cost: 30 },
    ]);
    expect(snap.unit).toBe('km');
  });

  it('a blocked arc severing the ONLY hub path ⇒ the hub is absent (ok:false in-currency) while the blocked arc still lists with its real cost + reason', () => {
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-d65-c3',
      name: 'D65 Severed Hub',
      layers: [{ id: 'L', name: 'Layer' }],
      scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
      nodes: [node('P', 'Pinpost', 'location', 0, 0), node('M', 'Midpoint', 'location', 10, 0), node('H', 'Blocked Hub', 'hub', 20, 0)],
      edges: [
        { id: 'e-PM', source: 'P', target: 'M', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
        { id: 'e-PH', source: 'P', target: 'H', modes: { walk: { allowed: true, authoredMinutes: 10 } }, blocked: { reason: 'Rockslide' } },
      ],
    };
    const snap = load(map, overlayFor(map, 'P')).getSnapshot();
    // the blocked arc prices best-effort IN the minutes list (authored 10) —
    // real cost, not 0 — but routing still excludes it (C14 row 1): the hub's
    // only path is severed, its forced-minutes run is ok:false, it drops.
    expect(snap.routes).toEqual([
      { label: 'Midpoint', direction: 'E', cost: 5, mode: 'walk' },
      { label: 'Blocked Hub', direction: 'E', cost: 10, mode: 'walk', blockedReason: 'Rockslide' },
    ]);
    expect(snap.destinations).toEqual([]);
    expect(snap.destinationsTruncated).toBe(false);
    expect(snap.unit).toBe('min');
  });
});
