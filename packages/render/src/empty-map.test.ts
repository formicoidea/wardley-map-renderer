/**
 * Tests for AC 3: Empty maps with no components render a valid fond de carte
 * (axes, title, grid).
 *
 * An empty WardleyMap (components: []) must produce a valid SVG that includes:
 *   - The map title
 *   - Plot border rectangle
 *   - Evolution phase dividers (Genesis / Custom-Built / Product / Commodity)
 *   - Horizontal grid lines
 *   - Axis labels and direction indicators
 *   - No component nodes, no edges, no pipelines
 */

import { describe, it, expect } from "vitest";
import { buildRenderContext } from "./build-context.js";
import { composeSVG } from "./svg-composer.js";
import { renderTitleLayer } from "./title-layer.js";
import { renderAxesLayer } from "./axes-layer.js";
import { renderPipelinesLayer } from "./pipelines-layer.js";
import { renderEdgesLayer } from "./edges-layer.js";
import { renderNodesLayer } from "./nodes-layer.js";
import { renderLabelsLayer } from "./labels-layer.js";
import { renderNotesLayer } from "./notes-layer.js";
import { renderEvolvesToLayer } from "./evolvesto-layer.js";
import { renderLegendLayer } from "./legend-layer.js";
import { sanitizeMap, WardleyMapSchema } from "./schema.js";
import type { WardleyMap } from "./schema.js";
import { renderToSVG } from "./render-orchestrator.js";
import type { LayerRegistration } from "./types.js";
import { LAYER_ORDER } from "./registry.js";

// ── Test fixtures ────────────────────────────────────────────────────

function makeEmptyMap(title = "Empty Map"): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title,
    components: [],
    relations: [],
  }));
}

const ALL_LAYERS: readonly LayerRegistration[] = [
  { name: "title", order: LAYER_ORDER.title, render: renderTitleLayer },
  { name: "axes", order: LAYER_ORDER.axes, render: renderAxesLayer },
  { name: "pipelines", order: LAYER_ORDER.pipelines, render: renderPipelinesLayer },
  { name: "edges", order: LAYER_ORDER.edges, render: renderEdgesLayer },
  { name: "evolvesTo", order: LAYER_ORDER.evolvesTo, render: renderEvolvesToLayer },
  { name: "nodes", order: LAYER_ORDER.nodes, render: renderNodesLayer },
  { name: "labels", order: LAYER_ORDER.labels, render: renderLabelsLayer },
  { name: "notes", order: LAYER_ORDER.notes, render: renderNotesLayer },
  { name: "legend", order: LAYER_ORDER.legend, render: renderLegendLayer },
];

// ── Schema acceptance ────────────────────────────────────────────────

describe("Schema: empty components array", () => {
  it("accepts components: [] without validation error", () => {
    const result = WardleyMapSchema.safeParse({
      title: "Empty",
      components: [],
      relations: [],
    });
    expect(result.success).toBe(true);
  });
});

// ── Render pipeline: empty map ───────────────────────────────────────

describe("Empty map rendering (fond de carte)", () => {
  it("produces a valid SVG document", () => {
    const map = makeEmptyMap("My Empty Map");
    const svg = renderToSVG(map);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    // Valid XML structure
    expect(svg).toMatch(/^<svg[^>]+>/);
  });

  it("renders the map title", () => {
    const map = makeEmptyMap("Strategic Landscape");
    const ctx = buildRenderContext(map);
    const titleLines = renderTitleLayer(ctx);
    expect(titleLines.length).toBeGreaterThan(0);
    const joined = titleLines.join("\n");
    expect(joined).toContain("Strategic Landscape");
  });

  it("renders axes with plot border", () => {
    const map = makeEmptyMap();
    const ctx = buildRenderContext(map);
    const axesLines = renderAxesLayer(ctx);
    const joined = axesLines.join("\n");
    // Plot border rectangle
    expect(joined).toContain("<rect");
  });

  it("renders evolution phase dividers", () => {
    const map = makeEmptyMap();
    const ctx = buildRenderContext(map);
    const axesLines = renderAxesLayer(ctx);
    const joined = axesLines.join("\n");
    // Phase labels
    expect(joined).toContain("Genesis");
    expect(joined).toContain("Custom");
    expect(joined).toContain("Product");
    expect(joined).toContain("Commodity");
  });

  it("renders horizontal grid lines", () => {
    const map = makeEmptyMap();
    const ctx = buildRenderContext(map);
    const axesLines = renderAxesLayer(ctx);
    const joined = axesLines.join("\n");
    // Grid lines are rendered as <line> elements
    expect(joined).toContain("<line");
  });

  it("renders axis labels (Evolution / Value Chain)", () => {
    const map = makeEmptyMap();
    const ctx = buildRenderContext(map);
    const axesLines = renderAxesLayer(ctx);
    const joined = axesLines.join("\n");
    expect(joined).toContain("Evolution");
    expect(joined).toContain("Value Chain");
  });

  it("renders no component nodes", () => {
    const map = makeEmptyMap();
    const ctx = buildRenderContext(map);
    const nodesLines = renderNodesLayer(ctx);
    expect(nodesLines).toHaveLength(0);
  });

  it("renders no edges", () => {
    const map = makeEmptyMap();
    const ctx = buildRenderContext(map);
    const edgesLines = renderEdgesLayer(ctx);
    expect(edgesLines).toHaveLength(0);
  });

  it("renders no pipelines", () => {
    const map = makeEmptyMap();
    const ctx = buildRenderContext(map);
    const pipelinesLines = renderPipelinesLayer(ctx);
    expect(pipelinesLines).toHaveLength(0);
  });

  it("renders no evolves-to arrows", () => {
    const map = makeEmptyMap();
    const ctx = buildRenderContext(map);
    const evolvesLines = renderEvolvesToLayer(ctx);
    expect(evolvesLines).toHaveLength(0);
  });

  it("renders no labels", () => {
    const map = makeEmptyMap();
    const ctx = buildRenderContext(map);
    const labelsLines = renderLabelsLayer(ctx);
    expect(labelsLines).toHaveLength(0);
  });

  it("full SVG composition includes title + axes but no nodes", () => {
    const map = makeEmptyMap("Fond de Carte");
    const ctx = buildRenderContext(map);
    const svg = composeSVG(ctx, ALL_LAYERS);

    // Title present
    expect(svg).toContain("Fond de Carte");
    // Axes present
    expect(svg).toContain("Genesis");
    expect(svg).toContain("Evolution");
    // No component circles (data-component-id is a node marker)
    expect(svg).not.toMatch(/data-component-id/);
  });

  it("geometry context has empty arrays for components", () => {
    const map = makeEmptyMap();
    const ctx = buildRenderContext(map);
    expect(ctx.geometry.nodes).toHaveLength(0);
    expect(ctx.geometry.edges).toHaveLength(0);
    expect(ctx.geometry.evolves).toHaveLength(0);
    expect(ctx.geometry.pipelines).toHaveLength(0);
    expect(ctx.geometry.boundingBoxes).toHaveLength(0);
  });

  it("renderToSVG convenience function works with empty map", () => {
    const map = makeEmptyMap("Convenience Test");
    const svg = renderToSVG(map);
    expect(svg).toContain("Convenience Test");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("Genesis");
  });
});
