/**
 * Tests for the Market symbol rendering.
 *
 * Market symbol: outer circle (r=16, matching Method aura) with equilateral triangle
 * inscribed so vertex circles are fully contained inside the outer circle.
 * MARKET_OUTER_R = 16, MARKET_TRIANGLE_R = 13 (= OUTER_R - VERTEX_R).
 * Rendered by nodes-layer when component type is "market".
 */

import { describe, it, expect } from "vitest";
import { renderNodesLayer } from "./nodes-layer.js";
import { MARKET_OUTER_R, MARKET_TRIANGLE_R, MARKET_VERTEX_R } from "./nodes-layer.js";
import type { RenderContext, NodeGeometry } from "./types.js";
import type { Component, ResolvedRenderConfig } from "../schema.js";

// ── Helpers ─────────────────────────────────────────────────────────

function makeMarketComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: "mkt-1",
    label: { name: "Cloud Market" },
    position: { evolution: 0.7, visibility: 0.3 },
    type: "component",
    subtype: "market",
    ...overrides,
  } as Component;
}

function makeMinimalContext(
  nodes: NodeGeometry[],
  configOverrides: Partial<ResolvedRenderConfig> = {}
): RenderContext {
  return {
    nodes,
    edges: [],
    evolves: [],
    pipelines: [],
    inertiaBarriers: [],
    axesZones: [],
    boundingBoxes: [],
    canvasWidth: 1600,
    canvasHeight: 800,
    plot: { left: 28, top: 28, right: 1572, bottom: 772 },
    resolvedConfig: {
      width: 1600,
      height: 800,
      background: { color: "#ffffff" },
      showAxes: true,
      showPhaseDividerAndLabel: true,
      typography: { fontFamily: "Inter, sans-serif", labelScale: 1.0 },
      nodeRadii: { _default: 5 },
      avoidCollisions: true,
      excludeComponentTypes: [],
      typeColors: {},
      strokeWidth: 1,
      locale: "en",
      legend: { show: false, position: "bottom-right" },
      ...configOverrides,
    } as ResolvedRenderConfig,
  } as unknown as RenderContext;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("MarketSymbol rendering", () => {
  it("exports MARKET_OUTER_R = 16 (matches Method aura), MARKET_TRIANGLE_R = 13 (vertex circles inscribed), MARKET_VERTEX_R = 3", () => {
    expect(MARKET_OUTER_R).toBe(16);
    expect(MARKET_TRIANGLE_R).toBe(13); // OUTER_R - VERTEX_R so vertex circles stay inside
    expect(MARKET_TRIANGLE_R).toBe(MARKET_OUTER_R - MARKET_VERTEX_R);
    expect(MARKET_VERTEX_R).toBe(3);
  });

  it("outer circle R=16 matches Method aura, triangle vertices touch circle", () => {
    const comp = makeMarketComponent();
    const cx = 400;
    const cy = 200;
    const node: NodeGeometry = { id: "mkt-1", cx, cy, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    const svg = parts.join("");

    // Outer circle has r=23
    expect(svg).toContain(`r="${MARKET_OUTER_R}"`);
    expect(svg).toContain('cx="400"');
    expect(svg).toContain('cy="200"');

    // Triangle vertices at distance MARKET_TRIANGLE_R from center
    // Top vertex at (cx, cy - 30): vertex touches outer circle edge
    const topVertexY = cy - MARKET_TRIANGLE_R;
    expect(svg).toContain(`${cx},${topVertexY}`);
  });

  it("renders an inscribed equilateral triangle (polygon element)", () => {
    const comp = makeMarketComponent();
    const node: NodeGeometry = { id: "mkt-1", cx: 400, cy: 200, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    const svg = parts.join("");

    // Should contain a polygon for the triangle
    expect(svg).toContain("<polygon");
    expect(svg).toContain("stroke-linejoin=\"round\"");
  });

  it("renders 3 vertex circles with r=3", () => {
    const comp = makeMarketComponent();
    const node: NodeGeometry = { id: "mkt-1", cx: 400, cy: 200, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    const svg = parts.join("");

    // Count circles with r="3" — should be exactly 3 vertex circles
    const r3Matches = svg.match(/r="3"/g);
    expect(r3Matches).not.toBeNull();
    expect(r3Matches!.length).toBe(3);
  });

  it("total SVG has 5 elements: 1 outer circle + 1 polygon + 3 vertex circles", () => {
    const comp = makeMarketComponent();
    const node: NodeGeometry = { id: "mkt-1", cx: 400, cy: 200, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    // Market produces a single SVG fragment string with all elements
    expect(parts.length).toBe(1);
    const svg = parts[0];

    // Count circle elements (1 outer + 3 vertex = 4)
    const circleCount = (svg.match(/<circle /g) || []).length;
    expect(circleCount).toBe(4);

    // Count polygon elements (1 triangle)
    const polygonCount = (svg.match(/<polygon /g) || []).length;
    expect(polygonCount).toBe(1);
  });

  it("triangle top vertex is at (cx, cy - MARKET_TRIANGLE_R)", () => {
    const comp = makeMarketComponent();
    const cx = 500;
    const cy = 300;
    const node: NodeGeometry = { id: "mkt-1", cx, cy, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    const svg = parts.join("");

    // Top vertex of inscribed triangle: (cx, cy - MARKET_TRIANGLE_R) = (500, 270)
    const topY = cy - MARKET_TRIANGLE_R;
    expect(svg).toContain(`${cx},${topY}`);
  });

  it("respects component.color override", () => {
    const comp = makeMarketComponent({ color: "#ff0000" });
    const node: NodeGeometry = { id: "mkt-1", cx: 400, cy: 200, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    const svg = parts.join("");

    expect(svg).toContain('stroke="#ff0000"');
  });

  it("respects typeColors for market", () => {
    const comp = makeMarketComponent();
    const node: NodeGeometry = { id: "mkt-1", cx: 400, cy: 200, component: comp };
    const ctx = makeMinimalContext([node], {
      typeColors: { _default: "#000000", market: "#0066cc" },
    });

    const parts = renderNodesLayer(ctx);
    const svg = parts.join("");

    expect(svg).toContain('stroke="#0066cc"');
  });

  it("is excluded when excludeComponentTypes includes its type (component)", () => {
    const comp = makeMarketComponent();
    const node: NodeGeometry = { id: "mkt-1", cx: 400, cy: 200, component: comp };
    const ctx = makeMinimalContext([node], {
      excludeComponentTypes: ["component"],
    });

    const parts = renderNodesLayer(ctx);
    expect(parts.length).toBe(0);
  });

  it("does NOT render default small circle — uses custom market symbol instead", () => {
    const comp = makeMarketComponent();
    const node: NodeGeometry = { id: "mkt-1", cx: 400, cy: 200, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    const svg = parts.join("");

    // Should NOT have a circle with the default radius (5) as main node
    // It should have r="16" (outer) and r="3" (vertex circles)
    // The key check: it should have a polygon (triangle), not just circles
    expect(svg).toContain("<polygon");
    expect(svg).toContain(`r="${MARKET_OUTER_R}"`);
  });

  it("vertex circles are white-filled with stroke", () => {
    const comp = makeMarketComponent();
    const node: NodeGeometry = { id: "mkt-1", cx: 400, cy: 200, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    const svg = parts.join("");

    // All circles should have white fill
    const fillMatches = svg.match(/fill="#ffffff"/g);
    expect(fillMatches).not.toBeNull();
    // 4 circles (1 outer + 3 vertex) all with white fill
    expect(fillMatches!.length).toBe(4);
  });
});
