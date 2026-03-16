import { describe, it, expect } from "vitest";
import {
  RenderConfigSchema,
  WardleyMapSchema,
} from "./schema";

// ── Helpers ──────────────────────────────────────────────────

/** Minimal valid map payload (no renderConfig) */
const baseMap = {
  title: "Test Map",
  components: [
    {
      id: "user",
      label: "User",
      type: "user-need" as const,
      evolution: 0.9,
      visibility: 0.95,
    },
  ],
  relations: [],
};

// ── RenderConfigSchema unit tests ────────────────────────────

describe("RenderConfigSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    const result = RenderConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      // All fields should be undefined
      expect(result.data.width).toBeUndefined();
      expect(result.data.height).toBeUndefined();
      expect(result.data.backgroundColor).toBeUndefined();
      expect(result.data.showAxes).toBeUndefined();
      expect(result.data.fontFamily).toBeUndefined();
      expect(result.data.labelScale).toBeUndefined();
      expect(result.data.nodeRadius).toBeUndefined();
      expect(result.data.avoidCollisions).toBeUndefined();
      expect(result.data.excludeTypes).toBeUndefined();
      expect(result.data.typeColors).toBeUndefined();
      expect(result.data.evolveStyles).toBeUndefined();
    }
  });

  it("accepts a fully-specified config", () => {
    const full = {
      width: 1920,
      height: 1080,
      backgroundColor: "#f0f0f0",
      showAxes: false,
      showValueChain: true,
      showPhaseLabels: false,
      fontFamily: "Roboto, sans-serif",
      labelScale: 1.5,
      nodeRadius: 8,
      avoidCollisions: false,
      excludeTypes: ["note"],
      typeColors: { component: "#ff0000" },
      evolveStyles: { natural: { stroke: "#00ff00", strokeDasharray: "4 2" } },
    };
    const result = RenderConfigSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBe(1920);
      expect(result.data.height).toBe(1080);
      expect(result.data.backgroundColor).toBe("#f0f0f0");
      expect(result.data.showAxes).toBe(false);
      expect(result.data.labelScale).toBe(1.5);
      expect(result.data.excludeTypes).toEqual(["note"]);
    }
  });

  // ── Partial overrides ──────────────────────────────────────

  it("accepts partial config with only width", () => {
    const result = RenderConfigSchema.safeParse({ width: 800 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.width).toBe(800);
      expect(result.data.height).toBeUndefined();
    }
  });

  it("accepts partial config with only boolean flags", () => {
    const result = RenderConfigSchema.safeParse({
      showAxes: true,
      avoidCollisions: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.showAxes).toBe(true);
      expect(result.data.avoidCollisions).toBe(false);
    }
  });

  it("accepts partial config with only evolveStyles", () => {
    const result = RenderConfigSchema.safeParse({
      evolveStyles: {
        forced: { stroke: "#ff0000" },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evolveStyles).toEqual({
        forced: { stroke: "#ff0000" },
      });
    }
  });

  it("accepts multiple excludeTypes", () => {
    const result = RenderConfigSchema.safeParse({
      excludeTypes: ["note", "anchor"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.excludeTypes).toEqual(["note", "anchor"]);
    }
  });

  // ── Invalid inputs ─────────────────────────────────────────

  it("rejects negative width", () => {
    const result = RenderConfigSchema.safeParse({ width: -100 });
    expect(result.success).toBe(false);
  });

  it("rejects zero height", () => {
    const result = RenderConfigSchema.safeParse({ height: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid hex color", () => {
    expect(
      RenderConfigSchema.safeParse({ backgroundColor: "red" }).success
    ).toBe(false);
    expect(
      RenderConfigSchema.safeParse({ backgroundColor: "#xyz" }).success
    ).toBe(false);
    expect(
      RenderConfigSchema.safeParse({ backgroundColor: "123456" }).success
    ).toBe(false);
  });

  it("accepts valid hex colors (3, 6, 8 digit)", () => {
    expect(
      RenderConfigSchema.safeParse({ backgroundColor: "#fff" }).success
    ).toBe(true);
    expect(
      RenderConfigSchema.safeParse({ backgroundColor: "#ff00aa" }).success
    ).toBe(true);
    expect(
      RenderConfigSchema.safeParse({ backgroundColor: "#ff00aa80" }).success
    ).toBe(true);
  });

  it("rejects labelScale above 5", () => {
    const result = RenderConfigSchema.safeParse({ labelScale: 6 });
    expect(result.success).toBe(false);
  });

  it("rejects labelScale of 0 (not positive)", () => {
    const result = RenderConfigSchema.safeParse({ labelScale: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative labelScale", () => {
    const result = RenderConfigSchema.safeParse({ labelScale: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects nodeRadius above 50", () => {
    const result = RenderConfigSchema.safeParse({ nodeRadius: 51 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid excludeTypes values", () => {
    const result = RenderConfigSchema.safeParse({
      excludeTypes: ["invalid-type"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid evolveStyles keys", () => {
    const result = RenderConfigSchema.safeParse({
      evolveStyles: { unknown: { stroke: "#000" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(RenderConfigSchema.safeParse("string").success).toBe(false);
    expect(RenderConfigSchema.safeParse(42).success).toBe(false);
    expect(RenderConfigSchema.safeParse(null).success).toBe(false);
  });
});

// ── WardleyMapSchema with renderConfig ────────────────────────

describe("WardleyMapSchema with renderConfig", () => {
  it("parses a map without renderConfig (optional, defaults to undefined)", () => {
    const result = WardleyMapSchema.safeParse(baseMap);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.renderConfig).toBeUndefined();
    }
  });

  it("parses a map with empty renderConfig", () => {
    const result = WardleyMapSchema.safeParse({
      ...baseMap,
      renderConfig: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.renderConfig).toBeDefined();
      expect(result.data.renderConfig!.width).toBeUndefined();
    }
  });

  it("parses a map with partial renderConfig (only width override)", () => {
    const result = WardleyMapSchema.safeParse({
      ...baseMap,
      renderConfig: { width: 1920 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.renderConfig!.width).toBe(1920);
      expect(result.data.renderConfig!.height).toBeUndefined();
      expect(result.data.renderConfig!.backgroundColor).toBeUndefined();
    }
  });

  it("parses a map with full renderConfig", () => {
    const result = WardleyMapSchema.safeParse({
      ...baseMap,
      renderConfig: {
        width: 1920,
        height: 1080,
        backgroundColor: "#000000",
        showAxes: false,
        showValueChain: false,
        showPhaseLabels: true,
        fontFamily: "Monospace",
        labelScale: 2,
        nodeRadius: 10,
        avoidCollisions: true,
        excludeTypes: ["note"],
        typeColors: { "user-need": "#ff0000" },
        evolveStyles: {
          natural: { stroke: "#00ff00" },
          ecosystem: { strokeDasharray: "5 5" },
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const rc = result.data.renderConfig!;
      expect(rc.width).toBe(1920);
      expect(rc.showAxes).toBe(false);
      expect(rc.excludeTypes).toEqual(["note"]);
      expect(rc.typeColors).toEqual({ "user-need": "#ff0000" });
      expect(rc.evolveStyles?.natural?.stroke).toBe("#00ff00");
    }
  });

  it("rejects a map with invalid renderConfig", () => {
    const result = WardleyMapSchema.safeParse({
      ...baseMap,
      renderConfig: { width: -1 },
    });
    expect(result.success).toBe(false);
  });

  it("preserves other map fields when renderConfig is present", () => {
    const result = WardleyMapSchema.safeParse({
      ...baseMap,
      context: "Test context",
      renderConfig: { backgroundColor: "#aabbcc" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Test Map");
      expect(result.data.context).toBe("Test context");
      expect(result.data.components).toHaveLength(1);
      expect(result.data.renderConfig!.backgroundColor).toBe("#aabbcc");
      // Defaults still applied
      expect(result.data.gridSize).toEqual({ width: 1600, height: 800 });
      expect(result.data.axes.valueChain).toBe(true);
    }
  });
});
