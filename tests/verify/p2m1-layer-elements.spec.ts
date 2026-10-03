// tests/verify/p2m1-layer-elements.spec.ts — M1 verifier finding 2 (major):
// chat waypoints (F10/D21) and user edges (D61) must project onto the canvas
// like any library element. The pure builder (src/app/graph/layer-elements.ts)
// is bare-Node testable by construction — type-only imports, no DOM — so this
// spec pins the projection without a browser; the mounted pipeline stays
// covered by the e2e suites (AGENTS.md §8).
//
// Cited IDs: F10 (waypoints persist for the chat; placement is M3 — display
// only here) · D21 (user nodes are chat overlay state; unnamed ones are UI
// display-only, C23 keeps them out of prompts — never off the canvas) · D61
// (waypoint edges graduate/stay chat-scoped by id) · F01/D16 (one layer plane
// at a time) · C2 (blocked arcs drawn, dashed class) · C3 (cross-layer arcs
// not drawn in M1) · R4 (live references read-only — one projection, no
// second truth) · C1/F07 (parents are containers, never endpoints).
import { describe, expect, it } from 'vitest';
import { buildLayerElements } from '../../src/app/graph/layer-elements';
import { fuyukiMap } from '../../data/worlds/fuyuki';
import type { ChatMapOverlay, MapEdgeData, MapNodeData } from '../../src/core/api';

const overlayWithWaypoints = (): ChatMapOverlay => ({
  mapId: 'fuyuki-misaki',
  currentLocationId: 'emiya-residence',
  travelMode: 'walk',
  userNodes: [
    // An UNNAMED waypoint on Fuyuki (the engine label from addUserNodeAt) and
    // one on Misaki — F10/D21: both display; C23 bars the name from prompts,
    // not from the canvas.
    {
      id: 'wp-fuyuki-1',
      label: 'Waypoint',
      kind: 'waypoint',
      layer: 'layer-fuyuki',
      position: { x: 250, y: 250 },
      origin: 'user',
    },
    {
      id: 'wp-misaki-1',
      label: 'Roadside',
      kind: 'waypoint',
      layer: 'layer-misaki',
      position: { x: 40, y: 60 },
      origin: 'user',
    },
  ],
  userEdges: [
    // D61: a chat-scoped kNN edge between two Fuyuki leaves — same projection
    // rules as a library edge.
    {
      id: 'wp-edge-1',
      source: 'wp-fuyuki-1',
      target: 'emiya-residence',
      modes: { walk: { allowed: true } },
    },
  ],
  blocked: {},
});

const nodeOf = (elements: ReturnType<typeof buildLayerElements>, id: string) => {
  const hit = elements.find((el) => el.group === 'nodes' && el.data.id === id);
  if (hit === undefined) throw new Error(`node ${id} missing from projection`);
  return hit;
};

const edgeOf = (elements: ReturnType<typeof buildLayerElements>, id: string) => {
  const hit = elements.find((el) => el.group === 'edges' && el.data.id === id);
  if (hit === undefined) throw new Error(`edge ${id} missing from projection`);
  return hit;
};

describe('buildLayerElements — overlay waypoints project (F10/D21, M1 finding 2)', () => {
  it('a chat waypoint on the active layer renders with the tme-waypoint class (F10)', () => {
    const elements = buildLayerElements(fuyukiMap, overlayWithWaypoints(), 'layer-fuyuki');
    const wp = nodeOf(elements, 'wp-fuyuki-1');
    expect(wp.classes).toContain('tme-waypoint');
    expect(wp.position).toEqual({ x: 250, y: 250 });
  });

  it('a waypoint on the OTHER layer does not render (F01/D16 — one plane at a time)', () => {
    const fuyuki = buildLayerElements(fuyukiMap, overlayWithWaypoints(), 'layer-fuyuki');
    expect(fuyuki.some((el) => el.data.id === 'wp-misaki-1')).toBe(false);

    const misaki = buildLayerElements(fuyukiMap, overlayWithWaypoints(), 'layer-misaki');
    expect(misaki.some((el) => el.data.id === 'wp-misaki-1')).toBe(true);
    expect(misaki.some((el) => el.data.id === 'wp-fuyuki-1')).toBe(false);
  });

  it('a chat user edge between on-layer endpoints projects like a library edge (D61)', () => {
    const elements = buildLayerElements(fuyukiMap, overlayWithWaypoints(), 'layer-fuyuki');
    const edge = edgeOf(elements, 'wp-edge-1');
    expect(edge.data.source).toBe('wp-fuyuki-1');
    expect(edge.data.target).toBe('emiya-residence');
    expect(edge.classes).not.toContain('tme-blocked');
  });

  it('an overlay block on a library edge renders the tme-blocked class (C2/D20)', () => {
    const overlay = overlayWithWaypoints();
    overlay.blocked['arc-emiya-residence-shopping-district'] = 'roadworks';
    const elements = buildLayerElements(fuyukiMap, overlay, 'layer-fuyuki');
    expect(edgeOf(elements, 'arc-emiya-residence-shopping-district').classes).toContain('tme-blocked');
  });

  it('a user edge to a cross-layer endpoint is filtered, never drawn dangling (C3, C1)', () => {
    const overlay = overlayWithWaypoints();
    const cross: MapEdgeData = {
      id: 'wp-edge-cross',
      source: 'wp-fuyuki-1',
      target: 'misaki-town', // FX1's Misaki leaf — the other plane
      modes: { train: { allowed: true } },
    };
    overlay.userEdges = [...overlay.userEdges, cross];
    const fuyuki = buildLayerElements(fuyukiMap, overlay, 'layer-fuyuki');
    const misaki = buildLayerElements(fuyukiMap, overlay, 'layer-misaki');
    expect(fuyuki.some((el) => el.data.id === 'wp-edge-cross')).toBe(false);
    expect(misaki.some((el) => el.data.id === 'wp-edge-cross')).toBe(false);
  });

  it('a waypoint holding the pin carries tme-pin (D58: waypoints are pin-eligible leaves)', () => {
    const overlay = overlayWithWaypoints();
    overlay.currentLocationId = 'wp-fuyuki-1';
    const elements = buildLayerElements(fuyukiMap, overlay, 'layer-fuyuki');
    expect(nodeOf(elements, 'wp-fuyuki-1').classes).toContain('tme-pin');
  });

  it('the input map/overlay objects are never mutated (R4 — a read-only projection)', () => {
    const overlay = overlayWithWaypoints();
    const mapSnapshot = JSON.stringify(fuyukiMap.nodes.map((n: MapNodeData) => n.id));
    const overlaySnapshot = JSON.stringify(overlay.userNodes.map((n: MapNodeData) => n.id));
    buildLayerElements(fuyukiMap, overlay, 'layer-fuyuki');
    buildLayerElements(fuyukiMap, overlay, 'layer-misaki');
    expect(JSON.stringify(fuyukiMap.nodes.map((n: MapNodeData) => n.id))).toBe(mapSnapshot);
    expect(JSON.stringify(overlay.userNodes.map((n: MapNodeData) => n.id))).toBe(overlaySnapshot);
    expect(overlay.userEdges.every((e: MapEdgeData) => e.id !== 'mutated')).toBe(true);
  });
});
