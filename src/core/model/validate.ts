// src/core/model/validate.ts — field-precise, collected validation of the frozen
// data contract (C30, C31, F50; EXECUTION-PLAN §6.2 Data edge cases).
//
// R5: imports only types from ../api — no dependencies, no host APIs, no console.
// C30: reject-before-mutate — validators read their input, never mutate it, and
// collect EVERY issue into one MapValidationError; callers run these before any
// graph change (A-002 materialization validates before cy.add).
// C31: validateWorldMap sees POST-migration data, so schemaVersion must already
// equal CURRENT_SCHEMA_VERSION; migrate.ts owns getting older data here.
// Unknown extra keys are tolerated — forward compatibility is schemaVersion's
// job — EXCEPT inside the union-keyed maps (edge.modes, scale.terrainMultipliers,
// scale.speed), where an out-of-union key is a defect (C30, F50).

import type {
  ChatMapOverlay,
  MapNodeData,
  ModeDeclaration,
  NodeKind,
  NodeOrigin,
  Terrain,
  TravelMode,
  WorldMapData,
} from '../api';

/** The schema version this build produces and validates (C31). */
export const CURRENT_SCHEMA_VERSION = 2;

/** One field-precise defect: where it sits (`path`) and what is wrong (`message`). (C30) */
export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Thrown by validateWorldMap / validateOverlay / migrateWorldMap when data is
 * refused (F50: never half-loaded). `issues` is the field-precise collected
 * report C30 requires; `message` is a one-line summary for logs and toasts.
 */
export class MapValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[], subject = 'map data') {
    super(`invalid ${subject}: ${issues.length} issue(s)`);
    this.name = 'MapValidationError';
    this.issues = issues;
  }
}

// --- enum memberships (typed against ../api unions so they cannot drift) ----

const NODE_KINDS: readonly NodeKind[] = ['world', 'region', 'city', 'district', 'location', 'hub', 'waypoint'];
const TRAVEL_MODES: readonly TravelMode[] = ['walk', 'car', 'train']; // D78: the BUILT-INS — a map's full universe adds its registry ids
const TERRAINS: readonly Terrain[] = ['road', 'plain', 'river', 'swamp', 'mountain'];
const TRANSIT_TYPES = ['train', 'port', 'subway'] as const;
const ORIGINS: readonly NodeOrigin[] = ['authored', 'user'];
const UNIT_KINDS = ['distance', 'time'] as const;

// --- pin eligibility (C1/F27, one rule per D58) ---------------------------------

/**
 * The kinds that may hold the pin (D58, reconciling C1/F27/D37): the leaf kinds
 * only. Container kinds — world, region, city, district — never hold it:
 * 'districts never hold it' is unconditional (F27), childless or not.
 */
export const PIN_ELIGIBLE_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(['location', 'hub', 'waypoint']);

/**
 * The D58 pin rule as ONE predicate so it cannot drift between the places that
 * enforce it — validateOverlay (default mode), the C8 materializer
 * (effective.ts) and the facade's setCurrentLocation: the node must exist, its
 * kind must be pin-eligible, and it must currently be childless (a leaf that
 * gains a child via a live library edit stops being pin-eligible — C8/C24).
 */
export function isPinEligible(
  id: string,
  nodes: ReadonlyArray<Pick<MapNodeData, 'id' | 'kind' | 'parent'>>,
): boolean {
  const node = nodes.find((n) => n.id === id);
  return node !== undefined && PIN_ELIGIBLE_KINDS.has(node.kind) && !nodes.some((n) => n.parent === id);
}

// --- mode registry (D78) — the ONE universe and the ONE label resolver ------

/**
 * D78: the map's mode universe — the built-ins ∪ the map's registry ids. The
 * ids `edge.modes`, `scale.speed` and `overlay.travelMode` may reference; a
 * map without a registry has exactly the built-in trio (today's universe).
 * ONE helper so the validator, the facade's setTravelMode guard and loadMap's
 * degrade can never drift apart (the isPinEligible precedent).
 */
export function modeUniverseOf(map: Pick<WorldMapData, 'modes'>): ReadonlySet<string> {
  const universe = new Set<string>(TRAVEL_MODES);
  if (map.modes !== undefined) {
    for (const declaration of map.modes) {
      if (isNonEmptyString(declaration.id)) universe.add(declaration.id);
    }
  }
  return universe;
}

/**
 * D78/C23: the authored display word for a mode id — the registry entry's
 * label when one exists (a built-in relabel included), else the id itself
 * (the bare built-ins' ids ARE their authored words). ONE resolver shared by
 * RouteLeg.modeLabel and the snapshot's prompt-facing mode fields, so the UI
 * and templates never map ids to words themselves (R1 spirit for authored
 * words). A registry entry whose label is missing at runtime degrades to the
 * id (C32) — validators refuse that shape on load, this never throws.
 */
export function resolveModeLabel(mode: TravelMode, modes: readonly ModeDeclaration[] | undefined): string {
  return modes?.find((d) => d.id === mode)?.label ?? mode;
}

// --- small guards ------------------------------------------------------------

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

function push(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function requireNonEmptyString(issues: ValidationIssue[], v: unknown, path: string): void {
  if (!isNonEmptyString(v)) push(issues, path, 'must be a non-empty string');
}

function requireNumberAbove(issues: ValidationIssue[], v: unknown, path: string, min: number): void {
  if (!isFiniteNumber(v) || v <= min) push(issues, path, `must be a finite number > ${min}`);
}

function requireNumberAtLeast(issues: ValidationIssue[], v: unknown, path: string, min: number): void {
  if (!isFiniteNumber(v) || v < min) push(issues, path, `must be a finite number >= ${min}`);
}

function optionalNumberAbove(issues: ValidationIssue[], v: unknown, path: string, min: number): void {
  if (v !== undefined) requireNumberAbove(issues, v, path, min);
}

function optionalNumberAtLeast(issues: ValidationIssue[], v: unknown, path: string, min: number): void {
  if (v !== undefined) requireNumberAtLeast(issues, v, path, min);
}

// --- node & edge checkers (shared by map and overlay) ------------------------

/**
 * Per-node field rules (§6.2). Parent cross-references are checked separately:
 * for library nodes in validateWorldMap's second pass, for user nodes they are
 * forbidden outright (a tap inside a compound yields a top-level user node).
 */
function checkNodeFields(
  issues: ValidationIssue[],
  node: Obj,
  path: string,
  layerIds: ReadonlySet<string>,
  forbidParent: boolean,
): void {
  // node['id'] is validated by the caller's collection branch (it must be
  // inspected there anyway for uniqueness) — do not report it twice.
  requireNonEmptyString(issues, node['label'], `${path}.label`);
  if (!oneOf(NODE_KINDS, node['kind'])) {
    push(issues, `${path}.kind`, `must be one of: ${NODE_KINDS.join(', ')}`);
  }
  const layer = node['layer'];
  if (!isNonEmptyString(layer)) {
    push(issues, `${path}.layer`, 'must be a layer id string');
  } else if (!layerIds.has(layer)) {
    push(issues, `${path}.layer`, `must reference an existing layer id ('${layer}' not found)`);
  }
  if (forbidParent && node['parent'] !== undefined) {
    push(issues, `${path}.parent`, 'parent is not allowed on user nodes');
  }

  const position = node['position'];
  if (position !== undefined) {
    if (!isObject(position)) {
      push(issues, `${path}.position`, 'must be an object with finite x and y');
    } else {
      if (!isFiniteNumber(position['x'])) push(issues, `${path}.position.x`, 'must be a finite number');
      if (!isFiniteNumber(position['y'])) push(issues, `${path}.position.y`, 'must be a finite number');
    }
  }

  const aliases = node['aliases'];
  if (aliases !== undefined) {
    if (!Array.isArray(aliases)) {
      push(issues, `${path}.aliases`, 'must be an array of non-empty strings');
    } else {
      const seen = new Set<string>();
      aliases.forEach((alias, i) => {
        if (!isNonEmptyString(alias)) {
          push(issues, `${path}.aliases[${i}]`, 'must be a non-empty string');
        } else if (seen.has(alias)) {
          push(issues, `${path}.aliases[${i}]`, `duplicate alias '${alias}'`);
        } else {
          seen.add(alias);
        }
      });
    }
  }

  const transit = node['transit'];
  if (transit !== undefined) {
    if (!isObject(transit)) {
      push(issues, `${path}.transit`, 'must be an object');
    } else if (!oneOf(TRANSIT_TYPES, transit['type'])) {
      push(issues, `${path}.transit.type`, `must be one of: ${TRANSIT_TYPES.join(', ')}`);
    }
  }

  if (node['origin'] !== undefined && !oneOf(ORIGINS, node['origin'])) {
    push(issues, `${path}.origin`, `must be one of: ${ORIGINS.join(', ')}`);
  }

  // D85: portal wiring — the per-node rules. A portal names the layer the node
  // opens: it must exist and cannot be the node's own layer. The
  // ONE-entry-node-per-layer UNIQUENESS rule is validateWorldMap's map-scope
  // pass (below) — a per-node check cannot see its siblings.
  const portal = node['portal'];
  if (portal !== undefined) {
    if (!isNonEmptyString(portal)) {
      push(issues, `${path}.portal`, 'must be a non-empty layer id string');
    } else if (!layerIds.has(portal)) {
      push(issues, `${path}.portal`, `must reference an existing layer id ('${portal}' not found)`);
    } else if (portal === layer) {
      push(issues, `${path}.portal`, `a portal cannot target its own layer ('${portal}')`);
    }
  }
}

interface EdgeContext {
  /** Every node id an edge may reference. */
  nodeIds: ReadonlySet<string>;
  /** Node ids that are compound parents — never edge endpoints (C1). */
  nonLeafIds: ReadonlySet<string>;
  /** D78: the mode universe `modes` keys may reference — built-ins ∪ registry ids, map-relative. */
  modeUniverse: ReadonlySet<string>;
}

/** Per-edge field rules (§6.2). An edge with `modes: {}` is legal — never traversable (C14 row 2). */
function checkEdge(issues: ValidationIssue[], edge: Obj, path: string, ctx: EdgeContext): void {
  requireNonEmptyString(issues, edge['id'], `${path}.id`);

  const endpoints = [
    ['source', edge['source']],
    ['target', edge['target']],
  ] as const;
  for (const [name, id] of endpoints) {
    if (!isNonEmptyString(id)) {
      push(issues, `${path}.${name}`, 'must be a node id string');
    } else if (!ctx.nodeIds.has(id)) {
      push(issues, `${path}.${name}`, `must reference an existing node id ('${id}' not found)`);
    } else if (ctx.nonLeafIds.has(id)) {
      push(issues, `${path}.${name}`, 'must be a leaf node (containers never connect)');
    }
  }
  const source = edge['source'];
  const target = edge['target'];
  if (isNonEmptyString(source) && source === target) {
    push(issues, `${path}.source`, 'must differ from target (no self-loops)');
  }

  const modes = edge['modes'];
  if (!isObject(modes)) {
    push(issues, `${path}.modes`, 'must be an object keyed by travel mode');
  } else {
    for (const key of Object.keys(modes)) {
      if (!ctx.modeUniverse.has(key)) { // D78: map-relative — built-ins ∪ registry ids (C30, F50)
        push(
          issues,
          `${path}.modes.${key}`,
          `unknown travel mode '${key}' — must be one of: ${[...ctx.modeUniverse].join(', ')}`,
        );
        continue;
      }
      const spec = modes[key];
      const specPath = `${path}.modes.${key}`;
      if (!isObject(spec)) {
        push(issues, specPath, 'must be a mode spec object');
        continue;
      }
      if (typeof spec['allowed'] !== 'boolean') {
        push(issues, `${specPath}.allowed`, 'must be a boolean');
      }
      optionalNumberAtLeast(issues, spec['authoredMinutes'], `${specPath}.authoredMinutes`, 0);
      optionalNumberAbove(issues, spec['multiplier'], `${specPath}.multiplier`, 0);
    }
  }

  if (edge['terrain'] !== undefined && !oneOf(TERRAINS, edge['terrain'])) {
    push(issues, `${path}.terrain`, `must be one of: ${TERRAINS.join(', ')}`);
  }
  optionalNumberAtLeast(issues, edge['authoredDistance'], `${path}.authoredDistance`, 0);

  const blocked = edge['blocked'];
  if (blocked !== undefined) {
    if (!isObject(blocked)) {
      push(issues, `${path}.blocked`, 'must be an object with a reason');
    } else {
      requireNonEmptyString(issues, blocked['reason'], `${path}.blocked.reason`);
    }
  }

  const curve = edge['curve'];
  if (curve !== undefined) {
    if (!isObject(curve)) {
      push(issues, `${path}.curve`, 'must be an object with a distances array');
    } else {
      const distances = curve['distances'];
      if (!Array.isArray(distances)) {
        push(issues, `${path}.curve.distances`, 'must be an array of finite numbers');
      } else {
        distances.forEach((d, i) => {
          if (!isFiniteNumber(d)) push(issues, `${path}.curve.distances[${i}]`, 'must be a finite number');
        });
      }
    }
  }

  optionalNumberAtLeast(issues, edge['fare'], `${path}.fare`, 0);
}

// --- public validators --------------------------------------------------------

/**
 * Validate a world map (C30, C31, F50). Collects EVERY issue into one
 * MapValidationError with field-precise paths; returns the typed map on success;
 * never mutates `data`. Expects POST-migration data: schemaVersion must already
 * equal CURRENT_SCHEMA_VERSION (C31).
 */
export function validateWorldMap(data: unknown): WorldMapData {
  if (!isObject(data)) {
    throw new MapValidationError([{ path: '', message: 'map data must be a JSON object' }]);
  }
  const issues: ValidationIssue[] = [];

  const version = data['schemaVersion'];
  if (version !== CURRENT_SCHEMA_VERSION) {
    push(
      issues,
      'schemaVersion',
      // C31/F50: a NEWER version is named as unsupported — migrating is impossible
      // — while anything else (older, missing, wrong-typed) keeps the migrate-first
      // advice. Wording aligned with migrate.ts's refusal for the newer case.
      typeof version === 'number' && version > CURRENT_SCHEMA_VERSION
        ? `unsupported schema version ${version}: newer than the supported version ${CURRENT_SCHEMA_VERSION}`
        : `must equal ${CURRENT_SCHEMA_VERSION} — migrate older data before validation`,
    );
  }
  requireNonEmptyString(issues, data['id'], 'id');
  requireNonEmptyString(issues, data['name'], 'name');

  // layers — ≥ 1, unique non-empty ids and names
  const layerIds = new Set<string>();
  const layers = data['layers'];
  if (!Array.isArray(layers)) {
    push(issues, 'layers', 'must be an array with at least one layer');
  } else {
    if (layers.length === 0) push(issues, 'layers', 'must contain at least one layer');
    const seen = new Set<string>();
    layers.forEach((layer, i) => {
      const path = `layers[${i}]`;
      if (!isObject(layer)) {
        push(issues, path, 'must be an object');
        return;
      }
      const id = layer['id'];
      if (!isNonEmptyString(id)) {
        requireNonEmptyString(issues, id, `${path}.id`);
      } else if (seen.has(id)) {
        push(issues, `${path}.id`, `duplicate layer id '${id}'`);
      } else {
        seen.add(id);
        layerIds.add(id);
      }
      requireNonEmptyString(issues, layer['name'], `${path}.name`);
      // D84: a background reference carries EXACTLY ONE source arm, each a
      // non-empty string — both arms or neither is one field-precise defect.
      const background = layer['background'];
      if (background !== undefined) {
        if (!isObject(background)) {
          push(issues, `${path}.background`, 'must be an object with exactly one of assetId or url');
        } else {
          const hasAsset = background['assetId'] !== undefined;
          const hasUrl = background['url'] !== undefined;
          if (hasAsset === hasUrl) {
            push(issues, `${path}.background`, 'must carry exactly one of assetId or url (D84)');
          } else if (hasAsset) {
            requireNonEmptyString(issues, background['assetId'], `${path}.background.assetId`);
          } else {
            requireNonEmptyString(issues, background['url'], `${path}.background.url`);
          }
        }
      }
    });
  }

  // modes — the D78 registry (beside the scale block): user-declared travel
  // modes. Validated BEFORE scale and edges so their mode-key checks can run
  // against the map-relative universe (built-ins ∪ registry ids) this collects.
  // A no-registry map skips the block entirely — its universe is exactly the
  // built-in trio, today's behavior (D78: "no-registry maps behave exactly as
  // today").
  const registryIds = new Set<string>();
  const modesDecl = data['modes'];
  if (modesDecl !== undefined) {
    if (!Array.isArray(modesDecl)) {
      push(issues, 'modes', 'must be an array of mode declarations');
    } else {
      modesDecl.forEach((declaration, i) => {
        const path = `modes[${i}]`;
        if (!isObject(declaration)) {
          push(issues, path, 'must be an object');
          return;
        }
        const id = declaration['id'];
        if (!isNonEmptyString(id)) {
          requireNonEmptyString(issues, id, `${path}.id`);
        } else if (registryIds.has(id)) {
          push(issues, `${path}.id`, `duplicate mode id '${id}'`); // first occurrence stays in the universe (the duplicate-node precedent)
        } else {
          registryIds.add(id);
        }
        requireNonEmptyString(issues, declaration['label'], `${path}.label`);
        if (declaration['unit'] !== undefined) {
          requireNonEmptyString(issues, declaration['unit'], `${path}.unit`);
        }
        optionalNumberAbove(issues, declaration['speed'], `${path}.speed`, 0);
        if (typeof declaration['allowedByDefault'] !== 'boolean') {
          push(issues, `${path}.allowedByDefault`, 'must be a boolean');
        }
      });
    }
  }
  const modeUniverse = new Set<string>([...TRAVEL_MODES, ...registryIds]); // D78: the map's mode universe

  // scale — unitPerPx finite > 0, unitLabel non-empty, unitKind distance|time;
  // terrainMultipliers / speed values, when present, finite > 0 (C11/D45/C14)
  const scale = data['scale'];
  if (!isObject(scale)) {
    push(issues, 'scale', 'must be an object');
  } else {
    requireNumberAbove(issues, scale['unitPerPx'], 'scale.unitPerPx', 0);
    requireNonEmptyString(issues, scale['unitLabel'], 'scale.unitLabel');
    if (!oneOf(UNIT_KINDS, scale['unitKind'])) {
      push(issues, 'scale.unitKind', `must be one of: ${UNIT_KINDS.join(', ')}`);
    }
    const multipliers = scale['terrainMultipliers'];
    if (multipliers !== undefined) {
      if (!isObject(multipliers)) {
        push(issues, 'scale.terrainMultipliers', 'must be an object');
      } else {
        for (const key of Object.keys(multipliers)) {
          if (!oneOf(TERRAINS, key)) { // F50/C30: union-keyed, same as edge.modes
            push(issues, `scale.terrainMultipliers.${key}`, `unknown terrain — must be one of: ${TERRAINS.join(', ')}`);
            continue;
          }
          requireNumberAbove(issues, multipliers[key], `scale.terrainMultipliers.${key}`, 0);
        }
      }
    }
    const speed = scale['speed'];
    if (speed !== undefined) {
      if (!isObject(speed)) {
        push(issues, 'scale.speed', 'must be an object');
      } else {
        for (const key of Object.keys(speed)) {
          if (!modeUniverse.has(key)) { // F50/C30/D78: union-keyed, map-relative — same universe as edge.modes
            push(issues, `scale.speed.${key}`, `unknown travel mode '${key}' — must be one of: ${[...modeUniverse].join(', ')}`);
            continue;
          }
          requireNumberAbove(issues, speed[key], `scale.speed.${key}`, 0);
        }
      }
    }
  }

  // nodes — pass 1: field rules + id collection (§6.2 duplicate ids, NaN coords)
  const nodes = data['nodes'];
  const nodeIds = new Set<string>();
  const nonLeafIds = new Set<string>();
  const nodeById = new Map<string, { index: number; layer: unknown }>();
  if (!Array.isArray(nodes)) {
    push(issues, 'nodes', 'must be an array');
  } else {
    const seen = new Set<string>();
    nodes.forEach((node, i) => {
      const path = `nodes[${i}]`;
      if (!isObject(node)) {
        push(issues, path, 'must be an object');
        return;
      }
      const id = node['id'];
      if (isNonEmptyString(id)) {
        if (seen.has(id)) {
          push(issues, `${path}.id`, `duplicate node id '${id}'`);
        } else {
          seen.add(id);
          nodeIds.add(id);
          nodeById.set(id, { index: i, layer: node['layer'] });
        }
      } else {
        requireNonEmptyString(issues, id, `${path}.id`);
      }
      if (typeof node['parent'] === 'string') nonLeafIds.add(node['parent']);
      checkNodeFields(issues, node, path, layerIds, false);
    });

    // nodes — pass 2: parent references (exist, not self, same layer) (§6.2)
    const parentOf = new Map<string, string>();
    nodes.forEach((node, i) => {
      if (!isObject(node)) return;
      const parent = node['parent'];
      if (parent === undefined) return;
      const path = `nodes[${i}].parent`;
      if (!isNonEmptyString(parent)) {
        push(issues, path, 'must be a node id string');
        return;
      }
      if (!nodeIds.has(parent)) {
        push(issues, path, `must reference an existing node id ('${parent}' not found)`);
        return;
      }
      const id = node['id'];
      if (!isNonEmptyString(id)) return; // id defect already reported in pass 1
      if (parent === id) {
        push(issues, path, 'a node cannot be its own parent');
        return;
      }
      parentOf.set(id, parent);
      const rec = nodeById.get(id);
      const parentRec = nodeById.get(parent);
      const nodeLayer = rec?.layer;
      const parentLayer = parentRec?.layer;
      // same-layer comparison only over KNOWN layers — an unknown layer is
      // already its own issue above; do not cascade it here
      if (
        isNonEmptyString(nodeLayer) && layerIds.has(nodeLayer) &&
        isNonEmptyString(parentLayer) && layerIds.has(parentLayer) &&
        nodeLayer !== parentLayer
      ) {
        push(issues, path, 'parent must be on the same layer as the node');
      }
    });

    // nodes — parent chains must not cycle (§6.2); one report per cycle
    const chainState = new Map<string, boolean>();
    for (const [startId, rec] of nodeById) {
      if (chainState.has(startId)) continue;
      const chain: string[] = [];
      const inChain = new Set<string>();
      let cur: string | undefined = startId;
      let cyclic = false;
      while (cur !== undefined) {
        if (inChain.has(cur)) {
          cyclic = true;
          break;
        }
        const known = chainState.get(cur);
        if (known !== undefined) {
          cyclic = known;
          break;
        }
        inChain.add(cur);
        chain.push(cur);
        cur = parentOf.get(cur);
      }
      for (const id of chain) chainState.set(id, cyclic);
      if (cyclic) {
        push(issues, `nodes[${rec.index}].parent`, `parent chain is cyclic: ${chain.join(' -> ')}`);
      }
    }

    // nodes — pass 3 (D85): at most ONE entry node per layer. Duplicate wiring
    // reports EVERY offender field-precisely, naming the sibling paths.
    const portalWiring = new Map<string, number[]>(); // target layer id → indices of nodes wiring it
    nodes.forEach((node, i) => {
      if (!isObject(node)) return;
      const portal = node['portal'];
      if (!isNonEmptyString(portal)) return; // field defects already reported in pass 1
      const wired = portalWiring.get(portal) ?? [];
      wired.push(i);
      portalWiring.set(portal, wired);
    });
    for (const [target, indices] of portalWiring) {
      if (indices.length < 2) continue;
      const siblings = indices.map((i) => `nodes[${i}]`).join(', ');
      for (const i of indices) {
        push(issues, `nodes[${i}].portal`, `at most one node may open layer '${target}' (wired by ${siblings})`);
      }
    }
  }

  // edges — unique ids, existing leaf endpoints, mode/terrain/override rules
  const edges = data['edges'];
  if (!Array.isArray(edges)) {
    push(issues, 'edges', 'must be an array');
  } else {
    const seen = new Set<string>();
    edges.forEach((edge, i) => {
      const path = `edges[${i}]`;
      if (!isObject(edge)) {
        push(issues, path, 'must be an object');
        return;
      }
      const id = edge['id'];
      if (isNonEmptyString(id)) {
        if (seen.has(id)) {
          push(issues, `${path}.id`, `duplicate edge id '${id}'`);
        } else {
          seen.add(id);
        }
      } else {
        requireNonEmptyString(issues, id, `${path}.id`);
      }
      checkEdge(issues, edge, path, { nodeIds, nonLeafIds, modeUniverse });
    });
  }

  if (issues.length > 0) throw new MapValidationError(issues);
  return data as unknown as WorldMapData; // shape proven by the checks above
}

/**
 * Validate a per-chat overlay against an already-valid map (C30, F50).
 * Node and edge rules are the map's own, resolved against library ∪ overlay
 * universes. Pin policy (D58): by default a pin on a KNOWN node that is not
 * pin-eligible (kind ∉ {location, hub, waypoint} or currently childless) is
 * refused (C1/F27). The C27 load path passes `tolerateIneligiblePin`: the pin
 * is chat state that a live library edit (C24) can invalidate at any moment,
 * so load neither refuses nor snaps — the pin rides along and materialization
 * marks it invalid (C8). A pin on an UNKNOWN node is never an error here
 * (C27 — staleness is materialization's business, not a load error).
 * `map` is a precondition: pass it through validateWorldMap first.
 */
export function validateOverlay(
  overlay: unknown,
  map: WorldMapData,
  options: { tolerateIneligiblePin?: boolean } = {},
): ChatMapOverlay {
  if (!isObject(overlay)) {
    throw new MapValidationError([{ path: '', message: 'overlay data must be a JSON object' }], 'overlay data');
  }
  const issues: ValidationIssue[] = [];

  // universes from the already-valid map
  const layerIds = new Set<string>(map.layers.map((l) => l.id));
  const libraryNodeIds = new Set<string>(map.nodes.map((n) => n.id));
  const libraryEdgeIds = new Set<string>(map.edges.map((e) => e.id));
  const modeUniverse = modeUniverseOf(map); // D78: map-relative — registry modes are valid chat state
  const nonLeafIds = new Set<string>();
  for (const n of map.nodes) {
    if (typeof n.parent === 'string') nonLeafIds.add(n.parent);
  }

  const mapId = overlay['mapId'];
  if (mapId !== null && typeof mapId !== 'string') {
    push(issues, 'mapId', 'must be a string or null');
  }

  const loc = overlay['currentLocationId'];
  if (loc !== null && typeof loc !== 'string') {
    push(issues, 'currentLocationId', 'must be a string or null');
  } else if (
    typeof loc === 'string' &&
    libraryNodeIds.has(loc) &&
    !options.tolerateIneligiblePin && // C27 load path — see the options doc above
    !isPinEligible(loc, map.nodes)    // D58: pin-eligible kind AND currently childless
  ) {
    push(
      issues,
      'currentLocationId',
      `must be a pin-eligible node — kind must be one of: ${[...PIN_ELIGIBLE_KINDS].join(', ')}, and it must currently be childless (containers never hold the pin; C1/F27, D58)`,
    );
  }

  // D78: strict against THIS map's universe (built-ins ∪ registry ids). The
  // C32/D78 degrade for chat state from another map's registry belongs to the
  // facade's loadMap, not here (the D58 tolerance shape).
  const travelMode = overlay['travelMode'];
  if (typeof travelMode !== 'string' || !modeUniverse.has(travelMode)) {
    push(issues, 'travelMode', `must be one of: ${[...modeUniverse].join(', ')}`);
  }

  if (overlay['statusNote'] !== undefined && typeof overlay['statusNote'] !== 'string') {
    push(issues, 'statusNote', 'must be a string');
  }

  // user nodes — full node rules, plus: ids unique within the overlay AND free
  // of library collisions; parent forbidden (§6.2); layer must exist in the map
  const userNodes = overlay['userNodes'];
  const overlayNodeIds = new Set<string>();
  if (!Array.isArray(userNodes)) {
    push(issues, 'userNodes', 'must be an array');
  } else {
    const seen = new Set<string>();
    userNodes.forEach((node, i) => {
      const path = `userNodes[${i}]`;
      if (!isObject(node)) {
        push(issues, path, 'must be an object');
        return;
      }
      const id = node['id'];
      if (isNonEmptyString(id)) {
        if (seen.has(id)) {
          push(issues, `${path}.id`, `duplicate user node id '${id}'`);
        } else if (libraryNodeIds.has(id)) {
          push(issues, `${path}.id`, `must not collide with a library node id ('${id}')`);
        } else {
          seen.add(id);
          overlayNodeIds.add(id);
        }
      } else {
        requireNonEmptyString(issues, id, `${path}.id`);
      }
      if (typeof node['parent'] === 'string') nonLeafIds.add(node['parent']);
      checkNodeFields(issues, node, path, layerIds, true);
    });
  }

  // user edges — full edge rules; endpoints exist among library ∪ overlay nodes
  const userEdges = overlay['userEdges'];
  const userEdgeIds = new Set<string>();
  if (!Array.isArray(userEdges)) {
    push(issues, 'userEdges', 'must be an array');
  } else {
    const nodeUniverse = new Set<string>([...libraryNodeIds, ...overlayNodeIds]);
    const seen = new Set<string>();
    userEdges.forEach((edge, i) => {
      const path = `userEdges[${i}]`;
      if (!isObject(edge)) {
        push(issues, path, 'must be an object');
        return;
      }
      const id = edge['id'];
      if (isNonEmptyString(id)) {
        if (seen.has(id)) {
          push(issues, `${path}.id`, `duplicate user edge id '${id}'`);
        } else if (libraryEdgeIds.has(id)) { // C5/F50: user ids never collide with library ids
          push(issues, `${path}.id`, `must not collide with a library edge id ('${id}')`);
        } else {
          seen.add(id);
          userEdgeIds.add(id);
        }
      } else {
        requireNonEmptyString(issues, id, `${path}.id`);
      }
      checkEdge(issues, edge, path, { nodeIds: nodeUniverse, nonLeafIds, modeUniverse });
    });
  }

  // blocked — every key an existing edge (library ∪ userEdges), every value a
  // non-empty reason (D20; dangling block = reject)
  const blocked = overlay['blocked'];
  if (!isObject(blocked)) {
    push(issues, 'blocked', 'must be an object mapping edge ids to reasons');
  } else {
    const edgeUniverse = new Set<string>([...libraryEdgeIds, ...userEdgeIds]);
    for (const key of Object.keys(blocked)) {
      if (!edgeUniverse.has(key)) {
        push(issues, `blocked.${key}`, `must reference an existing edge id ('${key}' not found)`);
      }
      if (!isNonEmptyString(blocked[key])) {
        push(issues, `blocked.${key}`, 'must be a non-empty reason string');
      }
    }
  }

  if (issues.length > 0) throw new MapValidationError(issues, 'overlay data');
  return overlay as unknown as ChatMapOverlay; // shape proven by the checks above
}
