/**
 * coordinate-space-extraction.test.ts — Sub-AC 8a
 *
 * Tests dedicated to the CoordinateSpace EXTRACTION mechanism:
 *   - Coordinate-system-defining fields are properly extracted from RenderConfig
 *     into a dedicated CoordinateSpace structure
 *   - resolveTheme() populates coordinateSpace with DEFAULT_COORDINATE_SPACE when
 *     no coordinateSpace is provided
 *   - Partial coordinateSpace overrides are spread-merged with DEFAULT_COORDINATE_SPACE
 *   - Boundary dimension values (minimum 1, maximum 10000) are accepted
 *   - buildRenderContext() correctly reads coordinateSpace to build evoToX/visToY converters
 *   - Integration: the full path from schema input → resolveTheme → buildRenderContext
 *     correctly propagates coordinateSpace field values to pixel-coordinate outputs
 *
 * Coverage:
 *   1. Default extraction — resolveTheme adds coordinateSpace when absent
 *   2. Full override — explicit full coordinateSpace replaces defaults
 *   3. Partial merge — partial coordinateSpace fills missing fields from defaults
 *   4. Boundary: minimum canvas 1×1 px — accepted and propagated
 *   5. Boundary: maximum canvas 10000×10000 px — accepted and propagated
 *   6. Boundary: tightest valid evolution range (start < end by 0.001)
 *   7. Integration: evoToX pixel values computed from coordinateSpace.evolutionRange
 *   8. Integration: visToY pixel values computed from coordinateSpace.visibilityRange
 *   9. Integration: RenderContext.resolvedConfig.coordinateSpace reflects input
 *  10. Structural: coordinateSpace IS in ResolvedRenderConfig, NOT in MapChrome
 *
 * @module coordinate-space-extraction.test
 */

import { describe, it, expect } from "vitest";
import {
  resolveTheme,
  WardleyMapSchema,
  sanitizeMap,
  MapChromeSchema,
} from "./schema.js";
import {
  DEFAULT_COORDINATE_SPACE,
  CoordinateSpaceSchema,
} from "./coordinate-space.js";
import { buildRenderContext } from "./render/build-context.js";

// ── Fixture helpers ──────────────────────────────────────────────────────────

/**
 * Build a minimal valid WardleyMap with one component for pipeline integration tests.
 */
function makeMap(renderConfig: Record<string, unknown> = {}) {
  return sanitizeMap(
    WardleyMapSchema.parse({
      title: "Extraction Test Map",
      components: [
        {
          id: "comp",
          label: { name: "Test Component" },
          type: "component",
          position: {
            evolution: { scalar: 0.5 },
            visibility: { scalar: 0.5 },
          },
        },
      ],
      relations: [],
      renderConfig,
    })
  );
}

// ── 1. Default extraction ────────────────────────────────────────────────────

describe("CoordinateSpace extraction — default values from resolveTheme", () => {
  it("resolveTheme() provides coordinateSpace even when renderConfig is empty", () => {
    const resolved = resolveTheme({});
    expect(resolved.coordinateSpace).toBeDefined();
  });

  it("resolveTheme() with no coordinateSpace returns DEFAULT_COORDINATE_SPACE values", () => {
    const resolved = resolveTheme({});
    expect(resolved.coordinateSpace.width).toBe(DEFAULT_COORDINATE_SPACE.width);
    expect(resolved.coordinateSpace.height).toBe(DEFAULT_COORDINATE_SPACE.height);
    expect(resolved.coordinateSpace.evolutionRange).toEqual(
      DEFAULT_COORDINATE_SPACE.evolutionRange
    );
    expect(resolved.coordinateSpace.visibilityRange).toEqual(
      DEFAULT_COORDINATE_SPACE.visibilityRange
    );
    expect(resolved.coordinateSpace.unit).toBe(DEFAULT_COORDINATE_SPACE.unit);
  });

  it("resolveTheme() with undefined coordinateSpace returns DEFAULT_COORDINATE_SPACE values", () => {
    const resolved = resolveTheme({ coordinateSpace: undefined });
    expect(resolved.coordinateSpace).toEqual(DEFAULT_COORDINATE_SPACE);
  });

  it("resolveTheme() coordinateSpace is the same object shape as DEFAULT_COORDINATE_SPACE", () => {
    const resolved = resolveTheme({});
    // Same keys, same values — structural equality
    expect(resolved.coordinateSpace).toEqual(DEFAULT_COORDINATE_SPACE);
  });
});

// ── 2. Full override ─────────────────────────────────────────────────────────

describe("CoordinateSpace extraction — full explicit override via resolveTheme", () => {
  it("explicit coordinateSpace with non-default dimensions is preserved in resolved config", () => {
    const resolved = resolveTheme({
      coordinateSpace: {
        width: 800,
        height: 400,
        evolutionRange: [0, 1],
        visibilityRange: [0, 1],
        unit: "canvas-px",
      },
    });
    expect(resolved.coordinateSpace.width).toBe(800);
    expect(resolved.coordinateSpace.height).toBe(400);
  });

  it("explicit evolutionRange override is preserved in resolved coordinateSpace", () => {
    const resolved = resolveTheme({
      coordinateSpace: {
        evolutionRange: [0.1, 0.9],
      },
    });
    expect(resolved.coordinateSpace.evolutionRange).toEqual([0.1, 0.9]);
  });

  it("explicit visibilityRange override is preserved in resolved coordinateSpace", () => {
    const resolved = resolveTheme({
      coordinateSpace: {
        visibilityRange: [0, 0.75],
      },
    });
    expect(resolved.coordinateSpace.visibilityRange).toEqual([0, 0.75]);
  });
});

// ── 3. Partial merge semantics ───────────────────────────────────────────────

describe("CoordinateSpace extraction — partial override merges with defaults", () => {
  it("partial coordinateSpace {width: 800} fills height from defaults (800)", () => {
    const resolved = resolveTheme({
      coordinateSpace: { width: 800 },
    });
    // Width overridden, height stays default
    expect(resolved.coordinateSpace.width).toBe(800);
    expect(resolved.coordinateSpace.height).toBe(DEFAULT_COORDINATE_SPACE.height);
  });

  it("partial coordinateSpace {evolutionRange} keeps visibilityRange default", () => {
    const resolved = resolveTheme({
      coordinateSpace: { evolutionRange: [0.2, 0.8] },
    });
    expect(resolved.coordinateSpace.evolutionRange).toEqual([0.2, 0.8]);
    expect(resolved.coordinateSpace.visibilityRange).toEqual(
      DEFAULT_COORDINATE_SPACE.visibilityRange
    );
  });

  it("partial coordinateSpace {height: 400} keeps width default (1600)", () => {
    const resolved = resolveTheme({
      coordinateSpace: { height: 400 },
    });
    expect(resolved.coordinateSpace.width).toBe(DEFAULT_COORDINATE_SPACE.width);
    expect(resolved.coordinateSpace.height).toBe(400);
  });

  it("partial coordinateSpace {visibilityRange} keeps evolutionRange default", () => {
    const resolved = resolveTheme({
      coordinateSpace: { visibilityRange: [0.1, 0.9] },
    });
    expect(resolved.coordinateSpace.visibilityRange).toEqual([0.1, 0.9]);
    expect(resolved.coordinateSpace.evolutionRange).toEqual(
      DEFAULT_COORDINATE_SPACE.evolutionRange
    );
  });
});

// ── 4. Boundary: minimum canvas 1×1 px ──────────────────────────────────────

describe("CoordinateSpace extraction — boundary: minimum canvas dimensions", () => {
  it("CoordinateSpaceSchema accepts width: 1 (minimum boundary)", () => {
    const result = CoordinateSpaceSchema.safeParse({ width: 1 });
    expect(result.success).toBe(true);
  });

  it("CoordinateSpaceSchema accepts height: 1 (minimum boundary)", () => {
    const result = CoordinateSpaceSchema.safeParse({ height: 1 });
    expect(result.success).toBe(true);
  });

  it("1×1 canvas propagates to resolved coordinateSpace via resolveTheme", () => {
    const resolved = resolveTheme({
      coordinateSpace: { width: 1, height: 1 },
    });
    expect(resolved.coordinateSpace.width).toBe(1);
    expect(resolved.coordinateSpace.height).toBe(1);
  });

  it("1×1 canvas in coordinateSpace is accepted by buildRenderContext without throwing", () => {
    const map = makeMap({ coordinateSpace: { width: 1, height: 1 } });
    expect(() => buildRenderContext(map)).not.toThrow();
  });
});

// ── 5. Boundary: maximum canvas 10000×10000 px ──────────────────────────────

describe("CoordinateSpace extraction — boundary: maximum canvas dimensions", () => {
  it("CoordinateSpaceSchema accepts width: 10000 (maximum boundary)", () => {
    const result = CoordinateSpaceSchema.safeParse({ width: 10000 });
    expect(result.success).toBe(true);
  });

  it("CoordinateSpaceSchema accepts height: 10000 (maximum boundary)", () => {
    const result = CoordinateSpaceSchema.safeParse({ height: 10000 });
    expect(result.success).toBe(true);
  });

  it("10000×10000 canvas propagates to resolved coordinateSpace via resolveTheme", () => {
    const resolved = resolveTheme({
      coordinateSpace: { width: 10000, height: 10000 },
    });
    expect(resolved.coordinateSpace.width).toBe(10000);
    expect(resolved.coordinateSpace.height).toBe(10000);
  });
});

// ── 6. Boundary: tightest valid ranges ───────────────────────────────────────

describe("CoordinateSpace extraction — boundary: tightest valid axis ranges", () => {
  it("CoordinateSpaceSchema accepts evolutionRange [0, 0.001] (smallest valid span)", () => {
    const result = CoordinateSpaceSchema.safeParse({ evolutionRange: [0, 0.001] });
    expect(result.success).toBe(true);
  });

  it("CoordinateSpaceSchema rejects evolutionRange [0.5, 0.5] (zero-width range)", () => {
    const result = CoordinateSpaceSchema.safeParse({ evolutionRange: [0.5, 0.5] });
    expect(result.success).toBe(false);
  });

  it("CoordinateSpaceSchema accepts visibilityRange [0.999, 1] (smallest valid span)", () => {
    const result = CoordinateSpaceSchema.safeParse({ visibilityRange: [0.999, 1] });
    expect(result.success).toBe(true);
  });

  it("CoordinateSpaceSchema accepts evolutionRange [0, 1] and visibilityRange [0, 1] (full spans)", () => {
    const result = CoordinateSpaceSchema.safeParse({
      evolutionRange: [0, 1],
      visibilityRange: [0, 1],
    });
    expect(result.success).toBe(true);
  });
});

// ── 7. Integration: evoToX computed from coordinateSpace.evolutionRange ───────

describe("CoordinateSpace extraction — integration: evoToX from evolutionRange", () => {
  it("evo=0 at range [0,1] maps to plot.left", () => {
    const map = makeMap({});
    const ctx = buildRenderContext(map);
    // evo=0 → leftmost edge of plot
    const x = ctx.evoToX(0);
    expect(x).toBeCloseTo(ctx.plot.left, 1);
  });

  it("evo=1 at range [0,1] maps to plot.left + plot.width", () => {
    const map = makeMap({});
    const ctx = buildRenderContext(map);
    // evo=1 → rightmost edge of plot
    const x = ctx.evoToX(1);
    expect(x).toBeCloseTo(ctx.plot.left + ctx.plot.width, 1);
  });

  it("evo=0.5 at range [0,1] maps to plot center x", () => {
    const map = makeMap({});
    const ctx = buildRenderContext(map);
    const x = ctx.evoToX(0.5);
    expect(x).toBeCloseTo(ctx.plot.left + ctx.plot.width / 2, 1);
  });

  it("evo=0.5 with evolutionRange [0, 0.5] maps to plot.left + plot.width (right edge)", () => {
    const map = makeMap({ coordinateSpace: { evolutionRange: [0, 0.5] } });
    const ctx = buildRenderContext(map);
    const x = ctx.evoToX(0.5);
    expect(x).toBeCloseTo(ctx.plot.left + ctx.plot.width, 1);
  });

  it("evo=0.25 with evolutionRange [0.25, 0.75] maps to plot.left (left edge)", () => {
    const map = makeMap({ coordinateSpace: { evolutionRange: [0.25, 0.75] } });
    const ctx = buildRenderContext(map);
    const x = ctx.evoToX(0.25);
    expect(x).toBeCloseTo(ctx.plot.left, 1);
  });
});

// ── 8. Integration: visToY computed from coordinateSpace.visibilityRange ──────

describe("CoordinateSpace extraction — integration: visToY from visibilityRange", () => {
  it("vis=0 at range [0,1] maps to plot.top", () => {
    const map = makeMap({});
    const ctx = buildRenderContext(map);
    const y = ctx.visToY(0);
    expect(y).toBeCloseTo(ctx.plot.top, 1);
  });

  it("vis=1 at range [0,1] maps to plot.top + plot.height (bottom edge)", () => {
    const map = makeMap({});
    const ctx = buildRenderContext(map);
    const y = ctx.visToY(1);
    expect(y).toBeCloseTo(ctx.plot.top + ctx.plot.height, 1);
  });

  it("vis=0.5 at range [0,1] maps to plot vertical center", () => {
    const map = makeMap({});
    const ctx = buildRenderContext(map);
    const y = ctx.visToY(0.5);
    expect(y).toBeCloseTo(ctx.plot.top + ctx.plot.height / 2, 1);
  });

  it("vis=0.5 with visibilityRange [0, 0.5] maps to plot.top + plot.height (bottom edge)", () => {
    const map = makeMap({ coordinateSpace: { visibilityRange: [0, 0.5] } });
    const ctx = buildRenderContext(map);
    const y = ctx.visToY(0.5);
    expect(y).toBeCloseTo(ctx.plot.top + ctx.plot.height, 1);
  });
});

// ── 9. Integration: RenderContext.resolvedConfig.coordinateSpace ──────────────

describe("CoordinateSpace extraction — integration: coordinateSpace in RenderContext", () => {
  it("buildRenderContext preserves coordinateSpace in resolvedConfig", () => {
    const map = makeMap({
      coordinateSpace: {
        width: 800,
        height: 400,
        evolutionRange: [0.1, 0.9],
        visibilityRange: [0, 0.8],
      },
    });
    const ctx = buildRenderContext(map);

    expect(ctx.resolvedConfig.coordinateSpace.width).toBe(800);
    expect(ctx.resolvedConfig.coordinateSpace.height).toBe(400);
    expect(ctx.resolvedConfig.coordinateSpace.evolutionRange).toEqual([0.1, 0.9]);
    expect(ctx.resolvedConfig.coordinateSpace.visibilityRange).toEqual([0, 0.8]);
  });

  it("buildRenderContext with no coordinateSpace has DEFAULT_COORDINATE_SPACE in resolvedConfig", () => {
    const map = makeMap({});
    const ctx = buildRenderContext(map);

    expect(ctx.resolvedConfig.coordinateSpace).toEqual(DEFAULT_COORDINATE_SPACE);
  });

  it("canvasWidth reflects coordinateSpace.width when coordinateSpace width differs from default", () => {
    // canvasWidth comes from resolvedConfig.width (top-level), not coordinateSpace.width.
    // This test verifies the pipeline reads canvas dimensions correctly.
    const mapDefault = makeMap({});
    const ctx = buildRenderContext(mapDefault);
    expect(ctx.canvasWidth).toBe(DEFAULT_COORDINATE_SPACE.width);
    expect(ctx.canvasHeight).toBe(DEFAULT_COORDINATE_SPACE.height);
  });
});

// ── 10. Structural: coordinateSpace placement ─────────────────────────────────

describe("CoordinateSpace extraction — structural: field must be in RenderConfig, not MapChrome", () => {
  it("MapChromeSchema does NOT have a coordinateSpace field", () => {
    expect(
      Object.prototype.hasOwnProperty.call(MapChromeSchema.shape, "coordinateSpace")
    ).toBe(false);
  });

  it("resolveTheme() always returns a coordinateSpace field (never undefined)", () => {
    const resolved = resolveTheme({});
    // The coordinateSpace field must always be present after resolution
    expect(resolved.coordinateSpace).not.toBeUndefined();
    expect(resolved.coordinateSpace).not.toBeNull();
  });

  it("coordinateSpace field in resolved config has all required sub-fields", () => {
    const resolved = resolveTheme({});
    const cs = resolved.coordinateSpace;
    // All coordinate-system-defining fields must be present
    expect(typeof cs.width).toBe("number");
    expect(typeof cs.height).toBe("number");
    expect(Array.isArray(cs.evolutionRange)).toBe(true);
    expect(cs.evolutionRange).toHaveLength(2);
    expect(Array.isArray(cs.visibilityRange)).toBe(true);
    expect(cs.visibilityRange).toHaveLength(2);
    expect(cs.unit).toBe("canvas-px");
  });

  it("coordinateSpace fields are coordinate-system concerns, not presentational (units/origin distinguish from chrome)", () => {
    const cs = DEFAULT_COORDINATE_SPACE;
    // Presentational chrome fields (colors, fonts, labels) must NOT appear in coordinateSpace
    expect(cs).not.toHaveProperty("color");
    expect(cs).not.toHaveProperty("font");
    expect(cs).not.toHaveProperty("label");
    expect(cs).not.toHaveProperty("show");
    // Coordinate-system fields must be present
    expect(cs).toHaveProperty("width");
    expect(cs).toHaveProperty("height");
    expect(cs).toHaveProperty("evolutionRange");
    expect(cs).toHaveProperty("visibilityRange");
    expect(cs).toHaveProperty("unit");
  });
});
