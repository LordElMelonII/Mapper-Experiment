// src/app/app.ts — PKG B-102. The dev harness root: loads FX1 (the
// Fuyuki/Misaki demo map) through the facade and renders the M1 viewer.
// Dev-harness-only: the shipped extension entry is src/st/entry.ts, which
// never imports this file.
import { Component, inject } from '@angular/core';
import { GraphService } from './graph/graph.service';
import { MapViewerComponent } from './viewer/map-viewer.component';
import { createFacade } from '../core/facade';
import type { ChatMapOverlay } from '../core/api';
import { fuyukiMap } from '../../data/worlds/fuyuki';

/** Shape of the dev-harness-only e2e seam installed below (D53 phone e2e). */
interface TmeE2EHook {
  nodeLabels(): string[];
  edgeLineStyle(id: string): string | null;
  nodeRenderedPosition(id: string): { x: number; y: number } | null;
  nodeRenderedBoundingBox(id: string): { x: number; y: number; w: number; h: number } | null;
  zoom(): number;
  pan(): { x: number; y: number };
  /** B-107: one cross-layer badge's text by arc id, or null (C3/C10 pin). */
  badgeText(arcId: string): string | null;
}

@Component({
  selector: 'tme-root',
  imports: [MapViewerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly graphService = inject(GraphService);

  constructor() {
    const facade = createFacade();

    // D69 (harness ruling): the display map is a SHALLOW per-layer copy that
    // adds a harness-only placeholder background to layer-fuyuki. The
    // nodes/edges arrays are the SAME live references (C24 — one truth, R4);
    // the facade validates and stores this object. FX1's fixture file itself
    // is untouched. D70: the app layer may import data/ fixtures display-only
    // (lint-boundaries allows the 'data' pseudo-layer for 'app').
    const displayMap = {
      ...fuyukiMap,
      layers: fuyukiMap.layers.map((layer) =>
        layer.id === 'layer-fuyuki'
          ? { ...layer, background: { assetId: 'assets/harness-bg-fuyuki.png' } }
          : layer,
      ),
    };

    // A fresh chat overlay (the state C persists per chat, Phase 4): pin on
    // Emiya Residence, walking, no user nodes/edges/blocks.
    const overlay: ChatMapOverlay = {
      mapId: 'fuyuki-misaki',
      currentLocationId: 'emiya-residence',
      travelMode: 'walk',
      userNodes: [],
      userEdges: [],
      blocked: {},
    };

    facade.loadMap(displayMap, overlay); // R2: the facade owns the map lifecycle
    this.graphService.loadMap(displayMap, overlay, facade); // R4: same references

    this.installE2EHook();
  }

  /**
   * DEV-HARNESS-ONLY e2e seam (D53) — never registered by the ST entry.
   * Read-only projections of the cy model for Playwright canvas assertions;
   * the hook exposes no mutation path (R2/R4) and no machine names (C23).
   */
  private installE2EHook(): void {
    (window as unknown as { __TME_E2E__?: TmeE2EHook }).__TME_E2E__ = {
      nodeLabels: () => this.graphService.testNodeLabels(),
      edgeLineStyle: (id: string) => this.graphService.testEdgeLineStyle(id),
      nodeRenderedPosition: (id: string) => this.graphService.testNodeRenderedPosition(id),
      nodeRenderedBoundingBox: (id: string) => this.graphService.testNodeRenderedBoundingBox(id),
      zoom: () => this.graphService.testZoom(),
      pan: () => this.graphService.testPan(),
      badgeText: (arcId: string) => this.graphService.testBadgeText(arcId),
    };
  }
}
