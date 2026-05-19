/**
 * phase-mapping-range-styles.test.ts — Sub-AC 3: Range-based style resolution
 *
 * Dedicated test file covering range boundary conditions for PhaseMapping:
 *
 *   - Boundary precision: positions immediately adjacent to zone transitions
 *   - Style dictionary integration: using styleKey output to drive render decisions
 *   - Zone coverage and gap detection in DEFAULT_PHASE_MAPPING
 *   - Custom narrow ranges and partial coverage
 *   - Consistency / purity: identical positions always return the same styleKey
 *
 * These tests complement phase-mapping.test.ts (which tests the API surface and
 * schema validation) by focusing specifically on *range boundary conditions* for
 * practical rendering use-cases.
 *
 * Terminology used in this file:
 *   "boundary" — an exact evolution value at the start/end of a zone transition
 *   "half-open interval" — [start, end): start is IN the zone, end is OUTSIDE
 *   "closed upper bound" — [start, 1.0]: the rightmost zone includes 1.0
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_PHASE_MAPPING,
  PhaseMappingSchema,
  resolveStyleByPosition,
  type PhaseMapping,
} from "./phase-mapping.js";

// ── Range boundary precision tests ───────────────────────────────────────────
//
// These tests verify the exact half-open interval semantics at each of the
// three transition boundaries in DEFAULT_PHASE_MAPPING:
//   0.175 — genesis / custom-built boundary
//   0.400 — custom-built / product boundary
//   0.700 — product / commodity boundary
//
// The critical property: for any boundary B separating zone A (end=B) from
// zone B (start=B), positions at epsilon below B must resolve to A, and
// positions at B or epsilon above B must resolve to the next zone.

describe("Range boundary precision — genesis/custom-built boundary (0.175)", () => {
  const BOUNDARY = 0.175;

  it("position at 0.174 (just below 0.175) resolves to genesis", () => {
    expect(resolveStyleByPosition(0.174, DEFAULT_PHASE_MAPPING)).toBe("genesis");
  });

  it("position at 0.175 (exact boundary) resolves to custom-built (not genesis)", () => {
    // The genesis zone is [0, 0.175) — 0.175 is EXCLUDED from genesis
    // The custom-built zone is [0.175, 0.4) — 0.175 is INCLUDED in custom-built
    expect(resolveStyleByPosition(BOUNDARY, DEFAULT_PHASE_MAPPING)).toBe("custom-built");
  });

  it("position at 0.1750001 (just above 0.175) resolves to custom-built", () => {
    expect(resolveStyleByPosition(0.1750001, DEFAULT_PHASE_MAPPING)).toBe("custom-built");
  });

  it("position at 0.1749999 (just below 0.175) resolves to genesis", () => {
    expect(resolveStyleByPosition(0.1749999, DEFAULT_PHASE_MAPPING)).toBe("genesis");
  });
});

describe("Range boundary precision — custom-built/product boundary (0.400)", () => {
  const BOUNDARY = 0.4;

  it("position at 0.399 (just below 0.4) resolves to custom-built", () => {
    expect(resolveStyleByPosition(0.399, DEFAULT_PHASE_MAPPING)).toBe("custom-built");
  });

  it("position at 0.4 (exact boundary) resolves to product (not custom-built)", () => {
    // custom-built zone is [0.175, 0.4) — 0.4 is EXCLUDED from custom-built
    // product zone is [0.4, 0.7) — 0.4 is INCLUDED in product
    expect(resolveStyleByPosition(BOUNDARY, DEFAULT_PHASE_MAPPING)).toBe("product");
  });

  it("position at 0.4000001 (just above 0.4) resolves to product", () => {
    expect(resolveStyleByPosition(0.4000001, DEFAULT_PHASE_MAPPING)).toBe("product");
  });

  it("position at 0.3999999 (just below 0.4) resolves to custom-built", () => {
    expect(resolveStyleByPosition(0.3999999, DEFAULT_PHASE_MAPPING)).toBe("custom-built");
  });
});

describe("Range boundary precision — product/commodity boundary (0.700)", () => {
  const BOUNDARY = 0.7;

  it("position at 0.699 (just below 0.7) resolves to product", () => {
    expect(resolveStyleByPosition(0.699, DEFAULT_PHASE_MAPPING)).toBe("product");
  });

  it("position at 0.7 (exact boundary) resolves to commodity (not product)", () => {
    // product zone is [0.4, 0.7) — 0.7 is EXCLUDED from product
    // commodity zone is [0.7, 1.0] — 0.7 is INCLUDED in commodity
    expect(resolveStyleByPosition(BOUNDARY, DEFAULT_PHASE_MAPPING)).toBe("commodity");
  });

  it("position at 0.7000001 (just above 0.7) resolves to commodity", () => {
    expect(resolveStyleByPosition(0.7000001, DEFAULT_PHASE_MAPPING)).toBe("commodity");
  });

  it("position at 0.6999999 (just below 0.7) resolves to product", () => {
    expect(resolveStyleByPosition(0.6999999, DEFAULT_PHASE_MAPPING)).toBe("product");
  });
});

describe("Range boundary precision — upper bound at 1.0 (closed interval)", () => {
  it("position at 1.0 (exact maximum) resolves to commodity via closed upper bound", () => {
    // The commodity zone uses a CLOSED upper bound [0.7, 1.0] — unlike all other
    // zones which use half-open intervals [start, end).
    // This ensures that the maximum evolution value (1.0) is always covered.
    expect(resolveStyleByPosition(1.0, DEFAULT_PHASE_MAPPING)).toBe("commodity");
  });

  it("position at 0.9999999 (just below 1.0) still resolves to commodity", () => {
    expect(resolveStyleByPosition(0.9999999, DEFAULT_PHASE_MAPPING)).toBe("commodity");
  });

  it("position exactly at 1.0 with a non-commodity last zone still resolves correctly", () => {
    // A custom mapping where the last zone ends at 1.0 — should still be closed
    const customMapping: PhaseMapping = [
      { start: 0, end: 0.5, styleKey: "low" },
      { start: 0.5, end: 1.0, styleKey: "high" },
    ];
    expect(resolveStyleByPosition(1.0, customMapping)).toBe("high");
  });
});

// ── Style dictionary integration — using styleKey to drive render decisions ────
//
// These tests verify the practical rendering use-case:
// resolveStyleByPosition returns a styleKey that is used to index into a
// style dictionary (e.g. color map, stroke map).  The mapping is open —
// any style key is valid.

describe("Style dictionary integration — styleKey drives render decisions", () => {
  it("resolved styleKey can index into a color dictionary", () => {
    const colorMap: Record<string, string> = {
      genesis: "#ff6b6b",
      "custom-built": "#ffa94d",
      product: "#74c0fc",
      commodity: "#63e6be",
    };

    // Each zone maps to a distinct color via the resolved styleKey
    expect(colorMap[resolveStyleByPosition(0.05, DEFAULT_PHASE_MAPPING)!]).toBe("#ff6b6b");
    expect(colorMap[resolveStyleByPosition(0.25, DEFAULT_PHASE_MAPPING)!]).toBe("#ffa94d");
    expect(colorMap[resolveStyleByPosition(0.55, DEFAULT_PHASE_MAPPING)!]).toBe("#74c0fc");
    expect(colorMap[resolveStyleByPosition(0.85, DEFAULT_PHASE_MAPPING)!]).toBe("#63e6be");
  });

  it("custom mapping styleKeys can be arbitrary strings (domain-specific)", () => {
    // styleKey is an open string — callers can use domain-specific vocabulary
    const domainMapping: PhaseMapping = [
      { start: 0, end: 0.3, styleKey: "emerging" },
      { start: 0.3, end: 0.7, styleKey: "scaling" },
      { start: 0.7, end: 1.0, styleKey: "mature" },
    ];
    const strokeMap: Record<string, number> = {
      emerging: 2,    // thick border for emerging tech
      scaling: 1.5,
      mature: 1,      // thin border for mature commodity
    };

    expect(strokeMap[resolveStyleByPosition(0.1, domainMapping)!]).toBe(2);
    expect(strokeMap[resolveStyleByPosition(0.5, domainMapping)!]).toBe(1.5);
    expect(strokeMap[resolveStyleByPosition(0.9, domainMapping)!]).toBe(1);
  });

  it("undefined returned for gap position does NOT index into a style dictionary", () => {
    const gappedMapping: PhaseMapping = [
      { start: 0, end: 0.4, styleKey: "low" },
      // gap: [0.4, 0.6)
      { start: 0.6, end: 1.0, styleKey: "high" },
    ];
    const styleMap: Record<string, string> = { low: "red", high: "blue" };

    const key = resolveStyleByPosition(0.5, gappedMapping); // falls in gap
    expect(key).toBeUndefined();

    // undefined key should be handled by caller (e.g. use a fallback color)
    const color = key !== undefined ? styleMap[key] : "gray"; // fallback
    expect(color).toBe("gray");
  });

  it("style lookup is consistent (pure function — same position always returns same key)", () => {
    const pos = 0.35;
    const key1 = resolveStyleByPosition(pos, DEFAULT_PHASE_MAPPING);
    const key2 = resolveStyleByPosition(pos, DEFAULT_PHASE_MAPPING);
    const key3 = resolveStyleByPosition(pos, DEFAULT_PHASE_MAPPING);
    expect(key1).toBe("custom-built");
    expect(key1).toBe(key2);
    expect(key2).toBe(key3);
  });
});

// ── Custom narrow range mapping ────────────────────────────────────────────────
//
// These tests verify that PhaseMapping works with arbitrarily narrow ranges
// (e.g. a 0.01-wide zone) — useful for highlighting specific evolution positions.

describe("Custom narrow range mapping — precise zone targeting", () => {
  it("resolves a narrow zone of width 0.01 at the genesis/custom boundary", () => {
    // Narrow spotlight: [0.170, 0.180] — straddles the genesis/custom boundary
    const narrowMapping: PhaseMapping = [
      { start: 0,     end: 0.170, styleKey: "pre-boundary" },
      { start: 0.170, end: 0.180, styleKey: "at-boundary"  },
      { start: 0.180, end: 1.0,   styleKey: "post-boundary" },
    ];

    expect(resolveStyleByPosition(0.169, narrowMapping)).toBe("pre-boundary");
    expect(resolveStyleByPosition(0.170, narrowMapping)).toBe("at-boundary");
    expect(resolveStyleByPosition(0.175, narrowMapping)).toBe("at-boundary"); // in narrow zone
    expect(resolveStyleByPosition(0.180, narrowMapping)).toBe("post-boundary");
  });

  it("resolves a single-entry mapping spanning exactly one small zone", () => {
    // Partial coverage: only the commodity zone [0.7, 1.0]
    const commodityOnly: PhaseMapping = [
      { start: 0.7, end: 1.0, styleKey: "commodity" },
    ];

    // Below the zone → undefined (gap)
    expect(resolveStyleByPosition(0.699, commodityOnly)).toBeUndefined();
    // At the boundary → resolved
    expect(resolveStyleByPosition(0.7, commodityOnly)).toBe("commodity");
    // Inside the zone → resolved
    expect(resolveStyleByPosition(0.85, commodityOnly)).toBe("commodity");
    // At the closed upper bound → resolved
    expect(resolveStyleByPosition(1.0, commodityOnly)).toBe("commodity");
  });

  it("handles a mapping with 8 equal-width zones (0.125 each)", () => {
    const eightZone: PhaseMapping = [
      { start: 0.000, end: 0.125, styleKey: "z1" },
      { start: 0.125, end: 0.250, styleKey: "z2" },
      { start: 0.250, end: 0.375, styleKey: "z3" },
      { start: 0.375, end: 0.500, styleKey: "z4" },
      { start: 0.500, end: 0.625, styleKey: "z5" },
      { start: 0.625, end: 0.750, styleKey: "z6" },
      { start: 0.750, end: 0.875, styleKey: "z7" },
      { start: 0.875, end: 1.000, styleKey: "z8" },
    ];

    // PhaseMappingSchema should accept this
    expect(PhaseMappingSchema.safeParse(eightZone).success).toBe(true);

    // Each boundary belongs to the NEXT zone (half-open)
    expect(resolveStyleByPosition(0.0,    eightZone)).toBe("z1");
    expect(resolveStyleByPosition(0.125,  eightZone)).toBe("z2"); // boundary → next zone
    expect(resolveStyleByPosition(0.250,  eightZone)).toBe("z3"); // boundary → next zone
    expect(resolveStyleByPosition(0.875,  eightZone)).toBe("z8"); // boundary → z8 (last)
    expect(resolveStyleByPosition(1.0,    eightZone)).toBe("z8"); // closed upper bound
  });
});

// ── Zone coverage properties of DEFAULT_PHASE_MAPPING ─────────────────────────
//
// These tests verify that DEFAULT_PHASE_MAPPING covers [0,1] without gaps
// and that every sampled position resolves to a non-undefined styleKey.

describe("DEFAULT_PHASE_MAPPING zone coverage — no gaps in [0,1]", () => {
  it("every zone boundary value resolves to a non-undefined styleKey", () => {
    // All four boundary values: 0.0, 0.175, 0.4, 0.7
    const boundaries = [0.0, 0.175, 0.4, 0.7];
    for (const b of boundaries) {
      expect(resolveStyleByPosition(b, DEFAULT_PHASE_MAPPING)).toBeDefined();
    }
  });

  it("a grid of 11 evenly-spaced samples all resolve to a styleKey", () => {
    // Sample at 0.0, 0.1, 0.2, ..., 1.0
    for (let i = 0; i <= 10; i++) {
      const pos = i / 10;
      expect(resolveStyleByPosition(pos, DEFAULT_PHASE_MAPPING)).toBeDefined();
    }
  });

  it("DEFAULT_PHASE_MAPPING uses non-overlapping, adjacent zones (no gaps, no overlaps)", () => {
    // Verify structural integrity: contiguous coverage
    expect(DEFAULT_PHASE_MAPPING[0].start).toBe(0);
    expect(DEFAULT_PHASE_MAPPING[0].end).toBe(DEFAULT_PHASE_MAPPING[1].start);
    expect(DEFAULT_PHASE_MAPPING[1].end).toBe(DEFAULT_PHASE_MAPPING[2].start);
    expect(DEFAULT_PHASE_MAPPING[2].end).toBe(DEFAULT_PHASE_MAPPING[3].start);
    expect(DEFAULT_PHASE_MAPPING[3].end).toBe(1.0);
    // Length: exactly 4 zones
    expect(DEFAULT_PHASE_MAPPING).toHaveLength(4);
  });

  it("resolved keys for sampled positions match expected zone order", () => {
    // Midpoints of each zone should resolve to the expected styleKey
    const midpoints = [
      [0.0875,  "genesis"],        // midpoint of [0, 0.175]
      [0.2875,  "custom-built"],   // midpoint of [0.175, 0.4]
      [0.55,    "product"],        // midpoint of [0.4, 0.7]
      [0.85,    "commodity"],      // midpoint of [0.7, 1.0]
    ] as const;

    for (const [pos, expectedKey] of midpoints) {
      expect(resolveStyleByPosition(pos, DEFAULT_PHASE_MAPPING)).toBe(expectedKey);
    }
  });
});
