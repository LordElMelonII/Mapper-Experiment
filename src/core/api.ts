// src/core/api.ts — the frozen contract (Task 0).
// Types verbatim from EXECUTION-PLAN §3.3; this file is the contract freeze
// (AGENTS.md §4): agents code against it, never against each other's trees.
// R5: this module imports nothing outward. C23: machine names never reach
// prompt-facing structures.

export type NodeKind = 'world' | 'region' | 'city' | 'district' | 'location' | 'hub' | 'waypoint';
// D78 (additive amendment): the travel-mode vocabulary is user-extensible — a
// map may declare modes (WorldMapData.modes) beyond the built-ins, and the
// built-ins remain the defaults when a map declares none. The `string & {}`
// intersection keeps built-in autocomplete while admitting any declared id.
export type TravelMode = 'walk' | 'car' | 'train' | (string & {});
export type Terrain = 'road' | 'plain' | 'river' | 'swamp' | 'mountain';
export type NodeOrigin = 'authored' | 'user';   // user nodes live in the chat overlay (D21)

/**
 * D84 (additive amendment): a layer background's stored reference — EXACTLY ONE
 * source arm. `{ assetId }` is the localforage-backed uploaded image (D29 —
 * uploads are machine-local); `{ url }` is a remote image URL kept in the map
 * data, so it travels with the saved map (D29's portability mitigation). One
 * image per layer, one rendering path either way; LOADING it is app-side (C32
 * degrade-never-throw governs there, not here). schemaVersion stays 2 — the
 * D78 additive precedent; old `{ assetId }` data maps arm-to-arm (C31
 * unengaged).
 */
export type LayerBackground = { assetId: string } | { url: string };

export interface LayerData {
  id: string;
  name: string;                        // 'World', 'Fuyuki City', 'Misaki Town'
  background?: LayerBackground;        // D84: uploaded asset or remote URL — one image per layer, contain-fitted by the renderer (F03/F43)
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
  portal?: string;                     // D85: the layer this node opens (the badge entry node) — the layer hierarchy DERIVES from this wiring; no second structure (R4 spirit)
}

export interface ModeSpec {
  allowed: boolean;                    // false ⇒ cost = Infinity
  authoredMinutes?: number;            // AUTHORED TIME WINS over everything (D14)
  multiplier?: number;                 // relative factor on derived time
}

/**
 * D78: one user-declared travel mode (e.g. horse, airship) — the map-level
 * registry entry, living beside the scale block. `id` is the structural key
 * edge.modes / scale.speed / overlay.travelMode reference; `label` is the
 * authored display word (C23 — it, never the id, reaches prompts and panels;
 * an entry MAY adopt a built-in id to relabel it). `speed` is a conversion
 * input with EXACTLY the scale.speed[mode] semantic (canonical units per
 * hour) — a conversion input, never a third route currency: C14 verbatim and
 * C15's one-currency rule stand. `allowedByDefault` feeds D42's default-allowed
 * set (quick-connect / draw-arc). `unit` is a display-only authored word
 * naming the mode's pace ("km/h", "leagues per day").
 */
export interface ModeDeclaration {
  id: string;                          // structural key — may adopt a built-in id to relabel it (D78)
  label: string;                       // authored display word (C23)
  unit?: string;                       // display-only pace word
  speed?: number;                      // conversion input — the scale.speed[mode] semantic
  allowedByDefault: boolean;           // D42: the default-allowed set
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
  modes?: ModeDeclaration[];            // D78 — the mode registry; absent ⇒ exactly today: walk/car/train, scale.speed, nothing else
}

// Per-chat overlay — persisted in chatMetadata, never in the library
export interface ChatMapOverlay {
  mapId: string | null;
  currentLocationId: string | null;
  actorId?: string;                    // reserved (D13)
  travelMode: TravelMode;
  statusNote?: string;                 // "on the road to X, ~2 km out" (D17)
  corrective?: string;                 // D26/D63: engine-built nearest-suggestions line; sticky until the next scan replaces or clears it
  userNodes: MapNodeData[];            // waypoints — persist, promotable (D21)
  userEdges: MapEdgeData[];
  blocked: Record<string, string>;     // edgeId → reason (D20)
}

// D62: the template engine is an INJECTED capability (R5 — the core imports
// nothing outward). Handlebars-shaped: the host passes SillyTavern's bundled
// `Handlebars.compile`; tests and the dev harness pass the npm devDependency;
// the shipped bundle never embeds an engine.
export type TemplateCompiler = (tpl: string) => (ctx: Record<string, unknown>) => string;

/**
 * D82/F42: the informed-cascade delete dialog's counts — R1's core-computed
 * N/M/K, tallied across BOTH planes (map + overlay) exactly as removeLayer
 * deletes them: `nodes` = library nodes + overlay waypoints on the layer;
 * `sameLayerArcs` = arcs with BOTH endpoints dying; `crossLayerArcs` = arcs
 * with EXACTLY ONE endpoint dying (lost from surviving layers). A pure query:
 * it never mutates, never flips dirty, and never refuses on "last layer"
 * (the dialog never offers that; the count is honest either way).
 */
export interface LayerRemovalImpact {
  nodes: number;
  sameLayerArcs: number;
  crossLayerArcs: number;
}

// Route shape (C18): { ok, total, legs[] }; each leg carries arc id, from, to,
// mode, cost, and an optional reason (blocked/detour). C17: ok:false carries a
// human-readable reason and ∞ never appears in any output.
export interface RouteLeg {
  arcId: string;
  from: string;
  to: string;
  mode: TravelMode;
  modeLabel: string;                   // D78/C23 (additive amendment, always present): the RESOLVED authored word — the registry label when an entry with that id exists (built-in relabels included), else the id itself; the UI never maps ids to words itself
  cost: number;
  reason?: string;
}

export interface RouteResult {
  ok: boolean;
  total: number;
  legs: RouteLeg[];
  reason?: string;
  unit: string;                        // the currency the total/legs costs are stated in — 'min' when minutes, else scale.unitLabel (D72; same rule as MapSnapshot.unit)
}

// Snapshot shape (C19–C22): plain serializable data; template variables per
// D24's contract. C23: machine names must never appear in these fields.
export interface SnapshotRoute {
  label: string;
  direction: string;                   // eight-way cardinal (C10); cross-layer arcs report without one
  cost: number;
  mode: TravelMode;                    // D78/C23: the RESOLVED label — prompt-facing words only (the bare built-ins' ids ARE their words)
  blockedReason?: string;
}

export interface SnapshotDestination {
  label: string;
  via: string;
  mode: TravelMode;                    // D78/C23: the RESOLVED label — prompt-facing words only
  cost: number;
}

export interface MapSnapshot {
  location: string | null;
  region: string | null;
  layer: string;
  statusNote?: string;
  routes: SnapshotRoute[];
  destinations: SnapshotDestination[]; // C20: capped (12)
  destinationsTruncated: boolean;      // C20/D63: the cap dropped entries — the template's `truncated` variable
  unit: string;                        // cost-currency label: 'min' when minutes, else the canonical unitLabel (C15/D60, §6.2)
  corrective?: string;                 // D26 line (overlay.corrective, D63)
}
