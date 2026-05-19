/**
 * Tests: TypeStyleMap (typeColors, nodeRadii) supports the new types (market, ecosystem).
 *
 * Verifies that the TypeStyleMap pattern — used by nodeRadii, typeColors, and
 * the TypeStyleMap<T> type — correctly accepts "market" and "ecosystem" as
 * first-class per-type keys alongside the existing component/user-need/pipeline/note/anchor.
 */

import { describe, it, expect } from "vitest";
import {
  NodeRadiiSchema,
  TypeColorsSchema,
  typeStyleMapSchema,
  resolveTypeStyle,
} from "./schema.js";
import {
  KNOWN_RENDERABLE_TYPES,
  type KnownRenderableType,
} from "./renderable-type.js";
import { z } from "zod";

// ══════════════════════════════════════════════════════════════════════════════
// 1. KNOWN_RENDERABLE_TYPES includes market and ecosystem
// ══════════════════════════════════════════════════════════════════════════════

describe("KNOWN_RENDERABLE_TYPES includes market and ecosystem", () => {
  it("contains 'market'", () => {
    expect(KNOWN_RENDERABLE_TYPES).toContain("market");
  });

  it("contains 'ecosystem'", () => {
    expect(KNOWN_RENDERABLE_TYPES).toContain("ecosystem");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. NodeRadiiSchema — strict TypeStyleMap<number> with market/ecosystem keys
// ══════════════════════════════════════════════════════════════════════════════

describe("NodeRadiiSchema supports market and ecosystem keys", () => {
  it("accepts { _default, market } — market override", () => {
    const result = NodeRadiiSchema.safeParse({ _default: 5, market: 8 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ _default: 5, market: 8 });
    }
  });

  it("accepts { _default, ecosystem } — ecosystem override", () => {
    const result = NodeRadiiSchema.safeParse({ _default: 5, ecosystem: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ _default: 5, ecosystem: 10 });
    }
  });

  it("accepts { _default, market, ecosystem } — both new types together", () => {
    const result = NodeRadiiSchema.safeParse({
      _default: 5,
      market: 8,
      ecosystem: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.market).toBe(8);
      expect(result.data.ecosystem).toBe(10);
    }
  });

  it("accepts all KNOWN_RENDERABLE_TYPES keys including market and ecosystem", () => {
    const fullRadii: Record<string, number> = { _default: 5 };
    for (const t of KNOWN_RENDERABLE_TYPES) {
      fullRadii[t] = 7;
    }
    const result = NodeRadiiSchema.safeParse(fullRadii);
    expect(result.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. TypeColorsSchema — catchall TypeStyleMap<string> with market/ecosystem keys
// ══════════════════════════════════════════════════════════════════════════════

describe("TypeColorsSchema supports market and ecosystem keys", () => {
  it("accepts { _default, market } — market color override", () => {
    const result = TypeColorsSchema.safeParse({
      _default: "#374151",
      market: "#dc2626",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.market).toBe("#dc2626");
    }
  });

  it("accepts { _default, ecosystem } — ecosystem color override", () => {
    const result = TypeColorsSchema.safeParse({
      _default: "#374151",
      ecosystem: "#2563eb",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ecosystem).toBe("#2563eb");
    }
  });

  it("accepts { _default, market, ecosystem } — both new types together", () => {
    const result = TypeColorsSchema.safeParse({
      _default: "#374151",
      market: "#dc2626",
      ecosystem: "#2563eb",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.market).toBe("#dc2626");
      expect(result.data.ecosystem).toBe("#2563eb");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. resolveTypeStyle — lookup precedence for market and ecosystem
// ══════════════════════════════════════════════════════════════════════════════

describe("resolveTypeStyle supports market and ecosystem lookups", () => {
  it("resolves market-specific value when present", () => {
    const map = { _default: 5, market: 12 };
    expect(resolveTypeStyle(map, "market")).toBe(12);
  });

  it("falls back to _default when market key is absent", () => {
    const map = { _default: 5 };
    expect(resolveTypeStyle(map, "market")).toBe(5);
  });

  it("resolves ecosystem-specific value when present", () => {
    const map = { _default: "#000", ecosystem: "#0f0" };
    expect(resolveTypeStyle(map, "ecosystem")).toBe("#0f0");
  });

  it("falls back to _default when ecosystem key is absent", () => {
    const map = { _default: "#000" };
    expect(resolveTypeStyle(map, "ecosystem")).toBe("#000");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. typeStyleMapSchema (strict factory) — market/ecosystem as valid keys
// ══════════════════════════════════════════════════════════════════════════════

describe("typeStyleMapSchema strict factory accepts market and ecosystem", () => {
  it("strict schema built with KNOWN_RENDERABLE_TYPES accepts market key", () => {
    const schema = typeStyleMapSchema(z.number().positive(), KNOWN_RENDERABLE_TYPES, {
      requireDefault: true,
    });
    const result = schema.safeParse({ _default: 1, market: 2 });
    expect(result.success).toBe(true);
  });

  it("strict schema built with KNOWN_RENDERABLE_TYPES accepts ecosystem key", () => {
    const schema = typeStyleMapSchema(z.number().positive(), KNOWN_RENDERABLE_TYPES, {
      requireDefault: true,
    });
    const result = schema.safeParse({ _default: 1, ecosystem: 3 });
    expect(result.success).toBe(true);
  });

  it("strict schema still rejects unknown keys (not in KNOWN_RENDERABLE_TYPES)", () => {
    const schema = typeStyleMapSchema(z.number().positive(), KNOWN_RENDERABLE_TYPES, {
      requireDefault: true,
    });
    const result = schema.safeParse({ _default: 1, unknownType: 2 });
    expect(result.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. TypeStyleMap<T> type — compile-time check (market/ecosystem in KnownRenderableType)
// ══════════════════════════════════════════════════════════════════════════════

describe("KnownRenderableType type includes market and ecosystem", () => {
  it("market satisfies KnownRenderableType at runtime", () => {
    const marketType: KnownRenderableType = "market";
    expect(marketType).toBe("market");
  });

  it("ecosystem satisfies KnownRenderableType at runtime", () => {
    const ecosystemType: KnownRenderableType = "ecosystem";
    expect(ecosystemType).toBe("ecosystem");
  });
});
