// tests/verify/p2m1-viewer-state-adversarial.spec.ts — Verifier probes for the
// Phase 2 M1 viewer-state seam (packet B-101; CORE.md §9 setActiveLayer).
// Expectations derived from the spec, not the implementation:
//   C19/C22 — the snapshot's `layer` is the PIN's node layer, never viewer
//             state: switching the active layer must not change any snapshot
//             field (the M1 header renders snapshot()?.layer verbatim).
//   C30     — a refused command mutates nothing: not just activeLayer, the
//             whole mutation contract (stale flag included) stays untouched.
//   R4/C24  — commands never replace the live map/overlay references.
//   C8      — an accepted viewer-state switch marks stale (the mutation
//             contract) even though no query reads activeLayer yet.
import { describe, expect, it } from 'vitest';
import { createFacade, facadeStateOf } from '../../src/core/facade';
import type { ChatMapOverlay } from '../../src/core/api';
import { fuyukiMap } from '../../data/worlds/fuyuki';

// The harness's exact overlay shape (pin on Emiya Residence, walking).
const fuyukiOverlay = (): ChatMapOverlay => ({
  mapId: 'fuyuki-misaki',
  currentLocationId: 'emiya-residence',
  travelMode: 'walk',
  userNodes: [],
  userEdges: [],
  blocked: {},
});

describe('P2 M1 viewer-state seam (setActiveLayer, C19/C30/C8/R4)', () => {
  it('the snapshot is pin-scoped: switching the viewer layer changes NO snapshot field (C19/C22, F01)', () => {
    const f = createFacade();
    f.loadMap(fuyukiMap, fuyukiOverlay());
    const before = f.getSnapshot();
    expect(before.location).toBe('Emiya Residence'); // FX1 pin, self-derived precondition
    expect(before.layer).toBe('Fuyuki City'); // the pin's layer NAME (C22)

    f.setActiveLayer('layer-misaki'); // viewer now shows the other plane
    const after = f.getSnapshot();

    // The header asserts this object verbatim — every field must survive the
    // layer switch unchanged. If the snapshot ever read FacadeState.activeLayer,
    // `layer` would flip to 'Misaki Town' here (the regression the M1 header
    // test suite never exercises: it never switches layers while reading it).
    expect(after).toEqual(before);
    expect(after.layer).toBe('Fuyuki City');
    expect(after.unit).toBe('min');
  });

  it('a refused setActiveLayer mutates NOTHING — activeLayer AND the stale flag (C30)', () => {
    const f = createFacade();
    f.loadMap(fuyukiMap, fuyukiOverlay());
    f.materialize();
    expect(facadeStateOf(f).stale).toBe(false); // clean baseline

    expect(() => f.setActiveLayer('layer-ghost')).toThrow(
      "[TravelMapper] setActiveLayer: unknown layer id 'layer-ghost'",
    );
    expect(facadeStateOf(f).activeLayer).toBe('layer-fuyuki'); // FX1's first layer
    expect(facadeStateOf(f).stale).toBe(false); // the refused call set no flag
  });

  it('an accepted setActiveLayer keeps the live map/overlay references (R4/C24) and marks stale (C8)', () => {
    const f = createFacade();
    const overlay = fuyukiOverlay();
    f.loadMap(fuyukiMap, overlay);
    f.materialize();

    f.setActiveLayer('layer-misaki');

    const state = facadeStateOf(f);
    expect(state.map).toBe(fuyukiMap); // the fixture object itself, never a copy
    expect(state.overlay).toBe(overlay);
    expect(state.stale).toBe(true); // C8: the mutation contract, even viewer-only
  });

  it('switching layers twice (misaki → fuyuki) restores the original snapshot exactly (C19, round-trip)', () => {
    const f = createFacade();
    f.loadMap(fuyukiMap, fuyukiOverlay());
    const firstPaint = f.getSnapshot();

    f.setActiveLayer('layer-misaki');
    f.setActiveLayer('layer-fuyuki');

    expect(f.getSnapshot()).toEqual(firstPaint);
  });
});
