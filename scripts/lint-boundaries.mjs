#!/usr/bin/env node
// scripts/lint-boundaries.mjs — import-boundary lint (Task 0).
// Enforces R5 (core imports nothing outward) and the layering
// core ← app ← st. Zero dependencies; run via `npm run verify`.
//
// Rules:
//   src/core/**  may import: src/core/**, node:* builtins — nothing else (R5)
//   src/app/**   may import: src/app/**,  src/core/**, node:*, data/** (D70:
//                 display-only fixture imports — data flows inward, never out;
//                 the dev harness renders FX1 per D69)
//   src/st/**    may import: src/st/**,   src/app/**, src/core/**, node:*
//   data/**      may import: src/core/** (type-only, the fixture precedent),
//                 data/**, node:* — D70's "data imports nothing outward" made
//                 mechanical: data is never code's dependency target

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const DATA = join(ROOT, 'data');
const LAYERS = ['core', 'app', 'st', 'data'];
const ALLOWED = {
  core: new Set(['core']),
  app: new Set(['core', 'app', 'data']), // D70: app → data/ (display-only fixtures)
  st: new Set(['core', 'app', 'st']),
  data: new Set(['core', 'data']), // D70: fixtures import core TYPES only, never outward
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function layerOf(file) {
  const relData = relative(DATA, file);
  if (!relData.startsWith('..') && relData !== '') return 'data'; // D70 pseudo-layer
  const rel = relative(SRC, file);
  if (rel.startsWith('..')) return 'outside';
  const first = rel.split(sep)[0];
  return LAYERS.includes(first) ? first : 'outside';
}

// D70: layerOf classifies <root>/data/ files/targets as the pseudo-layer
// 'data' (frozen fixture modules the harness may render but never mutate).

// static import/export ... from 'spec' (single statement, no semicolons spanned)
const STATIC_RE = /^[ \t]*(?:import|export)[^\n]*?from[ \t]*['"]([^'"]+)['"]/gm;
// dynamic import('spec')
const DYNAMIC_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

let failures = 0;

for (const file of [...walk(SRC), ...walk(DATA)]) {
  const layer = layerOf(file);
  if (!LAYERS.includes(layer)) continue;
  const text = readFileSync(file, 'utf8');
  const specs = new Set();
  for (const m of text.matchAll(STATIC_RE)) specs.add(m[1]);
  for (const m of text.matchAll(DYNAMIC_RE)) specs.add(m[1]);

  for (const spec of specs) {
    if (spec.startsWith('node:')) continue;
    // R5: core imports nothing outward — no packages, no app/st, no host
    if (layer === 'core' && !spec.startsWith('.')) {
      failures++;
      console.error(`BOUNDARY [R5] ${relative(ROOT, file)}: core imports package '${spec}'`);
      continue;
    }
    // D70: data is never code's dependency target — packages are out too
    if (layer === 'data' && !spec.startsWith('.')) {
      failures++;
      console.error(`BOUNDARY [D70] ${relative(ROOT, file)}: data imports package '${spec}'`);
      continue;
    }
    if (!spec.startsWith('.')) continue; // package imports elsewhere are fine (app/st)
    const target = resolve(dirname(file), spec);
    const targetLayer = layerOf(target);
    if (!ALLOWED[layer].has(targetLayer)) {
      failures++;
      console.error(`BOUNDARY ${relative(ROOT, file)}: '${layer}' may not import '${spec}' (target: ${targetLayer})`);
    }
  }
}

if (failures > 0) {
  console.error(`\nlint-boundaries: ${failures} violation(s)`);
  process.exit(1);
}
console.log('lint-boundaries: clean');
