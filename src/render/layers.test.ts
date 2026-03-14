/**
 * Tests for the 4 first layer renderers:
 *   1. TitleLayer     — map title above axes
 *   2. AxesLayer      — plot border, grid, dividers, labels
 *   3. PipelinesLayer — pipeline background rectangles
 *   4. EdgesLayer     — dependency edge lines
 *
 * All layers conform to LayerRenderer = (ctx: RenderContext) => string[]
 * and use pre-computed geometry from buildRenderContext (Phase 1).
 */

import { describe, it, expect } from "vitest";
import { buildRenderContext } from "./build-context.js";
import { renderTitleLayer } from "./title-layer.js";
import { renderAxesLayer } from "./axes-layer.js";
import { renderPipelinesLayer } from "./pipelines-layer.js";
import { renderEdgesLayer } from "./edges-layer.js";
import { sanitizeMap, WardleyMapSchema } from "../schema.js";
import type { WardleyMap } from "../schema.js";
import {
  TITLE_FONT_SIZE,
  AXIS_MARGIN_TOP,
  BORDER_COLOR,
  DIVIDER_COLOR,
  LABEL_COLOR,
  AXIS_LABEL_COLOR,
  PHASE_LABEL_FONT_SIZE,
  DIRECTION_LABEL_FONT_SIZE,
} from "../blocks/wardley-map/wardley-map-consts.js";

// ── Test fixtures ───────────────────────────────────────────────────

function makeSimpleMap(overrides: Record<string, unknown> = {}): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "Test Map",
    components: [
      { id: "a", label: "User", type: "anchor", evolution: 0.5, visibility: 0.1 },
      { id: "b", label: "Service", type: "component", evolution: 0.6, visibility: 0.5 },
    ],
    relations: [{ source: "a", target: "b" }],
    ...overrides,
  }));
}

function makeMapWithPipeline(): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "Pipeline Map",
    components: [
      { id: "u", label: "User", type: "anchor", evolution: 0.5, visibility: 0.1 },
      {
        id: "p1",
        label: "Platform",
        type: "pipeline",
        evolution: 0.5,
        visibility: 0.5,
        pipelineGeometry: {
          evoStart: 0.2,
          evoEnd: 0.8,
          visStart: 0.4,
          visEnd: 0.6,
        },
      },
    ],
    relations: [],
  }));
}

function makeMapWithFlowEdges(): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "Flow Map",
    components: [
      { id: "a", label: "A", type: "component", evolution: 0.2, visibility: 0.2 },
      { id: "b", label: "B", type: "component", evolution: 0.6, visibility: 0.5 },
      { id: "c", label: "C", type: "component", evolution: 0.9, visibility: 0.8 },
    ],
    relations: [
      { source: "a", target: "b", type: "DependsOn" },
      { source: "b", target: "c", type: "DependsOn", flow: { label: "data", style: "dashed" } },
    ],
  }));
}

// ═══════════════════════════════════════════════════════════════════
// TitleLayer
// ═══════════════════════════════════════════════════════════════════

describe("renderTitleLayer", () => {
  it("renders title text centered above plot area", () => {
    const map = makeSimpleMap({ title: "My Wardley Map" });
    const ctx = buildRenderContext(map);
    const parts = renderTitleLayer(ctx);

    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain("My Wardley Map");
    expect(parts[0]).toContain("text-anchor=\"middle\"");
    expect(parts[0]).toContain(`font-size="${TITLE_FONT_SIZE}"`);
    expect(parts[0]).toContain("font-weight=\"600\"");
    expect(parts[0]).toContain("Inter");
  });

  it("returns empty array for blank title", () => {
    const map = makeSimpleMap({ title: "   " });
    const ctx = buildRenderContext(map);
    const parts = renderTitleLayer(ctx);

    expect(parts).toHaveLength(0);
  });

  it("escapes HTML entities in title", () => {
    const map = makeSimpleMap({ title: "A & B <C>" });
    const ctx = buildRenderContext(map);
    const parts = renderTitleLayer(ctx);

    expect(parts[0]).toContain("A &amp; B &lt;C&gt;");
    expect(parts[0]).not.toContain("<C>");
  });

  it("positions title above the plot top", () => {
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderTitleLayer(ctx);

    // Extract y coordinate from the SVG
    const yMatch = parts[0].match(/y="(\d+)"/);
    expect(yMatch).not.toBeNull();
    const titleY = parseInt(yMatch![1]);
    expect(titleY).toBeLessThan(AXIS_MARGIN_TOP);
  });

  it("centers title at half canvas width", () => {
    const map = makeSimpleMap({ gridSize: { width: 1600, height: 800 } });
    const ctx = buildRenderContext(map);
    const parts = renderTitleLayer(ctx);

    expect(parts[0]).toContain('x="800"');
  });
});

// ═══════════════════════════════════════════════════════════════════
// AxesLayer
// ═══════════════════════════════════════════════════════════════════

describe("renderAxesLayer", () => {
  it("always renders the plot border rectangle", () => {
    const map = makeSimpleMap({ axes: { valueChain: false, evolution: false } });
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    const borderPart = parts.find((p) => p.includes(BORDER_COLOR));
    expect(borderPart).toBeDefined();
    expect(borderPart).toContain("<rect");
  });

  it("renders horizontal grid lines when valueChain is true", () => {
    const map = makeSimpleMap({ axes: { valueChain: true, evolution: false } });
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    // 7 grid lines for 8 divisions
    const gridLines = parts.filter((p) => p.includes('stroke-width="0.5"'));
    expect(gridLines).toHaveLength(7);
  });

  it("omits grid lines when valueChain is false", () => {
    const map = makeSimpleMap({ axes: { valueChain: false, evolution: true } });
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    const gridLines = parts.filter((p) => p.includes('stroke-width="0.5"'));
    expect(gridLines).toHaveLength(0);
  });

  it("renders 3 evolution phase dividers when evolution is true", () => {
    const map = makeSimpleMap({ axes: { valueChain: false, evolution: true } });
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    const dividers = parts.filter(
      (p) => p.includes(DIVIDER_COLOR) && p.includes("stroke-dasharray")
    );
    expect(dividers).toHaveLength(3);
  });

  it("omits phase dividers when evolution is false", () => {
    const map = makeSimpleMap({ axes: { valueChain: false, evolution: false } });
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    const dividers = parts.filter((p) => p.includes(DIVIDER_COLOR));
    expect(dividers).toHaveLength(0);
  });

  it("renders 4 phase labels when evolution is true", () => {
    const map = makeSimpleMap({ axes: { valueChain: false, evolution: true } });
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    expect(parts.some((p) => p.includes("Genesis"))).toBe(true);
    expect(parts.some((p) => p.includes("Custom-Built"))).toBe(true);
    expect(parts.some((p) => p.includes("Product (+Rental)"))).toBe(true);
    expect(parts.some((p) => p.includes("Commodity (+Utility)"))).toBe(true);
  });

  it("renders 'Evolution' x-axis label", () => {
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    expect(parts.some((p) => p.includes("Evolution"))).toBe(true);
  });

  it("renders 'Value Chain' y-axis label with rotation", () => {
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    const yAxisLabel = parts.find((p) => p.includes("Value Chain"));
    expect(yAxisLabel).toBeDefined();
    expect(yAxisLabel).toContain("rotate(-90");
  });

  it("renders Visible/Invisible direction indicators", () => {
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    expect(parts.some((p) => p.includes("Visible"))).toBe(true);
    expect(parts.some((p) => p.includes("Invisible"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PipelinesLayer
// ═══════════════════════════════════════════════════════════════════

describe("renderPipelinesLayer", () => {
  it("returns empty array when no pipelines", () => {
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderPipelinesLayer(ctx);

    expect(parts).toHaveLength(0);
  });

  it("renders pipeline as rounded rectangle", () => {
    const map = makeMapWithPipeline();
    const ctx = buildRenderContext(map);
    const parts = renderPipelinesLayer(ctx);

    expect(parts.length).toBeGreaterThan(0);
    const rect = parts[0];
    expect(rect).toContain("<rect");
    expect(rect).toContain("rx=");
    expect(rect).toContain("ry=");
    expect(rect).toContain("rgba(200, 200, 200, 0.15)");
    expect(rect).toContain("#bbbbbb");
  });

  it("pipeline rect has positive dimensions", () => {
    const map = makeMapWithPipeline();
    const ctx = buildRenderContext(map);
    const parts = renderPipelinesLayer(ctx);

    const widthMatch = parts[0].match(/width="([^"]+)"/);
    const heightMatch = parts[0].match(/height="([^"]+)"/);
    expect(widthMatch).not.toBeNull();
    expect(heightMatch).not.toBeNull();
    expect(parseFloat(widthMatch![1])).toBeGreaterThan(0);
    expect(parseFloat(heightMatch![1])).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// EdgesLayer
// ═══════════════════════════════════════════════════════════════════

describe("renderEdgesLayer", () => {
  it("renders solid edge line by default", () => {
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderEdgesLayer(ctx);

    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain("<line");
    expect(parts[0]).toContain('stroke="#999999"');
    expect(parts[0]).toContain('stroke-width="1.5"');
    expect(parts[0]).not.toContain("stroke-dasharray");
  });

  it("renders dashed edge when flow style is dashed", () => {
    const map = makeMapWithFlowEdges();
    const ctx = buildRenderContext(map);
    const parts = renderEdgesLayer(ctx);

    // Second edge has dashed style
    expect(parts).toHaveLength(2);
    const dashedEdge = parts[1];
    expect(dashedEdge).toContain("stroke-dasharray");
  });

  it("returns empty array when no edges", () => {
    const map = makeSimpleMap({ relations: [] });
    const ctx = buildRenderContext(map);
    const parts = renderEdgesLayer(ctx);

    expect(parts).toHaveLength(0);
  });

  it("skips edges referencing unknown components", () => {
    const map = makeSimpleMap({
      relations: [{ source: "a", target: "nonexistent" }],
    });
    const ctx = buildRenderContext(map);
    const parts = renderEdgesLayer(ctx);

    // Should produce no edges since "nonexistent" doesn't exist
    expect(parts).toHaveLength(0);
  });

  it("edge pixel coordinates are within plot area", () => {
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderEdgesLayer(ctx);

    const x1Match = parts[0].match(/x1="([^"]+)"/);
    const y1Match = parts[0].match(/y1="([^"]+)"/);
    expect(x1Match).not.toBeNull();
    expect(y1Match).not.toBeNull();
    const x1 = parseFloat(x1Match![1]);
    const y1 = parseFloat(y1Match![1]);
    expect(x1).toBeGreaterThanOrEqual(ctx.plot.left);
    expect(x1).toBeLessThanOrEqual(ctx.plot.right);
    expect(y1).toBeGreaterThanOrEqual(ctx.plot.top);
    expect(y1).toBeLessThanOrEqual(ctx.plot.bottom);
  });
});
