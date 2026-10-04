// P2 M4 gate — adversarial stylesheet-cascade suite (verifier, D-P2M4).
// Expectations derived from the SPEC, never from the implementation:
//   §5 Phase 2 M4 — "label culling, `cy.batch` bulk ops" as deliberate,
//     tested behavior (the cull is stylesheet POLICY, not renderer accident).
//   B-107 (AGENTS.md §6, binding) — "`min-zoomed-font-size` is a hide-floor,
//     not an upscale-floor — a label zoomed below it is suppressed entirely;
//     badge/small-label styles must not set it." So the stylesheet must set
//     it NOWHERE (the gotcha survives B-115 untouched), and the cull
//     cascade resolves exactly the B-115 policy below.
//   C2 — blocked arcs are "excluded from routing but still DRAWN — dashed,
//     never hidden" (CORE.md): no M4 entry may hide EDGES, and the M2
//     blocked+selected accent order (B-106) plus the M3 curved+blocked
//     orthogonality (B-111) must SURVIVE the M4 entries.
//   C3/F09, AMENDED by B-115 (P2-M4 verifier gate, major finding) — the
//     pin's label (party wayfinding, an ordinary node: no false affordance)
//     and the selected node's label (under inspection) never cull; BADGES
//     CULL WITH ALL MAP CONTENT: the verifier derived (findNearestElements
//     touch slop) that a culled badge's tap anchor sits inside its host
//     node's touch reach (22·z + 8 px vs ≈56.6·z px away, z ≲ 0.28) while
//     its 11·z ≈ 2–3 px text is illegible dust — the B-113 "never culls"
//     exemption was a visible-but-dead affordance in every culled view.
//     District labels cull with everything else (no exemption).
//   D67/D3 discipline — cytoscape-semantics claims are verified against the
//     INSTALLED runtime, never memory: the cascade cells below build a real
//     headless cy (headless: true + styleEnabled: true, per the AGENTS.md §6
//     gotcha) with GRAPH_STYLESHEET verbatim and read RESOLVED styles, so a
//     reordered entry, a renamed class, or a dropped exemption fails here.
//
// Structural seam: GRAPH_STYLESHEET is exported plain data (D7) from
// src/app/graph/graph.service.ts. Importing that module pulls @angular/core
// and cytoscape — both plain ESM, constructible headless in bare Node; the
// GraphService CLASS is never instantiated here (its constructor needs an
// Angular injection context), only the stylesheet data and the library.
import { describe, expect, it } from 'vitest';
import cytoscape from 'cytoscape';
import type { Core, StylesheetStyle } from 'cytoscape';
import { GRAPH_STYLESHEET } from '../../src/app/graph/graph.service';

const CULL = 'tme-cull-labels';

const HIDING_PROPS = ['display', 'visibility', 'opacity'] as const;

/** A headless cy running the app's REAL stylesheet (the runtime is the judge). */
const cyWithRealStyles = (): Core =>
  cytoscape({
    container: null,
    headless: true,
    styleEnabled: true,
    style: GRAPH_STYLESHEET,
    layout: { name: 'preset' },
  });

const addNode = (cy: Core, id: string, classes: string): void => {
  cy.add({ group: 'nodes', data: { id, label: id }, classes, position: { x: 0, y: 0 } });
};

const addEdge = (cy: Core, id: string, classes: string): void => {
  cy.add({ group: 'nodes', data: { id: `${id}-src` }, position: { x: 0, y: 0 } });
  cy.add({ group: 'nodes', data: { id: `${id}-tgt` }, position: { x: 100, y: 0 } });
  cy.add({ group: 'edges', data: { id, source: `${id}-src`, target: `${id}-tgt` }, classes });
};

// cytoscape resolves style reads as normalized strings ('1'/'0', 'rgb(...)')
// — every comparison below coerces; the values themselves are the runtime's.
const opacityOf = (ele: { style(name: string): unknown }): number => Number(ele.style('text-opacity'));

// ---------------------------------------------------------------------------
// B-107 (binding): the hide-floor appears NOWHERE in the stylesheet.
// ---------------------------------------------------------------------------

describe('B-107 gotcha: no hide-floor anywhere (AGENTS.md §6, binding)', () => {
  it('no stylesheet entry sets min-zoomed-font-size (a hide-floor would suppress labels renderer-internally, unassertably)', () => {
    expect(GRAPH_STYLESHEET.length).toBeGreaterThan(0); // non-vacuous: the data arrived
    for (const entry of GRAPH_STYLESHEET) {
      expect(
        entry.style,
        `selector "${entry.selector}" must not set min-zoomed-font-size (B-107: hide-floor, not upscale-floor)`,
      ).not.toHaveProperty('min-zoomed-font-size');
    }
  });

  it('the cull entry is node-scoped and no entry ever hides an EDGE (C2: blocked arcs are drawn, never hidden)', () => {
    for (const entry of GRAPH_STYLESHEET) {
      const selector = String(entry.selector);
      if (selector.includes('edge')) {
        for (const prop of HIDING_PROPS) {
          expect(
            entry.style,
            `edge selector "${selector}" sets "${prop}" — an edge-hiding rule violates C2 (drawn, never hidden)`,
          ).not.toHaveProperty(prop);
        }
      }
    }
    // The cull policy itself must stay node-scoped: a bare/element selector
    // would blanket-hide edges (and compound parents' boxes) too.
    const cullEntries = GRAPH_STYLESHEET.filter((e) => String(e.selector).includes(CULL));
    expect(cullEntries.length).toBeGreaterThanOrEqual(1);
    for (const entry of cullEntries) {
      expect(String(entry.selector), 'every cull entry must be node-scoped (C2 edges never hide)').toMatch(
        /^node\./,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// The cull cascade against the INSTALLED runtime (declaration order,
// last-match-wins — the exemptions are data, per the D-P2M4 rulings).
// ---------------------------------------------------------------------------

describe('label-cull cascade on the installed cytoscape runtime (C3, F09, §5 M4)', () => {
  it('plain map nodes cull (text-opacity 0) while carrying the blanket class; without it they do not', () => {
    const cy = cyWithRealStyles();
    addNode(cy, 'plain', '');
    addNode(cy, 'culled', CULL);
    expect(opacityOf(cy.getElementById('plain'))).toBe(1);
    expect(opacityOf(cy.getElementById('culled'))).toBe(0);
    cy.destroy();
  });

  it('the PIN never culls (F09 wayfinding) — the exemption is cascade DATA, so order matters and a reorder fails here', () => {
    const cy = cyWithRealStyles();
    addNode(cy, 'pin', `tme-pin ${CULL}`);
    expect(opacityOf(cy.getElementById('pin'))).toBe(1);
    cy.destroy();
  });

  it('BADGE text culls WITH all map content (B-115 amended policy: hidden, not a dead affordance) — and badge styles still set no hide-floor (B-107)', () => {
    const cy = cyWithRealStyles();
    addNode(cy, 'badge', `tme-badge ${CULL}`);
    const badge = cy.getElementById('badge');
    expect(opacityOf(badge), 'the blanket cull rule must reach the badge — no exemption entry may follow it').toBe(0);
    expect(parseFloat(String(badge.style('min-zoomed-font-size')))).toBeLessThanOrEqual(0); // unset → 0 (runtime default, esm.mjs:18495)
    cy.destroy();
  });

  it('the SELECTED node never culls (the inspected node) — carrying BOTH classes resolves visible (cascade, not class removal)', () => {
    const cy = cyWithRealStyles();
    addNode(cy, 'sel', `tme-selected ${CULL}`);
    expect(opacityOf(cy.getElementById('sel'))).toBe(1);
    cy.destroy();
  });

  it('compound classes compose: pin+badge+culled stays visible (the PIN exemption — no badge entry exists to say otherwise); a DISTRICT culled stays culled (no exemption)', () => {
    const cy = cyWithRealStyles();
    addNode(cy, 'pinbadge', `tme-pin tme-badge ${CULL}`);
    addNode(cy, 'district', `tme-district ${CULL}`);
    expect(opacityOf(cy.getElementById('pinbadge'))).toBe(1);
    expect(opacityOf(cy.getElementById('district'))).toBe(0);
    cy.destroy();
  });

  it('structural guard: the cull entry precedes every exemption entry, and the B-113 badge exemption is GONE (B-115: a re-added entry would resurrect the dead affordance this policy removes)', () => {
    const selectors = GRAPH_STYLESHEET.map((e: StylesheetStyle) => String(e.selector));
    const cullIdx = selectors.findIndex((s) => s === `node.${CULL}`);
    expect(cullIdx, 'the blanket cull entry exists').toBeGreaterThanOrEqual(0);
    for (const exemption of ['node.tme-pin', 'node.tme-selected']) {
      const idx = selectors.findIndex((s) => s === `${exemption}.${CULL}`);
      expect(idx, `${exemption}.${CULL} exemption entry exists`).toBeGreaterThan(cullIdx);
    }
    expect(
      selectors.includes(`node.tme-badge.${CULL}`),
      'node.tme-badge.tme-cull-labels must NOT exist (B-115: badges cull with all map content — the runtime cell above is the mutant discriminator for a re-added entry)',
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M2/M3 edge invariants must SURVIVE the M4 entries (C2, B-106, B-111).
// ---------------------------------------------------------------------------

describe('M2/M3 edge presentation survives M4 (C2 drawn-never-hidden, B-106 order, B-111 orthogonality)', () => {
  it('a blocked arc stays DRAWN and dashed (C2) — never display/visibility/opacity-hidden at runtime', () => {
    const cy = cyWithRealStyles();
    addEdge(cy, 'e-blocked', 'tme-blocked');
    const edge = cy.getElementById('e-blocked');
    expect(edge.style('line-style')).toBe('dashed');
    expect(edge.style('display')).not.toBe('none');
    expect(edge.style('visibility')).toBe('visible');
    expect(Number(edge.style('opacity'))).toBeGreaterThan(0);
    cy.destroy();
  });

  it('a blocked AND selected arc reads selected-accent AND dashed (B-106: the accent never restyles line-style) — derived from the stylesheet data itself', () => {
    // The expected accent color is DERIVED from the stylesheet's own
    // tme-edge-selected entry (not hardcoded here): the invariant is
    // "selected wins the color, blocked keeps the dash", whatever the palette.
    const accentEntry = GRAPH_STYLESHEET.find((e) => String(e.selector) === 'edge.tme-edge-selected');
    expect(accentEntry, 'the tme-edge-selected entry exists').toBeDefined();
    // StylesheetStyle['style'] is the Node|Edge|Core CSS union — index through
    // a record view (the selector guarantees the edge-scoped property exists).
    const accentColor = (accentEntry?.style as Record<string, unknown>)['line-color'] as string | undefined;
    expect(accentColor, 'the accent entry declares a line-color').toBeTruthy();

    const probe = cytoscape({
      container: null, headless: true, styleEnabled: true,
      style: [{ selector: 'edge.probe', style: { 'line-color': accentColor as string } }],
      layout: { name: 'preset' },
    });
    probe.add({ group: 'nodes', data: { id: 'a' }, position: { x: 0, y: 0 } });
    probe.add({ group: 'nodes', data: { id: 'b' }, position: { x: 10, y: 0 } });
    probe.add({ group: 'edges', data: { id: 'p', source: 'a', target: 'b' }, classes: 'probe' });
    const expectedColor = probe.getElementById('p').style('line-color');
    probe.destroy();

    const cy = cyWithRealStyles();
    addEdge(cy, 'e-both', 'tme-blocked tme-edge-selected');
    const edge = cy.getElementById('e-both');
    expect(edge.style('line-color')).toBe(expectedColor);
    expect(edge.style('line-style')).toBe('dashed');
    cy.destroy();
  });

  it('a curved AND blocked arc keeps unbundled-bezier AND dashed (C2 orthogonal to curve-style, B-111)', () => {
    const cy = cyWithRealStyles();
    addEdge(cy, 'e-curve', 'tme-curved tme-blocked');
    const edge = cy.getElementById('e-curve');
    expect(edge.style('curve-style')).toBe('unbundled-bezier');
    expect(edge.style('line-style')).toBe('dashed');
    cy.destroy();
  });
});
