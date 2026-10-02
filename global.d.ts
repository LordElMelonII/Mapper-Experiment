// global.d.ts — host declarations for src/st/** (D4/D5).
// The host surface is used ONLY as `window.SillyTavern` (D4).
//
// Narrowed in C-001 against the LOCAL SillyTavern 1.19.0 source, never memory:
//   - public/script.js:293            globalThis.SillyTavern = { libs, getContext }
//   - public/scripts/st-context.js:115  getContext() returns { eventSource, eventTypes, ... }
//   - public/scripts/events.js:3-5    event_types.APP_READY === 'app_ready'
//   - public/lib/eventemitter.js:43   eventSource.on(event, listener)
// Only members src/st actually calls are typed; everything else stays unknown.
// Extend further ONLY when a member is verified against the local source again.

export {};

declare global {
  /**
   * The slice of SillyTavern's getContext() that src/st uses today.
   * Kept deliberately tiny: event source + event name table.
   */
  interface StHostContext {
    eventSource: {
      /** Local EventEmitter; APP_READY replays to late subscribers (autoFireAfterEmit). */
      on(event: string, listener: (args: unknown[]) => unknown): void;
    };
    eventTypes: Readonly<Record<string, string>>; // e.g. APP_READY: 'app_ready'
  }

  interface Window {
    SillyTavern?: {
      getContext?(): StHostContext;
      libs?: Record<string, unknown>; // e.g. Handlebars, localforage, lodash (verified in src/st usage later)
    };
  }
}
