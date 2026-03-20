/**
 * Tests for the geometry layer — pipeline rect calculation,
 * coordinate conversion, and component positioning.
 */

import { describe, it, expect } from "vitest";
import {
  createRenderContext,
  evoToX,
  visToY,
  computePipelineRect,
  allPipelineRects,
  componentPosition,
  allComponentPositions,
  allEdgeSegments,
  componentEvolveArrows,
  type RenderContext,
} from "./geometry.js";
import type { WardleyMap, Component } from "./schema.js";

// ── Helpers ──────────────────────────────────────────────────────────

/** Minimal valid WardleyMap for testing (default 1600×800) */
function makeMap(overrides: Partial<WardleyMap> = {}): WardleyMap {
  return {
    title: "Test",
    components: [],
    relations: [],
    ...overrides,
  };
}

/** Create a pipeline component with geometry */
function makePipeline(
  id: string,
  evoStart: number,
  evoEnd: number,
  visStart: number,
  visEnd: number,
  handleEvolution?: number
): Component {
  return {
    id,
    label: { name: `Pipeline ${id}` },
    type: "pipeline",
    position: {
      evolution: { scalar: evoStart },
      visibility: { scalar: visEnd },
    },
    pipelineGeometry: {
      evoStart,
      evoEnd,
      visStart,
      visEnd,
      handleEvolution,
    },
  };
}

// ── RenderContext ─────────────────────────────────────────────────────

describe("createRenderContext", () => {
  it("computes plot area with fixed margins for default 1600×800 grid", () => {
    const ctx = createRenderContext(makeMap());

    expect(ctx.width).toBe(1600);
    expect(ctx.height).toBe(800);
    expect(ctx.plotLeft).toBe(28); // AXIS_MARGIN_LEFT
    expect(ctx.plotTop).toBe(28); // AXIS_MARGIN_TOP
    expect(ctx.plotRight).toBe(1580); // 1600 - 20
    expect(ctx.plotBottom).toBe(772); // 800 - 28
    expect(ctx.plotWidth).toBe(1552); // 1580 - 28
    expect(ctx.plotHeight).toBe(744); // 772 - 28
  });

  it("adapts to different renderConfig while keeping fixed margins", () => {
    const ctx = createRenderContext(
      makeMap({ renderConfig: { width: 800, height: 600, strokeWidth: 1 } })
    );

    expect(ctx.width).toBe(800);
    expect(ctx.height).toBe(600);
    // Margins stay the same
    expect(ctx.plotLeft).toBe(28);
    expect(ctx.plotTop).toBe(28);
    expect(ctx.plotRight).toBe(780); // 800 - 20
    expect(ctx.plotBottom).toBe(572); // 600 - 28
    expect(ctx.plotWidth).toBe(752); // 780 - 28
    expect(ctx.plotHeight).toBe(544); // 572 - 28
  });
});

// ── Coordinate conversion ────────────────────────────────────────────

describe("evoToX", () => {
  const ctx = createRenderContext(makeMap());

  it("maps 0 to plotLeft", () => {
    expect(evoToX(0, ctx)).toBe(ctx.plotLeft);
  });

  it("maps 1 to plotRight", () => {
    expect(evoToX(1, ctx)).toBe(ctx.plotLeft + ctx.plotWidth);
  });

  it("maps 0.5 to center of plot area", () => {
    expect(evoToX(0.5, ctx)).toBe(ctx.plotLeft + ctx.plotWidth / 2);
  });
});

describe("visToY", () => {
  const ctx = createRenderContext(makeMap());

  it("maps 0 (visible/top) to plotTop", () => {
    // OWM convention: visibility 0 = visible = top of map
    expect(visToY(0, ctx)).toBe(ctx.plotTop);
  });

  it("maps 1 (invisible/bottom) to plotBottom", () => {
    // OWM convention: visibility 1 = invisible = bottom of map
    expect(visToY(1, ctx)).toBe(ctx.plotTop + ctx.plotHeight);
  });
});

// ── Pipeline geometry ────────────────────────────────────────────────

describe("computePipelineRect", () => {
  const ctx = createRenderContext(makeMap());

  it("returns null for non-pipeline component without geometry", () => {
    const comp: Component = {
      id: "c1",
      label: { name: "Test" },
      type: "component",
      position: {
        evolution: { scalar: 0.5 },
        visibility: { scalar: 0.5 },
      },
    };
    expect(computePipelineRect(comp, ctx)).toBeNull();
  });

  it("computes correct pixel rectangle from normalized coordinates", () => {
    const pipe = makePipeline("p1", 0.2, 0.8, 0.3, 0.7);
    const rect = computePipelineRect(pipe, ctx)!;

    expect(rect).not.toBeNull();
    expect(rect.id).toBe("p1");

    // x: evoToX(0.2) and evoToX(0.8)
    const expectedX1 = evoToX(0.2, ctx);
    const expectedX2 = evoToX(0.8, ctx);
    expect(rect.x).toBeCloseTo(expectedX1);
    expect(rect.x2).toBeCloseTo(expectedX2);
    expect(rect.width).toBeCloseTo(expectedX2 - expectedX1);

    // y: visToY uses OWM convention (lower vis value → lower pixel y = higher on screen)
    // computePipelineRect normalises with Math.min/max
    const vy1 = visToY(0.3, ctx);
    const vy2 = visToY(0.7, ctx);
    const expectedYTop = Math.min(vy1, vy2);
    const expectedYBot = Math.max(vy1, vy2);
    expect(rect.y).toBeCloseTo(expectedYTop);
    expect(rect.y2).toBeCloseTo(expectedYBot);
    expect(rect.height).toBeCloseTo(expectedYBot - expectedYTop);
  });

  it("defaults handle to midpoint of evo range when not specified", () => {
    const pipe = makePipeline("p1", 0.2, 0.8, 0.3, 0.7);
    const rect = computePipelineRect(pipe, ctx)!;

    const expectedHandleX = evoToX(0.5, ctx); // midpoint of 0.2 and 0.8
    expect(rect.handleX).toBeCloseTo(expectedHandleX);
    expect(rect.handleY).toBe(rect.y); // handle at top edge
  });

  it("uses explicit handleEvolution when provided", () => {
    const pipe = makePipeline("p1", 0.2, 0.8, 0.3, 0.7, 0.3);
    const rect = computePipelineRect(pipe, ctx)!;

    const expectedHandleX = evoToX(0.3, ctx);
    expect(rect.handleX).toBeCloseTo(expectedHandleX);
  });

  it("handles swapped evo coordinates (evoStart > evoEnd) gracefully", () => {
    const pipe = makePipeline("p1", 0.8, 0.2, 0.3, 0.7);
    const rect = computePipelineRect(pipe, ctx)!;

    // Should normalize: x = min, x2 = max
    expect(rect.x).toBeLessThan(rect.x2);
    expect(rect.width).toBeGreaterThan(0);
  });

  it("handles swapped vis coordinates (visStart > visEnd) gracefully", () => {
    const pipe = makePipeline("p1", 0.2, 0.8, 0.7, 0.3);
    const rect = computePipelineRect(pipe, ctx)!;

    // Should normalize: y = min, y2 = max
    expect(rect.y).toBeLessThan(rect.y2);
    expect(rect.height).toBeGreaterThan(0);
  });

  it("produces correct values for real MapKeep pipeline data", () => {
    // From mapkeep-extracted-maps.json: "App Interface design"
    const pipe = makePipeline("p-real", 0.196, 0.735, 0.664, 0.704, 0.245);
    const rect = computePipelineRect(pipe, ctx)!;

    expect(rect.x).toBeCloseTo(evoToX(0.196, ctx));
    expect(rect.x2).toBeCloseTo(evoToX(0.735, ctx));
    // visToY uses OWM convention: lower vis value → lower pixel y
    // computePipelineRect normalises with Math.min/max
    const vy664 = visToY(0.664, ctx);
    const vy704 = visToY(0.704, ctx);
    expect(rect.y).toBeCloseTo(Math.min(vy664, vy704));
    expect(rect.y2).toBeCloseTo(Math.max(vy664, vy704));
    expect(rect.handleX).toBeCloseTo(evoToX(0.245, ctx));
  });
});

describe("allPipelineRects", () => {
  const ctx = createRenderContext(makeMap());

  it("returns only pipeline components with geometry", () => {
    const map = makeMap({
      components: [
        makePipeline("p1", 0.1, 0.5, 0.2, 0.4),
        {
          id: "c1",
          label: { name: "Regular" },
          type: "component",
          position: {
            evolution: { scalar: 0.5 },
            visibility: { scalar: 0.5 },
          },
        },
        makePipeline("p2", 0.3, 0.9, 0.1, 0.6),
      ],
    });

    const rects = allPipelineRects(map, ctx);
    expect(rects).toHaveLength(2);
    expect(rects[0].id).toBe("p1");
    expect(rects[1].id).toBe("p2");
  });

  it("returns empty array when no pipelines", () => {
    const rects = allPipelineRects(makeMap(), ctx);
    expect(rects).toHaveLength(0);
  });
});

// ── Component positions ──────────────────────────────────────────────

describe("componentPosition", () => {
  const ctx = createRenderContext(makeMap());

  it("converts normalized coords to pixel center", () => {
    const comp: Component = {
      id: "c1",
      label: { name: "Test" },
      type: "component",
      position: {
        evolution: { scalar: 0.5 },
        visibility: { scalar: 0.3 },
      },
    };
    const pos = componentPosition(comp, ctx);

    expect(pos.id).toBe("c1");
    expect(pos.cx).toBeCloseTo(evoToX(0.5, ctx));
    expect(pos.cy).toBeCloseTo(visToY(0.3, ctx));
  });
});

describe("allComponentPositions", () => {
  it("creates a Map of all component positions", () => {
    const map = makeMap({
      components: [
        {
          id: "a",
          label: { name: "A" },
          type: "component",
          position: {
            evolution: { scalar: 0.1 },
            visibility: { scalar: 0.2 },
          },
        },
        {
          id: "b",
          label: { name: "B" },
          type: "user-need",
          position: {
            evolution: { scalar: 0.9 },
            visibility: { scalar: 0.8 },
          },
        },
      ],
    });
    const ctx = createRenderContext(map);
    const positions = allComponentPositions(map, ctx);

    expect(positions.size).toBe(2);
    expect(positions.has("a")).toBe(true);
    expect(positions.has("b")).toBe(true);
  });
});

// ── Edge segments ────────────────────────────────────────────────────

describe("allEdgeSegments", () => {
  it("computes edge segments from relations", () => {
    const map = makeMap({
      components: [
        {
          id: "a",
          label: { name: "A" },
          type: "component",
          position: {
            evolution: { scalar: 0.2 },
            visibility: { scalar: 0.3 },
          },
        },
        {
          id: "b",
          label: { name: "B" },
          type: "component",
          position: {
            evolution: { scalar: 0.8 },
            visibility: { scalar: 0.7 },
          },
        },
      ],
      relations: [{ source: "a", target: "b", type: "DependsOn" }],
    });
    const ctx = createRenderContext(map);
    const positions = allComponentPositions(map, ctx);
    const edges = allEdgeSegments(map, positions);

    expect(edges).toHaveLength(1);
    expect(edges[0].x1).toBeCloseTo(evoToX(0.2, ctx));
    expect(edges[0].y1).toBeCloseTo(visToY(0.3, ctx));
    expect(edges[0].x2).toBeCloseTo(evoToX(0.8, ctx));
    expect(edges[0].y2).toBeCloseTo(visToY(0.7, ctx));
  });

  it("skips relations with missing component IDs", () => {
    const map = makeMap({
      components: [
        {
          id: "a",
          label: { name: "A" },
          type: "component",
          position: {
            evolution: { scalar: 0.5 },
            visibility: { scalar: 0.5 },
          },
        },
      ],
      relations: [{ source: "a", target: "missing", type: "DependsOn" }],
    });
    const ctx = createRenderContext(map);
    const positions = allComponentPositions(map, ctx);
    const edges = allEdgeSegments(map, positions);

    expect(edges).toHaveLength(0);
  });
});

// ── EvolveArrows ─────────────────────────────────────────────────────

describe("componentEvolveArrows", () => {
  const ctx = createRenderContext(makeMap());

  it("returns empty array when no evolvesTo", () => {
    const comp: Component = {
      id: "c1",
      label: { name: "Test" },
      type: "component",
      position: {
        evolution: { scalar: 0.3 },
        visibility: { scalar: 0.5 },
      },
    };
    expect(componentEvolveArrows(comp, ctx)).toHaveLength(0);
  });

  it("computes arrow from component to evolved position", () => {
    const comp: Component = {
      id: "c1",
      label: { name: "Test" },
      type: "component",
      position: {
        evolution: { scalar: 0.3 },
        visibility: { scalar: 0.5 },
      },
      evolvesTo: [
        {
          position: {
            evolution: { scalar: 0.7 },
            visibility: { scalar: 0.5 },
          },
          evolveType: "natural",
        },
      ],
    };
    const arrows = componentEvolveArrows(comp, ctx);

    expect(arrows).toHaveLength(1);
    expect(arrows[0].fromX).toBeCloseTo(evoToX(0.3, ctx));
    expect(arrows[0].fromY).toBeCloseTo(visToY(0.5, ctx));
    expect(arrows[0].toX).toBeCloseTo(evoToX(0.7, ctx));
    expect(arrows[0].toY).toBeCloseTo(visToY(0.5, ctx));
    expect(arrows[0].evolveType).toBe("natural");
  });
});
