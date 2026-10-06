// tests/verify/p3m2-calibration.spec.ts — Phase 3 M2 gate, verifier suite 1 of 3.
// calibrateScale ("measure this arc") derived from the SPEC, not the code:
//
//   C13  — "unitPerPx = authored distance ÷ pixel length of the arc. Offered
//          when the scale is unset or on demand; an existing scale is never
//          silently overwritten." The formula is re-derived here with the
//          test's own Math.hypot over FX1's authored coordinates — never from
//          the implementation's arithmetic.
//   D44/D45 — a present unit seeds label AND kind (C11's two kinds); an absent
//          one re-measures in the established unit (only unitPerPx moves).
//   C30  — every refusal leaves the map byte-identical, field-precise,
//          collected; a lying runtime `kind` is owned by the clone gate.
//   D75/F45 — the edit is dirty, never stale; the pricing seams serve the
//          SAVED scale until saveMap: an unsaved calibration changes NO price
//          and NO snapshot unit — getSnapshot serves the saved plane until the
//          explicit save re-prices it (the A-015 saved-scale doctrine).
//   C12/C24 — calibration is a scale concern: the measured arc's authored
//          values are never touched; measurement over the merged set (overlay
//          we- arcs and unsaved editor geometry alike — geometry is not
//          runtime binding).
//
// FX1 (data/worlds/fuyuki.ts) is normative. All px lengths below are computed
// by THIS file from FX1's authored positions.
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import { MapValidationError } from '../../src/core/model/validate';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, WorldMapData } from '../../src/core/api';

const fuyuki = (): WorldMapData => JSON.parse(JSON.stringify(fuyukiMap)) as WorldMapData;

const load = (map: WorldMapData, pin: string | null = 'emiya-residence') => {
  const overlay: ChatMapOverlay = {
    mapId: map.id,
    currentLocationId: pin,
    travelMode: 'walk',
    userNodes: [],
    userEdges: [],
    blocked: {}, nodeBlocked: {},
  };
  const f = createFacade();
  f.loadMap(map, overlay);
  f.materialize();
  return { f, map, overlay };
};

const issuesOf = (run: () => void): MapValidationError => {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(MapValidationError);
    return e as MapValidationError;
  }
  throw new Error('expected the command to throw MapValidationError');
};

// FX1 positions, quoted here from the normative fixture (C9: y grows south).
const FX1 = {
  emiya: { x: 100, y: 250 },
  station: { x: 560, y: 260 },
  matou: { x: 60, y: 210 },
  shopping: { x: 190, y: 300 },
  outskirts: { x: 30, y: 360 },
  einzbern: { x: -380, y: 120 },
} as const;

describe('p3m2 calibration — the C13 formula, independently re-derived (C13/D44/D75)', () => {
  it('unitPerPx = authored ÷ hypot(Δx,Δy) on the emiya↔station arc — own math, dirty never stale (C13, D75)', () => {
    const { f, map } = load(fuyuki());
    const px = Math.hypot(FX1.station.x - FX1.emiya.x, FX1.station.y - FX1.emiya.y); // ≈ 460.1087
    f.calibrateScale('arc-emiya-residence-fuyuki-station', 1000);
    expect(map.scale.unitPerPx).toBeCloseTo(1000 / px, 10); // C13 verbatim, test-side derivation
    expect(map.scale.unitLabel).toBe('min'); // D44: no unit ⇒ the established label stands
    expect(map.scale.unitKind).toBe('time'); // C11/D45: kind stands with it
    expect(f.hasUnsavedChanges()).toBe(true); // D75: dirty
    expect(facadeStateOf(f).stale).toBe(false); // D75: NEVER stale — C8's trigger is edit save
    // A second measure on a DIFFERENT arc re-derives from THAT arc's px length:
    // emiya↔matou is hypot(40,40) = 40√2, not the station arc's length (C13).
    f.calibrateScale('arc-emiya-residence-matou-residence', 40);
    expect(map.scale.unitPerPx).toBeCloseTo(40 / (40 * Math.SQRT2), 10);
    expect(map.scale.unitLabel).toBe('min');
  });

  it('unit seeding survives a CROSS-ARC re-measure; a later seed flips both fields (C11/D44/D45)', () => {
    const { f, map } = load(fuyuki());
    // Seed km/distance on emiya↔shopping (hypot(90,50)).
    f.calibrateScale('arc-emiya-residence-shopping-district', 3, { label: 'km', kind: 'distance' });
    expect(map.scale.unitLabel).toBe('km');
    expect(map.scale.unitKind).toBe('distance');
    // Re-measure WITHOUT a unit on a different arc (outskirts↔einzbern,
    // hypot(410,240)): only unitPerPx moves — label and kind stand (D44).
    const pxOutskirtsEinzbern = Math.hypot(
      FX1.einzbern.x - FX1.outskirts.x,
      FX1.einzbern.y - FX1.outskirts.y,
    );
    f.calibrateScale('arc-outskirts-einzbern-castle', 60);
    expect(map.scale.unitPerPx).toBeCloseTo(60 / pxOutskirtsEinzbern, 10);
    expect(map.scale.unitLabel).toBe('km');
    expect(map.scale.unitKind).toBe('distance');
    // A later seed may flip to the OTHER kind (C11: distance OR time — D45).
    f.calibrateScale('arc-emiya-residence-matou-residence', 90, { label: 'min', kind: 'time' });
    expect(map.scale.unitLabel).toBe('min');
    expect(map.scale.unitKind).toBe('time');
    expect(map.scale.unitPerPx).toBeCloseTo(90 / (40 * Math.SQRT2), 10);
  });

  it('calibration never touches the measured arc: authoredDistance AND authoredMinutes byte-identical (C13/D14, C24)', () => {
    const { f, map } = load(fuyuki());
    const arc = map.edges.find((e) => e.id === 'arc-emiya-residence-shopping-district')!;
    arc.authoredDistance = 42; // host-edit simulation (C24): the arc carries both override kinds
    const before = JSON.stringify(arc);
    f.calibrateScale('arc-emiya-residence-shopping-district', 100);
    expect(JSON.stringify(arc)).toBe(before); // the arc object untouched — calibration writes ONLY scale
    expect(arc.authoredDistance).toBe(42);
    expect(arc.modes.walk?.authoredMinutes).toBe(12); // FX1's authored time, byte-identical
    const px = Math.hypot(FX1.shopping.x - FX1.emiya.x, FX1.shopping.y - FX1.emiya.y);
    expect(map.scale.unitPerPx).toBeCloseTo(100 / px, 10);
  });

  it('an UNSAVED editor node endpoint is measurable — geometry is not runtime binding (C24/D75, A-015 doctrine)', () => {
    const { f, map } = load(fuyuki());
    f.upsertNode({
      id: '', label: 'Ghost Yard', kind: 'location', layer: 'layer-fuyuki', position: { x: 1000, y: 1000 },
    });
    const ghostId = map.nodes[map.nodes.length - 1].id;
    f.upsertEdge({ id: '', source: 'outskirts', target: ghostId, modes: { walk: { allowed: true } } });
    const arcId = map.edges[map.edges.length - 1].id;
    // outskirts(30,360) ↔ (1000,1000): hypot(970, 640) — the unsaved endpoint
    // does NOT refuse measurement (unlike the A-014-gated runtime commands):
    // the scale is a library property and the pixel length is pure geometry.
    f.calibrateScale(arcId, 1610);
    const px = Math.hypot(1000 - FX1.outskirts.x, 1000 - FX1.outskirts.y);
    expect(map.scale.unitPerPx).toBeCloseTo(1610 / px, 10);
    expect(f.hasUnsavedChanges()).toBe(true);
  });
});

describe('p3m2 calibration — C30 refusals the M2 suites did not pin (C30/D75)', () => {
  it('a lying unit.kind is refused by the C30 clone gate with the field-precise scale.unitKind path', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    const err = issuesOf(() =>
      // A runtime caller can lie about the typed union (F50 precedent).
      f.calibrateScale('arc-emiya-residence-matou-residence', 5, {
        label: 'km',
        kind: 'bogus' as unknown as 'distance',
      }),
    );
    expect(err.issues.some((i) => i.path === 'scale.unitKind')).toBe(true);
    expect(JSON.stringify([map, overlay])).toBe(before); // byte-identical (C30)
    expect(f.hasUnsavedChanges()).toBe(false); // a refusal never flips dirty (D75)
  });

  it('a refusal after an accepted calibration keeps the earlier edit dirty and the earlier value intact (C30/D75)', () => {
    const { f, map } = load(fuyuki());
    f.calibrateScale('arc-emiya-residence-matou-residence', 40); // accepted → dirty, unitPerPx ≈ 1/√2
    expect(f.hasUnsavedChanges()).toBe(true);
    const good = map.scale.unitPerPx;
    expect(() => f.calibrateScale('arc-emiya-residence-fuyuki-station', 0)).toThrow(
      /authoredDistance must be a finite number > 0/,
    );
    expect(f.hasUnsavedChanges()).toBe(true); // still dirty from the ACCEPTED edit
    expect(map.scale.unitPerPx).toBe(good); // the refused call moved nothing
  });
});

describe('p3m2 calibration — the saved-scale SNAPSHOT seam (D75/F45/C8, A-015 doctrine)', () => {
  it('an unsaved calibration changes NO snapshot unit and NO snapshot cost; a minutes-currency snapshot never relabels (F45/D75/D72)', () => {
    const { f, map, overlay } = load(fuyuki()); // pin at emiya — the C19 list is live
    const saved0 = f.getSnapshot();
    expect(saved0.routes.length).toBeGreaterThan(0);
    expect(saved0.unit).toBe('min'); // FX1's canonical label (D45 time-kind shape)

    // Calibrate with a unit seed that flips the LIVE scale's label —
    // the pricing seams must not move: byte-identical snapshot.
    f.calibrateScale('arc-emiya-residence-matou-residence', 3, { label: 'km', kind: 'distance' });
    expect(map.scale.unitLabel).toBe('km'); // the editor draft (C24 in place)
    expect(facadeStateOf(f).savedScale!.unitLabel).toBe('min'); // the SAVED plane did not move
    const saved1 = f.getSnapshot();
    expect(JSON.stringify(saved1)).toBe(JSON.stringify(saved0)); // byte-identical snapshot (F45/D75)
    expect(saved1.unit).toBe('min');

    f.saveMap(); // the explicit save moves the saved plane (C8 edit save)
    const saved2 = f.getSnapshot();
    // At this pin EVERY live incident arc is authored-minutes (C14 row 3), so
    // the routes currency is MINUTES (D65(a)) and the unit is the minutes
    // label 'min' (D72) — a calibration's unitLabel flip must NOT leak into a
    // minutes-currency snapshot. FX1's costs are unchanged with it: authored
    // minutes are scale-independent.
    expect(saved2.unit).toBe('min');
    expect(JSON.stringify(saved2.routes)).toBe(JSON.stringify(saved0.routes));
  });

  it('a CANONICAL snapshot serves the SAVED unitLabel until saveMap, then relabels (F45/D75/D65(a)/D72)', () => {
    // One authored-minutes arc + one geometric registry arc at the pin ⇒ the
    // routes currency is CANONICAL (the geometric arc cannot price minutes —
    // D65(a)) ⇒ the unit label is scale.unitLabel, read from the SAVED scale.
    const map: WorldMapData = {
      schemaVersion: 2,
      id: 'map-p3m2-calseam',
      name: 'Calibration Seam',
      layers: [{ id: 'layer-cs', name: 'CS' }],
      scale: { unitPerPx: 1, unitLabel: 'min', unitKind: 'time' },
      nodes: [
        { id: 'a', label: 'Alpha', kind: 'location', layer: 'layer-cs', position: { x: 0, y: 0 } },
        { id: 'b', label: 'Bravo', kind: 'location', layer: 'layer-cs', position: { x: 0, y: 30 } },
        { id: 'c', label: 'Charlie', kind: 'location', layer: 'layer-cs', position: { x: 0, y: 100 } },
      ],
      edges: [
        { id: 'e-ab', source: 'a', target: 'b', modes: { walk: { allowed: true, authoredMinutes: 12 } } },
        { id: 'e-ac', source: 'a', target: 'c', modes: { horse: { allowed: true } } }, // geometric: 100 px × unitPerPx
      ],
      modes: [{ id: 'horse', label: 'Horseback', allowedByDefault: false }],
    };
    const { f, map: live } = load(map, 'a');
    expect(f.getSnapshot().unit).toBe('min'); // the saved label (canonical currency)
    const routes0 = f.getSnapshot().routes;

    // Unsaved calibration flips the label and the scale — the snapshot must
    // serve the SAVED plane whole (label AND the geometric arc's price).
    f.calibrateScale('e-ac', 200, { label: 'km', kind: 'distance' }); // 200 units ÷ 100 px = 2 unitPerPx
    expect(live.scale.unitLabel).toBe('km');
    const saved1 = f.getSnapshot();
    expect(saved1.unit).toBe('min'); // the SAVED label
    expect(JSON.stringify(saved1.routes)).toBe(JSON.stringify(routes0)); // byte-identical prices (F45/D75)

    f.saveMap();
    const saved2 = f.getSnapshot();
    expect(saved2.unit).toBe('km'); // re-labeled from the saved plane (D72)
    const charlie = saved2.routes.find((r) => r.label === 'Charlie');
    expect(charlie?.cost).toBeCloseTo(200, 8); // re-priced: 100 px × 2 unitPerPx (C14 row 5)
    expect(charlie?.mode).toBe('Horseback'); // C23 — the resolved word, never the id
    // The unitKind flip has a REAL consequence (C15/D65(a)'s own example): on
    // a distance-kind scale the authored-minutes arc cannot honestly price in
    // the canonical (km) list and DROPS — pre-save it listed at face value 12
    // under the min-scale honest read. The drop is the pin.
    expect(saved2.routes.find((r) => r.label === 'Bravo')).toBeUndefined();
    // …while pre-save BOTH arcs listed under the saved 'min' label:
    expect(routes0.find((r) => r.label === 'Bravo')?.cost).toBe(12);
    expect(routes0.find((r) => r.label === 'Charlie')?.cost).toBeCloseTo(100, 8); // 100 px × 1
  });
});

// Lead triage of the P3 M2 verifier's hardening finding (minor): a JS caller
// can lie past the typed optional — a non-object `unit` (null included) must
// refuse field-precisely (C30, the setStatusNote/setBlocked runtime-guard
// discipline), never crash with a TypeError. The fix is in facade.ts's unit
// guard; this cell pins it.
describe('p3m2 calibration — non-object unit refuses field-precisely (C30, verifier hardening follow-up)', () => {
  it('a null / non-object unit argument is a field-precise refusal, not a TypeError — state untouched, dirty untouched', () => {
    const { f, map, overlay } = load(fuyuki());
    const before = JSON.stringify([map, overlay]);
    for (const badUnit of [null, 5, 'km', true]) {
      expect(() =>
        f.calibrateScale(
          'arc-emiya-residence-matou-residence',
          5,
          badUnit as unknown as { label: string; kind: 'distance' | 'time' },
        ),
      ).toThrow('[TravelMapper] calibrateScale: unit.label must be a non-empty string');
    }
    expect(JSON.stringify([map, overlay])).toBe(before); // C30 — nothing mutated
    expect(f.hasUnsavedChanges()).toBe(false); // a refusal never flips dirty (D75)
    expect(map.scale.unitLabel).toBe('min'); // FX1's established label stands
  });
});
