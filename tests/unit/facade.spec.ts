// Facade surface test: the frozen contract compiles and the facade exposes
// exactly the CORE.md §9 command list (R2). A-002 implemented the seven M1
// commands; A-006 implemented findRoute + setBlocked (M2); A-007 implemented
// the waypoint commands (M2); A-008 implemented setCorrective + getSnapshot
// (M3); every remaining stub still throws its exact TODO marker — no fake
// data. The surface test below stays verbatim from Task 0.
import { describe, expect, it } from 'vitest';
import { createFacade } from '../../src/core/facade';
import type { MapFacade } from '../../src/core/facade';

const FACADE_COMMANDS: (keyof MapFacade)[] = [
  // Map lifecycle
  'loadMap', 'materialize', 'forkMap', 'saveForkToLibrary', 'validateImport', 'migrateData',
  // Presence
  'setCurrentLocation', 'setStatusNote', 'setTravelMode', 'setCorrective',
  // Overlay edits
  'setBlocked', 'addUserNodeAt', 'removeUserNode', 'promoteUserNode',
  // Editor commands
  'upsertNode', 'upsertEdge', 'removeNode', 'removeEdge', 'calibrateScale', 'saveMap',
  // Queries
  'findRoute', 'getSnapshot', 'renderTemplate', 'getPromptBlock',
  // Viewer state
  'setActiveLayer',
];

// Commands still on the TODO path after A-002, each with the milestone whose
// packet must implement it. forkMap / saveForkToLibrary were relabeled from M1
// to Phase 3 M4 (D56 — forks have no consumer before then).
const UNIMPLEMENTED: readonly (readonly [keyof MapFacade, string])[] = [
  ['forkMap', 'Phase 3 M4'],
  ['saveForkToLibrary', 'Phase 3 M4'],
  ['upsertNode', 'Phase 3'],
  ['upsertEdge', 'Phase 3'],
  ['removeNode', 'Phase 3'],
  ['removeEdge', 'Phase 3'],
  ['calibrateScale', 'Phase 3'],
  ['saveMap', 'Phase 3'],
  ['renderTemplate', 'M3'],
  ['getPromptBlock', 'M3'],
  ['setActiveLayer', 'Phase 2'],
];

// The seven commands A-002 implemented — gone from the TODO list above.
const M1_COMMANDS = [
  'loadMap', 'materialize', 'validateImport', 'migrateData',
  'setCurrentLocation', 'setStatusNote', 'setTravelMode',
] as const;

// The two commands A-006 implemented — gone from the TODO list above.
const M2_COMMANDS = ['setBlocked', 'findRoute'] as const;

// The three commands A-007 implemented — gone from the TODO list above.
const M2_WAYPOINT_COMMANDS = ['addUserNodeAt', 'removeUserNode', 'promoteUserNode'] as const;

// The two commands A-008 implemented — gone from the TODO list above.
const M3_SNAPSHOT_COMMANDS = ['setCorrective', 'getSnapshot'] as const;

describe('facade stub (Task 0)', () => {
  it('exposes exactly the CORE.md §9 command surface', () => {
    const facade = createFacade();
    const keys = Object.keys(facade).sort();
    expect(keys).toEqual([...FACADE_COMMANDS].sort());
  });

  it('every still-unimplemented command throws its exact TODO marker — no fake data', () => {
    const facade = createFacade();
    for (const [command, milestone] of UNIMPLEMENTED) {
      const fn = facade[command] as () => unknown;
      expect(() => fn(), command).toThrow(`TODO(${milestone})`);
    }
  });

  it('the seven M1 commands no longer throw a TODO (A-002)', () => {
    const facade = createFacade();
    for (const command of M1_COMMANDS) {
      const fn = facade[command] as () => unknown;
      expect(() => fn(), command).not.toThrow(/^TODO\(/);
    }
  });

  it('the two M2 commands no longer throw a TODO (A-006)', () => {
    const facade = createFacade();
    for (const command of M2_COMMANDS) {
      const fn = facade[command] as () => unknown;
      expect(() => fn(), command).not.toThrow(/^TODO\(/);
    }
  });

  it('the three waypoint commands no longer throw a TODO (A-007)', () => {
    const facade = createFacade();
    for (const command of M2_WAYPOINT_COMMANDS) {
      const fn = facade[command] as () => unknown;
      expect(() => fn(), command).not.toThrow(/^TODO\(/);
    }
  });

  it('the two M3 snapshot commands no longer throw a TODO (A-008)', () => {
    const facade = createFacade();
    for (const command of M3_SNAPSHOT_COMMANDS) {
      const fn = facade[command] as () => unknown;
      expect(() => fn(), command).not.toThrow(/^TODO\(/);
    }
  });
});
