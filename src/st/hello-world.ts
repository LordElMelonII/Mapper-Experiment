// src/st/hello-world.ts — M0 walking-skeleton element (D1/D2).
// Standalone, zoneless, signal-based; inline template, no routing/forms/inputs.
// It renders exactly one string so the host proves the pipeline — it does NOT
// touch the core facade (M0 rule: no fake data). More UI arrives in later
// milestones through the frozen contract (CORE.md §9).

import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  selector: 'tme-skeleton', // unused by createCustomElement; kept for tme- prefix discipline
  template: '<p class="tme-skeleton-status">{{ status() }}</p>',
  styles: [
    // host display: unknown custom elements render inline by default
    ':host { display: block; }',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelloWorldComponent {
  /** Signal interpolation proves zoneless change detection works inside the element. */
  readonly status = signal('Travel & Map Explorer — skeleton OK');
}
