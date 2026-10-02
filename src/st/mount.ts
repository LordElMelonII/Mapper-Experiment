// src/st/mount.ts — M0: place the skeleton element in the host settings panel.
//
// Facts verified against the LOCAL SillyTavern 1.19.0 source (D5, not memory):
//   - public/scripts/st-context.js:115  getContext() returns { eventSource, eventTypes, ... }
//   - public/scripts/events.js:3-5      event_types.APP_READY === 'app_ready'
//   - public/lib/eventemitter.js:31-58  eventSource is a local EventEmitter; APP_READY
//     is registered in autoFireAfterEmit, so a late .on() subscriber still gets called.
//   - public/index.html:5800            #extensions_settings2 exists in the extensions
//     panel container.
//   - public/script.js:747-790          extensions activate (import + activate hook)
//     during getSettings(), i.e. BEFORE APP_READY emits — so a subscription taken in
//     onActivate() fires for the real APP_READY; the auto-fire replay covers any
//     ordering surprise.
//
// Every host access is wrapped and degrades (C32/D32): nothing in this file may
// throw out to the host, and at most ONE element is ever inserted.

const ELEMENT_TAG = 'st-map-explorer';
const CONTAINER_ID = 'extensions_settings2';

/** Reads the verified context surface (D4: getContext() is the only host entry). */
function readContext(): StHostContext | undefined {
  try {
    return window.SillyTavern?.getContext?.();
  } catch (err) {
    console.warn('[TravelMapper] getContext() failed', err);
    return undefined;
  }
}

/** APP_READY name from the host's own table; undefined when unusable. */
function readReadyEventName(): string | undefined {
  const name = readContext()?.eventTypes?.['APP_READY'];
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

/** Registers the listener on APP_READY; false when the host surface is unusable. */
function onReady(listener: (args: unknown[]) => void): boolean {
  const source = readContext()?.eventSource;
  const event = readReadyEventName();
  if (source === undefined || typeof source.on !== 'function' || event === undefined) {
    return false;
  }
  source.on(event, listener);
  return true;
}

/** Idempotent insert; the APP_READY replay could call this more than once. */
function insertSkeleton(): void {
  if (document.querySelector(ELEMENT_TAG) !== null) {
    return;
  }
  const container = document.getElementById(CONTAINER_ID);
  if (container === null) {
    console.warn('[TravelMapper] host container #' + CONTAINER_ID + ' not found; element not mounted');
    return;
  }
  container.appendChild(document.createElement(ELEMENT_TAG));
  console.log('[TravelMapper] skeleton mounted in #' + CONTAINER_ID);
}

/**
 * Subscribes to APP_READY and mounts the element once.
 * Degraded path (C32): when the context stream is unusable, mounts immediately
 * — #extensions_settings2 is static host markup (index.html), present from
 * DOMContentLoaded onward, so an immediate insert is safe.
 */
export function mountSkeleton(): void {
  try {
    if (onReady(() => {
      try {
        insertSkeleton();
      } catch (err) {
        console.error('[TravelMapper] failed to insert element', err);
      }
    })) {
      return;
    }
    insertSkeleton();
  } catch (err) {
    console.error('[TravelMapper] mount failed', err);
    try {
      insertSkeleton();
    } catch (err2) {
      console.error('[TravelMapper] immediate insert failed', err2);
    }
  }
}
