/**
 * render-config-v2.test.ts — UPDATED
 *
 * The v2 render config concepts have been superseded.
 * All render config tests now live in schema-render-config.test.ts.
 * This file is kept as a placeholder to prevent vitest from failing
 * on a missing test file.
 *
 * New schema exports to use from schema.ts:
 *   - ThemeEnum, BackgroundSchema, EvolutionXAxisSchema, ValueChainYAxisSchema
 *   - EvolutionPhasesSchema, RenderConfigSchema
 *
 * @see src/schema-render-config.test.ts for all render config tests
 * @see src/schema.ts for the RenderConfigSchema definition
 */

import { describe, it, expect } from "vitest";
import {
  RenderConfigSchema,
  ThemeEnum,
  BackgroundSchema,
  EvolutionXAxisSchema,
  ValueChainYAxisSchema,
  EvolutionPhasesSchema,
} from "./schema.js";
import {
  TypographyConfigSchema,
  DEFAULT_TYPOGRAPHY_CONFIG,
  RenderConfigV2BaseSchema,
  RenderConfigV2Schema,
} from "./render-config-v2.js";

// ── Unified visibility filtering (Sub-AC 10a) ─────────────────────────────────
//
// The canonical mechanism for controlling rendered output is `filters`:
//   - `filters.layers`               — visual layer toggles (post-render)
//   - `filters.excludeComponentTypes` — data filter (pre-render)
//
// The old top-level `layerToggles` field is accepted via the RenderConfigV2Schema
// backward-compat shim and redirected to `filters.layers`. Explicit `filters.layers`
// always wins over a top-level `layerToggles` key.

describe("RenderConfigV2BaseSchema — unified filters (filters.layers + filters.excludeComponentTypes)", () => {
  it("accepts filters.layers and filters.excludeComponentTypes together", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      filters: {
        layers: { title: false, nodes: true, evolvesTo: true, labels: true },
        excludeComponentTypes: ["note", "anchor"],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.layers?.title).toBe(false);
      expect(result.data.filters?.excludeComponentTypes).toEqual(["note", "anchor"]);
    }
  });

  it("accepts filters.excludeComponentTypes alone (without filters.layers)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      filters: { excludeComponentTypes: ["pipeline"] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.excludeComponentTypes).toEqual(["pipeline"]);
      expect(result.data.filters?.layers).toBeUndefined();
    }
  });

  it("accepts filters.layers alone (without filters.excludeComponentTypes)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      filters: { layers: { edges: false } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.layers?.edges).toBe(false);
      expect(result.data.filters?.excludeComponentTypes).toBeUndefined();
    }
  });

  it("rejects invalid excludeComponentTypes values in filters", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      filters: { excludeComponentTypes: ["not-a-real-type"] },
    });
    expect(result.success).toBe(false);
  });

  it("does NOT have a top-level layerToggles field (removed — use filters.layers)", () => {
    // RenderConfigV2BaseSchema has no layerToggles — it was removed in favor of filters.layers
    const result = RenderConfigV2BaseSchema.safeParse({
      // layerToggles at top-level is unknown and should be stripped by Zod (strip mode)
      layerToggles: { title: false },
    });
    // Zod strips unknown keys (strip mode) — parse succeeds but layerToggles is not in output
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).layerToggles).toBeUndefined();
      expect(result.data.filters).toBeUndefined(); // not lifted here — RenderConfigV2BaseSchema has no shim
    }
  });
});

describe("RenderConfigV2Schema — backward-compat layerToggles → filters.layers shim", () => {
  it("redirects top-level layerToggles to filters.layers", () => {
    const result = RenderConfigV2Schema.safeParse({
      layerToggles: { title: false, nodes: true, evolvesTo: true, labels: true, edges: false },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // layerToggles is lifted to filters.layers by the preprocess shim
      expect(result.data.filters?.layers?.title).toBe(false);
      expect(result.data.filters?.layers?.edges).toBe(false);
      // No top-level layerToggles field remains
      expect((result.data as any).layerToggles).toBeUndefined();
    }
  });

  it("explicit filters.layers wins over top-level layerToggles shim", () => {
    const result = RenderConfigV2Schema.safeParse({
      // layerToggles says title: false — but explicit filters.layers says edges: false
      layerToggles: { title: false },
      filters: { layers: { edges: false } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Explicit filters.layers wins — only edges:false, title:false is lost
      expect(result.data.filters?.layers?.edges).toBe(false);
      expect(result.data.filters?.layers?.title).toBeUndefined(); // not in explicit layers
      expect((result.data as any).layerToggles).toBeUndefined();
    }
  });

  it("layerToggles shim respects LayerTogglesSchema dependency constraints", () => {
    // nodes=false without also setting evolvesTo=false and labels=false should fail
    const result = RenderConfigV2Schema.safeParse({
      layerToggles: { nodes: false },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      // Errors should appear in filters.layers.evolvesTo and filters.layers.labels
      expect(paths.some((p) => p.includes("evolvesTo"))).toBe(true);
      expect(paths.some((p) => p.includes("labels"))).toBe(true);
    }
  });

  it("layerToggles shim combined with filters.excludeComponentTypes (mixed unified filter)", () => {
    // Old-style layerToggles + new-style excludeComponentTypes coexist
    const result = RenderConfigV2Schema.safeParse({
      layerToggles: { title: false, pipelines: false },
      filters: { excludeComponentTypes: ["anchor"] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Shim merges layerToggles into filters.layers alongside excludeComponentTypes
      expect(result.data.filters?.layers?.title).toBe(false);
      expect(result.data.filters?.layers?.pipelines).toBe(false);
      expect(result.data.filters?.excludeComponentTypes).toEqual(["anchor"]);
    }
  });

  it("empty layerToggles shim produces empty filters.layers", () => {
    const result = RenderConfigV2Schema.safeParse({
      layerToggles: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.layers).toBeDefined();
      // All toggles are undefined (default = visible)
      expect(result.data.filters?.layers?.title).toBeUndefined();
    }
  });

  it("no layerToggles and no filters → filters undefined", () => {
    const result = RenderConfigV2Schema.safeParse({ theme: "dark" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters).toBeUndefined();
    }
  });
});

describe("RenderConfigSchema (new nested structure — migrated from v2)", () => {
  it("parses an empty object with strokeWidth default", () => {
    const result = RenderConfigSchema.parse({});
    expect(result.strokeWidth).toBe(1);
    expect(result.theme).toBeUndefined();
    expect(result.background).toBeUndefined();
    expect(result.fontFamily).toBeUndefined();
  });

  it("parses a config with theme", () => {
    const result = RenderConfigSchema.parse({ theme: "dark" });
    expect(result.theme).toBe("dark");
    expect(result.strokeWidth).toBe(1);
  });

  it("rejects unknown theme values", () => {
    expect(() => RenderConfigSchema.parse({ theme: "neon" })).toThrow();
  });

  it("rejects invalid strokeWidth below minimum", () => {
    expect(() => RenderConfigSchema.parse({ strokeWidth: 0.1 })).toThrow();
  });

  it("rejects invalid strokeWidth above maximum", () => {
    expect(() => RenderConfigSchema.parse({ strokeWidth: 10 })).toThrow();
  });

  it("accepts strokeWidth boundary values", () => {
    expect(RenderConfigSchema.parse({ strokeWidth: 0.25 }).strokeWidth).toBe(0.25);
    expect(RenderConfigSchema.parse({ strokeWidth: 8 }).strokeWidth).toBe(8);
  });
});

describe("ThemeEnum", () => {
  it("accepts valid themes", () => {
    expect(ThemeEnum.parse("default")).toBe("default");
    expect(ThemeEnum.parse("dark")).toBe("dark");
    expect(ThemeEnum.parse("highContrast")).toBe("highContrast");
  });

  it("rejects invalid themes", () => {
    expect(() => ThemeEnum.parse("light")).toThrow();
    expect(() => ThemeEnum.parse("neon")).toThrow();
  });
});

describe("BackgroundSchema", () => {
  it("accepts an empty background object", () => {
    const result = BackgroundSchema.parse({});
    expect(result.color).toBeUndefined();
    expect(result.evolutionXAxis).toBeUndefined();
    expect(result.valueChainYAxis).toBeUndefined();
    expect(result.evolutionPhases).toBeUndefined();
  });

  it("accepts valid hex color", () => {
    const result = BackgroundSchema.parse({ color: "#ff00aa" });
    expect(result.color).toBe("#ff00aa");
  });

  it("rejects invalid hex colors", () => {
    expect(() => BackgroundSchema.parse({ color: "red" })).toThrow();
    expect(() => BackgroundSchema.parse({ color: "#fff" })).not.toThrow(); // 3-digit valid
    expect(() => BackgroundSchema.parse({ color: "#gggggg" })).toThrow();
  });

  it("accepts nested axis toggles", () => {
    const result = BackgroundSchema.parse({
      evolutionXAxis: { show: false },
      valueChainYAxis: { show: true },
      evolutionPhases: { showPhaseDividerAndLabel: false },
    });
    expect(result.evolutionXAxis?.show).toBe(false);
    expect(result.valueChainYAxis?.show).toBe(true);
    expect(result.evolutionPhases?.showPhaseDividerAndLabel).toBe(false);
  });
});

describe("EvolutionXAxisSchema", () => {
  it("accepts show: true", () => {
    expect(EvolutionXAxisSchema.parse({ show: true }).show).toBe(true);
  });

  it("accepts show: false", () => {
    expect(EvolutionXAxisSchema.parse({ show: false }).show).toBe(false);
  });

  it("accepts empty object (show optional)", () => {
    expect(EvolutionXAxisSchema.parse({}).show).toBeUndefined();
  });
});

describe("ValueChainYAxisSchema", () => {
  it("accepts show: true/false/undefined", () => {
    expect(ValueChainYAxisSchema.parse({ show: true }).show).toBe(true);
    expect(ValueChainYAxisSchema.parse({ show: false }).show).toBe(false);
    expect(ValueChainYAxisSchema.parse({}).show).toBeUndefined();
  });
});

describe("EvolutionPhasesSchema (showPhaseDividerAndLabel)", () => {
  it("accepts showPhaseDividerAndLabel: true", () => {
    const result = EvolutionPhasesSchema.parse({ showPhaseDividerAndLabel: true });
    expect(result.showPhaseDividerAndLabel).toBe(true);
  });

  it("accepts showPhaseDividerAndLabel: false", () => {
    const result = EvolutionPhasesSchema.parse({ showPhaseDividerAndLabel: false });
    expect(result.showPhaseDividerAndLabel).toBe(false);
  });

  it("defaults showPhaseDividerAndLabel to true when not specified", () => {
    const result = EvolutionPhasesSchema.parse({});
    expect(result.showPhaseDividerAndLabel).toBe(true);
  });
});

// ── TypographyConfigSchema ────────────────────────────────────────────────────

describe("TypographyConfigSchema", () => {
  it("parses an empty object with all defaults applied", () => {
    const result = TypographyConfigSchema.parse({});
    expect(result.fontFamily).toBe("Inter, sans-serif");
    expect(result.labelScale).toBe(1.0);
  });

  it("parses a custom fontFamily", () => {
    const result = TypographyConfigSchema.parse({ fontFamily: "Georgia, serif" });
    expect(result.fontFamily).toBe("Georgia, serif");
    expect(result.labelScale).toBe(1.0); // default unchanged
  });

  it("parses a custom labelScale", () => {
    const result = TypographyConfigSchema.parse({ labelScale: 1.5 });
    expect(result.fontFamily).toBe("Inter, sans-serif"); // default unchanged
    expect(result.labelScale).toBe(1.5);
  });

  it("parses both fields together", () => {
    const result = TypographyConfigSchema.parse({
      fontFamily: "Arial, sans-serif",
      labelScale: 0.8,
    });
    expect(result.fontFamily).toBe("Arial, sans-serif");
    expect(result.labelScale).toBe(0.8);
  });

  it("rejects labelScale = 0 (must be positive)", () => {
    expect(() => TypographyConfigSchema.parse({ labelScale: 0 })).toThrow();
  });

  it("rejects labelScale below 0 (must be positive)", () => {
    expect(() => TypographyConfigSchema.parse({ labelScale: -1 })).toThrow();
  });

  it("rejects labelScale above 5 (max boundary)", () => {
    expect(() => TypographyConfigSchema.parse({ labelScale: 5.1 })).toThrow();
  });

  it("accepts labelScale at boundary values", () => {
    // labelScale is positive() — very small positive values are valid
    expect(TypographyConfigSchema.parse({ labelScale: 0.01 }).labelScale).toBe(0.01);
    // labelScale max is 5
    expect(TypographyConfigSchema.parse({ labelScale: 5 }).labelScale).toBe(5);
  });

  it("accepts any non-empty string as fontFamily", () => {
    const fonts = [
      "monospace",
      "Roboto, sans-serif",
      "'Times New Roman', Times, serif",
    ];
    for (const fontFamily of fonts) {
      expect(TypographyConfigSchema.parse({ fontFamily }).fontFamily).toBe(fontFamily);
    }
  });
});

describe("DEFAULT_TYPOGRAPHY_CONFIG", () => {
  it("matches TypographyConfigSchema defaults exactly", () => {
    expect(DEFAULT_TYPOGRAPHY_CONFIG.fontFamily).toBe("Inter, sans-serif");
    expect(DEFAULT_TYPOGRAPHY_CONFIG.labelScale).toBe(1.0);
  });

  it("is a valid TypographyConfig (passes schema parse)", () => {
    const result = TypographyConfigSchema.safeParse(DEFAULT_TYPOGRAPHY_CONFIG);
    expect(result.success).toBe(true);
  });
});

// ── RenderConfigV2BaseSchema — legend {x,y} canvas bounds validation ──────────
//
// legend.position can be either:
//   - a named enum string ("top-left" | "top-right" | "bottom-left" | "bottom-right" | "auto")
//   - an explicit {x, y} coordinate object (px-space, canvas coordinate space)
//
// When the {x, y} form is used, the coordinates must lie within the canvas bounds:
//   0 ≤ x ≤ spatial.width  (default 1600 px)
//   0 ≤ y ≤ spatial.height (default 800 px)
//
// Canvas dimensions are read from data.spatial.width/height (with 1600/800 defaults).

describe("RenderConfigV2BaseSchema — legend {x,y} canvas bounds validation", () => {
  // ── Named position strings — no bounds check triggered ───────────────────

  it("accepts named legend position 'top-left' (no bounds check)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: "top-left" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts named legend position 'bottom-right' (no bounds check)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: "bottom-right" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts named legend position 'auto' (no bounds check)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: "auto" },
    });
    expect(result.success).toBe(true);
  });

  // ── In-bounds {x, y} positions — valid ───────────────────────────────────

  it("accepts in-bounds {x, y} position within default canvas (1600×800)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: { x: 100, y: 600 } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend?.position).toEqual({ x: 100, y: 600 });
    }
  });

  it("accepts midpoint {x, y} within default canvas", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: { x: 800, y: 400 } },
    });
    expect(result.success).toBe(true);
  });

  // ── Edge cases — exactly at bounds (0 and max) ────────────────────────────

  it("accepts edge case {x:0, y:0} — origin corner of canvas", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: { x: 0, y: 0 } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend?.position).toEqual({ x: 0, y: 0 });
    }
  });

  it("accepts edge case {x:1600, y:800} — exact canvas dimensions (default 1600×800)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: { x: 1600, y: 800 } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend?.position).toEqual({ x: 1600, y: 800 });
    }
  });

  it("accepts edge case {x:0, y:800} — bottom-left corner", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: { x: 0, y: 800 } },
    });
    expect(result.success).toBe(true);
  });

  it("accepts edge case {x:1600, y:0} — top-right corner", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: { x: 1600, y: 0 } },
    });
    expect(result.success).toBe(true);
  });

  // ── Out-of-bounds — x violations ─────────────────────────────────────────

  it("rejects x < 0 (below lower bound)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: { x: -1, y: 100 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.message.includes("legend.position.x"))).toBe(true);
    }
  });

  it("rejects x > 1600 (above default canvas width)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: { x: 1601, y: 100 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.message.includes("legend.position.x"))).toBe(true);
    }
  });

  // ── Out-of-bounds — y violations ─────────────────────────────────────────

  it("rejects y < 0 (below lower bound)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: { x: 100, y: -1 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.message.includes("legend.position.y"))).toBe(true);
    }
  });

  it("rejects y > 800 (above default canvas height)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: { x: 100, y: 801 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.message.includes("legend.position.y"))).toBe(true);
    }
  });

  it("rejects both x and y out-of-bounds (both errors reported)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { position: { x: -5, y: 900 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.message.includes("legend.position.x"))).toBe(true);
      expect(issues.some((i) => i.message.includes("legend.position.y"))).toBe(true);
    }
  });

  // ── Custom canvas dimensions via spatial sub-object ───────────────────────

  it("accepts {x, y} in-bounds for custom canvas size (800×400)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      spatial: { width: 800, height: 400 },
      legend: { position: { x: 500, y: 300 } },
    });
    expect(result.success).toBe(true);
  });

  it("accepts {x, y} at exact custom canvas boundary (spatial.width/height)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      spatial: { width: 800, height: 400 },
      legend: { position: { x: 800, y: 400 } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects x exceeding custom canvas width (spatial.width=800)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      spatial: { width: 800, height: 400 },
      legend: { position: { x: 801, y: 200 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.message.includes("legend.position.x"))).toBe(true);
      // Error message should reference the custom canvas width
      expect(issues.some((i) => i.message.includes("800"))).toBe(true);
    }
  });

  it("rejects y exceeding custom canvas height (spatial.height=400)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      spatial: { width: 800, height: 400 },
      legend: { position: { x: 100, y: 401 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.message.includes("legend.position.y"))).toBe(true);
      expect(issues.some((i) => i.message.includes("400"))).toBe(true);
    }
  });

  // ── Absence of legend — no validation triggered ───────────────────────────

  it("accepts config with no legend field (no bounds check triggered)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts legend without position (defaults to 'bottom-right', no bounds check)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({ legend: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend?.position).toBe("bottom-right");
    }
  });
});

// ── LegendSchema — legendOverflow field ──────────────────────────────────────
//
// legendOverflow controls what happens when the legend bounding box extends
// beyond the canvas boundary. It is only meaningful for explicit {x, y} positions.

describe("RenderConfigV2BaseSchema — legendOverflow field", () => {
  it("legendOverflow defaults to 'allow' when not specified", () => {
    const result = RenderConfigV2BaseSchema.safeParse({ legend: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend?.legendOverflow).toBe("allow");
    }
  });

  it("accepts legendOverflow: 'clip'", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { legendOverflow: "clip" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend?.legendOverflow).toBe("clip");
    }
  });

  it("accepts legendOverflow: 'warn'", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { legendOverflow: "warn" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend?.legendOverflow).toBe("warn");
    }
  });

  it("accepts legendOverflow: 'allow' (explicit)", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { legendOverflow: "allow" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legend?.legendOverflow).toBe("allow");
    }
  });

  it("rejects legendOverflow with invalid value", () => {
    const result = RenderConfigV2BaseSchema.safeParse({
      legend: { legendOverflow: "hidden" },
    });
    expect(result.success).toBe(false);
  });
});

// ── RenderConfigV2Schema — legend bounds also enforced via preprocess path ────

describe("RenderConfigV2Schema — legend {x,y} bounds via backward-compat preprocess", () => {
  it("accepts in-bounds {x, y} via RenderConfigV2Schema (flat v1 spatial keys)", () => {
    const result = RenderConfigV2Schema.safeParse({
      width: 800,
      height: 400,
      legend: { position: { x: 400, y: 200 } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects out-of-bounds x via RenderConfigV2Schema (flat v1 spatial keys lifted to spatial sub-object)", () => {
    const result = RenderConfigV2Schema.safeParse({
      width: 800,
      height: 400,
      legend: { position: { x: 801, y: 200 } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.message.includes("legend.position.x"))).toBe(true);
    }
  });
});
