// Unit tests for RouteResult.unit (PKG A-011, D72): the findRoute currency
// label — verbatim the rule MapSnapshot.unit already follows
// (snapshot/build.ts): 'min' when the computation priced minutes, else
// scale.unitLabel (C15/D60). One describe per branch: a minutes run, the
// canonical fallback, route-to-self (D65 empty-set precedent), and ok:false
// (the last attempted run's label; no costs presented — F24/C17).
import { describe, expect, it } from 'vitest';
import { createFacade } from '../../../src/core/facade';
import { fuyukiMap } from '../../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../../src/core/api';

// C24: the facade keeps the loaded reference — thaw a fresh clone of the
// deep-frozen FX1 fixture so suites never interact.
const loadFuyuki = () => {
  const map = JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;
  const overlay: ChatMapOverlay = {
    mapId: map.id,
    currentLocationId: 'emiya-residence',
    travelMode: 'walk',
    userNodes: [],
    userEdges: [],
    blocked: {}, nodeBlocked: {},
  };
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return f;
};

// Inline map whose canonical unit is distance ('km') — the established
// inline-literal pattern (m2 suites). Arcs are supplied per test; a plain
// walk arc (no authoredMinutes, no speeds in scale) prices geometric-only.
const loadInline = (edges: WorldMapData['edges']) => {
  const map: WorldMapData = {
    schemaVersion: 2,
    id: 'map-unit',
    name: 'Unit Label',
    layers: [{ id: 'layer-u', name: 'U' }],
    scale: { unitPerPx: 1, unitLabel: 'km', unitKind: 'distance' },
    nodes: [
      { id: 'a', label: 'Alpha', kind: 'location', layer: 'layer-u', position: { x: 0, y: 0 } },
      { id: 'b', label: 'Beta', kind: 'location', layer: 'layer-u', position: { x: 10, y: 0 } },
      { id: 'c', label: 'Gamma', kind: 'location', layer: 'layer-u', position: { x: 100, y: 0 } },
      { id: 'd', label: 'Delta', kind: 'location', layer: 'layer-u', position: { x: 110, y: 0 } },
    ],
    edges,
  };
  const f = createFacade();
  f.loadMap(map, { mapId: map.id, currentLocationId: 'a', travelMode: 'walk', userNodes: [], userEdges: [], blocked: {}, nodeBlocked: {} });
  f.materialize();
  return f;
};

describe('D72 — a minutes run labels unit min (FX1, C15/D60)', () => {
  it("an authored-minutes route (emiya-residence → fuyuki-station, FX1) carries unit 'min'", () => {
    const r = loadFuyuki().findRoute('emiya-residence', 'fuyuki-station'); // FX2 leg 1: walk authoredMinutes 50
    expect(r.ok).toBe(true);
    expect(r.total).toBe(50); // minutes priced — authored time wins (D14)
    expect(r.unit).toBe('min'); // D72: the computation priced minutes (C15/D60 minutes-first)
  });
});

describe('D72 — a canonical run labels scale.unitLabel (C15/D60)', () => {
  it("a geometric-only route on a 'km' map carries unit 'km'", () => {
    const f = loadInline([{ id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true } } }]);
    const r = f.findRoute('a', 'b'); // no authoredMinutes, no speeds ⇒ no minutes route exists
    expect(r.ok).toBe(true);
    expect(r.total).toBe(10); // 10 px × 1 unitPerPx — canonical (D60 fallback run)
    expect(r.unit).toBe('km'); // D72: the whole computation re-ran in canonical units (C15/D60)
  });
});

describe('D72 — route-to-self labels canonical (D65 empty-set precedent)', () => {
  it('from === to presents no costs, so unit is scale.unitLabel even when a minutes run would price min', () => {
    // The corridor IS minutes-priced (authoredMinutes 7), so a leaked minutes
    // preference would read 'min' — but no run happened at all.
    const f = loadInline([{ id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true, authoredMinutes: 7 } } }]);
    const r = f.findRoute('a', 'a');
    expect(r).toEqual({ ok: true, total: 0, legs: [], unit: 'km' }); // §6.2 shape + the D65 canonical label
  });
});

describe('D72 — ok:false carries the last attempted run label and no costs (C17/F24)', () => {
  it("a disconnected pair on a 'km' map: unit 'km', total 0, legs empty, ∞ nowhere", () => {
    const f = loadInline([
      { id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true } } },
      { id: 'e-cd', source: 'c', target: 'd', modes: { walk: { allowed: true } } },
    ]);
    const r = f.findRoute('a', 'd'); // two islands — the minutes run failed, the canonical run failed
    expect(r.ok).toBe(false);
    expect(r.unit).toBe('km'); // D72: the LAST attempted run's label (D60's fallback ran canonical)
    expect(r.total).toBe(0); // F24/C17: no cost is presented
    expect(r.legs).toEqual([]); // F24/C17
    expect(r.reason).toMatch(/no path connects/); // C17/F24: a human reason, never a raw infinity
    expect(JSON.stringify(r)).not.toContain('Infinity'); // C17
  });
});
