// src/st/entry.ts — M0 walking-skeleton entry (D1/D2/D8).
// Loaded by SillyTavern as <script type="module"> (extensions.js:813) and then
// called as the manifest `activate` hook (extensions.js:395-460) with a 5 s
// timeout. The module has NO side effects on import — all setup happens in
// onActivate() so nothing runs if the host never activates the extension.
//
// Shape (all verified against installed type declarations):
//   createApplication(): Promise<ApplicationRef>          @angular/platform-browser
//   appRef.injector: EnvironmentInjector                  @angular/core
//   createCustomElement(component, { injector })          @angular/elements
//   provideZonelessChangeDetection()                      @angular/core (public since 20.2)
// No zone.js is loaded anywhere (D2): the elements strategy skips zone bookkeeping
// when `Zone` is undefined (elements.mjs:113-117).

import { provideZonelessChangeDetection } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { HelloWorldComponent } from './hello-world';
import { mountSkeleton } from './mount';

const ELEMENT_TAG = 'st-map-explorer';

/**
 * Manifest `activate` hook. Synchronous-safe setup kept inside the
 * 5-second host timeout: only application creation + element registration.
 * Any failure is contained here (C32/D32) — the host keeps working.
 */
export async function onActivate(): Promise<void> {
  try {
    const appRef = await createApplication({
      providers: [provideZonelessChangeDetection()],
    });
    if (customElements.get(ELEMENT_TAG) === undefined) {
      customElements.define(
        ELEMENT_TAG,
        createCustomElement(HelloWorldComponent, { injector: appRef.injector }),
      );
    }
    mountSkeleton();
    console.log('[TravelMapper] activated');
  } catch (err) {
    console.error('[TravelMapper] activate failed; the extension stays inert', err);
  }
}
