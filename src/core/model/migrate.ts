// src/core/model/migrate.ts — versioned migration mechanics (C31, F50).
//
// One migration step per version, applied in ascending order; an unknown
// NEWER schema version is refused with a clear message; data is never
// half-loaded (every refusal throws before anything is returned).
// The default table is EMPTY at M1 — no real v1 data exists; the optional
// `migrations` parameter lets tests (and future real steps) prove the mechanics.
// Refusals reuse MapValidationError (single issue, path 'schemaVersion') so the
// facade's loadMap/migrateData commands have one error type to catch and toast.

import { CURRENT_SCHEMA_VERSION, MapValidationError, validateWorldMap } from './validate';
import type { WorldMapData } from '../api';

/** A single migration step: transforms schema version v data into v+1 data. */
export type MigrationStep = (data: any) => any;

/**
 * Migrate + validate a world map (C31, F50):
 *  - non-object input or missing/non-integer `schemaVersion` -> refuse;
 *  - version > CURRENT_SCHEMA_VERSION -> refuse with a clear message;
 *  - version === CURRENT -> validateWorldMap and return;
 *  - version < CURRENT -> apply registered steps v -> v+1 in ascending order
 *    (a missing step refuses), then validate.
 * Never mutates `data`; never returns partially migrated data.
 */
export function migrateWorldMap(data: unknown, migrations: Record<number, MigrationStep> = {}): WorldMapData {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new MapValidationError([{ path: '', message: 'map data must be a JSON object' }]);
  }
  const doc = data as Record<string, unknown>;

  const version = doc['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new MapValidationError([{
      path: 'schemaVersion',
      message: version === undefined
        ? 'missing schemaVersion — expected an integer schema version'
        : `schemaVersion must be an integer (found: ${typeof version} ${String(version)})`,
    }]);
  }

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new MapValidationError([{
      path: 'schemaVersion',
      message: `unsupported schema version ${version}: newer than the supported version ${CURRENT_SCHEMA_VERSION}`,
    }]);
  }

  if (version === CURRENT_SCHEMA_VERSION) {
    return validateWorldMap(data);
  }

  let current: unknown = data;
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = migrations[v];
    if (typeof step !== 'function') {
      throw new MapValidationError([{
        path: 'schemaVersion',
        message: `cannot migrate schema version ${v}: no migration step registered for ${v} -> ${v + 1}`,
      }]);
    }
    current = step(current);
  }
  return validateWorldMap(current);
}
