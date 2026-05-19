/**
 * Unit tests for the rendering-local type vocabulary (renderable-type.ts).
 *
 * Coverage:
 *   1. Known types map correctly — every item in KNOWN_RENDERABLE_TYPES is recognised.
 *   2. Unknown types map to _default — resolveTypeStyle falls back for unlisted keys.
 *   3. Branded extensibility — asRenderableType accepts any non-empty string.
 *   4. TypeStyleMap _default fallback — lookup returns _default when the specific key is absent.
 */

import { describe, it, expect } from "vitest";
import {
  KNOWN_RENDERABLE_TYPES,
  type KnownRenderableType,
  type RenderableType,
  isKnownRenderableType,
  isRenderableType,
  asRenderableType,
  mapComponentType,
  DEFAULT_RENDERABLE_TYPE_SENTINEL,
} from "./renderable-type.js";
import { resolveTypeStyle, type TypeStyleMap } from "./schema.js";

// ── 1. Known types map correctly ─────────────────────────────────────────────

describe("KNOWN_RENDERABLE_TYPES", () => {
  it("contains all expected Wardley Map component type literals", () => {
    // This list must match the data-schema ComponentType values.
    // When the data schema gains a new type, this test will remind us to update
    // the render vocabulary too.
    const expected: KnownRenderableType[] = [
      "component",
      "user-need",
      "pipeline",
      "note",
      "anchor",
      "market",
      "ecosystem",
    ];
    expect([...KNOWN_RENDERABLE_TYPES]).toEqual(expected);
  });

  it("isKnownRenderableType returns true for every known type", () => {
    for (const t of KNOWN_RENDERABLE_TYPES) {
      expect(isKnownRenderableType(t)).toBe(true);
    }
  });

  it("isKnownRenderableType returns false for an unknown type string", () => {
    expect(isKnownRenderableType("genesis")).toBe(false);
    expect(isKnownRenderableType("custom-plugin-type")).toBe(false);
    expect(isKnownRenderableType("")).toBe(false);
  });

  it("known type strings satisfy the RenderableType assignability (no cast needed)", () => {
    // The compiler must accept known literals as RenderableType without asRenderableType().
    const t: RenderableType = "component";
    expect(t).toBe("component");

    const u: RenderableType = "anchor";
    expect(u).toBe("anchor");
  });
});

// ── 2. Unknown types map to _default via TypeStyleMap lookup ─────────────────

describe("unknown type → _default fallback", () => {
  it("resolveTypeStyle returns _default when the type key is absent from the map", () => {
    const styleMap: TypeStyleMap<string> = {
      _default: "#000000",
      anchor: "#2563eb",
    };

    // "component" is not in the map above — must fall back to _default.
    const result = resolveTypeStyle(styleMap, "component");
    expect(result).toBe("#000000");
  });

  it("resolveTypeStyle returns the per-type value when the key IS present", () => {
    const styleMap: TypeStyleMap<string> = {
      _default: "#000000",
      anchor: "#2563eb",
    };

    expect(resolveTypeStyle(styleMap, "anchor")).toBe("#2563eb");
  });

  it("resolveTypeStyle returns _default for a completely unknown/branded type", () => {
    const radiiMap: TypeStyleMap<number> = { _default: 5, anchor: 10 };

    // A future data-schema type that the renderer does not know about yet.
    const unknownType = "future-component-type";
    expect(resolveTypeStyle(radiiMap, unknownType)).toBe(5);
  });

  it("resolveTypeStyle returns undefined when neither the key nor _default are present", () => {
    // Partial<TypeStyleMap> — _default is optional; caller must handle undefined.
    const partialMap: Partial<TypeStyleMap<number>> = { anchor: 10 };
    expect(resolveTypeStyle(partialMap, "component")).toBeUndefined();
  });
});

// ── 3. Branded extensibility ──────────────────────────────────────────────────

describe("asRenderableType — branded extensibility", () => {
  it("accepts a known type string and returns it unchanged", () => {
    const result = asRenderableType("component");
    expect(result).toBe("component");
  });

  it("accepts a custom (unknown) string and returns it as RenderableType", () => {
    // This is the approved escape hatch for plugin / extension types.
    const custom: RenderableType = asRenderableType("my-custom-plugin-type");
    expect(custom).toBe("my-custom-plugin-type");
  });

  it("accepts hyphenated and spaced custom type strings", () => {
    expect(asRenderableType("custom-type-v2")).toBe("custom-type-v2");
    expect(asRenderableType("wardley:capability")).toBe("wardley:capability");
  });

  it("throws for an empty string (empty type key is not meaningful)", () => {
    expect(() => asRenderableType("")).toThrow(TypeError);
    expect(() => asRenderableType("   ")).toThrow(TypeError);
  });

  it("isRenderableType returns true for both known and branded strings", () => {
    expect(isRenderableType("component")).toBe(true);
    expect(isRenderableType(asRenderableType("custom-type"))).toBe(true);
  });

  it("isRenderableType returns false for non-string values", () => {
    expect(isRenderableType(null)).toBe(false);
    expect(isRenderableType(undefined)).toBe(false);
    expect(isRenderableType(42)).toBe(false);
    expect(isRenderableType({})).toBe(false);
  });
});

// ── 4. TypeStyleMap _default fallback mechanism ───────────────────────────────

describe("TypeStyleMap _default fallback", () => {
  it("returns _default when looked up type is not in the map", () => {
    const colorMap: TypeStyleMap<string> = {
      _default: "#374151",
      component: "#dc2626",
    };

    // "user-need", "pipeline", "note" are absent — all must return _default.
    for (const t of ["user-need", "pipeline", "note"] as const) {
      expect(resolveTypeStyle(colorMap, t)).toBe("#374151");
    }
  });

  it("_default is overridden by an explicit per-type entry", () => {
    const colorMap: TypeStyleMap<string> = {
      _default: "#374151",
      component: "#dc2626",
    };
    expect(resolveTypeStyle(colorMap, "component")).toBe("#dc2626");
  });

  it("_default works with numeric values (nodeRadii pattern)", () => {
    const radiiMap: TypeStyleMap<number> = {
      _default: 5,
      anchor: 8,
    };

    expect(resolveTypeStyle(radiiMap, "anchor")).toBe(8);
    expect(resolveTypeStyle(radiiMap, "component")).toBe(5);
    expect(resolveTypeStyle(radiiMap, "user-need")).toBe(5);
  });

  it("_default works with object values (evolveStyles pattern)", () => {
    type EvolveStyle = { stroke: string; dasharray?: string };
    const evolveMap: TypeStyleMap<EvolveStyle> = {
      _default: { stroke: "#888888" },
      natural: { stroke: "#dc2626", dasharray: "6,3" },
    };

    // "ecosystem" not in map → falls back to _default.
    expect(resolveTypeStyle(evolveMap, "ecosystem")).toEqual({ stroke: "#888888" });
    // "natural" explicitly set.
    expect(resolveTypeStyle(evolveMap, "natural")).toEqual({
      stroke: "#dc2626",
      dasharray: "6,3",
    });
  });

  it("branded custom type string falls through to _default via resolveTypeStyle", () => {
    // Simulate a plugin supplying a custom type at the render boundary.
    const pluginType: RenderableType = asRenderableType("plugin:special-node");

    const radiiMap: TypeStyleMap<number> = { _default: 5 };

    // The plugin type is not in the map → must fall back to _default=5.
    expect(resolveTypeStyle(radiiMap, pluginType)).toBe(5);
  });
});

// ── 5. mapComponentType — boundary translation function ───────────────────────

describe("mapComponentType — data-layer → render-layer boundary translation", () => {
  it("DEFAULT_RENDERABLE_TYPE_SENTINEL is '_default'", () => {
    expect(DEFAULT_RENDERABLE_TYPE_SENTINEL).toBe("_default");
  });

  it("maps every known ComponentType value 1:1 to its RenderableType counterpart", () => {
    const knownTypes = [
      "component",
      "user-need",
      "pipeline",
      "note",
      "anchor",
    ] as const;

    for (const t of knownTypes) {
      expect(mapComponentType(t)).toBe(t);
    }
  });

  it("maps known types to KnownRenderableType — isKnownRenderableType returns true", () => {
    expect(isKnownRenderableType(mapComponentType("component"))).toBe(true);
    expect(isKnownRenderableType(mapComponentType("user-need"))).toBe(true);
    expect(isKnownRenderableType(mapComponentType("pipeline"))).toBe(true);
    expect(isKnownRenderableType(mapComponentType("note"))).toBe(true);
    expect(isKnownRenderableType(mapComponentType("anchor"))).toBe(true);
  });

  it("maps an unknown type string to '_default' sentinel", () => {
    expect(mapComponentType("widget")).toBe("_default");
    expect(mapComponentType("future-type")).toBe("_default");
    expect(mapComponentType("custom-plugin-type")).toBe("_default");
  });

  it("maps an empty string to '_default' sentinel (graceful fallback)", () => {
    expect(mapComponentType("")).toBe("_default");
  });

  it("is case-sensitive — 'COMPONENT' is not 'component' and maps to '_default'", () => {
    expect(mapComponentType("COMPONENT")).toBe("_default");
    expect(mapComponentType("User-Need")).toBe("_default");
    expect(mapComponentType("Pipeline")).toBe("_default");
  });

  it("passes '_default' through unchanged (sentinel is idempotent)", () => {
    expect(mapComponentType("_default")).toBe("_default");
  });

  it("returns a RenderableType value for both known and unknown inputs", () => {
    // isRenderableType accepts any non-empty string, including '_default'.
    expect(isRenderableType(mapComponentType("component"))).toBe(true);
    expect(isRenderableType(mapComponentType("unknown-type"))).toBe(true);
  });

  it("unknown type falling back to '_default' allows TypeStyleMap lookup to use _default entry", () => {
    // When mapComponentType returns '_default', a TypeStyleMap lookup for that key
    // finds the _default entry directly (no secondary fallback needed).
    const colorMap: TypeStyleMap<string> = {
      _default: "#374151",
      component: "#dc2626",
    };

    const sentinel = mapComponentType("unknown-future-type"); // → "_default"
    // Looking up the sentinel in the map returns the _default entry.
    expect(resolveTypeStyle(colorMap, sentinel)).toBe("#374151");
  });

  it("known type preserves TypeStyleMap per-type override resolution", () => {
    const colorMap: TypeStyleMap<string> = {
      _default: "#374151",
      component: "#dc2626",
    };

    const renderableType = mapComponentType("component"); // → "component"
    expect(resolveTypeStyle(colorMap, renderableType)).toBe("#dc2626");
  });

  it("all KNOWN_RENDERABLE_TYPES are handled — mapComponentType covers the full vocabulary", () => {
    // Every item in KNOWN_RENDERABLE_TYPES should survive the round-trip.
    for (const t of KNOWN_RENDERABLE_TYPES) {
      expect(mapComponentType(t)).toBe(t);
      expect(isKnownRenderableType(mapComponentType(t))).toBe(true);
    }
  });
});
