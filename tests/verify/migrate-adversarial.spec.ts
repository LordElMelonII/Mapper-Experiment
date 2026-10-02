// VERIFIER (Agent D) — adversarial migration mechanics: C31, F50.
// The default table is empty at M1 (no real v1 exists), so synthetic steps
// prove the mechanics: ascending order, one step per version, refusal shapes,
// and the validate → migrate → loadMap seam (a migrated document must actually
// load and materialize through the facade).
import { describe, expect, it } from 'vitest';
import { MapValidationError } from '../../src/core/model/validate';
import { migrateWorldMap } from '../../src/core/model/migrate';
import type { MigrationStep } from '../../src/core/model/migrate';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import type { ChatMapOverlay } from '../../src/core/api';

const overlayFor = (mapId: string): ChatMapOverlay => ({
  mapId,
  currentLocationId: 'n-emiya',
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {},
});

/** A v1 document: v2-shaped except schemaVersion 1 and legacy field names. */
const v1Doc = (): any => ({
  schemaVersion: 1,
  id: 'map-old',
  mapName: 'Old Map',
  layers: [{ id: 'layer-city', name: 'Fuyuki City' }],
  scale: { unitPerPx: 0.2, unitLabel: 'min', unitKind: 'time' },
  nodes: [
    { id: 'n-emiya', label: 'Emiya Residence', kind: 'location', layer: 'layer-city', position: { x: 10, y: 20 } },
    { id: 'n-station', label: 'Fuyuki Station', kind: 'hub', layer: 'layer-city', position: { x: 80, y: 20 } },
  ],
  edges: [
    { id: 'e-walk', source: 'n-emiya', target: 'n-station', modes: { walk: { allowed: true, authoredMinutes: 50 } } },
  ],
});

describe('C31 — one step per version, only the versions needed (F50)', () => {
  it('runs ONLY the steps between the data version and CURRENT — registered steps below the data version are never invoked', () => {
    const calls: number[] = [];
    const steps: Record<number, MigrationStep> = {
      0: (d) => {
        calls.push(0);
        return { ...d, schemaVersion: 1 };
      },
      1: (d) => {
        calls.push(1);
        const { mapName, ...rest } = d;
        return { ...rest, schemaVersion: 2, name: mapName };
      },
    };
    const migrated = migrateWorldMap(v1Doc(), steps); // data is v1: only step 1 may run
    expect(calls).toEqual([1]);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.name).toBe('Old Map');
  });

  it('a step that fails to bump schemaVersion yields a VALIDATION refusal — never half-migrated data (F50)', () => {
    const steps: Record<number, MigrationStep> = {
      1: (d) => ({ ...d }), // forgets schemaVersion: 2
    };
    let err: unknown = null;
    try {
      migrateWorldMap(v1Doc(), steps);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MapValidationError);
    const issues = (err as MapValidationError).issues;
    expect(issues.some((i) => i.path === 'schemaVersion')).toBe(true);
  });

  it('steps chain: each step receives the PREVIOUS step output, and the final result is re-validated', () => {
    const seen: unknown[] = [];
    const steps: Record<number, MigrationStep> = {
      1: (d) => {
        seen.push(JSON.parse(JSON.stringify(d)));
        return { ...d, schemaVersion: 2, name: d.mapName };
      },
    };
    const migrated = migrateWorldMap(v1Doc(), steps);
    expect((seen[0] as { schemaVersion: number }).schemaVersion).toBe(1);
    expect(migrated.nodes).toHaveLength(2);
    expect(migrated.edges).toHaveLength(1);
  });
});

// --- the seam: migrate → facade loadMap → materialize -----------------------------

describe('C31/F50 seam — a migrated document actually loads and materializes', () => {
  it('migrateWorldMap output passes loadMap validation and materializes into the merged graph (C8)', () => {
    const steps: Record<number, MigrationStep> = {
      1: (d) => {
        const { mapName, ...rest } = d;
        return { ...rest, schemaVersion: 2, name: mapName };
      },
    };
    const migrated = migrateWorldMap(v1Doc(), steps);

    const f = createFacade();
    expect(() => f.loadMap(migrated, overlayFor('map-old'))).not.toThrow();
    f.materialize();

    const eff = facadeStateOf(f).effective;
    expect(eff).not.toBeNull();
    expect(eff!.mapId).toBe('map-old');
    expect(eff!.nodes.map((n) => n.id)).toEqual(['n-emiya', 'n-station']);
    expect(eff!.edges.map((e) => e.id)).toEqual(['e-walk']);
    expect(eff!.pin).toEqual({ id: 'n-emiya', valid: true });
  });
});
