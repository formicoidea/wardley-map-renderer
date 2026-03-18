/**
 * phase-mapping.test.ts — Tests for resolveStyleByPosition and PhaseMapping schemas
 *
 * Verifies:
 *   1. resolveStyleByPosition — core range-based style lookup
 *   2. PhaseMappingEntrySchema — Zod validation for individual entries
 *   3. PhaseMappingSchema — Zod validation for ordered non-overlapping arrays
 *   4. DEFAULT_PHASE_MAPPING — the standard four-zone mapping
 *   5. Decoupling property — style resolution independent of phaseLabels cardinality
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHASE_MAPPING,
  PhaseMappingEntrySchema,
  PhaseMappingSchema,
  resolveStyleByPosition,
  type PhaseMapping,
  type PhaseMappingEntry,
} from "./phase-mapping.js";

// ── resolveStyleByPosition ────────────────────────────────────────────────────

describe("resolveStyleByPosition", () => {
  // ── Standard four-zone mapping (DEFAULT_PHASE_MAPPING) ──────────────────

  describe("with DEFAULT_PHASE_MAPPING", () => {
    it("resolves genesis zone (0.0 — interior)", () => {
      expect(resolveStyleByPosition(0.0, DEFAULT_PHASE_MAPPING)).toBe("genesis");
    });

    it("resolves genesis zone (0.05 — middle)", () => {
      expect(resolveStyleByPosition(0.05, DEFAULT_PHASE_MAPPING)).toBe("genesis");
    });

    it("resolves genesis zone (0.174 — just before boundary)", () => {
      expect(resolveStyleByPosition(0.174, DEFAULT_PHASE_MAPPING)).toBe("genesis");
    });

    it("resolves custom-built zone (0.175 — lower boundary, half-open)", () => {
      // 0.175 is the START of custom-built, so it belongs to custom-built
      expect(resolveStyleByPosition(0.175, DEFAULT_PHASE_MAPPING)).toBe("custom-built");
    });

    it("resolves custom-built zone (0.3 — middle)", () => {
      expect(resolveStyleByPosition(0.3, DEFAULT_PHASE_MAPPING)).toBe("custom-built");
    });

    it("resolves custom-built zone (0.399 — just before product boundary)", () => {
      expect(resolveStyleByPosition(0.399, DEFAULT_PHASE_MAPPING)).toBe("custom-built");
    });

    it("resolves product zone (0.4 — product lower boundary)", () => {
      expect(resolveStyleByPosition(0.4, DEFAULT_PHASE_MAPPING)).toBe("product");
    });

    it("resolves product zone (0.55 — middle)", () => {
      expect(resolveStyleByPosition(0.55, DEFAULT_PHASE_MAPPING)).toBe("product");
    });

    it("resolves product zone (0.699 — just before commodity boundary)", () => {
      expect(resolveStyleByPosition(0.699, DEFAULT_PHASE_MAPPING)).toBe("product");
    });

    it("resolves commodity zone (0.7 — commodity lower boundary)", () => {
      expect(resolveStyleByPosition(0.7, DEFAULT_PHASE_MAPPING)).toBe("commodity");
    });

    it("resolves commodity zone (0.85 — middle)", () => {
      expect(resolveStyleByPosition(0.85, DEFAULT_PHASE_MAPPING)).toBe("commodity");
    });

    it("resolves commodity zone (1.0 — maximum value, closed upper bound)", () => {
      // Critical: position = 1.0 must resolve to the rightmost entry
      expect(resolveStyleByPosition(1.0, DEFAULT_PHASE_MAPPING)).toBe("commodity");
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("returns undefined for empty mapping", () => {
      expect(resolveStyleByPosition(0.5, [])).toBeUndefined();
    });

    it("returns undefined when position falls in a gap", () => {
      const gapped: PhaseMapping = [
        { start: 0,   end: 0.3, styleKey: "low"  },
        // gap: 0.3 → 0.7
        { start: 0.7, end: 1.0, styleKey: "high" },
      ];
      expect(resolveStyleByPosition(0.5, gapped)).toBeUndefined();
    });

    it("resolves correctly when position is at gap boundary (left side of gap)", () => {
      const gapped: PhaseMapping = [
        { start: 0,   end: 0.3, styleKey: "low"  },
        { start: 0.7, end: 1.0, styleKey: "high" },
      ];
      // 0.3 falls in the gap (not included in either range: [0, 0.3) means 0.3 is not included)
      expect(resolveStyleByPosition(0.3, gapped)).toBeUndefined();
    });

    it("resolves correctly when position is at gap boundary (right side of gap)", () => {
      const gapped: PhaseMapping = [
        { start: 0,   end: 0.3, styleKey: "low"  },
        { start: 0.7, end: 1.0, styleKey: "high" },
      ];
      // 0.7 is the start of "high"
      expect(resolveStyleByPosition(0.7, gapped)).toBe("high");
    });

    it("returns undefined for position below all ranges", () => {
      const mapping: PhaseMapping = [
        { start: 0.5, end: 1.0, styleKey: "upper" },
      ];
      expect(resolveStyleByPosition(0.3, mapping)).toBeUndefined();
    });

    it("returns undefined for position above all ranges (mapping ends before 1.0)", () => {
      const mapping: PhaseMapping = [
        { start: 0,   end: 0.5, styleKey: "lower" },
      ];
      // 0.8 is above the upper bound of the only entry
      expect(resolveStyleByPosition(0.8, mapping)).toBeUndefined();
    });

    it("returns undefined for negative position", () => {
      expect(resolveStyleByPosition(-0.1, DEFAULT_PHASE_MAPPING)).toBeUndefined();
    });

    it("returns undefined for position > 1.0", () => {
      expect(resolveStyleByPosition(1.1, DEFAULT_PHASE_MAPPING)).toBeUndefined();
    });

    it("resolves single-entry mapping at position 0.0", () => {
      const single: PhaseMapping = [{ start: 0, end: 1.0, styleKey: "all" }];
      expect(resolveStyleByPosition(0.0, single)).toBe("all");
    });

    it("resolves single-entry mapping at position 1.0", () => {
      const single: PhaseMapping = [{ start: 0, end: 1.0, styleKey: "all" }];
      expect(resolveStyleByPosition(1.0, single)).toBe("all");
    });

    it("resolves single-entry mapping at interior position", () => {
      const single: PhaseMapping = [{ start: 0, end: 1.0, styleKey: "all" }];
      expect(resolveStyleByPosition(0.42, single)).toBe("all");
    });
  });

  // ── Half-open interval semantics ─────────────────────────────────────────

  describe("half-open interval semantics", () => {
    it("boundary 0.175 belongs to custom-built (next zone), not genesis", () => {
      // Genesis is [0, 0.175) — 0.175 is excluded
      // Custom-built is [0.175, 0.4) — 0.175 is included
      expect(resolveStyleByPosition(0.175, DEFAULT_PHASE_MAPPING)).toBe("custom-built");
      expect(resolveStyleByPosition(0.174999, DEFAULT_PHASE_MAPPING)).toBe("genesis");
    });

    it("boundary 0.4 belongs to product (next zone), not custom-built", () => {
      expect(resolveStyleByPosition(0.4, DEFAULT_PHASE_MAPPING)).toBe("product");
      expect(resolveStyleByPosition(0.39999, DEFAULT_PHASE_MAPPING)).toBe("custom-built");
    });

    it("boundary 0.7 belongs to commodity (next zone), not product", () => {
      expect(resolveStyleByPosition(0.7, DEFAULT_PHASE_MAPPING)).toBe("commodity");
      expect(resolveStyleByPosition(0.69999, DEFAULT_PHASE_MAPPING)).toBe("product");
    });

    it("1.0 is included in the last zone (closed upper bound)", () => {
      expect(resolveStyleByPosition(1.0, DEFAULT_PHASE_MAPPING)).toBe("commodity");
    });
  });

  // ── Decoupling property: style resolution independent of label cardinality ──

  describe("decoupling from phaseLabels cardinality", () => {
    it("3-zone mapping resolves positions correctly", () => {
      // A map with 3 display phases can still use 3 style zones
      const threeZone: PhaseMapping = [
        { start: 0,     end: 0.333, styleKey: "early"   },
        { start: 0.333, end: 0.667, styleKey: "mid"     },
        { start: 0.667, end: 1.0,   styleKey: "mature"  },
      ];
      expect(resolveStyleByPosition(0.1,   threeZone)).toBe("early");
      expect(resolveStyleByPosition(0.5,   threeZone)).toBe("mid");
      expect(resolveStyleByPosition(0.9,   threeZone)).toBe("mature");
      expect(resolveStyleByPosition(1.0,   threeZone)).toBe("mature");
    });

    it("5-zone mapping resolves positions correctly", () => {
      const fiveZone: PhaseMapping = [
        { start: 0.0,  end: 0.2,  styleKey: "zone-1" },
        { start: 0.2,  end: 0.4,  styleKey: "zone-2" },
        { start: 0.4,  end: 0.6,  styleKey: "zone-3" },
        { start: 0.6,  end: 0.8,  styleKey: "zone-4" },
        { start: 0.8,  end: 1.0,  styleKey: "zone-5" },
      ];
      expect(resolveStyleByPosition(0.0,  fiveZone)).toBe("zone-1");
      expect(resolveStyleByPosition(0.2,  fiveZone)).toBe("zone-2");
      expect(resolveStyleByPosition(0.5,  fiveZone)).toBe("zone-3");
      expect(resolveStyleByPosition(0.75, fiveZone)).toBe("zone-4");
      expect(resolveStyleByPosition(1.0,  fiveZone)).toBe("zone-5");
    });

    it("same position resolves to different styleKeys depending on mapping size", () => {
      // This is the key property: same position, different cardinality → different keys
      const twoZone: PhaseMapping = [
        { start: 0,   end: 0.5, styleKey: "A" },
        { start: 0.5, end: 1.0, styleKey: "B" },
      ];
      const fourZone = DEFAULT_PHASE_MAPPING;

      // Position 0.3 is in A with 2-zone, in custom-built with 4-zone
      expect(resolveStyleByPosition(0.3, twoZone)).toBe("A");
      expect(resolveStyleByPosition(0.3, fourZone)).toBe("custom-built");
    });
  });
});

// ── PhaseMappingEntrySchema ───────────────────────────────────────────────────

describe("PhaseMappingEntrySchema", () => {
  it("accepts a valid entry", () => {
    const result = PhaseMappingEntrySchema.safeParse({
      start: 0,
      end: 0.175,
      styleKey: "genesis",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ start: 0, end: 0.175, styleKey: "genesis" });
    }
  });

  it("rejects entry where start >= end", () => {
    expect(
      PhaseMappingEntrySchema.safeParse({ start: 0.5, end: 0.3, styleKey: "x" }).success
    ).toBe(false);
    expect(
      PhaseMappingEntrySchema.safeParse({ start: 0.5, end: 0.5, styleKey: "x" }).success
    ).toBe(false);
  });

  it("rejects entry with empty styleKey", () => {
    expect(
      PhaseMappingEntrySchema.safeParse({ start: 0, end: 1.0, styleKey: "" }).success
    ).toBe(false);
  });

  it("rejects start below 0", () => {
    expect(
      PhaseMappingEntrySchema.safeParse({ start: -0.1, end: 0.5, styleKey: "x" }).success
    ).toBe(false);
  });

  it("rejects end above 1", () => {
    expect(
      PhaseMappingEntrySchema.safeParse({ start: 0, end: 1.1, styleKey: "x" }).success
    ).toBe(false);
  });

  it("accepts entry with end exactly 1.0", () => {
    const result = PhaseMappingEntrySchema.safeParse({
      start: 0.7,
      end: 1.0,
      styleKey: "commodity",
    });
    expect(result.success).toBe(true);
  });
});

// ── PhaseMappingSchema ────────────────────────────────────────────────────────

describe("PhaseMappingSchema", () => {
  it("accepts an empty array", () => {
    expect(PhaseMappingSchema.safeParse([]).success).toBe(true);
  });

  it("accepts the DEFAULT_PHASE_MAPPING", () => {
    const result = PhaseMappingSchema.safeParse(DEFAULT_PHASE_MAPPING);
    expect(result.success).toBe(true);
  });

  it("accepts a single-entry mapping", () => {
    const result = PhaseMappingSchema.safeParse([
      { start: 0, end: 1.0, styleKey: "all" },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts a mapping with gaps between entries", () => {
    // Gaps are allowed — they just resolve to undefined
    const result = PhaseMappingSchema.safeParse([
      { start: 0,   end: 0.3, styleKey: "low"  },
      { start: 0.7, end: 1.0, styleKey: "high" },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts adjacent entries (touching boundaries are not overlapping)", () => {
    // entry[1].start === entry[0].end is valid (adjacent, not overlapping)
    const result = PhaseMappingSchema.safeParse([
      { start: 0,   end: 0.5, styleKey: "first"  },
      { start: 0.5, end: 1.0, styleKey: "second" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects overlapping entries", () => {
    const result = PhaseMappingSchema.safeParse([
      { start: 0,   end: 0.5, styleKey: "first"  },
      { start: 0.4, end: 1.0, styleKey: "second" }, // start=0.4 < prev end=0.5 → overlap
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects entries in wrong order (start[i] < end[i-1])", () => {
    const result = PhaseMappingSchema.safeParse([
      { start: 0.5, end: 1.0, styleKey: "second" },
      { start: 0,   end: 0.5, styleKey: "first"  }, // out of order
    ]);
    expect(result.success).toBe(false);
  });
});

// ── DEFAULT_PHASE_MAPPING ────────────────────────────────────────────────────

describe("DEFAULT_PHASE_MAPPING", () => {
  it("has exactly four entries", () => {
    expect(DEFAULT_PHASE_MAPPING).toHaveLength(4);
  });

  it("covers the full [0, 1] range without gaps", () => {
    // Verify boundaries are contiguous
    expect(DEFAULT_PHASE_MAPPING[0].start).toBe(0);
    expect(DEFAULT_PHASE_MAPPING[0].end).toBe(DEFAULT_PHASE_MAPPING[1].start);
    expect(DEFAULT_PHASE_MAPPING[1].end).toBe(DEFAULT_PHASE_MAPPING[2].start);
    expect(DEFAULT_PHASE_MAPPING[2].end).toBe(DEFAULT_PHASE_MAPPING[3].start);
    expect(DEFAULT_PHASE_MAPPING[3].end).toBe(1.0);
  });

  it("uses the expected style keys in order", () => {
    const keys = DEFAULT_PHASE_MAPPING.map((e) => e.styleKey);
    expect(keys).toEqual(["genesis", "custom-built", "product", "commodity"]);
  });

  it("uses the standard EVOLUTION_PHASE_* boundary constants", () => {
    // 0.175 = EVOLUTION_PHASE_CUSTOM, 0.4 = EVOLUTION_PHASE_PRODUCT, 0.7 = EVOLUTION_PHASE_COMMODITY
    expect(DEFAULT_PHASE_MAPPING[1].start).toBe(0.175);
    expect(DEFAULT_PHASE_MAPPING[2].start).toBe(0.4);
    expect(DEFAULT_PHASE_MAPPING[3].start).toBe(0.7);
  });

  it("passes PhaseMappingSchema validation", () => {
    const result = PhaseMappingSchema.safeParse(DEFAULT_PHASE_MAPPING);
    expect(result.success).toBe(true);
  });

  it("style keys do NOT match EvolveTypeEnum values (intentional decoupling)", () => {
    // EvolveTypeEnum = ["natural", "ecosystem", "forced", "late"]
    // DEFAULT_PHASE_MAPPING keys = ["genesis", "custom-built", "product", "commodity"]
    const evolveTypeKeys = new Set(["natural", "ecosystem", "forced", "late"]);
    for (const entry of DEFAULT_PHASE_MAPPING) {
      expect(evolveTypeKeys.has(entry.styleKey)).toBe(false);
    }
  });
});
