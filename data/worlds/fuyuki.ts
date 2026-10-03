// data/worlds/fuyuki.ts — FX1 fixture: Fuyuki/Misaki two-layer demo map (PKG A-003).
// Derived from `Notes for locations.md` (D54: the Fuyuki material is a demo, not
// canon): 13 leaves + 2 district containers on layer-fuyuki, one train hub on
// layer-misaki, one cross-layer station arc (C3, F17) and one blocked-bridge arc
// (F14/D20). Canonical unit is TIME — minutes (F21/D45), matching the legacy table.
//
// Data + deepFreeze only (D57: a TS module, compile-time typechecked against the
// frozen WorldMapData contract — no JSON, no value imports). Each arc is authored
// once; C6 makes it bidirectional, so there are no reverse duplicates. Arc ids are
// hand-authored: C5 governs runtime engine-assigned ids, not authored data.
// FX2 preconditions authored here: arc-emiya-residence-fuyuki-station (walk 50)
// and arc-fuyuki-station-misaki-town (train 300); the route assertion is M2's.
// R5: src/core never imports data/ (lint-enforced). Tests and the dev harness
// may import it — display-only, D70 (the fixture stays frozen, deep-freeze on).

import type { WorldMapData } from '../../src/core/api';

function deepFreeze<T extends object>(value: T): T {
  Object.values(value).forEach((v) => typeof v === 'object' && v !== null && deepFreeze(v));
  return Object.freeze(value);
}

export const fuyukiMap: WorldMapData = deepFreeze({
  schemaVersion: 2, // equals CURRENT_SCHEMA_VERSION — pinned by the literal type and asserted in the spec (C31)
  id: 'fuyuki-misaki',
  name: 'Fuyuki & Misaki (FX1)',
  layers: [
    { id: 'layer-fuyuki', name: 'Fuyuki City' },
    { id: 'layer-misaki', name: 'Misaki Town' },
  ],
  scale: { unitPerPx: 0.2, unitLabel: 'min', unitKind: 'time', terrainMultipliers: { mountain: 2.5 } },
  nodes: [
    // containers group and label; they never connect and never hold the pin (F07, C1)
    { id: 'district-miyama', label: 'Miyama', kind: 'district', layer: 'layer-fuyuki' },
    { id: 'district-shinto', label: 'Shinto', kind: 'district', layer: 'layer-fuyuki' },
    // the 13 leaves of FX1's "13 locations" — 12 'location' + the station leaf as 'hub' (F09); y grows south (C9)
    { id: 'emiya-residence', label: 'Emiya Residence', kind: 'location', layer: 'layer-fuyuki', parent: 'district-miyama', position: { x: 100, y: 250 }, aliases: ['Emiya home'] },
    { id: 'shopping-district', label: 'Shopping District', kind: 'location', layer: 'layer-fuyuki', parent: 'district-miyama', position: { x: 190, y: 300 }, aliases: ['shopping street'] },
    { id: 'homurahara-academy', label: 'Homurahara Academy', kind: 'location', layer: 'layer-fuyuki', parent: 'district-miyama', position: { x: 170, y: 160 }, aliases: ['school'] },
    { id: 'matou-residence', label: 'Matou Residence', kind: 'location', layer: 'layer-fuyuki', parent: 'district-miyama', position: { x: 60, y: 210 }, aliases: ['Matou home'] },
    { id: 'tohsaka-residence', label: 'Tohsaka Residence', kind: 'location', layer: 'layer-fuyuki', parent: 'district-miyama', position: { x: 95, y: 125 }, aliases: ['Tohsaka home'] },
    { id: 'ryuudou-temple', label: 'Ryuudou Temple', kind: 'location', layer: 'layer-fuyuki', parent: 'district-miyama', position: { x: 150, y: 470 }, aliases: ['temple'] },
    { id: 'outskirts', label: 'Outskirts', kind: 'location', layer: 'layer-fuyuki', position: { x: 30, y: 360 } },
    { id: 'fuyuki-bridge', label: 'Fuyuki Bridge', kind: 'location', layer: 'layer-fuyuki', position: { x: 400, y: 285 }, aliases: ['Big Bridge'] },
    { id: 'fuyuki-station', label: 'Fuyuki Station', kind: 'hub', layer: 'layer-fuyuki', parent: 'district-shinto', position: { x: 560, y: 260 }, aliases: ['Station Front', 'station'], transit: { type: 'train' } },
    { id: 'harbor', label: 'Harbor', kind: 'location', layer: 'layer-fuyuki', parent: 'district-shinto', position: { x: 595, y: 420 }, aliases: ['port'] },
    { id: 'kotomine-church', label: 'Kotomine Church', kind: 'location', layer: 'layer-fuyuki', position: { x: 520, y: 85 }, aliases: ['church'] },
    { id: 'ghost-house', label: 'Ghost House', kind: 'location', layer: 'layer-fuyuki', position: { x: 625, y: 140 }, aliases: ['Edelfelt Mansion'] },
    { id: 'einzbern-castle', label: 'Einzbern Castle', kind: 'location', layer: 'layer-fuyuki', position: { x: -380, y: 120 }, aliases: ['Einzbern'] },
    // the misaki layer's single hub (F09); reached only via the cross-layer arc (F17)
    { id: 'misaki-town', label: 'Misaki Town', kind: 'hub', layer: 'layer-misaki', position: { x: 200, y: 200 }, transit: { type: 'train' } },
  ],
  edges: [
    // same-layer walk arcs — authored time wins (C14 row 3); C6: bidirectional
    { id: 'arc-emiya-residence-shopping-district', source: 'emiya-residence', target: 'shopping-district', modes: { walk: { allowed: true, authoredMinutes: 12 } } },
    { id: 'arc-emiya-residence-homurahara-academy', source: 'emiya-residence', target: 'homurahara-academy', modes: { walk: { allowed: true, authoredMinutes: 18 } } },
    { id: 'arc-emiya-residence-matou-residence', source: 'emiya-residence', target: 'matou-residence', modes: { walk: { allowed: true, authoredMinutes: 22 } } },
    { id: 'arc-emiya-residence-ryuudou-temple', source: 'emiya-residence', target: 'ryuudou-temple', modes: { walk: { allowed: true, authoredMinutes: 50 } } },
    { id: 'arc-emiya-residence-outskirts', source: 'emiya-residence', target: 'outskirts', modes: { walk: { allowed: true, authoredMinutes: 30 } } },
    { id: 'arc-emiya-residence-fuyuki-station', source: 'emiya-residence', target: 'fuyuki-station', modes: { walk: { allowed: true, authoredMinutes: 50 } } }, // FX2 leg 1
    // FX1's one blocked sample (F14/D20): excluded from routing, still reported with its reason (C2)
    { id: 'arc-emiya-residence-fuyuki-bridge', source: 'emiya-residence', target: 'fuyuki-bridge', modes: { walk: { allowed: true, authoredMinutes: 25 } }, blocked: { reason: 'Bridge closed by local authorities' } },
    { id: 'arc-shopping-district-homurahara-academy', source: 'shopping-district', target: 'homurahara-academy', modes: { walk: { allowed: true, authoredMinutes: 10 } } },
    { id: 'arc-shopping-district-matou-residence', source: 'shopping-district', target: 'matou-residence', modes: { walk: { allowed: true, authoredMinutes: 12 } } },
    { id: 'arc-shopping-district-tohsaka-residence', source: 'shopping-district', target: 'tohsaka-residence', modes: { walk: { allowed: true, authoredMinutes: 15 } } },
    { id: 'arc-shopping-district-outskirts', source: 'shopping-district', target: 'outskirts', modes: { walk: { allowed: true, authoredMinutes: 25 } } },
    { id: 'arc-shopping-district-fuyuki-bridge', source: 'shopping-district', target: 'fuyuki-bridge', modes: { walk: { allowed: true, authoredMinutes: 15 } } },
    { id: 'arc-homurahara-academy-matou-residence', source: 'homurahara-academy', target: 'matou-residence', modes: { walk: { allowed: true, authoredMinutes: 15 } } },
    { id: 'arc-homurahara-academy-tohsaka-residence', source: 'homurahara-academy', target: 'tohsaka-residence', modes: { walk: { allowed: true, authoredMinutes: 15 } } },
    { id: 'arc-homurahara-academy-ryuudou-temple', source: 'homurahara-academy', target: 'ryuudou-temple', modes: { walk: { allowed: true, authoredMinutes: 40 } } },
    { id: 'arc-homurahara-academy-outskirts', source: 'homurahara-academy', target: 'outskirts', modes: { walk: { allowed: true, authoredMinutes: 15 } } },
    { id: 'arc-matou-residence-tohsaka-residence', source: 'matou-residence', target: 'tohsaka-residence', modes: { walk: { allowed: true, authoredMinutes: 5 } } },
    { id: 'arc-matou-residence-outskirts', source: 'matou-residence', target: 'outskirts', modes: { walk: { allowed: true, authoredMinutes: 20 } } },
    { id: 'arc-ryuudou-temple-outskirts', source: 'ryuudou-temple', target: 'outskirts', modes: { walk: { allowed: true, authoredMinutes: 45 } } },
    { id: 'arc-outskirts-fuyuki-bridge', source: 'outskirts', target: 'fuyuki-bridge', modes: { walk: { allowed: true, authoredMinutes: 35 } } },
    { id: 'arc-outskirts-ghost-house', source: 'outskirts', target: 'ghost-house', modes: { walk: { allowed: true, authoredMinutes: 50 } } },
    { id: 'arc-outskirts-kotomine-church', source: 'outskirts', target: 'kotomine-church', modes: { walk: { allowed: true, authoredMinutes: 60 } } },
    // from the table's TRANSIT line "O:EC4h(walk),1h(car)" — one arc, two allowed modes (C14)
    { id: 'arc-outskirts-einzbern-castle', source: 'outskirts', target: 'einzbern-castle', modes: { walk: { allowed: true, authoredMinutes: 240 }, car: { allowed: true, authoredMinutes: 60 } } },
    { id: 'arc-fuyuki-bridge-fuyuki-station', source: 'fuyuki-bridge', target: 'fuyuki-station', modes: { walk: { allowed: true, authoredMinutes: 25 } } },
    { id: 'arc-fuyuki-bridge-harbor', source: 'fuyuki-bridge', target: 'harbor', modes: { walk: { allowed: true, authoredMinutes: 15 } } },
    { id: 'arc-fuyuki-station-harbor', source: 'fuyuki-station', target: 'harbor', modes: { walk: { allowed: true, authoredMinutes: 15 } } },
    { id: 'arc-fuyuki-station-kotomine-church', source: 'fuyuki-station', target: 'kotomine-church', modes: { walk: { allowed: true, authoredMinutes: 20 } } },
    { id: 'arc-fuyuki-station-ghost-house', source: 'fuyuki-station', target: 'ghost-house', modes: { walk: { allowed: true, authoredMinutes: 15 } } },
    { id: 'arc-kotomine-church-ghost-house', source: 'kotomine-church', target: 'ghost-house', modes: { walk: { allowed: true, authoredMinutes: 15 } } },
    // FX2 leg 2 — the map's only cross-layer arc (C3/F17): an ordinary arc whose endpoints
    // live on different layers, from the table's TRANSIT line "S:MT5h(train)". Deliberately
    // excluded per packet: "RT:Cavern3km(sub)" — the Cavern is not one of the 13 locations.
    { id: 'arc-fuyuki-station-misaki-town', source: 'fuyuki-station', target: 'misaki-town', modes: { train: { allowed: true, authoredMinutes: 300 } } },
  ],
});
