// Facade surface test: the frozen contract compiles and the facade exposes
// exactly the CORE.md §9 command list (R2). A-002 implemented the seven M1
// commands; A-006 implemented findRoute + setBlocked (M2); A-007 implemented
// the waypoint commands (M2); A-008 implemented setCorrective + getSnapshot
// (M3); A-009 implemented renderTemplate + getPromptBlock (M3); A-013
// implemented the editor commands upsertNode/upsertEdge/removeNode/removeEdge
// + saveMap and the additive hasUnsavedChanges (D75); A-015 implemented
// calibrateScale (C13/D44/D45); every
// remaining stub still throws its exact TODO marker — no fake
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
  'upsertNode', 'upsertEdge', 'removeNode', 'removeEdge', 'calibrateScale', 'saveMap', 'hasUnsavedChanges', // D75: additive §9 extension
  // Layer commands
  'upsertLayer', 'removeLayer', 'reorderLayers', 'layerRemovalImpact', 'detachNode', 'setNodeLayer', 'setLayerBackground', 'setPortal', // D82–D85 (A-017)
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

// The two commands A-009 implemented — gone from the TODO list above.
const M3_RENDER_COMMANDS = ['renderTemplate', 'getPromptBlock'] as const;

// The one viewer-state command the Phase 2 M1 packet implemented — gone from
// the TODO list above.
const P2_M1_COMMANDS = ['setActiveLayer'] as const;

// The editor commands the Phase 3 packets implemented — gone from the TODO
// list above. hasUnsavedChanges is the D75 additive §9 extension;
// calibrateScale is A-015 (C13/D44/D45, "measure this arc").
const P3_EDITOR_COMMANDS = [
  'upsertNode', 'upsertEdge', 'removeNode', 'removeEdge', 'calibrateScale', 'saveMap', 'hasUnsavedChanges',
] as const;

// The layer commands the Phase 3 M3 packet implemented (A-017, D82–D85) —
// the CORE.md §9 Layer-commands line, landed with that packet.
const P3_M3_LAYER_COMMANDS = [
  'upsertLayer', 'removeLayer', 'reorderLayers', 'layerRemovalImpact', 'detachNode',
  'setNodeLayer', 'setLayerBackground', 'setPortal',
] as const;

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

  it('the two M3 render commands no longer throw a TODO (A-009)', () => {
    const facade = createFacade();
    for (const command of M3_RENDER_COMMANDS) {
      const fn = facade[command] as () => unknown;
      expect(() => fn(), command).not.toThrow(/^TODO\(/);
    }
  });

  it('the viewer-state command no longer throws a TODO (P2 M1)', () => {
    const facade = createFacade();
    for (const command of P2_M1_COMMANDS) {
      const fn = facade[command] as () => unknown;
      expect(() => fn(), command).not.toThrow(/^TODO\(/);
    }
  });

  it('the editor commands no longer throw a TODO (A-013/A-015, D75)', () => {
    const facade = createFacade();
    for (const command of P3_EDITOR_COMMANDS) {
      const fn = facade[command] as () => unknown;
      expect(() => fn(), command).not.toThrow(/^TODO\(/);
    }
  });

  it('the layer commands no longer throw a TODO (A-017, D82–D85)', () => {
    const facade = createFacade();
    for (const command of P3_M3_LAYER_COMMANDS) {
      const fn = facade[command] as () => unknown;
      expect(() => fn(), command).not.toThrow(/^TODO\(/);
    }
  });
});
