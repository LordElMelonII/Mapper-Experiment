// P2 M2 gate — adversarial cross-layer badge suite (verifier, PKG D-P2M2).
// Expectations derived from CORE.md C2/C3/C10/C17, PRODUCT.md F14/F52, §6.1's
// "endpoint badges with destination/mode/cost" comprehension row, and register
// D72 — never from the implementation. The pure builders under test are
// src/app/graph/layer-elements.ts (buildCrossLayerBadges / crossLayerAnchors):
// bare-Node importable by construction (type-only imports), so this suite pins
// them without a browser; the mounted FX1 pipeline stays with the e2e specs.
//
// Hand-derived FX1 facts used below: arc-fuyuki-station-misaki-town is the sole
// cross-layer arc (train 300 authoredMinutes, train-only); fuyuki-station sits
// at (560,260) on layer-fuyuki; misaki-town at (200,200) on layer-misaki.
import { describe, expect, it } from 'vitest';
import { buildCrossLayerBadges, crossLayerAnchors } from '../../src/app/graph/layer-elements';
import { createFacade } from '../../src/core/facade';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type {
  ChatMapOverlay,
  RouteResult,
  WorldMapData,
} from '../../src/core/api';

// C10: the eight-way direction set (and long forms) — no token may appear in
// badge text: cross-layer arcs have no geographic direction.
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const CARDINAL_WORD = new RegExp(`\\b(${CARDINALS.join('|')})\\b`, 'i');

const CROSS_ARC = 'arc-fuyuki-station-misaki-town';

const thaw = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const overlayOf = (map: WorldMapData, pin: string | null = 'emiya-residence'): ChatMapOverlay => ({
  mapId: map.id,
  currentLocationId: pin,
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {}, nodeBlocked: {},
});

// Mirrors the service bridge's badgeRoutes (GraphService.badgeRoutes): one
// DEFAULT-mode findRoute per anchor — the ONLY sanctioned way badge costs exist.
const facadeRoutes = (map: WorldMapData, overlay: ChatMapOverlay, layerId: string): ReadonlyMap<string, RouteResult | null> => {
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  const routes = new Map<string, RouteResult | null>();
  for (const anchor of crossLayerAnchors(map, overlay, layerId)) {
    routes.set(anchor.arcId, f.findRoute(anchor.onLayer, anchor.other));
  }
  return routes;
};

const badgeOf = (badges: ReturnType<typeof buildCrossLayerBadges>, id: string) => {
  const hit = badges.find((el) => el.data.id === id);
  if (hit === undefined) throw new Error(`badge ${id} missing`);
  return hit;
};

// ---------------------------------------------------------------------------
// FX1 through the REAL facade — the exact strings the canvas renders.
// ---------------------------------------------------------------------------

describe('FX1 badges via the real facade — destination, modes, core cost + D72 unit (C3, §6.1, R1/D72)', () => {
  it("layer-fuyuki: one badge, exact text 'Misaki Town · train · 300 min', riding the on-layer endpoint (C3, D72)", () => {
    const map = thaw(fuyukiMap);
    const overlay = overlayOf(map);
    const badges = buildCrossLayerBadges(map, overlay, 'layer-fuyuki', facadeRoutes(map, overlay, 'layer-fuyuki'));
    expect(badges).toHaveLength(1);
    const badge = badgeOf(badges, `tme-badge-${CROSS_ARC}`);
    expect(badge.group).toBe('nodes'); // a pseudo-NODE riding cytoscape's renderer
    expect(badge.classes).toEqual(['tme-badge']);
    expect(badge.grabbable).toBe(false); // display-only, never draggable
    expect(badge.data['label']).toBe('Misaki Town · train · 300 min'); // cost + unit adjacent, verbatim core numbers
    // rides ITS anchor (fuyuki-station at 560,260), not the far plane's node (200,200)
    const pos = badge.position as { x: number; y: number };
    expect(Math.abs(pos.x - 560)).toBeLessThanOrEqual(40);
    expect(Math.abs(pos.y - 260)).toBeLessThanOrEqual(40);
    expect(badge.data['label']).not.toMatch(CARDINAL_WORD); // C10: no direction token
  });

  it("layer-misaki: the SAME arc re-anchors and reads toward Fuyuki — 'Fuyuki Station · train · 300 min' (C3)", () => {
    const map = thaw(fuyukiMap);
    const overlay = overlayOf(map);
    const badges = buildCrossLayerBadges(map, overlay, 'layer-misaki', facadeRoutes(map, overlay, 'layer-misaki'));
    expect(badges).toHaveLength(1);
    const badge = badgeOf(badges, `tme-badge-${CROSS_ARC}`);
    expect(badge.data['label']).toBe('Fuyuki Station · train · 300 min');
    const pos = badge.position as { x: number; y: number };
    expect(Math.abs(pos.x - 200)).toBeLessThanOrEqual(40); // anchored at misaki-town (200,200)
    expect(Math.abs(pos.y - 200)).toBeLessThanOrEqual(40);
    expect(badge.data['label']).not.toMatch(CARDINAL_WORD);
  });
});

// ---------------------------------------------------------------------------
// C17 at the badge seam — cost appears ONLY for ok:true; a blocked or
// unreachable cross-layer arc renders destination + modes and NEVER a number.
// ---------------------------------------------------------------------------

describe('badge cost only when ok — blocked/unreachable/absent routes degrade without a number (C17, C2, D72)', () => {
  const baseRoutes = (): Map<string, RouteResult | null> => new Map();

  it('no routes entry at all (the no-facade shape): destination + modes only (C17)', () => {
    const map = thaw(fuyukiMap);
    const badges = buildCrossLayerBadges(map, overlayOf(map), 'layer-fuyuki', new Map());
    expect(badgeOf(badges, `tme-badge-${CROSS_ARC}`).data['label']).toBe('Misaki Town · train');
  });

  it('an explicit null entry (a failed query): destination + modes only (C17)', () => {
    const map = thaw(fuyukiMap);
    const routes = new Map<string, RouteResult | null>([[CROSS_ARC, null]]);
    const badges = buildCrossLayerBadges(map, overlayOf(map), 'layer-fuyuki', routes);
    expect(badgeOf(badges, `tme-badge-${CROSS_ARC}`).data['label']).toBe('Misaki Town · train');
  });

  it('an ok:false route (sole cross arc chat-blocked): destination + modes, reason kept OUT of the number slot, ∞ nowhere (C17, C2)', () => {
    const map = thaw(fuyukiMap);
    const overlay = overlayOf(map);
    overlay.blocked[CROSS_ARC] = 'Line suspended'; // chat-scoped block on the sole inter-layer arc
    const badges = buildCrossLayerBadges(map, overlay, 'layer-fuyuki', facadeRoutes(map, overlay, 'layer-fuyuki'));
    const label = String(badgeOf(badges, `tme-badge-${CROSS_ARC}`).data['label']);
    // B-108 finding 1.2 (gate ruling): a blocked cross-layer arc carries C2's
    // REASON in its own ' · blocked: ' segment — never a number for an unroute.
    expect(label).toBe('Misaki Town · train · blocked: Line suspended');
    expect(label).not.toMatch(/· \d+(\.\d+)? [^·]*$/); // no cost segment — the number slot stays empty
    expect(label).not.toContain('∞');
    expect(JSON.stringify(badges)).not.toContain('Infinity');
  });

  it('a fabricated ok:true entry composes total+unit VERBATIM — the builder maps no units of its own (R1/D72)', () => {
    const map = thaw(fuyukiMap);
    const routes = baseRoutes();
    routes.set(CROSS_ARC, { ok: true, total: 4, legs: [], unit: 'km' });
    const badges = buildCrossLayerBadges(map, overlayOf(map), 'layer-fuyuki', routes);
    expect(badgeOf(badges, `tme-badge-${CROSS_ARC}`).data['label']).toBe('Misaki Town · train · 4 km');
  });
});

// ---------------------------------------------------------------------------
// D72's badge-shaped divergence — the snapshot can be 'min' while the badge's
// own findRoute run priced canonical units. Both labels coexist honestly.
// ---------------------------------------------------------------------------

const badgeland = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-badgeland',
  name: 'Badgeland',
  layers: [
    { id: 'L1', name: 'Rivertown' },
    { id: 'L2', name: 'Islefield' },
  ],
  scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' }, // no speeds — geometric arcs are canonical-only
  nodes: [
    { id: 'p', label: 'Pier', kind: 'location', layer: 'L1', position: { x: 0, y: 0 } },
    { id: 's1', label: 'Riverside Terminal', kind: 'hub', layer: 'L1', position: { x: 0, y: 10 } },
    { id: 's2', label: 'Islefield Terminal', kind: 'hub', layer: 'L2', position: { x: 4, y: 10 } },
  ],
  edges: [
    { id: 'e-p-s1', source: 'p', target: 's1', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
    { id: 'e-s1-s2', source: 's1', target: 's2', modes: { walk: { allowed: true } } }, // cross-layer, geometric 4 km
  ],
});

describe('badge currency divergence — snapshot min, badge km, on one map (D65 vs D60, D72, R1)', () => {
  it("the pin's snapshot says 'min' while the badge's own run says 'km' — each labels itself (D72)", () => {
    const map = badgeland();
    const overlay = overlayOf(map, 'p');
    const f = createFacade();
    f.loadMap(map, overlay);
    f.materialize();

    expect(f.getSnapshot().unit).toBe('min'); // D65(a): the pin's only live incident arc prices minutes
    const cross = f.findRoute('s1', 's2');
    expect(cross.ok).toBe(true);
    expect(cross.total).toBe(4);
    expect(cross.unit).toBe('km'); // D60: this run fell back whole to canonical

    const badges = buildCrossLayerBadges(map, overlay, 'L1', facadeRoutes(map, overlay, 'L1'));
    expect(badgeOf(badges, 'tme-badge-e-s1-s2').data['label']).toBe('Islefield Terminal · walk · 4 km');
  });

  it('the pin→far-hub route is honestly ok:false in the snapshot-forced minutes currency — no badge, no mixed total (D65(c), C17)', () => {
    const map = badgeland();
    const overlay = overlayOf(map, 'p');
    const f = createFacade();
    f.loadMap(map, overlay);
    f.materialize();
    // the snapshot drops s2 as a destination (no minutes route), and a UI route
    // pin→s2 interleaves currencies: ok:false, never 5min+4km
    const destinations = f.getSnapshot().destinations.map((d) => d.label);
    expect(destinations).not.toContain('Islefield Terminal');
    const r = f.findRoute('p', 's2');
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain('Infinity');
  });
});

// ---------------------------------------------------------------------------
// crossLayerAnchors semantics — which arcs earn a badge, and which degrade.
// ---------------------------------------------------------------------------

describe('crossLayerAnchors — exactly-one-endpoint rule and degradation (C3, C32 spirit, D61)', () => {
  it('FX1: one anchor per side, pointing across (C3)', () => {
    const map = thaw(fuyukiMap);
    const overlay = overlayOf(map);
    expect(crossLayerAnchors(map, overlay, 'layer-fuyuki')).toEqual([
      { arcId: CROSS_ARC, onLayer: 'fuyuki-station', other: 'misaki-town' },
    ]);
    expect(crossLayerAnchors(map, overlay, 'layer-misaki')).toEqual([
      { arcId: CROSS_ARC, onLayer: 'misaki-town', other: 'fuyuki-station' },
    ]);
  });

  it('same-layer arcs never anchor; an unknown layer id degrades to empty, never throws (C3, C32 spirit)', () => {
    const map = thaw(fuyukiMap);
    const overlay = overlayOf(map);
    const ids = crossLayerAnchors(map, overlay, 'layer-fuyuki').map((a) => a.arcId);
    expect(ids).not.toContain('arc-emiya-residence-shopping-district'); // same-layer — ordinary drawn arc
    expect(crossLayerAnchors(map, overlay, 'layer-no-such')).toEqual([]);
  });

  it('a chat user edge across layers IS an anchor (D61 — overlay user edges project like library arcs)', () => {
    const map = thaw(fuyukiMap);
    const overlay = overlayOf(map);
    overlay.userNodes.push({ id: 'wp-1', label: 'Waypoint', kind: 'waypoint', layer: 'layer-fuyuki', position: { x: 300, y: 300 }, origin: 'user' });
    overlay.userEdges.push({ id: 'we-1', source: 'wp-1', target: 'misaki-town', modes: { walk: { allowed: true } } });
    const anchors = crossLayerAnchors(map, overlay, 'layer-fuyuki').map((a) => a.arcId);
    expect(anchors).toContain('we-1');
    // and it renders a badge with the waypoint's label as destination on the far side
    const badges = buildCrossLayerBadges(map, overlay, 'layer-misaki', new Map());
    expect(badgeOf(badges, 'tme-badge-we-1').data['label']).toBe('Waypoint · walk');
  });

  it('a degenerate edge (endpoint unknown to the node sets) yields NO anchor — degrade, never throw (C32 spirit)', () => {
    const map = thaw(fuyukiMap);
    const overlay = overlayOf(map);
    overlay.userEdges.push({ id: 'we-ghost', source: 'ghost-node', target: 'misaki-town', modes: { walk: { allowed: true } } });
    expect(crossLayerAnchors(map, overlay, 'layer-fuyuki').map((a) => a.arcId)).not.toContain('we-ghost');
  });

  it('a cross-layer arc whose ON-layer endpoint is positionless gets NO badge on that layer — the far side still can (C32 spirit)', () => {
    const map = badgeland();
    const pier = map.nodes.find((n) => n.id === 's1')!;
    delete pier.position; // the L1 anchor host cannot be placed
    const overlay = overlayOf(map, 'p');
    expect(buildCrossLayerBadges(map, overlay, 'L1', new Map())).toEqual([]); // degrade: no badge, no throw
    const far = buildCrossLayerBadges(map, overlay, 'L2', new Map());
    expect(badgeOf(far, 'tme-badge-e-s1-s2').data['label']).toBe('Riverside Terminal · walk');
  });
});

// ---------------------------------------------------------------------------
// Mode-word composition — authored key order, allowed-only (F11 display truth).
// ---------------------------------------------------------------------------

describe('badge mode words — allowed modes only, authored key order (F11, R4)', () => {
  it('a disallowed mode is filtered; ordering follows the authored keys (F11)', () => {
    const map = badgeland();
    const cross = map.edges.find((e) => e.id === 'e-s1-s2')!;
    cross.modes = { car: { allowed: true }, walk: { allowed: true }, train: { allowed: false } };
    const overlay = overlayOf(map, 'p');
    const badges = buildCrossLayerBadges(map, overlay, 'L1', new Map());
    expect(badgeOf(badges, 'tme-badge-e-s1-s2').data['label']).toBe('Islefield Terminal · car, walk');
  });
});

// ---------------------------------------------------------------------------
// R4 — the builders are pure projections: inputs never mutate.
// ---------------------------------------------------------------------------

describe('R4 — badge builders never mutate the live references (R4)', () => {
  it('map and overlay are byte-identical after badge + anchor walks (R4)', () => {
    const map = thaw(fuyukiMap);
    const overlay = overlayOf(map);
    overlay.blocked[CROSS_ARC] = 'Line suspended';
    const before = JSON.stringify([map, overlay]);
    crossLayerAnchors(map, overlay, 'layer-fuyuki');
    crossLayerAnchors(map, overlay, 'layer-misaki');
    buildCrossLayerBadges(map, overlay, 'layer-fuyuki', facadeRoutes(map, overlay, 'layer-fuyuki'));
    buildCrossLayerBadges(map, overlay, 'layer-misaki', new Map());
    expect(JSON.stringify([map, overlay])).toBe(before);
  });
});
