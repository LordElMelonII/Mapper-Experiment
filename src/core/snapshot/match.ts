// src/core/snapshot/match.ts — the C21/D26 pure matcher (PKG A-008). Matching
// free text to nodes is word-boundary, case-insensitive over label ∪ aliases;
// a failed match yields a nearest-suggestions corrective string (D26). The
// pure function lives here; only its orchestration (subscribing to events,
// showing popups) lives in the host layer (C21/R6).
//
// Names are matched LITERALLY — the matcher never builds a regex from user
// data, so labels full of regex metacharacters ('C. Motel (East)') can never
// explode, no matter what regex scripts the user runs themselves (D26).
//
// R5: imports nothing but the frozen types. Pure, deterministic, host-free,
// DOM-free.

import type { MapNodeData } from '../api';

/** Word character for boundary purposes (ASCII — names are matched literally). */
const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[a-zA-Z0-9_]/.test(ch);

/** Every name a node is matched and suggested by: label ∪ aliases (C21). */
const namesOf = (node: MapNodeData): string[] => [node.label, ...(node.aliases ?? [])];

/**
 * True when `name` occurs in `haystack` at word boundaries, case-insensitively
 * (C21). A boundary is a non-word character (or the haystack's edge) on both
 * sides — 'tat' never matches inside 'Station'.
 */
function nameInText(name: string, haystack: string): boolean {
  if (name.length === 0) return false;
  const needle = name.toLowerCase();
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    if (!isWordChar(haystack[at - 1]) && !isWordChar(haystack[at + needle.length])) return true;
    at = haystack.indexOf(needle, at + 1);
  }
  return false;
}

/**
 * C21: the nodes any of whose names (label ∪ aliases) occur in `text` at word
 * boundaries, case-insensitively — in input order. Pure; the host decides what
 * a hit means (toast, pin suggestion, corrective scan).
 */
export function matchNodes(nodes: MapNodeData[], text: string): MapNodeData[] {
  const haystack = text.toLowerCase();
  return nodes.filter((node) => namesOf(node).some((name) => nameInText(name, haystack)));
}

/**
 * Plain two-row Levenshtein DP (no library, no banding — Ponytail). Case is
 * folded first: matching is case-insensitive (C21), so case slips are free.
 */
function levenshtein(a: string, b: string): number {
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, substitution);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * D26: the corrective line for a narrated place that matched NOTHING —
 * `Unknown place '<input>' — did you mean <a>, <b>, or <c>?` over the nearest
 * labels ∪ aliases (bounded Levenshtein, top 3; 2 ⇒ '<a> or <b>', 1 ⇒ '<a>').
 * Undefined when there is nothing to correct: blank/whitespace input (a blank
 * toast is host business, not core's) or a text that DID match (C21 — the
 * corrective exists for failed matches). C23: unnamed user nodes never feed
 * suggestions — this line is prompt-facing.
 */
export function suggestCorrective(nodes: MapNodeData[], text: string): string | undefined {
  const input = text.trim();
  if (input.length === 0) return undefined;
  if (matchNodes(nodes, input).length > 0) return undefined;
  const needle = input.toLowerCase();
  const ranked: Array<{ name: string; distance: number }> = [];
  for (const node of nodes) {
    if (node.origin === 'user' && node.label === 'Waypoint') continue; // C23 — never prompt-facing
    for (const name of namesOf(node)) {
      ranked.push({ name, distance: levenshtein(needle, name.toLowerCase()) });
    }
  }
  ranked.sort((x, y) => x.distance - y.distance); // stable — input order breaks ties
  const seen = new Set<string>();
  const top: string[] = [];
  for (const { name } of ranked) {
    if (top.length === 3) break;
    if (seen.has(name)) continue; // one node's label and alias can be near-identical — suggest once
    seen.add(name);
    top.push(name);
  }
  if (top.length === 0) return undefined;
  const listing = top.length < 3 ? top.join(' or ') : `${top[0]}, ${top[1]}, or ${top[2]}`; // 1 ⇒ 'a', 2 ⇒ 'a or b' (D26)
  return `Unknown place '${input}' — did you mean ${listing}?`;
}
