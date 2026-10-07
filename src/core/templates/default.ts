// src/core/templates/default.ts — the FX4 template contents (PKG A-009).
import type { MapSnapshot } from '../api';
// D23/D24: a default template ships and the format is template-driven — XML
// is just the default; this markdown sample proves any words work (F33/F34).
// The templates are USER DATA words: they consume the fixed C22 variable
// contract and nothing else. The engine is injected (D62/R5) — this module
// holds only strings, so the shipped bundle stays engine-free.
//
// Escaping: value interpolations use Handlebars' triple-stache {{{ }}}
// deliberately. The block is plain text for an LLM, not parsed XML — the
// double-stache default would HTML-escape real-world labels ("Jerry's" ->
// "Jerry&#x27;s"), corrupting prompt words with entity noise (F39 token
// discipline). Formatting lives in the template words; values pass through
// verbatim (C22, R1).
//
// D95: the contract's blockedNodes[] (each blocked node's authored label +
// reason; the snapshot omits it entirely when nothing is blocked) renders a
// blocked-places section in both templates — blocked PLACES list the way
// blocked PATHS already list (the route lines' blocked= reason). C23-safe:
// authored labels + reasons only, never ids.
//
// Whitespace: every optional section keeps its separator INSIDE its {{#if}}
// so an absent field leaves no stray blank line, and every block tag is kept
// mid-line (or eaten as a standalone line) — the FX4 goldens pin the exact
// rendered bytes.
//
// C27 degradation: a null location renders the unknown-position warning
// branch ({{else}}) — statusNote/corrective still ride on degraded snapshots
// (A-008 passthrough), so they render there too. C23: no machine ids appear
// anywhere — the words below never name an id-shaped token.

/** F34/D24: the default XML template — the classic lookup-table block look. */
export const DEFAULT_TEMPLATE = `{{#if location}}<travel_context>
  <location>{{{location}}}</location>
{{#if region}}  <region>{{{region}}}</region>
{{/if}}{{#if layer}}  <layer>{{{layer}}}</layer>
{{/if}}{{#if statusNote}}  <status>{{{statusNote}}}</status>
{{/if}}{{#if routes}}  <routes unit="{{{unit}}}">
{{#each routes}}    <route label="{{{label}}}"{{#if direction}} direction="{{{direction}}}"{{/if}} cost="{{{cost}}}" mode="{{{mode}}}"{{#if blockedReason}} blocked="{{{blockedReason}}}"{{/if}}/>
{{/each}}  </routes>
{{/if}}{{#if blockedNodes}}  <blocked_places>
{{#each blockedNodes}}    <place label="{{{label}}}" reason="{{{reason}}}"/>
{{/each}}  </blocked_places>
{{/if}}{{#if destinations}}  <destinations unit="{{{unit}}}"{{#if truncated}} truncated="true"{{/if}}>
{{#each destinations}}    <destination label="{{{label}}}" via="{{{via}}}" cost="{{{cost}}}" mode="{{{mode}}}"/>
{{/each}}  </destinations>
{{/if}}{{#if corrective}}  <corrective>{{{corrective}}}</corrective>
{{/if}}</travel_context>{{else}}<travel_context status="unknown">
  The party's current position is unknown — the pinned location is missing or no longer valid on this map.
  Do not report distances or directions until the travelers say where they are.
{{#if statusNote}}  <status>{{{statusNote}}}</status>
{{/if}}{{#if corrective}}  <corrective>{{{corrective}}}</corrective>
{{/if}}</travel_context>{{/if}}`;

/** F33/D24: one markdown variant over the same C22 contract — the FX4 second golden. */
export const MARKDOWN_SAMPLE = `{{#if location}}**Travel status**

- **Location:** {{{location}}}{{#if region}} ({{{region}}} district){{/if}}
- **Map layer:** {{{layer}}}
{{#if statusNote}}
- **Status:** {{{statusNote}}}
{{/if}}{{#if routes}}
**Nearby routes** ({{{unit}}}):

{{#each routes}}- {{{label}}}{{#if direction}} ({{{direction}}}){{/if}}: {{{cost}}} ({{{mode}}}){{#if blockedReason}} — **BLOCKED**: {{{blockedReason}}}{{/if}}
{{/each}}
{{/if}}{{#if blockedNodes}}
**Off limits**:

{{#each blockedNodes}}- {{{label}}} — {{{reason}}}
{{/each}}
{{/if}}{{#if destinations}}
**Known destinations** ({{{unit}}}):

{{#each destinations}}- {{{label}}} via {{{via}}}: {{{cost}}} ({{{mode}}})
{{/each}}
{{/if}}{{#if truncated}}
_(destination list truncated — entries omitted)_
{{/if}}{{#if corrective}}
> **Note:** {{{corrective}}}
{{/if}}{{else}}**Travel status**

The party's current position is unknown — the pinned location is missing or no longer valid on this map. Do not report distances or directions until the travelers say where they are.{{#if statusNote}}

Status: {{{statusNote}}}{{/if}}{{#if corrective}}

Note: {{{corrective}}}{{/if}}{{/if}}`;

/**
 * C22: map a MapSnapshot to the template engine's fixed variable contract —
 * one home for the contract (the facade imports this; never a second copy).
 * Field-by-field explicit (the D63 rename `destinationsTruncated` ->
 * `truncated` is the point of the mapping), verbatim otherwise: route,
 * destination and the D95 blockedNodes entries pass through exactly as the
 * snapshot built them (blockedNodes absent on the snapshot stays absent —
 * the renderer adds nothing), numbers stay numbers (R1 — string formatting
 * belongs to the template words), and C23 exclusions ride in from the
 * snapshot untouched.
 */
export function snapshotContext(snapshot: MapSnapshot): Record<string, unknown> {
  return {
    location: snapshot.location,
    region: snapshot.region,
    layer: snapshot.layer,
    statusNote: snapshot.statusNote,
    routes: snapshot.routes,
    blockedNodes: snapshot.blockedNodes, // D95: the blocked-places listing, verbatim (omitted stays omitted)
    destinations: snapshot.destinations,
    truncated: snapshot.destinationsTruncated,
    unit: snapshot.unit,
    corrective: snapshot.corrective,
  };
}
