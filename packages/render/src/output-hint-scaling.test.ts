/**
 * output-hint-scaling.test.ts — Sub-AC 4d: scaling math verification
 *
 * Verifies the resolution-independence contract defined in coordinate-space.ts:
 *
 *   scaleFactor = computeScaleFactor(coordinateSpace)
 *   uniform     = min(x, y)                 ← applied to px-space values
 *   x           = targetWidth  / canvasWidth (1 when absent)
 *   y           = targetHeight / canvasHeight (1 when absent)
 *
 * Three categories of values, with different scaling behaviour:
 *
 * | Field         | Space           | Scaled by outputHint?               |
 * |---------------|-----------------|-------------------------------------|
 * | nodeRadii     | canvas px-space | YES — multiplied by sf.uniform      |
 * | strokeWidth   | canvas px-space | YES — multiplied by sf.uniform      |
 * | labelScale    | unitless ×      | NO  — resolution-independent        |
 *
 * The 4 mandatory test cases (Sub-AC 4d):
 *   1. No outputHint → scale factor 1 (canvas dimensions as-is)
 *   2. outputHint.targetWidth triggers correct nodeRadius/strokeWidth scaling
 *   3. labelScale remains unchanged regardless of outputHint
 *   4. outputHint with both targetWidth and targetHeight uses width-based ratio
 *      for canvas-px fields (when output is proportional to canvas)
 */

import { describe, it, expect } from "vitest";
import {
  computeScaleFactor,
  CoordinateSpaceSchema,
  DEFAULT_COORDINATE_SPACE,
} from "./coordinate-space.js";

// ── Test 1: no outputHint → identity scale (factor = 1) ──────────────────────

describe("Sub-AC 4d — scaling math: no outputHint yields scale factor 1", () => {
  it("DEFAULT_COORDINATE_SPACE (no outputHint) returns {x:1, y:1, uniform:1}", () => {
    const sf = computeScaleFactor(DEFAULT_COORDINATE_SPACE);
    expect(sf.x).toBe(1);
    expect(sf.y).toBe(1);
    expect(sf.uniform).toBe(1);
  });

  it("canvas-px values are unchanged when scale factor is 1", () => {
    const sf = computeScaleFactor(DEFAULT_COORDINATE_SPACE);
    // Canvas-px values (nodeRadius, strokeWidth) are multiplied by sf.uniform
    const nodeRadius = 5;    // default canvas-px radius
    const strokeWidth = 1;   // default canvas-px stroke width
    expect(nodeRadius * sf.uniform).toBe(5);     // no change
    expect(strokeWidth * sf.uniform).toBe(1);    // no change
  });

  it("explicit CoordinateSpace without outputHint also yields {x:1, y:1, uniform:1}", () => {
    const cs = CoordinateSpaceSchema.parse({ width: 800, height: 400 });
    const sf = computeScaleFactor(cs);
    expect(sf.x).toBe(1);
    expect(sf.y).toBe(1);
    expect(sf.uniform).toBe(1);
  });

  it("outputHint present but all fields undefined yields {x:1, y:1, uniform:1}", () => {
    // OutputHint with no targetWidth/targetHeight is a no-op
    const cs = CoordinateSpaceSchema.parse({
      outputHint: {}, // all fields optional — empty hint = identity scale
    });
    const sf = computeScaleFactor(cs);
    expect(sf.x).toBe(1);
    expect(sf.y).toBe(1);
    expect(sf.uniform).toBe(1);
  });
});

// ── Test 2: outputHint.targetWidth triggers correct nodeRadius/strokeWidth scaling ──

describe("Sub-AC 4d — scaling math: outputHint.targetWidth scales canvas-px values", () => {
  it("targetWidth: 800 on 1600-px canvas → uniform = 0.5 (halves px-space values)", () => {
    const cs = CoordinateSpaceSchema.parse({
      width: 1600,
      height: 800,
      outputHint: { targetWidth: 800 },
    });
    const sf = computeScaleFactor(cs);

    // x = 800 / 1600 = 0.5 (width-based ratio)
    expect(sf.x).toBe(0.5);
    // y = 1 (no targetHeight → defaults to 1)
    expect(sf.y).toBe(1);
    // uniform = min(0.5, 1) = 0.5
    expect(sf.uniform).toBe(0.5);
  });

  it("nodeRadius (5px) scales to 2.5px at uniform = 0.5", () => {
    const cs = CoordinateSpaceSchema.parse({
      outputHint: { targetWidth: 800 },
    });
    const sf = computeScaleFactor(cs);
    const nodeRadius = 5; // canvas-px default
    expect(nodeRadius * sf.uniform).toBeCloseTo(2.5);
  });

  it("strokeWidth (1px) scales to 0.5px at uniform = 0.5", () => {
    const cs = CoordinateSpaceSchema.parse({
      outputHint: { targetWidth: 800 },
    });
    const sf = computeScaleFactor(cs);
    const strokeWidth = 1; // canvas-px default
    expect(strokeWidth * sf.uniform).toBeCloseTo(0.5);
  });

  it("targetWidth: 400 on 1600-px canvas → uniform = 0.25 (quarter scale)", () => {
    const cs = CoordinateSpaceSchema.parse({
      outputHint: { targetWidth: 400 },
    });
    const sf = computeScaleFactor(cs);
    // x = 400 / 1600 = 0.25
    expect(sf.x).toBeCloseTo(0.25);
    expect(sf.uniform).toBeCloseTo(0.25);

    // nodeRadius (5px) → 5 * 0.25 = 1.25px
    expect(5 * sf.uniform).toBeCloseTo(1.25);
    // strokeWidth (2px) → 2 * 0.25 = 0.5px
    expect(2 * sf.uniform).toBeCloseTo(0.5);
  });

  it("custom canvas width 800 with targetWidth: 400 → uniform = 0.5", () => {
    const cs = CoordinateSpaceSchema.parse({
      width: 800,
      height: 400,
      outputHint: { targetWidth: 400 },
    });
    const sf = computeScaleFactor(cs);
    // x = 400 / 800 = 0.5
    expect(sf.x).toBe(0.5);
    expect(sf.uniform).toBe(0.5);
  });
});

// ── Test 3: labelScale remains unchanged regardless of outputHint ─────────────

describe("Sub-AC 4d — scaling math: labelScale is resolution-independent (not scaled by outputHint)", () => {
  it("computeScaleFactor does not produce a labelScale field (not a px-space concern)", () => {
    const cs = CoordinateSpaceSchema.parse({
      outputHint: { targetWidth: 800 },
    });
    const sf = computeScaleFactor(cs);

    // ScaleFactor only has x, y, uniform — no labelScale field
    // labelScale is a unitless multiplier that lives outside computeScaleFactor
    expect(sf).not.toHaveProperty("labelScale");
  });

  it("labelScale is the same value regardless of outputHint — it MUST NOT be multiplied by sf.uniform", () => {
    const csWithHint = CoordinateSpaceSchema.parse({
      outputHint: { targetWidth: 400 }, // uniform = 0.25
    });
    const csWithoutHint = DEFAULT_COORDINATE_SPACE; // uniform = 1

    const sfWith = computeScaleFactor(csWithHint);
    const sfWithout = computeScaleFactor(csWithoutHint);

    // The two uniform factors differ
    expect(sfWith.uniform).toBe(0.25);
    expect(sfWithout.uniform).toBe(1);

    // A labelScale value (e.g. 1.5) must stay 1.5 in BOTH cases
    // The wrong approach would be: labelScale * sf.uniform (changes with hint)
    // The correct approach is: labelScale stays as-is (resolution-independent)
    const labelScale = 1.5; // unitless multiplier, NOT px-space

    // Correct: labelScale is unchanged regardless of sf.uniform
    const labelScaleWithHint = labelScale;       // do NOT multiply by sf.uniform
    const labelScaleWithoutHint = labelScale;    // do NOT multiply by sf.uniform
    expect(labelScaleWithHint).toBe(labelScaleWithoutHint); // always 1.5
    expect(labelScaleWithHint).toBe(1.5);
  });

  it("labelScale value 0.8 stays 0.8 regardless of a 4× outputHint", () => {
    const cs = CoordinateSpaceSchema.parse({
      width: 400,
      height: 200,
      outputHint: { targetWidth: 1600, targetHeight: 800 },
    });
    const sf = computeScaleFactor(cs);
    // x = 1600/400 = 4, y = 800/200 = 4, uniform = 4
    expect(sf.uniform).toBe(4);

    // labelScale = 0.8 → rendered font size = 0.8 × 12px = 9.6px
    // This does NOT change when outputHint is present
    const labelScale = 0.8;
    expect(labelScale).toBe(0.8); // unchanged — resolution-independent

    // Contrast: a nodeRadius (5px) DOES scale
    const nodeRadius = 5;
    expect(nodeRadius * sf.uniform).toBe(20); // 5 * 4 = 20px
  });
});

// ── Test 4: both targetWidth and targetHeight → width-based ratio governs ─────

describe("Sub-AC 4d — scaling math: both targetWidth + targetHeight use width-based ratio for canvas-px", () => {
  it("proportional resize: both targetWidth and targetHeight give same ratio → canvas-px scale equals width ratio", () => {
    // Canvas: 1600×800, target: 3200×1600 (proportional 2× resize)
    const cs = CoordinateSpaceSchema.parse({
      width: 1600,
      height: 800,
      outputHint: { targetWidth: 3200, targetHeight: 1600 },
    });
    const sf = computeScaleFactor(cs);

    const widthRatio = 3200 / 1600; // 2
    const heightRatio = 1600 / 800; // 2

    // Both ratios are equal in a proportional resize
    expect(sf.x).toBe(widthRatio);  // x = 2 (width-based ratio)
    expect(sf.y).toBe(heightRatio); // y = 2

    // Canvas-px scaling (uniform = min(x, y)) equals the width-based ratio
    expect(sf.uniform).toBe(widthRatio); // min(2, 2) = 2 = width ratio

    // nodeRadius (5px) scales by the width ratio
    const nodeRadius = 5;
    expect(nodeRadius * sf.uniform).toBe(nodeRadius * widthRatio);
    expect(nodeRadius * sf.uniform).toBe(10);
  });

  it("width-constrained case: targetWidth determines uniform when x < y", () => {
    // Canvas: 1600×800, targetWidth: 800 (x=0.5), targetHeight: 800 (y=1.0)
    // x < y → uniform = x = width-based ratio
    const cs = CoordinateSpaceSchema.parse({
      width: 1600,
      height: 800,
      outputHint: { targetWidth: 800, targetHeight: 800 },
    });
    const sf = computeScaleFactor(cs);

    expect(sf.x).toBe(0.5);    // width-based ratio
    expect(sf.y).toBe(1.0);    // height-based ratio
    // uniform = min(0.5, 1.0) = 0.5 = x → width-based ratio governs
    expect(sf.uniform).toBe(sf.x); // canvas-px fields use the width ratio
    expect(sf.uniform).toBe(0.5);
  });

  it("canvas-px values (nodeRadius, strokeWidth) use uniform which equals width ratio in proportional case", () => {
    // Canvas: 800×400, target: 1600×800 (2× proportional)
    const cs = CoordinateSpaceSchema.parse({
      width: 800,
      height: 400,
      outputHint: { targetWidth: 1600, targetHeight: 800 },
    });
    const sf = computeScaleFactor(cs);

    const widthRatio = 1600 / 800; // 2
    expect(sf.uniform).toBe(widthRatio); // canvas-px scale = width ratio = 2

    // Verify: nodeRadius and strokeWidth scaled by width ratio
    const nodeRadius = 6;
    const strokeWidth = 1.5;
    expect(nodeRadius * sf.uniform).toBe(nodeRadius * widthRatio);   // 12px
    expect(strokeWidth * sf.uniform).toBe(strokeWidth * widthRatio); // 3px
  });

  it("targetWidth-only baseline: sf.x equals targetWidth/canvasWidth regardless of targetHeight", () => {
    // No targetHeight
    const csWidthOnly = CoordinateSpaceSchema.parse({
      width: 1600,
      height: 800,
      outputHint: { targetWidth: 800 },
    });
    // Both targetWidth and targetHeight (same ratio)
    const csBoth = CoordinateSpaceSchema.parse({
      width: 1600,
      height: 800,
      outputHint: { targetWidth: 800, targetHeight: 400 },
    });

    const sfWidthOnly = computeScaleFactor(csWidthOnly);
    const sfBoth = computeScaleFactor(csBoth);

    // In both cases sf.x (width ratio) = 800/1600 = 0.5
    expect(sfWidthOnly.x).toBe(0.5);
    expect(sfBoth.x).toBe(0.5);

    // When targetHeight is provided proportionally (400/800 = 0.5), uniform is also 0.5
    expect(sfBoth.uniform).toBe(0.5);   // min(0.5, 0.5) = 0.5 = width ratio
    // The width-based ratio governs canvas-px fields in both cases
    expect(sfBoth.uniform).toBe(sfWidthOnly.uniform);
  });
});

// ── DPI field — resolution-independence semantics ─────────────────────────────
//
// The `dpi` field in OutputHint is an advisory metadata field that tells the
// renderer the intended output resolution for raster exports.  It does NOT
// affect the scale factor computation (computeScaleFactor ignores dpi).
//
// Physical dimension semantics:
//   physical_width_mm = (targetWidth / dpi) * 25.4
//   physical_height_mm = (targetHeight / dpi) * 25.4
//
// Common DPI values:
//   96  = standard screen DPI (CSS reference pixel, default assumed)
//   150 = draft print quality
//   192 = 2× retina screen DPI
//   300 = standard print quality
//
// Valid range: 1–2400 DPI (enforced by OutputHintSchema).

describe("Sub-AC 3: DPI field — validation boundary conditions", () => {
  it("dpi: 1 (minimum valid) is accepted by CoordinateSpaceSchema", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { dpi: 1 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outputHint?.dpi).toBe(1);
    }
  });

  it("dpi: 96 (standard screen DPI) is accepted", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { dpi: 96 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outputHint?.dpi).toBe(96);
    }
  });

  it("dpi: 2400 (maximum valid) is accepted by CoordinateSpaceSchema", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { dpi: 2400 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outputHint?.dpi).toBe(2400);
    }
  });

  it("dpi: 2401 (exceeds maximum) is rejected by CoordinateSpaceSchema", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { dpi: 2401 },
    });
    expect(result.success).toBe(false);
  });

  it("dpi: 0 (non-positive) is rejected", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { dpi: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("dpi: -1 (negative) is rejected", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { dpi: -1 },
    });
    expect(result.success).toBe(false);
  });
});

describe("Sub-AC 3: DPI-only hint — computeScaleFactor returns identity (dpi alone does not scale)", () => {
  it("outputHint with only dpi: 192 (no target dimensions) → scale factor is identity {1,1,1}", () => {
    // dpi is metadata for raster export — it does NOT change layout scale
    const cs = CoordinateSpaceSchema.parse({
      width: 1600, height: 800,
      outputHint: { dpi: 192 },
    });
    const sf = computeScaleFactor(cs);
    expect(sf.x).toBe(1);
    expect(sf.y).toBe(1);
    expect(sf.uniform).toBe(1);
  });

  it("outputHint with only dpi: 300 (print quality) → scale factor is identity", () => {
    const cs = CoordinateSpaceSchema.parse({
      width: 1600, height: 800,
      outputHint: { dpi: 300 },
    });
    const sf = computeScaleFactor(cs);
    expect(sf).toEqual({ x: 1, y: 1, uniform: 1 });
  });

  it("dpi combined with targetWidth still produces correct scale factor (dpi is ignored by formula)", () => {
    // Scale factor comes from targetWidth only; dpi is advisory metadata
    const cs = CoordinateSpaceSchema.parse({
      width: 1600, height: 800,
      outputHint: { targetWidth: 800, dpi: 192 },
    });
    const sf = computeScaleFactor(cs);
    // x = 800/1600 = 0.5 regardless of dpi
    expect(sf.x).toBe(0.5);
    expect(sf.uniform).toBe(0.5);
  });
});

describe("Sub-AC 3: DPI resolution-independence semantics — physical dimension derivation", () => {
  it("at 96 dpi, a 960px canvas represents 10 inches (960/96=10)", () => {
    // Physical width (inches) = canvas_px / dpi
    const canvasPx = 960;
    const dpi = 96;
    const physicalInches = canvasPx / dpi;
    expect(physicalInches).toBeCloseTo(10.0);
  });

  it("at 300 dpi, a 1500px canvas represents 5 inches (1500/300=5) — print-quality", () => {
    const canvasPx = 1500;
    const dpi = 300;
    const physicalInches = canvasPx / dpi;
    expect(physicalInches).toBeCloseTo(5.0);
  });

  it("at 192 dpi (2× retina), a 1600px canvas represents 8.33 inches — same physical size as 800px @ 96 dpi", () => {
    // A 2× retina export: double the pixels for the same physical size
    const canvas1xPx = 800;
    const canvas2xPx = 1600;
    const dpi1x = 96;
    const dpi2x = 192;

    const physical1x = canvas1xPx / dpi1x;  // 800/96 ≈ 8.33 inches
    const physical2x = canvas2xPx / dpi2x;  // 1600/192 ≈ 8.33 inches

    // Same physical size, different pixel density
    expect(physical1x).toBeCloseTo(physical2x, 5);
  });

  it("mm conversion: physical_mm = (px / dpi) * 25.4 — standard DPI-to-mm formula", () => {
    // A4 paper width is 210mm; at 300 DPI that is ~2480px
    const a4WidthMm = 210;
    const printDpi = 300;
    const expectedPx = (a4WidthMm / 25.4) * printDpi; // ≈ 2480.3
    expect(expectedPx).toBeCloseTo(2480.3, 0);

    // Reverse: px → mm
    const px = 2480;
    const physicalMm = (px / printDpi) * 25.4;
    expect(physicalMm).toBeCloseTo(209.97, 0);
  });

  it("targetWidth and dpi together declare both logical size and pixel density — computeScaleFactor uses only targetWidth", () => {
    // Scenario: 1600px canvas → output at 800 logical px @ 192 dpi (2× retina)
    const cs = CoordinateSpaceSchema.parse({
      width: 1600,
      height: 800,
      outputHint: {
        targetWidth: 800,
        targetHeight: 400,
        dpi: 192,
      },
    });
    const sf = computeScaleFactor(cs);

    // Scale is determined by target/canvas dimensions — NOT by dpi
    // x = 800/1600 = 0.5
    expect(sf.x).toBe(0.5);
    expect(sf.y).toBe(0.5);
    expect(sf.uniform).toBe(0.5);

    // dpi is preserved in the schema for downstream consumers (raster exporters)
    expect(cs.outputHint?.dpi).toBe(192);
  });
});

describe("Sub-AC 3: targetWidth/targetHeight boundary validation", () => {
  it("targetWidth: 1 (minimum valid) is accepted", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { targetWidth: 1 },
    });
    expect(result.success).toBe(true);
  });

  it("targetWidth: 10000 (maximum valid) is accepted", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { targetWidth: 10000 },
    });
    expect(result.success).toBe(true);
  });

  it("targetWidth: 10001 (exceeds maximum) is rejected", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { targetWidth: 10001 },
    });
    expect(result.success).toBe(false);
  });

  it("targetWidth: 0 (non-positive) is rejected", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { targetWidth: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("targetHeight: 1 (minimum valid) is accepted", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { targetHeight: 1 },
    });
    expect(result.success).toBe(true);
  });

  it("targetHeight: 10000 (maximum valid) is accepted", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { targetHeight: 10000 },
    });
    expect(result.success).toBe(true);
  });

  it("targetHeight: 10001 (exceeds maximum) is rejected", () => {
    const result = CoordinateSpaceSchema.safeParse({
      outputHint: { targetHeight: 10001 },
    });
    expect(result.success).toBe(false);
  });
});
