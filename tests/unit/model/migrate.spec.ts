// Unit tests for schema migration mechanics (A-001) — C31, F50.
// The default migration table is EMPTY at M1 (no real v1 data exists); the
// synthetic steps registered here prove the version-refusal and step-application
// mechanics only. Every refusal throws — data is never half-loaded (F50).
import { describe, expect, it } from 'vitest';
import { MapValidationError } from '../../../src/core/model/validate';
import { migrateWorldMap } from '../../../src/core/model/migrate';
import type { MigrationStep } from '../../../src/core/model/migrate';
import type { WorldMapData } from '../../../src/core/api';

const validMap = (): WorldMapData => ({
  schemaVersion: 2,
  id: 'map-demo',
  name: 'Two-Town Demo',
  layers: [{ id: 'layer-world', name: 'World' }],
  scale: { unitPerPx: 0.05, unitLabel: 'km', unitKind: 'distance' },
  nodes: [],
  edges: [],
});

/** A synthetic "v1" document: v2-shaped except schemaVersion 1 and a `mapName` field. */
const v1Doc = (): any => {
  const m = JSON.parse(JSON.stringify(validMap())) as any;
  m.schemaVersion = 1;
  delete m.name;
  m.mapName = 'Old Map';
  return m;
};

function refusal(data: unknown, migrations?: Record<number, MigrationStep>): MapValidationError {
  try {
    migrateWorldMap(data, migrations);
  } catch (e) {
    expect(e).toBeInstanceOf(MapValidationError);
    return e as MapValidationError;
  }
  throw new Error('expected migrateWorldMap to refuse this data');
}

describe('migrateWorldMap', () => {
  it('passes a current-version map straight through to validation (C31)', () => {
    const map = validMap();
    expect(migrateWorldMap(map)).toEqual(map);
  });

  it('still validates current-version data — a broken v2 map is refused (F50)', () => {
    const bad = JSON.parse(JSON.stringify(validMap())) as any;
    bad.name = '';
    expect(() => migrateWorldMap(bad)).toThrow(MapValidationError);
  });

  it('refuses data newer than the supported schema version, with a clear message (C31)', () => {
    const future = JSON.parse(JSON.stringify(validMap())) as any;
    future.schemaVersion = 3;
    const err = refusal(future);
    expect(err.issues).toHaveLength(1);
    expect(err.issues[0].path).toBe('schemaVersion');
    // the field-precise text lives in the issue (C30); err.message only summarizes
    expect(err.issues[0].message).toContain('unsupported schema version 3');
  });

  it('migrates a known-older version through a registered step, then validates (C31)', () => {
    const step: MigrationStep = (d) => {
      const { mapName, ...rest } = d;
      return { ...rest, schemaVersion: 2, name: mapName };
    };
    const migrated = migrateWorldMap(v1Doc(), { 1: step });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.name).toBe('Old Map');
  });

  it('refuses a known-older version when no step is registered (C31)', () => {
    const err = refusal(v1Doc());
    expect(err.issues[0].path).toBe('schemaVersion');
    expect(err.issues[0].message).toContain('no migration step registered for 1 -> 2');
  });

  it('applies registered steps in ascending order, one per version (C31)', () => {
    const calls: number[] = [];
    const doc = v1Doc();
    doc.schemaVersion = 0;
    doc.mapLabel = doc.mapName;
    delete doc.mapName;
    const steps: Record<number, MigrationStep> = {
      0: (d) => {
        calls.push(0);
        return { ...d, schemaVersion: 1, mapName: d.mapLabel };
      },
      1: (d) => {
        calls.push(1);
        const { mapName, ...rest } = d;
        return { ...rest, schemaVersion: 2, name: mapName };
      },
    };
    const migrated = migrateWorldMap(doc, steps);
    expect(calls).toEqual([0, 1]);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.name).toBe('Old Map');
  });

  it('refuses data with a missing or non-integer schemaVersion (C31)', () => {
    const missing = JSON.parse(JSON.stringify(validMap())) as any;
    delete missing.schemaVersion;
    expect(refusal(missing).issues[0].path).toBe('schemaVersion');
    expect(refusal({ ...validMap(), schemaVersion: '2' } as any).issues[0].path).toBe('schemaVersion');
  });

  it('refuses non-object input (C31/F50)', () => {
    for (const bad of [null, 42, 'map', [], true]) {
      expect(() => migrateWorldMap(bad)).toThrow(MapValidationError);
    }
  });
});
