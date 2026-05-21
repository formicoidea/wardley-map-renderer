/**
 * Tests for layer renderers:
 *   1. TitleLayer     — map title above axes
 *   2. AxesLayer      — plot border, grid, dividers, labels
 *   3. PipelinesLayer — pipeline background rectangles
 *   4. EdgesLayer     — dependency edge lines
 *   5. NodesLayer     — component circles (typeColors, excludeComponentTypes, nodeRadii)
 *   6. EvolvesToLayer — evolution arrows (evolveStyles)
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
import { renderNodesLayer } from "./nodes-layer.js";
import { renderEvolvesToLayer } from "./evolvesto-layer.js";
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
      { id: "a", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
      { id: "b", label: { name: "Service" }, type: "component", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } } },
    ],
    relations: [{ id: "rel-a-b", consumer: "a", supplier: "b" }],
    ...overrides,
  }));
}

function makeMapWithPipeline(): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "Pipeline Map",
    components: [
      { id: "u", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
      {
        id: "p1",
        label: { name: "Platform" },
        type: "pipeline",
        position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
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
      { id: "a", label: { name: "A" }, type: "component", position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.2 } } },
      { id: "b", label: { name: "B" }, type: "component", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } } },
      { id: "c", label: { name: "C" }, type: "component", position: { evolution: { scalar: 0.9 }, visibility: { scalar: 0.8 } } },
    ],
    relations: [
      { id: "rel-a-b", consumer: "a", supplier: "b", type: "DependsOn" },
      { id: "rel-b-c", consumer: "b", supplier: "c", type: "DependsOn", flow: { label: "data", style: "dashed" } },
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
    const map = makeSimpleMap({ renderConfig: { style: { background: { canvas: { default: { width: 1600, height: 800 } } } } } });
    const ctx = buildRenderContext(map);
    const parts = renderTitleLayer(ctx);

    expect(parts[0]).toContain('x="800"');
  });
});

// ═══════════════════════════════════════════════════════════════════
// AxesLayer
// ═══════════════════════════════════════════════════════════════════

describe("renderAxesLayer", () => {
  it("returns only arrowhead defs when both axes and phases are disabled", () => {
    const map = makeSimpleMap({
      renderConfig: {
        display: { axisEvolution: false, axisValueChain: false, phases: false },
      },
    });
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    // Only the arrowhead marker definition should be rendered
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain("<defs>");
    expect(parts[0]).toContain("axis-arrow");
  });

  it("does not render horizontal grid lines (removed for cleaner visual)", () => {
    const map = makeSimpleMap({
      renderConfig: {
        display: { axisValueChain: true, axisEvolution: false },
      },
    });
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    // Grid lines removed — no thin horizontal lines expected
    const gridLines = parts.filter((p) => p.includes('stroke-width="0.5"'));
    expect(gridLines).toHaveLength(0);
  });

  it("renders 3 evolution phase dividers when showPhaseDividerAndLabel is true (default)", () => {
    // Default: no renderConfig → showPhaseDividerAndLabel defaults to true
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    const dividers = parts.filter(
      (p) => p.includes(DIVIDER_COLOR) && p.includes("stroke-dasharray")
    );
    expect(dividers).toHaveLength(3);
  });

  it("omits phase dividers when showPhaseDividerAndLabel is false", () => {
    const map = makeSimpleMap({
      renderConfig: {
        display: { phases: false },
      },
    });
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    const dividers = parts.filter(
      (p) => p.includes(DIVIDER_COLOR) && p.includes("stroke-dasharray")
    );
    expect(dividers).toHaveLength(0);
  });

  it("renders 4 phase labels when showPhaseDividerAndLabel is true (default)", () => {
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    expect(parts.some((p) => p.includes("Genesis"))).toBe(true);
    expect(parts.some((p) => p.includes("Custom-Built"))).toBe(true);
    expect(parts.some((p) => p.includes("Product (+Rental)"))).toBe(true);
    expect(parts.some((p) => p.includes("Commodity (+Utility)"))).toBe(true);
  });

  it("showPhaseDividerAndLabel=false hides both phase dividers and labels but keeps evolution axis", () => {
    const map = makeSimpleMap({
      renderConfig: {
        display: { phases: false },
      },
    });
    const ctx = buildRenderContext(map);
    const parts = renderAxesLayer(ctx);

    // Phase labels should be absent
    expect(parts.some((p) => p.includes("Genesis"))).toBe(false);
    expect(parts.some((p) => p.includes("Custom-Built"))).toBe(false);

    // Phase dividers should also be absent (controlled by same toggle)
    const dividers = parts.filter(
      (p) => p.includes(DIVIDER_COLOR) && p.includes("stroke-dasharray")
    );
    expect(dividers).toHaveLength(0);

    // But evolution axis arrow should still be present
    expect(parts.some((p) => p.includes("Evolution"))).toBe(true);
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

  it("legend controlled via renderConfig.legend", () => {
    const map = makeSimpleMap({ renderConfig: { display: { legend: false } } });
    const ctx = buildRenderContext(map);
    expect(ctx.map.renderConfig?.legend?.show).toBe(false);
  });

  it("legend with {x, y} position is accessible in context", () => {
    const map = makeSimpleMap({ renderConfig: { style: { legend: { default: { box: { position: { x: 50, y: 50 } } } } } } });
    const ctx = buildRenderContext(map);
    expect(ctx.map.renderConfig?.legend?.position).toEqual({ x: 50, y: 50 });
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
    expect(rect).toContain("rgba(255, 255, 255, 0.35)");
    expect(rect).toContain("#999999");
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
    // Default strokeWidth is 1 (from resolvedConfig)
    expect(parts[0]).toContain(`stroke-width="${ctx.resolvedConfig.strokeWidth}"`);
    expect(parts[0]).not.toContain("stroke-dasharray");
  });

  it("uses strokeWidth from renderConfig for edge lines", () => {
    const map = makeSimpleMap({ renderConfig: { style: { global: { strokeWidth: 2.5 } } } });
    const ctx = buildRenderContext(map);
    const parts = renderEdgesLayer(ctx);

    expect(parts[0]).toContain('stroke-width="2.5"');
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
      relations: [{ id: "rel-a-nonexistent", consumer: "a", supplier: "nonexistent" }],
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

// ═══════════════════════════════════════════════════════════════════
// NodesLayer — typeColors, excludeComponentTypes, nodeRadii (AC 10)
// ═══════════════════════════════════════════════════════════════════

describe("renderNodesLayer", () => {
  it("renders component nodes as circles", () => {
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    expect(parts.length).toBeGreaterThan(0);
    expect(parts.some((p) => p.includes("<circle"))).toBe(true);
  });

  it("uses nodeRadii._default from resolvedConfig", () => {
    const map = makeSimpleMap({ renderConfig: { style: { nodes: { default: { override: { symbol: { radius: 12 } } } } } } });
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    expect(parts.some((p) => p.includes('r="12"'))).toBe(true);
    expect(parts.some((p) => p.includes('r="7"'))).toBe(false);
  });

  it("uses default nodeRadii._default (5) when none is configured", () => {
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // Default nodeRadii._default from resolvedConfig is 5
    expect(ctx.resolvedConfig.nodeRadii._default).toBe(5);
    expect(parts.some((p) => p.includes('r="5"'))).toBe(true);
  });

  it("applies typeColors for component type color override", () => {
    const map = makeSimpleMap({
      renderConfig: { style: { nodes: { default: { override: { symbol: { stroke: "#000000" } } }, byType: { component: { override: { symbol: { stroke: "#ff0000" } } } } } } },
    });
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // "Service" is a component type — its circle should use the typeColor
    expect(parts.some((p) => p.includes("#ff0000"))).toBe(true);
  });

  it("component.color takes precedence over typeColors", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Color Precedence Test",
      components: [
        {
          id: "c1",
          label: { name: "Service" },
          type: "component",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          color: "blue-600",
        },
      ],
      relations: [],
      renderConfig: { style: { nodes: { default: { override: { symbol: { stroke: "#000000" } } }, byType: { component: { override: { symbol: { stroke: "#ff0000" } } } } } } },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // blue-600 = #2563eb should be used, not #ff0000
    expect(parts.some((p) => p.includes("#2563eb"))).toBe(true);
    expect(parts.some((p) => p.includes("#ff0000"))).toBe(false);
  });

  it("excludeComponentTypes hides excluded component type nodes", () => {
    const map = makeSimpleMap({
      renderConfig: { display: { component: false } },
    });
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // "Service" is a component — should not be rendered
    // "User" is an anchor — should still be rendered (includes person silhouette)
    const circleCount = parts.filter((p) => p.includes("<circle")).length;
    // anchor renders 2 circles (node + head of person silhouette), component is excluded
    // so only anchor remains
    expect(circleCount).toBeGreaterThan(0);
    // There should be fewer circles than without excludeComponentTypes
    const ctxAll = buildRenderContext(makeSimpleMap());
    const partsAll = renderNodesLayer(ctxAll);
    expect(circleCount).toBeLessThan(partsAll.filter((p) => p.includes("<circle")).length);
  });

  it("excludeComponentTypes=[anchor] hides anchor nodes but shows component nodes", () => {
    const map = makeSimpleMap({
      renderConfig: { display: { anchor: false } },
    });
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // anchor is excluded, component remains
    // person silhouette (from anchor) should not be present
    expect(parts.some((p) => p.includes("anchor-clip"))).toBe(false);
  });

  it("uses strokeWidth from renderConfig for node circles", () => {
    const map = makeSimpleMap({ renderConfig: { style: { global: { strokeWidth: 3 } } } });
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // All node circles should use the configured strokeWidth
    expect(parts.every((p) => !p.includes("<circle") || p.includes('stroke-width="3"'))).toBe(true);
  });

  it("pipeline handle squares are hidden when pipeline type is excluded", () => {
    const map = makeMapWithPipeline();
    const ctxDefault = buildRenderContext(map);
    const partsDefault = renderNodesLayer(ctxDefault);

    // Without exclusion: pipeline handle squares should appear
    const hasHandleDefault = partsDefault.some((p) => p.includes("<rect"));

    const mapExcluded = sanitizeMap(WardleyMapSchema.parse({
      title: "Pipeline Map",
      components: [
        { id: "u", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
        {
          id: "p1",
          label: { name: "Platform" },
          type: "pipeline",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          pipelineGeometry: { evoStart: 0.2, evoEnd: 0.8, visStart: 0.4, visEnd: 0.6 },
        },
      ],
      relations: [],
      renderConfig: { display: { pipeline: false } },
    }));
    const ctxExcluded = buildRenderContext(mapExcluded);
    const partsExcluded = renderNodesLayer(ctxExcluded);

    // With pipeline excluded: no handle squares
    if (hasHandleDefault) {
      expect(partsExcluded.some((p) => p.includes("<rect"))).toBe(false);
    }
  });

  // ── nodeRadii per-type resolution tests ────────────────────────────

  it("nodeRadii._default applies to all node types when no per-type override", () => {
    const map = makeSimpleMap({ renderConfig: { style: { nodes: { default: { override: { symbol: { radius: 9 } } } } } } });
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // All circles should use r=9 (the _default)
    expect(ctx.resolvedConfig.nodeRadii._default).toBe(9);
    expect(parts.some((p) => p.includes('<circle') && p.includes('r="9"'))).toBe(true);
    // Should NOT use the baseline 5
    expect(parts.some((p) => p.includes('<circle') && p.includes('r="5"'))).toBe(false);
  });

  it("nodeRadii per-type anchor overrides _default for anchor nodes only", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "NodeRadii Per-Type Test",
      components: [
        { id: "u", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
        { id: "s", label: { name: "Service" }, type: "component", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } } },
      ],
      relations: [],
      renderConfig: { style: { nodes: { default: { override: { symbol: { radius: 5 } } }, byType: { anchor: { override: { symbol: { radius: 12 } } } } } } },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // anchor circle: r=12
    expect(parts.some((p) => p.includes('<circle') && p.includes('r="12"'))).toBe(true);
    // component circle: r=5 (from _default)
    expect(parts.some((p) => p.includes('<circle') && p.includes('r="5"'))).toBe(true);
  });

  it("nodeRadii per-type component overrides only component circles", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "NodeRadii Component Override",
      components: [
        { id: "u", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
        { id: "s", label: { name: "Service" }, type: "component", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } } },
      ],
      relations: [],
      renderConfig: { style: { nodes: { default: { override: { symbol: { radius: 5 } } }, byType: { component: { override: { symbol: { radius: 15 } } } } } } },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // component circle: r=15
    expect(parts.some((p) => p.includes('<circle') && p.includes('r="15"'))).toBe(true);
    // anchor: no per-type → falls back to _default (5)
    expect(ctx.resolvedConfig.nodeRadii._default).toBe(5);
  });

  it("nodeRadii falls back to _default when type has no explicit entry", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Fallback Test",
      components: [
        { id: "u", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
        { id: "s", label: { name: "Service" }, type: "component", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } } },
      ],
      relations: [],
      renderConfig: { style: { nodes: { default: { override: { symbol: { radius: 8 } } }, byType: { anchor: { override: { symbol: { radius: 15 } } } } } } },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // anchor: explicitly 15
    expect(parts.some((p) => p.includes('<circle') && p.includes('r="15"'))).toBe(true);
    // component: no per-type → falls back to _default=8
    expect(parts.some((p) => p.includes('<circle') && p.includes('r="8"'))).toBe(true);
  });

  it("nodeRadii._default applies to all circles when no per-type override", () => {
    const map = makeSimpleMap({
      renderConfig: {
        style: { nodes: { default: { override: { symbol: { radius: 10 } } } } },
      },
    });
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // All circles should use r=10 (_default)
    expect(parts.some((p) => p.includes('<circle') && p.includes('r="10"'))).toBe(true);
    expect(parts.some((p) => p.includes('<circle') && p.includes('r="5"'))).toBe(false);
  });

  it("nodeRadii._default: no nodeRadii override → baseline _default (5) used for all", () => {
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // Baseline nodeRadii._default is 5
    expect(ctx.resolvedConfig.nodeRadii).toEqual({ _default: 5 });
    expect(parts.some((p) => p.includes('<circle') && p.includes('r="5"'))).toBe(true);
  });

  it("nodeRadii.pipeline applies to pipeline handle square dimensions", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Pipeline Handle Radius Test",
      components: [
        { id: "u", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
        {
          id: "p1",
          label: { name: "Platform" },
          type: "pipeline",
          position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.5 } },
          pipelineGeometry: { evoStart: 0.2, evoEnd: 0.8, visStart: 0.4, visEnd: 0.6 },
        },
      ],
      relations: [],
      renderConfig: { style: { nodes: { default: { override: { symbol: { radius: 5 } } }, byType: { pipeline: { override: { symbol: { radius: 8 } } } } } } },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // Pipeline handle: width and height should be 2*8=16
    const rectPart = parts.find((p) => p.includes("<rect"));
    expect(rectPart).toBeDefined();
    expect(rectPart).toContain('width="16"');
    expect(rectPart).toContain('height="16"');
  });

  it("nodeRadii full precedence chain: type > _default", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "Full Precedence Chain",
      components: [
        // anchor: explicit per-type = 12
        { id: "a", label: { name: "User" }, type: "anchor", position: { evolution: { scalar: 0.5 }, visibility: { scalar: 0.1 } } },
        // component: no per-type → falls back to _default = 8
        { id: "b", label: { name: "Service" }, type: "component", position: { evolution: { scalar: 0.6 }, visibility: { scalar: 0.5 } } },
      ],
      relations: [],
      renderConfig: {
        style: { nodes: { default: { override: { symbol: { radius: 8 } } }, byType: { anchor: { override: { symbol: { radius: 12 } } } } } },
      },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderNodesLayer(ctx);

    // anchor → 12 (per-type wins)
    expect(parts.some((p) => p.includes('<circle') && p.includes('r="12"'))).toBe(true);
    // component → 8 (_default wins)
    expect(parts.some((p) => p.includes('<circle') && p.includes('r="8"'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// EvolvesToLayer — evolveStyles config override (AC 10)
// ═══════════════════════════════════════════════════════════════════

function makeMapWithEvolvesTo(evolveType: string = "natural"): WardleyMap {
  return sanitizeMap(WardleyMapSchema.parse({
    title: "EvolveMap",
    components: [
      {
        id: "a",
        label: { name: "Service" },
        type: "component",
        position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.5 } },
        evolvesTo: [
          {
            position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } },
            evolveType,
          },
        ],
      },
    ],
    relations: [],
  }));
}

describe("renderEvolvesToLayer", () => {
  it("renders a dashed evolution arrow for natural evolveType", () => {
    const map = makeMapWithEvolvesTo("natural");
    const ctx = buildRenderContext(map);
    const parts = renderEvolvesToLayer(ctx);

    expect(parts.some((p) => p.includes("<line"))).toBe(true);
    expect(parts.some((p) => p.includes("stroke-dasharray"))).toBe(true);
    // Default natural color is #dc2626
    expect(parts.some((p) => p.includes("#dc2626"))).toBe(true);
  });

  it("uses evolveStyles.natural.stroke override from renderConfig", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "EvolveMap",
      components: [
        {
          id: "a",
          label: { name: "Service" },
          type: "component",
          position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.5 } },
          evolvesTo: [
            {
              position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } },
              evolveType: "natural",
            },
          ],
        },
      ],
      relations: [],
      renderConfig: {
        style: { movement: { natural: { override: { line: { color: "#00ff00" } } } } },
      },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderEvolvesToLayer(ctx);

    // Should use the overridden stroke color
    expect(parts.some((p) => p.includes("#00ff00"))).toBe(true);
    // Should NOT use the default natural color
    expect(parts.some((p) => p.includes("#dc2626"))).toBe(false);
  });

  it("uses evolveStyles.natural.strokeDasharray override from renderConfig", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "EvolveMap",
      components: [
        {
          id: "a",
          label: { name: "Service" },
          type: "component",
          position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.5 } },
          evolvesTo: [
            {
              position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } },
              evolveType: "natural",
            },
          ],
        },
      ],
      relations: [],
      renderConfig: {
        style: { movement: { natural: { override: { line: { dash: "10,5" } } } } },
      },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderEvolvesToLayer(ctx);

    expect(parts.some((p) => p.includes("10,5"))).toBe(true);
  });

  it("renders ecosystem arrows in default blue when not overridden", () => {
    const map = makeMapWithEvolvesTo("ecosystem");
    const ctx = buildRenderContext(map);
    const parts = renderEvolvesToLayer(ctx);

    // Default ecosystem color is #2563eb
    expect(parts.some((p) => p.includes("#2563eb"))).toBe(true);
  });

  it("keeps default stroke for unspecified evolveType when only one type is overridden", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "EvolveMap",
      components: [
        {
          id: "a",
          label: { name: "Service" },
          type: "component",
          position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.5 } },
          evolvesTo: [
            {
              position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } },
              evolveType: "ecosystem",
            },
          ],
        },
      ],
      relations: [],
      renderConfig: {
        style: { movement: { natural: { override: { line: { color: "#00ff00" } } } } }, // only natural overridden
      },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderEvolvesToLayer(ctx);

    // ecosystem arrow should use default blue
    expect(parts.some((p) => p.includes("#2563eb"))).toBe(true);
    // overridden natural color should not appear (no natural arrows)
    expect(parts.some((p) => p.includes("#00ff00"))).toBe(false);
  });

  it("returns empty array when no evolvesTo arrows exist", () => {
    const map = makeSimpleMap();
    const ctx = buildRenderContext(map);
    const parts = renderEvolvesToLayer(ctx);

    expect(parts).toHaveLength(0);
  });

  // ── _default fallback (TypeStyleMap pattern) ──────────────────────────────

  it("uses evolveStyles._default.stroke as fallback for unspecified types", () => {
    // ecosystem not overridden, should fall back to _default stroke
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "EvolveMap",
      components: [
        {
          id: "a",
          label: { name: "Service" },
          type: "component",
          position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.5 } },
          evolvesTo: [
            {
              position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } },
              evolveType: "ecosystem",
            },
          ],
        },
      ],
      relations: [],
      renderConfig: {
        style: { movement: {
          default: { override: { line: { color: "#aaaaaa" } } },
          natural: { override: { line: { color: "#dc2626" } } }, // only natural explicitly overridden
        } },
      },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderEvolvesToLayer(ctx);

    // ecosystem should use _default stroke, not the hardcoded #2563eb
    expect(parts.some((p) => p.includes("#aaaaaa"))).toBe(true);
    // default ecosystem blue should NOT appear
    expect(parts.some((p) => p.includes("#2563eb"))).toBe(false);
  });

  it("per-type key overrides _default for that specific type", () => {
    // natural has explicit override, ecosystem falls back to _default
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "EvolveMap",
      components: [
        {
          id: "a",
          label: { name: "A" },
          type: "component",
          position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.5 } },
          evolvesTo: [
            {
              position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } },
              evolveType: "natural",
            },
          ],
        },
        {
          id: "b",
          label: { name: "B" },
          type: "component",
          position: { evolution: { scalar: 0.3 }, visibility: { scalar: 0.3 } },
          evolvesTo: [
            {
              position: { evolution: { scalar: 0.8 }, visibility: { scalar: 0.3 } },
              evolveType: "ecosystem",
            },
          ],
        },
      ],
      relations: [],
      renderConfig: {
        style: { movement: {
          default: { override: { line: { color: "#aaaaaa" } } },
          natural: { override: { line: { color: "#00ff00" } } }, // explicit override wins over _default
        } },
      },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderEvolvesToLayer(ctx);

    // natural uses explicit per-type override
    expect(parts.some((p) => p.includes("#00ff00"))).toBe(true);
    // ecosystem falls back to _default
    expect(parts.some((p) => p.includes("#aaaaaa"))).toBe(true);
    // hardcoded natural red and ecosystem blue should NOT appear
    expect(parts.some((p) => p.includes("#dc2626"))).toBe(false);
    expect(parts.some((p) => p.includes("#2563eb"))).toBe(false);
  });

  it("hardcoded defaults apply when neither per-type key nor _default is present", () => {
    // No evolveStyles config → renderer falls through to hardcoded EVOLVE_STYLES
    const map = makeMapWithEvolvesTo("forced");
    const ctx = buildRenderContext(map);
    const parts = renderEvolvesToLayer(ctx);

    // Default forced color is #9333ea
    expect(parts.some((p) => p.includes("#9333ea"))).toBe(true);
  });

  it("uses strokeWidth from renderConfig for evolution arrow lines", () => {
    const map = sanitizeMap(WardleyMapSchema.parse({
      title: "EvolveMap",
      components: [
        {
          id: "a",
          label: { name: "Service" },
          type: "component",
          position: { evolution: { scalar: 0.2 }, visibility: { scalar: 0.5 } },
          evolvesTo: [
            {
              position: { evolution: { scalar: 0.7 }, visibility: { scalar: 0.5 } },
              evolveType: "natural",
            },
          ],
        },
      ],
      relations: [],
      renderConfig: { style: { global: { strokeWidth: 2 } } },
    }));
    const ctx = buildRenderContext(map);
    const parts = renderEvolvesToLayer(ctx);

    const linePart = parts.find((p) => p.includes("<line"));
    expect(linePart).toBeDefined();
    expect(linePart).toContain('stroke-width="2"');
  });
});
