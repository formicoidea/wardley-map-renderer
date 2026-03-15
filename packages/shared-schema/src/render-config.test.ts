import { describe, it, expect } from "vitest";
import {
  RenderConfigSchema,
  ThemeEnum,
  PaletteSchema,
  FontSchema,
  LayerTogglesSchema,
  DEFAULT_RENDER_CONFIG,
  DEFAULT_PALETTE,
  DEFAULT_FONT,
  DEFAULT_LAYER_TOGGLES,
} from "./render-config.js";

describe("RenderConfigSchema", () => {
  it("parses an empty object with defaults", () => {
    const result = RenderConfigSchema.parse({});
    expect(result.theme).toBe("default");
    expect(result.strokeWidth).toBe(1);
    expect(result.palette).toBeUndefined();
    expect(result.font).toBeUndefined();
    expect(result.layerToggles).toBeUndefined();
  });

  it("parses a fully specified config", () => {
    const input = {
      theme: "dark",
      palette: {
        background: "#1a1a1a",
        nodeFill: "#ffffff",
        nodeStroke: "#cccccc",
        edgeStroke: "#666666",
        labelColor: "#eeeeee",
        axisColor: "#444444",
        pipelineFill: "#333333",
        evolveStroke: "#ff4444",
      },
      font: {
        family: "Fira Code, monospace",
        sizePx: 14,
        titleSizePx: 24,
        axisSizePx: 11,
      },
      strokeWidth: 2,
      layerToggles: {
        title: true,
        axes: true,
        pipelines: true,
        edges: true,
        evolvesTo: false,
        nodes: true,
        labels: true,
        notes: false,
        legend: false,
      },
    };
    const result = RenderConfigSchema.parse(input);
    expect(result.theme).toBe("dark");
    expect(result.strokeWidth).toBe(2);
    expect(result.palette?.background).toBe("#1a1a1a");
    expect(result.font?.family).toBe("Fira Code, monospace");
    expect(result.layerToggles?.evolvesTo).toBe(false);
    expect(result.layerToggles?.notes).toBe(false);
  });

  it("rejects unknown theme values", () => {
    expect(() => RenderConfigSchema.parse({ theme: "neon" })).toThrow();
  });

  it("rejects invalid hex colors in palette", () => {
    expect(() =>
      PaletteSchema.parse({ background: "red" })
    ).toThrow();
    expect(() =>
      PaletteSchema.parse({ background: "#fff" })
    ).toThrow();
    expect(() =>
      PaletteSchema.parse({ background: "#gggggg" })
    ).toThrow();
  });

  it("accepts valid hex colors in palette", () => {
    const result = PaletteSchema.parse({ background: "#ff00aa" });
    expect(result.background).toBe("#ff00aa");
  });

  it("rejects extra fields on palette (strict)", () => {
    expect(() =>
      PaletteSchema.parse({ background: "#ffffff", unknownField: "#000000" })
    ).toThrow();
  });

  it("rejects extra fields on renderConfig (strict)", () => {
    expect(() =>
      RenderConfigSchema.parse({ theme: "default", unknownOption: true })
    ).toThrow();
  });
});

describe("ThemeEnum", () => {
  it("accepts valid themes", () => {
    expect(ThemeEnum.parse("default")).toBe("default");
    expect(ThemeEnum.parse("dark")).toBe("dark");
    expect(ThemeEnum.parse("highContrast")).toBe("highContrast");
  });
});

describe("FontSchema", () => {
  it("rejects out-of-range sizePx", () => {
    expect(() => FontSchema.parse({ sizePx: 2 })).toThrow();
    expect(() => FontSchema.parse({ sizePx: 100 })).toThrow();
  });

  it("accepts valid font config", () => {
    const result = FontSchema.parse({ family: "Arial", sizePx: 16 });
    expect(result.family).toBe("Arial");
    expect(result.sizePx).toBe(16);
  });

  it("rejects empty family string", () => {
    expect(() => FontSchema.parse({ family: "" })).toThrow();
  });
});

describe("LayerTogglesSchema", () => {
  it("accepts partial toggles", () => {
    const result = LayerTogglesSchema.parse({ nodes: false });
    expect(result.nodes).toBe(false);
    expect(result.edges).toBeUndefined(); // not set, undefined
  });

  it("rejects unknown layer names (strict)", () => {
    expect(() =>
      LayerTogglesSchema.parse({ zones: true })
    ).toThrow();
  });
});

describe("strokeWidth", () => {
  it("rejects values below minimum", () => {
    expect(() => RenderConfigSchema.parse({ strokeWidth: 0.1 })).toThrow();
  });

  it("rejects values above maximum", () => {
    expect(() => RenderConfigSchema.parse({ strokeWidth: 10 })).toThrow();
  });

  it("accepts boundary values", () => {
    expect(RenderConfigSchema.parse({ strokeWidth: 0.25 }).strokeWidth).toBe(0.25);
    expect(RenderConfigSchema.parse({ strokeWidth: 8 }).strokeWidth).toBe(8);
  });
});

describe("defaults", () => {
  it("DEFAULT_RENDER_CONFIG has correct shape", () => {
    expect(DEFAULT_RENDER_CONFIG.theme).toBe("default");
    expect(DEFAULT_RENDER_CONFIG.strokeWidth).toBe(1);
  });

  it("DEFAULT_PALETTE has all required keys", () => {
    expect(DEFAULT_PALETTE.background).toBe("#ffffff");
    expect(DEFAULT_PALETTE.nodeFill).toBe("#000000");
    expect(DEFAULT_PALETTE.edgeStroke).toBe("#000000");
    expect(DEFAULT_PALETTE.pipelineFill).toBe("#e8e8e8");
    expect(DEFAULT_PALETTE.evolveStroke).toBe("#cc0000");
  });

  it("DEFAULT_FONT has all required keys", () => {
    expect(DEFAULT_FONT.family).toBe("Inter, sans-serif");
    expect(DEFAULT_FONT.sizePx).toBe(12);
    expect(DEFAULT_FONT.titleSizePx).toBe(18);
    expect(DEFAULT_FONT.axisSizePx).toBe(10);
  });

  it("DEFAULT_LAYER_TOGGLES has all layers enabled", () => {
    for (const value of Object.values(DEFAULT_LAYER_TOGGLES)) {
      expect(value).toBe(true);
    }
  });
});
