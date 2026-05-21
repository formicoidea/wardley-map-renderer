/**
 * Tests for the Market symbol rendering.
 *
 * Market symbol: outer circle (r=16, matching Method aura) containing 3 filled
 * vertex dots connected to the center by spokes, plus a small filled center dot.
 * The 3 vertices sit on an equilateral triangle inscribed so vertex circles are
 * fully contained inside the outer circle.
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
  it("exports MARKET_OUTER_R = 16 (matches Method aura), MARKET_TRIANGLE_R = 9 (node ring distance), MARKET_VERTEX_R = 5 (ring radius)", () => {
    expect(MARKET_OUTER_R).toBe(16);
    expect(MARKET_TRIANGLE_R).toBe(9);
    expect(MARKET_VERTEX_R).toBe(5);
    // Rings stay inside the outer circle: triangle distance + ring radius ≤ outer
    expect(MARKET_TRIANGLE_R + MARKET_VERTEX_R).toBeLessThanOrEqual(MARKET_OUTER_R);
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

    // Vertices at distance MARKET_TRIANGLE_R from center
    // Top vertex dot at (cx, cy - MARKET_TRIANGLE_R): touches outer circle edge
    const topVertexY = cy - MARKET_TRIANGLE_R;
    expect(svg).toContain(`cx="${cx}" cy="${topVertexY}" r="${MARKET_VERTEX_R}"`);
  });

  it("renders a triangle connecting the 3 nodes (polygon element), no spokes", () => {
    const comp = makeMarketComponent();
    const node: NodeGeometry = { id: "mkt-1", cx: 400, cy: 200, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    const svg = parts.join("");

    // Nodes are connected by a triangle, not spokes to the center
    expect(svg).toContain("<polygon");
    expect(svg).toContain('stroke-linejoin="round"');
    const lineCount = (svg.match(/<line /g) || []).length;
    expect(lineCount).toBe(0);
  });

  it("renders 3 ring circles with r=5", () => {
    const comp = makeMarketComponent();
    const node: NodeGeometry = { id: "mkt-1", cx: 400, cy: 200, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    const svg = parts.join("");

    // Count circles with r="5" — should be exactly 3 node rings
    const r5Matches = svg.match(/r="5"/g);
    expect(r5Matches).not.toBeNull();
    expect(r5Matches!.length).toBe(3);
  });

  it("total SVG has 4 circles (outer + 3 rings) and 1 triangle, no center dot", () => {
    const comp = makeMarketComponent();
    const node: NodeGeometry = { id: "mkt-1", cx: 400, cy: 200, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    // Market produces a single SVG fragment string with all elements
    expect(parts.length).toBe(1);
    const svg = parts[0];

    // Count circle elements (1 outer + 3 rings = 4, no center dot)
    const circleCount = (svg.match(/<circle /g) || []).length;
    expect(circleCount).toBe(4);

    // Exactly one triangle
    const polygonCount = (svg.match(/<polygon /g) || []).length;
    expect(polygonCount).toBe(1);
  });

  it("top vertex dot is at (cx, cy - MARKET_TRIANGLE_R)", () => {
    const comp = makeMarketComponent();
    const cx = 500;
    const cy = 300;
    const node: NodeGeometry = { id: "mkt-1", cx, cy, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    const svg = parts.join("");

    // Top vertex dot: (cx, cy - MARKET_TRIANGLE_R) = (500, 270)
    const topY = cy - MARKET_TRIANGLE_R;
    expect(svg).toContain(`cx="${cx}" cy="${topY}" r="${MARKET_VERTEX_R}"`);
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

    // Should NOT have a circle with the default radius (5) as main node.
    // The key check: it should have a connecting triangle + an outer r=16 circle.
    expect(svg).toContain("<polygon");
    expect(svg).toContain(`r="${MARKET_OUTER_R}"`);
  });

  it("the rings are hollow (white fill); the triangle has no fill", () => {
    const comp = makeMarketComponent();
    const node: NodeGeometry = { id: "mkt-1", cx: 400, cy: 200, component: comp };
    const ctx = makeMinimalContext([node]);

    const parts = renderNodesLayer(ctx);
    const svg = parts.join("");

    // Outer circle + 3 rings are all white-filled → 4 white fills
    const whiteFills = svg.match(/fill="#ffffff"/g);
    expect(whiteFills).not.toBeNull();
    expect(whiteFills!.length).toBe(4);

    // The triangle is not filled
    expect(svg).toContain('fill="none"');

    // No element is filled with the stroke color (rings are hollow, no center dot)
    const blackFills = svg.match(/fill="#000000"/g);
    expect(blackFills).toBeNull();
  });
});
