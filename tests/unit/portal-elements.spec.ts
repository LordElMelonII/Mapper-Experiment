// tests/unit/portal-elements.spec.ts — PKG B-128 (D85/F02): the PORTAL
// projection's pure builders, bare-Node pinned (the p2m1-layer-elements
// precedent: type-only imports, no DOM — the mounted pipeline stays the e2e
// suites' business, AGENTS.md §8).
//
// Cited IDs:
//   D85/F02  — a portal node wears a BADGE marker (the B-107 machinery, one
//              visual language for "there is depth here"); the breadcrumb
//              chain DERIVES from the wiring — no separate parent field.
//   C23      — the badge label is the TARGET layer's authored NAME, never
//              the id; the chain emits ids only (the words are the layers'
//              own names, joined by the caller).
//   C32      — stale wiring (an unknown target layer), a position-less host,
//              a degenerate active layer: degrade to NOTHING, never throw.
//   B-115    — the shared `tme-badge` class carries cull-coherence (badges
//              cull WITH content; no min-zoomed-font-size anywhere).
//   R1/R4    — pure reads of the live references; positions are authored
//              data, nothing is computed.
import { describe, expect, it } from 'vitest';
import type { ElementDefinition } from 'cytoscape';
import { breadcrumbChain, buildPortalBadges } from '../../src/app/graph/layer-elements';
import type { WorldMapData } from '../../src/core/api';

/** A minimal two-layer world the cells extend per case (fresh per call). */
function twoLayerMap(): WorldMapData {
  return {
    schemaVersion: 2,
    id: 'portal-unit-world',
    name: 'Portal Unit World',
    layers: [
      { id: 'layer-a', name: 'Anchor' },
      { id: 'layer-b', name: 'Depths' },
    ],
    scale: { unitPerPx: 1, unitLabel: 'league', unitKind: 'distance' },
    nodes: [
      { id: 'gate', label: 'Stone Gate', kind: 'location', layer: 'layer-a', position: { x: 100, y: 200 } },
      { id: 'well', label: 'Deep Well', kind: 'hub', layer: 'layer-a', position: { x: 300, y: 200 } },
      { id: 'lair', label: 'Lair', kind: 'location', layer: 'layer-b', position: { x: 50, y: 50 } },
    ],
    edges: [],
  };
}

const nodeDefs = (elements: ElementDefinition[]): ElementDefinition[] =>
  elements.filter((el) => el.group === 'nodes');

describe('buildPortalBadges (B-128/D85/F02 — the B-107 machinery)', () => {
  it('emits one pseudo-node per WIRED node on the layer: id/class/anchor/label', () => {
    const map = twoLayerMap();
    map.nodes[0].portal = 'layer-b'; // gate opens Depths
    const badges = buildPortalBadges(map, 'layer-a');
    expect(badges).toHaveLength(1);
    const badge = badges[0];
    expect(badge.group).toBe('nodes');
    expect(badge.data).toMatchObject({
      id: 'tme-portal-badge-gate',
      label: 'Depths', // C23: the TARGET layer's authored NAME, never the id
      nodeId: 'gate', // the gesture's key into the live node — carried, never parsed
    });
    expect(badge.classes).toEqual(['tme-badge', 'tme-portal-badge']); // shared class + the depth hue class
    expect(badge.position).toEqual({ x: 140, y: 240 }); // the shared anchor assembly (BADGE_OFFSET 40)
    expect(badge.grabbable).toBe(false); // pinned pseudo-node (the B-103 compound field)
  });

  it('labels from the target layer NAME even when ids look like names elsewhere (C23)', () => {
    const map = twoLayerMap();
    map.layers[1].name = 'The Deep'; // rename the target — the label follows the authored word
    map.nodes[0].portal = 'layer-b';
    const [badge] = buildPortalBadges(map, 'layer-a');
    expect(badge?.data).toMatchObject({ label: 'The Deep' });
  });

  it('emits NOTHING without wiring (no portal ⇒ no badge)', () => {
    const badges = buildPortalBadges(twoLayerMap(), 'layer-a');
    expect(badges).toEqual([]);
  });

  it('emits nothing for a layer with no wired residents (other-layer wiring stays there)', () => {
    const map = twoLayerMap();
    map.nodes[2].portal = 'layer-a'; // lair (layer-b) opens Anchor
    expect(buildPortalBadges(map, 'layer-a')).toEqual([]); // the badge lives on lair's OWN layer
    expect(buildPortalBadges(map, 'layer-b')).toHaveLength(1);
  });

  it('degrades to nothing on stale wiring (target layer gone) and a position-less host (C32)', () => {
    const stale = twoLayerMap();
    stale.nodes[0].portal = 'layer-gone'; // stale target (unreachable via the facade; read assumes nothing)
    expect(buildPortalBadges(stale, 'layer-a')).toEqual([]);
    const unanchored = twoLayerMap();
    unanchored.nodes[0].portal = 'layer-b';
    delete unanchored.nodes[0].position; // no anchor to ride
    expect(buildPortalBadges(unanchored, 'layer-a')).toEqual([]);
  });

  it('never emits overlay-style or non-resident nodes: library residents only', () => {
    const map = twoLayerMap();
    map.nodes[1].portal = 'layer-b'; // well wired, but queried for the wrong layer below
    const badges = buildPortalBadges(map, 'layer-b');
    expect(nodeDefs(badges).map((el) => el.data!.id)).not.toContain('tme-portal-badge-well');
  });
});

describe('breadcrumbChain (B-128/D85 — the hierarchy derives from the wiring)', () => {
  it('a root layer chains to itself alone; a single-layer map yields length 1', () => {
    const map = twoLayerMap();
    expect(breadcrumbChain(map, 'layer-a')).toEqual(['layer-a']);
    const solo: WorldMapData = { ...twoLayerMap(), layers: [map.layers[0]] };
    expect(breadcrumbChain(solo, 'layer-a')).toEqual(['layer-a']);
  });

  it('walks parent → active: [root, mid, active] with the wiring as the only parent source', () => {
    const map = twoLayerMap();
    map.layers.push({ id: 'layer-c', name: 'Core' });
    map.nodes[0].portal = 'layer-b'; // gate (on A) opens B — B's parent is A
    map.nodes[2].portal = 'layer-c'; // lair (on B) opens C — C's parent is B
    expect(breadcrumbChain(map, 'layer-c')).toEqual(['layer-a', 'layer-b', 'layer-c']);
    expect(breadcrumbChain(map, 'layer-b')).toEqual(['layer-a', 'layer-b']);
  });

  it('a CYCLE is legal data and just ends the chain (no hang, honest degrade)', () => {
    const map = twoLayerMap();
    map.nodes[0].portal = 'layer-b'; // gate (on A) opens B — A is B's parent
    map.nodes[2].portal = 'layer-a'; // lair (on B) opens A — the cycle A ↔ B
    // Active B: parent A (via gate), then A's parent B — already visited ⇒ stop. Chain [A, B].
    expect(breadcrumbChain(map, 'layer-b')).toEqual(['layer-a', 'layer-b']);
    // Active A: parent B (via lair), then B's parent A — visited ⇒ stop. Chain [B, A].
    expect(breadcrumbChain(map, 'layer-a')).toEqual(['layer-b', 'layer-a']);
  });

  it('multiple layers entry into the same target: the FIRST wired node in array order wins (deterministic)', () => {
    const map = twoLayerMap();
    map.layers.push({ id: 'layer-c', name: 'Core' });
    map.nodes.push({ id: 'later', label: 'Later Gate', kind: 'location', layer: 'layer-c', position: { x: 0, y: 0 } });
    map.nodes[0].portal = 'layer-b'; // gate (on A) — earlier in map.nodes
    map.nodes[3].portal = 'layer-b'; // later (on C) — later in map.nodes
    // Reading (a): B's parent is the FIRST wired node's layer — A.
    expect(breadcrumbChain(map, 'layer-b')).toEqual(['layer-a', 'layer-b']);
  });

  it('an unknown active layer degrades to the empty chain (C32)', () => {
    expect(breadcrumbChain(twoLayerMap(), 'layer-nowhere')).toEqual([]);
  });

  it('a parent layer unknown to map.layers ends the chain (stale wiring degrade)', () => {
    const map = twoLayerMap();
    map.nodes[0].portal = 'layer-b';
    const pruned: WorldMapData = { ...map, layers: [map.layers[1]] }; // layer-a gone
    expect(breadcrumbChain(pruned, 'layer-b')).toEqual(['layer-b']);
  });
});
