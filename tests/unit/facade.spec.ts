// Task 0 smoke test: the frozen contract compiles and the facade stub surface
// is complete per CORE.md §9. Phase 1 packets replace the throwing stubs with
// real implementations; this file pins the facade shape (R2).
import { describe, expect, it } from 'vitest';
import { createFacade } from '../../src/core/facade';
import type { MapFacade } from '../../src/core/facade';

const FACADE_COMMANDS: (keyof MapFacade)[] = [
  // Map lifecycle
  'loadMap', 'materialize', 'forkMap', 'saveForkToLibrary', 'validateImport', 'migrateData',
  // Presence
  'setCurrentLocation', 'setStatusNote', 'setTravelMode',
  // Overlay edits
  'setBlocked', 'addUserNodeAt', 'removeUserNode', 'promoteUserNode',
  // Editor commands
  'upsertNode', 'upsertEdge', 'removeNode', 'removeEdge', 'calibrateScale', 'saveMap',
  // Queries
  'findRoute', 'getSnapshot', 'renderTemplate', 'getPromptBlock',
  // Viewer state
  'setActiveLayer',
];

describe('facade stub (Task 0)', () => {
  it('exposes exactly the CORE.md §9 command surface', () => {
    const facade = createFacade();
    const keys = Object.keys(facade).sort();
    expect(keys).toEqual([...FACADE_COMMANDS].sort());
  });

  it('every stub throws an explicit TODO — no fake data (Task 0 rule)', () => {
    const facade = createFacade();
    for (const command of FACADE_COMMANDS) {
      // each stub is a zero-arg-invocable thrower for this check
      const fn = facade[command] as () => unknown;
      expect(() => fn()).toThrow(/^TODO\(/);
    }
  });
});
