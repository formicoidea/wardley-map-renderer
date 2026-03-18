/**
 * coordinate-space.test.ts — CoordinateSpace schema tests
 *
 * Verifies:
 *   - DEFAULT_COORDINATE_SPACE reconstructs current renderer behavior
 *   - All fields parse correctly with defaults
 *   - Validation rejects invalid range ordering
 *   - Custom values accepted within bounds
 *   - unit: 'canvas-px' enforced
 *   - Sub-AC 6a: render-config-v2.ts uses the canonical CoordinateSpaceSchema
 *     (not the legacy stub from schema.ts), and SpatialConfigSchema.coordinateSpace
 *     uses the full schema with width, height, evolutionRange, visibilityRange.
 */

import { describe, it, expect } from "vitest";
import {
  CoordinateSpaceSchema,
  DEFAULT_COORDINATE_SPACE,
  computeScaleFactor,
  type CoordinateSpace,
  type ScaleFactor,
} from "./coordinate-space.js";
import { MapChromeSchema } from "./schema.js";
import {
  CoordinateSpaceSchema as V2CoordinateSpaceSchema,
  SpatialConfigSchema,
} from "./render-config-v2.js";

describe("CoordinateSpaceSchema — defaults reconstruct current renderer behavior", () => {
  it("DEFAULT_COORDINATE_SPACE has width:1600, height:800", () => {
    expect(DEFAULT_COORDINATE_SPACE.width).toBe(1600);
    expect(DEFAULT_COORDINATE_SPACE.height).toBe(800);
  });

  it("DEFAULT_COORDINATE_SPACE has evolutionRange:[0,1]", () => {
    expect(DEFAULT_COORDINATE_SPACE.evolutionRange).toEqual([0, 1]);
  });

  it("DEFAULT_COORDINATE_SPACE has visibilityRange:[0,1]", () => {
    expect(DEFAULT_COORDINATE_SPACE.visibilityRange).toEqual([0, 1]);
  });

  it("DEFAULT_COORDINATE_SPACE has unit:'canvas-px'", () => {
    expect(DEFAULT_COORDINATE_SPACE.unit).toBe("canvas-px");
  });

  it("CoordinateSpaceSchema.parse({}) returns same values as DEFAULT_COORDINATE_SPACE", () => {
    const parsed = CoordinateSpaceSchema.parse({});
    expect(parsed).toEqual(DEFAULT_COORDINATE_SPACE);
  });
});

describe("CoordinateSpaceSchema — validation", () => {
  it("accepts explicit default values", () => {
    const result = CoordinateSpaceSchema.safeParse({
      width: 1600,
      height: 800,
      evolutionRange: [0, 1],
      visibilityRange: [0, 1],
      unit: "canvas-px",
    });
    expect(result.success).toBe(true);
  });

  it("accepts custom dimensions", () => {
    const result = CoordinateSpaceSchema.safeParse({ width: 800, height: 400 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBe(800);
      expect(result.data.height).toBe(400);
      // Defaults still applied for unspecified fields
      expect(result.data.evolutionRange).toEqual([0, 1]);
      expect(result.data.visibilityRange).toEqual([0, 1]);
    }
  });

  it("accepts partial evolution range (zoom in)", () => {
    const result = CoordinateSpaceSchema.safeParse({ evolutionRange: [0.1, 0.9] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evolutionRange).toEqual([0.1, 0.9]);
    }
  });

  it("accepts partial visibility range (focus on visible half)", () => {
    const result = CoordinateSpaceSchema.safeParse({ visibilityRange: [0, 0.5] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibilityRange).toEqual([0, 0.5]);
    }
  });

  it("rejects width > 10000", () => {
    const result = CoordinateSpaceSchema.safeParse({ width: 10001 });
    expect(result.success).toBe(false);
  });

  it("rejects height > 10000", () => {
    const result = CoordinateSpaceSchema.safeParse({ height: 10001 });
    expect(result.success).toBe(false);
  });

  it("rejects evolutionRange where start >= end", () => {
    const result = CoordinateSpaceSchema.safeParse({ evolutionRange: [0.9, 0.1] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i: { message: string }) => i.message).join(" ");
      expect(messages).toMatch(/evolutionRange/);
    }
  });

  it("rejects evolutionRange where start === end", () => {
    const result = CoordinateSpaceSchema.safeParse({ evolutionRange: [0.5, 0.5] });
    expect(result.success).toBe(false);
  });

  it("rejects visibilityRange where high >= low", () => {
    const result = CoordinateSpaceSchema.safeParse({ visibilityRange: [0.8, 0.2] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i: { message: string }) => i.message).join(" ");
      expect(messages).toMatch(/visibilityRange/);
    }
  });

  it("rejects unit values other than 'canvas-px'", () => {
    const result = CoordinateSpaceSchema.safeParse({ unit: "px" });
    expect(result.success).toBe(false);
  });

  it("rejects unit: 'em'", () => {
    const result = CoordinateSpaceSchema.safeParse({ unit: "em" });
    expect(result.success).toBe(false);
  });

  it("rejects negative width", () => {
    const result = CoordinateSpaceSchema.safeParse({ width: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects zero width", () => {
    const result = CoordinateSpaceSchema.safeParse({ width: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects evolution range values outside [0,1]", () => {
    const result = CoordinateSpaceSchema.safeParse({ evolutionRange: [-0.1, 0.5] });
    expect(result.success).toBe(false);
  });
});

describe("CoordinateSpaceSchema — TypeScript type compatibility", () => {
  it("CoordinateSpace type is assignable from parsed result", () => {
    const space: CoordinateSpace = CoordinateSpaceSchema.parse({});
    expect(space.width).toBe(1600);
  });

  it("DEFAULT_COORDINATE_SPACE is CoordinateSpace compatible", () => {
    const space: CoordinateSpace = DEFAULT_COORDINATE_SPACE;
    expect(space.unit).toBe("canvas-px");
  });
});

describe("CoordinateSpaceSchema — round-trip JSON serialization", () => {
  it("round-trips DEFAULT_COORDINATE_SPACE through JSON.stringify/parse", () => {
    const original = DEFAULT_COORDINATE_SPACE;
    const json = JSON.stringify(original);
    const reparsed = CoordinateSpaceSchema.parse(JSON.parse(json));
    expect(reparsed).toEqual(original);
  });

  it("round-trips custom coordinate space through JSON.stringify/parse", () => {
    const original = CoordinateSpaceSchema.parse({
      width: 800,
      height: 600,
      evolutionRange: [0.1, 0.9],
      visibilityRange: [0, 0.8],
    });
    const json = JSON.stringify(original);
    const reparsed = CoordinateSpaceSchema.parse(JSON.parse(json));
    expect(reparsed).toEqual(original);
  });
});

describe("MapChrome field isolation — coordinate-defining fields must NOT live in MapChrome", () => {
  it("MapChromeSchema does not contain 'evolutionRange' as a top-level field", () => {
    const shape = MapChromeSchema.shape;
    expect(Object.prototype.hasOwnProperty.call(shape, "evolutionRange")).toBe(false);
  });

  it("MapChromeSchema does not contain 'visibilityRange' as a top-level field", () => {
    const shape = MapChromeSchema.shape;
    expect(Object.prototype.hasOwnProperty.call(shape, "visibilityRange")).toBe(false);
  });

  it("MapChromeSchema does not contain 'width' as a top-level field", () => {
    const shape = MapChromeSchema.shape;
    expect(Object.prototype.hasOwnProperty.call(shape, "width")).toBe(false);
  });

  it("MapChromeSchema does not contain 'height' as a top-level field", () => {
    const shape = MapChromeSchema.shape;
    expect(Object.prototype.hasOwnProperty.call(shape, "height")).toBe(false);
  });

  it("MapChromeSchema does not contain 'unit' as a top-level field", () => {
    const shape = MapChromeSchema.shape;
    expect(Object.prototype.hasOwnProperty.call(shape, "unit")).toBe(false);
  });

  it("MapChromeSchema does not contain 'evolutionStart' as a top-level field", () => {
    const shape = MapChromeSchema.shape;
    expect(Object.prototype.hasOwnProperty.call(shape, "evolutionStart")).toBe(false);
  });

  it("MapChromeSchema does not contain 'evolutionEnd' as a top-level field", () => {
    const shape = MapChromeSchema.shape;
    expect(Object.prototype.hasOwnProperty.call(shape, "evolutionEnd")).toBe(false);
  });

  it("MapChromeSchema does not contain 'coordinateSpace' — coordinate-system declaration belongs on RenderConfigSchema", () => {
    const shape = MapChromeSchema.shape;
    expect(Object.prototype.hasOwnProperty.call(shape, "coordinateSpace")).toBe(false);
  });
});

// ── Sub-AC 6a: render-config-v2.ts uses canonical CoordinateSpaceSchema ───────
//
// After Sub-AC 6a, the CoordinateSpaceSchema exported from render-config-v2.ts
// must be the CANONICAL FULL schema from coordinate-space.ts — not the legacy
// stub from schema.ts (which only has {units, origin}).
//
// The SpatialConfigSchema.coordinateSpace field must also use the full schema,
// so that providing { coordinateSpace: {} } fills in all coordinate-system fields
// (width, height, evolutionRange, visibilityRange, unit) from defaults.

describe("Sub-AC 6a: render-config-v2 CoordinateSpaceSchema is canonical (not stub)", () => {
  it("CoordinateSpaceSchema exported from render-config-v2 has 'width' field (full schema, not stub)", () => {
    // The stub CoordinateSpaceSchema from schema.ts only has {units, origin}.
    // The canonical one from coordinate-space.ts has width, height, ranges, unit.
    const parsed = V2CoordinateSpaceSchema.parse({});
    expect(parsed).toHaveProperty("width");
    expect(parsed.width).toBe(1600);
  });

  it("CoordinateSpaceSchema exported from render-config-v2 has 'height' field (full schema, not stub)", () => {
    const parsed = V2CoordinateSpaceSchema.parse({});
    expect(parsed).toHaveProperty("height");
    expect(parsed.height).toBe(800);
  });

  it("CoordinateSpaceSchema exported from render-config-v2 has 'evolutionRange' field (full schema, not stub)", () => {
    const parsed = V2CoordinateSpaceSchema.parse({});
    expect(parsed).toHaveProperty("evolutionRange");
    expect(parsed.evolutionRange).toEqual([0, 1]);
  });

  it("CoordinateSpaceSchema exported from render-config-v2 has 'visibilityRange' field (full schema, not stub)", () => {
    const parsed = V2CoordinateSpaceSchema.parse({});
    expect(parsed).toHaveProperty("visibilityRange");
    expect(parsed.visibilityRange).toEqual([0, 1]);
  });

  it("CoordinateSpaceSchema from render-config-v2 is reference-identical to CoordinateSpaceSchema from coordinate-space.ts", () => {
    // Both should be the same Zod schema object (same reference)
    expect(V2CoordinateSpaceSchema).toBe(CoordinateSpaceSchema);
  });
});

describe("Sub-AC 6a: SpatialConfigSchema.coordinateSpace uses the full coordinate space schema", () => {
  it("SpatialConfigSchema.coordinateSpace: {} parses to full CoordinateSpace with all defaults", () => {
    const result = SpatialConfigSchema.safeParse({ coordinateSpace: {} });
    expect(result.success).toBe(true);
    if (result.success && result.data.coordinateSpace) {
      const cs = result.data.coordinateSpace;
      // Full schema fields — not just the stub's {units, origin}
      expect(cs.width).toBe(1600);
      expect(cs.height).toBe(800);
      expect(cs.evolutionRange).toEqual([0, 1]);
      expect(cs.visibilityRange).toEqual([0, 1]);
      expect(cs.unit).toBe("canvas-px");
      expect(cs.units).toBe("px");
      expect(cs.origin).toBe("top-left");
    }
  });

  it("SpatialConfigSchema without coordinateSpace has coordinateSpace as undefined (still optional)", () => {
    const result = SpatialConfigSchema.safeParse({ width: 800, height: 400 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coordinateSpace).toBeUndefined();
    }
  });

  it("SpatialConfigSchema.coordinateSpace accepts custom dimensions and ranges", () => {
    const result = SpatialConfigSchema.safeParse({
      coordinateSpace: {
        width: 800,
        height: 400,
        evolutionRange: [0.1, 0.9],
      },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.coordinateSpace) {
      expect(result.data.coordinateSpace.width).toBe(800);
      expect(result.data.coordinateSpace.height).toBe(400);
      expect(result.data.coordinateSpace.evolutionRange).toEqual([0.1, 0.9]);
    }
  });
});

// ── computeScaleFactor tests ─────────────────────────────────────────────────

describe("computeScaleFactor — resolution-independence scaling math", () => {
  describe("identity scale — no outputHint", () => {
    it("returns {x:1, y:1, uniform:1} for DEFAULT_COORDINATE_SPACE (no outputHint)", () => {
      const sf = computeScaleFactor(DEFAULT_COORDINATE_SPACE);
      expect(sf).toEqual({ x: 1, y: 1, uniform: 1 });
    });

    it("returns {x:1, y:1, uniform:1} when outputHint is undefined", () => {
      const cs = CoordinateSpaceSchema.parse({ width: 1600, height: 800 });
      const sf = computeScaleFactor(cs);
      expect(sf).toEqual({ x: 1, y: 1, uniform: 1 });
    });

    it("returns identity when outputHint has no targetWidth or targetHeight", () => {
      const cs = CoordinateSpaceSchema.parse({
        width: 1600, height: 800,
        outputHint: { dpi: 192 }, // dpi only — no target dimensions
      });
      const sf = computeScaleFactor(cs);
      expect(sf).toEqual({ x: 1, y: 1, uniform: 1 });
    });
  });

  describe("proportional scale — both targetWidth and targetHeight", () => {
    it("returns 0.5 for half-size output (800×400 from 1600×800)", () => {
      const cs = CoordinateSpaceSchema.parse({
        width: 1600, height: 800,
        outputHint: { targetWidth: 800, targetHeight: 400 },
      });
      const sf = computeScaleFactor(cs);
      expect(sf.x).toBeCloseTo(0.5);
      expect(sf.y).toBeCloseTo(0.5);
      expect(sf.uniform).toBeCloseTo(0.5);
    });

    it("returns 2.0 for double-size output (3200×1600 from 1600×800) — retina canvas", () => {
      const cs = CoordinateSpaceSchema.parse({
        width: 1600, height: 800,
        outputHint: { targetWidth: 3200, targetHeight: 1600 },
      });
      const sf = computeScaleFactor(cs);
      expect(sf.x).toBeCloseTo(2.0);
      expect(sf.y).toBeCloseTo(2.0);
      expect(sf.uniform).toBeCloseTo(2.0);
    });

    it("returns 1.0 when targetWidth and targetHeight match canvas dimensions", () => {
      const cs = CoordinateSpaceSchema.parse({
        width: 1600, height: 800,
        outputHint: { targetWidth: 1600, targetHeight: 800 },
      });
      const sf = computeScaleFactor(cs);
      expect(sf.x).toBeCloseTo(1.0);
      expect(sf.y).toBeCloseTo(1.0);
      expect(sf.uniform).toBeCloseTo(1.0);
    });

    it("uses min(x,y) for uniform when aspect ratio changes", () => {
      // targetWidth=800 → x=0.5, targetHeight=600 → y=0.75 (different aspect)
      const cs = CoordinateSpaceSchema.parse({
        width: 1600, height: 800,
        outputHint: { targetWidth: 800, targetHeight: 600 },
      });
      const sf = computeScaleFactor(cs);
      expect(sf.x).toBeCloseTo(0.5);
      expect(sf.y).toBeCloseTo(0.75);
      expect(sf.uniform).toBeCloseTo(0.5); // min(0.5, 0.75)
    });
  });

  describe("partial hint — only one dimension specified", () => {
    it("uses x scale with y=1 when only targetWidth is provided", () => {
      const cs = CoordinateSpaceSchema.parse({
        width: 1600, height: 800,
        outputHint: { targetWidth: 400 }, // 0.25x width, no height hint
      });
      const sf = computeScaleFactor(cs);
      expect(sf.x).toBeCloseTo(0.25);
      expect(sf.y).toBe(1);
      expect(sf.uniform).toBeCloseTo(0.25); // min(0.25, 1)
    });

    it("uses y scale with x=1 when only targetHeight is provided", () => {
      const cs = CoordinateSpaceSchema.parse({
        width: 1600, height: 800,
        outputHint: { targetHeight: 200 }, // 0.25x height, no width hint
      });
      const sf = computeScaleFactor(cs);
      expect(sf.x).toBe(1);
      expect(sf.y).toBeCloseTo(0.25);
      expect(sf.uniform).toBeCloseTo(0.25); // min(1, 0.25)
    });
  });

  describe("scale factor application — px-space vs unitless values", () => {
    it("uniform factor can be applied to nodeRadius (px-space) to maintain proportions", () => {
      const cs = CoordinateSpaceSchema.parse({
        width: 1600, height: 800,
        outputHint: { targetWidth: 800, targetHeight: 400 },
      });
      const sf = computeScaleFactor(cs);
      const originalRadius = 5; // px
      const scaledRadius = originalRadius * sf.uniform;
      expect(scaledRadius).toBeCloseTo(2.5); // half size
    });

    it("uniform factor can be applied to strokeWidth (px-space) to maintain proportions", () => {
      const cs = CoordinateSpaceSchema.parse({
        width: 1600, height: 800,
        outputHint: { targetWidth: 800, targetHeight: 400 },
      });
      const sf = computeScaleFactor(cs);
      const originalStrokeWidth = 1; // px
      const scaledStrokeWidth = originalStrokeWidth * sf.uniform;
      expect(scaledStrokeWidth).toBeCloseTo(0.5);
    });

    it("labelScale (unitless) must NOT be scaled — sf.uniform is not applied to it", () => {
      // This test documents the contract: labelScale is independent of canvas dimensions
      const cs = CoordinateSpaceSchema.parse({
        width: 1600, height: 800,
        outputHint: { targetWidth: 400, targetHeight: 200 }, // 0.25x scale
      });
      const sf = computeScaleFactor(cs);
      const labelScale = 1.0; // unitless — should remain 1.0
      // labelScale is NOT multiplied by sf.uniform
      expect(labelScale).toBe(1.0);
      // The scale factor itself is 0.25 (for px-space values only)
      expect(sf.uniform).toBeCloseTo(0.25);
    });
  });

  describe("type safety and schema round-trip", () => {
    it("returns a ScaleFactor with x, y, and uniform fields", () => {
      const sf: ScaleFactor = computeScaleFactor(DEFAULT_COORDINATE_SPACE);
      expect(typeof sf.x).toBe("number");
      expect(typeof sf.y).toBe("number");
      expect(typeof sf.uniform).toBe("number");
    });

    it("outputHint parsed through CoordinateSpaceSchema validates targetWidth/targetHeight bounds", () => {
      const result = CoordinateSpaceSchema.safeParse({
        outputHint: { targetWidth: 20000 }, // exceeds 10000 limit
      });
      expect(result.success).toBe(false);
    });

    it("dpi field is accepted alongside targetWidth/targetHeight", () => {
      const cs = CoordinateSpaceSchema.parse({
        outputHint: { targetWidth: 800, targetHeight: 400, dpi: 300 },
      });
      expect(cs.outputHint?.targetWidth).toBe(800);
      expect(cs.outputHint?.targetHeight).toBe(400);
      expect(cs.outputHint?.dpi).toBe(300);
    });
  });
});
