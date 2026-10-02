// src/core/api.ts — the frozen contract (Task 0).
// Types verbatim from EXECUTION-PLAN §3.3; this file is the contract freeze
// (AGENTS.md §4): agents code against it, never against each other's trees.
// R5: this module imports nothing outward. C23: machine names never reach
// prompt-facing structures.

export type NodeKind = 'world' | 'region' | 'city' | 'district' | 'location' | 'hub' | 'waypoint';
export type TravelMode = 'walk' | 'car' | 'train';
export type Terrain = 'road' | 'plain' | 'river' | 'swamp' | 'mountain';
export type NodeOrigin = 'authored' | 'user';   // user nodes live in the chat overlay (D21)

export interface LayerData {
  id: string;
  name: string;                        // 'World', 'Fuyuki City', 'Misaki Town'
  background?: { assetId: string };    // localforage-backed image (D29)
}

export interface MapNodeData {
  id: string;
  label: string;
  kind: NodeKind;
  layer: string;                       // which plane this node lives in (D16)
  parent?: string;                     // compound parent (district/city) — same layer
  position?: { x: number; y: number }; // canvas coords, y grows SOUTH
  description?: string;
  aliases?: string[];                  // also used by toast matching (D11/D26)
  transit?: { type: 'train' | 'port' | 'subway'; line?: string };
  origin?: NodeOrigin;                 // default 'authored'
}

export interface ModeSpec {
  allowed: boolean;                    // false ⇒ cost = Infinity
  authoredMinutes?: number;            // AUTHORED TIME WINS over everything (D14)
  multiplier?: number;                 // relative factor on derived time
}

export interface MapEdgeData {
  id: string;
  source: string;                     // leaf-to-leaf; may cross layers (D16)
  target: string;
  modes: Partial<Record<TravelMode, ModeSpec>>;
  terrain?: Terrain;
  authoredDistance?: number;          // overrides straight-line geometry (D14)
  blocked?: { reason: string };       // Infinity to routing, visible to prompt (D20)
  curve?: { distances: number[] };    // unbundled-bezier control points (visual)
  fare?: number;                      // reserved
}

export interface WorldMapData {
  schemaVersion: 2;
  id: string;
  name: string;
  layers: LayerData[];                 // ≥ 1 (single-layer maps are the degenerate case)
  scale: {
    unitPerPx: number;                 // 1 px = n of the canonical unit
    unitLabel: string;                // 'km' | 'min' | 'league' | …
    unitKind: 'distance' | 'time';    // canonical unit may be either (D45)
    terrainMultipliers?: Partial<Record<Terrain, number>>;
    speed?: Partial<Record<TravelMode, number>>; // distance ↔ time conversion when needed
  };
  nodes: MapNodeData[];
  edges: MapEdgeData[];
}

// Per-chat overlay — persisted in chatMetadata, never in the library
export interface ChatMapOverlay {
  mapId: string | null;
  currentLocationId: string | null;
  actorId?: string;                    // reserved (D13)
  travelMode: TravelMode;
  statusNote?: string;                 // "on the road to X, ~2 km out" (D17)
  userNodes: MapNodeData[];            // waypoints — persist, promotable (D21)
  userEdges: MapEdgeData[];
  blocked: Record<string, string>;     // edgeId → reason (D20)
}

// Route shape (C18): { ok, total, legs[] }; each leg carries arc id, from, to,
// mode, cost, and an optional reason (blocked/detour). C17: ok:false carries a
// human-readable reason and ∞ never appears in any output.
export interface RouteLeg {
  arcId: string;
  from: string;
  to: string;
  mode: TravelMode;
  cost: number;
  reason?: string;
}

export interface RouteResult {
  ok: boolean;
  total: number;
  legs: RouteLeg[];
  reason?: string;
}

// Snapshot shape (C19–C22): plain serializable data; template variables per
// D24's contract. C23: machine names must never appear in these fields.
export interface SnapshotRoute {
  label: string;
  direction: string;                   // eight-way cardinal (C10); cross-layer arcs report without one
  cost: number;
  mode: TravelMode;
  blockedReason?: string;
}

export interface SnapshotDestination {
  label: string;
  via: string;
  mode: TravelMode;
  cost: number;
}

export interface MapSnapshot {
  location: string | null;
  region: string | null;
  layer: string;
  statusNote?: string;
  routes: SnapshotRoute[];
  destinations: SnapshotDestination[]; // C20: capped (12), truncation marked
  unit: string;                        // canonical unit label (C14 row 6 / C15)
  corrective?: string;                 // D26 line
}
